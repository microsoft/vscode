/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { rm } from 'fs/promises';
import { isCancellationError } from '../../../base/common/errors.js';
import { ParseError, parse } from '../../../base/common/json.js';
import { join } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';
import { devContainerEnvironmentImages, devContainerEnvironmentVolumeTarget as volumeTarget, getDevContainerEnvironmentWorkspaceFolder, IDevContainerEnvironmentSource, isDevContainerEnvironmentId } from '../common/devContainerEnvironments.js';
import { prepareOwnerOnlyDirectory } from './localAgentHostMetadata.js';
import { shellEscape } from './sshRemoteAgentHostHelpers.js';
import { devContainerServerCacheMount } from './devContainerServerCache.js';
import { devContainerSandboxRunArgs } from './devContainerSandbox.js';
import { checked, ICommandResult, isRecord, writeAtomic } from './devContainerSamples.js';
import { devContainerStateFallbackTarget, getDevContainerStateMount, getDevContainerStateVolumeLabels, getDevContainerStateVolumeName, isDevContainerRunning, isDevContainerStateVolumeFor } from './devContainerState.js';

/** Docker label that identifies the environment that owns a volume. */
export const devContainerEnvironmentLabel = 'vscode.agents.environment';
/** Label of the Docker volumes that the Dev Containers extension's New Dev Container command creates. */
export const devContainerVolumeLabel = 'dev.container.volume';
/** Id labels that the Dev Containers extension gives the container of a folder in a Docker volume. */
export const devContainerVolumeNameLabel = 'vsc.devcontainer.volume.name';
export const devContainerVolumeFolderLabel = 'vsc.devcontainer.volume.folder';
/** Smoke tests point the Agent Host in an environment's container at their mock server with this JSON configuration. */
const testConfigurationEnvironmentKey = 'VSCODE_SMOKE_TEST_DEV_CONTAINER_ENVIRONMENT_CONFIG';

/** Container settings that smoke tests add to every environment's configuration. */
export interface IDevContainerEnvironmentTestConfiguration {
	readonly containerEnv?: Readonly<Record<string, string>>;
	readonly runArgs?: readonly string[];
	/** Installs a CLI in the container for builds whose commit has none on the update server. */
	readonly postCreateCommand?: string;
}

/** Reads the configuration that smoke tests set in {@link testConfigurationEnvironmentKey}, if any. */
export function readDevContainerEnvironmentTestConfiguration(environment: NodeJS.ProcessEnv): IDevContainerEnvironmentTestConfiguration | undefined {
	const value = environment[testConfigurationEnvironmentKey];
	if (!value) {
		return undefined;
	}
	const configuration: unknown = JSON.parse(value);
	const containerEnv = isRecord(configuration) ? configuration.containerEnv : undefined;
	const runArgs = isRecord(configuration) ? configuration.runArgs : undefined;
	const postCreateCommand = isRecord(configuration) ? configuration.postCreateCommand : undefined;
	if (!isRecord(configuration)
		|| Object.keys(configuration).some(key => key !== 'containerEnv' && key !== 'runArgs' && key !== 'postCreateCommand')
		|| (containerEnv !== undefined && (!isRecord(containerEnv) || Object.values(containerEnv).some(entry => typeof entry !== 'string')))
		|| (runArgs !== undefined && (!Array.isArray(runArgs) || runArgs.some(arg => typeof arg !== 'string')))
		|| (postCreateCommand !== undefined && typeof postCreateCommand !== 'string')) {
		throw new Error(`${testConfigurationEnvironmentKey} must be a JSON object with optional containerEnv strings, runArgs and a postCreateCommand string.`);
	}
	return {
		...(containerEnv ? { containerEnv: containerEnv as Record<string, string> } : {}),
		...(runArgs ? { runArgs: runArgs as string[] } : {}),
		...(postCreateCommand ? { postCreateCommand } : {}),
	};
}

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
	/** Container settings that smoke tests add, see {@link readDevContainerEnvironmentTestConfiguration}. */
	readonly testConfiguration?: IDevContainerEnvironmentTestConfiguration;
}

export interface IPreparedDevContainerEnvironment {
	readonly containerId: string;
	readonly remoteWorkspaceFolder: string;
	readonly cliArgs: readonly string[];
}

