/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import type { ICommandDetectionCapability } from '../../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { disposableTimeout } from '../../../../../../../base/common/async.js';

/**
 * The auto-expand algorithm for terminal tool progress parts.
 *
 * The algorithm is:
 * 1. When command executes, kick off 500ms timeout - if hit without data events, expand only if there's real output
 * 2. On first data event, wait 50ms and expand if command not yet finished
 * 3. Fast commands (finishing quickly) should NOT auto-expand to prevent flickering
 */
export interface ITerminalToolAutoExpandOptions {
	/**
	 * The command detection capability to listen for command events.
	 */
	readonly commandDetection: ICommandDetectionCapability;

	/**
	 * Event fired when data is received from the terminal.
	 */
	readonly onWillData: Event<unknown>;

	/**
	 * Check if the output should auto-expand (e.g. not already expanded, user hasn't toggled).
	 */
	shouldAutoExpand(): boolean;

	/**
	 * Check if there is real output (not just shell integration sequences).
	 */
	hasRealOutput(): boolean;
}

/**
 * Timeout constants for the auto-expand algorithm.
 */
export const enum TerminalToolAutoExpandTimeout {
	/**
	 * Timeout in milliseconds to wait when no data events are received before checking for auto-expand.
	 */
	NoData = 500,
	/**
	 * Timeout in milliseconds to wait after first data event before checking for auto-expand.
	 * This prevents flickering for fast commands like `ls` that finish quickly.
	 */
	DataEvent = 50,
}

export class TerminalToolAutoExpand extends Disposable {
	private _commandFinished = false;
	private _receivedData = false;
	private _dataEventTimeout: IDisposable | undefined;
	private _noDataTimeout: IDisposable | undefined;

	private readonly _onDidRequestExpand = this._register(new Emitter<void>());
	readonly onDidRequestExpand: Event<void> = this._onDidRequestExpand.event;

	constructor(
		private readonly _options: ITerminalToolAutoExpandOptions,
	) {
		super();
		this._setupListeners();
	}

	private _setupListeners(): void {
		const store = this._register(new DisposableStore());

		const commandDetection = this._options.commandDetection;

		store.add(commandDetection.onCommandExecuted(() => {
			// Auto-expand for long-running commands:
			if (this._options.shouldAutoExpand() && !this._noDataTimeout) {
				this._noDataTimeout = disposableTimeout(() => {
					this._noDataTimeout = undefined;
					if (!this._receivedData && this._options.shouldAutoExpand() && this._options.hasRealOutput()) {
						this._onDidRequestExpand.fire();
					}
				}, TerminalToolAutoExpandTimeout.NoData, store);
			}
		}));

		// 2. Wait for first data event - when hit, wait 50ms and expand if command not yet finished
		// Also checks for real output since shell integration sequences trigger onWillData
		store.add(this._options.onWillData(() => {
			if (this._receivedData) {
				return;
			}
			this._receivedData = true;
			this._noDataTimeout?.dispose();
			this._noDataTimeout = undefined;
			// Wait 50ms and expand if command hasn't finished yet and has real output
			if (this._options.shouldAutoExpand() && !this._dataEventTimeout) {
				this._dataEventTimeout = disposableTimeout(() => {
					this._dataEventTimeout = undefined;
					if (!this._commandFinished && this._options.shouldAutoExpand() && this._options.hasRealOutput()) {
						this._onDidRequestExpand.fire();
					}
				}, TerminalToolAutoExpandTimeout.DataEvent, store);
			}
		}));

		store.add(commandDetection.onCommandFinished(() => {
			this._commandFinished = true;
			this._clearAutoExpandTimeouts();
		}));
	}

	private _clearAutoExpandTimeouts(): void {
		this._dataEventTimeout?.dispose();
		this._dataEventTimeout = undefined;
		this._noDataTimeout?.dispose();
		this._noDataTimeout = undefined;
	}
}
