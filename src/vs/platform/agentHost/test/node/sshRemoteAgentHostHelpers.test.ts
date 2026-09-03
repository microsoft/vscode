/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { TelemetryConfiguration } from '../../../telemetry/common/telemetry.js';
import { AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION, type IAgentHostEndpointMetadata } from '../../common/agentHostEndpointRegistry.js';
import {
	buildAgentEndpointsCommand,
	buildAgentHostBaseCommand,
	buildAgentHostSpawnCommand,
	buildAgentRelayCommand,
	buildCLIDownloadUrl,
	buildCleanupOldCLIsCommand,
	buildFindFallbackCLICommand,
	filterLiveAgentHostEndpoints,
	findNewAgentHostEndpoint,
	getNewAgentHostRegistrationTimeoutMs,
	getRemoteCLIArchiveName,
	getRemoteCLIBin,
	getRemoteCLIDataDir,
	getRemoteCLIInstallRoot,
	isValidFallbackCLIPath,
	parseAgentEndpointsOutput,
	redactToken,
	resolveRemotePlatform,
	runAgentEndpoints,
	shellEscape,
	validateAgentHostTelemetryLevel,
	validateCommit,
	validateShellToken,
	waitForNewStandaloneEndpoint,
	type ISshExec,
} from '../../node/sshRemoteAgentHostHelpers.js';
import { ensureRemoteAgentHostCliInstalled } from '../../node/remoteAgentHostCliInstaller.js';

