/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { IHistoryNavigationWidget } from '../../../../base/browser/history.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { HistoryNavigator2 } from '../../../../base/common/history.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IDimension } from '../../../../editor/common/core/dimension.js';
import { IPosition } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { CopyPasteController } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { GlyphHoverController } from '../../../../editor/contrib/hover/browser/glyphHoverController.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { createAndFillInActionBarActions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { registerAndCreateHistoryNavigationContext } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ResourceLabels } from '../../../browser/labels.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../../codeEditor/browser/simpleEditorOptions.js';
import { ChatAgentLocation, IChatAgentService } from '../common/chatAgents.js';
import { CONTEXT_CHAT_INPUT_CURSOR_AT_TOP, CONTEXT_CHAT_INPUT_HAS_FOCUS, CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_IN_CHAT_INPUT } from '../common/chatContextKeys.js';
import { IChatEditingSession, ModifiedFileEntryState } from '../common/chatEditingService.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { IChatFollowup } from '../common/chatService.js';
import { IChatResponseViewModel } from '../common/chatViewModel.js';
import { IChatHistoryEntry, IChatWidgetHistoryService } from '../common/chatWidgetHistoryService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../common/languageModels.js';
import { CancelAction, ChatModelPickerActionId, ChatSubmitSecondaryAgentAction, IChatExecuteActionContext, SubmitAction } from './actions/chatExecuteActions.js';
import { IChatWidget } from './chat.js';
import { CollapsibleListPool, IChatCollapsibleListItem } from './chatContentParts/chatReferencesContentPart.js';
import { ChatEditingAcceptAllAction, ChatEditingDiscardAllAction, ChatEditingShowChangesAction } from './chatEditingService.js';
import { ChatFollowups } from './chatFollowups.js';
import { IChatViewState } from './chatWidget.js';

const $ = dom.$;

const INPUT_EDITOR_MAX_HEIGHT = 250;

interface IChatInputPartOptions {
	renderFollowups: boolean;
	renderStyle?: 'compact';
	menus: {
		executeToolbar: MenuId;
		inputSideToolbar?: MenuId;
		telemetrySource?: string;
	};
	editorOverflowWidgetsDomNode?: HTMLElement;
}

// TODO: @justschen
// class ChatInputContentProvider extends Disposable implements ITextModelContentProvider {
// 	constructor(
// 		textModelService: ITextModelService,
// 		private readonly modelService: IModelService,
// 		private readonly languageService: ILanguageService,
// 	) {
// 		super();
// 		this._register(textModelService.registerTextModelContentProvider(ChatInputPart.INPUT_SCHEME, this));
// 	}

// 	async provideTextContent(resource: URI): Promise<ITextModel | null> {
// 		const existing = this.modelService.getModel(resource);
// 		if (existing) {
// 			return existing;
// 		}
// 		return this.modelService.createModel('', this.languageService.createById('chatSessionInput'), resource);
// 	}
// }

export class ChatInputPart extends Disposable implements IHistoryNavigationWidget {
	static readonly INPUT_SCHEME = 'chatSessionInput';
	private static _counter = 0;

	private _onDidLoadInputState = this._register(new Emitter<any>());
	readonly onDidLoadInputState = this._onDidLoadInputState.event;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;

	private _onDidChangeContext = this._register(new Emitter<{ removed?: IChatRequestVariableEntry[]; added?: IChatRequestVariableEntry[] }>());
	readonly onDidChangeContext = this._onDidChangeContext.event;

	private _onDidAcceptFollowup = this._register(new Emitter<{ followup: IChatFollowup; response: IChatResponseViewModel | undefined }>());
	readonly onDidAcceptFollowup = this._onDidAcceptFollowup.event;

	public get attachedContext(): ReadonlySet<IChatRequestVariableEntry> {
		return this._attachedContext;
	}

