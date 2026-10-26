/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { isCancellationError } from '../../../../util/vs/base/common/errors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICopilotTokenManager } from '../../../authentication/common/copilotTokenManager';
import { setCopilotToken } from '../../../authentication/common/staticGitHubAuthenticationService';
import { getEditorVersionHeaders, IEnvService } from '../../../env/common/envService';
import { FetchOptions, IAbortController, IFetcherService, PaginationOptions, Response, WebSocketConnection } from '../../../networking/common/fetcherService';
import { createFakeResponse } from '../../../test/node/fetcher';
import { createPlatformServices } from '../../../test/node/services';
import { ProxyModelsService } from '../../node/proxyModelsService';

class TestCopilotTokenManager implements ICopilotTokenManager {
	declare readonly _serviceBrand: undefined;
	readonly onDidCopilotTokenRefresh = Event.None;

	constructor(public token: CopilotToken) { }

	async getCopilotToken(): Promise<CopilotToken> {
		return this.token;
	}

	resetCopilotToken(): void { }
}

class ControllableFetcherService implements IFetcherService {
	declare readonly _serviceBrand: undefined;
	readonly onDidFetch = Event.None;
	readonly onDidCompleteFetch = Event.None;
	readonly requests: { url: string; options: FetchOptions }[] = [];
	abortCount = 0;

	private readonly _responses: DeferredPromise<Response>[] = [];
	private readonly _requestWaiters = new Map<number, DeferredPromise<void>>();

	queueResponse(status: number, body: unknown): void {
		const response = new DeferredPromise<Response>();
		void response.complete(createFakeResponse(status, body));
		this._responses.push(response);
	}

	queueDeferredResponse(): DeferredPromise<Response> {
		const response = new DeferredPromise<Response>();
		this._responses.push(response);
		return response;
	}

	waitForRequestCount(count: number): Promise<void> {
		if (this.requests.length >= count) {
			return Promise.resolve();
		}
		let waiter = this._requestWaiters.get(count);
		if (!waiter) {
			waiter = new DeferredPromise<void>();
			this._requestWaiters.set(count, waiter);
		}
		return waiter.p;
	}

	getUserAgentLibrary(): string {
		return 'test';
	}

	fetch(url: string, options: FetchOptions): Promise<Response> {
		const response = this._responses.shift();
		if (!response) {
			throw new Error('No response queued');
		}

		this.requests.push({ url, options });
		for (const [count, waiter] of this._requestWaiters) {
			if (this.requests.length >= count) {
				void waiter.complete();
				this._requestWaiters.delete(count);
			}
		}
		options.signal?.addEventListener('abort', () => {
			this.abortCount++;
			void response.cancel();
		});
		return response.p;
	}

	createWebSocket(): WebSocketConnection {
		throw new Error('Method not implemented.');
	}

	disconnectAll(): Promise<unknown> {
		throw new Error('Method not implemented.');
	}

	makeAbortController(): IAbortController {
		return new AbortController();
	}

	isAbortError(error: unknown): boolean {
		return isCancellationError(error);
	}

	isInternetDisconnectedError(): boolean {
		return false;
	}

	isFetcherError(): boolean {
		return false;
	}

	isNetworkProcessCrashedError(): boolean {
		return false;
	}

	getUserMessageForFetcherError(): string {
		throw new Error('Method not implemented.');
	}

	fetchWithPagination<T>(_baseUrl: string, _options: PaginationOptions<T>): Promise<T[]> {
		throw new Error('Method not implemented.');
	}
}

function createService(fetcher: ControllableFetcherService, tokenManager: TestCopilotTokenManager) {
	const testingServiceCollection = createPlatformServices();
	testingServiceCollection.define(IFetcherService, fetcher);
	testingServiceCollection.define(ICopilotTokenManager, tokenManager);
	const accessor = testingServiceCollection.createTestingAccessor();
	const service = accessor.get(IInstantiationService).createInstance(ProxyModelsService);
	return { accessor, service };
}

