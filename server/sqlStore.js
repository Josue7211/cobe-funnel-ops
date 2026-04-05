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

function ensureRuntimeColumns() {
  const onboardingColumns = db
    .prepare('PRAGMA table_info(onboarding_runs)')
    .all()
    .map((column) => column.name)

  if (!onboardingColumns.includes('handoff_json')) {
    db.exec(`ALTER TABLE onboarding_runs ADD COLUMN handoff_json TEXT NOT NULL DEFAULT '{}'`)
  }
}

ensureRuntimeColumns()

function now() {
  return new Date().toISOString()
}

function matchesQuery(value, query) {
  return String(value || '')
    .toLowerCase()
    .includes(String(query || '').toLowerCase())
}

function normalizeQuery(input) {
  return typeof input === 'string' ? input.trim() : ''
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

function seedConversationsAndMessages(seedTimestampTotal) {
  const conversationCount = db.prepare('SELECT COUNT(*) AS count FROM conversations').get().count
  if (conversationCount === 0) {
    const insertConversation = db.prepare(
      `INSERT INTO conversations (
        id, lead_id, intent, score, automation_summary, created_at, updated_at
      ) VALUES (
        @id, @lead_id, @intent, @score, @automation_summary, @created_at, @updated_at
      )`,
    )
    seedState.conversationRecords.forEach((conversation, index) => {
      const timestamp = seedTime(index + 30, seedTimestampTotal)
      insertConversation.run({
        id: conversation.id,
        lead_id: conversation.leadId,
        intent: conversation.intent,
        score: conversation.score,
        automation_summary: conversation.automationSummary,
        created_at: timestamp,
        updated_at: timestamp,
      })
    })
  }

  const messageCount = db.prepare('SELECT COUNT(*) AS count FROM messages').get().count
  if (messageCount === 0) {
    const insertMessage = db.prepare(
      `INSERT INTO messages (id, conversation_id, sender, text, timestamp, created_at)
       VALUES (@id, @conversation_id, @sender, @text, @timestamp, @created_at)`,
    )
    seedState.messageRecords.forEach((message, index) => {
      insertMessage.run({
        id: message.id,
        conversation_id: message.conversationId,
        sender: message.sender,
        text: message.text,
        timestamp: message.timestamp,
        created_at: seedTime(index + 35, seedTimestampTotal),
      })
    })
  }
}

function seedDeliveryAttempts() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM delivery_attempts').get().count
  if (count > 0) {
    return
  }

  const insertAttempt = db.prepare(
    `INSERT INTO delivery_attempts (id, delivery_id, status, detail, attempted_at)
     VALUES (@id, @delivery_id, @status, @detail, @attempted_at)`,
  )

  seedState.deliveryAttempts.forEach((entry) => {
    insertAttempt.run({
      id: entry.id,
      delivery_id: entry.deliveryId,
      status: entry.status,
      detail: entry.detail,
      attempted_at: entry.attemptedAt,
    })
  })
}

function seedLiveTestRuns(seedTimestampTotal) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM live_test_runs').get().count
  if (count > 0 || !Array.isArray(seedState.liveTestRuns)) {
    return
  }

  const insertRun = db.prepare(
    `INSERT INTO live_test_runs (
      id, scenario_id, scenario_title, step_label, payload_label, connector, status, result_message, payload, created_at
    ) VALUES (
      @id, @scenario_id, @scenario_title, @step_label, @payload_label, @connector, @status, @result_message, @payload, @created_at
    )`,
  )

  seedState.liveTestRuns.forEach((entry, index) => {
    insertRun.run({
      id: entry.id,
      scenario_id: entry.scenarioId,
      scenario_title: entry.scenarioTitle,
      step_label: entry.stepLabel,
      payload_label: entry.payloadLabel,
      connector: entry.connector,
      status: entry.status,
      result_message: entry.resultMessage,
      payload: entry.payload,
      created_at: entry.createdAt ?? seedTime(index + 95, seedTimestampTotal),
    })
  })
}

function seedRuleTestResults(seedTimestampTotal) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM rule_test_results').get().count
  if (count > 0 || !seedState.ruleTestResults) {
    return
  }

  const insertResult = db.prepare(
    `INSERT INTO rule_test_results (rule_id, status, detail, timestamp, created_at)
     VALUES (@rule_id, @status, @detail, @timestamp, @created_at)`,
  )

  Object.entries(seedState.ruleTestResults).forEach(([ruleId, entry], index) => {
    const timestamp = entry.timestamp ?? seedTime(index + 98, seedTimestampTotal)
    insertResult.run({
      rule_id: ruleId,
      status: entry.status,
      detail: entry.detail,
      timestamp,
      created_at: timestamp,
    })
  })
}

function seedOnboardingRuns(seedTimestampTotal) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM onboarding_runs').get().count
  if (count > 0 || !Array.isArray(seedState.onboardingRuns)) {
    return
  }

  const insertRun = db.prepare(
    `INSERT INTO onboarding_runs (
      id, lead_id, status, folder_url, sop_url, invite_url, created_at, updated_at
    ) VALUES (
      @id, @lead_id, @status, @folder_url, @sop_url, @invite_url, @created_at, @updated_at
    )`,
  )

  seedState.onboardingRuns.forEach((entry, index) => {
    const timestamp = seedTime(index + 99, seedTimestampTotal)
    const lead = seedState.leadRecords.find((record) => record.id === entry.leadId)
    const handoffState = entry.handoffStates ?? buildOnboardingHandoffState({
      handle: lead?.handle ?? entry.leadId,
      folderUrl: entry.folderUrl,
      sopUrl: entry.sopUrl,
      inviteUrl: entry.inviteUrl,
      status: entry.status,
    })
    insertRun.run({
      id: entry.id,
      lead_id: entry.leadId,
      status: entry.status,
      folder_url: entry.folderUrl,
      sop_url: entry.sopUrl,
      invite_url: entry.inviteUrl,
      handoff_json: JSON.stringify(handoffState),
      created_at: timestamp,
      updated_at: timestamp,
    })
  })
}

