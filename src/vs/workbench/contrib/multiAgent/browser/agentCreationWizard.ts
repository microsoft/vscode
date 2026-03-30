/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IAgentDefinition, IAgentLaneService, AgentCapability } from '../common/agentLaneService.js';
import { IMultiAgentProviderService } from '../common/multiAgentProviderService.js';
import { BUILT_IN_AGENT_DEFINITIONS } from '../common/builtInAgents.js';

/** Role templates for pre-filling system instructions */
const ROLE_TEMPLATES: Record<string, { instructions: string; capabilities: AgentCapability[]; icon: string }> = {};
for (const agent of BUILT_IN_AGENT_DEFINITIONS) {
	ROLE_TEMPLATES[agent.role] = {
		instructions: agent.systemInstructions,
		capabilities: [...agent.capabilities],
		icon: agent.icon,
	};
}

/**
 * Multi-step QuickInput wizard for creating custom AI agents.
 * Flow: Name → Role → Instructions → Model → Provider(s) → Create + Spawn
 */
export class AgentCreationWizard {

	constructor(
		private readonly _quickInputService: IQuickInputService,
		private readonly _agentLaneService: IAgentLaneService,
		private readonly _providerService: IMultiAgentProviderService,
	) { }

	async run(): Promise<IAgentDefinition | undefined> {
		// Step 1: Agent name
		const name = await this._askName();
		if (!name) {
			return undefined;
		}

		// Step 2: Role selection
		const role = await this._askRole();
		if (!role) {
			return undefined;
		}

		// Step 3: System instructions (pre-filled from role template)
		const template = ROLE_TEMPLATES[role];
		const instructions = await this._askInstructions(template?.instructions ?? '');
		if (!instructions) {
			return undefined;
		}

		// Step 4: Model selection
		const modelId = await this._askModel();
		if (!modelId) {
			return undefined;
		}

		// Step 5: Provider selection (filtered by model compatibility)
		const providerIds = await this._askProviders(modelId);
		if (!providerIds || providerIds.length === 0) {
			return undefined;
		}

		// Create agent definition
		const capabilities = template?.capabilities ?? ['file-read' as AgentCapability];
		const icon = template?.icon ?? 'robot';

		const definition = this._agentLaneService.addAgentDefinition({
			name,
			role,
			description: `Custom ${role} agent`,
			systemInstructions: instructions,
			modelId,
			providerIds,
			icon,
			capabilities,
			maxConcurrentTasks: 1,
		});

		// Auto-spawn the new agent
		this._agentLaneService.spawnAgent(definition.id);

		return definition;
	}

	private async _askName(): Promise<string | undefined> {
		return this._quickInputService.input({
			title: localize('agentWizard.name.title', "Create Agent (1/5)"),
			prompt: localize('agentWizard.name.prompt', "Enter agent name"),
			placeHolder: localize('agentWizard.name.placeholder', "e.g., My Planner, Code Reviewer..."),
			validateInput: (value) => {
				if (!value.trim()) {
					return localize('agentWizard.name.required', "Name is required");
				}
				if (value.length > 50) {
					return localize('agentWizard.name.tooLong', "Name must be 50 characters or less");
				}
				return null;
			},
		});
	}

	private async _askRole(): Promise<string | undefined> {
		const builtInRoles: IQuickPickItem[] = [
			{ label: 'planner', description: localize('role.planner', "Technical planning and architecture") },
			{ label: 'coder', description: localize('role.coder', "Full-stack code implementation") },
			{ label: 'designer', description: localize('role.designer', "UI/UX design and frontend") },
			{ label: 'tester', description: localize('role.tester', "Testing and quality assurance") },
			{ label: 'reviewer', description: localize('role.reviewer', "Code review and quality assessment") },
			{ label: 'debugger', description: localize('role.debugger', "Bug investigation and root cause analysis") },
		];

		const customOption: IQuickPickItem = {
			label: localize('role.custom', "$(add) Custom Role..."),
			description: localize('role.custom.desc', "Define a custom role"),
		};

		const picked = await this._quickInputService.pick(
			[...builtInRoles, { type: 'separator', label: '' } as any, customOption],
			{
				title: localize('agentWizard.role.title', "Create Agent (2/5)"),
				placeHolder: localize('agentWizard.role.placeholder', "Select agent role"),
			},
		);

		if (!picked) {
			return undefined;
		}

		if (picked === customOption) {
			return this._quickInputService.input({
				prompt: localize('agentWizard.customRole.prompt', "Enter custom role name"),
				placeHolder: localize('agentWizard.customRole.placeholder', "e.g., documenter, architect, optimizer..."),
			});
		}

		return picked.label;
	}

	private async _askInstructions(defaultValue: string): Promise<string | undefined> {
		return this._quickInputService.input({
			title: localize('agentWizard.instructions.title', "Create Agent (3/5)"),
			prompt: localize('agentWizard.instructions.prompt', "System instructions for this agent"),
			value: defaultValue,
			placeHolder: localize('agentWizard.instructions.placeholder', "You are a..."),
		});
	}

	private async _askModel(): Promise<string | undefined> {
		const models = this._providerService.getModels();
		const items: IQuickPickItem[] = models.map(m => ({
			label: m.displayName,
			description: m.capabilities.join(', '),
			detail: `${m.id} | Max ${(m.maxContextTokens / 1000).toFixed(0)}k tokens`,
			id: m.id,
		}));

		const picked = await this._quickInputService.pick(items, {
			title: localize('agentWizard.model.title', "Create Agent (4/5)"),
			placeHolder: localize('agentWizard.model.placeholder', "Select AI model"),
		});

		return picked ? (picked as any).id ?? picked.label : undefined;
	}

	private async _askProviders(modelId: string): Promise<string[] | undefined> {
		const compatibleProviders = this._providerService.getCompatibleProviders(modelId);
		const allProviders = this._providerService.getProviders();

		const items: (IQuickPickItem & { providerId: string })[] = allProviders.map(p => {
			const isCompatible = compatibleProviders.some(cp => cp.id === p.id);
			const accountCount = this._providerService.getAccounts(p.id).length;
			return {
				label: p.name,
				description: isCompatible
					? `${accountCount} account(s)`
					: localize('provider.incompatible', "incompatible with selected model"),
				providerId: p.id,
				picked: isCompatible && accountCount > 0,
			};
		});

		const picked = await this._quickInputService.pick(items, {
			title: localize('agentWizard.providers.title', "Create Agent (5/5)"),
			placeHolder: localize('agentWizard.providers.placeholder', "Select providers (ordered by priority)"),
			canPickMany: true,
		});

		if (!picked || picked.length === 0) {
			return undefined;
		}

		// Validate compatibility
		const selectedIds = (picked as (IQuickPickItem & { providerId: string })[]).map(p => p.providerId);
		const validation = this._agentLaneService.validateModelProviderAssignment(modelId, selectedIds);
		if (!validation.valid) {
			// Show error and retry
			await this._quickInputService.pick([], {
				placeHolder: localize('agentWizard.providers.error', "Error: {0}. Please try again.", validation.errors.join(', ')),
			});
			return this._askProviders(modelId);
		}

		return selectedIds;
	}
}
