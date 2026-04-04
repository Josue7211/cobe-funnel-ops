import { startTransition, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  fetchBootstrap,
  logNote as logNoteRequest,
  pingConnector as pingConnectorRequest,
  retryDelivery as retryDeliveryRequest,
  runLeadAction,
  runLiveTest as runLiveTestRequest,
  validateWebhook as validateWebhookRequest,
} from './api'
import {
  automationRules,
  automationConnectors,
  bookings,
  capiEvents,
  conversations,
  demoScenarios,
  eventLog,
  integrationFit,
  leads,
  repoModules,
} from './data'
import type { Booking, FunnelStage, Lead } from './types'

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

type WorkbenchTab = 'funnel' | 'recovery' | 'payload'

type RailTab = 'operations' | 'audit' | 'automation' | 'metrics'

const leadStagePriority: Record<FunnelStage, number> = {
  'no-show': 0,
  'checkout-sent': 1,
  booked: 2,
  engaged: 3,
  recovery: 4,
  new: 5,
  won: 6,
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

const defaultConnectorStates = automationConnectors.reduce<Record<string, ConnectorState>>(
  (accumulator, connector) => {
    accumulator[connector.name] = {
      status: 'ready',
      lastPing: 'just now',
      runs: 0,
      note: `${connector.name} is staged for the next relay.`,
    }
    return accumulator
  },
  {},
)

const initialAuditEvents: AuditEvent[] = [
  {
    id: 'aud-001',
    kind: 'webhook',
    title: 'Webhook validated',
    detail: 'Stripe checkout event passed schema checks and was queued for relay.',
    target: 'Stripe',
    timestamp: '09:15:11',
  },
  {
    id: 'aud-002',
    kind: 'rule',
    title: 'Rule test passed',
    detail: 'Keyword trigger matched the hot DM transcript and queued the checkout branch.',
    target: 'rule-001',
    timestamp: '09:16:02',
  },
  {
    id: 'aud-003',
    kind: 'connector',
    title: 'Meta CAPI connector ready',
    detail: 'Server-event naming and match keys are ready for the next export.',
    target: 'Meta CAPI',
    timestamp: '09:17:44',
  },
]

const defaultDeliveryQueue: DeliveryItem[] = [
  {
    id: 'dq-001',
    connector: 'Stripe',
    channel: 'checkout_handoff',
    target: '@miamoves',
    payloadLabel: 'InitiateCheckout',
    status: 'delivered',
    lastAttempt: '09:15:11',
    note: 'Low-ticket checkout link delivered after DM qualification.',
  },
  {
    id: 'dq-002',
    connector: 'GHL',
    channel: 'consult_routing',
    target: '@evanbuilds',
    payloadLabel: 'BookingCreated',
    status: 'processing',
    lastAttempt: '14:30:02',
    note: 'Consult lead routed to closer and reminder sequence started.',
  },
  {
    id: 'dq-003',
    connector: 'Meta CAPI',
    channel: 'server_events',
    target: '@jadeteaches',
    payloadLabel: 'Purchase',
    status: 'queued',
    lastAttempt: '08:06:49',
    note: 'Purchase payload normalized and waiting for the next relay window.',
  },
]

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

function App() {
  const persisted = readPersistedState()
  const defaultWebhookHistory: WebhookEvent[] = [
    {
      id: 'wh-001',
      label: 'DM inbound received',
      payload: JSON.stringify(scenarioRuntimes['scenario-001'].payloads[0], null, 2),
    },
    {
      id: 'wh-002',
      label: 'Call marked no-show',
      payload: JSON.stringify(scenarioRuntimes['scenario-002'].payloads[2], null, 2),
    },
  ]
  const defaultRuleDrafts: RuleDraft[] = automationRules.map((rule) => ({
    ...rule,
    enabled: true,
  }))
  const defaultLeadRecords: Lead[] = leads.map((lead) => ({
    ...lead,
    tags: [...lead.tags],
  }))
  const defaultBookingRecords: Booking[] = bookings.map((booking) => ({
    ...booking,
  }))
  const [scenarioId, setScenarioId] = useState(persisted?.scenarioId ?? demoScenarios[0].id)
  const [stepIndex, setStepIndex] = useState(persisted?.stepIndex ?? 0)
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
  const [leadRecords, setLeadRecords] = useState<Lead[]>(
    Array.isArray(persisted?.leadRecords) ? persisted.leadRecords : defaultLeadRecords,
  )
  const [bookingRecords, setBookingRecords] = useState<Booking[]>(
    Array.isArray(persisted?.bookingRecords) ? persisted.bookingRecords : defaultBookingRecords,
  )
  const [deliveryQueue, setDeliveryQueue] = useState<DeliveryItem[]>(
    Array.isArray(persisted?.deliveryQueue) ? persisted.deliveryQueue : defaultDeliveryQueue,
  )
  const [webhookHistory, setWebhookHistory] = useState<WebhookEvent[]>(
    Array.isArray(persisted?.webhookHistory) ? persisted.webhookHistory : defaultWebhookHistory,
  )
  const [ruleDrafts] = useState<RuleDraft[]>(
    Array.isArray(persisted?.ruleDrafts) ? persisted.ruleDrafts : defaultRuleDrafts,
  )
  const [connectorStates, setConnectorStates] = useState<Record<string, ConnectorState>>(
    persisted?.connectorStates && typeof persisted.connectorStates === 'object'
      ? persisted.connectorStates
      : defaultConnectorStates,
  )
  const [operatorNotesHistory, setOperatorNotesHistory] = useState<OperatorNote[]>(
    Array.isArray(persisted?.operatorNotesHistory) ? persisted.operatorNotesHistory : [],
  )
  const [auditQuery, setAuditQuery] = useState('')
  const [auditKindFilter, setAuditKindFilter] = useState<'all' | AuditKind>('all')
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(
    Array.isArray(persisted?.auditEvents) ? persisted.auditEvents : initialAuditEvents,
  )
  const [liveTestRuns, setLiveTestRuns] = useState<LiveTestRun[]>(
    Array.isArray(persisted?.liveTestRuns) ? persisted.liveTestRuns : [],
  )
  const [ruleTestResults, setRuleTestResults] = useState<Record<string, RuleTestResult>>(
    persisted?.ruleTestResults && typeof persisted.ruleTestResults === 'object'
      ? persisted.ruleTestResults
      : {},
  )
  const [webhookResult, setWebhookResult] = useState<{
    status: 'accepted' | 'rejected'
    message: string
  } | null>(null)
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>(
    persisted?.workbenchTab ?? 'funnel',
  )
  const [railTab, setRailTab] = useState<RailTab>(persisted?.railTab ?? 'operations')

  const activeScenario = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === scenarioId) ?? demoScenarios[0],
    [scenarioId],
  )
  const runtime = scenarioRuntimes[activeScenario.id]
  const activeLead = leadRecords.find((lead) => lead.id === activeScenario.leadId) ?? leadRecords[0]
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeScenario.conversationId) ??
    conversations[0]
  const activeBooking = bookingRecords.find((booking) => booking.id === activeScenario.bookingId)
  const visibleMessages = activeConversation.messages.slice(0, runtime.visibleMessageCount[stepIndex])
  const progress = ((stepIndex + 1) / runtime.stepLabels.length) * 100
  const activePayload = runtime.payloads[stepIndex]
  const activeMetricValue = runtime.metricValues[stepIndex]
  const filteredLeads = leadRecords.filter((lead) => {
    const matchesStage = leadStageFilter === 'all' ? true : lead.stage === leadStageFilter
    const query = leadQuery.trim().toLowerCase()
    const haystack =
      `${lead.name} ${lead.handle} ${lead.source} ${lead.offer} ${lead.owner} ${lead.tags.join(' ')}`.toLowerCase()
    return matchesStage && haystack.includes(query)
  })
  const filteredDeliveryQueue = deliveryQueue.filter((item) =>
    deliveryFilter === 'all' ? true : item.status === deliveryFilter,
  )
  const prioritizedLeads = [...filteredLeads].sort((left, right) => {
    const stageDifference = leadStagePriority[left.stage] - leadStagePriority[right.stage]
    if (stageDifference !== 0) {
      return stageDifference
    }

    return left.lastTouch.localeCompare(right.lastTouch)
  })
  const prioritizedDeliveryQueue = [...filteredDeliveryQueue].sort((left, right) => {
    const statusDifference = deliveryStatusPriority[left.status] - deliveryStatusPriority[right.status]
    if (statusDifference !== 0) {
      return statusDifference
    }

    return right.lastAttempt.localeCompare(left.lastAttempt)
  })
  const leadScenarios = useMemo(
    () =>
      demoScenarios.reduce<Record<string, string>>((accumulator, scenario) => {
        accumulator[scenario.leadId] = scenario.id
        return accumulator
      }, {}),
    [],
  )
  const activeLeadQueue = filteredDeliveryQueue.filter((item) => item.target === activeLead.handle)
  const activeLeadTimeline = eventLog.filter((entry) => entry.leadId === activeLead.id)
  const scenarioEvents = eventLog.filter((entry) =>
    runtime.visibleEventIds[stepIndex]?.includes(entry.id),
  )
  const activeLeadAudit = auditEvents.filter((entry) =>
    `${entry.target} ${entry.detail}`.toLowerCase().includes(activeLead.id) ||
    `${entry.target} ${entry.detail}`.toLowerCase().includes(activeLead.handle.toLowerCase()),
  )
  const missionStats = useMemo(() => {
    const leadsToday = leadRecords.length
    const bookedCalls = bookingRecords.filter(
      (booking) => booking.status === 'booked' || booking.status === 'reminded',
    ).length
    const recoveredNoShows = bookingRecords.filter((booking) => booking.status === 'recovered').length
    const stripeRevenue = leadRecords
      .filter((lead) => lead.stage === 'won')
      .reduce((total, lead) => total + parseMoneyValue(lead.budget), 0)

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
  }, [bookingRecords, leadRecords])

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
        value: String(bookingRecords.filter((booking) => booking.status === 'no-show').length),
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
    [bookingRecords, deliveryQueue, leadRecords, liveTestRuns.length],
  )
  const visibleAuditEvents = auditEvents
    .filter((entry) => (auditKindFilter === 'all' ? true : entry.kind === auditKindFilter))
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.detail} ${entry.target} ${entry.timestamp}`.toLowerCase()
      return haystack.includes(auditQuery.toLowerCase())
    })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scenarioId,
        stepIndex,
        leadQuery,
        leadStageFilter,
        deliveryFilter,
        operatorNotes,
        workbenchTab,
        railTab,
        leadRecords,
        bookingRecords,
        deliveryQueue,
        webhookHistory,
        ruleDrafts,
        connectorStates,
        operatorNotesHistory,
        auditEvents,
        liveTestRuns,
        ruleTestResults,
      }),
    )
  }, [
    bookingRecords,
    deliveryFilter,
    operatorNotes,
    auditEvents,
    operatorNotesHistory,
    connectorStates,
    deliveryQueue,
    leadQuery,
    leadRecords,
    leadStageFilter,
    liveTestRuns,
    ruleDrafts,
    ruleTestResults,
    scenarioId,
    workbenchTab,
    railTab,
    stepIndex,
    webhookHistory,
  ])

  useEffect(() => {
    let cancelled = false

    fetchBootstrap()
      .then((snapshot) => {
        if (!cancelled) {
          applySnapshot(snapshot)
        }
      })
      .catch(() => {
        // Keep the seeded frontend state when the API is unavailable.
      })

    return () => {
      cancelled = true
    }
  }, [])

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
    bookingRecords?: Booking[]
    webhookHistory?: WebhookEvent[]
    connectorStates?: Record<string, ConnectorState>
    deliveryQueue?: DeliveryItem[]
    operatorNotesHistory?: OperatorNote[]
    auditEvents?: AuditEvent[]
    liveTestRuns?: LiveTestRun[]
    ruleTestResults?: Record<string, RuleTestResult>
  }) => {
    if (snapshot.leadRecords) {
      setLeadRecords(snapshot.leadRecords)
    }
    if (snapshot.bookingRecords) {
      setBookingRecords(snapshot.bookingRecords)
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
  }

  const updateConnectorState = (name: string, patch: Partial<ConnectorState>) => {
    setConnectorStates((current) => {
      const existing = current[name] ?? defaultConnectorStates[name]
      if (!existing) {
        return current
      }

      return {
        ...current,
        [name]: {
          ...existing,
          ...patch,
        },
      }
    })
  }

  const updateLeadRecord = (leadId: string, patch: Partial<Lead>) => {
    setLeadRecords((current) =>
      current.map((lead) => (lead.id === leadId ? { ...lead, ...patch } : lead)),
    )
  }

  const updateBookingRecord = (bookingId: string, patch: Partial<Booking>) => {
    setBookingRecords((current) =>
      current.map((booking) => (booking.id === bookingId ? { ...booking, ...patch } : booking)),
    )
  }

  const addDeliveryItem = (item: Omit<DeliveryItem, 'id'>) => {
    setDeliveryQueue((current) => [
      {
        id: `dq-${String(current.length + 1).padStart(3, '0')}`,
        ...item,
      },
      ...current,
    ])
  }

  const handleScenarioChange = (nextScenarioId: string) => {
      const nextScenario = demoScenarios.find((scenario) => scenario.id === nextScenarioId) ?? demoScenarios[0]
      const nextRuntime = scenarioRuntimes[nextScenario.id]
    startTransition(() => {
      setScenarioId(nextScenarioId)
      setStepIndex(0)
      setWebhookInput(JSON.stringify(nextRuntime.payloads[0], null, 2))
      setWebhookResult(null)
    })
    appendAuditEvent({
      kind: 'scenario',
      title: 'Scenario switched',
      detail: `Opened ${nextScenario.title} and reset the simulator to step one.`,
      target: nextScenario.id,
    })
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
    } catch {
      // Fall back to local validation when the API is unavailable.
    }

    const result = validateWebhookPayload(webhookInput)
    if (!result.ok) {
      setWebhookResult({
        status: 'rejected',
        message: result.message,
      })
      return
    }

    setWebhookResult({
      status: 'accepted',
      message: 'Accepted: payload passes schema check and is ready for the simulated automation relay.',
    })
    setWebhookHistory((current) => [
      {
        id: `wh-${String(current.length + 1).padStart(3, '0')}`,
        label: result.label,
        payload: JSON.stringify(result.parsed, null, 2),
      },
      ...current,
    ])
    appendAuditEvent({
      kind: 'webhook',
      title: 'Webhook validated',
      detail: `Accepted payload labeled ${result.label} and added it to the inbox.`,
      target: result.label,
    })
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
      setWebhookInput(payload)
      setWebhookResult({
        status: response.ok ? 'accepted' : 'rejected',
        message: response.message,
      })
      return
    } catch {
      // Fall back to local live-test logging when the API is unavailable.
    }

    const result = validateWebhookPayload(payload)
    if (!result.ok) {
      setWebhookResult({
        status: 'rejected',
        message: result.message,
      })
      return
    }

    const route =
      typeof result.parsed.event_name === 'string' && result.parsed.event_name.toLowerCase() === 'purchase'
        ? {
            connector: 'Meta CAPI',
            label: 'Purchase',
            note: 'Purchase payload normalized and staged for server-side relay.',
            status: 'queued' as const,
          }
        : Array.isArray(result.parsed.onboarding_assets)
          ? {
              connector: 'Make',
              label: 'OnboardingAutopilot',
              note: 'Onboarding autopilot payload routed to the asset provisioning lane.',
              status: 'queued' as const,
            }
          : typeof result.parsed.booking_status === 'string' || typeof result.parsed.route === 'string'
            ? {
                connector: 'GHL',
                label: String(result.parsed.booking_status ?? result.parsed.route),
                note: 'Consult routing update queued for the ops relay.',
                status: 'processing' as const,
              }
            : {
                connector: 'Zapier',
                label: String(result.parsed.event_name ?? 'CustomEvent'),
                note: 'Custom automation payload routed through the default relay lane.',
                status: 'queued' as const,
              }

    const timestamp = new Date().toISOString()
    setLiveTestRuns((current) => [
      {
        id: `ltr-${String(current.length + 1).padStart(3, '0')}`,
        scenarioId: activeScenario.id,
        scenarioTitle: activeScenario.title,
        stepLabel: runtime.stepLabels[stepIndex],
        payloadLabel: route.label,
        connector: route.connector,
        status: 'accepted',
        resultMessage: `${route.connector} accepted the live test payload and queued ${route.label}.`,
        payload,
        createdAt: timestamp,
      },
      ...current,
    ])
    setDeliveryQueue((current) => [
      {
        id: `dq-${String(current.length + 1).padStart(3, '0')}`,
        connector: route.connector,
        channel:
          route.connector === 'Meta CAPI'
            ? 'server_events'
            : route.connector === 'GHL'
              ? 'consult_routing'
              : route.connector === 'Make'
                ? 'onboarding'
                : 'automation_relay',
        target: `scenario:${activeScenario.id}`,
        payloadLabel: route.label,
        status: route.status,
        lastAttempt: timestamp,
        note: route.note,
      },
      ...current,
    ])
    updateConnectorState(route.connector, {
      status: 'syncing',
      lastPing: timestamp,
      runs: (connectorStates[route.connector]?.runs ?? 0) + 1,
      note: `${route.connector} accepted a live test run from the scenario tester.`,
    })
    appendAuditEvent({
      kind: 'scenario',
      title: 'Live test run completed',
      detail: `${route.connector} accepted ${route.label} and queued the relay item.`,
      target: activeScenario.id,
    })
    setWebhookInput(payload)
    setWebhookResult({
      status: 'accepted',
      message: `${route.connector} accepted the live test payload and queued ${route.label}.`,
    })
  }

  const evaluateRule = (rule: RuleDraft): RuleTestResult => {
    const timestamp = new Date().toISOString()
    if (!rule.enabled) {
      return { status: 'skipped', detail: 'Rule disabled in the current simulator run.', timestamp }
    }

    const transcript = activeConversation.messages.map((message) => message.text).join(' ').toLowerCase()
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
      const matched = activeConversation.intent === 'call' || activeConversation.intent === 'checkout'
      return {
        status: matched ? 'pass' : 'fail',
        detail: matched
          ? `Matched intent signal: ${activeConversation.intent}.`
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
      return
    } catch {
      // Fall back to local note logging when the API is unavailable.
    }

    const entry: OperatorNote = {
      id: `note-${String(operatorNotesHistory.length + 1).padStart(3, '0')}`,
      note: trimmed,
      timestamp: new Date().toISOString(),
      scenarioId: activeScenario.id,
      stepLabel: runtime.stepLabels[stepIndex],
    }
    setOperatorNotesHistory((current) => [entry, ...current])
    appendAuditEvent({
      kind: 'note',
      title: 'Operator note logged',
      detail: trimmed,
      target: activeScenario.id,
    })
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
      return
    } catch {
      // Fall back to local state mutations when the API is unavailable.
    }

    if (action === 'checkout') {
      const nextTags = lead.tags.includes('checkout-live')
        ? lead.tags
        : [...lead.tags, 'checkout-live']
      updateLeadRecord(leadId, {
        stage: 'checkout-sent',
        tags: nextTags,
        nextAction: 'Checkout link sent; urgency bump queued at +2h.',
        lastTouch: 'just now',
      })
      addDeliveryItem({
        connector: 'Stripe',
        channel: 'checkout_handoff',
        target: lead.handle,
        payloadLabel: 'InitiateCheckout',
        status: 'queued',
        lastAttempt: new Date().toISOString(),
        note: 'Generated checkout handoff from the ops queue.',
      })
      appendAuditEvent({
        kind: 'scenario',
        title: 'Checkout queued',
        detail: `Promoted ${lead.handle} into checkout-sent and queued a Stripe handoff.`,
        target: leadId,
      })
      return
    }

    if (action === 'route') {
      updateLeadRecord(leadId, {
        owner: 'Nina',
        stage: 'booked',
        nextAction: 'Closer assigned; reminders and call prep started.',
        lastTouch: 'just now',
      })
      if (activeBooking) {
        updateBookingRecord(activeBooking.id, {
          owner: 'Nina',
          status: 'booked',
          recoveryAction: 'Consult booked and reminder sequence started.',
        })
      }
      addDeliveryItem({
        connector: 'GHL',
        channel: 'consult_routing',
        target: lead.handle,
        payloadLabel: 'BookingCreated',
        status: 'processing',
        lastAttempt: new Date().toISOString(),
        note: 'Lead assigned to closer and routed into booking flow.',
      })
      appendAuditEvent({
        kind: 'scenario',
        title: 'Closer assigned',
        detail: `Routed ${lead.handle} to Nina and kicked off the consult branch.`,
        target: leadId,
      })
      return
    }

    if (action === 'no-show') {
      const nextTags = lead.tags.includes('no-show') ? lead.tags : [...lead.tags, 'no-show']
      updateLeadRecord(leadId, {
        stage: 'no-show',
        tags: nextTags,
        nextAction: 'Recovery branch queued with proof stack and reschedule link.',
        lastTouch: 'just now',
      })
      if (activeBooking) {
        updateBookingRecord(activeBooking.id, {
          status: 'no-show',
          recoveryAction: 'Marked no-show and moved into recovery automation.',
        })
      }
      addDeliveryItem({
        connector: 'Make',
        channel: 'recovery_sequence',
        target: lead.handle,
        payloadLabel: 'NoShowRecovery',
        status: 'queued',
        lastAttempt: new Date().toISOString(),
        note: 'Recovery workflow staged after missed consult attendance.',
      })
      appendAuditEvent({
        kind: 'scenario',
        title: 'No-show escalated',
        detail: `Moved ${lead.handle} into no-show recovery and queued the sequence.`,
        target: leadId,
      })
      return
    }

    if (action === 'recover') {
      updateLeadRecord(leadId, {
        stage: 'recovery',
        nextAction: 'Recovered; waiting on rebook confirmation.',
        lastTouch: 'just now',
      })
      if (activeBooking) {
        updateBookingRecord(activeBooking.id, {
          status: 'recovered',
          recoveryAction: 'Recovered with proof stack and one-click rebook.',
        })
      }
      addDeliveryItem({
        connector: 'Meta CAPI',
        channel: 'server_events',
        target: lead.handle,
        payloadLabel: 'Schedule',
        status: 'queued',
        lastAttempt: new Date().toISOString(),
        note: 'Recovered consult status prepared for server-side reporting.',
      })
      appendAuditEvent({
        kind: 'scenario',
        title: 'Lead recovered',
        detail: `Recovered ${lead.handle} and prepared reporting payloads for the new booking path.`,
        target: leadId,
      })
      return
    }

    addDeliveryItem({
      connector: 'Slack',
      channel: 'team_alert',
      target: lead.handle,
      payloadLabel: 'HotLeadAlert',
      status: 'delivered',
      lastAttempt: new Date().toISOString(),
      note: 'Hot lead alert sent to the team for manual assist.',
    })
    appendAuditEvent({
      kind: 'connector',
      title: 'Slack alert sent',
      detail: `Pushed a manual assist alert for ${lead.handle}.`,
      target: leadId,
    })
  }

  const handleDeliveryRetry = async (deliveryId: string) => {
    try {
      const response = await retryDeliveryRequest(deliveryId)
      applySnapshot(response.snapshot)
      return
    } catch {
      // Fall back to local retry when the API is unavailable.
    }

    setDeliveryQueue((current) =>
      current.map((item) =>
        item.id === deliveryId
          ? {
              ...item,
              status: 'delivered',
              lastAttempt: new Date().toISOString(),
              note: `${item.connector} retried successfully from the outbox.`,
            }
          : item,
      ),
    )
    appendAuditEvent({
      kind: 'connector',
      title: 'Delivery retried',
      detail: `Outbox item ${deliveryId} was retried and marked delivered.`,
      target: deliveryId,
    })
  }

  const handleConnectorPing = async (connectorName: string) => {
    const current = connectorStates[connectorName] ?? defaultConnectorStates[connectorName]
    if (!current) {
      return
    }

    try {
      const response = await pingConnectorRequest(connectorName)
      applySnapshot(response.snapshot)
      return
    } catch {
      // Fall back to local connector updates when the API is unavailable.
    }

    const nextStatus: ConnectorStatus = 'ready'
    const timestamp = new Date().toISOString()

    updateConnectorState(connectorName, {
      status: nextStatus,
      lastPing: timestamp,
      runs: current.runs + 1,
      note: `${connectorName} checked, payload routing is healthy.`,
    })
    appendAuditEvent({
      kind: 'connector',
      title: `${connectorName} pinged`,
      detail: 'Connector health check completed and the relay path is ready.',
      target: connectorName,
    })
  }

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      scenario: activeScenario.title,
      step: runtime.stepLabels[stepIndex],
      stepIndex,
      lead: activeLead,
      conversation: {
        id: activeConversation.id,
        intent: activeConversation.intent,
        score: activeConversation.score,
        transcript: visibleMessages,
      },
      bookingStatus: runtime.bookingStatuses[stepIndex],
      visibleEvents: scenarioEvents,
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
      capiEvents,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeScenario.id}-proof.json`
    link.click()
    URL.revokeObjectURL(url)
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
          </div>

          <div className="command-cluster">
            <button
              type="button"
              className="button button-warning button-small"
              onClick={handleRunLiveTest}
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
            >
              Log note
            </button>
          </div>
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

          <div className="lead-queue">
            {prioritizedLeads.map((lead) => {
              const scenarioForLead = leadScenarios[lead.id]
              const isActive = lead.id === activeLead.id
              const priorityLabel =
                lead.stage === 'no-show'
                  ? 'critical'
                  : lead.stage === 'checkout-sent'
                    ? 'hot'
                    : lead.stage === 'booked'
                      ? 'watch'
                      : 'normal'

              return (
                <button
                  key={lead.id}
                  type="button"
                  className={`queue-item ${isActive ? 'queue-item-active' : ''}`}
                  onClick={() => {
                    if (scenarioForLead) {
                      handleScenarioChange(scenarioForLead)
                    }
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
                  <p className="queue-item-note">{lead.nextAction}</p>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="console-panel workspace-panel">
          <div className="workspace-header">
            <div className="workspace-title">
              <p className="panel-kicker">Active workflow</p>
              <h2>{activeScenario.title}</h2>
              <p className="stat-note">{activeScenario.outcome}</p>
            </div>

            <div className="workspace-status">
              <div className="status-block status-block-cyan">
                <p className="mini-label">Current step</p>
                <strong>{runtime.stepLabels[stepIndex]}</strong>
                <p>{activeScenario.steps[stepIndex]}</p>
              </div>
              <div className="status-block status-block-amber">
                <p className="mini-label">{runtime.metricLabel}</p>
                <strong>{activeMetricValue}</strong>
                <p>{activeScenario.revenueAngle}</p>
              </div>
              <div className="status-block status-block-green">
                <p className="mini-label">Operator target</p>
                <strong>{activeLead.handle}</strong>
                <p>{activeLead.nextAction}</p>
              </div>
            </div>

            <div className="workflow-track">
              <div className="workflow-track-topline">
                <span className="status-pill">
                  Step {stepIndex + 1}/{runtime.stepLabels.length}
                </span>
                <span className="timeline-meta">{activeScenario.hoursSaved} reclaimed</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
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
                    <h3>{activeLead.name}</h3>
                  </div>
                  <div className="score-badge">{activeConversation.score} intent score</div>
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
                </div>

                <div className="event-summary">
                  <p className="mini-label">Automation result</p>
                  <p>{activeConversation.automationSummary}</p>
                </div>
              </section>

              <section className="stage-stack">
                <article className="stage-panel">
                  <div className="section-topline">
                    <div>
                      <p className="mini-label">Lead profile</p>
                      <h3>{activeLead.handle}</h3>
                    </div>
                    <span className="stage-badge">{runtime.leadStages[stepIndex]}</span>
                  </div>

                  <dl className="detail-grid">
                    <div>
                      <dt>Offer</dt>
                      <dd>{activeLead.offer}</dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{activeLead.source}</dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>{activeLead.owner}</dd>
                    </div>
                    <div>
                      <dt>Budget</dt>
                      <dd>{activeLead.budget}</dd>
                    </div>
                    <div>
                      <dt>Last touch</dt>
                      <dd>{activeLead.lastTouch}</dd>
                    </div>
                    <div>
                      <dt>Hours saved</dt>
                      <dd>{activeScenario.hoursSaved}</dd>
                    </div>
                  </dl>

                  <div className="tag-row">
                    {activeLead.tags.map((tag) => (
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
                      onClick={() => handleLeadAction('checkout', activeLead.id)}
                    >
                      Queue checkout
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => handleLeadAction('route', activeLead.id)}
                    >
                      Route closer
                    </button>
                    <button
                      type="button"
                      className="button button-danger button-small"
                      onClick={() => handleLeadAction('no-show', activeLead.id)}
                    >
                      Mark no-show
                    </button>
                    <button
                      type="button"
                      className="button button-warning button-small"
                      onClick={() => handleLeadAction('recover', activeLead.id)}
                    >
                      Recover lead
                    </button>
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={() => handleLeadAction('alert', activeLead.id)}
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
                    <h3>{activeLead.name}</h3>
                    <p className="timeline-meta">{activeBooking?.slot ?? 'No call slot required'}</p>
                  </div>
                  <span className={`booking-status booking-${runtime.bookingStatuses[stepIndex]}`}>
                    {runtime.bookingStatuses[stepIndex]}
                  </span>
                </div>

                <p className="booking-owner">Closer: {activeLead.owner}</p>
                <p className="booking-copy">
                  {activeBooking?.recoveryAction ??
                    'Payment path skips call handling and moves directly into onboarding automation.'}
                </p>

                <div className="timeline-stack">
                  {activeLeadTimeline.map((entry) => (
                    <article key={entry.id} className="timeline-card">
                      <div className="section-topline">
                        <div>
                          <p className="event-name">{entry.event}</p>
                          <p className="timeline-meta">
                            {entry.channel} • {entry.timestamp}
                          </p>
                        </div>
                        <span className={`event-status event-${entry.status}`}>{entry.status}</span>
                      </div>
                      <p>{entry.detail}</p>
                    </article>
                  ))}
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
                    {activeScenario.steps.map((step) => (
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
                    {scenarioEvents.map((entry) => (
                      <span key={entry.id} className="tag">
                        {entry.event}
                      </span>
                    ))}
                  </div>
                </article>
              </section>
            </div>
          ) : null}

          {workbenchTab === 'payload' ? (
            <div className="stage-layout">
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
                    const state =
                      connectorStates[connector.name] ?? defaultConnectorStates[connector.name]

                    return (
                      <article key={connector.name} className="connector-card">
                        <div className="section-topline">
                          <div>
                            <p className="mini-label">{connector.category}</p>
                            <h3>{connector.name}</h3>
                          </div>
                          <span className={`connector-status connector-${state?.status ?? 'ready'}`}>
                            {state?.status ?? 'ready'}
                          </span>
                        </div>
                        <p>{connector.use}</p>
                        <div className="queue-card-footer">
                          <p className="timeline-meta">
                            {state?.lastPing ?? 'just now'} • {state?.runs ?? 0} runs
                          </p>
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => handleConnectorPing(connector.name)}
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
                    <p className="mini-label">Job fit</p>
                    <h3>Requirement coverage</h3>
                  </div>
                </div>
                <div className="fit-stack">
                  {integrationFit.map((item) => (
                    <article key={item.name} className="fit-card">
                      <h3>{item.name}</h3>
                      <p>{item.fit}</p>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          ) : null}

          {railTab === 'metrics' ? (
            <div className="rail-stack">
              <article className="rail-module rail-module-amber">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Revenue dashboard</p>
                    <h3>Live funnel metrics</h3>
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
                </div>
              </article>

              <article className="rail-module rail-module-magenta">
                <div className="section-topline">
                  <div>
                    <p className="mini-label">Meta CAPI</p>
                    <h3>Server event payloads</h3>
                  </div>
                  <span className="timeline-meta">{capiEvents.length} events</span>
                </div>
                <div className="capi-table">
                  {capiEvents.map((event) => (
                    <div key={event.eventName} className="capi-row">
                      <div>
                        <p className="event-name">{event.eventName}</p>
                        <p>{event.source}</p>
                      </div>
                      <div>
                        <p className="mini-label">Match keys</p>
                        <p>{event.matchKeys.join(', ')}</p>
                      </div>
                      <div>
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
        </aside>
      </main>
    </div>
  )
}

export default App
