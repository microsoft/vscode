/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TelemetrySender } from 'vscode';
import { redactPaths } from '../../../util/common/pathRedaction';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { IEnvService } from '../../env/common/envService';
import { FailingTelemetryReporter } from './failingTelemetryReporter';
import { IGHTelemetryService, ITelemetryUserConfig } from './telemetry';
import { TelemetryData } from './telemetryData';


// A container for the secure and insecure reporters
class TelemetryReporters {
	private reporter: TelemetrySender | undefined;
	private reporterSecure: TelemetrySender | undefined;

	public getReporter(telemetryUserConfig: ITelemetryUserConfig, isTest: boolean, secure: boolean): TelemetrySender | undefined {
		if (!secure) {
			return this.reporter;
		}
		// Callers should do this check themselves as they may need to behave differently
		// if we are not sending enhanced telemetry. The guard here is a backstop.
		// Note: if the decision about what telemetry to send when the user is opted-out
		// becomes more nuanced, we may need to drop this backstop.
		if (shouldSendEnhancedTelemetry(telemetryUserConfig)) {
			return this.reporterSecure;
		}
		if (isTest) {
			return new FailingTelemetryReporter();
		}
		return undefined;
	}
	public setReporter(reporter: TelemetrySender | undefined): void {
		this.reporter = reporter;
	}
	public setSecureReporter(reporter: TelemetrySender | undefined): void {
		this.reporterSecure = reporter;
	}
	async deactivate(): Promise<void> {
		// This will ensure all pending events get flushed
		let disposeReporter: Thenable<void> | void | undefined = Promise.resolve();
		if (this.reporter) {
			disposeReporter = this.reporter.flush ? this.reporter.flush() : undefined;
			this.reporter = undefined;
		}
		let disposeReporterSecure: Thenable<void> | void | undefined = Promise.resolve();
		if (this.reporterSecure) {
			disposeReporterSecure = this.reporterSecure.flush ? this.reporterSecure.flush() : undefined;
			this.reporterSecure = undefined;
		}
		await Promise.all([disposeReporter, disposeReporterSecure]);
	}
}

export class GHTelemetryService implements IGHTelemetryService {

	declare readonly _serviceBrand: undefined;

	private readonly reporters = new TelemetryReporters();
	private openPromises: Set<Promise<void>> | undefined = undefined;

	constructor(
		private readonly _isRunningTests: boolean,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IEnvService private readonly _envService: IEnvService,
		@ITelemetryUserConfig private readonly _telemetryUserConfig: ITelemetryUserConfig,
	) { }

	private withPromise(promise: Promise<void>): Promise<void> {
		if (this.openPromises) {
			this.openPromises.add(promise);
			return promise.then(_ => {
				this.openPromises?.delete(promise);
			});
		}
		return promise;
	}

	public async enablePromiseTracking(enable: boolean): Promise<void> {
		if (enable) {
			if (!this.openPromises) {
				this.openPromises = new Set();
			}
		} else {
			await this.awaitOpenPromises(undefined);
		}
	}

	public setSecureReporter(reporterSecure: TelemetrySender | undefined): void {
		this.reporters.setSecureReporter(reporterSecure);
	}
	public setReporter(reporter: TelemetrySender | undefined): void {
		this.reporters.setReporter(reporter);
	}

	public async sendTelemetry(name: string, telemetryData?: TelemetryData): Promise<void> {
		await this.withPromise(this._sendTelemetry(name, telemetryData, false));
	}

	public async sendErrorTelemetry(name: string, telemetryData?: TelemetryData) {
		await this.withPromise(this._sendErrorTelemetry(name, telemetryData, false));
	}

	public async sendEnhancedTelemetry(name: string, telemetryData?: TelemetryData): Promise<void> {
		await this.withPromise(this._sendTelemetry(name, telemetryData, true));
	}

	public async sendEnhancedErrorTelemetry(name: string, telemetryData?: TelemetryData) {
		await this.withPromise(this._sendErrorTelemetry(name, telemetryData, true));
	}

	public async sendExpProblemTelemetry(telemetryProperties: { reason: string }) {
		await this.withPromise(this._sendExpProblemTelemetry(telemetryProperties));
	}

	public async sendExceptionTelemetry(maybeError: unknown, origin: string) {
		await this.withPromise(this._sendExceptionTelemetry(maybeError, origin));
	}

	public async deactivate() {
		await this.awaitOpenPromises(new Set());
		await this.reporters.deactivate();
	}

	private async awaitOpenPromises(newValue: Set<Promise<void>> | undefined) {
		if (this.openPromises) {
			const openPromises = [...this.openPromises.values()];
			this.openPromises = newValue;
			await Promise.all(openPromises);
		}
	}

