/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID } from 'crypto';
import { readFile, rename, rm, writeFile } from 'fs/promises';
import { ParseError, parse } from '../../../base/common/json.js';
import { join } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';
import { IGitHubRepositoryFile } from '../../github/common/anonymousClient.js';
import { DevContainerSample, getDevContainerSampleFolder, getDevContainerSampleUrl, IDevContainerRepository } from '../common/devContainerSamples.js';
import { prepareOwnerOnlyDirectory } from './localAgentHostMetadata.js';
import { shellEscape } from './sshRemoteAgentHostHelpers.js';
import { devContainerServerCacheMount } from './devContainerServerCache.js';

interface ICommandResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly code: number;
}

interface ISampleCommands {
	readonly docker: (args: readonly string[]) => Promise<ICommandResult>;
	readonly devcontainer: (args: readonly string[]) => Promise<ICommandResult>;
	readonly readSource: () => Promise<IGitHubRepositoryFile>;
	readonly onContainerStarted: (containerId: string) => void;
}

export interface IPreparedDevContainerSample {
	readonly containerId: string;
	readonly remoteWorkspaceFolder: string;
	readonly cliArgs: readonly string[];
	readonly repository: IDevContainerRepository;
}

export function getDevContainerSampleVolumeName(sample: DevContainerSample, existingVolumes: readonly string[]): string {
	const url = getExtensionRepositoryUrl(sample);
	const folder = getDevContainerSampleFolder(sample);
	const name = `${folder}-${createHash('sha256').update(url).digest('hex')}`;
	const legacyName = `${folder}-${createHash('md5').update(url).digest('hex')}`;
	return existingVolumes.includes(name) || !existingVolumes.includes(legacyName) ? name : legacyName;
}

function getExtensionRepositoryUrl(sample: DevContainerSample): string {
	// The extension's exact URL casing determines its volume hashes and identity labels.
	return `https://github.com/Microsoft/${getDevContainerSampleFolder(sample)}`;
}

