/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createRemoteAgentHostState } from '../../common/remoteAgentHostMetadata.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import {
	buildAgentHostBaseCommand,
	buildCLIDownloadUrl,
	buildCleanupOldCLIsCommand,
	buildFindFallbackCLICommand,
	cleanupRemoteAgentHost,
	findRunningAgentHost,
	getAgentHostLockfile,
	getRemoteCLIArchiveName,
	getRemoteCLIBin,
	getRemoteCLIDataDir,
	getRemoteCLIInstallRoot,
	isValidFallbackCLIPath,
	redactToken,
	resolveRemotePlatform,
	shellEscape,
	validateCommit,
	validateShellToken,
	writeAgentHostState,
	type ISshExec,
} from '../../node/sshRemoteAgentHostHelpers.js';

suite('SSH Remote Agent Host Helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const logService = new NullLogService();
	const serverDataFolderName = '.vscode-server-insiders';
	const quality = 'insider';
	const lockfilePath = '~/.vscode-server-insiders/cli/agent-host-insider.lock';

	function stateJson(pid: number, port: number, connectionToken: string | undefined | null): string {
		return JSON.stringify(createRemoteAgentHostState({
			pid,
			port,
			connectionToken: connectionToken ?? undefined,
			quality,
		}));
	}

	suite('validateShellToken', () => {
		test('accepts alphanumeric strings', () => {
			assert.strictEqual(validateShellToken('insider', 'quality'), 'insider');
			assert.strictEqual(validateShellToken('stable', 'quality'), 'stable');
			assert.strictEqual(validateShellToken('exploration', 'quality'), 'exploration');
		});

		test('accepts dots, dashes, and underscores', () => {
			assert.strictEqual(validateShellToken('my-build_1.0', 'quality'), 'my-build_1.0');
		});

		test('rejects strings with spaces', () => {
			assert.throws(() => validateShellToken('foo bar', 'quality'), /Unsafe quality/);
		});

		test('rejects strings with shell metacharacters', () => {
			assert.throws(() => validateShellToken('foo;rm -rf /', 'quality'), /Unsafe quality/);
			assert.throws(() => validateShellToken('$(whoami)', 'quality'), /Unsafe quality/);
			assert.throws(() => validateShellToken('foo\'bar', 'quality'), /Unsafe quality/);
		});

		test('rejects empty string', () => {
			assert.throws(() => validateShellToken('', 'quality'), /Unsafe quality/);
		});
	});

	suite('validateCommit', () => {
		test('accepts a 40-char lowercase hex SHA', () => {
			const c = 'abcdef0123456789abcdef0123456789abcdef01';
			assert.strictEqual(validateCommit(c), c);
		});

		test('normalizes uppercase hex to lowercase', () => {
			assert.strictEqual(
				validateCommit('ABCDEF0123456789ABCDEF0123456789ABCDEF01'),
				'abcdef0123456789abcdef0123456789abcdef01',
			);
		});

		test('rejects non-hex characters', () => {
			assert.throws(() => validateCommit('g'.repeat(40)), /Unsafe commit/);
			assert.throws(() => validateCommit('abcdef0123456789abcdef0123456789abcdef0z'), /Unsafe commit/);
		});

		test('rejects wrong-length values', () => {
			assert.throws(() => validateCommit('abc'), /Unsafe commit/);
			assert.throws(() => validateCommit('a'.repeat(41)), /Unsafe commit/);
			assert.throws(() => validateCommit(''), /Unsafe commit/);
		});

		test('rejects shell metacharacters', () => {
			assert.throws(() => validateCommit('foo;rm'), /Unsafe commit/);
			assert.throws(() => validateCommit('a'.repeat(39) + '$'), /Unsafe commit/);
		});
	});

	suite('getRemoteCLIArchiveName', () => {
		test('returns code for stable', () => {
			assert.strictEqual(getRemoteCLIArchiveName('stable'), 'code');
		});

		test('returns code-insiders for insider', () => {
			assert.strictEqual(getRemoteCLIArchiveName('insider'), 'code-insiders');
		});

		test('returns code-exploration for exploration', () => {
			assert.strictEqual(getRemoteCLIArchiveName('exploration'), 'code-exploration');
		});

		test('falls back to code-insiders for unknown qualities', () => {
			// Dev builds with no `quality` end up here via the
			// `_quality` getter's `'insider'` default, so the fallback
			// shouldn't differ from insider.
			assert.strictEqual(getRemoteCLIArchiveName('weirdbuild'), 'code-insiders');
		});

		test('rejects unsafe quality strings', () => {
			assert.throws(() => getRemoteCLIArchiveName('foo bar'), /Unsafe quality/);
		});
	});

	suite('getRemoteCLIInstallRoot', () => {
		test('returns user-home anchored path under the server data folder', () => {
			assert.strictEqual(getRemoteCLIInstallRoot('.vscode-server-insiders'), '~/.vscode-server-insiders');
		});

		test('rejects unsafe server data folder names', () => {
			assert.throws(() => getRemoteCLIInstallRoot('foo bar'), /Unsafe server data folder name/);
			assert.throws(() => getRemoteCLIInstallRoot('foo/bar'), /Unsafe server data folder name/);
			assert.throws(() => getRemoteCLIInstallRoot('$(whoami)'), /Unsafe server data folder name/);
		});
	});

	suite('getRemoteCLIDataDir', () => {
		test('returns the `cli` subdir under the install root', () => {
			assert.strictEqual(getRemoteCLIDataDir('.vscode-server'), '~/.vscode-server/cli');
			assert.strictEqual(getRemoteCLIDataDir('.vscode-server-insiders'), '~/.vscode-server-insiders/cli');
		});

		test('rejects unsafe server data folder names', () => {
			assert.throws(() => getRemoteCLIDataDir('foo;rm'), /Unsafe server data folder name/);
		});
	});

	suite('buildAgentHostBaseCommand', () => {
		test('includes --cli-data-dir before the agent host subcommand', () => {
			const cmd = buildAgentHostBaseCommand('~/.vscode-server/code-insiders-abc', '~/.vscode-server/cli');
			assert.strictEqual(cmd, '~/.vscode-server/code-insiders-abc --cli-data-dir ~/.vscode-server/cli agent host --port 0');
		});
	});

	suite('getRemoteCLIBin', () => {
		const commit = 'abcdef0123456789abcdef0123456789abcdef01';

		test('returns commit-keyed path under shared install root for stable', () => {
			assert.strictEqual(
				getRemoteCLIBin('.vscode-server', 'stable', commit),
				`~/.vscode-server/code-${commit}`,
			);
		});

		test('returns commit-keyed path for insider', () => {
			assert.strictEqual(
				getRemoteCLIBin('.vscode-server-insiders', 'insider', commit),
				`~/.vscode-server-insiders/code-insiders-${commit}`,
			);
		});

		test('returns commit-keyed path for exploration', () => {
			assert.strictEqual(
				getRemoteCLIBin('.vscode-server-exploration', 'exploration', commit),
				`~/.vscode-server-exploration/code-exploration-${commit}`,
			);
		});

		test('returns non-keyed path when commit is undefined (dev build)', () => {
			assert.strictEqual(
				getRemoteCLIBin('.vscode-server-oss', 'insider'),
				'~/.vscode-server-oss/code-insiders',
			);
			assert.strictEqual(
				getRemoteCLIBin('.vscode-server', 'stable'),
				'~/.vscode-server/code',
			);
		});

		test('rejects unsafe commit values', () => {
			assert.throws(() => getRemoteCLIBin('.vscode-server', 'stable', 'foo;rm'), /Unsafe commit/);
		});

		test('normalizes uppercase hex commits to lowercase', () => {
			const upper = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
			assert.strictEqual(
				getRemoteCLIBin('.vscode-server', 'stable', upper),
				'~/.vscode-server/code-abcdef0123456789abcdef0123456789abcdef01',
			);
		});

		test('rejects unsafe server data folder names', () => {
			assert.throws(() => getRemoteCLIBin('foo bar', 'stable', commit), /Unsafe server data folder name/);
		});
	});

	suite('shellEscape', () => {
		test('wraps simple string in single quotes', () => {
			assert.strictEqual(shellEscape('hello'), '\'hello\'');
		});

		test('escapes embedded single quotes', () => {
			assert.strictEqual(shellEscape('it\'s'), '\'it\'\\\'\'s\'');
		});

		test('handles empty string', () => {
			assert.strictEqual(shellEscape(''), '\'\'');
		});

		test('passes through special chars safely wrapped', () => {
			assert.strictEqual(shellEscape('$(rm -rf /)'), '\'$(rm -rf /)\'');
		});
	});

	suite('resolveRemotePlatform', () => {
		test('detects Linux x64', () => {
			assert.deepStrictEqual(resolveRemotePlatform('Linux', 'x86_64'), { os: 'linux', arch: 'x64' });
		});

		test('detects Linux amd64', () => {
			assert.deepStrictEqual(resolveRemotePlatform('Linux', 'amd64'), { os: 'linux', arch: 'x64' });
		});

		test('detects Linux arm64 (aarch64)', () => {
			assert.deepStrictEqual(resolveRemotePlatform('Linux', 'aarch64'), { os: 'linux', arch: 'arm64' });
		});

		test('detects Linux arm64', () => {
			assert.deepStrictEqual(resolveRemotePlatform('Linux', 'arm64'), { os: 'linux', arch: 'arm64' });
		});

		test('detects Linux armhf', () => {
			assert.deepStrictEqual(resolveRemotePlatform('Linux', 'armv7l'), { os: 'linux', arch: 'armhf' });
		});

		test('detects Darwin x64', () => {
			assert.deepStrictEqual(resolveRemotePlatform('Darwin', 'x86_64'), { os: 'darwin', arch: 'x64' });
		});

		test('detects Darwin arm64', () => {
			assert.deepStrictEqual(resolveRemotePlatform('Darwin', 'arm64'), { os: 'darwin', arch: 'arm64' });
		});

		test('handles whitespace in uname output', () => {
			assert.deepStrictEqual(resolveRemotePlatform('  Linux\n', '  x86_64\n'), { os: 'linux', arch: 'x64' });
		});

		test('returns undefined for Windows', () => {
			assert.strictEqual(resolveRemotePlatform('MINGW64_NT-10.0-19041', 'x86_64'), undefined);
		});

		test('returns undefined for unknown OS', () => {
			assert.strictEqual(resolveRemotePlatform('FreeBSD', 'amd64'), undefined);
		});

		test('returns undefined for unknown arch', () => {
			assert.strictEqual(resolveRemotePlatform('Linux', 'ppc64le'), undefined);
		});
	});

	suite('buildCLIDownloadUrl', () => {
		const commit = 'abcdef0123456789abcdef0123456789abcdef01';

		test('uses `latest` URL when commit is omitted', () => {
			assert.strictEqual(
				buildCLIDownloadUrl('linux', 'x64', 'insider'),
				'https://update.code.visualstudio.com/latest/cli-linux-x64/insider'
			);
		});

		test('works for darwin arm64 stable (no commit)', () => {
			assert.strictEqual(
				buildCLIDownloadUrl('darwin', 'arm64', 'stable'),
				'https://update.code.visualstudio.com/latest/cli-darwin-arm64/stable'
			);
		});

		test('pins to commit when provided', () => {
			assert.strictEqual(
				buildCLIDownloadUrl('linux', 'x64', 'insider', commit),
				`https://update.code.visualstudio.com/commit:${commit}/cli-linux-x64/insider`,
			);
		});

		test('pins to commit for darwin arm64 stable', () => {
			assert.strictEqual(
				buildCLIDownloadUrl('darwin', 'arm64', 'stable', commit),
				`https://update.code.visualstudio.com/commit:${commit}/cli-darwin-arm64/stable`,
			);
		});

		test('rejects unsafe commit values', () => {
			assert.throws(() => buildCLIDownloadUrl('linux', 'x64', 'insider', 'foo;rm'), /Unsafe commit/);
		});

		test('normalizes uppercase hex commits to lowercase', () => {
			const upper = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
			assert.strictEqual(
				buildCLIDownloadUrl('linux', 'x64', 'insider', upper),
				`https://update.code.visualstudio.com/commit:abcdef0123456789abcdef0123456789abcdef01/cli-linux-x64/insider`,
			);
		});
	});

	suite('buildCleanupOldCLIsCommand', () => {
		test('produces a snippet that keeps the 5 most recent commit-keyed CLIs for insider', () => {
			const cmd = buildCleanupOldCLIsCommand('.vscode-server-insiders', 'insider');
			// Target the commit-keyed pattern (with 40 chars), under the shared install root.
			assert.ok(cmd.includes('~/.vscode-server-insiders/code-insiders-'), `cmd missing install path: ${cmd}`);
			assert.ok(/(\[0-9a-f\]){40}/.test(cmd), 'cmd should match exactly 40 hex chars');
			// Retention via sort + awk drop-first-N + xargs rm.
			assert.ok(/ls -1t/.test(cmd), `cmd should sort by mtime: ${cmd}`);
			assert.ok(/awk\s+'NR>5'/.test(cmd), `cmd should keep 5: ${cmd}`);
			assert.ok(/xargs\s+-I\{\}\s+rm\s+-f\s+--/.test(cmd), `cmd should rm safely: ${cmd}`);
		});

		test('uses `code-` archive name for stable', () => {
			const cmd = buildCleanupOldCLIsCommand('.vscode-server', 'stable');
			assert.ok(cmd.includes('~/.vscode-server/code-[0-9a-f]'), `cmd should target stable archive: ${cmd}`);
			assert.ok(!cmd.includes('code-insiders-'), 'stable cmd should not mention insiders archive');
		});

		test('rejects unsafe inputs', () => {
			assert.throws(() => buildCleanupOldCLIsCommand('foo bar', 'stable'), /Unsafe server data folder name/);
			assert.throws(() => buildCleanupOldCLIsCommand('.vscode-server', 'foo bar'), /Unsafe quality/);
		});
	});

	suite('buildFindFallbackCLICommand', () => {
		test('lists commit-keyed candidates then legacy paths for insider', () => {
			const cmd = buildFindFallbackCLICommand('.vscode-server-insiders', 'insider');
			// New commit-keyed candidates in shared install root, sorted newest-first.
			assert.ok(cmd.includes('~/.vscode-server-insiders/code-insiders-'), `cmd missing new path: ${cmd}`);
			assert.ok(/ls -1t/.test(cmd), 'should sort commit-keyed candidates by mtime');
			// Legacy single-binary path (insider has the `-insider` dir suffix).
			assert.ok(cmd.includes('~/.vscode-cli-insider/code-insiders'), `cmd missing legacy path: ${cmd}`);
		});

		test('uses no-suffix legacy dir for stable', () => {
			const cmd = buildFindFallbackCLICommand('.vscode-server', 'stable');
			assert.ok(cmd.includes('~/.vscode-cli/code'), `cmd missing stable legacy path: ${cmd}`);
			assert.ok(!cmd.includes('.vscode-cli-stable'), 'stable should not get the -<quality> suffix');
		});

		test('rejects unsafe inputs', () => {
			assert.throws(() => buildFindFallbackCLICommand('foo bar', 'stable'), /Unsafe server data folder name/);
			assert.throws(() => buildFindFallbackCLICommand('.vscode-server', 'foo bar'), /Unsafe quality/);
		});
	});

	suite('isValidFallbackCLIPath', () => {
		const sdf = '.vscode-server-insiders';
		const q = 'insider';
		const hex = '0123456789abcdef0123456789abcdef01234567';

		test('accepts commit-keyed path under the shared install root', () => {
			assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex}`, sdf, q), true);
		});

		test('accepts legacy ~/.vscode-cli-<quality>/<archive> path for insider', () => {
			assert.strictEqual(isValidFallbackCLIPath('~/.vscode-cli-insider/code-insiders', sdf, q), true);
		});

		test('accepts legacy ~/.vscode-cli/code path for stable', () => {
			assert.strictEqual(isValidFallbackCLIPath('~/.vscode-cli/code', '.vscode-server', 'stable'), true);
		});

		test('rejects commit suffix with non-hex characters', () => {
			const notHex = 'g'.repeat(40);
			assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${notHex}`, sdf, q), false);
		});

		test('rejects commit suffix with wrong length', () => {
			assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex.slice(0, 39)}`, sdf, q), false);
			assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex}a`, sdf, q), false);
		});

		test('rejects paths under an unexpected root', () => {
			assert.strictEqual(isValidFallbackCLIPath(`~/.something-else/code-insiders-${hex}`, sdf, q), false);
		});

		test('rejects empty input', () => {
			assert.strictEqual(isValidFallbackCLIPath('', sdf, q), false);
		});

		test('rejects shell metacharacters', () => {
			assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex}; rm -rf /`, sdf, q), false);
			assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex} && evil`, sdf, q), false);
		});
	});

	suite('redactToken', () => {
		test('redacts token in WebSocket URL', () => {
			assert.strictEqual(
				redactToken('ws://127.0.0.1:12345?tkn=secret123'),
				'ws://127.0.0.1:12345?tkn=***'
			);
		});

		test('redacts token with following whitespace', () => {
			assert.strictEqual(
				redactToken('ws://127.0.0.1:12345?tkn=abc123 done'),
				'ws://127.0.0.1:12345?tkn=*** done'
			);
		});

		test('preserves text without tokens', () => {
			assert.strictEqual(redactToken('no token here'), 'no token here');
		});

		test('redacts multiple tokens', () => {
			assert.strictEqual(
				redactToken('?tkn=one and ?tkn=two'),
				'?tkn=*** and ?tkn=***'
			);
		});
	});

	suite('getAgentHostLockfile', () => {
		test('returns path under the launcher data dir', () => {
			assert.strictEqual(
				getAgentHostLockfile('.vscode-server-insiders', 'insider'),
				'~/.vscode-server-insiders/cli/agent-host-insider.lock'
			);
		});

		test('keys lockfile name on quality', () => {
			assert.strictEqual(
				getAgentHostLockfile('.vscode-server-oss', 'stable'),
				'~/.vscode-server-oss/cli/agent-host-stable.lock'
			);
		});

		test('rejects unsafe server data folder names', () => {
			assert.throws(() => getAgentHostLockfile('foo bar', 'stable'), /Unsafe server data folder name/);
			assert.throws(() => getAgentHostLockfile('foo/bar', 'stable'), /Unsafe server data folder name/);
			assert.throws(() => getAgentHostLockfile('$(whoami)', 'stable'), /Unsafe server data folder name/);
		});

		test('rejects unsafe quality strings', () => {
			assert.throws(() => getAgentHostLockfile('.vscode-server-oss', 'foo bar'), /Unsafe quality/);
		});
	});

	suite('findRunningAgentHost', () => {

		function createMockExec(responses: Map<string, { stdout: string; stderr: string; code: number }>): ISshExec {
			return async (command: string, _opts?: { ignoreExitCode?: boolean }) => {
				for (const [pattern, response] of responses) {
					if (command.includes(pattern)) {
						return response;
					}
				}
				return { stdout: '', stderr: '', code: 1 };
			};
		}

		test('returns notFound when no state file exists', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: '', stderr: '', code: 1 }],
			]));
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'notFound' });
		});

		test('returns notFound when state file is empty', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: '   \n', stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'notFound' });
		});

		test('cleans up corrupt state file', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: 'not json at all', stderr: '', code: 0 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'notFound' });
			assert.ok(commands.some(c => c.includes('rm -f')));
		});

		test('cleans up state file with missing schemaVersion', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: JSON.stringify({ pid: 1234, port: 8080, connectionToken: null }), stderr: '', code: 0 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'notFound' });
			assert.ok(commands.some(c => c.includes('rm -f')));
		});

		test('rejects state file with invalid pid', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify({ schemaVersion: 1, pid: '1234', port: 8080, protocolVersion: PROTOCOL_VERSION }), stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'notFound' });
		});

		test('rejects state file with port above 65535', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify({ schemaVersion: 1, pid: 1234, port: 70000, protocolVersion: PROTOCOL_VERSION }), stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'notFound' });
		});

		test('cleans up stale state when PID is not running', async () => {
			const state = stateJson(9999, 8080, 'tok123');
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: state, stderr: '', code: 0 };
				}
				if (command.includes('kill -0')) {
					return { stdout: '', stderr: '', code: 1 }; // PID not running
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'notFound' });
			assert.ok(commands.some(c => c.includes('rm -f')));
		});

		test('returns port and token when PID is alive', async () => {
			const state = stateJson(1234, 8080, 'mytoken');
			const exec = createMockExec(new Map([
				['cat', { stdout: state, stderr: '', code: 0 }],
				['kill -0', { stdout: '', stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'compatible', host: '127.0.0.1', port: 8080, connectionToken: 'mytoken' });
		});

		test('returns undefined connectionToken when state has null token', async () => {
			const state = stateJson(1234, 8080, null);
			const exec = createMockExec(new Map([
				['cat', { stdout: state, stderr: '', code: 0 }],
				['kill -0', { stdout: '', stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'compatible', host: '127.0.0.1', port: 8080, connectionToken: undefined });
		});

		test('treats newer protocol version as compatible (the AH may speak a newer version than this build)', async () => {
			// The agent host server is downloaded on demand by the remote
			// CLI and may speak a newer protocol than this desktop. Reuse
			// is the right default; the renderer↔AH handshake will surface
			// any genuine incompatibility, and the SSH service falls back
			// to spawning fresh if the relay refuses to connect.
			const state = JSON.parse(stateJson(1234, 8080, null));
			state.protocolVersion = '99.0.0';
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify(state), stderr: '', code: 0 }],
				['kill -0', { stdout: '', stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'compatible', host: '127.0.0.1', port: 8080, connectionToken: undefined });
		});

		test('maps recorded `0.0.0.0` bind to loopback when dialing', async () => {
			const state = JSON.parse(stateJson(1234, 8080, null));
			state.host = '0.0.0.0';
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify(state), stderr: '', code: 0 }],
				['kill -0', { stdout: '', stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'compatible', host: '127.0.0.1', port: 8080, connectionToken: undefined });
		});

		test('preserves specific recorded host (e.g. IPv6 loopback)', async () => {
			const state = JSON.parse(stateJson(1234, 8080, null));
			state.host = '::1';
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify(state), stderr: '', code: 0 }],
				['kill -0', { stdout: '', stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.deepStrictEqual(result, { kind: 'compatible', host: '::1', port: 8080, connectionToken: undefined });
		});

		test('reads from the per-quality launcher lockfile path', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async command => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 1 };
			};
			await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
			assert.ok(commands.some(c => c.includes(lockfilePath)));
		});
	});

	suite('writeAgentHostState', () => {

		test('does not write when pid is undefined', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 0 };
			};
			await writeAgentHostState(exec, logService, serverDataFolderName, quality, undefined, 8080, 'token');
			assert.strictEqual(commands.length, 0);
		});

		test('does not write when pid is 0', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 0 };
			};
			await writeAgentHostState(exec, logService, serverDataFolderName, quality, 0, 8080, 'token');
			assert.strictEqual(commands.length, 0);
		});

		test('writes lockfile with canonical metadata JSON', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 0 };
			};
			await writeAgentHostState(exec, logService, serverDataFolderName, quality, 1234, 8080, 'mytoken');
			assert.strictEqual(commands.length, 1);
			assert.ok(commands[0].includes(lockfilePath));
			assert.ok(commands[0].includes('"schemaVersion":1'));
			assert.ok(commands[0].includes('"pid":1234'));
			assert.ok(commands[0].includes('"port":8080'));
			assert.ok(commands[0].includes('"connectionToken":"mytoken"'));
			assert.ok(commands[0].includes(`"protocolVersion":"${PROTOCOL_VERSION}"`));
			assert.ok(commands[0].includes('"quality":"insider"'));
			// Atomic-ish write: ensure dir, remove old file, restrictive umask
			assert.ok(commands[0].includes('mkdir -p'));
			assert.ok(commands[0].includes('rm -f'));
			assert.ok(commands[0].includes('(umask 077'));
		});

		test('writes null connectionToken when undefined', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 0 };
			};
			await writeAgentHostState(exec, logService, serverDataFolderName, quality, 1234, 8080, undefined);
			assert.strictEqual(commands.length, 1);
			assert.ok(commands[0].includes('"connectionToken":null'));
		});

		test('logs warning when write command fails', async () => {
			const exec: ISshExec = async () => {
				return { stdout: '', stderr: 'Permission denied', code: 1 };
			};
			const warnings: string[] = [];
			const capturingLog = new NullLogService();
			capturingLog.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
			await writeAgentHostState(exec, capturingLog, serverDataFolderName, quality, 1234, 8080, 'tok');
			assert.strictEqual(warnings.length, 1);
			assert.ok(warnings[0].includes('Failed to write'));
			assert.ok(warnings[0].includes('exit code 1'));
			assert.ok(warnings[0].includes('Permission denied'));
		});
	});

	suite('cleanupRemoteAgentHost', () => {

		test('removes lockfile even when no state exists', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: '', stderr: '', code: 1 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			await cleanupRemoteAgentHost(exec, logService, serverDataFolderName, quality);
			assert.ok(commands.some(c => c.includes(`rm -f ${lockfilePath}`)));
		});

		test('kills process and removes lockfile', async () => {
			const state = stateJson(5678, 9090, null);
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: state, stderr: '', code: 0 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			await cleanupRemoteAgentHost(exec, logService, serverDataFolderName, quality);
			assert.ok(commands.some(c => c.includes('kill 5678')));
			assert.ok(commands.some(c => c.includes(`rm -f ${lockfilePath}`)));
		});

		test('handles corrupt state file gracefully', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: '{invalid json', stderr: '', code: 0 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			await cleanupRemoteAgentHost(exec, logService, serverDataFolderName, quality);
			assert.ok(commands.some(c => c.includes('rm -f')));
			assert.ok(!commands.some(c => c.startsWith('kill')));
		});
	});
});
