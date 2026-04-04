import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { seedState } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dbFile = path.join(dataDir, 'runtime.sqlite')
const schemaFile = path.join(__dirname, 'schema.sql')

mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(dbFile)
db.exec(readFileSync(schemaFile, 'utf8'))

function now() {
  return new Date().toISOString()
}

function seedTime(index, total) {
  return new Date(Date.now() - (total - index) * 60_000).toISOString()
}

function json(value, fallback = []) {
  if (typeof value !== 'string' || !value) {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function generateId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

function withTransaction(work) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function insertAuditEntry(entry, timestamp = now()) {
  db.prepare(
    `INSERT INTO audit_events (id, kind, title, detail, target, timestamp, created_at)
     VALUES (@id, @kind, @title, @detail, @target, @timestamp, @created_at)`,
  ).run({
    id: entry.id ?? generateId('aud'),
    kind: entry.kind,
    title: entry.title,
    detail: entry.detail,
    target: entry.target,
    timestamp,
    created_at: timestamp,
  })
}

function seedIfNeeded() {
  const leadCount = db.prepare('SELECT COUNT(*) AS count FROM leads').get().count
  if (leadCount > 0) {
    return
  }

  withTransaction(() => {
    const seedTimestampTotal = 120

    const insertLead = db.prepare(
      `INSERT INTO leads (
        id, name, handle, source, offer, stage, owner, tags_json, budget,
        next_action, last_touch, created_at, updated_at
      ) VALUES (
        @id, @name, @handle, @source, @offer, @stage, @owner, @tags_json, @budget,
        @next_action, @last_touch, @created_at, @updated_at
      )`,
    )
    seedState.leadRecords.forEach((lead, index) => {
      const timestamp = seedTime(index, seedTimestampTotal)
      insertLead.run({
        id: lead.id,
        name: lead.name,
        handle: lead.handle,
        source: lead.source,
        offer: lead.offer,
        stage: lead.stage,
        owner: lead.owner,
        tags_json: JSON.stringify(lead.tags),
        budget: lead.budget,
        next_action: lead.nextAction,
        last_touch: lead.lastTouch,
        created_at: timestamp,
        updated_at: timestamp,
      })
    })

    const insertBooking = db.prepare(
      `INSERT INTO bookings (
        id, lead_id, slot, owner, status, recovery_action, created_at, updated_at
      ) VALUES (
        @id, @lead_id, @slot, @owner, @status, @recovery_action, @created_at, @updated_at
      )`,
    )
    seedState.bookingRecords.forEach((booking, index) => {
      const timestamp = seedTime(index + 20, seedTimestampTotal)
      insertBooking.run({
        id: booking.id,
        lead_id: booking.leadId,
        slot: booking.slot,
        owner: booking.owner,
        status: booking.status,
        recovery_action: booking.recoveryAction,
        created_at: timestamp,
        updated_at: timestamp,
      })
    })

    const insertWebhook = db.prepare(
      `INSERT INTO webhook_history (id, label, payload, created_at)
       VALUES (@id, @label, @payload, @created_at)`,
    )
    seedState.webhookHistory.forEach((entry, index) => {
      insertWebhook.run({
        id: entry.id,
        label: entry.label,
        payload: entry.payload,
        created_at: seedTime(index + 40, seedTimestampTotal),
      })
    })

    const insertConnector = db.prepare(
      `INSERT INTO connector_states (
        name, status, last_ping, runs, note, updated_at
      ) VALUES (
        @name, @status, @last_ping, @runs, @note, @updated_at
      )`,
    )
    Object.entries(seedState.connectorStates).forEach(([name, state], index) => {
      const timestamp = seedTime(index + 60, seedTimestampTotal)
      insertConnector.run({
        name,
        status: state.status,
        last_ping: state.lastPing,
        runs: state.runs,
        note: state.note,
        updated_at: timestamp,
      })
    })

    const insertDelivery = db.prepare(
      `INSERT INTO delivery_queue (
        id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
      ) VALUES (
        @id, @connector, @channel, @target, @payload_label, @status, @last_attempt, @note, @created_at, @updated_at
      )`,
    )
    seedState.deliveryQueue.forEach((item, index) => {
      const timestamp = seedTime(index + 80, seedTimestampTotal)
      insertDelivery.run({
        id: item.id,
        connector: item.connector,
        channel: item.channel,
        target: item.target,
        payload_label: item.payloadLabel,
        status: item.status,
        last_attempt: item.lastAttempt,
        note: item.note,
        created_at: timestamp,
        updated_at: timestamp,
      })
    })

    const insertNote = db.prepare(
      `INSERT INTO operator_notes_history (
        id, note, timestamp, scenario_id, step_label, created_at
      ) VALUES (
        @id, @note, @timestamp, @scenario_id, @step_label, @created_at
      )`,
    )
    seedState.operatorNotesHistory.forEach((entry, index) => {
      const timestamp = seedTime(index + 100, seedTimestampTotal)
      insertNote.run({
        id: entry.id,
        note: entry.note,
        timestamp: entry.timestamp,
        scenario_id: entry.scenarioId,
        step_label: entry.stepLabel,
        created_at: timestamp,
      })
    })

    seedState.auditEvents.forEach((entry, index) => {
      const timestamp = seedTime(index + 110, seedTimestampTotal)
      insertAuditEntry(
        {
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
          detail: entry.detail,
          target: entry.target,
        },
        timestamp,
      )
    })
  })
}

function readLeads() {
  return db
    .prepare(
      'SELECT * FROM leads ORDER BY updated_at DESC, created_at DESC, id ASC',
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      handle: row.handle,
      source: row.source,
      offer: row.offer,
      stage: row.stage,
      owner: row.owner,
      tags: json(row.tags_json, []),
      budget: row.budget,
      nextAction: row.next_action,
      lastTouch: row.last_touch,
    }))
}

