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
import { devContainerEnvironmentImage, devContainerEnvironmentUri, findDevContainerEnvironment, parseDevContainerEnvironmentWorkspaceFolder } from '../../common/devContainerEnvironments.js';
import { DevContainerAgentHostMainService } from '../../node/devContainerAgentHostService.js';
import { devContainerEnvironmentLabel, devContainerVolumeLabel, hasDevContainerEnvironmentVolume, prepareDevContainerEnvironment, readDevContainerEnvironmentTestConfiguration, removeDevContainerEnvironment } from '../../node/devContainerEnvironments.js';
import { getDevContainerStateVolumeLabels, getDevContainerStateVolumeName } from '../../node/devContainerState.js';

suite('Dev Container environments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const environmentId = '0b5c8e9e-6d2a-4f4e-9a52-3f1c2d4e5f60';
	const volumeName = 'ubuntu';
	const workspaceVolumeFilter = `--filter label=dev.container.volume=true --filter label=${devContainerEnvironmentLabel}=${environmentId}`;
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

	test('creates the volume and its workspace folder once, named and labeled like New Dev Container, and hands them to the remote user on every start', async () => {
		const calls: string[] = [];
		let existing = false;
		const workspace = `/workspaces/${volumeName}`;
		const commands: Parameters<typeof prepareDevContainerEnvironment>[2] = {
			onContainerStarted: id => calls.push(`started ${id}`),
			docker: async args => {
				calls.push(args[1] === 'create' || args[0] === 'run' ? args.join(' ') : args[0] === 'exec' ? `exec ${args.at(-1)}` : args.slice(0, 2).join(' '));
				const stdout = args[1] === 'ls' ? (args.includes('--filter') ? (existing ? volumeName : '') : (existing ? `other\n${volumeName}` : 'other'))
					: args[1] === 'inspect' ? JSON.stringify({ [devContainerEnvironmentLabel]: environmentId })
						: args[0] === 'ps' && existing ? 'running' : '';
				return { stdout, stderr: '', code: 0 };
			},
			devcontainer: async args => {
				calls.push(args.filter(arg => !arg.startsWith(cacheDirectory)).join(' '));
				return { stdout: JSON.stringify({ outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: workspace }), stderr: '', code: 0 };
			},
		};
		const source = { environmentId, image: devContainerEnvironmentImage };
		const first = await prepareDevContainerEnvironment(source, cacheDirectory, commands);
		existing = true;
		await prepareDevContainerEnvironment(source, cacheDirectory, commands);
		const idLabels = `--id-label vsc.devcontainer.volume.name=${volumeName} --id-label vsc.devcontainer.volume.folder=${volumeName}`;
		const up = `up --log-level debug --override-config ${idLabels} --mount type=volume,source=vscode,target=/vscode,external=true`;
		const chown = `exec chown "$(id -u 'vscode'):$(id -g 'vscode')" '/workspaces' '${workspace}'`;
		assert.deepStrictEqual({
			calls,
			prepared: first,
			config: JSON.parse(await readFile(join(cacheDirectory, 'devcontainer.json'), 'utf8')),
		}, {
			calls: [
				'volume ls', 'volume ls', `volume create --label dev.container.volume=true --label ${devContainerEnvironmentLabel}=${environmentId} ${volumeName}`, 'volume inspect', 'ps -a',
				`run --rm --mount type=volume,source=${volumeName},target=/workspaces --entrypoint mkdir ${devContainerEnvironmentImage} -p ${workspace}`,
				up, 'started container', chown,
				'volume ls', 'volume ls', 'ps -a', up, 'started container', chown,
			],
			prepared: { containerId: 'container', remoteWorkspaceFolder: workspace, cliArgs: ['--override-config', join(cacheDirectory, 'devcontainer.json'), ...idLabels.split(' ')] },
			config: { image: devContainerEnvironmentImage, workspaceFolder: workspace, workspaceMount: `type=volume,source=${volumeName},target=/workspaces`, updateRemoteUserUID: false },
		});
	});

	test('names a new volume after the volumes that other owners and environments created at the same time took', async () => {
		const created: string[] = [];
		const prepared = await prepareDevContainerEnvironment({ environmentId, image: devContainerEnvironmentImage }, cacheDirectory, {
			onContainerStarted: () => { },
			docker: async args => {
				if (args[1] === 'create') {
					created.push(args.at(-1)!);
				}
				// `ubuntu` exists already, and another environment creates `ubuntu-2` first.
				const stdout = args[1] === 'ls' ? (args.includes('--filter') ? '' : 'ubuntu')
					: args[1] === 'inspect' ? JSON.stringify({ [devContainerEnvironmentLabel]: args.at(-1) === 'ubuntu-3' ? environmentId : 'other' }) : '';
				return { stdout, stderr: '', code: 0 };
			},
			devcontainer: async () => ({ stdout: JSON.stringify({ outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: '/workspaces/ubuntu-3' }), stderr: '', code: 0 }),
		});
		// Open in VS Code reads the volume and folder from the workspace folder; they match the container's labels.
		const labels = prepared.cliArgs.filter((_, index) => prepared.cliArgs[index - 1] === '--id-label');
		assert.deepStrictEqual({ created, workspace: prepared.remoteWorkspaceFolder, volume: parseDevContainerEnvironmentWorkspaceFolder(prepared.remoteWorkspaceFolder), labels }, {
			created: ['ubuntu-2', 'ubuntu-3'],
			workspace: '/workspaces/ubuntu-3',
			volume: { volumeName: 'ubuntu-3', folder: 'ubuntu-3' },
			labels: ['vsc.devcontainer.volume.name=ubuntu-3', 'vsc.devcontainer.volume.folder=ubuntu-3'],
		});
	});

	test('never gives a new environment a name whose state volume exists, nor mounts a state volume of another environment', async () => {
		const stateOf = (name: string) => getDevContainerStateVolumeName([`vsc.devcontainer.volume.name=${name}`, `vsc.devcontainer.volume.folder=${name}`]);
		const created: string[] = [];
		const prepared = await prepareDevContainerEnvironment({ environmentId, image: devContainerEnvironmentImage }, cacheDirectory, {
			onContainerStarted: () => { },
			docker: async args => {
				if (args[1] === 'create') {
					created.push(args.at(-1)!);
				}
				// `ubuntu` was removed, but its state volume was left behind.
				const stdout = args[1] === 'ls' ? (args.includes('--filter') ? '' : stateOf('ubuntu'))
					: args[1] === 'inspect' ? JSON.stringify({ [devContainerEnvironmentLabel]: environmentId }) : '';
				return { stdout, stderr: '', code: 0 };
			},
			devcontainer: async () => ({ stdout: JSON.stringify({ outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: '/workspaces/ubuntu-2' }), stderr: '', code: 0 }),
		});
		const idLabels = [`vsc.devcontainer.volume.name=${volumeName}`, `vsc.devcontainer.volume.folder=${volumeName}`];
		const otherEnvironmentState = prepareDevContainerEnvironment({ environmentId, image: devContainerEnvironmentImage }, cacheDirectory, {
			onContainerStarted: () => { },
			docker: async args => {
				// The environment's workspace volume exists, and a state volume with its name was created for another environment.
				const stdout = args[1] === 'ls' ? (args.includes('--filter') ? volumeName : `${volumeName}\n${stateOf(volumeName)}`)
					: args[1] === 'inspect' ? JSON.stringify({ ...Object.fromEntries(getDevContainerStateVolumeLabels(idLabels).map(label => [label.slice(0, label.indexOf('=')), label.slice(label.indexOf('=') + 1)])), [devContainerEnvironmentLabel]: 'other' }) : '';
				return { stdout, stderr: '', code: 0 };
			},
			devcontainer: async () => { throw new Error('not reached'); },
		}, false, true);
		assert.deepStrictEqual({ created, workspace: prepared.remoteWorkspaceFolder }, { created: ['ubuntu-2'], workspace: '/workspaces/ubuntu-2' });
		await assert.rejects(otherEnvironmentState, /is not the state volume of this Dev Container environment/);
	});

	test('keeps user state on its own state volume, linked before lifecycle commands run', async () => {
		const calls: string[] = [];
		const reports: string[] = [];
		const idLabels = [`vsc.devcontainer.volume.name=${volumeName}`, `vsc.devcontainer.volume.folder=${volumeName}`];
		const idLabelArgs = idLabels.map(label => `--id-label ${label}`).join(' ');
		const stateVolumeName = getDevContainerStateVolumeName(idLabels);
		await prepareDevContainerEnvironment({ environmentId, image: devContainerEnvironmentImage }, cacheDirectory, {
			onContainerStarted: () => { },
			docker: async args => {
				calls.push(args[0] === 'exec' ? 'chown' : args[1] === 'create' ? `volume create ${args.at(-1)}` : args.slice(0, 2).join(' '));
				const stdout = args[1] === 'ls' ? '' : args[1] === 'inspect' ? JSON.stringify({ [devContainerEnvironmentLabel]: environmentId }) : args[0] === 'ps' ? 'exited' : '';
				return { stdout, stderr: '', code: 0 };
			},
			devcontainer: async args => {
				calls.push(args.filter(arg => !arg.startsWith(cacheDirectory)).join(' '));
				const result = args[0] === 'up' ? { outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: `/workspaces/${volumeName}` } : { outcome: 'success' };
				return { stdout: JSON.stringify(result), stderr: '', code: 0 };
			},
			linkUserState: async (containerId, remoteUser, _selectorArgs, keepExistingFolders) => { calls.push(`link ${containerId} ${remoteUser} keepExistingFolders=${keepExistingFolders}`); },
			reportUserStateMount: error => reports.push(error === undefined ? 'added' : String(error)),
		}, false, true);
		assert.deepStrictEqual({ calls, reports }, {
			calls: [
				'volume ls', 'volume ls', `volume create ${volumeName}`, 'volume inspect', `volume create ${stateVolumeName}`, 'ps -a',
				`up --log-level debug --override-config ${idLabelArgs} --skip-post-create --mount type=volume,source=vscode,target=/vscode,external=true --mount type=volume,source=${stateVolumeName},target=/.vscode-volume,external=true`,
				'chown', 'link container vscode keepExistingFolders=false',
				`run-user-commands --log-level debug --override-config ${idLabelArgs} --container-id container`,
			],
			reports: ['added'],
		});
	});

	test('adds the container settings that smoke tests configure, and rejects malformed ones', async () => {
		const testConfiguration = readDevContainerEnvironmentTestConfiguration({
			VSCODE_SMOKE_TEST_DEV_CONTAINER_ENVIRONMENT_CONFIG: JSON.stringify({ containerEnv: { COPILOT_API_URL: 'http://vscode-smoke.test:1234' }, runArgs: ['--add-host=vscode-smoke.test:host-gateway'], postCreateCommand: 'install-cli' }),
		});
		await prepareDevContainerEnvironment({ environmentId, image: devContainerEnvironmentImage }, cacheDirectory, {
			onContainerStarted: () => { },
			docker: async args => ({ stdout: args[1] === 'inspect' ? JSON.stringify({ [devContainerEnvironmentLabel]: environmentId }) : '', stderr: '', code: 0 }),
			devcontainer: async () => ({ stdout: JSON.stringify({ outcome: 'success', containerId: 'container', remoteUser: 'vscode', remoteWorkspaceFolder: `/workspaces/${volumeName}` }), stderr: '', code: 0 }),
			testConfiguration,
		}, true);
		const { runArgs, containerEnv, postCreateCommand } = JSON.parse(await readFile(join(cacheDirectory, 'devcontainer.json'), 'utf8'));
		assert.deepStrictEqual({
			unset: readDevContainerEnvironmentTestConfiguration({}),
			runArgs: runArgs.slice(-1),
			keepsSandboxArgs: runArgs.length > 1,
			containerEnv,
			postCreateCommand,
		}, {
			unset: undefined,
			runArgs: ['--add-host=vscode-smoke.test:host-gateway'],
			keepsSandboxArgs: true,
			containerEnv: { COPILOT_API_URL: 'http://vscode-smoke.test:1234' },
			postCreateCommand: 'install-cli',
		});
		assert.throws(() => readDevContainerEnvironmentTestConfiguration({ VSCODE_SMOKE_TEST_DEV_CONTAINER_ENVIRONMENT_CONFIG: JSON.stringify({ image: 'other' }) }), /must be a JSON object/);
		assert.throws(() => readDevContainerEnvironmentTestConfiguration({ VSCODE_SMOKE_TEST_DEV_CONTAINER_ENVIRONMENT_CONFIG: JSON.stringify({ postCreateCommand: ['install-cli'] }) }), /must be a JSON object/);
	});

	test('rejects unsupported images before starting a container', async () => {
		await assert.rejects(prepareDevContainerEnvironment({ environmentId, image: 'example.com/untrusted' }, cacheDirectory, {
			onContainerStarted: () => { throw new Error('No container should be registered'); },
			devcontainer: async () => { throw new Error('Dev Container CLI must not run'); },
			docker: async () => { throw new Error('Docker must not run'); },
		}), /Unsupported Dev Container environment image/);
	});

	test('removes the labeled containers, the volumes labeled with the environment, and the cached configuration, and never recreates the environment', async () => {
		const calls: string[] = [];
		const idLabels = [`vsc.devcontainer.volume.name=${volumeName}`, `vsc.devcontainer.volume.folder=${volumeName}`];
		const stateVolumeName = getDevContainerStateVolumeName(idLabels);
		const configuration = new TestConfigurationService({});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const host = store.add(new class extends DevContainerAgentHostMainService {
			protected override async _runDocker(args: readonly string[]) {
				calls.push(args.join(' '));
				const stdout = args[0] === 'ps' ? 'first\nsecond\n'
					: args[1] === 'ls' ? (args.includes(`label=${devContainerVolumeLabel}=true`) ? volumeName : `${volumeName}\n${stateVolumeName}`) : '';
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
				`volume ls ${workspaceVolumeFilter} --format {{.Name}}`,
				`volume ls --filter label=${devContainerEnvironmentLabel}=${environmentId} --format {{.Name}}`,
				`ps --all --quiet --filter label=vsc.devcontainer.volume.name=${volumeName} --filter label=vsc.devcontainer.volume.folder=${volumeName}`,
				'rm --force first second',
				`volume rm ${volumeName} ${stateVolumeName}`,
			],
			cacheRemoved: true,
		});
	});

	test('removes a state volume created before state volumes were labeled with the environment, but not one of another container with its name', async () => {
		const idLabels = [`vsc.devcontainer.volume.name=${volumeName}`, `vsc.devcontainer.volume.folder=${volumeName}`];
		const stateVolumeName = getDevContainerStateVolumeName(idLabels);
		const remove = async (stateLabels: readonly string[]) => {
			const calls: string[] = [];
			await removeDevContainerEnvironment(environmentId, join(cacheDirectory, 'environment'), async args => {
				calls.push(args.join(' '));
				const stdout = args[1] === 'inspect' ? JSON.stringify(Object.fromEntries(stateLabels.map(label => [label.slice(0, label.indexOf('=')), label.slice(label.indexOf('=') + 1)])))
					: args[1] === 'ls' ? (args.includes('--filter') ? volumeName : `${volumeName}\n${stateVolumeName}`) : '';
				return { stdout, stderr: '', code: 0 };
			});
			return calls.filter(call => call.startsWith('volume rm'));
		};
		assert.deepStrictEqual({
			legacy: await remove(getDevContainerStateVolumeLabels(idLabels)),
			other: await remove(getDevContainerStateVolumeLabels(['vsc.devcontainer.volume.name=other', 'vsc.devcontainer.volume.folder=other'])),
		}, {
			legacy: [`volume rm ${volumeName} ${stateVolumeName}`],
			other: [`volume rm ${volumeName}`],
		});
	});

	test('finds an environment\'s volume in a Docker engine by its identifier label', async () => {
		const calls: string[] = [];
		const has = (stdout: string) => hasDevContainerEnvironmentVolume(environmentId, async args => {
			calls.push(args.join(' '));
			return { stdout, stderr: '', code: 0 };
		});
		assert.deepStrictEqual({ found: await has(`${volumeName}\n`), missing: await has(''), calls }, {
			found: true,
			missing: false,
			calls: [1, 2].map(() => `volume ls --filter label=${devContainerEnvironmentLabel}=${environmentId} --format {{.Name}}`),
		});
	});

	test('only removes volumes labeled with the environment', async () => {
		const calls: string[] = [];
		await removeDevContainerEnvironment(environmentId, join(cacheDirectory, 'environment'), async args => {
			calls.push(args.join(' '));
			// Docker applies the label filters, so volumes of other owners are not listed.
			return { stdout: '', stderr: '', code: 0 };
		});
		assert.deepStrictEqual(calls, [
			`volume ls ${workspaceVolumeFilter} --format {{.Name}}`,
			`volume ls --filter label=${devContainerEnvironmentLabel}=${environmentId} --format {{.Name}}`,
		]);
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