/** The name that New Dev Container proposes for the image's Dev Containers template: `ubuntu` for the Ubuntu base image. */
function getVolumeBaseName(image: string): string {
	return /:(?<variant>[a-zA-Z0-9][a-zA-Z0-9_.-]*)$/.exec(image)?.groups?.variant ?? 'devcontainer';
}

function validateEnvironmentId(environmentId: string): void {
	if (!isDevContainerEnvironmentId(environmentId)) {
		throw new Error(localize('devContainerEnvironment.invalidId', "Invalid Dev Container environment identifier: {0}", environmentId));
	}
}

async function listVolumes(docker: DockerCommand, labels: readonly string[] = []): Promise<readonly string[]> {
	return checked(await docker(['volume', 'ls', ...labels.flatMap(label => ['--filter', `label=${label}`]), '--format', '{{.Name}}']), 'docker volume ls').trim().split(/\r?\n/).filter(Boolean);
}

async function isEnvironmentVolume(docker: DockerCommand, volumeName: string, environmentId: string): Promise<boolean> {
	const labels: unknown = JSON.parse(checked(await docker(['volume', 'inspect', '--format', '{{json .Labels}}', volumeName]), 'docker volume inspect'));
	return isRecord(labels) && labels[devContainerEnvironmentLabel] === environmentId;
}

/** Finds the environment's workspace volume by its labels, since its name depends on the volumes that existed when it was created. */
async function findEnvironmentVolume(docker: DockerCommand, environmentId: string): Promise<string | undefined> {
	return (await listVolumes(docker, [`${devContainerVolumeLabel}=true`, `${devContainerEnvironmentLabel}=${environmentId}`]))[0];
}

/**
 * Creates the environment's workspace volume with the first free name, as New Dev Container names it: `ubuntu`, then
 * `ubuntu-2`, and so on. A name whose state volume exists is not free, since a new environment would mount another's state.
 */
async function createEnvironmentVolume(docker: DockerCommand, environmentId: string, image: string, existingVolumes: readonly string[]): Promise<string> {
	const baseName = getVolumeBaseName(image);
	const taken = new Set(existingVolumes);
	for (let index = 1; index <= 1000; index++) {
		const volumeName = index === 1 ? baseName : `${baseName}-${index}`;
		if (taken.has(volumeName) || taken.has(getDevContainerStateVolumeName(getIdLabels(volumeName)))) {
			continue;
		}
		checked(await docker(['volume', 'create', '--label', `${devContainerVolumeLabel}=true`, '--label', `${devContainerEnvironmentLabel}=${environmentId}`, volumeName]), 'docker volume create');
		// Creating a volume that exists succeeds without changing it, so an environment created at the same time may own it.
		if (await isEnvironmentVolume(docker, volumeName, environmentId)) {
			return volumeName;
		}
		taken.add(volumeName);
	}
	throw new Error(localize('devContainerEnvironment.noVolumeName', "No free Docker volume name was found for the Dev Container environment."));
}

/** The volume and its folder share a name, as with New Dev Container, so the Dev Containers extension identifies the same container. */
function getIdLabels(volumeName: string): readonly string[] {
	return [`${devContainerVolumeNameLabel}=${volumeName}`, `${devContainerVolumeFolderLabel}=${volumeName}`];
}

