/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, addDisposableListener, getActiveElement, getTotalHeight, getTotalWidth, h, reset } from 'vs/base/browser/dom';
import { renderFormattedText } from 'vs/base/browser/formattedTextRenderer';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { Emitter, Event, MicrotaskEmitter } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ISettableObservable, constObservable, derived, observableValue } from 'vs/base/common/observable';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./inlineChat';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { IActiveCodeEditor, ICodeEditor, IDiffEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { AccessibleDiffViewer, IAccessibleDiffViewerModel } from 'vs/editor/browser/widget/diffEditor/components/accessibleDiffViewer';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/embeddedDiffEditorWidget';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { DetailedLineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { ICodeEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { LanguageSelector } from 'vs/editor/common/languageSelector';
import { CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionItemProvider, CompletionList, ProviderResult } from 'vs/editor/common/languages';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IWorkbenchButtonBarOptions, MenuWorkbenchButtonBar } from 'vs/platform/actions/browser/buttonbar';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILogService } from 'vs/platform/log/common/log';
import { editorBackground, editorForeground, inputBackground } from 'vs/platform/theme/common/colorRegistry';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { ChatFollowups } from 'vs/workbench/contrib/chat/browser/chatFollowups';
import { ChatListItemRenderer, IChatListItemRendererOptions, IChatRendererDelegate } from 'vs/workbench/contrib/chat/browser/chatListRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { SlashCommandContentWidget } from 'vs/workbench/contrib/chat/browser/chatSlashCommandContentWidget';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModel, ChatResponseModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { ChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { CodeBlockModelCollection } from 'vs/workbench/contrib/chat/common/codeBlockModelCollection';
import { HunkData, HunkInformation, Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { asRange, invertLineRange } from 'vs/workbench/contrib/inlineChat/browser/utils';
import { CTX_INLINE_CHAT_EMPTY, CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_INNER_CURSOR_END, CTX_INLINE_CHAT_INNER_CURSOR_FIRST, CTX_INLINE_CHAT_INNER_CURSOR_LAST, CTX_INLINE_CHAT_INNER_CURSOR_START, CTX_INLINE_CHAT_RESPONSE_FOCUSED, IInlineChatFollowup, IInlineChatSlashCommand } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IUntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { createInstantHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';

const defaultAriaLabel = localize('aria-label', "Inline Chat Input");

export const _inputEditorOptions: IEditorConstructionOptions = {
	padding: { top: 2, bottom: 2 },
	overviewRulerLanes: 0,
	glyphMargin: false,
	lineNumbers: 'off',
	folding: false,
	hideCursorInOverviewRuler: true,
	selectOnLineNumbers: false,
	selectionHighlight: false,
	scrollbar: {
		useShadows: false,
		vertical: 'hidden',
		horizontal: 'auto',
		alwaysConsumeMouseWheel: false
	},
	lineDecorationsWidth: 0,
	overviewRulerBorder: false,
	scrollBeyondLastLine: false,
	renderLineHighlight: 'none',
	fixedOverflowWidgets: true,
	dragAndDrop: false,
	revealHorizontalRightPadding: 5,
	minimap: { enabled: false },
	guides: { indentation: false },
	rulers: [],
	cursorWidth: 1,
	cursorStyle: 'line',
	cursorBlinking: 'blink',
	wrappingStrategy: 'advanced',
	wrappingIndent: 'none',
	renderWhitespace: 'none',
	dropIntoEditor: { enabled: true },
	quickSuggestions: false,
	suggest: {
		showIcons: false,
		showSnippets: false,
		showWords: true,
		showStatusBar: false,
	},
	wordWrap: 'on',
	ariaLabel: defaultAriaLabel,
	fontFamily: DEFAULT_FONT_FAMILY,
	fontSize: 13,
	lineHeight: 20
};

const _codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
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

	private static _modelPool: number = 1;

	protected readonly _elements = h(
		'div.inline-chat@root',
		[
			h('div.body', [
				h('div.content@content', [
					h('div.input@input', [
						h('div.editor-placeholder@placeholder'),
						h('div.editor-container@editor'),
					]),
					h('div.toolbar@editorToolbar'),
				]),
				h('div.widget-toolbar@widgetToolbar')
			]),
			h('div.progress@progress'),
			h('div.detectedIntent.hidden@detectedIntent'),
			h('div.previewDiff.hidden@previewDiff'),
			h('div.previewCreateTitle.show-file-icons@previewCreateTitle'),
			h('div.previewCreate.hidden@previewCreate'),
			h('div.chatMessage.hidden@chatMessage'),
			h('div.followUps.hidden@followUps'),
			h('div.accessibleViewer@accessibleViewer'),
			h('div.status@status', [
				h('div.label.info.hidden@infoLabel'),
				h('div.actions.hidden@statusToolbar'),
				h('div.label.status.hidden@statusLabel'),
				h('div.actions.hidden@feedbackToolbar'),
			]),
		]
	);

	private readonly _chatMessageContents: HTMLDivElement;
	private readonly _chatMessageScrollable: DomScrollableElement;

	protected readonly _store = new DisposableStore();
	private readonly _slashCommands = this._store.add(new DisposableStore());

	private readonly _inputEditor: IActiveCodeEditor;
	private readonly _inputModel: ITextModel;
	private readonly _ctxInputEmpty: IContextKey<boolean>;
	private readonly _ctxInnerCursorFirst: IContextKey<boolean>;
	private readonly _ctxInnerCursorLast: IContextKey<boolean>;
	private readonly _ctxInnerCursorStart: IContextKey<boolean>;
	private readonly _ctxInnerCursorEnd: IContextKey<boolean>;
	private readonly _ctxInputEditorFocused: IContextKey<boolean>;
	private readonly _ctxResponseFocused: IContextKey<boolean>;

	private readonly _progressBar: ProgressBar;


	protected readonly _onDidChangeHeight = this._store.add(new MicrotaskEmitter<void>());
	readonly onDidChangeHeight: Event<void> = Event.filter(this._onDidChangeHeight.event, _ => !this._isLayouting);

	private readonly _onDidChangeLayout = this._store.add(new MicrotaskEmitter<void>());
	private readonly _onDidChangeInput = this._store.add(new Emitter<this>());
	readonly onDidChangeInput: Event<this> = this._onDidChangeInput.event;

	private readonly _onRequestWithoutIntentDetection = this._store.add(new Emitter<void>());
	readonly onRequestWithoutIntentDetection: Event<void> = this._onRequestWithoutIntentDetection.event;

	private _lastDim: Dimension | undefined;
	private _isLayouting: boolean = false;
	private _slashCommandDetails: { command: string; detail: string }[] = [];

	private _slashCommandContentWidget: SlashCommandContentWidget;

	private readonly _editorOptions: ChatEditorOptions;
	private _chatMessageDisposables = this._store.add(new DisposableStore());
	private _followUpDisposables = this._store.add(new DisposableStore());
	private _slashCommandUsedDisposables = this._store.add(new DisposableStore());

	private _chatMessage: MarkdownString | undefined;
	private readonly _codeBlockModelCollection: CodeBlockModelCollection;

	constructor(
		options: IInlineChatWidgetConstructionOptions,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
		@ILogService private readonly _logService: ILogService,
		@ITextModelService protected readonly _textModelResolverService: ITextModelService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
	) {

		// input editor logic
		this._inputEditor = <IActiveCodeEditor>this._instantiationService.createInstance(CodeEditorWidget, this._elements.editor, _inputEditorOptions, _codeEditorWidgetOptions);
		this._updateAriaLabel();
		this._store.add(this._inputEditor);
		this._store.add(this._inputEditor.onDidChangeModelContent(() => this._onDidChangeInput.fire(this)));
		this._store.add(this._inputEditor.onDidLayoutChange(() => this._onDidChangeHeight.fire()));
		this._store.add(this._inputEditor.onDidContentSizeChange(() => this._onDidChangeHeight.fire()));


		const uri = URI.from({ scheme: 'vscode', authority: 'inline-chat', path: `/inline-chat/model${InlineChatWidget._modelPool++}.txt` });
		this._inputModel = this._store.add(this._modelService.getModel(uri) ?? this._modelService.createModel('', null, uri));
		this._inputEditor.setModel(this._inputModel);

		this._editorOptions = this._store.add(_instantiationService.createInstance(ChatEditorOptions, undefined, editorForeground, inputBackground, editorBackground));

		this._chatMessageContents = document.createElement('div');
		this._chatMessageContents.className = 'chatMessageContent';
		this._chatMessageContents.tabIndex = 0;
		this._chatMessageContents.ariaLabel = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.InlineChat);
		this._chatMessageScrollable = new DomScrollableElement(this._chatMessageContents, { alwaysConsumeMouseWheel: true });
		this._store.add(this._chatMessageScrollable);
		this._elements.chatMessage.appendChild(this._chatMessageScrollable.getDomNode());
		this._store.add(addDisposableListener(this._chatMessageContents, 'focus', () => this._ctxResponseFocused.set(true)));
		this._store.add(addDisposableListener(this._chatMessageContents, 'blur', () => this._ctxResponseFocused.reset()));

		this._store.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.InlineChat)) {
				this._updateAriaLabel();
			}
		}));

		// --- context keys

		this._ctxInputEmpty = CTX_INLINE_CHAT_EMPTY.bindTo(this._contextKeyService);

		this._ctxInnerCursorFirst = CTX_INLINE_CHAT_INNER_CURSOR_FIRST.bindTo(this._contextKeyService);
		this._ctxInnerCursorLast = CTX_INLINE_CHAT_INNER_CURSOR_LAST.bindTo(this._contextKeyService);
		this._ctxInnerCursorStart = CTX_INLINE_CHAT_INNER_CURSOR_START.bindTo(this._contextKeyService);
		this._ctxInnerCursorEnd = CTX_INLINE_CHAT_INNER_CURSOR_END.bindTo(this._contextKeyService);
		this._ctxInputEditorFocused = CTX_INLINE_CHAT_FOCUSED.bindTo(this._contextKeyService);
		this._ctxResponseFocused = CTX_INLINE_CHAT_RESPONSE_FOCUSED.bindTo(this._contextKeyService);

		// (1) inner cursor position (last/first line selected)
		const updateInnerCursorFirstLast = () => {
			const selection = this._inputEditor.getSelection();
			const fullRange = this._inputModel.getFullModelRange();
			let onFirst = false;
			let onLast = false;
			if (selection.isEmpty()) {
				const selectionTop = this._inputEditor.getTopForPosition(selection.startLineNumber, selection.startColumn);
				const firstViewLineTop = this._inputEditor.getTopForPosition(fullRange.startLineNumber, fullRange.startColumn);
				const lastViewLineTop = this._inputEditor.getTopForPosition(fullRange.endLineNumber, fullRange.endColumn);

				if (selectionTop === firstViewLineTop) {
					onFirst = true;
				}
				if (selectionTop === lastViewLineTop) {
					onLast = true;
				}
			}
			this._ctxInnerCursorFirst.set(onFirst);
			this._ctxInnerCursorLast.set(onLast);
			this._ctxInnerCursorStart.set(fullRange.getStartPosition().equals(selection.getStartPosition()));
			this._ctxInnerCursorEnd.set(fullRange.getEndPosition().equals(selection.getEndPosition()));
		};
		this._store.add(this._inputEditor.onDidChangeCursorPosition(updateInnerCursorFirstLast));
		updateInnerCursorFirstLast();

		// (2) input editor focused or not
		const updateFocused = () => {
			const hasFocus = this._inputEditor.hasWidgetFocus();
			this._ctxInputEditorFocused.set(hasFocus);
			this._elements.content.classList.toggle('synthetic-focus', hasFocus);
			this.readPlaceholder();
		};
		this._store.add(this._inputEditor.onDidFocusEditorWidget(updateFocused));
		this._store.add(this._inputEditor.onDidBlurEditorWidget(updateFocused));
		this._store.add(toDisposable(() => {
			this._ctxInnerCursorFirst.reset();
			this._ctxInnerCursorLast.reset();
			this._ctxInputEditorFocused.reset();
		}));
		updateFocused();

		// placeholder

		this._elements.placeholder.style.fontSize = `${this._inputEditor.getOption(EditorOption.fontSize)}px`;
		this._elements.placeholder.style.lineHeight = `${this._inputEditor.getOption(EditorOption.lineHeight)}px`;
		this._store.add(addDisposableListener(this._elements.placeholder, 'click', () => this._inputEditor.focus()));

		// show/hide placeholder depending on text model being empty
		// content height

		const currentContentHeight = 0;

		const togglePlaceholder = () => {
			const hasText = this._inputModel.getValueLength() > 0;
			this._elements.placeholder.classList.toggle('hidden', hasText);
			this._ctxInputEmpty.set(!hasText);
			this.readPlaceholder();

			const contentHeight = this._inputEditor.getContentHeight();
			if (contentHeight !== currentContentHeight && this._lastDim) {
				this._lastDim = this._lastDim.with(undefined, contentHeight);
				this._inputEditor.layout(this._lastDim);
				this._onDidChangeHeight.fire();
			}
		};
		this._store.add(this._inputModel.onDidChangeContent(togglePlaceholder));
		togglePlaceholder();

		// slash command content widget

		this._slashCommandContentWidget = new SlashCommandContentWidget(this._inputEditor);
		this._store.add(this._slashCommandContentWidget);

		// Share hover delegates between toolbars to support instant hover between both
		const hoverDelegate = this._store.add(createInstantHoverDelegate());

		// toolbars

		this._store.add(this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.editorToolbar, options.inputMenuId, {
			telemetrySource: options.telemetrySource,
			toolbarOptions: { primaryGroup: 'main' },
			hiddenItemStrategy: HiddenItemStrategy.Ignore, // keep it lean when hiding items and avoid a "..." overflow menu
			hoverDelegate
		}));

		this._progressBar = new ProgressBar(this._elements.progress);
		this._store.add(this._progressBar);


		this._store.add(this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.widgetToolbar, options.widgetMenuId, {
			telemetrySource: options.telemetrySource,
			toolbarOptions: { primaryGroup: 'main' },
			hoverDelegate
		}));


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

		this._store.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.InlineChat)) {
				this._chatMessageContents.ariaLabel = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.InlineChat);
				this._elements.followUps.ariaLabel = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.InlineChat);
			}
		}));

		// Code block rendering
		this._codeBlockModelCollection = this._store.add(this._instantiationService.createInstance(CodeBlockModelCollection));
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
		_inputEditorOptions.ariaLabel = label;
		this._inputEditor.updateOptions({ ariaLabel: label });
	}

	dispose(): void {
		this._store.dispose();
		this._ctxInputEmpty.reset();
	}

	get domNode(): HTMLElement {
		return this._elements.root;
	}

	layout(widgetDim: Dimension) {
		this._isLayouting = true;
		try {
			const widgetToolbarWidth = getTotalWidth(this._elements.widgetToolbar);
			const editorToolbarWidth = getTotalWidth(this._elements.editorToolbar) + 8 /* L/R-padding */;
			const innerEditorWidth = widgetDim.width - editorToolbarWidth - widgetToolbarWidth;
			const inputDim = new Dimension(innerEditorWidth, widgetDim.height);
			if (!this._lastDim || !Dimension.equals(this._lastDim, inputDim)) {
				this._lastDim = inputDim;
				this._doLayout(widgetDim, inputDim);

				this._onDidChangeLayout.fire();
			}
		} finally {
			this._isLayouting = false;
		}
	}

	protected _doLayout(widgetDimension: Dimension, inputDimension: Dimension): void {
		this._chatMessageContents.style.width = `${widgetDimension.width - 10}px`;
		this._chatMessageContents.style.maxHeight = `270px`;
		this._inputEditor.layout(new Dimension(inputDimension.width, this._inputEditor.getContentHeight()));
		this._elements.placeholder.style.width = `${inputDimension.width}px`;
	}

	getHeight(): number {
		const editorHeight = this._inputEditor.getContentHeight() + 12 /* padding and border */;
		const progressHeight = getTotalHeight(this._elements.progress);
		const detectedIntentHeight = getTotalHeight(this._elements.detectedIntent);
		const chatResponseHeight = getTotalHeight(this._chatMessageContents) + 16 /*padding*/;
		const followUpsHeight = getTotalHeight(this._elements.followUps);

		const statusHeight = getTotalHeight(this._elements.status);
		return progressHeight + editorHeight + detectedIntentHeight + followUpsHeight + chatResponseHeight + statusHeight + 18 /* padding */ + 8 /*shadow*/;
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
		return this._inputModel.getValue();
	}

	set value(value: string) {
		this._inputModel.setValue(value);
		this._inputEditor.setPosition(this._inputModel.getFullModelRange().getEndPosition());
	}

	selectAll(includeSlashCommand: boolean = true) {
		let selection = this._inputModel.getFullModelRange();

		if (!includeSlashCommand) {
			const firstLine = this._inputModel.getLineContent(1);
			const slashCommand = this._slashCommandDetails.find(c => firstLine.startsWith(`/${c.command} `));
			selection = slashCommand ? new Range(1, slashCommand.command.length + 3, selection.endLineNumber, selection.endColumn) : selection;
		}

		this._inputEditor.setSelection(selection);
	}

	set placeholder(value: string) {
		this._elements.placeholder.innerText = value;
	}

	readPlaceholder(): void {
		const slashCommand = this._slashCommandDetails.find(c => `${c.command} ` === this._inputModel.getValue().substring(1));
		const hasText = this._inputModel.getValueLength() > 0;
		if (!hasText) {
			aria.status(this._elements.placeholder.innerText);
		} else if (slashCommand) {
			aria.status(slashCommand.detail);
		}
	}

	updateToolbar(show: boolean) {
		this._elements.statusToolbar.classList.toggle('hidden', !show);
		this._elements.feedbackToolbar.classList.toggle('hidden', !show);
		this._elements.status.classList.toggle('actions', show);
		this._elements.infoLabel.classList.toggle('hidden', show);
		this._onDidChangeHeight.fire();
	}

	get responseContent(): string | undefined {
		return this._chatMessage?.value;
	}

	updateChatMessage(message: IInlineChatMessage, isIncomplete: true): IInlineChatMessageAppender;
	updateChatMessage(message: IInlineChatMessage | undefined): void;
	updateChatMessage(message: IInlineChatMessage | undefined, isIncomplete?: boolean): IInlineChatMessageAppender | undefined {

		this._chatMessageDisposables.clear();
		this._chatMessage = message ? new MarkdownString(message.message.value) : undefined;
		const hasMessage = message?.message.value;
		this._elements.chatMessage.classList.toggle('hidden', !hasMessage);
		reset(this._chatMessageContents);
		let resultingAppender: IInlineChatMessageAppender | undefined;
		if (hasMessage) {
			const sessionModel = this._chatMessageDisposables.add(new ChatModel(message.providerId, undefined, this._logService, this._chatAgentService, this._instantiationService));
			const responseModel = this._chatMessageDisposables.add(new ChatResponseModel(message.message, sessionModel, undefined, undefined, message.requestId, !isIncomplete, false, undefined));
			const viewModel = this._chatMessageDisposables.add(new ChatResponseViewModel(responseModel, this._logService));
			const renderOptions: IChatListItemRendererOptions = { renderStyle: 'compact', noHeader: true, noPadding: true };
			const chatRendererDelegate: IChatRendererDelegate = { getListLength() { return 1; } };
			const renderer = this._chatMessageDisposables.add(this._instantiationService.createInstance(ChatListItemRenderer, this._editorOptions, renderOptions, chatRendererDelegate, this._codeBlockModelCollection, undefined));
			renderer.layout(this._chatMessageContents.clientWidth - 4); // 2 for the padding used for the tab index border
			this._chatMessageDisposables.add(this._onDidChangeLayout.event(() => {
				renderer.layout(this._chatMessageContents.clientWidth - 4);
				this._chatMessageScrollable.scanDomNode();
			}));
			const template = renderer.renderTemplate(this._chatMessageContents);
			this._chatMessageDisposables.add(template.elementDisposables);
			this._chatMessageDisposables.add(template.templateDisposables);
			renderer.renderChatTreeItem(viewModel, 0, template);
			this._chatMessageDisposables.add(renderer.onDidChangeItemHeight(() => this._onDidChangeHeight.fire()));

			resultingAppender = isIncomplete ? {
				cancel: () => responseModel.cancel(),
				complete: () => responseModel.complete(),
				appendContent: (fragment: string) => {
					responseModel.updateContent({ kind: 'markdownContent', content: new MarkdownString(fragment) });
					this._chatMessage?.appendMarkdown(fragment);
				}
			} : undefined;
		}
		this._onDidChangeHeight.fire();
		return resultingAppender;
	}

	updateFollowUps(items: IInlineChatFollowup[], onFollowup: (followup: IInlineChatFollowup) => void): void;
	updateFollowUps(items: undefined): void;
	updateFollowUps(items: IInlineChatFollowup[] | undefined, onFollowup?: ((followup: IInlineChatFollowup) => void)) {
		this._followUpDisposables.clear();
		this._elements.followUps.classList.toggle('hidden', !items || items.length === 0);
		reset(this._elements.followUps);
		if (items && items.length > 0 && onFollowup) {
			this._followUpDisposables.add(
				this._instantiationService.createInstance(ChatFollowups, this._elements.followUps, items, undefined, onFollowup));
		}
		this._onDidChangeHeight.fire();
	}

	updateSlashCommandUsed(command: string): void {
		const details = this._slashCommandDetails.find(candidate => candidate.command === command);
		if (!details) {
			return;
		}

		this._elements.detectedIntent.classList.toggle('hidden', false);

		this._slashCommandUsedDisposables.clear();

		const label = localize('slashCommandUsed', "Using {0} to generate response ([[re-run without]])", `\`\`/${details.command}\`\``);
		const usingSlashCommandText = renderFormattedText(label, {
			inline: true,
			renderCodeSegments: true,
			className: 'slash-command-pill',
			actionHandler: {
				callback: (content) => {
					if (content !== '0') {
						return;
					}
					this._elements.detectedIntent.classList.toggle('hidden', true);
					this._onRequestWithoutIntentDetection.fire();
				},
				disposables: this._slashCommandUsedDisposables,
			}
		});

		reset(this._elements.detectedIntent, usingSlashCommandText);
		this._onDidChangeHeight.fire();
	}

	updateInfo(message: string): void {
		this._elements.infoLabel.classList.toggle('hidden', !message);
		const renderedMessage = renderLabelWithIcons(message);
		reset(this._elements.infoLabel, ...renderedMessage);
		this._onDidChangeHeight.fire();
	}

	updateStatus(message: string, ops: { classes?: string[]; resetAfter?: number; keepMessage?: boolean } = {}) {
		const isTempMessage = typeof ops.resetAfter === 'number';
		if (isTempMessage && !this._elements.statusLabel.dataset['state']) {
			const statusLabel = this._elements.statusLabel.innerText;
			const classes = Array.from(this._elements.statusLabel.classList.values());
			setTimeout(() => {
				this.updateStatus(statusLabel, { classes, keepMessage: true });
			}, ops.resetAfter);
		}
		reset(this._elements.statusLabel, message);
		this._elements.statusLabel.className = `label status ${(ops.classes ?? []).join(' ')}`;
		this._elements.statusLabel.classList.toggle('hidden', !message);
		if (isTempMessage) {
			this._elements.statusLabel.dataset['state'] = 'temp';
		} else {
			delete this._elements.statusLabel.dataset['state'];
		}
		this._onDidChangeHeight.fire();
	}

	reset() {
		this._ctxInputEmpty.reset();
		this._ctxInnerCursorFirst.reset();
		this._ctxInnerCursorLast.reset();
		this._ctxInputEditorFocused.reset();

		this.value = '';
		this.updateChatMessage(undefined);
		this.updateFollowUps(undefined);

		reset(this._elements.statusLabel);
		this._elements.detectedIntent.classList.toggle('hidden', true);
		this._elements.statusLabel.classList.toggle('hidden', true);
		this._elements.statusToolbar.classList.add('hidden');
		this._elements.feedbackToolbar.classList.add('hidden');
		this.updateInfo('');

		this._elements.accessibleViewer.classList.toggle('hidden', true);

		this._onDidChangeHeight.fire();
	}

	focus() {
		this._inputEditor.focus();
	}

	hasFocus() {
		return this.domNode.contains(getActiveElement());
	}

	// --- slash commands

	updateSlashCommands(commands: IInlineChatSlashCommand[]) {

		this._slashCommands.clear();

		if (commands.length === 0) {
			return;
		}
		this._slashCommandDetails = commands.filter(c => c.command && c.detail).map(c => { return { command: c.command, detail: c.detail! }; });

		const selector: LanguageSelector = { scheme: this._inputModel.uri.scheme, pattern: this._inputModel.uri.path, language: this._inputModel.getLanguageId() };
		this._slashCommands.add(this._languageFeaturesService.completionProvider.register(selector, new class implements CompletionItemProvider {

			_debugDisplayName: string = 'InlineChatSlashCommandProvider';

			readonly triggerCharacters?: string[] = ['/'];

			provideCompletionItems(_model: ITextModel, position: Position): ProviderResult<CompletionList> {
				if (position.lineNumber !== 1 && position.column !== 1) {
					return undefined;
				}

				const suggestions: CompletionItem[] = commands.map(command => {

					const withSlash = `/${command.command}`;

					return {
						label: { label: withSlash, description: command.detail },
						insertText: `${withSlash} $0`,
						insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
						kind: CompletionItemKind.Text,
						range: new Range(1, 1, 1, 1),
						command: command.executeImmediately ? { id: 'inlineChat.accept', title: withSlash } : undefined
					};
				});

				return { suggestions };
			}
		}));

		const decorations = this._inputEditor.createDecorationsCollection();

		const updateSlashDecorations = () => {
			this._slashCommandContentWidget.hide();
			this._elements.detectedIntent.classList.toggle('hidden', true);

			const newDecorations: IModelDeltaDecoration[] = [];
			for (const command of commands) {
				const withSlash = `/${command.command}`;
				const firstLine = this._inputModel.getLineContent(1);
				if (firstLine.startsWith(withSlash)) {
					newDecorations.push({
						range: new Range(1, 1, 1, withSlash.length + 1),
						options: {
							description: 'inline-chat-slash-command',
							inlineClassName: 'inline-chat-slash-command',
							after: {
								// Force some space between slash command and placeholder
								content: ' '
							}
						}
					});

					this._slashCommandContentWidget.setCommandText(command.command);
					this._slashCommandContentWidget.show();

					// inject detail when otherwise empty
					if (firstLine === `/${command.command}`) {
						newDecorations.push({
							range: new Range(1, withSlash.length + 1, 1, withSlash.length + 2),
							options: {
								description: 'inline-chat-slash-command-detail',
								after: {
									content: `${command.detail}`,
									inlineClassName: 'inline-chat-slash-command-detail'
								}
							}
						});
					}
					break;
				}
			}
			decorations.set(newDecorations);
		};

		this._slashCommands.add(this._inputEditor.onDidChangeModelContent(updateSlashDecorations));
		updateSlashDecorations();
	}
}

