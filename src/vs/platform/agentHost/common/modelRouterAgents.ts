/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentModelInfo } from './agent.js';
import { isRoutableModel, matchModelReference, modelRouterLabel, supportedModelEfforts, type IModelRouter, type IModelRouterRole, type ModelRouterEffortLevel } from './modelRouter.js';
import { PolicyState } from './state/protocol/channels-root/state.js';

/*
 * The agents of a model router's playbook: the roles its main agent can start as subagents, each
 * on its own model, and the guidance for the main agent. This layer sits beside routing and reads
 * only the playbook routing chose. A router without `roles`, `uses` or playbook `guidance` has no
 * plan, and then nothing here runs.
 */

/** One agent of a playbook, matched to a model the account has. Plain data, so two plans can be compared by value. */
export interface IModelRouterAgent {
	/** The role's name in the router file. */
	readonly name: string;
	readonly description: string;
	/** The custom agent the role reuses, by its authored name. */
	readonly agent?: string;
	/** The model the agent runs on; without one it keeps its custom agent's model, else the chat's. */
	readonly model?: string;
	readonly modelName?: string;
	readonly effort?: ModelRouterEffortLevel;
}

/** What a chat gets from the playbook its first message was routed to. */
export interface IModelRouterAgentPlan {
	/** The router's name as the model picker shows it. */
	readonly router: string;
	readonly playbook: string;
	/** How the user wants the work done, for the chat's main agent. */
	readonly guidance?: string;
	readonly agents: readonly IModelRouterAgent[];
}

/** A playbook agent a session really has. */
export interface IInstalledModelRouterAgent {
	/** The name the `task` tool starts it by, which is its role's name. */
	readonly agentType: string;
	readonly description: string;
}

function resolveRoleModel(role: IModelRouterRole, routable: readonly IAgentModelInfo[]): IAgentModelInfo | undefined {
	for (const reference of role.models) {
		const match = matchModelReference(routable, reference);
		if (match?.kind === 'model' && match.model.policyState !== PolicyState.Disabled) {
			return match.model;
		}
	}
	return undefined;
}

/**
 * The plan of one playbook, or `undefined` when the playbook brings neither agents nor guidance.
 * Never an empty plan: callers compare plans by identity, and "no plan" has to be one value.
 */
export function resolveModelRouterAgentPlan(router: IModelRouter, playbook: string, models: readonly IAgentModelInfo[]): IModelRouterAgentPlan | undefined {
	const route = router.routes.find(candidate => candidate.name === playbook);
	if (!route || (!route.uses?.length && !route.mainAgentGuidance)) {
		return undefined;
	}
	const routable = models.filter(isRoutableModel);
	const agents = (route.uses ?? []).flatMap((name): IModelRouterAgent[] => {
		const role = router.roles?.find(candidate => candidate.name === name);
		if (!role) {
			return [];
		}
		const model = resolveRoleModel(role, routable);
		// An effort is checked against the role's own model. An agent that keeps its custom
		// agent's model, or the chat's, gets the effort as written: that model is not known here.
		const effort = role.effort && (!model || supportedModelEfforts(model).includes(role.effort)) ? role.effort : undefined;
		return [{
			name: role.name,
			description: role.description,
			...(role.agent ? { agent: role.agent } : {}),
			...(model ? { model: model.id, modelName: model.name } : {}),
			...(effort ? { effort } : {}),
		}];
	});
	return {
		router: modelRouterLabel(router),
		playbook,
		...(route.mainAgentGuidance ? { guidance: route.mainAgentGuidance } : {}),
		agents,
	};
}

/** What the check tool says about a router's roles on this account. */
export function modelRouterRoleWarnings(router: IModelRouter, models: readonly IAgentModelInfo[]): string[] {
	const routable = models.filter(isRoutableModel);
	const warnings: string[] = [];
	for (const role of router.roles ?? []) {
		if (role.models.length && !resolveRoleModel(role, routable)) {
			warnings.push(`Role \`${role.name}\` (${role.models.join(', ')}) runs on ${role.agent ? 'its agent\'s model, else the chat\'s' : 'the chat\'s model'}: none of its models are available on this account.`);
		}
		if (!router.routes.some(route => route.uses?.includes(role.name))) {
			warnings.push(`Role \`${role.name}\` is not used by any playbook.`);
		}
	}
	return warnings;
}

/**
 * The note that tells a chat's main agent how the user wants the work done and which agents it
 * can start. It lists only the agents the session really has, each by the name that starts it.
 */
export function modelRouterBriefing(plan: IModelRouterAgentPlan, installed: readonly IInstalledModelRouterAgent[]): string | undefined {
	if (!plan.guidance && installed.length === 0) {
		return undefined;
	}
	const lines = [
		'<model_router_playbook>',
		'This note is for the main agent of this chat only. If you were started as a subagent, ignore it.',
		`The user's model router "${plan.router}" chose its "${plan.playbook}" playbook for this chat.`,
	];
	if (plan.guidance) {
		lines.push('', 'How the user wants the work done:', plan.guidance);
	}
	if (installed.length) {
		lines.push('', 'Agents you can start with the task tool, by passing the name as its agent_type:');
		for (const agent of installed) {
			const description = agent.description.replace(/\s+/g, ' ').trim();
			lines.push(`- \`${agent.agentType}\`${description ? `: ${description}` : ''}`);
		}
		lines.push('', 'Start one of these agents whenever the guidance or the work calls for it. Each already runs on the model the user chose for it, so do not pass a model when you start one.');
	}
	lines.push('</model_router_playbook>');
	return lines.join('\n');
}
