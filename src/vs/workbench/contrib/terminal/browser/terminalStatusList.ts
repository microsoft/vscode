/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TerminalSettingId } from '../../../../platform/terminal/common/terminal.js';
import { listErrorForeground, listWarningForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ITerminalStatus } from '../common/terminal.js';
import { mainWindow } from '../../../../base/browser/window.js';

/**
 * The set of _internal_ terminal statuses, other components building on the terminal should put
 * their statuses within their component.
 */
export const enum TerminalStatus {
	Bell = 'bell',
	Disconnected = 'disconnected',
	RelaunchNeeded = 'relaunch-needed',
	EnvironmentVariableInfoChangesActive = 'env-var-info-changes-active',
	ShellIntegrationInfo = 'shell-integration-info',
	ShellIntegrationAttentionNeeded = 'shell-integration-attention-needed'
}

export interface ITerminalStatusList {
	/** Gets the most recent, highest severity status. */
	readonly primary: ITerminalStatus | undefined;
	/** Gets all active statues. */
	readonly statuses: ITerminalStatus[];

	readonly onDidAddStatus: Event<ITerminalStatus>;
	readonly onDidRemoveStatus: Event<ITerminalStatus>;
	readonly onDidChangePrimaryStatus: Event<ITerminalStatus | undefined>;

	/**
	 * Adds a status to the list.
	 * @param status The status object. Ideally a single status object that does not change will be
	 * shared as this call will no-op if the status is already set (checked by by object reference).
	 * @param duration An optional duration in milliseconds of the status, when specified the status
	 * will remove itself when the duration elapses unless the status gets re-added.
	 */
	add(status: ITerminalStatus, duration?: number): void;
	remove(status: ITerminalStatus): void;
	remove(statusId: string): void;
	toggle(status: ITerminalStatus, value: boolean): void;
}

export class TerminalStatusList extends Disposable implements ITerminalStatusList {
	private readonly _statuses: Map<string, ITerminalStatus> = new Map();
	private readonly _statusTimeouts: Map<string, number> = new Map();

	private readonly _onDidAddStatus = this._register(new Emitter<ITerminalStatus>());
	get onDidAddStatus(): Event<ITerminalStatus> { return this._onDidAddStatus.event; }
	private readonly _onDidRemoveStatus = this._register(new Emitter<ITerminalStatus>());
	get onDidRemoveStatus(): Event<ITerminalStatus> { return this._onDidRemoveStatus.event; }
	private readonly _onDidChangePrimaryStatus = this._register(new Emitter<ITerminalStatus | undefined>());
	get onDidChangePrimaryStatus(): Event<ITerminalStatus | undefined> { return this._onDidChangePrimaryStatus.event; }

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
	}

	get primary(): ITerminalStatus | undefined {
		let result: ITerminalStatus | undefined;
		for (const s of this._statuses.values()) {
			if (!result || s.severity >= result.severity) {
				if (s.icon || !result?.icon) {
					result = s;
				}
			}
		}
		return result;
	}

	get statuses(): ITerminalStatus[] { return Array.from(this._statuses.values()); }

	add(status: ITerminalStatus, duration?: number) {
		status = this._applyAnimationSetting(status);
		const outTimeout = this._statusTimeouts.get(status.id);
		if (outTimeout) {
			mainWindow.clearTimeout(outTimeout);
			this._statusTimeouts.delete(status.id);
		}
		if (duration && duration > 0) {
			const timeout = mainWindow.setTimeout(() => this.remove(status), duration);
			this._statusTimeouts.set(status.id, timeout);
		}
		const existingStatus = this._statuses.get(status.id);
		if (existingStatus && existingStatus !== status) {
			this._onDidRemoveStatus.fire(existingStatus);
			this._statuses.delete(existingStatus.id);
		}
		if (!this._statuses.has(status.id)) {
			const oldPrimary = this.primary;
			this._statuses.set(status.id, status);
			this._onDidAddStatus.fire(status);
			const newPrimary = this.primary;
			if (oldPrimary !== newPrimary) {
				this._onDidChangePrimaryStatus.fire(newPrimary);
			}
		}
	}

	remove(status: ITerminalStatus): void;
	remove(statusId: string): void;
	remove(statusOrId: ITerminalStatus | string): void {
		const status = typeof statusOrId === 'string' ? this._statuses.get(statusOrId) : statusOrId;
		// Verify the status is the same as the one passed in
		if (status && this._statuses.get(status.id)) {
			const wasPrimary = this.primary?.id === status.id;
			this._statuses.delete(status.id);
			this._onDidRemoveStatus.fire(status);
			if (wasPrimary) {
				this._onDidChangePrimaryStatus.fire(this.primary);
			}
		}
	}

	toggle(status: ITerminalStatus, value: boolean) {
		if (value) {
			this.add(status);
		} else {
			this.remove(status);
		}
	}

	private _applyAnimationSetting(status: ITerminalStatus): ITerminalStatus {
		if (!status.icon || ThemeIcon.getModifier(status.icon) !== 'spin' || this._configurationService.getValue(TerminalSettingId.TabsEnableAnimation)) {
			return status;
		}
		let icon;
		// Loading without animation is just a curved line that doesn't mean anything
		if (status.icon.id === spinningLoading.id) {
			icon = Codicon.play;
		} else {
			icon = ThemeIcon.modify(status.icon, undefined);
		}
		// Clone the status when changing the icon so that setting changes are applied without a
		// reload being needed
		return {
			...status,
			icon
		};
	}
}

export function getColorForSeverity(severity: Severity): string {
	switch (severity) {
		case Severity.Error:
			return listErrorForeground;
		case Severity.Warning:
			return listWarningForeground;
		default:
			return '';
	}
}
