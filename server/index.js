import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import {
  appendMessage,
  createLead,
  instantiateScenario,
  loadState,
  logNote,
  pingConnector,
  processBookingWebhook,
  processDmIntake,
  processStripePayment,
  provisionOnboarding,
  readLeadTimeline,
  readQueue,
  readReports,
  readScenarioTemplates,
  readState,
  readDeliveryHistory,
  resetState,
  retryDelivery,
  runLeadAction,
  runLiveTest,
  updateConversation,
  updateLead,
  upsertBooking,
  validateWebhook,
} from './store.js'
import {
  fetchRemoteMirrorRows,
  fetchRemoteMirrorCounts,
  fetchRemoteSnapshot,
  isRemoteSyncConfigured,
  pushRemoteMirror,
  pushRemoteSnapshot,
} from './supabaseSync.js'
import {
  assertAdminAuthConfiguration,
  authenticateAdmin,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  createLocalBypassSession,
  createAdminSessionToken,
  isLocalAdminBypassEnabled,
  LOCAL_BYPASS_ENV,
  readAdminSessionToken,
  readTrustedAccessSession,
  verifyAdminSessionToken,
} from './authSession.js'
import {
  attachRealtimeStream,
  getRealtimeStats,
  publishRealtime,
} from './realtimeBus.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const remotePollMs = Number(process.env.REMOTE_SYNC_POLL_MS || 5000)
const serverDir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(serverDir, '..', 'dist')
const indexHtmlPath = path.join(distDir, 'index.html')
let lastRemoteDigest = null
const BOOKING_UPDATE_STATUSES = new Set([
  'booked',
  'scheduled',
  'confirmed',
  'reminded',
  'reminder',
  'reminder_sent',
  'no-show',
  'no_show',
  'noshow',
  'missed',
  'recovered',
  'recovery',
  'rescheduled',
  'rebooked',
  'rebook',
  'lost',
  'cancelled',
  'canceled',
])

app.use(cors())
app.use(express.json())

function requireAdmin(request, response, next) {
  const configuredToken = process.env.ADMIN_API_TOKEN?.trim()
  const headerToken = request.header('x-admin-token')?.trim()
  const sessionToken = readAdminSessionToken(request)
  const accessSession = readTrustedAccessSession(request)

  if (sessionToken) {
    const verified = verifyAdminSessionToken(sessionToken)
    if (verified.ok) {
      request.adminSession = verified.session
      return next()
    }
  }

  if (accessSession) {
    request.adminSession = accessSession
    return next()
  }

  if (configuredToken && headerToken === configuredToken) {
    request.adminSession = { sub: 'api-token', apiToken: true }
    return next()
  }

  if (isLocalAdminBypassEnabled()) {
    request.adminSession = createLocalBypassSession()
    return next()
  }

  return response.status(401).json({
    ok: false,
    code: 'auth_required',
    message: `Admin session required. Log in or set ${LOCAL_BYPASS_ENV}=true for explicit local-only bypass.`,
  })
}

async function maybeSyncSnapshot(snapshot, source = 'sqlite-local') {
  if (!snapshot || !isRemoteSyncConfigured()) {
    return null
  }
  const sync = await pushRemoteSnapshot(snapshot, source)
  if (sync?.ok) {
    const mirror = await pushRemoteMirror(snapshot)
    lastRemoteDigest = sync.row?.digest ?? lastRemoteDigest
    publishRealtime('sync.pushed', {
      source,
      digest: sync.row?.digest ?? null,
      updatedAt: sync.row?.updated_at ?? null,
    })
    if (mirror?.ok) {
      publishRealtime('sync.mirror_updated', {
        tables: mirror.tables,
      })
    }
    return {
      ...sync,
      mirror,
    }
  }
  return sync
}

async function respondWithMutation(response, result, failureStatus = 400, source = 'sqlite-local') {
  if (!result.ok) {
    return response.status(failureStatus).json(result)
  }

  const sync = await maybeSyncSnapshot(result.snapshot, source)
  publishRealtime('state.changed', {
    source,
    leadCount: result.snapshot?.leadRecords?.length ?? 0,
    deliveryCount: result.snapshot?.deliveryQueue?.length ?? 0,
    liveTestRuns: result.snapshot?.liveTestRuns?.length ?? 0,
  })
  return response.json(sync ? { ...result, sync } : result)
}

