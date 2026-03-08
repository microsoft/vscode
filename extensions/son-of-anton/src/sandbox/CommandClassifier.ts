/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Permission level for a sandbox command.
 */
export type PermissionLevel = 'allowed' | 'confirm' | 'blocked';

/**
 * Result of classifying a command.
 */
export interface ClassificationResult {
	level: PermissionLevel;
	reason: string;
	command: string;
}

/**
 * Patterns for blocked commands — these are never permitted.
 */
const BLOCKED_PATTERNS: { pattern: RegExp; reason: string }[] = [
	{ pattern: /\brm\s+(-\w*r\w*f|--recursive)\s+\/\s*$/, reason: 'Recursive delete of root filesystem' },
	{ pattern: /\brm\s+-\w*rf?\s+\/\s*$/, reason: 'Recursive delete of root filesystem' },
	{ pattern: /\bDROP\s+(TABLE|DATABASE)\b/i, reason: 'Database destructive operation' },
	{ pattern: /\bgit\s+push\s+--force\b/, reason: 'Force push is blocked' },
	{ pattern: /\bgit\s+push\s+-f\b/, reason: 'Force push is blocked' },
	{ pattern: /\bsudo\b/, reason: 'Privilege escalation not permitted' },
	{ pattern: /\bsu\s+/, reason: 'Privilege escalation not permitted' },
	{ pattern: /\bchmod\s+[0-7]*s/, reason: 'Setuid/setgid modification not permitted' },
	{ pattern: /\bmkfs\b/, reason: 'Filesystem formatting not permitted' },
	{ pattern: /\bdd\s+.*of=\/dev\//, reason: 'Raw device write not permitted' },
	{ pattern: />\s*\/dev\/[sh]d/, reason: 'Raw device write not permitted' },
	{ pattern: /\b:(){ :\|:& };:/, reason: 'Fork bomb detected' },
];

/**
 * Patterns for commands that modify .env files.
 */
const ENV_FILE_PATTERNS: RegExp[] = [
	/\b(cat|echo|printf|tee|sed|awk|vi|vim|nano|>\s*)\s*.*\.env\b/,
	/\.env\b.*\b(>>|>)\b/,
];

/**
 * Patterns for allowed commands — no confirmation needed.
 */
const ALLOWED_PATTERNS: { pattern: RegExp; reason: string }[] = [
	{ pattern: /\bnpm\s+test\b/, reason: 'Running tests' },
	{ pattern: /\bnpx\s+jest\b/, reason: 'Running tests' },
	{ pattern: /\bnpx\s+vitest\b/, reason: 'Running tests' },
	{ pattern: /\bpytest\b/, reason: 'Running tests' },
	{ pattern: /\bcargo\s+test\b/, reason: 'Running tests' },
	{ pattern: /\bdotnet\s+test\b/, reason: 'Running tests' },
	{ pattern: /\bnpm\s+run\s+test\b/, reason: 'Running tests' },
	{ pattern: /\bnpm\s+run\s+lint\b/, reason: 'Running linter' },
	{ pattern: /\bnpx\s+eslint\b/, reason: 'Running linter' },
	{ pattern: /\bnpx\s+prettier\b/, reason: 'Running formatter' },
	{ pattern: /\btsc\s+--noEmit\b/, reason: 'Type checking' },
	{ pattern: /\bmypy\b/, reason: 'Type checking' },
	{ pattern: /\bpyright\b/, reason: 'Type checking' },
	{ pattern: /\bcargo\s+check\b/, reason: 'Type checking' },
	{ pattern: /\bcargo\s+clippy\b/, reason: 'Running linter' },
	{ pattern: /\bcat\s+/, reason: 'Reading file' },
	{ pattern: /\bls\b/, reason: 'Listing files' },
	{ pattern: /\bfind\s+/, reason: 'Finding files' },
	{ pattern: /\bgrep\b/, reason: 'Searching files' },
	{ pattern: /\bhead\b/, reason: 'Reading file' },
	{ pattern: /\btail\b/, reason: 'Reading file' },
	{ pattern: /\bwc\b/, reason: 'Counting' },
	{ pattern: /\bnpm\s+install\b/, reason: 'Installing dependencies' },
	{ pattern: /\bnpm\s+ci\b/, reason: 'Installing dependencies' },
	{ pattern: /\byarn\s+install\b/, reason: 'Installing dependencies' },
	{ pattern: /\byarn\s+add\b/, reason: 'Installing dependencies' },
	{ pattern: /\bpip\s+install\b/, reason: 'Installing dependencies' },
	{ pattern: /\bcargo\s+build\b/, reason: 'Building project' },
	{ pattern: /\bnpm\s+run\s+build\b/, reason: 'Building project' },
	{ pattern: /\bsemgrep\b/, reason: 'Security scanning' },
	{ pattern: /\btrivy\b/, reason: 'Dependency scanning' },
];

/**
 * Patterns for commands requiring confirmation.
 */
const CONFIRM_PATTERNS: { pattern: RegExp; reason: string }[] = [
	{ pattern: /\brm\s+/, reason: 'Deleting files' },
	{ pattern: /\bgit\s+push\b/, reason: 'Pushing to remote' },
	{ pattern: /\bgit\s+reset\b/, reason: 'Resetting git state' },
	{ pattern: /\bgit\s+checkout\s+--/, reason: 'Discarding changes' },
	{ pattern: /\bapt-get\s+install\b/, reason: 'Installing system packages' },
	{ pattern: /\bapk\s+add\b/, reason: 'Installing system packages' },
	{ pattern: /\bcurl\b/, reason: 'Network request' },
	{ pattern: /\bwget\b(?!.*trivy)/, reason: 'Network request' },
	{ pattern: /\bmv\s+/, reason: 'Moving/renaming files' },
	{ pattern: /\bchmod\b/, reason: 'Changing file permissions' },
	{ pattern: /\bchown\b/, reason: 'Changing file ownership' },
];

/**
 * Network allowlist for sandbox containers.
 */
export const NETWORK_ALLOWLIST: string[] = [
	'localhost',
	'127.0.0.1',
	'registry.npmjs.org',
	'pypi.org',
	'files.pythonhosted.org',
	'crates.io',
	'static.crates.io',
	'github.com',
	'api.github.com',
];

/**
 * Classifies a shell command into a permission level.
 * Commands are checked against blocked, allowed, and confirm patterns.
 * Unknown commands default to 'confirm'.
 */
export function classifyCommand(command: string): ClassificationResult {
	const trimmed = command.trim();

	// Check blocked patterns first
	for (const { pattern, reason } of BLOCKED_PATTERNS) {
		if (pattern.test(trimmed)) {
			return { level: 'blocked', reason, command: trimmed };
		}
	}

	// Check .env file modifications
	for (const pattern of ENV_FILE_PATTERNS) {
		if (pattern.test(trimmed)) {
			return { level: 'blocked', reason: 'Modifying .env files with secrets', command: trimmed };
		}
	}

	// Check allowed patterns
	for (const { pattern, reason } of ALLOWED_PATTERNS) {
		if (pattern.test(trimmed)) {
			return { level: 'allowed', reason, command: trimmed };
		}
	}

	// Check confirm patterns
	for (const { pattern, reason } of CONFIRM_PATTERNS) {
		if (pattern.test(trimmed)) {
			return { level: 'confirm', reason, command: trimmed };
		}
	}

	// Default: require confirmation for unknown commands
	return { level: 'confirm', reason: 'Unknown command — requires confirmation', command: trimmed };
}
