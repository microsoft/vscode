/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { CachedResponse } from '../tsServer/cachedResponse';
import { ServerResponse, CancelledResponse } from '../typescriptService';

suite('CachedResponse', () => {
	test('should cache simple response for same document', async () => {
		const doc = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		const response = new CachedResponse();

		const responder = createSequentialResponder('test');

		assertResult(await response.execute(doc, responder), 'test-0');
		assertResult(await response.execute(doc, responder), 'test-0');
	});

	test('should invalidate cache for new document', async () => {
		const doc1 = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		const doc2 = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		const response = new CachedResponse();

		const responder = createSequentialResponder('test');

		assertResult(await response.execute(doc1, responder), 'test-0');
		assertResult(await response.execute(doc1, responder), 'test-0');
		assertResult(await response.execute(doc2, responder), 'test-1');
		assertResult(await response.execute(doc2, responder), 'test-1');
		assertResult(await response.execute(doc1, responder), 'test-2');
		assertResult(await response.execute(doc1, responder), 'test-2');
	});

	test('should not cache cancelled responses', async () => {
		const doc = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		const response = new CachedResponse();

		const responder = createSequentialResponder('test');

		const cancelledResponder = createEventualResponder<CancelledResponse>();
		const result1 = response.execute(doc, () => cancelledResponder.promise);
		const result2 = response.execute(doc, responder);
		const result3 = response.execute(doc, responder);

		cancelledResponder.resolve(new CancelledResponse('cancelled'));

		assert.strictEqual((await result1).type, 'cancelled');
		assertResult(await result2, 'test-0');
		assertResult(await result3, 'test-0');
	});
});

function assertResult(result: ServerResponse<Proto.Response>, command: string) {
	if (result.type === 'response') {
		assert.strictEqual(result.command, command);
	} else {
		assert.fail('Response failed');
	}
}

function createResponse(command: string): Proto.Response {
	return {
		type: 'response',
		body: {},
		command: command,
		request_seq: 1,
		success: true,
		seq: 1
	};
}

function createSequentialResponder(prefix: string) {
	let count = 0;
	return async () => createResponse(`${prefix}-${count++}`);
}

function createEventualResponder<T>(): {promise: Promise<T>, resolve: (x: T) => void } {
	let resolve: (value: T) => void;
	const promise = new Promise<T>(r => { resolve = r; });
	return { promise, resolve: resolve! };
}
