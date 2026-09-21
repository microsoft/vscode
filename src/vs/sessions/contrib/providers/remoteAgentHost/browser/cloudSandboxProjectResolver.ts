/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostProject, readAgentHostCloneResult, readAgentHostProjects, supportsAgentHostProjects } from '../../../../../platform/agentHost/common/meta/agentHostProjectMeta.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { RootState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../../../workbench/contrib/git/common/utils.js';

// Remove after adopting https://github.com/microsoft/agent-host-protocol/pull/451.
export class CloudSandboxProjectResolver extends Disposable {
	private readonly _lifetime = this._register(new CancellationTokenSource());

	constructor(
		private readonly _root: IAgentSubscription<RootState>,
		private readonly _request: (method: 'extensions/cloneProject', params: { url: string; depth: 1 }) => Promise<unknown>,
	) {
		super();
	}

	async prepareWorkingDirectory(directory: URI | undefined, token: CancellationToken): Promise<URI | undefined> {
		if (token.isCancellationRequested || this._lifetime.token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!directory || directory.scheme !== Schemas.https) {
			return undefined;
		}
		const root = this._root.value;
		if (root instanceof Error) {
			throw root;
		}
		if (!root) {
			throw new Error(localize('sandbox.projectStateUnavailable', "The cloud sandbox's project state is unavailable."));
		}
		if (!supportsAgentHostProjects(root)) {
			return undefined;
		}
		const repository = getGitHubRepositoryFromRemoteUrl(directory.toString(), ['github.com']);
		if (!repository || !equalsIgnoreCase(directory.authority, 'github.com') || directory.query || directory.fragment) {
			throw new Error(localize('sandbox.invalidRepository', "The cloud sandbox requires a GitHub repository URL without credentials, a query, or a fragment."));
		}
		const matchesRepository = (project: IAgentHostProject): boolean => {
			const remote = project.remoteUrl && getGitHubRepositoryFromRemoteUrl(project.remoteUrl, ['github.com']);
			return !!remote && equalsIgnoreCase(remote.owner, repository.owner) && equalsIgnoreCase(remote.repo, repository.repo);
		};
		const projects = readAgentHostProjects(root);
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
					const state = this._root.value;
					if (state instanceof Error) {
						reject(state);
						return;
					}
					if (!state || !supportsAgentHostProjects(state)) {
						reject(new Error(localize('sandbox.projectManagementUnavailable', "The cloud sandbox no longer advertises repository preparation.")));
						return;
					}
					const current = readAgentHostProjects(state);
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
						reject(new Error(project.error
							? localize('sandbox.projectFailedWithReason', "Repository cloning failed: {0}", project.error)
							: localize('sandbox.projectFailed', "Repository cloning failed.")));
					} else if (project.status === 'ready') {
						if (!project.git || !project.path.startsWith('/') || project.path.includes('\0')) {
							reject(new Error(localize('sandbox.invalidProjectDirectory', "The cloud sandbox did not return a usable repository directory.")));
						} else {
							resolve(URI.file(project.path));
						}
					}
				};
				store.add(this._root.onDidChange(update));
				if (this._root.onDidError) {
					store.add(this._root.onDidError(reject));
				}
				store.add(token.onCancellationRequested(() => reject(new CancellationError())));
				store.add(this._lifetime.token.onCancellationRequested(() => reject(new CancellationError())));
				store.add(disposableTimeout(() => reject(new Error(localize('sandbox.projectTimedOut', "Repository cloning did not finish within five minutes."))), 5 * 60_000));
				update();
				if (!projectId) {
					const url = URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${repository.owner}/${repository.repo}` }).toString();
					this._request('extensions/cloneProject', { url, depth: 1 }).then(result => {
						if (store.isDisposed) {
							return;
						}
						const project = readAgentHostCloneResult(result);
						if (!project || !matchesRepository(project)) {
							reject(new Error(localize('sandbox.invalidCloneResult', "The cloud sandbox returned an invalid repository cloning response.")));
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

	override dispose(): void {
		this._lifetime.cancel();
		super.dispose();
	}
}
