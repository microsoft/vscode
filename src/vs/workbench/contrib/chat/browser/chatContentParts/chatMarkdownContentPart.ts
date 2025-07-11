/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { MarkedOptions } from '../../../../../base/browser/markdownRenderer.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
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
import { IEditorService } from '../../../../services/editor/common/editorService.js';
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
import { ChatEditorOptions } from '../chatOptions.js';
import { CodeBlockPart, ICodeBlockData, ICodeBlockRenderOptions, localFileLanguageId, parseLocalFileData } from '../codeBlockPart.js';
import '../media/chatCodeBlockPill.css';
import { IDisposableReference, ResourcePool } from './chatCollections.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatExtensionsContentPart } from './chatExtensionsContentPart.js';
import './media/chatMarkdownPart.css';

const $ = dom.$;

export interface IChatMarkdownContentPartOptions {
	readonly codeBlockRenderOptions?: ICodeBlockRenderOptions;
}

export class ChatMarkdownContentPart extends Disposable implements IChatContentPart {
	private static idPool = 0;

	public readonly codeblocksPartId = String(++ChatMarkdownContentPart.idPool);
	public readonly domNode: HTMLElement;
	private readonly allRefs: IDisposableReference<CodeBlockPart | CollapsedCodeBlock>[] = [];

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		private readonly markdown: IChatMarkdownContent,
		context: IChatContentPartRenderContext,
		private readonly editorPool: EditorPool,
		fillInIncompleteTokens = false,
		codeBlockStartIndex = 0,
		renderer: MarkdownRenderer,
		currentWidth: number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly rendererOptions: IChatMarkdownContentPartOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const element = context.element;
		const inUndoStop = (findLast(context.content, e => e.kind === 'undoStop', context.contentIndex) as IChatUndoStop | undefined)?.id;

		// We release editors in order so that it's more likely that the same editor will be assigned if this element is re-rendered right away, like it often is during progressive rendering
		const orderedDisposablesList: IDisposable[] = [];

		// Need to track the index of the codeblock within the response so it can have a unique ID,
		// and within this part to find it within the codeblocks array
		let globalCodeBlockIndexStart = codeBlockStartIndex;
		let thisPartCodeBlockIndexStart = 0;

		this.domNode = document.createElement('div');
		this.domNode.classList.add('chat-markdown-part', 'rendered-markdown');

		const enableMath = configurationService.getValue<boolean>(ChatConfiguration.EnableMath);

