// Author/creator: nattapat2871 (https://nattapat2871.me)
import type { AccountSummary, LaunchRequest, StoredAccount } from '../main.ts'

type AccountServiceDependencies = {
  [key: string]: any
  readonly mainWindow: any
}

export const createAccountService = (deps: AccountServiceDependencies) => {
  const {
    canEncryptAccountAuth, safeStorage, log, readJsonFile, accountsPath, writeJsonFile, crypto,
    isOfflineUsernameValidationError, msmc, sendProgress, redactSensitiveText
  } = deps

  const encodeStoredAccount = (account: StoredAccount) => {
    const payload: Record<string, unknown> = {
      id: account.id,
      uuid: account.uuid,
      name: account.name,
      type: account.type,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    }

    if (account.type === 'msa') {
      if (!canEncryptAccountAuth()) {
        throw new Error('Microsoft account secure storage is unavailable. Configure an operating-system keyring and try again.')
      }
      try {
        payload.authEncrypted = safeStorage.encryptString(JSON.stringify(account.auth)).toString('base64')
        return payload
      } catch (err) {
        log.warn(`Could not encrypt Microsoft account data for ${account.name}.`, err)
        throw new Error('Microsoft account credentials could not be encrypted securely.')
      }
    }

    // Offline authorization contains no reusable Microsoft credential.
    payload.auth = account.auth
    return payload
  }

  const decodeStoredAccount = (raw: any): StoredAccount | null => {
    if (!raw || typeof raw !== 'object') return null

    const accountType = raw.type === 'offline' ? 'offline' : 'msa'
    let auth = accountType === 'offline' ? raw.auth : undefined
    if (typeof raw.authEncrypted === 'string' && raw.authEncrypted.trim()) {
      if (!canEncryptAccountAuth()) return null
      try {
        auth = JSON.parse(safeStorage.decryptString(Buffer.from(raw.authEncrypted, 'base64')))
      } catch (err) {
        log.warn(`Could not decrypt stored account ${String(raw.name || raw.id || 'unknown')}.`, err)
        return null
      }
    } else if (accountType === 'msa' && canEncryptAccountAuth() && raw.auth) {
      // Read a legacy plaintext record only while the startup migration can encrypt it immediately.
      auth = raw.auth
    }

    if (!auth) return null

    return {
      id: String(raw.id || ''),
      uuid: String(raw.uuid || ''),
      name: String(raw.name || ''),
      type: accountType,
      auth,
      createdAt: String(raw.createdAt || new Date().toISOString()),
      updatedAt: String(raw.updatedAt || new Date().toISOString())
    }
  }

  const readAccounts = (): StoredAccount[] => {
    const accounts = readJsonFile(accountsPath, []) as any[]
    return Array.isArray(accounts)
      ? accounts
        .map((account) => decodeStoredAccount(account))
        .filter((account): account is StoredAccount => Boolean(account?.id && account?.uuid && account?.name))
      : []
  }

  const saveAccounts = (accounts: StoredAccount[]) => {
    writeJsonFile(accountsPath, accounts.map((account) => encodeStoredAccount(account)))
  }

  const migrateStoredAccountsEncryption = () => {
    if (!canEncryptAccountAuth()) return

    const rawAccounts = readJsonFile(accountsPath, []) as any[]
    if (!Array.isArray(rawAccounts) || rawAccounts.length === 0) return

    const needsMigration = rawAccounts.some((account) => (
      account
      && typeof account === 'object'
      && typeof account.authEncrypted !== 'string'
      && typeof account.auth !== 'undefined'
    ))
    if (!needsMigration) return

    const decodedAccounts = rawAccounts
      .map((account) => decodeStoredAccount(account))
      .filter((account): account is StoredAccount => Boolean(account?.id && account?.uuid && account?.name))

    saveAccounts(decodedAccounts)
    log.info(`Migrated ${decodedAccounts.length} account records to encrypted storage.`)
  }

  const toAccountSummary = (account: StoredAccount): AccountSummary => {
    return {
      id: account.id,
      uuid: account.uuid,
      name: account.name,
      type: account.type,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    }
  }

  const removeStoredAccount = (accountId: string) => {
    const accounts = readAccounts()
    const nextAccounts = accounts.filter((account) => account.id !== accountId)
    if (nextAccounts.length !== accounts.length) saveAccounts(nextAccounts)
    return {
      removed: nextAccounts.length !== accounts.length,
      accounts: nextAccounts.map(toAccountSummary)
    }
  }

  const notifyAccountSessionExpired = (account: StoredAccount, message: string) => {
    const result = removeStoredAccount(account.id)
    log.warn(`Microsoft account session expired for ${account.name}; removed stored account record.`)
    if (!deps.mainWindow || deps.mainWindow.isDestroyed() || deps.mainWindow.webContents.isDestroyed()) return
    deps.mainWindow.webContents.send('account-session-expired', {
      accountId: account.id,
      accountName: account.name,
      message,
      accounts: result.accounts
    })
  }

  const upsertAccount = (auth: any, type: 'msa' | 'offline'): AccountSummary => {
    const accounts = readAccounts()
    const id = `${type}:${auth.uuid}`
    const now = new Date().toISOString()
    const existingIndex = accounts.findIndex((account) => account.id === id)
    const storedAuth = type === 'msa' && existingIndex >= 0
      ? mergeMicrosoftAuthorizationState(accounts[existingIndex].auth, auth)
      : auth

    const stored: StoredAccount = {
      id,
      uuid: storedAuth.uuid,
      name: storedAuth.name,
      type,
      auth: storedAuth,
      createdAt: existingIndex >= 0 ? accounts[existingIndex].createdAt : now,
      updatedAt: now
    }

    if (existingIndex >= 0) accounts[existingIndex] = stored
    else accounts.push(stored)

    saveAccounts(accounts)
    return toAccountSummary(stored)
  }

  const getOfflineUuid = (username: string) => {
    // Minecraft's OfflinePlayer UUID is the name-based UUID v3 defined by the
    // server protocol. MD5 is used only as that deterministic identifier
    // transform; it does not protect credentials, authenticity, or integrity.
    const bytes = crypto.createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest() // lgtm[js/weak-cryptographic-algorithm]
    bytes[6] = (bytes[6] & 0x0f) | 0x30
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  const createOfflineAuth = (username: string) => ({
    access_token: '0',
    client_token: crypto.randomUUID(),
    uuid: getOfflineUuid(username),
    name: username,
    user_properties: '{}',
    meta: {
      type: 'offline',
      demo: false
    }
  })

  const MICROSOFT_AUTH_REFRESH_GRACE_SECONDS = 15 * 60

  const decodeJwtPayload = (token?: string) => {
    try {
      const payload = String(token || '').split('.')[1]
      if (!payload) return null
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, any>
    } catch {
      return null
    }
  }

  const getMicrosoftSessionState = (auth: any) => (
    auth?._msmc && typeof auth._msmc === 'object'
      ? auth._msmc as Record<string, any>
      : null
  )

  const getMicrosoftRefreshToken = (auth: any) => {
    const refreshToken = getMicrosoftSessionState(auth)?.refresh
    return typeof refreshToken === 'string' ? refreshToken.trim() : ''
  }

  const getMicrosoftMinecraftTokenExpiry = (auth: any) => {
    const sessionExpiry = Number(getMicrosoftSessionState(auth)?.expires_by)
    if (Number.isFinite(sessionExpiry) && sessionExpiry > 0) return sessionExpiry

    const tokenExpiry = Number(decodeJwtPayload(auth?.access_token || auth?._msmc?.mcToken)?.exp)
    return Number.isFinite(tokenExpiry) && tokenExpiry > 0 ? tokenExpiry : 0
  }

  const shouldRefreshMicrosoftAuthorization = (auth: any) => {
    const expiresBy = getMicrosoftMinecraftTokenExpiry(auth)
    return !expiresBy || expiresBy <= Math.floor(Date.now() / 1000) + MICROSOFT_AUTH_REFRESH_GRACE_SECONDS
  }

  const mergeMicrosoftAuthorizationState = (previousAuth: any, nextAuth: any) => {
    const previousSession = getMicrosoftSessionState(previousAuth) || {}
    const nextSession = getMicrosoftSessionState(nextAuth) || {}
    const refreshToken = String(nextSession.refresh || previousSession.refresh || '').trim()

    return {
      ...nextAuth,
      _msmc: {
        ...previousSession,
        ...nextSession,
        ...(refreshToken ? { refresh: refreshToken } : {})
      }
    }
  }

  const isMicrosoftSessionAuthenticationFailure = (err: unknown) => {
    let detail = ''
    try {
      detail = String(err instanceof Error ? err.stack || err.message : JSON.stringify(err) || err || '')
    } catch {
      detail = String(err || '')
    }
    return /invalid profile|invalid refresh token|invalid_grant|Login\.Fail\.Relog|missing its refresh token|Microsoft session .* (expired|invalid|incomplete)/i.test(detail)
  }

  const isExpectedLaunchUserFacingError = (value: unknown) => {
    const detail = String(value || '')
    return isOfflineUsernameValidationError(detail) || [
      /Please update NamLauncher to the latest version before launching Minecraft/i,
      /Microsoft session .*?(expired|missing its refresh token|invalid|incomplete)/i,
      /Your Microsoft session expired/i,
      /Could not log into Minecraft/i,
      /Microsoft sign-in .*Minecraft services/i,
      /Microsoft login did not return a refresh token/i,
      /Xbox Live rejected this Microsoft account/i,
      /The account (?:doesn't|does not) have an Xbox account/i,
      /Minecraft is already (?:running|launching)/i,
      /Launch cancelled by user/i
    ].some((pattern) => pattern.test(detail))
  }

  const normalizeMicrosoftAuthorization = (account: StoredAccount, rawAuth: any) => {
    const auth = mergeMicrosoftAuthorizationState(account.auth, rawAuth)
    const storedToken = String(auth?.access_token || '').trim()
    const fallbackToken = String(auth?._msmc?.mcToken || '').trim()
    const accessToken = storedToken && storedToken !== '0' ? storedToken : fallbackToken
    const tokenPayload = decodeJwtPayload(accessToken)
    const uuid = String(auth?.uuid || account.uuid || '').trim()
    const name = String(auth?.name || account.name || '').trim()
    const storedXuid = String(auth?.meta?.xuid || '').trim()
    const tokenXuid = String(tokenPayload?.xuid || tokenPayload?.xid || '').trim()
    const xuid = storedXuid && storedXuid !== '0' ? storedXuid : tokenXuid
    const expiresBy = getMicrosoftMinecraftTokenExpiry({
      ...auth,
      access_token: accessToken,
      _msmc: {
        ...(auth?._msmc || {}),
        mcToken: accessToken
      }
    })

    if (
      !accessToken
      || accessToken === '0'
      || !/^[a-f0-9-]{32,36}$/i.test(uuid)
      || !name
      || !xuid
      || xuid === '0'
    ) {
      throw new Error(`Microsoft session for ${account.name} is incomplete.`)
    }

    return {
      ...auth,
      access_token: accessToken,
      client_token: String(auth?.client_token || crypto.randomUUID()),
      uuid,
      name,
      user_properties: typeof auth?.user_properties === 'string' ? auth.user_properties : '{}',
      _msmc: {
        ...(auth?._msmc || {}),
        mcToken: accessToken,
        ...(expiresBy ? { expires_by: expiresBy } : {})
      },
      meta: {
        ...(auth?.meta || {}),
        type: 'msa',
        xuid
      }
    }
  }

  const persistAccountAuthorization = (account: StoredAccount, authorization: any) => {
    const accounts = readAccounts()
    const index = accounts.findIndex((item) => item.id === account.id)
    if (index < 0) return authorization

    accounts[index] = {
      ...accounts[index],
      uuid: authorization.uuid || account.uuid,
      name: authorization.name || account.name,
      auth: authorization,
      updatedAt: new Date().toISOString()
    }
    saveAccounts(accounts)
    return authorization
  }

  const refreshAccountIfNeeded = async (account: StoredAccount): Promise<any> => {
    if (account.type === 'offline') return account.auth

    try {
      const valid = await msmc.getMCLC().validate(account.auth).catch((err: unknown) => {
        log.debug(`Could not validate Microsoft account ${account.name}; refresh will be attempted.`, err)
        return false
      })
      if (valid && !shouldRefreshMicrosoftAuthorization(account.auth)) {
        try {
          const normalized = normalizeMicrosoftAuthorization(account, account.auth)
          const repaired = (
            normalized.access_token !== account.auth?.access_token
            || normalized.meta?.xuid !== account.auth?.meta?.xuid
            || normalized.meta?.type !== account.auth?.meta?.type
            || normalized._msmc?.mcToken !== account.auth?._msmc?.mcToken
            || normalized._msmc?.expires_by !== account.auth?._msmc?.expires_by
          )
          if (repaired) {
            log.info(`Repaired stored Microsoft authorization fields for ${account.name}.`)
            persistAccountAuthorization(account, normalized)
          }
          if (!getMicrosoftRefreshToken(normalized)) {
            log.warn(`Stored Microsoft authorization for ${account.name} has no refresh token; it will require sign-in when the Minecraft token expires.`)
          }
          return normalized
        } catch {
          log.warn(`Stored Microsoft authorization for ${account.name} is incomplete; refreshing it.`)
        }
      }

      if (!getMicrosoftRefreshToken(account.auth)) {
        const message = `Microsoft session for ${account.name} is missing its refresh token. Please sign in again.`
        notifyAccountSessionExpired(account, message)
        throw new Error(message)
      }

      log.info(`Refreshing Microsoft token for ${account.name}${valid ? ' before expiry' : ''}`)
      sendProgress({ type: 'auth-refresh', task: 25, total: 100 })
      const refreshedAuth = await msmc.getMCLC().refresh(account.auth, (update: any) => {
        const detail = redactSensitiveText(update.data || '')
        sendProgress({ type: 'auth-refresh', task: update.percent || 50, total: 100, detail })
        log.info(`[MSMC-REFRESH] ${update.type}: ${detail}`)
      })
      const refreshed = normalizeMicrosoftAuthorization(account, mergeMicrosoftAuthorizationState(account.auth, refreshedAuth))
      persistAccountAuthorization(account, refreshed)
      return refreshed
    } catch (err) {
      if (err instanceof Error && err.message.startsWith(`Microsoft session for ${account.name}`)) {
        if (readAccounts().some((item) => item.id === account.id)) {
          notifyAccountSessionExpired(account, err.message)
        }
        log.warn(err.message)
        throw err
      }
      const detail = redactSensitiveText(err instanceof Error ? err.stack || err.message : err)
      log.error(`Failed to validate or refresh Microsoft account ${account.name}`, detail)
      if (isMicrosoftSessionAuthenticationFailure(err)) {
        notifyAccountSessionExpired(account, `Microsoft session for ${account.name} expired. Please sign in again.`)
      }
      throw new Error(`Microsoft session for ${account.name} expired. Please sign in again.`)
    }
  }

  const resolveAccountForLaunch = async (request: LaunchRequest) => {
    if (request.accountId) {
      const account = readAccounts().find((item) => item.id === request.accountId)
      if (!account) throw new Error('Selected account was not found. Please sign in again.')
      const authorization = await refreshAccountIfNeeded(account)
      if (account.type === 'msa' && (
        !authorization?.access_token
        || authorization.access_token === '0'
        || authorization?.meta?.type !== 'msa'
        || !authorization?.meta?.xuid
        || authorization.meta.xuid === '0'
      )) {
        const message = `Microsoft session for ${account.name} is invalid. Please sign in again.`
        notifyAccountSessionExpired(account, message)
        throw new Error(message)
      }
      log.info(`Launch account selected: ${account.name} (${account.type}, ${account.uuid}).`)
      return authorization
    }

    if (request.auth) {
      return request.auth
    }

    throw new Error('Please sign in before launching Minecraft.')
  }

  const getMicrosoftLoginFailureMessage = (result: any) => {
    const reason = String(result?.reason || '').trim()
    const translation = String(result?.translationString || '').trim()

    if (translation === 'Cancelled.GUI' || translation === 'Cancelled.Back' || result?.type === 'Cancelled') {
      return 'Microsoft login was cancelled.'
    }
    if (translation === 'Login.Fail.MC' || /Could not log into Minecraft/i.test(reason)) {
      return 'Microsoft sign-in reached your account, but Minecraft services rejected the session. Make sure this Microsoft account owns Minecraft: Java Edition, has an Xbox profile, and is allowed to use Xbox services, then try again.'
    }
    if (translation === 'Login.Fail.Xbox'
      || /Could not log into xbox/i.test(reason)
      || /The account (?:doesn't|does not) have an Xbox account/i.test(reason)) {
      return 'Xbox Live rejected this Microsoft account. Open the Xbox app or xbox.com once, finish profile or family-safety setup, then try signing in again.'
    }
    if (translation === 'Login.Fail.Relog' || /invalid refresh token|invalid_grant/i.test(reason)) {
      return 'Microsoft rejected the saved login token. Please sign in again.'
    }
    if (translation === 'Login.Fail.MS' || /Could not log into Microsoft/i.test(reason)) {
      return 'Microsoft login could not be completed. Check the account, network connection, and Microsoft service status, then try again.'
    }

    return reason || translation || result?.type || 'Microsoft login failed. Please try again.'
  }

  return {
    readAccounts,
    getOfflineUuid,
    refreshAccountIfNeeded,
    migrateStoredAccountsEncryption,
    toAccountSummary,
    removeStoredAccount,
    isExpectedLaunchUserFacingError,
    resolveAccountForLaunch,
    getMicrosoftLoginFailureMessage,
    getMicrosoftRefreshToken,
    upsertAccount,
    createOfflineAuth
  }
}