function parseBookingUpdateRequest(body = {}) {
  const handle = typeof body.handle === 'string' ? body.handle.trim() : ''
  const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : ''
  const status = typeof body.status === 'string' ? body.status.trim() : ''
  const owner = typeof body.owner === 'string' ? body.owner.trim() : ''
  const slot = typeof body.slot === 'string' && body.slot.trim() ? body.slot.trim() : undefined
  const recoveryAction =
    typeof body.recoveryAction === 'string' && body.recoveryAction.trim()
      ? body.recoveryAction.trim()
      : undefined
  const nextAction =
    typeof body.nextAction === 'string' && body.nextAction.trim() ? body.nextAction.trim() : undefined

  if (!status) {
    return { ok: false, message: 'Booking status is required.' }
  }

  if (!handle && !leadId) {
    return { ok: false, message: 'Either handle or leadId is required.' }
  }

  if (!BOOKING_UPDATE_STATUSES.has(status.toLowerCase().replace(/\s+/g, '_'))) {
    return {
      ok: false,
      message: 'Booking status must be booked, reminded, no-show, recovered, rescheduled, or lost.',
    }
  }

  return {
    ok: true,
    payload: {
      ...(handle ? { handle } : {}),
      ...(leadId ? { leadId } : {}),
      ...(owner ? { owner } : {}),
      ...(slot ? { slot } : {}),
      ...(recoveryAction ? { recoveryAction } : {}),
      ...(nextAction ? { nextAction } : {}),
      status,
    },
  }
}

async function startRemoteWatcher() {
  if (!isRemoteSyncConfigured()) {
    return
  }

  const remote = await fetchRemoteSnapshot()
  if (remote.ok) {
    lastRemoteDigest = remote.row?.digest ?? null
  }

  setInterval(async () => {
    try {
      const next = await fetchRemoteSnapshot()
      if (!next.ok) {
        publishRealtime('sync.error', { message: next.message })
        return
      }

      const nextDigest = next.row?.digest ?? null
      if (nextDigest && nextDigest !== lastRemoteDigest) {
        lastRemoteDigest = nextDigest
        publishRealtime('sync.remote_changed', {
          digest: nextDigest,
          source: next.row?.source ?? null,
          updatedAt: next.row?.updated_at ?? null,
        })
      }
    } catch (error) {
      publishRealtime('sync.error', {
        message: error instanceof Error ? error.message : 'Unknown sync poll error.',
      })
    }
  }, remotePollMs)
}

function matchesQuery(value, query) {
  return String(value || '')
    .toLowerCase()
    .includes(query.toLowerCase())
}

function normalizeQuery(input) {
  return typeof input === 'string' ? input.trim() : ''
}

function getSupabaseAuthConfig() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  return {
    url: url ? url.replace(/\/$/, '') : '',
    key: key || '',
    enabled: Boolean(url && key),
  }
}

function getRequestOrigin(request) {
  const requestedOrigin = request.query?.origin
  if (typeof requestedOrigin === 'string' && requestedOrigin.trim()) {
    try {
      return new URL(requestedOrigin.trim()).origin
    } catch {
      // ignore invalid explicit origin
    }
  }

  const explicitOrigin = request.header('origin')?.trim()
  if (explicitOrigin) {
    return explicitOrigin.replace(/\/$/, '')
  }

  const referer = request.header('referer')?.trim()
  if (referer) {
    try {
      const refererUrl = new URL(referer)
      return refererUrl.origin
    } catch {
      // fall through
    }
  }

  const forwardedProto = request.header('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedHost = request.header('x-forwarded-host')?.split(',')[0]?.trim()
  const protocol = forwardedProto || request.protocol || 'http'
  const host = forwardedHost || request.header('host')
  return `${protocol}://${host}`
}

function buildOauthAuthorizeUrl(request, provider) {
  const { url, enabled } = getSupabaseAuthConfig()
  if (!enabled) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, message: 'Supabase auth is not configured.' },
    }
  }

  const redirectTo = `${getRequestOrigin(request)}/auth/callback`
  const authorizeUrl = new URL(`${url}/auth/v1/authorize`)
  authorizeUrl.searchParams.set('provider', provider)
  authorizeUrl.searchParams.set('redirect_to', redirectTo)

  return {
    ok: true,
    authorizeUrl: authorizeUrl.toString(),
    redirectTo,
  }
}

async function fetchSupabaseUser(accessToken) {
  const { url, key, enabled } = getSupabaseAuthConfig()

  if (!enabled) {
    return { ok: false, message: 'Supabase auth is not configured.' }
  }

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  })

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: `Supabase user lookup failed with ${response.status}.`,
      detail: await response.text(),
    }
  }

  const user = await response.json()
  return { ok: true, user }
}

