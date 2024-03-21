/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as aria from 'vs/base/browser/ui/aria/aria';
import { Dimension, addDisposableListener, getTotalWidth, h, isAncestor } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { SlashCommandContentWidget } from 'vs/workbench/contrib/chat/browser/chatSlashCommandContentWidget';
import { Range } from 'vs/editor/common/core/range';
import { CTX_INLINE_CHAT_EMPTY, CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_INNER_CURSOR_END, CTX_INLINE_CHAT_INNER_CURSOR_FIRST, CTX_INLINE_CHAT_INNER_CURSOR_LAST, CTX_INLINE_CHAT_INNER_CURSOR_START, IInlineChatSlashCommand } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { LanguageSelector } from 'vs/editor/common/languageSelector';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Position } from 'vs/editor/common/core/position';
import { CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionItemProvider, CompletionList, ProviderResult } from 'vs/editor/common/languages';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { localize } from 'vs/nls';


export class InlineChatInputWidget {

	private readonly _elements = h(
		'div.inline-chat-input@content',
		[
			h('div.input@input', [
				h('div.editor-placeholder@placeholder'),
				h('div.editor-container@editor'),
			]),
			h('div.toolbar@editorToolbar')
		]
	);

	private readonly _store = new DisposableStore();

	private readonly _ctxInputEmpty: IContextKey<boolean>;
	private readonly _ctxInnerCursorFirst: IContextKey<boolean>;
	private readonly _ctxInnerCursorLast: IContextKey<boolean>;
	private readonly _ctxInnerCursorStart: IContextKey<boolean>;
	private readonly _ctxInnerCursorEnd: IContextKey<boolean>;
	private readonly _ctxInputEditorFocused: IContextKey<boolean>;

	private readonly _inputEditor: IActiveCodeEditor;
	private readonly _inputModel: ITextModel;

	private readonly _slashCommandContentWidget: SlashCommandContentWidget;
	private readonly _slashCommands = this._store.add(new DisposableStore());
	private _slashCommandDetails: { command: string; detail: string }[] = [];

	protected readonly _onDidChangeHeight = this._store.add(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly _onDidChangeInput = this._store.add(new Emitter<this>());
	readonly onDidChangeInput: Event<this> = this._onDidChangeInput.event;

	constructor(
		options: { menuId: MenuId; telemetrySource: string; hoverDelegate: IHoverDelegate },
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
	) {

		this._inputEditor = <IActiveCodeEditor>instantiationService.createInstance(CodeEditorWidget, this._elements.editor, inputEditorOptions, codeEditorWidgetOptions);
		this._store.add(this._inputEditor);
		this._store.add(this._inputEditor.onDidChangeModelContent(() => this._onDidChangeInput.fire(this)));
		this._store.add(this._inputEditor.onDidLayoutChange(() => this._onDidChangeHeight.fire()));
		this._store.add(this._inputEditor.onDidContentSizeChange(() => this._onDidChangeHeight.fire()));

		const uri = URI.from({ scheme: 'vscode', authority: 'inline-chat', path: `/inline-chat/model${generateUuid()}.txt` });
		this._inputModel = this._store.add(modelService.getModel(uri) ?? modelService.createModel('', null, uri));
		this._inputEditor.setModel(this._inputModel);

		// placeholder
		this._elements.placeholder.style.fontSize = `${this._inputEditor.getOption(EditorOption.fontSize)}px`;
		this._elements.placeholder.style.lineHeight = `${this._inputEditor.getOption(EditorOption.lineHeight)}px`;
		this._store.add(addDisposableListener(this._elements.placeholder, 'click', () => this._inputEditor.focus()));

		// slash command content widget
		this._slashCommandContentWidget = new SlashCommandContentWidget(this._inputEditor);
		this._store.add(this._slashCommandContentWidget);

		// toolbar
		this._store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.editorToolbar, options.menuId, {
			telemetrySource: options.telemetrySource,
			toolbarOptions: { primaryGroup: 'main' },
			hiddenItemStrategy: HiddenItemStrategy.Ignore, // keep it lean when hiding items and avoid a "..." overflow menu
			hoverDelegate: options.hoverDelegate
		}));


