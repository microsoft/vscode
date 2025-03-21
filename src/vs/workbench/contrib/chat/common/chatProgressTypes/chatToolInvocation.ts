/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IChatTerminalToolInvocationData, IChatToolInputInvocationData, IChatToolInvocation, IChatToolInvocationSerialized } from '../chatService.js';
import { IPreparedToolInvocation, IToolConfirmationMessages, IToolData, IToolResult } from '../languageModelToolsService.js';

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

	private _confirmDeferred = new DeferredPromise<boolean>();
	public get confirmed() {
		return this._confirmDeferred;
	}

	private _isConfirmed: boolean | undefined;
	public get isConfirmed(): boolean | undefined {
		return this._isConfirmed;
	}

	private _resultDetails: IToolResult['toolResultDetails'] | undefined;
	public get resultDetails(): IToolResult['toolResultDetails'] | undefined {
		return this._resultDetails;
	}

	public readonly invocationMessage: string | IMarkdownString;
	public pastTenseMessage: string | IMarkdownString | undefined;
	private _confirmationMessages: IToolConfirmationMessages | undefined;
	public readonly presentation: IPreparedToolInvocation['presentation'];
	public readonly toolId: string;

	public readonly toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData;

	constructor(preparedInvocation: IPreparedToolInvocation | undefined, toolData: IToolData, public readonly toolCallId: string) {
		const defaultMessage = localize('toolInvocationMessage', "Using {0}", `"${toolData.displayName}"`);
		const invocationMessage = preparedInvocation?.invocationMessage ?? defaultMessage;
		this.invocationMessage = invocationMessage;
		this.pastTenseMessage = preparedInvocation?.pastTenseMessage;
		this._confirmationMessages = preparedInvocation?.confirmationMessages;
		this.presentation = preparedInvocation?.presentation;
		this.toolSpecificData = preparedInvocation?.toolSpecificData;
		this.toolId = toolData.id;

		if (!this._confirmationMessages) {
			// No confirmation needed
			this._isConfirmed = true;
			this._confirmDeferred.complete(true);
		}

		this._confirmDeferred.p.then(confirmed => {
			this._isConfirmed = confirmed;
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

	public toJSON(): IChatToolInvocationSerialized {
		return {
			kind: 'toolInvocationSerialized',
			presentation: this.presentation,
			invocationMessage: this.invocationMessage,
			pastTenseMessage: this.pastTenseMessage,
			isConfirmed: this._isConfirmed,
			isComplete: this._isComplete,
			resultDetails: this._resultDetails,
			toolSpecificData: this.toolSpecificData,
			toolCallId: this.toolCallId,
		};
	}
}
