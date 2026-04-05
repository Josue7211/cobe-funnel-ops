import { EventEmitter } from 'node:events'

const emitter = new EventEmitter()
emitter.setMaxListeners(100)

const clients = new Set()
let eventCount = 0
let lastEventAt = null

function writeEvent(response, event, data) {
  response.write(`event: ${event}\n`)
  response.write(`data: ${JSON.stringify(data)}\n\n`)
}

export function publishRealtime(event, data) {
  eventCount += 1
  lastEventAt = new Date().toISOString()
  emitter.emit(event, data)
  emitter.emit('message', { event, data })
  for (const client of clients) {
    writeEvent(client, event, data)
  }
}

export function attachRealtimeStream(request, response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  response.write(': connected\n\n')
  clients.add(response)

  const heartbeat = setInterval(() => {
    response.write(': heartbeat\n\n')
  }, 15_000)

  request.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(response)
  })
}

export function getRealtimeStats() {
  return {
    clients: clients.size,
    connected: clients.size > 0,
    eventCount,
    lastEventAt,
  }
}

export { emitter }
