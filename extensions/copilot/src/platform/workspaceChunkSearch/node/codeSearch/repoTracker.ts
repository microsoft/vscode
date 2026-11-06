/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { exec } from 'child_process';
import { promisify } from 'util';
import { coalesce } from '../../../../util/vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise, raceCancellationError, raceTimeout } from '../../../../util/vs/base/common/async';
import { isCancellationError } from '../../../../util/vs/base/common/errors';
import { Emitter } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { Schemas } from '../../../../util/vs/base/common/network';
import { URI } from '../../../../util/vs/base/common/uri';
import { IGitExtensionService } from '../../../git/common/gitExtensionService';
import { getGithubRepoIdFromFetchUrl, getOrderedRemoteUrlsFromContext, getOrderedRepoInfosFromContext, GithubRepoId, IGitService, parseRemoteUrl, RepoContext, ResolvedRepoRemoteInfo } from '../../../git/common/gitService';
import { LogExecTime } from '../../../log/common/logExecTime';
import { ILogService } from '../../../log/common/logService';
import { isGitHubRemoteRepository } from '../../../remoteRepositories/common/utils';
import { ISimulationTestContext } from '../../../simulationTestContext/common/simulationTestContext';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { IWorkspaceService } from '../../../workspace/common/workspaceService';

export enum TrackedRepoStatus {
	/** The repo is currently being resolved */
	Resolving = 'Resolving',

	/**
	 * The repo was successfully resolved.
	 *
	 * Resolved repos have resolved remote information (such as GitHub or ADO) associated with them or they
	 * may be generic git repos that we are unable to resolve further.
	 */
	Resolved = 'Resolved',
}

export interface RepoInfo {
	readonly rootUri: URI;
}

export type TrackedRepoState =
	{
		readonly status: TrackedRepoStatus.Resolving;
		readonly repo: RepoInfo;
		readonly initTask: CancelablePromise<void>;
	} | {
		readonly status: TrackedRepoStatus.Resolved;
		readonly repo: RepoInfo;
		readonly resolvedRemoteInfo: ResolvedRepoRemoteInfo | undefined;
	}
	;

/**
 * Tracks git repositories in the workspace and their resolved remote information.
 */
export class CodeSearchRepoTracker extends Disposable {
	private readonly _repos = new ResourceMap<TrackedRepoState>();

	private readonly _onDidAddOrUpdateRepo = this._register(new Emitter<TrackedRepoState>());
	public readonly onDidAddOrUpdateRepo = this._onDidAddOrUpdateRepo.event;

	private readonly _onDidRemoveRepo = this._register(new Emitter<TrackedRepoState>());
	public readonly onDidRemoveRepo = this._onDidRemoveRepo.event;

	private readonly _initializedGitReposP: CancelablePromise<void>;
	private readonly _initializedGitHubRemoteReposP: CancelablePromise<void>;

	private _isDisposed = false;

	constructor(
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
		@IGitService private readonly _gitService: IGitService,
		@ILogService private readonly _logService: ILogService,
		@ISimulationTestContext private readonly _simulationTestContext: ISimulationTestContext,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super();

		this._initializedGitReposP = createCancelablePromise(async (token) => {
			this._logService.trace(`CodeSearchRepoTracker.tryInitGitRepos(): started`);

			try {
				if (!this._gitService.isInitialized) {
					this._logService.trace(`CodeSearchRepoTracker.tryInitGitRepos(): Git service not initialized. Waiting for init signal.`);
					const finishInitTimeout = 30_000;
					await raceCancellationError(raceTimeout(new Promise<void>(resolve => this._gitService.onDidFinishInitialization(() => resolve())), finishInitTimeout), token);
					if (this._isDisposed) {
						return;
					}
				}

				this._logService.trace(`CodeSearchRepoTracker.tryInitGitRepos(): Found initial repos: [${this._gitService.repositories.map(repo => repo.rootUri.toString())}].`);

				const openPromises = this._gitService.repositories.map(repo => this.openGitRepo(repo));

				this._register(this._gitService.onDidOpenRepository(repo => this.openGitRepo(repo)));
				this._register(this._gitService.onDidCloseRepository(repo => this.closeRepo(repo)));

				await raceCancellationError(Promise.allSettled(openPromises), token);
				this._logService.trace(`CodeSearchRepoTracker.tryInitGitRepos(): Complete`);
			} catch (e) {
				this._logService.error(`CodeSearchRepoTracker.tryInitGitRepos(): Error occurred during initialization: ${e}`);
			}
		});

		this._initializedGitHubRemoteReposP = createCancelablePromise(async (token) => {
			try {
				const githubRemoteRepos = this._workspaceService.getWorkspaceFolders().filter(isGitHubRemoteRepository);
				if (!githubRemoteRepos.length) {
					return;
				}

				this._logService.trace(`CodeSearchRepoTracker.initGithubRemoteRepos(): started`);

				await raceCancellationError(
					Promise.all(githubRemoteRepos.map(workspaceRoot => {
						const githubRepoIdParts = workspaceRoot.path.slice(1).split('/');
						return this.openGithubRemoteRepo(workspaceRoot, new GithubRepoId(githubRepoIdParts[0], githubRepoIdParts[1]));
					})),
					token);
				this._logService.trace(`CodeSearchRepoTracker.initGithubRemoteRepos(): complete`);
			} catch (e) {
				this._logService.error(`CodeSearchRepoTracker.initGithubRemoteRepos(): Error occurred during initialization: ${e}`);
			}
		});
	}