function readBookings() {
  return db
    .prepare('SELECT * FROM bookings ORDER BY updated_at DESC, created_at DESC, id ASC')
    .all()
    .map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      slot: row.slot,
      owner: row.owner,
      status: row.status,
      recoveryAction: row.recovery_action,
    }))
}

function readWebhookHistory() {
  return db
    .prepare('SELECT * FROM webhook_history ORDER BY created_at DESC, id DESC')
    .all()
    .map((row) => ({
      id: row.id,
      label: row.label,
      payload: row.payload,
    }))
}

function readConnectorStates() {
  return db
    .prepare('SELECT * FROM connector_states ORDER BY name COLLATE NOCASE ASC')
    .all()
    .reduce((accumulator, row) => {
      accumulator[row.name] = {
        status: row.status,
        lastPing: row.last_ping,
        runs: row.runs,
        note: row.note,
      }
      return accumulator
    }, {})
}

function readDeliveryQueue() {
  return db
    .prepare('SELECT * FROM delivery_queue ORDER BY created_at DESC, updated_at DESC, id DESC')
    .all()
    .map((row) => ({
      id: row.id,
      connector: row.connector,
      channel: row.channel,
      target: row.target,
      payloadLabel: row.payload_label,
      status: row.status,
      lastAttempt: row.last_attempt,
      note: row.note,
    }))
}

function readNotes() {
  return db
    .prepare(
      'SELECT * FROM operator_notes_history ORDER BY created_at DESC, timestamp DESC, id DESC',
    )
    .all()
    .map((row) => ({
      id: row.id,
      note: row.note,
      timestamp: row.timestamp,
      scenarioId: row.scenario_id,
      stepLabel: row.step_label,
    }))
}

function readAuditEvents() {
  return db
    .prepare('SELECT * FROM audit_events ORDER BY created_at DESC, timestamp DESC, id DESC')
    .all()
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      detail: row.detail,
      target: row.target,
      timestamp: row.timestamp,
    }))
}

function readLiveTestRuns() {
  return db
    .prepare('SELECT * FROM live_test_runs ORDER BY created_at DESC, id DESC')
    .all()
    .map((row) => ({
      id: row.id,
      scenarioId: row.scenario_id,
      scenarioTitle: row.scenario_title,
      stepLabel: row.step_label,
      payloadLabel: row.payload_label,
      connector: row.connector,
      status: row.status,
      resultMessage: row.result_message,
      payload: row.payload,
      createdAt: row.created_at,
    }))
}

function readRuleResults() {
  return db
    .prepare('SELECT * FROM rule_test_results ORDER BY created_at DESC, timestamp DESC, rule_id ASC')
    .all()
    .reduce((accumulator, row) => {
      accumulator[row.rule_id] = {
        status: row.status,
        detail: row.detail,
        timestamp: row.timestamp,
      }
      return accumulator
    }, {})
}

