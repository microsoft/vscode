/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import type { IAgentModelInfo, IAgentTurnModelResolution } from '../../common/agent.js';
import { readUsageInfoMeta } from '../../common/meta/agentUsageMeta.js';
import { modelRouterNameFromModelId, resolveModelRouter, type IModelRouter, type IResolvedModelRoute, type ModelRouterEffortLevel } from '../../common/modelRouter.js';
import { ReasoningEffortConfigKey, reasoningEffortLevels } from '../../common/reasoningEffort.js';
import { ResponsePartKind, ToolCallStatus, type IModelRoutedInfo, type ModelSelection, type Turn } from '../../common/state/sessionState.js';
import { firstModelRouterError, type IModelRouterFile } from './copilotModelRouterCatalog.js';

// ---- The decision picker -------------------------------------------------------

export interface IModelRouterCandidate {
	readonly id: string;
	readonly name: string;
	readonly when: string;
	readonly examples: readonly string[];
}

export interface IModelRouterFollowUp {
	readonly currentModel: string;
	readonly currentEffort: string | undefined;
	/** The chat's recent turns, oldest first: each user prompt and the final assistant text. */
	readonly recentTurns: readonly { readonly prompt: string; readonly response: string }[];
	readonly turns: number;
	readonly lastTurnState: string | undefined;
	readonly lastTurnToolCalls: number;
	readonly lastTurnFailedToolCalls: number;
}

export interface IModelRouterPickRequest {
	readonly text: string;
	readonly candidates: readonly IModelRouterCandidate[];
	/** The router's `guidance`, applied to every decision. */
	readonly guidance: string;
	/** Whether to also ask how much reasoning effort the request needs. */
	readonly askEffort: boolean;
	readonly followUp?: IModelRouterFollowUp;
	readonly chat: string;
}

export interface IModelRouterPick {
	readonly model: string | undefined;
	readonly confidence: number;
	readonly probabilities: Readonly<Record<string, number>>;
	/** Expected effort rank, from 0 (low) to 4 (max). */
	readonly effortScore?: number;
}

export const enum ModelRouterPickerFailure {
	/** The account can't use the decision model, or the runtime can't ask one. */
	NoDecisionModel = 'noDecisionModel',
	Unavailable = 'unavailable',
}

export class ModelRouterPickerError extends Error {
	constructor(readonly failure: ModelRouterPickerFailure, message: string) {
		super(message);
	}
}

/** Asks a decision model which route fits a request. */
export interface IModelRouterPicker {
	pick(request: IModelRouterPickRequest): Promise<IModelRouterPick>;
}

// ---- Routing policy ------------------------------------------------------------

/** Below this a first-turn pick is treated as "no route fits", and the chat starts on the router's first model. */
const MIN_PICK_CONFIDENCE = 0.4;
/** Follow-ups that only tell the agent to carry on; they keep the chat's model without a routing call. */
const CONTINUATION = /^\s*(ok(ay)?|yes|yep|sure|continue|proceed|next|go ahead|do it|go on|thanks?( you)?)[.!]?\s*$/i;
/** How many earlier turns a follow-up decision sees. */
const RECENT_TURNS = 4;

/** The thresholds a follow-up must clear to move a running chat to the route its message fits. */
export const modelRouterSwitchPolicy = {
	/** How sure the picker must be about the new model. */
	minPickProbability: 0.6,
	/** How far the new model must lead the current one, so a near tie does not move the chat. */
	minLead: 0.25,
	/** Turns to stay put after a switch, so one chat cannot flap between models. */
	cooldownTurns: 2,
	maxSwitchesPerChat: 3,
} as const;

/** How far a follow-up's score must move from the current effort, so a borderline score does not change it. */
const EFFORT_CHANGE_MARGIN = 0.75;

/** An effort level on the picker's scale, where `low` is 0 and `max` is 4. */
export function reasoningEffortRank(level: ModelRouterEffortLevel): number {
	return reasoningEffortLevels.indexOf(level) - reasoningEffortLevels.indexOf('low');
}

/** The supported level closest to a rank on the picker's scale. */
function closestEffort(supported: readonly ModelRouterEffortLevel[], rank: number | undefined): ModelRouterEffortLevel | undefined {
	if (rank === undefined || supported.length === 0) {
		return undefined;
	}
	return supported.reduce((best, effort) => Math.abs(reasoningEffortRank(effort) - rank) < Math.abs(reasoningEffortRank(best) - rank) ? effort : best);
}