/** Whether the state volume is the one of this workspace volume, and was not created for another environment with its name. */
async function isEnvironmentStateVolume(docker: DockerCommand, volumeName: string, idLabels: readonly string[], environmentId: string): Promise<boolean> {
	const labels: unknown = JSON.parse(checked(await docker(['volume', 'inspect', '--format', '{{json .Labels}}', volumeName]), 'docker volume inspect'));
	// State volumes created before they got the environment's label have none.
	return isDevContainerStateVolumeFor(labels, idLabels) && isRecord(labels) && (labels[devContainerEnvironmentLabel] === undefined || labels[devContainerEnvironmentLabel] === environmentId);
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
	const existingVolumes = await listVolumes(commands.docker);
	const volumeName = await findEnvironmentVolume(commands.docker, source.environmentId)
		?? await createEnvironmentVolume(commands.docker, source.environmentId, source.image, existingVolumes);
	const idLabels = getIdLabels(volumeName);
	const workspace = getDevContainerEnvironmentWorkspaceFolder(volumeName);
	const userStateMountArgs: string[] = [];
	if (persistUserState) {
		const stateVolumeName = getDevContainerStateVolumeName(idLabels);
		try {
			if (!existingVolumes.includes(stateVolumeName)) {
				// The environment's label lets its removal find the state volume.
				checked(await commands.docker(['volume', 'create', ...[...getDevContainerStateVolumeLabels(idLabels), `${devContainerEnvironmentLabel}=${source.environmentId}`].flatMap(label => ['--label', label]), stateVolumeName]), 'docker volume create');
			} else if (!await isEnvironmentStateVolume(commands.docker, stateVolumeName, idLabels, source.environmentId)) {
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
	const containerStates = checked(await commands.docker(['ps', '-a', '--format', '{{.State}}', ...idLabels.flatMap(label => ['--filter', `label=${label}`])]), 'docker ps').split(/\r?\n/).filter(state => state.trim());
	if (!containerStates.length) {
		// New Dev Container creates the workspace folder before the container, which starts in it.
		checked(await commands.docker(['run', '--rm', '--mount', `type=volume,source=${volumeName},target=${volumeTarget}`, '--entrypoint', 'mkdir', source.image, '-p', workspace]), 'mkdir');
	}
	const keepExistingFolders = containerStates.some(isDevContainerRunning);

	const configPath = join(cacheDirectory, 'devcontainer.json');
	const runArgs = [...sandboxEnabled ? devContainerSandboxRunArgs : [], ...commands.testConfiguration?.runArgs ?? []];
	await writeAtomic(configPath, JSON.stringify({
		image: source.image,
		workspaceFolder: workspace,
		workspaceMount: `type=volume,source=${volumeName},target=${volumeTarget}`,
		updateRemoteUserUID: false,
		...(runArgs.length ? { runArgs } : {}),
		...(commands.testConfiguration?.containerEnv ? { containerEnv: commands.testConfiguration.containerEnv } : {}),
		...(commands.testConfiguration?.postCreateCommand ? { postCreateCommand: commands.testConfiguration.postCreateCommand } : {}),
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

	// The volume and its folders are created for root; the remote user owns them, so agents can add folders next to the workspace.
	const ownershipScript = `chown "$(id -u ${shellEscape(result.remoteUser)}):$(id -g ${shellEscape(result.remoteUser)})" ${shellEscape(volumeTarget)} ${shellEscape(workspace)}`;
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

/** Whether the Docker engine has a volume of the environment, whose identifier is unique, so it is the engine of the environment's host. */
export async function hasDevContainerEnvironmentVolume(environmentId: string, docker: DockerCommand): Promise<boolean> {
	validateEnvironmentId(environmentId);
	return (await listVolumes(docker, [`${devContainerEnvironmentLabel}=${environmentId}`])).length > 0;
}

/**
 * Removes an environment's containers, Docker volumes, and cached configuration. Its volumes carry its label, and its
 * containers the identity labels of its workspace volume, which no other volume has while that volume exists.
 */
export async function removeDevContainerEnvironment(environmentId: string, cacheDirectory: string, docker: DockerCommand): Promise<void> {
	validateEnvironmentId(environmentId);
	const volumeName = await findEnvironmentVolume(docker, environmentId);
	const volumes = new Set(await listVolumes(docker, [`${devContainerEnvironmentLabel}=${environmentId}`]));
	if (volumeName) {
		const idLabels = getIdLabels(volumeName);
		const containerIds = checked(await docker(['ps', '--all', '--quiet', ...idLabels.flatMap(label => ['--filter', `label=${label}`])]), 'docker ps').trim().split(/\r?\n/).filter(Boolean);
		if (containerIds.length) {
			checked(await docker(['rm', '--force', ...containerIds]), 'docker rm');
		}
		// State volumes created before they got the environment's label are found by their name and identity labels.
		const stateVolumeName = getDevContainerStateVolumeName(idLabels);
		if (!volumes.has(stateVolumeName) && (await listVolumes(docker)).includes(stateVolumeName) && await isEnvironmentStateVolume(docker, stateVolumeName, idLabels, environmentId)) {
			volumes.add(stateVolumeName);
		}
	}
	if (volumes.size) {
		checked(await docker(['volume', 'rm', ...volumes]), 'docker volume rm');
	}
	await rm(cacheDirectory, { recursive: true, force: true });
}
