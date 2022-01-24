/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { parseServerConnectionToken, ServerConnectionToken, ServerConnectionTokenParseError, ServerConnectionTokenType } from 'vs/server/node/serverConnectionToken';
import { ServerParsedArgs } from 'vs/server/node/serverEnvironmentService';
import { Promises } from 'vs/base/node/pfs';

suite('parseServerConnectionToken', () => {

	function isError(r: ServerConnectionToken | ServerConnectionTokenParseError): r is ServerConnectionTokenParseError {
		return (r instanceof ServerConnectionTokenParseError);
	}

	function assertIsError(r: ServerConnectionToken | ServerConnectionTokenParseError): void {
		assert.strictEqual(isError(r), true);
	}

	test('no arguments results in error', () => {
		assertIsError(parseServerConnectionToken({} as ServerParsedArgs));
	});

	test('no arguments with --compatibility generates a token that is not mandatory', () => {
		const result = parseServerConnectionToken({ 'compatibility': '1.63' } as ServerParsedArgs);
		assert.ok(!(result instanceof ServerConnectionTokenParseError));
		assert.ok(result.type === ServerConnectionTokenType.Optional);
	});

	test('--without-connection-token', () => {
		const result = parseServerConnectionToken({ 'without-connection-token': true } as ServerParsedArgs);
		assert.ok(!(result instanceof ServerConnectionTokenParseError));
		assert.ok(result.type === ServerConnectionTokenType.None);
	});

	test('--without-connection-token --connection-token results in error', () => {
		assertIsError(parseServerConnectionToken({ 'without-connection-token': true, 'connection-token': '0' } as ServerParsedArgs));
	});

	test('--without-connection-token --connection-token-file results in error', () => {
		assertIsError(parseServerConnectionToken({ 'without-connection-token': true, 'connection-token-file': '0' } as ServerParsedArgs));
	});

	test('--connection-token-file --connection-token results in error', async () => {
		assertIsError(parseServerConnectionToken({ 'connection-token-file': '0', 'connection-token': '0' } as ServerParsedArgs));
	});

	test('--connection-token-file', async () => {
		const testDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'server-connection-token');
		await Promises.mkdir(testDir, { recursive: true });
		const filename = path.join(testDir, 'connection-token-file');
		const connectionToken = `12345-123-abc`;
		await Promises.writeFile(filename, connectionToken);
		const result = parseServerConnectionToken({ 'connection-token-file': filename } as ServerParsedArgs);
		assert.ok(!(result instanceof ServerConnectionTokenParseError));
		assert.ok(result.type === ServerConnectionTokenType.Mandatory);
		assert.strictEqual(result.value, connectionToken);
		await Promises.rm(testDir);
	});

	test('--connection-token', async () => {
		const connectionToken = `12345-123-abc`;
		const result = parseServerConnectionToken({ 'connection-token': connectionToken } as ServerParsedArgs);
		assert.ok(!(result instanceof ServerConnectionTokenParseError));
		assert.ok(result.type === ServerConnectionTokenType.Mandatory);
		assert.strictEqual(result.value, connectionToken);
	});

	test('--connection-token --compatibility marks a as not mandatory', async () => {
		const connectionToken = `12345-123-abc`;
		const result = parseServerConnectionToken({ 'connection-token': connectionToken, 'compatibility': '1.63' } as ServerParsedArgs);
		assert.ok(!(result instanceof ServerConnectionTokenParseError));
		assert.ok(result.type === ServerConnectionTokenType.Optional);
		assert.strictEqual(result.value, connectionToken);
	});
});
