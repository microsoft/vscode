/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostTelemetryShape } from 'vs/workbench/api/common/extHost.protocol';

export class ExtHostTelemetry implements ExtHostTelemetryShape {
	private readonly _onDidChangeTelemetryEnabled = new Emitter<boolean>();
	readonly onDidChangeTelemetryEnabled: Event<boolean> = this._onDidChangeTelemetryEnabled.event;

	private _enabled: boolean = false;

	getTelemetryEnabled(): boolean {
		return this._enabled;
	}

	$initializeTelemetryEnabled(enabled: boolean): void {
		this._enabled = enabled;
	}

	$onDidChangeTelemetryEnabled(enabled: boolean): void {
		this._enabled = enabled;
		this._onDidChangeTelemetryEnabled.fire(enabled);
	}
}

export const IExtHostTelemetry = createDecorator<IExtHostTelemetry>('IExtHostTelemetry');
export interface IExtHostTelemetry extends ExtHostTelemetry, ExtHostTelemetryShape { }
