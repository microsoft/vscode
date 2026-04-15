/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ChatExtendedRequestHandler } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { INativeEnvService } from '../../../platform/env/common/envService';
import { IGitService } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { basename } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { ClaudeFolderInfo } from '../claude/common/claudeFolderInfo';
import { ClaudeSessionUri } from '../claude/common/claudeSessionUri';
import { ClaudeAgentManager } from '../claude/node/claudeCodeAgent';
import { IClaudeCodeSdkService } from '../claude/node/claudeCodeSdkService';
import { parseClaudeModelId } from '../claude/node/claudeModelId';
import { IClaudeSessionStateService } from '../claude/common/claudeSessionStateService';
import { IClaudeCodeSessionService } from '../claude/node/sessionParser/claudeCodeSessionService';
import { IClaudeCodeSessionInfo } from '../claude/node/sessionParser/claudeSessionSchema';
import { IClaudeSlashCommandService } from '../claude/vscode-node/claudeSlashCommandService';
import { FolderRepositoryMRUEntry, IFolderRepositoryManager } from '../common/folderRepositoryManager';
import { buildChatHistory } from './chatHistoryBuilder';

const permissionModes: ReadonlySet<string> = new Set<PermissionMode>(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk']);

function isPermissionMode(value: string): value is PermissionMode {
	return permissionModes.has(value);
}

// Import the tool permission handlers
import '../claude/vscode-node/toolPermissionHandlers/index';

// Import the MCP server contributors to trigger self-registration
import '../claude/vscode-node/mcpServers/index';

const PERMISSION_MODE_OPTION_ID = 'permissionMode';
const FOLDER_OPTION_ID = 'folder';
const MAX_MRU_ENTRIES = 10;

export class ClaudeChatSessionContentProvider extends Disposable implements vscode.ChatSessionContentProvider {
	private readonly _onDidChangeChatSessionOptions = this._register(new Emitter<vscode.ChatSessionOptionChangeEvent>());
	readonly onDidChangeChatSessionOptions = this._onDidChangeChatSessionOptions.event;

	private readonly _onDidChangeChatSessionProviderOptions = this._register(new Emitter<void>());
	readonly onDidChangeChatSessionProviderOptions = this._onDidChangeChatSessionProviderOptions.event;

	// Track the most recently used permission mode across sessions for new session defaults
	private _lastUsedPermissionMode: PermissionMode = 'acceptEdits';

	private readonly _controller: ClaudeChatSessionItemController;
	constructor(
		private readonly claudeAgentManager: ClaudeAgentManager,
		@IClaudeCodeSessionService private readonly sessionService: IClaudeCodeSessionService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IClaudeSlashCommandService private readonly slashCommandService: IClaudeSlashCommandService,
		@IFolderRepositoryManager private readonly folderRepositoryManager: IFolderRepositoryManager,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@IGitService gitService: IGitService,
		@IClaudeCodeSdkService sdkService: IClaudeCodeSdkService,
		@ILogService logService: ILogService,
	) {
		super();
		this._controller = this._register(new ClaudeChatSessionItemController(sessionService, workspaceService, gitService, sdkService, logService));

		// Listen for configuration changes to update available options
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions.fullyQualifiedId)) {
				this._onDidChangeChatSessionProviderOptions.fire();
			}
		}));

		// Listen for workspace folder changes to update folder options
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			this._onDidChangeChatSessionProviderOptions.fire();
		}));

		// Listen for state changes and notify UI only if value actually changed from local selection
		this._register(this.sessionStateService.onDidChangeSessionState(e => {
			const updates: { optionId: string; value: string }[] = [];
			const existingMode = this._controller.getMetadata(e.sessionId)?.permissionMode;
			if (e.permissionMode !== undefined && e.permissionMode !== existingMode) {
				updates.push({ optionId: PERMISSION_MODE_OPTION_ID, value: e.permissionMode });
			}

			if (updates.length > 0) {
				const resource = ClaudeSessionUri.forSessionId(e.sessionId);
				this._onDidChangeChatSessionOptions.fire({ resource, updates });
			}
		}));
	}

	/**
	 * Gets the permission mode for a session
	 */
	public getPermissionModeForSession(sessionId: string): PermissionMode {
		return this._controller.getMetadata(sessionId)?.permissionMode ?? this.sessionStateService.getPermissionModeForSession(sessionId);
	}

	/**
	 * Resolves the cwd and additionalDirectories for a session.
	 *
	 * - Single-root workspace: cwd is the one folder, no additionalDirectories
	 * - Multi-root workspace: cwd is the selected folder, additionalDirectories are the rest
	 * - Empty workspace: cwd is the selected MRU folder, no additionalDirectories
	 */
	public async getFolderInfoForSession(sessionId: string): Promise<ClaudeFolderInfo> {
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();

		if (workspaceFolders.length === 1) {
			return {
				cwd: workspaceFolders[0].fsPath,
				additionalDirectories: [],
			};
		}

		// Multi-root or empty workspace: use the selected folder
		const selectedFolder = this._controller.getMetadata(sessionId)?.cwd;

		if (workspaceFolders.length > 1) {
			const cwd = selectedFolder?.fsPath ?? workspaceFolders[0].fsPath;
			const additionalDirectories = workspaceFolders
				.map(f => f.fsPath)
				.filter(p => p !== cwd);
			return { cwd, additionalDirectories };
		}

		// Empty workspace
		if (selectedFolder) {
			return {
				cwd: selectedFolder.fsPath,
				additionalDirectories: [],
			};
		}

		// Fallback for empty workspace with no selection: try MRU
		const mru = await this.folderRepositoryManager.getFolderMRU();
		if (mru.length > 0) {
			return {
				cwd: mru[0].folder.fsPath,
				additionalDirectories: [],
			};
		}

		// No folder available at all — fall back to the user's home directory
		return {
			cwd: this.envService.userHome.fsPath,
			additionalDirectories: [],
		};
	}

	// #region Folder Option Helpers

	private _isEmptyWorkspace(): boolean {
		return this.workspaceService.getWorkspaceFolders().length === 0;
	}

	private async _getFolderOptionItems(): Promise<vscode.ChatSessionProviderOptionItem[]> {
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();

		if (this._isEmptyWorkspace()) {
			const mruEntries = await this.folderRepositoryManager.getFolderMRU();
			return mruToFolderOptionItems(mruEntries).slice(0, MAX_MRU_ENTRIES);
		}

		return workspaceFolders.map(folder => ({
			id: folder.fsPath,
			name: this.workspaceService.getWorkspaceFolderName(folder),
			icon: new vscode.ThemeIcon('folder'),
		}));
	}

	private async _getDefaultFolderForSession(sessionId: string): Promise<URI | undefined> {
		// Check in-memory selection first
		const selected = this._controller.getMetadata(sessionId)?.cwd;
		if (selected) {
			return selected;
		}

		const defaultFolder = await this._getDefaultFolder();
		if (defaultFolder) {
			this._controller.setMetadata(sessionId, { cwd: defaultFolder });
		}
		return defaultFolder;
	}

	private async _getDefaultFolder(): Promise<URI | undefined> {
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length > 0) {
			return workspaceFolders[0];
		}

		const mru = await this.folderRepositoryManager.getFolderMRU();
		if (mru.length > 0) {
			return mru[0].folder;
		}

		// No suitable default folder found
		return undefined;
	}

	// #endregion

	// #region Chat Participant Handler

	createHandler(): ChatExtendedRequestHandler {
		return async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<vscode.ChatResult | void> => {
			const { chatSessionContext } = context;
			if (!chatSessionContext) {
				/* Via @claude */
				// TODO: Think about how this should work
				stream.markdown(vscode.l10n.t("Start a new Claude Agent session"));
				stream.button({ command: `workbench.action.chat.openNewSessionEditor.${ClaudeSessionUri.scheme}`, title: vscode.l10n.t("Start Session") });
				return {};
			}

			// Try to handle as a slash command first
			const slashResult = await this.slashCommandService.tryHandleCommand(request, stream, token);
			if (slashResult.handled) {
				return slashResult.result ?? {};
			}

			const effectiveSessionId = ClaudeSessionUri.getSessionId(chatSessionContext.chatSessionItem.resource);
			const yieldRequested = () => context.yieldRequested;

			// Determine whether this is a new session by checking if a session
			// already exists on disk via the session service.
			const sessionUri = ClaudeSessionUri.forSessionId(effectiveSessionId);
			const existingSession = await this.sessionService.getSession(sessionUri, token);
			const isNewSession = !existingSession;

			const modelId = parseClaudeModelId(request.model.id);
			const permissionMode = this.getPermissionModeForSession(effectiveSessionId);
			const folderInfo = await this.getFolderInfoForSession(effectiveSessionId);

			// Commit UI state to session state service before invoking agent manager
			this.sessionStateService.setModelIdForSession(effectiveSessionId, modelId);
			this.sessionStateService.setPermissionModeForSession(effectiveSessionId, permissionMode);
			this.sessionStateService.setFolderInfoForSession(effectiveSessionId, folderInfo);

			// Set usage handler to report token usage for context window widget
			this.sessionStateService.setUsageHandlerForSession(effectiveSessionId, (usage) => {
				stream.usage(usage);
			});

			const prompt = request.prompt;
			this._controller.updateItemStatus(effectiveSessionId, vscode.ChatSessionStatus.InProgress, prompt);
			const result = await this.claudeAgentManager.handleRequest(effectiveSessionId, request, context, stream, token, isNewSession, yieldRequested);
			this._controller.updateItemStatus(effectiveSessionId, vscode.ChatSessionStatus.Completed, prompt);

			// Clear usage handler after request completes
			this.sessionStateService.setUsageHandlerForSession(effectiveSessionId, undefined);

			return result.errorDetails ? { errorDetails: result.errorDetails } : {};
		};
	}

	// #endregion

	async provideChatSessionProviderOptions(): Promise<vscode.ChatSessionProviderOptions> {
		const permissionModeItems: vscode.ChatSessionProviderOptionItem[] = [
			{ id: 'default', name: l10n.t('Ask before edits') },
			{ id: 'acceptEdits', name: l10n.t('Edit automatically') },
			{ id: 'plan', name: l10n.t('Plan mode') },
		];

		// Add bypass permissions option if enabled via setting
		if (this.configurationService.getConfig(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions)) {
			permissionModeItems.push({ id: 'bypassPermissions', name: l10n.t('Bypass all permissions') });
		}

		const optionGroups: vscode.ChatSessionProviderOptionGroup[] = [
			{
				id: PERMISSION_MODE_OPTION_ID,
				name: l10n.t('Permission Mode'),
				description: l10n.t('Pick Permission Mode'),
				items: permissionModeItems,
			}
		];

		// Add folder option based on workspace type:
		// - Single-root (1 folder): no folder option (implicit)
		// - Multi-root (2+ folders): show workspace folders
		// - Empty workspace (0 folders): show MRU folders + browse command
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length !== 1) {
			const folderItems = await this._getFolderOptionItems();
			const folderGroup: vscode.ChatSessionProviderOptionGroup = {
				id: FOLDER_OPTION_ID,
				name: l10n.t('Folder'),
				description: l10n.t('Pick Folder'),
				items: folderItems,
			};
			optionGroups.unshift(folderGroup);
		}

		return { optionGroups, newSessionOptions: await this._getNewSessionOptions(workspaceFolders) };
	}

	private async _getNewSessionOptions(workspaceFolders: readonly URI[]): Promise<Record<string, string | vscode.ChatSessionProviderOptionItem>> {
		const newSessionOptions: Record<string, string | vscode.ChatSessionProviderOptionItem> = {};

		newSessionOptions[PERMISSION_MODE_OPTION_ID] = this._lastUsedPermissionMode;

		if (workspaceFolders.length !== 1) {
			const defaultFolder = await this._getDefaultFolder();
			if (defaultFolder) {
				newSessionOptions[FOLDER_OPTION_ID] = defaultFolder.fsPath;
			}
		}

		return newSessionOptions;
	}

	async provideHandleOptionsChange(resource: vscode.Uri, updates: ReadonlyArray<vscode.ChatSessionOptionUpdate>, _token: vscode.CancellationToken): Promise<void> {
		const sessionId = ClaudeSessionUri.getSessionId(resource);
		let hadUpdate = false;
		for (const update of updates) {
			if (update.optionId === PERMISSION_MODE_OPTION_ID) {
				if (!update.value || !isPermissionMode(update.value)) {
					continue;
				}
				// Store locally; committed to session state service when handling the next request
				this._controller.setMetadata(sessionId, { permissionMode: update.value });
				this._lastUsedPermissionMode = update.value;
				hadUpdate = true;
			} else if (update.optionId === FOLDER_OPTION_ID && typeof update.value === 'string') {
				this._controller.setMetadata(sessionId, { cwd: URI.file(update.value) });
				hadUpdate = true;
			}
		}
		if (hadUpdate) {
			this._onDidChangeChatSessionProviderOptions.fire();
		}
	}

	async provideChatSessionContent(sessionResource: vscode.Uri, token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		const sessionId = ClaudeSessionUri.getSessionId(sessionResource);
		const existingSession = await this.sessionService.getSession(sessionResource, token);
		const history = existingSession ?
			buildChatHistory(existingSession) :
			[];

		const permissionMode = this.getPermissionModeForSession(sessionId);

		const options: Record<string, string | vscode.ChatSessionProviderOptionItem> = {};
		options[PERMISSION_MODE_OPTION_ID] = permissionMode;

		// Include folder option if applicable (multi-root or empty workspace)
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length !== 1) {
			const defaultFolder = await this._getDefaultFolderForSession(sessionId);
			if (defaultFolder) {
				// For existing sessions, lock the folder option
				if (existingSession) {
					options[FOLDER_OPTION_ID] = {
						id: defaultFolder.fsPath,
						name: this.workspaceService.getWorkspaceFolderName(defaultFolder)
							|| basename(defaultFolder),
						icon: new vscode.ThemeIcon('folder'),
						locked: true,
					};
				} else {
					options[FOLDER_OPTION_ID] = defaultFolder.fsPath;
				}
			}
		}

		return {
			title: existingSession?.label,
			history,
			activeResponseCallback: undefined,
			requestHandler: undefined,
			options,
		};
	}

}

