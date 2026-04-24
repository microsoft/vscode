/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatInput.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../../workbench/contrib/accessibility/common/accessibilityCommands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { getSimpleEditorOptions } from '../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';
import { SessionTypePicker } from './sessionTypePicker.js';
import { Menus } from '../../../browser/menus.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { SlashCommandHandler } from './slashCommands.js';
import { VariableCompletionHandler } from './variableCompletions.js';
import { IChatModelInputState } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ChatHistoryNavigator } from '../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { IHistoryNavigationWidget } from '../../../../base/browser/history.js';
import { registerAndCreateHistoryNavigationContext, IHistoryNavigationContext } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';


const STORAGE_KEY_DRAFT_STATE = 'sessions.draftState';
const MIN_EDITOR_HEIGHT = 50;
const MAX_EDITOR_HEIGHT = 200;

interface IDraftState {
	inputText: string;
	attachments: readonly IChatRequestVariableEntry[];
}

/**
 * Randomized, friendly placeholders shown in the new-session chat input
 * to add a bit of personality. One is picked per widget instance, avoiding
 * an immediate repeat of the previous pick.
 */
const RANDOM_PLACEHOLDERS = [
	localize('sessionsChatInput.placeholder.whatAreYouBuilding', "What are you building?"),
	localize('sessionsChatInput.placeholder.whatWillYouShipToday', "What will you ship today?"),
	localize('sessionsChatInput.placeholder.describeWhatYouWantToBuild', "Describe what you want to build"),
	localize('sessionsChatInput.placeholder.whatsYourNextMilestone', "What's your next milestone?"),
	localize('sessionsChatInput.placeholder.whatAreYouTryingToAchieve', "What are you trying to achieve?"),
	localize('sessionsChatInput.placeholder.pitchYourIdea', "Pitch your idea"),
	localize('sessionsChatInput.placeholder.whatsTheGoal', "What's the goal?"),
	localize('sessionsChatInput.placeholder.whatWillYouCreate', "What will you create?"),
	localize('sessionsChatInput.placeholder.whatFeatureAreYouDreamingUp', "What feature are you dreaming up?"),
	localize('sessionsChatInput.placeholder.describeTheOutcome', "Describe the outcome you want"),
	localize('sessionsChatInput.placeholder.whatProblemAreYouSolving', "What problem are you solving?"),
	localize('sessionsChatInput.placeholder.whatsNextOnYourRoadmap', "What's next on your roadmap?"),
	localize('sessionsChatInput.placeholder.whatWouldYouLikeToAutomate', "What would you like to automate?"),
	localize('sessionsChatInput.placeholder.whatWillYouLaunch', "What will you launch?"),
	localize('sessionsChatInput.placeholder.describeYourMission', "Describe your mission"),
];

let lastPlaceholderIndex = -1;
function getRandomChatInputPlaceholder(): string {
	let index = Math.floor(Math.random() * RANDOM_PLACEHOLDERS.length);
	if (index === lastPlaceholderIndex) {
		index = (index + 1) % RANDOM_PLACEHOLDERS.length;
	}
	lastPlaceholderIndex = index;
	return RANDOM_PLACEHOLDERS[index];
}

// #region --- New Chat Widget ---

export class NewChatInputWidget extends Disposable implements IHistoryNavigationWidget {

	readonly sessionTypePicker: SessionTypePicker;

	// IHistoryNavigationWidget
	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;
	private readonly _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;
	get element(): HTMLElement { return this._editorContainer; }

	// Input
	private _editor!: CodeEditorWidget;
	private _editorContainer!: HTMLElement;

	// Send button
	private _sendButton: Button | undefined;
	private _sending = false;

	// Loading state
	private _loadingSpinner: HTMLElement | undefined;
	private readonly _loadingDelayDisposable = this._register(new MutableDisposable());

	// Attached context
	private readonly _contextAttachments: NewChatContextAttachments;

	// Slash commands
	private _slashCommandHandler: SlashCommandHandler | undefined;

	// Input state
	private _draftState: IDraftState | undefined = {
		inputText: '',
		attachments: [],
	};

	// Input history
	private readonly _history: ChatHistoryNavigator;
	private _historyNavigationBackwardsEnablement!: IHistoryNavigationContext['historyNavigationBackwardsEnablement'];
	private _historyNavigationForwardsEnablement!: IHistoryNavigationContext['historyNavigationForwardsEnablement'];

