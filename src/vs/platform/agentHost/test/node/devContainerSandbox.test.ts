/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { delimiter, join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { devContainerSandboxRunArgs, devContainerSandboxSecurityOptions, isDevContainerSandboxSupported, parseDevContainerSandboxConfiguration, prepareDevContainerSandboxConfiguration } from '../../node/devContainerSandbox.js';

suite('Dev Container sandbox configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;
	let configPath: string;
	let overrideDirectory: string;

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'vscode-dev-container-sandbox-test-'));
		configPath = join(directory, 'devcontainer.json');
		overrideDirectory = join(directory, 'override');
		await mkdir(overrideDirectory);
	});

	teardown(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	function configurationOutput(): string {
		return JSON.stringify({ configuration: { configFilePath: URI.file(configPath).with({ scheme: 'vscode-fileHost' }).toJSON() } });
	}

	for (const scheme of ['file', 'vscode-fileHost']) {
		test(`preserves ${scheme} UNC configuration authorities without accessing the network share`, () => {
			const fileUri = URI.from({ scheme: 'file', authority: 'server', path: '/share/project/.devcontainer/devcontainer.json' });
			assert.deepStrictEqual(parseDevContainerSandboxConfiguration(JSON.stringify({ configuration: { configFilePath: fileUri.with({ scheme }).toJSON() } })), {
				configPath: fileUri.fsPath,
				service: undefined,
			});
		});
	}

	test('accepts the pinned CLI file-host configuration output', async () => {
		await writeFile(configPath, JSON.stringify({ image: 'test-image' }));
		const fileUri = URI.file(configPath);
		const output = JSON.stringify({
			configuration: {
				configFilePath: {
					...fileUri.with({ scheme: 'vscode-fileHost' }).toJSON(),
					fsPath: fileUri.fsPath,
					_sep: 1,
				},
			},
		});
		const { args } = await prepareDevContainerSandboxConfiguration(output, overrideDirectory, directory, {});
		assert.deepStrictEqual(args, ['--config', URI.file(configPath).fsPath, '--override-config', join(overrideDirectory, 'devcontainer.json')]);
	});

	test('rejects configuration URIs outside the local file and CLI file-host schemes', () => {
		for (const scheme of ['https', 'vscode-remote', 'unexpected']) {
			assert.throws(() => parseDevContainerSandboxConfiguration(JSON.stringify({
				configuration: { configFilePath: { scheme, path: '/project/devcontainer.json' } },
			})), /Invalid Dev Container configuration/);
		}
	});

	test('preserves the source config and its relative paths while adding all required Docker options', async () => {
		const config = {
			build: { dockerfile: '../Dockerfile', context: '..' },
			runArgs: ['--init'],
			securityOpt: ['apparmor=custom-confined'],
			features: { './feature': {} },
			remoteEnv: { TEST: '${containerEnv:TEST}' },
		};
		const original = `// workspace configuration\n${JSON.stringify(config)}`;
		await writeFile(configPath, original);
		const { args } = await prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory, directory, {});
		assert.deepStrictEqual({
			args,
			original: await readFile(configPath, 'utf8'),
			override: JSON.parse(await readFile(join(overrideDirectory, 'devcontainer.json'), 'utf8')),
		}, {
			args: ['--config', URI.file(configPath).fsPath, '--override-config', join(overrideDirectory, 'devcontainer.json')],
			original,
			override: { ...config, runArgs: ['--init', ...devContainerSandboxRunArgs] },
		});
	});

	for (const dockerComposeFile of ['../compose.yml', ['../compose.yml', '../compose.override.yml']]) {
		test(`adds a Compose override only for the configured service (${JSON.stringify(dockerComposeFile)})`, async () => {
			await mkdir(join(directory, '.devcontainer'));
			configPath = join(directory, '.devcontainer', 'devcontainer.json');
			await writeFile(join(directory, 'compose.yml'), 'services:\n  workspace:\n    image: test-image\n');
			const config = { dockerComposeFile, service: 'workspace', workspaceFolder: '/workspace', remoteUser: 'developer' };
			await writeFile(configPath, JSON.stringify(config));
			await prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory, directory, {});
			const composePath = join(overrideDirectory, 'compose.json');
			assert.deepStrictEqual({
				override: JSON.parse(await readFile(join(overrideDirectory, 'devcontainer.json'), 'utf8')),
				compose: JSON.parse(await readFile(composePath, 'utf8')),
			}, {
				override: { ...config, dockerComposeFile: [...(typeof dockerComposeFile === 'string' ? [dockerComposeFile] : dockerComposeFile), composePath] },
				compose: { services: { workspace: { security_opt: devContainerSandboxSecurityOptions, devices: ['/dev/net/tun:/dev/net/tun:rw'] } } },
			});
		});
	}

	test('targets the resolved Compose service while preserving substitutions in the source config', async () => {
		await writeFile(join(directory, 'compose.yml'), 'services:\n  workspace:\n    image: test-image\n');
		await writeFile(configPath, JSON.stringify({ dockerComposeFile: 'compose.yml', service: '${localEnv:SERVICE}' }));
		await prepareDevContainerSandboxConfiguration(JSON.stringify({
			configuration: { configFilePath: URI.file(configPath).toJSON(), service: 'workspace' },
		}), overrideDirectory, directory, {});
		assert.deepStrictEqual(JSON.parse(await readFile(join(overrideDirectory, 'compose.json'), 'utf8')), {
			services: { workspace: { security_opt: devContainerSandboxSecurityOptions, devices: ['/dev/net/tun:/dev/net/tun:rw'] } },
		});
	});

	test('fails explicitly for invalid source configurations', async () => {
		for (const content of ['null', '{ invalid', '{"image":"image","runArgs":"--privileged"}', '{"dockerComposeFile":"compose.yml"}']) {
			await writeFile(configPath, content);
			await assert.rejects(prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory, directory, {}));
		}
	});

	test('discovers implicit Compose files from the launcher environment before the workspace .env', async () => {
		await mkdir(join(directory, '.devcontainer'));
		configPath = join(directory, '.devcontainer', 'devcontainer.json');
		await writeFile(configPath, JSON.stringify({ dockerComposeFile: [], service: 'workspace' }));
		await writeFile(join(directory, '.env'), 'COMPOSE_FILE=ignored.yml\nIMAGE=workspace-image\n');
		await mkdir(join(directory, 'compose'));
		const composeFiles = ['compose/base.yml', 'compose/override.yml'];
		for (const file of composeFiles) {
			await writeFile(join(directory, file), 'services:\n  workspace:\n    image: ${IMAGE}\n');
		}
		const environment = { COMPOSE_FILE: composeFiles.join(delimiter), COMPOSE_PATH_SEPARATOR: '!' };
		const prepared = await prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory, directory, environment);
		assert.strictEqual(prepared.environment.COMPOSE_FILE, [...composeFiles.map(file => join(directory, file)), join(overrideDirectory, 'compose.json')].join(delimiter));
		assert.strictEqual(prepared.environment.COMPOSE_PATH_SEPARATOR, '!');
		assert.deepStrictEqual(environment, { COMPOSE_FILE: composeFiles.join(delimiter), COMPOSE_PATH_SEPARATOR: '!' });
		assert.deepStrictEqual(JSON.parse(await readFile(join(overrideDirectory, 'devcontainer.json'), 'utf8')).dockerComposeFile, []);
		assert.strictEqual(await readFile(join(directory, '.env'), 'utf8'), 'COMPOSE_FILE=ignored.yml\nIMAGE=workspace-image\n');
	});

	test('discovers implicit Compose files from the workspace .env using the pinned CLI syntax', async () => {
		await mkdir(join(directory, '.devcontainer'));
		configPath = join(directory, '.devcontainer', 'devcontainer.json');
		await writeFile(configPath, JSON.stringify({ dockerComposeFile: [], service: 'workspace' }));
		await mkdir(join(directory, 'compose'));
		await writeFile(join(directory, 'compose', 'base.yml'), 'version: "3.8"\nservices:\n  workspace:\n    image: ${IMAGE}\n');
		await writeFile(join(directory, '.env'), 'export COMPOSE_FILE=ignored.yml\n COMPOSE_FILE=also-ignored.yml\nCOMPOSE_FILE= compose/base.yml \r\nIMAGE=workspace-image\n');
		const prepared = await prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory, directory, { COMPOSE_FILE: '' });
		assert.strictEqual(prepared.environment.COMPOSE_FILE, [join(directory, 'compose', 'base.yml'), join(overrideDirectory, 'compose.json')].join(delimiter));
		assert.deepStrictEqual(JSON.parse(await readFile(join(overrideDirectory, 'devcontainer.json'), 'utf8')).dockerComposeFile, []);
		assert.strictEqual(JSON.parse(await readFile(join(overrideDirectory, 'compose.json'), 'utf8')).version, '3.8');
	});

	for (const withOverride of [false, true]) {
		test(`discovers default implicit Compose files (${withOverride ? 'with' : 'without'} default override)`, async () => {
			await writeFile(configPath, JSON.stringify({ dockerComposeFile: [], service: 'workspace' }));
			await writeFile(join(directory, 'docker-compose.yml'), 'services:\n  workspace:\n    image: test-image\n');
			if (withOverride) {
				await writeFile(join(directory, 'docker-compose.override.yml'), 'services:\n  workspace:\n    command: sleep infinity\n');
			}
			// A directory named .env is ignored by the pinned CLI's discovery and --env-file checks.
			await mkdir(join(directory, '.env'));
			const prepared = await prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory, directory, {});
			assert.strictEqual(prepared.environment.COMPOSE_FILE, [
				join(directory, 'docker-compose.yml'),
				...withOverride ? [join(directory, 'docker-compose.override.yml')] : [],
				join(overrideDirectory, 'compose.json'),
			].join(delimiter));
			assert.deepStrictEqual(JSON.parse(await readFile(join(overrideDirectory, 'devcontainer.json'), 'utf8')).dockerComposeFile, []);
		});
	}

	for (const version of ['version: "3.8" # legacy Compose\n', 'version: 2.4\n', '{"version":"3.7","services":{"workspace":{"image":"test-image"}}}']) {
		test(`preserves the first source Compose version (${JSON.stringify(version)})`, async () => {
			await writeFile(configPath, JSON.stringify({ dockerComposeFile: ['compose.yml', 'compose.override.yml'], service: 'workspace' }));
			await writeFile(join(directory, 'compose.yml'), version.startsWith('{') ? version : `${version}services:\n  workspace:\n    image: test-image\n`);
			await writeFile(join(directory, 'compose.override.yml'), 'version: "2.0"\nservices:\n  workspace:\n    command: sleep infinity\n');
			await prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory, directory, {});
			assert.strictEqual(JSON.parse(await readFile(join(overrideDirectory, 'compose.json'), 'utf8')).version, version.startsWith('{') ? '3.7' : version.includes('3.8') ? '3.8' : '2.4');
		});
	}

	test('reads the version from the resolved Compose filename without rewriting source substitutions', async () => {
		const config = { dockerComposeFile: '${localEnv:COMPOSE_SOURCE}', service: 'workspace' };
		const original = JSON.stringify(config);
		await writeFile(configPath, original);
		await writeFile(join(directory, 'compose.yml'), 'version: "3.8"\nservices:\n  workspace:\n    image: test-image\n');
		await prepareDevContainerSandboxConfiguration(JSON.stringify({
			configuration: { configFilePath: URI.file(configPath).toJSON(), service: 'workspace', dockerComposeFile: 'compose.yml' },
		}), overrideDirectory, directory, { COMPOSE_SOURCE: 'compose.yml' });
		assert.deepStrictEqual(JSON.parse(await readFile(join(overrideDirectory, 'devcontainer.json'), 'utf8')).dockerComposeFile, ['${localEnv:COMPOSE_SOURCE}', join(overrideDirectory, 'compose.json')]);
		assert.strictEqual(JSON.parse(await readFile(join(overrideDirectory, 'compose.json'), 'utf8')).version, '3.8');
		assert.strictEqual(await readFile(configPath, 'utf8'), original);
	});

	const supportedContainer = {
		AppArmorProfile: 'unconfined',
		HostConfig: {
			Privileged: false,
			SecurityOpt: [...devContainerSandboxSecurityOptions],
			MaskedPaths: [],
			ReadonlyPaths: [],
			Devices: [{ PathOnHost: '/dev/net/tun', PathInContainer: '/dev/net/tun', CgroupPermissions: 'rwm' }],
		},
	};

	for (const scenario of [
		{ name: 'all required options', container: supportedContainer, supported: true },
		{ name: 'colon-delimited security options', container: { ...supportedContainer, HostConfig: { ...supportedContainer.HostConfig, SecurityOpt: ['seccomp:unconfined'] } }, supported: true },
		{ name: 'host without AppArmor', container: { ...supportedContainer, AppArmorProfile: '' }, supported: true },
		{ name: 'default seccomp', container: { ...supportedContainer, HostConfig: { ...supportedContainer.HostConfig, SecurityOpt: null } }, supported: false },
		{ name: 'confined AppArmor', container: { ...supportedContainer, AppArmorProfile: 'docker-default' }, supported: false },
		{ name: 'masked proc paths', container: { ...supportedContainer, HostConfig: { ...supportedContainer.HostConfig, MaskedPaths: ['/proc/acpi'] } }, supported: false },
		{ name: 'read-only proc paths', container: { ...supportedContainer, HostConfig: { ...supportedContainer.HostConfig, ReadonlyPaths: ['/proc/sys'] } }, supported: false },
		{ name: 'missing TUN', container: { ...supportedContainer, HostConfig: { ...supportedContainer.HostConfig, Devices: null } }, supported: false },
		{ name: 'read-only TUN', container: { ...supportedContainer, HostConfig: { ...supportedContainer.HostConfig, Devices: [{ ...supportedContainer.HostConfig.Devices[0], CgroupPermissions: 'r' }] } }, supported: false },
		{ name: 'pre-existing privileged container', container: { ...supportedContainer, HostConfig: { ...supportedContainer.HostConfig, Privileged: true, SecurityOpt: null, Devices: null } }, supported: true },
		{ name: 'privileged container with explicit AppArmor confinement', container: { ...supportedContainer, AppArmorProfile: 'custom-confined', HostConfig: { ...supportedContainer.HostConfig, Privileged: true, SecurityOpt: null, Devices: null } }, supported: false },
		{ name: 'privileged container on a host without AppArmor', container: { ...supportedContainer, AppArmorProfile: '', HostConfig: { ...supportedContainer.HostConfig, Privileged: true, SecurityOpt: null, Devices: null } }, supported: true },
	]) {
		test(`detects actual Docker support: ${scenario.name}`, () => {
			assert.strictEqual(isDevContainerSandboxSupported(JSON.stringify(scenario.container)), scenario.supported);
		});
	}

	test('does not report malformed Docker inspection as unsupported', () => {
		assert.throws(() => isDevContainerSandboxSupported('{}'), /Invalid Docker sandbox configuration/);
	});
});
