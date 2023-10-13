/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { ChatTreeItem, IChatCodeBlockInfo } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { ResourcePool } from 'vs/workbench/contrib/chat/browser/resourcePool';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { localize } from 'vs/nls';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { IEditorOptions, EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { BracketMatchingController } from 'vs/editor/contrib/bracketMatching/browser/bracketMatching';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { ViewportSemanticTokensContribution } from 'vs/editor/contrib/semanticTokens/browser/viewportSemanticTokens';
import { SmartSelectController } from 'vs/editor/contrib/smartSelect/browser/smartSelect';
import { WordHighlighterContribution } from 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter';
import { IChatCodeBlockActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatCodeblockActions';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { Range } from 'vs/editor/common/core/range';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';

const $ = dom.$;

export interface IItemHeightChangeParams {
	element: ChatTreeItem;
}

export class ChatMarkdownRenderer {

	private readonly _renderer: MarkdownRenderer;
	private readonly _editorPool: EditorPool;
	private readonly _store = new DisposableStore();
	private _currentLayoutWidth: number = 0;

	private readonly _codeBlocksByEditorUri = new ResourceMap<IChatCodeBlockInfo>();

	protected readonly _onDidChangeItemHeight = this._store.add(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly editorOptions: ChatEditorOptions,
		@IInstantiationService _instaService: IInstantiationService
	) {
		this._renderer = _instaService.createInstance(MarkdownRenderer, {});
		this._editorPool = this._store.add(_instaService.createInstance(EditorPool, this.editorOptions));

	}

	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined {
		return this._codeBlocksByEditorUri.get(uri);
	}

	layout(width: number): void {
		this._currentLayoutWidth = width - 40; // TODO Padding
		this._editorPool.inUse.forEach(editor => {
			editor.layout(this._currentLayoutWidth);
		});
	}

	public renderSimple(markdown: IMarkdownString): IMarkdownRenderResult {
		return this._renderer.render(markdown);
	}

	public render(markdown: IMarkdownString, element: ChatTreeItem, parentContextKeyService: IContextKeyService, fillInIncompleteTokens = false) {
		let codeBlockIndex = 0;
		const disposables = new DisposableStore();

		// We release editors in order so that it's more likely that the same editor will be assigned if this element is re-rendered right away, like it often is during progressive rendering
		const orderedDisposablesList: IDisposable[] = [];

		const codeblocks: IChatCodeBlockInfo[] = [];

		const result = this._renderer.render(markdown, {
			fillInIncompleteTokens,
			codeBlockRendererSync: (languageId, text) => {
				const data = { languageId, text, codeBlockIndex: codeBlockIndex++, element, parentContextKeyService };
				const ref = this.renderCodeBlock(data, disposables);

				// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
				// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
				disposables.add(ref.object.onDidChangeContentHeight(() => {
					ref.object.layout(this._currentLayoutWidth);
					this._onDidChangeItemHeight.fire({ element });
				}));

				if (isResponseVM(element)) {
					const info: IChatCodeBlockInfo = {
						codeBlockIndex: data.codeBlockIndex,
						element,
						focus() {
							ref.object.focus();
						}
					};
					codeblocks.push(info);
					this._codeBlocksByEditorUri.set(ref.object.textModel.uri, info);
					disposables.add(toDisposable(() => this._codeBlocksByEditorUri.delete(ref.object.textModel.uri)));
				}
				orderedDisposablesList.push(ref);
				return ref.object.element;
			}
		});

		return {
			element: result.element,
			codeblocks,
			dispose() {
				result.dispose();
				disposables.dispose();
			}
		};
	}

	private renderCodeBlock(data: IChatResultCodeBlockData, disposables: DisposableStore): IDisposableReference<IChatResultCodeBlockPart> {
		const ref = this._editorPool.get();
		const editorInfo = ref.object;
		editorInfo.render(data, this._currentLayoutWidth);

		return ref;
	}

	dispose(): void {
		this._store.dispose();
	}
}

export interface IDisposableReference<T> extends IDisposable {
	object: T;
	isStale: () => boolean;
}

export interface IChatResultCodeBlockData {
	text: string;
	languageId: string;
	codeBlockIndex: number;
	element: ChatTreeItem;
	parentContextKeyService: IContextKeyService;
}

export interface IChatResultCodeBlockPart {
	readonly onDidChangeContentHeight: Event<number>;
	readonly element: HTMLElement;
	readonly textModel: ITextModel;
	layout(width: number): void;
	render(data: IChatResultCodeBlockData, width: number): void;
	focus(): void;
	dispose(): void;
}

const defaultCodeblockPadding = 10;

class CodeBlockPart extends Disposable implements IChatResultCodeBlockPart {
	private readonly _onDidChangeContentHeight = this._register(new Emitter<number>());
	public readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	private readonly editor: CodeEditorWidget;
	private readonly toolbar: MenuWorkbenchToolBar;
	private readonly contextKeyService: IContextKeyService;

	public readonly textModel: ITextModel;
	public readonly element: HTMLElement;

	private currentScrollWidth = 0;

	constructor(
		private readonly options: ChatEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super();
		this.element = $('.interactive-result-editor-wrapper');
		this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
		this.toolbar = this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.element, MenuId.ChatCodeBlock, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));

		this._configureForScreenReader();
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectedKeys.has(AccessibilityVerbositySettingId.Chat)) {
				this._configureForScreenReader();
			}
		}));
		const editorElement = dom.append(this.element, $('.interactive-result-editor'));
		this.editor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, editorElement, {
			...getSimpleEditorOptions(this.configurationService),
			readOnly: true,
			lineNumbers: 'off',
			selectOnLineNumbers: true,
			scrollBeyondLastLine: false,
			lineDecorationsWidth: 8,
			dragAndDrop: false,
			padding: { top: defaultCodeblockPadding, bottom: defaultCodeblockPadding },
			mouseWheelZoom: false,
			scrollbar: {
				alwaysConsumeMouseWheel: false
			},
			ariaLabel: localize('chat.codeBlockHelp', 'Code block'),
			...this.getEditorOptionsFromConfig()
		}, {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				MenuPreventer.ID,
				SelectionClipboardContributionID,
				ContextMenuController.ID,

				WordHighlighterContribution.ID,
				ViewportSemanticTokensContribution.ID,
				BracketMatchingController.ID,
				SmartSelectController.ID,
			])
		}));

		this._register(this.options.onDidChange(() => {
			this.editor.updateOptions(this.getEditorOptionsFromConfig());
		}));

		this._register(this.editor.onDidScrollChange(e => {
			this.currentScrollWidth = e.scrollWidth;
		}));
		this._register(this.editor.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this._onDidChangeContentHeight.fire(e.contentHeight);
			}
		}));
		this._register(this.editor.onDidBlurEditorWidget(() => {
			this.element.classList.remove('focused');
			WordHighlighterContribution.get(this.editor)?.stopHighlighting();
		}));
		this._register(this.editor.onDidFocusEditorWidget(() => {
			this.element.classList.add('focused');
			WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
		}));

		this.textModel = this._register(this.modelService.createModel('', null, undefined));
		this.editor.setModel(this.textModel);
	}

	focus(): void {
		this.editor.focus();
	}

	private updatePaddingForLayout() {
		// scrollWidth = "the width of the content that needs to be scrolled"
		// contentWidth = "the width of the area where content is displayed"
		const horizontalScrollbarVisible = this.currentScrollWidth > this.editor.getLayoutInfo().contentWidth;
		const scrollbarHeight = this.editor.getLayoutInfo().horizontalScrollbarHeight;
		const bottomPadding = horizontalScrollbarVisible ?
			Math.max(defaultCodeblockPadding - scrollbarHeight, 2) :
			defaultCodeblockPadding;
		this.editor.updateOptions({ padding: { top: defaultCodeblockPadding, bottom: bottomPadding } });
	}

	private _configureForScreenReader(): void {
		const toolbarElt = this.toolbar.getElement();
		if (this.accessibilityService.isScreenReaderOptimized()) {
			toolbarElt.style.display = 'block';
			toolbarElt.ariaLabel = this.configurationService.getValue(AccessibilityVerbositySettingId.Chat) ? localize('chat.codeBlock.toolbarVerbose', 'Toolbar for code block which can be reached via tab') : localize('chat.codeBlock.toolbar', 'Code block toolbar');
		} else {
			toolbarElt.style.display = '';
		}

	}

	private getEditorOptionsFromConfig(): IEditorOptions {
		return {
			wordWrap: this.options.configuration.resultEditor.wordWrap,
			fontLigatures: this.options.configuration.resultEditor.fontLigatures,
			bracketPairColorization: this.options.configuration.resultEditor.bracketPairColorization,
			fontFamily: this.options.configuration.resultEditor.fontFamily === 'default' ?
				EDITOR_FONT_DEFAULTS.fontFamily :
				this.options.configuration.resultEditor.fontFamily,
			fontSize: this.options.configuration.resultEditor.fontSize,
			fontWeight: this.options.configuration.resultEditor.fontWeight,
			lineHeight: this.options.configuration.resultEditor.lineHeight,
		};
	}

	layout(width: number): void {
		const realContentHeight = this.editor.getContentHeight();
		const editorBorder = 2;
		this.editor.layout({ width: width - editorBorder, height: realContentHeight });
		this.updatePaddingForLayout();
	}

	render(data: IChatResultCodeBlockData, width: number): void {
		this.contextKeyService.updateParent(data.parentContextKeyService);

		if (this.options.configuration.resultEditor.wordWrap === 'on') {
			// Intialize the editor with the new proper width so that getContentHeight
			// will be computed correctly in the next call to layout()
			this.layout(width);
		}

		const text = this.fixCodeText(data.text, data.languageId);
		this.setText(text);

		const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(data.languageId) ?? undefined;
		this.setLanguage(vscodeLanguageId);

		this.layout(width);
		this.editor.updateOptions({ ariaLabel: localize('chat.codeBlockLabel', "Code block {0}", data.codeBlockIndex + 1) });
		this.toolbar.context = <IChatCodeBlockActionContext>{
			code: data.text,
			codeBlockIndex: data.codeBlockIndex,
			element: data.element,
			languageId: vscodeLanguageId
		};

		if (isResponseVM(data.element) && data.element.errorDetails?.responseIsFiltered) {
			dom.hide(this.toolbar.getElement());
		} else {
			dom.show(this.toolbar.getElement());
		}
	}

	private fixCodeText(text: string, languageId: string): string {
		if (languageId === 'php') {
			if (!text.trim().startsWith('<')) {
				return `<?php\n${text}\n?>`;
			}
		}

		return text;
	}

	private setText(newText: string): void {
		const currentText = this.textModel.getValue(EndOfLinePreference.LF);
		if (newText === currentText) {
			return;
		}

		if (newText.startsWith(currentText)) {
			const text = newText.slice(currentText.length);
			const lastLine = this.textModel.getLineCount();
			const lastCol = this.textModel.getLineMaxColumn(lastLine);
			this.textModel.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol), text }]);
		} else {
			// console.log(`Failed to optimize setText`);
			this.textModel.setValue(newText);
		}
	}

	private setLanguage(vscodeLanguageId: string | undefined): void {
		this.textModel.setLanguage(vscodeLanguageId ?? PLAINTEXT_LANGUAGE_ID);
	}
}



class EditorPool extends Disposable {
	private _pool: ResourcePool<IChatResultCodeBlockPart>;

	public get inUse(): ReadonlySet<IChatResultCodeBlockPart> {
		return this._pool.inUse;
	}

	constructor(
		private readonly options: ChatEditorOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.editorFactory()));

		// TODO listen to changes on options
	}

	private editorFactory(): IChatResultCodeBlockPart {
		return this.instantiationService.createInstance(CodeBlockPart, this.options);
	}

	get(): IDisposableReference<IChatResultCodeBlockPart> {
		const object = this._pool.get();
		let stale = false;
		return {
			object,
			isStale: () => stale,
			dispose: () => {
				stale = true;
				this._pool.release(object);
			}
		};
	}
}
