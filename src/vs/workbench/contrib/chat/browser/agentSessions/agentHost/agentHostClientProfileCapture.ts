/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isStringArray } from '../../../../../../base/common/types.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME } from '../../../../../../platform/agentHost/common/toolSearchConstants.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { WorkbenchContributionsRegistry } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE, IAgentHostToolSetEnablementService } from './agentHostToolSetEnablementService.js';

CommandsRegistry.registerCommand('_test.captureAgentHostClientProfile', async (accessor, options: { toolSets: string[] }) => {
	const environmentService = accessor.get(IWorkbenchEnvironmentService);
	if (!environmentService.extensionTestsLocationURI) {
		throw new Error('Client profile capture is only available during extension tests.');
	}
	if (!options || !isStringArray(options.toolSets) || options.toolSets.length === 0) {
		throw new Error('Client profile capture requires a non-empty list of tool sets.');
	}

	const toolsService = accessor.get(ILanguageModelToolsService);
	const enablementService = accessor.get(IAgentHostToolSetEnablementService);
	const activeClientService = accessor.get(IAgentHostActiveClientService);
	const workspaceService = accessor.get(IWorkspaceContextService);
	await WorkbenchContributionsRegistry.INSTANCE.whenEventually;
	toolsService.flushToolUpdates();

	const toolSets = Array.from(toolsService.toolSets.get());
	const selected = new Set(options.toolSets);
	for (const id of selected) {
		if (!toolSets.some(toolSet => toolSet.id === id && !toolSet.deprecated)) {
			throw new Error(`Client profile tool set is not registered: ${id}`);
		}
	}
	if (!toolsService.getToolByName(CLIENT_TOOL_SEARCH_REFERENCE_NAME)) {
		throw new Error('The Copilot extension has not registered the tool-search tool.');
	}
	for (const toolSet of toolSets) {
		enablementService.setToolSetEnabled(
			AGENT_HOST_COPILOT_CLI_SESSION_TYPE,
			toolSet.id,
			Array.from(toolSet.getTools(), tool => tool.id),
			selected.has(toolSet.id),
		);
	}

	const scope = activeClientService.acquireScope(
		AGENT_HOST_COPILOT_CLI_SESSION_TYPE,
		workspaceService.getWorkspace().folders.map(folder => folder.uri),
	);
	try {
		await scope.whenResolved();
		const tools = [...scope.tools.get()];
		if (tools.length === 0) {
			throw new Error('The initialized client published no tools for the selected profile.');
		}
		return tools;
	} finally {
		scope.dispose();
	}
});
