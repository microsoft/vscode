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

// Suffix appended to the base property name for the compressed (gzip + base64) chunk family.
const COMPRESSED_CHUNK_SUFFIX = 'Chunk';

// Fields that are always emitted as a compressed chunk family (when a compressor is available),
// regardless of their length. These are known to frequently exceed the per-property limit, so
// always producing the `<key>Chunk` family gives the backend a single, uniform place to read the
// value from instead of having to branch on whether the value happened to be chunked.
const ALWAYS_COMPRESSED_CHUNK_KEYS = new Set<string>(['messagesJson', 'diffsJSON']);

// Compressor used by multiplexProperties to gzip + base64 encode oversized property values. It is
// registered once by the Node layer (via setTelemetryPropertyCompressor) because Node's `zlib` is
// unavailable in the common layer; until then multiplexProperties falls back to plain chunking. It
// is async so the gzip work runs off the main thread (libuv threadpool) and never blocks the host.
let defaultCompressor: ((value: string) => Promise<string>) | undefined;

/**
 * Registers the process-wide compressor used by {@link multiplexProperties}. Called once from the
 * Node layer with a function that resolves to the base64-encoded gzip of its input.
 */
export function setTelemetryPropertyCompressor(compress: (value: string) => Promise<string>): void {
	defaultCompressor = compress;
}

/**
 * Ensures every string property survives the Application Insights per-property truncation at
 * {@link MAX_PROPERTY_LENGTH}. Values that already fit pass through untouched.
 *
 * When a value is too long it is chunked. If a compressor is available (the normal case, registered
 * via {@link setTelemetryPropertyCompressor}), the value is chunked in compressed form only: the
 * full value is gzip + base64 compressed and emitted as `<key>Chunk`, `<key>Chunk_2`,
 * `<key>Chunk_3`, ... (first column has no numeric suffix, the rest are NOT zero-padded, each
 * capped at {@link MAX_PROPERTY_LENGTH}), and the original `<key>` column simply carries the first
 * uncompressed chunk of the value. No redundant plain continuation family (`<key>_02`, ...) is
 * produced in this case.
 *
 * Fields in {@link ALWAYS_COMPRESSED_CHUNK_KEYS} always get the compressed chunk family (when a
 * compressor is available) even if they fit within {@link MAX_PROPERTY_LENGTH}, so the backend can
 * always read them from the `<key>Chunk` family without branching on size.
 *
 * If no compressor is available, the value falls back to the plain continuation family (`<key>`,
 * `<key>_02`, `<key>_03`, ...). `compress` can be passed explicitly to override the registered
 * compressor (used by tests).
 */
export async function multiplexProperties(
	properties: { [key: string]: string | undefined },
	compress: ((value: string) => Promise<string>) | undefined = defaultCompressor
): Promise<{ [key: string]: string | undefined }> {
	const newProperties = { ...properties };
	for (const key in properties) {
		const value = properties[key];
		const valueLength = value?.length ?? 0;
		// Known-large fields are always emitted as a compressed chunk family (when a compressor is
		// available) so the backend can read them uniformly, even when they happen to be short.
		const forceCompress = !!compress && value !== undefined && ALWAYS_COMPRESSED_CHUNK_KEYS.has(key);
		if (valueLength <= MAX_PROPERTY_LENGTH && !forceCompress) {
			continue;
		}
		if (compress) {
			// Compressed chunking: keep the original column as just the first uncompressed chunk and
			// emit the full value gzip + base64 compressed as <key>Chunk, <key>Chunk_2, ... (no zero
			// padding). No redundant plain continuation family is produced.
			newProperties[key] = value!.slice(0, MAX_PROPERTY_LENGTH);
			const compressed = await compress(value!);
			for (let offset = 0, index = 1; offset < compressed.length && index <= MAX_CONCATENATED_PROPERTIES; offset += MAX_PROPERTY_LENGTH, index++) {
				const columnName = index === 1 ? `${key}${COMPRESSED_CHUNK_SUFFIX}` : `${key}${COMPRESSED_CHUNK_SUFFIX}_${index}`;
				newProperties[columnName] = compressed.slice(offset, offset + MAX_PROPERTY_LENGTH);
			}
			continue;
		}
		// No compressor available: fall back to the plain continuation family <key>, <key>_02, ...
		let remaining = valueLength;
		let start = 0;
		let count = 0;
		while (remaining > 0 && count < MAX_CONCATENATED_PROPERTIES) {
			count += 1;
			const columnName = count > 1 ? key + '_' + (count < 10 ? '0' : '') + count : key;
			const end = remaining < MAX_PROPERTY_LENGTH ? start + remaining : start + MAX_PROPERTY_LENGTH;
			newProperties[columnName] = value!.slice(start, end);
			remaining -= MAX_PROPERTY_LENGTH;
			start += MAX_PROPERTY_LENGTH;
		}
	}

	return newProperties;
}