export interface IModelRouterEffortInput {
	readonly current: string | undefined;
	readonly score: number | undefined;
	readonly supported: readonly ModelRouterEffortLevel[];
}

/** The effort for a follow-up on the same model. It holds steady unless the request clearly differs. */
export function decideModelRouterEffort({ current, score, supported }: IModelRouterEffortInput): string | undefined {
	if (current === undefined || !supported.includes(current as ModelRouterEffortLevel)) {
		return closestEffort(supported, score);
	}
	if (score === undefined || Math.abs(score - reasoningEffortRank(current as ModelRouterEffortLevel)) < EFFORT_CHANGE_MARGIN) {
		return current;
	}
	return closestEffort(supported, score);
}

export type ModelRouterSwitchDecision = 'stay' | 'switch';

export interface IModelRouterSwitchInput {
	readonly currentModel: string;
	readonly pick: IModelRouterPick;
	readonly turnsSinceSwitch: number | undefined;
	readonly switches: number;
}

/** Decides whether a follow-up moves the chat: it does when its message clearly fits another route. */
export function decideModelRouterSwitch({ currentModel, pick, turnsSinceSwitch, switches }: IModelRouterSwitchInput): ModelRouterSwitchDecision {
	const policy = modelRouterSwitchPolicy;
	if (!pick.model || pick.model === currentModel) {
		return 'stay';
	}
	const pickProbability = pick.probabilities[pick.model] ?? pick.confidence;
	if (pickProbability < policy.minPickProbability || pickProbability - (pick.probabilities[currentModel] ?? 0) < policy.minLead) {
		return 'stay';
	}
	if (switches >= policy.maxSwitchesPerChat || (turnsSinceSwitch !== undefined && turnsSinceSwitch < policy.cooldownTurns)) {
		return 'stay';
	}
	return 'switch';
}

// ---- The engine ----------------------------------------------------------------

export interface IModelRouterRouteRequest {
	readonly chat: string;
	/** The model id the turn selected, `model-router:<name>`. */
	readonly modelId: string;
	/** The router file it selects, if one was found. */
	readonly file: IModelRouterFile | undefined;
	readonly text: string;
	readonly models: readonly IAgentModelInfo[];
	readonly previousTurns: readonly Turn[];
	/** Asks the decision model; without one, a first turn uses the router's first route. */
	readonly picker: IModelRouterPicker | undefined;
}

const keepCurrent: IAgentTurnModelResolution = { selection: undefined, notices: [] };

interface IRouteContext {
	readonly request: IModelRouterRouteRequest;
	readonly router: IModelRouter;
	readonly routes: readonly IResolvedModelRoute[];
	readonly candidates: readonly IModelRouterCandidate[];
}

/**
 * Resolves a `model-router:<name>` selection to one of the router's models for a main-agent turn.
 *
 * The chat's current model comes from its own turns rather than router state, so a pick
 * survives a host restart and a forked chat inherits it.
 */
export class CopilotModelRouter {

	constructor(@ILogService private readonly _logService: ILogService) { }

	async resolve(request: IModelRouterRouteRequest): Promise<IAgentTurnModelResolution> {
		const name = modelRouterNameFromModelId(request.modelId) ?? request.modelId;
		const file = request.file;
		if (!file?.router) {
			return {
				...keepCurrent,
				notices: [file
					? localize('modelRouter.invalid', "The model router {0} has a problem, so this chat kept its current model: {1}", name, firstModelRouterError(file) ?? '')
					: localize('modelRouter.missing', "The model router {0} was not found, so this chat kept its current model.", name)],
			};
		}
		const router = file.router;
		const { routes } = resolveModelRouter(router, request.models);
		if (routes.length === 0) {
			return { ...keepCurrent, notices: [localize('modelRouter.noModels', "None of the models in the model router {0} are available, so this chat kept its current model.", name)] };
		}
		const context: IRouteContext = {
			request, router, routes,
			candidates: routes.map(route => ({ id: route.model.id, name: route.model.name, when: route.route.when, examples: route.route.examples })),
		};
		const last = lastSelectionOf(request.previousTurns);
		// Only this router's own pick is a model to keep: picking a router, or another one, asks for a fresh route.
		const current = last?.router === router.name ? routes.find(route => route.model.id === last.model) : undefined;
		return current
			? this._routeFollowUp(context, current, last?.effort)
			: this._routeFresh(context, last?.model);
	}

