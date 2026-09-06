/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import type { IToolData } from '../../../common/tools/languageModelToolsService.js';

/**
 * Converts an internal {@link IToolData} to a protocol {@link ToolDefinition}.
 */
export function toolDataToDefinition(tool: IToolData): ToolDefinition {
	const definition: ToolDefinition = {
		name: tool.toolReferenceName ?? tool.id,
		title: tool.displayName,
		description: tool.modelDescription,
	};
	if (tool.inputSchema?.type === 'object') {
		definition.inputSchema = tool.inputSchema as ToolDefinition['inputSchema'];
	}
	return definition;
}
