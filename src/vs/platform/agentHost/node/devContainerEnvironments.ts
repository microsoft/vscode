/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { rm } from 'fs/promises';
import { ParseError, parse } from '../../../base/common/json.js';
import { join } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';
import { devContainerEnvironmentImages, devContainerEnvironmentWorkspaceFolder, IDevContainerEnvironmentSource, isDevContainerEnvironmentId } from '../common/devContainerEnvironments.js';
import { prepareOwnerOnlyDirectory } from './localAgentHostMetadata.js';
import { shellEscape } from './sshRemoteAgentHostHelpers.js';
import { devContainerServerCacheMount } from './devContainerServerCache.js';
import { devContainerSandboxRunArgs } from './devContainerSandbox.js';
import { checked, ICommandResult, isRecord, writeAtomic } from './devContainerSamples.js';

/** Docker label that identifies an environment's container and volume. */
export const devContainerEnvironmentLabel = 'vscode.agents.environment';

type DockerCommand = (args: readonly string[]) => Promise<ICommandResult>;

interface IEnvironmentCommands {
	readonly docker: DockerCommand;
	readonly devcontainer: (args: readonly string[]) => Promise<ICommandResult>;
	readonly onContainerStarted: (containerId: string) => void;
}

export interface IPreparedDevContainerEnvironment {
	readonly containerId: string;
	readonly remoteWorkspaceFolder: string;
	readonly cliArgs: readonly string[];
}

export function getDevContainerEnvironmentVolumeName(environmentId: string): string {
	return `vscode-agents-environment-${environmentId}`;
}

function validateEnvironmentId(environmentId: string): void {
	if (!isDevContainerEnvironmentId(environmentId)) {
		throw new Error(localize('devContainerEnvironment.invalidId', "Invalid Dev Container environment identifier: {0}", environmentId));
	}
}

async function listVolumes(docker: DockerCommand): Promise<readonly string[]> {
	return checked(await docker(['volume', 'ls', '--format', '{{.Name}}']), 'docker volume ls').trim().split(/\r?\n/);
}

async function isEnvironmentVolume(docker: DockerCommand, volumeName: string, environmentId: string): Promise<boolean> {
	const labels: unknown = JSON.parse(checked(await docker(['volume', 'inspect', '--format', '{{json .Labels}}', volumeName]), 'docker volume inspect'));
	return isRecord(labels) && labels[devContainerEnvironmentLabel] === environmentId;
}

/** Creates or starts an environment's container, keeping its workspace in the environment's Docker volume. */
export async function prepareDevContainerEnvironment(source: IDevContainerEnvironmentSource, cacheDirectory: string, commands: IEnvironmentCommands, sandboxEnabled = false): Promise<IPreparedDevContainerEnvironment> {
	validateEnvironmentId(source.environmentId);
	if (!devContainerEnvironmentImages.includes(source.image)) {
		throw new Error(localize('devContainerEnvironment.unsupportedImage', "Unsupported Dev Container environment image: {0}", source.image));
	}
	await prepareOwnerOnlyDirectory(cacheDirectory);
	const label = `${devContainerEnvironmentLabel}=${source.environmentId}`;
	const volumeName = getDevContainerEnvironmentVolumeName(source.environmentId);
	if (!(await listVolumes(commands.docker)).includes(volumeName)) {
		checked(await commands.docker(['volume', 'create', '--label', label, volumeName]), 'docker volume create');
	}
	if (!await isEnvironmentVolume(commands.docker, volumeName, source.environmentId)) {
		throw new Error(localize('devContainerEnvironment.volumeConflict', "The Docker volume '{0}' does not belong to this Dev Container environment.", volumeName));
	}

	const workspace = devContainerEnvironmentWorkspaceFolder;
	const configPath = join(cacheDirectory, 'devcontainer.json');
	await writeAtomic(configPath, JSON.stringify({
		image: source.image,
		workspaceFolder: workspace,
		workspaceMount: `type=volume,source=${volumeName},target=${workspace}`,
		updateRemoteUserUID: false,
		...(sandboxEnabled ? { runArgs: devContainerSandboxRunArgs } : {}),
	}));
	const cliArgs = ['--override-config', configPath, '--id-label', label];
	const up = await commands.devcontainer(['up', '--log-level', 'debug', ...cliArgs, '--mount', devContainerServerCacheMount]);
	const errors: ParseError[] = [];
	const result: unknown = parse(up.stdout.trim().split(/\r?\n/).at(-1) ?? '', errors);
	if (isRecord(result) && typeof result.containerId === 'string' && result.containerId) {
		commands.onContainerStarted(result.containerId);
	}
	checked(up, 'devcontainer up');
	if (errors.length || !isRecord(result) || result.outcome !== 'success' || typeof result.containerId !== 'string' || !result.containerId || typeof result.remoteUser !== 'string' || !result.remoteUser || result.remoteWorkspaceFolder !== workspace) {
		throw new Error(localize('devContainerEnvironment.invalidUpResult', "The Dev Container CLI returned an invalid environment container."));
	}

	// Docker creates the volume root for root; the remote user owns the workspace.
	const ownershipScript = `chown "$(id -u ${shellEscape(result.remoteUser)}):$(id -g ${shellEscape(result.remoteUser)})" ${shellEscape(workspace)}`;
	checked(await commands.docker(['exec', '--user', 'root', '--workdir', '/', result.containerId, '/bin/sh', '-c', ownershipScript]), 'chown');
	return { containerId: result.containerId, remoteWorkspaceFolder: workspace, cliArgs };
}

/** Removes an environment's containers, Docker volume, and cached configuration. */
export async function removeDevContainerEnvironment(environmentId: string, cacheDirectory: string, docker: DockerCommand): Promise<void> {
	validateEnvironmentId(environmentId);
	const containerIds = checked(await docker(['ps', '--all', '--quiet', '--filter', `label=${devContainerEnvironmentLabel}=${environmentId}`]), 'docker ps').trim().split(/\r?\n/).filter(Boolean);
	if (containerIds.length) {
		checked(await docker(['rm', '--force', ...containerIds]), 'docker rm');
	}
	const volumeName = getDevContainerEnvironmentVolumeName(environmentId);
	if ((await listVolumes(docker)).includes(volumeName) && await isEnvironmentVolume(docker, volumeName, environmentId)) {
		checked(await docker(['volume', 'rm', volumeName]), 'docker volume rm');
	}
	await rm(cacheDirectory, { recursive: true, force: true });
}
