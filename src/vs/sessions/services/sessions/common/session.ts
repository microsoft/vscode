/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IChatSessionFileChange, IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';

export interface ISessionType {
	/** Unique identifier (e.g., 'copilot-cli', 'copilot-cloud', 'claude-code'). */
	readonly id: string;
	/** Display label (e.g., 'Copilot CLI', 'Cloud'). */
	readonly label: string;
	/** Icon for this session type. */
	readonly icon: ThemeIcon;
	/**
	 * The workbench chat session type (contribution id) this session type maps
	 * to, when it differs from {@link id}. Agent-host providers use a bare agent
	 * provider name as {@link id} (e.g. `claude`) but register their chat session
	 * contribution and models under `agent-host-<provider>`, so they set this to
	 * bridge the two (e.g. for entitlement/model availability lookups). Defaults
	 * to {@link id} when omitted.
	 */
	readonly chatSessionType?: string;
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

export interface ISessionGitRepository {
	/** The source repository URI. */
	readonly uri: URI;
	/** The working directory URI (e.g., a git worktree or checkout path). */
	readonly workTreeUri: URI | undefined;
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
	/** Whether a Git operation is currently in progress. */
	readonly hasGitOperationInProgress?: boolean;
	/** GitHub information associated with the repository. */
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;
}

/**
 * A folder within a session workspace.
 */
export interface ISessionFolder {
	/** Canonical URI of the folder. */
	readonly root: URI;
	/** Working directory used for file operations. */
	readonly workingDirectory: URI;
	/** Display name for the folder (e.g., repository or directory basename). */
	readonly name: string;
	/** Optional description shown alongside the name (e.g., parent folder path). */
	readonly description: string | undefined;
	/** Git repository information associated with this folder. */
	readonly gitRepository?: ISessionGitRepository;
}

/**
 * Workspace information for a session, encapsulating one or more repositories.
 */
export interface ISessionWorkspace {
	/** URI identifying the workspace. */
	readonly uri: URI;
	/** Display label for the workspace (e.g., "my-app", "org/repo", "host:/path"). */
	readonly label: string;
	/** Optional description shown alongside the label (e.g., parent folder path "~/work"). */
	readonly description?: string;
	/**
	 * Optional group label for categorizing this workspace in pickers. The
	 * workspace picker uses this to bucket entries into top-level tabs
	 * (e.g. `"Local"`, `"Cloud"`, `"Remote"`). Providers contribute the
	 * label — the picker just renders whatever values are present.
	 */
	readonly group?: string;
	/** Icon for the workspace. */
	readonly icon: ThemeIcon;
	/** Folders in this session workspace. */
	readonly folders: ISessionFolder[];
	/** Whether the session requires workspace trust to operate. */
	readonly requiresWorkspaceTrust: boolean;
	/**
	 * Whether this workspace is a virtual
	 */
	readonly isVirtualWorkspace: boolean;
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
		/** Object ID of the base ref (merge target) commit. */
		readonly baseRefOid?: string;
		/** Object ID of the head ref (PR branch) commit. */
		readonly headRefOid?: string;
	};
}

export interface ISessionChangesSummary {
	readonly files: number;
	readonly additions: number;
	readonly deletions: number;
}

export type ISessionFileChange = IChatSessionFileChange | IChatSessionFileChange2;

/**
 * Well-known id of the changeset that holds the diff between a session's branch
 * and its base (e.g. `main...feature`). Shared so that consumers which always
 * want the branch diff — regardless of the changeset currently selected in the
 * Changes view — can locate it in {@link ISession.changesets} by id.
 */
export const BRANCH_CHANGES_CHANGESET_ID = 'branchChanges';

