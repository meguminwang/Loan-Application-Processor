#!/bin/bash
#
# Webhook Disbursement Simulator
# Sends success, failure, and replay webhooks to the loan processor.
#
# Usage:
#   ./simulate_disbursement.sh <application_id>
#   ./simulate_disbursement.sh              # runs full demo with a new application
#

BASE_URL="${BASE_URL:-http://localhost:3000}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
blue()  { printf "\033[34m%s\033[0m\n" "$1"; }

post_webhook() {
  local app_id="$1" status="$2" txn_id="$3"
  curl -s -X POST "$BASE_URL/webhook/disbursement" \
    -H "Content-Type: application/json" \
    -d "{\"application_id\":\"$app_id\",\"status\":\"$status\",\"transaction_id\":\"$txn_id\",\"timestamp\":\"$TIMESTAMP\"}"
}

post_app() {
  curl -s -X POST "$BASE_URL/applications" \
    -H "Content-Type: application/json" \
    -d "$1"
}

# If application_id provided, use it directly
if [ -n "$1" ]; then
  APP_ID="$1"
  blue "Using provided application: $APP_ID"
else
  blue "=== Creating a new application (Jane Doe, auto-approve) ==="
  APP_ID=$(post_app '{"applicant_name":"Jane Doe","email":"webhook.test@example.com","loan_amount":1500,"stated_monthly_income":5000,"employment_status":"employed","documented_monthly_income":4800,"bank_ending_balance":3200,"bank_has_overdrafts":false,"bank_has_consistent_deposits":true,"monthly_withdrawals":1200,"monthly_deposits":4800}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  green "Created application: $APP_ID (status: disbursement_queued)"
fi

echo ""

# --- Test 1: Success webhook ---
blue "=== Test 1: Sending SUCCESS webhook ==="
RESULT=$(post_webhook "$APP_ID" "success" "txn_success_$(date +%s)")
echo "$RESULT" | python3 -m json.tool
echo ""

# --- Test 2: Replay same transaction_id ---
blue "=== Test 2: Replaying same transaction_id (idempotency test) ==="
# Extract the transaction_id from the previous result
TXN_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transaction_id',''))")
REPLAY=$(post_webhook "$APP_ID" "success" "$TXN_ID")
echo "$REPLAY" | python3 -m json.tool
echo ""

# --- Test 3: Failure + retry flow ---
blue "=== Test 3: Creating new app for failure/retry demo ==="
APP_FAIL=$(post_app '{"applicant_name":"Retry Test","email":"retry.demo@example.com","loan_amount":1500,"stated_monthly_income":5000,"employment_status":"employed","documented_monthly_income":4800,"bank_ending_balance":3200,"bank_has_overdrafts":false,"bank_has_consistent_deposits":true,"monthly_withdrawals":1200,"monthly_deposits":4800}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
green "Created application: $APP_FAIL"
echo ""

for i in 1 2 3 4; do
  blue "--- Failure $i/4 ---"
  post_webhook "$APP_FAIL" "failed" "txn_fail_${i}_$(date +%s)" | python3 -m json.tool
  echo ""
done

# --- Summary ---
blue "=== Final state of retry app ==="
curl -s "$BASE_URL/applications/$APP_FAIL" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f'Status: {d[\"status\"]}')
print(f'Retry count: {d[\"retryCount\"]}')
print(f'Audit trail ({len(d[\"auditLogs\"])} entries):')
for log in d['auditLogs']:
    meta = json.loads(log['metadata']) if log.get('metadata') else {}
    rid = meta.get('retry_id','')[:8]
    extra = f' retry_id={rid}' if rid else ''
    print(f'  {log[\"action\"]}: {log.get(\"fromStatus\",\"N/A\")} → {log.get(\"toStatus\",\"N/A\")}{extra}')
"

echo ""
green "Simulation complete!"
