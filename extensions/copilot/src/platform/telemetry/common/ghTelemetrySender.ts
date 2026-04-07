/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TelemetryLogger } from 'vscode';
import { redactPaths } from '../../../util/common/pathRedaction';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { Mutable } from '../../../util/vs/base/common/types';
import { CopilotToken } from '../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { IDomainService } from '../../endpoint/common/domainService';
import { IEnvService } from '../../env/common/envService';
import { ITelemetrySender, ITelemetryUserConfig, TelemetryEventMeasurements, TelemetryEventProperties, TelemetryTrustedValue } from '../common/telemetry';
import { TelemetryData, eventPropertiesToSimpleObject } from '../common/telemetryData';


export class BaseGHTelemetrySender implements ITelemetrySender {
	protected _disposables: DisposableStore = new DisposableStore();
	private _standardTelemetryLogger: TelemetryLogger;
	private _enhancedTelemetryLogger?: TelemetryLogger;

	constructor(
		private readonly _tokenStore: ICopilotTokenStore,
		protected readonly _createTelemetryLogger: (enhanced: boolean) => TelemetryLogger,
		private readonly _configService: IConfigurationService,
		private readonly _telemetryConfig: ITelemetryUserConfig,
		protected readonly _envService: IEnvService,
		protected readonly _domainService: IDomainService,

	) {
		this._processToken(this._tokenStore.copilotToken);
		this._standardTelemetryLogger = this._createTelemetryLogger(false);
		this._disposables.add(this._tokenStore.onDidStoreUpdate(() => {
			const token = this._tokenStore.copilotToken;
			this._processToken(token);
		}));
		// Rebuild the loggers when the domains change as they need to send to new endpoints
		this._disposables.add(this._domainService.onDidChangeDomains(() => {
			this._standardTelemetryLogger.dispose();
			this._standardTelemetryLogger = this._createTelemetryLogger(false);
			if (this._enhancedTelemetryLogger) {
				this._enhancedTelemetryLogger.dispose();
				this._enhancedTelemetryLogger = this._createTelemetryLogger(true);
			}
		}));
	}

	private _processToken(token: CopilotToken | undefined) {
		if (!token) {
			if (this._enhancedTelemetryLogger) {
				this._enhancedTelemetryLogger.dispose();
				this._enhancedTelemetryLogger = undefined;
			}
		}
		if (token?.getTokenValue('rt') === '1') {
			this._enhancedTelemetryLogger = this._createTelemetryLogger(true);
		} else {
			if (this._enhancedTelemetryLogger) {
				this._enhancedTelemetryLogger.dispose();
			}
			this._enhancedTelemetryLogger = undefined;
		}
	}

	sendTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this._standardTelemetryLogger.logUsage(eventName, this.markAsIssuedAndMakeReadyForSending(properties, measurements));
	}
	sendTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this._standardTelemetryLogger.logError(eventName, this.markAsIssuedAndMakeReadyForSending(properties, measurements));
	}

	sendEnhancedTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		if (this._enhancedTelemetryLogger) {
			this._enhancedTelemetryLogger?.logUsage(eventName, this.markAsIssuedAndMakeReadyForSending(properties, measurements));
		}
	}

	sendEnhancedTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		if (this._enhancedTelemetryLogger) {
			this._enhancedTelemetryLogger?.logError(eventName, this.markAsIssuedAndMakeReadyForSending(properties, measurements));
		}
	}

	sendExceptionTelemetry(maybeError: unknown, origin: string) {
		const error = maybeError instanceof Error ? maybeError : new Error('Non-error thrown: ' + maybeError);


		const definedTelemetryDataStub = TelemetryData.createAndMarkAsIssued({
			origin: redactPaths(origin),
			reason: this._enhancedTelemetryLogger ? 'Exception logged to enhanced telemetry' : 'Exception, not logged due to opt-out',
		});

		definedTelemetryDataStub.makeReadyForSending(this._configService, this._envService, this._telemetryConfig);

		// send a placeholder to standard ("insecure") telemetry
		this.sendTelemetryEvent('exception', definedTelemetryDataStub.properties, definedTelemetryDataStub.measurements);

		if (!this._enhancedTelemetryLogger) {
			return;
		}


		const definedTelemetryDataSecure = TelemetryData.createAndMarkAsIssued({ origin });
		definedTelemetryDataSecure.makeReadyForSending(this._configService, this._envService, this._telemetryConfig);

		// and the real error, which might contain arbitrary data, to enhanced telemetry.
		this._enhancedTelemetryLogger.logError(error, definedTelemetryDataSecure);
	}

	private markAsIssuedAndMakeReadyForSending(properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): { properties: TelemetryEventProperties; measurements: TelemetryEventMeasurements } {
		const telemetryData = TelemetryData.createAndMarkAsIssued(eventPropertiesToSimpleObject(properties), measurements);
		telemetryData.makeReadyForSending(this._configService, this._envService, this._telemetryConfig);
		const newPropeties: Mutable<TelemetryEventProperties> = {};
		// This disables VS Code's default sanitization
		for (const key in telemetryData.properties) {
			newPropeties[key] = new TelemetryTrustedValue(telemetryData.properties[key]);
		}

		return {
			properties: newPropeties,
			measurements: telemetryData.measurements
		};
	}


	dispose(): void {
		this._standardTelemetryLogger.dispose();
		this._disposables.dispose();
		if (this._enhancedTelemetryLogger) {
			this._enhancedTelemetryLogger.dispose();
		}
	}

}