function mruToFolderOptionItems(mruItems: readonly FolderRepositoryMRUEntry[]): vscode.ChatSessionProviderOptionItem[] {
	return mruItems.map(item => ({
		id: item.folder.fsPath,
		name: basename(item.folder),
		icon: new vscode.ThemeIcon(item.repository ? 'repo' : 'folder'),
	}));
}

/**
 * Chat session item controller wrapper for Claude Agent.
 * Reads sessions from ~/.claude/projects/<folder-slug>/, where each file name is a session id (GUID).
 */
export class ClaudeChatSessionItemController extends Disposable {
	private readonly _controller: vscode.ChatSessionItemController;
	private readonly _inProgressItems = new Map<string, vscode.ChatSessionItem>();
	private _showBadge: boolean;

	constructor(
		@IClaudeCodeSessionService private readonly _claudeCodeSessionService: IClaudeCodeSessionService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IGitService private readonly _gitService: IGitService,
		@IClaudeCodeSdkService private readonly _sdkService: IClaudeCodeSdkService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._registerCommands();
		this._controller = this._register(vscode.chat.createChatSessionItemController(
			ClaudeSessionUri.scheme,
			() => this._refreshItems(CancellationToken.None)
		));

		this._controller.newChatSessionItemHandler = async (context, _token) => {
			const newSessionId = generateUuid();
			const item = this._controller.createChatSessionItem(
				ClaudeSessionUri.forSessionId(newSessionId),
				context.request.prompt,
			);
			item.iconPath = new vscode.ThemeIcon('claude');
			item.timing = { created: Date.now() };
			const permissionModeOptionValue = context.sessionOptions?.find(o => o.optionId === PERMISSION_MODE_OPTION_ID)?.value;
			const permissionMode = typeof permissionModeOptionValue === 'string' ? permissionModeOptionValue : permissionModeOptionValue?.id;
			const folderOptionValue = context.sessionOptions?.find(o => o.optionId === FOLDER_OPTION_ID)?.value;
			const folder = typeof folderOptionValue === 'string'
				? URI.file(folderOptionValue)
				: folderOptionValue?.id
					? URI.file(folderOptionValue.id)
					: undefined;
			item.metadata = {
				permissionMode,
				cwd: folder,
			};
			this._inProgressItems.set(newSessionId, item);
			return item;
		};

		this._controller.forkHandler = async (sessionResource: vscode.Uri, request: vscode.ChatRequestTurn2 | undefined, token: CancellationToken): Promise<vscode.ChatSessionItem> => {
			const item = this._controller.items.get(sessionResource);
			const title = vscode.l10n.t('Forked: {0}', item?.label ?? request?.prompt ?? 'Claude Session');

			// Fork whole history if no request specified
			let upToMessageId: string | undefined = undefined;
			if (request) {
				// we need to get the message right before the `request`
				const session = await this._claudeCodeSessionService.getSession(sessionResource, token);
				if (!session) {
					// This shouldn't happen
					this._logService.error(`Failed to fork session: session not found for resource ${sessionResource.toString()}`);
					throw new Error('Unable to fork: session not found.');
				} else {
					const messageIndex = session.messages.findIndex(m => m.uuid === request.id);
					if (messageIndex === -1) {
						this._logService.error(`Failed to fork session: request with id ${request.id} not found in session ${sessionResource.toString()}`);
						throw new Error('Unable to fork: the selected message could not be found.');
					}
					if (messageIndex === 0) {
						this._logService.error(`Failed to fork session: cannot fork at the first message`);
						throw new Error('Cannot fork from the first message.');
					}
					const forkMessage = session.messages[messageIndex - 1];
					upToMessageId = forkMessage.uuid;
				}
			}
			const result = await this._sdkService.forkSession(
				ClaudeSessionUri.getSessionId(sessionResource),
				{ upToMessageId, title }
			);
			const newItem = this._controller.createChatSessionItem(ClaudeSessionUri.forSessionId(result.sessionId), title);
			newItem.iconPath = new vscode.ThemeIcon('claude');
			newItem.timing = { created: Date.now() };
			newItem.metadata = item?.metadata ? { ...item.metadata } : undefined;
			this._controller.items.add(newItem);
			return newItem;
		};

		this._showBadge = this._computeShowBadge();

		// Refresh session items and recompute badge when repositories change.
		// _computeShowBadge() reads gitService.repositories synchronously, which
		// may be incomplete while the git extension is still initializing.
		this._register(_gitService.onDidOpenRepository(() => {
			this._showBadge = this._computeShowBadge();
			void this._refreshItems(CancellationToken.None);
		}));
		this._register(_gitService.onDidCloseRepository(() => {
			this._showBadge = this._computeShowBadge();
			void this._refreshItems(CancellationToken.None);
		}));
	}

