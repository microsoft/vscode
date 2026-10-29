/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISession } from '../../sessions/common/session.js';
import { ISessionRepositoryIdentity } from './sessionRepository.js';

/** A folder on a host where a repository's work can run. */
export interface ISessionRepositoryLocation {
	readonly folderUri: URI;
	/** The sessions provider that resolves {@link folderUri}, when known. */
	readonly providerId: string | undefined;
}

/**
 * A registered place for code work, as in the GitHub app: a repository,
 * repository subfolder, or plain folder, with its sessions across every
 * checkout, environment, and client that reaches it. Persistent Projects
 * coordinate work across several of these.
 */
export interface ISessionsRepository extends ISessionRepositoryIdentity {
	/** Whether the user saved the repository, so it remains listed without sessions. */
	readonly isSaved: boolean;
	/** Earlier identities of saved records that resolved to this repository once more was known about their folders. */
	readonly aliases: readonly string[];
	/** Known locations, most recently used first. */
	readonly locations: readonly ISessionRepositoryLocation[];
	/** Number of unarchived sessions in the repository. */
	readonly sessionCount: number;
}

/** The session properties that decide its repository. */
export type ISessionRepositoryMember = Pick<ISession, 'workspace'>;

export const ISessionsRepositoriesService = createDecorator<ISessionsRepositoriesService>('sessionsRepositoriesService');

/**
 * Owns the catalogue of repositories and the repository that scopes the sessions list.
 *
 * Repositories are derived from the sessions every provider reports, so a client
 * that can see a session also sees its repository, and opening it keeps the
 * session's own provider, host, and resource. Saved repositories and the selection
 * are local presentation state: saving a repository neither shares nor provisions
 * anything.
 */
export interface ISessionsRepositoriesService {
	readonly _serviceBrand: undefined;

	/** Saved repositories in saved order, then other repositories by most recent session. */
	readonly repositories: IObservable<readonly ISessionsRepository[]>;

	/** The repository scoping the sessions list, or `undefined` for all repositories. */
	readonly selectedRepository: IObservable<ISessionsRepository | undefined>;

	/** Scopes the sessions list to a repository, or to all repositories with `undefined`. Never changes any session. */
	selectRepository(key: string | undefined): void;

	/** Whether a session belongs to a repository. */
	isSessionInRepository(session: ISessionRepositoryMember, repository: ISessionsRepository, reader?: IReader): boolean;

	/**
	 * Saves the folder as a repository. Resolves its Git checkout, so a subfolder
	 * of a checkout becomes a repository subfolder rather than a plain folder.
	 * Returns `undefined` when no sessions provider can open the folder.
	 */
	addFolder(folderUri: URI, providerId?: string): Promise<ISessionsRepository | undefined>;

	/** Saves a repository so it remains listed without sessions. */
	saveRepository(repository: ISessionsRepository): void;

	/**
	 * Starts resolving repository metadata that sessions expose lazily, so their
	 * repositories converge as it arrives. Call when repositories are about to be shown.
	 */
	resolveRepositories(): void;

	/** Forgets a saved repository. It stays listed while it has sessions. */
	removeSavedRepository(repository: ISessionsRepository): void;
}
