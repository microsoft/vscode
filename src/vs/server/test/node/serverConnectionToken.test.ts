/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { parseServerConnectionToken, ServerConnectionToken, ServerConnectionTokenParseError, ServerConnectionTokenType } from 'vs/server/node/serverConnectionToken';
import { ServerParsedArgs } from 'vs/server/node/serverEnvironmentService';

suite('parseServerConnectionToken', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function isError(r: ServerConnectionToken | ServerConnectionTokenParseError): r is ServerConnectionTokenParseError {
		return (r instanceof ServerConnectionTokenParseError);
	}

	function assertIsError(r: ServerConnectionToken | ServerConnectionTokenParseError): void {
		assert.strictEqual(isError(r), true);
	}

	test('no arguments generates a token that is mandatory', async () => {
		const result = await parseServerConnectionToken({} as ServerParsedArgs, async () => 'defaultTokenValue');
		assert.ok(!(result instanceof ServerConnectionTokenParseError));
		assert.ok(result.type === ServerConnectionTokenType.Mandatory);
	});

	test('--without-connection-token', async () => {
		const result = await parseServerConnectionToken({ 'without-connection-token': true } as ServerParsedArgs, async () => 'defaultTokenValue');
		assert.ok(!(result instanceof ServerConnectionTokenParseError));
		assert.ok(result.type === ServerConnectionTokenType.None);
	});

	test('--without-connection-token --connection-token results in error', async () => {
		assertIsError(await parseServerConnectionToken({ 'without-connection-token': true, 'connection-token': '0' } as ServerParsedArgs, async () => 'defaultTokenValue'));
	});

	test('--without-connection-token --connection-token-file results in error', async () => {
		assertIsError(await parseServerConnectionToken({ 'without-connection-token': true, 'connection-token-file': '0' } as ServerParsedArgs, async () => 'defaultTokenValue'));
	});

	test('--connection-token-file --connection-token results in error', async () => {
		assertIsError(await parseServerConnectionToken({ 'connection-token-file': '0', 'connection-token': '0' } as ServerParsedArgs, async () => 'defaultTokenValue'));
	});

	test('--connection-token-file', async function () {
		this.timeout(10000);
		const testDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'server-connection-token');
		fs.mkdirSync(testDir, { recursive: true });
		const filename = path.join(testDir, 'connection-token-file');
		const connectionToken = `12345-123-abc`;
		fs.writeFileSync(filename, connectionToken);
		const result = await parseServerConnectionToken({ 'connection-token-file': filename } as ServerParsedArgs, async () => 'defaultTokenValue');
		assert.ok(!(result instanceof ServerConnectionTokenParseError));
		assert.ok(result.type === ServerConnectionTokenType.Mandatory);
		assert.strictEqual(result.value, connectionToken);
		fs.rmSync(testDir, { recursive: true, force: true });
	});

	test('--connection-token', async () => {
		const connectionToken = `12345-123-abc`;
		const result = await parseServerConnectionToken({ 'connection-token': connectionToken } as ServerParsedArgs, async () => 'defaultTokenValue');
		assert.ok(!(result instanceof ServerConnectionTokenParseError));
		assert.ok(result.type === ServerConnectionTokenType.Mandatory);
		assert.strictEqual(result.value, connectionToken);
	});

});
