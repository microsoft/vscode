/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { CLIENT_SEMANTIC_SEARCH_REFERENCE_NAME, SEMANTIC_SEARCH_TOOL_NAME } from '../../../../../../platform/agentHost/common/semanticSearchConstants.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../../../../../platform/agentHost/common/toolSearchConstants.js';
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

/** Maps a runtime-facing override name back to the workbench tool reference. */
export function toClientToolReferenceName(toolName: string, semanticSearchOverride: boolean): string {
	switch (toolName) {
		case RUNTIME_TOOL_SEARCH_TOOL_NAME:
			return CLIENT_TOOL_SEARCH_REFERENCE_NAME;
		case SEMANTIC_SEARCH_TOOL_NAME:
			return semanticSearchOverride ? CLIENT_SEMANTIC_SEARCH_REFERENCE_NAME : toolName;
		default:
			return toolName;
	}
}

