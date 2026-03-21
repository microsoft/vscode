/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatSessionFileChange } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';

/**
 * Status of an agent session as reported by the sessions provider.
 */
export const enum SessionStatus {
	Active = 0,
	Completed = 1,
	Error = 2,
}

/**
 * A repository within a session workspace.
 */
export interface ISessionRepository {
	/** The source repository URI. */
	readonly uri: URI;
	/** The working directory URI (e.g., a git worktree or checkout path). */
	readonly workingDirectory: URI | undefined;
	/** Provider-chosen display detail (e.g., branch name, host name). */
	readonly detail: string | undefined;
	/** Whether the base branch is protected (drives PR vs merge workflow). */
	readonly baseBranchProtected: boolean | undefined;
}

/**
 * Workspace information for a session, encapsulating one or more repositories.
 */
export interface ISessionWorkspace {
	/** Display label for the workspace (e.g., "my-app", "org/repo", "host:/path"). */
	readonly label: string;
	/** Icon for the workspace. */
	readonly icon: ThemeIcon;
	/** Repositories in this workspace. */
	readonly repositories: ISessionRepository[];
}

/**
 * The common session interface exposed by sessions providers.
 * Self-contained facade — components should not reach back to underlying
 * services to resolve additional data.
 */
export interface ISessionData {
	/** Globally unique session ID (`providerId:localId`). */
	readonly sessionId: string;
	/** Resource URI identifying this session. */
	readonly resource: URI;
	/** ID of the provider that owns this session. */
	readonly providerId: string;
	/** Session type ID (e.g., 'copilot-cli', 'copilot-cloud'). */
	readonly sessionType: string;
	/** Icon for this session. */
	readonly icon: ThemeIcon;
	/** When the session was created. */
	readonly createdAt: Date;
	/** Workspace this session operates on. */
	readonly workspace: ISessionWorkspace | undefined;

	// ── Reactive properties ──

	/** Session display title (changes when auto-titled or renamed). */
	readonly title: IObservable<string>;
	/** When the session was last updated. */
	readonly updatedAt: IObservable<Date>;
	/** Current session status. */
	readonly status: IObservable<SessionStatus>;
	/** File changes produced by the session. */
	readonly changes: IObservable<readonly IChatSessionFileChange[]>;
}
