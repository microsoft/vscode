/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { hash } from '../../../../base/common/hash.js';
import { agentDecisionErrorKind, type IAgentDecisionQuestion, type IAgentDecisionsRequest, type IAgentDecisionsResult } from '../../common/agentDecisions.js';
import { MODEL_ROUTER_DECISION_MODEL, MODEL_ROUTER_MAX_ROUTES } from '../../common/modelRouter.js';
import { ModelRouterPickerError, ModelRouterPickerFailure, type IModelRouterPick, type IModelRouterPicker, type IModelRouterPickRequest } from './copilotModelRouter.js';

/** Routing holds up the turn, so a slow decision falls back to the router's first route. */
const DECISION_TIMEOUT_MS = 5000;
/** Limits on what is sent, as UTF-8 bytes after JSON escaping, which is how the runtime measures requests. */
export const modelRouterRequestLimits = {
	prompt: 32 * 1024,
	recentTurn: 8 * 1024,
	/** The whole request; the runtime rejects more than 256 KiB. */
	request: 200 * 1024,
} as const;

export type ModelRouterAskDecisions = (request: IAgentDecisionsRequest) => Promise<IAgentDecisionsResult>;

/** Without this, the decision model judges a request by its length and routes most of them to the lightest model. */
const agentFraming = 'The request goes to an AI coding agent that works in the user\'s repositories with tools: it can read files, run commands and edit code. Judge the work the request needs to be done well, not how short the message is: a short message can start a long investigation.';

/** Short follow-ups read as easy on their own; the work they hand over usually isn't. */
const followUpEffortNote = 'This is a follow-up in an ongoing chat; recentTurns are the earlier messages and replies. Read the latest message together with them: a short message such as "fix it", "do that", "go ahead and implement it" or "open a PR with the fix" asks the agent to carry out the work the earlier turns discussed, so judge the work that involves, not the length of the message.';

/** A first turn's message goes as plain text, as the Decisions API expects its input; this routes better than a JSON field. */
const firstTurnLead = 'A user sent this message to an AI coding agent:\n\n';

const effortCriteria: readonly string[] = [
	'Low: a trivial lookup, mechanical edit, or simple explanation.',
	'Medium: a well-specified, multi-step task in a familiar area.',
	'High: complex reasoning or difficult coding; ambiguous, multi-file, or earlier attempts failed.',
	'Extra high: only when a route asks for extra high effort on this kind of request.',
	'Max: only when a route asks for max effort on this kind of request.',
];

/** Asks the decision model which route fits a request, through the agent's gated `askDecisions`. */
export class DecisionsModelRouterPicker implements IModelRouterPicker {

	constructor(private readonly _ask: ModelRouterAskDecisions) { }

	async pick(request: IModelRouterPickRequest): Promise<IModelRouterPick> {
		if (request.candidates.length > MODEL_ROUTER_MAX_ROUTES) {
			throw new ModelRouterPickerError(ModelRouterPickerFailure.Unavailable, `A router picks between at most ${MODEL_ROUTER_MAX_ROUTES} models`);
		}
		let result: IAgentDecisionsResult;
		try {
			result = await this._ask(buildModelRouterDecisionsRequest(request));
		} catch (error) {
			const kind = agentDecisionErrorKind(error);
			throw new ModelRouterPickerError(
				kind === 'notEnabled' || kind === 'noModel' || kind === 'unauthenticated' ? ModelRouterPickerFailure.NoDecisionModel : ModelRouterPickerFailure.Unavailable,
				`decisions.ask failed: ${kind ?? (error instanceof Error ? error.name : 'unknown')}`,
			);
		}
		return toPick(result);
	}
}

/** Rotates the options by the request, so the decision model doesn't favour whichever route is listed first. */
function rotateForRequest<T>(items: readonly T[], text: string): readonly T[] {
	const start = Math.abs(hash(text)) % Math.max(items.length, 1);
	return [...items.slice(start), ...items.slice(0, start)];
}

function escapedBytes(value: unknown): number {
	return VSBuffer.fromString(JSON.stringify(value)).byteLength;
}

