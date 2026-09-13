/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ProtocolRequest, ProtocolResponse } from 'electron';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createManagedRemoteResourceRequestHandler } from '../../electron-main/managedRemoteResourceProtocol.js';

suite('ProtocolMainService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRequest(authority: string): ProtocolRequest {
		return {
			url: URI.from({
				scheme: Schemas.vscodeManagedRemoteResource,
				authority,
				path: '/resource.txt',
			}).toString(),
			referrer: '',
			method: 'GET',
			headers: {},
		};
	}

	function invoke(
		handler: ReturnType<typeof createManagedRemoteResourceRequestHandler>,
		request: ProtocolRequest,
	): Promise<ProtocolResponse> {
		return new Promise((resolve, reject) => handler(request, response => {
			if (Buffer.isBuffer(response)) {
				reject(new Error('Expected a protocol response'));
			} else {
				resolve(response);
			}
		}));
	}

	function summarize(response: ProtocolResponse) {
		if (!Buffer.isBuffer(response.data)) {
			throw new Error('Expected response data to be a buffer');
		}
		return {
			statusCode: response.statusCode,
			data: response.data.toString(),
			mimeType: response.mimeType,
		};
	}

	test('loads workbench requests with an empty referrer', async () => {
		const requested: URI[] = [];
		const handler = createManagedRemoteResourceRequestHandler(async url => {
			requested.push(url);
			return {
				statusCode: 200,
				body: Buffer.from('content').toString('base64'),
				mimeType: 'text/plain',
			};
		}, store.add(new NullLogService()));

		const response = await invoke(handler, createRequest('window:7'));

		assert.deepStrictEqual({
			response: summarize(response),
			requested: requested.map(url => url.toString()),
		}, {
			response: {
				statusCode: 200,
				data: 'content',
				mimeType: 'text/plain',
			},
			requested: ['vscode-managed-remote-resource://window:7/resource.txt'],
		});
	});

	test('returns buffer data for error responses', async () => {
		let requestCount = 0;
		const handler = createManagedRemoteResourceRequestHandler(async () => {
			requestCount++;
			throw new Error('failed');
		}, store.add(new NullLogService()));

		const notFound = await invoke(handler, createRequest('invalid'));
		const failed = await invoke(handler, createRequest('window:7'));

		assert.deepStrictEqual({
			notFound: summarize(notFound),
			failed: summarize(failed),
			requestCount,
		}, {
			notFound: {
				statusCode: 404,
				data: 'Not found',
				mimeType: undefined,
			},
			failed: {
				statusCode: 500,
				data: 'Error: failed',
				mimeType: undefined,
			},
			requestCount: 1,
		});
	});
});
