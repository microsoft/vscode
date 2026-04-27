/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IChatSessionFileChange, IChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';

export interface ISessionType {
	/** Unique identifier (e.g., 'copilot-cli', 'copilot-cloud', 'claude-code'). */
	readonly id: string;
	/** Display label (e.g., 'Copilot CLI', 'Cloud'). */
	readonly label: string;
	/** Icon for this session type. */
	readonly icon: ThemeIcon;
}

/** Session type ID for local Copilot CLI sessions. */
export const COPILOT_CLI_SESSION_TYPE = 'copilotcli';

/** Session type ID for Copilot Cloud sessions. */
export const COPILOT_CLOUD_SESSION_TYPE = 'copilot-cloud-agent';

/** Copilot CLI session type — local background agent running in a Git worktree. */
export const CopilotCLISessionType: ISessionType = {
	id: COPILOT_CLI_SESSION_TYPE,
	label: localize('copilotCLI', "Copilot CLI"),
	icon: Codicon.copilot,
};

/** Copilot Cloud session type - cloud-hosted agent. */
export const CopilotCloudSessionType: ISessionType = {
	id: COPILOT_CLOUD_SESSION_TYPE,
	label: localize('copilotCloud', "Cloud"),
	icon: Codicon.cloud,
};

/** Session type ID for Claude Code sessions. */
export const CLAUDE_CODE_SESSION_TYPE = 'claude-code';

/** Claude Code session type — local agent powered by Claude. */
export const ClaudeCodeSessionType: ISessionType = {
	id: CLAUDE_CODE_SESSION_TYPE,
	label: localize('claudeCode', "Claude"),
	icon: Codicon.claude,
};

/**
 * Returns whether the given session type represents a workspace-backed
 * agent (e.g. Copilot CLI, Claude Code) that operates on a worktree or
 * repository — regardless of whether the agent runs locally or remotely.
 * TODO: Somehow make this contributable so we don't have to hardcode session types here.
 */
export function isWorkspaceAgentSessionType(sessionType: string | undefined): boolean {
	return sessionType === COPILOT_CLI_SESSION_TYPE || sessionType === CLAUDE_CODE_SESSION_TYPE;
}

export const GITHUB_REMOTE_FILE_SCHEME = 'github-remote-file';

/**
 * Status of an agent session as reported by the sessions provider.
 */
export const enum SessionStatus {
	/** Session has not been sent yet (new/untitled). */
	Untitled = 0,
	/** Agent is actively working. */
	InProgress = 1,
	/** Agent is waiting for user input. */
	NeedsInput = 2,
	/** Session has completed successfully. */
	Completed = 3,
	/** Session encountered an error. */
	Error = 4,
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
	/** Current branch name. */
	readonly branchName?: string;
	/** Name of the base branch. */
	readonly baseBranchName: string | undefined;
	/** Whether the base branch is protected (drives PR vs merge workflow). */
	readonly baseBranchProtected?: boolean;
	/** Whether the repository has a github.com remote. */
	readonly hasGitHubRemote?: boolean;
	/** Upstream tracking branch name (e.g. `origin/feature`). */
	readonly upstreamBranchName?: string;
	/** Number of commits the upstream branch is ahead of the local branch. */
	readonly incomingChanges?: number;
	/** Number of commits the local branch is ahead of the upstream branch. */
	readonly outgoingChanges?: number;
	/** Number of files with uncommitted changes. */
	readonly uncommittedChanges?: number;
}

/**
 * Workspace information for a session, encapsulating one or more repositories.
 */
export interface ISessionWorkspace {
	/** Display label for the workspace (e.g., "my-app", "org/repo", "host:/path"). */
	readonly label: string;
	/** Optional description shown alongside the label (e.g., parent folder path "~/work"). */
	readonly description?: string;
	/** Optional group name for categorizing this workspace in pickers (e.g., "Copilot Chat", "Local"). */
	readonly group?: string;
	/** Icon for the workspace. */
	readonly icon: ThemeIcon;
	/** Repositories in this workspace. */
	readonly repositories: ISessionRepository[];
	/** Whether the session requires workspace trust to operate. */
	readonly requiresWorkspaceTrust: boolean;
}

/**
 * GitHub information associated with a session.
 */
export interface IGitHubInfo {
	/** GitHub repository owner. */
	readonly owner: string;
	/** GitHub repository name. */
	readonly repo: string;
	/** Pull request associated with this session, if any. */
	readonly pullRequest?: {
		/** Pull request number. */
		readonly number: number;
		/** URI of the pull request. */
		readonly uri: URI;
		/** Icon reflecting the PR state. */
		readonly icon?: ThemeIcon;
	};
}

