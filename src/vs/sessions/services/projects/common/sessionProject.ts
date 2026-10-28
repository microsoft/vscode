/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { basename, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { getGitHubRepositoryOfRemoteFile, getGitHubRepositoryOfUrl, IGitHubRepositoryRef, ISessionFolder } from '../../sessions/common/session.js';

/** What a project is attached to. */
export const enum SessionProjectKind {
	/** A Git repository, or a directory within one. */
	Repository = 'repository',
	/** A plain folder on one host, without Git. */
	Folder = 'folder',
}

/**
 * The identity of a project, independent of the checkout, environment, and
 * client used to reach it. Two folders with the same {@link key} are locations
 * of the same project.
 */
export interface ISessionProjectIdentity {
	/**
	 * Stable comparison key:
	 * - `github:<owner>/<repo>[/<relative path>]` for github.com repositories, whichever host checks them out;
	 * - `git:<repository uri>[#<relative path>]` for other repositories, scoped to their host;
	 * - `folder:<folder uri>` for plain folders, scoped to their host.
	 */
	readonly key: string;
	readonly kind: SessionProjectKind;
	/** Display name. Includes the relative directory of a repository-subfolder project. */
	readonly label: string;
	/** The github.com repository, when known. */
	readonly gitHubRepository?: IGitHubRepositoryRef;
	/** Repository-relative directory of a subfolder project; absent for the repository root. */
	readonly relativePath?: string;
}

/** What is known about a folder when deriving its project identity. */
export interface ISessionProjectSource {
	/** The folder the work happens in. */
	readonly root: URI;
	/** Display name of the folder. */
	readonly name: string;
	/** The github.com repository of the folder, when known. */
	readonly gitHubRepository?: IGitHubRepositoryRef;
	/** The repository the folder's checkout belongs to, shared by its worktrees. Absent for a plain folder. */
	readonly repositoryUri?: URI;
	/** The root of the checkout containing {@link root}. Defaults to {@link repositoryUri}. */
	readonly checkoutRoot?: URI;
}

/** Derives the project identity of a folder. */
export function getSessionProjectIdentity(source: ISessionProjectSource): ISessionProjectIdentity {
	const checkoutRoot = source.checkoutRoot ?? source.repositoryUri;
	const relative = checkoutRoot ? relativePath(checkoutRoot, source.root) || undefined : undefined;
	const repository = source.gitHubRepository;
	if (repository) {
		// GitHub matches owner and repository names case-insensitively.
		const id = `${repository.owner.toLowerCase()}/${repository.repo.toLowerCase()}`;
		return {
			key: relative ? `github:${id}/${relative}` : `github:${id}`,
			kind: SessionProjectKind.Repository,
			label: relative ? `${repository.repo}/${relative}` : repository.repo,
			gitHubRepository: { owner: repository.owner, repo: repository.repo },
			relativePath: relative,
		};
	}
	if (source.repositoryUri) {
		const name = basename(source.repositoryUri) || source.name;
		return {
			key: relative ? `git:${source.repositoryUri.toString()}#${relative}` : `git:${source.repositoryUri.toString()}`,
			kind: SessionProjectKind.Repository,
			label: relative ? `${name}/${relative}` : name,
			relativePath: relative,
		};
	}
	return {
		key: `folder:${source.root.toString()}`,
		kind: SessionProjectKind.Folder,
		label: source.name,
	};
}

/**
 * Derives the project identity of a session folder, tracking its hydrating
 * repository information when a reader is given.
 */
export function getSessionFolderProjectIdentity(folder: ISessionFolder, reader?: IReader): ISessionProjectIdentity {
	const git = folder.gitRepository;
	const gitHubInfo = git?.gitHubInfo.read(reader);
	const gitHubRepository = getGitHubRepositoryOfRemoteFile(folder.root)
		?? (gitHubInfo ? { owner: gitHubInfo.owner, repo: gitHubInfo.repo } : undefined)
		?? getGitHubRepositoryOfUrl(folder.root);
	return getSessionProjectIdentity({
		root: folder.root,
		name: folder.name,
		gitHubRepository,
		repositoryUri: git?.uri,
		checkoutRoot: git ? git.workTreeUri ?? git.uri : undefined,
	});
}