	private async _sendTelemetry(name: string, telemetryData: TelemetryData | undefined, secure: boolean) {
		if (secure && !shouldSendEnhancedTelemetry(this._telemetryUserConfig)) {
			return;
		}
		// if telemetry data isn't given, make a new one to hold at least the config
		const definedTelemetryData = telemetryData || TelemetryData.createAndMarkAsIssued({}, {});
		definedTelemetryData.makeReadyForSending(this._configService, this._envService, this._telemetryUserConfig);
		this.sendTelemetryEvent(secure ?? false, name, definedTelemetryData);
	}


	private async _sendExpProblemTelemetry(telemetryProperties: { reason: string }) {
		const name = 'expProblem';
		const definedTelemetryData = TelemetryData.createAndMarkAsIssued(telemetryProperties, {});
		definedTelemetryData.makeReadyForSending(this._configService, this._envService, this._telemetryUserConfig);
		this.sendTelemetryEvent(false /* not secure */, name, definedTelemetryData);
	}


	private async _sendExceptionTelemetry(
		maybeError: unknown,
		origin: string,
	) {
		const error = maybeError instanceof Error ? maybeError : new Error('Non-error thrown: ' + maybeError);

		const sendEnhanced = shouldSendEnhancedTelemetry(this._telemetryUserConfig);

		const definedTelemetryDataStub = TelemetryData.createAndMarkAsIssued({
			origin: redactPaths(origin),
			reason: sendEnhanced ? 'Exception logged to enhanced telemetry' : 'Exception, not logged due to opt-out',
		});

		definedTelemetryDataStub.makeReadyForSending(this._configService, this._envService, this._telemetryUserConfig);

		// send a placeholder to standard ("insecure") telemetry
		this.sendTelemetryEvent(false /* not secure */, 'exception', definedTelemetryDataStub);

		if (!sendEnhanced) { return; }

		const definedTelemetryDataSecure = TelemetryData.createAndMarkAsIssued({ origin });
		definedTelemetryDataSecure.makeReadyForSending(this._configService, this._envService, this._telemetryUserConfig);

		// and the real error, which might contain arbitrary data, to enhanced telemetry.
		// We have previously observed paths and other potential PII in
		//  - arbitrary unhandled exceptions coming from other extensions in the VSCode extension
		//  - fields inserted into the data sent by `sendTelemetryException` in `vscode-extension-telementry` like `Assembly`,
		this.sendTelemetryException(true /* secure */, error, definedTelemetryDataSecure);
	}



	private async _sendErrorTelemetry(name: string, telemetryData: TelemetryData | undefined, secure: boolean) {
		if (secure && !shouldSendEnhancedTelemetry(this._telemetryUserConfig)) {
			return;
		}
		const definedTelemetryData = telemetryData || TelemetryData.createAndMarkAsIssued({}, {});
		definedTelemetryData.makeReadyForSending(this._configService, this._envService, this._telemetryUserConfig);
		this.sendTelemetryErrorEvent(secure ?? false, name, definedTelemetryData);
	}


	// helpers

	private sendTelemetryEvent(
		secure: boolean,
		name: string,
		data: { properties: { [key: string]: string }; measurements: { [key: string]: number | undefined } }
	): void {
		const reporter = this.reporters.getReporter(this._telemetryUserConfig, this._isRunningTests, secure);
		if (reporter) {
			const props = TelemetryData.maybeRemoveRepoInfoFromPropertiesHack(secure, data.properties);
			reporter.sendEventData(
				name,
				{ ...props, ...data.measurements }
			);
		}
	}


	private sendTelemetryException(
		secure: true,
		error: Error,
		data: { properties: { [key: string]: string }; measurements: { [key: string]: number | undefined } }
	): void {
		const reporter = this.reporters.getReporter(this._telemetryUserConfig, this._isRunningTests, secure);
		if (reporter) {
			const props = TelemetryData.maybeRemoveRepoInfoFromPropertiesHack(secure, data.properties);
			reporter.sendErrorData(
				error,
				{ ...props, ...data.measurements }
			);
		}
	}

	private sendTelemetryErrorEvent(
		secure: boolean,
		name: string,
		data: { properties: { [key: string]: string }; measurements: { [key: string]: number | undefined } }
	): void {
		const reporter = this.reporters.getReporter(this._telemetryUserConfig, this._isRunningTests, secure);
		if (reporter) {
			const props = TelemetryData.maybeRemoveRepoInfoFromPropertiesHack(secure, data.properties);
			reporter.sendEventData(
				name,
				{ ...props, ...data.measurements }
			);
		}
	}
}

function shouldSendEnhancedTelemetry(telemetryUserConfig: ITelemetryUserConfig): boolean {
	return telemetryUserConfig.optedIn;
}
