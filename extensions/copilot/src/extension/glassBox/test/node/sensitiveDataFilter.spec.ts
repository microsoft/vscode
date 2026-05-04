/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import {
	containsSensitiveData,
	redactSensitiveData,
	sanitizeLabel,
	sanitizePreview,
} from '../../common/sensitiveDataFilter';

describe('sensitiveDataFilter', () => {

	describe('redactSensitiveData', () => {
		it('should redact Bearer tokens', () => {
			const input = 'Authorization: Bearer ghp_1234567890abcdef1234567890abcdef12345678';
			const result = redactSensitiveData(input);
			expect(result).toContain('Bearer [REDACTED]');
			expect(result).not.toContain('ghp_');
		});

		it('should redact GitHub tokens', () => {
			const input = 'Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk';
			const result = redactSensitiveData(input);
			expect(result).toContain('[GITHUB_TOKEN_REDACTED]');
			expect(result).not.toContain('ghp_ABCD');
		});

		it('should redact gho_ tokens', () => {
			const input = 'gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk';
			const result = redactSensitiveData(input);
			expect(result).toContain('[GITHUB_TOKEN_REDACTED]');
		});

		it('should redact API keys in key=value format', () => {
			const input = 'api_key=sk_test_1234567890abcdefghij';
			const result = redactSensitiveData(input);
			expect(result).toContain('[API_KEY_REDACTED]');
		});

		it('should redact API keys with colon separator', () => {
			const input = 'api-key: MySecretKeyValue1234567890';
			const result = redactSensitiveData(input);
			expect(result).toContain('[API_KEY_REDACTED]');
		});

		it('should redact AWS access keys', () => {
			const input = 'AWS key: AKIAIOSFODNN7EXAMPLE';
			const result = redactSensitiveData(input);
			expect(result).toContain('[AWS_KEY_REDACTED]');
		});

		it('should redact connection strings', () => {
			const input = 'DATABASE_URL=postgres://user:pass@host:5432/db';
			const result = redactSensitiveData(input);
			expect(result).toContain('[CONNECTION_STRING_REDACTED]');
		});

		it('should redact mongodb connection strings', () => {
			const input = 'uri: mongodb://admin:secret@cluster.example.com:27017/mydb';
			const result = redactSensitiveData(input);
			expect(result).toContain('[CONNECTION_STRING_REDACTED]');
		});

		it('should redact password fields', () => {
			const input = 'password=MyS3cretP@ssw0rd';
			const result = redactSensitiveData(input);
			expect(result).toContain('[SECRET_REDACTED]');
		});

		it('should redact JWT-like tokens', () => {
			const input = 'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.abcdef';
			const result = redactSensitiveData(input);
			expect(result).toContain('[ENCODED_TOKEN_REDACTED]');
		});

		it('should not redact normal text', () => {
			const input = 'This is a normal message about coding in TypeScript.';
			const result = redactSensitiveData(input);
			expect(result).toBe(input);
		});

		it('should not redact short strings that look like hex', () => {
			const input = 'color: #ff00cc';
			const result = redactSensitiveData(input);
			expect(result).toBe(input);
		});

		it('should handle empty string', () => {
			expect(redactSensitiveData('')).toBe('');
		});

		it('should handle multiple sensitive patterns in one string', () => {
			const input = 'Bearer abc123def456 and password=secret123';
			const result = redactSensitiveData(input);
			expect(result).toContain('[REDACTED]');
			expect(result).toContain('[SECRET_REDACTED]');
		});
	});

	describe('sanitizePreview', () => {
		it('should return undefined for undefined input', () => {
			expect(sanitizePreview(undefined)).toBeUndefined();
		});

		it('should return undefined for empty string', () => {
			expect(sanitizePreview('')).toBeUndefined();
		});

		it('should truncate long content', () => {
			const longContent = 'a'.repeat(600);
			const result = sanitizePreview(longContent, 500);
			expect(result).toBeDefined();
			expect(result!.length).toBeLessThanOrEqual(520); // 500 + '\u2026 [truncated]'
			expect(result).toContain('\u2026 [truncated]');
		});

		it('should not truncate short content', () => {
			const input = 'Short message';
			expect(sanitizePreview(input)).toBe(input);
		});

		it('should redact sensitive data in preview', () => {
			const input = 'Config: api_key=sk_test_super_secret_key_12345';
			const result = sanitizePreview(input);
			expect(result).toBeDefined();
			expect(result).toContain('[API_KEY_REDACTED]');
		});

		it('should respect custom maxLength', () => {
			const input = 'a'.repeat(100);
			const result = sanitizePreview(input, 50);
			expect(result).toBeDefined();
			expect(result!.startsWith('a'.repeat(50))).toBe(true);
			expect(result).toContain('\u2026 [truncated]');
		});
	});

	describe('sanitizeLabel', () => {
		it('should replace Unix home directory paths', () => {
			expect(sanitizeLabel('/home/username/project/file.ts')).toBe('~/project/file.ts');
		});

		it('should replace macOS home directory paths', () => {
			expect(sanitizeLabel('/Users/username/project/file.ts')).toBe('~/project/file.ts');
		});

		it('should replace Windows home directory paths', () => {
			expect(sanitizeLabel('C:\\Users\\username\\project\\file.ts')).toBe('~\\project\\file.ts');
		});

		it('should redact sensitive data in labels', () => {
			const input = 'Bearer ghp_1234567890abcdef1234567890abcdef12345678';
			const result = sanitizeLabel(input);
			expect(result).not.toContain('ghp_');
		});

		it('should not modify clean labels', () => {
			expect(sanitizeLabel('system message')).toBe('system message');
		});
	});

	describe('containsSensitiveData', () => {
		it('should detect Bearer tokens', () => {
			expect(containsSensitiveData('Bearer abc123def456')).toBe(true);
		});

		it('should detect GitHub tokens', () => {
			expect(containsSensitiveData('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk')).toBe(true);
		});

		it('should detect passwords', () => {
			expect(containsSensitiveData('password=secret123')).toBe(true);
		});

		it('should not flag normal text', () => {
			expect(containsSensitiveData('This is a normal message')).toBe(false);
		});

		it('should not flag code snippets', () => {
			expect(containsSensitiveData('function hello() { return "world"; }')).toBe(false);
		});

		it('should handle empty string', () => {
			expect(containsSensitiveData('')).toBe(false);
		});
	});
});