function keyById(items = []) {
  return new Map(items.map((item) => [item.id, item]))
}

function mergeById(localItems = [], remoteItems = [], prefer = 'local') {
  const merged = new Map()

  for (const item of prefer === 'remote' ? localItems : remoteItems) {
    merged.set(item.id, item)
  }
  for (const item of prefer === 'remote' ? remoteItems : localItems) {
    merged.set(item.id, item)
  }

  return Array.from(merged.values())
}

function mergeSnapshots(localState, remoteState, strategy = 'merge-prefer-local') {
  if (strategy === 'local-wins') {
    return localState
  }
  if (strategy === 'remote-wins') {
    return remoteState
  }

  return {
    ...remoteState,
    leadRecords: mergeById(localState.leadRecords, remoteState.leadRecords, 'local'),
    bookingRecords: mergeById(localState.bookingRecords, remoteState.bookingRecords, 'local'),
    conversations: mergeById(localState.conversations, remoteState.conversations, 'local'),
    webhookHistory: mergeById(localState.webhookHistory, remoteState.webhookHistory, 'local'),
    deliveryQueue: mergeById(localState.deliveryQueue, remoteState.deliveryQueue, 'local'),
    deliveryAttempts: mergeById(localState.deliveryAttempts, remoteState.deliveryAttempts, 'local'),
    operatorNotesHistory: mergeById(localState.operatorNotesHistory, remoteState.operatorNotesHistory, 'local'),
    auditEvents: mergeById(localState.auditEvents, remoteState.auditEvents, 'local'),
    liveTestRuns: mergeById(localState.liveTestRuns, remoteState.liveTestRuns, 'local'),
    ruleTestResults: {
      ...(remoteState.ruleTestResults ?? {}),
      ...(localState.ruleTestResults ?? {}),
    },
    connectorStates: {
      ...(remoteState.connectorStates ?? {}),
      ...(localState.connectorStates ?? {}),
    },
  }
}

