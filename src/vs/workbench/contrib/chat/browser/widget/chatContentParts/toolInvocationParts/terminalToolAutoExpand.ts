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
 * 1. When command executes, kick off 500ms timeout - expand if there's real output (data events
 *    may fire before onCommandExecuted due to shell integration sequences, so we can't rely on
 *    receivedData to skip this path)
 * 2. On first data event, wait 50ms and expand if command not yet finished and has real output
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
			console.log('[TerminalToolAutoExpand] onCommandExecuted, shouldAutoExpand:', this._options.shouldAutoExpand());
			// Auto-expand for long-running commands:
			if (this._options.shouldAutoExpand() && !this._noDataTimeout) {
				console.log('[TerminalToolAutoExpand] Starting NoData timeout (' + TerminalToolAutoExpandTimeout.NoData + 'ms)');
				this._noDataTimeout = disposableTimeout(() => {
					this._noDataTimeout = undefined;
					const shouldExpand = this._options.shouldAutoExpand();
					const hasOutput = this._options.hasRealOutput();
					console.log('[TerminalToolAutoExpand] NEW CODE - NoData timeout fired, shouldAutoExpand:', shouldExpand, 'hasRealOutput:', hasOutput);
					// Don't check receivedData here - data events can fire before onCommandExecuted
					// (shell integration sequences), and the DataEvent path may not have expanded
					// if hasRealOutput was false at that time
					if (shouldExpand && hasOutput) {
						console.log('[TerminalToolAutoExpand] Firing onDidRequestExpand (NoData path)');
						this._onDidRequestExpand.fire();
					}
				}, TerminalToolAutoExpandTimeout.NoData, store);
			}
		}));

		// 2. Wait for first data event - when hit, wait 50ms and expand if command not yet finished
		// Also checks for real output since shell integration sequences trigger onWillData
		store.add(this._options.onWillData(() => {
			console.log('[TerminalToolAutoExpand] onWillData, receivedData before:', this._receivedData);
			if (this._receivedData) {
				return;
			}
			this._receivedData = true;
			this._noDataTimeout?.dispose();
			this._noDataTimeout = undefined;
			console.log('[TerminalToolAutoExpand] First data event, shouldAutoExpand:', this._options.shouldAutoExpand());
			// Wait 50ms and expand if command hasn't finished yet and has real output
			if (this._options.shouldAutoExpand() && !this._dataEventTimeout) {
				console.log('[TerminalToolAutoExpand] Starting DataEvent timeout (' + TerminalToolAutoExpandTimeout.DataEvent + 'ms)');
				this._dataEventTimeout = disposableTimeout(() => {
					this._dataEventTimeout = undefined;
					const shouldExpand = this._options.shouldAutoExpand();
					const hasOutput = this._options.hasRealOutput();
					console.log('[TerminalToolAutoExpand] DataEvent timeout fired, commandFinished:', this._commandFinished, 'shouldAutoExpand:', shouldExpand, 'hasRealOutput:', hasOutput);
					if (!this._commandFinished && shouldExpand && hasOutput) {
						console.log('[TerminalToolAutoExpand] Firing onDidRequestExpand (DataEvent path)');
						this._onDidRequestExpand.fire();
					}
				}, TerminalToolAutoExpandTimeout.DataEvent, store);
			}
		}));

		store.add(commandDetection.onCommandFinished(() => {
			console.log('[TerminalToolAutoExpand] onCommandFinished, clearing timeouts');
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
