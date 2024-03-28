/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getActiveElement, getTotalHeight, h, reset, trackFocus } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { ISettableObservable, constObservable, derived, observableValue } from 'vs/base/common/observable';
import 'vs/css!./media/inlineChat';
import { ICodeEditor, IDiffEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { AccessibleDiffViewer, IAccessibleDiffViewerModel } from 'vs/editor/browser/widget/diffEditor/components/accessibleDiffViewer';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/embeddedDiffEditorWidget';
import { EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { DetailedLineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { ICodeEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IWorkbenchButtonBarOptions, MenuWorkbenchButtonBar } from 'vs/platform/actions/browser/buttonbar';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { asCssVariable, asCssVariableName, editorBackground, editorForeground, inputBackground } from 'vs/platform/theme/common/colorRegistry';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { ChatFollowups } from 'vs/workbench/contrib/chat/browser/chatFollowups';
import { ChatModel, IChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { isRequestVM, isResponseVM, isWelcomeVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { HunkData, HunkInformation, Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { asRange, invertLineRange } from 'vs/workbench/contrib/inlineChat/browser/utils';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_FOCUSED, IInlineChatFollowup, IInlineChatSlashCommand, inlineChatBackground } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { chatRequestBackground } from 'vs/workbench/contrib/chat/common/chatColors';
import { Selection } from 'vs/editor/common/core/selection';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { isNonEmptyArray, tail } from 'vs/base/common/arrays';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { setupCustomHover } from 'vs/base/browser/ui/hover/updatableHoverWidget';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';


export interface InlineChatWidgetViewState {
	editorViewState: ICodeEditorViewState;
	input: string;
	placeholder: string;
}

export interface IInlineChatWidgetConstructionOptions {
	/**
	 * The telemetry source for all commands of this widget
	 */
	telemetrySource: string;
	/**
	 * The menu that is inside the input editor, use for send, dictation
	 */
	inputMenuId: MenuId;
	/**
	 * The menu that next to the input editor, use for close, config etc
	 */
	widgetMenuId: MenuId;
	/**
	 * The menu that rendered as button bar, use for accept, discard etc
	 */
	statusMenuId: MenuId | { menu: MenuId; options: IWorkbenchButtonBarOptions };
	/**
	 * The men that rendered in the lower right corner, use for feedback
	 */
	feedbackMenuId: MenuId;

	/**
	 * @deprecated
	 * TODO@meganrogge,jrieken
	 * We need a way to make this configurable per editor/resource and not
	 * globally.
	 */
	editableCodeBlocks?: boolean;

	editorOverflowWidgetsDomNode?: HTMLElement;
}

export interface IInlineChatMessage {
	message: IMarkdownString;
	requestId: string;
	providerId: string;
}

export interface IInlineChatMessageAppender {
	appendContent(fragment: string): void;
	cancel(): void;
	complete(): void;
}

export class InlineChatWidget {

	protected readonly _elements = h(
		'div.inline-chat@root',
		[
			h('div.chat-widget@chatWidget'),
			h('div.progress@progress'),
			h('div.followUps.hidden@followUps'),
			h('div.previewDiff.hidden@previewDiff'),
			h('div.accessibleViewer@accessibleViewer'),
			h('div.status@status', [
				h('div.label.info.hidden@infoLabel'),
				h('div.actions.hidden@statusToolbar'),
				h('div.label.status.hidden@statusLabel'),
				h('div.actions.hidden@feedbackToolbar'),
			]),
		]
	);

	protected readonly _store = new DisposableStore();

	private readonly _defaultChatModel: ChatModel;
	private readonly _ctxInputEditorFocused: IContextKey<boolean>;
	private readonly _ctxResponseFocused: IContextKey<boolean>;

	private readonly _progressBar: ProgressBar;
	private readonly _chatWidget: ChatWidget;

	protected readonly _onDidChangeHeight = this._store.add(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = Event.filter(this._onDidChangeHeight.event, _ => !this._isLayouting);

	private readonly _onDidChangeInput = this._store.add(new Emitter<this>());
	readonly onDidChangeInput: Event<this> = this._onDidChangeInput.event;

	private _isLayouting: boolean = false;

	private _followUpDisposables = this._store.add(new DisposableStore());
	constructor(
		location: ChatAgentLocation,
		options: IInlineChatWidgetConstructionOptions,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
		@ITextModelService protected readonly _textModelResolverService: ITextModelService,
		@IChatService private readonly _chatService: IChatService,
	) {
		// Share hover delegates between toolbars to support instant hover between both
		// TODO@jrieken move into chat widget
		// const hoverDelegate = this._store.add(createInstantHoverDelegate());

		this._store.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.InlineChat)) {
				this._updateAriaLabel();
				// TODO@jrieken	FIX THIS
				// this._chatWidget.ariaLabel = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.InlineChat);
				this._elements.followUps.ariaLabel = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.InlineChat);
			}
		}));

		// toolbars
		this._progressBar = new ProgressBar(this._elements.progress);
		this._store.add(this._progressBar);

		let allowRequests = false;


		const scopedInstaService = _instantiationService.createChild(
			new ServiceCollection([
				IContextKeyService,
				this._store.add(_contextKeyService.createScoped(this._elements.chatWidget))
			])
		);

		this._chatWidget = scopedInstaService.createInstance(
			ChatWidget,
			location,
			{ resource: true },
			{
				defaultElementHeight: 32,
				renderStyle: 'compact',
				renderInputOnTop: true,
				supportsFileReferences: true,
				editorOverflowWidgetsDomNode: options.editorOverflowWidgetsDomNode,
				editableCodeBlocks: options.editableCodeBlocks,
				menus: {
					executeToolbar: options.inputMenuId,
					inputSideToolbar: options.widgetMenuId,
					telemetrySource: options.telemetrySource
				},
				filter: item => {
					if (isWelcomeVM(item)) {
						return false;
					}
					if (isRequestVM(item)) {
						return allowRequests;
					}
					return true;
				},
			},
			{
				listForeground: editorForeground,
				listBackground: inlineChatBackground,
				inputEditorBackground: inputBackground,
				resultEditorBackground: editorBackground
			}
		);
		this._chatWidget.render(this._elements.chatWidget);
		this._elements.chatWidget.style.setProperty(asCssVariableName(chatRequestBackground), asCssVariable(inlineChatBackground));
		this._chatWidget.setVisible(true);
		this._store.add(this._chatWidget);

		const viewModelListener = this._store.add(new MutableDisposable());
		this._store.add(this._chatWidget.onDidChangeViewModel(() => {
			const model = this._chatWidget.viewModel;

			if (!model) {
				allowRequests = false;
				viewModelListener.clear();
				return;
			}

			const updateAllowRequestsFilter = () => {
				let requestCount = 0;
				for (const item of model.getItems()) {
					if (isRequestVM(item)) {
						if (++requestCount >= 2) {
							break;
						}
					}
				}
				const newAllowRequest = requestCount >= 2;
				if (newAllowRequest !== allowRequests) {
					allowRequests = newAllowRequest;
					this._chatWidget.refilter();
				}
			};
			viewModelListener.value = model.onDidChange(updateAllowRequestsFilter);
		}));

		const viewModelStore = this._store.add(new DisposableStore());
		this._store.add(this._chatWidget.onDidChangeViewModel(() => {
			viewModelStore.clear();
			const viewModel = this._chatWidget.viewModel;
			if (viewModel) {
				viewModelStore.add(viewModel.onDidChange(() => this._onDidChangeHeight.fire()));
			}
			this._onDidChangeHeight.fire();
		}));

		this._store.add(this.chatWidget.onDidChangeContentHeight(() => {
			this._onDidChangeHeight.fire();
		}));

		// context keys
		this._ctxResponseFocused = CTX_INLINE_CHAT_RESPONSE_FOCUSED.bindTo(this._contextKeyService);
		const tracker = this._store.add(trackFocus(this.domNode));
		this._store.add(tracker.onDidBlur(() => this._ctxResponseFocused.set(false)));
		this._store.add(tracker.onDidFocus(() => this._ctxResponseFocused.set(true)));

		this._ctxInputEditorFocused = CTX_INLINE_CHAT_FOCUSED.bindTo(_contextKeyService);
		this._store.add(this._chatWidget.inputEditor.onDidFocusEditorWidget(() => this._ctxInputEditorFocused.set(true)));
		this._store.add(this._chatWidget.inputEditor.onDidBlurEditorWidget(() => this._ctxInputEditorFocused.set(false)));

		const statusMenuId = options.statusMenuId instanceof MenuId ? options.statusMenuId : options.statusMenuId.menu;
		const statusMenuOptions = options.statusMenuId instanceof MenuId ? undefined : options.statusMenuId.options;

		const statusButtonBar = this._instantiationService.createInstance(MenuWorkbenchButtonBar, this._elements.statusToolbar, statusMenuId, statusMenuOptions);
		this._store.add(statusButtonBar.onDidChange(() => this._onDidChangeHeight.fire()));
		this._store.add(statusButtonBar);


		const workbenchToolbarOptions = {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			}
		};

		const feedbackToolbar = this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.feedbackToolbar, options.feedbackMenuId, { ...workbenchToolbarOptions, hiddenItemStrategy: HiddenItemStrategy.Ignore });
		this._store.add(feedbackToolbar.onDidChangeMenuItems(() => this._onDidChangeHeight.fire()));
		this._store.add(feedbackToolbar);


		this._elements.followUps.tabIndex = 0;
		this._elements.followUps.ariaLabel = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.InlineChat);
		this._elements.statusLabel.tabIndex = 0;

		// this._elements.status
		this._store.add(setupCustomHover(getDefaultHoverDelegate('element'), this._elements.statusLabel, () => {
			return this._elements.statusLabel.dataset['title'];
		}));

		this._store.add(this._chatService.onDidPerformUserAction(e => {
			if (e.sessionId === this._chatWidget.viewModel?.model.sessionId && e.action.kind === 'vote') {
				this.updateStatus('Thank you for your feedback!', { resetAfter: 1250 });
			}
		}));

		// LEGACY - default chat model
		// this is only here for as long as we offer updateChatMessage
		this._defaultChatModel = this._store.add(this._instantiationService.createInstance(ChatModel, `inlineChatDefaultModel/${location}`, undefined));
		this._defaultChatModel.startInitialize();
		this._defaultChatModel.initialize({ id: 1 }, undefined);
		this.setChatModel(this._defaultChatModel);
	}

	private _updateAriaLabel(): void {
		if (!this._accessibilityService.isScreenReaderOptimized()) {
			return;
		}
		let label = defaultAriaLabel;
		if (this._configurationService.getValue<boolean>(AccessibilityVerbositySettingId.InlineChat)) {
			const kbLabel = this._keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			label = kbLabel ? localize('inlineChat.accessibilityHelp', "Inline Chat Input, Use {0} for Inline Chat Accessibility Help.", kbLabel) : localize('inlineChat.accessibilityHelpNoKb', "Inline Chat Input, Run the Inline Chat Accessibility Help command for more information.");
		}
		this._chatWidget.inputEditor.updateOptions({ ariaLabel: label });
	}

	dispose(): void {
		this._store.dispose();
	}

	get domNode(): HTMLElement {
		return this._elements.root;
	}

	get chatWidget(): ChatWidget {
		return this._chatWidget;
	}

	saveState() {
		this._chatWidget.saveState();
	}

	layout(widgetDim: Dimension) {
		this._isLayouting = true;
		try {
			this._doLayout(widgetDim);
		} finally {
			this._isLayouting = false;
		}
	}

	protected _doLayout(dimension: Dimension): void {
		const extraHeight = this._getExtraHeight();
		const progressHeight = getTotalHeight(this._elements.progress);
		const followUpsHeight = getTotalHeight(this._elements.followUps);
		const statusHeight = getTotalHeight(this._elements.status);

		// console.log('ZONE#Widget#layout', { height: dimension.height, extraHeight, progressHeight, followUpsHeight, statusHeight, LIST: dimension.height - progressHeight - followUpsHeight - statusHeight - extraHeight });

		this._elements.root.style.height = `${dimension.height - extraHeight}px`;
		this._elements.root.style.width = `${dimension.width}px`;
		this._elements.progress.style.width = `${dimension.width}px`;

		this._chatWidget.layout(
			dimension.height - progressHeight - followUpsHeight - statusHeight - extraHeight,
			dimension.width
		);
	}

	/**
	 * The content height of this widget is the size that would require no scrolling
	 */
	get contentHeight(): number {
		const data = {
			followUpsHeight: getTotalHeight(this._elements.followUps),
			chatWidgetContentHeight: this._chatWidget.contentHeight,
			progressHeight: getTotalHeight(this._elements.progress),
			statusHeight: getTotalHeight(this._elements.status),
			extraHeight: this._getExtraHeight()
		};
		const result = data.progressHeight + data.chatWidgetContentHeight + data.followUpsHeight + data.statusHeight + data.extraHeight;
		return result;
	}

	get minHeight(): number {
		// The chat widget is variable height and supports scrolling. It
		// should be at least 100px high and at most the content height.
		let value = this.contentHeight;
		value -= this._chatWidget.contentHeight;
		value += Math.min(100, this._chatWidget.contentHeight);
		return value;
	}

	protected _getExtraHeight(): number {
		return 12 /* padding */ + 2 /*border*/ + 12 /*shadow*/;
	}

	updateProgress(show: boolean) {
		if (show) {
			this._progressBar.show();
			this._progressBar.infinite();
		} else {
			this._progressBar.stop();
			this._progressBar.hide();
		}
	}

	get value(): string {
		return this._chatWidget.getInput();
	}

	set value(value: string) {
		this._chatWidget.setInput(value);
	}


	selectAll(includeSlashCommand: boolean = true) {
		// DEBT@jrieken
		// REMOVE when agents are adopted
		let startColumn = 1;
		if (!includeSlashCommand) {
			const match = /^(\/\w+)\s*/.exec(this._chatWidget.inputEditor.getModel()!.getLineContent(1));
			if (match) {
				startColumn = match[1].length + 1;
			}
		}
		this._chatWidget.inputEditor.setSelection(new Selection(1, startColumn, Number.MAX_SAFE_INTEGER, 1));
	}

	set placeholder(value: string) {
		this._chatWidget.setInputPlaceholder(value);
	}

	updateToolbar(show: boolean) {
		this._elements.statusToolbar.classList.toggle('hidden', !show);
		this._elements.feedbackToolbar.classList.toggle('hidden', !show);
		this._elements.status.classList.toggle('actions', show);
		this._elements.infoLabel.classList.toggle('hidden', show);
		this._onDidChangeHeight.fire();
	}

	async getCodeBlockInfo(codeBlockIndex: number): Promise<IResolvedTextEditorModel | undefined> {
		const { viewModel } = this._chatWidget;
		if (!viewModel) {
			return undefined;
		}
		for (const item of viewModel.getItems()) {
			if (isResponseVM(item)) {
				return viewModel.codeBlockModelCollection.get(viewModel.sessionId, item, codeBlockIndex)?.model;
			}
		}
		return undefined;
	}

	get responseContent(): string | undefined {
		const requests = this._chatWidget.viewModel?.model.getRequests();
		if (!isNonEmptyArray(requests)) {
			return undefined;
		}
		return tail(requests).response?.response.asString();
	}

	getChatModel(): IChatModel {
		return this._chatWidget.viewModel?.model ?? this._defaultChatModel;
	}

	setChatModel(chatModel: IChatModel) {
		this._chatWidget.setModel(chatModel, { inputValue: undefined });
	}


	/**
	 * @deprecated use `setChatModel` instead
	 */
	addToHistory(input: string) {
		if (this._chatWidget.viewModel?.model === this._defaultChatModel) {
			this._chatWidget.input.acceptInput(input);
		}
	}

	/**
	 * @deprecated use `setChatModel` instead
	 */
	updateChatMessage(message: IInlineChatMessage, isIncomplete: true): IInlineChatMessageAppender;
	updateChatMessage(message: IInlineChatMessage | undefined): void;
	updateChatMessage(message: IInlineChatMessage | undefined, isIncomplete?: boolean, isCodeBlockEditable?: boolean): IInlineChatMessageAppender | undefined;
	updateChatMessage(message: IInlineChatMessage | undefined, isIncomplete?: boolean, isCodeBlockEditable?: boolean): IInlineChatMessageAppender | undefined {

		if (!this._chatWidget.viewModel || this._chatWidget.viewModel.model !== this._defaultChatModel) {
			// this can only be used with the default chat model
			return;
		}

		const model = this._defaultChatModel;
		if (!message?.message.value) {
			for (const request of model.getRequests()) {
				model.removeRequest(request.id);
			}
			return;
		}

		const chatRequest = model.addRequest({ parts: [], text: '' }, { variables: [] });
		model.acceptResponseProgress(chatRequest, {
			kind: 'markdownContent',
			content: message.message
		});

		if (!isIncomplete) {
			model.completeResponse(chatRequest);
			return;
		}
		return {
			cancel: () => model.cancelRequest(chatRequest),
			complete: () => model.completeResponse(chatRequest),
			appendContent: (fragment: string) => {
				model.acceptResponseProgress(chatRequest, {
					kind: 'markdownContent',
					content: new MarkdownString(fragment)
				});
			}
		};
	}

	updateFollowUps(items: IInlineChatFollowup[], onFollowup: (followup: IInlineChatFollowup) => void): void;
	updateFollowUps(items: undefined): void;
	updateFollowUps(items: IInlineChatFollowup[] | undefined, onFollowup?: ((followup: IInlineChatFollowup) => void)) {
		this._followUpDisposables.clear();
		this._elements.followUps.classList.toggle('hidden', !items || items.length === 0);
		reset(this._elements.followUps);
		if (items && items.length > 0 && onFollowup) {
			this._followUpDisposables.add(
				this._instantiationService.createInstance(ChatFollowups, this._elements.followUps, items, ChatAgentLocation.Editor, undefined, onFollowup));
		}
		this._onDidChangeHeight.fire();
	}


	updateSlashCommands(commands: IInlineChatSlashCommand[]) {
		// this._inputWidget.updateSlashCommands(commands);
		// TODO@jrieken
	}

	updateInfo(message: string): void {
		this._elements.infoLabel.classList.toggle('hidden', !message);
		const renderedMessage = renderLabelWithIcons(message);
		reset(this._elements.infoLabel, ...renderedMessage);
		this._onDidChangeHeight.fire();
	}

	updateStatus(message: string, ops: { classes?: string[]; resetAfter?: number; keepMessage?: boolean; title?: string } = {}) {
		const isTempMessage = typeof ops.resetAfter === 'number';
		if (isTempMessage && !this._elements.statusLabel.dataset['state']) {
			const statusLabel = this._elements.statusLabel.innerText;
			const title = this._elements.statusLabel.dataset['title'];
			const classes = Array.from(this._elements.statusLabel.classList.values());
			setTimeout(() => {
				this.updateStatus(statusLabel, { classes, keepMessage: true, title });
			}, ops.resetAfter);
		}
		const renderedMessage = renderLabelWithIcons(message);
		reset(this._elements.statusLabel, ...renderedMessage);
		this._elements.statusLabel.className = `label status ${(ops.classes ?? []).join(' ')}`;
		this._elements.statusLabel.classList.toggle('hidden', !message);
		if (isTempMessage) {
			this._elements.statusLabel.dataset['state'] = 'temp';
		} else {
			delete this._elements.statusLabel.dataset['state'];
		}

		if (ops.title) {
			this._elements.statusLabel.dataset['title'] = ops.title;
		} else {
			delete this._elements.statusLabel.dataset['title'];
		}
		this._onDidChangeHeight.fire();
	}

	reset() {
		this._chatWidget.saveState();
		this.updateChatMessage(undefined);
		this.updateFollowUps(undefined);

		reset(this._elements.statusLabel);
		this._elements.statusLabel.classList.toggle('hidden', true);
		this._elements.statusToolbar.classList.add('hidden');
		this._elements.feedbackToolbar.classList.add('hidden');
		this.updateInfo('');

		this._elements.accessibleViewer.classList.toggle('hidden', true);
		this._onDidChangeHeight.fire();
	}

	focus() {
		this._chatWidget.focusInput();
	}

	hasFocus() {
		return this.domNode.contains(getActiveElement());
	}

}

