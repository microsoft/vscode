/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	normalizeCookieDomain,
	normalizeCookieImportDomain,
	registrableFamily,
	isNonTransplantableCookieDomain,
	isGoogleSourceBoundCookie,
	readChromiumPartition,
	readFirefoxPartition,
	planImportWrites
} from '../../electron-main/browserCookieImportPlan.js';
import type { ICookieImportRawRow } from '../../electron-main/browserCookieImportReaders.js';

suite('BrowserCookieImportPlan', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---------------------------------------------------------------------------
	// normalizeCookieDomain
	// ---------------------------------------------------------------------------

	suite('normalizeCookieDomain', () => {
		test('normalizes valid domains', () => {
			assert.deepStrictEqual({
				simple: normalizeCookieDomain('example.com'),
				leadingDot: normalizeCookieDomain('.example.com'),
				multipleLeadingDots: normalizeCookieDomain('...example.com'),
				uppercase: normalizeCookieDomain('EXAMPLE.COM'),
				subdomain: normalizeCookieDomain('sub.example.com'),
				ipv4: normalizeCookieDomain('192.168.1.1'),
				localhost: normalizeCookieDomain('localhost'),
			}, {
				simple: 'example.com',
				leadingDot: 'example.com',
				multipleLeadingDots: 'example.com',
				uppercase: 'example.com',
				subdomain: 'sub.example.com',
				ipv4: '192.168.1.1',
				localhost: 'localhost',
			});
		});

		test('rejects unsafe domains', () => {
			assert.deepStrictEqual({
				empty: normalizeCookieDomain(''),
				pathSeparator: normalizeCookieDomain('example.com/path'),
				backslash: normalizeCookieDomain('example\\path'),
				atSign: normalizeCookieDomain('user@example.com'),
				questionMark: normalizeCookieDomain('example.com?query'),
				hash: normalizeCookieDomain('example.com#hash'),
				percent: normalizeCookieDomain('example%20.com'),
				port: normalizeCookieDomain('example.com:8080'),
			}, {
				empty: null,
				pathSeparator: null,
				backslash: null,
				atSign: null,
				questionMark: null,
				hash: null,
				percent: null,
				port: null,
			});
		});
	});

	// ---------------------------------------------------------------------------
	// normalizeCookieImportDomain
	// ---------------------------------------------------------------------------

	suite('normalizeCookieImportDomain', () => {
		test('accepts valid import domains', () => {
			assert.deepStrictEqual({
				simple: normalizeCookieImportDomain('example.com'),
				subdomain: normalizeCookieImportDomain('sub.example.com'),
				ipv4: normalizeCookieImportDomain('10.0.0.1'),
				localhost: normalizeCookieImportDomain('localhost'),
			}, {
				simple: 'example.com',
				subdomain: 'sub.example.com',
				ipv4: '10.0.0.1',
				localhost: 'localhost',
			});
		});

		test('rejects bare public suffixes and single-label non-localhost', () => {
			assert.deepStrictEqual({
				com: normalizeCookieImportDomain('com'),
				co: normalizeCookieImportDomain('co'),
				intranet: normalizeCookieImportDomain('intranet'),
			}, {
				com: null,
				co: null,
				intranet: null,
			});
		});
	});

	// ---------------------------------------------------------------------------
	// registrableFamily
	// ---------------------------------------------------------------------------

	suite('registrableFamily', () => {
		test('computes family correctly', () => {
			assert.deepStrictEqual({
				twoLabel: registrableFamily('example.com'),
				subdomain: registrableFamily('sub.example.com'),
				deepSubdomain: registrableFamily('a.b.c.example.com'),
				ipv4: registrableFamily('192.168.1.1'),
				localhost: registrableFamily('localhost'),
				invalid: registrableFamily(''),
			}, {
				twoLabel: 'example.com',
				subdomain: 'example.com',
				deepSubdomain: 'example.com',
				ipv4: '192.168.1.1',
				localhost: 'localhost',
				invalid: null,
			});
		});
	});

	// ---------------------------------------------------------------------------
	// Non-transplantable and source-bound checks
	// ---------------------------------------------------------------------------

	suite('nonTransplantable and sourceBound', () => {
		test('google.com is non-transplantable', () => {
			assert.deepStrictEqual({
				exact: isNonTransplantableCookieDomain('google.com'),
				subdomain: isNonTransplantableCookieDomain('mail.google.com'),
				youtube: isNonTransplantableCookieDomain('youtube.com'),
				github: isNonTransplantableCookieDomain('github.com'),
			}, {
				exact: true,
				subdomain: true,
				youtube: false,
				github: false,
			});
		});

		test('source-bound cookies detected on google.com only', () => {
			assert.deepStrictEqual({
				sidccGoogle: isGoogleSourceBoundCookie('SIDCC', 'google.com'),
				sidccOther: isGoogleSourceBoundCookie('SIDCC', 'example.com'),
				normalGoogle: isGoogleSourceBoundCookie('NID', 'google.com'),
				secure3psidcc: isGoogleSourceBoundCookie('__Secure-3PSIDCC', '.google.com'),
			}, {
				sidccGoogle: true,
				sidccOther: false,
				normalGoogle: false,
				secure3psidcc: true,
			});
		});
	});

	// ---------------------------------------------------------------------------
	// Partition reading
	// ---------------------------------------------------------------------------

	suite('partition reading', () => {
		test('chromium unpartitioned cookie', () => {
			const row = makeRow({ partitionSite: '', hasCrossSiteAncestor: null });
			assert.deepStrictEqual(readChromiumPartition(row), { status: 'unpartitioned' });
		});

		test('chromium partitioned cookie with valid site', () => {
			const row = makeRow({ partitionSite: 'https://example.com/', hasCrossSiteAncestor: true });
			assert.deepStrictEqual(readChromiumPartition(row), {
				status: 'partitioned',
				topLevelSite: 'https://example.com/',
				hasCrossSiteAncestor: true
			});
		});

		test('chromium partitioned cookie without cross-site ancestor column', () => {
			const row = makeRow({ partitionSite: 'https://example.com/', hasCrossSiteAncestor: null });
			const result = readChromiumPartition(row);
			assert.strictEqual(result.status, 'unreadable');
		});

		test('chromium invalid partition site URL', () => {
			const row = makeRow({ partitionSite: 'not-a-url', hasCrossSiteAncestor: true });
			const result = readChromiumPartition(row);
			assert.strictEqual(result.status, 'unreadable');
		});

		test('firefox unpartitioned', () => {
			const row = makeRow({ firefoxPartitionedAttribute: false });
			assert.deepStrictEqual(readFirefoxPartition(row), { status: 'unpartitioned' });
		});

		test('firefox partitioned attribute is unreadable', () => {
			const row = makeRow({ firefoxPartitionedAttribute: true });
			const result = readFirefoxPartition(row);
			assert.strictEqual(result.status, 'unreadable');
		});
	});

	// ---------------------------------------------------------------------------
	// planImportWrites — two-pass algorithm
	// ---------------------------------------------------------------------------

	suite('planImportWrites', () => {
		test('all-valid cookies produce writes with no skips', () => {
			const rows = [
				makeRow({ domain: 'example.com', name: 'a', decryptOutcome: 'ok' }),
				makeRow({ domain: 'example.com', name: 'b', decryptOutcome: 'ok' }),
			];
			const plan = planImportWrites(rows);
			assert.deepStrictEqual({
				writeCount: plan.writes.length,
				skipCount: plan.skips.length,
				hasUnrepresentableSkip: plan.hasUnrepresentableSkip,
				skippedFamiliesSize: plan.skippedFamilies.size,
			}, {
				writeCount: 2,
				skipCount: 0,
				hasUnrepresentableSkip: false,
				skippedFamiliesSize: 0,
			});
		});

		test('google cookies are skipped', () => {
			const rows = [
				makeRow({ domain: 'google.com', name: 'NID', decryptOutcome: 'ok' }),
				makeRow({ domain: 'example.com', name: 'session', decryptOutcome: 'ok' }),
			];
			const plan = planImportWrites(rows);
			assert.deepStrictEqual({
				writeCount: plan.writes.length,
				skipCount: plan.skips.length,
				skipReasons: plan.skips.map(s => s.reason),
			}, {
				writeCount: 1,
				skipCount: 1,
				skipReasons: ['non-transplantable-domain'],
			});
		});

		test('source-bound google cookies are skipped separately', () => {
			const rows = [
				makeRow({ domain: 'google.com', name: 'SIDCC', decryptOutcome: 'ok' }),
			];
			const plan = planImportWrites(rows);
			assert.deepStrictEqual({
				writeCount: plan.writes.length,
				skipReasons: plan.skips.map(s => s.reason),
			}, {
				writeCount: 0,
				skipReasons: ['google-source-bound'],
			});
		});

		test('failed decryption cookies are skipped', () => {
			const rows = [
				makeRow({ domain: 'example.com', name: 'a', decryptOutcome: 'app-bound' }),
				makeRow({ domain: 'example.com', name: 'b', decryptOutcome: 'ok' }),
			];
			const plan = planImportWrites(rows);
			assert.deepStrictEqual({
				writeCount: plan.writes.length,
				skipCount: plan.skips.length,
				skipReasons: plan.skips.map(s => s.reason),
			}, {
				writeCount: 1,
				skipCount: 1,
				skipReasons: ['decrypt-app-bound'],
			});
		});

		test('family-atomic skip: unreadable partition suppresses entire family', () => {
			const rows = [
				// This cookie has an unreadable partition → family gets skipped
				makeRow({
					domain: 'sub.example.com',
					name: 'partitioned',
					decryptOutcome: 'ok',
					partitionSite: 'https://evil.com/',
					hasCrossSiteAncestor: null // missing column → unreadable
				}),
				// Same family, perfectly readable — but must be suppressed
				makeRow({
					domain: 'example.com',
					name: 'normal',
					decryptOutcome: 'ok',
					partitionSite: '',
					hasCrossSiteAncestor: null
				}),
				// Different family — should NOT be affected
				makeRow({
					domain: 'other.org',
					name: 'safe',
					decryptOutcome: 'ok',
					partitionSite: '',
					hasCrossSiteAncestor: null
				}),
			];
			const plan = planImportWrites(rows);

			// The example.com family should be fully skipped (both cookies)
			// other.org should survive
			const writeNames = plan.writes.map(w => `${w.row.domain}/${w.row.name}`);
			const skipNames = plan.skips.map(s => `${s.row.domain}/${s.row.name}:${s.reason}`);

			assert.deepStrictEqual({
				writes: writeNames,
				skips: skipNames,
				skippedFamilies: [...plan.skippedFamilies],
			}, {
				writes: ['other.org/safe'],
				skips: [
					'sub.example.com/partitioned:source schema has no cross-site-ancestor column for a partitioned cookie',
					'example.com/normal:family-partition-unreadable'
				],
				skippedFamilies: ['example.com'],
			});
		});

		test('empty input produces empty plan', () => {
			const plan = planImportWrites([]);
			assert.deepStrictEqual({
				writeCount: plan.writes.length,
				skipCount: plan.skips.length,
				hasUnrepresentableSkip: plan.hasUnrepresentableSkip,
			}, {
				writeCount: 0,
				skipCount: 0,
				hasUnrepresentableSkip: false,
			});
		});
	});
});

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ICookieImportRawRow> = {}): ICookieImportRawRow {
	return {
		domain: overrides.domain ?? 'example.com',
		name: overrides.name ?? 'test',
		value: overrides.value ?? 'value',
		path: overrides.path ?? '/',
		secure: overrides.secure ?? false,
		httpOnly: overrides.httpOnly ?? false,
		sameSite: overrides.sameSite ?? 'unspecified',
		expirationDate: overrides.expirationDate,
		partitionSite: overrides.partitionSite ?? '',
		hasCrossSiteAncestor: overrides.hasCrossSiteAncestor ?? null,
		firefoxPartitionedAttribute: overrides.firefoxPartitionedAttribute ?? null,
		decryptOutcome: overrides.decryptOutcome ?? 'ok',
	};
}