	setMetadata(sessionId: string, metadata: Partial<{ permissionMode: PermissionMode; cwd?: URI }>): void {
		const item = this._controller.items.get(ClaudeSessionUri.forSessionId(sessionId));
		if (item) {
			item.metadata = {
				...item.metadata,
				permissionMode: metadata.permissionMode ?? item.metadata?.permissionMode,
				cwd: metadata.cwd ?? item.metadata?.cwd,
			};
		}
	}

	getMetadata(sessionId: string): { permissionMode?: PermissionMode; cwd?: URI } | undefined {
		const candidate = this._controller.items.get(ClaudeSessionUri.forSessionId(sessionId));
		if (candidate) {
			if (candidate.metadata?.permissionMode !== undefined && !isPermissionMode(candidate.metadata.permissionMode)) {
				this._logService.warn(`Invalid permission mode "${candidate.metadata?.permissionMode}" found in metadata for session ${sessionId}. Falling back to default.`);
				candidate.metadata = {
					permissionMode: 'acceptEdits',
					cwd: candidate.metadata?.cwd,
				};
			}
			if (candidate.metadata?.cwd && !(URI.isUri(candidate.metadata.cwd))) {
				this._logService.warn(`Invalid cwd "${candidate.metadata.cwd}" found in metadata for session ${sessionId}. Ignoring.`);
				candidate.metadata = {
					permissionMode: candidate.metadata.permissionMode,
					cwd: undefined,
				};
			}
			return {
				permissionMode: candidate.metadata?.permissionMode,
				cwd: candidate.metadata?.cwd,
			};
		}
	}

