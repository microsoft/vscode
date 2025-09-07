/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
// QueuedFunction and ExecutionResult imports removed - this interface is obsolete

export const INonInteractiveFunctionExecutor = createDecorator<INonInteractiveFunctionExecutor>('nonInteractiveFunctionExecutor');

export interface INonInteractiveFunctionExecutor {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when function call display message is available
	 */
	readonly onFunctionCallDisplayMessage: Event<{ id: number; function_call: any; timestamp: string }>;

	/**
	 * Execute method - obsolete in new architecture
	 */
	execute(): Promise<void>;
}
