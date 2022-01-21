/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { parseConnectionToken, ServerConnectionToken, ServerConnectionTokenParseError } from 'vs/server/node/connectionToken';
import { ServerParsedArgs } from 'vs/server/node/serverEnvironmentService';
import { Promises } from 'vs/base/node/pfs';

suite('parseServerConnectionToken', () => {

	function isError(r: ServerConnectionToken | ServerConnectionTokenParseError): r is ServerConnectionTokenParseError {
		return (r instanceof ServerConnectionTokenParseError);
	}

	function assertIsError(r: ServerConnectionToken | ServerConnectionTokenParseError): void {
		assert.strictEqual(isError(r), true);
	}

	// test('no arguments results in error', () => {
	// 	assertIsError(parseConnectionToken({} as ServerParsedArgs));
	// });

	test('no arguments with --compatibility generates a token that is not mandatory', () => {
		const result = parseConnectionToken({ 'compatibility': '1.63' } as ServerParsedArgs);
		assert.ok(result instanceof ServerConnectionToken);
		assert.strictEqual(result.isMandatory, false);
	});

	test('--without-connection-token', () => {
		const result = parseConnectionToken({ 'without-connection-token': true } as ServerParsedArgs);
		assert.ok(result instanceof ServerConnectionToken);
		assert.strictEqual(result.value, 'without-connection-token');
		assert.strictEqual(result.isMandatory, false);
	});

	test('--without-connection-token --connection-token results in error', () => {
		assertIsError(parseConnectionToken({ 'without-connection-token': true, 'connection-token': '0' } as ServerParsedArgs));
	});

	test('--without-connection-token --connection-token-file results in error', () => {
		assertIsError(parseConnectionToken({ 'without-connection-token': true, 'connection-token-file': '0' } as ServerParsedArgs));
	});

	test('--connection-token-file --connection-token results in error', async () => {
		assertIsError(parseConnectionToken({ 'connection-token-file': '0', 'connection-token': '0' } as ServerParsedArgs));
	});

	test('--connection-token-file', async () => {
		const testDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'server-connection-token');
		await Promises.mkdir(testDir, { recursive: true });
		const filename = path.join(testDir, 'connection-token-file');
		const connectionToken = `12345-123-abc`;
		await Promises.writeFile(filename, connectionToken);
		const result = parseConnectionToken({ 'connection-token-file': filename } as ServerParsedArgs);
		assert.ok(result instanceof ServerConnectionToken);
		assert.strictEqual(result.value, connectionToken);
		assert.strictEqual(result.isMandatory, true);
		await Promises.rm(testDir);
	});

	test('--connection-token', async () => {
		const connectionToken = `12345-123-abc`;
		const result = parseConnectionToken({ 'connection-token': connectionToken } as ServerParsedArgs);
		assert.ok(result instanceof ServerConnectionToken);
		assert.strictEqual(result.value, connectionToken);
		assert.strictEqual(result.isMandatory, true);
	});

	test('--connection-token --compatibility marks a as not mandatory', async () => {
		const connectionToken = `12345-123-abc`;
		const result = parseConnectionToken({ 'connection-token': connectionToken, 'compatibility': '1.63' } as ServerParsedArgs);
		assert.ok(result instanceof ServerConnectionToken);
		assert.strictEqual(result.value, connectionToken);
		assert.strictEqual(result.isMandatory, false);
	});
});
