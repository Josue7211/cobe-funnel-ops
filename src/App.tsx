import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import './App.css'
import {
  ApiError,
  createOauthSession,
  fetchSheetsExportPreview,
  fetchSlackExportPreview,
  fetchOauthAuthorizeUrl,
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
import type {
  Booking,
  Conversation,
  FunnelStage,
  Lead,
  OnboardingRun,
  OperatorToolTemplate,
} from './types'

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

type RailTab = 'operations' | 'audit' | 'automation' | 'metrics' | 'tools'
type AuthStatus = 'checking' | 'authenticated' | 'auth_required'
type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'degraded'

const OAUTH_SESSION_EVENT = 'cobe-oauth-complete'
const AUTO_DEMO_USERNAME = 'operator'
const AUTO_DEMO_PASSWORD = 'operator'

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function ProviderIcon({ provider }: { provider: 'google' | 'github' }) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="provider-icon">
        <path
          fill="#4285F4"
          d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.97-4.34 2.97-7.35Z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.24-2.5c-.9.6-2.05.96-3.37.96-2.59 0-4.79-1.75-5.58-4.1H3.07v2.57A10 10 0 0 0 12 22Z"
        />
        <path
          fill="#FBBC05"
          d="M6.42 13.93A5.96 5.96 0 0 1 6.1 12c0-.67.11-1.31.32-1.93V7.5H3.07A10 10 0 0 0 2 12c0 1.61.38 3.14 1.07 4.5l3.35-2.57Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.87-2.88C16.95 2.96 14.7 2 12 2A10 10 0 0 0 3.07 7.5l3.35 2.57c.79-2.35 2.99-4.1 5.58-4.1Z"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="provider-icon">
      <path
        fill="currentColor"
        d="M12 .5a12 12 0 0 0-3.79 23.38c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.72.08-.72 1.2.09 1.83 1.23 1.83 1.23 1.08 1.83 2.82 1.3 3.51.99.11-.77.42-1.3.77-1.59-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.46-2.38 1.23-3.22-.12-.3-.53-1.53.12-3.18 0 0 1-.32 3.3 1.23a11.46 11.46 0 0 1 6 0c2.3-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.88.13 3.18.77.84 1.23 1.91 1.23 3.22 0 4.62-2.81 5.65-5.49 5.95.43.37.82 1.1.82 2.22v3.3c0 .32.21.69.83.58A12 12 0 0 0 12 .5Z"
      />
    </svg>
  )
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

