/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostTelemetryShape } from 'vs/workbench/api/common/extHost.protocol';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { UIKind } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { getRemoteName } from 'vs/platform/remote/common/remoteHosts';
import { cleanData, cleanRemoteAuthority } from 'vs/platform/telemetry/common/telemetryUtils';
import { mixin } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';

export class ExtHostTelemetry implements ExtHostTelemetryShape {
	private readonly _onDidChangeTelemetryEnabled = new Emitter<boolean>();
	readonly onDidChangeTelemetryEnabled: Event<boolean> = this._onDidChangeTelemetryEnabled.event;

	private readonly _onDidChangeTelemetryConfiguration = new Emitter<vscode.TelemetryConfiguration>();
	readonly onDidChangeTelemetryConfiguration: Event<vscode.TelemetryConfiguration> = this._onDidChangeTelemetryConfiguration.event;

	private _productConfig: { usage: boolean; error: boolean } = { usage: true, error: true };
	private _level: TelemetryLevel = TelemetryLevel.NONE;
	private _oldTelemetryEnablement: boolean | undefined;
	private readonly _outputLogger: ILogger;
	private readonly _telemetryLoggers = new Map<string, ExtHostTelemetryLogger>();

	constructor(
		@IExtHostInitDataService private readonly initData: IExtHostInitDataService,
		@ILoggerService loggerService: ILoggerService,
	) {
		this._outputLogger = loggerService.createLogger(URI.revive(this.initData.environment.extensionTelemetryLogResource));
		this._outputLogger.info('Below are logs for extension telemetry events sent to the telemetry output channel API once the log level is set to trace.');
		this._outputLogger.info('===========================================================');
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
		const logger = new ExtHostTelemetryLogger(appender, extension, this._outputLogger, this.getBuiltInCommonProperties(extension), { isUsageEnabled: telemetryDetails.isUsageEnabled, isErrorsEnabled: telemetryDetails.isErrorsEnabled });
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
		commonProperties['common.isnewappinstall'] = isNewAppInstall(this.initData.telemetryInfo.firstSessionDate);
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

	onExtensionError(extension: ExtensionIdentifier, error: Error): boolean {
		const logger = this._telemetryLoggers.get(extension.value);
		if (!logger) {
			return false;
		}
		logger.logError(error);
		return true;
	}
}

export class ExtHostTelemetryLogger {
	private _appender: vscode.TelemetryAppender;
	private readonly _onDidChangeEnableStates = new Emitter<vscode.TelemetryLogger>();
	private _telemetryEnablements: { isUsageEnabled: boolean; isErrorsEnabled: boolean };
	private _apiObject: vscode.TelemetryLogger | undefined;
	constructor(
		appender: vscode.TelemetryAppender,
		private readonly _extension: IExtensionDescription,
		private readonly _logger: ILogger,
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

		data = cleanData(data, []);

		return data;
	}

	private logEvent(eventName: string, data?: Record<string, any>): void {
		eventName = this._extension.identifier.value + '/' + eventName;
		data = this.mixInCommonPropsAndCleanData(data || {});
		this._appender.logEvent(eventName, data);
		this._logger.trace(eventName, data);
	}

	logUsage(eventName: string, data?: Record<string, any>): void {
		if (!this._telemetryEnablements.isUsageEnabled) {
			return;
		}
		this.logEvent(eventName, data);
	}

	logError(eventNameOrException: Error | string, data?: Record<string, any>): void {
		if (!this._telemetryEnablements.isErrorsEnabled) {
			return;
		}
		if (typeof eventNameOrException === 'string') {
			this.logEvent(eventNameOrException, data);
		} else {
			// TODO @lramos15, implement cleaning for and logging for this case
			this._appender.logException(eventNameOrException, data);
		}
	}

	get apiTelemetryLogger(): vscode.TelemetryLogger {
		if (!this._apiObject) {
			const that = this;
			const obj: vscode.TelemetryLogger = {
				logUsage: that.logUsage.bind(that),
				get isUsageEnabled() {
					return that._telemetryEnablements.isUsageEnabled;
				},
				get isErrorsEnabled() {
					return that._telemetryEnablements.isErrorsEnabled;
				},
				logError: that.logError.bind(that),
				dispose: that.dispose.bind(that),
				onDidChangeEnableStates: that._onDidChangeEnableStates.event.bind(that)
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

export function isNewAppInstall(firstSessionDate: string): boolean {
	const installAge = Date.now() - new Date(firstSessionDate).getTime();
	return isNaN(installAge) ? false : installAge < 1000 * 60 * 60 * 24; // install age is less than a day
}

export const IExtHostTelemetry = createDecorator<IExtHostTelemetry>('IExtHostTelemetry');
export interface IExtHostTelemetry extends ExtHostTelemetry, ExtHostTelemetryShape { }
