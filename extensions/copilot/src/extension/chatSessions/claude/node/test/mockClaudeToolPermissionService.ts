/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	ClaudeToolPermissionContext,
	ClaudeToolPermissionResult
} from '../../common/claudeToolPermission';
import { IClaudeToolPermissionService } from '../../common/claudeToolPermissionService';

/**
 * Mock implementation of ClaudeToolPermissionService for testing.
 * By default, allows all tools without confirmation.
 */
export class MockClaudeToolPermissionService implements IClaudeToolPermissionService {
	declare readonly _serviceBrand: undefined;

	public allowAll = true;

	public async canUseTool(
		_toolName: string,
		input: Record<string, unknown>,
		_context: ClaudeToolPermissionContext
	): Promise<ClaudeToolPermissionResult> {
		if (this.allowAll) {
			return {
				behavior: 'allow',
				updatedInput: input
			};
		}
		return {
			behavior: 'deny',
			message: 'Mock denied'
		};
	}
}
