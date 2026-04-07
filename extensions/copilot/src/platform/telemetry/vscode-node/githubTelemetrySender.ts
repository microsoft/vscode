/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppInsightsClientOptions, CustomFetcher, TelemetryReporter } from '@vscode/extension-telemetry';
import * as os from 'os';
import { env, TelemetryLogger, TelemetrySender } from 'vscode';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IDomainService } from '../../endpoint/common/domainService';
import { IEnvService } from '../../env/common/envService';
import { BaseGHTelemetrySender } from '../common/ghTelemetrySender';
import { createTrackingIdGetter, ITelemetryUserConfig } from '../common/telemetry';
import { AzureInsightReporter, unwrapEventNameFromPrefix } from '../node/azureInsightsReporter';

/**
 * Adapter that wraps both old and new telemetry reporters to implement VS Code's TelemetrySender interface.
 * Supports lazy flag evaluation to avoid circular dependencies during service initialization.
 */
class TelemetryReporterAdapter implements TelemetrySender {
	private readonly oldReporter: AzureInsightReporter;
	private readonly newReporter?: TelemetryReporter;
	private readonly useNewTelemetryLibGetter: () => boolean;
	private readonly namespace: string;
	private cachedFlagValue: boolean | undefined;
	private readonly getTrackingId: () => string | undefined;

	constructor(
		oldReporter: AzureInsightReporter,
		newReporter: TelemetryReporter | undefined,
		tokenStore: ICopilotTokenStore | undefined,
		useNewTelemetryLibGetter: () => boolean,
		namespace: string
	) {
		this.oldReporter = oldReporter;
		this.newReporter = newReporter;
		this.useNewTelemetryLibGetter = useNewTelemetryLibGetter;
		this.namespace = namespace;
		this.getTrackingId = tokenStore ? createTrackingIdGetter(tokenStore) : () => undefined;
	}

	/**
	 * Lazily evaluates the flag and caches the result.
	 * This allows the experimentation service to be initialized after TelemetryService.
	 */
	private get useNewTelemetryLib(): boolean {
		if (this.cachedFlagValue === undefined) {
			this.cachedFlagValue = this.useNewTelemetryLibGetter();
		}
		return this.cachedFlagValue;
	}

	/**
	 * Processes the event name to match the behavior of AzureInsightReporter.massageEventName:
	 * - If wrapped with the special marker, unwrap and return as-is
	 * - Otherwise, prefix with namespace/ unless already prefixed
	 */
	private massageEventName(eventName: string): string {
		if (eventName.includes('wrapped-telemetry-event-name-') && eventName.endsWith('-wrapped-telemetry-event-name')) {
			return unwrapEventNameFromPrefix(eventName);
		}
		return eventName.includes(this.namespace) ? eventName : `${this.namespace}/${eventName}`;
	}

	/**
	 * Extracts properties (strings) and measurements (numbers) from telemetry data.
	 * Handles both separate properties/measurements format and mixed format.
	 */
	private extractPropertiesAndMeasurements(data?: Record<string, unknown>): { properties: Record<string, string>; measurements: Record<string, number> } {
		const properties: Record<string, string> = {};
		const measurements: Record<string, number> = {};

		if (data) {
			// Handle both formats: separate properties/measurements or mixed
			if (data.properties !== undefined || data.measurements !== undefined) {
				Object.assign(properties, (data.properties || {}) as Record<string, string>);
				Object.assign(measurements, (data.measurements || {}) as Record<string, number>);
			} else {
				// Mixed format - separate by type
				for (const [key, value] of Object.entries(data)) {
					if (typeof value === 'number') {
						measurements[key] = value;
					} else if (value !== undefined) {
						properties[key] = String(value);
					}
				}
			}
		}

		return { properties, measurements };
	}

	sendEventData(eventName: string, data?: Record<string, unknown>): void {
		const { properties, measurements } = this.extractPropertiesAndMeasurements(data);

		// Use either NEW or OLD API based on experiment flag (not both)
		if (this.useNewTelemetryLib && this.newReporter) {
			// Apply the same event name processing as AzureInsightReporter.massageEventName:
			// unwrap if wrapped, otherwise add extension prefix
			const processedEventName = this.massageEventName(eventName);

			const trackingId = this.getTrackingId();
			const tagOverrides = trackingId ? { 'ai.user.id': trackingId } : undefined;

			// Use sendDangerousTelemetryEvent to bypass TelemetryReporter's internal TelemetryLogger.
			// This is necessary because we already have our own outer TelemetryLogger that handles
			// opt-in/settings checks. Using the regular sendTelemetryEvent would add another layer.
			this.newReporter.sendDangerousTelemetryEvent(processedEventName, properties, measurements, tagOverrides);
		} else {
			// Default: use OLD API
			// Pass original eventName - AzureInsightReporter.massageEventName() handles the wrapped marker
			// to avoid double-prefixing
			// Spread data first so extracted properties/measurements take precedence
			const oldPayload = { ...data, properties, measurements };
			this.oldReporter.sendEventData(eventName, oldPayload);
		}
	}

