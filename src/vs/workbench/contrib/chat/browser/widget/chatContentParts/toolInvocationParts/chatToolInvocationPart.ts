/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derivedOpts, IObservable } from '../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, isLegacyChatTerminalToolInvocationData, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../../common/model/chatViewModel.js';
import { IChatTodoListService } from '../../../../common/tools/chatTodoListService.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, ToolInvocationPresentation } from '../../../../common/tools/languageModelToolsService.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../../../chat.js';
import { EditorPool } from '../chatContentCodePools.js';
import { IChatContentPart, IChatContentPartRenderContext } from '../chatContentParts.js';
import { CollapsibleListPool } from '../chatReferencesContentPart.js';
import { ExtensionsInstallConfirmationWidgetSubPart } from './chatExtensionsInstallToolSubPart.js';
import { ChatInputOutputMarkdownProgressPart } from './chatInputOutputMarkdownProgressPart.js';
import { ChatMcpAppSubPart, IMcpAppRenderData } from './chatMcpAppSubPart.js';
import { ChatResultListSubPart } from './chatResultListSubPart.js';
import { ChatSessionCreatedResultSubPart } from './chatSessionCreatedResultSubPart.js';
import { ChatSimpleToolProgressPart } from './chatSimpleToolProgressPart.js';
import { ChatSandboxPrerequisiteConfirmationSubPart } from './chatSandboxPrerequisiteConfirmationSubPart.js';
import { ChatModifiedFilesConfirmationSubPart } from './chatModifiedFilesConfirmationSubPart.js';
import { ChatAgentFeedbackReviewConfirmationSubPart } from './chatAgentFeedbackReviewConfirmationSubPart.js';
import { ChatTerminalToolConfirmationSubPart } from './chatTerminalToolConfirmationSubPart.js';
import { ChatTerminalToolProgressPart } from './chatTerminalToolProgressPart.js';
import { ToolConfirmationSubPart } from './chatToolConfirmationSubPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { ChatToolOutputSubPart } from './chatToolOutputPart.js';
import { ChatToolPostExecuteConfirmationPart } from './chatToolPostExecuteConfirmationPart.js';
import { ChatToolProgressSubPart } from './chatToolProgressPart.js';
import { ChatToolStreamingSubPart } from './chatToolStreamingSubPart.js';

/**
 * Value equality for {@link IMcpAppRenderData}, used so the App's derived
 * render data stays stable across state ticks that don't actually change what
 * the webview renders — otherwise re-reading `state` (to react to in-place
 * `toolSpecificData` mutations) would recreate the webview on every progress
 * update.
 */
function mcpAppRenderDataEquals(a: IMcpAppRenderData | undefined, b: IMcpAppRenderData | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	if (a.kind !== b.kind || a.resourceUri !== b.resourceUri || a.input !== b.input || a.sessionResource.toString() !== b.sessionResource.toString()) {
		return false;
	}
	if (a.kind === 'agentHost' && b.kind === 'agentHost') {
		return a.serverId === b.serverId && a.channel === b.channel;
	}
	if (a.kind === 'local' && b.kind === 'local') {
		return a.serverDefinitionId === b.serverDefinitionId && a.collectionId === b.collectionId;
	}
	return false;
}

