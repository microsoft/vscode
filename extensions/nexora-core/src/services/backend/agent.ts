/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Transport } from './transport';

export interface AgentMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content?: string;
	tool_calls?: Array<{
		id: string;
		type: string;
		function: { name: string; arguments: string };
	}>;
	tool_call_id?: string;
	name?: string;
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, any>;
}

export interface AgentTurnResponse {
	type: 'tool_calls' | 'final';
	content?: string;
	tool_calls?: ToolCall[];
	model_used: string;
}

export type AgentMode = 'ask' | 'agent';

export function createAgentApi(transport: Transport) {
	return {
		/**
		 * Execute one turn of the agent loop.
		 * Returns either tool calls to execute or a final answer.
		 * 
		 * @param mode 'ask' for read-only, 'agent' for read+write
		 */
		agentTurn: async (
			messages: AgentMessage[],
			workspaceId: string,
			workspacePath?: string,
			model?: string,
			mode: AgentMode = 'ask'
		): Promise<AgentTurnResponse> => {
			return await transport.post('/api/agent/turn', {
				messages,
				workspace_id: workspaceId,
				workspace_path: workspacePath,
				model,
				mode,
				max_tokens: 2048
			});
		},

		/**
		 * Get list of available agent tools.
		 */
		getTools: async (): Promise<{ tools: any[]; total: number }> => {
			try {
				return await transport.get('/api/agent/tools');
			} catch {
				return { tools: [], total: 0 };
			}
		}
	};
}