function snapshot() {
  return {
    leadRecords: readLeads(),
    bookingRecords: readBookings(),
    webhookHistory: readWebhookHistory(),
    connectorStates: readConnectorStates(),
    deliveryQueue: readDeliveryQueue(),
    operatorNotesHistory: readNotes(),
    auditEvents: readAuditEvents(),
    liveTestRuns: readLiveTestRuns(),
    ruleTestResults: readRuleResults(),
  }
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

function determineLiveRoute(parsed) {
  if (typeof parsed.event_name === 'string' && parsed.event_name.toLowerCase() === 'purchase') {
    return {
      connector: 'Meta CAPI',
      channel: 'server_events',
      payloadLabel: 'Purchase',
      note: 'Purchase payload normalized and staged for server-side relay.',
      status: 'queued',
    }
  }

  if (typeof parsed.booking_status === 'string' || typeof parsed.route === 'string') {
    return {
      connector: 'GHL',
      channel: 'consult_routing',
      payloadLabel: String(parsed.booking_status ?? parsed.route ?? 'BookingUpdate'),
      note: 'Consult routing update queued for the ops relay.',
      status: 'processing',
    }
  }

  if (Array.isArray(parsed.onboarding_assets)) {
    return {
      connector: 'Make',
      channel: 'onboarding',
      payloadLabel: 'OnboardingAutopilot',
      note: 'Onboarding autopilot payload routed to the asset provisioning lane.',
      status: 'queued',
    }
  }

  return {
    connector: 'Zapier',
    channel: 'automation_relay',
    payloadLabel: String(parsed.event_name ?? 'CustomEvent'),
    note: 'Custom automation payload routed through the default relay lane.',
    status: 'queued',
  }
}

function getLeadAndBooking(leadId) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId)
  const booking = db.prepare('SELECT * FROM bookings WHERE lead_id = ?').get(leadId)
  return { lead, booking }
}

export async function readState() {
  seedIfNeeded()
  return snapshot()
}

export async function resetState() {
  withTransaction(() => {
    db.exec(`
      DELETE FROM rule_test_results;
      DELETE FROM live_test_runs;
      DELETE FROM audit_events;
      DELETE FROM operator_notes_history;
      DELETE FROM delivery_queue;
      DELETE FROM webhook_history;
      DELETE FROM connector_states;
      DELETE FROM bookings;
      DELETE FROM leads;
    `)
  })
  seedIfNeeded()
  return snapshot()
}

