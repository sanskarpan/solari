import { runDryWorkflow } from "./src/dry-run.js"

const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1"

if (dryRun) {
  await runDryWorkflow()
} else {
  console.log("Portal-to-Decision Pack live workflow is scaffolded; run `npm run dry` while the live adapter is being built.")
}
