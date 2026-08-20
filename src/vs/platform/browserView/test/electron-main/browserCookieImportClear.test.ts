/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { ICdpCookie, ICookieIdentity } from '../../electron-main/browserCookieImportStore.js';
import { cookieIdentityUrl } from '../../electron-main/browserCookieImportHelpers.js';

/**
 * Minimal CDP mock that records calls without requiring Electron.
 * The clear module only uses getAllCookies, deleteCookie, and writeCookie.
 */
class MockCdpSession {
	readonly deletedIdentities: ICookieIdentity[] = [];
	readonly writtenParams: Record<string, unknown>[] = [];
	private _cookies: ICdpCookie[];

	constructor(cookies: ICdpCookie[]) {
		this._cookies = cookies;
	}

	async getAllCookies(): Promise<ICdpCookie[]> {
		return [...this._cookies];
	}

	async deleteCookie(identity: ICookieIdentity): Promise<void> {
		this.deletedIdentities.push(identity);
		this._cookies = this._cookies.filter(
			(c) => !(c.name === identity.name && c.domain === identity.domain && c.path === identity.path)
		);
	}

	async writeCookie(params: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
		this.writtenParams.push(params);
		return { ok: true };
	}

	dispose(): void { /* noop */ }
}

function makeCdpCookie(overrides: Partial<ICdpCookie> = {}): ICdpCookie {
	return {
		name: overrides.name ?? 'test',
		value: overrides.value ?? 'val',
		domain: overrides.domain ?? '.example.com',
		path: overrides.path ?? '/',
		expires: overrides.expires ?? -1,
		size: overrides.size ?? 10,
		httpOnly: overrides.httpOnly ?? false,
		secure: overrides.secure ?? false,
		session: overrides.session ?? true,
		sameSite: overrides.sameSite ?? 'Unspecified',
		priority: overrides.priority ?? 'Medium',
		sameParty: overrides.sameParty ?? false,
		sourceScheme: overrides.sourceScheme ?? 'Unset',
		sourcePort: overrides.sourcePort ?? 80,
	};
}

suite('BrowserCookieImportClear', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// We import dynamically to avoid pulling in Electron at module load time
	// in the test runner. The clear module imports BrowserCookieImportCdpSession
	// which references Electron types.
	let removeTransplantableCookies: typeof import('../../electron-main/browserCookieImportClear.js').removeTransplantableCookies;
	let rollbackClear: typeof import('../../electron-main/browserCookieImportClear.js').rollbackClear;

	suiteSetup(async () => {
		const mod = await import('../../electron-main/browserCookieImportClear.js');
		removeTransplantableCookies = mod.removeTransplantableCookies;
		rollbackClear = mod.rollbackClear;
	});

	suite('removeTransplantableCookies', () => {
		test('removes only cookies matching transplantable families', async () => {
			const mock = new MockCdpSession([
				makeCdpCookie({ name: 'a', domain: '.example.com' }),
				makeCdpCookie({ name: 'b', domain: '.example.com', path: '/api' }),
				makeCdpCookie({ name: 'c', domain: '.other.org' }),
				makeCdpCookie({ name: 'd', domain: '.github.com' }),
			]);

			const families = new Set(['example.com']);
			const result = await removeTransplantableCookies(mock as never, families);

			assert.deepStrictEqual({
				removedCount: result.removedCount,
				snapshotLength: result.snapshot.length,
				deletedNames: mock.deletedIdentities.map(i => i.name).sort(),
				remainingCookies: (await mock.getAllCookies()).map(c => `${c.domain}/${c.name}`).sort(),
			}, {
				removedCount: 2,
				snapshotLength: 2,
				deletedNames: ['a', 'b'],
				remainingCookies: ['.github.com/d', '.other.org/c'],
			});
		});

		test('snapshot captures cookie identity for rollback', async () => {
			const mock = new MockCdpSession([
				makeCdpCookie({ name: 'session', domain: '.example.com', value: 'abc', secure: true }),
			]);

			const families = new Set(['example.com']);
			const result = await removeTransplantableCookies(mock as never, families);

			assert.deepStrictEqual({
				snapshotName: result.snapshot[0].name,
				snapshotValue: result.snapshot[0].value,
				snapshotDomain: result.snapshot[0].domain,
				snapshotSecure: result.snapshot[0].secure,
				snapshotUrl: result.snapshot[0].url,
			}, {
				snapshotName: 'session',
				snapshotValue: 'abc',
				snapshotDomain: '.example.com',
				snapshotSecure: true,
				snapshotUrl: cookieIdentityUrl('.example.com', '/'),
			});
		});

		test('empty jar produces zero removals', async () => {
			const mock = new MockCdpSession([]);
			const result = await removeTransplantableCookies(mock as never, new Set(['example.com']));

			assert.deepStrictEqual({
				removedCount: result.removedCount,
				snapshotLength: result.snapshot.length,
			}, {
				removedCount: 0,
				snapshotLength: 0,
			});
		});
	});

	suite('rollbackClear', () => {
		test('restores cookies from snapshot', async () => {
			const mock = new MockCdpSession([]);
			const snapshot = [
				{
					name: 'restored',
					value: 'original-value',
					domain: '.example.com',
					path: '/',
					secure: true,
					httpOnly: false,
					sameSite: 'Lax' as const,
					expires: 1700000000,
					url: 'https://example.com/',
				},
			];

			await rollbackClear(mock as never, snapshot);

			assert.deepStrictEqual({
				writeCount: mock.writtenParams.length,
				writtenName: mock.writtenParams[0]?.name,
				writtenValue: mock.writtenParams[0]?.value,
				writtenDomain: mock.writtenParams[0]?.domain,
			}, {
				writeCount: 1,
				writtenName: 'restored',
				writtenValue: 'original-value',
				writtenDomain: '.example.com',
			});
		});

		test('handles empty snapshot gracefully', async () => {
			const mock = new MockCdpSession([]);
			await rollbackClear(mock as never, []);
			assert.strictEqual(mock.writtenParams.length, 0);
		});
	});
});
