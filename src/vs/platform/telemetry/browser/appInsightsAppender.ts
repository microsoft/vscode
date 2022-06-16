/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { ITelemetryAppender, validateTelemetryData } from 'vs/platform/telemetry/common/telemetryUtils';

export class WebAppInsightsAppender implements ITelemetryAppender {
	private _aiClient: ApplicationInsights | undefined;
	private _aiClientLoaded = false;
	private _telemetryCache: { eventName: string; data: any }[] = [];

	constructor(private _eventPrefix: string, aiKey: string) {
		const endpointUrl = 'https://mobile.events.data.microsoft.com/collect/v1';
		import('@microsoft/applicationinsights-web').then(aiLibrary => {
			this._aiClient = new aiLibrary.ApplicationInsights({
				config: {
					instrumentationKey: aiKey,
					endpointUrl,
					disableAjaxTracking: true,
					disableExceptionTracking: true,
					disableFetchTracking: true,
					disableCorrelationHeaders: true,
					disableCookiesUsage: true,
					autoTrackPageVisitTime: false,
					emitLineDelimitedJson: true,
				},
			});
			this._aiClient.loadAppInsights();
			// Client is loaded we can now flush the cached events
			this._aiClientLoaded = true;
			this._telemetryCache.forEach(cacheEntry => this.log(cacheEntry.eventName, cacheEntry.data));
			this._telemetryCache = [];

			// If we cannot access the endpoint this most likely means it's being blocked
			// and we should not attempt to send any telemetry.
			fetch(endpointUrl, { method: 'POST' }).catch(() => (this._aiClient = undefined));
		}).catch(err => {
			console.error(err);
		});
	}

	/**
	 * Logs a telemetry event with eventName and data
	 * @param eventName The event name
	 * @param data The data associated with the events
	 */
	public log(eventName: string, data: any): void {
		if (!this._aiClient && this._aiClientLoaded) {
			return;
		} else if (!this._aiClient && !this._aiClientLoaded) {
			this._telemetryCache.push({ eventName, data });
			return;
		}

		data = validateTelemetryData(data);

		// Web does not expect properties and measurements so we must
		// spread them out. This is different from desktop which expects them
		data = { ...data.properties, ...data.measurements };

		// undefined assertion is ok since above two if statements cover both cases
		this._aiClient!.trackEvent({ name: this._eventPrefix + '/' + eventName }, data);
	}

	/**
	 * Flushes all the telemetry data still in the buffer
	 */
	public flush(): Promise<any> {
		if (this._aiClient) {
			this._aiClient.flush();
			this._aiClient = undefined;
		}
		return Promise.resolve(undefined);
	}
}
