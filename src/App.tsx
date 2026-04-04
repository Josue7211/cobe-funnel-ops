import { startTransition, useEffect, useMemo, useState } from 'react'
import './App.css'
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
  revenueMetrics,
  summaryStats,
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
  const [showExpandedTimeline, setShowExpandedTimeline] = useState(
    persisted?.showExpandedTimeline ?? false,
  )
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
  const [ruleDrafts, setRuleDrafts] = useState<RuleDraft[]>(
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
  const [ruleTestResults, setRuleTestResults] = useState<Record<string, RuleTestResult>>(
    persisted?.ruleTestResults && typeof persisted.ruleTestResults === 'object'
      ? persisted.ruleTestResults
      : {},
  )
  const [webhookResult, setWebhookResult] = useState<{
    status: 'accepted' | 'rejected'
    message: string
  } | null>(null)

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
  const scenarioEvents = eventLog.filter((entry) =>
    runtime.visibleEventIds[stepIndex]?.includes(entry.id),
  )
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scenarioId,
        stepIndex,
        showExpandedTimeline,
        leadQuery,
        leadStageFilter,
        deliveryFilter,
        operatorNotes,
        leadRecords,
        bookingRecords,
        deliveryQueue,
        webhookHistory,
        ruleDrafts,
        connectorStates,
        operatorNotesHistory,
        auditEvents,
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
    ruleDrafts,
    ruleTestResults,
    scenarioId,
    showExpandedTimeline,
    stepIndex,
    webhookHistory,
  ])

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
      setShowExpandedTimeline(false)
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

  const handleWebhookValidate = () => {
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

  const updateRuleDraft = (ruleId: string, patch: Partial<RuleDraft>) => {
    setRuleDrafts((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    )
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

  const handleLogNote = () => {
    const trimmed = operatorNotes.trim()
    if (!trimmed) {
      return
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

  const handleLeadAction = (
    action: 'checkout' | 'route' | 'no-show' | 'recover' | 'alert',
    leadId: string,
  ) => {
    const lead = leadRecords.find((entry) => entry.id === leadId)
    if (!lead) {
      return
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

  const handleDeliveryRetry = (deliveryId: string) => {
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

  const handleConnectorPing = (connectorName: string) => {
    const current = connectorStates[connectorName] ?? defaultConnectorStates[connectorName]
    if (!current) {
      return
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
      metrics: revenueMetrics,
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
    <div className="app-shell">
      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Creator Funnel Ops</p>
          <h1>Live operator simulator for funnels, recovery, and reporting.</h1>
          <p className="hero-text">
            This is no longer just a static concept. You can drive the funnel step by step, watch
            stages change, inspect emitted payloads, and show how manual ops work gets replaced.
          </p>
          <div className="hero-actions">
            <a href="#simulator" className="button button-primary">
              Run the simulator
            </a>
            <a href="#dashboard" className="button button-secondary">
              Inspect metrics
            </a>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-card-header">
            <span>Current path</span>
            <span>{stepIndex + 1}/{runtime.stepLabels.length}</span>
          </div>
          <h3>{activeScenario.title}</h3>
          <p>{activeScenario.outcome}</p>
          <div className="progress-wrap">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="mini-label">{runtime.stepLabels[stepIndex]}</p>
          </div>
        </div>
      </header>

      <section className="stats-grid">
        {summaryStats.map((stat) => (
          <article key={stat.label} className="stat-card">
            <p className="stat-label">{stat.label}</p>
            <p className="stat-value">{stat.value}</p>
            <p className="stat-note">{stat.note}</p>
          </article>
        ))}
      </section>

      <section className="module-strip">
        {repoModules.map((module) => (
          <article key={module.name} className="module-card">
            <p className="module-name">{module.name}</p>
            <p>{module.summary}</p>
          </article>
        ))}
      </section>

      <section id="simulator" className="scenario-strip">
        {demoScenarios.map((scenario) => (
          <article
            key={scenario.id}
            className={`scenario-card ${scenario.id === activeScenario.id ? 'scenario-card-active' : ''}`}
          >
            <div className="scenario-header">
              <div>
                <p className="module-name">Demo path</p>
                <h2>{scenario.title}</h2>
              </div>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => handleScenarioChange(scenario.id)}
              >
                {scenario.id === activeScenario.id ? 'Selected' : 'Open path'}
              </button>
            </div>
            <p className="scenario-outcome">{scenario.outcome}</p>
            <ol className="scenario-steps">
              {scenario.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="scenario-impact">
              <div>
                <p className="mini-label">Hours saved</p>
                <p>{scenario.hoursSaved}</p>
              </div>
              <div>
                <p className="mini-label">Revenue angle</p>
                <p>{scenario.revenueAngle}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <main className="workspace">
        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Simulation Controls</p>
              <h2>Drive the workflow</h2>
            </div>
            <span className="status-pill">Operator mode</span>
          </div>
          <div className="simulator-grid">
            <article className="simulator-card">
              <p className="mini-label">Current step</p>
              <h3>{runtime.stepLabels[stepIndex]}</h3>
              <p>{activeScenario.steps[stepIndex]}</p>
              <div className="control-row">
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => handleStepChange(stepIndex - 1)}
                  disabled={stepIndex === 0}
                >
                  Previous step
                </button>
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={() => handleStepChange(stepIndex + 1)}
                  disabled={stepIndex === runtime.stepLabels.length - 1}
                >
                  Advance flow
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
                  onClick={() => handleStepChange(0)}
                >
                  Reset
                </button>
              </div>
            </article>
            <article className="simulator-card">
              <p className="mini-label">{runtime.metricLabel}</p>
              <p className="metric-value">{activeMetricValue}</p>
              <p className="stat-note">
                This panel is here to keep the narration business-facing while you click through
                the scenario.
              </p>
            </article>
          </div>
        </section>

        <section id="dm-funnel" className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Module 1</p>
              <h2>DM Sprint Funnel</h2>
            </div>
            <span className="status-pill">ManyChat-style automation</span>
          </div>
          <div className="funnel-layout">
            <article className="inbox-card">
              <div className="inbox-header">
                <div>
                  <p className="mini-label">Selected conversation</p>
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
              <div className="automation-summary">
                <p className="mini-label">Automation result</p>
                <p>{activeConversation.automationSummary}</p>
              </div>
            </article>

            <article className="lead-card">
              <div className="lead-header">
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
                  <dt>Next action</dt>
                  <dd>{activeLead.nextAction}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd>{activeLead.budget}</dd>
                </div>
                <div>
                  <dt>Last touch</dt>
                  <dd>{activeLead.lastTouch}</dd>
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
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Ops Queue</p>
              <h2>Live lead operations</h2>
            </div>
            <span className="status-pill">{filteredLeads.length} visible leads</span>
          </div>
          <div className="audit-toolbar">
            <input
              className="audit-search"
              type="search"
              value={leadQuery}
              onChange={(event) => setLeadQuery(event.target.value)}
              placeholder="Search leads, handles, offers, owners, or tags"
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
          <div className="ops-grid">
            {filteredLeads.map((lead) => (
              <article key={lead.id} className="ops-card">
                <div className="lead-header">
                  <div>
                    <p className="mini-label">{lead.source}</p>
                    <h3>{lead.name}</h3>
                    <p className="timeline-meta">{lead.handle} • {lead.offer}</p>
                  </div>
                  <span className="stage-badge">{lead.stage}</span>
                </div>
                <p className="booking-owner">Owner: {lead.owner}</p>
                <p>{lead.nextAction}</p>
                <div className="tag-row">
                  {lead.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="ops-actions">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => handleLeadAction('checkout', lead.id)}
                  >
                    Queue checkout
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => handleLeadAction('route', lead.id)}
                  >
                    Route closer
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => handleLeadAction('no-show', lead.id)}
                  >
                    Mark no-show
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => handleLeadAction('recover', lead.id)}
                  >
                    Recover
                  </button>
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={() => handleLeadAction('alert', lead.id)}
                  >
                    Send alert
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Rule Lab</p>
              <h2>Automation Logic</h2>
            </div>
            <span className="status-pill">Editable + testable</span>
          </div>
          <div className="rule-stack">
            {ruleDrafts.map((rule) => {
              const sourceRule = automationRules.find((entry) => entry.id === rule.id)
              const result = ruleTestResults[rule.id]

              return (
                <article
                  key={rule.id}
                  className={`rule-card ${rule.enabled ? '' : 'rule-disabled'}`}
                >
                  <div className="rule-header">
                    <div>
                      <p className="mini-label">{sourceRule?.system}</p>
                      <h3>{rule.trigger}</h3>
                    </div>
                    <div className="control-row">
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => handleRuleTest(rule.id)}
                      >
                        Run test
                      </button>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(event) =>
                            updateRuleDraft(rule.id, { enabled: event.target.checked })
                          }
                        />
                        <span>Enabled</span>
                      </label>
                    </div>
                  </div>
                  <label className="field-label">
                    Trigger
                    <textarea
                      className="rule-input"
                      value={rule.trigger}
                      onChange={(event) => updateRuleDraft(rule.id, { trigger: event.target.value })}
                    />
                  </label>
                  <label className="field-label">
                    Condition
                    <textarea
                      className="rule-input"
                      value={rule.condition}
                      onChange={(event) =>
                        updateRuleDraft(rule.id, { condition: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-label">
                    Actions
                    <textarea
                      className="rule-input"
                      value={rule.actions.join('\n')}
                      onChange={(event) =>
                        updateRuleDraft(rule.id, {
                          actions: event.target.value
                            .split('\n')
                            .map((action) => action.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <ul className="rule-actions">
                    {rule.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                  <p className="rule-footer">
                    {rule.enabled ? 'This rule is active in the simulator.' : 'This rule is staged off.'}
                  </p>
                  {result ? (
                    <p className="rule-footer">
                      Test result: {result.status.toUpperCase()} • {result.detail}
                    </p>
                  ) : (
                    <p className="rule-footer">Test result: not run yet.</p>
                  )}
                </article>
              )
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Connector Lab</p>
              <h2>Automation relay matrix</h2>
            </div>
            <span className="status-pill">Zapier + Make + Meta CAPI</span>
          </div>
          <div className="connector-grid">
            {automationConnectors.map((connector) => {
              const state = connectorStates[connector.name] ?? defaultConnectorStates[connector.name]

              return (
                <article key={connector.name} className="connector-card">
                  <div className="connector-topline">
                    <div>
                      <p className="mini-label">{connector.category}</p>
                      <h3>{connector.name}</h3>
                    </div>
                    <span className={`connector-status connector-${state?.status ?? 'ready'}`}>
                      {state?.status ?? 'ready'}
                    </span>
                  </div>
                  <p>{connector.use}</p>
                  <p className="timeline-meta">
                    Last ping: {state?.lastPing ?? 'just now'} • Runs: {state?.runs ?? 0}
                  </p>
                  <p className="connector-note">{state?.note ?? 'Ready for the next relay.'}</p>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => handleConnectorPing(connector.name)}
                  >
                    Ping connector
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Delivery Outbox</p>
              <h2>Connector run queue</h2>
            </div>
            <span className="status-pill">{filteredDeliveryQueue.length} visible runs</span>
          </div>
          <div className="audit-toolbar">
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
          </div>
          <div className="queue-grid">
            {filteredDeliveryQueue.map((item) => (
              <article key={item.id} className="queue-card">
                <div className="booking-topline">
                  <div>
                    <p className="event-name">{item.payloadLabel}</p>
                    <p className="timeline-meta">
                      {item.connector} • {item.channel} • {item.target}
                    </p>
                  </div>
                  <span className={`connector-status connector-${item.status}`}>
                    {item.status}
                  </span>
                </div>
                <p>{item.note}</p>
                <p className="timeline-meta">Last attempt: {item.lastAttempt}</p>
                <div className="control-row">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => handleDeliveryRetry(item.id)}
                  >
                    Retry delivery
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Webhook Inspector</p>
              <h2>Current payload</h2>
            </div>
            <span className="status-pill">Server-side ready</span>
          </div>
          <div className="payload-controls">
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setWebhookInput(JSON.stringify(activePayload, null, 2))}
            >
              Reset to template
            </button>
            <button
              type="button"
              className="button button-primary button-small"
              onClick={handleWebhookValidate}
            >
              Validate payload
            </button>
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
          <div className="webhook-history">
            <div className="subsection-header">
              <h3>Webhook inbox</h3>
              <span className="mini-label">{webhookHistory.length} events</span>
            </div>
            {webhookHistory.map((item) => (
              <article key={item.id} className="webhook-item">
                <div>
                  <span>{item.label}</span>
                  <small>{item.id}</small>
                </div>
                <div className="control-row">
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
                    className="button button-primary button-small"
                    onClick={() => handleWebhookReplay(item)}
                  >
                    Replay
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Operator Audit</p>
              <h2>Execution history</h2>
            </div>
            <span className="status-pill">{auditEvents.length} records</span>
          </div>
          <div className="audit-toolbar">
            <input
              className="audit-search"
              type="search"
              value={auditQuery}
              onChange={(event) => setAuditQuery(event.target.value)}
              placeholder="Search rules, connectors, webhooks, notes, or scenario IDs"
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
          <div className="audit-list">
            {auditEvents
              .filter((entry) => (auditKindFilter === 'all' ? true : entry.kind === auditKindFilter))
              .filter((entry) => {
                const haystack = `${entry.title} ${entry.detail} ${entry.target} ${entry.timestamp}`.toLowerCase()
                return haystack.includes(auditQuery.toLowerCase())
              })
              .map((entry) => (
                <article key={entry.id} className="audit-card">
                  <div className="booking-topline">
                    <div>
                      <p className="event-name">{entry.title}</p>
                      <p className="timeline-meta">
                        {entry.target} • {entry.timestamp}
                      </p>
                    </div>
                    <span className={`event-status audit-${entry.kind}`}>{entry.kind}</span>
                  </div>
                  <p>{entry.detail}</p>
                </article>
              ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Module 2</p>
              <h2>Routing + No-Show Recovery</h2>
            </div>
            <span className="status-pill">GHL mirror</span>
          </div>
          <div className="booking-stack">
            <article className="booking-card booking-highlight">
              <div className="booking-topline">
                <div>
                  <p className="mini-label">Selected scenario state</p>
                  <h3>{activeLead.name}</h3>
                  <p>{activeBooking?.slot ?? 'No call slot required'}</p>
                </div>
                <span className={`booking-status booking-${runtime.bookingStatuses[stepIndex]}`}>
                  {runtime.bookingStatuses[stepIndex]}
                </span>
              </div>
              <p className="booking-owner">Owner: {activeLead.owner}</p>
              <p>
                {activeBooking?.recoveryAction ??
                  'Payment path skips call handling and moves directly into onboarding automation.'}
              </p>
            </article>

            {bookings.map((booking) => {
              const lead = leads.find((entry) => entry.id === booking.leadId)
              return (
                <article key={booking.id} className="booking-card">
                  <div className="booking-topline">
                    <div>
                      <h3>{lead?.name}</h3>
                      <p>{booking.slot}</p>
                    </div>
                    <span className={`booking-status booking-${booking.status}`}>
                      {booking.status}
                    </span>
                  </div>
                  <p className="booking-owner">Closer: {booking.owner}</p>
                  <p>{booking.recoveryAction}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section id="dashboard" className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Module 3</p>
              <h2>Revenue + Tracking Dashboard</h2>
            </div>
            <span className="status-pill">Stripe + Meta-ready</span>
          </div>

          <div className="dashboard-layout">
            <div className="metric-grid">
              {revenueMetrics.map((metric) => (
                <article key={metric.label} className="metric-card">
                  <p className="metric-label">{metric.label}</p>
                  <p className="metric-value">{metric.value}</p>
                  <p className="metric-delta">{metric.delta}</p>
                </article>
              ))}
            </div>

            <article className="capi-card">
              <div className="subsection-header">
                <h3>CAPI-ready server events</h3>
                <p>Clean naming, match keys, and payload status for a future Meta handoff.</p>
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
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Coverage</p>
              <h2>Stack Fit</h2>
            </div>
            <span className="status-pill">Job-post aligned</span>
          </div>
          <div className="fit-stack">
            {integrationFit.map((item) => (
              <article key={item.name} className="fit-card">
                <h3>{item.name}</h3>
                <p>{item.fit}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Scenario Trail</p>
              <h2>Operator Timeline</h2>
            </div>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setShowExpandedTimeline(!showExpandedTimeline)}
            >
              {showExpandedTimeline ? 'Show scenario only' : 'Show full event trail'}
            </button>
          </div>
          <div className="timeline-stack">
            {(showExpandedTimeline ? eventLog : scenarioEvents).map((entry) => (
              <article key={entry.id} className="timeline-card">
                <div className="booking-topline">
                  <p className="event-name">{entry.event}</p>
                  <span className={`event-status event-${entry.status}`}>{entry.status}</span>
                </div>
                <p>{entry.detail}</p>
                <p className="timeline-meta">
                  {entry.channel} • {entry.timestamp}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Operator Notes</p>
              <h2>Session memory</h2>
            </div>
            <span className="status-pill">Persisted locally</span>
          </div>
          <div className="control-row">
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={handleLogNote}
            >
              Log note
            </button>
          </div>
          <textarea
            className="notes-editor"
            value={operatorNotes}
            onChange={(event) => setOperatorNotes(event.target.value)}
            placeholder="Capture what changed, what to ship next, or how this scenario maps to a client funnel."
          />
          {operatorNotesHistory.length ? (
            <div className="timeline-stack">
              {operatorNotesHistory.map((note) => (
                <article key={note.id} className="timeline-card">
                  <div className="booking-topline">
                    <p className="event-name">{note.note}</p>
                    <span className="event-status event-processed">logged</span>
                  </div>
                  <p className="timeline-meta">
                    {note.scenarioId} • {note.stepLabel} • {note.timestamp}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="stat-note">No operator notes logged yet.</p>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
