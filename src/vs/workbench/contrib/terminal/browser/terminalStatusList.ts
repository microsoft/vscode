/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';

export interface ITerminalStatus {
	/** An internal string ID used to identify the status. */
	id: string;
	/**
	 * The severity of the status, this defines both the color and how likely the status is to be
	 * the "primary status".
	 */
	severity: Severity;
}

export interface ITerminalStatusList {
	/** Gets the most recent, highest severity status. */
	readonly primary: ITerminalStatus | undefined;
	/** Gets all active statues. */
	readonly statuses: ITerminalStatus[];

	readonly onDidAddStatus: Event<ITerminalStatus>;
	readonly onDidRemoveStatus: Event<ITerminalStatus>;

	/**
	 * Adds a status to the list.
	 * @param duration An optional duration of the status, when specified the status will remove
	 * itself when the duration elapses unless the status gets re-added.
	 */
	add(status: ITerminalStatus, duration?: number): void;
	remove(status: ITerminalStatus): void;
	remove(statusId: string): void;
	toggle(status: ITerminalStatus, value: boolean): void;
}

export class TerminalStatusList implements ITerminalStatusList {
	private readonly _statuses: Map<string, ITerminalStatus> = new Map();
	private readonly _statusTimeouts: Map<string, number> = new Map();

	private readonly _onDidAddStatus = new Emitter<ITerminalStatus>();
	get onDidAddStatus(): Event<ITerminalStatus> { return this._onDidAddStatus.event; }
	private readonly _onDidRemoveStatus = new Emitter<ITerminalStatus>();
	get onDidRemoveStatus(): Event<ITerminalStatus> { return this._onDidRemoveStatus.event; }

	get primary(): ITerminalStatus | undefined {
		let result: ITerminalStatus | undefined;
		for (const s of this._statuses.values()) {
			if (!result || s.severity > result.severity) {
				result = s;
			}
		}
		return result;
	}

	get statuses(): ITerminalStatus[] { return Array.from(this._statuses.values()); }

	add(status: ITerminalStatus, duration?: number) {
		const outTimeout = this._statusTimeouts.get(status.id);
		if (outTimeout) {
			window.clearTimeout(outTimeout);
			this._statusTimeouts.delete(status.id);
		}
		if (duration && duration > 0) {
			const timeout = window.setTimeout(() => this.remove(status), duration);
			this._statusTimeouts.set(status.id, timeout);
		}
		if (!this._statuses.has(status.id)) {
			this._statuses.set(status.id, status);
			this._onDidAddStatus.fire(status);
		}
	}

	remove(status: ITerminalStatus): void;
	remove(statusId: string): void;
	remove(statusOrId: ITerminalStatus | string): void {
		const status = typeof statusOrId === 'string' ? this._statuses.get(statusOrId) : statusOrId;
		// Verify the status is the same as the one passed in
		if (status && this._statuses.get(status.id)) {
			this._statuses.delete(status.id);
			this._onDidRemoveStatus.fire(status);
		}
	}

	toggle(status: ITerminalStatus, value: boolean) {
		if (value) {
			this.add(status);
		} else {
			this.remove(status);
		}
	}
}
