/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { Event, Emitter } from '../../../base/common/event.js';
import { ExtHostTelemetryShape } from './extHost.protocol.js';
import { ICommonProperties, TelemetryLevel } from '../../../platform/telemetry/common/telemetry.js';
import { ILogger, ILoggerService } from '../../../platform/log/common/log.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { UIKind } from '../../services/extensions/common/extensionHostProtocol.js';
import { getRemoteName } from '../../../platform/remote/common/remoteHosts.js';
import { cleanData, cleanRemoteAuthority, TelemetryLogGroup } from '../../../platform/telemetry/common/telemetryUtils.js';
import { mixin } from '../../../base/common/objects.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';

export class ExtHostTelemetry extends Disposable implements ExtHostTelemetryShape {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeTelemetryEnabled = this._register(new Emitter<boolean>());
	readonly onDidChangeTelemetryEnabled: Event<boolean> = this._onDidChangeTelemetryEnabled.event;

	private readonly _onDidChangeTelemetryConfiguration = this._register(new Emitter<vscode.TelemetryConfiguration>());
	readonly onDidChangeTelemetryConfiguration: Event<vscode.TelemetryConfiguration> = this._onDidChangeTelemetryConfiguration.event;

	private _productConfig: { usage: boolean; error: boolean } = { usage: true, error: true };
	private _level: TelemetryLevel = TelemetryLevel.NONE;
	private _oldTelemetryEnablement: boolean | undefined;
	private readonly _inLoggingOnlyMode: boolean = false;
	private readonly _outputLogger: ILogger;
	private readonly _telemetryLoggers = new Map<string, ExtHostTelemetryLogger[]>();

	constructor(
		isWorker: boolean,
		@IExtHostInitDataService private readonly initData: IExtHostInitDataService,
		@ILoggerService loggerService: ILoggerService,
	) {
		super();
		this._inLoggingOnlyMode = this.initData.environment.isExtensionTelemetryLoggingOnly;
		const id = initData.remote.isRemote ? 'remoteExtHostTelemetry' : isWorker ? 'workerExtHostTelemetry' : 'extHostTelemetry';
		this._outputLogger = this._register(loggerService.createLogger(id,
			{
				name: localize('extensionTelemetryLog', "Extension Telemetry{0}", this._inLoggingOnlyMode ? ' (Not Sent)' : ''),
				hidden: true,
				group: TelemetryLogGroup,
			}));
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

	instantiateLogger(extension: IExtensionDescription, sender: vscode.TelemetrySender, options?: vscode.TelemetryLoggerOptions) {
		const telemetryDetails = this.getTelemetryDetails();
		const logger = new ExtHostTelemetryLogger(
			sender,
			options,
			extension,
			this._outputLogger,
			this._inLoggingOnlyMode,
			this.getBuiltInCommonProperties(extension),
			{ isUsageEnabled: telemetryDetails.isUsageEnabled, isErrorsEnabled: telemetryDetails.isErrorsEnabled }
		);
		const loggers = this._telemetryLoggers.get(extension.identifier.value) ?? [];
		this._telemetryLoggers.set(extension.identifier.value, [...loggers, logger]);
		return logger.apiTelemetryLogger;
	}

	$initializeTelemetryLevel(level: TelemetryLevel, supportsTelemetry: boolean, productConfig?: { usage: boolean; error: boolean }): void {
		this._level = level;
		this._productConfig = productConfig ?? { usage: true, error: true };
	}

	getBuiltInCommonProperties(extension: IExtensionDescription): ICommonProperties {
		const commonProperties: ICommonProperties = Object.create(null);
		// TODO @lramos15, does os info like node arch, platform version, etc exist here.
		// Or will first party extensions just mix this in
		commonProperties['common.extname'] = `${extension.publisher}.${extension.name}`;
		commonProperties['common.extversion'] = extension.version;
		commonProperties['common.vscodemachineid'] = this.initData.telemetryInfo.machineId;
		commonProperties['common.vscodesessionid'] = this.initData.telemetryInfo.sessionId;
		commonProperties['common.vscodecommithash'] = this.initData.commit;
		commonProperties['common.sqmid'] = this.initData.telemetryInfo.sqmId;
		commonProperties['common.devDeviceId'] = this.initData.telemetryInfo.devDeviceId ?? this.initData.telemetryInfo.machineId;
		commonProperties['common.vscodeversion'] = this.initData.version;
		commonProperties['common.vscodereleasedate'] = this.initData.date;
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
		// Remove all disposed loggers
		this._telemetryLoggers.forEach((loggers, key) => {
			const newLoggers = loggers.filter(l => !l.isDisposed);
			if (newLoggers.length === 0) {
				this._telemetryLoggers.delete(key);
			} else {
				this._telemetryLoggers.set(key, newLoggers);
			}
		});
		// Loop through all loggers and update their level
		this._telemetryLoggers.forEach(loggers => {
			for (const logger of loggers) {
				logger.updateTelemetryEnablements(telemetryDetails.isUsageEnabled, telemetryDetails.isErrorsEnabled);
			}
		});

		if (this._oldTelemetryEnablement !== this.getTelemetryConfiguration()) {
			this._onDidChangeTelemetryEnabled.fire(this.getTelemetryConfiguration());
		}
		this._onDidChangeTelemetryConfiguration.fire(this.getTelemetryDetails());
	}

	onExtensionError(extension: ExtensionIdentifier, error: Error): boolean {
		const loggers = this._telemetryLoggers.get(extension.value);
		const nonDisposedLoggers = loggers?.filter(l => !l.isDisposed);
		if (!nonDisposedLoggers) {
			this._telemetryLoggers.delete(extension.value);
			return false;
		}
		let errorEmitted = false;
		for (const logger of nonDisposedLoggers) {
			if (logger.ignoreUnhandledExtHostErrors) {
				continue;
			}
			logger.logError(error);
			errorEmitted = true;
		}
		return errorEmitted;
	}
}

export class ExtHostTelemetryLogger {

