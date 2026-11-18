/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { rm } from 'fs/promises';
import { isCancellationError } from '../../../base/common/errors.js';
import { ParseError, parse } from '../../../base/common/json.js';
import { join } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';
import { devContainerEnvironmentImages, devContainerEnvironmentWorkspaceFolder, IDevContainerEnvironmentSource, isDevContainerEnvironmentId } from '../common/devContainerEnvironments.js';
import { prepareOwnerOnlyDirectory } from './localAgentHostMetadata.js';
import { shellEscape } from './sshRemoteAgentHostHelpers.js';
import { devContainerServerCacheMount } from './devContainerServerCache.js';
import { devContainerSandboxRunArgs } from './devContainerSandbox.js';
import { checked, ICommandResult, isRecord, writeAtomic } from './devContainerSamples.js';
import { devContainerStateFallbackTarget, getDevContainerStateMount, getDevContainerStateVolumeLabels, getDevContainerStateVolumeName, isDevContainerRunning, isDevContainerStateVolumeFor } from './devContainerState.js';

/** Docker label that identifies an environment's container and volume. */
export const devContainerEnvironmentLabel = 'vscode.agents.environment';

type DockerCommand = (args: readonly string[]) => Promise<ICommandResult>;

interface IEnvironmentCommands {
	readonly docker: DockerCommand;
	readonly devcontainer: (args: readonly string[]) => Promise<ICommandResult>;
	readonly onContainerStarted: (containerId: string) => void;
	/**
	 * Links user state folders if the container has a state volume, which containers created with the setting on keep.
	 * `selectorArgs` select the container for the Dev Containers CLI.
	 * `keepExistingFolders` is whether the container was running before `up`, so its processes may be using the folders.
	 */
	readonly linkUserState?: (containerId: string, remoteUser: string, selectorArgs: readonly string[], keepExistingFolders: boolean) => Promise<void>;
	/** Reports that the state volume was added, or the error adding it. */
	readonly reportUserStateMount?: (error?: unknown) => void;
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

function getIdLabels(environmentId: string): readonly string[] {
	return [`${devContainerEnvironmentLabel}=${environmentId}`];
}

async function isEnvironmentStateVolume(docker: DockerCommand, volumeName: string, idLabels: readonly string[]): Promise<boolean> {
	return isDevContainerStateVolumeFor(JSON.parse(checked(await docker(['volume', 'inspect', '--format', '{{json .Labels}}', volumeName]), 'docker volume inspect')), idLabels);
}

/**
 * Creates or starts an environment's container, keeping its workspace in the environment's Docker volume. With
 * `persistUserState`, a new container also gets a state volume, and lifecycle commands run after user state is linked.
 */
export async function prepareDevContainerEnvironment(source: IDevContainerEnvironmentSource, cacheDirectory: string, commands: IEnvironmentCommands, sandboxEnabled = false, persistUserState = false): Promise<IPreparedDevContainerEnvironment> {
	validateEnvironmentId(source.environmentId);
	if (!devContainerEnvironmentImages.includes(source.image)) {
		throw new Error(localize('devContainerEnvironment.unsupportedImage', "Unsupported Dev Container environment image: {0}", source.image));
	}
	await prepareOwnerOnlyDirectory(cacheDirectory);
	const idLabels = getIdLabels(source.environmentId);
	const volumeName = getDevContainerEnvironmentVolumeName(source.environmentId);
	const existingVolumes = await listVolumes(commands.docker);
	if (!existingVolumes.includes(volumeName)) {
		checked(await commands.docker(['volume', 'create', ...idLabels.flatMap(label => ['--label', label]), volumeName]), 'docker volume create');
	}
	if (!await isEnvironmentVolume(commands.docker, volumeName, source.environmentId)) {
		throw new Error(localize('devContainerEnvironment.volumeConflict', "The Docker volume '{0}' does not belong to this Dev Container environment.", volumeName));
	}
	const userStateMountArgs: string[] = [];
	if (persistUserState) {
		const stateVolumeName = getDevContainerStateVolumeName(idLabels);
		try {
			if (!existingVolumes.includes(stateVolumeName)) {
				checked(await commands.docker(['volume', 'create', ...getDevContainerStateVolumeLabels(idLabels).flatMap(label => ['--label', label]), stateVolumeName]), 'docker volume create');
			} else if (!await isEnvironmentStateVolume(commands.docker, stateVolumeName, idLabels)) {
				throw new Error(localize('devContainerEnvironment.stateVolumeConflict', "The Docker volume '{0}' is not the state volume of this Dev Container environment.", stateVolumeName));
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				commands.reportUserStateMount?.(error);
			}
			throw error;
		}
		commands.reportUserStateMount?.();
		// The environment's volume is mounted at /workspaces.
		userStateMountArgs.push('--mount', getDevContainerStateMount(idLabels, devContainerStateFallbackTarget));
	}
	let keepExistingFolders = true;
	if (commands.linkUserState) {
		const existing = await commands.docker(['ps', '-a', '--format', '{{.State}}', ...idLabels.flatMap(label => ['--filter', `label=${label}`])]);
		keepExistingFolders = existing.code !== 0 || existing.stdout.split(/\r?\n/).some(isDevContainerRunning);
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
	const cliArgs = ['--override-config', configPath, ...idLabels.flatMap(label => ['--id-label', label])];
	// Lifecycle commands run after linking user state, so their changes to it persist.
	const up = await commands.devcontainer(['up', '--log-level', 'debug', ...cliArgs, ...persistUserState ? ['--skip-post-create'] : [], '--mount', devContainerServerCacheMount, ...userStateMountArgs]);
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
	// Containers created with the setting on keep their volume, so they are linked even if it is off now.
	await commands.linkUserState?.(result.containerId, result.remoteUser, cliArgs, keepExistingFolders);
	if (persistUserState) {
		const lifecycleOutput = checked(await commands.devcontainer(['run-user-commands', '--log-level', 'debug', ...cliArgs, '--container-id', result.containerId]), 'devcontainer run-user-commands');
		const lifecycleResult: unknown = JSON.parse(lifecycleOutput.trim().split(/\r?\n/).at(-1)!);
		if (!isRecord(lifecycleResult) || lifecycleResult.outcome !== 'success') {
			throw new Error(localize('devContainerEnvironment.lifecycleFailed', "The Dev Container environment's lifecycle commands failed: {0}", lifecycleOutput));
		}
	}
	return { containerId: result.containerId, remoteWorkspaceFolder: workspace, cliArgs };
}

/** Removes an environment's containers, Docker volumes, and cached configuration. */
export async function removeDevContainerEnvironment(environmentId: string, cacheDirectory: string, docker: DockerCommand): Promise<void> {
	validateEnvironmentId(environmentId);
	const idLabels = getIdLabels(environmentId);
	const containerIds = checked(await docker(['ps', '--all', '--quiet', ...idLabels.flatMap(label => ['--filter', `label=${label}`])]), 'docker ps').trim().split(/\r?\n/).filter(Boolean);
	if (containerIds.length) {
		checked(await docker(['rm', '--force', ...containerIds]), 'docker rm');
	}
	const volumeName = getDevContainerEnvironmentVolumeName(environmentId);
	const stateVolumeName = getDevContainerStateVolumeName(idLabels);
	const volumes = await listVolumes(docker);
	if (volumes.includes(volumeName) && await isEnvironmentVolume(docker, volumeName, environmentId)) {
		checked(await docker(['volume', 'rm', volumeName]), 'docker volume rm');
	}
	if (volumes.includes(stateVolumeName) && await isEnvironmentStateVolume(docker, stateVolumeName, idLabels)) {
		checked(await docker(['volume', 'rm', stateVolumeName]), 'docker volume rm');
	}
	await rm(cacheDirectory, { recursive: true, force: true });
}
