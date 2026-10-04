export type ClaimStatus = '核查中' | '待编辑复核' | '排队发布' | '已发布' | '已撤回'
export type FactConclusion = '已证实' | '部分属实' | '证据不足' | '不实'
export type EvidenceKind = '原始证据' | '二次来源' | '待证信息'
export type SourceStatus = '有效' | '已改版' | '已撤下'
export type ReviewState = '有效' | '待重认' | '待核'
export type SourceRole = '支持' | '反驳'

/** 共享来源的单个留档版本 */
export interface SourceVersion {
  version: number
  title: string
  url: string
  publisher: string
  publishedAt: string
  capturedAt: string
  kind: EvidenceKind
  chainOfCustody: string
  contentHash: string
  changeNote: string
  recordedAt: string
  /** 迁移补录的历史版本没有留档内容，标记为未确认 */
  confirmed: boolean
}

/** 共享来源库中的一份来源，可被多项事实引用 */
export interface SharedSource {
  id: string
  status: SourceStatus
  currentVersion: number
  versions: SourceVersion[]
  createdAt: string
}

/** 事实与共享来源的引用关系，冻结引用时的来源版本 */
export interface SourceLink {
  sourceId: string
  role: SourceRole
  snapshotVersion: number
  linkedAt: string
  linkedBy: string
}

export interface ClaimAnnotation {
  id: string
  author: string
  role: '记者' | '编辑' | '事实核查员'
  content: string
  createdAt: string
  resolved: boolean
}

export interface ClaimFact {
  id: string
  text: string
  conclusion: FactConclusion
  confidence: number
  /** 有效 / 待重认（依赖来源已变化）/ 待核（迁移时依赖无法确认） */
  reviewState: ReviewState
  /** 导致结论失效的来源 */
  invalidatedBy: string[]
  unresolved: string[]
  links: SourceLink[]
  annotations: ClaimAnnotation[]
}

export interface Claim {
  id: string
  title: string
  summary: string
  reporter: string
  editor: string
  status: ClaimStatus
  priority: '低' | '中' | '高'
  createdAt: string
  updatedAt: string
  version: number
  facts: ClaimFact[]
}

export interface VersionRecord {
  id: string
  claimId: string
  version: number
  editor: string
  summary: string
  changedFactIds: string[]
  removedEvidence: string[]
  createdAt: string
}

export interface AuditEntry {
  id: string
  claimId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}

/** 发布批次冻结的来源快照 */
export interface SourceSnapshot {
  sourceId: string
  version: number
  contentHash: string
}

export type BatchStatus = '排队中' | '提交中' | '已发布' | '已取消' | '冲突保留'

/** 提交计划：本地写入失败后可从完整批次恢复，按对象幂等补写 */
export interface CommitPlan {
  objects: {
    claim: Claim
    version: VersionRecord
    audit: AuditEntry[]
    batch: PublishBatch
  }
  /** 已确认写入的对象 id */
  completed: string[]
}

/** 晚到批次保留的输入与双方值 */
export interface BatchConflict {
  winningBatchId: string
  retainedInput: { editor: string; note: string; snapshots: SourceSnapshot[] }
  attempted: { claimVersion: number; targetStatus: ClaimStatus }
  current: { claimVersion: number; status: ClaimStatus; batchId: string }
  retainedAt: string
}

export interface PublishBatch {
  id: string
  claimId: string
  /** 排队时的主张版本，作为并发放行令牌 */
  claimVersion: number
  editor: string
  note: string
  queuedAt: string
  status: BatchStatus
  snapshots: SourceSnapshot[]
  publishedAt?: string
  cancelledAt?: string
  cancelReason?: string
  conflict?: BatchConflict
  plan?: CommitPlan
}

/* ---------- 旧数据（内嵌来源）结构，仅用于迁移 ---------- */

export interface LegacySourceRecord {
  id: string
  title: string
  url: string
  publisher: string
  publishedAt: string
  capturedAt: string
  kind: EvidenceKind
  chainOfCustody: string
  contentHash: string
  version: number
  supersededBy?: string
}

export interface LegacyClaimFact {
  id: string
  text: string
  conclusion: FactConclusion
  confidence: number
  unresolved: string[]
  sources: LegacySourceRecord[]
  counterSources: LegacySourceRecord[]
  annotations: ClaimAnnotation[]
}

export interface LegacyClaim {
  id: string
  title: string
  summary: string
  reporter: string
  editor: string
  status: ClaimStatus
  priority: '低' | '中' | '高'
  createdAt: string
  updatedAt: string
  version: number
  facts: LegacyClaimFact[]
}
