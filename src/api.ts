export type ApiSnapshot = {
  leadRecords: unknown[]
  bookingRecords: unknown[]
  webhookHistory: unknown[]
  connectorStates: Record<string, unknown>
  deliveryQueue: unknown[]
  operatorNotesHistory: unknown[]
  auditEvents: unknown[]
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || 'Request failed.')
  }

  return data
}

export async function fetchBootstrap() {
  return request('/api/bootstrap')
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