export interface ISessionChangeset {
	/** Unique identifier for the changeset. */
	readonly id: string;
	/** Display label for the changeset. */
	readonly label: string;
	/** Optional description for the changeset. */
	readonly description?: string;
	/** Optional category for the changeset. */
	readonly category?: string;
	/** Whether the changeset is enabled. */
	readonly isEnabled: IObservable<boolean>;
	/**
	 * Whether this changeset should be selected by default when the UI
	 * switches to its session. May change with session state (e.g. an
	 * archived session may default to a snapshot changeset rather than a
	 * live one). Producers should ensure at most one changeset in a
	 * session reports `true` at any time.
	 */
	readonly isDefault: IObservable<boolean>;
	/**
	 * Whether this changeset is currently loading its file changes.
	 */
	readonly isLoadingChanges: IObservable<boolean>;
	/** Observable for the file changes in this changeset. */
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	/** Observable for the operations in this changeset. */
	readonly operations: IObservable<readonly ISessionChangesetOperation[]>;
	/** Reference to the original checkpoint for this changeset. */
	readonly originalCheckpointRef: IObservable<string | undefined>;
	/** Reference to the modified checkpoint for this changeset. */
	readonly modifiedCheckpointRef: IObservable<string | undefined>;
	/**
	 * Invoke an operation declared in {@link operations}. `target` must be
	 * provided for resource-scoped operations and omitted for changeset-
	 * scoped ones — implementations are expected to validate this against
	 * the corresponding {@link ISessionChangesetOperation.scopes}.
	 */
	invokeOperation(operationId: string, target?: ISessionChangesetOperationTarget): Promise<void>;
}

export type ISessionChangesetOperationTarget =
	| { readonly kind: 'resource'; readonly resource: URI };

export const enum SessionChangesetOperationScope {
	Changeset = 'changeset',
	Resource = 'resource',
	Range = 'range',
}

/**
 * Execution status of a changeset operation.
 */
export const enum SessionChangesetOperationStatus {
	/** The operation is ready to be invoked. */
	Idle = 'idle',
	/** An invocation is currently in flight. */
	Running = 'running',
	/** The most recent invocation failed. */
	Error = 'error',
	/** The operation is currently disabled and cannot be invoked. */
	Disabled = 'disabled',
}

export interface ISessionChangesetOperation {
	/** Unique identifier for the operation. */
	readonly id: string;
	/** Display label for the operation. */
	readonly label: string;
	/** Optional description for the operation. */
	readonly description?: string;
	/** Optional icon for the operation. */
	readonly icon?: ThemeIcon;
	/** Optional group identifier, used to group related operations together. */
	readonly group?: string;
	/** The scopes to which this operation applies. */
	readonly scopes: SessionChangesetOperationScope[];
	/** Current execution status for this operation. */
	readonly status: SessionChangesetOperationStatus;
	/**
	 * Optional confirmation prompt to display before invoking the operation.
	 * When present, callers MUST show this message to the user (typically in
	 * a confirmation dialog) and only invoke the operation after the user
	 * accepts. The presence of this field also signals that the operation
	 * is destructive — callers SHOULD style the affirmative button
	 * accordingly. The message may contain `{0}` which will be substituted
	 * with the target resource's basename when applicable.
	 */
	readonly confirmation?: string | IMarkdownString;
}

/**
 * A custom agent reference used by session-level selection. Mirrors the Agent
 * Host protocol's `AgentSelection` shape but lives in the sessions layer so the
 * sessions service API does not leak the protocol type to non-Agent-Host
 * consumers.
 */
export interface ISessionAgentRef {
	/** Stable agent URI (matches the contributing customization's agent ref). */
	readonly uri: string;
	/** Agent name. */
	readonly name: string;
}

export interface IChatCheckpoints {
	/** Reference to the first checkpoint in the chat. */
	readonly firstCheckpointRef: string;
	/** Reference to the last checkpoint in the chat. */
	readonly lastCheckpointRef: string;
}

export const enum ChatOriginKind {
	Tool = 'tool',
	User = 'user',
	Fork = 'fork',
}

