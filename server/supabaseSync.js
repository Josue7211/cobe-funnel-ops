import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const localEnvFile = path.join(rootDir, '.env.local')

if (existsSync(localEnvFile)) {
  const entries = readFileSync(localEnvFile, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))

  for (const entry of entries) {
    const separator = entry.indexOf('=')
    const key = entry.slice(0, separator).trim()
    const value = entry.slice(separator + 1).trim()
    if (!(key in process.env)) {
      process.env[key] = value.replace(/^['"]|['"]$/g, '')
    }
  }
}

const tableName = process.env.COBE_SUPABASE_STATE_TABLE || 'cobe_funnel_ops_state_snapshots'
const supabaseTables = {
  leads: 'cobe_funnel_ops_leads',
  bookings: 'cobe_funnel_ops_bookings',
  conversations: 'cobe_funnel_ops_conversations',
  messages: 'cobe_funnel_ops_messages',
  deliveryQueue: 'cobe_funnel_ops_delivery_queue',
  deliveryAttempts: 'cobe_funnel_ops_delivery_attempts',
  auditEvents: 'cobe_funnel_ops_audit_events',
}

function getConfig() {
  const url = process.env.COBE_SUPABASE_URL?.trim()
  const key = process.env.COBE_SUPABASE_SERVICE_ROLE_KEY?.trim()
  return {
    url,
    key,
    enabled: Boolean(url && key),
  }
}

function getHeaders() {
  const { key } = getConfig()
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    prefer: 'return=representation,resolution=merge-duplicates',
  }
}

function buildUrl(path) {
  const { url } = getConfig()
  return `${url.replace(/\/$/, '')}${path}`
}

function digestState(state) {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex')
}

function mapMirrorRows(state) {
  return {
    [supabaseTables.leads]: (state.leadRecords ?? []).map((lead) => ({
      id: lead.id,
      name: lead.name,
      handle: lead.handle,
      source: lead.source,
      offer: lead.offer,
      stage: lead.stage,
      owner: lead.owner,
      tags_json: lead.tags ?? [],
      budget: lead.budget,
      next_action: lead.nextAction,
      last_touch: lead.lastTouch,
      sync_source: 'sqlite',
    })),
    [supabaseTables.bookings]: (state.bookingRecords ?? []).map((booking) => ({
      id: booking.id,
      lead_id: booking.leadId,
      slot: booking.slot,
      owner: booking.owner,
      status: booking.status,
      recovery_action: booking.recoveryAction,
      sync_source: 'sqlite',
    })),
    [supabaseTables.conversations]: (state.conversations ?? []).map((conversation) => ({
      id: conversation.id,
      lead_id: conversation.leadId,
      intent: conversation.intent,
      score: conversation.score,
      automation_summary: conversation.automationSummary,
      sync_source: 'sqlite',
    })),
    [supabaseTables.messages]: (state.conversations ?? []).flatMap((conversation) =>
      (conversation.messages ?? []).map((message) => ({
        id: message.id,
        conversation_id: conversation.id,
        sender: message.sender,
        text: message.text,
        message_timestamp: message.timestamp,
        sync_source: 'sqlite',
      })),
    ),
    [supabaseTables.deliveryQueue]: (state.deliveryQueue ?? []).map((entry) => ({
      id: entry.id,
      connector: entry.connector,
      channel: entry.channel,
      target: entry.target,
      payload_label: entry.payloadLabel,
      status: entry.status,
      last_attempt: entry.lastAttempt,
      note: entry.note,
      sync_source: 'sqlite',
    })),
    [supabaseTables.deliveryAttempts]: (state.deliveryAttempts ?? []).map((entry) => ({
      id: entry.id,
      delivery_id: entry.deliveryId,
      status: entry.status,
      detail: entry.detail,
      attempted_at: entry.attemptedAt,
      sync_source: 'sqlite',
    })),
    [supabaseTables.auditEvents]: (state.auditEvents ?? []).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      detail: entry.detail,
      target: entry.target,
      event_timestamp: entry.timestamp,
      sync_source: 'sqlite',
    })),
  }
}

