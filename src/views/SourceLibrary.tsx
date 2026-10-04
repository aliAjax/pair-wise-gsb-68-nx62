import { useState } from 'react'
import { Badge, Box, Button, Divider, Flex, FormControl, FormLabel, Grid, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Text, Textarea, useDisclosure, useToast } from '@chakra-ui/react'
import { batchStatusColor, reviewStateColor, sourceStatusColor, useClaimStore } from '../store/useClaimStore'
import type { SharedSource } from '../types'

const OPERATOR = '陆衡'

export function SourceLibrary() {
  const state = useClaimStore()
  const toast = useToast()
  const [selectedId, setSelectedId] = useState(state.sources[0]?.id ?? '')
  const selected = state.sources.find((item) => item.id === selectedId) ?? state.sources[0]
  const reviseModal = useDisclosure()
  const retractModal = useDisclosure()
  const [reviseForm, setReviseForm] = useState({ title: '', url: '', contentHash: '', changeNote: '' })
  const [retractReason, setRetractReason] = useState('')
  const dependentsOf = (sourceId: string) => state.claims.flatMap((claim) =>
    claim.facts.filter((fact) => fact.links.some((link) => link.sourceId === sourceId)).map((fact) => ({ claim, fact }))
  )
  const batchesOf = (sourceId: string) => state.batches.filter((batch) => batch.snapshots.some((snap) => snap.sourceId === sourceId))
  const submitRevise = () => {
    if (!selected) return
    const result = state.reviseSource(selected.id, reviseForm, OPERATOR)
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
    if (result.ok) { reviseModal.onClose(); setReviseForm({ title: '', url: '', contentHash: '', changeNote: '' }) }
  }
  const submitRetract = () => {
    if (!selected) return
    const result = state.retractSource(selected.id, retractReason, OPERATOR)
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
    if (result.ok) { retractModal.onClose(); setRetractReason('') }
  }
  return <Box p="6" pb="16">
    <Box mb="5"><Text fontSize="xs" color="gray.600">共享证据链 / 一处留档多处引用</Text><Text fontSize="xl" fontWeight="700" mt="1">共享来源库</Text></Box>
    <Grid templateColumns="360px 1fr" gap="4" alignItems="start">
      <Box bg="white" borderWidth="1px" p="3">
        <Flex justify="space-between" align="center" mb="3"><Text fontWeight="700">来源记录</Text><Badge>{state.sources.length}</Badge></Flex>
        {state.sources.map((source) => {
          const current = source.versions.find((item) => item.version === source.currentVersion)
          return <Box key={source.id} as="button" textAlign="left" w="100%" p="3" mb="2" borderWidth="1px" borderColor={source.id === selected?.id ? 'teal.600' : 'gray.200'} bg={source.id === selected?.id ? 'teal.50' : 'white'} onClick={() => setSelectedId(source.id)}>
            <Flex justify="space-between" gap="2"><Text fontSize="xs" color="gray.500">{source.id}</Text><Badge colorScheme={sourceStatusColor[source.status]}>{source.status}</Badge></Flex>
            <Text fontSize="sm" fontWeight="600" mt="1">{current?.title}</Text>
            <Text fontSize="xs" color="gray.500" mt="1">V{source.currentVersion} · {current?.publisher} · 被 {dependentsOf(source.id).length} 项事实引用</Text>
          </Box>
        })}
      </Box>
      {selected && <SourceDetail
        source={selected}
        dependents={dependentsOf(selected.id)}
        batches={batchesOf(selected.id)}
        onRevise={() => { setReviseForm({ title: '', url: '', contentHash: '', changeNote: '' }); reviseModal.onOpen() }}
        onRetract={() => { setRetractReason(''); retractModal.onOpen() }}
      />}
    </Grid>
    <Modal isOpen={reviseModal.isOpen} onClose={reviseModal.onClose} size="lg">
      <ModalOverlay /><ModalContent>
        <ModalHeader>登记来源改版</ModalHeader><ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="gray.600" mb="4">登记新版本后，依赖该来源的未发布结论失效待重认；排队与已发布批次取消发布。</Text>
          <FormControl mb="3"><FormLabel fontSize="sm">新标题（留空沿用）</FormLabel><Input value={reviseForm.title} onChange={(event) => setReviseForm({ ...reviseForm, title: event.target.value })} /></FormControl>
          <FormControl mb="3"><FormLabel fontSize="sm">新地址（留空沿用）</FormLabel><Input value={reviseForm.url} onChange={(event) => setReviseForm({ ...reviseForm, url: event.target.value })} /></FormControl>
          <FormControl mb="3"><FormLabel fontSize="sm">新内容哈希</FormLabel><Input placeholder="sha256:..." value={reviseForm.contentHash} onChange={(event) => setReviseForm({ ...reviseForm, contentHash: event.target.value })} /></FormControl>
          <FormControl><FormLabel fontSize="sm">改版说明</FormLabel><Textarea rows={2} value={reviseForm.changeNote} onChange={(event) => setReviseForm({ ...reviseForm, changeNote: event.target.value })} /></FormControl>
        </ModalBody>
        <ModalFooter><Button variant="ghost" mr="3" onClick={reviseModal.onClose}>取消</Button><Button colorScheme="teal" isDisabled={!reviseForm.contentHash} onClick={submitRevise}>登记新版本并传播</Button></ModalFooter>
      </ModalContent>
    </Modal>
    <Modal isOpen={retractModal.isOpen} onClose={retractModal.onClose}>
      <ModalOverlay /><ModalContent>
        <ModalHeader>标记来源撤下</ModalHeader><ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="gray.600" mb="4">撤下同样触发结论失效与批次取消发布，且该来源不能再用于发布。</Text>
          <FormControl><FormLabel fontSize="sm">撤下原因</FormLabel><Textarea rows={3} value={retractReason} onChange={(event) => setRetractReason(event.target.value)} /></FormControl>
        </ModalBody>
        <ModalFooter><Button variant="ghost" mr="3" onClick={retractModal.onClose}>取消</Button><Button colorScheme="red" onClick={submitRetract}>确认撤下</Button></ModalFooter>
      </ModalContent>
    </Modal>
  </Box>
}

