/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile, stat, writeFile } from 'fs/promises';
import { ParseError, parse } from '../../../base/common/json.js';
import { delimiter, dirname, join, resolve } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { vArray, vBoolean, vLiteral, vObj, vOptionalProp, vString, vUnion } from '../../../base/common/validation.js';
import { parse as parseYaml } from '../../../base/common/yaml.js';

export const devContainerSandboxSecurityOptions = ['seccomp=unconfined', 'apparmor=unconfined', 'systempaths=unconfined'] as const;
export const devContainerSandboxRunArgs = [...devContainerSandboxSecurityOptions.flatMap(option => ['--security-opt', option]), '--device', '/dev/net/tun'];

const configurationValidator = vObj({
	configuration: vObj({
		configFilePath: vObj({ scheme: vUnion(vLiteral('file'), vLiteral('vscode-fileHost')), path: vString(), authority: vOptionalProp(vString()) }),
		service: vOptionalProp(vString()),
		dockerComposeFile: vOptionalProp(vUnion(vString(), vArray(vString()))),
	}),
});

const containerValidator = vObj({
	AppArmorProfile: vString(),
	HostConfig: vObj({
		Privileged: vBoolean(),
		SecurityOpt: vArray(vString()),
		MaskedPaths: vArray(vString()),
		ReadonlyPaths: vArray(vString()),
		Devices: vArray(vObj({ PathOnHost: vString(), PathInContainer: vString(), CgroupPermissions: vString() })),
	}),
});

function isConfiguration(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDevContainerSandboxConfiguration(output: string): { configPath: string; service: string | undefined; dockerComposeFile?: string | string[] } {
	const result = configurationValidator.validate(JSON.parse(output));
	if (result.error) {
		throw new Error(`Invalid Dev Container configuration: ${result.error.message}`);
	}
	return {
		configPath: URI.from({ ...result.content.configuration.configFilePath, scheme: 'file' }).fsPath,
		service: result.content.configuration.service,
		...(result.content.configuration.dockerComposeFile !== undefined ? { dockerComposeFile: result.content.configuration.dockerComposeFile } : {}),
	};
}

export interface IDevContainerSandboxConfiguration {
	readonly args: readonly string[];
	readonly environment: NodeJS.ProcessEnv;
}

async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}