	static validateSender(sender: vscode.TelemetrySender): void {
		if (typeof sender !== 'object') {
			throw new TypeError('TelemetrySender argument is invalid');
		}
		if (typeof sender.sendEventData !== 'function') {
			throw new TypeError('TelemetrySender.sendEventData must be a function');
		}
		if (typeof sender.sendErrorData !== 'function') {
			throw new TypeError('TelemetrySender.sendErrorData must be a function');
		}
		if (typeof sender.flush !== 'undefined' && typeof sender.flush !== 'function') {
			throw new TypeError('TelemetrySender.flush must be a function or undefined');
		}
	}

	private readonly _onDidChangeEnableStates = new Emitter<vscode.TelemetryLogger>();
	private readonly _ignoreBuiltinCommonProperties: boolean;
	private readonly _additionalCommonProperties: Record<string, any> | undefined;
	public readonly ignoreUnhandledExtHostErrors: boolean;

	private _telemetryEnablements: { isUsageEnabled: boolean; isErrorsEnabled: boolean };
	private _apiObject: vscode.TelemetryLogger | undefined;
	private _sender: vscode.TelemetrySender | undefined;

	constructor(
		sender: vscode.TelemetrySender,
		options: vscode.TelemetryLoggerOptions | undefined,
		private readonly _extension: IExtensionDescription,
		private readonly _logger: ILogger,
		private readonly _inLoggingOnlyMode: boolean,
		private readonly _commonProperties: Record<string, any>,
		telemetryEnablements: { isUsageEnabled: boolean; isErrorsEnabled: boolean }
	) {
		this.ignoreUnhandledExtHostErrors = options?.ignoreUnhandledErrors ?? false;
		this._ignoreBuiltinCommonProperties = options?.ignoreBuiltInCommonProperties ?? false;
		this._additionalCommonProperties = options?.additionalCommonProperties;
		this._sender = sender;
		this._telemetryEnablements = { isUsageEnabled: telemetryEnablements.isUsageEnabled, isErrorsEnabled: telemetryEnablements.isErrorsEnabled };
	}

