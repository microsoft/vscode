/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LinkPresentation } from '@vscode/markdown-editor';
import type { IObservable } from '@vscode/observables';
import * as vscode from 'vscode';
import { buildGitCommitLookupFailurePresentation, buildGitCommitPresentation, buildLoadingLinkPresentation, type GitCommitPresentationData } from './linkPresentationBuilders';
import { createAsyncLinkPresentation, decodeUrlPathSegments, ImmutableLinkPresentationCache, type LinkPresentationResolver, type LinkPresentationResolverContext } from './linkPresentationResolver';

export class GitLinkPresentationResolver implements LinkPresentationResolver {
	readonly refreshOnInterval = false;
	readonly #cache: ImmutableLinkPresentationCache;
	readonly #onDidChangeRepositories = new vscode.EventEmitter<void>();
	#gitApi: Promise<GitApi | undefined> | undefined;
	#gitApiSubscriptions: vscode.Disposable | undefined;
	#isDisposed = false;

	constructor(cache: ImmutableLinkPresentationCache) {
		this.#cache = cache;
	}

	resolve(href: string, context: LinkPresentationResolverContext): IObservable<LinkPresentation> | undefined {
		const target = parseGitCommitTarget(href);
		if (!target) {
			return undefined;
		}

		return createAsyncLinkPresentation(
			href,
			buildLoadingLinkPresentation('commit'),
			context,
			() => this.#cache.get(href, () => this.#resolve(target)),
			error => buildGitCommitLookupFailurePresentation(
				target.sha.slice(0, 7),
				error instanceof Error ? error.message : 'The Git commit could not be resolved.',
			),
			[context.onDidRequestRefresh, this.#onDidChangeRepositories.event],
		);
	}

	async open(href: string): Promise<boolean> {
		const target = parseGitCommitTarget(href);
		if (!target) {
			return false;
		}

		try {
			const result = await this.#findCommit(target);
			const revealed = await vscode.commands.executeCommand<boolean>(
				'_workbench.scm.revealHistoryItem',
				result.repository.rootUri,
				result.commit.hash,
			);
			if (!revealed) {
				await vscode.window.showWarningMessage(vscode.l10n.t("The commit could not be revealed in the Source Control Graph."));
			}
			return true;
		} catch (error) {
			if (target.repository) {
				return false;
			}
			await vscode.window.showWarningMessage(vscode.l10n.t(
				"The commit could not be found in an open Git repository. {0}",
				error instanceof Error ? error.message : '',
			));
			return true;
		}
	}

	dispose(): void {
		this.#isDisposed = true;
		this.#gitApiSubscriptions?.dispose();
		this.#onDidChangeRepositories.dispose();
	}

	async #resolve(target: GitCommitTarget): Promise<LinkPresentation> {
		return buildGitCommitPresentation((await this.#findCommit(target)).commit);
	}

	async #findCommit(target: GitCommitTarget): Promise<GitCommitResult> {
		const api = await this.#getGitApi();
		const repositories = api?.repositories.filter(repository => !target.repository || repository.state.remotes.some(remote => (
			[remote.fetchUrl, remote.pushUrl].some(url => url && normalizeGitRemoteUrl(url) === target.repository)
		))) ?? [];
		if (!repositories.length) {
			throw new Error(target.repository
				? `No open Git repository matches ${target.repository}.`
				: 'No Git repositories are open.');
		}

		const results = await Promise.allSettled(repositories.map(async repository => ({
			repository,
			commit: await repository.getCommit(target.sha),
		})));
		const match = results.find((result): result is PromiseFulfilledResult<GitCommitResult> => result.status === 'fulfilled');
		if (match) {
			return match.value;
		}
		throw new AggregateError(
			results.map(result => result.status === 'rejected' ? result.reason : undefined).filter(error => error !== undefined),
			`Commit ${target.sha} was not found in the open Git repositories.`,
		);
	}

	#getGitApi(): Promise<GitApi | undefined> {
		this.#gitApi ??= (async () => {
			const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
			const git = await extension?.activate();
			if (!git?.enabled) {
				return undefined;
			}
			const api = git.getAPI(1);
			const subscriptions = vscode.Disposable.from(
				api.onDidOpenRepository(() => this.#onDidChangeRepositories.fire()),
				api.onDidCloseRepository(() => this.#onDidChangeRepositories.fire()),
			);
			if (this.#isDisposed) {
				subscriptions.dispose();
			} else {
				this.#gitApiSubscriptions = subscriptions;
			}
			return api;
		})();
		return this.#gitApi;
	}
}

interface GitCommitTarget {
	readonly repository?: string;
	readonly sha: string;
}

function parseGitCommitTarget(href: string): GitCommitTarget | undefined {
	let uri: URL;
	try {
		uri = new URL(href);
	} catch {
		return undefined;
	}
	if (uri.protocol === 'commit:') {
		const sha = uri.hostname || uri.pathname.replace(/^\/+/, '');
		return isGitCommitSha(sha) ? { sha } : undefined;
	}
	if (uri.protocol !== 'https:' && uri.protocol !== 'http:') {
		return undefined;
	}

	const segments = decodeUrlPathSegments(uri);
	if (!segments) {
		return undefined;
	}
	const commitIndex = segments.lastIndexOf('commit');
	if (commitIndex < 1 || commitIndex === segments.length - 1) {
		return undefined;
	}
	const repositorySegments = segments[commitIndex - 1] === '-'
		? segments.slice(0, commitIndex - 1)
		: segments.slice(0, commitIndex);
	if (!repositorySegments.length) {
		return undefined;
	}
	const sha = segments[commitIndex + 1];
	if (!isGitCommitSha(sha)) {
		return undefined;
	}
	return {
		repository: `${uri.hostname.toLowerCase()}/${repositorySegments.join('/').replace(/\.git$/i, '')}`,
		sha,
	};
}

function isGitCommitSha(value: string): boolean {
	return /^[0-9a-f]{4,64}$/i.test(value);
}

export function normalizeGitRemoteUrl(value: string): string | undefined {
	if (!value.includes('://')) {
		const scp = /^(?:[^@]+@)?(?<host>[^:]+):(?<path>.+)$/.exec(value);
		if (scp?.groups) {
			return normalizeGitRepository(scp.groups.host, scp.groups.path);
		}
	}

	let uri: URL;
	try {
		uri = new URL(value);
	} catch {
		return undefined;
	}
	return normalizeGitRepository(uri.hostname, uri.pathname);
}

function normalizeGitRepository(host: string, path: string): string {
	return `${host.toLowerCase()}/${path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')}`;
}

interface GitExtension {
	readonly enabled: boolean;
	getAPI(version: 1): GitApi;
}

interface GitApi {
	readonly repositories: readonly GitRepository[];
	readonly onDidOpenRepository: vscode.Event<GitRepository>;
	readonly onDidCloseRepository: vscode.Event<GitRepository>;
}

interface GitRepository {
	readonly rootUri: vscode.Uri;
	readonly state: {
		readonly remotes: readonly GitRemote[];
	};
	getCommit(ref: string): Promise<GitCommit>;
}

interface GitRemote {
	readonly fetchUrl?: string;
	readonly pushUrl?: string;
}

interface GitCommit extends GitCommitPresentationData { }

interface GitCommitResult {
	readonly repository: GitRepository;
	readonly commit: GitCommit;
}

export { buildGitCommitPresentation as getGitCommitPresentation } from './linkPresentationBuilders';
