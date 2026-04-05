import { createHmac, timingSafeEqual } from 'node:crypto'

const LOCAL_BYPASS_ENV = 'ALLOW_LOCAL_ADMIN_BYPASS'
const defaultSecret = 'local-dev-session-secret'
const defaultUser = process.env.ADMIN_USERNAME?.trim() || 'operator'
const defaultPassword = process.env.ADMIN_PASSWORD?.trim() || 'operator'
const configuredSecret = process.env.ADMIN_SESSION_SECRET?.trim()
const secret = configuredSecret || defaultSecret
const ttlSeconds = Number(process.env.ADMIN_SESSION_TTL_SECONDS || 60 * 60 * 8)
const sessionCookieName = process.env.ADMIN_SESSION_COOKIE_NAME?.trim() || 'cobe_admin_session'
const secureCookie =
  process.env.ADMIN_SESSION_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'

function sign(payload) {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`]

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`)
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }
  if (options.path) {
    parts.push(`Path=${options.path}`)
  }
  if (options.httpOnly) {
    parts.push('HttpOnly')
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`)
  }
  if (options.secure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

function parseCookieHeader(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex === -1) {
        return cookies
      }

      const name = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1).trim()
      cookies[name] = decodeURIComponent(value)
      return cookies
    }, {})
}

export function isLocalAdminBypassEnabled() {
  return process.env[LOCAL_BYPASS_ENV] === 'true' && process.env.NODE_ENV !== 'production'
}

export function assertAdminAuthConfiguration() {
  if (isLocalAdminBypassEnabled()) {
    return
  }

  const missing = []

  if (!process.env.ADMIN_USERNAME?.trim()) {
    missing.push('ADMIN_USERNAME')
  }
  if (!process.env.ADMIN_PASSWORD?.trim() || process.env.ADMIN_PASSWORD?.trim() === 'replace_me') {
    missing.push('ADMIN_PASSWORD')
  }
  if (!configuredSecret || configuredSecret === 'replace_me' || configuredSecret === defaultSecret) {
    missing.push('ADMIN_SESSION_SECRET')
  }

  if (missing.length > 0) {
    throw new Error(
      `Admin auth is not configured. Set ${missing.join(', ')} or enable ${LOCAL_BYPASS_ENV}=true for explicit local-only bypass.`,
    )
  }
}

export function authenticateAdmin(username, password) {
  return username === defaultUser && password === defaultPassword
}

export function createAdminSessionToken(username = defaultUser) {
  const payload = JSON.stringify({
    sub: username,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  })
  const encoded = toBase64Url(payload)
  const signature = sign(encoded)
  return `${encoded}.${signature}`
}

export function verifyAdminSessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, message: 'Missing session token.' }
  }

  const [encoded, providedSignature] = token.split('.', 2)
  const expectedSignature = sign(encoded)

  const validSignature =
    providedSignature &&
    providedSignature.length === expectedSignature.length &&
    timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))

  if (!validSignature) {
    return { ok: false, message: 'Invalid session signature.' }
  }

  let payload
  try {
    payload = JSON.parse(fromBase64Url(encoded))
  } catch {
    return { ok: false, message: 'Invalid session payload.' }
  }

  if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, message: 'Session expired.' }
  }

  return {
    ok: true,
    session: payload,
  }
}

export function createAdminSessionCookie(token) {
  return serializeCookie(sessionCookieName, encodeURIComponent(token), {
    httpOnly: true,
    maxAge: ttlSeconds,
    path: '/',
    sameSite: 'Lax',
    secure: secureCookie,
  })
}

export function clearAdminSessionCookie() {
  return serializeCookie(sessionCookieName, '', {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'Lax',
    secure: secureCookie,
  })
}

export function readAdminSessionToken(request) {
  const authHeader = request.header('authorization')?.trim()
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null
  const sessionHeader = request.header('x-session-token')?.trim()
  const cookies = parseCookieHeader(request.header('cookie') || '')
  const cookieToken = cookies[sessionCookieName] || null

  return cookieToken || bearerToken || sessionHeader || null
}

export function readTrustedAccessSession(request) {
  const email =
    request.header('cf-access-authenticated-user-email')?.trim() ||
    request.header('x-auth-request-email')?.trim() ||
    request.header('x-forwarded-email')?.trim() ||
    ''

  if (!email) {
    return null
  }

  const name =
    request.header('cf-access-authenticated-user-name')?.trim() ||
    request.header('x-auth-request-user')?.trim() ||
    email

  return {
    sub: email,
    name,
    provider: 'cloudflare-access',
    access: true,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
}

export function createLocalBypassSession() {
  return {
    sub: defaultUser,
    bypass: true,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
}

export { LOCAL_BYPASS_ENV, sessionCookieName }
