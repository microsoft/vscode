/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import {
	resolveStoreMemorySchema,
	type ScopedStoreMemoryInput,
	type StoreMemoryInput,
	type StoreMemoryRequest,
} from '@github/copilot-agentic-tools/memory';
import { ILogService } from '../../../platform/log/common/logService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { IAgentMemoryService } from '../common/agentMemoryService';
import { ICopilotModelSpecificTool } from '../common/toolsRegistry';

type StoreMemoryParams = StoreMemoryInput | ScopedStoreMemoryInput;

/**
 * Implements the store_memory tool using @github/copilot-agentic-tools/memory.
 * The tool definition (description, schema) is dynamically built from the /prompt
 * response and registered via AgentMemoryToolRegistrar.
 */
export class StoreMemoryTool implements ICopilotModelSpecificTool<StoreMemoryParams> {
	constructor(
		@IAgentMemoryService private readonly agentMemoryService: IAgentMemoryService,
		@ILogService private readonly logService: ILogService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<StoreMemoryParams>, _token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const input = options.input;

		try {
			const memory: StoreMemoryRequest = {
				subject: input.subject,
				fact: input.fact,
				citations: input.citations,
				reason: input.reason,
			};

			// Route by scope if provided, otherwise default to repo
			const scope = 'scope' in input ? input.scope : 'repo';
			let success: boolean;
			if (scope === 'user') {
				success = await this.agentMemoryService.storeUserMemory(memory);
			} else {
				success = await this.agentMemoryService.storeRepoMemory(memory);
			}

			if (success) {
				this.logService.info(`[StoreMemoryTool] Stored memory: ${input.subject}`);
				return new LanguageModelToolResult([new LanguageModelTextPart('Memory stored successfully.')]);
			} else {
				return new LanguageModelToolResult([new LanguageModelTextPart('Failed to store memory. Copilot Memory may not be enabled for this repository.')]);
			}
		} catch (error) {
			this.logService.error('[StoreMemoryTool] Error storing memory:', error);
			return new LanguageModelToolResult([new LanguageModelTextPart(`Error storing memory: ${error}`)]);
		}
	}
}

/**
 * Build the vscode.LanguageModelToolDefinition for store_memory from the tool
 * definition version returned by the /prompt endpoint.
 */
export function buildStoreMemoryToolDefinition(
	name: string,
	description: string,
	definitionVersion: string,
): vscode.LanguageModelToolDefinition {
	const schema = resolveStoreMemorySchema(definitionVersion);
	const jsonSchema = zodSchemaToJsonSchema(schema);

	return {
		name,
		displayName: 'Store Memory',
		description,
		tags: [],
		source: undefined,
		inputSchema: jsonSchema,
	};
}

/**
 * Minimal zod-to-JSON-schema converter for the known store_memory schemas.
 * Only handles the object shapes produced by storeMemoryInputSchema and
 * scopedStoreMemoryInputSchema from @github/copilot-agentic-tools/memory.
 */
function zodSchemaToJsonSchema(schema: ReturnType<typeof resolveStoreMemorySchema>): object {
	// Both schemas share the same 4 base fields; scoped adds 'scope'
	const baseProperties: Record<string, object> = {
		subject: {
			type: 'string',
			// eslint-disable-next-line local/no-unexternalized-strings
			description: "The topic to which this memory relates. 1-2 words. Examples: 'naming conventions', 'testing practices', 'documentation', 'logging', 'authentication', 'sanitization', 'error handling'.",
		},
		fact: {
			type: 'string',
			// eslint-disable-next-line local/no-unexternalized-strings
			description: "A clear and short description of a fact about the codebase or a convention used in the codebase. Must be less than 200 characters.",
		},
		citations: {
			type: 'array',
			items: { type: 'string' },
			// eslint-disable-next-line local/no-unexternalized-strings
			description: "Sources of this fact, such as file and line numbers in the codebase (e.g., ['path/file.go:123', 'other/file.ts:45']).",
		},
		reason: {
			type: 'string',
			// eslint-disable-next-line local/no-unexternalized-strings
			description: "A clear and detailed explanation of the reason behind storing this fact. Must be at least 2-3 sentences long.",
		},
	};

	const required = ['subject', 'fact', 'citations', 'reason'];

	// Check if this is the scoped schema by inspecting its shape keys
	const shape = (schema as { shape?: Record<string, unknown> }).shape;
	if (shape && 'scope' in shape) {
		return {
			type: 'object',
			properties: {
				...baseProperties,
				scope: {
					type: 'string',
					enum: ['repo', 'user'],
					// eslint-disable-next-line local/no-unexternalized-strings
					description: "Scope of the memory to be stored, must be either 'repo' or 'user', depending on whether the memory is to be repo or user specific.",
				},
			},
			required: [...required, 'scope'],
		};
	}

	return {
		type: 'object',
		properties: baseProperties,
		required,
	};
}
