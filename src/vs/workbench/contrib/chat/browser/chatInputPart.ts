/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Emitter } from 'vs/base/common/event';
import { HistoryNavigator } from 'vs/base/common/history';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { registerAndCreateHistoryNavigationContext } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IChatExecuteActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatFollowups } from 'vs/workbench/contrib/chat/browser/chatFollowups';
import { CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_IN_CHAT_INPUT } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatReplyFollowup } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatWidgetHistoryService } from 'vs/workbench/contrib/chat/common/chatWidgetHistoryService';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { isMacintosh } from 'vs/base/common/platform';

const $ = dom.$;

const INPUT_EDITOR_MAX_HEIGHT = 250;

export class ChatInputPart extends Disposable implements IHistoryNavigationWidget {
	public static readonly INPUT_SCHEME = 'chatSessionInput';
	private static _counter = 0;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;

	private _onDidAcceptFollowup = this._register(new Emitter<IChatReplyFollowup>());
	readonly onDidAcceptFollowup = this._onDidAcceptFollowup.event;

	private inputEditorHeight = 0;
	private container!: HTMLElement;

	private followupsContainer!: HTMLElement;
	private followupsDisposables = this._register(new DisposableStore());

	private _inputEditor!: CodeEditorWidget;
	private _inputEditorElement!: HTMLElement;

	public get inputEditor() {
		return this._inputEditor;
	}

	private history: HistoryNavigator<string>;
	private setHistoryNavigationEnablement!: (enabled: boolean) => void;
	private inputModel: ITextModel | undefined;
	private inputEditorHasText: IContextKey<boolean>;
	private providerId: string | undefined;

	public readonly inputUri = URI.parse(`${ChatInputPart.INPUT_SCHEME}:input-${ChatInputPart._counter++}`);

