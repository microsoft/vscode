/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	buildCLIDownloadUrl,
	cleanupRemoteAgentHost,
	findRunningAgentHost,
	getAgentHostStateFile,
	getRemoteCLIBin,
	getRemoteCLIDir,
	redactToken,
	resolveRemotePlatform,
	shellEscape,
	validateShellToken,
	writeAgentHostState,
	type ISshExec,
} from '../../node/sshRemoteAgentHostHelpers.js';

suite('SSH Remote Agent Host Helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const logService = new NullLogService();

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

	suite('getRemoteCLIDir', () => {
		test('returns standard path for stable', () => {
			assert.strictEqual(getRemoteCLIDir('stable'), '~/.vscode-cli');
		});

		test('returns quality-suffixed path for insider', () => {
			assert.strictEqual(getRemoteCLIDir('insider'), '~/.vscode-cli-insider');
		});

		test('returns quality-suffixed path for exploration', () => {
			assert.strictEqual(getRemoteCLIDir('exploration'), '~/.vscode-cli-exploration');
		});
	});

	suite('getRemoteCLIBin', () => {
		test('returns code for stable', () => {
			assert.strictEqual(getRemoteCLIBin('stable'), '~/.vscode-cli/code');
		});

		test('returns code-insiders for insider', () => {
			assert.strictEqual(getRemoteCLIBin('insider'), '~/.vscode-cli-insider/code-insiders');
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
		test('constructs correct URL', () => {
			assert.strictEqual(
				buildCLIDownloadUrl('linux', 'x64', 'insider'),
				'https://update.code.visualstudio.com/latest/cli-linux-x64/insider'
			);
		});

		test('works for darwin arm64 stable', () => {
			assert.strictEqual(
				buildCLIDownloadUrl('darwin', 'arm64', 'stable'),
				'https://update.code.visualstudio.com/latest/cli-darwin-arm64/stable'
			);
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

	suite('getAgentHostStateFile', () => {
		test('returns path under CLI dir', () => {
			assert.strictEqual(
				getAgentHostStateFile('insider'),
				'~/.vscode-cli-insider/.agent-host-state'
			);
		});

		test('returns path for stable', () => {
			assert.strictEqual(
				getAgentHostStateFile('stable'),
				'~/.vscode-cli/.agent-host-state'
			);
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

		test('returns undefined when no state file exists', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: '', stderr: '', code: 1 }],
			]));
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
		});

		test('returns undefined when state file is empty', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: '   \n', stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
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
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
			assert.ok(commands.some(c => c.includes('rm -f')));
		});

		test('cleans up state file with missing pid', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: JSON.stringify({ pid: 0, port: 8080, connectionToken: null }), stderr: '', code: 0 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
			assert.ok(commands.some(c => c.includes('rm -f')));
		});

		test('cleans up state file with missing port', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: JSON.stringify({ pid: 1234, port: 0, connectionToken: null }), stderr: '', code: 0 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
			assert.ok(commands.some(c => c.includes('rm -f')));
		});

		test('rejects state file with string pid', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify({ pid: '1234', port: 8080, connectionToken: null }), stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
		});

		test('rejects state file with negative pid', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify({ pid: -1, port: 8080, connectionToken: null }), stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
		});

		test('rejects state file with non-integer port', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify({ pid: 1234, port: 8080.5, connectionToken: null }), stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
		});

		test('rejects state file with numeric connectionToken', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify({ pid: 1234, port: 8080, connectionToken: 42 }), stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
		});

		test('rejects state file with port above 65535', async () => {
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify({ pid: 1234, port: 70000, connectionToken: null }), stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
		});

		test('cleans up stale state when PID is not running', async () => {
			const state = { pid: 9999, port: 8080, connectionToken: 'tok123' };
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: JSON.stringify(state), stderr: '', code: 0 };
				}
				if (command.includes('kill -0')) {
					return { stdout: '', stderr: '', code: 1 }; // PID not running
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.strictEqual(result, undefined);
			assert.ok(commands.some(c => c.includes('rm -f')));
		});

		test('returns port and token when PID is alive', async () => {
			const state = { pid: 1234, port: 8080, connectionToken: 'mytoken' };
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify(state), stderr: '', code: 0 }],
				['kill -0', { stdout: '', stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.deepStrictEqual(result, { port: 8080, connectionToken: 'mytoken' });
		});

		test('returns undefined connectionToken when state has null token', async () => {
			const state = { pid: 1234, port: 8080, connectionToken: null };
			const exec = createMockExec(new Map([
				['cat', { stdout: JSON.stringify(state), stderr: '', code: 0 }],
				['kill -0', { stdout: '', stderr: '', code: 0 }],
			]));
			const result = await findRunningAgentHost(exec, logService, 'insider');
			assert.deepStrictEqual(result, { port: 8080, connectionToken: undefined });
		});
	});

	suite('writeAgentHostState', () => {

		test('does not write when pid is undefined', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 0 };
			};
			await writeAgentHostState(exec, logService, 'insider', undefined, 8080, 'token');
			assert.strictEqual(commands.length, 0);
		});

		test('does not write when pid is 0', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 0 };
			};
			await writeAgentHostState(exec, logService, 'insider', 0, 8080, 'token');
			assert.strictEqual(commands.length, 0);
		});

		test('writes state file with correct JSON', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 0 };
			};
			await writeAgentHostState(exec, logService, 'insider', 1234, 8080, 'mytoken');
			assert.strictEqual(commands.length, 1);
			assert.ok(commands[0].includes('.agent-host-state'));
			// Verify the JSON content is present in the echo command
			assert.ok(commands[0].includes('"pid":1234'));
			assert.ok(commands[0].includes('"port":8080'));
			assert.ok(commands[0].includes('"connectionToken":"mytoken"'));
			// Verify restrictive umask in a subshell is used to protect the connection token
			assert.ok(commands[0].includes('rm -f'));
			assert.ok(commands[0].includes('(umask 077'));
		});

		test('writes null connectionToken when undefined', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 0 };
			};
			await writeAgentHostState(exec, logService, 'insider', 1234, 8080, undefined);
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
			await writeAgentHostState(exec, capturingLog, 'insider', 1234, 8080, 'tok');
			// Should log a warning with exit code and stderr
			assert.strictEqual(warnings.length, 1);
			assert.ok(warnings[0].includes('Failed to write'));
			assert.ok(warnings[0].includes('exit code 1'));
			assert.ok(warnings[0].includes('Permission denied'));
		});
	});

	suite('cleanupRemoteAgentHost', () => {

		test('removes state file even when no state exists', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: '', stderr: '', code: 1 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			await cleanupRemoteAgentHost(exec, logService, 'insider');
			assert.ok(commands.some(c => c.includes('rm -f')));
		});

		test('kills process and removes state file', async () => {
			const state = { pid: 5678, port: 9090, connectionToken: null };
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: JSON.stringify(state), stderr: '', code: 0 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			await cleanupRemoteAgentHost(exec, logService, 'insider');
			assert.ok(commands.some(c => c.includes('kill 5678')));
			assert.ok(commands.some(c => c.includes('rm -f')));
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
			// Should not throw
			await cleanupRemoteAgentHost(exec, logService, 'insider');
			// Should still clean up the file
			assert.ok(commands.some(c => c.includes('rm -f')));
			// Should not have attempted to kill anything
			assert.ok(!commands.some(c => c.startsWith('kill')));
		});

		test('does not kill when pid is 0', async () => {
			const state = { pid: 0, port: 9090, connectionToken: null };
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: JSON.stringify(state), stderr: '', code: 0 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			await cleanupRemoteAgentHost(exec, logService, 'insider');
			assert.ok(!commands.some(c => c.match(/^kill \d/)));
			assert.ok(commands.some(c => c.includes('rm -f')));
		});

		test('kills process for stable quality', async () => {
			const state = { pid: 1234, port: 8080, connectionToken: null };
			const commands: string[] = [];
			const exec: ISshExec = async (command: string) => {
				commands.push(command);
				if (command.includes('cat')) {
					return { stdout: JSON.stringify(state), stderr: '', code: 0 };
				}
				return { stdout: '', stderr: '', code: 0 };
			};
			await cleanupRemoteAgentHost(exec, logService, 'stable');
			assert.ok(commands.some(c => c.includes('kill 1234')));
		});
	});
});
