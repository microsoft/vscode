/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createAndFillInContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IMarkdownVulnerability } from '../../common/annotations.js';
import { IChatProgressRenderableResponseContent } from '../../common/chatModel.js';
import { IChatMarkdownContent } from '../../common/chatService.js';
import { isRequestVM, isResponseVM } from '../../common/chatViewModel.js';
import { CodeBlockModelCollection } from '../../common/codeBlockModelCollection.js';
import { IChatCodeBlockInfo, IChatListItemRendererOptions } from '../chat.js';
import { IChatRendererDelegate } from '../chatListRenderer.js';
import { ChatMarkdownDecorationsRenderer } from '../chatMarkdownDecorationsRenderer.js';
import { ChatEditorOptions } from '../chatOptions.js';
import { CodeBlockPart, ICodeBlockData, localFileLanguageId, parseLocalFileData } from '../codeBlockPart.js';
import '../media/chatCodeBlockPill.css';
import { IDisposableReference, ResourcePool } from './chatCollections.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

const $ = dom.$;

export class ChatMarkdownContentPart extends Disposable implements IChatContentPart {
	private static idPool = 0;
	public readonly id = String(++ChatMarkdownContentPart.idPool);
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
		private readonly rendererOptions: IChatListItemRendererOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const element = context.element;

		// We release editors in order so that it's more likely that the same editor will be assigned if this element is re-rendered right away, like it often is during progressive rendering
		const orderedDisposablesList: IDisposable[] = [];
		let codeBlockIndex = codeBlockStartIndex;
		const result = this._register(renderer.render(markdown.content, {
			fillInIncompleteTokens,
			codeBlockRendererSync: (languageId, text, raw) => {
				const isCodeBlockComplete = !isResponseVM(context.element) || context.element.isComplete || !raw || raw?.endsWith('```');
				if ((!text || (text.startsWith('<vscode_codeblock_uri>') && !text.includes('\n'))) && !isCodeBlockComplete && rendererOptions.renderCodeBlockPills) {
					const hideEmptyCodeblock = $('div');
					hideEmptyCodeblock.style.display = 'none';
					return hideEmptyCodeblock;
				}
				const index = codeBlockIndex++;
				let textModel: Promise<IResolvedTextEditorModel>;
				let range: Range | undefined;
				let vulns: readonly IMarkdownVulnerability[] | undefined;
				let codemapperUri: URI | undefined;
				if (equalsIgnoreCase(languageId, localFileLanguageId)) {
					try {
						const parsedBody = parseLocalFileData(text);
						range = parsedBody.range && Range.lift(parsedBody.range);
						textModel = this.textModelService.createModelReference(parsedBody.uri).then(ref => ref.object);
					} catch (e) {
						return $('div');
					}
				} else {
					const sessionId = isResponseVM(element) || isRequestVM(element) ? element.sessionId : '';
					const modelEntry = this.codeBlockModelCollection.getOrCreate(sessionId, element, index);
					const fastUpdateModelEntry = this.codeBlockModelCollection.updateSync(sessionId, element, index, { text, languageId });
					vulns = modelEntry.vulns;
					codemapperUri = fastUpdateModelEntry.codemapperUri;
					textModel = modelEntry.model;
				}

				const hideToolbar = isResponseVM(element) && element.errorDetails?.responseIsFiltered;
				const codeBlockInfo = { languageId, textModel, codeBlockIndex: index, element, range, hideToolbar, parentContextKeyService: contextKeyService, vulns, codemapperUri };

				if (!rendererOptions.renderCodeBlockPills || element.isCompleteAddedRequest || !codemapperUri) {
					const ref = this.renderCodeBlock(codeBlockInfo, text, currentWidth, rendererOptions.editableCodeBlock);
					this.allRefs.push(ref);

					// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
					// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
					this._register(ref.object.onDidChangeContentHeight(() => this._onDidChangeHeight.fire()));

					const ownerMarkdownPartId = this.id;
					const info: IChatCodeBlockInfo = new class {
						readonly ownerMarkdownPartId = ownerMarkdownPartId;
						readonly codeBlockIndex = index;
						readonly element = element;
						readonly isStreaming = !rendererOptions.renderCodeBlockPills;
						codemapperUri = undefined; // will be set async
						public get uri() {
							// here we must do a getter because the ref.object is rendered
							// async and the uri might be undefined when it's read immediately
							return ref.object.uri;
						}
						public focus() {
							ref.object.focus();
						}
						public getContent(): string {
							return ref.object.editor.getValue();
						}
					}();
					this.codeblocks.push(info);
					orderedDisposablesList.push(ref);
					return ref.object.element;
				} else {
					const requestId = isRequestVM(element) ? element.id : element.requestId;
					const isStreaming = isResponseVM(element) ? !element.isComplete : !isCodeBlockComplete;
					const ref = this.renderCodeBlockPill(element.sessionId, requestId, codeBlockInfo.codemapperUri, !isStreaming);
					if (isResponseVM(codeBlockInfo.element)) {
						// TODO@joyceerhl: remove this code when we change the codeblockUri API to make the URI available synchronously
						this.codeBlockModelCollection.update(codeBlockInfo.element.sessionId, codeBlockInfo.element, codeBlockInfo.codeBlockIndex, { text, languageId: codeBlockInfo.languageId }).then((e) => {
							// Update the existing object's codemapperUri
							this.codeblocks[codeBlockInfo.codeBlockIndex].codemapperUri = e.codemapperUri;
							this._onDidChangeHeight.fire();
						});
					}
					this.allRefs.push(ref);
					const ownerMarkdownPartId = this.id;
					const info: IChatCodeBlockInfo = new class {
						readonly ownerMarkdownPartId = ownerMarkdownPartId;
						readonly codeBlockIndex = index;
						readonly element = element;
						readonly isStreaming = isStreaming;
						readonly codemapperUri = codemapperUri;
						public get uri() {
							return undefined;
						}
						public focus() {
							return ref.object.element.focus();
						}
						public getContent(): string {
							return ''; // Not needed for collapsed code blocks
						}
					}();
					this.codeblocks.push(info);
					orderedDisposablesList.push(ref);
					return ref.object.element;
				}
			},
			asyncRenderCallback: () => this._onDidChangeHeight.fire(),
		}));

