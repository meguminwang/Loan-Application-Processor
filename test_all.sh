#!/bin/bash
# Full test of all 8 scenarios from the PDF spec.
BASE="http://localhost:3000"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf "\033[32m✓\033[0m %s: %s\n" "$name" "$actual"
    PASS=$((PASS+1))
  else
    printf "\033[31m✗\033[0m %s: got '%s', expected '%s'\n" "$name" "$actual" "$expected"
    FAIL=$((FAIL+1))
  fi
}

post() {
  curl -s -X POST "$BASE/applications" -H "Content-Type: application/json" -d "$1"
}

get_status() {
  echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null
}

get_error_code() {
  echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)['error']['code'])" 2>/dev/null
}

echo "=== Scenarios 1-6: Scoring + State Machine ==="

R1=$(post '{"applicant_name":"Jane Doe","email":"jane.doe@example.com","loan_amount":1500,"stated_monthly_income":5000,"employment_status":"employed","documented_monthly_income":4800,"bank_ending_balance":3200,"bank_has_overdrafts":false,"bank_has_consistent_deposits":true,"monthly_withdrawals":1200,"monthly_deposits":4800}')
check "S1: Jane Doe \$1500 (strong)" "disbursement_queued" "$(get_status "$R1")"

R2=$(post '{"applicant_name":"Bob Smith","email":"bob.smith@example.com","loan_amount":2000,"stated_monthly_income":1400,"employment_status":"self-employed","documented_monthly_income":1350,"bank_ending_balance":150,"bank_has_overdrafts":true,"bank_has_consistent_deposits":false,"monthly_withdrawals":1100,"monthly_deposits":1350}')
check "S2: Bob Smith \$2000 (weak)" "denied" "$(get_status "$R2")"

R3=$(post '{"applicant_name":"Bob Smith","email":"bob.smith@example.com","loan_amount":300,"stated_monthly_income":1400,"employment_status":"self-employed","documented_monthly_income":1350,"bank_ending_balance":150,"bank_has_overdrafts":true,"bank_has_consistent_deposits":false,"monthly_withdrawals":1100,"monthly_deposits":1350}')
check "S3: Bob Smith \$300 (weak small)" "flagged_for_review" "$(get_status "$R3")"

R4=$(post '{"applicant_name":"Jane Doe","email":"jane.doe@example.com","loan_amount":4500,"stated_monthly_income":5000,"employment_status":"employed","documented_monthly_income":4800,"bank_ending_balance":3200,"bank_has_overdrafts":false,"bank_has_consistent_deposits":true,"monthly_withdrawals":1200,"monthly_deposits":4800}')
check "S4: Jane Doe \$4500 (big loan)" "flagged_for_review" "$(get_status "$R4")"

R5=$(post '{"applicant_name":"Carol Tester","email":"carol.tester@example.com","loan_amount":1000,"stated_monthly_income":8000,"employment_status":"employed","documented_monthly_income":null,"bank_ending_balance":null,"bank_has_overdrafts":null,"bank_has_consistent_deposits":null,"monthly_withdrawals":null,"monthly_deposits":null}')
check "S5: Carol Tester (no docs)" "flagged_for_review" "$(get_status "$R5")"

R6=$(post '{"applicant_name":"Dave Liar","email":"dave.liar@example.com","loan_amount":2000,"stated_monthly_income":10000,"employment_status":"employed","documented_monthly_income":1400,"bank_ending_balance":150,"bank_has_overdrafts":true,"bank_has_consistent_deposits":false,"monthly_withdrawals":1100,"monthly_deposits":1400}')
check "S6: Dave Liar (fraud)" "denied" "$(get_status "$R6")"

echo ""
echo "=== Scenario 7: Duplicate Detection ==="
R7=$(post '{"applicant_name":"Jane Doe","email":"jane.doe@example.com","loan_amount":1500,"stated_monthly_income":5000,"employment_status":"employed","documented_monthly_income":4800,"bank_ending_balance":3200,"bank_has_overdrafts":false,"bank_has_consistent_deposits":true,"monthly_withdrawals":1200,"monthly_deposits":4800}')
check "S7: Duplicate rejected" "DUPLICATE_APPLICATION" "$(get_error_code "$R7")"

echo ""
echo "=== Scenario 8: Webhook Idempotency ==="
APP1_ID=$(echo "$R1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
W1=$(curl -s -X POST "$BASE/webhook/disbursement" -H "Content-Type: application/json" -d "{\"application_id\":\"$APP1_ID\",\"status\":\"success\",\"transaction_id\":\"txn_test_8\",\"timestamp\":\"2026-03-09T10:00:00Z\"}")
W2=$(curl -s -X POST "$BASE/webhook/disbursement" -H "Content-Type: application/json" -d "{\"application_id\":\"$APP1_ID\",\"status\":\"success\",\"transaction_id\":\"txn_test_8\",\"timestamp\":\"2026-03-09T10:01:00Z\"}")
REPLAY_MSG=$(echo "$W2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message',''))" 2>/dev/null)
check "S8: Webhook replay idempotent" "Webhook already processed (idempotent)" "$REPLAY_MSG"

echo ""
echo "=== Extra: Invalid State Transition ==="
DENIED_ID=$(echo "$R2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
INV=$(curl -s -u admin:admin123 -X POST "$BASE/admin/applications/$DENIED_ID/review" -H "Content-Type: application/json" -d '{"decision":"approved"}')
check "denied → approved rejected" "INVALID_STATE_TRANSITION" "$(get_error_code "$INV")"

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
