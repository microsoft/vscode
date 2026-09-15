/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { getGitHubRepositoryId } from '../../../../common/gitHubRepository.js';
import { ICloudSandboxProject, ICloudSandboxProjectsClient, invalidCloudSandboxProject } from './cloudSandboxProjectsClient.js';

const CLONE_TIMEOUT_MS = 180_000;

function findProject(client: ICloudSandboxProjectsClient, repository: string): ICloudSandboxProject | undefined {
	return client.getProjects().find(project =>
		project.remoteUrl && getGitHubRepositoryId(project.remoteUrl)?.toLowerCase() === repository.toLowerCase());
}

function projectDirectory(client: ICloudSandboxProjectsClient, project: ICloudSandboxProject): URI | undefined {
	if (project.status === 'failed') {
		throw new Error(localize('cloudSandbox.cloneFailed', "The remote repository could not be prepared: {0}", project.error ?? localize('cloudSandbox.cloneFailedUnknown', "Cloning failed.")));
	}
	if (project.status !== 'ready') {
		return undefined;
	}
	if (!project.git) {
		throw new Error(localize('cloudSandbox.projectNotRepository', "The remote project is not a Git repository."));
	}
	return client.toResourceUri(project.path);
}

/** Resolves a sandbox repository through the host's project-management extension. */
export class CloudSandboxProjectResolver {
	constructor(
		@IProgressService private readonly progressService: IProgressService,
	) { }

	async resolve(client: ICloudSandboxProjectsClient, workingDirectory: URI | undefined, token: CancellationToken): Promise<URI | undefined> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!workingDirectory || workingDirectory.scheme !== Schemas.https || workingDirectory.authority.toLowerCase() !== 'github.com') {
			return workingDirectory;
		}
		if (!client.isAvailable()) {
			return workingDirectory;
		}
		const repository = getGitHubRepositoryId(workingDirectory.toString());
		if (!repository || workingDirectory.query || workingDirectory.fragment) {
			throw new Error(localize('cloudSandbox.invalidRepository', "Choose a GitHub repository before starting this session."));
		}
		const existing = findProject(client, repository);
		if (existing?.status === 'ready') {
			return projectDirectory(client, existing);
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
			}, progress => this.waitForProject(client, repository, existing, cts.token, progress), () => cts.cancel());
		} finally {
			store.dispose();
		}
	}

	private async waitForProject(client: ICloudSandboxProjectsClient, repository: string, existing: ICloudSandboxProject | undefined, token: CancellationToken, progress: IProgress<IProgressStep>): Promise<URI> {
		const store = new DisposableStore();
		const cts = store.add(new CancellationTokenSource(token));
		const completion = new DeferredPromise<URI>();
		const deadline = new DeferredPromise<never>();
		let projectId = existing?.id;
		let awaitingRetryCatalogue = existing?.status === 'failed';
		let lastProgress: number | undefined;
		const isPreviousFailure = (project: ICloudSandboxProject): boolean =>
			awaitingRetryCatalogue && project.id === existing?.id && project.status === 'failed';
		const update = (project: ICloudSandboxProject): void => {
			if (completion.isSettled) {
				return;
			}
			try {
				if (projectId && project.id !== projectId) {
					throw invalidCloudSandboxProject();
				}
				const directory = projectDirectory(client, project);
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
				const project = findProject(client, repository);
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
		store.add(client.onDidChange(observe));
		store.add(client.onDidError(error => completion.error(error)));
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
			progress.report({ message: localize('cloudSandbox.startClone', "Cloning {0}...", repository) });
			const project = await client.cloneProject({
				url: `https://github.com/${repository}`,
				depth: 1,
			}, cts.token);
			projectId = project.id;
			const current = findProject(client, repository);
			if (current && !isPreviousFailure(current)) {
				if (current.id !== projectId) {
					throw invalidCloudSandboxProject();
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
