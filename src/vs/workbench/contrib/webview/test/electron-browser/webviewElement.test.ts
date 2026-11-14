/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { newWriteableBufferStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { basename, dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService, NoOpNotification, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { IProgress, IProgressOptions, IProgressService, IProgressStep, Progress, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../../platform/tunnel/common/tunnel.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWebviewManagerService, WebviewResourceDownload } from '../../../../../platform/webview/common/webviewManagerService.js';
import { IRemoteAgentConnection, IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
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

		class DownloadFileSystemProvider extends InMemoryFileSystemProvider {
			override get capabilities(): FileSystemProviderCapabilities {
				return super.capabilities | FileSystemProviderCapabilities.FileAtomicRename;
			}

			async renameFileAtomic(from: URI, to: URI, options: { overwrite: boolean }): Promise<void> {
				await super.rename(from, to, options);
			}
		}

		class DownloadProgressService implements IProgressService {
			declare readonly _serviceBrand: undefined;
			readonly started = new DeferredPromise<void>();
			options: IProgressOptions | undefined;
			result: Promise<unknown> | undefined;
			cancel: (() => void) | undefined;

			withProgress<R>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: () => void): Promise<R> {
				this.options = options;
				this.cancel = onDidCancel;
				const result = task(Progress.None);
				this.result = result;
				void this.started.complete();
				return result;
			}
		}

		async function createDownloadWebview(source: URI, options?: { provider?: InMemoryFileSystemProvider; remoteOS?: OperatingSystem }) {
			const fileService = store.add(new FileService(store.add(new NullLogService())));
			for (const scheme of new Set([Schemas.file, source.scheme])) {
				store.add(fileService.registerProvider(scheme, store.add(scheme === source.scheme && options?.provider ? options.provider : new DownloadFileSystemProvider())));
			}
			await fileService.createFolder(dirname(source));
			await fileService.createFolder(directory);
			await fileService.writeFile(source, bytes);

			const complete = new DeferredPromise<void>();
			const error = new DeferredPromise<NotificationMessage | NotificationMessage[]>();
			const messages: (NotificationMessage | NotificationMessage[])[] = [];
			const read = sinon.stub(fileService, 'readFileStream').callThrough();
			const write = sinon.stub(fileService, 'writeFile').callThrough();
			const move = sinon.spy(fileService, 'move');
			const showSaveDialog = sinon.stub().resolves(target);
			const progress = new DownloadProgressService();
			const getEnvironment = sinon.stub().resolves(options?.remoteOS === undefined ? null : upcastPartial<IRemoteAgentEnvironment>({ os: options.remoteOS }));
			const result = createWebview(instantiationService => {
				instantiationService.stub(IFileService, fileService);
				instantiationService.stub(IUriIdentityService, store.add(new UriIdentityService(fileService)));
				instantiationService.stub(IFileDialogService, { defaultFilePath: async () => directory, showSaveDialog });
				instantiationService.stub(IProgressService, progress);
				instantiationService.stub(IRemoteAgentService, {
					getConnection: () => options?.remoteOS === undefined ? null : upcastPartial<IRemoteAgentConnection>({ remoteAuthority: source.authority }),
					getEnvironment,
				});
				sinon.stub(instantiationService.get(INotificationService), 'info').callsFake(message => {
					messages.push(message);
					void complete.complete();
					return new NoOpNotification();
				});
				sinon.stub(instantiationService.get(INotificationService), 'error').callsFake(message => {
					void error.complete(message);
					return new NoOpNotification();
				});
			});
			result.webview.localResourcesRoot = [dirname(source).with({ query: '', fragment: '' })];
			result.webview.element!.src = `${origin}/index.html?id=${result.webview.frameName}`;
			const download = (downloadOrigin = origin) => result.downloads.fire({ url: asWebviewUri(source).toString(), origin: downloadOrigin });
			return { ...result, download, fileService, complete, error, read, write, move, showSaveDialog, messages, progress, getEnvironment };
		}

		for (const source of [
			URI.file('/media/my # video%.mp4').with({ query: 'version=1' }),
			URI.from({ scheme: 'test-remote', authority: 'host+name:123', path: '/media/my # video%.mp4', query: 'revision=%2F&value=1' }),
		]) {
			test(`saves the original bytes of ${source.scheme} resources through the file service`, async () => {
				const { download, complete, read, write, move, showSaveDialog, fileService, messages, progress } = await createDownloadWebview(source);
				download();
				await complete.p;

				assert.deepStrictEqual({
					readsOriginalResource: isEqual(read.firstCall.args[0], source),
					staged: !isEqual(write.firstCall.args[0], target),
					destination: move.firstCall.args[1],
					saved: (await fileService.readFile(target)).value,
					dialog: showSaveDialog.firstCall.args[0],
					messages,
					progress: progress.options,
				}, {
					readsOriginalResource: true,
					staged: true,
					destination: target,
					saved: bytes,
					dialog: {
						defaultUri: joinPath(directory, basename(source)),
						availableFileSystems: [Schemas.file],
						saveLabel: 'Download',
						title: 'Download',
					},
					messages: ['Downloaded \'saved.mp4\'.'],
					progress: { location: ProgressLocation.Notification, title: `Downloading ${basename(source)}`, cancellable: true },
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
			const { download, complete, read, write, showSaveDialog, fileService, messages } = await createDownloadWebview(source);
			showSaveDialog.resolves(source.with({ query: '' }));
			download();
			await complete.p;

			assert.deepStrictEqual({ reads: read.callCount, writes: write.callCount, content: (await fileService.readFile(source)).value, messages }, {
				reads: 0,
				writes: 0,
				content: bytes,
				messages: ['The destination is the original file. Choose a different location to download a copy.'],
			});
		});

		test('rejects resources outside the current local resource roots before reading or writing', async () => {
			const source = URI.file('/media/video.mp4');
			const { webview, download, error, read, write, showSaveDialog } = await createDownloadWebview(source);
			webview.localResourcesRoot = [URI.file('/other')];
			download();
			await error.p;

			assert.deepStrictEqual({ dialogs: showSaveDialog.callCount, reads: read.callCount, writes: write.callCount }, { dialogs: 1, reads: 0, writes: 0 });
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

				const reported = await result.error.p;
				assert.ok(reported instanceof Error);
				assert.strictEqual(reported.message, operation === 'read' ? 'Unable to read \'video.mp4\' for download.' : failure.message);
			});
		}

		for (const outside of [false, true]) {
			test(`${outside ? 'rejects' : 'downloads'} a symlink resolving ${outside ? 'outside' : 'inside'} the allowed root`, async () => {
				const source = URI.file('/media/link/video.mp4');
				const provider = new class extends DownloadFileSystemProvider {
					override get capabilities(): FileSystemProviderCapabilities {
						return super.capabilities | FileSystemProviderCapabilities.FileRealpath;
					}

					async realpath(resource: URI): Promise<string> {
						await super.stat(resource);
						return resource.path.replace('/media/link', outside ? '/outside' : '/media/real');
					}
				};
				const result = await createDownloadWebview(source, { provider });
				result.webview.localResourcesRoot = [URI.file('/media')];
				result.download();
				await (outside ? result.error.p : result.complete.p);

				assert.deepStrictEqual({
					reads: result.read.callCount,
					moves: result.move.callCount,
					saved: outside ? undefined : (await result.fileService.readFile(target)).value,
				}, {
					reads: outside ? 0 : 1,
					moves: outside ? 0 : 1,
					saved: outside ? undefined : bytes,
				});
			});
		}

		for (const remoteOS of [OperatingSystem.Linux, OperatingSystem.Windows]) {
			test(`uses the remote OS and resource rewrite for vscode-remote downloads (OS: ${remoteOS})`, async () => {
				const source = URI.from({
					scheme: Schemas.vscodeRemote,
					authority: 'ssh-remote+host',
					path: remoteOS === OperatingSystem.Windows ? '/c:/media/my # video%.mp4' : '/media/my # video%.mp4',
				});
				const result = await createDownloadWebview(source, { remoteOS });
				const rewritten = source.with({ path: '/vscode-resource', query: JSON.stringify({ requestResourcePath: source.path }) });
				await result.fileService.writeFile(rewritten, bytes);
				result.download();
				await result.complete.p;

				assert.deepStrictEqual({
					environmentReads: result.getEnvironment.callCount,
					readsRewrittenResource: isEqual(result.read.firstCall.args[0], rewritten),
					saved: (await result.fileService.readFile(target)).value,
				}, { environmentReads: 1, readsRewrittenResource: true, saved: bytes });
			});
		}

		for (const dispose of [false, true]) {
			test(`${dispose ? 'disposing the webview' : 'cancelling progress'} cancels the read and preserves the destination`, async () => {
				const source = URI.file('/media/video.mp4');
				const result = await createDownloadWebview(source);
				const previous = VSBuffer.fromString('previous contents');
				await result.fileService.writeFile(target, previous);
				const content = await result.fileService.readFile(source);
				const stream = newWriteableBufferStream();
				store.add(toDisposable(() => stream.destroy()));
				const readStarted = new DeferredPromise<CancellationToken>();
				result.read.callsFake(async (_resource, _options, token) => {
					assert.ok(token);
					store.add(token.onCancellationRequested(() => {
						stream.error(new CancellationError());
						stream.end();
					}));
					void readStarted.complete(token);
					return { ...content, value: stream };
				});
				result.download();
				const token = await readStarted.p;
				if (dispose) {
					result.webview.dispose();
				} else {
					result.progress.cancel!();
				}
				await assert.rejects(result.progress.result!, CancellationError);

				assert.deepStrictEqual({
					cancelled: token.isCancellationRequested,
					saved: (await result.fileService.readFile(target)).value,
					files: (await result.fileService.resolve(directory)).children?.map(child => child.name).sort(),
					messages: result.messages,
				}, { cancelled: true, saved: previous, files: ['saved.mp4'], messages: [] });
			});
		}
	});
});
