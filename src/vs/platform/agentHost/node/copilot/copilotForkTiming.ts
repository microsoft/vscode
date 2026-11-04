/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../log/common/log.js';

/** Correlates fork stages in local logs, including stages that never settle. */
export class CopilotForkTiming extends Disposable {
	readonly attemptId = generateUuid();
	private readonly _total = StopWatch.create();
	private readonly _stallWarning = this._register(new MutableDisposable());
	private _stage: { name: string; timer: StopWatch } | undefined;
	private _completed = false;
	private _failedStages = 0;

	constructor(private readonly _logService: ILogService, chat: URI, source: URI, turnId: string) {
		super();
		this._logService.info(`[CopilotFork] Started: attemptId=${this.attemptId}, chat=${chat.toString()}, sourceChat=${source.toString()}, sourceTurnId=${turnId}`);
		this.startStage('queue');
	}

	startStage(name: string): void {
		this.finishStage('success');
		const stage = this._stage = { name, timer: StopWatch.create() };
		this._logService.info(`[CopilotFork] Stage started: attemptId=${this.attemptId}, stage=${name}, totalElapsedMs=${Math.round(this._total.elapsed())}`);
		this._stallWarning.value = disposableTimeout(() => {
			this._logService.warn(`[CopilotFork] Stage stalled: attemptId=${this.attemptId}, stage=${name}, elapsedMs=${Math.round(stage.timer.elapsed())}, totalElapsedMs=${Math.round(this._total.elapsed())}`);
		}, 60_000);
	}

	finishStage(outcome: 'success' | 'error' | 'skipped'): void {
		this._stallWarning.clear();
		if (!this._stage) {
			return;
		}
		if (outcome === 'error') {
			this._failedStages++;
		}
		this._logService.info(`[CopilotFork] Stage settled: attemptId=${this.attemptId}, stage=${this._stage.name}, outcome=${outcome}, elapsedMs=${Math.round(this._stage.timer.elapsed())}, totalElapsedMs=${Math.round(this._total.elapsed())}`);
		this._stage = undefined;
	}

	complete(outcome: 'success' | 'error'): void {
		if (this._completed) {
			return;
		}
		this._completed = true;
		this.finishStage(outcome);
		const result = outcome === 'success' && this._failedStages > 0 ? 'successWithWarnings' : outcome;
		this._logService.info(`[CopilotFork] Settled: attemptId=${this.attemptId}, outcome=${result}, failedStages=${this._failedStages}, elapsedMs=${Math.round(this._total.elapsed())}`);
	}

	override dispose(): void {
		this.complete('error');
		super.dispose();
	}
}
