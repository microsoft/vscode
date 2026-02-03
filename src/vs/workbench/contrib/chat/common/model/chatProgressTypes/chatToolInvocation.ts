/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64 } from '../../../../../../base/common/buffer.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { ConfirmedReason, IChatExtensionsContent, IChatSubagentToolInvocationData, IChatTodoListContent, IChatToolInputInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind, type IChatTerminalToolInvocationData } from '../../chatService/chatService.js';
import { IPreparedToolInvocation, isToolResultOutputDetails, IToolConfirmationMessages, IToolData, IToolProgressStep, IToolResult, ToolDataSource } from '../../tools/languageModelToolsService.js';

export interface IStreamingToolCallOptions {
	toolCallId: string;
	toolId: string;
	toolData: IToolData;
	subagentInvocationId?: string;
	chatRequestId?: string;
}

export class ChatToolInvocation implements IChatToolInvocation {
	public readonly kind: 'toolInvocation' = 'toolInvocation';

	public invocationMessage: string | IMarkdownString;
	public readonly originMessage: string | IMarkdownString | undefined;
	public pastTenseMessage: string | IMarkdownString | undefined;
	public confirmationMessages: IToolConfirmationMessages | undefined;
	public presentation: IPreparedToolInvocation['presentation'];
	public readonly toolId: string;
	public source: ToolDataSource;
	public readonly subAgentInvocationId: string | undefined;
	public parameters: unknown;
	public generatedTitle?: string;
	public readonly chatRequestId?: string;

	public toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatTodoListContent | IChatSubagentToolInvocationData;

	private readonly _progress = observableValue<{ message?: string | IMarkdownString; progress: number | undefined }>(this, { progress: 0 });
	private readonly _state: ISettableObservable<IChatToolInvocation.State>;

	// Streaming-related observables
	private readonly _partialInput = observableValue<unknown>(this, undefined);
	private readonly _streamingMessage = observableValue<string | IMarkdownString | undefined>(this, undefined);

	public get state(): IObservable<IChatToolInvocation.State> {
		return this._state;
	}

	/**
	 * Create a tool invocation in streaming state.
	 * Use this when the tool call is beginning to stream partial input from the LM.
	 */
	public static createStreaming(options: IStreamingToolCallOptions): ChatToolInvocation {
		return new ChatToolInvocation(undefined, options.toolData, options.toolCallId, options.subagentInvocationId, undefined, true, options.chatRequestId);
	}

