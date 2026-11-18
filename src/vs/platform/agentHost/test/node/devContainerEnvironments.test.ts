/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IGitHubService } from '../../../github/common/githubService.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IRequestService } from '../../../request/common/request.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { devContainerEnvironmentImage, devContainerEnvironmentUri, findDevContainerEnvironment } from '../../common/devContainerEnvironments.js';
import { DevContainerAgentHostMainService } from '../../node/devContainerAgentHostService.js';
import { devContainerEnvironmentLabel, getDevContainerEnvironmentVolumeName, prepareDevContainerEnvironment } from '../../node/devContainerEnvironments.js';
import { devContainerStateIdLabel, getDevContainerId, getDevContainerStateVolumeName } from '../../node/devContainerState.js';

suite('Dev Container environments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const environmentId = '0b5c8e9e-6d2a-4f4e-9a52-3f1c2d4e5f60';
	const volumeName = getDevContainerEnvironmentVolumeName(environmentId);
	let cacheDirectory: string;

	setup(async () => {
		cacheDirectory = await mkdtemp(join(tmpdir(), 'vscode-dev-container-environment-test-'));
	});
	teardown(async () => {
		await rm(cacheDirectory, { recursive: true, force: true });
	});

	test('only recognizes environment URIs with a source authority and a valid identifier', () => {
		const uri = devContainerEnvironmentUri('ssh-host', environmentId);
		assert.deepStrictEqual([
			uri,
			uri.with({ authority: '' }),
			uri.with({ path: '/Not Valid' }),
			uri.with({ query: 'image=untrusted' }),
		].map(findDevContainerEnvironment), [{ sourceAuthority: 'ssh-host', environmentId }, undefined, undefined, undefined]);
	});

	test('creates the volume once and hands the volume root to the remote user on every start', async () => {
		const calls: string[] = [];
		let existing = false;
		const commands: Parameters<typeof prepareDevContainerEnvironment>[2] = {
			onContainerStarted: id => calls.push(`started ${id}`),
			docker: async args => {
				calls.push(args[0] === 'volume' ? `volume ${args[1]}` : `exec ${args.at(-1)}`);
				const stdout = args[1] === 'ls' ? (existing ? `other\n${volumeName}` : 'other')
					: args[1] === 'inspect' ? JSON.stringify({ [devContainerEnvironmentLabel]: environmentId }) : '';
				return { stdout, stderr: '', code: 0 };
			},
			devcontainer: async args => {
				calls.push(args.filter(arg => !arg.startsWith(cacheDirectory)).join(' '));
				return { stdout: JSON.stringify({ outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: '/workspaces' }), stderr: '', code: 0 };
			},
		};
		const source = { environmentId, image: devContainerEnvironmentImage };
		const first = await prepareDevContainerEnvironment(source, cacheDirectory, commands);
		existing = true;
		await prepareDevContainerEnvironment(source, cacheDirectory, commands);
		const label = `${devContainerEnvironmentLabel}=${environmentId}`;
		const up = `up --log-level debug --override-config --id-label ${label} --mount type=volume,source=vscode,target=/vscode,external=true`;
		const chown = `exec chown "$(id -u 'vscode'):$(id -g 'vscode')" '/workspaces'`;
		assert.deepStrictEqual({
			calls,
			prepared: first,
			config: JSON.parse(await readFile(join(cacheDirectory, 'devcontainer.json'), 'utf8')),
		}, {
			calls: ['volume ls', 'volume create', 'volume inspect', up, 'started container', chown, 'volume ls', 'volume inspect', up, 'started container', chown],
			prepared: { containerId: 'container', remoteWorkspaceFolder: '/workspaces', cliArgs: ['--override-config', join(cacheDirectory, 'devcontainer.json'), '--id-label', label] },
			config: { image: devContainerEnvironmentImage, workspaceFolder: '/workspaces', workspaceMount: `type=volume,source=${volumeName},target=/workspaces`, updateRemoteUserUID: false },
		});
	});

	test('keeps user state on its own state volume, linked before lifecycle commands run', async () => {
		const calls: string[] = [];
		const reports: string[] = [];
		const label = `${devContainerEnvironmentLabel}=${environmentId}`;
		const stateVolumeName = getDevContainerStateVolumeName([label]);
		await prepareDevContainerEnvironment({ environmentId, image: devContainerEnvironmentImage }, cacheDirectory, {
			onContainerStarted: () => { },
			docker: async args => {
				calls.push(args[0] === 'exec' ? 'chown' : args[1] === 'create' ? `volume create ${args.at(-1)}` : args.slice(0, 2).join(' '));
				const stdout = args[1] === 'ls' ? '' : args[1] === 'inspect' ? JSON.stringify({ [devContainerEnvironmentLabel]: environmentId }) : args[0] === 'ps' ? 'exited' : '';
				return { stdout, stderr: '', code: 0 };
			},
			devcontainer: async args => {
				calls.push(args.filter(arg => !arg.startsWith(cacheDirectory)).join(' '));
				const result = args[0] === 'up' ? { outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: '/workspaces' } : { outcome: 'success' };
				return { stdout: JSON.stringify(result), stderr: '', code: 0 };
			},
			linkUserState: async (containerId, remoteUser, _selectorArgs, keepExistingFolders) => { calls.push(`link ${containerId} ${remoteUser} keepExistingFolders=${keepExistingFolders}`); },
			reportUserStateMount: error => reports.push(error === undefined ? 'added' : String(error)),
		}, false, true);
		assert.deepStrictEqual({ calls, reports }, {
			calls: [
				'volume ls', `volume create ${volumeName}`, 'volume inspect', `volume create ${stateVolumeName}`, 'ps -a',
				`up --log-level debug --override-config --id-label ${label} --skip-post-create --mount type=volume,source=vscode,target=/vscode,external=true --mount type=volume,source=${stateVolumeName},target=/.vscode-volume,external=true`,
				'chown', 'link container vscode keepExistingFolders=false',
				`run-user-commands --log-level debug --override-config --id-label ${label} --container-id container`,
			],
			reports: ['added'],
		});
	});

	test('rejects unsupported images and volumes of other owners before starting a container', async () => {
		const devcontainer = async () => { throw new Error('Dev Container CLI must not run'); };
		const onContainerStarted = () => { throw new Error('No container should be registered'); };
		await assert.rejects(prepareDevContainerEnvironment({ environmentId, image: 'example.com/untrusted' }, cacheDirectory, {
			onContainerStarted, devcontainer, docker: async () => { throw new Error('Docker must not run'); },
		}), /Unsupported Dev Container environment image/);
		await assert.rejects(prepareDevContainerEnvironment({ environmentId, image: devContainerEnvironmentImage }, cacheDirectory, {
			onContainerStarted, devcontainer,
			docker: async args => ({ stdout: args[1] === 'ls' ? volumeName : JSON.stringify({ [devContainerEnvironmentLabel]: 'other' }), stderr: '', code: 0 }),
		}), /does not belong to this Dev Container environment/);
	});

	test('removes the labeled containers, the owned volumes, and the cached configuration, and never recreates the environment', async () => {
		const calls: string[] = [];
		const label = `${devContainerEnvironmentLabel}=${environmentId}`;
		const stateVolumeName = getDevContainerStateVolumeName([label]);
		const configuration = new TestConfigurationService({});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const host = store.add(new class extends DevContainerAgentHostMainService {
			protected override async _runDocker(args: readonly string[]) {
				calls.push(args.join(' '));
				const stdout = args[0] === 'ps' ? 'first\nsecond\n'
					: args[1] === 'ls' ? `${volumeName}\n${stateVolumeName}`
						: args[1] === 'inspect' ? JSON.stringify({ [devContainerEnvironmentLabel]: environmentId, [devContainerStateIdLabel]: getDevContainerId([label]) }) : '';
				return { stdout, stderr: '', code: 0 };
			}
		}(
			new NullLogService(), new class extends mock<IProductService>() { }(), NullTelemetryService,
			configuration, new class extends mock<INativeEnvironmentService>() { override readonly userDataPath = cacheDirectory; }(),
			new class extends mock<IRequestService>() { }(), new class extends mock<IGitHubService>() { }(),
		));
		const environmentDirectory = join(cacheDirectory, 'devContainerEnvironments', environmentId);
		await mkdir(environmentDirectory, { recursive: true });
		const removed = await host.removeContainer({ environmentId });
		await assert.rejects(host.connect({ connectionId: 'late', name: 'Dev Container', resume: true, environmentId, image: devContainerEnvironmentImage }), /was deleted/);
		assert.deepStrictEqual({
			removed,
			calls,
			cacheRemoved: await stat(environmentDirectory).then(() => false, () => true),
		}, {
			removed: true,
			calls: [
				`ps --all --quiet --filter label=${devContainerEnvironmentLabel}=${environmentId}`,
				'rm --force first second',
				'volume ls --format {{.Name}}',
				`volume inspect --format {{json .Labels}} ${volumeName}`,
				`volume rm ${volumeName}`,
				`volume inspect --format {{json .Labels}} ${stateVolumeName}`,
				`volume rm ${stateVolumeName}`,
			],
			cacheRemoved: true,
		});
	});

	test('still starts an environment whose removal failed, so it can be used or deleted again', async () => {
		const configuration = new TestConfigurationService({});
		store.add(configuration.onDidChangeConfigurationEmitter);
		let dockerAvailable = false;
		const host = store.add(new class extends DevContainerAgentHostMainService {
			protected override async _runDocker(args: readonly string[]) {
				if (!dockerAvailable) {
					return { stdout: '', stderr: 'Cannot connect to the Docker daemon', code: 1 };
				}
				return { stdout: args[1] === 'ls' ? volumeName : args[1] === 'inspect' ? JSON.stringify({ [devContainerEnvironmentLabel]: environmentId }) : '', stderr: '', code: 0 };
			}
			protected override async _prepareEnvironment(): Promise<never> {
				throw new Error('Started');
			}
		}(
			new NullLogService(), new class extends mock<IProductService>() { }(), NullTelemetryService,
			configuration, new class extends mock<INativeEnvironmentService>() { override readonly userDataPath = cacheDirectory; }(),
			new class extends mock<IRequestService>() { }(), new class extends mock<IGitHubService>() { }(),
		));
		const connect = (connectionId: string) => host.connect({ connectionId, name: 'Dev Container', resume: true, environmentId, image: devContainerEnvironmentImage }).then(() => 'connected', (error: Error) => error.message);
		const failedRemoval = await host.removeContainer({ environmentId }).then(() => 'removed', (error: Error) => error.message.includes('Cannot connect to the Docker daemon'));
		const afterFailure = await connect('after-failure');
		dockerAvailable = true;
		const removed = await host.removeContainer({ environmentId });
		assert.deepStrictEqual({ failedRemoval, afterFailure, removed, afterRemoval: await connect('after-removal') }, {
			failedRemoval: true, afterFailure: 'Started', removed: true, afterRemoval: 'Dev Container \'Dev Container\' was deleted.',
		});
	});
});