	sendErrorData(error: Error, data?: Record<string, unknown>): void {
		const { properties, measurements } = this.extractPropertiesAndMeasurements(data);

		// Use either NEW or OLD API based on experiment flag
		if (this.useNewTelemetryLib && this.newReporter) {
			const trackingId = this.getTrackingId();
			const tagOverrides = trackingId ? { 'ai.user.id': trackingId } : undefined;

			this.newReporter.sendDangerousTelemetryException(error, properties, measurements, tagOverrides);
		} else {
			// Default: use OLD API
			// Spread data first so our augmented properties/measurements take precedence
			const oldPayload = { ...data, properties, measurements };
			this.oldReporter.sendErrorData(error, oldPayload);
		}
	}

	flush(): Promise<void> {
		// Dispose both reporters since both are created eagerly
		return Promise.all([
			this.oldReporter.flush(),
			this.newReporter?.dispose()
		]).then(() => { });
	}
}

function createGitHubTelemetryReporter(
	key: string,
	capiClientService: ICAPIClientService,
	envService: IEnvService,
	useNewTelemetryLibGetter: () => boolean,
	tokenStore: ICopilotTokenStore,
	extensionName: string,
	customFetcher?: CustomFetcher
): TelemetrySender {
	// Always create the OLD reporter (default)
	const oldReporter = new AzureInsightReporter(
		capiClientService,
		envService,
		tokenStore,
		extensionName,
		key
	);

	// Always create NEW reporter so it's ready when the flag is enabled

	// Match old implementation's property naming (common_* with underscore, not common.* with dot)
	const commonProps: Record<string, string> = {
		'common_os': os.platform(),
		'common_platformversion': os.release(),
		'common_arch': os.arch(),
		'common_cpu': Array.from(new Set(os.cpus().map(c => c.model))).join(),
		'common_vscodemachineid': envService.machineId,
		'common_vscodesessionid': envService.sessionId,
		'client_deviceid': envService.devDeviceId,
		'common_uikind': envService.uiKind,
		'common_remotename': envService.remoteName ?? 'none',
		'common_isnewappinstall': ''
	};

	const appInsightsOptions: AppInsightsClientOptions = {
		endpointUrl: capiClientService.copilotTelemetryURL,
		commonProperties: commonProps,
		// Static tag overrides (set once, applied to all events)
		tagOverrides: {
			'ai.cloud.roleInstance': 'REDACTED', // Do not want personal machine names to be sent
			'ai.session.id': envService.sessionId // Map session ID to Application Insights tag
		}
	};

	// Pass customFetcher to use the extension's fetcher service (handles proxy/cert/fallbacks)
	const newReporter = new TelemetryReporter(
		key,
		[], // replacementOptions - empty to disable redaction
		{
			ignoreBuiltInCommonProperties: true,
			ignoreUnhandledErrors: true
		},
		customFetcher,
		appInsightsOptions
	);

	return new TelemetryReporterAdapter(oldReporter, newReporter, tokenStore, useNewTelemetryLibGetter, extensionName);
}

export class GitHubTelemetrySender extends BaseGHTelemetrySender {
	constructor(
		configService: IConfigurationService,
		envService: IEnvService,
		telemetryConfig: ITelemetryUserConfig,
		domainService: IDomainService,
		capiClientService: ICAPIClientService,
		extensionName: string,
		standardTelemetryAIKey: string,
		enhancedTelemetryAIKey: string,
		tokenStore: ICopilotTokenStore,
		useNewTelemetryLibGetter: () => boolean,
		customFetcher?: CustomFetcher
	) {
		const telemetryLoggerFactory = (enhanced: boolean): TelemetryLogger => {
			const key = enhanced ? enhancedTelemetryAIKey : standardTelemetryAIKey;
			const sender = createGitHubTelemetryReporter(
				key,
				capiClientService,
				envService,
				useNewTelemetryLibGetter,
				tokenStore,
				extensionName,
				customFetcher
			);
			const logger = env.createTelemetryLogger(sender, {
				ignoreBuiltInCommonProperties: true,
				ignoreUnhandledErrors: true
			});
			return logger;
		};
		super(tokenStore, telemetryLoggerFactory, configService, telemetryConfig, envService, domainService);
	}
}