/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInformation } from 'vscode';
import { assertNever } from '../../../../util/vs/base/common/assert';
import { groupBy } from '../../../../util/vs/base/common/collections';
import { getToolsForCategory, toolCategories, ToolCategory, ToolName } from '../toolNames';
import { VIRTUAL_TOOL_NAME_PREFIX, VirtualTool } from './virtualTool';
import * as Constant from './virtualToolsConstants';

const BUILT_IN_GROUP = 'builtin';
const SUMMARY_PREFIX = 'Call this tool when you need access to a new category of tools. The category of tools is described as follows:\n\n';
const SUMMARY_SUFFIX = '\n\nBe sure to call this tool if you need a capability related to the above.';

/**
 * Get the summary description for a tool category.
 * For RedundantButSpecific, dynamically includes the list of tool names.
 */
function getCategorySummary(category: ToolCategory): string {
	switch (category) {
		case ToolCategory.JupyterNotebook:
			return 'Call tools from this group when you need to work with Jupyter notebooks - creating, editing, running cells, and managing notebook operations.';
		case ToolCategory.WebInteraction:
			return 'Call tools from this group when you need to interact with web content, browse websites, or access external resources.';
		case ToolCategory.VSCodeInteraction:
			return 'Call tools from this group when you need to interact with the VS Code workspace and access VS Code features.';
		case ToolCategory.Testing:
			return 'Call tools from this group when you need to run tests, analyze test failures, and manage test workflows.';
		case ToolCategory.RedundantButSpecific: {
			const toolNames = getToolsForCategory(category);
			return `These tools have overlapping functionalities but are highly specialized for certain tasks. Tools: ${toolNames.join(', ')}`;
		}
		case ToolCategory.Core:
			return 'Core tools that should always be available without grouping.';
		default:
			return assertNever(category);
	}
}

export class BuiltInToolGroupHandler {
	constructor() { }

	/** Creates groups for built-in tools based on the type-safe categorization system */
	createBuiltInToolGroups(tools: LanguageModelToolInformation[]): (VirtualTool | LanguageModelToolInformation)[] {
		// If there are too few tools, don't group them
		if (tools.length <= Constant.MIN_TOOLSET_SIZE_TO_GROUP) {
			return tools;
		}

		const contributedTools = tools.filter(t => !toolCategories.hasOwnProperty(t.name));
		const builtInTools = tools.filter(t => toolCategories.hasOwnProperty(t.name));

		// Filter out Core tools from grouping (they should remain individual)
		const toolsToGroup = builtInTools.filter(t => toolCategories[t.name as ToolName] !== ToolCategory.Core);
		const coreTools = builtInTools.filter(t => toolCategories[t.name as ToolName] === ToolCategory.Core);

		const categories = groupBy(toolsToGroup, t => toolCategories[t.name as ToolName]);
		const virtualTools = Object.entries(categories).flatMap<VirtualTool | LanguageModelToolInformation>(([category, tools]) => {
			if (tools.length < Constant.MIN_TOOLSET_SIZE_TO_GROUP) {
				return tools;
			}

			return new VirtualTool(
				VIRTUAL_TOOL_NAME_PREFIX + category.toLowerCase().replace(/\s+/g, '_'),
				SUMMARY_PREFIX + getCategorySummary(category as ToolCategory) + SUMMARY_SUFFIX,
				0,
				{
					possiblePrefix: 'builtin_',
					wasExpandedByDefault: false,
					canBeCollapsed: true
				},
				tools
			);
		});

		// Return: virtual tool groups + individual core tools + contributed tools
		return [...virtualTools, ...coreTools, ...contributedTools];
	}

	static get BUILT_IN_GROUP_KEY(): string {
		return BUILT_IN_GROUP;
	}
}