const STORAGE_KEY = 'creator-funnel-ops-state'

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
  const [scenarioId, setScenarioId] = useState(persisted?.scenarioId ?? demoScenarios[0].id)
  const [stepIndex, setStepIndex] = useState(persisted?.stepIndex ?? 0)
  const [selectedLeadId, setSelectedLeadId] = useState(persisted?.selectedLeadId ?? '')
  const [leadQuery, setLeadQuery] = useState(persisted?.leadQuery ?? '')
  const [leadStageFilter, setLeadStageFilter] = useState<FunnelStage | 'all'>(
    persisted?.leadStageFilter ?? 'all',
  )
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryStatus | 'all'>(
    persisted?.deliveryFilter ?? 'all',
  )
  const [operatorNotes, setOperatorNotes] = useState(persisted?.operatorNotes ?? '')
  const [webhookInput, setWebhookInput] = useState(
    JSON.stringify(scenarioRuntimes[demoScenarios[0].id].payloads[0], null, 2),
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
  const [liveTestRuns, setLiveTestRuns] = useState<LiveTestRun[]>([])
  const [ruleTestResults, setRuleTestResults] = useState<Record<string, RuleTestResult>>({})
  const [webhookResult, setWebhookResult] = useState<{
    status: 'accepted' | 'rejected'
    message: string
  } | null>(null)
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>(
    persisted?.workbenchTab ?? 'funnel',
  )
  const [railTab, setRailTab] = useState<RailTab>(persisted?.railTab ?? 'operations')
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
    mirror: Record<string, number> | { error: string }
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
  const autoLoginAttemptedRef = useRef(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [oauthProviderPending, setOauthProviderPending] = useState<'google' | 'github' | null>(null)
  const [proofPreview, setProofPreview] = useState<{
    title: string
    payload: string
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
  const activeScenario = useMemo(
    () =>
      demoScenarios.find((scenario) => scenario.id === inferScenarioIdFromStage(activeLead?.stage)) ??
      demoScenarios.find((scenario) => scenario.id === scenarioId) ??
      demoScenarios[0],
    [activeLead?.stage, scenarioId],
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
  const progress = ((stepIndex + 1) / runtime.stepLabels.length) * 100
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
  const activeLeadAudit = activeLead
    ? auditEvents.filter((entry) =>
        `${entry.target} ${entry.detail}`.toLowerCase().includes(activeLead.id) ||
        `${entry.target} ${entry.detail}`.toLowerCase().includes(activeLead.handle.toLowerCase()),
      )
    : []
  const liveConsoleReady = runtimeStatus === 'ready'
  const hasLiveLead = Boolean(activeLead)
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
      repoModules.length,
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
      if (isLocalDemoHost() && !autoLoginAttemptedRef.current) {
        autoLoginAttemptedRef.current = true
        try {
          await loginAdmin(AUTO_DEMO_USERNAME, AUTO_DEMO_PASSWORD)
          const session = await fetchAdminSession()
          setAuthSession(session.session)
          setAuthStatus('authenticated')
          setRuntimeStatus('loading')
          setApiError(null)
          return
        } catch {
          setAuthStatus('auth_required')
          setApiError('Auto demo login is unavailable. Use the form above to sign in.')
          return
        }
      }

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
    stepIndex,
    webhookHistory,
  ])

  useEffect(() => {
    void bootstrapSession()
  }, [bootstrapSession])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (window.location.pathname !== '/auth/callback') {
      return
    }

    const finalizeOauth = async () => {
      setAuthPending(true)
      setApiError(null)
      setAuthStatus('checking')

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const queryParams = new URLSearchParams(window.location.search)
      const accessToken = hashParams.get('access_token') || queryParams.get('access_token') || ''
      const errorDescription =
        queryParams.get('error_description') ||
        hashParams.get('error_description') ||
        queryParams.get('error') ||
        hashParams.get('error') ||
        ''

      if (!accessToken) {
        setAuthPending(false)
        setAuthStatus('auth_required')
        setApiError(errorDescription || 'OAuth callback did not return an access token.')
        window.history.replaceState({}, '', '/')
        return
      }

      try {
        const result = await createOauthSession(accessToken)
        setAuthSession(result.session)
        setAuthStatus('authenticated')
        setRuntimeStatus('loading')
        window.localStorage.setItem(OAUTH_SESSION_EVENT, String(Date.now()))
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: OAUTH_SESSION_EVENT }, window.location.origin)
        }
        window.history.replaceState({}, '', '/')
        if (window.opener && !window.opener.closed) {
          window.close()
        }
      } catch (error) {
        clearLiveConsoleState()
        setAuthSession(null)
        setAuthStatus('auth_required')
        setApiError(error instanceof Error ? error.message : 'OAuth login failed.')
        window.history.replaceState({}, '', '/')
      } finally {
        setAuthPending(false)
      }
    }

    void finalizeOauth()
  }, [clearLiveConsoleState])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const refreshSession = () => {
      startTransition(() => {
        void bootstrapSession()
      })
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return
      }

      if (event.data?.type === OAUTH_SESSION_EVENT) {
        refreshSession()
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === OAUTH_SESSION_EVENT && event.newValue) {
        refreshSession()
      }
    }

    window.addEventListener('message', handleMessage)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('message', handleMessage)
      window.removeEventListener('storage', handleStorage)
    }
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
          if (!selectedLeadId && queue[0]?.id) {
            setSelectedLeadId(queue[0].id)
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
        'sync.mirror_updated',
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
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Live test execution failed.')
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
      }

      markRuntimeReady()
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to execute the selected proof recipe.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to execute the selected proof recipe.',
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
          ? result.message ?? 'Local snapshot pushed to the remote mirror.'
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
          `Lead: ${leadName} (${leadHandle})`,
          `Source: ${activeLead?.source ?? 'unknown'}`,
          `Offer: ${activeLead?.offer ?? 'unknown'}`,
          `Queue pressure: ${queueTotal} total / ${recoveryCount} recovery`,
          `Revenue snapshot: ${revenueValue}`,
          `Connector backlog: ${reportsOverview?.outboxSummary.queued ?? 0} queued / ${failedCount} failed`,
          'Next step: show the live queue, then replay the supporting workflow once.',
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
    setRuntimeResetPending(true)
    try {
      const snapshot = await resetRuntimeState()
      applySnapshot(snapshot as never)
      const [nextQueue, nextReports] = await Promise.all([fetchQueue(), fetchReportsOverview()])
      setQueueRecords(nextQueue)
      setReportsOverview(nextReports)
      setToolArtifact(null)
      setSelectedLeadId(nextQueue[0]?.id ?? '')
      setScenarioId(inferScenarioIdFromStage(nextQueue[0]?.stage))
      setStepIndex(0)
      setWebhookResult({
        status: 'accepted',
        message: 'Runtime reset to the seeded interview dataset.',
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
      return
    } catch (error) {
      handleRuntimeFailure(error, 'Failed to retry the delivery item.')
      setWebhookResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'Failed to retry the delivery item.',
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

  const handleOauthLogin = async (provider: 'google' | 'github') => {
    setOauthProviderPending(provider)
    setApiError(null)

    try {
      const { authorizeUrl } = await fetchOauthAuthorizeUrl(provider, window.location.origin)
      const authWindow = window.open(authorizeUrl, '_blank', 'noopener,noreferrer')
      if (!authWindow) {
        window.location.assign(authorizeUrl)
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to start OAuth login.')
      setOauthProviderPending(null)
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
                    <p>Use a provider or operator credentials.</p>
                  </div>

                  <div className="auth-providers">
                    <button
                      type="button"
                      className="auth-provider-button"
                      disabled={authPending}
                      onClick={() => handleOauthLogin('google')}
                    >
                      <ProviderIcon provider="google" />
                      <span>{oauthProviderPending === 'google' ? 'Opening Google…' : 'Continue with Google'}</span>
                    </button>
                    <button
                      type="button"
                      className="auth-provider-button"
                      disabled={authPending}
                      onClick={() => handleOauthLogin('github')}
                    >
                      <ProviderIcon provider="github" />
                      <span>{oauthProviderPending === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}</span>
                    </button>
                  </div>

                  <div className="auth-divider auth-divider-tight">
                    <span>or use operator login</span>
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
      <header className="console-header">
        <div className="console-brand">
          <div>
            <p className="eyebrow">Creator funnel ops</p>
            <h1>COBE operator console</h1>
          </div>
          <p className="console-copy">
            Work a live DM funnel, push checkout handoff, recover no-shows, and validate revenue
            events from one SQL-backed surface.
          </p>
        </div>

        <div className="header-strip">
          {missionStats.map((stat, index) => (
            <article key={stat.label} className={`header-cell header-cell-${index + 1}`}>
              <p className="stat-label">{stat.label}</p>
              <p className="header-value">{stat.value}</p>
              <p className="stat-note">{stat.note}</p>
            </article>
          ))}
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
          </div>

          <div className="command-cluster">
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
              className="button button-warning button-small"
              onClick={handleRunLiveTest}
              disabled={!liveConsoleReady}
            >
              Run live test
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={handleExport}
            >
              Export proof
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={handleLogNote}
              disabled={!liveConsoleReady}
            >
              Log note
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>

        {apiError ? (
          <div className={`runtime-banner runtime-banner-${runtimeStatus === 'degraded' ? 'degraded' : 'auth_required'}`}>
            <strong>{runtimeStatus === 'degraded' ? 'Degraded runtime' : 'Session required'}</strong>
            <span>{apiError}</span>
          </div>
        ) : null}
        <div className="runtime-banner">
          <strong>Runtime status</strong>
          <span>
            {runtimeStatus === 'ready'
              ? 'Live backend connected.'
              : runtimeStatus === 'loading'
                ? 'Loading queue, workflow shell, reports, and rail state from the backend.'
                : runtimeStatus === 'degraded'
                  ? 'Live reads failed. The console shell is intentionally withholding seeded fallback data.'
                  : 'Waiting for an authenticated live runtime.'}
          </span>
        </div>
      </header>

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

              return (
                <button
                  key={lead.id}
                  type="button"
                  className={`queue-item ${isActive ? 'queue-item-active' : ''}`}
                  onClick={() => {
                    setSelectedLeadId(lead.id)
                    setScenarioId(inferScenarioIdFromStage(lead.stage))
                    setStepIndex(0)
                    setWebhookResult(null)
                  }}
                >
                  <div className="queue-item-topline">
                    <div>
                      <p className="mini-label">{lead.source}</p>
                      <strong>{lead.name}</strong>
                    </div>
                    <span className={`signal-badge signal-${priorityLabel}`}>{priorityLabel}</span>
                  </div>
                  <p className="timeline-meta">
                    {lead.handle} • {lead.offer} • {lead.stage}
                  </p>
                  <p className="queue-item-note">{lead.recommendedAction}</p>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="console-panel workspace-panel">
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
            <div className="workspace-title">
              <p className="panel-kicker">Active workflow</p>
              <h2>{activeLead?.name ? `${activeLead.name} workflow` : activeScenario.title}</h2>
              <p className="stat-note">
                {activeLead?.nextAction ??
                  'No live workflow state is available until the backend returns an authenticated queue record.'}
              </p>
            </div>

            <div className="workspace-status">
              <div className="status-block status-block-cyan">
                <p className="mini-label">Current step</p>
                <strong>{runtime.stepLabels[stepIndex]}</strong>
                <p>{activeLeadQueue[0]?.note ?? activeScenario.steps[stepIndex]}</p>
              </div>
              <div className="status-block status-block-amber">
                <p className="mini-label">{runtime.metricLabel}</p>
                <strong>{activeMetricValue}</strong>
                <p>{activeLeadQueue[0]?.payloadLabel ?? activeScenario.revenueAngle}</p>
              </div>
              <div className="status-block status-block-green">
                <p className="mini-label">Operator target</p>
                <strong>{activeLead?.handle ?? 'No live lead loaded'}</strong>
                <p>
                  {activeLeadQueue[0]?.note ??
                    activeLead?.nextAction ??
                    'Actions stay disabled until the backend provides a live workflow target.'}
                </p>
              </div>
            </div>

            <div className="workflow-track">
              <div className="workflow-track-topline">
                <span className="status-pill">
                  Step {stepIndex + 1}/{runtime.stepLabels.length}
                </span>
                <span className="timeline-meta">
                  {activeLeadQueue.length ? `${activeLeadQueue.length} live relays` : `${activeScenario.hoursSaved} reclaimed`}
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>

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
                onClick={() => setWorkbenchTab(value as WorkbenchTab)}
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

              <section className="stage-stack">
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
                  <div className="action-grid">
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
              </section>
            </div>
          ) : null}

          {workbenchTab === 'recovery' ? (
            <div className="stage-layout">
              <section className="stage-panel stage-panel-primary">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Recovery state</p>
                    <h3>{activeLead?.name ?? 'No live recovery state loaded'}</h3>
                    <p className="timeline-meta">{activeBooking?.slot ?? 'No call slot required'}</p>
                  </div>
                  <span className={`booking-status booking-${runtime.bookingStatuses[stepIndex]}`}>
                    {runtime.bookingStatuses[stepIndex]}
                  </span>
                </div>

                <p className="booking-owner">Closer: {activeLead?.owner ?? 'Unassigned'}</p>
                <p className="booking-copy">
                  {activeBooking?.recoveryAction ??
                    'Payment path skips call handling and moves directly into onboarding automation.'}
                </p>

                <div className="timeline-stack">
                  {activeLeadTimeline.map((entry) => (
                    <article key={entry.id} className="timeline-card">
                      <div className="section-topline">
                        <div>
                          <p className="event-name">{entry.title}</p>
                          <p className="timeline-meta">
                            {entry.type} • {entry.timestamp}
                          </p>
                        </div>
                        <span className={`event-status event-${entry.type}`}>{entry.type}</span>
                      </div>
                      <p>{entry.detail}</p>
                    </article>
                  ))}
                  {activeLeadTimeline.length === 0 ? (
                    <p className="timeline-meta">
                      Timeline events remain empty until the backend returns an authenticated workflow history.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="stage-stack">
                <article className="stage-panel">
                  <div className="section-topline">
                    <div>
                      <p className="mini-label">Recovery playbook</p>
                      <h3>Queued actions</h3>
                    </div>
                    <span className="signal-badge signal-critical">ghl branch</span>
                  </div>
                  <ol className="scenario-steps">
                    {(activeLeadTimeline.length
                      ? activeLeadTimeline.slice(0, 4).map((entry) => entry.detail)
                      : activeScenario.steps
                    ).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </article>

                <article className="stage-panel">
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
                </article>
              </section>
            </div>
          ) : null}

          {workbenchTab === 'payload' ? (
            <div className="stage-layout stage-layout-payload">
              <section className="stage-panel stage-panel-primary">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Meta / Stripe payload lab</p>
                    <h3>Webhook editor</h3>
                  </div>
                  <div className="command-cluster">
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

              <section className="stage-stack">
                <article className="stage-panel">
                  <div className="section-topline">
                    <div>
                      <p className="mini-label">Webhook inbox</p>
                      <h3>Replayable events</h3>
                    </div>
                    <span className="status-pill">{webhookHistory.length} stored</span>
                  </div>
                  <div className="webhook-list">
                    {webhookHistory.map((item) => (
                      <article key={item.id} className="webhook-item">
                        <div>
                          <p className="event-name">{item.label}</p>
                          <p className="timeline-meta">{item.id}</p>
                        </div>
                        <div className="command-cluster">
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
                    ))}
                  </div>
                </article>

                <article className="stage-panel">
                  <div className="section-topline">
                    <div>
                      <p className="mini-label">Implementation snippets</p>
                      <h3>Glue code proof</h3>
                    </div>
                  </div>
                  <div className="snippet-stack">
                    {implementationSnippets.map((snippet) => (
                      <article key={snippet.label} className="snippet-card">
                        <p className="event-name">{snippet.label}</p>
                        <pre className="proof-preview">{snippet.body}</pre>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>
          ) : null}

          <section className="notes-panel">
            <div className="section-topline">
              <div>
                <p className="mini-label">Operator notes</p>
                <h3>Working memory</h3>
              </div>
              <span className="timeline-meta">Persisted locally</span>
            </div>
            <textarea
              className="notes-editor"
              value={operatorNotes}
              onChange={(event) => setOperatorNotes(event.target.value)}
              placeholder="Capture blockers, account-specific mapping, or deployment notes."
            />
          </section>
        </section>

        <aside className="console-panel systems-panel">
          <div className="section-topline">
            <div>
              <p className="panel-kicker">Systems rail</p>
              <h2>Relays and intelligence</h2>
            </div>
            <span className="status-pill">{railTab}</span>
          </div>

          <div className="workspace-tabs rail-tabs">
            {[
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
                    <article key={item.id} className="queue-card">
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
                <div className="connector-grid">
                  {automationConnectors.map((connector) => {
                    const state = connectorStates[connector.name]
                    const report = reportsOverview?.connectors.find((entry) => entry.name === connector.name)

                    return (
                      <article key={connector.name} className="connector-card">
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
                        <div className="queue-card-footer">
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
                    <article key={metric.label} className="metric-card">
                      <p className="metric-label">{metric.label}</p>
                      <p className="metric-value">{metric.value}</p>
                      <p className="metric-delta">{metric.delta}</p>
                    </article>
                  ))}
                  <article className="metric-card">
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
                    <div className="sync-summary-item">
                      <p className="metric-label">Realtime</p>
                      <p className="metric-value">
                        {syncStatus?.realtime.connected ? 'Connected' : 'Polling'}
                      </p>
                      <p className="metric-delta">
                        {syncStatus?.realtime.eventCount ?? 0} events •{' '}
                        {syncStatus?.realtime.pollMs ?? 0}ms poll
                      </p>
                    </div>
                    <div className="sync-summary-item">
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
                    <div className="sync-summary-item">
                      <p className="metric-label">Mirror rows</p>
                      <p className="metric-value">
                        {syncStatus?.mirror && !('error' in syncStatus.mirror)
                          ? Object.values(syncStatus.mirror).reduce((total, count) => total + count, 0)
                          : 0}
                      </p>
                      <p className="metric-delta">
                        {syncStatus?.mirror && !('error' in syncStatus.mirror)
                          ? `${Object.keys(syncStatus.mirror).length} tables mirrored`
                          : 'Mirror health unavailable'}
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
                          <article key={field} className="sync-diff-card">
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
                    <article key={template.id} className="tool-template-card">
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
                      <article key={item.id} className="tool-failure-card">
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
        </aside>
      </main>
    </div>
  )
}

export default App
