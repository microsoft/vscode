/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IObservable, IReader } from '../../../../base/common/observable.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISession } from '../../sessions/common/session.js';

/** A repository that belongs to a project, and a folder its sessions can start in. */
export interface ISessionsProjectRepository {
	/** The repository identity key; see `ISessionRepositoryIdentity.key`. */
	readonly key: string;
	readonly label: string;
	readonly folderUri?: URI;
	readonly providerId?: string;
}

/**
 * A persistent Project, as in the GitHub app: a coordinator conversation that
 * keeps shared context for a body of work and starts focused sessions in the
 * project's repositories. The project groups its coordinator and the sessions it
 * started; it never moves, shares, or provisions them.
 */
export interface ISessionsProject {
	readonly id: string;
	readonly name: string;
	readonly repositories: readonly ISessionsProjectRepository[];
	/** The coordinator session's resource. */
	readonly coordinator: URI;
	readonly createdAt: number;
}

export interface ICreateSessionsProjectOptions {
	readonly name: string;
	readonly repositories: readonly ISessionsProjectRepository[];
	/** What the project should work on first. Sent to the coordinator after the project brief. */
	readonly firstMessage: string;
}

export const ISessionsProjectsService = createDecorator<ISessionsProjectsService>('sessionsProjectsService');

/**
 * Owns persistent Projects and the project that scopes the sessions list.
 * Project records are local to this machine; their sessions keep their own
 * provider, host, and resource.
 */
export interface ISessionsProjectsService {
	readonly _serviceBrand: undefined;

	/** Projects, most recently created first. */
	readonly projects: IObservable<readonly ISessionsProject[]>;

	/** The project scoping the sessions list, if any. */
	readonly selectedProject: IObservable<ISessionsProject | undefined>;

	/** Scopes the sessions list to a project, or clears the project scope with `undefined`. */
	selectProject(id: string | undefined): void;

	/**
	 * Creates a project by starting its coordinator: a workspace-less chat whose first
	 * request is the visible project brief followed by {@link ICreateSessionsProjectOptions.firstMessage}.
	 * Returns `undefined` when the coordinator could not be started.
	 */
	createProject(options: ICreateSessionsProjectOptions, token?: CancellationToken): Promise<ISessionsProject | undefined>;

	/** The project whose coordinator is this session. */
	getProjectOfCoordinator(session: Pick<ISession, 'resource'>): ISessionsProject | undefined;

	/** The project of a session: the one it coordinates, or the one whose coordinator started it, directly or through other sessions. */
	getProjectForSession(session: ISession, reader?: IReader): ISessionsProject | undefined;

	renameProject(id: string, name: string): void;

	/** Forgets a project. Its sessions remain; the coordinator becomes an ordinary chat. */
	removeProject(id: string): void;
}

/** The brief that opens a project's coordinator conversation, followed by the user's first message. */
export function buildProjectKickoff(name: string, repositories: readonly ISessionsProjectRepository[], firstMessage: string): string {
	const lines = [`You are the coordinator for the project "${name}". Keep this project's shared context in this conversation.`];
	if (repositories.length) {
		lines.push('', 'Repositories:');
		for (const repository of repositories) {
			const location = repository.folderUri ? (repository.folderUri.scheme === Schemas.file ? repository.folderUri.fsPath : repository.folderUri.toString()) : undefined;
			lines.push(location ? `- ${repository.label} (${location})` : `- ${repository.label}`);
		}
		lines.push('', 'When work belongs in one of these repositories and you can start sessions, start a focused session in that repository for it, then summarize the outcome here.');
	} else {
		lines.push('', 'This project has no repositories yet.');
	}
	lines.push('', firstMessage.trim());
	return lines.join('\n');
}