	/** Whether the router asks for effort at all: only when it picks effort and some route leaves it open. */
	private _asksEffort({ router, routes }: IRouteContext): boolean {
		return router.effort === 'auto' && routes.some(route => !route.effort);
	}

	/** The effort for a route: its checked fixed level, or the picker's score. Undefined leaves the model's default. */
	private _effortFor({ router }: IRouteContext, route: IResolvedModelRoute, score: number | undefined): string | undefined {
		if (router.effort === 'off') {
			return undefined;
		}
		return route.effort ?? (router.effort === 'auto' ? closestEffort(route.supportedEfforts, score) : undefined);
	}

	/** Picks a model for a chat with none to keep: its first turn, or one whose model is no longer in the router. */
	private async _routeFresh(context: IRouteContext, previousId: string | undefined): Promise<IAgentTurnModelResolution> {
		const { request, routes, router } = context;
		const fallback = routes[0];
		const switchedFrom = (route: IResolvedModelRoute) => previousId && previousId !== route.model.id ? { switchedFrom: previousId } : {};
		if (routes.length === 1) {
			return decision(router, fallback, { ...switchedFrom(fallback), ...preferenceOf(fallback) }, [], this._effortFor(context, fallback, undefined));
		}
		if (!request.text.trim()) {
			return decision(router, fallback, { ...switchedFrom(fallback), defaulted: true }, [], this._effortFor(context, fallback, undefined));
		}
		let pick: IModelRouterPick;
		try {
			if (!request.picker) {
				throw new ModelRouterPickerError(ModelRouterPickerFailure.Unavailable, 'No decision model');
			}
			pick = await request.picker.pick({ text: request.text, candidates: context.candidates, guidance: router.guidance, askEffort: this._asksEffort(context), chat: request.chat });
		} catch (error) {
			this._logService.warn(`[ModelRouter] ${request.chat}: pick failed; using ${fallback.model.id}`, error);
			return decision(router, fallback, { ...switchedFrom(fallback), defaulted: true }, [describeFailure(router.name, error, fallback.model.name)], this._effortFor(context, fallback, undefined));
		}
		const picked = routes.find(route => route.model.id === pick.model);
		if (!picked || pick.confidence < MIN_PICK_CONFIDENCE) {
			this._logService.info(`[ModelRouter] ${request.chat}: no confident pick (${pick.model}, ${pick.confidence}); using ${fallback.model.id}`);
			return decision(router, fallback, { ...switchedFrom(fallback), defaulted: true }, [], this._effortFor(context, fallback, pick.effortScore));
		}
		const effort = this._effortFor(context, picked, pick.effortScore);
		this._logService.info(`[ModelRouter] ${request.chat}: picked ${picked.model.id} (${pick.confidence}) effort=${effort}`);
		return decision(router, picked, { ...switchedFrom(picked), ...preferenceOf(picked) }, [], effort);
	}

	/** Moves the chat when its message clearly fits another route, and otherwise keeps its model. */
	private async _routeFollowUp(context: IRouteContext, current: IResolvedModelRoute, currentEffort: string | undefined): Promise<IAgentTurnModelResolution> {
		const { request, router, routes } = context;
		const stay = decision(router, current, { kept: true }, [], router.effort === 'off' ? undefined : current.effort ?? currentEffort);
		if (!request.picker || router.switching === 'first-turn' || routes.length === 1 || !request.text.trim() || CONTINUATION.test(request.text)) {
			return stay;
		}
		const { previousTurns } = request;
		const lastTurn = previousTurns.at(-1);
		const toolCalls = lastTurn?.responseParts.flatMap(part => part.kind === ResponsePartKind.ToolCall ? [part.toolCall] : []) ?? [];
		let pick: IModelRouterPick;
		try {
			pick = await request.picker.pick({
				text: request.text,
				candidates: context.candidates,
				guidance: router.guidance,
				askEffort: this._asksEffort(context),
				chat: request.chat,
				followUp: {
					currentModel: current.model.id,
					currentEffort,
					recentTurns: previousTurns.slice(-RECENT_TURNS).map(turn => ({ prompt: turn.message.text, response: finalResponseText(turn) })),
					turns: previousTurns.length,
					lastTurnState: lastTurn?.state,
					lastTurnToolCalls: toolCalls.length,
					lastTurnFailedToolCalls: toolCalls.filter(call => call.status === ToolCallStatus.Completed && !call.success).length,
				},
			});
		} catch (error) {
			// A follow-up already has a good model, so a routing outage is not worth interrupting it for.
			this._logService.warn(`[ModelRouter] ${request.chat}: follow-up pick failed; staying on ${current.model.id}`, error);
			return stay;
		}
		const outcome = decideModelRouterSwitch({ currentModel: current.model.id, pick, ...switchHistory(previousTurns) });
		this._logService.info(`[ModelRouter] ${request.chat}: follow-up ${outcome}; current=${current.model.id} pick=${pick.model} probabilities=${JSON.stringify(pick.probabilities)}`);
		const effort = router.effort === 'auto' && !current.effort
			? decideModelRouterEffort({ current: currentEffort, score: pick.effortScore, supported: current.supportedEfforts })
			: this._effortFor(context, current, undefined);
		const target = routes.find(route => route.model.id === pick.model);
		if (outcome === 'stay' || !target) {
			return decision(router, current, { kept: true }, [], effort);
		}
		return decision(router, target, { switchedFrom: current.model.id, ...preferenceOf(target) }, [describeSwitch(router.name, target.model.name)], this._effortFor(context, target, pick.effortScore));
	}
}

