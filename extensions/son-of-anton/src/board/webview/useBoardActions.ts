/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Register agent-callable actions for the board.
 *
 * Each action's `handler` simply forwards a `board-action` postMessage to
 * the host. The host's TaskBoardPanel routes the message into
 * `TaskBoardModel` mutations, which then triggers a fresh snapshot push
 * back down to the webview — same loop as user-driven drag-drop.
 *
 * Five actions are registered (see `boardActionDefs.ts` for the canonical
 * list):
 *
 *   - `moveCard`        — change a card's column.
 *   - `addCard`         — append a backlog tile (stub: only routes to host).
 *   - `setCardStatus`   — alias of moveCard, keyword the LLM may prefer.
 *   - `setCardAssignee` — re-route a card to a different specialist.
 *   - `setCardPriority` — annotate a tile with priority metadata.
 *
 * Tier 2.5: the same `BOARD_ACTIONS` list is re-derived as an `LlmTool`
 * schema in `BoardChat.tsx`, so the model can ACTUALLY call these via
 * native tool-use rather than just see them named in a readable.
 */

import { useCopilotAction } from '@copilotkit/react-core';
import { postToHost } from './vscode';
import type { SubtaskState } from './protocol';
import { buildBoardActions } from './boardActionDefs';

export function useBoardActions(availableAssignees: ReadonlyArray<string>): void {
	const actions = buildBoardActions(availableAssignees);
	for (const action of actions) {
		// eslint-disable-next-line react-hooks/rules-of-hooks
		useCopilotAction({
			name: action.name,
			description: action.description,
			parameters: action.parameters.map(p => ({
				name: p.name,
				type: p.type,
				description: p.description,
				required: p.required,
				...(p.enumValues ? { enum: [...p.enumValues] } : {}),
			})),
			handler: (args: Record<string, unknown>) => {
				dispatchBoardAction(action.name, args);
			},
		});
	}
}

/**
 * Dispatch a successful tool-call back into the host. Re-exported so the
 * chat tool-use path (LLM emits `tool-call`) can reuse the same routing
 * the manual `useCopilotAction` handlers do.
 */
export function dispatchBoardAction(actionName: string, args: Record<string, unknown>): void {
	const cardId = typeof args.cardId === 'string' ? args.cardId : undefined;
	const toColumn = typeof args.toColumn === 'string' ? (args.toColumn as SubtaskState) : undefined;
	const assignee = typeof args.assignee === 'string' ? args.assignee : undefined;
	const priority = typeof args.priority === 'string' ? (args.priority as 'low' | 'medium' | 'high') : undefined;
	const instruction = typeof args.instruction === 'string' ? args.instruction : undefined;
	switch (actionName) {
		case 'moveCard':
		case 'setCardStatus':
			if (cardId && toColumn) {
				postToHost({ type: 'board-action', action: actionName, cardId, toColumn });
			}
			return;
		case 'addCard':
			if (instruction) {
				postToHost({ type: 'board-action', action: 'addCard', instruction, assignee });
			}
			return;
		case 'setCardAssignee':
			if (cardId && assignee) {
				postToHost({ type: 'board-action', action: 'setCardAssignee', cardId, assignee });
			}
			return;
		case 'setCardPriority':
			if (cardId && priority) {
				postToHost({ type: 'board-action', action: 'setCardPriority', cardId, priority });
			}
			return;
	}
}
