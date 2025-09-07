/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
// QueuedFunction and ExecutionResult imports removed - this interface is obsolete

export const IInteractiveFunctionExecutor = createDecorator<IInteractiveFunctionExecutor>('interactiveFunctionExecutor');

export interface IInteractiveFunctionExecutor {
	readonly _serviceBrand: undefined;

	/**
	 * Execute method - obsolete in new architecture
	 */
	execute(): Promise<void>;
}