		const doRenderMarkdown = () => {
			const markedExtensions = enableMath
				? coalesce([MarkedKatexSupport.getExtension(dom.getWindow(context.container), {
					throwOnError: false
				})])
				: [];

			// Don't set to 'false' for responses, respect defaults
			const markedOpts: MarkedOptions = isRequestVM(element) ? {
				gfm: true,
				breaks: true,
				markedExtensions,
			} : {
				markedExtensions,
			};

			const result = this._register(renderer.render(markdown.content, {
				sanitizerOptions: MarkedKatexSupport.getSanitizerOptions(),
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
					let textModel: Promise<ITextModel>;
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
						const sessionId = isResponseVM(element) || isRequestVM(element) ? element.sessionId : '';
						const modelEntry = this.codeBlockModelCollection.getOrCreate(sessionId, element, globalIndex);
						const fastUpdateModelEntry = this.codeBlockModelCollection.updateSync(sessionId, element, globalIndex, { text, languageId, isComplete: isCodeBlockComplete });
						vulns = modelEntry.vulns;
						codeblockEntry = fastUpdateModelEntry;
						textModel = modelEntry.model;
					}

					const hideToolbar = isResponseVM(element) && element.errorDetails?.responseIsFiltered;
					const renderOptions = {
						...this.rendererOptions.codeBlockRenderOptions,
					};
					if (hideToolbar !== undefined) {
						renderOptions.hideToolbar = hideToolbar;
					}
					const codeBlockInfo: ICodeBlockData = { languageId, textModel, codeBlockIndex: globalIndex, codeBlockPartIndex: thisPartIndex, element, range, parentContextKeyService: contextKeyService, vulns, codemapperUri: codeblockEntry?.codemapperUri, renderOptions, chatSessionId: element.sessionId };

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
							readonly isStreaming = false;
							readonly chatSessionId = element.sessionId;
							codemapperUri = undefined; // will be set async
							public get uri() {
								// here we must do a getter because the ref.object is rendered
								// async and the uri might be undefined when it's read immediately
								return ref.object.uri;
							}
							readonly uriPromise = textModel.then(model => model.uri);
							public focus() {
								ref.object.focus();
							}
						}();
						this.codeblocks.push(info);
						orderedDisposablesList.push(ref);
						return ref.object.element;
					} else {
						const requestId = isRequestVM(element) ? element.id : element.requestId;
						const ref = this.renderCodeBlockPill(element.sessionId, requestId, inUndoStop, codeBlockInfo.codemapperUri, !isCodeBlockComplete);
						if (isResponseVM(codeBlockInfo.element)) {
							// TODO@joyceerhl: remove this code when we change the codeblockUri API to make the URI available synchronously
							this.codeBlockModelCollection.update(codeBlockInfo.element.sessionId, codeBlockInfo.element, codeBlockInfo.codeBlockIndex, { text, languageId: codeBlockInfo.languageId, isComplete: isCodeBlockComplete }).then((e) => {
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
							readonly isStreaming = !isCodeBlockComplete;
							readonly codemapperUri = codeblockEntry?.codemapperUri;
							readonly chatSessionId = element.sessionId;
							public get uri() {
								return undefined;
							}
							readonly uriPromise = Promise.resolve(undefined);
							public focus() {
								return ref.object.element.focus();
							}
						}();
						this.codeblocks.push(info);
						orderedDisposablesList.push(ref);
						return ref.object.element;
					}
				},
				asyncRenderCallback: () => this._onDidChangeHeight.fire(),
			}, markedOpts));

			const markdownDecorationsRenderer = instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
			this._register(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(markdown, result.element));

			orderedDisposablesList.reverse().forEach(d => this._register(d));

			this.domNode.replaceChildren(...result.element.children);
		};

		if (enableMath && !MarkedKatexSupport.getExtension(dom.getWindow(context.container))) {
			// Need to load async
			MarkedKatexSupport.loadExtension(dom.getWindow(context.container)).then(() => {
				doRenderMarkdown();
			});
		} else {
			doRenderMarkdown();
		}
	}

	private renderCodeBlockPill(sessionId: string, requestId: string, inUndoStop: string | undefined, codemapperUri: URI | undefined, isStreaming: boolean): IDisposableReference<CollapsedCodeBlock> {
		const codeBlock = this.instantiationService.createInstance(CollapsedCodeBlock, sessionId, requestId, inUndoStop);
		if (codemapperUri) {
			codeBlock.render(codemapperUri, isStreaming);
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
			this.codeBlockModelCollection.update(data.element.sessionId, data.element, data.codeBlockIndex, { text, languageId: data.languageId, isComplete }).then((e) => {
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
			|| this.codeblocks.at(-1)?.isStreaming && this.codeblocks.at(-1)?.codemapperUri !== undefined && other.content.value.lastIndexOf('```') === this.markdown.content.value.lastIndexOf('```'));
	}

	layout(width: number): void {
		this.allRefs.forEach((ref, index) => {
			if (ref.object instanceof CodeBlockPart) {
				ref.object.layout(width);
			} else if (ref.object instanceof CollapsedCodeBlock) {
				const codeblockModel = this.codeblocks[index];
				if (codeblockModel.codemapperUri && ref.object.uri?.toString() !== codeblockModel.codemapperUri.toString()) {
					ref.object.render(codeblockModel.codemapperUri, codeblockModel.isStreaming);
				}
			}
		});
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

export class EditorPool extends Disposable {

	private readonly _pool: ResourcePool<CodeBlockPart>;

	public inUse(): Iterable<CodeBlockPart> {
		return this._pool.inUse;
	}

	constructor(
		options: ChatEditorOptions,
		delegate: IChatRendererDelegate,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => {
			return instantiationService.createInstance(CodeBlockPart, options, MenuId.ChatCodeBlock, delegate, overflowWidgetsDomNode);
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

	public readonly element: HTMLElement;

	private readonly hover = this._register(new MutableDisposable());
	private tooltip: string | undefined;

	private _uri: URI | undefined;
	public get uri(): URI | undefined {
		return this._uri;
	}

	private _currentDiff: IEditSessionEntryDiff | undefined;

	private readonly _progressStore = this._store.add(new DisposableStore());

	constructor(
		private readonly sessionId: string,
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
		this._register(dom.addDisposableListener(this.element, 'click', () => this._showDiff()));
		this._register(dom.addDisposableListener(this.element, 'keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				this._showDiff();
			}
		}));
		this._register(dom.addDisposableListener(this.element, dom.EventType.CONTEXT_MENU, domEvent => {
			const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
			dom.EventHelper.stop(domEvent, true);

			this.contextMenuService.showContextMenu({
				contextKeyService: this.contextKeyService,
				getAnchor: () => event,
				getActions: () => {
					const menu = this.menuService.getMenuActions(MenuId.ChatEditingCodeBlockContext, this.contextKeyService, { arg: { sessionId, requestId, uri: this.uri, stopId: inUndoStop } });
					return getFlatContextMenuActions(menu);
				},
			});
		}));
	}

	private _showDiff(): void {
		if (this._currentDiff) {
			this.editorService.openEditor({
				original: { resource: this._currentDiff.originalURI },
				modified: { resource: this._currentDiff.modifiedURI },
				options: { transient: true },
			});
		} else if (this.uri) {
			this.editorService.openEditor({ resource: this.uri });
		}
	}

	render(uri: URI, isStreaming?: boolean): void {
		this._progressStore.clear();

		this._uri = uri;

		const session = this.chatService.getSession(this.sessionId);
		const iconText = this.labelService.getUriBasenameLabel(uri);

		let editSession = session?.editingSessionObs?.promiseResult.get()?.data;
		let modifiedEntry = editSession?.getEntry(uri);
		let modifiedByResponse = modifiedEntry?.isCurrentlyBeingModifiedBy.get();
		const isComplete = !modifiedByResponse || modifiedByResponse.requestId !== this.requestId;

		let iconClasses: string[] = [];
		if (isStreaming || !isComplete) {
			const codicon = ThemeIcon.modify(Codicon.loading, 'spin');
			iconClasses = ThemeIcon.asClassNameArray(codicon);
		} else {
			const fileKind = uri.path.endsWith('/') ? FileKind.FOLDER : FileKind.FILE;
			iconClasses = getIconClasses(this.modelService, this.languageService, uri, fileKind);
		}

		const iconEl = dom.$('span.icon');
		iconEl.classList.add(...iconClasses);

		const children = [dom.$('span.icon-label', {}, iconText)];
		const labelDetail = dom.$('span.label-detail', {}, '');
		children.push(labelDetail);
		if (isStreaming) {
			labelDetail.textContent = localize('chat.codeblock.generating', "Generating edits...");
		}

		this.element.replaceChildren(iconEl, ...children);
		this.updateTooltip(this.labelService.getUriLabel(uri, { relative: false }));

		const renderDiff = (changes: IEditSessionEntryDiff | undefined) => {
			const labelAdded = this.element.querySelector('.label-added') ?? this.element.appendChild(dom.$('span.label-added'));
			const labelRemoved = this.element.querySelector('.label-removed') ?? this.element.appendChild(dom.$('span.label-removed'));
			if (changes && !changes?.identical && !changes?.quitEarly) {
				this._currentDiff = changes;
				labelAdded.textContent = `+${changes.added}`;
				labelRemoved.textContent = `-${changes.removed}`;
				const insertionsFragment = changes.added === 1 ? localize('chat.codeblock.insertions.one', "1 insertion") : localize('chat.codeblock.insertions', "{0} insertions", changes.added);
				const deletionsFragment = changes.removed === 1 ? localize('chat.codeblock.deletions.one', "1 deletion") : localize('chat.codeblock.deletions', "{0} deletions", changes.removed);
				const summary = localize('summary', 'Edited {0}, {1}, {2}', iconText, insertionsFragment, deletionsFragment);
				this.element.ariaLabel = summary;
				this.updateTooltip(summary);
			}
		};

		let diffBetweenStops: IObservable<IEditSessionEntryDiff | undefined> | undefined;

		// Show a percentage progress that is driven by the rewrite

		this._progressStore.add(autorun(r => {
			if (!editSession) {
				editSession = session?.editingSessionObs?.promiseResult.read(r)?.data;
				modifiedEntry = editSession?.getEntry(uri);
			}

			modifiedByResponse = modifiedEntry?.isCurrentlyBeingModifiedBy.read(r);
			let diffValue = diffBetweenStops?.read(r);
			const isComplete = !!diffValue || !modifiedByResponse || modifiedByResponse.requestId !== this.requestId;
			const rewriteRatio = modifiedEntry?.rewriteRatio.read(r);

			if (!isStreaming && !isComplete) {
				const value = rewriteRatio;
				labelDetail.textContent = value === 0 || !value ? localize('chat.codeblock.generating', "Generating edits...") : localize('chat.codeblock.applyingPercentage', "Applying edits ({0}%)...", Math.round(value * 100));
			} else if (!isStreaming && isComplete) {
				iconEl.classList.remove(...iconClasses);
				const fileKind = uri.path.endsWith('/') ? FileKind.FOLDER : FileKind.FILE;
				iconEl.classList.add(...getIconClasses(this.modelService, this.languageService, uri, fileKind));
				labelDetail.textContent = '';
			}

			if (!diffBetweenStops) {
				diffBetweenStops = modifiedEntry && editSession
					? editSession.getEntryDiffBetweenStops(modifiedEntry.modifiedURI, this.requestId, this.inUndoStop)
					: undefined;
				diffValue = diffBetweenStops?.read(r);
			}

			if (!isStreaming && isComplete) {
				renderDiff(diffValue);
			}
		}));
	}

	private updateTooltip(tooltip: string): void {
		this.tooltip = tooltip;
		if (!this.hover.value) {
			this.hover.value = this.hoverService.setupDelayedHover(this.element, () => (
				{
					content: this.tooltip!,
					appearance: { compact: true, showPointer: true },
					position: { hoverPosition: HoverPosition.BELOW },
					persistence: { hideOnKeyDown: true },
				}
			));
		}
	}
}
