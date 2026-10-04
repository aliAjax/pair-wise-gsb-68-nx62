import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { legacyClaims, seedAudit, seedVersions } from '../data/seed'
import { migrateLegacyData } from '../services/migration'
import { preflightPublish } from '../services/api'
import type {
  AuditEntry,
  BatchStatus,
  Claim,
  ClaimAnnotation,
  ClaimFact,
  ClaimStatus,
  CommitPlan,
  EvidenceKind,
  FactConclusion,
  PublishBatch,
  ReviewState,
  SharedSource,
  SourceLink,
  SourceRole,
  SourceSnapshot,
  SourceStatus,
  SourceVersion,
  VersionRecord
} from '../types'

const STORAGE_KEY = 'gsb68:evidence-chain'
const LEGACY_KEY = 'gsb68:fact-check-workbench'

interface SourceInput {
  title: string
  url: string
  publisher: string
  publishedAt: string
  kind: EvidenceKind
  chainOfCustody: string
  contentHash: string
}

interface ReviseInput {
  title?: string
  url?: string
  contentHash: string
  chainOfCustody?: string
  changeNote: string
}

type DataSlice = Pick<ClaimState, 'claims' | 'sources' | 'batches' | 'versions' | 'audit'>

interface ClaimState {
  claims: Claim[]
  sources: SharedSource[]
  batches: PublishBatch[]
  versions: VersionRecord[]
  audit: AuditEntry[]
  keyword: string
  status: ClaimStatus | '全部'
  setKeyword: (value: string) => void
  setStatus: (value: ClaimStatus | '全部') => void
  addClaim: (input: { title: string; summary: string; reporter: string; priority: Claim['priority'] }) => Claim
  addFact: (claimId: string, text: string) => void
  updateFact: (claimId: string, factId: string, patch: Partial<ClaimFact>) => void
  addAnnotation: (claimId: string, factId: string, annotation: Omit<ClaimAnnotation, 'id' | 'createdAt' | 'resolved'>) => void
  resolveAnnotation: (claimId: string, factId: string, annotationId: string) => void
  registerSource: (input: SourceInput) => SharedSource
  linkSource: (claimId: string, factId: string, sourceId: string, role: SourceRole, linkedBy: string) => void
  reviseSource: (sourceId: string, patch: ReviseInput, operator: string) => { ok: boolean; message: string }
  retractSource: (sourceId: string, reason: string, operator: string) => { ok: boolean; message: string }
  reconfirmFact: (claimId: string, factId: string, note: string) => void
  transitionClaim: (claimId: string, status: ClaimStatus, note: string) => { ok: boolean; message: string }
  queuePublish: (claimId: string, note: string, editor: string) => { ok: boolean; message: string; batchId?: string }
  commitBatch: (batchId: string, opts?: { simulateFailure?: boolean }) => { ok: boolean; message: string }
  cancelBatch: (batchId: string, reason: string) => void
  recoverCommits: () => number
  reset: () => void
}

