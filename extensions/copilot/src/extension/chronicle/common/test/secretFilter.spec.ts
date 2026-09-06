/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { addSecretValues, filterSecrets, filterSecretsFromObj } from '../secretFilter';

describe('filterSecrets', () => {
	it('redacts GitHub PAT tokens (ghp_)', () => {
		const input = 'token is ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234';
		expect(filterSecrets(input)).toBe('token is ******');
	});

	it('redacts GitHub OAuth tokens (gho_)', () => {
		const input = 'gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234';
		expect(filterSecrets(input)).toBe('******');
	});

	it('redacts Bearer tokens', () => {
		const input = 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
		expect(filterSecrets(input)).not.toContain('eyJhbGciOi');
		expect(filterSecrets(input)).toContain('******');
	});

	it('redacts JWT tokens', () => {
		const input = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
		expect(filterSecrets(input)).toBe('******');
	});

	it('redacts database connection passwords', () => {
		const input = 'Server=myserver;Password=MySecretPass123;Database=mydb';
		expect(filterSecrets(input)).not.toContain('MySecretPass123');
		expect(filterSecrets(input)).toContain('******');
	});

	it('redacts basic auth in URIs', () => {
		const input = 'https://user:secretpassword@github.com/repo';
		expect(filterSecrets(input)).not.toContain('secretpassword');
	});

	it('redacts npm tokens', () => {
		const input = 'npm_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
		expect(filterSecrets(input)).toBe('******');
	});

	it('redacts AWS access keys', () => {
		const input = 'key is AKIAIOSFODNN7EXAMPLE';
		expect(filterSecrets(input)).toBe('key is ******');
	});

	it('redacts github_pat tokens', () => {
		const input = 'github_pat_1ABCDEFGHIJKLMNOPQRSTU_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456';
		expect(filterSecrets(input)).toBe('******');
	});

	it('preserves text without secrets', () => {
		const input = 'This is a normal message with no secrets at all.';
		expect(filterSecrets(input)).toBe(input);
	});

	it('handles empty string', () => {
		expect(filterSecrets('')).toBe('');
	});

	it('redacts multiple secrets in one string', () => {
		const input = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234, npm: npm_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
		const result = filterSecrets(input);
		expect(result).not.toContain('ghp_');
		expect(result).not.toContain('npm_');
	});

	// ── VS Code-specific patterns ───────────────────────────────────────────

	it('redacts RSA private key blocks', () => {
		const input = 'key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----\ndone';
		const result = filterSecrets(input);
		expect(result).not.toContain('MIIEowIBAAKCAQEA');
		expect(result).toContain('******');
		expect(result).toContain('done');
	});

	it('redacts OPENSSH private key blocks', () => {
		const input = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA...\n-----END OPENSSH PRIVATE KEY-----';
		expect(filterSecrets(input)).toBe('******');
	});

	it('redacts MongoDB connection strings', () => {
		const input = 'db: mongodb+srv://admin:secretpass@cluster0.abc.mongodb.net/mydb';
		const result = filterSecrets(input);
		expect(result).not.toContain('secretpass');
		expect(result).toContain('******');
	});

	it('redacts PostgreSQL connection strings', () => {
		const input = 'url: postgres://user:password123@db.example.com:5432/mydb';
		const result = filterSecrets(input);
		expect(result).not.toContain('password123');
	});

	it('redacts Redis connection strings', () => {
		const input = 'redis://default:mytoken@redis-12345.cloud.redislabs.com:6379';
		const result = filterSecrets(input);
		expect(result).not.toContain('mytoken');
	});

	it('redacts Azure SAS tokens', () => {
		const input = 'https://storage.blob.core.windows.net/container/blob?sv=2021-06-08&ss=bfqt&sig=ABCDEFabcdef123456789%2B%2Fxyz%3D%3D';
		const result = filterSecrets(input);
		expect(result).not.toContain('ABCDEFabcdef123456789');
	});

	it('redacts Slack webhook URLs', () => {
		// Use concatenation to avoid GitHub push protection triggering on this test
		const slackUrl = 'https://hooks.slack.com' + '/services/TXXXXXXXX/BXXXXXXXX/xxxxxxxxxxxxxxxxxxxxxxxx';
		const input = `webhook: ${slackUrl}`;
		const result = filterSecrets(input);
		expect(result).not.toContain('TXXXXXXXX/BXXXXXXXX');
		expect(result).toContain('******');
	});

	it('redacts Discord webhook URLs', () => {
		const input = 'https://discord.com/api/webhooks/123456789/ABCDEFtoken';
		const result = filterSecrets(input);
		expect(result).not.toContain('ABCDEFtoken');
	});

	// ── Dynamic secret values ───────────────────────────────────────────────

	it('redacts dynamically registered secret values', () => {
		addSecretValues('my-runtime-secret-token-12345');
		const input = 'using token my-runtime-secret-token-12345 for auth';
		expect(filterSecrets(input)).not.toContain('my-runtime-secret-token-12345');
		expect(filterSecrets(input)).toContain('******');
	});

	it('redacts base64-encoded form of dynamic secrets', () => {
		addSecretValues('another-secret-value');
		const base64 = Buffer.from('another-secret-value', 'utf8').toString('base64');
		const input = `encoded: ${base64}`;
		expect(filterSecrets(input)).not.toContain(base64);
	});

	it('ignores short values (< 8 chars) to avoid false positives', () => {
		addSecretValues('short');
		const input = 'this is a short word';
		// 'short' is < 8 chars so should NOT be redacted
		expect(filterSecrets(input)).toContain('short');
	});
});

describe('filterSecretsFromObj', () => {
	it('filters strings in object values', () => {
		const obj = { content: 'token is ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234' };
		const result = filterSecretsFromObj(obj);
		expect(result.content).not.toContain('ghp_');
		expect(result.content).toContain('******');
	});

	it('returns new object (does not mutate original)', () => {
		const original = { content: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234' };
		const filtered = filterSecretsFromObj(original);
		expect(original.content).toContain('ghp_');
		expect(filtered.content).not.toContain('ghp_');
	});

	it('filters nested objects recursively', () => {
		const obj = {
			type: 'user.message',
			data: {
				content: 'Use token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234',
				nested: {
					secret: 'Bearer my-secret-token-here',
				},
			},
		};
		const result = filterSecretsFromObj(obj);
		expect(result.data.content).not.toContain('ghp_');
		expect(result.data.nested.secret).toContain('******');
	});

	it('filters arrays', () => {
		const arr = ['normal', 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234'];
		const result = filterSecretsFromObj(arr);
		expect(result[0]).toBe('normal');
		expect(result[1]).toBe('******');
	});

	it('passes through null and undefined', () => {
		expect(filterSecretsFromObj(null)).toBeNull();
		expect(filterSecretsFromObj(undefined)).toBeUndefined();
	});

	it('passes through numbers and booleans', () => {
		expect(filterSecretsFromObj(42)).toBe(42);
		expect(filterSecretsFromObj(true)).toBe(true);
	});
});
