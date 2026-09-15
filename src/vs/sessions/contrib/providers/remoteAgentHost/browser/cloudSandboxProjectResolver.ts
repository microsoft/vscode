/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { posix } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { supportsAgentHostProjectManagement } from '../../../../../platform/agentHost/common/meta/agentHostProjectMeta.js';
import { RootState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { getGitHubRepositoryId } from '../../../../common/gitHubRepository.js';

const CLONE_TIMEOUT_MS = 180_000;

interface IHostProject {
	readonly id: string;
	readonly path: string;
	readonly git: boolean;
	readonly status: 'cloning' | 'ready' | 'failed';
	readonly remoteUrl?: string;
	readonly progress?: number;
	readonly error?: string;
}

function invalidProject(): Error {
	return new Error(localize('cloudSandbox.invalidProject', "The remote host returned invalid repository information."));
}

function readProject(value: unknown): IHostProject {
	if (typeof value !== 'object' || value === null) {
		throw invalidProject();
	}
	const candidate = value as Partial<IHostProject>;
	const { id, path, git, status, remoteUrl, progress, error } = candidate;
	if (typeof id !== 'string' || !id
		|| typeof path !== 'string' || !posix.isAbsolute(path)
		|| typeof git !== 'boolean'
		|| (status !== 'cloning' && status !== 'ready' && status !== 'failed')
		|| (remoteUrl !== undefined && typeof remoteUrl !== 'string')
		|| (progress !== undefined && (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0 || progress > 100))
		|| (error !== undefined && typeof error !== 'string')) {
		throw invalidProject();
	}
	return { id, path, git, status, remoteUrl, progress, error };
}

function readProjects(state: RootState): readonly IHostProject[] {
	const namespace = state.config?.values.copilot;
	const projects = typeof namespace === 'object' && namespace !== null
		? (namespace as { projects?: unknown }).projects
		: undefined;
	if (!Array.isArray(projects)) {
		throw invalidProject();
	}
	return projects.map(readProject);
}

function findProject(state: RootState, repository: string): IHostProject | undefined {
	return readProjects(state).find(project =>
		project.remoteUrl && getGitHubRepositoryId(project.remoteUrl)?.toLowerCase() === repository.toLowerCase());
}

function readRoot(connection: IAgentConnection): RootState {
	const state = connection.rootState.value;
	if (state instanceof Error) {
		throw state;
	}
	if (!state) {
		throw new Error(localize('cloudSandbox.noProjectCatalogue', "Repository information is not available from the remote host."));
	}
	return state;
}

function projectDirectory(connection: IAgentConnection, project: IHostProject): URI | undefined {
	if (project.status === 'failed') {
		throw new Error(localize('cloudSandbox.cloneFailed', "The remote repository could not be prepared: {0}", project.error ?? localize('cloudSandbox.cloneFailedUnknown', "Cloning failed.")));
	}
	if (project.status !== 'ready') {
		return undefined;
	}
	if (!project.git) {
		throw new Error(localize('cloudSandbox.projectNotRepository', "The remote project is not a Git repository."));
	}
	return connection.resourceUris.fromAgentHost(URI.file(project.path));
}

/** Resolves a sandbox repository through the host's project-management extension. */
export class CloudSandboxProjectResolver {
	constructor(
		@IProgressService private readonly progressService: IProgressService,
	) { }

	async resolve(connection: IAgentConnection, workingDirectory: URI | undefined, token: CancellationToken): Promise<URI | undefined> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!workingDirectory || workingDirectory.scheme !== Schemas.https || workingDirectory.authority.toLowerCase() !== 'github.com') {
			return workingDirectory;
		}
		const state = readRoot(connection);
		if (!supportsAgentHostProjectManagement(state)) {
			return workingDirectory;
		}
		const repository = getGitHubRepositoryId(workingDirectory.toString());
		if (!repository || workingDirectory.query || workingDirectory.fragment) {
			throw new Error(localize('cloudSandbox.invalidRepository', "Choose a GitHub repository before starting this session."));
		}
		const existing = findProject(state, repository);
		if (existing?.status === 'ready') {
			return projectDirectory(connection, existing);
		}
		const store = new DisposableStore();
		const cts = store.add(new CancellationTokenSource(token));
		try {
			return await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('cloudSandbox.prepareRepository', "Preparing Repository"),
				cancellable: true,
				total: 100,
				delay: 500,
			}, progress => this.waitForProject(connection, repository, existing, cts.token, progress), () => cts.cancel());
		} finally {
			store.dispose();
		}
	}

	private async waitForProject(connection: IAgentConnection, repository: string, existing: IHostProject | undefined, token: CancellationToken, progress: IProgress<IProgressStep>): Promise<URI> {
		const store = new DisposableStore();
		const cts = store.add(new CancellationTokenSource(token));
		const completion = new DeferredPromise<URI>();
		const deadline = new DeferredPromise<never>();
		let projectId = existing?.id;
		let awaitingRetryCatalogue = existing?.status === 'failed';
		let lastProgress: number | undefined;
		const isPreviousFailure = (project: IHostProject): boolean =>
			awaitingRetryCatalogue && project.id === existing?.id && project.status === 'failed';
		const update = (project: IHostProject): void => {
			if (completion.isSettled) {
				return;
			}
			try {
				if (projectId && project.id !== projectId) {
					throw invalidProject();
				}
				const directory = projectDirectory(connection, project);
				if (directory) {
					completion.complete(directory);
					return;
				}
				const percent = Math.max(lastProgress ?? 0, project.progress ?? 0);
				if (percent !== lastProgress) {
					progress.report({
						message: localize('cloudSandbox.cloningRepository', "Cloning {0} ({1}%)...", repository, percent),
						increment: percent - (lastProgress ?? 0),
					});
					lastProgress = percent;
				}
			} catch (error) {
				completion.error(error);
			}
		};
		const observe = (): void => {
			try {
				const project = findProject(readRoot(connection), repository);
				if (project) {
					if (isPreviousFailure(project)) {
						return;
					}
					awaitingRetryCatalogue = false;
					update(project);
				} else if (projectId) {
					completion.error(new Error(localize('cloudSandbox.projectRemoved', "The remote repository was removed while it was being prepared.")));
				}
			} catch (error) {
				completion.error(error);
			}
		};
		store.add(connection.rootState.onDidChange(observe));
		if (connection.rootState.onDidError) {
			store.add(connection.rootState.onDidError(error => completion.error(error)));
		}
		store.add(cts.token.onCancellationRequested(() => completion.cancel()));
		store.add(disposableTimeout(() => deadline.error(new Error(localize('cloudSandbox.cloneTimeout', "Timed out waiting for the remote repository to be prepared."))), CLONE_TIMEOUT_MS));

		const start = async (): Promise<void> => {
			if (cts.token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (existing?.status === 'cloning') {
				update(existing);
				observe();
				return;
			}
			if (!connection.requestExtension) {
				throw new Error(localize('cloudSandbox.projectRequestsUnsupported', "This connection cannot prepare repositories on the remote host."));
			}
			progress.report({ message: localize('cloudSandbox.startClone', "Cloning {0}...", repository) });
			const response = await raceCancellationError(connection.requestExtension('extensions/cloneProject', {
				url: `https://github.com/${repository}`,
				depth: 1,
			}), cts.token);
			if (typeof response !== 'object' || response === null) {
				throw invalidProject();
			}
			const project = readProject((response as { project?: unknown }).project);
			if (!project.remoteUrl || getGitHubRepositoryId(project.remoteUrl)?.toLowerCase() !== repository.toLowerCase()) {
				throw invalidProject();
			}
			projectId = project.id;
			const current = findProject(readRoot(connection), repository);
			if (current && !isPreviousFailure(current)) {
				if (current.id !== projectId) {
					throw invalidProject();
				}
				awaitingRetryCatalogue = false;
				update(current);
			} else {
				update(project);
			}
		};

		try {
			const [, directory] = await Promise.race([Promise.all([start(), completion.p]), deadline.p]);
			return directory;
		} finally {
			cts.cancel();
			store.dispose();
		}
	}
}