/** Matches @devcontainers/cli's discovery, including its deliberately limited .env syntax. */
async function discoverComposeFiles(workspaceFolder: string, environment: NodeJS.ProcessEnv): Promise<string[]> {
	let composeFile = environment.COMPOSE_FILE;
	if (!composeFile) {
		try {
			const env = await readFile(join(workspaceFolder, '.env'), 'utf8');
			composeFile = /^COMPOSE_FILE=(.+)$/m.exec(env)?.[1].trim();
		} catch (error) {
			if (!['ENOENT', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
				throw error;
			}
		}
	}
	if (composeFile) {
		return composeFile.split(delimiter).map(file => resolve(workspaceFolder, file));
	}
	const files = [resolve(workspaceFolder, 'docker-compose.yml')];
	const defaultOverride = resolve(workspaceFolder, 'docker-compose.override.yml');
	if (await isFile(defaultOverride)) {
		files.push(defaultOverride);
	}
	return files;
}

/** Writes an override while retaining the original config as the base for relative paths and identity. */
export async function prepareDevContainerSandboxConfiguration(output: string, directory: string, workspaceFolder: string, environment: NodeJS.ProcessEnv): Promise<IDevContainerSandboxConfiguration> {
	const { configPath, service: resolvedService, dockerComposeFile: resolvedComposeFiles } = parseDevContainerSandboxConfiguration(output);
	const errors: ParseError[] = [];
	const configuration: unknown = parse(await readFile(configPath, 'utf8'), errors);
	if (errors.length || !isConfiguration(configuration)) {
		throw new Error(`Invalid Dev Container configuration: ${configPath}`);
	}
	const override = { ...configuration };
	let overrideEnvironment = environment;
	if (configuration.dockerComposeFile !== undefined) {
		const composeFiles = vUnion(vString(), vArray(vString())).validate(configuration.dockerComposeFile);
		const service = resolvedService ?? configuration.service;
		if (composeFiles.error || typeof service !== 'string' || !service) {
			throw new Error('Sandboxing requires a Dev Container Compose configuration with files and a service.');
		}
		const implicitFiles = Array.isArray(composeFiles.content) && !composeFiles.content.length;
		const configuredFiles = resolvedComposeFiles ?? composeFiles.content;
		const files = implicitFiles ? await discoverComposeFiles(workspaceFolder, environment) : typeof configuredFiles === 'string' ? [configuredFiles] : configuredFiles;
		const source = await readFile(resolve(implicitFiles ? workspaceFolder : dirname(configPath), files[0]), 'utf8');
		// Like the pinned CLI, carry the first file's version into generated overrides.
		const compose = parseYaml(/^\s*(version:.*)$/m.exec(source)?.[1] ?? source);
		const version = compose?.type === 'map' ? compose.properties.find(property => property.key.value === 'version')?.value : undefined;
		const composePath = join(directory, 'compose.json');
		await writeFile(composePath, JSON.stringify({
			...(version?.type === 'scalar' ? { version: version.value } : {}),
			services: {
				[service]: {
					security_opt: devContainerSandboxSecurityOptions,
					devices: ['/dev/net/tun:/dev/net/tun:rw'],
				},
			},
		}), { mode: 0o600 });
		if (implicitFiles) {
			// Keep [] so the CLI still supplies the workspace .env via --env-file, even for files elsewhere.
			overrideEnvironment = { ...environment, COMPOSE_FILE: [...files, composePath].join(delimiter) };
		} else {
			override.dockerComposeFile = [...(typeof composeFiles.content === 'string' ? [composeFiles.content] : composeFiles.content), composePath];
		}
	} else {
		const runArgs = vOptionalProp(vArray(vString()));
		const validated = vObj({ runArgs }).validate(configuration);
		if (validated.error) {
			throw new Error(`Invalid Dev Container run arguments: ${validated.error.message}`);
		}
		override.runArgs = [...(validated.content.runArgs ?? []), ...devContainerSandboxRunArgs];
	}
	const overridePath = join(directory, 'devcontainer.json');
	await writeFile(overridePath, JSON.stringify(override), { mode: 0o600 });
	return { args: ['--config', configPath, '--override-config', overridePath], environment: overrideEnvironment };
}

/** Checks actual Docker settings, not a requested override that an existing container may ignore. */
export function isDevContainerSandboxSupported(output: string): boolean {
	const container: unknown = JSON.parse(output);
	if (!isConfiguration(container) || !isConfiguration(container.HostConfig)) {
		throw new Error('Invalid Docker sandbox configuration');
	}
	const hostConfig = { ...container.HostConfig };
	for (const key of ['SecurityOpt', 'MaskedPaths', 'ReadonlyPaths', 'Devices']) {
		if (hostConfig[key] === null) {
			hostConfig[key] = [];
		}
	}
	const result = containerValidator.validate({ ...container, HostConfig: hostConfig });
	if (result.error) {
		throw new Error(`Invalid Docker sandbox configuration: ${result.error.message}`);
	}
	const { AppArmorProfile, HostConfig } = result.content;
	if (AppArmorProfile && AppArmorProfile !== 'unconfined') {
		return false;
	}
	if (HostConfig.Privileged) {
		return true;
	}
	const securityOptions = HostConfig.SecurityOpt?.map(option => option.replace(':', '=')) ?? [];
	return securityOptions.includes('seccomp=unconfined')
		&& !HostConfig.MaskedPaths?.length
		&& !HostConfig.ReadonlyPaths?.length
		&& HostConfig.Devices?.some(device => device.PathOnHost === '/dev/net/tun'
			&& device.PathInContainer === '/dev/net/tun'
			&& device.CgroupPermissions.includes('r')
			&& device.CgroupPermissions.includes('w')) === true;
}