	constructor(
		private readonly options: {
			getContextFolderUri: () => URI | undefined;
			sendRequest: (query: string, attachments?: IChatRequestVariableEntry[]) => Promise<void>;
			canSendRequest: IObservable<boolean>;
			loading: IObservable<boolean>;
			minEditorHeight?: number;
			placeholder?: string;
		},
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
		@IHoverService private readonly hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();
		this._history = this._register(this.instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
		this._contextAttachments = this._register(this.instantiationService.createInstance(NewChatContextAttachments));
		this.sessionTypePicker = this._register(this.instantiationService.createInstance(SessionTypePicker));
		this._register(this._contextAttachments.onDidChangeContext(() => {
			this._updateDraftState();
			this.focus();
		}));
		this._register(autorun(reader => {
			this.options.canSendRequest.read(reader);
			const isLoading = this.options.loading.read(reader);
			this._loadingSpinner?.classList.toggle('visible', isLoading);
			this._updateSendButtonState();
		}));
	}

	// --- Rendering ---

	render(parent: HTMLElement, root: HTMLElement): void {
		// Input slot
		const chatInputContainer = dom.append(parent, dom.$('.new-chat-input-container'));

		// Overflow widget DOM node at the top level so the suggest widget
		// is not clipped by any overflow:hidden ancestor.
		const editorOverflowWidgetsDomNode = dom.append(root, dom.$('.sessions-chat-editor-overflow.monaco-editor'));
		this._register({ dispose: () => editorOverflowWidgetsDomNode.remove() });

		// Input area inside the input slot
		const inputArea = dom.append(chatInputContainer, dom.$('.new-chat-input-area'));

		// Attachments row (pills only) inside input area, above editor
		const attachRow = dom.append(inputArea, dom.$('.sessions-chat-attach-row'));
		const attachedContextContainer = dom.append(attachRow, dom.$('.sessions-chat-attached-context'));
		this._contextAttachments.renderAttachedContext(attachedContextContainer);
		this._contextAttachments.registerDropTarget(root);
		this._contextAttachments.registerPasteHandler(inputArea);

		this._createEditor(inputArea, editorOverflowWidgetsDomNode);
		this._createInputToolbar(inputArea);

		const newChatBottomContainer = dom.append(parent, dom.$('.new-chat-bottom-container'));
		const newChatControlsContainer = dom.append(newChatBottomContainer, dom.$('.new-chat-controls-container'));
		this.sessionTypePicker.render(newChatControlsContainer);
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, dom.append(newChatControlsContainer, dom.$('')), Menus.NewSessionControl, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));

		const repoConfigContainer = dom.append(newChatBottomContainer, dom.$('.new-chat-repo-config-container'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, repoConfigContainer, Menus.NewSessionRepositoryConfig, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));

		// Restore draft input state from storage
		this._restoreState();