function decision(router: IModelRouter, route: IResolvedModelRoute, routed: Partial<IModelRoutedInfo>, notices: readonly string[], effort?: string): IAgentTurnModelResolution {
	const selection: ModelSelection = effort ? { id: route.model.id, config: { [ReasoningEffortConfigKey]: effort } } : { id: route.model.id };
	return {
		selection,
		routed: { router: router.name, chosenModel: route.model.id, ...routed, ...(effort ? { effort } : {}) },
		notices,
	};
}

const PREFERENCE_CHARS = 300;

function preferenceOf(route: IResolvedModelRoute): Partial<IModelRoutedInfo> {
	const line = route.route.when.trim().replace(/\s+/g, ' ');
	return { preference: line.length > PREFERENCE_CHARS ? `${line.slice(0, PREFERENCE_CHARS).trimEnd()}\u2026` : line };
}

function describeSwitch(router: string, model: string): string {
	return localize('modelRouter.switched', "This request fits another route, so the model router {0} moved this chat to {1}.", router, model);
}

function describeFailure(router: string, error: unknown, model: string): string {
	return error instanceof ModelRouterPickerError && error.failure === ModelRouterPickerFailure.NoDecisionModel
		? localize('modelRouter.noDecisionModel', "The model router {0} used {1}, its first model, because your account can't use the decision model that routes chats.", router, model)
		: localize('modelRouter.unavailable', "The model router {0} used {1}, its first model, because routing was unavailable.", router, model);
}

/** The text of a turn's final assistant message: its last markdown part. */
function finalResponseText(turn: Turn): string {
	for (let i = turn.responseParts.length - 1; i >= 0; i--) {
		const part = turn.responseParts[i];
		if (part.kind === ResponsePartKind.Markdown) {
			return part.content;
		}
	}
	return '';
}

/**
 * The model and effort the chat last ran on, and the router that picked them. A pick counts as
 * that router's only while no other selection came after it: a later turn that selected another
 * router but couldn't route (one with errors, say) means the next router to run routes afresh.
 */
function lastSelectionOf(turns: readonly Turn[]): { readonly model: string; readonly effort: string | undefined; readonly router?: string } | undefined {
	const unroutedRouters = new Set<string>();
	for (let i = turns.length - 1; i >= 0; i--) {
		const routed = readUsageInfoMeta(turns[i].usage).modelRouted;
		if (routed) {
			const ownPick = [...unroutedRouters].every(name => name === routed.router);
			return { model: routed.chosenModel, effort: routed.effort, ...(ownPick ? { router: routed.router } : {}) };
		}
		const requested = turns[i].message.model;
		const requestedRouter = modelRouterNameFromModelId(requested?.id);
		if (requested && !requestedRouter) {
			const effort = requested.config?.[ReasoningEffortConfigKey];
			return { model: requested.id, effort: typeof effort === 'string' ? effort : undefined };
		}
		if (requestedRouter) {
			unroutedRouters.add(requestedRouter);
		}
	}
	return undefined;
}

function switchHistory(turns: readonly Turn[]): { readonly turnsSinceSwitch: number | undefined; readonly switches: number } {
	let switches = 0;
	let turnsSinceSwitch: number | undefined;
	turns.forEach((turn, index) => {
		if (readUsageInfoMeta(turn.usage).modelRouted?.switchedFrom) {
			switches++;
			turnsSinceSwitch = turns.length - 1 - index;
		}
	});
	return { turnsSinceSwitch, switches };
}
