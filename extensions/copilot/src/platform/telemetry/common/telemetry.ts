/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { TelemetrySender } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import type { CopilotToken } from '../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import type { TelemetryData } from './telemetryData';


// Interfaces taken from and should match `@vscode/extension-telemetry` package
export interface TelemetryEventMeasurements {
	readonly [key: string]: number | undefined;
}

export interface TelemetryEventProperties {
	readonly [key: string]: string | import('vscode').TelemetryTrustedValue<string> | undefined;
}

// Interfaces taken from and should match `vscode-tas-client`
/**
 * Telemetry for the experimentation service.
 */
export interface IExperimentationTelemetry {
	/**
	 * Set shared property for all events.
	 * @param name The name of the shared property.
	 * @param value The value of the shared property.
	 */
	setSharedProperty(name: string, value: string): void;
	/**
	 * Posts an event into the telemetry implementation.
	 */
	postEvent(eventName: string, props: Map<string, string>): void;
}

export const ITelemetryUserConfig = createServiceIdentifier<ITelemetryUserConfig>('ITelemetryUserConfig');

export interface ITelemetryUserConfig {
	readonly _serviceBrand: undefined;
	trackingId: string | undefined;
	organizationsList: string | undefined;
	enterpriseList: string | undefined;
	optedIn: boolean;
}

export class TelemetryUserConfigImpl implements ITelemetryUserConfig {
	declare readonly _serviceBrand: undefined;
	// tracking id from auth token
	public trackingId: string | undefined;
	public organizationsList: string | undefined;
	public enterpriseList: string | undefined;
	public optedIn: boolean;

	constructor(
		trackingId: string | undefined,
		optedIn: boolean | undefined,
		@ICopilotTokenStore private readonly _tokenStore: ICopilotTokenStore,
	) {
		this.trackingId = trackingId;
		this.optedIn = optedIn ?? false;
		this.updateFromToken(this._tokenStore.copilotToken);
		this._tokenStore.onDidStoreUpdate(() => {
			this.updateFromToken(this._tokenStore.copilotToken);
		});
	}

	private updateFromToken(token: CopilotToken | undefined) {
		if (!token) {
			return;
		}
		const enhancedTelemetry = token.getTokenValue('rt') === '1';
		const trackingId = token.getTokenValue('tid');
		if (trackingId !== undefined) {
			this.trackingId = trackingId;
			this.organizationsList = token.organizationList.toString();
			this.enterpriseList = token.enterpriseList.toString();
			this.optedIn = enhancedTelemetry;
		}
	}
}

export type TelemetryProperties = { [key: string]: string };

export type AdditionalTelemetryProperties = { [key: string]: string };

/**
 * Creates a getter that returns the tracking ID from the token store.
 * The cache is:
 * - initialized from the current token (if available) when the getter is created
 * - updated whenever the token store changes
 * - returned even when the token is temporarily unavailable
 */
export function createTrackingIdGetter(tokenStore: ICopilotTokenStore): () => string | undefined {
	let cachedTrackingId = tokenStore.copilotToken?.getTokenValue('tid');
	tokenStore.onDidStoreUpdate(() => {
		const trackingId = tokenStore.copilotToken?.getTokenValue('tid');
		if (trackingId) {
			cachedTrackingId = trackingId;
		}
	});
	return () => cachedTrackingId;
}

export type TelemetryDestination = {
	github: boolean | { eventNamePrefix: string };
	microsoft: boolean;
};

export interface ITelemetryService extends IExperimentationTelemetry, IDisposable {
	readonly _serviceBrand: undefined;
	/**
	 * Send a Microsoft internal telemetry event.
	 *
	 * @remark This is a no-op if the user is not part of an allowed organization.
	 * @remark This event does not require GDPR comments due to being classified in a special manner for internal use only.

	 */
	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
	sendMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
	sendMSFTTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
	sendGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
	sendGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
	sendGHTelemetryException(maybeError: unknown, origin: string): void;
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
	sendEnhancedGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
	sendTelemetryEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
	sendTelemetryEvent<TTelemetryEvent extends ITelemetryEvent>(eventName: TTelemetryEvent['eventName'], destination: TelemetryDestination, properties?: TTelemetryEvent['properties'], measurements?: TTelemetryEvent['measurements']): void;
	sendTelemetryErrorEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;

	setAdditionalExpAssignments(expAssignments: string[]): void;
}

export interface ITelemetryEvent {
	eventName: string;
	properties?: object;
	measurements?: object;
}

/**
 * The "sub services" which power the telemetry service and send telemetry to the appropriate endpoints.
 */
export interface ITelemetrySender extends IDisposable {
	sendTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
	sendTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
}