const defaultAriaLabel = localize('aria-label', "Inline Chat Input");

const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
	isSimpleWidget: true,
	contributions: EditorExtensionsRegistry.getSomeEditorContributions([
		SnippetController2.ID,
		SuggestController.ID
	])
};

const _previewEditorEditorOptions: IDiffEditorConstructionOptions = {
	scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false, ignoreHorizontalScrollbarInContentHeight: true, },
	renderMarginRevertIcon: false,
	diffCodeLens: false,
	scrollBeyondLastLine: false,
	stickyScroll: { enabled: false },
	originalAriaLabel: localize('original', 'Original'),
	modifiedAriaLabel: localize('modified', 'Modified'),
	diffAlgorithm: 'advanced',
	readOnly: true,
	isInEmbeddedEditor: true
};


export class EditorBasedInlineChatWidget extends InlineChatWidget {

	private readonly _accessibleViewer = this._store.add(new MutableDisposable<HunkAccessibleDiffViewer>());

	private readonly _previewDiffEditor: Lazy<EmbeddedDiffEditorWidget>;
	private readonly _previewDiffModel = this._store.add(new MutableDisposable());

	constructor(
		private readonly _parentEditor: ICodeEditor,
		options: IInlineChatWidgetConstructionOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAccessibleViewService accessibleViewService: IAccessibleViewService,
		@ITextModelService textModelResolverService: ITextModelService,
		@IChatService chatService: IChatService,
	) {
		super(ChatAgentLocation.Editor, { ...options, editorOverflowWidgetsDomNode: _parentEditor.getOverflowWidgetsDomNode() }, instantiationService, contextKeyService, keybindingService, accessibilityService, configurationService, accessibleViewService, textModelResolverService, chatService);

		// preview editors
		this._previewDiffEditor = new Lazy(() => this._store.add(instantiationService.createInstance(EmbeddedDiffEditorWidget, this._elements.previewDiff, {
			useInlineViewWhenSpaceIsLimited: false,
			..._previewEditorEditorOptions,
			onlyShowAccessibleDiffViewer: accessibilityService.isScreenReaderOptimized(),
		}, { modifiedEditor: codeEditorWidgetOptions, originalEditor: codeEditorWidgetOptions }, _parentEditor)));
	}