export interface IChatOrigin {
	readonly kind: ChatOriginKind;
}

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
	/** Checkpoints associated with the chat. */
	readonly checkpoints: IObservable<IChatCheckpoints | undefined>;
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
	/** How the chat came into existence, if provided by the backend. */
	readonly origin?: IChatOrigin;
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
	/** Session type ID (e.g., 'copilot-cli', 'copilot-cloud', 'local'). */
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
	/** Summary of file changes produced by the session. */
	readonly changesSummary?: IObservable<ISessionChangesSummary | undefined>;
	/** File changes produced by the session. */
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	/** Changesets produced by the session. */
	readonly changesets: IObservable<readonly ISessionChangeset[]>;
	/** Currently selected model identifier. */
	readonly modelId: IObservable<string | undefined>;
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
	/** The chats belonging to this session group. */
	readonly chats: IObservable<readonly IChat[]>;
	/** The main (first) chat of this session. Providers may replace it for a new session via {@link ISessionsProvider.createNewChat}. */
	readonly mainChat: IObservable<IChat>;
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
	/**
	 * Whether this session's title can be renamed. The agents-window UI
	 * (session header inline edit, sessions-list `Rename...` action) gates
	 * editing on this flag rather than on the provider id, so that rename is
	 * offered exactly where the backing provider actually supports it.
	 * Defaults to falsy (not renameable) when omitted.
	 */
	readonly supportsRename?: boolean;
	/**
	 * Whether this session can be deleted. The agents-window sessions-list
	 * `Delete...` action gates on this flag rather than on the provider id,
	 * so delete is offered exactly where the backing provider supports it.
	 * Defaults to falsy (not deletable) when omitted.
	 */
	readonly supportsDelete?: boolean;
	/**
	 * Whether the session's underlying runtime (e.g. a cloud agent host)
	 * already runs `runOptions.runOn === 'worktreeCreated'` tasks during
	 * environment provisioning. When `true`, the agents-window
	 * client-side dispatcher must NOT run those tasks itself to avoid
	 * double-execution. Defaults to `false` for sessions backed by local
	 * or remote agent hosts, where the client is the only thing that
	 * could trigger them.
	 */
	readonly runsWorktreeCreatedTasks?: boolean;
}

/**
 * Well-known workspace group labels used by the workspace picker to bucket
 * recents and browse actions into top-level tabs. Providers contribute one
 * of these (or any custom string) on each `ISessionWorkspace` and
 * `ISessionWorkspaceBrowseAction`; the picker discovers tabs from the union
 * of contributed values.
 */
export const SESSION_WORKSPACE_GROUP_LOCAL = localize('sessionWorkspaceGroup.local', "Local");
export const SESSION_WORKSPACE_GROUP_REMOTE = localize('sessionWorkspaceGroup.remote', "Remote");

export interface ISessionWorkspaceBrowseAction {
	/** Display label for the browse action. */
	readonly label: string;
	/** Optional description shown alongside the label in the workspace picker. */
	readonly description?: string;
	/**
	 * Optional group label used by the workspace picker to bucket browse
	 * actions into top-level tabs (e.g. `"Local"`, `"Cloud"`, `"Remote"`).
	 * Providers contribute the label — the picker dynamically renders tabs
	 * for whichever values are present and filters items accordingly.
	 */
	readonly group?: string;
	/** Icon for the browse action. */
	readonly icon: ThemeIcon;
	/** The provider that owns this action. */
	readonly providerId: string;
	/** Execute the browse action and return the selected workspace, or undefined if cancelled. */
	run(): Promise<ISessionWorkspace | undefined>;
	/**
	 * Optional method to enumerate folders inline (e.g. for a phone-friendly
	 * picker that shows a folder list with search-as-you-type instead of
	 * opening a separate file dialog). Implementations should respect the
	 * cancellation token so stale queries can be aborted as the user types.
	 *
	 * @param query Case-insensitive substring filter (empty string returns the default set).
	 * @param token Cancellation token; the implementation should resolve with
	 * a partial result or empty array once cancelled.
	 */
	listFolders?(query: string, token: CancellationToken): Promise<readonly ISessionWorkspace[]>;
}

/**
 * Structural equality for arrays of {@link ISessionFileChange}. Used as an
 * `equalsFn` on the `changes` observables so that providers can re-publish a
 * freshly-built array without notifying observers when the underlying file
 * changes have not actually changed.
 */
