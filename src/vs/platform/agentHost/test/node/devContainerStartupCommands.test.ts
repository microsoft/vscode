/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdir, mkdtemp, realpath, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join } from '../../../../base/common/path.js';
import { isLinux } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildAddGitSafeDirectoryCommand, buildConfigureGitIdentityCommand, buildDevContainerProbeCommand, parseConfiguredGitIdentityKeys, parseDevContainerProbeResult } from '../../node/devContainerStartupCommands.js';
import { resolveRemotePlatform } from '../../node/sshRemoteAgentHostHelpers.js';

suite('Dev Container startup commands', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses the probe output and falls back to Git\'s dubious ownership error', () => {
		const stdout = 'os=Linux\nmachine=aarch64\nlibc=musl\nuid=1000\ngid=1001\n';
		assert.deepStrictEqual([
			parseDevContainerProbeResult({ stdout: `${stdout}gitRoot=/workspaces/a=b\n`, stderr: '' }),
			parseDevContainerProbeResult({ stdout, stderr: 'fatal: detected dubious ownership in repository at \'/workspaces/project\'\n' }),
			parseDevContainerProbeResult({ stdout: '', stderr: '' }),
		], [
			{ os: 'Linux', machine: 'aarch64', libc: 'musl', uid: '1000', gid: '1001', gitRootFolder: '/workspaces/a=b' },
			{ os: 'Linux', machine: 'aarch64', libc: 'musl', uid: '1000', gid: '1001', gitRootFolder: '/workspaces/project' },
			{ os: '', machine: '', libc: '', uid: '', gid: '', gitRootFolder: undefined },
		]);
	});

	test('skips Git identity setup without a host identity and reports only known keys', () => {
		assert.deepStrictEqual({
			command: buildConfigureGitIdentityCommand({ name: undefined, email: '' }),
			keys: parseConfiguredGitIdentityKeys('user.email\nuser.name\nother\n'),
		}, {
			command: undefined,
			keys: ['user.email', 'user.name'],
		});
	});

	(isLinux ? suite : suite.skip)('in a shell', () => {
		let root: string;
		let env: NodeJS.ProcessEnv;
		const run = async (command: string, cwd = root) => (await promisify(execFile)('/bin/sh', ['-c', command], { cwd, env })).stdout;
		const git = async (args: string[], cwd = root) => (await promisify(execFile)('git', args, { cwd, env })).stdout;

		setup(async () => {
			root = await realpath(await mkdtemp(join(tmpdir(), 'vscode-dev-container-startup-')));
			await mkdir(join(root, 'home'));
			env = { ...process.env, HOME: join(root, 'home'), XDG_CONFIG_HOME: join(root, 'home', '.config'), GIT_CONFIG_NOSYSTEM: '1' };
			delete env.GIT_CONFIG_GLOBAL;
		});

		teardown(() => rm(root, { recursive: true, force: true }));

		test('probes the platform and user without reporting a repository the user owns', async () => {
			assert.ok(process.getuid && process.getgid);
			const repository = join(root, 'repo');
			await git(['init', '-q', repository]);
			const probe = parseDevContainerProbeResult({ stdout: await run(buildDevContainerProbeCommand(repository)), stderr: '' });
			assert.deepStrictEqual({
				supported: !!resolveRemotePlatform(probe.os, probe.machine, probe.libc),
				uid: probe.uid,
				gid: probe.gid,
				gitRootFolder: probe.gitRootFolder,
			}, {
				supported: true,
				uid: String(process.getuid()),
				gid: String(process.getgid()),
				gitRootFolder: undefined,
			});
		});

		test('adds a safe.directory entry once and does not match it by prefix', async () => {
			const project = `${root}/it's a project`;
			await git(['config', '--global', '--add', 'safe.directory', `${project}/nested`]);
			const outputs = [await run(buildAddGitSafeDirectoryCommand(project)), await run(buildAddGitSafeDirectoryCommand(project))];
			assert.deepStrictEqual({
				outputs,
				configured: (await git(['config', '--global', '--get-all', 'safe.directory'])).split('\n').filter(Boolean),
			}, {
				outputs: ['added', ''],
				configured: [`${project}/nested`, project],
			});
		});

		test('sets only identity values the repository does not provide', async () => {
			const repository = join(root, 'repo');
			await git(['init', '-q', repository]);
			await git(['config', 'user.email', 'repository@example.com'], repository);
			const command = buildConfigureGitIdentityCommand({ name: 'Host O\'User', email: 'host@example.com' });
			assert.ok(command);
			const outputs = [await run(command, repository), await run(command, repository)];
			const global = async (key: string) => (await git(['config', '--global', '--get', key]).catch(() => '')).trim();
			assert.deepStrictEqual({
				outputs: outputs.map(parseConfiguredGitIdentityKeys),
				name: await global('user.name'),
				email: await global('user.email'),
			}, {
				outputs: [['user.name'], []],
				name: 'Host O\'User',
				email: '',
			});
		});
	});
});