	// --- layout

	override get contentHeight(): number {
		let result = super.contentHeight;
		if (this._previewDiffEditor.hasValue && this._previewDiffEditor.value.getModel()) {
			result += 14 + Math.min(300, this._previewDiffEditor.value.getContentHeight());
		}
		if (this._accessibleViewer.value) {
			result += this._accessibleViewer.value.height;
		}
		return result;
	}

	protected override _doLayout(dimension: Dimension): void {

		let newHeight = dimension.height;


		if (this._previewDiffEditor.hasValue) {
			const previewDiffDim = new Dimension(dimension.width - 12, Math.min(300, this._previewDiffEditor.value.getContentHeight()));
			this._elements.previewDiff.style.width = `${previewDiffDim.width}px`;
			this._elements.previewDiff.style.height = `${previewDiffDim.height}px`;
			this._previewDiffEditor.value.layout(previewDiffDim);
			newHeight -= previewDiffDim.height + 14;
		}

		if (this._accessibleViewer.value) {
			this._accessibleViewer.value.width = dimension.width - 12;
			newHeight -= this._accessibleViewer.value.height;
		}

		super._doLayout(dimension.with(undefined, newHeight));

		// update/fix the height of the zone which was set to newHeight in super._doLayout
		this._elements.root.style.height = `${dimension.height - this._getExtraHeight()}px`;
	}