	private _indexOfLastAttachedContextDeletedWithKeyboard: number = -1;
	private readonly _attachedContext = new Set<IChatRequestVariableEntry>();

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	private readonly _contextResourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event });

	private readonly inputEditorMaxHeight: number;
	private inputEditorHeight = 0;
	private container!: HTMLElement;

	private inputSideToolbarContainer?: HTMLElement;

	private followupsContainer!: HTMLElement;
	private readonly followupsDisposables = this._register(new DisposableStore());

	private attachedContextContainer!: HTMLElement;
	private readonly attachedContextDisposables = this._register(new DisposableStore());

	private chatEditingSessionWidgetContainer!: HTMLElement;

	private _inputPartHeight: number = 0;
	get inputPartHeight() {
		return this._inputPartHeight;
	}

	private _followupsHeight: number = 0;
	get followupsHeight() {
		return this._followupsHeight;
	}

	private _inputEditor!: CodeEditorWidget;
	private _inputEditorElement!: HTMLElement;

	private executeToolbar!: MenuWorkbenchToolBar;
	private inputActionsToolbar!: MenuWorkbenchToolBar;

	get inputEditor() {
		return this._inputEditor;
	}

	private history: HistoryNavigator2<IChatHistoryEntry>;
	private historyNavigationBackwardsEnablement!: IContextKey<boolean>;
	private historyNavigationForewardsEnablement!: IContextKey<boolean>;
	private inHistoryNavigation = false;
	private inputModel: ITextModel | undefined;
	private inputEditorHasText: IContextKey<boolean>;
	private chatCursorAtTop: IContextKey<boolean>;
	private inputEditorHasFocus: IContextKey<boolean>;

	private readonly _waitForPersistedLanguageModel = this._register(new MutableDisposable<IDisposable>());
	private _onDidChangeCurrentLanguageModel = new Emitter<string>();
	private _currentLanguageModel: string | undefined;
	get currentLanguageModel() {
		return this._currentLanguageModel;
	}

	private cachedDimensions: dom.Dimension | undefined;
	private cachedExecuteToolbarWidth: number | undefined;
	private cachedInputToolbarWidth: number | undefined;

	readonly inputUri = URI.parse(`${ChatInputPart.INPUT_SCHEME}:input-${ChatInputPart._counter++}`);

	private readonly _chatEditsDisposables = this._register(new DisposableStore());
	private _chatEditsListPool: CollapsibleListPool;

	constructor(
		// private readonly editorOptions: ChatEditorOptions, // TODO this should be used
		private readonly location: ChatAgentLocation,
		private readonly options: IChatInputPartOptions,
		private readonly getInputState: () => any,
		@IChatWidgetHistoryService private readonly historyService: IChatWidgetHistoryService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
		@IHoverService private readonly hoverService: IHoverService,
		@IFileService private readonly fileService: IFileService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();


		this.inputEditorMaxHeight = this.options.renderStyle === 'compact' ? INPUT_EDITOR_MAX_HEIGHT / 3 : INPUT_EDITOR_MAX_HEIGHT;

		this.inputEditorHasText = CONTEXT_CHAT_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.chatCursorAtTop = CONTEXT_CHAT_INPUT_CURSOR_AT_TOP.bindTo(contextKeyService);
		this.inputEditorHasFocus = CONTEXT_CHAT_INPUT_HAS_FOCUS.bindTo(contextKeyService);

		this.history = this.loadHistory();
		this._register(this.historyService.onDidClearHistory(() => this.history = new HistoryNavigator2([{ text: '' }], 50, historyKeyFn)));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
				this.inputEditor.updateOptions({ ariaLabel: this._getAriaLabel() });
			}
		}));

		this._chatEditsListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event));
	}

	private setCurrentLanguageModelToDefault() {
		const defaultLanguageModel = this.languageModelsService.getLanguageModelIds().find(id => this.languageModelsService.lookupLanguageModel(id)?.isDefault);
		const hasUserSelectableLanguageModels = this.languageModelsService.getLanguageModelIds().find(id => {
			const model = this.languageModelsService.lookupLanguageModel(id);
			return model?.isUserSelectable && !model.isDefault;
		});
		this._currentLanguageModel = hasUserSelectableLanguageModels ? defaultLanguageModel : undefined;
	}

	private setCurrentLanguageModelByUser(modelId: string) {
		this._currentLanguageModel = modelId;

		// The user changed the language model, so we don't wait for the persisted option to be registered
		this._waitForPersistedLanguageModel.clear();
	}

	private loadHistory(): HistoryNavigator2<IChatHistoryEntry> {
		const history = this.historyService.getHistory(this.location);
		if (history.length === 0) {
			history.push({ text: '' });
		}

		return new HistoryNavigator2(history, 50, historyKeyFn);
	}

	private _getAriaLabel(): string {
		const verbose = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat);
		if (verbose) {
			const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			return kbLabel ? localize('actions.chat.accessibiltyHelp', "Chat Input,  Type to ask questions or type / for topics, press enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel) : localize('chatInput.accessibilityHelpNoKb', "Chat Input,  Type code here and press Enter to run. Use the Chat Accessibility Help command for more information.");
		}
		return localize('chatInput', "Chat Input");
	}

	updateState(inputState: Object): void {
		if (this.inHistoryNavigation) {
			return;
		}

		const newEntry = { text: this._inputEditor.getValue(), state: inputState };

		if (this.history.isAtEnd()) {
			// The last history entry should always be the current input value
			this.history.replaceLast(newEntry);
		} else {
			// Added a reference while in the middle of history navigation, it's a new entry
			this.history.replaceLast(newEntry);
			this.history.resetCursor();
		}
	}

	initForNewChatModel(state: IChatViewState): void {
		this.history = this.loadHistory();
		this.history.add({
			text: state.inputValue ?? this.history.current().text,
			state: state.inputState ?? this.getInputState()
		});

		if (state.inputValue) {
			this.setValue(state.inputValue, false);
		}

		if (state.selectedLanguageModelId) {
			const model = this.languageModelsService.lookupLanguageModel(state.selectedLanguageModelId);
			if (model) {
				this._currentLanguageModel = state.selectedLanguageModelId;
				this._onDidChangeCurrentLanguageModel.fire(this._currentLanguageModel);
			} else {
				this._waitForPersistedLanguageModel.value = this.languageModelsService.onDidChangeLanguageModels(e => {
					const persistedModel = e.added?.find(m => m.identifier === state.selectedLanguageModelId);
					if (persistedModel) {
						this._waitForPersistedLanguageModel.clear();

						if (persistedModel.metadata.isUserSelectable) {
							this._currentLanguageModel = state.selectedLanguageModelId;
							this._onDidChangeCurrentLanguageModel.fire(this._currentLanguageModel!);
						}
					}
				});
			}
		}

	}

	logInputHistory(): void {
		const historyStr = [...this.history].map(entry => JSON.stringify(entry)).join('\n');
		this.logService.info(`[${this.location}] Chat input history:`, historyStr);
	}

	setVisible(visible: boolean): void {
		this._onDidChangeVisibility.fire(visible);
	}

	get element(): HTMLElement {
		return this.container;
	}

	showPreviousValue(): void {
		const inputState = this.getInputState();
		if (this.history.isAtEnd()) {
			this.saveCurrentValue(inputState);
		} else {
			if (!this.history.has({ text: this._inputEditor.getValue(), state: inputState })) {
				this.saveCurrentValue(inputState);
				this.history.resetCursor();
			}
		}

		this.navigateHistory(true);
	}

	showNextValue(): void {
		const inputState = this.getInputState();
		if (this.history.isAtEnd()) {
			return;
		} else {
			if (!this.history.has({ text: this._inputEditor.getValue(), state: inputState })) {
				this.saveCurrentValue(inputState);
				this.history.resetCursor();
			}
		}

		this.navigateHistory(false);
	}

	private navigateHistory(previous: boolean): void {
		const historyEntry = previous ?
			this.history.previous() : this.history.next();

		aria.status(historyEntry.text);

		this.inHistoryNavigation = true;
		this.setValue(historyEntry.text, true);
		this.inHistoryNavigation = false;

		this._onDidLoadInputState.fire(historyEntry.state);
		if (previous) {
			// Set cursor to the end of the first view line, so if wrapped, it's the point where the line wraps
			const endOfFirstLine = this._inputEditor._getViewModel()?.getLineLength(1) ?? 1;
			this._inputEditor.setPosition({ lineNumber: 1, column: endOfFirstLine });
		} else {
			const model = this._inputEditor.getModel();
			if (!model) {
				return;
			}

			this._inputEditor.setPosition(getLastPosition(model));
		}
	}

	setValue(value: string, transient: boolean): void {
		this.inputEditor.setValue(value);
		// always leave cursor at the end
		this.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });

		if (!transient) {
			this.saveCurrentValue(this.getInputState());
		}
	}

	private saveCurrentValue(inputState: any): void {
		const newEntry = { text: this._inputEditor.getValue(), state: inputState };
		this.history.replaceLast(newEntry);
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
			const userQuery = this._inputEditor.getValue();
			const entry: IChatHistoryEntry = { text: userQuery, state: this.getInputState() };
			this.history.replaceLast(entry);
			this.history.add({ text: '' });
		}

		// Clear attached context, fire event to clear input state, and clear the input editor
		this._attachedContext.clear();
		this._onDidLoadInputState.fire({});
		if (this.accessibilityService.isScreenReaderOptimized() && isMacintosh) {
			this._acceptInputForVoiceover();
		} else {
			this._inputEditor.focus();
			this._inputEditor.setValue('');
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

	attachContext(overwrite: boolean, ...contentReferences: IChatRequestVariableEntry[]): void {
		const removed = [];
		if (overwrite) {
			removed.push(...Array.from(this._attachedContext));
			this._attachedContext.clear();
		}

		if (contentReferences.length > 0) {
			for (const reference of contentReferences) {
				this._attachedContext.add(reference);
			}
		}

		if (removed.length > 0 || contentReferences.length > 0) {
			this.initAttachedContext(this.attachedContextContainer);

			if (!overwrite) {
				this._onDidChangeContext.fire({ removed, added: contentReferences });
			}
		}
	}

	render(container: HTMLElement, initialValue: string, widget: IChatWidget) {
		let elements;
		if (this.options.renderStyle === 'compact') {
			elements = dom.h('.interactive-input-part', [
				dom.h('.interactive-input-and-edit-session', [
					dom.h('.chat-editing-session@chatEditingSessionWidgetContainer'),
					dom.h('.interactive-input-and-side-toolbar@inputAndSideToolbar', [
						dom.h('.chat-input-container@inputContainer', [
							dom.h('.chat-editor-container@editorContainer'),
							dom.h('.chat-input-toolbars@inputToolbars'),
						]),
					]),
					dom.h('.chat-attached-context@attachedContextContainer'),
					dom.h('.interactive-input-followups@followupsContainer'),
				])
			]);
		} else {
			elements = dom.h('.interactive-input-part', [
				dom.h('.interactive-input-followups@followupsContainer'),
				dom.h('.chat-editing-session@chatEditingSessionWidgetContainer'),
				dom.h('.interactive-input-and-side-toolbar@inputAndSideToolbar', [
					dom.h('.chat-input-container@inputContainer', [
						dom.h('.chat-editor-container@editorContainer'),
						dom.h('.chat-attached-context@attachedContextContainer'),
						dom.h('.chat-input-toolbars@inputToolbars'),
					]),
				]),
			]);
		}
		this.container = elements.root;
		container.append(this.container);
		this.container.classList.toggle('compact', this.options.renderStyle === 'compact');
		this.followupsContainer = elements.followupsContainer;
		const inputAndSideToolbar = elements.inputAndSideToolbar; // The chat input and toolbar to the right
		const inputContainer = elements.inputContainer; // The chat editor, attachments, and toolbars
		const editorContainer = elements.editorContainer;
		this.attachedContextContainer = elements.attachedContextContainer;
		const toolbarsContainer = elements.inputToolbars;
		this.chatEditingSessionWidgetContainer = elements.chatEditingSessionWidgetContainer;
		this.initAttachedContext(this.attachedContextContainer);
		this.renderChatEditingSessionState(null);

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		CONTEXT_IN_CHAT_INPUT.bindTo(inputScopedContextKeyService).set(true);
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
		options.suggest = {
			showIcons: false,
			showSnippets: false,
			showWords: true,
			showStatusBar: false,
			insertMode: 'replace',
		};
		options.scrollbar = { ...(options.scrollbar ?? {}), vertical: 'hidden' };
		options.stickyScroll = { enabled: false };

		this._inputEditorElement = dom.append(editorContainer!, $(chatInputEditorContainerSelector));
		const editorOptions = getSimpleCodeEditorWidgetOptions();
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([ContentHoverController.ID, GlyphHoverController.ID, CopyPasteController.ID]));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorElement, options, editorOptions));
		SuggestController.get(this._inputEditor)?.forceRenderingAbove();

		this._register(this._inputEditor.onDidChangeModelContent(() => {
			const currentHeight = Math.min(this._inputEditor.getContentHeight(), this.inputEditorMaxHeight);
			if (currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
				this._onDidChangeHeight.fire();
			}

			const model = this._inputEditor.getModel();
			const inputHasText = !!model && model.getValue().trim().length > 0;
			this.inputEditorHasText.set(inputHasText);
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

		this._register(dom.addStandardDisposableListener(toolbarsContainer, dom.EventType.CLICK, e => this.inputEditor.focus()));
		this.inputActionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarsContainer, MenuId.ChatInput, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: { shouldForwardArgs: true },
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
		}));
		this.inputActionsToolbar.context = { widget } satisfies IChatExecuteActionContext;
		this._register(this.inputActionsToolbar.onDidChangeMenuItems(() => {
			if (this.cachedDimensions && typeof this.cachedInputToolbarWidth === 'number' && this.cachedInputToolbarWidth !== this.inputActionsToolbar.getItemsWidth()) {
				this.layout(this.cachedDimensions.height, this.cachedDimensions.width);
			}
		}));
		this.executeToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarsContainer, this.options.menus.executeToolbar, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore, // keep it lean when hiding items and avoid a "..." overflow menu
			actionViewItemProvider: (action, options) => {
				if (this.location === ChatAgentLocation.Panel) {
					if ((action.id === SubmitAction.ID || action.id === CancelAction.ID) && action instanceof MenuItemAction) {
						const dropdownAction = this.instantiationService.createInstance(MenuItemAction, { id: 'chat.moreExecuteActions', title: localize('notebook.moreExecuteActionsLabel', "More..."), icon: Codicon.chevronDown }, undefined, undefined, undefined, undefined);
						return this.instantiationService.createInstance(ChatSubmitDropdownActionItem, action, dropdownAction);
					}
				}

				if (action.id === ChatModelPickerActionId && action instanceof MenuItemAction) {
					if (!this._currentLanguageModel) {
						this.setCurrentLanguageModelToDefault();
					}

					if (this._currentLanguageModel) {
						const itemDelegate: ModelPickerDelegate = {
							onDidChangeModel: this._onDidChangeCurrentLanguageModel.event,
							setModel: (modelId: string) => {
								this.setCurrentLanguageModelByUser(modelId);
							}
						};
						return this.instantiationService.createInstance(ModelPickerActionViewItem, action, this._currentLanguageModel, itemDelegate);
					}
				}

				return undefined;
			}
		}));
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
				}
			}));
			this.inputSideToolbarContainer = toolbarSide.getElement();
			toolbarSide.getElement().classList.add('chat-side-toolbar');
			toolbarSide.context = { widget } satisfies IChatExecuteActionContext;
		}

		let inputModel = this.modelService.getModel(this.inputUri);
		if (!inputModel) {
			inputModel = this.modelService.createModel('', null, this.inputUri, true);
			this._register(inputModel);
		}

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

			const atTop = position.lineNumber === 1 && position.column - 1 <= (this._inputEditor._getViewModel()?.getLineLength(1) ?? 0);
			this.chatCursorAtTop.set(atTop);

			this.historyNavigationBackwardsEnablement.set(atTop);
			this.historyNavigationForewardsEnablement.set(position.equals(getLastPosition(model)));
		};
		this._register(this._inputEditor.onDidChangeCursorPosition(e => onDidChangeCursorPosition()));
		onDidChangeCursorPosition();
	}

	private initAttachedContext(container: HTMLElement, isLayout = false) {
		const oldHeight = container.offsetHeight;
		dom.clearNode(container);
		this.attachedContextDisposables.clear();
		const hoverDelegate = this.attachedContextDisposables.add(createInstantHoverDelegate());
		dom.setVisibility(Boolean(this.attachedContext.size), this.attachedContextContainer);
		if (!this.attachedContext.size) {
			this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
		}
		[...this.attachedContext.values()].forEach(async (attachment, index) => {
			const widget = dom.append(container, $('.chat-attached-context-attachment.show-file-icons'));
			const label = this._contextResourceLabels.create(widget, { supportIcons: true });
			const file = URI.isUri(attachment.value) ? attachment.value : attachment.value && typeof attachment.value === 'object' && 'uri' in attachment.value && URI.isUri(attachment.value.uri) ? attachment.value.uri : undefined;
			const range = attachment.value && typeof attachment.value === 'object' && 'range' in attachment.value && Range.isIRange(attachment.value.range) ? attachment.value.range : undefined;
			if (file && attachment.isFile) {
				const fileBasename = basename(file.path);
				const fileDirname = dirname(file.path);
				const friendlyName = `${fileBasename} ${fileDirname}`;
				const ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached file, {0}", friendlyName);

				label.setFile(file, {
					fileKind: FileKind.FILE,
					hidePath: true,
					range,
				});
				widget.ariaLabel = ariaLabel;
				widget.tabIndex = 0;
				this.attachButtonAndDisposables(widget, index, attachment);
			} else if (attachment.isImage) {
				let buffer: Uint8Array;
				const ariaLabel = localize('chat.imageAttachment', "Attached image, {0}", attachment.name);
				const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$('span.codicon.codicon-file-media'));

				const hoverElement = dom.$('div.chat-attached-context-hover');
				hoverElement.setAttribute('aria-label', ariaLabel);

				// Custom label
				const textLabel = dom.$('span.chat-attached-context-custom-text', {}, attachment.name);
				widget.appendChild(pillIcon);
				widget.appendChild(textLabel);

				try {
					if (attachment.value instanceof URI) {
						this.attachButtonAndDisposables(widget, index, attachment);
						const readFile = await this.fileService.readFile(attachment.value);
						buffer = readFile.value.buffer;

					} else {
						buffer = attachment.value as Uint8Array;
						this.attachButtonAndDisposables(widget, index, attachment);
					}
					await this.createImageElements(buffer, widget, hoverElement);
				} catch (error) {
					console.error('Error processing attachment:', error);
				}

				widget.style.position = 'relative';
				widget.ariaLabel = ariaLabel;
				widget.tabIndex = 0;

				if (!this.attachedContextDisposables.isDisposed) {
					this.attachedContextDisposables.add(this.hoverService.setupManagedHover(hoverDelegate, widget, hoverElement));

					// No delay for keyboard
					this.attachedContextDisposables.add(dom.addDisposableListener(widget, 'keydown', (event) => {
						const keyboardEvent = new StandardKeyboardEvent(event);
						if (keyboardEvent.keyCode === KeyCode.Enter || keyboardEvent.keyCode === KeyCode.Space) {
							this.hoverService.showManagedHover(widget);
						}
					}));
				}

			} else {
				const attachmentLabel = attachment.fullName ?? attachment.name;
				const withIcon = attachment.icon?.id ? `$(${attachment.icon.id}) ${attachmentLabel}` : attachmentLabel;
				label.setLabel(withIcon, undefined);

				widget.ariaLabel = localize('chat.attachment', "Attached context, {0}", attachment.name);
				widget.tabIndex = 0;
				this.attachButtonAndDisposables(widget, index, attachment);
			}
		});

		if (oldHeight !== container.offsetHeight && !isLayout) {
			this._onDidChangeHeight.fire();
		}
	}

	private attachButtonAndDisposables(widget: HTMLElement, index: number, attachment: IChatRequestVariableEntry) {

		const clearButton = new Button(widget, { supportIcons: true });

		// If this item is rendering in place of the last attached context item, focus the clear button so the user can continue deleting attached context items with the keyboard
		if (index === Math.min(this._indexOfLastAttachedContextDeletedWithKeyboard, this.attachedContext.size - 1)) {
			clearButton.focus();
		}

		this.attachedContextDisposables.add(clearButton);
		clearButton.icon = Codicon.close;
		const disp = clearButton.onDidClick((e) => {
			this._attachedContext.delete(attachment);
			disp.dispose();

			// Set focus to the next attached context item if deletion was triggered by a keystroke (vs a mouse click)
			if (dom.isKeyboardEvent(e)) {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					this._indexOfLastAttachedContextDeletedWithKeyboard = index;
				}
			}

			this._onDidChangeHeight.fire();
			this._onDidChangeContext.fire({ removed: [attachment] });
		});
		this.attachedContextDisposables.add(disp);
	}

	// Helper function to create and replace image
	private async createImageElements(buffer: ArrayBuffer | Uint8Array, widget: HTMLElement, hoverElement: HTMLElement) {
		const blob = new Blob([buffer], { type: 'image/png' });
		const url = URL.createObjectURL(blob);
		const img = dom.$('img.chat-attached-context-image', { src: url, alt: '' });
		const pillImg = dom.$('img.chat-attached-context-pill-image', { src: url, alt: '' });
		const pill = dom.$('div.chat-attached-context-pill', {}, pillImg);

		const existingPill = widget.querySelector('.chat-attached-context-pill');
		if (existingPill) {
			existingPill.replaceWith(pill);
		}

		// Update hover image
		hoverElement.appendChild(img);
	}

	async renderChatEditingSessionState(chatEditingSession: IChatEditingSession | null) {
		dom.clearNode(this.chatEditingSessionWidgetContainer);
		dom.setVisibility(Boolean(chatEditingSession), this.chatEditingSessionWidgetContainer);
		this._chatEditsDisposables.clear();
		if (!chatEditingSession) {
			return;
		}

		const innerContainer = dom.append(this.chatEditingSessionWidgetContainer, $('.chat-editing-session-container.show-file-icons'));

		// Summary of number of files changed
		const editedFiles = chatEditingSession.entries.get();
		const numberOfEditedEntries = editedFiles.length;
		const overviewRegion = dom.append(innerContainer, $('.chat-editing-session-overview'));
		const overviewText = dom.append(overviewRegion, $('span'));
		overviewText.textContent = numberOfEditedEntries === 1
			? localize('chatEditingSessionOverview.oneFileChanged', "1 file changed")
			: localize('chatEditingSessionOverview', "{0} files changed", numberOfEditedEntries);

		// Chat editing session actions
		const actionsContainer = dom.append(overviewRegion, $('.chat-editing-session-actions'));
		const actions = [];
		// Don't show Accept All / Discard All actions if user already selected Accept All / Discard All
		if (editedFiles.find((e) => e.state.get() === ModifiedFileEntryState.Undecided)) {
			actions.push(
				{
					command: ChatEditingShowChangesAction.ID,
					label: ChatEditingShowChangesAction.LABEL,
					isSecondary: true
				},
				{
					command: ChatEditingDiscardAllAction.ID,
					label: ChatEditingDiscardAllAction.LABEL,
					isSecondary: true
				},
				{
					command: ChatEditingAcceptAllAction.ID,
					label: ChatEditingAcceptAllAction.LABEL,
					isSecondary: false
				}
			);
		}

		for (const action of actions) {
			const button = this._register(new Button(actionsContainer, {
				supportIcons: false,
				secondary: action.isSecondary
			}));
			button.label = action.label;
			this._register(button.onDidClick(() => {
				this.commandService.executeCommand(action.command);
			}));
			dom.append(actionsContainer, button.element);
		}

		const clearButton = new Button(actionsContainer, { supportIcons: true });
		this._chatEditsDisposables.add(clearButton);
		clearButton.icon = Codicon.close;
		const disp = clearButton.onDidClick((e) => {
			disp.dispose();
			chatEditingSession.dispose();
		});
		dom.append(actionsContainer, clearButton.element);

		// List of edited files
		const entries: IChatCollapsibleListItem[] = editedFiles.map((entry) => ({
			reference: entry.modifiedURI,
			kind: 'reference',
		}));
		const editedFilesList = this._chatEditsListPool.get();
		const list = editedFilesList.object;
		this._chatEditsDisposables.add(editedFilesList);
		this._chatEditsDisposables.add(list.onDidOpen((e) => {
			if (e.element?.kind === 'reference' && URI.isUri(e.element.reference)) {
				const modifiedFileUri = e.element.reference;
				const editedFile = editedFiles.find((e) => e.modifiedURI.toString() === modifiedFileUri.toString());
				if (editedFile) {
					void this.editorService.openEditor({
						original: { resource: URI.from(editedFile.originalURI, true) },
						modified: { resource: URI.from(editedFile.modifiedURI, true) },
					});
				}
			}
		}));
		const maxItemsShown = 6;
		const itemsShown = Math.min(numberOfEditedEntries, maxItemsShown);
		const height = itemsShown * 22;
		list.layout(height);
		list.getHTMLElement().style.height = `${height}px`;
		list.splice(0, list.length, entries);
		dom.append(innerContainer, editedFilesList.object.getHTMLElement());
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
		return data.followupsHeight + data.inputPartEditorHeight + data.inputPartVerticalPadding + data.inputEditorBorder + data.attachmentsHeight + data.toolbarsHeight + data.chatEditingStateHeight;
	}

	layout(height: number, width: number) {
		this.cachedDimensions = new dom.Dimension(width, height);

		return this._layout(height, width);
	}

	private previousInputEditorDimension: IDimension | undefined;
	private _layout(height: number, width: number, allowRecurse = true): void {
		this.initAttachedContext(this.attachedContextContainer, true);

		const data = this.getLayoutData();
		const inputEditorHeight = Math.min(data.inputPartEditorHeight, height - data.followupsHeight - data.attachmentsHeight - data.inputPartVerticalPadding - data.toolbarsHeight);

		const followupsWidth = width - data.inputPartHorizontalPadding;
		this.followupsContainer.style.width = `${followupsWidth}px`;

		this._inputPartHeight = data.inputPartVerticalPadding + data.followupsHeight + inputEditorHeight + data.inputEditorBorder + data.attachmentsHeight + data.toolbarsHeight + data.chatEditingStateHeight;
		this._followupsHeight = data.followupsHeight;

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
		const executeToolbarWidth = this.cachedExecuteToolbarWidth = this.executeToolbar.getItemsWidth();
		const inputToolbarWidth = this.cachedInputToolbarWidth = this.inputActionsToolbar.getItemsWidth();
		const executeToolbarPadding = (this.executeToolbar.getItemsLength() - 1) * 4;
		const inputToolbarPadding = (this.inputActionsToolbar.getItemsLength() - 1) * 4;
		return {
			inputEditorBorder: 2,
			followupsHeight: this.followupsContainer.offsetHeight,
			inputPartEditorHeight: Math.min(this._inputEditor.getContentHeight(), this.inputEditorMaxHeight),
			inputPartHorizontalPadding: this.options.renderStyle === 'compact' ? 12 : 32,
			inputPartVerticalPadding: this.options.renderStyle === 'compact' ? 12 : 28,
			attachmentsHeight: this.attachedContextContainer.offsetHeight,
			editorBorder: 2,
			inputPartHorizontalPaddingInside: 12,
			toolbarsWidth: this.options.renderStyle === 'compact' ? executeToolbarWidth + executeToolbarPadding + inputToolbarWidth + inputToolbarPadding : 0,
			toolbarsHeight: this.options.renderStyle === 'compact' ? 0 : 22,
			chatEditingStateHeight: this.chatEditingSessionWidgetContainer.offsetHeight,
			sideToolbarWidth: this.inputSideToolbarContainer ? dom.getTotalWidth(this.inputSideToolbarContainer) + 4 /*gap*/ : 0,
		};
	}

	saveState(): void {
		this.saveCurrentValue(this.getInputState());
		const inputHistory = [...this.history];
		this.historyService.saveHistory(this.location, inputHistory);
	}
}

