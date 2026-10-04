import type {
  AuditEntry,
  Claim,
  ClaimFact,
  LegacyClaim,
  LegacySourceRecord,
  SharedSource,
  SourceLink,
  SourceRole,
  SourceVersion,
  VersionRecord
} from '../types'

export interface MigratedData {
  claims: Claim[]
  sources: SharedSource[]
  versions: VersionRecord[]
  audit: AuditEntry[]
}

/**
 * 旧数据迁移：把事实内嵌的来源记录迁移到共享来源库。
 * - 同一来源（按内容哈希或地址去重）只建一份共享记录，可支持多项事实；
 * - 内嵌记录带有版本号但历史版本未留档的，补录占位版本并标记未确认；
 * - 缺少内容哈希或地址、无法确认依赖的事实，结论先置为「待核」。
 */
export function migrateLegacyData(
  legacyClaims: LegacyClaim[],
  legacyVersions: VersionRecord[],
  legacyAudit: AuditEntry[]
): MigratedData {
  const sources: SharedSource[] = []
  const byKey = new Map<string, SharedSource>()
  const audit: AuditEntry[] = [...legacyAudit]
  let seq = 1
  const now = () => new Date().toISOString()
  const migrateAudit = (claimId: string, action: string, detail: string) => {
    audit.unshift({ id: `AUD-MIG-${seq++}`, claimId, action, operator: '系统迁移', detail, createdAt: now() })
  }

  const shareSource = (record: LegacySourceRecord): SharedSource => {
    const key = record.contentHash || record.url || record.id
    const existing = byKey.get(key)
    if (existing) return existing
    const shared = toSharedSource(record)
    byKey.set(key, shared)
    sources.push(shared)
    return shared
  }

  const claims: Claim[] = legacyClaims.map((legacy) => {
    const facts: ClaimFact[] = legacy.facts.map((lf) => {
      const links: SourceLink[] = []
      let unconfirmed = false
      const convert = (record: LegacySourceRecord, role: SourceRole) => {
        const shared = shareSource(record)
        if (!record.contentHash || !record.url) unconfirmed = true
        links.push({
          sourceId: shared.id,
          role,
          snapshotVersion: record.version || 1,
          linkedAt: record.capturedAt || now(),
          linkedBy: '系统迁移'
        })
      }
      lf.sources.forEach((record) => convert(record, '支持'))
      lf.counterSources.forEach((record) => convert(record, '反驳'))
      const fact: ClaimFact = {
        id: lf.id,
        text: lf.text,
        conclusion: lf.conclusion,
        confidence: lf.confidence,
        reviewState: unconfirmed ? '待核' : '有效',
        invalidatedBy: [],
        unresolved: lf.unresolved,
        links,
        annotations: lf.annotations
      }
      if (unconfirmed) {
        migrateAudit(legacy.id, '事实待核', `「${lf.text}」依赖的来源缺少内容哈希或地址，迁移后无法确认，结论先待核`)
      }
      return fact
    })
    return {
      id: legacy.id,
      title: legacy.title,
      summary: legacy.summary,
      reporter: legacy.reporter,
      editor: legacy.editor,
      status: legacy.status,
      priority: legacy.priority,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
      version: legacy.version,
      facts
    }
  })

  for (const source of sources) {
    const backfilled = source.versions.filter((item) => !item.confirmed).length
    migrateAudit(
      source.id,
      '迁移内嵌来源',
      `内嵌来源「${source.versions[source.versions.length - 1]?.title ?? source.id}」迁入共享库（${source.id}，当前V${source.currentVersion}）` +
        (backfilled ? `，补录${backfilled}个未留档历史版本` : '')
    )
  }
  return { claims, sources, versions: legacyVersions, audit }
}

function toSharedSource(record: LegacySourceRecord): SharedSource {
  const current = record.version && record.version > 0 ? record.version : 1
  const versions: SourceVersion[] = []
  for (let v = 1; v <= current; v++) {
    if (v === current) {
      versions.push({
        version: v,
        title: record.title,
        url: record.url,
        publisher: record.publisher,
        publishedAt: record.publishedAt,
        capturedAt: record.capturedAt,
        kind: record.kind,
        chainOfCustody: record.chainOfCustody,
        contentHash: record.contentHash,
        changeNote: '迁移自事实内嵌来源，当前留档版本',
        recordedAt: record.capturedAt || new Date().toISOString(),
        confirmed: Boolean(record.contentHash)
      })
    } else {
      versions.push({
        version: v,
        title: record.title,
        url: record.url,
        publisher: record.publisher,
        publishedAt: record.publishedAt,
        capturedAt: '',
        kind: record.kind,
        chainOfCustody: '历史版本未留档',
        contentHash: '',
        changeNote: '迁移补录的历史版本占位，内容无法确认',
        recordedAt: record.capturedAt || new Date().toISOString(),
        confirmed: false
      })
    }
  }
  return {
    id: `SRC-${record.id}`,
    status: '有效',
    currentVersion: current,
    versions,
    createdAt: record.capturedAt || new Date().toISOString()
  }
}