	constructor(
		// private readonly editorOptions: ChatEditorOptions, // TODO this should be used
		private readonly options: { renderFollowups: boolean },
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
		this.history = new HistoryNavigator([], 5);
		this._register(this.historyService.onDidClearHistory(() => this.history.clear()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
				this.inputEditor.updateOptions({ ariaLabel: this._getAriaLabel() });
			}
		}));
	}

	private _getAriaLabel(): string {
		const verbose = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat);
		if (verbose) {
			const kbLabel = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getLabel();
			return kbLabel ? localize('actions.chat.accessibiltyHelp', "Chat Input,  Type to ask questions or type / for topics, press enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel) : localize('chatInput.accessibilityHelpNoKb', "Chat Input,  Type code here and press Enter to run. Use the Chat Accessibility Help command for more information.");
		}
		return localize('chatInput', "Chat Input");
	}

	setState(providerId: string, inputValue: string): void {
		this.providerId = providerId;
		const history = this.historyService.getHistory(providerId);
		this.history = new HistoryNavigator(history, 50);

		this.setValue(inputValue);
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
		const historyInput = (previous ?
			(this.history.previous() ?? this.history.first()) : this.history.next())
			?? '';

		aria.status(historyInput);
		this.setValue(historyInput);
		this.setHistoryNavigationEnablement(true);
	}

	private setValue(value: string): void {
		this.inputEditor.setValue(value);
		// always leave cursor at the end
		this.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });
	}

	focus() {
		this._inputEditor.focus();
	}

	async acceptInput(query?: string | IChatReplyFollowup): Promise<void> {
		const editorValue = this._inputEditor.getValue();
		if (!query && editorValue) {
			// Followups and programmatic messages don't go to history
			this.history.add(editorValue);
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
		const inputContainer = dom.append(this.container, $('.interactive-input-and-toolbar'));

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		CONTEXT_IN_CHAT_INPUT.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
		this.setHistoryNavigationEnablement = enabled => {
			historyNavigationBackwardsEnablement.set(enabled);
			historyNavigationForwardsEnablement.set(enabled);
		};

		const options = getSimpleEditorOptions(this.configurationService);
		options.readOnly = false;
		options.ariaLabel = this._getAriaLabel();
		options.fontFamily = DEFAULT_FONT_FAMILY;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.padding = { top: 8, bottom: 7 };
		options.cursorWidth = 1;
		options.wrappingStrategy = 'advanced';
		options.bracketPairColorization = { enabled: false };
		options.suggest = { showIcons: false };
		options.scrollbar = { ...(options.scrollbar ?? {}), vertical: 'hidden' };

		this._inputEditorElement = dom.append(inputContainer, $('.interactive-input-editor'));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorElement, options, getSimpleCodeEditorWidgetOptions()));

		this._register(this._inputEditor.onDidChangeModelContent(() => {
			const currentHeight = Math.min(this._inputEditor.getContentHeight(), INPUT_EDITOR_MAX_HEIGHT);
			if (currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
				this._onDidChangeHeight.fire();
			}

			// Only allow history navigation when the input is empty.
			// (If this model change happened as a result of a history navigation, this is canceled out by a call in this.navigateHistory)
			const model = this._inputEditor.getModel();
			const inputHasText = !!model && model.getValue() !== '';
			this.setHistoryNavigationEnablement(!inputHasText);
			this.inputEditorHasText.set(inputHasText);
		}));
		this._register(this._inputEditor.onDidFocusEditorText(() => {
			this._onDidFocus.fire();
			inputContainer.classList.toggle('focused', true);
		}));
		this._register(this._inputEditor.onDidBlurEditorText(() => {
			inputContainer.classList.toggle('focused', false);

			this._onDidBlur.fire();
		}));

		const toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, inputContainer, MenuId.ChatExecute, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));
		toolbar.getElement().classList.add('interactive-execute-toolbar');
		toolbar.context = <IChatExecuteActionContext>{ widget };

		this.inputModel = this.modelService.getModel(this.inputUri) || this.modelService.createModel('', null, this.inputUri, true);
		this.inputModel.updateOptions({ bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false } });
		this._inputEditor.setModel(this.inputModel);
		if (initialValue) {
			this.inputModel.setValue(initialValue);
			const lineNumber = this.inputModel.getLineCount();
			this._inputEditor.setPosition({ lineNumber, column: this.inputModel.getLineMaxColumn(lineNumber) });
		}
	}

	async renderFollowups(items?: IChatReplyFollowup[]): Promise<void> {
		if (!this.options.renderFollowups) {
			return;
		}
		this.followupsDisposables.clear();
		dom.clearNode(this.followupsContainer);

		if (items && items.length > 0) {
			this.followupsDisposables.add(new ChatFollowups(this.followupsContainer, items, undefined, followup => this._onDidAcceptFollowup.fire(followup)));
		}
	}

	layout(height: number, width: number): number {
		return this._layout(height, width);
	}

	private _layout(height: number, width: number, allowRecurse = true): number {
		const followupsHeight = this.followupsContainer.offsetHeight;

		const inputPartBorder = 1;
		const inputPartPadding = 24;
		const inputEditorHeight = Math.min(this._inputEditor.getContentHeight(), height - followupsHeight - inputPartPadding - inputPartBorder, INPUT_EDITOR_MAX_HEIGHT);

		const inputEditorBorder = 2;
		const inputPartHeight = followupsHeight + inputEditorHeight + inputPartPadding + inputPartBorder + inputEditorBorder;

		const editorBorder = 2;
		const editorPadding = 8;
		const executeToolbarWidth = 25;

		const initialEditorScrollWidth = this._inputEditor.getScrollWidth();
		this._inputEditor.layout({ width: width - inputPartPadding - editorBorder - editorPadding - executeToolbarWidth, height: inputEditorHeight });

		if (allowRecurse && initialEditorScrollWidth < 10) {
			// This is probably the initial layout. Now that the editor is layed out with its correct width, it should report the correct contentHeight
			return this._layout(height, width, false);
		}

		return inputPartHeight;
	}

	saveState(): void {
		const inputHistory = this.history.getHistory();
		this.historyService.saveHistory(this.providerId!, inputHistory);
	}
}
