import { parsePortalCsv } from "./csv.js"
import type { NormalizedRecord, PortalRecord } from "./types.js"

const VALID_STATUSES = new Set(["open", "closed", "draft"])

function normalizeDeadline(value: string): { value: string | null; error?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { value: null, error: "deadline must use YYYY-MM-DD" }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { value: null, error: "deadline is not a real calendar date" }
  }
  return { value }
}

function normalizeBudget(value: string): { value: number | null; error?: string } {
  const clean = value.replaceAll(",", "").replace(/^\$/, "").trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return { value: null, error: "budget must be a non-negative currency amount" }
  const amount = Number(clean)
  const cents = Math.round(amount * 100)
  if (!Number.isSafeInteger(cents)) return { value: null, error: "budget is too large" }
  return { value: cents }
}

export function normalizeRecords(records: PortalRecord[]): NormalizedRecord[] {
  const counts = new Map<string, number>()
  for (const record of records) counts.set(record.recordId, (counts.get(record.recordId) ?? 0) + 1)

  return records.map((record) => {
    const validationErrors: string[] = []
    const deadline = normalizeDeadline(record.deadline)
    const budget = normalizeBudget(record.budget)
    const status = record.status.toLowerCase()
    if (!record.recordId) validationErrors.push("recordId is required")
    if (!record.title) validationErrors.push("title is required")
    if (!record.organization) validationErrors.push("organization is required")
    if (deadline.error) validationErrors.push(deadline.error)
    if (budget.error) validationErrors.push(budget.error)
    if (!VALID_STATUSES.has(status)) validationErrors.push(`status must be one of ${[...VALID_STATUSES].join(", ")}`)
    if (counts.get(record.recordId)! > 1) validationErrors.push("duplicate recordId")

    return {
      recordId: record.recordId,
      title: record.title,
      organization: record.organization,
      deadline: deadline.value,
      budgetCents: budget.value,
      status,
      documents: record.documents.split(";").map((item) => item.trim()).filter(Boolean),
      valid: validationErrors.length === 0,
      validationErrors,
    }
  })
}

export function normalizeCsv(input: string): NormalizedRecord[] {
  return normalizeRecords(parsePortalCsv(input))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function validateNormalizedRecords(value: unknown): NormalizedRecord[] {
  if (!Array.isArray(value)) throw new Error("sandbox normalized output must be an array")
  return value.map((item, index) => {
    if (!isObject(item)) throw new Error("sandbox normalized record " + index + " must be an object")
    const requiredStrings = ["recordId", "title", "organization", "status"] as const
    for (const field of requiredStrings) {
      if (typeof item[field] !== "string") throw new Error("sandbox normalized record " + index + "." + field + " must be a string")
    }
    if (item.deadline !== null && typeof item.deadline !== "string") {
      throw new Error("sandbox normalized record " + index + ".deadline must be a string or null")
    }
    if (item.budgetCents !== null && (typeof item.budgetCents !== "number" || !Number.isSafeInteger(item.budgetCents) || item.budgetCents < 0)) {
      throw new Error("sandbox normalized record " + index + ".budgetCents must be a non-negative safe integer or null")
    }
    if (!Array.isArray(item.documents) || item.documents.some((document) => typeof document !== "string")) {
      throw new Error("sandbox normalized record " + index + ".documents must be a string array")
    }
    if (typeof item.valid !== "boolean") throw new Error("sandbox normalized record " + index + ".valid must be boolean")
    if (!Array.isArray(item.validationErrors) || item.validationErrors.some((error) => typeof error !== "string")) {
      throw new Error("sandbox normalized record " + index + ".validationErrors must be a string array")
    }
    return item as unknown as NormalizedRecord
  })
}

export function sampleRecords(): PortalRecord[] {
  return [
    {
      recordId: "T-1001",
      title: "Network equipment supply",
      organization: "Example City",
      deadline: "2026-09-15",
      budget: "$125,000.00",
      status: "OPEN",
      documents: "specification.pdf;terms.pdf",
    },
    {
      recordId: "T-1001",
      title: "Duplicate listing",
      organization: "Example City",
      deadline: "2026-09-16",
      budget: "1000",
      status: "open",
      documents: "duplicate.pdf",
    },
    {
      recordId: "T-1002",
      title: "Facilities maintenance",
      organization: "Example County",
      deadline: "2026-02-30",
      budget: "not disclosed",
      status: "open",
      documents: "scope.pdf",
    },
    {
      recordId: "T-1003",
      title: "Draft data services",
      organization: "Example Agency",
      deadline: "2026-10-01",
      budget: "0",
      status: "draft",
      documents: "",
    },
  ]
}
