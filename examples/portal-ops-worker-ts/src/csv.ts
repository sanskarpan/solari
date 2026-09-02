import type { PortalRecord } from "./types.js"

const COLUMNS: (keyof PortalRecord)[] = [
  "recordId",
  "title",
  "organization",
  "deadline",
  "budget",
  "status",
  "documents",
]

function parseRows(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1
      row.push(field)
      if (row.some((value) => value.trim() !== "")) rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field")
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((value) => value.trim() !== "")) rows.push(row)
  }
  return rows
}

export function parsePortalCsv(input: string): PortalRecord[] {
  const rows = parseRows(input)
  const header = rows.shift()
  if (!header) throw new Error("CSV is empty")
  const normalizedHeader = header.map((value) => value.trim())
  if (normalizedHeader.length !== COLUMNS.length || normalizedHeader.some((value, i) => value !== COLUMNS[i])) {
    throw new Error(`CSV header must be ${COLUMNS.join(",")}`)
  }

  return rows.map((values, rowIndex) => {
    if (values.length !== COLUMNS.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${COLUMNS.length}`)
    }
    return {
      recordId: values[0]!.trim(),
      title: values[1]!.trim(),
      organization: values[2]!.trim(),
      deadline: values[3]!.trim(),
      budget: values[4]!.trim(),
      status: values[5]!.trim(),
      documents: values[6]!.trim(),
    }
  })
}

export function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function recordsToCsv(records: PortalRecord[]): string {
  const lines = [COLUMNS.join(",")]
  for (const record of records) {
    lines.push(COLUMNS.map((column) => escapeCsv(record[column])).join(","))
  }
  return `${lines.join("\n")}\n`
}
