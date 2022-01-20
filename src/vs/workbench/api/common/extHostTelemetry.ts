/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostTelemetryShape } from 'vs/workbench/api/common/extHost.protocol';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import type { TelemetryDetails } from 'vscode';

export class ExtHostTelemetry implements ExtHostTelemetryShape {
	private readonly _onDidChangeTelemetryEnabled = new Emitter<boolean>();
	readonly onDidChangeTelemetryEnabled: Event<boolean> = this._onDidChangeTelemetryEnabled.event;

	private readonly _onDidChangeTelemetryDetails = new Emitter<TelemetryDetails>();
	readonly onDidChangeTelemetryDetails: Event<TelemetryDetails> = this._onDidChangeTelemetryDetails.event;

	private _level: TelemetryLevel = TelemetryLevel.NONE;
	private _oldTelemetryEnablement: boolean | undefined;

	getTelemetryEnabled(): boolean {
		return this._level === TelemetryLevel.USAGE;
	}

	getTelemetryDetails(): TelemetryDetails {
		return {
			isCrashEnabled: this._level >= TelemetryLevel.CRASH,
			isErrorsEnabled: this._level >= TelemetryLevel.ERROR,
			isUsageEnabled: this._level >= TelemetryLevel.USAGE
		};
	}

	$initializeTelemetryLevel(level: TelemetryLevel): void {
		this._level = level;
	}

	$onDidChangeTelemetryLevel(level: TelemetryLevel): void {
		this._oldTelemetryEnablement = this.getTelemetryEnabled();
		this._level = level;
		if (this._oldTelemetryEnablement !== this.getTelemetryEnabled()) {
			this._onDidChangeTelemetryEnabled.fire(this.getTelemetryEnabled());
		}
		this._onDidChangeTelemetryDetails.fire(this.getTelemetryDetails());
	}
}

export const IExtHostTelemetry = createDecorator<IExtHostTelemetry>('IExtHostTelemetry');
export interface IExtHostTelemetry extends ExtHostTelemetry, ExtHostTelemetryShape { }
