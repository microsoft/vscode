/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { isSafari } from '../../../../../base/browser/browser.js';
import { $, addDisposableListener, append, registerWindow } from '../../../../../base/browser/dom.js';
import { Orientation, Sash } from '../../../../../base/browser/ui/sash/sash.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Event, setGlobalLeakWarningThreshold } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
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
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../../platform/tunnel/common/tunnel.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IRemoteAgentConnection, IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { SashGrippersController } from '../../../sash/browser/sash.js';
import { WebviewThemeDataProvider } from '../../browser/themeing.js';
import { WebviewElement } from '../../browser/webviewElement.js';
import { FromWebviewMessage, ToWebviewMessage } from '../../browser/webviewMessages.js';
import { asWebviewUri, WebviewMouseActivity, webviewMouseActivityEvent, webviewRootResourceAuthority } from '../../common/webview.js';

suite('WebviewElement', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	type WebviewMessage = { [K in keyof ToWebviewMessage]: { channel: K; args: ToWebviewMessage[K] } }[keyof ToWebviewMessage];

	teardown(() => sinon.restore());

	async function createWebview(extensionId?: string, platform = 'browser', connect = true, targetWindow = mainWindow) {
		let initialized = new DeferredPromise<string>();
		class TestWebviewElement extends WebviewElement {
			public override get element(): HTMLIFrameElement | undefined { return super.element; }

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
		instantiationService.stub(IRemoteAgentService, {
			getConnection: () => null,
			getEnvironment: async () => null,
		});
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
		targetWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		assert.ok(webview.element);
		const frame = webview.element;
		// Capture the shell URL without navigating away from the test document.
		const setSource = sinon.stub(frame, 'setAttribute').withArgs('src', sinon.match.string);
		webview.mountTo(container, targetWindow);
		const origin = await initialized.p;

		const channel = new MessageChannel();
		store.add(toDisposable(() => {
			channel.port1.close();
			channel.port2.close();
		}));
		const createReadyEvent = (port = channel.port1, keyEventToken = 'shell-key-token') => ({
			origin,
			source: frame.contentWindow,
			data: {
				target: container.id,
				channel: 'webview-ready',
				data: { mountId: new URL(setSource.lastCall.args[1]).searchParams.get('mountId'), keyEventToken },
			},
			ports: [port],
		});
		if (connect) {
			targetWindow.dispatchEvent(new MessageEvent('message', createReadyEvent()));
		}
		channel.port2.start();
		return {
			webview, instantiationService, port: channel.port2, errorNotification, frame, container, configurationService, createReadyEvent,
			remount: async () => {
				initialized = new DeferredPromise<string>();
				webview.reinitializeAfterDismount();
				await initialized.p;
			},
		};
	}

	const mouseMove: FromWebviewMessage['did-mouse-move'] = {
		screenX: 120, screenY: 80,
	};

	async function sendWebviewMessage<K extends keyof FromWebviewMessage>(webview: WebviewElement, port: MessagePort, channel: K, data: FromWebviewMessage[K]): Promise<void> {
		const disposables = new DisposableStore();
		try {
			const drained = Event.toPromise(webview.onMessage, disposables);
			port.postMessage({ channel, data });
			port.postMessage({ channel: 'onmessage', data: { message: 'done' } });
			await drained;
		} finally {
			disposables.dispose();
		}
	}

	async function sendMouseMove(webview: WebviewElement, port: MessagePort, event = mouseMove): Promise<void> {
		await sendWebviewMessage(webview, port, 'did-mouse-move', event);
	}

	test('reports webview activity without synthesizing mouse input', async () => {
		const { webview, port } = await createWebview();
		const activities: WebviewMouseActivity[] = [];
		let mouseInputEvents = 0;
		store.add(addDisposableListener(mainWindow, webviewMouseActivityEvent, (event: CustomEvent<WebviewMouseActivity>) => {
			activities.push(event.detail);
		}));
		store.add(addDisposableListener(mainWindow, 'mousemove', () => mouseInputEvents++));
		await sendMouseMove(webview, port);
		assert.deepStrictEqual({ activities, mouseInputEvents }, { activities: [mouseMove], mouseInputEvents: 0 });
	});

	for (const autoHideGrippers of [false, true]) {
		test(`queued webview movement cannot resize an active sash (auto-hide ${autoHideGrippers})`, async () => {
			const { webview, port, frame, container, configurationService } = await createWebview();
			await configurationService.setUserConfiguration('workbench.sash.autoHideGrippers', autoHideGrippers);
			await configurationService.setUserConfiguration('workbench.sash.autoHideGrippersDelay', 100);
			store.add(new SashGrippersController(configurationService, upcastPartial<ILayoutService>({
				containers: [container],
				onDidAddContainer: Event.None,
			})));
			const sash = store.add(new Sash(container, { getVerticalSashLeft: () => 500 }, { orientation: Orientation.VERTICAL }));
			const sashElement = container.querySelector<HTMLElement>('.monaco-sash');
			assert.ok(sashElement);
			const changes: { startX: number; currentX: number }[] = [];
			store.add(sash.onDidChange(({ startX, currentX }) => changes.push({ startX, currentX })));
			const endDrag = store.add(toDisposable(() => {
				mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: 510 }));
			}));

			const queuedMovement = { ...mouseMove, clientX: 250, clientY: 0, buttons: 0 };
			const delivered = sendMouseMove(webview, port, queuedMovement);
			sashElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1, clientX: 500 }));
			await delivered;
			const afterQueuedMovement = {
				changes: changes.slice(),
				dragging: sashElement.classList.contains('active'),
				iframeBlocked: frame.classList.contains('pointer-events-disabled'),
			};
			mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 510, buttons: 1 }));
			endDrag.dispose();

			assert.deepStrictEqual({ afterQueuedMovement, afterRealMovement: changes }, {
				afterQueuedMovement: { changes: [], dragging: true, iframeBlocked: true },
				afterRealMovement: [{ startX: 500, currentX: 510 }],
			});
		});
	}

	test('webview mouse movement reveals grippers and resets only the owning window idle timer', async () => {
		const auxiliaryFrame = append(document.body, $<HTMLIFrameElement>('iframe'));
		store.add(toDisposable(() => auxiliaryFrame.remove()));
		const targetWindow = auxiliaryFrame.contentWindow;
		assert.ok(targetWindow);
		ensureCodeWindow(targetWindow, 1001);
		store.add(registerWindow(targetWindow));
		const main = await createWebview();
		const auxiliary = await createWebview(undefined, 'browser', true, targetWindow);
		await main.configurationService.setUserConfiguration('workbench.sash.autoHideGrippers', true);
		await main.configurationService.setUserConfiguration('workbench.sash.autoHideGrippersDelay', 100);
		store.add(new SashGrippersController(main.configurationService, upcastPartial<ILayoutService>({
			containers: [main.container, auxiliary.container],
			onDidAddContainer: Event.None,
		})));
		const hidden = () => [main.container, auxiliary.container].map(container => container.classList.contains('sash-grippers-hidden'));
		await timeout(120);
		const idle = hidden();
		await sendMouseMove(main.webview, main.port);
		const mainMoving = hidden();
		await timeout(60);
		await sendMouseMove(main.webview, main.port, { ...mouseMove, screenX: mouseMove.screenX + 1 });
		await timeout(60);
		const mainStillMoving = hidden();
		await timeout(60);
		const idleAgain = hidden();
		await sendMouseMove(auxiliary.webview, auxiliary.port);
		assert.deepStrictEqual({ idle, mainMoving, mainStillMoving, idleAgain, auxiliaryMoving: hidden() }, {
			idle: [true, true],
			mainMoving: [false, true],
			mainStillMoving: [false, true],
			idleAgain: [true, true],
			auxiliaryMoving: [true, false],
		});
	});

	for (const invalid of [
		{ name: 'wrong target', envelope: { target: 'another-webview' } },
		{ name: 'wrong origin', event: { origin: 'https://another.invalid' } },
		{ name: 'wrong source', event: { source: mainWindow } },
		{ name: 'missing source', event: { source: null } },
		{ name: 'missing port', event: { ports: [] } },
		{ name: 'stale mount', data: { mountId: 'old-mount' } },
		{ name: 'missing mount', data: { mountId: undefined } },
		{ name: 'empty token', data: { keyEventToken: '' } },
		{ name: 'missing token', data: { keyEventToken: undefined } },
		{ name: 'non-string token', data: { keyEventToken: 42 } },
	]) {
		test(`rejects ready handshake with ${invalid.name}`, async () => {
			const { frame, createReadyEvent } = await createWebview(undefined, 'browser', false);
			const ready = createReadyEvent();
			const originMismatchLog = invalid.name === 'wrong origin' ? sinon.stub(console, 'log') : undefined;
			mainWindow.dispatchEvent(new MessageEvent('message', {
				...ready,
				...invalid.event,
				data: { ...ready.data, ...invalid.envelope, data: { ...ready.data.data, ...invalid.data } },
			}));
			const acceptedInvalid = frame.classList.contains('ready');
			if (originMismatchLog) {
				assert.ok(originMismatchLog.calledOnceWith(sinon.match('Skipped renderer receiving message due to mismatched origins:')));
				originMismatchLog.restore();
			}
			mainWindow.dispatchEvent(new MessageEvent('message', ready));

			assert.deepStrictEqual({ acceptedInvalid, acceptedValid: frame.classList.contains('ready') }, {
				acceptedInvalid: false,
				acceptedValid: true,
			});
		});
	}

	test('does not replace an accepted channel and clears it on disposal', async () => {
		const { webview, createReadyEvent } = await createWebview();
		const originalPort = createReadyEvent().ports[0];
		const channel = new MessageChannel();
		store.add(toDisposable(() => {
			channel.port1.close();
			channel.port2.close();
		}));
		mainWindow.dispatchEvent(new MessageEvent('message', createReadyEvent(channel.port1, 'replacement-token')));
		const keptOriginal = originalPort.onmessage !== null && channel.port1.onmessage === null;
		webview.dispose();
		mainWindow.dispatchEvent(new MessageEvent('message', createReadyEvent(channel.port1)));

		assert.deepStrictEqual({ keptOriginal, originalHandler: originalPort.onmessage, replacementHandler: channel.port1.onmessage }, {
			keptOriginal: true,
			originalHandler: null,
			replacementHandler: null,
		});
	});

	for (const forwardUntrustedKeypressEvents of [false, true]) {
		for (const type of ['keydown', 'keyup'] as const) {
			test(`${type} authenticates the shell before applying untrusted forwarding (${forwardUntrustedKeypressEvents})`, async () => {
				const { webview, port, frame, createReadyEvent } = await createWebview();
				webview.contentOptions = { forwardUntrustedKeypressEvents };
				frame.contentWindow!.focus();
				assert.strictEqual(document.activeElement, frame);
				const forwarded: string[] = [];
				store.add(addDisposableListener(mainWindow, type, (event: KeyboardEvent) => {
					if (event.target === frame) {
						forwarded.push(event.key);
					}
				}));
				const keyEventToken = createReadyEvent().data.data.keyEventToken;
				for (const event of [
					{ key: 'trusted', keyEventToken, isTrusted: true },
					{ key: 'untrusted', keyEventToken, isTrusted: false },
					{ key: 'forged', keyEventToken: 'forged', isTrusted: true },
					{ key: 'missing-token', isTrusted: true },
					{ key: 'empty-token', keyEventToken: '', isTrusted: true },
				]) {
					port.postMessage({ channel: `did-${type}`, data: event });
				}
				const drained = Event.toPromise(webview.onMessage, store.add(new DisposableStore()));
				port.postMessage({ channel: 'onmessage', data: { message: 'done' } });
				await drained;

				assert.deepStrictEqual(forwarded, forwardUntrustedKeypressEvents ? ['trusted', 'untrusted'] : ['trusted']);
			});
		}
	}

	test('remount rejects the old handshake and key token', async () => {
		const { webview, frame, createReadyEvent, remount } = await createWebview();
		const oldReady = createReadyEvent();
		await remount();
		const channel = new MessageChannel();
		store.add(toDisposable(() => {
			channel.port1.close();
			channel.port2.close();
		}));
		const ready = createReadyEvent(channel.port1, 'new-shell-token');
		// Keep the current source window so rejection specifically tests the stale mount id.
		mainWindow.dispatchEvent(new MessageEvent('message', { ...ready, data: oldReady.data }));
		const rejectedStaleMount = channel.port1.onmessage === null;
		mainWindow.dispatchEvent(new MessageEvent('message', ready));
		const acceptedNewMount = channel.port1.onmessage !== null;
		frame.contentWindow!.focus();
		const forwarded: string[] = [];
		store.add(addDisposableListener(mainWindow, 'keydown', (event: KeyboardEvent) => {
			if (event.target === frame) {
				forwarded.push(event.key);
			}
		}));
		for (const keyEventToken of [oldReady.data.data.keyEventToken, ready.data.data.keyEventToken]) {
			channel.port2.postMessage({ channel: 'did-keydown', data: { key: keyEventToken, keyEventToken, isTrusted: true } });
		}
		const drained = Event.toPromise(webview.onMessage, store.add(new DisposableStore()));
		channel.port2.postMessage({ channel: 'onmessage', data: { message: 'done' } });
		await drained;

		assert.deepStrictEqual({ rejectedStaleMount, acceptedNewMount, forwarded }, {
			rejectedStaleMount: true,
			acceptedNewMount: true,
			forwarded: ['new-shell-token'],
		});
	});

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

	suite('remote resource loading', () => {
		async function loadRemoteResource(connectionAuthority: string | null, os: OperatingSystem | null, root: URI, resource: URI) {
			const { webview, instantiationService, port } = await createWebview();
			const remoteAgentService = instantiationService.get(IRemoteAgentService);
			sinon.stub(remoteAgentService, 'getConnection').returns(connectionAuthority === null ? null : upcastPartial<IRemoteAgentConnection>({ remoteAuthority: connectionAuthority }));
			const getEnvironment = sinon.stub(remoteAgentService, 'getEnvironment').resolves(os === null ? null : upcastPartial<IRemoteAgentEnvironment>({ os }));
			const fileService = store.add(new TestFileService());
			instantiationService.stub(IFileService, fileService);
			instantiationService.stub(IUriIdentityService, store.add(new UriIdentityService(fileService)));
			const readFileStream = sinon.spy(fileService, 'readFileStream');
			webview.contentOptions = { localResourceRoots: [root] };

			const response = new DeferredPromise<ToWebviewMessage['did-load-resource']>();
			store.add(addDisposableListener(port, 'message', (event: MessageEvent<WebviewMessage>) => {
				if (event.data.channel === 'did-load-resource') {
					response.complete(event.data.args);
				}
			}));
			const url = new URL(asWebviewUri(resource).toString());
			port.postMessage({
				channel: 'load-resource',
				data: {
					id: 1,
					scheme: resource.scheme,
					authority: url.hostname.slice(resource.scheme.length + 1, -(webviewRootResourceAuthority.length + 1)),
					path: url.pathname,
					query: url.search.slice(1),
				},
			});
			const result = await response.p;
			if ((result.status === 200 || result.status === 206) && result.stream) {
				await new Response(result.stream).text();
			}
			return {
				status: result.status,
				environmentRequests: getEnvironment.callCount,
				readResources: readFileStream.getCalls().map(call => call.args[0].toString()),
			};
		}

		for (const { authority, os } of [
			{ authority: 'wsl+Ubuntu', os: OperatingSystem.Linux },
			{ authority: 'wsl+Ubuntu-24.04', os: OperatingSystem.Linux },
			{ authority: 'wsl+Ubuntu-26.04', os: OperatingSystem.Linux },
			{ authority: 'wsl+FedoraLinux-44', os: OperatingSystem.Linux },
			{ authority: 'wsl+ubuntu', os: OperatingSystem.Linux },
			{ authority: 'ssh-remote+WindowsHost', os: OperatingSystem.Windows },
			{ authority: 'ssh-remote+MacHost', os: OperatingSystem.Macintosh },
		]) {
			test(`loads resources from ${authority} after the browser normalizes the hostname`, async () => {
				const root = URI.from({ scheme: Schemas.vscodeRemote, authority, path: os === OperatingSystem.Windows ? '/c:/Project' : '/home/user/Project' });
				const resource = URI.joinPath(root, 'media', 'Index.js');

				assert.deepStrictEqual(await loadRemoteResource(authority, os, root, resource), {
					status: 200,
					environmentRequests: 1,
					readResources: [URI.from({
						scheme: Schemas.vscodeRemote,
						authority: authority.toLowerCase(),
						path: '/vscode-resource',
						query: JSON.stringify({ requestResourcePath: resource.path }),
					}).toString()],
				});
			});
		}

		const root = URI.from({ scheme: Schemas.vscodeRemote, authority: 'wsl+ubuntu', path: '/home/user/Project' });
		const resource = URI.joinPath(root, 'media', 'Index.js');
		for (const testCase of [
			{ name: 'a different connection authority', authority: 'wsl+debian', os: OperatingSystem.Linux, root, resource, environmentRequests: 0 },
			{ name: 'no remote connection', authority: null, os: OperatingSystem.Linux, root, resource, environmentRequests: 0 },
			{ name: 'an unknown remote OS', authority: root.authority, os: null, root, resource, environmentRequests: 1 },
			{ name: 'a different root authority', authority: root.authority, os: OperatingSystem.Linux, root: root.with({ authority: 'wsl+debian' }), resource, environmentRequests: 1 },
			{ name: 'a path outside the allowed root', authority: root.authority, os: OperatingSystem.Linux, root, resource: resource.with({ path: '/home/user/Other/Index.js' }), environmentRequests: 1 },
		]) {
			test(`denies resources with ${testCase.name}`, async () => {
				assert.deepStrictEqual(await loadRemoteResource(testCase.authority, testCase.os, testCase.root, testCase.resource), {
					status: 401,
					environmentRequests: testCase.environmentRequests,
					readResources: [],
				});
			});
		}
	});

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