	updateItemLabel(sessionId: string, label: string): void {
		const resource = ClaudeSessionUri.forSessionId(sessionId);
		const item = this._controller.items.get(resource);
		if (item) {
			item.label = label;
		}
	}

	async updateItemStatus(sessionId: string, status: vscode.ChatSessionStatus, newItemLabel: string): Promise<void> {
		const resource = ClaudeSessionUri.forSessionId(sessionId);
		let item = this._controller.items.get(resource);
		if (!item) {
			const session = await this._claudeCodeSessionService.getSession(resource, CancellationToken.None);
			if (session) {
				item = this._createClaudeChatSessionItem(session);
			} else {
				const newlyCreatedSessionInfo: IClaudeCodeSessionInfo = {
					id: sessionId,
					label: newItemLabel,
					created: Date.now(),
					lastRequestEnded: Date.now(),
					folderName: undefined
				};
				item = this._createClaudeChatSessionItem(newlyCreatedSessionInfo);
			}

			this._controller.items.add(item);
		}

		item.status = status;
		if (status === vscode.ChatSessionStatus.InProgress) {
			const timing = item.timing ? { ...item.timing } : { created: Date.now() };
			timing.lastRequestStarted = Date.now();
			// Clear lastRequestEnded while a request is in progress
			timing.lastRequestEnded = undefined;
			item.timing = timing;
			this._inProgressItems.set(sessionId, item);
		} else {
			this._inProgressItems.delete(sessionId);
			if (status === vscode.ChatSessionStatus.Completed) {
				if (!item.timing) {
					item.timing = {
						created: Date.now(),
						lastRequestEnded: Date.now()
					};
				} else {
					item.timing = { ...item.timing, lastRequestEnded: Date.now() };
				}
			}
		}
	}

