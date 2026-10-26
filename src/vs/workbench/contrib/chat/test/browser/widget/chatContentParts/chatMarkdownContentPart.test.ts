/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, stub } from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../../../base/common/buffer.js';
import { addDisposableListener } from '../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { resolvePath } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { SymbolKind, SymbolTag } from '../../../../../../../editor/common/languages.js';
import { ILinkPresentation, ILinkPresentationService } from '../../../../../../../platform/dataChannel/common/dataChannel.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { BrowserResourceService } from '../../../../../../../platform/files/browser/browserResourceService.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentHostFileSystemProvider, IRemoteFilesystemConnection } from '../../../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { ContentEncoding, ResourceReadResult, ResourceResolveParams, ResourceResolveResult, ResourceType } from '../../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatMarkdownContentPart } from '../../../../browser/widget/chatContentParts/chatMarkdownContentPart.js';
import { ChatMarkdownDecorationsRenderer } from '../../../../browser/widget/chatContentParts/chatMarkdownDecorationsRenderer.js';
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatPetService } from '../../../../browser/chatPetService.js';
import { IChatImageCarouselService } from '../../../../browser/chatImageCarouselService.js';
import { ChatContentMarkdownRenderer } from '../../../../browser/widget/chatContentMarkdownRenderer.js';
import { EditorPool, DiffEditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { CodeBlockPart, ICodeBlockData } from '../../../../browser/widget/chatContentParts/codeBlockPart.js';
import { IChatOutputRendererService, type RenderedOutputPart } from '../../../../browser/chatOutputItemRenderer.js';
import { IChatOutputPartStateCache, IOutputPartState } from '../../../../browser/widget/chatContentParts/chatOutputPartStateCache.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { IChatContentInlineReference } from '../../../../common/chatService/chatService.js';
import { getChatMarkdownImageId } from '../../../../common/chatImageExtraction.js';
import { IChatSessionsService } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { rewriteAgentHostLinkTarget } from '../../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { IAiEditTelemetryService } from '../../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IViewDescriptorService } from '../../../../../../common/views.js';
import { IDisposableReference } from '../../../../browser/widget/chatContentParts/chatCollections.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';

