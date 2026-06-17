/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FetchOptions, RequestMetadata } from '@vscode/copilot-api';
import { Response } from '../../../networking/common/fetcherService';

/**
 * A mock implementation of ICAPIClientService for testing.
 * Returns an empty successful response by default.
 * Note: Does not fully implement ICAPIClientService - only the methods needed for tests.
 */
export class MockCAPIClientService {
	declare readonly _serviceBrand: undefined;

	abExpContext: string | undefined = undefined;

	private _mockResponse: Response = {
		ok: true,
		status: 200,
		statusText: 'OK',
		headers: new Map(),
		text: () => Promise.resolve('[]'),
		json: () => Promise.resolve([]),
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		body: null,
	} as unknown as Response;

	/**
	 * Sets the mock response to return from makeRequest.
	 */
	setMockResponse(response: Partial<Response>): void {
		this._mockResponse = { ...this._mockResponse, ...response } as Response;
	}

	makeRequest<T>(_request: FetchOptions, _requestMetadata: RequestMetadata): Promise<T> {
		return Promise.resolve(this._mockResponse as unknown as T);
	}
}
