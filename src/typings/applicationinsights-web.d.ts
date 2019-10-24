/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module '@microsoft/applicationinsights-web' {
	export interface IConfig {
		instrumentationKey?: string;
		endpointUrl?: string;
		emitLineDelimitedJson?: boolean;
		accountId?: string;
		sessionRenewalMs?: number;
		sessionExpirationMs?: number;
		maxBatchSizeInBytes?: number;
		maxBatchInterval?: number;
		enableDebug?: boolean;
		disableExceptionTracking?: boolean;
		disableTelemetry?: boolean;
		verboseLogging?: boolean;
		diagnosticLogInterval?: number;
		samplingPercentage?: number;
		autoTrackPageVisitTime?: boolean;
		disableAjaxTracking?: boolean;
		overridePageViewDuration?: boolean;
		maxAjaxCallsPerView?: number;
		disableDataLossAnalysis?: boolean;
		disableCorrelationHeaders?: boolean;
		correlationHeaderExcludedDomains?: string[];
		disableFlushOnBeforeUnload?: boolean;
		enableSessionStorageBuffer?: boolean;
		isCookieUseDisabled?: boolean;
		cookieDomain?: string;
		isRetryDisabled?: boolean;
		url?: string;
		isStorageUseDisabled?: boolean;
		isBeaconApiDisabled?: boolean;
		sdkExtension?: string;
		isBrowserLinkTrackingEnabled?: boolean;
		appId?: string;
		enableCorsCorrelation?: boolean;
	}

	export interface ISnippet {
		config: IConfig;
	}

	export interface IEventTelemetry {
		name: string;
		properties?: { [key: string]: string };
		measurements?: { [key: string]: number };
	}

	export class ApplicationInsights {
		constructor(config: ISnippet);
		loadAppInsights(): void;
		trackEvent(data: IEventTelemetry): void;
		flush(): void;
	}
}