	constructor(
		preparedInvocation: IPreparedToolInvocation | undefined,
		toolData: IToolData,
		public readonly toolCallId: string,
		subAgentInvocationId: string | undefined,
		parameters: unknown,
		isStreaming: boolean = false,
		chatRequestId?: string
	) {
		// For streaming invocations, use a default message until handleToolStream provides one
		const defaultStreamingMessage = isStreaming ? localize('toolInvocationMessage', "Using \"{0}\"", toolData.displayName) : '';
		this.invocationMessage = preparedInvocation?.invocationMessage ?? defaultStreamingMessage;
		this.pastTenseMessage = preparedInvocation?.pastTenseMessage;
		this.originMessage = preparedInvocation?.originMessage;
		this.confirmationMessages = preparedInvocation?.confirmationMessages;
		this.presentation = preparedInvocation?.presentation;
		this.toolSpecificData = preparedInvocation?.toolSpecificData;
		this.toolId = toolData.id;
		this.source = toolData.source;
		this.subAgentInvocationId = subAgentInvocationId;
		this.parameters = parameters;
		this.chatRequestId = chatRequestId;

		if (isStreaming) {
			// Start in streaming state
			this._state = observableValue(this, {
				type: IChatToolInvocation.StateKind.Streaming,
				partialInput: this._partialInput,
				streamingMessage: this._streamingMessage,
			});
		} else if (!this.confirmationMessages?.title) {
			this._state = observableValue(this, {
				type: IChatToolInvocation.StateKind.Executing,
				confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: this.confirmationMessages?.confirmationNotNeededReason },
				progress: this._progress,
				parameters: this.parameters,
				confirmationMessages: this.confirmationMessages,
			});
		} else {
			this._state = observableValue(this, {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: this.parameters,
				confirmationMessages: this.confirmationMessages,
				confirm: reason => {
					if (reason.type === ToolConfirmKind.Denied || reason.type === ToolConfirmKind.Skipped) {
						this._state.set({
							type: IChatToolInvocation.StateKind.Cancelled,
							reason: reason.type,
							parameters: this.parameters,
							confirmationMessages: this.confirmationMessages,
						}, undefined);
					} else {
						this._state.set({
							type: IChatToolInvocation.StateKind.Executing,
							confirmed: reason,
							progress: this._progress,
							parameters: this.parameters,
							confirmationMessages: this.confirmationMessages,
						}, undefined);
					}
				}
			});
		}
	}

	/**
	 * Update the partial input observable during streaming.
	 */
	public updatePartialInput(input: unknown): void {
		if (this._state.get().type !== IChatToolInvocation.StateKind.Streaming) {
			return; // Only update in streaming state
		}
		this._partialInput.set(input, undefined);
	}

	/**
	 * Update the streaming message (from handleToolStream).
	 */
	public updateStreamingMessage(message: string | IMarkdownString): void {
		const state = this._state.get();
		if (state.type !== IChatToolInvocation.StateKind.Streaming) {
			return; // Only update in streaming state
		}
		this._streamingMessage.set(message, undefined);
	}

	/**
	 * Transition from streaming state to prepared/executing state.
	 * Called when the full tool call is ready.
	 */
	public transitionFromStreaming(preparedInvocation: IPreparedToolInvocation | undefined, parameters: unknown, autoConfirmed: ConfirmedReason | undefined): void {
		const currentState = this._state.get();
		if (currentState.type !== IChatToolInvocation.StateKind.Streaming) {
			return; // Only transition from streaming state
		}

		// Preserve the last streaming message if no new invocation message is provided
		const lastStreamingMessage = this._streamingMessage.get();
		if (lastStreamingMessage && !preparedInvocation?.invocationMessage) {
			this.invocationMessage = lastStreamingMessage;
		}

		// Update fields from prepared invocation
		this.parameters = parameters;
		if (preparedInvocation) {
			if (preparedInvocation.invocationMessage) {
				this.invocationMessage = preparedInvocation.invocationMessage;
			}
			this.pastTenseMessage = preparedInvocation.pastTenseMessage;
			this.confirmationMessages = preparedInvocation.confirmationMessages;
			this.presentation = preparedInvocation.presentation;
			this.toolSpecificData = preparedInvocation.toolSpecificData;
		}

		const confirm = (reason: ConfirmedReason) => {
			if (reason.type === ToolConfirmKind.Denied || reason.type === ToolConfirmKind.Skipped) {
				this._state.set({
					type: IChatToolInvocation.StateKind.Cancelled,
					reason: reason.type,
					parameters: this.parameters,
					confirmationMessages: this.confirmationMessages,
				}, undefined);
			} else {
				this._state.set({
					type: IChatToolInvocation.StateKind.Executing,
					confirmed: reason,
					progress: this._progress,
					parameters: this.parameters,
					confirmationMessages: this.confirmationMessages,
				}, undefined);
			}
		};

		// Transition to the appropriate state
		if (autoConfirmed) {
			confirm(autoConfirmed);
		} else if (!this.confirmationMessages?.title) {
			this._state.set({
				type: IChatToolInvocation.StateKind.Executing,
				confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: this.confirmationMessages?.confirmationNotNeededReason },
				progress: this._progress,
				parameters: this.parameters,
				confirmationMessages: this.confirmationMessages,
			}, undefined);
		} else {
			this._state.set({
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: this.parameters,
				confirmationMessages: this.confirmationMessages,
				confirm,
			}, undefined);
		}
	}

	private _setCompleted(result: IToolResult | undefined, postConfirmed?: ConfirmedReason | undefined) {
		if (postConfirmed && (postConfirmed.type === ToolConfirmKind.Denied || postConfirmed.type === ToolConfirmKind.Skipped)) {
			this._state.set({
				type: IChatToolInvocation.StateKind.Cancelled,
				reason: postConfirmed.type,
				parameters: this.parameters,
				confirmationMessages: this.confirmationMessages,
			}, undefined);
			return;
		}

		this._state.set({
			type: IChatToolInvocation.StateKind.Completed,
			confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: ToolConfirmKind.ConfirmationNotNeeded },
			resultDetails: result?.toolResultDetails,
			postConfirmed,
			contentForModel: result?.content || [],
			parameters: this.parameters,
			confirmationMessages: this.confirmationMessages,
		}, undefined);
	}

	public async didExecuteTool(result: IToolResult | undefined, final?: boolean, checkIfResultAutoApproved?: () => Promise<ConfirmedReason | undefined>): Promise<IChatToolInvocation.State> {
		if (result?.toolResultMessage) {
			this.pastTenseMessage = result.toolResultMessage;
		} else if (this._progress.get().message) {
			this.pastTenseMessage = this._progress.get().message;
		}

		if (this.confirmationMessages?.confirmResults && !result?.toolResultError && result?.confirmResults !== false && !final) {
			const autoApproved = await checkIfResultAutoApproved?.();
			if (autoApproved) {
				this._setCompleted(result, autoApproved);
			} else {
				this._state.set({
					type: IChatToolInvocation.StateKind.WaitingForPostApproval,
					confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: ToolConfirmKind.ConfirmationNotNeeded },
					resultDetails: result?.toolResultDetails,
					contentForModel: result?.content || [],
					confirm: reason => this._setCompleted(result, reason),
					parameters: this.parameters,
					confirmationMessages: this.confirmationMessages,
				}, undefined);
			}
		} else {
			this._setCompleted(result);
		}

		return this._state.get();
	}

	public acceptProgress(step: IToolProgressStep) {
		const prev = this._progress.get();
		this._progress.set({
			progress: step.progress || prev.progress || 0,
			message: step.message,
		}, undefined);
	}

	public toJSON(): IChatToolInvocationSerialized {
		// persist the serialized call as 'skipped' if we were waiting for postapproval
		const waitingForPostApproval = this.state.get().type === IChatToolInvocation.StateKind.WaitingForPostApproval;
		const details = waitingForPostApproval ? undefined : IChatToolInvocation.resultDetails(this);

		return {
			kind: 'toolInvocationSerialized',
			presentation: this.presentation,
			invocationMessage: this.invocationMessage,
			pastTenseMessage: this.pastTenseMessage,
			originMessage: this.originMessage,
			isConfirmed: waitingForPostApproval ? { type: ToolConfirmKind.Skipped } : IChatToolInvocation.executionConfirmedOrDenied(this),
			isComplete: true,
			source: this.source,
			resultDetails: isToolResultOutputDetails(details)
				? { output: { type: 'data', mimeType: details.output.mimeType, base64Data: encodeBase64(details.output.value) } }
				: details,
			toolSpecificData: this.toolSpecificData,
			toolCallId: this.toolCallId,
			toolId: this.toolId,
			subAgentInvocationId: this.subAgentInvocationId,
			generatedTitle: this.generatedTitle,
		};
	}
}
