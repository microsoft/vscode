/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { BrowserView } from '../../electron-main/browserView.js';
import { BrowserViewEmulator } from '../../electron-main/browserViewEmulator.js';

const DEFAULT_UA = 'Mozilla/5.0 Code/1.0 Electron/1.0';
const CUSTOM_UA = 'Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36';

suite('BrowserViewEmulator user agent', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createEmulator() {
		let userAgent = DEFAULT_UA;
		const webContents = Object.assign(new EventEmitter(), {
			getUserAgent: () => userAgent,
			setUserAgent: (ua: string) => { userAgent = ua; },
			isDestroyed: () => true,
			disableDeviceEmulation: () => { },
		});
		const browser = {
			webContents,
			debugger: { registerCommandInterceptor: () => Disposable.None },
		};
		const emulator = disposables.add(new BrowserViewEmulator(browser as unknown as BrowserView, new NullLogService()));
		return { emulator, getUserAgent: () => userAgent };
	}

	test('base user agent is applied, overridden by a device, and restored', async () => {
		const { emulator, getUserAgent } = createEmulator();
		const seen: string[] = [];

		emulator.setBaseUserAgent(CUSTOM_UA);
		seen.push(getUserAgent());

		await emulator.setDevice({ userAgent: 'Mobile UA' });
		seen.push(getUserAgent());

		await emulator.setDevice(undefined);
		seen.push(getUserAgent());

		emulator.setBaseUserAgent(undefined);
		seen.push(getUserAgent());

		assert.deepStrictEqual(seen, [CUSTOM_UA, 'Mobile UA', CUSTOM_UA, DEFAULT_UA]);
	});
});
