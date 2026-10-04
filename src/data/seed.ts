import type { AuditEntry, BatchConflict, Claim, PublishBatch, SharedSource, VersionRecord } from '../types'

/** 共享来源库：一个来源可支持多项事实、多条主张 */
export const seedSources: SharedSource[] = [
  {
    id: 'SRC-1', title: '一期工程环境影响报告表', url: 'https://example.gov.cn/report/2025-1102', publisher: '市生态环境局', publishedAt: '2025-11-02', capturedAt: '2026-09-29T08:40:00',
    kind: '原始证据', chainOfCustody: '官网下载PDF，哈希时间戳已记录', contentHash: 'sha256:9d31f1...a42c', version: 1, status: '有效',
    history: [{ version: 1, contentHash: 'sha256:9d31f1...a42c', changedAt: '2026-09-29T08:40:00', note: '首次留档' }]
  },
  {
    id: 'SRC-2', title: '项目设备采购公告', url: 'https://example.com/tender/8821', publisher: '公共资源交易平台', publishedAt: '2026-01-18', capturedAt: '2026-09-29T08:52:00',
    kind: '原始证据', chainOfCustody: '官网页面快照与原始附件同时留存', contentHash: 'sha256:7bc029...de10', version: 2, status: '有效',
    history: [
      { version: 2, contentHash: 'sha256:7bc029...de10', changedAt: '2026-09-29T15:00:00', note: '平台替换附件为最终版，页面改版' },
      { version: 1, contentHash: 'sha256:51aa07...b9e3', changedAt: '2026-09-29T08:52:00', note: '首次留档' }
    ]
  },
  {
    id: 'SRC-3', title: '匿名用户上传的验收文件局部截图', url: 'https://social.example/post/9901', publisher: '社交平台账号', publishedAt: '2026-09-28', capturedAt: '2026-09-29T09:05:00',
    kind: '待证信息', chainOfCustody: '已保存原帖与图片EXIF，待向主管部门核验', contentHash: 'sha256:1fe210...67bd', version: 1, status: '有效',
    history: [{ version: 1, contentHash: 'sha256:1fe210...67bd', changedAt: '2026-09-29T09:05:00', note: '首次留档' }]
  },
  {
    id: 'SRC-4', title: '储能系统招标文件仍列出柴发切换接口', url: 'https://example.com/tender/9102', publisher: '公共资源交易平台', publishedAt: '2026-03-04', capturedAt: '2026-09-29T14:10:00',
    kind: '原始证据', chainOfCustody: '附件原文留存，相关条款见第42页', contentHash: 'sha256:c7249a...001f', version: 1, status: '有效',
    history: [{ version: 1, contentHash: 'sha256:c7249a...001f', changedAt: '2026-09-29T14:10:00', note: '首次留档' }]
  },
  {
    id: 'SRC-5', title: '设备厂商技术白皮书', url: 'https://vendor.example/white-paper', publisher: '设备厂商', publishedAt: '2026-05-12', capturedAt: '2026-09-29T11:10:00',
    kind: '二次来源', chainOfCustody: '厂商官网PDF留存', contentHash: 'sha256:6a8d22...41ee', version: 1, status: '有效',
    history: [{ version: 1, contentHash: 'sha256:6a8d22...41ee', changedAt: '2026-09-29T11:10:00', note: '首次留档' }]
  },
  {
    id: 'SRC-6', title: '市供水水质周报', url: 'https://example.gov.cn/water/0928', publisher: '市水务局', publishedAt: '2026-09-28', capturedAt: '2026-09-28T16:20:00',
    kind: '原始证据', chainOfCustody: '官网数据与PDF报告留存', contentHash: 'sha256:228a2...09cf', version: 1, status: '有效',
    history: [{ version: 1, contentHash: 'sha256:228a2...09cf', changedAt: '2026-09-28T16:20:00', note: '首次留档' }]
  },
  {
    id: 'SRC-7', title: '上游排口在线监测与执法巡查记录', url: 'https://example.gov.cn/env/0929', publisher: '市生态环境局', publishedAt: '2026-09-29', capturedAt: '2026-09-29T12:00:00',
    kind: '原始证据', chainOfCustody: '官方接口导出CSV，记录数据签名', contentHash: 'sha256:ab45d...9c31', version: 1, status: '有效',
    history: [{ version: 1, contentHash: 'sha256:ab45d...9c31', changedAt: '2026-09-29T12:00:00', note: '首次留档' }]
  },
  {
    id: 'SRC-8', title: '停水通知图片溯源核查记录', url: 'https://archive.example/trace/2024-771', publisher: '图片溯源平台', publishedAt: '2026-10-01', capturedAt: '2026-10-02T09:30:00',
    kind: '二次来源', chainOfCustody: '溯源比对报告与原始旧图同时留存', contentHash: 'sha256:e0531c...77aa', version: 1, status: '有效',
    history: [{ version: 1, contentHash: 'sha256:e0531c...77aa', changedAt: '2026-10-02T09:30:00', note: '首次留档' }]
  }
]

