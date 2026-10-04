import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge, Box, Button, Divider, Flex, FormControl, FormLabel, Grid, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Select, Tab, TabList, TabPanel, TabPanels, Tabs, Text, Textarea, useDisclosure, useToast } from '@chakra-ui/react'
import { EvidenceGraph } from '../components/EvidenceGraph'
import { conclusionColor, reviewStateColor, sourceStatusColor, useClaimStore } from '../store/useClaimStore'
import type { Claim, ClaimFact, EvidenceKind, FactConclusion, SharedSource, SourceLink, SourceRole } from '../types'

const CURRENT_USER = '陆衡'

export function ClaimWorkspace() {
  const { id } = useParams()
  const toast = useToast()
  const state = useClaimStore()
  const claim = state.claims.find((item) => item.id === id)
  const [selectedFactId, setSelectedFactId] = useState(claim?.facts[0]?.id ?? '')
  const selectedFact = claim?.facts.find((item) => item.id === selectedFactId) ?? claim?.facts[0]
  const [factText, setFactText] = useState('')
  const linkModal = useDisclosure()
  const transitionModal = useDisclosure()
  const [linkRole, setLinkRole] = useState<SourceRole>('支持')
  const [linkMode, setLinkMode] = useState<'existing' | 'new'>('existing')
  const [pickedSourceId, setPickedSourceId] = useState('')
  const [sourceForm, setSourceForm] = useState({ title: '', url: '', publisher: '', publishedAt: '2026-10-04', kind: '原始证据' as EvidenceKind, chainOfCustody: '', contentHash: '' })
  const [transitionNote, setTransitionNote] = useState('')
  const [reconfirmNote, setReconfirmNote] = useState('')
  useEffect(() => { if (!selectedFactId && claim?.facts[0]) setSelectedFactId(claim.facts[0].id) }, [selectedFactId, claim])
  if (!claim) return <Box p="10">未找到核查主张</Box>
  const sourceById = (sourceId: string) => state.sources.find((item) => item.id === sourceId)
  const setFact = (patch: Partial<ClaimFact>) => { if (selectedFact) state.updateFact(claim.id, selectedFact.id, patch) }
  const openLink = (role: SourceRole) => { setLinkRole(role); setLinkMode(state.sources.length ? 'existing' : 'new'); setPickedSourceId(state.sources[0]?.id ?? ''); linkModal.onOpen() }
  const submitLink = () => {
    if (!selectedFact) return
    let sourceId = pickedSourceId
    if (linkMode === 'new') {
      if (!sourceForm.title || !sourceForm.url) return
      sourceId = state.registerSource(sourceForm).id
    }
    if (!sourceId) return
    state.linkSource(claim.id, selectedFact.id, sourceId, linkRole, CURRENT_USER)
    linkModal.onClose()
    toast({ title: linkRole === '反驳' ? '相反证据已保留' : '来源已关联到事实', status: 'success' })
  }
  const transition = (status: Claim['status']) => {
    const result = state.transitionClaim(claim.id, status, transitionNote || `由${claim.status}流转至${status}`)
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
    if (result.ok) transitionModal.onClose()
  }
  const queue = () => {
    const result = state.queuePublish(claim.id, transitionNote || '编辑复核通过，排队发布', claim.editor || CURRENT_USER)
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
    if (result.ok) transitionModal.onClose()
  }
  const exportArchive = () => {
    const versions = state.versions.filter((item) => item.claimId === claim.id)
    const audit = state.audit.filter((item) => item.claimId === claim.id)
    const batches = state.batches.filter((item) => item.claimId === claim.id)
    const sourceIds = new Set(claim.facts.flatMap((fact) => fact.links.map((link) => link.sourceId)))
    const sources = state.sources.filter((item) => sourceIds.has(item.id))
    const blob = new Blob([JSON.stringify({ claim, sources, batches, versions, audit }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${claim.id}-核查档案.json`; anchor.click(); URL.revokeObjectURL(url)
  }
  return <Box p="6" pb="16">
    <Flex justify="space-between" align="flex-start" mb="4">
      <Box>
        <HStack fontSize="xs" color="gray.600"><Text>{claim.id} · {claim.reporter} / {claim.editor} · V{claim.version}</Text><Badge colorScheme={claim.status === '已发布' ? 'green' : claim.status === '排队发布' ? 'blue' : 'orange'}>{claim.status}</Badge></HStack>
        <Text fontSize="xl" fontWeight="700" mt="1">{claim.title}</Text>
        <Text color="gray.600" fontSize="sm" mt="2" maxW="760px">{claim.summary}</Text>
      </Box>
      <Flex gap="2"><Button variant="outline" onClick={exportArchive}>导出档案</Button><Button colorScheme="teal" onClick={transitionModal.onOpen}>状态与发布</Button></Flex>
    </Flex>
    <EvidenceGraph facts={claim.facts} />
    <Grid mt="4" templateColumns="320px 1fr" gap="4" alignItems="start">
      <Box bg="white" borderWidth="1px" p="3">
        <Flex justify="space-between" align="center" mb="3"><Text fontWeight="700">可验证事实树</Text><Badge>{claim.facts.length}</Badge></Flex>
        {claim.facts.map((fact) => <Box key={fact.id} as="button" textAlign="left" w="100%" p="3" mb="2" borderWidth="1px" borderColor={fact.id === selectedFact?.id ? 'teal.600' : 'gray.200'} bg={fact.id === selectedFact?.id ? 'teal.50' : 'white'} onClick={() => setSelectedFactId(fact.id)}>
          <Flex justify="space-between" gap="2"><Text fontSize="xs" color="gray.500">{fact.id}</Text><HStack spacing="1">{fact.reviewState !== '有效' && <Badge colorScheme={reviewStateColor[fact.reviewState]}>{fact.reviewState}</Badge>}<Badge colorScheme={conclusionColor[fact.conclusion]}>{fact.conclusion}</Badge></HStack></Flex>
          <Text fontSize="sm" mt="2" fontWeight="600">{fact.text}</Text>
          <Text fontSize="xs" color="gray.500" mt="2">置信度 {fact.confidence}% · 疑点 {fact.unresolved.length} · 来源 {fact.links.length}</Text>
        </Box>)}
        <Flex mt="3" gap="2"><Input size="sm" placeholder="拆出新的可验证事实" value={factText} onChange={(event) => setFactText(event.target.value)} /><Button size="sm" colorScheme="teal" onClick={() => { state.addFact(claim.id, factText); setFactText('') }}>添加</Button></Flex>
      </Box>
      {selectedFact && <Box bg="white" borderWidth="1px" p="4">
        <Flex justify="space-between" align="flex-start"><Box><Text fontSize="xs" color="gray.500">{selectedFact.id}</Text><Text fontWeight="700" mt="1">{selectedFact.text}</Text></Box><Badge colorScheme={conclusionColor[selectedFact.conclusion]}>{selectedFact.conclusion}</Badge></Flex>
        {selectedFact.reviewState !== '有效' && <Box mt="3" p="3" borderWidth="1px" borderColor="orange.300" bg="orange.50">
          <Flex justify="space-between" align="center">
            <Box>
              <Badge colorScheme={reviewStateColor[selectedFact.reviewState]}>{selectedFact.reviewState}</Badge>
              <Text fontSize="xs" color="gray.600" mt="2">
                {selectedFact.reviewState === '待重认'
                  ? `依赖来源已变化（${selectedFact.invalidatedBy.map((sid) => sourceById(sid)?.versions.at(-1)?.title ?? sid).join('、') || '未知来源'}），结论失效待重认`
                  : '迁移时依赖来源无法确认，结论先待核，确认后重认'}
              </Text>
            </Box>
            <HStack><Input size="sm" placeholder="重认说明" value={reconfirmNote} onChange={(event) => setReconfirmNote(event.target.value)} /><Button size="sm" colorScheme="orange" onClick={() => { state.reconfirmFact(claim.id, selectedFact.id, reconfirmNote); setReconfirmNote(''); toast({ title: '结论已重认为有效', status: 'success' }) }}>复核重认</Button></HStack>
          </Flex>
        </Box>}
        <Grid templateColumns="1fr 1fr 1fr" gap="3" mt="4">
          <FormControl><FormLabel fontSize="xs">事实结论</FormLabel><Select size="sm" value={selectedFact.conclusion} onChange={(event) => setFact({ conclusion: event.target.value as FactConclusion })}>{['已证实', '部分属实', '证据不足', '不实'].map((value) => <option key={value}>{value}</option>)}</Select></FormControl>
          <FormControl><FormLabel fontSize="xs">置信程度 {selectedFact.confidence}%</FormLabel><Input size="sm" type="range" min="0" max="100" value={selectedFact.confidence} onChange={(event) => setFact({ confidence: Number(event.target.value) })} /></FormControl>
          <FormControl><FormLabel fontSize="xs">未解决疑点</FormLabel><Input size="sm" value={selectedFact.unresolved.join('；')} onChange={(event) => setFact({ unresolved: event.target.value ? event.target.value.split('；') : [] })} /></FormControl>
        </Grid>
        <Tabs mt="5" colorScheme="teal">
          <TabList><Tab>证据链 {selectedFact.links.length}</Tab><Tab>批注 {selectedFact.annotations.length}</Tab><Tab>来源时间线</Tab></TabList>
          <TabPanels>
            <TabPanel px="0">
              <Grid templateColumns="1fr 1fr" gap="3">
                <LinkedSources title="支持证据" role="支持" fact={selectedFact} sourceById={sourceById} onAdd={() => openLink('支持')} />
                <LinkedSources title="相反证据" role="反驳" fact={selectedFact} sourceById={sourceById} onAdd={() => openLink('反驳')} counter />
              </Grid>
            </TabPanel>
            <TabPanel px="0"><AnnotationList fact={selectedFact} claimId={claim.id} /></TabPanel>
            <TabPanel px="0"><SourceTimeline fact={selectedFact} sourceById={sourceById} /></TabPanel>
          </TabPanels>
        </Tabs>
      </Box>}
    </Grid>
    <Modal isOpen={linkModal.isOpen} onClose={linkModal.onClose} size="xl">
      <ModalOverlay /><ModalContent>
        <ModalHeader>{linkRole === '反驳' ? '关联相反证据' : '关联支持来源'}</ModalHeader><ModalCloseButton />
        <ModalBody>
          <HStack mb="4">{(['existing', 'new'] as const).map((mode) => <Button key={mode} size="sm" variant={linkMode === mode ? 'solid' : 'outline'} colorScheme={linkMode === mode ? 'teal' : 'gray'} onClick={() => setLinkMode(mode)}>{mode === 'existing' ? '选择共享来源' : '登记新来源'}</Button>)}</HStack>
          {linkMode === 'existing' && <FormControl><FormLabel fontSize="sm">共享来源库</FormLabel><Select value={pickedSourceId} onChange={(event) => setPickedSourceId(event.target.value)}>{state.sources.map((source) => <option key={source.id} value={source.id}>{source.id} · {source.versions.find((item) => item.version === source.currentVersion)?.title}（V{source.currentVersion}·{source.status}）</option>)}</Select><Text fontSize="xs" color="gray.500" mt="2">一份来源可支持多项事实，引用时冻结当前版本快照。</Text></FormControl>}
          {linkMode === 'new' && <Grid templateColumns="1fr 1fr" gap="3">
            <FormControl><FormLabel fontSize="sm">来源标题</FormLabel><Input value={sourceForm.title} onChange={(event) => setSourceForm({ ...sourceForm, title: event.target.value })} /></FormControl>
            <FormControl><FormLabel fontSize="sm">公开地址</FormLabel><Input value={sourceForm.url} onChange={(event) => setSourceForm({ ...sourceForm, url: event.target.value })} /></FormControl>
            <FormControl><FormLabel fontSize="sm">发布机构</FormLabel><Input value={sourceForm.publisher} onChange={(event) => setSourceForm({ ...sourceForm, publisher: event.target.value })} /></FormControl>
            <FormControl><FormLabel fontSize="sm">证据类型</FormLabel><Select value={sourceForm.kind} onChange={(event) => setSourceForm({ ...sourceForm, kind: event.target.value as EvidenceKind })}>{['原始证据', '二次来源', '待证信息'].map((value) => <option key={value}>{value}</option>)}</Select></FormControl>
            <FormControl><FormLabel fontSize="sm">内容哈希</FormLabel><Input placeholder="sha256:..." value={sourceForm.contentHash} onChange={(event) => setSourceForm({ ...sourceForm, contentHash: event.target.value })} /></FormControl>
            <FormControl><FormLabel fontSize="sm">留档说明</FormLabel><Input value={sourceForm.chainOfCustody} onChange={(event) => setSourceForm({ ...sourceForm, chainOfCustody: event.target.value })} /></FormControl>
          </Grid>}
        </ModalBody>
        <ModalFooter><Button variant="ghost" mr="3" onClick={linkModal.onClose}>取消</Button><Button colorScheme={linkRole === '反驳' ? 'red' : 'teal'} isDisabled={linkMode === 'existing' ? !pickedSourceId : !sourceForm.title || !sourceForm.url} onClick={submitLink}>加入证据链</Button></ModalFooter>
      </ModalContent>
    </Modal>
    <Modal isOpen={transitionModal.isOpen} onClose={transitionModal.onClose}>
      <ModalOverlay /><ModalContent>
        <ModalHeader>状态流转与排队发布</ModalHeader><ModalCloseButton />
        <ModalBody>
          <FormControl mb="4"><FormLabel>流转 / 发布说明</FormLabel><Textarea rows={3} value={transitionNote} onChange={(event) => setTransitionNote(event.target.value)} /></FormControl>
          <Text fontSize="xs" color="gray.500">发布须先排队成批次并冻结来源快照；排队后来源变化会取消发布。</Text>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" mr="2" onClick={() => transition('核查中')}>退回核查</Button>
          <Button size="sm" mr="2" onClick={() => transition('待编辑复核')}>提交编辑复核</Button>
          <Button size="sm" mr="2" colorScheme="red" variant="outline" onClick={() => transition('已撤回')}>撤回</Button>
          <Button size="sm" colorScheme="teal" onClick={queue}>排队发布</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  </Box>
}

function LinkedSources({ title, role, fact, sourceById, onAdd, counter = false }: { title: string; role: SourceRole; fact: ClaimFact; sourceById: (id: string) => SharedSource | undefined; onAdd: () => void; counter?: boolean }) {
  const links = fact.links.filter((link) => link.role === role)
  return <Box borderWidth="1px" p="3">
    <Flex justify="space-between" mb="3"><Text fontSize="sm" fontWeight="600">{title}</Text><Button size="xs" colorScheme={counter ? 'red' : 'teal'} variant="outline" onClick={onAdd}>{counter ? '关联相反证据' : '关联支持来源'}</Button></Flex>
    {links.length === 0 && <Text fontSize="xs" color="gray.400">尚未关联来源</Text>}
    {links.map((link) => {
      const source = sourceById(link.sourceId)
      if (!source) return <Text key={link.sourceId} fontSize="xs" color="red.500">来源 {link.sourceId} 不在共享库中</Text>
      const current = source.versions.find((item) => item.version === source.currentVersion)
      const changed = link.snapshotVersion !== source.currentVersion
      return <Box key={`${link.sourceId}-${link.role}`} borderWidth="1px" borderColor={changed || source.status !== '有效' ? 'orange.300' : 'gray.200'} p="3" mb="2">
        <Flex justify="space-between" gap="2"><Text fontWeight="600" fontSize="sm">{current?.title}</Text><Badge colorScheme={sourceStatusColor[source.status]}>{source.status}</Badge></Flex>
        <Text fontSize="xs" color="gray.600" mt="1">{source.id} · {current?.publisher} · {current?.kind}</Text>
        <HStack mt="2" spacing="2">
          <Badge colorScheme={changed ? 'orange' : 'gray'}>引用快照V{link.snapshotVersion}</Badge>
          <Badge colorScheme={changed ? 'orange' : 'green'}>当前V{source.currentVersion}</Badge>
          {changed && <Text fontSize="xs" color="orange.600">来源已变化</Text>}
        </HStack>
        <Text fontFamily="mono" fontSize="xs" mt="2">{current?.contentHash || '（无内容哈希）'}</Text>
        <Divider my="2" />
        <Text fontSize="xs">{current?.chainOfCustody}</Text>
        <Text fontSize="xs" color="blue.600" mt="1" wordBreak="break-all">{current?.url}</Text>
      </Box>
    })}
  </Box>
}

function SourceTimeline({ fact, sourceById }: { fact: ClaimFact; sourceById: (id: string) => SharedSource | undefined }) {
  const entries = fact.links.flatMap((link) => {
    const source = sourceById(link.sourceId)
    if (!source) return []
    return source.versions.map((version) => ({ source, link, version }))
  }).sort((a, b) => a.version.recordedAt.localeCompare(b.version.recordedAt))
  if (!entries.length) return <Text fontSize="sm" color="gray.400">暂无来源记录</Text>
  return <Box borderLeftWidth="2px" borderColor="gray.300" pl="4">
    {entries.map(({ source, link, version }) => <Box key={`${source.id}-V${version.version}`} mb="4">
      <Text fontSize="xs" color="gray.500">{version.recordedAt.replace('T', ' ').slice(0, 16)} · {source.id} V{version.version}{version.confirmed ? '' : ' · 未留档'}</Text>
      <Text fontWeight="600" mt="1" fontSize="sm">{version.title}</Text>
      <Text fontSize="xs" color="gray.600">{version.changeNote} · 引用角色：{link.role}（快照V{link.snapshotVersion}）</Text>
    </Box>)}
  </Box>
}

function AnnotationList({ fact, claimId }: { fact: ClaimFact; claimId: string }) {
  const addAnnotation = useClaimStore((state) => state.addAnnotation)
  const resolve = useClaimStore((state) => state.resolveAnnotation)
  const [text, setText] = useState('')
  return <Box><Flex gap="2" mb="3"><Input placeholder="添加事实核查批注" value={text} onChange={(event) => setText(event.target.value)} /><Button onClick={() => { addAnnotation(claimId, fact.id, { author: CURRENT_USER, role: '事实核查员', content: text }); setText('') }}>添加</Button></Flex>{fact.annotations.map((item) => <Box key={item.id} borderLeftWidth="3px" borderColor={item.resolved ? 'green.400' : 'orange.400'} bg={item.resolved ? 'green.50' : 'orange.50'} p="3" mb="2"><Flex justify="space-between"><Text fontWeight="600" fontSize="sm">{item.role} {item.author}</Text><Button size="xs" variant="ghost" isDisabled={item.resolved} onClick={() => resolve(claimId, fact.id, item.id)}>{item.resolved ? '已解决' : '标记解决'}</Button></Flex><Text fontSize="sm" mt="2">{item.content}</Text><Text fontSize="xs" color="gray.500" mt="1">{item.createdAt.replace('T', ' ').slice(0, 16)}</Text></Box>)}</Box>
}
