/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { AgentHostActivity, IAgentHostHeartbeat, toAgentHostHeartbeatAction } from '../common/agentHostProcessExit.js';
import { ActionType, type ActionEnvelope } from '../common/state/sessionActions.js';
import { ToolCallContributorKind, type ToolCallState } from '../common/state/sessionState.js';

/** The agent host state a heartbeat reports. */
export interface IAgentHostHeartbeatSource {
	readonly onDidEmitEnvelope: Event<ActionEnvelope>;
	readonly activeTurnCount: number;
	readonly loadedSessionCount: number;
	readonly connectedClientCount: number;
	getRunningToolCalls(): readonly ToolCallState[];
}

export interface IAgentHostExitHeartbeatOptions {
	readonly heapLimitBytes: number;
	readonly readMemory?: () => Pick<NodeJS.MemoryUsage, 'heapUsed' | 'external' | 'arrayBuffers' | 'rss'>;
}

const bytesPerMb = 1024 * 1024;
/** Report at least once per this interval while idle. */
const idleIntervalMs = 30_000;
/** Report at least once per this interval while a turn or tool runs. */
const activeIntervalMs = 5_000;
/** Report at least once per this interval once the heap is this full, because heap exhaustion can follow within seconds. */
const highHeapIntervalMs = 1_000;
const highHeapRatio = 0.5;
/** Turn and tool changes are reported promptly, but at most once per this interval. */
const minIntervalMs = 1_000;

/**
 * Action types not reported as the last action: those emitted many times per
 * turn, and bookkeeping that follows turn changes, which would hide the action
 * that preceded them.
 */
const unreportedActionTypes: ReadonlySet<string> = new Set([
	ActionType.RootActiveSessionsChanged,
	ActionType.ChatDelta,
	ActionType.ChatReasoning,
	ActionType.ChatToolCallDelta,
	ActionType.ChatToolCallContentChanged,
	ActionType.ChatUsage,
	ActionType.TerminalData,
	ActionType.TerminalInput,
]);

/** Action types that may change the activity a heartbeat reports. */
const activityActionTypes: ReadonlySet<string> = new Set([
	ActionType.ChatTurnStarted,
	ActionType.ChatTurnResume,
	ActionType.ChatTruncated,
	ActionType.ChatTurnComplete,
	ActionType.ChatTurnCancelled,
	ActionType.ChatError,
	ActionType.ChatToolCallReady,
	ActionType.ChatToolCallConfirmed,
	ActionType.ChatToolCallAuthRequired,
	ActionType.ChatToolCallAuthResolved,
	ActionType.ChatToolCallComplete,
]);

/**
 * Periodically reports the agent host's memory and activity so the parent can
 * report what the host was doing if it exits unexpectedly. Reports more often
 * while work runs or the heap fills up. Its timer does not keep the process alive.
 */
export class AgentHostExitHeartbeat extends Disposable {

	private _lastActionType: string | undefined;
	private _timer: { readonly handle: ReturnType<typeof setTimeout>; readonly due: number } | undefined;
	private _lastPostTime = 0;

	constructor(
		private readonly _source: IAgentHostHeartbeatSource,
		private readonly _post: (heartbeat: IAgentHostHeartbeat) => void,
		private readonly _options: IAgentHostExitHeartbeatOptions,
	) {
		super();
		this._register(toDisposable(() => {
			if (this._timer) {
				clearTimeout(this._timer.handle);
				this._timer = undefined;
			}
		}));
		this._register(_source.onDidEmitEnvelope(envelope => {
			const type = envelope.action.type;
			if (!unreportedActionTypes.has(type)) {
				this._lastActionType = type;
			}
			if (activityActionTypes.has(type)) {
				this._schedule(Math.max(0, this._lastPostTime + minIntervalMs - Date.now()));
			}
		}));
		this._postHeartbeat();
	}

	private _postHeartbeat(): void {
		this._timer = undefined;
		this._lastPostTime = Date.now();
		let delayMs = idleIntervalMs;
		try {
			const memory = this._options.readMemory?.() ?? process.memoryUsage();
			const heartbeat = this._createHeartbeat(memory);
			this._post(heartbeat);
			delayMs = memory.heapUsed >= this._options.heapLimitBytes * highHeapRatio ? highHeapIntervalMs : heartbeat.activity !== 'idle' ? activeIntervalMs : idleIntervalMs;
		} catch {
			// Diagnostics must never take down the host.
		}
		this._schedule(delayMs);
	}

	private _createHeartbeat(memory: Pick<NodeJS.MemoryUsage, 'heapUsed' | 'external' | 'arrayBuffers' | 'rss'>): IAgentHostHeartbeat {
		const activeTurns = this._source.activeTurnCount;
		const runningToolCalls = this._source.getRunningToolCalls();
		const lastAction = this._lastActionType !== undefined ? toAgentHostHeartbeatAction(this._lastActionType) : undefined;
		return {
			heapUsedMb: Math.round(memory.heapUsed / bytesPerMb),
			heapLimitMb: Math.round(this._options.heapLimitBytes / bytesPerMb),
			externalMb: Math.round(memory.external / bytesPerMb),
			arrayBuffersMb: Math.round(memory.arrayBuffers / bytesPerMb),
			rssMb: Math.round(memory.rss / bytesPerMb),
			activeTurns,
			runningToolCalls: runningToolCalls.length,
			loadedSessions: this._source.loadedSessionCount,
			connectedClients: this._source.connectedClientCount,
			activity: toActivity(runningToolCalls, activeTurns),
			...(lastAction !== undefined ? { lastAction } : {}),
		};
	}

	/** Schedules the next heartbeat in `delayMs`, unless one is due sooner. */
	private _schedule(delayMs: number): void {
		if (this._store.isDisposed) {
			return;
		}
		const due = Date.now() + delayMs;
		if (this._timer) {
			if (this._timer.due <= due) {
				return;
			}
			clearTimeout(this._timer.handle);
		}
		const handle = setTimeout(() => this._postHeartbeat(), delayMs);
		// The cast avoids the DOM/Node `setTimeout` typing collision; unit tests run where timers have no `unref`.
		(handle as unknown as { unref?(): void }).unref?.();
		this._timer = { handle, due };
	}
}

/** The contributor kind of the last running tool call, or `turn` or `idle` by whether any turn is active. */
function toActivity(runningToolCalls: readonly ToolCallState[], activeTurns: number): AgentHostActivity {
	const toolCall = runningToolCalls.at(-1);
	if (toolCall) {
		const contributor = toolCall.contributor?.kind;
		return contributor === ToolCallContributorKind.MCP ? 'tool:mcp' : contributor === ToolCallContributorKind.Client ? 'tool:client' : 'tool:host';
	}
	return activeTurns > 0 ? 'turn' : 'idle';
}
