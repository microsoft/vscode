/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { Attachment, SessionOptions, SweCustomAgent } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ChatExtendedRequestHandler, ChatRequestTurn2, ChatSessionProviderOptionItem, Uri } from 'vscode';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { INativeEnvService } from '../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { getGitHubRepoInfoFromContext, IGitService, RepoContext } from '../../../platform/git/common/gitService';
import { toGitUri } from '../../../platform/git/common/utils';
import { derivePullRequestState } from '../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { IPromptsService, ParsedPromptFile } from '../../../platform/promptFiles/common/promptsService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { isUri } from '../../../util/common/types';
import { DeferredPromise, IntervalTimer, SequencerByKey } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, IReference } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { relative } from '../../../util/vs/base/common/path';
import { basename, dirname, extUri } from '../../../util/vs/base/common/resources';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { URI } from '../../../util/vs/base/common/uri';
import { EXTENSION_ID } from '../../common/constants';
import { ChatVariablesCollection, extractDebugTargetSessionIds, isPromptFile } from '../../prompt/common/chatVariablesCollection';
import { GitBranchNameGenerator } from '../../prompt/node/gitBranch';
import { IAgentSessionsWorkspace } from '../common/agentSessionsWorkspace';
import { IChatSessionMetadataStore, StoredModeInstructions } from '../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeCheckpointService } from '../common/chatSessionWorktreeCheckpointService';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { FolderRepositoryInfo, FolderRepositoryMRUEntry, IFolderRepositoryManager, IsolationMode } from '../common/folderRepositoryManager';
import { emptyWorkspaceInfo, getWorkingDirectory, isIsolationEnabled, IWorkspaceInfo } from '../common/workspaceInfo';
import { ICustomSessionTitleService } from '../copilotcli/common/customSessionTitleService';
import { IChatDelegationSummaryService } from '../copilotcli/common/delegationSummaryService';
import { getCopilotCLISessionDir } from '../copilotcli/node/cliHelpers';
import { ICopilotCLIAgents, ICopilotCLIModels, ICopilotCLISDK, isWelcomeView } from '../copilotcli/node/copilotCli';
import { CopilotCLIPromptResolver } from '../copilotcli/node/copilotcliPromptResolver';
import { builtinSlashSCommands, CopilotCLICommand, copilotCLICommands, ICopilotCLISession } from '../copilotcli/node/copilotcliSession';
import { ICopilotCLISessionItem, ICopilotCLISessionService } from '../copilotcli/node/copilotcliSessionService';
import { buildMcpServerMappings } from '../copilotcli/node/mcpHandler';
import { ICopilotCLISessionTracker } from '../copilotcli/vscode-node/copilotCLISessionTracker';
import { ICopilotCLIFolderMruService } from './copilotCLIFolderMru';
import { convertReferenceToVariable } from './copilotCLIPromptReferences';
import { ICopilotCLITerminalIntegration, TerminalOpenLocation } from './copilotCLITerminalIntegration';
import { CopilotCloudSessionsProvider } from './copilotCloudSessionsProvider';

const COPILOT_WORKTREE_PATTERN = 'copilot-worktree-';

/**
 * ODO:
 * 1. We cannot use setNewSessionFolder hence we need a way to track what is the folder we need to use when creating new sessions.
 * 2. When we invoke initializeFolderRepository we should pass the folder thats been selected by the user.
 * 3. Verify all command handlers do the exact same thing
 * 4. Remove this._currentSessionId
 * 5. Remove isWorktreeIsolationSelected and update to account for dropdown.
 * 6. Is chatSessionContext?.initialSessionOptions still valid with new API
 * 7. Validated selected MRU item
 *
 * Cases to cover:
 * 1. Hook up the dropdowns for empty workspace folders as well
 * 2. In mult-root workspace we need to display workspace/worktree dropdown along with the repo dropdown
 * 3. Temporarily lock/unlock dropdowns while creating session
 * 4. Lock dropdowns when opening an existing session
 * 5. Browse folders command in empty workspaces
 * 6. Branch dropdown should only be displayed when we select a folder/repo thats a git repo.
 *
 * Test:
 * 1. All of the above
 * 2. Forking sessions
 * 3. Steering messages
 * 4. Queued messages
 * 5. Selecting a new folder in browse folders command should end up with that folder in the dropdown.
 * 6. Delegate from CLI to Cloud
 * 7. Delegate from Local to CLI
 */

export interface ICopilotCLIChatSessionItemProvider extends IDisposable {
	refreshSession(refreshOptions: { reason: 'update'; sessionId: string } | { reason: 'delete'; sessionId: string }): Promise<void>;
}

const REPOSITORY_OPTION_ID = 'repository';
const BRANCH_OPTION_ID = 'branch';
const ISOLATION_OPTION_ID = 'isolation';
const LAST_USED_ISOLATION_OPTION_KEY = 'github.copilot.cli.lastUsedIsolationOption';
const OPEN_REPOSITORY_COMMAND_ID = 'github.copilot.cli.sessions.openRepository';
const OPEN_IN_COPILOT_CLI_COMMAND_ID = 'github.copilot.cli.openInCopilotCLI';
const MAX_MRU_ENTRIES = 10;
const CHECK_FOR_STEERING_DELAY = 100; // ms

// // When we start new sessions, we don't have the real session id, we have a temporary untitled id.
// // We also need this when we open a session and later run it.
// // When opening the session for readonly mode we store it here and when run the session we read from here instead of opening session in readonly mode again.
// const _sessionBranch: Map<string, string | undefined> = new Map();
// const _sessionIsolation: Map<string, IsolationMode | undefined> = new Map();

const _invalidCopilotCLISessionIdsWithErrorMessage = new Map<string, string>();

namespace SessionIdForCLI {
	export function getResource(sessionId: string): vscode.Uri {
		return vscode.Uri.from({
			scheme: 'copilotcli', path: `/${sessionId}`,
		});
	}

	export function parse(resource: vscode.Uri): string {
		return resource.path.slice(1);
	}

