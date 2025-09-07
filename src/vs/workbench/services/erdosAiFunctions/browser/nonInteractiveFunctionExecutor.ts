/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { INonInteractiveFunctionExecutor } from '../common/nonInteractiveFunctionExecutor.js';

export class NonInteractiveFunctionExecutor extends Disposable implements INonInteractiveFunctionExecutor {
	readonly _serviceBrand: undefined;

	private readonly _onFunctionCallDisplayMessage = this._register(new Emitter<{ id: number; function_call: any; timestamp: string }>());
	readonly onFunctionCallDisplayMessage: Event<{ id: number; function_call: any; timestamp: string }> = this._onFunctionCallDisplayMessage.event;

	constructor() {
		super();
	}

	async execute(): Promise<void> {
		// Non-interactive functions are now handled by the parallel branch system
		// This method should not be called in the new architecture
		throw new Error('NonInteractiveFunctionExecutor is obsolete - use FunctionBranchExecutor instead');
	}
}
