/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { addDisposableListener } from '../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { IHistoryNavigationWidget } from '../../../../base/browser/history.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { getBaseLayerHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate2.js';
import { createInstantHoverDelegate, getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { IAction } from '../../../../base/common/actions.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Promises } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { HistoryNavigator2 } from '../../../../base/common/history.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IDimension } from '../../../../editor/common/core/dimension.js';
import { IPosition } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
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
import { DropdownWithPrimaryActionViewItem, IDropdownWithPrimaryActionViewItemOptions } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { getFlatActionBarActions, IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { registerAndCreateHistoryNavigationContext } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService, type OpenInternalOptions } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { FolderThemeIcon, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IFileLabelOptions, ResourceLabels } from '../../../browser/labels.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../../codeEditor/browser/simpleEditorOptions.js';
import { revealInSideBarCommand } from '../../files/browser/fileActions.contribution.js';
import { ChatAgentLocation, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatEditingSessionState, IChatEditingService, IChatEditingSession, WorkingSetEntryRemovalReason, WorkingSetEntryState } from '../common/chatEditingService.js';
import { IChatRequestVariableEntry, isPasteVariableEntry } from '../common/chatModel.js';
import { ChatRequestDynamicVariablePart } from '../common/chatParserTypes.js';
import { IChatFollowup } from '../common/chatService.js';
import { IChatVariablesService } from '../common/chatVariables.js';
import { IChatResponseViewModel } from '../common/chatViewModel.js';
import { IChatHistoryEntry, IChatInputState, IChatWidgetHistoryService } from '../common/chatWidgetHistoryService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../common/languageModels.js';
import { CancelAction, ChatModelPickerActionId, ChatSubmitAction, ChatSubmitSecondaryAgentAction, IChatExecuteActionContext } from './actions/chatExecuteActions.js';
import { ImplicitContextAttachmentWidget } from './attachments/implicitContextAttachment.js';
import { InstructionAttachmentsWidget } from './attachments/instructionsAttachment/instructionAttachments.js';
import { IChatWidget } from './chat.js';
import { ChatAttachmentModel, EditsAttachmentModel } from './chatAttachmentModel.js';
import { hookUpResourceAttachmentDragAndContextMenu, hookUpSymbolAttachmentDragAndContextMenu } from './chatContentParts/chatAttachmentsContentPart.js';
import { IDisposableReference } from './chatContentParts/chatCollections.js';
import { CollapsibleListPool, IChatCollapsibleListItem } from './chatContentParts/chatReferencesContentPart.js';
import { ChatDragAndDrop, EditsDragAndDrop } from './chatDragAndDrop.js';
import { ChatEditingRemoveAllFilesAction, ChatEditingShowChangesAction } from './chatEditing/chatEditingActions.js';
import { ChatEditingSaveAllAction } from './chatEditorSaving.js';
import { ChatFollowups } from './chatFollowups.js';
import { IChatViewState } from './chatWidget.js';
import { ChatFileReference } from './contrib/chatDynamicVariables/chatFileReference.js';
import { ChatImplicitContext } from './contrib/chatImplicitContext.js';

const $ = dom.$;

const INPUT_EDITOR_MAX_HEIGHT = 250;

export interface IChatInputStyles {
	overlayBackground: string;
	listForeground: string;
	listBackground: string;
}

interface IChatInputPartOptions {
	renderFollowups: boolean;
	renderStyle?: 'compact';
	menus: {
		executeToolbar: MenuId;
		inputSideToolbar?: MenuId;
		telemetrySource?: string;
	};
	editorOverflowWidgetsDomNode?: HTMLElement;
	enableImplicitContext?: boolean;
}

export interface IWorkingSetEntry {
	uri: URI;
	isMarkedReadonly?: boolean;
}

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

	private readonly _attachmentModel: ChatAttachmentModel;
	private _inChatEditWorkingSetCtx: IContextKey<boolean> | undefined;

	public get attachmentModel(): ChatAttachmentModel {
		return this._attachmentModel;
	}

	public getAttachedAndImplicitContext(sessionId: string): IChatRequestVariableEntry[] {
		const contextArr = [...this.attachmentModel.attachments];
		if (this.implicitContext?.enabled && this.implicitContext.value) {
			contextArr.push(this.implicitContext.toBaseEntry());
		}

		// retrieve links from the input editor
		const linkOccurrences = this.inputEditor.getContribution<LinkDetector>(LinkDetector.ID)?.getAllLinkOccurrences() ?? [];
		const linksSeen = new Set<string>();
		for (const linkOccurrence of linkOccurrences) {
			const link = linkOccurrence.link;
			const uri = URI.isUri(link.url) ? link.url : link.url ? URI.parse(link.url) : undefined;
			if (!uri || linksSeen.has(uri.toString())) {
				continue;
			}

			linksSeen.add(uri.toString());
			contextArr.push({
				kind: 'link',
				id: uri.toString(),
				name: uri.fsPath,
				value: uri,
				isFile: false,
				isDynamic: true,
			});
		}

		// factor in nested file references into the implicit context
		const variables = this.variableService.getDynamicVariables(sessionId);
		for (const variable of variables) {
			if (!(variable instanceof ChatFileReference)) {
				continue;
			}

			for (const childUri of variable.allValidReferencesUris) {
				contextArr.push({
					id: variable.id,
					name: basename(childUri.path),
					value: childUri,
					isSelection: false,
					enabled: true,
					isFile: true,
					isDynamic: true,
				});
			}
		}

		for (const uri of this.instructionAttachmentsPart.references) {
			contextArr.push({
				id: 'vscode.prompt.instructions',
				name: basename(uri.path),
				value: uri,
				isSelection: false,
				enabled: true,
				isFile: true,
				isDynamic: true,
			});
		}

		return contextArr;
	}

	/**
	 * Check if the chat input part has any prompt instruction attachments.
	 */
	public get hasInstructionAttachments(): boolean {
		return !this.instructionAttachmentsPart.empty;
	}

	private _indexOfLastAttachedContextDeletedWithKeyboard: number = -1;

	private _implicitContext: ChatImplicitContext | undefined;
	public get implicitContext(): ChatImplicitContext | undefined {
		return this._implicitContext;
	}

	private _hasFileAttachmentContextKey: IContextKey<boolean>;

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	private readonly _contextResourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event });

	private readonly inputEditorMaxHeight: number;
	private inputEditorHeight = 0;
	private container!: HTMLElement;

	private inputSideToolbarContainer?: HTMLElement;

	private followupsContainer!: HTMLElement;
	private readonly followupsDisposables = this._register(new DisposableStore());

	private attachedContextContainer!: HTMLElement;
	private readonly attachedContextDisposables = this._register(new MutableDisposable<DisposableStore>());

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

	private readonly dnd: ChatDragAndDrop;

	private history: HistoryNavigator2<IChatHistoryEntry>;
	private historyNavigationBackwardsEnablement!: IContextKey<boolean>;
	private historyNavigationForewardsEnablement!: IContextKey<boolean>;
	private inputModel: ITextModel | undefined;
	private inputEditorHasText: IContextKey<boolean>;
	private chatCursorAtTop: IContextKey<boolean>;
	private inputEditorHasFocus: IContextKey<boolean>;
	/**
	 * Context key is set when prompt instructions are attached.3
	 */
	private promptInstructionsAttached: IContextKey<boolean>;

	private readonly _waitForPersistedLanguageModel = this._register(new MutableDisposable<IDisposable>());
	private _onDidChangeCurrentLanguageModel = this._register(new Emitter<string>());
	private _currentLanguageModel: string | undefined;
	get currentLanguageModel() {
		return this._currentLanguageModel;
	}

	private cachedDimensions: dom.Dimension | undefined;
	private cachedExecuteToolbarWidth: number | undefined;
	private cachedInputToolbarWidth: number | undefined;

	readonly inputUri = URI.parse(`${ChatInputPart.INPUT_SCHEME}:input-${ChatInputPart._counter++}`);

	private readonly _chatEditsActionsDisposables = this._register(new DisposableStore());
	private readonly _chatEditsDisposables = this._register(new DisposableStore());
	private readonly _chatEditsFileLimitHover = this._register(new MutableDisposable<IDisposable>());
	private _chatEditsProgress: ProgressBar | undefined;
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
	private _combinedChatEditWorkingSetEntries: IWorkingSetEntry[] = [];
	public get chatEditWorkingSetFiles() {
		return this._combinedChatEditWorkingSetEntries;
	}

	private readonly getInputState: () => IChatInputState;

	/**
	 * Child widget of prompt instruction attachments.
	 * See {@linkcode InstructionAttachmentsWidget}.
	 */
	private instructionAttachmentsPart: InstructionAttachmentsWidget;

	constructor(
		// private readonly editorOptions: ChatEditorOptions, // TODO this should be used
		private readonly location: ChatAgentLocation,
		private readonly options: IChatInputPartOptions,
		styles: IChatInputStyles,
		getContribsInputState: () => any,
		@IChatWidgetHistoryService private readonly historyService: IChatWidgetHistoryService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
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
		@IEditorService private readonly editorService: IEditorService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@IThemeService private readonly themeService: IThemeService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IStorageService private readonly storageService: IStorageService,
		@ILabelService private readonly labelService: ILabelService,
		@IChatVariablesService private readonly variableService: IChatVariablesService,
	) {
		super();

		if (this.location === ChatAgentLocation.EditingSession) {
			this._attachmentModel = this._register(this.instantiationService.createInstance(EditsAttachmentModel));
			this.dnd = this._register(this.instantiationService.createInstance(EditsDragAndDrop, this.attachmentModel, styles));
		} else {
			this._attachmentModel = this._register(this.instantiationService.createInstance(ChatAttachmentModel));
			this.dnd = this._register(this.instantiationService.createInstance(ChatDragAndDrop, this.attachmentModel, styles));
		}

		this.getInputState = (): IChatInputState => {
			return {
				...getContribsInputState(),
				chatContextAttachments: this._attachmentModel.attachments,
			};
		};
		this.inputEditorMaxHeight = this.options.renderStyle === 'compact' ? INPUT_EDITOR_MAX_HEIGHT / 3 : INPUT_EDITOR_MAX_HEIGHT;

		this.inputEditorHasText = ChatContextKeys.inputHasText.bindTo(contextKeyService);
		this.chatCursorAtTop = ChatContextKeys.inputCursorAtTop.bindTo(contextKeyService);
		this.inputEditorHasFocus = ChatContextKeys.inputHasFocus.bindTo(contextKeyService);
		this.promptInstructionsAttached = ChatContextKeys.instructionsAttached.bindTo(contextKeyService);

		this.history = this.loadHistory();
		this._register(this.historyService.onDidClearHistory(() => this.history = new HistoryNavigator2([{ text: '' }], 50, historyKeyFn)));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
				this.inputEditor.updateOptions({ ariaLabel: this._getAriaLabel() });
			}
		}));

		this._chatEditsListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, MenuId.ChatEditingWidgetModifiedFilesToolbar));

		this._hasFileAttachmentContextKey = ChatContextKeys.hasFileAttachments.bindTo(contextKeyService);

		this.instructionAttachmentsPart = this._register(
			instantiationService.createInstance(
				InstructionAttachmentsWidget,
				this.attachmentModel.promptInstructions,
				this._contextResourceLabels,
			),
		);

		this.initSelectedModel();
	}

	private getSelectedModelStorageKey(): string {
		return `chat.currentLanguageModel.${this.location}`;
	}

	private initSelectedModel() {
		const persistedSelection = this.storageService.get(this.getSelectedModelStorageKey(), StorageScope.APPLICATION);
		if (persistedSelection) {
			const model = this.languageModelsService.lookupLanguageModel(persistedSelection);
			if (model) {
				this._currentLanguageModel = persistedSelection;
				this._onDidChangeCurrentLanguageModel.fire(this._currentLanguageModel);
			} else {
				this._waitForPersistedLanguageModel.value = this.languageModelsService.onDidChangeLanguageModels(e => {
					const persistedModel = e.added?.find(m => m.identifier === persistedSelection);
					if (persistedModel) {
						this._waitForPersistedLanguageModel.clear();

						if (persistedModel.metadata.isUserSelectable) {
							this._currentLanguageModel = persistedSelection;
							this._onDidChangeCurrentLanguageModel.fire(this._currentLanguageModel!);
						}
					}
				});
			}
		}
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
		if (this.cachedDimensions) {
			this.layout(this.cachedDimensions.height, this.cachedDimensions.width);
		}

		this.storageService.store(this.getSelectedModelStorageKey(), modelId, StorageScope.APPLICATION, StorageTarget.USER);
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

	initForNewChatModel(state: IChatViewState): void {
		this.history = this.loadHistory();
		this.history.add({
			text: state.inputValue ?? this.history.current().text,
			state: state.inputState ?? this.getInputState()
		});
		const attachments = state.inputState?.chatContextAttachments ?? [];
		this._attachmentModel.clearAndSetContext(...attachments);

		if (state.inputValue) {
			this.setValue(state.inputValue, false);
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

		const historyAttachments = historyEntry.state?.chatContextAttachments ?? [];
		this._attachmentModel.clearAndSetContext(...historyAttachments);

		aria.status(historyEntry.text);
		this.setValue(historyEntry.text, true);

		this._onDidLoadInputState.fire(historyEntry.state);

		const model = this._inputEditor.getModel();
		if (!model) {
			return;
		}

		if (previous) {
			const endOfFirstViewLine = this._inputEditor._getViewModel()?.getLineLength(1) ?? 1;
			const endOfFirstModelLine = model.getLineLength(1);
			if (endOfFirstViewLine === endOfFirstModelLine) {
				// Not wrapped - set cursor to the end of the first line
				this._inputEditor.setPosition({ lineNumber: 1, column: endOfFirstViewLine + 1 });
			} else {
				// Wrapped - set cursor one char short of the end of the first view line.
				// If it's after the next character, the cursor shows on the second line.
				this._inputEditor.setPosition({ lineNumber: 1, column: endOfFirstViewLine });
			}
		} else {
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
		this.attachmentModel.clear();
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

	private _handleAttachedContextChange() {
		this._hasFileAttachmentContextKey.set(Boolean(this._attachmentModel.attachments.find(a => a.isFile)));
		this.renderAttachedContext();
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
		this.renderAttachedContext();
		if (this.options.enableImplicitContext) {
			this._implicitContext = this._register(new ChatImplicitContext());
			this._register(this._implicitContext.onDidChangeValue(() => this._handleAttachedContextChange()));
		}

		this._register(this._attachmentModel.onDidChangeContext(() => this._handleAttachedContextChange()));
		this.renderChatEditingSessionState(null, widget);

		this.dnd.addOverlay(container, container);

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		ChatContextKeys.inChatInput.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));

		this._inChatEditWorkingSetCtx = ChatContextKeys.inChatEditWorkingSet.bindTo(this.contextKeyService);

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
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([ContentHoverController.ID, GlyphHoverController.ID, CopyPasteController.ID, LinkDetector.ID]));
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
		this._register(this._inputEditor.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this.inputEditorHeight = e.contentHeight;
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
		this.inputActionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarsContainer, MenuId.ChatInput, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: { shouldForwardArgs: true },
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			hoverDelegate
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
			hoverDelegate,
			hiddenItemStrategy: HiddenItemStrategy.Ignore, // keep it lean when hiding items and avoid a "..." overflow menu
			actionViewItemProvider: (action, options) => {
				if (this.location === ChatAgentLocation.Panel || this.location === ChatAgentLocation.Editor) {
					if ((action.id === ChatSubmitAction.ID || action.id === CancelAction.ID) && action instanceof MenuItemAction) {
						const dropdownAction = this.instantiationService.createInstance(MenuItemAction, { id: 'chat.moreExecuteActions', title: localize('notebook.moreExecuteActionsLabel', "More..."), icon: Codicon.chevronDown }, undefined, undefined, undefined, undefined);
						return this.instantiationService.createInstance(ChatSubmitDropdownActionItem, action, dropdownAction, options);
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
						return this.instantiationService.createInstance(ModelPickerActionViewItem, action, this._currentLanguageModel, itemDelegate, { hoverDelegate: options.hoverDelegate, keybinding: options.keybinding ?? undefined });
					}
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

			const atTop = position.lineNumber === 1 && position.column - 1 <= (this._inputEditor._getViewModel()?.getLineLength(1) ?? 0);
			this.chatCursorAtTop.set(atTop);

			this.historyNavigationBackwardsEnablement.set(atTop);
			this.historyNavigationForewardsEnablement.set(position.equals(getLastPosition(model)));
		};
		this._register(this._inputEditor.onDidChangeCursorPosition(e => onDidChangeCursorPosition()));
		onDidChangeCursorPosition();

		this._register(this.themeService.onDidFileIconThemeChange(() => {
			this.renderAttachedContext();
		}));
	}

	private async renderAttachedContext() {
		const container = this.attachedContextContainer;
		const oldHeight = container.offsetHeight;
		const store = new DisposableStore();
		this.attachedContextDisposables.value = store;

		dom.clearNode(container);
		const hoverDelegate = store.add(createInstantHoverDelegate());
		const attachments = this.location === ChatAgentLocation.EditingSession
			// Render as attachments anything that isn't a file, but still render specific ranges in a file
			? [...this.attachmentModel.attachments.entries()].filter(([_, attachment]) => !attachment.isFile || attachment.isFile && typeof attachment.value === 'object' && !!attachment.value && 'range' in attachment.value)
			: [...this.attachmentModel.attachments.entries()];
		dom.setVisibility(Boolean(attachments.length) || Boolean(this.implicitContext?.value) || !this.instructionAttachmentsPart.empty, this.attachedContextContainer);
		if (!attachments.length) {
			this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
		}

		if (this.implicitContext?.value) {
			const implicitPart = store.add(this.instantiationService.createInstance(ImplicitContextAttachmentWidget, this.implicitContext, this._contextResourceLabels));
			container.appendChild(implicitPart.domNode);
		}

		this.promptInstructionsAttached.set(!this.instructionAttachmentsPart.empty);
		container.appendChild(this.instructionAttachmentsPart.domNode);

		const attachmentInitPromises: Promise<void>[] = [];
		for (const [index, attachment] of attachments) {
			const widget = dom.append(container, $('.chat-attached-context-attachment.show-file-icons'));
			const label = this._contextResourceLabels.create(widget, { supportIcons: true, hoverDelegate, hoverTargetOverride: widget });

			let ariaLabel: string | undefined;

			let resource = URI.isUri(attachment.value) ? attachment.value : attachment.value && typeof attachment.value === 'object' && 'uri' in attachment.value && URI.isUri(attachment.value.uri) ? attachment.value.uri : undefined;
			let range = attachment.value && typeof attachment.value === 'object' && 'range' in attachment.value && Range.isIRange(attachment.value.range) ? attachment.value.range : undefined;
			if (resource && (attachment.isFile || attachment.isDirectory)) {
				const fileBasename = basename(resource.path);
				const fileDirname = dirname(resource.path);
				const friendlyName = `${fileBasename} ${fileDirname}`;

				ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached file, {0}", friendlyName);

				const fileOptions: IFileLabelOptions = { hidePath: true };
				label.setFile(resource, attachment.isFile ? {
					...fileOptions,
					fileKind: FileKind.FILE,
					range,
				} : {
					...fileOptions,
					fileKind: FileKind.FOLDER,
					icon: !this.themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : undefined
				});

				this.attachButtonAndDisposables(widget, index, attachment, hoverDelegate);
				this.instantiationService.invokeFunction(accessor => {
					if (resource) {
						store.add(hookUpResourceAttachmentDragAndContextMenu(accessor, widget, resource));
					}
				});

			} else if (attachment.isImage) {
				ariaLabel = localize('chat.imageAttachment', "Attached image, {0}", attachment.name);

				const hoverElement = dom.$('div.chat-attached-context-hover');
				hoverElement.setAttribute('aria-label', ariaLabel);

				// Custom label
				const pillIcon = dom.$('div.chat-attached-context-pill', {}, dom.$('span.codicon.codicon-file-media'));
				const textLabel = dom.$('span.chat-attached-context-custom-text', {}, attachment.name);
				widget.appendChild(pillIcon);
				widget.appendChild(textLabel);

				attachmentInitPromises.push(Promises.withAsyncBody(async (resolve) => {
					let buffer: Uint8Array;
					try {
						this.attachButtonAndDisposables(widget, index, attachment, hoverDelegate);
						if (attachment.value instanceof URI) {
							const readFile = await this.fileService.readFile(attachment.value);
							if (store.isDisposed) {
								return;
							}
							buffer = readFile.value.buffer;
						} else {
							buffer = attachment.value as Uint8Array;
						}
						this.createImageElements(buffer, widget, hoverElement);
					} catch (error) {
						console.error('Error processing attachment:', error);
					}

					widget.style.position = 'relative';
					store.add(this.hoverService.setupManagedHover(hoverDelegate, widget, hoverElement, { trapFocus: false }));
					resolve();
				}));
			} else if (isPasteVariableEntry(attachment)) {
				ariaLabel = localize('chat.attachment', "Attached context, {0}", attachment.name);

				const classNames = ['file-icon', `${attachment.language}-lang-file-icon`];
				if (attachment.copiedFrom) {
					resource = attachment.copiedFrom.uri;
					range = attachment.copiedFrom.range;
					const filename = basename(resource.path);
					label.setLabel(filename, undefined, { extraClasses: classNames });
				} else {
					label.setLabel(attachment.fileName, undefined, { extraClasses: classNames });
				}
				widget.appendChild(dom.$('span.attachment-additional-info', {}, `Pasted ${attachment.pastedLines}`));

				widget.style.position = 'relative';

				const hoverContent: IManagedHoverTooltipMarkdownString = {
					markdown: {
						value: `${attachment.copiedFrom ? this.labelService.getUriLabel(attachment.copiedFrom.uri, { relative: true }) : attachment.fileName}\n\n---\n\n\`\`\`${attachment.language}\n\n${attachment.code}\n\`\`\``,
					},
					markdownNotSupportedFallback: attachment.code,
				};
				store.add(this.hoverService.setupManagedHover(hoverDelegate, widget, hoverContent, { trapFocus: true }));
				this.attachButtonAndDisposables(widget, index, attachment, hoverDelegate);

				const copiedFromResource = attachment.copiedFrom?.uri;
				if (copiedFromResource) {
					store.add(this.instantiationService.invokeFunction(accessor => hookUpResourceAttachmentDragAndContextMenu(accessor, widget, copiedFromResource)));
				}

			} else {
				const attachmentLabel = attachment.fullName ?? attachment.name;
				const withIcon = attachment.icon?.id ? `$(${attachment.icon.id}) ${attachmentLabel}` : attachmentLabel;
				label.setLabel(withIcon, undefined);

				ariaLabel = localize('chat.attachment', "Attached context, {0}", attachment.name);

				this.attachButtonAndDisposables(widget, index, attachment, hoverDelegate);
			}

			if (attachment.kind === 'symbol') {
				const scopedContextKeyService = store.add(this.contextKeyService.createScoped(widget));
				store.add(this.instantiationService.invokeFunction(accessor => hookUpSymbolAttachmentDragAndContextMenu(accessor, widget, scopedContextKeyService, { ...attachment, kind: attachment.symbolKind }, MenuId.ChatInputSymbolAttachmentContext)));
			}

			await Promise.all(attachmentInitPromises);
			if (store.isDisposed) {
				return;
			}

			if (resource) {
				widget.style.cursor = 'pointer';
				store.add(dom.addDisposableListener(widget, dom.EventType.CLICK, (e: MouseEvent) => {
					dom.EventHelper.stop(e, true);
					if (attachment.isDirectory) {
						this.openResource(resource, true);
					} else {
						this.openResource(resource, false, range);
					}
				}));

				store.add(dom.addDisposableListener(widget, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
					const event = new StandardKeyboardEvent(e);
					if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
						dom.EventHelper.stop(e, true);
						if (attachment.isDirectory) {
							this.openResource(resource, true);
						} else {
							this.openResource(resource, false, range);
						}
					}
				}));
			}

			widget.tabIndex = 0;
			widget.ariaLabel = ariaLabel;
		}

		if (oldHeight !== container.offsetHeight) {
			this._onDidChangeHeight.fire();
		}
	}

	private openResource(resource: URI, isDirectory: true): void;
	private openResource(resource: URI, isDirectory: false, range: IRange | undefined): void;
	private openResource(resource: URI, isDirectory?: boolean, range?: IRange): void {
		if (isDirectory) {
			// Reveal Directory in explorer
			this.commandService.executeCommand(revealInSideBarCommand.id, resource);
			return;
		}

		// Open file in editor
		const openTextEditorOptions: ITextEditorOptions | undefined = range ? { selection: range } : undefined;
		const options: OpenInternalOptions = {
			fromUserGesture: true,
			editorOptions: openTextEditorOptions,
		};
		this.openerService.open(resource, options);
	}

	private attachButtonAndDisposables(widget: HTMLElement, index: number, attachment: IChatRequestVariableEntry, hoverDelegate: IHoverDelegate) {
		const store = this.attachedContextDisposables.value;
		if (!store) {
			return;
		}

		const clearButton = new Button(widget, {
			supportIcons: true,
			hoverDelegate,
			title: localize('chat.attachment.clearButton', "Remove from context")
		});

		// If this item is rendering in place of the last attached context item, focus the clear button so the user can continue deleting attached context items with the keyboard
		if (index === Math.min(this._indexOfLastAttachedContextDeletedWithKeyboard, this.attachmentModel.size - 1)) {
			clearButton.focus();
		}

		store.add(clearButton);
		clearButton.icon = Codicon.close;
		store.add(Event.once(clearButton.onDidClick)((e) => {
			this._attachmentModel.delete(attachment.id);

			// Set focus to the next attached context item if deletion was triggered by a keystroke (vs a mouse click)
			if (dom.isKeyboardEvent(e)) {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					this._indexOfLastAttachedContextDeletedWithKeyboard = index;
				}
			}

			if (this._attachmentModel.size === 0) {
				this.focus();
			}

			this._onDidChangeContext.fire({ removed: [attachment] });
		}));
	}

	// Helper function to create and replace image
	private createImageElements(buffer: ArrayBuffer | Uint8Array, widget: HTMLElement, hoverElement: HTMLElement) {
		const blob = new Blob([buffer], { type: 'image/png' });
		const url = URL.createObjectURL(blob);
		const pillImg = dom.$('img.chat-attached-context-pill-image', { src: url, alt: '' });
		const pill = dom.$('div.chat-attached-context-pill', {}, pillImg);

		const existingPill = widget.querySelector('.chat-attached-context-pill');
		if (existingPill) {
			existingPill.replaceWith(pill);
		}

		const hoverImage = dom.$('img.chat-attached-context-image', { src: url, alt: '' });

		// Update hover image
		hoverElement.appendChild(hoverImage);

		hoverImage.onload = () => {
			URL.revokeObjectURL(url);
		};
	}

	async renderChatEditingSessionState(chatEditingSession: IChatEditingSession | null, chatWidget?: IChatWidget) {
		dom.setVisibility(Boolean(chatEditingSession), this.chatEditingSessionWidgetContainer);

		if (!chatEditingSession) {
			dom.clearNode(this.chatEditingSessionWidgetContainer);
			this._chatEditsDisposables.clear();
			this._chatEditList = undefined;
			this._combinedChatEditWorkingSetEntries = [];
			this._chatEditsProgress?.dispose();
			return;
		}

		const currentChatEditingState = chatEditingSession.state.get();
		if (this._chatEditList && !chatWidget?.viewModel?.requestInProgress && (currentChatEditingState === ChatEditingSessionState.Idle || currentChatEditingState === ChatEditingSessionState.Initial)) {
			this._chatEditsProgress?.stop();
		}

		// Summary of number of files changed
		const innerContainer = this.chatEditingSessionWidgetContainer.querySelector('.chat-editing-session-container.show-file-icons') as HTMLElement ?? dom.append(this.chatEditingSessionWidgetContainer, $('.chat-editing-session-container.show-file-icons'));
		const seenEntries = new ResourceSet();
		let entries: IChatCollapsibleListItem[] = chatEditingSession?.entries.get().map((entry) => {
			seenEntries.add(entry.modifiedURI);
			return {
				reference: entry.modifiedURI,
				state: entry.state.get(),
				kind: 'reference',
			};
		}) ?? [];
		for (const attachment of (this.attachmentModel as EditsAttachmentModel).fileAttachments) {
			if (URI.isUri(attachment.value) && !seenEntries.has(attachment.value)) {
				entries.unshift({
					reference: attachment.value,
					state: WorkingSetEntryState.Attached,
					kind: 'reference',
				});
				seenEntries.add(attachment.value);
			}
		}
		for (const [file, metadata] of chatEditingSession.workingSet.entries()) {
			if (!seenEntries.has(file) && metadata.state !== WorkingSetEntryState.Suggested) {
				entries.unshift({
					reference: file,
					state: metadata.state,
					description: metadata.description,
					kind: 'reference',
					isMarkedReadonly: metadata.isMarkedReadonly,
				});
				seenEntries.add(file);
			}
		}
		// Factor file variables that are part of the user query into the working set
		for (const part of chatWidget?.parsedInput.parts ?? []) {
			if (part instanceof ChatRequestDynamicVariablePart && part.isFile && (URI.isUri(part.data) && !seenEntries.has(part.data) || isLocation(part.data) && !seenEntries.has(part.data.uri))) {
				entries.unshift({
					reference: part.data,
					state: WorkingSetEntryState.Attached,
					kind: 'reference',
				});
			}
		}
		const excludedEntries: IChatCollapsibleListItem[] = [];
		for (const excludedAttachment of (this.attachmentModel as EditsAttachmentModel).excludedFileAttachments) {
			if (excludedAttachment.isFile && URI.isUri(excludedAttachment.value) && !seenEntries.has(excludedAttachment.value)) {
				excludedEntries.push({
					reference: excludedAttachment.value,
					state: WorkingSetEntryState.Attached,
					kind: 'reference',
					excluded: true,
					title: localize('chatEditingSession.excludedFile', 'The Working Set file limit has ben reached. {0} is excluded from the Woking Set. Remove other files to make space for {0}.', basename(excludedAttachment.value.path))
				});
				seenEntries.add(excludedAttachment.value);
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
		let remainingFileEntriesBudget = this.chatEditingService.editingSessionFileLimit;
		const overviewRegion = innerContainer.querySelector('.chat-editing-session-overview') as HTMLElement ?? dom.append(innerContainer, $('.chat-editing-session-overview'));
		const overviewTitle = overviewRegion.querySelector('.working-set-title') as HTMLElement ?? dom.append(overviewRegion, $('.working-set-title'));
		const overviewWorkingSet = overviewTitle.querySelector('span') ?? dom.append(overviewTitle, $('span'));
		const overviewFileCount = overviewTitle.querySelector('span.working-set-count') ?? dom.append(overviewTitle, $('span.working-set-count'));

		overviewWorkingSet.textContent = localize('chatEditingSession.workingSet', 'Working Set');

		// Record the number of entries that the user wanted to add to the working set
		this._attemptedWorkingSetEntriesCount = entries.length + excludedEntries.length;

		let suggestedFilesInWorkingSetCount = 0;
		overviewFileCount.textContent = '';
		if (entries.length === 1) {
			overviewFileCount.textContent = ' ' + localize('chatEditingSession.oneFile', '(1 file)');
			suggestedFilesInWorkingSetCount = entries[0].kind === 'reference' && entries[0].state === WorkingSetEntryState.Suggested ? 1 : 0;
		} else if (entries.length >= remainingFileEntriesBudget) {
			// The user tried to attach too many files, we have to drop anything after the limit
			const entriesToPreserve: IChatCollapsibleListItem[] = [];
			const newEntries: IChatCollapsibleListItem[] = [];
			const suggestedFiles: IChatCollapsibleListItem[] = [];
			for (let i = 0; i < entries.length; i += 1) {
				const entry = entries[i];
				if (entry.kind !== 'reference' || !URI.isUri(entry.reference)) {
					continue;
				}
				const currentEntryUri = entry.reference;
				if (entry.state === WorkingSetEntryState.Suggested) {
					// Keep track of suggested files for now, they should not take precedence over newly added files
					suggestedFiles.push(entry);
				} else if (this._combinedChatEditWorkingSetEntries.find((e) => e.toString() === currentEntryUri?.toString())) {
					// If this entry was here earlier and is still here, we should prioritize preserving it
					// so that nothing existing gets evicted
					if (remainingFileEntriesBudget > 0) {
						entriesToPreserve.push(entry);
						remainingFileEntriesBudget -= 1;
					}
				} else {
					newEntries.push(entry);
				}
			}

			const newEntriesThatFit = remainingFileEntriesBudget > 0 ? newEntries.slice(0, remainingFileEntriesBudget) : [];
			remainingFileEntriesBudget -= newEntriesThatFit.length;
			const suggestedFilesThatFit = remainingFileEntriesBudget > 0 ? suggestedFiles.slice(0, remainingFileEntriesBudget) : [];
			// Intentional: to make bad suggestions less annoying,
			// here we don't count the suggested files against the budget,
			// so that the Add Files button remains enabled and the user can easily
			// override the suggestions with their own manual file selections
			entries = [...entriesToPreserve, ...newEntriesThatFit, ...suggestedFilesThatFit];
			suggestedFilesInWorkingSetCount = suggestedFilesThatFit.length;
		} else {
			suggestedFilesInWorkingSetCount = entries.filter(e => e.kind === 'reference' && e.state === WorkingSetEntryState.Suggested).length;
		}
		overviewTitle.ariaLabel = overviewTitle.textContent;
		overviewTitle.tabIndex = 0;

		if (excludedEntries.length > 0) {
			overviewFileCount.textContent = ' ' + localize('chatEditingSession.excludedFiles', '({0}/{1} files)', this.chatEditingService.editingSessionFileLimit + excludedEntries.length, this.chatEditingService.editingSessionFileLimit);
		} else if (entries.length > 1) {
			const fileCount = entries.length - suggestedFilesInWorkingSetCount;
			overviewFileCount.textContent = ' ' + (fileCount === 1 ? localize('chatEditingSession.oneFile', '(1 file)') : localize('chatEditingSession.manyFiles', '({0} files)', fileCount));
		}

		const fileLimitReached = remainingFileEntriesBudget <= 0;
		overviewFileCount.classList.toggle('file-limit-reached', fileLimitReached);
		if (fileLimitReached) {
			let title = localize('chatEditingSession.fileLimitReached', 'You have reached the maximum number of files that can be added to the working set.');
			title += excludedEntries.length === 1 ? ' ' + localize('chatEditingSession.excludedOneFile', '1 file is excluded from the Working Set.') : '';
			title += excludedEntries.length > 1 ? ' ' + localize('chatEditingSession.excludedSomeFiles', '{0} files are excluded from the Working Set.', excludedEntries.length) : '';

			this._chatEditsFileLimitHover.value = getBaseLayerHoverDelegate().setupDelayedHover(overviewFileCount as HTMLElement,
				{
					content: title,
					appearance: { showPointer: true, compact: true },
					position: { hoverPosition: HoverPosition.ABOVE }
				});
		} else {
			this._chatEditsFileLimitHover.clear();
		}

		// Clear out the previous actions (if any)
		this._chatEditsActionsDisposables.clear();

		// Chat editing session actions
		const actionsContainer = overviewRegion.querySelector('.chat-editing-session-actions') as HTMLElement ?? dom.append(overviewRegion, $('.chat-editing-session-actions'));

		this._chatEditsActionsDisposables.add(this.instantiationService.createInstance(MenuWorkbenchButtonBar, actionsContainer, MenuId.ChatEditingWidgetToolbar, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: {
				arg: { sessionId: chatEditingSession.chatSessionId },
			},
			buttonConfigProvider: (action) => {
				if (action.id === ChatEditingShowChangesAction.ID || action.id === ChatEditingSaveAllAction.ID || action.id === ChatEditingRemoveAllFilesAction.ID) {
					return { showIcon: true, showLabel: false, isSecondary: true };
				}
				return undefined;
			}
		}));

		if (!chatEditingSession) {
			return;
		}

		if (currentChatEditingState === ChatEditingSessionState.StreamingEdits || chatWidget?.viewModel?.requestInProgress) {
			this._chatEditsProgress ??= new ProgressBar(innerContainer);
			this._chatEditsProgress?.infinite().show(500);
		}

		// Working set
		const workingSetContainer = innerContainer.querySelector('.chat-editing-session-list') as HTMLElement ?? dom.append(innerContainer, $('.chat-editing-session-list'));
		this._register(addDisposableListener(workingSetContainer, 'focusin', () => this._inChatEditWorkingSetCtx?.set(true)));
		this._register(addDisposableListener(workingSetContainer, 'focusout', () => this._inChatEditWorkingSetCtx?.set(false)));
		if (!this._chatEditList) {
			this._chatEditList = this._chatEditsListPool.get();
			const list = this._chatEditList.object;
			this._chatEditsDisposables.add(this._chatEditList);
			this._chatEditsDisposables.add(list.onDidFocus(() => {
				this._onDidFocus.fire();
			}));
			this._chatEditsDisposables.add(list.onDidOpen((e) => {
				if (e.element?.kind === 'reference' && URI.isUri(e.element.reference)) {
					const modifiedFileUri = e.element.reference;

					const entry = chatEditingSession.getEntry(modifiedFileUri);
					const diffInfo = entry?.diffInfo.get();
					const range = diffInfo?.changes.at(0)?.modified.toExclusiveRange();

					this.editorService.openEditor({
						resource: modifiedFileUri,
						options: {
							...e.editorOptions,
							selection: range,
						}
					}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
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

		const maxItemsShown = 6;
		const itemsShown = Math.min(entries.length + excludedEntries.length, maxItemsShown);
		const height = itemsShown * 22;
		const list = this._chatEditList.object;
		list.layout(height);
		list.getHTMLElement().style.height = `${height}px`;
		list.splice(0, list.length, entries);
		list.splice(entries.length, 0, excludedEntries);
		this._combinedChatEditWorkingSetEntries = coalesce(entries.map((e) => e.kind === 'reference' && URI.isUri(e.reference) ? ({ uri: e.reference, isMarkedReadonly: e.isMarkedReadonly }) : undefined));

		const addFilesElement = innerContainer.querySelector('.chat-editing-session-toolbar-actions') as HTMLElement ?? dom.append(innerContainer, $('.chat-editing-session-toolbar-actions'));

		const hoverDelegate = getDefaultHoverDelegate('element');

		const button = this._chatEditsActionsDisposables.add(new Button(addFilesElement, {
			supportIcons: true,
			secondary: true,
			hoverDelegate
		}));
		// Disable the button if the entries that are not suggested exceed the budget
		button.enabled = remainingFileEntriesBudget > 0;
		button.label = localize('chatAddFiles', '{0} Add Files...', '$(add)');
		button.setTitle(button.enabled ? localize('addFiles.label', 'Add files to your working set') : localize('chatEditingSession.fileLimitReached', 'You have reached the maximum number of files that can be added to the working set.'));
		this._chatEditsActionsDisposables.add(button.onDidClick(() => {
			this.commandService.executeCommand('workbench.action.chat.editing.attachFiles', { widget: chatWidget });
		}));
		dom.append(addFilesElement, button.element);

		// RELATED files (after Add Files...)
		for (const [uri, metadata] of chatEditingSession.workingSet) {
			if (metadata.state !== WorkingSetEntryState.Suggested) {
				continue;
			}
			const addBtn = this._chatEditsActionsDisposables.add(new Button(addFilesElement, {
				supportIcons: true,
				secondary: true,
				hoverDelegate
			}));
			addBtn.enabled = remainingFileEntriesBudget > 0;
			addBtn.label = this.labelService.getUriBasenameLabel(uri);
			addBtn.element.classList.add('monaco-icon-label', ...getIconClasses(this.modelService, this.languageService, uri, FileKind.FILE));
			addBtn.setTitle(localize('suggeste.title', "{0} - {1}", this.labelService.getUriLabel(uri, { relative: true }), metadata.description ?? ''));

			this._chatEditsActionsDisposables.add(addBtn.onDidClick(() => {
				group.remove(); // REMOVE asap
				chatEditingSession.addFileToWorkingSet(uri);
			}));

			const rmBtn = this._chatEditsActionsDisposables.add(new Button(addFilesElement, {
				supportIcons: false,
				secondary: true,
				hoverDelegate
			}));
			rmBtn.icon = Codicon.close;
			rmBtn.setTitle(localize('chatEditingSession.removeSuggested', 'Remove suggestion'));
			this._chatEditsActionsDisposables.add(rmBtn.onDidClick(() => {
				group.remove(); // REMOVE asap
				chatEditingSession.remove(WorkingSetEntryRemovalReason.User, uri);
			}));

			const sep = document.createElement('div');
			sep.classList.add('separator');

			const group = document.createElement('span');
			group.classList.add('monaco-button-dropdown', 'sidebyside-button');
			group.appendChild(addBtn.element);
			group.appendChild(sep);
			group.appendChild(rmBtn.element);
			dom.append(addFilesElement, group);

			this._chatEditsActionsDisposables.add(toDisposable(() => {
				group.remove();
			}));
		}

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
		const inputToolbarPadding = this.inputActionsToolbar.getItemsLength() ? (this.inputActionsToolbar.getItemsLength() - 1) * 4 : 0;
		return {
			inputEditorBorder: 2,
			followupsHeight: this.followupsContainer.offsetHeight,
			inputPartEditorHeight: Math.min(this._inputEditor.getContentHeight(), this.inputEditorMaxHeight),
			inputPartHorizontalPadding: this.options.renderStyle === 'compact' ? 16 : 32,
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

	getViewState(): IChatInputState {
		return this.getInputState();
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
		options: IDropdownWithPrimaryActionViewItemOptions,
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
				...options,
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
			const secondary = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
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
		options: IMenuEntryActionViewItemOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IAccessibilityService _accessibilityService: IAccessibilityService
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, _accessibilityService);

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

		// TODO@roblourens this should be a DropdownMenuActionViewItem, but we can't customize how it's rendered yet.
		this._register(dom.addDisposableListener(container, dom.EventType.KEY_UP, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				this._openContextMenu();
			}
		}));
	}

	protected override updateLabel(): void {
		if (this.label) {
			const model = this._languageModelsService.lookupLanguageModel(this.currentLanguageModel);
			if (model) {
				dom.reset(this.label, dom.$('span.chat-model-label', undefined, model.name), ...renderLabelWithIcons(`$(chevron-down)`));
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
					this.updateLabel();
					this.delegate.setModel(id);
				}
			};
		};

		const models = this._languageModelsService.getLanguageModelIds()
			.map(modelId => ({ id: modelId, model: this._languageModelsService.lookupLanguageModel(modelId)! }))
			.filter(entry => entry.model?.isUserSelectable);
		models.sort((a, b) => a.model.name.localeCompare(b.model.name));
		this._contextMenuService.showContextMenu({
			getAnchor: () => this.element!,
			getActions: () => models.map(entry => setLanguageModelAction(entry.id, entry.model)),
		});
	}
}

const chatInputEditorContainerSelector = '.interactive-input-editor';
setupSimpleEditorSelectionStyling(chatInputEditorContainerSelector);
