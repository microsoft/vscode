/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	HookCallback,
	HookCallbackMatcher,
	HookInput,
	HookJSONOutput,
	NotificationHookInput,
	PermissionRequestHookInput,
	PreCompactHookInput,
	StopHookInput
} from '@anthropic-ai/claude-agent-sdk';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IOTelService } from '../../../../../platform/otel/common/index';
import { registerClaudeHook, withHookOTelSpan } from '../../common/claudeHookRegistry';

/**
 * Logging hook for Notification events.
 */
export class NotificationLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as NotificationHookInput;
		return withHookOTelSpan(this.otelService, 'Notification', 'Notification', hookInput.session_id,
			{ title: hookInput.title, message: hookInput.message }, async () => {
				this.logService.trace(`[ClaudeCodeSession] Notification Hook: title=${hookInput.title}, message=${hookInput.message}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('Notification', NotificationLoggingHook);

/**
 * Logging hook for UserPromptSubmit events.
 */
export class UserPromptSubmitLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as { prompt?: string; session_id: string };
		return withHookOTelSpan(this.otelService, 'UserPromptSubmit', 'UserPromptSubmit', hookInput.session_id,
			{ prompt: hookInput.prompt }, async () => {
				this.logService.trace(`[ClaudeCodeSession] UserPromptSubmit Hook: prompt=${hookInput.prompt}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('UserPromptSubmit', UserPromptSubmitLoggingHook);

/**
 * Logging hook for Stop events.
 */
export class StopLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as StopHookInput;
		return withHookOTelSpan(this.otelService, 'Stop', 'Stop', hookInput.session_id,
			{ stop_hook_active: hookInput.stop_hook_active }, async () => {
				this.logService.trace(`[ClaudeCodeSession] Stop Hook: stopHookActive=${hookInput.stop_hook_active}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('Stop', StopLoggingHook);

/**
 * Logging hook for PreCompact events.
 */
export class PreCompactLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as PreCompactHookInput;
		return withHookOTelSpan(this.otelService, 'PreCompact', 'PreCompact', hookInput.session_id,
			{ trigger: hookInput.trigger }, async () => {
				this.logService.trace(`[ClaudeCodeSession] PreCompact Hook: trigger=${hookInput.trigger}, customInstructions=${hookInput.custom_instructions}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('PreCompact', PreCompactLoggingHook);

/**
 * Logging hook for PermissionRequest events.
 */
export class PermissionRequestLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as PermissionRequestHookInput;
		return withHookOTelSpan(this.otelService, 'PermissionRequest', `PermissionRequest:${hookInput.tool_name}`, hookInput.session_id,
			{ tool_name: hookInput.tool_name, tool_input: hookInput.tool_input }, async () => {
				this.logService.trace(`[ClaudeCodeSession] PermissionRequest Hook: tool=${hookInput.tool_name}, input=${JSON.stringify(hookInput.tool_input)}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('PermissionRequest', PermissionRequestLoggingHook);
