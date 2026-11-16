/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, stub } from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { IAction, Separator } from '../../../../../../../base/common/actions.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../../../base/common/buffer.js';
import { addDisposableListener, scheduleAtNextAnimationFrame } from '../../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { OffsetRange } from '../../../../../../../editor/common/core/ranges/offsetRange.js';
import { resolvePath } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { IMenuService, MenuId } from '../../../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../../../platform/contextview/browser/contextView.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { SymbolKind, SymbolTag } from '../../../../../../../editor/common/languages.js';
import { ILinkPresentation, ILinkPresentationService } from '../../../../../../../platform/dataChannel/common/dataChannel.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMarkdownRenderer, MarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { BrowserResourceService } from '../../../../../../../platform/files/browser/browserResourceService.js';
import { IOpenerService, OpenOptions } from '../../../../../../../platform/opener/common/opener.js';
import { IFileDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IEditorOptions } from '../../../../../../../platform/editor/common/editor.js';
import { AccessibleViewType } from '../../../../../../../platform/accessibility/browser/accessibleView.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentHostFileSystemProvider, IRemoteFilesystemConnection } from '../../../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { ContentEncoding, ResourceReadResult, ResourceResolveParams, ResourceResolveResult, ResourceType } from '../../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { createInMemoryFileService } from '../../../../../../../platform/files/test/common/inMemoryFileService.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { getSizeRegistry } from '../../../../../../../platform/theme/common/sizeRegistry.js';
import { ISizeService } from '../../../../../../../platform/theme/common/sizeService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatMarkdownContentPart, IChatMarkdownContentPartOptions } from '../../../../browser/widget/chatContentParts/chatMarkdownContentPart.js';
import { ChatMarkdownDecorationsRenderer } from '../../../../browser/widget/chatContentParts/chatMarkdownDecorationsRenderer.js';
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatPetService } from '../../../../browser/chatPetService.js';
import { IChatImageCarouselService } from '../../../../browser/chatImageCarouselService.js';
import { ChatContentMarkdownRenderer } from '../../../../browser/widget/chatContentMarkdownRenderer.js';
import { EditorPool, DiffEditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { CodeBlockPart, ICodeBlockData } from '../../../../browser/widget/chatContentParts/codeBlockPart.js';
import { IChatOutputRendererService, type RenderedOutputPart } from '../../../../browser/chatOutputItemRenderer.js';
import { IChatOutputPartStateCache, IOutputPartState } from '../../../../browser/widget/chatContentParts/chatOutputPartStateCache.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { IChatContentInlineReference } from '../../../../common/chatService/chatService.js';
import { getChatMarkdownImageId } from '../../../../common/chatImageExtraction.js';
import { IChatSessionsService } from '../../../../common/chatSessionsService.js';
import { ChatRequestSlashPromptPart } from '../../../../common/requestParser/chatParserTypes.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { IChatLayoutService } from '../../../../common/widget/chatLayoutService.js';
import { ChatLayoutService } from '../../../../browser/widget/chatLayoutService.js';
import { MarkedKatexSupport } from '../../../../../markdown/browser/markedKatexSupport.js';
import { messageAttachmentsToVariableData, rewriteAgentHostLinkTarget } from '../../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { agentHostConnectionKinds } from '../../../../../../../platform/agentHost/test/common/testAgentHostResourceUriMappers.js';
import { ChatRequestParser } from '../../../../common/requestParser/chatRequestParser.js';
import { IChatAgentService } from '../../../../common/participants/chatAgents.js';
import { IChatSlashCommandService } from '../../../../common/participants/chatSlashCommands.js';
import { IChatVariablesService } from '../../../../common/attachments/chatVariables.js';
import { IPromptsService } from '../../../../common/promptSyntax/service/promptsService.js';
import { ToolAndToolSetEnablementMap } from '../../../../common/tools/languageModelToolsService.js';
import { getInlineRequestAttachments } from '../../../../common/attachments/chatInlineAttachments.js';
import { IAiEditTelemetryService } from '../../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IViewDescriptorService } from '../../../../../../common/views.js';
import { IDisposableReference } from '../../../../browser/widget/chatContentParts/chatCollections.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';
import { ChatHtmlPreviewPart, isHtmlPreviewCodeBlock } from '../../../../browser/widget/chatContentParts/chatHtmlPreviewPart.js';
import { chatNativeComponentsRenderer } from '../../../../browser/widget/chatContentParts/chatNativeComponentsPart.js';
import { createHtmlPreviewDocument } from '../../../../browser/widget/chatContentParts/chatHtmlPreviewDocument.js';
import { ChatHtmlPreviewAccessibleView, ChatHtmlPreviewEditorInput } from '../../../../browser/widget/chatContentParts/chatHtmlPreviewEditorInput.js';
import { IOverlayWebview, IWebviewElement, IWebviewService, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED, WebviewInitInfo } from '../../../../../webview/browser/webview.js';
import { CONTEXT_ACTIVE_WEBVIEW_PANEL_ID } from '../../../../../webviewPanel/browser/webviewEditor.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatWidgetService } from '../../../../browser/chat.js';
import { IEditorPane } from '../../../../../../common/editor.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../../services/layout/browser/layoutService.js';
import { OverlayWebview } from '../../../../../webview/browser/overlayWebview.js';
import { EditorInput } from '../../../../../../common/editor/editorInput.js';
import { isWeb } from '../../../../../../../base/common/platform.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { BrowserViewEditorId } from '../../../../../browserView/common/browserView.js';

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
				element.tabIndex = 0;
				const mockPart = {
					element,
					get uri() { return undefined; },
					render(data: ICodeBlockData, width: number) {
						renderedCodeBlocks.push(data);
						renderedCodeBlockWidths.push(width);
					},
					layout() { },
					focus() { element.focus(); },
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

	function createMarkdownPart(markdown: string | MarkdownString, context?: IChatContentPartRenderContext, fillInIncompleteTokens = false, supportHtml = false, rendererOptions: IChatMarkdownContentPartOptions = {}): ChatMarkdownContentPart {
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
			rendererOptions,
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
		instantiationService.stub(IHoverService, { ...NullHoverService });

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

	test('preserves Unicode prompt names and Markdown delimiters in request decorations', () => {
		const decorationsRenderer = disposables.add(instantiationService.createInstance(ChatMarkdownDecorationsRenderer));
		const names = [
			// allow-any-unicode-next-line
			'龩胤𬭳獫㰜〒６0D狛龫龨截茎疄盷㓝㏄ΩFe佨勵)エ㈱㑺惊龬㈨γ8傐𬨎',
			'prompt)',
			'prompt(',
			'prompt[link]',
			'prompt[',
			'prompt\\]',
			'prompt*bold*',
			'prompt_code_',
			'prompt`code`',
			'prompt<tag>',
			'prompt&copy;',
		];
		const actual = names.map(name => {
			const text = `/${name}`;
			const part = new ChatRequestSlashPromptPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), name);
			const markdown = decorationsRenderer.convertParsedRequestToMarkdown(URI.parse('chat-session://test/session1'), { text, parts: [part] });
			const rendered = disposables.add(renderer.render(markdown));
			const anchor = rendered.element.querySelector('a');
			const href = anchor?.getAttribute('data-href');
			disposables.add(decorationsRenderer.walkTreeAndAnnotateReferenceLinks({ kind: 'markdownContent', content: markdown }, rendered.element));
			return {
				text: rendered.element.textContent,
				decorationCount: rendered.element.querySelectorAll('.chat-resource-widget').length,
				href: href && decodeURIComponent(href),
			};
		});
		assert.deepStrictEqual(actual, names.map(name => ({ text: `/${name}`, decorationCount: 1, href: `http://_vscodedecoration_?${JSON.stringify({ title: name })}` })));
	});

	for (const kind of agentHostConnectionKinds) {
		test(`opens sent skill references through resource widgets by click and keyboard (${kind.name})`, async () => {
			const text = '/review and /review /compact';
			const hostResources = [URI.file('/workspace/review (one)/SKILL.md'), URI.parse('custom-skill:/review?view=with%20spaces&bare&vscodeLinkType=opaque#details')];
			const attachments: MessageAttachment[] = hostResources.map((uri, index) => ({
				type: MessageAttachmentKind.Resource, uri: uri.toString(), label: '/review', displayKind: 'skill',
				range: { start: { line: 0, character: index * 12 }, end: { line: 0, character: index * 12 + 7 } },
				...(index === 0 ? { _meta: { uri: 'file:///wrong/SKILL.md' } } : {}),
			}));
			attachments.push({
				type: MessageAttachmentKind.Simple, label: '/compact', displayKind: 'command', _meta: { command: 'compact' },
				range: { start: { line: 0, character: 20 }, end: { line: 0, character: 28 } },
			});
			const variables = messageAttachmentsToVariableData(attachments, 'test', text, kind.resourceUris)!.variables;
			const parser = new ChatRequestParser(
				upcastPartial<IChatAgentService>({ getDefaultAgent: () => undefined }),
				upcastPartial<IChatVariablesService>({}),
				upcastPartial<IChatSlashCommandService>({ getCommands: () => [] }),
				upcastPartial<IPromptsService>({ hasPromptSlashCommand: () => false, isValidSlashCommandName: () => false }),
			);
			const parsed = parser.parseChatRequestWithReferences(variables.map(variable => ({
				id: variable.id, data: variable.value, _meta: variable._meta,
				range: new Range(1, variable.range!.start + 1, 1, variable.range!.endExclusive + 1),
			})), ToolAndToolSetEnablementMap.fromEntries([]), text);
			const inlineAttachments = getInlineRequestAttachments(parsed.parts, variables, text);
			const decorations = disposables.add(instantiationService.createInstance(ChatMarkdownDecorationsRenderer));
			const markdown = decorations.convertParsedRequestToMarkdown(URI.parse('chat-session://test/session1'), parsed, new Set(inlineAttachments.keys()));
			const opens: string[] = [];
			instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
				override async open(resource: URI | string): Promise<boolean> {
					opens.push(resource.toString());
					return true;
				}
			}());
			renderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
			const rendered = disposables.add(renderer.render(markdown));
			disposables.add(decorations.walkTreeAndAnnotateReferenceLinks({ kind: 'markdownContent', content: markdown }, rendered.element));
			const anchors = rendered.element.querySelectorAll<HTMLAnchorElement>('.chat-inline-anchor-widget');
			assert.strictEqual(anchors.length, 2);
			anchors[0].click();
			anchors[1].dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, bubbles: true, cancelable: true }));
			anchors[0].dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 32, bubbles: true, cancelable: true }));
			await timeout(0);
			const resources = [kind.toClient(hostResources[0]), kind.resourceUris.fromAgentHost(hostResources[1])].map(uri => uri.toString());
			assert.deepStrictEqual({
				opens,
				labels: Array.from(anchors, anchor => anchor.textContent),
				commandDecorations: rendered.element.querySelectorAll('.chat-resource-widget').length,
				inlineAttachments: inlineAttachments.size,
			}, { opens: [resources[0], resources[1], resources[0]], labels: ['/review', '/review'], commandDecorations: 1, inlineAttachments: 0 });
		});
	}

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

	test('preserves browser-normalized links without parsing them as file resources', () => {
		const part = createMarkdownPart('[Web](https:////example.com) [Source](file:///workspace/file.ts)');
		assert.deepStrictEqual(
			Array.from(part.domNode.querySelectorAll('a'), anchor => ({ text: anchor.textContent, href: anchor.getAttribute('data-href') })),
			[{ text: 'Web', href: 'https:////example.com' }, { text: 'Source', href: 'file:///workspace/file.ts' }],
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
			fileService = createInMemoryFileService(disposables, AGENT_HOST_SCHEME);
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
					{ alt: 'Linked', role: null, tabIndex: 0, label: null },
					{ alt: 'Remote', role: null, tabIndex: 0, label: null },
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

	test('uses the image menu rather than editor and Explorer navigation for file images', async () => {
		const requestedMenus: MenuId[] = [];
		const actionLabels: string[][] = [];
		instantiationService.stub(IMenuService, upcastPartial<IMenuService>({
			getMenuActions: menuId => {
				requestedMenus.push(menuId);
				return [];
			}
		}));
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({
			showContextMenu: delegate => { actionLabels.push(delegate.getActions?.().map(action => action.label) ?? []); }
		}));
		const part = createMarkdownPart('![File](file:///workspace/image.png)');
		part.domNode.querySelector('img')!.dispatchEvent(new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		await Promise.resolve();
		assert.deepStrictEqual({ requestedMenus, actionLabels }, {
			requestedMenus: [MenuId.ChatImageContext],
			actionLabels: [['Copy Image', 'Copy Image Path']],
		});
	});

	test('renders plain markdown without code blocks', () => {
		const part = createMarkdownPart('Hello, world!');

		assert.ok(part.domNode);
		assert.strictEqual(part.codeblocks.length, 0);
		assert.strictEqual(renderedCodeBlocks.length, 0);
		assert.ok(part.domNode.textContent?.includes('Hello, world!'));
	});

	suite('Math', () => {
		setup(async () => {
			(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.EnableMath, true);
			await MarkedKatexSupport.loadExtension(mainWindow);
			// Confirmation widgets render with the general Markdown renderer, which keeps raw spans in trusted Markdown.
			renderer = instantiationService.createInstance(MarkdownRendererService);
		});

		teardown(() => {
			// Loading KaTeX adds its stylesheet, whose rules cannot be read in unit tests.
			for (const element of [...mainWindow.document.head.children]) {
				if (element.classList.contains('katex')) {
					element.remove();
				}
			}
		});

		test('applies math rules only when all HTML comes from the renderer', () => {
			const span = '<span class="monaco-button" style="position: relative; top: -40px">fake</span>';
			const render = (markdown: MarkdownString) => {
				const domNode = createMarkdownPart(markdown).domNode;
				return {
					math: !!domNode.querySelector('.katex-html [style]'),
					span: [...domNode.querySelectorAll('span')].find(e => e.textContent === 'fake')?.outerHTML,
					video: !!domNode.querySelector('video'),
				};
			};
			const results = {
				untrusted: render(new MarkdownString(`${span} $x^2$`)),
				trustedWithSpan: render(new MarkdownString(`${span} $x^2$`, { isTrusted: true })),
				trustedWithoutSpan: render(new MarkdownString('text $x^2$', { isTrusted: true })),
				supportHtml: render(new MarkdownString(`${span} <video autoplay muted src="data:video/mp4;base64,AA=="></video> $x^2$`, { supportHtml: true })),
			};
			(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.EnableMath, false);
			assert.deepStrictEqual({ ...results, mathDisabled: render(new MarkdownString('text $x^2$')) }, {
				untrusted: { math: true, span: undefined, video: false },
				trustedWithSpan: { math: false, span: '<span>fake</span>', video: false },
				trustedWithoutSpan: { math: true, span: undefined, video: false },
				supportHtml: { math: false, span: '<span>fake</span>', video: false },
				mathDisabled: { math: false, span: undefined, video: false },
			});
		});

		test('theme icons do not change the math source attribute', () => {
			const domNode = createMarkdownPart(new MarkdownString('$$\n\\verb|$(check)|\n$$', { supportThemeIcons: true })).domNode;
			assert.deepStrictEqual({
				latex: domNode.querySelector('.vscode-katex-container')?.getAttribute('data-latex'),
				math: !!domNode.querySelector('.katex-html [style]'),
			}, { latex: '\\verb|$(check)|', math: true });
		});
	});

	test('re-measures every table scrollbar in one animation frame when the part is resized', async () => {
		let resize: (() => void) | undefined;
		class TestResizeObserver implements ResizeObserver {
			constructor(callback: ResizeObserverCallback) {
				resize = () => callback([], this);
			}
			observe(): void { }
			unobserve(): void { }
			disconnect(): void { }
		}
		/** Resolves after the table scrollbars measured at the next animation frame have been updated. */
		const afterNextAnimationFrame = () => new Promise<void>(resolve => scheduleAtNextAnimationFrame(mainWindow, resolve, -20000 /* after dom.modify */));

		const tableCount = 4;
		const markdown = Array.from({ length: tableCount }, (_, i) => `| Column ${i} | Value |\n| --- | --- |\n| ${'x'.repeat(i * 40)} | ${i} |`).join('\n\n');
		const ctx = createRenderContext();
		const part = createMarkdownPart(markdown, ctx, false, false, { resizeObserverCtor: TestResizeObserver });
		ctx.container.style.width = '200px';
		ctx.container.appendChild(part.domNode);
		mainWindow.document.body.appendChild(ctx.container);
		disposables.add(toDisposable(() => ctx.container.remove()));
		await afterNextAnimationFrame();

		// A layout read that follows a scrollbar update forces a synchronous layout of the whole transcript.
		const log: ('read' | 'write')[] = [];
		const tableContainers = Array.from(part.domNode.querySelectorAll('table'), table => table.parentElement!);
		for (const tableContainer of tableContainers) {
			for (const name of ['clientWidth', 'scrollWidth', 'clientHeight', 'scrollHeight', 'scrollLeft', 'scrollTop'] as const) {
				const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, name)!;
				Object.defineProperty(tableContainer, name, {
					configurable: true,
					get: () => {
						log.push('read');
						return descriptor.get!.call(tableContainer);
					},
					set: descriptor.set && (value => descriptor.set!.call(tableContainer, value)),
				});
			}
		}
		const setScrollDimensions = stub(DomScrollableElement.prototype, 'setScrollDimensions').callsFake(function (this: DomScrollableElement, dimensions) {
			log.push('write');
			setScrollDimensions.wrappedMethod.call(this, dimensions);
		});
		disposables.add(toDisposable(() => setScrollDimensions.restore()));

		ctx.container.style.width = '300px';
		resize!();
		const layoutReadsInResizeCallback = log.filter(entry => entry === 'read').length;
		await afterNextAnimationFrame();

		assert.deepStrictEqual({
			tables: tableContainers.length,
			layoutReadsInResizeCallback,
			scrollbarUpdatesAfterOneFrame: setScrollDimensions.callCount,
			layoutReadsAfterFirstScrollbarUpdate: log.slice(log.indexOf('write')).filter(entry => entry === 'read').length,
		}, {
			tables: tableCount,
			layoutReadsInResizeCallback: 0,
			scrollbarUpdatesAfterOneFrame: tableCount,
			layoutReadsAfterFirstScrollbarUpdate: 0,
		});
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

	suite('HTML previews', () => {
		// WebKit never runs animation frame callbacks in a sandboxed document without allow-scripts, so wait on
		// the host window's frame, which also renders these same-origin preview iframes.
		function nextHostFrame(): Promise<void> {
			return new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		}

		class TestPreviewWebview extends mock<IWebviewElement & IOverlayWebview>() {
			html = '';
			disposed = false;
			remounts = 0;
			override isFocused = false;
			readonly fatalError = disposables.add(new Emitter<{ message: string }>());
			override readonly onFatalError = this.fatalError.event;
			override readonly onDidWheel = Event.None;
			override readonly onDidDispose = Event.None;
			override readonly onDidFocus = Event.None;
			override readonly onDidBlur = Event.None;
			override readonly onDidClickLink = Event.None;
			override readonly onMessage = Event.None;
			override readonly onMissingCsp = Event.None;
			override readonly onDidUpdateState = Event.None;
			readonly scroll = disposables.add(new Emitter<{ scrollYPercentage: number }>());
			override readonly onDidScroll = this.scroll.event;
			override initialScrollProgress = 0;
			override state: string | undefined;
			override readonly intrinsicContentSize = observableValue<{ width: number; height: number } | undefined>('preview size', undefined);
			override setHtml(html: string): void { this.html = html; }
			override setContextKeyService(): void { }
			override mountTo(): void { }
			override reinitializeAfterDismount(): void { this.remounts++; }
			override dispose(): void { this.disposed = true; }
			override focus(): void { }
		}

		let webviews: { init: WebviewInitInfo; webview: TestPreviewWebview }[];
		let contextMenu: Parameters<IContextMenuService['showContextMenu']>[0] | undefined;
		const html = '<style>h2 { color: red }</style><h2>Quarterly report</h2><details><summary>More</summary>Details</details>';
		const fenced = (text = html, fence = '```') => `${fence}html-preview\n${text}\n${fence}`;
		const options = { renderHtmlPreviews: true };

		function action(part: ChatMarkdownContentPart, label: string): IAction {
			part.domNode.querySelector('.chat-html-preview')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			const action = contextMenu?.getActions?.().find(action => action.label === label);
			assert.ok(action, `Missing preview action: ${label}`);
			return action;
		}

		setup(() => {
			webviews = [];
			contextMenu = undefined;
			instantiationService.stub(IContextMenuService, {
				showContextMenu: delegate => { contextMenu = delegate; },
				onDidHideContextMenu: Event.None,
			});
			instantiationService.stub(IChatLayoutService, disposables.add(instantiationService.createInstance(ChatLayoutService)));
			instantiationService.stub(ISizeService, {
				onDidChangeSizes: Event.None,
				getSize: (id, theme) => getSizeRegistry().resolveDefaultSize(id, theme),
			});
			instantiationService.stub(IWebviewService, new class extends mock<IWebviewService>() {
				override createWebviewElement(init: WebviewInitInfo): IWebviewElement {
					const webview = new TestPreviewWebview();
					webviews.push({ init, webview });
					return webview;
				}
				override createWebviewOverlay(init: WebviewInitInfo): IOverlayWebview {
					const webview = new TestPreviewWebview();
					webviews.push({ init, webview });
					return webview;
				}
			}());
			instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() { }());
		});

		test('renders an explicit response preview in a restricted webview and retains its source', () => {
			const part = createMarkdownPart(fenced(), undefined, false, false, options);
			const document = new DOMParser().parseFromString(webviews[0].webview.html, 'text/html');
			assert.deepStrictEqual({
				previews: webviews.length,
				contentOptions: webviews[0].init.contentOptions,
				serviceWorkerDisabled: webviews[0].init.options.disableServiceWorker,
				title: webviews[0].init.title,
				heading: document.querySelector('h2')?.textContent,
				style: document.querySelector('body style')?.textContent,
				source: renderedCodeBlocks.map(block => ({ language: block.languageId, text: block.text })),
				sourceHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-source')?.hidden,
				noticeHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-notice')?.hidden,
				chrome: part.domNode.querySelectorAll('.chat-html-preview-header, .chat-html-preview-actions').length,
				outputRenderers: renderedCodeBlockOutputs.length,
			}, {
				previews: 1,
				contentOptions: { allowScripts: false, allowForms: false, enableCommandUris: false, localResourceRoots: [] },
				serviceWorkerDisabled: true,
				title: 'HTML preview for code block 1',
				heading: 'Quarterly report',
				style: 'h2 { color: red }',
				source: [{ language: 'html', text: html }],
				sourceHidden: true,
				noticeHidden: true,
				chrome: 0,
				outputRenderers: 0,
			});
		});

		test('keeps inline chrome transparent and uses short content height without a card minimum', () => {
			const part = createMarkdownPart(fenced('<p>Short report</p>'), undefined, false, false, options);
			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));
			webviews[0].webview.intrinsicContentSize.set({ width: 500, height: 24 }, undefined);
			const preview = part.domNode.querySelector<HTMLElement>('.chat-html-preview')!;
			const style = mainWindow.getComputedStyle(preview);
			assert.deepStrictEqual({
				background: style.backgroundColor,
				border: style.borderTopWidth,
				height: part.domNode.querySelector('.chat-html-preview-content')!.getBoundingClientRect().height,
				label: preview.getAttribute('aria-label'),
				webviewActions: webviews[0].init.options.getContextMenuActions!().filter(action => !(action instanceof Separator)).map(action => action.label),
			}, { background: 'rgba(0, 0, 0, 0)', border: '0px', height: 24, label: 'HTML preview for code block 1', webviewActions: ['Open Preview', 'Show Source', 'Save HTML...'] });
		});

		test('uses chat typography and refreshes it when chat font settings change', async () => {
			const part = createMarkdownPart(fenced(), undefined, false, false, options);
			const theme = { 'vscode-font-family': 'system-ui', 'vscode-font-size': '13px', 'vscode-foreground': '#123456' };
			const before = webviews[0].init.options.transformCssVariables!(theme);
			const configuration = instantiationService.get(IConfigurationService) as TestConfigurationService;
			await configuration.setUserConfiguration('chat.fontFamily', 'serif');
			await configuration.setUserConfiguration('chat.fontSize', 18);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === 'chat.fontFamily' || key === 'chat.fontSize',
				affectedKeys: new Set(['chat.fontFamily', 'chat.fontSize']),
				source: 1,
				change: { keys: ['chat.fontFamily', 'chat.fontSize'], overrides: [] },
			});
			assert.deepStrictEqual({
				before,
				after: webviews.at(-1)!.init.options.transformCssVariables!(theme),
				oldDisposed: webviews[0].webview.disposed,
				sourceHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-source')!.hidden,
			}, {
				before: theme,
				after: { ...theme, 'vscode-font-family': 'serif', 'vscode-font-size': '18px' },
				oldDisposed: true,
				sourceHidden: true,
			});
		});

		test('does not reinterpret normal code, requests, incomplete fences, filtered responses, or annotated files', () => {
			const request = {
				...createRenderContext(),
				element: upcastPartial<IChatRequestViewModel>({
					id: 'request',
					sessionResource: URI.parse('chat-session://test/session1'),
					message: { text: fenced(), parts: [] },
					contentReferences: [],
				}),
			};
			const filtered = createRenderContext();
			Object.assign(filtered.element, { errorDetails: { responseIsFiltered: true, message: 'Filtered' } });
			const cases = [
				{ markdown: fenced().replace('html-preview', 'html'), context: createRenderContext(), options },
				{ markdown: fenced(), context: createRenderContext(), options: {} },
				{ markdown: fenced(), context: request, options },
				{ markdown: '```html-preview\n<h2>Still streaming</h2>', context: createRenderContext(false), options },
				{ markdown: '```html-preview\n<h2>Stopped without closing fence</h2>', context: createRenderContext(), options },
				{ markdown: fenced(html, '````').slice(0, -1), context: createRenderContext(), options },
				{ markdown: fenced(), context: filtered, options },
				{ markdown: fenced(`${html}\n<vscode_codeblock_uri>file:///report.html</vscode_codeblock_uri>`), context: createRenderContext(), options },
			];
			const results = cases.map(testCase => {
				const part = createMarkdownPart(testCase.markdown, testCase.context, true, false, testCase.options);
				return { preview: !!part.domNode.querySelector('.chat-html-preview'), codeblocks: part.codeblocks.length };
			});
			assert.deepStrictEqual({ results, webviews: webviews.length }, {
				results: cases.map(() => ({ preview: false, codeblocks: 1 })),
				webviews: 0,
			});
		});

		test('accepts closed backtick and tilde fences, not short or mismatched closing fences', () => {
			assert.deepStrictEqual([
				['html-preview', fenced()],
				['HTML-PREVIEW', fenced(html, '~~~~')],
				['html-preview', fenced(html, '````')],
				['html-preview', fenced(html, '````').slice(0, -1)],
				['html-preview', '```html-preview\n<p>Hi</p>\n~~~'],
				['html-preview', undefined],
				['html', fenced()],
			].map(([language, raw]) => isHtmlPreviewCodeBlock(language!, raw)), [true, true, true, false, false, false, false]);
			createMarkdownPart(fenced(html, '~~~'), createRenderContext(false), true, false, options);
			assert.strictEqual(webviews.length, 1);
		});

		test('leaves invalidly indented closing fences as source, including stopped responses', () => {
			const results = [false, true].flatMap(complete => [0, 3, 4].map(indentation => {
				const count = webviews.length;
				const markdown = '```html-preview\n<h2>Report</h2>\n' + ' '.repeat(indentation) + '```';
				const context = createRenderContext(complete);
				if (complete) {
					Object.assign(context.element, { isCanceled: true });
				}
				const part = createMarkdownPart(markdown, context, true, false, options);
				return { preview: !!part.domNode.querySelector('.chat-html-preview'), created: webviews.length > count };
			}));
			assert.deepStrictEqual(results, [true, true, false, true, true, false].map(preview => ({ preview, created: preview })));
		});

		test('focuses the preview context menu and source editor without permanent controls', async () => {
			const part = createMarkdownPart(fenced(), undefined, false, false, options);
			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));
			part.codeblocks[0].focus();
			const preview = { focused: part.codeblocks[0].isFocused, region: mainWindow.document.activeElement === part.domNode.querySelector('.chat-html-preview') };
			mainWindow.document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true }));
			const menuLabels = contextMenu!.getActions!().filter(action => !(action instanceof Separator)).map(action => action.label);
			await action(part, 'Show Source').run();
			part.codeblocks[0].focus();
			const source = { focused: part.codeblocks[0].isFocused, editor: part.domNode.querySelector('.chat-html-preview-source')?.contains(mainWindow.document.activeElement) };
			assert.deepStrictEqual({ preview, source, menuLabels }, {
				preview: { focused: true, region: true },
				source: { focused: true, editor: true },
				menuLabels: ['Open Preview', 'Show Source', 'Save HTML...'],
			});
		});

		test('preserves the source toggle and webview while the rest of the response streams', async () => {
			const part = createMarkdownPart(fenced(), createRenderContext(false), true, false, options);
			const sourceAction = action(part, 'Show Source');
			await sourceAction.run();
			const updated = part.tryIncrementalUpdate({ kind: 'markdownContent', content: new MarkdownString(`${fenced()}\n\nExplanation.`) });
			assert.deepStrictEqual({
				updated,
				webviews: webviews.length,
				disposed: webviews[0].webview.disposed,
				sameAction: sourceAction === action(part, 'Show Source'),
				checked: sourceAction.checked,
				sourceHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-source')?.hidden,
				previewHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-content')?.hidden,
				sourceRenders: renderedCodeBlocks.length,
				remounts: webviews[0].webview.remounts,
			}, { updated: true, webviews: 1, disposed: false, sameAction: true, checked: true, sourceHidden: false, previewHidden: true, sourceRenders: 1, remounts: 0 });
		});

		test('uses the full content height and replaces its detached webview on remount', () => {
			const visibility = disposables.add(new Emitter<boolean>());
			const part = createMarkdownPart(fenced(), { ...createRenderContext(), onDidChangeVisibility: visibility.event }, false, false, options);
			disposables.add(toDisposable(() => part.domNode.remove()));
			mainWindow.document.body.appendChild(part.domNode);
			const webview = webviews[0].webview;
			webview.intrinsicContentSize.set({ width: 500, height: 100_000 }, undefined);
			const preview = part.domNode.querySelector<HTMLElement>('.chat-html-preview-content')!;
			const height = preview.style.height;
			const measuredHeight = preview.getBoundingClientRect().height;
			part.onDidRemount();
			const previousDisposed = webview.disposed;
			webviews[1].webview.intrinsicContentSize.set({ width: 0, height: 0 }, undefined);
			const loadingHeight = part.domNode.querySelector<HTMLElement>('.chat-html-preview-content')?.style.height;
			visibility.fire(true);
			part.dispose();
			assert.deepStrictEqual({
				height,
				measuredHeight,
				loadingHeight,
				previousDisposed,
				created: webviews.length,
				reusedDetachedFrame: webviews.some(view => view.webview.remounts > 0),
				allDisposed: webviews.every(view => view.webview.disposed),
			}, { height: '100000px', measuredHeight: 100000, loadingHeight: '100000px', previousDisposed: true, created: 3, reusedDetachedFrame: false, allDisposed: true });
		});

		test('keeps source mode on remount and creates a fresh webview when returning to preview', async () => {
			const part = createMarkdownPart(fenced(), undefined, false, false, options);
			await action(part, 'Show Source').run();
			part.onDidRemount();
			const inSource = {
				created: webviews.length,
				oldDisposed: webviews[0].webview.disposed,
				sourceHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-source')?.hidden,
			};
			await action(part, 'Show Source').run();
			assert.deepStrictEqual({
				inSource,
				createdAfterToggle: webviews.length,
				previewHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-content')?.hidden,
				sourceChecked: action(part, 'Show Source').checked,
			}, { inSource: { created: 1, oldDisposed: true, sourceHidden: false }, createdAfterToggle: 2, previewHidden: false, sourceChecked: false });
		});

		test('restores source mode and reserved height after rebuilding a recycled HTML part', async () => {
			const context = createRenderContext();
			const part = createMarkdownPart(fenced(), context, false, false, options);
			webviews[0].webview.intrinsicContentSize.set({ width: 500, height: 480 }, undefined);
			await action(part, 'Show Source').run();
			part.dispose();

			const restored = createMarkdownPart(fenced(), context, false, false, options);
			const beforeToggle = {
				created: webviews.length,
				sourceHidden: restored.domNode.querySelector<HTMLElement>('.chat-html-preview-source')?.hidden,
				checked: action(restored, 'Show Source').checked,
				height: restored.domNode.querySelector<HTMLElement>('.chat-html-preview-content')?.style.height,
			};
			await action(restored, 'Show Source').run();
			const other = createRenderContext();
			Object.assign(other.element, { id: 'another-response' });
			const separate = createMarkdownPart(fenced(), other, false, false, options);
			assert.deepStrictEqual({
				beforeToggle,
				createdAfterToggle: webviews.length,
				previewHidden: restored.domNode.querySelector<HTMLElement>('.chat-html-preview-content')?.hidden,
				separateSourceHidden: separate.domNode.querySelector<HTMLElement>('.chat-html-preview-source')?.hidden,
				separateHeight: separate.domNode.querySelector<HTMLElement>('.chat-html-preview-content')?.style.height,
			}, {
				beforeToggle: { created: 1, sourceHidden: false, checked: true, height: '480px' },
				createdAfterToggle: 3, previewHidden: false, separateSourceHidden: true, separateHeight: '',
			});
		});

		test('resynchronizes a retained HTML part after another row changes the shared view state', async () => {
			const context = createRenderContext();
			const retained = createMarkdownPart(fenced(), context, false, false, options);
			const replacement = createMarkdownPart(fenced(), context, false, false, options);
			webviews[1].webview.intrinsicContentSize.set({ width: 500, height: 480 }, undefined);
			const state = () => ({
				sourceHidden: retained.domNode.querySelector<HTMLElement>('.chat-html-preview-source')?.hidden,
				previewHidden: retained.domNode.querySelector<HTMLElement>('.chat-html-preview-content')?.hidden,
				checked: action(retained, 'Show Source').checked,
				height: retained.domNode.querySelector<HTMLElement>('.chat-html-preview-content')?.style.height,
				created: webviews.length,
			});
			await action(replacement, 'Show Source').run();
			retained.onDidRemount();
			const inSource = state();
			await action(replacement, 'Show Source').run();
			retained.onDidRemount();
			assert.deepStrictEqual({ inSource, inPreview: state(), oldDisposed: webviews[0].webview.disposed }, {
				inSource: { sourceHidden: false, previewHidden: true, checked: true, height: '480px', created: 2 },
				inPreview: { sourceHidden: true, previewHidden: false, checked: false, height: '480px', created: 3 },
				oldDisposed: true,
			});
		});

		test('does not reload a failed retained preview when another row switches back to preview', async () => {
			const context = createRenderContext();
			const failed = createMarkdownPart(fenced(), context, false, false, options);
			webviews[0].webview.fatalError.fire({ message: 'Webview unavailable' });
			const replacement = createMarkdownPart(fenced(), context, false, false, options);
			await action(replacement, 'Show Source').run();
			failed.onDidRemount();
			assert.deepStrictEqual({
				created: webviews.length,
				sourceHidden: failed.domNode.querySelector<HTMLElement>('.chat-html-preview-source')?.hidden,
				previewHidden: failed.domNode.querySelector<HTMLElement>('.chat-html-preview-content')?.hidden,
				checked: action(failed, 'Show Source').checked,
				enabled: action(failed, 'Show Source').enabled,
			}, { created: 2, sourceHidden: false, previewHidden: true, checked: true, enabled: false });
		});

		test('keeps oversized output as source without allocating a webview', () => {
			const atLimit = 'x'.repeat(ChatHtmlPreviewPart.maxPreviewLength);
			createMarkdownPart(fenced(atLimit), undefined, false, false, options);
			const overLimit = atLimit + 'x';
			const part = createMarkdownPart(fenced(overLimit), undefined, false, false, options);
			assert.deepStrictEqual({
				webviews: webviews.length,
				sourcePreserved: renderedCodeBlocks.at(-1)?.text === overLimit,
				sourceHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-source')?.hidden,
				message: part.domNode.querySelector('.chat-html-preview-notice')?.textContent,
				noticeHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-notice')?.hidden,
			}, { webviews: 1, sourcePreserved: true, sourceHidden: false, message: 'HTML preview is too large. Showing source instead.', noticeHidden: false });
		});

		test('shows and logs webview failures while preserving the original source', () => {
			const logError = stub(instantiationService.get(ILogService), 'error');
			disposables.add(toDisposable(() => logError.restore()));
			const part = createMarkdownPart(fenced(), undefined, false, false, options);
			webviews[0].webview.fatalError.fire({ message: 'Webview unavailable' });
			assert.deepStrictEqual({
				logged: logError.calledOnce,
				sourceHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-source')?.hidden,
				message: part.domNode.querySelector('[role="alert"]')?.textContent,
				noticeHidden: part.domNode.querySelector<HTMLElement>('.chat-html-preview-notice')?.hidden,
				source: renderedCodeBlocks[0].text,
			}, { logged: true, sourceHidden: false, message: 'Unable to load HTML preview. Showing source instead.', noticeHidden: false, source: html });
		});

		test('opens a restricted larger editor, reuses it, and keeps it alive independently of chat rendering', async () => {
			const opened: EditorInput[] = [];
			const editors = stub(instantiationService.get(IEditorService), 'editors').get(() => opened);
			const open = stub(instantiationService.get(IEditorService), 'openEditor').callsFake(async input => {
				opened.push(input);
				store.add(input);
				return upcastPartial<IEditorPane>({ input });
			});
			disposables.add(toDisposable(() => open.restore()));
			disposables.add(toDisposable(() => editors.restore()));
			const markdown = fenced('<h1>Review</h1><p>Summary</p><script>unsafe()</script>');
			const part = createMarkdownPart(markdown, undefined, false, false, options);
			await action(part, 'Open Preview').run();
			await action(part, 'Open Preview').run();
			part.dispose();
			const restored = createMarkdownPart(markdown, undefined, false, false, options);
			await action(restored, 'Open Preview').run();
			restored.dispose();
			const document = new DOMParser().parseFromString(webviews[1].webview.html, 'text/html');
			assert.deepStrictEqual({
				count: webviews.length,
				reused: opened[0] === opened[1],
				reusedAfterRecycling: opened[0] === opened[2],
				editor: opened[0] instanceof ChatHtmlPreviewEditorInput,
				editorDisposed: opened[0].isDisposed(),
				inlineDisposed: webviews[0].webview.disposed,
				expandedDisposed: webviews[1].webview.disposed,
				contentOptions: webviews[1].init.contentOptions,
				find: webviews[1].init.options.enableFindWidget,
				heading: document.querySelector('h1')?.textContent,
				scripts: document.scripts.length,
			}, {
				count: 3, reused: true, reusedAfterRecycling: true, editor: true, editorDisposed: false, inlineDisposed: true, expandedDisposed: false,
				contentOptions: { allowScripts: false, allowForms: false, enableCommandUris: false, localResourceRoots: [] },
				find: true, heading: 'Review', scripts: 0,
			});
		});

		test('disposes a new expanded preview if opening its editor fails', async () => {
			const failure = new Error('Editor unavailable');
			instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
				override readonly editors = [];
				override async openEditor(): Promise<never> { throw failure; }
			}());
			const part = createMarkdownPart(fenced(), undefined, false, false, options);
			await assert.rejects(async () => action(part, 'Open Preview').run(), /Editor unavailable/);
			assert.deepStrictEqual({
				disposed: webviews[1].webview.disposed,
				retryEnabled: action(part, 'Open Preview').enabled,
			}, { disposed: true, retryEnabled: true });
		});

		test('restores expanded preview scroll after releasing and reclaiming its editor', () => {
			const service = instantiationService.get(IWebviewService);
			const createOverlay = stub(service, 'createWebviewOverlay').callsFake(init => instantiationService.createInstance(OverlayWebview, init));
			disposables.add(toDisposable(() => createOverlay.restore()));
			instantiationService.stub(IWorkbenchLayoutService, { getContainer: () => mainWindow.document.body });
			const input = store.add(instantiationService.createInstance(ChatHtmlPreviewEditorInput, '<h1>Long report</h1>', 'scroll-preview'));
			const owner = {};
			input.webview.claim(owner, mainWindow, undefined);
			webviews[0].webview.scroll.fire({ scrollYPercentage: 0.6 });
			input.webview.release(owner);
			input.webview.claim(owner, mainWindow, undefined);
			assert.deepStrictEqual({
				created: webviews.length,
				oldDisposed: webviews[0].webview.disposed,
				restoredScroll: webviews[1].webview.initialScrollProgress,
			}, { created: 2, oldDisposed: true, restoredScroll: 0.6 });
		});

		test('exports a sanitized standalone file and opens it through the existing file preview path', async () => {
			const files = createInMemoryFileService(disposables, Schemas.file);
			instantiationService.stub(IFileService, files);
			const target = URI.file('/html-report.html');
			instantiationService.stub(IFileDialogService, {
				defaultFilePath: async () => URI.file('/'),
				showSaveDialog: async () => target,
			});
			const didOpen = new DeferredPromise<void>();
			let opened: URI | string | undefined;
			let override: IEditorOptions['override'];
			instantiationService.stub(IOpenerService, {
				open: async (resource, options: OpenOptions | undefined) => {
					opened = resource;
					override = options?.editorOptions?.override;
					void didOpen.complete();
					return true;
				},
			});
			instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
				override async openEditor(): Promise<undefined> {
					opened = target;
					void didOpen.complete();
					return undefined;
				}
			}());
			const part = createMarkdownPart(fenced('<h1 id="summary">Saved report</h1><a href="#summary">Summary</a><script>unsafe()</script><form><input></form><style>h1 {color:var(--vscode-editor-foreground)}</style>'), undefined, false, false, options);
			await action(part, 'Save HTML...').run();
			await didOpen.p;
			const saved = (await files.readFile(target)).value.toString();
			const document = new DOMParser().parseFromString(saved, 'text/html');
			const reopened = store.add(instantiationService.createInstance(ChatHtmlPreviewEditorInput, saved, 'saved-preview'));
			assert.deepStrictEqual({
				opened: opened?.toString(),
				override,
				heading: document.querySelector('h1')?.textContent,
				activeContent: document.querySelectorAll('script,form,input').length,
				csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')?.includes(`script-src 'none'`),
				navigation: document.querySelector('a')?.getAttribute('href'),
				font: document.documentElement.style.getPropertyValue('--vscode-font-family').length > 0,
				reopened: new DOMParser().parseFromString(reopened.html, 'text/html').querySelector('h1')?.textContent,
				originalSource: renderedCodeBlocks[0].text.includes('<script>unsafe()</script>'),
			}, {
				opened: target.toString(), override: isWeb ? undefined : BrowserViewEditorId, heading: 'Saved report',
				activeContent: 0, csp: true, navigation: '#summary', font: true, reopened: 'Saved report', originalSource: true,
			});
		});

		test('reports an export failure without opening a successful-looking preview', async () => {
			const failure = new Error('Write denied');
			instantiationService.stub(IFileService, { writeFile: async () => { throw failure; } });
			instantiationService.stub(IFileDialogService, {
				defaultFilePath: async () => URI.file('/'),
				showSaveDialog: async () => URI.file('/report.html'),
			});
			const opener = spy();
			instantiationService.stub(IOpenerService, { open: opener });
			const part = createMarkdownPart(fenced(), undefined, false, false, options);
			await assert.rejects(async () => action(part, 'Save HTML...').run(), /Write denied/);
			assert.deepStrictEqual({
				opened: opener.called,
				retryEnabled: action(part, 'Save HTML...').enabled,
			}, { opened: false, retryEnabled: true });
		});

		test('provides readable expanded content and restores focus after accessibility help', () => {
			const input = store.add(instantiationService.createInstance(ChatHtmlPreviewEditorInput, '<style>p { color: red }</style><h1>Plan</h1><p>Review this change.</p><details><summary>Risks</summary><p>Offline only.</p></details><table><tr><th>Area</th><th>Status</th></tr><tr><td>Preview</td><td>Ready</td></tr></table>', 'accessible-preview'));
			webviews[0].webview.isFocused = true;
			instantiationService.stub(IEditorService, { activeEditor: input });
			const focus = spy(input.webview, 'focus');
			disposables.add(toDisposable(() => focus.restore()));
			const view = store.add(new ChatHtmlPreviewAccessibleView(AccessibleViewType.View).getProvider(instantiationService)!);
			const help = store.add(new ChatHtmlPreviewAccessibleView(AccessibleViewType.Help).getProvider(instantiationService)!);
			help.onClose();
			assert.deepStrictEqual({
				content: view.provideContent(),
				help: help.provideContent().includes('Save HTML exports a sanitized, self-contained document'),
				findCommand: help.provideContent().includes('<keybinding:editor.action.webvieweditor.showFind>'),
				focusRestored: focus.calledOnce,
			}, { content: '# Plan\nReview this change.\n\nRisks\n\nOffline only.\n\nArea | Status\n\nPreview | Ready', help: true, findCommand: true, focusRestored: true });
		});

		test('leaves accessibility commands with chat and Find when the preview content is not focused', () => {
			const input = store.add(instantiationService.createInstance(ChatHtmlPreviewEditorInput, '<h1>Report</h1>', 'focused-preview'));
			const editorService: { activeEditor: EditorInput | undefined } = { activeEditor: input };
			instantiationService.stub(IEditorService, editorService);
			const configuration = new TestConfigurationService();
			disposables.add(configuration.onDidChangeConfigurationEmitter);
			const context = disposables.add(new ContextKeyService(configuration));
			ChatContextKeys.enabled.bindTo(context).set(true);
			CONTEXT_ACTIVE_WEBVIEW_PANEL_ID.bindTo(context).set(ChatHtmlPreviewEditorInput.viewType);
			const findFocused = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED.bindTo(context);
			const focus = spy(input.webview, 'focus');
			disposables.add(toDisposable(() => focus.restore()));
			const results = [AccessibleViewType.Help, AccessibleViewType.View].map(type => {
				const implementation = new ChatHtmlPreviewAccessibleView(type);
				const unfocused = implementation.getProvider(instantiationService);
				if (unfocused) {
					store.add(unfocused);
				}
				const matchesPreview = context.contextMatchesRules(implementation.when);
				findFocused.set(true);
				const matchesFind = context.contextMatchesRules(implementation.when);
				findFocused.set(false);
				webviews[0].webview.isFocused = true;
				const provider = store.add(implementation.getProvider(instantiationService)!);
				editorService.activeEditor = undefined;
				provider.onClose();
				editorService.activeEditor = input;
				webviews[0].webview.isFocused = false;
				return { suppliedOutsidePreview: !!unfocused, matchesPreview, matchesFind };
			});
			assert.deepStrictEqual({ results, refocusedAfterEditorChanged: focus.called }, {
				results: [{ suppliedOutsidePreview: false, matchesPreview: true, matchesFind: false }, { suppliedOutsidePreview: false, matchesPreview: true, matchesFind: false }],
				refocusedAfterEditorChanged: false,
			});
		});

		test('allows only normalized in-document anchor navigation', () => {
			const document = new DOMParser().parseFromString(createHtmlPreviewDocument(`
				<a href="#summary">Summary</a><a href="#code%20review">Encoded</a><a href="#code review">Spaces</a><a href="#">Top</a>
				<a href="#broken%zz">Malformed</a><a href="https://example.com/#summary">External</a>
				<a href="//example.com">Protocol relative</a><a href="command:unsafe">Command</a><a href="javascript:unsafe()">Script</a>
				<svg><a href="#summary"><text>SVG link</text></a></svg>
				<h2 id="summary">Summary</h2><h2 id="code review">Code review</h2>
			`), 'text/html');
			assert.deepStrictEqual([...document.querySelectorAll('a')].map(anchor => anchor.getAttribute('href')),
				['#summary', '#code%20review', '#code%20review', '#', null, null, null, null, null, null]);
		});

		test('preserves common section targets and their ARIA and SVG references without DOM collisions', () => {
			const ids = ['title', 'timeline', 'implementation', 'style', 'summary', 'vscode-html-preview-title'];
			const document = new DOMParser().parseFromString(createHtmlPreviewDocument(
				ids.map(id => `<a href="#${id}">${id}</a><h2 id="${id}">${id}</h2>`).join('')
				+ '<section aria-labelledby="title summary"></section><svg><defs><marker id="target"></marker></defs><path marker-end="url(#%74arget)"></path></svg>'
			), 'text/html');
			const markerId = document.querySelector('path')?.getAttribute('marker-end')?.slice(5, -1);
			assert.deepStrictEqual({
				targets: [...document.querySelectorAll('a')].map(anchor => document.getElementById(decodeURIComponent(anchor.hash.slice(1)))?.textContent),
				ariaTargets: document.querySelector('section')?.getAttribute('aria-labelledby')?.split(' ').map(id => document.getElementById(id)?.textContent),
				svgTarget: !!markerId && document.getElementById(decodeURIComponent(markerId)) === document.querySelector('marker'),
				noClobberingTitle: document.getElementById('title') === null,
				distinctIds: new Set([...document.querySelectorAll('[id]')].map(element => element.id)).size,
			}, { targets: ids, ariaTargets: ['title', 'summary'], svgTarget: true, noClobberingTitle: true, distinctIds: ids.length + 1 });
		});

		test('exports only referenced theme variables without introducing active markup', () => {
			const document = new DOMParser().parseFromString(createHtmlPreviewDocument('<p style="color: var(--vscode-foreground)">Themed</p>', {
				activeTheme: 'vscode-dark',
				styles: { 'vscode-foreground': '#123456', 'vscode-font-family': 'font"</style><script>unsafe()</script>', 'vscode-unused': 'not exported' },
			}), 'text/html');
			assert.deepStrictEqual({
				color: document.documentElement.style.getPropertyValue('--vscode-foreground'),
				unused: document.documentElement.style.getPropertyValue('--vscode-unused'),
				scripts: document.scripts.length,
				class: document.body.className,
			}, { color: '#123456', unused: '', scripts: 0, class: 'vscode-dark' });
		});

		test('preserves quoted platform fonts and subsequent theme variables in saved HTML', () => {
			const fonts = ['"Segoe WPC", "Segoe UI", sans-serif', 'system-ui, "Ubuntu", "Droid Sans", sans-serif', '-apple-system, BlinkMacSystemFont, sans-serif'];
			const results = fonts.map(font => {
				const document = new DOMParser().parseFromString(createHtmlPreviewDocument('<p>Report</p>', {
					activeTheme: 'vscode-dark',
					styles: { 'vscode-font-family': font, 'vscode-editor-foreground': '#d4d4d4', 'vscode-editor-background': '#1e1e1e' },
				}), 'text/html');
				return {
					font: document.documentElement.style.getPropertyValue('--vscode-font-family'),
					foreground: document.documentElement.style.getPropertyValue('--vscode-editor-foreground'),
					background: document.documentElement.style.getPropertyValue('--vscode-editor-background'),
					attributes: document.documentElement.getAttributeNames(),
				};
			});
			assert.deepStrictEqual(results, fonts.map(font => ({
				font, foreground: '#d4d4d4', background: '#1e1e1e', attributes: ['style'],
			})));
		});

		test('blends inline documents with chat without removing authored surfaces or standalone styling', async () => {
			const frame = mainWindow.document.createElement('iframe');
			frame.setAttribute('sandbox', 'allow-same-origin');
			disposables.add(toDisposable(() => frame.remove()));
			mainWindow.document.body.appendChild(frame);
			const results = [];
			for (const presentation of ['inline', 'document'] as const) {
				const loaded = new DeferredPromise<void>();
				const listener = disposables.add(addDisposableListener(frame, 'load', () => loaded.complete()));
				frame.srcdoc = createHtmlPreviewDocument('<section style="background:#abc">Report</section>', {
					activeTheme: 'vscode-dark',
					styles: { 'vscode-foreground': '#123456', 'vscode-editor-foreground': '#abcdef', 'vscode-editor-background': '#182d50' },
				}, presentation);
				await loaded.p;
				listener.dispose();
				const body = frame.contentWindow!.getComputedStyle(frame.contentDocument!.body);
				results.push({
					presentation,
					background: body.backgroundColor,
					color: body.color,
					padding: body.padding,
					authored: frame.contentWindow!.getComputedStyle(frame.contentDocument!.querySelector('section')!).backgroundColor,
				});
			}
			assert.deepStrictEqual(results, [
				{ presentation: 'inline', background: 'rgba(0, 0, 0, 0)', color: 'rgb(18, 52, 86)', padding: '0px', authored: 'rgb(170, 187, 204)' },
				{ presentation: 'document', background: 'rgb(24, 45, 80)', color: 'rgb(171, 205, 239)', padding: '12px', authored: 'rgb(170, 187, 204)' },
			]);
		});

		test('preserves native horizontal scrolling without a layout wrapper', async () => {
			const frame = mainWindow.document.createElement('iframe');
			frame.setAttribute('sandbox', 'allow-same-origin');
			frame.style.cssText = 'position: absolute; top: 0; left: 0; width: 440px; height: 300px; border: 0;';
			const loaded = new DeferredPromise<void>();
			disposables.add(addDisposableListener(frame, 'load', () => loaded.complete()));
			disposables.add(toDisposable(() => frame.remove()));
			frame.srcdoc = createHtmlPreviewDocument('<style>html { scrollbar-color: auto; } ::-webkit-scrollbar { height: 16px; width: 16px; }</style><pre>' + ('Wide content '.repeat(30) + '\n').repeat(4) + '</pre>');
			mainWindow.document.body.appendChild(frame);
			await loaded.p;
			const document = frame.contentDocument!;
			const contentWindow = frame.contentWindow!;
			// Headless browsers can hide scrollbars even when their size is specified in CSS.
			const scrollbarHeight = contentWindow.innerHeight - document.documentElement.clientHeight;
			frame.style.height = `${Math.ceil(document.documentElement.getBoundingClientRect().height + scrollbarHeight)}px`;
			contentWindow.scrollTo(100, 100);
			assert.deepStrictEqual({
				rootFitsVertically: document.documentElement.scrollHeight === document.documentElement.clientHeight,
				contentOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
				scrollbarHeight: contentWindow.innerHeight - document.documentElement.clientHeight,
				scrollPosition: { x: contentWindow.scrollX, y: contentWindow.scrollY },
				unwrapped: document.querySelector('pre')?.parentElement === document.body,
			}, { rootFitsVertically: true, contentOverflows: true, scrollbarHeight, scrollPosition: { x: 100, y: 0 }, unwrapped: true });
		});

		test('keeps a viewport-height body minimum stable while auto-sizing', async () => {
			const frame = mainWindow.document.createElement('iframe');
			frame.setAttribute('sandbox', 'allow-same-origin');
			frame.style.cssText = 'position: absolute; top: 0; left: 0; width: 440px; height: 300px; border: 0;';
			const loaded = new DeferredPromise<void>();
			disposables.add(addDisposableListener(frame, 'load', () => loaded.complete()));
			disposables.add(toDisposable(() => frame.remove()));
			frame.srcdoc = createHtmlPreviewDocument('<style>body{min-height:100vh}</style><p>Viewport-height document</p>');
			mainWindow.document.body.appendChild(frame);
			await loaded.p;
			const heights: number[] = [];
			for (let index = 0; index < 3; index++) {
				const root = frame.contentDocument!.documentElement;
				const height = Math.ceil(root.getBoundingClientRect().height + frame.contentWindow!.innerHeight - root.clientHeight);
				heights.push(height);
				frame.style.height = `${height}px`;
				await nextHostFrame();
			}
			assert.deepStrictEqual(heights, [300, 300, 300]);
		});

		test('preserves body grid layout, ID selectors and sticky navigation', async () => {
			const frame = mainWindow.document.createElement('iframe');
			frame.setAttribute('sandbox', 'allow-same-origin');
			frame.style.cssText = 'position: absolute; top: 0; left: 0; width: 800px; height: 300px; border: 0;';
			const loaded = new DeferredPromise<void>();
			disposables.add(addDisposableListener(frame, 'load', () => loaded.complete()));
			disposables.add(toDisposable(() => frame.remove()));
			frame.srcdoc = createHtmlPreviewDocument('<style>body{display:grid;grid-template-columns:160px 1fr;gap:12px}nav{position:sticky;top:0;align-self:start}main{min-height:1200px}#\\74 itle{color:rgb(255,0,0)}[id="timeline" i]{font-weight:600}a[href="#title"]{color:rgb(0,128,0)}#title\u00e9{font-style:italic}.literal::after{content:"#title"}</style><nav><a href="#title">Contents</a></nav><main><h1 id="title">Report</h1><p id="timeline">Timeline</p><p id="Timeline">Case variant</p><p id="title\u00e9">Unicode ID</p><p class="literal"></p></main>');
			mainWindow.document.body.appendChild(frame);
			await loaded.p;
			const document = frame.contentDocument!;
			const nav = document.querySelector('nav')!;
			const main = document.querySelector('main')!;
			const before = { sameRow: nav.getBoundingClientRect().top === main.getBoundingClientRect().top, separateColumns: main.getBoundingClientRect().left > nav.getBoundingClientRect().right };
			frame.contentWindow!.scrollTo(0, 200);
			await nextHostFrame();
			assert.deepStrictEqual({
				before,
				stickyTop: nav.getBoundingClientRect().top,
				titleColor: frame.contentWindow!.getComputedStyle(document.querySelector('h1')!).color,
				linkColor: frame.contentWindow!.getComputedStyle(document.querySelector('a')!).color,
				timelineWeight: frame.contentWindow!.getComputedStyle(document.querySelector('p')!).fontWeight,
				variantWeight: frame.contentWindow!.getComputedStyle(document.getElementById('Timeline')!).fontWeight,
				unicodeStyle: frame.contentWindow!.getComputedStyle(document.getElementById('title\u00e9')!).fontStyle,
				literal: frame.contentWindow!.getComputedStyle(document.querySelector('.literal')!, '::after').content,
				children: [...document.body.children].filter(element => element.tagName !== 'STYLE').map(element => element.tagName),
			}, {
				before: { sameRow: true, separateColumns: true }, stickyTop: 0, titleColor: 'rgb(255, 0, 0)', linkColor: 'rgb(0, 128, 0)', timelineWeight: '600', variantWeight: '600', unicodeStyle: 'italic', literal: '"#title"', children: ['NAV', 'MAIN'],
			});
		});

		test('removes active markup, navigations, resource URLs, and webview context while preserving static visuals', () => {
			const document = new DOMParser().parseFromString(createHtmlPreviewDocument(`
				<!DOCTYPE html><html><head><style>.card { color: red }</style>
				<meta http-equiv="refresh" content="0;url=https://example.com">
				<meta http-equiv="Content-Security-Policy" content="default-src *">
				<base href="https://example.com"><link rel="stylesheet" href="https://example.com/style.css"></head>
				<body><section class="card" style="padding: 12px" data-vscode-context='{"webviewSection":"unsafe"}' aria-label="Report">
				<script>acquireVsCodeApi().postMessage({command:'unsafe'})</script>
				<img src="https://example.com/tracker" onerror="alert(1)">
				<img src="file:///private.txt"><img src="vscode-webview-resource://private.txt">
				<img src="data:image/png;base64,AAAA" alt="Embedded">
				<img src="data:image/svg+xml;base64,AAAA">
				<iframe srcdoc="<script>alert(1)</script>"></iframe><object data="https://example.com"></object>
				<form action="https://example.com"><input autofocus><button formaction="https://example.com">Send</button></form>
				<a href="command:unsafe" ping="https://example.com" target="_top">Link</a>
				<svg viewBox="0 0 100 100" aria-label="Chart"><title>Chart</title><rect width="50" height="25" fill="red"/><foreignObject><p>Unsafe</p></foreignObject><use href="https://example.com/chart.svg"/></svg>
				<details open><summary>More</summary>Visible details</details>
				</section></body></html>
			`), 'text/html');
			assert.deepStrictEqual({
				activeElements: document.querySelectorAll('script, iframe, object, form, input, button, base, link, foreignObject, use').length,
				refresh: document.querySelectorAll('meta[http-equiv="refresh"]').length,
				cspCount: document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length,
				csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'),
				resourceUrls: [...document.querySelectorAll('[src]')].map(element => element.getAttribute('src')),
				unsafeAttributes: document.querySelectorAll('[href], [ping], [target], [onerror], [data-vscode-context]').length,
				label: document.querySelector('section')?.getAttribute('aria-label'),
				style: document.querySelector('section')?.getAttribute('style'),
				svg: document.querySelector('svg')?.getAttribute('viewBox'),
				rectangle: document.querySelector('rect')?.getAttribute('width'),
				details: document.querySelector('details')?.hasAttribute('open'),
				authorStyle: document.querySelector('body style')?.textContent,
			}, {
				activeElements: 0, refresh: 0, cspCount: 1,
				csp: `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';`,
				resourceUrls: ['data:image/png;base64,AAAA'], unsafeAttributes: 0, label: 'Report',
				style: 'padding: 12px', svg: '0 0 100 100', rectangle: '50', details: true, authorStyle: '.card { color: red }',
			});
		});
	});

	suite('Native components', () => {
		const visual = [
			'<Columns>',
			'  <Metric label="Full build" value="12.4 s" />',
			'  <Metric label="Incremental build" value="1.8 s" tone="positive" />',
			'</Columns>',
			'<Disclosure summary="Method"><Text>Median of five runs.</Text></Disclosure>',
		].join('\n');
		const fenced = (text = visual, fence = '```', info = 'vscode-ui') => `${fence}${info}\n${text}\n${fence}`;
		const options: IChatMarkdownContentPartOptions = { nativeComponents: chatNativeComponentsRenderer };
		let contextMenu: Parameters<IContextMenuService['showContextMenu']>[0] | undefined;

		setup(() => {
			contextMenu = undefined;
			instantiationService.stub(IContextMenuService, {
				showContextMenu: delegate => { contextMenu = delegate; },
				onDidHideContextMenu: Event.None,
			});
		});

		const root = (part: ChatMarkdownContentPart) => part.domNode.querySelector<HTMLElement>('.chat-native-components');

		/** What a block shows: its visual, its source, or the source with the reason it is not a visual. */
		function shown(part: ChatMarkdownContentPart) {
			const element = root(part);
			return element && {
				visual: !element.querySelector<HTMLElement>('.chat-native-components-visual')!.hidden,
				source: !element.querySelector<HTMLElement>('.chat-native-components-source')!.hidden,
				notice: element.querySelector('.chat-native-components-notice')?.textContent,
				expanded: Array.from(element.querySelectorAll('details'), details => details.open),
			};
		}

		/** Returns the context menu that was requested since the last call, if any. */
		function takeContextMenu() {
			const delegate = contextMenu;
			contextMenu = undefined;
			return delegate;
		}

		function openContextMenu(part: ChatMarkdownContentPart): readonly IAction[] {
			root(part)!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			return takeContextMenu()?.getActions?.() ?? [];
		}

		/** Expands or collapses the disclosure as a user would, without waiting for the event the browser queues. */
		function toggleDisclosure(part: ChatMarkdownContentPart, open: boolean): void {
			const details = root(part)!.querySelector('details')!;
			details.open = open;
			details.dispatchEvent(new mainWindow.Event('toggle'));
		}

		function attach(part: ChatMarkdownContentPart): ChatMarkdownContentPart {
			mainWindow.document.body.appendChild(part.domNode);
			disposables.add(toDisposable(() => part.domNode.remove()));
			return part;
		}

		test('renders a closed response fence as a labelled visual between its prose, with the source one action away', () => {
			const part = createMarkdownPart(`Before.\n\n${fenced()}\n\nAfter.`, undefined, false, false, options);
			const element = root(part)!;
			assert.deepStrictEqual({
				shown: shown(part),
				group: [element.getAttribute('role'), element.getAttribute('aria-label'), element.tabIndex],
				values: Array.from(element.querySelectorAll('.chat-native-metric-value'), value => value.textContent),
				prose: Array.from(part.domNode.querySelectorAll('p'), paragraph => paragraph.textContent),
				permanentControls: element.querySelectorAll('button, .monaco-toolbar, .monaco-action-bar').length,
				frames: element.querySelectorAll('iframe, webview').length + renderedCodeBlockOutputs.length,
				source: renderedCodeBlocks.map(block => ({ language: block.languageId, text: block.text })),
				codeblocks: part.codeblocks.map(block => block.languageId),
				menu: openContextMenu(part).map(action => `${action.label}${action.checked ? ' (checked)' : ''}`),
			}, {
				shown: { visual: true, source: false, notice: undefined, expanded: [false] },
				group: ['group', 'Visual for code block 1', 0],
				values: ['12.4 s', '1.8 s'],
				prose: ['Before.', 'After.'],
				permanentControls: 0,
				frames: 0,
				source: [{ language: 'xml', text: visual }],
				codeblocks: ['vscode-ui'],
				menu: ['Show Source'],
			});
		});

		test('leaves other code, requests, open fences, filtered responses and annotated files as code', () => {
			const request = {
				...createRenderContext(),
				element: upcastPartial<IChatRequestViewModel>({
					id: 'request',
					sessionResource: URI.parse('chat-session://test/session1'),
					message: { text: fenced(), parts: [] },
					contentReferences: [],
				}),
			};
			const filtered = createRenderContext();
			Object.assign(filtered.element, { errorDetails: { responseIsFiltered: true, message: 'Filtered' } });
			const cases = [
				{ markdown: fenced(visual, '```', 'xml'), context: createRenderContext(), options },
				{ markdown: fenced(visual, '```', 'jsx'), context: createRenderContext(), options },
				{ markdown: fenced(), context: createRenderContext(), options: {} },
				{ markdown: fenced(), context: request, options },
				{ markdown: `\`\`\`vscode-ui\n${visual}`, context: createRenderContext(false), options },
				{ markdown: `\`\`\`vscode-ui\n${visual}`, context: createRenderContext(), options },
				{ markdown: fenced(visual, '````').slice(0, -1), context: createRenderContext(), options },
				{ markdown: fenced(), context: filtered, options },
				{ markdown: fenced(`${visual}\n<vscode_codeblock_uri>file:///report.xml</vscode_codeblock_uri>`), context: createRenderContext(), options },
			];
			assert.deepStrictEqual(cases.map(testCase => {
				const part = createMarkdownPart(testCase.markdown, testCase.context, true, false, testCase.options);
				return { visual: !!root(part), codeblocks: part.codeblocks.length };
			}), cases.map(() => ({ visual: false, codeblocks: 1 })));
		});

		test('renders a block once its fence closes, in tilde and longer fences and inside a list item or a block quote too, while the response still streams', () => {
			const streaming = () => createRenderContext(false);
			assert.deepStrictEqual([
				`Intro.\n\n\`\`\`vscode-ui\n${visual}`,
				`Intro.\n\n${fenced()}\n\nStill writ`,
				fenced(visual, '~~~~'),
				fenced(visual, '````', 'VSCODE-UI v1'),
				`- Results\n\n${fenced().replace(/^/gm, '  ')}`,
				fenced().replace(/^/gm, '> '),
			].map(markdown => shown(createMarkdownPart(markdown, streaming(), true, false, options))?.visual ?? false), [false, true, true, true, true, true]);
		});

		test('keeps the vscode-ui and html-preview fences independent of each other', () => {
			const both = `${fenced()}\n\n\`\`\`html-preview\n<p>Report</p>\n\`\`\``;
			const render = (rendererOptions: IChatMarkdownContentPartOptions) => {
				const part = createMarkdownPart(both, undefined, false, false, rendererOptions);
				return { visual: !!root(part), preview: !!part.domNode.querySelector('.chat-html-preview'), codeblocks: part.codeblocks.length };
			};
			assert.deepStrictEqual([render({}), render(options)], [
				{ visual: false, preview: false, codeblocks: 2 },
				{ visual: true, preview: false, codeblocks: 2 },
			]);
		});

		test('shows the source and a readable reason for a block that is not valid, as an ordinary code block', () => {
			const invalid = '<Metric label="Full build" value="12.4 s" />\n<Chart type="pie" />';
			const part = attach(createMarkdownPart(fenced(invalid), undefined, false, false, options));
			const unsupported = createMarkdownPart(fenced(visual, '```', 'vscode-ui v2'), undefined, false, false, options);
			const element = root(part)!;
			part.codeblocks[0].focus();
			assert.deepStrictEqual({
				shown: shown(part),
				unsupported: shown(unsupported),
				group: [element.getAttribute('role'), element.getAttribute('aria-label'), element.tabIndex],
				menu: openContextMenu(part).length,
				sourceFocused: element.querySelector('.chat-native-components-source')!.contains(mainWindow.document.activeElement),
				source: renderedCodeBlocks.map(block => block.text),
			}, {
				shown: {
					visual: false, source: true, expanded: [],
					notice: 'This block could not be shown as a visual, so its source is shown instead. Line 2: Unknown component "Chart". Available here: Stack, Columns, Text, Metric, Badge, Table, BarChart, Disclosure.',
				},
				unsupported: {
					visual: false, source: true, expanded: [],
					notice: 'This block could not be shown as a visual, so its source is shown instead. The block uses schema version 2, but this version of VS Code supports version 1.',
				},
				group: [null, null, -1],
				menu: 0,
				sourceFocused: true,
				source: [invalid, visual],
			});
		});

		test('toggles the source from the context menu with the pointer or the keyboard, moving focus to what is shown', async () => {
			const part = attach(createMarkdownPart(fenced(), undefined, false, false, options));
			let heightChanges = 0;
			disposables.add(part.onDidChangeHeight(() => heightChanges++));
			part.codeblocks[0].focus();
			const visualFocused = mainWindow.document.activeElement === root(part) && part.codeblocks[0].isFocused;
			mainWindow.document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true }));
			const keyboardMenu = takeContextMenu()?.getActions?.().map(action => action.label);

			await openContextMenu(part)[0].run();
			const inSource = { ...shown(part), checked: openContextMenu(part)[0].checked, focused: root(part)!.querySelector('.chat-native-components-source')!.contains(mainWindow.document.activeElement) };
			await openContextMenu(part)[0].run();
			assert.deepStrictEqual({
				visualFocused, keyboardMenu, inSource,
				inVisual: { ...shown(part), checked: openContextMenu(part)[0].checked, focused: mainWindow.document.activeElement === root(part) },
				heightChanges,
			}, {
				visualFocused: true,
				keyboardMenu: ['Show Source'],
				inSource: { visual: false, source: true, notice: undefined, expanded: [false], checked: true, focused: true },
				inVisual: { visual: true, source: false, notice: undefined, expanded: [false], checked: false, focused: true },
				heightChanges: 2,
			});
		});

		test('keeps the visual, its expanded details and its tables intact while the rest of the response streams', () => {
			const table = '<Table><Column>Target</Column><Row><Cell>Full</Cell></Row></Table>';
			const block = fenced(`${visual}\n${table}`);
			const markdownTable = '| Target |\n| --- |\n| Full |';
			const part = createMarkdownPart(`${block}\n\n${markdownTable}`, createRenderContext(false), true, false, options);
			const element = root(part)!;
			toggleDisclosure(part, true);
			const updates = ['\n\nExplan', '\n\nExplanation.'].map(suffix => part.tryIncrementalUpdate({ kind: 'markdownContent', content: new MarkdownString(`${block}\n\n${markdownTable}${suffix}`) }));
			assert.deepStrictEqual({
				updates,
				samePart: root(part) === element && part.domNode.contains(element),
				shown: shown(part),
				sourceRenders: renderedCodeBlocks.length,
				ownTable: element.querySelector('table')!.parentElement!.className,
				markdownTableWrappers: Array.from(part.domNode.querySelectorAll('.rendered-markdown-table-scroll-wrapper'), wrapper => element.contains(wrapper) ? 'inside the visual' : 'outside the visual'),
				prose: part.domNode.querySelector('p')?.textContent,
			}, {
				updates: [true, true],
				samePart: true,
				shown: { visual: true, source: false, notice: undefined, expanded: [true] },
				sourceRenders: 1,
				ownTable: 'chat-native-table-scroll',
				markdownTableWrappers: ['outside the visual'],
				prose: 'Explanation.',
			});
		});

		test('restores the source toggle and expanded details when a recycled row is rendered again', async () => {
			const context = createRenderContext();
			const part = createMarkdownPart(fenced(), context, false, false, options);
			let heightChanges = 0;
			disposables.add(part.onDidChangeHeight(() => heightChanges++));
			toggleDisclosure(part, true);
			await openContextMenu(part)[0].run();
			part.dispose();

			const restored = createMarkdownPart(fenced(), context, false, false, options);
			const restoredInSource = shown(restored);
			await openContextMenu(restored)[0].run();
			const other = createRenderContext();
			Object.assign(other.element, { id: 'another-response' });
			assert.deepStrictEqual({
				heightChanges,
				restoredInSource,
				restoredInVisual: shown(restored),
				otherResponse: shown(createMarkdownPart(fenced(), other, false, false, options)),
				rememberedBlocks: outputStateCache.size,
			}, {
				heightChanges: 2,
				restoredInSource: { visual: false, source: true, notice: undefined, expanded: [true] },
				restoredInVisual: { visual: true, source: false, notice: undefined, expanded: [true] },
				otherResponse: { visual: true, source: false, notice: undefined, expanded: [false] },
				rememberedBlocks: 1,
			});
		});

		test('follows the view state that another part of the same block changed, when it is shown again', async () => {
			const context = createRenderContext();
			const retained = createMarkdownPart(fenced(), context, false, false, options);
			const replacement = createMarkdownPart(fenced(), context, false, false, options);
			let heightChanges = 0;
			disposables.add(retained.onDidChangeHeight(() => heightChanges++));
			toggleDisclosure(replacement, true);
			await openContextMenu(replacement)[0].run();
			const stale = shown(retained);
			retained.onDidRemount();
			const synchronized = shown(retained);
			retained.onDidRemount();
			assert.deepStrictEqual({ stale, synchronized, heightChanges }, {
				stale: { visual: true, source: false, notice: undefined, expanded: [false] },
				synchronized: { visual: false, source: true, notice: undefined, expanded: [true] },
				heightChanges: 1,
			});
		});

		test('toggles a disclosure with Enter on its own summary, before chat takes the key for Edit Request', () => {
			const nested = '<Disclosure summary="Outer"><Disclosure summary="Inner"><Text>Nested.</Text></Disclosure></Disclosure>';
			const part = attach(createMarkdownPart(fenced(`${visual}\n${nested}`), undefined, false, false, options));
			const [method, , inner] = Array.from(root(part)!.querySelectorAll('details'));
			// Stands for the keybinding service, which listens above the visual. In a chat it runs Edit Request
			// on Enter wherever no text input has focus, and has nothing bound to Space.
			const reachedKeybindings: string[] = [];
			disposables.add(addDisposableListener(part.domNode, 'keydown', event => reachedKeybindings.push(`${event.key === ' ' ? 'Space' : event.key} on ${(event.target as Element).tagName}`)));
			const press = (target: Element, key: string, keyCode: number) => {
				target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
				return shown(part)!.expanded;
			};
			assert.deepStrictEqual({
				enterOnSummary: press(method.querySelector('summary')!, 'Enter', 13),
				enterOnNestedSummary: press(inner.querySelector('summary')!, 'Enter', 13),
				enterAgain: press(method.querySelector('summary')!, 'Enter', 13),
				spaceIsLeftToTheBrowser: press(method.querySelector('summary')!, ' ', 32),
				enterElsewhere: press(method.querySelector('.chat-native-text')!, 'Enter', 13),
				reachedKeybindings,
			}, {
				enterOnSummary: [true, false, false],
				enterOnNestedSummary: [true, false, true],
				enterAgain: [false, false, true],
				spaceIsLeftToTheBrowser: [false, false, true],
				enterElsewhere: [false, false, true],
				reachedKeybindings: ['Space on SUMMARY', 'Enter on DIV'],
			});
		});

		test('stops reacting to its visual once disposed', () => {
			const part = attach(createMarkdownPart(fenced(), undefined, false, false, options));
			const element = root(part)!;
			let heightChanges = 0;
			disposables.add(part.onDidChangeHeight(() => heightChanges++));
			part.dispose();
			element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			element.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true }));
			const details = element.querySelector('details')!;
			details.open = true;
			details.dispatchEvent(new mainWindow.Event('toggle'));
			assert.deepStrictEqual({ menu: takeContextMenu(), heightChanges, rememberedBlocks: outputStateCache.size }, { menu: undefined, heightChanges: 0, rememberedBlocks: 0 });
		});
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

	for (const marker of [
		'<vscode_codeblock_uri isEdit subAgentInvocationId="agent%2Fone">file:///example.ts</vscode_codeblock_uri>',
		'<vscode_codeblock_uri isEdit subAgentInvocationId="agent%2',
	]) {
		test(`request code preserves literal marker text: ${marker}`, () => {
			const context = {
				...createRenderContext(),
				element: upcastPartial<IChatRequestViewModel>({
					id: 'literal-request',
					sessionResource: URI.parse('chat-session://test/session1'),
					message: { text: marker, parts: [] },
					contentReferences: [],
				}),
			};
			const markdown = new MarkdownString(`\`\`\`html\n${marker}\n\`\`\``);
			createMarkdownPart(markdown, context);
			createMarkdownPart(JSON.parse(JSON.stringify(markdown)), context);
			assert.deepStrictEqual(renderedCodeBlocks.map(block => ({ text: block.text, resource: block.codemapperUri })), [
				{ text: marker, resource: undefined },
				{ text: marker, resource: undefined },
			]);
		});
	}

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
