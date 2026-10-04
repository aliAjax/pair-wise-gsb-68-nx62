import axios from 'axios'
import type { Claim, SharedSource } from '../types'

const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api', timeout: 5000 })

export async function loadClaimSnapshot(fallback: Claim[]): Promise<Claim[]> {
  if (!import.meta.env.VITE_API_BASE_URL) return fallback
  try { return (await client.get<Claim[]>('/claims')).data } catch { return fallback }
}

/** 发布前校验：结论须有效、来源可确认、无未解决疑点 */
export function preflightPublish(claim: Claim, sources: SharedSource[]) {
  const blocking: string[] = []
  const byId = new Map(sources.map((source) => [source.id, source]))
  const currentKind = (sourceId: string) => {
    const source = byId.get(sourceId)
    return source?.versions.find((item) => item.version === source.currentVersion)?.kind
  }
  if (!claim.facts.length) blocking.push('至少需要一项可验证事实')
  if (claim.facts.some((fact) => fact.reviewState !== '有效')) blocking.push('存在待重认或待核的事实结论')
  if (claim.facts.some((fact) => fact.conclusion === '证据不足' && fact.unresolved.length)) blocking.push('仍有证据不足且未解决疑点的事实')
  if (claim.facts.some((fact) => fact.links.length === 0)) blocking.push('存在没有来源记录的事实')
  if (claim.facts.flatMap((fact) => fact.links).some((link) => byId.get(link.sourceId)?.status === '已撤下')) blocking.push('存在已撤下的来源，需替换后重认')
  if (claim.facts.flatMap((fact) => fact.links).some((link) => link.role === '支持' && currentKind(link.sourceId) === '待证信息')) blocking.push('待证信息尚未完成原始来源核验')
  return { allowed: blocking.length === 0, blocking }
}
