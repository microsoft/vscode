/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentModelInfo } from './agent.js';
import { isRoutableModel, matchModelReference, modelRouterLabel, supportedModelEfforts, type IModelRouter, type IModelRouterRole, type ModelRouterEffortLevel } from './modelRouter.js';
import { PolicyState } from './state/protocol/channels-root/state.js';

/*
 * The helpers of a model router's playbook: the roles its main agent can start as subagents, each
 * on its own model, and the guidance for that agent. This layer sits beside routing and reads only
 * the playbook routing chose. A router without `roles`, `uses` or playbook `guidance` has no plan,
 * and then nothing here runs.
 */

/** One helper of a playbook, matched to a model the account has. Plain data, so two plans can be compared by value. */
export interface IModelRouterHelper {
	/** The role's name in the router file. */
	readonly name: string;
	readonly description: string;
	/** The custom agent the role reuses, by its authored name. */
	readonly agent?: string;
	/** The model the helper runs on; without one it keeps its agent's model, else the chat's. */
	readonly model?: string;
	readonly modelName?: string;
	readonly effort?: ModelRouterEffortLevel;
}

/** What a chat gets from the playbook its first message was routed to. */
export interface IModelRouterHelperPlan {
	/** The router's name as the model picker shows it. */
	readonly router: string;
	readonly playbook: string;
	readonly guidance?: string;
	readonly helpers: readonly IModelRouterHelper[];
}

/** A helper a session really has, and the name the `task` tool starts it by. */
export interface IInstalledModelRouterHelper {
	/** The role's name, or the authored name of the agent it reuses. */
	readonly name: string;
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
 * The plan of one playbook, or `undefined` when the playbook brings neither helpers nor guidance.
 * Never an empty plan: callers compare plans by identity, and "no plan" has to be one value.
 */
export function resolveModelRouterHelperPlan(router: IModelRouter, playbook: string, models: readonly IAgentModelInfo[]): IModelRouterHelperPlan | undefined {
	const route = router.routes.find(candidate => candidate.name === playbook);
	if (!route || (!route.uses?.length && !route.helperGuidance)) {
		return undefined;
	}
	const routable = models.filter(isRoutableModel);
	const helpers = (route.uses ?? []).flatMap((name): IModelRouterHelper[] => {
		const role = router.roles?.find(candidate => candidate.name === name);
		if (!role) {
			return [];
		}
		const model = resolveRoleModel(role, routable);
		const effort = role.effort && supportedModelEfforts(model).includes(role.effort) ? role.effort : undefined;
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
		...(route.helperGuidance ? { guidance: route.helperGuidance } : {}),
		helpers,
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
 * The note that tells a chat's main agent how the user wants the work done and which helpers it
 * has. It lists only the helpers the session really has, each by the name that starts it.
 */
export function modelRouterBriefing(plan: IModelRouterHelperPlan, installed: readonly IInstalledModelRouterHelper[]): string | undefined {
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
		lines.push('', 'Helpers you can start with the task tool:');
		for (const helper of installed) {
			const description = helper.description.replace(/\s+/g, ' ').trim();
			lines.push(`- ${helper.name} (agent_type: \`${helper.agentType}\`)${description ? `: ${description}` : ''}`);
		}
		lines.push('', 'Start a helper whenever the guidance or the work calls for it. Each helper already runs on the model the user chose for it, so do not pass a model when you start one.');
	}
	lines.push('</model_router_playbook>');
	return lines.join('\n');
}