export function sessionFileChangesEqual(a: readonly ISessionFileChange[], b: readonly ISessionFileChange[]): boolean {
	if (a === b) {
		return true;
	}

	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		const x = a[i], y = b[i];
		if (x === y) {
			continue;
		}

		if (x.insertions !== y.insertions || x.deletions !== y.deletions) {
			return false;
		}

		const xIsIChatSessionFileChange2 = isIChatSessionFileChange2(x);
		const yIsIChatSessionFileChange2 = isIChatSessionFileChange2(y);
		if (xIsIChatSessionFileChange2 !== yIsIChatSessionFileChange2) {
			return false;
		}

		const xUri = xIsIChatSessionFileChange2 ? x.uri : x.modifiedUri;
		const yUri = yIsIChatSessionFileChange2 ? y.uri : y.modifiedUri;
		if (!isEqual(xUri, yUri)) {
			return false;
		}

		const xModified = xIsIChatSessionFileChange2 ? x.modifiedUri : undefined;
		const yModified = yIsIChatSessionFileChange2 ? y.modifiedUri : undefined;
		if (!isEqual(xModified, yModified)) {
			return false;
		}

		if (!isEqual(x.originalUri, y.originalUri)) {
			return false;
		}
	}

	return true;
}

/**
 * Structural equality for {@link IGitHubInfo}. Used as an `equalsFn` on the `gitHubInfo` observable
 * so that providers can re-publish updated info without notifying observers when the underlying GitHub
 * info has not actually changed.
 */
export function gitHubInfoEqual(a: IGitHubInfo | undefined, b: IGitHubInfo | undefined): boolean {
	if (a === b) {
		return true;
	}

	if (a === undefined || b === undefined) {
		return false;
	}

	const aIcon = a.pullRequest?.icon;
	const bIcon = b.pullRequest?.icon;

	return a.owner === b.owner &&
		a.repo === b.repo &&
		a.pullRequest?.number === b.pullRequest?.number &&
		isEqual(a.pullRequest?.uri, b.pullRequest?.uri) &&
		(aIcon === bIcon || (!!aIcon && !!bIcon && ThemeIcon.isEqual(aIcon, bIcon))) &&
		a.pullRequest?.baseRefOid === b.pullRequest?.baseRefOid &&
		a.pullRequest?.headRefOid === b.pullRequest?.headRefOid;
}

/**
 * Structural equality for {@link ISessionWorkspace}.
 */
export function sessionWorkspaceEqual(a: ISessionWorkspace | undefined, b: ISessionWorkspace | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b
		|| !isEqual(a.uri, b.uri)
		|| a.label !== b.label
		|| a.description !== b.description
		|| a.group !== b.group
		|| !ThemeIcon.isEqual(a.icon, b.icon)
		|| a.requiresWorkspaceTrust !== b.requiresWorkspaceTrust
		|| a.isVirtualWorkspace !== b.isVirtualWorkspace
		|| a.folders.length !== b.folders.length) {
		return false;
	}
	for (let i = 0; i < a.folders.length; i++) {
		if (!sessionFolderEqual(a.folders[i], b.folders[i])) {
			return false;
		}
	}
	return true;
}

/**
 * Structural equality for {@link ISessionFolder}.
 */
export function sessionFolderEqual(a: ISessionFolder, b: ISessionFolder): boolean {
	return isEqual(a.root, b.root)
		&& isEqual(a.workingDirectory, b.workingDirectory)
		&& a.name === b.name
		&& a.description === b.description
		&& sessionGitRepositoryEqual(a.gitRepository, b.gitRepository);
}

/**
 * Structural equality for {@link ISessionGitRepository}.
 */
export function sessionGitRepositoryEqual(a: ISessionGitRepository | undefined, b: ISessionGitRepository | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return isEqual(a.uri, b.uri)
		&& isEqual(a.workTreeUri, b.workTreeUri)
		&& a.branchName === b.branchName
		&& a.baseBranchName === b.baseBranchName
		&& a.baseBranchProtected === b.baseBranchProtected
		&& a.hasGitHubRemote === b.hasGitHubRemote
		&& a.upstreamBranchName === b.upstreamBranchName
		&& a.incomingChanges === b.incomingChanges
		&& a.outgoingChanges === b.outgoingChanges
		&& a.uncommittedChanges === b.uncommittedChanges
		&& a.hasGitOperationInProgress === b.hasGitOperationInProgress
		&& gitHubInfoEqual(a.gitHubInfo.get(), b.gitHubInfo.get());
}
