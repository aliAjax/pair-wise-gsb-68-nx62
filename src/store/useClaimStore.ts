import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { seedAudit, seedBatches, seedClaims, seedConflicts, seedSources, seedVersions } from '../data/seed'
import { preflightPublish } from '../services/api'
import { clearJournal, consumeCrashSimulation, readJournal, resetJournal, writeJournal, type CommitPlan } from '../services/journal'
import { migrateLegacyState } from '../services/migrate'
import type { AuditEntry, BatchConflict, Claim, ClaimAnnotation, ClaimFact, FactConclusion, FactSourceLink, PublishBatch, SharedSource, SourceStance, VersionRecord } from '../types'

interface ClaimState {
  claims: Claim[]
  sources: SharedSource[]
  batches: PublishBatch[]
  conflicts: BatchConflict[]
  versions: VersionRecord[]
  audit: AuditEntry[]
  keyword: string
  status: Claim['status'] | '全部'
  setKeyword: (value: string) => void
  setStatus: (value: Claim['status'] | '全部') => void
  addClaim: (input: { title: string; summary: string; reporter: string; priority: Claim['priority'] }) => Claim
  addFact: (claimId: string, text: string) => void
  updateFact: (claimId: string, factId: string, patch: Partial<ClaimFact>) => void
  reconfirmFact: (claimId: string, factId: string) => { ok: boolean; message: string }
  addAnnotation: (claimId: string, factId: string, annotation: Omit<ClaimAnnotation, 'id' | 'createdAt' | 'resolved'>) => void
  resolveAnnotation: (claimId: string, factId: string, annotationId: string) => void
  registerSource: (input: Omit<SharedSource, 'id' | 'capturedAt' | 'version' | 'status' | 'history'>) => SharedSource
  linkSource: (claimId: string, factId: string, sourceId: string, stance: SourceStance) => { ok: boolean; message: string }
  markSourceChanged: (sourceId: string, note: string) => { invalidated: number; cancelled: number }
  reviseSource: (sourceId: string, input: { contentHash: string; note: string }) => { invalidated: number; cancelled: number }
  retractSource: (sourceId: string, note: string) => { invalidated: number; cancelled: number }
  restoreSource: (sourceId: string, note: string) => void
  submitBatch: (claimId: string, input: { note: string; baseClaimVersion: number; submittedBy: string }) => { ok: boolean; message: string }
  publishBatch: (batchId: string, editor: string) => { ok: boolean; message: string }
  cancelBatch: (batchId: string, reason: string) => void
  transitionClaim: (claimId: string, status: Claim['status'], note: string) => { ok: boolean; message: string }
  recoverFromJournal: () => number
  reset: () => void
}

