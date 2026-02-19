/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWidget.css';
import './media/chatWelcomePart.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Separator, toAction } from '../../../../base/common/actions.js';
import { Radio } from '../../../../base/browser/ui/radio/radio.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
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
import { basename, isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ChatSessionPosition, getResourceForNewChatSession } from '../../../../workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import { ChatSessionPickerActionItem, IChatSessionPickerDelegate } from '../../../../workbench/contrib/chat/browser/chatSessions/chatSessionPickerActionItem.js';
import { SearchableOptionPickerActionItem } from '../../../../workbench/contrib/chat/browser/chatSessions/searchableOptionPickerActionItem.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatSendRequestOptions } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IModelPickerDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { EnhancedModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem2.js';
import { IChatInputPickerOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { WorkspaceFolderCountContext } from '../../../../workbench/common/contextkeys.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspacesService, IRecentFolder, isRecentFolder } from '../../../../platform/workspaces/common/workspaces.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { getSimpleEditorOptions } from '../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { isString } from '../../../../base/common/types.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';

// #region --- Target Config ---

/**
 * A dropdown menu action item that shows an icon, a text label, and a chevron.
 */
class LabeledDropdownMenuActionViewItem extends DropdownMenuActionViewItem {
	protected override renderLabel(element: HTMLElement): null {
		// Render icon as a separate codicon element
		const classNames = typeof this.options.classNames === 'string'
			? this.options.classNames.split(/\s+/g).filter(s => !!s)
			: (this.options.classNames ?? []);
		if (classNames.length > 0) {
			const icon = dom.append(element, dom.$('span'));
			icon.classList.add('codicon', ...classNames);
		}

		// Add text label (not affected by codicon font)
		const label = dom.append(element, dom.$('span.sessions-chat-dropdown-label'));
		label.textContent = this._action.label;

		// Add chevron
		dom.append(element, renderIcon(Codicon.chevronDown));

		return null;
	}
}

/**
 * Tracks which agent session targets are available and which is selected.
 * Targets are fixed at construction time; only the selection changes.
 */
export interface ITargetConfig {
	readonly allowedTargets: IObservable<ReadonlySet<AgentSessionProviders>>;
	readonly selectedTarget: IObservable<AgentSessionProviders | undefined>;
	readonly onDidChangeSelectedTarget: Event<AgentSessionProviders | undefined>;
	readonly onDidChangeAllowedTargets: Event<ReadonlySet<AgentSessionProviders>>;
	setSelectedTarget(target: AgentSessionProviders): void;
}

export interface ITargetConfigOptions {
	allowedTargets: AgentSessionProviders[];
	defaultTarget?: AgentSessionProviders;
}

class TargetConfig extends Disposable implements ITargetConfig {

	private readonly _allowedTargets = observableValue<ReadonlySet<AgentSessionProviders>>('allowedTargets', new Set());
	readonly allowedTargets: IObservable<ReadonlySet<AgentSessionProviders>> = this._allowedTargets;

	private readonly _selectedTarget = observableValue<AgentSessionProviders | undefined>('selectedTarget', undefined);
	readonly selectedTarget: IObservable<AgentSessionProviders | undefined> = this._selectedTarget;

	private readonly _onDidChangeSelectedTarget = this._register(new Emitter<AgentSessionProviders | undefined>());
	readonly onDidChangeSelectedTarget = this._onDidChangeSelectedTarget.event;

	private readonly _onDidChangeAllowedTargets = this._register(new Emitter<ReadonlySet<AgentSessionProviders>>());
	readonly onDidChangeAllowedTargets = this._onDidChangeAllowedTargets.event;

	constructor(options: ITargetConfigOptions) {
		super();
		const initialSet = new Set(options.allowedTargets);
		this._allowedTargets.set(initialSet, undefined);
		const defaultTarget = options.defaultTarget && initialSet.has(options.defaultTarget)
			? options.defaultTarget
			: initialSet.values().next().value;
		this._selectedTarget.set(defaultTarget, undefined);
	}

	setSelectedTarget(target: AgentSessionProviders): void {
		const allowed = this._allowedTargets.get();
		if (!allowed.has(target)) {
			throw new Error(`Target "${target}" is not in the allowed set`);
		}
		if (this._selectedTarget.get() !== target) {
			this._selectedTarget.set(target, undefined);
			this._onDidChangeSelectedTarget.fire(target);
		}
	}

	setAllowedTargets(targets: AgentSessionProviders[]): void {
		const newSet = new Set(targets);
		this._allowedTargets.set(newSet, undefined);
		this._onDidChangeAllowedTargets.fire(newSet);

		// If the currently selected target is no longer allowed, switch to the first allowed target
		const current = this._selectedTarget.get();
		if (current && !newSet.has(current)) {
			const fallback = newSet.values().next().value;
			this._selectedTarget.set(fallback, undefined);
			this._onDidChangeSelectedTarget.fire(fallback);
		}
	}
}

// #endregion

// #region --- Chat Welcome Widget ---

/**
 * Data passed to the `onSendRequest` callback when the user submits a query.
 */
export interface INewChatSendRequestData {
	readonly resource: URI;
	readonly target: AgentSessionProviders;
	readonly query: string;
	readonly sendOptions: IChatSendRequestOptions;
	readonly selectedOptions: ReadonlyMap<string, IChatSessionProviderOptionItem>;
	readonly folderUri?: URI;
	readonly attachedContext?: IChatRequestVariableEntry[];
}

/**
 * Options for creating a `NewChatWidget`.
 */
export interface INewChatWidgetOptions {
	readonly targetConfig: ITargetConfigOptions;
	readonly onSendRequest?: (data: INewChatSendRequestData) => void;
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

	private readonly _targetConfig: TargetConfig;
	private readonly _options: INewChatWidgetOptions;

	// Input
	private _editor!: CodeEditorWidget;
	private readonly _currentLanguageModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentLanguageModel', undefined);
	private readonly _modelPickerDisposable = this._register(new MutableDisposable());
	private _pendingSessionResource: URI | undefined;

	// Welcome part
	private readonly _welcomeContentDisposables = this._register(new DisposableStore());
	private _pickersContainer: HTMLElement | undefined;
	private _targetDropdownContainer: HTMLElement | undefined;
	private _extensionPickersLeftContainer: HTMLElement | undefined;
	private _extensionPickersRightContainer: HTMLElement | undefined;
	private _inputSlot: HTMLElement | undefined;
	private _localModeContainer: HTMLElement | undefined;
	private _localModeDropdownContainer: HTMLElement | undefined;
	private _localModePickersContainer: HTMLElement | undefined;
	private _localMode: 'workspace' | 'worktree' = 'worktree';
	private _selectedFolderUri: URI | undefined;
	private _recentlyPickedFolders: URI[] = [];
	private _cachedRecentFolders: IRecentFolder[] = [];
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
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ILogService private readonly logService: ILogService,
		@IHoverService _hoverService: IHoverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._contextAttachments = this._register(this.instantiationService.createInstance(NewChatContextAttachments));
		this._targetConfig = this._register(new TargetConfig(options.targetConfig));
		this._options = options;

		// Restore last picked folder and recently picked folders
		const lastFolder = this.storageService.get('agentSessions.lastPickedFolder', StorageScope.PROFILE);
		if (lastFolder) {
			try { this._selectedFolderUri = URI.parse(lastFolder); } catch { /* ignore */ }
		}
		try {
			const stored = this.storageService.get('agentSessions.recentlyPickedFolders', StorageScope.PROFILE);
			if (stored) {
				this._recentlyPickedFolders = JSON.parse(stored).map((s: string) => URI.parse(s));
			}
		} catch { /* ignore */ }

		// Pre-fetch recently opened folders
		this.workspacesService.getRecentlyOpened().then(recent => {
			this._cachedRecentFolders = recent.workspaces.filter(isRecentFolder).slice(0, 10);
		}).catch(error => {
			this.logService.error('Failed to fetch recently opened workspaces for agent sessions', error);
		});

		// When target changes, regenerate pending resource
		this._register(this._targetConfig.onDidChangeSelectedTarget(() => {
			this._generatePendingSessionResource();
			this._notifyFolderSelection();
			this._renderExtensionPickers(true);
			this._renderLocalModePicker();
		}));

		this._register(this._targetConfig.onDidChangeAllowedTargets(() => {
			if (this._targetDropdownContainer) {
				dom.clearNode(this._targetDropdownContainer);
				this._renderTargetDropdown(this._targetDropdownContainer);
			}
			this._renderExtensionPickers(true);
		}));

		// Listen for option group changes to re-render pickers
		this._register(this.chatSessionsService.onDidChangeOptionGroups(() => this._renderExtensionPickers()));

		// React to chat session option changes
		this._register(this.chatSessionsService.onDidChangeSessionOptions((e: URI | undefined) => {
			if (this._pendingSessionResource && isEqual(this._pendingSessionResource, e)) {
				this._syncOptionsFromSession(this._pendingSessionResource);
				this._renderExtensionPickers();
			}
		}));

		const workspaceFolderCountKey = new Set([WorkspaceFolderCountContext.key]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(workspaceFolderCountKey)) {
				this._renderExtensionPickers(true);
			}
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

		// Attachments row (plus button + pills) inside input area, above editor
		const attachRow = dom.append(inputArea, dom.$('.sessions-chat-attach-row'));
		this._createAttachButton(attachRow);
		const attachedContextContainer = dom.append(attachRow, dom.$('.sessions-chat-attached-context'));
		this._contextAttachments.renderAttachedContext(attachedContextContainer);

		this._createEditor(inputArea);
		this._createBottomToolbar(inputArea);
		this._inputSlot.appendChild(inputArea);

		// Local mode picker (below the input, shown when Local is selected)
		this._localModeContainer = dom.append(welcomeElement, dom.$('.chat-full-welcome-local-mode'));
		this._localModeDropdownContainer = dom.append(this._localModeContainer, dom.$('.sessions-chat-local-mode-left'));
		dom.append(this._localModeContainer, dom.$('.sessions-chat-local-mode-spacer'));
		this._localModePickersContainer = dom.append(this._localModeContainer, dom.$('.sessions-chat-local-mode-right'));

		// Render target buttons & extension pickers
		this._renderOptionGroupPickers();

		// Initialize model picker
		this._initDefaultModel();

		// Generate pending resource for option changes
		this._generatePendingSessionResource();

		// Render local mode picker
		this._renderLocalModePicker();

		// Reveal
		welcomeElement.classList.add('revealed');
	}

	private _getEffectiveTarget(): AgentSessionProviders | undefined {
		const target = this._targetConfig.selectedTarget.get();
		if (target === AgentSessionProviders.Local && this._localMode === 'worktree') {
			return AgentSessionProviders.Background;
		}
		return target;
	}

	private readonly _pendingSessionResources = new Map<string, URI>();

	private _generatePendingSessionResource(): void {
		const target = this._getEffectiveTarget();
		if (!target || target === AgentSessionProviders.Local) {
			this._pendingSessionResource = undefined;
			return;
		}

		// Reuse existing pending resource for the same target type
		const existing = this._pendingSessionResources.get(target);
		if (existing) {
			this._pendingSessionResource = existing;
			return;
		}

		this._pendingSessionResource = getResourceForNewChatSession({
			type: target,
			position: this._options.sessionPosition ?? ChatSessionPosition.Sidebar,
			displayName: '',
		});
		this._pendingSessionResources.set(target, this._pendingSessionResource);

		// Create the session in the extension so that session options can be stored
		this.chatSessionsService.getOrCreateChatSession(this._pendingSessionResource, CancellationToken.None)
			.catch((err) => this.logService.trace('Failed to create pending session:', err));
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
		this._register(dom.addDisposableListener(attachButton, dom.EventType.CLICK, () => this._contextAttachments.showPicker()));
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
				this.languageModelsService.addToRecentlyUsedList(model);
			},
			getModels: () => this._getAvailableModels(),
			canManageModels: () => true,
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
		if (model.metadata.targetChatSessionType === AgentSessionProviders.Background) {
			return false;
		}
		return true;
	}

	// --- Welcome: Target & option pickers (dropdown row below input) ---

	private _renderOptionGroupPickers(): void {
		if (!this._pickersContainer) {
			return;
		}

		this._disposePickerWidgets();
		dom.clearNode(this._pickersContainer);

		const pickersRow = dom.append(this._pickersContainer, dom.$('.chat-full-welcome-pickers'));

		// Left half: target switcher (right-justified within its half)
		const leftHalf = dom.append(pickersRow, dom.$('.sessions-chat-pickers-left-half'));
		this._targetDropdownContainer = dom.append(leftHalf, dom.$('.sessions-chat-dropdown-wrapper'));
		this._renderTargetDropdown(this._targetDropdownContainer);

		// Right half: separator + pickers (left-justified within its half)
		const rightHalf = dom.append(pickersRow, dom.$('.sessions-chat-pickers-right-half'));
		this._extensionPickersLeftContainer = dom.append(rightHalf, dom.$('.sessions-chat-pickers-left-separator'));
		this._extensionPickersRightContainer = dom.append(rightHalf, dom.$('.sessions-chat-extension-pickers-right'));

		this._renderExtensionPickers();
	}

	private _renderTargetDropdown(container: HTMLElement): void {
		const allowed = this._targetConfig.allowedTargets.get();
		if (allowed.size === 0) {
			return;
		}

		const activeType = this._targetConfig.selectedTarget.get() ?? AgentSessionProviders.Local;
		const targets = [AgentSessionProviders.Local, AgentSessionProviders.Cloud].filter(t => allowed.has(t));
		const activeIndex = targets.indexOf(activeType);

		const radio = new Radio({
			items: targets.map(target => ({
				text: getAgentSessionProviderName(target),
				isActive: target === activeType,
			})),
		});
		this._welcomeContentDisposables.add(radio);
		container.appendChild(radio.domNode);

		if (activeIndex >= 0) {
			radio.setActiveItem(activeIndex);
		}

		this._welcomeContentDisposables.add(radio.onDidSelect(index => {
			this._targetConfig.setSelectedTarget(targets[index]);
		}));
	}

	// --- Local mode picker (Workspace / Worktree) ---

	private readonly _localModeDisposables = this._register(new DisposableStore());

	private _renderLocalModePicker(): void {
		if (!this._localModeContainer || !this._localModeDropdownContainer || !this._localModePickersContainer) {
			return;
		}

		this._localModeDisposables.clear();
		dom.clearNode(this._localModeDropdownContainer);
		dom.clearNode(this._localModePickersContainer);

		const selectedTarget = this._targetConfig.selectedTarget.get();
		if (selectedTarget !== AgentSessionProviders.Local) {
			this._localModeContainer.style.visibility = 'hidden';
			return;
		}

		this._localModeContainer.style.visibility = '';

		// Dropdown button for Workspace / Worktree
		const modeLabel = this._localMode === 'workspace'
			? localize('localMode.workspace', "Workspace")
			: localize('localMode.worktree', "Worktree");
		const modeIcon = this._localMode === 'workspace' ? Codicon.folder : Codicon.worktree;

		const modeAction = toAction({ id: 'localMode', label: modeLabel, run: () => { } });
		const modeDropdown = this._localModeDisposables.add(new LabeledDropdownMenuActionViewItem(
			modeAction,
			{
				getActions: () => [
					toAction({
						id: 'localMode.workspace',
						label: localize('localMode.workspace', "Workspace"),
						checked: this._localMode === 'workspace',
						run: () => this._setLocalMode('workspace'),
					}),
					toAction({
						id: 'localMode.worktree',
						label: localize('localMode.worktree', "Worktree"),
						checked: this._localMode === 'worktree',
						run: () => this._setLocalMode('worktree'),
					}),
				],
			},
			this.contextMenuService,
			{ classNames: [...ThemeIcon.asClassNameArray(modeIcon)] }
		));
		const modeSlot = dom.append(this._localModeDropdownContainer, dom.$('.sessions-chat-picker-slot'));
		modeDropdown.render(modeSlot);

		// Render pickers in the right side
		this._renderLocalModePickers();
	}

	private _setLocalMode(mode: 'workspace' | 'worktree'): void {
		if (this._localMode !== mode) {
			this._localMode = mode;
			this._generatePendingSessionResource();
			this._notifyFolderSelection();
			this._renderLocalModePicker();
		}
	}

	private _notifyFolderSelection(): void {
		this._selectedOptions.clear();
		if (!this._pendingSessionResource) {
			return;
		}
		const folderUri = this._selectedFolderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
		if (folderUri) {
			this.chatSessionsService.notifySessionOptionsChange(
				this._pendingSessionResource,
				[{ optionId: 'repository', value: folderUri.fsPath }]
			).catch((err) => this.logService.error('Failed to notify extension of folder selection:', err));
		}
	}

	private _addToRecentlyPickedFolders(folderUri: URI): void {
		this._recentlyPickedFolders = [folderUri, ...this._recentlyPickedFolders.filter(f => !isEqual(f, folderUri))].slice(0, 10);
		this.storageService.store('agentSessions.recentlyPickedFolders', JSON.stringify(this._recentlyPickedFolders.map(f => f.toString())), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _renderLocalModePickers(): void {
		if (!this._localModePickersContainer) {
			return;
		}
		dom.clearNode(this._localModePickersContainer);

		if (this._localMode === 'worktree') {
			// Worktree mode: render extension pickers for Background provider
			this._renderExtensionPickersInContainer(this._localModePickersContainer, AgentSessionProviders.Background);
		}
	}

	// --- Welcome: Extension option pickers ---

	private _renderExtensionPickers(force?: boolean): void {
		if (!this._extensionPickersRightContainer) {
			return;
		}

		const activeSessionType = this._getEffectiveTarget();
		if (!activeSessionType) {
			this._clearExtensionPickers();
			return;
		}

		// For Local target, show folder picker in top row and handle bottom row
		if (this._targetConfig.selectedTarget.get() === AgentSessionProviders.Local) {
			this._clearExtensionPickers();
			this._renderLocalFolderPickerInTopRow();
			this._renderLocalModePicker();
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

		visibleGroups.sort((a, b) => {
			// Repo/folder pickers first, then others
			const aRepo = isRepoOrFolderGroup(a) ? 0 : 1;
			const bRepo = isRepoOrFolderGroup(b) ? 0 : 1;
			if (aRepo !== bRepo) {
				return aRepo - bRepo;
			}
			return (a.when ? 1 : 0) - (b.when ? 1 : 0);
		});

		if (!force && this._pickerWidgets.size === visibleGroups.length) {
			const allMatch = visibleGroups.every(g => this._pickerWidgets.has(g.id));
			if (allMatch) {
				return;
			}
		}

		this._clearExtensionPickers();

		// Show the separator between target switcher and extension pickers
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

					if (this._pendingSessionResource) {
						this.chatSessionsService.notifySessionOptionsChange(
							this._pendingSessionResource,
							[{ optionId: optionGroup.id, value: option }]
						).catch((err) => this.logService.error(`Failed to notify extension of ${optionGroup.id} change:`, err));
					}

					this._renderExtensionPickers(true);
				},
				getOptionGroup: () => {
					const groups = this.chatSessionsService.getOptionGroupsForSessionType(activeSessionType);
					return groups?.find((g: { id: string }) => g.id === optionGroup.id);
				},
				getSessionResource: () => this._pendingSessionResource,
			};

			const action = toAction({ id: optionGroup.id, label: optionGroup.name, run: () => { } });
			const widget = this.instantiationService.createInstance(
				optionGroup.searchable ? SearchableOptionPickerActionItem : ChatSessionPickerActionItem,
				action, initialState, itemDelegate
			);

			this._pickerWidgetDisposables.add(widget);
			this._pickerWidgets.set(optionGroup.id, widget);

			// All pickers go to the right
			const targetContainer = this._extensionPickersRightContainer!;

			const slot = dom.append(targetContainer, dom.$('.sessions-chat-picker-slot'));
			widget.render(slot);
		}
	}

	private _renderLocalFolderPickerInTopRow(): void {
		if (!this._extensionPickersRightContainer) {
			return;
		}

		// Show the separator
		if (this._extensionPickersLeftContainer) {
			this._extensionPickersLeftContainer.style.display = 'block';
		}

		this._renderLocalFolderPickerInContainer(this._extensionPickersRightContainer, this._pickerWidgetDisposables);
	}

	private _renderLocalFolderPickerInContainer(container: HTMLElement, disposables: DisposableStore): void {
		const currentFolderUri = this._selectedFolderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
		const folderName = currentFolderUri ? basename(currentFolderUri) : localize('pickFolder', "Pick Folder");

		const switchFolder = async (folderUri: URI) => {
			this._selectedFolderUri = folderUri;
			this._addToRecentlyPickedFolders(folderUri);
			this.storageService.store('agentSessions.lastPickedFolder', folderUri.toString(), StorageScope.PROFILE, StorageTarget.MACHINE);
			this._notifyFolderSelection();
			this._renderExtensionPickers(true);
		};

		const folderAction = toAction({ id: 'folderPicker', label: folderName, run: () => { } });
		const folderDropdown = disposables.add(new LabeledDropdownMenuActionViewItem(
			folderAction,
			{
				getActions: () => this._getFolderPickerActions(currentFolderUri, switchFolder),
			},
			this.contextMenuService,
			{ classNames: [...ThemeIcon.asClassNameArray(Codicon.folder)] }
		));
		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		folderDropdown.render(slot);
	}

	private _getFolderPickerActions(currentFolderUri: URI | undefined, switchFolder: (uri: URI) => Promise<void>): (ReturnType<typeof toAction> | Separator)[] {
		const seenUris = new Set<string>();
		if (currentFolderUri) {
			seenUris.add(currentFolderUri.toString());
		}

		const actions: (ReturnType<typeof toAction> | Separator)[] = [];

		// Combine recently picked folders and recently opened folders (picked first, then opened)
		const allFolders: { uri: URI; label?: string }[] = [
			...this._recentlyPickedFolders.map(uri => ({ uri })),
			...this._cachedRecentFolders.map(r => ({ uri: r.folderUri, label: r.label })),
		];
		for (const folder of allFolders) {
			const key = folder.uri.toString();
			if (seenUris.has(key)) {
				continue;
			}
			seenUris.add(key);
			actions.push(toAction({
				id: key,
				label: folder.label || basename(folder.uri),
				run: () => switchFolder(folder.uri),
			}));
		}

		actions.push(new Separator());
		actions.push(toAction({
			id: 'browse',
			label: localize('browseFolder', "Browse..."),
			run: async () => {
				const selected = await this.fileDialogService.showOpenDialog({
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					title: localize('selectFolder', "Select Folder"),
				});
				if (selected?.[0]) {
					await switchFolder(selected[0]);
				}
			},
		}));

		return actions;
	}

	private _renderExtensionPickersInContainer(container: HTMLElement, sessionType: AgentSessionProviders): void {
		const optionGroups = this.chatSessionsService.getOptionGroupsForSessionType(sessionType);
		if (!optionGroups || optionGroups.length === 0) {
			return;
		}

		const visibleGroups: IChatSessionProviderOptionGroup[] = [];
		for (const group of optionGroups) {
			if (isModelOptionGroup(group)) {
				continue;
			}
			if (group.id === 'repository') {
				continue;
			}
			const hasItems = group.items.length > 0 || (group.commands || []).length > 0 || !!group.searchable;
			const passesWhenClause = this._evaluateOptionGroupVisibility(group);
			if (hasItems && passesWhenClause) {
				visibleGroups.push(group);
			}
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

					if (this._pendingSessionResource) {
						this.chatSessionsService.notifySessionOptionsChange(
							this._pendingSessionResource,
							[{ optionId: optionGroup.id, value: option }]
						).catch((err) => this.logService.error(`Failed to notify extension of ${optionGroup.id} change:`, err));
					}

					this._renderLocalModePickers();
				},
				getOptionGroup: () => {
					const groups = this.chatSessionsService.getOptionGroupsForSessionType(sessionType);
					return groups?.find((g: { id: string }) => g.id === optionGroup.id);
				},
				getSessionResource: () => this._pendingSessionResource,
			};

			const action = toAction({ id: optionGroup.id, label: optionGroup.name, run: () => { } });
			const widget = this.instantiationService.createInstance(
				optionGroup.searchable ? SearchableOptionPickerActionItem : ChatSessionPickerActionItem,
				action, initialState, itemDelegate
			);

			this._localModeDisposables.add(widget);

			const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
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

		if (this._pendingSessionResource) {
			const sessionOption = this.chatSessionsService.getSessionOption(this._pendingSessionResource, optionGroup.id);
			if (!isString(sessionOption)) {
				return sessionOption;
			}
		}

		return optionGroup.items.find((item) => item.default === true);
	}

	private _syncOptionsFromSession(sessionResource: URI): void {
		const activeSessionType = this._getEffectiveTarget();
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

	private _disposePickerWidgets(): void {
		this._pickerWidgetDisposables.clear();
		this._pickerWidgets.clear();
		this._optionEmitters.clear();
	}

	private _clearExtensionPickers(): void {
		this._pickerWidgetDisposables.clear();
		this._pickerWidgets.clear();
		this._optionEmitters.clear();
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
		if (!query) {
			return;
		}

		const target = this._getEffectiveTarget();
		if (!target) {
			this.logService.warn('ChatWelcomeWidget: No target selected, cannot create session');
			return;
		}

		const position = this._options.sessionPosition ?? ChatSessionPosition.Sidebar;
		const resource = this._pendingSessionResource
			?? getResourceForNewChatSession({ type: target, position, displayName: '' });

		const contribution = target !== AgentSessionProviders.Local
			? this.chatSessionsService.getChatSessionContribution(target)
			: undefined;

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: this._currentLanguageModel.get()?.identifier,
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				modeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
			},
			agentIdSilent: contribution?.type,
			attachedContext: this._contextAttachments.attachments.length > 0 ? [...this._contextAttachments.attachments] : undefined,
		};

		const folderUri = this._selectedFolderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;

		this._options.onSendRequest?.({
			resource,
			target,
			query,
			sendOptions,
			selectedOptions: new Map(this._selectedOptions),
			folderUri,
			attachedContext: this._contextAttachments.attachments.length > 0 ? [...this._contextAttachments.attachments] : undefined,
		});

		this._contextAttachments.clear();
	}

	// --- Layout ---

	layout(_height: number, _width: number): void {
		this._editor?.layout();
	}

	setVisible(_visible: boolean): void {
		// no-op
	}

	focusInput(): void {
		this._editor?.focus();
	}

	updateAllowedTargets(targets: AgentSessionProviders[]): void {
		this._targetConfig.setAllowedTargets(targets);
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
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._widget = this._register(this.instantiationService.createInstance(
			NewChatWidget,
			{
				targetConfig: {
					allowedTargets: this.computeAllowedTargets(),
					defaultTarget: AgentSessionProviders.Local,
				},
				onSendRequest: (data) => {
					this.activeSessionService.sendRequestForNewSession(
						data.resource, data.query, data.sendOptions, data.selectedOptions, data.folderUri
					).catch(e => this.logService.error('NewChatViewPane: Failed to open session and send request', e));
				},
			} satisfies INewChatWidgetOptions,
		));

		this._widget.render(container);
		this._widget.focusInput();

		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._widget?.updateAllowedTargets(this.computeAllowedTargets());
		}));
	}

	private computeAllowedTargets(): AgentSessionProviders[] {
		const targets: AgentSessionProviders[] = [AgentSessionProviders.Local, AgentSessionProviders.Cloud];
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
		this._widget?.setVisible(visible);
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

function getAgentSessionProviderName(provider: AgentSessionProviders): string {
	switch (provider) {
		case AgentSessionProviders.Local:
			return localize('chat.session.providerLabel.local', "Local");
		case AgentSessionProviders.Background:
			return localize('chat.session.providerLabel.background', "Worktree");
		case AgentSessionProviders.Cloud:
			return localize('chat.session.providerLabel.cloud', "Cloud");
		case AgentSessionProviders.Claude:
			return 'Claude';
		case AgentSessionProviders.Codex:
			return 'Codex';
		case AgentSessionProviders.Growth:
			return 'Growth';
	}
}
