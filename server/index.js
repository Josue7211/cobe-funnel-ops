import cors from 'cors'
import express from 'express'
import {
  logNote,
  pingConnector,
  readState,
  resetState,
  retryDelivery,
  runLeadAction,
  runLiveTest,
  validateWebhook,
} from './store.js'

const app = express()
const port = Number(process.env.PORT || 8787)

app.use(cors())
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/state', async (_request, response) => {
  const state = await readState()
  response.json(state)
})

app.get('/api/bootstrap', async (_request, response) => {
  const state = await readState()
  response.json(state)
})

app.post('/api/reset', async (_request, response) => {
  response.json(await resetState())
})

app.post('/api/webhooks/validate', async (request, response) => {
  const result = await validateWebhook(request.body.payload)
  return result.ok ? response.json(result) : response.status(400).json(result)
})

app.post('/api/tests/run', async (request, response) => {
  const result = await runLiveTest(request.body ?? {})
  return result.ok ? response.json(result) : response.status(400).json(result)
})

app.post('/api/leads/:leadId/actions', async (request, response) => {
  const result = await runLeadAction(request.params.leadId, request.body.action)
  return result.ok ? response.json(result) : response.status(400).json(result)
})

app.post('/api/deliveries/:deliveryId/retry', async (request, response) => {
  const result = await retryDelivery(request.params.deliveryId)
  return result.ok ? response.json(result) : response.status(400).json(result)
})

app.post('/api/connectors/:name/ping', async (request, response) => {
  const result = await pingConnector(decodeURIComponent(request.params.name))
  return result.ok ? response.json(result) : response.status(400).json(result)
})

app.post('/api/notes', async (request, response) => {
  const result = await logNote(request.body ?? {})
  return result.ok ? response.json(result) : response.status(400).json(result)
})

app.listen(port, () => {
  console.log(`cobe-funnel-ops api listening on http://localhost:${port}`)
})