	public override dispose(): void {
		super.dispose();

		this._isDisposed = true;

		this._initializedGitReposP.cancel();
		this._initializedGitHubRemoteReposP.cancel();

		for (const repo of this._repos.values()) {
			if (repo.status === TrackedRepoStatus.Resolving) {
				repo.initTask.cancel();
			}
		}
		this._repos.clear();
	}

	public async initialize(): Promise<void> {
		try {
			// Wait for the initial repos to be discovered
			await Promise.all([
				this._initializedGitReposP,
				this._initializedGitHubRemoteReposP
			]);

			// And wait for each repo to resolve
			await Promise.all(Array.from(this._repos.values(), async repo => {
				if (repo.status === TrackedRepoStatus.Resolving) {
					try {
						await repo.initTask;
					} catch (error) {
						this._logService.error(`Error during repo initialization: ${error}`);
					}
				}
			}));
		} catch (e) {
			// Noop
		}
	}

	public getAllTrackedRepos(): readonly TrackedRepoState[] {
		return Array.from(this._repos.values());
	}

	private updateRepoEntry(repo: RepoInfo, entry: TrackedRepoState): void {
		this._repos.set(repo.rootUri, entry);
		this._onDidAddOrUpdateRepo.fire(entry);
	}

	@LogExecTime(self => self._logService, 'CodeSearchRepoTracker::openGitRepo')
	private async openGitRepo(repo: RepoContext): Promise<void> {
		this._logService.trace(`CodeSearchRepoTracker.openGitRepo(${repo.rootUri})`);

		const existing = this._repos.get(repo.rootUri);
		if (existing) {
			if (existing.status === TrackedRepoStatus.Resolving) {
				try {
					return await existing.initTask;
				} catch (e) {
					if (isCancellationError(e)) {
						return;
					}

					throw e;
				}
			}
		}

		const initTask = createCancelablePromise(async (initToken) => {
			try {
				try {
					// Do a status check to make sure the repo info is fully loaded
					// See #12954
					await this._gitExtensionService.getExtensionApi()?.getRepository(repo.rootUri)?.status();
				} catch {
					this._logService.trace(`CodeSearchRepoTracker.openRepo(${repo.rootUri}). git status check failed.`);
					// Noop, may still be ok even if the status check failed
				}

				if (initToken.isCancellationRequested) {
					return;
				}

				const updatedRepo = await this._gitService.getRepository(repo.rootUri);
				if (!updatedRepo && !this._simulationTestContext.isInSimulationTests) {
					this._logService.trace(`CodeSearchRepoTracker.openRepo(${repo.rootUri}). No current repo found after status check.`);

					/* __GDPR__
						"codeSearchRepoTracker.openGitRepo.error.noCurrentRepo" : {
							"owner": "mjbvz",
							"comment": "Information about errors when trying to resolve a remote"
						}
					*/
					this._telemetryService.sendMSFTTelemetryEvent('codeSearchRepoTracker.openGitRepo.error.noCurrentRepo');

					this.closeRepo(repo);
					return;
				}

				if (updatedRepo) {
					repo = updatedRepo;
				}
				this._repos.set(repo.rootUri, { status: TrackedRepoStatus.Resolving, repo, initTask });

				const remoteInfos = await this.getResolvedRemoteInfosForRepo(repo);
				if (initToken.isCancellationRequested) {
					return;
				}

				/* __GDPR__
					"codeSearchRepoTracker.openGitRepo.remoteInfo" : {
						"owner": "mjbvz",
						"comment": "Information about the remote",
						"resolvedRemoteType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Identifies the primary remote's type " }
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('codeSearchRepoTracker.openGitRepo.remoteInfo', {}, {
					resolvedRemoteType: this.getRemoteTypeForTelemetry(remoteInfos, repo),
				});

				if (!remoteInfos.length) {
					this._logService.trace(`CodeSearchRepoTracker.openRepo(${repo.rootUri}). No valid github remote found. Remote urls: ${JSON.stringify(Array.from(getOrderedRemoteUrlsFromContext(repo)))}.`);

					this._telemetryService.sendInternalMSFTTelemetryEvent('codeSearchRepoTracker.error.couldNotResolveRemote.internal', {
						remoteUrls: JSON.stringify(coalesce(repo.remoteFetchUrls ?? [])),
					});

					/* __GDPR__
						"codeSearchRepoTracker.openGitRepo.error.couldNotResolveRemote" : {
							"owner": "mjbvz",
							"comment": "Information about errors when trying to resolve a remote",
							"repoRemoteFetchUrlsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of remote fetch urls on the git repo" }
						}
					*/
					this._telemetryService.sendMSFTTelemetryEvent('codeSearchRepoTracker.openGitRepo.error.couldNotResolveRemote', {}, {
						repoRemoteFetchUrlsCount: repo.remoteFetchUrls?.length ?? 0,
					});

					this.updateRepoEntry(repo, { status: TrackedRepoStatus.Resolved, repo, resolvedRemoteInfo: undefined });
					return;
				}

				// TODO: Support multiple remotes
				const primaryRemote = remoteInfos.at(0);
				this.updateRepoEntry(repo, {
					status: TrackedRepoStatus.Resolved,
					repo,
					resolvedRemoteInfo: primaryRemote,
				});
			} catch (e) {
				if (isCancellationError(e)) {
					throw e;
				}

				this._logService.error(`CodeSearchRepoTracker.openRepo(${repo.rootUri}). Error during remote resolution: ${e}`);
			}
		});

