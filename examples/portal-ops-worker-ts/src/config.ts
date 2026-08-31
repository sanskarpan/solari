export interface AppConfig {
  apiKey?: string | undefined
  dryRun: boolean
  username: string
  password: string
  profileName: string
  volumeName: string
  timeoutMs: number
  enableStealth: boolean
  proxyCountry: string
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
    username: env.PORTAL_USERNAME ?? "demo-user",
    password: env.PORTAL_PASSWORD ?? "demo-password",
    profileName: env.PROFILE_NAME ?? "portal-ops-demo",
    volumeName: env.VOLUME_NAME ?? "portal-ops-demo",
    timeoutMs: positiveInteger("TIMEOUT_MS", env.TIMEOUT_MS, 300_000),
    enableStealth: flag(env.ENABLE_STEALTH),
    proxyCountry: env.PROXY_COUNTRY ?? "us",
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
  return config
}