export class EditorBasedInlineChatWidget extends InlineChatWidget {

	private readonly _accessibleViewer = this._store.add(new MutableDisposable<HunkAccessibleDiffViewer>());

	private readonly _previewDiffEditor: Lazy<EmbeddedDiffEditorWidget>;
	private readonly _previewDiffModel = this._store.add(new MutableDisposable());

	private readonly _previewCreateTitle: ResourceLabel;
	private readonly _previewCreateEditor: Lazy<ICodeEditor>;
	private readonly _previewCreateDispoable = this._store.add(new MutableDisposable());

	constructor(
		private readonly _parentEditor: ICodeEditor,
		options: IInlineChatWidgetConstructionOptions,
		@IModelService modelService: IModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAccessibleViewService accessibleViewService: IAccessibleViewService,
		@ILogService logService: ILogService,
		@ITextModelService textModelResolverService: ITextModelService,
		@IChatAgentService chatAgentService: IChatAgentService,
	) {
		super(options, instantiationService, modelService, contextKeyService, languageFeaturesService, keybindingService, accessibilityService, configurationService, accessibleViewService, logService, textModelResolverService, chatAgentService,);

		// preview editors
		this._previewDiffEditor = new Lazy(() => this._store.add(instantiationService.createInstance(EmbeddedDiffEditorWidget, this._elements.previewDiff, {
			useInlineViewWhenSpaceIsLimited: false,
			..._previewEditorEditorOptions,
			onlyShowAccessibleDiffViewer: accessibilityService.isScreenReaderOptimized(),
		}, { modifiedEditor: _codeEditorWidgetOptions, originalEditor: _codeEditorWidgetOptions }, _parentEditor)));

		this._previewCreateTitle = this._store.add(instantiationService.createInstance(ResourceLabel, this._elements.previewCreateTitle, { supportIcons: true }));
		this._previewCreateEditor = new Lazy(() => this._store.add(instantiationService.createInstance(EmbeddedCodeEditorWidget, this._elements.previewCreate, _previewEditorEditorOptions, _codeEditorWidgetOptions, _parentEditor)));
	}

