export type FunnelStage =
  | 'new'
  | 'engaged'
  | 'checkout-sent'
  | 'booked'
  | 'no-show'
  | 'recovery'
  | 'won'

export type EventStatus = 'sent' | 'processed' | 'warning'

export type Intent = 'pricing' | 'call' | 'checkout' | 'proof' | 'objection'

export type ConsultBookingStatus =
  | 'booked'
  | 'reminded'
  | 'no-show'
  | 'recovered'
  | 'rescheduled'
  | 'lost'

export type ConsultRoutingLane = 'qualification' | 'consult' | 'recovery' | 'checkout' | 'onboarding'

export interface Message {
  id: string
  sender: 'lead' | 'bot'
  text: string
  timestamp: string
}

export interface Lead {
  id: string
  name: string
  handle: string
  source: string
  offer: string
  stage: FunnelStage
  owner: string
  tags: string[]
  budget: string
  nextAction: string
  lastTouch: string
}

export interface Conversation {
  id: string
  leadId: string
  intent: Intent
  score: number
  messages: Message[]
  automationSummary: string
}

export interface AutomationRule {
  id: string
  trigger: string
  condition: string
  actions: string[]
  system: string
}

export interface EventLogItem {
  id: string
  event: string
  leadId: string
  channel: string
  status: EventStatus
  detail: string
  timestamp: string
}

export interface Booking {
  id: string
  leadId: string
  slot: string
  owner: string
  status: ConsultBookingStatus
  recoveryAction: string
  routingLane?: ConsultRoutingLane
  leadStage?: FunnelStage
}

export interface OnboardingRun {
  id: string
  leadId: string
  status: string
  folderUrl: string
  sopUrl: string
  inviteUrl: string
  handoffState?: OnboardingHandoffState
}

export interface OnboardingHandoffDestination {
  name: string
  status: string
  url: string
  note: string
}

export interface OnboardingHandoffState {
  status: string
  folderUrl: string
  sopUrl: string
  inviteUrl: string
  destinations: OnboardingHandoffDestination[]
}

export interface RevenueMetric {
  label: string
  value: string
  delta: string
}

export interface OperatorToolTemplate {
  id: string
  title: string
  summary: string
  outcome: string
  steps: string[]
}

export interface CapiEvent {
  eventName: string
  source: string
  matchKeys: string[]
  payloadStatus: string
}

export interface DemoScenario {
  id: string
  title: string
  outcome: string
  leadId: string
  conversationId?: string
  bookingId?: string
  eventIds: string[]
  hoursSaved: string
  revenueAngle: string
  steps: string[]
}
