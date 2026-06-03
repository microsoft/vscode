/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { MessageKind, ResponsePartKind, type Turn, type ResponsePart } from '../../common/state/sessionState.js';
import type { Thread } from './protocol/generated/v2/Thread.js';
import type { ThreadItem } from './protocol/generated/v2/ThreadItem.js';
import type { Turn as CodexTurn } from './protocol/generated/v2/Turn.js';
import { turnStateFromStatus } from './codexMapAppServerEvents.js';

/**
 * Reconstruct protocol {@link Turn}s from codex's `thread/read` response.
 *
 * Codex stores each conversation as a stream of {@link CodexTurn}, each
 * with an array of {@link ThreadItem}s. We collapse that into the agent
 * host's turn shape: each user message opens a turn; subsequent assistant
 * items become response parts on that turn until `turn/completed` closes it.
 *
 * Phase 3 produces:
 *  - `userMessage` → opens a `Turn` with `userMessage: { text }`
 *  - `agentMessage` → `MarkdownResponsePart` with the full text
 *  - everything else → currently dropped (Phase 6 will add tool/reasoning)
 *
 * Mirrors the live mapper's translation kernel so restored sessions render
 * identically to active ones.
 */
export function replayThreadToTurns(thread: Thread): Turn[] {
	const turns: Turn[] = [];
	for (const codexTurn of thread.turns ?? []) {
		const turn = replayTurnToTurn(codexTurn);
		if (turn) {
			turns.push(turn);
		}
	}
	return turns;
}

function replayTurnToTurn(codexTurn: CodexTurn): Turn | undefined {
	let userText = '';
	const parts: ResponsePart[] = [];
	for (const item of codexTurn.items ?? []) {
		if (item.type === 'userMessage') {
			const collected: string[] = [];
			for (const c of item.content) {
				if (c.type === 'text') {
					collected.push(c.text);
				}
			}
			if (collected.length > 0) {
				userText = collected.join('\n\n');
			}
		} else if (item.type === 'agentMessage') {
			if (item.text && item.text.length > 0) {
				parts.push({
					kind: ResponsePartKind.Markdown,
					id: generateUuid(),
					content: item.text,
				});
			}
		}
		// Other item types (plan/reasoning/commandExecution/fileChange/…)
		// are deferred to Phase 6.
	}
	// If we got nothing recognizable, drop the turn — there's nothing for
	// the UI to render.
	if (!userText && parts.length === 0) {
		return undefined;
	}
	return {
		id: codexTurn.id,
		message: { text: userText, origin: { kind: MessageKind.User } },
		responseParts: parts,
		usage: undefined,
		state: turnStateFromStatus(codexTurn.status),
	};
}
