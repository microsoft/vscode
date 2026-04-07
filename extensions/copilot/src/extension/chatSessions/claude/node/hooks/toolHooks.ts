/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	HookCallback,
	HookCallbackMatcher,
	HookInput,
	HookJSONOutput,
	PostToolUseFailureHookInput,
	PostToolUseHookInput,
	PreToolUseHookInput
} from '@anthropic-ai/claude-agent-sdk';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IOTelService, SpanStatusCode, truncateForOTel } from '../../../../../platform/otel/common/index';
import { IRequestLogger } from '../../../../../platform/requestLogger/node/requestLogger';
import { LanguageModelTextPart } from '../../../../../vscodeTypes';
import { registerClaudeHook, withHookOTelSpan } from '../../common/claudeHookRegistry';
import { ClaudeToolNames } from '../../common/claudeTools';
import { IClaudeSessionStateService } from '../claudeSessionStateService';

/**
 * Logging hook for PreToolUse events.
 */
export class PreToolUseLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput, toolID: string | undefined): Promise<HookJSONOutput> {
		const hookInput = input as PreToolUseHookInput;
		return withHookOTelSpan(this.otelService, 'PreToolUse', `PreToolUse:${hookInput.tool_name}`, hookInput.session_id,
			{ tool_name: hookInput.tool_name, tool_input: hookInput.tool_input }, async () => {
				this.logService.trace(`[ClaudeCodeSession] PreToolUse Hook: tool=${hookInput.tool_name}, toolUseID=${toolID}`);
				return { continue: true };
			});
	}
}
registerClaudeHook('PreToolUse', PreToolUseLoggingHook);

/**
 * Logging hook for PostToolUse events.
 * Also logs tool calls to the request logger for debugging and analysis.
 */
export class PostToolUseLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput, toolID: string | undefined): Promise<HookJSONOutput> {
		const hookInput = input as PostToolUseHookInput;
		const id = toolID ?? hookInput.session_id;
		const response = hookInput.tool_response;

		return withHookOTelSpan(this.otelService, 'PostToolUse', `PostToolUse:${hookInput.tool_name}`, hookInput.session_id,
			{ tool_name: hookInput.tool_name, tool_input: hookInput.tool_input }, async span => {
				this.logService.trace(`[ClaudeCodeSession] PostToolUse Hook: tool=${hookInput.tool_name}, toolUseID=${toolID}`);

				// Record tool response output on the span for the debug panel
				try {
					const output = typeof response === 'string' ? response : JSON.stringify(response);
					span.setAttribute('copilot_chat.hook_output', truncateForOTel(output));
				} catch { /* swallow */ }

				// Log the tool call to the request logger with the tool response as text content
				const capturingToken = this.sessionStateService.getCapturingTokenForSession(hookInput.session_id);
				const logToolCall = () => {
					this.requestLogger.logToolCall(
						id,
						hookInput.tool_name,
						hookInput.tool_input,
						{
							content: [new LanguageModelTextPart(typeof response === 'string' ? response : JSON.stringify(response, undefined, 2))]
						}
					);
				};

				if (capturingToken) {
					await this.requestLogger.captureInvocation(capturingToken, async () => logToolCall());
				} else {
					logToolCall();
				}

				return { continue: true };
			});
	}
}
registerClaudeHook('PostToolUse', PostToolUseLoggingHook);

/**
 * Logging hook for PostToolUseFailure events.
 * Also logs failed tool calls to the request logger for debugging and analysis.
 */
export class PostToolUseFailureLoggingHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
		@IOTelService private readonly otelService: IOTelService,
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput, toolID: string | undefined): Promise<HookJSONOutput> {
		const hookInput = input as PostToolUseFailureHookInput;
		const id = toolID ?? hookInput.session_id;

		return withHookOTelSpan(this.otelService, 'PostToolUseFailure', `PostToolUseFailure:${hookInput.tool_name}`, hookInput.session_id,
			{ tool_name: hookInput.tool_name, tool_input: hookInput.tool_input, error: hookInput.error }, async span => {
				this.logService.trace(`[ClaudeCodeSession] PostToolUseFailure Hook: tool=${hookInput.tool_name}, error=${hookInput.error}, isInterrupt=${hookInput.is_interrupt}`);

				// Override the default success status — this hook reports a tool failure
				span.setAttribute('copilot_chat.hook_result_kind', 'error');
				span.setStatus(SpanStatusCode.ERROR, hookInput.error);

				// Log the failed tool call to the request logger with the error as text content
				const capturingToken = this.sessionStateService.getCapturingTokenForSession(hookInput.session_id);
				const logToolCall = () => {
					this.requestLogger.logToolCall(
						id,
						hookInput.tool_name,
						hookInput.tool_input,
						{
							content: [new LanguageModelTextPart(`Error: ${hookInput.error}${hookInput.is_interrupt ? ' (interrupted)' : ''}`)]
						}
					);
				};

				if (capturingToken) {
					await this.requestLogger.captureInvocation(capturingToken, async () => logToolCall());
				} else {
					logToolCall();
				}

				return { continue: true };
			});
	}
}
registerClaudeHook('PostToolUseFailure', PostToolUseFailureLoggingHook);

/**
 * Hook to update permission mode when EnterPlanMode/ExitPlanMode tools are invoked.
 * This keeps the UI in sync with the SDK's internal permission mode state.
 */
export class PlanModeHook implements HookCallbackMatcher {
	public readonly hooks: HookCallback[];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService
	) {
		this.hooks = [this._handle.bind(this)];
	}

	private async _handle(input: HookInput): Promise<HookJSONOutput> {
		const hookInput = input as PostToolUseHookInput;

		if (hookInput.tool_name === ClaudeToolNames.EnterPlanMode) {
			this.logService.trace(`[PlanModeHook] EnterPlanMode detected, setting permission mode to 'plan'`);
			this.sessionStateService.setPermissionModeForSession(hookInput.session_id, 'plan');
		} else if (hookInput.tool_name === ClaudeToolNames.ExitPlanMode) {
			this.logService.trace(`[PlanModeHook] ExitPlanMode detected, setting permission mode to 'acceptEdits'`);
			this.sessionStateService.setPermissionModeForSession(hookInput.session_id, 'acceptEdits');
		}

		return { continue: true };
	}
}
registerClaudeHook('PostToolUse', PlanModeHook);
