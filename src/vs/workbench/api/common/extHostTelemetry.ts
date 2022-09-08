/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostTelemetryShape, MainThreadTelemetryShape, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export class ExtHostTelemetry implements ExtHostTelemetryShape {
	private readonly _onDidChangeTelemetryEnabled = new Emitter<boolean>();
	readonly onDidChangeTelemetryEnabled: Event<boolean> = this._onDidChangeTelemetryEnabled.event;

	private readonly _onDidChangeTelemetryConfiguration = new Emitter<vscode.TelemetryConfiguration>();
	readonly onDidChangeTelemetryConfiguration: Event<vscode.TelemetryConfiguration> = this._onDidChangeTelemetryConfiguration.event;

	private _productConfig: { usage: boolean; error: boolean } = { usage: true, error: true };
	private _level: TelemetryLevel = TelemetryLevel.NONE;
	private _oldTelemetryEnablement: boolean | undefined;
	private readonly _telemetryLoggers = new Map<string, ExtHostTelemetryLogger>();
	private readonly _mainThreadTelemetryProxy: MainThreadTelemetryShape;

	constructor(@IExtHostRpcService rpc: IExtHostRpcService) {
		this._mainThreadTelemetryProxy = rpc.getProxy(MainContext.MainThreadTelemetry);
	}

	getTelemetryConfiguration(): boolean {
		return this._level === TelemetryLevel.USAGE;
	}

	getTelemetryDetails(): vscode.TelemetryConfiguration {
		return {
			isCrashEnabled: this._level >= TelemetryLevel.CRASH,
			isErrorsEnabled: this._productConfig.error ? this._level >= TelemetryLevel.ERROR : false,
			isUsageEnabled: this._productConfig.usage ? this._level >= TelemetryLevel.USAGE : false
		};
	}

	instantiateLogger(extensionId: string, appender: vscode.TelemetryAppender) {
		const logger = new ExtHostTelemetryLogger(appender);
		this._telemetryLoggers.set(extensionId, logger);
		return logger.apiTelemetryLogger;
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

export class ExtHostTelemetryLogger {
	private _appender: vscode.TelemetryAppender;
	private readonly _onDidChangeEnableStates = new Emitter<vscode.TelemetryLogger>();
	private _apiObject: vscode.TelemetryLogger | undefined;
	constructor(appender: vscode.TelemetryAppender) {
		this._appender = appender;
	}


	logUsage(eventName: string, data?: Record<string, string | number | boolean>): void {
		this._appender.logEvent(eventName, data);
	}

	logException(exception: Error, data?: Record<string, string | number | boolean>): void {
		this._appender.logException(exception, data);
	}

	get apiTelemetryLogger(): vscode.TelemetryLogger {
		if (!this._apiObject) {
			const that = this;
			const obj: vscode.TelemetryLogger = {
				logUsage: that.logUsage,
				isErrorsEnabled: true,
				isUsageEnabled: true,
				logError: that.logUsage,
				dispose: that.dispose,
				logException: that.logException,
				onDidChangeEnableStates: that._onDidChangeEnableStates.event
			};
			this._apiObject = Object.freeze(obj);
		}
		return this._apiObject;
	}

	dispose(): void {
		if (this._appender?.flush) {
			this._appender.flush();
		}
	}
}

export const IExtHostTelemetry = createDecorator<IExtHostTelemetry>('IExtHostTelemetry');
export interface IExtHostTelemetry extends ExtHostTelemetry, ExtHostTelemetryShape { }
