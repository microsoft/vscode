/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { FakeHeaders } from '../../../test/node/fetcher';
import { TestLogService } from '../../../testing/common/testLogService';
import { FetchOptions, IAbortController, PaginationOptions, Response } from '../../common/fetcherService';
import { IFetcher } from '../../common/networking';
import { FetcherService } from '../fetcherServiceImpl';

describe('FetcherService network process crash handling', () => {
	let logService: TestLogService;
	let configurationService: InMemoryConfigurationService;
	let experimentationService: NullExperimentationService;

	beforeEach(() => {
		logService = new TestLogService();
		configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		experimentationService = new NullExperimentationService();
	});

	function createFetcherService(fetchers: IFetcher[]): FetcherService {
		// Use the constructor with a single fetcher, then override _availableFetchers
		// to inject multiple fetchers for testing.
		const service = new FetcherService(
			undefined,
			logService,
			{ machineId: '', sessionId: '', vscodeVersion: '', getName: () => 'test', getVersion: () => '0.0.0', getBuildType: () => 'development' as any } as any,
			configurationService,
		);
		service.setExperimentationService(experimentationService);
		// Inject the fetchers directly
		(service as any)._availableFetchers = fetchers;
		return service;
	}

	function createMockFetcher(name: string, opts?: {
		responses?: (Response | Error)[];
		isNetworkProcessCrashedError?: (e: any) => boolean;
		isFetcherError?: (e: any) => boolean;
	}): IFetcher {
		const queue = [...(opts?.responses ?? [])];
		return {
			getUserAgentLibrary: () => name,
			fetch: async (_url: string, _options: FetchOptions) => {
				const next = queue.shift();
				if (!next) {
					throw new Error(`No more queued responses for ${name}`);
				}
				if (next instanceof Error) {
					throw next;
				}
				return next;
			},
			fetchWithPagination: async <T>(_baseUrl: string, _options: PaginationOptions<T>): Promise<T[]> => {
				throw new Error('Method not implemented.');
			},
			disconnectAll: async () => { },
			makeAbortController: () => ({ signal: new AbortController().signal, abort: () => { } }) as IAbortController,
			isAbortError: () => false,
			isInternetDisconnectedError: () => false,
			isFetcherError: opts?.isFetcherError ?? (() => false),
			isNetworkProcessCrashedError: opts?.isNetworkProcessCrashedError ?? (() => false),
			getUserMessageForFetcherError: () => 'error',
		};
	}

	function createOkResponse(): Response {
		return Response.fromText(200, 'OK', new FakeHeaders(), '{}', 'test-stub');
	}

	function createCrashError(): Error & { chromiumDetails: { is_request_error: boolean; network_process_crashed: boolean } } {
		const err = new Error('net::ERR_FAILED') as any;
		err.chromiumDetails = { is_request_error: true, network_process_crashed: true };
		return err;
	}

	describe('when FallbackNodeFetchOnNetworkProcessCrash is enabled', () => {
		beforeEach(() => {
			configurationService.setConfig(ConfigKey.TeamInternal.FallbackNodeFetchOnNetworkProcessCrash, true);
		});

		it('retries once and demotes only if the retry also crashes', async () => {
			const crashError = createCrashError();
			const electronFetcher = createMockFetcher('electron-fetch', {
				responses: [crashError, crashError], // initial + retry both crash
				isNetworkProcessCrashedError: (e) => e === crashError,
				isFetcherError: (e) => e?.message?.startsWith('net::'),
			});
			const nodeFetcher = createMockFetcher('node-fetch', {
				responses: [createOkResponse()],
			});

			const service = createFetcherService([electronFetcher, nodeFetcher]);

			// First request: crashes, retries once, retry also crashes => demotes
			await expect(service.fetch('https://example.com', { callSite: 'test' })).rejects.toThrow('net::ERR_FAILED');

			// After both attempts fail, node-fetch should be the primary fetcher
			expect(service.getUserAgentLibrary()).toBe('node-fetch');
		});

		it('succeeds on retry without demoting', async () => {
			const crashError = createCrashError();
			const electronFetcher = createMockFetcher('electron-fetch', {
				responses: [crashError, createOkResponse()], // initial crashes, retry succeeds
				isNetworkProcessCrashedError: (e) => e === crashError,
				isFetcherError: (e) => e?.message?.startsWith('net::'),
			});
			const nodeFetcher = createMockFetcher('node-fetch', {
				responses: [createOkResponse()],
			});

			const service = createFetcherService([electronFetcher, nodeFetcher]);

			// Request crashes, but retry succeeds
			const response = await service.fetch('https://example.com', { callSite: 'test' });
			expect(response.status).toBe(200);

			// electron-fetch should still be the primary fetcher (not demoted)
			expect(service.getUserAgentLibrary()).toBe('electron-fetch');
		});

		it('subsequent requests go through the new primary fetcher', async () => {
			const crashError = createCrashError();
			const electronFetcher = createMockFetcher('electron-fetch', {
				responses: [crashError, crashError], // initial + retry both crash
				isNetworkProcessCrashedError: (e) => e === crashError,
				isFetcherError: (e) => e?.message?.startsWith('net::'),
			});
			const nodeFetcher = createMockFetcher('node-fetch', {
				responses: [createOkResponse(), createOkResponse()],
			});

			const service = createFetcherService([electronFetcher, nodeFetcher]);

			// First request: crashes, retry also crashes, demotes electron-fetch
			await expect(service.fetch('https://example.com', { callSite: 'test' })).rejects.toThrow('net::ERR_FAILED');

			// Second request: should succeed via node-fetch
			const response = await service.fetch('https://example.com', { callSite: 'test' });
			expect(response.status).toBe(200);
		});

		it('error classification still works after demotion', async () => {
			const crashError = createCrashError();
			const electronFetcher = createMockFetcher('electron-fetch', {
				responses: [crashError, crashError], // initial + retry both crash
				isNetworkProcessCrashedError: (e) => e === crashError,
				isFetcherError: (e) => e?.message?.startsWith('net::'),
			});
			const nodeFetcher = createMockFetcher('node-fetch', {
				responses: [createOkResponse()],
			});

			const service = createFetcherService([electronFetcher, nodeFetcher]);

			// Trigger crash + retry failure to demote electron-fetch
			await expect(service.fetch('https://example.com', { callSite: 'test' })).rejects.toThrow();

			// After demotion, the service should still classify the crash error correctly
			// even though node-fetch is now the primary fetcher
			expect(service.isFetcherError(crashError)).toBe(true);
			expect(service.isNetworkProcessCrashedError(crashError)).toBe(true);
		});
	});

	describe('when FallbackNodeFetchOnNetworkProcessCrash is disabled', () => {
		beforeEach(() => {
			configurationService.setConfig(ConfigKey.TeamInternal.FallbackNodeFetchOnNetworkProcessCrash, false);
		});

		it('does NOT demote the crashed fetcher', async () => {
			const crashError = createCrashError();
			const electronFetcher = createMockFetcher('electron-fetch', {
				responses: [crashError, crashError], // initial + retry triggered by fetchWithFallbacks crash-retry logic (network process crash)
				isNetworkProcessCrashedError: (e) => e === crashError,
				isFetcherError: (e) => e?.message?.startsWith('net::'),
			});
			const nodeFetcher = createMockFetcher('node-fetch', {
				responses: [createOkResponse()],
			});

			const service = createFetcherService([electronFetcher, nodeFetcher]);

			// Request crashes, retry also crashes, but flag is disabled so no demotion
			await expect(service.fetch('https://example.com', { callSite: 'test' })).rejects.toThrow('net::ERR_FAILED');

			// electron-fetch should still be the primary fetcher (not demoted)
			expect(service.getUserAgentLibrary()).toBe('electron-fetch');
		});
	});

	describe('when experimentation service is not set', () => {
		it('does NOT demote the crashed fetcher', async () => {
			const crashError = createCrashError();
			const electronFetcher = createMockFetcher('electron-fetch', {
				responses: [crashError, crashError], // initial + retry
				isNetworkProcessCrashedError: (e) => e === crashError,
				isFetcherError: (e) => e?.message?.startsWith('net::'),
			});
			const nodeFetcher = createMockFetcher('node-fetch', {
				responses: [createOkResponse()],
			});

			// Create service WITHOUT setting experimentation service
			const service = new FetcherService(
				undefined,
				logService,
				{ machineId: '', sessionId: '', vscodeVersion: '', getName: () => 'test', getVersion: () => '0.0.0', getBuildType: () => 'development' as any } as any,
				configurationService,
			);
			(service as any)._availableFetchers = [electronFetcher, nodeFetcher];
			// Explicitly do NOT call service.setExperimentationService()

			await expect(service.fetch('https://example.com', { callSite: 'test' })).rejects.toThrow('net::ERR_FAILED');

			// Should not demote without experimentation service
			expect(service.getUserAgentLibrary()).toBe('electron-fetch');
		});
	});
});