	private async _refreshItems(token: vscode.CancellationToken): Promise<void> {
		const sessions = await this._claudeCodeSessionService.getAllSessions(token);
		const items = sessions.map(session => this._createClaudeChatSessionItem(session));
		items.push(...this._inProgressItems.values());
		this._controller.items.replace(items);
	}

	private _createClaudeChatSessionItem(session: IClaudeCodeSessionInfo): vscode.ChatSessionItem {
		let badge: vscode.MarkdownString | undefined;
		if (session.folderName && this._showBadge) {
			badge = new vscode.MarkdownString(`$(folder) ${session.folderName}`);
			badge.supportThemeIcons = true;
		}

		const item = this._controller.createChatSessionItem(ClaudeSessionUri.forSessionId(session.id), session.label);
		item.badge = badge;
		item.tooltip = `Claude Code session: ${session.label}`;
		item.timing = {
			created: session.created,
			lastRequestStarted: session.lastRequestStarted,
			lastRequestEnded: session.lastRequestEnded,
		};
		item.iconPath = new vscode.ThemeIcon('claude');
		item.metadata = {
			// Allow it to be set when opened
			permissionMode: undefined,
			cwd: session.cwd ? URI.file(session.cwd) : undefined
		};
		return item;
	}

	private _computeShowBadge(): boolean {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 0) {
			return true; // Empty window
		}
		if (workspaceFolders.length > 1) {
			return true; // Multi-root workspace
		}

		// Single-root workspace with multiple git repositories
		const repositories = this._gitService.repositories
			.filter(repository => repository.kind !== 'worktree');
		return repositories.length > 1;
	}

	private _registerCommands(): void {
		this._register(vscode.commands.registerCommand('github.copilot.claude.sessions.rename', async (sessionItem?: vscode.ChatSessionItem) => {
			if (!sessionItem?.resource) {
				return;
			}

			const sessionId = ClaudeSessionUri.getSessionId(sessionItem.resource);
			const newTitle = await vscode.window.showInputBox({
				prompt: vscode.l10n.t('New agent session title'),
				value: sessionItem.label,
				validateInput: value => {
					if (!value.trim()) {
						return vscode.l10n.t('Title cannot be empty');
					}
					return undefined;
				}
			});

			if (newTitle) {
				const trimmedTitle = newTitle.trim();
				if (trimmedTitle) {
					try {
						await this._sdkService.renameSession(sessionId, trimmedTitle);
						this.updateItemLabel(sessionId, trimmedTitle);
					} catch (e) {
						this._logService.error(e, `[ClaudeChatSessionItemController] Failed to rename session: ${sessionId}`);
					}
				}
			}
		}));
	}
}
