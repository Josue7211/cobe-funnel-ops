import assert from 'node:assert/strict'
import {
  appendMessage,
  createLead,
  instantiateScenario,
  readDeliveryHistory,
  readLeadTimeline,
  readQueue,
  readReports,
  readScenarioTemplates,
  resetState,
  retryDelivery,
  updateConversation,
  updateLead,
  upsertBooking,
} from './store.js'

async function main() {
  const seeded = await resetState()
  assert.equal(seeded.leadRecords.length, 6)
  assert.equal(seeded.conversations.length, 6)

  const created = await createLead({
    name: 'Smoke Lead',
    handle: '@smokelead',
    source: 'Manual',
    offer: 'Consult',
    owner: 'Alex',
    budget: '500',
    tags: ['smoke', 'manual'],
    message: 'Need details',
  })
  assert.equal(created.ok, true)

  const lead = created.snapshot.leadRecords.find((entry) => entry.handle === '@smokelead')
  assert.ok(lead)

  const updatedLead = await updateLead(lead.id, {
    stage: 'engaged',
    nextAction: 'Follow up in 10m',
  })
  assert.equal(updatedLead.ok, true)
  assert.equal(
    updatedLead.snapshot.leadRecords.find((entry) => entry.id === lead.id)?.stage,
    'engaged',
  )

  const booked = await upsertBooking({
    leadId: lead.id,
    slot: 'Tomorrow 4 PM',
    owner: 'Alex',
    status: 'booked',
    recoveryAction: 'Reminder queued',
  })
  assert.equal(booked.ok, true)
  assert.equal(booked.snapshot.bookingRecords.find((entry) => entry.leadId === lead.id)?.slot, 'Tomorrow 4 PM')

  const conversation = booked.snapshot.conversations.find((entry) => entry.leadId === lead.id)
  assert.ok(conversation)

  const updatedConversation = await updateConversation(conversation.id, {
    score: 98,
    automationSummary: 'Updated in smoke test.',
  })
  assert.equal(updatedConversation.ok, true)
  assert.equal(
    updatedConversation.snapshot.conversations.find((entry) => entry.id === conversation.id)?.score,
    98,
  )

  const appended = await appendMessage({
    leadId: lead.id,
    sender: 'bot',
    text: 'Here is the breakdown.',
  })
  assert.equal(appended.ok, true)
  assert.equal(
    appended.snapshot.conversations.find((entry) => entry.leadId === lead.id)?.messages.length,
    2,
  )

  const delivery = appended.snapshot.deliveryQueue[0]
  assert.ok(delivery)

  const historyBefore = await readDeliveryHistory(delivery.id)
  assert.equal(historyBefore.ok, true)
  assert.ok(historyBefore.attempts.length >= 1)

  const retried = await retryDelivery(delivery.id)
  assert.equal(retried.ok, true)

  const historyAfter = await readDeliveryHistory(delivery.id)
  assert.equal(historyAfter.ok, true)
  assert.equal(historyAfter.attempts[0].deliveryId, delivery.id)
  assert.ok(historyAfter.attempts.length > historyBefore.attempts.length)

  const queue = await readQueue({ owner: 'Alex' })
  assert.ok(queue.length >= 1)
  assert.ok(queue.every((entry) => entry.owner.includes('Alex')))

  const timeline = await readLeadTimeline(lead.id)
  assert.equal(timeline.ok, true)
  assert.ok(timeline.events.length >= 3)

  const reports = await readReports()
  assert.ok(reports.queueSummary.total >= 1)
  assert.ok(Array.isArray(reports.connectors))

  const templates = await readScenarioTemplates()
  assert.ok(templates.length >= 3)

  const scenario = await instantiateScenario('dm-checkout')
  assert.equal(scenario.ok, true)
  assert.ok(scenario.snapshot.leadRecords.length >= 4)

  await resetState()
  console.log('backend smoke: ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