async function replaceRemoteTable(table, rows) {
  const deleteResponse = await fetch(buildUrl(`/rest/v1/${table}?id=not.is.null`), {
    method: 'DELETE',
    headers: {
      ...getHeaders(),
      prefer: 'return=minimal',
    },
  })

  if (!deleteResponse.ok) {
    return {
      ok: false,
      message: `Supabase delete failed for ${table} with ${deleteResponse.status}.`,
      detail: await deleteResponse.text(),
    }
  }

  if (!rows.length) {
    return { ok: true, count: 0 }
  }

  const insertResponse = await fetch(buildUrl(`/rest/v1/${table}`), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(rows),
  })

  if (!insertResponse.ok) {
    return {
      ok: false,
      message: `Supabase insert failed for ${table} with ${insertResponse.status}.`,
      detail: await insertResponse.text(),
    }
  }

  return {
    ok: true,
    count: rows.length,
  }
}

export function isRemoteSyncConfigured() {
  return getConfig().enabled
}

export async function fetchRemoteSnapshot() {
  if (!isRemoteSyncConfigured()) {
    return { ok: false, message: 'Supabase sync is not configured.' }
  }

  const response = await fetch(
    buildUrl(`/rest/v1/${tableName}?id=eq.main&select=id,source,digest,updated_at,state`),
    {
      headers: getHeaders(),
    },
  )

  if (!response.ok) {
    return {
      ok: false,
      message: `Supabase fetch failed with ${response.status}.`,
    }
  }

  const rows = await response.json()
  const row = rows[0] ?? null

  return {
    ok: true,
    row,
    configured: true,
  }
}

export async function pushRemoteSnapshot(state, source = 'sqlite-local') {
  if (!isRemoteSyncConfigured()) {
    return { ok: false, message: 'Supabase sync is not configured.' }
  }

  const payload = {
    id: 'main',
    state,
    source,
    digest: digestState(state),
    updated_at: new Date().toISOString(),
  }

  const response = await fetch(buildUrl(`/rest/v1/${tableName}`), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    return {
      ok: false,
      message: `Supabase push failed with ${response.status}.`,
      detail: body,
    }
  }

  const rows = await response.json()
  return {
    ok: true,
    row: rows[0] ?? payload,
    configured: true,
  }
}

export async function pushSupabaseState(state) {
  if (!isRemoteSyncConfigured()) {
    return { ok: false, message: 'Supabase sync is not configured.' }
  }

  const tableRows = mapMirrorRows(state)
  const summary = {}

  for (const [table, rows] of Object.entries(tableRows)) {
    const result = await replaceRemoteTable(table, rows)
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        detail: result.detail,
        table,
      }
    }
    summary[table] = result.count
  }

  return {
    ok: true,
    tables: summary,
  }
}

export async function fetchSupabaseCounts() {
  if (!isRemoteSyncConfigured()) {
    return { ok: false, message: 'Supabase sync is not configured.' }
  }

  const counts = {}

  for (const table of Object.values(supabaseTables)) {
    const response = await fetch(buildUrl(`/rest/v1/${table}?select=id`), {
      headers: {
        apikey: getConfig().key,
        authorization: `Bearer ${getConfig().key}`,
      },
    })

    if (!response.ok) {
      return {
        ok: false,
        message: `Supabase count failed for ${table} with ${response.status}.`,
      }
    }

    const rows = await response.json()
    counts[table] = Array.isArray(rows) ? rows.length : 0
  }

  return {
    ok: true,
    counts,
  }
}

export async function fetchSupabaseRows(table, select = '*') {
  if (!isRemoteSyncConfigured()) {
    return { ok: false, message: 'Supabase sync is not configured.' }
  }

  const response = await fetch(buildUrl(`/rest/v1/${table}?select=${encodeURIComponent(select)}`), {
    headers: {
      apikey: getConfig().key,
      authorization: `Bearer ${getConfig().key}`,
    },
  })

  if (!response.ok) {
    return {
      ok: false,
      message: `Supabase fetch failed for ${table} with ${response.status}.`,
      detail: await response.text(),
    }
  }

  return {
    ok: true,
    rows: await response.json(),
  }
}
