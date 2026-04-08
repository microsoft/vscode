/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	HookCallback,
	HookCallbackMatcher,
	HookInput,
	HookJSONOutput,
	SubagentStartHookInput,
	SubagentStopHookInput
} from '@anthropic-ai/claude-agent-sdk';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IOTelService } from '../../../../../platform/otel/common/index';
import { registerClaudeHook, withHookOTelSpan } from '../../common/claudeHookRegistry';

/**
 * Logging hook for SubagentStart events.
 */
export class SubagentStartLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as SubagentStartHookInput;
		return withHookOTelSpan(this.otelService, 'SubagentStart', 'SubagentStart', hookInput.session_id,
			{ agent_id: hookInput.agent_id, agent_type: hookInput.agent_type }, async () => {
				this.logService.trace(`[ClaudeCodeSession] SubagentStart Hook: agentId=${hookInput.agent_id}, agentType=${hookInput.agent_type}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('SubagentStart', SubagentStartLoggingHook);

/**
 * Logging hook for SubagentStop events.
 */
export class SubagentStopLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as SubagentStopHookInput;
		return withHookOTelSpan(this.otelService, 'SubagentStop', 'SubagentStop', hookInput.session_id,
			{ stop_hook_active: hookInput.stop_hook_active }, async () => {
				this.logService.trace(`[ClaudeCodeSession] SubagentStop Hook: stopHookActive=${hookInput.stop_hook_active}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('SubagentStop', SubagentStopLoggingHook);