	export function isCLIResource(resource: vscode.Uri): boolean {
		return resource.scheme === 'copilotcli';
	}
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function getIssueRuntimeInfo(): { readonly platform: string; readonly vscodeInfo: string; readonly extensionVersion: string } {
	const extensionVersion = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.version;

	return {
		platform: `${process.platform}-${process.arch}`,
		vscodeInfo: `${vscode.env.appName} ${vscode.version}`,
		extensionVersion: extensionVersion ?? 'unknown'
	};
}

function getSessionLoadFailureIssueInfo(invalidSessionMessage: string): { readonly issueBody: string; readonly issueUrl: string } {
	const runtimeInfo = getIssueRuntimeInfo();
	const issueTitle = '[Copilot CLI] Failed to load chat session';
	const issueBody = `## Description\n\nFailed to load a Copilot CLI chat session.\n\n## Environment\n\n- Platform: ${runtimeInfo.platform}\n- VS Code: ${runtimeInfo.vscodeInfo}\n- Chat Extension Version: ${runtimeInfo.extensionVersion}\n\n## Error\n\n\`\`\`\n${invalidSessionMessage}\n\`\`\``;
	const issueUrl = `https://github.com/microsoft/vscode/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

	return { issueBody, issueUrl };
}

/**
 * Resolves candidate session directories for a CLI terminal, ordered by
 * terminal affinity.
 *
 * Sessions whose owning terminal matches `terminal` are returned first so the
 * link provider's file-existence probing hits the correct session-state dir
 * before unrelated ones. Unrelated sessions are still included at the tail
 * because a new session may not have registered its terminal yet (session IDs
 * arrive later via MCP?).
 */
export async function resolveSessionDirsForTerminal(
	sessionTracker: ICopilotCLISessionTracker,
	terminal: vscode.Terminal,
): Promise<Uri[]> {
	const activeIds = sessionTracker.getSessionIds();
	const matching: Uri[] = [];
	const rest: Uri[] = [];
	for (const id of activeIds) {
		const sessionTerminal = await sessionTracker.getTerminal(id);
		const dir = Uri.file(getCopilotCLISessionDir(id));
		if (sessionTerminal === terminal) {
			matching.push(dir);
		} else {
			rest.push(dir);
		}
	}
	return [...matching, ...rest];
}

function isBranchOptionFeatureEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getConfig(ConfigKey.Advanced.CLIBranchSupport);
}

function isIsolationOptionFeatureEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getConfig(ConfigKey.Advanced.CLIIsolationOption);
}


function toRepositoryOptionItem(repository: RepoContext | Uri, isDefault: boolean = false): ChatSessionProviderOptionItem {
	const repositoryUri = isUri(repository) ? repository : repository.rootUri;
	const repositoryIcon = isUri(repository) ? 'repo' : repository.kind === 'repository' ? 'repo' : 'archive';
	const repositoryName = repositoryUri.path.split('/').pop() ?? repositoryUri.toString();

	return {
		id: repositoryUri.fsPath,
		name: repositoryName,
		icon: new vscode.ThemeIcon(repositoryIcon),
		default: isDefault
	} satisfies vscode.ChatSessionProviderOptionItem;
}


function toWorkspaceFolderOptionItem(workspaceFolderUri: URI, name: string): ChatSessionProviderOptionItem {
	return {
		id: workspaceFolderUri.fsPath,
		name: name,
		icon: new vscode.ThemeIcon('folder'),
	} satisfies vscode.ChatSessionProviderOptionItem;
}

export class CopilotCLIChatSessionContentProvider extends Disposable implements vscode.ChatSessionContentProvider, ICopilotCLIChatSessionItemProvider {
	private readonly _onDidCommitChatSessionItem = this._register(new Emitter<{ original: vscode.ChatSessionItem; modified: vscode.ChatSessionItem }>());
	public readonly onDidCommitChatSessionItem: Event<{ original: vscode.ChatSessionItem; modified: vscode.ChatSessionItem }> = this._onDidCommitChatSessionItem.event;

	private readonly controller: vscode.ChatSessionItemController;
	private readonly newSessions = new ResourceMap<vscode.ChatSessionItem>();
	/**
	 * ID of the last used folder in an untitled workspace (for defaulting selection).
	 */
	private _lastUsedFolderIdInUntitledWorkspace?: { kind: 'folder' | 'repo'; uri: vscode.Uri; lastAccessed: number };
	constructor(
		@ICopilotCLISessionService private readonly sessionService: ICopilotCLISessionService,
		@IChatSessionMetadataStore private readonly chatSessionMetadataStore: IChatSessionMetadataStore,
		@IChatSessionWorktreeService private readonly copilotCLIWorktreeManagerService: IChatSessionWorktreeService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IGitService private readonly gitService: IGitService,
		@IFolderRepositoryManager private readonly folderRepositoryManager: IFolderRepositoryManager,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomSessionTitleService private readonly customSessionTitleService: ICustomSessionTitleService,
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@ICopilotCLISessionTracker private readonly sessionTracker: ICopilotCLISessionTracker,
		@ICopilotCLITerminalIntegration private readonly terminalIntegration: ICopilotCLITerminalIntegration,
		@IRunCommandExecutionService private readonly commandExecutionService: IRunCommandExecutionService,
		@IChatSessionWorkspaceFolderService private readonly workspaceFolderService: IChatSessionWorkspaceFolderService,
		@IOctoKitService private readonly octoKitService: IOctoKitService,
		@ILogService private readonly logService: ILogService,
		@IAgentSessionsWorkspace private readonly _agentSessionsWorkspace: IAgentSessionsWorkspace,
		@ICopilotCLIFolderMruService private readonly copilotCLIFolderMruService: ICopilotCLIFolderMruService,
	) {
		super();

		this._register(this.terminalIntegration);

		// Resolve session dirs for terminal links. See resolveSessionDirsForTerminal.
		this.terminalIntegration.setSessionDirResolver(terminal =>
			resolveSessionDirsForTerminal(this.sessionTracker, terminal)
		);

		let isRefreshing = false;
		const controller = this.controller = this._register(vscode.chat.createChatSessionItemController(
			'copilotcli',
			async () => {
				if (isRefreshing) {
					return;
				}
				isRefreshing = true;
				try {
					const sessions = await this.sessionService.getAllSessions(CancellationToken.None);
					const items = await Promise.all(sessions.map(async session => this.toChatSessionItem(session)));

					const count = items.length;
					void this.commandExecutionService.executeCommand('setContext', 'github.copilot.chat.cliSessionsEmpty', count === 0);

					controller.items.replace(items);
				} finally {
					isRefreshing = false;
				}
			}
		));
		controller.newChatSessionItemHandler = async (context) => {
			const sessionId = this.sessionService.createNewSessionId();
			const resource = SessionIdForCLI.getResource(sessionId);
			const session = controller.createChatSessionItem(resource, context.request.prompt ?? context.request.command ?? '');
			this.customSessionTitleService.generateSessionTitle(sessionId, context.request, CancellationToken.None)
				.then(() => {
					// Given we're done generating a title, refresh the contents of this session so that the new title is picked up.
					if (this.controller.items.get(resource)) {
						this.refreshSession({ reason: 'update', sessionId }).catch(() => { /* expected if session was deleted */ });
					}
				})
				.catch(ex => this.logService.error(ex, 'Failed to generate custom session title'));

			controller.items.add(session);
			this.newSessions.set(resource, session);
			return session;
		};
		if (this.configurationService.getConfig(ConfigKey.Advanced.CLIForkSessionsEnabled)) {
			controller.forkHandler = async (sessionResource: Uri, request: ChatRequestTurn2 | undefined, token: vscode.CancellationToken) => {
				const sessionId = SessionIdForCLI.parse(sessionResource);
				const folderInfo = await this.folderRepositoryManager.getFolderRepository(sessionId, undefined, token);
				const forkedSessionId = await this.sessionService.forkSession({ sessionId, requestId: request?.id, workspace: folderInfo }, token);
				const item = await this.sessionService.getSessionItem(forkedSessionId, token);
				if (!item) {
					throw new Error(`Failed to get session item for forked session ${forkedSessionId}`);
				}
				return this.toChatSessionItem(item);
			};
		}
		this._register(this.sessionService.onDidDeleteSession(async (e) => {
			controller.items.delete(SessionIdForCLI.getResource(e));
		}));
		this._register(this.sessionService.onDidChangeSession(async (e) => {
			const item = await this.toChatSessionItem(e);
			controller.items.add(item);
		}));
		this._register(this.sessionService.onDidCreateSession(async (e) => {
			const resource = SessionIdForCLI.getResource(e.id);
			if (controller.items.get(resource)) {
				return;
			}
			const item = await this.toChatSessionItem(e);
			controller.items.add(item);
		}));

		// Handle worktree cleanup/recreation when archive state changes
		if (controller.onDidChangeChatSessionItemState) {
			this._register(controller.onDidChangeChatSessionItemState(async (item) => {
				const sessionId = SessionIdForCLI.parse(item.resource);
				if (item.archived) {
					try {
						const result = await this.copilotCLIWorktreeManagerService.cleanupWorktreeOnArchive(sessionId);
						this.logService.trace(`[CopilotCLI] Worktree cleanup for session ${sessionId}: ${result.cleaned ? 'cleaned' : result.reason}`);
					} catch (error) {
						this.logService.error(`[CopilotCLI] Failed to cleanup worktree for archived session ${sessionId}:`, error);
					}
				} else {
					try {
						const result = await this.copilotCLIWorktreeManagerService.recreateWorktreeOnUnarchive(sessionId);
						this.logService.trace(`[CopilotCLI] Worktree recreation for session ${sessionId}: ${result.recreated ? 'recreated' : result.reason}`);
					} catch (error) {
						this.logService.error(`[CopilotCLI] Failed to recreate worktree for unarchived session ${sessionId}:`, error);
					}
				}
			}));
		}

		controller.getChatSessionInputState = async (sessionResource, context, token) => {
			const groups = sessionResource ? await this.buildExistingSessionInputStateGroups(sessionResource, token) : await this.provideChatSessionProviderOptionGroups(context.previousInputState);
			return controller.createChatSessionInputState(groups);
		};
	}

	public async refreshSession(refreshOptions: { reason: 'update'; sessionId: string } | { reason: 'delete'; sessionId: string }): Promise<void> {
		if (refreshOptions.reason === 'delete') {
			const uri = SessionIdForCLI.getResource(refreshOptions.sessionId);
			this.controller.items.delete(uri);
		} else {
			const item = await this.sessionService.getSessionItem(refreshOptions.sessionId, CancellationToken.None);
			if (item) {
				const chatSessionItem = await this.toChatSessionItem(item);
				this.controller.items.add(chatSessionItem);
			}
		}
	}

	public async provideChatSessionItems(token: vscode.CancellationToken): Promise<vscode.ChatSessionItem[]> {
		const sessions = await this.sessionService.getAllSessions(token);
		const diskSessions = await Promise.all(sessions.map(async session => this.toChatSessionItem(session)));

		const count = diskSessions.length;
		this.commandExecutionService.executeCommand('setContext', 'github.copilot.chat.cliSessionsEmpty', count === 0);

		return diskSessions;
	}

	private shouldShowBadge(): boolean {
		const repositories = this.gitService.repositories
			.filter(repository => repository.kind !== 'worktree');

		return vscode.workspace.workspaceFolders === undefined || // empty window
			vscode.workspace.isAgentSessionsWorkspace ||          // agent sessions workspace
			repositories.length > 1;                              // multiple repositories
	}

	public async toChatSessionItem(session: ICopilotCLISessionItem): Promise<vscode.ChatSessionItem> {
		const resource = SessionIdForCLI.getResource(session.id);
		const worktreeProperties = await this.copilotCLIWorktreeManagerService.getWorktreeProperties(session.id);
		const workingDirectory = worktreeProperties?.worktreePath ? vscode.Uri.file(worktreeProperties.worktreePath)
			: session.workingDirectory;

		const label = session.label;

		// Badge
		let badge: vscode.MarkdownString | undefined;
		if (this.shouldShowBadge()) {
			if (worktreeProperties?.repositoryPath) {
				// Worktree
				const repositoryPathUri = vscode.Uri.file(worktreeProperties.repositoryPath);
				const isTrusted = await vscode.workspace.isResourceTrusted(repositoryPathUri);
				const badgeIcon = isTrusted ? '$(repo)' : '$(workspace-untrusted)';

				badge = new vscode.MarkdownString(`${badgeIcon} ${basename(repositoryPathUri)}`);
				badge.supportThemeIcons = true;
			} else if (workingDirectory) {
				// Workspace
				const isTrusted = await vscode.workspace.isResourceTrusted(workingDirectory);
				const badgeIcon = isTrusted ? '$(folder)' : '$(workspace-untrusted)';

				badge = new vscode.MarkdownString(`${badgeIcon} ${basename(workingDirectory)}`);
				badge.supportThemeIcons = true;
			}
		}

		// Statistics (only returned for trusted workspace/worktree folders)
		const changes: vscode.ChatSessionChangedFile2[] = [];
		if (worktreeProperties?.repositoryPath && await vscode.workspace.isResourceTrusted(vscode.Uri.file(worktreeProperties.repositoryPath))) {
			// Worktree
			changes.push(...(await this.copilotCLIWorktreeManagerService.getWorktreeChanges(session.id) ?? []));
		} else if (workingDirectory && await vscode.workspace.isResourceTrusted(workingDirectory)) {
			// Workspace
			const workspaceChanges = await this.workspaceFolderService.getWorkspaceChanges(session.id) ?? [];
			changes.push(...workspaceChanges.map(change => new vscode.ChatSessionChangedFile2(
				vscode.Uri.file(change.filePath),
				change.originalFilePath
					? toGitUri(vscode.Uri.file(change.originalFilePath), 'HEAD')
					: undefined,
				change.modifiedFilePath
					? toGitUri(vscode.Uri.file(change.modifiedFilePath), '')
					: undefined,
				change.statistics.additions,
				change.statistics.deletions)));
		}

		// Status
		const status = session.status ?? vscode.ChatSessionStatus.Completed;

		// Metadata
		let metadata: { readonly [key: string]: unknown };

		if (worktreeProperties) {
			// Worktree
			metadata = {
				autoCommit: worktreeProperties.autoCommit !== false,
				baseCommit: worktreeProperties?.baseCommit,
				baseBranchName: worktreeProperties.version === 2
					? worktreeProperties.baseBranchName
					: undefined,
				baseBranchProtected: worktreeProperties.version === 2
					? worktreeProperties.baseBranchProtected === true
					: undefined,
				branchName: worktreeProperties?.branchName,
				isolationMode: IsolationMode.Worktree,
				repositoryPath: worktreeProperties?.repositoryPath,
				worktreePath: worktreeProperties?.worktreePath,
				pullRequestUrl: worktreeProperties.version === 2
					? worktreeProperties.pullRequestUrl
					: undefined,
				pullRequestState: worktreeProperties.version === 2
					? worktreeProperties.pullRequestState
					: undefined,
				firstCheckpointRef: worktreeProperties.version === 2
					? worktreeProperties.firstCheckpointRef
					: undefined,
				baseCheckpointRef: worktreeProperties.version === 2
					? worktreeProperties.baseCheckpointRef
					: undefined,
				lastCheckpointRef: worktreeProperties.version === 2
					? worktreeProperties.lastCheckpointRef
					: undefined
			} satisfies { readonly [key: string]: unknown };
		} else {
			// Workspace
			const sessionRequestDetails = await this.chatSessionMetadataStore.getRequestDetails(session.id);
			const repositoryProperties = await this.chatSessionMetadataStore.getRepositoryProperties(session.id);

			let lastCheckpointRef: string | undefined;
			for (let i = sessionRequestDetails.length - 1; i >= 0; i--) {
				const checkpointRef = sessionRequestDetails[i]?.checkpointRef;
				if (checkpointRef !== undefined) {
					lastCheckpointRef = checkpointRef;
					break;
				}
			}

			const firstCheckpointRef = lastCheckpointRef
				? `${lastCheckpointRef.slice(0, lastCheckpointRef.lastIndexOf('/'))}/0`
				: undefined;

			metadata = {
				isolationMode: IsolationMode.Workspace,
				repositoryPath: repositoryProperties?.repositoryPath,
				branchName: repositoryProperties?.branchName,
				baseBranchName: repositoryProperties?.baseBranchName,
				workingDirectoryPath: workingDirectory?.fsPath,
				firstCheckpointRef,
				lastCheckpointRef
			} satisfies { readonly [key: string]: unknown };
		}

		const item = this.controller.createChatSessionItem(resource, label);
		item.badge = badge;
		item.timing = session.timing;
		item.changes = changes;
		item.status = status;
		item.metadata = metadata;
		return item;
	}

	/**
	 * Detects a pull request for a session when the user opens it.
	 * If a PR is found, persists the URL and notifies the UI.
	 */
	public async detectPullRequestOnSessionOpen(sessionId: string): Promise<void> {
		try {
			const worktreeProperties = await this.copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
			if (worktreeProperties?.version !== 2
				|| worktreeProperties.pullRequestState === 'merged'
				|| !worktreeProperties.branchName
				|| !worktreeProperties.repositoryPath) {
				this.logService.debug(`[CopilotCLIChatSessionItemProvider] Skipping PR detection on session open for ${sessionId}: version=${worktreeProperties?.version}, prState=${worktreeProperties?.version === 2 ? worktreeProperties.pullRequestState : 'n/a'}, branch=${!!worktreeProperties?.branchName}, repoPath=${!!worktreeProperties?.repositoryPath}`);
				return;
			}

			this.logService.debug(`[CopilotCLIChatSessionItemProvider] Detecting PR on session open for ${sessionId}, branch=${worktreeProperties.branchName}, existingPrUrl=${worktreeProperties.pullRequestUrl ?? 'none'}`);

			const prResult = await detectPullRequestFromGitHubAPI(
				worktreeProperties.branchName,
				worktreeProperties.repositoryPath,
				this.gitService,
				this.octoKitService,
				this.logService,
			);

			if (prResult) {
				const currentProperties = await this.copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
				if (currentProperties?.version === 2
					&& (currentProperties.pullRequestUrl !== prResult.url || currentProperties.pullRequestState !== prResult.state)) {
					this.logService.debug(`[CopilotCLIChatSessionItemProvider] Updating PR metadata for ${sessionId}: url=${prResult.url}, state=${prResult.state} (was url=${currentProperties.pullRequestUrl ?? 'none'}, state=${currentProperties.pullRequestState ?? 'none'})`);
					await this.copilotCLIWorktreeManagerService.setWorktreeProperties(sessionId, {
						...currentProperties,
						pullRequestUrl: prResult.url,
						pullRequestState: prResult.state,
						changes: undefined,
					});
					await this.refreshSession({ reason: 'update', sessionId });
				} else {
					this.logService.debug(`[CopilotCLIChatSessionItemProvider] PR metadata unchanged for ${sessionId}, skipping update`);
				}
			} else {
				this.logService.debug(`[CopilotCLIChatSessionItemProvider] No PR found via GitHub API for ${sessionId}`);
			}
		} catch (error) {
			this.logService.trace(`[CopilotCLIChatSessionItemProvider] Failed to detect pull request on session open for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async provideChatSessionContent(resource: Uri, token: vscode.CancellationToken, _context?: { readonly inputState: vscode.ChatSessionInputState; readonly sessionOptions: ReadonlyArray<{ optionId: string; value: string | vscode.ChatSessionProviderOptionItem }> }): Promise<vscode.ChatSession> {
		const stopwatch = new StopWatch();
		try {
			const copilotcliSessionId = SessionIdForCLI.parse(resource);
			if (copilotcliSessionId.startsWith('untitled:') || copilotcliSessionId.startsWith('untitled-')) {
				return {
					history: [],
					requestHandler: undefined,
				};
			}
			if (this.sessionService.isNewSessionId(copilotcliSessionId)) {
				const session = this.newSessions.get(resource);
				if (!session) {
					throw new Error('Session not found');
				}
				return {
					history: [],
					requestHandler: undefined,
					title: session.label,
					activeResponseCallback: undefined,
					options: {},
				};
			} else {
				return await this.provideChatSessionContentForExistingSession(resource, token);
			}
		} finally {
			this.logService.info(`[CopilotCLIChatSessionContentProvider] provideChatSessionContent for ${resource.toString()} took ${stopwatch.elapsed()}ms`);
		}
	}

	async provideChatSessionContentForExistingSession(resource: Uri, token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		const copilotcliSessionId = SessionIdForCLI.parse(resource);

		// Fire-and-forget: detect PR when the user opens a session.
		void this.detectPullRequestOnSessionOpen(copilotcliSessionId);

		const folderRepo = await this.folderRepositoryManager.getFolderRepository(copilotcliSessionId, undefined, token);
		const [history, title] = await Promise.all([
			this.getSessionHistory(copilotcliSessionId, folderRepo, token),
			this.customSessionTitleService.getCustomSessionTitle(copilotcliSessionId),
		]);

		return {
			title,
			history,
			activeResponseCallback: undefined,
			requestHandler: undefined,
		};
	}

	private async getSessionHistory(sessionId: string, workspaceInfo: IWorkspaceInfo, token: vscode.CancellationToken) {
		try {
			_invalidCopilotCLISessionIdsWithErrorMessage.delete(sessionId);
			const history = await this.sessionService.getChatHistory({ sessionId, workspace: workspaceInfo }, token);
			return history;
		} catch (error) {
			if (!isUnknownEventTypeError(error)) {
				throw error;
			}

			const partialHistory = await this.sessionService.tryGetPartialSesionHistory(sessionId);
			if (partialHistory) {
				_invalidCopilotCLISessionIdsWithErrorMessage.set(sessionId, error.message || String(error));
				return partialHistory;
			}

			throw error;
		}
	}

	async provideChatSessionProviderOptionGroups(previousInputState: vscode.ChatSessionInputState | undefined): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const optionGroups: vscode.ChatSessionProviderOptionGroup[] = [];
		const previouslySelectedIsolationOption = previousInputState?.groups.find(g => g.id === ISOLATION_OPTION_ID)?.selected;
		if (isIsolationOptionFeatureEnabled(this.configurationService)) {
			const lastUsed = this.context.globalState.get<IsolationMode>(LAST_USED_ISOLATION_OPTION_KEY, IsolationMode.Workspace);
			const defaultSelection = lastUsed === IsolationMode.Workspace ?
				{ id: IsolationMode.Workspace, name: l10n.t('Workspace'), icon: new vscode.ThemeIcon('folder') } :
				{ id: IsolationMode.Worktree, name: l10n.t('Worktree'), icon: new vscode.ThemeIcon('worktree') };
			optionGroups.push({
				id: ISOLATION_OPTION_ID,
				name: l10n.t('Isolation'),
				description: l10n.t('Pick Isolation Mode'),
				items: [
					{ id: IsolationMode.Workspace, name: l10n.t('Workspace'), icon: new vscode.ThemeIcon('folder') },
					{ id: IsolationMode.Worktree, name: l10n.t('Worktree'), icon: new vscode.ThemeIcon('worktree') },
				],
				selected: previouslySelectedIsolationOption ?? defaultSelection
			});
		}

		// Handle repository options based on workspace type
		let defaultRepoUri = !isWelcomeView(this.workspaceService) && !this._agentSessionsWorkspace.isAgentSessionsWorkspace && this.workspaceService.getWorkspaceFolders()?.length === 1 ? this.workspaceService.getWorkspaceFolders()![0] : undefined;
		if (isWelcomeView(this.workspaceService)) {
			const commands: vscode.Command[] = [];
			const previouslySelected = previousInputState?.groups.find(g => g.id === REPOSITORY_OPTION_ID)?.selected;
			let items: vscode.ChatSessionProviderOptionItem[] = [];

			// For untitled workspaces, show last used repositories and "Open Repository..." command
			const repositories = await this.copilotCLIFolderMruService.getRecentlyUsedFolders(CancellationToken.None);
			items = folderMRUToChatProviderOptions(repositories);
			items.splice(MAX_MRU_ENTRIES); // Limit to max entries
			if (this._lastUsedFolderIdInUntitledWorkspace) {
				const folder = this._lastUsedFolderIdInUntitledWorkspace.uri;
				const isRepo = this._lastUsedFolderIdInUntitledWorkspace.kind === 'repo';
				const lastAccessed = this._lastUsedFolderIdInUntitledWorkspace.lastAccessed;
				const id = folder.fsPath;
				if (!items.find(item => item.id === id)) {
					const lastUsedEntry = folderMRUToChatProviderOptions([{
						folder,
						repository: isRepo ? folder : undefined,
						lastAccessed
					}])[0];
					items.unshift(lastUsedEntry);
				}
			}
			commands.push({
				command: OPEN_REPOSITORY_COMMAND_ID,
				title: l10n.t('Browse folders...')
			});

			optionGroups.push({
				id: REPOSITORY_OPTION_ID,
				name: l10n.t('Folder'),
				description: l10n.t('Pick Folder'),
				items,
				selected: previouslySelected,
				commands
			});
		} else {
			const repositories = this.getRepositoryOptionItems();
			if (repositories.length > 1) {
				const previouslySelected = previousInputState?.groups.find(g => g.id === REPOSITORY_OPTION_ID)?.selected ?? repositories[0];
				defaultRepoUri = previouslySelected?.id ? vscode.Uri.file(previouslySelected.id) : defaultRepoUri;
				optionGroups.push({
					id: REPOSITORY_OPTION_ID,
					name: l10n.t('Folder'),
					description: l10n.t('Pick Folder'),
					items: repositories,
					selected: previouslySelected ?? repositories[0]
				});
			} else if (repositories.length === 1) {
				defaultRepoUri = vscode.Uri.file(repositories[0].id);
			}
		}

		if ((isBranchOptionFeatureEnabled(this.configurationService))) {
			// If we have a selected branch and it belongs to this repo, then use that as the default branch selection,
			// //Else fall back to the repo's head branch, and if that doesn't exist use no default selection.
			const repo = defaultRepoUri ? await this.gitService.getRepository(defaultRepoUri) : undefined;
			const branches = repo ? await this.getBranchOptionItemsForRepository(repo.rootUri, repo.headBranchName) : [];
			const previouslySelectedBranchItem = previousInputState?.groups.find(g => g.id === BRANCH_OPTION_ID)?.selected;
			const activeBranch = repo?.headBranchName ? branches.find(branch => branch.id === repo.headBranchName) : undefined;
			const selectedBranch = previouslySelectedBranchItem?.id || activeBranch?.id;
			const selectedItem = (selectedBranch ? branches.find(branch => branch.id === selectedBranch) : undefined) ?? previouslySelectedBranchItem;
			if (branches.length > 0) {
				optionGroups.push({
					id: BRANCH_OPTION_ID,
					name: l10n.t('Branch'),
					description: l10n.t('Pick Branch'),
					items: branches,
					selected: selectedItem,
					when: `chatSessionOption.${ISOLATION_OPTION_ID} == '${IsolationMode.Worktree}'`
				});
			}
		}

		return optionGroups;
	}

