/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import './media/chatWelcomePart.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toAction } from '../../../../base/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, IContextKey, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ChatSessionPosition, getResourceForNewChatSession } from '../../../../workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import { ChatSessionPickerActionItem, IChatSessionPickerDelegate } from '../../../../workbench/contrib/chat/browser/chatSessions/chatSessionPickerActionItem.js';
import { SearchableOptionPickerActionItem } from '../../../../workbench/contrib/chat/browser/chatSessions/searchableOptionPickerActionItem.js';
import { IChatSessionProviderOptionItem } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IModelPickerDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { EnhancedModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem2.js';
import { IChatInputPickerOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { getSimpleEditorOptions } from '../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../fileTreeView/browser/githubFileSystemProvider.js';
import { FolderPicker } from './folderPicker.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { IsolationModePicker, SessionTargetPicker } from './sessionTargetPicker.js';
import { BranchPicker } from './branchPicker.js';
import { INewSession, ISessionOptionGroup, RemoteNewSession } from './newSession.js';
import { RepoPicker } from './repoPicker.js';
import { CloudModelPicker } from './modelPicker.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { SlashCommandHandler } from './slashCommands.js';

const STORAGE_KEY_LAST_MODEL = 'sessions.selectedModel';
const MIN_EDITOR_HEIGHT = 50;
const MAX_EDITOR_HEIGHT = 200;

// #region --- Chat Welcome Widget ---

/**
 * Options for creating a `NewChatWidget`.
 */
interface INewChatWidgetOptions {
	readonly allowedTargets: AgentSessionProviders[];
	readonly defaultTarget: AgentSessionProviders;
	readonly sessionPosition?: ChatSessionPosition;
}

/**
 * A self-contained new-session chat widget with a welcome view (mascot, target
 * buttons, option pickers), an input editor, model picker, and send button.
 *
 * This widget is shown only in the empty/welcome state. Once the user sends
 * a message, a session is created and the workbench ChatViewPane takes over.
 */
class NewChatWidget extends Disposable {

	private readonly _targetPicker: SessionTargetPicker;
	private readonly _isolationModePicker: IsolationModePicker;
	private readonly _branchPicker: BranchPicker;
	private readonly _options: INewChatWidgetOptions;

	// Input
	private _editor!: CodeEditorWidget;
	private _editorContainer!: HTMLElement;
	private readonly _currentLanguageModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentLanguageModel', undefined);
	private readonly _modelPickerDisposable = this._register(new MutableDisposable());

	// Pending session
	private readonly _newSession = this._register(new MutableDisposable<INewSession>());
	private readonly _newSessionListener = this._register(new MutableDisposable());

	// Send button
	private _sendButton: Button | undefined;
	private _sending = false;
	private _altKeyDown = false;

	// Repository loading
	private readonly _openRepositoryCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private _repositoryLoading = false;
	private _branchLoading = false;
	private _loadingSpinner: HTMLElement | undefined;
	private readonly _loadingDelayDisposable = this._register(new MutableDisposable());

	// Welcome part
	private _pickersContainer: HTMLElement | undefined;
	private _extensionPickersLeftContainer: HTMLElement | undefined;
	private _toolbarPickersContainer: HTMLElement | undefined;
	private _localModelPickerContainer: HTMLElement | undefined;
	private _inputSlot: HTMLElement | undefined;
	private readonly _folderPicker: FolderPicker;
	private _folderPickerContainer: HTMLElement | undefined;
	private readonly _repoPicker: RepoPicker;
	private _repoPickerContainer: HTMLElement | undefined;
	private readonly _cloudModelPicker: CloudModelPicker;
	private readonly _toolbarPickerWidgets = new Map<string, ChatSessionPickerActionItem | SearchableOptionPickerActionItem>();
	private readonly _toolbarPickerDisposables = this._register(new DisposableStore());
	private readonly _optionEmitters = new Map<string, Emitter<IChatSessionProviderOptionItem>>();
	private readonly _optionContextKeys = new Map<string, IContextKey<string>>();

	// Attached context
	private readonly _contextAttachments: NewChatContextAttachments;

	// Slash commands
	private _slashCommandHandler: SlashCommandHandler | undefined;

	constructor(
		options: INewChatWidgetOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ILogService private readonly logService: ILogService,
		@IHoverService private readonly hoverService: IHoverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IGitService private readonly gitService: IGitService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._contextAttachments = this._register(this.instantiationService.createInstance(NewChatContextAttachments));
		this._folderPicker = this._register(this.instantiationService.createInstance(FolderPicker));
		this._repoPicker = this._register(this.instantiationService.createInstance(RepoPicker));
		this._cloudModelPicker = this._register(this.instantiationService.createInstance(CloudModelPicker));
		this._targetPicker = this._register(new SessionTargetPicker(options.allowedTargets, options.defaultTarget));
		this._isolationModePicker = this._register(this.instantiationService.createInstance(IsolationModePicker));
		this._branchPicker = this._register(this.instantiationService.createInstance(BranchPicker));
		this._options = options;

		// When target changes, create new session
		this._register(this._targetPicker.onDidChangeTarget((target) => {
			this._createNewSession();
			const isLocal = target === AgentSessionProviders.Background;
			this._isolationModePicker.setVisible(isLocal);
			this._branchPicker.setVisible(isLocal);
			this._focusEditor();
		}));

		this._register(this._branchPicker.onDidChangeLoading(loading => {
			this._branchLoading = loading;
			this._updateInputLoadingState();
		}));

		this._register(this._branchPicker.onDidChange(() => {
			this._focusEditor();
		}));

		this._register(this._folderPicker.onDidSelectFolder(() => {
			this._focusEditor();
		}));

		this._register(this._isolationModePicker.onDidChange(() => {
			this._focusEditor();
		}));

		// When language models change (e.g., extension activates), reinitialize if no model selected
		this._register(this.languageModelsService.onDidChangeLanguageModels(() => {
			this._initDefaultModel();
		}));
	}

	// --- Rendering ---

	render(container: HTMLElement): void {
		const wrapper = dom.append(container, dom.$('.sessions-chat-widget'));

		// Overflow widget DOM node at the top level so the suggest widget
		// is not clipped by any overflow:hidden ancestor.
		const editorOverflowWidgetsDomNode = dom.append(container, dom.$('.sessions-chat-editor-overflow.monaco-editor'));
		this._register({ dispose: () => editorOverflowWidgetsDomNode.remove() });

		const welcomeElement = dom.append(wrapper, dom.$('.chat-full-welcome'));

		// Watermark letterpress
		const header = dom.append(welcomeElement, dom.$('.chat-full-welcome-header'));
		dom.append(header, dom.$('.chat-full-welcome-letterpress'));

		// Option group pickers (above the input)
		this._pickersContainer = dom.append(welcomeElement, dom.$('.chat-full-welcome-pickers-container'));

		// Input slot
		this._inputSlot = dom.append(welcomeElement, dom.$('.chat-full-welcome-inputSlot'));

		// Input area inside the input slot
		const inputArea = dom.$('.sessions-chat-input-area');
		this._contextAttachments.registerDropTarget(inputArea);
		this._contextAttachments.registerPasteHandler(inputArea);

		// Attachments row (pills only) inside input area, above editor
		const attachRow = dom.append(inputArea, dom.$('.sessions-chat-attach-row'));
		const attachedContextContainer = dom.append(attachRow, dom.$('.sessions-chat-attached-context'));
		this._contextAttachments.renderAttachedContext(attachedContextContainer);

		this._createEditor(inputArea, editorOverflowWidgetsDomNode);
		this._createBottomToolbar(inputArea);
		this._inputSlot.appendChild(inputArea);

		// Isolation mode and branch pickers (below the input, shown when Local target is selected)
		const isolationContainer = dom.append(welcomeElement, dom.$('.chat-full-welcome-local-mode'));
		this._isolationModePicker.render(isolationContainer);
		dom.append(isolationContainer, dom.$('.sessions-chat-local-mode-spacer'));
		const branchContainer = dom.append(isolationContainer, dom.$('.sessions-chat-local-mode-right'));
		this._branchPicker.render(branchContainer);

		// Set initial visibility based on default target
		const isLocal = this._targetPicker.selectedTarget === AgentSessionProviders.Background;
		this._isolationModePicker.setVisible(isLocal);
		this._branchPicker.setVisible(isLocal);

		// Render target buttons & extension pickers
		this._renderOptionGroupPickers();

		// Initialize model picker
		this._initDefaultModel();

		// Create initial session
		this._createNewSession();

		// Reveal
		welcomeElement.classList.add('revealed');

		// Layout editor after the input slot fade-in animation completes
		this._register(dom.addDisposableListener(this._inputSlot, 'animationend', () => {
			this._editor?.layout();
		}, { once: true }));
	}

	private async _createNewSession(): Promise<void> {
		const target = this._targetPicker.selectedTarget;
		const defaultRepoUri = this._folderPicker.selectedFolderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
		const resource = getResourceForNewChatSession({
			type: target,
			position: this._options.sessionPosition ?? ChatSessionPosition.Sidebar,
			displayName: '',
		});

		try {
			const session = await this.sessionsManagementService.createNewSessionForTarget(target, resource, defaultRepoUri);
			this._setNewSession(session);
		} catch (e) {
			this.logService.error('Failed to create new session:', e);
		}
	}

	private _setNewSession(session: INewSession): void {
		this._newSession.value = session;

		// Wire pickers to the new session
		this._folderPicker.setNewSession(session);
		this._repoPicker.setNewSession(session);
		this._isolationModePicker.setNewSession(session);
		this._branchPicker.setNewSession(session);

		// Set the current model on the session (for local sessions)
		const currentModel = this._currentLanguageModel.get();
		if (currentModel) {
			session.setModelId(currentModel.identifier);
		}

		// Open repository for the session's repoUri
		if (session.repoUri) {
			this._openRepository(session.repoUri);
		}

		// Listen for session changes
		const listeners = new DisposableStore();
		listeners.add(session.onDidChange((changeType) => {
			if (changeType === 'repoUri' && session.repoUri) {
				this._openRepository(session.repoUri);
			}
			if (changeType === 'isolationMode') {
				this._branchPicker.setVisible(session.isolationMode === 'worktree');
			}
			if (changeType === 'disabled') {
				this._updateSendButtonState();
			}
		}));

		if (session instanceof RemoteNewSession) {
			this._renderRemoteSessionPickers(session, true);
			listeners.add(session.onDidChangeOptionGroups(() => {
				this._renderRemoteSessionPickers(session);
			}));
		} else {
			this._renderLocalSessionPickers();
		}

		this._newSessionListener.value = listeners;
		this._updateSendButtonState();
	}

	private _openRepository(folderUri: URI): void {
		this._openRepositoryCts.value?.cancel();
		const cts = this._openRepositoryCts.value = new CancellationTokenSource();

		this._repositoryLoading = true;
		this._updateInputLoadingState();
		this._branchPicker.setRepository(undefined);
		this._isolationModePicker.setRepository(undefined);

		this.gitService.openRepository(folderUri).then(repository => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			this._repositoryLoading = false;
			this._updateInputLoadingState();
			this._isolationModePicker.setRepository(repository);
			this._branchPicker.setRepository(repository);
		}).catch(e => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			this.logService.warn(`Failed to open repository at ${folderUri.toString()}`, getErrorMessage(e));
			this._repositoryLoading = false;
			this._updateInputLoadingState();
			this._isolationModePicker.setRepository(undefined);
			this._branchPicker.setRepository(undefined);
		});
	}

	private _updateInputLoadingState(): void {
		const loading = this._repositoryLoading || this._branchLoading || this._sending;
		if (loading) {
			if (!this._loadingDelayDisposable.value) {
				const timer = setTimeout(() => {
					this._loadingDelayDisposable.clear();
					if (this._repositoryLoading || this._branchLoading || this._sending) {
						this._loadingSpinner?.classList.add('visible');
					}
				}, 500);
				this._loadingDelayDisposable.value = toDisposable(() => clearTimeout(timer));
			}
		} else {
			this._loadingDelayDisposable.clear();
			this._loadingSpinner?.classList.remove('visible');
		}
	}

	// --- Editor ---

	private _createEditor(container: HTMLElement, overflowWidgetsDomNode: HTMLElement): void {
		const editorContainer = this._editorContainer = dom.append(container, dom.$('.sessions-chat-editor'));
		editorContainer.style.height = `${MIN_EDITOR_HEIGHT}px`;

		const uri = URI.from({ scheme: 'sessions-chat', path: `input-${Date.now()}` });
		const textModel = this._register(this.modelService.createModel('', null, uri, true));

		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(this.configurationService),
			readOnly: false,
			ariaLabel: localize('chatInput', "Chat input"),
			placeholder: localize('chatPlaceholder', "Run tasks in the background, type '#' for adding context"),
			fontFamily: 'system-ui, -apple-system, sans-serif',
			fontSize: 13,
			lineHeight: 20,
			padding: { top: 8, bottom: 2 },
			wrappingStrategy: 'advanced',
			stickyScroll: { enabled: false },
			renderWhitespace: 'none',
			overflowWidgetsDomNode,
			suggest: {
				showIcons: false,
				showSnippets: false,
				showWords: true,
				showStatusBar: false,
				insertMode: 'insert',
			},
		};

		const widgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				ContextMenuController.ID,
				SuggestController.ID,
				SnippetController2.ID,
			]),
		};

		this._editor = this._register(this.instantiationService.createInstance(
			CodeEditorWidget, editorContainer, editorOptions, widgetOptions,
		));
		this._editor.setModel(textModel);

		// Ensure suggest widget renders above the input (not clipped by container)
		SuggestController.get(this._editor)?.forceRenderingAbove();

		this._register(this._editor.onKeyDown(e => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && !e.altKey) {
				// Don't send if the suggest widget is visible (let it accept the completion)
				if (this._editor.contextKeyService.getContextKeyValue<boolean>('suggestWidgetVisible')) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				this._send();
			}
			if (e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				this._send({ openNewAfterSend: true });
			}
		}));

		let previousHeight = -1;
		this._register(this._editor.onDidContentSizeChange(e => {
			if (!e.contentHeightChanged) {
				return;
			}
			const contentHeight = this._editor.getContentHeight();
			const clampedHeight = Math.min(MAX_EDITOR_HEIGHT, Math.max(MIN_EDITOR_HEIGHT, contentHeight));
			if (clampedHeight === previousHeight) {
				return;
			}
			previousHeight = clampedHeight;
			this._editorContainer.style.height = `${clampedHeight}px`;
			this._editor.layout();
		}));

		// Slash commands
		this._slashCommandHandler = this._register(this.instantiationService.createInstance(SlashCommandHandler, this._editor));

		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateSendButtonState();
		}));
	}

	private _focusEditor(): void {
		this._editor?.focus();
	}

	private _createAttachButton(container: HTMLElement): void {
		const attachButton = dom.append(container, dom.$('.sessions-chat-attach-button'));
		attachButton.tabIndex = 0;
		attachButton.role = 'button';
		attachButton.title = localize('addContext', "Add Context...");
		attachButton.ariaLabel = localize('addContext', "Add Context...");
		dom.append(attachButton, renderIcon(Codicon.add));
		this._register(dom.addDisposableListener(attachButton, dom.EventType.CLICK, () => {
			this._contextAttachments.showPicker(this._getContextFolderUri());
		}));
	}

	/**
	 * Returns the folder URI for the context picker based on the current target.
	 * Local targets use the workspace folder; cloud targets construct a github-remote-file:// URI.
	 */
	private _getContextFolderUri(): URI | undefined {
		const target = this._targetPicker.selectedTarget;

		if (target === AgentSessionProviders.Background) {
			return this._folderPicker.selectedFolderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
		}

		// For cloud targets, use the repo picker's selection
		const selectedRepo = this._repoPicker.selectedRepo;
		if (selectedRepo && selectedRepo.includes('/')) {
			return URI.from({
				scheme: GITHUB_REMOTE_FILE_SCHEME,
				authority: 'github',
				path: `/${selectedRepo}/HEAD`,
			});
		}

		return undefined;
	}

	private _createBottomToolbar(container: HTMLElement): void {
		const toolbar = dom.append(container, dom.$('.sessions-chat-toolbar'));

		this._createAttachButton(toolbar);

		// Local model picker (EnhancedModelPickerActionItem)
		this._localModelPickerContainer = dom.append(toolbar, dom.$('.sessions-chat-model-picker'));
		this._createLocalModelPicker(this._localModelPickerContainer);

		// Remote model picker (action list dropdown)
		this._cloudModelPicker.render(toolbar);
		this._cloudModelPicker.setVisible(false);

		this._toolbarPickersContainer = dom.append(toolbar, dom.$('.sessions-chat-toolbar-pickers'));

		dom.append(toolbar, dom.$('.sessions-chat-toolbar-spacer'));

		this._loadingSpinner = dom.append(toolbar, dom.$('.sessions-chat-loading-spinner'));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this._loadingSpinner, localize('loading', "Loading...")));

		const sendButtonContainer = dom.append(toolbar, dom.$('.sessions-chat-send-button'));
		const sendButton = this._sendButton = this._register(new Button(sendButtonContainer, {
			secondary: true,
			title: localize('send', "Send"),
			ariaLabel: localize('send', "Send"),
		}));
		sendButton.icon = Codicon.send;
		this._register(sendButton.onDidClick(() => this._send({ openNewAfterSend: this._altKeyDown })));
		this._register(dom.addDisposableListener(dom.getWindow(container), dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Alt') {
				this._altKeyDown = true;
				sendButton.icon = Codicon.runAbove;
			}
		}));
		this._register(dom.addDisposableListener(dom.getWindow(container), dom.EventType.KEY_UP, e => {
			if (e.key === 'Alt') {
				this._altKeyDown = false;
				sendButton.icon = Codicon.send;
			}
		}));
		this._updateSendButtonState();
	}

	// --- Model picker ---

	private _createLocalModelPicker(container: HTMLElement): void {
		const delegate: IModelPickerDelegate = {
			currentModel: this._currentLanguageModel,
			setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
				this._currentLanguageModel.set(model, undefined);
				this.storageService.store(STORAGE_KEY_LAST_MODEL, model.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
				this._newSession.value?.setModelId(model.identifier);
				this._focusEditor();
			},
			getModels: () => this._getAvailableModels(),
			canManageModels: () => false,
		};

		const pickerOptions: IChatInputPickerOptions = {
			onlyShowIconsForDefaultActions: observableValue('onlyShowIcons', false),
			hoverPosition: { hoverPosition: HoverPosition.ABOVE },
		};

		const action = { id: 'sessions.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };

		const modelPicker = this.instantiationService.createInstance(
			EnhancedModelPickerActionItem, action, delegate, pickerOptions,
		);
		this._modelPickerDisposable.value = modelPicker;
		modelPicker.render(container);
	}

	private _initDefaultModel(): void {
		const models = this._getAvailableModels();
		const lastModelId = this.storageService.get(STORAGE_KEY_LAST_MODEL, StorageScope.PROFILE);
		const lastModel = lastModelId ? models.find(m => m.identifier === lastModelId) : undefined;
		if (lastModel) {
			this._currentLanguageModel.set(lastModel, undefined);
		} else if (models.length > 0) {
			this._currentLanguageModel.set(models[0], undefined);
		}
	}

	private _getAvailableModels(): ILanguageModelChatMetadataAndIdentifier[] {
		return this.languageModelsService.getLanguageModelIds()
			.map(id => {
				const metadata = this.languageModelsService.lookupLanguageModel(id);
				return metadata ? { metadata, identifier: id } : undefined;
			})
			.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && m.metadata.targetChatSessionType === AgentSessionProviders.Background);
	}

	// --- Welcome: Target & option pickers (dropdown row below input) ---

	private _renderOptionGroupPickers(): void {
		if (!this._pickersContainer) {
			return;
		}

		this._clearAllPickers();
		dom.clearNode(this._pickersContainer);

		const pickersRow = dom.append(this._pickersContainer, dom.$('.chat-full-welcome-pickers'));

		// Left half: target switcher (right-justified within its half)
		const leftHalf = dom.append(pickersRow, dom.$('.sessions-chat-pickers-left-half'));
		const targetDropdownContainer = dom.append(leftHalf, dom.$('.sessions-chat-dropdown-wrapper'));
		this._targetPicker.render(targetDropdownContainer);

		// Right half: separator + pickers (left-justified within its half)
		const rightHalf = dom.append(pickersRow, dom.$('.sessions-chat-pickers-right-half'));
		this._extensionPickersLeftContainer = dom.append(rightHalf, dom.$('.sessions-chat-pickers-left-separator'));
		this._extensionPickersLeftContainer.style.display = 'none';

		// Repo picker for cloud (rendered once, shown/hidden based on target)
		this._repoPickerContainer = dom.append(rightHalf, dom.$('.sessions-chat-extension-pickers-right'));
		this._repoPickerContainer.style.display = 'none';
		this._repoPicker.render(this._repoPickerContainer);

		// Folder picker for local (rendered once, shown/hidden based on target)
		this._folderPickerContainer = this._folderPicker.render(rightHalf);
		this._folderPickerContainer.style.display = 'none';
	}

	// --- Local session pickers ---

	private _renderLocalSessionPickers(): void {
		this._clearAllPickers();
		if (this._folderPickerContainer) {
			this._folderPickerContainer.style.display = '';
		}
		if (this._extensionPickersLeftContainer) {
			this._extensionPickersLeftContainer.style.display = 'block';
		}
		// Show local model picker, hide remote
		if (this._localModelPickerContainer) {
			this._localModelPickerContainer.style.display = '';
		}
		this._cloudModelPicker.setVisible(false);
	}

	// --- Remote session pickers ---

	private _renderRemoteSessionPickers(session: RemoteNewSession, force?: boolean): void {
		if (!this._repoPickerContainer) {
			return;
		}

		// Hide local-only pickers
		if (this._folderPickerContainer) {
			this._folderPickerContainer.style.display = 'none';
		}

		// Show remote model picker, hide local
		if (this._localModelPickerContainer) {
			this._localModelPickerContainer.style.display = 'none';
		}
		this._cloudModelPicker.setSession(session);
		this._cloudModelPicker.setVisible(true);

		// Show repo picker and separator
		if (this._extensionPickersLeftContainer) {
			this._extensionPickersLeftContainer.style.display = 'block';
		}
		this._repoPickerContainer.style.display = '';

		// Render toolbar pickers (other groups)
		this._renderToolbarPickers(session, force);
	}

	private _renderToolbarPickers(session: RemoteNewSession, force?: boolean): void {
		if (!this._toolbarPickersContainer) {
			return;
		}

		const toolbarOptions = session.getOtherOptionGroups();

		// Filter by item availability (when-clause filtering is done by the session)
		const visibleGroups = toolbarOptions.filter(option => {
			const group = option.group;
			return group.items.length > 0 || (group.commands || []).length > 0 || !!group.searchable;
		});

		if (visibleGroups.length === 0) {
			this._clearToolbarPickers();
			return;
		}

		if (!force) {
			const allMatch = visibleGroups.length === this._toolbarPickerWidgets.size && visibleGroups.every(o => this._toolbarPickerWidgets.has(o.group.id));
			if (allMatch) {
				return;
			}
		}

		this._clearToolbarPickers();

		for (const option of visibleGroups) {
			this._renderToolbarPickerWidget(option, session);
		}
	}

	private _renderToolbarPickerWidget(option: ISessionOptionGroup, session: RemoteNewSession): void {
		const { group: optionGroup, value: initialItem } = option;

		if (initialItem) {
			this._updateOptionContextKey(optionGroup.id, initialItem.id);
		}

		const initialState = { group: optionGroup, item: initialItem };
		const emitter = this._getOrCreateOptionEmitter(optionGroup.id);
		const itemDelegate: IChatSessionPickerDelegate = {
			getCurrentOption: () => session.getOptionValue(optionGroup.id) ?? initialItem,
			onDidChangeOption: emitter.event,
			setOption: (item: IChatSessionProviderOptionItem) => {
				this._updateOptionContextKey(optionGroup.id, item.id);
				emitter.fire(item);
				session.setOptionValue(optionGroup.id, item);
				this._focusEditor();
			},
			getOptionGroup: () => {
				const modelOpt = session.getModelOptionGroup();
				if (modelOpt?.group.id === optionGroup.id) {
					return modelOpt.group;
				}
				return session.getOtherOptionGroups().find(o => o.group.id === optionGroup.id)?.group;
			},
			getSessionResource: () => session.resource,
		};

		const action = toAction({ id: optionGroup.id, label: optionGroup.name, run: () => { } });
		const widget = this.instantiationService.createInstance(
			optionGroup.searchable ? SearchableOptionPickerActionItem : ChatSessionPickerActionItem,
			action, initialState, itemDelegate
		);

		this._toolbarPickerDisposables.add(widget);
		this._toolbarPickerWidgets.set(optionGroup.id, widget);

		const slot = dom.append(this._toolbarPickersContainer!, dom.$('.sessions-chat-picker-slot'));
		widget.render(slot);
	}

	private _updateOptionContextKey(optionGroupId: string, optionItemId: string): void {
		let contextKey = this._optionContextKeys.get(optionGroupId);
		if (!contextKey) {
			const rawKey = new RawContextKey<string>(`chatSessionOption.${optionGroupId}`, '');
			contextKey = rawKey.bindTo(this.contextKeyService);
			this._optionContextKeys.set(optionGroupId, contextKey);
		}
		contextKey.set(optionItemId.trim());
	}

	private _getOrCreateOptionEmitter(optionGroupId: string): Emitter<IChatSessionProviderOptionItem> {
		let emitter = this._optionEmitters.get(optionGroupId);
		if (!emitter) {
			emitter = new Emitter<IChatSessionProviderOptionItem>();
			this._optionEmitters.set(optionGroupId, emitter);
			this._toolbarPickerDisposables.add(emitter);
		}
		return emitter;
	}

	private _clearToolbarPickers(): void {
		this._toolbarPickerDisposables.clear();
		this._toolbarPickerWidgets.clear();
		this._optionEmitters.clear();
		if (this._toolbarPickersContainer) {
			dom.clearNode(this._toolbarPickersContainer);
		}
	}

	private _clearAllPickers(): void {
		this._clearToolbarPickers();
		if (this._folderPickerContainer) {
			this._folderPickerContainer.style.display = 'none';
		}
		if (this._repoPickerContainer) {
			this._repoPickerContainer.style.display = 'none';
		}
		if (this._extensionPickersLeftContainer) {
			this._extensionPickersLeftContainer.style.display = 'none';
		}
	}

	// --- Send ---

	private _updateSendButtonState(): void {
		if (!this._sendButton) {
			return;
		}
		const hasText = !!this._editor?.getModel()?.getValue().trim();
		this._sendButton.enabled = !this._sending && hasText && !(this._newSession.value?.disabled ?? true);
	}

	private async _send(options?: { skipSetup?: boolean; openNewAfterSend?: boolean }): Promise<void> {
		const query = this._editor.getModel()?.getValue().trim();
		const session = this._newSession.value;
		if (!query || !session || this._sending) {
			return;
		}

		// If chat is not set up (extension not installed or user not signed in),
		// trigger the standard chat setup flow first, then re-submit.
		if (!options?.skipSetup && this._needsChatSetup()) {
			const success = await this.commandService.executeCommand<boolean>(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, {
				dialogIcon: Codicon.agent,
				dialogTitle: this.chatEntitlementService.anonymous ?
					localize('sessions.startUsingSessions', "Start using Sessions") :
					localize('sessions.signinRequired', "Sign in to use Sessions")
			});
			if (success) {
				return await this._send({ ...options, skipSetup: true });
			}
			return;
		}

		// If the session is disabled due to missing folder/repo, open the picker
		if (session.disabled) {
			if (!this._hasRequiredRepoOrFolderSelection(session.target)) {
				this._openRepoOrFolderPicker(session.target);
			}
			return;
		}

		// Check for slash commands first
		if (this._slashCommandHandler?.tryExecuteSlashCommand(query)) {
			this._editor.getModel()?.setValue('');
			return;
		}

		session.setQuery(query);
		session.setAttachedContext(
			this._contextAttachments.attachments.length > 0 ? [...this._contextAttachments.attachments] : undefined
		);

		this._sending = true;
		this._editor.updateOptions({ readOnly: true });
		this._updateSendButtonState();
		this._updateInputLoadingState();

		this.sessionsManagementService.sendRequestForNewSession(
			session.resource,
			options?.openNewAfterSend ? { openNewSessionView: true } : undefined
		).then(() => {
			// Release ref without disposing - the service owns disposal
			this._newSession.clearAndLeak();
			this._newSessionListener.clear();
			this._contextAttachments.clear();
		}, e => {
			this.logService.error('Failed to send request:', e);
		}).finally(() => {
			this._sending = false;
			this._editor.updateOptions({ readOnly: false });
			this._updateSendButtonState();
			this._updateInputLoadingState();
		});
	}

	/**
	 * Checks whether the required folder/repo selection exists for the given session type.
	 * For Local/Background targets, checks the folder picker.
	 * For other targets, checks extension-contributed repo/folder option groups.
	 */
	private _hasRequiredRepoOrFolderSelection(sessionType: AgentSessionProviders): boolean {
		if (sessionType === AgentSessionProviders.Local || sessionType === AgentSessionProviders.Background) {
			return !!this._folderPicker.selectedFolderUri;
		}
		return !!this._repoPicker.selectedRepo;
	}

	private _openRepoOrFolderPicker(sessionType: AgentSessionProviders): void {
		if (sessionType === AgentSessionProviders.Local || sessionType === AgentSessionProviders.Background) {
			this._folderPicker.showPicker();
		} else {
			this._repoPicker.showPicker();
		}
	}

	private _needsChatSetup(): boolean {
		const { sentiment, entitlement } = this.chatEntitlementService;
		if (
			!sentiment?.installed ||						// Extension not installed: run setup to install
			sentiment?.disabled ||							// Extension disabled: run setup to enable
			sentiment?.untrusted ||							// Workspace untrusted: run setup to ask for trust
			entitlement === ChatEntitlement.Available ||	// Entitlement available: run setup to sign up
			(
				entitlement === ChatEntitlement.Unknown &&	// Entitlement unknown: run setup to sign in / sign up
				!this.chatEntitlementService.anonymous		// unless anonymous access is enabled
			)
		) {
			return true;
		}

		return false;
	}

	// --- Layout ---

	layout(_height: number, _width: number): void {
		this._editor?.layout();
	}

	focusInput(): void {
		this._editor?.focus();
	}

	updateAllowedTargets(targets: AgentSessionProviders[]): void {
		this._targetPicker.updateAllowedTargets(targets);
	}
}

// #endregion

// #region --- New Chat View Pane ---

export const SessionsViewId = 'workbench.view.sessions.chat';

/**
 * A view pane that hosts the new-session welcome widget.
 */
export class NewChatViewPane extends ViewPane {

	private _widget: NewChatWidget | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._widget = this._register(this.instantiationService.createInstance(
			NewChatWidget,
			{
				allowedTargets: this.computeAllowedTargets(),
				defaultTarget: AgentSessionProviders.Background,
			} satisfies INewChatWidgetOptions,
		));

		this._widget.render(container);
		this._widget.focusInput();

		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._widget?.updateAllowedTargets(this.computeAllowedTargets());
		}));
	}

	private computeAllowedTargets(): AgentSessionProviders[] {
		const targets: AgentSessionProviders[] = [AgentSessionProviders.Background, AgentSessionProviders.Cloud];
		return targets;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._widget?.layout(height, width);
	}

	override focus(): void {
		super.focus();
		this._widget?.focusInput();
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		if (visible) {
			this._widget?.focusInput();
		}
	}
}

// #endregion
