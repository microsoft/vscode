/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IProcessPropertyMap, ITerminalChildProcess, ITerminalLaunchError, ITerminalLaunchResult, ProcessPropertyType } from '../../../../platform/terminal/common/terminal.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { ActionType, ActionEnvelope } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { TerminalClaimKind, type TerminalContentPart, type TerminalState } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { BasePty } from '../common/basePty.js';

/**
 * Options for creating a new terminal on an agent host.
 */
export interface IAgentHostPtyOptions {
	/** Human-readable terminal name. */
	readonly name?: string;
	/** Initial working directory URI. */
	readonly cwd?: URI;
	/**
	 * When true, attach to an existing terminal on the agent host instead of
	 * creating a new one. The terminal must already exist server-side (e.g.
	 * created by a tool). The pty will subscribe to its state and replay
	 * content without calling `createTerminal`.
	 */
	readonly attachOnly?: boolean;
}

export interface IAgentHostPtyCommandExecutedEvent {
	readonly commandId: string;
	readonly commandLine: string;
	readonly timestamp: number;
	/** The stored VT output for this command (present during content replay). */
	readonly storedOutput?: string;
}

export interface IAgentHostPtyCommandFinishedEvent {
	readonly commandId: string;
	readonly exitCode?: number;
	readonly durationMs?: number;
}

export const enum AhpCommandMarkKind {
	Executed = 's',
	End = 'e'
}


/**
 * Generates the mark ID used to correlate SetMark VT codes with xterm markers
 * via {@link IBufferMarkCapability.getMark}.
 */
export function getAhpCommandMarkId(commandId: string, kind: AhpCommandMarkKind): string {
	return `ahp-${commandId}-${kind}`;
}

/** Generates an OSC 633 SetMark sequence for an AHP command boundary. */
function getAhpCommandMarkCode(commandId: string, kind: AhpCommandMarkKind): string {
	return `\x1b]633;SetMark;Id=${getAhpCommandMarkId(commandId, kind)};Hidden\x07`;
}

/**
 * The sentinel prefix used by copilot shell tools for exit code detection.
 * When shell integration is active, these internal sentinel echo commands
 * get detected as real commands — we suppress them from command events.
 */
const COPILOT_SENTINEL_PREFIX = '<<<COPILOT_SENTINEL_';

/** Returns whether a command line is a copilot sentinel echo, not a real user command. */
function isCopilotSentinelCommand(commandLine: string): boolean {
	return commandLine.includes(COPILOT_SENTINEL_PREFIX);
}

/**
 * A pseudo-terminal backed by an Agent Host Protocol terminal subscription.
 *
 * Uses `customPtyImplementation` on `IShellLaunchConfig` so the
 * `TerminalProcessManager` bypasses the pty host backend entirely.
 *
 * Data flow:
 *   terminal/data   →  onProcessData
 *   terminal/exited →  onProcessExit
 *   input(data)     →  dispatch terminal/input
 *   resize(c,r)     →  dispatch terminal/resized
 *   shutdown()      →  disposeTerminal command
 */
export class AgentHostPty extends BasePty implements ITerminalChildProcess {

	private readonly _startBarrier = new Barrier();
	private readonly _subscriptionDisposables = this._register(new DisposableStore());
	private _subscriptionRef: IReference<IAgentSubscription<TerminalState>> | undefined;
	private _initialCwd = '';

	private readonly _onCommandExecuted = this._register(new Emitter<IAgentHostPtyCommandExecutedEvent>());
	readonly onCommandExecuted: Event<IAgentHostPtyCommandExecutedEvent> = this._onCommandExecuted.event;

	private readonly _onCommandFinished = this._register(new Emitter<IAgentHostPtyCommandFinishedEvent>());
	readonly onCommandFinished: Event<IAgentHostPtyCommandFinishedEvent> = this._onCommandFinished.event;

	private readonly _onSupportsCommandDetection = this._register(new Emitter<void>());
	readonly onSupportsCommandDetection: Event<void> = this._onSupportsCommandDetection.event;

	private _supportsCommandDetection = false;
	get supportsCommandDetection(): boolean { return this._supportsCommandDetection; }

	/**
	 * Command IDs for sentinel commands that should be suppressed from shell
	 * integration events. When the copilot shell tools fall back to sentinel-
	 * based exit code detection, shell integration may also detect the sentinel
	 * echo as a real command — we filter those out here.
	 */
	private readonly _suppressedCommandIds = new Set<string>();

