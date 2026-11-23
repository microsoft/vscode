/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';
import type { ModelRouterSwitching } from '../../modelRouter.js';

const VSCODE_MODEL_ROUTER_ROUTES_META_KEY = 'vscode.chat.modelRouterRoutes';
const VSCODE_MODEL_ROUTER_SWITCHING_META_KEY = 'vscode.chat.modelRouterSwitching';

/** One route of a model router, as the router's row in the model picker describes it. */
export interface IAgentModelRouterRoute {
	/** The route's name, when it has one. */
	readonly name?: string;
	/** The name of the model the route runs on for this account. */
	readonly model: string;
	/** The route's fixed effort, or `auto` when the router chooses it. Absent when the model keeps its default. */
	readonly effort?: string;
	/** The context window, in tokens, the router sets for the route. Absent when the model keeps its own. */
	readonly contextTokens?: number;
}

/** Adds a model router's routes, in the router's order, to its model row. A row without routes is left as it is. */
export function withAgentModelRouterRoutesMeta(meta: Record<string, unknown> | undefined, routes: readonly IAgentModelRouterRoute[]): Record<string, unknown> | undefined {
	return routes.length ? { ...meta, [VSCODE_MODEL_ROUTER_ROUTES_META_KEY]: routes.map(route => ({ ...route })) } : meta;
}

/** A model router row's routes, in the router's order. Empty for other models, and for a host that lists none. */
export function readAgentModelRouterRoutesMeta(model: IAgentModelInfo | SessionModelInfo): IAgentModelRouterRoute[] {
	const value = model._meta?.[VSCODE_MODEL_ROUTER_ROUTES_META_KEY];
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((entry: unknown): IAgentModelRouterRoute[] => {
		if (!isObject(entry)) {
			return [];
		}
		const { name, model: routeModel, effort, contextTokens } = entry as { name?: unknown; model?: unknown; effort?: unknown; contextTokens?: unknown };
		if (typeof routeModel !== 'string' || !routeModel) {
			return [];
		}
		return [{
			...(typeof name === 'string' && name ? { name } : {}),
			model: routeModel,
			...(typeof effort === 'string' && effort ? { effort } : {}),
			...(typeof contextTokens === 'number' && Number.isFinite(contextTokens) && contextTokens > 0 ? { contextTokens } : {}),
		}];
	});
}

/**
 * Adds to a model router's row whether a chat on it can move to another route after its first
 * message. Left out when the router has nothing to switch between.
 */
export function withAgentModelRouterSwitchingMeta(meta: Record<string, unknown> | undefined, switching: ModelRouterSwitching | undefined): Record<string, unknown> | undefined {
	return switching ? { ...meta, [VSCODE_MODEL_ROUTER_SWITCHING_META_KEY]: switching } : meta;
}

/** Whether a chat on a model router's row can move to another route. `undefined` for other models, and for a host that does not say. */
export function readAgentModelRouterSwitchingMeta(model: IAgentModelInfo | SessionModelInfo): ModelRouterSwitching | undefined {
	const value = model._meta?.[VSCODE_MODEL_ROUTER_SWITCHING_META_KEY];
	return value === 'auto' || value === 'first-turn' ? value : undefined;
}
