import type {
  AutomationRule,
  Booking,
  CapiEvent,
  Conversation,
  DemoScenario,
  EventLogItem,
  Lead,
  RevenueMetric,
} from './types'

export const summaryStats = [
  { label: 'Leads Today', value: '42', note: '+18% vs yesterday' },
  { label: 'Booked Calls', value: '11', note: '4 routed to closers' },
  { label: 'Recovered No-Shows', value: '3', note: '27% recovery rate' },
  { label: 'Stripe Revenue', value: '$4.8k', note: 'Test-mode sprint funnel' },
]

export const leads: Lead[] = [
  {
    id: 'lead-001',
    name: 'Mia Torres',
    handle: '@miamoves',
    source: 'IG DM comment keyword',
    offer: 'Low-ticket challenge',
    stage: 'checkout-sent',
    owner: 'Alex',
    tags: ['dm-sprint', 'warm', 'challenge'],
    budget: '$49 low-ticket',
    nextAction: 'Wait 2h, then send urgency follow-up',
    lastTouch: '2 min ago',
  },
  {
    id: 'lead-002',
    name: 'Evan Ross',
    handle: '@evanbuilds',
    source: 'Story reply',
    offer: 'Consult call',
    stage: 'no-show',
    owner: 'Nina',
    tags: ['consult', 'no-show', 'high-intent'],
    budget: '$2.5k consult',
    nextAction: 'Send recovery voice note + reschedule link',
    lastTouch: '17 min ago',
  },
  {
    id: 'lead-003',
    name: 'Jade Porter',
    handle: '@jadeteaches',
    source: 'Lead form retargeting',
    offer: 'Subscription',
    stage: 'won',
    owner: 'Alex',
    tags: ['subscriber', 'upsell-ready'],
    budget: '$97 monthly',
    nextAction: 'Trigger onboarding autopilot',
    lastTouch: '31 min ago',
  },
]

export const conversations: Conversation[] = [
  {
    id: 'conv-001',
    leadId: 'lead-001',
    intent: 'checkout',
    score: 92,
    automationSummary: 'Tagged as dm-sprint + sent Stripe checkout + queued urgency bump.',
    messages: [
      {
        id: 'm1',
        sender: 'lead',
        text: 'price for the sprint? i want something fast',
        timestamp: '09:14',
      },
      {
        id: 'm2',
        sender: 'bot',
        text: 'The sprint is $49 and starts today. Want the checkout link or a quick breakdown?',
        timestamp: '09:14',
      },
      {
        id: 'm3',
        sender: 'lead',
        text: 'send the link',
        timestamp: '09:15',
      },
      {
        id: 'm4',
        sender: 'bot',
        text: 'Done. I tagged you for the sprint and dropped the Stripe checkout. If you need proof, I can send wins next.',
        timestamp: '09:15',
      },
    ],
  },
  {
    id: 'conv-002',
    leadId: 'lead-002',
    intent: 'call',
    score: 88,
    automationSummary: 'Routed to consult closer + marked no-show + queued recovery branch.',
    messages: [
      {
        id: 'm5',
        sender: 'lead',
        text: 'can i talk to someone first before i join?',
        timestamp: '08:42',
      },
      {
        id: 'm6',
        sender: 'bot',
        text: 'Yes. I can route you to the closer with the best availability. Are you free this afternoon?',
        timestamp: '08:42',
      },
      {
        id: 'm7',
        sender: 'lead',
        text: 'yep book me',
        timestamp: '08:43',
      },
      {
        id: 'm8',
        sender: 'bot',
        text: 'Booked for 2:30 PM. If anything changes I will send the reschedule link here.',
        timestamp: '08:43',
      },
    ],
  },
  {
    id: 'conv-003',
    leadId: 'lead-003',
    intent: 'proof',
    score: 81,
    automationSummary:
      'Payment webhook promoted the lead to subscriber, triggered onboarding autopilot, and logged a CAPI-ready purchase event.',
    messages: [
      {
        id: 'm9',
        sender: 'lead',
        text: 'paid. what happens next?',
        timestamp: '08:05',
      },
      {
        id: 'm10',
        sender: 'bot',
        text: 'You are in. I created your onboarding checklist, folder links, and kickoff instructions. If you want the community link next, I can drop that too.',
        timestamp: '08:06',
      },
    ],
  },
]

