/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { ICommonProperties } from '../../telemetry/common/telemetry.js';

/**
 * Public GitHub Copilot telemetry ingestion keys. These are instrumentation keys, not
 * secrets; the iKey selects the destination hydro table:
 *  - standard  -> `copilot_v0_copilot_event`
 *  - enhanced  -> `copilot_v0_restricted_copilot_event`
 */
const GH_STANDARD_IKEY = '7d7048df-6dd0-4048-bb23-b716c1461f8f';
const GH_ENHANCED_IKEY = '3fdd7f28-937a-48c8-9a21-ba337db23bd1';

/**
 * Fallback Copilot telemetry endpoint (the dotcom value of the CAPI token's
 * `endpoints.telemetry`, with the `/telemetry` path the Copilot CLI/runtime appends).
 * Used until {@link IAgentHostRestrictedTelemetry.setRestrictedTelemetryEndpoint} supplies
 * the user's discovered endpoint (dotcom, GHE, or proxy). Accepts unauthenticated POSTs.
 */
const GH_TELEMETRY_URL = 'https://copilot-telemetry.githubusercontent.com/telemetry';

/** Event names are namespaced by client category; the CTS name filter requires this. */
const NAMESPACE = 'copilot-chat';

export type TelemetryProps = Record<string, string | undefined>;
export type TelemetryMeasurements = Record<string, number | undefined>;

export interface IAgentHostInternalTelemetryContext {
	readonly isInternal: boolean;
	readonly trackingId: string | undefined;
	readonly userName: string | undefined;
	readonly isVscodeTeamMember: boolean;
}

export interface IAgentHostRestrictedTelemetryContext extends IAgentHostInternalTelemetryContext {
	readonly restrictedTelemetryEnabled: boolean;
	readonly telemetryEndpoint: string | undefined;
	/** Whether content exclusion is enabled; undefined when account discovery could not determine it. */
	readonly copilotIgnoreEnabled?: boolean;
}

