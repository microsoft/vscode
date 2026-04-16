/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import type { VoteMemoryInput } from '@github/copilot-agentic-tools/memory';
import { ILogService } from '../../../platform/log/common/logService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { IAgentMemoryService } from '../common/agentMemoryService';
import { ICopilotModelSpecificTool } from '../common/toolsRegistry';

/**
 * Implements the vote_memory tool using @github/copilot-agentic-tools/memory.
 * Only registered when voteToolDefinition is present in the /prompt response.
 */
export class VoteMemoryTool implements ICopilotModelSpecificTool<VoteMemoryInput> {
	constructor(
		@IAgentMemoryService private readonly agentMemoryService: IAgentMemoryService,
		@ILogService private readonly logService: ILogService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<VoteMemoryInput>, _token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const { fact, direction, reason } = options.input;

		try {
			// Vote on the repository-scoped memory entry.
			const success = await this.agentMemoryService.voteOnMemory({ fact, direction, reason }, 'repository');

			if (success) {
				this.logService.info(`[VoteMemoryTool] Recorded ${direction} for memory fact`);
				return new LanguageModelToolResult([new LanguageModelTextPart(`Vote (${direction}) recorded successfully.`)]);
			} else {
				return new LanguageModelToolResult([new LanguageModelTextPart('Failed to record vote. Copilot Memory may not be enabled.')]);
			}
		} catch (error) {
			this.logService.error('[VoteMemoryTool] Error voting on memory:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			return new LanguageModelToolResult([new LanguageModelTextPart(`Error voting on memory: ${errorMessage}`)]);
		}
	}
}

/**
 * Build the vscode.LanguageModelToolDefinition for vote_memory from the tool
 * definition returned by the /prompt endpoint.
 */
export function buildVoteMemoryToolDefinition(
	name: string,
	description: string,
): vscode.LanguageModelToolDefinition {
	return {
		name,
		displayName: 'Vote on Memory',
		description,
		tags: [],
		source: undefined,
		inputSchema: {
			type: 'object',
			properties: {
				fact: {
					type: 'string',
					// eslint-disable-next-line local/no-unexternalized-strings
					description: "The exact text of the 'fact' field from the original memory. Must match the string exactly as it appears in the prompt.",
				},
				direction: {
					type: 'string',
					enum: ['upvote', 'downvote'],
					// eslint-disable-next-line local/no-unexternalized-strings
					description: "Vote direction: 'upvote' for useful verified memories, 'downvote' for incorrect or outdated memories.",
				},
				reason: {
					type: 'string',
					// eslint-disable-next-line local/no-unexternalized-strings
					description: 'A clear and detailed explanation of the reason for your vote. Must be at least 2-3 sentences long.',
				},
			},
			required: ['fact', 'direction', 'reason'],
		},
	};
}