suite('ChatMarkdownContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let editorPool: EditorPool;
	let renderer: IMarkdownRenderer;
	let chatSessionsService: MockChatSessionsService;

	/** Data captured from each CodeBlockPart.render() call */
	const renderedCodeBlocks: ICodeBlockData[] = [];
	const renderedCodeBlockWidths: number[] = [];
	const renderedCodeBlockOutputs: { identifier: string; text: string }[] = [];
	let outputStateCache: Map<string, IOutputPartState>;

	function createMockEditorPool(): EditorPool {
		return {
			get(): IDisposableReference<CodeBlockPart> {
				const element = mainWindow.document.createElement('div');
				const mockPart = {
					element,
					get uri() { return undefined; },
					render(data: ICodeBlockData, width: number) {
						renderedCodeBlocks.push(data);
						renderedCodeBlockWidths.push(width);
					},
					layout() { },
					focus() { },
					reset() { },
					onDidRemount() { },
				} as unknown as CodeBlockPart;

				return {
					object: mockPart,
					isStale: () => false,
					dispose: () => { },
				};
			},
			inUse: () => [],
			dispose: () => { },
		} as unknown as EditorPool;
	}

	function createRenderContext(isComplete: boolean = true): IChatContentPartRenderContext {
		const mockElement: Partial<IChatResponseViewModel> = {
			isComplete,
			isCompleteAddedRequest: false,
			id: 'test-response-id',
			sessionResource: URI.parse('chat-session://test/session1'),
			setVote: () => { },
			contentReferences: [],
			get model() { return {} as IChatResponseViewModel['model']; },
		};

		const markdownContent = { kind: 'markdownContent' as const, content: new MarkdownString('') };

		return {
			element: mockElement as IChatResponseViewModel,
			inlineTextModels: undefined!,
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [markdownContent],
			contentIndex: 0,
			editorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: {} as DiffEditorPool,
			currentWidth: observableValue('currentWidth', 500),
			onDidChangeVisibility: Event.None,
		};
	}

	function createMarkdownPart(markdown: string | MarkdownString, context?: IChatContentPartRenderContext, fillInIncompleteTokens = false, supportHtml = false): ChatMarkdownContentPart {
		const ctx = context ?? createRenderContext();
		return store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: typeof markdown === 'string' ? new MarkdownString(markdown, { supportHtml }) : markdown },
			ctx,
			editorPool,
			fillInIncompleteTokens,
			ctx.codeBlockStartIndex,
			renderer,
			undefined, // markdownRenderOptions
			() => ctx.currentWidth.get(),
			{}, // rendererOptions
		));
	}

	function createMarkdownPartWithInlineReferences(markdownText: string, inlineReferences: Record<string, IChatContentInlineReference>, context?: IChatContentPartRenderContext, fillInIncompleteTokens = false): ChatMarkdownContentPart {
		const ctx = context ?? createRenderContext();
		return store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString(markdownText), inlineReferences },
			ctx,
			editorPool,
			fillInIncompleteTokens,
			ctx.codeBlockStartIndex,
			renderer,
			undefined,
			() => ctx.currentWidth.get(),
			{},
		));
	}

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, disposables);
		chatSessionsService = new MockChatSessionsService();
		instantiationService.stub(IChatSessionsService, chatSessionsService);
		instantiationService.stub(IChatMarkdownAnchorService, disposables.add(new ChatMarkdownAnchorService()));
		instantiationService.stub(IChatPetService, new class extends mock<IChatPetService>() {
			override unlockAchievement(): boolean { return false; }
		}());
		instantiationService.stub(ILinkPresentationService, {
			_serviceBrand: undefined,
			onDidChangeLinkPresentationRules: Event.None,
			linkPresentationRules: [],
			registerLinkPresentationProvider: () => ({ dispose: () => { } }),
			registerExtensionLinkPresentationProvider: () => ({ dispose: () => { } }),
			getLinkPresentationRule: () => undefined,
			createLinkPresentationWatcher: () => undefined,
		});
		renderedCodeBlocks.length = 0;
		renderedCodeBlockWidths.length = 0;
		renderedCodeBlockOutputs.length = 0;
		outputStateCache = new Map<string, IOutputPartState>();

		// Seed configuration values needed by ChatEditorOptions
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configService.setUserConfiguration('chat', {
			editor: {
				fontSize: 13,
				fontFamily: 'default',
				fontWeight: 'normal',
				lineHeight: 0,
				wordWrap: 'on',
			}
		});
		configService.setUserConfiguration('editor', {
			fontFamily: 'Consolas',
			fontLigatures: false,
			accessibilitySupport: 'off',
		});

		// Stub hover service
		instantiationService.stub(IHoverService, {
			_serviceBrand: undefined,
			showDelayedHover: () => undefined,
			setupDelayedHover: () => ({ dispose: () => { } }),
			setupDelayedHoverAtMouse: () => ({ dispose: () => { } }),
			showInstantHover: () => undefined,
			hideHover: () => { },
			showAndFocusLastHover: () => { },
			setupManagedHover: () => ({ dispose: () => { }, show: () => { }, hide: () => { }, update: () => { } }),
			showManagedHover: () => { },
		});

		// Stub AI edit telemetry service
		instantiationService.stub(IAiEditTelemetryService, {
			_serviceBrand: undefined,
			createSuggestionId: () => undefined!,
			handleCodeAccepted: () => { },
			handleCodeRejected: () => { },
		});

		instantiationService.stub(IChatOutputRendererService, {
			_serviceBrand: undefined,
			registerRenderer: () => ({ dispose: () => { } }),
			hasCodeBlockRenderer: identifier => identifier.toLowerCase() === 'mermaid',
			renderOutputPart: async () => { throw new Error('Unexpected output render'); },
			renderCodeBlock: async (identifier, data) => {
				renderedCodeBlockOutputs.push({ identifier, text: new TextDecoder().decode(data) });
				return {
					webview: {
						focus: () => { },
						onDidWheel: Event.None,
						onDidUpdateState: Event.None,
					} as RenderedOutputPart['webview'],
					onDidChangeHeight: Event.None,
					reinitialize: () => { },
					dispose: () => { },
				};
			},
		});

		instantiationService.stub(IChatOutputPartStateCache, {
			_serviceBrand: undefined,
			get: key => outputStateCache.get(key),
			set: (key, state) => outputStateCache.set(key, state),
		});

		// Stub view descriptor service
		instantiationService.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			onDidChangeContainer: Event.None,
			getViewLocationById: () => null,
		});

		renderer = instantiationService.createInstance(ChatContentMarkdownRenderer);

		// Create a mock editor pool
		editorPool = createMockEditorPool();
	});

	teardown(() => {
		disposables.dispose();
	});

	test('decorates a response with 1000 ordinary links and one preview link in a single anchor scan', () => {
		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configurationService.setUserConfiguration(ChatConfiguration.RichLinks, false);
		const element = mainWindow.document.createElement('div');
		for (let i = 0; i < 1000; i++) {
			const anchor = mainWindow.document.createElement('a');
			anchor.textContent = `Link ${i}`;
			anchor.setAttribute('data-href', `https://example.com/${i}${i % 2 ? '?view=full' : ''}`);
			element.appendChild(anchor);
		}
		const preview = mainWindow.document.createElement('a');
		preview.textContent = 'Open Report';
		preview.setAttribute('data-href', 'file:///report.md?vscodeLinkType=markdown-preview');
		element.appendChild(preview);
		const queries = spy(element, 'querySelectorAll');
		disposables.add(toDisposable(() => queries.restore()));
		const decorationsRenderer = disposables.add(instantiationService.createInstance(ChatMarkdownDecorationsRenderer));

		disposables.add(decorationsRenderer.walkTreeAndAnnotateReferenceLinks({ kind: 'markdownContent', content: new MarkdownString() }, element));

		assert.deepStrictEqual({
			anchorScans: queries.withArgs('a').callCount,
			linkCount: element.childElementCount,
			widgets: Array.from(element.querySelectorAll('.chat-inline-anchor-widget')).map(anchor => anchor.textContent),
			firstLink: element.firstElementChild?.getAttribute('data-href'),
		}, {
			anchorScans: 1,
			linkCount: 1001,
			widgets: ['Open Report'],
			firstLink: 'https://example.com/0',
		});
	});

	for (const keyCode of [13, 32]) {
		test(`opens policy previews through the widget on keyCode ${keyCode}`, async () => {
			const opened = new DeferredPromise<Parameters<IOpenerService['open']>>();
			instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
				override async open(...args: Parameters<IOpenerService['open']>): Promise<boolean> {
					opened.complete(args);
					return true;
				}
			}());
			renderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
			const part = createMarkdownPart('[Open Report](file:///report.md?vscodeLinkType=markdown-preview)');
			const anchor = part.domNode.querySelector('a')!;

			anchor.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode, bubbles: true, cancelable: true }));

			const [resource, options] = await opened.p;
			assert.deepStrictEqual({
				resource: resource.toString(),
				options,
			}, {
				resource: 'file:///report.md',
				options: {
					fromUserGesture: true,
					editorOptions: { override: 'vscode.markdown.preview.editor', selection: undefined },
				},
			});
			await timeout(0);
		});
	}

	for (const authority of ['local', 'remote-host']) {
		for (const richLinks of [false, true]) {
			test(`opens sandbox policy response links in Markdown preview on ${authority} with rich links ${richLinks}`, async () => {
				const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
				configurationService.setUserConfiguration(ChatConfiguration.RichLinks, richLinks);
				disposables.add(chatSessionsService.registerChatSessionContentProvider('chat-session', {
					provideChatSessionContent: async () => { throw new Error('Unexpected session resolution'); },
					resolveChatResponseUri: (_resource, href) => rewriteAgentHostLinkTarget(href, authority),
				}));
				const opened = new DeferredPromise<Parameters<IOpenerService['open']>>();
				instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
					override async open(...args: Parameters<IOpenerService['open']>): Promise<boolean> {
						opened.complete(args);
						return true;
					}
				}());
				const resource = URI.file('C:/session/diagnostics/sandbox-policy.md');
				const link = resource.with({ query: 'vscodeLinkType=markdown-preview' });
				const part = createMarkdownPart(new MarkdownString().appendLink(link, 'Open Sandbox Policy').value);
				const anchor = part.domNode.querySelector<HTMLElement>('.chat-inline-anchor-widget');
				assert.ok(anchor, 'The response link must use the preview-aware file widget');

				anchor.click();

				const [openedResource, options] = await opened.p;
				assert.deepStrictEqual({
					resource: openedResource.toString(),
					options,
				}, {
					resource: rewriteAgentHostLinkTarget(resource.toString(), authority),
					options: {
						fromUserGesture: true,
						editorOptions: { override: 'vscode.markdown.preview.editor', selection: undefined },
					},
				});
				await timeout(0);
			});
		}
	}

	test('transforms accumulated response Markdown while preserving link text', () => {
		disposables.add(chatSessionsService.registerChatSessionContentProvider('chat-session', {
			provideChatSessionContent: async () => { throw new Error('Unexpected session resolution'); },
			resolveChatResponseUri: (_resource, href) => rewriteAgentHostLinkTarget(href, 'my-host'),
		}));

		const part = createMarkdownPart('`[foo.ts](/code.ts)` [a[b].ts](/remote/a.ts "/remote/a.ts"), [a\\*b.ts](/remote/b.ts), [line.ts](/remote/line.ts:42), [column.ts](/remote/column.ts:42:7), [windows.ts](C:/remote/windows.ts:42), [unc.ts](//server/share/unc.ts:42), [skill](/remote/skill/SKILL.md), [file-uri.ts](file:///remote/file-uri.ts:42), [session](agent-host-session://copilotcli/session-1), and [chat](agent-host-session://copilotcli/session-1?chat=chat-2). ![image](/remote/image.png)');
		const links = Array.from(part.domNode.querySelectorAll('a'));
		const skillUri = toAgentHostUri(URI.file('/remote/skill/SKILL.md'), 'my-host');
		assert.deepStrictEqual(
			{
				links: links.map(link => ({ text: link.textContent, href: link.dataset.href })),
				imageSource: part.domNode.querySelector('img')?.getAttribute('src'),
			},
			{
				links: [
					{ text: 'a[b].ts', href: toAgentHostUri(URI.file('/remote/a.ts'), 'my-host').toString() },
					{ text: 'a*b.ts', href: toAgentHostUri(URI.file('/remote/b.ts'), 'my-host').toString() },
					{ text: 'line.ts', href: toAgentHostUri(URI.file('/remote/line.ts').with({ fragment: 'L42' }), 'my-host').toString() },
					{ text: 'column.ts', href: toAgentHostUri(URI.file('/remote/column.ts').with({ fragment: 'L42,7' }), 'my-host').toString() },
					{ text: 'windows.ts', href: toAgentHostUri(URI.file('C:/remote/windows.ts').with({ fragment: 'L42' }), 'my-host').toString() },
					{ text: 'unc.ts', href: toAgentHostUri(URI.file('//server/share/unc.ts').with({ fragment: 'L42' }), 'my-host').toString() },
					{ text: 'skill', href: skillUri.with({ query: `${skillUri.query}&vscodeLinkType=skill` }).toString() },
					{ text: 'file-uri.ts', href: toAgentHostUri(URI.file('/remote/file-uri.ts').with({ fragment: 'L42' }), 'my-host').toString() },
					{ text: 'session', href: 'agent-host-session://copilotcli/session-1' },
					{ text: 'chat', href: 'agent-host-session://copilotcli/session-1?chat=chat-2' },
				],
				imageSource: toAgentHostUri(URI.file('/remote/image.png'), 'my-host').toString(true),
			},
		);
	});

	test('preserves absolute Windows targets for newly created file links', () => {
		disposables.add(chatSessionsService.registerChatSessionContentProvider('chat-session', {
			provideChatSessionContent: async () => { throw new Error('Unexpected session resolution'); },
			resolveChatResponseUri: (_resource, href) => rewriteAgentHostLinkTarget(href, 'windows-host'),
		}));

		const files = [
			'C:/Repos/3/vscode/simple.txt',
			'C:/my project/simple.txt',
			'//server/share/simple.txt',
		];
		const part = createMarkdownPart(files.map(path => `Created [simple.txt](<${path}>).`).join('\n'));

		assert.deepStrictEqual(
			Array.from(part.domNode.querySelectorAll('a'), link => ({ text: link.textContent, href: link.dataset.href })),
			files.map(path => ({ text: 'simple.txt', href: toAgentHostUri(URI.file(path), 'windows-host').toString() })),
		);
	});

	suite('Agent Host file images', () => {
		const imageBytes = decodeBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a79cAAAAASUVORK5CYII=');
		const directory = URI.file('/remote/my project');
		const resource = toAgentHostUri(URI.file('/remote/my project/image.png'), 'sandbox');
		let fileService: FileService;
		let browserResources: BrowserResourceService;
		let resolveImage: ((href: string) => string) | undefined;

		function useFileService(service: FileService): void {
			browserResources?.dispose();
			browserResources = disposables.add(new BrowserResourceService(undefined, service));
			disposables.add(browserResources.registerScheme(AGENT_HOST_SCHEME));
			instantiationService.stub(IFileService, service);
			renderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
		}

		setup(async () => {
			resolveImage = undefined;
			fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(AGENT_HOST_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
			useFileService(fileService);
			disposables.add(chatSessionsService.registerChatSessionContentProvider('chat-session', {
				provideChatSessionContent: async () => { throw new Error('Unexpected session resolution'); },
				resolveChatResponseUri: (_resource, href, kind) => kind === 'image' && resolveImage ? resolveImage(href) : rewriteAgentHostLinkTarget(href, 'sandbox', undefined, kind === 'image' ? directory : undefined),
			}));
			await fileService.createFolder(toAgentHostUri(directory, 'sandbox'));
			await fileService.writeFile(resource, imageBytes);
		});

		async function waitForImage(part: ChatMarkdownContentPart): Promise<HTMLImageElement> {
			const image = part.domNode.querySelector('img')!;
			if (image.complete && image.naturalWidth > 0) {
				return image;
			}

			const loaded = new DeferredPromise<void>();
			disposables.add(addDisposableListener(image, 'load', () => loaded.complete()));
			disposables.add(addDisposableListener(image, 'error', () => loaded.error(new Error('Image failed to decode'))));
			await loaded.p;
			return image;
		}

		test('renders a tool-result snapshot without reading the inaccessible sandbox file', async () => {
			resolveImage = () => `data:image/png;base64,${encodeBase64(imageBytes)}`;
			const read = spy(fileService, 'readFile');
			disposables.add(toDisposable(() => read.restore()));
			const part = createMarkdownPart('![Screenshot](/tmp/unavailable.png)');
			const image = await waitForImage(part);
			assert.deepStrictEqual({
				bytes: new Uint8Array(await (await fetch(image.src)).arrayBuffer()), alt: image.alt, reads: read.callCount,
			}, { bytes: new Uint8Array(imageBytes.buffer), alt: 'Screenshot', reads: 0 });
		});

		for (const target of ['file:///remote/my%20project/image.png', '/remote/my%20project/image.png', './image.png', toAgentHostUri(URI.file('/remote/my project/image.png'), 'sandbox').toString()]) {
			test(`loads ${target} through the owning file provider`, async () => {
				const read = spy(fileService, 'readFile');
				disposables.add(toDisposable(() => read.restore()));
				const part = createMarkdownPart(`![Robot](<${target}|width=12,height=8> "Test image")`);
				const initialSource = part.domNode.querySelector('img')?.getAttribute('src');
				const image = await waitForImage(part);
				const bytes = new Uint8Array(await (await fetch(image.src)).arrayBuffer());

				assert.deepStrictEqual({
					initialSource,
					resource: read.firstCall.args[0].toString(),
					blob: image.src.startsWith('blob:'),
					alt: image.alt,
					title: image.title,
					width: image.width,
					height: image.height,
					bytes,
				}, {
					initialSource: null,
					resource: resource.toString(),
					blob: true,
					alt: 'Robot',
					title: 'Test image',
					width: 12,
					height: 8,
					bytes: new Uint8Array(imageBytes.buffer),
				});
			});
		}

		test('reads the host-local URI as binary through the Agent Host filesystem provider', async () => {
			const reads: { uri: string; encoding?: ContentEncoding }[] = [];
			const resolves: string[] = [];
			const provider = disposables.add(new AgentHostFileSystemProvider());
			disposables.add(provider.registerAuthority('sandbox', new class extends mock<IRemoteFilesystemConnection>() {
				override async resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
					resolves.push(params.uri);
					return { uri: params.uri, type: ResourceType.File, size: imageBytes.byteLength };
				}
				override async resourceRead(uri: URI, encoding?: ContentEncoding): Promise<ResourceReadResult> {
					reads.push({ uri: uri.toString(), encoding });
					return { data: encodeBase64(imageBytes), encoding: ContentEncoding.Base64 };
				}
			}()));
			const service = disposables.add(new FileService(new NullLogService()));
			disposables.add(service.registerProvider(AGENT_HOST_SCHEME, provider));
			useFileService(service);
			const part = createMarkdownPart('![Robot](./image.png)');
			const image = await waitForImage(part);
			const bytes = new Uint8Array(await (await fetch(image.src)).arrayBuffer());

			assert.deepStrictEqual({ reads, resolves, bytes }, {
				reads: [{ uri: 'file:///remote/my%20project/image.png', encoding: ContentEncoding.Base64 }],
				resolves: ['file:///remote/my%20project/image.png'],
				bytes: new Uint8Array(imageBytes.buffer),
			});
		});

		test('supports JPEG files using the existing raster image formats', async () => {
			const canvas = mainWindow.document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const jpegBytes = decodeBase64(canvas.toDataURL('image/jpeg').split(',')[1]);
			await fileService.writeFile(toAgentHostUri(URI.file('/remote/my project/image.jpg'), 'sandbox'), jpegBytes);
			const part = createMarkdownPart('![Robot](./image.jpg)');
			const image = await waitForImage(part);
			const blob = await (await fetch(image.src)).blob();

			assert.deepStrictEqual({ mime: blob.type, width: image.naturalWidth, height: image.naturalHeight }, { mime: 'image/jpg', width: 1, height: 1 });
		});

		test('reuses image bytes during streaming and revokes blob URLs on disposal', async () => {
			(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
			const read = spy(fileService, 'readFile');
			disposables.add(toDisposable(() => read.restore()));
			const part = createMarkdownPart('![Robot](./image.png)', createRenderContext(false), true);
			const first = await waitForImage(part);
			const source = first.src;
			const drained = Event.toPromise(part.onDidFinishRendering);
			const changed = part.tryIncrementalUpdate({ kind: 'markdownContent', content: new MarkdownString('![Robot](./image.png)\n\nMore text.') });
			part.updateStreamRate(100, true);
			await drained;
			await waitForImage(part);
			assert.deepStrictEqual({ changed, reads: read.callCount, source: part.domNode.querySelector('img')?.src }, { changed: true, reads: 1, source });
			part.dispose();
			await timeout(0);
			await assert.rejects(fetch(source));
		});

		test('does not activate a pending image after disposal', async () => {
			const content = await fileService.readFile(resource);
			const pending = new DeferredPromise<typeof content>();
			const read = stub(fileService, 'readFile').returns(pending.p);
			disposables.add(toDisposable(() => read.restore()));
			const part = createMarkdownPart('![Robot](./image.png)');
			const image = part.domNode.querySelector('img')!;
			part.dispose();
			await pending.complete(content);
			await timeout(0);
			assert.strictEqual(image.getAttribute('src'), null);
		});

		test('rejects SVG before reading or activating its content', async () => {
			const svg = toAgentHostUri(URI.file('/remote/my project/diagram.svg'), 'sandbox');
			await fileService.writeFile(svg, VSBuffer.fromString('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'));
			const read = spy(fileService, 'readFile');
			disposables.add(toDisposable(() => read.restore()));
			const part = createMarkdownPart('![Diagram](./diagram.svg)');
			await timeout(0);
			assert.deepStrictEqual({
				source: part.domNode.querySelector('img')?.getAttribute('src'),
				reads: read.callCount,
			}, { source: undefined, reads: 0 });
		});

		test('verifies ownership using the actual file, not a synthetic root URI', async () => {
			const resolve = spy(chatSessionsService, 'resolveChatResponseUri');
			disposables.add(toDisposable(() => resolve.restore()));
			const part = createMarkdownPart('![Robot](./image.png)');
			await waitForImage(part);
			assert.deepStrictEqual(resolve.getCalls().map(call => call.args.slice(1)), [
				['./image.png', 'image'],
				['file:///remote/my%20project/image.png', 'image'],
			]);
		});

		test('preserves embedded data images without reading a sandbox resource', async () => {
			const read = spy(fileService, 'readFile');
			disposables.add(toDisposable(() => read.restore()));
			const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a79cAAAAASUVORK5CYII=';
			const part = createMarkdownPart(`![Embedded](${source})`);
			const image = await waitForImage(part);
			assert.deepStrictEqual({ source: image.src, alt: image.alt, reads: read.callCount }, { source, alt: 'Embedded', reads: 0 });
		});

		test('does not activate HTTP, network-file, or other-host images', async () => {
			const read = spy(fileService, 'readFile');
			disposables.add(toDisposable(() => read.restore()));
			const targets = [
				'https://github.com/example/repo/image.png?secret=value',
				'http://example.com/image.png',
				'//server/share/image.png',
				'file://server/share/image.png',
				'vscode-remote://ssh-remote+host/remote/image.png',
				'vscode-managed-remote-resource://window:1/remote/image.png?authority=host',
				toAgentHostUri(URI.file('/remote/image.png'), 'another-sandbox').toString(),
				toAgentHostUri(URI.parse('https://example.com/image.png'), 'sandbox').toString(),
				resource.with({ query: '_ah=invalid' }).toString(),
			];
			const part = createMarkdownPart(targets.map(target => `![Blocked](<${target}>)`).join('\n'));
			await timeout(0);
			assert.deepStrictEqual({
				reads: read.callCount,
				sources: Array.from(part.domNode.querySelectorAll('img[src]'), image => image.getAttribute('src')),
			}, { reads: 0, sources: [] });
		});

		test('does not load raw HTML images through the Markdown file-image extension', async () => {
			const read = spy(fileService, 'readFile');
			disposables.add(toDisposable(() => read.restore()));
			const part = createMarkdownPart(`<img src="${resource.toString()}"><img src="https://github.com/example/image.png">`, undefined, false, true);
			await timeout(0);
			assert.deepStrictEqual({
				reads: read.callCount,
				sources: Array.from(part.domNode.querySelectorAll('img[src]'), image => image.getAttribute('src')),
			}, { reads: 0, sources: [] });
		});

		test('preserves alternative text when the browser cannot decode the image', async () => {
			await fileService.writeFile(resource, VSBuffer.fromString('not an image'));
			const part = createMarkdownPart('![Robot](./image.png)');
			const image = part.domNode.querySelector('img')!;
			const failed = new DeferredPromise<void>();
			disposables.add(addDisposableListener(image, 'error', () => failed.complete()));
			await failed.p;
			assert.deepStrictEqual({ alt: image.alt, width: image.naturalWidth }, { alt: 'Robot', width: 0 });
		});

		test('opens file images, but not linked or remote images, in the conversation image carousel', () => {
			(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.ImageCarouselEnabled, true);
			const opened: Parameters<IChatImageCarouselService['openCarouselAtResource']>[] = [];
			instantiationService.stub(IChatImageCarouselService, upcastPartial<IChatImageCarouselService>({ openCarouselAtResource: async (...args) => { opened.push(args); } }));
			const part = createMarkdownPart('![Robot](./image.png) [![Linked](./image.png)](https://example.com) ![Remote](https://github.com/user-attachments/assets/image.png)');
			const images = Array.from(part.domNode.querySelectorAll('img'));

			images[0].click();
			images[0].dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, bubbles: true, cancelable: true }));

			assert.deepStrictEqual({
				images: images.map(image => ({ alt: image.alt, role: image.getAttribute('role'), tabIndex: image.tabIndex, label: image.getAttribute('aria-label') })),
				opened: opened.map(([openedResource, data, options]) => ({ resource: openedResource.toString(), data, sessionResource: options?.sessionResource?.toString(), imageId: options?.imageId })),
			}, {
				images: [
					{ alt: 'Robot', role: 'button', tabIndex: 0, label: 'Open image Robot' },
					{ alt: 'Linked', role: null, tabIndex: -1, label: null },
					{ alt: 'Remote', role: null, tabIndex: -1, label: null },
				],
				opened: [0, 1].map(() => ({ resource: resource.toString(), data: undefined, sessionResource: 'chat-session://test/session1', imageId: getChatMarkdownImageId('test-response-id', resource) })),
			});
		});

		test('drags file images as their resource instead of the browser transport URL', () => {
			const part = createMarkdownPart('![Robot](./image.png)');
			const dataTransfer = new DataTransfer();
			dataTransfer.setData('text/uri-list', 'blob:vscode-file://vscode-app/image');

			part.domNode.querySelector('img')!.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true, cancelable: true }));

			assert.deepStrictEqual({
				types: [...dataTransfer.types].sort(),
				uriList: dataTransfer.getData('text/uri-list'),
			}, {
				types: ['application/vnd.code.uri-list', 'codeeditors', 'resourceurls', 'text/plain', 'text/uri-list'],
				uriList: resource.toString(),
			});
		});
	});

	test('makes response images interactive at the resource that the renderer loads', () => {
		(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.ImageCarouselEnabled, true);
		const opened: Parameters<IChatImageCarouselService['openCarouselAtResource']>[] = [];
		instantiationService.stub(IChatImageCarouselService, upcastPartial<IChatImageCarouselService>({ openCarouselAtResource: async (...args) => { opened.push(args); } }));
		const relative = new MarkdownString('![Relative](images/relative.png)');
		relative.baseUri = URI.file('/workspace/README.md');
		const local = 'file:///workspace/mapped.png';
		const mapped = new MarkdownString(`![Mapped](${local})`);
		mapped.uris = { [local]: URI.parse('vscode-remote://ssh-remote+host/workspace/mapped.png') };

		for (const markdown of [relative, mapped]) {
			createMarkdownPart(markdown).domNode.querySelector('img')!.click();
		}

		assert.deepStrictEqual(
			opened.map(([openedResource, , options]) => ({ resource: openedResource.toString(), imageId: options?.imageId })),
			// Like the renderer, relative resolution adds the current drive on Windows.
			[resolvePath(URI.file('/workspace'), 'images/relative.png'), URI.parse('vscode-remote://ssh-remote+host/workspace/mapped.png')].map(target => ({
				resource: target.toString(),
				imageId: getChatMarkdownImageId('test-response-id', target),
			})),
		);
	});

	test('renders plain markdown without code blocks', () => {
		const part = createMarkdownPart('Hello, world!');

		assert.ok(part.domNode);
		assert.strictEqual(part.codeblocks.length, 0);
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.ok(part.domNode.textContent?.includes('Hello, world!'));
	});

	test('always renders Agent Host session links as rich links', () => {
		const pullRequestRule = {
			id: 'test.linkPresentation',
			uriPattern: /^https:\/\/github\.com\/microsoft\/vscode\/pull\/1$/,
			kind: 'pullRequest' as const,
		};
		const sessionRule = {
			id: 'test.agentSessionLinkPresentation',
			uriPattern: /^agent-host-session:\/\/copilotcli\/session-1(?:\?chat=chat-2)?$/,
			kind: 'session' as const,
		};
		const presentation = observableValue<ILinkPresentation | undefined>('test.linkPresentation', {
			kind: 'pullRequest',
			title: 'Test pull request',
		});
		let ruleChecks = 0;
		let watcherCreations = 0;
		instantiationService.stub(ILinkPresentationService, {
			_serviceBrand: undefined,
			onDidChangeLinkPresentationRules: Event.None,
			linkPresentationRules: [pullRequestRule, sessionRule],
			registerLinkPresentationProvider: () => ({ dispose: () => { } }),
			registerExtensionLinkPresentationProvider: () => ({ dispose: () => { } }),
			getLinkPresentationRule: resource => {
				ruleChecks++;
				return [pullRequestRule, sessionRule].find(rule => rule.uriPattern.test(resource.toString(true)));
			},
			createLinkPresentationWatcher: () => {
				watcherCreations++;
				return { presentation, dispose: () => { } };
			},
		});

		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configurationService.setUserConfiguration(ChatConfiguration.RichLinks, false);
		const disabledPart = createMarkdownPart('[pull request](https://github.com/microsoft/vscode/pull/1)');
		const sessionPart = createMarkdownPart('[session](agent-host-session://copilotcli/session-1) [chat](agent-host-session://copilotcli/session-1?chat=chat-2)');

		configurationService.setUserConfiguration(ChatConfiguration.RichLinks, true);
		const enabledPart = createMarkdownPart('[pull request](https://github.com/microsoft/vscode/pull/1)');

		assert.deepStrictEqual({
			disabledRichLinks: disabledPart.domNode.querySelectorAll('.chat-rich-link').length,
			agentHostRichLinks: sessionPart.domNode.querySelectorAll('.chat-rich-link').length,
			enabledRichLinks: enabledPart.domNode.querySelectorAll('.chat-rich-link').length,
			ruleChecks,
			watcherCreations,
		}, {
			disabledRichLinks: 0,
			agentHostRichLinks: 2,
			enabledRichLinks: 1,
			ruleChecks: 3,
			watcherCreations: 3,
		});
	});

	test('renders a single code block and passes text to CodeBlockPart', () => {
		const part = createMarkdownPart('```javascript\nconsole.log("hello");\n```');

		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].codeBlockIndex, 0);
		assert.strictEqual(part.codeblocks[0].languageId, 'javascript');
		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
		assert.strictEqual(renderedCodeBlocks[0].languageId, 'javascript');
	});

	test('renders complete code block with contributed chat output renderer', () => {
		const part = createMarkdownPart('```mermaid\ngraph TD\n```');

		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].languageId, 'mermaid');
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.deepStrictEqual(renderedCodeBlockOutputs, [{ identifier: 'mermaid', text: 'graph TD' }]);
		assert.ok(part.domNode.querySelector('.chat-output-code-block'));
	});

	test('renders complete code block with contributed chat output renderer case-insensitively', () => {
		const part = createMarkdownPart('```Mermaid\ngraph TD\n```');

		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].languageId, 'Mermaid');
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.deepStrictEqual(renderedCodeBlockOutputs, [{ identifier: 'Mermaid', text: 'graph TD' }]);
		assert.ok(part.domNode.querySelector('.chat-output-code-block'));
	});

	test('reuses rendered code block webview across incremental rerenders when content is unchanged', async () => {
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
		configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'off');

		const ctx = createRenderContext(false);
		const markdown = '```mermaid\ngraph TD\n```';
		const part = createMarkdownPart(markdown, ctx, true);

		assert.strictEqual(renderedCodeBlockOutputs.length, 1);
		assert.strictEqual(part.tryIncrementalUpdate({ kind: 'markdownContent', content: new MarkdownString(`${markdown}\n\nNext paragraph`) }), true);

		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

		assert.deepStrictEqual({
			renderedOutputs: renderedCodeBlockOutputs,
			outputBlockCount: part.domNode.querySelectorAll('.chat-output-code-block').length,
		}, {
			renderedOutputs: [{ identifier: 'mermaid', text: 'graph TD' }],
			outputBlockCount: 1,
		});
	});

	for (const { name, markdown, append, incremental } of [
		{ name: 'top-level', markdown: '```mermaid\ngraph TD\n```', append: '\n\n' },
		{ name: 'blockquote', markdown: '> ```mermaid\n> graph TD\n> ```', append: '\n>\n> ' },
		{ name: 'list', markdown: '- Diagram:\n\n  ```mermaid\n  graph TD\n  ```', append: '\n\n  ' },
	].flatMap(testCase => [false, true].map(incremental => ({ ...testCase, incremental })))) {
		test(`preserves the live document of a ${name} code block iframe while streaming (incremental=${incremental})`, async () => {
			const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
			configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, incremental);
			configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'off');

			const ctx = createRenderContext(false);
			const part = createMarkdownPart(markdown, ctx, true);
			ctx.container.appendChild(part.domNode);
			mainWindow.document.body.appendChild(ctx.container);
			store.add(toDisposable(() => ctx.container.remove()));

			const output = part.domNode.querySelector('.webview-output');
			assert.ok(output);
			const iframe = mainWindow.document.createElement('iframe');
			const loaded = new Promise<void>(resolve => {
				store.add(addDisposableListener(iframe, 'load', () => resolve()));
			});
			iframe.srcdoc = '<!DOCTYPE html><html><body>Rendered diagram</body></html>';
			output.appendChild(iframe);
			await loaded;
			const originalDocument = iframe.contentDocument;
			assert.ok(originalDocument);

			let content = markdown;
			const updates = [];
			for (let i = 0; i < 3; i++) {
				const text = `Following text ${i}`;
				content += `${append}${text}`;
				const updated = part.tryIncrementalUpdate({ kind: 'markdownContent', content: new MarkdownString(content) });
				await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
				updates.push({
					updated,
					documentPreserved: iframe.contentDocument === originalDocument,
					connected: iframe.isConnected,
					textRendered: part.domNode.textContent?.includes(text),
				});
			}

			assert.deepStrictEqual({
				updates,
				renderedOutputs: renderedCodeBlockOutputs,
				iframeCount: part.domNode.querySelectorAll('iframe').length,
			}, {
				updates: Array.from({ length: 3 }, () => ({
					updated: true,
					documentPreserved: true,
					connected: true,
					textRendered: true,
				})),
				renderedOutputs: [{ identifier: 'mermaid', text: 'graph TD' }],
				iframeCount: 1,
			});
		});
	}

	for (const incremental of [false, true]) {
		test(`uses the latest code block width after resizing a streaming Mermaid response (incremental=${incremental})`, async () => {
			const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
			configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, incremental);
			configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'off');
			const currentWidth = observableValue('currentWidth', 500);
			const ctx = { ...createRenderContext(false), currentWidth };
			let markdown = '```mermaid\ngraph TD\n```\n\n```javascript\nconsole.log("hello");\n```';
			const part = createMarkdownPart(markdown, ctx, true);
			const updates = [];

			for (const width of [700, 300]) {
				currentWidth.set(width, undefined);
				part.layout(width);
				markdown += '\n\nFollowing text';
				updates.push(part.tryIncrementalUpdate({ kind: 'markdownContent', content: new MarkdownString(markdown) }));
				await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			}

			assert.deepStrictEqual({
				updates,
				widths: renderedCodeBlockWidths,
				renderedOutputs: renderedCodeBlockOutputs,
				codeBlockCount: part.codeblocks.length,
			}, {
				updates: [true, true],
				widths: [500, 700, 300],
				renderedOutputs: [{ identifier: 'mermaid', text: 'graph TD' }],
				codeBlockCount: 2,
			});
		});

		test(`renders an incomplete diagram once its fence closes (incremental=${incremental})`, async () => {
			const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
			configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, incremental);
			configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'off');
			const part = createMarkdownPart('```mermaid\ngraph', createRenderContext(false), true);
			const outputCounts = [renderedCodeBlockOutputs.length];
			const updates = [];
			for (const content of ['```mermaid\ngraph TD', '```mermaid\ngraph TD\n```', '```mermaid\ngraph TD\n```\n\nFollowing text']) {
				updates.push(part.tryIncrementalUpdate({ kind: 'markdownContent', content: new MarkdownString(content) }));
				await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
				outputCounts.push(renderedCodeBlockOutputs.length);
			}
			assert.deepStrictEqual({ updates, outputCounts, renderedOutputs: renderedCodeBlockOutputs }, {
				updates: [true, true, true],
				outputCounts: [0, 0, 1, 1],
				renderedOutputs: [{ identifier: 'mermaid', text: 'graph TD' }],
			});
		});
	}

	test('does not render initial incomplete code fence', () => {
		const ctx = createRenderContext(false);
		const part = createMarkdownPart('```', ctx);

		assert.strictEqual(part.codeblocks.length, 0);
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.strictEqual(renderedCodeBlockOutputs.length, 0);
		assert.strictEqual(part.domNode.querySelector('.interactive-result-code-block'), null);
	});

	test('shows pending chat output renderer for incomplete code block', () => {
		const ctx = createRenderContext(false);
		const part = createMarkdownPart('```mermaid\ngraph TD', ctx);

		assert.strictEqual(renderedCodeBlockOutputs.length, 0);
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].languageId, 'mermaid');
		assert.ok(part.domNode.querySelector('.chat-output-code-block'));
		assert.ok(part.domNode.textContent?.includes('Rendering code block'));
	});

	test('renders multiple code blocks with correct indices', () => {
		const part = createMarkdownPart(
			'Some text\n```python\nprint("a")\n```\nMore text\n```typescript\nconst x = 1;\n```'
		);

		assert.strictEqual(part.codeblocks.length, 2);
		assert.strictEqual(part.codeblocks[0].codeBlockIndex, 0);
		assert.strictEqual(part.codeblocks[0].languageId, 'python');
		assert.strictEqual(part.codeblocks[1].codeBlockIndex, 1);
		assert.strictEqual(part.codeblocks[1].languageId, 'typescript');
		assert.strictEqual(renderedCodeBlocks[0].text, 'print("a")');
		assert.strictEqual(renderedCodeBlocks[1].text, 'const x = 1;');
	});

	test('code block text is passed correctly', () => {
		const code = 'function greet() {\n  return "hello";\n}';
		createMarkdownPart('```javascript\n' + code + '\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, code);
		assert.strictEqual(renderedCodeBlocks[0].languageId, 'javascript');
	});

	test('code block without language id passes empty languageId', () => {
		createMarkdownPart('```\nsome text\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'some text');
	});

	test('respects codeBlockStartIndex for global indexing', () => {
		const ctx = createRenderContext();
		const part = store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString('```js\ncode\n```') },
			ctx,
			editorPool,
			false,
			5, // codeBlockStartIndex
			renderer,
			undefined,
			() => ctx.currentWidth.get(),
			{},
		));

		assert.strictEqual(part.codeblocks.length, 1);
		assert.strictEqual(part.codeblocks[0].codeBlockIndex, 5);
	});

	test('hasSameContent returns true for same markdown', () => {
		const part = createMarkdownPart('Hello');
		assert.ok(part.hasSameContent({ kind: 'markdownContent', content: new MarkdownString('Hello') }));
	});

	test('hasSameContent returns false for different markdown', () => {
		const part = createMarkdownPart('Hello');
		assert.ok(!part.hasSameContent({ kind: 'markdownContent', content: new MarkdownString('Goodbye') }));
	});

	test('hasSameContent compares inline reference metadata', () => {
		const uri = URI.parse('file:///workspace/foo.ts');
		const content = 'Foo';
		const initialReference: IChatContentInlineReference = {
			kind: 'inlineReference',
			resolveId: 'resolve1',
			inlineReference: { uri, range: new Range(1, 1, 1, 1) },
			name: 'Foo',
		};
		const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference });

		assert.deepStrictEqual({
			equivalentReference: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: { uri, range: new Range(1, 1, 1, 1) },
						name: 'Foo',
					},
				},
			}),
			resolvedReference: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							kind: SymbolKind.Class,
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
		}, {
			equivalentReference: true,
			resolvedReference: false,
		});
	});

	test('hasSameContent compares workspace symbol metadata', () => {
		const uri = URI.parse('file:///workspace/foo.ts');
		const content = 'Foo';
		const initialReference: IChatContentInlineReference = {
			kind: 'inlineReference',
			resolveId: 'resolve1',
			inlineReference: {
				name: 'Foo',
				containerName: 'Bar',
				kind: SymbolKind.Class,
				tags: [SymbolTag.Deprecated],
				location: { uri, range: new Range(2, 7, 2, 10) },
			},
			name: 'Foo',
		};
		const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference });

		assert.deepStrictEqual({
			equivalentSymbol: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							containerName: 'Bar',
							kind: SymbolKind.Class,
							tags: [SymbolTag.Deprecated],
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
			differentContainer: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							containerName: 'Baz',
							kind: SymbolKind.Class,
							tags: [SymbolTag.Deprecated],
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
			differentTags: part.hasSameContent({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							containerName: 'Bar',
							kind: SymbolKind.Class,
							tags: [],
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
		}, {
			equivalentSymbol: true,
			differentContainer: false,
			differentTags: false,
		});
	});

	test('tryIncrementalUpdate requires unchanged inline reference metadata', () => {
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);

		const uri = URI.parse('file:///workspace/foo.ts');
		const content = 'Foo';
		const initialReference: IChatContentInlineReference = {
			kind: 'inlineReference',
			resolveId: 'resolve1',
			inlineReference: { uri, range: new Range(1, 1, 1, 1) },
			name: 'Foo',
		};
		const context = createRenderContext(false);
		const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference }, context, true);

		assert.deepStrictEqual({
			unchangedReference: part.tryIncrementalUpdate({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: { 0: initialReference },
			}),
			resolvedReference: part.tryIncrementalUpdate({
				kind: 'markdownContent',
				content: new MarkdownString(content),
				inlineReferences: {
					0: {
						kind: 'inlineReference',
						resolveId: 'resolve1',
						inlineReference: {
							name: 'Foo',
							kind: SymbolKind.Class,
							location: { uri, range: new Range(2, 7, 2, 10) },
						},
						name: 'Foo',
					},
				},
			}),
		}, {
			unchangedReference: true,
			resolvedReference: false,
		});
	});

	test('php code blocks get php opening tag prepended', () => {
		createMarkdownPart('```php\necho "hello";\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.ok(renderedCodeBlocks[0].text.startsWith('<?php\n'), 'PHP code should have <?php prepended');
	});

	test('php code blocks with existing opening tag are not modified', () => {
		createMarkdownPart('```php\n<?php\necho "hello";\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.ok(!renderedCodeBlocks[0].text.startsWith('<?php\n<?php'), 'PHP code with existing tag should not be doubled');
	});

	test('strips codeblock uri annotations before rendering standard code blocks', () => {
		createMarkdownPart('```typescript\nconst value = 1;\n<vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri>\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.ok(!renderedCodeBlocks[0].text.includes('<vscode_codeblock_uri'));
		assert.strictEqual(renderedCodeBlocks[0].codemapperUri?.toString(), 'file:///test.ts');
	});

	test('code block toolbar context is set correctly with code text', () => {
		// Simulates the scenario in #255290: the copy button should have
		// valid code text during streaming even as code blocks are re-rendered.
		createMarkdownPart('```js\nconsole.log("hello");\n```');

		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
		assert.strictEqual(renderedCodeBlocks[0].languageId, 'js');
		assert.strictEqual(renderedCodeBlocks[0].codeBlockIndex, 0);
	});

	test('code block maintains content when markdown is re-rendered during streaming', () => {
		// Simulates progressive rendering: first tick shows partial code, second tick adds more.
		// Each render creates a new ChatMarkdownContentPart (as happens during streaming).
		// The code block should get the updated text each time.
		const ctx = createRenderContext(false /* isComplete = false, simulating streaming */);

		// First render with partial code
		const part1 = createMarkdownPart('```js\nconsole\n```', ctx);
		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console');
		assert.strictEqual(part1.codeblocks.length, 1);

		// Second render with more code (simulating streaming progress)
		renderedCodeBlocks.length = 0;
		const part2 = createMarkdownPart('```js\nconsole.log("hello");\n```', ctx);
		assert.strictEqual(renderedCodeBlocks.length, 1);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
		assert.strictEqual(part2.codeblocks.length, 1);
		assert.strictEqual(part2.codeblocks[0].codeBlockIndex, 0);
	});

	test('code block part element is reused from pool across streaming renders', () => {
		// Verify the same CodeBlockPart element is returned from the pool for the same key
		const elements: HTMLElement[] = [];
		const poolWithTracking = {
			get(): IDisposableReference<CodeBlockPart> {
				const element = mainWindow.document.createElement('div');
				elements.push(element);
				const mockPart = {
					element,
					get uri() { return undefined; },
					render(data: ICodeBlockData, _width: number) {
						renderedCodeBlocks.push(data);
					},
					layout() { },
					focus() { },
					reset() { },
					onDidRemount() { },
				} as unknown as CodeBlockPart;
				return {
					object: mockPart,
					isStale: () => false,
					dispose: () => { },
				};
			},
			inUse: () => [],
			dispose: () => { },
		} as unknown as EditorPool;

		const ctx = createRenderContext(false);
		store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString('```js\nconsole\n```') },
			ctx, poolWithTracking, false, 0, renderer, undefined, () => ctx.currentWidth.get(), {},
		));

		store.add(instantiationService.createInstance(
			ChatMarkdownContentPart,
			{ kind: 'markdownContent', content: new MarkdownString('```js\nconsole.log("hello");\n```') },
			ctx, poolWithTracking, false, 0, renderer, undefined, () => ctx.currentWidth.get(), {},
		));

		// Both renders should have created code blocks with the correct text
		assert.strictEqual(renderedCodeBlocks.length, 2);
		assert.strictEqual(renderedCodeBlocks[0].text, 'console');
		assert.strictEqual(renderedCodeBlocks[1].text, 'console.log("hello");');
	});
});