suite('SSH Remote Agent Host Helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeEndpoint(overrides: Partial<IAgentHostEndpointMetadata> & Pick<IAgentHostEndpointMetadata, 'type' | 'pid' | 'instanceId'>): IAgentHostEndpointMetadata {
		return {
			schemaVersion: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			protocolVersion: '1.0.0',
			connectionToken: 'tok',
			endpoint: { type: 'tcp', host: '127.0.0.1', port: 8080 },
			// The shared schema-v2 parser always spreads `quality`/`tunnelName`
			// explicitly (even when absent from the input), so default them here
			// too to keep deepStrictEqual comparisons against parser output exact.
			quality: undefined,
			tunnelName: undefined,
			...overrides,
		};
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
		test('includes --cli-data-dir and the default telemetry level before the agent host subcommand', () => {
			const cmd = buildAgentHostBaseCommand('~/.vscode-server/code-insiders-abc', '~/.vscode-server/cli', TelemetryConfiguration.ON);
			assert.strictEqual(cmd, '~/.vscode-server/code-insiders-abc --cli-data-dir ~/.vscode-server/cli --telemetry-level all agent host --port 0');
		});

		test('includes telemetry disablement before the agent host subcommand', () => {
			const cmd = buildAgentHostBaseCommand('~/.vscode-server/code-insiders-abc', '~/.vscode-server/cli', TelemetryConfiguration.OFF);
			assert.strictEqual(cmd, '~/.vscode-server/code-insiders-abc --cli-data-dir ~/.vscode-server/cli --telemetry-level off agent host --port 0');
		});

		test('rejects unsafe telemetry levels', () => {
			assert.throws(() => validateAgentHostTelemetryLevel('off; touch /tmp/unsafe'), /Unsafe telemetry level/);
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

		test('detects musl Linux x64 as Alpine', () => {
			assert.deepStrictEqual(resolveRemotePlatform('Linux', 'x86_64', 'musl'), { os: 'alpine', arch: 'x64' });
		});

		test('detects musl Linux arm64 as Alpine', () => {
			assert.deepStrictEqual(resolveRemotePlatform('Linux', 'aarch64', 'musl\n'), { os: 'alpine', arch: 'arm64' });
		});

		test('rejects musl Linux armhf because no Alpine CLI artifact exists', () => {
			assert.strictEqual(resolveRemotePlatform('Linux', 'armv7l', 'musl'), undefined);
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

		test('uses the Alpine artifact for musl Linux', () => {
			assert.strictEqual(
				buildCLIDownloadUrl('alpine', 'x64', 'insider'),
				'https://update.code.visualstudio.com/latest/cli-alpine-x64/insider'
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

	suite('buildAgentEndpointsCommand', () => {
		test('omits --user-data-dir when not yet known', () => {
			assert.strictEqual(
				buildAgentEndpointsCommand('~/.vscode-server/code', '~/.vscode-server/cli'),
				'~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli agent endpoints',
			);
		});

		test('includes --user-data-dir once resolved', () => {
			assert.strictEqual(
				buildAgentEndpointsCommand('~/.vscode-server/code', '~/.vscode-server/cli', '/home/user/.vscode-remote'),
				'~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli agent endpoints --user-data-dir \'/home/user/.vscode-remote\'',
			);
		});
	});

	suite('buildAgentHostSpawnCommand', () => {
		test('includes --new-instance, --user-data-dir and default --idle-timeout', () => {
			assert.strictEqual(
				buildAgentHostSpawnCommand('~/.vscode-server/code', '~/.vscode-server/cli', '/home/user/.vscode-remote', TelemetryConfiguration.ON),
				'~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli --telemetry-level all agent host --port 0 --new-instance --user-data-dir \'/home/user/.vscode-remote\' --idle-timeout 300',
			);
		});

		test('honors a custom idle timeout', () => {
			assert.strictEqual(
				buildAgentHostSpawnCommand('~/.vscode-server/code', '~/.vscode-server/cli', '/home/user/.vscode-remote', TelemetryConfiguration.ON, 60),
				'~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli --telemetry-level all agent host --port 0 --new-instance --user-data-dir \'/home/user/.vscode-remote\' --idle-timeout 60',
			);
		});

		test('propagates telemetry disablement to a new dedicated agent host', () => {
			assert.strictEqual(
				buildAgentHostSpawnCommand('~/.vscode-server/code', '~/.vscode-server/cli', '/home/user/.vscode-remote', TelemetryConfiguration.OFF),
				'~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli --telemetry-level off agent host --port 0 --new-instance --user-data-dir \'/home/user/.vscode-remote\' --idle-timeout 300',
			);
		});

		test('rejects unsafe idle timeout values', () => {
			assert.throws(() => buildAgentHostSpawnCommand('~/.vscode-server/code', '~/.vscode-server/cli', '/x', TelemetryConfiguration.ON, 0), /Unsafe idle timeout/);
			assert.throws(() => buildAgentHostSpawnCommand('~/.vscode-server/code', '~/.vscode-server/cli', '/x', TelemetryConfiguration.ON, -1), /Unsafe idle timeout/);
			assert.throws(() => buildAgentHostSpawnCommand('~/.vscode-server/code', '~/.vscode-server/cli', '/x', TelemetryConfiguration.ON, 1.5), /Unsafe idle timeout/);
		});

		test('always includes --new-instance so an existing standalone is never silently reused', () => {
			const cmd = buildAgentHostSpawnCommand('~/.vscode-server/code', '~/.vscode-server/cli', '/x', TelemetryConfiguration.ON);
			assert.ok(cmd.includes(' --new-instance '), 'spawn command must request a genuinely new instance, not reuse an existing standalone');
		});
	});

	suite('buildAgentRelayCommand', () => {
		test('builds a relay command scoped to the exact instanceId', () => {
			assert.strictEqual(
				buildAgentRelayCommand('~/.vscode-server/code', '~/.vscode-server/cli', 'abc-123', '/home/user/.vscode-remote'),
				'~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli agent relay \'abc-123\' --user-data-dir \'/home/user/.vscode-remote\'',
			);
		});
	});

	suite('parseAgentEndpointsOutput', () => {
		test('returns undefined for empty output', () => {
			assert.strictEqual(parseAgentEndpointsOutput(''), undefined);
			assert.strictEqual(parseAgentEndpointsOutput('   \n'), undefined);
		});

		test('returns undefined for invalid JSON', () => {
			assert.strictEqual(parseAgentEndpointsOutput('not json'), undefined);
		});

		test('returns undefined when the envelope is missing userDataPath/endpoints', () => {
			assert.strictEqual(parseAgentEndpointsOutput(JSON.stringify({ endpoints: [] })), undefined);
			assert.strictEqual(parseAgentEndpointsOutput(JSON.stringify({ userDataPath: '/x' })), undefined);
		});

		test('parses a well-formed envelope and validates each endpoint', () => {
			const endpoint = makeEndpoint({ type: 'standalone', pid: 111, instanceId: 'i1' });
			const result = parseAgentEndpointsOutput(JSON.stringify({ userDataPath: '/home/user/.vscode-remote', endpoints: [endpoint] }));
			assert.ok(result);
			assert.strictEqual(result.userDataPath, '/home/user/.vscode-remote');
			assert.deepStrictEqual(result.endpoints, [endpoint]);
		});

		test('drops malformed individual endpoint entries without failing the whole parse', () => {
			const good = makeEndpoint({ type: 'editor', pid: 222, instanceId: 'i2' });
			const result = parseAgentEndpointsOutput(JSON.stringify({ userDataPath: '/x', endpoints: [good, { garbage: true }] }));
			assert.ok(result);
			assert.deepStrictEqual(result.endpoints, [good]);
		});
	});

	suite('runAgentEndpoints', () => {
		test('parses stdout on success', async () => {
			const endpoint = makeEndpoint({ type: 'standalone', pid: 333, instanceId: 'i3' });
			const exec: ISshExec = async () => ({
				stdout: JSON.stringify({ userDataPath: '/home/user/.vscode-remote', endpoints: [endpoint] }),
				stderr: '',
				code: 0,
			});
			const result = await runAgentEndpoints(exec, '~/.vscode-server/code', '~/.vscode-server/cli');
			assert.strictEqual(result.userDataPath, '/home/user/.vscode-remote');
			assert.deepStrictEqual(result.endpoints, [endpoint]);
		});

		test('passes the resolved --user-data-dir through to the command', async () => {
			const commands: string[] = [];
			const exec: ISshExec = async command => {
				commands.push(command);
				return { stdout: JSON.stringify({ userDataPath: '/x', endpoints: [] }), stderr: '', code: 0 };
			};
			await runAgentEndpoints(exec, '~/.vscode-server/code', '~/.vscode-server/cli', '/home/user/.vscode-remote');
			assert.ok(commands.some(c => c.includes('--user-data-dir \'/home/user/.vscode-remote\'')));
		});

		test('throws (loudly) when the command exits non-zero', async () => {
			const exec: ISshExec = async () => ({ stdout: '', stderr: 'command not found', code: 127 });
			await assert.rejects(
				() => runAgentEndpoints(exec, '~/.vscode-server/code', '~/.vscode-server/cli'),
				/exit code 127.*command not found/s,
			);
		});

		test('throws when output cannot be parsed', async () => {
			const exec: ISshExec = async () => ({ stdout: 'not json', stderr: '', code: 0 });
			await assert.rejects(
				() => runAgentEndpoints(exec, '~/.vscode-server/code', '~/.vscode-server/cli'),
				/unparsable output \(8 characters\)$/,
			);
		});

		test('parses JSON after legacy CLI log output', async () => {
			const output = `[2026-08-06 15:31:19] info Pruning stale local endpoint registry entry\n${JSON.stringify({ userDataPath: '/tmp/user-data', endpoints: [] })}`;
			const exec: ISshExec = async () => ({ stdout: output, stderr: '', code: 0 });

			const result = await runAgentEndpoints(exec, '~/.vscode-server/code', '~/.vscode-server/cli');

			assert.deepStrictEqual(result, {
				userDataPath: '/tmp/user-data',
				endpoints: [],
			});
		});
	});

	suite('filterLiveAgentHostEndpoints', () => {
		test('keeps only entries whose PID responds to kill -0', async () => {
			const alive = makeEndpoint({ type: 'standalone', pid: 100, instanceId: 'alive' });
			const dead = makeEndpoint({ type: 'standalone', pid: 200, instanceId: 'dead' });
			const exec: ISshExec = async command => {
				if (command.includes('kill -0 100')) {
					return { stdout: '', stderr: '', code: 0 };
				}
				if (command.includes('kill -0 200')) {
					return { stdout: '', stderr: '', code: 1 };
				}
				throw new Error(`unexpected command: ${command}`);
			};
			const result = await filterLiveAgentHostEndpoints(exec, [alive, dead]);
			assert.deepStrictEqual(result, [alive]);
		});

		test('probes each distinct PID at most once', async () => {
			const first = makeEndpoint({ type: 'editor', pid: 100, instanceId: 'e1' });
			const second = makeEndpoint({ type: 'standalone', pid: 100, instanceId: 'e2' });
			let probes = 0;
			const exec: ISshExec = async command => {
				if (command.includes('kill -0 100')) {
					probes++;
					return { stdout: '', stderr: '', code: 0 };
				}
				throw new Error(`unexpected command: ${command}`);
			};
			const result = await filterLiveAgentHostEndpoints(exec, [first, second]);
			assert.strictEqual(probes, 1);
			assert.strictEqual(result.length, 2);
		});

		test('returns an empty array for an empty input', async () => {
			const exec: ISshExec = async () => { throw new Error('should not be called'); };
			assert.deepStrictEqual(await filterLiveAgentHostEndpoints(exec, []), []);
		});
	});

	suite('findNewAgentHostEndpoint', () => {
		test('returns the standalone entry present only in "after"', () => {
			const before = [makeEndpoint({ type: 'standalone', pid: 1, instanceId: 'old' })];
			const spawned = makeEndpoint({ type: 'standalone', pid: 2, instanceId: 'new' });
			const after = [...before, spawned];
			assert.deepStrictEqual(findNewAgentHostEndpoint(before, after), spawned);
		});

		test('ignores new editor-owned entries (only standalone spawns are matched)', () => {
			const before: IAgentHostEndpointMetadata[] = [];
			const newEditor = makeEndpoint({ type: 'editor', pid: 5, instanceId: 'e' });
			assert.strictEqual(findNewAgentHostEndpoint(before, [newEditor]), undefined);
		});

		test('returns undefined when nothing changed', () => {
			const entries = [makeEndpoint({ type: 'standalone', pid: 1, instanceId: 'same' })];
			assert.strictEqual(findNewAgentHostEndpoint(entries, entries), undefined);
		});
	});

	suite('ensureRemoteAgentHostCliInstalled', () => {
		test('reports whether a CLI was reused or installed', async () => {
			const cliBin = getRemoteCLIBin('.vscode-server', 'insider');
			const options = {
				serverDataFolderName: '.vscode-server',
				quality: 'insider',
				commit: undefined,
				reportInstalling: () => { },
				logService: new NullLogService(),
			};
			const commit = '1234567890abcdef1234567890abcdef12345678';
			const pinnedOptions = { ...options, commit };
			const pinnedCliBin = getRemoteCLIBin('.vscode-server', 'insider', commit);
			const reused = await ensureRemoteAgentHostCliInstalled(
				async () => ({ stdout: '1.0.0\n__vscode_cli_update_exit_code__:0\n', stderr: '', code: 0 }),
				{ os: 'linux', arch: 'x64' },
				options,
			);
			let calls = 0;
			const installed = await ensureRemoteAgentHostCliInstalled(
				async () => {
					calls++;
					return { stdout: '', stderr: '', code: calls === 1 ? 1 : 0 };
				},
				{ os: 'linux', arch: 'x64' },
				options,
			);
			const reusedPinned = await ensureRemoteAgentHostCliInstalled(
				async () => ({ stdout: '', stderr: '', code: 0 }),
				{ os: 'linux', arch: 'x64' },
				pinnedOptions,
			);
			calls = 0;
			const installedPinned = await ensureRemoteAgentHostCliInstalled(
				async () => {
					calls++;
					return { stdout: '', stderr: '', code: calls === 1 ? 1 : 0 };
				},
				{ os: 'linux', arch: 'x64' },
				pinnedOptions,
			);

			assert.deepStrictEqual(
				{
					reused,
					installed,
					reusedPinned,
					installedPinned,
					registrationTimeouts: {
						reused: getNewAgentHostRegistrationTimeoutMs(reused.installed),
						installed: getNewAgentHostRegistrationTimeoutMs(installed.installed),
						reusedPinned: getNewAgentHostRegistrationTimeoutMs(reusedPinned.installed),
						installedPinned: getNewAgentHostRegistrationTimeoutMs(installedPinned.installed),
					},
				},
				{
					reused: { cliBin, installed: false },
					installed: { cliBin, installed: true },
					reusedPinned: { cliBin: pinnedCliBin, installed: false },
					installedPinned: { cliBin: pinnedCliBin, installed: true },
					registrationTimeouts: { reused: undefined, installed: 300_000, reusedPinned: undefined, installedPinned: 300_000 },
				},
			);
		});
	});

	suite('waitForNewStandaloneEndpoint', () => {
		test('resolves as soon as the new endpoint appears', async () => {
			const before = [makeEndpoint({ type: 'standalone', pid: 1, instanceId: 'old' })];
			const spawned = makeEndpoint({ type: 'standalone', pid: 2, instanceId: 'new' });
			let poll = 0;
			const exec: ISshExec = async () => {
				poll++;
				const endpoints = poll < 2 ? before : [...before, spawned];
				return { stdout: JSON.stringify({ userDataPath: '/x', endpoints }), stderr: '', code: 0 };
			};
			const result = await waitForNewStandaloneEndpoint(exec, '~/.vscode-server/code', '~/.vscode-server/cli', '/x', before, { intervalMs: 1 });
			assert.deepStrictEqual(result, spawned);
			assert.ok(poll >= 2);
		});

		test('uses the default short deadline when no timeout is supplied', async () => {
			const before = [makeEndpoint({ type: 'standalone', pid: 1, instanceId: 'old' })];
			const exec: ISshExec = async () => ({ stdout: JSON.stringify({ userDataPath: '/x', endpoints: before }), stderr: '', code: 0 });
			await assert.rejects(
				() => waitForNewStandaloneEndpoint(exec, '~/.vscode-server/code', '~/.vscode-server/cli', '/x', before, { intervalMs: 1 }),
				/deadline 20ms/,
			);
		});

		test('keeps polling past the default deadline when given a longer deadline', async () => {
			const before = [makeEndpoint({ type: 'standalone', pid: 1, instanceId: 'old' })];
			const spawned = makeEndpoint({ type: 'standalone', pid: 2, instanceId: 'new' });
			let polls = 0;
			const exec: ISshExec = async () => {
				polls++;
				const endpoints = polls <= 20 ? before : [...before, spawned];
				return { stdout: JSON.stringify({ userDataPath: '/x', endpoints }), stderr: '', code: 0 };
			};

			const result = await waitForNewStandaloneEndpoint(exec, '~/.vscode-server/code', '~/.vscode-server/cli', '/x', before, { intervalMs: 1, timeoutMs: getNewAgentHostRegistrationTimeoutMs(true) });
			assert.deepStrictEqual({ result, polls }, { result: spawned, polls: 21 });
		});

		test('cancels promptly while waiting for registration', async () => {
			const before = [makeEndpoint({ type: 'standalone', pid: 1, instanceId: 'old' })];
			const cancellationSource = new CancellationTokenSource();
			let polls = 0;
			const exec: ISshExec = async () => {
				polls++;
				cancellationSource.cancel();
				return { stdout: JSON.stringify({ userDataPath: '/x', endpoints: before }), stderr: '', code: 0 };
			};

			try {
				await assert.rejects(
					() => waitForNewStandaloneEndpoint(exec, '~/.vscode-server/code', '~/.vscode-server/cli', '/x', before, { timeoutMs: 60_000, token: cancellationSource.token }),
					/Canceled/,
				);
				assert.deepStrictEqual(polls, 1);
			} finally {
				cancellationSource.dispose();
			}
		});
	});
});
