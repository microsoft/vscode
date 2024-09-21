/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { IChatToolInvocation } from '../chatService.js';
import { IToolConfirmationMessages } from '../languageModelToolsService.js';

export class ChatToolInvocation implements IChatToolInvocation {
	public readonly kind: 'toolInvocation' = 'toolInvocation';

	private _isComplete = false;
	public get isComplete(): boolean {
		return this._isComplete;
	}

	private _confirmDeferred = new DeferredPromise<boolean>();

	public get confirmed(): Promise<boolean> {
		return this._confirmDeferred.p;
	}

	constructor(
		public readonly invocationMessage: string,
		private _confirmationMessages: IToolConfirmationMessages | undefined) { }

	public get confirmationMessages(): IToolConfirmationMessages | undefined {
		return this._confirmationMessages;
	}

	public confirm(confirmed: boolean): void {
		this._confirmationMessages = undefined;
		this._confirmDeferred.complete(confirmed);
	}

	public complete(): void {
		// Spinner -> check
		this._isComplete = true;
	}
}
