/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType, type RequestMetadata } from '@vscode/copilot-api';
import assert from 'assert';
import { suite, test } from 'vitest';
import { Event } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IEnvService } from '../../../env/common/envService';
import { createFakeResponse } from '../../../test/node/fetcher';
import { createPlatformServices } from '../../../test/node/services';
import { FetchOptions, IAbortController, IFetcherService, PaginationOptions, Response, WebSocketConnection } from '../../common/fetcherService';
import { IEndpoint, isCAPIEndpoint, isCAPIRequestMetadata, postRequest } from '../../common/networking';

suite('Networking test Suite', function () {

	let headerBuffer: { [name: string]: string } | undefined;

	class StaticFetcherService implements IFetcherService {
		declare readonly _serviceBrand: undefined;
		readonly onDidFetch = Event.None;
		readonly onDidCompleteFetch = Event.None;

		getUserAgentLibrary(): string {
			return 'test';
		}
		fetch(url: string, options: FetchOptions): Promise<Response> {
			headerBuffer = options.headers;
			return Promise.resolve(createFakeResponse(200));
		}
		createWebSocket(_url: string): WebSocketConnection {
			throw new Error('Method not implemented.');
		}
		disconnectAll(): Promise<unknown> {
			throw new Error('Method not implemented.');
		}
		makeAbortController(): IAbortController {
			throw new Error('Method not implemented.');
		}
		isAbortError(e: any): boolean {
			throw new Error('Method not implemented.');
		}
		isInternetDisconnectedError(e: any): boolean {
			throw new Error('Method not implemented.');
		}
		isFetcherError(e: any): boolean {
			throw new Error('Method not implemented.');
		}
		isNetworkProcessCrashedError(e: any): boolean {
			throw new Error('Method not implemented.');
		}
		getUserMessageForFetcherError(err: any): string {
			throw new Error('Method not implemented.');
		}
		fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]> {
			throw new Error('Method not implemented.');
		}
	}

	test('each request contains editor info headers', async function () {
		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, new StaticFetcherService());
		const accessor = testingServiceCollection.createTestingAccessor();
		await accessor.get(IInstantiationService).invokeFunction(postRequest, {
			endpointOrUrl: { type: RequestType.Models },
			secretKey: '',
			intent: 'test',
			requestId: 'id',
		});

		assert.strictEqual(headerBuffer!['VScode-SessionId'], 'test-session');
		assert.strictEqual(headerBuffer!['VScode-MachineId'], 'test-machine');
		assert.strictEqual(headerBuffer!['Editor-Version'], `vscode/test-version`);
	});

	test('Proxy* requests contain editor info headers even though the copilot-api mixin skips them', async function () {
		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, new StaticFetcherService());
		const accessor = testingServiceCollection.createTestingAccessor();
		const envService = accessor.get(IEnvService);
		await accessor.get(IInstantiationService).invokeFunction(postRequest, {
			endpointOrUrl: { type: RequestType.ProxyChatCompletions },
			secretKey: '',
			intent: 'test',
			requestId: 'id',
		});

		// The @vscode/copilot-api mixin only stamps editor headers for its allow-listed request types
		// and skips Proxy* types, so `networkRequest` injects the real editor identity for them instead.
		assert.deepStrictEqual(
			{
				'Editor-Version': headerBuffer!['Editor-Version'],
				'Editor-Plugin-Version': headerBuffer!['Editor-Plugin-Version'],
			},
			{
				'Editor-Version': envService.getEditorInfo().format(),
				'Editor-Plugin-Version': envService.getEditorPluginInfo().format(),
			}
		);
	});

	test('sets Authorization header when secretKey is provided', async function () {
		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, new StaticFetcherService());
		const accessor = testingServiceCollection.createTestingAccessor();
		await accessor.get(IInstantiationService).invokeFunction(postRequest, {
			endpointOrUrl: { type: RequestType.Models },
			secretKey: 'abc',
			intent: 'test',
			requestId: 'id',
		});

		assert.strictEqual(headerBuffer!['Authorization'], 'Bearer abc');
	});

	test('omits Authorization header when secretKey is undefined', async function () {
		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, new StaticFetcherService());
		const accessor = testingServiceCollection.createTestingAccessor();
		await accessor.get(IInstantiationService).invokeFunction(postRequest, {
			endpointOrUrl: { type: RequestType.Models },
			secretKey: undefined,
			intent: 'test',
			requestId: 'id',
		});

		assert.strictEqual('Authorization' in headerBuffer!, false);
	});
});

suite('isCAPIRequestMetadata / isCAPIEndpoint', function () {

	const capiMetadata: RequestMetadata = { type: RequestType.ChatCompletions };

	function endpointWith(urlOrRequestMetadata: string | RequestMetadata): IEndpoint {
		return { urlOrRequestMetadata } as unknown as IEndpoint;
	}

	test('isCAPIRequestMetadata is false for a literal URL string', function () {
		assert.strictEqual(isCAPIRequestMetadata('https://api.example.com/v1/chat'), false);
	});

	test('isCAPIRequestMetadata is true for RequestMetadata routed through CAPI', function () {
		assert.strictEqual(isCAPIRequestMetadata(capiMetadata), true);
	});

	test('isCAPIEndpoint is false for an endpoint fetched from a literal URL (BYOK)', function () {
		assert.strictEqual(isCAPIEndpoint(endpointWith('https://api.example.com/v1/chat')), false);
	});

	test('isCAPIEndpoint is true for an endpoint routed through CAPI', function () {
		assert.strictEqual(isCAPIEndpoint(endpointWith(capiMetadata)), true);
	});
});
