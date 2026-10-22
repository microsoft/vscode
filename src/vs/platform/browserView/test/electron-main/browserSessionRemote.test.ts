/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITunnelProxyInfo } from '../../../tunnel/common/tunnelProxy.js';
import type { BrowserSession } from '../../electron-main/browserSession.js';
import { BrowserSessionRemote } from '../../electron-main/browserSessionRemote.js';

function proxy(port: number): ITunnelProxyInfo {
	return { url: `https://127.0.0.1:${port}`, host: '127.0.0.1', port, credentials: { username: 'u', password: `p${port}` }, certFingerprint: `f${port}` };
}

function createRemote() {
	const applied: string[] = [];
	const electronSession = upcastPartial<Electron.Session>({
		setProxy: async (config: Electron.ProxyConfig) => { applied.push(config.proxyRules ?? config.mode ?? ''); },
		closeAllConnections: async () => { applied.push('closeAll'); },
	});
	const session = upcastPartial<BrowserSession>({ electronSession });
	return { remote: new BrowserSessionRemote(session), applied };
}

suite('BrowserSessionRemote', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('re-acquiring for a view replaces its proxy', async () => {
		const { remote, applied } = createRemote();
		remote.acquire('view', proxy(1));
		remote.acquire('view', proxy(2));
		remote.release('view');
		await remote.whenReady;
		assert.deepStrictEqual(applied, ['https://127.0.0.1:1', 'closeAll', 'https://127.0.0.1:2', 'closeAll', 'direct', 'closeAll']);
	});

	test('switches to a proxy still held by another view when the applied proxy is released', async () => {
		const { remote } = createRemote();
		remote.acquire('windowA', proxy(1));
		remote.acquire('windowB', proxy(2));
		const afterAcquire = remote.proxy?.port;
		remote.release('windowB');
		const afterRelease = remote.proxy?.port;
		remote.release('windowA');
		await remote.whenReady;
		assert.deepStrictEqual({ afterAcquire, afterRelease, final: remote.proxy }, { afterAcquire: 2, afterRelease: 1, final: undefined });
	});
});
