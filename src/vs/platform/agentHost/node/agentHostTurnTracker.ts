/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import type { AgentHostModelTelemetryKind, AgentHostTelemetryReporter, AgentHostTurnResult, IAgentHostTurnFailure } from './agentHostTelemetryReporter.js';

/** Per-turn timing state, keyed by `session:turnId`. */
interface ITurnTiming {
	readonly stopWatch: StopWatch;
	readonly provider: string;
	readonly session: string;
	model: string | undefined;
	modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	readonly modelSelectionKind: 'default' | 'auto' | 'explicit';
	readonly permissionLevel: string | undefined;
	firstProgressMs: number | undefined;
}

/**
 * Tracks per-turn timing for agent host sessions and reports a completion
 * event via the provided {@link AgentHostTelemetryReporter} when a turn ends.
 *
 * Lifecycle per turn:
 *   1. {@link turnStarted} — begins a stopwatch for the turn
 *   2. {@link markFirstProgress} — records elapsed time to first visible output
 *      (only the first call per turn has an effect)
 *   3. {@link turnCompleted} — emits the telemetry event and clears state
 */
export class AgentHostTurnTracker extends Disposable {

	private readonly _turnTimings = new Map<string, ITurnTiming>();

	/**
	 * Fires with the provider id whenever a turn starts, i.e. whenever the host
	 * is about to make an LLM request on that provider's behalf.
	 *
	 * Consumed by {@link AgentModelRefreshScheduler} to gate its periodic model
	 * refresh on real usage, so an idle host issues no `models` network
	 * requests at all. Local host commands (`/rename`, `!command`) are
	 * intercepted before `turnStarted` is reached and so correctly do not count
	 * as activity.
	 */
	private readonly _onDidStartTurn = this._register(new Emitter<string>());
	readonly onDidStartTurn: Event<string> = this._onDidStartTurn.event;

	constructor(private readonly _reporter: AgentHostTelemetryReporter) {
		super();
	}

	turnStarted(provider: string, session: string, turnId: string, model: string | undefined, modelTelemetryKind: AgentHostModelTelemetryKind | undefined, permissionLevel: string | undefined): void {
		const key = this._key(session, turnId);
		this._turnTimings.set(key, {
			stopWatch: StopWatch.create(false),
			provider,
			session,
			model,
			modelTelemetryKind,
			modelSelectionKind: model === undefined ? 'default' : model === 'auto' ? 'auto' : 'explicit',
			permissionLevel,
			firstProgressMs: undefined,
		});
		this._onDidStartTurn.fire(provider);
	}

	markFirstProgress(session: string, turnId: string): void {
		const timing = this._turnTimings.get(this._key(session, turnId));
		if (timing && timing.firstProgressMs === undefined) {
			timing.firstProgressMs = timing.stopWatch.elapsed();
		}
	}

	updateModel(session: string, turnId: string, model: string, modelTelemetryKind: AgentHostModelTelemetryKind): void {
		const timing = this._turnTimings.get(this._key(session, turnId));
		if (timing) {
			timing.model = model;
			timing.modelTelemetryKind = modelTelemetryKind;
		}
	}

	getModelTelemetryContext(session: string, turnId: string): { model: string | undefined; modelTelemetryKind: AgentHostModelTelemetryKind | undefined } | undefined {
		const timing = this._turnTimings.get(this._key(session, turnId));
		return timing ? { model: timing.model, modelTelemetryKind: timing.modelTelemetryKind } : undefined;
	}

	turnCompleted(session: string, turnId: string, result: AgentHostTurnResult, failure?: IAgentHostTurnFailure): void {
		const key = this._key(session, turnId);
		const timing = this._turnTimings.get(key);
		if (!timing) {
			return;
		}
		this._turnTimings.delete(key);

		this._reporter.turnCompleted({
			provider: timing.provider,
			session: timing.session,
			turnId,
			timeToFirstProgress: timing.firstProgressMs,
			totalTime: timing.stopWatch.elapsed(),
			result,
			model: timing.model,
			modelTelemetryKind: timing.modelTelemetryKind,
			modelSelectionKind: timing.modelSelectionKind,
			permissionLevel: timing.permissionLevel,
			failure,
		});
	}

	private _key(session: string, turnId: string): string {
		return `${session}\0${turnId}`;
	}
}
