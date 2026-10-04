import type { AuditEntry, BatchConflict, Claim, PublishBatch, SharedSource, VersionRecord } from '../types'

/**
 * 提交计划：一次复合写入（发布批次、来源改版等）涉及的全部对象。
 * 先落 journal 再写状态；本地写入中断后，下次启动从 journal 恢复，
 * 只补缺失对象，不重复追加版本和审计。
 */
export interface CommitPlan {
  id: string
  label: string
  createdAt: string
  objects: {
    claims?: Claim[]
    sources?: SharedSource[]
    batches?: PublishBatch[]
    versions?: VersionRecord[]
    audit?: AuditEntry[]
    conflicts?: BatchConflict[]
  }
}

const JOURNAL_KEY = 'gsb68:commit-journal'
const CRASH_FLAG_KEY = 'gsb68:debug-crash'

export function readJournal(): CommitPlan[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY)
    return raw ? (JSON.parse(raw) as CommitPlan[]) : []
  } catch {
    return []
  }
}

export function writeJournal(plan: CommitPlan): void {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify([...readJournal(), plan]))
}

export function clearJournal(planId: string): void {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(readJournal().filter((plan) => plan.id !== planId)))
}

export function resetJournal(): void {
  localStorage.removeItem(JOURNAL_KEY)
}

/** 演练用：设置后下一次复合提交在状态落盘前中断，刷新页面即可观察恢复 */
export function armCrashSimulation(): void {
  localStorage.setItem(CRASH_FLAG_KEY, '1')
}

export function consumeCrashSimulation(): boolean {
  const armed = localStorage.getItem(CRASH_FLAG_KEY) === '1'
  if (armed) localStorage.removeItem(CRASH_FLAG_KEY)
  return armed
}
