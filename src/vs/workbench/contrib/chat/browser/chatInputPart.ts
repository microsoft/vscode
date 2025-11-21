/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { addDisposableListener } from '../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { IHistoryNavigationWidget } from '../../../../base/browser/history.js';
import { hasModifierKeys, StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { Button, ButtonWithIcon } from '../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate, getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../base/common/actions.js';
import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { DeferredPromise, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { HistoryNavigator2 } from '../../../../base/common/history.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, derived, derivedOpts, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOptions, IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IDimension } from '../../../../editor/common/core/2d/dimension.js';
import { IPosition } from '../../../../editor/common/core/position.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { CopyPasteController } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { DropIntoEditorController } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { GlyphHoverController } from '../../../../editor/contrib/hover/browser/glyphHoverController.js';
import { LinkDetector } from '../../../../editor/contrib/links/browser/links.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { MenuWorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerAndCreateHistoryNavigationContext } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { ResourceLabels } from '../../../browser/labels.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../../codeEditor/browser/simpleEditorOptions.js';
import { IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../common/chatEditingService.js';
import { IChatModelInputState, IChatRequestModeInfo, IInputModel } from '../common/chatModel.js';
import { ChatMode, IChatMode, IChatModeService } from '../common/chatModes.js';
import { IChatFollowup, IChatService } from '../common/chatService.js';
import { IChatSessionProviderOptionItem, IChatSessionsService } from '../common/chatSessionsService.js';
import { ChatRequestVariableSet, IChatRequestVariableEntry, isElementVariableEntry, isImageVariableEntry, isNotebookOutputVariableEntry, isPasteVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isSCMHistoryItemChangeRangeVariableEntry, isSCMHistoryItemChangeVariableEntry, isSCMHistoryItemVariableEntry, isStringVariableEntry } from '../common/chatVariableEntries.js';
import { IChatResponseViewModel } from '../common/chatViewModel.js';
import { ChatInputHistoryMaxEntries, IChatWidgetHistoryService } from '../common/chatWidgetHistoryService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, validateChatMode } from '../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { ILanguageModelToolsService } from '../common/languageModelToolsService.js';
import { ChatContinueInSessionActionItem, ContinueChatInSessionAction } from './actions/chatContinueInAction.js';
import { ChatOpenModelPickerActionId, ChatSessionPrimaryPickerAction, ChatSubmitAction, IChatExecuteActionContext, OpenModePickerAction } from './actions/chatExecuteActions.js';
import { ImplicitContextAttachmentWidget } from './attachments/implicitContextAttachment.js';
import { IChatWidget } from './chat.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { DefaultChatAttachmentWidget, ElementChatAttachmentWidget, FileAttachmentWidget, ImageAttachmentWidget, NotebookCellOutputChatAttachmentWidget, PasteAttachmentWidget, PromptFileAttachmentWidget, PromptTextAttachmentWidget, SCMHistoryItemAttachmentWidget, SCMHistoryItemChangeAttachmentWidget, SCMHistoryItemChangeRangeAttachmentWidget, TerminalCommandAttachmentWidget, ToolSetOrToolItemAttachmentWidget } from './chatAttachmentWidgets.js';
import { IDisposableReference } from './chatContentParts/chatCollections.js';
import { CollapsibleListPool, IChatCollapsibleListItem } from './chatContentParts/chatReferencesContentPart.js';
import { ChatTodoListWidget } from './chatContentParts/chatTodoListWidget.js';
import { IChatContextService } from './chatContextService.js';
import { ChatDragAndDrop } from './chatDragAndDrop.js';
import { ChatEditingShowChangesAction, ViewPreviousEditsAction } from './chatEditing/chatEditingActions.js';
import { ChatFollowups } from './chatFollowups.js';
import { ChatSelectedTools } from './chatSelectedTools.js';
import { ChatSessionPickerActionItem, IChatSessionPickerDelegate } from './chatSessions/chatSessionPickerActionItem.js';
import { ChatImplicitContext } from './contrib/chatImplicitContext.js';
import { ChatRelatedFiles } from './contrib/chatInputRelatedFilesContrib.js';
import { resizeImage } from './imageUtils.js';
import { IModelPickerDelegate, ModelPickerActionItem } from './modelPicker/modelPickerActionItem.js';
import { IModePickerDelegate, ModePickerActionItem } from './modelPicker/modePickerActionItem.js';

const $ = dom.$;

const INPUT_EDITOR_MAX_HEIGHT = 250;

export interface IChatInputStyles {
	overlayBackground: string;
	listForeground: string;
	listBackground: string;
}

export interface IChatInputPartOptions {
	defaultMode?: IChatMode;
	renderFollowups: boolean;
	renderStyle?: 'compact';
	renderInputToolbarBelowInput: boolean;
	menus: {
		executeToolbar: MenuId;
		telemetrySource: string;
		inputSideToolbar?: MenuId;
	};
	editorOverflowWidgetsDomNode?: HTMLElement;
	renderWorkingSet: boolean;
	enableImplicitContext?: boolean;
	supportsChangingModes?: boolean;
	dndContainer?: HTMLElement;
	widgetViewKindTag: string;
}

export interface IWorkingSetEntry {
	uri: URI;
}

export class ChatInputPart extends Disposable implements IHistoryNavigationWidget {
	private static _counter = 0;

	private _workingSetCollapsed = true;
	private readonly _chatInputTodoListWidget = this._register(new MutableDisposable<ChatTodoListWidget>());
	private readonly _chatEditingTodosDisposables = this._register(new DisposableStore());
	private _lastEditingSessionResource: URI | undefined;

	private _onDidLoadInputState: Emitter<void> = this._register(new Emitter());
	readonly onDidLoadInputState: Event<void> = this._onDidLoadInputState.event;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	private _onDidChangeContext = this._register(new Emitter<{ removed?: IChatRequestVariableEntry[]; added?: IChatRequestVariableEntry[] }>());
	readonly onDidChangeContext: Event<{ removed?: IChatRequestVariableEntry[]; added?: IChatRequestVariableEntry[] }> = this._onDidChangeContext.event;

	private _onDidAcceptFollowup = this._register(new Emitter<{ followup: IChatFollowup; response: IChatResponseViewModel | undefined }>());
	readonly onDidAcceptFollowup: Event<{ followup: IChatFollowup; response: IChatResponseViewModel | undefined }> = this._onDidAcceptFollowup.event;

	private _onDidClickOverlay = this._register(new Emitter<void>());
	readonly onDidClickOverlay: Event<void> = this._onDidClickOverlay.event;

	private readonly _attachmentModel: ChatAttachmentModel;
	private _widget?: IChatWidget;
	public get attachmentModel(): ChatAttachmentModel {
		return this._attachmentModel;
	}

	readonly selectedToolsModel: ChatSelectedTools;

	public getAttachedContext(sessionResource: URI) {
		const contextArr = new ChatRequestVariableSet();
		contextArr.add(...this.attachmentModel.attachments, ...this.chatContextService.getWorkspaceContextItems());
		return contextArr;
	}

	public getAttachedAndImplicitContext(sessionResource: URI): ChatRequestVariableSet {

		const contextArr = this.getAttachedContext(sessionResource);

		if ((this.implicitContext?.enabled && this.implicitContext?.value) || (this.implicitContext && !URI.isUri(this.implicitContext.value) && this.configurationService.getValue<boolean>('chat.implicitContext.suggestedContext'))) {
			const implicitChatVariables = this.implicitContext.toBaseEntries();
			contextArr.add(...implicitChatVariables);
		}
		return contextArr;
	}

	private _indexOfLastAttachedContextDeletedWithKeyboard: number = -1;
	private _indexOfLastOpenedContext: number = -1;

	private _implicitContext: ChatImplicitContext | undefined;
	public get implicitContext(): ChatImplicitContext | undefined {
		return this._implicitContext;
	}

	private _relatedFiles: ChatRelatedFiles | undefined;
	public get relatedFiles(): ChatRelatedFiles | undefined {
		return this._relatedFiles;
	}

	private _hasFileAttachmentContextKey: IContextKey<boolean>;

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	private readonly _contextResourceLabels: ResourceLabels;

	private readonly inputEditorMaxHeight: number;
	private inputEditorHeight: number = 0;
	private container!: HTMLElement;

	private inputSideToolbarContainer?: HTMLElement;

	private followupsContainer!: HTMLElement;
	private readonly followupsDisposables: DisposableStore = this._register(new DisposableStore());

	private attachmentsContainer!: HTMLElement;

	private chatInputOverlay!: HTMLElement;
	private readonly overlayClickListener: MutableDisposable<IDisposable> = this._register(new MutableDisposable<IDisposable>());

	private attachedContextContainer!: HTMLElement;
	private readonly attachedContextDisposables: MutableDisposable<DisposableStore> = this._register(new MutableDisposable<DisposableStore>());

	private relatedFilesContainer!: HTMLElement;

	private chatEditingSessionWidgetContainer!: HTMLElement;
	private chatInputTodoListWidgetContainer!: HTMLElement;

	private _inputPartHeight: number = 0;
	get inputPartHeight() {
		return this._inputPartHeight;
	}

	private _followupsHeight: number = 0;
	get followupsHeight() {
		return this._followupsHeight;
	}

	private _editSessionWidgetHeight: number = 0;
	get editSessionWidgetHeight() {
		return this._editSessionWidgetHeight;
	}

	get todoListWidgetHeight() {
		return this.chatInputTodoListWidgetContainer.offsetHeight;
	}

	get attachmentsHeight() {
		return this.attachmentsContainer.offsetHeight + (this.attachmentsContainer.checkVisibility() ? 6 : 0);
	}

	private _inputEditor!: CodeEditorWidget;
	private _inputEditorElement!: HTMLElement;

	// Reference to the input model for syncing input state
	private _inputModel: IInputModel | undefined;

	// Disposables for model observation
	private readonly _modelSyncDisposables = this._register(new DisposableStore());

	// Flag to prevent circular updates between view and model
	private _isSyncingToOrFromInputModel = false;

	// Debounced scheduler for syncing text changes
	private readonly _syncTextDebounced: RunOnceScheduler;

	private executeToolbar!: MenuWorkbenchToolBar;
	private inputActionsToolbar!: MenuWorkbenchToolBar;

	private addFilesToolbar: MenuWorkbenchToolBar | undefined;
	private addFilesButton: AddFilesButton | undefined;

	get inputEditor() {
		return this._inputEditor;
	}

	readonly dnd: ChatDragAndDrop;

	private history: HistoryNavigator2<IChatModelInputState>;
	private historyNavigationBackwardsEnablement!: IContextKey<boolean>;
	private historyNavigationForewardsEnablement!: IContextKey<boolean>;
	private inputModel: ITextModel | undefined;
	private inputEditorHasText: IContextKey<boolean>;
	private chatCursorAtTop: IContextKey<boolean>;
	private inputEditorHasFocus: IContextKey<boolean>;
	private currentlyEditingInputKey!: IContextKey<boolean>;
	private chatModeKindKey: IContextKey<ChatModeKind>;
	private withinEditSessionKey: IContextKey<boolean>;
	private filePartOfEditSessionKey: IContextKey<boolean>;
	private chatSessionHasOptions: IContextKey<boolean>;
	private modelWidget: ModelPickerActionItem | undefined;
	private modeWidget: ModePickerActionItem | undefined;
	private chatSessionPickerWidgets: Map<string, ChatSessionPickerActionItem> = new Map();
	private chatSessionPickerContainer: HTMLElement | undefined;
	private _lastSessionPickerAction: MenuItemAction | undefined;
	private readonly _waitForPersistedLanguageModel: MutableDisposable<IDisposable> = this._register(new MutableDisposable<IDisposable>());
	private _onDidChangeCurrentLanguageModel: Emitter<ILanguageModelChatMetadataAndIdentifier> = this._register(new Emitter<ILanguageModelChatMetadataAndIdentifier>());
	private readonly _chatSessionOptionEmitters: Map<string, Emitter<IChatSessionProviderOptionItem>> = new Map();

	private _currentLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined;

	get currentLanguageModel() {
		return this._currentLanguageModel?.identifier;
	}

	get selectedLanguageModel(): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._currentLanguageModel;
	}

	private _onDidChangeCurrentChatMode: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeCurrentChatMode: Event<void> = this._onDidChangeCurrentChatMode.event;

	private readonly _currentModeObservable: ISettableObservable<IChatMode>;

	public get currentModeKind(): ChatModeKind {
		const mode = this._currentModeObservable.get();
		return mode.kind === ChatModeKind.Agent && !this.agentService.hasToolsAgent ?
			ChatModeKind.Edit :
			mode.kind;
	}

	public get currentModeObs(): IObservable<IChatMode> {
		return this._currentModeObservable;
	}

	public get currentModeInfo(): IChatRequestModeInfo {
		const mode = this._currentModeObservable.get();
		const modeId: 'ask' | 'agent' | 'edit' | 'custom' | undefined = mode.isBuiltin ? this.currentModeKind : 'custom';

		const modeInstructions = mode.modeInstructions?.get();
		return {
			kind: this.currentModeKind,
			isBuiltin: mode.isBuiltin,
			modeInstructions: modeInstructions ? {
				name: mode.name.get(),
				content: modeInstructions.content,
				toolReferences: this.toolService.toToolReferences(modeInstructions.toolReferences),
				metadata: modeInstructions.metadata,
			} : undefined,
			modeId: modeId,
			applyCodeBlockSuggestionId: undefined,
		};
	}

	private cachedDimensions: dom.Dimension | undefined;
	private cachedExecuteToolbarWidth: number | undefined;
	private cachedInputToolbarWidth: number | undefined;

	readonly inputUri: URI = URI.parse(`${Schemas.vscodeChatInput}:input-${ChatInputPart._counter++}`);

	private _workingSetLinesAddedSpan = new Lazy(() => dom.$('.working-set-lines-added'));
	private _workingSetLinesRemovedSpan = new Lazy(() => dom.$('.working-set-lines-removed'));

	private readonly _chatEditsActionsDisposables: DisposableStore = this._register(new DisposableStore());
	private readonly _chatEditsDisposables: DisposableStore = this._register(new DisposableStore());
	private readonly _renderingChatEdits = this._register(new MutableDisposable());

	private _chatEditsListPool: CollapsibleListPool;
	private _chatEditList: IDisposableReference<WorkbenchList<IChatCollapsibleListItem>> | undefined;
	get selectedElements(): URI[] {
		const edits = [];
		const editsList = this._chatEditList?.object;
		const selectedElements = editsList?.getSelectedElements() ?? [];
		for (const element of selectedElements) {
			if (element.kind === 'reference' && URI.isUri(element.reference)) {
				edits.push(element.reference);
			}
		}
		return edits;
	}

	private _attemptedWorkingSetEntriesCount: number = 0;
	/**
	 * The number of working set entries that the user actually wanted to attach.
	 * This is less than or equal to {@link ChatInputPart.chatEditWorkingSetFiles}.
	 */
	public get attemptedWorkingSetEntriesCount() {
		return this._attemptedWorkingSetEntriesCount;
	}

	/**
	 * Number consumers holding the 'generating' lock.
	 */
	private _generating?: { rc: number; defer: DeferredPromise<void> };

	constructor(
		// private readonly editorOptions: ChatEditorOptions, // TODO this should be used
		private readonly location: ChatAgentLocation,
		private readonly options: IChatInputPartOptions,
		styles: IChatInputStyles,
		private readonly inline: boolean,
		@IChatWidgetHistoryService private readonly historyService: IChatWidgetHistoryService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IStorageService private readonly storageService: IStorageService,
		@ILabelService private readonly labelService: ILabelService,
		@IChatAgentService private readonly agentService: IChatAgentService,
		@ISharedWebContentExtractorService private readonly sharedWebExtracterService: ISharedWebContentExtractorService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@ILanguageModelToolsService private readonly toolService: ILanguageModelToolsService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatContextService private readonly chatContextService: IChatContextService,
	) {
		super();

		// Initialize debounced text sync scheduler
		this._syncTextDebounced = this._register(new RunOnceScheduler(() => this._syncInputStateToModel(), 150));

		this._contextResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event }));
		this._currentModeObservable = observableValue<IChatMode>('currentMode', this.options.defaultMode ?? ChatMode.Agent);
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this._indexOfLastOpenedContext = -1;
			this.refreshChatSessionPickers();
		}));

		this._attachmentModel = this._register(this.instantiationService.createInstance(ChatAttachmentModel));
		this._register(this._attachmentModel.onDidChange(() => this._syncInputStateToModel()));
		this.selectedToolsModel = this._register(this.instantiationService.createInstance(ChatSelectedTools, this.currentModeObs));
		this.dnd = this._register(this.instantiationService.createInstance(ChatDragAndDrop, this._attachmentModel, styles));

		this.inputEditorMaxHeight = this.options.renderStyle === 'compact' ? INPUT_EDITOR_MAX_HEIGHT / 3 : INPUT_EDITOR_MAX_HEIGHT;

		this.inputEditorHasText = ChatContextKeys.inputHasText.bindTo(contextKeyService);
		this.chatCursorAtTop = ChatContextKeys.inputCursorAtTop.bindTo(contextKeyService);
		this.inputEditorHasFocus = ChatContextKeys.inputHasFocus.bindTo(contextKeyService);
		this.chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(contextKeyService);
		this.withinEditSessionKey = ChatContextKeys.withinEditSessionDiff.bindTo(contextKeyService);
		this.filePartOfEditSessionKey = ChatContextKeys.filePartOfEditSession.bindTo(contextKeyService);
		this.chatSessionHasOptions = ChatContextKeys.chatSessionHasModels.bindTo(contextKeyService);

		const chatToolCount = ChatContextKeys.chatToolCount.bindTo(contextKeyService);

		this._register(autorun(reader => {
			let count = 0;
			const userSelectedTools = this.selectedToolsModel.userSelectedTools.read(reader);
			for (const key in userSelectedTools) {
				if (userSelectedTools[key] === true) {
					count++;
				}
			}

			chatToolCount.set(count);
		}));

		this.history = this.loadHistory();
		this._register(this.historyService.onDidClearHistory(() => this.history = new HistoryNavigator2<IChatModelInputState>([this.getCurrentInputState()], ChatInputHistoryMaxEntries, historyKeyFn)));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			const newOptions: IEditorOptions = {};
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
				newOptions.ariaLabel = this._getAriaLabel();
			}
			if (e.affectsConfiguration('editor.wordSegmenterLocales')) {
				newOptions.wordSegmenterLocales = this.configurationService.getValue<string | string[]>('editor.wordSegmenterLocales');
			}
			if (e.affectsConfiguration('editor.autoClosingBrackets')) {
				newOptions.autoClosingBrackets = this.configurationService.getValue('editor.autoClosingBrackets');
			}
			if (e.affectsConfiguration('editor.autoClosingQuotes')) {
				newOptions.autoClosingQuotes = this.configurationService.getValue('editor.autoClosingQuotes');
			}
			if (e.affectsConfiguration('editor.autoSurround')) {
				newOptions.autoSurround = this.configurationService.getValue('editor.autoSurround');
			}

			this.inputEditor.updateOptions(newOptions);
		}));

		this._chatEditsListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, MenuId.ChatEditingWidgetModifiedFilesToolbar, { verticalScrollMode: ScrollbarVisibility.Visible }));

		this._hasFileAttachmentContextKey = ChatContextKeys.hasFileAttachments.bindTo(contextKeyService);

		this.initSelectedModel();

		this._register(this.languageModelsService.onDidChangeLanguageModels((vendor) => {
			// Remove vendor from cache since the models changed and what is stored is no longer valid
			// TODO @lramos15 - The cache should be less confusing since we have the LM Service cache + the view cache interacting weirdly
			this.storageService.store(
				'chat.cachedLanguageModels',
				this.storageService.getObject<ILanguageModelChatMetadataAndIdentifier[]>('chat.cachedLanguageModels', StorageScope.APPLICATION, []).filter(m => !m.identifier.startsWith(vendor)),
				StorageScope.APPLICATION,
				StorageTarget.MACHINE
			);

			// We've changed models and the current one is no longer available. Select a new one
			const selectedModel = this._currentLanguageModel ? this.getModels().find(m => m.identifier === this._currentLanguageModel?.identifier) : undefined;
			const selectedModelNotAvailable = this._currentLanguageModel && (!selectedModel?.metadata.isUserSelectable);
			if (!this.currentLanguageModel || selectedModelNotAvailable) {
				this.setCurrentLanguageModelToDefault();
			}
		}));

		this._register(this.onDidChangeCurrentChatMode(() => {
			this.accessibilityService.alert(this._currentModeObservable.get().label.get());
			if (this._inputEditor) {
				this._inputEditor.updateOptions({ ariaLabel: this._getAriaLabel() });
			}

			if (this.implicitContext && this.configurationService.getValue<boolean>('chat.implicitContext.suggestedContext')) {
				this.implicitContext.enabled = this._currentModeObservable.get() !== ChatMode.Agent;
			}
		}));
		this._register(this._onDidChangeCurrentLanguageModel.event(() => {
			if (this._currentLanguageModel?.metadata.name) {
				this.accessibilityService.alert(this._currentLanguageModel.metadata.name);
			}
			this._inputEditor?.updateOptions({ ariaLabel: this._getAriaLabel() });
		}));
		this._register(this.chatModeService.onDidChangeChatModes(() => this.validateCurrentChatMode()));
		this._register(autorun(r => {
			const mode = this._currentModeObservable.read(r);
			this.chatModeKindKey.set(mode.kind);
			const model = mode.model?.read(r);
			if (model) {
				this.switchModelByQualifiedName(model);
			}
		}));
	}

	public setIsWithinEditSession(inInsideDiff: boolean, isFilePartOfEditSession: boolean) {
		this.withinEditSessionKey.set(inInsideDiff);
		this.filePartOfEditSessionKey.set(isFilePartOfEditSession);
	}

	private getSelectedModelStorageKey(): string {
		return `chat.currentLanguageModel.${this.location}`;
	}

	private getSelectedModelIsDefaultStorageKey(): string {
		return `chat.currentLanguageModel.${this.location}.isDefault`;
	}

	private initSelectedModel() {
		const persistedSelection = this.storageService.get(this.getSelectedModelStorageKey(), StorageScope.APPLICATION);
		const persistedAsDefault = this.storageService.getBoolean(this.getSelectedModelIsDefaultStorageKey(), StorageScope.APPLICATION, persistedSelection === 'copilot/gpt-4.1');

		if (persistedSelection) {
			const model = this.getModels().find(m => m.identifier === persistedSelection);
			if (model) {
				// Only restore the model if it wasn't the default at the time of storing or it is now the default
				if (!persistedAsDefault || model.metadata.isDefault) {
					this.setCurrentLanguageModel(model);
					this.checkModelSupported();
				}
			} else {
				this._waitForPersistedLanguageModel.value = this.languageModelsService.onDidChangeLanguageModels(e => {
					const persistedModel = this.languageModelsService.lookupLanguageModel(persistedSelection);
					if (persistedModel) {
						this._waitForPersistedLanguageModel.clear();

						// Only restore the model if it wasn't the default at the time of storing or it is now the default
						if (!persistedAsDefault || persistedModel.isDefault) {
							if (persistedModel.isUserSelectable) {
								this.setCurrentLanguageModel({ metadata: persistedModel, identifier: persistedSelection });
								this.checkModelSupported();
							}
						}
					} else {
						this.setCurrentLanguageModelToDefault();
					}
				});
			}
		}

		this._register(this._onDidChangeCurrentChatMode.event(() => {
			this.checkModelSupported();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.Edits2Enabled)) {
				this.checkModelSupported();
			}
		}));
	}

	public setEditing(enabled: boolean) {
		this.currentlyEditingInputKey?.set(enabled);
	}

	public switchModel(modelMetadata: Pick<ILanguageModelChatMetadata, 'vendor' | 'id' | 'family'>) {
		const models = this.getModels();
		const model = models.find(m => m.metadata.vendor === modelMetadata.vendor && m.metadata.id === modelMetadata.id && m.metadata.family === modelMetadata.family);
		if (model) {
			this.setCurrentLanguageModel(model);
		}
	}

	public switchModelByQualifiedName(qualifiedModelName: string): boolean {
		const models = this.getModels();
		const model = models.find(m => ILanguageModelChatMetadata.matchesQualifiedName(qualifiedModelName, m.metadata));
		if (model) {
			this.setCurrentLanguageModel(model);
			return true;
		}
		return false;
	}

	public switchToNextModel(): void {
		const models = this.getModels();
		if (models.length > 0) {
			const currentIndex = models.findIndex(model => model.identifier === this._currentLanguageModel?.identifier);
			const nextIndex = (currentIndex + 1) % models.length;
			this.setCurrentLanguageModel(models[nextIndex]);
		}
	}

	public openModelPicker(): void {
		this.modelWidget?.show();
	}

	public openModePicker(): void {
		this.modeWidget?.show();
	}

	public openChatSessionPicker(): void {
		// Open the first available picker widget
		const firstWidget = this.chatSessionPickerWidgets?.values()?.next().value;
		firstWidget?.show();
	}

	/**
	 * Create picker widgets for all option groups available for the current session type.
	 */
	private createChatSessionPickerWidgets(action: MenuItemAction): ChatSessionPickerActionItem[] {
		this._lastSessionPickerAction = action;

		// Helper to resolve chat session context
		const resolveChatSessionContext = () => {
			const sessionResource = this._widget?.viewModel?.model.sessionResource;
			if (!sessionResource) {
				return undefined;
			}
			return this.chatService.getChatSessionFromInternalUri(sessionResource);
		};

		// Get all option groups for the current session type
		const ctx = resolveChatSessionContext();
		const optionGroups = ctx ? this.chatSessionsService.getOptionGroupsForSessionType(ctx.chatSessionType) : undefined;
		if (!optionGroups || optionGroups.length === 0) {
			return [];
		}

		// Clear existing widgets
		this.disposeSessionPickerWidgets();

		// Create a widget for each option group in effect for this specific session
		const widgets: ChatSessionPickerActionItem[] = [];
		for (const optionGroup of optionGroups) {
			if (!ctx) {
				continue;
			}
			if (!this.chatSessionsService.getSessionOption(ctx.chatSessionResource, optionGroup.id)) {
				// This session does not have a value to contribute for this option group
				continue;
			}

			const initialItem = this.getCurrentOptionForGroup(optionGroup.id);
			const initialState = { group: optionGroup, item: initialItem };

			// Create delegate for this option group
			const itemDelegate: IChatSessionPickerDelegate = {
				getCurrentOption: () => this.getCurrentOptionForGroup(optionGroup.id),
				onDidChangeOption: this.getOrCreateOptionEmitter(optionGroup.id).event,
				setOption: (option: IChatSessionProviderOptionItem) => {
					const ctx = resolveChatSessionContext();
					if (!ctx) {
						return;
					}
					this.getOrCreateOptionEmitter(optionGroup.id).fire(option);
					this.chatSessionsService.notifySessionOptionsChange(
						ctx.chatSessionResource,
						[{ optionId: optionGroup.id, value: option.id }]
					).catch(err => this.logService.error(`Failed to notify extension of ${optionGroup.id} change:`, err));
				},
				getAllOptions: () => {
					const ctx = resolveChatSessionContext();
					if (!ctx) {
						return [];
					}
					const groups = this.chatSessionsService.getOptionGroupsForSessionType(ctx.chatSessionType);
					const group = groups?.find(g => g.id === optionGroup.id);
					return group?.items ?? [];
				}
			};

			const widget = this.instantiationService.createInstance(ChatSessionPickerActionItem, action, initialState, itemDelegate);
			this.chatSessionPickerWidgets.set(optionGroup.id, widget);
			widgets.push(widget);
		}

		return widgets;
	}

	/**
	 * Set the input model reference for syncing input state
	 */
	setInputModel(model: IInputModel | undefined): void {
		this._inputModel = model;
		this._modelSyncDisposables.clear();

		if (!model) {
			return;
		}

		// Observe changes from model and sync to view
		this._modelSyncDisposables.add(autorun(reader => {
			const state = model.state.read(reader);
			this._syncFromModel(state);
		}));
	}

	/**
	 * Sync from model to view (when model state changes)
	 */
	private _syncFromModel(state: IChatModelInputState | undefined): void {
		// Prevent circular updates
		if (this._isSyncingToOrFromInputModel) {
			return;
		}

		try {
			this._isSyncingToOrFromInputModel = true;

			// Sync mode
			if (state) {
				const currentMode = this._currentModeObservable.get();
				if (currentMode.id !== state.mode.id) {
					this.setChatMode(state.mode.id, false);
				}
			}

			// Sync selected model
			if (state?.selectedModel) {
				if (!this._currentLanguageModel || this._currentLanguageModel.identifier !== state.selectedModel.identifier) {
					this.setCurrentLanguageModel(state.selectedModel);
				}
			}

			// Sync attachments
			const currentAttachments = this._attachmentModel.attachments;
			if (!state) {
				this._attachmentModel.clear();
			} else if (!arraysEqual(currentAttachments, state.attachments)) {
				this._attachmentModel.clearAndSetContext(...state.attachments);
			}

			// Sync input text
			if (this._inputEditor) {
				this._inputEditor.setValue(state?.inputText || '');
				if (state?.selections.length) {
					this._inputEditor.setSelections(state.selections);
				}
			}

			if (state) {
				this._widget?.contribs.forEach(contrib => {
					contrib.setInputState?.(state.contrib);
				});
			}
		} finally {
			this._isSyncingToOrFromInputModel = false;
		}
	}

	/**
	 * Sync current input state to the input model
	 */
	private _syncInputStateToModel(): void {
		if (!this._inputModel || this._isSyncingToOrFromInputModel) {
			return;
		}

		this._isSyncingToOrFromInputModel = true;
		this._inputModel.setState(this.getCurrentInputState());
		this._isSyncingToOrFromInputModel = false;
	}

	public setCurrentLanguageModel(model: ILanguageModelChatMetadataAndIdentifier) {
		this._currentLanguageModel = model;

		if (this.cachedDimensions) {
			// For quick chat and editor chat, relayout because the input may need to shrink to accomodate the model name
			this.layout(this.cachedDimensions.height, this.cachedDimensions.width);
		}

		// Store as global user preference (session-specific state is in the model's inputModel)
		this.storageService.store(this.getSelectedModelStorageKey(), model.identifier, StorageScope.APPLICATION, StorageTarget.USER);
		this.storageService.store(this.getSelectedModelIsDefaultStorageKey(), !!model.metadata.isDefault, StorageScope.APPLICATION, StorageTarget.USER);

		this._onDidChangeCurrentLanguageModel.fire(model);

		// Sync to model
		this._syncInputStateToModel();
	}

	private checkModelSupported(): void {
		if (this._currentLanguageModel && !this.modelSupportedForDefaultAgent(this._currentLanguageModel)) {
			this.setCurrentLanguageModelToDefault();
		}
	}

	/**
	 * By ID- prefer this method
	 */
	setChatMode(mode: ChatModeKind | string, storeSelection = true): void {
		if (!this.options.supportsChangingModes) {
			return;
		}

		const mode2 = this.chatModeService.findModeById(mode) ??
			this.chatModeService.findModeById(ChatModeKind.Agent) ??
			ChatMode.Ask;
		this.setChatMode2(mode2, storeSelection);
	}

	private setChatMode2(mode: IChatMode, storeSelection = true): void {
		if (!this.options.supportsChangingModes) {
			return;
		}

		this._currentModeObservable.set(mode, undefined);
		this._onDidChangeCurrentChatMode.fire();

		// Sync to model (mode is now persisted in the model's input state)
		this._syncInputStateToModel();
	}

	private modelSupportedForDefaultAgent(model: ILanguageModelChatMetadataAndIdentifier): boolean {
		// Probably this logic could live in configuration on the agent, or somewhere else, if it gets more complex
		if (this.currentModeKind === ChatModeKind.Agent || (this.currentModeKind === ChatModeKind.Edit && this.configurationService.getValue(ChatConfiguration.Edits2Enabled))) {
			return ILanguageModelChatMetadata.suitableForAgentMode(model.metadata);
		}

		return true;
	}

	private getModels(): ILanguageModelChatMetadataAndIdentifier[] {
		const cachedModels = this.storageService.getObject<ILanguageModelChatMetadataAndIdentifier[]>('chat.cachedLanguageModels', StorageScope.APPLICATION, []);
		let models = this.languageModelsService.getLanguageModelIds()
			.map(modelId => ({ identifier: modelId, metadata: this.languageModelsService.lookupLanguageModel(modelId)! }));
		if (models.length === 0 || models.some(m => m.metadata.isDefault) === false) {
			models = cachedModels;
		} else {
			this.storageService.store('chat.cachedLanguageModels', models, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
		return models.filter(entry => entry.metadata?.isUserSelectable && this.modelSupportedForDefaultAgent(entry));
	}

	private setCurrentLanguageModelToDefault() {
		const allModels = this.getModels();
		const defaultModel = allModels.find(m => m.metadata.isDefault) || allModels.find(m => m.metadata.isUserSelectable);
		if (defaultModel) {
			this.setCurrentLanguageModel(defaultModel);
		}
	}

	private loadHistory(): HistoryNavigator2<IChatModelInputState> {
		const history = this.historyService.getHistory(this.location);
		if (history.length === 0) {
			history.push(this.getCurrentInputState());
		}

		return new HistoryNavigator2(history, 50, historyKeyFn);
	}

	/**
	 * Get the current input state for history
	 */
	public getCurrentInputState(): IChatModelInputState {
		const mode = this._currentModeObservable.get();
		const state: IChatModelInputState = {
			inputText: this._inputEditor?.getValue() ?? '',
			attachments: this._attachmentModel.attachments,
			mode: {
				id: mode.id,
				kind: mode.kind
			},
			selectedModel: this._currentLanguageModel,
			selections: this._inputEditor?.getSelections() || [],
			contrib: {},
		};

		for (const contrib of this._widget?.contribs || Iterable.empty()) {
			contrib.getInputState?.(state.contrib);
		}

		return state;
	}

	private _getAriaLabel(): string {
		const verbose = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat);
		let kbLabel;
		if (verbose) {
			kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
		}
		const mode = this._currentModeObservable.get();

		// Include model information if available
		const modelName = this._currentLanguageModel?.metadata.name;
		const modelInfo = modelName ? localize('chatInput.model', ", {0}. ", modelName) : '';

		let modeLabel = '';
		if (!mode.isBuiltin) {
			const mode = this.currentModeObs.get();
			modeLabel = localize('chatInput.mode.custom', "({0}), {1}", mode.label.get(), mode.description.get());
		} else {
			switch (this.currentModeKind) {
				case ChatModeKind.Agent:
					modeLabel = localize('chatInput.mode.agent', "(Agent), edit files in your workspace.");
					break;
				case ChatModeKind.Edit:
					modeLabel = localize('chatInput.mode.edit', "(Edit), edit files in your workspace.");
					break;
				case ChatModeKind.Ask:
				default:
					modeLabel = localize('chatInput.mode.ask', "(Ask), ask questions or type / for topics.");
					break;
			}
		}
		if (verbose) {
			return kbLabel
				? localize('actions.chat.accessibiltyHelp', "Chat Input {0}{1} Press Enter to send out the request. Use {2} for Chat Accessibility Help.", modeLabel, modelInfo, kbLabel)
				: localize('chatInput.accessibilityHelpNoKb', "Chat Input {0}{1} Press Enter to send out the request. Use the Chat Accessibility Help command for more information.", modeLabel, modelInfo);
		} else {
			return localize('chatInput.accessibilityHelp', "Chat Input {0}{1}.", modeLabel, modelInfo);
		}
	}

	private validateCurrentChatMode() {
		const currentMode = this._currentModeObservable.get();
		const validMode = this.chatModeService.findModeById(currentMode.id);
		if (!validMode) {
			this.setChatMode(ChatModeKind.Agent);
			return;
		}
	}

	initForNewChatModel(state: IChatModelInputState | undefined, chatSessionIsEmpty: boolean): void {
		this.history = this.loadHistory();

		// Note: With the new input model architecture, the state is synced automatically
		// from the model via _syncFromModel when setInputModel is called.
		// We only need to handle history here.
		this.history.add(state ?? this.getCurrentInputState());

		this.selectedToolsModel.resetSessionEnablementState();

		// TODO@roblourens This is for an experiment which will be obsolete in a month or two and can then be removed.
		if (chatSessionIsEmpty) {
			const storageKey = this.getDefaultModeExperimentStorageKey();
			const hasSetDefaultMode = this.storageService.getBoolean(storageKey, StorageScope.WORKSPACE, false);
			if (!hasSetDefaultMode) {
				const isAnonymous = this.entitlementService.anonymous;
				this.experimentService.getTreatment('chat.defaultMode')
					.then((defaultModeTreatment => {
						if (isAnonymous) {
							// be deterministic for anonymous users
							// to support agentic flows with default
							// model.
							defaultModeTreatment = ChatModeKind.Agent;
						}

						if (typeof defaultModeTreatment === 'string') {
							this.storageService.store(storageKey, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
							const defaultMode = validateChatMode(defaultModeTreatment);
							if (defaultMode) {
								this.logService.trace(`Applying default mode from experiment: ${defaultMode}`);
								this.setChatMode(defaultMode, false);
								this.checkModelSupported();
							}
						}
					}));
			}
		}
	}

	private getDefaultModeExperimentStorageKey(): string {
		const tag = this.options.widgetViewKindTag;
		return `chat.${tag}.hasSetDefaultModeByExperiment`;
	}

	logInputHistory(): void {
		const historyStr = [...this.history].map(entry => JSON.stringify(entry)).join('\n');
		this.logService.info(`[${this.location}] Chat input history:`, historyStr);
	}

	setVisible(visible: boolean): void {
		this._onDidChangeVisibility.fire(visible);
	}

	/** If consumers are busy generating the chat input, returns the promise resolved when they finish */
	get generating() {
		return this._generating?.defer.p;
	}

	/** Disables the input submissions buttons until the disposable is disposed. */
	startGenerating(): IDisposable {
		this.logService.trace('ChatWidget#startGenerating');
		if (this._generating) {
			this._generating.rc++;
		} else {
			this._generating = { rc: 1, defer: new DeferredPromise<void>() };
		}

		return toDisposable(() => {
			this.logService.trace('ChatWidget#doneGenerating');
			if (this._generating && !--this._generating.rc) {
				this._generating.defer.complete();
				this._generating = undefined;
			}
		});
	}

	get element(): HTMLElement {
		return this.container;
	}

	private isStateEmpty(state: IChatModelInputState): boolean {
		return state.inputText.trim().length === 0 && state.attachments.length === 0;
	}

	async showPreviousValue(): Promise<void> {
		const inputState = this.getCurrentInputState();
		this.saveCurrentValue(inputState);

		const current = this.history.current();
		if (current.inputText !== inputState.inputText && !this.isStateEmpty(inputState)) {
			this.saveCurrentValue(inputState);
			this.history.resetCursor();
		}

		this.navigateHistory(true);
	}

	async showNextValue(): Promise<void> {
		const inputState = this.getCurrentInputState();
		if (this.history.isAtEnd()) {
			return;
		} else {
			const current = this.history.current();
			if (current.inputText !== inputState.inputText) {
				this.saveCurrentValue(inputState);
				this.history.resetCursor();
			}
		}

		this.navigateHistory(false);
	}

	private async navigateHistory(previous: boolean): Promise<void> {
		const historyEntry = previous ?
			this.history.previous() : this.history.next();

		let historyAttachments = historyEntry.attachments ?? [];

		// Check for images in history to restore the value.
		if (historyAttachments.length > 0) {
			historyAttachments = (await Promise.all(historyAttachments.map(async (attachment) => {
				if (isImageVariableEntry(attachment) && attachment.references?.length && URI.isUri(attachment.references[0].reference)) {
					const currReference = attachment.references[0].reference;
					try {
						const imageBinary = currReference.toString(true).startsWith('http') ? await this.sharedWebExtracterService.readImage(currReference, CancellationToken.None) : (await this.fileService.readFile(currReference)).value;
						if (!imageBinary) {
							return undefined;
						}
						const newAttachment = { ...attachment };
						newAttachment.value = (isImageVariableEntry(attachment) && attachment.isPasted) ? imageBinary.buffer : await resizeImage(imageBinary.buffer); // if pasted image, we do not need to resize.
						return newAttachment;
					} catch (err) {
						this.logService.error('Failed to fetch and reference.', err);
						return undefined;
					}
				}
				return attachment;
			}))).filter(attachment => attachment !== undefined);
		}

		this._attachmentModel.clearAndSetContext(...historyAttachments);

		aria.status(historyEntry.inputText);
		this.setValue(historyEntry.inputText, true);
		this._widget?.contribs.forEach(contrib => {
			contrib.setInputState?.(historyEntry.contrib);
		});
		this._onDidLoadInputState.fire();

		const model = this._inputEditor.getModel();
		if (!model) {
			return;
		}

		if (previous) {
			// When navigating to previous history, always position cursor at the start (line 1, column 1)
			// This ensures that pressing up again will continue to navigate history
			this._inputEditor.setPosition({ lineNumber: 1, column: 1 });
		} else {
			this._inputEditor.setPosition(getLastPosition(model));
		}
	}

	setValue(value: string, transient: boolean): void {
		this.inputEditor.setValue(value);
		// always leave cursor at the end
		const model = this.inputEditor.getModel();
		if (model) {
			this.inputEditor.setPosition(getLastPosition(model));
		}

		if (!transient) {
			this.saveCurrentValue(this.getCurrentInputState());
		}
	}

	private saveCurrentValue(inputState: IChatModelInputState): void {
		this.history.replaceLast(inputState);
	}

	focus() {
		this._inputEditor.focus();
	}

	hasFocus(): boolean {
		return this._inputEditor.hasWidgetFocus();
	}

	/**
	 * Reset the input and update history.
	 * @param userQuery If provided, this will be added to the history. Followups and programmatic queries should not be passed.
	 */
	async acceptInput(isUserQuery?: boolean): Promise<void> {
		if (isUserQuery) {
			const userQuery = this.getCurrentInputState();
			this.history.replaceLast(userQuery);
			this.history.add({ ...this.getCurrentInputState(), inputText: '', attachments: [], selections: [] });
		}

		// Clear attached context, fire event to clear input state, and clear the input editor
		this.attachmentModel.clear();
		this._onDidLoadInputState.fire();
		if (this.accessibilityService.isScreenReaderOptimized() && isMacintosh) {
			this._acceptInputForVoiceover();
		} else {
			this._inputEditor.focus();
			this._inputEditor.setValue('');
		}
	}

	validateAgentMode(): void {
		if (!this.agentService.hasToolsAgent && this._currentModeObservable.get().kind === ChatModeKind.Agent) {
			this.setChatMode(ChatModeKind.Edit);
		}
	}

	private _acceptInputForVoiceover(): void {
		const domNode = this._inputEditor.getDomNode();
		if (!domNode) {
			return;
		}
		// Remove the input editor from the DOM temporarily to prevent VoiceOver
		// from reading the cleared text (the request) to the user.
		domNode.remove();
		this._inputEditor.setValue('');
		this._inputEditorElement.appendChild(domNode);
		this._inputEditor.focus();
	}

	private _handleAttachedContextChange() {
		this._hasFileAttachmentContextKey.set(Boolean(this._attachmentModel.attachments.find(a => a.kind === 'file')));
		this.renderAttachedContext();
	}

	private getOrCreateOptionEmitter(optionGroupId: string): Emitter<IChatSessionProviderOptionItem> {
		let emitter = this._chatSessionOptionEmitters.get(optionGroupId);
		if (!emitter) {
			emitter = this._register(new Emitter<IChatSessionProviderOptionItem>());
			this._chatSessionOptionEmitters.set(optionGroupId, emitter);
		}
		return emitter;
	}

	/**
	 * Refresh all registered option groups for the current chat session.
	 * Fires events for each option group with their current selection.
	 */
	private refreshChatSessionPickers(): void {
		const sessionResource = this._widget?.viewModel?.model.sessionResource;
		const hideAll = () => {
			this.chatSessionHasOptions.set(false);
			this.hideAllSessionPickerWidgets();
		};

		if (!sessionResource) {
			return hideAll();
		}
		const ctx = this.chatService.getChatSessionFromInternalUri(sessionResource);
		if (!ctx) {
			return hideAll();
		}
		const optionGroups = this.chatSessionsService.getOptionGroupsForSessionType(ctx.chatSessionType);
		if (!optionGroups || optionGroups.length === 0) {
			return hideAll();
		}

		if (!this.chatSessionsService.hasAnySessionOptions(ctx.chatSessionResource)) {
			return hideAll();
		}

		this.chatSessionHasOptions.set(true);

		const currentWidgetGroupIds = new Set(this.chatSessionPickerWidgets.keys());
		const requiredGroupIds = new Set(optionGroups.map(g => g.id));

		const needsRecreation =
			currentWidgetGroupIds.size !== requiredGroupIds.size ||
			!Array.from(requiredGroupIds).every(id => currentWidgetGroupIds.has(id));

		if (needsRecreation && this._lastSessionPickerAction && this.chatSessionPickerContainer) {
			const widgets = this.createChatSessionPickerWidgets(this._lastSessionPickerAction);
			dom.clearNode(this.chatSessionPickerContainer);
			for (const widget of widgets) {
				const container = dom.$('.action-item.chat-sessionPicker-item');
				widget.render(container);
				this.chatSessionPickerContainer.appendChild(container);
			}
		}

		if (this.chatSessionPickerContainer) {
			this.chatSessionPickerContainer.style.display = '';
		}

		for (const [optionGroupId] of this.chatSessionPickerWidgets.entries()) {
			const currentOption = this.chatSessionsService.getSessionOption(ctx.chatSessionResource, optionGroupId);
			if (currentOption) {
				const optionGroup = optionGroups.find(g => g.id === optionGroupId);
				if (optionGroup) {
					const item = optionGroup.items.find(m => m.id === currentOption);
					if (item) {
						this.getOrCreateOptionEmitter(optionGroupId).fire(item);
					}
				}
			}
		}
	}

	private hideAllSessionPickerWidgets(): void {
		if (this.chatSessionPickerContainer) {
			this.chatSessionPickerContainer.style.display = 'none';
		}
	}

	private disposeSessionPickerWidgets(): void {
		for (const widget of this.chatSessionPickerWidgets.values()) {
			widget.dispose();
		}
		this.chatSessionPickerWidgets.clear();
	}

	/**
	 * Get the current option for a specific option group.
	 * If no option is currently set, initializes with the first item as default.
	 */
	private getCurrentOptionForGroup(optionGroupId: string): IChatSessionProviderOptionItem | undefined {
		const sessionResource = this._widget?.viewModel?.model.sessionResource;
		if (!sessionResource) {
			return;
		}
		const ctx = this.chatService.getChatSessionFromInternalUri(sessionResource);
		if (!ctx) {
			return;
		}
		const optionGroups = this.chatSessionsService.getOptionGroupsForSessionType(ctx.chatSessionType);
		const optionGroup = optionGroups?.find(g => g.id === optionGroupId);
		if (!optionGroup || optionGroup.items.length === 0) {
			return;
		}

		const currentOptionValue = this.chatSessionsService.getSessionOption(ctx.chatSessionResource, optionGroupId);
		if (!currentOptionValue) {
			return;
		}

		if (typeof currentOptionValue === 'string') {
			return optionGroup.items.find(m => m.id === currentOptionValue);
		} else {
			return currentOptionValue as IChatSessionProviderOptionItem;
		}

	}

	render(container: HTMLElement, initialValue: string, widget: IChatWidget) {
		this._widget = widget;

		let elements;
		if (this.options.renderStyle === 'compact') {
			elements = dom.h('.interactive-input-part', [
				dom.h('.interactive-input-and-edit-session', [
					dom.h('.chat-todo-list-widget-container@chatInputTodoListWidgetContainer'),
					dom.h('.chat-editing-session@chatEditingSessionWidgetContainer'),
					dom.h('.interactive-input-and-side-toolbar@inputAndSideToolbar', [
						dom.h('.chat-input-container@inputContainer', [
							dom.h('.chat-editor-container@editorContainer'),
							dom.h('.chat-input-toolbars@inputToolbars'),
						]),
					]),
					dom.h('.chat-attachments-container@attachmentsContainer', [
						dom.h('.chat-attachment-toolbar@attachmentToolbar'),
						dom.h('.chat-attached-context@attachedContextContainer'),
						dom.h('.chat-related-files@relatedFilesContainer'),
					]),
					dom.h('.interactive-input-followups@followupsContainer'),
				])
			]);
		} else {
			elements = dom.h('.interactive-input-part', [
				dom.h('.interactive-input-followups@followupsContainer'),
				dom.h('.chat-todo-list-widget-container@chatInputTodoListWidgetContainer'),
				dom.h('.chat-editing-session@chatEditingSessionWidgetContainer'),
				dom.h('.interactive-input-and-side-toolbar@inputAndSideToolbar', [
					dom.h('.chat-input-container@inputContainer', [
						dom.h('.chat-attachments-container@attachmentsContainer', [
							dom.h('.chat-attachment-toolbar@attachmentToolbar'),
							dom.h('.chat-related-files@relatedFilesContainer'),
							dom.h('.chat-attached-context@attachedContextContainer'),
						]),
						dom.h('.chat-editor-container@editorContainer'),
						dom.h('.chat-input-toolbars@inputToolbars'),
					]),
				]),
			]);
		}
		this.container = elements.root;
		this.chatInputOverlay = dom.$('.chat-input-overlay');
		container.append(this.container);
		this.container.append(this.chatInputOverlay);
		this.container.classList.toggle('compact', this.options.renderStyle === 'compact');
		this.followupsContainer = elements.followupsContainer;
		const inputAndSideToolbar = elements.inputAndSideToolbar; // The chat input and toolbar to the right
		const inputContainer = elements.inputContainer; // The chat editor, attachments, and toolbars
		const editorContainer = elements.editorContainer;
		this.attachmentsContainer = elements.attachmentsContainer;
		this.attachedContextContainer = elements.attachedContextContainer;
		this.relatedFilesContainer = elements.relatedFilesContainer;
		const toolbarsContainer = elements.inputToolbars;
		const attachmentToolbarContainer = elements.attachmentToolbar;
		this.chatEditingSessionWidgetContainer = elements.chatEditingSessionWidgetContainer;
		this.chatInputTodoListWidgetContainer = elements.chatInputTodoListWidgetContainer;

		if (this.options.enableImplicitContext) {
			this._implicitContext = this._register(
				this.instantiationService.createInstance(ChatImplicitContext),
			);

			this._register(this._implicitContext.onDidChangeValue(() => {
				this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
				this._handleAttachedContextChange();
			}));
		}

		this.renderAttachedContext();
		this._register(this._attachmentModel.onDidChange((e) => {
			if (e.added.length > 0) {
				this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
			}
			this._handleAttachedContextChange();
		}));

		this.renderChatEditingSessionState(null);

		if (this.options.renderWorkingSet) {
			this._relatedFiles = this._register(new ChatRelatedFiles());
			this._register(this._relatedFiles.onDidChange(() => this.renderChatRelatedFiles()));
		}
		this.renderChatRelatedFiles();

		this.dnd.addOverlay(this.options.dndContainer ?? container, this.options.dndContainer ?? container);

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		ChatContextKeys.inChatInput.bindTo(inputScopedContextKeyService).set(true);
		this.currentlyEditingInputKey = ChatContextKeys.currentlyEditingInput.bindTo(inputScopedContextKeyService);
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));

		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
		this.historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
		this.historyNavigationForewardsEnablement = historyNavigationForwardsEnablement;

		const options: IEditorConstructionOptions = getSimpleEditorOptions(this.configurationService);
		options.overflowWidgetsDomNode = this.options.editorOverflowWidgetsDomNode;
		options.pasteAs = EditorOptions.pasteAs.defaultValue;
		options.readOnly = false;
		options.ariaLabel = this._getAriaLabel();
		options.fontFamily = DEFAULT_FONT_FAMILY;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.padding = this.options.renderStyle === 'compact' ? { top: 2, bottom: 2 } : { top: 8, bottom: 8 };
		options.cursorWidth = 1;
		options.wrappingStrategy = 'advanced';
		options.bracketPairColorization = { enabled: false };
		// Respect user's editor settings for auto-closing and auto-surrounding behavior
		options.autoClosingBrackets = this.configurationService.getValue('editor.autoClosingBrackets');
		options.autoClosingQuotes = this.configurationService.getValue('editor.autoClosingQuotes');
		options.autoSurround = this.configurationService.getValue('editor.autoSurround');
		options.suggest = {
			showIcons: true,
			showSnippets: false,
			showWords: true,
			showStatusBar: false,
			insertMode: 'insert',
		};
		options.scrollbar = { ...(options.scrollbar ?? {}), vertical: 'hidden' };
		options.stickyScroll = { enabled: false };

		this._inputEditorElement = dom.append(editorContainer, $(chatInputEditorContainerSelector));
		const editorOptions = getSimpleCodeEditorWidgetOptions();
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([ContentHoverController.ID, GlyphHoverController.ID, DropIntoEditorController.ID, CopyPasteController.ID, LinkDetector.ID]));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorElement, options, editorOptions));

		SuggestController.get(this._inputEditor)?.forceRenderingAbove();
		options.overflowWidgetsDomNode?.classList.add('hideSuggestTextIcons');
		this._inputEditorElement.classList.add('hideSuggestTextIcons');

		// Prevent Enter key from creating new lines - but respect user's custom keybindings
		// Only prevent default behavior if ChatSubmitAction is bound to Enter AND its precondition is met
		this._register(this._inputEditor.onKeyDown((e) => {
			if (e.keyCode === KeyCode.Enter && !hasModifierKeys(e)) {
				// Check if ChatSubmitAction has a keybinding for plain Enter in the current context
				// This respects user's custom keybindings that disable the submit action
				for (const keybinding of this.keybindingService.lookupKeybindings(ChatSubmitAction.ID)) {
					const chords = keybinding.getDispatchChords();
					const isPlainEnter = chords.length === 1 && chords[0] === '[Enter]';
					if (isPlainEnter) {
						// Do NOT call stopPropagation() so the keybinding service can still process this event
						e.preventDefault();
						break;
					}
				}
			}
		}));

		this._register(this._inputEditor.onDidChangeModelContent(() => {
			const currentHeight = Math.min(this._inputEditor.getContentHeight(), this.inputEditorMaxHeight);
			if (currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
				this._onDidChangeHeight.fire();
			}

			const model = this._inputEditor.getModel();
			const inputHasText = !!model && model.getValue().trim().length > 0;
			this.inputEditorHasText.set(inputHasText);

			// Debounced sync to model for text changes
			this._syncTextDebounced.schedule();
		}));
		this._register(this._inputEditor.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this.inputEditorHeight = !this.inline ? e.contentHeight : this.inputEditorHeight;
				this._onDidChangeHeight.fire();
			}
		}));
		this._register(this._inputEditor.onDidFocusEditorText(() => {
			this.inputEditorHasFocus.set(true);
			this._onDidFocus.fire();
			inputContainer.classList.toggle('focused', true);
		}));
		this._register(this._inputEditor.onDidBlurEditorText(() => {
			this.inputEditorHasFocus.set(false);
			inputContainer.classList.toggle('focused', false);

			this._onDidBlur.fire();
		}));
		this._register(this._inputEditor.onDidBlurEditorWidget(() => {
			CopyPasteController.get(this._inputEditor)?.clearWidgets();
			DropIntoEditorController.get(this._inputEditor)?.clearWidgets();
		}));

		const hoverDelegate = this._register(createInstantHoverDelegate());

		this._register(dom.addStandardDisposableListener(toolbarsContainer, dom.EventType.CLICK, e => this.inputEditor.focus()));
		this._register(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.CLICK, e => this.inputEditor.focus()));
		this.inputActionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.options.renderInputToolbarBelowInput ? this.attachmentsContainer : toolbarsContainer, MenuId.ChatInput, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: { shouldForwardArgs: true },
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			hoverDelegate,
			actionViewItemProvider: (action, options) => {
				if (action.id === ChatOpenModelPickerActionId && action instanceof MenuItemAction) {
					if (!this._currentLanguageModel) {
						this.setCurrentLanguageModelToDefault();
					}

					const itemDelegate: IModelPickerDelegate = {
						getCurrentModel: () => this._currentLanguageModel,
						onDidChangeModel: this._onDidChangeCurrentLanguageModel.event,
						setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
							this._waitForPersistedLanguageModel.clear();
							this.setCurrentLanguageModel(model);
							this.renderAttachedContext();
						},
						getModels: () => this.getModels()
					};
					return this.modelWidget = this.instantiationService.createInstance(ModelPickerActionItem, action, this._currentLanguageModel, undefined, itemDelegate);
				} else if (action.id === OpenModePickerAction.ID && action instanceof MenuItemAction) {
					const delegate: IModePickerDelegate = {
						currentMode: this._currentModeObservable,
						sessionResource: () => this._widget?.viewModel?.sessionResource,
					};
					return this.modeWidget = this.instantiationService.createInstance(ModePickerActionItem, action, delegate);
				} else if (action.id === ChatSessionPrimaryPickerAction.ID && action instanceof MenuItemAction) {
					// Create all pickers and return a container action view item
					const widgets = this.createChatSessionPickerWidgets(action);
					if (widgets.length === 0) {
						return undefined;
					}
					// Create a container to hold all picker widgets
					return this.instantiationService.createInstance(ChatSessionPickersContainerActionItem, action, widgets);
				}
				return undefined;
			}
		}));
		this.inputActionsToolbar.getElement().classList.add('chat-input-toolbar');
		this.inputActionsToolbar.context = { widget } satisfies IChatExecuteActionContext;
		this._register(this.inputActionsToolbar.onDidChangeMenuItems(() => {
			// Update container reference for the pickers
			const toolbarElement = this.inputActionsToolbar.getElement();
			// eslint-disable-next-line no-restricted-syntax
			const container = toolbarElement.querySelector('.chat-sessionPicker-container');
			this.chatSessionPickerContainer = container as HTMLElement | undefined;

			if (this.cachedDimensions && typeof this.cachedInputToolbarWidth === 'number' && this.cachedInputToolbarWidth !== this.inputActionsToolbar.getItemsWidth()) {
				this.layout(this.cachedDimensions.height, this.cachedDimensions.width);
			}
		}));
		this.executeToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarsContainer, this.options.menus.executeToolbar, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: {
				shouldForwardArgs: true
			},
			hoverDelegate,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			actionViewItemProvider: (action, options) => {
				if (action.id === ContinueChatInSessionAction.ID && action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(ChatContinueInSessionActionItem, action);
				}
				return undefined;
			}
		}));
		this.executeToolbar.getElement().classList.add('chat-execute-toolbar');
		this.executeToolbar.context = { widget } satisfies IChatExecuteActionContext;
		this._register(this.executeToolbar.onDidChangeMenuItems(() => {
			if (this.cachedDimensions && typeof this.cachedExecuteToolbarWidth === 'number' && this.cachedExecuteToolbarWidth !== this.executeToolbar.getItemsWidth()) {
				this.layout(this.cachedDimensions.height, this.cachedDimensions.width);
			}
		}));
		if (this.options.menus.inputSideToolbar) {
			const toolbarSide = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, inputAndSideToolbar, this.options.menus.inputSideToolbar, {
				telemetrySource: this.options.menus.telemetrySource,
				menuOptions: {
					shouldForwardArgs: true
				},
				hoverDelegate
			}));
			this.inputSideToolbarContainer = toolbarSide.getElement();
			toolbarSide.getElement().classList.add('chat-side-toolbar');
			toolbarSide.context = { widget } satisfies IChatExecuteActionContext;
		}

		let inputModel = this.modelService.getModel(this.inputUri);
		if (!inputModel) {
			inputModel = this.modelService.createModel('', null, this.inputUri, true);
		}

		this.textModelResolverService.createModelReference(this.inputUri).then(ref => {
			// make sure to hold a reference so that the model doesn't get disposed by the text model service
			if (this._store.isDisposed) {
				ref.dispose();
				return;
			}
			this._register(ref);
		});

		this.inputModel = inputModel;
		this.inputModel.updateOptions({ bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false } });
		this._inputEditor.setModel(this.inputModel);
		if (initialValue) {
			this.inputModel.setValue(initialValue);
			const lineNumber = this.inputModel.getLineCount();
			this._inputEditor.setPosition({ lineNumber, column: this.inputModel.getLineMaxColumn(lineNumber) });
		}

		const onDidChangeCursorPosition = () => {
			const model = this._inputEditor.getModel();
			if (!model) {
				return;
			}

			const position = this._inputEditor.getPosition();
			if (!position) {
				return;
			}

			const atTop = position.lineNumber === 1 && position.column === 1;
			this.chatCursorAtTop.set(atTop);

			this.historyNavigationBackwardsEnablement.set(atTop);
			this.historyNavigationForewardsEnablement.set(position.equals(getLastPosition(model)));

			// Sync cursor and selection to model
			this._syncInputStateToModel();
		};
		this._register(this._inputEditor.onDidChangeCursorPosition(e => onDidChangeCursorPosition()));
		onDidChangeCursorPosition();

		this._register(this.themeService.onDidFileIconThemeChange(() => {
			this.renderAttachedContext();
		}));

		this.addFilesToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, attachmentToolbarContainer, MenuId.ChatInputAttachmentToolbar, {
			telemetrySource: this.options.menus.telemetrySource,
			label: true,
			menuOptions: { shouldForwardArgs: true, renderShortTitle: true },
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			hoverDelegate,
			actionViewItemProvider: (action, options) => {
				if (action.id === 'workbench.action.chat.attachContext') {
					const viewItem = this.instantiationService.createInstance(AddFilesButton, this._attachmentModel, action, options);
					viewItem.setShowLabel(this._attachmentModel.size === 0 && !this.hasImplicitContextBlock());
					this.addFilesButton = viewItem;
					return this.addFilesButton;
				}
				return undefined;
			}
		}));
		this.addFilesToolbar.context = { widget, placeholder: localize('chatAttachFiles', 'Search for files and context to add to your request') };
		this._register(this.addFilesToolbar.onDidChangeMenuItems(() => {
			if (this.cachedDimensions) {
				this._onDidChangeHeight.fire();
			}
		}));
	}

	public toggleChatInputOverlay(editing: boolean): void {
		this.chatInputOverlay.classList.toggle('disabled', editing);
		if (editing) {
			this.overlayClickListener.value = dom.addStandardDisposableListener(this.chatInputOverlay, dom.EventType.CLICK, e => {
				e.preventDefault();
				e.stopPropagation();
				this._onDidClickOverlay.fire();
			});
		} else {
			this.overlayClickListener.clear();
		}
	}

	public renderAttachedContext() {
		const container = this.attachedContextContainer;
		// Note- can't measure attachedContextContainer, because it has `display: contents`, so measure the parent to check for height changes
		const oldHeight = this.attachmentsContainer.offsetHeight;
		const store = new DisposableStore();
		this.attachedContextDisposables.value = store;

		dom.clearNode(container);

		store.add(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.KEY_DOWN, (e: StandardKeyboardEvent) => {
			this.handleAttachmentNavigation(e);
		}));

		const attachments = [...this.attachmentModel.attachments.entries()];
		const hasAttachments = Boolean(attachments.length) || Boolean(this.implicitContext?.value);
		dom.setVisibility(Boolean(this.options.renderInputToolbarBelowInput || hasAttachments || (this.addFilesToolbar && !this.addFilesToolbar.isEmpty())), this.attachmentsContainer);
		dom.setVisibility(hasAttachments, this.attachedContextContainer);
		if (!attachments.length) {
			this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
			this._indexOfLastOpenedContext = -1;
		}

		const isSuggestedEnabled = this.configurationService.getValue<boolean>('chat.implicitContext.suggestedContext');

		if (this.implicitContext?.value && !isSuggestedEnabled) {
			const implicitPart = store.add(this.instantiationService.createInstance(ImplicitContextAttachmentWidget, this.implicitContext, this._contextResourceLabels, this.attachmentModel));
			container.appendChild(implicitPart.domNode);
		}

		for (const [index, attachment] of attachments) {
			const resource = URI.isUri(attachment.value) ? attachment.value : isLocation(attachment.value) ? attachment.value.uri : undefined;
			const range = isLocation(attachment.value) ? attachment.value.range : undefined;
			const shouldFocusClearButton = index === Math.min(this._indexOfLastAttachedContextDeletedWithKeyboard, this.attachmentModel.size - 1) && this._indexOfLastAttachedContextDeletedWithKeyboard > -1;

			let attachmentWidget;
			const options = { shouldFocusClearButton, supportsDeletion: true };
			if (attachment.kind === 'tool' || attachment.kind === 'toolset') {
				attachmentWidget = this.instantiationService.createInstance(ToolSetOrToolItemAttachmentWidget, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (resource && isNotebookOutputVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(NotebookCellOutputChatAttachmentWidget, resource, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (isPromptFileVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(PromptFileAttachmentWidget, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (isPromptTextVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(PromptTextAttachmentWidget, attachment, undefined, options, container, this._contextResourceLabels);
			} else if (resource && (attachment.kind === 'file' || attachment.kind === 'directory')) {
				attachmentWidget = this.instantiationService.createInstance(FileAttachmentWidget, resource, range, attachment, undefined, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (attachment.kind === 'terminalCommand') {
				attachmentWidget = this.instantiationService.createInstance(TerminalCommandAttachmentWidget, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (isImageVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(ImageAttachmentWidget, resource, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (isElementVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(ElementChatAttachmentWidget, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (isPasteVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(PasteAttachmentWidget, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (isSCMHistoryItemVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemAttachmentWidget, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (isSCMHistoryItemChangeVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeAttachmentWidget, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else if (isSCMHistoryItemChangeRangeVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeRangeAttachmentWidget, attachment, this._currentLanguageModel, options, container, this._contextResourceLabels);
			} else {
				attachmentWidget = this.instantiationService.createInstance(DefaultChatAttachmentWidget, resource, range, attachment, undefined, this._currentLanguageModel, options, container, this._contextResourceLabels);
			}

			if (shouldFocusClearButton) {
				attachmentWidget.element.focus();
			}

			if (index === Math.min(this._indexOfLastOpenedContext, this.attachmentModel.size - 1)) {
				attachmentWidget.element.focus();
			}

			store.add(attachmentWidget);
			store.add(attachmentWidget.onDidDelete(e => {
				this.handleAttachmentDeletion(e, index, attachment);
			}));

			store.add(attachmentWidget.onDidOpen(e => {
				this.handleAttachmentOpen(index, attachment);
			}));
		}

		const implicitValue = this.implicitContext?.value;

		if (isSuggestedEnabled && implicitValue) {
			const targetUri: URI | undefined = this.implicitContext.uri;

			const currentlyAttached = attachments.some(([, attachment]) => {
				let uri: URI | undefined;
				if (URI.isUri(attachment.value)) {
					uri = attachment.value;
				} else if (isStringVariableEntry(attachment)) {
					uri = attachment.uri;
				}
				return uri && isEqual(uri, targetUri);
			});

			const shouldShowImplicit = !isLocation(implicitValue) ? !currentlyAttached : implicitValue.range;
			if (shouldShowImplicit) {
				const implicitPart = store.add(this.instantiationService.createInstance(ImplicitContextAttachmentWidget, this.implicitContext, this._contextResourceLabels, this._attachmentModel));
				container.appendChild(implicitPart.domNode);
			}
		}

		if (oldHeight !== this.attachmentsContainer.offsetHeight) {
			this._onDidChangeHeight.fire();
		}

		this.addFilesButton?.setShowLabel(this._attachmentModel.size === 0 && !this.hasImplicitContextBlock());

		this._indexOfLastOpenedContext = -1;
	}

	private hasImplicitContextBlock(): boolean {
		const implicit = this.implicitContext?.value;
		if (!implicit) {
			return false;
		}
		const isSuggestedEnabled = this.configurationService.getValue<boolean>('chat.implicitContext.suggestedContext');
		if (!isSuggestedEnabled) {
			return true;
		}

		// TODO @justschen: merge this with above showing implicit logic
		const isUri = URI.isUri(implicit);
		if (isUri || isLocation(implicit)) {
			const targetUri = isUri ? implicit : implicit.uri;
			const attachments = [...this._attachmentModel.attachments.entries()];
			const currentlyAttached = attachments.some(([, a]) => URI.isUri(a.value) && isEqual(a.value, targetUri));
			const shouldShowImplicit = isUri ? !currentlyAttached : implicit.range;
			return !!shouldShowImplicit;
		}
		return false;
	}

	private handleAttachmentDeletion(e: KeyboardEvent | unknown, index: number, attachment: IChatRequestVariableEntry) {
		// Set focus to the next attached context item if deletion was triggered by a keystroke (vs a mouse click)
		if (dom.isKeyboardEvent(e)) {
			this._indexOfLastAttachedContextDeletedWithKeyboard = index;
		}

		this._attachmentModel.delete(attachment.id);


		if (this.configurationService.getValue<boolean>('chat.implicitContext.enableImplicitContext')) {
			// if currently opened file is deleted, do not show implicit context
			const implicitValue = URI.isUri(this.implicitContext?.value) && URI.isUri(attachment.value) && isEqual(this.implicitContext.value, attachment.value);

			if (this.implicitContext?.isFile && implicitValue) {
				this.implicitContext.enabled = false;
			}
		}

		if (this._attachmentModel.size === 0) {
			this.focus();
		}

		this._onDidChangeContext.fire({ removed: [attachment] });
		this.renderAttachedContext();
	}

	private handleAttachmentOpen(index: number, attachment: IChatRequestVariableEntry): void {
		this._indexOfLastOpenedContext = index;
		this._indexOfLastAttachedContextDeletedWithKeyboard = -1;

		if (this._attachmentModel.size === 0) {
			this.focus();
		}
	}

	private handleAttachmentNavigation(e: StandardKeyboardEvent): void {
		if (!e.equals(KeyCode.LeftArrow) && !e.equals(KeyCode.RightArrow)) {
			return;
		}

		// eslint-disable-next-line no-restricted-syntax
		const toolbar = this.addFilesToolbar?.getElement().querySelector('.action-label');
		if (!toolbar) {
			return;
		}

		// eslint-disable-next-line no-restricted-syntax
		const attachments = Array.from(this.attachedContextContainer.querySelectorAll('.chat-attached-context-attachment'));
		if (!attachments.length) {
			return;
		}

		attachments.unshift(toolbar);

		const activeElement = dom.getWindow(this.attachmentsContainer).document.activeElement;
		const currentIndex = attachments.findIndex(attachment => attachment === activeElement);
		let newIndex = currentIndex;

		if (e.equals(KeyCode.LeftArrow)) {
			newIndex = currentIndex > 0 ? currentIndex - 1 : attachments.length - 1;
		} else if (e.equals(KeyCode.RightArrow)) {
			newIndex = currentIndex < attachments.length - 1 ? currentIndex + 1 : 0;
		}

		if (newIndex !== -1) {
			const nextElement = attachments[newIndex] as HTMLElement;
			nextElement.focus();
			e.preventDefault();
			e.stopPropagation();
		}
	}

	async renderChatTodoListWidget(chatSessionResource: URI) {

		const isTodoWidgetEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.TodosShowWidget) !== false;
		if (!isTodoWidgetEnabled) {
			return;
		}

		if (!this._chatInputTodoListWidget.value) {
			const widget = this._chatEditingTodosDisposables.add(this.instantiationService.createInstance(ChatTodoListWidget));
			this._chatInputTodoListWidget.value = widget;

			// Add the widget's DOM node to the dedicated todo list container
			dom.clearNode(this.chatInputTodoListWidgetContainer);
			dom.append(this.chatInputTodoListWidgetContainer, widget.domNode);

			// Listen to height changes
			this._chatEditingTodosDisposables.add(widget.onDidChangeHeight(() => {
				this._onDidChangeHeight.fire();
			}));
		}

		this._chatInputTodoListWidget.value.render(chatSessionResource);
	}

	clearTodoListWidget(sessionResource: URI | undefined, force: boolean): void {
		this._chatInputTodoListWidget.value?.clear(sessionResource, force);
	}

	renderChatEditingSessionState(chatEditingSession: IChatEditingSession | null) {
		dom.setVisibility(Boolean(chatEditingSession), this.chatEditingSessionWidgetContainer);

		if (chatEditingSession) {
			if (!isEqual(chatEditingSession.chatSessionResource, this._lastEditingSessionResource)) {
				this._workingSetCollapsed = true;
			}
			this._lastEditingSessionResource = chatEditingSession.chatSessionResource;
		}

		const modifiedEntries = derivedOpts<IModifiedFileEntry[]>({ equalsFn: arraysEqual }, r => {
			return chatEditingSession?.entries.read(r).filter(entry => entry.state.read(r) === ModifiedFileEntryState.Modified) || [];
		});

		const listEntries = derived((reader): IChatCollapsibleListItem[] => {
			const seenEntries = new ResourceSet();
			const entries: IChatCollapsibleListItem[] = [];
			for (const entry of modifiedEntries.read(reader)) {
				if (entry.state.read(reader) !== ModifiedFileEntryState.Modified) {
					continue;
				}

				if (!seenEntries.has(entry.modifiedURI)) {
					seenEntries.add(entry.modifiedURI);
					const linesAdded = entry.linesAdded?.read(reader);
					const linesRemoved = entry.linesRemoved?.read(reader);
					entries.push({
						reference: entry.modifiedURI,
						state: ModifiedFileEntryState.Modified,
						kind: 'reference',
						options: {
							status: undefined,
							diffMeta: { added: linesAdded ?? 0, removed: linesRemoved ?? 0 }
						}
					});
				}
			}

			entries.sort((a, b) => {
				if (a.kind === 'reference' && b.kind === 'reference') {
					if (a.state === b.state || a.state === undefined || b.state === undefined) {
						return a.reference.toString().localeCompare(b.reference.toString());
					}
					return a.state - b.state;
				}
				return 0;
			});

			return entries;
		});

		const shouldRender = listEntries.map(r => r.length > 0);

		this._renderingChatEdits.value = autorun(reader => {
			if (this.options.renderWorkingSet && shouldRender.read(reader)) {
				this.renderChatEditingSessionWithEntries(
					reader.store,
					chatEditingSession!,
					modifiedEntries,
					listEntries,
				);
			} else {
				dom.clearNode(this.chatEditingSessionWidgetContainer);
				this._chatEditsDisposables.clear();
				this._chatEditList = undefined;
			}
		});
	}

	private renderChatEditingSessionWithEntries(
		store: DisposableStore,
		chatEditingSession: IChatEditingSession,
		modifiedEntries: IObservable<IModifiedFileEntry[]>,
		listEntries: IObservable<IChatCollapsibleListItem[]>,
	) {
		// Summary of number of files changed
		// eslint-disable-next-line no-restricted-syntax
		const innerContainer = this.chatEditingSessionWidgetContainer.querySelector('.chat-editing-session-container.show-file-icons') as HTMLElement ?? dom.append(this.chatEditingSessionWidgetContainer, $('.chat-editing-session-container.show-file-icons'));

		// eslint-disable-next-line no-restricted-syntax
		const overviewRegion = innerContainer.querySelector('.chat-editing-session-overview') as HTMLElement ?? dom.append(innerContainer, $('.chat-editing-session-overview'));
		// eslint-disable-next-line no-restricted-syntax
		const overviewTitle = overviewRegion.querySelector('.working-set-title') as HTMLElement ?? dom.append(overviewRegion, $('.working-set-title'));

		// Clear out the previous actions (if any)
		this._chatEditsActionsDisposables.clear();

		// Chat editing session actions
		// eslint-disable-next-line no-restricted-syntax
		const actionsContainer = overviewRegion.querySelector('.chat-editing-session-actions') as HTMLElement ?? dom.append(overviewRegion, $('.chat-editing-session-actions'));

		this._chatEditsActionsDisposables.add(this.instantiationService.createInstance(MenuWorkbenchButtonBar, actionsContainer, MenuId.ChatEditingWidgetToolbar, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: {
				arg: { sessionResource: chatEditingSession.chatSessionResource },
			},
			buttonConfigProvider: (action) => {
				if (action.id === ChatEditingShowChangesAction.ID || action.id === ViewPreviousEditsAction.Id) {
					return { showIcon: true, showLabel: false, isSecondary: true };
				}
				return undefined;
			}
		}));

		if (!chatEditingSession) {
			return;
		}

		// Working set
		// eslint-disable-next-line no-restricted-syntax
		const workingSetContainer = innerContainer.querySelector('.chat-editing-session-list') as HTMLElement ?? dom.append(innerContainer, $('.chat-editing-session-list'));

		const button = this._chatEditsActionsDisposables.add(new ButtonWithIcon(overviewTitle, {
			supportIcons: true,
			secondary: true,
			ariaLabel: localize('chatEditingSession.toggleWorkingSet', 'Toggle changed files.'),
		}));



		store.add(autorun(reader => {
			let added = 0;
			let removed = 0;
			const entries = modifiedEntries.read(reader);
			for (const entry of entries) {
				if (entry.linesAdded && entry.linesRemoved) {
					added += entry.linesAdded.read(reader);
					removed += entry.linesRemoved.read(reader);
				}
			}
			const baseLabel = entries.length === 1 ? localize('chatEditingSession.oneFile.1', '1 file changed') : localize('chatEditingSession.manyFiles.1', '{0} files changed', entries.length);
			button.label = baseLabel;

			this._workingSetLinesAddedSpan.value.textContent = `+${added}`;
			this._workingSetLinesRemovedSpan.value.textContent = `-${removed}`;
			button.element.setAttribute('aria-label', localize('chatEditingSession.ariaLabelWithCounts', '{0}, {1} lines added, {2} lines removed', baseLabel, added, removed));

			const shouldShowEditingSession = added > 0 || removed > 0;
			dom.setVisibility(shouldShowEditingSession, this.chatEditingSessionWidgetContainer);
			if (!shouldShowEditingSession) {
				this._onDidChangeHeight.fire();
			}
		}));

		const countsContainer = dom.$('.working-set-line-counts');
		button.element.appendChild(countsContainer);
		countsContainer.appendChild(this._workingSetLinesAddedSpan.value);
		countsContainer.appendChild(this._workingSetLinesRemovedSpan.value);

		const applyCollapseState = () => {
			button.icon = this._workingSetCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
			workingSetContainer.classList.toggle('collapsed', this._workingSetCollapsed);
			this._onDidChangeHeight.fire();
		};

		const toggleWorkingSet = () => {
			this._workingSetCollapsed = !this._workingSetCollapsed;
			applyCollapseState();
		};

		this._chatEditsActionsDisposables.add(button.onDidClick(() => { toggleWorkingSet(); }));
		this._chatEditsActionsDisposables.add(addDisposableListener(overviewRegion, 'click', e => {
			if (e.defaultPrevented) {
				return;
			}
			const target = e.target as HTMLElement;
			if (target.closest('.monaco-button')) {
				return;
			}
			toggleWorkingSet();
		}));

		applyCollapseState();

		if (!this._chatEditList) {
			this._chatEditList = this._chatEditsListPool.get();
			const list = this._chatEditList.object;
			this._chatEditsDisposables.add(this._chatEditList);
			this._chatEditsDisposables.add(list.onDidFocus(() => {
				this._onDidFocus.fire();
			}));
			this._chatEditsDisposables.add(list.onDidOpen(async (e) => {
				if (e.element?.kind === 'reference' && URI.isUri(e.element.reference)) {
					const modifiedFileUri = e.element.reference;

					const entry = chatEditingSession.getEntry(modifiedFileUri);

					const pane = await this.editorService.openEditor({
						resource: modifiedFileUri,
						options: e.editorOptions
					}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);

					if (pane) {
						entry?.getEditorIntegration(pane).reveal(true, e.editorOptions.preserveFocus);
					}
				}
			}));
			this._chatEditsDisposables.add(addDisposableListener(list.getHTMLElement(), 'click', e => {
				if (!this.hasFocus()) {
					this._onDidFocus.fire();
				}
			}, true));
			dom.append(workingSetContainer, list.getHTMLElement());
			dom.append(innerContainer, workingSetContainer);
		}

		store.add(autorun(reader => {
			const entries = listEntries.read(reader);
			const maxItemsShown = 6;
			const itemsShown = Math.min(entries.length, maxItemsShown);
			const height = itemsShown * 22;
			const list = this._chatEditList!.object;
			list.layout(height);
			list.getHTMLElement().style.height = `${height}px`;
			list.splice(0, list.length, entries);
			this._onDidChangeHeight.fire();
		}));
	}

	async renderChatRelatedFiles() {
		const anchor = this.relatedFilesContainer;
		dom.clearNode(anchor);
		const shouldRender = this.configurationService.getValue('chat.renderRelatedFiles');
		dom.setVisibility(Boolean(this.relatedFiles?.value.length && shouldRender), anchor);
		if (!shouldRender || !this.relatedFiles?.value.length) {
			return;
		}

		const hoverDelegate = getDefaultHoverDelegate('element');
		for (const { uri, description } of this.relatedFiles.value) {
			const uriLabel = this._chatEditsActionsDisposables.add(new Button(anchor, {
				supportIcons: true,
				secondary: true,
				hoverDelegate
			}));
			uriLabel.label = this.labelService.getUriBasenameLabel(uri);
			uriLabel.element.classList.add('monaco-icon-label');
			uriLabel.element.title = localize('suggeste.title', "{0} - {1}", this.labelService.getUriLabel(uri, { relative: true }), description ?? '');

			this._chatEditsActionsDisposables.add(uriLabel.onDidClick(async () => {
				group.remove(); // REMOVE asap
				await this._attachmentModel.addFile(uri);
				this.relatedFiles?.remove(uri);
			}));

			const addButton = this._chatEditsActionsDisposables.add(new Button(anchor, {
				supportIcons: false,
				secondary: true,
				hoverDelegate,
				ariaLabel: localize('chatEditingSession.addSuggestion', 'Add suggestion {0}', this.labelService.getUriLabel(uri, { relative: true })),
			}));
			addButton.icon = Codicon.add;
			addButton.setTitle(localize('chatEditingSession.addSuggested', 'Add suggestion'));
			this._chatEditsActionsDisposables.add(addButton.onDidClick(async () => {
				group.remove(); // REMOVE asap
				await this._attachmentModel.addFile(uri);
				this.relatedFiles?.remove(uri);
			}));

			const sep = document.createElement('div');
			sep.classList.add('separator');

			const group = document.createElement('span');
			group.classList.add('monaco-button-dropdown', 'sidebyside-button');
			group.appendChild(addButton.element);
			group.appendChild(sep);
			group.appendChild(uriLabel.element);
			dom.append(anchor, group);

			this._chatEditsActionsDisposables.add(toDisposable(() => {
				group.remove();
			}));
		}
		this._onDidChangeHeight.fire();
	}

	async renderFollowups(items: IChatFollowup[] | undefined, response: IChatResponseViewModel | undefined): Promise<void> {
		if (!this.options.renderFollowups) {
			return;
		}
		this.followupsDisposables.clear();
		dom.clearNode(this.followupsContainer);

		if (items && items.length > 0) {
			this.followupsDisposables.add(this.instantiationService.createInstance<typeof ChatFollowups<IChatFollowup>, ChatFollowups<IChatFollowup>>(ChatFollowups, this.followupsContainer, items, this.location, undefined, followup => this._onDidAcceptFollowup.fire({ followup, response })));
		}
		this._onDidChangeHeight.fire();
	}

	get contentHeight(): number {
		const data = this.getLayoutData();
		return data.followupsHeight + data.inputPartEditorHeight + data.inputPartVerticalPadding + data.inputEditorBorder + data.attachmentsHeight + data.toolbarsHeight + data.chatEditingStateHeight + data.todoListWidgetContainerHeight;
	}

	layout(height: number, width: number) {
		this.cachedDimensions = new dom.Dimension(width, height);

		return this._layout(height, width);
	}

	private previousInputEditorDimension: IDimension | undefined;
	private _layout(height: number, width: number, allowRecurse = true): void {
		const data = this.getLayoutData();
		const inputEditorHeight = Math.min(data.inputPartEditorHeight, height - data.followupsHeight - data.attachmentsHeight - data.inputPartVerticalPadding - data.toolbarsHeight - data.chatEditingStateHeight - data.todoListWidgetContainerHeight);

		const followupsWidth = width - data.inputPartHorizontalPadding;
		this.followupsContainer.style.width = `${followupsWidth}px`;

		this._inputPartHeight = data.inputPartVerticalPadding + data.followupsHeight + inputEditorHeight + data.inputEditorBorder + data.attachmentsHeight + data.toolbarsHeight + data.chatEditingStateHeight + data.todoListWidgetContainerHeight;
		this._followupsHeight = data.followupsHeight;
		this._editSessionWidgetHeight = data.chatEditingStateHeight;

		const initialEditorScrollWidth = this._inputEditor.getScrollWidth();
		const newEditorWidth = width - data.inputPartHorizontalPadding - data.editorBorder - data.inputPartHorizontalPaddingInside - data.toolbarsWidth - data.sideToolbarWidth;
		const newDimension = { width: newEditorWidth, height: inputEditorHeight };
		if (!this.previousInputEditorDimension || (this.previousInputEditorDimension.width !== newDimension.width || this.previousInputEditorDimension.height !== newDimension.height)) {
			// This layout call has side-effects that are hard to understand. eg if we are calling this inside a onDidChangeContent handler, this can trigger the next onDidChangeContent handler
			// to be invoked, and we have a lot of these on this editor. Only doing a layout this when the editor size has actually changed makes it much easier to follow.
			this._inputEditor.layout(newDimension);
			this.previousInputEditorDimension = newDimension;
		}

		if (allowRecurse && initialEditorScrollWidth < 10) {
			// This is probably the initial layout. Now that the editor is layed out with its correct width, it should report the correct contentHeight
			return this._layout(height, width, false);
		}
	}

	private getLayoutData() {

		// ###########################################################################
		// #                                                                         #
		// #    CHANGING THIS METHOD HAS RENDERING IMPLICATIONS FOR THE CHAT VIEW    #
		// #    IF YOU MAKE CHANGES HERE, PLEASE TEST THE CHAT VIEW THOROUGHLY:      #
		// #    - produce various chat responses                                     #
		// #    - click the response to get a focus outline                          #
		// #    - ensure the outline is not cut off at the bottom                    #
		// #                                                                         #
		// ###########################################################################

		const executeToolbarWidth = this.cachedExecuteToolbarWidth = this.executeToolbar.getItemsWidth();
		const inputToolbarWidth = this.cachedInputToolbarWidth = this.inputActionsToolbar.getItemsWidth();
		const inputSideToolbarWidth = this.inputSideToolbarContainer ? dom.getTotalWidth(this.inputSideToolbarContainer) : 0;
		const executeToolbarPadding = (this.executeToolbar.getItemsLength() - 1) * 4;
		const inputToolbarPadding = this.inputActionsToolbar.getItemsLength() ? (this.inputActionsToolbar.getItemsLength() - 1) * 4 : 0;
		return {
			inputEditorBorder: 2,
			followupsHeight: this.followupsContainer.offsetHeight,
			inputPartEditorHeight: Math.min(this._inputEditor.getContentHeight(), this.inputEditorMaxHeight),
			inputPartHorizontalPadding: this.options.renderStyle === 'compact' ? 16 : 32,
			inputPartVerticalPadding: this.options.renderStyle === 'compact' ? 12 : (16 /* entire part */ + 6 /* input container */ + (2 * 4) /* flex gap: todo|edits|input */),
			attachmentsHeight: this.attachmentsHeight,
			editorBorder: 2,
			inputPartHorizontalPaddingInside: 12,
			toolbarsWidth: this.options.renderStyle === 'compact' ? executeToolbarWidth + executeToolbarPadding + (this.options.renderInputToolbarBelowInput ? 0 : inputToolbarWidth + inputToolbarPadding) : 0,
			toolbarsHeight: this.options.renderStyle === 'compact' ? 0 : 22,
			chatEditingStateHeight: this.chatEditingSessionWidgetContainer.offsetHeight,
			sideToolbarWidth: inputSideToolbarWidth > 0 ? inputSideToolbarWidth + 4 /*gap*/ : 0,
			todoListWidgetContainerHeight: this.chatInputTodoListWidgetContainer.offsetHeight,
		};
	}

	saveState(): void {
		if (this.history.isAtEnd()) {
			this.saveCurrentValue(this.getCurrentInputState());
		}

		const inputHistory = [...this.history];
		this.historyService.saveHistory(this.location, inputHistory);
	}
}

const historyKeyFn = (entry: IChatModelInputState) => JSON.stringify({ ...entry, mode: { ...entry.mode }, selectedModel: undefined });

function getLastPosition(model: ITextModel): IPosition {
	return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}

const chatInputEditorContainerSelector = '.interactive-input-editor';
setupSimpleEditorSelectionStyling(chatInputEditorContainerSelector);

class ChatSessionPickersContainerActionItem extends ActionViewItem {
	constructor(
		action: IAction,
		private readonly widgets: ChatSessionPickerActionItem[],
		options?: IActionViewItemOptions
	) {
		super(null, action, options ?? {});
	}

	override render(container: HTMLElement): void {
		container.classList.add('chat-sessionPicker-container');
		for (const widget of this.widgets) {
			const itemContainer = dom.$('.action-item.chat-sessionPicker-item');
			widget.render(itemContainer);
			container.appendChild(itemContainer);
		}
	}

	override dispose(): void {
		for (const widget of this.widgets) {
			widget.dispose();
		}
		super.dispose();
	}
}

class AddFilesButton extends ActionViewItem {
	private showLabel: boolean | undefined;

	constructor(context: unknown, action: IAction, options: IActionViewItemOptions) {
		super(context, action, {
			...options,
			icon: false,
			label: true,
			keybindingNotRenderedWithLabel: true,
		});
	}

	public setShowLabel(show: boolean): void {
		this.showLabel = show;
		this.updateLabel();
	}

	override render(container: HTMLElement): void {
		container.classList.add('chat-attachment-button');
		super.render(container);
		this.updateLabel();
	}

	protected override updateLabel(): void {
		if (!this.label) {
			return;
		}
		assertType(this.label);
		this.label.classList.toggle('has-label', this.showLabel);
		const message = this.showLabel ? `$(attach) ${this.action.label}` : `$(attach)`;
		dom.reset(this.label, ...renderLabelWithIcons(message));
	}
}