	constructor(
		id: number,
		private readonly _connection: IAgentConnection,
		private readonly _terminalUri: URI,
		private readonly _options?: IAgentHostPtyOptions,
	) {
		super(id, /* shouldPersist */ false);
	}

	async start(): Promise<ITerminalLaunchError | ITerminalLaunchResult | undefined> {
		try {
			// 1. Create the terminal on the agent host (skip for attach-only mode
			//    where the terminal already exists, e.g. created by a tool)
			if (!this._options?.attachOnly) {
				await this._connection.createTerminal({
					terminal: this._terminalUri.toString(),
					claim: { kind: TerminalClaimKind.Client, clientId: this._connection.clientId },
					name: this._options?.name,
					cwd: this._resolveCwdForProtocol(this._options?.cwd),
					cols: this._lastDimensions.cols > 0 ? this._lastDimensions.cols : undefined,
					rows: this._lastDimensions.rows > 0 ? this._lastDimensions.rows : undefined,
				});
			}

			// 2. Get a subscription for the terminal URI (auto-subscribes)
			this._subscriptionRef = this._connection.getSubscription(StateComponents.Terminal, this._terminalUri);
			const subscription = this._subscriptionRef.object;

			// 3. Wait for hydration via onDidChange, then replay snapshot
			if (subscription.value === undefined) {
				await new Promise<void>(resolve => {
					const listener = subscription.onDidChange(() => {
						listener.dispose();
						resolve();
					});
					this._subscriptionDisposables.add(listener);
				});
			}

			const state = subscription.value as TerminalState;

			// 4. Replay any existing content from the snapshot
			if (state.supportsCommandDetection) {
				this._supportsCommandDetection = true;
				this._onSupportsCommandDetection.fire();
			}
			this._replayContent(state.content);

			// 5. Track initial cwd
			this._initialCwd = state.cwd?.toString() ?? '';
			this._properties.cwd = this._initialCwd;
			this._properties.initialCwd = this._initialCwd;
			if (state.title) {
				this._properties.title = state.title;
			}

			// 6. Wire up action listener for streaming updates via the subscription
			this._subscriptionDisposables.add(subscription.onDidApplyAction(envelope => {
				this._handleAction(envelope);
			}));

			// 7. Signal that the process is ready
			this._startBarrier.open();
			this.handleReady({ pid: -1, cwd: this._initialCwd, windowsPty: undefined });
			return undefined;
		} catch (err) {
			this._startBarrier.open();
			return { message: err instanceof Error ? err.message : String(err) };
		}
	}

	private _handleAction(envelope: ActionEnvelope): void {
		const action = envelope.action;
		switch (action.type) {
			case ActionType.TerminalData:
				this.handleData(action.data);
				break;
			case ActionType.TerminalExited:
				this.handleExit(action.exitCode);
				break;
			case ActionType.TerminalCwdChanged:
				this._properties.cwd = action.cwd.toString();
				this.handleDidChangeProperty({ type: ProcessPropertyType.Cwd, value: action.cwd.toString() });
				break;
			case ActionType.TerminalTitleChanged:
				this._properties.title = action.title;
				this.handleDidChangeProperty({ type: ProcessPropertyType.Title, value: action.title });
				break;
			case ActionType.TerminalResized:
				// Only apply resize from other clients — this client owns
				// its own dimensions and echoing back our own resize would
				// cause a feedback loop.
				if (envelope.origin?.clientId !== this._connection.clientId) {
					this.handleDidChangeProperty({
						type: ProcessPropertyType.OverrideDimensions,
						value: { cols: action.cols, rows: action.rows },
					});
				}
				break;
			case ActionType.TerminalCommandDetectionAvailable:
				if (!this._supportsCommandDetection) {
					this._supportsCommandDetection = true;
					this._onSupportsCommandDetection.fire();
				}
				break;
			case ActionType.TerminalCommandExecuted:
				if (isCopilotSentinelCommand(action.commandLine)) {
					this._suppressedCommandIds.add(action.commandId);
					break;
				}
				this.handleData(getAhpCommandMarkCode(action.commandId, AhpCommandMarkKind.Executed));
				this._onCommandExecuted.fire({
					commandId: action.commandId,
					commandLine: action.commandLine,
					timestamp: action.timestamp,
				});
				break;
			case ActionType.TerminalCommandFinished:
				if (this._suppressedCommandIds.delete(action.commandId)) {
					break;
				}
				this.handleData(getAhpCommandMarkCode(action.commandId, AhpCommandMarkKind.End));
				this._onCommandFinished.fire({
					commandId: action.commandId,
					exitCode: action.exitCode,
					durationMs: action.durationMs,
				});
				break;
		}
	}