export async function validateWebhook(rawPayload) {
  seedIfNeeded()

  try {
    const result = validateWebhookPayload(rawPayload)
    if (!result.ok) {
      return result
    }

    const timestamp = now()
    withTransaction(() => {
      db.prepare(
        `INSERT INTO webhook_history (id, label, payload, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(
        generateId('wh'),
        result.label,
        JSON.stringify(result.parsed, null, 2),
        timestamp,
      )

      insertAuditEntry({
        id: generateId('aud'),
        kind: 'webhook',
        title: 'Webhook validated',
        detail: `Accepted payload labeled ${result.label} and added it to the inbox.`,
        target: result.label,
      }, timestamp)
    })

    return {
      ok: true,
      message: 'Accepted: payload passes schema check and is ready for relay.',
      snapshot: snapshot(),
    }
  } catch {
    return {
      ok: false,
      message: 'Rejected: payload is not valid JSON.',
    }
  }
}

export async function runLeadAction(leadId, action) {
  seedIfNeeded()

  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : ''
  const { lead, booking } = getLeadAndBooking(leadId)

  if (!lead) {
    return { ok: false, message: 'Lead not found.' }
  }

  const timestamp = now()

  withTransaction(() => {
    const tags = json(lead.tags_json, [])
    const nextTags = (tag) => (tags.includes(tag) ? tags : [...tags, tag])

    if (normalized === 'checkout') {
      db.prepare(
        `UPDATE leads
         SET stage = ?, tags_json = ?, next_action = ?, last_touch = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        'checkout-sent',
        JSON.stringify(nextTags('checkout-live')),
        'Checkout link sent; urgency bump queued at +2h.',
        'just now',
        timestamp,
        leadId,
      )
      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        'Stripe',
        'checkout_handoff',
        lead.handle,
        'InitiateCheckout',
        'queued',
        timestamp,
        'Generated checkout handoff from the ops queue.',
        timestamp,
        timestamp,
      )
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'scenario',
        title: 'Checkout queued',
        detail: `Promoted ${lead.handle} into checkout-sent and queued a Stripe handoff.`,
        target: lead.id,
      }, timestamp)
    } else if (normalized === 'route') {
      db.prepare(
        `UPDATE leads
         SET owner = ?, stage = ?, next_action = ?, last_touch = ?, updated_at = ?
         WHERE id = ?`,
      ).run('Nina', 'booked', 'Closer assigned; reminders and call prep started.', 'just now', timestamp, leadId)
      if (booking) {
        db.prepare(
          `UPDATE bookings
           SET owner = ?, status = ?, recovery_action = ?, updated_at = ?
           WHERE id = ?`,
        ).run('Nina', 'booked', 'Consult booked and reminder sequence started.', timestamp, booking.id)
      }
      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        'GHL',
        'consult_routing',
        lead.handle,
        'BookingCreated',
        'processing',
        timestamp,
        'Lead assigned to closer and routed into booking flow.',
        timestamp,
        timestamp,
      )
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'scenario',
        title: 'Closer assigned',
        detail: `Routed ${lead.handle} to Nina and kicked off the consult branch.`,
        target: lead.id,
      }, timestamp)
    } else if (normalized === 'no-show') {
      db.prepare(
        `UPDATE leads
         SET stage = ?, tags_json = ?, next_action = ?, last_touch = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        'no-show',
        JSON.stringify(nextTags('no-show')),
        'Recovery branch queued with proof stack and reschedule link.',
        'just now',
        timestamp,
        leadId,
      )
      if (booking) {
        db.prepare(
          `UPDATE bookings
           SET status = ?, recovery_action = ?, updated_at = ?
           WHERE id = ?`,
        ).run('no-show', 'Marked no-show and moved into recovery automation.', timestamp, booking.id)
      }
      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        'Make',
        'recovery_sequence',
        lead.handle,
        'NoShowRecovery',
        'queued',
        timestamp,
        'Recovery workflow staged after missed consult attendance.',
        timestamp,
        timestamp,
      )
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'scenario',
        title: 'No-show escalated',
        detail: `Moved ${lead.handle} into no-show recovery and queued the sequence.`,
        target: lead.id,
      }, timestamp)
    } else if (normalized === 'recover') {
      db.prepare(
        `UPDATE leads
         SET stage = ?, next_action = ?, last_touch = ?, updated_at = ?
         WHERE id = ?`,
      ).run('recovery', 'Recovered; waiting on rebook confirmation.', 'just now', timestamp, leadId)
      if (booking) {
        db.prepare(
          `UPDATE bookings
           SET status = ?, recovery_action = ?, updated_at = ?
           WHERE id = ?`,
        ).run('recovered', 'Recovered with proof stack and one-click rebook.', timestamp, booking.id)
      }
      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        'Meta CAPI',
        'server_events',
        lead.handle,
        'Schedule',
        'queued',
        timestamp,
        'Recovered consult status prepared for server-side reporting.',
        timestamp,
        timestamp,
      )
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'scenario',
        title: 'Lead recovered',
        detail: `Recovered ${lead.handle} and prepared reporting payloads for the new booking path.`,
        target: lead.id,
      }, timestamp)
    } else if (normalized === 'alert') {
      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        'Slack',
        'team_alert',
        lead.handle,
        'HotLeadAlert',
        'delivered',
        timestamp,
        'Hot lead alert sent to the team for manual assist.',
        timestamp,
        timestamp,
      )
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'connector',
        title: 'Slack alert sent',
        detail: `Pushed a manual assist alert for ${lead.handle}.`,
        target: lead.id,
      }, timestamp)
    } else {
      throw new Error('Unsupported lead action.')
    }
  })

  return {
    ok: true,
    snapshot: snapshot(),
  }
}

export async function retryDelivery(deliveryId) {
  seedIfNeeded()

  const delivery = db.prepare('SELECT * FROM delivery_queue WHERE id = ?').get(deliveryId)
  if (!delivery) {
    return { ok: false, message: 'Delivery not found.' }
  }

  const timestamp = now()
  withTransaction(() => {
    db.prepare(
      `UPDATE delivery_queue
       SET status = ?, last_attempt = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    ).run('delivered', timestamp, `${delivery.connector} retried successfully from the outbox.`, timestamp, deliveryId)

    insertAuditEntry({
      id: generateId('aud'),
      kind: 'connector',
      title: 'Delivery retried',
      detail: `Outbox item ${deliveryId} was retried and marked delivered.`,
      target: deliveryId,
    }, timestamp)
  })

  return {
    ok: true,
    snapshot: snapshot(),
  }
}

