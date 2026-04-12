/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChatInputPart_1;
import * as dom from '../../../../../../base/browser/dom.js';
import { addDisposableListener } from '../../../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../../../base/browser/fonts.js';
import { hasModifierKeys } from '../../../../../../base/browser/keyboardEvent.js';
import { ActionViewItem, BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import * as aria from '../../../../../../base/browser/ui/aria/aria.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { equals as arraysEqual } from '../../../../../../base/common/arrays.js';
import { DeferredPromise, RunOnceScheduler } from '../../../../../../base/common/async.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { mixin } from '../../../../../../base/common/objects.js';
import { autorun, derived, derivedOpts, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { EditorExtensionsRegistry } from '../../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOptions } from '../../../../../../editor/common/config/editorOptions.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { isLocation } from '../../../../../../editor/common/languages.js';
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
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { registerAndCreateHistoryNavigationContext } from '../../../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { observableMemento } from '../../../../../../platform/observable/common/observableMemento.js';
import { bindContextKey } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ISharedWebContentExtractorService } from '../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ISCMService } from '../../../../scm/common/scm.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../../../../codeEditor/browser/simpleEditorOptions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatRequestVariableSet, isElementVariableEntry, isImageVariableEntry, isNotebookOutputVariableEntry, isPasteVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isSCMHistoryItemChangeRangeVariableEntry, isSCMHistoryItemChangeVariableEntry, isSCMHistoryItemVariableEntry, isStringVariableEntry, MAX_IMAGES_PER_REQUEST } from '../../../common/attachments/chatVariableEntries.js';
import { ChatMode, getModeNameForTelemetry, IChatModeService } from '../../../common/chatModes.js';
import { IChatSessionsService, isIChatSessionFileChange2, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel } from '../../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';
import { filterModelsForSession, findDefaultModel, hasModelsTargetingSession, isModelValidForSession, mergeModelsWithCache, resolveModelFromSyncState, shouldResetModelToDefault, shouldResetOnModelListChange, shouldRestoreLateArrivingModel, shouldRestorePersistedModel } from './chatModelSelectionLogic.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { isResponseVM } from '../../../common/model/chatViewModel.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { ChatHistoryNavigator } from '../../../common/widget/chatWidgetHistoryService.js';
import { ChatSessionPrimaryPickerAction, ChatSubmitAction, OpenDelegationPickerAction, OpenModelPickerAction, OpenModePickerAction, OpenPermissionPickerAction, OpenSessionTargetPickerAction, OpenWorkspacePickerAction } from '../../actions/chatExecuteActions.js';
import { AgentSessionProviders, getAgentSessionProvider } from '../../agentSessions/agentSessions.js';
import { IAgentSessionsService } from '../../agentSessions/agentSessionsService.js';
import { ChatAttachmentModel } from '../../attachments/chatAttachmentModel.js';
import { IChatAttachmentWidgetRegistry } from '../../attachments/chatAttachmentWidgetRegistry.js';
import { DefaultChatAttachmentWidget, ElementChatAttachmentWidget, FileAttachmentWidget, ImageAttachmentWidget, NotebookCellOutputChatAttachmentWidget, PasteAttachmentWidget, PromptFileAttachmentWidget, PromptTextAttachmentWidget, SCMHistoryItemAttachmentWidget, SCMHistoryItemChangeAttachmentWidget, SCMHistoryItemChangeRangeAttachmentWidget, TerminalCommandAttachmentWidget, ToolSetOrToolItemAttachmentWidget } from '../../attachments/chatAttachmentWidgets.js';
import { ChatImplicitContexts } from '../../attachments/chatImplicitContext.js';
import { ImplicitContextAttachmentWidget } from '../../attachments/implicitContextAttachment.js';
import { isIChatResourceViewContext, isIChatViewViewContext } from '../../chat.js';
import { ChatEditingShowChangesAction, ViewAllSessionChangesAction, ViewPreviousEditsAction } from '../../chatEditing/chatEditingActions.js';
import { resizeImage } from '../../chatImageUtils.js';
import { ChatSessionPickerActionItem } from '../../chatSessions/chatSessionPickerActionItem.js';
import { IChatContextService } from '../../contextContrib/chatContextService.js';
import { ChatQuestionCarouselPart } from '../chatContentParts/chatQuestionCarouselPart.js';
import { CollapsibleListPool } from '../chatContentParts/chatReferencesContentPart.js';
import { ChatTodoListWidget } from '../chatContentParts/chatTodoListWidget.js';
import { ChatArtifactsWidget } from '../chatArtifactsWidget.js';
import { ChatDragAndDrop } from '../chatDragAndDrop.js';
import { ChatFollowups } from './chatFollowups.js';
import { ChatInputPartWidgetController } from './chatInputPartWidgets.js';
import { ChatSelectedTools } from './chatSelectedTools.js';
import { DelegationSessionPickerActionItem } from './delegationSessionPickerActionItem.js';
import { ModePickerActionItem } from './modePickerActionItem.js';
import { PermissionPickerActionItem } from './permissionPickerActionItem.js';
import { SessionTypePickerActionItem } from './sessionTargetPickerActionItem.js';
import { WorkspacePickerActionItem } from './workspacePickerActionItem.js';
import { ChatContextUsageWidget } from '../../widgetHosts/viewPane/chatContextUsageWidget.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';
import { EnhancedModelPickerActionItem } from './modelPickerActionItem2.js';
import { findLast } from '../../../../../../base/common/arraysFind.js';
import { ConfigureToolsAction } from '../../actions/chatToolActions.js';
const $ = dom.$;
const INPUT_EDITOR_MAX_HEIGHT = 250;
const INPUT_EDITOR_LINE_HEIGHT = 20;
const INPUT_EDITOR_PADDING = { compact: { top: 2, bottom: 2 }, default: { top: 12, bottom: 12 } };
const CachedLanguageModelsKey = 'chat.cachedLanguageModels.v2';
const CHAT_INPUT_PICKER_COLLAPSE_WIDTH = 320;
export var ChatWidgetLocation;
(function (ChatWidgetLocation) {
    ChatWidgetLocation["SidebarLeft"] = "sidebarLeft";
    ChatWidgetLocation["SidebarRight"] = "sidebarRight";
    ChatWidgetLocation["Panel"] = "panel";
    ChatWidgetLocation["Editor"] = "editor";
})(ChatWidgetLocation || (ChatWidgetLocation = {}));
const emptyInputState = observableMemento({
    defaultValue: undefined,
    key: 'chat.untitledInputState',
    toStorage: JSON.stringify,
    fromStorage(value) {
        const obj = JSON.parse(value);
        if (obj.selectedModel && !obj.selectedModel.metadata.isDefaultForLocation) {
            const oldIsDefault = obj.selectedModel.metadata.isDefault;
            const isDefaultForLocation = { [ChatAgentLocation.Chat]: Boolean(oldIsDefault) };
            mixin(obj.selectedModel.metadata, { isDefaultForLocation: isDefaultForLocation });
            delete obj.selectedModel.metadata.isDefault;
        }
        return obj;
    },
});
let ChatInputPart = class ChatInputPart extends Disposable {
    static { ChatInputPart_1 = this; }
    static { this._counter = 0; }
    get attachmentModel() {
        return this._attachmentModel;
    }
    getAttachedContext() {
        const contextArr = new ChatRequestVariableSet();
        contextArr.add(...this.attachmentModel.attachments, ...this.chatContextService.getWorkspaceContextItems());
        return contextArr;
    }
    getAttachedAndImplicitContext() {
        const contextArr = this.getAttachedContext();
        if (this.implicitContext) {
            const implicitChatVariables = this.implicitContext.enabledBaseEntries(this.configurationService.getValue('chat.implicitContext.suggestedContext'));
            contextArr.add(...implicitChatVariables);
        }
        return contextArr;
    }
    get implicitContext() {
        return this._implicitContext;
    }
    get inputContainerElement() {
        return this.inputContainer;
    }
    get gettingStartedTipContainerElement() {
        return this.chatGettingStartedTipContainer;
    }
    get inputEditor() {
        return this._inputEditor;
    }
    get currentLanguageModel() {
        return this._currentLanguageModel.get()?.identifier;
    }
    get selectedLanguageModel() {
        return this._currentLanguageModel;
    }
    get currentModeKind() {
        const mode = this._currentModeObservable.get();
        return mode.kind === ChatModeKind.Agent && !this.agentService.hasToolsAgent ?
            ChatModeKind.Edit :
            mode.kind;
    }
    get currentModeObs() {
        return this._currentModeObservable;
    }
    get currentPermissionLevelObs() {
        return this._currentPermissionLevel;
    }
    get currentModeInfo() {
        const mode = this._currentModeObservable.get();
        const modeId = mode.isBuiltin ? this.currentModeKind : 'custom';
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
    get selectedElements() {
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
    /**
     * The number of working set entries that the user actually wanted to attach.
     * This is less than or equal to {@link ChatInputPart.chatEditWorkingSetFiles}.
     */
    get attemptedWorkingSetEntriesCount() {
        return this._attemptedWorkingSetEntriesCount;
    }
    /**
     * Gets the pending delegation target if one is set.
     * This is used when the user changes the session target picker to a different provider
     * but hasn't submitted yet, so the delegation will happen on submit.
     */
    get pendingDelegationTarget() {
        return this._pendingDelegationTarget;
    }
    constructor(
    // private readonly editorOptions: ChatEditorOptions, // TODO this should be used
    location, options, styles, inline, modelService, instantiationService, contextKeyService, configurationService, keybindingService, accessibilityService, languageModelsService, logService, fileService, editorService, themeService, textModelResolverService, storageService, agentService, sharedWebExtracterService, entitlementService, chatModeService, toolService, chatSessionsService, chatContextService, agentSessionsService, workspaceContextService, scmService, layoutService, viewDescriptorService, _chatAttachmentWidgetRegistry) {
        super();
        this.location = location;
        this.options = options;
        this.inline = inline;
        this.modelService = modelService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.configurationService = configurationService;
        this.keybindingService = keybindingService;
        this.accessibilityService = accessibilityService;
        this.languageModelsService = languageModelsService;
        this.logService = logService;
        this.fileService = fileService;
        this.editorService = editorService;
        this.themeService = themeService;
        this.textModelResolverService = textModelResolverService;
        this.storageService = storageService;
        this.agentService = agentService;
        this.sharedWebExtracterService = sharedWebExtracterService;
        this.entitlementService = entitlementService;
        this.chatModeService = chatModeService;
        this.toolService = toolService;
        this.chatSessionsService = chatSessionsService;
        this.chatContextService = chatContextService;
        this.agentSessionsService = agentSessionsService;
        this.workspaceContextService = workspaceContextService;
        this.scmService = scmService;
        this.layoutService = layoutService;
        this.viewDescriptorService = viewDescriptorService;
        this._chatAttachmentWidgetRegistry = _chatAttachmentWidgetRegistry;
        this._workingSetCollapsed = observableValue('chatInputPart.workingSetCollapsed', true);
        this._stableInputPartWidth = observableValue('chatInputPart.stableInputPartWidth', 0);
        this._chatInputTodoListWidget = this._register(new MutableDisposable());
        this._chatArtifactsWidget = this._register(new MutableDisposable());
        this._chatQuestionCarouselWidgets = this._register(new DisposableMap());
        this._questionCarouselResponseIds = new Map();
        this._questionCarouselSessionResources = new Map();
        this._chatEditingTodosDisposables = this._register(new DisposableStore());
        this._onDidLoadInputState = this._register(new Emitter());
        this.onDidLoadInputState = this._onDidLoadInputState.event;
        this._toolbarRelayoutScheduler = this._register(new RunOnceScheduler(() => {
            if (typeof this.cachedWidth === 'number') {
                this.layout(this.cachedWidth);
            }
        }, 0));
        this._onDidFocus = this._register(new Emitter());
        this.onDidFocus = this._onDidFocus.event;
        this._onDidBlur = this._register(new Emitter());
        this.onDidBlur = this._onDidBlur.event;
        this._onDidChangeContext = this._register(new Emitter());
        this.onDidChangeContext = this._onDidChangeContext.event;
        this._onDidAcceptFollowup = this._register(new Emitter());
        this.onDidAcceptFollowup = this._onDidAcceptFollowup.event;
        this._onDidClickOverlay = this._register(new Emitter());
        this.onDidClickOverlay = this._onDidClickOverlay.event;
        this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
        this._indexOfLastOpenedContext = -1;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.inputEditorHeight = 0;
        this.followupsDisposables = this._register(new DisposableStore());
        this.overlayClickListener = this._register(new MutableDisposable());
        this.attachedContextDisposables = this._register(new MutableDisposable());
        this._widgetController = this._register(new MutableDisposable());
        this._contextUsageDisposables = this._register(new MutableDisposable());
        this.height = observableValue(this, 0);
        this._forceVisibleScrollbarUntilAccept = false;
        // Disposables for model observation
        this._modelSyncDisposables = this._register(new DisposableStore());
        // Flag to prevent circular updates between view and model
        this._isSyncingToOrFromInputModel = false;
        this.chatSessionPickerWidgets = this._register(new DisposableMap());
        this._waitForPersistedLanguageModel = this._register(new MutableDisposable());
        this._chatSessionOptionEmitters = this._register(new DisposableMap());
        /**
         * Map of option group ID to its context key.
         * Keys follow the pattern `chatSessionOption.<groupId>` and hold the currently selected option item ID.
         */
        this._optionContextKeys = new Map();
        this._currentLanguageModel = observableValue('_currentLanguageModel', undefined);
        this._onDidChangeCurrentChatMode = this._register(new Emitter());
        this.onDidChangeCurrentChatMode = this._onDidChangeCurrentChatMode.event;
        this.inputUri = URI.parse(`${Schemas.vscodeChatInput}:input-${ChatInputPart_1._counter++}`);
        this._workingSetLinesAddedSpan = new Lazy(() => dom.$('.working-set-lines-added'));
        this._workingSetLinesRemovedSpan = new Lazy(() => dom.$('.working-set-lines-removed'));
        this._chatEditsActionsDisposables = this._register(new DisposableStore());
        this._chatEditsDisposables = this._register(new DisposableStore());
        this._renderingChatEdits = this._register(new MutableDisposable());
        this._attemptedWorkingSetEntriesCount = 0;
        this._chatSessionIsEmpty = false;
        this._pendingDelegationTarget = undefined;
        this._currentSessionType = undefined;
        // Initialize debounced text sync scheduler
        this._syncTextDebounced = this._register(new RunOnceScheduler(() => this._syncInputStateToModel(), 150));
        this._emptyInputState = this._register(emptyInputState(1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */, this.storageService));
        this._contextResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event }));
        this._currentModeObservable = observableValue('currentMode', this.options.defaultMode ?? ChatMode.Agent);
        this._currentPermissionLevel = observableValue('permissionLevel', ChatPermissionLevel.Default);
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
            const newOptions = {};
            if (e.affectsConfiguration("accessibility.verbosity.panelChat" /* AccessibilityVerbositySettingId.Chat */)) {
                newOptions.ariaLabel = this._getAriaLabel();
            }
            if (e.affectsConfiguration('editor.wordSegmenterLocales')) {
                newOptions.wordSegmenterLocales = this.configurationService.getValue('editor.wordSegmenterLocales');
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
        this._chatEditsListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, MenuId.ChatEditingWidgetModifiedFilesToolbar, { verticalScrollMode: 3 /* ScrollbarVisibility.Visible */ }));
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
    setImplicitContextEnablement() {
        if (this.implicitContext && this.configurationService.getValue('chat.implicitContext.suggestedContext')) {
            this.implicitContext.setEnabled(this._currentModeObservable.get().name.get().toLowerCase() === 'ask');
        }
    }
    setIsWithinEditSession(inInsideDiff, isFilePartOfEditSession) {
        this.withinEditSessionKey.set(inInsideDiff);
        this.filePartOfEditSessionKey.set(isFilePartOfEditSession);
    }
    getSelectedModelStorageKey() {
        const sessionType = this._currentSessionType;
        if (sessionType && this.hasModelsTargetingSessionType()) {
            return `chat.currentLanguageModel.${this.location}.${sessionType}`;
        }
        return `chat.currentLanguageModel.${this.location}`;
    }
    getSelectedModelIsDefaultStorageKey() {
        const sessionType = this._currentSessionType;
        if (sessionType && this.hasModelsTargetingSessionType()) {
            return `chat.currentLanguageModel.${this.location}.${sessionType}.isDefault`;
        }
        return `chat.currentLanguageModel.${this.location}.isDefault`;
    }
    initSelectedModel() {
        const persistedSelection = this.storageService.get(this.getSelectedModelStorageKey(), -1 /* StorageScope.APPLICATION */);
        const persistedAsDefault = this.storageService.getBoolean(this.getSelectedModelIsDefaultStorageKey(), -1 /* StorageScope.APPLICATION */, true);
        if (persistedSelection) {
            const result = shouldRestorePersistedModel(persistedSelection, persistedAsDefault, this.getModels(), this.location);
            if (result.shouldRestore && result.model) {
                this.setCurrentLanguageModel(result.model);
                this.checkModelSupported();
            }
            else if (!result.model) {
                this._waitForPersistedLanguageModel.value = this.languageModelsService.onDidChangeLanguageModels(e => {
                    const persistedModel = this.languageModelsService.lookupLanguageModel(persistedSelection);
                    if (persistedModel) {
                        this._waitForPersistedLanguageModel.clear();
                        const lateModel = { metadata: persistedModel, identifier: persistedSelection };
                        if (shouldRestoreLateArrivingModel(persistedSelection, persistedAsDefault, lateModel, this.location)) {
                            this.setCurrentLanguageModel(lateModel);
                            this.checkModelSupported();
                        }
                    }
                    else {
                        this.setCurrentLanguageModelToDefault();
                    }
                });
            }
        }
        this._register(this._onDidChangeCurrentChatMode.event(() => {
            this.checkModelSupported();
        }));
    }
    setEditing(enabled, editingSentRequest) {
        this.currentlyEditingInputKey?.set(enabled);
        this.editingSentRequestKey?.set(editingSentRequest);
    }
    switchModel(modelMetadata) {
        const models = this.getModels();
        const model = models.find(m => m.metadata.vendor === modelMetadata.vendor && m.metadata.id === modelMetadata.id && m.metadata.family === modelMetadata.family);
        if (model) {
            this.setCurrentLanguageModel(model);
        }
    }
    switchModelByQualifiedName(qualifiedModelNames) {
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
    switchToNextModel() {
        const models = this.getModels();
        if (models.length > 0) {
            const currentIndex = models.findIndex(model => model.identifier === this._currentLanguageModel.get()?.identifier);
            const nextIndex = (currentIndex + 1) % models.length;
            this.setCurrentLanguageModel(models[nextIndex]);
        }
    }
    openModelPicker() {
        this.modelWidget?.show();
    }
    openModePicker() {
        this.modeWidget?.show();
    }
    openPermissionPicker() {
        this.permissionWidget?.show();
    }
    setPermissionLevel(level) {
        this._currentPermissionLevel.set(level, undefined);
        this.permissionLevelKey.set(level);
        this.permissionWidget?.refresh();
        this._syncInputStateToModel();
    }
    openSessionTargetPicker() {
        this.sessionTargetWidget?.show();
    }
    openDelegationPicker() {
        this.delegationWidget?.show();
    }
    openChatSessionPicker() {
        // Open the first available picker widget
        const firstWidget = this.chatSessionPickerWidgets?.values()?.next().value;
        firstWidget?.show();
    }
    /**
     * Create picker widgets for all option groups available for the current session type.
     */
    createChatSessionPickerWidgets(action, pickerOptions) {
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
        const widgets = [];
        for (const optionGroup of visibleOptionGroups) {
            const initialItem = this.getCurrentOptionForGroup(optionGroup.id);
            const initialState = { group: optionGroup, item: initialItem };
            // Create delegate for this option group
            const itemDelegate = {
                getCurrentOption: () => this.getCurrentOptionForGroup(optionGroup.id),
                onDidChangeOption: this.getOrCreateOptionEmitter(optionGroup.id).event,
                setOption: (option) => {
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
     */
    setInputModel(model, chatSessionIsEmpty) {
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
    _setEmptyModelState() {
        if (this.entitlementService.anonymous) {
            // Be deterministic for anonymous users to support
            // agentic flows with default model.
            this.setChatMode(ChatModeKind.Agent, false);
            this.checkModelSupported();
            return;
        }
        const rawDefaultMode = this.configurationService.getValue(ChatConfiguration.DefaultNewSessionMode);
        if (typeof rawDefaultMode === 'string') {
            const defaultMode = rawDefaultMode.trim();
            if (defaultMode) {
                // Custom modes are loaded asynchronously, so they may not be available yet
                // at session initialization time. Built-in modes (ask, edit, agent) are always available.
                const defaultModeLower = defaultMode.toLowerCase();
                const resolved = this.chatModeService.findModeById(defaultMode)
                    ?? this.chatModeService.findModeByName(defaultMode)
                    ?? this.chatModeService.getModes().custom.find(m => m.name.get().toLowerCase() === defaultModeLower);
                if (resolved) {
                    this.logService.trace(`[ChatInputPart] Applying default mode from setting: ${defaultMode} -> ${resolved.id}`);
                    this.setChatMode(resolved.id, false);
                    this.checkModelSupported();
                }
                else {
                    this.logService.trace(`[ChatInputPart] Default mode '${defaultMode}' not found in available modes`);
                }
            }
        }
    }
    /**
     * Sync from model to view (when model state changes)
     */
    _syncFromModel(state) {
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
                const sessionType = this.getCurrentSessionType();
                const syncResult = resolveModelFromSyncState(state.selectedModel, this._currentLanguageModel.get(), allModels, sessionType, {
                    location: this.location,
                    currentModeKind: this.currentModeKind,
                    isInlineChatV2Enabled: !!this.configurationService.getValue("inlineChat.enableV2" /* InlineChatConfigKeys.EnableV2 */),
                    sessionType,
                });
                if (syncResult.action === 'apply') {
                    this.setCurrentLanguageModel(state.selectedModel);
                }
                else if (syncResult.action === 'default') {
                    this.setCurrentLanguageModelToDefault();
                }
            }
            // Sync attachments
            const currentAttachments = this._attachmentModel.attachments;
            if (!state) {
                this._attachmentModel.clear();
            }
            else if (!arraysEqual(currentAttachments, state.attachments)) {
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
            if (!this.configurationService.getValue(ChatConfiguration.GlobalAutoApprove)) {
                const targetLevel = state?.permissionLevel ?? ChatPermissionLevel.Default;
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
        }
        finally {
            this._isSyncingToOrFromInputModel = false;
        }
    }
    /**
     * Sync current input state to the input model
     */
    _syncInputStateToModel() {
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
    setCurrentLanguageModel(model) {
        this._currentLanguageModel.set(model, undefined);
        if (this.cachedWidth) {
            // For quick chat and editor chat, relayout because the input may need to shrink to accomodate the model name
            this.layout(this.cachedWidth);
        }
        // Store as global user preference (session-specific state is in the model's inputModel)
        this.storageService.store(this.getSelectedModelStorageKey(), model.identifier, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        this.storageService.store(this.getSelectedModelIsDefaultStorageKey(), !!model.metadata.isDefaultForLocation[this.location], -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        // Sync to model
        this._syncInputStateToModel();
    }
    checkModelSupported() {
        const lm = this._currentLanguageModel.get();
        const allModels = this.getAllMergedModels();
        if (shouldResetModelToDefault(lm, this.getModels(), {
            location: this.location,
            currentModeKind: this.currentModeKind,
            isInlineChatV2Enabled: !!this.configurationService.getValue("inlineChat.enableV2" /* InlineChatConfigKeys.EnableV2 */),
            sessionType: this.getCurrentSessionType(),
        }, allModels)) {
            this.setCurrentLanguageModelToDefault();
        }
    }
    /**
     * By ID- prefer this method
     */
    setChatMode(mode, storeSelection = true) {
        if (!this.options.supportsChangingModes) {
            return;
        }
        const mode2 = this.chatModeService.findModeById(mode) ??
            this.chatModeService.findModeByName(mode) ??
            this.chatModeService.findModeById(ChatModeKind.Agent) ??
            ChatMode.Ask;
        this.setChatMode2(mode2, storeSelection);
    }
    setChatMode2(mode, storeSelection = true) {
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
    getAllMergedModels() {
        const cachedModels = this.storageService.getObject(CachedLanguageModelsKey, -1 /* StorageScope.APPLICATION */, []);
        const liveModels = this.languageModelsService.getLanguageModelIds()
            .map(modelId => ({ identifier: modelId, metadata: this.languageModelsService.lookupLanguageModel(modelId) }));
        const contributedVendors = new Set(this.languageModelsService.getVendors().map(v => v.vendor));
        const models = mergeModelsWithCache(liveModels, cachedModels, contributedVendors);
        if (liveModels.length > 0) {
            this.storageService.store(CachedLanguageModelsKey, models, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        return models;
    }
    getModels() {
        const models = this.getAllMergedModels();
        models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
        return filterModelsForSession(models, this.getCurrentSessionType(), this.currentModeKind, this.location, !!this.configurationService.getValue("inlineChat.enableV2" /* InlineChatConfigKeys.EnableV2 */));
    }
    /**
     * Get the chat session type for the current session, if any.
     */
    getCurrentSessionType() {
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
    hasModelsTargetingSessionType() {
        return hasModelsTargetingSession(this.getAllMergedModels(), this.getCurrentSessionType());
    }
    isModelValidForCurrentSession(model) {
        return isModelValidForSession(model, this.getAllMergedModels(), this.getCurrentSessionType());
    }
    /**
     * Validate that the current model belongs to the current session's pool.
     * Called when switching sessions to prevent cross-contamination.
     */
    checkModelInSessionPool() {
        const lm = this._currentLanguageModel.get();
        if (lm && !this.isModelValidForCurrentSession(lm)) {
            this.setCurrentLanguageModelToDefault();
        }
    }
    /**
     * Pre-select the model in the model picker based on the `modelId` from the
     * last request in the current session's history. This ensures that when a
     * contributed chat session is reopened, the model picker shows the model
     * that was last used - providing continuity.
     */
    preselectModelFromSessionHistory() {
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
            const models = this.getModels();
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
    setCurrentLanguageModelToDefault() {
        const allModels = this.getModels();
        const defaultModel = findDefaultModel(allModels, this.location);
        if (defaultModel) {
            this.setCurrentLanguageModel(defaultModel);
        }
    }
    /**
     * Get the current input state for history
     */
    getCurrentInputState() {
        const mode = this._currentModeObservable.get();
        const state = {
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
    _getAriaLabel() {
        const verbose = this.configurationService.getValue("accessibility.verbosity.panelChat" /* AccessibilityVerbositySettingId.Chat */);
        let kbLabel;
        if (verbose) {
            kbLabel = this.keybindingService.lookupKeybinding("editor.action.accessibilityHelp" /* AccessibilityCommandId.OpenAccessibilityHelp */)?.getLabel();
        }
        const mode = this._currentModeObservable.get();
        // Include model information if available
        const modelName = this._currentLanguageModel.get()?.metadata.name;
        const modelInfo = modelName ? localize('chatInput.model', ", {0}. ", modelName) : '';
        let modeLabel = '';
        if (!mode.isBuiltin) {
            const mode = this.currentModeObs.get();
            modeLabel = localize('chatInput.mode.custom', "({0}), {1}", mode.label.get(), mode.description.get());
        }
        else {
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
        }
        else {
            return localize('chatInput.accessibilityHelp', "Chat Input {0}{1}.", modeLabel, modelInfo);
        }
    }
    validateCurrentChatMode() {
        const currentMode = this._currentModeObservable.get();
        const validMode = this.chatModeService.findModeById(currentMode.id);
        const isAgentModeEnabled = this.configurationService.getValue(ChatConfiguration.AgentEnabled);
        if (!validMode) {
            this.setChatMode(isAgentModeEnabled ? ChatModeKind.Agent : ChatModeKind.Ask);
            return;
        }
        if (currentMode.kind === ChatModeKind.Agent && !isAgentModeEnabled) {
            this.setChatMode(ChatModeKind.Ask);
            return;
        }
    }
    logInputHistory() {
        const historyStr = this.history.values.map(entry => JSON.stringify(entry)).join('\n');
        this.logService.info(`[${this.location}] Chat input history:`, historyStr);
    }
    setVisible(visible) {
        this._onDidChangeVisibility.fire(visible);
    }
    /** If consumers are busy generating the chat input, returns the promise resolved when they finish */
    get generating() {
        return this._generating?.defer.p;
    }
    /** Disables the input submissions buttons until the disposable is disposed. */
    startGenerating() {
        this.logService.trace('ChatWidget#startGenerating');
        if (this._generating) {
            this._generating.rc++;
        }
        else {
            this._generating = { rc: 1, defer: new DeferredPromise() };
        }
        return toDisposable(() => {
            this.logService.trace('ChatWidget#doneGenerating');
            if (this._generating && !--this._generating.rc) {
                this._generating.defer.complete();
                this._generating = undefined;
            }
        });
    }
    get element() {
        return this.container;
    }
    async showPreviousValue() {
        if (this.history.isAtStart()) {
            return;
        }
        const state = this.getCurrentInputState();
        if (state.inputText || state.attachments.length) {
            this.history.overlay(state);
        }
        this.navigateHistory(true);
    }
    async showNextValue() {
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
    async restoreAttachments(attachments) {
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
                    }
                    catch (err) {
                        this.logService.error('Failed to fetch and reference.', err);
                        return undefined;
                    }
                }
                return attachment;
            }))).filter(isDefined);
        }
        this._attachmentModel.clearAndSetContext(...restored);
    }
    async navigateHistory(previous) {
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
        }
        else {
            this._inputEditor.setPosition(getLastPosition(model));
        }
    }
    setValue(value, transient) {
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
    hasFocus() {
        return this._inputEditor.hasWidgetFocus();
    }
    focusTodoList() {
        return this._chatInputTodoListWidget.value?.focus() ?? false;
    }
    isTodoListFocused() {
        return this._chatInputTodoListWidget.value?.hasFocus() ?? false;
    }
    hasVisibleTodos() {
        return this._chatInputTodoListWidget.value?.hasTodos() ?? false;
    }
    /**
     * Reset the input and update history.
     * @param userQuery If provided, this will be added to the history. Followups and programmatic queries should not be passed.
     */
    async acceptInput(isUserQuery) {
        if (isUserQuery) {
            const userQuery = this.getCurrentInputState();
            this.history.append(this._getFilteredEntry(userQuery));
        }
        this.resetScrollbarVisibilityAfterAccept();
        if (this._chatSessionIsEmpty) {
            this._chatSessionIsEmpty = false;
            this._emptyInputState.set(undefined, undefined);
        }
        // Clear attached context, fire event to clear input state, and clear the input editor
        this.attachmentModel.clear();
        this._onDidLoadInputState.fire();
        if (this.accessibilityService.isScreenReaderOptimized() && isMacintosh) {
            this._acceptInputForVoiceover();
        }
        else {
            this._inputEditor.focus();
            this._inputEditor.setValue('');
        }
    }
    validateAgentMode() {
        if (!this.agentService.hasToolsAgent && this._currentModeObservable.get().kind === ChatModeKind.Agent) {
            this.setChatMode(ChatModeKind.Edit);
        }
    }
    // A function that filters out specifically the `value` property of the attachment.
    _getFilteredEntry(inputState) {
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
    _acceptInputForVoiceover() {
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
    _handleAttachedContextChange() {
        this._hasFileAttachmentContextKey.set(Boolean(this._attachmentModel.attachments.find(a => a.kind === 'file')));
        this.renderAttachedContext();
    }
    getOrCreateOptionEmitter(optionGroupId) {
        let emitter = this._chatSessionOptionEmitters.get(optionGroupId);
        if (!emitter) {
            emitter = new Emitter();
            this._chatSessionOptionEmitters.set(optionGroupId, emitter);
        }
        return emitter;
    }
    /**
     * Get or create a context key for an option group.
     * Context keys follow the pattern `chatSessionOption.<groupId>`.
     */
    getOrCreateOptionContextKey(optionGroupId) {
        if (!this._scopedContextKeyService) {
            return undefined;
        }
        let contextKey = this._optionContextKeys.get(optionGroupId);
        if (!contextKey) {
            const rawKey = new RawContextKey(`chatSessionOption.${optionGroupId}`, '');
            contextKey = rawKey.bindTo(this._scopedContextKeyService);
            this._optionContextKeys.set(optionGroupId, contextKey);
        }
        return contextKey;
    }
    /**
     * Update the context key for an option group with the current selection.
     * This enables `when` expressions on other option groups to react to changes.
     */
    updateOptionContextKey(optionGroupId, optionItemId) {
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
    evaluateOptionGroupVisibility(optionGroup) {
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
    getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource) {
        const customAgentTarget = sessionResource && this.chatSessionsService.getCustomAgentTargetForSessionType(getChatSessionType(sessionResource));
        this.chatSessionHasCustomAgentTarget.set(customAgentTarget !== Target.Undefined);
        // Check if this session type requires custom models
        const requiresCustomModels = sessionResource && this.chatSessionsService.requiresCustomModelsForSessionType(getChatSessionType(sessionResource));
        this.chatSessionHasTargetedModels.set(!!requiresCustomModels);
        const visibleOptionGroups = this.getVisibleOptionGroups(sessionResource);
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
    getCurrentSessionResource() {
        return this._widget?.viewModel?.model.sessionResource;
    }
    areAllOptionsValid(sessionResource, visibleOptionGroups) {
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
    getAllOptionsGroups(sessionResource) {
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
    getVisibleOptionGroups(sessionResource) {
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
        // Filter to visible groups (has items AND passes `when` clause AND session has option configured)
        const visibleGroups = new Map();
        for (const optionGroup of allOptionGroups) {
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
     * Refresh all registered option groups for the current chat session.
     * Fires events for each option group with their current selection.
     */
    refreshChatSessionPickers() {
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
        const needsRecreation = currentWidgetGroupIds.size !== visibleOptionGroups.length ||
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
                        const item = optionGroup.items.find((m) => m.id === currentOptionId);
                        // If currentOption is an object (not a string ID), it represents a complete option item and should be used directly.
                        // Otherwise, if it's a string ID, look up the corresponding item and use that.
                        if (item && typeof currentOption === 'string') {
                            this.getOrCreateOptionEmitter(optionGroupId).fire(item);
                        }
                        else if (typeof currentOption !== 'string') {
                            this.getOrCreateOptionEmitter(optionGroupId).fire(currentOption);
                        }
                    }
                }
            }
        }
    }
    hideAllSessionPickerWidgets() {
        if (this.chatSessionPickerContainer) {
            this.chatSessionPickerContainer.style.display = 'none';
        }
    }
    /**
     * Get the current option for a specific option group.
     * Returns undefined if the session doesn't have this option configured.
     */
    getCurrentOptionForGroup(optionGroupId) {
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
        }
        else {
            return currentOptionValue;
        }
    }
    hasWorkspaceScmRepository() {
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
    getEffectiveSessionType(sessionResource) {
        return this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.() ?? (sessionResource ? getChatSessionType(sessionResource) : undefined);
    }
    /**
     * Updates the agentSessionType context key based on delegate or actual session.
     */
    updateAgentSessionTypeContextKey() {
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
    updateWidgetLockStateFromSessionType(sessionType) {
        if (sessionType === localChatSessionType) {
            this._widget?.unlockFromCodingAgent();
            return;
        }
        const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
        if (contribution) {
            this._widget?.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type);
        }
        else {
            this._widget?.unlockFromCodingAgent();
        }
    }
    /**
     * Updates the widget controller based on session type.
     */
    tryUpdateWidgetController() {
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
     * Shows the context usage details popup and focuses it.
     * @returns Whether the details were successfully shown.
     */
    showContextUsageDetails() {
        return this.contextUsageWidget?.showDetails() ?? false;
    }
    /**
     * Updates the context usage widget based on the current model.
     */
    updateContextUsageWidget() {
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
    render(container, initialValue, widget) {
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
        this._register(widget.onDidChangeViewModel((e) => {
            this._pendingDelegationTarget = undefined;
            // Update agentSessionType when view model changes
            this.updateAgentSessionTypeContextKey();
            this.refreshChatSessionPickers();
            this.tryUpdateWidgetController();
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
            // Track the current session type and re-initialize model selection
            // when the session type changes (different session types may have
            // different model pools via targetChatSessionType).
            const newSessionType = this.getCurrentSessionType();
            if (e.currentSessionResource && newSessionType !== this._currentSessionType) {
                this._currentSessionType = newSessionType;
                this.initSelectedModel();
                this.checkModelInSessionPool();
            }
            // For contributed sessions with history, pre-select the model
            // from the last request so the user resumes with the same model.
            this.preselectModelFromSessionHistory();
        }));
        let elements;
        if (this.options.renderStyle === 'compact') {
            elements = dom.h('.interactive-input-part', [
                dom.h('.interactive-input-and-edit-session', [
                    dom.h('.chat-question-carousel-widget-container@chatQuestionCarouselContainer'),
                    dom.h('.chat-input-widgets-container@chatInputWidgetsContainer'),
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
        }
        else {
            elements = dom.h('.interactive-input-part', [
                dom.h('.chat-question-carousel-widget-container@chatQuestionCarouselContainer'),
                dom.h('.interactive-input-followups@followupsContainer'),
                dom.h('.chat-input-widgets-container@chatInputWidgetsContainer'),
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
        this.chatInputWidgetsContainer = elements.chatInputWidgetsContainer;
        this.contextUsageWidgetContainer = elements.contextUsageWidgetContainer;
        if (this.options.isSessionsWindow || this.options.renderStyle === 'compact') {
            toolbarsContainer.prepend(this.contextUsageWidgetContainer);
        }
        // Context usage widget — will be positioned in the toolbar after toolbars are created
        this.contextUsageWidget = this._register(this.instantiationService.createInstance(ChatContextUsageWidget));
        this.contextUsageWidgetContainer.appendChild(this.contextUsageWidget.domNode);
        if (this.options.enableImplicitContext && !this._implicitContext) {
            this._implicitContext = this._register(this.instantiationService.createInstance(ChatImplicitContexts));
            this.setImplicitContextEnablement();
            this._register(this._implicitContext.onDidChangeValue(() => {
                this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
                this._handleAttachedContextChange();
            }));
        }
        else if (!this.options.enableImplicitContext && this._implicitContext) {
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
        this.editingSentRequestKey = ChatContextKeys.editingRequestType.bindTo(this.contextKeyService);
        const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));
        const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
        this.historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
        this.historyNavigationForewardsEnablement = historyNavigationForwardsEnablement;
        const options = getSimpleEditorOptions(this.configurationService);
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
            if (e.keyCode === 3 /* KeyCode.Enter */ && !hasModifierKeys(e)) {
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
        const { location, isMaximized } = this.getWidgetLocationInfo(widget);
        const pickerOptions = {
            getOverflowAnchor: () => this.inputActionsToolbar.getElement(),
            actionContext: { widget },
            hideChevrons: derived(reader => this._stableInputPartWidth.read(reader) < CHAT_INPUT_PICKER_COLLAPSE_WIDTH),
            hoverPosition: {
                forcePosition: true,
                hoverPosition: location === "sidebarRight" /* ChatWidgetLocation.SidebarRight */ && !isMaximized ? 0 /* HoverPosition.LEFT */ : 1 /* HoverPosition.RIGHT */
            },
        };
        this._register(dom.addStandardDisposableListener(toolbarsContainer, dom.EventType.CLICK, e => this.inputEditor.focus()));
        this._register(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.CLICK, e => this.inputEditor.focus()));
        const shorterChatInputActionIds = new Set([
            OpenModePickerAction.ID,
            ConfigureToolsAction.ID,
        ]);
        this.inputActionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.options.renderInputToolbarBelowInput ? this.attachmentsContainer : toolbarsContainer, MenuId.ChatInput, {
            telemetrySource: this.options.menus.telemetrySource,
            menuOptions: { shouldForwardArgs: true },
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
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
                    const itemDelegate = {
                        currentModel: this._currentLanguageModel,
                        setModel: (model) => {
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
                    return this.modelWidget = this.instantiationService.createInstance(EnhancedModelPickerActionItem, action, itemDelegate, pickerOptions);
                }
                else if (action.id === OpenModePickerAction.ID && action instanceof MenuItemAction) {
                    const delegate = {
                        currentMode: this._currentModeObservable,
                        sessionResource: () => this._widget?.viewModel?.sessionResource,
                        customAgentTarget: () => {
                            const sessionResource = this._widget?.viewModel?.model.sessionResource;
                            return (sessionResource && this.chatSessionsService.getCustomAgentTargetForSessionType(getChatSessionType(sessionResource))) ?? Target.Undefined;
                        },
                    };
                    return this.modeWidget = this.instantiationService.createInstance(ModePickerActionItem, action, delegate, pickerOptions);
                }
                else if ((action.id === OpenSessionTargetPickerAction.ID || action.id === OpenDelegationPickerAction.ID) && action instanceof MenuItemAction) {
                    // Use provided delegate if available, otherwise create default delegate
                    const getActiveSessionType = () => {
                        const sessionResource = this._widget?.viewModel?.sessionResource;
                        // TODO: Remove hardcoded providers from core
                        return sessionResource ? (getAgentSessionProvider(sessionResource) ?? getChatSessionType(sessionResource)) : undefined;
                    };
                    const delegate = this.options.sessionTypePickerDelegate ?? {
                        getActiveSessionProvider: () => {
                            return getActiveSessionType();
                        },
                        getPendingDelegationTarget: () => {
                            return this._pendingDelegationTarget;
                        },
                        setPendingDelegationTarget: (provider) => {
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
                    return this.sessionTargetWidget = this.instantiationService.createInstance(Picker, action, location === "editor" /* ChatWidgetLocation.Editor */ ? 'editor' : 'sidebar', delegate, pickerOptions);
                }
                else if (action.id === OpenWorkspacePickerAction.ID && action instanceof MenuItemAction) {
                    if (this.workspaceContextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ && this.options.workspacePickerDelegate) {
                        return this.instantiationService.createInstance(WorkspacePickerActionItem, action, this.options.workspacePickerDelegate, pickerOptions);
                    }
                    else {
                        return new HiddenActionViewItem(action);
                    }
                }
                else if (action.id === ChatSessionPrimaryPickerAction.ID && action instanceof MenuItemAction) {
                    // Create all pickers and return a container action view item
                    const widgets = this.createChatSessionPickerWidgets(action, pickerOptions);
                    if (widgets.length === 0) {
                        return new HiddenActionViewItem(action);
                    }
                    // Create a container to hold all picker widgets
                    return this.instantiationService.createInstance(ChatSessionPickersContainerActionItem, action, widgets);
                }
                return undefined;
            }
        }));
        this.inputActionsToolbar.getElement().classList.add('chat-input-toolbar');
        this.inputActionsToolbar.context = { widget };
        this._register(this.inputActionsToolbar.onDidChangeMenuItems(() => {
            // Update container reference for the pickers
            const toolbarElement = this.inputActionsToolbar.getElement();
            // eslint-disable-next-line no-restricted-syntax
            const container = toolbarElement.querySelector('.chat-sessionPicker-container');
            this.chatSessionPickerContainer = container;
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
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
        }));
        this.executeToolbar.getElement().classList.add('chat-execute-toolbar');
        this.executeToolbar.context = { widget };
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
            toolbarSide.context = { widget };
        }
        // Secondary toolbar (permissions) — below the input box
        this.secondaryToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.secondaryToolbarContainer, MenuId.ChatInputSecondary, {
            telemetrySource: this.options.menus.telemetrySource,
            menuOptions: { shouldForwardArgs: true },
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            hoverDelegate,
            actionViewItemProvider: (action, options) => {
                if ((action.id === OpenSessionTargetPickerAction.ID || action.id === OpenDelegationPickerAction.ID) && action instanceof MenuItemAction) {
                    const getActiveSessionType = () => {
                        const sessionResource = this._widget?.viewModel?.sessionResource;
                        // TODO: Remove hardcoded providers from core
                        return sessionResource ? (getAgentSessionProvider(sessionResource) ?? getChatSessionType(sessionResource)) : undefined;
                    };
                    const delegate = this.options.sessionTypePickerDelegate ?? {
                        getActiveSessionProvider: () => {
                            return getActiveSessionType();
                        },
                        getPendingDelegationTarget: () => {
                            return this._pendingDelegationTarget;
                        },
                        setPendingDelegationTarget: (provider) => {
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
                    return this.sessionTargetWidget = this.instantiationService.createInstance(Picker, action, location === "editor" /* ChatWidgetLocation.Editor */ ? 'editor' : 'sidebar', delegate, pickerOptions);
                }
                else if (action.id === OpenWorkspacePickerAction.ID && action instanceof MenuItemAction) {
                    if (this.workspaceContextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ && this.options.workspacePickerDelegate) {
                        return this.instantiationService.createInstance(WorkspacePickerActionItem, action, this.options.workspacePickerDelegate, pickerOptions);
                    }
                    else {
                        const empty = new BaseActionViewItem(undefined, action);
                        if (empty.element) {
                            empty.element.style.display = 'none';
                        }
                        return empty;
                    }
                }
                else if (action.id === OpenPermissionPickerAction.ID && action instanceof MenuItemAction) {
                    const delegate = {
                        currentPermissionLevel: this._currentPermissionLevel,
                        setPermissionLevel: (level) => {
                            this.setPermissionLevel(level);
                        },
                    };
                    return this.permissionWidget = this.instantiationService.createInstance(PermissionPickerActionItem, action, delegate, pickerOptions);
                }
                return undefined;
            }
        }));
        this.secondaryToolbar.getElement().classList.add('chat-secondary-input-toolbar');
        this.secondaryToolbar.context = { widget };
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
    toggleChatInputOverlay(editing) {
        this.chatInputOverlay.classList.toggle('disabled', editing);
        if (editing) {
            this.overlayClickListener.value = dom.addStandardDisposableListener(this.chatInputOverlay, dom.EventType.CLICK, e => {
                e.preventDefault();
                e.stopPropagation();
                this._onDidClickOverlay.fire();
            });
        }
        else {
            this.overlayClickListener.clear();
        }
    }
    renderAttachedContext() {
        const container = this.attachedContextContainer;
        const store = new DisposableStore();
        this.attachedContextDisposables.value = store;
        dom.clearNode(container);
        store.add(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.KEY_DOWN, (e) => {
            this.handleAttachmentNavigation(e);
        }));
        const attachments = [...this.attachmentModel.attachments.entries()];
        const hasAttachments = Boolean(attachments.length);
        // Render implicit context (active editor in Ask mode, or selection)
        let hasImplicitContext = false;
        const isSuggestedEnabled = this.configurationService.getValue('chat.implicitContext.suggestedContext');
        const hasVisibleImplicitContext = isSuggestedEnabled
            ? this._implicitContext?.hasValue ?? false
            : this._implicitContext?.values.some(v => v.enabled || v.isSelection) ?? false;
        if (this._implicitContext && hasVisibleImplicitContext) {
            const isAttachmentAlreadyAttached = (targetUri, targetRange, targetHandle) => {
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
            const implicitContextWidget = this.instantiationService.createInstance(ImplicitContextAttachmentWidget, () => this._widget, isAttachmentAlreadyAttached, this._implicitContext, this._contextResourceLabels, this._attachmentModel, container);
            store.add(implicitContextWidget);
            hasImplicitContext = implicitContextWidget.hasRenderedContexts;
        }
        dom.setVisibility(Boolean(this.options.renderInputToolbarBelowInput || hasAttachments || hasImplicitContext), this.attachmentsContainer);
        dom.setVisibility(hasAttachments || hasImplicitContext, this.attachedContextContainer);
        if (!attachments.length) {
            this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
            this._indexOfLastOpenedContext = -1;
        }
        // Mark images that exceed the per-request limit so they render with a warning
        const imageAttachments = attachments.filter(([, a]) => isImageVariableEntry(a));
        if (imageAttachments.length > MAX_IMAGES_PER_REQUEST) {
            const excessCount = imageAttachments.length - MAX_IMAGES_PER_REQUEST;
            for (let i = 0; i < excessCount; i++) {
                const attachment = imageAttachments[i][1];
                if (attachment.omittedState === 0 /* OmittedState.NotOmitted */ || attachment.omittedState === 3 /* OmittedState.ImageLimitExceeded */) {
                    attachment.omittedState = 3 /* OmittedState.ImageLimitExceeded */;
                }
            }
            for (let i = excessCount; i < imageAttachments.length; i++) {
                if (imageAttachments[i][1].omittedState === 3 /* OmittedState.ImageLimitExceeded */) {
                    imageAttachments[i][1].omittedState = 0 /* OmittedState.NotOmitted */;
                }
            }
        }
        else {
            for (const [, a] of imageAttachments) {
                if (a.omittedState === 3 /* OmittedState.ImageLimitExceeded */) {
                    a.omittedState = 0 /* OmittedState.NotOmitted */;
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
            }
            else if (resource && isNotebookOutputVariableEntry(attachment)) {
                attachmentWidget = this.instantiationService.createInstance(NotebookCellOutputChatAttachmentWidget, resource, attachment, lm, options, container, this._contextResourceLabels);
            }
            else if (isPromptFileVariableEntry(attachment)) {
                attachmentWidget = this.instantiationService.createInstance(PromptFileAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
            }
            else if (isPromptTextVariableEntry(attachment)) {
                attachmentWidget = this.instantiationService.createInstance(PromptTextAttachmentWidget, attachment, undefined, options, container, this._contextResourceLabels);
            }
            else if (resource && (attachment.kind === 'file' || attachment.kind === 'directory')) {
                attachmentWidget = this.instantiationService.createInstance(FileAttachmentWidget, resource, range, attachment, undefined, lm, options, container, this._contextResourceLabels);
            }
            else if (attachment.kind === 'terminalCommand') {
                attachmentWidget = this.instantiationService.createInstance(TerminalCommandAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
            }
            else if (isImageVariableEntry(attachment)) {
                attachmentWidget = this.instantiationService.createInstance(ImageAttachmentWidget, resource, attachment, lm, options, container, this._contextResourceLabels);
            }
            else if (isElementVariableEntry(attachment)) {
                attachmentWidget = this.instantiationService.createInstance(ElementChatAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
            }
            else if (isPasteVariableEntry(attachment)) {
                attachmentWidget = this.instantiationService.createInstance(PasteAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
            }
            else if (isSCMHistoryItemVariableEntry(attachment)) {
                attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
            }
            else if (isSCMHistoryItemChangeVariableEntry(attachment)) {
                attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
            }
            else if (isSCMHistoryItemChangeRangeVariableEntry(attachment)) {
                attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeRangeAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
            }
            else {
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
    handleAttachmentDeletion(e, index, attachment) {
        // Set focus to the next attached context item if deletion was triggered by a keystroke (vs a mouse click)
        if (dom.isKeyboardEvent(e)) {
            this._indexOfLastAttachedContextDeletedWithKeyboard = index;
        }
        this._attachmentModel.delete(attachment.id);
        if (this.configurationService.getValue('chat.implicitContext.enableImplicitContext')) {
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
    handleAttachmentOpen(index, attachment) {
        this._indexOfLastOpenedContext = index;
        this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
        if (this._attachmentModel.size === 0) {
            this.focus();
        }
    }
    handleAttachmentNavigation(e) {
        if (!e.equals(15 /* KeyCode.LeftArrow */) && !e.equals(17 /* KeyCode.RightArrow */)) {
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
        if (e.equals(15 /* KeyCode.LeftArrow */)) {
            newIndex = currentIndex > 0 ? currentIndex - 1 : attachments.length - 1;
        }
        else if (e.equals(17 /* KeyCode.RightArrow */)) {
            newIndex = currentIndex < attachments.length - 1 ? currentIndex + 1 : 0;
        }
        if (newIndex !== -1) {
            const nextElement = attachments[newIndex];
            nextElement.focus();
            e.preventDefault();
            e.stopPropagation();
        }
    }
    async renderChatTodoListWidget(chatSessionResource) {
        const isTodoWidgetEnabled = this.configurationService.getValue(ChatConfiguration.TodosShowWidget) !== false;
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
    clearTodoListWidget(sessionResource, force) {
        this._chatInputTodoListWidget.value?.clear(sessionResource, force);
    }
    renderArtifactsWidget(chatSessionResource) {
        if (!this.configurationService.getValue(ChatConfiguration.ArtifactsEnabled)) {
            return;
        }
        if (!this._chatArtifactsWidget.value) {
            const widget = this._register(this.instantiationService.createInstance(ChatArtifactsWidget));
            this._chatArtifactsWidget.value = widget;
            dom.clearNode(this.chatArtifactsWidgetContainer);
            dom.append(this.chatArtifactsWidgetContainer, widget.domNode);
        }
        this._chatArtifactsWidget.value.render(chatSessionResource);
    }
    clearArtifactsWidget() {
        this._chatArtifactsWidget.value?.hide();
    }
    renderQuestionCarousel(carousel, context, options) {
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
    clearQuestionCarousel(responseId, resolveId) {
        if (resolveId !== undefined) {
            // Remove a specific carousel by resolveId
            const part = this._chatQuestionCarouselWidgets.get(resolveId);
            if (part) {
                part.domNode.remove();
                this._chatQuestionCarouselWidgets.deleteAndDispose(resolveId);
            }
            this._questionCarouselResponseIds.delete(resolveId);
            this._questionCarouselSessionResources.delete(resolveId);
        }
        else if (responseId !== undefined) {
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
        }
        else {
            // Clear all carousels
            this._chatQuestionCarouselWidgets.clearAndDisposeAll();
            this._questionCarouselResponseIds.clear();
            this._questionCarouselSessionResources.clear();
            dom.clearNode(this.chatQuestionCarouselContainer);
        }
        this._hasQuestionCarouselContextKey?.set(this._chatQuestionCarouselWidgets.size > 0);
    }
    get questionCarousel() {
        // Return the focused carousel, or the first one
        for (const part of this._chatQuestionCarouselWidgets.values()) {
            if (part.hasFocus()) {
                return part;
            }
        }
        return this._chatQuestionCarouselWidgets.size > 0 ? this._chatQuestionCarouselWidgets.values().next().value : undefined;
    }
    focusQuestionCarousel() {
        const carousel = this.questionCarousel;
        if (carousel) {
            carousel.focus();
            return true;
        }
        return false;
    }
    isQuestionCarouselFocused() {
        for (const part of this._chatQuestionCarouselWidgets.values()) {
            if (part.hasFocus()) {
                return true;
            }
        }
        return false;
    }
    navigateToPreviousQuestion() {
        const carousel = this.questionCarousel;
        return carousel?.navigateToPreviousQuestion() ?? false;
    }
    navigateToNextQuestion() {
        const carousel = this.questionCarousel;
        return carousel?.navigateToNextQuestion() ?? false;
    }
    setWorkingSetCollapsed(collapsed) {
        this._workingSetCollapsed.set(collapsed, undefined);
    }
    renderChatEditingSessionState(chatEditingSession) {
        dom.setVisibility(Boolean(chatEditingSession), this.chatEditingSessionWidgetContainer);
        if (chatEditingSession) {
            if (!isEqual(chatEditingSession.chatSessionResource, this._lastEditingSessionResource)) {
                this._workingSetCollapsed.set(true, undefined);
            }
            this._lastEditingSessionResource = chatEditingSession.chatSessionResource;
        }
        const modifiedEntries = derivedOpts({ equalsFn: arraysEqual }, r => {
            // Background chat sessions render the working set based on the session files, and not the editing session
            const sessionResource = chatEditingSession?.chatSessionResource ?? this._widget?.viewModel?.model.sessionResource;
            if (sessionResource && getChatSessionType(sessionResource) === AgentSessionProviders.Background) {
                return [];
            }
            return chatEditingSession?.entries.read(r).filter(entry => entry.state.read(r) === 0 /* ModifiedFileEntryState.Modified */) || [];
        });
        const editSessionEntries = derived((reader) => {
            const seenEntries = new ResourceSet();
            const entries = [];
            for (const entry of modifiedEntries.read(reader)) {
                if (entry.state.read(reader) !== 0 /* ModifiedFileEntryState.Modified */) {
                    continue;
                }
                if (!seenEntries.has(entry.modifiedURI)) {
                    seenEntries.add(entry.modifiedURI);
                    const linesAdded = entry.linesAdded?.read(reader);
                    const linesRemoved = entry.linesRemoved?.read(reader);
                    entries.push({
                        reference: entry.modifiedURI,
                        state: 0 /* ModifiedFileEntryState.Modified */,
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
        const sessionFileChanges = observableFromEvent(this, this.agentSessionsService.model.onDidChangeSessions, () => {
            const sessionResource = this._widget?.viewModel?.model?.sessionResource;
            if (!sessionResource) {
                return Iterable.empty();
            }
            const model = this.agentSessionsService.getSession(sessionResource);
            return model?.changes instanceof Array ? model.changes : Iterable.empty();
        });
        const sessionFiles = derived(reader => sessionFileChanges.read(reader).map((entry) => ({
            reference: isIChatSessionFileChange2(entry)
                ? entry.modifiedUri ?? entry.uri
                : entry.modifiedUri,
            state: 1 /* ModifiedFileEntryState.Accepted */,
            kind: 'reference',
            options: {
                diffMeta: { added: entry.insertions, removed: entry.deletions },
                isDeletion: entry.modifiedUri === undefined,
                originalUri: entry.originalUri,
                status: undefined
            }
        })));
        const shouldRender = derived(reader => editSessionEntries.read(reader).length > 0 || sessionFiles.read(reader).length > 0);
        this._renderingChatEdits.value = autorun(reader => {
            if (this.options.renderWorkingSet && shouldRender.read(reader)) {
                this.renderChatEditingSessionWithEntries(reader.store, chatEditingSession, editSessionEntries, sessionFiles);
            }
            else {
                dom.clearNode(this.chatEditingSessionWidgetContainer);
                this._chatEditsDisposables.clear();
                this._chatEditList = undefined;
            }
        });
    }
    renderChatEditingSessionWithEntries(store, chatEditingSession, editSessionEntriesObs, sessionEntriesObs) {
        // Summary of number of files changed
        // eslint-disable-next-line no-restricted-syntax
        const innerContainer = this.chatEditingSessionWidgetContainer.querySelector('.chat-editing-session-container.show-file-icons') ?? dom.append(this.chatEditingSessionWidgetContainer, $('.chat-editing-session-container.show-file-icons'));
        // eslint-disable-next-line no-restricted-syntax
        const overviewRegion = innerContainer.querySelector('.chat-editing-session-overview') ?? dom.append(innerContainer, $('.chat-editing-session-overview'));
        // eslint-disable-next-line no-restricted-syntax
        const overviewTitle = overviewRegion.querySelector('.working-set-title') ?? dom.append(overviewRegion, $('.working-set-title'));
        // Clear out the previous actions (if any)
        this._chatEditsActionsDisposables.clear();
        // Chat editing session actions
        // eslint-disable-next-line no-restricted-syntax
        const actionsContainer = overviewRegion.querySelector('.chat-editing-session-actions') ?? dom.append(overviewRegion, $('.chat-editing-session-actions'));
        const sessionResource = chatEditingSession?.chatSessionResource || this._widget?.viewModel?.model.sessionResource;
        const scopedContextKeyService = this._chatEditsActionsDisposables.add(this.contextKeyService.createScoped(actionsContainer));
        if (sessionResource) {
            scopedContextKeyService.createKey(ChatContextKeys.agentSessionType.key, getChatSessionType(sessionResource));
        }
        this._chatEditsActionsDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, scopedContextKeyService, r => !!sessionEntriesObs.read(r)?.length));
        const scopedInstantiationService = this._chatEditsActionsDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
        // Working set
        // eslint-disable-next-line no-restricted-syntax
        const workingSetContainer = innerContainer.querySelector('.chat-editing-session-list') ?? dom.append(innerContainer, $('.chat-editing-session-list'));
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
            }
            else {
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
                        $mid: 19 /* MarshalledId.ChatViewContext */,
                        sessionResource,
                    },
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
            const target = e.target;
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
            const list = this._chatEditList.object;
            list.layout(height);
            list.getHTMLElement().style.height = `${height}px`;
            list.splice(0, list.length, allEntries);
        }));
    }
    async renderFollowups(items, response) {
        if (!this.options.renderFollowups) {
            return;
        }
        this.followupsDisposables.clear();
        dom.clearNode(this.followupsContainer);
        if (items && items.length > 0) {
            this.followupsDisposables.add(this.instantiationService.createInstance(ChatFollowups, this.followupsContainer, items, this.location, undefined, followup => this._onDidAcceptFollowup.fire({ followup, response })));
        }
    }
    /**
     * Sets the maximum height budget for the input part. The editor height will be
     * clamped so it does not grow beyond what this budget allows after accounting
     * for non-editor chrome such as attachments, toolbars, and widgets.
     */
    setMaxHeight(maxHeight) {
        this._maxHeight = maxHeight;
    }
    /**
     * Layout the input part with the given width. Height is intrinsic - determined by content
     * and detected via ResizeObserver, which updates `inputPartHeight` for the parent to observe.
     */
    layout(width) {
        this.cachedWidth = width;
        this._stableInputPartWidth.set(width, undefined);
        return this._layout(width);
    }
    get _effectiveInputEditorMaxHeight() {
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
    _layout(width, allowRecurse = true) {
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
    getLayoutData() {
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
    getWidgetLocationInfo(widget) {
        // Editor context (quick chat, inline chat, etc.)
        if (isIChatResourceViewContext(widget.viewContext)) {
            return { location: "editor" /* ChatWidgetLocation.Editor */, isMaximized: false };
        }
        // View context - determine actual location from view descriptor service
        if (isIChatViewViewContext(widget.viewContext)) {
            const viewLocation = this.viewDescriptorService.getViewLocationById(widget.viewContext.viewId);
            const sideBarPosition = this.layoutService.getSideBarPosition();
            switch (viewLocation) {
                case 1 /* ViewContainerLocation.Panel */:
                    return {
                        location: "panel" /* ChatWidgetLocation.Panel */,
                        isMaximized: this.layoutService.isPanelMaximized(),
                    };
                case 2 /* ViewContainerLocation.AuxiliaryBar */:
                    // AuxiliaryBar is on the opposite side of the primary sidebar
                    return {
                        location: sideBarPosition === 0 /* Position.LEFT */ ? "sidebarRight" /* ChatWidgetLocation.SidebarRight */ : "sidebarLeft" /* ChatWidgetLocation.SidebarLeft */,
                        isMaximized: this.layoutService.isAuxiliaryBarMaximized(),
                    };
                case 0 /* ViewContainerLocation.Sidebar */:
                default:
                    // Primary sidebar follows its configured position
                    // Note: Primary sidebar cannot be maximized, so always false
                    return {
                        location: sideBarPosition === 0 /* Position.LEFT */ ? "sidebarLeft" /* ChatWidgetLocation.SidebarLeft */ : "sidebarRight" /* ChatWidgetLocation.SidebarRight */,
                        isMaximized: false,
                    };
            }
        }
        // Fallback for unknown contexts
        return { location: "editor" /* ChatWidgetLocation.Editor */, isMaximized: false };
    }
    getDefaultScrollbarOptions() {
        const scrollbar = this._inputEditor.getRawOptions().scrollbar ?? {};
        return this.options.renderStyle === 'compact'
            ? { ...scrollbar, vertical: 'hidden' }
            : { ...scrollbar, vertical: 'auto', verticalScrollbarSize: 7 };
    }
    getVisibleScrollbarOptions() {
        const scrollbar = this._inputEditor.getRawOptions().scrollbar ?? {};
        return this.options.renderStyle === 'compact'
            ? { ...scrollbar, vertical: 'hidden' }
            : { ...scrollbar, vertical: 'visible', verticalScrollbarSize: 7 };
    }
    updateInputEditorScrollbarOptions() {
        this._inputEditor.updateOptions({
            scrollbar: this._forceVisibleScrollbarUntilAccept
                ? this.getVisibleScrollbarOptions()
                : this.getDefaultScrollbarOptions()
        });
    }
    showScrollbarUntilAccept() {
        this._forceVisibleScrollbarUntilAccept = true;
        this.updateInputEditorScrollbarOptions();
    }
    resetScrollbarVisibilityAfterAccept() {
        if (!this._forceVisibleScrollbarUntilAccept) {
            return;
        }
        this._forceVisibleScrollbarUntilAccept = false;
        this.updateInputEditorScrollbarOptions();
    }
};
ChatInputPart = ChatInputPart_1 = __decorate([
    __param(4, IModelService),
    __param(5, IInstantiationService),
    __param(6, IContextKeyService),
    __param(7, IConfigurationService),
    __param(8, IKeybindingService),
    __param(9, IAccessibilityService),
    __param(10, ILanguageModelsService),
    __param(11, ILogService),
    __param(12, IFileService),
    __param(13, IEditorService),
    __param(14, IThemeService),
    __param(15, ITextModelService),
    __param(16, IStorageService),
    __param(17, IChatAgentService),
    __param(18, ISharedWebContentExtractorService),
    __param(19, IChatEntitlementService),
    __param(20, IChatModeService),
    __param(21, ILanguageModelToolsService),
    __param(22, IChatSessionsService),
    __param(23, IChatContextService),
    __param(24, IAgentSessionsService),
    __param(25, IWorkspaceContextService),
    __param(26, ISCMService),
    __param(27, IWorkbenchLayoutService),
    __param(28, IViewDescriptorService),
    __param(29, IChatAttachmentWidgetRegistry)
], ChatInputPart);
export { ChatInputPart };
function getLastPosition(model) {
    return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}
const chatInputEditorContainerSelector = '.interactive-input-editor';
setupSimpleEditorSelectionStyling(chatInputEditorContainerSelector);
class ChatSessionPickersContainerActionItem extends ActionViewItem {
    constructor(action, widgets, options) {
        super(null, action, options ?? {});
        this.widgets = widgets;
    }
    render(container) {
        container.classList.add('chat-sessionPicker-container');
        for (const widget of this.widgets) {
            const itemContainer = dom.$('.action-item.chat-sessionPicker-item');
            widget.render(itemContainer);
            container.appendChild(itemContainer);
        }
    }
    dispose() {
        for (const widget of this.widgets) {
            widget.dispose();
        }
        super.dispose();
    }
}
class HiddenActionViewItem extends BaseActionViewItem {
    constructor(action) {
        super(undefined, action);
    }
    render(container) {
        super.render(container);
        container.style.display = 'none';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElucHV0UGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0UGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsZUFBZSxFQUF5QixNQUFNLGlEQUFpRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQTBCLE1BQU0sZ0VBQWdFLENBQUM7QUFDNUksT0FBTyxLQUFLLElBQUksTUFBTSxnREFBZ0QsQ0FBQztBQUN2RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFHN0csT0FBTyxFQUFFLE1BQU0sSUFBSSxXQUFXLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDM0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FB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