	private async buildExistingSessionInputStateGroups(resource: vscode.Uri, token: vscode.CancellationToken): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const copilotcliSessionId = SessionIdForCLI.parse(resource);
		const optionGroups: vscode.ChatSessionProviderOptionGroup[] = [];
		const folderInfo = await this.folderRepositoryManager.getFolderRepository(copilotcliSessionId, undefined, token);
		const repositories = isWelcomeView(this.workspaceService) ? folderMRUToChatProviderOptions(await this.copilotCLIFolderMruService.getRecentlyUsedFolders(token)) : this.getRepositoryOptionItems();
		const folderOrRepoId = folderInfo.repository?.fsPath ?? folderInfo.folder?.fsPath;
		const existingItem = folderOrRepoId ? repositories.find(repo => repo.id === folderOrRepoId) : undefined;
		const worktreeProperties = await this.copilotCLIWorktreeManagerService.getWorktreeProperties(copilotcliSessionId);

		let repoSelected: vscode.ChatSessionProviderOptionItem;
		if (existingItem) {
			repoSelected = { ...existingItem, locked: true };
		} else if (folderInfo.repository) {
			repoSelected = { ...toRepositoryOptionItem(folderInfo.repository), locked: true };
		} else if (folderInfo.folder) {
			const folderName = this.workspaceService.getWorkspaceFolderName(folderInfo.folder) || basename(folderInfo.folder);
			repoSelected = { ...toWorkspaceFolderOptionItem(folderInfo.folder, folderName), locked: true };
		} else {
			let folderName = l10n.t('Unknown');
			if (this.workspaceService.getWorkspaceFolders().length === 1) {
				folderName = this.workspaceService.getWorkspaceFolderName(this.workspaceService.getWorkspaceFolders()[0]) || folderName;
			}
			repoSelected = { id: '', name: folderName, icon: new vscode.ThemeIcon('folder'), locked: true };
		}

		if (isIsolationOptionFeatureEnabled(this.configurationService)) {
			const isWorktree = !!worktreeProperties;
			const isolationSelected = {
				id: isWorktree ? IsolationMode.Worktree : IsolationMode.Workspace,
				name: isWorktree ? l10n.t('Worktree') : l10n.t('Workspace'),
				icon: new vscode.ThemeIcon(isWorktree ? 'worktree' : 'folder'),
				locked: true
			};
			optionGroups.push({
				id: ISOLATION_OPTION_ID,
				name: l10n.t('Isolation'),
				description: l10n.t('Pick Isolation Mode'),
				items: [
					{ id: IsolationMode.Workspace, name: l10n.t('Workspace'), icon: new vscode.ThemeIcon('folder') },
					{ id: IsolationMode.Worktree, name: l10n.t('Worktree'), icon: new vscode.ThemeIcon('worktree') },
				],
				selected: isolationSelected
			});
		}

		optionGroups.push({
			id: REPOSITORY_OPTION_ID,
			name: l10n.t('Folder'),
			description: l10n.t('Pick Folder'),
			items: [repoSelected],
			selected: repoSelected,
			commands: []
		});

		const branchName = worktreeProperties?.branchName;
		const branchSelected = branchName ? { id: branchName, name: branchName, icon: new vscode.ThemeIcon('git-branch'), locked: true } : undefined;
		optionGroups.push({
			id: BRANCH_OPTION_ID,
			name: l10n.t('Branch'),
			description: l10n.t('Pick Branch'),
			items: branchSelected ? [branchSelected] : [],
			selected: branchSelected,
			when: `chatSessionOption.${ISOLATION_OPTION_ID} == '${IsolationMode.Worktree}'`
		});

		return optionGroups;
	}


	private readonly _getBranchOptionItemsForRepositorySequencer = new SequencerByKey<string>();
	private async getBranchOptionItemsForRepository(repoUri: Uri, headBranchName: string | undefined): Promise<vscode.ChatSessionProviderOptionItem[]> {
		const key = `${repoUri.toString()}${headBranchName}`;
		return this._getBranchOptionItemsForRepositorySequencer.queue(key, async () => {

			const refs = await this.gitService.getRefs(repoUri, { sort: 'committerdate' });

			// Filter to local branches only (RefType.Head === 0)
			const localBranches = refs.filter(ref => ref.type === 0 /* RefType.Head */ && ref.name);

			// Build items with HEAD branch first
			const items: vscode.ChatSessionProviderOptionItem[] = [];
			let headItem: vscode.ChatSessionProviderOptionItem | undefined;
			let mainOrheadBranch: vscode.ChatSessionProviderOptionItem | undefined;
			for (const ref of localBranches) {
				if (!ref.name) {
					continue;
				}
				if (ref.name.includes(COPILOT_WORKTREE_PATTERN)) {
					continue;
				}
				const isHead = ref.name === headBranchName;
				const item: vscode.ChatSessionProviderOptionItem = {
					id: ref.name!,
					name: ref.name!,
					icon: new vscode.ThemeIcon('git-branch'),
					// default: isHead
				};
				if (isHead) {
					headItem = item;
				} else if (ref.name === 'main' || ref.name === 'master') {
					mainOrheadBranch = item;
				} else {
					items.push(item);
				}
			}

			if (mainOrheadBranch) {
				items.unshift(mainOrheadBranch);
			}
			if (headItem) {
				items.unshift(headItem);
			}

			return items;
		});
	}

	private getRepositoryOptionItems() {
		// Exclude worktrees from the repository list
		const repositories = this.gitService.repositories
			.filter(repository => repository.kind !== 'worktree')
			.filter(repository => {
				if (isWelcomeView(this.workspaceService)) {
					// In the welcome view, include all repositories from the MRU list
					return true;
				}
				// Only include repositories that belong to one of the workspace folders
				return this.workspaceService.getWorkspaceFolder(repository.rootUri) !== undefined;
			});

		const repoItems = repositories
			.map(repository => toRepositoryOptionItem(repository));

		// In multi-root workspaces, also include workspace folders that don't have any git repos
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length) {
			// Find workspace folders that contain git repos
			const foldersWithRepos = new Set<string>();
			for (const repo of repositories) {
				const folder = this.workspaceService.getWorkspaceFolder(repo.rootUri);
				if (folder) {
					foldersWithRepos.add(folder.fsPath);
				}
			}

			// Add workspace folders that don't have any git repos
			for (const folder of workspaceFolders) {
				if (!foldersWithRepos.has(folder.fsPath)) {
					const folderName = this.workspaceService.getWorkspaceFolderName(folder);
					repoItems.push(toWorkspaceFolderOptionItem(folder, folderName));
				}
			}
		}

		return repoItems.sort((a, b) => a.name.localeCompare(b.name));
	}
	public async trackLastUsedFolderInWelcomeView(folderUri: vscode.Uri) {
		// Update MRU tracking for untitled workspaces
		if (isWelcomeView(this.workspaceService)) {
			const repository = await this.gitService.getRepository(folderUri);
			if (repository) {
				this._lastUsedFolderIdInUntitledWorkspace = { kind: 'repo', uri: repository.rootUri, lastAccessed: Date.now() };
			} else {
				this._lastUsedFolderIdInUntitledWorkspace = { kind: 'folder', uri: folderUri, lastAccessed: Date.now() };
			}
		}
	}
}

