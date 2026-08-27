/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { SpyingTelemetryService } from '../../../telemetry/node/spyingTelemetryService';
import { FakeHeaders } from '../../../test/node/fetcher';
import { TestLogService } from '../../../testing/common/testLogService';
import { FetcherId, FetchOptions, PaginationOptions, Response } from '../../common/fetcherService';
import { IFetcher } from '../../common/networking';
import { fetchWithFallbacks } from '../../node/fetcherFallback';

suite('FetcherFallback Test Suite', function () {

	const knownBadFetchers = new Set<FetcherId>();
	const logService = new TestLogService();
	const telemetryService = new NullTelemetryService();
	const experimentationService = new NullExperimentationService();
	const configurationService = new DefaultsOnlyConfigurationService();
	const someHTML = '<html>...</html>';
	const someJSON = '{"key": "value"}';

	test('first fetcher succeeds', async function () {
		const fetcherSpec = [
			{ name: 'fetcher1', response: createFakeResponse(200, someJSON) },
			{ name: 'fetcher2', response: createFakeResponse(200, someJSON) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, telemetryService, experimentationService);
		assert.deepStrictEqual(testFetchers.calls.map(c => c.name), fetcherSpec.slice(0, 1).map(f => f.name)); // only first fetcher called
		assert.strictEqual(updatedFetchers, undefined);
		assert.strictEqual(updatedKnownBadFetchers, undefined);
		assert.strictEqual(response.status, 200);
		const json = await response.json();
		assert.deepStrictEqual(json, JSON.parse(someJSON));
	});

	test('first fetcher is retried to confirm failure', async function () {
		const fetcherSpec = [
			{ name: 'fetcher1', response: createFakeResponse(200, someHTML) },
			{ name: 'fetcher2', response: createFakeResponse(200, someJSON) },
			{ name: 'fetcher1', response: createFakeResponse(200, someHTML) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const spyingTelemetryService = new SpyingTelemetryService();
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
		assert.deepStrictEqual(testFetchers.calls.map(c => c.name), fetcherSpec.map(f => f.name));
		assert.ok(updatedFetchers);
		assert.strictEqual(updatedFetchers[0], testFetchers.fetchers[1]);
		assert.strictEqual(updatedFetchers[1], testFetchers.fetchers[0]);
		assert.ok(updatedKnownBadFetchers);
		assert.strictEqual(updatedKnownBadFetchers.size, 1);
		assert.strictEqual(updatedKnownBadFetchers.has('fetcher1'), true);
		assert.strictEqual(response.status, 200);
		const json = await response.json();
		assert.deepStrictEqual(json, JSON.parse(someJSON));
		assert.deepStrictEqual(spyingTelemetryService.getEvents().telemetryServiceEvents.map(event => event.eventName), ['fetcherFallback']);
	});

	test.each([302, 401, 500])('HTTP %i response falls back to another fetcher', async status => {
		const fetcherSpec = [
			{ name: 'electron-fetch', response: createFakeResponse(status, someHTML) },
			{ name: 'node-fetch', response: createFakeResponse(200, someJSON) },
			{ name: 'electron-fetch', response: createFakeResponse(status, someHTML) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, telemetryService, experimentationService);
		assert.deepStrictEqual({
			calls: testFetchers.calls.map(c => c.name),
			responseStatus: response.status,
			updatedFetchers: updatedFetchers?.map(fetcher => fetcher.getUserAgentLibrary()),
			updatedKnownBadFetchers: Array.from(updatedKnownBadFetchers ?? []),
		}, {
			calls: ['electron-fetch', 'node-fetch', 'electron-fetch'],
			responseStatus: 200,
			updatedFetchers: ['node-fetch', 'electron-fetch'],
			updatedKnownBadFetchers: ['electron-fetch'],
		});
	});

	test.each([
		{ status: 429, fetchers: ['electron-fetch', 'node-fetch', 'node-http'] },
		{ status: 502, fetchers: ['node-fetch', 'electron-fetch', 'node-http'] },
		{ status: 503, fetchers: ['node-http', 'electron-fetch', 'node-fetch'] },
	])('HTTP $status response from $fetchers.0 does not fall back', async ({ status, fetchers }) => {
		const serverResponse = createFakeResponse(status, someHTML);
		const fetcherSpec = [
			{ name: fetchers[0], response: serverResponse },
			{ name: fetchers[1], response: createFakeResponse(200, someJSON) },
			{ name: fetchers[2], response: createFakeResponse(200, someJSON) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, telemetryService, experimentationService);
		assert.deepStrictEqual({
			calls: testFetchers.calls.map(c => c.name),
			responseIsUnchanged: response === serverResponse,
			responseStatus: response.status,
			responseText: await response.text(),
			updatedFetchers,
			updatedKnownBadFetchers,
		}, {
			calls: [fetchers[0]],
			responseIsUnchanged: true,
			responseStatus: status,
			responseText: someHTML,
			updatedFetchers: undefined,
			updatedKnownBadFetchers: undefined,
		});
	});

	test('HTTP error from fallback fetcher preserves fallback state', async function () {
		const serverResponse = createFakeResponse(503, someJSON);
		const fetcherSpec = [
			{ name: 'electron-fetch', response: new Error('fetcher1 error') },
			{ name: 'node-fetch', response: serverResponse },
			{ name: 'node-http', response: createFakeResponse(200, someJSON) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const spyingTelemetryService = new SpyingTelemetryService();
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
		assert.deepStrictEqual({
			calls: testFetchers.calls.map(c => c.name),
			responseIsUnchanged: response === serverResponse,
			updatedFetchers: updatedFetchers?.map(fetcher => fetcher.getUserAgentLibrary()),
			updatedKnownBadFetchers: Array.from(updatedKnownBadFetchers ?? []),
			telemetryEvents: spyingTelemetryService.getEvents().telemetryServiceEvents.map(event => ({
				eventName: event.eventName,
				properties: event.properties,
				measurements: event.measurements,
			})),
		}, {
			calls: ['electron-fetch', 'node-fetch'],
			responseIsUnchanged: true,
			updatedFetchers: ['node-fetch', 'electron-fetch', 'node-http'],
			updatedKnownBadFetchers: ['electron-fetch'],
			telemetryEvents: [{
				eventName: 'fetcherFallbackFailure',
				properties: {
					attemptedFetchers: 'electron-fetch,node-fetch',
					failureReasons: 'transport-error,503',
				},
				measurements: {
					attemptCount: 2,
				},
			}],
		});
	});

	test('all fetchers throw', async function () {
		const fetcherSpec = [
			{ name: 'fetcher1', response: new Error('fetcher1 error') },
			{ name: 'fetcher2', response: new Error('fetcher2 error') },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const spyingTelemetryService = new SpyingTelemetryService();
		try {
			await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
			assert.fail('Expected to throw');
		} catch (err) {
			assert.ok(err instanceof Error);
			assert.deepStrictEqual({
				message: err.message,
				calls: testFetchers.calls.map(c => c.name),
				telemetryEvents: spyingTelemetryService.getEvents().telemetryServiceEvents.map(event => ({
					eventName: event.eventName,
					properties: event.properties,
					measurements: event.measurements,
				})),
			}, {
				message: 'fetcher1 error',
				calls: fetcherSpec.map(f => f.name),
				telemetryEvents: [{
					eventName: 'fetcherFallbackFailure',
					properties: {
						attemptedFetchers: 'fetcher1,fetcher2',
						failureReasons: 'transport-error,transport-error',
					},
					measurements: {
						attemptCount: 2,
					},
				}],
			});
		}
	});

	test('useFetcher option selects second fetcher', async function () {
		const fetcherSpec = [
			{ name: 'electron-fetch', response: createFakeResponse(200, someJSON) },
			{ name: 'node-fetch', response: createFakeResponse(200, someJSON) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', useFetcher: 'node-fetch' }, knownBadFetchers, configurationService, logService, telemetryService, experimentationService);
		assert.deepStrictEqual(testFetchers.calls.map(c => c.name), ['node-fetch']); // only second fetcher called
		assert.strictEqual(updatedFetchers, undefined);
		assert.strictEqual(updatedKnownBadFetchers, undefined);
		assert.strictEqual(response.status, 200);
		const json = await response.json();
		assert.deepStrictEqual(json, JSON.parse(someJSON));
	});

	test('useFetcher option falls back to first fetcher when requested fetcher is disabled', async function () {
		const fetcherSpec = [
			{ name: 'electron-fetch', response: createFakeResponse(200, someJSON) },
			{ name: 'node-fetch', response: createFakeResponse(200, someJSON) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const configServiceWithDisabledNodeFetch = new InMemoryConfigurationService(
			configurationService,
			new Map([[ConfigKey.Shared.DebugUseNodeFetchFetcher, false]])
		);
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', useFetcher: 'node-fetch' }, knownBadFetchers, configServiceWithDisabledNodeFetch, logService, telemetryService, experimentationService);
		assert.deepStrictEqual(testFetchers.calls.map(c => c.name), ['electron-fetch']); // first fetcher used instead
		assert.strictEqual(updatedFetchers, undefined);
		assert.strictEqual(updatedKnownBadFetchers, undefined);
		assert.strictEqual(response.status, 200);
		const json = await response.json();
		assert.deepStrictEqual(json, JSON.parse(someJSON));
	});

	test('useFetcher option falls back to first fetcher when requested fetcher is known bad', async function () {
		const fetcherSpec = [
			{ name: 'electron-fetch', response: createFakeResponse(200, someJSON) },
			{ name: 'node-fetch', response: createFakeResponse(200, someJSON) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const knownBadFetchersWithNodeFetch = new Set<FetcherId>(['node-fetch']);
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', useFetcher: 'node-fetch' }, knownBadFetchersWithNodeFetch, configurationService, logService, telemetryService, experimentationService);
		assert.deepStrictEqual(testFetchers.calls.map(c => c.name), ['electron-fetch']); // first fetcher used instead
		assert.strictEqual(updatedFetchers, undefined);
		assert.strictEqual(updatedKnownBadFetchers, undefined);
		assert.strictEqual(response.status, 200);
		const json = await response.json();
		assert.deepStrictEqual(json, JSON.parse(someJSON));
	});
});

function createTestFetchers(fetcherSpecs: Array<{ name: string; response: Response | Error }>) {
	const calls: Array<{ name: string; url: string; options: FetchOptions }> = [];
	const responseQueues = new Map<string, (Response | Error)[]>();
	const order: string[] = [];
	for (const spec of fetcherSpecs) {
		let list = responseQueues.get(spec.name);
		if (!list) {
			list = [];
			responseQueues.set(spec.name, list);
			order.push(spec.name); // record first appearance order
		}
		list.push(spec.response);
	}
	const fetchers: IFetcher[] = [];
	for (const name of order) {
		const queue = responseQueues.get(name)!;
		fetchers.push({
			getUserAgentLibrary: () => name,
			fetch: async (url: string, options: FetchOptions) => {
				calls.push({ name, url, options });
				const next = queue.shift();
				if (!next) {
					throw new Error('No more queued responses for ' + name);
				}
				if (next instanceof Error) {
					throw next;
				}
				return next;
			},
			fetchWithPagination: async <T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]> => {
				throw new Error('Method not implemented.');
			},
			disconnectAll: async () => { },
			makeAbortController: () => { throw new Error('Method not implemented.'); },
			isAbortError: () => false,
			isInternetDisconnectedError: () => false,
			isFetcherError: () => false,
			isNetworkProcessCrashedError: () => false,
			getUserMessageForFetcherError: () => 'error'
		});
	}
	return { fetchers, calls };
}

function createFakeResponse(statusCode: number, content: string) {
	return Response.fromText(
		statusCode,
		'status text',
		new FakeHeaders(),
		content,
		'test-stub'
	);
}