		this._repos.set(repo.rootUri, {
			status: TrackedRepoStatus.Resolving,
			repo,
			initTask
		});
	}

	private getRemoteTypeForTelemetry(remoteInfos: readonly ResolvedRepoRemoteInfo[], repo: RepoContext): GitRemoteTypeForTelemetry {
		if (remoteInfos.length) {
			const primaryRemote = remoteInfos[0];
			const remoteHost = primaryRemote.fetchUrl ? parseRemoteUrl(primaryRemote.fetchUrl) : undefined;
			return remoteHost ? getRemoteTypeForTelemetry(remoteHost.host) : GitRemoteTypeForTelemetry.Unknown;
		}

		const allRemotes = Array.from(getOrderedRemoteUrlsFromContext(repo));
		if (allRemotes.length === 0) {
			return GitRemoteTypeForTelemetry.NoRemotes;
		} else {
			for (const remote of allRemotes) {
				if (remote) {
					const remoteHost = parseRemoteUrl(remote);
					if (remoteHost) {
						const telemetryId = getRemoteTypeForTelemetry(remoteHost.host);
						if (telemetryId !== GitRemoteTypeForTelemetry.Unknown) {
							return telemetryId;
						}
					}
				}
			}
		}
		return GitRemoteTypeForTelemetry.Unknown;
	}

	private async openGithubRemoteRepo(rootUri: URI, githubId: GithubRepoId): Promise<void> {
		this._logService.trace(`CodeSearchRepoTracker.openGithubRemoteRepo(${rootUri})`);

		const existing = this._repos.get(rootUri);
		if (existing) {
			if (existing.status === TrackedRepoStatus.Resolving) {
				return existing.initTask;
			}
		}

		this._repos.set(rootUri, {
			status: TrackedRepoStatus.Resolved,
			repo: { rootUri },
			resolvedRemoteInfo: {
				repoId: githubId,
				fetchUrl: undefined,
			}
		});
	}

	private closeRepo(repo: RepoContext) {
		this._logService.trace(`CodeSearchRepoTracker.closeRepo(${repo.rootUri})`);

		const repoEntry = this._repos.get(repo.rootUri);
		if (!repoEntry) {
			return;
		}

		if (repoEntry.status === TrackedRepoStatus.Resolving) {
			repoEntry.initTask.cancel();
		}

		this._onDidRemoveRepo.fire(repoEntry);
		this._repos.delete(repo.rootUri);
	}

	private async getResolvedRemoteInfosForRepo(repo: RepoContext): Promise<ResolvedRepoRemoteInfo[]> {
		const remoteInfos = Array.from(getOrderedRepoInfosFromContext(repo));

		// Fallback to checking the SSH config if no remotes were found
		if (!remoteInfos.length) {
			const other = await this.getGithubRemoteFromSshConfig(repo);
			if (other) {
				remoteInfos.push(other);
			}
		}

		// For now always prefer the github remotes
		remoteInfos.sort((a, b) => {
			if (a.repoId.type === 'github' && b.repoId.type !== 'github') {
				return -1;
			} else if (b.repoId.type === 'github' && a.repoId.type !== 'github') {
				return 1;
			}
			return 0;
		});

		return remoteInfos;
	}

	private async getGithubRemoteFromSshConfig(repo: RepoContext): Promise<ResolvedRepoRemoteInfo | undefined> {
		if (repo.rootUri.scheme !== Schemas.file) {
			return;
		}

		try {
			const execAsync = promisify(exec);
			const { stdout, stderr } = await execAsync('git -c credential.interactive=never fetch --dry-run', {
				cwd: repo.rootUri.fsPath,
				env: {
					GIT_SSH_COMMAND: 'ssh -v -o BatchMode=yes'
				}
			});

			const output = stdout + '\n' + stderr;

			const authMatch = output.match(/^Authenticated to ([^\s]+)\s/m);
			const fromMatch = output.match(/^From ([^:]+):([^/]+)\/([^\s]+)$/m);

			if (authMatch && fromMatch) {
				const authenticatedTo = authMatch[1];
				const owner = fromMatch[2];
				const repo = fromMatch[3].replace(/\.git$/, '');
				const remoteUrl = `ssh://${authenticatedTo}/${owner}/${repo}`;

				const githubRepoId = getGithubRepoIdFromFetchUrl(remoteUrl);
				if (githubRepoId) {
					return {
						repoId: githubRepoId,
						fetchUrl: remoteUrl
					};
				}
			}
			return undefined;
		} catch (e) {
			return undefined;
		}
	}
}

