/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hasKey } from '../../../../base/common/types.js';
import { cookieIdentityUrl, buildSetCookieParams } from '../../electron-main/browserCookieImportHelpers.js';

suite('BrowserCookieImportStore', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---------------------------------------------------------------------------
	// cookieIdentityUrl
	// ---------------------------------------------------------------------------

	suite('cookieIdentityUrl', () => {
		test('builds correct URLs for various domain/path combinations', () => {
			assert.deepStrictEqual({
				normalDomainRootPath: cookieIdentityUrl('example.com', '/'),
				normalDomainSubPath: cookieIdentityUrl('example.com', '/api/v1'),
				dotPrefixDomain: cookieIdentityUrl('.example.com', '/'),
				dotPrefixSubPath: cookieIdentityUrl('.example.com', '/path'),
				pathWithoutLeadingSlash: cookieIdentityUrl('example.com', 'noslash'),
				localhost: cookieIdentityUrl('localhost', '/'),
				ipAddress: cookieIdentityUrl('192.168.1.1', '/admin'),
			}, {
				normalDomainRootPath: 'https://example.com/',
				normalDomainSubPath: 'https://example.com/api/v1',
				dotPrefixDomain: 'https://example.com/',
				dotPrefixSubPath: 'https://example.com/path',
				pathWithoutLeadingSlash: 'https://example.com/noslash',
				localhost: 'https://localhost/',
				ipAddress: 'https://192.168.1.1/admin',
			});
		});
	});

	// ---------------------------------------------------------------------------
	// buildSetCookieParams
	// ---------------------------------------------------------------------------

	suite('buildSetCookieParams', () => {
		test('maps all fields correctly for a standard cookie', () => {
			const params = buildSetCookieParams({
				domain: '.example.com',
				name: 'session_id',
				value: 'abc123',
				path: '/',
				secure: true,
				httpOnly: true,
				sameSite: 'lax',
				expirationDate: 1700000000,
			});

			assert.deepStrictEqual(params, {
				name: 'session_id',
				value: 'abc123',
				url: 'https://example.com/',
				domain: '.example.com',
				path: '/',
				secure: true,
				httpOnly: true,
				sameSite: 'Lax',
				expires: 1700000000,
			});
		});

		test('omits expires when expirationDate is undefined or zero', () => {
			const base = {
				domain: 'example.com',
				name: 'a',
				value: 'b',
				path: '/',
				secure: false,
				httpOnly: false,
				sameSite: 'unspecified' as const,
			};

			const withoutExpiry = buildSetCookieParams({ ...base, expirationDate: undefined });
			const withZeroExpiry = buildSetCookieParams({ ...base, expirationDate: 0 });

			assert.deepStrictEqual({
				hasExpiresUndefined: hasKey(withoutExpiry, 'expires'),
				hasExpiresZero: hasKey(withZeroExpiry, 'expires'),
			}, {
				hasExpiresUndefined: false,
				hasExpiresZero: false,
			});
		});

		test('maps sameSite values correctly', () => {
			const base = {
				domain: 'example.com',
				name: 'a',
				value: 'b',
				path: '/',
				secure: false,
				httpOnly: false,
				expirationDate: undefined,
			};

			assert.deepStrictEqual({
				unspecified: buildSetCookieParams({ ...base, sameSite: 'unspecified' }).sameSite,
				noRestriction: buildSetCookieParams({ ...base, sameSite: 'no_restriction' }).sameSite,
				lax: buildSetCookieParams({ ...base, sameSite: 'lax' }).sameSite,
				strict: buildSetCookieParams({ ...base, sameSite: 'strict' }).sameSite,
			}, {
				unspecified: 'Unspecified',
				noRestriction: 'None',
				lax: 'Lax',
				strict: 'Strict',
			});
		});

		test('includes partitionKey when provided', () => {
			const params = buildSetCookieParams(
				{
					domain: 'example.com',
					name: 'chips',
					value: 'val',
					path: '/',
					secure: true,
					httpOnly: false,
					sameSite: 'no_restriction',
					expirationDate: undefined,
				},
				'https://toplevel.site/'
			);

			assert.deepStrictEqual({
				hasPartitionKey: hasKey(params, 'partitionKey'),
				partitionKeyValue: params.partitionKey,
			}, {
				hasPartitionKey: true,
				partitionKeyValue: 'https://toplevel.site/',
			});
		});

		test('omits partitionKey when not provided', () => {
			const params = buildSetCookieParams({
				domain: 'example.com',
				name: 'no-chips',
				value: 'val',
				path: '/',
				secure: false,
				httpOnly: false,
				sameSite: 'unspecified',
				expirationDate: undefined,
			});

			assert.strictEqual(hasKey(params, 'partitionKey'), false);
		});
	});
});
