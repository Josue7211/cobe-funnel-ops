import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedState } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dataFile = path.join(dataDir, 'runtime.json')

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true })

  try {
    await fs.access(dataFile)
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(seedState, null, 2))
  }
}

export async function readState() {
  await ensureStore()
  const raw = await fs.readFile(dataFile, 'utf8')
  return JSON.parse(raw)
}

export async function writeState(state) {
  await ensureStore()
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2))
  return state
}

export async function resetState() {
  await writeState(seedState)
  return seedState
}
