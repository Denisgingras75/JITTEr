#!/bin/bash
# Bot Farm Daily Runner
# Add to crontab: 0 9 * * * /Users/denisgingras/whats-good-here/e2e/jitter-lab/botfarm/daily-run.sh
#
# Runs the bot farm test suite against the local dev server.
# Starts dev server if not running, runs tests, generates report.

set -e

PROJECT_DIR="/Users/denisgingras/whats-good-here"
LOG_DIR="$PROJECT_DIR/e2e/jitter-lab/botfarm/results"
TODAY=$(date +%Y-%m-%d)
RUN_LOG="$LOG_DIR/daily-$TODAY.log"

cd "$PROJECT_DIR"

mkdir -p "$LOG_DIR"

echo "[$TODAY] Bot farm daily run starting" | tee "$RUN_LOG"

# Playwright config uses port 5174 and auto-starts Vite via webServer config.
# If port 5174 is already in use, Playwright reuses it.

# Run bot farm tests via the botfarm project
echo "Running bot farm personas..." | tee -a "$RUN_LOG"
npx playwright test --project=botfarm \
  --reporter=list \
  --timeout=120000 \
  2>&1 | tee -a "$RUN_LOG" || true

# Generate report
echo "Generating report..." | tee -a "$RUN_LOG"
node e2e/jitter-lab/botfarm/report.mjs 2>&1 | tee -a "$RUN_LOG" || true

# Playwright webServer config handles dev server lifecycle

echo "[$TODAY] Bot farm daily run complete" | tee -a "$RUN_LOG"
