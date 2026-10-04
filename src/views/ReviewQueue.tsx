import { Badge, Box, Button, Divider, Flex, Grid, HStack, Text, useToast } from '@chakra-ui/react'
import { preflightPublish } from '../services/api'
import { batchStatusColor, useClaimStore } from '../store/useClaimStore'
import type { PublishBatch } from '../types'

export function ReviewQueue() {
  const state = useClaimStore()
  const toast = useToast()
  const reviewClaims = state.claims.filter((claim) => claim.status === '待编辑复核')
  const batches = state.batches
  const interrupted = batches.filter((batch) => batch.status === '提交中')
  const claimOf = (claimId: string) => state.claims.find((item) => item.id === claimId)
  const commit = (batchId: string, simulateFailure = false) => {
    const result = state.commitBatch(batchId, { simulateFailure })
    toast({ title: result.message, status: result.ok ? 'success' : 'warning' })
  }
  const recover = () => {
    const count = state.recoverCommits()
    toast({ title: count ? `已从完整批次恢复${count}个中断提交` : '没有待恢复的提交', status: count ? 'success' : 'info' })
  }
  const queueAgain = (batch: PublishBatch) => {
    const result = state.queuePublish(batch.claimId, '第二窗口提交的发布申请', `${batch.editor}（窗口B）`)
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
  }
  const approve = (claimId: string, editor: string) => {
    const result = state.queuePublish(claimId, '编辑完成事实、来源与相反证据复核。', editor || '宋卓')
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
  }
  return <Box p="6" pb="16">
    <Box mb="5"><Text fontSize="xs" color="gray.600">编辑审阅 / 发布批次 / 冲突与恢复</Text><Text fontSize="xl" fontWeight="700" mt="1">复核与发布队列</Text></Box>
    {interrupted.length > 0 && <Flex mb="4" p="3" bg="yellow.50" borderWidth="1px" borderColor="yellow.400" justify="space-between" align="center">
      <Text fontSize="sm">检测到 {interrupted.length} 个本地写入中断的提交（{interrupted.map((batch) => batch.id).join('、')}），可从完整批次恢复，仅补写未完成对象。</Text>
      <Button size="sm" colorScheme="yellow" onClick={recover}>从完整批次恢复</Button>
    </Flex>}
    <Grid templateColumns="1fr 1fr" gap="4" alignItems="start">
      <Box>
        <Text fontWeight="700" mb="3">发布批次（{batches.length}）</Text>
        {batches.length === 0 && <Box bg="white" borderWidth="1px" p="4"><Text fontSize="sm" color="gray.400">暂无发布批次，请在主张工作台或右侧复核通过后排队发布。</Text></Box>}
        {batches.map((batch) => <BatchCard key={batch.id} batch={batch} claimTitle={claimOf(batch.claimId)?.title ?? batch.claimId} onCommit={commit} onCancel={() => state.cancelBatch(batch.id, '编辑取消排队')} onRecover={recover} onQueueAgain={queueAgain} />)}
      </Box>
      <Box>
        <Text fontWeight="700" mb="3">待编辑复核（{reviewClaims.length}）</Text>
        {reviewClaims.length === 0 && <Box bg="white" borderWidth="1px" p="4"><Text fontSize="sm" color="gray.400">暂无待复核主张</Text></Box>}
        {reviewClaims.map((claim) => {
          const preflight = preflightPublish(claim, state.sources)
          const unresolved = claim.facts.flatMap((fact) => fact.annotations.filter((note) => !note.resolved))
          return <Box key={claim.id} bg="white" borderWidth="1px" p="4" mb="3">
            <Flex justify="space-between"><Box><Text fontFamily="mono" fontSize="xs" color="gray.500">{claim.id}</Text><Text fontWeight="700" mt="1">{claim.title}</Text></Box><Badge colorScheme="orange">{claim.status}</Badge></Flex>
            <Flex mt="3" gap="4">
              <Box flex="1"><Text fontSize="sm" fontWeight="600">未解决批注 {unresolved.length}</Text>{unresolved.map((note) => <Box key={note.id} bg="orange.50" p="2" mt="2"><Text fontSize="xs" color="gray.500">{note.author}</Text><Text fontSize="sm">{note.content}</Text></Box>)}</Box>
              <Box flex="1"><Text fontSize="sm" fontWeight="600">发布校验 {preflight.allowed ? '通过' : `${preflight.blocking.length}项阻断`}</Text>{preflight.blocking.map((item) => <Box key={item} bg="red.50" p="2" mt="2"><Text fontSize="sm">{item}</Text></Box>)}</Box>
            </Flex>
            <Button mt="4" size="sm" colorScheme="teal" isDisabled={!preflight.allowed} onClick={() => approve(claim.id, claim.editor)}>{preflight.allowed ? '复核通过并排队发布' : '发布前校验未通过'}</Button>
          </Box>
        })}
      </Box>
    </Grid>
  </Box>
}

