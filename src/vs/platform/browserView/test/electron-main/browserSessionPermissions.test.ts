/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PermissionCategory } from '../../common/browserPermissions.js';
import { BrowserViewStorageScope, IBrowserViewPermissionRequestEvent } from '../../common/browserView.js';
import type { BrowserSession } from '../../electron-main/browserSession.js';
import { BrowserSessionPermissions } from '../../electron-main/browserSessionPermissions.js';

type PermissionRequestHandler = NonNullable<Parameters<Electron.Session['setPermissionRequestHandler']>[0]>;
type PermissionCheckHandler = NonNullable<Parameters<Electron.Session['setPermissionCheckHandler']>[0]>;

suite('BrowserSessionPermissions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPermissions() {
		let requestHandler: PermissionRequestHandler | null = null;
		let checkHandler: PermissionCheckHandler | null = null;
		const electronSession = new class extends mock<Electron.Session>() {
			override setPermissionRequestHandler(handler: PermissionRequestHandler | null): void {
				requestHandler = handler;
			}
			override setPermissionCheckHandler(handler: PermissionCheckHandler | null): void {
				checkHandler = handler;
			}
			override on(): this {
				return this;
			}
		};
		const permissions = disposables.add(new BrowserSessionPermissions(new class extends mock<BrowserSession>() {
			override readonly storageScope = BrowserViewStorageScope.Ephemeral;
		}));
		const webContents = new class extends mock<Electron.WebContents>() {
			override getURL(): string {
				return 'https://top.example/page';
			}
		};
		permissions.configure(electronSession);

		return {
			permissions,
			request: (details: Electron.MediaAccessPermissionRequest) => new Promise<boolean>(resolve => {
				assert.ok(requestHandler);
				requestHandler(webContents, 'media', resolve, details);
			}),
			check: (origin: string, details: Electron.PermissionCheckHandlerHandlerDetails, permission: Parameters<PermissionCheckHandler>[1] = 'media') => {
				assert.ok(checkHandler);
				return checkHandler(webContents, permission, origin, details);
			},
		};
	}

	test('prompts and records media permissions for the inherited security origin', async () => {
		const { permissions, request, check } = createPermissions();
		const origin = 'https://creator.example';
		const prompts: IBrowserViewPermissionRequestEvent[] = [];
		disposables.add(permissions.onDidRequestPermission(event => {
			prompts.push(event.request);
			event.claim();
			queueMicrotask(() => permissions.set(event.request.origin, [{ category: event.request.category, state: 'allow' }]));
		}));

		const granted = await request({
			requestingUrl: 'about:blank', securityOrigin: `${origin}/`, isMainFrame: true, mediaTypes: ['video', 'audio'],
		});

		assert.deepStrictEqual({
			granted,
			prompts,
			snapshot: permissions.serialize(),
			checks: (['video', 'audio'] as const).map(mediaType => check(origin, { requestingUrl: 'about:blank', isMainFrame: true, mediaType })),
		}, {
			granted: true,
			prompts: [{ origin, category: PermissionCategory.Camera }, { origin, category: PermissionCategory.Microphone }],
			snapshot: { origins: { [origin]: { camera: 'allow', microphone: 'allow' } } },
			checks: [true, true],
		});
	});

	test('both handlers use recorded security-origin decisions rather than the document or top-level URL', async () => {
		const { permissions, request, check } = createPermissions();
		const origin = 'https://frame.example';
		const prompts: IBrowserViewPermissionRequestEvent[] = [];
		disposables.add(permissions.onDidRequestPermission(event => prompts.push(event.request)));

		for (const state of ['allow', 'deny'] as const) {
			permissions.set(origin, [{ category: PermissionCategory.Camera, state }]);
			permissions.set('https://document.example', [{ category: PermissionCategory.Camera, state: state === 'allow' ? 'deny' : 'allow' }]);
			permissions.set('https://top.example', [{ category: PermissionCategory.Camera, state: state === 'allow' ? 'deny' : 'allow' }]);
			const details = { requestingUrl: 'https://document.example/page', securityOrigin: origin, isMainFrame: false };

			assert.deepStrictEqual({
				request: await request({ ...details, mediaTypes: ['video'] }),
				check: check('https://top.example', { ...details, mediaType: 'video' }),
				prompts,
			}, { request: state === 'allow', check: state === 'allow', prompts: [] });
		}
	});

	test('uses the requesting URL when no security origin is supplied', async () => {
		const { permissions, request, check } = createPermissions();
		const origin = 'https://document.example';
		permissions.set(origin, [{ category: PermissionCategory.Camera, state: 'allow' }]);

		assert.deepStrictEqual({
			request: await request({ requestingUrl: `${origin}/page`, isMainFrame: true, mediaTypes: ['video'] }),
			check: check(origin, { isMainFrame: false, mediaType: 'video' }),
		}, { request: true, check: true });
	});

	test('keeps file permissions scoped to the requesting document', async () => {
		const { permissions, request, check } = createPermissions();
		const fileUrl = 'file:///home/user/allowed.html';
		permissions.set(fileUrl, [{ category: PermissionCategory.Camera, state: 'allow' }]);

		for (const requestingUrl of [`${fileUrl}?query#fragment`, 'file:///home/user/other.html']) {
			const details = { requestingUrl, securityOrigin: 'file://', isMainFrame: true };
			assert.deepStrictEqual({
				request: await request({ ...details, mediaTypes: ['video'] }),
				check: check('file://', { ...details, mediaType: 'video' }),
			}, { request: requestingUrl.startsWith(fileUrl), check: requestingUrl.startsWith(fileUrl) });
		}
	});

	test('does not prompt or inherit grants for opaque origins', async () => {
		const { permissions, request, check } = createPermissions();
		const origin = 'https://top.example';
		permissions.set(origin, [{ category: PermissionCategory.Camera, state: 'allow' }]);
		const prompts: IBrowserViewPermissionRequestEvent[] = [];
		disposables.add(permissions.onDidRequestPermission(event => prompts.push(event.request)));

		for (const details of [
			{ requestingUrl: `${origin}/page`, securityOrigin: 'null', isMainFrame: false },
			{ requestingUrl: 'about:blank', isMainFrame: true },
		]) {
			assert.deepStrictEqual({
				request: await request({ ...details, mediaTypes: ['video'] }),
				check: check('null', { ...details, mediaType: 'video' }),
				devices: check('null', details, 'usb'),
				prompts,
			}, { request: false, check: false, devices: false, prompts: [] });
		}
	});
});
