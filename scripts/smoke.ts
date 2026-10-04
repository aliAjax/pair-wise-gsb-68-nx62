/* 冒烟测试：共享证据链核心行为（node + esbuild 运行，非工程交付物） */
// localStorage 垫片必须早于 store 导入
const mem = new Map<string, string>()
// @ts-expect-error 全局垫片
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  get length() { return mem.size }
}

// @ts-expect-error 全局垫片
globalThis.window = Object.assign(globalThis, { addEventListener: () => undefined })

async function main() {
// 垫片就绪后再加载 store（静态 import 会被提升）
const { useClaimStore } = await import('../src/store/useClaimStore')
const { migrateLegacyState } = await import('../src/services/migrate')
const { armCrashSimulation } = await import('../src/services/journal')

let failures = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}`, extra ?? '') }
}

const s = () => useClaimStore.getState()

console.log('1. 种子加载')
check('共享来源 8 条', s().sources.length === 8)
check('SRC-2 被 F-1 与 F-3 复用', s().claims[0].facts.filter((f) => f.sourceRefs.some((r) => r.sourceId === 'SRC-2')).length === 2)
check('SRC-6 跨主张复用', s().claims.flatMap((c) => c.facts).filter((f) => f.sourceRefs.some((r) => r.sourceId === 'SRC-6')).length === 2)
check('B-1 排队中', s().batches.find((b) => b.id === 'B-1')?.status === '排队中')

console.log('2. 来源改版级联：未发布结论失效待重认，排队批次取消')
const r2 = s().reviseSource('SRC-2', { contentHash: 'sha256:新哈希...v3', note: '平台再次替换附件' })
check('SRC-2 升到 V3', s().sources.find((x) => x.id === 'SRC-2')?.version === 3)
check('2 项结论失效', r2.invalidated === 2, r2)
check('1 个排队批次取消', r2.cancelled === 1, r2)
check('B-1 已取消且记录原因', s().batches.find((b) => b.id === 'B-1')?.status === '已取消' && Boolean(s().batches.find((b) => b.id === 'B-1')?.cancelledReason))
check('F-1/F-3 待重认', ['F-1', 'F-3'].every((fid) => s().claims[0].facts.find((f) => f.id === fid)?.verification === '待重认'))
check('F-4 不受影响', s().claims[1].facts.find((f) => f.id === 'F-4')?.verification === '有效')

console.log('3. 重认：按来源当前版本')
const rc = s().reconfirmFact('FC-260929-01', 'F-1')
check('重认成功', rc.ok, rc)
const f1 = s().claims[0].facts.find((f) => f.id === 'F-1')!
check('F-1 有效且 linkedVersion=3', f1.verification === '有效' && f1.sourceRefs.find((r) => r.sourceId === 'SRC-2')?.linkedVersion === 3)

console.log('4. 并发：两个窗口同时提交，只放行先到批次')
const claim = s().addClaim({ title: '并发测试主张', summary: 'x', reporter: '测试', priority: '低' })
s().addFact(claim.id, '事实一')
const fid = s().claims.find((c) => c.id === claim.id)!.facts[0].id
const src = s().registerSource({ title: '测试来源', url: 'https://a.b/c', publisher: '测试机构', publishedAt: '2026-10-01', kind: '原始证据', chainOfCustody: '留存', contentHash: 'sha256:t' })
s().linkSource(claim.id, fid, src.id, '支持')
s().updateFact(claim.id, fid, { conclusion: '已证实', unresolved: [] })
s().reconfirmFact(claim.id, fid)
const vNow = s().claims.find((c) => c.id === claim.id)!.version
const win = s().submitBatch(claim.id, { note: '先到批次', baseClaimVersion: vNow, submittedBy: '窗口A' })
check('先到批次放行', win.ok, win)
const late = s().submitBatch(claim.id, { note: '晚到批次', baseClaimVersion: vNow, submittedBy: '窗口B' })
check('晚到批次被拦截', !late.ok, late)
const conflict = s().conflicts[0]
check('冲突保留输入与双方值', conflict.input.note === '晚到批次' && conflict.expectedVersion === vNow && conflict.actualVersion === vNow && Boolean(conflict.winningBatchId), conflict)
const stale = s().submitBatch(claim.id, { note: '过期基准', baseClaimVersion: 1, submittedBy: '窗口C' })
check('过期基准同样拦截', !stale.ok)

console.log('5. 发布批次：冻结快照放行')
const queued = s().batches.find((b) => b.claimId === claim.id && b.status === '排队中')!
check('快照已冻结', queued.snapshot.length === 1 && queued.snapshot[0].version === 1)
const pub = s().publishBatch(queued.id, '宋卓')
check('放行成功', pub.ok, pub)
check('主张已发布', s().claims.find((c) => c.id === claim.id)!.status === '已发布')
check('版本记录带批次号', s().versions.some((v) => v.batchId === queued.id))

console.log('6. 已发布结论不受来源变化影响')
s().reviseSource(src.id, { contentHash: 'sha256:t2', note: '发布后改版' })
check('已发布事实保持有效', s().claims.find((c) => c.id === claim.id)!.facts[0].verification === '有效')

console.log('7. 写入失败恢复：只补未完成对象')
const claim2 = s().addClaim({ title: '恢复测试', summary: 'y', reporter: '测试', priority: '低' })
s().addFact(claim2.id, '事实')
const fid2 = s().claims.find((c) => c.id === claim2.id)!.facts[0].id
const src2 = s().registerSource({ title: '来源2', url: 'https://a.b/d', publisher: 'p', publishedAt: '2026-10-01', kind: '原始证据', chainOfCustody: 'c', contentHash: 'sha256:u' })
s().linkSource(claim2.id, fid2, src2.id, '支持')
s().updateFact(claim2.id, fid2, { conclusion: '已证实', unresolved: [] })
s().reconfirmFact(claim2.id, fid2)
const v2 = s().claims.find((c) => c.id === claim2.id)!.version
const auditBefore = s().audit.length
armCrashSimulation()
const crashed = s().submitBatch(claim2.id, { note: '会中断的批次', baseClaimVersion: v2, submittedBy: '窗口A' })
check('写入失败被报告', !crashed.ok, crashed)
check('状态未部分写入', !s().batches.some((b) => b.claimId === claim2.id))
const recovered = s().recoverFromJournal()
check('恢复补齐对象', recovered > 0 && s().batches.some((b) => b.claimId === claim2.id && b.status === '排队中'), recovered)
const again = s().recoverFromJournal()
check('重复恢复不再追加', again === 0 && s().audit.filter((a) => a.action === '本地写入恢复').length === 1)
check('审计未重复追加提交记录', s().audit.filter((a) => a.action === '提交发布批次' && a.claimId === claim2.id).length === 1, s().audit.length - auditBefore)

console.log('8. 旧数据迁移：内嵌来源入库补版本，无法确认依赖先待核')
const legacy = {
  claims: [{ id: 'FC-OLD', title: '旧主张', summary: '', reporter: 'r', editor: 'e', status: '核查中', priority: '中', createdAt: '2026-01-01', updatedAt: '2026-01-01', version: 1, facts: [
    { id: 'F-O1', text: '可确认', conclusion: '已证实', confidence: 90, unresolved: [], sources: [{ id: 'S-O1', title: '旧来源', url: 'https://old/x', publisher: 'p', publishedAt: '2025-01-01', capturedAt: '2025-01-02', kind: '原始证据', chainOfCustody: 'c', contentHash: 'sha256:o', version: 2 }], counterSources: [], annotations: [] },
    { id: 'F-O2', text: '依赖待证信息', conclusion: '证据不足', confidence: 40, unresolved: ['x'], sources: [{ id: 'S-O2', title: '网传截图', url: '', publisher: 'p', publishedAt: '', capturedAt: '2025-01-02', kind: '待证信息', chainOfCustody: 'c', contentHash: '', version: 1 }], counterSources: [], annotations: [] }
  ] }],
  versions: [], audit: []
}
const migrated = migrateLegacyState(legacy) as { claims: { facts: { id: string; verification: string; sourceRefs: { sourceId: string; linkedVersion: number }[] }[] }[]; sources: { id: string; version: number; history: unknown[] }[]; audit: { action: string }[] }
check('内嵌来源迁入共享库', migrated.sources.length === 2)
check('版本补登', migrated.sources.find((x) => x.id === migrated.claims[0].facts[0].sourceRefs[0].sourceId)?.version === 2 && migrated.sources.every((x) => x.history.length === 1))
check('可确认事实为有效', migrated.claims[0].facts[0].verification === '有效')
check('无法确认依赖的事实待核', migrated.claims[0].facts[1].verification === '待核')
check('迁移写入审计', migrated.audit[0].action === '旧数据迁移')

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
}

void main()
