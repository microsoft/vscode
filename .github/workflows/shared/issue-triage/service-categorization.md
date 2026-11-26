# Task: Service Categorization

Classify a GitHub issue into one of the known Copilot service categories based on its content.

## Input

You will be given an issue's title and body (description).

## Categories

Evaluate the issue against the following categories **in order**. If the issue clearly matches a category, return that category. If no category matches — or the issue contains information regarding remote development, devcontainers, or WSL scenarios — return `unknown`.

### Pre-process categories (high-confidence signals)

- **rai-content-filters**: Copilot issues related to content and response filtering by Responsible AI Service. The issue MUST include "Responsible AI Service".
- **lm-unavailable**: Copilot issues where the user reports an error saying that the language model is unavailable. The issue should include "Language model unavailable" or similar phrases.
- **public-code-blocking**: Copilot issues related to the Copilot response being blocked due to matching public code.
- **rate-limiting**: Copilot issues related to Copilot API rate limits or throttling. This should NOT include issues about being charged "premium requests" or having quota deducted when the message failed; those belong in `billing`, not here. It MUST include "rate-limit" or "rate limit" with only minor misspellings allowed.

### Post-process categories

- **request-failed**: The user reports a failed API call and includes the error message "Sorry, your request failed. Please try again", along with a request ID or similar. Minor typos are acceptable.
- **no-response-returned**: Copilot issues where the API did not return any response. The issue explicitly mentions "Sorry, no response was returned", or a close variation with similar meaning. Minor typos are acceptable.
- **billing**: The issue is primarily a user-facing complaint about usage-based billing: AI credit or quota consumption, budget exhaustion, incorrect or unexpected limit-reached messages, or confusion about resets and remaining balance. This also includes issues that mention "billing", "usage based billing", "request allowance", "pro subscription", "Upgrade to Copilot Pro", "30-day free trial", or talk about issues with how a user is "charged" for certain aspects of the service. Do **not** return `billing` if the report is a distinct VS Code bug (UI, API, extension, editor, etc.) that merely mentions billing, or if it is a concrete feature request (e.g. spend caps, budget settings) — return `unknown` for those so they stay open on their own. Be conservative with this category.

### Fallback

- **unknown**: Issues that do not fit into any of the above categories or are unclear.

## Instructions

1. Read the issue title and body thoroughly.
2. Check each category in order (pre-process first, then post-process).
3. Assign the **first** matching category. Categories are intentionally ordered so that earlier, higher-confidence categories take priority.
4. Be strict — only assign a category when the issue clearly matches the described criteria.

## Output

The result is one of the following category names:

`rai-content-filters`
`lm-unavailable`
`public-code-blocking`
`rate-limiting`
`request-failed`
`no-response-returned`
`billing`
`unknown`
