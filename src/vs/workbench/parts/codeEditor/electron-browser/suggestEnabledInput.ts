/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/suggestEnabledInput';
import { $, Dimension, addClass, append, removeClass } from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { Color } from 'vs/base/common/color';
import { Emitter, Event, chain } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { mixin } from 'vs/base/common/objects';
import { isMacintosh } from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/contextmenu';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ColorIdentifier, editorSelectionBackground, inputBackground, inputBorder, inputForeground, inputPlaceholderForeground, selectionBackground } from 'vs/platform/theme/common/colorRegistry';
import { IStyleOverrides, IThemable, attachStyler } from 'vs/platform/theme/common/styler';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { MenuPreventer } from 'vs/workbench/parts/codeEditor/browser/menuPreventer';
import { getSimpleEditorOptions } from 'vs/workbench/parts/codeEditor/browser/simpleEditorOptions';
import { SelectionClipboard } from 'vs/workbench/parts/codeEditor/electron-browser/selectionClipboard';

interface SuggestResultsProvider {
	/**
	 * Provider function for suggestion results.
	 *
	 * @param query the full text of the input.
	 */
	provideResults: (query: string) => string[];

	/**
	 * Trigger characters for this input. Suggestions will appear when one of these is typed,
	 * or upon `ctrl+space` triggering at a word boundary.
	 *
	 * Defaults to the empty array.
	 */
	triggerCharacters?: string[];

	/**
	 * Defines the sorting function used when showing results.
	 *
	 * Defaults to the identity function.
	 */
	sortKey?: (result: string) => string;
}

interface SuggestEnabledInputOptions {
	/**
	 * The text to show when no input is present.
	 *
	 * Defaults to the empty string.
	 */
	placeholderText?: string;

	/**
	 * Context key tracking the focus state of this element
	 */
	focusContextKey?: IContextKey<boolean>;
}

export interface ISuggestEnabledInputStyleOverrides extends IStyleOverrides {
	inputBackground?: ColorIdentifier;
	inputForeground?: ColorIdentifier;
	inputBorder?: ColorIdentifier;
	inputPlaceholderForeground?: ColorIdentifier;
}

type ISuggestEnabledInputStyles = {
	[P in keyof ISuggestEnabledInputStyleOverrides]: Color;
};

export function attachSuggestEnabledInputBoxStyler(widget: IThemable, themeService: IThemeService, style?: ISuggestEnabledInputStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		inputBackground: (style && style.inputBackground) || inputBackground,
		inputForeground: (style && style.inputForeground) || inputForeground,
		inputBorder: (style && style.inputBorder) || inputBorder,
		inputPlaceholderForeground: (style && style.inputPlaceholderForeground) || inputPlaceholderForeground,
	} as ISuggestEnabledInputStyleOverrides, widget);
}

export class SuggestEnabledInput extends Widget implements IThemable {

	private _onShouldFocusResults = new Emitter<void>();
	readonly onShouldFocusResults: Event<void> = this._onShouldFocusResults.event;

	private _onEnter = new Emitter<void>();
	readonly onEnter: Event<void> = this._onEnter.event;

	private _onInputDidChange = new Emitter<string>();
	readonly onInputDidChange: Event<string> = this._onInputDidChange.event;

	private disposables: IDisposable[] = [];
	private inputWidget: CodeEditorWidget;
	private stylingContainer: HTMLDivElement;
	private placeholderText: HTMLDivElement;

