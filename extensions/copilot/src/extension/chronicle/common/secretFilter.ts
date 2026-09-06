/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Filters secrets from event data before sending to the cloud.
 *
 * Patterns are sourced from the CLI's SecretFilter (which uses GitHub Actions
 * log redaction patterns) — covering tokens, keys, passwords, and credentials.
 */

const REDACTED = '******';

/**
 * Regex patterns for detecting secrets in text.
 */
const SECRET_PATTERNS: RegExp[] = [
	// JWT tokens (eyJ... prefixed base64)
	/\b(?:eyJ0eXAiOi|eyJhbGciOi|eyJ4NXQiOi|eyJraWQiOi)[^\s'";]+/g,
	// Bearer tokens
	/\bBearer\s+[^\s'";]+/g,
	// Database connection passwords
	/\b(?:Password|Pwd)=(?:[^\s'";]+|"[^"]+")/gi,
	// GitHub v2 tokens (ghp_, gho_, ghu_, ghs_, ghr_)
	/\bgh[pousr]{1}_[A-Za-z0-9]{36}\b/g,
	// GitHub PAT v2 tokens
	/\bgithub_pat_[0-9][A-Za-z0-9]{21}_[A-Za-z0-9]{59}\b/g,
	// GitHub v1 installation tokens
	/\bv1\.[0-9A-Fa-f]{40}\b/g,
	// Basic auth in URIs (redact user:password)
	/(?:[a-zA-Z][\w+-.]*):\/\/([^\s:@]+):([^\s@]*)@/g,
	// AAD client passwords
	/\b[\w~.-]{3}7Q~[\w~.-]{31}\b|\b[\w~.-]{3}8Q~[\w~.-]{34}\b/g,
	// npm author tokens
	/\bnpm_[0-9A-Za-z]{36}\b/g,
	// OpenAI API keys
	/\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/g,
	// Generic API key patterns (key=..., api_key=..., apikey=...)
	/\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
	// AWS access keys
	/\bAKIA[0-9A-Z]{16}\b/g,
	// Azure keys (64-byte)
	/\b[0-9A-Za-z+/]{76}(?:APIM|ACDb|\+(?:ABa|AMC|ASt))[0-9A-Za-z+/]{5}[AQgw]==/g,
	// Azure keys (32-byte)
	/\b[0-9A-Za-z+/]{33}(?:AIoT|\+(?:ASb|AEh|ARm))[A-P][0-9A-Za-z+/]{5}=/g,
	// NuGet API keys
	/\boy2[a-p][0-9a-z]{15}[aq][0-9a-z]{11}[eu][bdfhjlnprtvxz357][a-p][0-9a-z]{11}[aeimquy4]\b/g,

	// ── VS Code-specific patterns ───────────────────────────────────────────
	// Private key blocks (RSA, EC, DSA, OPENSSH, PGP, etc.)
	/-----BEGIN[A-Z\s]*PRIVATE KEY-----[\s\S]*?-----END[A-Z\s]*PRIVATE KEY-----/g,
	// Connection string URIs with embedded credentials (mongodb, postgres, redis, amqp, mysql)
	/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|rediss|amqps?):\/\/[^\s'"]+/gi,
	// Azure SAS tokens (query string with sig= parameter)
	/[?&]sig=[A-Za-z0-9%+/=]{20,}[^&\s]*/g,
	// Slack/Discord webhook URLs
	/\bhttps?:\/\/(?:hooks\.slack\.com\/services|discord(?:app)?\.com\/api\/webhooks)\/[^\s'"]+/g,
	// Azure Function Host/Master keys
	/\b[0-9A-Za-z_-]{44}AzFu[0-9A-Za-z\-_]{5}[AQgw]==/g,
	// GHCR presigned URLs
	/\bx-ghcr-signature=[^&\s]+/g,
];

// ── Dynamic secret values (collected at runtime) ────────────────────────────────

/**
 * Environment variable names whose values should be treated as secrets.
 */
const SECRET_ENV_VAR_NAMES = [
	'GITHUB_TOKEN',
	'GITHUB_COPILOT_GITHUB_TOKEN',
	'COPILOT_GITHUB_TOKEN',
	'GITHUB_COPILOT_API_TOKEN',
	'GITHUB_PERSONAL_ACCESS_TOKEN',
	'OPENAI_API_KEY',
	'AZURE_OPENAI_API_KEY',
	'ANTHROPIC_API_KEY',
	'COPILOT_PROVIDER_API_KEY',
	'COPILOT_PROVIDER_BEARER_TOKEN',
	'NPM_TOKEN',
	'NODE_AUTH_TOKEN',
	'AWS_SECRET_ACCESS_KEY',
	'AWS_SESSION_TOKEN',
	'AZURE_CLIENT_SECRET',
	'DOCKER_PASSWORD',
];

/** Collected secret values (plaintext + base64). Populated lazily. */
let dynamicSecrets: Set<string> | undefined;

/**
 * Collect secret values from environment variables.
 * Each value is stored in both plaintext and base64-encoded form.
 */
function getDynamicSecrets(): Set<string> {
	if (dynamicSecrets) {
		return dynamicSecrets;
	}
	dynamicSecrets = new Set<string>();
	for (const varName of SECRET_ENV_VAR_NAMES) {
		const value = process.env[varName];
		if (value && value.trim().length > 0) {
			const trimmed = value.trim();
			dynamicSecrets.add(trimmed);
			// Also add base64 form — secrets may appear base64-encoded in logs/output
			dynamicSecrets.add(Buffer.from(trimmed, 'utf8').toString('base64'));
		}
	}
	return dynamicSecrets;
}

/**
 * Register additional secret values at runtime (e.g., auth tokens obtained after init).
 * Values are stored in both plaintext and base64-encoded form.
 */
export function addSecretValues(...values: string[]): void {
	const secrets = getDynamicSecrets();
	for (const value of values) {
		if (value && value.trim().length > 0) {
			const trimmed = value.trim();
			secrets.add(trimmed);
			secrets.add(Buffer.from(trimmed, 'utf8').toString('base64'));
		}
	}
}

/**
 * Replace all secret patterns and known secret values in a string.
 */
export function filterSecrets(text: string): string {
	let result = text;

	// 1. Regex-based pattern matching
	for (const pattern of SECRET_PATTERNS) {
		pattern.lastIndex = 0;
		result = result.replace(pattern, REDACTED);
	}

	// 2. Literal value matching (dynamic secrets from env vars and runtime)
	for (const secret of getDynamicSecrets()) {
		if (secret.length >= 8) {
			result = result.replaceAll(secret, REDACTED);
		}
	}

	return result;
}

/**
 * Recursively filter secrets from an object, returning a new object.
 * Handles strings, arrays, and nested objects. Non-string primitives pass through.
 */
export function filterSecretsFromObj<T>(obj: T): T {
	if (obj === null || obj === undefined) {
		return obj;
	}
	if (typeof obj === 'string') {
		return filterSecrets(obj) as T;
	}
	if (typeof obj !== 'object') {
		return obj;
	}
	if (Array.isArray(obj)) {
		return obj.map(item => filterSecretsFromObj(item)) as T;
	}
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
		result[key] = filterSecretsFromObj(value);
	}
	return result as T;
}
