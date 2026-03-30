---
phase: 2
name: Skill Test Infrastructure
status: pending
priority: medium
---

# Phase 2: Skill Test Infrastructure

## Context

- Superpowers has 5 test suites: skill-triggering, integration, explicit-requests, e2e, token-analysis
- CKE has hook unit tests in `.claude/hooks/__tests__/` but no skill behavior tests
- Key test: "Does skill X activate when user says Y?" (without mentioning skill by name)
- Uses `claude -p` headless mode + stream-json output analysis

## Overview

Create skill-triggering test framework for CKE's core skills. Modeled after Superpowers' `tests/skill-triggering/` pattern.

## Files to Create

- `.claude/hooks/__tests__/skill-triggering/run-test.sh` — Test runner script
- `.claude/hooks/__tests__/skill-triggering/run-all.sh` — Run all trigger tests
- `.claude/hooks/__tests__/skill-triggering/prompts/` — Test prompt files (1 per skill)

## Implementation Steps

### 1. Create Test Runner `run-test.sh`

Adapted from Superpowers pattern:

```bash
#!/bin/bash
# Test skill triggering with naive prompts
# Usage: ./run-test.sh <skill-name> <prompt-file> [max-turns]
#
# Verifies Claude activates the correct skill from a natural prompt
# (without explicitly mentioning the skill name)
#
# Requires: claude CLI in PATH

set -e

SKILL_NAME="$1"
PROMPT_FILE="$2"
MAX_TURNS="${3:-3}"

if [ -z "$SKILL_NAME" ] || [ -z "$PROMPT_FILE" ]; then
    echo "Usage: $0 <skill-name> <prompt-file> [max-turns]"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
TIMESTAMP=$(date +%s)
OUTPUT_DIR="/tmp/cke-tests/${TIMESTAMP}/skill-triggering/${SKILL_NAME}"
mkdir -p "$OUTPUT_DIR"

PROMPT=$(cat "$PROMPT_FILE")
LOG_FILE="$OUTPUT_DIR/claude-output.json"

echo "=== CKE Skill Triggering Test ==="
echo "Skill: $SKILL_NAME"
echo "Prompt: $(head -1 "$PROMPT_FILE")"
echo ""

cd "$OUTPUT_DIR"
timeout 300 claude -p "$PROMPT" \
    --dangerously-skip-permissions \
    --max-turns "$MAX_TURNS" \
    --output-format stream-json \
    > "$LOG_FILE" 2>&1 || true

# Check if skill was triggered
SKILL_PATTERN='"skill":"([^"]*:)?'"${SKILL_NAME}"'"'
if grep -q '"name":"Skill"' "$LOG_FILE" && grep -qE "$SKILL_PATTERN" "$LOG_FILE"; then
    echo "PASS: Skill '$SKILL_NAME' triggered"
    exit 0
else
    echo "FAIL: Skill '$SKILL_NAME' NOT triggered"
    echo "Skills triggered:"
    grep -o '"skill":"[^"]*"' "$LOG_FILE" 2>/dev/null | sort -u || echo "  (none)"
    exit 1
fi
```

### 2. Create Test Prompts (1 per core skill)

**`prompts/cook.txt`:**
```
I need to implement a new user profile page with avatar upload. The design is in our Figma. Let's build it.
```

**`prompts/fix.txt`:**
```
The login page is throwing a 500 error when users try to sign in with Google OAuth. It was working yesterday.
```

**`prompts/brainstorm.txt`:**
```
I'm thinking about adding real-time notifications to our app. What's the best approach - WebSockets, SSE, or polling?
```

**`prompts/plan.txt`:**
```
We need to migrate our database from SQLite to PostgreSQL. Can you create a detailed plan for this?
```

**`prompts/debug.txt`:**
```
Our API response times have increased by 300% since the last deployment. Something is wrong but I'm not sure what.
```

**`prompts/code-review.txt`:**
```
I just finished implementing the payment webhook handler. Can you review my code before I merge?
```

### 3. Create `run-all.sh`

```bash
#!/bin/bash
# Run all skill triggering tests
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0; FAIL=0; TOTAL=0

for prompt_file in "$SCRIPT_DIR/prompts/"*.txt; do
    skill_name=$(basename "$prompt_file" .txt)
    TOTAL=$((TOTAL + 1))
    echo "--- Testing: $skill_name ---"
    if "$SCRIPT_DIR/run-test.sh" "$skill_name" "$prompt_file"; then
        PASS=$((PASS + 1))
    else
        FAIL=$((FAIL + 1))
    fi
    echo ""
done

echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

## Todo

- [ ] Create `run-test.sh` test runner
- [ ] Create `run-all.sh` batch runner
- [ ] Create 6 prompt files for core skills (cook, fix, brainstorm, plan, debug, code-review)
- [ ] Test locally with `claude -p`
- [ ] Document in README that `claude` CLI is required for skill tests

## Success Criteria

- `run-all.sh` executes all 6 skill tests
- Each test verifies skill activation from naive prompt (no skill name mentioned)
- Tests output PASS/FAIL with triggered skills list on failure
- Framework extensible — add new test by dropping a `.txt` file in prompts/
