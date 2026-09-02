import type { Sandbox } from "@solarisdk/sdk"

/**
 * The fixture deliberately uses Python's standard library because the
 * documented `base` sandbox guarantees Python, while this example should not
 * spend time building a custom image before demonstrating the workflow.
 */
export const FIXTURE_PORTAL_SCRIPT = String.raw`import csv
import html
import io
import sys
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

USERNAME = "demo-user"
PASSWORD = "demo-password"
CSV_DATA = """recordId,title,organization,deadline,budget,status,documents
T-1001,Network equipment supply,Example City,2026-09-15,"$125,000.00",OPEN,"specification.pdf;terms.pdf"
T-1001,Duplicate listing,Example City,2026-09-16,1000,open,duplicate.pdf
T-1002,Facilities maintenance,Example County,2026-02-30,not disclosed,open,scope.pdf
T-1003,Draft data services,Example Agency,2026-10-01,0,draft,
"""

def page(body):
    return ("<!doctype html><meta charset='utf-8'><title>Portal fixture</title>"
            "<style>body{font:16px system-ui;margin:3rem}input{display:block;margin:.5rem 0;padding:.4rem}"
            "table{border-collapse:collapse}td,th{border:1px solid #ccd;padding:.5rem}</style>" + body)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def authorized(self):
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        return cookie.get("portal_session") and cookie["portal_session"].value == "active"

    def send(self, status, body, content_type="text/html; charset=utf-8", headers=None):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def redirect(self, location, headers=None):
        self.send(HTTPStatus.SEE_OTHER, "", headers={"Location": location, **(headers or {})})

    def do_GET(self):
        if self.path == "/" and not self.authorized():
            self.send(HTTPStatus.OK, page("<h1>Procurement portal</h1><form method='post' action='/login'>"
                "<label>Username<input name='username' autocomplete='username'></label>"
                "<label>Password<input name='password' type='password' autocomplete='current-password'></label>"
                "<button type='submit'>Sign in</button></form>"))
        elif self.path == "/" or self.path == "/records":
            if not self.authorized():
                self.redirect("/")
                return
            rows = "".join("<tr>" + "".join("<td>" + html.escape(cell) + "</td>" for cell in line.split(",", 2)) + "</tr>"
                for line in ["T-1001,Network equipment supply,OPEN", "T-1001,Duplicate listing,OPEN", "T-1002,Facilities maintenance,OPEN", "T-1003,Draft data services,DRAFT"])
            self.send(HTTPStatus.OK, page("<h1>Open procurements</h1><p>Fixture records</p>"
                "<table><thead><tr><th>ID</th><th>Title</th><th>Status</th></tr></thead><tbody>" + rows +
                "</tbody></table><a id='download' href='/download/records.csv'>Download records CSV</a>"))
        elif self.path == "/download/records.csv":
            if not self.authorized():
                self.send(HTTPStatus.FORBIDDEN, "not authorized", "text/plain; charset=utf-8")
                return
            self.send(HTTPStatus.OK, CSV_DATA, "text/csv; charset=utf-8", {"Content-Disposition": "attachment; filename=records.csv"})
        else:
            self.send(HTTPStatus.NOT_FOUND, "not found", "text/plain; charset=utf-8")

    def do_POST(self):
        if self.path != "/login":
            self.send(HTTPStatus.NOT_FOUND, "not found", "text/plain; charset=utf-8")
            return
        length = int(self.headers.get("Content-Length", "0"))
        form = parse_qs(self.rfile.read(length).decode())
        if form.get("username", [""])[0] == USERNAME and form.get("password", [""])[0] == PASSWORD:
            self.redirect("/records", {"Set-Cookie": "portal_session=active; Path=/; HttpOnly"})
        else:
            self.send(HTTPStatus.UNAUTHORIZED, page("<h1>Sign in failed</h1><a href='/'>Try again</a>"))

port = sys.argv[-1] if len(sys.argv) > 1 else "3000"
HTTPServer(("0.0.0.0", int(port)), Handler).serve_forever()
`

export async function startFixture(sandbox: Sandbox, scriptPath = "/tmp/portal-fixture.py", writeScript = true) {
  if (writeScript) await sandbox.files.write(scriptPath, FIXTURE_PORTAL_SCRIPT)
  const server = await sandbox.commands.start("python3", { args: [scriptPath, "3000"] })
  return server
}