export const ITelemetryService = createServiceIdentifier<ITelemetryService>('ITelemetryService');
export interface IMSFTTelemetrySender extends ITelemetrySender {
	/**
	 * Send a Microsoft internal telemetry event.
	 *
	 * @remark This is a no-op if the user is not part of an allowed organization.
	 * @remark This event does not require GDPR comments due to be classified in a special manner for internal use only.
	 */
	sendInternalTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void;
}
export interface IGHTelemetryService {
	readonly _serviceBrand: undefined;
	setSecureReporter(reporter: TelemetrySender | undefined): void;
	setReporter(reporter: TelemetrySender | undefined): void;

	/**
	 * Standard telemetry events can be disabled with VS Code's telemetry settings.
	 */
	sendTelemetry(name: string, telemetryData?: TelemetryData): Promise<void>;

	/**
	 * Standard telemetry events can be disabled with VS Code's telemetry settings.
	 */
	sendErrorTelemetry(name: string, telemetryData?: TelemetryData): Promise<void>;

	/**
	 * Enhanced telemetry events contain additional data such as user prompts and suggestions. Like standard telemetry events, it can disabled with VS Code's telemetry settings or the Copilot settings page.
	 *
	 * You can manage this setting on the Copilot settings page https://github.com/settings/copilot/features
	 * Learn about configuring this telemetry at https://docs.github.com/en/copilot/managing-copilot/managing-copilot-as-an-individual-subscriber/managing-your-copilot-plan/managing-copilot-policies-as-an-individual-subscriber#enabling-or-disabling-prompt-and-suggestion-collection
	 * Learn more about the data collected at https://github.com/features/copilot/#faq
	 */
	sendEnhancedTelemetry(name: string, telemetryData?: TelemetryData): Promise<void>;

	/**
	 * Enhanced telemetry events contain additional data such as user prompts and suggestions. Like standard telemetry events, it can disabled with VS Code's telemetry settings or the Copilot settings page.
	 *
	 * You can manage this setting on the Copilot settings page https://github.com/settings/copilot/features
	 * Learn about configuring this telemetry at https://docs.github.com/en/copilot/managing-copilot/managing-copilot-as-an-individual-subscriber/managing-your-copilot-plan/managing-copilot-policies-as-an-individual-subscriber#enabling-or-disabling-prompt-and-suggestion-collection
	 * Learn more about the data collected at https://github.com/features/copilot/#faq
	 */
	sendEnhancedErrorTelemetry(name: string, telemetryData?: TelemetryData): Promise<void>;

	sendExpProblemTelemetry(telemetryProperties: { reason: string }): Promise<void>;
	sendExceptionTelemetry(maybeError: unknown, origin: string): Promise<void>;
	deactivate(): Promise<void>;
}

/**
 * Borrowed from https://github.com/microsoft/vscode/blob/9e560ad042bbc97e98f241f58cd08ddde0458a30/src/vs/platform/telemetry/common/telemetryUtils.ts#L21-L25
 * Used as an API type in the vscode.d.ts as well to indicate properties that are exempt from cleaning.
 */
export class TelemetryTrustedValue<T> {
	// This is merely used as an identifier as the instance will be lost during serialization over the exthost
	public readonly isTrustedTelemetryValue = true;
	constructor(public readonly value: T) { }
}

// From Copilot extension.

const MAX_PROPERTY_LENGTH = 8192;
const MAX_CONCATENATED_PROPERTIES = 50; // 50 properties of 8192 characters each is 409600 characters.

export function multiplexProperties(properties: { [key: string]: string | undefined }): { [key: string]: string | undefined } {
	const newProperties = { ...properties };
	for (const key in properties) {
		const value = properties[key];
		// Test the length of value
		let remainingValueCharactersLength = value?.length ?? 0;
		if (remainingValueCharactersLength > MAX_PROPERTY_LENGTH) {
			let lastStartIndex = 0;
			let newPropertiesCount = 0;
			while (remainingValueCharactersLength > 0 && newPropertiesCount < MAX_CONCATENATED_PROPERTIES) {
				newPropertiesCount += 1;
				let propertyName = key;
				if (newPropertiesCount > 1) {
					propertyName = key + '_' + (newPropertiesCount < 10 ? '0' : '') + newPropertiesCount;
				}
				let offsetIndex = lastStartIndex + MAX_PROPERTY_LENGTH;
				if (remainingValueCharactersLength < MAX_PROPERTY_LENGTH) {
					offsetIndex = lastStartIndex + remainingValueCharactersLength;
				}
				newProperties[propertyName] = value!.slice(lastStartIndex, offsetIndex);
				remainingValueCharactersLength -= MAX_PROPERTY_LENGTH;
				lastStartIndex += MAX_PROPERTY_LENGTH;
			}
		}
	}
	return newProperties;
}