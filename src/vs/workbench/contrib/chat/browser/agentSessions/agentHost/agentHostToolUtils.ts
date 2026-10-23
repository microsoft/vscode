/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { browserChatToolReferenceNames } from '../../../../../../platform/browserView/common/browserChatToolReferenceNames.js';
import type { ILanguageModelToolsService, IToolData } from '../../../common/tools/languageModelToolsService.js';
import { withAgentToolPreferences } from '../../../../../../platform/agentHost/common/meta/agentToolCallMeta.js';
import { withAgentToolFullReferenceName } from '../../../../../../platform/agentHost/common/meta/agentToolDefinitionMeta.js';

const notebookToolReferenceNames = new Set([
	'createJupyterNotebook',
	'editNotebook',
	'runNotebookCell',
	'getNotebookSummary',
	'readNotebookCellOutput',
]);
const browserToolReferenceNames = new Set<string>(browserChatToolReferenceNames);

/**
 * Converts an internal {@link IToolData} to a protocol {@link ToolDefinition}.
 */
export function toolDataToDefinition(tool: IToolData, referenceName?: string): ToolDefinition {
	const definition: ToolDefinition = {
		name: tool.toolReferenceName ?? tool.id,
		title: tool.displayName,
		description: tool.modelDescription,
	};
	if (tool.inputSchema?.type === 'object') {
		definition.inputSchema = tool.inputSchema as ToolDefinition['inputSchema'];
	}
	return withAgentToolFullReferenceName(withAgentToolPreferences(definition, tool.agentHostPreferences), referenceName);
}

export function getAgentFileToolReferenceName(tool: IToolData, toolsService: ILanguageModelToolsService): string {
	const referenceName = tool.toolReferenceName ?? tool.displayName;
	if (tool.source.type !== 'internal') {
		return toolsService.getFullReferenceName(tool);
	}
	if (browserToolReferenceNames.has(referenceName)) {
		return `browser/${referenceName}`;
	}
	if (notebookToolReferenceNames.has(referenceName)) {
		return `notebook/${referenceName}`;
	}
	return `vscode/${referenceName}`;
}