function seedIfNeeded() {
  const leadCount = db.prepare('SELECT COUNT(*) AS count FROM leads').get().count
  if (leadCount > 0) {
    seedConversationsAndMessages(120)
    seedDeliveryAttempts()
    seedLiveTestRuns(120)
    seedRuleTestResults(120)
    seedOnboardingRuns(120)
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

    seedConversationsAndMessages(seedTimestampTotal)

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

    seedDeliveryAttempts()
    seedLiveTestRuns(seedTimestampTotal)
    seedRuleTestResults(seedTimestampTotal)
    seedOnboardingRuns(seedTimestampTotal)

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
    .map((row) => {
      const transition = getConsultWorkflowTransition(row.status)
      return {
        id: row.id,
        leadId: row.lead_id,
        slot: row.slot,
        owner: row.owner,
        status: transition.bookingStatus,
        recoveryAction: row.recovery_action,
        routingLane: transition.lane,
        leadStage: transition.leadStage,
      }
    })
}

function readConversations() {
  const messagesByConversation = db
    .prepare('SELECT * FROM messages ORDER BY created_at ASC, id ASC')
    .all()
    .reduce((accumulator, row) => {
      const message = {
        id: row.id,
        sender: row.sender,
        text: row.text,
        timestamp: row.timestamp,
      }
      accumulator[row.conversation_id] ??= []
      accumulator[row.conversation_id].push(message)
      return accumulator
    }, {})

  return db
    .prepare('SELECT * FROM conversations ORDER BY updated_at DESC, created_at DESC, id ASC')
    .all()
    .map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      intent: row.intent,
      score: row.score,
      automationSummary: row.automation_summary,
      messages: messagesByConversation[row.id] ?? [],
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

function readDeliveryAttempts() {
  return db
    .prepare('SELECT * FROM delivery_attempts ORDER BY attempted_at DESC, id DESC')
    .all()
    .map((row) => ({
      id: row.id,
      deliveryId: row.delivery_id,
      status: row.status,
      detail: row.detail,
      attemptedAt: row.attempted_at,
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

function readOnboardingRuns() {
  return db
    .prepare('SELECT * FROM onboarding_runs ORDER BY updated_at DESC, created_at DESC, id DESC')
    .all()
    .map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      status: row.status,
      folderUrl: row.folder_url,
      sopUrl: row.sop_url,
      inviteUrl: row.invite_url,
      handoffState: json(row.handoff_json, null),
    }))
}

function snapshot() {
  return {
    leadRecords: readLeads(),
    bookingRecords: readBookings(),
    conversations: readConversations(),
    webhookHistory: readWebhookHistory(),
    connectorStates: readConnectorStates(),
    deliveryQueue: readDeliveryQueue(),
    deliveryAttempts: readDeliveryAttempts(),
    operatorNotesHistory: readNotes(),
    auditEvents: readAuditEvents(),
    liveTestRuns: readLiveTestRuns(),
    ruleTestResults: readRuleResults(),
    onboardingRuns: readOnboardingRuns(),
    dashboard: readDashboardSummary(),
  }
}

function readDashboardSummary() {
  const leadCounts = db.prepare('SELECT stage, COUNT(*) AS count FROM leads GROUP BY stage').all()
  const revenueCount = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM leads
       WHERE budget LIKE '%$97%' OR budget LIKE '%97 monthly%' OR stage = 'won'`,
    )
    .get().count

  return {
    leadsToday: db.prepare('SELECT COUNT(*) AS count FROM leads').get().count,
    bookedCalls:
      db.prepare(
        `SELECT COUNT(*) AS count
         FROM bookings
         WHERE status IN ('booked', 'reminded', 'no-show', 'recovered', 'rescheduled')`,
      ).get().count,
    recoveredNoShows:
      db.prepare(`SELECT COUNT(*) AS count FROM bookings WHERE status = 'recovered'`).get().count,
    stripeRevenue: revenueCount * 97,
    pipelineBreakdown: leadCounts.reduce((accumulator, row) => {
      accumulator[row.stage] = row.count
      return accumulator
    }, {}),
  }
}

function scoreLeadPriority(lead, booking, conversation, deliveries) {
  let score = 0

  const stageWeights = {
    'new': 55,
    'engaged': 68,
    'booked': 74,
    'checkout-sent': 82,
    'no-show': 95,
    'recovery': 88,
    'won': 24,
  }
  score += stageWeights[lead.stage] ?? 50

  if ((conversation?.score ?? 0) >= 90) {
    score += 12
  } else if ((conversation?.score ?? 0) >= 75) {
    score += 7
  }

  const consultStatus = booking ? getConsultWorkflowTransition(booking.status).bookingStatus : null

  if (consultStatus === 'no-show') {
    score += 18
  } else if (consultStatus === 'booked' || consultStatus === 'reminded' || consultStatus === 'rescheduled') {
    score += 8
  } else if (consultStatus === 'recovered') {
    score += 4
  }

  if (deliveries.some((entry) => entry.status === 'processing')) {
    score += 6
  }
  if (deliveries.some((entry) => entry.status === 'queued')) {
    score += 4
  }
  if (lead.tags?.includes('high-intent')) {
    score += 10
  }

  return Math.min(score, 100)
}

const CONSULT_STATUS_ALIASES = {
  booked: 'booked',
  scheduled: 'booked',
  confirmed: 'booked',
  reminded: 'reminded',
  reminder_sent: 'reminded',
  reminder: 'reminded',
  'no-show': 'no-show',
  no_show: 'no-show',
  noshow: 'no-show',
  missed: 'no-show',
  recovered: 'recovered',
  recovery: 'recovered',
  rescheduled: 'rescheduled',
  rebooked: 'rescheduled',
  rebook: 'rescheduled',
  lost: 'lost',
  cancelled: 'lost',
  canceled: 'lost',
}

const CONSULT_WORKFLOW_TRANSITIONS = {
  booked: {
    leadStage: 'booked',
    bookingStatus: 'booked',
    lane: 'consult',
    nextAction: 'Confirm consult routing and reminder coverage.',
    recoveryAction: 'Consult booked and routing coverage confirmed.',
    delivery: {
      connector: 'GHL',
      channel: 'consult_routing',
      payloadLabel: 'BookingCreated',
      status: 'processing',
      note: 'Consult booked and routed to the assigned closer.',
    },
  },
  reminded: {
    leadStage: 'booked',
    bookingStatus: 'reminded',
    lane: 'consult',
    nextAction: 'Reminder sent; confirm attendance and closer handoff.',
    recoveryAction: 'Reminder sequence running for the booked consult.',
    delivery: {
      connector: 'GHL',
      channel: 'consult_routing',
      payloadLabel: 'BookingReminder',
      status: 'processing',
      note: 'Consult reminder sequence is active for the assigned closer.',
    },
  },
  'no-show': {
    leadStage: 'no-show',
    bookingStatus: 'no-show',
    lane: 'recovery',
    nextAction: 'Recovery branch queued with proof stack and reschedule link.',
    recoveryAction: 'Recovery voice note and rebook sequence queued.',
    delivery: {
      connector: 'Make',
      channel: 'recovery_sequence',
      payloadLabel: 'NoShowRecovery',
      status: 'queued',
      note: 'Recovery workflow staged after missed consult attendance.',
    },
  },
  recovered: {
    leadStage: 'recovery',
    bookingStatus: 'recovered',
    lane: 'recovery',
    nextAction: 'Recovered; waiting on rebook confirmation.',
    recoveryAction: 'Recovered with proof stack and one-click rebook.',
    delivery: {
      connector: 'Meta CAPI',
      channel: 'server_events',
      payloadLabel: 'ScheduleRecovered',
      status: 'queued',
      note: 'Recovered consult status prepared for server-side reporting.',
    },
  },
  rescheduled: {
    leadStage: 'booked',
    bookingStatus: 'rescheduled',
    lane: 'consult',
    nextAction: 'New consult slot confirmed; restart reminder coverage.',
    recoveryAction: 'Consult rescheduled and reminder coverage restarted.',
    delivery: {
      connector: 'GHL',
      channel: 'consult_routing',
      payloadLabel: 'BookingRescheduled',
      status: 'processing',
      note: 'Consult rescheduled and routed back into the reminder branch.',
    },
  },
  lost: {
    leadStage: 'engaged',
    bookingStatus: 'lost',
    lane: 'qualification',
    nextAction: 'Re-qualify lead before routing another consult.',
    recoveryAction: 'Consult path closed without a rebook.',
    delivery: null,
  },
}

function normalizeConsultStatus(value, fallback = 'booked') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  return CONSULT_STATUS_ALIASES[normalized] ?? fallback
}

function isRecognizedConsultStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  return Boolean(CONSULT_STATUS_ALIASES[normalized])
}

function getConsultWorkflowTransition(status, fallbackStatus = 'booked') {
  const normalizedStatus = normalizeConsultStatus(status, fallbackStatus)
  return {
    normalizedStatus,
    ...(CONSULT_WORKFLOW_TRANSITIONS[normalizedStatus] ?? CONSULT_WORKFLOW_TRANSITIONS[fallbackStatus]),
  }
}

function resolveConsultOwner({ requestedOwner, leadOwner, bookingOwner }) {
  const normalizedRequestedOwner = String(requestedOwner || '').trim()
  if (normalizedRequestedOwner) {
    return normalizedRequestedOwner
  }

  const normalizedBookingOwner = String(bookingOwner || '').trim()
  if (normalizedBookingOwner) {
    return normalizedBookingOwner
  }

  const normalizedLeadOwner = String(leadOwner || '').trim()
  if (normalizedLeadOwner) {
    return normalizedLeadOwner
  }

  return 'Unassigned'
}

function enqueueConsultDelivery(leadHandle, transition, timestamp) {
  if (!transition.delivery) {
    return null
  }

  db.prepare(
    `INSERT INTO delivery_queue (
      id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    generateId('dq'),
    transition.delivery.connector,
    transition.delivery.channel,
    leadHandle,
    transition.delivery.payloadLabel,
    transition.delivery.status,
    timestamp,
    transition.delivery.note,
    timestamp,
    timestamp,
  )

  const deliveryId = db.prepare(
    'SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1',
  ).get().id
  appendDeliveryAttempt(deliveryId, transition.delivery.status, transition.delivery.note, timestamp)
  return deliveryId
}

function classifyLane(lead, booking) {
  const consultTransition = booking ? getConsultWorkflowTransition(booking.status) : null
  if (lead.stage === 'no-show' || consultTransition?.lane === 'recovery') {
    return 'recovery'
  }
  if (lead.stage === 'checkout-sent') {
    return 'checkout'
  }
  if (lead.stage === 'won') {
    return 'onboarding'
  }
  if (consultTransition?.lane === 'consult') {
    return 'consult'
  }
  return 'qualification'
}

function recommendAction(lead, booking) {
  const consultTransition = booking ? getConsultWorkflowTransition(booking.status) : null
  if (lead.stage === 'no-show' || consultTransition?.lane === 'recovery') {
    return consultTransition?.nextAction ?? 'send recovery message'
  }
  if (lead.stage === 'checkout-sent') {
    return 'follow up on checkout'
  }
  if (lead.stage === 'won') {
    return 'confirm onboarding assets'
  }
  if (consultTransition?.lane === 'consult') {
    return consultTransition.nextAction
  }
  return 'qualify and route'
}

function scoreBand(score) {
  if (score >= 90) {
    return 'critical'
  }
  if (score >= 75) {
    return 'hot'
  }
  if (score >= 60) {
    return 'warm'
  }
  return 'normal'
}

const scenarioTemplates = {
  'dm-checkout': {
    id: 'dm-checkout',
    title: 'Hot DM to checkout',
    description: 'Create a high-intent DM lead and queue the Stripe checkout handoff.',
  },
  'consult-recovery': {
    id: 'consult-recovery',
    title: 'Consult no-show recovery',
    description: 'Create a consult lead, mark the booking no-show, and queue recovery.',
  },
  'subscriber-onboarding': {
    id: 'subscriber-onboarding',
    title: 'Subscriber onboarding autopilot',
    description: 'Create a converted subscriber and queue onboarding plus Meta reporting.',
  },
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

function readLeadRow(leadId) {
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId)
}

function ensureConversationForLead(leadId, intent = 'proof') {
  const existing = db.prepare('SELECT * FROM conversations WHERE lead_id = ?').get(leadId)
  if (existing) {
    return existing.id
  }

  const timestamp = now()
  const conversationId = generateId('conv')
  db.prepare(
    `INSERT INTO conversations (
      id, lead_id, intent, score, automation_summary, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    conversationId,
    leadId,
    intent,
    60,
    'Conversation created from operator backend.',
    timestamp,
    timestamp,
  )
  return conversationId
}

function appendDeliveryAttempt(deliveryId, status, detail, attemptedAt = now()) {
  db.prepare(
    `INSERT INTO delivery_attempts (id, delivery_id, status, detail, attempted_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(generateId('da'), deliveryId, status, detail, attemptedAt)
}

function recordDeliveryQueueItem({
  connector,
  channel,
  target,
  payloadLabel,
  status,
  note,
  timestamp = now(),
}) {
  db.prepare(
    `INSERT INTO delivery_queue (
      id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    generateId('dq'),
    connector,
    channel,
    target,
    payloadLabel,
    status,
    timestamp,
    note,
    timestamp,
    timestamp,
  )

  const deliveryId = db.prepare(
    'SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1',
  ).get().id
  appendDeliveryAttempt(deliveryId, status, note, timestamp)
  return deliveryId
}

function buildOnboardingHandoffState({ handle, folderUrl, sopUrl, inviteUrl, status = 'provisioned' }) {
  return {
    status,
    folderUrl,
    sopUrl,
    inviteUrl,
    destinations: [
      {
        name: 'Kajabi',
        status: 'ready',
        url: makeAssetUrl('kajabi', handle),
        note: 'Course access and billing entitlement are staged.',
      },
      {
        name: 'Skool',
        status: 'ready',
        url: makeAssetUrl('skool', handle),
        note: 'Community invite is staged for the customer handoff.',
      },
      {
        name: 'Discord',
        status: 'ready',
        url: makeAssetUrl('discord', handle),
        note: 'Team alert and community escalation are staged.',
      },
    ],
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

export async function readQueue(filters = {}) {
  seedIfNeeded()

  const state = snapshot()
  const query = normalizeQuery(filters.q)
  const stage = normalizeQuery(filters.stage)
  const owner = normalizeQuery(filters.owner)
  const lane = normalizeQuery(filters.lane)
  const limit = Number(filters.limit)

  const queue = state.leadRecords
    .map((lead) => {
      const booking = state.bookingRecords.find((entry) => entry.leadId === lead.id) ?? null
      const conversation = state.conversations.find((entry) => entry.leadId === lead.id) ?? null
      const deliveries = state.deliveryQueue.filter((entry) => entry.target === lead.handle)
      const priorityScore = scoreLeadPriority(lead, booking, conversation, deliveries)
      const queueLane = classifyLane(lead, booking)

      return {
        id: lead.id,
        handle: lead.handle,
        name: lead.name,
        owner: lead.owner,
        stage: lead.stage,
        lane: queueLane,
        priorityScore,
        priorityBand: scoreBand(priorityScore),
        nextAction: lead.nextAction,
        conversationScore: conversation?.score ?? 0,
        bookingStatus: booking?.status ?? null,
        latestDeliveryStatus: deliveries[0]?.status ?? null,
        recommendedAction: recommendAction(lead, booking),
        tags: lead.tags,
        source: lead.source,
        offer: lead.offer,
      }
    })
    .filter((entry) => {
      if (stage && entry.stage !== stage) {
        return false
      }
      if (owner && !matchesQuery(entry.owner, owner)) {
        return false
      }
      if (lane && entry.lane !== lane) {
        return false
      }
      if (
        query &&
        ![
          entry.name,
          entry.handle,
          entry.owner,
          entry.source,
          entry.offer,
          entry.stage,
          entry.nextAction,
          ...(entry.tags ?? []),
        ].some((value) => matchesQuery(value, query))
      ) {
        return false
      }
      return true
    })
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore
      }
      return left.name.localeCompare(right.name)
    })

  return Number.isFinite(limit) && limit > 0 ? queue.slice(0, limit) : queue
}

export async function readLeadTimeline(leadId) {
  seedIfNeeded()

  const state = snapshot()
  const lead = state.leadRecords.find((entry) => entry.id === leadId)
  if (!lead) {
    return { ok: false, message: 'Lead not found.' }
  }

  const conversation = state.conversations.find((entry) => entry.leadId === leadId) ?? null
  const booking = state.bookingRecords.find((entry) => entry.leadId === leadId) ?? null
  const deliveries = state.deliveryQueue.filter((entry) => entry.target === lead.handle)
  const attemptsByDelivery = state.deliveryAttempts.reduce((accumulator, entry) => {
    accumulator[entry.deliveryId] ??= []
    accumulator[entry.deliveryId].push(entry)
    return accumulator
  }, {})

  const events = [
    ...(conversation?.messages ?? []).map((message) => ({
      id: message.id,
      type: 'message',
      timestamp: message.timestamp,
      title: `${message.sender} message`,
      detail: message.text,
    })),
    ...(booking
      ? [
          {
            id: booking.id,
            type: 'booking',
            timestamp: booking.slot,
            title: `Booking ${booking.status}`,
            detail: booking.recoveryAction,
          },
        ]
      : []),
    ...deliveries.flatMap((delivery) => [
      {
        id: delivery.id,
        type: 'delivery',
        timestamp: delivery.lastAttempt,
        title: `${delivery.connector} ${delivery.status}`,
        detail: delivery.note,
      },
      ...((attemptsByDelivery[delivery.id] ?? []).map((attempt) => ({
        id: attempt.id,
        type: 'delivery_attempt',
        timestamp: attempt.attemptedAt,
        title: `${delivery.connector} attempt ${attempt.status}`,
        detail: attempt.detail,
      }))),
    ]),
    ...state.auditEvents
      .filter((entry) => entry.target === leadId || entry.target === lead.handle)
      .map((entry) => ({
        id: entry.id,
        type: 'audit',
        timestamp: entry.timestamp,
        title: entry.title,
        detail: entry.detail,
      })),
    ...state.operatorNotesHistory
      .filter((entry) => entry.scenarioId === leadId)
      .map((entry) => ({
        id: entry.id,
        type: 'note',
        timestamp: entry.timestamp,
        title: entry.stepLabel,
        detail: entry.note,
      })),
  ]

  return {
    ok: true,
    lead,
    booking,
    conversation,
    events,
  }
}

export async function readReports() {
  seedIfNeeded()

  const state = snapshot()
  const queue = await readQueue()

  const connectors = Object.entries(state.connectorStates).map(([name, details]) => {
    const deliveries = state.deliveryQueue.filter((entry) => entry.connector === name)
    return {
      name,
      status: details.status,
      runs: details.runs,
      lastPing: details.lastPing,
      queued: deliveries.filter((entry) => entry.status === 'queued').length,
      processing: deliveries.filter((entry) => entry.status === 'processing').length,
      delivered: deliveries.filter((entry) => entry.status === 'delivered').length,
      note: details.note,
    }
  })

  const sourceBreakdown = state.leadRecords.reduce((accumulator, lead) => {
    accumulator[lead.source] = (accumulator[lead.source] ?? 0) + 1
    return accumulator
  }, {})

  const laneBreakdown = queue.reduce((accumulator, entry) => {
    accumulator[entry.lane] = (accumulator[entry.lane] ?? 0) + 1
    return accumulator
  }, {})

  const outboxSummary = state.deliveryQueue.reduce(
    (accumulator, entry) => {
      accumulator.total += 1
      accumulator[entry.status] = (accumulator[entry.status] ?? 0) + 1
      return accumulator
    },
    { total: 0, queued: 0, processing: 0, delivered: 0, failed: 0 },
  )

  return {
    dashboard: state.dashboard,
    queueSummary: {
      total: queue.length,
      critical: queue.filter((entry) => entry.priorityBand === 'critical').length,
      hot: queue.filter((entry) => entry.priorityBand === 'hot').length,
      recovery: queue.filter((entry) => entry.lane === 'recovery').length,
    },
    outboxSummary,
    laneBreakdown,
    sourceBreakdown,
    connectors,
    onboarding: {
      total: state.onboardingRuns.length,
      completed: state.onboardingRuns.filter((entry) => entry.status === 'provisioned').length,
    },
  }
}

function readLeadByHandle(handle) {
  return db.prepare('SELECT * FROM leads WHERE handle = ?').get(handle)
}

function upsertConversationMessage(leadId, sender, text, intent = 'proof', score = 70, summary = 'Conversation updated by workflow.') {
  const conversationId = ensureConversationForLead(leadId, intent)
  const timestamp = now()
  db.prepare(
    `UPDATE conversations
     SET intent = ?, score = ?, automation_summary = ?, updated_at = ?
     WHERE id = ?`,
  ).run(intent, score, summary, timestamp, conversationId)

  db.prepare(
    `INSERT INTO messages (id, conversation_id, sender, text, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(generateId('msg'), conversationId, sender, text, 'just now', timestamp)

  return conversationId
}

function makeAssetUrl(kind, leadHandle) {
  const slug = String(leadHandle).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
  return `https://assets.cobe.local/${slug}/${kind}`
}

export async function readScenarioTemplates() {
  return Object.values(scenarioTemplates)
}

export async function instantiateScenario(templateId) {
  seedIfNeeded()

  const template = scenarioTemplates[templateId]
  if (!template) {
    return { ok: false, message: 'Scenario template not found.' }
  }

  const leadId = generateId('lead')
  const conversationId = generateId('conv')
  const bookingId = generateId('book')
  const timestamp = now()

  withTransaction(() => {
    if (templateId === 'dm-checkout') {
      const handle = `@dm${leadId.slice(-4)}`
      db.prepare(
        `INSERT INTO leads (
          id, name, handle, source, offer, stage, owner, tags_json, budget,
          next_action, last_touch, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        leadId,
        'Demo DM Lead',
        handle,
        'Instagram DM keyword',
        'Low-ticket sprint',
        'checkout-sent',
        'Alex',
        JSON.stringify(['dm-sprint', 'warm', 'fresh-demo']),
        '$49 low-ticket',
        'Send checkout bump if unpaid after 2 hours.',
        'just now',
        timestamp,
        timestamp,
      )
      db.prepare(
        `INSERT INTO conversations (
          id, lead_id, intent, score, automation_summary, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        conversationId,
        leadId,
        'checkout',
        94,
        'Fresh DM lead qualified and routed to checkout.',
        timestamp,
        timestamp,
      )
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender, text, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(generateId('msg'), conversationId, 'lead', 'send me the checkout link', 'just now', timestamp)
      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        'Stripe',
        'checkout_handoff',
        handle,
        'InitiateCheckout',
        'queued',
        timestamp,
        'Fresh demo checkout queued from scenario instantiation.',
        timestamp,
        timestamp,
      )
      const deliveryId = db.prepare('SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1').get().id
      appendDeliveryAttempt(deliveryId, 'queued', 'Fresh demo checkout queued from scenario instantiation.', timestamp)
    }

    if (templateId === 'consult-recovery') {
      const handle = `@consult${leadId.slice(-4)}`
      db.prepare(
        `INSERT INTO leads (
          id, name, handle, source, offer, stage, owner, tags_json, budget,
          next_action, last_touch, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        leadId,
        'Demo Consult Lead',
        handle,
        'Story reply',
        'Consult call',
        'no-show',
        'Nina',
        JSON.stringify(['consult', 'no-show', 'fresh-demo']),
        '$2.5k consult',
        'Send proof stack and reschedule link.',
        'just now',
        timestamp,
        timestamp,
      )
      db.prepare(
        `INSERT INTO bookings (
          id, lead_id, slot, owner, status, recovery_action, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        bookingId,
        leadId,
        'Today, 4:00 PM',
        'Nina',
        'no-show',
        'Queued recovery voice note and one-click rebook.',
        timestamp,
        timestamp,
      )
      db.prepare(
        `INSERT INTO conversations (
          id, lead_id, intent, score, automation_summary, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        conversationId,
        leadId,
        'call',
        89,
        'Consult request booked and escalated into no-show recovery.',
        timestamp,
        timestamp,
      )
      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        'Make',
        'recovery_sequence',
        handle,
        'NoShowRecovery',
        'processing',
        timestamp,
        'Fresh demo recovery sequence started from scenario instantiation.',
        timestamp,
        timestamp,
      )
      const deliveryId = db.prepare('SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1').get().id
      appendDeliveryAttempt(deliveryId, 'processing', 'Fresh demo recovery sequence started from scenario instantiation.', timestamp)
    }

    if (templateId === 'subscriber-onboarding') {
      const handle = `@sub${leadId.slice(-4)}`
      db.prepare(
        `INSERT INTO leads (
          id, name, handle, source, offer, stage, owner, tags_json, budget,
          next_action, last_touch, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        leadId,
        'Demo Subscriber',
        handle,
        'Typeform application',
        'Subscription',
        'won',
        'Alex',
        JSON.stringify(['subscriber', 'fresh-demo']),
        '$97 monthly',
        'Confirm assets, folder links, and community invite.',
        'just now',
        timestamp,
        timestamp,
      )
      db.prepare(
        `INSERT INTO conversations (
          id, lead_id, intent, score, automation_summary, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        conversationId,
        leadId,
        'proof',
        85,
        'Purchase confirmed and onboarding autopilot triggered.',
        timestamp,
        timestamp,
      )
      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        'Make',
        'onboarding',
        handle,
        'OnboardingAutopilot',
        'queued',
        timestamp,
        'Fresh demo onboarding autopilot queued from scenario instantiation.',
        timestamp,
        timestamp,
      )
      const makeDeliveryId = db.prepare('SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1').get().id
      appendDeliveryAttempt(makeDeliveryId, 'queued', 'Fresh demo onboarding autopilot queued from scenario instantiation.', timestamp)
      db.prepare(
        `INSERT INTO delivery_queue (
          id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('dq'),
        'Meta CAPI',
        'server_events',
        handle,
        'Purchase',
        'queued',
        timestamp,
        'Fresh demo purchase payload queued for Meta server event relay.',
        timestamp,
        timestamp,
      )
      const capiDeliveryId = db.prepare('SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1').get().id
      appendDeliveryAttempt(capiDeliveryId, 'queued', 'Fresh demo purchase payload queued for Meta server event relay.', timestamp)
    }

    insertAuditEntry({
      id: generateId('aud'),
      kind: 'scenario',
      title: 'Scenario instantiated',
      detail: `Instantiated ${template.title}.`,
      target: leadId,
    }, timestamp)
  })

  return {
    ok: true,
    template,
    leadId,
    conversationId,
    snapshot: snapshot(),
  }
}

export async function resetState() {
  withTransaction(() => {
    db.exec(`
      DELETE FROM rule_test_results;
      DELETE FROM live_test_runs;
      DELETE FROM audit_events;
      DELETE FROM operator_notes_history;
      DELETE FROM delivery_attempts;
      DELETE FROM delivery_queue;
      DELETE FROM webhook_history;
      DELETE FROM messages;
      DELETE FROM conversations;
      DELETE FROM connector_states;
      DELETE FROM bookings;
      DELETE FROM onboarding_runs;
      DELETE FROM leads;
    `)
  })
  seedIfNeeded()
  return snapshot()
}

export async function loadState(nextState = {}) {
  const safeState = {
    leadRecords: nextState.leadRecords ?? [],
    bookingRecords: nextState.bookingRecords ?? [],
    conversations: nextState.conversations ?? [],
    webhookHistory: nextState.webhookHistory ?? [],
    connectorStates: nextState.connectorStates ?? {},
    deliveryQueue: nextState.deliveryQueue ?? [],
    deliveryAttempts: nextState.deliveryAttempts ?? [],
    operatorNotesHistory: nextState.operatorNotesHistory ?? [],
    auditEvents: nextState.auditEvents ?? [],
    liveTestRuns: nextState.liveTestRuns ?? [],
    ruleTestResults: nextState.ruleTestResults ?? {},
    onboardingRuns: nextState.onboardingRuns ?? [],
  }

  withTransaction(() => {
    db.exec(`
      DELETE FROM rule_test_results;
      DELETE FROM live_test_runs;
      DELETE FROM audit_events;
      DELETE FROM operator_notes_history;
      DELETE FROM delivery_attempts;
      DELETE FROM delivery_queue;
      DELETE FROM webhook_history;
      DELETE FROM messages;
      DELETE FROM conversations;
      DELETE FROM connector_states;
      DELETE FROM bookings;
      DELETE FROM onboarding_runs;
      DELETE FROM leads;
    `)

    const timestamp = now()

    const insertLead = db.prepare(
      `INSERT INTO leads (
        id, name, handle, source, offer, stage, owner, tags_json, budget,
        next_action, last_touch, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const lead of safeState.leadRecords) {
      insertLead.run(
        lead.id,
        lead.name,
        lead.handle,
        lead.source,
        lead.offer,
        lead.stage,
        lead.owner,
        JSON.stringify(lead.tags ?? []),
        lead.budget,
        lead.nextAction ?? '',
        lead.lastTouch ?? '',
        timestamp,
        timestamp,
      )
    }

    const insertBooking = db.prepare(
      `INSERT INTO bookings (
        id, lead_id, slot, owner, status, recovery_action, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const booking of safeState.bookingRecords) {
      insertBooking.run(
        booking.id,
        booking.leadId,
        booking.slot,
        booking.owner,
        booking.status,
        booking.recoveryAction ?? '',
        timestamp,
        timestamp,
      )
    }

    const insertConversation = db.prepare(
      `INSERT INTO conversations (
        id, lead_id, intent, score, automation_summary, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertMessage = db.prepare(
      `INSERT INTO messages (id, conversation_id, sender, text, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const conversation of safeState.conversations) {
      insertConversation.run(
        conversation.id,
        conversation.leadId,
        conversation.intent,
        conversation.score ?? 0,
        conversation.automationSummary ?? '',
        timestamp,
        timestamp,
      )
      for (const message of conversation.messages ?? []) {
        insertMessage.run(
          message.id,
          conversation.id,
          message.sender,
          message.text,
          message.timestamp ?? timestamp,
          timestamp,
        )
      }
    }

    const insertWebhook = db.prepare(
      `INSERT INTO webhook_history (id, label, payload, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    for (const entry of safeState.webhookHistory) {
      insertWebhook.run(entry.id, entry.label, entry.payload, timestamp)
    }

    const insertConnector = db.prepare(
      `INSERT INTO connector_states (
        name, status, last_ping, runs, note, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const [name, state] of Object.entries(safeState.connectorStates)) {
      insertConnector.run(
        name,
        state.status ?? 'ready',
        state.lastPing ?? timestamp,
        state.runs ?? 0,
        state.note ?? '',
        timestamp,
      )
    }

    const insertDelivery = db.prepare(
      `INSERT INTO delivery_queue (
        id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const entry of safeState.deliveryQueue) {
      insertDelivery.run(
        entry.id,
        entry.connector,
        entry.channel,
        entry.target,
        entry.payloadLabel,
        entry.status,
        entry.lastAttempt ?? timestamp,
        entry.note ?? '',
        timestamp,
        timestamp,
      )
    }

    const insertDeliveryAttempt = db.prepare(
      `INSERT INTO delivery_attempts (id, delivery_id, status, detail, attempted_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    for (const entry of safeState.deliveryAttempts) {
      insertDeliveryAttempt.run(
        entry.id,
        entry.deliveryId,
        entry.status,
        entry.detail ?? '',
        entry.attemptedAt ?? timestamp,
      )
    }

    const insertNote = db.prepare(
      `INSERT INTO operator_notes_history (
        id, note, timestamp, scenario_id, step_label, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const entry of safeState.operatorNotesHistory) {
      insertNote.run(
        entry.id,
        entry.note,
        entry.timestamp ?? timestamp,
        entry.scenarioId ?? 'scenario-unknown',
        entry.stepLabel ?? 'unknown-step',
        timestamp,
      )
    }

    for (const entry of safeState.auditEvents) {
      insertAuditEntry(
        {
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
          detail: entry.detail,
          target: entry.target,
        },
        entry.timestamp ?? timestamp,
      )
    }

    const insertLiveTest = db.prepare(
      `INSERT INTO live_test_runs (
        id, scenario_id, scenario_title, step_label, payload_label, connector, status,
        result_message, payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const entry of safeState.liveTestRuns) {
      insertLiveTest.run(
        entry.id,
        entry.scenarioId ?? 'scenario-unknown',
        entry.scenarioTitle ?? 'Unknown scenario',
        entry.stepLabel ?? 'unknown-step',
        entry.payloadLabel ?? 'Unknown',
        entry.connector ?? 'None',
        entry.status ?? 'unknown',
        entry.resultMessage ?? '',
        entry.payload ?? '{}',
        entry.createdAt ?? timestamp,
      )
    }

    const insertRuleResult = db.prepare(
      `INSERT INTO rule_test_results (rule_id, status, detail, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    for (const [ruleId, entry] of Object.entries(safeState.ruleTestResults)) {
      insertRuleResult.run(
        ruleId,
        entry.status ?? 'unknown',
        entry.detail ?? '',
        entry.timestamp ?? timestamp,
        timestamp,
      )
    }

    const insertOnboarding = db.prepare(
      `INSERT INTO onboarding_runs (
        id, lead_id, status, folder_url, sop_url, invite_url, handoff_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const entry of safeState.onboardingRuns) {
      insertOnboarding.run(
        entry.id,
        entry.leadId,
        entry.status ?? 'provisioned',
        entry.folderUrl ?? '',
        entry.sopUrl ?? '',
        entry.inviteUrl ?? '',
        JSON.stringify(entry.handoffState ?? entry.handoffStates ?? {}),
        entry.createdAt ?? timestamp,
        entry.updatedAt ?? timestamp,
      )
    }
  })

  return snapshot()
}

export async function updateConversation(conversationId, input = {}) {
  seedIfNeeded()

  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId)
  if (!conversation) {
    return { ok: false, message: 'Conversation not found.' }
  }

  const timestamp = now()
  withTransaction(() => {
    db.prepare(
      `UPDATE conversations
       SET intent = ?, score = ?, automation_summary = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      String(input.intent ?? conversation.intent).trim(),
      Number.isFinite(Number(input.score)) ? Number(input.score) : conversation.score,
      String(input.automationSummary ?? conversation.automation_summary).trim(),
      timestamp,
      conversationId,
    )

    insertAuditEntry({
      kind: 'scenario',
      title: 'Conversation updated',
      detail: `Updated conversation ${conversationId}.`,
      target: conversationId,
    }, timestamp)
  })

  return { ok: true, snapshot: snapshot() }
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

  let message = ''

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
      const deliveryId = db.prepare('SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1').get().id
      appendDeliveryAttempt(deliveryId, 'queued', 'Generated checkout handoff from the ops queue.', timestamp)
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'scenario',
        title: 'Checkout queued',
        detail: `Promoted ${lead.handle} into checkout-sent and queued a Stripe handoff.`,
        target: lead.id,
      }, timestamp)
      message = `Queued checkout handoff for ${lead.handle} and staged the Stripe relay.`
    } else if (normalized === 'route') {
      const transition = getConsultWorkflowTransition('booked')
      const owner = resolveConsultOwner({ requestedOwner: 'Nina', leadOwner: lead.owner, bookingOwner: booking?.owner })
      db.prepare(
        `UPDATE leads
         SET owner = ?, stage = ?, next_action = ?, last_touch = ?, updated_at = ?
         WHERE id = ?`,
      ).run(owner, transition.leadStage, transition.nextAction, 'just now', timestamp, leadId)
      if (booking) {
        db.prepare(
          `UPDATE bookings
           SET owner = ?, status = ?, recovery_action = ?, updated_at = ?
           WHERE id = ?`,
        ).run(owner, transition.bookingStatus, transition.recoveryAction, timestamp, booking.id)
      } else {
        db.prepare(
          `INSERT INTO bookings (
            id, lead_id, slot, owner, status, recovery_action, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          generateId('book'),
          lead.id,
          'TBD',
          owner,
          transition.bookingStatus,
          transition.recoveryAction,
          timestamp,
          timestamp,
        )
      }
      enqueueConsultDelivery(lead.handle, transition, timestamp)
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'scenario',
        title: 'Closer assigned',
        detail: `Routed ${lead.handle} to ${owner} and kicked off the consult branch.`,
        target: lead.id,
      }, timestamp)
      message = `Routed ${lead.handle} to ${owner} and started the consult reminder branch.`
    } else if (normalized === 'no-show') {
      const transition = getConsultWorkflowTransition('no-show')
      const owner = resolveConsultOwner({ leadOwner: lead.owner, bookingOwner: booking?.owner })
      db.prepare(
        `UPDATE leads
         SET owner = ?, stage = ?, tags_json = ?, next_action = ?, last_touch = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        owner,
        transition.leadStage,
        JSON.stringify(nextTags('no-show')),
        transition.nextAction,
        'just now',
        timestamp,
        leadId,
      )
      if (booking) {
        db.prepare(
          `UPDATE bookings
           SET owner = ?, status = ?, recovery_action = ?, updated_at = ?
           WHERE id = ?`,
        ).run(owner, transition.bookingStatus, transition.recoveryAction, timestamp, booking.id)
      } else {
        db.prepare(
          `INSERT INTO bookings (
            id, lead_id, slot, owner, status, recovery_action, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          generateId('book'),
          lead.id,
          'TBD',
          owner,
          transition.bookingStatus,
          transition.recoveryAction,
          timestamp,
          timestamp,
        )
      }
      enqueueConsultDelivery(lead.handle, transition, timestamp)
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'scenario',
        title: 'No-show escalated',
        detail: `Moved ${lead.handle} into no-show recovery and queued the sequence.`,
        target: lead.id,
      }, timestamp)
      message = `Marked ${lead.handle} as no-show and queued the recovery sequence.`
    } else if (normalized === 'recover') {
      const transition = getConsultWorkflowTransition('recovered')
      const owner = resolveConsultOwner({ leadOwner: lead.owner, bookingOwner: booking?.owner })
      db.prepare(
        `UPDATE leads
         SET owner = ?, stage = ?, next_action = ?, last_touch = ?, updated_at = ?
         WHERE id = ?`,
      ).run(owner, transition.leadStage, transition.nextAction, 'just now', timestamp, leadId)
      if (booking) {
        db.prepare(
          `UPDATE bookings
           SET owner = ?, status = ?, recovery_action = ?, updated_at = ?
           WHERE id = ?`,
        ).run(owner, transition.bookingStatus, transition.recoveryAction, timestamp, booking.id)
      } else {
        db.prepare(
          `INSERT INTO bookings (
            id, lead_id, slot, owner, status, recovery_action, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          generateId('book'),
          lead.id,
          'TBD',
          owner,
          transition.bookingStatus,
          transition.recoveryAction,
          timestamp,
          timestamp,
        )
      }
      enqueueConsultDelivery(lead.handle, transition, timestamp)
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'scenario',
        title: 'Lead recovered',
        detail: `Recovered ${lead.handle} and prepared reporting payloads for the new booking path.`,
        target: lead.id,
      }, timestamp)
      message = `Recovered ${lead.handle} and prepared downstream reporting payloads.`
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
      const deliveryId = db.prepare('SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1').get().id
      appendDeliveryAttempt(deliveryId, 'delivered', 'Hot lead alert sent to the team for manual assist.', timestamp)
      insertAuditEntry({
        id: generateId('aud'),
        kind: 'connector',
        title: 'Slack alert sent',
        detail: `Pushed a manual assist alert for ${lead.handle}.`,
        target: lead.id,
      }, timestamp)
      message = `Sent a manual assist alert for ${lead.handle}.`
    } else {
      throw new Error('Unsupported lead action.')
    }
  })

  return {
    ok: true,
    message,
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
    appendDeliveryAttempt(
      deliveryId,
      'delivered',
      `${delivery.connector} retried successfully from the outbox.`,
      timestamp,
    )

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
    message: `${delivery.connector} retry succeeded and the relay path is healthy.`,
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
    message: `${name} ping succeeded and relay routing is healthy.`,
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
      const deliveryId = db.prepare('SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1').get().id
      appendDeliveryAttempt(deliveryId, route.status, route.note, timestamp)

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

export async function createLead(input = {}) {
  seedIfNeeded()

  const name = String(input.name || '').trim()
  const handle = String(input.handle || '').trim()
  const source = String(input.source || 'Manual entry').trim()
  const offer = String(input.offer || 'Unknown offer').trim()
  const owner = String(input.owner || 'Unassigned').trim()
  const budget = String(input.budget || 'Unknown budget').trim()

  if (!name || !handle) {
    return { ok: false, message: 'Name and handle are required.' }
  }

  const timestamp = now()
  const leadId = generateId('lead')
  const tags = normalizeTags(input.tags)

  withTransaction(() => {
    db.prepare(
      `INSERT INTO leads (
        id, name, handle, source, offer, stage, owner, tags_json, budget,
        next_action, last_touch, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      leadId,
      name,
      handle,
      source,
      offer,
      input.stage || 'new',
      owner,
      JSON.stringify(tags),
      budget,
      String(input.nextAction || 'Qualify and route'),
      'just now',
      timestamp,
      timestamp,
    )

    const conversationId = ensureConversationForLead(leadId, input.intent || 'pricing')
    if (typeof input.message === 'string' && input.message.trim()) {
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender, text, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(generateId('msg'), conversationId, 'lead', input.message.trim(), 'just now', timestamp)
    }

    insertAuditEntry({
      kind: 'scenario',
      title: 'Lead created',
      detail: `Created lead ${handle} from ${source}.`,
      target: leadId,
    }, timestamp)
  })

  return { ok: true, snapshot: snapshot() }
}

export async function updateLead(leadId, input = {}) {
  seedIfNeeded()

  const lead = readLeadRow(leadId)
  if (!lead) {
    return { ok: false, message: 'Lead not found.' }
  }

  const timestamp = now()
  const nextTags = input.tags === undefined ? json(lead.tags_json, []) : normalizeTags(input.tags)

  withTransaction(() => {
    db.prepare(
      `UPDATE leads
       SET name = ?, handle = ?, source = ?, offer = ?, stage = ?, owner = ?, tags_json = ?,
           budget = ?, next_action = ?, last_touch = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      String(input.name ?? lead.name).trim(),
      String(input.handle ?? lead.handle).trim(),
      String(input.source ?? lead.source).trim(),
      String(input.offer ?? lead.offer).trim(),
      String(input.stage ?? lead.stage).trim(),
      String(input.owner ?? lead.owner).trim(),
      JSON.stringify(nextTags),
      String(input.budget ?? lead.budget).trim(),
      String(input.nextAction ?? lead.next_action).trim(),
      String(input.lastTouch ?? 'just now'),
      timestamp,
      leadId,
    )

    insertAuditEntry({
      kind: 'scenario',
      title: 'Lead updated',
      detail: `Updated ${input.handle ?? lead.handle}.`,
      target: leadId,
    }, timestamp)
  })

  return { ok: true, snapshot: snapshot() }
}

export async function upsertBooking(input = {}) {
  seedIfNeeded()

  const leadId = String(input.leadId || '').trim()
  if (!leadId || !readLeadRow(leadId)) {
    return { ok: false, message: 'Valid leadId is required.' }
  }
  if (input.status !== undefined && !isRecognizedConsultStatus(input.status)) {
    return { ok: false, message: 'Booking status must be booked, reminded, no-show, recovered, rescheduled, or lost.' }
  }

  const timestamp = now()
  const bookingId = String(input.id || '').trim() || generateId('book')
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId)
  const byLead = db.prepare('SELECT * FROM bookings WHERE lead_id = ?').get(leadId)
  const target = existing ?? byLead
  const lead = readLeadRow(leadId)
  const fallbackStatus = target?.status ?? 'booked'
  const transition = getConsultWorkflowTransition(input.status ?? fallbackStatus)
  const owner = resolveConsultOwner({
    requestedOwner: input.owner,
    leadOwner: lead?.owner,
    bookingOwner: target?.owner,
  })
  const recoveryAction = String(
    input.recoveryAction ?? target?.recovery_action ?? transition.recoveryAction,
  ).trim()
  const nextAction = String(input.nextAction ?? transition.nextAction).trim()

  withTransaction(() => {
    db.prepare(
      `UPDATE leads
       SET owner = ?, stage = ?, next_action = ?, last_touch = ?, updated_at = ?
       WHERE id = ?`,
    ).run(owner, transition.leadStage, nextAction, 'just now', timestamp, leadId)

    if (target) {
      db.prepare(
        `UPDATE bookings
         SET slot = ?, owner = ?, status = ?, recovery_action = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        String(input.slot ?? target.slot).trim(),
        owner,
        transition.bookingStatus,
        recoveryAction,
        timestamp,
        target.id,
      )
    } else {
      db.prepare(
        `INSERT INTO bookings (
          id, lead_id, slot, owner, status, recovery_action, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        bookingId,
        leadId,
        String(input.slot || 'TBD').trim(),
        owner,
        transition.bookingStatus,
        recoveryAction,
        timestamp,
        timestamp,
      )
    }

    insertAuditEntry({
      kind: 'scenario',
      title: target ? 'Booking updated' : 'Booking created',
      detail: `${target ? 'Updated' : 'Created'} booking for ${leadId}.`,
      target: target?.id ?? bookingId,
    }, timestamp)
  })

  return { ok: true, snapshot: snapshot() }
}

export async function appendMessage(input = {}) {
  seedIfNeeded()

  const leadId = String(input.leadId || '').trim()
  const text = String(input.text || '').trim()
  const sender = input.sender === 'bot' ? 'bot' : 'lead'

  if (!leadId || !readLeadRow(leadId)) {
    return { ok: false, message: 'Valid leadId is required.' }
  }
  if (!text) {
    return { ok: false, message: 'Message text is required.' }
  }

  const timestamp = now()
  const conversationId = ensureConversationForLead(leadId, input.intent || 'proof')

  withTransaction(() => {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender, text, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('msg'), conversationId, sender, text, String(input.messageTimestamp || 'just now'), timestamp)

    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(timestamp, conversationId)

    insertAuditEntry({
      kind: 'note',
      title: 'Conversation message added',
      detail: `${sender} message appended to ${leadId}.`,
      target: conversationId,
    }, timestamp)
  })

  return { ok: true, snapshot: snapshot() }
}

export async function processDmIntake(input = {}) {
  seedIfNeeded()

  const handle = String(input.handle || '').trim()
  const message = String(input.message || '').trim()
  const source = String(input.source || 'instagram_dm').trim()
  const offer = String(input.offer || 'Low-ticket challenge').trim()

  if (!handle || !message) {
    return { ok: false, message: 'Handle and message are required.' }
  }

  const timestamp = now()
  const lowered = message.toLowerCase()
  const existingLead = readLeadByHandle(handle)
  const inferredIntent = lowered.includes('price') || lowered.includes('link') || lowered.includes('buy')
    ? 'checkout'
    : lowered.includes('call') || lowered.includes('talk')
      ? 'call'
      : 'proof'
  const inferredStage = inferredIntent === 'checkout' ? 'engaged' : inferredIntent === 'call' ? 'booked' : 'new'
  const score = inferredIntent === 'checkout' ? 90 : inferredIntent === 'call' ? 84 : 72

  withTransaction(() => {
    if (!existingLead) {
      const leadId = generateId('lead')
      db.prepare(
        `INSERT INTO leads (
          id, name, handle, source, offer, stage, owner, tags_json, budget,
          next_action, last_touch, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        leadId,
        input.name || handle.replace('@', ''),
        handle,
        source,
        offer,
        inferredStage,
        inferredIntent === 'call' ? 'Nina' : 'Alex',
        JSON.stringify(['dm-intake', inferredIntent]),
        input.budget || 'unknown',
        inferredIntent === 'checkout' ? 'Send checkout link' : inferredIntent === 'call' ? 'Route to closer' : 'Send proof stack',
        'just now',
        timestamp,
        timestamp,
      )
      upsertConversationMessage(
        leadId,
        'lead',
        message,
        inferredIntent,
        score,
        'Inbound DM classified and queued into the funnel.',
      )
      insertAuditEntry({
        kind: 'workflow',
        title: 'DM lead created',
        detail: `Captured ${handle} from ${source} and classified as ${inferredIntent}.`,
        target: leadId,
      }, timestamp)

      recordDeliveryQueueItem({
        connector: 'Meta CAPI',
        channel: 'server_events',
        target: handle,
        payloadLabel: 'Lead',
        status: 'queued',
        note: 'Inbound DM captured and queued for Meta CAPI relay.',
        timestamp,
      })
      insertAuditEntry({
        kind: 'connector',
        title: 'Meta CAPI Lead staged',
        detail: `Queued Lead server event for ${handle}.`,
        target: leadId,
      }, timestamp)

      if (inferredIntent === 'checkout') {
        recordDeliveryQueueItem({
          connector: 'Meta CAPI',
          channel: 'server_events',
          target: handle,
          payloadLabel: 'InitiateCheckout',
          status: 'queued',
          note: 'Checkout intent inferred from DM intake and queued for server-event relay.',
          timestamp,
        })
        insertAuditEntry({
          kind: 'connector',
          title: 'Meta CAPI checkout staged',
          detail: `Queued InitiateCheckout server event for ${handle}.`,
          target: leadId,
        }, timestamp)
      }
    } else {
      db.prepare(
        `UPDATE leads
         SET stage = ?, next_action = ?, last_touch = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        inferredStage,
        inferredIntent === 'checkout' ? 'Send checkout link' : inferredIntent === 'call' ? 'Route to closer' : 'Send proof stack',
        'just now',
        timestamp,
        existingLead.id,
      )
      upsertConversationMessage(
        existingLead.id,
        'lead',
        message,
        inferredIntent,
        score,
        'Inbound DM updated the funnel state.',
      )
      insertAuditEntry({
        kind: 'workflow',
        title: 'DM lead updated',
        detail: `Updated ${handle} from inbound DM and reclassified as ${inferredIntent}.`,
        target: existingLead.id,
      }, timestamp)

      recordDeliveryQueueItem({
        connector: 'Meta CAPI',
        channel: 'server_events',
        target: handle,
        payloadLabel: 'Lead',
        status: 'queued',
        note: 'Inbound DM update captured and queued for Meta CAPI relay.',
        timestamp,
      })
      insertAuditEntry({
        kind: 'connector',
        title: 'Meta CAPI Lead staged',
        detail: `Queued Lead server event for ${handle}.`,
        target: existingLead.id,
      }, timestamp)

      if (inferredIntent === 'checkout') {
        recordDeliveryQueueItem({
          connector: 'Meta CAPI',
          channel: 'server_events',
          target: handle,
          payloadLabel: 'InitiateCheckout',
          status: 'queued',
          note: 'Checkout intent inferred from DM update and queued for server-event relay.',
          timestamp,
        })
        insertAuditEntry({
          kind: 'connector',
          title: 'Meta CAPI checkout staged',
          detail: `Queued InitiateCheckout server event for ${handle}.`,
          target: existingLead.id,
        }, timestamp)
      }
    }
  })

  return { ok: true, snapshot: snapshot() }
}

export async function processStripePayment(input = {}) {
  seedIfNeeded()

  const handle = String(input.handle || '').trim()
  const amount = Number(input.amount || 97)
  const offer = String(input.offer || 'Subscription').trim()
  if (!handle) {
    return { ok: false, message: 'Handle is required.' }
  }

  const lead = readLeadByHandle(handle)
  if (!lead) {
    return { ok: false, message: 'Lead not found for payment.' }
  }

  const timestamp = now()
  withTransaction(() => {
    db.prepare(
      `UPDATE leads
       SET offer = ?, stage = ?, tags_json = ?, budget = ?, next_action = ?, last_touch = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      offer,
      'won',
      JSON.stringify(Array.from(new Set([...json(lead.tags_json, []), 'paid', 'subscriber']))),
      `$${amount} monthly`,
      'Provision onboarding assets and community invite.',
      'just now',
      timestamp,
      lead.id,
    )

    upsertConversationMessage(
      lead.id,
      'bot',
      `Payment confirmed for ${offer}.`,
      'proof',
      88,
      'Stripe payment confirmed and onboarding prepared.',
    )

    db.prepare(
      `INSERT INTO delivery_queue (
        id, connector, channel, target, payload_label, status, last_attempt, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      generateId('dq'),
      'Meta CAPI',
      'server_events',
      handle,
      'Purchase',
      'queued',
      timestamp,
      'Purchase event queued for Meta CAPI relay.',
      timestamp,
      timestamp,
    )
    const deliveryId = db.prepare('SELECT id FROM delivery_queue ORDER BY created_at DESC, id DESC LIMIT 1').get().id
    appendDeliveryAttempt(deliveryId, 'queued', 'Purchase event queued for Meta CAPI relay.', timestamp)

    insertAuditEntry({
      kind: 'workflow',
      title: 'Stripe payment processed',
      detail: `Processed payment for ${handle} and promoted the lead to won.`,
      target: lead.id,
    }, timestamp)
  })

  return { ok: true, snapshot: snapshot() }
}

export async function processBookingWebhook(input = {}) {
  seedIfNeeded()

  const handle = String(input.handle || '').trim()
  const leadId = String(input.leadId || '').trim()
  const status = String(input.status || '').trim()
  const slot = String(input.slot || 'TBD').trim()
  if ((!handle && !leadId) || !status) {
    return { ok: false, message: 'Status and either handle or leadId are required.' }
  }
  if (!isRecognizedConsultStatus(status)) {
    return { ok: false, message: 'Booking status must be booked, reminded, no-show, recovered, rescheduled, or lost.' }
  }

  const lead = leadId ? readLeadRow(leadId) : readLeadByHandle(handle)
  if (!lead) {
    return { ok: false, message: 'Lead not found for booking update.' }
  }

  const timestamp = now()
  const existingBooking = db.prepare('SELECT * FROM bookings WHERE lead_id = ?').get(lead.id)
  const transition = getConsultWorkflowTransition(status, existingBooking?.status ?? 'booked')
  const owner = resolveConsultOwner({
    requestedOwner: input.owner,
    leadOwner: lead.owner,
    bookingOwner: existingBooking?.owner,
  })
  const recoveryAction = String(input.recoveryAction || transition.recoveryAction).trim()
  const nextAction = String(input.nextAction || transition.nextAction).trim()

  withTransaction(() => {
    db.prepare(
      `UPDATE leads
       SET owner = ?, stage = ?, next_action = ?, last_touch = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      owner,
      transition.leadStage,
      nextAction,
      'just now',
      timestamp,
      lead.id,
    )

    if (existingBooking) {
      db.prepare(
        `UPDATE bookings
         SET slot = ?, owner = ?, status = ?, recovery_action = ?, updated_at = ?
         WHERE id = ?`,
      ).run(slot, owner, transition.bookingStatus, recoveryAction, timestamp, existingBooking.id)
    } else {
      db.prepare(
        `INSERT INTO bookings (
          id, lead_id, slot, owner, status, recovery_action, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(generateId('book'), lead.id, slot, owner, transition.bookingStatus, recoveryAction, timestamp, timestamp)
    }

    enqueueConsultDelivery(lead.handle, transition, timestamp)

    insertAuditEntry({
      kind: 'workflow',
      title: 'Booking webhook processed',
      detail: `Processed ${transition.bookingStatus} for ${lead.handle} with owner ${owner}.`,
      target: lead.id,
    }, timestamp)
  })

  return { ok: true, snapshot: snapshot() }
}

export async function provisionOnboarding(input = {}) {
  seedIfNeeded()

  const handle = String(input.handle || '').trim()
  if (!handle) {
    return { ok: false, message: 'Handle is required.' }
  }

  const lead = readLeadByHandle(handle)
  if (!lead) {
    return { ok: false, message: 'Lead not found for onboarding.' }
  }

  const timestamp = now()
  const folderUrl = makeAssetUrl('folder', handle)
  const sopUrl = makeAssetUrl('sop', handle)
  const inviteUrl = makeAssetUrl('community', handle)
  const handoffState = buildOnboardingHandoffState({
    handle,
    folderUrl,
    sopUrl,
    inviteUrl,
    status: 'provisioned',
  })
  const handoffJson = JSON.stringify(handoffState)

  withTransaction(() => {
    const existing = db.prepare('SELECT * FROM onboarding_runs WHERE lead_id = ?').get(lead.id)
    if (existing) {
      db.prepare(
        `UPDATE onboarding_runs
         SET status = ?, folder_url = ?, sop_url = ?, invite_url = ?, handoff_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run('provisioned', folderUrl, sopUrl, inviteUrl, handoffJson, timestamp, existing.id)
    } else {
      db.prepare(
        `INSERT INTO onboarding_runs (
          id, lead_id, status, folder_url, sop_url, invite_url, handoff_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(generateId('onb'), lead.id, 'provisioned', folderUrl, sopUrl, inviteUrl, handoffJson, timestamp, timestamp)
    }

    db.prepare(
      `UPDATE leads
       SET next_action = ?, last_touch = ?, updated_at = ?
       WHERE id = ?`,
    ).run('Onboarding assets provisioned and ready to send.', 'just now', timestamp, lead.id)

    recordDeliveryQueueItem({
      connector: 'Make',
      channel: 'onboarding',
      target: handle,
      payloadLabel: 'OnboardingAutopilot',
      status: 'delivered',
      note: 'Provisioned folder, SOP, and invite assets for the customer.',
      timestamp,
    })
    recordDeliveryQueueItem({
      connector: 'Kajabi',
      channel: 'membership_access',
      target: handle,
      payloadLabel: 'KajabiAccess',
      status: 'queued',
      note: 'Kajabi course access staged with the onboarding handoff.',
      timestamp,
    })
    recordDeliveryQueueItem({
      connector: 'Skool',
      channel: 'community_invite',
      target: handle,
      payloadLabel: 'SkoolInvite',
      status: 'queued',
      note: 'Skool community invite staged with the onboarding handoff.',
      timestamp,
    })
    recordDeliveryQueueItem({
      connector: 'Discord',
      channel: 'community_alert',
      target: handle,
      payloadLabel: 'DiscordPulse',
      status: 'processing',
      note: 'Discord community alert staged for the onboarding handoff.',
      timestamp,
    })

    insertAuditEntry({
      kind: 'workflow',
      title: 'Onboarding provisioned',
      detail: `Provisioned onboarding assets for ${handle}.`,
      target: lead.id,
    }, timestamp)
  })

  return { ok: true, snapshot: snapshot() }
}

export async function readDeliveryHistory(deliveryId) {
  seedIfNeeded()

  const delivery = db.prepare('SELECT * FROM delivery_queue WHERE id = ?').get(deliveryId)
  if (!delivery) {
    return { ok: false, message: 'Delivery not found.' }
  }

  const attempts = db
    .prepare('SELECT * FROM delivery_attempts WHERE delivery_id = ? ORDER BY attempted_at DESC, id DESC')
    .all(deliveryId)
    .map((row) => ({
      id: row.id,
      deliveryId: row.delivery_id,
      status: row.status,
      detail: row.detail,
      attemptedAt: row.attempted_at,
    }))

  return { ok: true, deliveryId, attempts }
}