function buildIdDiff(localItems = [], remoteItems = []) {
  const localIds = new Set(localItems.map((item) => item.id))
  const remoteIds = new Set(remoteItems.map((item) => item.id))

  return {
    localOnly: Array.from(localIds).filter((id) => !remoteIds.has(id)),
    remoteOnly: Array.from(remoteIds).filter((id) => !localIds.has(id)),
    shared: Array.from(localIds).filter((id) => remoteIds.has(id)).length,
  }
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.post('/api/auth/login', (request, response) => {
  const username = String(request.body?.username || '').trim()
  const password = String(request.body?.password || '').trim()

  if (!authenticateAdmin(username, password)) {
    return response.status(401).json({ ok: false, code: 'invalid_credentials', message: 'Invalid credentials.' })
  }

  const token = createAdminSessionToken(username)
  response.setHeader('Set-Cookie', createAdminSessionCookie(token))
  return response.json({
    ok: true,
    token,
    user: username,
    session: {
      sub: username,
    },
    expiresInSeconds: Number(process.env.ADMIN_SESSION_TTL_SECONDS || 60 * 60 * 8),
  })
})

app.get('/api/auth/oauth/:provider', (request, response) => {
  const provider = String(request.params.provider || '').trim().toLowerCase()
  if (!['google', 'github'].includes(provider)) {
    return response.status(400).json({ ok: false, message: 'Unsupported OAuth provider.' })
  }

  const result = buildOauthAuthorizeUrl(request, provider)
  if (!result.ok) {
    return response.status(result.status).json(result.body)
  }

  return response.redirect(result.authorizeUrl)
})

app.get('/api/auth/oauth/:provider/url', (request, response) => {
  const provider = String(request.params.provider || '').trim().toLowerCase()
  if (!['google', 'github'].includes(provider)) {
    return response.status(400).json({ ok: false, message: 'Unsupported OAuth provider.' })
  }

  const result = buildOauthAuthorizeUrl(request, provider)
  if (!result.ok) {
    return response.status(result.status).json(result.body)
  }

  return response.json({
    ok: true,
    provider,
    authorizeUrl: result.authorizeUrl,
    redirectTo: result.redirectTo,
  })
})

app.post('/api/auth/oauth/session', async (request, response) => {
  const accessToken = String(request.body?.accessToken || '').trim()
  if (!accessToken) {
    return response.status(400).json({ ok: false, message: 'Missing OAuth access token.' })
  }

  const result = await fetchSupabaseUser(accessToken)
  if (!result.ok) {
    return response.status(401).json({
      ok: false,
      code: 'oauth_invalid',
      message: result.message,
    })
  }

  const username =
    String(result.user?.email || '').trim() ||
    String(result.user?.user_metadata?.email || '').trim() ||
    String(result.user?.user_metadata?.user_name || '').trim() ||
    String(result.user?.id || '').trim()

  if (!username) {
    return response.status(400).json({ ok: false, message: 'OAuth user identity is missing.' })
  }

  const token = createAdminSessionToken(username)
  response.setHeader('Set-Cookie', createAdminSessionCookie(token))
  return response.json({
    ok: true,
    user: username,
    session: {
      sub: username,
      provider: String(result.user?.app_metadata?.provider || '').trim() || 'oauth',
      exp: verifyAdminSessionToken(token).session?.exp,
    },
  })
})

app.get('/api/auth/session', (request, response) => {
  const sessionToken = readAdminSessionToken(request)
  const accessSession = readTrustedAccessSession(request)
  if (accessSession) {
    return response.json({ ok: true, session: accessSession, user: accessSession.sub })
  }
  if (!sessionToken && isLocalAdminBypassEnabled()) {
    const session = createLocalBypassSession()
    return response.json({ ok: true, session, user: session.sub })
  }
  const result = verifyAdminSessionToken(sessionToken)
  return result.ok
    ? response.json({ ...result, user: result.session?.sub ?? null })
    : response.status(401).json({ ...result, code: 'auth_required' })
})

app.post('/api/auth/logout', (_request, response) => {
  response.setHeader('Set-Cookie', clearAdminSessionCookie())
  return response.json({ ok: true })
})

app.get('/api/realtime/stream', requireAdmin, (request, response) => {
  attachRealtimeStream(request, response)
})

app.get('/api/sync/status', async (_request, response) => {
  const remote = await fetchRemoteSnapshot()
  const mirror = await fetchRemoteMirrorCounts()
  const snapshotCounts = remote.ok && remote.row?.state
    ? {
        cobe_leads: remote.row.state.leadRecords?.length ?? 0,
        cobe_bookings: remote.row.state.bookingRecords?.length ?? 0,
        cobe_conversations: remote.row.state.conversations?.length ?? 0,
        cobe_messages:
          (remote.row.state.conversations ?? []).reduce(
            (count, entry) => count + (entry.messages?.length ?? 0),
            0,
          ),
        cobe_delivery_queue: remote.row.state.deliveryQueue?.length ?? 0,
        cobe_delivery_attempts: remote.row.state.deliveryAttempts?.length ?? 0,
        cobe_audit_events: remote.row.state.auditEvents?.length ?? 0,
      }
    : null
  response.json({
    configured: isRemoteSyncConfigured(),
    realtime: {
      pollMs: remotePollMs,
      ...getRealtimeStats(),
    },
    remote: remote.ok
      ? {
          found: Boolean(remote.row),
          source: remote.row?.source ?? null,
          digest: remote.row?.digest ?? null,
          updatedAt: remote.row?.updated_at ?? null,
        }
      : { error: remote.message },
    mirror: mirror.ok
      ? Object.fromEntries(
          Object.entries(mirror.counts).map(([table, count]) => [
            table,
            count || snapshotCounts?.[table] || 0,
          ]),
        )
      : { error: mirror.message },
  })
})

app.get('/api/sync/remote', async (_request, response) => {
  const remote = await fetchRemoteSnapshot()
  return remote.ok ? response.json(remote) : response.status(400).json(remote)
})

app.get('/api/sync/conflicts', async (_request, response) => {
  const local = await readState()
  const remote = await fetchRemoteSnapshot()
  const localDigest = JSON.stringify({
    leads: local.leadRecords.length,
    conversations: local.conversations.length,
    deliveries: local.deliveryQueue.length,
    audit: local.auditEvents.length,
  })

  const remoteCounts = remote.ok && remote.row?.state
    ? {
        leads: remote.row.state.leadRecords?.length ?? 0,
        conversations: remote.row.state.conversations?.length ?? 0,
        deliveries: remote.row.state.deliveryQueue?.length ?? 0,
        audit: remote.row.state.auditEvents?.length ?? 0,
      }
    : null

  const localCounts = {
    leads: local.leadRecords.length,
    conversations: local.conversations.length,
    deliveries: local.deliveryQueue.length,
    audit: local.auditEvents.length,
  }

  const fields = ['leads', 'conversations', 'deliveries', 'audit']
  const conflicts = remoteCounts
    ? fields
        .filter((field) => localCounts[field] !== remoteCounts[field])
        .map((field) => ({
          field,
          local: localCounts[field],
          remote: remoteCounts[field],
        }))
    : []

  response.json({
    ok: true,
    local: {
      counts: localCounts,
      digestHint: localDigest,
    },
    remote: remote.ok
      ? {
          source: remote.row?.source ?? null,
          digest: remote.row?.digest ?? null,
          updatedAt: remote.row?.updated_at ?? null,
          counts: remoteCounts,
        }
      : { error: remote.message },
    conflicts,
    hasConflicts: conflicts.length > 0,
  })
})

app.get('/api/sync/diff', async (_request, response) => {
  const local = await readState()
  const remote = await fetchRemoteSnapshot()

  if (!remote.ok || !remote.row?.state) {
    return response.status(400).json({
      ok: false,
      message: remote.message || 'No remote snapshot available.',
    })
  }

  const remoteState = remote.row.state

  response.json({
    ok: true,
    diff: {
      leads: buildIdDiff(local.leadRecords, remoteState.leadRecords),
      bookings: buildIdDiff(local.bookingRecords, remoteState.bookingRecords),
      conversations: buildIdDiff(local.conversations, remoteState.conversations),
      deliveries: buildIdDiff(local.deliveryQueue, remoteState.deliveryQueue),
      attempts: buildIdDiff(local.deliveryAttempts, remoteState.deliveryAttempts),
      audit: buildIdDiff(local.auditEvents, remoteState.auditEvents),
      notes: buildIdDiff(local.operatorNotesHistory, remoteState.operatorNotesHistory),
      tests: buildIdDiff(local.liveTestRuns, remoteState.liveTestRuns),
    },
  })
})

app.get('/api/queue', async (request, response) => {
  const queue = await readQueue(request.query ?? {})
  response.json(queue)
})

app.get('/api/reports/overview', async (_request, response) => {
  const reports = await readReports()
  response.json(reports)
})

app.get('/api/exports/slack', async (_request, response) => {
  const reports = await readReports()
  const queue = await readQueue({ limit: 5 })
  response.json({
    channel: '#ops-alerts',
    text: 'Creator funnel ops summary',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Revenue:* $${reports.dashboard.stripeRevenue}\n*Recovery queue:* ${reports.queueSummary.recovery}\n*Hot leads:* ${reports.queueSummary.hot + reports.queueSummary.critical}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: queue
            .map((entry) => `• ${entry.name} ${entry.handle} | ${entry.priorityBand} | ${entry.recommendedAction}`)
            .join('\n'),
        },
      },
    ],
  })
})

