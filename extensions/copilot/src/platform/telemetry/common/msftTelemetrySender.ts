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
	private _externalTelemetryReporter: ITelemetryReporter;

	protected readonly _disposables: DisposableStore = new DisposableStore();
	private _sku: string | undefined;
	private _tid: string | undefined;
	private _isInternal: boolean = false;

	constructor(
		copilotTokenStore: ICopilotTokenStore,
		createTelemetryReporter: (internal: boolean) => ITelemetryReporter
	) {
		this._externalTelemetryReporter = createTelemetryReporter(false);
		this.processToken(copilotTokenStore.copilotToken);
		this._disposables.add(copilotTokenStore.onDidStoreUpdate(() => this.processToken(copilotTokenStore.copilotToken)));
	}

	/**
	 * Internal Microsoft telemetry is disabled. Keep the entry point so callers
	 * cannot accidentally route restricted content through standard telemetry.
	 */
	sendInternalTelemetryEvent(_eventName: string, _properties?: TelemetryEventProperties, _measurements?: TelemetryEventMeasurements): void { }

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
	}

	private processToken(token: CopilotToken | undefined) {
		// Only update tid if we have a new valid value - preserve last known tid for error telemetry where token may be undefined
		const newTid = token?.getTokenValue('tid');
		if (newTid) {
			this._tid = newTid;
		}
		this._sku = token?.sku;
		this._isInternal = !!token?.isInternal;
	}
}
