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
import { IAction } from '../../../../../../base/common/actions.js';
import { equals as arraysEqual } from '../../../../../../base/common/arrays.js';
import { DeferredPromise, RunOnceScheduler } from '../../../../../../base/common/async.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { mixin } from '../../../../../../base/common/objects.js';
import { autorun, derived, derivedOpts, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOptions, IEditorOptions, IEditorScrollbarOptions } from '../../../../../../editor/common/config/editorOptions.js';
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
import { ISCMService } from '../../../../scm/common/scm.js';
import { IWorkbenchLayoutService, Position } from '../../../../../services/layout/browser/layoutService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../../accessibility/common/accessibilityCommands.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../../../../codeEditor/browser/simpleEditorOptions.js';
import { IChatViewTitleActionContext } from '../../../common/actions/chatActions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatRequestVariableSet, getImageAttachmentLimit, IChatRequestVariableEntry, isBrowserViewVariableEntry, isElementVariableEntry, isImageVariableEntry, isNotebookOutputVariableEntry, isPasteVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isSCMHistoryItemChangeRangeVariableEntry, isSCMHistoryItemChangeVariableEntry, isSCMHistoryItemVariableEntry, isStringVariableEntry, OmittedState } from '../../../common/attachments/chatVariableEntries.js';
import { ChatMode, getModeNameForTelemetry, IChatMode, IChatModeService } from '../../../common/chatModes.js';
import { IChatFollowup, IChatPlanReview, IChatQuestionCarousel, IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, IChatSessionsService, isIChatSessionFileChange2, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from '../../../common/constants.js';
import { IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatModelInputState, IChatRequestModeInfo, IInputModel } from '../../../common/model/chatModel.js';
import { filterModelsForSession, findDefaultModel, hasModelsTargetingSession, isModelValidForSession, mergeModelsWithCache, resolveModelFromSyncState, shouldResetModelToDefault, shouldResetOnModelListChange, shouldRestoreLateArrivingModel, shouldRestorePersistedModel } from './chatModelSelectionLogic.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { IChatResponseViewModel, isResponseVM } from '../../../common/model/chatViewModel.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { ChatHistoryNavigator } from '../../../common/widget/chatWidgetHistoryService.js';
import { ChatSessionPrimaryPickerAction, ChatSubmitAction, IChatExecuteActionContext, OpenDelegationPickerAction, OpenModelPickerAction, OpenModePickerAction, OpenPermissionPickerAction, OpenSessionTargetPickerAction, OpenWorkspacePickerAction } from '../../actions/chatExecuteActions.js';
import { AgentSessionProviders, getAgentSessionProvider } from '../../agentSessions/agentSessions.js';
import { IAgentSessionsService } from '../../agentSessions/agentSessionsService.js';
import { ChatAttachmentModel } from '../../attachments/chatAttachmentModel.js';
import { IChatAttachmentWidgetRegistry } from '../../attachments/chatAttachmentWidgetRegistry.js';
import { DefaultChatAttachmentWidget, ElementChatAttachmentWidget, FileAttachmentWidget, ImageAttachmentWidget, BrowserViewAttachmentWidget, NotebookCellOutputChatAttachmentWidget, PasteAttachmentWidget, PromptFileAttachmentWidget, PromptTextAttachmentWidget, SCMHistoryItemAttachmentWidget, SCMHistoryItemChangeAttachmentWidget, SCMHistoryItemChangeRangeAttachmentWidget, TerminalCommandAttachmentWidget, ToolSetOrToolItemAttachmentWidget } from '../../attachments/chatAttachmentWidgets.js';
import { ChatImplicitContexts } from '../../attachments/chatImplicitContext.js';
import { ImplicitContextAttachmentWidget } from '../../attachments/implicitContextAttachment.js';
import { IChatWidget, IChatWidgetViewModelChangeEvent, ISessionTypePickerDelegate, isIChatResourceViewContext, isIChatViewViewContext, IWorkspacePickerDelegate } from '../../chat.js';
import { ChatEditingShowChangesAction, ViewPreviousEditsAction } from '../../chatEditing/chatEditingActions.js';
import { resizeImage } from '../../chatImageUtils.js';
import { ChatSessionPickerActionItem, IChatSessionPickerDelegate } from '../../chatSessions/chatSessionPickerActionItem.js';
import { IChatContextService } from '../../contextContrib/chatContextService.js';
import { IDisposableReference } from '../chatContentParts/chatCollections.js';
import { ChatPlanReviewPart, IChatPlanReviewPartOptions } from '../chatContentParts/chatPlanReviewPart.js';
import { ChatQuestionCarouselPart, IChatQuestionCarouselOptions } from '../chatContentParts/chatQuestionCarouselPart.js';
import { ChatToolConfirmationCarouselPart, ToolInvocationPartFactory, ScrollToSubagentCallback } from '../chatContentParts/toolInvocationParts/chatToolConfirmationCarouselPart.js';
import { ChatToolInvocationPart } from '../chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { IChatContentPartRenderContext } from '../chatContentParts/chatContentParts.js';
import { CollapsibleListPool, IChatCollapsibleListItem } from '../chatContentParts/chatReferencesContentPart.js';
import { ChatTodoListWidget } from '../chatContentParts/chatTodoListWidget.js';
import { ChatArtifactsWidget } from '../chatArtifactsWidget.js';
import { ChatDragAndDrop } from '../chatDragAndDrop.js';
import { ChatFollowups } from './chatFollowups.js';
import { IChatInputNotificationService } from './chatInputNotificationService.js';
import { ChatInputNotificationWidget } from './chatInputNotificationWidget.js';
import { IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { ChatSelectedTools } from './chatSelectedTools.js';
import { DelegationSessionPickerActionItem } from './delegationSessionPickerActionItem.js';
import { ModelPickerActionItem, IModelPickerDelegate } from './modelPickerActionItem.js';
import { IModePickerDelegate, ModePickerActionItem } from './modePickerActionItem.js';
import { IPermissionPickerDelegate, PermissionPickerActionItem } from './permissionPickerActionItem.js';
import { SessionTypePickerActionItem } from './sessionTargetPickerActionItem.js';
import { WorkspacePickerActionItem } from './workspacePickerActionItem.js';
import { ChatContextUsageWidget } from '../../widgetHosts/viewPane/chatContextUsageWidget.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';
import { findLast } from '../../../../../../base/common/arraysFind.js';
import { ConfigureToolsAction } from '../../actions/chatToolActions.js';

const $ = dom.$;

const INPUT_EDITOR_MAX_HEIGHT = 250;
const INPUT_EDITOR_LINE_HEIGHT = 20;
const INPUT_EDITOR_PADDING = { compact: { top: 2, bottom: 2 }, default: { top: 12, bottom: 12 } };
const CachedLanguageModelsKey = 'chat.cachedLanguageModels.v2';
const CHAT_INPUT_PICKER_COLLAPSE_WIDTH = 480;
const PERMISSION_LEVEL_OPTION_ID = 'permissionLevel';

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
	inputEditorMinLines?: number;
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
	/**
	 * Whether we are running in the sessions window.
	 * When true, the secondary toolbar (permissions picker) is hidden.
	 */
	isSessionsWindow?: boolean;
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
	private _stableInputPartWidth = observableValue('chatInputPart.stableInputPartWidth', 0);
	private readonly _chatInputTodoListWidget = this._register(new MutableDisposable<ChatTodoListWidget>());
	private readonly _chatArtifactsWidget = this._register(new MutableDisposable<ChatArtifactsWidget>());
	private readonly _chatQuestionCarouselWidgets = this._register(new DisposableMap<string, ChatQuestionCarouselPart>());
	private readonly _questionCarouselResponseIds = new Map<string, string>();
	private readonly _questionCarouselSessionResources = new Map<string, URI>();
	private _hasQuestionCarouselContextKey: IContextKey<boolean> | undefined;
	private readonly _chatPlanReviewWidgets = this._register(new DisposableMap<string, ChatPlanReviewPart>());
	private readonly _planReviewResponseIds = new Map<string, string>();
	private readonly _planReviewSessionResources = new Map<string, URI>();
	private readonly _chatToolConfirmationCarousels = this._register(new DisposableMap<string, ChatToolConfirmationCarouselPart>());
	private readonly _chatEditingTodosDisposables = this._register(new DisposableStore());
	private _lastEditingSessionResource: URI | undefined;

	private _onDidLoadInputState: Emitter<void> = this._register(new Emitter());
	readonly onDidLoadInputState: Event<void> = this._onDidLoadInputState.event;
	private readonly _toolbarRelayoutScheduler = this._register(new RunOnceScheduler(() => {
		if (typeof this.cachedWidth === 'number') {
			this.layout(this.cachedWidth);
		}
	}, 0));

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

	public getAttachedContext() {
		const contextArr = new ChatRequestVariableSet();
		contextArr.add(...this.attachmentModel.attachments, ...this.chatContextService.getWorkspaceContextItems());
		return contextArr;
	}

	public getAttachedAndImplicitContext(): ChatRequestVariableSet {

		const contextArr = this.getAttachedContext();

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
	private readonly inputEditorMinHeight: number | undefined;
	private inputEditorHeight: number = 0;
	private _maxHeight: number | undefined;
	private container!: HTMLElement;

	private inputSideToolbarContainer?: HTMLElement;
	private secondaryToolbarContainer!: HTMLElement;
	private secondaryToolbar!: MenuWorkbenchToolBar;

	private followupsContainer!: HTMLElement;
	private readonly followupsDisposables: DisposableStore = this._register(new DisposableStore());

	private attachmentsContainer!: HTMLElement;

	private chatInputOverlay!: HTMLElement;
	private readonly overlayClickListener: MutableDisposable<IDisposable> = this._register(new MutableDisposable<IDisposable>());

	private attachedContextContainer!: HTMLElement;
	private readonly attachedContextDisposables: MutableDisposable<DisposableStore> = this._register(new MutableDisposable<DisposableStore>());

	private chatEditingSessionWidgetContainer!: HTMLElement;
	private chatInputTodoListWidgetContainer!: HTMLElement;
	private chatArtifactsWidgetContainer!: HTMLElement;
	private chatGettingStartedTipContainer!: HTMLElement;
	private chatQuestionCarouselContainer!: HTMLElement;
	private chatPlanReviewContainer!: HTMLElement;
	private chatToolConfirmationCarouselContainer!: HTMLElement;
	private chatInputNotificationContainer!: HTMLElement;
	private inputContainer!: HTMLElement;
	private readonly _notificationWidget = this._register(new MutableDisposable<ChatInputNotificationWidget>());

	private contextUsageWidget?: ChatContextUsageWidget;
	private contextUsageWidgetContainer!: HTMLElement;
	private readonly _contextUsageDisposables = this._register(new MutableDisposable<DisposableStore>());

	get inputContainerElement(): HTMLElement | undefined {
		return this.inputContainer;
	}

	get gettingStartedTipContainerElement(): HTMLElement {
		return this.chatGettingStartedTipContainer;
	}

	readonly height = observableValue<number>(this, 0);

	private _inputEditor!: CodeEditorWidget;
	private _inputEditorElement!: HTMLElement;
	private _forceVisibleScrollbarUntilAccept = false;

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
	private editingSentRequestKey!: IContextKey<ChatContextKeys.EditingRequestType | undefined>;
	private chatModeKindKey: IContextKey<ChatModeKind>;
	private chatModeNameKey: IContextKey<string>;
	private chatModelIdKey: IContextKey<string>;
	private withinEditSessionKey: IContextKey<boolean>;
	private filePartOfEditSessionKey: IContextKey<boolean>;
	private chatSessionHasOptions: IContextKey<boolean>;
	private chatSessionOptionsValid: IContextKey<boolean>;
	private agentSessionTypeKey: IContextKey<string>;
	private chatSessionSupportsDelegationKey: IContextKey<boolean>;
	private chatSessionHasCustomAgentTarget: IContextKey<boolean>;
	private chatSessionHasTargetedModels: IContextKey<boolean>;
	private modelWidget: ModelPickerActionItem | undefined;
	private modeWidget: ModePickerActionItem | undefined;
	private permissionWidget: PermissionPickerActionItem | undefined;
	private sessionTargetWidget: SessionTypePickerActionItem | undefined;
	private delegationWidget: DelegationSessionPickerActionItem | undefined;
	private readonly chatSessionPickerWidgets = this._register(new DisposableMap<string, ChatSessionPickerActionItem>());
	private chatSessionPickerContainer: HTMLElement | undefined;
	private _lastSessionPickerAction: MenuItemAction | undefined;
	private _lastSessionPickerOptions: IChatInputPickerOptions | undefined;
	private readonly _waitForPersistedLanguageModel: MutableDisposable<IDisposable> = this._register(new MutableDisposable<IDisposable>());
	private readonly _chatSessionOptionEmitters = this._register(new DisposableMap<string, Emitter<IChatSessionProviderOptionItem>>());

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
	private readonly _currentPermissionLevel: ISettableObservable<ChatPermissionLevel>;
	private permissionLevelKey: IContextKey<ChatPermissionLevel>;

	public get currentModeKind(): ChatModeKind {
		const mode = this._currentModeObservable.get();
		return mode.kind === ChatModeKind.Agent && !this.agentService.hasToolsAgent ?
			ChatModeKind.Edit :
			mode.kind;
	}

	public get currentModeObs(): IObservable<IChatMode> {
		return this._currentModeObservable;
	}

	public get currentPermissionLevelObs(): IObservable<ChatPermissionLevel> {
		return this._currentPermissionLevel;
	}

	public get currentModeInfo(): IChatRequestModeInfo {
		const mode = this._currentModeObservable.get();
		const modeId: 'ask' | 'agent' | 'edit' | 'custom' | undefined = mode.isBuiltin ? this.currentModeKind : 'custom';

		const modeInstructions = mode.modeInstructions?.get();
		return {
			kind: this.currentModeKind,
			isBuiltin: mode.isBuiltin,
			modeInstructions: modeInstructions ? {
				uri: mode.uri?.get(),
				name: mode.name.get(),
				content: modeInstructions.content,
				toolReferences: this.toolService.toToolReferences(modeInstructions.toolReferences),
				metadata: modeInstructions.metadata,
				isBuiltin: mode.isBuiltin
			} : undefined,
			modeId: modeId,
			modeName: getModeNameForTelemetry(mode),
			applyCodeBlockSuggestionId: undefined,
			permissionLevel: this._currentPermissionLevel.get(),
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
	private _currentSessionType: string | undefined = undefined;

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
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@ILanguageModelToolsService private readonly toolService: ILanguageModelToolsService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatContextService private readonly chatContextService: IChatContextService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISCMService private readonly scmService: ISCMService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IChatAttachmentWidgetRegistry private readonly _chatAttachmentWidgetRegistry: IChatAttachmentWidgetRegistry,
		@IChatInputNotificationService private readonly chatInputNotificationService: IChatInputNotificationService,
	) {
		super();

		// Initialize debounced text sync scheduler
		this._syncTextDebounced = this._register(new RunOnceScheduler(() => this._syncInputStateToModel(), 150));
		this._emptyInputState = this._register(emptyInputState(StorageScope.WORKSPACE, StorageTarget.USER, this.storageService));

		this._contextResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event }));
		this._currentModeObservable = observableValue<IChatMode>('currentMode', this.options.defaultMode ?? ChatMode.Agent);
		this._currentPermissionLevel = observableValue<ChatPermissionLevel>('permissionLevel', this.getDefaultPermissionLevel());
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this._indexOfLastOpenedContext = -1;
			this.refreshChatSessionPickers();
		}));

		// React to chat session option changes for the active session
		this._register(this.chatSessionsService.onDidChangeSessionOptions(e => {
			const sessionResource = this._widget?.viewModel?.model.sessionResource;
			if (sessionResource && isEqual(sessionResource, e.sessionResource)) {
				// Options changed for our current session - refresh pickers
				this.refreshChatSessionPickers();
			}
		}));

		this._register(this.chatSessionsService.onDidChangeOptionGroups(chatSessionType => {
			const sessionResource = this._widget?.viewModel?.model.sessionResource;
			if (sessionResource) {
				const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
				if (getChatSessionType(sessionResource) === chatSessionType || delegateSessionType === chatSessionType) {
					this.refreshChatSessionPickers();
				}
			}
		}));

		// Listen for session type changes from the welcome page delegate
		if (this.options.sessionTypePickerDelegate?.onDidChangeActiveSessionProvider) {
			this._register(this.options.sessionTypePickerDelegate.onDidChangeActiveSessionProvider(async (newSessionType) => {
				this.getVisibleOptionGroupsModeAndUpdateContextKeys(this.getCurrentSessionResource());
				this.agentSessionTypeKey.set(newSessionType);
				this.chatSessionSupportsDelegationKey.set(this.chatSessionsService.supportsDelegationForSessionType(newSessionType));
				this.updateWidgetLockStateFromSessionType(newSessionType);
				this.checkModeInSessionPool(newSessionType);
				this.refreshChatSessionPickers();
			}));
		}

		this._attachmentModel = this._register(this.instantiationService.createInstance(ChatAttachmentModel));
		this._register(this._attachmentModel.onDidChange(() => this._syncInputStateToModel()));
		this.selectedToolsModel = this._register(this.instantiationService.createInstance(ChatSelectedTools, this.currentModeObs, this._currentLanguageModel));
		this.dnd = this._register(this.instantiationService.createInstance(ChatDragAndDrop, () => this._widget, this._attachmentModel, styles));

		this.inputEditorMaxHeight = this.options.renderStyle === 'compact' ? INPUT_EDITOR_MAX_HEIGHT / 3 : INPUT_EDITOR_MAX_HEIGHT;
		const padding = this.options.renderStyle === 'compact' ? INPUT_EDITOR_PADDING.compact : INPUT_EDITOR_PADDING.default;
		this.inputEditorMinHeight = this.options.inputEditorMinLines ? this.options.inputEditorMinLines * INPUT_EDITOR_LINE_HEIGHT + padding.top + padding.bottom : undefined;

		this.inputEditorHasText = ChatContextKeys.inputHasText.bindTo(contextKeyService);
		this.chatCursorAtTop = ChatContextKeys.inputCursorAtTop.bindTo(contextKeyService);
		this.inputEditorHasFocus = ChatContextKeys.inputHasFocus.bindTo(contextKeyService);
		this._hasQuestionCarouselContextKey = ChatContextKeys.Editing.hasQuestionCarousel.bindTo(contextKeyService);
		this.chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(contextKeyService);
		this.chatModeNameKey = ChatContextKeys.chatModeName.bindTo(contextKeyService);
		this.chatModelIdKey = ChatContextKeys.chatModelId.bindTo(contextKeyService);
		this.permissionLevelKey = ChatContextKeys.chatPermissionLevel.bindTo(contextKeyService);
		this.permissionLevelKey.set(this._currentPermissionLevel.get());
		this.withinEditSessionKey = ChatContextKeys.withinEditSessionDiff.bindTo(contextKeyService);
		this.filePartOfEditSessionKey = ChatContextKeys.filePartOfEditSession.bindTo(contextKeyService);
		this.chatSessionHasOptions = ChatContextKeys.chatSessionHasModels.bindTo(contextKeyService);
		this.chatSessionOptionsValid = ChatContextKeys.chatSessionOptionsValid.bindTo(contextKeyService);
		this.agentSessionTypeKey = ChatContextKeys.agentSessionType.bindTo(contextKeyService);
		this.chatSessionSupportsDelegationKey = ChatContextKeys.chatSessionSupportsDelegation.bindTo(contextKeyService);

		// Initialize agentSessionType from delegate if available
		if (this.options.sessionTypePickerDelegate?.getActiveSessionProvider) {
			const initialSessionType = this.options.sessionTypePickerDelegate.getActiveSessionProvider();
			if (initialSessionType) {
				this.agentSessionTypeKey.set(initialSessionType);
				this.chatSessionSupportsDelegationKey.set(this.chatSessionsService.supportsDelegationForSessionType(initialSessionType));
			}
		}
		this.chatSessionHasCustomAgentTarget = ChatContextKeys.chatSessionHasCustomAgentTarget.bindTo(contextKeyService);
		this.chatSessionHasTargetedModels = ChatContextKeys.chatSessionHasTargetedModels.bindTo(contextKeyService);

		this.history = this._register(this.instantiationService.createInstance(ChatHistoryNavigator, this.location));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			const newOptions: IEditorOptions = {};
			if (e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
				this.setPermissionLevel(this._currentPermissionLevel.get());
			}
			if (e.affectsConfiguration(ChatConfiguration.DefaultPermissionLevel)) {
				if (this._chatSessionIsEmpty) {
					this.setPermissionLevel(this.getDefaultPermissionLevel());
				}
			}
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

		this._register(this.languageModelsService.onDidChangeLanguageModels(() => {
			if (shouldResetOnModelListChange(this._currentLanguageModel.get()?.identifier, this.getModels())) {
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
			this.chatModelIdKey.set(lm?.metadata.id.toLowerCase() ?? '');
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

		// Validate the initial mode - if Agent mode is set by default but disabled by policy, switch to Ask
		this.validateCurrentChatMode();
	}

	private setImplicitContextEnablement() {
		if (this.implicitContext && this.configurationService.getValue<boolean>('chat.implicitContext.suggestedContext')) {
			this.implicitContext.setEnabled(this._currentModeObservable.get().name.get().toLowerCase() === 'ask');
		}
	}

	public setIsWithinEditSession(inInsideDiff: boolean, isFilePartOfEditSession: boolean) {
		this.withinEditSessionKey.set(inInsideDiff);
		this.filePartOfEditSessionKey.set(isFilePartOfEditSession);
	}

	private getSelectedModelStorageKey(): string {
		const sessionType = this._currentSessionType;
		if (sessionType && this.hasModelsTargetingSessionType()) {
			return `chat.currentLanguageModel.${this.location}.${sessionType}`;
		}
		return `chat.currentLanguageModel.${this.location}`;
	}

	private getSelectedModelIsDefaultStorageKey(): string {
		const sessionType = this._currentSessionType;
		if (sessionType && this.hasModelsTargetingSessionType()) {
			return `chat.currentLanguageModel.${this.location}.${sessionType}.isDefault`;
		}
		return `chat.currentLanguageModel.${this.location}.isDefault`;
	}

	private initSelectedModel() {
		const persistedSelection = this.storageService.get(this.getSelectedModelStorageKey(), StorageScope.APPLICATION);
		const persistedAsDefault = this.storageService.getBoolean(this.getSelectedModelIsDefaultStorageKey(), StorageScope.APPLICATION, true);

		if (persistedSelection) {
			const result = shouldRestorePersistedModel(persistedSelection, persistedAsDefault, this.getModels(), this.location);
			if (result.shouldRestore && result.model) {
				this.setCurrentLanguageModel(result.model);
				this.checkModelSupported();
			} else if (!result.model) {
				this._waitForPersistedLanguageModel.value = this.languageModelsService.onDidChangeLanguageModels(e => {
					const persistedModel = this.languageModelsService.lookupLanguageModel(persistedSelection);
					if (persistedModel) {
						this._waitForPersistedLanguageModel.clear();

						const lateModel = { metadata: persistedModel, identifier: persistedSelection };
						if (shouldRestoreLateArrivingModel(persistedSelection, persistedAsDefault, lateModel, this.location)) {
							this.setCurrentLanguageModel(lateModel);
							this.checkModelSupported();
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
	}

	public setEditing(enabled: boolean, editingSentRequest: ChatContextKeys.EditingRequestType | undefined) {
		this.currentlyEditingInputKey?.set(enabled);
		this.editingSentRequestKey?.set(editingSentRequest);
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

	public openPermissionPicker(): void {
		this.permissionWidget?.show();
	}

	public setPermissionLevel(level: ChatPermissionLevel): void {
		level = this.getPermittedPermissionLevel(level);
		this._currentPermissionLevel.set(level, undefined);
		this.permissionLevelKey.set(level);
		this.permissionWidget?.refresh();
		const sessionResource = this.getCurrentSessionResource();
		if (sessionResource) {
			this.chatSessionsService.setSessionOption(sessionResource, PERMISSION_LEVEL_OPTION_ID, level);
		}
		this._syncInputStateToModel();
	}

	private getDefaultPermissionLevel(): ChatPermissionLevel {
		const level = this.configurationService.getValue<string>(ChatConfiguration.DefaultPermissionLevel);
		return isChatPermissionLevel(level) ? level : ChatPermissionLevel.Default;
	}

	private getPermittedPermissionLevel(level: ChatPermissionLevel): ChatPermissionLevel {
		if (this.configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false && level !== ChatPermissionLevel.Default) {
			return ChatPermissionLevel.Default;
		}
		return level;
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
	private createChatSessionPickerWidgets(action: MenuItemAction, pickerOptions?: IChatInputPickerOptions): ChatSessionPickerActionItem[] {
		this._lastSessionPickerAction = action;
		this._lastSessionPickerOptions = pickerOptions;

		const sessionResource = this.getCurrentSessionResource();
		const visibleOptionGroups = this.getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource);
		if (!visibleOptionGroups.length) {
			return [];
		}

		const effectiveSessionType = this.getEffectiveSessionType(sessionResource);
		if (!effectiveSessionType) {
			return [];
		}

		this.chatSessionPickerWidgets.clearAndDisposeAll();

		const widgets: ChatSessionPickerActionItem[] = [];
		for (const optionGroup of visibleOptionGroups) {
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
					if (sessionResource) {
						this.chatSessionsService.setSessionOption(sessionResource, optionGroup.id, option);
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

			const widget = this.instantiationService.createInstance(ChatSessionPickerActionItem, action, initialState, itemDelegate, pickerOptions);
			this.chatSessionPickerWidgets.set(optionGroup.id, widget);
			widgets.push(widget);
		}

		return widgets;
	}

	/**
	 * Set the input model reference for syncing input state
	 *
	 * Note: We have a cyclic ref between ChatInputPart and ChatWidget,
	 * When we invoke setInputModel, the property _widget is not set. Hence we don't have the SessionResource.
	 * As a result, in this method when syncFromModel is called, the model state is not applied to the UI.
	 * Instead, the defaults are computed and the model is updated with default values. Thereby blowing away model information.
	 * Setting Widget and then calling this doesn't work either because the widget also relies on ChatInputPart (hence cyclic ref).
	 * Solution is to pass the SessionResource as an argument to this method.
	*/
	setInputModel(model: IInputModel, chatSessionIsEmpty: boolean, forSessionResource: URI): void {
		// Flush current state to the outgoing model before switching,
		// so it preserves the latest permission level and other picker state.
		if (this._inputModel) {
			this._syncInputStateToModel();
		}

		this._inputModel = model;
		this._modelSyncDisposables.clear();
		this.selectedToolsModel.resetSessionEnablementState();
		this._chatSessionIsEmpty = chatSessionIsEmpty;

		if (chatSessionIsEmpty) {
			this._setEmptyModelState();

			// The default mode setting may be registered asynchronously by TAS,
			// and custom modes (like Plan) load asynchronously from prompt files.
			// Re-apply when either becomes available.
			this._modelSyncDisposables.add(this.configurationService.onDidChangeConfiguration(e => {
				if (this._chatSessionIsEmpty && e.affectsConfiguration(ChatConfiguration.DefaultNewSessionMode)) {
					this._setEmptyModelState();
				}
			}));
			this._modelSyncDisposables.add(this.chatModeService.onDidChangeChatModes(() => {
				if (this._chatSessionIsEmpty) {
					this._setEmptyModelState();
				}
			}));
		}

		// Observe changes from model and sync to view
		this._modelSyncDisposables.add(autorun(reader => {
			let state = model.state.read(reader);
			if (!state && this._chatSessionIsEmpty) {
				state = this._emptyInputState.read(undefined);
			}

			this._syncFromModel(state, forSessionResource);
		}));
	}

	private _setEmptyModelState() {
		if (this._inputModel?.state?.get()?.permissionLevel !== this.getDefaultPermissionLevel()) {
			this.setPermissionLevel(this.getDefaultPermissionLevel());
		}

		if (this.entitlementService.anonymous) {
			// Be deterministic for anonymous users to support
			// agentic flows with default model.
			this.setChatMode(ChatModeKind.Agent, false);
			this.checkModelSupported();
			return;
		}

		const rawDefaultMode = this.configurationService.getValue<string>(ChatConfiguration.DefaultNewSessionMode);
		if (typeof rawDefaultMode === 'string') {
			const defaultMode = rawDefaultMode.trim();
			if (defaultMode) {
				const defaultModeLower = defaultMode.toLowerCase();
				const resolved = this.chatModeService.findModeById(defaultMode)
					?? this.chatModeService.findModeByName(defaultMode)
					?? this.chatModeService.getModes().custom.find(m => m.name.get().toLowerCase() === defaultModeLower);
				if (resolved) {
					this.logService.trace(`[ChatInputPart] Applying default mode from setting: ${defaultMode} -> ${resolved.id}`);
					this.setChatMode(resolved.id, false);
					this.checkModelSupported();
				}
			}
		}
	}

	/**
	 * Sync from model to view (when model state changes)
	 */
	private _syncFromModel(state: IChatModelInputState | undefined, forSessionResource: URI): void {
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

			// Sync selected model - validate it belongs to the current session's model pool
			if (state?.selectedModel) {
				const allModels = this.getAllMergedModels();
				const sessionType = this.getCurrentSessionType() ?? getChatSessionType(forSessionResource);
				const syncResult = resolveModelFromSyncState(state.selectedModel, this._currentLanguageModel.get(), allModels, sessionType, {
					location: this.location,
					currentModeKind: this.currentModeKind,
					sessionType,
				});
				if (syncResult.action === 'apply') {
					this.setCurrentLanguageModel(state.selectedModel);
				} else if (syncResult.action === 'default') {
					this.setCurrentLanguageModelToDefault();
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

			// Sync permission level (skip if global auto-approve is on, so the picker stays unchanged)
			if (!this.configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove)) {
				const targetLevel = this.getPermittedPermissionLevel(state?.permissionLevel ?? ChatPermissionLevel.Default);
				if (this._currentPermissionLevel.get() !== targetLevel) {
					this._currentPermissionLevel.set(targetLevel, undefined);
					this.permissionLevelKey.set(targetLevel);
					this.permissionWidget?.refresh();
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

		// Some picker label changed size; re-evaluate toolbar overflow
		queueMicrotask(() => this.inputActionsToolbar?.relayout());
	}

	/**
	 * Flush the current input state to the bound input model. Use this before
	 * the host releases its model reference (e.g. on session switch) to ensure
	 * an unsent draft is captured by `willDisposeModel` persistence.
	 */
	public flushInputStateToModel(): void {
		if (this._inputModel) {
			this._syncInputStateToModel();
		}
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
		const allModels = this.getAllMergedModels();
		if (shouldResetModelToDefault(lm, this.getModels(), {
			location: this.location,
			currentModeKind: this.currentModeKind,
			sessionType: this.getCurrentSessionType(),
		}, allModels)) {
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
			this.chatModeService.findModeByName(mode) ??
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

	/**
	 * Get all models merged from live and cache, without session/mode filtering.
	 * This is the canonical source for the full model pool, including cached models
	 * that bridge startup races when live models haven't loaded yet.
	 */
	private getAllMergedModels(): ILanguageModelChatMetadataAndIdentifier[] {
		const cachedModels = this.storageService.getObject<ILanguageModelChatMetadataAndIdentifier[]>(CachedLanguageModelsKey, StorageScope.APPLICATION, []);
		const liveModels = this.languageModelsService.getLanguageModelIds()
			.map(modelId => ({ identifier: modelId, metadata: this.languageModelsService.lookupLanguageModel(modelId)! }));

		const contributedVendors = new Set(this.languageModelsService.getVendors().map(v => v.vendor));
		const models = mergeModelsWithCache(liveModels, cachedModels, contributedVendors);
		if (liveModels.length > 0) {
			this.storageService.store(CachedLanguageModelsKey, models, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		return models;
	}

	private getModels(): ILanguageModelChatMetadataAndIdentifier[] {
		const models = this.getAllMergedModels();
		models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));

		return filterModelsForSession(models, this.getCurrentSessionType(), this.currentModeKind, this.location);
	}

	/**
	 * Get the chat session type for the current session, if any.
	 */
	private getCurrentSessionType(): string | undefined {
		const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
		if (delegateSessionType) {
			return delegateSessionType;
		}
		const sessionResource = this._widget?.viewModel?.model.sessionResource;
		return sessionResource ? getChatSessionType(sessionResource) : undefined;
	}

	/**
	 * Check if any registered models target the current session type.
	 * This is used to set the context key that controls model picker visibility.
	 */
	private hasModelsTargetingSessionType(): boolean {
		return hasModelsTargetingSession(this.getAllMergedModels(), this.getCurrentSessionType());
	}

	private isModelValidForCurrentSession(model: ILanguageModelChatMetadataAndIdentifier): boolean {
		return isModelValidForSession(model, this.getAllMergedModels(), this.getCurrentSessionType());
	}

	/**
	 * Validate that the current model belongs to the current session's pool.
	 * Called when switching sessions to prevent cross-contamination.
	 */
	private checkModelInSessionPool(): void {
		const lm = this._currentLanguageModel.get();
		if (lm && !this.isModelValidForCurrentSession(lm)) {
			this.setCurrentLanguageModelToDefault();
		}
	}

	/**
	 * Reset the current mode when it is not valid for the current session type.
	 */
	private checkModeInSessionPool(sessionType?: string): void {
		if (!sessionType) {
			const sessionResource = this._widget?.viewModel?.model.sessionResource;
			if (!sessionResource) {
				return;
			}
			sessionType = getChatSessionType(sessionResource);
		}

		const customAgentTarget = this.chatSessionsService.getCustomAgentTargetForSessionType(sessionType);
		if (!customAgentTarget || customAgentTarget === Target.Undefined) {
			return;
		}

		const currentMode = this._currentModeObservable.get();
		if (currentMode.id === ChatMode.Agent.id) {
			return;
		}
		if (currentMode.isBuiltin) {
			this.setChatMode(ChatModeKind.Agent, false);
			return;
		}

		const modeTarget = currentMode.target.get();
		if (modeTarget !== customAgentTarget && modeTarget !== Target.Undefined) {
			this.setChatMode(ChatModeKind.Agent, false);
		}
	}

	/**
	 * Pre-select the model in the model picker based on the `modelId` from the
	 * last request in the current session's history. This ensures that when a
	 * contributed chat session is reopened, the model picker shows the model
	 * that was last used - providing continuity.
	 */
	private preselectModelFromSessionHistory(): void {
		const requests = this._widget?.viewModel?.model.getRequests();
		if (!requests || requests.length === 0) {
			return;
		}

		const modeInfo = findLast(requests, req => !!req.modeInfo)?.modeInfo;
		if (modeInfo && modeInfo.modeInstructions?.uri) {
			this.setChatMode(modeInfo.modeInstructions.uri.toString());
		}

		// Find the modelId from the last request that has one
		const lastModelId = findLast(requests, req => !!req.modelId)?.modelId;
		if (!lastModelId) {
			return;
		}

		const tryMatch = () => {
			// wait for at least 2 models to load,
			// Otherwise matching is not useful and may be inaccurate due to the fact that we have auto
			const models = this.getModels();
			if (models.length === 0) {
				return;
			}
			if (models.length === 1 && models[0].metadata.id.toLocaleLowerCase() === 'auto') {
				return;
			}
			// Try exact identifier match first (e.g. "copilot/gpt-4o")
			let match = models.find(m => m.identifier === lastModelId);
			if (!match) {
				// Fallback: match on metadata.id (short model ID from the extension)
				match = models.find(m => m.metadata.id === lastModelId);
			}
			return match;
		};

		const match = tryMatch();
		if (match) {
			this.setCurrentLanguageModel(match);
			return;
		}

		// Models may not be loaded yet - wait for them
		this._waitForPersistedLanguageModel.value = this.languageModelsService.onDidChangeLanguageModels(() => {
			const found = tryMatch();
			if (found) {
				this._waitForPersistedLanguageModel.clear();
				this.setCurrentLanguageModel(found);
			}
		});
	}

	private setCurrentLanguageModelToDefault() {
		const allModels = this.getModels();
		const defaultModel = findDefaultModel(allModels, this.location);
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
			permissionLevel: this._currentPermissionLevel.get(),
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

	/**
	 * Restores attachments to the input, re-fetching image binary data as needed.
	 */
	async restoreAttachments(attachments: readonly IChatRequestVariableEntry[]): Promise<void> {
		let restored = [...attachments];

		if (restored.length > 0) {
			restored = (await Promise.all(restored.map(async (attachment) => {
				if (isImageVariableEntry(attachment) && !attachment.value && attachment.references?.length && URI.isUri(attachment.references[0].reference)) {
					const currReference = attachment.references[0].reference;
					try {
						const imageBinary = currReference.toString(true).startsWith('http') ? await this.sharedWebExtracterService.readImage(currReference, CancellationToken.None) : (await this.fileService.readFile(currReference)).value;
						if (!imageBinary) {
							return undefined;
						}
						const newAttachment = { ...attachment };
						newAttachment.value = (isImageVariableEntry(attachment) && attachment.isPasted) ? imageBinary.buffer : await resizeImage(imageBinary.buffer);
						return newAttachment;
					} catch (err) {
						this.logService.error('Failed to fetch and reference.', err);
						return undefined;
					}
				}
				return attachment;
			}))).filter(isDefined);
		}

		this._attachmentModel.clearAndSetContext(...restored);
	}

	private async navigateHistory(previous: boolean): Promise<void> {
		const historyEntry = previous ?
			this.history.previous() : this.history.next();

		await this.restoreAttachments(historyEntry?.attachments ?? []);

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

	focusTodoList(): boolean {
		return this._chatInputTodoListWidget.value?.focus() ?? false;
	}

	isTodoListFocused(): boolean {
		return this._chatInputTodoListWidget.value?.hasFocus() ?? false;
	}

	hasVisibleTodos(): boolean {
		return this._chatInputTodoListWidget.value?.hasTodos() ?? false;
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

		this.resetScrollbarVisibilityAfterAccept();

		// Auto-dismiss notifications that requested it
		this.chatInputNotificationService.handleMessageSent();

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
			emitter = new Emitter<IChatSessionProviderOptionItem>();
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
	 */
	private getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource: URI | undefined): IChatSessionProviderOptionGroup[] {
		const customAgentTarget = sessionResource && this.chatSessionsService.getCustomAgentTargetForSessionType(getChatSessionType(sessionResource));
		this.chatSessionHasCustomAgentTarget.set(customAgentTarget !== Target.Undefined);

		// Check if this session type requires custom models
		const requiresCustomModels = sessionResource && this.chatSessionsService.requiresCustomModelsForSessionType(getChatSessionType(sessionResource));
		this.chatSessionHasTargetedModels.set(!!requiresCustomModels);

		const visibleOptionGroups = this.getVisibleOptionGroups(sessionResource);
		this.permissionWidget?.refresh();
		if (!visibleOptionGroups.length) {
			this.chatSessionHasOptions.set(false);
			this.chatSessionOptionsValid.set(true);
			return [];
		}

		const allOptionsValid = sessionResource ? this.areAllOptionsValid(sessionResource, visibleOptionGroups) : true;

		this.chatSessionHasOptions.set(true);
		this.chatSessionOptionsValid.set(allOptionsValid);

		return visibleOptionGroups;
	}

	private getCurrentSessionResource() {
		return this._widget?.viewModel?.model.sessionResource;
	}

	private areAllOptionsValid(sessionResource: URI, visibleOptionGroups: readonly IChatSessionProviderOptionGroup[]): boolean {
		for (const optionGroup of visibleOptionGroups) {
			const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id);
			if (currentOption) {
				const currentOptionId = typeof currentOption === 'string' ? currentOption : currentOption.id;
				// TODO: @osortega @joshspicer should we add a `placeHolder` item to option groups to straighten this check?
				if (!optionGroup.items.some(item => item.id === currentOptionId) && typeof currentOption === 'string') {
					return false;
				}
			}
		}
		return true;
	}

	private getAllOptionsGroups(sessionResource: URI | undefined): IChatSessionProviderOptionGroup[] {
		// - Panel/Editor: Use actual session's type (ctx available)
		// - Welcome view: Use delegate's type (ctx may not exist yet)
		const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
		const effectiveSessionType = delegateSessionType ?? (sessionResource ? getChatSessionType(sessionResource) : undefined);
		if (!effectiveSessionType) {
			return [];
		}

		// Step 2: Get option groups for this session type
		const allOptionGroups = this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType);
		return allOptionGroups ?? [];
	}

	private getVisibleOptionGroups(sessionResource: URI | undefined): IChatSessionProviderOptionGroup[] {
		const allOptionGroups = this.getAllOptionsGroups(sessionResource);
		if (!allOptionGroups.length) {
			return [];
		}

		// Update context keys with current option values before evaluating `when` clauses.
		// This ensures interdependent `when` expressions work correctly.
		if (sessionResource) {
			for (const optionGroup of allOptionGroups) {
				const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id);
				if (currentOption) {
					const optionId = typeof currentOption === 'string' ? currentOption : currentOption.id;
					this.updateOptionContextKey(optionGroup.id, optionId);
				}
			}
		}

		// Filter to visible groups (has items AND passes `when` clause AND session has option configured).
		// Permissions-kind groups are not rendered as standalone pickers; their items are surfaced
		// inside the chat permission picker instead (see `getActiveExtensionPermissionGroup`).
		const visibleGroups = new Map<string, IChatSessionProviderOptionGroup>();
		for (const optionGroup of allOptionGroups) {
			if (optionGroup.kind === 'permissions') {
				continue;
			}
			const hasItems = optionGroup.items.length > 0 || (optionGroup.commands || []).length > 0;
			const passesWhenClause = this.evaluateOptionGroupVisibility(optionGroup);

			// Only show picker if the session has this option configured once a real session exists.
			// In the welcome view (no `ctx` yet), treat groups as eligible so they can be rendered.
			const sessionHasOption = !sessionResource || this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id) !== undefined;

			if (hasItems && passesWhenClause && sessionHasOption) {
				visibleGroups.set(optionGroup.id, optionGroup);
			}
		}

		return Array.from(visibleGroups.values());
	}

	/**
	 * Returns the permissions-kind option group contributed by the active session provider, if any.
	 * Items from this group are surfaced inside the chat permission picker, replacing the
	 * built-in `ChatPermissionLevel` items. Honors the same visibility predicates as
	 * {@link getVisibleOptionGroups} so that `when` clauses are respected.
	 *
	 * If the provider declares more than one permissions-kind group (which the API forbids),
	 * the first one wins.
	 */
	private getActiveExtensionPermissionGroup(sessionResource: URI | undefined): IChatSessionProviderOptionGroup | undefined {
		const allOptionGroups = this.getAllOptionsGroups(sessionResource);
		return allOptionGroups.find(g =>
			g.kind === 'permissions'
			&& g.items.length > 0
			&& this.evaluateOptionGroupVisibility(g)
		);
	}

	/**
	 * Refresh all registered option groups for the current chat session.
	 * Fires events for each option group with their current selection.
	 */
	private refreshChatSessionPickers(): void {
		// Use the shared helper to compute visibility and update context keys
		const sessionResource = this.getCurrentSessionResource();
		const allOptionsGroups = this.getAllOptionsGroups(sessionResource);
		const visibleOptionGroups = this.getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource);
		if (!allOptionsGroups.length || !visibleOptionGroups.length) {
			// No visible options - helper already updated context keys
			this.hideAllSessionPickerWidgets();
			return;
		}

		// Check if widgets need recreation (different set of visible groups)
		const currentWidgetGroupIds = new Set(this.chatSessionPickerWidgets.keys());
		const needsRecreation =
			currentWidgetGroupIds.size !== visibleOptionGroups.length ||
			!visibleOptionGroups.every(group => currentWidgetGroupIds.has(group.id));

		if (needsRecreation && this._lastSessionPickerAction && this.chatSessionPickerContainer) {
			const widgets = this.createChatSessionPickerWidgets(this._lastSessionPickerAction, this._lastSessionPickerOptions);
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
		if (sessionResource) {
			for (const [optionGroupId] of this.chatSessionPickerWidgets) {
				const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroupId);
				if (currentOption) {
					const optionGroup = allOptionsGroups.find(g => g.id === optionGroupId);
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

	/**
	 * Get the current option for a specific option group.
	 * Returns undefined if the session doesn't have this option configured.
	 */
	private getCurrentOptionForGroup(optionGroupId: string): IChatSessionProviderOptionItem | undefined {
		const sessionResource = this._widget?.viewModel?.model.sessionResource;
		if (!sessionResource) {
			return;
		}

		// Only return an option if the session has it configured
		if (this.chatSessionsService.getSessionOption(sessionResource, optionGroupId) === undefined) {
			return;
		}

		const effectiveSessionType = this.getEffectiveSessionType(sessionResource);
		const optionGroups = effectiveSessionType ? this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType) : undefined;
		const optionGroup = optionGroups?.find(g => g.id === optionGroupId);
		if (!optionGroup || optionGroup.items.length === 0) {
			return;
		}

		const currentOptionValue = this.chatSessionsService.getSessionOption(sessionResource, optionGroupId);
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

	private hasWorkspaceScmRepository(): boolean {
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return false;
		}
		for (const repo of this.scmService.repositories) {
			if (repo.provider.rootUri && this.workspaceContextService.getWorkspaceFolder(repo.provider.rootUri)) {
				return true;
			}
		}
		return false;
	}

	private getEffectiveSessionType(sessionResource: URI | undefined): string | undefined {
		return this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.() ?? (sessionResource ? getChatSessionType(sessionResource) : undefined);
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
		this.chatSessionSupportsDelegationKey.set(this.chatSessionsService.supportsDelegationForSessionType(sessionType));
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
	 * Ensures the notification widget is instantiated and appended to the notification container.
	 */
	private ensureNotificationWidget(): void {
		if (!this._notificationWidget.value) {
			this._notificationWidget.value = this.instantiationService.createInstance(ChatInputNotificationWidget);
			this.chatInputNotificationContainer.appendChild(this._notificationWidget.value.domNode);
		}
	}

	/**
	 * Shows the context usage details popup and focuses it.
	 * @returns Whether the details were successfully shown.
	 */
	showContextUsageDetails(): boolean {
		return this.contextUsageWidget?.showDetails() ?? false;
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
		this.getVisibleOptionGroupsModeAndUpdateContextKeys(this.getCurrentSessionResource());

		// Initialize lock state when rendering with a pre-selected session provider (e.g., welcome view restore)
		const delegate = this.options.sessionTypePickerDelegate;
		if (delegate?.setActiveSessionProvider && delegate?.getActiveSessionProvider) {
			const initialSessionType = delegate.getActiveSessionProvider();
			if (initialSessionType) {
				this.updateWidgetLockStateFromSessionType(initialSessionType);
			}
		}

		this._register(widget.onDidChangeViewModel((e: IChatWidgetViewModelChangeEvent) => {
			this._pendingDelegationTarget = undefined;
			// Update agentSessionType when view model changes
			this.updateAgentSessionTypeContextKey();
			this.refreshChatSessionPickers();
			this.ensureNotificationWidget();
			this.updateContextUsageWidget();
			let hasMatchingResource = false;
			if (e.currentSessionResource) {
				for (const r of this._questionCarouselSessionResources.values()) {
					if (isEqual(r, e.currentSessionResource)) {
						hasMatchingResource = true;
						break;
					}
				}
			}
			if (this._questionCarouselSessionResources.size > 0 && (!e.currentSessionResource || !hasMatchingResource)) {
				this.clearQuestionCarousel();
			}

			let hasMatchingPlanReviewResource = false;
			if (e.currentSessionResource) {
				for (const r of this._planReviewSessionResources.values()) {
					if (isEqual(r, e.currentSessionResource)) {
						hasMatchingPlanReviewResource = true;
						break;
					}
				}
			}
			if (this._planReviewSessionResources.size > 0 && (!e.currentSessionResource || !hasMatchingPlanReviewResource)) {
				this.clearPlanReview();
			}

			// Swap the visible tool confirmation carousel for the new session
			this._syncToolConfirmationCarouselForSession();

			// Track the current session type and re-initialize model selection
			// when the session type changes (different session types may have
			// different model pools via targetChatSessionType).
			const newSessionType = this.getCurrentSessionType();
			if (e.currentSessionResource && newSessionType !== this._currentSessionType) {
				this._currentSessionType = newSessionType;
				this.initSelectedModel();
				this.checkModelInSessionPool();
				this.checkModeInSessionPool();
			}

			// For contributed sessions with history, pre-select the model
			// from the last request so the user resumes with the same model.
			this.preselectModelFromSessionHistory();
		}));

		let elements;
		if (this.options.renderStyle === 'compact') {
			elements = dom.h('.interactive-input-part', [
				dom.h('.interactive-input-and-edit-session', [
					dom.h('.chat-plan-review-widget-container@chatPlanReviewContainer'),
					dom.h('.chat-question-carousel-widget-container@chatQuestionCarouselContainer'),
					dom.h('.chat-tool-confirmation-carousel-container@chatToolConfirmationCarouselContainer'),
					dom.h('.chat-input-notification-container@chatInputNotificationContainer'),
					dom.h('.chat-todo-list-widget-container@chatInputTodoListWidgetContainer'),
					dom.h('.chat-artifacts-widget-container@chatArtifactsWidgetContainer'),
					dom.h('.chat-editing-session@chatEditingSessionWidgetContainer'),
					dom.h('.chat-getting-started-tip-container@chatGettingStartedTipContainer'),
					dom.h('.interactive-input-and-side-toolbar@inputAndSideToolbar', [
						dom.h('.chat-input-container@inputContainer', [
							dom.h('.chat-editor-container@editorContainer'),
							dom.h('.chat-input-toolbars@inputToolbars'),
						]),
					]),
					dom.h('.chat-secondary-toolbar@secondaryToolbar', [
						dom.h('.chat-context-usage-container@contextUsageWidgetContainer'),
					]),
					dom.h('.chat-attachments-container@attachmentsContainer', [
						dom.h('.chat-attached-context@attachedContextContainer'),
					]),
					dom.h('.interactive-input-followups@followupsContainer'),
				])
			]);
		} else {
			elements = dom.h('.interactive-input-part', [
				dom.h('.chat-plan-review-widget-container@chatPlanReviewContainer'),
				dom.h('.chat-question-carousel-widget-container@chatQuestionCarouselContainer'),
				dom.h('.chat-tool-confirmation-carousel-container@chatToolConfirmationCarouselContainer'),
				dom.h('.interactive-input-followups@followupsContainer'),
				dom.h('.chat-input-notification-container@chatInputNotificationContainer'),
				dom.h('.chat-todo-list-widget-container@chatInputTodoListWidgetContainer'),
				dom.h('.chat-artifacts-widget-container@chatArtifactsWidgetContainer'),
				dom.h('.chat-editing-session@chatEditingSessionWidgetContainer'),
				dom.h('.chat-getting-started-tip-container@chatGettingStartedTipContainer'),
				dom.h('.interactive-input-and-side-toolbar@inputAndSideToolbar', [
					dom.h('.chat-input-container@inputContainer', [
						dom.h('.chat-attachments-container@attachmentsContainer', [
							dom.h('.chat-attached-context@attachedContextContainer'),
						]),
						dom.h('.chat-editor-container@editorContainer'),
						dom.h('.chat-input-toolbars@inputToolbars'),
					]),
				]),
				dom.h('.chat-secondary-toolbar@secondaryToolbar', [
					dom.h('.chat-context-usage-container@contextUsageWidgetContainer'),
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
		this.inputContainer = inputContainer;
		const editorContainer = elements.editorContainer;
		this.attachmentsContainer = elements.attachmentsContainer;
		this.attachedContextContainer = elements.attachedContextContainer;
		const toolbarsContainer = elements.inputToolbars;
		this.secondaryToolbarContainer = elements.secondaryToolbar;
		if (this.options.renderStyle === 'compact') {
			this.secondaryToolbarContainer.style.display = 'none';
		}
		this.chatEditingSessionWidgetContainer = elements.chatEditingSessionWidgetContainer;
		this.chatInputTodoListWidgetContainer = elements.chatInputTodoListWidgetContainer;
		this.chatArtifactsWidgetContainer = elements.chatArtifactsWidgetContainer;
		this.chatGettingStartedTipContainer = elements.chatGettingStartedTipContainer;
		this.chatGettingStartedTipContainer.style.display = 'none';
		this.chatQuestionCarouselContainer = elements.chatQuestionCarouselContainer;
		this.chatPlanReviewContainer = elements.chatPlanReviewContainer;
		this.chatToolConfirmationCarouselContainer = elements.chatToolConfirmationCarouselContainer;
		dom.hide(this.chatToolConfirmationCarouselContainer);
		this.chatInputNotificationContainer = elements.chatInputNotificationContainer;
		this.contextUsageWidgetContainer = elements.contextUsageWidgetContainer;

		if (this.options.isSessionsWindow || this.options.renderStyle === 'compact') {
			toolbarsContainer.prepend(this.contextUsageWidgetContainer);
		}

		// Context usage widget — will be positioned in the toolbar after toolbars are created
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

		this.ensureNotificationWidget();

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
		this.editingSentRequestKey = ChatContextKeys.editingRequestType.bindTo(this.contextKeyService);
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
		options.lineHeight = INPUT_EDITOR_LINE_HEIGHT;
		options.padding = this.options.renderStyle === 'compact' ? INPUT_EDITOR_PADDING.compact : INPUT_EDITOR_PADDING.default;
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
		options.scrollbar = this.options.renderStyle === 'compact'
			? { ...(options.scrollbar ?? {}), vertical: 'hidden' }
			: {
				...(options.scrollbar ?? {}),
				vertical: 'auto',
				verticalScrollbarSize: 7,
			};
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
			const currentHeight = Math.min(this._inputEditor.getContentHeight(), this._effectiveInputEditorMaxHeight);
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

		const { location } = this.getWidgetLocationInfo(widget);

		const pickerOptions: IChatInputPickerOptions = {
			getOverflowAnchor: () => this.inputActionsToolbar.getElement(),
			actionContext: { widget },
			hideChevrons: derived(reader => this._stableInputPartWidth.read(reader) < CHAT_INPUT_PICKER_COLLAPSE_WIDTH),
		};
		const secondaryPickerOptions: IChatInputPickerOptions = {
			...pickerOptions,
			getOverflowAnchor: () => this.secondaryToolbar.getElement(),
		};

		this._register(dom.addStandardDisposableListener(toolbarsContainer, dom.EventType.CLICK, e => this.inputEditor.focus()));
		this._register(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.CLICK, e => this.inputEditor.focus()));
		const shorterChatInputActionIds = new Set<string>([
			OpenModePickerAction.ID,
			ConfigureToolsAction.ID,
		]);
		this.inputActionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.options.renderInputToolbarBelowInput ? this.attachmentsContainer : toolbarsContainer, MenuId.ChatInput, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: { shouldForwardArgs: true },
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			hoverDelegate,
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 48,
				getActionMinWidth: action => shorterChatInputActionIds.has(action.id) ? 22 : undefined,
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
						getModels: () => this.getModels(),
						useGroupedModelPicker: () => {
							const sessionType = this.getCurrentSessionType();
							return !sessionType || sessionType === localChatSessionType;
						},
						showManageModelsAction: () => {
							const sessionType = this.getCurrentSessionType();
							return !sessionType || sessionType === localChatSessionType;
						},
						showUnavailableFeatured: () => {
							const sessionType = this.getCurrentSessionType();
							return !sessionType || sessionType === localChatSessionType;
						},
						showFeatured: () => {
							const sessionType = this.getCurrentSessionType();
							return !sessionType || sessionType === localChatSessionType;
						},
					};
					return this.modelWidget = this.instantiationService.createInstance(ModelPickerActionItem, action, itemDelegate, pickerOptions);
				} else if (action.id === OpenModePickerAction.ID && action instanceof MenuItemAction) {
					const delegate: IModePickerDelegate = {
						currentMode: this._currentModeObservable,
						sessionResource: () => this._widget?.viewModel?.sessionResource,
						customAgentTarget: () => {
							const sessionResource = this._widget?.viewModel?.model.sessionResource;
							return (sessionResource && this.chatSessionsService.getCustomAgentTargetForSessionType(getChatSessionType(sessionResource))) ?? Target.Undefined;
						},
					};
					return this.modeWidget = this.instantiationService.createInstance(ModePickerActionItem, action, delegate, pickerOptions);
				} else if ((action.id === OpenSessionTargetPickerAction.ID || action.id === OpenDelegationPickerAction.ID) && action instanceof MenuItemAction) {
					// Use provided delegate if available, otherwise create default delegate
					const getActiveSessionType = () => {
						const sessionResource = this._widget?.viewModel?.sessionResource;
						// TODO: Remove hardcoded providers from core
						return sessionResource ? (getAgentSessionProvider(sessionResource) ?? getChatSessionType(sessionResource)) : undefined;
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
						hasGitRepository: () => this.hasWorkspaceScmRepository(),
					};
					const isWelcomeViewMode = !!this.options.sessionTypePickerDelegate?.setActiveSessionProvider;
					const Picker = (action.id === OpenSessionTargetPickerAction.ID || isWelcomeViewMode) ? SessionTypePickerActionItem : DelegationSessionPickerActionItem;
					return this.sessionTargetWidget = this.instantiationService.createInstance(Picker, action, location === ChatWidgetLocation.Editor ? 'editor' : 'sidebar', delegate, pickerOptions);
				} else if (action.id === ChatSessionPrimaryPickerAction.ID && action instanceof MenuItemAction) {
					// Cloud sessions render their option-group pickers (e.g. branch) on the primary toolbar
					const widgets = this.createChatSessionPickerWidgets(action, pickerOptions);
					if (widgets.length === 0) {
						return new HiddenActionViewItem(action);
					}
					return this.instantiationService.createInstance(ChatSessionPickersContainerActionItem, action, widgets);
				}
				return undefined;
			}
		}));
		this.inputActionsToolbar.getElement().classList.add('chat-input-toolbar');
		this.inputActionsToolbar.context = { widget } satisfies IChatExecuteActionContext;
		this._register(this.inputActionsToolbar.onDidChangeMenuItems(() => {
			// Update container reference for the pickers (cloud sessions host them in the primary toolbar)
			const toolbarElement = this.inputActionsToolbar.getElement();
			// eslint-disable-next-line no-restricted-syntax
			const primaryPickerContainer = toolbarElement.querySelector('.chat-sessionPicker-container');
			if (primaryPickerContainer) {
				this.chatSessionPickerContainer = primaryPickerContainer as HTMLElement;
			}
			if (this.cachedWidth && typeof this.cachedInputToolbarWidth === 'number' && this.cachedInputToolbarWidth !== this.inputActionsToolbar.getItemsWidth()) {
				this._toolbarRelayoutScheduler.schedule();
			}
		}));
		// When hideChevrons changes, picker items change their rendered size
		// but the toolbar's ResizeObserver won't fire (the toolbar element size
		// didn't change, only its children did). Force a relayout so the
		// responsive overflow logic re-evaluates with the correct item widths.
		// The relayout is deferred by a microtask so the picker action view
		// items' own autoruns have a chance to re-render their labels first.
		this._register(autorun(reader => {
			pickerOptions.hideChevrons.read(reader);
			queueMicrotask(() => this.inputActionsToolbar.relayout());
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
				this._toolbarRelayoutScheduler.schedule();
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

		// Secondary toolbar (permissions) — below the input box
		this.secondaryToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.secondaryToolbarContainer, MenuId.ChatInputSecondary, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: { shouldForwardArgs: true },
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			hoverDelegate,
			responsiveBehavior: {
				enabled: true,
				kind: 'last',
				minItems: 1,
				actionMinWidth: 48,
			},
			actionViewItemProvider: (action, options) => {
				if ((action.id === OpenSessionTargetPickerAction.ID || action.id === OpenDelegationPickerAction.ID) && action instanceof MenuItemAction) {
					const getActiveSessionType = () => {
						const sessionResource = this._widget?.viewModel?.sessionResource;
						// TODO: Remove hardcoded providers from core
						return sessionResource ? (getAgentSessionProvider(sessionResource) ?? getChatSessionType(sessionResource)) : undefined;
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
						hasGitRepository: () => this.hasWorkspaceScmRepository(),
					};
					const isWelcomeViewMode = !!this.options.sessionTypePickerDelegate?.setActiveSessionProvider;
					const Picker = (action.id === OpenSessionTargetPickerAction.ID || isWelcomeViewMode) ? SessionTypePickerActionItem : DelegationSessionPickerActionItem;
					return this.sessionTargetWidget = this.instantiationService.createInstance(Picker, action, location === ChatWidgetLocation.Editor ? 'editor' : 'sidebar', delegate, secondaryPickerOptions);
				} else if (action.id === OpenWorkspacePickerAction.ID && action instanceof MenuItemAction) {
					if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY && this.options.workspacePickerDelegate) {
						return this.instantiationService.createInstance(WorkspacePickerActionItem, action, this.options.workspacePickerDelegate, secondaryPickerOptions);
					} else {
						return new HiddenActionViewItem(action);
					}
				} else if (action.id === OpenPermissionPickerAction.ID && action instanceof MenuItemAction) {
					const delegate: IPermissionPickerDelegate = {
						currentPermissionLevel: this._currentPermissionLevel,
						setPermissionLevel: (level: ChatPermissionLevel) => {
							this.setPermissionLevel(level);
						},
						getExtensionPermissions: () => {
							const sessionResource = this.getCurrentSessionResource();
							const group = this.getActiveExtensionPermissionGroup(sessionResource);
							if (!group) {
								return undefined;
							}
							const current = sessionResource ? this.chatSessionsService.getSessionOption(sessionResource, group.id) : undefined;
							const defaultId = group.selected?.id ?? group.items.find(i => i.default)?.id;
							const rawSelectedId = current === undefined
								? defaultId
								: typeof current === 'string' ? current : current.id;
							const selectedId = rawSelectedId !== undefined && group.items.some(i => i.id === rawSelectedId)
								? rawSelectedId
								: defaultId;
							const sessionType = sessionResource
								? getChatSessionType(sessionResource)
								: (this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.() ?? '');
							return { sessionType, groupId: group.id, items: group.items, selectedId };
						},
						setExtensionPermission: (groupId: string, item: IChatSessionProviderOptionItem) => {
							this.updateOptionContextKey(groupId, item.id);
							this.getOrCreateOptionEmitter(groupId).fire(item);
							const sessionResource = this.getCurrentSessionResource();
							if (sessionResource) {
								this.chatSessionsService.setSessionOption(sessionResource, groupId, item);
							}
							this.permissionWidget?.refresh();
						},
					};
					const widget = this.instantiationService.createInstance(PermissionPickerActionItem, action, delegate, secondaryPickerOptions);
					this.permissionWidget = widget;
					this._register(widget.onDidDispose(() => {
						if (this.permissionWidget === widget) {
							this.permissionWidget = undefined;
						}
					}));
					return widget;
				} else if (action.id === ChatSessionPrimaryPickerAction.ID && action instanceof MenuItemAction) {
					// Create all pickers and return a container action view item
					const widgets = this.createChatSessionPickerWidgets(action, secondaryPickerOptions);
					if (widgets.length === 0) {
						return new HiddenActionViewItem(action);
					}
					// Create a container to hold all picker widgets
					return this.instantiationService.createInstance(ChatSessionPickersContainerActionItem, action, widgets);
				}
				return undefined;
			}
		}));
		this.secondaryToolbar.getElement().classList.add('chat-secondary-input-toolbar');
		this.secondaryToolbar.context = { widget } satisfies IChatExecuteActionContext;
		this._register(this.secondaryToolbar.onDidChangeMenuItems(() => {
			// Update container reference for the pickers when the secondary toolbar hosts one.
			// Only assign when found so we don't overwrite a valid primary container reference
			// for session types whose pickers live in the primary toolbar (e.g. cloud).
			const toolbarElement = this.secondaryToolbar.getElement();
			// eslint-disable-next-line no-restricted-syntax
			const container = toolbarElement.querySelector('.chat-sessionPicker-container');
			if (dom.isHTMLElement(container)) {
				this.chatSessionPickerContainer = container;
			}
		}));

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

		this.renderAttachedContext();

		const inputResizeObserver = this._register(new dom.DisposableResizeObserver(() => {
			this.updateToolConfirmationCarouselMaxHeight();
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
		const hasAttachments = Boolean(attachments.length);

		// Render implicit context (active editor in Ask mode, or selection)
		let hasImplicitContext = false;
		const isSuggestedEnabled = this.configurationService.getValue<boolean>('chat.implicitContext.suggestedContext');
		const hasVisibleImplicitContext = isSuggestedEnabled
			? this._implicitContext?.hasValue ?? false
			: this._implicitContext?.values.some(v => v.enabled || v.isSelection) ?? false;
		if (this._implicitContext && hasVisibleImplicitContext) {
			const isAttachmentAlreadyAttached = (targetUri: URI | undefined, targetRange: IRange | undefined, targetHandle: number | undefined): boolean => {
				return this._attachmentModel.attachments.some(a => {
					const aUri = URI.isUri(a.value) ? a.value : isLocation(a.value) ? a.value.uri : undefined;
					const aRange = isLocation(a.value) ? a.value.range : undefined;
					if (targetHandle !== undefined && isStringVariableEntry(a) && a.handle === targetHandle) {
						return true;
					}
					if (targetUri && aUri && isEqual(targetUri, aUri)) {
						if (targetRange && aRange) {
							return Range.equalsRange(targetRange, aRange);
						}
						return !targetRange && !aRange;
					}
					return false;
				});
			};
			const implicitContextWidget = this.instantiationService.createInstance(
				ImplicitContextAttachmentWidget,
				() => this._widget,
				isAttachmentAlreadyAttached,
				this._implicitContext,
				this._contextResourceLabels,
				this._attachmentModel,
				container,
			);
			store.add(implicitContextWidget);
			hasImplicitContext = implicitContextWidget.hasRenderedContexts;
		}

		dom.setVisibility(Boolean(this.options.renderInputToolbarBelowInput || hasAttachments || hasImplicitContext), this.attachmentsContainer);
		dom.setVisibility(hasAttachments || hasImplicitContext, this.attachedContextContainer);
		if (!attachments.length) {
			this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
			this._indexOfLastOpenedContext = -1;
		}

		// Mark images that exceed the model-specific per-request limit so they render with a warning
		const maxImagesPerRequest = getImageAttachmentLimit(this._currentLanguageModel.get()?.metadata);
		const imageAttachments = attachments.filter(([, a]) => isImageVariableEntry(a));
		if (maxImagesPerRequest !== undefined && imageAttachments.length > maxImagesPerRequest) {
			const excessCount = imageAttachments.length - maxImagesPerRequest;
			for (let i = 0; i < excessCount; i++) {
				const attachment = imageAttachments[i][1];
				if (attachment.omittedState === OmittedState.NotOmitted || attachment.omittedState === OmittedState.ImageLimitExceeded) {
					attachment.omittedState = OmittedState.ImageLimitExceeded;
				}
			}
			for (let i = excessCount; i < imageAttachments.length; i++) {
				if (imageAttachments[i][1].omittedState === OmittedState.ImageLimitExceeded) {
					imageAttachments[i][1].omittedState = OmittedState.NotOmitted;
				}
			}
		} else {
			for (const [, a] of imageAttachments) {
				if (a.omittedState === OmittedState.ImageLimitExceeded) {
					a.omittedState = OmittedState.NotOmitted;
				}
			}
		}


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
			} else if (isBrowserViewVariableEntry(attachment)) {
				attachmentWidget = this.instantiationService.createInstance(BrowserViewAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
			} else {
				attachmentWidget = this._chatAttachmentWidgetRegistry.createWidget(attachment, options, container)
					?? this.instantiationService.createInstance(DefaultChatAttachmentWidget, resource, range, attachment, undefined, lm, options, container, this._contextResourceLabels);
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

		this._indexOfLastOpenedContext = -1;
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
		const attachments = Array.from(this.attachedContextContainer.querySelectorAll('.chat-attached-context-attachment'));
		if (!attachments.length) {
			return;
		}

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

	renderArtifactsWidget(chatSessionResource: URI): void {
		if (!this.configurationService.getValue<boolean>(ChatConfiguration.ArtifactsEnabled)) {
			return;
		}

		if (!this._chatArtifactsWidget.value) {
			const widget = this._register(this.instantiationService.createInstance(ChatArtifactsWidget));
			this._chatArtifactsWidget.value = widget;
			dom.clearNode(this.chatArtifactsWidgetContainer);
			dom.append(this.chatArtifactsWidgetContainer, widget.domNode);
		}
		this._chatArtifactsWidget.value.setSessionResource(chatSessionResource);
	}

	clearArtifactsWidget(): void {
		this._chatArtifactsWidget.value?.setSessionResource(undefined);
	}

	renderQuestionCarousel(carousel: IChatQuestionCarousel, context: IChatContentPartRenderContext, options: IChatQuestionCarouselOptions): ChatQuestionCarouselPart {

		const carouselKey = carousel.resolveId ?? `${isResponseVM(context.element) ? context.element.requestId : ''}_${context.contentIndex}`;

		// If a carousel with the same key already exists, return it
		const existing = this._chatQuestionCarouselWidgets.get(carouselKey);
		if (existing) {
			return existing;
		}

		// Track the response id and session for this carousel
		if (isResponseVM(context.element)) {
			this._questionCarouselResponseIds.set(carouselKey, context.element.requestId);
			this._questionCarouselSessionResources.set(carouselKey, context.element.sessionResource);
		}

		const part = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, options);
		this._chatQuestionCarouselWidgets.set(carouselKey, part);
		this._hasQuestionCarouselContextKey?.set(true);

		dom.append(this.chatQuestionCarouselContainer, part.domNode);

		return part;
	}

	clearQuestionCarousel(responseId?: string, resolveId?: string): void {
		if (resolveId !== undefined) {
			// Remove a specific carousel by resolveId
			const part = this._chatQuestionCarouselWidgets.get(resolveId);
			if (part) {
				part.domNode.remove();
				this._chatQuestionCarouselWidgets.deleteAndDispose(resolveId);
			}
			this._questionCarouselResponseIds.delete(resolveId);
			this._questionCarouselSessionResources.delete(resolveId);
		} else if (responseId !== undefined) {
			// Remove all carousels associated with a given responseId
			for (const [key, rid] of this._questionCarouselResponseIds) {
				if (rid === responseId) {
					const part = this._chatQuestionCarouselWidgets.get(key);
					if (part) {
						part.domNode.remove();
						this._chatQuestionCarouselWidgets.deleteAndDispose(key);
					}
					this._questionCarouselResponseIds.delete(key);
					this._questionCarouselSessionResources.delete(key);
				}
			}
		} else {
			// Clear all carousels
			this._chatQuestionCarouselWidgets.clearAndDisposeAll();
			this._questionCarouselResponseIds.clear();
			this._questionCarouselSessionResources.clear();
			dom.clearNode(this.chatQuestionCarouselContainer);
		}
		this._hasQuestionCarouselContextKey?.set(this._chatQuestionCarouselWidgets.size > 0);
	}

	get questionCarousel(): ChatQuestionCarouselPart | undefined {
		// Return the focused carousel, or the first one
		for (const part of this._chatQuestionCarouselWidgets.values()) {
			if (part.hasFocus()) {
				return part;
			}
		}
		return this._chatQuestionCarouselWidgets.size > 0 ? this._chatQuestionCarouselWidgets.values().next().value : undefined;
	}

	focusQuestionCarousel(): boolean {
		const carousel = this.questionCarousel;
		if (carousel) {
			carousel.focus();
			return true;
		}
		return false;
	}

	isQuestionCarouselFocused(): boolean {
		for (const part of this._chatQuestionCarouselWidgets.values()) {
			if (part.hasFocus()) {
				return true;
			}
		}
		return false;
	}

	navigateToPreviousQuestion(): boolean {
		const carousel = this.questionCarousel;
		return carousel?.navigateToPreviousQuestion() ?? false;
	}

	navigateToNextQuestion(): boolean {
		const carousel = this.questionCarousel;
		return carousel?.navigateToNextQuestion() ?? false;
	}

	focusQuestionCarouselTerminal(): boolean {
		const carousel = this.questionCarousel;
		return carousel?.focusTerminal() ?? false;
	}

	// --- Plan Review ---

	renderPlanReview(review: IChatPlanReview, context: IChatContentPartRenderContext, options: IChatPlanReviewPartOptions): ChatPlanReviewPart {
		const key = review.resolveId ?? `${isResponseVM(context.element) ? context.element.requestId : ''}_${context.contentIndex}`;

		const existing = this._chatPlanReviewWidgets.get(key);
		if (existing) {
			return existing;
		}

		if (isResponseVM(context.element)) {
			this._planReviewResponseIds.set(key, context.element.requestId);
			this._planReviewSessionResources.set(key, context.element.sessionResource);
		}

		const part = this.instantiationService.createInstance(ChatPlanReviewPart, review, context, options);
		this._chatPlanReviewWidgets.set(key, part);
		dom.append(this.chatPlanReviewContainer, part.domNode);

		return part;
	}

	clearPlanReview(responseId?: string, resolveId?: string): void {
		if (resolveId !== undefined) {
			const part = this._chatPlanReviewWidgets.get(resolveId);
			if (part) {
				part.domNode.remove();
				this._chatPlanReviewWidgets.deleteAndDispose(resolveId);
			}
			this._planReviewResponseIds.delete(resolveId);
			this._planReviewSessionResources.delete(resolveId);
		} else if (responseId !== undefined) {
			for (const [key, rid] of this._planReviewResponseIds) {
				if (rid === responseId) {
					const part = this._chatPlanReviewWidgets.get(key);
					if (part) {
						part.domNode.remove();
						this._chatPlanReviewWidgets.deleteAndDispose(key);
					}
					this._planReviewResponseIds.delete(key);
					this._planReviewSessionResources.delete(key);
				}
			}
		} else {
			this._chatPlanReviewWidgets.clearAndDisposeAll();
			this._planReviewResponseIds.clear();
			this._planReviewSessionResources.clear();
			dom.clearNode(this.chatPlanReviewContainer);
		}
	}

	get planReview(): ChatPlanReviewPart | undefined {
		return this._chatPlanReviewWidgets.size > 0 ? this._chatPlanReviewWidgets.values().next().value : undefined;
	}

	// --- Tool Confirmation Carousel ---

	private get _currentSessionKey(): string | undefined {
		return this._widget?.viewModel?.model.sessionResource.toString();
	}

	private get _currentToolConfirmationCarousel(): ChatToolConfirmationCarouselPart | undefined {
		const key = this._currentSessionKey;
		return key ? this._chatToolConfirmationCarousels.get(key) : undefined;
	}

	renderToolConfirmationCarousel(tool: IChatToolInvocation, factory: ToolInvocationPartFactory, subAgentInvocationId?: string, agentName?: string, scrollToSubagent?: ScrollToSubagentCallback, toolPart?: ChatToolInvocationPart): ChatToolConfirmationCarouselPart {
		const existing = this._currentToolConfirmationCarousel;
		if (existing) {
			existing.addToolInvocation(tool, subAgentInvocationId, agentName, scrollToSubagent, toolPart);
			this.updateToolConfirmationCarouselMaxHeight();
			return existing;
		}

		const key = this._currentSessionKey;
		if (!key) {
			throw new Error('Cannot render tool confirmation carousel without an active session');
		}

		const part = new ChatToolConfirmationCarouselPart(factory, [], scrollToSubagent, subAgentInvocationId, agentName);
		part.addToolInvocation(tool, subAgentInvocationId, agentName, scrollToSubagent, toolPart);
		this._chatToolConfirmationCarousels.set(key, part);
		dom.append(this.chatToolConfirmationCarouselContainer, part.domNode);
		dom.show(this.chatToolConfirmationCarouselContainer);
		this.updateToolConfirmationCarouselMaxHeight();

		const capturedKey = key;
		Event.once(part.onDidEmpty)(() => {
			this._chatToolConfirmationCarousels.deleteAndDispose(capturedKey);
			if (this._currentSessionKey === capturedKey) {
				dom.clearNode(this.chatToolConfirmationCarouselContainer);
				dom.hide(this.chatToolConfirmationCarouselContainer);
			}
		});

		return part;
	}

	addToolToConfirmationCarousel(tool: IChatToolInvocation, factory: ToolInvocationPartFactory, subAgentInvocationId?: string, agentName?: string, scrollToSubagent?: ScrollToSubagentCallback, toolPart?: ChatToolInvocationPart): void {
		const existing = this._currentToolConfirmationCarousel;
		if (existing) {
			existing.addToolInvocation(tool, subAgentInvocationId, agentName, scrollToSubagent, toolPart);
			this.updateToolConfirmationCarouselMaxHeight();
		} else {
			this.renderToolConfirmationCarousel(tool, factory, subAgentInvocationId, agentName, scrollToSubagent, toolPart);
		}
	}

	/**
	 * Navigates the carousel to the first pending tool from the given subagent.
	 */
	activateCarouselForSubagent(subAgentInvocationId: string): void {
		this._currentToolConfirmationCarousel?.activateFirstToolForSubagent(subAgentInvocationId);
	}

	hasToolInConfirmationCarousel(toolCallId: string): boolean {
		return this._currentToolConfirmationCarousel?.hasToolInvocation(toolCallId) ?? false;
	}

	get hasActiveToolConfirmationCarousel(): boolean {
		const carousel = this._currentToolConfirmationCarousel;
		return !!carousel && carousel.pendingCount > 0;
	}

	clearToolConfirmationCarousel(): void {
		const key = this._currentSessionKey;
		if (key) {
			this._chatToolConfirmationCarousels.deleteAndDispose(key);
		}
		dom.clearNode(this.chatToolConfirmationCarouselContainer);
		dom.hide(this.chatToolConfirmationCarouselContainer);
	}

	/**
	 * Swaps the visible tool confirmation carousel when switching sessions.
	 */
	private _syncToolConfirmationCarouselForSession(): void {
		dom.clearNode(this.chatToolConfirmationCarouselContainer);
		const carousel = this._currentToolConfirmationCarousel;
		if (carousel && carousel.pendingCount > 0) {
			dom.append(this.chatToolConfirmationCarouselContainer, carousel.domNode);
			dom.show(this.chatToolConfirmationCarouselContainer);
			this.updateToolConfirmationCarouselMaxHeight();
		} else {
			dom.hide(this.chatToolConfirmationCarouselContainer);
		}
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
					if (action.id === ChatEditingShowChangesAction.ID || action.id === ViewPreviousEditsAction.Id) {
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
	 * Sets the maximum height budget for the input part. The editor height will be
	 * clamped so it does not grow beyond what this budget allows after accounting
	 * for non-editor chrome such as attachments, toolbars, and widgets.
	 */
	setMaxHeight(maxHeight: number | undefined): void {
		this._maxHeight = maxHeight;
		this.updateToolConfirmationCarouselMaxHeight();
	}

	private updateToolConfirmationCarouselMaxHeight(): void {
		const carousel = this._currentToolConfirmationCarousel;
		if (!carousel) {
			return;
		}

		if (this._maxHeight === undefined) {
			carousel.setMaxHeight(undefined);
			return;
		}

		const carouselHeight = this.chatToolConfirmationCarouselContainer.offsetHeight;
		const otherInputHeight = Math.max(0, this.container.offsetHeight - carouselHeight);
		carousel.setMaxHeight(this._maxHeight - otherInputHeight);
	}

	/**
	 * Layout the input part with the given width. Height is intrinsic - determined by content
	 * and detected via ResizeObserver, which updates `inputPartHeight` for the parent to observe.
	 */
	layout(width: number) {
		this.cachedWidth = width;
		this._stableInputPartWidth.set(width, undefined);
		this._updateWorkingProgressAnimationDuration(width);

		return this._layout(width);
	}

	/**
	 * Scale the working/progress border comet animation duration with
	 * the input width so the comet's perceived linear travel speed (the
	 * rate it sweeps along the perimeter in px/sec) stays roughly
	 * constant. A fixed cycle time made wide inputs feel sluggish, but
	 * an aggressive inverse curve made narrow inputs feel slow because
	 * their cycle was clamped while the comet had little distance to
	 * cover. Sub-linear scaling with width (`sqrt(width)`) plus tight
	 * clamps keeps both extremes looking lively.
	 */
	private _lastAnimDurationS: number | undefined;
	private _updateWorkingProgressAnimationDuration(width: number): void {
		if (!this.inputContainer) {
			return;
		}
		// Sub-linear scaling: cycle time grows with width but tapers off
		// so wide inputs still feel snappy. Tuned so ~400px → ~1.7s and
		// ~1000px → ~2.3s rather than ~4s.
		const MIN_DURATION_S = 1.4;
		const MAX_DURATION_S = 2.5;
		const safeWidth = Math.max(50, width);
		const raw = 0.55 + 0.075 * Math.sqrt(safeWidth);
		const duration = Math.min(MAX_DURATION_S, Math.max(MIN_DURATION_S, raw));

		// Skip no-op updates (e.g. repeated layout calls during steady state).
		if (this._lastAnimDurationS !== undefined && Math.abs(this._lastAnimDurationS - duration) < 0.05) {
			return;
		}
		this._lastAnimDurationS = duration;
		this.inputContainer.style.setProperty('--chat-input-anim-duration', `${duration.toFixed(2)}s`);

		// CSS animations capture animation-duration at start time and most
		// browsers do not re-pick up values that come from a custom
		// property mid-flight. If the comet is currently spinning, restart
		// it on the next animation frame so style and layout changes can
		// batch without forcing a synchronous reflow. Toggling the .working
		// class would cancel the in-flight indicator state, so instead we
		// briefly flip a marker class that the CSS uses to swap
		// animation-name.
		if (this.inputContainer.classList.contains('working')) {
			const inputContainer = this.inputContainer;
			inputContainer.classList.add('chat-input-anim-restart');
			dom.scheduleAtNextAnimationFrame(dom.getWindow(inputContainer), () => {
				inputContainer.classList.remove('chat-input-anim-restart');
			});
		}
	}

	private get _effectiveInputEditorMaxHeight(): number {
		if (this._maxHeight === undefined) {
			return this.inputEditorMaxHeight;
		}

		// Compute non-editor height from the cached container height (updated by ResizeObserver)
		// minus the current editor height. This avoids a forced reflow from reading offsetHeight.
		const currentEditorHeight = this.previousInputEditorDimension?.height ?? 0;
		const nonEditorHeight = Math.max(0, this.height.get() - currentEditorHeight);
		const budgetForEditor = this._maxHeight - nonEditorHeight;
		return Math.min(this.inputEditorMaxHeight, Math.max(0, budgetForEditor));
	}

	private previousInputEditorDimension: IDimension | undefined;
	private _layout(width: number, allowRecurse = true): void {
		const data = this.getLayoutData();

		const followupsWidth = width - data.inputPartHorizontalPadding;
		this.followupsContainer.style.width = `${followupsWidth}px`;

		const initialEditorScrollWidth = this._inputEditor.getScrollWidth();
		const newEditorWidth = width - data.inputPartHorizontalPadding - data.editorBorder - data.inputPartHorizontalPaddingInside - data.toolbarsWidth - data.sideToolbarWidth;
		const effectiveMaxHeight = this._effectiveInputEditorMaxHeight;
		const clampedContentHeight = Math.min(this._inputEditor.getContentHeight(), effectiveMaxHeight);
		const inputEditorHeight = this.inputEditorMinHeight ? Math.min(Math.max(this.inputEditorMinHeight, clampedContentHeight), effectiveMaxHeight) : clampedContentHeight;
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
			const toolbarItemGap = 4;
			const executeToolbarWidth = this.cachedExecuteToolbarWidth = this.executeToolbar.getItemsWidth();
			const inputToolbarWidth = this.cachedInputToolbarWidth = this.inputActionsToolbar.getItemsWidth();
			const executeToolbarPadding = (this.executeToolbar.getItemsLength() - 1) * toolbarItemGap;
			const inputToolbarPadding = this.inputActionsToolbar.getItemsLength() ? (this.inputActionsToolbar.getItemsLength() - 1) * toolbarItemGap : 0;
			const contextUsageWidth = dom.getTotalWidth(this.contextUsageWidgetContainer);
			const inputToolbarsPadding = 12; // pdading between input toolbar/execute toolbar/contextUsage.
			return executeToolbarWidth + executeToolbarPadding + contextUsageWidth + (this.options.renderInputToolbarBelowInput ? 0 : inputToolbarWidth + inputToolbarPadding + inputToolbarsPadding);
		};

		return {
			editorBorder: 2,
			inputPartHorizontalPadding: this.options.renderStyle === 'compact' ? 16 : 24,
			inputPartHorizontalPaddingInside: this.options.renderStyle === 'compact' ? 12 : 10,
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

	private getDefaultScrollbarOptions(): IEditorScrollbarOptions {
		const scrollbar = this._inputEditor.getRawOptions().scrollbar ?? {};
		return this.options.renderStyle === 'compact'
			? { ...scrollbar, vertical: 'hidden' }
			: { ...scrollbar, vertical: 'auto', verticalScrollbarSize: 7 };
	}

	private getVisibleScrollbarOptions(): IEditorScrollbarOptions {
		const scrollbar = this._inputEditor.getRawOptions().scrollbar ?? {};
		return this.options.renderStyle === 'compact'
			? { ...scrollbar, vertical: 'hidden' }
			: { ...scrollbar, vertical: 'visible', verticalScrollbarSize: 7 };
	}

	private updateInputEditorScrollbarOptions(): void {
		this._inputEditor.updateOptions({
			scrollbar: this._forceVisibleScrollbarUntilAccept
				? this.getVisibleScrollbarOptions()
				: this.getDefaultScrollbarOptions()
		});
	}

	showScrollbarUntilAccept(): void {
		this._forceVisibleScrollbarUntilAccept = true;
		this.updateInputEditorScrollbarOptions();
	}

	private resetScrollbarVisibilityAfterAccept(): void {
		if (!this._forceVisibleScrollbarUntilAccept) {
			return;
		}

		this._forceVisibleScrollbarUntilAccept = false;
		this.updateInputEditorScrollbarOptions();
	}
}


function getLastPosition(model: ITextModel): IPosition {
	return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}

const chatInputEditorContainerSelector = '.interactive-input-editor';
setupSimpleEditorSelectionStyling(chatInputEditorContainerSelector);

type ChatSessionPickerWidget = ChatSessionPickerActionItem;

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

class HiddenActionViewItem extends BaseActionViewItem {
	constructor(action: IAction) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.style.display = 'none';
	}
}
