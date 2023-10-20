/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./codeBlockPart';

import * as dom from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { BracketMatchingController } from 'vs/editor/contrib/bracketMatching/browser/bracketMatching';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { ViewportSemanticTokensContribution } from 'vs/editor/contrib/semanticTokens/browser/viewportSemanticTokens';
import { SmartSelectController } from 'vs/editor/contrib/smartSelect/browser/smartSelect';
import { WordHighlighterContribution } from 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';

const $ = dom.$;


export interface ICodeBlockData {
	text: string;
	languageId: string;
	codeBlockIndex: number;
	element: unknown;
	parentContextKeyService?: IContextKeyService;
	hideToolbar?: boolean;
}

export interface ICodeBlockActionContext {
	code: string;
	languageId: string;
	codeBlockIndex: number;
	element: unknown;
}


export interface ICodeBlockPart {
	readonly onDidChangeContentHeight: Event<number>;
	readonly element: HTMLElement;
	readonly textModel: ITextModel;
	layout(width: number): void;
	render(data: ICodeBlockData, width: number): void;
	focus(): void;
	dispose(): void;
}

const defaultCodeblockPadding = 10;

export class CodeBlockPart extends Disposable implements ICodeBlockPart {
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
		readonly menuId: MenuId,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super();
		this.element = $('.interactive-result-code-block');

		this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
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

		const toolbarElement = dom.append(this.element, $('.interactive-result-code-block-toolbar'));
		const editorScopedService = this.editor.contextKeyService.createScoped(toolbarElement);
		const editorScopedInstantiationService = scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService]));
		this.toolbar = this._register(editorScopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarElement, menuId, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));
		this._register(this.toolbar.onDidChangeDropdownVisibility(e => {
			toolbarElement.classList.toggle('force-visibility', e);
		}));

		this._configureForScreenReader();
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectedKeys.has(AccessibilityVerbositySettingId.Chat)) {
				this._configureForScreenReader();
			}
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


	render(data: ICodeBlockData, width: number): void {
		if (data.parentContextKeyService) {
			this.contextKeyService.updateParent(data.parentContextKeyService);
		}

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
		this.toolbar.context = <ICodeBlockActionContext>{
			code: data.text,
			codeBlockIndex: data.codeBlockIndex,
			element: data.element,
			languageId: vscodeLanguageId
		};

		if (data.hideToolbar) {
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
