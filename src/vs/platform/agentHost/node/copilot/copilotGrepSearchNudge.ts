/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, CurrentToolMetadata, SessionEventPayload, SessionHooks } from '@github/copilot-sdk';
import { raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { stableStringify } from '../../../../base/common/objects.js';
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
const HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_PAGES = 3;

/** Defers a root grep call once, without granting permission to its retry. */
export class CopilotGrepSearchNudge extends Disposable {
	private _messageId: string | undefined;
	private readonly _userMessageIds = new Set<string>();
	private _historyInitialization: Promise<void> | undefined;
	private _historyGeneration = 0;
	private _messageGeneration = 0;
	private _historyScanLimitReached = false;
	private _modelResponseId: string | undefined;
	private readonly _pendingRetries = new Map<string, string>();
	private readonly _experimentTrigger: AgentHostSettingExperimentTrigger;

	constructor(
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
		this._messageGeneration++;
		this._pendingRetries.clear();
	}

	recordModelResponse(responseId: string): void {
		this._modelResponseId = responseId;
	}

	resetHistory(): void {
		this._historyGeneration++;
		this._messageGeneration++;
		this._messageId = undefined;
		this._modelResponseId = undefined;
		this._userMessageIds.clear();
		this._historyInitialization = undefined;
		this._historyScanLimitReached = false;
		this._pendingRetries.clear();
	}

	async evaluate(input: PreToolUseHookInput, session: CopilotSession, token: CancellationToken): Promise<PreToolUseHookOutput> {
		if (input.agentId || input.sessionId !== session.sessionId
			|| (input.toolName !== CopilotToolName.Grep && input.toolName !== CopilotToolName.Rg)) {
			return undefined;
		}

		// Use an arm-independent superset so the control arm needs no eligibility RPCs.
		this._experimentTrigger.report();
		if (this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.SearchSubagentGrepNudge) !== true) {
			this._pendingRetries.clear();
			return undefined;
		}
		const modelResponseId = this._modelResponseId;
		if (this._userMessageIds.size >= 3 || this._historyScanLimitReached || !modelResponseId) {
			return undefined;
		}

		const messageGeneration = this._messageGeneration;
		const historyGeneration = this._historyGeneration;
		const deadline = Date.now() + LOOKUP_BUDGET_MS;
		let search: CurrentToolMetadata | undefined;
		try {
			await (this._historyInitialization ??= this._initializeUserMessages(session, token, deadline, historyGeneration).catch(error => {
				if (historyGeneration === this._historyGeneration) {
					this._historyInitialization = undefined;
				}
				throw error;
			}));
			if (messageGeneration !== this._messageGeneration || this._userMessageIds.size >= 3 || this._historyScanLimitReached || !this._messageId) {
				return undefined;
			}
			const { tools } = await this._readWithinBudget(() => session.rpc.tools.getCurrentMetadata(), token, deadline);
			search = tools?.find(tool => tool.name === CopilotToolName.SearchCodeSubagent);
		} catch (error) {
			if (isCancellationError(error) || token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (messageGeneration === this._messageGeneration) {
				this._pendingRetries.clear();
			}
			this._logService.warn('[CopilotGrepSearchNudge] Could not determine nudge eligibility; continuing through normal tool checks.', error);
			return undefined;
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (messageGeneration !== this._messageGeneration || modelResponseId !== this._modelResponseId || this._userMessageIds.size >= 3) {
			return undefined;
		}

		if (!search) {
			this._pendingRetries.clear();
			return undefined;
		}

		if (this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.SearchSubagentGrepNudge) !== true) {
			this._pendingRetries.clear();
			return undefined;
		}

		const key = stableStringify({ tool: input.toolName, arguments: input.toolArgs });
		const nudgedResponseId = this._pendingRetries.get(key);
		if (nudgedResponseId !== undefined && nudgedResponseId !== modelResponseId) {
			this._pendingRetries.delete(key);
			return undefined;
		}
		this._pendingRetries.set(key, modelResponseId);
		const message = [
			`This ${input.toolName} search has NOT run. Are you sure grep is the best next step? Consider ${search.name} for code exploration instead.`,
			`Call ${search.name} as a normal tool call using the definition below, not as JSON in assistant text.`,
			`If grep is still preferable, repeat this exact ${input.toolName} call with the same arguments. Only that retry will proceed through normal permissions. Do not ask the user to confirm.`,
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

	private async _initializeUserMessages(session: CopilotSession, token: CancellationToken, deadline: number, generation: number): Promise<void> {
		let cursor: string | undefined;
		let latestMessageId: string | undefined;
		const userMessageIds = new Set<string>();
		const seenCursors = new Set<string>();
		for (let pageIndex = 0; pageIndex < MAX_HISTORY_PAGES; pageIndex++) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const page = await this._readWithinBudget(() => session.rpc.eventLog.read({ cursor, max: HISTORY_PAGE_SIZE, direction: 'backward', types: ['user.message'], agentScope: 'primary', includeEphemeral: false }), token, deadline);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (generation !== this._historyGeneration) {
				return;
			}
			if (page.cursorStatus !== 'ok' || (page.hasMore && (!page.cursor || seenCursors.has(page.cursor)))) {
				throw new Error('Cannot determine the grep nudge turn boundary: invalid session history cursor.');
			}
			for (const event of page.events.toReversed()) {
				if (event.type === 'user.message' && !event.agentId && !isSyntheticUserMessage(event)) {
					latestMessageId ??= event.id;
					userMessageIds.add(event.id);
					if (userMessageIds.size >= 3) {
						break;
					}
				}
			}
			if (!page.hasMore || userMessageIds.size >= 3 || this._userMessageIds.size >= 3) {
				break;
			}
			if (pageIndex === MAX_HISTORY_PAGES - 1) {
				this._historyScanLimitReached = true;
				this._logService.warn('[CopilotGrepSearchNudge] History scan limit reached; skipping nudges for this history.');
				return;
			}
			seenCursors.add(page.cursor);
			cursor = page.cursor;
		}
		this._messageId ??= latestMessageId;
		for (const id of userMessageIds) {
			if (this._userMessageIds.size >= 3) {
				break;
			}
			this._userMessageIds.add(id);
		}
		if (this._userMessageIds.size >= 3) {
			this._pendingRetries.clear();
		}
	}
}