/**
 * Ids used to identify the type of remote for telemetry purposes
 *
 * Do not change these values as they are used in telemetry.
 */
enum GitRemoteTypeForTelemetry {
	NoRemotes = 0,
	Unknown = 1,

	Github = 2,
	Ghe = 3,

	// Unsupported
	AzureDevOps = 4,
	VisualStudioDotCom = 5,
	GitLab = 6,
	BitBucket = 7,
}

const remoteHostTelemetryIdMapping = new Map<string, GitRemoteTypeForTelemetry>([
	['github.com', GitRemoteTypeForTelemetry.Github],
	['ghe.com', GitRemoteTypeForTelemetry.Ghe],

	['dev.azure.com', GitRemoteTypeForTelemetry.AzureDevOps],
	['visualstudio.com', GitRemoteTypeForTelemetry.VisualStudioDotCom],
	['gitlab.com', GitRemoteTypeForTelemetry.GitLab],
	['bitbucket.org', GitRemoteTypeForTelemetry.BitBucket],
]);

function getRemoteTypeForTelemetry(remoteHost: string): GitRemoteTypeForTelemetry {
	remoteHost = remoteHost.toLowerCase();
	for (const [key, value] of remoteHostTelemetryIdMapping) {
		if (remoteHost === key || remoteHost.endsWith('.' + key)) {
			return value;
		}
	}

	return GitRemoteTypeForTelemetry.Unknown;
}
