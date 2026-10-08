/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile, writeFile } from 'fs/promises';
import { ParseError, parse } from '../../../base/common/json.js';
import { join } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { vArray, vBoolean, vLiteral, vObj, vOptionalProp, vString, vUnion } from '../../../base/common/validation.js';

export const devContainerSandboxSecurityOptions = ['seccomp=unconfined', 'apparmor=unconfined', 'systempaths=unconfined'] as const;
export const devContainerSandboxRunArgs = [...devContainerSandboxSecurityOptions.flatMap(option => ['--security-opt', option]), '--device', '/dev/net/tun'];

const configurationValidator = vObj({
	configuration: vObj({
		configFilePath: vObj({ scheme: vUnion(vLiteral('file'), vLiteral('vscode-fileHost')), path: vString(), authority: vOptionalProp(vString()) }),
		service: vOptionalProp(vString()),
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

export function parseDevContainerSandboxConfiguration(output: string): { configPath: string; service: string | undefined } {
	const result = configurationValidator.validate(JSON.parse(output));
	if (result.error) {
		throw new Error(`Invalid Dev Container configuration: ${result.error.message}`);
	}
	return {
		configPath: URI.from({ ...result.content.configuration.configFilePath, scheme: 'file' }).fsPath,
		service: result.content.configuration.service,
	};
}

/** Writes an override while retaining the original config as the base for relative paths and identity. */
export async function prepareDevContainerSandboxConfiguration(output: string, directory: string): Promise<readonly string[]> {
	const { configPath, service: resolvedService } = parseDevContainerSandboxConfiguration(output);
	const errors: ParseError[] = [];
	const configuration: unknown = parse(await readFile(configPath, 'utf8'), errors);
	if (errors.length || !isConfiguration(configuration)) {
		throw new Error(`Invalid Dev Container configuration: ${configPath}`);
	}
	const override = { ...configuration };
	if (configuration.dockerComposeFile !== undefined) {
		const composeFiles = vUnion(vString(), vArray(vString())).validate(configuration.dockerComposeFile);
		const service = resolvedService ?? configuration.service;
		if (composeFiles.error || !composeFiles.content.length || typeof service !== 'string' || !service) {
			throw new Error('Sandboxing requires a Dev Container Compose configuration with explicit files and a service.');
		}
		const composePath = join(directory, 'compose.json');
		await writeFile(composePath, JSON.stringify({
			services: {
				[service]: {
					security_opt: devContainerSandboxSecurityOptions,
					devices: ['/dev/net/tun:/dev/net/tun:rw'],
				},
			},
		}), { mode: 0o600 });
		override.dockerComposeFile = [...(typeof composeFiles.content === 'string' ? [composeFiles.content] : composeFiles.content), composePath];
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
	return ['--config', configPath, '--override-config', overridePath];
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
	if (HostConfig.Privileged) {
		return true;
	}
	const securityOptions = HostConfig.SecurityOpt?.map(option => option.replace(':', '=')) ?? [];
	return securityOptions.includes('seccomp=unconfined')
		&& (!AppArmorProfile || AppArmorProfile === 'unconfined')
		&& !HostConfig.MaskedPaths?.length
		&& !HostConfig.ReadonlyPaths?.length
		&& HostConfig.Devices?.some(device => device.PathOnHost === '/dev/net/tun'
			&& device.PathInContainer === '/dev/net/tun'
			&& device.CgroupPermissions.includes('r')
			&& device.CgroupPermissions.includes('w')) === true;
}
