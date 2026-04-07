/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import {
	ICompletionsFetcherService,
	postRequest
} from '../networking';
import { createLibTestingContext } from './context';
import { StaticFetcher, createFakeJsonResponse } from './fetcher';

suite('Networking test Suite', function () {
	let accessor: ServicesAccessor;
	let fetcher: StaticFetcher;

	setup(function () {
		const serviceCollection = createLibTestingContext();
		fetcher = new StaticFetcher();
		serviceCollection.define(ICompletionsFetcherService, fetcher);
		accessor = serviceCollection.createTestingAccessor();
	});

	test('each request contains editor info headers', async function () {
		await postRequest(accessor, 'http://localhost:8080/', '', undefined, 'id');

		assert.strictEqual(fetcher.headerBuffer!['VScode-SessionId'], 'test-session');
		assert.strictEqual(fetcher.headerBuffer!['VScode-MachineId'], 'test-machine');
		assert.strictEqual(fetcher.headerBuffer!['Editor-Version'], 'lib-tests-editor/1');
		assert.strictEqual(fetcher.headerBuffer!['Editor-Plugin-Version'], 'lib-tests-plugin/2');
		assert.match(fetcher.headerBuffer!['Copilot-Language-Server-Version'], /^\d+\.\d+\./);
	});

	test('additional headers can be specified per-request', async function () {
		await postRequest(accessor, 'http://localhost:8080/', '', undefined, 'id', undefined, undefined, {
			'X-Custom-Model': 'disable',
		});

		assert.strictEqual(fetcher.headerBuffer!['X-Custom-Model'], 'disable');
	});

	suite('JSON Parsing', function () {
		async function getJsonError(json: string, headers?: { [key: string]: string }): Promise<Error | undefined> {
			try {
				await createFakeJsonResponse(200, json, headers).json();
			} catch (e) {
				if (e instanceof Error) {
					return e;
				}
				throw e;
			}
		}

		test('parses valid JSON', async function () {
			assert.deepStrictEqual(await createFakeJsonResponse(200, '{"a":"b"}').json(), { a: 'b' });
		});

		test('throws an error for an unexpected content type', async function () {
			const error = (await getJsonError('<!doctype>', { 'content-type': 'text/html' })) as NodeJS.ErrnoException;
			assert.ok(error instanceof SyntaxError);
			assert.deepStrictEqual(error.name, 'SyntaxError');
		});

		test('throws an error for truncated JSON', async function () {
			for (const json of ['{', '{"', '{"a"', '{"a":', '{"a":1', '{"a":1,']) {
				const error = (await getJsonError(json)) as NodeJS.ErrnoException;
				assert.ok(error instanceof SyntaxError);
				assert.deepStrictEqual(error.name, 'SyntaxError');
			}
			const error = (await getJsonError('{', { 'content-length': '2' })) as NodeJS.ErrnoException;
			assert.ok(error instanceof SyntaxError);
			assert.deepStrictEqual(error.name, 'SyntaxError');
		});

		test('throws an error for any other parse failure', async function () {
			const error = await getJsonError('&');
			assert.ok(error instanceof SyntaxError);
		});
	});
});