export class CopilotCLIChatSessionParticipant extends Disposable {

	constructor(
		private readonly contentProvider: CopilotCLIChatSessionContentProvider,
		private readonly promptResolver: CopilotCLIPromptResolver,
		private readonly cloudSessionProvider: CopilotCloudSessionsProvider | undefined,
		private readonly branchNameGenerator: GitBranchNameGenerator,
		@IGitService private readonly gitService: IGitService,
		@ICopilotCLIModels private readonly copilotCLIModels: ICopilotCLIModels,
		@ICopilotCLIAgents private readonly copilotCLIAgents: ICopilotCLIAgents,
		@ICopilotCLISessionService private readonly sessionService: ICopilotCLISessionService,
		@IChatSessionWorktreeService private readonly copilotCLIWorktreeManagerService: IChatSessionWorktreeService,
		@IChatSessionWorktreeCheckpointService private readonly copilotCLIWorktreeCheckpointService: IChatSessionWorktreeCheckpointService,
		@IChatSessionWorkspaceFolderService private readonly workspaceFolderService: IChatSessionWorkspaceFolderService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IChatDelegationSummaryService private readonly chatDelegationSummaryService: IChatDelegationSummaryService,
		@IFolderRepositoryManager private readonly folderRepositoryManager: IFolderRepositoryManager,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICopilotCLISDK private readonly copilotCLISDK: ICopilotCLISDK,
		@IChatSessionMetadataStore private readonly chatSessionMetadataStore: IChatSessionMetadataStore,
		@IOctoKitService private readonly octoKitService: IOctoKitService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super();
	}

	createHandler(): ChatExtendedRequestHandler {
		return this.handleRequest.bind(this);
	}

	private readonly contextForRequest = new Map<string, { prompt: string; attachments: Attachment[] }>();

	/**
	 * Tracks in-flight requests per session so we can coordinate worktree
	 * commit / PR handling and cleanup.
	 *
	 * We generally cannot have parallel requests for the same session, but when
	 * steering is involved there can be multiple requests in flight for a
	 * single session (the original request continues running while steering
	 * requests are processed). This map records all active requests for each
	 * session so that any worktree-related actions are deferred until the last
	 * in-flight request for that session has completed.
	 */
	private readonly pendingRequestBySession = new Map<string, Set<vscode.ChatRequest>>();