		// Layout editor after the input slot fade-in animation completes
		this._register(dom.addDisposableListener(chatInputContainer, 'animationend', () => {
			this._editor?.layout();
		}, { once: true }));
	}

	private _updateInputLoadingState(): void {
		const loading = this._sending;
		if (loading) {
			if (!this._loadingDelayDisposable.value) {
				const timer = setTimeout(() => {
					this._loadingDelayDisposable.clear();
					if (this._sending) {
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

	private _getAriaLabel(): string {
		const verbose = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.SessionsChat);
		if (verbose) {
			const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			return kbLabel
				? localize('chatInput.accessibilityHelp', "Chat input. Press Enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel)
				: localize('chatInput.accessibilityHelpNoKb', "Chat input. Press Enter to send out the request. Use the Chat Accessibility Help command for more information.");
		}
		return localize('chatInput', "Chat input");
	}

	private _createEditor(container: HTMLElement, overflowWidgetsDomNode: HTMLElement): void {
		const editorContainer = this._editorContainer = dom.append(container, dom.$('.sessions-chat-editor'));
		const minHeight = this.options.minEditorHeight ?? MIN_EDITOR_HEIGHT;
		editorContainer.style.height = `${minHeight}px`;

		// Create scoped context key service and register history navigation
		// BEFORE creating the editor, so the editor's context key scope is a child
		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(container));
		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
		this._historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
		this._historyNavigationForwardsEnablement = historyNavigationForwardsEnablement;

		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));

		const uri = URI.from({ scheme: 'sessions-chat', path: `input-${Date.now()}` });
		const textModel = this._register(this.modelService.createModel('', null, uri, true));

		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(this.configurationService),
			readOnly: false,
			ariaLabel: this._getAriaLabel(),
			placeholder: this.options.placeholder ?? getRandomChatInputPlaceholder(),
			fontFamily: 'system-ui, -apple-system, sans-serif',
			fontSize: 13,
			lineHeight: 20,
			cursorWidth: 1,
			padding: { top: 8, bottom: 2 },
			wrappingStrategy: 'advanced',
			stickyScroll: { enabled: false },
			renderWhitespace: 'none',
			overflowWidgetsDomNode,
			suggest: {
				showIcons: true,
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
				PlaceholderTextContribution.ID,
			]),
		};

		this._editor = this._register(scopedInstantiationService.createInstance(
			CodeEditorWidget, editorContainer, editorOptions, widgetOptions,
		));
		this._editor.setModel(textModel);

		// Ensure suggest widget renders above the input (not clipped by container)
		SuggestController.get(this._editor)?.forceRenderingAbove();

		// Update aria label when accessibility verbosity setting changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.SessionsChat)) {
				this._editor.updateOptions({ ariaLabel: this._getAriaLabel() });
			}
		}));

		this._register(this._editor.onDidFocusEditorWidget(() => this._onDidFocus.fire()));
		this._register(this._editor.onDidBlurEditorWidget(() => this._onDidBlur.fire()));

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
				this._send();
			}
			// Cmd+/ / Ctrl+/ — open the context picker (same as the attach button)
			if (e.equals(KeyMod.CtrlCmd | KeyCode.Slash)) {
				e.preventDefault();
				e.stopPropagation();
				this._contextAttachments.showPicker(this.options.getContextFolderUri());
			}
		}));

		// Update history navigation enablement based on cursor position
		const updateHistoryNavigationEnablement = () => {
			const model = this._editor.getModel();
			const position = this._editor.getPosition();
			if (!model || !position) {
				return;
			}
			this._historyNavigationBackwardsEnablement.set(position.lineNumber === 1 && position.column === 1);
			this._historyNavigationForwardsEnablement.set(position.lineNumber === model.getLineCount() && position.column === model.getLineMaxColumn(position.lineNumber));
		};
		this._register(this._editor.onDidChangeCursorPosition(() => updateHistoryNavigationEnablement()));
		updateHistoryNavigationEnablement();

		let previousHeight = -1;
		this._register(this._editor.onDidContentSizeChange(e => {
			if (!e.contentHeightChanged) {
				return;
			}
			const contentHeight = this._editor.getContentHeight();
			const clampedHeight = Math.min(MAX_EDITOR_HEIGHT, Math.max(this.options.minEditorHeight ?? MIN_EDITOR_HEIGHT, contentHeight));
			if (clampedHeight === previousHeight) {
				return;
			}
			previousHeight = clampedHeight;
			this._editorContainer.style.height = `${clampedHeight}px`;
			this._editor.layout();
		}));

		// Slash commands
		this._slashCommandHandler = this._register(this.instantiationService.createInstance(SlashCommandHandler, this._editor));

		// Variable completions (#file, #folder)
		this._register(this.instantiationService.createInstance(
			VariableCompletionHandler, this._editor, this._contextAttachments, () => this.options.getContextFolderUri(),
		));

		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateDraftState();
			this._updateSendButtonState();
		}));
	}

	private _createAttachButton(container: HTMLElement): void {
		const attachButton = dom.append(container, dom.$('.sessions-chat-attach-button'));
		const attachButtonLabel = localize('addContext', "Add Context...");
		attachButton.tabIndex = 0;
		attachButton.role = 'button';
		attachButton.ariaLabel = attachButtonLabel;
		this._register(this.hoverService.setupDelayedHover(attachButton, {
			content: attachButtonLabel,
			position: { hoverPosition: HoverPosition.BELOW },
			appearance: { showPointer: true }
		}));
		dom.append(attachButton, renderIcon(Codicon.add));
		this._register(dom.addDisposableListener(attachButton, dom.EventType.CLICK, () => {
			this._contextAttachments.showPicker(this.options.getContextFolderUri());
		}));
	}

	private _createInputToolbar(container: HTMLElement): void {
		const toolbar = dom.append(container, dom.$('.sessions-chat-toolbar'));

		this._createAttachButton(toolbar);

		// Session config pickers (mode, model) — rendered via MenuWorkbenchToolBar
		// Visibility controlled by context keys (isActiveSessionBackgroundProvider, isNewChatSession)
		const configContainer = dom.append(toolbar, dom.$('.sessions-chat-config-toolbar'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, configContainer, Menus.NewSessionConfig, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));

		dom.append(toolbar, dom.$('.sessions-chat-toolbar-spacer'));

		this._loadingSpinner = dom.append(toolbar, dom.$('.sessions-chat-loading-spinner'));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this._loadingSpinner, localize('loading', "Loading...")));

		const sendButtonContainer = dom.append(toolbar, dom.$('.sessions-chat-send-button'));
		const sendButton = this._sendButton = this._register(new Button(sendButtonContainer, {
			secondary: true,
			title: localize('send', "Send"),
			ariaLabel: localize('send', "Send"),
		}));
		sendButton.icon = Codicon.arrowUp;
		this._register(sendButton.onDidClick(() => this._send()));
	}

	// --- Input History (IHistoryNavigationWidget) ---

	showPreviousValue(): void {
		if (this._history.isAtStart()) {
			return;
		}
		if (this._draftState?.inputText || this._draftState?.attachments.length) {
			this._history.overlay(this._toHistoryEntry(this._draftState));
		}
		this._navigateHistory(true);
	}

	showNextValue(): void {
		if (this._history.isAtEnd()) {
			return;
		}
		if (this._draftState?.inputText || this._draftState?.attachments.length) {
			this._history.overlay(this._toHistoryEntry(this._draftState));
		}
		this._navigateHistory(false);
	}

	private _updateDraftState(): void {
		this._draftState = {
			inputText: this._editor?.getModel()?.getValue() ?? '',
			attachments: [...this._contextAttachments.attachments],
		};
	}

	private _toHistoryEntry(draft: IDraftState): IChatModelInputState {
		return {
			...draft,
			mode: { id: ChatModeKind.Agent, kind: ChatModeKind.Agent },
			selectedModel: undefined,
			selections: [],
			contrib: {},
		};
	}

	private _navigateHistory(previous: boolean): void {
		const entry = previous ? this._history.previous() : this._history.next();
		const inputText = entry?.inputText ?? '';
		if (entry) {
			this._editor?.getModel()?.setValue(inputText);
			this._contextAttachments.setAttachments(entry.attachments);
		}
		aria.status(inputText);
		if (previous) {
			this._editor.setPosition({ lineNumber: 1, column: 1 });
		} else {
			const model = this._editor.getModel();
			if (model) {
				const lastLine = model.getLineCount();
				this._editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
			}
		}
	}

	// --- Send ---


	private async _send(): Promise<void> {
		let query = this._editor.getModel()?.getValue().trim();
		if (!query || this._sending) {
			return;
		}

		// Check for slash commands first
		if (this._slashCommandHandler?.tryExecuteSlashCommand(query)) {
			this._editor.getModel()?.setValue('');
			return;
		}

		// Expand prompt/skill slash commands into a CLI-friendly reference
		const expanded = this._slashCommandHandler?.tryExpandPromptSlashCommand(query);
		if (expanded) {
			query = expanded;
		}

		const attachedContext = this._contextAttachments.attachments.length > 0
			? [...this._contextAttachments.attachments]
			: undefined;

		if (this._draftState) {
			this._history.append(this._toHistoryEntry(this._draftState));
		}
		this._clearDraftState();

		this._sending = true;
		this._editor.updateOptions({ readOnly: true });
		this._updateSendButtonState();
		this._updateInputLoadingState();

		try {
			await this.options.sendRequest(query, attachedContext);
			this._contextAttachments.clear();
			this._editor.getModel()?.setValue('');
		} catch (e) {
			this.logService.error('Failed to send request:', e);
		}

		this._sending = false;
		this._editor.updateOptions({ readOnly: false });
		this._updateSendButtonState();
		this._updateInputLoadingState();
	}

	private _updateSendButtonState(): void {
		if (!this._sendButton) {
			return;
		}
		const hasText = !!this._editor?.getModel()?.getValue().trim();
		this._sendButton.enabled = !this._sending && hasText && this.options.canSendRequest.get();
	}

	private _restoreState(): void {
		const draft = this._getDraftState();
		if (draft) {
			this._editor?.getModel()?.setValue(draft.inputText);
			if (draft.attachments?.length) {
				this._contextAttachments.setAttachments(draft.attachments.map(IChatRequestVariableEntry.fromExport));
			}
		}
	}

	private _getDraftState(): IDraftState | undefined {
		const raw = this.storageService.get(STORAGE_KEY_DRAFT_STATE, StorageScope.WORKSPACE);
		if (!raw) {
			return undefined;
		}
		try {
			return JSON.parse(raw);
		} catch {
			return undefined;
		}
	}

	private _clearDraftState(): void {
		this._draftState = { inputText: '', attachments: [] };
		this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(this._draftState), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	saveState(): void {
		if (this._draftState) {
			const state = {
				...this._draftState,
				attachments: this._draftState.attachments.map(IChatRequestVariableEntry.toExport),
			};
			this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	layout(_height: number, _width: number): void {
		this._editor?.layout();
	}

	focus(): void {
		this._editor?.focus();
	}

	prefillInput(text: string): void {
		const editor = this._editor;
		const model = editor?.getModel();
		if (editor && model) {
			model.setValue(text);
			const lastLine = model.getLineCount();
			const maxColumn = model.getLineMaxColumn(lastLine);
			editor.setPosition({ lineNumber: lastLine, column: maxColumn });
			editor.focus();
		}
	}

	sendQuery(text: string): void {
		const model = this._editor?.getModel();
		if (model) {
			model.setValue(text);
			this._send();
		}
	}
}

// #endregion
