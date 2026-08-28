/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { afterEach, suite, test, vi } from 'vitest';
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
	let cleanupTime = Date.now();

	afterEach(async () => {
		cleanupTime += 24 * 60 * 60 * 1000;
		vi.useFakeTimers();
		vi.setSystemTime(cleanupTime);
		try {
			const testFetchers = createTestFetchers([
				{ name: 'fetcher1', response: createFakeResponse(200, someJSON) },
				{ name: 'fetcher2', response: createFakeResponse(200, someJSON) },
			]);
			await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, new SpyingTelemetryService(), experimentationService);
		} finally {
			vi.useRealTimers();
		}
	});

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

	test('terminal responses stop fallback, preserve fallback state, and aggregate telemetry', async function () {
		vi.useFakeTimers();
		cleanupTime += 24 * 60 * 60 * 1000;
		vi.setSystemTime(cleanupTime);
		const primingTelemetryService = new SpyingTelemetryService();
		const primingFetchers = createTestFetchers([
			{ name: 'fetcher1', response: createFakeResponse(429, someJSON) },
			{ name: 'fetcher2', response: createFakeResponse(200, someJSON) },
		]);
		await fetchWithFallbacks(primingFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, primingTelemetryService, experimentationService);
		vi.advanceTimersByTime(16 * 60 * 1000);
		const createSuccessfulFetchers = () => createTestFetchers([
			{ name: 'fetcher1', response: createFakeResponse(200, someJSON) },
			{ name: 'fetcher2', response: createFakeResponse(200, someJSON) },
		]);
		await fetchWithFallbacks(createSuccessfulFetchers().fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, primingTelemetryService, experimentationService);
		const spyingTelemetryService = new SpyingTelemetryService();
		try {
			const primaryResults = [];
			for (const { status, fetchers } of [
				{ status: 429, fetchers: ['electron-fetch', 'node-fetch', 'node-http'] },
				{ status: 502, fetchers: ['node-fetch', 'electron-fetch', 'node-http'] },
				{ status: 503, fetchers: ['node-http', 'electron-fetch', 'node-fetch'] },
			]) {
				const serverResponse = createFakeResponse(status, someHTML);
				const testFetchers = createTestFetchers([
					{ name: fetchers[0], response: serverResponse },
					{ name: fetchers[1], response: createFakeResponse(200, someJSON) },
					{ name: fetchers[2], response: createFakeResponse(200, someJSON) },
				]);
				const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
				primaryResults.push({
					calls: testFetchers.calls.map(c => c.name),
					responseIsUnchanged: response === serverResponse,
					updatedFetchers,
					updatedKnownBadFetchers,
				});
			}

			const fallbackResponse = createFakeResponse(503, someJSON);
			const fallbackTestFetchers = createTestFetchers([
				{ name: 'electron-fetch', response: createFakeResponse(200, someHTML) },
				{ name: 'node-fetch', response: fallbackResponse },
				{ name: 'node-http', response: createFakeResponse(200, someJSON) },
			]);
			const fallbackResult = await fetchWithFallbacks(fallbackTestFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
			for (let i = 0; i < 16; i++) {
				const testFetchers = createTestFetchers([
					{ name: 'electron-fetch', response: new Error(`terminal error ${i} ${'x'.repeat(1024)}`) },
					{ name: 'node-fetch', response: createFakeResponse(503, someJSON) },
				]);
				await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
			}
			const eventsBeforeInterval = [...spyingTelemetryService.getEvents().telemetryServiceEvents];

			vi.advanceTimersByTime(15 * 60 * 1000 + 1);
			const successfulFetchers = createSuccessfulFetchers();
			await fetchWithFallbacks(successfulFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
			const telemetryEvents = spyingTelemetryService.getEvents().telemetryServiceEvents;
			const properties = telemetryEvents[0].properties;
			if (!properties || !('errors' in properties) || typeof properties.errors !== 'string') {
				assert.fail('Expected an errors telemetry property');
			}
			const terminalErrorsProperty = properties.errors;
			const terminalErrors: Record<string, number> = JSON.parse(terminalErrorsProperty);

			assert.deepStrictEqual({
				primaryResults,
				fallbackResult: {
					calls: fallbackTestFetchers.calls.map(c => c.name),
					responseIsUnchanged: fallbackResult.response === fallbackResponse,
					updatedFetchers: fallbackResult.updatedFetchers?.map(fetcher => fetcher.getUserAgentLibrary()),
					updatedKnownBadFetchers: Array.from(fallbackResult.updatedKnownBadFetchers ?? []),
				},
				eventsBeforeInterval,
				eventCount: telemetryEvents.length,
				eventName: telemetryEvents[0].eventName,
				knownTerminalErrors: {
					'electron-fetch: 429 status text': terminalErrors['electron-fetch: 429 status text'],
					'node-fetch: 502 status text': terminalErrors['node-fetch: 502 status text'],
					'node-http: 503 status text': terminalErrors['node-http: 503 status text'],
					'electron-fetch: invalid-json': terminalErrors['electron-fetch: invalid-json'],
					'node-fetch: 503 status text': terminalErrors['node-fetch: 503 status text'],
				},
				hasOverflow: terminalErrors['<other>'] > 0,
				allFailuresAccountedFor: Object.values(terminalErrors).reduce((total, count) => total + count, 0),
				propertyWithinTelemetryLimit: terminalErrorsProperty.length <= 8192,
			}, {
				primaryResults: [
					{ calls: ['electron-fetch'], responseIsUnchanged: true, updatedFetchers: undefined, updatedKnownBadFetchers: undefined },
					{ calls: ['node-fetch'], responseIsUnchanged: true, updatedFetchers: undefined, updatedKnownBadFetchers: undefined },
					{ calls: ['node-http'], responseIsUnchanged: true, updatedFetchers: undefined, updatedKnownBadFetchers: undefined },
				],
				fallbackResult: {
					calls: ['electron-fetch', 'node-fetch'],
					responseIsUnchanged: true,
					updatedFetchers: ['node-fetch', 'electron-fetch', 'node-http'],
					updatedKnownBadFetchers: ['electron-fetch'],
				},
				eventsBeforeInterval: [],
				eventCount: 1,
				eventName: 'fetcherTerminalResponse',
				knownTerminalErrors: {
					'electron-fetch: 429 status text': 1,
					'node-fetch: 502 status text': 1,
					'node-http: 503 status text': 1,
					'electron-fetch: invalid-json': 1,
					'node-fetch: 503 status text': 17,
				},
				hasOverflow: true,
				allFailuresAccountedFor: 37,
				propertyWithinTelemetryLimit: true,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test('first fetcher is retried to confirm failure', async function () {
		const fetcherSpec = [
			{ name: 'fetcher1', response: createFakeResponse(200, someHTML) },
			{ name: 'fetcher2', response: createFakeResponse(200, someJSON) },
			{ name: 'fetcher1', response: createFakeResponse(200, someHTML) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, telemetryService, experimentationService);
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
	});

	test('aggregates all-failed errors and reports them after 15 minutes', async function () {
		vi.useFakeTimers();
		cleanupTime += 24 * 60 * 60 * 1000;
		vi.setSystemTime(cleanupTime);
		const primingTelemetryService = new SpyingTelemetryService();
		const primingFetchers = createTestFetchers([
			{ name: 'fetcher1', response: createFakeResponse(200, someHTML) },
			{ name: 'fetcher2', response: new Error('priming error') },
		]);
		await fetchWithFallbacks(primingFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, primingTelemetryService, experimentationService);
		vi.advanceTimersByTime(16 * 60 * 1000);
		const createSuccessfulFetchers = () => createTestFetchers([
			{ name: 'fetcher1', response: createFakeResponse(200, someJSON) },
			{ name: 'fetcher2', response: createFakeResponse(200, someJSON) },
		]);
		await fetchWithFallbacks(createSuccessfulFetchers().fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, primingTelemetryService, experimentationService);
		const spyingTelemetryService = new SpyingTelemetryService();
		const failingFetcherSpec = [
			{ name: 'fetcher1', response: createFakeResponse(200, someHTML) },
			{ name: 'fetcher2', response: new Error('connect ETIMEDOUT proxy.fictional.example.com:443') },
		];
		try {
			for (let i = 0; i < 2; i++) {
				const testFetchers = createTestFetchers(failingFetcherSpec);
				await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
			}
			const escapedErrorFetchers = createTestFetchers([
				{ name: 'fetcher1', response: createFakeResponse(200, someHTML) },
				{ name: 'fetcher2', response: new Error('quoted "error" with \\ slash') },
			]);
			await fetchWithFallbacks(escapedErrorFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
			for (let i = 0; i < 52; i++) {
				const testFetchers = createTestFetchers([
					{ name: 'fetcher1', response: createFakeResponse(200, someHTML) },
					{ name: 'fetcher2', response: new Error(`unique error ${i} ${'x'.repeat(1024)}`) },
				]);
				await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
			}
			const eventsBeforeInterval = [...spyingTelemetryService.getEvents().telemetryServiceEvents];

			vi.advanceTimersByTime(15 * 60 * 1000);
			await fetchWithFallbacks(createSuccessfulFetchers().fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
			const eventsAtInterval = [...spyingTelemetryService.getEvents().telemetryServiceEvents];
			vi.advanceTimersByTime(1);
			await fetchWithFallbacks(createSuccessfulFetchers().fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);
			const eventsAfterInterval = spyingTelemetryService.getEvents().telemetryServiceEvents;
			assert.deepStrictEqual({
				primingEventCount: primingTelemetryService.getEvents().telemetryServiceEvents.length,
				eventsBeforeInterval,
				eventsAtInterval,
				eventCountAfterInterval: eventsAfterInterval.length,
			}, {
				primingEventCount: 1,
				eventsBeforeInterval: [],
				eventsAtInterval: [],
				eventCountAfterInterval: 1,
			});
			const properties = eventsAfterInterval[0].properties;
			if (!properties || !('errors' in properties) || typeof properties.errors !== 'string') {
				assert.fail('Expected an errors telemetry property');
			}
			const errorsProperty = properties.errors;
			const errors: Record<string, number> = JSON.parse(errorsProperty);
			const truncatedError = Object.keys(errors).find(error => error.startsWith('fetcher2: unique error 0 '));

			vi.advanceTimersByTime(16 * 60 * 1000);
			await fetchWithFallbacks(createSuccessfulFetchers().fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, spyingTelemetryService, experimentationService);

			assert.deepStrictEqual({
				eventsBeforeInterval,
				eventsAtInterval,
				eventName: eventsAfterInterval[0].eventName,
				errorKeyCount: Object.keys(errors).length,
				invalidJSONCount: errors['fetcher1: invalid-json'],
				sanitizedNetworkErrorCount: errors['fetcher2: connect ETIMEDOUT <host>:443'],
				escapedErrorCount: errors['fetcher2: quoted "error" with \\ slash'],
				truncatedErrorLength: truncatedError?.length,
				hasOverflow: errors['<other>'] > 0,
				allFailuresAccountedFor: Object.values(errors).reduce((total: number, count) => total + count, 0),
				propertyWithinTelemetryLimit: errorsProperty.length <= 8192,
				eventCountAfterEmptyInterval: spyingTelemetryService.getEvents().telemetryServiceEvents.length,
			}, {
				eventsBeforeInterval: [],
				eventsAtInterval: [],
				eventName: 'fetcherAllFailed',
				errorKeyCount: 11,
				invalidJSONCount: 55,
				sanitizedNetworkErrorCount: 2,
				escapedErrorCount: 1,
				truncatedErrorLength: 1024,
				hasOverflow: true,
				allFailuresAccountedFor: 110,
				propertyWithinTelemetryLimit: true,
				eventCountAfterEmptyInterval: 1,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test('no fetcher succeeds', async function () {
		const fetcherSpec = [
			{ name: 'fetcher1', response: createFakeResponse(407, someHTML) },
			{ name: 'fetcher2', response: createFakeResponse(401, someJSON) },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		const { response, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, telemetryService, experimentationService);
		assert.deepStrictEqual(testFetchers.calls.map(c => c.name), fetcherSpec.map(f => f.name));
		assert.strictEqual(updatedFetchers, undefined);
		assert.strictEqual(updatedKnownBadFetchers, undefined);
		assert.strictEqual(response.status, 407);
		const text = await response.text();
		assert.deepStrictEqual(text, someHTML);
	});

	test('all fetchers throw', async function () {
		const fetcherSpec = [
			{ name: 'fetcher1', response: new Error('fetcher1 error') },
			{ name: 'fetcher2', response: new Error('fetcher2 error') },
		];
		const testFetchers = createTestFetchers(fetcherSpec);
		try {
			await fetchWithFallbacks(testFetchers.fetchers, 'https://example.com', { callSite: 'test', expectJSON: true, retryFallbacks: true }, knownBadFetchers, configurationService, logService, telemetryService, experimentationService);
			assert.fail('Expected to throw');
		} catch (err) {
			assert.ok(err instanceof Error);
			assert.strictEqual(err.message, 'fetcher1 error');
			assert.deepStrictEqual(testFetchers.calls.map(c => c.name), fetcherSpec.map(f => f.name));
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
