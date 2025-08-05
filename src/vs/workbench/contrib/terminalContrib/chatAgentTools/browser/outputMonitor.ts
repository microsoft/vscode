/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { assessOutputForErrors, PollingConsts, racePollingOrPrompt, promptForMorePolling } from './bufferOutputPolling.js';

export const enum OutputMonitorAction {
	PollingStarted = 'polling_started',
	OutputReceived = 'output_received',
	IdleDetected = 'idle_detected',
	TimeoutReached = 'timeout_reached',
	CancellationRequested = 'cancellation_requested',
	ExtendedPollingStarted = 'extended_polling_started',
	AssessmentCompleted = 'assessment_completed'
}

export interface IOutputMonitor extends Disposable {
	// for constructing telemetry event
	readonly actions: OutputMonitorAction[];

	// for constructing tool result
	readonly isIdle: boolean;

	// enable async listening to when the command is considered finished
	readonly onDidFinishCommand: Event<void>;

	// if we need this outside the class
	readonly onDidIdle: Event<void>;

	// timeout for showing elicitation
	readonly onDidTimeout: Event<void>;

	// Start monitoring output with automatic extended polling if needed
	startMonitoring(
		chatService: IChatService,
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }>;

	// Legacy method for testing
	startMonitoringLegacy(extendedPolling: boolean, token: CancellationToken): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }>;
}

export class OutputMonitor extends Disposable implements IOutputMonitor {
	private readonly _onDidFinishCommand = new Emitter<void>();
	private readonly _onDidIdle = new Emitter<void>();
	private readonly _onDidTimeout = new Emitter<void>();

	private readonly _actions: OutputMonitorAction[] = [];
	private _isIdle = false;

	readonly onDidFinishCommand = this._onDidFinishCommand.event;
	readonly onDidIdle = this._onDidIdle.event;
	readonly onDidTimeout = this._onDidTimeout.event;

	get actions(): OutputMonitorAction[] {
		return [...this._actions];
	}

	get isIdle(): boolean {
		return this._isIdle;
	}

	constructor(
		private readonly _execution: { getOutput: () => string; isActive?: () => Promise<boolean> },
		private readonly _languageModelsService: ILanguageModelsService
	) {
		super();
	}

	async startMonitoring(
		chatService: IChatService,
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }> {
		// First, try initial polling
		let result = await this._startMonitoringInternal(false, token);

		// If the initial polling didn't complete before timeout, try extended polling with user prompt
		if (!result.terminalExecutionIdleBeforeTimeout) {
			result = await racePollingOrPrompt(
				() => this._startMonitoringInternal(true, token),
				() => promptForMorePolling(command, token, invocationContext, chatService),
				result,
				token,
				this._languageModelsService,
				this._execution
			);
		}

		return result;
	}

	// Legacy method for testing
	startMonitoringLegacy(extendedPolling: boolean, token: CancellationToken): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }> {
		return this._startMonitoringInternal(extendedPolling, token);
	}

	private async _startMonitoringInternal(extendedPolling: boolean, token: CancellationToken): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }> {
		this._addAction(OutputMonitorAction.PollingStarted);
		if (extendedPolling) {
			this._addAction(OutputMonitorAction.ExtendedPollingStarted);
		}

		const maxWaitMs = extendedPolling ? PollingConsts.ExtendedPollingMaxDuration : PollingConsts.FirstPollingMaxDuration;
		const maxInterval = PollingConsts.MaxPollingIntervalDuration;
		let currentInterval = PollingConsts.MinPollingDuration;
		const pollStartTime = Date.now();

		let lastBufferLength = 0;
		let noNewDataCount = 0;
		let buffer = '';
		let terminalExecutionIdleBeforeTimeout = false;

		while (true) {
			if (token.isCancellationRequested) {
				this._addAction(OutputMonitorAction.CancellationRequested);
				break;
			}
			const now = Date.now();
			const elapsed = now - pollStartTime;
			const timeLeft = maxWaitMs - elapsed;

			if (timeLeft <= 0) {
				this._addAction(OutputMonitorAction.TimeoutReached);
				this._onDidTimeout.fire();
				break;
			}

			// Cap the wait so we never overshoot timeLeft
			const waitTime = Math.min(currentInterval, timeLeft);
			await timeout(waitTime);

			// Check again immediately after waking
			if (Date.now() - pollStartTime >= maxWaitMs) {
				this._addAction(OutputMonitorAction.TimeoutReached);
				this._onDidTimeout.fire();
				break;
			}

			currentInterval = Math.min(currentInterval * 2, maxInterval);

			buffer = this._execution.getOutput();
			const currentBufferLength = buffer.length;

			if (currentBufferLength !== lastBufferLength) {
				this._addAction(OutputMonitorAction.OutputReceived);
			}

			if (currentBufferLength === lastBufferLength) {
				noNewDataCount++;
			} else {
				noNewDataCount = 0;
				lastBufferLength = currentBufferLength;
			}

			if (noNewDataCount >= PollingConsts.MinNoDataEvents) {
				if (this._execution.isActive && ((await this._execution.isActive()) === true)) {
					noNewDataCount = 0;
					lastBufferLength = currentBufferLength;
					continue;
				}
				this._addAction(OutputMonitorAction.IdleDetected);
				this._isIdle = true;
				this._onDidIdle.fire();
				terminalExecutionIdleBeforeTimeout = true;

				this._addAction(OutputMonitorAction.AssessmentCompleted);
				const modelOutputEvalResponse = await assessOutputForErrors(buffer, token, this._languageModelsService);

				this._onDidFinishCommand.fire();
				return { modelOutputEvalResponse, terminalExecutionIdleBeforeTimeout, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
			}
		}

		this._onDidFinishCommand.fire();
		return { terminalExecutionIdleBeforeTimeout: false, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
	}

	private _addAction(action: OutputMonitorAction): void {
		this._actions.push(action);
	}

	override dispose(): void {
		this._onDidFinishCommand.dispose();
		this._onDidIdle.dispose();
		this._onDidTimeout.dispose();
		super.dispose();
	}
}