export const seedClaims: Claim[] = [
  {
    id: 'FC-260929-01', title: '某地新建数据中心停用全部柴油应急电源', summary: '社交平台流传项目验收文件截图，称数据中心取消柴油发电机改为纯储能供电。',
    reporter: '沈言', editor: '宋卓', status: '待编辑复核', priority: '高', createdAt: '2026-09-29T08:10:00', updatedAt: '2026-09-29T16:00:00', version: 4,
    facts: [
      {
        id: 'F-1', text: '项目规划文件中曾包含2台柴油发电机组。', conclusion: '已证实', confidence: 98, unresolved: [], verification: '有效',
        sourceRefs: [
          { sourceId: 'SRC-1', stance: '支持', linkedAt: '2026-09-29T08:40:00', linkedVersion: 1 },
          { sourceId: 'SRC-2', stance: '支持', linkedAt: '2026-09-29T15:05:00', linkedVersion: 2 }
        ],
        annotations: [{ id: 'N-1', author: '宋卓', role: '编辑', content: '请补充规划变更批复，不能用采购公告单独代表最终方案。', createdAt: '2026-09-29T10:20:00', resolved: false }]
      },
      {
        id: 'F-2', text: '最终验收已取消柴油应急电源。', conclusion: '证据不足', confidence: 42, unresolved: ['缺少竣工验收备案原件', '网传截图无文件编号与签章页'], verification: '待核',
        sourceRefs: [
          { sourceId: 'SRC-3', stance: '支持', linkedAt: '2026-09-29T09:05:00', linkedVersion: 1 },
          { sourceId: 'SRC-4', stance: '反驳', linkedAt: '2026-09-29T14:10:00', linkedVersion: 1 }
        ],
        annotations: [{ id: 'N-2', author: '陆衡', role: '事实核查员', content: '该结论不得以匿名截图单独成立，需取得主管部门书面确认。', createdAt: '2026-09-29T14:25:00', resolved: false }]
      },
      {
        id: 'F-3', text: '纯储能方案足以覆盖消防和一级负荷供电。', conclusion: '证据不足', confidence: 31, unresolved: ['缺少负荷计算书', '缺少消防验收文件'], verification: '有效',
        sourceRefs: [
          { sourceId: 'SRC-5', stance: '支持', linkedAt: '2026-09-29T11:10:00', linkedVersion: 1 },
          { sourceId: 'SRC-2', stance: '支持', linkedAt: '2026-09-29T15:05:00', linkedVersion: 2 }
        ],
        annotations: []
      }
    ]
  },
  {
    id: 'FC-260928-03', title: '城区供水异味来自河道藻类暴发', summary: '居民投诉自来水异味，网络传言指向上游工业排放，需核查水质报告与采样链。',
    reporter: '顾薇', editor: '宋卓', status: '核查中', priority: '中', createdAt: '2026-09-28T09:00:00', updatedAt: '2026-09-29T13:10:00', version: 2,
    facts: [
      { id: 'F-4', text: '多个采样点的2-甲基异莰醇检测值超过嗅阈值。', conclusion: '已证实', confidence: 93, unresolved: [], verification: '有效', sourceRefs: [{ sourceId: 'SRC-6', stance: '支持', linkedAt: '2026-09-28T16:20:00', linkedVersion: 1 }], annotations: [] },
      { id: 'F-5', text: '异味由上游企业偷排直接造成。', conclusion: '不实', confidence: 88, unresolved: [], verification: '有效', sourceRefs: [{ sourceId: 'SRC-7', stance: '反驳', linkedAt: '2026-09-29T12:00:00', linkedVersion: 1 }], annotations: [] }
    ]
  },
  {
    id: 'FC-261002-01', title: '网传城区将大面积停水三天', summary: '微信群流传"停水通知"图片，称城区将停水三天，需核查通知真伪与供水运行状态。',
    reporter: '顾薇', editor: '宋卓', status: '核查中', priority: '中', createdAt: '2026-10-02T09:00:00', updatedAt: '2026-10-02T10:20:00', version: 1,
    facts: [
      { id: 'F-6', text: '市水务局周报显示供水管网运行正常，无停水计划。', conclusion: '已证实', confidence: 95, unresolved: [], verification: '有效', sourceRefs: [{ sourceId: 'SRC-6', stance: '支持', linkedAt: '2026-10-02T09:40:00', linkedVersion: 1 }], annotations: [] },
      { id: 'F-7', text: '网传停水通知系2024年旧通知改图。', conclusion: '部分属实', confidence: 80, unresolved: ['改图原始出处待确认'], verification: '有效', sourceRefs: [{ sourceId: 'SRC-8', stance: '支持', linkedAt: '2026-10-02T09:30:00', linkedVersion: 1 }], annotations: [] }
    ]
  }
]

