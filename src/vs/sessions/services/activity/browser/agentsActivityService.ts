/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

/** Telemetry schema version for the active-context trajectory events. */
const AGENTS_ACTIVITY_SCHEMA_VERSION = 1;

/**
 * Bounded set of focusable surfaces in the Agents window. `none` means no Agents
 * surface currently holds focus (e.g. focus left the window). Keep this list
 * allowlisted; surfaces report their own identity so no DOM sniffing is needed.
 */
export type AgentsSurface =
	| 'none'
	| 'inbox'
	| 'sessionsList'
	| 'sessionChat'
	| 'composer'
	| 'changes'
	| 'diff'
	| 'automations'
	| 'customization'
	| 'settings'
	| 'titlebar'
	| 'other';

/** Bounded cause of an active-context transition. */
export type AgentsContextTransitionCause =
	| 'open'
	| 'focus'
	| 'switch'
	| 'blur'
	| 'programmatic';

/** Non-identifying context for the surface that became active. */
export interface IAgentsSurfaceContext {
	/** SHA-1 hash of the session in context, or undefined/none when not session-scoped. */
	readonly agentSessionId?: string;
	/** Bounded provider category for the session in context, or undefined/none. */
	readonly providerId?: string;
	/** Opaque id for this mounted instance of the surface (distinguishes reopen cycles). */
	readonly surfaceInstanceId?: string;
}

export interface IAgentsActivityService {
	readonly _serviceBrand: undefined;

	/**
	 * Report that a surface gained focus / became the active context. Emits a bounded
	 * `agents/activeContextChanged` transition from the previously active surface, carrying the
	 * previous surface's focused dwell. Surfaces call this from their own focus tracking.
	 */
	reportActiveSurface(surface: AgentsSurface, context?: IAgentsSurfaceContext): void;

	/**
	 * Report that a surface lost focus. If it was the active surface and nothing else takes focus
	 * within a short debounce (i.e. focus left all Agents surfaces), a transition to `none` is
	 * emitted. Debouncing avoids spurious churn while focus moves between surfaces.
	 */
	reportSurfaceBlurred(surface: AgentsSurface): void;
}

export const IAgentsActivityService = createDecorator<IAgentsActivityService>('agentsActivityService');

interface IActiveContextEvent {
	fromSurface: string;
	toSurface: string;
	transitionCause: string;
	contextAgentSessionId: string;
	providerId: string;
	surfaceInstanceId: string;
	previousFocusedDwellMs: number;
	schemaVersion: number;
}

type IActiveContextClassification = {
	owner: 'meganrogge';
	comment: 'Reconstructs the foreground focus trajectory across the whole Agents window (not just the inbox): which surface holds focus over time and for how long. These are UI focus proxies, not measured human attention. Emitted only on transitions, which are user-paced.';
	fromSurface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded surface that lost focus (or none at window/tracker start).' };
	toSurface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded surface that gained focus (or none when focus left all Agents surfaces).' };
	transitionCause: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded cause: open (tracker/window start checkpoint), focus, switch, blur, or programmatic.' };
	contextAgentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 hash of the session in context on the target surface, or none when not session-scoped.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded sessions provider category for the session in context, or none.' };
	surfaceInstanceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Opaque id for the mounted instance of the target surface, or none.' };
	previousFocusedDwellMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds the previous surface was continuously focused before this transition; 0 at the start checkpoint. A foreground-focus dwell proxy, not measured reading time.' };
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Schema version of the active-context trajectory events.' };
};

/**
 * Maintains the Agents window's active-surface state machine and emits a single bounded
 * `agents/activeContextChanged` event per focus transition, so the whole-window focus trajectory
 * and per-surface dwell can be reconstructed. Surfaces report their own focus/blur; there is no
 * DOM sniffing. Window-foreground/idle/suspend handling is intentionally out of scope for this
 * first version (dwell may include time the window itself was unfocused).
 */
export class AgentsActivityService extends Disposable implements IAgentsActivityService {
	declare readonly _serviceBrand: undefined;

	private activeSurface: AgentsSurface = 'none';
	private activeContext: IAgentsSurfaceContext | undefined;
	private activeSince = Date.now();
	private readonly pendingBlur = this._register(new MutableDisposable());

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		// Start checkpoint so a dropped first transition does not corrupt the trajectory.
		this.emit('none', 'none', 'open', undefined, 0);
	}

	reportActiveSurface(surface: AgentsSurface, context?: IAgentsSurfaceContext): void {
		this.pendingBlur.clear();
		if (surface === this.activeSurface && sameContext(context, this.activeContext)) {
			return;
		}
		const now = Date.now();
		const dwell = Math.max(0, now - this.activeSince);
		const cause: AgentsContextTransitionCause = this.activeSurface === 'none' ? 'focus' : 'switch';
		const from = this.activeSurface;
		this.activeSurface = surface;
		this.activeContext = context;
		this.activeSince = now;
		this.emit(from, surface, cause, context, dwell);
	}

	reportSurfaceBlurred(surface: AgentsSurface): void {
		if (surface !== this.activeSurface) {
			return;
		}
		// Debounce: focus commonly moves to another surface within the same tick; only treat this
		// as leaving all Agents surfaces if nothing else claims focus.
		this.pendingBlur.value = disposableTimeout(() => {
			if (this.activeSurface !== surface) {
				return;
			}
			const now = Date.now();
			const dwell = Math.max(0, now - this.activeSince);
			const from = this.activeSurface;
			const context = this.activeContext;
			this.activeSurface = 'none';
			this.activeContext = undefined;
			this.activeSince = now;
			this.emit(from, 'none', 'blur', context, dwell);
		}, 0);
	}

	private emit(from: AgentsSurface, to: AgentsSurface, cause: AgentsContextTransitionCause, context: IAgentsSurfaceContext | undefined, dwellMs: number): void {
		this.telemetryService.publicLog2<IActiveContextEvent, IActiveContextClassification>('agents/activeContextChanged', {
			fromSurface: from,
			toSurface: to,
			transitionCause: cause,
			contextAgentSessionId: context?.agentSessionId ?? 'none',
			providerId: context?.providerId ?? 'none',
			surfaceInstanceId: context?.surfaceInstanceId ?? 'none',
			previousFocusedDwellMs: dwellMs,
			schemaVersion: AGENTS_ACTIVITY_SCHEMA_VERSION,
		});
	}
}

function sameContext(a: IAgentsSurfaceContext | undefined, b: IAgentsSurfaceContext | undefined): boolean {
	return (a?.agentSessionId ?? 'none') === (b?.agentSessionId ?? 'none')
		&& (a?.providerId ?? 'none') === (b?.providerId ?? 'none')
		&& (a?.surfaceInstanceId ?? 'none') === (b?.surfaceInstanceId ?? 'none');
}

registerSingleton(IAgentsActivityService, AgentsActivityService, InstantiationType.Delayed);