	override reset() {
		this.hideEditsPreview();
		this._accessibleViewer.clear();
		super.reset();
	}

	// --- accessible viewer

	showAccessibleHunk(session: Session, hunkData: HunkInformation): void {

		this._elements.accessibleViewer.classList.remove('hidden');
		this._accessibleViewer.clear();

		this._accessibleViewer.value = this._instantiationService.createInstance(HunkAccessibleDiffViewer,
			this._elements.accessibleViewer,
			session,
			hunkData,
			new AccessibleHunk(this._parentEditor, session, hunkData)
		);

		this._onDidChangeHeight.fire();

	}

	// --- preview

	showEditsPreview(hunks: HunkData, textModel0: ITextModel, textModelN: ITextModel) {

		if (hunks.size === 0) {
			this.hideEditsPreview();
			return;
		}

		this._elements.previewDiff.classList.remove('hidden');

		this._previewDiffEditor.value.setModel({ original: textModel0, modified: textModelN });

		// joined ranges
		let originalLineRange: LineRange | undefined;
		let modifiedLineRange: LineRange | undefined;
		for (const item of hunks.getInfo()) {
			const [first0] = item.getRanges0();
			const [firstN] = item.getRangesN();

			originalLineRange = !originalLineRange ? LineRange.fromRangeInclusive(first0) : originalLineRange.join(LineRange.fromRangeInclusive(first0));
			modifiedLineRange = !modifiedLineRange ? LineRange.fromRangeInclusive(firstN) : modifiedLineRange.join(LineRange.fromRangeInclusive(firstN));
		}

		if (!originalLineRange || !modifiedLineRange) {
			this.hideEditsPreview();
			return;
		}

		const hiddenOriginal = invertLineRange(originalLineRange, textModel0);
		const hiddenModified = invertLineRange(modifiedLineRange, textModelN);
		this._previewDiffEditor.value.getOriginalEditor().setHiddenAreas(hiddenOriginal.map(lr => asRange(lr, textModel0)), 'diff-hidden');
		this._previewDiffEditor.value.getModifiedEditor().setHiddenAreas(hiddenModified.map(lr => asRange(lr, textModelN)), 'diff-hidden');
		this._previewDiffEditor.value.revealLine(modifiedLineRange.startLineNumber, ScrollType.Immediate);

		this._onDidChangeHeight.fire();
	}

