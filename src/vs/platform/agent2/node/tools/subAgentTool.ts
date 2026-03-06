/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sub-agent invocation tool.
 *
 * A tool that spawns a nested invocation of the agent loop with its own
 * conversation, tools, and model config. Returns the sub-agent's final
 * text output to the parent. This is the simplest form of multi-agent:
 * synchronous subroutine calls with isolation.
 *
 * The parent conversation is not shared with the sub-agent -- the sub-agent
 * starts with a clean conversation containing only the task description.
 */

import { IAgentLoopConfig, runAgentLoop } from '../../common/agentLoop.js';
import { createUserMessage, getAssistantText } from '../../common/conversation.js';
import { IAgentTool, IToolContext, IToolResult } from '../../common/tools.js';

export interface ISubAgentConfig {
	/** The loop config to use for the sub-agent. Tools and system prompt can differ from the parent. */
	readonly loopConfig: Omit<IAgentLoopConfig, 'systemPrompt' | 'tools'>;
	/** System prompt for the sub-agent. */
	readonly systemPrompt: string;
	/** Tools available to the sub-agent (may be a subset of the parent's tools). */
	readonly tools: readonly IAgentTool[];
	/** Maximum iterations for the sub-agent (default: 10, lower than parent). */
	readonly maxIterations?: number;
}

/**
 * Creates a sub-agent tool that delegates tasks to a nested agent loop.
 *
 * @param name - The tool name (e.g., 'delegate', 'research').
 * @param description - Human-readable description for the model.
 * @param subAgentConfig - Configuration for the sub-agent loop.
 */
export function createSubAgentTool(
	name: string,
	description: string,
	subAgentConfig: ISubAgentConfig,
): IAgentTool {
	return {
		name,
		description,
		parametersSchema: {
			type: 'object',
			properties: {
				task: {
					type: 'string',
					description: 'A detailed description of the task to delegate to the sub-agent.',
				},
			},
			required: ['task'],
		},
		readOnly: true, // Sub-agent tools don't directly mutate the filesystem
		async execute(args: Record<string, unknown>, context: IToolContext): Promise<IToolResult> {
			const task = args['task'];
			if (typeof task !== 'string' || !task) {
				return { content: 'Error: "task" argument is required and must be a string.', isError: true };
			}

			const config: IAgentLoopConfig = {
				...subAgentConfig.loopConfig,
				systemPrompt: subAgentConfig.systemPrompt,
				tools: subAgentConfig.tools,
				maxIterations: subAgentConfig.maxIterations ?? 10,
				workingDirectory: context.workingDirectory,
			};

			const messages = [createUserMessage(task)];
			let finalText = '';

			try {
				for await (const event of runAgentLoop(messages, config, context.token)) {
					if (event.type === 'assistant-message') {
						finalText = getAssistantText(event.message);
					}
				}
			} catch (err) {
				return {
					content: `Sub-agent error: ${err instanceof Error ? err.message : String(err)}`,
					isError: true,
				};
			}

			if (!finalText) {
				return { content: 'Sub-agent completed but produced no output.', isError: true };
			}

			return { content: finalText };
		},
	};
}