function BatchCard({ batch, claimTitle, onCommit, onCancel, onRecover, onQueueAgain }: {
  batch: PublishBatch
  claimTitle: string
  onCommit: (batchId: string, simulateFailure?: boolean) => void
  onCancel: () => void
  onRecover: () => void
  onQueueAgain: (batch: PublishBatch) => void
}) {
  const totalSteps = batch.plan ? 2 + batch.plan.objects.audit.length + 1 : 0
  return <Box bg="white" borderWidth="1px" p="4" mb="3">
    <Flex justify="space-between" align="flex-start">
      <Box>
        <HStack><Text fontFamily="mono" fontSize="xs" color="gray.500">{batch.id}</Text><Badge colorScheme={batchStatusColor[batch.status]}>{batch.status}</Badge></HStack>
        <Text fontWeight="700" mt="1">{claimTitle}</Text>
        <Text fontSize="xs" color="gray.500" mt="1">{batch.claimId} · 基于主张V{batch.claimVersion} · {batch.editor} · 排队 {batch.queuedAt.replace('T', ' ').slice(0, 16)}</Text>
      </Box>
      <Badge variant="outline">快照 {batch.snapshots.length}</Badge>
    </Flex>
    <Text fontSize="sm" color="gray.600" mt="2">{batch.note}</Text>
    {batch.status === '排队中' && <HStack mt="3">
      <Button size="sm" colorScheme="teal" onClick={() => onCommit(batch.id)}>提交发布</Button>
      <Button size="sm" variant="outline" onClick={() => onCommit(batch.id, true)}>模拟中断提交</Button>
      <Button size="sm" variant="outline" onClick={() => onQueueAgain(batch)}>以第二窗口排队同主张</Button>
      <Button size="sm" variant="ghost" colorScheme="red" onClick={onCancel}>取消</Button>
    </HStack>}
    {batch.status === '提交中' && <Flex mt="3" justify="space-between" align="center">
      <Text fontSize="sm" color="yellow.700">本地写入中断：已完成 {batch.plan?.completed.length ?? 0}/{totalSteps} 个对象</Text>
      <Button size="sm" colorScheme="yellow" onClick={onRecover}>从完整批次恢复</Button>
    </Flex>}
    {batch.status === '已取消' && <Text fontSize="sm" color="gray.500" mt="3">取消于 {batch.cancelledAt?.replace('T', ' ').slice(0, 16)}：{batch.cancelReason}</Text>}
    {batch.status === '已发布' && <Text fontSize="sm" color="green.600" mt="3">发布于 {batch.publishedAt?.replace('T', ' ').slice(0, 16)}</Text>}
    {batch.status === '冲突保留' && batch.conflict && <Box mt="3" borderWidth="1px" borderColor="red.300" bg="red.50" p="3">
      <Text fontSize="sm" fontWeight="600" color="red.700">晚到批次：已到批次 {batch.conflict.winningBatchId} 放行，本批次保留输入与双方值</Text>
      <Divider my="2" />
      <Text fontSize="xs" color="gray.600">保留输入</Text>
      <Text fontSize="sm">{batch.conflict.retainedInput.editor} · {batch.conflict.retainedInput.note || '（无说明）'} · 快照{batch.conflict.retainedInput.snapshots.length}项</Text>
      <HStack mt="2" align="flex-start" spacing="4">
        <Box flex="1"><Text fontSize="xs" color="gray.600">尝试写入</Text><Text fontSize="sm">主张V{batch.conflict.attempted.claimVersion} → {batch.conflict.attempted.targetStatus}</Text></Box>
        <Box flex="1"><Text fontSize="xs" color="gray.600">当前值</Text><Text fontSize="sm">主张V{batch.conflict.current.claimVersion} · {batch.conflict.current.status}{batch.conflict.current.batchId ? ` · ${batch.conflict.current.batchId}` : ''}</Text></Box>
      </HStack>
    </Box>}
  </Box>
}
