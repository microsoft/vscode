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
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';

import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, IContextKey, RawContextKey, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ChatSessionPosition, getResourceForNewChatSession } from '../../../../workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import { ChatSessionPickerActionItem, IChatSessionPickerDelegate } from '../../../../workbench/contrib/chat/browser/chatSessions/chatSessionPickerActionItem.js';
import { SearchableOptionPickerActionItem } from '../../../../workbench/contrib/chat/browser/chatSessions/searchableOptionPickerActionItem.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IModelPickerDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { EnhancedModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem2.js';
import { IChatInputPickerOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { getSimpleEditorOptions } from '../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js';
import { isString } from '../../../../base/common/types.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../fileTreeView/browser/githubFileSystemProvider.js';
import { FolderPicker } from './folderPicker.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { IsolationModePicker, SessionTargetPicker } from './sessionTargetPicker.js';
import { BranchPicker } from './branchPicker.js';
import { INewSession } from './newSession.js';
import { getErrorMessage } from '../../../../base/common/errors.js';

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
	private readonly _currentLanguageModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentLanguageModel', undefined);
	private readonly _modelPickerDisposable = this._register(new MutableDisposable());

	// Pending session
	private readonly _newSession = this._register(new MutableDisposable<INewSession>());
	private readonly _newSessionListener = this._register(new MutableDisposable());

	// Welcome part
	private _pickersContainer: HTMLElement | undefined;
	private _extensionPickersLeftContainer: HTMLElement | undefined;
	private _extensionPickersRightContainer: HTMLElement | undefined;
	private _inputSlot: HTMLElement | undefined;
	private readonly _folderPicker: FolderPicker;
	private _folderPickerContainer: HTMLElement | undefined;
	private readonly _pickerWidgets = new Map<string, ChatSessionPickerActionItem | SearchableOptionPickerActionItem>();
	private readonly _pickerWidgetDisposables = this._register(new DisposableStore());
	private readonly _optionEmitters = new Map<string, Emitter<IChatSessionProviderOptionItem>>();
	private readonly _selectedOptions = new Map<string, IChatSessionProviderOptionItem>();
	private readonly _optionContextKeys = new Map<string, IContextKey<string>>();
	private readonly _whenClauseKeys = new Set<string>();

	// Attached context
	private readonly _contextAttachments: NewChatContextAttachments;

	constructor(
		options: INewChatWidgetOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IModelService private readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ILogService private readonly logService: ILogService,
		@IHoverService _hoverService: IHoverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IGitService private readonly gitService: IGitService,
	) {
		super();
		this._contextAttachments = this._register(this.instantiationService.createInstance(NewChatContextAttachments));
		this._folderPicker = this._register(this.instantiationService.createInstance(FolderPicker));
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
		}));

		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (this._whenClauseKeys.size > 0 && e.affectsSome(this._whenClauseKeys)) {
				this._renderExtensionPickers(true);
			}
		}));
	}

	// --- Rendering ---

	render(container: HTMLElement): void {
		const wrapper = dom.append(container, dom.$('.sessions-chat-widget'));
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

		// Attachments row (plus button + pills) inside input area, above editor
		const attachRow = dom.append(inputArea, dom.$('.sessions-chat-attach-row'));
		this._createAttachButton(attachRow);
		const attachedContextContainer = dom.append(attachRow, dom.$('.sessions-chat-attached-context'));
		this._contextAttachments.renderAttachedContext(attachedContextContainer);

		this._createEditor(inputArea);
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
		this._isolationModePicker.setNewSession(session);
		this._branchPicker.setNewSession(session);

		// Set the current model on the session
		const currentModel = this._currentLanguageModel.get();
		if (currentModel) {
			session.setModelId(currentModel.identifier);
		}

		// Open repository for the session's repoUri
		if (session.repoUri) {
			this._openRepository(session.repoUri);
		}

		// Render extension pickers for the new session
		this._renderExtensionPickers(true);

		// Listen for session changes
		this._newSessionListener.value = session.onDidChange((changeType) => {
			if (changeType === 'repoUri' && session.repoUri) {
				this._openRepository(session.repoUri);
			}
			if (changeType === 'isolationMode') {
				this._branchPicker.setVisible(session.isolationMode === 'worktree');
			}
			if (changeType === 'options') {
				this._syncOptionsFromSession(session.resource);
				this._renderExtensionPickers();
			}
		});
	}

	private _openRepository(folderUri: URI): void {
		this.gitService.openRepository(folderUri).then(repository => {
			this._isolationModePicker.setRepository(repository);
			this._branchPicker.setRepository(repository);
		}).catch(e => {
			this.logService.warn(`Failed to open repository at ${folderUri.toString()}`, getErrorMessage(e));
			this._isolationModePicker.setRepository(undefined);
			this._branchPicker.setRepository(undefined);
		});
	}

	// --- Editor ---

	private _createEditor(container: HTMLElement): void {
		const editorContainer = dom.append(container, dom.$('.sessions-chat-editor'));

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
		};

		const widgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				ContextMenuController.ID,
			]),
		};

		this._editor = this._register(this.instantiationService.createInstance(
			CodeEditorWidget, editorContainer, editorOptions, widgetOptions,
		));
		this._editor.setModel(textModel);

		this._register(this._editor.onKeyDown(e => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				this._send();
			}
		}));

		this._register(this._editor.onDidContentSizeChange(() => {
			this._editor.layout();
		}));
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

		// For cloud targets, look for a repository option in the selected options
		for (const [groupId, option] of this._selectedOptions) {
			if (isRepoOrFolderGroup({ id: groupId, name: groupId, items: [] })) {
				const nwo = option.id; // e.g. "owner/repo"
				if (nwo && nwo.includes('/')) {
					return URI.from({
						scheme: GITHUB_REMOTE_FILE_SCHEME,
						authority: 'github',
						path: `/${nwo}/HEAD`,
					});
				}
			}
		}

		return undefined;
	}

	private _createBottomToolbar(container: HTMLElement): void {
		const toolbar = dom.append(container, dom.$('.sessions-chat-toolbar'));

		const modelPickerContainer = dom.append(toolbar, dom.$('.sessions-chat-model-picker'));
		this._createModelPicker(modelPickerContainer);

		dom.append(toolbar, dom.$('.sessions-chat-toolbar-spacer'));

		const sendButton = dom.append(toolbar, dom.$('.sessions-chat-send-button'));
		sendButton.tabIndex = 0;
		sendButton.role = 'button';
		sendButton.title = localize('send', "Send");
		dom.append(sendButton, renderIcon(Codicon.send));
		this._register(dom.addDisposableListener(sendButton, dom.EventType.CLICK, () => this._send()));
	}

	// --- Model picker ---

	private _createModelPicker(container: HTMLElement): void {
		const delegate: IModelPickerDelegate = {
			currentModel: this._currentLanguageModel,
			setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
				this._currentLanguageModel.set(model, undefined);
				this._newSession.value?.setModelId(model.identifier);
			},
			getModels: () => this._getAvailableModels(),
			canManageModels: () => true,
			showCuratedModels: () => false,
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
		if (models.length > 0) {
			this._currentLanguageModel.set(models[0], undefined);
		}

		this._register(this.languageModelsService.onDidChangeLanguageModels(() => {
			if (!this._currentLanguageModel.get()) {
				const models = this._getAvailableModels();
				if (models.length > 0) {
					this._currentLanguageModel.set(models[0], undefined);
				}
			}
		}));
	}

	private _getAvailableModels(): ILanguageModelChatMetadataAndIdentifier[] {
		return this.languageModelsService.getLanguageModelIds()
			.map(id => {
				const metadata = this.languageModelsService.lookupLanguageModel(id);
				return metadata ? { metadata, identifier: id } : undefined;
			})
			.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && this.shouldShowModel(m));
	}

	private shouldShowModel(model: ILanguageModelChatMetadataAndIdentifier): boolean {
		if (!model.metadata.isUserSelectable) {
			return false;
		}
		return true;
	}

	// --- Welcome: Target & option pickers (dropdown row below input) ---

	private _renderOptionGroupPickers(): void {
		if (!this._pickersContainer) {
			return;
		}

		this._clearExtensionPickers();
		dom.clearNode(this._pickersContainer);

		const pickersRow = dom.append(this._pickersContainer, dom.$('.chat-full-welcome-pickers'));

		// Left half: target switcher (right-justified within its half)
		const leftHalf = dom.append(pickersRow, dom.$('.sessions-chat-pickers-left-half'));
		const targetDropdownContainer = dom.append(leftHalf, dom.$('.sessions-chat-dropdown-wrapper'));
		this._targetPicker.render(targetDropdownContainer);

		// Right half: separator + pickers (left-justified within its half)
		const rightHalf = dom.append(pickersRow, dom.$('.sessions-chat-pickers-right-half'));
		this._extensionPickersLeftContainer = dom.append(rightHalf, dom.$('.sessions-chat-pickers-left-separator'));
		this._extensionPickersRightContainer = dom.append(rightHalf, dom.$('.sessions-chat-extension-pickers-right'));

		// Folder picker (rendered once, shown/hidden based on target)
		this._folderPickerContainer = this._folderPicker.render(rightHalf);
		this._folderPickerContainer.style.display = 'none';

		this._renderExtensionPickers();
	}

	// --- Welcome: Extension option pickers (Cloud target only) ---

	private _renderExtensionPickers(force?: boolean): void {
		if (!this._extensionPickersRightContainer) {
			return;
		}

		const activeSessionType = this._targetPicker.selectedTarget;

		// Extension pickers are only shown for Cloud target
		if (activeSessionType === AgentSessionProviders.Background) {
			this._clearExtensionPickers();
			if (this._folderPickerContainer) {
				this._folderPickerContainer.style.display = '';
			}
			if (this._extensionPickersLeftContainer) {
				this._extensionPickersLeftContainer.style.display = 'block';
			}
			return;
		}

		const optionGroups = this.chatSessionsService.getOptionGroupsForSessionType(activeSessionType);
		if (!optionGroups || optionGroups.length === 0) {
			this._clearExtensionPickers();
			return;
		}

		const visibleGroups: IChatSessionProviderOptionGroup[] = [];
		this._whenClauseKeys.clear();
		for (const group of optionGroups) {
			if (isModelOptionGroup(group)) {
				continue;
			}
			if (group.when) {
				const expr = ContextKeyExpr.deserialize(group.when);
				if (expr) {
					for (const key of expr.keys()) {
						this._whenClauseKeys.add(key);
					}
				}
			}
			const hasItems = group.items.length > 0 || (group.commands || []).length > 0 || !!group.searchable;
			const passesWhenClause = this._evaluateOptionGroupVisibility(group);
			if (hasItems && passesWhenClause) {
				visibleGroups.push(group);
			}
		}

		if (visibleGroups.length === 0) {
			this._clearExtensionPickers();
			return;
		}

		if (!force && this._pickerWidgets.size === visibleGroups.length) {
			const allMatch = visibleGroups.every(g => this._pickerWidgets.has(g.id));
			if (allMatch) {
				return;
			}
		}

		this._clearExtensionPickers();

		if (this._extensionPickersLeftContainer) {
			this._extensionPickersLeftContainer.style.display = 'block';
		}

		for (const optionGroup of visibleGroups) {
			const initialItem = this._getDefaultOptionForGroup(optionGroup);
			const initialState = { group: optionGroup, item: initialItem };

			if (initialItem) {
				this._updateOptionContextKey(optionGroup.id, initialItem.id);
			}

			const emitter = this._getOrCreateOptionEmitter(optionGroup.id);
			const itemDelegate: IChatSessionPickerDelegate = {
				getCurrentOption: () => this._selectedOptions.get(optionGroup.id) ?? this._getDefaultOptionForGroup(optionGroup),
				onDidChangeOption: emitter.event,
				setOption: (option: IChatSessionProviderOptionItem) => {
					this._selectedOptions.set(optionGroup.id, option);
					this._updateOptionContextKey(optionGroup.id, option.id);
					emitter.fire(option);

					this._newSession.value?.setOption(optionGroup.id, option);

					this._renderExtensionPickers(true);
				},
				getOptionGroup: () => {
					const groups = this.chatSessionsService.getOptionGroupsForSessionType(activeSessionType);
					return groups?.find((g: { id: string }) => g.id === optionGroup.id);
				},
				getSessionResource: () => this._newSession.value?.resource,
			};

			const action = toAction({ id: optionGroup.id, label: optionGroup.name, run: () => { } });
			const widget = this.instantiationService.createInstance(
				optionGroup.searchable ? SearchableOptionPickerActionItem : ChatSessionPickerActionItem,
				action, initialState, itemDelegate
			);

			this._pickerWidgetDisposables.add(widget);
			this._pickerWidgets.set(optionGroup.id, widget);

			const slot = dom.append(this._extensionPickersRightContainer!, dom.$('.sessions-chat-picker-slot'));
			widget.render(slot);
		}
	}

	private _evaluateOptionGroupVisibility(optionGroup: { id: string; when?: string }): boolean {
		if (!optionGroup.when) {
			return true;
		}
		const expr = ContextKeyExpr.deserialize(optionGroup.when);
		return !expr || this.contextKeyService.contextMatchesRules(expr);
	}

	private _getDefaultOptionForGroup(optionGroup: IChatSessionProviderOptionGroup): IChatSessionProviderOptionItem | undefined {
		const selectedOption = this._selectedOptions.get(optionGroup.id);
		if (selectedOption) {
			return selectedOption;
		}

		if (this._newSession.value) {
			const sessionOption = this.chatSessionsService.getSessionOption(this._newSession.value.resource, optionGroup.id);
			if (!isString(sessionOption)) {
				return sessionOption;
			}
		}

		return optionGroup.items.find((item) => item.default === true);
	}

	private _syncOptionsFromSession(sessionResource: URI): void {
		const activeSessionType = this._targetPicker.selectedTarget;
		if (!activeSessionType) {
			return;
		}
		const optionGroups = this.chatSessionsService.getOptionGroupsForSessionType(activeSessionType);
		if (!optionGroups) {
			return;
		}
		for (const optionGroup of optionGroups) {
			if (isModelOptionGroup(optionGroup)) {
				continue;
			}
			const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id);
			if (!currentOption) {
				continue;
			}
			let item: IChatSessionProviderOptionItem | undefined;
			if (typeof currentOption === 'string') {
				item = optionGroup.items.find((m: { id: string }) => m.id === currentOption.trim());
			} else {
				item = currentOption;
			}
			if (item) {
				const { locked: _locked, ...unlocked } = item;
				this._selectedOptions.set(optionGroup.id, unlocked as IChatSessionProviderOptionItem);
				this._updateOptionContextKey(optionGroup.id, item.id);
				this._optionEmitters.get(optionGroup.id)?.fire(item);
			}
		}
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
			this._pickerWidgetDisposables.add(emitter);
		}
		return emitter;
	}

	private _clearExtensionPickers(): void {
		this._pickerWidgetDisposables.clear();
		this._pickerWidgets.clear();
		this._optionEmitters.clear();
		if (this._folderPickerContainer) {
			this._folderPickerContainer.style.display = 'none';
		}
		if (this._extensionPickersLeftContainer) {
			this._extensionPickersLeftContainer.style.display = 'none';
		}
		if (this._extensionPickersRightContainer) {
			dom.clearNode(this._extensionPickersRightContainer);
		}
	}

	// --- Send ---

	private _send(): void {
		const query = this._editor.getModel()?.getValue().trim();
		const session = this._newSession.value;
		if (!query || !session) {
			return;
		}

		session.setQuery(query);
		session.setAttachedContext(
			this._contextAttachments.attachments.length > 0 ? [...this._contextAttachments.attachments] : undefined
		);

		this.sessionsManagementService.sendRequestForNewSession(
			session.resource
		).catch(e => this.logService.error('Failed to send request:', e));

		// Clear sent session so a fresh one is created next time
		this._newSession.clear();
		this._newSessionListener.clear();
		this._contextAttachments.clear();
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

/**
 * Check whether an option group represents the model picker.
 * The convention is `id: 'models'` but extensions may use different IDs
 * per session type, so we also fall back to name matching.
 */
function isModelOptionGroup(group: IChatSessionProviderOptionGroup): boolean {
	if (group.id === 'models') {
		return true;
	}
	const nameLower = group.name.toLowerCase();
	return nameLower === 'model' || nameLower === 'models';
}

/**
 * Check whether an option group represents a repository or folder picker.
 * These are placed on the right side of the pickers row.
 */
function isRepoOrFolderGroup(group: IChatSessionProviderOptionGroup): boolean {
	const idLower = group.id.toLowerCase();
	const nameLower = group.name.toLowerCase();
	return idLower === 'repositories' || idLower === 'folders' ||
		nameLower === 'repository' || nameLower === 'repositories' ||
		nameLower === 'folder' || nameLower === 'folders';
}
