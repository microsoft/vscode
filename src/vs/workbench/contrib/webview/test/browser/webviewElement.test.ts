/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { isSafari } from '../../../../../base/browser/browser.js';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Event, setGlobalLeakWarningThreshold } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { newWriteableStream, WriteableStream } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileSystemProviderCapabilities, IFileReadStreamOptions, IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../../platform/tunnel/common/tunnel.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { WebviewThemeDataProvider } from '../../browser/themeing.js';
import { WebviewElement } from '../../browser/webviewElement.js';
import { ToWebviewMessage } from '../../browser/webviewMessages.js';

suite('WebviewElement', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	async function createWebview(extensionId?: string, platform = 'browser') {
		const initialized = new DeferredPromise<string>();
		class TestWebviewElement extends WebviewElement {
			protected override get platform(): string { return platform; }

			protected override webviewContentEndpoint(encodedWebviewOrigin: string): string {
				const origin = `https://${encodedWebviewOrigin}.invalid`;
				initialized.complete(origin);
				return origin;
			}
		}

		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const errorNotification = sinon.stub();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextMenuService, { onDidHideContextMenu: Event.None });
		instantiationService.stub(INotificationService, { error: errorNotification });
		instantiationService.stub(IWorkbenchEnvironmentService, {});
		instantiationService.stub(ILogService, store.add(new NullLogService()));
		instantiationService.stub(IRemoteAuthorityResolverService, {});
		instantiationService.stub(ITunnelService, {});
		instantiationService.stub(IAccessibilityService, {
			onDidChangeReducedMotion: Event.None,
			onDidChangeScreenReaderOptimized: Event.None,
			isMotionReduced: () => false,
			isScreenReaderOptimized: () => false,
		});

		const webview = store.add(instantiationService.createInstance(TestWebviewElement, {
			title: 'Test view',
			options: {},
			contentOptions: {},
			extension: extensionId ? { id: new ExtensionIdentifier(extensionId) } : undefined,
		}, upcastPartial<WebviewThemeDataProvider>({
			onThemeDataChanged: Event.None,
			getWebviewThemeData: () => ({ styles: {}, activeTheme: 'vscode-dark', themeLabel: 'Dark', themeId: 'test' }),
		})));
		const container = document.createElement('div');
		webview.mountTo(container, mainWindow);
		const origin = await initialized.p;

		const channel = new MessageChannel();
		store.add(toDisposable(() => {
			channel.port1.close();
			channel.port2.close();
		}));
		mainWindow.dispatchEvent(new MessageEvent('message', {
			origin,
			data: { target: container.id, channel: 'webview-ready' },
			ports: [channel.port1],
		}));
		channel.port2.start();
		return { webview, instantiationService, port: channel.port2, errorNotification };
	}

	for (const extensionId of [undefined, 'publisher.extension']) {
		test(`reports errors ${extensionId ? 'with the owning extension' : 'without an extension owner'}`, async () => {
			const { webview, port, errorNotification } = await createWebview(extensionId);
			const fatalError = Event.toPromise(webview.onFatalError, store.add(new DisposableStore()));
			port.postMessage({ channel: 'fatal-error', data: { message: 'Could not register service worker' } });

			assert.deepStrictEqual({
				error: await fatalError,
				notifications: errorNotification.args,
			}, {
				error: { message: 'Could not register service worker' },
				notifications: [[extensionId
					? `Error loading webview provided by '${extensionId}': Could not register service worker`
					: 'Error loading webview: Could not register service worker']],
			});
		});
	}

	async function createResourceWebview(platform = 'electron') {
		const { webview, instantiationService, port } = await createWebview(undefined, platform);
		const reads: { stream: WriteableStream<Uint8Array>; token: CancellationToken }[] = [];
		const provider = store.add(new class extends InMemoryFileSystemProvider {
			override get capabilities(): FileSystemProviderCapabilities {
				return super.capabilities | FileSystemProviderCapabilities.FileReadStream;
			}

			override readFileStream(_resource: URI, _options?: IFileReadStreamOptions, token?: CancellationToken): WriteableStream<Uint8Array> {
				assert.ok(token);
				const stream = newWriteableStream<Uint8Array>(chunks => chunks[0]);
				reads.push({ stream, token });
				store.add(toDisposable(() => stream.end()));
				return stream;
			}
		}());
		const fileService = store.add(new FileService(instantiationService.get(ILogService)));
		const readFileStream = sinon.spy(fileService, 'readFileStream');
		store.add(fileService.registerProvider('test', provider));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IUriIdentityService, store.add(new UriIdentityService(fileService)));
		webview.contentOptions = { localResourceRoots: [URI.parse('test:///')] };

		const pending = new Map<number, DeferredPromise<ToWebviewMessage['did-load-resource']>>();
		const bodies = new Map<number, { chunks: VSBuffer[]; result: DeferredPromise<string> }>();
		type WebviewMessage = { [K in keyof ToWebviewMessage]: { channel: K; args: ToWebviewMessage[K] } }[keyof ToWebviewMessage];
		store.add(addDisposableListener(port, 'message', (event: MessageEvent<WebviewMessage>) => {
			const message = event.data;
			switch (message.channel) {
				case 'did-load-resource':
					pending.get(message.args.id)?.complete(message.args);
					pending.delete(message.args.id);
					break;
				case 'did-load-resource-chunk':
					bodies.get(message.args.id)?.chunks.push(VSBuffer.wrap(message.args.data));
					break;
				case 'did-load-resource-end': {
					const body = bodies.get(message.args.id);
					if (body && !body.result.isSettled) {
						if (message.args.error) {
							body.result.error(new Error('resource stream failed'));
						} else {
							body.result.complete(VSBuffer.concat(body.chunks).toString());
						}
					}
					break;
				}
			}
		}));
		let nextId = 0;
		async function loadResource() {
			const id = nextId++;
			const resource = URI.parse(`test:///resource-${id}.txt`);
			await provider.writeFile(resource, VSBuffer.fromString('data').buffer, { create: true, overwrite: true, unlock: false, atomic: false });
			const response = new DeferredPromise<ToWebviewMessage['did-load-resource']>();
			pending.set(id, response);
			bodies.set(id, { chunks: [], result: new DeferredPromise<string>() });
			port.postMessage({ channel: 'load-resource', data: { id, scheme: resource.scheme, authority: '', path: resource.path, query: '' } });
			return response.p;
		}

		function readBody(response: ToWebviewMessage['did-load-resource']): Promise<string> {
			assert.ok(response.status === 200 || response.status === 206);
			if (response.stream) {
				return new Response(response.stream).text();
			}
			const body = bodies.get(response.id);
			assert.ok(body);
			return body.result.p;
		}

		function activeRequestCount(): number {
			return readFileStream.args.filter(([, , token]) => token && !token.isCancellationRequested).length;
		}

		return { webview, reads, loadResource, readBody, activeRequestCount };
	}

	for (const platform of ['browser', 'electron']) {
		test(`parallel resource reads do not exceed the cancellation listener limit (${platform})`, async () => {
			store.add(setGlobalLeakWarningThreshold(175));
			const errors: Error[] = [];
			const previousHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(error => errors.push(error));
			try {
				const { reads, loadResource, readBody, activeRequestCount } = await createResourceWebview(platform);
				const batches = [];
				for (let i = 0; i < 3; i++) {
					const responses = await Promise.all(Array.from({ length: 200 }, () => loadResource()));
					const activeRequests = activeRequestCount();
					for (const { stream } of reads.slice(-200)) {
						stream.end(VSBuffer.fromString('data').buffer);
					}
					const contents = await Promise.all(responses.map(readBody));
					batches.push({
						activeRequests,
						completedReads: contents.length,
						contents: [...new Set(contents)],
						remainingActiveRequests: activeRequestCount(),
					});
				}

				assert.deepStrictEqual({
					errors: errors.map(error => error.message),
					batches,
				}, {
					errors: [],
					batches: Array(3).fill({
						activeRequests: 200,
						completedReads: 200,
						contents: ['data'],
						remainingActiveRequests: 0,
					}),
				});
			} finally {
				setUnexpectedErrorHandler(previousHandler);
			}
		});

		test(`resource stream errors release the request (${platform})`, async () => {
			const { reads, loadResource, readBody, activeRequestCount } = await createResourceWebview(platform);
			const response = await loadResource();
			const rejected = assert.rejects(readBody(response));
			reads[0].stream.error(new Error('stream failed'));
			reads[0].stream.end();
			await rejected;

			assert.strictEqual(activeRequestCount(), 0);
		});

		test(`transferring resource chunks preserves sibling buffer views (${platform})`, async () => {
			const { reads, loadResource, readBody, activeRequestCount } = await createResourceWebview(platform);
			const responses = await Promise.all([loadResource(), loadResource()]);
			const data = VSBuffer.fromString('firstsecond');

			reads[0].stream.end(data.buffer.subarray(0, 5));
			reads[1].stream.end(data.buffer.subarray(5));

			assert.deepStrictEqual({
				contents: await Promise.all(responses.map(readBody)),
				originalData: data.toString(),
				activeRequests: activeRequestCount(),
			}, {
				contents: ['first', 'second'],
				originalData: 'firstsecond',
				activeRequests: 0,
			});
		});

		(isSafari ? test.skip : test)(`disposing the webview cancels reads and closes resource streams (${platform})`, async () => {
			const { webview, reads, loadResource, readBody, activeRequestCount } = await createResourceWebview(platform);
			const responses = await Promise.all([loadResource(), loadResource()]);

			webview.dispose();
			for (const { stream } of reads) {
				stream.end();
			}

			assert.deepStrictEqual({
				cancelled: reads.map(read => read.token.isCancellationRequested),
				contents: await Promise.all(responses.map(readBody)),
				activeRequests: activeRequestCount(),
			}, {
				cancelled: [true, true],
				contents: ['', ''],
				activeRequests: 0,
			});
		});
	}

	(isSafari ? test.skip : test)('cancelling a resource stream cancels its file read without cancelling other reads', async () => {
		const { reads, loadResource, readBody, activeRequestCount } = await createResourceWebview();
		const first = await loadResource();
		const second = await loadResource();
		assert.ok(first.status === 200 && first.stream);

		const cancellation = new DeferredPromise<void>();
		store.add(reads[0].token.onCancellationRequested(() => cancellation.complete()));
		await first.stream.cancel();
		await cancellation.p;
		const cancelled = reads.map(read => read.token.isCancellationRequested);
		for (const { stream } of reads) {
			stream.end(VSBuffer.fromString('data').buffer);
		}

		assert.deepStrictEqual({
			cancelled,
			remainingContent: await readBody(second),
			activeRequests: activeRequestCount(),
		}, {
			cancelled: [true, false],
			remainingContent: 'data',
			activeRequests: 0,
		});
	});
});