		this._ctxInputEmpty = CTX_INLINE_CHAT_EMPTY.bindTo(contextKeyService);
		this._ctxInnerCursorFirst = CTX_INLINE_CHAT_INNER_CURSOR_FIRST.bindTo(contextKeyService);
		this._ctxInnerCursorLast = CTX_INLINE_CHAT_INNER_CURSOR_LAST.bindTo(contextKeyService);
		this._ctxInnerCursorStart = CTX_INLINE_CHAT_INNER_CURSOR_START.bindTo(contextKeyService);
		this._ctxInnerCursorEnd = CTX_INLINE_CHAT_INNER_CURSOR_END.bindTo(contextKeyService);
		this._ctxInputEditorFocused = CTX_INLINE_CHAT_FOCUSED.bindTo(contextKeyService);

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
		this._store.add(this._inputEditor.onDidChangeModelContent(updateInnerCursorFirstLast));
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


		// show/hide placeholder depending on text model being empty
		// content height
		const currentContentHeight = 0;
		const togglePlaceholder = () => {
			const hasText = this._inputModel.getValueLength() > 0;
			this._elements.placeholder.classList.toggle('hidden', hasText);
			this._ctxInputEmpty.set(!hasText);
			this.readPlaceholder();

			const contentHeight = this._inputEditor.getContentHeight();
			if (contentHeight !== currentContentHeight) {
				this._onDidChangeHeight.fire();
			}
		};
		this._store.add(this._inputModel.onDidChangeContent(togglePlaceholder));
		togglePlaceholder();
	}

	dispose(): void {
		this.reset();
		this._store.dispose();
	}

	get domNode() {
		return this._elements.content;
	}

	moveTo(parent: HTMLElement) {
		if (!isAncestor(this.domNode, parent)) {
			parent.insertBefore(this.domNode, parent.firstChild);
		}
	}

	layout(dim: Dimension) {
		const toolbarWidth = getTotalWidth(this._elements.editorToolbar) + 8 /* L/R-padding */;
		const editorWidth = dim.width - toolbarWidth;
		this._inputEditor.layout({ height: dim.height, width: editorWidth });
		this._elements.placeholder.style.width = `${editorWidth}px`;
	}

	getPreferredSize(): Dimension {
		const width = this._inputEditor.getContentWidth() + getTotalWidth(this._elements.editorToolbar) + 8 /* L/R-padding */;
		const height = this._inputEditor.getContentHeight();
		return new Dimension(width, height);
	}

	getLineHeight(): number {
		return this._inputEditor.getOption(EditorOption.lineHeight);
	}

	reset() {
		this._ctxInputEmpty.reset();
		this._ctxInnerCursorFirst.reset();
		this._ctxInnerCursorLast.reset();
		this._ctxInnerCursorStart.reset();
		this._ctxInnerCursorEnd.reset();
		this._ctxInputEditorFocused.reset();

		this.value = ''; // update/re-inits some context keys again
	}

	focus() {
		this._inputEditor.focus();
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

	set ariaLabel(label: string) {
		this._inputEditor.updateOptions({ ariaLabel: label });
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

	updateSlashCommands(commands: IInlineChatSlashCommand[]) {

		this._slashCommands.clear();
		this._slashCommandDetails = commands.filter(c => c.command && c.detail).map(c => { return { command: c.command, detail: c.detail! }; });

		if (this._slashCommandDetails.length === 0) {
			return;
		}

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
			// TODO@jrieken
			// this._elements.detectedIntent.classList.toggle('hidden', true);

			const newDecorations: IModelDeltaDecoration[] = [];
			for (const command of commands) {
				const withSlash = `/${command.command} `;
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

export const defaultAriaLabel = localize('aria-label', "Inline Chat Input");

export const inputEditorOptions: IEditorConstructionOptions = {
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

export const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
	isSimpleWidget: true,
	contributions: EditorExtensionsRegistry.getSomeEditorContributions([
		SnippetController2.ID,
		SuggestController.ID
	])
};
