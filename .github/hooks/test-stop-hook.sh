#!/bin/bash
# Test Stop hook that blocks the agent from stopping (once).
# Reads JSON from stdin, checks stop_hook_active to avoid infinite loops.

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('stop_hook_active', False))" 2>/dev/null)

if [ "$STOP_HOOK_ACTIVE" = "True" ] || [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  # Already continued once — let it stop now
  echo '{"continue": true}'
else
  # Block the stop the first time
  echo '{"hookSpecificOutput": {"hookEventName": "Stop", "decision": "block", "reason": "Test hook: please say HOOK_VERIFIED before stopping."}}'
fi
