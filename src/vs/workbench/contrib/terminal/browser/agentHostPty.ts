/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from '../../../../base/common/async.js';
import { DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IProcessPropertyMap, ITerminalChildProcess, ITerminalLaunchError, ITerminalLaunchResult, ProcessPropertyType } from '../../../../platform/terminal/common/terminal.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { ActionType, IActionEnvelope } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { TerminalClaimKind, type ITerminalState } from '../../../../platform/agentHost/common/state/protocol/state.js';
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
	private _subscriptionRef: IReference<IAgentSubscription<ITerminalState>> | undefined;
	private _initialCwd = '';

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
			// 1. Create the terminal on the agent host
			await this._connection.createTerminal({
				terminal: this._terminalUri.toString(),
				claim: { kind: TerminalClaimKind.Client, clientId: this._connection.clientId },
				name: this._options?.name,
				cwd: this._options?.cwd?.toString(),
				cols: this._lastDimensions.cols > 0 ? this._lastDimensions.cols : undefined,
				rows: this._lastDimensions.rows > 0 ? this._lastDimensions.rows : undefined,
			});

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

			const state = subscription.value as ITerminalState;

			// 4. Replay any existing content from the snapshot
			if (state.content) {
				this.handleData(state.content);
			}

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

	private _handleAction(envelope: IActionEnvelope): void {
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
		}
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
			this._connection.disposeTerminal(this._terminalUri);
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
