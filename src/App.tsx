import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import './App.css'
import {
  ApiError,
  type IntegrationEvent,
  fetchSheetsExportPreview,
  fetchSlackExportPreview,
  fetchAdminSession,
  fetchBootstrap,
  fetchLeadTimeline,
  fetchQueue,
  fetchReportsOverview,
  fetchSyncDiff,
  fetchSyncStatus,
  loginAdmin,
  logNote as logNoteRequest,
  logoutAdmin,
  pingConnector as pingConnectorRequest,
  resetRuntimeState,
  pullSync,
  retryDelivery as retryDeliveryRequest,
  pushSync,
  sendSheetsExport,
  sendSlackExport,
  runBookingUpdate as runBookingUpdateRequest,
  runDmIntake as runDmIntakeRequest,
  runLeadAction,
  runLiveTest as runLiveTestRequest,
  runOnboardingProvision as runOnboardingProvisionRequest,
  runStripePayment as runStripePaymentRequest,
  reconcileSync,
  validateWebhook as validateWebhookRequest,
} from './api'
import {
  automationRules,
  automationConnectors,
  capiEvents,
  demoScenarios,
  operatorToolTemplates,
  repoModules,
} from './data'
import { getRecoveryDisplayModel } from './recoveryDisplay'
import type {
  Booking,
  Conversation,
  FunnelStage,
  Lead,
  OnboardingRun,
  OperatorToolTemplate,
} from './types'
import type {
  RecoveryEscalationTone,
  RecoveryRailCardTone,
  RecoveryStatusTone,
} from './recoveryDisplay'

type ScenarioRuntime = {
  stepLabels: string[]
  leadStages: FunnelStage[]
  bookingStatuses: string[]
  visibleMessageCount: number[]
  visibleEventIds: string[][]
  payloads: object[]
  metricLabel: string
  metricValues: string[]
}

type RuleDraft = {
  id: string
  trigger: string
  condition: string
  actions: string[]
  enabled: boolean
}

type RuleTestResult = {
  status: 'pass' | 'fail' | 'skipped'
  detail: string
  timestamp: string
}

type WebhookEvent = {
  id: string
  label: string
  payload: string
}

type OperatorNote = {
  id: string
  note: string
  timestamp: string
  scenarioId: string
  stepLabel: string
}

type LiveTestRun = {
  id: string
  scenarioId: string
  scenarioTitle: string
  stepLabel: string
  payloadLabel: string
  connector: string
  status: 'accepted' | 'rejected'
  resultMessage: string
  payload: string
  createdAt: string
}

type EnrichedLiveTestRun = LiveTestRun & {
  leadId?: string
}

type WebhookValidation =
  | { ok: true; parsed: Record<string, unknown>; label: string }
  | { ok: false; message: string }

type ConnectorStatus = 'ready' | 'syncing' | 'attention'

type ConnectorState = {
  status: ConnectorStatus
  lastPing: string
  runs: number
  note: string
}

type AuditKind = 'webhook' | 'rule' | 'connector' | 'note' | 'scenario'

type IntegrationInboxKind = 'delivery' | 'audit' | 'test' | 'webhook' | 'booking' | 'onboarding'
type IntegrationInboxStatus = DeliveryStatus | 'processed' | 'warning'
type LifecyclePhase = 'intake' | 'booking' | 'payment' | 'onboarding' | 'alert' | 'routing'

type IntegrationInboxEntry = {
  id: string
  kind: IntegrationInboxKind
  source: string
  target: string
  summary: string
  status: IntegrationInboxStatus
  timestamp: string
  leadId?: string
  effect?: string
}

type LifecycleStageProfile = {
  phases: LifecyclePhase[]
  max: number
}

type AuditEvent = {
  id: string
  kind: AuditKind
  title: string
  detail: string
  target: string
  timestamp: string
}

type DeliveryStatus = 'queued' | 'processing' | 'delivered' | 'failed'

type DeliveryItem = {
  id: string
  connector: string
  channel: string
  target: string
  payloadLabel: string
  status: DeliveryStatus
  lastAttempt: string
  note: string
}

type QueueLead = {
  id: string
  handle: string
  name: string
  owner: string
  stage: FunnelStage
  lane: string
  priorityScore: number
  priorityBand: string
  nextAction: string
  conversationScore: number
  bookingStatus: string | null
  latestDeliveryStatus: string | null
  recommendedAction: string
  tags: string[]
  source: string
  offer: string
}

type RecoveryEscalationSignal = {
  id: string
  title: string
  detail: string
  timestamp: string
  kind: 'booking' | 'delivery' | 'audit' | 'unknown'
}

type RoutingDecision = {
  owner: string
  lane: string
  ruleLabel: string
  note: string
}

type LeadLookup = {
  byId: Map<string, string>
  byHandle: Map<string, string>
  byName: Map<string, string>
}

type LeadTimelineEntry = {
  id: string
  type: string
  timestamp: string
  title: string
  detail: string
}

type ReportsOverview = {
  queueSummary: {
    total: number
    critical: number
    hot: number
    recovery: number
  }
  outboxSummary: {
    total: number
    queued: number
    processing: number
    delivered: number
    failed: number
  }
  laneBreakdown: Record<string, number>
  sourceBreakdown: Record<string, number>
  connectors: Array<{
    name: string
    status: string
    runs: number
    lastPing: string
    queued: number
    processing: number
    delivered: number
    note: string
  }>
  onboarding: {
    total: number
    completed: number
  }
}

type WorkbenchTab = 'funnel' | 'recovery' | 'payload'

type RailTab = 'inbox' | 'operations' | 'audit' | 'automation' | 'metrics' | 'tools'
type AuthStatus = 'checking' | 'authenticated' | 'auth_required'
type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'degraded'

type InterviewGuideStep = {
  id: string
  title: string
  skill: string
  detail: string
  railTab: RailTab
  workbenchTab: WorkbenchTab
  leadId: string
  scenarioId: string
}

