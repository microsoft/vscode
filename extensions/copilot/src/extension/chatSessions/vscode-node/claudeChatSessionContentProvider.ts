/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import * as vscode from 'vscode';
import { ChatExtendedRequestHandler } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { INativeEnvService } from '../../../platform/env/common/envService';
import { IGitService } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Disposable, IDisposable } from '../../../util/vs/base/common/lifecycle';
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
import { IChatFolderMruService } from '../common/folderRepositoryManager';
import { buildChatHistory } from './chatHistoryBuilder';
import { ClaudeSessionOptionBuilder, FOLDER_OPTION_ID, isPermissionMode, PERMISSION_MODE_OPTION_ID } from './claudeSessionOptionBuilder';
import { getSelectedOption } from './sessionOptionGroupBuilder';

// Import the tool permission handlers
import '../claude/vscode-node/toolPermissionHandlers/index';

// Import the MCP server contributors to trigger self-registration
import '../claude/vscode-node/mcpServers/index';

export class ClaudeChatSessionContentProvider extends Disposable implements vscode.ChatSessionContentProvider {
	private readonly _controller: ClaudeChatSessionItemController;

	constructor(
		private readonly claudeAgentManager: ClaudeAgentManager,
		@IClaudeCodeSessionService private readonly sessionService: IClaudeCodeSessionService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
		@IClaudeSlashCommandService private readonly slashCommandService: IClaudeSlashCommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatFolderMruService folderMruService: IChatFolderMruService,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@INativeEnvService envService: INativeEnvService,
		@IGitService gitService: IGitService,
		@IClaudeCodeSdkService sdkService: IClaudeCodeSdkService,
		@ILogService logService: ILogService,
	) {
		super();
		this._controller = this._register(new ClaudeChatSessionItemController(
			sessionService, sessionStateService, configurationService,
			folderMruService, workspaceService, envService,
			gitService, sdkService, logService,
		));
	}

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

			// Lock the folder group when starting a new session (permission mode stays editable)
			if (isNewSession) {
				const state = chatSessionContext.inputState;
				state.groups = state.groups.map(group => {
					if (group.id !== FOLDER_OPTION_ID) {
						return group;
					}
					return {
						...group,
						items: group.items.map(item => ({ ...item, locked: true })),
						selected: group.selected ? { ...group.selected, locked: true } : undefined,
					};
				});
			}

			const modelId = parseClaudeModelId(request.model.id);
			const permissionMode = this._controller.getPermissionModeForSession(effectiveSessionId);
			const folderInfo = await this._controller.getFolderInfoForSession(effectiveSessionId);

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

	async provideChatSessionContent(sessionResource: vscode.Uri, token: vscode.CancellationToken, context?: { readonly inputState: vscode.ChatSessionInputState }): Promise<vscode.ChatSession> {
		const existingSession = await this.sessionService.getSession(sessionResource, token);
		const history = existingSession ?
			buildChatHistory(existingSession) :
			[];

		const options: Record<string, string | vscode.ChatSessionProviderOptionItem> = {};
		const groups = context?.inputState.groups ?? [];
		for (const group of groups) {
			if (group.selected) {
				// Only lock the folder group — permission mode must stay editable
				const locked = group.id === FOLDER_OPTION_ID;
				options[group.id] = locked
					? { ...group.selected, locked: true }
					: group.selected.id;
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

/**
 * Chat session item controller wrapper for Claude Agent.
 * Reads sessions from ~/.claude/projects/<folder-slug>/, where each file name is a session id (GUID).
 *
 * Owns the input state (getChatSessionInputState) lifecycle: wiring external
 * state listeners, persisting selections to metadata, and resolving permission
 * mode / folder info for sessions.  Group construction is delegated to
 * {@link ClaudeSessionOptionBuilder}.
 */
export class ClaudeChatSessionItemController extends Disposable {
	private readonly _controller: vscode.ChatSessionItemController;
	private readonly _optionBuilder: ClaudeSessionOptionBuilder;
	private readonly _inProgressItems = new Map<string, vscode.ChatSessionItem>();
	private _showBadge: boolean;

	constructor(
		@IClaudeCodeSessionService private readonly _claudeCodeSessionService: IClaudeCodeSessionService,
		@IClaudeSessionStateService private readonly _sessionStateService: IClaudeSessionStateService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatFolderMruService folderMruService: IChatFolderMruService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@INativeEnvService private readonly _envService: INativeEnvService,
		@IGitService private readonly _gitService: IGitService,
		@IClaudeCodeSdkService private readonly _sdkService: IClaudeCodeSdkService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._optionBuilder = new ClaudeSessionOptionBuilder(_configurationService, folderMruService, _workspaceService);
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

			const permissionModeSelection = getSelectedOption(context.inputState.groups, PERMISSION_MODE_OPTION_ID);
			const permissionMode = permissionModeSelection?.id;
			const folderSelection = getSelectedOption(context.inputState.groups, FOLDER_OPTION_ID);
			const folder = folderSelection?.id ? URI.file(folderSelection.id) : undefined;

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

		this._setupInputState();
	}

	// #region Input State

	private _setupInputState(): void {
		const trackedStates: { ref: WeakRef<vscode.ChatSessionInputState>; subscription: IDisposable }[] = [];

		const sweepStaleEntries = () => {
			for (let i = trackedStates.length - 1; i >= 0; i--) {
				if (!trackedStates[i].ref.deref()) {
					trackedStates[i].subscription.dispose();
					trackedStates.splice(i, 1);
				}
			}
		};

		// Dispose all subscriptions when the content provider is disposed
		this._register({
			dispose: () => {
				for (const entry of trackedStates) {
					entry.subscription.dispose();
				}
				trackedStates.length = 0;
			}
		});

		this._controller.getChatSessionInputState = async (sessionResource, context, token) => {
			const isExistingSession = sessionResource && await this._claudeCodeSessionService.getSession(sessionResource, token) !== undefined;

			const groups = isExistingSession
				? await this._buildExistingSessionGroups(sessionResource)
				: await this._optionBuilder.buildNewSessionGroups(context.previousInputState);
			const state = this._controller.createChatSessionInputState(groups);

			const ref = new WeakRef(state);
			const subscription = state.onDidChange(() => {
				const s = ref.deref();
				if (s) {
					this._handleInputStateChange(s);
				}
			});
			trackedStates.push({ ref, subscription });

			return state;
		};

		// Rebuild active input states when external conditions change
		const refreshActiveInputStates = () => {
			sweepStaleEntries();
			for (const entry of trackedStates) {
				const state = entry.ref.deref();
				if (state) {
					this._rebuildInputState(state).catch(e => this._logService.error(e));
				}
			}
		};

		// Config change (bypass permissions toggle) → may add/remove permission items
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions.fullyQualifiedId)) {
				refreshActiveInputStates();
			}
		}));

