/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64 } from '../../../../../base/common/buffer.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ConfirmedReason, IChatExtensionsContent, IChatTodoListContent, IChatToolInputInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind, type IChatTerminalToolInvocationData } from '../chatService.js';
import { IPreparedToolInvocation, isToolResultOutputDetails, IToolConfirmationMessages, IToolData, IToolProgressStep, IToolResult, ToolDataSource } from '../languageModelToolsService.js';

export class ChatToolInvocation implements IChatToolInvocation {
	public readonly kind: 'toolInvocation' = 'toolInvocation';

	public readonly invocationMessage: string | IMarkdownString;
	public readonly originMessage: string | IMarkdownString | undefined;
	public pastTenseMessage: string | IMarkdownString | undefined;
	public confirmationMessages: IToolConfirmationMessages | undefined;
	public readonly presentation: IPreparedToolInvocation['presentation'];
	public readonly toolId: string;
	public readonly source: ToolDataSource;
	public readonly fromSubAgent: boolean | undefined;
	public readonly parameters: unknown;
	public generatedTitle?: string;

	public readonly toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatTodoListContent;

	private readonly _progress = observableValue<{ message?: string | IMarkdownString; progress: number | undefined }>(this, { progress: 0 });
	private readonly _state: ISettableObservable<IChatToolInvocation.State>;

	public get state(): IObservable<IChatToolInvocation.State> {
		return this._state;
	}


	constructor(preparedInvocation: IPreparedToolInvocation | undefined, toolData: IToolData, public readonly toolCallId: string, fromSubAgent: boolean | undefined, parameters: unknown) {
		const defaultMessage = localize('toolInvocationMessage', "Using {0}", `"${toolData.displayName}"`);
		const invocationMessage = preparedInvocation?.invocationMessage ?? defaultMessage;
		this.invocationMessage = invocationMessage;
		this.pastTenseMessage = preparedInvocation?.pastTenseMessage;
		this.originMessage = preparedInvocation?.originMessage;
		this.confirmationMessages = preparedInvocation?.confirmationMessages;
		this.presentation = preparedInvocation?.presentation;
		this.toolSpecificData = preparedInvocation?.toolSpecificData;
		this.toolId = toolData.id;
		this.source = toolData.source;
		this.fromSubAgent = fromSubAgent;
		this.parameters = parameters;

		if (!this.confirmationMessages?.title) {
			this._state = observableValue(this, { type: IChatToolInvocation.StateKind.Executing, confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded }, progress: this._progress });
		} else {
			this._state = observableValue(this, {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				confirm: reason => {
					if (reason.type === ToolConfirmKind.Denied || reason.type === ToolConfirmKind.Skipped) {
						this._state.set({ type: IChatToolInvocation.StateKind.Cancelled, reason: reason.type }, undefined);
					} else {
						this._state.set({ type: IChatToolInvocation.StateKind.Executing, confirmed: reason, progress: this._progress }, undefined);
					}
				}
			});
		}
	}

	private _setCompleted(result: IToolResult | undefined, postConfirmed?: ConfirmedReason | undefined) {
		if (postConfirmed && (postConfirmed.type === ToolConfirmKind.Denied || postConfirmed.type === ToolConfirmKind.Skipped)) {
			this._state.set({ type: IChatToolInvocation.StateKind.Cancelled, reason: postConfirmed.type }, undefined);
			return;
		}

		this._state.set({
			type: IChatToolInvocation.StateKind.Completed,
			confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: ToolConfirmKind.ConfirmationNotNeeded },
			resultDetails: result?.toolResultDetails,
			postConfirmed,
			contentForModel: result?.content || [],
		}, undefined);
	}

	public didExecuteTool(result: IToolResult | undefined, final?: boolean): IChatToolInvocation.State {
		if (result?.toolResultMessage) {
			this.pastTenseMessage = result.toolResultMessage;
		} else if (this._progress.get().message) {
			this.pastTenseMessage = this._progress.get().message;
		}

		if (this.confirmationMessages?.confirmResults && !result?.toolResultError && result?.confirmResults !== false && !final) {
			this._state.set({
				type: IChatToolInvocation.StateKind.WaitingForPostApproval,
				confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: ToolConfirmKind.ConfirmationNotNeeded },
				resultDetails: result?.toolResultDetails,
				contentForModel: result?.content || [],
				confirm: reason => this._setCompleted(result, reason),
			}, undefined);
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
			fromSubAgent: this.fromSubAgent,
			generatedTitle: this.generatedTitle,
		};
	}
}
