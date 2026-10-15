/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ipcRenderer } from 'electron';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createManagedRemoteResourceRequestHandler } from '../../electron-main/managedRemoteResourceProtocol.js';
import { toPartialFileResponse } from '../../electron-main/partialFileResponse.js';

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

	test('answers ranged file requests as partial responses', async () => {
		const file = 'abcdefghij';
		const answer = async (range: string | undefined, status = 200) => {
			const sliced = range?.match(/^bytes=(\d+)-(\d*)$/);
			const inverted = sliced && sliced[2] && Number(sliced[1]) > Number(sliced[2]);
			const body = sliced && !inverted ? file.slice(Number(sliced[1]), sliced[2] ? Number(sliced[2]) + 1 : undefined) : range?.startsWith('bytes=-') ? file.slice(-Number(range.slice(7))) : file;
			const response = toPartialFileResponse(
				new Request('vscode-file://vscode-app/clip.webm', { headers: range ? { Range: range } : {} }),
				new Response(body, { status, headers: { 'Content-Type': 'video/webm' } }),
				file.length,
			);
			return `${response.status} ${response.headers.get('Content-Range')} ${response.headers.get('Content-Length')} ${response.status === 416 ? '' : await response.text()}`.trim();
		};

		assert.deepStrictEqual({
			none: await answer(undefined),
			closed: await answer('bytes=2-4'),
			open: await answer('bytes=6-'),
			suffix: await answer('bytes=-3'),
			pastEnd: await answer('bytes=12-'),
			inverted: await answer('bytes=5-2'),
			endBeyondSize: await answer('bytes=8-20'),
			alreadyPartial: await answer('bytes=2-4', 206),
			multiple: await answer('bytes=0-1,4-5'),
		}, {
			none: '200 null null abcdefghij',
			closed: '206 bytes 2-4/10 3 cde',
			open: '206 bytes 6-9/10 4 ghij',
			suffix: '206 bytes 7-9/10 3 hij',
			pastEnd: '416 bytes */10 null',
			inverted: '200 null null abcdefghij',
			endBeyondSize: '206 bytes 8-9/10 2 ij',
			alreadyPartial: '206 null null cde',
			multiple: '200 null null abcdefghij',
		});
	});

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
				data: '',
				mimeType: null,
			},
			requestCount: 1,
		});
	});

	test('loads vscode-remote-resource with workbench CORS headers', async function () {
		this.timeout(15_000);
		const response = await ipcRenderer.invoke('vscode:test-remote-resource');

		assert.deepStrictEqual(response, {
			loaded: true,
			requestHeaders: {
				origin: 'vscode-file://vscode-app',
				secFetchMode: 'cors',
			},
		});
	});
});
