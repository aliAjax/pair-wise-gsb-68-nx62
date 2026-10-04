import { useState } from 'react'
import { Badge, Box, Button, Flex, Input, Table, Tbody, Td, Text, Th, Thead, Tr, useToast } from '@chakra-ui/react'
import { armCrashSimulation, readJournal } from '../services/journal'
import { useClaimStore } from '../store/useClaimStore'

export function AuditArchive() {
  const state = useClaimStore()
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const rows = state.audit.filter((item) => `${item.claimId} ${item.action} ${item.operator} ${item.detail}`.toLowerCase().includes(keyword.toLowerCase()))
  const exportAll = () => {
    const payload = { generatedAt: new Date().toISOString(), claims: state.claims, sources: state.sources, batches: state.batches, conflicts: state.conflicts, versions: state.versions, audit: state.audit }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = '事实核查档案与审计.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  const armCrash = () => {
    armCrashSimulation()
    toast({ title: '已布设写入中断：下一次复合提交（批次/来源改版）将在落盘前失败，刷新页面后自动从完整批次恢复', status: 'info', duration: 6000 })
  }
  const pendingJournal = readJournal().length
  return <Box p="6" pb="16">
    <Flex justify="space-between" align="center" mb="5"><Box><Text fontSize="xs" color="gray.600">主张 / 共享来源 / 发布批次 / 冲突 / 审计</Text><Text fontSize="xl" fontWeight="700" mt="1">核查档案与审计</Text></Box><Flex gap="2"><Button variant="outline" onClick={armCrash}>演练写入恢复</Button><Button colorScheme="teal" onClick={exportAll}>导出全部档案</Button></Flex></Flex>
    {pendingJournal > 0 && <Box bg="orange.50" borderWidth="1px" borderColor="orange.300" p="3" mb="4"><Text fontSize="sm">检测到 {pendingJournal} 笔未完成的完整批次，刷新页面后将自动恢复，仅补齐未完成对象。</Text></Box>}
    <Flex gap="3" mb="3"><Input maxW="460px" placeholder="搜索主张、动作、操作人或说明" value={keyword} onChange={(event) => setKeyword(event.target.value)} /><Text alignSelf="center" fontSize="xs" color="gray.500">共{rows.length}条不可变审计事件</Text></Flex>
    <Box bg="white" borderWidth="1px"><Table size="sm"><Thead><Tr><Th>时间</Th><Th>主张</Th><Th>动作</Th><Th>操作人</Th><Th>说明</Th></Tr></Thead><Tbody>{rows.map((item) => <Tr key={item.id}><Td fontSize="xs">{item.createdAt.replace('T', ' ').slice(0, 16)}</Td><Td fontFamily="mono" fontSize="xs">{item.claimId}</Td><Td><Badge colorScheme={item.action.includes('相反') || item.action.includes('撤下') ? 'red' : item.action.includes('发布') || item.action.includes('放行') ? 'green' : item.action.includes('恢复') || item.action.includes('迁移') ? 'purple' : 'blue'}>{item.action}</Badge></Td><Td>{item.operator}</Td><Td fontSize="sm">{item.detail}</Td></Tr>)}</Tbody></Table></Box>

    <Text fontWeight="700" mt="6" mb="3">发布批次</Text>
    <Box bg="white" borderWidth="1px"><Table size="sm"><Thead><Tr><Th>批次</Th><Th>主张</Th><Th>状态</Th><Th>提交人</Th><Th>冻结快照</Th><Th>说明</Th></Tr></Thead><Tbody>{state.batches.map((batch) => <Tr key={batch.id}><Td fontFamily="mono" fontSize="xs">{batch.id}</Td><Td fontFamily="mono" fontSize="xs">{batch.claimId}</Td><Td><Badge colorScheme={batch.status === '已发布' ? 'green' : batch.status === '排队中' ? 'orange' : 'red'}>{batch.status}</Badge></Td><Td>{batch.submittedBy}</Td><Td fontSize="xs">{batch.snapshot.map((snap) => `${snap.sourceId}V${snap.version}`).join('、')}</Td><Td fontSize="sm">{batch.cancelledReason ?? batch.note}</Td></Tr>)}</Tbody></Table></Box>

    <Text fontWeight="700" mt="6" mb="3">批次冲突（晚到批次保留输入与双方值）</Text>
    <Box bg="white" borderWidth="1px"><Table size="sm"><Thead><Tr><Th>时间</Th><Th>主张</Th><Th>提交人</Th><Th>保留输入</Th><Th>双方值</Th><Th>先到批次</Th></Tr></Thead><Tbody>{state.conflicts.map((conflict) => <Tr key={conflict.id}><Td fontSize="xs">{conflict.submittedAt.replace('T', ' ').slice(0, 16)}</Td><Td fontFamily="mono" fontSize="xs">{conflict.claimId}</Td><Td>{conflict.submittedBy}</Td><Td fontSize="sm">{conflict.input.note || '（空）'}</Td><Td fontSize="sm">基准V{conflict.expectedVersion} / 当前V{conflict.actualVersion}</Td><Td fontFamily="mono" fontSize="xs">{conflict.winningBatchId ?? '-'}</Td></Tr>)}</Tbody></Table></Box>

    <Box mt="5" bg="white" borderWidth="1px" p="4"><Text fontWeight="700">共享证据链原则</Text><Text fontSize="sm" color="gray.600" mt="2">来源集中于共享库，一个来源可支持多项事实；来源变化只让依赖它的未发布结论失效待重认，已发布结论保持冻结；发布批次冻结当时来源快照，来源随后变化即取消发布；本地写入失败后从完整批次恢复，只补未完成对象，不重复追加版本和审计。</Text></Box>
  </Box>
}
