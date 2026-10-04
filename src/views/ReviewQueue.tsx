import { Badge, Box, Button, Flex, Text, useToast } from '@chakra-ui/react'
import { preflightPublish } from '../services/api'
import { useClaimStore, verificationColor } from '../store/useClaimStore'

export function ReviewQueue() {
  const state = useClaimStore()
  const toast = useToast()
  const queuedBatches = state.batches.filter((batch) => batch.status === '排队中')
  const reviewClaims = state.claims.filter((claim) => claim.status === '待编辑复核' || claim.facts.some((fact) => fact.annotations.some((note) => !note.resolved)))

  const publish = (batchId: string) => {
    const result = state.publishBatch(batchId, '宋卓')
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
  }

  return <Box p="6" pb="16">
    <Box mb="5"><Text fontSize="xs" color="gray.600">编辑审阅 / 批次放行 / 冲突处置</Text><Text fontSize="xl" fontWeight="700" mt="1">复核队列</Text></Box>

    <Text fontWeight="700" mb="3">排队发布批次 {queuedBatches.length > 0 && <Badge colorScheme="orange">{queuedBatches.length}</Badge>}</Text>
    <Flex direction="column" gap="3" mb="6">
      {queuedBatches.length === 0 && <Box bg="white" borderWidth="1px" p="4"><Text fontSize="sm" color="gray.500">暂无排队批次；在主张工作台提交发布批次后进入此处放行。</Text></Box>}
      {queuedBatches.map((batch) => {
        const claim = state.claims.find((item) => item.id === batch.claimId)
        const preflight = claim ? preflightPublish(claim, state.sources) : { allowed: false, blocking: ['主张不存在'] }
        return <Box key={batch.id} bg="white" borderWidth="1px" p="4">
          <Flex justify="space-between"><Box><Text fontFamily="mono" fontSize="xs" color="gray.500">{batch.id} · 基准V{batch.baseClaimVersion} · {batch.submittedBy} 提交于 {batch.createdAt.replace('T', ' ').slice(0, 16)}</Text><Text fontWeight="700" mt="1">{claim?.title ?? batch.claimId}</Text><Text fontSize="sm" color="gray.600" mt="1">{batch.note}</Text></Box><Badge colorScheme="orange" h="fit-content">{batch.status}</Badge></Flex>
          <Flex mt="3" gap="2" wrap="wrap">{batch.snapshot.map((snap) => <Badge key={snap.sourceId} variant="outline" colorScheme="teal">{snap.title} · V{snap.version}</Badge>)}</Flex>
          {preflight.blocking.length > 0 && <Box mt="3" bg="red.50" p="2">{preflight.blocking.map((item) => <Text key={item} fontSize="sm" color="red.700">· {item}</Text>)}</Box>}
          <Flex mt="4" gap="2">
            <Button size="sm" colorScheme="teal" isDisabled={!preflight.allowed} onClick={() => publish(batch.id)}>{preflight.allowed ? '按冻结快照放行发布' : '发布前校验未通过'}</Button>
            <Button size="sm" variant="outline" onClick={() => state.cancelBatch(batch.id, '编辑复核未通过')}>取消批次</Button>
          </Flex>
        </Box>
      })}
    </Flex>

    <Text fontWeight="700" mb="3">主张复核</Text>
    <Flex direction="column" gap="3" mb="6">{reviewClaims.map((claim) => {
      const unresolved = claim.facts.flatMap((fact) => fact.annotations.filter((note) => !note.resolved).map((note) => ({ fact, note })))
      const blocking = claim.facts.filter((fact) => fact.conclusion === '证据不足' && fact.unresolved.length)
      const pending = claim.facts.filter((fact) => fact.verification !== '有效')
      return <Box key={claim.id} bg="white" borderWidth="1px" p="4">
        <Flex justify="space-between"><Box><Text fontFamily="mono" fontSize="xs" color="gray.500">{claim.id}</Text><Text fontWeight="700" mt="1">{claim.title}</Text></Box><Badge colorScheme="orange">{claim.status}</Badge></Flex>
        <Flex mt="4" gap="4">
          <Box flex="1"><Text fontSize="sm" fontWeight="600">未解决批注 {unresolved.length}</Text>{unresolved.map(({ fact, note }) => <Box key={note.id} bg="orange.50" p="2" mt="2"><Text fontSize="xs" color="gray.500">{fact.id} · {note.author}</Text><Text fontSize="sm">{note.content}</Text></Box>)}</Box>
          <Box flex="1"><Text fontSize="sm" fontWeight="600">发布阻断 {blocking.length}</Text>{blocking.map((fact) => <Box key={fact.id} bg="red.50" p="2" mt="2"><Text fontSize="xs" color="gray.500">{fact.id}</Text><Text fontSize="sm">{fact.unresolved.join('；')}</Text></Box>)}</Box>
          <Box flex="1"><Text fontSize="sm" fontWeight="600">待重认 / 待核 {pending.length}</Text>{pending.map((fact) => <Flex key={fact.id} bg="orange.50" p="2" mt="2" justify="space-between" align="center"><Text fontSize="sm">{fact.id} {fact.text}</Text><Badge colorScheme={verificationColor[fact.verification]}>{fact.verification}</Badge></Flex>)}</Box>
        </Flex>
      </Box>
    })}</Flex>

    <Text fontWeight="700" mb="3">批次冲突记录 {state.conflicts.length > 0 && <Badge colorScheme="red">{state.conflicts.length}</Badge>}</Text>
    <Flex direction="column" gap="3">
      {state.conflicts.length === 0 && <Box bg="white" borderWidth="1px" p="4"><Text fontSize="sm" color="gray.500">暂无冲突；两个窗口同时提交同一主张时，晚到批次在此保留输入与双方值。</Text></Box>}
      {state.conflicts.map((conflict) => <Box key={conflict.id} bg="white" borderWidth="1px" borderLeftWidth="3px" borderLeftColor="red.400" p="4">
        <Flex justify="space-between"><Text fontFamily="mono" fontSize="xs" color="gray.500">{conflict.id} · {conflict.claimId} · {conflict.submittedBy} · {conflict.submittedAt.replace('T', ' ').slice(0, 16)}</Text>{conflict.winningBatchId && <Badge colorScheme="green">先到批次 {conflict.winningBatchId}</Badge>}</Flex>
        <Text fontSize="sm" mt="2">{conflict.reason}</Text>
        <Flex mt="2" gap="4" fontSize="sm"><Text>保留输入：{conflict.input.note || '（空）'}</Text><Text>双方值：提交基准 V{conflict.expectedVersion} / 当前 V{conflict.actualVersion}</Text></Flex>
      </Box>)}
    </Flex>
  </Box>
}
