/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ITracingService } from '../../tracing/common/tracing.js';

// Command ID that will be triggered by FindController
export const RECORD_REPLACE_OPERATION_COMMAND_ID = 'workbench.action.recordReplaceOperation';

// Define the interface for replace operation details that will be passed to the command
export interface IReplaceOperationData {
	fileName: string;
	searchString: string;
	replaceString: string;
	matchesCount?: number;
	rangeInfo?: { lineNumber: number; startColumn: number; endColumn: number };
	isReplaceAll: boolean;
}

// Register the command with VSCode
CommandsRegistry.registerCommand(
	RECORD_REPLACE_OPERATION_COMMAND_ID,
	(accessor: ServicesAccessor, data: IReplaceOperationData) => {
		const tracingService = accessor.get(ITracingService);
		console.log('Recording replace operation:', data);
		return tracingService.recordTrace({
			action_id: 'replace_operation',
			timestamp: new Date().toISOString(),
			event: {
				...data
			}
		});

	}
);
