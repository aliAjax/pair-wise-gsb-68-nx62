import type { AuditEntry, Claim, ClaimFact, FactSourceLink, SharedSource, SourceRecord, SourceStance } from '../types'

/**
 * 旧数据迁移：把事实内嵌的来源记录迁入共享来源库并补登版本。
 * 迁移后无法确认依赖的事实（待证信息、缺哈希或缺地址）先标记为待核。
 */
export function migrateLegacyState(old: Record<string, unknown>): Record<string, unknown> {
  const sources: SharedSource[] = []
  const byKey = new Map<string, SharedSource>()
  let seq = 1
  const now = new Date().toISOString()

  const share = (record: SourceRecord): SharedSource => {
    const key = record.url || record.contentHash || record.title
    const existing = byKey.get(key)
    if (existing) return existing
    const version = record.version ?? 1
    const shared: SharedSource = {
      id: `SRC-M${seq++}`,
      title: record.title ?? '',
      url: record.url ?? '',
      publisher: record.publisher ?? '',
      publishedAt: record.publishedAt ?? '',
      capturedAt: record.capturedAt ?? now,
      kind: record.kind ?? '二次来源',
      chainOfCustody: record.chainOfCustody ?? '',
      contentHash: record.contentHash ?? '',
      version,
      status: '有效',
      history: [{ version, contentHash: record.contentHash ?? '', changedAt: record.capturedAt ?? now, note: '旧数据迁移补登版本' }]
    }
    byKey.set(key, shared)
    sources.push(shared)
    return shared
  }

  const claims = ((old.claims as Claim[]) ?? []).map((claim) => ({
    ...claim,
    facts: (claim.facts ?? []).map((fact) => {
      const legacy = fact as ClaimFact & { sources?: SourceRecord[]; counterSources?: SourceRecord[] }
      const refs: FactSourceLink[] = []
      let unconfirmable = false
      const move = (list: SourceRecord[] | undefined, stance: SourceStance) => {
        for (const record of list ?? []) {
          const shared = share(record)
          refs.push({ sourceId: shared.id, stance, linkedAt: record.capturedAt ?? now, linkedVersion: shared.version })
          if (shared.kind === '待证信息' || !shared.contentHash || !shared.url) unconfirmable = true
        }
      }
      move(legacy.sources, '支持')
      move(legacy.counterSources, '反驳')
      const migrated: ClaimFact = {
        id: fact.id,
        text: fact.text,
        conclusion: fact.conclusion,
        confidence: fact.confidence,
        unresolved: fact.unresolved ?? [],
        verification: unconfirmable ? '待核' : '有效',
        sourceRefs: refs,
        annotations: fact.annotations ?? []
      }
      return migrated
    })
  }))

  const pendingCount = claims.flatMap((claim) => claim.facts).filter((fact) => fact.verification === '待核').length
  const migrationAudit: AuditEntry = {
    id: `AUD-MIG-${Date.now()}`,
    claimId: '-',
    action: '旧数据迁移',
    operator: '系统',
    detail: `内嵌来源迁入共享库 ${sources.length} 条并补登版本；${pendingCount} 项事实依赖无法确认，先标记待核`,
    createdAt: now
  }

  return {
    ...old,
    claims,
    sources,
    batches: old.batches ?? [],
    conflicts: old.conflicts ?? [],
    audit: [migrationAudit, ...((old.audit as AuditEntry[]) ?? [])]
  }
}