/** The longest prefix of `text` that is at most `maxBytes` once JSON-escaped (quotes excluded). */
export function truncateToEscapedBytes(text: string, maxBytes: number): string {
	if (escapedBytes(text) - 2 <= maxBytes) {
		return text;
	}
	let low = 0;
	let high = text.length;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (escapedBytes(text.slice(0, mid)) - 2 <= maxBytes) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}
	// Don't leave half of a surrogate pair at the end.
	const end = low > 0 && /[\uD800-\uDBFF]/.test(text[low - 1]) ? low - 1 : low;
	return text.slice(0, end);
}

export function buildModelRouterDecisionsRequest(request: IModelRouterPickRequest): IAgentDecisionsRequest {
	const { followUp } = request;
	const routes = request.candidates.map(candidate => `${candidate.name}: ${describeRoute(candidate)}`).join('\n');
	const guidance = request.guidance ? `\n\nThe user's guidance for every request:\n${request.guidance}` : '';
	const questions: IAgentDecisionQuestion[] = [{
		kind: 'choice',
		name: 'model',
		instructions: `${agentFraming}\n\nPick the model the user would want for this request, going by the routes they wrote for when to use each model. Follow the routes over your own view of the models.${guidance}`,
		options: rotateForRequest(request.candidates, request.text).map(candidate => ({ value: candidate.id, description: `${candidate.name}. Use for: ${describeRoute(candidate)}` })),
	}];
	if (request.askEffort) {
		questions.push({
			kind: 'score',
			name: 'effort',
			instructions: `${agentFraming}\n\nHow much reasoning effort does this request need? If one of the routes below covers this kind of request and says what effort to use, follow it.\n\n${routes}${guidance}${followUp ? `\n\n${followUpEffortNote}` : ''}`,
			levels: effortCriteria.map(criterion => ({ label: criterion.slice(0, criterion.indexOf(':')), description: criterion })),
		});
	}
	let prompt = truncateToEscapedBytes(request.text, modelRouterRequestLimits.prompt);
	let recentTurns = followUp?.recentTurns.map(turn => {
		const prompt = truncateToEscapedBytes(turn.prompt, modelRouterRequestLimits.recentTurn / 2);
		return { prompt, response: truncateToEscapedBytes(turn.response, modelRouterRequestLimits.recentTurn - escapedBytes(prompt)) };
	}) ?? [];
	const build = (): IAgentDecisionsRequest => ({
		model: MODEL_ROUTER_DECISION_MODEL,
		context: followUp
			? { kind: 'json', value: { request: prompt, ...followUp, recentTurns } }
			: { kind: 'text', text: `${firstTurnLead}${prompt}` },
		questions,
		timeoutMs: DECISION_TIMEOUT_MS,
		purpose: 'vscode.modelRouter.route',
	});
	let built = build();
	// The caps above keep requests well under the limit; this only guards against long route text.
	while (escapedBytes(built) > modelRouterRequestLimits.request && (recentTurns.length || prompt.length)) {
		if (recentTurns.length) {
			recentTurns = recentTurns.slice(1);
		} else {
			prompt = prompt.slice(0, Math.floor(prompt.length / 2));
		}
		built = build();
	}
	// Routing without the user's request, or over the limit, would be a guess, so the router falls back instead.
	if (escapedBytes(built) > modelRouterRequestLimits.request || (request.text.trim() && !prompt.trim())) {
		throw new ModelRouterPickerError(ModelRouterPickerFailure.Unavailable, 'The route descriptions leave no room for the request');
	}
	return built;
}

function describeRoute(candidate: IModelRouterPickRequest['candidates'][number]): string {
	return candidate.examples.length ? `${candidate.when} Examples: ${candidate.examples.map(example => JSON.stringify(example)).join('; ')}` : candidate.when;
}

/** A tied or refused model answer is no pick, so the router falls back rather than choosing between equals. */
function toPick(result: IAgentDecisionsResult): IModelRouterPick {
	const answer = (name: string) => result.answers.find(candidate => candidate.name === name);
	const model = answer('model');
	const effort = answer('effort');
	const clearModel = model?.kind === 'choice' && !model.tied ? model : undefined;
	return {
		model: clearModel?.value,
		confidence: clearModel?.confidence ?? 0,
		probabilities: model?.kind === 'choice' ? Object.fromEntries(model.probabilities.map(entry => [entry.value, entry.probability])) : {},
		...(effort?.kind === 'score' ? { effortScore: effort.score } : {}),
	};
}
