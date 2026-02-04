/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { addDisposableListener } from '../../../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../../../base/browser/fonts.js';
import { IHistoryNavigationWidget } from '../../../../../../base/browser/history.js';
import { hasModifierKeys, StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { ActionViewItem, BaseActionViewItem, IActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import * as aria from '../../../../../../base/browser/ui/aria/aria.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { equals as arraysEqual } from '../../../../../../base/common/arrays.js';
import { DeferredPromise, RunOnceScheduler } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { mixin } from '../../../../../../base/common/objects.js';
import { autorun, derived, derivedOpts, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { assertType } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorLayoutInfo, EditorOptions, IEditorOptions } from '../../../../../../editor/common/config/editorOptions.js';
import { IDimension } from '../../../../../../editor/common/core/2d/dimension.js';
import { IPosition } from '../../../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../../../editor/common/core/range.js';
import { isLocation } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { CopyPasteController } from '../../../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { DropIntoEditorController } from '../../../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import { ContentHoverController } from '../../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { GlyphHoverController } from '../../../../../../editor/contrib/hover/browser/glyphHoverController.js';
import { LinkDetector } from '../../../../../../editor/contrib/links/browser/links.js';
import { SuggestController } from '../../../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { MenuWorkbenchButtonBar } from '../../../../../../platform/actions/browser/buttonbar.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { registerAndCreateHistoryNavigationContext } from '../../../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ObservableMemento, observableMemento } from '../../../../../../platform/observable/common/observableMemento.js';
import { bindContextKey } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ISharedWebContentExtractorService } from '../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchLayoutService, Position } from '../../../../../services/layout/browser/layoutService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../../accessibility/common/accessibilityCommands.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../../../../codeEditor/browser/simpleEditorOptions.js';
import { InlineChatConfigKeys } from '../../../../inlineChat/common/inlineChat.js';
import { IChatViewTitleActionContext } from '../../../common/actions/chatActions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatRequestVariableSet, IChatRequestVariableEntry, isElementVariableEntry, isImageVariableEntry, isNotebookOutputVariableEntry, isPasteVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isSCMHistoryItemChangeRangeVariableEntry, isSCMHistoryItemChangeVariableEntry, isSCMHistoryItemVariableEntry, isStringVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { ChatMode, IChatMode, IChatModeService } from '../../../common/chatModes.js';
import { IChatFollowup, IChatService, IChatSessionContext } from '../../../common/chatService/chatService.js';
import { agentOptionId, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, IChatSessionsService, isIChatSessionFileChange2, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, validateChatMode } from '../../../common/constants.js';
import { IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatModelInputState, IChatRequestModeInfo, IInputModel } from '../../../common/model/chatModel.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { ChatHistoryNavigator } from '../../../common/widget/chatWidgetHistoryService.js';
import { ChatSessionPrimaryPickerAction, ChatSubmitAction, IChatExecuteActionContext, OpenDelegationPickerAction, OpenModelPickerAction, OpenModePickerAction, OpenSessionTargetPickerAction, OpenWorkspacePickerAction } from '../../actions/chatExecuteActions.js';
import { AgentSessionProviders, getAgentSessionProvider } from '../../agentSessions/agentSessions.js';
import { IAgentSessionsService } from '../../agentSessions/agentSessionsService.js';
import { ChatAttachmentModel } from '../../attachments/chatAttachmentModel.js';
import { DefaultChatAttachmentWidget, ElementChatAttachmentWidget, FileAttachmentWidget, ImageAttachmentWidget, NotebookCellOutputChatAttachmentWidget, PasteAttachmentWidget, PromptFileAttachmentWidget, PromptTextAttachmentWidget, SCMHistoryItemAttachmentWidget, SCMHistoryItemChangeAttachmentWidget, SCMHistoryItemChangeRangeAttachmentWidget, TerminalCommandAttachmentWidget, ToolSetOrToolItemAttachmentWidget } from '../../attachments/chatAttachmentWidgets.js';
import { ChatImplicitContexts } from '../../attachments/chatImplicitContext.js';
import { ImplicitContextAttachmentWidget } from '../../attachments/implicitContextAttachment.js';
import { IChatWidget, ISessionTypePickerDelegate, isIChatResourceViewContext, isIChatViewViewContext, IWorkspacePickerDelegate } from '../../chat.js';
import { ChatEditingShowChangesAction, ViewAllSessionChangesAction, ViewPreviousEditsAction } from '../../chatEditing/chatEditingActions.js';
import { resizeImage } from '../../chatImageUtils.js';
import { ChatSessionPickerActionItem, IChatSessionPickerDelegate } from '../../chatSessions/chatSessionPickerActionItem.js';
import { SearchableOptionPickerActionItem } from '../../chatSessions/searchableOptionPickerActionItem.js';
import { IChatContextService } from '../../contextContrib/chatContextService.js';
import { IDisposableReference } from '../chatContentParts/chatCollections.js';
import { CollapsibleListPool, IChatCollapsibleListItem } from '../chatContentParts/chatReferencesContentPart.js';
import { ChatTodoListWidget } from '../chatContentParts/chatTodoListWidget.js';
import { ChatDragAndDrop } from '../chatDragAndDrop.js';
import { ChatFollowups } from './chatFollowups.js';
import { ChatInputPartWidgetController } from './chatInputPartWidgets.js';
import { IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { ChatSelectedTools } from './chatSelectedTools.js';
import { DelegationSessionPickerActionItem } from './delegationSessionPickerActionItem.js';
import { IModelPickerDelegate, ModelPickerActionItem } from './modelPickerActionItem.js';
import { IModePickerDelegate, ModePickerActionItem } from './modePickerActionItem.js';
import { SessionTypePickerActionItem } from './sessionTargetPickerActionItem.js';
import { WorkspacePickerActionItem } from './workspacePickerActionItem.js';
import { ChatContextUsageWidget } from '../../widgetHosts/viewPane/chatContextUsageWidget.js';

const $ = dom.$;

const INPUT_EDITOR_MAX_HEIGHT = 250;
const CachedLanguageModelsKey = 'chat.cachedLanguageModels.v2';

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
	/**
	 * Optional delegate for the session target picker.
	 * When provided, allows the input part to maintain independent state for the selected session type.
	 */
	sessionTypePickerDelegate?: ISessionTypePickerDelegate;
	/**
	 * Optional delegate for the workspace picker.
	 * When provided, shows a workspace picker allowing users to select a target workspace
	 * for their chat request. This is useful for empty window contexts.
	 */
	workspacePickerDelegate?: IWorkspacePickerDelegate;
}

export interface IWorkingSetEntry {
	uri: URI;
}

export const enum ChatWidgetLocation {
	SidebarLeft = 'sidebarLeft',
	SidebarRight = 'sidebarRight',
	Panel = 'panel',
	Editor = 'editor',
}

export interface IChatWidgetLocationInfo {
	readonly location: ChatWidgetLocation;
	readonly isMaximized: boolean;
}

const emptyInputState = observableMemento<IChatModelInputState | undefined>({
	defaultValue: undefined,
	key: 'chat.untitledInputState',
	toStorage: JSON.stringify,
	fromStorage(value) {
		const obj = JSON.parse(value) as IChatModelInputState;
		if (obj.selectedModel && !obj.selectedModel.metadata.isDefaultForLocation) {
			// Migrate old `isDefault` to `isDefaultForLocation`
			type OldILanguageModelChatMetadata = ILanguageModelChatMetadata & { isDefault?: boolean };
			const oldIsDefault = (obj.selectedModel.metadata as OldILanguageModelChatMetadata).isDefault;
			const isDefaultForLocation = { [ChatAgentLocation.Chat]: Boolean(oldIsDefault) };
			mixin(obj.selectedModel.metadata, { isDefaultForLocation: isDefaultForLocation } satisfies Partial<ILanguageModelChatMetadata>);
			delete (obj.selectedModel.metadata as OldILanguageModelChatMetadata).isDefault;
		}
		return obj;
	},
});

export class ChatInputPart extends Disposable implements IHistoryNavigationWidget {
	private static _counter = 0;

	private _workingSetCollapsed = observableValue('chatInputPart.workingSetCollapsed', true);
	private readonly _chatInputTodoListWidget = this._register(new MutableDisposable<ChatTodoListWidget>());
	private readonly _chatEditingTodosDisposables = this._register(new DisposableStore());
	private _lastEditingSessionResource: URI | undefined;

	private _onDidLoadInputState: Emitter<void> = this._register(new Emitter());
	readonly onDidLoadInputState: Event<void> = this._onDidLoadInputState.event;

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

	private readonly _implicitContextWidget: MutableDisposable<ImplicitContextAttachmentWidget> = this._register(new MutableDisposable<ImplicitContextAttachmentWidget>());

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

		if (this.implicitContext) {
			const implicitChatVariables = this.implicitContext.enabledBaseEntries(this.configurationService.getValue<boolean>('chat.implicitContext.suggestedContext'));
			contextArr.add(...implicitChatVariables);
		}
		return contextArr;
	}

	private _indexOfLastAttachedContextDeletedWithKeyboard: number = -1;
	private _indexOfLastOpenedContext: number = -1;

	private _implicitContext: ChatImplicitContexts | undefined;
	public get implicitContext(): ChatImplicitContexts | undefined {
		return this._implicitContext;
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

	private chatEditingSessionWidgetContainer!: HTMLElement;
	private chatInputTodoListWidgetContainer!: HTMLElement;
	private chatInputWidgetsContainer!: HTMLElement;
	private readonly _widgetController = this._register(new MutableDisposable<ChatInputPartWidgetController>());

	private contextUsageWidget?: ChatContextUsageWidget;
	private contextUsageWidgetContainer!: HTMLElement;
	private readonly _contextUsageDisposables = this._register(new MutableDisposable<DisposableStore>());

	readonly height = observableValue<number>(this, 0);

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

	private history: ChatHistoryNavigator;
	private historyNavigationBackwardsEnablement!: IContextKey<boolean>;
	private historyNavigationForewardsEnablement!: IContextKey<boolean>;
	private inputModel: ITextModel | undefined;
	private inputEditorHasText: IContextKey<boolean>;
	private chatCursorAtTop: IContextKey<boolean>;
	private inputEditorHasFocus: IContextKey<boolean>;
	private currentlyEditingInputKey!: IContextKey<boolean>;
	private chatModeKindKey: IContextKey<ChatModeKind>;
	private chatModeNameKey: IContextKey<string>;
	private withinEditSessionKey: IContextKey<boolean>;
	private filePartOfEditSessionKey: IContextKey<boolean>;
	private chatSessionHasOptions: IContextKey<boolean>;
	private chatSessionOptionsValid: IContextKey<boolean>;
	private agentSessionTypeKey: IContextKey<string>;
	private chatSessionHasCustomAgentTarget: IContextKey<boolean>;
	private modelWidget: ModelPickerActionItem | undefined;
	private modeWidget: ModePickerActionItem | undefined;
	private sessionTargetWidget: SessionTypePickerActionItem | undefined;
	private delegationWidget: DelegationSessionPickerActionItem | undefined;
	private chatSessionPickerWidgets: Map<string, ChatSessionPickerActionItem | SearchableOptionPickerActionItem> = new Map();
	private chatSessionPickerContainer: HTMLElement | undefined;
	private _lastSessionPickerAction: MenuItemAction | undefined;
	private readonly _waitForPersistedLanguageModel: MutableDisposable<IDisposable> = this._register(new MutableDisposable<IDisposable>());
	private readonly _chatSessionOptionEmitters: Map<string, Emitter<IChatSessionProviderOptionItem>> = new Map();

	/**
	 * Scoped context key service for this chat input part.
	 * Used to isolate option group context keys to this specific chat input instance.
	 */
	private _scopedContextKeyService: IContextKeyService | undefined;

	/**
	 * Map of option group ID to its context key.
	 * Keys follow the pattern `chatSessionOption.<groupId>` and hold the currently selected option item ID.
	 */
	private readonly _optionContextKeys: Map<string, IContextKey<string>> = new Map();

	private _currentLanguageModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('_currentLanguageModel', undefined);

	get currentLanguageModel() {
		return this._currentLanguageModel.get()?.identifier;
	}

	get selectedLanguageModel(): IObservable<ILanguageModelChatMetadataAndIdentifier | undefined> {
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

	private cachedWidth: number | undefined;
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
	 * Gets the pending delegation target if one is set.
	 * This is used when the user changes the session target picker to a different provider
	 * but hasn't submitted yet, so the delegation will happen on submit.
	 */
	public get pendingDelegationTarget(): AgentSessionProviders | undefined {
		return this._pendingDelegationTarget;
	}

	/**
	 * Number consumers holding the 'generating' lock.
	 */
	private _generating?: { rc: number; defer: DeferredPromise<void> };

	private _emptyInputState: ObservableMemento<IChatModelInputState | undefined>;
	private _chatSessionIsEmpty = false;
	private _pendingDelegationTarget: AgentSessionProviders | undefined = undefined;

	constructor(
		// private readonly editorOptions: ChatEditorOptions, // TODO this should be used
		private readonly location: ChatAgentLocation,
		private readonly options: IChatInputPartOptions,
		styles: IChatInputStyles,
		private readonly inline: boolean,
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
		@IChatAgentService private readonly agentService: IChatAgentService,
		@ISharedWebContentExtractorService private readonly sharedWebExtracterService: ISharedWebContentExtractorService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@ILanguageModelToolsService private readonly toolService: ILanguageModelToolsService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatContextService private readonly chatContextService: IChatContextService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		super();

		// Initialize debounced text sync scheduler
		this._syncTextDebounced = this._register(new RunOnceScheduler(() => this._syncInputStateToModel(), 150));
		this._emptyInputState = this._register(emptyInputState(StorageScope.WORKSPACE, StorageTarget.USER, this.storageService));

		this._contextResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event }));
		this._currentModeObservable = observableValue<IChatMode>('currentMode', this.options.defaultMode ?? ChatMode.Agent);
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this._indexOfLastOpenedContext = -1;
			this.refreshChatSessionPickers();
		}));

		// React to chat session option changes for the active session
		this._register(this.chatSessionsService.onDidChangeSessionOptions(e => {
			const sessionResource = this._widget?.viewModel?.model.sessionResource;
			if (sessionResource && isEqual(sessionResource, e)) {
				// Options changed for our current session - refresh pickers
				this.refreshChatSessionPickers();
			}
		}));

		this._register(this.chatSessionsService.onDidChangeOptionGroups(chatSessionType => {
			const sessionResource = this._widget?.viewModel?.model.sessionResource;
			if (sessionResource) {
				const ctx = this.chatService.getChatSessionFromInternalUri(sessionResource);
				const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
				if (ctx?.chatSessionType === chatSessionType || delegateSessionType === chatSessionType) {
					this.refreshChatSessionPickers();
				}
			}
		}));

		// Listen for session type changes from the welcome page delegate
		if (this.options.sessionTypePickerDelegate?.onDidChangeActiveSessionProvider) {
			this._register(this.options.sessionTypePickerDelegate.onDidChangeActiveSessionProvider(async (newSessionType) => {
				this.computeVisibleOptionGroups();
				this.agentSessionTypeKey.set(newSessionType);
				this.updateWidgetLockStateFromSessionType(newSessionType);
				this.refreshChatSessionPickers();
			}));
		}

		this._attachmentModel = this._register(this.instantiationService.createInstance(ChatAttachmentModel));
		this._register(this._attachmentModel.onDidChange(() => this._syncInputStateToModel()));
		this.selectedToolsModel = this._register(this.instantiationService.createInstance(ChatSelectedTools, this.currentModeObs, this._currentLanguageModel));
		this.dnd = this._register(this.instantiationService.createInstance(ChatDragAndDrop, () => this._widget, this._attachmentModel, styles));

		this.inputEditorMaxHeight = this.options.renderStyle === 'compact' ? INPUT_EDITOR_MAX_HEIGHT / 3 : INPUT_EDITOR_MAX_HEIGHT;

		this.inputEditorHasText = ChatContextKeys.inputHasText.bindTo(contextKeyService);
		this.chatCursorAtTop = ChatContextKeys.inputCursorAtTop.bindTo(contextKeyService);
		this.inputEditorHasFocus = ChatContextKeys.inputHasFocus.bindTo(contextKeyService);
		this.chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(contextKeyService);
		this.chatModeNameKey = ChatContextKeys.chatModeName.bindTo(contextKeyService);
		this.withinEditSessionKey = ChatContextKeys.withinEditSessionDiff.bindTo(contextKeyService);
		this.filePartOfEditSessionKey = ChatContextKeys.filePartOfEditSession.bindTo(contextKeyService);
		this.chatSessionHasOptions = ChatContextKeys.chatSessionHasModels.bindTo(contextKeyService);
		this.chatSessionOptionsValid = ChatContextKeys.chatSessionOptionsValid.bindTo(contextKeyService);
		this.agentSessionTypeKey = ChatContextKeys.agentSessionType.bindTo(contextKeyService);

		// Initialize agentSessionType from delegate if available
		if (this.options.sessionTypePickerDelegate?.getActiveSessionProvider) {
			const initialSessionType = this.options.sessionTypePickerDelegate.getActiveSessionProvider();
			if (initialSessionType) {
				this.agentSessionTypeKey.set(initialSessionType);
			}
		}
		this.chatSessionHasCustomAgentTarget = ChatContextKeys.chatSessionHasCustomAgentTarget.bindTo(contextKeyService);

		this.history = this._register(this.instantiationService.createInstance(ChatHistoryNavigator, this.location));

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
				CachedLanguageModelsKey,
				this.storageService.getObject<ILanguageModelChatMetadataAndIdentifier[]>(CachedLanguageModelsKey, StorageScope.APPLICATION, []).filter(m => !m.identifier.startsWith(vendor)),
				StorageScope.APPLICATION,
				StorageTarget.MACHINE
			);

			// We've changed models and the current one is no longer available. Select a new one
			const selectedModel = this._currentLanguageModel ? this.getModels().find(m => m.identifier === this._currentLanguageModel.get()?.identifier) : undefined;
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
			this.setImplicitContextEnablement();
		}));
		this._register(autorun(reader => {
			const lm = this._currentLanguageModel.read(reader);
			if (lm?.metadata.name) {
				this.accessibilityService.alert(lm.metadata.name);
			}
			this._inputEditor?.updateOptions({ ariaLabel: this._getAriaLabel() });
		}));
		this._register(this.chatModeService.onDidChangeChatModes(() => this.validateCurrentChatMode()));
		this._register(autorun(r => {
			const mode = this._currentModeObservable.read(r);
			this.chatModeKindKey.set(mode.kind);
			this.chatModeNameKey.set(mode.name.read(r));
			const models = mode.model?.read(r);
			if (models) {
				this.switchModelByQualifiedName(models);
			}
		}));

		this._register(autorun(r => {
			const mode = this._currentModeObservable.read(r);
			const modeName = mode.name.read(r);
			const sessionResource = this._widget?.viewModel?.model.sessionResource;
			if (sessionResource) {
				const ctx = this.chatService.getChatSessionFromInternalUri(sessionResource);
				if (ctx) {
					this.chatSessionsService.notifySessionOptionsChange(
						ctx.chatSessionResource,
						[{ optionId: agentOptionId, value: mode.isBuiltin ? '' : modeName }]
					).catch(err => this.logService.error('Failed to notify extension of agent change:', err));
				}
			}
		}));

		// Validate the initial mode - if Agent mode is set by default but disabled by policy, switch to Ask
		this.validateCurrentChatMode();
	}

	private setImplicitContextEnablement() {
		if (this.implicitContext && this.configurationService.getValue<boolean>('chat.implicitContext.suggestedContext')) {
			this.implicitContext.setEnabled(this._currentModeObservable.get().kind !== ChatMode.Agent.kind);
		}
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
				if (!persistedAsDefault || model.metadata.isDefaultForLocation[this.location]) {
					this.setCurrentLanguageModel(model);
					this.checkModelSupported();
				}
			} else {
				this._waitForPersistedLanguageModel.value = this.languageModelsService.onDidChangeLanguageModels(e => {
					const persistedModel = this.languageModelsService.lookupLanguageModel(persistedSelection);
					if (persistedModel) {
						this._waitForPersistedLanguageModel.clear();

						// Only restore the model if it wasn't the default at the time of storing or it is now the default
						if (!persistedAsDefault || persistedModel.isDefaultForLocation[this.location]) {
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

	public switchModelByQualifiedName(qualifiedModelNames: readonly string[]): boolean {
		const models = this.getModels();
		for (const qualifiedModelName of qualifiedModelNames) {
			const model = models.find(m => ILanguageModelChatMetadata.matchesQualifiedName(qualifiedModelName, m.metadata));
			if (model) {
				this.setCurrentLanguageModel(model);
				return true;
			}
		}
		this.logService.warn(`[chat] Node of the models "${qualifiedModelNames.join(', ')}" not found. Use format "<name> (<vendor>)", e.g. "GPT-4o (copilot)".`);
		return false;
	}


	public switchToNextModel(): void {
		const models = this.getModels();
		if (models.length > 0) {
			const currentIndex = models.findIndex(model => model.identifier === this._currentLanguageModel.get()?.identifier);
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

	public openSessionTargetPicker(): void {
		this.sessionTargetWidget?.show();
	}

	public openDelegationPicker(): void {
		this.delegationWidget?.show();
	}

	public openChatSessionPicker(): void {
		// Open the first available picker widget
		const firstWidget = this.chatSessionPickerWidgets?.values()?.next().value;
		firstWidget?.show();
	}

	/**
	 * Create picker widgets for all option groups available for the current session type.
	 */
	private createChatSessionPickerWidgets(action: MenuItemAction): (ChatSessionPickerActionItem | SearchableOptionPickerActionItem)[] {
		this._lastSessionPickerAction = action;

		const result = this.computeVisibleOptionGroups();
		if (!result) {
			return [];
		}

		const { visibleGroupIds, optionGroups, effectiveSessionType } = result;
		// Clear existing widgets
		this.disposeSessionPickerWidgets();

		const widgets: (ChatSessionPickerActionItem | SearchableOptionPickerActionItem)[] = [];
		for (const optionGroup of optionGroups) {
			if (!visibleGroupIds.has(optionGroup.id)) {
				continue;
			}

			const initialItem = this.getCurrentOptionForGroup(optionGroup.id);
			const initialState = { group: optionGroup, item: initialItem };

			// Create delegate for this option group
			const itemDelegate: IChatSessionPickerDelegate = {
				getCurrentOption: () => this.getCurrentOptionForGroup(optionGroup.id),
				onDidChangeOption: this.getOrCreateOptionEmitter(optionGroup.id).event,
				setOption: (option: IChatSessionProviderOptionItem) => {
					// Update context key for this option group
					this.updateOptionContextKey(optionGroup.id, option.id);
					this.getOrCreateOptionEmitter(optionGroup.id).fire(option);

					// Notify session if we have one (not in welcome view before session creation)
					const sessionResource = this._widget?.viewModel?.model.sessionResource;
					const currentCtx = sessionResource ? this.chatService.getChatSessionFromInternalUri(sessionResource) : undefined;
					if (currentCtx) {
						this.chatSessionsService.notifySessionOptionsChange(
							currentCtx.chatSessionResource,
							[{ optionId: optionGroup.id, value: option }]
						).catch(err => this.logService.error(`Failed to notify extension of ${optionGroup.id} change:`, err));
					}

					// Refresh pickers to re-evaluate visibility of other option groups
					this.refreshChatSessionPickers();
				},
				getOptionGroup: () => {
					const groups = this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType);
					return groups?.find(g => g.id === optionGroup.id);
				},
				getSessionResource: () => {
					return this._widget?.viewModel?.model.sessionResource;
				}
			};

			const widget = this.instantiationService.createInstance(optionGroup.searchable ? SearchableOptionPickerActionItem : ChatSessionPickerActionItem, action, initialState, itemDelegate);
			this.chatSessionPickerWidgets.set(optionGroup.id, widget);
			widgets.push(widget);
		}

		return widgets;
	}

	/**
	 * Set the input model reference for syncing input state
	 */
	setInputModel(model: IInputModel, chatSessionIsEmpty: boolean): void {
		this._inputModel = model;
		this._modelSyncDisposables.clear();
		this.selectedToolsModel.resetSessionEnablementState();
		this._chatSessionIsEmpty = chatSessionIsEmpty;

		// TODO@roblourens This is for an experiment which will be obsolete in a month or two and can then be removed.
		if (chatSessionIsEmpty) {
			this._setEmptyModelState();
		}

		// Observe changes from model and sync to view
		this._modelSyncDisposables.add(autorun(reader => {
			let state = model.state.read(reader);
			if (!state && this._chatSessionIsEmpty) {
				state = this._emptyInputState.read(undefined);
			}

			this._syncFromModel(state);
		}));
	}

	private _setEmptyModelState() {
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
				const lm = this._currentLanguageModel.get();
				if (!lm || lm.identifier !== state.selectedModel.identifier) {
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
		if (this._isSyncingToOrFromInputModel) {
			return;
		}


		this._isSyncingToOrFromInputModel = true;
		const state = this.getCurrentInputState();
		if (this._chatSessionIsEmpty) {
			this._emptyInputState.set(state, undefined);
		}
		this._inputModel?.setState(state);
		this._isSyncingToOrFromInputModel = false;
	}

	public setCurrentLanguageModel(model: ILanguageModelChatMetadataAndIdentifier) {
		this._currentLanguageModel.set(model, undefined);

		if (this.cachedWidth) {
			// For quick chat and editor chat, relayout because the input may need to shrink to accomodate the model name
			this.layout(this.cachedWidth);
		}

		// Store as global user preference (session-specific state is in the model's inputModel)
		this.storageService.store(this.getSelectedModelStorageKey(), model.identifier, StorageScope.APPLICATION, StorageTarget.USER);
		this.storageService.store(this.getSelectedModelIsDefaultStorageKey(), !!model.metadata.isDefaultForLocation[this.location], StorageScope.APPLICATION, StorageTarget.USER);

		// Sync to model
		this._syncInputStateToModel();
	}

	private checkModelSupported(): void {
		const lm = this._currentLanguageModel.get();
		if (lm && (!this.modelSupportedForDefaultAgent(lm) || !this.modelSupportedForInlineChat(lm))) {
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

	private modelSupportedForInlineChat(model: ILanguageModelChatMetadataAndIdentifier): boolean {
		if (this.location !== ChatAgentLocation.EditorInline || !this.configurationService.getValue(InlineChatConfigKeys.EnableV2)) {
			return true;
		}
		return !!model.metadata.capabilities?.toolCalling;
	}

	private getModels(): ILanguageModelChatMetadataAndIdentifier[] {
		const cachedModels = this.storageService.getObject<ILanguageModelChatMetadataAndIdentifier[]>(CachedLanguageModelsKey, StorageScope.APPLICATION, []);
		let models = this.languageModelsService.getLanguageModelIds()
			.map(modelId => ({ identifier: modelId, metadata: this.languageModelsService.lookupLanguageModel(modelId)! }));
		if (models.length === 0 || models.some(m => m.metadata.isDefaultForLocation[this.location]) === false) {
			models = cachedModels;
		} else {
			this.storageService.store(CachedLanguageModelsKey, models, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
		return models.filter(entry => entry.metadata?.isUserSelectable && this.modelSupportedForDefaultAgent(entry) && this.modelSupportedForInlineChat(entry));
	}

	private setCurrentLanguageModelToDefault() {
		const allModels = this.getModels();
		const defaultModel = allModels.find(m => m.metadata.isDefaultForLocation[this.location]) || allModels.find(m => m.metadata.isUserSelectable);
		if (defaultModel) {
			this.setCurrentLanguageModel(defaultModel);
		}
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
			selectedModel: this._currentLanguageModel.get(),
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
		const modelName = this._currentLanguageModel.get()?.metadata.name;
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
		const isAgentModeEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled);
		if (!validMode) {
			this.setChatMode(isAgentModeEnabled ? ChatModeKind.Agent : ChatModeKind.Ask);
			return;
		}
		if (currentMode.kind === ChatModeKind.Agent && !isAgentModeEnabled) {
			this.setChatMode(ChatModeKind.Ask);
			return;
		}
	}

	private getDefaultModeExperimentStorageKey(): string {
		const tag = this.options.widgetViewKindTag;
		return `chat.${tag}.hasSetDefaultModeByExperiment`;
	}

	logInputHistory(): void {
		const historyStr = this.history.values.map(entry => JSON.stringify(entry)).join('\n');
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

	async showPreviousValue(): Promise<void> {
		if (this.history.isAtStart()) {
			return;
		}

		const state = this.getCurrentInputState();
		if (state.inputText || state.attachments.length) {
			this.history.overlay(state);
		}
		this.navigateHistory(true);
	}

	async showNextValue(): Promise<void> {
		if (this.history.isAtEnd()) {
			return;
		}

		const state = this.getCurrentInputState();
		if (state.inputText || state.attachments.length) {
			this.history.overlay(state);
		}
		this.navigateHistory(false);
	}

	private async navigateHistory(previous: boolean): Promise<void> {
		const historyEntry = previous ?
			this.history.previous() : this.history.next();

		let historyAttachments = historyEntry?.attachments ?? [];

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

		const inputText = historyEntry?.inputText ?? '';
		const contribData = historyEntry?.contrib ?? {};
		aria.status(inputText);
		this.setValue(inputText, true);
		this._widget?.contribs.forEach(contrib => {
			contrib.setInputState?.(contribData);
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
			this.history.append(this._getFilteredEntry(userQuery));
		}

		if (this._chatSessionIsEmpty) {
			this._chatSessionIsEmpty = false;
			this._emptyInputState.set(undefined, undefined);
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

	// A function that filters out specifically the `value` property of the attachment.
	private _getFilteredEntry(inputState: IChatModelInputState): IChatModelInputState {
		const attachmentsWithoutImageValues = inputState.attachments.map(attachment => {
			if (isImageVariableEntry(attachment) && attachment.references?.length && attachment.value) {
				const newAttachment = { ...attachment };
				newAttachment.value = undefined;
				return newAttachment;
			}
			return attachment;
		});

		return { ...inputState, attachments: attachmentsWithoutImageValues };
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
	 * Get or create a context key for an option group.
	 * Context keys follow the pattern `chatSessionOption.<groupId>`.
	 */
	private getOrCreateOptionContextKey(optionGroupId: string): IContextKey<string> | undefined {
		if (!this._scopedContextKeyService) {
			return undefined;
		}
		let contextKey = this._optionContextKeys.get(optionGroupId);
		if (!contextKey) {
			const rawKey = new RawContextKey<string>(`chatSessionOption.${optionGroupId}`, '');
			contextKey = rawKey.bindTo(this._scopedContextKeyService);
			this._optionContextKeys.set(optionGroupId, contextKey);
		}
		return contextKey;
	}

	/**
	 * Update the context key for an option group with the current selection.
	 * This enables `when` expressions on other option groups to react to changes.
	 */
	private updateOptionContextKey(optionGroupId: string, optionItemId: string): void {
		const normalizedOptionId = optionItemId.trim();
		const contextKey = this.getOrCreateOptionContextKey(optionGroupId);
		if (contextKey) {
			contextKey.set(normalizedOptionId);
		}
	}

	/**
	 * Evaluate whether an option group should be visible based on its `when` expression.
	 * Returns true if the option group should be visible, false otherwise.
	 */
	private evaluateOptionGroupVisibility(optionGroup: { id: string; when?: string }): boolean {
		if (!optionGroup.when) {
			return true; // No condition means always visible
		}

		if (!this._scopedContextKeyService) {
			return true; // No context key service yet, default to visible
		}

		const expr = ContextKeyExpr.deserialize(optionGroup.when);
		if (!expr) {
			return true; // Invalid expression defaults to visible
		}

		return this._scopedContextKeyService.contextMatchesRules(expr);
	}

	/**
	 * Computes which option groups should be visible for the current session.
	 *
	 * A picker should show if and only if:
	 * 1. We can determine a session type (from session context OR delegate)
	 * 2. That session type has option groups registered
	 * 3. At least one option group has items AND passes its `when` clause
	 *
	 * This method also updates the `chatSessionHasOptions` context key, which controls
	 * whether the picker action is shown in the toolbar via its `when` clause.
	 *
	 * @returns The result containing visible group IDs and related context, or undefined
	 *          if there are no visible option groups
	 */
	private computeVisibleOptionGroups(): {
		visibleGroupIds: Set<string>;
		optionGroups: IChatSessionProviderOptionGroup[];
		ctx: IChatSessionContext | undefined;
		effectiveSessionType: string;
	} | undefined {
		const setNoOptions = () => {
			this.chatSessionHasOptions.set(false);
			this.chatSessionOptionsValid.set(true);
		};

		const sessionResource = this._widget?.viewModel?.model.sessionResource;
		const ctx = sessionResource ? this.chatService.getChatSessionFromInternalUri(sessionResource) : undefined;

		// Check if this session type has a customAgentTarget
		const customAgentTarget = ctx && this.chatSessionsService.getCustomAgentTargetForSessionType(ctx.chatSessionType);
		this.chatSessionHasCustomAgentTarget.set(!!customAgentTarget);

		// Handle agent option from session - set initial mode
		if (customAgentTarget) {
			const agentOption = this.chatSessionsService.getSessionOption(ctx.chatSessionResource, agentOptionId);
			if (typeof agentOption !== 'undefined') {
				const agentId = (typeof agentOption === 'string' ? agentOption : agentOption.id) || ChatMode.Agent.id;
				const currentMode = this._currentModeObservable.get();
				const isDefaultAgent = agentId === ChatMode.Agent.id;
				const needsUpdate = isDefaultAgent
					? currentMode.id !== ChatMode.Agent.id
					: currentMode.label.get() !== agentId; // Extensions use Label (name) as identifier for custom agents.

				if (needsUpdate) {
					this.setChatMode(agentId);
				}
			}
		}

		// Step 1: Determine the session type
		// - Panel/Editor: Use actual session's type (ctx available)
		// - Welcome view: Use delegate's type (ctx may not exist yet)
		const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
		const effectiveSessionType = delegateSessionType ?? ctx?.chatSessionType;

		if (!effectiveSessionType) {
			setNoOptions();
			return undefined;
		}

		// Step 2: Get option groups for this session type
		const optionGroups = this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType);
		if (!optionGroups || optionGroups.length === 0) {
			setNoOptions();
			return undefined;
		}

		// Update context keys with current option values before evaluating `when` clauses.
		// This ensures interdependent `when` expressions work correctly.
		if (ctx) {
			for (const optionGroup of optionGroups) {
				const currentOption = this.chatSessionsService.getSessionOption(ctx.chatSessionResource, optionGroup.id);
				if (currentOption) {
					const optionId = typeof currentOption === 'string' ? currentOption : currentOption.id;
					this.updateOptionContextKey(optionGroup.id, optionId);
				}
			}
		}

		// Step 3: Filter to visible groups (has items AND passes `when` clause AND session has option configured)
		const visibleGroupIds = new Set<string>();
		for (const optionGroup of optionGroups) {
			const hasItems = optionGroup.items.length > 0 || (optionGroup.commands || []).length > 0;
			const passesWhenClause = this.evaluateOptionGroupVisibility(optionGroup);

			// Only show picker if the session has this option configured once a real session exists.
			// In the welcome view (no `ctx` yet), treat groups as eligible so they can be rendered.
			const sessionHasOption = !ctx || this.chatSessionsService.getSessionOption(ctx.chatSessionResource, optionGroup.id) !== undefined;

			if (hasItems && passesWhenClause && sessionHasOption) {
				visibleGroupIds.add(optionGroup.id);
			}
		}

		if (visibleGroupIds.size === 0) {
			setNoOptions();
			return undefined;
		}

		// Validate selected options exist in their respective groups
		let allOptionsValid = true;
		if (ctx) {
			for (const groupId of visibleGroupIds) {
				const optionGroup = optionGroups.find(g => g.id === groupId);
				const currentOption = this.chatSessionsService.getSessionOption(ctx.chatSessionResource, groupId);
				if (optionGroup && currentOption) {
					const currentOptionId = typeof currentOption === 'string' ? currentOption : currentOption.id;
					// TODO: @osortega @joshspicer should we add a `placeHolder` item to option groups to straighten this check?
					if (!optionGroup.items.some(item => item.id === currentOptionId) && typeof currentOption === 'string') {
						allOptionsValid = false;
						break;
					}
				}
			}
		}

		this.chatSessionHasOptions.set(true);
		this.chatSessionOptionsValid.set(allOptionsValid);

		return { visibleGroupIds, optionGroups, ctx, effectiveSessionType };
	}

	/**
	 * Refresh all registered option groups for the current chat session.
	 * Fires events for each option group with their current selection.
	 */
	private refreshChatSessionPickers(): void {
		// Use the shared helper to compute visibility and update context keys
		const result = this.computeVisibleOptionGroups();

		if (!result) {
			// No visible options - helper already updated context keys
			this.hideAllSessionPickerWidgets();
			return;
		}

		const { visibleGroupIds, optionGroups, ctx } = result;

		// Check if widgets need recreation (different set of visible groups)
		const currentWidgetGroupIds = new Set(this.chatSessionPickerWidgets.keys());
		const needsRecreation =
			currentWidgetGroupIds.size !== visibleGroupIds.size ||
			!Array.from(visibleGroupIds).every(id => currentWidgetGroupIds.has(id));

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

		// Fire option change events for existing widgets to sync their state
		// (only if we have a session context - in welcome view, options aren't persisted yet)
		if (ctx) {
			for (const [optionGroupId] of this.chatSessionPickerWidgets.entries()) {
				const currentOption = this.chatSessionsService.getSessionOption(ctx.chatSessionResource, optionGroupId);
				if (currentOption) {
					const optionGroup = optionGroups.find(g => g.id === optionGroupId);
					if (optionGroup) {
						const currentOptionId = typeof currentOption === 'string' ? currentOption : currentOption.id;
						const item = optionGroup.items.find((m: IChatSessionProviderOptionItem) => m.id === currentOptionId);
						// If currentOption is an object (not a string ID), it represents a complete option item and should be used directly.
						// Otherwise, if it's a string ID, look up the corresponding item and use that.
						if (item && typeof currentOption === 'string') {
							this.getOrCreateOptionEmitter(optionGroupId).fire(item);
						} else if (typeof currentOption !== 'string') {
							this.getOrCreateOptionEmitter(optionGroupId).fire(currentOption);
						}

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
	 * Returns undefined if the session doesn't have this option configured.
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

		// Only return an option if the session has it configured
		if (this.chatSessionsService.getSessionOption(ctx.chatSessionResource, optionGroupId) === undefined) {
			return;
		}

		const effectiveSessionType = this.getEffectiveSessionType(ctx, this.options.sessionTypePickerDelegate);
		const optionGroups = this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType);
		const optionGroup = optionGroups?.find(g => g.id === optionGroupId);
		if (!optionGroup || optionGroup.items.length === 0) {
			return;
		}

		const currentOptionValue = this.chatSessionsService.getSessionOption(ctx.chatSessionResource, optionGroupId);
		if (!currentOptionValue) {
			const defaultItem = optionGroup.items.find(item => item.default);
			return defaultItem;
		}

		if (typeof currentOptionValue === 'string') {
			const normalizedOptionId = currentOptionValue.trim();
			return optionGroup.items.find(m => m.id === normalizedOptionId);
		} else {
			return currentOptionValue as IChatSessionProviderOptionItem;
		}

	}

	private getEffectiveSessionType(ctx: IChatSessionContext | undefined, delegate: ISessionTypePickerDelegate | undefined): string {
		return this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.() || ctx?.chatSessionType || '';
	}

	/**
	 * Updates the agentSessionType context key based on delegate or actual session.
	 */
	private updateAgentSessionTypeContextKey(): void {
		const sessionResource = this._widget?.viewModel?.model.sessionResource;

		// Determine effective session type:
		// - If we have a delegate with a setter (e.g., welcome page), use the delegate's session type
		// - Otherwise, use the actual session's type
		const delegate = this.options.sessionTypePickerDelegate;
		const delegateSessionType = delegate?.setActiveSessionProvider && delegate?.getActiveSessionProvider?.();
		const sessionType = delegateSessionType || (sessionResource ? getChatSessionType(sessionResource) : '');

		this.agentSessionTypeKey.set(sessionType);
	}

	/**
	 * Updates the widget lock state based on a session type.
	 * Local sessions unlock from coding agent mode, while remote/cloud sessions lock to coding agent mode.
	 */
	private updateWidgetLockStateFromSessionType(sessionType: string): void {
		if (sessionType === localChatSessionType) {
			this._widget?.unlockFromCodingAgent();
			return;
		}

		const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
		if (contribution) {
			this._widget?.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type);
		} else {
			this._widget?.unlockFromCodingAgent();
		}
	}

	/**
	 * Updates the widget controller based on session type.
	 */
	private tryUpdateWidgetController(): void {
		const sessionResource = this._widget?.viewModel?.model.sessionResource;
		if (!sessionResource) {
			return;
		}

		// Determine effective session type:
		// - If we have a delegate with a setter (e.g., welcome page), use the delegate's session type
		// - Otherwise, use the actual session's type
		const delegate = this.options.sessionTypePickerDelegate;
		const delegateSessionType = delegate?.setActiveSessionProvider && delegate?.getActiveSessionProvider?.();
		const sessionType = delegateSessionType || this._pendingDelegationTarget || getChatSessionType(sessionResource);
		const isLocalSession = sessionType === localChatSessionType;

		if (!isLocalSession) {
			this._widgetController.clear();
			return;
		}

		if (!this._widgetController.value) {
			this._widgetController.value = this.instantiationService.createInstance(ChatInputPartWidgetController, this.chatInputWidgetsContainer);
		}
	}

	/**
	 * Updates the context usage widget based on the current model.
	 */
	private updateContextUsageWidget(): void {
		this._contextUsageDisposables.clear();

		const model = this._widget?.viewModel?.model;
		if (!model || !this.contextUsageWidget) {
			return;
		}

		const store = new DisposableStore();
		this._contextUsageDisposables.value = store;

		store.add(model.onDidChange(e => {
			if (e.kind === 'addRequest' || e.kind === 'completedRequest') {
				this.contextUsageWidget?.update(model.lastRequest);
			}
		}));

		// Initial update
		this.contextUsageWidget.update(model.lastRequest);
	}

	render(container: HTMLElement, initialValue: string, widget: IChatWidget) {
		this._widget = widget;
		this.computeVisibleOptionGroups();

		// Initialize lock state when rendering with a pre-selected session provider (e.g., welcome view restore)
		const delegate = this.options.sessionTypePickerDelegate;
		if (delegate?.setActiveSessionProvider && delegate?.getActiveSessionProvider) {
			const initialSessionType = delegate.getActiveSessionProvider();
			if (initialSessionType) {
				this.updateWidgetLockStateFromSessionType(initialSessionType);
			}
		}

		this._register(widget.onDidChangeViewModel(() => {
			this._pendingDelegationTarget = undefined;
			// Update agentSessionType when view model changes
			this.updateAgentSessionTypeContextKey();
			this.refreshChatSessionPickers();
			this.tryUpdateWidgetController();
			this.updateContextUsageWidget();
		}));

		let elements;
		if (this.options.renderStyle === 'compact') {
			elements = dom.h('.interactive-input-part', [
				dom.h('.interactive-input-and-edit-session', [
					dom.h('.chat-input-widgets-container@chatInputWidgetsContainer'),
					dom.h('.chat-todo-list-widget-container@chatInputTodoListWidgetContainer'),
					dom.h('.chat-editing-session@chatEditingSessionWidgetContainer'),
					dom.h('.interactive-input-and-side-toolbar@inputAndSideToolbar', [
						dom.h('.chat-input-container@inputContainer', [
							dom.h('.chat-context-usage-container@contextUsageWidgetContainer'),
							dom.h('.chat-editor-container@editorContainer'),
							dom.h('.chat-input-toolbars@inputToolbars'),
						]),
					]),
					dom.h('.chat-attachments-container@attachmentsContainer', [
						dom.h('.chat-attachment-toolbar@attachmentToolbar'),
						dom.h('.chat-attached-context@attachedContextContainer'),
					]),
					dom.h('.interactive-input-followups@followupsContainer'),
				])
			]);
		} else {
			elements = dom.h('.interactive-input-part', [
				dom.h('.interactive-input-followups@followupsContainer'),
				dom.h('.chat-input-widgets-container@chatInputWidgetsContainer'),
				dom.h('.chat-todo-list-widget-container@chatInputTodoListWidgetContainer'),
				dom.h('.chat-editing-session@chatEditingSessionWidgetContainer'),
				dom.h('.interactive-input-and-side-toolbar@inputAndSideToolbar', [
					dom.h('.chat-input-container@inputContainer', [
						dom.h('.chat-context-usage-container@contextUsageWidgetContainer'),
						dom.h('.chat-attachments-container@attachmentsContainer', [
							dom.h('.chat-attachment-toolbar@attachmentToolbar'),
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

		// Create a scoped context key service for option group visibility expressions
		// This isolates chatSessionOption.* context keys to this specific chat input instance
		this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.container));

		this.followupsContainer = elements.followupsContainer;
		const inputAndSideToolbar = elements.inputAndSideToolbar; // The chat input and toolbar to the right
		const inputContainer = elements.inputContainer; // The chat editor, attachments, and toolbars
		const editorContainer = elements.editorContainer;
		this.attachmentsContainer = elements.attachmentsContainer;
		this.attachedContextContainer = elements.attachedContextContainer;
		const toolbarsContainer = elements.inputToolbars;
		const attachmentToolbarContainer = elements.attachmentToolbar;
		this.chatEditingSessionWidgetContainer = elements.chatEditingSessionWidgetContainer;
		this.chatInputTodoListWidgetContainer = elements.chatInputTodoListWidgetContainer;
		this.chatInputWidgetsContainer = elements.chatInputWidgetsContainer;
		this.contextUsageWidgetContainer = elements.contextUsageWidgetContainer;

		// Context usage widget
		this.contextUsageWidget = this._register(this.instantiationService.createInstance(ChatContextUsageWidget));
		this.contextUsageWidgetContainer.appendChild(this.contextUsageWidget.domNode);

		if (this.options.enableImplicitContext && !this._implicitContext) {
			this._implicitContext = this._register(
				this.instantiationService.createInstance(ChatImplicitContexts),
			);
			this.setImplicitContextEnablement();

			this._register(this._implicitContext.onDidChangeValue(() => {
				this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
				this._handleAttachedContextChange();
			}));
		} else if (!this.options.enableImplicitContext && this._implicitContext) {
			this._implicitContext?.dispose();
			this._implicitContext = undefined;
		}

		this.tryUpdateWidgetController();

		this._register(this._attachmentModel.onDidChange((e) => {
			if (e.added.length > 0) {
				this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
			}
			this._handleAttachedContextChange();
		}));

		this.renderChatEditingSessionState(null);

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
				// Directly update editor layout - ResizeObserver will notify parent about height change
				if (this.cachedWidth) {
					this._layout(this.cachedWidth);
				}
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
				// Directly update editor layout - ResizeObserver will notify parent about height change
				if (this.cachedWidth) {
					this._layout(this.cachedWidth);
				}
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

		const { location, isMaximized } = this.getWidgetLocationInfo(widget);

		const pickerOptions: IChatInputPickerOptions = {
			getOverflowAnchor: () => this.inputActionsToolbar.getElement(),
			actionContext: { widget },
			onlyShowIconsForDefaultActions: observableFromEvent(
				this._inputEditor.onDidLayoutChange,
				(l?: EditorLayoutInfo) => (l?.width ?? this._inputEditor.getLayoutInfo().width) < 650 /* This is a magical number based on testing*/
			).recomputeInitiallyAndOnChange(this._store),
			hoverPosition: {
				forcePosition: true,
				hoverPosition: location === ChatWidgetLocation.SidebarRight && !isMaximized ? HoverPosition.LEFT : HoverPosition.RIGHT
			},
		};

		this._register(dom.addStandardDisposableListener(toolbarsContainer, dom.EventType.CLICK, e => this.inputEditor.focus()));
		this._register(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.CLICK, e => this.inputEditor.focus()));
		this.inputActionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.options.renderInputToolbarBelowInput ? this.attachmentsContainer : toolbarsContainer, MenuId.ChatInput, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: { shouldForwardArgs: true },
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			hoverDelegate,
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 40
			},
			actionViewItemProvider: (action, options) => {
				if (action.id === OpenModelPickerAction.ID && action instanceof MenuItemAction) {
					if (!this._currentLanguageModel) {
						this.setCurrentLanguageModelToDefault();
					}

					const itemDelegate: IModelPickerDelegate = {
						currentModel: this._currentLanguageModel,
						setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
							this._waitForPersistedLanguageModel.clear();
							this.setCurrentLanguageModel(model);
							this.renderAttachedContext();
						},
						getModels: () => this.getModels()
					};
					return this.modelWidget = this.instantiationService.createInstance(ModelPickerActionItem, action, undefined, itemDelegate, pickerOptions);
				} else if (action.id === OpenModePickerAction.ID && action instanceof MenuItemAction) {
					const delegate: IModePickerDelegate = {
						currentMode: this._currentModeObservable,
						sessionResource: () => this._widget?.viewModel?.sessionResource,
						customAgentTarget: () => {
							const sessionResource = this._widget?.viewModel?.model.sessionResource;
							const ctx = sessionResource && this.chatService.getChatSessionFromInternalUri(sessionResource);
							return ctx && this.chatSessionsService.getCustomAgentTargetForSessionType(ctx.chatSessionType);
						},
					};
					return this.modeWidget = this.instantiationService.createInstance(ModePickerActionItem, action, delegate, pickerOptions);
				} else if ((action.id === OpenSessionTargetPickerAction.ID || action.id === OpenDelegationPickerAction.ID) && action instanceof MenuItemAction) {
					// Use provided delegate if available, otherwise create default delegate
					const getActiveSessionType = () => {
						const sessionResource = this._widget?.viewModel?.sessionResource;
						return sessionResource ? getAgentSessionProvider(sessionResource) : undefined;
					};
					const delegate: ISessionTypePickerDelegate = this.options.sessionTypePickerDelegate ?? {
						getActiveSessionProvider: () => {
							return getActiveSessionType();
						},
						getPendingDelegationTarget: () => {
							return this._pendingDelegationTarget;
						},
						setPendingDelegationTarget: (provider: AgentSessionProviders) => {
							const isActive = getActiveSessionType() === provider;
							this._pendingDelegationTarget = isActive ? undefined : provider;
							this.updateWidgetLockStateFromSessionType(provider);
							this.updateAgentSessionTypeContextKey();
							this.refreshChatSessionPickers();
						},
					};
					const isWelcomeViewMode = !!this.options.sessionTypePickerDelegate?.setActiveSessionProvider;
					const Picker = (action.id === OpenSessionTargetPickerAction.ID || isWelcomeViewMode) ? SessionTypePickerActionItem : DelegationSessionPickerActionItem;
					return this.sessionTargetWidget = this.instantiationService.createInstance(Picker, action, location === ChatWidgetLocation.Editor ? 'editor' : 'sidebar', delegate, pickerOptions);
				} else if (action.id === OpenWorkspacePickerAction.ID && action instanceof MenuItemAction) {
					if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY && this.options.workspacePickerDelegate) {
						return this.instantiationService.createInstance(WorkspacePickerActionItem, action, this.options.workspacePickerDelegate, pickerOptions);
					} else {
						const empty = new BaseActionViewItem(undefined, action);
						if (empty.element) {
							empty.element.style.display = 'none';
						}
						return empty;
					}
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

			if (this.cachedWidth && typeof this.cachedInputToolbarWidth === 'number' && this.cachedInputToolbarWidth !== this.inputActionsToolbar.getItemsWidth()) {
				this.layout(this.cachedWidth);
			}
		}));
		this.executeToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarsContainer, this.options.menus.executeToolbar, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: {
				shouldForwardArgs: true
			},
			hoverDelegate,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));
		this.executeToolbar.getElement().classList.add('chat-execute-toolbar');
		this.executeToolbar.context = { widget } satisfies IChatExecuteActionContext;
		this._register(this.executeToolbar.onDidChangeMenuItems(() => {
			if (this.cachedWidth && typeof this.cachedExecuteToolbarWidth === 'number' && this.cachedExecuteToolbarWidth !== this.executeToolbar.getItemsWidth()) {
				this.layout(this.cachedWidth);
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
					viewItem.setShowLabel(this._attachmentModel.size === 0 && !this._implicitContextWidget.value?.hasRenderedContexts);
					this.addFilesButton = viewItem;
					return this.addFilesButton;
				}
				return undefined;
			}
		}));
		this.addFilesToolbar.context = { widget, placeholder: localize('chatAttachFiles', 'Search for files and context to add to your request') };
		this.renderAttachedContext();

		const inputResizeObserver = this._register(new dom.DisposableResizeObserver(() => {
			const newHeight = this.container.offsetHeight;
			this.height.set(newHeight, undefined);
		}));
		this._register(inputResizeObserver.observe(this.container));

		if (this.options.renderStyle === 'compact') {
			const toolbarsResizeObserver = this._register(new dom.DisposableResizeObserver(() => {
				// Have to layout the editor when the toolbars change size, when they share width with the editor.
				// This handles ensuring we layout when quick chat is shown/hidden.
				// The toolbar may have changed since the last time it was visible.
				if (this.cachedWidth) {
					this.layout(this.cachedWidth);
				}
			}));
			this._register(toolbarsResizeObserver.observe(toolbarsContainer));
		}
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
		const store = new DisposableStore();
		this.attachedContextDisposables.value = store;

		dom.clearNode(container);

		store.add(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.KEY_DOWN, (e: StandardKeyboardEvent) => {
			this.handleAttachmentNavigation(e);
		}));

		const attachments = [...this.attachmentModel.attachments.entries()];
		const hasAttachments = Boolean(attachments.length) || Boolean(this.implicitContext?.hasValue);
		dom.setVisibility(Boolean(this.options.renderInputToolbarBelowInput || hasAttachments || (this.addFilesToolbar && !this.addFilesToolbar.isEmpty())), this.attachmentsContainer);
		dom.setVisibility(hasAttachments, this.attachedContextContainer);
		if (!attachments.length) {
			this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
			this._indexOfLastOpenedContext = -1;
		}

		const isSuggestedEnabled = this.configurationService.getValue<boolean>('chat.implicitContext.suggestedContext');

		for (const [index, attachment] of attachments) {
			const resource = URI.isUri(attachment.value) ? attachment.value : isLocation(attachment.value) ? attachment.value.uri : undefined;
			const range = isLocation(attachment.value) ? attachment.value.range : undefined;
			const shouldFocusClearButton = index === Math.min(this._indexOfLastAttachedContextDeletedWithKeyboard, this.attachmentModel.size - 1) && this._indexOfLastAttachedContextDeletedWithKeyboard > -1;

			let attachmentWidget;
			const options = { shouldFocusClearButton, supportsDeletion: true };
			const lm = this._currentLanguageModel.get();
			if (attachment.kind === 'tool' || attachment.kind === 'toolset') {
				attachmentWidget = this.instantiationService.createInstance(ToolSetOrToolItemAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
			} else if (resource && isNotebookOutputVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(NotebookCellOutputChatAttachmentWidget, resource, attachment, lm, options, container, this._contextResourceLabels);
			} else if (isPromptFileVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(PromptFileAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
			} else if (isPromptTextVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(PromptTextAttachmentWidget, attachment, undefined, options, container, this._contextResourceLabels);
			} else if (resource && (attachment.kind === 'file' || attachment.kind === 'directory')) {
				attachmentWidget = this.instantiationService.createInstance(FileAttachmentWidget, resource, range, attachment, undefined, lm, options, container, this._contextResourceLabels);
			} else if (attachment.kind === 'terminalCommand') {
				attachmentWidget = this.instantiationService.createInstance(TerminalCommandAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
			} else if (isImageVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(ImageAttachmentWidget, resource, attachment, lm, options, container, this._contextResourceLabels);
			} else if (isElementVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(ElementChatAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
			} else if (isPasteVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(PasteAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
			} else if (isSCMHistoryItemVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
			} else if (isSCMHistoryItemChangeVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
			} else if (isSCMHistoryItemChangeRangeVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeRangeAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
			} else {
				attachmentWidget = this.instantiationService.createInstance(DefaultChatAttachmentWidget, resource, range, attachment, undefined, lm, options, container, this._contextResourceLabels);
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

		if (isSuggestedEnabled && this.implicitContext?.hasValue) {
			this._implicitContextWidget.value = this.instantiationService.createInstance(ImplicitContextAttachmentWidget, () => this._widget, (targetUri: URI | undefined, targetRange: IRange | undefined, targetHandle: number | undefined) => this.isAttachmentAlreadyAttached(targetUri, targetRange, targetHandle, attachments.map(([, a]) => a)), this.implicitContext, this._contextResourceLabels, this._attachmentModel, container);
		} else {
			this._implicitContextWidget.clear();
		}

		this.addFilesButton?.setShowLabel(this._attachmentModel.size === 0 && !this._implicitContextWidget.value?.hasRenderedContexts);

		this._indexOfLastOpenedContext = -1;
	}

	private isAttachmentAlreadyAttached(targetUri: URI | undefined, targetRange: IRange | undefined, targetHandle: number | undefined, attachments: IChatRequestVariableEntry[]): boolean {
		return attachments.some((attachment) => {
			let uri: URI | undefined;
			let range: IRange | undefined;
			let handle: number | undefined;

			if (URI.isUri(attachment.value)) {
				uri = attachment.value;
			} else if (isLocation(attachment.value)) {
				uri = attachment.value.uri;
				range = attachment.value.range;
			} else if (isStringVariableEntry(attachment)) {
				uri = attachment.uri;
				handle = attachment.handle;
			}

			if ((handle !== undefined && targetHandle === undefined) || (handle === undefined && targetHandle !== undefined)) {
				return false;
			}

			if (handle !== undefined && targetHandle !== undefined && handle !== targetHandle) {
				return false;
			}

			if (!uri || !isEqual(uri, targetUri)) {
				return false;
			}

			// check if the exact range is already attached
			if (targetRange) {
				return range && Range.equalsRange(range, targetRange);
			}

			return true;
		});
	}

	private handleAttachmentDeletion(e: KeyboardEvent | unknown, index: number, attachment: IChatRequestVariableEntry) {
		// Set focus to the next attached context item if deletion was triggered by a keystroke (vs a mouse click)
		if (dom.isKeyboardEvent(e)) {
			this._indexOfLastAttachedContextDeletedWithKeyboard = index;
		}

		this._attachmentModel.delete(attachment.id);


		if (this.configurationService.getValue<boolean>('chat.implicitContext.enableImplicitContext')) {
			// if currently opened file is deleted, do not show implicit context
			for (const implicitContext of (this._implicitContext?.values || [])) {
				const implicitValue = URI.isUri(implicitContext?.value) && URI.isUri(attachment.value) && isEqual(implicitContext.value, attachment.value);

				if (implicitContext?.isFile && implicitValue) {
					implicitContext.enabled = false;
				}
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
		}

		this._chatInputTodoListWidget.value.render(chatSessionResource);
	}

	clearTodoListWidget(sessionResource: URI | undefined, force: boolean): void {
		this._chatInputTodoListWidget.value?.clear(sessionResource, force);
	}

	setWorkingSetCollapsed(collapsed: boolean): void {
		this._workingSetCollapsed.set(collapsed, undefined);
	}

	renderChatEditingSessionState(chatEditingSession: IChatEditingSession | null) {
		dom.setVisibility(Boolean(chatEditingSession), this.chatEditingSessionWidgetContainer);

		if (chatEditingSession) {
			if (!isEqual(chatEditingSession.chatSessionResource, this._lastEditingSessionResource)) {
				this._workingSetCollapsed.set(true, undefined);
			}
			this._lastEditingSessionResource = chatEditingSession.chatSessionResource;
		}

		const modifiedEntries = derivedOpts<IModifiedFileEntry[]>({ equalsFn: arraysEqual }, r => {
			// Background chat sessions render the working set based on the session files, and not the editing session
			const sessionResource = chatEditingSession?.chatSessionResource ?? this._widget?.viewModel?.model.sessionResource;
			if (sessionResource && getChatSessionType(sessionResource) === AgentSessionProviders.Background) {
				return [];
			}

			return chatEditingSession?.entries.read(r).filter(entry => entry.state.read(r) === ModifiedFileEntryState.Modified) || [];
		});

		const editSessionEntries = derived((reader): IChatCollapsibleListItem[] => {
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
							diffMeta: { added: linesAdded ?? 0, removed: linesRemoved ?? 0 },
							isDeletion: !!entry.isDeletion,
							originalUri: entry.isDeletion ? entry.originalURI : undefined,
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

		const sessionFileChanges = observableFromEvent(
			this,
			this.agentSessionsService.model.onDidChangeSessions,
			() => {
				const sessionResource = this._widget?.viewModel?.model?.sessionResource;
				if (!sessionResource) {
					return Iterable.empty();
				}
				const model = this.agentSessionsService.getSession(sessionResource);
				return model?.changes instanceof Array ? model.changes : Iterable.empty();
			},
		);

		const sessionFiles = derived(reader =>
			sessionFileChanges.read(reader).map((entry): IChatCollapsibleListItem => ({
				reference: isIChatSessionFileChange2(entry)
					? entry.modifiedUri ?? entry.uri
					: entry.modifiedUri,
				state: ModifiedFileEntryState.Accepted,
				kind: 'reference',
				options: {
					diffMeta: { added: entry.insertions, removed: entry.deletions },
					isDeletion: entry.modifiedUri === undefined,
					originalUri: entry.originalUri,
					status: undefined
				}
			}))
		);

		const shouldRender = derived(reader =>
			editSessionEntries.read(reader).length > 0 || sessionFiles.read(reader).length > 0);

		this._renderingChatEdits.value = autorun(reader => {
			if (this.options.renderWorkingSet && shouldRender.read(reader)) {
				this.renderChatEditingSessionWithEntries(
					reader.store,
					chatEditingSession,
					editSessionEntries,
					sessionFiles
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
		chatEditingSession: IChatEditingSession | null,
		editSessionEntriesObs: IObservable<readonly IChatCollapsibleListItem[]>,
		sessionEntriesObs: IObservable<readonly IChatCollapsibleListItem[]>
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

		const sessionResource = chatEditingSession?.chatSessionResource || this._widget?.viewModel?.model.sessionResource;

		const scopedContextKeyService = this._chatEditsActionsDisposables.add(this.contextKeyService.createScoped(actionsContainer));
		if (sessionResource) {
			scopedContextKeyService.createKey(ChatContextKeys.agentSessionType.key, getChatSessionType(sessionResource));
		}

		this._chatEditsActionsDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, scopedContextKeyService, r => !!sessionEntriesObs.read(r)?.length));

		const scopedInstantiationService = this._chatEditsActionsDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));

		// Working set
		// eslint-disable-next-line no-restricted-syntax
		const workingSetContainer = innerContainer.querySelector('.chat-editing-session-list') as HTMLElement ?? dom.append(innerContainer, $('.chat-editing-session-list'));

		const button = this._chatEditsActionsDisposables.add(new ButtonWithIcon(overviewTitle, {
			supportIcons: true,
			secondary: true,
			ariaLabel: localize('chatEditingSession.toggleWorkingSet', 'Toggle changed files.'),
		}));

		const topLevelStats = derived(reader => {
			const entries = editSessionEntriesObs.read(reader);
			const sessionEntries = sessionEntriesObs.read(reader);

			let added = 0, removed = 0;

			if (entries.length > 0) {
				for (const entry of entries) {
					if (entry.kind === 'reference' && entry.options?.diffMeta) {
						added += entry.options.diffMeta.added;
						removed += entry.options.diffMeta.removed;
					}
				}
			} else {
				for (const entry of sessionEntries) {
					if (entry.kind === 'reference' && entry.options?.diffMeta) {
						added += entry.options.diffMeta.added;
						removed += entry.options.diffMeta.removed;
					}
				}
			}

			const files = entries.length > 0 ? entries.length : sessionEntries.length;
			const topLevelIsSessionMenu = entries.length === 0 && sessionEntries.length > 0;
			const shouldShowEditingSession = entries.length > 0 || sessionEntries.length > 0;

			return { files, added, removed, shouldShowEditingSession, topLevelIsSessionMenu };
		});

		const topLevelIsSessionMenu = topLevelStats.map(t => t.topLevelIsSessionMenu);

		store.add(autorun(reader => {
			const isSessionMenu = topLevelIsSessionMenu.read(reader);
			reader.store.add(scopedInstantiationService.createInstance(MenuWorkbenchButtonBar, actionsContainer, isSessionMenu ? MenuId.ChatEditingSessionChangesToolbar : MenuId.ChatEditingWidgetToolbar, {
				telemetrySource: this.options.menus.telemetrySource,
				small: true,
				menuOptions: sessionResource ? (isSessionMenu ? {
					args: [sessionResource, this.agentSessionsService.getSession(sessionResource)?.metadata],
				} : {
					arg: {
						$mid: MarshalledId.ChatViewContext,
						sessionResource,
					} satisfies IChatViewTitleActionContext,
				}) : undefined,
				disableWhileRunning: isSessionMenu,
				buttonConfigProvider: (action) => {
					if (action.id === ChatEditingShowChangesAction.ID || action.id === ViewPreviousEditsAction.Id || action.id === ViewAllSessionChangesAction.ID) {
						return { showIcon: true, showLabel: false, isSecondary: true };
					}
					return undefined;
				}
			}));
		}));

		store.add(autorun(reader => {
			const { files, added, removed, shouldShowEditingSession } = topLevelStats.read(reader);

			const buttonLabel = files === 1
				? localize('chatEditingSession.oneFile', '1 file changed')
				: localize('chatEditingSession.manyFiles', '{0} files changed', files);

			button.label = buttonLabel;
			button.element.setAttribute('aria-label', localize('chatEditingSession.ariaLabelWithCounts', '{0}, {1} lines added, {2} lines removed', buttonLabel, added, removed));

			this._workingSetLinesAddedSpan.value.textContent = `+${added}`;
			this._workingSetLinesRemovedSpan.value.textContent = `-${removed}`;

			dom.setVisibility(shouldShowEditingSession, this.chatEditingSessionWidgetContainer);
		}));

		const countsContainer = dom.$('.working-set-line-counts');
		button.element.appendChild(countsContainer);
		countsContainer.appendChild(this._workingSetLinesAddedSpan.value);
		countsContainer.appendChild(this._workingSetLinesRemovedSpan.value);

		const toggleWorkingSet = () => {
			this._workingSetCollapsed.set(!this._workingSetCollapsed.get(), undefined);
		};

		this._chatEditsActionsDisposables.add(button.onDidClick(toggleWorkingSet));
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

		this._chatEditsActionsDisposables.add(autorun(reader => {
			const collapsed = this._workingSetCollapsed.read(reader);
			button.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
			workingSetContainer.classList.toggle('collapsed', collapsed);
		}));

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
					const originalUri = e.element.options?.originalUri;

					if (e.element.options?.isDeletion && originalUri) {
						await this.editorService.openEditor({
							resource: originalUri, // instead of modified, because modified will not exist
							options: e.editorOptions
						}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
						return;
					}

					// If there's a originalUri, open as diff editor
					if (originalUri) {
						await this.editorService.openEditor({
							original: { resource: originalUri },
							modified: { resource: modifiedFileUri },
							options: e.editorOptions
						}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
						return;
					}

					const entry = chatEditingSession?.getEntry(modifiedFileUri);

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
			const editEntries = editSessionEntriesObs.read(reader);
			const sessionFileEntries = sessionEntriesObs.read(reader);

			// Combine edit session entries with session file changes. At the moment, we
			// we can combine these two arrays since local chat sessions use edit session
			// entries, while background chat sessions use session file changes.
			const allEntries = editEntries.concat(sessionFileEntries);

			const maxItemsShown = 6;
			const itemsShown = Math.min(allEntries.length, maxItemsShown);
			const height = itemsShown * 22;
			const list = this._chatEditList!.object;
			list.layout(height);
			list.getHTMLElement().style.height = `${height}px`;
			list.splice(0, list.length, allEntries);
		}));
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
	}

	/**
	 * Layout the input part with the given width. Height is intrinsic - determined by content
	 * and detected via ResizeObserver, which updates `inputPartHeight` for the parent to observe.
	 */
	layout(width: number) {
		this.cachedWidth = width;

		return this._layout(width);
	}

	private previousInputEditorDimension: IDimension | undefined;
	private _layout(width: number, allowRecurse = true): void {
		const data = this.getLayoutData();

		const followupsWidth = width - data.inputPartHorizontalPadding;
		this.followupsContainer.style.width = `${followupsWidth}px`;

		const initialEditorScrollWidth = this._inputEditor.getScrollWidth();
		const newEditorWidth = width - data.inputPartHorizontalPadding - data.editorBorder - data.inputPartHorizontalPaddingInside - data.toolbarsWidth - data.sideToolbarWidth;
		const inputEditorHeight = Math.min(this._inputEditor.getContentHeight(), this.inputEditorMaxHeight);
		const newDimension = { width: newEditorWidth, height: inputEditorHeight };
		if (!this.previousInputEditorDimension || (this.previousInputEditorDimension.width !== newDimension.width || this.previousInputEditorDimension.height !== newDimension.height)) {
			// This layout call has side-effects that are hard to understand. eg if we are calling this inside a onDidChangeContent handler, this can trigger the next onDidChangeContent handler
			// to be invoked, and we have a lot of these on this editor. Only doing a layout this when the editor size has actually changed makes it much easier to follow.
			this._inputEditor.layout(newDimension);
			this.previousInputEditorDimension = newDimension;
		}

		if (allowRecurse && initialEditorScrollWidth < 10) {
			// This is probably the initial layout. Now that the editor is layed out with its correct width, it should report the correct contentHeight
			return this._layout(width, false);
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

		const inputSideToolbarWidth = this.inputSideToolbarContainer ? dom.getTotalWidth(this.inputSideToolbarContainer) : 0;

		const getToolbarsWidthCompact = () => {
			const executeToolbarWidth = this.cachedExecuteToolbarWidth = this.executeToolbar.getItemsWidth();
			const inputToolbarWidth = this.cachedInputToolbarWidth = this.inputActionsToolbar.getItemsWidth();
			const executeToolbarPadding = (this.executeToolbar.getItemsLength() - 1) * 4;
			const inputToolbarPadding = this.inputActionsToolbar.getItemsLength() ? (this.inputActionsToolbar.getItemsLength() - 1) * 4 : 0;
			return executeToolbarWidth + executeToolbarPadding + (this.options.renderInputToolbarBelowInput ? 0 : inputToolbarWidth + inputToolbarPadding);
		};

		return {
			editorBorder: 2,
			inputPartHorizontalPadding: this.options.renderStyle === 'compact' ? 16 : 32,
			inputPartHorizontalPaddingInside: 12,
			toolbarsWidth: this.options.renderStyle === 'compact' ? getToolbarsWidthCompact() : 0,
			sideToolbarWidth: inputSideToolbarWidth > 0 ? inputSideToolbarWidth + 4 /*gap*/ : 0,
		};
	}

	/**
	 * Gets the location of the chat widget and whether that location is maximized.
	 */
	private getWidgetLocationInfo(widget: IChatWidget): IChatWidgetLocationInfo {
		// Editor context (quick chat, inline chat, etc.)
		if (isIChatResourceViewContext(widget.viewContext)) {
			return { location: ChatWidgetLocation.Editor, isMaximized: false };
		}

		// View context - determine actual location from view descriptor service
		if (isIChatViewViewContext(widget.viewContext)) {
			const viewLocation = this.viewDescriptorService.getViewLocationById(widget.viewContext.viewId);
			const sideBarPosition = this.layoutService.getSideBarPosition();

			switch (viewLocation) {
				case ViewContainerLocation.Panel:
					return {
						location: ChatWidgetLocation.Panel,
						isMaximized: this.layoutService.isPanelMaximized(),
					};
				case ViewContainerLocation.AuxiliaryBar:
					// AuxiliaryBar is on the opposite side of the primary sidebar
					return {
						location: sideBarPosition === Position.LEFT ? ChatWidgetLocation.SidebarRight : ChatWidgetLocation.SidebarLeft,
						isMaximized: this.layoutService.isAuxiliaryBarMaximized(),
					};
				case ViewContainerLocation.Sidebar:
				default:
					// Primary sidebar follows its configured position
					// Note: Primary sidebar cannot be maximized, so always false
					return {
						location: sideBarPosition === Position.LEFT ? ChatWidgetLocation.SidebarLeft : ChatWidgetLocation.SidebarRight,
						isMaximized: false,
					};
			}
		}

		// Fallback for unknown contexts
		return { location: ChatWidgetLocation.Editor, isMaximized: false };
	}
}


function getLastPosition(model: ITextModel): IPosition {
	return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}

const chatInputEditorContainerSelector = '.interactive-input-editor';
setupSimpleEditorSelectionStyling(chatInputEditorContainerSelector);

type ChatSessionPickerWidget = ChatSessionPickerActionItem | SearchableOptionPickerActionItem;

class ChatSessionPickersContainerActionItem extends ActionViewItem {
	constructor(
		action: IAction,
		private readonly widgets: ChatSessionPickerWidget[],
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
