/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { Attachment, SessionOptions, SweCustomAgent } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ChatExtendedRequestHandler, ChatRequestTurn2, Uri } from 'vscode';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { INativeEnvService } from '../../../platform/env/common/envService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IGitService } from '../../../platform/git/common/gitService';
import { toGitUri } from '../../../platform/git/common/utils';
import { ILogService } from '../../../platform/log/common/logService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { isUri } from '../../../util/common/types';
import { DeferredPromise, IntervalTimer } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, IReference } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { relative } from '../../../util/vs/base/common/path';
import { basename, dirname, extUri } from '../../../util/vs/base/common/resources';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { hasKey } from '../../../util/vs/base/common/types';
import { EXTENSION_ID } from '../../common/constants';
import { GitBranchNameGenerator } from '../../prompt/node/gitBranch';
import { IChatSessionMetadataStore, RepositoryProperties } from '../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { IChatFolderMruService, IFolderRepositoryManager, IsolationMode } from '../common/folderRepositoryManager';
import { getWorkingDirectory, IWorkspaceInfo } from '../common/workspaceInfo';
import { ICustomSessionTitleService } from '../copilotcli/common/customSessionTitleService';
import { IChatDelegationSummaryService } from '../copilotcli/common/delegationSummaryService';
import { SessionIdForCLI } from '../copilotcli/common/utils';
import { getCopilotCLISessionDir } from '../copilotcli/node/cliHelpers';
import { ICopilotCLISDK } from '../copilotcli/node/copilotCli';
import { CopilotCLIPromptResolver } from '../copilotcli/node/copilotcliPromptResolver';
import { builtinSlashSCommands, CopilotCLICommand, copilotCLICommands, ICopilotCLISession } from '../copilotcli/node/copilotcliSession';
import { ICopilotCLISessionItem, ICopilotCLISessionService } from '../copilotcli/node/copilotcliSessionService';
import { buildMcpServerMappings } from '../copilotcli/node/mcpHandler';
import { ICopilotCLISessionTracker } from '../copilotcli/vscode-node/copilotCLISessionTracker';
import { ICopilotCLIChatSessionInitializer, SessionInitOptions } from './copilotCLIChatSessionInitializer';
import { convertReferenceToVariable } from './copilotCLIPromptReferences';
import { ICopilotCLITerminalIntegration, TerminalOpenLocation } from './copilotCLITerminalIntegration';
import { CopilotCloudSessionsProvider } from './copilotCloudSessionsProvider';
import { UNTRUSTED_FOLDER_MESSAGE } from './folderRepositoryManagerImpl';
import { IPullRequestDetectionService } from './pullRequestDetectionService';
import { getSelectedSessionOptions, ISessionOptionGroupBuilder, OPEN_REPOSITORY_COMMAND_ID, toRepositoryOptionItem, toWorkspaceFolderOptionItem } from './sessionOptionGroupBuilder';
import { ISessionRequestLifecycle } from './sessionRequestLifecycle';

