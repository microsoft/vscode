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

		let seq = 0;
		const makeRequest = async () => createResponse(`test-${seq++}`);

		assertResult(await response.execute(doc, makeRequest), 'test-0');
		assertResult(await response.execute(doc, makeRequest), 'test-0');
	});

	test('should invalidate cache for new document', async () => {
		const doc1 = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		const doc2 = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		const response = new CachedResponse();

		let seq = 0;
		const makeRequest = async () => createResponse(`test-${seq++}`);

		assertResult(await response.execute(doc1, makeRequest), 'test-0');
		assertResult(await response.execute(doc1, makeRequest), 'test-0');
		assertResult(await response.execute(doc2, makeRequest), 'test-1');
		assertResult(await response.execute(doc2, makeRequest), 'test-1');
		assertResult(await response.execute(doc1, makeRequest), 'test-2');
		assertResult(await response.execute(doc1, makeRequest), 'test-2');
	});

	test('should not cache canceled response', async () => {
		const doc = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		const response = new CachedResponse();

		let seq = 0;
		const makeRequest = async () => createResponse(`test-${seq++}`);

		const result1 = await response.execute(doc, async () => new CancelledResponse('cancleed'));
		assert.strictEqual(result1.type, 'cancelled');

		assertResult(await response.execute(doc, makeRequest), 'test-0');
		assertResult(await response.execute(doc, makeRequest), 'test-0');
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

