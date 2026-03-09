// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustLevel, meetsTrustLevel } from '../src/trust/trustResolver';
import type { ContextSource } from '../src/types';

describe('resolveTrustLevel', () => {
	test('system prompts are trusted', () => {
		assert.equal(resolveTrustLevel({ type: 'system-prompt' }), 'trusted');
	});

	test('user messages are trusted', () => {
		assert.equal(resolveTrustLevel({ type: 'user-message' }), 'trusted');
	});

	test('project config is trusted', () => {
		assert.equal(resolveTrustLevel({ type: 'project-config' }), 'trusted');
	});

	test('external content is untrusted', () => {
		assert.equal(resolveTrustLevel({ type: 'external-content' }), 'untrusted');
	});

	test('MCP tool descriptions are medium trust', () => {
		assert.equal(resolveTrustLevel({ type: 'mcp-tool-description' }), 'medium');
		assert.equal(resolveTrustLevel({ type: 'mcp-tool-response' }), 'medium');
	});

	test('source code files are high trust', () => {
		assert.equal(resolveTrustLevel({ type: 'source-code', path: 'src/app.ts' }), 'high');
		assert.equal(resolveTrustLevel({ type: 'source-code', path: 'lib/utils.py' }), 'high');
		assert.equal(resolveTrustLevel({ type: 'source-code', path: 'main.rs' }), 'high');
	});

	test('documentation files are medium trust', () => {
		assert.equal(resolveTrustLevel({ type: 'documentation', path: 'README.md' }), 'medium');
		assert.equal(resolveTrustLevel({ type: 'documentation', path: 'docs/guide.md' }), 'medium');
	});

	test('dependency files are low trust', () => {
		assert.equal(resolveTrustLevel({ type: 'source-code', path: 'node_modules/pkg/index.js' }), 'low');
		assert.equal(resolveTrustLevel({ type: 'source-code', path: 'vendor/lib/utils.go' }), 'low');
	});

	test('CLAUDE.md is trusted', () => {
		assert.equal(resolveTrustLevel({ type: 'source-code', path: 'CLAUDE.md' }), 'trusted');
		assert.equal(resolveTrustLevel({ type: 'source-code', path: '.claude/CLAUDE.md' }), 'trusted');
	});
});

describe('meetsTrustLevel', () => {
	test('trusted meets all levels', () => {
		assert.ok(meetsTrustLevel('trusted', 'trusted'));
		assert.ok(meetsTrustLevel('trusted', 'high'));
		assert.ok(meetsTrustLevel('trusted', 'medium'));
		assert.ok(meetsTrustLevel('trusted', 'low'));
		assert.ok(meetsTrustLevel('trusted', 'untrusted'));
	});

	test('untrusted only meets untrusted', () => {
		assert.ok(meetsTrustLevel('untrusted', 'untrusted'));
		assert.ok(!meetsTrustLevel('untrusted', 'low'));
		assert.ok(!meetsTrustLevel('untrusted', 'medium'));
		assert.ok(!meetsTrustLevel('untrusted', 'high'));
		assert.ok(!meetsTrustLevel('untrusted', 'trusted'));
	});

	test('medium meets medium and below', () => {
		assert.ok(meetsTrustLevel('medium', 'medium'));
		assert.ok(meetsTrustLevel('medium', 'low'));
		assert.ok(meetsTrustLevel('medium', 'untrusted'));
		assert.ok(!meetsTrustLevel('medium', 'high'));
		assert.ok(!meetsTrustLevel('medium', 'trusted'));
	});
});