/**
 * ODO:
 * 3. Verify all command handlers do the exact same thing
 * 6. Is chatSessionContext?.initialSessionOptions still valid with new API
 * 7. Validated selected MRU item
 * 8. We shouldn't have to pass model information into CLISession class, and then update sdk with the model info. Instead when we call get/create session, we should be able to pass the model info there and update the SDK session accordingly.
 * This makes it unnecessary to pass model information.
 * 2. Behavioral Change: trusted flag no longer unlocks dropdowns on trust failure
In the old code, when sessionResult.trusted === false, there was a call to this.unlockRepoOptionForSession(context, token) to reset dropdown selections. The new code at copilotCLIChatSessions.ts:634 simply returns {} without any dropdown reset. However, lockRepoOptionForSession and unlockRepoOptionForSession were already dead code (commented out), so this is actually correct — removing a no-op.
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
	refreshSession(refreshOptions: { reason: 'update'; sessionId: string } | { reason: 'update'; sessionIds: string[] } | { reason: 'delete'; sessionId: string }): Promise<void>;
}

const OPEN_IN_COPILOT_CLI_COMMAND_ID = 'github.copilot.cli.openInCopilotCLI';
const CHECK_FOR_STEERING_DELAY = 100; // ms

const _invalidCopilotCLISessionIdsWithErrorMessage = new Map<string, string>();

// Re-export for backward compatibility
export { resolveBranchLockState, resolveBranchSelection, resolveIsolationSelection } from './sessionOptionGroupBuilder';

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

export class CopilotCLIChatSessionContentProvider extends Disposable implements vscode.ChatSessionContentProvider, ICopilotCLIChatSessionItemProvider {
	private readonly _onDidCommitChatSessionItem = this._register(new Emitter<{ original: vscode.ChatSessionItem; modified: vscode.ChatSessionItem }>());
	public readonly onDidCommitChatSessionItem: Event<{ original: vscode.ChatSessionItem; modified: vscode.ChatSessionItem }> = this._onDidCommitChatSessionItem.event;

	private readonly controller: vscode.ChatSessionItemController;
	private readonly newSessions = new ResourceMap<vscode.ChatSessionItem>();
	constructor(
		@ICopilotCLISessionService private readonly sessionService: ICopilotCLISessionService,
		@IChatSessionWorktreeService private readonly copilotCLIWorktreeManagerService: IChatSessionWorktreeService,
		@IFolderRepositoryManager private readonly folderRepositoryManager: IFolderRepositoryManager,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomSessionTitleService private readonly customSessionTitleService: ICustomSessionTitleService,
		@IRunCommandExecutionService private readonly commandExecutionService: IRunCommandExecutionService,
		@ILogService private readonly logService: ILogService,
		@IPullRequestDetectionService private readonly _prDetectionService: IPullRequestDetectionService,
		@ISessionOptionGroupBuilder private readonly _optionGroupBuilder: ISessionOptionGroupBuilder,
		@IGitService private readonly _gitService: IGitService,
		@IChatSessionWorkspaceFolderService private readonly _workspaceFolderService: IChatSessionWorkspaceFolderService,
		@IChatSessionMetadataStore private readonly _metadataStore: IChatSessionMetadataStore,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super();

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
						if (result.recreated) {
							await this.refreshSession({ reason: 'update', sessionId });
						}
					} catch (error) {
						this.logService.error(`[CopilotCLI] Failed to recreate worktree for unarchived session ${sessionId}:`, error);
					}
				}
			}));
		}

		const newInputStates: WeakRef<vscode.ChatSessionInputState>[] = [];
		controller.getChatSessionInputState = async (sessionResource, context, token) => {
			const isExistingSession = sessionResource && !this.sessionService.isNewSessionId(SessionIdForCLI.parse(sessionResource));
			if (isExistingSession) {
				const groups = await this._optionGroupBuilder.buildExistingSessionInputStateGroups(sessionResource, token);
				return controller.createChatSessionInputState(groups);
			} else {
				const groups = await this._optionGroupBuilder.provideChatSessionProviderOptionGroups(context.previousInputState);
				const state = controller.createChatSessionInputState(groups);
				// Only wire dynamic updates for new sessions (existing sessions are fully locked).
				// Note: don't use the getChatSessionInputState token here — it's a one-shot token
				// that may be disposed by the time the user interacts with the dropdowns.
				newInputStates.push(new WeakRef(state));
				state.onDidChange(() => {
					void this._optionGroupBuilder.handleInputStateChange(state);
				});
				return state;
			}
		};

		// Refresh new-session dropdown groups when git or workspace state changes
		// (e.g. after git init, opening a repo, or adding/removing workspace folders).
		const refreshActiveInputState = () => {
			// Sweep stale WeakRefs before iterating
			for (let i = newInputStates.length - 1; i >= 0; i--) {
				if (!newInputStates[i].deref()) {
					newInputStates.splice(i, 1);
				}
			}
			for (const weakRef of newInputStates) {
				const state = weakRef.deref();
				if (state) {
					void this._optionGroupBuilder.rebuildInputState(state);
				}
			}
		};
		this._register(this._gitService.onDidFinishInitialization(refreshActiveInputState));
		this._register(this._gitService.onDidOpenRepository(refreshActiveInputState));
		this._register(this._gitService.onDidCloseRepository(refreshActiveInputState));
		this._register(this._workspaceService.onDidChangeWorkspaceFolders(refreshActiveInputState));
	}

	public async updateInputStateAfterFolderSelection(inputState: vscode.ChatSessionInputState, folderUri: vscode.Uri): Promise<void> {
		this._optionGroupBuilder.setNewFolderForInputState(inputState, folderUri);
		await this._optionGroupBuilder.rebuildInputState(inputState, folderUri);
	}

	public async refreshSession(refreshOptions: { reason: 'update'; sessionId: string } | { reason: 'update'; sessionIds: string[] } | { reason: 'delete'; sessionId: string }): Promise<void> {
		if (refreshOptions.reason === 'delete') {
			const uri = SessionIdForCLI.getResource(refreshOptions.sessionId);
			this.controller.items.delete(uri);
		} else if (refreshOptions.reason === 'update' && hasKey(refreshOptions, { 'sessionIds': true })) {
			await Promise.allSettled(refreshOptions.sessionIds.map(async sessionId => {
				const item = await this.sessionService.getSessionItem(sessionId, CancellationToken.None);
				if (item) {
					const chatSessionItem = await this.toChatSessionItem(item);
					this.controller.items.add(chatSessionItem);
				}
			}));
		} else {
			const item = await this.sessionService.getSessionItem(refreshOptions.sessionId, CancellationToken.None);
			if (item) {
				const chatSessionItem = await this.toChatSessionItem(item);
				this.controller.items.add(chatSessionItem);
			}
		}
	}

	public async toChatSessionItem(session: ICopilotCLISessionItem): Promise<vscode.ChatSessionItem> {
		const resource = SessionIdForCLI.getResource(session.id);
		const item = this.controller.createChatSessionItem(resource, session.label);

		const worktreeProperties = await this.copilotCLIWorktreeManagerService.getWorktreeProperties(session.id);
		const workingDirectory = worktreeProperties?.worktreePath ? vscode.Uri.file(worktreeProperties.worktreePath)
			: session.workingDirectory;

		item.timing = session.timing;
		item.status = session.status ?? vscode.ChatSessionStatus.Completed;
		const [badge, changes, metadata] = await Promise.all([
			this.buildBadge(worktreeProperties, workingDirectory),
			this.buildChanges(session.id, worktreeProperties, workingDirectory),
			this.buildMetadata(session.id, worktreeProperties, workingDirectory),
		]);
		item.badge = badge;
		item.changes = changes;
		item.metadata = metadata;
		return item;
	}

	private async buildBadge(
		worktreeProperties: Awaited<ReturnType<IChatSessionWorktreeService['getWorktreeProperties']>>,
		workingDirectory: vscode.Uri | undefined,
	): Promise<vscode.MarkdownString | undefined> {
		const repositories = this._gitService.repositories.filter(r => r.kind !== 'worktree');
		const shouldShow = vscode.workspace.workspaceFolders === undefined ||
			vscode.workspace.isAgentSessionsWorkspace ||
			repositories.length > 1;
		if (!shouldShow) {
			return undefined;
		}
		const badgeUri = worktreeProperties?.repositoryPath
			? vscode.Uri.file(worktreeProperties.repositoryPath)
			: workingDirectory;
		if (!badgeUri) {
			return undefined;
		}
		const isTrusted = await vscode.workspace.isResourceTrusted(badgeUri);
		const isRepo = !!worktreeProperties?.repositoryPath;
		const icon = isTrusted ? (isRepo ? '$(repo)' : '$(folder)') : '$(workspace-untrusted)';
		const badge = new vscode.MarkdownString(`${icon} ${basename(badgeUri)}`);
		badge.supportThemeIcons = true;
		return badge;
	}

	private async buildChanges(
		sessionId: string,
		worktreeProperties: Awaited<ReturnType<IChatSessionWorktreeService['getWorktreeProperties']>>,
		workingDirectory: vscode.Uri | undefined,
	): Promise<vscode.ChatSessionChangedFile2[]> {
		const changes: vscode.ChatSessionChangedFile2[] = [];
		if (worktreeProperties?.repositoryPath && await vscode.workspace.isResourceTrusted(vscode.Uri.file(worktreeProperties.repositoryPath))) {
			changes.push(...(await this.copilotCLIWorktreeManagerService.getWorktreeChanges(sessionId) ?? []));
		} else if (workingDirectory && await vscode.workspace.isResourceTrusted(workingDirectory)) {
			const workspaceChanges = await this._workspaceFolderService.getWorkspaceChanges(sessionId) ?? [];
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
		return changes;
	}

	private async buildMetadata(
		sessionId: string,
		worktreeProperties: Awaited<ReturnType<IChatSessionWorktreeService['getWorktreeProperties']>>,
		workingDirectory: vscode.Uri | undefined,
	): Promise<{ readonly [key: string]: unknown }> {
		if (worktreeProperties) {
			return {
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
		}

		const [sessionRequestDetails, repositoryProperties] = await Promise.all([
			this._metadataStore.getRequestDetails(sessionId),
			this._metadataStore.getRepositoryProperties(sessionId)
		]);

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

		return {
			isolationMode: IsolationMode.Workspace,
			repositoryPath: repositoryProperties?.repositoryPath,
			branchName: repositoryProperties?.branchName,
			baseBranchName: repositoryProperties?.baseBranchName,
			workingDirectoryPath: workingDirectory?.fsPath,
			firstCheckpointRef,
			lastCheckpointRef
		} satisfies { readonly [key: string]: unknown };
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
				};
			} else {
				this.newSessions.delete(resource);
				return await this.provideChatSessionContentForExistingSession(resource, token);
			}
		} finally {
			this.logService.info(`[CopilotCLIChatSessionContentProvider] provideChatSessionContent for ${resource.toString()} took ${stopwatch.elapsed()}ms`);
		}
	}

	private async provideChatSessionContentForExistingSession(resource: Uri, token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		const copilotcliSessionId = SessionIdForCLI.parse(resource);

		// Fire-and-forget: detect PR when the user opens a session.
		this._prDetectionService.detectPullRequest(copilotcliSessionId);

		const folderRepo = await this.folderRepositoryManager.getFolderRepository(copilotcliSessionId, undefined, token);
		const [history, title, optionGroups] = await Promise.all([
			this.getSessionHistory(copilotcliSessionId, folderRepo, token),
			this.customSessionTitleService.getCustomSessionTitle(copilotcliSessionId),
			this._optionGroupBuilder.buildExistingSessionInputStateGroups(resource, token),
		]);

		const options: Record<string, string | vscode.ChatSessionProviderOptionItem> = {};
		for (const group of optionGroups) {
			if (group.selected) {
				options[group.id] = { ...group.selected, locked: true };
			}
		}

		return {
			title,
			history,
			options,
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

}

export class CopilotCLIChatSessionParticipant extends Disposable {

	constructor(
		private readonly sessionItemProvider: ICopilotCLIChatSessionItemProvider,
		private readonly promptResolver: CopilotCLIPromptResolver,
		private readonly cloudSessionProvider: CopilotCloudSessionsProvider | undefined,
		private readonly branchNameGenerator: GitBranchNameGenerator | undefined,
		@IGitService private readonly gitService: IGitService,
		@ICopilotCLISessionService private readonly sessionService: ICopilotCLISessionService,
		@IChatSessionWorktreeService private readonly copilotCLIWorktreeManagerService: IChatSessionWorktreeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IChatDelegationSummaryService private readonly chatDelegationSummaryService: IChatDelegationSummaryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICopilotCLISDK private readonly copilotCLISDK: ICopilotCLISDK,
		@ICopilotCLIChatSessionInitializer private readonly sessionInitializer: ICopilotCLIChatSessionInitializer,
		@ISessionRequestLifecycle private readonly sessionRequestLifecycle: ISessionRequestLifecycle,
		@IPullRequestDetectionService private readonly prDetectionService: IPullRequestDetectionService,
	) {
		super();

		this._register(this.prDetectionService.onDidDetectPullRequest(sessionId => {
			this.sessionItemProvider.refreshSession({ reason: 'update', sessionId }).catch(error => this.logService.error(error, 'Failed to refresh session after PR detection'));
		}));
	}

	createHandler(): ChatExtendedRequestHandler {
		return this.handleRequest.bind(this);
	}

	private readonly contextForRequest = new Map<string, { prompt: string; attachments: Attachment[] }>();

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

	private async authenticate(): Promise<NonNullable<SessionOptions['authInfo']>> {
		const authInfo = await this.copilotCLISDK.getAuthInfo().catch((ex) => this.logService.error(ex, 'Authorization failed'));
		if (!authInfo) {
			this.logService.error(`Authorization failed`);
			throw new Error(vscode.l10n.t('Authorization failed. Please sign into GitHub and try again.'));
		}
		if ((authInfo.type === 'token' && !authInfo.token) && !this.configurationService.getConfig(ConfigKey.Shared.DebugOverrideProxyUrl)) {
			this.logService.error(`Authorization failed`);
			throw new Error(vscode.l10n.t('Authorization failed. Please sign into GitHub and try again.'));
		}
		return authInfo;
	}

	/**
	 * Resolve the input and attachments for the SDK session based on request type.
	 *
	 * The VS Code chat API creates the session before firing the request handler,
	 * so delegated requests pre-resolve and cache prompt/attachments in `contextForRequest`.
	 */
	private async resolveInput(
		request: vscode.ChatRequest,
		session: ICopilotCLISession,
		isNewSession: boolean,
		token: vscode.CancellationToken,
	): Promise<{ input: { prompt: string; command?: CopilotCLICommand }; attachments: Attachment[] }> {
		const contextForRequest = this.contextForRequest.get(session.sessionId);
		this.contextForRequest.delete(session.sessionId);

		if (contextForRequest) {
			return { input: { prompt: contextForRequest.prompt }, attachments: contextForRequest.attachments };
		}

		if (request.command && !request.prompt && !isNewSession) {
			const input = (copilotCLICommands as readonly string[]).includes(request.command)
				? { command: request.command as CopilotCLICommand, prompt: '' }
				: { prompt: `/${request.command}` };
			return { input, attachments: [] };
		}

		const { prompt, attachments } = await this.promptResolver.resolvePrompt(request, undefined, [], session.workspace, [], token);
		const input = (request.command && (copilotCLICommands as readonly string[]).includes(request.command))
			? { command: request.command as CopilotCLICommand, prompt }
			: { prompt };
		return { input, attachments };
	}

	private async handleRequestImpl(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<vscode.ChatResult | void> {
		const { chatSessionContext } = context;
		const disposables = new DisposableStore();
		let sdkSessionId: string | undefined = undefined;
		let session: IReference<ICopilotCLISession> | undefined = undefined;
		try {
			this.sendTelemetryForHandleRequest(request, context);

			const authInfo = await this.authenticate();

			if (!chatSessionContext || !SessionIdForCLI.isCLIResource(request.sessionResource)) {
				return await this.handleDelegationFromAnotherChat(request, undefined, request.references, context, stream, authInfo, token);
			}

			const { resource } = chatSessionContext.chatSessionItem;
			const sessionId = SessionIdForCLI.parse(resource);
			const isNewSession = this.sessionService.isNewSessionId(sessionId);
			const invalidSessionMessage = _invalidCopilotCLISessionIdsWithErrorMessage.get(sessionId);
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
			const branchNamePromise = (isNewSession && request.prompt && this.branchNameGenerator) ? this.branchNameGenerator.generateBranchName(fakeContext, token) : Promise.resolve(undefined);

			const selectedOptions = getSelectedSessionOptions(chatSessionContext.inputState);
			const sessionResult = await this.getOrCreateSession(request, chatSessionContext.chatSessionItem.resource, { ...selectedOptions, newBranch: branchNamePromise, stream }, disposables, token);
			({ session } = sessionResult);
			const { model, agent } = sessionResult;
			if (!session || token.isCancellationRequested) {
				return {};
			}

			sdkSessionId = session.object.sessionId;

			await this.sessionRequestLifecycle.startRequest(sdkSessionId, request, context.history.length === 0, session.object.workspace, agent?.name);

			if (request.command === 'delegate') {
				await this.handleDelegationToCloud(session.object, request, context, stream, token);
			} else {
				const { input, attachments } = await this.resolveInput(request, session.object, isNewSession, token);
				await session.object.handleRequest(request, input, attachments, model, authInfo, token);
			}

			return {};
		} catch (ex) {
			if (isCancellationError(ex)) {
				return {};
			}
			throw ex;
		} finally {
			if (sdkSessionId && session) {
				await this.sessionRequestLifecycle.endRequest(
					sdkSessionId, request,
					{ status: session.object.status, workspace: session.object.workspace, createdPullRequestUrl: session.object.createdPullRequestUrl },
					token,
				);
				this.sessionItemProvider.refreshSession({ reason: 'update', sessionId: sdkSessionId })
					.catch(error => this.logService.error(error, 'Failed to refresh session item after handling request'));
			}
			disposables.dispose();
		}
	}

	private async getOrCreateSession(request: vscode.ChatRequest, chatResource: vscode.Uri, options: SessionInitOptions, disposables: DisposableStore, token: vscode.CancellationToken): Promise<{ session: IReference<ICopilotCLISession> | undefined; isNewSession: boolean; model: { model: string; reasoningEffort?: string } | undefined; agent: SweCustomAgent | undefined; trusted: boolean }> {
		const result = await this.sessionInitializer.getOrCreateSession(request, chatResource, options, disposables, token);
		const { session, isNewSession, model, agent, trusted } = result;
		if (!session || token.isCancellationRequested) {
			return { session: undefined, isNewSession, model, agent, trusted };
		}

		if (isNewSession) {
			this.sessionItemProvider.refreshSession({ reason: 'update', sessionId: session.object.sessionId });
		}

		return { session, isNewSession, model, agent, trusted };
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

		const { workspaceInfo, cancelled } = await this.sessionInitializer.initializeWorkingDirectory(undefined, { stream }, request.toolInvocationToken, token);

		if (cancelled || token.isCancellationRequested) {
			stream.markdown(l10n.t('Copilot CLI delegation cancelled.'));
			return {};
		}
		const { prompt, attachments, references } = await this.promptResolver.resolvePrompt(request, await requestPromptPromise, (otherReferences || []).concat([]), workspaceInfo, [], token);

		const mcpServerMappings = buildMcpServerMappings(request.tools);
		const session = await this.sessionInitializer.createDelegatedSession(request, workspaceInfo, { mcpServerMappings }, token);

		if (summary) {
			const summaryRef = await this.chatDelegationSummaryService.trackSummaryUsage(session.object.sessionId, summary);
			if (summaryRef) {
				references.push(summaryRef);
			}
		}

		this.contextForRequest.set(session.object.sessionId, { prompt, attachments });
		void vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', {
			resource: SessionIdForCLI.getResource(session.object.sessionId),
			prompt: userPrompt || request.prompt,
			attachedContext: references.map(ref => convertReferenceToVariable(ref, attachments))
		});

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
	copilotCLIFolderMruService: IChatFolderMruService,
	envService: INativeEnvService,
	fileSystemService: IFileSystemService,
	sessionTracker: ICopilotCLISessionTracker,
	terminalIntegration: ICopilotCLITerminalIntegration,
	logService: ILogService
): IDisposable {
	const disposableStore = new DisposableStore();

	// Terminal integration setup: resolve session dirs for terminal links.
	disposableStore.add(terminalIntegration);
	terminalIntegration.setSessionDirResolver(terminal =>
		resolveSessionDirsForTerminal(sessionTracker, terminal)
	);
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

	// Command handler receives `{ inputState, sessionResource }` context args (new API)
	disposableStore.add(vscode.commands.registerCommand(OPEN_REPOSITORY_COMMAND_ID, async ({ inputState }: { inputState: vscode.ChatSessionInputState; sessionResource: vscode.Uri | undefined }) => {
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

		// First check if user trusts the folder.
		const trusted = await vscode.workspace.requestResourceTrust({
			uri: selectedFolderUri,
			message: UNTRUSTED_FOLDER_MESSAGE
		});
		if (!trusted) {
			return;
		}


		// Update inputState groups with newly selected folder and reload branches
		if (inputState) {
			await contentProvider.updateInputStateAfterFolderSelection(inputState, selectedFolderUri);
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

		const repositoryProperties = repository.headBranchName
			? {
				repositoryPath: repository.rootUri.fsPath,
				branchName: repository.headBranchName
			} satisfies RepositoryProperties
			: undefined;

		await copilotCliWorkspaceSession.trackSessionWorkspaceFolder(sessionId, workspaceFolder.fsPath, repositoryProperties);
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
