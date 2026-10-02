/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE, countEnabledCustomizationTools, IAgentHostToolSetEnablementService } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { countEnabledMcpServerTools, getMcpServerToolSets, IMcpServerToolSet, McpSessionToolsMemory } from './mcpServerToolSets.js';

export const IAICustomizationToolsModel = createDecorator<IAICustomizationToolsModel>('aiCustomizationToolsModel');

/**
 * Shared model behind Chat Customizations → Tools, so the section and every count shown for it
 * (the customizations editor, the Agents window toolbar and overview) agree.
 */
export interface IAICustomizationToolsModel {
	readonly _serviceBrand: undefined;
	/** MCP servers that contribute tools, including disabled ones so they can be re-enabled. */
	readonly mcpServerToolSets: IObservable<readonly IMcpServerToolSet[]>;
	/** Enabled built-in and extension tools plus the tools contributed by enabled MCP servers. */
	readonly enabledToolCount: IObservable<number>;
}

export class AICustomizationToolsModel extends Disposable implements IAICustomizationToolsModel {
	declare readonly _serviceBrand: undefined;

	readonly mcpServerToolSets: IObservable<readonly IMcpServerToolSet[]>;
	readonly enabledToolCount: IObservable<number>;

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService toolEnablementService: IAgentHostToolSetEnablementService,
		@IMcpService mcpService: IMcpService,
		@IAgentHostCustomizationService agentHostCustomizationService: IAgentHostCustomizationService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
	) {
		super();
		const agentHostCustomizationsChanged = observableSignalFromEvent(this, agentHostCustomizationService.onDidChangeCustomizations);
		const mcpToolsMemory = new McpSessionToolsMemory();
		this.mcpServerToolSets = derived(this, reader => {
			agentHostCustomizationsChanged.read(reader);
			const sessionResource = harnessService.activeSessionResource.read(reader);
			return getMcpServerToolSets(
				mcpService.servers.read(reader),
				agentHostCustomizationService.getMcpServers(sessionResource),
				reader,
				{ instance: mcpToolsMemory, sessionKey: sessionResource.toString() },
			);
		});
		this.enabledToolCount = derived(this, reader => {
			const state = toolEnablementService.observe(AGENT_HOST_COPILOT_CLI_SESSION_TYPE).read(reader);
			return countEnabledCustomizationTools(toolsService.toolSets.read(reader), state, reader)
				+ countEnabledMcpServerTools(this.mcpServerToolSets.read(reader), reader);
		});
	}
}

registerSingleton(IAICustomizationToolsModel, AICustomizationToolsModel, InstantiationType.Delayed);