export function getDevContainerSampleLabels(repository: IDevContainerRepository): readonly string[] {
	return [
		`vsch.local.repository=${repository.repositoryPath}`,
		`vsch.local.repository.volume=${repository.volumeName}`,
		`vsch.local.repository.folder=${repository.folder}`,
		`devcontainer.config_file=/workspaces/${repository.folder}/.devcontainer/devcontainer.json`,
	];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDevContainerSampleConfiguration(content: string): Record<string, unknown> & { image: string } {
	const errors: ParseError[] = [];
	const config: unknown = parse(content, errors);
	if (errors.length || !isRecord(config) || typeof config.image !== 'string' || !config.image.trim()) {
		throw new Error(localize('devContainerSample.invalidConfig', "The sample must have a valid image-based Dev Container configuration."));
	}
	if (config.build !== undefined || config.dockerFile !== undefined || config.dockerComposeFile !== undefined
		|| (config.features !== undefined && (!isRecord(config.features) || Object.keys(config.features).length > 0))) {
		throw new Error(localize('devContainerSample.buildUnsupported', "This sample requires an image build. Samples using Dockerfiles, Docker Compose, or Features are not supported yet."));
	}
	if (config.initializeCommand !== undefined || config.workspaceMount !== undefined || config.mounts !== undefined || config.runArgs !== undefined) {
		throw new Error(localize('devContainerSample.hostConfigUnsupported', "This sample requires host commands or custom mounts, which are not supported yet."));
	}
	return { ...config, image: config.image };
}

async function writeAtomic(path: string, content: string): Promise<void> {
	const temporaryPath = `${path}.${randomUUID()}`;
	try {
		await writeFile(temporaryPath, content, { mode: 0o600, flag: 'wx' });
		await rename(temporaryPath, path);
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

function checked(result: ICommandResult, operation: string): string {
	if (result.code !== 0) {
		throw new Error(localize('devContainerSample.commandFailed', "{0} failed (exit {1}): {2}", operation, result.code, result.stderr || result.stdout));
	}
	return result.stdout;
}

export async function prepareDevContainerSample(sample: DevContainerSample, cacheDirectory: string, commands: ISampleCommands): Promise<IPreparedDevContainerSample> {
	await prepareOwnerOnlyDirectory(cacheDirectory);
	const sourcePath = join(cacheDirectory, 'source.json');
	let sourceContent: string | undefined;
	try {
		sourceContent = await readFile(sourcePath, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
	const folder = getDevContainerSampleFolder(sample);
	if (sourceContent === undefined) {
		const { commitSha, content } = await commands.readSource();
		parseDevContainerSampleConfiguration(content);
		sourceContent = JSON.stringify({ commit: commitSha, content });
		await writeAtomic(sourcePath, sourceContent);
	}
	const source: unknown = JSON.parse(sourceContent);
	if (!isRecord(source) || typeof source.commit !== 'string' || !/^[a-f0-9]{40}$/.test(source.commit) || typeof source.content !== 'string') {
		throw new Error(localize('devContainerSample.invalidCache', "The cached sample configuration is invalid: {0}", sourcePath));
	}
	const config = parseDevContainerSampleConfiguration(source.content);
	const existingVolumes = checked(await commands.docker(['volume', 'ls', '--format', '{{.Name}}']), 'docker volume ls').trim().split(/\r?\n/);
	const repository: IDevContainerRepository = {
		repositoryPath: getExtensionRepositoryUrl(sample),
		volumeName: getDevContainerSampleVolumeName(sample, existingVolumes),
		folder,
	};
	if (!existingVolumes.includes(repository.volumeName)) {
		checked(await commands.docker(['volume', 'create', '--label', `vsch.local.repository=${repository.repositoryPath}`, '--label', 'vsch.local.repository.unique=true', repository.volumeName]), 'docker volume create');
	}
	const labels: unknown = JSON.parse(checked(await commands.docker(['volume', 'inspect', '--format', '{{json .Labels}}', repository.volumeName]), 'docker volume inspect'));
	if (!isRecord(labels) || labels['vsch.local.repository'] !== repository.repositoryPath) {
		throw new Error(localize('devContainerSample.volumeConflict', "The Docker volume '{0}' does not belong to this sample.", repository.volumeName));
	}

	const workspace = `/workspaces/${folder}`;
	const configPath = join(cacheDirectory, 'devcontainer.json');
	const writeConfig = (configuration: Record<string, unknown>) => writeAtomic(configPath, JSON.stringify({
		...configuration,
		workspaceFolder: workspace,
		workspaceMount: `type=volume,source=${repository.volumeName},target=/workspaces`,
		updateRemoteUserUID: false,
	}));
	await writeConfig(config);
	const cliArgs = ['--override-config', configPath, ...getDevContainerSampleLabels(repository).flatMap(label => ['--id-label', label])];
	const up = await commands.devcontainer(['up', '--log-level', 'debug', ...cliArgs, '--skip-post-create', '--mount', devContainerServerCacheMount]);
	const errors: ParseError[] = [];
	const result: unknown = parse(up.stdout.trim().split(/\r?\n/).at(-1) ?? '', errors);
	if (isRecord(result) && typeof result.containerId === 'string' && result.containerId) {
		commands.onContainerStarted(result.containerId);
	}
	checked(up, 'devcontainer up');
	if (errors.length || !isRecord(result) || result.outcome !== 'success' || typeof result.containerId !== 'string' || !result.containerId || typeof result.remoteUser !== 'string' || !result.remoteUser || result.remoteWorkspaceFolder !== workspace) {
		throw new Error(localize('devContainerSample.invalidUpResult', "The Dev Container CLI returned an invalid sample container."));
	}

	// Publish only a complete checkout, and never replace an existing workspace.
	const cloneScript = `set -eu
workspace=${shellEscape(workspace)}
if [ -e "$workspace/.git" ]; then
	git -c safe.directory="$workspace" -C "$workspace" rev-parse --is-inside-work-tree
else
	if [ -e "$workspace" ]; then rmdir "$workspace"; fi
	staging=$(mktemp -d /workspaces/.vscode-sample-XXXXXXXX)
	trap 'rm -rf -- "$staging"' EXIT
	GIT_TERMINAL_PROMPT=0 git clone --no-checkout ${shellEscape(getDevContainerSampleUrl(sample))} "$staging"
	branch=$(git -C "$staging" symbolic-ref --short HEAD)
	git -C "$staging" checkout -B "$branch" ${shellEscape(source.commit)}
	chown -R "$(id -u ${shellEscape(result.remoteUser)}):$(id -g ${shellEscape(result.remoteUser)})" "$staging"
	mv -T "$staging" "$workspace"
fi`;
	checked(await commands.docker(['exec', '--user', 'root', '--workdir', '/', result.containerId, '/bin/sh', '-c', cloneScript]), 'git clone');
	const actualContent = checked(await commands.docker(['exec', '--user', 'root', result.containerId, 'cat', `${workspace}/.devcontainer/devcontainer.json`]), 'cat devcontainer.json');
	const actualConfig = parseDevContainerSampleConfiguration(actualContent);
	if (actualConfig.image !== config.image) {
		const containerImage: unknown = JSON.parse(checked(await commands.docker(['inspect', '--format', '{{json .Config.Image}}', result.containerId]), 'docker inspect'));
		if (containerImage !== actualConfig.image) {
			throw new Error(localize('devContainerSample.imageChanged', "The sample's image has changed. Rebuild the container with the Dev Containers extension before opening it in Agents."));
		}
	}
	await writeConfig(actualConfig);
	await writeAtomic(sourcePath, JSON.stringify({ commit: source.commit, content: actualContent }));
	const lifecycleOutput = checked(await commands.devcontainer(['run-user-commands', '--log-level', 'debug', ...cliArgs, '--container-id', result.containerId]), 'devcontainer run-user-commands');
	const lifecycleResult: unknown = JSON.parse(lifecycleOutput.trim().split(/\r?\n/).at(-1)!);
	if (!isRecord(lifecycleResult) || lifecycleResult.outcome !== 'success') {
		throw new Error(localize('devContainerSample.lifecycleFailed', "The sample's Dev Container lifecycle commands failed: {0}", lifecycleOutput));
	}
	return { containerId: result.containerId, remoteWorkspaceFolder: workspace, cliArgs, repository };
}
