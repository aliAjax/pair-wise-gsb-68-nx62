import { useState } from 'react'
import { Badge, Box, Button, Flex, Input, Table, Tbody, Td, Text, Th, Thead, Tr } from '@chakra-ui/react'
import { batchStatusColor, useClaimStore } from '../store/useClaimStore'

export function AuditArchive() {
  const state = useClaimStore()
  const [keyword, setKeyword] = useState('')
  const rows = state.audit.filter((item) => `${item.claimId} ${item.action} ${item.operator} ${item.detail}`.toLowerCase().includes(keyword.toLowerCase()))
  const exportAll = () => {
    const payload = { generatedAt: new Date().toISOString(), claims: state.claims, sources: state.sources, batches: state.batches, versions: state.versions, audit: state.audit }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = '事实核查档案与审计.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <Box p="6" pb="16">
    <Flex justify="space-between" align="center" mb="5"><Box><Text fontSize="xs" color="gray.600">主张 / 共享来源 / 发布批次 / 审计事件</Text><Text fontSize="xl" fontWeight="700" mt="1">核查档案与审计</Text></Box><Button colorScheme="teal" onClick={exportAll}>导出全部档案</Button></Flex>
    <Flex gap="3" mb="3"><Input maxW="460px" placeholder="搜索主张、动作、操作人或说明" value={keyword} onChange={(event) => setKeyword(event.target.value)} /><Text alignSelf="center" fontSize="xs" color="gray.500">共{rows.length}条不可变审计事件 · 共享来源{state.sources.length}份 · 发布批次{state.batches.length}个</Text></Flex>
    <Box bg="white" borderWidth="1px"><Table size="sm"><Thead><Tr><Th>时间</Th><Th>对象</Th><Th>动作</Th><Th>操作人</Th><Th>说明</Th></Tr></Thead><Tbody>{rows.map((item) => <Tr key={item.id}><Td fontSize="xs">{item.createdAt.replace('T', ' ').slice(0, 16)}</Td><Td fontFamily="mono" fontSize="xs">{item.claimId}</Td><Td><Badge colorScheme={item.action.includes('相反') || item.action.includes('冲突') ? 'red' : item.action.includes('发布') ? 'green' : item.action.includes('迁移') || item.action.includes('待核') ? 'purple' : 'blue'}>{item.action}</Badge></Td><Td>{item.operator}</Td><Td fontSize="sm">{item.detail}</Td></Tr>)}</Tbody></Table></Box>
    <Box mt="5" bg="white" borderWidth="1px" p="4">
      <Text fontWeight="700" mb="3">发布批次留档</Text>
      <Table size="sm"><Thead><Tr><Th>批次</Th><Th>主张</Th><Th>状态</Th><Th>冻结快照</Th><Th>排队时间</Th><Th>结果</Th></Tr></Thead><Tbody>
        {state.batches.map((batch) => <Tr key={batch.id}>
          <Td fontFamily="mono" fontSize="xs">{batch.id}</Td>
          <Td fontFamily="mono" fontSize="xs">{batch.claimId}</Td>
          <Td><Badge colorScheme={batchStatusColor[batch.status]}>{batch.status}</Badge></Td>
          <Td fontSize="xs">{batch.snapshots.map((snap) => `${snap.sourceId}@V${snap.version}`).join('、')}</Td>
          <Td fontSize="xs">{batch.queuedAt.replace('T', ' ').slice(0, 16)}</Td>
          <Td fontSize="xs">{batch.publishedAt ? `发布于${batch.publishedAt.replace('T', ' ').slice(0, 16)}` : batch.cancelReason ?? (batch.conflict ? `冲突保留，先到批次${batch.conflict.winningBatchId}` : '—')}</Td>
        </Tr>)}
        {state.batches.length === 0 && <Tr><Td colSpan={6}><Text fontSize="sm" color="gray.400">暂无发布批次</Text></Td></Tr>}
      </Tbody></Table>
    </Box>
    <Box mt="5" bg="white" borderWidth="1px" p="4"><Text fontWeight="700">版本差异原则</Text><Text fontSize="sm" color="gray.600" mt="2">被替换证据仍保留在共享来源版本记录中；发布批次冻结当时来源快照，来源随后变化即取消发布；发布版本不能隐藏相反证据、删除原始来源或覆盖既有批注。</Text></Box>
  </Box>
}