const historyKeyFn = (entry: IChatHistoryEntry) => JSON.stringify(entry);

function getLastPosition(model: ITextModel): IPosition {
	return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}

// This does seems like a lot just to customize an item with dropdown. This whole class exists just because we need an
// onDidChange listener on the submenu, which is apparently not needed in other cases.
class ChatSubmitDropdownActionItem extends DropdownWithPrimaryActionViewItem {
	constructor(
		action: MenuItemAction,
		dropdownAction: IAction,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService accessibilityService: IAccessibilityService
	) {
		super(
			action,
			dropdownAction,
			[],
			'',
			{
				getKeyBinding: (action: IAction) => keybindingService.lookupKeybinding(action.id, contextKeyService)
			},
			contextMenuService,
			keybindingService,
			notificationService,
			contextKeyService,
			themeService,
			accessibilityService);
		const menu = menuService.createMenu(MenuId.ChatExecuteSecondary, contextKeyService);
		const setActions = () => {
			const secondary: IAction[] = [];
			createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, secondary);
			const secondaryAgent = chatAgentService.getSecondaryAgent();
			if (secondaryAgent) {
				secondary.forEach(a => {
					if (a.id === ChatSubmitSecondaryAgentAction.ID) {
						a.label = localize('chat.submitToSecondaryAgent', "Send to @{0}", secondaryAgent.name);
					}

					return a;
				});
			}

			this.update(dropdownAction, secondary);
		};
		setActions();
		this._register(menu.onDidChange(() => setActions()));
	}
}

