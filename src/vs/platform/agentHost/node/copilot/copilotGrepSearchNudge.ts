/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, CurrentToolMetadata, SessionEvent, SessionEventPayload, SessionHooks } from '@github/copilot-sdk';
import { raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { CopilotCliConfigKey, copilotCliConfigSchema, CopilotSearchSubagentGrepNudgeSettingId } from '../../common/copilotCliConfig.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { AgentHostSettingExperimentTrigger } from '../agentHostSettingExperimentTrigger.js';
import { isSyntheticUserMessage } from './copilotFusionEventIdentity.js';
import { CopilotToolName } from './copilotToolDisplay.js';

type PreToolUseHookInput = Parameters<NonNullable<SessionHooks['onPreToolUse']>>[0];
type PreToolUseHookOutput = Awaited<ReturnType<NonNullable<SessionHooks['onPreToolUse']>>>;

const LOOKUP_BUDGET_MS = 500;

/** Defers at most one root grep per user message, without granting tool permission. */
export class CopilotGrepSearchNudge extends Disposable {
	private _messageId: string | undefined;
	private readonly _userMessageIds = new Set<string>();
	private _historyGeneration = 0;
	private _evaluatedMessageId: string | undefined;
	private readonly _experimentTrigger: AgentHostSettingExperimentTrigger;

	constructor(
		private _historyKnown: boolean,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._experimentTrigger = this._register(new AgentHostSettingExperimentTrigger(CopilotSearchSubagentGrepNudgeSettingId, this._configurationService, telemetryService));
	}

	recordUserMessage(event: SessionEventPayload<'user.message'>): void {
		if (this._userMessageIds.size >= 3 || event.agentId || isSyntheticUserMessage(event) || this._userMessageIds.has(event.id)) {
			return;
		}
		this._userMessageIds.add(event.id);
		this._messageId = event.id;
	}

	/** Reuses normal history restoration in both experiment arms, without adding an eligibility RPC. */
	async trackHistory(read: Promise<readonly SessionEvent[]>): Promise<readonly SessionEvent[]> {
		const generation = this._historyGeneration;
		const events = await read;
		if (generation === this._historyGeneration) {
			const liveMessageId = this._messageId;
			for (const event of events) {
				if (this._userMessageIds.size >= 3) {
					break;
				}
				if (event.type === 'user.message') {
					this.recordUserMessage(event);
				}
			}
			this._messageId = liveMessageId ?? this._messageId;
			this._historyKnown = true;
		}
		return events;
	}

	resetHistory(): void {
		this._historyGeneration++;
		this._messageId = undefined;
		this._userMessageIds.clear();
		this._historyKnown = false;
		this._evaluatedMessageId = undefined;
	}

	async evaluate(input: PreToolUseHookInput, session: CopilotSession, token: CancellationToken): Promise<PreToolUseHookOutput> {
		if (input.agentId || input.sessionId !== session.sessionId
			|| (input.toolName !== CopilotToolName.Grep && input.toolName !== CopilotToolName.Rg)) {
			return undefined;
		}

		if (!this._historyKnown || !this._messageId || this._userMessageIds.size >= 3
			|| this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.SearchSubagent) !== true) {
			return undefined;
		}

		// These local eligibility checks are identical in control and treatment.
		this._experimentTrigger.report();
		if (this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.SearchSubagentGrepNudge) !== true) {
			return undefined;
		}
		const messageId = this._messageId;
		if (this._evaluatedMessageId === messageId) {
			return undefined;
		}

		// Reserve before awaiting so parallel calls share the one-lookup-per-message budget.
		this._evaluatedMessageId = messageId;
		const historyGeneration = this._historyGeneration;
		const deadline = Date.now() + LOOKUP_BUDGET_MS;
		let search: CurrentToolMetadata | undefined;
		try {
			const { tools } = await this._readWithinBudget(() => session.rpc.tools.getCurrentMetadata(), token, deadline);
			search = tools?.find(tool => tool.name === CopilotToolName.SearchCodeSubagent);
		} catch (error) {
			if (isCancellationError(error) || token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._logService.warn('[CopilotGrepSearchNudge] Could not determine nudge eligibility; continuing through normal tool checks.', error);
			return undefined;
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (historyGeneration !== this._historyGeneration || messageId !== this._messageId || this._userMessageIds.size >= 3) {
			return undefined;
		}

		if (!search) {
			return undefined;
		}

		if (this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.SearchSubagentGrepNudge) !== true
			|| this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.SearchSubagent) !== true) {
			return undefined;
		}

		const message = [
			`This ${input.toolName} search has NOT run. Are you sure grep is the best next step? Consider ${search.name} for code exploration instead.`,
			`Call ${search.name} as a normal tool call using the definition below, not as JSON in assistant text.`,
			`If grep is still preferable, call ${input.toolName} again. Further grep calls for this user message proceed through normal permissions without another nudge. Do not ask the user to confirm.`,
			JSON.stringify({ name: search.name, description: search.description, input_schema: search.input_schema }),
		].join('\n\n');
		return { permissionDecision: 'deny', permissionDecisionReason: message, additionalContext: message };
	}

	private async _readWithinBudget<T extends object>(read: () => Promise<T>, token: CancellationToken, deadline: number): Promise<T> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			throw new Error('Grep nudge eligibility lookup timed out.');
		}
		const store = new DisposableStore();
		const cts = store.add(new CancellationTokenSource(token));
		try {
			const result = await raceTimeout(raceCancellationError(read(), cts.token), remaining);
			if (!result) {
				throw new Error('Grep nudge eligibility lookup timed out.');
			}
			return result;
		} finally {
			cts.cancel();
			store.dispose();
		}
	}
}
