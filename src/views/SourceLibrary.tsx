import { useState } from 'react'
import { Badge, Box, Button, Flex, FormControl, FormLabel, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Table, Tbody, Td, Text, Th, Thead, Tr, useDisclosure, useToast } from '@chakra-ui/react'
import { useClaimStore, verificationColor } from '../store/useClaimStore'
import type { SharedSource } from '../types'

export function SourceLibrary() {
  const state = useClaimStore()
  const toast = useToast()
  const reviseModal = useDisclosure()
  const detailModal = useDisclosure()
  const [target, setTarget] = useState<SharedSource | null>(null)
  const [reviseForm, setReviseForm] = useState({ contentHash: '', note: '' })

  const dependents = (sourceId: string) => state.claims.flatMap((claim) =>
    claim.facts.flatMap((fact) => fact.sourceRefs.filter((ref) => ref.sourceId === sourceId).map((ref) => ({ claim, fact, ref }))))

  const report = (result: { invalidated: number; cancelled: number }, action: string) => {
    toast({ title: `${action}：${result.invalidated} 项未发布结论失效待重认，${result.cancelled} 个排队批次取消发布`, status: result.invalidated + result.cancelled > 0 ? 'warning' : 'success' })
  }

  const openRevise = (source: SharedSource) => { setTarget(source); setReviseForm({ contentHash: '', note: '' }); reviseModal.onOpen() }
  const openDetail = (source: SharedSource) => { setTarget(source); detailModal.onOpen() }

  return <Box p="6" pb="16">
    <Box mb="5"><Text fontSize="xs" color="gray.600">共享证据链 / 采访材料复用</Text><Text fontSize="xl" fontWeight="700" mt="1">共享来源库</Text>
      <Text fontSize="sm" color="gray.600" mt="2">一个来源可支持多项事实；来源改版或撤下后，依赖它的未发布结论失效待重认，排队发布批次取消。</Text></Box>
    <Box bg="white" borderWidth="1px"><Table size="sm">
      <Thead><Tr><Th>来源</Th><Th>类型</Th><Th>版本</Th><Th>状态</Th><Th>被引用</Th><Th>内容哈希</Th><Th>操作</Th></Tr></Thead>
      <Tbody>{state.sources.map((source) => {
        const deps = dependents(source.id)
        const claimCount = new Set(deps.map((dep) => dep.claim.id)).size
        return <Tr key={source.id}>
          <Td><Text fontWeight="600">{source.title}</Text><Text fontSize="xs" color="gray.500">{source.publisher} · {source.publishedAt}</Text></Td>
          <Td><Badge colorScheme={source.kind === '原始证据' ? 'green' : source.kind === '二次来源' ? 'orange' : 'gray'}>{source.kind}</Badge></Td>
          <Td>V{source.version}</Td>
          <Td><Badge colorScheme={source.status === '有效' ? 'green' : source.status === '已改版' ? 'orange' : 'red'}>{source.status}</Badge></Td>
          <Td>{deps.length > 0 ? <Button size="xs" variant="link" onClick={() => openDetail(source)}>{deps.length} 项事实 · {claimCount} 条主张</Button> : <Text fontSize="xs" color="gray.400">未引用</Text>}</Td>
          <Td fontFamily="mono" fontSize="xs">{source.contentHash}</Td>
          <Td><Flex gap="1" wrap="wrap">
            <Button size="xs" variant="outline" onClick={() => { const note = window.prompt('改版说明', '页面内容已更新，等待重新留档'); if (note !== null) report(state.markSourceChanged(source.id, note), '已标记改版') }}>监测改版</Button>
            <Button size="xs" colorScheme="teal" variant="outline" onClick={() => openRevise(source)}>重新留档</Button>
            {source.status !== '已撤下'
              ? <Button size="xs" colorScheme="red" variant="outline" onClick={() => { const note = window.prompt('撤下说明', '来源方已撤下内容'); if (note !== null) report(state.retractSource(source.id, note), '已撤下') }}>撤下</Button>
              : <Button size="xs" colorScheme="green" variant="outline" onClick={() => state.restoreSource(source.id, '恢复上架')}>恢复</Button>}
          </Flex></Td>
        </Tr>
      })}</Tbody>
    </Table></Box>
    <Box mt="5" bg="white" borderWidth="1px" p="4"><Text fontWeight="700">版本履历</Text>
      {state.sources.flatMap((source) => source.history.map((rev) => ({ source, rev }))).sort((a, b) => b.rev.changedAt.localeCompare(a.rev.changedAt)).slice(0, 8).map(({ source, rev }) =>
        <Flex key={`${source.id}-${rev.version}`} mt="2" fontSize="sm" gap="3"><Text color="gray.500" fontSize="xs" w="130px">{rev.changedAt.replace('T', ' ').slice(0, 16)}</Text><Text fontWeight="600">{source.title}</Text><Badge>V{rev.version}</Badge><Text color="gray.600" fontSize="xs" alignSelf="center">{rev.note}</Text></Flex>)}
    </Box>
    <Modal isOpen={reviseModal.isOpen} onClose={reviseModal.onClose}><ModalOverlay /><ModalContent>
      <ModalHeader>重新留档：{target?.title}</ModalHeader><ModalCloseButton />
      <ModalBody>
        <Text fontSize="sm" color="gray.600" mb="3">当前 V{target?.version}，重新留档后版本+1；依赖该来源的未发布结论失效待重认，排队批次取消发布。</Text>
        <FormControl mb="3"><FormLabel>新内容哈希</FormLabel><Input placeholder="sha256:..." value={reviseForm.contentHash} onChange={(event) => setReviseForm({ ...reviseForm, contentHash: event.target.value })} /></FormControl>
        <FormControl><FormLabel>留档说明</FormLabel><Input value={reviseForm.note} onChange={(event) => setReviseForm({ ...reviseForm, note: event.target.value })} /></FormControl>
      </ModalBody>
      <ModalFooter><Button variant="ghost" mr="3" onClick={reviseModal.onClose}>取消</Button>
        <Button colorScheme="teal" isDisabled={!reviseForm.contentHash} onClick={() => { if (target) report(state.reviseSource(target.id, reviseForm), '已重新留档'); reviseModal.onClose() }}>登记改版</Button></ModalFooter>
    </ModalContent></Modal>
    <Modal isOpen={detailModal.isOpen} onClose={detailModal.onClose} size="xl"><ModalOverlay /><ModalContent>
      <ModalHeader>依赖关系：{target?.title}</ModalHeader><ModalCloseButton />
      <ModalBody pb="6">{target && dependents(target.id).map(({ claim, fact, ref }) =>
        <Flex key={`${fact.id}-${ref.stance}`} borderWidth="1px" p="3" mb="2" justify="space-between" align="center">
          <Box><Text fontSize="xs" color="gray.500">{claim.id} · {fact.id} · {ref.stance} · 关联时 V{ref.linkedVersion}</Text><Text fontSize="sm" fontWeight="600" mt="1">{fact.text}</Text></Box>
          <Flex gap="2" align="center"><Badge colorScheme={claim.status === '已发布' ? 'green' : 'gray'}>{claim.status}</Badge><Badge colorScheme={verificationColor[fact.verification]}>{fact.verification}</Badge></Flex>
        </Flex>)}</ModalBody>
    </ModalContent></Modal>
  </Box>
}
