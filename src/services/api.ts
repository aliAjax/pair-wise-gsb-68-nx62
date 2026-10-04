import axios from 'axios'
import type { Claim, SharedSource } from '../types'

const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api', timeout: 5000 })

export async function loadClaimSnapshot(fallback: Claim[]): Promise<Claim[]> {
  if (!import.meta.env.VITE_API_BASE_URL) return fallback
  try { return (await client.get<Claim[]>('/claims')).data } catch { return fallback }
}

/** 发布前校验：结论、疑点、重认状态与共享来源有效性 */
export function preflightPublish(claim: Claim, sources: SharedSource[]) {
  const byId = new Map(sources.map((source) => [source.id, source]))
  const blocking: string[] = []
  if (claim.facts.length === 0) blocking.push('至少需要一项可验证事实')
  if (claim.facts.some((fact) => fact.conclusion === '证据不足' && fact.unresolved.length)) blocking.push('仍有证据不足且未解决疑点的事实')
  if (claim.facts.some((fact) => fact.verification !== '有效')) blocking.push('存在待重认或待核的事实结论')
  if (claim.facts.some((fact) => fact.sourceRefs.length === 0)) blocking.push('存在没有来源记录的事实')
  if (claim.facts.flatMap((fact) => fact.sourceRefs).some((ref) => byId.get(ref.sourceId)?.kind === '待证信息')) blocking.push('待证信息尚未完成原始来源核验')
  if (claim.facts.flatMap((fact) => fact.sourceRefs).some((ref) => byId.get(ref.sourceId)?.status !== '有效')) blocking.push('存在已改版或已撤下的来源')
  return { allowed: blocking.length === 0, blocking }
}