app.post('/api/exports/slack/send', requireAdmin, async (_request, response) => {
  const webhook = process.env.SLACK_WEBHOOK_URL?.trim()
  const payloadResponse = await fetch(`http://127.0.0.1:${port}/api/exports/slack`)
  const payload = await payloadResponse.json()

  if (!webhook) {
    return response.json({
      ok: true,
      status: 202,
      mode: 'local_preview',
      message: 'Slack webhook not configured. Returned the payload as a working local preview.',
      payload,
    })
  }

  const upstream = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return response.json({
    ok: upstream.ok,
    status: upstream.status,
  })
})

app.get('/api/exports/sheets', async (_request, response) => {
  const reports = await readReports()
  const queue = await readQueue()
  response.json({
    sheet: 'daily_ops_snapshot',
    headers: ['metric', 'value'],
    metrics: [
      ['leads_today', reports.dashboard.leadsToday],
      ['booked_calls', reports.dashboard.bookedCalls],
      ['recovered_no_shows', reports.dashboard.recoveredNoShows],
      ['stripe_revenue', reports.dashboard.stripeRevenue],
      ['queue_total', reports.queueSummary.total],
      ['queue_critical', reports.queueSummary.critical],
      ['queue_hot', reports.queueSummary.hot],
    ],
    queueRows: queue.map((entry) => ({
      lead_id: entry.id,
      name: entry.name,
      handle: entry.handle,
      owner: entry.owner,
      stage: entry.stage,
      lane: entry.lane,
      priority_band: entry.priorityBand,
      priority_score: entry.priorityScore,
      recommended_action: entry.recommendedAction,
    })),
  })
})