export const seedBatches: PublishBatch[] = [
  {
    id: 'B-1', claimId: 'FC-260929-01', status: '排队中', note: '首轮发布批次：3项事实与5条来源已核对', submittedBy: '沈言', createdAt: '2026-09-29T16:00:00', baseClaimVersion: 4,
    snapshot: [
      { sourceId: 'SRC-1', title: '一期工程环境影响报告表', version: 1, contentHash: 'sha256:9d31f1...a42c' },
      { sourceId: 'SRC-2', title: '项目设备采购公告', version: 2, contentHash: 'sha256:7bc029...de10' },
      { sourceId: 'SRC-3', title: '匿名用户上传的验收文件局部截图', version: 1, contentHash: 'sha256:1fe210...67bd' },
      { sourceId: 'SRC-4', title: '储能系统招标文件仍列出柴发切换接口', version: 1, contentHash: 'sha256:c7249a...001f' },
      { sourceId: 'SRC-5', title: '设备厂商技术白皮书', version: 1, contentHash: 'sha256:6a8d22...41ee' }
    ]
  },
  {
    id: 'B-2', claimId: 'FC-260929-01', status: '已取消', note: '预发布批次：等待编辑复核', submittedBy: '沈言', createdAt: '2026-09-29T12:00:00', baseClaimVersion: 3,
    snapshot: [
      { sourceId: 'SRC-1', title: '一期工程环境影响报告表', version: 1, contentHash: 'sha256:9d31f1...a42c' },
      { sourceId: 'SRC-2', title: '项目设备采购公告', version: 1, contentHash: 'sha256:51aa07...b9e3' }
    ],
    cancelledReason: '来源「项目设备采购公告」改版至 V2，冻结快照失效'
  }
]

export const seedConflicts: BatchConflict[] = [
  {
    id: 'BC-1', claimId: 'FC-260929-01', submittedAt: '2026-09-29T16:05:00', submittedBy: '宋卓',
    input: { note: '编辑侧同步提交的发布批次', baseClaimVersion: 4 },
    expectedVersion: 4, actualVersion: 4, winningBatchId: 'B-1', reason: '已存在先到排队批次 B-1，晚到批次被拦截'
  }
]

export const seedVersions: VersionRecord[] = [
  { id: 'V-1', claimId: 'FC-260929-01', version: 4, editor: '沈言', summary: '补充储能系统招标文件和相反证据，降低第二、第三项事实置信度。', changedFactIds: ['F-2', 'F-3'], removedEvidence: ['匿名聊天记录截图'], createdAt: '2026-09-29T15:30:00' },
  { id: 'V-2', claimId: 'FC-260929-01', version: 3, editor: '陆衡', summary: '补充匿名截图保管链和未解决疑点。', changedFactIds: ['F-2'], removedEvidence: [], createdAt: '2026-09-29T14:25:00' }
]

export const seedAudit: AuditEntry[] = [
  { id: 'A-1', claimId: 'FC-260929-01', action: '建立核查主张', operator: '沈言', detail: '创建3项可验证事实', createdAt: '2026-09-29T08:10:00' },
  { id: 'A-2', claimId: 'FC-260929-01', action: '关联共享来源', operator: '沈言', detail: '关联环评报告和设备采购公告', createdAt: '2026-09-29T08:55:00' },
  { id: 'A-3', claimId: 'FC-260929-01', action: '添加相反证据', operator: '陆衡', detail: '储能招标附件与纯储能结论冲突，保留争议', createdAt: '2026-09-29T14:10:00' },
  { id: 'A-4', claimId: 'FC-260929-01', action: '登记来源改版', operator: '陆衡', detail: '项目设备采购公告 V1→V2：平台替换附件为最终版', createdAt: '2026-09-29T15:00:00' },
  { id: 'A-5', claimId: 'FC-260929-01', action: '发布批次取消', operator: '系统', detail: '批次 B-2 冻结快照中的来源已改版，取消发布', createdAt: '2026-09-29T15:00:01' },
  { id: 'A-6', claimId: 'FC-260929-01', action: '提交发布批次', operator: '沈言', detail: '批次 B-1 冻结5条来源快照，进入排队', createdAt: '2026-09-29T16:00:00' },
  { id: 'A-7', claimId: 'FC-260929-01', action: '批次冲突拦截', operator: '系统', detail: '宋卓提交的批次晚于 B-1，保留输入与双方版本值', createdAt: '2026-09-29T16:05:00' }
]
