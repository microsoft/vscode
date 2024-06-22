/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { Range } from 'vs/editor/common/core/range';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatCodeBlockInfo, IChatListItemRendererOptions } from 'vs/workbench/contrib/chat/browser/chat';
import { IDisposableReference, ResourcePool } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatCollections';
import { IChatContentPart, IChatContentPartRenderContext } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatContentParts';
import { IChatRendererDelegate } from 'vs/workbench/contrib/chat/browser/chatListRenderer';
import { ChatMarkdownDecorationsRenderer } from 'vs/workbench/contrib/chat/browser/chatMarkdownDecorationsRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { CodeBlockPart, ICodeBlockData, localFileLanguageId, parseLocalFileData } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { IMarkdownVulnerability } from 'vs/workbench/contrib/chat/common/annotations';
import { IChatProgressRenderableResponseContent } from 'vs/workbench/contrib/chat/common/chatModel';
import { isRequestVM, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { CodeBlockModelCollection } from 'vs/workbench/contrib/chat/common/codeBlockModelCollection';

const $ = dom.$;

export class ChatMarkdownContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	private readonly allRefs: IDisposableReference<CodeBlockPart>[] = [];

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		private readonly markdown: IMarkdownString,
		context: IChatContentPartRenderContext,
		private readonly editorPool: EditorPool,
		fillInIncompleteTokens = false,
		codeBlockStartIndex = 0,
		renderer: MarkdownRenderer,
		currentWidth: number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		rendererOptions: IChatListItemRendererOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const element = context.element;
		const markdownDecorationsRenderer = instantiationService.createInstance(ChatMarkdownDecorationsRenderer);

		// We release editors in order so that it's more likely that the same editor will be assigned if this element is re-rendered right away, like it often is during progressive rendering
		const orderedDisposablesList: IDisposable[] = [];
		let codeBlockIndex = codeBlockStartIndex;
		const result = this._register(renderer.render(markdown, {
			fillInIncompleteTokens,
			codeBlockRendererSync: (languageId, text) => {
				const index = codeBlockIndex++;
				let textModel: Promise<IResolvedTextEditorModel>;
				let range: Range | undefined;
				let vulns: readonly IMarkdownVulnerability[] | undefined;
				if (equalsIgnoreCase(languageId, localFileLanguageId)) {
					try {
						const parsedBody = parseLocalFileData(text);
						range = parsedBody.range && Range.lift(parsedBody.range);
						textModel = this.textModelService.createModelReference(parsedBody.uri).then(ref => ref.object);
					} catch (e) {
						return $('div');
					}
				} else {
					if (!isRequestVM(element) && !isResponseVM(element)) {
						console.error('Trying to render code block in welcome', element.id, index);
						return $('div');
					}

					const sessionId = isResponseVM(element) || isRequestVM(element) ? element.sessionId : '';
					const modelEntry = this.codeBlockModelCollection.getOrCreate(sessionId, element, index);
					vulns = modelEntry.vulns;
					textModel = modelEntry.model;
				}

				const hideToolbar = isResponseVM(element) && element.errorDetails?.responseIsFiltered;
				const ref = this.renderCodeBlock({ languageId, textModel, codeBlockIndex: index, element, range, hideToolbar, parentContextKeyService: contextKeyService, vulns }, text, currentWidth, rendererOptions.editableCodeBlock);
				this.allRefs.push(ref);

				// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
				// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
				this._register(ref.object.onDidChangeContentHeight(() => this._onDidChangeHeight.fire()));

				const info: IChatCodeBlockInfo = {
					codeBlockIndex: index,
					element,
					focus() {
						ref.object.focus();
					},
					uri: ref.object.uri
				};
				this.codeblocks.push(info);
				orderedDisposablesList.push(ref);
				return ref.object.element;
			},
			asyncRenderCallback: () => this._onDidChangeHeight.fire(),
		}));

		this._register(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(result.element));

		orderedDisposablesList.reverse().forEach(d => this._register(d));
		this.domNode = result.element;
	}

	private renderCodeBlock(data: ICodeBlockData, text: string, currentWidth: number, editableCodeBlock: boolean | undefined): IDisposableReference<CodeBlockPart> {
		const ref = this.editorPool.get();
		const editorInfo = ref.object;
		if (isResponseVM(data.element)) {
			this.codeBlockModelCollection.update(data.element.sessionId, data.element, data.codeBlockIndex, { text, languageId: data.languageId });
		}

		editorInfo.render(data, currentWidth, editableCodeBlock);

		return ref;
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'markdownContent' && other.content.value === this.markdown.value;
	}

	layout(width: number): void {
		this.allRefs.forEach(ref => ref.object.layout(width));
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
