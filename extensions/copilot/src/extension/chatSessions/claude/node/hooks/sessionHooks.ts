/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	HookCallback,
	HookCallbackMatcher,
	HookInput,
	HookJSONOutput,
	SessionEndHookInput,
	SessionStartHookInput
} from '@anthropic-ai/claude-agent-sdk';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IOTelService } from '../../../../../platform/otel/common/index';
import { registerClaudeHook, withHookOTelSpan } from '../../common/claudeHookRegistry';

/**
 * Logging hook for SessionStart events.
 */
export class SessionStartLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as SessionStartHookInput;
		return withHookOTelSpan(this.otelService, 'SessionStart', 'SessionStart', hookInput.session_id,
			{ source: hookInput.source, cwd: hookInput.cwd }, async () => {
				this.logService.trace(`[ClaudeCodeSession] SessionStart Hook: source=${hookInput.source}, sessionId=${hookInput.session_id}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('SessionStart', SessionStartLoggingHook);

/**
 * Logging hook for SessionEnd events.
 */
export class SessionEndLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as SessionEndHookInput;
		return withHookOTelSpan(this.otelService, 'SessionEnd', 'SessionEnd', hookInput.session_id,
			{ reason: hookInput.reason }, async () => {
				this.logService.trace(`[ClaudeCodeSession] SessionEnd Hook: reason=${hookInput.reason}, sessionId=${hookInput.session_id}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('SessionEnd', SessionEndLoggingHook);