	hideEditsPreview() {
		this._elements.previewDiff.classList.add('hidden');
		if (this._previewDiffEditor.hasValue) {
			this._previewDiffEditor.value.setModel(null);
		}
		this._previewDiffModel.clear();
		this._onDidChangeHeight.fire();
	}

	showsAnyPreview() {
		return !this._elements.previewDiff.classList.contains('hidden');
	}
}

class HunkAccessibleDiffViewer extends AccessibleDiffViewer {

	readonly height: number;

	set width(value: number) {
		this._width2.set(value, undefined);
	}

	private readonly _width2: ISettableObservable<number>;

	constructor(
		parentNode: HTMLElement,
		session: Session,
		hunk: HunkInformation,
		models: IAccessibleDiffViewerModel,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const width = observableValue('width', 0);
		const diff = observableValue('diff', HunkAccessibleDiffViewer._asMapping(hunk));
		const diffs = derived(r => [diff.read(r)]);
		const lines = Math.min(10, 8 + diff.get().changedLineCount);
		const height = models.getModifiedOptions().get(EditorOption.lineHeight) * lines;

		super(parentNode, constObservable(true), () => { }, constObservable(false), width, constObservable(height), diffs, models, instantiationService);

		this.height = height;
		this._width2 = width;

		this._store.add(session.textModelN.onDidChangeContent(() => {
			diff.set(HunkAccessibleDiffViewer._asMapping(hunk), undefined);
		}));
	}