	constructor(
		id: string,
		parent: HTMLElement,
		suggestionProvider: SuggestResultsProvider,
		ariaLabel: string,
		resourceHandle: string,
		options: SuggestEnabledInputOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
	) {
		super();

		this.stylingContainer = append(parent, $('.suggest-input-container'));
		this.placeholderText = append(this.stylingContainer, $('.suggest-input-placeholder', null, options.placeholderText || ''));

		const editorOptions: IEditorOptions = mixin(
			getSimpleEditorOptions(),
			getSuggestEnabledInputOptions(ariaLabel));

		this.inputWidget = instantiationService.createInstance(CodeEditorWidget, this.stylingContainer,
			editorOptions,
			{
				contributions: [SuggestController, SnippetController2, ContextMenuController, MenuPreventer, SelectionClipboard],
				isSimpleWidget: true,
			});

		let scopeHandle = uri.parse(resourceHandle);
		this.inputWidget.setModel(modelService.createModel('', null, scopeHandle, true));

		this.disposables.push(this.inputWidget.onDidPaste(() => this.setValue(this.getValue()))); // setter cleanses

		this.disposables.push((this.inputWidget.onDidFocusEditorText(() => {
			if (options.focusContextKey) { options.focusContextKey.set(true); }
			addClass(this.stylingContainer, 'synthetic-focus');
		})));
		this.disposables.push((this.inputWidget.onDidBlurEditorText(() => {
			if (options.focusContextKey) { options.focusContextKey.set(false); }
			removeClass(this.stylingContainer, 'synthetic-focus');
		})));

		const onKeyDownMonaco = chain(this.inputWidget.onKeyDown);
		onKeyDownMonaco.filter(e => e.keyCode === KeyCode.Enter).on(e => { e.preventDefault(); this._onEnter.fire(); }, this, this.disposables);
		onKeyDownMonaco.filter(e => e.keyCode === KeyCode.DownArrow && (isMacintosh ? e.metaKey : e.ctrlKey)).on(() => this._onShouldFocusResults.fire(), this, this.disposables);

		let preexistingContent = this.getValue();
		this.disposables.push(this.inputWidget.getModel().onDidChangeContent(() => {
			let content = this.getValue();
			this.placeholderText.style.visibility = content ? 'hidden' : 'visible';
			if (preexistingContent.trim() === content.trim()) { return; }
			this._onInputDidChange.fire();
			preexistingContent = content;
		}));

		let validatedSuggestProvider = {
			provideResults: suggestionProvider.provideResults,
			sortKey: suggestionProvider.sortKey || (a => a),
			triggerCharacters: suggestionProvider.triggerCharacters || []
		};

		this.disposables.push(modes.CompletionProviderRegistry.register({ scheme: scopeHandle.scheme, pattern: '**/' + scopeHandle.path, hasAccessToAllModels: true }, {
			triggerCharacters: validatedSuggestProvider.triggerCharacters,
			provideCompletionItems: (model: ITextModel, position: Position, _context: modes.CompletionContext) => {
				let query = model.getValue();

				let wordStart = query.lastIndexOf(' ', position.column - 1) + 1;
				let alreadyTypedCount = position.column - wordStart - 1;

				// dont show suggestions if the user has typed something, but hasn't used the trigger character
				if (alreadyTypedCount > 0 && (validatedSuggestProvider.triggerCharacters).indexOf(query[wordStart]) === -1) { return { suggestions: [] }; }

				return {
					suggestions: suggestionProvider.provideResults(query).map(result => {
						return <modes.CompletionItem>{
							label: result,
							insertText: result,
							range: Range.fromPositions(position.delta(0, -alreadyTypedCount), position),
							sortText: validatedSuggestProvider.sortKey(result),
							kind: modes.CompletionItemKind.Keyword
						};
					})
				};
			}
		}));
	}

	public setValue(val: string) {
		val = val.replace(/\s/g, ' ');
		const fullRange = new Range(1, 1, 1, this.getValue().length + 1);
		this.inputWidget.executeEdits('suggestEnabledInput.setValue', [EditOperation.replace(fullRange, val)]);
		this.inputWidget.setScrollTop(0);
		this.inputWidget.setPosition(new Position(1, val.length + 1));
	}

	public getValue(): string {
		return this.inputWidget.getValue();
	}


	public style(colors: ISuggestEnabledInputStyles): void {
		this.stylingContainer.style.backgroundColor = colors.inputBackground && colors.inputBackground.toString();
		this.stylingContainer.style.color = colors.inputForeground && colors.inputForeground.toString();
		this.placeholderText.style.color = colors.inputPlaceholderForeground && colors.inputPlaceholderForeground.toString();

		this.stylingContainer.style.borderWidth = '1px';
		this.stylingContainer.style.borderStyle = 'solid';
		this.stylingContainer.style.borderColor = colors.inputBorder ?
			colors.inputBorder.toString() :
			'transparent';

		const cursor = this.stylingContainer.getElementsByClassName('cursor')[0] as HTMLDivElement;
		if (cursor) {
			cursor.style.backgroundColor = colors.inputForeground && colors.inputForeground.toString();
		}
	}

	public focus(selectAll?: boolean): void {
		this.inputWidget.focus();

		if (selectAll && this.inputWidget.getValue()) {
			this.selectAll();
		}
	}

	public layout(dimension: Dimension): void {
		this.inputWidget.layout(dimension);
		this.placeholderText.style.width = `${dimension.width}px`;
	}

	private selectAll(): void {
		this.inputWidget.setSelection(new Range(1, 1, 1, this.getValue().length + 1));
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

// Override styles in selections.ts
registerThemingParticipant((theme, collector) => {
	let selectionColor = theme.getColor(selectionBackground);
	if (selectionColor) {
		selectionColor = selectionColor.transparent(.4);
	} else {
		selectionColor = theme.getColor(editorSelectionBackground);
	}

	if (selectionColor) {
		collector.addRule(`.suggest-input-container .monaco-editor .focused .selected-text { background-color: ${selectionColor}; }`);
	}

	// Override inactive selection bg
	const inputBackgroundColor = theme.getColor(inputBackground);
	if (inputBackground) {
		collector.addRule(`.suggest-input-container .monaco-editor .selected-text { background-color: ${inputBackgroundColor.transparent(.4)}; }`);
	}

	// Override selected fg
	const inputForegroundColor = theme.getColor(inputForeground);
	if (inputForegroundColor) {
		collector.addRule(`.suggest-input-container .monaco-editor .view-line span.inline-selected-text { color: ${inputForegroundColor}; }`);
	}
});


function getSuggestEnabledInputOptions(ariaLabel?: string): IEditorOptions {
	return {
		fontSize: 13,
		lineHeight: 20,
		wordWrap: 'off',
		scrollbar: { vertical: 'hidden', },
		roundedSelection: false,
		renderIndentGuides: false,
		cursorWidth: 1,
		fontFamily: ' -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", "Ubuntu", "Droid Sans", sans-serif',
		ariaLabel: ariaLabel || '',

		snippetSuggestions: 'none',
		suggest: { filterGraceful: false },
		iconsInSuggestions: false
	};
}
