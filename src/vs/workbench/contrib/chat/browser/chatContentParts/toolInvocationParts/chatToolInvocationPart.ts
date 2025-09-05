/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { markdownCommandLink, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService.js';
import { IChatRendererContent } from '../../../common/chatViewModel.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, ToolInvocationPresentation } from '../../../common/languageModelToolsService.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from '../chatContentParts.js';
import { EditorPool } from '../chatMarkdownContentPart.js';
import { CollapsibleListPool } from '../chatReferencesContentPart.js';
import { ExtensionsInstallConfirmationWidgetSubPart } from './chatExtensionsInstallToolSubPart.js';
import { ChatInputOutputMarkdownProgressPart } from './chatInputOutputMarkdownProgressPart.js';
import { ChatResultListSubPart } from './chatResultListSubPart.js';
import { ChatTerminalToolConfirmationSubPart } from './chatTerminalToolConfirmationSubPart.js';
import { ChatTerminalToolProgressPart } from './chatTerminalToolProgressPart.js';
import { ToolConfirmationSubPart } from './chatToolConfirmationSubPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { ChatToolOutputSubPart } from './chatToolOutputPart.js';
import { ChatToolProgressSubPart } from './chatToolProgressPart.js';

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

	private subPart!: BaseChatToolInvocationSubPart;

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

			if (toolInvocation.presentation === ToolInvocationPresentation.HiddenAfterComplete && toolInvocation.isComplete) {
				return;
			}

			this.subPart = partStore.add(this.createToolInvocationSubPart());
			this.domNode.appendChild(this.subPart.domNode);
			partStore.add(this.subPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			partStore.add(this.subPart.onNeedsRerender(() => {
				render();
				this._onDidChangeHeight.fire();
			}));

			// todo@connor4312/tyriar: standardize how these are displayed
			if (!(this.subPart instanceof ChatTerminalToolProgressPart)) {
				const approval = this.createApprovalMessage();
				if (approval) {
					this.domNode.appendChild(approval);
				}
			}
		};
		render();
	}

	private get autoApproveMessageContent() {
		const reason = this.toolInvocation.isConfirmed;
		if (!reason || typeof reason === 'boolean') {
			return;
		}

		let md: string;
		switch (reason.type) {
			case ToolConfirmKind.Setting:
				md = localize('chat.autoapprove.setting', 'Auto approved by {0}', markdownCommandLink({ title: '`' + reason.id + '`', id: 'workbench.action.openSettings', arguments: [reason.id] }, false));
				break;
			case ToolConfirmKind.LmServicePerTool:
				md = reason.scope === 'session'
					? localize('chat.autoapprove.lmServicePerTool.session', 'Auto approved for this session')
					: reason.scope === 'workspace'
						? localize('chat.autoapprove.lmServicePerTool.workspace', 'Auto approved for this workspace')
						: localize('chat.autoapprove.lmServicePerTool.profile', 'Auto approved for this profile');
				md += ' (' + markdownCommandLink({ title: localize('edit', 'Edit'), id: 'workbench.action.chat.editToolApproval', arguments: [this.toolInvocation.toolId] }) + ')';
				break;
			case ToolConfirmKind.UserAction:
			case ToolConfirmKind.Denied:
			case ToolConfirmKind.ConfirmationNotNeeded:
			default:
				return;
		}


		return md;
	}

	private createApprovalMessage(): HTMLElement | undefined {
		const md = this.autoApproveMessageContent;
		if (!md) {
			return undefined;
		}

		const markdownString = new MarkdownString('_' + md + '_', { isTrusted: true });
		const result = this.renderer.render(markdownString);
		this._register(result);
		result.element.classList.add('chat-tool-approval-message');

		return result.element;
	}

	private createToolInvocationSubPart(): BaseChatToolInvocationSubPart {
		if (this.toolInvocation.kind === 'toolInvocation') {
			if (this.toolInvocation.toolSpecificData?.kind === 'extensions') {
				return this.instantiationService.createInstance(ExtensionsInstallConfirmationWidgetSubPart, this.toolInvocation, this.context);
			}
			if (this.toolInvocation.confirmationMessages) {
				if (this.toolInvocation.toolSpecificData?.kind === 'terminal') {
					return this.instantiationService.createInstance(ChatTerminalToolConfirmationSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockModelCollection, this.codeBlockStartIndex);
				} else {
					return this.instantiationService.createInstance(ToolConfirmationSubPart, this.toolInvocation, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockModelCollection, this.codeBlockStartIndex);
				}
			}
		}

		if (this.toolInvocation.toolSpecificData?.kind === 'terminal') {
			return this.instantiationService.createInstance(ChatTerminalToolProgressPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex, this.codeBlockModelCollection);
		}

		if (Array.isArray(this.toolInvocation.resultDetails) && this.toolInvocation.resultDetails?.length) {
			return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, this.toolInvocation.resultDetails, this.listPool);
		}

		if (isToolResultOutputDetails(this.toolInvocation.resultDetails)) {
			return this.instantiationService.createInstance(ChatToolOutputSubPart, this.toolInvocation, this.context);
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
				!!this.toolInvocation.resultDetails.isError,
				this.currentWidthDelegate
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
				false,
				this.currentWidthDelegate
			);
		}

		return this.instantiationService.createInstance(ChatToolProgressSubPart, this.toolInvocation, this.context, this.renderer);
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') && this.toolInvocation.toolCallId === other.toolCallId;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
