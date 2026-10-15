/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILlmClient, LlmEvent, LlmRequest } from '../kernel/llm';

/** One model turn: fixed events, or a function of the request (to react to tool results). */
export type ScriptedTurn = readonly LlmEvent[] | ((request: LlmRequest) => readonly LlmEvent[]);

/**
 * Deterministic {@link ILlmClient} for tests: replays one scripted turn per `chat` call and
 * records every request. Running out of turns throws, so a test fails loudly on an extra call.
 */
export class ScriptedFakeLlm implements ILlmClient {
	readonly requests: LlmRequest[] = [];
	private next = 0;

	constructor(private readonly turns: readonly ScriptedTurn[]) { }

	async *chat(request: LlmRequest, signal: AbortSignal): AsyncGenerator<LlmEvent> {
		// Snapshot: the agent keeps appending to the same arrays.
		this.requests.push({ ...request, messages: [...request.messages] });
		const turn = this.turns[this.next++];
		if (!turn) {
			throw new Error(`ScriptedFakeLlm: no scripted turn #${this.next}`);
		}
		for (const event of typeof turn === 'function' ? turn(request) : turn) {
			if (signal.aborted) {
				throw signal.reason ?? new Error('Aborted');
			}
			yield event;
		}
	}
}

/** Shorthand builders for scripts. */
export const say = (text: string): LlmEvent[] => [{ kind: 'text-delta', text }, { kind: 'finish', reason: 'stop' }];
export const callTool = (id: string, name: string, input: unknown, text = ''): LlmEvent[] => [
	...text ? [{ kind: 'text-delta', text } as const] : [],
	{ kind: 'tool-call', call: { id, name, input } },
	{ kind: 'finish', reason: 'tool-calls' },
];
