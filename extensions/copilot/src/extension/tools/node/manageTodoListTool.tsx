/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { isGpt5PlusFamily } from '../../../platform/endpoint/common/chatModelCapabilities';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

/**
 * The tool definition and typical description is in core. This just lets us apply a model-specific override.
 */
class ManageTodoListTool implements ICopilotTool<unknown> {
	public static readonly toolName = ToolName.CoreManageTodoList;
	public static readonly nonDeferred = true;

	alternativeDefinition(tool: vscode.LanguageModelToolInformation, endpoint?: IChatEndpoint): vscode.LanguageModelToolInformation {
		if (!isGpt5PlusFamily(endpoint)) {
			return tool;
		}

		return {
			...tool,
			// name: 'update_plan', // Can't update this in a model-specific way yet
			description: 'Updates the task plan.\nProvide an optional explanation and a list of plan items, each with a step and status.\nAt most one step can be in_progress at a time.',
		};
	}
}

ToolRegistry.registerTool(ManageTodoListTool);