	// --- layout

	override getHeight(): number {
		const result = super.getHeight();
		const previewDiffHeight = this._previewDiffEditor.hasValue && this._previewDiffEditor.value.getModel() ? 12 + Math.min(300, Math.max(0, this._previewDiffEditor.value.getContentHeight())) : 0;
		const previewCreateTitleHeight = getTotalHeight(this._elements.previewCreateTitle);
		const previewCreateHeight = this._previewCreateEditor.hasValue && this._previewCreateEditor.value.getModel() ? 18 + Math.min(300, Math.max(0, this._previewCreateEditor.value.getContentHeight())) : 0;
		const accessibleViewHeight = this._accessibleViewer.value?.height ?? 0;
		return result + previewDiffHeight + previewCreateTitleHeight + previewCreateHeight + accessibleViewHeight;
	}

	protected override _doLayout(widgetDimension: Dimension, inputDimension: Dimension): void {
		super._doLayout(widgetDimension, inputDimension);

		if (this._accessibleViewer.value) {
			this._accessibleViewer.value.width = widgetDimension.width - 12;
		}

		if (this._previewDiffEditor.hasValue) {
			const previewDiffDim = new Dimension(widgetDimension.width - 12, Math.min(300, Math.max(0, this._previewDiffEditor.value.getContentHeight())));
			this._elements.previewDiff.style.width = `${previewDiffDim.width}px`;
			this._elements.previewDiff.style.height = `${previewDiffDim.height}px`;
			this._previewDiffEditor.value.layout(previewDiffDim);
		}

		if (this._previewCreateEditor.hasValue) {
			const previewCreateDim = new Dimension(inputDimension.width, Math.min(300, Math.max(0, this._previewCreateEditor.value.getContentHeight())));
			this._previewCreateEditor.value.layout(previewCreateDim);
			this._elements.previewCreate.style.height = `${previewCreateDim.height}px`;
		}
	}

	override reset() {
		this.hideCreatePreview();
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

	async showCreatePreview(model: IUntitledTextEditorModel): Promise<void> {
		this._elements.previewCreateTitle.classList.remove('hidden');
		this._elements.previewCreate.classList.remove('hidden');

		const ref = await this._textModelResolverService.createModelReference(model.resource);
		this._previewCreateDispoable.value = ref;
		this._previewCreateTitle.element.setFile(model.resource, { fileKind: FileKind.FILE });

		this._previewCreateEditor.value.setModel(ref.object.textEditorModel);
		this._onDidChangeHeight.fire();
	}

	hideCreatePreview() {
		this._elements.previewCreateTitle.classList.add('hidden');
		this._elements.previewCreate.classList.add('hidden');
		this._previewCreateEditor.rawValue?.setModel(null);
		this._previewCreateDispoable.clear();
		this._previewCreateTitle.element.clear();
		this._onDidChangeHeight.fire();
	}

	showsAnyPreview() {
		return !this._elements.previewDiff.classList.contains('hidden') ||
			!this._elements.previewCreate.classList.contains('hidden');
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
