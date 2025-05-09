/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { assertNever } from '../../../../../../base/common/assert.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorunWithStore } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { Location } from '../../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressMessage, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { IChatRendererContent } from '../../../common/chatViewModel.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { isToolResultInputOutputDetails, IToolResultInputOutputDetails } from '../../../common/languageModelToolsService.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../../chat.js';
import { getAttachableImageExtension } from '../../chatAttachmentResolve.js';
import { IChatContentPart, IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart, EditorPool } from '../chatMarkdownContentPart.js';
import { ChatProgressContentPart } from '../chatProgressContentPart.js';
import { ChatCollapsibleListContentPart, CollapsibleListPool, IChatCollapsibleListItem } from '../chatReferencesContentPart.js';
import { ChatCollapsibleInputOutputContentPart, IChatCollapsibleIOCodePart, IChatCollapsibleIODataPart } from '../chatToolInputOutputContentPart.js';
import { ChatTerminalMarkdownProgressPart } from './chatTerminalMarkdownProgressPart.js';
import { TerminalConfirmationWidgetSubPart } from './chatTerminalToolSubPart.js';
import { ToolConfirmationSubPart } from './chatToolConfirmationSubPart.js';

export class ChatToolInvocationPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.subPart?.codeblocks ?? [];
	}

	public get codeblocksPartId(): string | undefined {
		return this.subPart?.codeblocksPartId;
	}

	private subPart!: ChatToolInvocationSubPart | BaseChatToolInvocationSubPart;

	constructor(
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: MarkdownRenderer,
		private readonly listPool: CollapsibleListPool,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly codeBlockStartIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = dom.$('.chat-tool-invocation-part');
		if (toolInvocation.presentation === 'hidden') {
			return;
		}

		// This part is a bit different, since IChatToolInvocation is not an immutable model object. So this part is able to rerender itself.
		// If this turns out to be a typical pattern, we could come up with a more reusable pattern, like telling the list to rerender an element
		// when the model changes, or trying to make the model immutable and swap out one content part for a new one based on user actions in the view.
		const partStore = this._register(new DisposableStore());
		const render = () => {
			dom.clearNode(this.domNode);
			partStore.clear();

			this.subPart = partStore.add(this.createToolInvocationSubPart());
			this.domNode.appendChild(this.subPart.domNode);
			partStore.add(this.subPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			partStore.add(this.subPart.onNeedsRerender(() => {
				render();
				this._onDidChangeHeight.fire();
			}));
		};
		render();
	}

	createToolInvocationSubPart(): ChatToolInvocationSubPart | BaseChatToolInvocationSubPart {
		if (this.toolInvocation.kind === 'toolInvocation' && this.toolInvocation.confirmationMessages) {
			if (this.toolInvocation.toolSpecificData?.kind === 'terminal') {
				return this.instantiationService.createInstance(TerminalConfirmationWidgetSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
			} else {
				return this.instantiationService.createInstance(ToolConfirmationSubPart, this.toolInvocation, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockModelCollection, this.codeBlockStartIndex);
			}
		} else {
			if (this.toolInvocation.toolSpecificData?.kind === 'terminal') {
				return this.instantiationService.createInstance(ChatTerminalMarkdownProgressPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex, this.codeBlockModelCollection);
			} else {
				return this.instantiationService.createInstance(ChatToolInvocationSubPart, this.toolInvocation, this.context, this.renderer, this.listPool, this.editorPool, this.codeBlockStartIndex);
			}
		}
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') && this.toolInvocation.toolCallId === other.toolCallId;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

class ChatToolInvocationSubPart extends Disposable {
	private static idPool = 0;
	/** Remembers expanded tool parts on re-render */
	private static readonly _expandedByDefault = new WeakMap<IChatToolInvocation | IChatToolInvocationSerialized, boolean>();

	private readonly _codeblocksPartId = 'tool-' + (ChatToolInvocationSubPart.idPool++);

	public readonly domNode: HTMLElement;

	private _onNeedsRerender = this._register(new Emitter<void>());
	public readonly onNeedsRerender = this._onNeedsRerender.event;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private markdownPart: ChatMarkdownContentPart | undefined;
	private _codeblocks: IChatCodeBlockInfo[] = [];
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownPart?.codeblocks ?? this._codeblocks;
	}

	public get codeblocksPartId(): string {
		return this.markdownPart?.codeblocksPartId ?? this._codeblocksPartId;
	}

	constructor(
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: MarkdownRenderer,
		private readonly listPool: CollapsibleListPool,
		private readonly editorPool: EditorPool,
		private readonly codeBlockStartIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();

		if (Array.isArray(toolInvocation.resultDetails) && toolInvocation.resultDetails?.length) {
			this.domNode = this.createResultList(toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage, toolInvocation.resultDetails);
		} else if (isToolResultInputOutputDetails(toolInvocation.resultDetails)) {
			this.domNode = this.createInputOutputMarkdownProgressPart(toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage, toolInvocation.originMessage, toolInvocation.resultDetails.input, toolInvocation.resultDetails.output, !!toolInvocation.resultDetails.isError);
		} else if (toolInvocation.kind === 'toolInvocation' && toolInvocation.toolSpecificData?.kind === 'input' && !toolInvocation.isComplete) {
			this.domNode = this.createInputOutputMarkdownProgressPart(this.toolInvocation.invocationMessage, toolInvocation.originMessage, typeof toolInvocation.toolSpecificData.rawInput === 'string' ? toolInvocation.toolSpecificData.rawInput : JSON.stringify(toolInvocation.toolSpecificData.rawInput, null, 2), undefined, false);
		} else {
			this.domNode = this.createProgressPart();
		}

		if (toolInvocation.kind === 'toolInvocation' && !toolInvocation.isComplete) {
			toolInvocation.isCompletePromise.then(() => this._onNeedsRerender.fire());
		}
	}

	private createProgressPart(): HTMLElement {
		if (this.toolInvocation.isComplete && this.toolInvocation.isConfirmed !== false && this.toolInvocation.pastTenseMessage) {
			const part = this.renderProgressContent(this.toolInvocation.pastTenseMessage);
			this._register(part);
			return part.domNode;
		} else {
			const container = document.createElement('div');
			const progressObservable = this.toolInvocation.kind === 'toolInvocation' ? this.toolInvocation.progress : undefined;
			this._register(autorunWithStore((reader, store) => {
				const progress = progressObservable?.read(reader);
				const part = store.add(this.renderProgressContent(progress?.message || this.toolInvocation.invocationMessage));
				dom.reset(container, part.domNode);
			}));
			return container;
		}
	}

	private renderProgressContent(content: IMarkdownString | string) {
		if (typeof content === 'string') {
			content = new MarkdownString().appendText(content);
		}

		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content
		};

		const iconOverride = !this.toolInvocation.isConfirmed ?
			Codicon.error :
			this.toolInvocation.isComplete ?
				Codicon.check : undefined;
		return this.instantiationService.createInstance(ChatProgressContentPart, progressMessage, this.renderer, this.context, undefined, true, iconOverride);
	}

	private createInputOutputMarkdownProgressPart(message: string | IMarkdownString, subtitle: string | IMarkdownString | undefined, input: string, output: IToolResultInputOutputDetails['output'] | undefined, isError: boolean): HTMLElement {
		let codeBlockIndex = this.codeBlockStartIndex;
		const toCodePart = (data: string): IChatCollapsibleIOCodePart => {
			const model = this._register(this.modelService.createModel(
				data,
				this.languageService.createById('json'),
				undefined,
				true
			));

			return {
				kind: 'code',
				textModel: model,
				languageId: model.getLanguageId(),
				options: {
					hideToolbar: true,
					reserveWidth: 19,
					maxHeightInLines: 13,
					verticalPadding: 5,
					editorOptions: {
						wordWrap: 'on'
					}
				},
				codeBlockInfo: {
					codeBlockIndex: codeBlockIndex++,
					codemapperUri: undefined,
					elementId: this.context.element.id,
					focus: () => { },
					isStreaming: false,
					ownerMarkdownPartId: this.codeblocksPartId,
					uri: model.uri,
					chatSessionId: this.context.element.sessionId,
					uriPromise: Promise.resolve(model.uri)
				}
			};
		};

		if (typeof output === 'string') { // back compat with older stored versions
			output = [{ type: 'text', value: output }];
		}

		const collapsibleListPart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			message,
			subtitle,
			this.context,
			this.editorPool,
			toCodePart(input),
			output && {
				parts: output.map((o): IChatCollapsibleIODataPart | IChatCollapsibleIOCodePart => {
					if (o.type === 'data') {
						const decoded = decodeBase64(o.value64).buffer;
						if (getAttachableImageExtension(o.mimeType)) {
							return { kind: 'data', value: decoded, mimeType: o.mimeType };
						} else {
							return toCodePart(localize('toolResultData', "Data of type {0} ({1} bytes)", o.mimeType, decoded.byteLength));
						}
					} else if (o.type === 'text') {
						return toCodePart(o.value);
					} else {
						assertNever(o);
					}
				}),
			},
			isError,
			ChatToolInvocationSubPart._expandedByDefault.get(this.toolInvocation) ?? false,
		));
		this._codeblocks.push(...collapsibleListPart.codeblocks);
		this._register(collapsibleListPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this._register(toDisposable(() => ChatToolInvocationSubPart._expandedByDefault.set(this.toolInvocation, collapsibleListPart.expanded)));

		const progressObservable = this.toolInvocation.kind === 'toolInvocation' ? this.toolInvocation.progress : undefined;
		if (progressObservable) {
			this._register(autorunWithStore((reader, store) => {
				const progress = progressObservable?.read(reader);
				if (progress.message) {
					collapsibleListPart.title = progress.message;
				}
			}));
		}

		return collapsibleListPart.domNode;
	}

	private createResultList(
		message: string | IMarkdownString,
		toolDetails: Array<URI | Location>,
	): HTMLElement {
		const collapsibleListPart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleListContentPart,
			toolDetails.map<IChatCollapsibleListItem>(detail => ({
				kind: 'reference',
				reference: detail,
			})),
			message,
			this.context,
			this.listPool,
		));
		this._register(collapsibleListPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		return collapsibleListPart.domNode;
	}
}

export abstract class BaseChatToolInvocationSubPart extends Disposable {
	protected static idPool = 0;
	public abstract readonly domNode: HTMLElement;

	protected _onNeedsRerender = this._register(new Emitter<void>());
	public readonly onNeedsRerender = this._onNeedsRerender.event;

	protected _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public abstract codeblocks: IChatCodeBlockInfo[];

	public readonly codeblocksPartId = 'tool-' + (BaseChatToolInvocationSubPart.idPool++);
}
