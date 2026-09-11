/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IBrowserViewAppPolicy } from '../../common/browserAppPolicy.js';
import { BrowserViewStorageScope } from '../../common/browserView.js';
import type { BrowserSession } from '../../electron-main/browserSession.js';
import { BrowserSessionPermissions } from '../../electron-main/browserSessionPermissions.js';

suite('BrowserSessionPermissions app policy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('confinement denies clipboard checks and requests before unconditional browser grants', async () => {
		const policy: { current: IBrowserViewAppPolicy | undefined } = { current: undefined };
		let check: Parameters<Electron.Session['setPermissionCheckHandler']>[0];
		let request: Parameters<Electron.Session['setPermissionRequestHandler']>[0];
		const electronSession: Electron.Session = upcastPartial<Electron.Session>({
			setPermissionCheckHandler: handler => { check = handler; },
			setPermissionRequestHandler: handler => { request = handler; },
			on: () => electronSession,
		});
		const permissions = store.add(new BrowserSessionPermissions(upcastPartial<BrowserSession>({
			id: 'confined-permissions', storageScope: BrowserViewStorageScope.Ephemeral,
			get appPolicy() { return policy.current; },
		})));
		let prompts = 0;
		store.add(permissions.onDidRequestPermission(() => prompts++));
		permissions.configure(electronSession);
		const origin = 'http://127.0.0.1:1234';
		const contents = upcastPartial<Electron.WebContents>({ getURL: () => origin });
		const writeRequest = () => new Promise<boolean>(resolve => request!(contents, 'clipboard-sanitized-write', resolve, { requestingUrl: origin, isMainFrame: true }));
		const ordinary = {
			check: check!(contents, 'clipboard-sanitized-write', origin, { isMainFrame: true }),
			request: await writeRequest(),
		};
		policy.current = { allowedOrigin: origin };
		assert.deepStrictEqual({
			ordinary,
			confinedReadCheck: check!(contents, 'clipboard-read', origin, { isMainFrame: true }),
			confinedWriteCheck: check!(contents, 'clipboard-sanitized-write', origin, { isMainFrame: true }),
			confinedWriteRequest: await writeRequest(),
			prompts,
		}, {
			ordinary: { check: true, request: true },
			confinedReadCheck: false, confinedWriteCheck: false, confinedWriteRequest: false, prompts: 0,
		});
	});
});
