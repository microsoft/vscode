/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { IToolData, IToolSet, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

/** Id of the read-only tool set listing the Copilot CLI's built-in tools. */
export const COPILOT_CLI_BUILTIN_TOOL_SET_ID = 'copilot-cli';

/**
 * The Copilot CLI's built-in tools, surfaced read-only for reference. Mirrored from the published
 * "Tool availability values" table (the SDK does not expose this list at runtime); keep in sync:
 * https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#tool-availability-values
 */
function getCopilotCliTools(): readonly { readonly name: string; readonly description: string }[] {
	return [
		// Shell tools
		{ name: 'bash / powershell', description: localize('copilotCliTool.shell', "Execute commands") },
		{ name: 'list_bash / list_powershell', description: localize('copilotCliTool.listShell', "List active shell sessions") },
		{ name: 'read_bash / read_powershell', description: localize('copilotCliTool.readShell', "Read output from a shell session") },
		{ name: 'stop_bash / stop_powershell', description: localize('copilotCliTool.stopShell', "Terminate a shell session") },
		{ name: 'write_bash / write_powershell', description: localize('copilotCliTool.writeShell', "Send input to a shell session") },
		// File operation tools
		{ name: 'apply_patch', description: localize('copilotCliTool.applyPatch', "Apply patches (used by some models instead of edit/create)") },
		{ name: 'create', description: localize('copilotCliTool.create', "Create new files") },
		{ name: 'edit', description: localize('copilotCliTool.edit', "Edit files via string replacement") },
		{ name: 'view', description: localize('copilotCliTool.view', "Read files or directories") },
		// Agent and task delegation tools
		{ name: 'list_agents', description: localize('copilotCliTool.listAgents', "List available agents") },
		{ name: 'read_agent', description: localize('copilotCliTool.readAgent', "Check background agent status") },
		{ name: 'task', description: localize('copilotCliTool.task', "Run subagents") },
		// Other tools
		{ name: 'ask_user', description: localize('copilotCliTool.askUser', "Ask the user a question") },
		{ name: 'glob', description: localize('copilotCliTool.glob', "Find files matching patterns") },
		{ name: 'grep (or rg)', description: localize('copilotCliTool.grep', "Search for text in files") },
		{ name: 'skill', description: localize('copilotCliTool.skill', "Invoke custom skills") },
		{ name: 'web_fetch', description: localize('copilotCliTool.webFetch', "Fetch and parse web content") },
	];
}

let copilotCliBuiltinToolSet: IToolSet | undefined;

/** The read-only tool set of Copilot CLI built-in tools shown in Chat Customizations → Tools. */
export function getCopilotCliBuiltinToolSet(): IToolSet {
	if (!copilotCliBuiltinToolSet) {
		const tools: IToolData[] = getCopilotCliTools().map(t => ({
			id: `${COPILOT_CLI_BUILTIN_TOOL_SET_ID}:${t.name}`,
			displayName: t.name,
			modelDescription: t.description,
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: false,
		}));
		copilotCliBuiltinToolSet = {
			id: COPILOT_CLI_BUILTIN_TOOL_SET_ID,
			referenceName: 'copilotCli',
			icon: Codicon.copilot,
			source: ToolDataSource.Internal,
			description: localize('clientToolSet.copilotCli.description', "Copilot"),
			detail: localize('clientToolSet.copilotCli.detail', "Built-in tools the Copilot agent runs inside its own runtime."),
			getTools: () => tools,
		};
	}
	return copilotCliBuiltinToolSet;
}

/** All tool sets surfaced in Chat Customizations → Tools: the registered sets plus the Copilot CLI built-ins. */
export function getCustomizationToolSets<T>(registeredToolSets: Iterable<T>): (T | IToolSet)[] {
	return [...registeredToolSets, getCopilotCliBuiltinToolSet()];
}
