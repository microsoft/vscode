/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createRemoteAgentHostState } from '../../common/remoteAgentHostMetadata.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import {
	getLocalAgentHostLockfilePath,
	isPidAlive,
	readActiveAgentHostFromLockfile,
	readLocalAgentHostLockfile,
} from '../../node/agentHostLockfile.js';

suite('Agent Host Lockfile (local)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const logService = new NullLogService();
	const serverDataFolderName = '.vscode-server-insiders';
	const quality = 'insider';

	let tempDir: string;
	let lockfilePath: string;

	setup(async () => {
		tempDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'agent-host-lockfile-test-'));
		lockfilePath = join(tempDir, 'agent-host.lock');
	});

	teardown(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	function writeState(pid: number, port: number, connectionToken: string | undefined | null, overrides?: Record<string, unknown>): void {
		const state = {
			...createRemoteAgentHostState({ pid, port, connectionToken: connectionToken ?? undefined, quality }),
			...overrides,
		};
		fs.writeFileSync(lockfilePath, JSON.stringify(state));
	}

	suite('getLocalAgentHostLockfilePath', () => {
		test('returns absolute path under home directory', () => {
			const result = getLocalAgentHostLockfilePath(serverDataFolderName, quality);
			assert.strictEqual(result, join(os.homedir(), '.vscode-server-insiders', 'cli', 'agent-host-insider.lock'));
		});

		test('keys lockfile name on quality', () => {
			const result = getLocalAgentHostLockfilePath('.vscode-server-oss', 'stable');
			assert.strictEqual(result, join(os.homedir(), '.vscode-server-oss', 'cli', 'agent-host-stable.lock'));
		});

		test('rejects unsafe server data folder names', () => {
			assert.throws(() => getLocalAgentHostLockfilePath('foo bar', 'stable'), /Unsafe server data folder name/);
			assert.throws(() => getLocalAgentHostLockfilePath('foo/bar', 'stable'), /Unsafe server data folder name/);
			assert.throws(() => getLocalAgentHostLockfilePath('$(whoami)', 'stable'), /Unsafe server data folder name/);
		});

		test('rejects unsafe quality strings', () => {
			assert.throws(() => getLocalAgentHostLockfilePath('.vscode-server-oss', 'foo bar'), /Unsafe quality/);
			assert.throws(() => getLocalAgentHostLockfilePath('.vscode-server-oss', '/abs'), /Unsafe quality/);
		});
	});

	suite('isPidAlive', () => {
		test('returns true for the current process', () => {
			assert.strictEqual(isPidAlive(process.pid), true);
		});

		test('returns false for invalid PIDs', () => {
			assert.strictEqual(isPidAlive(0), false);
			assert.strictEqual(isPidAlive(-1), false);
			assert.strictEqual(isPidAlive(Number.NaN), false);
		});

		test('returns false for a clearly nonexistent PID', () => {
			// 2^31 - 1 is a valid signed 32-bit int but vanishingly unlikely
			// to be a live PID on any real machine.
			assert.strictEqual(isPidAlive(2147483646), false);
		});
	});

	suite('readLocalAgentHostLockfile', () => {
		test('returns undefined when file does not exist', async () => {
			const result = await readLocalAgentHostLockfile(lockfilePath, logService);
			assert.strictEqual(result, undefined);
		});

		test('returns undefined for invalid JSON', async () => {
			fs.writeFileSync(lockfilePath, 'not json at all');
			const result = await readLocalAgentHostLockfile(lockfilePath, logService);
			assert.strictEqual(result, undefined);
		});

		test('returns undefined when schema is invalid', async () => {
			fs.writeFileSync(lockfilePath, JSON.stringify({ pid: 1234, port: 8080 }));
			const result = await readLocalAgentHostLockfile(lockfilePath, logService);
			assert.strictEqual(result, undefined);
		});

		test('parses a valid state file', async () => {
			writeState(1234, 8080, 'mytoken');
			const result = await readLocalAgentHostLockfile(lockfilePath, logService);
			assert.ok(result);
			assert.strictEqual(result.pid, 1234);
			assert.strictEqual(result.port, 8080);
			assert.strictEqual(result.connectionToken, 'mytoken');
			assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
		});
	});

	suite('readActiveAgentHostFromLockfile', () => {
		test('returns notFound when file is missing', async () => {
			const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
			assert.deepStrictEqual(result, { kind: 'notFound' });
		});

		test('returns notFound when file is corrupt', async () => {
			fs.writeFileSync(lockfilePath, 'garbage');
			const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
			assert.deepStrictEqual(result, { kind: 'notFound' });
		});

		test('returns stale when PID is not running', async () => {
			writeState(2147483646, 8080, 'tok');
			const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
			assert.deepStrictEqual(result, { kind: 'stale', pid: 2147483646 });
		});

		test('returns compatible for a live PID with matching protocol', async () => {
			writeState(process.pid, 8080, 'mytoken');
			const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
			assert.deepStrictEqual(result, {
				kind: 'compatible',
				pid: process.pid,
				host: '127.0.0.1',
				port: 8080,
				connectionToken: 'mytoken',
			});
		});

		test('returns compatible with undefined token when state has null token', async () => {
			writeState(process.pid, 8080, null);
			const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
			assert.deepStrictEqual(result, {
				kind: 'compatible',
				pid: process.pid,
				host: '127.0.0.1',
				port: 8080,
				connectionToken: undefined,
			});
		});

		test('treats newer protocol version as compatible', async () => {
			// The agent host server is downloaded on demand and may speak a
			// newer protocol than this consumer was built with. Reuse is
			// the right default; the renderer↔AH handshake surfaces any
			// genuine incompatibility.
			writeState(process.pid, 8080, 'tok', { protocolVersion: '99.0.0' });
			const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
			assert.deepStrictEqual(result, {
				kind: 'compatible',
				pid: process.pid,
				host: '127.0.0.1',
				port: 8080,
				connectionToken: 'tok',
			});
		});
	});
});
