/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ChatExtendedRequestHandler } from 'vscode';
import { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { INativeEnvService } from '../../../platform/env/common/envService';
import { IGitService } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { autorun, derived, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../util/vs/base/common/observable';
import { basename } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ClaudeFolderInfo } from '../claude/common/claudeFolderInfo';
import { ClaudeSessionUri } from '../claude/common/claudeSessionUri';
import { ClaudeAgentManager } from '../claude/node/claudeCodeAgent';
import { CLAUDE_REASONING_EFFORT_PROPERTY, IClaudeCodeModels } from '../claude/node/claudeCodeModels';
import { IClaudeCodeSdkService } from '../claude/node/claudeCodeSdkService';
import { parseClaudeModelId } from '../claude/node/claudeModelId';
import { IClaudeSessionStateService } from '../claude/common/claudeSessionStateService';
import { IClaudeCodeSessionService } from '../claude/node/sessionParser/claudeCodeSessionService';
import { IClaudeCodeSessionInfo } from '../claude/node/sessionParser/claudeSessionSchema';
import { IClaudeSlashCommandService } from '../claude/vscode-node/claudeSlashCommandService';
import { IChatFolderMruService } from '../common/folderRepositoryManager';
import { IClaudeWorkspaceFolderService } from '../common/claudeWorkspaceFolderService';
import { buildChatHistory } from './chatHistoryBuilder';
import { ClaudeSessionOptionBuilder, buildPermissionModeItems, FOLDER_OPTION_ID, isPermissionMode, PERMISSION_MODE_OPTION_ID } from './claudeSessionOptionBuilder';
import { toWorkspaceFolderOptionItem } from './sessionOptionGroupBuilder';

// Import the tool permission handlers
import '../claude/vscode-node/toolPermissionHandlers/index';

// Import the MCP server contributors to trigger self-registration
import '../claude/vscode-node/mcpServers/index';

interface InputStateReactivePipeline {
	readonly permissionMode: ISettableObservable<PermissionMode>;
	readonly folderUri: ISettableObservable<URI | undefined>;
	readonly folderItems: ISettableObservable<readonly vscode.ChatSessionProviderOptionItem[]>;
	readonly isSessionStarted: ISettableObservable<boolean>;
	readonly store: DisposableStore;
}

function getSelectedFolderUri(inputState: vscode.ChatSessionInputState | undefined): URI | undefined {
	const selectedFolderId = inputState?.groups.find(group => group.id === FOLDER_OPTION_ID)?.selected?.id;
	return selectedFolderId ? URI.file(selectedFolderId) : undefined;
}

export class ClaudeChatSessionContentProvider extends Disposable implements vscode.ChatSessionContentProvider {
	private readonly _controller: ClaudeChatSessionItemController;

	constructor(
		private readonly claudeAgentManager: ClaudeAgentManager,
		@IClaudeCodeSessionService private readonly sessionService: IClaudeCodeSessionService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
		@IClaudeSlashCommandService private readonly slashCommandService: IClaudeSlashCommandService,
		@IClaudeCodeModels private readonly claudeModels: IClaudeCodeModels,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this._controller = this._register(instantiationService.createInstance(ClaudeChatSessionItemController));
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
				this._controller.markSessionStarted(chatSessionContext.inputState);
			}

			const modelId = parseClaudeModelId(request.model.id);
			const selectedPermissionId = chatSessionContext.inputState.groups.find(group => group.id === PERMISSION_MODE_OPTION_ID)?.selected?.id;
			if (!selectedPermissionId || !isPermissionMode(selectedPermissionId)) {
				throw new Error(`Permission mode not set for session ${effectiveSessionId}`);
			}
			const permissionMode = selectedPermissionId;
			const selectedFolderUri = getSelectedFolderUri(chatSessionContext.inputState);
			const folderInfo = await this._controller.getFolderInfoForSession(effectiveSessionId, selectedFolderUri);

			// Commit UI state to session state service before invoking agent manager
			this.sessionStateService.setModelIdForSession(effectiveSessionId, modelId);
			this.sessionStateService.setPermissionModeForSession(effectiveSessionId, permissionMode);
			this.sessionStateService.setFolderInfoForSession(effectiveSessionId, folderInfo);

			const rawReasoningEffort = request.modelConfiguration?.[CLAUDE_REASONING_EFFORT_PROPERTY];
			const reasoningEffort = await this.claudeModels.resolveReasoningEffort(modelId, rawReasoningEffort);
			this.sessionStateService.setReasoningEffortForSession(effectiveSessionId, reasoningEffort);

			// Set usage handler to report token usage for context window widget
			this.sessionStateService.setUsageHandlerForSession(effectiveSessionId, (usage) => {
				stream.usage(usage);
			});

			const prompt = request.prompt;
			await this._controller.updateItemStatus(effectiveSessionId, vscode.ChatSessionStatus.InProgress, prompt);
			const result = await this.claudeAgentManager.handleRequest(effectiveSessionId, request, context, stream, token, isNewSession, yieldRequested);
			await this._controller.updateItemStatus(effectiveSessionId, vscode.ChatSessionStatus.Completed, prompt);

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
 * state listeners and resolving folder info for sessions.  Group construction
 * is delegated to {@link ClaudeSessionOptionBuilder}.
 */
export class ClaudeChatSessionItemController extends Disposable {
	private readonly _controller: vscode.ChatSessionItemController;
	private readonly _optionBuilder: ClaudeSessionOptionBuilder;
	private readonly _inProgressItems = new Map<string, vscode.ChatSessionItem>();
	private _showBadge: boolean;

	// #region Shared Observable State

	/** Whether the "bypass permissions" config is enabled — controls permission mode items. */
	private readonly _bypassPermissionsEnabled: IObservable<boolean>;

	/** Current workspace folders — controls folder group items and visibility. */
	private readonly _workspaceFolders: IObservable<URI[]>;

	/** Disposes per-state autoruns when the state object is garbage collected. */
	private readonly _stateAutorunRegistry = new FinalizationRegistry<DisposableStore>(
		store => store.dispose()
	);

	/** Maps input state objects to their reactive pipelines for external updates. */
	private readonly _statePipelines = new WeakMap<vscode.ChatSessionInputState, InputStateReactivePipeline>();

	// #endregion

	constructor(
		@IClaudeCodeSessionService private readonly _claudeCodeSessionService: IClaudeCodeSessionService,
		@IClaudeSessionStateService private readonly _sessionStateService: IClaudeSessionStateService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IChatFolderMruService folderMruService: IChatFolderMruService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@INativeEnvService private readonly _envService: INativeEnvService,
		@IGitService private readonly _gitService: IGitService,
		@IClaudeCodeSdkService private readonly _sdkService: IClaudeCodeSdkService,
		@ILogService private readonly _logService: ILogService,
		@IClaudeWorkspaceFolderService private readonly _claudeWorkspaceFolderService: IClaudeWorkspaceFolderService,
	) {
		super();
		this._optionBuilder = new ClaudeSessionOptionBuilder(_configurationService, folderMruService, _workspaceService);

		this._bypassPermissionsEnabled = observableFromEvent(
			this,
			Event.filter(_configurationService.onDidChangeConfiguration,
				e => e.affectsConfiguration(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions.fullyQualifiedId)),
			() => _configurationService.getConfig(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions) as boolean,
		);

		// Bridge vscode.Event → internal Event for workspace folder changes
		const workspaceFoldersEmitter = this._register(new Emitter<void>());
		const workspaceFoldersSubscription = _workspaceService.onDidChangeWorkspaceFolders(() => workspaceFoldersEmitter.fire());
		this._register({ dispose: () => workspaceFoldersSubscription.dispose() });
		this._workspaceFolders = observableFromEvent(
			this,
			workspaceFoldersEmitter.event,
			() => _workspaceService.getWorkspaceFolders(),
		);

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

			// Set workspace metadata for correct session grouping
			const selectedFolderUri = getSelectedFolderUri(context.inputState);
			const folderInfo = await this.getFolderInfoForSession(newSessionId, selectedFolderUri);
			if (folderInfo.cwd) {
				item.metadata = { workingDirectoryPath: folderInfo.cwd };
			}

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
			// FYI, dropping any other metadata fields here...
			if (item?.metadata?.workingDirectoryPath) {
				newItem.metadata = { workingDirectoryPath: item.metadata.workingDirectoryPath };
			}

			// Copy parent session state to the forked session
			const parentSessionId = ClaudeSessionUri.getSessionId(sessionResource);
			const parentPermission = this._sessionStateService.getPermissionModeForSession(parentSessionId);
			const parentFolder = this._sessionStateService.getFolderInfoForSession(parentSessionId);
			this._sessionStateService.setPermissionModeForSession(result.sessionId, parentPermission);
			if (parentFolder) {
				this._sessionStateService.setFolderInfoForSession(result.sessionId, {
					...parentFolder,
					additionalDirectories: [...(parentFolder.additionalDirectories ?? [])],
				});
			}

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

	/**
	 * Creates a reactive pipeline for a single input state.
	 *
	 * Per-state observables (`permissionMode`, `folderUri`, `isSessionStarted`) are
	 * combined with shared observables (`_bypassPermissionsEnabled`, `_workspaceFolders`)
	 * into derived group computations. An autorun reads the derived groups and pushes
	 * the result to `state.groups`, which is the "UI".
	 *
	 * The `state` is only held weakly by the autoruns so it can be garbage-collected
	 * while the shared observables still reference the pipeline's observers. When the
	 * state is collected, the finalization registry disposes the store and unsubscribes.
	 *
	 * Returns the per-state observables so callers can drive external updates, plus a
	 * `DisposableStore` that owns the autorun lifecycle.
	 */
	private _createInputStateReactivePipeline(
		state: vscode.ChatSessionInputState,
	): InputStateReactivePipeline {
		const store = new DisposableStore();

		// Seed values are computed up front so that the first autorun pass
		// observes fully-seeded observables and does not clobber `initialGroups`.
		const seed = this._computeSeedValues(state.groups);

		const permissionMode = observableValue<PermissionMode>(this, seed.permissionMode);
		const folderUri = observableValue<URI | undefined>(this, seed.folderUri);
		const folderItems = observableValue<readonly vscode.ChatSessionProviderOptionItem[]>(this, seed.folderItems);
		const isSessionStarted = observableValue<boolean>(this, seed.isSessionStarted);

		// When workspace folders change, update folder items reactively.
		// Falls back to the async MRU list when the workspace becomes empty,
		// matching the old imperative `buildNewFolderGroup` behavior.
		store.add(autorun(reader => {
			/** @description syncWorkspaceFolderItems */
			const folders = this._workspaceFolders.read(reader);
			if (folders.length !== 0) {
				folderItems.set(
					folders.map(f => toWorkspaceFolderOptionItem(f, this._workspaceService.getWorkspaceFolderName(f) || basename(f))),
					undefined,
				);
			} else {
				this._optionBuilder.getFolderOptionItems()
					.then(items => folderItems.set(items, undefined))
					.catch(e => this._logService.error(e));
			}
		}));

		const permissionModeGroup = derived(reader => {
			/** @description permissionModeGroup */
			const bypassEnabled = this._bypassPermissionsEnabled.read(reader);
			const selectedMode = permissionMode.read(reader);
			const group = buildPermissionModeItems(bypassEnabled);
			const selectedItem = group.items.find(i => i.id === selectedMode) ?? group.items[0];
			return { ...group, selected: selectedItem };
		});

		const folderGroup = derived<vscode.ChatSessionProviderOptionGroup | undefined>(reader => {
			/** @description folderGroup */
			const items = folderItems.read(reader);
			const folders = this._workspaceFolders.read(reader);
			// Hide folder group when there's exactly one workspace folder (implicit)
			if (folders.length === 1) {
				return undefined;
			}
			const selectedFolder = folderUri.read(reader);
			const locked = isSessionStarted.read(reader);
			const lockedItems = locked ? items.map(i => ({ ...i, locked: true })) : items;
			const selectedItem = selectedFolder
				? lockedItems.find(i => i.id === selectedFolder.fsPath)
				: lockedItems[0];
			return {
				id: FOLDER_OPTION_ID,
				name: vscode.l10n.t('Folder'),
				description: vscode.l10n.t('Pick Folder'),
				items: lockedItems,
				selected: selectedItem ? (locked ? { ...selectedItem, locked: true } : selectedItem) : undefined,
			};
		});

		const allGroups = derived(reader => {
			/** @description allGroups */
			const groups: vscode.ChatSessionProviderOptionGroup[] = [];
			const folder = folderGroup.read(reader);
			if (folder) {
				groups.push(folder);
			}
			groups.push(permissionModeGroup.read(reader));
			return groups;
		});

		// Hold `state` via a WeakRef so the autorun's closure does not retain it.
		// Shared observables (`_workspaceFolders`, `_bypassPermissionsEnabled`) hold
		// strong references to autoruns; without the WeakRef, `state` would transitively
		// stay reachable forever and `_stateAutorunRegistry` could never fire.
		const stateRef = new WeakRef(state);
		store.add(autorun(reader => {
			/** @description syncInputStateGroups */
			const groups = allGroups.read(reader);
			const currentState = stateRef.deref();
			if (currentState) {
				currentState.groups = groups;
			}
		}));

		return { permissionMode, folderUri, folderItems, isSessionStarted, store };
	}

	private _setupInputState(): void {
		this._controller.getChatSessionInputState = async (sessionResource, context, token) => {
			if (context.previousInputState) {
				const state = this._controller.createChatSessionInputState([...context.previousInputState.groups]);
				const pipeline = this._createInputStateReactivePipeline(state);
				this._statePipelines.set(state, pipeline);
				this._stateAutorunRegistry.register(state, pipeline.store);
				return state;
			}

			const isExistingSession = sessionResource && await this._claudeCodeSessionService.getSession(sessionResource, token) !== undefined;
			const initialGroups = isExistingSession
				? await this._buildExistingSessionGroups(sessionResource)
				: await this._optionBuilder.buildNewSessionGroups();
			const state = this._controller.createChatSessionInputState(initialGroups);
			const pipeline = this._createInputStateReactivePipeline(state);

			if (isExistingSession) {
				pipeline.isSessionStarted.set(true, undefined);
			}

			// React to external permission mode changes for this session
			if (sessionResource) {
				const sessionId = ClaudeSessionUri.getSessionId(sessionResource);
				const externalPermissionMode = observableFromEvent(
					this,
					Event.filter(this._sessionStateService.onDidChangeSessionState,
						e => e.sessionId === sessionId && e.permissionMode !== undefined),
					() => this._sessionStateService.getPermissionModeForSession(sessionId),
				);
				pipeline.store.add(autorun(reader => {
					/** @description syncExternalPermissionMode */
					pipeline.permissionMode.set(externalPermissionMode.read(reader), undefined);
				}));
			}

			this._statePipelines.set(state, pipeline);
			this._stateAutorunRegistry.register(state, pipeline.store);
			return state;
		};
	}

	/**
	 * Extracts seed values for the per-state observables from the input groups.
	 * Pure and synchronous — runs before any autoruns are attached so the first
	 * autorun pass observes fully-seeded values and does not overwrite the
	 * carefully-constructed initial groups.
	 *
	 * Also recovers the `isSessionStarted` signal from `locked` items — required to
	 * preserve lock state when restoring a previously-started session.
	 */
	private _computeSeedValues(groups: readonly vscode.ChatSessionProviderOptionGroup[]): {
		readonly permissionMode: PermissionMode;
		readonly folderUri: URI | undefined;
		readonly folderItems: readonly vscode.ChatSessionProviderOptionItem[];
		readonly isSessionStarted: boolean;
	} {
		let permissionMode: PermissionMode = this._optionBuilder.lastUsedPermissionMode;
		const permissionGroup = groups.find(g => g.id === PERMISSION_MODE_OPTION_ID);
		if (permissionGroup?.selected && isPermissionMode(permissionGroup.selected.id)) {
			permissionMode = permissionGroup.selected.id;
		}

		let folderUri: URI | undefined;
		let folderItems: readonly vscode.ChatSessionProviderOptionItem[] = [];
		let isSessionStarted = false;
		const folderGroup = groups.find(g => g.id === FOLDER_OPTION_ID);
		if (folderGroup) {
			if (folderGroup.items.length > 0) {
				folderItems = folderGroup.items;
			}
			if (folderGroup.selected) {
				folderUri = URI.file(folderGroup.selected.id);
			}
			// Restore the "started" signal: if any items (or the selected item) carry
			// `locked: true`, the session was previously started and must stay locked.
			if (folderGroup.selected?.locked || folderGroup.items.some(i => i.locked)) {
				isSessionStarted = true;
			}
		}

		return { permissionMode, folderUri, folderItems, isSessionStarted };
	}

	/**
	 * Marks the input state as "started", which locks the folder group.
	 * Called by the content provider when a new session begins.
	 */
	markSessionStarted(inputState: vscode.ChatSessionInputState): void {
		const pipeline = this._statePipelines.get(inputState);
		if (pipeline) {
			pipeline.isSessionStarted.set(true, undefined);
		}
	}

	private async _buildExistingSessionGroups(sessionResource: vscode.Uri): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const sessionId = ClaudeSessionUri.getSessionId(sessionResource);
		const permissionMode = this._sessionStateService.getPermissionModeForSession(sessionId);

		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		let folderUri: URI | undefined;
		if (workspaceFolders.length !== 1) {
			const stateFolder = this._sessionStateService.getFolderInfoForSession(sessionId);
			if (stateFolder) {
				folderUri = URI.file(stateFolder.cwd);
			} else {
				const session = await this._claudeCodeSessionService.getSession(sessionResource, CancellationToken.None);
				if (session?.cwd) {
					folderUri = URI.file(session.cwd);
				} else {
					folderUri = await this._optionBuilder.getDefaultFolder();
				}
			}
		}
		return this._optionBuilder.buildExistingSessionGroups(permissionMode, folderUri);
	}

	// #endregion

	// #region Folder Resolution

	async getFolderInfoForSession(sessionId: string, selectedFolderUri?: URI): Promise<ClaudeFolderInfo> {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();

		if (workspaceFolders.length === 1) {
			return {
				cwd: workspaceFolders[0].fsPath,
				additionalDirectories: [],
			};
		}

		// Multi-root or empty workspace: resolve selected folder from inputState, sessionStateService, or session file
		const folderUri = selectedFolderUri ?? await this._resolveSessionFolder(sessionId);

		if (workspaceFolders.length > 1) {
			const cwd = folderUri?.fsPath ?? workspaceFolders[0].fsPath;
			const additionalDirectories = workspaceFolders
				.map(f => f.fsPath)
				.filter(p => p !== cwd);
			return { cwd, additionalDirectories };
		}

		// Empty workspace
		if (folderUri) {
			return {
				cwd: folderUri.fsPath,
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

	private async _resolveSessionFolder(sessionId: string): Promise<URI | undefined> {
		const stateFolder = this._sessionStateService.getFolderInfoForSession(sessionId);
		if (stateFolder) {
			return URI.file(stateFolder.cwd);
		}

		const sessionResource = ClaudeSessionUri.forSessionId(sessionId);
		const session = await this._claudeCodeSessionService.getSession(sessionResource, CancellationToken.None);
		if (session?.cwd) {
			return URI.file(session.cwd);
		}

		return this._optionBuilder.getDefaultFolder();
	}

	// #endregion

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
				item = await this._createClaudeChatSessionItem(session);
			} else {
				const newlyCreatedSessionInfo: IClaudeCodeSessionInfo = {
					id: sessionId,
					label: newItemLabel,
					created: Date.now(),
					lastRequestEnded: Date.now(),
					folderName: undefined
				};
				item = await this._createClaudeChatSessionItem(newlyCreatedSessionInfo);
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
				const session = await this._claudeCodeSessionService.getSession(resource, CancellationToken.None);
				if (session?.cwd) {
					item.changes = await this._claudeWorkspaceFolderService.getWorkspaceChanges(
						session.cwd,
						session.gitBranch,
						undefined,
						true,
					);
				}
			}
		}
	}

	private async _refreshItems(token: vscode.CancellationToken): Promise<void> {
		const sessions = await this._claudeCodeSessionService.getAllSessions(token);
		const results = await Promise.allSettled(sessions.map(session => this._createClaudeChatSessionItem(session)));
		const items: vscode.ChatSessionItem[] = [];
		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			if (result.status === 'fulfilled') {
				items.push(result.value);
			} else {
				const session = sessions[i];
				this._logService.warn(`Failed to create Claude chat session item for ${session.id} (${session.label}) ${result.reason}`);
			}
		}
		items.push(...this._inProgressItems.values());
		this._controller.items.replace(items);
	}

	private async _createClaudeChatSessionItem(session: IClaudeCodeSessionInfo): Promise<vscode.ChatSessionItem> {
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
		if (session.cwd) {
			item.metadata = { workingDirectoryPath: session.cwd };
			item.changes = await this._claudeWorkspaceFolderService.getWorkspaceChanges(
				session.cwd,
				session.gitBranch,
				undefined,
			);
		}
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