export interface IAgentHostInternalTelemetrySink {
	setContext(context: IAgentHostInternalTelemetryContext | undefined): void;
	send(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void;
	sendForContext(context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void;
}

/** The subset of the global `fetch` used to POST envelopes; injectable so tests avoid live network calls. */
export type FetchFn = typeof globalThis.fetch;

/**
 * App Insights caps a single property value at ~8192 chars. Long values are split across
 * numbered keys (`key`, `key_02`, `key_03`, …) so the Copilot Telemetry Service reassembles
 * them, mirroring the Copilot extension's `multiplexProperties` so events look identical on the
 * wire and downstream.
 */
const MAX_PROPERTY_LENGTH = 8192;
const MAX_CONCATENATED_PROPERTIES = 50;

export function multiplexProperties(properties: TelemetryProps): TelemetryProps {
	const newProperties: TelemetryProps = { ...properties };
	for (const key in properties) {
		const value = properties[key];
		let remaining = value?.length ?? 0;
		if (remaining > MAX_PROPERTY_LENGTH) {
			let lastStartIndex = 0;
			let count = 0;
			while (remaining > 0 && count < MAX_CONCATENATED_PROPERTIES) {
				count += 1;
				let propertyName = key;
				if (count > 1) {
					propertyName = key + '_' + (count < 10 ? '0' : '') + count;
				}
				let offsetIndex = lastStartIndex + MAX_PROPERTY_LENGTH;
				if (remaining < MAX_PROPERTY_LENGTH) {
					offsetIndex = lastStartIndex + remaining;
				}
				newProperties[propertyName] = value!.slice(lastStartIndex, offsetIndex);
				remaining -= MAX_PROPERTY_LENGTH;
				lastStartIndex += MAX_PROPERTY_LENGTH;
			}
		}
	}
	return newProperties;
}

/**
 * The restricted telemetry surface the agent host exposes, mirroring the Copilot extension's
 * `ITelemetryService` restricted methods so agent-host code can emit the same GH/MSFT events.
 */
export interface IAgentHostRestrictedTelemetry {
	/** GH standard (non-restricted) telemetry -> `copilot_v0_copilot_event`. */
	sendGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void;
	/** GH enhanced/restricted telemetry (prompts, tools, etc.) -> `copilot_v0_restricted_copilot_event`. */
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void;
	/** GH enhanced telemetry attributed and routed using an immutable per-session context. */
	sendEnhancedGHTelemetryEventForContext(context: IAgentHostRestrictedTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void;
	/** MSFT-internal telemetry -> Aria/Collector++ (internal-only table). No-op without an internal key. */
	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void;
	/** MSFT-internal telemetry attributed using an immutable per-session context. */
	sendInternalMSFTTelemetryEventForContext(context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void;
	/** Sets the Copilot user tracking id (`copilot_trackingId`) carried on every subsequent event. */
	setCopilotTrackingId(trackingId: string | undefined): void;
	/** Overrides the POST endpoint with the user's CAPI `endpoints.telemetry`; falsy restores the default. */
	setRestrictedTelemetryEndpoint(endpointUrl: string | undefined): void;
	/** Enables enhanced GH telemetry once the token opts in (`rt=1`); off by default and on flip/logout. */
	setRestrictedTelemetryEnabled(enabled: boolean): void;
	/** Sets the internal-user identity and enables the internal sink only for staff accounts. */
	setInternalTelemetryContext(context: IAgentHostInternalTelemetryContext | undefined): void;
}

/**
 * Emits GitHub Copilot restricted/enhanced telemetry from the agent-host process by POSTing
 * Application-Insights envelopes to the Copilot telemetry endpoint (the same wire format the
 * Copilot extension uses). Fire-and-forget; failures are logged, never thrown.
 */
export class AgentHostRestrictedTelemetrySender implements IAgentHostRestrictedTelemetry {

	private readonly _commonProps: TelemetryProps;

	/**
	 * Whether the current Copilot token opts into enhanced/restricted telemetry (`rt=1`). Off by
	 * default so the sole writer to the restricted table never emits for public users — a hard
	 * safety boundary that holds even if the enclosing service's gate is bypassed. Mirrors the
	 * Copilot extension, which only creates the restricted reporter for opted-in users.
	 */
	private _restrictedTelemetryEnabled = false;
	private _internalTelemetryEnabled = false;

	constructor(
		commonProperties: ICommonProperties,
		private readonly _logService: ILogService,
		private _endpointUrl: string = GH_TELEMETRY_URL,
		private readonly _internalSink?: IAgentHostInternalTelemetrySink,
		private readonly _fetchFn: FetchFn = globalThis.fetch,
	) {
		// Map the resolved common properties onto the GH property names the hydro schema reads.
		this._commonProps = {
			client_machineid: asString(commonProperties['common.machineId']),
			client_deviceid: asString(commonProperties['common.devDeviceId']),
			client_sessionid: asString(commonProperties['sessionID']),
			common_os: asString(commonProperties['common.nodePlatform']) ?? process.platform,
			editor_version: asString(commonProperties['version']),
		};
	}

	sendGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this._post(GH_STANDARD_IKEY, eventName, properties, measurements);
	}

	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		// Hard safety boundary: enhanced/restricted telemetry is the pipeline that may carry prompt
		// and tool content, so the only writer to the restricted table refuses to emit unless the
		// user's token opted in (`rt=1`). This holds even if a caller reaches the sender without the
		// service-level `rt`/telemetry-level gate.
		if (!this._restrictedTelemetryEnabled) {
			return;
		}
		this._post(GH_ENHANCED_IKEY, eventName, properties, measurements);
	}

	sendEnhancedGHTelemetryEventForContext(context: IAgentHostRestrictedTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (!context.restrictedTelemetryEnabled) {
			return;
		}
		this._post(GH_ENHANCED_IKEY, eventName, properties, measurements, {
			endpointUrl: context.telemetryEndpoint,
			trackingId: context.trackingId,
		});
	}

	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (!this._internalTelemetryEnabled) {
			return;
		}
		if (this._internalSink) {
			this._internalSink.send(eventName, properties, measurements);
			return;
		}
		this._logService.trace(`[ahp-restricted] internal MSFT event (not sent, no internal key): ${eventName}`);
	}

	sendInternalMSFTTelemetryEventForContext(context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (!context.isInternal) {
			return;
		}
		if (this._internalSink) {
			this._internalSink.sendForContext(context, eventName, properties, measurements);
			return;
		}
		this._logService.trace(`[ahp-restricted] internal MSFT event (not sent, no internal key): ${eventName}`);
	}

	setCopilotTrackingId(trackingId: string | undefined): void {
		// `copilot_trackingId` is the current account's Copilot token `tid` claim. Exact runtime
		// targets use their immutable per-session context instead; this mutable value remains for
		// the pre-existing account-scoped reporters.
		this._commonProps.copilot_trackingId = trackingId || undefined;
	}

	setRestrictedTelemetryEndpoint(endpointUrl: string | undefined): void {
		// The user's telemetry host comes from the CAPI `endpoints.telemetry` discovery; fall back
		// to the dotcom default when it is unknown so events are never sent to an empty URL.
		this._endpointUrl = endpointUrl || GH_TELEMETRY_URL;
	}

	setRestrictedTelemetryEnabled(enabled: boolean): void {
		this._restrictedTelemetryEnabled = enabled;
	}

	setInternalTelemetryContext(context: IAgentHostInternalTelemetryContext | undefined): void {
		this._internalTelemetryEnabled = context?.isInternal === true;
		this._internalSink?.setContext(context);
	}

	private _post(iKey: string, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements, context?: { readonly endpointUrl: string | undefined; readonly trackingId: string | undefined }): void {
		const name = eventName.includes('/') ? eventName : `${NAMESPACE}/${eventName}`;
		const commonProps = context
			? { ...this._commonProps, copilot_trackingId: context.trackingId }
			: this._commonProps;
		const envelope = {
			ver: 1,
			name: `Microsoft.ApplicationInsights.${iKey.replace(/-/g, '')}.Event`,
			time: new Date().toISOString(),
			sampleRate: 100,
			seq: '',
			iKey,
			tags: { 'ai.operation.id': generateUuid() },
			data: {
				baseType: 'EventData',
				baseData: {
					name,
					// `unique_id` is a fresh per-event id (its hydro column is read by the Copilot
					// Telemetry Service from the snake_case `unique_id` property, NOT `uniqueId`),
					// mirroring the Copilot extension so each emitted event stays individually
					// addressable. Placed first so explicit properties still win on collision.
					properties: context
						? { unique_id: generateUuid(), ...commonProps, ...properties, copilot_trackingId: context.trackingId }
						: { unique_id: generateUuid(), ...commonProps, ...properties },
					measurements: measurements ?? {},
				},
			},
		};

		this._logService.trace(`[ahp-restricted] emit ${name} (iKey ${iKey.slice(0, 8)})`);

		if (typeof this._fetchFn !== 'function') {
			this._logService.warn('[ahp-restricted] global fetch unavailable; telemetry not sent');
			return;
		}

		// Fire-and-forget: post the event and move on. Delivery/robustness is intentionally kept
		// simple here — failures are logged, not retried (a retry loop would only mask local
		// telemetry-blocking resolvers, which do not exist in production).
		this._fetchFn(context?.endpointUrl || (context ? GH_TELEMETRY_URL : this._endpointUrl), {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-json-stream' },
			body: JSON.stringify(envelope),
		}).then(res => {
			if (!res.ok) {
				this._logService.warn(`[ahp-restricted] ${name} rejected: HTTP ${res.status}`);
			}
		}).catch(err => {
			this._logService.warn(`[ahp-restricted] ${name} POST failed: ${err instanceof Error ? err.message : String(err)}`);
		});
	}
}

function asString(value: string | boolean | undefined): string | undefined {
	return typeof value === 'string' ? value : value === undefined ? undefined : String(value);
}
