/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import { ActionViewItem, IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Checkbox } from 'vs/base/browser/ui/toggle/toggle';
import { IAction } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { HistoryNavigator } from 'vs/base/common/history';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IDimension } from 'vs/editor/common/core/dimension';
import { IPosition } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { HoverController } from 'vs/editor/contrib/hover/browser/hover';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { registerAndCreateHistoryNavigationContext } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { defaultCheckboxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { asCssVariableWithDefault, checkboxBorder, inputBackground } from 'vs/platform/theme/common/colorRegistry';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { ChatSubmitEditorAction, ChatSubmitSecondaryAgentEditorAction } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatExecuteActionContext, SubmitAction } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatFollowups } from 'vs/workbench/contrib/chat/browser/chatFollowups';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_INPUT_CURSOR_AT_TOP, CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_IN_CHAT_INPUT } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { chatAgentLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatFollowup } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IChatHistoryEntry, IChatWidgetHistoryService } from 'vs/workbench/contrib/chat/common/chatWidgetHistoryService';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';

const $ = dom.$;

const INPUT_EDITOR_MAX_HEIGHT = 250;

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

	private _onDidAcceptFollowup = this._register(new Emitter<{ followup: IChatFollowup; response: IChatResponseViewModel | undefined }>());
	readonly onDidAcceptFollowup = this._onDidAcceptFollowup.event;

	private inputEditorHeight = 0;
	private container!: HTMLElement;

	private followupsContainer!: HTMLElement;
	private followupsDisposables = this._register(new DisposableStore());

	private implicitContextContainer!: HTMLElement;
	private implicitContextLabel!: HTMLElement;
	private implicitContextCheckbox!: Checkbox;
	private implicitContextSettingEnabled = false;
	get implicitContextEnabled() {
		return this.implicitContextCheckbox.checked;
	}

	private _inputPartHeight: number = 0;
	get inputPartHeight() {
		return this._inputPartHeight;
	}

	private _inputEditor!: CodeEditorWidget;
	private _inputEditorElement!: HTMLElement;

	private toolbar!: MenuWorkbenchToolBar;

	get inputEditor() {
		return this._inputEditor;
	}

	private history: HistoryNavigator<IChatHistoryEntry>;
	private historyNavigationBackwardsEnablement!: IContextKey<boolean>;
	private historyNavigationForewardsEnablement!: IContextKey<boolean>;
	private onHistoryEntry = false;
	private inHistoryNavigation = false;
	private inputModel: ITextModel | undefined;
	private inputEditorHasText: IContextKey<boolean>;
	private chatCursorAtTop: IContextKey<boolean>;
	private providerId: string | undefined;

	private cachedDimensions: dom.Dimension | undefined;
	private cachedToolbarWidth: number | undefined;

	readonly inputUri = URI.parse(`${ChatInputPart.INPUT_SCHEME}:input-${ChatInputPart._counter++}`);

	constructor(
		// private readonly editorOptions: ChatEditorOptions, // TODO this should be used
		private readonly options: { renderFollowups: boolean; renderStyle?: 'default' | 'compact' },
		@IChatWidgetHistoryService private readonly historyService: IChatWidgetHistoryService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super();

		this.inputEditorHasText = CONTEXT_CHAT_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.chatCursorAtTop = CONTEXT_CHAT_INPUT_CURSOR_AT_TOP.bindTo(contextKeyService);

		this.history = new HistoryNavigator([], 5);
		this._register(this.historyService.onDidClearHistory(() => this.history.clear()));

		this.implicitContextSettingEnabled = this.configurationService.getValue<boolean>('chat.experimental.implicitContext');
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
				this.inputEditor.updateOptions({ ariaLabel: this._getAriaLabel() });
			}

			if (e.affectsConfiguration('chat.experimental.implicitContext')) {
				this.implicitContextSettingEnabled = this.configurationService.getValue<boolean>('chat.experimental.implicitContext');
			}
		}));
	}

	private _getAriaLabel(): string {
		const verbose = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat);
		if (verbose) {
			const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			return kbLabel ? localize('actions.chat.accessibiltyHelp', "Chat Input,  Type to ask questions or type / for topics, press enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel) : localize('chatInput.accessibilityHelpNoKb', "Chat Input,  Type code here and press Enter to run. Use the Chat Accessibility Help command for more information.");
		}
		return localize('chatInput', "Chat Input");
	}

	setState(providerId: string, inputValue: string | undefined): void {
		this.providerId = providerId;
		const history = this.historyService.getHistory(providerId);
		this.history = new HistoryNavigator(history, 50);

		if (typeof inputValue === 'string') {
			this.setValue(inputValue);
		}
	}

	get element(): HTMLElement {
		return this.container;
	}

	showPreviousValue(): void {
		this.navigateHistory(true);
	}

	showNextValue(): void {
		this.navigateHistory(false);
	}

	private navigateHistory(previous: boolean): void {
		const historyEntry = (previous ?
			(this.history.previous() ?? this.history.first()) : this.history.next())
			?? { text: '' };

		this.onHistoryEntry = previous || this.history.current() !== null;

		aria.status(historyEntry.text);

		this.inHistoryNavigation = true;
		this.setValue(historyEntry.text);
		this.inHistoryNavigation = false;

		this._onDidLoadInputState.fire(historyEntry.state);
		if (previous) {
			this._inputEditor.setPosition({ lineNumber: 1, column: 1 });
		} else {
			const model = this._inputEditor.getModel();
			if (!model) {
				return;
			}

			this._inputEditor.setPosition(getLastPosition(model));
		}
	}

	setValue(value: string): void {
		this.inputEditor.setValue(value);
		// always leave cursor at the end
		this.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });
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
	async acceptInput(userQuery?: string, inputState?: any): Promise<void> {
		if (userQuery) {
			this.history.add({ text: userQuery, state: inputState });
		}

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
		this._inputEditorElement.removeChild(domNode);
		this._inputEditor.setValue('');
		this._inputEditorElement.appendChild(domNode);
		this._inputEditor.focus();
	}

	render(container: HTMLElement, initialValue: string, widget: IChatWidget) {
		this.container = dom.append(container, $('.interactive-input-part'));

		this.followupsContainer = dom.append(this.container, $('.interactive-input-followups'));
		this.implicitContextContainer = dom.append(this.container, $('.chat-implicit-context'));
		this.initImplicitContext(this.implicitContextContainer);
		const inputAndSideToolbar = dom.append(this.container, $('.interactive-input-and-side-toolbar'));
		const inputContainer = dom.append(inputAndSideToolbar, $('.interactive-input-and-execute-toolbar'));

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		CONTEXT_IN_CHAT_INPUT.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
		this.historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
		this.historyNavigationForewardsEnablement = historyNavigationForwardsEnablement;

		const options = getSimpleEditorOptions(this.configurationService);
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

		this._inputEditorElement = dom.append(inputContainer, $('.interactive-input-editor'));
		const editorOptions = getSimpleCodeEditorWidgetOptions();
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([HoverController.ID]));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorElement, options, editorOptions));

		this._register(this._inputEditor.onDidChangeModelContent(() => {
			const currentHeight = Math.min(this._inputEditor.getContentHeight(), INPUT_EDITOR_MAX_HEIGHT);
			if (currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
				this._onDidChangeHeight.fire();
			}

			// Only allow history navigation when the input is empty.
			// (If this model change happened as a result of a history navigation, this is canceled out by a call in this.navigateHistory)
			const model = this._inputEditor.getModel();
			const inputHasText = !!model && model.getValueLength() > 0;
			this.inputEditorHasText.set(inputHasText);

			// If the user is typing on a history entry, then reset the onHistoryEntry flag so that history navigation can be disabled
			if (!this.inHistoryNavigation) {
				this.onHistoryEntry = false;
			}

			if (!this.onHistoryEntry) {
				this.historyNavigationForewardsEnablement.set(!inputHasText);
				this.historyNavigationBackwardsEnablement.set(!inputHasText);
			}
		}));
		this._register(this._inputEditor.onDidFocusEditorText(() => {
			this._onDidFocus.fire();
			inputContainer.classList.toggle('focused', true);
		}));
		this._register(this._inputEditor.onDidBlurEditorText(() => {
			inputContainer.classList.toggle('focused', false);

			this._onDidBlur.fire();
		}));
		this._register(this._inputEditor.onDidChangeCursorPosition(e => {
			const model = this._inputEditor.getModel();
			if (!model) {
				return;
			}

			const atTop = e.position.column === 1 && e.position.lineNumber === 1;
			this.chatCursorAtTop.set(atTop);

			if (this.onHistoryEntry) {
				this.historyNavigationBackwardsEnablement.set(atTop);
				this.historyNavigationForewardsEnablement.set(e.position.equals(getLastPosition(model)));
			}
		}));

		this.toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, inputContainer, MenuId.ChatExecute, {
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore, // keep it lean when hiding items and avoid a "..." overflow menu
			actionViewItemProvider: (action, options) => {
				if (action.id === SubmitAction.ID) {
					return this.instantiationService.createInstance(SubmitButtonActionViewItem, { widget } satisfies IChatExecuteActionContext, action, options);
				}

				return undefined;
			}
		}));
		this.toolbar.getElement().classList.add('interactive-execute-toolbar');
		this.toolbar.context = { widget } satisfies IChatExecuteActionContext;
		this._register(this.toolbar.onDidChangeMenuItems(() => {
			if (this.cachedDimensions && typeof this.cachedToolbarWidth === 'number' && this.cachedToolbarWidth !== this.toolbar.getItemsWidth()) {
				this.layout(this.cachedDimensions.height, this.cachedDimensions.width);
			}
		}));

		if (this.options.renderStyle === 'compact') {
			const toolbarSide = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, inputAndSideToolbar, MenuId.ChatInputSide, {
				menuOptions: {
					shouldForwardArgs: true
				}
			}));
			toolbarSide.getElement().classList.add('chat-side-toolbar');
			toolbarSide.context = { widget } satisfies IChatExecuteActionContext;
		}

		this.inputModel = this.modelService.getModel(this.inputUri) || this.modelService.createModel('', null, this.inputUri, true);
		this.inputModel.updateOptions({ bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false } });
		this._inputEditor.setModel(this.inputModel);
		if (initialValue) {
			this.inputModel.setValue(initialValue);
			const lineNumber = this.inputModel.getLineCount();
			this._inputEditor.setPosition({ lineNumber, column: this.inputModel.getLineMaxColumn(lineNumber) });
		}
	}

	private initImplicitContext(container: HTMLElement) {
		this.implicitContextCheckbox = new Checkbox('#selection', true, { ...defaultCheckboxStyles, checkboxBorder: asCssVariableWithDefault(checkboxBorder, inputBackground) });
		container.append(this.implicitContextCheckbox.domNode);
		this.implicitContextLabel = dom.append(container, $('span.chat-implicit-context-label'));
		this.implicitContextLabel.textContent = '#selection';
	}

	setImplicitContextKinds(kinds: string[]) {
		dom.setVisibility(this.implicitContextSettingEnabled && kinds.length > 0, this.implicitContextContainer);
		this.implicitContextLabel.textContent = localize('use', "Use") + ' ' + kinds.map(k => `#${k}`).join(', ');
	}

	async renderFollowups(items: IChatFollowup[] | undefined, response: IChatResponseViewModel | undefined): Promise<void> {
		if (!this.options.renderFollowups) {
			return;
		}
		this.followupsDisposables.clear();
		dom.clearNode(this.followupsContainer);

		if (items && items.length > 0) {
			this.followupsDisposables.add(this.instantiationService.createInstance<typeof ChatFollowups<IChatFollowup>, ChatFollowups<IChatFollowup>>(ChatFollowups, this.followupsContainer, items, undefined, followup => this._onDidAcceptFollowup.fire({ followup, response })));
		}
	}

	layout(height: number, width: number) {
		this.cachedDimensions = new dom.Dimension(width, height);

		return this._layout(height, width);
	}

	private previousInputEditorDimension: IDimension | undefined;
	private _layout(height: number, width: number, allowRecurse = true): void {
		const followupsHeight = this.followupsContainer.offsetHeight;

		const inputPartBorder = 1;
		const inputPartHorizontalPadding = 40;
		const inputPartVerticalPadding = 24;
		const inputEditorHeight = Math.min(this._inputEditor.getContentHeight(), height - followupsHeight - inputPartHorizontalPadding - inputPartBorder, INPUT_EDITOR_MAX_HEIGHT);
		const implicitContextHeight = this.implicitContextContainer.offsetHeight;

		const inputEditorBorder = 2;
		this._inputPartHeight = followupsHeight + inputEditorHeight + inputPartVerticalPadding + inputPartBorder + inputEditorBorder + implicitContextHeight;

		const editorBorder = 2;
		const editorPadding = 12;
		const executeToolbarWidth = this.cachedToolbarWidth = this.toolbar.getItemsWidth();
		const toolbarPadding = 4;
		const sideToolbarWidth = this.options.renderStyle === 'compact' ? 20 : 0;

		const initialEditorScrollWidth = this._inputEditor.getScrollWidth();
		const newEditorWidth = width - inputPartHorizontalPadding - editorBorder - editorPadding - executeToolbarWidth - sideToolbarWidth - toolbarPadding;
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

	saveState(): void {
		const inputHistory = this.history.getHistory();
		this.historyService.saveHistory(this.providerId!, inputHistory);
	}
}

class SubmitButtonActionViewItem extends ActionViewItem {
	private readonly _tooltip: string;

	constructor(
		context: unknown,
		action: IAction,
		options: IActionViewItemOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IChatAgentService chatAgentService: IChatAgentService,
	) {
		super(context, action, options);

		const primaryKeybinding = keybindingService.lookupKeybinding(ChatSubmitEditorAction.ID)?.getLabel();
		let tooltip = action.label;
		if (primaryKeybinding) {
			tooltip += ` (${primaryKeybinding})`;
		}

		const secondaryAgent = chatAgentService.getSecondaryAgent();
		if (secondaryAgent) {
			const secondaryKeybinding = keybindingService.lookupKeybinding(ChatSubmitSecondaryAgentEditorAction.ID)?.getLabel();
			if (secondaryKeybinding) {
				tooltip += `\n${chatAgentLeader}${secondaryAgent.id} (${secondaryKeybinding})`;
			}
		}

		this._tooltip = tooltip;
	}

	protected override getTooltip(): string | undefined {
		return this._tooltip;
	}
}

function getLastPosition(model: ITextModel): IPosition {
	return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}
