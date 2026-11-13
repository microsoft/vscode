/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-off questions to a decision model, which answers with probabilities instead of text.
 * These mirror the Copilot SDK's `decisions.ask` contract, which the runtime validates.
 */
export interface IAgentDecisionsRequest {
	/** A decision model id; the provider's default when omitted. */
	readonly model?: string;
	readonly context: IAgentDecisionContext;
	readonly questions: IAgentDecisionQuestion[];
	/** End-to-end deadline, 250 to 30000 milliseconds. */
	readonly timeoutMs?: number;
	/** Static identifier of the calling feature, for telemetry only. */
	readonly purpose?: string;
}

export type IAgentDecisionContext =
	| { readonly kind: 'text'; readonly text: string }
	/** A JSON object, or an array of JSON objects. */
	| { readonly kind: 'json'; readonly value: object };

export type IAgentDecisionQuestion =
	| { readonly kind: 'boolean'; readonly name: string; readonly instructions: string; readonly whenTrue?: string; readonly whenFalse?: string }
	| { readonly kind: 'choice'; readonly name: string; readonly instructions: string; readonly options: { readonly value: string; readonly description: string }[] }
	| { readonly kind: 'score'; readonly name: string; readonly instructions: string; readonly levels: { readonly label: string; readonly description: string }[] };

export interface IAgentDecisionsResult {
	/** The decision model that answered. */
	readonly model: string;
	/** One answer per question, in request order. */
	readonly answers: readonly IAgentDecisionAnswer[];
}

export type IAgentDecisionAnswer =
	| { readonly kind: 'boolean'; readonly name: string; readonly probability: number }
	| {
		readonly kind: 'choice';
		readonly name: string;
		readonly value: string;
		/** Another option has exactly the same probability as `value`. */
		readonly tied: boolean;
		readonly confidence: number;
		readonly probabilities: readonly { readonly value: string; readonly probability: number }[];
	}
	| {
		readonly kind: 'score';
		readonly name: string;
		/** Expected level position, from 0 for the first level. */
		readonly score: number;
		readonly level: string;
		readonly confidence: number;
	}
	| { readonly kind: 'refused'; readonly name: string };

/** Why a decisions request failed, as the runtime reports it in the error's `data.kind`. */
export type AgentDecisionErrorKind =
	| 'notEnabled' | 'noModel' | 'unauthenticated' | 'invalidRequest' | 'tooLarge'
	| 'upstreamProtocol' | 'rateLimited' | 'timeout' | 'unavailable' | 'overloaded';

const agentDecisionErrorKinds: ReadonlySet<string> = new Set<AgentDecisionErrorKind>([
	'notEnabled', 'noModel', 'unauthenticated', 'invalidRequest', 'tooLarge',
	'upstreamProtocol', 'rateLimited', 'timeout', 'unavailable', 'overloaded',
]);

/** The typed failure behind a rejected decisions request. */
export interface IAgentDecisionErrorData {
	readonly kind: AgentDecisionErrorKind;
	/** How long to wait before asking again, when the service said so. */
	readonly retryAfterMs?: number;
}

/** The typed failure data of a rejected decisions request. Other RPCs also put a `kind` in error data, so only the decision kinds count. */
export function agentDecisionErrorData(error: unknown): IAgentDecisionErrorData | undefined {
	const data = (error as { readonly data?: { readonly kind?: unknown; readonly retryAfterMs?: unknown } } | undefined)?.data;
	if (typeof data?.kind !== 'string' || !agentDecisionErrorKinds.has(data.kind)) {
		return undefined;
	}
	return {
		kind: data.kind as AgentDecisionErrorKind,
		...(typeof data.retryAfterMs === 'number' && data.retryAfterMs >= 0 ? { retryAfterMs: data.retryAfterMs } : {}),
	};
}

/** The typed failure kind of a rejected decisions request, if it has one. */
export function agentDecisionErrorKind(error: unknown): AgentDecisionErrorKind | undefined {
	return agentDecisionErrorData(error)?.kind;
}

/** A failure raised without calling the service, carrying the kind the service last reported. */
export class AgentDecisionsUnavailableError extends Error {
	readonly data: IAgentDecisionErrorData;

	constructor(data: IAgentDecisionErrorData) {
		super(`Decisions are unavailable: ${data.kind}`);
		this.name = 'AgentDecisionsUnavailableError';
		this.data = data;
	}
}
