/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewStorageScope } from '../../common/browserView.js';
import type { BrowserSession } from '../../electron-main/browserSession.js';
import { BrowserSessionRemote } from '../../electron-main/browserSessionRemote.js';
import { ITunnelProxyInfo } from '../../../tunnel/common/tunnelProxy.js';

class TestElectronSession {
	readonly setProxyCalls: Electron.ProxyConfig[] = [];
	readonly setProxyGates: DeferredPromise<void>[] = [];

	setProxy(config: Electron.ProxyConfig): Promise<void> {
		this.setProxyCalls.push(config);
		const gate = new DeferredPromise<void>();
		this.setProxyGates.push(gate);
		return gate.p;
	}

	asSession(): Electron.Session {
		return this as unknown as Electron.Session;
	}
}

class TestBrowserSession {
	constructor(
		readonly electronSession: Electron.Session,
		readonly storageScope: BrowserViewStorageScope,
	) { }

	asBrowserSession(): BrowserSession {
		return this as unknown as BrowserSession;
	}
}

const proxyInfo: ITunnelProxyInfo = {
	url: 'https://localhost:4567',
	host: 'localhost',
	port: 4567,
	credentials: { username: 'user', password: 'password' },
	certFingerprint: 'sha256/fingerprint',
};

function createRemote(storageScope = BrowserViewStorageScope.Workspace): { remote: BrowserSessionRemote; electronSession: TestElectronSession } {
	const electronSession = new TestElectronSession();
	const browserSession = new TestBrowserSession(electronSession.asSession(), storageScope);
	return { remote: new BrowserSessionRemote(browserSession.asBrowserSession()), electronSession };
}

suite('BrowserSessionRemote', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('waits for enabled proxy information before becoming ready', async () => {
		const { remote, electronSession } = createRemote();
		remote.acquire('view', true, undefined);

		const pendingReady = remote.whenReady;
		let didBecomeReady = false;
		void pendingReady.then(() => { didBecomeReady = true; });
		await Promise.resolve();

		assert.strictEqual(didBecomeReady, false);
		assert.deepStrictEqual(electronSession.setProxyCalls, []);

		remote.acquire('view', true, proxyInfo);
		assert.strictEqual(remote.whenReady, pendingReady);
		assert.deepStrictEqual(electronSession.setProxyCalls, [{
			proxyRules: proxyInfo.url,
			proxyBypassRules: '<-loopback>',
		}]);
		assert.strictEqual(didBecomeReady, false);

		await electronSession.setProxyGates[0].complete();
		await pendingReady;

		assert.strictEqual(didBecomeReady, true);
		assert.strictEqual(remote.isRemote, true);
		assert.strictEqual(remote.proxy, proxyInfo);
	});

	test('disabling a pending proxy releases navigation into direct mode', async () => {
		const { remote, electronSession } = createRemote();
		remote.acquire('view', true, undefined);
		const pendingReady = remote.whenReady;

		remote.acquire('view', false, undefined);

		assert.deepStrictEqual(electronSession.setProxyCalls, [{ mode: 'direct' }]);
		await electronSession.setProxyGates[0].complete();
		await pendingReady;
		assert.strictEqual(remote.isRemote, false);
	});

	test('waits again when proxy information is temporarily unavailable', async () => {
		const { remote, electronSession } = createRemote();
		remote.acquire('view', true, proxyInfo);
		await electronSession.setProxyGates[0].complete();
		await remote.whenReady;

		remote.acquire('view', true, undefined);
		const pendingReady = remote.whenReady;
		let didBecomeReady = false;
		void pendingReady.then(() => { didBecomeReady = true; });
		await Promise.resolve();
		assert.strictEqual(didBecomeReady, false);

		remote.acquire('view', true, proxyInfo);
		assert.strictEqual(electronSession.setProxyCalls.length, 2);
		await electronSession.setProxyGates[1].complete();
		await pendingReady;
		assert.strictEqual(didBecomeReady, true);
	});

	test('leaves navigation ready when the proxy is disabled', async () => {
		const { remote, electronSession } = createRemote();

		remote.acquire('view', false, undefined);
		await remote.whenReady;

		assert.deepStrictEqual(electronSession.setProxyCalls, []);
		assert.strictEqual(remote.isRemote, false);
	});

	test('does not enable the proxy for global browser storage', async () => {
		const { remote, electronSession } = createRemote(BrowserViewStorageScope.Global);

		remote.acquire('view', true, undefined);
		await remote.whenReady;

		assert.deepStrictEqual(electronSession.setProxyCalls, []);
		assert.strictEqual(remote.isRemote, false);
	});
});
