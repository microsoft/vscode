/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { Event } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { getEditorVersionHeaders, IEnvService } from '../../../env/common/envService';
import { FetchOptions, IAbortController, IFetcherService, PaginationOptions, Response, WebSocketConnection } from '../../../networking/common/fetcherService';
import { createFakeResponse } from '../../../test/node/fetcher';
import { createPlatformServices } from '../../../test/node/services';
import { ProxyModelsService } from '../../node/proxyModelsService';

suite('ProxyModelsService', function () {

	test('includes editor-related headers when fetching the models list', async function () {
		let capturedHeaders: { [name: string]: string } | undefined;

		class CapturingFetcherService implements IFetcherService {
			declare readonly _serviceBrand: undefined;
			readonly onDidFetch = Event.None;
			readonly onDidCompleteFetch = Event.None;

			getUserAgentLibrary(): string {
				return 'test';
			}
			fetch(url: string, options: FetchOptions): Promise<Response> {
				capturedHeaders = options.headers;
				return Promise.resolve(createFakeResponse(200, { models: [] }));
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
			isAbortError(): boolean {
				return false;
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

		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, new CapturingFetcherService());
		const accessor = testingServiceCollection.createTestingAccessor();

		// Seed the token store so the service fetches the models list on construction.
		accessor.get(ICopilotTokenStore).copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' }));

		const service = accessor.get(IInstantiationService).createInstance(ProxyModelsService);
		try {
			await Event.toPromise(service.onModelListUpdated);
		} finally {
			service.dispose();
		}

		assert.deepStrictEqual(capturedHeaders, {
			'Authorization': `Bearer test-token`,
			...getEditorVersionHeaders(accessor.get(IEnvService)),
		});
	});
});