	updateTelemetryEnablements(isUsageEnabled: boolean, isErrorsEnabled: boolean): void {
		if (this._apiObject) {
			this._telemetryEnablements = { isUsageEnabled, isErrorsEnabled };
			this._onDidChangeEnableStates.fire(this._apiObject);
		}
	}

	mixInCommonPropsAndCleanData(data: Record<string, any>): Record<string, any> {
		// Some telemetry modules prefer to break properties and measurmements up
		// We mix common properties into the properties tab.
		let updatedData = 'properties' in data ? (data.properties ?? {}) : data;

		// We don't clean measurements since they are just numbers
		updatedData = cleanData(updatedData, []);

		if (this._additionalCommonProperties) {
			updatedData = mixin(updatedData, this._additionalCommonProperties);
		}

		if (!this._ignoreBuiltinCommonProperties) {
			updatedData = mixin(updatedData, this._commonProperties);
		}

		if ('properties' in data) {
			data.properties = updatedData;
		} else {
			data = updatedData;
		}

		return data;
	}

	private logEvent(eventName: string, data?: Record<string, any>): void {
		// No sender means likely disposed of, we should no-op
		if (!this._sender) {
			return;
		}
		// If it's a built-in extension (vscode publisher) we don't prefix the publisher and only the ext name
		if (this._extension.publisher === 'vscode') {
			eventName = this._extension.name + '/' + eventName;
		} else {
			eventName = this._extension.identifier.value + '/' + eventName;
		}
		data = this.mixInCommonPropsAndCleanData(data || {});
		if (!this._inLoggingOnlyMode) {
			this._sender?.sendEventData(eventName, data);
		}
		this._logger.trace(eventName, data);
	}

	logUsage(eventName: string, data?: Record<string, any>): void {
		if (!this._telemetryEnablements.isUsageEnabled) {
			return;
		}
		this.logEvent(eventName, data);
	}

	logError(eventNameOrException: Error | string, data?: Record<string, any>): void {
		if (!this._telemetryEnablements.isErrorsEnabled || !this._sender) {
			return;
		}
		if (typeof eventNameOrException === 'string') {
			this.logEvent(eventNameOrException, data);
		} else {
			const errorData = {
				name: eventNameOrException.name,
				message: eventNameOrException.message,
				stack: eventNameOrException.stack,
				cause: eventNameOrException.cause
			};
			const cleanedErrorData = cleanData(errorData, []);
			// Reconstruct the error object with the cleaned data
			const cleanedError = new Error(cleanedErrorData.message, {
				cause: cleanedErrorData.cause
			});
			cleanedError.stack = cleanedErrorData.stack;
			cleanedError.name = cleanedErrorData.name;
			data = this.mixInCommonPropsAndCleanData(data || {});
			if (!this._inLoggingOnlyMode) {
				this._sender.sendErrorData(cleanedError, data);
			}
			this._logger.trace('exception', data);
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

	get isDisposed(): boolean {
		return !this._sender;
	}

	dispose(): void {
		if (this._sender?.flush) {
			let tempSender: vscode.TelemetrySender | undefined = this._sender;
			this._sender = undefined;
			Promise.resolve(tempSender.flush!()).then(tempSender = undefined);
			this._apiObject = undefined;
		} else {
			this._sender = undefined;
		}
	}
}

export function isNewAppInstall(firstSessionDate: string): boolean {
	const installAge = Date.now() - new Date(firstSessionDate).getTime();
	return isNaN(installAge) ? false : installAge < 1000 * 60 * 60 * 24; // install age is less than a day
}

export const IExtHostTelemetry = createDecorator<IExtHostTelemetry>('IExtHostTelemetry');
export interface IExtHostTelemetry extends ExtHostTelemetry, ExtHostTelemetryShape { }