let idSeed = 100
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${idSeed++}`
const now = () => new Date().toISOString()

function mkAudit(claimId: string, action: string, operator: string, detail: string): AuditEntry {
  return { id: nextId('AUD'), claimId, action, operator, detail, createdAt: now() }
}

function migrateSeed(): DataSlice {
  return { ...migrateLegacyData(legacyClaims, seedVersions, seedAudit), batches: [] }
}

/** 首次加载：旧键中的内嵌来源数据迁移到共享库；否则用旧格式种子完成迁移 */
function loadInitialData(): DataSlice {
  try {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const raw = localStorage.getItem(LEGACY_KEY)
      const old = raw ? JSON.parse(raw)?.state : null
      if (old?.claims?.some((claim: { facts?: { sources?: unknown }[] }) => claim.facts?.some((fact) => Array.isArray(fact.sources)))) {
        localStorage.removeItem(LEGACY_KEY)
        return { ...migrateLegacyData(old.claims, old.versions ?? [], old.audit ?? []), batches: [] }
      }
    }
  } catch {
    /* 旧数据损坏时回落到种子迁移 */
  }
  return migrateSeed()
}

/** 提交时读取本地持久化的最新状态，模拟另一窗口已写入的共享存储 */
function readPersisted(): DataSlice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const state = JSON.parse(raw)?.state
    if (!Array.isArray(state?.claims) || !Array.isArray(state?.batches)) return null
    return { claims: state.claims, sources: state.sources, batches: state.batches, versions: state.versions, audit: state.audit }
  } catch {
    return null
  }
}

function collectSnapshots(claim: Claim, sources: SharedSource[]): SourceSnapshot[] {
  const byId = new Map(sources.map((source) => [source.id, source]))
  const ids = [...new Set(claim.facts.flatMap((fact) => fact.links.map((link) => link.sourceId)))]
  return ids.map((id) => {
    const source = byId.get(id)
    const current = source?.versions.find((item) => item.version === source.currentVersion)
    return { sourceId: id, version: source?.currentVersion ?? 0, contentHash: current?.contentHash ?? '' }
  })
}

function planSteps(plan: CommitPlan): string[] {
  return [plan.objects.claim.id, plan.objects.version.id, ...plan.objects.audit.map((entry) => entry.id), plan.objects.batch.id]
}

/** 幂等补写计划中的单个对象：已存在的版本与审计不重复追加 */
function applyPlanStep(state: DataSlice, batchId: string, plan: CommitPlan, stepId: string): DataSlice {
  const markDone = (slice: DataSlice): DataSlice => ({
    ...slice,
    batches: slice.batches.map((batch) =>
      batch.id === batchId && batch.plan ? { ...batch, plan: { ...batch.plan, completed: [...batch.plan.completed, stepId] } } : batch
    )
  })
  if (stepId === plan.objects.claim.id) {
    return markDone({ ...state, claims: state.claims.map((claim) => (claim.id === plan.objects.claim.id ? plan.objects.claim : claim)) })
  }
  if (stepId === plan.objects.version.id) {
    if (state.versions.some((item) => item.id === plan.objects.version.id)) return markDone(state)
    return markDone({ ...state, versions: [plan.objects.version, ...state.versions] })
  }
  const auditTarget = plan.objects.audit.find((entry) => entry.id === stepId)
  if (auditTarget) {
    if (state.audit.some((entry) => entry.id === stepId)) return markDone(state)
    return markDone({ ...state, audit: [auditTarget, ...state.audit] })
  }
  if (stepId === plan.objects.batch.id) {
    const donePlan: CommitPlan = { ...plan, completed: planSteps(plan) }
    return { ...state, batches: state.batches.map((batch) => (batch.id === batchId ? { ...plan.objects.batch, plan: donePlan } : batch)) }
  }
  return state
}

/**
 * 来源变化传播：未发布结论失效待重认；排队/已发布批次取消发布。
 * 已发布批次取消后主张撤回，其结论随之成为未发布结论并待重认。
 */
function propagateSourceChange(state: DataSlice, sourceId: string, label: string, operator: string, at: string) {
  const audit: AuditEntry[] = []
  let cancelled = 0
  let invalidated = 0
  const batches = state.batches.map((batch) => {
    if (!batch.snapshots.some((snap) => snap.sourceId === sourceId)) return batch
    if (batch.status === '排队中' || batch.status === '提交中') {
      cancelled += 1
      audit.push(mkAudit(batch.claimId, '批次取消发布', operator, `批次${batch.id}依赖来源${label}，冻结快照失效`))
      const { plan: _plan, ...rest } = batch
      return { ...rest, status: '已取消' as BatchStatus, cancelledAt: at, cancelReason: `依赖来源${label}，冻结快照失效` }
    }
    if (batch.status === '已发布') {
      cancelled += 1
      audit.push(mkAudit(batch.claimId, '批次取消发布', operator, `批次${batch.id}已发布，来源${label}，按规则取消发布`))
      return { ...batch, status: '已取消' as BatchStatus, cancelledAt: at, cancelReason: `发布后来源${label}，取消发布` }
    }
    return batch
  })
  const withdrawnClaimIds = new Set(
    state.batches
      .filter((batch) => batch.status === '已发布')
      .filter((batch) => batches.find((item) => item.id === batch.id)?.status === '已取消')
      .map((batch) => batch.claimId)
  )
  /** 排队/提交中批次被取消后，主张回到待编辑复核（仍有其他排队批次除外） */
  const unqueuedClaimIds = new Set(
    state.batches
      .filter((batch) => batch.status === '排队中' || batch.status === '提交中')
      .filter((batch) => batches.find((item) => item.id === batch.id)?.status === '已取消')
      .map((batch) => batch.claimId)
      .filter((claimId) => !batches.some((batch) => batch.claimId === claimId && batch.status === '排队中'))
  )
  const claims = state.claims.map((claim) => {
    const withdrawn = withdrawnClaimIds.has(claim.id)
    const unqueued = unqueuedClaimIds.has(claim.id) && claim.status === '排队发布'
    let touched = false
    const facts = claim.facts.map((fact) => {
      if (!fact.links.some((link) => link.sourceId === sourceId)) return fact
      if (fact.reviewState === '待重认' && fact.invalidatedBy.includes(sourceId)) return fact
      touched = true
      invalidated += 1
      return { ...fact, reviewState: '待重认' as ReviewState, invalidatedBy: [...new Set([...fact.invalidatedBy, sourceId])] }
    })
    if (!touched && !withdrawn && !unqueued) return claim
    if (touched) audit.push(mkAudit(claim.id, '结论失效待重认', operator, `依赖来源${label}，未发布结论失效待重认`))
    const status: ClaimStatus = withdrawn ? '已撤回' : unqueued ? '待编辑复核' : claim.status
    return { ...claim, facts, status, updatedAt: at }
  })
  return { claims, batches, audit, invalidated, cancelled }
}

export const useClaimStore = create<ClaimState>()(persist((set, get) => {
  /** 从完整批次恢复：逐对象幂等补写，limit 用于模拟写入中断 */
  const runPlan = (batchId: string, limit?: number) => {
    const batch = get().batches.find((item) => item.id === batchId)
    if (!batch?.plan) return
    const remaining = planSteps(batch.plan).filter((id) => !batch.plan!.completed.includes(id))
    const steps = limit ? remaining.slice(0, limit) : remaining
    for (const stepId of steps) {
      set((state) => applyPlanStep(state, batchId, batch.plan!, stepId))
    }
  }

  return {
    ...loadInitialData(),
    keyword: '',
    status: '全部',
    setKeyword: (keyword) => set({ keyword }),
    setStatus: (status) => set({ status }),
    addClaim: (input) => {
      const at = now()
      const claim: Claim = { id: nextId('FC'), ...input, editor: '宋卓', status: '核查中', createdAt: at, updatedAt: at, version: 1, facts: [] }
      set((state) => ({ claims: [claim, ...state.claims], audit: [mkAudit(claim.id, '建立核查主张', input.reporter, input.summary), ...state.audit] }))
      return claim
    },
    addFact: (claimId, text) => set((state) => {
      const claim = state.claims.find((item) => item.id === claimId)
      if (!claim || !text.trim()) return state
      const fact: ClaimFact = {
        id: nextId('F'), text, conclusion: '证据不足', confidence: 30,
        reviewState: '有效', invalidatedBy: [], unresolved: ['尚未关联来源'], links: [], annotations: []
      }
      const claims = state.claims.map((item) => (item.id === claimId ? { ...item, facts: [...item.facts, fact], version: item.version + 1, updatedAt: now() } : item))
      return { claims, audit: [mkAudit(claimId, '拆分可验证事实', claim.reporter, text), ...state.audit] }
    }),
    updateFact: (claimId, factId, patch) => set((state) => {
      const claim = state.claims.find((item) => item.id === claimId)
      const fact = claim?.facts.find((item) => item.id === factId)
      if (!claim || !fact) return state
      const nextPatch = { ...patch }
      if (nextPatch.conclusion && nextPatch.conclusion !== '证据不足' && fact.unresolved.length) {
        nextPatch.confidence = Math.min(nextPatch.confidence ?? fact.confidence, 75)
      }
      const claims = state.claims.map((item) =>
        item.id === claimId
          ? { ...item, facts: item.facts.map((f) => (f.id === factId ? { ...f, ...nextPatch } : f)), version: item.version + 1, updatedAt: now() }
          : item
      )
      return { claims, audit: [mkAudit(claimId, '更新事实结论', '当前用户', `${fact.text}：${nextPatch.conclusion ?? fact.conclusion}`), ...state.audit] }
    }),
    addAnnotation: (claimId, factId, input) => set((state) => {
      const claim = state.claims.find((item) => item.id === claimId)
      if (!claim?.facts.some((item) => item.id === factId)) return state
      const annotation: ClaimAnnotation = { ...input, id: nextId('N'), createdAt: now(), resolved: false }
      const claims = state.claims.map((item) =>
        item.id === claimId
          ? { ...item, facts: item.facts.map((f) => (f.id === factId ? { ...f, annotations: [annotation, ...f.annotations] } : f)) }
          : item
      )
      return { claims, audit: [mkAudit(claimId, '添加批注', input.author, input.content), ...state.audit] }
    }),
    resolveAnnotation: (claimId, factId, annotationId) => set((state) => {
      const claims = state.claims.map((item) =>
        item.id === claimId
          ? { ...item, facts: item.facts.map((f) => (f.id === factId ? { ...f, annotations: f.annotations.map((a) => (a.id === annotationId ? { ...a, resolved: true } : a)) } : f)) }
          : item
      )
      return { claims, audit: [mkAudit(claimId, '解决批注', '当前用户', annotationId), ...state.audit] }
    }),
    registerSource: (input) => {
      const at = now()
      const version: SourceVersion = {
        version: 1, title: input.title, url: input.url, publisher: input.publisher, publishedAt: input.publishedAt,
        capturedAt: at, kind: input.kind, chainOfCustody: input.chainOfCustody, contentHash: input.contentHash,
        changeNote: '登记入共享来源库', recordedAt: at, confirmed: Boolean(input.contentHash)
      }
      const source: SharedSource = { id: nextId('SRC'), status: '有效', currentVersion: 1, versions: [version], createdAt: at }
      set((state) => ({ sources: [source, ...state.sources], audit: [mkAudit(source.id, '新建共享来源', '当前用户', input.title), ...state.audit] }))
      return source
    },
    linkSource: (claimId, factId, sourceId, role, linkedBy) => set((state) => {
      const claim = state.claims.find((item) => item.id === claimId)
      const fact = claim?.facts.find((item) => item.id === factId)
      const source = state.sources.find((item) => item.id === sourceId)
      if (!claim || !fact || !source) return state
      if (fact.links.some((link) => link.sourceId === sourceId && link.role === role)) return state
      const link: SourceLink = { sourceId, role, snapshotVersion: source.currentVersion, linkedAt: now(), linkedBy }
      const claims = state.claims.map((item) =>
        item.id === claimId
          ? { ...item, facts: item.facts.map((f) => (f.id === factId ? { ...f, links: [...f.links, link] } : f)), version: item.version + 1, updatedAt: now() }
          : item
      )
      const title = source.versions.find((item) => item.version === source.currentVersion)?.title ?? sourceId
      return { claims, audit: [mkAudit(claimId, role === '反驳' ? '保留相反证据' : '关联共享来源', linkedBy, `${fact.id} ← ${title}（V${source.currentVersion}）`), ...state.audit] }
    }),
    reviseSource: (sourceId, patch, operator) => {
      const state = get()
      const source = state.sources.find((item) => item.id === sourceId)
      if (!source) return { ok: false, message: '来源不存在' }
      const at = now()
      const prev = source.versions.find((item) => item.version === source.currentVersion)
      const next: SourceVersion = {
        version: source.currentVersion + 1,
        title: patch.title || prev?.title || '',
        url: patch.url || prev?.url || '',
        publisher: prev?.publisher || '',
        publishedAt: prev?.publishedAt || '',
        capturedAt: at,
        kind: prev?.kind || '二次来源',
        chainOfCustody: patch.chainOfCustody || prev?.chainOfCustody || '',
        contentHash: patch.contentHash,
        changeNote: patch.changeNote || '来源页面改版，重新留档',
        recordedAt: at,
        confirmed: Boolean(patch.contentHash)
      }
      const sources = state.sources.map((item) =>
        item.id === sourceId ? { ...item, status: '已改版' as SourceStatus, currentVersion: next.version, versions: [...item.versions, next] } : item
      )
      const propagation = propagateSourceChange(state, sourceId, `改版至V${next.version}`, operator, at)
      set({
        sources,
        claims: propagation.claims,
        batches: propagation.batches,
        audit: [mkAudit(sourceId, '来源改版', operator, `「${next.title}」登记V${next.version}：${next.changeNote}`), ...propagation.audit, ...state.audit]
      })
      return { ok: true, message: `已登记V${next.version}：${propagation.invalidated}项结论待重认，${propagation.cancelled}个批次取消发布` }
    },
    retractSource: (sourceId, reason, operator) => {
      const state = get()
      const source = state.sources.find((item) => item.id === sourceId)
      if (!source) return { ok: false, message: '来源不存在' }
      const at = now()
      const sources = state.sources.map((item) => (item.id === sourceId ? { ...item, status: '已撤下' as SourceStatus } : item))
      const propagation = propagateSourceChange(state, sourceId, '已撤下', operator, at)
      set({
        sources,
        claims: propagation.claims,
        batches: propagation.batches,
        audit: [mkAudit(sourceId, '来源撤下', operator, reason || '来源方撤下内容'), ...propagation.audit, ...state.audit]
      })
      return { ok: true, message: `来源已撤下：${propagation.invalidated}项结论待重认，${propagation.cancelled}个批次取消发布` }
    },
    reconfirmFact: (claimId, factId, note) => set((state) => {
      const claim = state.claims.find((item) => item.id === claimId)
      const fact = claim?.facts.find((item) => item.id === factId)
      if (!claim || !fact || fact.reviewState === '有效') return state
      const claims = state.claims.map((item) =>
        item.id === claimId
          ? { ...item, facts: item.facts.map((f) => (f.id === factId ? { ...f, reviewState: '有效' as ReviewState, invalidatedBy: [] } : f)), version: item.version + 1, updatedAt: now() }
          : item
      )
      return { claims, audit: [mkAudit(claimId, '复核重认结论', '当前用户', `「${fact.text}」${note || '复核后确认结论仍成立'}`), ...state.audit] }
    }),
    transitionClaim: (claimId, status, note) => {
      const state = get()
      const claim = state.claims.find((item) => item.id === claimId)
      if (!claim) return { ok: false, message: '主张不存在' }
      if (status === '已发布') return { ok: false, message: '请通过发布批次提交发布' }
      if (status === '待编辑复核' && claim.facts.length === 0) return { ok: false, message: '至少需要一项可验证事实' }
      const at = now()
      const claims = state.claims.map((item) => (item.id === claimId ? { ...item, status, version: item.version + 1, updatedAt: at } : item))
      const version: VersionRecord = { id: nextId('V'), claimId, version: claim.version + 1, editor: claim.editor || '当前用户', summary: note, changedFactIds: [], removedEvidence: [], createdAt: at }
      set((current) => ({ claims, versions: [version, ...current.versions], audit: [mkAudit(claimId, `状态流转：${status}`, '当前用户', note), ...current.audit] }))
      return { ok: true, message: `已流转至${status}` }
    },
    queuePublish: (claimId, note, editor) => {
      const state = get()
      const claim = state.claims.find((item) => item.id === claimId)
      if (!claim) return { ok: false, message: '主张不存在' }
      if (claim.status !== '待编辑复核' && claim.status !== '排队发布') return { ok: false, message: '仅待编辑复核的主张可排队发布' }
      const preflight = preflightPublish(claim, state.sources)
      if (!preflight.allowed) return { ok: false, message: preflight.blocking[0] }
      const snapshots = collectSnapshots(claim, state.sources)
      const batch: PublishBatch = { id: nextId('PB'), claimId, claimVersion: claim.version, editor, note, queuedAt: now(), status: '排队中', snapshots }
      set((current) => ({
        batches: [batch, ...current.batches],
        claims: current.claims.map((item) => (item.id === claimId ? { ...item, status: '排队发布' as ClaimStatus, updatedAt: now() } : item)),
        audit: [mkAudit(claimId, '批次排队发布', editor, `批次${batch.id}冻结${snapshots.length}项来源快照`), ...current.audit]
      }))
      return { ok: true, message: `批次${batch.id}已排队，冻结${snapshots.length}项来源快照`, batchId: batch.id }
    },
    commitBatch: (batchId, opts) => {
      const base = readPersisted() ?? get()
      const batch = base.batches.find((item) => item.id === batchId)
      if (!batch) return { ok: false, message: '批次不存在' }
      if (batch.status !== '排队中') return { ok: false, message: `批次当前为「${batch.status}」，不能提交` }
      const claim = base.claims.find((item) => item.id === batch.claimId)
      if (!claim) return { ok: false, message: '主张不存在' }
      const at = now()
      // 快照校验：排队后来源发生变化则取消发布（已改版的新版本已重新留档，仅撤下阻断）
      const stale = batch.snapshots.filter((snap) => {
        const source = base.sources.find((item) => item.id === snap.sourceId)
        if (!source || source.status === '已撤下') return true
        const current = source.versions.find((item) => item.version === source.currentVersion)
        return source.currentVersion !== snap.version || (current?.contentHash ?? '') !== snap.contentHash
      })
      if (stale.length) {
        set({
          batches: base.batches.map((item) => (item.id === batchId ? { ...item, status: '已取消' as BatchStatus, cancelledAt: at, cancelReason: `提交时${stale.length}项来源快照已失效` } : item)),
          claims: base.claims.map((item) => (item.id === claim.id ? { ...item, status: '待编辑复核' as ClaimStatus, updatedAt: at } : item)),
          audit: [mkAudit(claim.id, '批次取消发布', batch.editor, `批次${batch.id}提交时来源快照失效，取消发布`), ...base.audit]
        })
        return { ok: false, message: '来源快照已失效，批次已取消发布' }
      }
      // 并发：只放行先到批次，晚到批次保留输入与双方值
      const winner = base.batches.find((item) => item.claimId === batch.claimId && item.id !== batch.id && (item.status === '已发布' || item.status === '提交中'))
      if (winner || claim.version !== batch.claimVersion || claim.status === '已发布') {
        const conflicted: PublishBatch = {
          ...batch,
          status: '冲突保留',
          conflict: {
            winningBatchId: winner?.id ?? '外部变更',
            retainedInput: { editor: batch.editor, note: batch.note, snapshots: batch.snapshots },
            attempted: { claimVersion: batch.claimVersion, targetStatus: '已发布' },
            current: { claimVersion: claim.version, status: claim.status, batchId: winner?.id ?? '' },
            retainedAt: at
          }
        }
        set({
          batches: base.batches.map((item) => (item.id === batchId ? conflicted : item)),
          audit: [mkAudit(claim.id, '批次冲突保留', batch.editor, `批次${batch.id}晚于${winner?.id ?? '其他变更'}到达，保留输入与双方值`), ...base.audit]
        })
        return { ok: false, message: '已有先到批次放行，本批次保留输入与双方值' }
      }
      // 构建完整提交计划，逐对象写入；中断后可从批次恢复
      const publishedClaim: Claim = { ...claim, status: '已发布', version: claim.version + 1, updatedAt: at }
      const version: VersionRecord = { id: nextId('V'), claimId: claim.id, version: publishedClaim.version, editor: batch.editor, summary: batch.note || '批次发布', changedFactIds: [], removedEvidence: [], createdAt: at }
      const plan: CommitPlan = {
        objects: {
          claim: publishedClaim,
          version,
          audit: [
            mkAudit(claim.id, '批次提交发布', batch.editor, `批次${batch.id}发布，冻结来源快照${batch.snapshots.length}项`),
            mkAudit(claim.id, '状态流转：已发布', batch.editor, batch.note || '批次发布')
          ],
          batch: { ...batch, status: '已发布', publishedAt: at }
        },
        completed: []
      }
      set({ batches: base.batches.map((item) => (item.id === batchId ? { ...item, status: '提交中' as BatchStatus, plan } : item)) })
      if (opts?.simulateFailure) {
        runPlan(batchId, 1)
        return { ok: false, message: '本地写入中断：批次停留在提交中，可从完整批次恢复' }
      }
      runPlan(batchId)
      return { ok: true, message: `批次${batch.id}已发布` }
    },
    cancelBatch: (batchId, reason) => set((state) => {
      const batch = state.batches.find((item) => item.id === batchId)
      if (!batch || (batch.status !== '排队中' && batch.status !== '提交中')) return state
      const at = now()
      const stillQueued = state.batches.some((item) => item.claimId === batch.claimId && item.id !== batchId && item.status === '排队中')
      const { plan: _plan, ...rest } = batch
      return {
        batches: state.batches.map((item) => (item.id === batchId ? { ...rest, status: '已取消' as BatchStatus, cancelledAt: at, cancelReason: reason } : item)),
        claims: state.claims.map((item) => (item.id === batch.claimId && item.status === '排队发布' && !stillQueued ? { ...item, status: '待编辑复核' as ClaimStatus, updatedAt: at } : item)),
        audit: [mkAudit(batch.claimId, '批次取消发布', '当前用户', `批次${batchId}：${reason}`), ...state.audit]
      }
    }),
    recoverCommits: () => {
      const pending = get().batches.filter((item) => item.status === '提交中' && item.plan)
      for (const batch of pending) {
        runPlan(batch.id)
        set((state) => ({ audit: [mkAudit(batch.claimId, '提交恢复', '系统', `批次${batch.id}本地写入中断后从完整批次恢复，仅补写未完成对象`), ...state.audit] }))
      }
      return pending.length
    },
    reset: () => set({ ...migrateSeed(), keyword: '', status: '全部' })
  }
}, { name: STORAGE_KEY, version: 1 }))

export const conclusionColor: Record<FactConclusion, string> = {
  已证实: 'green',
  部分属实: 'yellow',
  证据不足: 'orange',
  不实: 'red'
}

export const reviewStateColor: Record<ReviewState, string> = {
  有效: 'green',
  待重认: 'orange',
  待核: 'purple'
}

export const sourceStatusColor: Record<SourceStatus, string> = {
  有效: 'green',
  已改版: 'yellow',
  已撤下: 'red'
}

export const batchStatusColor: Record<BatchStatus, string> = {
  排队中: 'blue',
  提交中: 'yellow',
  已发布: 'green',
  已取消: 'gray',
  冲突保留: 'red'
}