interface ModelPickerDelegate {
	onDidChangeModel: Event<string>;
	setModel(selectedModelId: string): void;
}

class ModelPickerActionViewItem extends MenuEntryActionViewItem {
	constructor(
		action: MenuItemAction,
		private currentLanguageModel: string,
		private readonly delegate: ModelPickerDelegate,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IAccessibilityService _accessibilityService: IAccessibilityService
	) {
		super(action, undefined, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, _accessibilityService);

		this._register(delegate.onDidChangeModel(modelId => {
			this.currentLanguageModel = modelId;
			this.updateLabel();
		}));
	}

	override async onClick(event: MouseEvent): Promise<void> {
		this._openContextMenu();
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-modelPicker-item');
	}

	protected override updateLabel(): void {
		if (this.label) {
			const model = this._languageModelsService.lookupLanguageModel(this.currentLanguageModel);
			if (model) {
				this.label.textContent = model.name;
				dom.reset(this.label, ...renderLabelWithIcons(`${model.name}$(chevron-down)`));
			}
		}
	}

	private _openContextMenu() {
		const setLanguageModelAction = (id: string, modelMetadata: ILanguageModelChatMetadata): IAction => {
			return {
				id,
				label: modelMetadata.name,
				tooltip: '',
				class: undefined,
				enabled: true,
				checked: id === this.currentLanguageModel,
				run: () => {
					this.currentLanguageModel = id;
					this.delegate.setModel(id);
					this.updateLabel();
				}
			};
		};

		const models = this._languageModelsService.getLanguageModelIds()
			.map(modelId => ({ id: modelId, model: this._languageModelsService.lookupLanguageModel(modelId)! }))
			.filter(entry => entry.model?.isUserSelectable);
		this._contextMenuService.showContextMenu({
			getAnchor: () => this.element!,
			getActions: () => models.map(entry => setLanguageModelAction(entry.id, entry.model)),
		});
	}
}

const chatInputEditorContainerSelector = '.interactive-input-editor';
setupSimpleEditorSelectionStyling(chatInputEditorContainerSelector);