function SourceDetail({ source, dependents, batches, onRevise, onRetract }: {
  source: SharedSource
  dependents: { claim: { id: string; title: string; status: string }; fact: { id: string; text: string; reviewState: '有效' | '待重认' | '待核' } }[]
  batches: { id: string; claimId: string; status: '排队中' | '提交中' | '已发布' | '已取消' | '冲突保留'; queuedAt: string }[]
  onRevise: () => void
  onRetract: () => void
}) {
  const current = source.versions.find((item) => item.version === source.currentVersion)
  return <Box bg="white" borderWidth="1px" p="4">
    <Flex justify="space-between" align="flex-start">
      <Box>
        <HStack><Text fontFamily="mono" fontSize="xs" color="gray.500">{source.id}</Text><Badge colorScheme={sourceStatusColor[source.status]}>{source.status}</Badge><Badge>当前V{source.currentVersion}</Badge></HStack>
        <Text fontSize="lg" fontWeight="700" mt="1">{current?.title}</Text>
        <Text fontSize="sm" color="gray.600" mt="1">{current?.publisher} · {current?.kind} · 留档 {current?.capturedAt.replace('T', ' ').slice(0, 16)}</Text>
        <Text fontFamily="mono" fontSize="xs" color="gray.500" mt="1">{current?.contentHash || '（无内容哈希）'}</Text>
      </Box>
      <HStack><Button size="sm" colorScheme="teal" variant="outline" onClick={onRevise}>登记改版</Button><Button size="sm" colorScheme="red" variant="outline" onClick={onRetract}>标记撤下</Button></HStack>
    </Flex>
    <Divider my="4" />
    <Grid templateColumns="1fr 1fr" gap="4">
      <Box>
        <Text fontWeight="700" mb="2">版本留档（{source.versions.length}）</Text>
        <Box borderLeftWidth="2px" borderColor="gray.300" pl="3">
          {[...source.versions].sort((a, b) => b.version - a.version).map((version) => <Box key={version.version} mb="3">
            <HStack><Badge colorScheme={version.confirmed ? 'green' : 'gray'}>V{version.version}</Badge><Text fontSize="xs" color="gray.500">{version.recordedAt.replace('T', ' ').slice(0, 16)}</Text>{!version.confirmed && <Badge colorScheme="purple">未留档</Badge>}</HStack>
            <Text fontSize="sm" fontWeight="600" mt="1">{version.title}</Text>
            <Text fontSize="xs" color="gray.600">{version.changeNote}</Text>
            <Text fontFamily="mono" fontSize="xs" color="gray.400">{version.contentHash || '（无哈希留档）'}</Text>
          </Box>)}
        </Box>
      </Box>
      <Box>
        <Text fontWeight="700" mb="2">依赖事实（{dependents.length}）</Text>
        {dependents.length === 0 && <Text fontSize="sm" color="gray.400">暂无事实引用</Text>}
        {dependents.map(({ claim, fact }) => <Box key={`${claim.id}-${fact.id}`} borderWidth="1px" p="2" mb="2">
          <Flex justify="space-between" gap="2"><Text fontSize="xs" color="gray.500">{claim.id} · {claim.status}</Text><Badge colorScheme={reviewStateColor[fact.reviewState]}>{fact.reviewState}</Badge></Flex>
          <Text fontSize="sm" mt="1">{fact.id} {fact.text}</Text>
        </Box>)}
        <Text fontWeight="700" mt="4" mb="2">相关发布批次（{batches.length}）</Text>
        {batches.length === 0 && <Text fontSize="sm" color="gray.400">暂无批次引用</Text>}
        {batches.map((batch) => <Flex key={batch.id} justify="space-between" borderWidth="1px" p="2" mb="2"><Text fontSize="sm">{batch.id} · {batch.claimId}</Text><Badge colorScheme={batchStatusColor[batch.status]}>{batch.status}</Badge></Flex>)}
      </Box>
    </Grid>
  </Box>
}