	/**
	 * Replays structured terminal content parts from the initial state snapshot.
	 * Emits command lifecycle events for command parts so that consumers
	 * (e.g. {@link AhpTerminalCommandSource}) can reconstruct command history.
	 */
	private _replayContent(content: TerminalContentPart[]): void {
		for (const part of content) {
			if (part.type === 'unclassified') {
				if (part.value) {
					this.handleData(part.value);
				}
			} else if (part.type === 'command') {
				if (isCopilotSentinelCommand(part.commandLine)) {
					continue;
				}
				this.handleData(getAhpCommandMarkCode(part.commandId, AhpCommandMarkKind.Executed));
				this._onCommandExecuted.fire({
					commandId: part.commandId,
					commandLine: part.commandLine,
					timestamp: part.timestamp,
					storedOutput: part.output,
				});
				if (part.output) {
					this.handleData(part.output);
				}
				if (part.isComplete) {
					this.handleData(getAhpCommandMarkCode(part.commandId, AhpCommandMarkKind.End));
					this._onCommandFinished.fire({
						commandId: part.commandId,
						exitCode: part.exitCode,
						durationMs: part.durationMs,
					});
				}
			}
		}
	}

	/**
	 * Resolves a cwd URI for sending over the protocol. Agent-host URIs
	 * are unwrapped to their original URI via {@link fromAgentHostUri}.
	 */
	private _resolveCwdForProtocol(cwd: URI | undefined): string | undefined {
		if (!cwd) {
			return undefined;
		}
		if (cwd.scheme === AGENT_HOST_SCHEME) {
			return fromAgentHostUri(cwd).toString();
		}
		return cwd.toString();
	}

	input(data: string): void {
		if (this._inReplay) {
			return;
		}
		this._startBarrier.wait().then(() => {
			this._connection.dispatch(
				{ type: ActionType.TerminalInput, terminal: this._terminalUri.toString(), data },
			);
		});
	}

	resize(cols: number, rows: number): void {
		if (this._inReplay || (this._lastDimensions.cols === cols && this._lastDimensions.rows === rows)) {
			return;
		}
		this._lastDimensions.cols = cols;
		this._lastDimensions.rows = rows;
		this._startBarrier.wait().then(() => {
			this._connection.dispatch(
				{ type: ActionType.TerminalResized, terminal: this._terminalUri.toString(), cols, rows },
			);
		});
	}

	shutdown(_immediate: boolean): void {
		this._startBarrier.wait().then(() => {
			// In attach-only mode, don't dispose the server-side terminal —
			// it's owned by the tool/session, not by this client.
			if (!this._options?.attachOnly) {
				this._connection.disposeTerminal(this._terminalUri);
			}
			this._subscriptionRef?.dispose();
			this._subscriptionRef = undefined;
			this._subscriptionDisposables.clear();
			this.handleExit(undefined);
		});
	}

	override async getInitialCwd(): Promise<string> {
		return this._initialCwd;
	}

	override async getCwd(): Promise<string> {
		return this._properties.cwd || this._initialCwd;
	}

	async clearBuffer(): Promise<void> {
		// Send a clear action to the agent host
		this._connection.dispatch(
			{ type: ActionType.TerminalCleared, terminal: this._terminalUri.toString() },
		);
	}

	acknowledgeDataEvent(_charCount: number): void {
		// No flow control needed for AHP terminals
	}

	async setUnicodeVersion(_version: '6' | '11'): Promise<void> {
		// Not applicable
	}

	processBinary(_data: string): Promise<void> {
		// Not applicable
		return Promise.resolve();
	}

	sendSignal(_signal: string): void {
		// Not applicable
	}

	async refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]> {
		return this._properties[type];
	}

	async updateProperty<T extends ProcessPropertyType>(_type: T, _value: IProcessPropertyMap[T]): Promise<void> {
		// Not applicable
	}

	override dispose(): void {
		this._subscriptionRef?.dispose();
		this._subscriptionRef = undefined;
		super.dispose();
	}
}
