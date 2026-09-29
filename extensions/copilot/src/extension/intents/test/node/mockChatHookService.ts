/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, ChatHookResult, ChatHookType } from 'vscode';
import { IChatHookService } from '../../../../platform/chat/common/chatHookService';

export class MockChatHookService implements IChatHookService {
	declare readonly _serviceBrand: undefined;
	private readonly hookResults = new Map<ChatHookType, ChatHookResult[]>();
	private readonly hookErrors = new Map<ChatHookType, Error>();

	readonly hookCalls: Array<{ hookType: ChatHookType; input: unknown }> = [];

	logConfiguredHooks(): void { }

	setHookResults(hookType: ChatHookType, results: ChatHookResult[]): void {
		this.hookResults.set(hookType, results);
	}

	setHookError(hookType: ChatHookType, error: Error): void {
		this.hookErrors.set(hookType, error);
	}

	clearCalls(): void {
		this.hookCalls.length = 0;
	}

	getCallsForHook(hookType: ChatHookType): Array<{ hookType: ChatHookType; input: unknown }> {
		return this.hookCalls.filter(call => call.hookType === hookType);
	}

	async executeHook(hookType: ChatHookType, _hooks: unknown, input: unknown, _sessionId?: string, _token?: CancellationToken): Promise<ChatHookResult[]> {
		this.hookCalls.push({ hookType, input });

		const error = this.hookErrors.get(hookType);
		if (error) {
			throw error;
		}

		return this.hookResults.get(hookType) || [];
	}

	async executePreToolUseHook(): Promise<undefined> {
		return undefined;
	}

	async executePostToolUseHook(): Promise<undefined> {
		return undefined;
	}
}
