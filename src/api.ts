import type { FunnelStage } from './types'

export type IntegrationInboxStatus = 'queued' | 'processing' | 'delivered' | 'failed' | 'processed' | 'warning'

export type IntegrationEvent = {
  id: string
  kind: string
  source: string
  target: string
  summary: string
  status: IntegrationInboxStatus
  timestamp: string
  leadId?: string
  effect?: string
}

export type ApiSnapshot = {
  leadRecords: unknown[]
  bookingRecords: unknown[]
  conversations: unknown[]
  webhookHistory: unknown[]
  connectorStates: Record<string, unknown>
  deliveryQueue: unknown[]
  operatorNotesHistory: unknown[]
  auditEvents: unknown[]
  liveTestRuns: unknown[]
  ruleTestResults: Record<string, unknown>
  onboardingRuns: unknown[]
  integrationEvents?: IntegrationEvent[]
  dashboard?: Record<string, unknown>
}

export type QueueRecord = {
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

export type SyncStatusResponse = {
  configured: boolean
  realtime: {
    pollMs: number
    connected: boolean
    lastEventAt: string | null
    eventCount: number
  }
  remote: {
    found?: boolean
    source?: string | null
    digest?: string | null
    updatedAt?: string | null
    error?: string
  }
  supabase: Record<string, number> | { error: string }
}

export type SyncDiffResponse = {
  ok: boolean
  diff?: {
    leads: {
      localOnly: string[]
      remoteOnly: string[]
      shared: number
    }
    bookings: {
      localOnly: string[]
      remoteOnly: string[]
      shared: number
    }
    conversations: {
      localOnly: string[]
      remoteOnly: string[]
      shared: number
    }
    deliveries: {
      localOnly: string[]
      remoteOnly: string[]
      shared: number
    }
    attempts: {
      localOnly: string[]
      remoteOnly: string[]
      shared: number
    }
    audit: {
      localOnly: string[]
      remoteOnly: string[]
      shared: number
    }
    notes: {
      localOnly: string[]
      remoteOnly: string[]
      shared: number
    }
    tests: {
      localOnly: string[]
      remoteOnly: string[]
      shared: number
    }
  }
  message?: string
}

export type LeadTimelineEvent = {
  id: string
  type: string
  timestamp: string
  title: string
  detail: string
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request(path: string, init?: RequestInit) {
  const { headers, ...rest } = init ?? {}
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    ...rest,
  })

  const data = response.status === 204 ? null : await response.json()

  if (!response.ok) {
    throw new ApiError(data?.message || 'Request failed.', response.status, data?.code)
  }

  return data
}

export async function loginAdmin(username: string, password: string) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }) as Promise<{
    ok: boolean
    token: string
    user: string
    session: {
      sub: string
    }
    expiresInSeconds: number
  }>
}

export async function fetchAdminSession() {
  return request('/api/auth/session') as Promise<{
    ok: boolean
    user: string
    session: {
      sub: string
      bypass?: boolean
      exp: number
    }
  }>
}

export async function logoutAdmin() {
  return request('/api/auth/logout', {
    method: 'POST',
  }) as Promise<{ ok: boolean }>
}

export async function fetchBootstrap() {
  return request('/api/bootstrap')
}

export async function fetchQueue(filters: {
  q?: string
  stage?: string
  owner?: string
  lane?: string
  limit?: number
} = {}): Promise<QueueRecord[]> {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }

  return request(`/api/queue${params.size ? `?${params.toString()}` : ''}`)
}

export async function fetchLeadTimeline(leadId: string) {
  return request(`/api/leads/${leadId}/timeline`) as Promise<{
    ok: boolean
    lead?: unknown
    booking?: unknown
    conversation?: unknown
    events?: LeadTimelineEvent[]
  }>
}

export async function fetchReportsOverview() {
  return request('/api/reports/overview') as Promise<{
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
  }>
}

export async function fetchSyncStatus() {
  return request('/api/sync/status') as Promise<SyncStatusResponse>
}

export async function fetchSyncConflicts() {
  return request('/api/sync/conflicts') as Promise<{
    ok: boolean
    local: {
      counts: Record<string, number>
      digestHint: string
    }
    remote: {
      source?: string | null
      digest?: string | null
      updatedAt?: string | null
      counts?: Record<string, number> | null
      error?: string
    }
    conflicts: Array<{
      field: string
      local: number
      remote: number
    }>
    hasConflicts: boolean
  }>
}

export async function fetchSyncDiff() {
  return request('/api/sync/diff') as Promise<SyncDiffResponse>
}

export async function pushSync() {
  return request('/api/sync/push', {
    method: 'POST',
  }) as Promise<{
    ok: boolean
    message?: string
    supabase?: unknown
  }>
}

export async function pullSync() {
  return request('/api/sync/pull', {
    method: 'POST',
  }) as Promise<{
    ok: boolean
    message?: string
    snapshot?: unknown
  }>
}

export async function reconcileSync(strategy: 'merge-prefer-local' | 'merge-prefer-remote' | 'replace-local') {
  return request('/api/sync/reconcile', {
    method: 'POST',
    body: JSON.stringify({ strategy }),
  }) as Promise<{
    ok: boolean
    message?: string
    sync?: unknown
    snapshot?: unknown
  }>
}

export async function validateWebhook(payload: string) {
  return request('/api/webhooks/validate', {
    method: 'POST',
    body: JSON.stringify({ payload }),
  })
}

export async function runLeadAction(leadId: string, action: string) {
  return request(`/api/leads/${leadId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export async function retryDelivery(deliveryId: string) {
  return request(`/api/deliveries/${deliveryId}/retry`, {
    method: 'POST',
  })
}

export async function pingConnector(name: string) {
  return request(`/api/connectors/${encodeURIComponent(name)}/ping`, {
    method: 'POST',
  })
}

export async function logNote(note: string, scenarioId: string, stepLabel: string) {
  return request('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ note, scenarioId, stepLabel }),
  })
}

export async function runLiveTest(input: {
  scenarioId: string
  scenarioTitle: string
  stepLabel: string
  payload: string
}) {
  return request('/api/tests/run', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function runDmIntake(input: {
  handle: string
  name?: string
  source?: string
  offer?: string
  budget?: string
  message: string
}) {
  return request('/api/workflows/dm-intake', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function runStripePayment(input: {
  handle: string
  amount?: number
  offer?: string
}) {
  return request('/api/workflows/stripe-payment', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function runBookingUpdate(input: {
  handle: string
  status: string
  slot?: string
}) {
  return request('/api/workflows/booking-update', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function runOnboardingProvision(input: { handle: string }) {
  return request('/api/workflows/onboarding/provision', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchSlackExportPreview() {
  return request('/api/exports/slack') as Promise<{
    channel: string
    text: string
    blocks: unknown[]
  }>
}

export async function fetchSheetsExportPreview() {
  return request('/api/exports/sheets') as Promise<{
    sheet: string
    headers: string[]
    metrics: Array<[string, number | string]>
    queueRows: Array<Record<string, unknown>>
  }>
}

export async function sendSlackExport() {
  return request('/api/exports/slack/send', {
    method: 'POST',
  }) as Promise<{
    ok: boolean
    status: number
  }>
}

export async function sendSheetsExport() {
  return request('/api/exports/sheets/send', {
    method: 'POST',
  }) as Promise<{
    ok: boolean
    status: number
  }>
}

export async function resetRuntimeState() {
  return request('/api/reset', {
    method: 'POST',
  }) as Promise<ApiSnapshot>
}
