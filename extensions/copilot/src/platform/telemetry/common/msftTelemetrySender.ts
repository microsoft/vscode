/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { CopilotToken } from '../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { IMSFTTelemetrySender, ITelemetrySender, TelemetryEventMeasurements, TelemetryEventProperties } from './telemetry';

// This type aims to mirror the `TelemetryReporter` exposed by `@vscode/extension-telemetry`
// It has a few more methods than just the base sender
export interface ITelemetryReporter extends ITelemetrySender {
	sendRawTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
}

export class BaseMsftTelemetrySender implements IMSFTTelemetrySender {
	// Telemetry reporter used for collecting telemetry on internal Microsoft customers
	protected _internalTelemetryReporter: ITelemetryReporter | undefined;
	protected _internalLargeEventTelemetryReporter: ITelemetryReporter | undefined;
	private _externalTelemetryReporter: ITelemetryReporter;

	protected _disposables: DisposableStore = new DisposableStore();
	private _username: string | undefined;
	private _vscodeTeamMember: boolean = false;
	private _sku: string | undefined;
	private _tid: string | undefined;
	private _isInternal: boolean = false;

	constructor(
		copilotTokenStore: ICopilotTokenStore,
		private readonly _createTelemetryReporter: (internal: boolean, largeEvents: boolean) => ITelemetryReporter
	) {
		this._externalTelemetryReporter = this._createTelemetryReporter(false, false);
		this.processToken(copilotTokenStore.copilotToken);
		this._disposables.add(copilotTokenStore.onDidStoreUpdate(() => this.processToken(copilotTokenStore.copilotToken)));
	}

	/**
	 * **NOTE**: Do not call directly
	 * This is just used by the experimentation service to log events to the scorecards
	 * @param eventName
	 * @param props
	 */
	postEvent(eventName: string, props: Map<string, string>): void {
		const event: Record<string, string> = {};
		for (const [key, value] of props) {
			event[key] = value;
		}
		if (this._isInternal) {
			this.sendInternalTelemetryEvent(eventName, event);
		}
		this.sendTelemetryEvent(eventName, event);
	}

	/**
	 * Sends a telemetry event regarding internal Microsoft staff only. Will be dropped if telemetry level is below Usage
	 * @param eventName The name of the event to send
	 * @param properties The properties to send
	 * @param measurements The measurements (numerical values)
	 * @returns
	 */
	sendInternalTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		if (!this._internalTelemetryReporter) {
			return;
		}
		properties = { ...properties, 'common.tid': this._tid, 'common.userName': this._username ?? 'undefined' };
		measurements = { ...measurements, 'common.isVscodeTeamMember': this._vscodeTeamMember ? 1 : 0 };
		this._internalTelemetryReporter.sendRawTelemetryEvent(eventName, properties, measurements);
		if (this._internalLargeEventTelemetryReporter) { // Also duplicate events to the large data store for testing of the pipeline
			this._internalLargeEventTelemetryReporter.sendRawTelemetryEvent(eventName, properties, measurements);
		}
	}

	/**
	 * Sends a telemetry event regarding external customers. Will be dropped if telemetry level is below Usage
	 * @param eventName The name of the event to send
	 * @param properties The properties to send
	 * @param measurements The measurements (numerical values)
	 */
	sendTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		// __GDPR__COMMON__ "common.tid" : { "endPoint": "GoogleAnalyticsId", "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight" }
		// __GDPR__COMMON__ "common.sku" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		// __GDPR__COMMON__ "common.internal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		properties = { ...properties, 'common.tid': this._tid ?? '', 'common.sku': this._sku ?? 'undefined' };
		if (this._isInternal) {
			measurements = { ...measurements, 'common.internal': 1 };
		}
		this._externalTelemetryReporter.sendTelemetryEvent(eventName, properties, measurements);
	}

	/**
	 * Sends an error event as telemetry. Will be dropped if telemetry level is below Error
	 * @param eventName The name of the event to send
	 * @param properties The properties to send
	 * @param measurements The measurements (numerical values)
	 */
	sendTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		// __GDPR__COMMON__ "common.tid" : { "endPoint": "GoogleAnalyticsID", "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight" }
		// __GDPR__COMMON__ "common.sku" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		// __GDPR__COMMON__ "common.internal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		properties = { ...properties, 'common.tid': this._tid ?? '', 'common.sku': this._sku ?? 'undefined' };
		if (this._isInternal) {
			measurements = { ...measurements, 'common.internal': 1 };
		}
		this._externalTelemetryReporter.sendTelemetryErrorEvent(eventName, properties, measurements);
	}

	dispose(): void {
		this._externalTelemetryReporter.dispose();
		this._internalTelemetryReporter?.dispose();
	}

	private processToken(token: CopilotToken | undefined) {
		this._username = token?.username;
		this._vscodeTeamMember = !!token?.isVscodeTeamMember;
		// Only update tid if we have a new valid value - preserve last known tid for error telemetry where token may be undefined
		const newTid = token?.getTokenValue('tid');
		if (newTid) {
			this._tid = newTid;
		}
		this._sku = token?.sku;
		this._isInternal = !!token?.isInternal;

		if (this._isInternal) {
			this._internalTelemetryReporter ??= this._createTelemetryReporter(true, false);
			this._internalLargeEventTelemetryReporter ??= this._createTelemetryReporter(true, true);
		}

		if (!token || !this._isInternal) {
			this._internalTelemetryReporter?.dispose();
			this._internalTelemetryReporter = undefined;
			this._internalLargeEventTelemetryReporter?.dispose();
			this._internalLargeEventTelemetryReporter = undefined;
			return;
		}
	}
}