app.post('/api/exports/sheets/send', requireAdmin, async (_request, response) => {
  const webhook = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim()
  const reports = await readReports()
  const queue = await readQueue()
  const payload = {
    sheet: 'daily_ops_snapshot',
    metrics: {
      leadsToday: reports.dashboard.leadsToday,
      bookedCalls: reports.dashboard.bookedCalls,
      recoveredNoShows: reports.dashboard.recoveredNoShows,
      stripeRevenue: reports.dashboard.stripeRevenue,
      queueTotal: reports.queueSummary.total,
      queueCritical: reports.queueSummary.critical,
      queueHot: reports.queueSummary.hot,
    },
    queueRows: queue.map((entry) => ({
      leadId: entry.id,
      name: entry.name,
      handle: entry.handle,
      owner: entry.owner,
      lane: entry.lane,
      priorityBand: entry.priorityBand,
      priorityScore: entry.priorityScore,
      recommendedAction: entry.recommendedAction,
    })),
    sentAt: new Date().toISOString(),
  }

  if (!webhook) {
    return response.json({
      ok: true,
      status: 202,
      mode: 'local_preview',
      message: 'Sheets webhook not configured. Returned the payload as a working local preview.',
      payload,
    })
  }

  const upstream = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return response.json({
    ok: upstream.ok,
    status: upstream.status,
  })
})

app.get('/api/remote/leads', async (_request, response) => {
  const result = await fetchRemoteMirrorRows('cobe_leads', 'id,name,handle,stage,owner,source,offer')
  return result.ok ? response.json(result) : response.status(400).json(result)
})

app.get('/api/remote/deliveries', async (_request, response) => {
  const result = await fetchRemoteMirrorRows('cobe_delivery_queue', 'id,connector,target,status,payload_label')
  return result.ok ? response.json(result) : response.status(400).json(result)
})

app.get('/api/scenarios', async (_request, response) => {
  response.json(await readScenarioTemplates())
})

app.get('/api/state', async (_request, response) => {
  const state = await readState()
  response.json(state)
})

app.post('/api/workflows/dm-intake', requireAdmin, async (request, response) => {
  const result = await processDmIntake(request.body ?? {})
  return respondWithMutation(response, result)
})

app.post('/api/workflows/stripe-payment', requireAdmin, async (request, response) => {
  const result = await processStripePayment(request.body ?? {})
  return respondWithMutation(response, result)
})

app.post('/api/workflows/booking-update', requireAdmin, async (request, response) => {
  const parsed = parseBookingUpdateRequest(request.body ?? {})
  if (!parsed.ok) {
    return response.status(400).json(parsed)
  }
  const result = await processBookingWebhook(parsed.payload)
  return respondWithMutation(response, result)
})

app.post('/api/workflows/onboarding/provision', requireAdmin, async (request, response) => {
  const result = await provisionOnboarding(request.body ?? {})
  return respondWithMutation(response, result)
})

app.get('/api/leads', async (request, response) => {
  const state = await readState()
  const stage = normalizeQuery(request.query.stage)
  const owner = normalizeQuery(request.query.owner)
  const query = normalizeQuery(request.query.q)

  const leads = state.leadRecords.filter((entry) => {
    if (stage && entry.stage !== stage) {
      return false
    }
    if (owner && !matchesQuery(entry.owner, owner)) {
      return false
    }
    if (
      query &&
      ![
        entry.name,
        entry.handle,
        entry.source,
        entry.offer,
        entry.owner,
        ...(entry.tags ?? []),
      ].some((value) => matchesQuery(value, query))
    ) {
      return false
    }
    return true
  })

  response.json(leads)
})

app.get('/api/leads/:leadId', async (request, response) => {
  const state = await readState()
  const lead = state.leadRecords.find((entry) => entry.id === request.params.leadId)
  if (!lead) {
    return response.status(404).json({ message: 'Lead not found.' })
  }
  const booking = state.bookingRecords.find((entry) => entry.leadId === request.params.leadId) ?? null
  const conversation =
    (state.conversations ?? []).find((entry) => entry.leadId === request.params.leadId) ?? null
  return response.json({ lead, booking, conversation })
})

app.get('/api/leads/:leadId/timeline', async (request, response) => {
  const result = await readLeadTimeline(request.params.leadId)
  return result.ok ? response.json(result) : response.status(404).json(result)
})

app.get('/api/bookings', async (request, response) => {
  const state = await readState()
  const status = normalizeQuery(request.query.status)
  const owner = normalizeQuery(request.query.owner)

  const bookings = state.bookingRecords.filter((entry) => {
    if (status && entry.status !== status) {
      return false
    }
    if (owner && !matchesQuery(entry.owner, owner)) {
      return false
    }
    return true
  })

  response.json(bookings)
})

