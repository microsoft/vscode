/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'monaco-editor';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { BaseGHTelemetrySender } from './ghTelemetrySender';
import { BaseMsftTelemetrySender } from './msftTelemetrySender';
import { ITelemetryService, TelemetryDestination, TelemetryEventMeasurements, TelemetryEventProperties } from './telemetry';

export class BaseTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	// Properties that are applied to all telemetry events (currently only used by the exp service
	// TODO @lramos15 extend further to include more
	private _sharedProperties: Record<string, string> = {};
	private _originalExpAssignments: string | undefined;
	private _additionalExpAssignments: string[] = [];
	private _disposables: IDisposable[] = [];
	constructor(
		protected readonly _tokenStore: ICopilotTokenStore,
		private readonly _capiClientService: ICAPIClientService,
		protected readonly _microsoftTelemetrySender: BaseMsftTelemetrySender,
		protected readonly _ghTelemetrySender: BaseGHTelemetrySender,
	) {
		this._disposables.push(this._microsoftTelemetrySender, this._ghTelemetrySender);
		this._disposables.push(_tokenStore.onDidStoreUpdate(() => {
			const token = _tokenStore.copilotToken;
			if (!token) {
				return;
			}
			/* __GDPR__
				"token" : {
					"owner": "digitarald",
					"comment": "Copilot token received from the service.",
					"snippyEnabled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "If the block setting for public suggestions is enabled." },
					"telemetryEnabled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "If the subscription has telemetry enabled." },
					"mcpEnabled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "If the token has MCP features enabled." },
					"previewEnabled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "If the token has editor preview features enabled." },
					"reviewEnabled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "If the token has Copilot code review features enabled." }
				}
			*/
			this.sendMSFTTelemetryEvent('token', undefined, {
				snippyEnabled: token.isPublicSuggestionsEnabled() ? 1 : 0,
				telemetryEnabled: token.isTelemetryEnabled() ? 1 : 0,
				mcpEnabled: token.isMcpEnabled() ? 1 : 0,
				previewEnabled: token.isEditorPreviewFeaturesEnabled() ? 1 : 0,
				reviewEnabled: token.isCopilotCodeReviewEnabled ? 1 : 0
			});
		}));
	}

	dispose(): void {
		this._disposables.forEach(d => d.dispose());
	}

	sendMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.sendTelemetryEvent(eventName, { github: false, microsoft: true }, properties, measurements);
	}

	sendMSFTTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.sendTelemetryErrorEvent(eventName, { github: false, microsoft: true }, properties, measurements);
	}

	sendGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		// Add SKU to GitHub telemetry events specifically
		const sku = this._tokenStore.copilotToken?.sku;
		const enrichedProperties = {
			...properties,
			sku: sku ?? ''
		};
		this.sendTelemetryEvent(eventName, { github: true, microsoft: false }, enrichedProperties, measurements);
	}

	sendGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this.sendTelemetryErrorEvent(eventName, { github: true, microsoft: false }, properties, measurements);
	}

	sendGHTelemetryException(maybeError: unknown, origin: string) {
		this._ghTelemetrySender.sendExceptionTelemetry(maybeError, origin);
	}

	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		properties = { ...properties, ...this._sharedProperties };
		this._ghTelemetrySender.sendEnhancedTelemetryEvent(eventName, properties, measurements);
	}
	sendEnhancedGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		properties = { ...properties, ...this._sharedProperties };
		this._ghTelemetrySender.sendEnhancedTelemetryErrorEvent(eventName, properties, measurements);
	}

	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		properties = { ...properties, ...this._sharedProperties };
		this._microsoftTelemetrySender.sendInternalTelemetryEvent(eventName, properties, measurements);
	}

	private _getEventName(eventName: string, github: boolean | { eventNamePrefix: string }): string {
		let prefix = '';
		if (typeof github === 'object') {
			prefix = github.eventNamePrefix;
		}
		return prefix + eventName;
	}

	sendTelemetryEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		properties = { ...properties, ...this._sharedProperties };
		if (destination.github) {
			this._ghTelemetrySender.sendTelemetryEvent(this._getEventName(eventName, destination.github), properties, measurements);
		}

		if (destination.microsoft) {
			this._microsoftTelemetrySender.sendTelemetryEvent(eventName, properties, measurements);
		}
	}

	sendTelemetryErrorEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		properties = { ...properties, ...this._sharedProperties };
		if (destination.github) {
			this._ghTelemetrySender.sendTelemetryErrorEvent(this._getEventName(eventName, destination.github), properties, measurements);
		}

		if (destination.microsoft) {
			this._microsoftTelemetrySender.sendTelemetryErrorEvent(eventName, properties, measurements);
		}
	}

	private _setOriginalExpAssignments(value: string) {
		this._originalExpAssignments = value;
		this._updateExpAssignmentsSharedProperty();
	}

	setAdditionalExpAssignments(expAssignments: string[]): void {
		this._additionalExpAssignments = expAssignments;
		this._updateExpAssignmentsSharedProperty();
	}

	private _updateExpAssignmentsSharedProperty() {
		let value = this._originalExpAssignments || '';
		for (const assignment of this._additionalExpAssignments) {
			if (!value.includes(assignment)) {
				value += `;${assignment}`;
			}
		}
		this._capiClientService.abExpContext = value;
		this._sharedProperties['abexp.assignmentcontext'] = value;
	}

	setSharedProperty(name: string, value: string): void {
		/* __GDPR__
			"query-expfeature" : {
				"ABExp.queriedFeature": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		/* __GDPR__
			"call-tas-error" : {
				"errortype": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth"}
			}
		*/
		if (name === 'abexp.assignmentcontext') {
			this._setOriginalExpAssignments(value);
			return;
		}
		this._sharedProperties[name] = value;
	}

	postEvent(eventName: string, props: Map<string, string>): void {
		for (const [key, value] of Object.entries(this._sharedProperties)) {
			props.set(key, value);
		}
		this._microsoftTelemetrySender.postEvent(eventName, props);
	}
}
