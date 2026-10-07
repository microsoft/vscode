/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { devContainerSandboxRunArgs, devContainerSandboxSecurityOptions, isDevContainerSandboxSupported, prepareDevContainerSandboxConfiguration } from '../../node/devContainerSandbox.js';

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
		return JSON.stringify({ configuration: { configFilePath: URI.file(configPath).toJSON() } });
	}

	test('preserves the source config and its relative paths while adding all required Docker options', async () => {
		const config = {
			build: { dockerfile: '../Dockerfile', context: '..' },
			runArgs: ['--init'],
			features: { './feature': {} },
			remoteEnv: { TEST: '${containerEnv:TEST}' },
		};
		const original = `// workspace configuration\n${JSON.stringify(config)}`;
		await writeFile(configPath, original);
		const args = await prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory);
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
			const config = { dockerComposeFile, service: 'workspace', workspaceFolder: '/workspace', remoteUser: 'developer' };
			await writeFile(configPath, JSON.stringify(config));
			await prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory);
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
		await writeFile(configPath, JSON.stringify({ dockerComposeFile: 'compose.yml', service: '${localEnv:SERVICE}' }));
		await prepareDevContainerSandboxConfiguration(JSON.stringify({
			configuration: { configFilePath: URI.file(configPath).toJSON(), service: 'workspace' },
		}), overrideDirectory);
		assert.deepStrictEqual(JSON.parse(await readFile(join(overrideDirectory, 'compose.json'), 'utf8')), {
			services: { workspace: { security_opt: devContainerSandboxSecurityOptions, devices: ['/dev/net/tun:/dev/net/tun:rw'] } },
		});
	});

	test('fails explicitly for invalid source configurations', async () => {
		for (const content of ['null', '{ invalid', '{"image":"image","runArgs":"--privileged"}', '{"dockerComposeFile":"compose.yml"}']) {
			await writeFile(configPath, content);
			await assert.rejects(prepareDevContainerSandboxConfiguration(configurationOutput(), overrideDirectory));
		}
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
	]) {
		test(`detects actual Docker support: ${scenario.name}`, () => {
			assert.strictEqual(isDevContainerSandboxSupported(JSON.stringify(scenario.container)), scenario.supported);
		});
	}

	test('does not report malformed Docker inspection as unsupported', () => {
		assert.throws(() => isDevContainerSandboxSupported('{}'), /Invalid Docker sandbox configuration/);
	});
});
