/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO: Remove this compatibility file after adopting a protocol release containing https://github.com/microsoft/agent-host-protocol/pull/451.

import { disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenPool, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ICloudSandboxProject, readCloudSandboxCloneResult, readCloudSandboxProjects } from '../../../../../platform/agentHost/common/meta/cloudSandboxProjectMeta.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { RootState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { getGitHubRepositoryFromRemoteUrl, IGitHubRemoteInfo } from '../../../../../workbench/contrib/git/common/utils.js';
import { RemoteAgentHostSessionPreparation } from './remoteAgentHostConnectionCustomization.js';

export function createCloudSandboxSessionPreparation(
	root: IAgentSubscription<RootState>,
	request: (method: 'extensions/cloneProject', params: { url: string; depth: 1 }) => Promise<unknown>,
	owner: DisposableStore,
): RemoteAgentHostSessionPreparation {
	const lifetime = cancelOnDispose(owner);
	const preparations = new Map<string, { readonly promise: Promise<URI>; readonly cancellation: CancellationTokenPool }>();

	return async (selection, token) => {
		if (token.isCancellationRequested || lifetime.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!selection || selection.scheme !== Schemas.https) {
			return undefined;
		}
		const state = root.value;
		if (state instanceof Error) {
			throw state;
		}
		if (!state) {
			throw new Error(localize('sandbox.projectStateUnavailable', "The cloud sandbox's project state is unavailable."));
		}
		const projects = readCloudSandboxProjects(state);
		if (!projects) {
			return undefined;
		}
		const repository = getGitHubRepositoryFromRemoteUrl(selection.toString(), ['github.com']);
		if (!repository || !equalsIgnoreCase(selection.authority, 'github.com') || selection.query || selection.fragment) {
			throw new Error(localize('sandbox.invalidRepository', "The cloud sandbox requires a GitHub repository URL without credentials, a query, or a fragment."));
		}
		const key = `${repository.owner.toLowerCase()}/${repository.repo.toLowerCase()}`;
		let preparation = preparations.get(key);
		if (!preparation || preparation.cancellation.token.isCancellationRequested) {
			const cancellation = new CancellationTokenPool();
			const promise = prepareRepository(repository, projects, cancellation.token).finally(() => {
				if (preparations.get(key)?.promise === promise) {
					preparations.delete(key);
				}
				cancellation.dispose();
			});
			preparation = { promise, cancellation };
			preparations.set(key, preparation);
		}
		preparation.cancellation.add(token);
		return raceCancellationError(preparation.promise, token);
	};

	async function prepareRepository(repository: IGitHubRemoteInfo, projects: readonly ICloudSandboxProject[], token: CancellationToken): Promise<URI> {
		const matchesRepository = (project: ICloudSandboxProject): boolean => {
			const remote = project.remoteUrl && getGitHubRepositoryFromRemoteUrl(project.remoteUrl, ['github.com']);
			return !!remote && equalsIgnoreCase(remote.owner, repository.owner) && equalsIgnoreCase(remote.repo, repository.repo);
		};
		const matching = projects.filter(matchesRepository);
		const existing = matching.find(project => project.status === 'ready') ?? matching.find(project => project.status === 'cloning');
		const store = new DisposableStore();
		try {
			return await new Promise<URI>((resolve, reject) => {
				let projectId = existing?.id;
				// A retry acknowledgement can arrive before the failed catalogue entry is replaced.
				let staleFailure = matching.find(project => project.status === 'failed');
				const seen = new Set(projects.map(project => project.id));
				const update = () => {
					if (store.isDisposed) {
						return;
					}
					const state = root.value;
					if (state instanceof Error) {
						reject(state);
						return;
					}
					const current = state && readCloudSandboxProjects(state);
					if (!current) {
						reject(new Error(localize('sandbox.projectManagementUnavailable', "The cloud sandbox no longer advertises repository preparation.")));
						return;
					}
					if (staleFailure && !equals(staleFailure, current.find(project => project.id === staleFailure?.id))) {
						staleFailure = undefined;
					}
					const project = current.find(project => project.id === projectId);
					if (projectId && !project && seen.has(projectId)) {
						reject(new Error(localize('sandbox.projectRemoved', "The repository was removed from the cloud sandbox while it was being prepared.")));
					}
					for (const entry of current) {
						seen.add(entry.id);
					}
					if (!project) {
						return;
					}
					if (!matchesRepository(project)) {
						reject(new Error(localize('sandbox.projectChanged', "The cloud sandbox returned a different repository.")));
					} else if (project.status === 'failed' && !equals(project, staleFailure)) {
						reject(getCloneError(project));
					} else if (project.status === 'ready') {
						if (!project.git || !project.path.startsWith('/') || project.path.includes('\0')) {
							reject(new Error(localize('sandbox.invalidProjectDirectory', "The cloud sandbox did not return a usable repository directory.")));
						} else {
							resolve(URI.file(project.path));
						}
					}
				};
				store.add(root.onDidChange(update));
				if (root.onDidError) {
					store.add(root.onDidError(reject));
				}
				store.add(token.onCancellationRequested(() => reject(new CancellationError())));
				store.add(lifetime.onCancellationRequested(() => reject(new CancellationError())));
				store.add(disposableTimeout(() => reject(new Error(localize('sandbox.projectTimedOut', "Repository cloning did not finish within five minutes."))), 5 * 60_000));
				update();
				if (!projectId) {
					const url = URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${repository.owner}/${repository.repo}` }).toString();
					request('extensions/cloneProject', { url, depth: 1 }).then(result => {
						if (store.isDisposed) {
							return;
						}
						const project = readCloudSandboxCloneResult(result);
						if (!project || (project.status !== 'failed' && !matchesRepository(project))) {
							reject(new Error(localize('sandbox.invalidCloneResult', "The cloud sandbox returned an invalid repository cloning response.")));
							return;
						}
						if (project.status === 'failed') {
							reject(getCloneError(project));
							return;
						}
						projectId = project.id;
						update();
					}, reject);
				}
			});
		} finally {
			store.dispose();
		}
	}
}

function getCloneError(project: ICloudSandboxProject): Error {
	return new Error(project.error
		? localize('sandbox.projectFailedWithReason', "Repository cloning failed: {0}", project.error)
		: localize('sandbox.projectFailed', "Repository cloning failed."));
}
