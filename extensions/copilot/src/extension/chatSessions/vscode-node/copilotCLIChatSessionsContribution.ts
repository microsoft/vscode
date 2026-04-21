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
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { getGitHubRepoInfoFromContext, IGitService, RepoContext } from '../../../platform/git/common/gitService';
import { toGitUri } from '../../../platform/git/common/utils';
import { derivePullRequestState } from '../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { IPromptsService, ParsedPromptFile } from '../../../platform/promptFiles/common/promptsService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { isUri } from '../../../util/common/types';
import { DeferredPromise, disposableTimeout, IntervalTimer, SequencerByKey } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, IReference } from '../../../util/vs/base/common/lifecycle';
import { relative } from '../../../util/vs/base/common/path';
import { basename, dirname, extUri, isEqual } from '../../../util/vs/base/common/resources';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { URI } from '../../../util/vs/base/common/uri';
import { EXTENSION_ID } from '../../common/constants';
import { ChatVariablesCollection, extractDebugTargetSessionIds, isPromptFile } from '../../prompt/common/chatVariablesCollection';
import { GitBranchNameGenerator } from '../../prompt/node/gitBranch';
import { IToolsService } from '../../tools/common/toolsService';
import { IChatSessionMetadataStore, RepositoryProperties, StoredModeInstructions } from '../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeCheckpointService } from '../common/chatSessionWorktreeCheckpointService';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { FolderRepositoryInfo, FolderRepositoryMRUEntry, IChatFolderMruService, IFolderRepositoryManager, IsolationMode } from '../common/folderRepositoryManager';
import { isUntitledSessionId } from '../common/utils';
import { emptyWorkspaceInfo, getWorkingDirectory, isIsolationEnabled, IWorkspaceInfo } from '../common/workspaceInfo';
import { ICustomSessionTitleService } from '../copilotcli/common/customSessionTitleService';
import { IChatDelegationSummaryService } from '../copilotcli/common/delegationSummaryService';
import { getCopilotCLISessionDir } from '../copilotcli/node/cliHelpers';
import { COPILOT_CLI_REASONING_EFFORT_PROPERTY, ICopilotCLIAgents, ICopilotCLIModels, ICopilotCLISDK, isWelcomeView } from '../copilotcli/node/copilotCli';
import { CopilotCLIPromptResolver } from '../copilotcli/node/copilotcliPromptResolver';
import { builtinSlashSCommands, CopilotCLICommand, copilotCLICommands, ICopilotCLISession } from '../copilotcli/node/copilotcliSession';
import { ICopilotCLISessionItem, ICopilotCLISessionService } from '../copilotcli/node/copilotcliSessionService';
import { buildMcpServerMappings } from '../copilotcli/node/mcpHandler';
import { ICopilotCLISessionTracker } from '../copilotcli/vscode-node/copilotCLISessionTracker';
import { ICopilotCLIChatSessionItemProvider } from './copilotCLIChatSessions';
import { convertReferenceToVariable } from './copilotCLIPromptReferences';
import { ICopilotCLITerminalIntegration, TerminalOpenLocation } from './copilotCLITerminalIntegration';
import { CopilotCloudSessionsProvider } from './copilotCloudSessionsProvider';

const REPOSITORY_OPTION_ID = 'repository';

const _sessionWorktreeIsolationCache = new Map<string, boolean>();
const BRANCH_OPTION_ID = 'branch';
const ISOLATION_OPTION_ID = 'isolation';
const PARENT_SESSION_OPTION_ID = 'parentSessionId';
const LAST_USED_ISOLATION_OPTION_KEY = 'github.copilot.cli.lastUsedIsolationOption';
const OPEN_REPOSITORY_COMMAND_ID = 'github.copilot.cli.sessions.openRepository';
const OPEN_IN_COPILOT_CLI_COMMAND_ID = 'github.copilot.cli.openInCopilotCLI';
const MAX_MRU_ENTRIES = 10;
const CHECK_FOR_STEERING_DELAY = 100; // ms

// When we start new sessions, we don't have the real session id, we have a temporary untitled id.
// We also need this when we open a session and later run it.
// When opening the session for readonly mode we store it here and when run the session we read from here instead of opening session in readonly mode again.
const _sessionBranch: Map<string, string | undefined> = new Map();
const _sessionIsolation: Map<string, IsolationMode | undefined> = new Map();

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

