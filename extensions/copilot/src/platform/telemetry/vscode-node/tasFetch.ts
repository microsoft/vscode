/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFetcherService } from '../../networking/common/fetcherService';
import { INTEGRATION_ID } from '../../endpoint/common/licenseAgreement';

/**
 * Builds the transport that TAS uses for both the legacy (GET) and the assignments (POST)
 * endpoints, routing every request through the extension's fetcher service so they get proxy
 * handling, retries/fallback, and the standard user-agent. Wiring both endpoints to this single
 * adapter is what keeps the assignments call from silently bypassing proxy handling; the method
 * determines the call site used for fetch telemetry.
 */
export function createTasFetch(fetcherService: IFetcherService) {
	return (url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }) =>
		fetcherService.fetch(url, {
			method: init.method,
			headers: { ...init.headers, integratorid: INTEGRATION_ID },
			body: init.body,
			callSite: init.method === 'POST' ? 'exp.assignments' : 'exp.legacy',
		});
}
