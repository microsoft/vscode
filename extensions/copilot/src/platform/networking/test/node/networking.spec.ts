/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import assert from 'assert';
import { suite, test } from 'vitest';
import { Event } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createFakeResponse } from '../../../test/node/fetcher';
import { createPlatformServices } from '../../../test/node/services';
import { FetchOptions, IAbortController, IFetcherService, PaginationOptions, Response, WebSocketConnection } from '../../common/fetcherService';
import { IEndpointBody, postRequest } from '../../common/networking';
import { openAIContextManagementCompactionTriggerType } from '../../common/openai';

suite('Networking test Suite', function () {

	let headerBuffer: { [name: string]: string } | undefined;
	let bodyBuffer: IEndpointBody | undefined;

	class StaticFetcherService implements IFetcherService {
		declare readonly _serviceBrand: undefined;
		readonly onDidFetch = Event.None;
		readonly onDidCompleteFetch = Event.None;

		getUserAgentLibrary(): string {
			return 'test';
		}
		fetch(url: string, options: FetchOptions): Promise<Response> {
			headerBuffer = options.headers;
			bodyBuffer = options.json as IEndpointBody | undefined;
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

	test('preserves max_output_tokens on compaction trigger requests before sending', async function () {
		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, new StaticFetcherService());
		const accessor = testingServiceCollection.createTestingAccessor();
		await accessor.get(IInstantiationService).invokeFunction(postRequest, {
			endpointOrUrl: 'https://example.test/responses',
			secretKey: '',
			intent: 'test',
			requestId: 'id',
			body: {
				model: 'gpt-5.4',
				input: [{ type: openAIContextManagementCompactionTriggerType }],
				max_output_tokens: 4096,
				previous_response_id: 'resp-prev',
				truncation: 'auto',
			},
		});

		assert.strictEqual(bodyBuffer?.max_output_tokens, 4096);
		assert.strictEqual(bodyBuffer?.previous_response_id, undefined);
		assert.strictEqual(bodyBuffer?.truncation, undefined);
	});
});
