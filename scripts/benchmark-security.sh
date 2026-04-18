#!/bin/bash
# Benchmark G2 security gate
START=$(date +%s.%N)
bun run test:security > /dev/null 2>&1
EXIT=$?
END=$(date +%s.%N)
TOTAL=$(echo "$END - $START" | bc)
echo "METRIC total_s=$TOTAL"
echo "METRIC security_s=$TOTAL"
exit $EXIT