export const automationRules: AutomationRule[] = [
  {
    id: 'rule-001',
    trigger: 'Keyword: "price", "link", "join"',
    condition: 'Intent classifier > 0.75 and offer = sprint',
    actions: [
      'Apply tags: dm-sprint, warm',
      'Create Stripe checkout',
      'Queue follow-up at +2h',
    ],
    system: 'ManyChat-style DM engine',
  },
  {
    id: 'rule-002',
    trigger: 'Intent: consult-call',
    condition: 'Budget mentions high-ticket or asks for call',
    actions: [
      'Route to closer',
      'Create booking',
      'Start reminder sequence',
    ],
    system: 'GHL pipeline mirror',
  },
  {
    id: 'rule-003',
    trigger: 'Webhook: call missed',
    condition: 'Booking status = booked and attendance = false',
    actions: [
      'Apply tag: no-show',
      'Move stage to recovery',
      'Send reschedule + proof branch',
    ],
    system: 'Recovery automation',
  },
]

export const bookings: Booking[] = [
  {
    id: 'book-001',
    leadId: 'lead-002',
    slot: 'Today, 2:30 PM',
    owner: 'Nina',
    status: 'no-show',
    recoveryAction: 'Voice note + reschedule link queued for 15 min delay',
  },
  {
    id: 'book-002',
    leadId: 'lead-001',
    slot: 'Tomorrow, 10:00 AM',
    owner: 'Alex',
    status: 'reminded',
    recoveryAction: 'SMS reminder sent; DM reminder scheduled at -30m',
  },
  {
    id: 'book-003',
    leadId: 'lead-003',
    slot: 'Yesterday, 11:00 AM',
    owner: 'Alex',
    status: 'recovered',
    recoveryAction: 'Recovered after no-show with one-click rebook',
  },
]

export const eventLog: EventLogItem[] = [
  {
    id: 'evt-001',
    event: 'dm.inbound_received',
    leadId: 'lead-001',
    channel: 'instagram_dm',
    status: 'processed',
    detail: 'Matched pricing keyword and checkout intent.',
    timestamp: '09:14:02',
  },
  {
    id: 'evt-002',
    event: 'lead.tag_applied',
    leadId: 'lead-001',
    channel: 'automation',
    status: 'processed',
    detail: 'Applied dm-sprint, warm, challenge.',
    timestamp: '09:14:03',
  },
  {
    id: 'evt-003',
    event: 'checkout.link_sent',
    leadId: 'lead-001',
    channel: 'stripe',
    status: 'processed',
    detail: 'Stripe payment link created in test mode.',
    timestamp: '09:15:11',
  },
  {
    id: 'evt-004',
    event: 'call.marked_no_show',
    leadId: 'lead-002',
    channel: 'ghl-mirror',
    status: 'warning',
    detail: 'No attendance recorded after 10-minute grace window.',
    timestamp: '14:42:10',
  },
  {
    id: 'evt-005',
    event: 'recovery.message_queued',
    leadId: 'lead-002',
    channel: 'dm_recovery',
    status: 'processed',
    detail: 'Queued reschedule branch with proof stack.',
    timestamp: '14:42:15',
  },
  {
    id: 'evt-006',
    event: 'payment.completed',
    leadId: 'lead-003',
    channel: 'stripe_webhook',
    status: 'processed',
    detail: 'Subscription payment succeeded; onboarding triggered.',
    timestamp: '08:06:44',
  },
  {
    id: 'evt-007',
    event: 'onboarding.autopilot_started',
    leadId: 'lead-003',
    channel: 'ops_automation',
    status: 'processed',
    detail: 'Provisioned SOP links, folder template, and welcome actions.',
    timestamp: '08:06:48',
  },
  {
    id: 'evt-008',
    event: 'capi.purchase_ready',
    leadId: 'lead-003',
    channel: 'meta_server_events',
    status: 'processed',
    detail: 'Purchase payload normalized for future Meta CAPI relay.',
    timestamp: '08:06:49',
  },
]

export const revenueMetrics: RevenueMetric[] = [
  { label: 'Low-ticket to Subscription', value: '18%', delta: '+4 pts' },
  { label: 'Call Show Rate', value: '71%', delta: '+9 pts' },
  { label: 'No-show Recovery', value: '27%', delta: '+11 pts' },
  { label: 'Revenue Influenced', value: '$12.4k', delta: 'Last 7 days' },
]