	/**
	 * Outer request handler that supports *yielding* for session steering.
	 *
	 * ## How steering works end-to-end
	 *
	 * 1. The user sends a message while the session is already processing a
	 *    previous request (status is `InProgress` or `NeedsInput`).
	 * 2. VS Code signals this by setting `context.yieldRequested = true` on the
	 *    *previous* request's context object.
	 * 3. This handler polls `context.yieldRequested` every 100 ms. Once detected
	 *    the outer `Promise.race` resolves, returning control to VS Code so it
	 *    can dispatch the new (steering) request.
	 * 4. Crucially, the inner `handleRequestImpl` promise is **not** cancelled
	 *    or disposed – the original SDK session continues running in the
	 *    background.
	 * 5. When the new request arrives, `handleRequest` on the underlying
	 *    {@link CopilotCLISession} detects the session is still busy and routes
	 *    through `_handleRequestSteering`, which sends the new prompt with
	 *    `mode: 'immediate'` and waits for both the steering send and the
	 *    original request to complete.
	 */
	private async handleRequest(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<vscode.ChatResult | void> {
		const disposables = new DisposableStore();
		try {
			const handled = this.handleRequestImpl(request, context, stream, token);
			const interval = disposables.add(new IntervalTimer());
			const yielded = new DeferredPromise<void>();
			interval.cancelAndSet(() => {
				if (context.yieldRequested) {
					yielded.complete();
				}
			}, CHECK_FOR_STEERING_DELAY);

			return await Promise.race([yielded.p, handled]);
		} finally {
			disposables.dispose();
		}
	}

	private sendTelemetryForHandleRequest(request: vscode.ChatRequest, context: vscode.ChatContext): void {
		const { chatSessionContext } = context;
		const hasChatSessionItem = String(!!chatSessionContext?.chatSessionItem);
		const sessionId = chatSessionContext ? SessionIdForCLI.parse(chatSessionContext.chatSessionItem.resource) : undefined;
		const isUntitled = sessionId ? String(this.sessionService.isNewSessionId(sessionId)) : 'false';
		const hasDelegatePrompt = String(request.command === 'delegate');

		/* __GDPR__
		"copilotcli.chat.invoke" : {
			"owner": "joshspicer",
			"comment": "Event sent when a CopilotCLI chat request is made.",
			"chatRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The unique chat request ID." },
			"hasChatSessionItem": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Invoked with a chat session item." },
			"isUntitled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Indicates if the chat session is untitled." },
			"hasDelegatePrompt": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Indicates if the prompt is a /delegate command." }
		}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('copilotcli.chat.invoke', {
			chatRequestId: request.id,
			hasChatSessionItem,
			isUntitled,
			hasDelegatePrompt
		});
	}

	private async handleRequestImpl(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<vscode.ChatResult | void> {
		const { chatSessionContext } = context;
		const disposables = new DisposableStore();
		let sessionId: string | undefined = undefined;
		let sdkSessionId: string | undefined = undefined;
		try {
			this.sendTelemetryForHandleRequest(request, context);

			const [authInfo,] = await Promise.all([this.copilotCLISDK.getAuthInfo().catch((ex) => this.logService.error(ex, 'Authorization failed')), this.lockRepoOptionForSession(context, token)]);
			if (!authInfo) {
				this.logService.error(`Authorization failed`);
				throw new Error(vscode.l10n.t('Authorization failed. Please sign into GitHub and try again.'));
			}
			if ((authInfo.type === 'token' && !authInfo.token) && !this.configurationService.getConfig(ConfigKey.Shared.DebugOverrideProxyUrl)) {
				this.logService.error(`Authorization failed`);
				throw new Error(vscode.l10n.t('Authorization failed. Please sign into GitHub and try again.'));
			}

			if (!chatSessionContext) {
				// Delegating from another chat session
				return await this.handleDelegationFromAnotherChat(request, undefined, request.references, context, stream, authInfo, token);
			}

			const { resource } = chatSessionContext.chatSessionItem;
			const id = SessionIdForCLI.parse(resource);
			sessionId = id;
			const isNewSession = this.sessionService.isNewSessionId(id);
			const invalidSessionMessage = _invalidCopilotCLISessionIdsWithErrorMessage.get(id);
			if (invalidSessionMessage) {
				const { issueUrl } = getSessionLoadFailureIssueInfo(invalidSessionMessage);
				const warningMessage = new vscode.MarkdownString();
				warningMessage.appendMarkdown(l10n.t({
					message: "Failed loading this session. If this issue persists, please [report an issue]({issueUrl}).  \nError: ",
					args: { issueUrl },
					comment: [`{Locked=']({'}`]
				}));
				warningMessage.appendText(invalidSessionMessage);
				stream.warning(warningMessage);
				return {};
			}

			const requestTurn = new ChatRequestTurn2(request.prompt ?? '', request.command, [], '', [], [], undefined, undefined, undefined);
			const fakeContext: vscode.ChatContext = {
				history: [requestTurn],
				yieldRequested: false,
			};
			const branchNamePromise = isNewSession && request.prompt ? this.branchNameGenerator.generateBranchName(fakeContext, token) : Promise.resolve(undefined);
			const [model, agent] = await Promise.all([
				this.getModelId(request, token),
				this.getAgent(id, request, token),
			]);

			const sessionResult = await this.getOrCreateSession(request, chatSessionContext, stream, { model, agent, branchName: branchNamePromise }, disposables, token);
			const session = sessionResult.session;
			if (session) {
				disposables.add(session);
			}
			if (!session || token.isCancellationRequested) {
				// If user didn't trust, then reset the session options to make it read-write.
				if (!sessionResult.trusted) {
					await this.unlockRepoOptionForSession(context, token);
				}
				return {};
			}

			if (context.history.length === 0) {
				// Create baseline checkpoint when handling the first request
				await this.copilotCLIWorktreeCheckpointService.handleRequest(session.object.sessionId);
			}

			sdkSessionId = session.object.sessionId;
			const modeInstructions = this.createModeInstructions(request);
			this.chatSessionMetadataStore.updateRequestDetails(sessionId, [{ vscodeRequestId: request.id, agentId: agent?.name ?? '', modeInstructions }]).catch(ex => this.logService.error(ex, 'Failed to update request details'));

			// Lock the repo option with more accurate information.
			// Previously we just updated it with details of the folder.
			// If user has selected a repo, then update with repo information (right icons, etc).
			if (isNewSession) {
				void this.lockRepoOptionForSession(context, token);
				// The session has been created and initialized with workspace information,
				// No need to track the temproary workspace folders as its been persisted.
				// this.folderRepositoryManager.deleteNewSessionFolder(id);
			}
			const requestsForSession = this.pendingRequestBySession.get(session.object.sessionId) ?? new Set<vscode.ChatRequest>();
			requestsForSession.add(request);
			this.pendingRequestBySession.set(session.object.sessionId, requestsForSession);

			// Check if we have context stored for this request (created in createCLISessionAndSubmitRequest, work around)
			const contextForRequest = this.contextForRequest.get(session.object.sessionId);
			this.contextForRequest.delete(session.object.sessionId);
			if (request.command === 'delegate') {
				await this.handleDelegationToCloud(session.object, request, context, stream, token);
			} else if (contextForRequest) {
				// This is a request that was created in createCLISessionAndSubmitRequest with attachments already resolved.
				const { prompt, attachments } = contextForRequest;
				this.contextForRequest.delete(session.object.sessionId);
				await session.object.handleRequest(request, { prompt }, attachments, model, authInfo, token);
				await this.commitWorktreeChangesIfNeeded(request, session.object, token);
			} else if (request.command && !request.prompt && !isNewSession) {
				const input = (copilotCLICommands as readonly string[]).includes(request.command)
					? { command: request.command as CopilotCLICommand, prompt: '' }
					: { prompt: `/${request.command}` };
				await session.object.handleRequest(request, input, [], model, authInfo, token);
				await this.commitWorktreeChangesIfNeeded(request, session.object, token);
			} else if (request.prompt && Object.values(builtinSlashSCommands).some(command => request.prompt.startsWith(command))) {
				// Sessions app built-in slash commands
				const { prompt, attachments } = await this.promptResolver.resolvePrompt(request, undefined, [], session.object.workspace, [], token);
				await session.object.handleRequest(request, { prompt }, attachments, model, authInfo, token);
				await this.commitWorktreeChangesIfNeeded(request, session.object, token);
			} else {
				// Construct the full prompt with references to be sent to CLI.
				const { prompt, attachments } = await this.promptResolver.resolvePrompt(request, undefined, [], session.object.workspace, [], token);
				const input = (request.command && (copilotCLICommands as readonly string[]).includes(request.command))
					? { command: request.command as CopilotCLICommand, prompt }
					: { prompt: prompt };
				await session.object.handleRequest(request, input, attachments, model, authInfo, token);
				await this.commitWorktreeChangesIfNeeded(request, session.object, token);
			}

			// No need to delay handling the request, we can refresh in background.
			this.contentProvider.refreshSession({ reason: 'update', sessionId: session.object.sessionId }).catch(error => this.logService.error(error, 'Failed to refresh session item after handling request'));
			return {};
		} catch (ex) {
			if (isCancellationError(ex)) {
				return {};
			}
			throw ex;
		}
		finally {
			if (sdkSessionId) {
				const requestsForSession = this.pendingRequestBySession.get(sdkSessionId);
				if (requestsForSession) {
					requestsForSession.delete(request);
					if (requestsForSession.size === 0) {
						this.pendingRequestBySession.delete(sdkSessionId);
					}
				}
			}
			disposables.dispose();
		}
	}

	private async lockRepoOptionForSession(context: vscode.ChatContext, token: vscode.CancellationToken) {
		// const { chatSessionContext } = context;
		// if (!chatSessionContext?.chatSessionItem?.resource) {
		// 	return;
		// }
		// const { resource } = chatSessionContext.chatSessionItem;
		// const id = SessionIdForCLI.parse(resource);
		// if (!this.sessionService.isNewSessionId(id)) {
		// 	return;
		// }
		// const folderInfo = await this.folderRepositoryManager.getFolderRepository(id, undefined, token);
		// if (folderInfo.folder) {
		// 	const folderName = basename(folderInfo.folder);
		// 	const option = folderInfo.repository ? toRepositoryOptionItem(folderInfo.repository) : toWorkspaceFolderOptionItem(folderInfo.folder, folderName);
		// 	const changes: { optionId: string; value: string | vscode.ChatSessionProviderOptionItem }[] = [
		// 		{ optionId: REPOSITORY_OPTION_ID, value: { ...option, locked: true } }
		// 	];
		// 	// Also lock the branch option
		// 	const selectedBranch = folderInfo.worktreeProperties?.branchName ?? _sessionBranch.get(id);
		// 	if (selectedBranch && isBranchOptionFeatureEnabled(this.configurationService)) {
		// 		changes.push({
		// 			optionId: BRANCH_OPTION_ID,
		// 			value: {
		// 				id: selectedBranch,
		// 				name: selectedBranch,
		// 				icon: new vscode.ThemeIcon('git-branch'),
		// 				locked: true
		// 			}
		// 		});
		// 	}
		// 	// Also lock the isolation option if set
		// 	const selectedIsolation = _sessionIsolation.get(id);
		// 	if (selectedIsolation && isIsolationOptionFeatureEnabled(this.configurationService)) {
		// 		changes.push({
		// 			optionId: ISOLATION_OPTION_ID,
		// 			value: {
		// 				id: selectedIsolation,
		// 				name: selectedIsolation === IsolationMode.Worktree
		// 					? l10n.t('Worktree')
		// 					: l10n.t('Workspace'),
		// 				icon: new vscode.ThemeIcon(selectedIsolation === IsolationMode.Worktree ? 'worktree' : 'folder'),
		// 				locked: true
		// 			}
		// 		});
		// 	}
		// 	this.contentProvider.notifySessionOptionsChange(resource, changes);
		// }
	}

	private async unlockRepoOptionForSession(context: vscode.ChatContext, token: vscode.CancellationToken) {
		// const { chatSessionContext } = context;
		// if (!chatSessionContext?.chatSessionItem?.resource) {
		// 	return;
		// }
		// const { resource } = chatSessionContext.chatSessionItem;
		// const id = SessionIdForCLI.parse(resource);
		// if (!this.sessionService.isNewSessionId(id)) {
		// 	return;
		// }
		// const folderInfo = await this.folderRepositoryManager.getFolderRepository(id, undefined, token);
		// if (folderInfo.folder) {
		// 	const option = folderInfo.repository?.fsPath ?? folderInfo.folder.fsPath;
		// 	const changes: { optionId: string; value: string }[] = [
		// 		{ optionId: REPOSITORY_OPTION_ID, value: option }
		// 	];
		// 	// Also unlock the branch option if a branch was selected
		// 	const selectedBranch = _sessionBranch.get(id);
		// 	if (selectedBranch && isBranchOptionFeatureEnabled(this.configurationService)) {
		// 		changes.push({ optionId: BRANCH_OPTION_ID, value: selectedBranch });
		// 	}
		// 	// Also unlock the isolation option if set
		// 	const selectedIsolation = _sessionIsolation.get(id);
		// 	if (selectedIsolation && isIsolationOptionFeatureEnabled(this.configurationService)) {
		// 		changes.push({ optionId: ISOLATION_OPTION_ID, value: selectedIsolation });
		// 	}
		// 	this.contentProvider.notifySessionOptionsChange(resource, changes);
		// }
	}

	private async commitWorktreeChangesIfNeeded(request: vscode.ChatRequest, session: ICopilotCLISession, token: vscode.CancellationToken): Promise<void> {
		const pendingRequests = this.pendingRequestBySession.get(session.sessionId);
		if (pendingRequests && pendingRequests.size > 1) {
			// We still have pending requests for this session, which means the user has done some steering.
			// Wait for all requests to complete, the last request to complete will handle the commit.
			pendingRequests.delete(request);
			return;
		}

		if (token.isCancellationRequested) {
			pendingRequests?.delete(request);
			return;
		}

		try {
			if (session.status === vscode.ChatSessionStatus.Completed) {
				const workingDirectory = getWorkingDirectory(session.workspace);
				if (isIsolationEnabled(session.workspace)) {
					// When isolation is enabled and we are using a git worktree, so we commit
					// all the changes in the worktree directory when the session is completed.
					// Note that if the worktree supports checkpoints, then the commit will be
					// done in the checkpoint so that users can easily see the changes made in
					// the worktree and also revert back if needed.
					await this.copilotCLIWorktreeManagerService.handleRequestCompleted(session.sessionId);
				} else if (workingDirectory) {
					// When isolation is not enabled, we are operating in the workspace directly,
					// so we stage all the changes in the workspace directory when the session is
					// completed
					await this.workspaceFolderService.handleRequestCompleted(session.sessionId);
				}

				// Create checkpoint - we create a checkpoint for the worktree changes so that users
				// can easily see the changes made in the worktree and also revert back if needed. This
				// is used if worktree isolation is enabled, and auto-commit is disabled or workspace
				// isolation is enabled.
				await this.copilotCLIWorktreeCheckpointService.handleRequestCompleted(session.sessionId, request.id);
			}

			void this.handlePullRequestCreated(session).catch(ex => this.logService.error(ex, 'Failed to handle pull request creation'));
		} finally {
			pendingRequests?.delete(request);
		}
	}

	private static readonly _PR_DETECTION_RETRY_COUNT = 5;
	private static readonly _PR_DETECTION_INITIAL_DELAY_MS = 2_000;

	private async handlePullRequestCreated(session: ICopilotCLISession): Promise<void> {
		const sessionId = session.sessionId;
		let prUrl = session.createdPullRequestUrl;
		let prState = '';

		this.logService.debug(`[CopilotCLIChatSessionParticipant] handlePullRequestCreated for ${sessionId}: createdPullRequestUrl=${prUrl ?? 'none'}`);

		const worktreeProperties = await this.copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
		if (!worktreeProperties || worktreeProperties.version !== 2) {
			return;
		}

		if (!prUrl) {
			// Only attempt retry detection if the session has v2 worktree properties
			// with branch info — v1 worktrees can't store PR URLs, and sessions
			// without worktree properties have nothing to look up.
			if (worktreeProperties.branchName && worktreeProperties.repositoryPath) {
				this.logService.debug(`[CopilotCLIChatSessionParticipant] No PR URL from session, attempting retry detection for ${sessionId}, branch=${worktreeProperties.branchName}`);
				const prResult = await this.detectPullRequestWithRetry(sessionId);
				prUrl = prResult?.url;
				prState = prResult?.state ?? prResult?.url ? 'open' : '';
			} else {
				this.logService.debug(`[CopilotCLIChatSessionParticipant] Skipping retry detection for ${sessionId}: branch=${worktreeProperties.branchName ?? 'none'}, repoPath=${!!worktreeProperties.repositoryPath}`);
			}
		}

		if (!prUrl) {
			this.logService.debug(`[CopilotCLIChatSessionParticipant] No PR detected for ${sessionId} after all attempts`);
			return;
		}

		try {
			await this.copilotCLIWorktreeManagerService.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				pullRequestUrl: prUrl,
				pullRequestState: prState,
				changes: undefined,
			});
			await this.contentProvider.refreshSession({ reason: 'update', sessionId: session.sessionId });
		} catch (error) {
			this.logService.error(error instanceof Error ? error : new Error(String(error)), `Failed to persist pull request metadata for session ${sessionId}`);
		}
	}

	/**
	 * Attempts to detect a pull request for a freshly-completed session using
	 * exponential backoff. The GitHub API may not have indexed the PR immediately
	 * after `gh pr create` returns, so we retry with increasing delays:
	 * attempt 1: 2s, attempt 2: 4s, attempt 3: 8s.
	 */
	private async detectPullRequestWithRetry(sessionId: string): Promise<{ url: string; state: string } | undefined> {
		const maxRetries = CopilotCLIChatSessionParticipant._PR_DETECTION_RETRY_COUNT;
		const initialDelay = CopilotCLIChatSessionParticipant._PR_DETECTION_INITIAL_DELAY_MS;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			const delay = initialDelay * Math.pow(2, attempt);
			this.logService.debug(`[CopilotCLIChatSessionParticipant] PR detection retry for ${sessionId}: attempt ${attempt + 1}/${maxRetries}, waiting ${delay}ms`);
			await new Promise<void>(resolve => setTimeout(resolve, delay));

			const prResult = await this.detectPullRequestForSession(sessionId);
			if (prResult) {
				this.logService.debug(`[CopilotCLIChatSessionParticipant] PR detected on attempt ${attempt + 1} for ${sessionId}: url=${prResult.url}, state=${prResult.state}`);
				return prResult;
			}
		}

		this.logService.debug(`[CopilotCLIChatSessionParticipant] PR detection exhausted all ${maxRetries} retries for ${sessionId}`);
		return undefined;
	}


	/**
	 * Queries the GitHub API to find a pull request whose head branch matches the
	 * session's worktree branch. This covers cases where the MCP tool failed to
	 * report a PR URL, or the user created the PR externally (e.g., via github.com).
	 */
	private async detectPullRequestForSession(sessionId: string): Promise<{ url: string; state: string } | undefined> {
		try {
			const worktreeProperties = await this.copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
			if (!worktreeProperties?.branchName || !worktreeProperties.repositoryPath) {
				this.logService.debug(`[CopilotCLIChatSessionParticipant] detectPullRequestForSession: missing worktree info for ${sessionId}, branch=${worktreeProperties?.branchName ?? 'none'}, repoPath=${!!worktreeProperties?.repositoryPath}`);
				return undefined;
			}

			return await detectPullRequestFromGitHubAPI(
				worktreeProperties.branchName,
				worktreeProperties.repositoryPath,
				this.gitService,
				this.octoKitService,
				this.logService,
			);
		} catch (error) {
			this.logService.debug(`[CopilotCLIChatSessionParticipant] Failed to detect pull request via GitHub API: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	/**
	 * Gets the agent to be used.
	 * If the request has a prompt file (modeInstructions2) that specifies an agent, uses that agent.
	 * If the prompt file specifies tools, those tools override the agent's default tools.
	 * Otherwise returns undefined (no agent).
	 */
	private async getAgent(sessionId: string | undefined, request: vscode.ChatRequest | undefined, token: vscode.CancellationToken): Promise<SweCustomAgent | undefined> {
		// If we have a prompt file that specifies an agent or tools, use that.
		if (request?.modeInstructions2) {
			const customAgent = request.modeInstructions2.uri ? await this.copilotCLIAgents.resolveAgent(request.modeInstructions2.uri.toString()) : await this.copilotCLIAgents.resolveAgent(request.modeInstructions2.name);
			if (customAgent) {
				const tools = (request.modeInstructions2.toolReferences || []).map(t => t.name);
				if (tools.length > 0) {
					customAgent.tools = tools;
				}
				return customAgent;
			}
		}
		// If not found, don't use any agent, default to empty agent.
		return undefined;
	}

	private async getPromptInfoFromRequest(request: vscode.ChatRequest, token: vscode.CancellationToken): Promise<ParsedPromptFile | undefined> {
		const promptFile = new ChatVariablesCollection(request.references).find(isPromptFile);
		if (!promptFile || !URI.isUri(promptFile.reference.value)) {
			return undefined;
		}
		try {
			return await this.promptsService.parseFile(promptFile.reference.value, token);
		} catch (ex) {
			this.logService.error(`Failed to parse the prompt file: ${promptFile.reference.value.toString()}`, ex);
			return undefined;
		}
	}

	private async getOrCreateSession(request: vscode.ChatRequest, chatSessionContext: vscode.ChatSessionContext, stream: vscode.ChatResponseStream, options: { model: string | undefined; agent: SweCustomAgent | undefined; branchName: Promise<string | undefined> }, disposables: DisposableStore, token: vscode.CancellationToken): Promise<{ session: IReference<ICopilotCLISession> | undefined; trusted: boolean }> {
		const { resource } = chatSessionContext.chatSessionItem;
		const sessionId = SessionIdForCLI.parse(resource);
		const isNewSession = this.sessionService.isNewSessionId(sessionId);

		const { workspaceInfo, cancelled, trusted } = await this.getOrInitializeWorkingDirectory(chatSessionContext, undefined, options.branchName, stream, request.toolInvocationToken, token);
		const workingDirectory = getWorkingDirectory(workspaceInfo);
		const worktreeProperties = workspaceInfo.worktreeProperties;
		if (cancelled || token.isCancellationRequested) {
			return { session: undefined, trusted };
		}

		const model = options.model;
		const agent = options.agent;
		const debugTargetSessionIds = extractDebugTargetSessionIds(request.references);
		const mcpServerMappings = buildMcpServerMappings(request.tools);
		const session = isNewSession ?
			await this.sessionService.createSession({ sessionId, model, workspace: workspaceInfo, agent, debugTargetSessionIds, mcpServerMappings }, token) :
			await this.sessionService.getSession({ sessionId, model, workspace: workspaceInfo, agent, debugTargetSessionIds, mcpServerMappings }, token);

		if (!session) {
			stream.warning(l10n.t('Chat session not found.'));
			return { session: undefined, trusted };
		}
		this.logService.info(`Using Copilot CLI session: ${session.object.sessionId} (isNewSession: ${isNewSession}, isolationEnabled: ${isIsolationEnabled(workspaceInfo)}, workingDirectory: ${workingDirectory}, worktreePath: ${worktreeProperties?.worktreePath})`);
		if (isNewSession) {
			this.contentProvider.refreshSession({ reason: 'update', sessionId: session.object.sessionId });
			if (worktreeProperties) {
				void this.copilotCLIWorktreeManagerService.setWorktreeProperties(session.object.sessionId, worktreeProperties);
			}
		}
		const sessionWorkingDirectory = getWorkingDirectory(session.object.workspace);
		if (sessionWorkingDirectory && !isIsolationEnabled(session.object.workspace)) {
			void this.workspaceFolderService.trackSessionWorkspaceFolder(session.object.sessionId, sessionWorkingDirectory.fsPath, session.object.workspace.repositoryProperties);
		}
		disposables.add(session.object.attachStream(stream));
		const permissionLevel = request.permissionLevel;
		session.object.setPermissionLevel(permissionLevel);

		return { session, trusted };
	}

	private async getModelId(request: vscode.ChatRequest | undefined, token: vscode.CancellationToken): Promise<string | undefined> {
		const promptFile = request ? await this.getPromptInfoFromRequest(request, token) : undefined;
		const model = promptFile?.header?.model ? await getModelFromPromptFile(promptFile.header.model, this.copilotCLIModels) : undefined;
		if (model || token.isCancellationRequested) {
			return model;
		}
		// Get model from request.
		const preferredModelInRequest = request?.model?.id ? await this.copilotCLIModels.resolveModel(request.model.id) : undefined;
		return preferredModelInRequest ?? await this.copilotCLIModels.getDefaultModel();
	}

	private async handleDelegationToCloud(session: ICopilotCLISession, request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
		if (!this.cloudSessionProvider) {
			stream.warning(l10n.t('No cloud agent available'));
			return;
		}

		// Check for uncommitted changes
		const worktreeProperties = await this.copilotCLIWorktreeManagerService.getWorktreeProperties(session.sessionId);
		const repositoryPath = worktreeProperties?.repositoryPath ? Uri.file(worktreeProperties.repositoryPath) : getWorkingDirectory(session.workspace);
		const repository = repositoryPath ? await this.gitService.getRepository(repositoryPath) : undefined;
		const hasChanges = (repository?.changes?.indexChanges && repository.changes.indexChanges.length > 0);

		if (hasChanges) {
			stream.warning(l10n.t('You have uncommitted changes in your workspace. The cloud agent will start from the last committed state. Consider committing your changes first if you want to include them.'));
		}

		const prInfo = await this.cloudSessionProvider.delegate(request, stream, context, token, { prompt: request.prompt, chatContext: context });
		await this.recordPushToSession(session, `/delegate ${request.prompt}`, prInfo);

	}

	private async getOrInitializeWorkingDirectory(
		chatSessionContext: vscode.ChatSessionContext | undefined,
		isolation: IsolationMode | undefined,
		branchName: Promise<string | undefined> | undefined,
		stream: vscode.ChatResponseStream,
		toolInvocationToken: vscode.ChatParticipantToolToken,
		token: vscode.CancellationToken
	): Promise<{
		workspaceInfo: IWorkspaceInfo;
		cancelled: boolean;
		trusted: boolean;
	}> {
		let folderInfo: FolderRepositoryInfo;
		let folder: undefined | vscode.Uri = undefined;
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 1) {
			folder = workspaceFolders[0];
		}
		if (chatSessionContext) {
			const sessionId = SessionIdForCLI.parse(chatSessionContext.chatSessionItem.resource);
			const isNewSession = this.sessionService.isNewSessionId(sessionId);

			if (isNewSession) {
				let isolation = IsolationMode.Workspace;
				let branch: string | undefined = undefined;
				for (const opt of (chatSessionContext.initialSessionOptions || [])) {
					const value = typeof opt.value === 'string' ? opt.value : opt.value.id;
					if (opt.optionId === REPOSITORY_OPTION_ID && value) {
						folder = vscode.Uri.file(value);
					} else if (opt.optionId === BRANCH_OPTION_ID && value) {
						branch = value;
					} else if (opt.optionId === ISOLATION_OPTION_ID && value) {
						isolation = value as IsolationMode;
					}
				}

				// Use FolderRepositoryManager to initialize folder/repository with worktree creation
				folderInfo = await this.folderRepositoryManager.initializeFolderRepository(sessionId, { stream, toolInvocationToken, branch, isolation, folder, newBranch: branchName }, token);
			} else {
				// Existing session - use getFolderRepository for resolution with trust check
				folderInfo = await this.folderRepositoryManager.getFolderRepository(sessionId, { promptForTrust: true, stream }, token);
			}
		} else {
			// No chat session context (e.g., delegation) - initialize with active repository
			folderInfo = await this.folderRepositoryManager.initializeFolderRepository(undefined, { stream, toolInvocationToken, isolation, folder }, token);
		}

		if (folderInfo.trusted === false || folderInfo.cancelled) {
			return { workspaceInfo: emptyWorkspaceInfo(), cancelled: true, trusted: folderInfo.trusted !== false };
		}

		const workspaceInfo = Object.assign({}, folderInfo);
		return { workspaceInfo, cancelled: false, trusted: true };
	}

	private createModeInstructions(request: vscode.ChatRequest): StoredModeInstructions | undefined {
		return request.modeInstructions2 ? {
			uri: request.modeInstructions2.uri?.toString(),
			name: request.modeInstructions2.name,
			content: request.modeInstructions2.content,
			metadata: request.modeInstructions2.metadata,
			isBuiltin: request.modeInstructions2.isBuiltin,
		} : undefined;

	}
	private async handleDelegationFromAnotherChat(
		request: vscode.ChatRequest,
		userPrompt: string | undefined,
		otherReferences: readonly vscode.ChatPromptReference[] | undefined,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		authInfo: NonNullable<SessionOptions['authInfo']>,
		token: vscode.CancellationToken
	): Promise<vscode.ChatResult> {
		let summary: string | undefined;
		const requestPromptPromise = (async () => {
			if (this.hasHistoryToSummarize(context.history)) {
				stream.progress(l10n.t('Analyzing chat history'));
				summary = await this.chatDelegationSummaryService.summarize(context, token);
				summary = summary ? `**Summary**\n${summary}` : undefined;
			}

			// Give priority to userPrompt if provided (e.g., from confirmation metadata)
			userPrompt = userPrompt || request.prompt;
			return summary ? `${userPrompt}\n${summary}` : userPrompt;
		})();

		const [{ workspaceInfo, cancelled }, model, agent] = await Promise.all([
			this.getOrInitializeWorkingDirectory(undefined, undefined, undefined, stream, request.toolInvocationToken, token),
			this.getModelId(request, token), // prefer model in request, as we're delegating from another session here.
			this.getAgent(undefined, undefined, token)
		]);

		if (cancelled || token.isCancellationRequested) {
			stream.markdown(l10n.t('Copilot CLI delegation cancelled.'));
			return {};
		}
		const workingDirectory = getWorkingDirectory(workspaceInfo);
		const worktreeProperties = workspaceInfo.worktreeProperties;
		const { prompt, attachments, references } = await this.promptResolver.resolvePrompt(request, await requestPromptPromise, (otherReferences || []).concat([]), workspaceInfo, [], token);

		const mcpServerMappings = buildMcpServerMappings(request.tools);
		const session = await this.sessionService.createSession({ workspace: workspaceInfo, agent, model, mcpServerMappings }, token);
		const modeInstructions = this.createModeInstructions(request);
		this.chatSessionMetadataStore.updateRequestDetails(session.object.sessionId, [{ vscodeRequestId: request.id, agentId: agent?.name ?? '', modeInstructions }]).catch(ex => this.logService.error(ex, 'Failed to update request details'));
		if (summary) {
			const summaryRef = await this.chatDelegationSummaryService.trackSummaryUsage(session.object.sessionId, summary);
			if (summaryRef) {
				references.push(summaryRef);
			}
		}
		// Do not await, we want this code path to be as fast as possible.
		if (worktreeProperties) {
			void this.copilotCLIWorktreeManagerService.setWorktreeProperties(session.object.sessionId, worktreeProperties);
		}
		if (workingDirectory && !isIsolationEnabled(workspaceInfo)) {
			void this.workspaceFolderService.trackSessionWorkspaceFolder(session.object.sessionId, workingDirectory.fsPath, workspaceInfo.repositoryProperties);
		}

		try {
			this.contextForRequest.set(session.object.sessionId, { prompt, attachments });
			// this.sessionItemProvider.notifySessionsChange();
			// TODO @DonJayamanne I don't think we need to refresh the list of session here just yet, or perhaps we do,
			// Same as getOrCreate session, we need a dummy title or the initial prompt to show in the sessions list.
			await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', {
				resource: SessionIdForCLI.getResource(session.object.sessionId),
				prompt: userPrompt || request.prompt,
				attachedContext: references.map(ref => convertReferenceToVariable(ref, attachments))
			});
		} catch {
			this.contextForRequest.delete(session.object.sessionId);
			session.object.handleRequest(request, { prompt }, attachments, model, authInfo, token)
				.then(() => this.commitWorktreeChangesIfNeeded(request, session.object, token))
				.catch(error => {
					this.logService.error(`Failed to handle CLI session request: ${error}`);
				})
				.finally(() => {
					session.dispose();
				});
		}

		stream.markdown(l10n.t('A Copilot CLI session has begun working on your request. Follow its progress in the sessions list.'));

		return {};
	}

	private hasHistoryToSummarize(history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[]): boolean {
		if (!history || history.length === 0) {
			return false;
		}
		const allResponsesEmpty = history.every(turn => {
			if (turn instanceof vscode.ChatResponseTurn) {
				return turn.response.length === 0;
			}
			return true;
		});
		return !allResponsesEmpty;
	}

	private async recordPushToSession(
		session: ICopilotCLISession,
		userPrompt: string,
		prInfo: vscode.ChatResponsePullRequestPart
	): Promise<void> {
		// Add user message event
		session.addUserMessage(userPrompt);

		// Add assistant message event with embedded PR metadata
		const assistantMessage = `A cloud agent has begun working on your request. Follow its progress in the associated chat and pull request.\n<pr_metadata uri="${prInfo.uri?.toString()}" title="${escapeXml(prInfo.title)}" description="${escapeXml(prInfo.description)}" author="${escapeXml(prInfo.author)}" linkTag="${escapeXml(prInfo.linkTag)}"/>`;
		session.addUserAssistantMessage(assistantMessage);
	}
}

export function registerCLIChatCommands(
	copilotCLISessionService: ICopilotCLISessionService,
	copilotCLIWorktreeManagerService: IChatSessionWorktreeService,
	gitService: IGitService,
	copilotCliWorkspaceSession: IChatSessionWorkspaceFolderService,
	contentProvider: CopilotCLIChatSessionContentProvider,
	folderRepositoryManager: IFolderRepositoryManager,
	copilotCLIFolderMruService: ICopilotCLIFolderMruService,
	envService: INativeEnvService,
	fileSystemService: IFileSystemService,
	sessionTracker: ICopilotCLISessionTracker,
	terminalIntegration: ICopilotCLITerminalIntegration,
	logService: ILogService
): IDisposable {
	const disposableStore = new DisposableStore();
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.delete', async (sessionItem?: vscode.ChatSessionItem) => {
		if (sessionItem?.resource) {
			const id = SessionIdForCLI.parse(sessionItem.resource);
			const worktree = await copilotCLIWorktreeManagerService.getWorktreeProperties(id);
			const worktreePath = await copilotCLIWorktreeManagerService.getWorktreePath(id);

			const confirmMessage = worktreePath
				? l10n.t('Are you sure you want to delete the session and its associated worktree?')
				: l10n.t('Are you sure you want to delete the session?');

			const deleteLabel = l10n.t('Delete');
			const result = await vscode.window.showWarningMessage(
				confirmMessage,
				{ modal: true },
				deleteLabel
			);

			if (result === deleteLabel) {
				await copilotCLISessionService.deleteSession(id);
				await copilotCliWorkspaceSession.deleteTrackedWorkspaceFolder(id);

				if (worktreePath) {
					try {
						const repository = worktree ? await gitService.getRepository(vscode.Uri.file(worktree.repositoryPath), true) : undefined;
						if (!repository) {
							throw new Error(l10n.t('No active repository found to delete worktree.'));
						}
						await gitService.deleteWorktree(repository.rootUri, worktreePath.fsPath);
					} catch (error) {
						vscode.window.showErrorMessage(l10n.t('Failed to delete worktree: {0}', error instanceof Error ? error.message : String(error)));
					}
				}

				await contentProvider.refreshSession({ reason: 'delete', sessionId: id });
			}
		}
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.resumeInTerminal', async (sessionItem?: vscode.ChatSessionItem) => {
		if (sessionItem?.resource) {
			const id = SessionIdForCLI.parse(sessionItem.resource);
			const existingTerminal = await sessionTracker.getTerminal(id);
			if (existingTerminal) {
				existingTerminal.show();
				return;
			}

			const terminalName = sessionItem.label || id;
			const cliArgs = ['--resume', id];
			const token = new vscode.CancellationTokenSource();
			try {
				const folderInfo = await folderRepositoryManager.getFolderRepository(id, undefined, token.token);
				const cwd = folderInfo.worktree ?? folderInfo.repository ?? folderInfo.folder;
				const terminal = await terminalIntegration.openTerminal(terminalName, cliArgs, cwd?.fsPath);
				if (terminal) {
					sessionTracker.setSessionTerminal(id, terminal);
					terminalIntegration.setTerminalSessionDir(terminal, Uri.file(getCopilotCLISessionDir(id)));
				}
			} finally {
				token.dispose();
			}
		}
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.rename', async (sessionItem?: vscode.ChatSessionItem) => {
		if (!sessionItem?.resource) {
			return;
		}
		const id = SessionIdForCLI.parse(sessionItem.resource);
		const newTitle = await vscode.window.showInputBox({
			prompt: l10n.t('New agent session title'),
			value: sessionItem.label,
			validateInput: value => {
				if (!value.trim()) {
					return l10n.t('Title cannot be empty');
				}
				return undefined;
			}
		});
		if (newTitle) {
			const trimmedTitle = newTitle.trim();
			if (trimmedTitle) {
				await copilotCLISessionService.renameSession(id, trimmedTitle);
				await contentProvider.refreshSession({ reason: 'update', sessionId: id });
			}
		}
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.setTitle', async (sessionItem?: vscode.ChatSessionItem, title?: string) => {
		if (!sessionItem?.resource || !title) {
			return;
		}
		const trimmedTitle = title.trim();
		if (trimmedTitle) {
			const id = SessionIdForCLI.parse(sessionItem.resource);
			await copilotCLISessionService.renameSession(id, trimmedTitle);
			await contentProvider.refreshSession({ reason: 'update', sessionId: id });
		}
	}));

	const createCopilotCLITerminal = async (location: TerminalOpenLocation = 'editor', name?: string, cwd?: string): Promise<void> => {
		// TODO@rebornix should be set by CLI
		const terminalName = name || process.env.COPILOTCLI_TERMINAL_TITLE || l10n.t('Copilot CLI');
		await terminalIntegration.openTerminal(terminalName, [], cwd, location);
	};

	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.newSession', async () => {
		await createCopilotCLITerminal('editor', l10n.t('Copilot CLI'));
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.newSessionToSide', async () => {
		await createCopilotCLITerminal('editorBeside', l10n.t('Copilot CLI'));
	}));
	disposableStore.add(vscode.commands.registerCommand(OPEN_IN_COPILOT_CLI_COMMAND_ID, async (sourceControlContext?: unknown) => {
		const rootUri = getSourceControlRootUri(sourceControlContext);
		await createCopilotCLITerminal('editor', l10n.t('Copilot CLI'), rootUri?.fsPath);
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.openWorktreeInNewWindow', async (sessionItem?: vscode.ChatSessionItem) => {
		if (!sessionItem?.resource) {
			return;
		}

		const id = SessionIdForCLI.parse(sessionItem.resource);
		const folderInfo = await folderRepositoryManager.getFolderRepository(id, undefined, CancellationToken.None);
		const folder = folderInfo.worktree ?? folderInfo.repository ?? folderInfo.folder;
		if (folder) {
			await vscode.commands.executeCommand('vscode.openFolder', folder, { forceNewWindow: true });
		}
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.openWorktreeInTerminal', async (sessionItem?: vscode.ChatSessionItem) => {
		if (!sessionItem?.resource) {
			return;
		}

		const id = SessionIdForCLI.parse(sessionItem.resource);
		const folderInfo = await folderRepositoryManager.getFolderRepository(id, undefined, CancellationToken.None);
		const folder = folderInfo.worktree ?? folderInfo.repository ?? folderInfo.folder;
		if (folder) {
			vscode.window.createTerminal({ cwd: folder }).show();
		}
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.copyWorktreeBranchName', async (sessionItem?: vscode.ChatSessionItem) => {
		if (!sessionItem?.resource) {
			return;
		}

		const id = SessionIdForCLI.parse(sessionItem.resource);
		const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(id);
		if (worktreeProperties?.branchName) {
			await vscode.env.clipboard.writeText(worktreeProperties.branchName);
		}
	}));
	async function selectFolder() {
		// Open folder picker dialog
		const folderUris = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: l10n.t('Open Folder...'),
		});

		return folderUris && folderUris.length > 0 ? folderUris[0] : undefined;
	}

	function getSourceControlRootUri(sourceControlContext?: unknown): vscode.Uri | undefined {
		if (!sourceControlContext) {
			return undefined;
		}

		if (Array.isArray(sourceControlContext)) {
			return getSourceControlRootUri(sourceControlContext[0]);
		}

		if (isUri(sourceControlContext)) {
			return sourceControlContext;
		}

		if (typeof sourceControlContext !== 'object') {
			return undefined;
		}

		const candidate = sourceControlContext as {
			rootUri?: unknown;
			sourceControl?: { rootUri?: unknown };
			repository?: { rootUri?: unknown };
		};

		if (isUri(candidate.rootUri)) {
			return candidate.rootUri;
		}

		if (isUri(candidate.sourceControl?.rootUri)) {
			return candidate.sourceControl.rootUri;
		}

		if (isUri(candidate.repository?.rootUri)) {
			return candidate.repository.rootUri;
		}

		return undefined;
	}

	disposableStore.add(vscode.commands.registerCommand(OPEN_REPOSITORY_COMMAND_ID, async (sessionItemResource?: vscode.Uri) => {
		if (!sessionItemResource) {
			return;
		}

		let selectedFolderUri: Uri | undefined = undefined;
		const mruItems = await copilotCLIFolderMruService.getRecentlyUsedFolders(CancellationToken.None);

		if (mruItems.length === 0) {
			selectedFolderUri = await selectFolder();
		} else {
			type RecentFolderQuickPickItem = vscode.QuickPickItem & ({ folderUri: vscode.Uri; openFolder: false } | { folderUri: undefined; openFolder: true });
			const items: RecentFolderQuickPickItem[] = mruItems
				.map(item => {
					const optionItem = item.repository
						? toRepositoryOptionItem(item.folder)
						: toWorkspaceFolderOptionItem(item.folder, basename(item.folder));

					return {
						label: optionItem.name,
						description: `~/${relative(envService.userHome.fsPath, item.folder.fsPath)}`,
						iconPath: optionItem.icon,
						folderUri: item.folder,
						openFolder: false
					};
				});

			items.unshift({
				label: l10n.t('Open Folder...'),
				iconPath: new vscode.ThemeIcon('folder-opened'),
				folderUri: undefined,
				openFolder: true
			}, {
				kind: vscode.QuickPickItemKind.Separator,
				label: '',
				folderUri: undefined,
				openFolder: true
			});

			const selectedFolder = new DeferredPromise<Uri | undefined>();
			const disposables = new DisposableStore();
			const quickPick = disposables.add(vscode.window.createQuickPick<RecentFolderQuickPickItem>());
			quickPick.items = items;
			quickPick.placeholder = l10n.t('Select a recent folder');
			quickPick.matchOnDescription = true;
			quickPick.ignoreFocusOut = true;
			quickPick.matchOnDetail = true;
			quickPick.show();
			disposables.add(quickPick.onDidHide(() => {
				selectedFolder.complete(undefined);
			}));
			disposables.add(quickPick.onDidAccept(async () => {
				if (quickPick.selectedItems.length === 0 && !quickPick.value) {
					selectedFolder.complete(undefined);
					quickPick.hide();
				} else if (quickPick.selectedItems.length && quickPick.selectedItems[0].folderUri) {
					selectedFolder.complete(quickPick.selectedItems[0].folderUri);
					quickPick.hide();
				} else if (quickPick.selectedItems.length && quickPick.selectedItems[0].openFolder) {
					selectedFolder.complete(await selectFolder());
					quickPick.hide();
				} else if (quickPick.value) {
					const fileOrFolder = vscode.Uri.file(quickPick.value);
					try {
						const stat = await vscode.workspace.fs.stat(fileOrFolder);
						let directory: Uri | undefined = undefined;
						if (stat.type & vscode.FileType.Directory) {
							quickPick.hide();
							directory = fileOrFolder;
						} else if (stat.type & vscode.FileType.File) {
							directory = dirname(fileOrFolder);
						}
						if (directory) {
							// Possible user selected a folder thats inside an existing workspace folder.
							selectedFolder.complete(vscode.workspace.getWorkspaceFolder(directory)?.uri || directory);
							quickPick.hide();
						}
					} catch {
						// ignore
					}
				}
			}));
			selectedFolderUri = await selectedFolder.p;
			disposables.dispose();
		}

		if (!selectedFolderUri) {
			return;
		}
		if (!(await checkPathExists(selectedFolderUri, fileSystemService))) {
			await copilotCLIFolderMruService.deleteRecentlyUsedFolder(selectedFolderUri);
			const message = l10n.t('The path \'{0}\' does not exist on this computer.', selectedFolderUri.fsPath);
			vscode.window.showErrorMessage(l10n.t('Path does not exist'), { modal: true, detail: message });
			return;
		}

		const sessionId = SessionIdForCLI.parse(sessionItemResource);
		if (copilotCLISessionService.isNewSessionId(sessionId)) {
			await contentProvider.trackLastUsedFolderInWelcomeView(selectedFolderUri);
		}
	}));

	const applyChanges = async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		try {
			// Apply changes
			const sessionId = SessionIdForCLI.parse(resource);
			await copilotCLIWorktreeManagerService.applyWorktreeChanges(sessionId);

			// Close the multi-file diff editor if it's open
			const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
			const worktreePath = worktreeProperties ? Uri.file(worktreeProperties.worktreePath) : undefined;

			if (worktreePath) {
				// Select the tabs to close
				const multiDiffTabToClose = vscode.window.tabGroups.all.flatMap(g => g.tabs)
					.filter(({ input }) => input instanceof vscode.TabInputTextMultiDiff && input.textDiffs.some(input =>
						extUri.isEqualOrParent(vscode.Uri.file(input.original.fsPath), worktreePath, true) ||
						extUri.isEqualOrParent(vscode.Uri.file(input.modified.fsPath), worktreePath, true)));

				if (multiDiffTabToClose.length > 0) {
					// Close the tabs
					await vscode.window.tabGroups.close(multiDiffTabToClose, true);
				}
			}

			// Pick up new git state
			await contentProvider.refreshSession({ reason: 'update', sessionId });
		} catch (error) {
			vscode.window.showErrorMessage(l10n.t('Failed to apply changes to the current workspace. Please stage or commit your changes in the current workspace and try again.'), { modal: true });
		}
	};

	disposableStore.add(vscode.commands.registerCommand('github.copilot.chat.applyCopilotCLIAgentSessionChanges', applyChanges));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.chat.applyCopilotCLIAgentSessionChanges.apply', applyChanges));

	const mergeChanges = async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri, syncWithRemote: boolean = false) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		let branchName: string | undefined;
		let worktreePath: string | undefined;
		let baseBranchName: string | undefined;
		let baseWorktreePath: string | undefined;

		try {
			const sessionId = SessionIdForCLI.parse(resource);
			const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
			if (!worktreeProperties || worktreeProperties.version !== 2) {
				vscode.window.showErrorMessage(l10n.t('Merging changes is only supported for worktree-based sessions.'));
				return;
			}

			branchName = worktreeProperties.branchName;
			worktreePath = worktreeProperties.worktreePath;
			baseBranchName = worktreeProperties.baseBranchName;
			baseWorktreePath = worktreeProperties.repositoryPath;
		} catch (error) {
			logService.error(`Failed to check worktree properties for merge changes: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		const contextValueSegments: string[] = [];
		contextValueSegments.push(`source branch name: ${branchName}`);
		contextValueSegments.push(`source worktree path: ${worktreePath}`);
		contextValueSegments.push(`target branch name: ${baseBranchName}`);
		contextValueSegments.push(`target worktree path: ${baseWorktreePath}`);

		const prompt = syncWithRemote
			? `${builtinSlashSCommands.merge} and ${builtinSlashSCommands.sync}`
			: builtinSlashSCommands.merge;

		await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', {
			resource,
			prompt,
			attachedContext: [{
				id: 'git-merge-changes',
				value: contextValueSegments.join('\n'),
				icon: new vscode.ThemeIcon('git-merge'),
				fullName: `${branchName} → ${baseBranchName}`,
				kind: 'generic'
			}]
		});
	};

	disposableStore.add(vscode.commands.registerCommand('github.copilot.chat.mergeCopilotCLIAgentSessionChanges.merge', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		await mergeChanges(sessionItemOrResource);
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.chat.mergeCopilotCLIAgentSessionChanges.mergeAndSync', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		await mergeChanges(sessionItemOrResource, true);
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.chat.updateCopilotCLIAgentSessionChanges.update', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		try {
			// Rebase worktree branch on top of base branch
			const sessionId = SessionIdForCLI.parse(resource);
			await copilotCLIWorktreeManagerService.updateWorktreeBranch(sessionId);

			// Pick up new git state
			await contentProvider.refreshSession({ reason: 'update', sessionId });
		} catch (error) {
			vscode.window.showErrorMessage(l10n.t('Failed to update worktree branch. Please resolve any conflicts and try again.'), { modal: true });
		}
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.sessions.refreshChanges', async (resource?: vscode.Uri) => {
		if (!resource) {
			return;
		}

		const sessionId = SessionIdForCLI.parse(resource);
		const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
		const workspaceFolder = await copilotCliWorkspaceSession.getSessionWorkspaceFolder(sessionId);

		if (!worktreeProperties && !workspaceFolder) {
			return;
		}

		if (worktreeProperties) {
			// Worktree
			await copilotCLIWorktreeManagerService.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				changes: undefined
			});
		} else if (workspaceFolder) {
			// Workspace
			copilotCliWorkspaceSession.clearWorkspaceChanges(sessionId);
		}

