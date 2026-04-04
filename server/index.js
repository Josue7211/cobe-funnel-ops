import cors from 'cors'
import express from 'express'
import { readState, resetState, writeState } from './store.js'

const app = express()
const port = Number(process.env.PORT || 8787)

app.use(cors())
app.use(express.json())

function now() {
  return new Date().toISOString()
}

function nextId(prefix, items) {
  return `${prefix}-${String(items.length + 1).padStart(3, '0')}`
}

function appendAudit(state, event) {
  state.auditEvents.unshift({
    id: nextId('aud', state.auditEvents),
    timestamp: now(),
    ...event,
  })
}

function readSnapshot(state) {
  return {
    leadRecords: state.leadRecords,
    bookingRecords: state.bookingRecords,
    webhookHistory: state.webhookHistory,
    connectorStates: state.connectorStates,
    deliveryQueue: state.deliveryQueue,
    operatorNotesHistory: state.operatorNotesHistory,
    auditEvents: state.auditEvents,
  }
}

function normalizeAction(action) {
  if (typeof action !== 'string') {
    return ''
  }

  const normalized = action.trim().toLowerCase()
  if (normalized === 'mark-no-show') return 'no-show'
  if (normalized === 'mark-recovered') return 'recover'
  if (normalized === 'queue-checkout') return 'checkout'
  if (normalized === 'route-booking') return 'route'
  if (normalized === 'log-note') return 'alert'
  return normalized
}

function validateWebhookPayload(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const hasRecognizedSignal =
    typeof parsed?.event_name === 'string' ||
    typeof parsed?.booking_status === 'string' ||
    typeof parsed?.route === 'string' ||
    Array.isArray(parsed?.onboarding_assets)

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
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/state', async (_request, response) => {
  const state = await readState()
  response.json(readSnapshot(state))
})

app.get('/api/bootstrap', async (_request, response) => {
  const state = await readState()
  response.json(readSnapshot(state))
})

app.post('/api/reset', async (_request, response) => {
  const state = await resetState()
  response.json(state)
})

app.post('/api/webhooks/validate', async (request, response) => {
  const state = await readState()

  try {
    const result = validateWebhookPayload(request.body.payload)
    if (!result.ok) {
      return response.status(400).json(result)
    }

    state.webhookHistory.unshift({
      id: nextId('wh', state.webhookHistory),
      label: result.label,
      payload: JSON.stringify(result.parsed, null, 2),
    })

    appendAudit(state, {
      kind: 'webhook',
      title: 'Webhook validated',
      detail: `Accepted payload labeled ${result.label} and added it to the inbox.`,
      target: result.label,
    })

    await writeState(state)
    return response.json({
      ok: true,
      message: 'Accepted: payload passes schema check and is ready for relay.',
      snapshot: state,
    })
  } catch {
    return response.status(400).json({
      ok: false,
      message: 'Rejected: payload is not valid JSON.',
    })
  }
})

