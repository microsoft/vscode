/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { BrowserWindow, DownloadItem, Event as ElectronEvent, WebContents, WebFrameMain } from 'electron';
import { EventEmitter } from 'events';
import sinon from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { NullLogService } from '../../../log/common/log.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { WebviewResourceDownload } from '../../common/webviewManagerService.js';
import { createWebviewResourceDownloadEvent, WebviewMainService } from '../../electron-main/webviewMainService.js';

suite('WebviewMainService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createService(contents: WebContents | undefined, windowDestroyed = false) {
		const window = contents && upcastPartial<BrowserWindow>({
			isDestroyed: () => windowDestroyed,
			get webContents() {
				assert.ok(!windowDestroyed, 'Destroyed windows must not be accessed');
				return contents;
			},
		});
		const logService = store.add(new NullLogService());
		const trace = sinon.spy(logService, 'trace');
		const warn = sinon.spy(logService, 'warn');
		const service = store.add(new WebviewMainService(
			upcastPartial<IInstantiationService>({ createInstance: sinon.stub().returns(Disposable.None) }),
			upcastPartial<IWindowsMainService>({
				getWindowById: () => window ? upcastPartial<ICodeWindow>({ win: window }) : undefined,
			}),
			logService,
		));
		return { service, trace, warn };
	}

	function createFrame(overrides: Partial<WebFrameMain> = {}): WebFrameMain {
		return upcastPartial<WebFrameMain>({
			isDestroyed: () => false,
			detached: false,
			name: 'target',
			...overrides,
		});
	}

	function createContents(mainFrame: WebFrameMain | undefined): WebContents {
		return upcastPartial<WebContents>({ isDestroyed: () => false, mainFrame });
	}

	async function findAndStop(service: WebviewMainService): Promise<void> {
		await service.findInFrame({ windowId: 1 }, 'target', 'text', {});
		await service.stopFindInFrame({ windowId: 1 }, 'target', {});
	}

	test('ignores requests after the host window has gone away', async () => {
		const { service, trace } = createService(undefined);
		await findAndStop(service);
		assert.strictEqual(trace.callCount, 2);
	});

	test('does not access a destroyed host window', async () => {
		const { service, trace } = createService(createContents(undefined), true);
		await findAndStop(service);
		assert.strictEqual(trace.callCount, 2);
	});

	test('does not access frames of destroyed web contents', async () => {
		const { service, trace } = createService(upcastPartial<WebContents>({
			isDestroyed: () => true,
			get mainFrame(): WebFrameMain { throw new Error('Destroyed web contents must not be accessed'); },
		}));
		await findAndStop(service);
		assert.strictEqual(trace.callCount, 2);
	});

	test('ignores requests without a main frame', async () => {
		const { service, trace } = createService(createContents(undefined));
		await findAndStop(service);
		assert.strictEqual(trace.callCount, 2);
	});

	test('does not enumerate a disposed main frame', async () => {
		const { service, trace } = createService(createContents(upcastPartial<WebFrameMain>({
			isDestroyed: () => true,
			get framesInSubtree(): WebFrameMain[] { throw new Error('Disposed frames must not be accessed'); },
		})));
		await findAndStop(service);
		assert.strictEqual(trace.callCount, 2);
	});

	test('reports an unavailable subtree without throwing or reporting no matches', async () => {
		const { service, warn } = createService(createContents(createFrame({ framesInSubtree: undefined })));
		const found = sinon.spy();
		store.add(service.onFoundInFrame(found));
		await findAndStop(service);
		assert.deepStrictEqual({ warnings: warn.callCount, results: found.callCount }, { warnings: 2, results: 0 });
	});

	test('accepts a later search after the subtree becomes available', async () => {
		const find = sinon.spy();
		const target = Object.assign(createFrame({ on: sinon.stub().returnsThis() }), { findInFrame: find });
		const getFrames = sinon.stub<[], WebFrameMain[] | undefined>();
		const { service, warn } = createService(createContents(upcastPartial<WebFrameMain>({
			isDestroyed: () => false,
			get framesInSubtree() { return getFrames(); },
		})));

		await service.findInFrame({ windowId: 1 }, 'target', 'first', {});
		getFrames.returns([target]);
		await service.findInFrame({ windowId: 1 }, 'target', 'second', {});

		assert.deepStrictEqual({ warnings: warn.callCount, searches: find.args }, {
			warnings: 1,
			searches: [['second', { findNext: undefined, forward: undefined }]],
		});
	});

	test('ignores a target that was removed from a live subtree', async () => {
		const { service, trace } = createService(createContents(createFrame({ framesInSubtree: [] })));
		await findAndStop(service);
		assert.strictEqual(trace.callCount, 2);
	});

	test('skips disposed and detached frames before accessing their names', async () => {
		const unreadableFrame = (destroyed: boolean) => upcastPartial<WebFrameMain>({
			isDestroyed: () => destroyed,
			detached: !destroyed,
			get name(): string { throw new Error('Unavailable frame names must not be accessed'); },
		});
		const find = sinon.spy();
		const stop = sinon.spy();
		const target = Object.assign(createFrame({ on: sinon.stub().returnsThis() }), { findInFrame: find, stopFindInFrame: stop });
		const { service } = createService(createContents(createFrame({
			framesInSubtree: [unreadableFrame(true), unreadableFrame(false), target],
		})));

		await service.findInFrame({ windowId: 1 }, 'target', 'text', { findNext: true, forward: false });
		await service.stopFindInFrame({ windowId: 1 }, 'target', { keepSelection: true });
		await service.stopFindInFrame({ windowId: 1 }, 'target', { keepSelection: false });

		assert.deepStrictEqual({ find: find.args, stop: stop.args }, {
			find: [['text', { findNext: true, forward: false }]],
			stop: [['keepSelection'], ['clearSelection']],
		});
	});

	test('preserves unexpected Electron errors', async () => {
		const error = new Error('Unexpected frame enumeration failure');
		const { service } = createService(createContents(upcastPartial<WebFrameMain>({
			isDestroyed: () => false,
			get framesInSubtree(): WebFrameMain[] { throw error; },
		})));
		await assert.rejects(service.findInFrame({ windowId: 1 }, 'target', 'text', {}), error);
		await assert.rejects(service.stopFindInFrame({ windowId: 1 }, 'target', {}), error);
	});

	test('keeps menu shortcut validation strict', async () => {
		const { service } = createService(undefined);
		await assert.rejects(service.setIgnoreMenuShortcuts({ windowId: 1 }, true), /Invalid windowId: 1/);
	});

	test('still forwards menu shortcut changes to live web contents', async () => {
		const setIgnoreMenuShortcuts = sinon.spy();
		const { service } = createService(Object.assign(createContents(undefined), { setIgnoreMenuShortcuts }));
		await service.setIgnoreMenuShortcuts({ windowId: 1 }, true);
		await service.setIgnoreMenuShortcuts({ windowId: 1 }, false);
		assert.deepStrictEqual(setIgnoreMenuShortcuts.args, [[true], [false]]);
	});

	suite('resource downloads', () => {
		const url = 'https://file+.vscode-resource.vscode-cdn.net/media/video.mp4?version=1';
		const origin = 'vscode-webview://test-origin';
		const parentUrl = `${origin}/index.html?id=target&vscode-resource-base-authority=vscode-resource.vscode-cdn.net`;

		function createDownloads() {
			const session = new EventEmitter();
			const events = Event.fromNodeEventEmitter(session, 'will-download', (event: ElectronEvent, item: DownloadItem, _contents: WebContents, frame: WebFrameMain | null) => ({ event, item, frame }));
			const downloads: WebviewResourceDownload[] = [];
			const listener = store.add(createWebviewResourceDownloadEvent(events, 'target')(download => downloads.push(download)));
			const emit = (downloadUrl = url, initiator = origin, frame: WebFrameMain | null = createFrame({ parent: createFrame({ url: parentUrl }) })) => {
				const preventDefault = sinon.spy();
				session.emit('will-download', { preventDefault }, upcastPartial<DownloadItem>({ getURL: () => downloadUrl, getInitiatorOrigin: () => initiator }), undefined, frame);
				return preventDefault.called;
			};
			return { session, downloads, listener, emit };
		}

		test('routes native media downloads to the owning webview and removes its listener on disposal', () => {
			const { session, downloads, listener, emit } = createDownloads();
			const intercepted = emit();
			listener.dispose();

			assert.deepStrictEqual({ intercepted, downloads, interceptedAfterDisposal: emit(), listeners: session.listenerCount('will-download') }, {
				intercepted: true,
				downloads: [{ url, origin }],
				interceptedAfterDisposal: false,
				listeners: 0,
			});
		});

		test('leaves network, blob and other webviews downloads to Electron', () => {
			const { downloads, emit } = createDownloads();
			const intercepted = [
				emit('https://example.com/video.mp4'),
				emit(`${origin}/video.mp4`),
				emit(`blob:${origin}/video`),
				emit('https://file+.vscode-resource.vscode-cdn.net.example.com/video.mp4'),
				emit(url, 'https://example.com'),
				emit(url, origin, createFrame({ parent: createFrame({ name: 'other', url: parentUrl }) })),
				emit(url, origin, createFrame({ parent: createFrame({ url: parentUrl.replace('id=target', 'id=other') }) })),
			];
			assert.deepStrictEqual({ intercepted, downloads }, { intercepted: Array(7).fill(false), downloads: [] });
		});

		test('ignores downloads without a live owning webview frame', () => {
			const { downloads, emit } = createDownloads();
			const intercepted = [
				emit(url, origin, null),
				emit(url, origin, createFrame({ isDestroyed: () => true })),
				emit(url, origin, createFrame({ detached: true })),
				emit(url, origin, createFrame({ parent: null })),
				emit(url, origin, createFrame({ parent: createFrame({ isDestroyed: () => true }) })),
				emit(url, origin, createFrame({ parent: createFrame({ detached: true }) })),
				emit(url, origin, createFrame({ parent: createFrame({ url: '' }) })),
			];
			assert.deepStrictEqual({ intercepted, downloads }, { intercepted: Array(7).fill(false), downloads: [] });
		});
	});
});
