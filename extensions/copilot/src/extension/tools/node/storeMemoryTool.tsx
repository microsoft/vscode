/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import {
	type ScopedStoreMemoryInput,
	type StoreMemoryInput,
	type StoreMemoryRequest,
} from '@github/copilot-agentic-tools/memory';
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

	async invoke(options: vscode.LanguageModelToolInvocationOptions<StoreMemoryParams>, _token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const input = options.input;

		try {
			const memory: StoreMemoryRequest = {
				subject: input.subject,
				fact: input.fact,
				citations: input.citations,
				reason: input.reason,
			};

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
				const msg = scope === 'user'
					? 'Failed to store memory. Copilot Memory may not be enabled.'
					: 'Failed to store memory. Copilot Memory may not be enabled for this repository.';
				return new LanguageModelToolResult([new LanguageModelTextPart(msg)]);
			}
		} catch (error) {
			this.logService.error(error instanceof Error ? error : String(error), '[StoreMemoryTool] Error storing memory');
			return new LanguageModelToolResult([new LanguageModelTextPart('Failed to store memory. Please try again later.')]);
		}
	}
}

ToolRegistry.registerTool(StoreMemoryTool);