function isLocalDemoHost() {
  if (typeof window === 'undefined') {
    return false
  }

  if (import.meta.env.DEV) {
    return true
  }

  const hostname = window.location.hostname.toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

const deliveryStatusPriority: Record<DeliveryStatus, number> = {
  failed: 0,
  queued: 1,
  processing: 2,
  delivered: 3,
}

function parseMoneyValue(raw: string) {
  const compact = raw.toLowerCase().replace(/[^0-9.k]/g, '')
  if (!compact) {
    return 0
  }

  if (compact.includes('k')) {
    return Number.parseFloat(compact.replace('k', '')) * 1000
  }

  return Number.parseFloat(compact)
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const candidate = value.trim()
  return candidate ? candidate : undefined
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function parseJsonObject(raw: string) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function getLeadLookup(leads: Lead[]) {
  const byId = new Map<string, string>()
  const byHandle = new Map<string, string>()
  const byName = new Map<string, string>()

  leads.forEach((lead) => {
    const id = asString(lead.id)?.toLowerCase()
    const handle = asString(lead.handle)?.toLowerCase()
    const name = asString(lead.name)?.toLowerCase()

    if (id) {
      byId.set(id, lead.id)
    }
    if (handle) {
      byHandle.set(handle, lead.id)
    }
    if (name) {
      byName.set(name, lead.id)
    }
  })

  return { byId, byHandle, byName }
}

function resolveLeadIdFromToken(token: string | undefined, lookup: LeadLookup): string | undefined {
  const normalized = asString(token)?.toLowerCase()
  if (!normalized) {
    return undefined
  }

  if (lookup.byId.has(normalized)) {
    return lookup.byId.get(normalized)
  }

  if (lookup.byHandle.has(normalized)) {
    return lookup.byHandle.get(normalized)
  }

  const normalizedHandle = normalized.startsWith('@') ? normalized : `@${normalized}`
  if (lookup.byHandle.has(normalizedHandle)) {
    return lookup.byHandle.get(normalizedHandle)
  }

  return lookup.byName.get(normalized)
}

function resolveLiveTestRunLeadId(payload: string, lookup: LeadLookup) {
  const parsed = parseJsonObject(payload)
  if (!parsed || typeof parsed !== 'object') {
    return undefined
  }

  const leadObject = asObject(parsed.lead)
  const candidateTokens = [
    asString((parsed as Record<string, unknown>).lead_id),
    asString((parsed as Record<string, unknown>).leadId),
    asString((parsed as Record<string, unknown>).lead_handle),
    asString((parsed as Record<string, unknown>).leadHandle),
    asString((parsed as Record<string, unknown>).handle),
    asString((parsed as Record<string, unknown>).user_id),
    asString((parsed as Record<string, unknown>).userId),
    asString((parsed as Record<string, unknown>).email),
    asString(leadObject?.id),
    asString(leadObject?.lead_id),
    asString(leadObject?.leadId),
    asString(leadObject?.handle),
    asString(leadObject?.lead_handle),
  ]

  for (const token of candidateTokens) {
    const leadId = resolveLeadIdFromToken(token, lookup)
    if (leadId) {
      return leadId
    }
  }

  return undefined
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function inferScenarioIdFromStage(stage?: FunnelStage) {
  if (stage === 'won') {
    return 'scenario-003'
  }

  if (stage === 'booked' || stage === 'no-show' || stage === 'recovery') {
    return 'scenario-002'
  }

  return 'scenario-001'
}

function deriveLifecyclePhaseFromLead(lead: QueueLead): LifecyclePhase {
  const source = String(lead.source || '').toLowerCase()
  const offer = String(lead.offer || '').toLowerCase()

  if (lead.stage === 'won' || offer.includes('subscription') || offer.includes('monthly')) {
    return 'onboarding'
  }

  if (lead.stage === 'checkout-sent') {
    return 'payment'
  }

  if (lead.stage === 'no-show' || lead.lane === 'recovery') {
    return 'alert'
  }

  if (lead.stage === 'booked' || lead.bookingStatus === 'booked' || lead.bookingStatus === 'reminded') {
    return 'booking'
  }

  if (source.includes('dm') || source.includes('story') || source.includes('comment') || lead.stage === 'new') {
    return 'intake'
  }

  return 'routing'
}

function normalizeBookingStatus(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-')
}

function lifecyclePhaseLabel(phase: LifecyclePhase) {
  return {
    intake: 'intake',
    booking: 'booking',
    payment: 'payment',
    onboarding: 'onboarding',
    alert: 'alert',
    routing: 'routing',
  }[phase]
}

type RecoverySignalTone = RecoveryStatusTone | RecoveryEscalationTone | RecoveryRailCardTone

function recoveryToneToSignalClass(tone: RecoverySignalTone) {
  if (tone === 'critical') {
    return 'signal-critical'
  }

  if (tone === 'warning' || tone === 'watch') {
    return 'signal-watch'
  }

  return 'signal-normal'
}

function resolveRoutingLane(
  lead: Lead | QueueLead | null,
  booking: Booking | null,
  bookingStatus: string | null | undefined,
) {
  const lane = asString((booking as Booking | null)?.routingLane)
  const bookingNormalized = normalizeBookingStatus(bookingStatus)
  const leadStatus = lead?.stage

  if (lane === 'consult' || lane === 'recovery' || lane === 'checkout' || lane === 'onboarding' || lane === 'qualification') {
    return lane
  }

  if (leadStatus === 'no-show' || leadStatus === 'recovery' || bookingNormalized === 'no-show' || bookingNormalized === 'recovered') {
    return 'recovery'
  }

  if (leadStatus === 'checkout-sent' || bookingNormalized === 'reminded') {
    return 'checkout'
  }

  if (leadStatus === 'booked' || bookingNormalized === 'booked' || bookingNormalized === 'rescheduled') {
    return 'consult'
  }

  if (leadStatus === 'won') {
    return 'onboarding'
  }

  return 'qualification'
}

function formatRoutingLaneLabel(lane: string) {
  return {
    qualification: 'Qualification',
    consult: 'Consult Routing',
    recovery: 'Recovery Lane',
    checkout: 'Checkout Handoff',
    onboarding: 'Onboarding Handoff',
  }[lane] ?? 'Routing Lane'
}

function deriveRoutingDecision(
  lead: Lead | null,
  booking: Booking | null,
  queueLead: QueueLead | null,
  escalationSignals: RecoveryEscalationSignal[],
): RoutingDecision {
  const owner = booking?.owner || lead?.owner || queueLead?.owner || 'Unassigned'
  const lane = resolveRoutingLane(lead, booking, booking?.status)
  const ruleLabel =
    lane === 'consult'
      ? 'Consult booked: route to closer and reminder coverage'
      : lane === 'recovery'
        ? 'No-show escalation and rebooking branch'
        : lane === 'checkout'
          ? 'Checkout handoff and payment path'
          : lane === 'onboarding'
            ? 'Won/checkout handoff to onboarding'
            : 'Qualification + intake routing'
  const escalationContext = escalationSignals[0]?.detail
  const note =
    booking?.recoveryAction ||
    escalationContext ||
    queueLead?.nextAction ||
    'Routing metadata is not yet written into the live timeline.'

  return {
    owner: owner || 'Unassigned',
    lane: formatRoutingLaneLabel(lane),
    ruleLabel,
    note,
  }
}

function extractNoShowEscalationSignals(events: LeadTimelineEntry[]) {
  const uniqueKeys = new Set<string>()
  const signals = events
    .filter((entry) => {
      const text = `${entry.type} ${entry.title} ${entry.detail}`.toLowerCase()
      return text.includes('no-show') || text.includes('no show') || text.includes('noshow') || text.includes('missed call')
    })
    .map((entry) => {
      const type = entry.type.toLowerCase()
      const title = entry.title.trim() || 'Workflow signal'
      const detail = entry.detail.trim() || 'No timeline detail captured.'
      const kind =
        type.includes('booking')
          ? ('booking' as const)
          : type.includes('delivery') || type.includes('attempt')
            ? ('delivery' as const)
            : type.includes('audit')
              ? ('audit' as const)
              : ('unknown' as const)

      const signature = `${type}|${title}`.toLowerCase()
      if (uniqueKeys.has(signature)) {
        return null
      }

      uniqueKeys.add(signature)

      return {
        id: entry.id,
        title,
        detail,
        timestamp: entry.timestamp,
        kind,
      }
    })
    .filter((entry): entry is RecoveryEscalationSignal => entry !== null)
    .slice(0, 6)

  return signals
}

type ConnectorReplayRecipe = 'dm-sprint' | 'ghl-recovery' | 'stripe-capi' | 'onboarding'

const workbenchScenarioMap = {
  funnel: 'scenario-001',
  recovery: 'scenario-002',
  payload: 'scenario-003',
} satisfies Record<WorkbenchTab, string>

type ConnectorInspectorProfile = {
  trigger: string
  branch: string
  downstream: string
  replayRecipe: ConnectorReplayRecipe
}

const connectorInspectorProfiles: Record<string, ConnectorInspectorProfile> = {
  Zapier: {
    trigger: 'Proof-requested intake or tagged DM lead',
    branch: 'Proof branch',
    downstream: 'Checkout queue, reporting branch, and audit trail',
    replayRecipe: 'dm-sprint',
  },
  Make: {
    trigger: 'No-show or delayed fulfillment handoff',
    branch: 'Recovery / onboarding branch',
    downstream: 'Reschedule relay, folder provisioning, and team alerts',
    replayRecipe: 'ghl-recovery',
  },
  GHL: {
    trigger: 'Booked consult or pipeline status change',
    branch: 'Consult routing branch',
    downstream: 'Owner assignment, reminder sequence, and recovery state',
    replayRecipe: 'ghl-recovery',
  },
  'Meta CAPI': {
    trigger: 'Stripe purchase or checkout completion',
    branch: 'Purchase event branch',
    downstream: 'Revenue reporting, match keys, and purchase relay',
    replayRecipe: 'stripe-capi',
  },
  Slack: {
    trigger: 'Hot lead, failure, or no-show escalation',
    branch: 'Team alert branch',
    downstream: 'Acknowledgment trail, retry queue, and escalation note',
    replayRecipe: 'ghl-recovery',
  },
  Discord: {
    trigger: 'Community alert or operator broadcast',
    branch: 'Community alert branch',
    downstream: 'Alert center, acknowledgement state, and retry trail',
    replayRecipe: 'ghl-recovery',
  },
  Kajabi: {
    trigger: 'Purchase-ready or onboarding-ready lead',
    branch: 'Onboarding branch',
    downstream: 'Access links, SOP bundle, and onboarding proof',
    replayRecipe: 'onboarding',
  },
  Skool: {
    trigger: 'Subscriber handoff or community access',
    branch: 'Onboarding branch',
    downstream: 'Access links, SOP bundle, and community invite proof',
    replayRecipe: 'onboarding',
  },
  Typeform: {
    trigger: 'Form intake or qualification response',
    branch: 'Intake branch',
    downstream: 'Lead record, qualification note, and checkout routing',
    replayRecipe: 'dm-sprint',
  },
}

function getConnectorInspectorProfile(name?: string): ConnectorInspectorProfile {
  return (
    (name ? connectorInspectorProfiles[name] : undefined) ?? {
      trigger: 'Integration event selected',
      branch: 'General relay path',
      downstream: 'Delivery queue, audit log, and replay history',
      replayRecipe: 'dm-sprint',
    }
  )
}

const scenarioRuntimes: Record<string, ScenarioRuntime> = {
  'scenario-001': {
    stepLabels: ['Inbound DM', 'Tag + qualify', 'Checkout sent', 'Purchase ready'],
    leadStages: ['new', 'engaged', 'checkout-sent', 'won'],
    bookingStatuses: ['reminded', 'reminded', 'reminded', 'recovered'],
    visibleMessageCount: [1, 2, 4, 4],
    visibleEventIds: [['evt-001'], ['evt-001', 'evt-002'], ['evt-001', 'evt-002', 'evt-003'], ['evt-001', 'evt-002', 'evt-003']],
    payloads: [
      {
        event_name: 'Lead',
        source: 'instagram_dm',
        trigger: 'pricing_keyword',
        lead_handle: '@miamoves',
      },
      {
        event_name: 'Lead',
        tags: ['dm-sprint', 'warm', 'challenge'],
        owner: 'Alex',
        funnel_stage: 'engaged',
      },
      {
        event_name: 'InitiateCheckout',
        provider: 'stripe',
        amount: 49,
        currency: 'USD',
        payment_link_state: 'sent',
      },
      {
        event_name: 'Purchase',
        provider: 'stripe',
        value: 49,
        offer: 'Low-ticket challenge',
        capi_state: 'ready',
      },
    ],
    metricLabel: 'Revenue influenced',
    metricValues: ['$0', '$0', '$49 pending', '$49 closed'],
  },
  'scenario-002': {
    stepLabels: ['Call requested', 'Booked + routed', 'No-show detected', 'Recovery queued'],
    leadStages: ['engaged', 'booked', 'no-show', 'recovery'],
    bookingStatuses: ['booked', 'reminded', 'no-show', 'recovered'],
    visibleMessageCount: [2, 4, 4, 4],
    visibleEventIds: [['evt-004'], ['evt-004'], ['evt-004'], ['evt-004', 'evt-005']],
    payloads: [
      {
        route: 'consult',
        owner_pool: ['Nina', 'Alex'],
        routing_reason: 'high-ticket intent',
      },
      {
        booking_status: 'booked',
        reminder_sequence: ['24h', '2h', '30m'],
        closer: 'Nina',
      },
      {
        booking_status: 'no-show',
        grace_window_minutes: 10,
        next_state: 'recovery',
      },
      {
        event_name: 'Schedule',
        recovery_branch: 'voice_note_plus_reschedule',
        proof_stack: true,
        expected_outcome: 'rebook',
      },
    ],
    metricLabel: 'Recovery value',
    metricValues: ['$0 protected', '$0 protected', '$2.5k at risk', '$2.5k recovered path'],
  },
  'scenario-003': {
    stepLabels: ['Payment received', 'Subscriber promoted', 'Onboarding autopilot', 'CAPI purchase ready'],
    leadStages: ['won', 'won', 'won', 'won'],
    bookingStatuses: ['recovered', 'recovered', 'recovered', 'recovered'],
    visibleMessageCount: [1, 2, 2, 2],
    visibleEventIds: [['evt-006'], ['evt-006'], ['evt-006', 'evt-007'], ['evt-006', 'evt-007', 'evt-008']],
    payloads: [
      {
        event_name: 'Purchase',
        provider: 'stripe_webhook',
        offer: 'Subscription',
        value: 97,
      },
      {
        customer_state: 'subscriber',
        next_action: 'onboarding',
        upsell_ready: true,
      },
      {
        onboarding_assets: ['folder_template', 'sop_links', 'welcome_message'],
        status: 'started',
      },
      {
        event_name: 'Purchase',
        destination: 'meta_server_events',
        match_keys: ['em', 'ph', 'external_id', 'value'],
        payload_status: 'ready',
      },
    ],
    metricLabel: 'Ops time saved',
    metricValues: ['0 min', '10 min saved', '30 min saved', '45 min saved'],
  },
}

const lifecycleStageProfiles: Record<string, LifecycleStageProfile[]> = {
  'scenario-001': [
    { phases: ['intake'], max: 1 },
    { phases: ['intake', 'routing'], max: 2 },
    { phases: ['intake', 'routing', 'payment'], max: 3 },
    { phases: ['intake', 'routing', 'payment'], max: 3 },
  ],
  'scenario-002': [
    { phases: ['booking'], max: 1 },
    { phases: ['booking'], max: 1 },
    { phases: ['booking'], max: 1 },
    { phases: ['booking', 'routing', 'alert'], max: 2 },
  ],
  'scenario-003': [
    { phases: ['payment'], max: 1 },
    { phases: ['payment'], max: 1 },
    { phases: ['payment', 'onboarding'], max: 2 },
    { phases: ['payment', 'onboarding', 'booking'], max: 3 },
  ],
}

const interviewGuideSteps: InterviewGuideStep[] = [
  {
    id: 'onboarding',
    title: 'Payment to onboarding autopilot',
    skill: 'Stripe, onboarding, and Meta CAPI',
    detail: 'Open on the strongest live proof: a won lead with onboarding handoff and purchase evidence.',
    railTab: 'operations',
    workbenchTab: 'payload',
    leadId: 'lead-003',
    scenarioId: 'scenario-003',
  },
  {
    id: 'dm-sprint',
    title: 'DM sprint funnel',
    skill: 'JavaScript glue, ManyChat-style intake, and checkout handoff',
    detail: 'Show how an inbound DM becomes a tagged lead and a Stripe-ready checkout path.',
    railTab: 'operations',
    workbenchTab: 'funnel',
    leadId: 'lead-001',
    scenarioId: 'scenario-001',
  },
  {
    id: 'recovery',
    title: 'Call routing and recovery',
    skill: 'GHL pipelines, webhook routing, and no-show recovery',
    detail: 'Show booked, no-show, and recovery handling with durable state and audit trails.',
    railTab: 'operations',
    workbenchTab: 'recovery',
    leadId: 'lead-002',
    scenarioId: 'scenario-002',
  },
  {
    id: 'integrations',
    title: 'Integration inbox',
    skill: 'Zapier, Make, Apify, Kajabi, Skool, and Discord',
    detail: 'Move the narrative to a shared inbox of payloads, audits, and replayable events.',
    railTab: 'inbox',
    workbenchTab: 'payload',
    leadId: 'lead-003',
    scenarioId: 'scenario-003',
  },
  {
    id: 'metrics',
    title: 'Daily revenue command center',
    skill: 'Reporting, attribution, and operator metrics',
    detail: 'Show the revenue board, connector health, and what changes day to day.',
    railTab: 'metrics',
    workbenchTab: 'payload',
    leadId: 'lead-003',
    scenarioId: 'scenario-003',
  },
  {
    id: 'proof-pack',
    title: 'Proof pack and handoff',
    skill: 'SOPs, handoff, and credibility artifacts',
    detail: 'Generate the follow-up artifact the interviewer can keep after the walkthrough.',
    railTab: 'tools',
    workbenchTab: 'payload',
    leadId: 'lead-003',
    scenarioId: 'scenario-003',
  },
]

const STORAGE_KEY = 'creator-funnel-ops-state'
const DEFAULT_PROOF_SCENARIO_ID = 'scenario-003'
const DEFAULT_PROOF_LEAD_ID = 'lead-003'
const DEFAULT_PROOF_WORKBENCH_TAB: WorkbenchTab = 'payload'
const DEFAULT_PROOF_RAIL_TAB: RailTab = 'operations'

function readPersistedState() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function isAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401
}

function App() {
  const persisted = readPersistedState()
  const defaultRuleDrafts: RuleDraft[] = automationRules.map((rule) => ({
    ...rule,
    enabled: true,
  }))
  const [scenarioId, setScenarioId] = useState(persisted?.scenarioId ?? DEFAULT_PROOF_SCENARIO_ID)
  const [stepIndex, setStepIndex] = useState(persisted?.stepIndex ?? 0)
  const [selectedLeadId, setSelectedLeadId] = useState(persisted?.selectedLeadId ?? DEFAULT_PROOF_LEAD_ID)
  const [leadQuery, setLeadQuery] = useState(persisted?.leadQuery ?? '')
  const [leadStageFilter, setLeadStageFilter] = useState<FunnelStage | 'all'>(
    persisted?.leadStageFilter ?? 'all',
  )
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryStatus | 'all'>(
    persisted?.deliveryFilter ?? 'all',
  )
  const [operatorNotes, setOperatorNotes] = useState(persisted?.operatorNotes ?? '')
  const [webhookInput, setWebhookInput] = useState(
    JSON.stringify(scenarioRuntimes[DEFAULT_PROOF_SCENARIO_ID].payloads[0], null, 2),
  )
  const [leadRecords, setLeadRecords] = useState<Lead[]>([])
  const [conversationRecords, setConversationRecords] = useState<Conversation[]>([])
  const [bookingRecords, setBookingRecords] = useState<Booking[]>([])
  const [onboardingRuns, setOnboardingRuns] = useState<OnboardingRun[]>([])
  const [queueRecords, setQueueRecords] = useState<QueueLead[]>([])
  const [leadTimeline, setLeadTimeline] = useState<LeadTimelineEntry[]>([])
  const [deliveryQueue, setDeliveryQueue] = useState<DeliveryItem[]>([])
  const [webhookHistory, setWebhookHistory] = useState<WebhookEvent[]>([])
  const [ruleDrafts] = useState<RuleDraft[]>(
    Array.isArray(persisted?.ruleDrafts) ? persisted.ruleDrafts : defaultRuleDrafts,
  )
  const [connectorStates, setConnectorStates] = useState<Record<string, ConnectorState>>({})
  const [operatorNotesHistory, setOperatorNotesHistory] = useState<OperatorNote[]>([])
  const [auditQuery, setAuditQuery] = useState('')
  const [auditKindFilter, setAuditKindFilter] = useState<'all' | AuditKind>('all')
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [integrationEvents, setIntegrationEvents] = useState<IntegrationEvent[]>([])
  const [inboxQuery, setInboxQuery] = useState('')
  const [inboxKindFilter, setInboxKindFilter] = useState<'all' | IntegrationInboxKind>('all')
  const [inboxStatusFilter, setInboxStatusFilter] = useState<'all' | IntegrationInboxStatus>('all')
  const [liveTestRuns, setLiveTestRuns] = useState<LiveTestRun[]>([])
  const [ruleTestResults, setRuleTestResults] = useState<Record<string, RuleTestResult>>({})
  const [webhookResult, setWebhookResult] = useState<{
    status: 'accepted' | 'rejected'
    message: string
  } | null>(null)
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>(
    persisted?.workbenchTab ?? DEFAULT_PROOF_WORKBENCH_TAB,
  )
  const [railTab, setRailTab] = useState<RailTab>(persisted?.railTab ?? DEFAULT_PROOF_RAIL_TAB)
  const [interviewMode, setInterviewMode] = useState(Boolean(persisted?.interviewMode ?? false))
  const [secondaryPanel, setSecondaryPanel] = useState<'systems' | 'notes' | 'workflow' | null>(null)
  const [selectedConnectorName, setSelectedConnectorName] = useState(
    persisted?.selectedConnectorName ?? automationConnectors[0]?.name ?? 'Zapier',
  )
  const [selectedSnippetLabel, setSelectedSnippetLabel] = useState('JavaScript glue')
  const [payloadProofOpen, setPayloadProofOpen] = useState(false)
  const [dashboardSummary, setDashboardSummary] = useState<{
    leadsToday: number
    bookedCalls: number
    recoveredNoShows: number
    stripeRevenue: number
    pipelineBreakdown?: Record<string, number>
  } | null>(null)
  const [reportsOverview, setReportsOverview] = useState<ReportsOverview | null>(null)
  const [syncStatus, setSyncStatus] = useState<{
    configured: boolean
    realtime: {
      pollMs: number
      connected: boolean
      lastEventAt: string | null
      eventCount: number
    }
    remote:
      | {
          found?: boolean
          source?: string | null
          digest?: string | null
          updatedAt?: string | null
        }
      | { error: string }
    supabase: Record<string, number> | { error: string }
  } | null>(null)
  const [syncDiff, setSyncDiff] = useState<{
    ok: boolean
    diff?: {
      leads: { localOnly: string[]; remoteOnly: string[]; shared: number }
      bookings: { localOnly: string[]; remoteOnly: string[]; shared: number }
      conversations: { localOnly: string[]; remoteOnly: string[]; shared: number }
      deliveries: { localOnly: string[]; remoteOnly: string[]; shared: number }
      attempts: { localOnly: string[]; remoteOnly: string[]; shared: number }
      audit: { localOnly: string[]; remoteOnly: string[]; shared: number }
      notes: { localOnly: string[]; remoteOnly: string[]; shared: number }
      tests: { localOnly: string[]; remoteOnly: string[]; shared: number }
    }
    message?: string
  } | null>(null)
  const [syncPending, setSyncPending] = useState<'status' | 'diff' | 'push' | 'pull' | 'reconcile' | null>(null)
  const [intakeHandle, setIntakeHandle] = useState('')
  const [intakeMessage, setIntakeMessage] = useState('')
  const [intakeSource, setIntakeSource] = useState('instagram_dm')
  const [intakeOffer, setIntakeOffer] = useState('Low-ticket challenge')
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking')
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('idle')
  const [authSession, setAuthSession] = useState<{ sub: string; bypass?: boolean } | null>(null)
  const [loginUsername, setLoginUsername] = useState('operator')
  const [loginPassword, setLoginPassword] = useState('')
  const [authPending, setAuthPending] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [proofPreview, setProofPreview] = useState<{
    title: string
    payload: string
  } | null>(null)
  const [connectorActionResult, setConnectorActionResult] = useState<{
    title: string
    detail: string
    kind: 'replay' | 'retry'
    status: 'accepted' | 'rejected'
    timestamp: string
  } | null>(null)
  const [toolArtifact, setToolArtifact] = useState<{
    title: string
    payload: string
  } | null>(null)
  const [recipePending, setRecipePending] = useState<string | null>(null)
  const [toolPending, setToolPending] = useState<string | null>(null)
  const [dispatchPending, setDispatchPending] = useState<'slack' | 'sheets' | null>(null)
  const [runtimeResetPending, setRuntimeResetPending] = useState(false)

  const activeLead =
    leadRecords.find((lead) => lead.id === selectedLeadId) ??
    leadRecords.find((lead) => lead.id === queueRecords[0]?.id) ??
    leadRecords[0] ??
    null
  const activeQueueLead = queueRecords.find((entry) => entry.id === activeLead?.id) ?? null
  const activeScenario = useMemo(
    () =>
      demoScenarios.find((scenario) => scenario.id === scenarioId) ??
      demoScenarios.find((scenario) => scenario.id === workbenchScenarioMap[workbenchTab]) ??
      demoScenarios.find((scenario) => scenario.id === inferScenarioIdFromStage(activeLead?.stage)) ??
      demoScenarios.find((scenario) => scenario.id === workbenchScenarioMap.funnel) ??
      demoScenarios[0],
    [activeLead?.stage, scenarioId, workbenchTab],
  )
  const runtime = scenarioRuntimes[activeScenario.id]
  const activeConversation =
    conversationRecords.find((conversation) => conversation.leadId === activeLead?.id) ?? null
  const activeBooking = bookingRecords.find((booking) => booking.leadId === activeLead?.id) ?? null
  const activeOnboardingRun =
    onboardingRuns.find((run) => run.leadId === activeLead?.id) ?? null
  const onboardingProofRuns = onboardingRuns.length
    ? onboardingRuns
    : activeOnboardingRun
      ? [activeOnboardingRun]
      : []
  const onboardingCompleted = onboardingRuns.filter((run) => run.status === 'provisioned').length
  const visibleMessages = activeConversation
    ? activeConversation.messages.slice(
        0,
        Math.min(
          activeConversation.messages.length,
          runtime.visibleMessageCount[stepIndex] ?? activeConversation.messages.length,
        ),
      )
    : []
  const activePayload = runtime.payloads[stepIndex]
  const activeMetricValue = runtime.metricValues[stepIndex]
  const filteredLeads = queueRecords
  const filteredDeliveryQueue = deliveryQueue.filter((item) =>
    deliveryFilter === 'all' ? true : item.status === deliveryFilter,
  )
  const prioritizedLeads = filteredLeads
  const prioritizedDeliveryQueue = [...filteredDeliveryQueue].sort((left, right) => {
    const statusDifference = deliveryStatusPriority[left.status] - deliveryStatusPriority[right.status]
    if (statusDifference !== 0) {
      return statusDifference
    }

    return right.lastAttempt.localeCompare(left.lastAttempt)
  })
  const activeLeadQueue = activeLead
    ? filteredDeliveryQueue.filter((item) => item.target === activeLead.handle)
    : []
  const activeLeadTimeline = leadTimeline
  const activeAutomationTrail = activeLeadTimeline.slice(0, 4).map((entry) => entry.title)
  const leadLookup = useMemo(() => getLeadLookup(leadRecords), [leadRecords])
  const activeLeadAudit = activeLead
    ? auditEvents.filter((entry) =>
        `${entry.target} ${entry.detail}`.toLowerCase().includes(activeLead.id) ||
        `${entry.target} ${entry.detail}`.toLowerCase().includes(activeLead.handle.toLowerCase()),
      )
    : []
  const activeLeadId = activeLead?.id ?? null
  const noShowEscalationSignals = useMemo(
    () => extractNoShowEscalationSignals(activeLeadTimeline),
    [activeLeadTimeline],
  )
  const activeRoutingDecision = useMemo(
    () => deriveRoutingDecision(activeLead, activeBooking, activeQueueLead, noShowEscalationSignals),
    [activeLead, activeBooking, activeQueueLead, noShowEscalationSignals],
  )
  const recoveryDisplayModel = useMemo(
    () =>
      getRecoveryDisplayModel({
        lead: activeLead,
        booking: activeBooking,
        escalationSignalCount: noShowEscalationSignals.length,
      }),
    [activeLead, activeBooking, noShowEscalationSignals.length],
  )
  const isNoShowEscalationLive = noShowEscalationSignals.length > 0
  const noShowEscalationText = isNoShowEscalationLive
    ? `Timeline contains ${noShowEscalationSignals.length} escalation signal${noShowEscalationSignals.length === 1 ? '' : 's'}.`
    : activeLead?.stage === 'no-show' || normalizeBookingStatus(activeBooking?.status) === 'no-show'
      ? 'No-show stage observed; escalation proof should appear in the live timeline next.'
      : 'Escalation triggers are pending. Use Mark no-show when attendance is missed.'
  const integrationInboxEntries = useMemo(() => {
    if (integrationEvents.length > 0) {
      return integrationEvents.map((entry) => ({
        id: entry.id,
        kind: entry.kind as IntegrationInboxKind,
        source: entry.source,
        target: entry.target,
        summary: entry.summary,
        status: entry.status,
        timestamp: entry.timestamp,
        leadId: entry.leadId,
        effect: entry.effect,
      }))
    }

    const deliveryItems: IntegrationInboxEntry[] = deliveryQueue.map((item) => ({
      id: `delivery-${item.id}`,
      kind: 'delivery',
      source: item.connector,
      target: item.target,
      summary: `${item.payloadLabel} • ${item.note}`,
      status: item.status,
      timestamp: item.lastAttempt,
      leadId: resolveLeadIdFromToken(item.target, leadLookup),
      effect: 'Updates relay pressure and outbox visibility.',
    }))

    const auditItems: IntegrationInboxEntry[] = auditEvents.map((entry) => ({
      id: `audit-${entry.id}`,
      kind: 'audit',
      source: entry.kind,
      target: entry.target,
      summary: `${entry.title} • ${entry.detail}`,
      status: entry.kind === 'connector' ? 'warning' : 'processed',
      timestamp: entry.timestamp,
      leadId: resolveLeadIdFromToken(entry.target, leadLookup),
      effect:
        entry.kind === 'connector'
          ? 'Records connector health or a relay warning.'
          : 'Records the workflow mutation for operator review.',
    }))

    const testItems: IntegrationInboxEntry[] = liveTestRuns.map((run) => ({
      id: `test-${run.id}`,
      kind: 'test',
      source: run.connector,
      target: run.scenarioTitle,
      summary: `${run.stepLabel} • ${run.resultMessage}`,
      status: run.status === 'accepted' ? 'processed' : 'warning',
      timestamp: run.createdAt,
      leadId: resolveLiveTestRunLeadId(run.payload, leadLookup),
      effect: 'Proves the relay path before it reaches live workflow state.',
    }))

    return [...deliveryItems, ...auditItems, ...testItems].sort((left, right) => {
      const timeDifference = right.timestamp.localeCompare(left.timestamp)
      if (timeDifference !== 0) {
        return timeDifference
      }
      return left.source.localeCompare(right.source)
    })
  }, [auditEvents, deliveryQueue, integrationEvents, leadLookup, liveTestRuns])
  const activeLeadLifecycleEntries = useMemo(
    () =>
      activeLeadId
        ? integrationInboxEntries.filter((entry) => entry.leadId === activeLeadId)
        : [],
    [activeLeadId, integrationInboxEntries],
  )
  const activeLeadLifecycleNodes = useMemo(
    () => {
      const mappedNodes = activeLeadLifecycleEntries.map((entry) => {
        const haystack = `${entry.kind} ${entry.source} ${entry.target} ${entry.summary} ${entry.effect ?? ''}`.toLowerCase()
        const phase: LifecyclePhase =
          haystack.includes('purchase') || haystack.includes('stripe')
            ? 'payment'
            : haystack.includes('onboarding') || haystack.includes('kajabi') || haystack.includes('skool')
              ? 'onboarding'
              : haystack.includes('alert') || haystack.includes('slack') || haystack.includes('discord')
                ? 'alert'
                : haystack.includes('booking') || haystack.includes('ghl') || haystack.includes('consult')
                  ? 'booking'
                  : haystack.includes('dm') || haystack.includes('instagram') || entry.kind === 'webhook'
                    ? 'intake'
                    : 'routing'
        const target =
          phase === 'intake'
            ? { railTab: 'inbox' as const, workbenchTab: 'funnel' as const, label: 'Open DM workbench' }
            : phase === 'booking'
              ? { railTab: 'operations' as const, workbenchTab: 'recovery' as const, label: 'Open booking branch' }
              : phase === 'payment'
                ? { railTab: 'metrics' as const, workbenchTab: 'payload' as const, label: 'Open payment lab' }
                : phase === 'onboarding'
                  ? { railTab: 'tools' as const, workbenchTab: 'payload' as const, label: 'Open onboarding proof' }
                  : phase === 'alert'
                    ? { railTab: 'audit' as const, workbenchTab: 'recovery' as const, label: 'Open alert trail' }
                    : { railTab: 'operations' as const, workbenchTab: 'funnel' as const, label: 'Open routing state' }

        return {
          ...entry,
          phase,
          title: entry.summary.split(' • ')[0] || entry.summary,
          target,
        }
      })

      const visibleIds = runtime.visibleEventIds[stepIndex] ?? []
      const matchedById = visibleIds.length
        ? mappedNodes.filter((node) => visibleIds.some((id) => node.id === id || node.id.endsWith(id)))
        : []
      if (matchedById.length) {
        return matchedById.slice(0, 6)
      }

      const stageProfile =
        lifecycleStageProfiles[activeScenario.id]?.[stepIndex] ??
        lifecycleStageProfiles[activeScenario.id]?.[0] ??
        null
      if (!stageProfile) {
        return mappedNodes.slice(0, 6)
      }

      const filteredByPhase = mappedNodes.filter((node) => stageProfile.phases.includes(node.phase))
      if (filteredByPhase.length) {
        return filteredByPhase.slice(0, stageProfile.max)
      }

      return mappedNodes.slice(0, stageProfile.max)
    },
    [activeLeadLifecycleEntries, activeScenario.id, runtime.visibleEventIds, stepIndex],
  )
  const integrationInboxSources = useMemo(
    () => ['all', ...new Set(integrationInboxEntries.map((entry) => entry.source))],
    [integrationInboxEntries],
  )
  const getIntegrationInboxStatusClass = (status: IntegrationInboxStatus) => {
    if (status === 'processed') {
      return 'signal-normal'
    }
    if (status === 'warning') {
      return 'signal-watch'
    }
    return `connector-${status}`
  }
  const visibleInboxEntries = integrationInboxEntries
    .filter((entry) => (inboxKindFilter === 'all' ? true : entry.kind === inboxKindFilter))
    .filter((entry) => (inboxStatusFilter === 'all' ? true : entry.status === inboxStatusFilter))
    .filter((entry) => {
      if (!inboxQuery.trim()) {
        return true
      }
      const haystack = `${entry.source} ${entry.target} ${entry.summary} ${entry.status}`.toLowerCase()
      return haystack.includes(inboxQuery.toLowerCase())
    })
  const activeLeadInboxEntries = activeLead
    ? visibleInboxEntries.filter((entry) => entry.leadId === activeLead.id)
    : []
  const liveConsoleReady = runtimeStatus === 'ready'
  const hasLiveLead = Boolean(activeLead)
  const runtimeHost = typeof window !== 'undefined' ? window.location.host : 'server'
  const missionStats = useMemo(() => {
    const leadsToday = dashboardSummary?.leadsToday ?? leadRecords.length
    const bookedCalls =
      dashboardSummary?.bookedCalls ??
      bookingRecords.filter((booking) => booking.status === 'booked' || booking.status === 'reminded')
        .length
    const recoveredNoShows =
      dashboardSummary?.recoveredNoShows ??
      bookingRecords.filter((booking) => booking.status === 'recovered').length
    const stripeRevenue =
      dashboardSummary?.stripeRevenue ??
      leadRecords.filter((lead) => lead.stage === 'won').reduce((total, lead) => total + parseMoneyValue(lead.budget), 0)

    return [
      {
        label: 'Leads Today',
        value: String(leadsToday),
        note: `${leadRecords.filter((lead) => lead.stage !== 'won').length} still active in the live queue`,
      },
      {
        label: 'Booked Calls',
        value: String(bookedCalls),
        note: `${bookingRecords.length - bookedCalls} tracking recovery or follow-up`,
      },
      {
        label: 'Recovered No-Shows',
        value: String(recoveredNoShows),
        note: `${bookingRecords.filter((booking) => booking.status === 'no-show').length} still at risk`,
      },
      {
        label: 'Stripe Revenue',
        value: formatCurrency(stripeRevenue),
        note: 'Live SQL snapshot from won funnel paths',
      },
    ]
  }, [bookingRecords, dashboardSummary, leadRecords])

  const railMetrics = useMemo(
    () => [
      {
        label: 'Pipeline value',
        value: formatCurrency(
          leadRecords
            .filter((lead) => lead.stage === 'checkout-sent' || lead.stage === 'booked')
            .reduce((total, lead) => total + parseMoneyValue(lead.budget), 0),
        ),
        delta: 'Active conversion opportunities still moving.',
      },
      {
        label: 'Recovery backlog',
        value: String(queueRecords.filter((entry) => entry.lane === 'recovery').length),
        delta: 'Live no-show items waiting for a recovery branch.',
      },
      {
        label: 'Live test runs',
        value: String(liveTestRuns.length),
        delta: 'SQL-backed scenario tests recorded in the backend.',
      },
      {
        label: 'Relay pressure',
        value: String(deliveryQueue.filter((item) => item.status !== 'delivered').length),
        delta: 'Queued outbox items awaiting relay completion.',
      },
    ],
    [deliveryQueue, leadRecords, liveTestRuns.length, queueRecords],
  )
  const revenueSourceRows = useMemo(() => {
    const sourceBreakdown = reportsOverview?.sourceBreakdown ?? {}
    const total = reportsOverview?.queueSummary.total ?? 0

    return Object.entries(sourceBreakdown)
      .map(([source, count]) => ({
        source,
        count,
        share: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((left, right) => right.count - left.count)
  }, [reportsOverview])
  const revenueConnectorRows = useMemo(() => {
    return [...(reportsOverview?.connectors ?? [])].sort((left, right) => {
      const leftScore = Number(left.queued > 0) + Number(left.processing > 0) * 2
      const rightScore = Number(right.queued > 0) + Number(right.processing > 0) * 2
      if (rightScore !== leftScore) {
        return rightScore - leftScore
      }
      return right.runs - left.runs
    })
  }, [reportsOverview])
  const selectedConnector = useMemo(
    () =>
      automationConnectors.find((connector) => connector.name === selectedConnectorName) ??
      automationConnectors[0] ??
      null,
    [selectedConnectorName],
  )
  const selectedConnectorState = selectedConnector ? connectorStates[selectedConnector.name] : undefined
  const selectedConnectorReport = selectedConnector
    ? reportsOverview?.connectors.find((entry) => entry.name === selectedConnector.name)
    : undefined
  const selectedConnectorRuns = useMemo(
    () =>
      selectedConnector
        ? [...liveTestRuns]
            .filter((run) => run.connector === selectedConnector.name)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .slice(0, 4)
        : [],
    [liveTestRuns, selectedConnector],
  )
  const selectedConnectorRunsWithLead = useMemo(() => {
    return selectedConnectorRuns.map((run) => ({
      ...run,
      leadId: resolveLiveTestRunLeadId(run.payload, leadLookup),
    }))
  }, [leadLookup, selectedConnectorRuns])
  const selectedConnectorDeliveries = useMemo(
    () =>
      selectedConnector
        ? [...deliveryQueue]
            .filter((item) => item.connector === selectedConnector.name)
            .sort((left, right) => right.lastAttempt.localeCompare(left.lastAttempt))
            .slice(0, 4)
        : [],
    [deliveryQueue, selectedConnector],
  )
  const selectedConnectorFailedDeliveries = useMemo(
    () =>
      selectedConnector
        ? deliveryQueue.filter(
            (item) => item.connector === selectedConnector.name && item.status === 'failed',
          )
        : [],
    [deliveryQueue, selectedConnector],
  )
  const selectedConnectorInspector = useMemo(() => {
    const profile = getConnectorInspectorProfile(selectedConnector?.name)
    const latestRun = selectedConnectorRunsWithLead[0] ?? null
    const liveRetryCount = selectedConnectorFailedDeliveries.length

    return {
      profile,
      latestRun,
      liveRetryCount,
      runCount: selectedConnectorRuns.length,
      deliveryCount: selectedConnectorDeliveries.length,
      downstreamCount: selectedConnectorDeliveries.filter((item) => item.status === 'delivered').length,
    } as {
      profile: ConnectorInspectorProfile
      latestRun: EnrichedLiveTestRun | null
      liveRetryCount: number
      runCount: number
      deliveryCount: number
      downstreamCount: number
    }
  }, [
    selectedConnector?.name,
    selectedConnectorRuns.length,
    selectedConnectorDeliveries,
    selectedConnectorFailedDeliveries,
    selectedConnectorRunsWithLead,
  ])
  const selectedConnectorBranchTrace = useMemo(() => {
    const profile = selectedConnectorInspector.profile
    const latestRun = selectedConnectorInspector.latestRun
    const latestDelivery = selectedConnectorDeliveries[0] ?? null
    const activeLeadLabel = activeLead?.handle ?? selectedConnectorDeliveries[0]?.target ?? 'No active lead'

    return [
      {
        label: 'Trigger',
        value: profile.trigger,
        note: `${selectedConnector?.name ?? 'Connector'} selected for ${activeLeadLabel}.`,
      },
      {
        label: 'Filter',
        value: profile.branch,
        note: latestRun
          ? `${latestRun.scenarioTitle} • ${latestRun.stepLabel}`
          : 'No replay run has hit this path yet.',
      },
      {
        label: 'Action',
        value: latestDelivery
          ? `${latestDelivery.payloadLabel} • ${latestDelivery.status}`
          : 'No outbox row has been recorded yet.',
        note: latestDelivery ? latestDelivery.note : 'Replay is waiting on a delivery mutation.',
      },
      {
        label: 'Downstream',
        value: profile.downstream,
        note:
          latestRun?.resultMessage ??
          'The selected run has not produced a replay result yet.',
      },
    ]
  }, [activeLead?.handle, selectedConnector?.name, selectedConnectorDeliveries, selectedConnectorInspector])
  const selectedConnectorFailureTrail = useMemo(
    () =>
      selectedConnectorFailedDeliveries.map((item) => ({
        id: item.id,
        title: item.payloadLabel,
        detail: `${item.channel} • ${item.target}`,
        note: item.note,
      })),
    [selectedConnectorFailedDeliveries],
  )
  const revenueFollowUps = useMemo(() => {
    const items: Array<{
      label: string
      detail: string
      action?: string
    }> = []

    if ((reportsOverview?.queueSummary.recovery ?? 0) > 0) {
      items.push({
        label: 'Recovery lane is live',
        detail: `${reportsOverview?.queueSummary.recovery ?? 0} leads are waiting on no-show follow-up.`,
        action: 'Queue a recovery relay',
      })
    }

    if ((reportsOverview?.outboxSummary.queued ?? 0) > 0) {
      items.push({
        label: 'Outbox still has work',
        detail: `${reportsOverview?.outboxSummary.queued ?? 0} delivery items remain queued for relay.`,
        action: 'Retry the next item',
      })
    }

    const staleConnector = revenueConnectorRows.find((entry) => entry.status !== 'healthy')
    if (staleConnector) {
      items.push({
        label: `${staleConnector.name} needs a ping`,
        detail: staleConnector.note,
        action: 'Ping connector',
      })
    }

    if (!items.length) {
      items.push({
        label: 'Everything is caught up',
        detail: 'The report snapshot has no urgent backlog right now.',
      })
    }

    return items
  }, [reportsOverview, revenueConnectorRows])
  const failedDeliveries = useMemo(
    () => deliveryQueue.filter((item) => item.status === 'failed'),
    [deliveryQueue],
  )
  const capiRailEvents = useMemo(() => {
    const eventKeys = ['Lead', 'InitiateCheckout', 'Purchase'] as const

    return eventKeys.map((eventName) => {
      const liveEvent =
        deliveryQueue.find(
          (entry) =>
            entry.connector === 'Meta CAPI' &&
            entry.payloadLabel === eventName &&
            entry.target === (activeLead?.handle ?? entry.target),
        ) ?? deliveryQueue.find((entry) => entry.payloadLabel === eventName)

      const fallback = capiEvents.find((entry) => entry.eventName === eventName)
      if (!liveEvent) {
        return fallback ?? {
          eventName,
          source: 'Live relay unavailable',
          matchKeys: ['em', 'ph', 'external_id'],
          payloadStatus: 'Waiting on live relay',
        }
      }

      return {
        eventName,
        source: `${liveEvent.connector} / ${liveEvent.channel}`,
        matchKeys:
          eventName === 'Purchase'
            ? ['em', 'ph', 'external_id', 'value']
            : ['em', 'ph', 'external_id'],
        payloadStatus: `${liveEvent.status} • ${liveEvent.note}`,
      }
    })
  }, [activeLead?.handle, deliveryQueue])
  const attentionConnectors = useMemo(
    () =>
      Object.entries(connectorStates)
        .filter(([, state]) => state.status !== 'ready')
        .map(([name, state]) => ({ name, ...state })),
    [connectorStates],
  )
  const toolTemplates: OperatorToolTemplate[] = operatorToolTemplates
  const visibleAuditEvents = auditEvents
    .filter((entry) => (auditKindFilter === 'all' ? true : entry.kind === auditKindFilter))
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.detail} ${entry.target} ${entry.timestamp}`.toLowerCase()
      return haystack.includes(auditQuery.toLowerCase())
    })
  const requirementCoverage = useMemo(
    () => {
      const zapierRunCount = (connectorStates['Zapier']?.runs ?? 0) + (connectorStates['Make']?.runs ?? 0)
      const zapierQueue = deliveryQueue.filter((item) =>
        ['Zapier', 'Make'].includes(item.connector),
      ).length
      const typeformCount = deliveryQueue.filter((item) => item.connector === 'Typeform').length
      const platformQueue = deliveryQueue.filter((item) =>
        ['Kajabi', 'Skool', 'Discord'].includes(item.connector),
      ).length

      return [
        {
          label: 'JavaScript automation glue',
          status: 'shipped',
          detail:
            'One Node runtime drives DM intake, booking routing, payment handoff, onboarding, exports, and realtime.',
        },
        {
          label: 'Claude Code + repo modules',
          status: `${repoModules.length} modules`,
          detail: 'The CLI-built repo contains DM sprint, GHL recovery, and dashboard modules for rapid iteration.',
        },
        {
          label: 'ManyChat / Typeform automation',
          status: `${queueRecords.length} live leads`,
          detail: `IG DM, story reply, and Typeform (${typeformCount}) forms all feed the DM sprint automation and rule lab.`,
        },
        {
          label: 'Zapier / Make mastery',
          status: zapierRunCount ? `${zapierRunCount} relay checks` : 'modeled',
          detail: `Zapier and Make stay nearly live with ${zapierQueue} queued relays and ping-friendly health states.`,
        },
        {
          label: 'GHL pipelines + webhooks',
          status: `${bookingRecords.length} booking states`,
          detail: `Booking updates flow through webhook mutations into GHL routing, no-show recovery, and closer ownership.`,
        },
        {
          label: 'Meta CAPI + standard events',
          status: `${deliveryQueue.filter((item) => item.connector === 'Meta CAPI').length} queued events`,
          detail:
            'Purchase and recovery events are normalized into server-event payloads with match keys and replayable validation.',
        },
        {
          label: 'Apify / scraper scenarios',
          status: `${liveTestRuns.length} runs`,
          detail:
            'SQL-backed scenario runs simulate Apify scraper output, giving fresh social signals to the automation rules.',
        },
        {
          label: 'Slack / Sheets reporting',
          status: reportsOverview ? 'export-ready' : 'staged',
          detail: 'The backend generates live Slack summaries and Google Sheets snapshots from queue + revenue state.',
        },
        {
          label: 'Kajabi / Skool / Discord handoff',
          status: `${platformQueue} queued handoffs`,
          detail:
            'Kajabi, Skool, and Discord pipelines sit behind the automation layer for course, community, and alert handoffs.',
        },
      ]
    },
    [
      bookingRecords.length,
      connectorStates,
      deliveryQueue,
      liveTestRuns.length,
      queueRecords.length,
      reportsOverview,
    ],
  )
  const executionRecipes = useMemo(
    () => [
      {
        id: 'dm-sprint',
        title: 'DM sprint funnel',
        systems: 'Instagram DM, ManyChat logic, Stripe',
        detail: 'Capture an inbound DM, classify intent, tag the lead, and queue checkout.',
      },
      {
        id: 'ghl-recovery',
        title: 'No-show recovery',
        systems: 'GHL, Make, recovery webhook',
        detail: 'Move the active lead into a no-show branch and queue the recovery relay.',
      },
      {
        id: 'stripe-capi',
        title: 'Payment to CAPI',
        systems: 'Stripe webhook, Meta CAPI',
        detail: 'Mark a payment complete and queue the purchase server event trail.',
      },
      {
        id: 'onboarding',
        title: 'Client onboarding autopilot',
        systems: 'Make, provisioning workflow',
        detail: 'Provision folders, SOP assets, and onboarding records for the active customer.',
      },
    ],
    [],
  )
  const implementationSnippets = useMemo(() => {
    const handle = activeLead?.handle ?? '@demoautomation'
    const payload = JSON.stringify(activePayload, null, 2)
    const jsSnippet = `const response = await fetch('/api/workflows/dm-intake', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    handle: '${handle}',
    source: '${activeLead?.source ?? 'instagram_dm'}',
    offer: '${activeLead?.offer ?? 'Low-ticket challenge'}',
    message: 'price for the sprint?'
  }),
})`

    const pythonSnippet = `import requests

requests.post(
    "https://cobe.aparcedo.org/api/workflows/booking-update",
    json={
        "handle": "${handle}",
        "status": "no-show",
        "slot": "${activeBooking?.slot ?? '2026-04-05T15:00:00Z'}",
    },
    cookies={"cobe_admin_session": "<session-cookie>"},
)`

    const webhookSnippet = `POST /api/webhooks/validate
Content-Type: application/json

${payload}`

    const ghlSnippet = `GHL trigger: appointment status changed
if status == no-show:
  - apply tag: no-show
  - move pipeline stage: recovery
  - post webhook to /api/workflows/booking-update`

    return [
      { label: 'JavaScript glue', body: jsSnippet },
      { label: 'Python webhook', body: pythonSnippet },
      { label: 'Webhook payload', body: webhookSnippet },
      { label: 'GHL routing', body: ghlSnippet },
    ]
  }, [activeBooking?.slot, activeLead?.handle, activeLead?.offer, activeLead?.source, activePayload])
  const activeImplementationSnippet =
    implementationSnippets.find((snippet) => snippet.label === selectedSnippetLabel) ?? implementationSnippets[0]
  const clearLiveConsoleState = useCallback(() => {
    setLeadRecords([])
    setConversationRecords([])
    setBookingRecords([])
    setQueueRecords([])
    setLeadTimeline([])
    setDeliveryQueue([])
    setWebhookHistory([])
    setConnectorStates({})
    setOperatorNotesHistory([])
    setAuditEvents([])
    setLiveTestRuns([])
    setRuleTestResults({})
    setDashboardSummary(null)
    setReportsOverview(null)
    setSyncStatus(null)
    setSyncDiff(null)
    setSyncPending(null)
    setToolArtifact(null)
    setToolPending(null)
    setSelectedLeadId('')
    setRuntimeStatus('idle')
  }, [])

  const markRuntimeReady = () => {
    setRuntimeStatus('ready')
    setApiError(null)
  }

  const handleRuntimeFailure = useCallback(
    (error: unknown, fallbackMessage: string, options: { clearLiveState?: boolean } = {}) => {
      if (isAuthError(error)) {
        clearLiveConsoleState()
        setAuthSession(null)
        setAuthStatus('auth_required')
        setApiError(error.message || 'Your session expired. Log in again.')
        return
      }

      if (options.clearLiveState) {
        clearLiveConsoleState()
      }
      setRuntimeStatus('degraded')
      setApiError(error instanceof Error ? error.message : fallbackMessage)
    },
    [clearLiveConsoleState],
  )

  const bootstrapSession = useCallback(async () => {
    setApiError(null)
    setAuthStatus('checking')

    try {
      const session = await fetchAdminSession()
      setAuthSession(session.session)
      setAuthStatus('authenticated')
    } catch (error) {
      clearLiveConsoleState()
      setAuthSession(null)
      setAuthStatus('auth_required')
      if (!isAuthError(error)) {
        setApiError(error instanceof Error ? error.message : 'Failed to check the current session.')
      }
    }
  }, [clearLiveConsoleState])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scenarioId,
        stepIndex,
        selectedLeadId,
        leadQuery,
        leadStageFilter,
        deliveryFilter,
        operatorNotes,
        workbenchTab,
        railTab,
        interviewMode,
        selectedConnectorName,
        ruleDrafts,
      }),
    )
  }, [
    deliveryFilter,
    operatorNotes,
    leadQuery,
    leadStageFilter,
    ruleDrafts,
    scenarioId,
    selectedLeadId,
    workbenchTab,
    railTab,
    interviewMode,
    selectedConnectorName,
    stepIndex,
    webhookHistory,
  ])

  useEffect(() => {
    void bootstrapSession()
  }, [bootstrapSession])

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      clearLiveConsoleState()
      return
    }

    let cancelled = false

    setRuntimeStatus('loading')
    setApiError(null)

    Promise.all([fetchBootstrap(), fetchReportsOverview(), fetchSyncStatus()])
      .then(([snapshot, reports, sync]) => {
        if (!cancelled) {
          applySnapshot(snapshot)
          setReportsOverview(reports)
          setSyncStatus(sync)
          markRuntimeReady()
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handleRuntimeFailure(error, 'Failed to load the authenticated console.', {
            clearLiveState: true,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [authStatus, clearLiveConsoleState, handleRuntimeFailure])

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setQueueRecords([])
      return
    }

    let cancelled = false

    fetchQueue({
      q: leadQuery,
      stage: leadStageFilter === 'all' ? undefined : leadStageFilter,
    })
      .then((queue) => {
        if (!cancelled) {
          setQueueRecords(queue)
          if (!selectedLeadId) {
            const preferredLead = queue.find((entry) => entry.id === DEFAULT_PROOF_LEAD_ID) ?? queue[0]
            if (preferredLead?.id) {
              setSelectedLeadId(preferredLead.id)
            }
          }
          if (!queue[0]?.id) {
            setSelectedLeadId('')
          }
          markRuntimeReady()
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handleRuntimeFailure(error, 'Failed to load the live queue.', {
            clearLiveState: true,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [authStatus, bookingRecords.length, deliveryQueue.length, handleRuntimeFailure, leadQuery, leadStageFilter, selectedLeadId])

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setLeadTimeline([])
      return
    }

    if (!activeLead?.id) {
      setLeadTimeline([])
      return
    }

    let cancelled = false

    fetchLeadTimeline(activeLead.id)
      .then((result) => {
        if (!cancelled) {
          setLeadTimeline(result.events ?? [])
          markRuntimeReady()
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handleRuntimeFailure(error, 'Failed to load the active workflow timeline.', {
            clearLiveState: true,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeLead?.id, authStatus, handleRuntimeFailure])

  useEffect(() => {
    if (!activeLead?.id) {
      return
    }

    if (queueRecords.some((entry) => entry.id === activeLead.id)) {
      return
    }

    if (queueRecords[0]?.id) {
      setSelectedLeadId(queueRecords[0].id)
    }
  }, [activeLead?.id, queueRecords])

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return
    }

    let closed = false
    let stream: EventSource | null = null

    try {
      stream = new EventSource('/api/realtime/stream')
      const refreshState = () => {
        startTransition(() => {
          fetchBootstrap()
            .then((snapshot) => {
              if (!closed) {
                applySnapshot(snapshot)
                markRuntimeReady()
              }
            })
            .catch((error) => {
              if (!closed) {
                handleRuntimeFailure(
                  error,
                  'Realtime refresh failed while loading the console state.',
                  {
                    clearLiveState: true,
                  },
                )
              }
            })
          fetchQueue({
            q: leadQuery,
            stage: leadStageFilter === 'all' ? undefined : leadStageFilter,
          })
            .then((queue) => {
              if (!closed) {
                setQueueRecords(queue)
                if (!queue[0]?.id) {
                  setSelectedLeadId('')
                }
                markRuntimeReady()
              }
            })
            .catch((error) => {
              if (!closed) {
                handleRuntimeFailure(error, 'Realtime refresh failed while loading the live queue.', {
                  clearLiveState: true,
                })
              }
            })
          fetchReportsOverview()
            .then((reports) => {
              if (!closed) {
                setReportsOverview(reports)
                markRuntimeReady()
              }
            })
            .catch((error) => {
              if (!closed) {
                handleRuntimeFailure(error, 'Realtime refresh failed while loading reports.', {
                  clearLiveState: true,
                })
              }
            })
          fetchSyncStatus()
            .then((sync) => {
              if (!closed) {
                setSyncStatus(sync)
                markRuntimeReady()
              }
            })
            .catch((error) => {
              if (!closed) {
                handleRuntimeFailure(error, 'Realtime refresh failed while loading sync status.', {
                  clearLiveState: true,
                })
              }
            })
          if (activeLead?.id) {
            fetchLeadTimeline(activeLead.id)
              .then((result) => {
                if (!closed) {
                  setLeadTimeline(result.events ?? [])
                  markRuntimeReady()
                }
              })
              .catch((error) => {
                if (!closed) {
                  handleRuntimeFailure(error, 'Realtime refresh failed while loading the active workflow timeline.', {
                    clearLiveState: true,
                  })
                }
              })
          }
        })
      }
      ;[
        'state.changed',
        'sync.pushed',
        'sync.pulled',
        'sync.remote_changed',
        'sync.supabase_updated',
      ].forEach((eventName) => {
        stream?.addEventListener(eventName, refreshState)
      })
      stream.addEventListener('error', () => {
        if (!closed) {
          setRuntimeStatus('degraded')
          setApiError('Realtime stream disconnected. Live updates are degraded until the next successful reconnect.')
        }
      })
    } catch {
      setRuntimeStatus('degraded')
      setApiError('Failed to start the realtime stream for the authenticated console.')
      return
    }

    return () => {
      closed = true
      stream?.close()
    }
  }, [activeLead?.id, authStatus, handleRuntimeFailure, leadQuery, leadStageFilter])

  const appendAuditEvent = (
    event: Omit<AuditEvent, 'id' | 'timestamp'>,
    timestamp = new Date().toISOString(),
  ) => {
    setAuditEvents((current) => [
      {
        id: `aud-${String(current.length + 1).padStart(3, '0')}`,
        timestamp,
        ...event,
      },
      ...current,
    ])
  }

  const applySnapshot = (snapshot: {
    leadRecords?: Lead[]
    conversations?: Conversation[]
    bookingRecords?: Booking[]
    onboardingRuns?: OnboardingRun[]
    webhookHistory?: WebhookEvent[]
    connectorStates?: Record<string, ConnectorState>
    deliveryQueue?: DeliveryItem[]
    operatorNotesHistory?: OperatorNote[]
    auditEvents?: AuditEvent[]
    integrationEvents?: IntegrationEvent[]
    liveTestRuns?: LiveTestRun[]
    ruleTestResults?: Record<string, RuleTestResult>
    dashboard?: {
      leadsToday: number
      bookedCalls: number
      recoveredNoShows: number
      stripeRevenue: number
      pipelineBreakdown?: Record<string, number>
    }
  }) => {
    if (snapshot.leadRecords) {
      setLeadRecords(snapshot.leadRecords)
    }
    if (snapshot.conversations) {
      setConversationRecords(snapshot.conversations)
    }
    if (snapshot.bookingRecords) {
      setBookingRecords(snapshot.bookingRecords)
    }
    if (snapshot.onboardingRuns) {
      setOnboardingRuns(snapshot.onboardingRuns)
    }
    if (snapshot.webhookHistory) {
      setWebhookHistory(snapshot.webhookHistory)
    }
    if (snapshot.connectorStates) {
      setConnectorStates(snapshot.connectorStates)
    }
    if (snapshot.deliveryQueue) {
      setDeliveryQueue(snapshot.deliveryQueue)
    }
    if (snapshot.operatorNotesHistory) {
      setOperatorNotesHistory(snapshot.operatorNotesHistory)
    }
    if (snapshot.auditEvents) {
      setAuditEvents(snapshot.auditEvents)
    }
    if (snapshot.integrationEvents) {
      setIntegrationEvents(snapshot.integrationEvents)
    }
    if (snapshot.liveTestRuns) {
      setLiveTestRuns(snapshot.liveTestRuns)
    }
    if (snapshot.ruleTestResults) {
      setRuleTestResults(snapshot.ruleTestResults)
    }
    if (snapshot.dashboard) {
      setDashboardSummary(snapshot.dashboard)
    }
  }

  const handleStepChange = (nextStepIndex: number) => {
    const boundedStep = Math.max(0, Math.min(nextStepIndex, runtime.stepLabels.length - 1))
    setStepIndex(boundedStep)
    setWebhookInput(JSON.stringify(runtime.payloads[boundedStep], null, 2))
    setWebhookResult(null)
    appendAuditEvent({
      kind: 'scenario',
      title: 'Workflow step advanced',
      detail: `Moved to ${runtime.stepLabels[boundedStep]} for ${activeScenario.title}.`,
      target: activeScenario.id,
    })
  }

  const handleWorkbenchTabChange = (nextTab: WorkbenchTab) => {
    const nextScenarioId = workbenchScenarioMap[nextTab]
    const nextRuntime = scenarioRuntimes[nextScenarioId]
    const nextScenario = demoScenarios.find((scenario) => scenario.id === nextScenarioId)
    const boundedStep = Math.max(0, Math.min(stepIndex, nextRuntime.stepLabels.length - 1))

    setWorkbenchTab(nextTab)
    setScenarioId(nextScenarioId)
    if (nextScenario?.leadId) {
      setSelectedLeadId(nextScenario.leadId)
    }
    setStepIndex(boundedStep)
    setWebhookInput(JSON.stringify(nextRuntime.payloads[boundedStep], null, 2))
    setWebhookResult(null)
  }

  const focusScenario = (nextScenarioId: string) => {
    const nextScenario = demoScenarios.find((scenario) => scenario.id === nextScenarioId)
    if (!nextScenario) {
      return
    }

    const nextTab = nextScenario.id === 'scenario-002' ? 'recovery' : 'funnel'
    const nextRailTab = nextScenario.id === 'scenario-003' ? 'metrics' : 'operations'

    setSelectedLeadId(nextScenario.leadId)
    setScenarioId(nextScenario.id)
    setWorkbenchTab(nextScenario.id === 'scenario-003' ? 'payload' : nextTab)
    setRailTab(nextRailTab)
    setStepIndex(0)
    setWebhookInput(JSON.stringify(scenarioRuntimes[nextScenario.id].payloads[0], null, 2))
    setWebhookResult({
      status: 'accepted',
      message: `${nextScenario.title} loaded for replay.`,
    })
    appendAuditEvent({
      kind: 'scenario',
      title: 'Scenario replay loaded',
      detail: `${nextScenario.title} is now active in replay mode.`,
      target: nextScenario.id,
    })
  }

  const focusLeadRecord = (lead: QueueLead) => {
    const phase = deriveLifecyclePhaseFromLead(lead)
    setSelectedLeadId(lead.id)
    setScenarioId(inferScenarioIdFromStage(lead.stage))
    setWorkbenchTab(phase === 'payment' || phase === 'onboarding' ? 'payload' : phase === 'alert' || phase === 'booking' ? 'recovery' : 'funnel')
    setRailTab(phase === 'payment' ? 'metrics' : phase === 'onboarding' ? 'tools' : phase === 'alert' ? 'audit' : phase === 'booking' ? 'operations' : 'inbox')
    setStepIndex(0)
  }

  const focusLifecycleNode = (target: { railTab: RailTab; workbenchTab: WorkbenchTab }) => {
    if (activeLead) {
      setSelectedLeadId(activeLead.id)
    }
    setRailTab(target.railTab)
    setWorkbenchTab(target.workbenchTab)
  }

  const simulateWebhookFailure = () => {
    setScenarioId('scenario-001')
    setSelectedLeadId('lead-001')
    setWorkbenchTab('funnel')
    setRailTab('operations')
    setStepIndex(0)
    setWebhookInput('{"event_name":"Purchase"')
    setWebhookResult({
      status: 'rejected',
      message: 'Webhook failure simulated: malformed payload and failed validation.',
    })
    appendAuditEvent({
      kind: 'webhook',
      title: 'Webhook failure simulated',
      detail: 'Malformed JSON payload loaded into the replay lab.',
      target: 'simulated-webhook',
    })
  }

  const simulateSyncDrift = () => {
    setRailTab('metrics')
    setSyncDiff({
      ok: true,
      diff: {
        leads: { localOnly: ['lead-sim-local'], remoteOnly: ['lead-sim-remote'], shared: 2 },
        bookings: { localOnly: ['book-sim-local'], remoteOnly: ['book-sim-remote'], shared: 1 },
        conversations: { localOnly: [], remoteOnly: ['conv-sim-remote'], shared: 2 },
        deliveries: { localOnly: ['delivery-sim-local'], remoteOnly: [], shared: 3 },
        attempts: { localOnly: ['attempt-sim-local'], remoteOnly: ['attempt-sim-remote'], shared: 1 },
        audit: { localOnly: [], remoteOnly: ['audit-sim-remote'], shared: 4 },
        notes: { localOnly: ['note-sim-local'], remoteOnly: [], shared: 1 },
        tests: { localOnly: ['test-sim-local'], remoteOnly: ['test-sim-remote'], shared: 1 },
      },
    })
    setWebhookResult({
      status: 'rejected',
      message: 'Sync drift simulated: local and remote snapshots diverge.',
    })
    appendAuditEvent({
      kind: 'connector',
      title: 'Sync drift simulated',
      detail: 'Injected diff highlights local-only and remote-only rows for replay narration.',
      target: 'simulated-sync',
    })
  }

  const simulateOnboardingFailure = () => {
    setScenarioId('scenario-003')
    setSelectedLeadId('lead-003')
    setStepIndex(0)
    setWorkbenchTab('payload')
    setRailTab('tools')
    setWebhookResult({
      status: 'rejected',
      message: 'Onboarding issue simulated: provisioning stopped before handoff completed.',
    })
    setToolArtifact({
      title: 'Onboarding triage note',
      payload: [
        'Onboarding failed during provisioning.',
        'Current lead: Jade Porter (@jadeteaches)',
        'Likely failure: missing folder template or invite handoff.',
        'Next step: retry provisioning, then confirm folder, SOP, and invite links.',
      ].join('\n'),
    })
    appendAuditEvent({
      kind: 'scenario',
      title: 'Onboarding failure simulated',
      detail: 'Replay lab switched to the onboarding exception branch.',
      target: 'simulated-onboarding',
    })
  }

  const validateWebhookPayload = (raw: string): WebhookValidation => {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const hasRecognizedSignal =
        typeof parsed.event_name === 'string' ||
        typeof parsed.booking_status === 'string' ||
        typeof parsed.route === 'string' ||
        Array.isArray(parsed.onboarding_assets)

      if (!hasRecognizedSignal) {
        return {
          ok: false,
          message: 'Rejected: payload is valid JSON but missing a recognized automation signal.',
        }
      }

      return {
        ok: true,
        parsed,
        label: String(parsed.event_name ?? parsed.route ?? parsed.booking_status ?? 'custom event'),
      }
    } catch {
      return { ok: false, message: 'Rejected: payload is not valid JSON.' }
    }
  }

  const handleWebhookValidate = async () => {
    try {
      const response = await validateWebhookRequest(webhookInput)
      applySnapshot(response.snapshot)
      setWebhookResult({
        status: 'accepted',
        message: response.message,
      })
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Webhook validation failed.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Webhook validation failed.',
      })
      return
    }
  }

  const handleWebhookReplay = (item: WebhookEvent) => {
    setWebhookInput(item.payload)
    const result = validateWebhookPayload(item.payload)
    if (!result.ok) {
      setWebhookResult({
        status: 'rejected',
        message: `Replay failed: ${result.message}`,
      })
      return
    }
    setWebhookResult({
      status: 'accepted',
      message: `Replayed ${item.label} into the simulator.`,
    })
    setWebhookHistory((current) => [
      {
        id: `wh-${String(current.length + 1).padStart(3, '0')}`,
        label: `Replay: ${item.label}`,
        payload: JSON.stringify(result.parsed, null, 2),
      },
      ...current,
    ])
    appendAuditEvent({
      kind: 'webhook',
      title: 'Webhook replayed',
      detail: `Replayed ${item.label} and queued the payload back into the simulator.`,
      target: item.id,
    })
  }

  const handleRunWorkflow = async () => {
    if (!activeLead) {
      setWebhookResult({
        status: 'rejected',
        message: 'No live lead is loaded. Restore the runtime before running a workflow.',
      })
      return
    }

    try {
      let response: { snapshot?: unknown; ok?: boolean; message?: string } | null = null

      if (activeScenario.id === 'scenario-001') {
        if (stepIndex >= 2) {
          response = await runStripePaymentRequest({
            handle: activeLead.handle,
            amount: parseMoneyValue(activeLead.budget) || 49,
            offer: activeLead.offer,
          })
        } else {
          response = await runDmIntakeRequest({
            handle: activeLead.handle,
            name: activeLead.name,
            source: activeLead.source,
            offer: activeLead.offer,
            budget: activeLead.budget,
            message: activeConversation?.messages[0]?.text ?? 'price for the sprint?',
          })
        }
      } else if (activeScenario.id === 'scenario-002') {
        response = await runBookingUpdateRequest({
          handle: activeLead.handle,
          status: stepIndex >= 3 ? 'recovered' : stepIndex >= 2 ? 'no-show' : 'booked',
          slot: activeBooking?.slot ?? '2026-04-04T15:00:00Z',
        })
      } else {
        response =
          stepIndex >= 2
            ? await runOnboardingProvisionRequest({ handle: activeLead.handle })
            : await runStripePaymentRequest({
                handle: activeLead.handle,
                amount: parseMoneyValue(activeLead.budget) || 97,
                offer: activeLead.offer,
              })
      }

      if (response?.snapshot) {
        applySnapshot(response.snapshot as never)
      }
      markRuntimeReady()

      setWebhookResult({
        status: 'accepted',
        message:
          response?.message ??
          `Executed the live ${runtime.stepLabels[stepIndex].toLowerCase()} workflow against the backend.`,
      })
    } catch (error) {
      handleRuntimeFailure(error, 'Workflow execution failed.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Workflow execution failed.',
      })
    }
  }

  const handleCaptureLead = async () => {
    const handle = intakeHandle.trim()
    const message = intakeMessage.trim()

    if (!handle || !message) {
      setWebhookResult({
        status: 'rejected',
        message: 'Handle and inbound DM are required.',
      })
      return
    }

    try {
      const response = await runDmIntakeRequest({
        handle: handle.startsWith('@') ? handle : `@${handle}`,
        source: intakeSource,
        offer: intakeOffer,
        message,
      })
      if (response.snapshot) {
        applySnapshot(response.snapshot)
      }

      const refreshedQueue = await fetchQueue({
        q: handle.replace(/^@/, ''),
      })
      setQueueRecords((current) => {
        const next = refreshedQueue.length ? refreshedQueue : current
        const matched = next.find((entry) => entry.handle === (handle.startsWith('@') ? handle : `@${handle}`))
        if (matched) {
          setSelectedLeadId(matched.id)
          setScenarioId(inferScenarioIdFromStage(matched.stage))
        }
        return next
      })
      markRuntimeReady()

      setIntakeHandle('')
      setIntakeMessage('')
      setWebhookResult({
        status: 'accepted',
        message: response.message ?? 'Inbound DM captured and queued.',
      })
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to capture inbound DM.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to capture inbound DM.',
      })
    }
  }

  const handleRunLiveTest = async () => {
    const payload = JSON.stringify(activePayload, null, 2)
    try {
      const response = await runLiveTestRequest({
        scenarioId: activeScenario.id,
        scenarioTitle: activeScenario.title,
        stepLabel: runtime.stepLabels[stepIndex],
        payload,
      })
      applySnapshot(response.snapshot)
      markRuntimeReady()
      setWebhookInput(payload)
      setWebhookResult({
        status: response.ok ? 'accepted' : 'rejected',
        message: response.message,
      })
      setConnectorActionResult({
        title: 'Replay active scenario',
        detail: response.message,
        kind: 'replay',
        status: response.ok ? 'accepted' : 'rejected',
        timestamp: new Date().toISOString(),
      })
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Live test execution failed.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Live test execution failed.',
      })
      setConnectorActionResult({
        title: 'Replay active scenario',
        detail: error instanceof Error ? error.message : 'Live test execution failed.',
        kind: 'replay',
        status: 'rejected',
        timestamp: new Date().toISOString(),
      })
      return
    }
  }

  const handleRerunConnectorRun = async (run: EnrichedLiveTestRun) => {
    try {
      const response = await runLiveTestRequest({
        scenarioId: run.scenarioId,
        scenarioTitle: run.scenarioTitle,
        stepLabel: run.stepLabel,
        payload: run.payload,
      })
      applySnapshot(response.snapshot)
      markRuntimeReady()
      setWebhookResult({
        status: response.ok ? 'accepted' : 'rejected',
        message: response.message,
      })
      setConnectorActionResult({
        title: 'Replay selected run',
        detail: response.message,
        kind: 'replay',
        status: response.ok ? 'accepted' : 'rejected',
        timestamp: new Date().toISOString(),
      })
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Live test execution failed.')
      setConnectorActionResult({
        title: 'Replay selected run',
        detail: error instanceof Error ? error.message : 'Live test execution failed.',
        kind: 'replay',
        status: 'rejected',
        timestamp: new Date().toISOString(),
      })
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Live test execution failed.',
      })
      return
    }
  }

  const handleLoadProofPreview = async (target: 'slack' | 'sheets') => {
    setRecipePending(target)
    try {
      const payload = target === 'slack' ? await fetchSlackExportPreview() : await fetchSheetsExportPreview()
      setProofPreview({
        title: target === 'slack' ? 'Slack export preview' : 'Google Sheets export preview',
        payload: JSON.stringify(payload, null, 2),
      })
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to load the export preview.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to load the export preview.',
      })
    } finally {
      setRecipePending(null)
    }
  }

  const handleRunRecipe = async (recipeId: string) => {
    setRecipePending(recipeId)
    try {
      if (recipeId === 'dm-sprint') {
        const handle = (activeLead?.handle || intakeHandle || '@demoautomation').trim()
        const response = await runDmIntakeRequest({
          handle: handle.startsWith('@') ? handle : `@${handle}`,
          name: activeLead?.name,
          source: activeLead?.source || intakeSource,
          offer: activeLead?.offer || intakeOffer,
          budget: activeLead?.budget,
          message: activeConversation?.messages[0]?.text || intakeMessage || 'price for the sprint?',
        })
        if (response.snapshot) {
          applySnapshot(response.snapshot)
        }
        const refreshedQueue = await fetchQueue()
        setQueueRecords(refreshedQueue)
        const matchedLead = refreshedQueue.find((entry) => entry.handle === (handle.startsWith('@') ? handle : `@${handle}`))
        if (matchedLead) {
          setSelectedLeadId(matchedLead.id)
          setScenarioId(inferScenarioIdFromStage(matchedLead.stage))
        }
        setWebhookResult({
          status: 'accepted',
          message: response.message ?? 'DM sprint workflow executed.',
        })
        setConnectorActionResult({
          title: 'Replay proof flow',
          detail: response.message ?? 'DM sprint workflow executed.',
          kind: 'replay',
          status: 'accepted',
          timestamp: new Date().toISOString(),
        })
      }

      if (recipeId === 'ghl-recovery' && activeLead) {
        const response = await runBookingUpdateRequest({
          handle: activeLead.handle,
          status: 'no-show',
          slot: activeBooking?.slot ?? '2026-04-05T15:00:00Z',
        })
        if (response.snapshot) {
          applySnapshot(response.snapshot)
        }
        setWebhookResult({
          status: 'accepted',
          message: response.message ?? 'No-show recovery workflow executed.',
        })
        setConnectorActionResult({
          title: 'Replay proof flow',
          detail: response.message ?? 'No-show recovery workflow executed.',
          kind: 'replay',
          status: 'accepted',
          timestamp: new Date().toISOString(),
        })
      }

      if (recipeId === 'stripe-capi' && activeLead) {
        const response = await runStripePaymentRequest({
          handle: activeLead.handle,
          amount: parseMoneyValue(activeLead.budget) || 49,
          offer: activeLead.offer,
        })
        if (response.snapshot) {
          applySnapshot(response.snapshot)
        }
        setWebhookResult({
          status: 'accepted',
          message: response.message ?? 'Stripe to Meta CAPI workflow executed.',
        })
        setConnectorActionResult({
          title: 'Replay proof flow',
          detail: response.message ?? 'Stripe to Meta CAPI workflow executed.',
          kind: 'replay',
          status: 'accepted',
          timestamp: new Date().toISOString(),
        })
      }

      if (recipeId === 'onboarding' && activeLead) {
        const response = await runOnboardingProvisionRequest({ handle: activeLead.handle })
        if (response.snapshot) {
          applySnapshot(response.snapshot)
        }
        setWebhookResult({
          status: 'accepted',
          message: response.message ?? 'Onboarding autopilot executed.',
        })
        setConnectorActionResult({
          title: 'Replay proof flow',
          detail: response.message ?? 'Onboarding autopilot executed.',
          kind: 'replay',
          status: 'accepted',
          timestamp: new Date().toISOString(),
        })
      }

      markRuntimeReady()
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to execute the selected proof recipe.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to execute the selected proof recipe.',
      })
      setConnectorActionResult({
        title: 'Replay proof flow',
        detail: error instanceof Error ? error.message : 'Failed to execute the selected proof recipe.',
        kind: 'replay',
        status: 'rejected',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setRecipePending(null)
    }
  }

  const handleDispatchExport = async (target: 'slack' | 'sheets') => {
    setDispatchPending(target)
    try {
      const result = target === 'slack' ? await sendSlackExport() : await sendSheetsExport()
      setWebhookResult({
        status: result.ok ? 'accepted' : 'rejected',
        message:
          result.ok
            ? `${target === 'slack' ? 'Slack' : 'Google Sheets'} export dispatched successfully.`
            : `${target === 'slack' ? 'Slack' : 'Google Sheets'} export failed with status ${result.status}.`,
      })
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to dispatch the export.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to dispatch the export.',
      })
    } finally {
      setDispatchPending(null)
    }
  }

  const refreshSyncState = useCallback(async () => {
    setSyncPending('status')
    try {
      const status = await fetchSyncStatus()
      setSyncStatus(status)
      if (status.configured && !('error' in status.remote) && status.remote.found) {
        setSyncPending('diff')
        try {
          const diff = await fetchSyncDiff()
          setSyncDiff(diff)
        } catch {
          setSyncDiff(null)
        }
      } else {
        setSyncDiff(null)
      }
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to load sync status.')
    } finally {
      setSyncPending(null)
    }
  }, [handleRuntimeFailure])

  const handleSyncPush = async () => {
    setSyncPending('push')
    try {
      const result = await pushSync()
      setWebhookResult({
        status: result.ok ? 'accepted' : 'rejected',
        message: result.ok
          ? result.message ?? 'Local snapshot pushed to the repo-owned Supabase state.'
          : result.message ?? 'Local snapshot push failed.',
      })
      await refreshSyncState()
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to push sync state.')
    } finally {
      setSyncPending(null)
    }
  }

  const handleSyncPull = async () => {
    setSyncPending('pull')
    try {
      const result = await pullSync()
      if (result.snapshot) {
        applySnapshot(result.snapshot as never)
      }
      setWebhookResult({
        status: result.ok ? 'accepted' : 'rejected',
        message: result.message ?? 'Remote snapshot pulled into the local runtime.',
      })
      await refreshSyncState()
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to pull sync state.')
    } finally {
      setSyncPending(null)
    }
  }

  const handleSyncReconcile = async () => {
    setSyncPending('reconcile')
    try {
      const result = await reconcileSync('merge-prefer-local')
      if (result.snapshot) {
        applySnapshot(result.snapshot as never)
      }
      setWebhookResult({
        status: result.ok ? 'accepted' : 'rejected',
        message: result.message ?? 'Reconciled local state against the remote snapshot.',
      })
      await refreshSyncState()
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to reconcile sync state.')
    } finally {
      setSyncPending(null)
    }
  }

  const handleBuildToolArtifact = async (templateId: string) => {
    setToolPending(templateId)
    try {
      const template = toolTemplates.find((entry) => entry.id === templateId)
      if (!template) {
        return
      }

      const leadName = activeLead?.name ?? 'Active lead unavailable'
      const leadHandle = activeLead?.handle ?? '@demoautomation'
      const queueTotal = reportsOverview?.queueSummary.total ?? queueRecords.length
      const recoveryCount = reportsOverview?.queueSummary.recovery ?? queueRecords.filter((entry) => entry.lane === 'recovery').length
      const failedCount = reportsOverview?.outboxSummary.failed ?? failedDeliveries.length
      const revenueValue = missionStats.find((metric) => metric.label === 'Stripe Revenue')?.value ?? '$0'

      let payload = ''

      if (templateId === 'proof-pack') {
        payload = [
          `Proof pack: ${activeScenario.title}`,
          `Interview mode: ${interviewMode ? 'on' : 'off'}`,
          `Lead: ${leadName} (${leadHandle})`,
          `Source: ${activeLead?.source ?? 'unknown'}`,
          `Offer: ${activeLead?.offer ?? 'unknown'}`,
          `Queue pressure: ${queueTotal} total / ${recoveryCount} recovery`,
          `Revenue snapshot: ${revenueValue}`,
          `Connector backlog: ${reportsOverview?.outboxSummary.queued ?? 0} queued / ${failedCount} failed`,
          `Narrative path: ${interviewGuideSteps.map((step) => step.title).join(' -> ')}`,
          `Proven stack: ${requirementCoverage
            .map((item) => item.label)
            .slice(0, 5)
            .join(' • ')}`,
          'Next step: walk the queue, replay the workflow, then copy the proof pack as a follow-up artifact.',
        ].join('\n')
      } else if (templateId === 'sop-handoff') {
        payload = [
          `SOP handoff: ${template.title}`,
          `Scenario: ${activeScenario.title}`,
          `Current lead: ${leadName} (${leadHandle})`,
          `Working stage: ${activeLead?.stage ?? 'unknown'}`,
          '1. Inspect the active lead and route.',
          '2. Check the delivery outbox for retries or stuck relays.',
          '3. Review the connector row and ping anything that is attention-needed.',
          '4. Export the proof pack if you need a handoff artifact.',
        ].join('\n')
      } else {
        const failedLines = failedDeliveries.length
          ? failedDeliveries.map((item) => `${item.connector}: ${item.payloadLabel} (${item.note})`)
          : ['No failed deliveries in the current outbox snapshot.']

        const attentionLines = attentionConnectors.length
          ? attentionConnectors.map((entry) => `${entry.name}: ${entry.status} • ${entry.note}`)
          : ['No attention-needed connectors in the current snapshot.']

        payload = [
          `Failure triage: ${activeScenario.title}`,
          ...failedLines,
          ...attentionLines,
          `Runtime status: ${runtimeStatus}`,
          `Recovery count: ${recoveryCount}`,
          'Next step: retry the first failed relay or ping the connector that needs attention.',
        ].join('\n')
      }

      setToolArtifact({
        title: template.title,
        payload,
      })
      setWebhookResult({
        status: 'accepted',
        message: `${template.title} generated from live state.`,
      })
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to build the internal tool artifact.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to build the internal tool artifact.',
      })
      return
    } finally {
      setToolPending(null)
    }
  }

  const handleCopyToolArtifact = async () => {
    if (!toolArtifact) {
      return
    }

    try {
      await navigator.clipboard.writeText(toolArtifact.payload)
      setWebhookResult({
        status: 'accepted',
        message: `${toolArtifact.title} copied to clipboard.`,
      })
    } catch {
      setWebhookResult({
        status: 'rejected',
        message: 'Clipboard copy failed. Use the visible artifact text instead.',
      })
    }
  }

  const handleRuntimeReset = async () => {
    setInterviewMode(false)
    setRuntimeResetPending(true)
    try {
      const snapshot = await resetRuntimeState()
      applySnapshot(snapshot as never)
      const [nextQueue, nextReports] = await Promise.all([fetchQueue(), fetchReportsOverview()])
      setQueueRecords(nextQueue)
      setReportsOverview(nextReports)
      setToolArtifact(null)
      const nextLead = nextQueue.find((entry) => entry.id === DEFAULT_PROOF_LEAD_ID) ?? nextQueue[0] ?? null
      setSelectedLeadId(nextLead?.id ?? '')
      const nextScenarioId = nextLead ? inferScenarioIdFromStage(nextLead.stage) : DEFAULT_PROOF_SCENARIO_ID
      setScenarioId(nextScenarioId)
      setWebhookInput(JSON.stringify(scenarioRuntimes[nextScenarioId].payloads[0], null, 2))
      setWorkbenchTab(DEFAULT_PROOF_WORKBENCH_TAB)
      setRailTab(DEFAULT_PROOF_RAIL_TAB)
      setStepIndex(0)
      setWebhookResult({
        status: 'accepted',
        message: 'Runtime reset to the seeded payment-to-onboarding proof path.',
      })
      markRuntimeReady()
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to reset the runtime.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to reset the runtime.',
      })
    } finally {
      setRuntimeResetPending(false)
    }
  }

  const focusInterviewStep = (step: InterviewGuideStep) => {
    setInterviewMode(true)
    setSelectedLeadId(step.leadId)
    setScenarioId(step.scenarioId)
    setWorkbenchTab(step.workbenchTab)
    setRailTab(step.railTab)
    setStepIndex(0)
    setWebhookInput(JSON.stringify(scenarioRuntimes[step.scenarioId].payloads[0], null, 2))
    setWebhookResult({
      status: 'accepted',
      message: `${step.title} selected for the interview walkthrough.`,
    })
    appendAuditEvent({
      kind: 'scenario',
      title: 'Interview walkthrough step selected',
      detail: `${step.title} is now the active guide step.`,
      target: step.id,
    })
  }

  const applyInterviewStep = async (step: InterviewGuideStep) => {
    setInterviewMode(true)
    setRuntimeResetPending(true)
    try {
      const snapshot = await resetRuntimeState()
      applySnapshot(snapshot as never)
      const [nextQueue, nextReports] = await Promise.all([fetchQueue(), fetchReportsOverview()])
      setQueueRecords(nextQueue)
      setReportsOverview(nextReports)
      setToolArtifact(null)
      focusInterviewStep(step)
      setWebhookResult({
        status: 'accepted',
        message: `${step.title} loaded for the interview walkthrough.`,
      })
      markRuntimeReady()
      return { nextQueue, nextReports }
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to load interview mode.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to load interview mode.',
      })
      return null
    } finally {
      setRuntimeResetPending(false)
    }
  }

  const handleInterviewMode = async () => {
    await applyInterviewStep(interviewGuideSteps[0])
  }

  const evaluateRule = (rule: RuleDraft): RuleTestResult => {
    const timestamp = new Date().toISOString()
    if (!rule.enabled) {
      return { status: 'skipped', detail: 'Rule disabled in the current simulator run.', timestamp }
    }

    const transcript = (activeConversation?.messages ?? [])
      .map((message) => message.text)
      .join(' ')
      .toLowerCase()
    const trigger = rule.trigger.toLowerCase()

    if (trigger.includes('keyword')) {
      const keywords = ['price', 'link', 'join']
      const matched = keywords.some((keyword) => transcript.includes(keyword))
      return {
        status: matched ? 'pass' : 'fail',
        detail: matched
          ? 'Matched intent keyword in the DM transcript.'
          : 'No keyword match in the current DM transcript.',
        timestamp,
      }
    }

    if (trigger.includes('intent')) {
      const matched =
        activeConversation?.intent === 'call' || activeConversation?.intent === 'checkout'
      return {
        status: matched ? 'pass' : 'fail',
        detail: matched
          ? `Matched intent signal: ${activeConversation?.intent}.`
          : 'Intent signal missing for this scenario.',
        timestamp,
      }
    }

    if (trigger.includes('webhook') || trigger.includes('call missed') || trigger.includes('no-show')) {
      const matched = runtime.bookingStatuses[stepIndex] === 'no-show'
      return {
        status: matched ? 'pass' : 'fail',
        detail: matched ? 'No-show status detected in the active booking state.' : 'No-show not present.',
        timestamp,
      }
    }

    const hasActions = rule.actions.length > 0
    return {
      status: hasActions ? 'pass' : 'fail',
      detail: hasActions ? 'Rule has runnable actions defined.' : 'No actions defined to execute.',
      timestamp,
    }
  }

  const handleRuleTest = (ruleId: string) => {
    const rule = ruleDrafts.find((entry) => entry.id === ruleId)
    if (!rule) {
      return
    }
    const result = evaluateRule(rule)
    setRuleTestResults((current) => ({
      ...current,
      [ruleId]: result,
    }))
    appendAuditEvent({
      kind: 'rule',
      title: `Rule test ${result.status}`,
      detail: result.detail,
      target: ruleId,
    })
  }

  const handleLogNote = async () => {
    const trimmed = operatorNotes.trim()
    if (!trimmed) {
      return
    }

    try {
      const response = await logNoteRequest(trimmed, activeScenario.id, runtime.stepLabels[stepIndex])
      applySnapshot(response.snapshot)
      markRuntimeReady()
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to log the operator note.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to log the operator note.',
      })
      return
    }
  }

  const handleLeadAction = async (
    action: 'checkout' | 'route' | 'no-show' | 'recover' | 'alert',
    leadId: string,
  ) => {
    const lead = leadRecords.find((entry) => entry.id === leadId)
    if (!lead) {
      return
    }

    try {
      const response = await runLeadAction(leadId, action)
      applySnapshot(response.snapshot)
      markRuntimeReady()
      setWebhookResult({
        status: 'accepted',
        message: response.message ?? `Executed ${action} action for ${lead.handle}.`,
      })
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to run the selected lead action.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to run the selected lead action.',
      })
      return
    }
  }

  const handleDeliveryRetry = async (deliveryId: string) => {
    try {
      const response = await retryDeliveryRequest(deliveryId)
      applySnapshot(response.snapshot)
      markRuntimeReady()
      setConnectorActionResult({
        title: 'Retry delivery',
        detail: response.message ?? 'Delivery retried successfully.',
        kind: 'retry',
        status: 'accepted',
        timestamp: new Date().toISOString(),
      })
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to retry the delivery item.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to retry the delivery item.',
      })
      setConnectorActionResult({
        title: 'Retry delivery',
        detail: error instanceof Error ? error.message : 'Failed to retry the delivery item.',
        kind: 'retry',
        status: 'rejected',
        timestamp: new Date().toISOString(),
      })
      return
    }
  }

  const handleConnectorPing = async (connectorName: string) => {
    const current = connectorStates[connectorName]
    if (!current) {
      return
    }

    try {
      const response = await pingConnectorRequest(connectorName)
      applySnapshot(response.snapshot)
      markRuntimeReady()
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to ping the connector.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to ping the connector.',
      })
      return
    }
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthPending(true)
    setApiError(null)

    try {
      await loginAdmin(loginUsername.trim(), loginPassword)
      const session = await fetchAdminSession()
      setAuthSession(session.session)
      setAuthStatus('authenticated')
      setRuntimeStatus('loading')
      setLoginPassword('')
    } catch (error) {
      clearLiveConsoleState()
      setAuthSession(null)
      setAuthStatus('auth_required')
      setApiError(error instanceof Error ? error.message : 'Login failed.')
    } finally {
      setAuthPending(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logoutAdmin()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Logout failed.')
    } finally {
      clearLiveConsoleState()
      setAuthSession(null)
      setAuthStatus('auth_required')
      setLoginPassword('')
    }
  }

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      scenario: activeLead?.name ? `${activeLead.name} workflow` : activeScenario.title,
      step: runtime.stepLabels[stepIndex],
      stepIndex,
      lead: activeLead,
      conversation: {
        id: activeConversation?.id ?? null,
        intent: activeConversation?.intent ?? null,
        score: activeConversation?.score ?? null,
        transcript: visibleMessages,
      },
      bookingStatus: runtime.bookingStatuses[stepIndex],
      visibleEvents: activeAutomationTrail,
      webhookPayload: activePayload,
      notes: operatorNotes,
      notesHistory: operatorNotesHistory,
      webhookHistory,
      ruleDrafts,
      connectorStates,
      leadRecords,
      bookingRecords,
      deliveryQueue,
      ruleTestResults,
      auditEvents,
      liveTestRuns,
      metrics: railMetrics,
      capiEvents: capiRailEvents,
      syncStatus,
      syncDiff,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeLead?.id ?? activeScenario.id}-proof.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (authStatus !== 'authenticated') {
    return (
      <div className="console-shell console-shell-auth">
        <section className="auth-layout">
          <div className="auth-shell">
            <div className="auth-panel auth-panel-overview">
              <div className="auth-brand">
                <div className="auth-brand-copy">
                  <div className="auth-brand-title">COBE Operator Console</div>
                  <p className="auth-brand-subtitle">Creator funnel operations</p>
                </div>
              </div>

              <div className="auth-overview-copy">
                <h1>Live queue, workflow routing, and relay visibility.</h1>
                <p>
                  The console runs DM intake, booking updates, payment events, recovery actions, and downstream
                  delivery from the same backend.
                </p>
              </div>

              <section className="auth-overview-summary" aria-label="Console summary">
                <div className="auth-overview-summary-item">
                  <strong>Queue</strong>
                  <span>Prioritized leads, owner context, and next action.</span>
                </div>
                <div className="auth-overview-summary-item">
                  <strong>Workflows</strong>
                  <span>DM intake, booking updates, payment handoff, onboarding.</span>
                </div>
                <div className="auth-overview-summary-item">
                  <strong>Relays</strong>
                  <span>Meta CAPI, GHL, Stripe, Slack, and retryable outbox state.</span>
                </div>
              </section>

              <div className="auth-visual">
                <div className="auth-visual-glow auth-visual-glow-a" />
                <div className="auth-visual-glow auth-visual-glow-b" />
                <div className="auth-visual-screen">
                  <div className="auth-visual-screen-top">
                    <strong>Today</strong>
                    <span>Live operator runtime</span>
                  </div>
                  <div className="auth-visual-grid">
                    <div className="auth-visual-tile auth-visual-tile-large">
                      <span className="auth-visual-label">Queue</span>
                      <strong>{queueRecords.length || 3}</strong>
                      <p>Prioritized leads waiting for action.</p>
                    </div>
                    <div className="auth-visual-tile">
                      <span className="auth-visual-label">Relays</span>
                      <strong>{deliveryQueue.length || 4}</strong>
                      <p>Meta CAPI, Stripe, GHL, Slack.</p>
                    </div>
                    <div className="auth-visual-tile">
                      <span className="auth-visual-label">Runs</span>
                      <strong>{liveTestRuns.length || 0}</strong>
                      <p>Stored workflow test results.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="auth-panel auth-panel-form">
              {authStatus === 'checking' ? (
                <div className="auth-state">
                  <h2>Checking session</h2>
                  <p>The app is waiting on the backend session check.</p>
                </div>
              ) : (
                <form className="auth-form" onSubmit={handleLogin}>
                  <div className="auth-heading">
                    <h2>Sign in</h2>
                    <p>Use operator credentials for this console.</p>
                  </div>

                  <label className="auth-field">
                    <span>Username</span>
                    <input
                      className="auth-input"
                      type="text"
                      value={loginUsername}
                      onChange={(event) => setLoginUsername(event.target.value)}
                      autoComplete="username"
                    />
                  </label>

                  <label className="auth-field">
                    <span>Password</span>
                    <input
                      className="auth-input"
                      type="password"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      autoComplete="current-password"
                    />
                  </label>

                  <button type="submit" className="auth-submit-button" disabled={authPending}>
                    {authPending ? 'Signing in…' : 'Sign in'}
                  </button>

                  {apiError ? <p className="runtime-banner runtime-banner-auth_required">{apiError}</p> : null}
                </form>
              )}
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="console-shell">
      <header className="console-topbar">
        <div className="console-topbar-title">
          <div>
            <p className="eyebrow">Creator funnel ops</p>
            <h1>COBE operator console</h1>
          </div>
          <p>{runtimeStatus === 'ready' ? 'Cross-system workflow live' : 'Runtime requires attention'}</p>
        </div>

        <div className="console-topbar-metrics">
          {missionStats.slice(0, 3).map((stat) => (
            <article key={stat.label} className="topbar-metric">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>

        <div className="console-topbar-actions">
          <span className="topbar-status">
            {runtimeStatus === 'ready'
              ? 'Backend live'
              : runtimeStatus === 'loading'
                ? 'Loading runtime'
                : runtimeStatus === 'degraded'
                  ? 'Backend degraded'
                  : 'Awaiting session'}
          </span>
          <button type="button" className="button button-primary button-small" onClick={handleRunLiveTest}>
            Run live test
          </button>
          <button type="button" className="button button-secondary button-small" onClick={handleExport}>
            Export proof
          </button>
          <button type="button" className="button button-secondary button-small" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {runtimeStatus !== 'ready' && apiError ? (
        <div className="runtime-banner runtime-banner-degraded">
          <strong>Runtime attention required</strong>
          <span>{apiError}</span>
        </div>
      ) : null}

      <main className="console-grid">
        <aside className="console-panel queue-panel">
          <div className="section-topline">
            <div>
              <p className="panel-kicker">Lead queue</p>
              <h2>Prioritized inbox</h2>
            </div>
            <span className="status-pill">{filteredLeads.length} visible</span>
          </div>

          <div className="filters">
            <input
              className="audit-search"
              type="search"
              value={leadQuery}
              onChange={(event) => setLeadQuery(event.target.value)}
              placeholder="Search lead, handle, source, offer"
            />
            <select
              className="audit-select"
              value={leadStageFilter}
              onChange={(event) => setLeadStageFilter(event.target.value as FunnelStage | 'all')}
            >
              <option value="all">All stages</option>
              <option value="new">New</option>
              <option value="engaged">Engaged</option>
              <option value="checkout-sent">Checkout sent</option>
              <option value="booked">Booked</option>
              <option value="no-show">No-show</option>
              <option value="recovery">Recovery</option>
              <option value="won">Won</option>
            </select>
          </div>

          <div className="lead-queue">
            {prioritizedLeads.length === 0 ? (
              <div className="queue-empty-state">
                <p className="mini-label">
                  {runtimeStatus === 'degraded' ? 'Live queue unavailable' : 'No matching leads'}
                </p>
                <p className="queue-item-note">
                  {runtimeStatus === 'degraded'
                    ? 'Queue data is hidden until the backend can load it again.'
                    : 'Adjust the search or stage filter to bring leads back into the active queue.'}
                </p>
              </div>
            ) : null}

            {prioritizedLeads.map((lead) => {
              const isActive = lead.id === activeLead?.id
              const priorityLabel = lead.priorityBand
              const lifecyclePhase = deriveLifecyclePhaseFromLead(lead)

              return (
                <button
                  key={lead.id}
                  type="button"
                  className={`queue-item ${isActive ? 'queue-item-active' : ''}`}
                  onClick={() => focusLeadRecord(lead)}
                >
                  <div className="queue-item-topline">
                    <div>
                      <strong>{lead.name}</strong>
                    </div>
                    <div className="command-cluster">
                      <span className={`signal-badge signal-${priorityLabel}`}>{priorityLabel}</span>
                    </div>
                  </div>
                  <p className="queue-item-stage">
                    {lifecyclePhaseLabel(lifecyclePhase)} • {lead.handle}
                  </p>
                  <p className="queue-item-note">{lead.recommendedAction}</p>
                </button>
              )
            })}
          </div>

          <div className="queue-intake-block">
            <div className="section-topline">
              <div>
                <p className="mini-label">DM intake</p>
                <h3>Capture inbound lead</h3>
              </div>
              <span className="timeline-meta">IG / story / comment / form</span>
            </div>

            <div className="filters">
            <input
              className="audit-search"
              type="text"
              value={intakeHandle}
              onChange={(event) => setIntakeHandle(event.target.value)}
              placeholder="@handle"
            />
            <select
              className="audit-select"
              value={intakeSource}
              onChange={(event) => setIntakeSource(event.target.value)}
            >
              <option value="instagram_dm">Instagram DM</option>
              <option value="story_reply">Story reply</option>
              <option value="lead_form">Lead form</option>
              <option value="ig_comment_keyword">IG comment keyword</option>
            </select>
            <input
              className="audit-search"
              type="text"
              value={intakeOffer}
              onChange={(event) => setIntakeOffer(event.target.value)}
              placeholder="Offer"
            />
            <textarea
              className="notes-editor queue-intake-editor"
              value={intakeMessage}
              onChange={(event) => setIntakeMessage(event.target.value)}
              placeholder="Inbound DM or comment text"
            />
            <button
              type="button"
              className="button button-primary"
              onClick={handleCaptureLead}
            >
              Capture DM
            </button>
            </div>
          </div>
        </aside>

        <section
          className={`console-panel workspace-panel ${
            workbenchTab === 'payload' ? 'workspace-panel-payload' : ''
          }`}
        >
          {!hasLiveLead ? (
            <div className="queue-empty-state">
              <p className="mini-label">
                {runtimeStatus === 'degraded' ? 'Workflow shell degraded' : 'No live lead selected'}
              </p>
              <p className="queue-item-note">
                {runtimeStatus === 'degraded'
                  ? 'The authenticated workflow shell is waiting for a successful backend refresh.'
                  : 'Load a lead from the live queue to inspect the workflow shell.'}
              </p>
            </div>
          ) : null}

          <div className="workspace-header">
            <div className="workspace-header-row">
              <div className="workspace-title workspace-title-inline">
                <p className="panel-kicker">Active workflow</p>
                <h2>{activeLead?.name ? `${activeLead.name} workflow` : activeScenario.title}</h2>
              </div>

              <p className="stat-note workspace-next-action">
                {activeLead?.nextAction ??
                  'No live workflow state is available until the backend returns an authenticated queue record.'}
              </p>
            </div>

            <div className="workspace-summary-strip workspace-summary-strip-compact">
              <div className="workspace-summary-item">
                <span>Step</span>
                <strong>{runtime.stepLabels[stepIndex]}</strong>
                <p>
                  {runtime.leadStages[stepIndex]} · {stepIndex + 1}/{runtime.stepLabels.length}
                </p>
              </div>
              <div className="workspace-summary-item">
                <span>{runtime.metricLabel}</span>
                <strong>{activeMetricValue}</strong>
                <p>{activeLeadQueue[0]?.payloadLabel ?? activeScenario.revenueAngle}</p>
              </div>
              <div className="workspace-summary-item">
                <span>Operator target</span>
                <strong>{activeLead?.handle ?? 'No live lead loaded'}</strong>
                <p>{activeLead?.owner ? `Owner ${activeLead.owner}` : 'Owner unassigned'}</p>
              </div>
              <div className="workflow-track">
                <span>Flow status</span>
                <strong>{activeLeadQueue.length ? `${activeLeadQueue.length} live relays` : activeScenario.hoursSaved}</strong>
                <p>{activeLeadQueue.length ? 'Lead-linked activity live' : 'Time reclaimed across the branch'}</p>
              </div>
            </div>

            <section className="lifecycle-strip" aria-label="Lead lifecycle graph">
              <div className="section-topline lifecycle-strip-topline">
                <div className="lifecycle-strip-copy">
                  <p className="panel-kicker">Lifecycle graph</p>
                  <h3>Integration-driven lead journey</h3>
                </div>
                <span className="timeline-meta">
                  {activeLeadLifecycleNodes.length
                    ? `${activeLeadLifecycleNodes.length} lead-linked events`
                    : 'Waiting for a lead-linked integration event'}
                </span>
              </div>
              <div className="lifecycle-grid">
                {activeLeadLifecycleNodes.length ? (
                  activeLeadLifecycleNodes.map((node) => (
                    <article
                      key={node.id}
                      className={`surface-card surface-card-tight lifecycle-node lifecycle-node-${node.phase}`}
                      title={node.effect ?? node.summary}
                    >
                      <div className="lifecycle-node-inner">
                        <div className="lifecycle-node-copy lifecycle-node-copy-primary">
                          <span className="mini-label">{node.phase}</span>
                          <span className="lifecycle-node-title">{node.title}</span>
                          <span className="timeline-meta lifecycle-node-meta">
                            {node.source} • {node.timestamp}
                          </span>
                        </div>
                        <div className="command-cluster lifecycle-node-actions">
                          <span className={`connector-status ${getIntegrationInboxStatusClass(node.status)}`}>
                            {node.status}
                          </span>
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => focusLifecycleNode(node.target)}
                          >
                            {node.target.label}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="timeline-meta">
                    Select a live lead to see the shared integration events that shape the lifecycle graph.
                  </p>
                )}
              </div>
            </section>

            <details className="scenario-replay-band" aria-label="Scenario replay lab">
              <summary className="deferred-workflow-summary">
                <span>Replay lab</span>
                <span className="timeline-meta">Success and failure branches</span>
              </summary>
              <div className="deferred-workflow-content">
                <div className="scenario-replay-grid">
                  {demoScenarios.map((scenario) => {
                    const isActive = scenario.id === activeScenario.id
                    const branchLabel = scenario.id === 'scenario-002' ? 'failure branch' : 'success branch'

                    return (
                      <button
                        key={scenario.id}
                        type="button"
                        className={`surface-tile scenario-replay-card ${isActive ? 'surface-tile-active scenario-replay-card-active' : ''}`}
                        onClick={() => focusScenario(scenario.id)}
                      >
                        <div className="section-topline">
                          <div>
                            <p className="mini-label">{branchLabel}</p>
                            <h3>{scenario.title}</h3>
                          </div>
                          <span className="status-pill">{scenario.leadId}</span>
                        </div>
                        <p className="stat-note">{scenario.outcome}</p>
                        <p className="timeline-meta">{scenario.hoursSaved}</p>
                      </button>
                    )
                  })}
                </div>
                <div className="command-cluster scenario-sim-controls">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={simulateWebhookFailure}
                    disabled={!liveConsoleReady}
                  >
                    Simulate webhook failure
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={simulateSyncDrift}
                    disabled={!liveConsoleReady}
                  >
                    Simulate sync drift
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={simulateOnboardingFailure}
                    disabled={!liveConsoleReady}
                  >
                    Simulate onboarding issue
                  </button>
                </div>
              </div>
            </details>

            {webhookResult ? (
              <div
                className={`runtime-banner ${
                  webhookResult.status === 'accepted'
                    ? 'runtime-banner-success'
                    : 'runtime-banner-auth_required'
                }`}
              >
                <strong>{webhookResult.status === 'accepted' ? 'Latest result' : 'Action failed'}</strong>
                <span>{webhookResult.message}</span>
              </div>
            ) : null}
          </div>

          <div className="workspace-tabs">
            {[
              ['funnel', 'DM workbench'],
              ['recovery', 'Recovery branch'],
              ['payload', 'Payload lab'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`tab-button ${workbenchTab === value ? 'tab-button-active' : ''}`}
                onClick={() => handleWorkbenchTabChange(value as WorkbenchTab)}
              >
                {label}
              </button>
            ))}
          </div>

          {workbenchTab === 'funnel' ? (
            <div className="stage-layout">
              <section className="stage-panel stage-panel-primary">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Live transcript</p>
                    <h3>{activeLead?.name ?? 'No live conversation loaded'}</h3>
                  </div>
                  <div className="score-badge">
                    {activeConversation ? `${activeConversation.score} intent score` : 'Live data required'}
                  </div>
                </div>

                <div className="message-stack">
                  {visibleMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`message-bubble ${
                        message.sender === 'bot' ? 'message-bot' : 'message-lead'
                      }`}
                    >
                      <span>{message.text}</span>
                      <small>{message.timestamp}</small>
                    </div>
                  ))}
                  {visibleMessages.length === 0 ? (
                    <p className="timeline-meta">
                      The console is not replaying seeded DM history while live conversation data is unavailable.
                    </p>
                  ) : null}
                </div>

                <div className="event-summary">
                  <p className="mini-label">Automation result</p>
                  <p>
                    {activeConversation?.automationSummary ??
                      'No live automation summary is available until the backend loads this workflow.'}
                  </p>
                </div>
              </section>

              <aside className="workspace-actions-rail">
                <article className="stage-panel">
                  <div className="section-topline">
                    <div>
                      <p className="mini-label">Lead profile</p>
                      <h3>{activeLead?.handle ?? 'No live target'}</h3>
                    </div>
                    <span className="stage-badge">{runtime.leadStages[stepIndex]}</span>
                  </div>

                  <dl className="detail-grid">
                    <div>
                      <dt>Offer</dt>
                      <dd>{activeLead?.offer ?? 'Waiting for live data'}</dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{activeLead?.source ?? 'Waiting for live data'}</dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>{activeLead?.owner ?? 'Waiting for live data'}</dd>
                    </div>
                    <div>
                      <dt>Budget</dt>
                      <dd>{activeLead?.budget ?? 'Waiting for live data'}</dd>
                    </div>
                    <div>
                      <dt>Last touch</dt>
                      <dd>{activeLead?.lastTouch ?? 'Waiting for live data'}</dd>
                    </div>
                    <div>
                      <dt>Hours saved</dt>
                      <dd>{activeLeadQueue.length ? `${activeLeadQueue.length} live relays` : activeScenario.hoursSaved}</dd>
                    </div>
                  </dl>

                  <div className="tag-row">
                    {(activeLead?.tags ?? []).map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>

                <article className="stage-panel stage-panel-actions">
                  <div className="section-topline">
                    <div>
                      <p className="mini-label">Operator actions</p>
                      <h3>Flow controls</h3>
                    </div>
                  </div>
                  <div className="action-list">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => activeLead && handleLeadAction('checkout', activeLead.id)}
                      disabled={!hasLiveLead || !liveConsoleReady}
                    >
                      Queue checkout
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => activeLead && handleLeadAction('route', activeLead.id)}
                      disabled={!hasLiveLead || !liveConsoleReady}
                    >
                      Route closer
                    </button>
                    <button
                      type="button"
                      className="button button-danger button-small"
                      onClick={() => activeLead && handleLeadAction('no-show', activeLead.id)}
                      disabled={!hasLiveLead || !liveConsoleReady}
                    >
                      Mark no-show
                    </button>
                    <button
                      type="button"
                      className="button button-warning button-small"
                      onClick={() => activeLead && handleLeadAction('recover', activeLead.id)}
                      disabled={!hasLiveLead || !liveConsoleReady}
                    >
                      Recover lead
                    </button>
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={() => activeLead && handleLeadAction('alert', activeLead.id)}
                      disabled={!hasLiveLead || !liveConsoleReady}
                    >
                      Send alert
                    </button>
                  </div>
                </article>
              </aside>
            </div>
          ) : null}

          {workbenchTab === 'recovery' ? (
            hasLiveLead ? (
              <div className="recovery-console">
                <div className="recovery-console-main">
                  <section className="stage-panel stage-panel-primary recovery-main-panel">
                    <div className="section-topline">
                      <div>
                        <p className="mini-label">Recovery state</p>
                        <h3>{activeLead?.name ?? 'No live recovery state loaded'}</h3>
                        <p className="timeline-meta">{activeBooking?.slot ?? 'No call slot required'}</p>
                      </div>
                      <span className={`signal-badge ${recoveryToneToSignalClass(recoveryDisplayModel.statusTone)}`}>
                        {recoveryDisplayModel.headerStatus}
                      </span>
                    </div>

                    <p className="booking-owner">Closer: {activeLead?.owner ?? 'Unassigned'}</p>
                    <p className="booking-copy">{recoveryDisplayModel.summary}</p>

                    <div className="section-topline">
                      <div>
                        <p className="mini-label">Recovery model</p>
                        <h3>{recoveryDisplayModel.headerStatus}</h3>
                      </div>
                      <span className={`signal-badge ${recoveryToneToSignalClass(recoveryDisplayModel.escalationTone)}`}>
                        {recoveryDisplayModel.escalationLabel}
                      </span>
                    </div>

                    <div className="pipeline-model recovery-pipeline-model">
                      {recoveryDisplayModel.pipeline.map((entry) => (
                        <article key={entry.label} className={`pipeline-state pipeline-state-${entry.state}`}>
                          <div className="section-topline">
                            <p className="pipeline-state-label">{entry.label}</p>
                            <span className={`status-pill status-${entry.state}`}>{entry.state}</span>
                          </div>
                          <p className="booking-copy">{entry.summary}</p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <aside className="workspace-actions-rail recovery-summary-rail">
                    <article className="stage-panel recovery-summary-card recovery-summary-card-routing">
                      <div className="section-topline">
                        <div>
                          <p className="mini-label">Routing + escalation</p>
                          <h3>Routing visibility</h3>
                        </div>
                        <span className={`signal-badge ${recoveryToneToSignalClass(recoveryDisplayModel.escalationTone)}`}>
                          {recoveryDisplayModel.escalationLabel}
                        </span>
                      </div>
                      <div className="routing-grid">
                        <article className="routing-card">
                          <p className="mini-label">Owner</p>
                          <p className="booking-copy">{activeRoutingDecision.owner}</p>
                        </article>
                        <article className="routing-card">
                          <p className="mini-label">Lane</p>
                          <p className="booking-copy">{activeRoutingDecision.lane}</p>
                        </article>
                        <article className="routing-card">
                          <p className="mini-label">Rule</p>
                          <p className="booking-copy">{activeRoutingDecision.ruleLabel}</p>
                        </article>
                      </div>
                      <p className="booking-copy">{noShowEscalationText}</p>
                      {noShowEscalationSignals.length === 0 ? null : (
                        <ul className="recovery-signal-list">
                          {noShowEscalationSignals.map((signal) => (
                            <li key={signal.id} className={`recovery-signal recovery-signal-${signal.kind}`}>
                              <div className="section-topline">
                                <p>{signal.title}</p>
                                <span
                                  className={`signal-badge ${
                                    signal.kind === 'booking'
                                      ? 'signal-critical'
                                      : signal.kind === 'delivery'
                                        ? 'signal-watch'
                                        : signal.kind === 'audit'
                                          ? 'signal-hot'
                                          : 'signal-normal'
                                  }`}
                                >
                                  {signal.kind}
                                </span>
                              </div>
                              <p className="timeline-meta">
                                {signal.timestamp} • {signal.detail}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>

                    {recoveryDisplayModel.railCards.map((card) => (
                      <article key={card.title} className={`stage-panel recovery-rail-card recovery-rail-card-${card.tone}`}>
                        <div className="section-topline">
                          <div>
                            <p className="mini-label">{card.eyebrow}</p>
                            <h3>{card.title}</h3>
                          </div>
                          <span className={`signal-badge ${recoveryToneToSignalClass(card.tone)}`}>{card.tone}</span>
                        </div>
                        <p className="booking-copy">{card.body}</p>
                      </article>
                    ))}
                  </aside>
                </div>

                <section className="stage-panel recovery-console-automation">
                  <div className="section-topline">
                    <div>
                      <p className="mini-label">Triggered events</p>
                      <h3>Active automation trail</h3>
                    </div>
                  </div>
                  <div className="tag-row">
                    {activeAutomationTrail.map((entry) => (
                      <span key={entry} className="tag">
                        {entry}
                      </span>
                    ))}
                  </div>
                  <div className="timeline-stack">
                    {activeLeadTimeline.length === 0 ? (
                      <p className="timeline-meta">
                        Timeline events remain empty until the backend returns an authenticated workflow history.
                      </p>
                    ) : (
                      activeLeadTimeline.slice(0, 3).map((entry) => (
                        <article key={entry.id} className="timeline-card recovery-automation-card">
                          <div className="recovery-automation-card-header">
                            <div className="recovery-automation-card-copy">
                              <p className="event-name">{entry.title}</p>
                              <p className="timeline-meta">
                                {entry.type} • {entry.timestamp}
                              </p>
                            </div>
                            <span className={`event-status event-${entry.type}`}>{entry.type}</span>
                          </div>
                          <p className="booking-copy">{entry.detail}</p>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <section className="stage-panel stage-panel-primary recovery-empty-state">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Recovery branch</p>
                    <h3>No live recovery lead loaded</h3>
                  </div>
                  <span className="signal-badge signal-watch">Empty state</span>
                </div>
                <p className="booking-copy">
                  Select a live lead or load authenticated recovery data to see the four-step ladder, routing
                  visibility, and automation trail.
                </p>
                <p className="timeline-meta">
                  The tab stays empty until recovery data is available, so it will not synthesize ladder rows or rail
                  content.
                </p>
              </section>
            )
          ) : null}

          {workbenchTab === 'payload' ? (
            <div className="stage-layout stage-layout-payload">
              <section className="stage-panel stage-panel-primary">
                <div className="payload-header">
                  <div className="payload-header-copy">
                    <p className="mini-label">Meta / Stripe payload lab</p>
                    <h3>Webhook editor</h3>
                  </div>
                  <div className="command-cluster payload-toolbar">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => setWebhookInput(JSON.stringify(activePayload, null, 2))}
                    >
                      Reset template
                    </button>
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={handleWebhookValidate}
                    >
                      Validate payload
                    </button>
                  </div>
                </div>

                <textarea
                  className="payload-editor"
                  value={webhookInput}
                  onChange={(event) => setWebhookInput(event.target.value)}
                  spellCheck={false}
                />

                {webhookResult ? (
                  <p
                    className={`webhook-result ${
                      webhookResult.status === 'accepted' ? 'webhook-accepted' : 'webhook-rejected'
                    }`}
                  >
                    {webhookResult.message}
                  </p>
                ) : null}
              </section>

              <section className="stage-panel payload-utility-panel">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Webhook inbox</p>
                    <h3>Replayable events</h3>
                  </div>
                  <span className="status-pill">{webhookHistory.length} stored</span>
                </div>
                <div className="payload-event-list">
                  {webhookHistory.map((item) => {
                    return (
                      <article key={item.id} className="payload-event-row">
                        <div className="payload-event-main">
                          <div className="payload-event-copy">
                            <p className="event-name">{item.label}</p>
                            <p className="timeline-meta">{item.id}</p>
                          </div>
                        </div>
                        <div className="command-cluster payload-event-actions">
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => {
                              setWebhookInput(item.payload)
                              setWebhookResult({
                                status: 'accepted',
                                message: `Loaded ${item.label} from webhook inbox.`,
                              })
                            }}
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            className="button button-warning button-small"
                            onClick={() => handleWebhookReplay(item)}
                          >
                            Replay
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>

              <section className={`payload-proof-drawer ${payloadProofOpen ? 'payload-proof-drawer-open' : ''}`}>
                <button
                  type="button"
                  className="payload-proof-toggle"
                  onClick={() => setPayloadProofOpen((current) => !current)}
                  aria-expanded={payloadProofOpen}
                >
                  <span>Implementation snippets</span>
                  <span className="timeline-meta">Glue code proof</span>
                </button>
                {payloadProofOpen ? (
                  <div className="payload-proof-content">
                  <div className="snippet-selector">
                    {implementationSnippets.map((snippet) => (
                      <button
                        key={snippet.label}
                        type="button"
                        className={`button button-secondary button-small ${
                          activeImplementationSnippet.label === snippet.label ? 'tab-button-active' : ''
                        }`}
                        onClick={() => setSelectedSnippetLabel(snippet.label)}
                      >
                        {snippet.label}
                      </button>
                    ))}
                  </div>
                  <article className="snippet-card">
                    <p className="event-name">{activeImplementationSnippet.label}</p>
                    <pre className="proof-preview">{activeImplementationSnippet.body}</pre>
                  </article>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

        </section>

        <article
          className="console-panel systems-panel systems-panel-deferred"
          hidden={secondaryPanel !== 'systems'}
        >
          <div className="secondary-panel-navbar">
            <div className="workspace-tabs rail-tabs secondary-switcher-row">
              {[
                ['inbox', 'Inbox'],
                ['operations', 'Ops'],
                ['audit', 'Audit'],
                ['automation', 'Rules'],
                ['metrics', 'Metrics'],
                ['tools', 'Tools'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`tab-button ${railTab === value ? 'tab-button-active' : ''}`}
                  onClick={() => setRailTab(value as RailTab)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="status-pill">{railTab} view</span>
          </div>

          {railTab === 'inbox' ? (
            <div className="rail-stack">
              <div className="filters">
                <input
                  className="audit-search"
                  type="search"
                  value={inboxQuery}
                  onChange={(event) => setInboxQuery(event.target.value)}
                  placeholder="Search integration events"
                />
                <select
                  className="audit-select"
                  value={inboxKindFilter}
                  onChange={(event) => setInboxKindFilter(event.target.value as 'all' | IntegrationInboxKind)}
                >
                  <option value="all">All types</option>
                  <option value="delivery">Delivery</option>
                  <option value="audit">Audit</option>
                  <option value="test">Test run</option>
                  <option value="webhook">Webhook</option>
                  <option value="booking">Booking</option>
                  <option value="onboarding">Onboarding</option>
                </select>
              </div>

              <div className="integration-inbox-summary">
                <article className="surface-card surface-card-tight integration-inbox-summary-card">
                  <p className="metric-label">Inbox items</p>
                  <p className="metric-value">{visibleInboxEntries.length}</p>
                  <p className="metric-delta">{integrationInboxEntries.length} total in the shared flow</p>
                </article>
                <article className="surface-card surface-card-tight integration-inbox-summary-card">
                  <p className="metric-label">Queued or processing</p>
                  <p className="metric-value">
                    {visibleInboxEntries.filter((entry) => entry.status === 'queued' || entry.status === 'processing').length}
                  </p>
                  <p className="metric-delta">Work still moving through integrations.</p>
                </article>
                <article className="surface-card surface-card-tight integration-inbox-summary-card">
                  <p className="metric-label">Warnings</p>
                  <p className="metric-value">{visibleInboxEntries.filter((entry) => entry.status === 'warning').length}</p>
                  <p className="metric-delta">Items that need operator attention.</p>
                </article>
                <article className="surface-card surface-card-tight integration-inbox-summary-card">
                  <p className="metric-label">Sources</p>
                  <p className="metric-value">{integrationInboxSources.length - 1}</p>
                  <p className="metric-delta">Distinct connectors and event sources.</p>
                </article>
              </div>

              {activeLead ? (
                <article className="surface-card surface-card-standard integration-inbox-focus">
                  <div className="section-topline">
                    <div>
                      <p className="mini-label">Active lead trail</p>
                      <h3>{activeLead.name}</h3>
                    </div>
                    <span className="timeline-meta">{activeLeadInboxEntries.length} matched</span>
                  </div>
                  <div className="integration-inbox-list">
                    {(activeLeadInboxEntries.slice(0, 3).length ? activeLeadInboxEntries.slice(0, 3) : visibleInboxEntries.slice(0, 3)).map((entry) => (
                      <article key={entry.id} className="surface-card surface-card-tight integration-inbox-card">
                        <div className="section-topline">
                          <div>
                            <p className="event-name">{entry.source}</p>
                            <p className="timeline-meta">
                              {entry.kind} • {entry.target}
                            </p>
                          </div>
                          <span className={`connector-status ${getIntegrationInboxStatusClass(entry.status)}`}>
                            {entry.status}
                          </span>
                        </div>
                        <p>{entry.summary}</p>
                        {entry.effect ? <p className="timeline-meta">{entry.effect}</p> : null}
                        <p className="timeline-meta">{entry.timestamp}</p>
                      </article>
                    ))}
                  </div>
                </article>
              ) : null}

              <article className="rail-module rail-module-slate">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Integration inbox</p>
                    <h3>Shared event stream</h3>
                  </div>
                  <select
                    className="audit-select"
                    value={inboxStatusFilter}
                    onChange={(event) => setInboxStatusFilter(event.target.value as 'all' | IntegrationInboxStatus)}
                  >
                    <option value="all">All statuses</option>
                    <option value="queued">Queued</option>
                    <option value="processing">Processing</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                    <option value="processed">Processed</option>
                    <option value="warning">Warning</option>
                  </select>
                </div>
                <div className="integration-inbox-list">
                  {visibleInboxEntries.length ? (
                    visibleInboxEntries.slice(0, 10).map((entry) => (
                      <article key={entry.id} className="surface-card surface-card-standard integration-inbox-card">
                        <div className="section-topline">
                          <div>
                            <p className="event-name">{entry.source}</p>
                            <p className="timeline-meta">
                              {entry.kind} • {entry.target}
                            </p>
                          </div>
                          <span className={`connector-status ${getIntegrationInboxStatusClass(entry.status)}`}>
                            {entry.status}
                          </span>
                        </div>
                        <p>{entry.summary}</p>
                        {entry.effect ? <p className="timeline-meta">{entry.effect}</p> : null}
                        <div className="queue-card-footer">
                          <p className="timeline-meta">{entry.timestamp}</p>
                          {entry.leadId ? (
                            <button
                              type="button"
                              className="button button-secondary button-small"
                              onClick={() => setSelectedLeadId(entry.leadId ?? '')}
                            >
                              Focus lead
                            </button>
                          ) : (
                            <span className="timeline-meta">No lead target</span>
                          )}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="timeline-meta">No integration events match the current filters.</p>
                  )}
                </div>
              </article>
            </div>
          ) : null}

          {railTab === 'operations' ? (
            <div className="rail-stack">
              <article className="rail-module rail-module-amber">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Live tests</p>
                    <h3>Recorded runs</h3>
                  </div>
                  <span className="signal-badge signal-hot">{liveTestRuns.length} runs</span>
                </div>
                <div className="test-run-stack">
                  {liveTestRuns.slice(0, 3).map((run) => (
                    <article key={run.id} className="log-row">
                      <div>
                        <p className="event-name">{run.payloadLabel}</p>
                        <p className="timeline-meta">
                          {run.scenarioTitle} • {run.stepLabel}
                        </p>
                      </div>
                      <div className="log-row-meta">
                        <span className={`connector-status connector-${run.status}`}>{run.status}</span>
                        <p className="timeline-meta">{run.connector}</p>
                      </div>
                    </article>
                  ))}
                  {liveTestRuns.length === 0 ? (
                    <p className="timeline-meta">No live tests recorded yet. Run one from the command bar.</p>
                  ) : null}
                </div>
              </article>

              <article className="rail-module rail-module-cyan">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Delivery outbox</p>
                    <h3>Queued relays</h3>
                  </div>
                  <span className="timeline-meta">{activeLeadQueue.length} tied to active lead</span>
                </div>
                <select
                  className="audit-select"
                  value={deliveryFilter}
                  onChange={(event) => setDeliveryFilter(event.target.value as DeliveryStatus | 'all')}
                >
                  <option value="all">All statuses</option>
                  <option value="queued">Queued</option>
                  <option value="processing">Processing</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed</option>
                </select>
                <div className="queue-grid">
                  {(activeLeadQueue.length ? activeLeadQueue : prioritizedDeliveryQueue).map((item) => (
                    <article key={item.id} className="surface-card surface-card-standard queue-card">
                      <div className="section-topline">
                        <div>
                          <p className="event-name">{item.payloadLabel}</p>
                          <p className="timeline-meta">
                            {item.connector} • {item.channel}
                          </p>
                        </div>
                        <span className={`connector-status connector-${item.status}`}>{item.status}</span>
                      </div>
                      <p>{item.note}</p>
                      <div className="queue-card-footer">
                        <p className="timeline-meta">{item.target}</p>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={() => handleDeliveryRetry(item.id)}
                        >
                          Retry
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </article>

              <article className="rail-module rail-module-green">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Connector health</p>
                    <h3>Live integrations</h3>
                  </div>
                </div>
                <div className="connector-grid connector-grid-single-column">
                  {automationConnectors.map((connector) => {
                    const state = connectorStates[connector.name]
                    const report = reportsOverview?.connectors.find((entry) => entry.name === connector.name)

                    return (
                      <article key={connector.name} className="surface-card surface-card-standard connector-card">
                        <div className="section-topline">
                          <div>
                            <p className="mini-label">{connector.category}</p>
                            <h3>{connector.name}</h3>
                          </div>
                          <span className={`connector-status connector-${state?.status ?? 'attention'}`}>
                            {state?.status ?? 'attention'}
                          </span>
                        </div>
                        <p>{connector.use}</p>
                        {report ? (
                          <p className="timeline-meta">
                            {report.queued} queued • {report.processing} processing • {report.delivered} delivered
                          </p>
                        ) : null}
                        <div className="queue-card-footer queue-card-footer-stacked">
                          <p className="timeline-meta">
                            {state?.lastPing ?? 'live state unavailable'} • {state?.runs ?? 0} runs
                          </p>
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => handleConnectorPing(connector.name)}
                            disabled={!liveConsoleReady || !state}
                          >
                            Ping
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </article>
            </div>
          ) : null}

          {railTab === 'audit' ? (
            <div className="rail-stack">
              <div className="filters">
                <input
                  className="audit-search"
                  type="search"
                  value={auditQuery}
                  onChange={(event) => setAuditQuery(event.target.value)}
                  placeholder="Search audit log"
                />
                <select
                  className="audit-select"
                  value={auditKindFilter}
                  onChange={(event) => setAuditKindFilter(event.target.value as 'all' | AuditKind)}
                >
                  <option value="all">All events</option>
                  <option value="scenario">Scenario</option>
                  <option value="webhook">Webhook</option>
                  <option value="rule">Rule</option>
                  <option value="connector">Connector</option>
                  <option value="note">Note</option>
                </select>
              </div>

              <article className="rail-module rail-module-magenta">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Audit feed</p>
                    <h3>Active lead trail</h3>
                  </div>
                  <span className="timeline-meta">{activeLeadAudit.length} matched</span>
                </div>
                <div className="audit-list">
                  {(activeLeadAudit.length ? activeLeadAudit : visibleAuditEvents).map((entry) => (
                    <article key={entry.id} className="log-row">
                      <div>
                        <p className="event-name">{entry.title}</p>
                        <p className="timeline-meta">
                          {entry.target} • {entry.timestamp}
                        </p>
                      </div>
                      <span className={`event-status audit-${entry.kind}`}>{entry.kind}</span>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          ) : null}

          {railTab === 'automation' ? (
            <div className="rail-stack">
              <article className="rail-module rail-module-cyan">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Execution recipes</p>
                    <h3>Working proof flows</h3>
                  </div>
                </div>
                <div className="recipe-stack">
                  {executionRecipes.map((recipe) => (
                    <article key={recipe.id} className="recipe-card">
                      <div className="section-topline">
                        <div>
                          <h3>{recipe.title}</h3>
                          <p className="timeline-meta">{recipe.systems}</p>
                        </div>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={() => handleRunRecipe(recipe.id)}
                          disabled={
                            !liveConsoleReady ||
                            (recipe.id !== 'dm-sprint' && !hasLiveLead) ||
                            recipePending === recipe.id
                          }
                        >
                          {recipePending === recipe.id ? 'Running…' : 'Run'}
                        </button>
                      </div>
                      <p>{recipe.detail}</p>
                    </article>
                  ))}
                </div>
              </article>

              <article className="rail-module rail-module-magenta">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Rule lab</p>
                    <h3>Automation coverage</h3>
                  </div>
                  <span className="signal-badge signal-watch">{ruleDrafts.length} active</span>
                </div>
                <div className="rule-stack">
                  {ruleDrafts.map((rule) => {
                    const sourceRule = automationRules.find((entry) => entry.id === rule.id)
                    const result = ruleTestResults[rule.id]

                    return (
                      <article key={rule.id} className={`rule-card ${rule.enabled ? '' : 'rule-disabled'}`}>
                        <div className="section-topline">
                          <div>
                            <p className="mini-label">{sourceRule?.system}</p>
                            <h3>{rule.trigger}</h3>
                          </div>
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => handleRuleTest(rule.id)}
                          >
                            Run test
                          </button>
                        </div>
                        <p className="rule-condition">{rule.condition}</p>
                        <ul className="rule-actions">
                          {rule.actions.map((action) => (
                            <li key={action}>{action}</li>
                          ))}
                        </ul>
                        <p className="rule-footer">
                          {result
                            ? `Test result: ${result.status.toUpperCase()} • ${result.detail}`
                            : 'Test result: not run yet.'}
                        </p>
                      </article>
                    )
                  })}
                </div>
              </article>

              <article className="rail-module rail-module-green">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Requirement coverage</p>
                    <h3>Interview proof points</h3>
                  </div>
                </div>
                <div className="fit-stack">
                  {requirementCoverage.map((item) => (
                    <article key={item.label} className="fit-card">
                      <div className="section-topline">
                        <h3>{item.label}</h3>
                        <span className="timeline-meta">{item.status}</span>
                      </div>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </article>

              <article className="rail-module rail-module-slate">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Integration evidence</p>
                    <h3>Connector payloads and replay</h3>
                  </div>
                  <span className="status-pill">{selectedConnector?.name ?? 'Connector'}</span>
                </div>

                <div className="connector-selector-grid">
                  {automationConnectors.map((connector) => {
                    const isActive = connector.name === selectedConnector?.name
                    return (
                      <button
                        key={connector.name}
                        type="button"
                        className={`surface-tile connector-selector ${isActive ? 'surface-tile-active connector-selector-active' : ''}`}
                        onClick={() => setSelectedConnectorName(connector.name)}
                      >
                        <strong>{connector.name}</strong>
                        <span>{connector.category}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="integration-evidence-grid">
                  <article className="surface-card surface-card-standard evidence-card evidence-card-primary">
                    <div className="section-topline">
                      <div>
                        <p className="mini-label">Run inspector</p>
                        <h3>{selectedConnector?.name ?? 'Unknown connector'}</h3>
                      </div>
                      <span className={`connector-status connector-${selectedConnectorState?.status ?? 'attention'}`}>
                        {selectedConnectorState?.status ?? 'attention'}
                      </span>
                    </div>
                    <p>{selectedConnector?.use ?? 'No connector description available.'}</p>
                    <div className="evidence-metrics">
                      <article>
                        <p className="metric-label">Trigger</p>
                        <p className="metric-value">{selectedConnectorInspector.profile.trigger}</p>
                      </article>
                      <article>
                        <p className="metric-label">Branch</p>
                        <p className="metric-value">{selectedConnectorInspector.profile.branch}</p>
                      </article>
                      <article>
                        <p className="metric-label">Latest run</p>
                        <p className="metric-value">
                          {selectedConnectorInspector.latestRun
                            ? selectedConnectorInspector.latestRun.status
                            : 'none'}
                        </p>
                      </article>
                      <article>
                        <p className="metric-label">Retries</p>
                        <p className="metric-value">{selectedConnectorInspector.liveRetryCount}</p>
                      </article>
                    </div>
                    <p className="timeline-meta">{selectedConnectorInspector.profile.downstream}</p>
                    <div className="evidence-metrics">
                      <article>
                        <p className="metric-label">Runs</p>
                        <p className="metric-value">{selectedConnectorState?.runs ?? 0}</p>
                      </article>
                      <article>
                        <p className="metric-label">Queued</p>
                        <p className="metric-value">{selectedConnectorReport?.queued ?? 0}</p>
                      </article>
                      <article>
                        <p className="metric-label">Processing</p>
                        <p className="metric-value">{selectedConnectorReport?.processing ?? 0}</p>
                      </article>
                      <article>
                        <p className="metric-label">Delivered</p>
                        <p className="metric-value">{selectedConnectorReport?.delivered ?? 0}</p>
                      </article>
                    </div>
                    <div className="branch-trace">
                      <div className="section-topline">
                        <div>
                          <p className="mini-label">Branch trace</p>
                          <h4>How the run moved</h4>
                        </div>
                        <span className="timeline-meta">4-step path</span>
                      </div>
                      <div className="branch-trace-grid">
                        {selectedConnectorBranchTrace.map((step) => (
                          <article key={step.label} className="branch-trace-step">
                            <p className="metric-label">{step.label}</p>
                            <strong>{step.value}</strong>
                            <p className="timeline-meta">{step.note}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                    {connectorActionResult ? (
                      <article className="branch-trace connector-action-result">
                        <div className="section-topline">
                          <div>
                            <p className="mini-label">
                              {connectorActionResult.kind === 'retry' ? 'Retry result' : 'Replay result'}
                            </p>
                            <h4>{connectorActionResult.title}</h4>
                          </div>
                          <span className={`connector-status connector-${connectorActionResult.status}`}>
                            {connectorActionResult.status}
                          </span>
                        </div>
                        <p>{connectorActionResult.detail}</p>
                        <p className="timeline-meta">{connectorActionResult.timestamp}</p>
                      </article>
                    ) : null}
                    {selectedConnectorFailureTrail.length ? (
                      <div className="branch-trace">
                        <div className="section-topline">
                          <div>
                            <p className="mini-label">Failure trail</p>
                            <h4>Failed runs waiting on a retry</h4>
                          </div>
                          <span className="timeline-meta">{selectedConnectorFailureTrail.length} failures</span>
                        </div>
                        <div className="branch-trace-grid">
                          {selectedConnectorFailureTrail.map((item) => (
                            <article key={item.id} className="branch-trace-step">
                              <p className="metric-label">{item.title}</p>
                              <strong>{item.detail}</strong>
                              <p className="timeline-meta">{item.note}</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <p className="timeline-meta">
                      Last ping: {selectedConnectorState?.lastPing ?? 'unavailable'} • {selectedConnectorState?.note ?? 'No connector state yet.'}
                    </p>
                    <div className="command-cluster">
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => selectedConnector && handleConnectorPing(selectedConnector.name)}
                        disabled={!liveConsoleReady || !selectedConnectorState}
                      >
                        Ping selected connector
                      </button>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={handleRunLiveTest}
                        disabled={!liveConsoleReady}
                      >
                        Replay active scenario
                      </button>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => handleRunRecipe(selectedConnectorInspector.profile.replayRecipe)}
                        disabled={
                          !liveConsoleReady ||
                          (selectedConnectorInspector.profile.replayRecipe !== 'dm-sprint' && !hasLiveLead)
                        }
                      >
                        Replay proof flow
                      </button>
                    </div>
                  </article>

                  <article className="surface-card surface-card-standard evidence-card">
                    <div className="section-topline">
                      <div>
                        <p className="mini-label">Replay history</p>
                        <h3>Latest test runs</h3>
                      </div>
                      <span className="timeline-meta">{selectedConnectorRunsWithLead.length} shown</span>
                    </div>
                    <div className="evidence-list">
                      {selectedConnectorRunsWithLead.length ? (
                        selectedConnectorRunsWithLead.map((run) => {
                          const linkedLead =
                            run.leadId !== undefined ? leadRecords.find((entry) => entry.id === run.leadId) : null

                          return (
                          <article key={run.id} className="surface-card surface-card-tight evidence-item">
                            <div className="section-topline">
                              <div>
                                <p className="event-name">{run.payloadLabel}</p>
                                <p className="timeline-meta">
                                  {run.scenarioTitle} • {run.stepLabel}
                                </p>
                              </div>
                              <span className={`connector-status connector-${run.status}`}>{run.status}</span>
                            </div>
                            <p className="timeline-meta">{run.resultMessage}</p>
                            {run.leadId || linkedLead ? (
                              <p className="timeline-meta">
                                {linkedLead
                                  ? `Lead: ${linkedLead.name} • ${linkedLead.handle}`
                                  : `Run lead match: ${run.leadId}`}
                              </p>
                            ) : null}
                            <pre className="proof-preview evidence-preview">{run.payload}</pre>
                            <div className="queue-card-footer">
                              <p className="timeline-meta">{run.createdAt}</p>
                              <div className="command-cluster">
                                {run.leadId ? (
                                  <button
                                    type="button"
                                    className="button button-secondary button-small"
                                    onClick={() => setSelectedLeadId(run.leadId ?? '')}
                                  >
                                    Focus lead
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="button button-primary button-small"
                                  onClick={() => handleRerunConnectorRun(run)}
                                  disabled={!liveConsoleReady}
                                >
                                  Replay run
                                </button>
                              </div>
                            </div>
                          </article>
                          )
                        })
                      ) : (
                        <p className="timeline-meta">No replay runs are recorded for this connector yet.</p>
                      )}
                    </div>
                  </article>

                  <article className="surface-card surface-card-standard evidence-card">
                    <div className="section-topline">
                      <div>
                        <p className="mini-label">Delivery trail</p>
                        <h3>Outbox rows</h3>
                      </div>
                      <span className="timeline-meta">{selectedConnectorDeliveries.length} shown</span>
                    </div>
                    <div className="evidence-list">
                      {selectedConnectorDeliveries.length ? (
                        selectedConnectorDeliveries.map((item) => (
                          <article key={item.id} className="surface-card surface-card-tight evidence-item">
                            <div className="section-topline">
                              <div>
                                <p className="event-name">{item.payloadLabel}</p>
                                <p className="timeline-meta">
                                  {item.channel} • {item.target}
                                </p>
                              </div>
                              <span className={`connector-status connector-${item.status}`}>{item.status}</span>
                            </div>
                            <p>{item.note}</p>
                            <div className="queue-card-footer">
                              <p className="timeline-meta">{item.lastAttempt}</p>
                              <button
                                type="button"
                                className="button button-secondary button-small"
                                onClick={() => handleDeliveryRetry(item.id)}
                              >
                                Retry
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="timeline-meta">No outbox rows match this connector yet.</p>
                      )}
                    </div>
                  </article>
                </div>
              </article>

              <article className="rail-module rail-module-amber">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Reporting outputs</p>
                    <h3>Slack and Sheets payloads</h3>
                  </div>
                  <div className="command-cluster">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => handleLoadProofPreview('slack')}
                      disabled={!liveConsoleReady || recipePending === 'slack'}
                    >
                      {recipePending === 'slack' ? 'Loading…' : 'Slack'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => handleLoadProofPreview('sheets')}
                      disabled={!liveConsoleReady || recipePending === 'sheets'}
                    >
                      {recipePending === 'sheets' ? 'Loading…' : 'Sheets'}
                    </button>
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={() => handleDispatchExport('slack')}
                      disabled={!liveConsoleReady || dispatchPending === 'slack'}
                    >
                      {dispatchPending === 'slack' ? 'Sending Slack…' : 'Send Slack'}
                    </button>
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={() => handleDispatchExport('sheets')}
                      disabled={!liveConsoleReady || dispatchPending === 'sheets'}
                    >
                      {dispatchPending === 'sheets' ? 'Sending Sheets…' : 'Send Sheets'}
                    </button>
                  </div>
                </div>
                {proofPreview ? (
                  <div className="proof-preview-block">
                    <p className="event-name">{proofPreview.title}</p>
                    <pre className="proof-preview">{proofPreview.payload}</pre>
                  </div>
                ) : (
                  <p className="timeline-meta">
                    Load a live export payload to show Slack alert structure or the Sheets snapshot row format.
                  </p>
                )}
              </article>
            </div>
          ) : null}

          {railTab === 'metrics' ? (
            <div className="rail-stack">
              <article className="rail-module rail-module-amber revenue-panel">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Daily revenue</p>
                    <h3>Live funnel metrics</h3>
                  </div>
                  <div className="command-cluster">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => handleDispatchExport('slack')}
                      disabled={!liveConsoleReady || dispatchPending === 'slack'}
                    >
                      {dispatchPending === 'slack' ? 'Sending Slack…' : 'Slack export'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => handleDispatchExport('sheets')}
                      disabled={!liveConsoleReady || dispatchPending === 'sheets'}
                    >
                      {dispatchPending === 'sheets' ? 'Sending Sheets…' : 'Sheets export'}
                    </button>
                  </div>
                </div>
                <div className="metric-grid">
                  {railMetrics.map((metric) => (
                    <article key={metric.label} className="surface-card surface-card-tight metric-card">
                      <p className="metric-label">{metric.label}</p>
                      <p className="metric-value">{metric.value}</p>
                      <p className="metric-delta">{metric.delta}</p>
                    </article>
                  ))}
                  <article className="surface-card surface-card-tight metric-card">
                    <p className="metric-label">Onboarding runs</p>
                    <p className="metric-value">{onboardingCompleted}</p>
                    <p className="metric-delta">
                      {onboardingRuns.length} total provisioning runs recorded.
                    </p>
                  </article>
                </div>

                <div className="revenue-overview">
                  <article className="revenue-block">
                    <div className="section-topline">
                      <h4>Source mix</h4>
                      <span className="timeline-meta">
                        {reportsOverview?.queueSummary.total ?? 0} queued leads
                      </span>
                    </div>
                    {revenueSourceRows.length ? (
                      <div className="revenue-list">
                        {revenueSourceRows.map((row) => (
                          <div key={row.source} className="revenue-row">
                            <div>
                              <p className="event-name">{row.source}</p>
                              <p className="timeline-meta">{row.count} leads</p>
                            </div>
                            <span className="timeline-meta">{row.share}%</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="timeline-meta">Load the report snapshot to see source mix.</p>
                    )}
                  </article>

                  <article className="revenue-block">
                    <div className="section-topline">
                      <h4>Connector health</h4>
                      <span className="timeline-meta">
                        {reportsOverview?.outboxSummary.queued ?? 0} queued /{' '}
                        {reportsOverview?.outboxSummary.delivered ?? 0} delivered
                      </span>
                    </div>
                    <div className="revenue-list">
                      {revenueConnectorRows.length ? (
                        revenueConnectorRows.map((entry) => (
                          <div key={entry.name} className="revenue-row revenue-row-stack">
                            <div className="revenue-row-main">
                              <div>
                                <p className="event-name">{entry.name}</p>
                                <p className="timeline-meta">
                                  {entry.queued} queued • {entry.processing} processing • {entry.delivered} delivered
                                </p>
                              </div>
                              <span className={`connector-status connector-status-${entry.status}`}>
                                {entry.status}
                              </span>
                            </div>
                            <div className="command-cluster">
                              <span className="timeline-meta">{entry.note}</span>
                              <button
                                type="button"
                                className="button button-secondary button-small"
                                onClick={() => handleConnectorPing(entry.name)}
                                disabled={!liveConsoleReady || !connectorStates[entry.name]}
                              >
                                Ping
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="timeline-meta">Connector health loads after the first report snapshot.</p>
                      )}
                    </div>
                  </article>

                  <article className="revenue-block revenue-block-actions">
                    <div className="section-topline">
                      <h4>Today&apos;s actions</h4>
                      <span className="timeline-meta">What should move first</span>
                    </div>
                    <div className="revenue-actions">
                      {revenueFollowUps.map((item) => (
                        <article key={item.label} className="revenue-action-card">
                          <div>
                            <p className="event-name">{item.label}</p>
                            <p className="timeline-meta">{item.detail}</p>
                          </div>
                          {item.action ? (
                            <span className="timeline-meta revenue-action-label">{item.action}</span>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </article>
                </div>
              </article>

              <article className="rail-module rail-module-slate">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Sync control</p>
                    <h3>Local and remote drift</h3>
                  </div>
                  <span className="timeline-meta">
                    {syncStatus?.configured ? 'Remote sync configured' : 'Local runtime only'}
                  </span>
                </div>
                <div className="sync-card">
                  <div className="sync-summary">
                    <div className="surface-card surface-card-tight sync-summary-item">
                      <p className="metric-label">Realtime</p>
                      <p className="metric-value">
                        {syncStatus?.realtime.connected ? 'Connected' : 'Polling'}
                      </p>
                      <p className="metric-delta">
                        {syncStatus?.realtime.eventCount ?? 0} events •{' '}
                        {syncStatus?.realtime.pollMs ?? 0}ms poll
                      </p>
                    </div>
                    <div className="surface-card surface-card-tight sync-summary-item">
                      <p className="metric-label">Remote snapshot</p>
                      <p className="metric-value">
                        {syncStatus?.remote && !('error' in syncStatus.remote) && syncStatus.remote.found
                          ? 'Found'
                          : 'Missing'}
                      </p>
                      <p className="metric-delta">
                        {syncStatus?.remote && !('error' in syncStatus.remote)
                          ? syncStatus.remote.updatedAt ?? 'Awaiting update'
                          : 'No remote snapshot loaded'}
                      </p>
                    </div>
                    <div className="surface-card surface-card-tight sync-summary-item">
                      <p className="metric-label">Mirror rows</p>
                      <p className="metric-value">
                        {syncStatus?.supabase && !('error' in syncStatus.supabase)
                          ? Object.values(syncStatus.supabase).reduce((total, count) => total + count, 0)
                          : 0}
                      </p>
                      <p className="metric-delta">
                        {syncStatus?.supabase && !('error' in syncStatus.supabase)
                          ? `${Object.keys(syncStatus.supabase).length} tables synced`
                          : 'Supabase sync unavailable'}
                      </p>
                    </div>
                  </div>

                  <div className="command-cluster">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={refreshSyncState}
                      disabled={syncPending === 'status'}
                    >
                      {syncPending === 'status' ? 'Refreshing…' : 'Refresh status'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={async () => {
                        setSyncPending('diff')
                        try {
                          const diff = await fetchSyncDiff()
                          setSyncDiff(diff)
                        } catch (error) {
                          setSyncDiff(null)
                          handleRuntimeFailure(error, 'Failed to load sync diff.')
                        } finally {
                          setSyncPending(null)
                        }
                      }}
                      disabled={syncPending === 'diff' || !syncStatus?.configured}
                    >
                      {syncPending === 'diff' ? 'Loading diff…' : 'Inspect diff'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={handleSyncPush}
                      disabled={syncPending === 'push' || !syncStatus?.configured}
                    >
                      {syncPending === 'push' ? 'Pushing…' : 'Push local'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={handleSyncPull}
                      disabled={syncPending === 'pull' || !syncStatus?.configured}
                    >
                      {syncPending === 'pull' ? 'Pulling…' : 'Pull remote'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={handleSyncReconcile}
                      disabled={syncPending === 'reconcile' || !syncStatus?.configured}
                    >
                      {syncPending === 'reconcile' ? 'Reconciling…' : 'Reconcile'}
                    </button>
                  </div>

                  {syncDiff?.ok && syncDiff.diff ? (
                    <div className="sync-diff-list">
                      {Object.entries(syncDiff.diff).slice(0, 4).map(([field, diff]) => {
                        const remoteOnly = Array.isArray((diff as { remoteOnly?: string[] }).remoteOnly)
                          ? (diff as { remoteOnly: string[] }).remoteOnly.length
                          : 0
                        const localOnly = Array.isArray((diff as { localOnly?: string[] }).localOnly)
                          ? (diff as { localOnly: string[] }).localOnly.length
                          : 0
                        const shared = Number((diff as { shared?: number }).shared ?? 0)

                        return (
                          <article key={field} className="surface-card surface-card-tight sync-diff-card">
                            <p className="event-name">{field}</p>
                            <p className="timeline-meta">
                              +{remoteOnly} / -{localOnly} / {shared} shared
                            </p>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="timeline-meta">
                      Inspect the diff after a remote snapshot lands to see local versus remote drift.
                    </p>
                  )}
                </div>
              </article>

              <article className="rail-module rail-module-cyan">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Onboarding autopilot</p>
                    <h3>Folder, SOP, and invite proof</h3>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => handleRunRecipe('onboarding')}
                    disabled={!liveConsoleReady || !activeLead || recipePending === 'onboarding'}
                  >
                    {recipePending === 'onboarding' ? 'Provisioning…' : 'Retry onboarding'}
                  </button>
                </div>
                <div className="onboarding-list">
                  {onboardingProofRuns.length ? (
                    onboardingProofRuns.map((run) => {
                      const lead = leadRecords.find((entry) => entry.id === run.leadId)
                      return (
                        <div key={run.id} className="onboarding-card-stack">
                          <article className="onboarding-card">
                            <div className="section-topline">
                              <div>
                                <p className="event-name">{lead?.name ?? run.leadId}</p>
                                <p className="timeline-meta">
                                  {lead?.handle ?? run.leadId} • {run.status}
                                </p>
                              </div>
                              <span className="signal-badge signal-watch">Ready</span>
                            </div>
                            <div className="onboarding-links">
                              <span className="onboarding-link">
                                Folder: <code>{run.folderUrl}</code>
                              </span>
                              <span className="onboarding-link">
                                SOP: <code>{run.sopUrl}</code>
                              </span>
                              <span className="onboarding-link">
                                Invite: <code>{run.inviteUrl}</code>
                              </span>
                            </div>
                          </article>
                          {run.handoffState ? (
                            <div className="onboarding-handoff-grid">
                              {run.handoffState.destinations.map((destination) => (
                                <article key={`${run.id}-${destination.name}`} className="onboarding-handoff-card">
                                  <div className="section-topline">
                                    <div>
                                      <p className="event-name">{destination.name}</p>
                                      <p className="timeline-meta">{destination.status}</p>
                                    </div>
                                    <span className="signal-badge signal-watch">Ready</span>
                                  </div>
                                  <p className="timeline-meta">{destination.note}</p>
                                  <code>{destination.url}</code>
                                </article>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  ) : (
                    <p className="timeline-meta">
                      Provision an active lead to show folder, SOP, and invite links here.
                    </p>
                  )}
                </div>
              </article>

              <article className="rail-module rail-module-magenta">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Meta CAPI</p>
                    <h3>Server event payloads</h3>
                  </div>
                  <span className="timeline-meta">{capiRailEvents.length} events</span>
                </div>
                <div className="capi-table">
                  {capiRailEvents.map((event) => (
                    <div key={event.eventName} className="capi-row">
                      <div className="capi-cell capi-cell-primary">
                        <p className="event-name">{event.eventName}</p>
                        <p>{event.source}</p>
                      </div>
                      <div className="capi-cell">
                        <p className="mini-label">Match keys</p>
                        <p>{event.matchKeys.join(', ')}</p>
                      </div>
                      <div className="capi-cell">
                        <p className="mini-label">Status</p>
                        <p>{event.payloadStatus}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rail-module rail-module-cyan">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Shipped modules</p>
                    <h3>Operator surface</h3>
                  </div>
                </div>
                <div className="fit-stack">
                  {repoModules.map((module) => (
                    <article key={module.name} className="fit-card">
                      <h3>{module.name}</h3>
                      <p>{module.summary}</p>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          ) : null}

          {railTab === 'tools' ? (
            <div className="rail-stack">
              <article className="rail-module rail-module-slate">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Deployment proof</p>
                    <h3>Runtime, auth, and handoff</h3>
                  </div>
                  <span className="timeline-meta">{runtimeHost}</span>
                </div>
                <div className="deployment-proof-grid">
                  <article className="surface-card surface-card-tight deployment-proof-card">
                    <p className="metric-label">Runtime</p>
                    <p className="event-name">{runtimeStatus === 'ready' ? 'Live' : runtimeStatus}</p>
                    <p className="timeline-meta">
                      {isLocalDemoHost()
                        ? 'Local or dev host with the demo runtime path enabled.'
                        : 'Deployed runtime path with the same operator console behavior.'}
                    </p>
                  </article>
                  <article className="surface-card surface-card-tight deployment-proof-card">
                    <p className="metric-label">Auth</p>
                    <p className="event-name">{authSession?.bypass ? 'Local bypass' : authSession?.sub ?? 'Not signed in'}</p>
                    <p className="timeline-meta">
                      {authStatus === 'authenticated'
                        ? 'Operator session is authenticated and the live console is unlocked.'
                        : 'Session state is checked before the operator surfaces render.'}
                    </p>
                  </article>
                  <article className="surface-card surface-card-tight deployment-proof-card">
                    <p className="metric-label">Data</p>
                    <p className="event-name">SQLite + repo-owned Supabase sync</p>
                    <p className="timeline-meta">
                      Queue, reports, realtime events, and sync all ride the same server-backed state.
                    </p>
                  </article>
                  <article className="surface-card surface-card-tight deployment-proof-card">
                    <p className="metric-label">Handoff</p>
                    <p className="event-name">Reset, sign in, interview mode</p>
                    <p className="timeline-meta">
                      Start the walkthrough, reset the runtime, and export a proof pack without leaving the console.
                    </p>
                  </article>
                </div>
              </article>

              <article className="rail-module rail-module-green">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Internal tools</p>
                    <h3>Reusable operator work</h3>
                  </div>
                  <span className="timeline-meta">
                    {toolArtifact ? 'Artifact ready' : 'Pick a tool to generate'}
                  </span>
                </div>
                <div className="tool-template-grid">
                  {toolTemplates.map((template) => (
                    <article key={template.id} className="surface-card surface-card-standard tool-template-card">
                      <div className="section-topline">
                        <div>
                          <h3>{template.title}</h3>
                          <p className="timeline-meta">{template.summary}</p>
                        </div>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={() => handleBuildToolArtifact(template.id)}
                          disabled={toolPending === template.id}
                        >
                          {toolPending === template.id ? 'Building…' : 'Build'}
                        </button>
                      </div>
                      <p>{template.outcome}</p>
                      <ul className="tool-step-list">
                        {template.steps.map((step) => (
                          <li key={step} className="timeline-meta">
                            {step}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </article>

              <article className="rail-module rail-module-amber">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Generated artifact</p>
                    <h3>Copy-ready output</h3>
                  </div>
                  <div className="command-cluster">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={handleCopyToolArtifact}
                      disabled={!toolArtifact}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => setToolArtifact(null)}
                      disabled={!toolArtifact}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {toolArtifact ? (
                  <div className="proof-preview-block">
                    <p className="event-name">{toolArtifact.title}</p>
                    <pre className="proof-preview tool-artifact">{toolArtifact.payload}</pre>
                  </div>
                ) : (
                  <p className="timeline-meta">
                    Generate a proof pack, SOP handoff, or triage note from the live console state.
                  </p>
                )}
              </article>

              <article className="rail-module rail-module-cyan">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Failure inbox</p>
                    <h3>Retries and attention items</h3>
                  </div>
                  <span className="timeline-meta">
                    {failedDeliveries.length} failed / {attentionConnectors.length} attention
                  </span>
                </div>
                <div className="tool-failure-list">
                  {failedDeliveries.length ? (
                    failedDeliveries.map((item) => (
                      <article key={item.id} className="surface-card surface-card-standard tool-failure-card">
                        <div className="section-topline">
                          <div>
                            <p className="event-name">{item.payloadLabel}</p>
                            <p className="timeline-meta">
                              {item.connector} • {item.channel} • {item.target}
                            </p>
                          </div>
                          <span className={`connector-status connector-${item.status}`}>{item.status}</span>
                        </div>
                        <p>{item.note}</p>
                        <div className="queue-card-footer">
                          <p className="timeline-meta">{item.lastAttempt}</p>
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => handleDeliveryRetry(item.id)}
                          >
                            Retry
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="timeline-meta">
                      No failed deliveries right now. The outbox is clean and ready for the next run.
                    </p>
                  )}
                </div>
              </article>
            </div>
          ) : null}
        </article>
      </main>

      <section className="console-secondary-shell" aria-label="Deferred workflow controls">
        {secondaryPanel === 'notes' ? (
          <article className="console-panel secondary-switcher-panel notes-panel">
            <div className="section-topline">
              <div>
                <p className="panel-kicker">Operator notes</p>
                <h2>Persisted locally</h2>
              </div>
              <span className="timeline-meta">Saved as you type</span>
            </div>
            <textarea
              className="notes-editor"
              value={operatorNotes}
              onChange={(event) => setOperatorNotes(event.target.value)}
              placeholder="Capture blockers, account-specific mapping, or deployment notes."
            />
          </article>
        ) : null}

        {secondaryPanel === 'workflow' ? (
          <article className="console-panel secondary-switcher-panel deferred-workflow-drawer">
            <div className="section-topline">
              <div>
                <p className="panel-kicker">Workflow notes</p>
                <h2>Operator controls</h2>
              </div>
              <span className="timeline-meta">Collapsed elsewhere by default</span>
            </div>

            <div className="command-bar">
              <div className="command-cluster">
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => handleStepChange(stepIndex - 1)}
                  disabled={stepIndex === 0}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={() => handleStepChange(stepIndex + 1)}
                  disabled={stepIndex === runtime.stepLabels.length - 1}
                >
                  Advance
                </button>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => handleStepChange(0)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={handleRuntimeReset}
                  disabled={runtimeResetPending || authStatus !== 'authenticated'}
                >
                  {runtimeResetPending ? 'Resetting data…' : 'Reset data'}
                </button>
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={handleInterviewMode}
                  disabled={runtimeResetPending || authStatus !== 'authenticated'}
                >
                  {interviewMode ? 'Demo state loaded' : 'Load demo state'}
                </button>
              </div>

              <div className="command-cluster">
                <span className={`runtime-chip runtime-chip-${runtimeStatus}`}>
                  {runtimeStatus === 'ready'
                    ? 'Backend live'
                    : runtimeStatus === 'loading'
                      ? 'Loading runtime'
                      : runtimeStatus === 'degraded'
                        ? 'Runtime degraded'
                        : 'Awaiting session'}
                </span>
                <span className="status-pill">
                  {authSession?.bypass ? 'local bypass' : authSession?.sub ?? 'authenticated'}
                </span>
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={handleRunWorkflow}
                  disabled={!hasLiveLead || !liveConsoleReady}
                >
                  Run workflow
                </button>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={handleLogNote}
                  disabled={!liveConsoleReady}
                >
                  Log note
                </button>
              </div>
            </div>

            <section className={`interview-band ${interviewMode ? 'interview-band-active' : ''}`}>
              <div className="interview-band-copy">
                <p className="panel-kicker">Demo state</p>
                <h2>
                  {interviewMode
                    ? 'Interview-ready proof state is loaded'
                    : 'Load the curated proof state when you need it'}
                </h2>
                <p className="stat-note">
                  {interviewMode
                    ? 'The console is reset into the curated payment-to-onboarding proof path without showing presentation cards.'
                    : 'Use this only to load the seeded demo path. The operator console stays visible as the primary surface.'}
                </p>
              </div>
              <div className="interview-band-actions">
                {interviewMode ? <span className="status-pill">Payment to onboarding autopilot</span> : null}
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={handleInterviewMode}
                  disabled={runtimeResetPending || authStatus !== 'authenticated'}
                >
                  {runtimeResetPending ? 'Loading…' : interviewMode ? 'Reload demo state' : 'Load demo state'}
                </button>
              </div>
            </section>
          </article>
        ) : null}

        <div className="secondary-switcher" role="tablist" aria-label="Secondary panels">
          {[
            ['systems', 'Systems'],
            ['notes', 'Notes'],
            ['workflow', 'Workflow'],
          ].map(([value, label]) => {
            const panelValue = value as 'systems' | 'notes' | 'workflow'
            const isActive = secondaryPanel === panelValue

            return (
              <button
                key={value}
                type="button"
                className={`button button-secondary secondary-switcher-button ${
                  isActive ? 'secondary-switcher-button-active' : ''
                }`}
                onClick={() => setSecondaryPanel(isActive ? null : panelValue)}
                aria-pressed={isActive}
              >
                {label}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default App