suite('ProxyModelsService', function () {

	test('includes editor-related headers when fetching the models list', async function () {
		const tokenManager = new TestCopilotTokenManager(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
		const fetcher = new ControllableFetcherService();
		fetcher.queueResponse(200, { models: [] });
		const { accessor, service } = createService(fetcher, tokenManager);
		try {
			await service.ensureModelsLoaded(CancellationToken.None);

			assert.deepStrictEqual({
				hasAuthorization: typeof fetcher.requests[0].options.headers?.Authorization === 'string',
				editorHeaders: {
					'Editor-Version': fetcher.requests[0].options.headers?.['Editor-Version'],
					'Editor-Plugin-Version': fetcher.requests[0].options.headers?.['Editor-Plugin-Version'],
				},
			}, {
				hasAuthorization: true,
				editorHeaders: getEditorVersionHeaders(accessor.get(IEnvService)),
			});
		} finally {
			service.dispose();
			accessor.dispose();
		}
	});

	test('shares concurrent loads and reuses a successful result', async function () {
		const tokenManager = new TestCopilotTokenManager(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
		const fetcher = new ControllableFetcherService();
		const response = fetcher.queueDeferredResponse();
		const { accessor, service } = createService(fetcher, tokenManager);
		try {
			const first = service.ensureModelsLoaded(CancellationToken.None);
			const second = service.ensureModelsLoaded(CancellationToken.None);
			await fetcher.waitForRequestCount(1);
			await response.complete(createFakeResponse(200, { models: [] }));
			await Promise.all([first, second]);
			await service.ensureModelsLoaded(CancellationToken.None);

			assert.deepStrictEqual({
				requestCount: fetcher.requests.length,
				modelsLoaded: service.modelsLoaded,
			}, {
				requestCount: 1,
				modelsLoaded: true,
			});
		} finally {
			service.dispose();
			accessor.dispose();
		}
	});

	test('retries after a failed load', async function () {
		const tokenManager = new TestCopilotTokenManager(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
		const fetcher = new ControllableFetcherService();
		const failedResponse = fetcher.queueDeferredResponse();
		fetcher.queueResponse(200, { models: [] });
		const { accessor, service } = createService(fetcher, tokenManager);
		try {
			setCopilotToken(accessor.get(IAuthenticationService), tokenManager.token);
			await fetcher.waitForRequestCount(1);
			await failedResponse.complete(createFakeResponse(500, {}));
			await new Promise(resolve => setTimeout(resolve, 0));
			await service.ensureModelsLoaded(CancellationToken.None);

			assert.deepStrictEqual({
				requestCount: fetcher.requests.length,
				modelsLoaded: service.modelsLoaded,
			}, {
				requestCount: 2,
				modelsLoaded: true,
			});
		} finally {
			service.dispose();
			accessor.dispose();
		}
	});

	test('cancelling one caller does not abort a shared load', async function () {
		const tokenManager = new TestCopilotTokenManager(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
		const fetcher = new ControllableFetcherService();
		const response = fetcher.queueDeferredResponse();
		const { accessor, service } = createService(fetcher, tokenManager);
		const cancellationSource = new CancellationTokenSource();
		try {
			const cancelled = service.ensureModelsLoaded(cancellationSource.token);
			const active = service.ensureModelsLoaded(CancellationToken.None);
			await fetcher.waitForRequestCount(1);
			cancellationSource.cancel();
			await assert.rejects(cancelled, error => isCancellationError(error));

			assert.deepStrictEqual({
				requestCount: fetcher.requests.length,
				abortCount: fetcher.abortCount,
			}, {
				requestCount: 1,
				abortCount: 0,
			});

			await response.complete(createFakeResponse(200, { models: [] }));
			await active;
		} finally {
			cancellationSource.dispose();
			service.dispose();
			accessor.dispose();
		}
	});

	test('follows a rotated token without applying the stale result', async function () {
		const firstToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'first-token' }));
		const secondToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'second-token' }));
		const tokenManager = new TestCopilotTokenManager(firstToken);
		const fetcher = new ControllableFetcherService();
		const firstResponse = fetcher.queueDeferredResponse();
		const secondResponse = fetcher.queueDeferredResponse();
		const { accessor, service } = createService(fetcher, tokenManager);
		try {
			const loading = service.ensureModelsLoaded(CancellationToken.None);
			await fetcher.waitForRequestCount(1);

			tokenManager.token = secondToken;
			setCopilotToken(accessor.get(IAuthenticationService), secondToken);
			await fetcher.waitForRequestCount(2);

			await firstResponse.complete(createFakeResponse(200, {
				models: [{ serviceType: 'NESChat', name: 'stale-model', provider: 'test', capabilities: { promptStrategy: 'xtab275' } }]
			}));
			await secondResponse.complete(createFakeResponse(200, {
				models: [{ serviceType: 'NESChat', name: 'current-model', provider: 'test', capabilities: { promptStrategy: 'patchBased02Unified' } }]
			}));
			await loading;

			assert.deepStrictEqual({
				requestCount: fetcher.requests.length,
				modelNames: service.models?.models.map(model => model.name),
			}, {
				requestCount: 2,
				modelNames: ['current-model'],
			});
		} finally {
			service.dispose();
			accessor.dispose();
		}
	});

	test('stops retrying when the token never stabilizes', async function () {
		const tokens = ['first', 'second', 'third', 'fourth'].map(token =>
			new CopilotToken(createTestExtendedTokenInfo({ token: `${token}-token` }))
		);
		const tokenManager = new TestCopilotTokenManager(tokens[0]);
		const fetcher = new ControllableFetcherService();
		const responses = tokens.map(() => fetcher.queueDeferredResponse());
		const { accessor, service } = createService(fetcher, tokenManager);
		try {
			const loading = service.ensureModelsLoaded(CancellationToken.None);
			const rejected = assert.rejects(loading, /Copilot token changed during 3 consecutive model load attempts/);

			for (let i = 0; i < 3; i++) {
				await fetcher.waitForRequestCount(i + 1);
				tokenManager.token = tokens[i + 1];
				setCopilotToken(accessor.get(IAuthenticationService), tokens[i + 1]);
				await fetcher.waitForRequestCount(i + 2);
				await responses[i].complete(createFakeResponse(200, { models: [] }));
				await new Promise(resolve => setTimeout(resolve, 0));
			}

			await rejected;
		} finally {
			service.dispose();
			accessor.dispose();
		}
	});

	test('disposal aborts an in-flight load', async function () {
		const tokenManager = new TestCopilotTokenManager(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
		const fetcher = new ControllableFetcherService();
		fetcher.queueDeferredResponse();
		const { accessor, service } = createService(fetcher, tokenManager);
		const loading = service.ensureModelsLoaded(CancellationToken.None);
		await fetcher.waitForRequestCount(1);

		service.dispose();
		await assert.rejects(loading, error => isCancellationError(error));
		assert.strictEqual(fetcher.abortCount, 1);
		accessor.dispose();
	});
});