		await contentProvider.refreshSession({ reason: 'update', sessionId });
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.sessions.initializeRepository', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		const sessionId = SessionIdForCLI.parse(resource);
		const workspaceFolder = await copilotCliWorkspaceSession.getSessionWorkspaceFolder(sessionId);
		if (!workspaceFolder) {
			return;
		}

		const repository = await gitService.initRepository(workspaceFolder);
		if (!repository) {
			return;
		}

		copilotCliWorkspaceSession.trackSessionWorkspaceFolder(sessionId, workspaceFolder.fsPath, repository.headBranchName ? { repositoryPath: repository.rootUri.fsPath, branchName: repository.headBranchName } : undefined);
		copilotCliWorkspaceSession.clearWorkspaceChanges(sessionId);

		await contentProvider.refreshSession({ reason: 'update', sessionId });
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.sessions.commit', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', {
			resource,
			prompt: builtinSlashSCommands.commit,
		});
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.sessions.commitAndSync', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', {
			resource,
			prompt: `${builtinSlashSCommands.commit} and ${builtinSlashSCommands.sync}`,
		});
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.sessions.sync', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', {
			resource,
			prompt: builtinSlashSCommands.sync,
		});
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.sessions.discardChanges', async (sessionResource: vscode.Uri, ref: string, ...resources: vscode.Uri[]) => {
		if (!isUri(sessionResource) || !ref || resources.length === 0 || resources.some(r => !isUri(r))) {
			return;
		}

		const sessionId = SessionIdForCLI.parse(sessionResource);
		const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
		const workspaceFolder = await copilotCliWorkspaceSession.getSessionWorkspaceFolder(sessionId);

		const repositoryUri = worktreeProperties ? Uri.file(worktreeProperties.worktreePath) : workspaceFolder;
		const repository = repositoryUri ? await gitService.getRepository(repositoryUri) : undefined;
		if (!repository) {
			return;
		}

		const confirmAction = l10n.t('Discard Changes');
		const message = resources.length === 1
			? l10n.t('Are you sure you want to discard the changes in \'{0}\'? This action cannot be undone.', basename(resources[0]))
			: l10n.t('Are you sure you want to discard the changes in these {0} files? This action cannot be undone.', resources.length);

		const choice = await vscode.window.showWarningMessage(message, { modal: true }, confirmAction);
		if (choice !== confirmAction) {
			return;
		}

		await gitService.restore(repository.rootUri, resources.map(r => r.fsPath), { ref });
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		try {
			const sessionId = SessionIdForCLI.parse(resource);
			const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
			if (!worktreeProperties || worktreeProperties.version !== 2) {
				vscode.window.showErrorMessage(l10n.t('Creating a pull request is only supported for worktree-based sessions.'));
				return;
			}
		} catch (error) {
			logService.error(`Failed to check worktree properties for createPR: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', {
			resource,
			prompt: builtinSlashSCommands.createPr,
		});
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.chat.createDraftPullRequestCopilotCLIAgentSession.createDraftPR', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		try {
			const sessionId = SessionIdForCLI.parse(resource);
			const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
			if (!worktreeProperties || worktreeProperties.version !== 2) {
				vscode.window.showErrorMessage(l10n.t('Creating a draft pull request is only supported for worktree-based sessions.'));
				return;
			}
		} catch (error) {
			logService.error(`Failed to check worktree properties for createDraftPR: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', {
			resource,
			prompt: builtinSlashSCommands.createDraftPr,
		});
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.chat.createPullRequestCopilotCLIAgentSession.updatePR', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		let pullRequestUrl: string | undefined = undefined;

		try {
			const sessionId = SessionIdForCLI.parse(resource);
			const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
			if (!worktreeProperties || worktreeProperties.version !== 2) {
				vscode.window.showErrorMessage(l10n.t('Updating a pull request is only supported for worktree-based sessions.'));
				return;
			}

			pullRequestUrl = worktreeProperties.pullRequestUrl;
		} catch (error) {
			logService.error(`Failed to check worktree properties for updatePR: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		if (!pullRequestUrl) {
			vscode.window.showErrorMessage(l10n.t('No pull request URL found for this session.'));
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', {
			resource,
			prompt: builtinSlashSCommands.updatePr,
			attachedContext: [{
				id: 'github-pull-request',
				fullName: pullRequestUrl,
				icon: new vscode.ThemeIcon('git-pull-request'),
				value: vscode.Uri.parse(pullRequestUrl),
				kind: 'generic'
			}]
		});
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.chat.openPullRequestCopilotCLIAgentSession.openPR', async (sessionItemOrResource?: vscode.ChatSessionItem | vscode.Uri) => {
		const resource = sessionItemOrResource instanceof vscode.Uri
			? sessionItemOrResource
			: sessionItemOrResource?.resource;

		if (!resource) {
			return;
		}

		try {
			const sessionId = SessionIdForCLI.parse(resource);
			const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
			if (!worktreeProperties || worktreeProperties.version !== 2) {
				throw new Error('Open pull request is only supported for v2 worktree sessions');
			}

			if (!worktreeProperties.pullRequestUrl) {
				vscode.window.showInformationMessage(l10n.t('No pull request has been created for this session yet. Use "Create Pull Request" first.'));
				return;
			}

			await vscode.env.openExternal(vscode.Uri.parse(worktreeProperties.pullRequestUrl));
		} catch (error) {
			logService.error(`Failed to open pull request: ${error instanceof Error ? error.message : String(error)}`);
			vscode.window.showErrorMessage(l10n.t('Failed to open pull request: {0}', error instanceof Error ? error.message : String(error)), { modal: true });
		}
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.commitToWorktree', async (args?: { worktreeUri?: vscode.Uri; fileUri?: vscode.Uri }) => {
		logService.trace(`[commitToWorktree] Command invoked, args: ${JSON.stringify(args, null, 2)}`);
		if (!args?.worktreeUri || !args?.fileUri) {
			logService.debug('[commitToWorktree] Missing worktreeUri or fileUri, aborting');
			return;
		}

		const worktreeUri = vscode.Uri.from(args.worktreeUri);
		const fileUri = vscode.Uri.from(args.fileUri);
		try {
			const fileName = basename(fileUri);
			await gitService.add(worktreeUri, [fileUri.fsPath]);
			logService.debug(`[commitToWorktree] Committing with message: Update customization: ${fileName}`);
			await gitService.commit(worktreeUri, l10n.t('Update customization: {0}', fileName), { noVerify: true, signCommit: false });
			logService.trace('[commitToWorktree] Commit successful');

			// Clear the worktree changes cache so getWorktreeChanges() recomputes
			const sessionId = await copilotCLIWorktreeManagerService.getSessionIdForWorktree(worktreeUri);
			if (sessionId) {
				const props = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
				if (props) {
					await copilotCLIWorktreeManagerService.setWorktreeProperties(sessionId, { ...props, changes: undefined });
				} else {
					logService.error('[commitToWorktree] No worktree properties found for session:', sessionId);
				}
			} else {
				logService.error('[commitToWorktree] No session found for worktree:', worktreeUri.toString());
			}

			logService.trace('[commitToWorktree] Notifying sessions change');
			if (sessionId) {
				await contentProvider.refreshSession({ reason: 'update', sessionId });
			}
		} catch (error) {
			const { stdout = '', stderr = '', gitErrorCode } = error as { stdout?: string; stderr?: string; gitErrorCode?: string };
			const normalizedStdout = stdout.toLowerCase();
			const normalizedStderr = stderr.toLowerCase();
			if (normalizedStdout.includes('nothing to commit') || normalizedStderr.includes('nothing to commit') || gitErrorCode === 'NoLocalChanges' || gitErrorCode === 'NotAGitRepository') {
				logService.debug('[commitToWorktree] Nothing to commit or non-applicable repository state, skipping');
				return;
			}
			logService.error('[commitToWorktree] Error:', error);
			vscode.window.showErrorMessage(l10n.t('Failed to commit: {0}', error instanceof Error ? error.message : String(error)));
		}
	}));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.commitToRepository', async (args?: { repositoryUri?: vscode.Uri; fileUri?: vscode.Uri }) => {
		logService.trace(`[commitToRepository] Command invoked, args: ${JSON.stringify(args, null, 2)}`);
		if (!args?.repositoryUri || !args?.fileUri) {
			logService.debug('[commitToRepository] Missing repositoryUri or fileUri, aborting');
			return;
		}

		const repositoryUri = vscode.Uri.from(args.repositoryUri);
		const fileUri = vscode.Uri.from(args.fileUri);
		try {
			const fileName = basename(fileUri);
			await gitService.add(repositoryUri, [fileUri.fsPath]);

			const message = l10n.t('Update customization: {0}', fileName);
			logService.debug(`[commitToRepository] Committing with message: ${message}`);
			await gitService.commit(repositoryUri, message, { noVerify: true, signCommit: false });
			logService.trace('[commitToRepository] Commit successful');
		} catch (error) {
			const stderr = (error as { stderr?: string })?.stderr ?? '';
			const stdout = (error as { stdout?: string })?.stdout ?? '';
			const gitErrorCode = (error as { gitErrorCode?: string })?.gitErrorCode;

			// Benign: nothing was staged or no local changes to commit
			if (stderr.includes('nothing to commit') || stdout.includes('nothing to commit') || gitErrorCode === 'NoLocalChanges') {
				logService.debug('[commitToRepository] Nothing to commit, skipping');
				return;
			}

			// Benign: repository URI doesn't point to a git repo
			if (gitErrorCode === 'NotAGitRepository') {
				logService.debug('[commitToRepository] Not a git repository, skipping');
				return;
			}

			logService.error('[commitToRepository] Error:', error);
			vscode.window.showErrorMessage(l10n.t("Could not save your customization to the default branch — this can happen when the worktree and the base repository have conflicting changes. Your change is still saved in this session's worktree."));
		}
	}));

	return disposableStore;
}

async function getModelFromPromptFile(models: readonly string[], copilotCLIModels: ICopilotCLIModels): Promise<string | undefined> {
	for (const model of models) {
		let modelId = await copilotCLIModels.resolveModel(model);
		if (modelId) {
			return modelId;
		}
		// Sometimes the models can contain ` (Copilot)` suffix, try stripping that and resolving again.
		if (!model.includes('(')) {
			continue;
		}
		modelId = await copilotCLIModels.resolveModel(model.substring(0, model.indexOf('(')).trim());
		if (modelId) {
			return modelId;
		}
	}
	return undefined;
}


function folderMRUToChatProviderOptions(mruItems: FolderRepositoryMRUEntry[]): ChatSessionProviderOptionItem[] {
	return mruItems.map((item) => {
		if (item.repository) {
			return toRepositoryOptionItem(item.folder);
		} else {
			return toWorkspaceFolderOptionItem(item.folder, basename(item.folder));
		}
	});

}


/**
 * Check if a path exists and is a directory.
 */
async function checkPathExists(filePath: vscode.Uri, fileSystemService: IFileSystemService): Promise<boolean> {
	try {
		const stat = await fileSystemService.stat(filePath);
		return stat.type === vscode.FileType.Directory;
	} catch {
		return false;
	}
}

function isUnknownEventTypeError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /Unknown event type:/i.test(message);
}

/**
 * Queries the GitHub API to find a pull request whose head branch matches the
 * given worktree branch. This covers cases where the MCP tool failed to report
 * a PR URL, or the user created the PR externally (e.g., via github.com).
 */
async function detectPullRequestFromGitHubAPI(
	branchName: string,
	repositoryPath: string,
	gitService: IGitService,
	octoKitService: IOctoKitService,
	logService: ILogService,
): Promise<{ url: string; state: string } | undefined> {
	const repoContext = await gitService.getRepository(URI.file(repositoryPath));
	if (!repoContext) {
		logService.debug(`[detectPullRequestFromGitHubAPI] No git repository found for path: ${repositoryPath}`);
		return undefined;
	}

	const repoInfo = getGitHubRepoInfoFromContext(repoContext);
	if (!repoInfo) {
		logService.debug(`[detectPullRequestFromGitHubAPI] Could not extract GitHub repo info from repository at: ${repositoryPath}`);
		return undefined;
	}

	logService.debug(`[detectPullRequestFromGitHubAPI] Querying GitHub API for PR on ${repoInfo.id.org}/${repoInfo.id.repo}, branch=${branchName}`);

	const pr = await octoKitService.findPullRequestByHeadBranch(
		repoInfo.id.org,
		repoInfo.id.repo,
		branchName,
		{},
	);

	if (pr?.url) {
		const prState = derivePullRequestState(pr);
		logService.trace(`[detectPullRequestFromGitHubAPI] Detected pull request via GitHub API: ${pr.url} ${prState}`);
		return { url: pr.url, state: prState };
	}

	logService.debug(`[detectPullRequestFromGitHubAPI] No PR found for ${repoInfo.id.org}/${repoInfo.id.repo}, branch=${branchName}`);
	return undefined;
}