		const markdownDecorationsRenderer = instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
		this._register(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(markdown, result.element));

		orderedDisposablesList.reverse().forEach(d => this._register(d));
		this.domNode = result.element;
	}

	private renderCodeBlockPill(sessionId: string, requestId: string, codemapperUri: URI | undefined, isCodeBlockComplete?: boolean): IDisposableReference<CollapsedCodeBlock> {
		const codeBlock = this.instantiationService.createInstance(CollapsedCodeBlock, sessionId, requestId);
		if (codemapperUri) {
			codeBlock.render(codemapperUri, !isCodeBlockComplete);
		}
		return {
			object: codeBlock,
			isStale: () => false,
			dispose: () => codeBlock.dispose()
		};
	}

	private renderCodeBlock(data: ICodeBlockData, text: string, currentWidth: number, editableCodeBlock: boolean | undefined): IDisposableReference<CodeBlockPart> {
		const ref = this.editorPool.get();
		const editorInfo = ref.object;
		if (isResponseVM(data.element)) {
			this.codeBlockModelCollection.update(data.element.sessionId, data.element, data.codeBlockIndex, { text, languageId: data.languageId }).then((e) => {
				// Update the existing object's codemapperUri
				this.codeblocks[data.codeBlockIndex].codemapperUri = e.codemapperUri;
				this._onDidChangeHeight.fire();
			});
		}

		editorInfo.render(data, currentWidth, editableCodeBlock);

		return ref;
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'markdownContent' && !!(other.content.value === this.markdown.content.value
			|| this.rendererOptions.renderCodeBlockPills && this.codeblocks.at(-1)?.isStreaming && this.codeblocks.at(-1)?.codemapperUri !== undefined && other.content.value.lastIndexOf('```') === this.markdown.content.value.lastIndexOf('```'));
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

class CollapsedCodeBlock extends Disposable {

	public readonly element: HTMLElement;

	private _uri: URI | undefined;
	public get uri(): URI | undefined {
		return this._uri;
	}

	private isStreaming: boolean | undefined;

	constructor(
		sessionId: string,
		requestId: string,
		@ILabelService private readonly labelService: ILabelService,
		@IEditorService private readonly editorService: IEditorService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		super();
		this.element = $('.chat-codeblock-pill-widget');
		this.element.classList.add('show-file-icons');
		this._register(dom.addDisposableListener(this.element, 'click', async () => {
			if (this.uri) {
				this.editorService.openEditor({ resource: this.uri });
			}
		}));
		this._register(dom.addDisposableListener(this.element, dom.EventType.CONTEXT_MENU, domEvent => {
			const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
			dom.EventHelper.stop(domEvent, true);

			this.contextMenuService.showContextMenu({
				contextKeyService: this.contextKeyService,
				getAnchor: () => event,
				getActions: () => {
					const menu = this.menuService.getMenuActions(MenuId.ChatEditingCodeBlockContext, this.contextKeyService, { arg: { sessionId, requestId, uri: this.uri } });
					const primary: IAction[] = [];
					createAndFillInContextMenuActions(menu, primary);
					return primary;
				},
			});
		}));
	}

	render(uri: URI, isStreaming?: boolean) {
		if (this.uri?.toString() === uri.toString() && this.isStreaming === isStreaming) {
			return;
		}

		this._uri = uri;
		this.isStreaming = isStreaming;

		const iconText = this.labelService.getUriBasenameLabel(uri);

		let iconClasses: string[] = [];
		if (isStreaming) {
			const codicon = ThemeIcon.modify(Codicon.loading, 'spin');
			iconClasses = ThemeIcon.asClassNameArray(codicon);
		} else {
			const fileKind = uri.path.endsWith('/') ? FileKind.FOLDER : FileKind.FILE;
			iconClasses = getIconClasses(this.modelService, this.languageService, uri, fileKind);
		}

		const iconEl = dom.$('span.icon');
		iconEl.classList.add(...iconClasses);
		this.element.replaceChildren(iconEl, dom.$('span.icon-label', {}, iconText));
	}
}