export type ISessionFileChange = IChatSessionFileChange | IChatSessionFileChange2;

/**
 * A single chat within a session, produced by the sessions management layer.
 */
export interface IChat {
	/** Resource URI identifying this chat. */
	readonly resource: URI;
	/** When the chat was created. */
	readonly createdAt: Date;

	// Reactive properties

	/** Chat display title (changes when auto-titled or renamed). */
	readonly title: IObservable<string>;
	/** When the chat was last updated. */
	readonly updatedAt: IObservable<Date>;
	/** Current chat status. */
	readonly status: IObservable<SessionStatus>;
	/** File changes produced by the chat. */
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	/** Currently selected model identifier. */
	readonly modelId: IObservable<string | undefined>;
	/** Currently selected mode identifier and kind. */
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined>;
	/** Whether the chat is archived. */
	readonly isArchived: IObservable<boolean>;
	/** Whether the chat has been read. */
	readonly isRead: IObservable<boolean>;
	/** Status description shown while the chat is active (e.g., current agent action). */
	readonly description: IObservable<IMarkdownString | undefined>;
	/** Timestamp of when the last agent turn ended, if any. */
	readonly lastTurnEnd: IObservable<Date | undefined>;
}

/**
 * A session groups one or more chats together.
 * All {@link ISessionData} fields are propagated from the primary (first) chat.
 */
export interface ISession {
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
	readonly workspace: IObservable<ISessionWorkspace | undefined>;

	// Reactive properties

	/** Session display title (changes when auto-titled or renamed). */
	readonly title: IObservable<string>;
	/** When the session was last updated. */
	readonly updatedAt: IObservable<Date>;
	/** Current session status. */
	readonly status: IObservable<SessionStatus>;
	/** File changes produced by the session. */
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	/** Currently selected model identifier. */
	readonly modelId: IObservable<string | undefined>;
	/** Currently selected mode identifier and kind. */
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined>;
	/** Whether the session is still initializing (e.g., resolving git repository). */
	readonly loading: IObservable<boolean>;
	/** Whether the session is archived. */
	readonly isArchived: IObservable<boolean>;
	/** Whether the session has been read. */
	readonly isRead: IObservable<boolean>;
	/** Status description shown while the session is active (e.g., current agent action). */
	readonly description: IObservable<IMarkdownString | undefined>;
	/** Timestamp of when the last agent turn ended, if any. */
	readonly lastTurnEnd: IObservable<Date | undefined>;
	/** GitHub information associated with this session, if any. */
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;
	/** The chats belonging to this session group. */
	readonly chats: IObservable<readonly IChat[]>;
	/** The main (first) chat of this session. */
	readonly mainChat: IChat;
	/** Capabilities of this session. */
	readonly capabilities: ISessionCapabilities;
}

/**
 * Build the canonical {@link ISession.sessionId} from a provider id and
 * session resource URI.
 *
 * This is the single source of truth for the `providerId:resourceUri`
 * string format used by every sessions provider (agent-host and
 * Copilot chat sessions). Consumers that only have a provider id and a
 * resource URI (e.g. a filesystem provider reconstructing a sessionId
 * from a synthetic URI) should call this rather than rebuilding the
 * string inline.
 */
export function toSessionId(providerId: string, resource: URI): string {
	return `${providerId}:${resource.toString()}`;
}

/**
 * Capabilities declared per session.
 * Consumers check these before surfacing session-specific features in the UI.
 */
export interface ISessionCapabilities {
	/** Whether this session supports multiple chats. */
	readonly supportsMultipleChats: boolean;
}

export interface ISessionWorkspaceBrowseAction {
	/** Display label for the browse action. */
	readonly label: string;
	/** Optional description shown alongside the label in the workspace picker. */
	readonly description?: string;
	/**
	 * Optional non-localized group key used to merge actions in the workspace picker.
	 * Actions sharing the same group key are combined into a single picker entry
	 * with a submenu. The first action's label is used as the display text for
	 * the merged entry (e.g. "Folders").
	 */
	readonly group?: string;
	/** Icon for the browse action. */
	readonly icon: ThemeIcon;
	/** The provider that owns this action. */
	readonly providerId: string;
	/** Execute the browse action and return the selected workspace, or undefined if cancelled. */
	run(): Promise<ISessionWorkspace | undefined>;
}