app.get('/api/conversations', async (request, response) => {
  const state = await readState()
  const leadId = normalizeQuery(request.query.leadId)
  const intent = normalizeQuery(request.query.intent)
  const query = normalizeQuery(request.query.q)

  const conversations = (state.conversations ?? []).filter((entry) => {
    if (leadId && entry.leadId !== leadId) {
      return false
    }
    if (intent && entry.intent !== intent) {
      return false
    }
    if (
      query &&
      ![entry.intent, entry.automationSummary, ...(entry.messages ?? []).map((message) => message.text)].some(
        (value) => matchesQuery(value, query),
      )
    ) {
      return false
    }
    return true
  })

  response.json(conversations)
})

app.get('/api/conversations/:conversationId', async (request, response) => {
  const state = await readState()
  const conversation = (state.conversations ?? []).find(
    (entry) => entry.id === request.params.conversationId,
  )
  if (!conversation) {
    return response.status(404).json({ message: 'Conversation not found.' })
  }
  return response.json(conversation)
})

app.patch('/api/conversations/:conversationId', requireAdmin, async (request, response) => {
  const result = await updateConversation(request.params.conversationId, request.body ?? {})
  return respondWithMutation(response, result)
})

app.get('/api/bootstrap', async (_request, response) => {
  const state = await readState()
  response.json(state)
})

app.get('/api/dashboard', async (_request, response) => {
  const state = await readState()
  response.json(state.dashboard)
})

app.get('/api/deliveries', async (request, response) => {
  const state = await readState()
  const status = normalizeQuery(request.query.status)
  const connector = normalizeQuery(request.query.connector)
  const target = normalizeQuery(request.query.target)

  const deliveries = state.deliveryQueue.filter((entry) => {
    if (status && entry.status !== status) {
      return false
    }
    if (connector && !matchesQuery(entry.connector, connector)) {
      return false
    }
    if (target && !matchesQuery(entry.target, target)) {
      return false
    }
    return true
  })

  response.json(deliveries)
})

app.get('/api/audit', async (request, response) => {
  const state = await readState()
  const kind = normalizeQuery(request.query.kind)
  const target = normalizeQuery(request.query.target)
  const query = normalizeQuery(request.query.q)

  const auditEvents = state.auditEvents.filter((entry) => {
    if (kind && entry.kind !== kind) {
      return false
    }
    if (target && !matchesQuery(entry.target, target)) {
      return false
    }
    if (
      query &&
      ![entry.title, entry.detail, entry.target, entry.kind].some((value) => matchesQuery(value, query))
    ) {
      return false
    }
    return true
  })

  response.json(auditEvents)
})

app.get('/api/notes', async (request, response) => {
  const state = await readState()
  const scenarioId = normalizeQuery(request.query.scenarioId)
  const query = normalizeQuery(request.query.q)

  const notes = state.operatorNotesHistory.filter((entry) => {
    if (scenarioId && entry.scenarioId !== scenarioId) {
      return false
    }
    if (query && ![entry.note, entry.stepLabel, entry.scenarioId].some((value) => matchesQuery(value, query))) {
      return false
    }
    return true
  })

  response.json(notes)
})

app.post('/api/leads', requireAdmin, async (request, response) => {
  const result = await createLead(request.body ?? {})
  return respondWithMutation(response, result)
})

app.patch('/api/leads/:leadId', requireAdmin, async (request, response) => {
  const result = await updateLead(request.params.leadId, request.body ?? {})
  return respondWithMutation(response, result)
})

app.post('/api/reset', requireAdmin, async (_request, response) => {
  const snapshot = await resetState()
  const sync = await maybeSyncSnapshot(snapshot, 'sqlite-reset')
  response.json(sync ? { ...snapshot, sync } : snapshot)
})

app.post('/api/webhooks/validate', requireAdmin, async (request, response) => {
  const result = await validateWebhook(request.body.payload)
  return respondWithMutation(response, result)
})

app.post('/api/tests/run', requireAdmin, async (request, response) => {
  const result = await runLiveTest(request.body ?? {})
  return respondWithMutation(response, result)
})

app.post('/api/scenarios/:templateId/instantiate', requireAdmin, async (request, response) => {
  const result = await instantiateScenario(request.params.templateId)
  return respondWithMutation(response, result, 404)
})