export async function pingConnector(name) {
  seedIfNeeded()

  const connector = db.prepare('SELECT * FROM connector_states WHERE name = ?').get(name)
  if (!connector) {
    return { ok: false, message: 'Connector not found.' }
  }

  const timestamp = now()
  withTransaction(() => {
    db.prepare(
      `UPDATE connector_states
       SET status = ?, last_ping = ?, runs = ?, note = ?, updated_at = ?
       WHERE name = ?`,
    ).run(
      'ready',
      timestamp,
      connector.runs + 1,
      `${name} checked, payload routing is healthy.`,
      timestamp,
      name,
    )

    insertAuditEntry({
      id: generateId('aud'),
      kind: 'connector',
      title: `${name} pinged`,
      detail: 'Connector health check completed and the relay path is ready.',
      target: name,
    }, timestamp)
  })

  return {
    ok: true,
    snapshot: snapshot(),
  }
}

export async function logNote({ note, scenarioId, stepLabel, leadId }) {
  seedIfNeeded()

  if (typeof note !== 'string' || !note.trim()) {
    return { ok: false, message: 'Note is required.' }
  }

  const timestamp = now()
  withTransaction(() => {
    db.prepare(
      `INSERT INTO operator_notes_history (
        id, note, timestamp, scenario_id, step_label, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      generateId('note'),
      note.trim(),
      timestamp,
      scenarioId || 'scenario-unknown',
      stepLabel || 'unknown-step',
      timestamp,
    )

    insertAuditEntry({
      id: generateId('aud'),
      kind: 'note',
      title: 'Operator note logged',
      detail: note.trim(),
      target: leadId || scenarioId || 'scenario-unknown',
    }, timestamp)
  })

  return {
    ok: true,
    snapshot: snapshot(),
  }
}

export async function runLiveTest({ scenarioId, scenarioTitle, stepLabel, payload }) {
  seedIfNeeded()

  const timestamp = now()

  try {
    const result = validateWebhookPayload(payload)
    if (!result.ok) {
      withTransaction(() => {
        db.prepare(
          `INSERT INTO live_test_runs (
            id, scenario_id, scenario_title, step_label, payload_label, connector, status,
            result_message, payload, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          generateId('ltr'),
          scenarioId || 'scenario-unknown',
          scenarioTitle || 'Unknown scenario',
          stepLabel || 'unknown-step',
          'Rejected payload',
          'None',
          'rejected',
          result.message,
          typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
          timestamp,
        )

        insertAuditEntry({
          id: generateId('aud'),
          kind: 'webhook',
          title: 'Live test rejected',
          detail: result.message,
          target: scenarioId || 'scenario-unknown',
        }, timestamp)
      })

      return {
        ok: false,
        message: result.message,
        snapshot: snapshot(),
      }
    }

    const route = determineLiveRoute(result.parsed)

    withTransaction(() => {
      db.prepare(
        `INSERT INTO webhook_history (id, label, payload, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(generateId('wh'), `Live test: ${result.label}`, JSON.stringify(result.parsed, null, 2), timestamp)

      db.prepare(
        `INSERT INTO live_test_runs (
          id, scenario_id, scenario_title, step_label, payload_label, connector, status,
          result_message, payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('ltr'),
        scenarioId || 'scenario-unknown',
        scenarioTitle || 'Unknown scenario',
        stepLabel || 'unknown-step',
        route.payloadLabel,
        route.connector,
        'accepted',
        `${route.connector} accepted the live test payload and queued ${route.payloadLabel}.`,
        JSON.stringify(result.parsed, null, 2),
        timestamp,
      )

      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        route.connector,
        route.channel,
        `scenario:${scenarioId || 'unknown'}`,
        route.payloadLabel,
        route.status,
        timestamp,
        route.note,
        timestamp,
        timestamp,
      )

      const currentConnector = db.prepare('SELECT * FROM connector_states WHERE name = ?').get(route.connector)
      if (currentConnector) {
        db.prepare(
          `UPDATE connector_states
           SET status = ?, last_ping = ?, runs = ?, note = ?, updated_at = ?
           WHERE name = ?`,
        ).run(
          'syncing',
          timestamp,
          currentConnector.runs + 1,
          `${route.connector} accepted a live test run from the scenario tester.`,
          timestamp,
          route.connector,
        )
      }

      insertAuditEntry({
        id: generateId('aud'),
        kind: 'scenario',
        title: 'Live test run completed',
        detail: `${route.connector} accepted ${route.payloadLabel} and queued the relay item.`,
        target: scenarioId || 'scenario-unknown',
      }, timestamp)
    })

    return {
      ok: true,
      message: `${route.connector} accepted the live test payload and queued ${route.payloadLabel}.`,
      snapshot: snapshot(),
    }
  } catch {
    return {
      ok: false,
      message: 'Rejected: payload is not valid JSON.',
      snapshot: snapshot(),
    }
  }
}