		// Workspace folder changes → may add/remove folder group
		this._register(this._workspaceService.onDidChangeWorkspaceFolders(() => {
			refreshActiveInputStates();
		}));

		// Session state service changes (e.g., permission mode changed externally)
		this._register(this._sessionStateService.onDidChangeSessionState(e => {
			if (e.permissionMode === undefined) {
				return;
			}
			const existingMode = this.getMetadata(e.sessionId)?.permissionMode;
			if (e.permissionMode === existingMode) {
				return;
			}
			this.setMetadata(e.sessionId, { permissionMode: e.permissionMode });
			for (const entry of trackedStates) {
				const state = entry.ref.deref();
				if (state?.sessionResource) {
					const stateSessionId = ClaudeSessionUri.getSessionId(state.sessionResource);
					if (stateSessionId === e.sessionId) {
						const permissionGroup = this._optionBuilder.buildPermissionModeGroup();
						const selectedItem = permissionGroup.items.find(i => i.id === e.permissionMode);
						if (selectedItem) {
							const updatedGroup = { ...permissionGroup, selected: selectedItem };
							state.groups = state.groups.map(g =>
								g.id === PERMISSION_MODE_OPTION_ID ? updatedGroup : g
							);
						}
					}
				}
			}
		}));
	}

	private async _buildExistingSessionGroups(sessionResource: vscode.Uri): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const sessionId = ClaudeSessionUri.getSessionId(sessionResource);
		const permissionMode = this.getPermissionModeForSession(sessionId);
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		const folderUri = workspaceFolders.length !== 1 ? await this._getDefaultFolderForSession(sessionId) : undefined;
		return this._optionBuilder.buildExistingSessionGroups(permissionMode, folderUri);
	}

	private _handleInputStateChange(state: vscode.ChatSessionInputState): void {
		const { permissionMode, folderUri } = this._optionBuilder.getSelections(state.groups);
		const sessionId = state.sessionResource ? ClaudeSessionUri.getSessionId(state.sessionResource) : undefined;
		if (sessionId) {
			if (permissionMode) {
				this.setMetadata(sessionId, { permissionMode });
			}
			if (folderUri) {
				this.setMetadata(sessionId, { cwd: folderUri });
			}
		}
	}

	private async _rebuildInputState(state: vscode.ChatSessionInputState): Promise<void> {
		if (state.sessionResource) {
			state.groups = await this._buildExistingSessionGroups(state.sessionResource);
		} else {
			state.groups = await this._optionBuilder.buildNewSessionGroups(state);
		}
	}

	// #endregion

	// #region Permission Mode & Folder Resolution

	private async _getDefaultFolderForSession(sessionId: string): Promise<URI | undefined> {
		const selected = this.getMetadata(sessionId)?.cwd;
		if (selected) {
			return selected;
		}

		const defaultFolder = await this._optionBuilder.getDefaultFolder();
		if (defaultFolder) {
			this.setMetadata(sessionId, { cwd: defaultFolder });
		}
		return defaultFolder;
	}

	getPermissionModeForSession(sessionId: string): PermissionMode {
		return this.getMetadata(sessionId)?.permissionMode ?? this._sessionStateService.getPermissionModeForSession(sessionId);
	}

	async getFolderInfoForSession(sessionId: string): Promise<ClaudeFolderInfo> {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();

		if (workspaceFolders.length === 1) {
			return {
				cwd: workspaceFolders[0].fsPath,
				additionalDirectories: [],
			};
		}

		// Multi-root or empty workspace: use the selected folder
		const selectedFolder = this.getMetadata(sessionId)?.cwd;

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
		const defaultFolder = await this._optionBuilder.getDefaultFolder();
		if (defaultFolder) {
			return {
				cwd: defaultFolder.fsPath,
				additionalDirectories: [],
			};
		}

		// No folder available at all — fall back to the user's home directory
		return {
			cwd: this._envService.userHome.fsPath,
			additionalDirectories: [],
		};
	}

	// #endregion

	// #region Metadata

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
