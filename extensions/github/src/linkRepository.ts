/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure repository-resolution policy for the GitHub link builder.
 *
 * This module deliberately has **no runtime dependency on the `vscode` module**
 * so the decision of *which* repository a link is built for can be unit tested
 * in plain Node. It works against small structural types that the git
 * extension's `Repository`/`API` and a `vscode.Uri` both satisfy; the helpers
 * are generic so callers recover their concrete repository type.
 */

/** The minimal shape of a resource URI the link builder reasons about. */
export interface ILinkableResource {
	readonly path: string;
	readonly scheme: string;
}

export interface ILinkRepositoryRemote {
	readonly name?: string;
	readonly fetchUrl?: string;
	readonly pushUrl?: string;
}

export interface ILinkRepository {
	readonly rootUri: ILinkableResource;
	readonly state: { readonly remotes: readonly ILinkRepositoryRemote[] };
}

export interface ILinkGitApi<TRepository extends ILinkRepository = ILinkRepository> {
	readonly repositories: readonly TRepository[];
}

/**
 * Resource schemes the vscode.dev / GitHub link builder can resolve to a file
 * in a repository. These are the real (local/remote) file resources.
 *
 * Virtual editor resources — chat editors, previews, agent-host sessions and
 * the like — use their own schemes and cannot be shared as a repository file.
 * They are intentionally **not** in this list (see #341026).
 */
export const LINKABLE_FILE_SCHEMES: ReadonlySet<string> = new Set([
	'file',
	'untitled',
	'vscode-remote',
	'vscode-notebook-cell',
]);

export function isLinkableFileUri(uri: ILinkableResource | undefined): boolean {
	return !!uri && LINKABLE_FILE_SCHEMES.has(uri.scheme);
}

export function getRepositoryFromUrl(url: string): { owner: string; repo: string } | undefined {
	const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/i.exec(url)
		|| /^git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/i.exec(url);
	return match ? { owner: match[1], repo: match[2] } : undefined;
}

export function repositoryHasGitHubRemote(repository: ILinkRepository): boolean {
	return !!repository.state.remotes.find(remote => remote.fetchUrl ? getRepositoryFromUrl(remote.fetchUrl) : undefined);
}

export function isFileInRepo(repository: ILinkRepository, file: ILinkableResource): boolean {
	return file.path.toLowerCase() === repository.rootUri.path.toLowerCase() ||
		(file.path.toLowerCase().startsWith(repository.rootUri.path.toLowerCase()) &&
			file.path.substring(repository.rootUri.path.length).startsWith('/'));
}

export function getRepositoryForFile<TRepository extends ILinkRepository>(
	gitAPI: ILinkGitApi<TRepository>,
	file: ILinkableResource,
): TRepository | undefined {
	for (const repository of gitAPI.repositories) {
		if (isFileInRepo(repository, file)) {
			return repository;
		}
	}
	return undefined;
}

/**
 * Resolves the repository a GitHub / vscode.dev link is built for.
 *
 * When a file resource is provided it must itself be a linkable file that
 * belongs to a git repository; in that case that repository is used. When the
 * provided file is not linkable or is not in any repository we return
 * {@link undefined} — we deliberately do **not** fall back to the first
 * GitHub repo. Falling back would build a link against an unrelated
 * repository and run unrelated git actions (e.g. offering to publish a
 * branch) for a resource that cannot be shared (see #341026).
 *
 * The first-GitHub-repo fallback is only used for repository-level links,
 * i.e. when no file resource is provided at all.
 */
export function resolveLinkRepository<TRepository extends ILinkRepository>(
	gitAPI: ILinkGitApi<TRepository>,
	fileUri: ILinkableResource | undefined,
): TRepository | undefined {
	const githubRepository = gitAPI.repositories.find(repo => repositoryHasGitHubRemote(repo));
	if (fileUri) {
		return isLinkableFileUri(fileUri) ? getRepositoryForFile(gitAPI, fileUri) : undefined;
	}
	return githubRepository;
}
