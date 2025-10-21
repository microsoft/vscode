/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IChatAgentData, IChatAgentService } from '../common/chatAgents.js';
import { ChatAgentLocation } from '../common/constants.js';

export interface IAgentSelectionService {
	/**
	 * Select a chat agent from available agents
	 * @param location The chat location to filter agents by
	 * @returns The selected agent data, or undefined if cancelled
	 */
	selectAgent(location: ChatAgentLocation): Promise<IChatAgentData | undefined>;

	/**
	 * Get a suitable agent automatically if only one is available, otherwise prompt for selection
	 * @param location The chat location to filter agents by
	 * @returns The agent data, or undefined if none available or cancelled
	 */
	getOrSelectAgent(location: ChatAgentLocation): Promise<IChatAgentData | undefined>;
}

export class AgentSelectionService implements IAgentSelectionService {

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) { }

	private getAvailableAgents(location: ChatAgentLocation): IChatAgentData[] {
		return this.chatAgentService.getAgents()
			.filter(agent => agent.locations.includes(location));
	}

	async selectAgent(location: ChatAgentLocation): Promise<IChatAgentData | undefined> {
		const agents = this.getAvailableAgents(location);

		if (agents.length === 0) {
			return undefined;
		}

		if (agents.length === 1) {
			return agents[0];
		}

		const picks: (IQuickPickItem & { agent: IChatAgentData })[] = agents.map(agent => ({
			label: agent.name,
			description: agent.description,
			agent
		}));

		const selected = await this.quickInputService.pick(picks, {
			title: localize('selectAgent', "Select Agent"),
			placeHolder: localize('selectAgentPlaceholder', "Choose which agent to delegate to"),
			canPickMany: false
		}, CancellationToken.None);

		return selected?.agent;
	}

	async getOrSelectAgent(location: ChatAgentLocation): Promise<IChatAgentData | undefined> {
		const agents = this.getAvailableAgents(location);

		if (agents.length === 0) {
			return undefined;
		}

		if (agents.length === 1) {
			return agents[0];
		}

		return this.selectAgent(location);
	}
}
