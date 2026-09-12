/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastDeepPartial, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { nextMacrotask, realTimeApi } from '../../../../base/test/common/virtualScheduling/index.js';
import { IAuxiliaryWindowsMainService } from '../../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { IBrowserHistoryItemHandle } from '../../common/browserHistory.js';
import { BrowserViewStorageScope } from '../../common/browserView.js';
import { BrowserSession } from '../../electron-main/browserSession.js';
import { BrowserView } from '../../electron-main/browserView.js';

suite('BrowserView favicon navigation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const oldIcon = 'data:image/png;base64,b2xk';

	function createView(associatedResource?: URI) {
		const events = new EventEmitter();
		const requests = new Map<string, DeferredPromise<Response>>();
		const history: { url: string; favicon: string | null | undefined }[] = [];
		let url = associatedResource?.toString() ?? 'https://first.example/page';
		let destroyed = false;
		let childCreates = 0;
		const electronSession = upcastPartial<Electron.Session>({
			fetch: input => {
				const request = new DeferredPromise<Response>();
				requests.set(input.toString(), request);
				return request.p;
			},
		});
		const webContents: Electron.WebContents = upcastPartial<Electron.WebContents>({
			on: (event: string | symbol, listener: Parameters<EventEmitter['on']>[1]) => { events.on(event, listener); return webContents; },
			removeListener: (event: string | symbol, listener: Parameters<EventEmitter['removeListener']>[1]) => { events.removeListener(event, listener); return webContents; },
			session: electronSession,
			ipc: upcastPartial<Electron.IpcMain>({ on: () => webContents.ipc }),
			getURL: () => url,
			getTitle: () => 'Test page',
			getUserAgent: () => 'Test',
			getOrCreateDevToolsTargetId: () => 'target',
			isDestroyed: () => destroyed,
			isLoading: () => false,
			setWindowOpenHandler: () => { },
			setZoomFactor: () => { },
			setVisualZoomLevelLimits: async () => { },
			close: () => { destroyed = true; events.emit('destroyed'); },
			navigationHistory: upcastPartial<Electron.NavigationHistory>({
				canGoBack: () => false, canGoForward: () => false, getActiveIndex: () => history.length,
			}),
			debugger: upcastPartial<Electron.Debugger>({
				isAttached: () => true,
				sendCommand: async () => ({}),
				removeListener: () => webContents.debugger,
				detach: () => { },
			}),
		});
		const nativeView = upcastPartial<Electron.WebContentsView>({
			webContents, setBounds: () => { }, setVisible: () => { }, setBackgroundColor: () => { },
		});
		const session = upcastDeepPartial<BrowserSession>({
			electronSession,
			storageScope: BrowserViewStorageScope.Ephemeral,
			remote: { onDidStart: Event.None, onDidStop: Event.None, isRemote: false },
			permissions: { onDidRequestPermission: Event.None, onDidRequestDevice: Event.None, onDidChange: Event.None },
			trust: { installCertErrorHandler: () => { }, getCertificateError: () => undefined },
			history: {
				add: (entryUrl: string, _title: string, favicon: string | undefined) => {
					const entry: { url: string; favicon: string | null | undefined } = { url: entryUrl, favicon };
					history.push(entry);
					return upcastPartial<IBrowserHistoryItemHandle>({ update: changes => { Object.assign(entry, changes); } });
				},
			},
		});
		const owner = upcastPartial<ICodeWindow>({
			onDidClose: Event.None, onWillLoad: Event.None,
			win: upcastDeepPartial<Electron.BrowserWindow>({ contentView: { addChildView: () => { } } }),
		});
		const view: BrowserView = store.add(new BrowserView(
			'view', { windowId: 1 }, { type: 'user' }, associatedResource, session,
			() => { childCreates++; return view; }, () => { }, undefined, () => nativeView,
			upcastPartial<IWindowsMainService>({ getWindowById: () => owner }),
			upcastPartial<IAuxiliaryWindowsMainService>({}), new NullLogService(), NullTelemetryService,
		));
		const settle = () => new Promise<void>(resolve => nextMacrotask(realTimeApi, resolve));
		const commit = (target: string) => {
			url = target;
			events.emit('did-navigate', {}, url);
		};
		commit(url);
		const navigate = (target: string) => {
			const event = { url: target, preventDefault: () => assert.fail('Unexpected navigation rejection') };
			events.emit('will-navigate', event);
			events.emit('did-start-navigation', {}, target, false, true);
		};
		const redirect = (target: string, isMainFrame = true) => {
			let prevented = false;
			events.emit('will-redirect', {
				url: target, isMainFrame, isSameDocument: false, preventDefault: () => { prevented = true; },
			});
			return prevented;
		};
		const setIcon = async (icon: string) => {
			events.emit('page-favicon-updated', {}, [icon]);
			await settle();
		};
		return { view, requests, history, events, navigate, redirect, commit, setIcon, settle, get childCreates() { return childCreates; } };
	}

	test('clears the authoritative icon before a cross-host redirect commits', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://first.example/redirect');
		testCase.redirect('https://second.example/destination');
		const beforeCommit = testCase.view.getNavigationState().lastFavicon;
		testCase.commit('https://second.example/destination');

		assert.deepStrictEqual({ beforeCommit, snapshotIcon: testCase.view.getNavigationState().lastFavicon, history: testCase.history }, {
			beforeCommit: undefined,
			snapshotIcon: undefined,
			history: [
				{ url: 'https://first.example/page', favicon: oldIcon },
				{ url: 'https://second.example/destination', favicon: undefined },
			],
		});
	});

	test('discards a favicon request started after navigation but before the redirect', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://first.example/redirect');
		testCase.events.emit('page-favicon-updated', {}, ['https://first.example/intermediate.png']);
		testCase.redirect('https://second.example/destination');
		testCase.commit('https://second.example/destination');
		await testCase.requests.get('https://first.example/intermediate.png')!.complete(new Response('stale-icon', { headers: { 'content-type': 'image/png' } }));
		await testCase.settle();

		assert.deepStrictEqual({ snapshotIcon: testCase.view.getNavigationState().lastFavicon, committedIcon: testCase.history[1].favicon }, {
			snapshotIcon: undefined, committedIcon: undefined,
		});
	});

	test('clears intermediate icons when a redirect chain returns to the original host', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://first.example/redirect');
		testCase.redirect('https://second.example/intermediate');
		await testCase.setIcon('data:image/png;base64,aW50ZXJtZWRpYXRl');
		testCase.redirect('https://first.example/destination');

		assert.strictEqual(testCase.view.getNavigationState().lastFavicon, undefined);
	});

	test('keeps the icon for same-host redirects and cross-host subframe redirects', async () => {
		const testCase = createView();
		await testCase.setIcon(oldIcon);
		testCase.navigate('https://first.example/redirect');
		testCase.redirect('https://first.example/destination');
		const sameHost = testCase.view.getNavigationState().lastFavicon;
		testCase.redirect('https://second.example/frame', false);

		assert.deepStrictEqual({ sameHost, afterSubframe: testCase.view.getNavigationState().lastFavicon }, {
			sameHost: oldIcon, afterSubframe: oldIcon,
		});
	});

	test('does not clear the icon when the redirect is diverted to a new editor', async () => {
		const testCase = createView(URI.file('/workspace/page.html'));
		await testCase.setIcon(oldIcon);
		const prevented = testCase.redirect('https://second.example/destination');

		assert.deepStrictEqual({ prevented, childCreates: testCase.childCreates, favicon: testCase.view.getNavigationState().lastFavicon }, {
			prevented: true, childCreates: 1, favicon: oldIcon,
		});
	});
});
