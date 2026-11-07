/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileOperation, IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService, NoOpNotification, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../../platform/tunnel/common/tunnel.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWebviewManagerService, WebviewResourceDownload } from '../../../../../platform/webview/common/webviewManagerService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { WebviewThemeDataProvider } from '../../browser/themeing.js';
import { ElectronWebviewElement } from '../../electron-browser/webviewElement.js';
import { asWebviewUri } from '../../common/webview.js';

class TestElectronWebviewElement extends ElectronWebviewElement {
	public override get element(): HTMLIFrameElement | undefined { return super.element; }
	public get frameName(): string { return this.id; }
}

suite('ElectronWebviewElement', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createWebview(configure?: (instantiationService: TestInstantiationService) => void) {
		const calls: { command: string; args: unknown }[] = [];
		const downloads = store.add(new Emitter<WebviewResourceDownload>());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const service = new class implements IWebviewManagerService {
			declare readonly _serviceBrand: undefined;
			readonly onFoundInFrame = Event.None;
			onDynamicDidDownloadResource() { return downloads.event; }
			async setIgnoreMenuShortcuts() { }
			async findInFrame(...args: Parameters<IWebviewManagerService['findInFrame']>) { calls.push({ command: 'findInFrame', args }); }
			async stopFindInFrame(...args: Parameters<IWebviewManagerService['stopFindInFrame']>) { calls.push({ command: 'stopFindInFrame', args }); }
		};
		const channel = ProxyChannel.fromService(service, store.add(new DisposableStore()));
		instantiationService.stub(IMainProcessService, {
			getChannel: () => ({
				listen: (event, args) => channel.listen(undefined, event, args),
				call: (command, args) => channel.call(undefined, command, args),
			}),
		});
		instantiationService.stub(INativeHostService, { windowId: 42 });
		instantiationService.stub(IRemoteAuthorityResolverService, {});
		instantiationService.stub(ITunnelService, {});
		const themeProvider = upcastPartial<WebviewThemeDataProvider>({
			onThemeDataChanged: Event.None,
			getWebviewThemeData: () => ({ styles: {}, activeTheme: 'vscode-dark', themeLabel: '', themeId: '' }),
		});
		configure?.(instantiationService);
		const webview = store.add(instantiationService.createInstance(TestElectronWebviewElement, {
			title: undefined,
			options: { enableFindWidget: true },
			contentOptions: {},
			extension: undefined,
		}, themeProvider));
		return { webview, calls, downloads };
	}

	function createAuxiliaryDocument() {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		assert.ok(frame.contentWindow);
		ensureCodeWindow(frame.contentWindow, 42);
		assert.ok(frame.contentDocument);
		return frame.contentDocument;
	}

	for (const auxiliary of [false, true]) {
		test(`routes initial, next, previous and stop searches to the ${auxiliary ? 'auxiliary' : 'main'} window`, () => runWithFakedTimers({}, async () => {
			const targetDocument = auxiliary ? createAuxiliaryDocument() : mainWindow.document;
			const { webview, calls } = createWebview();
			assert.ok(webview.element);
			targetDocument.body.appendChild(webview.element);

			webview.updateFind('text');
			await timeout(250);
			webview.find('text', false);
			webview.find('text', true);
			webview.stopFind(true);
			webview.stopFind(false);

			const target = auxiliary ? { webContentsId: 42 } : { windowId: 42 };
			assert.deepStrictEqual(calls, [
				{ command: 'findInFrame', args: [target, webview.frameName, 'text', { forward: true, findNext: true, matchCase: false }] },
				{ command: 'findInFrame', args: [target, webview.frameName, 'text', { forward: true, findNext: false, matchCase: false }] },
				{ command: 'findInFrame', args: [target, webview.frameName, 'text', { forward: false, findNext: false, matchCase: false }] },
				{ command: 'stopFindInFrame', args: [target, webview.frameName, { keepSelection: true }] },
				{ command: 'stopFindInFrame', args: [target, webview.frameName, { keepSelection: false }] },
			]);
		}));
	}

	test('debounces typing and cancels pending searches on stop and disposal', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('t');
		webview.updateFind('text');
		await timeout(250);
		const searchesAfterTyping = [...calls];
		calls.length = 0;

		webview.updateFind('cancelled');
		webview.stopFind(false);
		await timeout(250);
		const searchesAfterStop = calls.filter(call => call.command === 'findInFrame');
		calls.length = 0;

		webview.updateFind('disposed');
		webview.dispose();
		await timeout(250);

		assert.deepStrictEqual({
			searchesAfterTyping,
			searchesAfterStop,
			searchesAfterDisposal: calls.filter(call => call.command === 'findInFrame'),
		}, {
			searchesAfterTyping: [{
				command: 'findInFrame',
				args: [{ windowId: 42 }, webview.frameName, 'text', { forward: true, findNext: true, matchCase: false }],
			}],
			searchesAfterStop: [],
			searchesAfterDisposal: [],
		});
	}));

	test('does not send stop requests before a search starts', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		let stopped = 0;
		store.add(webview.onDidStopFind(() => stopped++));

		webview.stopFind(true);
		webview.updateFind('cancelled');
		webview.stopFind(false);
		await timeout(250);

		assert.deepStrictEqual({ calls, stopped }, { calls: [], stopped: 2 });
	}));

	test('can clear a retained selection without repeating stop requests', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('text');
		await timeout(250);
		calls.length = 0;

		webview.stopFind(true);
		webview.stopFind(true);
		webview.stopFind(false);
		webview.stopFind(false);

		assert.deepStrictEqual(calls, [
			{ command: 'stopFindInFrame', args: [{ windowId: 42 }, webview.frameName, { keepSelection: true }] },
			{ command: 'stopFindInFrame', args: [{ windowId: 42 }, webview.frameName, { keepSelection: false }] },
		]);
	}));

	test('clears a retained selection when the webview content changes', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('text');
		await timeout(250);
		webview.stopFind(true);
		calls.length = 0;

		webview.setHtml('new content');

		assert.deepStrictEqual(calls, [
			{ command: 'stopFindInFrame', args: [{ windowId: 42 }, webview.frameName, { keepSelection: false }] },
		]);
	}));

	test('stops an active search before disposing the webview', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('text');
		await timeout(250);
		calls.length = 0;

		webview.dispose();
		webview.dispose();

		assert.deepStrictEqual(calls, [
			{ command: 'stopFindInFrame', args: [{ windowId: 42 }, webview.frameName, { keepSelection: false }] },
		]);
	}));

	test('starts a new search after stopping the previous one', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('first');
		await timeout(250);
		webview.stopFind(true);
		calls.length = 0;

		webview.find('second', false);
		await timeout(250);

		assert.deepStrictEqual(calls, [
			{ command: 'findInFrame', args: [{ windowId: 42 }, webview.frameName, 'second', { forward: true, findNext: true, matchCase: false }] },
		]);
	}));

	suite('resource downloads', () => {
		const directory = URI.file('/downloads');
		const target = joinPath(directory, 'saved.mp4');
		const bytes = VSBuffer.wrap(new Uint8Array([0, 1, 2, 255]));
		const origin = 'vscode-webview://test-origin';

		async function createDownloadWebview(source: URI) {
			const fileService = store.add(new FileService(store.add(new NullLogService())));
			for (const scheme of new Set([Schemas.file, source.scheme])) {
				store.add(fileService.registerProvider(scheme, store.add(new InMemoryFileSystemProvider())));
			}
			await fileService.createFolder(dirname(source));
			await fileService.createFolder(directory);
			await fileService.writeFile(source, bytes);

			const complete = new DeferredPromise<void>();
			store.add(fileService.onDidRunOperation(e => {
				if (e.operation === FileOperation.WRITE) {
					void complete.complete();
				}
			}));
			const error = new DeferredPromise<NotificationMessage | NotificationMessage[]>();
			const read = sinon.stub(fileService, 'readFileStream').callThrough();
			const write = sinon.stub(fileService, 'writeFile').callThrough();
			const showSaveDialog = sinon.stub().resolves(target);
			const result = createWebview(instantiationService => {
				instantiationService.stub(IFileService, fileService);
				instantiationService.stub(IUriIdentityService, store.add(new UriIdentityService(fileService)));
				instantiationService.stub(IFileDialogService, { defaultFilePath: async () => directory, showSaveDialog });
				sinon.stub(instantiationService.get(INotificationService), 'error').callsFake(message => {
					void error.complete(message);
					return new NoOpNotification();
				});
			});
			result.webview.localResourcesRoot = [dirname(source).with({ query: '', fragment: '' })];
			result.webview.element!.src = `${origin}/index.html?id=${result.webview.frameName}`;
			const download = (downloadOrigin = origin) => result.downloads.fire({ url: asWebviewUri(source).toString(), origin: downloadOrigin });
			return { ...result, download, fileService, complete, error, read, write, showSaveDialog };
		}

		for (const source of [
			URI.file('/media/my # video%.mp4').with({ query: 'version=1' }),
			URI.from({ scheme: 'test-remote', authority: 'host+name:123', path: '/media/my # video%.mp4', query: 'revision=%2F&value=1' }),
		]) {
			test(`saves the original bytes of ${source.scheme} resources through the file service`, async () => {
				const { download, complete, read, write, showSaveDialog, fileService } = await createDownloadWebview(source);
				download();
				await complete.p;

				assert.deepStrictEqual({
					readsOriginalResource: isEqual(read.firstCall.args[0], source),
					destination: write.firstCall.args[0],
					saved: (await fileService.readFile(target)).value,
					dialog: showSaveDialog.firstCall.args[0],
				}, {
					readsOriginalResource: true,
					destination: target,
					saved: bytes,
					dialog: {
						defaultUri: joinPath(directory, basename(source)),
						availableFileSystems: [Schemas.file],
						saveLabel: 'Download',
						title: 'Download',
					},
				});
			});
		}

		test('cancelling the dialog does not read or write the resource', async () => {
			const source = URI.file('/media/video.mp4');
			const { download, read, write, showSaveDialog } = await createDownloadWebview(source);
			showSaveDialog.resolves(undefined);
			download();
			await timeout(0);

			assert.deepStrictEqual({ dialogs: showSaveDialog.callCount, reads: read.callCount, writes: write.callCount }, { dialogs: 1, reads: 0, writes: 0 });
		});

		test('saving over the original file ignores the webview cache-busting query', async () => {
			const source = URI.file('/media/video.mp4').with({ query: 'version=1' });
			const { download, read, write, showSaveDialog, fileService } = await createDownloadWebview(source);
			showSaveDialog.resolves(source.with({ query: '' }));
			download();
			await timeout(0);

			assert.deepStrictEqual({ reads: read.callCount, writes: write.callCount, content: (await fileService.readFile(source)).value }, {
				reads: 0,
				writes: 0,
				content: bytes,
			});
		});

		test('rejects resources outside the current local resource roots before prompting', async () => {
			const source = URI.file('/media/video.mp4');
			const { webview, download, error, read, write, showSaveDialog } = await createDownloadWebview(source);
			webview.localResourcesRoot = [URI.file('/other')];
			download();
			await error.p;

			assert.deepStrictEqual({ dialogs: showSaveDialog.callCount, reads: read.callCount, writes: write.callCount }, { dialogs: 0, reads: 0, writes: 0 });
		});

		test('rejects a different webview origin even when the requested resource is permitted', async () => {
			const { download, error, read, write, showSaveDialog } = await createDownloadWebview(URI.file('/media/video.mp4'));
			download('vscode-webview://other-origin');
			await error.p;

			assert.deepStrictEqual({ dialogs: showSaveDialog.callCount, reads: read.callCount, writes: write.callCount }, { dialogs: 0, reads: 0, writes: 0 });
		});

		test('rechecks resource roots after the save dialog closes', async () => {
			const source = URI.file('/media/video.mp4');
			const { webview, download, error, read, write, showSaveDialog } = await createDownloadWebview(source);
			const shown = new DeferredPromise<void>();
			const selection = new DeferredPromise<URI | undefined>();
			showSaveDialog.callsFake(() => {
				void shown.complete();
				return selection.p;
			});
			download();
			await shown.p;
			webview.localResourcesRoot = [];
			await selection.complete(target);
			await error.p;

			assert.deepStrictEqual({ reads: read.callCount, writes: write.callCount }, { reads: 0, writes: 0 });
		});

		for (const operation of ['read', 'write'] as const) {
			test(`reports ${operation} failures instead of silently abandoning the download`, async () => {
				const source = URI.file('/media/video.mp4');
				const result = await createDownloadWebview(source);
				const failure = new Error(`${operation} failed`);
				result[operation].rejects(failure);
				result.download();

				assert.strictEqual(await result.error.p, failure);
			});
		}
	});
});
