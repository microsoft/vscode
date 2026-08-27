/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createManagedRemoteResourceRequestHandler } from '../../electron-main/managedRemoteResourceProtocol.js';

suite('ProtocolMainService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRequest(authority: string): GlobalRequest {
		return new Request(URI.from({
			scheme: Schemas.vscodeManagedRemoteResource,
			authority,
			path: '/resource.txt',
		}).toString());
	}

	async function summarize(response: GlobalResponse) {
		return {
			statusCode: response.status,
			data: await response.text(),
			mimeType: response.headers.get('Content-Type'),
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

		const response = await handler(createRequest('window:7'));

		assert.deepStrictEqual({
			response: await summarize(response),
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

		const notFound = await handler(createRequest('invalid'));
		const failed = await handler(createRequest('window:7'));

		assert.deepStrictEqual({
			notFound: await summarize(notFound),
			failed: await summarize(failed),
			requestCount,
		}, {
			notFound: {
				statusCode: 404,
				data: 'Not found',
				mimeType: 'text/plain;charset=UTF-8',
			},
			failed: {
				statusCode: 500,
				data: 'Error: failed',
				mimeType: 'text/plain;charset=UTF-8',
			},
			requestCount: 1,
		});
	});
});