let idSeed = 100
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${idSeed++}`
const STORAGE_KEY = 'gsb68:fact-check-workbench'

type PlanObjects = CommitPlan['objects']
type Collections = Pick<ClaimState, 'claims' | 'sources' | 'batches' | 'versions' | 'audit' | 'conflicts'>

/**
 * 应用提交计划：主张/来源/批次按 id 覆盖，版本/审计/冲突只补缺失。
 * 同一计划重复执行结果相同，恢复时不会重复追加版本和审计。
 */
function applyPlan(state: Collections, objects: PlanObjects): Partial<Collections> {
  const upsert = <T extends { id: string }>(current: T[], planned: T[] = []): T[] => {
    if (!planned.length) return current
    const fresh = planned.filter((item) => !current.some((existing) => existing.id === item.id))
    return [...fresh, ...current.map((existing) => planned.find((item) => item.id === existing.id) ?? existing)]
  }
  const appendMissing = <T extends { id: string }>(current: T[], planned: T[] = []): T[] => {
    if (!planned.length) return current
    return [...planned.filter((item) => !current.some((existing) => existing.id === item.id)), ...current]
  }
  return {
    claims: upsert(state.claims, objects.claims),
    sources: upsert(state.sources, objects.sources),
    batches: upsert(state.batches, objects.batches),
    versions: appendMissing(state.versions, objects.versions),
    audit: appendMissing(state.audit, objects.audit),
    conflicts: appendMissing(state.conflicts, objects.conflicts)
  }
}

/** 读取共享持久化状态，用于跨窗口的并发校验 */
function readPersistedState(): Collections | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: Collections }
    return parsed.state ?? null
  } catch {
    return null
  }
}

function auditEntry(claimId: string, action: string, operator: string, detail: string): AuditEntry {
  return { id: nextId('AUD'), claimId, action, operator, detail, createdAt: new Date().toISOString() }
}

export const useClaimStore = create<ClaimState>()(persist((set, get) => {
  /** 复合写入：先落完整批次到 journal，再写状态，成功后清除 journal */
  const commit = (label: string, objects: PlanObjects): boolean => {
    const plan: CommitPlan = { id: nextId('CMT'), label, createdAt: new Date().toISOString(), objects }
    try {
      writeJournal(plan)
      if (consumeCrashSimulation()) throw new Error('模拟本地写入中断')
      set((state) => applyPlan(state, objects))
      clearJournal(plan.id)
      return true
    } catch {
      return false
    }
  }

  /** 来源变化级联：未发布结论失效待重认，排队批次取消发布 */
  const cascadeSourceChange = (sourceId: string, nextSource: SharedSource, action: string, operator: string, note: string) => {
    const state = get()
    const now = new Date().toISOString()
    let invalidated = 0
    const touchedClaims = state.claims.flatMap((claim) => {
      if (claim.status === '已发布') return []
      let changed = false
      const facts = claim.facts.map((fact) => {
        if (fact.verification === '有效' && fact.sourceRefs.some((ref) => ref.sourceId === sourceId)) {
          invalidated += 1
          changed = true
          return { ...fact, verification: '待重认' as const }
        }
        return fact
      })
      return changed ? [{ ...claim, facts, updatedAt: now }] : []
    })
    const cancelledBatches = state.batches
      .filter((batch) => batch.status === '排队中' && batch.snapshot.some((snap) => snap.sourceId === sourceId))
      .map((batch) => ({ ...batch, status: '已取消' as const, cancelledReason: `来源「${nextSource.title}」发生变化（V${nextSource.version}），冻结快照失效` }))
    const entries: AuditEntry[] = [
      auditEntry('-', action, operator, `来源「${nextSource.title}」：${note}`),
      ...touchedClaims.map((claim) => auditEntry(claim.id, '结论失效待重认', '系统', `依赖来源 ${nextSource.id} 变化，未发布结论待重认`)),
      ...cancelledBatches.map((batch) => auditEntry(batch.claimId, '发布批次取消', '系统', `批次 ${batch.id} 冻结快照中的来源已变化，取消发布`))
    ]
    commit(action, { sources: [nextSource], claims: touchedClaims, batches: cancelledBatches, audit: entries })
    return { invalidated, cancelled: cancelledBatches.length }
  }

  return {
    claims: seedClaims,
    sources: seedSources,
    batches: seedBatches,
    conflicts: seedConflicts,
    versions: seedVersions,
    audit: seedAudit,
    keyword: '',
    status: '全部',
    setKeyword: (keyword) => set({ keyword }),
    setStatus: (status) => set({ status }),
    addClaim: (input) => {
      const now = new Date().toISOString()
      const claim: Claim = { id: nextId('FC'), ...input, editor: '宋卓', status: '核查中', createdAt: now, updatedAt: now, version: 1, facts: [] }
      set((state) => ({ claims: [claim, ...state.claims], audit: [auditEntry(claim.id, '建立核查主张', input.reporter, input.summary), ...state.audit] }))
      return claim
    },
    addFact: (claimId, text) => set((state) => {
      const claim = state.claims.find((item) => item.id === claimId)
      if (!claim || !text.trim()) return state
      claim.facts.push({ id: nextId('F'), text, conclusion: '证据不足', confidence: 30, unresolved: ['尚未关联来源'], verification: '待核', sourceRefs: [], annotations: [] })
      claim.version += 1
      claim.updatedAt = new Date().toISOString()
      return { claims: [...state.claims], audit: [auditEntry(claimId, '拆分可验证事实', claim.reporter, text), ...state.audit] }
    }),
    updateFact: (claimId, factId, patch) => set((state) => {
      const claim = state.claims.find((item) => item.id === claimId)
      const fact = claim?.facts.find((item) => item.id === factId)
      if (!claim || !fact) return state
      if (patch.conclusion && patch.conclusion !== '证据不足' && fact.unresolved.length) {
        patch.confidence = Math.min(patch.confidence ?? fact.confidence, 75)
      }
      Object.assign(fact, patch)
      claim.version += 1
      claim.updatedAt = new Date().toISOString()
      return { claims: [...state.claims], audit: [auditEntry(claimId, '更新事实结论', '当前用户', `${fact.text}：${fact.conclusion}`), ...state.audit] }
    }),
    reconfirmFact: (claimId, factId) => {
      const state = get()
      const claim = state.claims.find((item) => item.id === claimId)
      const fact = claim?.facts.find((item) => item.id === factId)
      if (!claim || !fact) return { ok: false, message: '事实不存在' }
      if (fact.verification === '有效') return { ok: false, message: '结论当前有效，无需重认' }
      if (!fact.sourceRefs.length) return { ok: false, message: '尚未关联来源，无法重认' }
      const linked = fact.sourceRefs.map((ref) => state.sources.find((source) => source.id === ref.sourceId))
      const retracted = linked.find((source) => source?.status === '已撤下')
      if (retracted) return { ok: false, message: `来源「${retracted.title}」已撤下，需先替换证据` }
      const changed = linked.find((source) => source?.status === '已改版')
      if (changed) return { ok: false, message: `来源「${changed.title}」已改版待重新留档` }
      const now = new Date().toISOString()
      const refs: FactSourceLink[] = fact.sourceRefs.map((ref) => ({ ...ref, linkedVersion: state.sources.find((source) => source.id === ref.sourceId)?.version ?? ref.linkedVersion }))
      const detail = refs.map((ref) => `${ref.sourceId} V${ref.linkedVersion}`).join('、')
      set((current) => ({
        claims: current.claims.map((item) => item.id === claimId
          ? { ...item, updatedAt: now, facts: item.facts.map((target) => target.id === factId ? { ...target, verification: '有效' as const, sourceRefs: refs } : target) }
          : item),
        audit: [auditEntry(claimId, '重认事实结论', '当前用户', `按来源当前版本重认：${detail}`), ...current.audit]
      }))
      return { ok: true, message: '已按来源当前版本重认结论' }
    },
    addAnnotation: (claimId, factId, input) => set((state) => {
      const claim = state.claims.find((item) => item.id === claimId)
      const fact = claim?.facts.find((item) => item.id === factId)
      if (!claim || !fact) return state
      fact.annotations.unshift({ ...input, id: nextId('N'), createdAt: new Date().toISOString(), resolved: false })
      return { claims: [...state.claims], audit: [auditEntry(claimId, '添加批注', input.author, input.content), ...state.audit] }
    }),
    resolveAnnotation: (claimId, factId, annotationId) => set((state) => {
      const claim = state.claims.find((item) => item.id === claimId)
      const annotation = claim?.facts.find((item) => item.id === factId)?.annotations.find((item) => item.id === annotationId)
      if (!claim || !annotation) return state
      annotation.resolved = true
      return { claims: [...state.claims], audit: [auditEntry(claimId, '解决批注', '当前用户', annotation.content), ...state.audit] }
    }),
    registerSource: (input) => {
      const now = new Date().toISOString()
      const source: SharedSource = { ...input, id: nextId('SRC'), capturedAt: now, version: 1, status: '有效', history: [{ version: 1, contentHash: input.contentHash, changedAt: now, note: '首次留档' }] }
      set((state) => ({ sources: [source, ...state.sources], audit: [auditEntry('-', '登记共享来源', '当前用户', input.title), ...state.audit] }))
      return source
    },
    linkSource: (claimId, factId, sourceId, stance) => {
      const state = get()
      const claim = state.claims.find((item) => item.id === claimId)
      const fact = claim?.facts.find((item) => item.id === factId)
      const source = state.sources.find((item) => item.id === sourceId)
      if (!claim || !fact || !source) return { ok: false, message: '对象不存在' }
      if (fact.sourceRefs.some((ref) => ref.sourceId === sourceId && ref.stance === stance)) return { ok: false, message: '该来源已按相同立场关联' }
      const now = new Date().toISOString()
      const link: FactSourceLink = { sourceId, stance, linkedAt: now, linkedVersion: source.version }
      set((current) => ({
        claims: current.claims.map((item) => item.id === claimId
          ? { ...item, version: item.version + 1, updatedAt: now, facts: item.facts.map((target) => target.id === factId ? { ...target, sourceRefs: [link, ...target.sourceRefs] } : target) }
          : item),
        audit: [auditEntry(claimId, stance === '反驳' ? '保留相反证据' : '关联共享来源', '当前用户', `${source.title}（V${source.version}）`), ...current.audit]
      }))
      return { ok: true, message: '已接入共享证据链' }
    },
    markSourceChanged: (sourceId, note) => {
      const source = get().sources.find((item) => item.id === sourceId)
      if (!source) return { invalidated: 0, cancelled: 0 }
      const next: SharedSource = { ...source, status: '已改版' }
      return cascadeSourceChange(sourceId, next, '监测到来源改版', '当前用户', note || '页面已改版，等待重新留档')
    },
    reviseSource: (sourceId, input) => {
      const source = get().sources.find((item) => item.id === sourceId)
      if (!source) return { invalidated: 0, cancelled: 0 }
      const now = new Date().toISOString()
      const next: SharedSource = {
        ...source, status: '有效', version: source.version + 1, contentHash: input.contentHash,
        history: [{ version: source.version + 1, contentHash: input.contentHash, changedAt: now, note: input.note || '重新留档' }, ...source.history]
      }
      return cascadeSourceChange(sourceId, next, '登记来源改版', '当前用户', `V${source.version}→V${next.version}：${input.note || '重新留档'}`)
    },
    retractSource: (sourceId, note) => {
      const source = get().sources.find((item) => item.id === sourceId)
      if (!source) return { invalidated: 0, cancelled: 0 }
      const next: SharedSource = { ...source, status: '已撤下' }
      return cascadeSourceChange(sourceId, next, '来源撤下', '当前用户', note || '来源方已撤下内容')
    },
    restoreSource: (sourceId, note) => {
      const source = get().sources.find((item) => item.id === sourceId)
      if (!source) return
      const now = new Date().toISOString()
      const next: SharedSource = {
        ...source, status: '有效', version: source.version + 1,
        history: [{ version: source.version + 1, contentHash: source.contentHash, changedAt: now, note: note || '恢复上架' }, ...source.history]
      }
      set((state) => ({ sources: state.sources.map((item) => item.id === sourceId ? next : item), audit: [auditEntry('-', '来源恢复', '当前用户', `「${source.title}」${note || '恢复上架'}，依赖结论需逐项重认`), ...state.audit] }))
    },
    submitBatch: (claimId, input) => {
      const state = get()
      const claim = state.claims.find((item) => item.id === claimId)
      if (!claim) return { ok: false, message: '主张不存在' }
      if (!claim.facts.length) return { ok: false, message: '至少需要一项可验证事实' }
      // 以共享持久化状态为准做并发校验：两个窗口同时提交时只放行先到批次
      const persisted = readPersistedState()
      const freshClaim = persisted?.claims.find((item) => item.id === claimId) ?? claim
      const queued = (persisted?.batches ?? state.batches).find((batch) => batch.claimId === claimId && batch.status === '排队中')
      const stale = freshClaim.version !== input.baseClaimVersion
      if (queued || stale) {
        const conflict: BatchConflict = {
          id: nextId('BC'), claimId, submittedAt: new Date().toISOString(), submittedBy: input.submittedBy,
          input: { note: input.note, baseClaimVersion: input.baseClaimVersion },
          expectedVersion: input.baseClaimVersion, actualVersion: freshClaim.version,
          winningBatchId: queued?.id,
          reason: queued ? `已存在先到排队批次 ${queued.id}，晚到批次被拦截` : `主张当前版本 V${freshClaim.version} 与提交基准 V${input.baseClaimVersion} 不一致`
        }
        commit('批次冲突拦截', { conflicts: [conflict], audit: [auditEntry(claimId, '批次冲突拦截', '系统', `${input.submittedBy} 提交的批次被拦截，保留输入与双方版本值`)] })
        return { ok: false, message: `提交被拦截：${conflict.reason}，输入已保留在冲突记录中` }
      }
      const snapshot = claim.facts.flatMap((fact) => fact.sourceRefs).map((ref) => {
        const source = state.sources.find((item) => item.id === ref.sourceId)
        return source ? { sourceId: source.id, title: source.title, version: source.version, contentHash: source.contentHash } : null
      }).filter((item): item is PublishBatch['snapshot'][number] => item !== null)
      const batch: PublishBatch = {
        id: nextId('B'), claimId, status: '排队中', note: input.note || '提交发布批次', submittedBy: input.submittedBy,
        createdAt: new Date().toISOString(), baseClaimVersion: input.baseClaimVersion, snapshot
      }
      const ok = commit('提交发布批次', { batches: [batch], audit: [auditEntry(claimId, '提交发布批次', input.submittedBy, `批次 ${batch.id} 冻结${snapshot.length}条来源快照，进入排队`)] })
      return ok ? { ok: true, message: `批次 ${batch.id} 已排队，冻结${snapshot.length}条来源快照` } : { ok: false, message: '本地写入失败，完整批次已保留，将在下次启动时恢复' }
    },
    publishBatch: (batchId, editor) => {
      const state = get()
      const batch = state.batches.find((item) => item.id === batchId)
      if (!batch || batch.status !== '排队中') return { ok: false, message: '批次不在排队状态' }
      const claim = state.claims.find((item) => item.id === batch.claimId)
      if (!claim) return { ok: false, message: '主张不存在' }
      const stale = batch.snapshot.filter((snap) => {
        const current = state.sources.find((item) => item.id === snap.sourceId)
        return !current || current.version !== snap.version || current.status !== '有效'
      })
      if (stale.length) {
        const cancelled: PublishBatch = { ...batch, status: '已取消', cancelledReason: `来源 ${stale.map((snap) => `「${snap.title}」`).join('')} 已变化，冻结快照失效` }
        commit('发布批次取消', { batches: [cancelled], audit: [auditEntry(batch.claimId, '发布批次取消', '系统', `批次 ${batch.id} 放行前快照校验失败，取消发布`)] })
        return { ok: false, message: '来源随后已变化，批次已取消发布' }
      }
      const preflight = preflightPublish(claim, state.sources)
      if (!preflight.allowed) return { ok: false, message: preflight.blocking.join('；') }
      const now = new Date().toISOString()
      const nextClaim: Claim = { ...claim, status: '已发布', version: claim.version + 1, updatedAt: now }
      const nextBatch: PublishBatch = { ...batch, status: '已发布', publishedAt: now }
      const version: VersionRecord = { id: nextId('V'), claimId: claim.id, version: nextClaim.version, editor, summary: batch.note, changedFactIds: [], removedEvidence: [], createdAt: now, batchId: batch.id }
      const ok = commit('放行发布批次', {
        claims: [nextClaim], batches: [nextBatch], versions: [version],
        audit: [auditEntry(claim.id, '发布批次放行', editor, `批次 ${batch.id} 按冻结快照发布，主张锁定为 V${nextClaim.version}`)]
      })
      return ok ? { ok: true, message: `批次 ${batch.id} 已发布，版本记录 V${nextClaim.version}` } : { ok: false, message: '本地写入失败，完整批次已保留，将在下次启动时恢复' }
    },
    cancelBatch: (batchId, reason) => {
      const batch = get().batches.find((item) => item.id === batchId)
      if (!batch || batch.status !== '排队中') return
      commit('取消发布批次', { batches: [{ ...batch, status: '已取消', cancelledReason: reason || '编辑取消' }], audit: [auditEntry(batch.claimId, '发布批次取消', '当前用户', `批次 ${batch.id}：${reason || '编辑取消'}`)] })
    },
    transitionClaim: (claimId, status, note) => {
      const state = get()
      const claim = state.claims.find((item) => item.id === claimId)
      if (!claim) return { ok: false, message: '主张不存在' }
      if (status === '已发布') return { ok: false, message: '发布需通过发布批次放行' }
      if (status === '待编辑复核' && claim.facts.length === 0) return { ok: false, message: '至少需要一项可验证事实' }
      const now = new Date().toISOString()
      const nextClaim: Claim = { ...claim, status, version: claim.version + 1, updatedAt: now }
      const version: VersionRecord = { id: nextId('V'), claimId, version: nextClaim.version, editor: claim.editor || '当前用户', summary: note, changedFactIds: [], removedEvidence: [], createdAt: now }
      set((current) => ({ claims: current.claims.map((item) => item.id === claimId ? nextClaim : item), versions: [version, ...current.versions], audit: [auditEntry(claimId, `状态流转：${status}`, '当前用户', note), ...current.audit] }))
      return { ok: true, message: `已流转至${status}` }
    },
    recoverFromJournal: () => {
      const plans = readJournal()
      if (!plans.length) return 0
      let recovered = 0
      const incomplete = <T extends { id: string }>(current: T[], planned: T[] = []) =>
        planned.filter((item) => {
          const existing = current.find((target) => target.id === item.id)
          return !existing || JSON.stringify(existing) !== JSON.stringify(item)
        }).length
      for (const plan of plans) {
        set((state) => {
          recovered += incomplete(state.claims, plan.objects.claims) + incomplete(state.sources, plan.objects.sources) + incomplete(state.batches, plan.objects.batches)
            + incomplete(state.versions, plan.objects.versions) + incomplete(state.audit, plan.objects.audit) + incomplete(state.conflicts, plan.objects.conflicts)
          return applyPlan(state, plan.objects)
        })
        clearJournal(plan.id)
      }
      set((state) => ({ audit: [auditEntry('-', '本地写入恢复', '系统', `从完整批次恢复 ${plans.length} 笔提交，仅补齐未完成对象，未重复追加版本和审计`), ...state.audit] }))
      return recovered
    },
    reset: () => {
      resetJournal()
      set({ claims: structuredClone(seedClaims), sources: structuredClone(seedSources), batches: structuredClone(seedBatches), conflicts: structuredClone(seedConflicts), versions: structuredClone(seedVersions), audit: structuredClone(seedAudit), keyword: '', status: '全部' })
    }
  }
}, {
  name: STORAGE_KEY,
  version: 2,
  migrate: (persisted, version) => {
    if (version < 2) return migrateLegacyState(persisted as Record<string, unknown>) as unknown as ClaimState
    return persisted as ClaimState
  }
}))

// 跨窗口同步：另一个窗口写入后，本窗口重新水合，保证并发校验基于最新状态
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) void useClaimStore.persist.rehydrate()
  })
}

export const conclusionColor: Record<FactConclusion, string> = {
  已证实: 'green',
  部分属实: 'yellow',
  证据不足: 'orange',
  不实: 'red'
}

export const verificationColor: Record<ClaimFact['verification'], string> = {
  有效: 'green',
  待重认: 'orange',
  待核: 'red'
}
