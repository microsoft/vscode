/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Single source of truth for the board's agent-callable
 * actions.
 *
 * The same definitions are consumed by:
 *
 *   1. `useBoardActions.ts` — registers each entry via `useCopilotAction`
 *      so the action is visible in CopilotKit's frontend context.
 *   2. `BoardChat.tsx` — derives a JSON-Schema-shaped `tools` array that
 *      gets posted to the host and forwarded into `LlmClient.streamRequest`,
 *      letting the model actually invoke the action via tool-call.
 *
 * Keeping the two paths in lock-step avoids the situation we had in Tier 2
 * where the LLM could only see action names through a `useCopilotReadable`
 * blurb but had no real way to call them. A divergence between the action
 * registry and the tools list now requires updating one place.
 */
import type { SubtaskState } from './protocol';

export type ToolParamType = 'string' | 'number' | 'boolean';

export interface BoardActionParam {
	readonly name: string;
	readonly type: ToolParamType;
	readonly description: string;
	readonly required: boolean;
	readonly enumValues?: ReadonlyArray<string>;
}

export interface BoardActionDef {
	readonly name: string;
	readonly description: string;
	readonly parameters: ReadonlyArray<BoardActionParam>;
}

export const BOARD_COLUMN_ENUM: ReadonlyArray<SubtaskState> = ['backlog', 'ready', 'in-progress', 'review', 'done', 'failed'];

/**
 * Build the canonical action list. Receives the current persona handles so
 * `setCardAssignee` can constrain its `assignee` parameter to known agents
 * — passing them in makes the registry refresh cleanly when the personas
 * roster changes between snapshots.
 */
export function buildBoardActions(availableAssignees: ReadonlyArray<string>): ReadonlyArray<BoardActionDef> {
	return [
		{
			name: 'moveCard',
			description: 'Move a kanban card from its current column to a new column.',
			parameters: [
				{ name: 'cardId', type: 'string', description: 'ID of the card to move.', required: true },
				{ name: 'toColumn', type: 'string', description: 'Target column.', required: true, enumValues: BOARD_COLUMN_ENUM },
			],
		},
		{
			name: 'addCard',
			description: 'Add a new backlog card to the board with the given instruction.',
			parameters: [
				{ name: 'instruction', type: 'string', description: 'What the new task should accomplish.', required: true },
				{ name: 'assignee', type: 'string', description: 'Specialist handle to own the card. Defaults to anton.', required: false },
			],
		},
		{
			name: 'setCardStatus',
			description: 'Set the lifecycle state of a card (alias of moveCard).',
			parameters: [
				{ name: 'cardId', type: 'string', description: 'ID of the card.', required: true },
				{ name: 'toColumn', type: 'string', description: 'Target column.', required: true, enumValues: BOARD_COLUMN_ENUM },
			],
		},
		{
			name: 'setCardAssignee',
			description: 'Reassign a card to a different specialist agent.',
			parameters: [
				{ name: 'cardId', type: 'string', description: 'ID of the card.', required: true },
				{
					name: 'assignee',
					type: 'string',
					description: 'Specialist handle. Must be one of the registered personas.',
					required: true,
					enumValues: availableAssignees.length > 0 ? availableAssignees : undefined,
				},
			],
		},
		{
			name: 'setCardPriority',
			description: 'Set or change the priority of a card.',
			parameters: [
				{ name: 'cardId', type: 'string', description: 'ID of the card.', required: true },
				{ name: 'priority', type: 'string', description: 'Priority level.', required: true, enumValues: ['low', 'medium', 'high'] },
			],
		},
	];
}

/**
 * JSON-Schema-shaped tool descriptor matching `LlmClient`'s `ToolDefinition`.
 * Property values land as `Record<string, unknown>` because the host
 * provider layer expects loosely-typed input schemas — the strong types
 * surface to the model via the `description` and `enum` fields.
 */
export interface BoardToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: {
		readonly type: 'object';
		readonly properties: Record<string, { type: ToolParamType; description: string; enum?: ReadonlyArray<string> }>;
		readonly required?: ReadonlyArray<string>;
	};
}

/**
 * Derive an LLM-tools array from the action registry. The shape mirrors the
 * `ToolDefinition` interface exported from `son-of-anton-core/llm/LlmClient`
 * — kept structurally compatible so the host can forward it without a
 * translation layer.
 */
export function buildBoardTools(actions: ReadonlyArray<BoardActionDef>): ReadonlyArray<BoardToolDefinition> {
	return actions.map(action => {
		const properties: Record<string, { type: ToolParamType; description: string; enum?: ReadonlyArray<string> }> = {};
		const required: string[] = [];
		for (const p of action.parameters) {
			properties[p.name] = {
				type: p.type,
				description: p.description,
				...(p.enumValues ? { enum: p.enumValues } : {}),
			};
			if (p.required) {
				required.push(p.name);
			}
		}
		return {
			name: action.name,
			description: action.description,
			inputSchema: {
				type: 'object' as const,
				properties,
				...(required.length > 0 ? { required } : {}),
			},
		};
	});
}
