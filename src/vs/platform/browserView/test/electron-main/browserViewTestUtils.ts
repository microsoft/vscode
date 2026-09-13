/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastDeepPartial, upcastPartial } from '../../../../base/test/common/mock.js';
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

export function createTestBrowserView(store: Pick<DisposableStore, 'add'>, associatedResource?: URI) {
	const events = new EventEmitter();
	const requests = new Map<string, DeferredPromise<Response>>();
	const history: { url: string; favicon: string | null | undefined }[] = [];
	const programmaticCalls: string[] = [];
	let url = associatedResource?.toString() ?? 'https://first.example/page';
	let historyTarget = url;
	let destroyed = false;
	let childCreates = 0;
	const startNavigation = (target: string, isMainFrame = true, isSameDocument = false) => {
		events.emit('did-start-navigation', { url: target, isMainFrame, isSameDocument }, target, isSameDocument, isMainFrame);
	};
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
		isFocused: () => false,
		isDevToolsOpened: () => false,
		setWindowOpenHandler: () => { },
		setZoomFactor: () => { },
		setVisualZoomLevelLimits: async () => { },
		loadURL: async target => { programmaticCalls.push('loadURL'); startNavigation(target); },
		close: () => { destroyed = true; events.emit('destroyed'); },
		navigationHistory: upcastPartial<Electron.NavigationHistory>({
			canGoBack: () => true, canGoForward: () => true, getActiveIndex: () => history.length,
			goBack: () => { programmaticCalls.push('back'); startNavigation(historyTarget); },
			goForward: () => { programmaticCalls.push('forward'); startNavigation(historyTarget); },
		}),
		debugger: upcastPartial<Electron.Debugger>({
			isAttached: () => true,
			sendCommand: async () => ({}),
			removeListener: () => webContents.debugger,
			detach: () => { },
		}),
	});
	const nativeView = upcastPartial<Electron.WebContentsView>({
		webContents, setBounds: () => { }, setVisible: () => { }, getVisible: () => false, setBackgroundColor: () => { },
	});
	const session = upcastDeepPartial<BrowserSession>({
		electronSession,
		storageScope: BrowserViewStorageScope.Ephemeral,
		remote: { onDidStart: Event.None, onDidStop: Event.None, isRemote: false, whenReady: Promise.resolve() },
		permissions: {
			onDidRequestPermission: Event.None, onDidRequestDevice: Event.None, onDidChange: Event.None,
			storageKeys: {}, serialize: () => ({ origins: {} }),
		},
		trust: { installCertErrorHandler: () => { }, getCertificateError: () => undefined },
		history: {
			storageKeys: {},
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
		let prevented = false;
		startNavigation(target);
		events.emit('will-navigate', { url: target, preventDefault: () => { prevented = true; } });
		return prevented;
	};
	const navigateProgrammatically = async (method: 'loadURL' | 'back' | 'forward', target: string) => {
		historyTarget = target;
		if (method === 'loadURL') {
			await view.loadURL(target);
		} else if (method === 'back') {
			view.goBack();
		} else {
			view.goForward();
		}
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
	const completeFavicon = async (iconUrl: string, contents: string, status = 200) => {
		const request = requests.get(iconUrl);
		assert.ok(request, `No pending favicon request for ${iconUrl}`);
		const bytes = new TextEncoder().encode(contents);
		const body = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(body).set(bytes);
		await request.complete(upcastPartial<Response>({
			ok: status >= 200 && status < 300, status, statusText: status === 404 ? 'Not Found' : 'OK',
			headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => body,
		}));
		await settle();
	};
	return {
		view, history, events, navigate, startNavigation, navigateProgrammatically, programmaticCalls,
		redirect, commit, setIcon, completeFavicon, settle, get childCreates() { return childCreates; },
	};
}
