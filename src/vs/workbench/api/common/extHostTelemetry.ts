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
import { ILoggerService } from 'vs/platform/log/common/log';
import { IExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { UIKind } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { getRemoteName } from 'vs/platform/remote/common/remoteHosts';
import { cleanRemoteAuthority } from 'vs/platform/telemetry/common/telemetryUtils';
import { mixin } from 'vs/base/common/objects';

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

	constructor(
		@IExtHostRpcService rpc: IExtHostRpcService,
		@IExtHostFileSystemInfo extHostFileSystemInfo: IExtHostFileSystemInfo,
		@IExtHostInitDataService private readonly initData: IExtHostInitDataService,
		@ILoggerService loggerService: ILoggerService,
	) {
		//const log = loggerService.createLogger(file, { always: true, donotRotate: true, donotUseFormatters: true });
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

	instantiateLogger(extension: IExtensionDescription, appender: vscode.TelemetryAppender) {
		const telemetryDetails = this.getTelemetryDetails();
		const logger = new ExtHostTelemetryLogger(appender, this.getBuiltInCommonProperties(extension), { isUsageEnabled: telemetryDetails.isUsageEnabled, isErrorsEnabled: telemetryDetails.isErrorsEnabled });
		this._telemetryLoggers.set(extension.identifier.value, logger);
		return logger.apiTelemetryLogger;
	}

	$initializeTelemetryLevel(level: TelemetryLevel, productConfig?: { usage: boolean; error: boolean }): void {
		this._level = level;
		this._productConfig = productConfig || { usage: true, error: true };
	}

	getBuiltInCommonProperties(extension: IExtensionDescription): Record<string, string | boolean | number | undefined> {
		const commonProperties: Record<string, string | boolean | number | undefined> = {};
		// TODO @lramos15, does os info like node arch, platform version, etc exist here.
		// Or will first party extensions just mix this in
		commonProperties['common.extname'] = extension.name;
		commonProperties['common.extversion'] = extension.version;
		commonProperties['common.vscodemachineid'] = this.initData.telemetryInfo.machineId;
		commonProperties['common.vscodesessionid'] = this.initData.telemetryInfo.sessionId;
		commonProperties['common.vscodeversion'] = this.initData.version;
		//commonProperties['common.isnewappinstall'] = this.initData.isNewAppInstall ? this.vscodeAPI.env.isNewAppInstall.toString() : "false";
		commonProperties['common.product'] = this.initData.environment.appHost;

		switch (this.initData.uiKind) {
			case UIKind.Web:
				commonProperties['common.uikind'] = 'web';
				break;
			case UIKind.Desktop:
				commonProperties['common.uikind'] = 'desktop';
				break;
			default:
				commonProperties['common.uikind'] = 'unknown';
		}

		commonProperties['common.remotename'] = getRemoteName(cleanRemoteAuthority(this.initData.remote.authority));

		return commonProperties;
	}

	$onDidChangeTelemetryLevel(level: TelemetryLevel): void {
		this._oldTelemetryEnablement = this.getTelemetryConfiguration();
		this._level = level;
		const telemetryDetails = this.getTelemetryDetails();

		// Loop through all loggers and update their level
		this._telemetryLoggers.forEach(logger => {
			logger.updateTelemetryEnablements(telemetryDetails.isUsageEnabled, telemetryDetails.isErrorsEnabled);
		});

		if (this._oldTelemetryEnablement !== this.getTelemetryConfiguration()) {
			this._onDidChangeTelemetryEnabled.fire(this.getTelemetryConfiguration());
		}
		this._onDidChangeTelemetryConfiguration.fire(this.getTelemetryDetails());
	}
}

export class ExtHostTelemetryOuptutChannel {

}

export class ExtHostTelemetryLogger {
	private _appender: vscode.TelemetryAppender;
	private readonly _onDidChangeEnableStates = new Emitter<vscode.TelemetryLogger>();
	private _telemetryEnablements: { isUsageEnabled: boolean; isErrorsEnabled: boolean };
	private _apiObject: vscode.TelemetryLogger | undefined;
	constructor(
		appender: vscode.TelemetryAppender,
		private readonly _commonProperties: Record<string, any>,
		telemetryEnablements: { isUsageEnabled: boolean; isErrorsEnabled: boolean }) {
		this._appender = appender;
		this._telemetryEnablements = { isUsageEnabled: telemetryEnablements.isUsageEnabled, isErrorsEnabled: telemetryEnablements.isErrorsEnabled };
	}

	updateTelemetryEnablements(isUsageEnabled: boolean, isErrorsEnabled: boolean): void {
		if (this._apiObject) {
			this._telemetryEnablements = { isUsageEnabled, isErrorsEnabled };
			this._onDidChangeEnableStates.fire(this._apiObject);
		}
	}

	mixInCommonPropsAndCleanData(data: Record<string, any>): Record<string, any> {
		if (!this._appender.ignoreBuiltInCommonProperties) {
			data = mixin(data, this._commonProperties);
		}
		if (this._appender.additionalCommonProperties) {
			data = mixin(data, this._appender.additionalCommonProperties);
		}

		return data;
	}

	logUsage(eventName: string, data?: Record<string, any>): void {
		if (!this._telemetryEnablements.isUsageEnabled) {
			return;
		}
		this._appender.logEvent(eventName, data);
	}

	logError(eventNameOrException: Error | string, data?: Record<string, any>): void {
		if (!this._telemetryEnablements.isErrorsEnabled) {
			return;
		}
		if (typeof eventNameOrException === 'string') {
			this._appender.logEvent(eventNameOrException, data);
		} else {
			this._appender.logException(eventNameOrException, data);
		}
	}

	get apiTelemetryLogger(): vscode.TelemetryLogger {
		if (!this._apiObject) {
			const that = this;
			const obj: vscode.TelemetryLogger = {
				logUsage: that.logUsage,
				get isUsageEnabled() {
					return that._telemetryEnablements.isUsageEnabled;
				},
				get isErrorsEnabled() {
					return that._telemetryEnablements.isErrorsEnabled;
				},
				logError: that.logError,
				dispose: that.dispose,
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