export class CopilotCLIChatSessionItemProvider extends Disposable implements vscode.ChatSessionItemProvider, ICopilotCLIChatSessionItemProvider {
	// When we start an untitled CLI session, the id of the session is `untitled:xyz`
	// As soon as we create a CLI session we have the real session id, lets say `cli-1234`
	// Once the session completes, this untitled session `untitled:xyz` will get swapped with the real session id `cli-1234`
	// However if the session items provider is called while the session is still running, we need to return the same old `untitled:xyz` session id back to core.
	// There's an issue in core (about holding onto ref of the Chat Model).
	// As a temporary solution, return the same untitled session id back to core until the session is completed.
	public readonly untitledSessionIdMapping = new Map<string, string>();
	/**
	 * Until the untitled session is properly swappped with the new session, we should keep track of this mapping.
	 * When VS Code asks for the session, always return the old untitled session Uri.
	 */
	public readonly sdkToUntitledUriMapping = new Map<string, Uri>();
	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<void>());
	public readonly onDidChangeChatSessionItems: Event<void> = this._onDidChangeChatSessionItems.event;

	private readonly _onDidCommitChatSessionItem = this._register(new Emitter<{ original: vscode.ChatSessionItem; modified: vscode.ChatSessionItem }>());
	public readonly onDidCommitChatSessionItem: Event<{ original: vscode.ChatSessionItem; modified: vscode.ChatSessionItem }> = this._onDidCommitChatSessionItem.event;


	constructor(
		@ICopilotCLISessionService private readonly copilotcliSessionService: ICopilotCLISessionService,
		@ICopilotCLISessionTracker private readonly sessionTracker: ICopilotCLISessionTracker,
		@ICopilotCLITerminalIntegration private readonly terminalIntegration: ICopilotCLITerminalIntegration,
		@IChatSessionMetadataStore private readonly chatSessionMetadataStore: IChatSessionMetadataStore,
		@IChatSessionWorktreeService private readonly worktreeManager: IChatSessionWorktreeService,
		@IRunCommandExecutionService private readonly commandExecutionService: IRunCommandExecutionService,
		@IChatSessionWorkspaceFolderService private readonly workspaceFolderService: IChatSessionWorkspaceFolderService,
		@IFolderRepositoryManager private readonly folderRepositoryManager: IFolderRepositoryManager,
		@IGitService private readonly gitService: IGitService,
		@IOctoKitService private readonly octoKitService: IOctoKitService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this._register(this.terminalIntegration);
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.Advanced.CLIShowExternalSessions.fullyQualifiedId)) {
				this._onDidChangeChatSessionItems.fire();
			}
		}));

		// Resolve session dirs for terminal links. See resolveSessionDirsForTerminal.
		this.terminalIntegration.setSessionDirResolver(terminal =>
			resolveSessionDirsForTerminal(this.sessionTracker, terminal)
		);

		this._register(this.copilotcliSessionService.onDidChangeSessions(() => {
			this.notifySessionsChange();
		}));
	}

	/**
	 * We should remove this or move this to CopilotCLISessionService
	 */
	public isNewSession(session: string) {
		return isUntitledSessionId(session);
	}

	public notifySessionsChange(): void {
		// Refresh the bulk metadata cache from disk so cross-process writes
		// (e.g. another VS Code window editing the same session) become visible
		// before consumers re-read items.
		this.chatSessionMetadataStore.refresh().catch(() => { /* logged inside */ });
		this._onDidChangeChatSessionItems.fire();
	}

	public async refreshSession(refreshOptions: { reason: 'update'; sessionId: string } | { reason: 'update'; sessionIds: string[] } | { reason: 'delete'; sessionId: string }): Promise<void> {
		await this.chatSessionMetadataStore.refresh().catch(() => { /* logged inside */ });
		this._onDidChangeChatSessionItems.fire();
	}

	public swap(original: vscode.ChatSessionItem, modified: vscode.ChatSessionItem): void {
		this._onDidCommitChatSessionItem.fire({ original, modified });
	}

	public async provideChatSessionItems(token: vscode.CancellationToken): Promise<vscode.ChatSessionItem[]> {
		const stopwatch = new StopWatch();
		const sessions = await this.copilotcliSessionService.getAllSessions(token);
		const diskSessions = await Promise.all(sessions.map(async session => this.toChatSessionItem(session)));

		const count = diskSessions.length;
		void this.commandExecutionService.executeCommand('setContext', 'github.copilot.chat.cliSessionsEmpty', count === 0);
		this.logService.info(`[CopilotCLIChatSessionContentProvider] listSessions took ${stopwatch.elapsed()}ms`);
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
		const resource = this.sdkToUntitledUriMapping.get(session.id) ?? SessionIdForCLI.getResource(this.untitledSessionIdMapping.get(session.id) ?? session.id);
		let worktreeProperties = await this.worktreeManager.getWorktreeProperties(session.id);
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
		const changes: vscode.ChatSessionChangedFile[] = [];
		if (worktreeProperties?.repositoryPath && await vscode.workspace.isResourceTrusted(vscode.Uri.file(worktreeProperties.repositoryPath))) {
			// Worktree
			changes.push(...(await this.worktreeManager.getWorktreeChanges(session.id) ?? []));
		} else if (workingDirectory && await vscode.workspace.isResourceTrusted(workingDirectory)) {
			// Workspace
			const workspaceChanges = await this.workspaceFolderService.getWorkspaceChanges(session.id) ?? [];
			const repositoryProperties = await this.chatSessionMetadataStore.getRepositoryProperties(session.id);

			changes.push(...workspaceChanges.map(change => {
				const originalRef = repositoryProperties?.mergeBaseCommit ?? 'HEAD';

				return new vscode.ChatSessionChangedFile(
					vscode.Uri.file(change.filePath),
					change.originalFilePath
						? toGitUri(vscode.Uri.file(change.originalFilePath), originalRef)
						: undefined,
					change.modifiedFilePath
						? vscode.Uri.file(change.modifiedFilePath)
						: undefined,
					change.statistics.additions,
					change.statistics.deletions);
			}));
		}

		// Status
		const status = session.status ?? vscode.ChatSessionStatus.Completed;

		// Metadata
		let metadata: { readonly [key: string]: unknown };

		// We need to get an updated version of worktree properties here because when the
		// changes are being computed, the worktree properties are also updated with the
		// repository state which we are passing along through the metadata
		worktreeProperties = await this.worktreeManager.getWorktreeProperties(session.id);

		const sessionParentId = await this.chatSessionMetadataStore.getSessionParentId(session.id);

		if (worktreeProperties) {
			// Worktree
			metadata = {
				sessionParentId,
				autoCommit: worktreeProperties.autoCommit !== false,
				baseCommit: worktreeProperties?.baseCommit,
				baseBranchName: worktreeProperties.version === 2
					? worktreeProperties.baseBranchName
					: undefined,
				baseBranchProtected: worktreeProperties.version === 2
					? worktreeProperties.baseBranchProtected === true
					: undefined,
				branchName: worktreeProperties?.branchName,
				upstreamBranchName: worktreeProperties.version === 2
					? worktreeProperties.upstreamBranchName
					: undefined,
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
					: undefined,
				hasGitHubRemote: worktreeProperties.version === 2
					? worktreeProperties.hasGitHubRemote
					: undefined,
				incomingChanges: worktreeProperties.version === 2
					? worktreeProperties.incomingChanges
					: undefined,
				outgoingChanges: worktreeProperties.version === 2
					? worktreeProperties.outgoingChanges
					: undefined,
				uncommittedChanges: worktreeProperties.version === 2
					? worktreeProperties.uncommittedChanges
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
				sessionParentId,
				isolationMode: IsolationMode.Workspace,
				repositoryPath: repositoryProperties?.repositoryPath,
				branchName: repositoryProperties?.branchName,
				baseBranchName: repositoryProperties?.baseBranchName,
				upstreamBranchName: repositoryProperties?.upstreamBranchName,
				workingDirectoryPath: workingDirectory?.fsPath,
				hasGitHubRemote: repositoryProperties?.hasGitHubRemote,
				incomingChanges: repositoryProperties?.incomingChanges,
				outgoingChanges: repositoryProperties?.outgoingChanges,
				uncommittedChanges: repositoryProperties?.uncommittedChanges,
				firstCheckpointRef,
				lastCheckpointRef
			} satisfies { readonly [key: string]: unknown };
		}

		return {
			resource,
			label,
			badge,
			timing: session.timing,
			changes,
			status,
			metadata,
		} satisfies vscode.ChatSessionItem;
	}

	/**
	 * Detects a pull request for a session when the user opens it.
	 * If a PR is found, persists the URL and notifies the UI.
	 */
	public async detectPullRequestOnSessionOpen(sessionId: string): Promise<void> {
		try {
			const worktreeProperties = await this.worktreeManager.getWorktreeProperties(sessionId);
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
				const currentProperties = await this.worktreeManager.getWorktreeProperties(sessionId);
				if (currentProperties?.version === 2
					&& (currentProperties.pullRequestUrl !== prResult.url || currentProperties.pullRequestState !== prResult.state)) {
					this.logService.debug(`[CopilotCLIChatSessionItemProvider] Updating PR metadata for ${sessionId}: url=${prResult.url}, state=${prResult.state} (was url=${currentProperties.pullRequestUrl ?? 'none'}, state=${currentProperties.pullRequestState ?? 'none'})`);
					await this.worktreeManager.setWorktreeProperties(sessionId, {
						...currentProperties,
						pullRequestUrl: prResult.url,
						pullRequestState: prResult.state,
						changes: undefined,
					});
					this.notifySessionsChange();
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
	public async createCopilotCLITerminal(location: TerminalOpenLocation = 'editor', name?: string, cwd?: string): Promise<void> {
		// TODO@rebornix should be set by CLI
		const terminalName = name || process.env.COPILOTCLI_TERMINAL_TITLE || l10n.t('Copilot CLI');
		await this.terminalIntegration.openTerminal(terminalName, [], cwd, location);
	}

	public async resumeCopilotCLISessionInTerminal(sessionItem: vscode.ChatSessionItem): Promise<void> {
		const id = SessionIdForCLI.parse(sessionItem.resource);
		const existingTerminal = await this.sessionTracker.getTerminal(id);
		if (existingTerminal) {
			existingTerminal.show();
			return;
		}

		const terminalName = sessionItem.label || id;
		const cliArgs = ['--resume', id];
		const token = new vscode.CancellationTokenSource();
		try {
			const folderInfo = await this.folderRepositoryManager.getFolderRepository(id, undefined, token.token);
			const cwd = folderInfo.worktree ?? folderInfo.repository ?? folderInfo.folder;
			const terminal = await this.terminalIntegration.openTerminal(terminalName, cliArgs, cwd?.fsPath);
			if (terminal) {
				this.sessionTracker.setSessionTerminal(id, terminal);
				this.terminalIntegration.setTerminalSessionDir(terminal, Uri.file(getCopilotCLISessionDir(id)));
			}
		} finally {
			token.dispose();
		}
	}
}

function isBranchOptionFeatureEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getConfig(ConfigKey.Advanced.CLIBranchSupport);
}

function isIsolationOptionFeatureEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getConfig(ConfigKey.Advanced.CLIIsolationOption);
}

function isReasoningEffortFeatureEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getConfig(ConfigKey.Advanced.CLIThinkingEffortEnabled);
}

export class CopilotCLIChatSessionContentProvider extends Disposable implements vscode.ChatSessionContentProvider {
	private readonly _onDidChangeChatSessionOptions = this._register(new Emitter<vscode.ChatSessionOptionChangeEvent>());
	readonly onDidChangeChatSessionOptions = this._onDidChangeChatSessionOptions.event;
	private readonly _onDidChangeChatSessionProviderOptions = this._register(new Emitter<void>());
	readonly onDidChangeChatSessionProviderOptions = this._onDidChangeChatSessionProviderOptions.event;

