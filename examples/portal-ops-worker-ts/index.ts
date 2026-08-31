import { runDryWorkflow } from "./src/dry-run.js"
import { runLiveWorkflow } from "./src/live.js"

const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1"

if (dryRun) {
  await runDryWorkflow()
} else {
  await runLiveWorkflow()
}