export class ChatToolInvocationPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	public get toolCallId(): string {
		return this.toolInvocation.toolCallId;
	}

	public get codeblocks(): IChatCodeBlockInfo[] {
		const codeblocks = this.subPart?.codeblocks ?? [];
		if (this.mcpAppPart) {
			codeblocks.push(...this.mcpAppPart.value?.codeblocks ?? []);
		}
		return codeblocks;
	}

	public get codeblocksPartId(): string | undefined {
		return this.subPart?.codeblocksPartId;
	}

	private subPart!: BaseChatToolInvocationSubPart;
	private readonly mcpAppPart = this._register(new MutableDisposable<ChatMcpAppSubPart>());

	private readonly _onDidRemount = this._register(new Emitter<void>());

	constructor(
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: IMarkdownRenderer,
		private readonly listPool: CollapsibleListPool,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		private readonly announcedToolProgressKeys: Set<string> | undefined,
		private readonly codeBlockStartIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
	) {
		super();

		this.domNode = dom.$('.chat-tool-invocation-part');
		if (toolInvocation.presentation === 'hidden') {
			return;
		}

		// Update the todo list service if this tool invocation contains todo data
		if (toolInvocation.toolSpecificData?.kind === 'todoList') {
			const sessionResource = context.element.sessionResource;
			const todos = toolInvocation.toolSpecificData.todoList.map((todo, index) => {
				const parsedId = parseInt(todo.id, 10);
				const id = Number.isNaN(parsedId) ? index + 1 : parsedId;
				return {
					id,
					title: todo.title,
					status: todo.status as 'not-started' | 'in-progress' | 'completed'
				};
			});
			this.chatTodoListService.setTodos(sessionResource, todos);
		}

		let appData: IObservable<IMcpAppRenderData | undefined> = constObservable(undefined);
		if (toolInvocation.kind === 'toolInvocation') {
			const initialState = toolInvocation.state.get().type;
			const initialDataKind = toolInvocation.toolSpecificDataKind.get();
			this._register(autorun(reader => {
				const stateChanged = toolInvocation.state.read(reader).type !== initialState;
				const dataKindChanged = toolInvocation.toolSpecificDataKind.read(reader) !== initialDataKind;
				if (stateChanged || dataKindChanged) {
					render();
				}
			}));

			appData = derivedOpts<IMcpAppRenderData | undefined>({
				owner: this,
				equalsFn: mcpAppRenderDataEquals,
			}, reader => {
				// Read `state` alongside `toolSpecificDataKind` so the App
				// re-derives when `toolSpecificData` is mutated in place — e.g.
				// `mcpAppData` attached on the confirmation -> running
				// transition, which bumps `state` via
				// `notifyToolSpecificDataChanged()` but leaves the kind (`input`)
				// unchanged. `equalsFn` keeps the webview stable across state
				// ticks that don't change the render data.
				reader.readObservable(toolInvocation.state);
				reader.readObservable(toolInvocation.toolSpecificDataKind);
				const data = this.getMcpAppRenderData();
				if (!data) {
					return undefined;
				}

				const outcome = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation, reader);
				return !!outcome && outcome.type !== ToolConfirmKind.Denied && outcome.type !== ToolConfirmKind.Skipped ? data : undefined;
			});
		}

		// This part is a bit different, since IChatToolInvocation is not an immutable model object. So this part is able to rerender itself.
		// If this turns out to be a typical pattern, we could come up with a more reusable pattern, like telling the list to rerender an element
		// when the model changes, or trying to make the model immutable and swap out one content part for a new one based on user actions in the view.
		// Note that `node.replaceWith` is used to ensure order is preserved when an mpc app is present.
		const partStore = this._register(new DisposableStore());
		let subPartDomNode: HTMLElement = document.createElement('div');
		this.domNode.appendChild(subPartDomNode);

		const render = () => {
			partStore.clear();

			if (toolInvocation.presentation === ToolInvocationPresentation.Hidden || (toolInvocation.presentation === ToolInvocationPresentation.HiddenAfterComplete && IChatToolInvocation.isComplete(toolInvocation))) {
				dom.hide(this.domNode);
				return;
			}

			dom.show(this.domNode);
			this.subPart = partStore.add(this.createToolInvocationSubPart());
			subPartDomNode.replaceWith(this.subPart.domNode);
			subPartDomNode = this.subPart.domNode;

			// Add class when displaying a confirmation widget
			const isConfirmation = this.subPart instanceof ToolConfirmationSubPart ||
				this.subPart instanceof ChatTerminalToolConfirmationSubPart ||
				this.subPart instanceof ChatModifiedFilesConfirmationSubPart ||
				this.subPart instanceof ChatSandboxPrerequisiteConfirmationSubPart ||
				this.subPart instanceof ExtensionsInstallConfirmationWidgetSubPart ||
				this.subPart instanceof ChatToolPostExecuteConfirmationPart;
			this.domNode.classList.toggle('has-confirmation', isConfirmation);

			partStore.add(this.subPart.onNeedsRerender(render));
		};

		let appDomNode: HTMLElement = document.createElement('div');
		this.domNode.appendChild(appDomNode);

		this._register(autorun(r => {
			const data = appData.read(r);
			if (!data) {
				this.mcpAppPart.clear();
				dom.clearNode(appDomNode);
				return;
			}

			this.mcpAppPart.value = this.instantiationService.createInstance(
				ChatMcpAppSubPart,
				this.toolInvocation,
				this._onDidRemount.event,
				context,
				data,
			);

			appDomNode.replaceWith(this.mcpAppPart.value.domNode);
			appDomNode = this.mcpAppPart.value.domNode;
		}));

		render();
	}

	private createToolInvocationSubPart(): BaseChatToolInvocationSubPart {
		if (this.toolInvocation.kind === 'toolInvocation') {
			if (this.toolInvocation.toolSpecificData?.kind === 'extensions') {
				return this.instantiationService.createInstance(ExtensionsInstallConfirmationWidgetSubPart, this.toolInvocation, this.context);
			}
			const state = this.toolInvocation.state.get();

			// Handle streaming state - show streaming progress
			if (state.type === IChatToolInvocation.StateKind.Streaming) {
				return this.instantiationService.createInstance(ChatToolStreamingSubPart, this.toolInvocation, this.context, this.renderer);
			}

			if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
				if (this.toolInvocation.toolSpecificData?.kind === 'terminal' && !isLegacyChatTerminalToolInvocationData(this.toolInvocation.toolSpecificData) && (this.toolInvocation.toolSpecificData.missingSandboxDependencies?.length || this.toolInvocation.toolSpecificData.sandboxRemediations?.length)) {
					return this.instantiationService.createInstance(ChatSandboxPrerequisiteConfirmationSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer);
				} else if (this.toolInvocation.toolSpecificData?.kind === 'terminal') {
					return this.instantiationService.createInstance(ChatTerminalToolConfirmationSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
				} else if (this.toolInvocation.toolSpecificData?.kind === 'modifiedFilesConfirmation') {
					return this.instantiationService.createInstance(ChatModifiedFilesConfirmationSubPart, this.toolInvocation, this.context, this.listPool);
				} else if (this.toolInvocation.toolSpecificData?.kind === 'agentFeedbackReviewConfirmation') {
					return this.instantiationService.createInstance(ChatAgentFeedbackReviewConfirmationSubPart, this.toolInvocation, this.context);
				} else {
					return this.instantiationService.createInstance(ToolConfirmationSubPart, this.toolInvocation, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
				}
			}
			if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
				return this.instantiationService.createInstance(ChatToolPostExecuteConfirmationPart, this.toolInvocation, this.context);
			}
		}

		if (this.toolInvocation.toolSpecificData?.kind === 'sessionCreated') {
			return this.instantiationService.createInstance(ChatSessionCreatedResultSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer);
		}

		if (this.toolInvocation.toolSpecificData?.kind === 'terminal') {
			return this.instantiationService.createInstance(ChatTerminalToolProgressPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
		}

		if (this.toolInvocation.toolSpecificData?.kind === 'resources' && this.toolInvocation.toolSpecificData.values.length > 0) {
			return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, this.toolInvocation.toolSpecificData.values, this.listPool);
		}

		if (this.toolInvocation.toolSpecificData?.kind === 'simpleToolInvocation') {
			return this.instantiationService.createInstance(
				ChatSimpleToolProgressPart,
				this.toolInvocation,
				this.context,
				this.codeBlockStartIndex,
				this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage,
				this.toolInvocation.originMessage,
				this.toolInvocation.toolSpecificData,
				false,
			);
		}


		const resultDetails = IChatToolInvocation.resultDetails(this.toolInvocation);
		if (Array.isArray(resultDetails) && resultDetails.length) {
			return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, resultDetails, this.listPool);
		}

		if (isToolResultOutputDetails(resultDetails)) {
			return this.instantiationService.createInstance(ChatToolOutputSubPart, this.toolInvocation, this.context, this._onDidRemount.event);
		}

		if (isToolResultInputOutputDetails(resultDetails)) {
			return this.instantiationService.createInstance(
				ChatInputOutputMarkdownProgressPart,
				this.toolInvocation,
				this.context,
				this.codeBlockStartIndex,
				this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage,
				this.toolInvocation.originMessage,
				resultDetails.input,
				resultDetails.inputLanguage,
				resultDetails.output,
				!!resultDetails.isError,
			);
		}

		if (this.toolInvocation.kind === 'toolInvocation' && this.toolInvocation.toolSpecificData?.kind === 'input' && !IChatToolInvocation.isComplete(this.toolInvocation)) {
			return this.instantiationService.createInstance(
				ChatInputOutputMarkdownProgressPart,
				this.toolInvocation,
				this.context,
				this.codeBlockStartIndex,
				this.toolInvocation.invocationMessage,
				this.toolInvocation.originMessage,
				typeof this.toolInvocation.toolSpecificData.rawInput === 'string' ? this.toolInvocation.toolSpecificData.rawInput : JSON.stringify(this.toolInvocation.toolSpecificData.rawInput, null, 2),
				undefined,
				undefined,
				false,
			);
		}

		return this.instantiationService.createInstance(ChatToolProgressSubPart, this.toolInvocation, this.context, this.renderer, this.announcedToolProgressKeys);
	}

	/**
	 * Gets MCP App render data if this tool invocation has MCP App UI.
	 * Returns data from either:
	 * - toolSpecificData.mcpAppData (for in-progress tools)
	 * - result details mcpOutput (for completed tools)
	 */
	private getMcpAppRenderData(): IMcpAppRenderData | undefined {
		const toolSpecificData = this.toolInvocation.toolSpecificData;
		if (toolSpecificData?.kind === 'input' && toolSpecificData.mcpAppData) {
			const rawInput = typeof toolSpecificData.rawInput === 'string'
				? toolSpecificData.rawInput
				: JSON.stringify(toolSpecificData.rawInput, null, 2);

			return {
				...toolSpecificData.mcpAppData,
				input: rawInput,
				sessionResource: this.context.element.sessionResource,
			};
		}

		return undefined;
	}

	onDidRemount(): void {
		this._onDidRemount.fire();
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') && this.toolInvocation.toolCallId === other.toolCallId;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
