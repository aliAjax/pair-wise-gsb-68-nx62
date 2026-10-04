export type ClaimStatus = '核查中' | '待编辑复核' | '已发布' | '已撤回'
export type FactConclusion = '已证实' | '部分属实' | '证据不足' | '不实'
export type EvidenceKind = '原始证据' | '二次来源' | '待证信息'

/** 旧版内嵌来源结构，仅用于数据迁移 */
export interface SourceRecord {
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

export type SourceStatus = '有效' | '已改版' | '已撤下'

export interface SourceRevision {
  version: number
  contentHash: string
  changedAt: string
  note: string
}

/** 共享来源库中的来源：一个来源可支持多项事实、多条主张 */
export interface SharedSource {
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
  status: SourceStatus
  history: SourceRevision[]
}

export type SourceStance = '支持' | '反驳'

/** 事实与共享来源之间的引用，而不是内嵌拷贝 */
export interface FactSourceLink {
  sourceId: string
  stance: SourceStance
  linkedAt: string
  /** 关联时来源的版本，用于判断来源是否在关联后发生变化 */
  linkedVersion: number
}

/** 有效：结论与当前来源一致；待重认：依赖的来源已变化；待核：迁移后依赖无法确认 */
export type FactVerification = '有效' | '待重认' | '待核'

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
  unresolved: string[]
  verification: FactVerification
  sourceRefs: FactSourceLink[]
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

/** 发布批次冻结的来源快照 */
export interface SourceSnapshot {
  sourceId: string
  title: string
  version: number
  contentHash: string
}

export type BatchStatus = '排队中' | '已发布' | '已取消'

export interface PublishBatch {
  id: string
  claimId: string
  status: BatchStatus
  note: string
  submittedBy: string
  createdAt: string
  publishedAt?: string
  /** 提交时读到的主张版本，用于并发校验 */
  baseClaimVersion: number
  snapshot: SourceSnapshot[]
  cancelledReason?: string
}

/** 晚到批次被拦截时保留输入与双方值 */
export interface BatchConflict {
  id: string
  claimId: string
  submittedAt: string
  submittedBy: string
  input: { note: string; baseClaimVersion: number }
  expectedVersion: number
  actualVersion: number
  winningBatchId?: string
  reason: string
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
  batchId?: string
}

export interface AuditEntry {
  id: string
  claimId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}
