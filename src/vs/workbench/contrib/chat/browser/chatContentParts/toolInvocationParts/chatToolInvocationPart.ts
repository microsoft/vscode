/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorunWithStore } from '../../../../../../base/common/observable.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressMessage, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { IChatRendererContent } from '../../../common/chatViewModel.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { isToolResultInputOutputDetails } from '../../../common/languageModelToolsService.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from '../chatContentParts.js';
import { EditorPool } from '../chatMarkdownContentPart.js';
import { ChatProgressContentPart } from '../chatProgressContentPart.js';
import { CollapsibleListPool } from '../chatReferencesContentPart.js';
import { ChatTerminalMarkdownProgressPart } from './chatTerminalMarkdownProgressPart.js';
import { TerminalConfirmationWidgetSubPart } from './chatTerminalToolSubPart.js';
import { ToolConfirmationSubPart } from './chatToolConfirmationSubPart.js';
import { ChatResultListSubPart } from './chatResultListSubPart.js';
import { ChatInputOutputMarkdownProgressPart } from './chatInputOutputMarkdownProgressPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

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
		}

		if (this.toolInvocation.toolSpecificData?.kind === 'terminal') {
			return this.instantiationService.createInstance(ChatTerminalMarkdownProgressPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex, this.codeBlockModelCollection);
		}

		if (Array.isArray(this.toolInvocation.resultDetails) && this.toolInvocation.resultDetails?.length) {
			return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, this.toolInvocation.resultDetails, this.listPool);
		}

		if (isToolResultInputOutputDetails(this.toolInvocation.resultDetails)) {
			return this.instantiationService.createInstance(
				ChatInputOutputMarkdownProgressPart,
				this.toolInvocation,
				this.context,
				this.editorPool,
				this.codeBlockStartIndex,
				this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage,
				this.toolInvocation.originMessage,
				this.toolInvocation.resultDetails.input,
				this.toolInvocation.resultDetails.output,
				!!this.toolInvocation.resultDetails.isError
			);
		}

		if (this.toolInvocation.kind === 'toolInvocation' && this.toolInvocation.toolSpecificData?.kind === 'input' && !this.toolInvocation.isComplete) {
			return this.instantiationService.createInstance(
				ChatInputOutputMarkdownProgressPart,
				this.toolInvocation,
				this.context,
				this.editorPool,
				this.codeBlockStartIndex,
				this.toolInvocation.invocationMessage,
				this.toolInvocation.originMessage,
				typeof this.toolInvocation.toolSpecificData.rawInput === 'string' ? this.toolInvocation.toolSpecificData.rawInput : JSON.stringify(this.toolInvocation.toolSpecificData.rawInput, null, 2),
				undefined,
				false
			);
		}

		return this.instantiationService.createInstance(ChatToolInvocationSubPart, this.toolInvocation, this.context, this.renderer);
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

	private readonly _codeblocksPartId = 'tool-' + (ChatToolInvocationSubPart.idPool++);

	public readonly domNode: HTMLElement;

	private _onNeedsRerender = this._register(new Emitter<void>());
	public readonly onNeedsRerender = this._onNeedsRerender.event;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _codeblocks: IChatCodeBlockInfo[] = [];
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this._codeblocks;
	}

	public get codeblocksPartId(): string {
		return this._codeblocksPartId;
	}

	constructor(
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: MarkdownRenderer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = this.createProgressPart();
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
}