	private static _asMapping(hunk: HunkInformation): DetailedLineRangeMapping {
		const ranges0 = hunk.getRanges0();
		const rangesN = hunk.getRangesN();
		const originalLineRange = LineRange.fromRangeInclusive(ranges0[0]);
		const modifiedLineRange = LineRange.fromRangeInclusive(rangesN[0]);
		const innerChanges: RangeMapping[] = [];
		for (let i = 1; i < ranges0.length; i++) {
			innerChanges.push(new RangeMapping(ranges0[i], rangesN[i]));
		}
		return new DetailedLineRangeMapping(originalLineRange, modifiedLineRange, innerChanges);
	}

}

class AccessibleHunk implements IAccessibleDiffViewerModel {

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _session: Session,
		private readonly _hunk: HunkInformation
	) { }

	getOriginalModel(): ITextModel {
		return this._session.textModel0;
	}
	getModifiedModel(): ITextModel {
		return this._session.textModelN;
	}
	getOriginalOptions(): IComputedEditorOptions {
		return this._editor.getOptions();
	}
	getModifiedOptions(): IComputedEditorOptions {
		return this._editor.getOptions();
	}
	originalReveal(range: Range): void {
		// throw new Error('Method not implemented.');
	}
	modifiedReveal(range?: Range | undefined): void {
		this._editor.revealRangeInCenterIfOutsideViewport(range || this._hunk.getRangesN()[0], ScrollType.Smooth);
	}
	modifiedSetSelection(range: Range): void {
		// this._editor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
		// this._editor.setSelection(range);
	}
	modifiedFocus(): void {
		this._editor.focus();
	}
	getModifiedPosition(): Position | undefined {
		return this._hunk.getRangesN()[0].getStartPosition();
	}
}
