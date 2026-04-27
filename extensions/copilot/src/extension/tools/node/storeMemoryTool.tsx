/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	resolveStoreMemorySchema,
	type ScopedStoreMemoryInput,
	type StoreMemoryInput,
	type StoreMemoryRequest,
} from '@github/copilot-agentic-tools/memory';
import type * as vscode from 'vscode';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ILogService } from '../../../platform/log/common/logService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { IAgentMemoryService } from '../common/agentMemoryService';
import { ToolName } from '../common/toolNames';
import { type ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

type StoreMemoryParams = StoreMemoryInput | ScopedStoreMemoryInput;

/**
 * Implements the store_memory tool using @github/copilot-agentic-tools/memory.
 * Registered as a static package.json-contributed tool (copilot_store_memory),
 * conditionally shown when github.copilot.chat.copilotMemory.enabled is true.
 */
export class StoreMemoryTool implements ICopilotTool<StoreMemoryParams> {
	static readonly toolName = ToolName.StoreMemory;

	constructor(
		@IAgentMemoryService private readonly agentMemoryService: IAgentMemoryService,
		@ILogService private readonly logService: ILogService,
	) { }

	alternativeDefinition(tool: vscode.LanguageModelToolInformation): vscode.LanguageModelToolInformation {
		// No session context is available here — getCachedMemoryPrompt() returns the first cached entry.
		// This is acceptable because storeToolDefinition is a server-side schema that is identical across all sessions.
		const cached = this.agentMemoryService.getCachedMemoryPrompt();
		if (!cached) {
			return tool;
		}
		const toolDef = cached.storeToolDefinition;
		if (!toolDef) {
			return tool;
		}
		const zodSchema = resolveStoreMemorySchema(toolDef.definitionVersion);
		const inputSchema = zodToJsonSchema(zodSchema, { target: 'openApi3' }) as { [key: string]: unknown };
		return { ...tool, description: toolDef.description, inputSchema };
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<StoreMemoryParams>, _token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const input = options.input;

		try {
			const memory: StoreMemoryRequest = {
				subject: input.subject,
				fact: input.fact,
				citations: input.citations ?? [],
				reason: input.reason ?? '',
			};

			const scope = 'scope' in input ? input.scope : 'repo';
			const baseModel = options.model?.id;
			let success: boolean;
			if (scope === 'user') {
				success = await this.agentMemoryService.storeUserMemory(memory, baseModel);
			} else {
				success = await this.agentMemoryService.storeRepoMemory(memory, baseModel);
			}

			if (success) {
				this.logService.info(`[StoreMemoryTool] Stored memory: ${input.subject}`);
				return new LanguageModelToolResult([new LanguageModelTextPart('Memory stored successfully.')]);
			} else {
				return new LanguageModelToolResult([new LanguageModelTextPart('Failed to store memory. Copilot Memory may not be enabled.')]);
			}
		} catch (error) {
			this.logService.error(error instanceof Error ? error : String(error), '[StoreMemoryTool] Error storing memory');
			return new LanguageModelToolResult([new LanguageModelTextPart('Failed to store memory. Please try again later.')]);
		}
	}
}

ToolRegistry.registerTool(StoreMemoryTool);
