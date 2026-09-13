// Author/creator: nattapat2871 (https://nattapat2871.me)

export const WINDOWS_BUNDLE_UPDATE_SCHEMA = 1 as const

export type WindowsBundleUpdateState =
  | 'verifying'
  | 'ready'
  | 'applying'
  | 'restarting'
  | 'healthy'
  | 'rolled-back'
  | 'failed'

export type WindowsBundleUpdateExpectation = {
  attemptId: string
  nonce: string
  helperPid: number
}

export type WindowsBundleUpdateStatus = WindowsBundleUpdateExpectation & {
  schemaVersion: typeof WINDOWS_BUNDLE_UPDATE_SCHEMA
  state: WindowsBundleUpdateState
  detail: string
  at: string
  launcherPid?: number
}

export type WindowsBundleHealthExpectation = Pick<WindowsBundleUpdateExpectation, 'attemptId' | 'nonce'> & {
  version: string
  launcherPid?: number
}

export type WindowsBundleHealth = {
  schemaVersion: typeof WINDOWS_BUNDLE_UPDATE_SCHEMA
  attemptId: string
  nonce: string
  version: string
  launcherPid: number
  at: string
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NONCE_PATTERN = /^[0-9a-f]{64}$/i
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/
const STATES = new Set<WindowsBundleUpdateState>([
  'verifying',
  'ready',
  'applying',
  'restarting',
  'healthy',
  'rolled-back',
  'failed'
])

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value && typeof value === 'object' && !Array.isArray(value)
)

export const isWindowsBundleVersion = (value: string) => VERSION_PATTERN.test(value)

export const getWindowsBundleFileName = (version: string) => {
  if (!isWindowsBundleVersion(version)) throw new Error('Invalid Windows application bundle version.')
  return `NamLauncher-${version}-Windows-x64.zip`
}

export const shouldUseWindowsApplicationBundle = (
  installScope: 'all-users' | 'current-user' | null,
  bundleUrl: string | null | undefined,
  bundleSha256: string | null | undefined
) => installScope === 'current-user' && Boolean(bundleUrl && bundleSha256)

export const normalizeWindowsBundleUpdateStatus = (
  value: unknown,
  expected: WindowsBundleUpdateExpectation
): WindowsBundleUpdateStatus | null => {
  if (!isRecord(value)) return null
  const state = value.state
  if (
    value.schemaVersion !== WINDOWS_BUNDLE_UPDATE_SCHEMA
    || typeof value.attemptId !== 'string'
    || !UUID_V4_PATTERN.test(value.attemptId)
    || value.attemptId !== expected.attemptId
    || typeof value.nonce !== 'string'
    || !NONCE_PATTERN.test(value.nonce)
    || value.nonce !== expected.nonce
    || !Number.isSafeInteger(value.helperPid)
    || Number(value.helperPid) < 1
    || value.helperPid !== expected.helperPid
    || typeof state !== 'string'
    || !STATES.has(state as WindowsBundleUpdateState)
    || typeof value.detail !== 'string'
    || value.detail.length > 1_000
    || typeof value.at !== 'string'
    || !Number.isFinite(Date.parse(value.at))
  ) return null

  if (value.launcherPid !== undefined && (!Number.isSafeInteger(value.launcherPid) || Number(value.launcherPid) < 1)) {
    return null
  }

  return {
    schemaVersion: WINDOWS_BUNDLE_UPDATE_SCHEMA,
    attemptId: value.attemptId,
    nonce: value.nonce,
    helperPid: value.helperPid as number,
    state: state as WindowsBundleUpdateState,
    detail: value.detail,
    at: value.at,
    ...(value.launcherPid === undefined ? {} : { launcherPid: value.launcherPid as number })
  }
}

export const normalizeWindowsBundleHealth = (
  value: unknown,
  expected: WindowsBundleHealthExpectation
): WindowsBundleHealth | null => {
  if (!isRecord(value)) return null
  if (
    value.schemaVersion !== WINDOWS_BUNDLE_UPDATE_SCHEMA
    || typeof value.attemptId !== 'string'
    || !UUID_V4_PATTERN.test(value.attemptId)
    || value.attemptId !== expected.attemptId
    || typeof value.nonce !== 'string'
    || !NONCE_PATTERN.test(value.nonce)
    || value.nonce !== expected.nonce
    || typeof value.version !== 'string'
    || !VERSION_PATTERN.test(value.version)
    || value.version !== expected.version
    || !Number.isSafeInteger(value.launcherPid)
    || Number(value.launcherPid) < 1
    || (expected.launcherPid !== undefined && value.launcherPid !== expected.launcherPid)
    || typeof value.at !== 'string'
    || !Number.isFinite(Date.parse(value.at))
  ) return null

  return {
    schemaVersion: WINDOWS_BUNDLE_UPDATE_SCHEMA,
    attemptId: value.attemptId,
    nonce: value.nonce,
    version: value.version,
    launcherPid: value.launcherPid as number,
    at: value.at
  }
}
