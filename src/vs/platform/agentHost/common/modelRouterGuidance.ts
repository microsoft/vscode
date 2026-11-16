/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentModelInfo } from './agent.js';
import { modelRouterLabel, resolveModelRouter, type IModelRouter } from './modelRouter.js';
import type { IModelRoutedInfo } from './state/sessionState.js';

/*
 * A route's `guidance`: how the user wants the work of a chat on that route done. It is for the
 * chat's main agent, and routing never reads it. A router whose routes have no `guidance` has
 * none, and then nothing here runs.
 */

/** What a chat's main agent is told from the route its first message was routed to. Plain data, so two can be compared by value. */
export interface IModelRouterGuidance {
	/** The router's name as the model picker shows it. */
	readonly router: string;
	/** The route's name, when it has one. */
	readonly route?: string;
	readonly guidance: string;
}

/**
 * The guidance of the route a turn was routed to, or `undefined` when that route has none.
 * Never an empty one: callers compare by identity, and "no guidance" has to be one value.
 */
export function resolveModelRouterGuidance(router: IModelRouter, routed: Pick<IModelRoutedInfo, 'routeName' | 'chosenModel'>, models: readonly IAgentModelInfo[]): IModelRouterGuidance | undefined {
	// A route is found the way routing knows it: by its name, or by the model it resolved to.
	const key = routed.routeName ?? routed.chosenModel;
	const route = resolveModelRouter(router, models).routes.find(candidate => (candidate.route.name ?? candidate.model.id) === key)?.route;
	if (!route?.mainAgentGuidance) {
		return undefined;
	}
	return { router: modelRouterLabel(router), ...(route.name ? { route: route.name } : {}), guidance: route.mainAgentGuidance };
}

/** The note that tells a chat's main agent how the user wants the work done. */
export function modelRouterBriefing({ router, route, guidance }: IModelRouterGuidance): string {
	return [
		'<model_router_guidance>',
		'This note is for the main agent of this chat only. If you were started as a subagent, ignore it.',
		route
			? `The user's model router "${router}" chose its "${route}" route for this chat.`
			: `The user's model router "${router}" chose a route for this chat.`,
		'',
		'How the user wants the work done:',
		guidance,
		'</model_router_guidance>',
	].join('\n');
}
