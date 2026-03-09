// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import path from 'path';
import type { ContextSource, TrustLevel } from '../types';

/**
 * Resolves the trust level for a given context source.
 *
 * Trust levels determine how aggressively content is sanitised:
 * - trusted: no sanitisation (system prompts, CLAUDE.md)
 * - high: light sanitisation (project source code)
 * - medium: full sanitisation (docs, MCP, extension context)
 * - low: heavy sanitisation (dependencies)
 * - untrusted: full sanitisation + always warn (external content)
 */
export function resolveTrustLevel(source: ContextSource): TrustLevel {
	// System prompt and user messages are trusted
	if (source.type === 'system-prompt' || source.type === 'user-message') {
		return 'trusted';
	}

	// Project config files (CLAUDE.md, etc.) are trusted
	if (source.type === 'project-config') {
		return 'trusted';
	}

	// External content is always untrusted
	if (source.type === 'external-content') {
		return 'untrusted';
	}

	// MCP content gets medium trust
	if (source.type === 'mcp-tool-description' || source.type === 'mcp-tool-response') {
		return 'medium';
	}

	// Extension context gets medium trust
	if (source.type === 'extension-context') {
		return 'medium';
	}

	// For source code and documentation, use file path heuristics
	if (source.path) {
		return resolveTrustFromPath(source.path);
	}

	// Default to medium trust
	return 'medium';
}

/** Resolve trust level based on file path. */
function resolveTrustFromPath(filePath: string): TrustLevel {
	const normalised = filePath.replace(/\\/g, '/');

	// Project constitution files are trusted
	const trustedFiles = [
		'CLAUDE.md',
		'.claude/CLAUDE.md',
		'.son-of-anton/config.json',
	];
	const basename = path.basename(normalised);
	if (trustedFiles.some(f => normalised.endsWith(f))) {
		return 'trusted';
	}

	// Dependency directories get low trust
	const lowTrustDirs = [
		'node_modules/',
		'vendor/',
		'.cargo/registry/',
		'__pycache__/',
		'.venv/',
		'site-packages/',
		'target/debug/deps/',
		'target/release/deps/',
	];
	if (lowTrustDirs.some(dir => normalised.includes(dir))) {
		return 'low';
	}

	// Documentation files get medium trust
	const docExtensions = ['.md', '.mdx', '.rst', '.txt', '.adoc'];
	const docFiles = ['README', 'CHANGELOG', 'CONTRIBUTING', 'LICENSE', 'NOTICE'];
	const ext = path.extname(normalised).toLowerCase();
	const name = path.basename(normalised, ext).toUpperCase();

	if (docExtensions.includes(ext) || docFiles.includes(name)) {
		return 'medium';
	}

	// Documentation directories get medium trust
	if (normalised.includes('/docs/') || normalised.includes('/doc/')) {
		return 'medium';
	}

	// Source code files get high trust
	const codeExtensions = [
		'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
		'.py', '.rs', '.go', '.java', '.cs', '.cpp', '.c', '.h',
		'.rb', '.php', '.swift', '.kt', '.scala',
	];
	if (codeExtensions.includes(ext)) {
		return 'high';
	}

	// Config files get medium trust
	const configExtensions = ['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg'];
	if (configExtensions.includes(ext)) {
		return 'medium';
	}

	// Default to medium
	return 'medium';
}

/** Trust level numeric ordering for comparison. */
const TRUST_ORDER: Record<TrustLevel, number> = {
	trusted: 4,
	high: 3,
	medium: 2,
	low: 1,
	untrusted: 0,
};

/** Check if a trust level meets the minimum required level. */
export function meetsTrustLevel(level: TrustLevel, minimum: TrustLevel): boolean {
	return TRUST_ORDER[level] >= TRUST_ORDER[minimum];
}
