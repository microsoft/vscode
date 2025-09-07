/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInteractiveFunctionExecutor } from '../common/interactiveFunctionExecutor.js';

export class InteractiveFunctionExecutor extends Disposable implements IInteractiveFunctionExecutor {
	readonly _serviceBrand: undefined;

	constructor() {
		super();
	}

	async execute(): Promise<void> {
		// Interactive functions are now handled by the parallel branch system
		// This method should not be called in the new architecture
		throw new Error('InteractiveFunctionExecutor is obsolete - use FunctionBranchExecutor instead');
	}
}
