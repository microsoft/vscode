/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { IChatToolInvocation } from '../chatService.js';
import { IToolData } from '../languageModelToolsService.js';

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
		public readonly toolData: IToolData,
		public readonly parameters: any,
		public readonly agentDisplayName: string,
		private _requiresConfirmation: boolean = false) { }

	public get requiresConfirmation(): boolean {
		return this._requiresConfirmation;
	}

	public confirm(confirmed: boolean): void {
		this._requiresConfirmation = false;
		this._confirmDeferred.complete(confirmed);
	}

	public complete(): void {
		// Spinner -> check
		this._isComplete = true;
	}
}
