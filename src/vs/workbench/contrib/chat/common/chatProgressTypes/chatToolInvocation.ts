/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../chatService.js';
import { IToolConfirmationMessages, IToolResult } from '../languageModelToolsService.js';

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

	constructor(
		public readonly invocationMessage: string | IMarkdownString,
		public pastTenseMessage: string | IMarkdownString | undefined,
		public readonly tooltip: string | IMarkdownString | undefined,
		private _confirmationMessages: IToolConfirmationMessages | undefined) {
		if (!_confirmationMessages) {
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
			invocationMessage: this.invocationMessage,
			pastTenseMessage: this.pastTenseMessage,
			tooltip: this.tooltip,
			isConfirmed: this._isConfirmed ?? false,
			isComplete: this._isComplete,
			resultDetails: this._resultDetails
		};
	}
}
