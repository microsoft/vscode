/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/chatCodeBlockPill.css';
import './media/chatMarkdownPart.css';
import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { allowedMarkdownHtmlAttributes, MarkdownRendererMarkedOptions, type MarkdownRenderOptions } from '../../../../../base/browser/markdownRenderer.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunSelfDisposable, derived, observableValue } from '../../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { EditDeltaInfo } from '../../../../../editor/common/textModelEditSource.js';
import { localize } from '../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IAiEditTelemetryService } from '../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { MarkedKatexSupport } from '../../../markdown/browser/markedKatexSupport.js';
import { IMarkdownVulnerability } from '../../common/annotations.js';
import { IEditSessionEntryDiff } from '../../common/chatEditingService.js';
import { IChatProgressRenderableResponseContent } from '../../common/chatModel.js';
import { IChatMarkdownContent, IChatService, IChatUndoStop } from '../../common/chatService.js';
import { isRequestVM, isResponseVM } from '../../common/chatViewModel.js';
import { CodeBlockEntry, CodeBlockModelCollection } from '../../common/codeBlockModelCollection.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatCodeBlockInfo } from '../chat.js';
import { IChatRendererDelegate } from '../chatListRenderer.js';
import { ChatMarkdownDecorationsRenderer } from '../chatMarkdownDecorationsRenderer.js';
import { allowedChatMarkdownHtmlTags } from '../chatContentMarkdownRenderer.js';
import { ChatEditorOptions } from '../chatOptions.js';
import { CodeBlockPart, ICodeBlockData, ICodeBlockRenderOptions, localFileLanguageId, parseLocalFileData } from '../codeBlockPart.js';
import { IDisposableReference, ResourcePool } from './chatCollections.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatExtensionsContentPart } from './chatExtensionsContentPart.js';
import { IOpenEditorOptions, registerOpenEditorListeners } from '../../../../../platform/editor/browser/editor.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { ChatEditingActionContext } from '../chatEditing/chatEditingActions.js';
import { AccessibilityWorkbenchSettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';

const $ = dom.$;

export interface IChatMarkdownContentPartOptions {
	readonly codeBlockRenderOptions?: ICodeBlockRenderOptions;
	readonly accessibilityOptions?: {
		/**
		 * Message to announce to screen readers as a status update if VerboseChatProgressUpdates is enabled.
		 * Will also be used as the aria-label for the container.
		 * */
		statusMessage?: string;
	};
}

export class ChatMarkdownContentPart extends Disposable implements IChatContentPart {

	private static ID_POOL = 0;

	readonly codeblocksPartId = String(++ChatMarkdownContentPart.ID_POOL);
	readonly domNode: HTMLElement;

	private readonly allRefs: IDisposableReference<CodeBlockPart | CollapsedCodeBlock>[] = [];

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	readonly codeblocks: IChatCodeBlockInfo[] = [];

	private readonly mathLayoutParticipants = new Set<() => void>();

	constructor(
		private readonly markdown: IChatMarkdownContent,
		context: IChatContentPartRenderContext,
		private readonly editorPool: EditorPool,
		fillInIncompleteTokens = false,
		codeBlockStartIndex = 0,
		renderer: IMarkdownRenderer,
		markdownRenderOptions: MarkdownRenderOptions | undefined,
		currentWidth: number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly rendererOptions: IChatMarkdownContentPartOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAiEditTelemetryService private readonly aiEditTelemetryService: IAiEditTelemetryService,
	) {
		super();

		const element = context.element;
		const inUndoStop = (findLast(context.content, e => e.kind === 'undoStop', context.contentIndex) as IChatUndoStop | undefined)?.id;

		// We release editors in order so that it's more likely that the same editor will
		// be assigned if this element is re-rendered right away, like it often is during
		// progressive rendering
		const orderedDisposablesList: IDisposable[] = [];

		// Need to track the index of the codeblock within the response so it can have a unique ID,
		// and within this part to find it within the codeblocks array
		let globalCodeBlockIndexStart = codeBlockStartIndex;
		let thisPartCodeBlockIndexStart = 0;

		this.domNode = $('div.chat-markdown-part');

		if (this.rendererOptions.accessibilityOptions?.statusMessage) {
			this.domNode.ariaLabel = this.rendererOptions.accessibilityOptions.statusMessage;
			if (configurationService.getValue<boolean>(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)) {
				status(this.rendererOptions.accessibilityOptions.statusMessage);
			}
		}

		const enableMath = configurationService.getValue<boolean>(ChatConfiguration.EnableMath);

		const doRenderMarkdown = () => {
			if (this._store.isDisposed) {
				return;
			}

			// TODO: Move katex support into chatMarkdownRenderer
			const markedExtensions = enableMath
				? coalesce([MarkedKatexSupport.getExtension(dom.getWindow(context.container), {
					throwOnError: false
				})])
				: [];

			// Enables github-flavored-markdown + line breaks with single newlines
			// (which matches typical expectations but isn't "proper" in markdown)
			const markedOpts: MarkdownRendererMarkedOptions = {
				gfm: true,
				breaks: true,
			};

			const result = this._register(renderer.render(markdown.content, {
				sanitizerConfig: MarkedKatexSupport.getSanitizerOptions({
					allowedTags: allowedChatMarkdownHtmlTags,
					allowedAttributes: allowedMarkdownHtmlAttributes,
				}),
				fillInIncompleteTokens,
				codeBlockRendererSync: (languageId, text, raw) => {
					const isCodeBlockComplete = !isResponseVM(context.element) || context.element.isComplete || !raw || codeblockHasClosingBackticks(raw);
					if ((!text || (text.startsWith('<vscode_codeblock_uri') && !text.includes('\n'))) && !isCodeBlockComplete) {
						const hideEmptyCodeblock = $('div');
						hideEmptyCodeblock.style.display = 'none';
						return hideEmptyCodeblock;
					}
					if (languageId === 'vscode-extensions') {
						const chatExtensions = this._register(instantiationService.createInstance(ChatExtensionsContentPart, { kind: 'extensions', extensions: text.split(',') }));
						this._register(chatExtensions.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
						return chatExtensions.domNode;
					}
					const globalIndex = globalCodeBlockIndexStart++;
					const thisPartIndex = thisPartCodeBlockIndexStart++;
					let textModel: Promise<ITextModel> | undefined;
					let range: Range | undefined;
					let vulns: readonly IMarkdownVulnerability[] | undefined;
					let codeblockEntry: CodeBlockEntry | undefined;
					if (equalsIgnoreCase(languageId, localFileLanguageId)) {
						try {
							const parsedBody = parseLocalFileData(text);
							range = parsedBody.range && Range.lift(parsedBody.range);
							textModel = this.textModelService.createModelReference(parsedBody.uri).then(ref => ref.object.textEditorModel);
						} catch (e) {
							return $('div');
						}
					} else {
						if (isResponseVM(element) || isRequestVM(element)) {
							const modelEntry = this.codeBlockModelCollection.getOrCreate(element.sessionResource, element, globalIndex);
							const fastUpdateModelEntry = this.codeBlockModelCollection.updateSync(element.sessionResource, element, globalIndex, { text, languageId, isComplete: isCodeBlockComplete });
							vulns = modelEntry.vulns;
							codeblockEntry = fastUpdateModelEntry;
							textModel = modelEntry.model;
						} else {
							textModel = undefined;
						}
					}

					const hideToolbar = isResponseVM(element) && element.errorDetails?.responseIsFiltered;
					const renderOptions = {
						...this.rendererOptions.codeBlockRenderOptions,
					};
					if (hideToolbar !== undefined) {
						renderOptions.hideToolbar = hideToolbar;
					}
					const codeBlockInfo: ICodeBlockData = { languageId, textModel, codeBlockIndex: globalIndex, codeBlockPartIndex: thisPartIndex, element, range, parentContextKeyService: contextKeyService, vulns, codemapperUri: codeblockEntry?.codemapperUri, renderOptions, chatSessionResource: element.sessionResource };

					if (element.isCompleteAddedRequest || !codeblockEntry?.codemapperUri || !codeblockEntry.isEdit) {
						const ref = this.renderCodeBlock(codeBlockInfo, text, isCodeBlockComplete, currentWidth);
						this.allRefs.push(ref);

						// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
						// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
						this._register(ref.object.onDidChangeContentHeight(() => this._onDidChangeHeight.fire()));

						const ownerMarkdownPartId = this.codeblocksPartId;
						const info: IChatCodeBlockInfo = new class implements IChatCodeBlockInfo {
							readonly ownerMarkdownPartId = ownerMarkdownPartId;
							readonly codeBlockIndex = globalIndex;
							readonly elementId = element.id;
							readonly chatSessionResource = element.sessionResource;
							readonly languageId = languageId;
							readonly editDeltaInfo = EditDeltaInfo.fromText(text);
							codemapperUri = undefined; // will be set async
							get uri() {
								// here we must do a getter because the ref.object is rendered
								// async and the uri might be undefined when it's read immediately
								return ref.object.uri;
							}
							readonly uriPromise = textModel?.then(model => model.uri) ?? Promise.resolve(undefined);
							focus() {
								ref.object.focus();
							}
						}();
						this.codeblocks.push(info);
						orderedDisposablesList.push(ref);
						return ref.object.element;
					} else {
						const requestId = isRequestVM(element) ? element.id : element.requestId;
						const ref = this.renderCodeBlockPill(element.sessionResource, requestId, inUndoStop, codeBlockInfo.codemapperUri, this.markdown.fromSubagent);
						if (isResponseVM(codeBlockInfo.element)) {
							// TODO@joyceerhl: remove this code when we change the codeblockUri API to make the URI available synchronously
							this.codeBlockModelCollection.update(codeBlockInfo.element.sessionResource, codeBlockInfo.element, codeBlockInfo.codeBlockIndex, { text, languageId: codeBlockInfo.languageId, isComplete: isCodeBlockComplete }).then((e) => {
								// Update the existing object's codemapperUri
								this.codeblocks[codeBlockInfo.codeBlockPartIndex].codemapperUri = e.codemapperUri;
								this._onDidChangeHeight.fire();
							});
						}
						this.allRefs.push(ref);
						const ownerMarkdownPartId = this.codeblocksPartId;
						const info: IChatCodeBlockInfo = new class implements IChatCodeBlockInfo {
							readonly ownerMarkdownPartId = ownerMarkdownPartId;
							readonly codeBlockIndex = globalIndex;
							readonly elementId = element.id;
							readonly codemapperUri = codeblockEntry?.codemapperUri;
							readonly chatSessionResource = element.sessionResource;
							get uri() {
								return undefined;
							}
							readonly uriPromise = Promise.resolve(undefined);
							focus() {
								return ref.object.element.focus();
							}
							readonly languageId = languageId;
							readonly editDeltaInfo = EditDeltaInfo.fromText(text);
						}();
						this.codeblocks.push(info);
						orderedDisposablesList.push(ref);
						return ref.object.element;
					}
				},
				asyncRenderCallback: () => this._onDidChangeHeight.fire(),
				markedOptions: markedOpts,
				markedExtensions,
				...markdownRenderOptions,
			}, this.domNode));

			// Ideally this would happen earlier, but we need to parse the markdown.
			if (isResponseVM(element) && !element.model.codeBlockInfos && element.model.isComplete) {
				element.model.initializeCodeBlockInfos(this.codeblocks.map(info => {
					return {
						suggestionId: this.aiEditTelemetryService.createSuggestionId({
							presentation: 'codeBlock',
							feature: 'sideBarChat',
							editDeltaInfo: info.editDeltaInfo,
							languageId: info.languageId,
							modeId: element.model.request?.modeInfo?.modeId,
							modelId: element.model.request?.modelId,
							applyCodeBlockSuggestionId: undefined,
							source: undefined,
						})
					};
				}));
			}

			const markdownDecorationsRenderer = instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
			this._register(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(markdown, result.element));

			const layoutParticipants = new Lazy(() => {
				const observer = new ResizeObserver(() => this.mathLayoutParticipants.forEach(layout => layout()));
				observer.observe(this.domNode);
				this._register(toDisposable(() => observer.disconnect()));
				return this.mathLayoutParticipants;
			});

			// Make katex blocks horizontally scrollable
			// eslint-disable-next-line no-restricted-syntax
			for (const katexBlock of this.domNode.querySelectorAll('.katex-display')) {
				if (!dom.isHTMLElement(katexBlock)) {
					continue;
				}

				const scrollable = new DomScrollableElement(katexBlock.cloneNode(true) as HTMLElement, {
					vertical: ScrollbarVisibility.Hidden,
					horizontal: ScrollbarVisibility.Auto,
				});
				orderedDisposablesList.push(scrollable);
				katexBlock.replaceWith(scrollable.getDomNode());

				layoutParticipants.value.add(() => { scrollable.scanDomNode(); });
				scrollable.scanDomNode();
			}

			orderedDisposablesList.reverse().forEach(d => this._register(d));
		};

		if (enableMath && !MarkedKatexSupport.getExtension(dom.getWindow(context.container))) {
			// Need to load async
			MarkedKatexSupport.loadExtension(dom.getWindow(context.container))
				.catch(e => {
					console.error('Failed to load MarkedKatexSupport extension:', e);
				}).finally(() => {
					doRenderMarkdown();
					if (!this._store.isDisposed) {
						this._onDidChangeHeight.fire();
					}
				});
		} else {
			doRenderMarkdown();
		}
	}

	private renderCodeBlockPill(sessionResource: URI, requestId: string, inUndoStop: string | undefined, codemapperUri: URI | undefined, fromSubagent?: boolean): IDisposableReference<CollapsedCodeBlock> {
		const codeBlock = this.instantiationService.createInstance(CollapsedCodeBlock, sessionResource, requestId, inUndoStop);
		if (codemapperUri) {
			codeBlock.render(codemapperUri, fromSubagent);
		}
		return {
			object: codeBlock,
			isStale: () => false,
			dispose: () => codeBlock.dispose()
		};
	}

	private renderCodeBlock(data: ICodeBlockData, text: string, isComplete: boolean, currentWidth: number): IDisposableReference<CodeBlockPart> {
		const ref = this.editorPool.get();
		const editorInfo = ref.object;
		if (isResponseVM(data.element)) {
			this.codeBlockModelCollection.update(data.element.sessionResource, data.element, data.codeBlockIndex, { text, languageId: data.languageId, isComplete }).then((e) => {
				// Update the existing object's codemapperUri
				this.codeblocks[data.codeBlockPartIndex].codemapperUri = e.codemapperUri;
				this._onDidChangeHeight.fire();
			});
		}

		editorInfo.render(data, currentWidth);

		return ref;
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'markdownContent' && !!(other.content.value === this.markdown.content.value
			|| this.codeblocks.at(-1)?.codemapperUri !== undefined && other.content.value.lastIndexOf('```') === this.markdown.content.value.lastIndexOf('```'));
	}

	layout(width: number): void {
		this.allRefs.forEach((ref, index) => {
			if (ref.object instanceof CodeBlockPart) {
				ref.object.layout(width);
			} else if (ref.object instanceof CollapsedCodeBlock) {
				const codeblockModel = this.codeblocks[index];
				if (codeblockModel.codemapperUri && ref.object.uri?.toString() !== codeblockModel.codemapperUri.toString()) {
					ref.object.render(codeblockModel.codemapperUri);
				}
			}
		});

		this.mathLayoutParticipants.forEach(layout => layout());
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

export class EditorPool extends Disposable {

	private readonly _pool: ResourcePool<CodeBlockPart>;

	inUse(): Iterable<CodeBlockPart> {
		return this._pool.inUse;
	}

	constructor(
		options: ChatEditorOptions,
		delegate: IChatRendererDelegate,
		overflowWidgetsDomNode: HTMLElement | undefined,
		private readonly isSimpleWidget: boolean = false,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => {
			return instantiationService.createInstance(CodeBlockPart, options, MenuId.ChatCodeBlock, delegate, overflowWidgetsDomNode, this.isSimpleWidget);
		}));
	}

	get(): IDisposableReference<CodeBlockPart> {
		const codeBlock = this._pool.get();
		let stale = false;
		return {
			object: codeBlock,
			isStale: () => stale,
			dispose: () => {
				codeBlock.reset();
				stale = true;
				this._pool.release(codeBlock);
			}
		};
	}
}

export function codeblockHasClosingBackticks(str: string): boolean {
	str = str.trim();
	return !!str.match(/\n```+$/);
}

export class CollapsedCodeBlock extends Disposable {

	readonly element: HTMLElement;

	private _uri: URI | undefined;
	get uri(): URI | undefined { return this._uri; }

	private readonly hover = this._register(new MutableDisposable());
	private tooltip: string | undefined;

	private currentDiff: IEditSessionEntryDiff | undefined;

	private readonly progressStore = this._store.add(new DisposableStore());

	constructor(
		private readonly sessionResource: URI,
		private readonly requestId: string,
		private readonly inUndoStop: string | undefined,
		@ILabelService private readonly labelService: ILabelService,
		@IEditorService private readonly editorService: IEditorService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();

		this.element = $('.chat-codeblock-pill-widget');
		this.element.tabIndex = 0;
		this.element.classList.add('show-file-icons');
		this.element.role = 'button';

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(registerOpenEditorListeners(this.element, e => this.showDiff(e)));

		this._register(dom.addDisposableListener(this.element, dom.EventType.CONTEXT_MENU, e => {
			const event = new StandardMouseEvent(dom.getWindow(e), e);
			dom.EventHelper.stop(e, true);

			this.contextMenuService.showContextMenu({
				contextKeyService: this.contextKeyService,
				getAnchor: () => event,
				getActions: () => {
					if (!this.uri) {
						return [];
					}

					const menu = this.menuService.getMenuActions(MenuId.ChatEditingCodeBlockContext, this.contextKeyService, {
						arg: {
							sessionResource: this.sessionResource,
							requestId: this.requestId,
							uri: this.uri,
							stopId: this.inUndoStop
						} satisfies ChatEditingActionContext
					});

					return getFlatContextMenuActions(menu);
				},
			});
		}));
	}

	private showDiff({ editorOptions: options, openToSide }: IOpenEditorOptions): void {
		if (this.currentDiff) {
			this.editorService.openEditor({
				original: { resource: this.currentDiff.originalURI },
				modified: { resource: this.currentDiff.modifiedURI },
				options
			}, openToSide ? SIDE_GROUP : undefined);
		} else if (this.uri) {
			this.editorService.openEditor({ resource: this.uri, options }, openToSide ? SIDE_GROUP : undefined);
		}
	}

	/**
	 * @param uri URI of the file on-disk being changed
	 * @param isStreaming Whether the edit has completed (at the time of this being rendered)
	 */
	render(uri: URI, fromSubagent?: boolean): void {
		this.element.classList.toggle('from-sub-agent', !!fromSubagent);

		this.progressStore.clear();

		this._uri = uri;

		const session = this.chatService.getSession(this.sessionResource);
		const iconText = this.labelService.getUriBasenameLabel(uri);

		const iconEl = dom.$('span.icon');
		const children = [dom.$('span.icon-label', {}, iconText)];
		const labelDetail = dom.$('span.label-detail', {}, '');
		children.push(labelDetail);

		this.element.replaceChildren(iconEl, ...children);
		this.updateTooltip(this.labelService.getUriLabel(uri, { relative: false }));

		const editSessionObservable = session?.editingSessionObs?.promiseResult.map(r => r?.data) || observableValue(this, undefined);
		const editSessionEntry = editSessionObservable.map((es, r) => es?.readEntry(uri, r));

		const diffObservable = derived(reader => {
			const entry = editSessionEntry.read(reader);
			const editSession = entry && editSessionObservable.read(reader);
			return entry && editSession && editSession.getEntryDiffBetweenStops(entry.modifiedURI, this.requestId, this.inUndoStop);
		}).map((d, r) => d?.read(r));

		const isStreaming = derived(r => {
			const entry = editSessionEntry.read(r);
			const currentlyModified = entry?.isCurrentlyBeingModifiedBy.read(r);
			return !!currentlyModified && currentlyModified.responseModel.requestId === this.requestId && currentlyModified.undoStopId === this.inUndoStop;
		});

		// Set the icon/classes while edits are streaming
		let iconClasses: string[] = [];
		this.progressStore.add(autorun(r => {
			iconEl.classList.remove(...iconClasses);
			if (isStreaming.read(r)) {
				const codicon = ThemeIcon.modify(Codicon.loading, 'spin');
				iconClasses = ThemeIcon.asClassNameArray(codicon);
			} else {
				iconEl.classList.remove(...iconClasses);
				const fileKind = uri.path.endsWith('/') ? FileKind.FOLDER : FileKind.FILE;
				iconEl.classList.add(...getIconClasses(this.modelService, this.languageService, uri, fileKind));
			}
		}));

		// Set the label detail for streaming progress
		this.progressStore.add(autorun(r => {
			if (isStreaming.read(r)) {
				const entry = editSessionEntry.read(r);
				const rwRatio = Math.floor((entry?.rewriteRatio.read(r) || 0) * 100);
				labelDetail.textContent = rwRatio === 0 || !rwRatio ? localize('chat.codeblock.generating', "Generating edits...") : localize('chat.codeblock.applyingPercentage', "Applying edits ({0}%)...", rwRatio);
			} else {
				labelDetail.textContent = '';
			}
		}));

		// Render the +/- diff
		this.progressStore.add(autorunSelfDisposable(r => {
			const changes = diffObservable.read(r);
			if (changes === undefined) {
				return;
			}

			// eslint-disable-next-line no-restricted-syntax
			const labelAdded = this.element.querySelector('.label-added') ?? this.element.appendChild(dom.$('span.label-added'));
			// eslint-disable-next-line no-restricted-syntax
			const labelRemoved = this.element.querySelector('.label-removed') ?? this.element.appendChild(dom.$('span.label-removed'));
			if (changes && !changes?.identical && !changes?.quitEarly) {
				this.currentDiff = changes;
				labelAdded.textContent = `+${changes.added}`;
				labelRemoved.textContent = `-${changes.removed}`;
				const insertionsFragment = changes.added === 1 ? localize('chat.codeblock.insertions.one', "1 insertion") : localize('chat.codeblock.insertions', "{0} insertions", changes.added);
				const deletionsFragment = changes.removed === 1 ? localize('chat.codeblock.deletions.one', "1 deletion") : localize('chat.codeblock.deletions', "{0} deletions", changes.removed);
				const summary = localize('summary', 'Edited {0}, {1}, {2}', iconText, insertionsFragment, deletionsFragment);
				this.element.ariaLabel = summary;
				this.updateTooltip(summary);

				// No need to keep updating once we get the diff info
				if (changes.isFinal) {
					r.dispose();
				}
			}
		}));
	}

	private updateTooltip(tooltip: string): void {
		this.tooltip = tooltip;

		if (!this.hover.value) {
			this.hover.value = this.hoverService.setupDelayedHover(this.element, () => ({
				content: this.tooltip!,
				style: HoverStyle.Pointer,
				position: { hoverPosition: HoverPosition.BELOW },
				persistence: { hideOnKeyDown: true },
			}));
		}
	}
}
