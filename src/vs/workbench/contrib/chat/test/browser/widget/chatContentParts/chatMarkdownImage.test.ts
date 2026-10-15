/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_SCHEME, createAgentHostResourceUriMapper, toAgentHostUri } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../../platform/agentHost/common/agentService.js';
import { AgentSubscriptionManager } from '../../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { IStateSnapshot } from '../../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { ComponentToState, SessionLifecycle, SessionState, SessionStatus, StateComponents } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { ByteSize, IFileContent, IFileService } from '../../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { ChatMarkdownImage } from '../../../../browser/widget/chatContentParts/chatMarkdownImage.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../../common/constants.js';

suite('ChatMarkdownImage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const authority = 'sandbox-owner';
	const backendSession = URI.parse('vendor-session://tenant/different-opaque-identity?scope=project');
	const backendChat = 'vendor-chat://tenant/opaque-conversation?mode=side#thread';
	const resource = toAgentHostUri(URI.file('/workspace/preview.png'), authority);
	const maxBytes = 5 * ByteSize.MB;
	let sessionResource: URI;
	let sessionState: SessionState;
	let snapshots: sinon.SinonStub<[URI], Promise<IStateSnapshot>>;
	let unsubscribed: string[];
	let instantiationService: TestInstantiationService;
	let disposables: DisposableStore;
	let fileService: FileService;
	let provider: InMemoryFileSystemProvider;
	let connection: IAgentConnection | undefined;
	let connectionChanges: Emitter<void>;
	let reads: sinon.SinonSpy<Parameters<IFileService['readFile']>, ReturnType<IFileService['readFile']>>;

	function createConnection(): IAgentConnection {
		const subscriptions = store.add(new AgentSubscriptionManager(
			'image-test', () => 0, () => { },
			resource => snapshots(resource),
			resource => unsubscribed.push(resource.toString()),
		));
		return new class extends mock<IAgentConnection>() {
			override readonly resourceUris = createAgentHostResourceUriMapper(authority);
			override getSubscription<T extends StateComponents>(kind: T, resource: URI, owner: string) {
				assert.strictEqual(kind, StateComponents.Session);
				return subscriptions.getSubscription<ComponentToState[T]>(kind, resource, owner);
			}
		}();
	}

	function imageBytes(mimeType = 'image/png'): VSBuffer {
		if (mimeType === 'image/gif') {
			return decodeBase64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
		}
		if (mimeType === 'image/svg+xml') {
			return VSBuffer.fromString('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="red"/></svg>');
		}
		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = canvas.height = 1;
		return decodeBase64(canvas.toDataURL(mimeType).split(',')[1]);
	}

	function render(href = resource.toString()) {
		const changes = store.add(new Emitter<void>());
		const settled = Event.toPromise(changes.event, disposables);
		const widget = store.add(instantiationService.createInstance(ChatMarkdownImage, sessionResource, href, () => changes.fire()));
		widget.image.alt = 'Preview';
		return { widget, changes, settled };
	}

	setup(async () => {
		sessionResource = URI.parse('remote-sandbox-owner-provider://tenant/opaque-session?key=value').with({ fragment: backendChat });
		sessionState = {
			provider: 'external-provider',
			title: 'Image session',
			status: SessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [{ resource: backendChat, title: 'Image chat', status: SessionStatus.Idle, modifiedAt: '2026-01-01T00:00:00Z' }],
			defaultChat: backendChat,
			workingDirectories: [URI.file('/workspace').toString()],
		};
		snapshots = sinon.stub<[URI], Promise<IStateSnapshot>>().callsFake(async resource => ({
			resource: resource.toString(), state: sessionState, fromSeq: 0,
		}));
		unsubscribed = [];
		disposables = store.add(new DisposableStore());
		instantiationService = store.add(new TestInstantiationService());
		fileService = store.add(new FileService(store.add(new NullLogService())));
		provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(AGENT_HOST_SCHEME, provider));
		connection = createConnection();
		connectionChanges = store.add(new Emitter<void>());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeSessionResolution = connectionChanges.event;
			override resolveSessionResource(session: URI) {
				assert.strictEqual(session, sessionResource);
				return connection ? {
					connection,
					connectionAuthority: 'ambient-alias',
					backendSession,
				} : undefined;
			}
		}());
		await fileService.createFolder(toAgentHostUri(URI.file('/workspace'), authority));
		await fileService.createFolder(toAgentHostUri(URI.file('/workspace/files'), authority));
		await fileService.writeFile(resource, imageBytes());
		reads = sinon.spy(fileService, 'readFile');
	});

	teardown(() => sinon.restore());

	for (const [extension, mimeType] of [['png', 'image/png'], ['JPG', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['gif', 'image/gif'], ['webp', 'image/webp'], ['svg', 'image/svg+xml']]) {
		test(`loads and decodes ${extension} bytes from the owning connection`, async () => {
			const target = toAgentHostUri(URI.file(`/workspace/a #?%[] &.${extension}`), authority);
			const bytes = imageBytes(mimeType);
			await fileService.writeFile(target, bytes);
			const { widget, settled } = render(target.toString());
			await settled;
			assert.ok(widget.image.src.startsWith('blob:'), widget.element.textContent ?? '');
			const response = await fetch(widget.image.src);

			assert.deepStrictEqual({
				reads: reads.args.map(([uri, options]) => ({ uri: uri.toString(), options })),
				type: response.headers.get('content-type'),
				bytes: new Uint8Array(await response.arrayBuffer()),
				dimensions: [widget.image.naturalWidth, widget.image.naturalHeight],
				busy: widget.element.getAttribute('aria-busy'),
			}, {
				reads: [{ uri: target.toString(), options: { limits: { size: maxBytes } } }],
				type: mimeType,
				bytes: bytes.buffer,
				dimensions: [1, 1],
				busy: 'false',
			});
		});
	}

	for (const [href, path] of [
		['files/random-image.svg', '/workspace/files/random-image.svg'],
		['./files/random-image.svg', '/workspace/files/random-image.svg'],
		['files/a%20%23%3F%25.svg', '/workspace/files/a #?%.svg'],
	]) {
		test(`resolves ${href} against the advertised session directory`, async () => {
			const target = toAgentHostUri(URI.file(path), authority);
			await fileService.writeFile(target, imageBytes('image/svg+xml'));
			const { widget, settled } = render(href);
			await settled;
			const dimensions = [widget.image.naturalWidth, widget.image.naturalHeight];
			widget.dispose();

			assert.deepStrictEqual({
				subscriptions: snapshots.args.map(([uri]) => uri.toString()),
				reads: reads.args.map(([uri]) => uri.toString()),
				dimensions,
				unsubscribed,
			}, {
				subscriptions: [backendSession.toString()],
				reads: [target.toString()],
				dimensions: [1, 1],
				unsubscribed: [backendSession.toString()],
			});
		});
	}

	for (const selector of ['default', 'fragment', 'query']) {
		test(`uses the ${selector} chat's working directory subset`, async () => {
			sessionState.workingDirectories = [URI.file('/another-project').toString()];
			sessionState.chats[0].workingDirectories = [toAgentHostUri(URI.file('/workspace'), authority).toString()];
			if (selector === 'default') {
				sessionResource = sessionResource.with({ fragment: '' });
			} else {
				sessionState.defaultChat = 'vendor-chat://tenant/default';
				sessionState.chats.push({ ...sessionState.chats[0], resource: sessionState.defaultChat, workingDirectories: undefined });
				if (selector === 'query') {
					sessionResource = sessionResource.with({ fragment: '', query: new URLSearchParams({ [CHAT_SUBAGENT_RESOURCE_QUERY_PARAM]: backendChat }).toString() });
				}
			}
			const { widget, settled } = render('preview.png');
			await settled;
			assert.deepStrictEqual({
				reads: reads.args.map(([uri]) => uri.toString()),
				dimensions: [widget.image.naturalWidth, widget.image.naturalHeight],
			}, {
				reads: [resource.toString()],
				dimensions: [1, 1],
			});
		});
	}

	for (const missing of ['working directory', 'chat', 'chat directory subset']) {
		test(`does not fall back to client files when the ${missing} is unavailable`, async () => {
			if (missing === 'working directory') {
				sessionState.workingDirectories = undefined;
			} else if (missing === 'chat') {
				sessionState.chats = [];
			} else {
				sessionState.chats[0].workingDirectories = [];
			}
			const { widget, settled } = render('preview.png');
			await settled;
			assert.deepStrictEqual({
				reads: reads.callCount,
				source: widget.image.getAttribute('src'),
				error: widget.element.textContent,
			}, {
				reads: 0,
				source: null,
				error: 'Unable to load image "Preview": The session\'s working directory is unavailable.',
			});
		});
	}

	for (const directory of [
		toAgentHostUri(URI.file('/workspace'), 'another-sandbox'),
		URI.parse('file://network/share'),
		URI.parse('https://example.com/workspace'),
		URI.parse('agenthost-content:/workspace'),
	]) {
		test(`rejects an out-of-scope working directory: ${directory}`, async () => {
			sessionState.workingDirectories = [directory.toString()];
			const stats = sinon.spy(fileService, 'resolve');
			const { widget, settled } = render('preview.png');
			await settled;
			assert.deepStrictEqual({
				stats: stats.callCount,
				reads: reads.callCount,
				source: widget.image.getAttribute('src'),
				error: widget.element.textContent,
			}, {
				stats: 0,
				reads: 0,
				source: null,
				error: 'Unable to load image "Preview": Only files on this session\'s Agent Host can be displayed.',
			});
		});
	}

	test('waits for session metadata before resolving the relative image', async () => {
		const pending = new DeferredPromise<IStateSnapshot>();
		snapshots.returns(pending.p);
		const { widget, settled } = render('preview.png');
		const initial = { reads: reads.callCount, busy: widget.element.getAttribute('aria-busy'), source: widget.image.getAttribute('src') };
		await pending.complete({ resource: backendSession.toString(), state: sessionState, fromSeq: 0 });
		await settled;
		assert.deepStrictEqual({
			initial,
			reads: reads.args.map(([uri]) => uri.toString()),
			dimensions: [widget.image.naturalWidth, widget.image.naturalHeight],
		}, {
			initial: { reads: 0, busy: 'true', source: null },
			reads: [resource.toString()],
			dimensions: [1, 1],
		});
	});

	test('surfaces session subscription errors', async () => {
		snapshots.rejects(new Error('Session metadata unavailable'));
		const { widget, settled } = render('preview.png');
		await settled;
		assert.deepStrictEqual({ reads: reads.callCount, error: widget.element.textContent, unsubscribed }, {
			reads: 0,
			error: 'Unable to load image "Preview": Session metadata unavailable',
			unsubscribed: [backendSession.toString()],
		});
	});

	test('cancels waiting for the working directory when disposed', async () => {
		const pending = new DeferredPromise<IStateSnapshot>();
		snapshots.returns(pending.p);
		const { widget } = render('preview.png');
		widget.dispose();
		await pending.complete({ resource: backendSession.toString(), state: sessionState, fromSeq: 0 });
		await timeout(0);
		assert.deepStrictEqual({
			reads: reads.callCount,
			source: widget.image.getAttribute('src'),
			unsubscribed,
		}, { reads: 0, source: null, unsubscribed: [backendSession.toString()] });
	});

	for (const target of [
		toAgentHostUri(URI.file('/workspace/preview.png'), 'another-sandbox'),
		toAgentHostUri(URI.parse('file://network/share/preview.png'), authority),
		resource.with({ path: '//network/share/preview.png' }),
		toAgentHostUri(URI.from({ scheme: 'file', path: '/\\network/share/preview.png' }), authority),
		toAgentHostUri(URI.parse('https://example.com/preview.png'), authority),
		toAgentHostUri(URI.parse('agenthost-content:/preview.png'), authority),
		toAgentHostUri(URI.file('/workspace/preview.png').with({ query: 'other=resource' }), authority),
		URI.from({ scheme: AGENT_HOST_SCHEME, authority, path: '/workspace/preview.png' }),
		'//network/share/preview.svg',
		'\\\\network\\share\\preview.svg',
		'preview.png?other=resource',
	]) {
		test(`rejects out-of-scope resources without reading: ${target}`, async () => {
			const stats = sinon.spy(fileService, 'resolve');
			const { widget, settled } = render(target.toString());
			await settled;

			assert.deepStrictEqual({
				reads: reads.callCount,
				stats: stats.callCount,
				source: widget.image.getAttribute('src'),
				error: widget.element.textContent?.startsWith('Unable to load image "Preview":'),
			}, {
				reads: 0,
				stats: 0,
				source: null,
				error: true,
			});
		});
	}

	test('rejects unsupported formats before reading', async () => {
		const { widget, settled } = render(toAgentHostUri(URI.file('/workspace/preview.bmp'), authority).toString());
		await settled;
		assert.deepStrictEqual({ reads: reads.callCount, error: widget.element.textContent }, {
			reads: 0,
			error: 'Unable to load image "Preview": Supported image formats are PNG, JPEG, GIF, WebP, and SVG.',
		});
	});

	test('renders an image at the byte limit', async () => {
		const bytes = VSBuffer.alloc(maxBytes);
		bytes.buffer.set(imageBytes().buffer);
		await fileService.writeFile(resource, bytes);
		const { widget, settled } = render();
		await settled;
		assert.deepStrictEqual([widget.image.naturalWidth, widget.image.naturalHeight], [1, 1]);
	});

	test('rejects an image one byte above the limit before reading', async () => {
		await fileService.writeFile(resource, VSBuffer.alloc(maxBytes + 1));
		const { widget, settled } = render();
		await settled;
		assert.deepStrictEqual({ reads: reads.callCount, error: widget.element.textContent }, {
			reads: 0,
			error: 'Unable to load image "Preview": The image must be a file no larger than 5 MB.',
		});
	});

	test('enforces the byte limit when a file grows after stat', async () => {
		sinon.stub(provider, 'readFile').resolves(new Uint8Array(maxBytes + 1));
		const { widget, settled } = render();
		await settled;
		assert.deepStrictEqual({
			reads: reads.callCount,
			source: widget.image.getAttribute('src'),
			error: widget.element.textContent?.includes('too large'),
		}, { reads: 1, source: null, error: true });
	});

	for (const [name, content, error] of [
		['disguised SVG', VSBuffer.fromString('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'could not be decoded'],
		['empty image', VSBuffer.alloc(0), 'could not be decoded'],
	] as const) {
		test(`rejects ${name}`, async () => {
			await fileService.writeFile(resource, content);
			const { widget, settled } = render();
			await settled;
			assert.deepStrictEqual({ source: widget.image.getAttribute('src'), error: widget.element.textContent?.includes(error) }, { source: null, error: true });
		});
	}

	test('rejects excessive decoded dimensions before giving the bytes to the browser', async () => {
		const bytes = imageBytes();
		bytes.writeUInt32BE(8000, 16);
		bytes.writeUInt32BE(5001, 20);
		await fileService.writeFile(resource, bytes);
		const { widget, settled } = render();
		await settled;
		assert.deepStrictEqual({ source: widget.image.getAttribute('src'), error: widget.element.textContent }, {
			source: null,
			error: 'Unable to load image "Preview": The image exceeds the 40 megapixel limit.',
		});
	});

	test('surfaces browser decoding failures after validating the image header', async () => {
		await fileService.writeFile(resource, imageBytes().slice(0, 24));
		const { widget, settled } = render();
		await settled;
		assert.deepStrictEqual({
			source: widget.image.getAttribute('src'),
			busy: widget.element.getAttribute('aria-busy'),
			error: widget.element.textContent,
		}, {
			source: null,
			busy: 'false',
			error: 'Unable to load image "Preview": The file could not be decoded as an image.',
		});
	});

	test('keeps SVG markup and scripts in an inert image document', async () => {
		const marker = mainWindow.document.createElement('span');
		marker.id = generateUuid();
		marker.textContent = 'unchanged';
		mainWindow.document.body.appendChild(marker);
		store.add(toDisposable(() => marker.remove()));
		const target = toAgentHostUri(URI.file('/workspace/preview.svg'), authority);
		const script = `parent.document.getElementById('${marker.id}').textContent = 'executed';`;
		await fileService.writeFile(target, VSBuffer.fromString(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" onload="${script}"><script>${script}</script><rect width="1" height="1" fill="red"/></svg>`));
		const { widget, settled } = render(target.toString());
		await settled;

		assert.deepStrictEqual({
			dimensions: [widget.image.naturalWidth, widget.image.naturalHeight],
			inlineSvg: widget.element.querySelector('svg'),
			scriptResult: marker.textContent,
		}, { dimensions: [1, 1], inlineSvg: null, scriptResult: 'unchanged' });
	});

	for (const height of [5000, 5001]) {
		test(`enforces the decoded SVG pixel limit at 8000 by ${height}`, async () => {
			const target = toAgentHostUri(URI.file('/workspace/preview.svg'), authority);
			await fileService.writeFile(target, VSBuffer.fromString(`<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="${height}"/>`));
			const { widget, settled } = render(target.toString());
			await settled;
			assert.deepStrictEqual({
				visible: widget.image.style.display !== 'none',
				sourceIsBlob: widget.image.src.startsWith('blob:'),
				error: widget.element.textContent?.includes('exceeds the 40 megapixel limit'),
			}, {
				visible: height === 5000,
				sourceIsBlob: height === 5000,
				error: height === 5001,
			});
		});
	}

	for (const content of ['<svg', '<html><body>not an SVG image</body></html>', '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="1"/>']) {
		test(`rejects invalid SVG content: ${content}`, async () => {
			const target = toAgentHostUri(URI.file('/workspace/preview.svg'), authority);
			await fileService.writeFile(target, VSBuffer.fromString(content));
			const { widget, settled } = render(target.toString());
			await settled;
			assert.deepStrictEqual({ source: widget.image.getAttribute('src'), error: widget.element.textContent }, {
				source: null,
				error: 'Unable to load image "Preview": The file could not be decoded as an image.',
			});
		});
	}

	test('surfaces missing files instead of falling back to a local read', async () => {
		const { widget, settled } = render(toAgentHostUri(URI.file('/workspace/missing.png'), authority).toString());
		await settled;
		assert.deepStrictEqual({ reads: reads.callCount, error: widget.element.textContent?.startsWith('Unable to load image "Preview":') }, { reads: 0, error: true });
	});

	for (const href of [resource.toString(), 'preview.png']) {
		test(`restored history retries on the owning connection: ${href}`, async () => {
			connection = undefined;
			const { widget, changes, settled } = render(href);
			await settled;
			const error = widget.element.textContent;
			const reconnected = Event.toPromise(changes.event, disposables);
			connection = createConnection();
			connectionChanges.fire();
			await reconnected;
			connectionChanges.fire();

			assert.deepStrictEqual({
				error,
				reads: reads.callCount,
				dimensions: [widget.image.naturalWidth, widget.image.naturalHeight],
			}, {
				error: 'Unable to load image "Preview": Connect to this session\'s Agent Host to load the image.',
				reads: 1,
				dimensions: [1, 1],
			});
		});
	}

	test('cancels a disconnected read and retries when the same connection recovers', async () => {
		const content = await fileService.readFile(resource);
		const pending = new DeferredPromise<IFileContent>();
		const started = new DeferredPromise<void>();
		reads.restore();
		const read = sinon.stub(fileService, 'readFile').resolves(content);
		read.onFirstCall().callsFake(() => {
			void started.complete();
			return pending.p;
		});
		const { widget, changes } = render();
		await started.p;
		const originalConnection = connection;
		const disconnected = Event.toPromise(changes.event, disposables);
		connection = undefined;
		connectionChanges.fire();
		await disconnected;
		await pending.complete(content);
		await timeout(0);
		const disconnectedState = {
			cancelled: read.firstCall.args[2]?.isCancellationRequested,
			source: widget.image.getAttribute('src'),
			error: widget.element.textContent,
		};
		const reconnected = Event.toPromise(changes.event, disposables);
		connection = originalConnection;
		connectionChanges.fire();
		await reconnected;

		assert.deepStrictEqual({
			disconnectedState,
			reads: read.callCount,
			dimensions: [widget.image.naturalWidth, widget.image.naturalHeight],
		}, {
			disconnectedState: {
				cancelled: true,
				source: null,
				error: 'Unable to load image "Preview": Connect to this session\'s Agent Host to load the image.',
			},
			reads: 2,
			dimensions: [1, 1],
		});
	});

	test('cancels an in-flight image read when the Markdown is disposed', async () => {
		const content = await fileService.readFile(resource);
		const pending = new DeferredPromise<IFileContent>();
		reads.restore();
		const started = new DeferredPromise<void>();
		const read = sinon.stub(fileService, 'readFile').callsFake(() => {
			void started.complete();
			return pending.p;
		});
		const { widget } = render();
		await started.p;
		widget.dispose();
		await pending.complete(content);
		await timeout(0);

		assert.deepStrictEqual({
			cancelled: read.firstCall.args[2]?.isCancellationRequested,
			source: widget.image.getAttribute('src'),
		}, { cancelled: true, source: null });
	});

	for (const [extension, mimeType] of [['png', 'image/png'], ['svg', 'image/svg+xml']]) {
		test(`revokes the ${extension} blob URL when the Markdown is disposed`, async () => {
			const target = toAgentHostUri(URI.file(`/workspace/preview.${extension}`), authority);
			await fileService.writeFile(target, imageBytes(mimeType));
			const { widget, settled } = render(target.toString());
			await settled;
			const url = widget.image.src;
			widget.dispose();
			await assert.rejects(fetch(url));
		});
	}
});