export const capiEvents: CapiEvent[] = [
  {
    eventName: 'Lead',
    source: 'Server event mirror from DM capture',
    matchKeys: ['em', 'ph', 'external_id'],
    payloadStatus: 'Ready to post to Meta CAPI',
  },
  {
    eventName: 'Schedule',
    source: 'Booking workflow',
    matchKeys: ['external_id', 'client_ip_address'],
    payloadStatus: 'Waiting on production pixel id',
  },
  {
    eventName: 'Purchase',
    source: 'Stripe webhook',
    matchKeys: ['em', 'ph', 'external_id', 'value'],
    payloadStatus: 'Test payload validated',
  },
]

export const repoModules = [
  {
    name: 'DM Sprint Funnel',
    summary: 'ManyChat-style inbox simulator with tagging, intent routing, and checkout handoff.',
  },
  {
    name: 'No-Show Recovery',
    summary: 'GHL-style call routing, attendance state, and recovery automation branches.',
  },
  {
    name: 'Revenue Dashboard',
    summary: 'Stripe, CAPI-ready events, funnel KPIs, and audit-friendly event history.',
  },
]

export const demoScenarios: DemoScenario[] = [
  {
    id: 'scenario-001',
    title: 'Hot DM to Stripe checkout',
    outcome: 'Turns a pricing DM into a tagged lead, checkout handoff, and revenue-visible event trail.',
    leadId: 'lead-001',
    conversationId: 'conv-001',
    bookingId: 'book-002',
    eventIds: ['evt-001', 'evt-002', 'evt-003'],
    hoursSaved: '2 to 3 hours per day from manual DM replies and tag cleanup.',
    revenueAngle: 'Cuts the time between intent and checkout for low-ticket offers.',
    steps: [
      'Lead asks for price in DM.',
      'Intent rules classify checkout intent and apply dm-sprint tags.',
      'Stripe checkout link is generated and logged.',
      'Purchase event becomes visible to both ops and future Meta CAPI mapping.',
    ],
  },
  {
    id: 'scenario-002',
    title: 'Booked call to no-show recovery',
    outcome: 'Protects high-ticket consult revenue by tagging no-shows and queuing the recovery branch automatically.',
    leadId: 'lead-002',
    conversationId: 'conv-002',
    bookingId: 'book-001',
    eventIds: ['evt-004', 'evt-005'],
    hoursSaved: '1 to 2 hours per closer from manual follow-up and reschedule chasing.',
    revenueAngle: 'Closes revenue leakage on missed consults before the lead goes cold.',
    steps: [
      'Lead requests a consult call and gets routed to the right closer.',
      'Reminder sequence starts before the call.',
      'Missed attendance flips the lead into no-show state.',
      'Recovery message, reschedule link, and proof stack are queued without manual ops work.',
    ],
  },
  {
    id: 'scenario-003',
    title: 'Payment to onboarding autopilot',
    outcome:
      'Turns a successful payment into onboarding actions, clean handoff, and immediate operator visibility.',
    leadId: 'lead-003',
    conversationId: 'conv-003',
    eventIds: ['evt-006', 'evt-007', 'evt-008'],
    hoursSaved: '30 to 45 minutes per new client from repetitive provisioning work.',
    revenueAngle: 'Improves post-purchase experience while keeping ops overhead low.',
    steps: [
      'Stripe webhook marks the lead as won.',
      'Subscription state updates in the dashboard.',
      'Onboarding autopilot provisions the next-step assets and SOP links.',
      'Purchase event is normalized for reporting and future Meta server events.',
    ],
  },
]

export const integrationFit = [
  { name: 'Claude Code', fit: 'Used to scaffold and iterate on the operator console quickly.' },
  { name: 'Zapier / Make', fit: 'Represented as automation layers behind tags, routing, and webhook actions.' },
  { name: 'GHL', fit: 'Mirrored through booking state, owner routing, and no-show recovery.' },
  { name: 'Stripe', fit: 'Represented through checkout handoff, webhook outcomes, and revenue updates.' },
  { name: 'Meta CAPI', fit: 'Modeled with server-event naming, match keys, and payload readiness.' },
  { name: 'Client onboarding', fit: 'Covered through the payment-to-onboarding autopilot scenario.' },
]
