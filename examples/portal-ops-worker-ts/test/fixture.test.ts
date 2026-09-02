import assert from "node:assert/strict"
import { createServer } from "node:net"
import { spawn, type ChildProcess } from "node:child_process"
import { test } from "node:test"
import { FIXTURE_PORTAL_SCRIPT } from "../src/fixture.js"

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", () => resolve()))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("could not resolve a free port")
  const port = address.port
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "manual" })
      if (response.status === 200 || response.status === 303) return
    } catch {
      // The child process may still be binding its socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("fixture server did not start")
}

function stop(process: ChildProcess): void {
  if (!process.killed) process.kill("SIGTERM")
}

test("fixture protects records and returns the downloadable CSV after login", async () => {
  const port = await freePort()
  const child = spawn("python3", ["-c", FIXTURE_PORTAL_SCRIPT, "fixture", String(port)], { stdio: ["ignore", "pipe", "pipe"] })
  let stderr = ""
  child.stderr?.on("data", (chunk) => { stderr += String(chunk) })
  try {
    const origin = `http://127.0.0.1:${port}`
    try {
      await waitForServer(`${origin}/`)
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}: ${stderr}`)
    }
    const unauthenticated = await fetch(`${origin}/download/records.csv`)
    assert.equal(unauthenticated.status, 403)

    const login = await fetch(`${origin}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: "demo-user", password: "demo-password" }),
    })
    assert.equal(login.status, 303)
    const cookie = login.headers.get("set-cookie")
    assert.ok(cookie?.startsWith("portal_session=active"))

    const records = await fetch(`${origin}/records`, { headers: { cookie: cookie!.split(";", 1)[0]! } })
    assert.equal(records.status, 200)
    assert.match(await records.text(), /Download records CSV/)

    const download = await fetch(`${origin}/download/records.csv`, { headers: { cookie: cookie!.split(";", 1)[0]! } })
    assert.equal(download.status, 200)
    assert.equal(download.headers.get("content-type"), "text/csv; charset=utf-8")
    assert.match(await download.text(), /T-1001,Network equipment supply/)
  } finally {
    stop(child)
  }
})
