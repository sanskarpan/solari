export interface AppConfig {
  apiKey?: string | undefined
  dryRun: boolean
  portalUrl?: string | undefined
  allowExternalPortal: boolean
  username: string
  password: string
  usernameSelector: string
  passwordSelector: string
  loginSubmitSelector: string
  downloadSelector: string
  profileName: string
  volumeName: string
  timeoutMs: number
  enableStealth: boolean
  proxyCountry: string
  proxyTier: "residential" | "static" | "mobile"
  proxySession?: string | undefined
  proxySessionDuration: number
  captcha: boolean
  recording: boolean
  enableDesktop: boolean
  cleanupVolume: boolean
  failAfterDownload: boolean
}

function flag(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true"
}

function positiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; received ${JSON.stringify(value)}`)
  }
  return parsed
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, dryRun = false): AppConfig {
  const config: AppConfig = {
    apiKey: env.SOLARI_API_KEY,
    dryRun: dryRun || flag(env.DRY_RUN),
    portalUrl: env.PORTAL_URL,
    allowExternalPortal: flag(env.ALLOW_EXTERNAL_PORTAL),
    username: env.PORTAL_USERNAME ?? "demo-user",
    password: env.PORTAL_PASSWORD ?? "demo-password",
    usernameSelector: env.PORTAL_USERNAME_SELECTOR ?? "input[name=username]",
    passwordSelector: env.PORTAL_PASSWORD_SELECTOR ?? "input[name=password]",
    loginSubmitSelector: env.PORTAL_LOGIN_SUBMIT_SELECTOR ?? "button[type=submit]",
    downloadSelector: env.PORTAL_DOWNLOAD_SELECTOR ?? "#download",
    profileName: env.PROFILE_NAME ?? "portal-ops-demo",
    volumeName: env.VOLUME_NAME ?? "portal-ops-demo",
    timeoutMs: positiveInteger("TIMEOUT_MS", env.TIMEOUT_MS, 300_000),
    enableStealth: flag(env.ENABLE_STEALTH),
    proxyCountry: env.PROXY_COUNTRY ?? "us",
    proxyTier: (env.PROXY_TIER ?? "residential") as AppConfig["proxyTier"],
    proxySession: env.PROXY_SESSION,
    proxySessionDuration: positiveInteger("PROXY_SESSION_DURATION", env.PROXY_SESSION_DURATION, 10),
    captcha: flag(env.CAPTCHA),
    recording: flag(env.RECORDING),
    enableDesktop: flag(env.ENABLE_DESKTOP),
    cleanupVolume: flag(env.CLEANUP_VOLUME),
    failAfterDownload: flag(env.FAIL_AFTER_DOWNLOAD),
  }

  if (!config.dryRun && !config.apiKey) {
    throw new Error("SOLARI_API_KEY is required for live mode; create one at https://console.getsolari.com")
  }
  if (config.enableStealth && !config.proxyCountry.match(/^[a-z]{2}$/)) {
    throw new Error("PROXY_COUNTRY must be a lowercase two-letter country code")
  }
  if (!["residential", "static", "mobile"].includes(config.proxyTier)) {
    throw new Error("PROXY_TIER must be residential, static, or mobile")
  }
  if (config.proxySession && !/^[A-Za-z0-9-]{1,32}$/.test(config.proxySession)) {
    throw new Error("PROXY_SESSION must contain only letters, numbers, and dashes (up to 32 characters)")
  }
  if (config.proxySession && config.proxySessionDuration > 30) {
    throw new Error("PROXY_SESSION_DURATION must be between 1 and 30 minutes")
  }
  if (config.captcha && !config.enableStealth) {
    throw new Error("CAPTCHA requires ENABLE_STEALTH=1")
  }
  if (config.portalUrl) {
    let parsed: URL
    try {
      parsed = new URL(config.portalUrl)
    } catch {
      throw new Error("PORTAL_URL must be a valid HTTPS URL")
    }
    if (parsed.protocol !== "https:") throw new Error("PORTAL_URL must use HTTPS")
    if (parsed.username || parsed.password) throw new Error("PORTAL_URL must not contain embedded credentials")
    if (!config.allowExternalPortal) throw new Error("PORTAL_URL requires ALLOW_EXTERNAL_PORTAL=1 for an authorized target")
  }
  return config
}
