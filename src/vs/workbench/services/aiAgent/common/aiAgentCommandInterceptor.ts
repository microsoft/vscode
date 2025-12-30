/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Code Ship Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAIAgentCommandInterceptor = createDecorator<IAIAgentCommandInterceptor>('aiAgentCommandInterceptor');

/**
 * Service interface for AI Agent command interception.
 * Used by CommandService to check if commands should be allowed.
 *
 * This interface is in 'common' layer to allow CommandService to consume it.
 * Implementation is in 'browser' layer (MainThreadAIAgent).
 *
 * Phase 3.2: Command Interception Integration
 */
export interface IAIAgentCommandInterceptor {
	readonly _serviceBrand: undefined;

	/**
	 * Check if a command should be allowed to execute.
	 * Returns true to allow, false to block.
	 *
	 * @param commandId The command identifier
	 * @param args The command arguments
	 */
	shouldAllowCommand(commandId: string, args: any[]): Promise<boolean>;
}
