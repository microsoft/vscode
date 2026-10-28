/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISession } from '../../sessions/common/session.js';
import { ISessionProjectIdentity } from './sessionProject.js';

/** A folder on a host where a project's work can run. */
export interface ISessionProjectLocation {
	readonly folderUri: URI;
	/** The sessions provider that resolves {@link folderUri}, when known. */
	readonly providerId: string | undefined;
}

/**
 * A durable home for related work: the sessions of one repository, repository
 * subfolder, or plain folder, across every checkout, environment, and client
 * that reaches it.
 */
export interface ISessionProject extends ISessionProjectIdentity {
	/** Whether the user saved the project, so it remains listed without sessions. */
	readonly isSaved: boolean;
	/** Earlier identities of saved records that resolved to this project once more was known about their folders. */
	readonly aliases: readonly string[];
	/** Known locations, most recently used first. */
	readonly locations: readonly ISessionProjectLocation[];
	/** Number of unarchived sessions in the project. */
	readonly sessionCount: number;
}

/** The session properties that decide its project. */
export type ISessionProjectMember = Pick<ISession, 'workspace'>;

export const ISessionsProjectsService = createDecorator<ISessionsProjectsService>('sessionsProjectsService');

/**
 * Owns the catalogue of projects and the project that scopes the sessions list.
 *
 * Projects are derived from the sessions every provider reports, so a client
 * that can see a session also sees its project, and opening it keeps the
 * session's own provider, host, and resource. Saved projects and the selection
 * are local presentation state: saving a project neither shares nor provisions
 * anything.
 */
export interface ISessionsProjectsService {
	readonly _serviceBrand: undefined;

	/** Saved projects in saved order, then other projects by most recent session. */
	readonly projects: IObservable<readonly ISessionProject[]>;

	/** The project scoping the sessions list, or `undefined` for all projects. */
	readonly selectedProject: IObservable<ISessionProject | undefined>;

	/** Scopes the sessions list to a project, or to all projects with `undefined`. Never changes any session. */
	selectProject(key: string | undefined): void;

	/** Whether a session belongs to a project. */
	isSessionInProject(session: ISessionProjectMember, project: ISessionProject, reader?: IReader): boolean;

	/**
	 * Saves the project of a folder. Resolves its repository from Git metadata,
	 * so a subfolder of a checkout becomes a repository-subfolder project.
	 * Returns `undefined` when no sessions provider can open the folder.
	 */
	addFolder(folderUri: URI, providerId?: string): Promise<ISessionProject | undefined>;

	/** Saves a project so it remains listed without sessions. */
	saveProject(project: ISessionProject): void;

	/**
	 * Starts resolving repository metadata that sessions expose lazily, so their
	 * projects converge as it arrives. Call when projects are about to be shown.
	 */
	resolveRepositories(): void;

	/** Forgets a saved project. It stays listed while it has sessions. */
	removeSavedProject(project: ISessionProject): void;
}
