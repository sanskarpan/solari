export interface PortalRecord {
  recordId: string
  title: string
  organization: string
  deadline: string
  budget: string
  status: string
  documents: string
}

export interface NormalizedRecord {
  recordId: string
  title: string
  organization: string
  deadline: string | null
  budgetCents: number | null
  status: string
  documents: string[]
  valid: boolean
  validationErrors: string[]
}

export interface RunManifest {
  schemaVersion: 1
  runId: string
  status: "dry-run" | "succeeded" | "failed"
  source: { kind: "fixture" | "external"; url: string }
  startedAt: string
  finishedAt: string
  counts: { input: number; valid: number; invalid: number }
  artifacts: string[]
  browserSessionId?: string
  replayUrl?: string
  desktopScreenshot?: string
  error?: string
}
