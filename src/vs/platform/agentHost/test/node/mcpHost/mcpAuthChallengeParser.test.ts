/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpAuthRequiredReason, McpServerStatusKind, type ProtectedResourceMetadata } from '../../../common/state/protocol/state.js';
import { buildAuthRequiredStatus, parseWwwAuthenticate } from '../../../node/mcpHost/mcpAuthChallengeParser.js';

suite('mcpAuthChallengeParser', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const emptyChallenge = {
		scopes: undefined,
		error: undefined,
		errorDescription: undefined,
		resourceMetadataUrl: undefined,
	};

	test('parseWwwAuthenticate returns all-undefined for missing or empty header', () => {
		assert.deepStrictEqual(parseWwwAuthenticate(undefined), emptyChallenge);
		assert.deepStrictEqual(parseWwwAuthenticate(''), emptyChallenge);
	});

	test('parseWwwAuthenticate returns all-undefined for non-Bearer scheme', () => {
		assert.deepStrictEqual(parseWwwAuthenticate('Basic realm="api"'), emptyChallenge);
	});

	test('parseWwwAuthenticate accepts Bearer with only realm', () => {
		assert.deepStrictEqual(parseWwwAuthenticate('Bearer realm="api"'), emptyChallenge);
	});

	test('parseWwwAuthenticate parses full challenge with quoted values', () => {
		const header = 'Bearer error="invalid_token", error_description="token expired", scope="read:user user:email", resource_metadata="https://example.com/.well-known/oauth-protected-resource"';
		assert.deepStrictEqual(parseWwwAuthenticate(header), {
			scopes: ['read:user', 'user:email'],
			error: 'invalid_token',
			errorDescription: 'token expired',
			resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
		});
	});

	test('parseWwwAuthenticate parses unquoted token values', () => {
		assert.deepStrictEqual(parseWwwAuthenticate('Bearer error=insufficient_scope'), {
			scopes: undefined,
			error: 'insufficient_scope',
			errorDescription: undefined,
			resourceMetadataUrl: undefined,
		});
	});

	const resource: ProtectedResourceMetadata = {
		resource: 'https://api.example.com',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['read', 'write'],
	};

	test('buildAuthRequiredStatus 401 without prior token → Required', () => {
		assert.deepStrictEqual(
			buildAuthRequiredStatus({
				httpStatus: 401,
				challenge: emptyChallenge,
				resource,
				hadPriorToken: false,
			}),
			{
				kind: McpServerStatusKind.AuthRequired,
				reason: McpAuthRequiredReason.Required,
				resource,
				requiredScopes: ['read', 'write'],
			},
		);
	});

	test('buildAuthRequiredStatus 401 with prior token → Expired', () => {
		const status = buildAuthRequiredStatus({
			httpStatus: 401,
			challenge: { ...emptyChallenge, scopes: ['only-this'] },
			resource,
			hadPriorToken: true,
		});
		assert.deepStrictEqual(status, {
			kind: McpServerStatusKind.AuthRequired,
			reason: McpAuthRequiredReason.Expired,
			resource,
			requiredScopes: ['only-this'],
		});
	});

	test('buildAuthRequiredStatus 403 + insufficient_scope → InsufficientScope', () => {
		const status = buildAuthRequiredStatus({
			httpStatus: 403,
			challenge: {
				scopes: ['admin'],
				error: 'insufficient_scope',
				errorDescription: 'need admin',
				resourceMetadataUrl: undefined,
			},
			resource,
			hadPriorToken: true,
		});
		assert.deepStrictEqual(status, {
			kind: McpServerStatusKind.AuthRequired,
			reason: McpAuthRequiredReason.InsufficientScope,
			resource,
			requiredScopes: ['admin'],
			description: 'need admin',
		});
	});

	test('buildAuthRequiredStatus 403 + other error → Required (conservative)', () => {
		const status = buildAuthRequiredStatus({
			httpStatus: 403,
			challenge: { ...emptyChallenge, error: 'invalid_token' },
			resource,
			hadPriorToken: true,
		});
		assert.deepStrictEqual(status, {
			kind: McpServerStatusKind.AuthRequired,
			reason: McpAuthRequiredReason.Required,
			resource,
			requiredScopes: ['read', 'write'],
		});
	});

	test('buildAuthRequiredStatus omits requiredScopes when absent everywhere', () => {
		const status = buildAuthRequiredStatus({
			httpStatus: 401,
			challenge: emptyChallenge,
			resource: { resource: 'https://api.example.com' },
			hadPriorToken: false,
		});
		assert.deepStrictEqual(status, {
			kind: McpServerStatusKind.AuthRequired,
			reason: McpAuthRequiredReason.Required,
			resource: { resource: 'https://api.example.com' },
		});
	});
});
