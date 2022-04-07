/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostTelemetryShape } from 'vs/workbench/api/common/extHost.protocol';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import type { TelemetryConfiguration } from 'vscode';

export class ExtHostTelemetry implements ExtHostTelemetryShape {
	private readonly _onDidChangeTelemetryEnabled = new Emitter<boolean>();
	readonly onDidChangeTelemetryEnabled: Event<boolean> = this._onDidChangeTelemetryEnabled.event;

	private readonly _onDidChangeTelemetryConfiguration = new Emitter<TelemetryConfiguration>();
	readonly onDidChangeTelemetryConfiguration: Event<TelemetryConfiguration> = this._onDidChangeTelemetryConfiguration.event;

	private _productConfig: { usage: boolean; error: boolean } = { usage: true, error: true };
	private _level: TelemetryLevel = TelemetryLevel.NONE;
	private _oldTelemetryEnablement: boolean | undefined;

	getTelemetryConfiguration(): boolean {
		return this._level === TelemetryLevel.USAGE;
	}

	getTelemetryDetails(): TelemetryConfiguration {
		return {
			isCrashEnabled: this._level >= TelemetryLevel.CRASH,
			isErrorsEnabled: this._productConfig.error ? this._level >= TelemetryLevel.ERROR : false,
			isUsageEnabled: this._productConfig.usage ? this._level >= TelemetryLevel.USAGE : false
		};
	}

	$initializeTelemetryLevel(level: TelemetryLevel, productConfig?: { usage: boolean; error: boolean }): void {
		this._level = level;
		this._productConfig = productConfig || { usage: true, error: true };
	}

	$onDidChangeTelemetryLevel(level: TelemetryLevel): void {
		this._oldTelemetryEnablement = this.getTelemetryConfiguration();
		this._level = level;
		if (this._oldTelemetryEnablement !== this.getTelemetryConfiguration()) {
			this._onDidChangeTelemetryEnabled.fire(this.getTelemetryConfiguration());
		}
		this._onDidChangeTelemetryConfiguration.fire(this.getTelemetryDetails());
	}
}

export const IExtHostTelemetry = createDecorator<IExtHostTelemetry>('IExtHostTelemetry');
export interface IExtHostTelemetry extends ExtHostTelemetry, ExtHostTelemetryShape { }