app.post('/api/leads/:leadId/actions', requireAdmin, async (request, response) => {
  const result = await runLeadAction(request.params.leadId, request.body.action)
  return respondWithMutation(response, result)
})

app.post('/api/bookings', requireAdmin, async (request, response) => {
  const result = await upsertBooking(request.body ?? {})
  return respondWithMutation(response, result)
})

app.post('/api/messages', requireAdmin, async (request, response) => {
  const result = await appendMessage(request.body ?? {})
  return respondWithMutation(response, result)
})

app.post('/api/deliveries/:deliveryId/retry', requireAdmin, async (request, response) => {
  const result = await retryDelivery(request.params.deliveryId)
  return respondWithMutation(response, result)
})

app.get('/api/deliveries/:deliveryId/history', async (request, response) => {
  const result = await readDeliveryHistory(request.params.deliveryId)
  return result.ok ? response.json(result) : response.status(404).json(result)
})

app.post('/api/connectors/:name/ping', requireAdmin, async (request, response) => {
  const result = await pingConnector(decodeURIComponent(request.params.name))
  return respondWithMutation(response, result)
})

app.post('/api/notes', requireAdmin, async (request, response) => {
  const result = await logNote(request.body ?? {})
  return respondWithMutation(response, result)
})

app.post('/api/sync/push', requireAdmin, async (_request, response) => {
  const state = await readState()
  const result = await pushRemoteSnapshot(state, 'sqlite-manual-push')
  const mirror = result.ok ? await pushRemoteMirror(state) : null
  if (result.ok) {
    lastRemoteDigest = result.row?.digest ?? lastRemoteDigest
    publishRealtime('sync.pushed', {
      source: 'sqlite-manual-push',
      digest: result.row?.digest ?? null,
      updatedAt: result.row?.updated_at ?? null,
    })
    if (mirror?.ok) {
      publishRealtime('sync.mirror_updated', {
        tables: mirror.tables,
      })
    }
  }
  return result.ok ? response.json(mirror ? { ...result, mirror } : result) : response.status(400).json(result)
})

app.post('/api/sync/pull', requireAdmin, async (_request, response) => {
  const remote = await fetchRemoteSnapshot()
  if (!remote.ok) {
    return response.status(400).json(remote)
  }
  if (!remote.row?.state) {
    return response.status(404).json({ ok: false, message: 'No remote snapshot found.' })
  }
  const snapshot = await loadState(remote.row.state)
  lastRemoteDigest = remote.row.digest ?? lastRemoteDigest
  publishRealtime('sync.pulled', {
    source: remote.row.source,
    digest: remote.row.digest,
    updatedAt: remote.row.updated_at,
    leadCount: snapshot.leadRecords.length,
  })
  return response.json({
    ok: true,
    snapshot,
    remote: {
      source: remote.row.source,
      digest: remote.row.digest,
      updatedAt: remote.row.updated_at,
    },
  })
})

app.post('/api/sync/reconcile', requireAdmin, async (request, response) => {
  const strategy = normalizeQuery(request.body?.strategy) || 'merge-prefer-local'
  const allowed = new Set(['local-wins', 'remote-wins', 'merge-prefer-local'])
  if (!allowed.has(strategy)) {
    return response.status(400).json({ ok: false, message: 'Invalid reconcile strategy.' })
  }

  const local = await readState()
  const remote = await fetchRemoteSnapshot()
  if (!remote.ok || !remote.row?.state) {
    return response.status(400).json({
      ok: false,
      message: remote.message || 'No remote snapshot available.',
    })
  }

  const nextState = mergeSnapshots(local, remote.row.state, strategy)
  const snapshot = await loadState(nextState)
  const sync = await maybeSyncSnapshot(snapshot, `reconcile:${strategy}`)

  publishRealtime('sync.reconciled', {
    strategy,
    leadCount: snapshot.leadRecords.length,
    deliveryCount: snapshot.deliveryQueue.length,
  })

  return response.json({
    ok: true,
    strategy,
    snapshot,
    sync,
  })
})

app.use(express.static(distDir, { index: false }))

app.get('/{*path}', (request, response, next) => {
  if (request.path.startsWith('/api/')) {
    return next()
  }

  return response.sendFile(indexHtmlPath, (error) => {
    if (error) {
      next(error)
    }
  })
})

assertAdminAuthConfiguration()

app.listen(port, () => {
  console.log(`cobe-funnel-ops api listening on http://localhost:${port}`)
})

startRemoteWatcher().catch((error) => {
  console.error('failed to start remote watcher', error)
})