	private _currentSessionId: string | undefined;
	private _selectedRepoForBranches: { repoUri: URI; headBranchName: string | undefined } | undefined;
	private _displayedOptionIds = new Set<string>();
	/**
	 * ID of the last used folder in an untitled workspace (for defaulting selection).
	 */
	private _lastUsedFolderIdInUntitledWorkspace: string | undefined;
	constructor(
		private readonly sessionItemProvider: CopilotCLIChatSessionItemProvider,
		@ICopilotCLIAgents private readonly copilotCLIAgents: ICopilotCLIAgents,
		@ICopilotCLISessionService private readonly sessionService: ICopilotCLISessionService,
		@IChatSessionWorktreeService private readonly copilotCLIWorktreeManagerService: IChatSessionWorktreeService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileSystem: IFileSystemService,
		@IGitService private readonly gitService: IGitService,
		@IFolderRepositoryManager private readonly folderRepositoryManager: IFolderRepositoryManager,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomSessionTitleService private readonly customSessionTitleService: ICustomSessionTitleService,
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@ILogService private readonly logService: ILogService,
		@IChatFolderMruService private readonly folderMruService: IChatFolderMruService,
	) {
		super();
		const originalRepos = this.getRepositoryOptionItems().length;
		this._register(this.gitService.onDidFinishInitialization(() => {
			if (originalRepos !== this.getRepositoryOptionItems().length) {
				this._onDidChangeChatSessionProviderOptions.fire();
			}
		}));
		this._register(this.gitService.onDidOpenRepository(() => {
			if (originalRepos !== this.getRepositoryOptionItems().length) {
				this._onDidChangeChatSessionProviderOptions.fire();
			}
		}));
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			this._onDidChangeChatSessionProviderOptions.fire();
		}));
		this._register(this.copilotCLIAgents.onDidChangeAgents(() => {
			this._onDidChangeChatSessionProviderOptions.fire();
		}));
	}

	public notifySessionOptionsChange(resource: vscode.Uri, updates: ReadonlyArray<{ optionId: string; value: string | vscode.ChatSessionProviderOptionItem }>): void {
		this._onDidChangeChatSessionOptions.fire({ resource, updates });
	}

	public notifyProviderOptionsChange(): void {
		this._onDidChangeChatSessionProviderOptions.fire();
	}

	private async getDefaultUntitledSessionRepositoryOption(copilotcliSessionId: string | undefined, token: vscode.CancellationToken) {
		const repositories = this.isUntitledWorkspace() ? folderMRUToChatProviderOptions(await this.folderMruService.getRecentlyUsedFolders(token)) : this.getRepositoryOptionItems();
		// Use FolderRepositoryManager to get folder/repository info (no trust check needed for UI population)
		const folderInfo = copilotcliSessionId ? await this.folderRepositoryManager.getFolderRepository(copilotcliSessionId, undefined, token) : undefined;
		const uri = folderInfo?.repository ?? folderInfo?.folder;
		if (uri) {
			return uri;
		} else if (repositories.length) {
			// No folder selected yet for this untitled session - use MRU or first available
			const lastUsedFolderId = this._lastUsedFolderIdInUntitledWorkspace;
			const firstRepo = (lastUsedFolderId && repositories.find(repo => repo.id === lastUsedFolderId)?.id) ?? repositories[0].id;
			return Uri.file(firstRepo);
		}
		return undefined;
	}

	async provideChatSessionContent(resource: Uri, token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		const stopwatch = new StopWatch();
		try {
			const copilotcliSessionId = SessionIdForCLI.parse(resource);
			const isUntitled = this.sessionItemProvider.isNewSession(copilotcliSessionId);
			if (isUntitled) {
				return await this.provideChatSessionContentForUntitledSession(resource, token);
			} else {
				return await this.provideChatSessionContentForExistingSession(resource, token);
			}
		} finally {
			this.logService.info(`[CopilotCLIChatSessionContentProvider] provideChatSessionContent for ${resource.toString()} took ${stopwatch.elapsed()}ms`);
		}
	}

	public trackLastUsedFolderInWelcomeView(folderUri: vscode.Uri): void {
		// Update MRU tracking for untitled workspaces
		if (isWelcomeView(this.workspaceService)) {
			this._lastUsedFolderIdInUntitledWorkspace = folderUri.fsPath;
		}
	}

	async provideChatSessionContentForUntitledSession(resource: Uri, token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		const copilotcliSessionId = SessionIdForCLI.parse(resource);
		this._currentSessionId = copilotcliSessionId;
		const folderRepo = await this.folderRepositoryManager.getFolderRepository(copilotcliSessionId, undefined, token);
		const isUntitled = this.sessionItemProvider.isNewSession(copilotcliSessionId);
		const [history, title] = await Promise.all([
			isUntitled ? Promise.resolve([]) : this.getSessionHistory(copilotcliSessionId, folderRepo, token),
			this.customSessionTitleService.getCustomSessionTitle(copilotcliSessionId),
		]);

		const options: Record<string, string | vscode.ChatSessionProviderOptionItem> = {};

		// Use FolderRepositoryManager to get folder/repository info (no trust check needed for UI population)
		const defaultRepo = await this.getDefaultUntitledSessionRepositoryOption(copilotcliSessionId, token);
		if (defaultRepo) {
			// Determine upfront whether the default repository/folder is trusted. We need to do
			// this since the user should not be presented with a resource trust dialog in case the
			// default repository/folder is not trusted.
			const defaultRepoIsTrusted = await vscode.workspace.isResourceTrusted(defaultRepo);

			if (defaultRepoIsTrusted) {
				options[REPOSITORY_OPTION_ID] = defaultRepo.fsPath;
				// Use the manager to track the selection for untitled sessions
				this.trackLastUsedFolderInWelcomeView(defaultRepo);
				this.folderRepositoryManager.setNewSessionFolder(copilotcliSessionId, defaultRepo);

				// Check if the default folder is a git repo so the branch dropdown appears immediately
				const repoInfo = await this.folderRepositoryManager.getRepositoryInfo(defaultRepo, token);
				if (repoInfo.repository) {
					this._selectedRepoForBranches = { repoUri: repoInfo.repository, headBranchName: repoInfo.headBranchName };
				} else {
					this._selectedRepoForBranches = undefined;
				}
				if (repoInfo.repository && isIsolationOptionFeatureEnabled(this.configurationService)) {
					if (!_sessionIsolation.has(copilotcliSessionId)) {
						const lastUsed = this.context.globalState.get<IsolationMode>(LAST_USED_ISOLATION_OPTION_KEY, IsolationMode.Workspace);
						_sessionIsolation.set(copilotcliSessionId, lastUsed);
					}
					const isolationMode = _sessionIsolation.get(copilotcliSessionId)!;
					options[ISOLATION_OPTION_ID] = {
						id: isolationMode,
						name: isolationMode === IsolationMode.Worktree ? l10n.t('Worktree') : l10n.t('Workspace'),
						icon: new vscode.ThemeIcon(isolationMode === IsolationMode.Worktree ? 'worktree' : 'folder')
					};
				}
				const shouldShowBranch = !isIsolationOptionFeatureEnabled(this.configurationService) || _sessionIsolation.get(copilotcliSessionId) === IsolationMode.Worktree;
				const branchItems = await this.getBranchOptionItems();
				if (branchItems.length > 0 && shouldShowBranch) {
					_sessionBranch.set(copilotcliSessionId, branchItems[0].id);
					options[BRANCH_OPTION_ID] = {
						id: branchItems[0].id,
						name: branchItems[0].name,
						icon: new vscode.ThemeIcon('git-branch')
					};
				}
			} else {
				options[REPOSITORY_OPTION_ID] = '';
			}

			this.notifyProviderOptionsChange();
		}

		return {
			title,
			history,
			activeResponseCallback: undefined,
			requestHandler: undefined,
			options: options
		};
	}

	async provideChatSessionContentForExistingSession(resource: Uri, token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		const copilotcliSessionId = SessionIdForCLI.parse(resource);
		this._currentSessionId = copilotcliSessionId;

		// Fire-and-forget: detect PR when the user opens a session
		void this.sessionItemProvider.detectPullRequestOnSessionOpen(copilotcliSessionId);

		const folderRepo = await this.folderRepositoryManager.getFolderRepository(copilotcliSessionId, undefined, token);
		const [history, title, folderInfo, worktreeProperties] = await Promise.all([
			this.getSessionHistory(copilotcliSessionId, folderRepo, token),
			this.customSessionTitleService.getCustomSessionTitle(copilotcliSessionId),
			this.folderRepositoryManager.getFolderRepository(copilotcliSessionId, undefined, token),
			this.copilotCLIWorktreeManagerService.getWorktreeProperties(copilotcliSessionId)
		]);

		const options: Record<string, string | vscode.ChatSessionProviderOptionItem> = {};
		if (folderInfo.repository) {
			options[REPOSITORY_OPTION_ID] = {
				...toRepositoryOptionItem(folderInfo.repository),
				locked: true
			};
		} else if (folderInfo.folder) {
			const folderName = this.workspaceService.getWorkspaceFolderName(folderInfo.folder) || basename(folderInfo.folder);
			options[REPOSITORY_OPTION_ID] = {
				...toWorkspaceFolderOptionItem(folderInfo.folder, folderName),
				locked: true
			};
		} else {
			// Existing session with no folder info - show unknown
			let folderName = l10n.t('Unknown');
			if (this.workspaceService.getWorkspaceFolders().length === 1) {
				folderName = this.workspaceService.getWorkspaceFolderName(this.workspaceService.getWorkspaceFolders()[0]) || folderName;
			}
			options[REPOSITORY_OPTION_ID] = {
				id: '',
				name: folderName,
				icon: new vscode.ThemeIcon('folder'),
				locked: true
			};
		}
		if (worktreeProperties?.repositoryPath) {
			const branchName = worktreeProperties.branchName;
			const repoUri = vscode.Uri.file(worktreeProperties.repositoryPath);
			this._selectedRepoForBranches = { repoUri, headBranchName: branchName };

			options[BRANCH_OPTION_ID] = {
				id: branchName,
				name: branchName,
				icon: new vscode.ThemeIcon('git-branch'),
				locked: true
			};
		}
		if (isIsolationOptionFeatureEnabled(this.configurationService)) {
			const isWorktree = !!worktreeProperties;
			options[ISOLATION_OPTION_ID] = {
				id: isWorktree ? IsolationMode.Worktree : IsolationMode.Workspace,
				name: isWorktree ? l10n.t('Worktree') : l10n.t('Workspace'),
				icon: new vscode.ThemeIcon(isWorktree ? 'worktree' : 'folder'),
				locked: true
			};
		}

		// Ensure the branch option group is shown when we have a branch value but it's not displayed.
		if (options[BRANCH_OPTION_ID] && !this._displayedOptionIds.has(BRANCH_OPTION_ID)) {
			this.notifyProviderOptionsChange();
		}

		if (this.configurationService.getConfig(ConfigKey.Advanced.CLIForkSessionsEnabled)) {
			return {
				title,
				history,
				activeResponseCallback: undefined,
				requestHandler: undefined,
				options: options,
				forkHandler: async (sessionResource, requestTurn, token) => {
					const sessionId = SessionIdForCLI.parse(sessionResource);
					return this.forkSession(sessionId, requestTurn?.id, token);
				},
			};
		} else {
			return {
				title,
				history,
				activeResponseCallback: undefined,
				requestHandler: undefined,
				options: options,
			};
		}
	}

	private async forkSession(sessionId: string, requestId: string | undefined, token: CancellationToken): Promise<vscode.ChatSessionItem> {
		const folderInfo = await this.folderRepositoryManager.getFolderRepository(sessionId, undefined, token);
		const forkedSessionId = await this.sessionService.forkSession({ sessionId, requestId, workspace: folderInfo }, token);

		const items = await this.sessionItemProvider.provideChatSessionItems(token);
		const forkedSessionUri = SessionIdForCLI.getResource(forkedSessionId);
		const item = items.find(i => isEqual(i.resource, forkedSessionUri));
		if (!item) {
			throw new Error(`Failed to find session item for forked session ${forkedSessionId}`);
		}
		return item;
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

			const partialHistory = await this.sessionService.tryGetPartialSessionHistory(sessionId);
			if (partialHistory) {
				_invalidCopilotCLISessionIdsWithErrorMessage.set(sessionId, error.message || String(error));
				return partialHistory;
			}

			throw error;
		}
	}

	async provideChatSessionProviderOptions(): Promise<vscode.ChatSessionProviderOptions> {
		const optionGroups: vscode.ChatSessionProviderOptionGroup[] = [];

		if (this._selectedRepoForBranches && isIsolationOptionFeatureEnabled(this.configurationService)) {
			optionGroups.push({
				id: ISOLATION_OPTION_ID,
				name: l10n.t('Isolation'),
				description: l10n.t('Pick Isolation Mode'),
				items: [
					{ id: IsolationMode.Workspace, name: l10n.t('Workspace'), icon: new vscode.ThemeIcon('folder') },
					{ id: IsolationMode.Worktree, name: l10n.t('Worktree'), icon: new vscode.ThemeIcon('worktree') },
				]
			});
		}

		// Handle repository options based on workspace type
		if (this.isUntitledWorkspace()) {
			// For untitled workspaces, show last used repositories and "Open Repository..." command
			const repositories = await this.folderMruService.getRecentlyUsedFolders(CancellationToken.None);
			const items = folderMRUToChatProviderOptions(repositories);
			items.splice(MAX_MRU_ENTRIES); // Limit to max entries

			if (this._lastUsedFolderIdInUntitledWorkspace && !items.some(repo => repo.id === this._lastUsedFolderIdInUntitledWorkspace)) {
				const uri = Uri.file(this._lastUsedFolderIdInUntitledWorkspace);
				items.unshift(toWorkspaceFolderOptionItem(uri, basename(uri)));
			}

			const commands: vscode.Command[] = [];
			commands.push({
				command: OPEN_REPOSITORY_COMMAND_ID,
				title: l10n.t('Browse folders...')
			});

			optionGroups.push({
				id: REPOSITORY_OPTION_ID,
				name: l10n.t('Folder'),
				description: l10n.t('Pick Folder'),
				items,
				commands
			});
		} else {
			const repositories = this.getRepositoryOptionItems();
			if (repositories.length > 1) {
				optionGroups.push({
					id: REPOSITORY_OPTION_ID,
					name: l10n.t('Folder'),
					description: l10n.t('Pick Folder'),
					items: repositories
				});
			}
		}

		if (this._selectedRepoForBranches && (isBranchOptionFeatureEnabled(this.configurationService) || (await this.isWorktreeIsolationSelected()))) {
			const branchItems = await this.getBranchOptionItems(true);
			if (branchItems.length > 0) {
				optionGroups.push({
					id: BRANCH_OPTION_ID,
					name: l10n.t('Branch'),
					description: l10n.t('Pick Branch'),
					items: branchItems,
					// icon: new vscode.ThemeIcon('git-branch')
				});
			}
		}

		this._displayedOptionIds.clear();
		optionGroups.forEach(group => {
			this._displayedOptionIds.add(group.id);
		});
		return { optionGroups };
	}

	private _branchRepositoryOptions?: { repoUri: Uri; items: Promise<vscode.ChatSessionProviderOptionItem[]> };
	private async getBranchOptionItems(overrideListBranches = false): Promise<vscode.ChatSessionProviderOptionItem[]> {
		if (!this._selectedRepoForBranches) {
			return [];
		}

		if (!overrideListBranches && !isBranchOptionFeatureEnabled(this.configurationService)) {
			return [];
		}

		const { repoUri, headBranchName } = this._selectedRepoForBranches;
		if (!this._branchRepositoryOptions || !isEqual(repoUri, this._branchRepositoryOptions.repoUri)) {
			this._branchRepositoryOptions = {
				repoUri,
				items: this.getBranchOptionItemsForRepository(repoUri, headBranchName)
			};
		}
		return this._branchRepositoryOptions.items;
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

			for (const ref of localBranches) {
				const isHead = ref.name === headBranchName;
				const item: vscode.ChatSessionProviderOptionItem = {
					id: ref.name!,
					name: ref.name!,
					icon: new vscode.ThemeIcon('git-branch'),
					// default: isHead
				};
				if (isHead) {
					headItem = item;
				} else {
					items.push(item);
				}
			}

			if (headItem) {
				items.unshift(headItem);
			}

			return items;
		});
	}

	/**
	 * Check if the current workspace is untitled (has no workspace folders).
	 */
	private isUntitledWorkspace(): boolean {
		return this.workspaceService.getWorkspaceFolders().length === 0;
	}

	/**
	 * Check if the current session has worktree isolation selected.
	 * Used to determine whether the branch picker should be shown.
	 */
	private async isWorktreeIsolationSelected(): Promise<boolean> {
		if (!isIsolationOptionFeatureEnabled(this.configurationService)) {
			return true;
		}

		if (!this._currentSessionId) {
			return false;
		}

		const sessionId = this._currentSessionId;
		const cached = _sessionWorktreeIsolationCache.get(sessionId);
		if (typeof cached === 'boolean') {
			return cached;
		}

		if (isUntitledSessionId(sessionId)) {
			const isWorktree = _sessionIsolation.get(sessionId) === IsolationMode.Worktree;
			_sessionWorktreeIsolationCache.set(sessionId, isWorktree);
			return isWorktree;
		}

		if (_sessionIsolation.get(sessionId) === IsolationMode.Worktree) {
			_sessionWorktreeIsolationCache.set(sessionId, true);
			return true;
		}

		const folderInfo = await this.folderRepositoryManager.getFolderRepository(sessionId, undefined, CancellationToken.None);
		const isWorktree = !!folderInfo.worktreeProperties;
		_sessionWorktreeIsolationCache.set(sessionId, isWorktree);
		return isWorktree;
	}

	private getRepositoryOptionItems() {
		// Exclude worktrees from the repository list
		const repositories = this.gitService.repositories
			.filter(repository => repository.kind !== 'worktree')
			.filter(repository => {
				if (this.isUntitledWorkspace()) {
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


	// Handle option changes for a session (store current state in a map)
	async provideHandleOptionsChange(resource: Uri, updates: ReadonlyArray<vscode.ChatSessionOptionUpdate>, token: vscode.CancellationToken): Promise<void> {
		const sessionId = SessionIdForCLI.parse(resource);
		this._currentSessionId = sessionId;
		const wasBranchOptionShow = !!this._selectedRepoForBranches;
		let triggerProviderOptionsChange = false;
		for (const update of updates) {
			if (update.optionId === REPOSITORY_OPTION_ID && typeof update.value === 'string' && this.sessionItemProvider.isNewSession(sessionId)) {
				const folder = vscode.Uri.file(update.value);
				if (isEqual(folder, this._selectedRepoForBranches?.repoUri)) {
					continue;
				}

				_sessionBranch.delete(sessionId);

				if ((await checkPathExists(folder, this.fileSystem))) {
					this.trackLastUsedFolderInWelcomeView(folder);
					this.folderRepositoryManager.setNewSessionFolder(sessionId, folder);

					// Check if the selected folder is a git repo to show/hide branch dropdown
					const repoInfo = await this.folderRepositoryManager.getRepositoryInfo(folder, token);
					this._selectedRepoForBranches = repoInfo.repository
						? { repoUri: repoInfo.repository, headBranchName: repoInfo.headBranchName }
						: undefined;

					// When switching to a new repository, we need to update the branch selection for the session. Push an
					// update to the session to select the first branch in the new repo and then we will fire an event so
					// that the branches from the new repository are loaded in the dropdown.
					if (this._selectedRepoForBranches && updates.length === 1) {
						const sessionChanges: { optionId: string; value: string | vscode.ChatSessionProviderOptionItem }[] = [];

						const branchItems = await this.getBranchOptionItems();
						if (branchItems.length > 0) {
							const branchItem = branchItems[0];
							_sessionBranch.set(sessionId, branchItem.id);

							sessionChanges.push({
								optionId: BRANCH_OPTION_ID,
								value: {
									id: branchItem.id,
									name: branchItem.name,
									icon: new vscode.ThemeIcon('git-branch')
								}
							});
						}

						if (sessionChanges.length > 0) {
							this.notifySessionOptionsChange(resource, sessionChanges);
						}

						// Update all options
						triggerProviderOptionsChange = true;
					}
				} else {
					await this.folderMruService.deleteRecentlyUsedFolder(folder);
					const message = l10n.t('The path \'{0}\' does not exist on this computer.', folder.fsPath);
					vscode.window.showErrorMessage(l10n.t('Path does not exist'), { modal: true, detail: message });
					const defaultRepo = await this.getDefaultUntitledSessionRepositoryOption(sessionId, token);
					if (defaultRepo && !isEqual(folder, defaultRepo)) {
						this.trackLastUsedFolderInWelcomeView(defaultRepo);
						this.folderRepositoryManager.setNewSessionFolder(sessionId, defaultRepo);
						const changes: { optionId: string; value: string }[] = [];
						changes.push({ optionId: REPOSITORY_OPTION_ID, value: defaultRepo.fsPath });
						this.notifySessionOptionsChange(resource, changes);
					}
					triggerProviderOptionsChange = true;
					this._selectedRepoForBranches = undefined;
				}
			} else if (update.optionId === BRANCH_OPTION_ID) {
				if (typeof update.value === 'string' && update.value === _sessionBranch.get(sessionId)) {
					continue;
				}
				_sessionBranch.set(sessionId, update.value);
			} else if (update.optionId === ISOLATION_OPTION_ID) {
				if (typeof update.value === 'string' && update.value === _sessionIsolation.get(sessionId)) {
					continue;
				}
				_sessionIsolation.set(sessionId, update.value as IsolationMode);
				if (typeof update.value === 'string') {
					void this.context.globalState.update(LAST_USED_ISOLATION_OPTION_KEY, update.value);
				}
				triggerProviderOptionsChange = true;

				// When switching to worktree, push a default branch selection to the session
				// so the branch picker renders. When switching to workspace, remove it.
				const sessionChanges: { optionId: string; value: string | vscode.ChatSessionProviderOptionItem }[] = [];
				if (update.value === IsolationMode.Worktree && isBranchOptionFeatureEnabled(this.configurationService)) {
					const branchItems = await this.getBranchOptionItems();
					if (branchItems.length > 0) {
						const branch = _sessionBranch.get(sessionId) ?? branchItems[0].id;
						_sessionBranch.set(sessionId, branch);
						const branchItem = branchItems.find(b => b.id === branch) ?? branchItems[0];
						sessionChanges.push({
							optionId: BRANCH_OPTION_ID,
							value: {
								id: branchItem.id,
								name: branchItem.name,
								icon: new vscode.ThemeIcon('git-branch')
							}
						});
					}
				} else if (update.value === 'workspace') {
					_sessionBranch.delete(sessionId);
				}
				if (sessionChanges.length > 0) {
					this.notifySessionOptionsChange(resource, sessionChanges);
				}
			}
		}
		const isBranchOptionShow = !!this._selectedRepoForBranches;
		if (wasBranchOptionShow !== isBranchOptionShow || triggerProviderOptionsChange) {
			this.notifyProviderOptionsChange();
		}
	}

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

export class CopilotCLIChatSessionParticipant extends Disposable {

	constructor(
		private readonly contentProvider: CopilotCLIChatSessionContentProvider,
		private readonly promptResolver: CopilotCLIPromptResolver,
		private readonly sessionItemProvider: CopilotCLIChatSessionItemProvider,
		private readonly cloudSessionProvider: CopilotCloudSessionsProvider | undefined,
		private readonly branchNameGenerator: GitBranchNameGenerator | undefined,
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
		@ICustomSessionTitleService private readonly customSessionTitleService: ICustomSessionTitleService,
		@IOctoKitService private readonly octoKitService: IOctoKitService,
	) {
		super();
	}

	createHandler(): ChatExtendedRequestHandler {
		return this.handleRequest.bind(this);
	}

	private readonly contextForRequest = new Map<string, {
		prompt: string; attachments: Attachment[]; model?: {
			model: string;
			reasoningEffort?: string | undefined;
		};
	}>();

	/**
	 * Map to track pending requests for untitled sessions.
	 * Key = Untitled Session Id
	 * Value = Map of Request Id to the Promise of the request being handled
	 * So if we have multiple requests (can happen when steering) for the same untitled session.
	 */
	private readonly pendingRequestsForUntitledSessions = new Map<string, Map<string, Promise<vscode.ChatResult | void>>>();

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
			if (context.chatSessionContext) {
				const { chatSessionContext } = context;
				const { resource } = chatSessionContext.chatSessionItem;
				const id = SessionIdForCLI.parse(resource);
				const isUntitled = this.sessionItemProvider.isNewSession(id);
				if (isUntitled) {
					const promises = this.pendingRequestsForUntitledSessions.get(id) ?? new Map<string, Promise<vscode.ChatResult | void>>();
					promises.set(request.id, handled);
					this.pendingRequestsForUntitledSessions.set(id, promises);
				}
			}
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
		const isUntitled = String(chatSessionContext?.isUntitled);
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
		let { chatSessionContext } = context;
		const disposables = new DisposableStore();
		let sessionId: string | undefined = undefined;
		let sessionParentId: string | undefined = undefined;
		let sdkSessionId: string | undefined = undefined;
		try {

			const initialOptions = chatSessionContext?.initialSessionOptions;
			if (initialOptions && chatSessionContext) {
				if (initialOptions.length > 0) {
					const sessionResource = chatSessionContext.chatSessionItem.resource;
					const sessionId = SessionIdForCLI.parse(sessionResource);
					for (const opt of initialOptions) {
						const value = typeof opt.value === 'string' ? opt.value : opt.value.id;
						if (opt.optionId === REPOSITORY_OPTION_ID && value && this.sessionItemProvider.isNewSession(sessionId)) {
							this.contentProvider.trackLastUsedFolderInWelcomeView(vscode.Uri.file(value));
							this.folderRepositoryManager.setNewSessionFolder(sessionId, vscode.Uri.file(value));
						} else if (opt.optionId === BRANCH_OPTION_ID && value) {
							_sessionBranch.set(sessionId, value);
						} else if (opt.optionId === ISOLATION_OPTION_ID && value) {
							_sessionIsolation.set(sessionId, value as IsolationMode);
						} else if (opt.optionId === PARENT_SESSION_OPTION_ID && value) {
							sessionParentId = value;
						}
					}
				}
			}

			if (!chatSessionContext && SessionIdForCLI.isCLIResource(request.sessionResource)) {
				/**
				 * Work around for bug in core, context cannot be empty, but it is.
				 * This happens when we delegate from another chat and start a background agent,
				 * but for some reason the context is lost when the request is actually handled, as a result it gets treated as a new delegating request.
				 * & then we end up in an inifinite loop of delegating requests.
				 */
				const id = SessionIdForCLI.parse(request.sessionResource);
				if (this.contextForRequest.has(id)) {
					chatSessionContext = {
						chatSessionItem: {
							label: request.prompt,
							resource: request.sessionResource,
						},
						isUntitled: false,
						initialSessionOptions: undefined,
						inputState: {
							groups: [],
							sessionResource: undefined,
							onDidChange: Event.None
						}
					};
					context = {
						chatSessionContext,
						history: [],
						yieldRequested: false
					} satisfies vscode.ChatContext;
				}
			}

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

			if (!chatSessionContext || !SessionIdForCLI.isCLIResource(request.sessionResource)) {
				// Delegating from another chat session
				return await this.handleDelegationFromAnotherChat(request, undefined, request.references, context, stream, authInfo, token);
			}

			const { resource } = chatSessionContext.chatSessionItem;
			const id = SessionIdForCLI.parse(resource);
			sessionId = id;
			const isUntitled = chatSessionContext.isUntitled;
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

			// Check if we have context stored for this request
			const contextForRequest = this.contextForRequest.get(sessionId);
			this.contextForRequest.delete(sessionId);
			const [model, agent] = await Promise.all([
				contextForRequest?.model ? Promise.resolve(contextForRequest.model) : this.getModelId(request, token),
				this.getAgent(id, request, token),
			]);

			const requestTurn = new ChatRequestTurn2(request.prompt ?? '', request.command, [], '', [], [], undefined, undefined, undefined);
			const fakeContext: vscode.ChatContext = {
				history: [requestTurn],
				yieldRequested: false,
			};
			const newBranch = (isUntitled && request.prompt && this.branchNameGenerator) ? this.branchNameGenerator.generateBranchName(fakeContext, token) : undefined;

			const sessionResult = await this.getOrCreateSession(request, chatSessionContext, stream, { model, agent, newBranch, sessionParentId }, disposables, token);
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
			if (isUntitled) {
				void this.lockRepoOptionForSession(context, token);
				this.customSessionTitleService.generateSessionTitle(session.object.sessionId, request, token).catch(ex => this.logService.error(ex, 'Failed to generate custom session title'));
			}
			const requestsForSession = this.pendingRequestBySession.get(session.object.sessionId) ?? new Set<vscode.ChatRequest>();
			requestsForSession.add(request);
			this.pendingRequestBySession.set(session.object.sessionId, requestsForSession);

			if (request.command === 'delegate') {
				await this.handleDelegationToCloud(session.object, request, context, stream, token);
			} else if (contextForRequest) {
				// This is a request that was created in createCLISessionAndSubmitRequest with attachments already resolved.
				const { prompt, attachments } = contextForRequest;
				await session.object.handleRequest(request, { prompt }, attachments, model, authInfo, token);
				await this.commitWorktreeChangesIfNeeded(request, session.object, token);
			} else if (request.command && !request.prompt && !isUntitled) {
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
				await session.object.handleRequest(request, { prompt }, attachments, model, authInfo, token);
				await this.commitWorktreeChangesIfNeeded(request, session.object, token);
			}

			if (isUntitled && !token.isCancellationRequested) {
				// Its possible the user tried steering, in that case, we should NOT swap the session item because the session.
				// Else the messages may get lost (wait CHECK_FOR_STEERING_DELAYms to check if we have pending steering requests)
				await new Promise<void>(resolve => disposableTimeout(() => resolve(), CHECK_FOR_STEERING_DELAY, this._store));
				const pendingRequests = this.pendingRequestsForUntitledSessions.get(id);
				if (pendingRequests) {
					pendingRequests.delete(request.id);
					// If we have more requests, that means we had the original request as well as at least one another steering request.
					// Lets not swap anything here, until all pending requests have been completed.
					if (pendingRequests.size > 0) {
						return;
					}
				}

				// Delete old information stored for untitled session id.
				_sessionBranch.delete(id);
				_sessionIsolation.delete(id);
				this.sessionItemProvider.untitledSessionIdMapping.delete(id);
				this.sessionItemProvider.sdkToUntitledUriMapping.delete(session.object.sessionId);
				this.folderRepositoryManager.deleteNewSessionFolder(id);
				this.sessionItemProvider.swap(chatSessionContext.chatSessionItem, { resource: SessionIdForCLI.getResource(session.object.sessionId), label: request.prompt });
			}
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
			if (chatSessionContext?.chatSessionItem.resource) {
				this.sessionItemProvider.notifySessionsChange();
			}
			disposables.dispose();
		}
	}

	private async lockRepoOptionForSession(context: vscode.ChatContext, token: vscode.CancellationToken) {
		const { chatSessionContext } = context;
		if (!chatSessionContext?.isUntitled) {
			return;
		}
		const { resource } = chatSessionContext.chatSessionItem;
		// If we have a real session id that was mapped to this untitled session, then use that.
		// This way we can get the latest information associated with the real session.
		const parsedId = SessionIdForCLI.parse(resource);
		const id = this.sessionItemProvider.untitledSessionIdMapping.get(parsedId) ?? parsedId;
		const folderInfo = await this.folderRepositoryManager.getFolderRepository(id, undefined, token);
		if (folderInfo.folder) {
			const folderName = basename(folderInfo.folder);
			const option = folderInfo.repository ? toRepositoryOptionItem(folderInfo.repository) : toWorkspaceFolderOptionItem(folderInfo.folder, folderName);
			const changes: { optionId: string; value: string | vscode.ChatSessionProviderOptionItem }[] = [
				{ optionId: REPOSITORY_OPTION_ID, value: { ...option, locked: true } }
			];
			// Also lock the branch option
			const selectedBranch = folderInfo.worktreeProperties?.branchName ?? _sessionBranch.get(id);
			if (selectedBranch && isBranchOptionFeatureEnabled(this.configurationService)) {
				changes.push({
					optionId: BRANCH_OPTION_ID,
					value: {
						id: selectedBranch,
						name: selectedBranch,
						icon: new vscode.ThemeIcon('git-branch'),
						locked: true
					}
				});
			}
			// Also lock the isolation option if set
			const selectedIsolation = _sessionIsolation.get(id);
			if (selectedIsolation && isIsolationOptionFeatureEnabled(this.configurationService)) {
				changes.push({
					optionId: ISOLATION_OPTION_ID,
					value: {
						id: selectedIsolation,
						name: selectedIsolation === IsolationMode.Worktree
							? l10n.t('Worktree')
							: l10n.t('Workspace'),
						icon: new vscode.ThemeIcon(selectedIsolation === IsolationMode.Worktree ? 'worktree' : 'folder'),
						locked: true
					}
				});
			}
			this.contentProvider.notifySessionOptionsChange(resource, changes);
		}
	}

	private async unlockRepoOptionForSession(context: vscode.ChatContext, token: vscode.CancellationToken) {
		const { chatSessionContext } = context;
		if (!chatSessionContext?.isUntitled) {
			return;
		}
		const { resource } = chatSessionContext.chatSessionItem;
		const id = SessionIdForCLI.parse(resource);
		const folderInfo = await this.folderRepositoryManager.getFolderRepository(id, undefined, token);
		if (folderInfo.folder) {
			const option = folderInfo.repository?.fsPath ?? folderInfo.folder.fsPath;
			const changes: { optionId: string; value: string }[] = [
				{ optionId: REPOSITORY_OPTION_ID, value: option }
			];
			// Also unlock the branch option if a branch was selected
			const selectedBranch = _sessionBranch.get(id);
			if (selectedBranch && isBranchOptionFeatureEnabled(this.configurationService)) {
				changes.push({ optionId: BRANCH_OPTION_ID, value: selectedBranch });
			}
			// Also unlock the isolation option if set
			const selectedIsolation = _sessionIsolation.get(id);
			if (selectedIsolation && isIsolationOptionFeatureEnabled(this.configurationService)) {
				changes.push({ optionId: ISOLATION_OPTION_ID, value: selectedIsolation });
			}
			this.contentProvider.notifySessionOptionsChange(resource, changes);
		}
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
				prState = prResult?.state ?? prUrl ? 'open' : '';
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
			this.sessionItemProvider.notifySessionsChange();
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.logService.error(err, `Failed to persist pull request metadata for session ${sessionId}`);
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

	private async getOrCreateSession(request: vscode.ChatRequest, chatSessionContext: vscode.ChatSessionContext, stream: vscode.ChatResponseStream, options: { model: { model: string; reasoningEffort?: string } | undefined; agent: SweCustomAgent | undefined; newBranch?: Promise<string | undefined>; sessionParentId?: string }, disposables: DisposableStore, token: vscode.CancellationToken): Promise<{ session: IReference<ICopilotCLISession> | undefined; trusted: boolean }> {
		const { resource } = chatSessionContext.chatSessionItem;
		const existingSessionId = this.sessionItemProvider.untitledSessionIdMapping.get(SessionIdForCLI.parse(resource));
		const id = existingSessionId ?? SessionIdForCLI.parse(resource);
		const isNewSession = chatSessionContext.isUntitled && !existingSessionId;

		const { workspaceInfo, cancelled, trusted } = await this.getOrInitializeWorkingDirectory(chatSessionContext, stream, request.toolInvocationToken, token, options.newBranch);
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
			await this.sessionService.createSession({ model: model?.model, reasoningEffort: model?.reasoningEffort, workspace: workspaceInfo, agent, debugTargetSessionIds, mcpServerMappings, sessionParentId: options.sessionParentId }, token) :
			await this.sessionService.getSession({ sessionId: id, model: model?.model, reasoningEffort: model?.reasoningEffort, workspace: workspaceInfo, agent, debugTargetSessionIds, mcpServerMappings }, token);
		this.sessionItemProvider.notifySessionsChange();
		// TODO @DonJayamanne We need to refresh to add this new session, but we need a label.
		// So when creating a session we need a dummy label (or an initial prompt).

		if (!session) {
			stream.warning(l10n.t('Chat session not found.'));
			return { session: undefined, trusted };
		}
		this.logService.info(`Using Copilot CLI session: ${session.object.sessionId} (isNewSession: ${isNewSession}, isolationEnabled: ${isIsolationEnabled(workspaceInfo)}, workingDirectory: ${workingDirectory}, worktreePath: ${worktreeProperties?.worktreePath})`);
		if (isNewSession) {
			this.sessionItemProvider.untitledSessionIdMapping.set(id, session.object.sessionId);
			this.sessionItemProvider.sdkToUntitledUriMapping.set(session.object.sessionId, resource);
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

	private async getModelId(request: vscode.ChatRequest | undefined, token: vscode.CancellationToken): Promise<{ model: string; reasoningEffort?: string } | undefined> {
		const promptFile = request ? await this.getPromptInfoFromRequest(request, token) : undefined;
		const model = promptFile?.header?.model ? await getModelFromPromptFile(promptFile.header.model, this.copilotCLIModels) : undefined;
		if (token.isCancellationRequested) {
			return undefined;
		}
		if (model) {
			return { model };
		}
		// Get model from request.
		const preferredModelInRequest = request?.model?.id ? await this.copilotCLIModels.resolveModel(request.model.id) : undefined;
		if (preferredModelInRequest) {
			const reasoningEffort = isReasoningEffortFeatureEnabled(this.configurationService) ? request?.modelConfiguration?.[COPILOT_CLI_REASONING_EFFORT_PROPERTY] : undefined;
			return {
				model: preferredModelInRequest,
				reasoningEffort: typeof reasoningEffort === 'string' && reasoningEffort ? reasoningEffort : undefined
			};
		}
		const defaultModel = await this.copilotCLIModels.getDefaultModel();
		if (!defaultModel) {
			return undefined;
		}
		return { model: defaultModel };
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
		stream: vscode.ChatResponseStream,
		toolInvocationToken: vscode.ChatParticipantToolToken,
		token: vscode.CancellationToken,
		newBranch?: Promise<string | undefined>
	): Promise<{
		workspaceInfo: IWorkspaceInfo;
		cancelled: boolean;
		trusted: boolean;
	}> {
		let folderInfo: FolderRepositoryInfo;
		if (chatSessionContext) {
			const existingSessionId = this.sessionItemProvider.untitledSessionIdMapping.get(SessionIdForCLI.parse(chatSessionContext.chatSessionItem.resource));
			const id = existingSessionId ?? SessionIdForCLI.parse(chatSessionContext.chatSessionItem.resource);
			const isNewSession = chatSessionContext.isUntitled && !existingSessionId;

			if (isNewSession) {
				// Use FolderRepositoryManager to initialize folder/repository with worktree creation
				const branch = _sessionBranch.get(id);
				const isolation = _sessionIsolation.get(id) ?? undefined;
				folderInfo = await this.folderRepositoryManager.initializeFolderRepository(id, { stream, toolInvocationToken, branch: branch ?? undefined, isolation, folder: undefined, newBranch }, token);
			} else {
				// Existing session - use getFolderRepository for resolution with trust check
				folderInfo = await this.folderRepositoryManager.getFolderRepository(id, { promptForTrust: true, stream }, token);
			}
		} else {
			// No chat session context (e.g., delegation) - initialize with active repository
			folderInfo = await this.folderRepositoryManager.initializeFolderRepository(undefined, { stream, toolInvocationToken, isolation: undefined, folder: undefined }, token);
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
			this.getOrInitializeWorkingDirectory(undefined, stream, request.toolInvocationToken, token),
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
		const session = await this.sessionService.createSession({ workspace: workspaceInfo, agent, model: model?.model, reasoningEffort: model?.reasoningEffort, mcpServerMappings }, token);
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

		this.contextForRequest.set(session.object.sessionId, { prompt, attachments, model });
		this.sessionItemProvider.notifySessionsChange();
		// TODO @DonJayamanne I don't think we need to refresh the list of session here just yet, or perhaps we do,
		// Same as getOrCreate session, we need a dummy title or the initial prompt to show in the sessions list.
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
	copilotcliSessionItemProvider: CopilotCLIChatSessionItemProvider,
	copilotCLISessionService: ICopilotCLISessionService,
	copilotCLIWorktreeManagerService: IChatSessionWorktreeService,
	gitService: IGitService,
	gitExtensionService: IGitExtensionService,
	toolsService: IToolsService,
	copilotCliWorkspaceSession: IChatSessionWorkspaceFolderService,
	contentProvider: CopilotCLIChatSessionContentProvider,
	folderRepositoryManager: IFolderRepositoryManager,
	cliFolderMruService: IChatFolderMruService,
	envService: INativeEnvService,
	fileSystemService: IFileSystemService,
	logService: ILogService
): IDisposable {
	const disposableStore = new DisposableStore();
	async function deleteSessionById(sessionId: string): Promise<void> {
		const worktree = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
		const worktreePath = await copilotCLIWorktreeManagerService.getWorktreePath(sessionId);

		await copilotCLISessionService.deleteSession(sessionId);
		await copilotCliWorkspaceSession.deleteTrackedWorkspaceFolder(sessionId);

		if (worktreePath) {
			const worktreeExists = await fileSystemService.stat(worktreePath).then(() => true, () => false);
			if (worktreeExists) {
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
		}
	}
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.delete', async (sessionItem?: vscode.ChatSessionItem) => {
		if (sessionItem?.resource) {
			const id = SessionIdForCLI.parse(sessionItem.resource);
			const sessionId = copilotcliSessionItemProvider.untitledSessionIdMapping.get(id) ?? id;
			const worktreePath = await copilotCLIWorktreeManagerService.getWorktreePath(sessionId);

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
				await deleteSessionById(sessionId);
				copilotcliSessionItemProvider.notifySessionsChange();
			}
		}
	}));
	disposableStore.add(vscode.commands.registerCommand('agents.github.copilot.cli.deleteSessions', async (sessionItems?: vscode.ChatSessionItem[], options?: { skipConfirmation?: boolean }) => {
		if (!sessionItems?.length) {
			return;
		}

		if (!options?.skipConfirmation) {
			const deleteLabel = l10n.t('Delete');
			const confirmMessage = sessionItems.length === 1
				? l10n.t('Are you sure you want to delete the session?')
				: l10n.t('Are you sure you want to delete {0} sessions?', sessionItems.length);
			const result = await vscode.window.showWarningMessage(
				confirmMessage,
				{ modal: true },
				deleteLabel
			);
			if (result !== deleteLabel) {
				return;
			}
		}

		for (const sessionItem of sessionItems) {
			if (sessionItem.resource) {
				const id = SessionIdForCLI.parse(sessionItem.resource);
				const sessionId = copilotcliSessionItemProvider.untitledSessionIdMapping.get(id) ?? id;
				await deleteSessionById(sessionId);
			}
		}

		copilotcliSessionItemProvider.notifySessionsChange();
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.resumeInTerminal', async (sessionItem?: vscode.ChatSessionItem) => {
		if (sessionItem?.resource) {
			await copilotcliSessionItemProvider.resumeCopilotCLISessionInTerminal(sessionItem);
		}
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.rename', async (sessionItem?: vscode.ChatSessionItem) => {
		if (!sessionItem?.resource) {
			return;
		}
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
				const id = SessionIdForCLI.parse(sessionItem.resource);
				const sessionId = copilotcliSessionItemProvider.untitledSessionIdMapping.get(id) ?? id;
				await copilotCLISessionService.renameSession(sessionId, trimmedTitle);
				copilotcliSessionItemProvider.notifySessionsChange();
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
			const sessionId = copilotcliSessionItemProvider.untitledSessionIdMapping.get(id) ?? id;
			await copilotCLISessionService.renameSession(sessionId, trimmedTitle);
			copilotcliSessionItemProvider.notifySessionsChange();
		}
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.newSession', async () => {
		await copilotcliSessionItemProvider.createCopilotCLITerminal('editor', l10n.t('Copilot CLI'));
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.newSessionToSide', async () => {
		await copilotcliSessionItemProvider.createCopilotCLITerminal('editorBeside', l10n.t('Copilot CLI'));
	}));
	disposableStore.add(vscode.commands.registerCommand(OPEN_IN_COPILOT_CLI_COMMAND_ID, async (sourceControlContext?: unknown) => {
		const rootUri = getSourceControlRootUri(sourceControlContext);
		await copilotcliSessionItemProvider.createCopilotCLITerminal('editor', l10n.t('Copilot CLI'), rootUri?.fsPath);
	}));
	disposableStore.add(vscode.commands.registerCommand('github.copilot.cli.sessions.openWorktreeInNewWindow', async (sessionItem?: vscode.ChatSessionItem) => {
		if (!sessionItem?.resource) {
			return;
		}

		const id = SessionIdForCLI.parse(sessionItem.resource);
		const sessionId = copilotcliSessionItemProvider.untitledSessionIdMapping.get(id) ?? id;
		const folderInfo = await folderRepositoryManager.getFolderRepository(sessionId, undefined, CancellationToken.None);
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
		const sessionId = copilotcliSessionItemProvider.untitledSessionIdMapping.get(id) ?? id;
		const folderInfo = await folderRepositoryManager.getFolderRepository(sessionId, undefined, CancellationToken.None);
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
		const sessionId = copilotcliSessionItemProvider.untitledSessionIdMapping.get(id) ?? id;
		const worktreeProperties = await copilotCLIWorktreeManagerService.getWorktreeProperties(sessionId);
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
		const mruItems = await cliFolderMruService.getRecentlyUsedFolders(CancellationToken.None);

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
			const message = l10n.t('The path \'{0}\' does not exist on this computer.', selectedFolderUri.fsPath);
			vscode.window.showErrorMessage(l10n.t('Path does not exist'), { modal: true, detail: message });
			return;
		}

		const sessionId = SessionIdForCLI.parse(sessionItemResource);
		contentProvider.trackLastUsedFolderInWelcomeView(selectedFolderUri);
		folderRepositoryManager.setNewSessionFolder(sessionId, selectedFolderUri);

		// Notify VS Code that the option changed
		contentProvider.notifySessionOptionsChange(sessionItemResource, [{
			optionId: REPOSITORY_OPTION_ID,
			value: selectedFolderUri.fsPath
		}]);

		// Notify that provider options have changed so the dropdown updates
		contentProvider.notifyProviderOptionsChange();

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
			copilotcliSessionItemProvider.notifySessionsChange();
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
			baseBranchName = worktreeProperties.baseBranchName;
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

		copilotcliSessionItemProvider.notifySessionsChange();
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

		const repositoryProperties = repository.state.HEAD?.name
			? {
				repositoryPath: repository.rootUri.fsPath,
				branchName: repository.state.HEAD.name
			} satisfies RepositoryProperties
			: undefined;

		await copilotCliWorkspaceSession.trackSessionWorkspaceFolder(sessionId, workspaceFolder.fsPath, repositoryProperties);
		copilotCliWorkspaceSession.clearWorkspaceChanges(sessionId);

		copilotcliSessionItemProvider.notifySessionsChange();
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
			copilotcliSessionItemProvider.notifySessionsChange();
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
