/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFetcherService } from '../../networking/common/fetcherService';
import { DeferredPromise, disposableTimeout, RunOnceScheduler } from '../../../util/vs/base/common/async';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { DisposableStore, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { isObject } from '../../../util/vs/base/common/types';
import { ILogService } from '../../log/common/logService';

export const SIGNED_OUT_ASSIGNMENTS_ENDPOINTS = [
	'https://exp.enterprise.githubcopilot.com/api/v1/assignments',
	'https://exp.business.githubcopilot.com/api/v1/assignments',
	'https://exp.individual.githubcopilot.com/api/v1/assignments',
];
const SIGNED_OUT_ASSIGNMENTS_TIMEOUT = 5_000;
const SIGNED_OUT_ASSIGNMENTS_STAGGER = 1_000;

/** Remembers a reachable anonymous TAS endpoint without changing signed-in or legacy transport. */
export function createSignedOutAssignmentsFetch(fetcherService: IFetcherService, logService: ILogService) {
	let preferredEndpoint: string | undefined;
	return async (init: { method: 'POST'; headers: Record<string, string>; body: string }, isRevoked: () => boolean) => {
		const preferred = preferredEndpoint;
		const endpoints = preferred
			? [preferred, ...SIGNED_OUT_ASSIGNMENTS_ENDPOINTS.filter(endpoint => endpoint !== preferred)]
			: SIGNED_OUT_ASSIGNMENTS_ENDPOINTS;
		// A remembered host only fails over on errors; time-based hedging is limited to discovery.
		const hedge = !preferred;
		const disposables = new DisposableStore();
		const controller = fetcherService.makeAbortController();
		disposables.add(toDisposable(() => controller.abort()));
		const result = new DeferredPromise<{ status: number; json(): Promise<unknown> }>();
		let next = 0;
		let pending = 0;
		const launchNext = async () => {
			if (result.isSettled) {
				return;
			}
			if (isRevoked()) {
				result.error(new CancellationError());
				return;
			}
			const endpoint = endpoints[next++];
			pending++;
			if (hedge && next < endpoints.length) {
				scheduler.schedule();
			}
			try {
				const response = await fetcherService.fetch(endpoint, {
					...init,
					callSite: 'exp.assignments',
					signal: controller.signal,
					retryFallbacks: false,
				});
				if (response.status < 200 || response.status >= 300) {
					throw new Error(`TAS returned HTTP ${response.status}`);
				}
				const data: unknown = await response.json();
				const fields = isObject(data) ? data as Record<string, unknown> : undefined;
				if (!fields || !isObject(fields.featureVariables) || typeof fields.assignmentContext !== 'string'
					|| !Object.values(fields.featureVariables).every(value => typeof value === 'string')) {
					throw new Error('Invalid TAS assignments response');
				}
				if (result.isSettled) {
					return;
				}
				if (isRevoked()) {
					throw new CancellationError();
				}
				preferredEndpoint = endpoint;
				result.complete({ status: response.status, json: async () => data });
			} catch (error) {
				if (result.isSettled) {
					return;
				}
				if (isRevoked()) {
					result.error(new CancellationError());
					return;
				}
				logService.warn(`Signed-out TAS request failed at ${endpoint}: ${error}`);
				pending--;
				if (next < endpoints.length) {
					scheduler.cancel();
					void launchNext();
				} else if (pending === 0) {
					result.error(new Error('All signed-out TAS endpoints failed'));
				}
			}
		};
		const scheduler = disposables.add(new RunOnceScheduler(() => { void launchNext(); }, SIGNED_OUT_ASSIGNMENTS_STAGGER));
		disposableTimeout(() => {
			logService.warn('Signed-out TAS discovery timed out');
			// An unresponsive remembered host never fails over, so rediscover with hedging next time.
			if (preferred && preferredEndpoint === preferred) {
				preferredEndpoint = undefined;
			}
			result.error(new Error('Signed-out TAS discovery timed out'));
		}, SIGNED_OUT_ASSIGNMENTS_TIMEOUT, disposables);
		try {
			void launchNext();
			return await result.p;
		} finally {
			disposables.dispose();
		}
	};
}

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
			headers: init.headers,
			body: init.body,
			callSite: init.method === 'POST' ? 'exp.assignments' : 'exp.legacy',
		});
}
