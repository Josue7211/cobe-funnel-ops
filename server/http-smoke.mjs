import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const port = 8794
const baseUrl = `http://127.0.0.1:${port}`
const repoDir = fileURLToPath(new URL('..', import.meta.url))
const smokeAdmin = {
  username: 'operator',
  password: 'operator-demo-pass',
  secret: 'smoke-session-secret',
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with code ${code}\n${stdout}\n${stderr}`.trim(),
        ),
      )
    })
  })
}

async function readUntilEvent(reader, timeoutMs = 3000) {
  const started = Date.now()
  let buffer = ''

  while (Date.now() - started < timeoutMs) {
    const result = await Promise.race([
      reader.read(),
      sleep(250).then(() => ({ timeout: true })),
    ])

    if (result?.timeout) {
      continue
    }

    if (result.done) {
      break
    }

    buffer += Buffer.from(result.value).toString('utf8')
    if (buffer.includes('event:')) {
      return buffer
    }
  }

  throw new Error('No SSE event received before timeout.')
}

async function waitForHealth(timeoutMs = 10_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) {
        return
      }
    } catch {}
    await sleep(200)
  }
  throw new Error('HTTP smoke server did not become ready in time.')
}

function readSetCookie(response) {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('Expected Set-Cookie header to be present.')
  }

  return setCookie.split(';', 1)[0]
}

async function main() {
  await runCommand('npm', ['run', 'build'])

  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoDir,
    env: {
      ...process.env,
      PORT: String(port),
      REMOTE_SYNC_POLL_MS: '1000',
      ALLOW_LOCAL_ADMIN_BYPASS: 'false',
      ADMIN_USERNAME: smokeAdmin.username,
      ADMIN_PASSWORD: smokeAdmin.password,
      ADMIN_SESSION_SECRET: smokeAdmin.secret,
      ADMIN_SESSION_COOKIE_SECURE: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  try {
    await waitForHealth()

    const appShell = await fetch(baseUrl)
    assert.equal(appShell.ok, true)
    assert.match(appShell.headers.get('content-type') || '', /text\/html/i)
    const appShellHtml = await appShell.text()
    assert.match(appShellHtml, /<html/i)

    const queue = await fetch(`${baseUrl}/api/queue?limit=2`).then((response) => response.json())
    assert.equal(Array.isArray(queue), true)
    assert.ok(queue.length >= 1)

    const reports = await fetch(`${baseUrl}/api/reports/overview`).then((response) => response.json())
    assert.ok(reports.dashboard)
    assert.equal(typeof reports.outboxSummary.failed, 'number')
    assert.ok(reports.outboxSummary.total >= reports.outboxSummary.failed)

    const syncStatus = await fetch(`${baseUrl}/api/sync/status`).then((response) => response.json())
    assert.equal(typeof syncStatus.configured, 'boolean')

    const unauthenticatedMutation = await fetch(`${baseUrl}/api/workflows/dm-intake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        handle: '@workflowdm',
        message: 'price and link?',
        source: 'instagram_dm',
      }),
    })
    assert.equal(unauthenticatedMutation.status, 401)
    const unauthenticatedBody = await unauthenticatedMutation.json()
    assert.equal(unauthenticatedBody.ok, false)

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(smokeAdmin),
    })
    assert.equal(loginResponse.status, 200)
    const loginCookie = readSetCookie(loginResponse)
    const login = await loginResponse.json()
    assert.equal(login.ok, true)
    assert.ok(login.token)

    const session = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: loginCookie },
    }).then((response) => response.json())
    assert.equal(session.ok, true)

    const conflicts = await fetch(`${baseUrl}/api/sync/conflicts`).then((response) => response.json())
    assert.equal(conflicts.ok, true)

    if (syncStatus.configured && syncStatus.remote?.found) {
      const diff = await fetch(`${baseUrl}/api/sync/diff`).then((response) => response.json())
      assert.equal(diff.ok, true)
    } else {
      const diffResponse = await fetch(`${baseUrl}/api/sync/diff`)
      assert.equal(diffResponse.status, 400)
      const diff = await diffResponse.json()
      assert.equal(diff.ok, false)
    }

    const slack = await fetch(`${baseUrl}/api/exports/slack`).then((response) => response.json())
    assert.equal(slack.channel, '#ops-alerts')

    if (syncStatus.configured && syncStatus.mirror && !('error' in syncStatus.mirror)) {
      const remoteLeads = await fetch(`${baseUrl}/api/remote/leads`).then((response) => response.json())
      assert.equal(remoteLeads.ok, true)
      assert.ok(Array.isArray(remoteLeads.rows))
    } else {
      const remoteLeadsResponse = await fetch(`${baseUrl}/api/remote/leads`)
      assert.equal(remoteLeadsResponse.status, 400)
      const remoteLeads = await remoteLeadsResponse.json()
      assert.equal(remoteLeads.ok, false)
    }

    if (syncStatus.configured && syncStatus.remote?.found) {
      const push = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: { Cookie: loginCookie },
      }).then((response) => response.json())
      assert.equal(push.ok, true)
      assert.ok(push.mirror)

      const reconcile = await fetch(`${baseUrl}/api/sync/reconcile`, {
        method: 'POST',
        headers: {
          Cookie: loginCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ strategy: 'merge-prefer-local' }),
      }).then((response) => response.json())
      assert.equal(reconcile.ok, true)
    } else {
      const pushResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: { Cookie: loginCookie },
      })
      assert.equal(pushResponse.status, 400)
      const push = await pushResponse.json()
      assert.equal(push.ok, false)

      const reconcileResponse = await fetch(`${baseUrl}/api/sync/reconcile`, {
        method: 'POST',
        headers: {
          Cookie: loginCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ strategy: 'merge-prefer-local' }),
      })
      assert.equal(reconcileResponse.status, 400)
      const reconcile = await reconcileResponse.json()
      assert.equal(reconcile.ok, false)
    }

    const dmIntake = await fetch(`${baseUrl}/api/workflows/dm-intake`, {
      method: 'POST',
      headers: {
        Cookie: loginCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        handle: '@workflowdm',
        message: 'price and link?',
        source: 'instagram_dm',
      }),
    }).then((response) => response.json())
    assert.equal(dmIntake.ok, true)
    const dmLeadRelay = dmIntake.snapshot.deliveryQueue.find(
      (entry) =>
        entry.connector === 'Meta CAPI' &&
        entry.channel === 'server_events' &&
        entry.target === '@workflowdm' &&
        entry.payloadLabel === 'Lead',
    )
    assert.ok(dmLeadRelay)
    const dmCheckoutRelay = dmIntake.snapshot.deliveryQueue.find(
      (entry) =>
        entry.connector === 'Meta CAPI' &&
        entry.channel === 'server_events' &&
        entry.target === '@workflowdm' &&
        entry.payloadLabel === 'InitiateCheckout',
    )
    assert.ok(dmCheckoutRelay)

    const payment = await fetch(`${baseUrl}/api/workflows/stripe-payment`, {
      method: 'POST',
      headers: {
        Cookie: loginCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        handle: '@workflowdm',
        amount: 97,
        offer: 'Subscription',
      }),
      }).then((response) => response.json())
    assert.equal(payment.ok, true)
    const workflowLead = payment.snapshot.leadRecords.find((entry) => entry.handle === '@workflowdm')
    assert.ok(workflowLead)
    const paymentRelay = payment.snapshot.deliveryQueue.find(
      (entry) =>
        entry.connector === 'Meta CAPI' &&
        entry.channel === 'server_events' &&
        entry.target === '@workflowdm' &&
        entry.payloadLabel === 'Purchase',
    )
    assert.ok(paymentRelay)

    let booking = null
    for (const status of ['booked', 'no-show', 'recovered', 'rescheduled']) {
      booking = await fetch(`${baseUrl}/api/workflows/booking-update`, {
        method: 'POST',
        headers: {
          Cookie: loginCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          handle: '@evanbuilds',
          status,
          slot: 'Today, 2:30 PM',
        }),
      }).then((response) => response.json())
      assert.equal(booking.ok, true)
    }

    const replayedLead = booking.snapshot.leadRecords.find((entry) => entry.handle === '@evanbuilds')
    assert.ok(replayedLead)
    assert.equal(replayedLead.stage, 'booked')
    const replayedBookings = booking.snapshot.bookingRecords.filter(
      (entry) => entry.leadId === replayedLead.id,
    )
    assert.equal(replayedBookings.length, 1)
    assert.equal(replayedBookings[0].status, 'rescheduled')

    const onboarding = await fetch(`${baseUrl}/api/workflows/onboarding/provision`, {
      method: 'POST',
      headers: {
        Cookie: loginCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        handle: '@workflowdm',
      }),
    }).then((response) => response.json())
    assert.equal(onboarding.ok, true)
    const onboardingRun = onboarding.snapshot.onboardingRuns.find((entry) => entry.leadId === workflowLead.id)
    assert.ok(onboardingRun)
    assert.equal(onboardingRun.status, 'provisioned')
    assert.ok(onboardingRun.folderUrl.includes('assets.cobe.local'))
    assert.ok(onboardingRun.folderUrl.endsWith('/folder'))
    assert.ok(onboardingRun.sopUrl.includes('assets.cobe.local'))
    assert.ok(onboardingRun.sopUrl.endsWith('/sop'))
    assert.ok(onboardingRun.inviteUrl.includes('assets.cobe.local'))
    assert.ok(onboardingRun.inviteUrl.endsWith('/community'))
    assert.ok(onboardingRun.handoffState)
    assert.equal(onboardingRun.handoffState.status, 'provisioned')
    assert.ok(Array.isArray(onboardingRun.handoffState.destinations))
    assert.ok(
      onboardingRun.handoffState.destinations.some(
        (entry) => entry.name === 'Kajabi' && entry.url.includes('/kajabi'),
      ),
    )
    assert.ok(
      onboardingRun.handoffState.destinations.some(
        (entry) => entry.name === 'Skool' && entry.url.includes('/skool'),
      ),
    )
    assert.ok(
      onboardingRun.handoffState.destinations.some(
        (entry) => entry.name === 'Discord' && entry.url.includes('/discord'),
      ),
    )
    const onboardingDelivery = onboarding.snapshot.deliveryQueue.find(
      (entry) => entry.connector === 'Make' && entry.channel === 'onboarding' && entry.target === '@workflowdm',
    )
    assert.ok(onboardingDelivery)
    const kajabiDelivery = onboarding.snapshot.deliveryQueue.find(
      (entry) => entry.connector === 'Kajabi' && entry.channel === 'membership_access' && entry.target === '@workflowdm',
    )
    assert.ok(kajabiDelivery)
    const skoolDelivery = onboarding.snapshot.deliveryQueue.find(
      (entry) => entry.connector === 'Skool' && entry.channel === 'community_invite' && entry.target === '@workflowdm',
    )
    assert.ok(skoolDelivery)
    const discordDelivery = onboarding.snapshot.deliveryQueue.find(
      (entry) => entry.connector === 'Discord' && entry.channel === 'community_alert' && entry.target === '@workflowdm',
    )
    assert.ok(discordDelivery)

    const stream = await fetch(`${baseUrl}/api/realtime/stream`, {
      headers: {
        accept: 'text/event-stream',
        Cookie: loginCookie,
      },
    })
    const reader = stream.body.getReader()

    await fetch(`${baseUrl}/api/scenarios/dm-checkout/instantiate`, {
      method: 'POST',
      headers: { Cookie: loginCookie },
    })

    const eventText = await readUntilEvent(reader)
    assert.ok(eventText.includes('event:'))
    reader.cancel().catch(() => {})

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: loginCookie },
    })
    assert.equal(logoutResponse.status, 200)
    const clearedCookie = readSetCookie(logoutResponse)
    assert.match(clearedCookie, /^cobe_admin_session=/)

    const postLogoutSession = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: clearedCookie },
    })
    assert.equal(postLogoutSession.status, 401)

    const postLogoutMutation = await fetch(`${baseUrl}/api/workflows/dm-intake`, {
      method: 'POST',
      headers: {
        Cookie: clearedCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        handle: '@loggedout',
        message: 'any update?',
        source: 'instagram_dm',
      }),
    })
    assert.equal(postLogoutMutation.status, 401)
    const postLogoutBody = await postLogoutMutation.json()
    assert.equal(postLogoutBody.ok, false)

    console.log('http smoke: ok')
  } finally {
    child.kill('SIGTERM')
    await sleep(200)
    if (stderr.trim()) {
      process.stderr.write(stderr)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
