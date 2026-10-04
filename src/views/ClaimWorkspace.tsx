import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge, Box, Button, Divider, Flex, FormControl, FormLabel, Grid, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Select, Tab, TabList, TabPanel, TabPanels, Tabs, Text, Textarea, useDisclosure, useToast } from '@chakra-ui/react'
import { EvidenceGraph } from '../components/EvidenceGraph'
import { conclusionColor, useClaimStore, verificationColor } from '../store/useClaimStore'
import type { ClaimFact, EvidenceKind, FactConclusion, FactSourceLink, SharedSource } from '../types'

export function ClaimWorkspace() {
  const { id } = useParams()
  const toast = useToast()
  const state = useClaimStore()
  const claim = state.claims.find((item) => item.id === id)
  const [selectedFactId, setSelectedFactId] = useState(claim?.facts[0]?.id ?? '')
  const selectedFact = claim?.facts.find((item) => item.id === selectedFactId) ?? claim?.facts[0]
  const [factText, setFactText] = useState('')
  const sourceModal = useDisclosure()
  const versionModal = useDisclosure()
  const [sourceMode, setSourceMode] = useState<'pick' | 'new'>('pick')
  const [pickedSourceId, setPickedSourceId] = useState('')
  const [sourceForm, setSourceForm] = useState({ title: '', url: '', publisher: '', publishedAt: '2026-10-04', kind: '原始证据' as EvidenceKind, chainOfCustody: '', contentHash: '' })
  const [counterSource, setCounterSource] = useState(false)
  const [transitionNote, setTransitionNote] = useState('')
  const [baseVersion, setBaseVersion] = useState(0)
  useEffect(() => { if (!selectedFactId && claim?.facts[0]) setSelectedFactId(claim.facts[0].id) }, [selectedFactId, claim])
  if (!claim) return <Box p="10">未找到核查主张</Box>

  const sourceById = (sourceId: string) => state.sources.find((item) => item.id === sourceId)
  const setFact = (patch: Partial<ClaimFact>) => { if (selectedFact) state.updateFact(claim.id, selectedFact.id, patch) }
  const stance = (list: FactSourceLink[], value: '支持' | '反驳') => list.filter((ref) => ref.stance === value)

  const addSource = () => {
    if (!selectedFact) return
    const stanceValue = counterSource ? '反驳' : '支持'
    if (sourceMode === 'pick') {
      if (!pickedSourceId) return
      const result = state.linkSource(claim.id, selectedFact.id, pickedSourceId, stanceValue)
      toast({ title: result.message, status: result.ok ? 'success' : 'error' })
      if (!result.ok) return
    } else {
      if (!sourceForm.title || !sourceForm.url) return
      const source = state.registerSource({ ...sourceForm })
      state.linkSource(claim.id, selectedFact.id, source.id, stanceValue)
      toast({ title: '新来源已登记并接入证据链', status: 'success' })
    }
    sourceModal.onClose()
  }

  const openVersionModal = () => { setBaseVersion(claim.version); versionModal.onOpen() }
  const submitBatch = () => {
    const result = state.submitBatch(claim.id, { note: transitionNote, baseClaimVersion: baseVersion, submittedBy: '陆衡' })
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
    if (result.ok) { setTransitionNote(''); versionModal.onClose() }
  }
  const transition = (status: typeof claim.status) => {
    const result = state.transitionClaim(claim.id, status, transitionNote || `由${claim.status}流转至${status}`)
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
    if (result.ok) versionModal.onClose()
  }
  const reconfirm = () => {
    if (!selectedFact) return
    const result = state.reconfirmFact(claim.id, selectedFact.id)
    toast({ title: result.message, status: result.ok ? 'success' : 'error' })
  }
  const exportArchive = () => {
    const versions = state.versions.filter((item) => item.claimId === claim.id)
    const audit = state.audit.filter((item) => item.claimId === claim.id)
    const batches = state.batches.filter((item) => item.claimId === claim.id)
    const sources = state.sources.filter((source) => claim.facts.some((fact) => fact.sourceRefs.some((ref) => ref.sourceId === source.id)))
    const blob = new Blob([JSON.stringify({ claim, sources, batches, versions, audit }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${claim.id}-核查档案.json`; anchor.click(); URL.revokeObjectURL(url)
  }
  const claimBatches = state.batches.filter((item) => item.claimId === claim.id)

  return <Box p="6" pb="16">
    <Flex justify="space-between" align="flex-start" mb="4"><Box><Text fontSize="xs" color="gray.600">{claim.id} · {claim.reporter} / {claim.editor} · V{claim.version}</Text><Text fontSize="xl" fontWeight="700" mt="1">{claim.title}</Text><Text color="gray.600" fontSize="sm" mt="2" maxW="760px">{claim.summary}</Text></Box><Flex gap="2"><Button variant="outline" onClick={exportArchive}>导出档案</Button><Button colorScheme="teal" onClick={openVersionModal}>状态与发布批次</Button></Flex></Flex>
    {claimBatches.length > 0 && <Flex gap="2" mb="4" wrap="wrap">{claimBatches.map((batch) => <Badge key={batch.id} colorScheme={batch.status === '已发布' ? 'green' : batch.status === '排队中' ? 'orange' : 'red'} variant="subtle" p="2">批次 {batch.id} · {batch.status} · 快照 {batch.snapshot.length} 条{batch.cancelledReason ? ` · ${batch.cancelledReason}` : ''}</Badge>)}</Flex>}
    <EvidenceGraph facts={claim.facts} />
    <Grid mt="4" templateColumns="320px 1fr" gap="4" alignItems="start">
      <Box bg="white" borderWidth="1px" p="3">
        <Flex justify="space-between" align="center" mb="3"><Text fontWeight="700">可验证事实树</Text><Badge>{claim.facts.length}</Badge></Flex>
        {claim.facts.map((fact) => <Box key={fact.id} as="button" textAlign="left" w="100%" p="3" mb="2" borderWidth="1px" borderColor={fact.id === selectedFact?.id ? 'teal.600' : 'gray.200'} bg={fact.id === selectedFact?.id ? 'teal.50' : 'white'} onClick={() => setSelectedFactId(fact.id)}><Flex justify="space-between"><Text fontSize="xs" color="gray.500">{fact.id}</Text><Flex gap="1"><Badge colorScheme={verificationColor[fact.verification]}>{fact.verification}</Badge><Badge colorScheme={conclusionColor[fact.conclusion]}>{fact.conclusion}</Badge></Flex></Flex><Text fontSize="sm" mt="2" fontWeight="600">{fact.text}</Text><Text fontSize="xs" color="gray.500" mt="2">置信度 {fact.confidence}% · 疑点 {fact.unresolved.length} · 来源 {fact.sourceRefs.length}</Text></Box>)}
        <Flex mt="3" gap="2"><Input size="sm" placeholder="拆出新的可验证事实" value={factText} onChange={(event) => setFactText(event.target.value)} /><Button size="sm" colorScheme="teal" onClick={() => { state.addFact(claim.id, factText); setFactText('') }}>添加</Button></Flex>
      </Box>
      {selectedFact && <Box bg="white" borderWidth="1px" p="4">
        <Flex justify="space-between" align="flex-start"><Box><Text fontSize="xs" color="gray.500">{selectedFact.id}</Text><Text fontWeight="700" mt="1">{selectedFact.text}</Text></Box><Flex gap="2" align="center"><Badge colorScheme={verificationColor[selectedFact.verification]}>{selectedFact.verification}</Badge><Badge colorScheme={conclusionColor[selectedFact.conclusion]}>{selectedFact.conclusion}</Badge>{selectedFact.verification !== '有效' && <Button size="xs" colorScheme="orange" onClick={reconfirm}>按当前来源重认结论</Button>}</Flex></Flex>
        {selectedFact.verification !== '有效' && <Text fontSize="xs" color="orange.600" mt="2">依赖来源已变化或迁移后依赖未确认，结论失效待重认；重认前不能进入发布。</Text>}
        <Grid templateColumns="1fr 1fr 1fr" gap="3" mt="4">
          <FormControl><FormLabel fontSize="xs">事实结论</FormLabel><Select size="sm" value={selectedFact.conclusion} onChange={(event) => setFact({ conclusion: event.target.value as FactConclusion })}>{['已证实', '部分属实', '证据不足', '不实'].map((value) => <option key={value}>{value}</option>)}</Select></FormControl>
          <FormControl><FormLabel fontSize="xs">置信程度 {selectedFact.confidence}%</FormLabel><Input size="sm" type="range" min="0" max="100" value={selectedFact.confidence} onChange={(event) => setFact({ confidence: Number(event.target.value) })} /></FormControl>
          <FormControl><FormLabel fontSize="xs">未解决疑点</FormLabel><Input size="sm" value={selectedFact.unresolved.join('；')} onChange={(event) => setFact({ unresolved: event.target.value ? event.target.value.split('；') : [] })} /></FormControl>
        </Grid>
        <Tabs mt="5" colorScheme="teal">
          <TabList><Tab>支持证据 {stance(selectedFact.sourceRefs, '支持').length}</Tab><Tab>相反证据 {stance(selectedFact.sourceRefs, '反驳').length}</Tab><Tab>批注 {selectedFact.annotations.length}</Tab><Tab>来源时间线</Tab></TabList>
          <TabPanels>
            <TabPanel px="0"><EvidenceList refs={stance(selectedFact.sourceRefs, '支持')} sourceById={sourceById} onAdd={() => { setCounterSource(false); setSourceMode('pick'); setPickedSourceId(''); sourceModal.onOpen() }} /></TabPanel>
            <TabPanel px="0"><EvidenceList refs={stance(selectedFact.sourceRefs, '反驳')} sourceById={sourceById} onAdd={() => { setCounterSource(true); setSourceMode('pick'); setPickedSourceId(''); sourceModal.onOpen() }} counter /></TabPanel>
            <TabPanel px="0"><AnnotationList fact={selectedFact} claimId={claim.id} /></TabPanel>
            <TabPanel px="0"><Box borderLeftWidth="2px" borderColor="gray.300" pl="4">{selectedFact.sourceRefs.map((ref) => ({ ref, source: sourceById(ref.sourceId) })).filter((item): item is { ref: FactSourceLink; source: SharedSource } => Boolean(item.source)).sort((a, b) => a.source.publishedAt.localeCompare(b.source.publishedAt)).map(({ ref, source }) => <Box key={`${ref.sourceId}-${ref.stance}`} mb="4"><Text fontSize="xs" color="gray.500">{source.publishedAt} · {source.kind} · {ref.stance}</Text><Text fontWeight="600" mt="1">{source.title}</Text><Text fontSize="sm" color="gray.600">{source.publisher} · 留档 {source.capturedAt.replace('T', ' ').slice(0, 16)} · 关联V{ref.linkedVersion} / 当前V{source.version}</Text></Box>)}</Box></TabPanel>
          </TabPanels>
        </Tabs>
      </Box>}
    </Grid>
    <Modal isOpen={sourceModal.isOpen} onClose={sourceModal.onClose} size="xl"><ModalOverlay /><ModalContent><ModalHeader>{counterSource ? '关联相反证据' : '关联支持证据'}</ModalHeader><ModalCloseButton /><ModalBody>
      <Flex gap="2" mb="4"><Button size="sm" variant={sourceMode === 'pick' ? 'solid' : 'outline'} colorScheme="teal" onClick={() => setSourceMode('pick')}>从共享来源库选择</Button><Button size="sm" variant={sourceMode === 'new' ? 'solid' : 'outline'} colorScheme="teal" onClick={() => setSourceMode('new')}>登记新来源</Button></Flex>
      {sourceMode === 'pick' ? <FormControl><FormLabel>共享来源（一个来源可支持多项事实）</FormLabel><Select placeholder="选择来源" value={pickedSourceId} onChange={(event) => setPickedSourceId(event.target.value)}>{state.sources.map((source) => <option key={source.id} value={source.id}>{source.title} · {source.publisher} · V{source.version} · {source.status}</option>)}</Select></FormControl>
        : <Grid templateColumns="1fr 1fr" gap="3"><FormControl><FormLabel>来源标题</FormLabel><Input value={sourceForm.title} onChange={(event) => setSourceForm({ ...sourceForm, title: event.target.value })} /></FormControl><FormControl><FormLabel>公开地址</FormLabel><Input value={sourceForm.url} onChange={(event) => setSourceForm({ ...sourceForm, url: event.target.value })} /></FormControl><FormControl><FormLabel>发布机构</FormLabel><Input value={sourceForm.publisher} onChange={(event) => setSourceForm({ ...sourceForm, publisher: event.target.value })} /></FormControl><FormControl><FormLabel>证据类型</FormLabel><Select value={sourceForm.kind} onChange={(event) => setSourceForm({ ...sourceForm, kind: event.target.value as EvidenceKind })}>{['原始证据', '二次来源', '待证信息'].map((value) => <option key={value}>{value}</option>)}</Select></FormControl><FormControl><FormLabel>内容哈希</FormLabel><Input placeholder="sha256:..." value={sourceForm.contentHash} onChange={(event) => setSourceForm({ ...sourceForm, contentHash: event.target.value })} /></FormControl><FormControl><FormLabel>留档说明</FormLabel><Input value={sourceForm.chainOfCustody} onChange={(event) => setSourceForm({ ...sourceForm, chainOfCustody: event.target.value })} /></FormControl></Grid>}
    </ModalBody><ModalFooter><Button variant="ghost" mr="3" onClick={sourceModal.onClose}>取消</Button><Button colorScheme="teal" isDisabled={sourceMode === 'pick' ? !pickedSourceId : !sourceForm.title || !sourceForm.url} onClick={addSource}>接入共享证据链</Button></ModalFooter></ModalContent></Modal>
    <Modal isOpen={versionModal.isOpen} onClose={versionModal.onClose}><ModalOverlay /><ModalContent><ModalHeader>状态流转与发布批次</ModalHeader><ModalCloseButton /><ModalBody>
      <FormControl mb="4"><FormLabel>说明</FormLabel><Textarea rows={3} value={transitionNote} onChange={(event) => setTransitionNote(event.target.value)} /></FormControl>
      <Text fontSize="xs" color="gray.500" mb="3">提交发布批次将冻结当前 {claim.facts.flatMap((fact) => fact.sourceRefs).length} 条来源引用快照（基准版本 V{baseVersion}）；两个窗口同时提交时只放行先到批次。发布需经编辑复核队列放行。</Text>
      {claimBatches.length > 0 && <Box borderTopWidth="1px" pt="3">{claimBatches.map((batch) => <Flex key={batch.id} justify="space-between" fontSize="xs" mb="2"><Text>批次 {batch.id} · 基准V{batch.baseClaimVersion} · 快照{batch.snapshot.length}条</Text><Badge colorScheme={batch.status === '已发布' ? 'green' : batch.status === '排队中' ? 'orange' : 'red'}>{batch.status}</Badge></Flex>)}</Box>}
    </ModalBody><ModalFooter><Button mr="2" onClick={() => transition('待编辑复核')}>提交编辑复核</Button><Button mr="2" variant="outline" onClick={() => transition('已撤回')}>撤回</Button><Button colorScheme="teal" onClick={submitBatch}>提交发布批次</Button></ModalFooter></ModalContent></Modal>
  </Box>
}

function EvidenceList({ refs, sourceById, onAdd, counter = false }: { refs: FactSourceLink[]; sourceById: (id: string) => SharedSource | undefined; onAdd: () => void; counter?: boolean }) {
  return <Box><Flex justify="space-between" mb="3"><Text fontSize="sm" color="gray.600">{counter ? '相反证据与支持证据并列保留' : '按原始证据、二次来源、待证信息分类'}</Text><Button size="sm" colorScheme={counter ? 'red' : 'teal'} variant="outline" onClick={onAdd}>{counter ? '关联相反证据' : '关联支持证据'}</Button></Flex>
    {refs.map((ref) => {
      const source = sourceById(ref.sourceId)
      if (!source) return <Box key={ref.sourceId} borderWidth="1px" p="3" mb="2"><Text fontSize="sm" color="red.600">来源 {ref.sourceId} 不在共享库中</Text></Box>
      const drifted = source.version !== ref.linkedVersion || source.status !== '有效'
      return <Box key={`${ref.sourceId}-${ref.stance}`} borderWidth="1px" borderColor={drifted ? 'orange.400' : 'gray.200'} p="3" mb="2">
        <Flex justify="space-between"><Text fontWeight="600">{source.title}</Text><Flex gap="1"><Badge colorScheme={source.status === '有效' ? 'green' : source.status === '已改版' ? 'orange' : 'red'}>{source.status}</Badge><Badge colorScheme={source.kind === '原始证据' ? 'green' : source.kind === '二次来源' ? 'orange' : 'gray'}>{source.kind}</Badge></Flex></Flex>
        <Text fontSize="xs" color="gray.600" mt="2">{source.publisher} · {source.publishedAt} · 关联V{ref.linkedVersion} / 当前V{source.version}</Text>
        {drifted && <Text fontSize="xs" color="orange.600" mt="1">来源在关联后已变化，结论待重认</Text>}
        <Text fontFamily="mono" fontSize="xs" mt="2">{source.contentHash}</Text>
        <Divider my="2" /><Text fontSize="xs">{source.chainOfCustody}</Text><Text fontSize="xs" color="blue.600" mt="1" wordBreak="break-all">{source.url}</Text>
      </Box>
    })}
  </Box>
}

function AnnotationList({ fact, claimId }: { fact: ClaimFact; claimId: string }) {
  const addAnnotation = useClaimStore((state) => state.addAnnotation)
  const resolve = useClaimStore((state) => state.resolveAnnotation)
  const [text, setText] = useState('')
  return <Box><Flex gap="2" mb="3"><Input placeholder="添加事实核查批注" value={text} onChange={(event) => setText(event.target.value)} /><Button onClick={() => { addAnnotation(claimId, fact.id, { author: '陆衡', role: '事实核查员', content: text }); setText('') }}>添加</Button></Flex>{fact.annotations.map((item) => <Box key={item.id} borderLeftWidth="3px" borderColor={item.resolved ? 'green.400' : 'orange.400'} bg={item.resolved ? 'green.50' : 'orange.50'} p="3" mb="2"><Flex justify="space-between"><Text fontWeight="600" fontSize="sm">{item.role} {item.author}</Text><Button size="xs" variant="ghost" isDisabled={item.resolved} onClick={() => resolve(claimId, fact.id, item.id)}>{item.resolved ? '已解决' : '标记解决'}</Button></Flex><Text fontSize="sm" mt="2">{item.content}</Text><Text fontSize="xs" color="gray.500" mt="1">{item.createdAt.replace('T', ' ').slice(0, 16)}</Text></Box>)}</Box>
}
