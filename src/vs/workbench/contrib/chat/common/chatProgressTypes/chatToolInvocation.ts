/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { encodeBase64 } from '../../../../../base/common/buffer.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ConfirmedReason, IChatExtensionsContent, IChatTodoListContent, IChatToolInputInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind, type IChatTerminalToolInvocationData } from '../chatService.js';
import { IPreparedToolInvocation, isToolResultOutputDetails, IToolConfirmationMessages, IToolData, IToolProgressStep, IToolResult, ToolDataSource } from '../languageModelToolsService.js';

export class ChatToolInvocation implements IChatToolInvocation {
	public readonly kind: 'toolInvocation' = 'toolInvocation';

	private _isComplete = false;
	public get isComplete(): boolean {
		return this._isComplete;
	}

	private _isCompleteDeferred = new DeferredPromise<void>();
	public get isCompletePromise(): Promise<void> {
		return this._isCompleteDeferred.p;
	}

	private _confirmDeferred = new DeferredPromise<ConfirmedReason>();
	public get confirmed() {
		return this._confirmDeferred;
	}

	public get isConfirmed(): ConfirmedReason | undefined {
		return this._confirmDeferred.value;
	}

	private _resultDetails: IToolResult['toolResultDetails'] | undefined;
	public get resultDetails(): IToolResult['toolResultDetails'] | undefined {
		return this._resultDetails;
	}

	public readonly invocationMessage: string | IMarkdownString;
	public readonly originMessage: string | IMarkdownString | undefined;
	public pastTenseMessage: string | IMarkdownString | undefined;
	private _confirmationMessages: IToolConfirmationMessages | undefined;
	public readonly presentation: IPreparedToolInvocation['presentation'];
	public readonly toolId: string;
	public readonly source: ToolDataSource;
	public readonly fromSubAgent: boolean | undefined;

	public readonly toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatTodoListContent;

	public readonly progress = observableValue<{ message?: string | IMarkdownString; progress: number }>(this, { progress: 0 });

	constructor(preparedInvocation: IPreparedToolInvocation | undefined, toolData: IToolData, public readonly toolCallId: string, fromSubAgent: boolean | undefined) {
		const defaultMessage = localize('toolInvocationMessage', "Using {0}", `"${toolData.displayName}"`);
		const invocationMessage = preparedInvocation?.invocationMessage ?? defaultMessage;
		this.invocationMessage = invocationMessage;
		this.pastTenseMessage = preparedInvocation?.pastTenseMessage;
		this.originMessage = preparedInvocation?.originMessage;
		this._confirmationMessages = preparedInvocation?.confirmationMessages;
		this.presentation = preparedInvocation?.presentation;
		this.toolSpecificData = preparedInvocation?.toolSpecificData;
		this.toolId = toolData.id;
		this.source = toolData.source;
		this.fromSubAgent = fromSubAgent;

		if (!this._confirmationMessages) {
			// No confirmation needed
			this._confirmDeferred.complete({ type: ToolConfirmKind.ConfirmationNotNeeded });
		}

		this._confirmDeferred.p.then(() => {
			this._confirmationMessages = undefined;
		});

		this._isCompleteDeferred.p.then(() => {
			this._isComplete = true;
		});
	}

	public complete(result: IToolResult | undefined): void {
		if (result?.toolResultMessage) {
			this.pastTenseMessage = result.toolResultMessage;
		}

		this._resultDetails = result?.toolResultDetails;
		this._isCompleteDeferred.complete();
	}

	public get confirmationMessages(): IToolConfirmationMessages | undefined {
		return this._confirmationMessages;
	}

	public acceptProgress(step: IToolProgressStep) {
		const prev = this.progress.get();
		this.progress.set({
			progress: step.progress || prev.progress || 0,
			message: step.message,
		}, undefined);
	}

	public toJSON(): IChatToolInvocationSerialized {
		return {
			kind: 'toolInvocationSerialized',
			presentation: this.presentation,
			invocationMessage: this.invocationMessage,
			pastTenseMessage: this.pastTenseMessage,
			originMessage: this.originMessage,
			isConfirmed: this._confirmDeferred.value,
			isComplete: true,
			source: this.source,
			resultDetails: isToolResultOutputDetails(this._resultDetails)
				? { output: { type: 'data', mimeType: this._resultDetails.output.mimeType, base64Data: encodeBase64(this._resultDetails.output.value) } }
				: this._resultDetails,
			toolSpecificData: this.toolSpecificData,
			toolCallId: this.toolCallId,
			toolId: this.toolId,
			fromSubAgent: this.fromSubAgent,
		};
	}
}