app.post('/api/leads/:leadId/actions', async (request, response) => {
  const state = await readState()
  const lead = state.leadRecords.find((entry) => entry.id === request.params.leadId)
  const action = normalizeAction(request.body.action)

  if (!lead) {
    return response.status(404).json({ ok: false, message: 'Lead not found.' })
  }

  const relatedBooking = state.bookingRecords.find((booking) => booking.leadId === lead.id)

  if (action === 'checkout') {
    if (!lead.tags.includes('checkout-live')) {
      lead.tags.push('checkout-live')
    }
    lead.stage = 'checkout-sent'
    lead.nextAction = 'Checkout link sent; urgency bump queued at +2h.'
    lead.lastTouch = 'just now'
    state.deliveryQueue.unshift({
      id: nextId('dq', state.deliveryQueue),
      connector: 'Stripe',
      channel: 'checkout_handoff',
      target: lead.handle,
      payloadLabel: 'InitiateCheckout',
      status: 'queued',
      lastAttempt: now(),
      note: 'Generated checkout handoff from the ops queue.',
    })
    appendAudit(state, {
      kind: 'scenario',
      title: 'Checkout queued',
      detail: `Promoted ${lead.handle} into checkout-sent and queued a Stripe handoff.`,
      target: lead.id,
    })
  } else if (action === 'route') {
    lead.owner = 'Nina'
    lead.stage = 'booked'
    lead.nextAction = 'Closer assigned; reminders and call prep started.'
    lead.lastTouch = 'just now'
    if (relatedBooking) {
      relatedBooking.owner = 'Nina'
      relatedBooking.status = 'booked'
      relatedBooking.recoveryAction = 'Consult booked and reminder sequence started.'
    }
    state.deliveryQueue.unshift({
      id: nextId('dq', state.deliveryQueue),
      connector: 'GHL',
      channel: 'consult_routing',
      target: lead.handle,
      payloadLabel: 'BookingCreated',
      status: 'processing',
      lastAttempt: now(),
      note: 'Lead assigned to closer and routed into booking flow.',
    })
    appendAudit(state, {
      kind: 'scenario',
      title: 'Closer assigned',
      detail: `Routed ${lead.handle} to Nina and kicked off the consult branch.`,
      target: lead.id,
    })
  } else if (action === 'no-show') {
    if (!lead.tags.includes('no-show')) {
      lead.tags.push('no-show')
    }
    lead.stage = 'no-show'
    lead.nextAction = 'Recovery branch queued with proof stack and reschedule link.'
    lead.lastTouch = 'just now'
    if (relatedBooking) {
      relatedBooking.status = 'no-show'
      relatedBooking.recoveryAction = 'Marked no-show and moved into recovery automation.'
    }
    state.deliveryQueue.unshift({
      id: nextId('dq', state.deliveryQueue),
      connector: 'Make',
      channel: 'recovery_sequence',
      target: lead.handle,
      payloadLabel: 'NoShowRecovery',
      status: 'queued',
      lastAttempt: now(),
      note: 'Recovery workflow staged after missed consult attendance.',
    })
    appendAudit(state, {
      kind: 'scenario',
      title: 'No-show escalated',
      detail: `Moved ${lead.handle} into no-show recovery and queued the sequence.`,
      target: lead.id,
    })
  } else if (action === 'recover') {
    lead.stage = 'recovery'
    lead.nextAction = 'Recovered; waiting on rebook confirmation.'
    lead.lastTouch = 'just now'
    if (relatedBooking) {
      relatedBooking.status = 'recovered'
      relatedBooking.recoveryAction = 'Recovered with proof stack and one-click rebook.'
    }
    state.deliveryQueue.unshift({
      id: nextId('dq', state.deliveryQueue),
      connector: 'Meta CAPI',
      channel: 'server_events',
      target: lead.handle,
      payloadLabel: 'Schedule',
      status: 'queued',
      lastAttempt: now(),
      note: 'Recovered consult status prepared for server-side reporting.',
    })
    appendAudit(state, {
      kind: 'scenario',
      title: 'Lead recovered',
      detail: `Recovered ${lead.handle} and prepared reporting payloads for the new booking path.`,
      target: lead.id,
    })
  } else if (action === 'alert') {
    state.deliveryQueue.unshift({
      id: nextId('dq', state.deliveryQueue),
      connector: 'Slack',
      channel: 'team_alert',
      target: lead.handle,
      payloadLabel: 'HotLeadAlert',
      status: 'delivered',
      lastAttempt: now(),
      note: 'Hot lead alert sent to the team for manual assist.',
    })
    appendAudit(state, {
      kind: 'connector',
      title: 'Slack alert sent',
      detail: `Pushed a manual assist alert for ${lead.handle}.`,
      target: lead.id,
    })
  } else {
    return response.status(400).json({ ok: false, message: 'Unsupported lead action.' })
  }

  await writeState(state)
  return response.json({ ok: true, snapshot: state })
})

app.post('/api/deliveries/:deliveryId/retry', async (request, response) => {
  const state = await readState()
  const delivery = state.deliveryQueue.find((item) => item.id === request.params.deliveryId)

  if (!delivery) {
    return response.status(404).json({ ok: false, message: 'Delivery not found.' })
  }

  delivery.status = 'delivered'
  delivery.lastAttempt = now()
  delivery.note = `${delivery.connector} retried successfully from the outbox.`

  appendAudit(state, {
    kind: 'connector',
    title: 'Delivery retried',
    detail: `Outbox item ${delivery.id} was retried and marked delivered.`,
    target: delivery.id,
  })

  await writeState(state)
  return response.json({ ok: true, snapshot: state })
})

app.post('/api/connectors/:name/ping', async (request, response) => {
  const state = await readState()
  const name = decodeURIComponent(request.params.name)
  const connector = state.connectorStates[name]

  if (!connector) {
    return response.status(404).json({ ok: false, message: 'Connector not found.' })
  }

  connector.status = 'ready'
  connector.lastPing = now()
  connector.runs += 1
  connector.note = `${name} checked, payload routing is healthy.`

  appendAudit(state, {
    kind: 'connector',
    title: `${name} pinged`,
    detail: 'Connector health check completed and the relay path is ready.',
    target: name,
  })

  await writeState(state)
  return response.json({ ok: true, snapshot: state })
})

app.post('/api/notes', async (request, response) => {
  const state = await readState()
  const { note, scenarioId, stepLabel, leadId } = request.body

  if (typeof note !== 'string' || !note.trim()) {
    return response.status(400).json({ ok: false, message: 'Note is required.' })
  }

  state.operatorNotesHistory.unshift({
    id: nextId('note', state.operatorNotesHistory),
    note: note.trim(),
    timestamp: now(),
    scenarioId: scenarioId || 'scenario-unknown',
    stepLabel: stepLabel || 'unknown-step',
  })

  appendAudit(state, {
    kind: 'note',
    title: 'Operator note logged',
    detail: note.trim(),
    target: leadId || scenarioId || 'scenario-unknown',
  })

  await writeState(state)
  return response.json({ ok: true, snapshot: state })
})

app.listen(port, () => {
  console.log(`cobe-funnel-ops api listening on http://localhost:${port}`)
})
