/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import Event, { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { Extensions, IConfigurationRegistry, IConfigurationNode, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { FontInfo, BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import EDITOR_DEFAULTS = editorOptions.EDITOR_DEFAULTS;
import EDITOR_FONT_DEFAULTS = editorOptions.EDITOR_FONT_DEFAULTS;
import EDITOR_MODEL_DEFAULTS = editorOptions.EDITOR_MODEL_DEFAULTS;

/**
 * Control what pressing Tab does.
 * If it is false, pressing Tab or Shift-Tab will be handled by the editor.
 * If it is true, pressing Tab or Shift-Tab will move the browser focus.
 * Defaults to false.
 */
export interface ITabFocus {
	onDidChangeTabFocus: Event<boolean>;
	getTabFocusMode(): boolean;
	setTabFocusMode(tabFocusMode: boolean): void;
}

export const TabFocus: ITabFocus = new class {
	private _tabFocus: boolean = false;

	private _onDidChangeTabFocus: Emitter<boolean> = new Emitter<boolean>();
	public onDidChangeTabFocus: Event<boolean> = this._onDidChangeTabFocus.event;

	public getTabFocusMode(): boolean {
		return this._tabFocus;
	}

	public setTabFocusMode(tabFocusMode: boolean): void {
		if (this._tabFocus === tabFocusMode) {
			return;
		}

		this._tabFocus = tabFocusMode;
		this._onDidChangeTabFocus.fire(this._tabFocus);
	}
};

export interface IEnvConfiguration {
	extraEditorClassName: string;
	outerWidth: number;
	outerHeight: number;
	emptySelectionClipboard: boolean;
	pixelRatio: number;
	zoomLevel: number;
	accessibilitySupport: platform.AccessibilitySupport;
}

export abstract class CommonEditorConfiguration extends Disposable implements editorCommon.IConfiguration {

	protected _rawOptions: editorOptions.IEditorOptions;
	protected _validatedOptions: editorOptions.IValidatedEditorOptions;
	public editor: editorOptions.InternalEditorOptions;
	private _isDominatedByLongLines: boolean;
	private _lineNumbersDigitCount: number;

	private _onDidChange = this._register(new Emitter<editorOptions.IConfigurationChangedEvent>());
	public onDidChange: Event<editorOptions.IConfigurationChangedEvent> = this._onDidChange.event;

	constructor(options: editorOptions.IEditorOptions) {
		super();

		// Do a "deep clone of sorts" on the incoming options
		this._rawOptions = objects.mixin({}, options || {});
		this._rawOptions.scrollbar = objects.mixin({}, this._rawOptions.scrollbar || {});
		this._rawOptions.minimap = objects.mixin({}, this._rawOptions.minimap || {});
		this._rawOptions.find = objects.mixin({}, this._rawOptions.find || {});

		this._validatedOptions = editorOptions.EditorOptionsValidator.validate(this._rawOptions, EDITOR_DEFAULTS);
		this.editor = null;
		this._isDominatedByLongLines = false;
		this._lineNumbersDigitCount = 1;

		this._register(EditorZoom.onDidChangeZoomLevel(_ => this._recomputeOptions()));
		this._register(TabFocus.onDidChangeTabFocus(_ => this._recomputeOptions()));
	}

	public dispose(): void {
		super.dispose();
	}

	protected _recomputeOptions(): void {
		const oldOptions = this.editor;
		const newOptions = this._computeInternalOptions();

		if (oldOptions && oldOptions.equals(newOptions)) {
			return;
		}

		this.editor = newOptions;

		if (oldOptions) {
			this._onDidChange.fire(oldOptions.createChangeEvent(newOptions));
		}
	}

	public getRawOptions(): editorOptions.IEditorOptions {
		return this._rawOptions;
	}

	private _computeInternalOptions(): editorOptions.InternalEditorOptions {
		const opts = this._validatedOptions;
		const partialEnv = this._getEnvConfiguration();
		const bareFontInfo = BareFontInfo.createFromRawSettings(this._rawOptions, partialEnv.zoomLevel);
		const env: editorOptions.IEnvironmentalOptions = {
			outerWidth: partialEnv.outerWidth,
			outerHeight: partialEnv.outerHeight,
			fontInfo: this.readConfiguration(bareFontInfo),
			extraEditorClassName: partialEnv.extraEditorClassName,
			isDominatedByLongLines: this._isDominatedByLongLines,
			lineNumbersDigitCount: this._lineNumbersDigitCount,
			emptySelectionClipboard: partialEnv.emptySelectionClipboard,
			pixelRatio: partialEnv.pixelRatio,
			tabFocusMode: TabFocus.getTabFocusMode(),
			accessibilitySupport: partialEnv.accessibilitySupport
		};
		return editorOptions.InternalEditorOptionsFactory.createInternalEditorOptions(env, opts);
	}

	public updateOptions(newOptions: editorOptions.IEditorOptions): void {
		this._rawOptions = objects.mixin(this._rawOptions, newOptions || {});
		this._validatedOptions = editorOptions.EditorOptionsValidator.validate(this._rawOptions, EDITOR_DEFAULTS);
		this._recomputeOptions();
	}

	public setIsDominatedByLongLines(isDominatedByLongLines: boolean): void {
		this._isDominatedByLongLines = isDominatedByLongLines;
		this._recomputeOptions();
	}

	public setMaxLineNumber(maxLineNumber: number): void {
		let digitCount = CommonEditorConfiguration._digitCount(maxLineNumber);
		if (this._lineNumbersDigitCount === digitCount) {
			return;
		}
		this._lineNumbersDigitCount = digitCount;
		this._recomputeOptions();
	}

	private static _digitCount(n: number): number {
		var r = 0;
		while (n) {
			n = Math.floor(n / 10);
			r++;
		}
		return r ? r : 1;
	}
	protected abstract _getEnvConfiguration(): IEnvConfiguration;

	protected abstract readConfiguration(styling: BareFontInfo): FontInfo;

}

const configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
const editorConfiguration: IConfigurationNode = {
	'id': 'editor',
	'order': 5,
	'type': 'object',
	'title': nls.localize('editorConfigurationTitle', "Editor"),
	'overridable': true,
	'scope': ConfigurationScope.RESOURCE,
	'properties': {
		'editor.fontFamily': {
			'type': 'string',
			'default': EDITOR_FONT_DEFAULTS.fontFamily,
			'description': nls.localize('fontFamily', "Controls the font family.")
		},
		'editor.fontWeight': {
			'type': 'string',
			'enum': ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
			'default': EDITOR_FONT_DEFAULTS.fontWeight,
			'description': nls.localize('fontWeight', "Controls the font weight.")
		},
		'editor.fontSize': {
			'type': 'number',
			'default': EDITOR_FONT_DEFAULTS.fontSize,
			'description': nls.localize('fontSize', "Controls the font size in pixels.")
		},
		'editor.lineHeight': {
			'type': 'number',
			'default': EDITOR_FONT_DEFAULTS.lineHeight,
			'description': nls.localize('lineHeight', "Controls the line height. Use 0 to compute the lineHeight from the fontSize.")
		},
		'editor.letterSpacing': {
			'type': 'number',
			'default': EDITOR_FONT_DEFAULTS.letterSpacing,
			'description': nls.localize('letterSpacing', "Controls the letter spacing in pixels.")
		},
		'editor.lineNumbers': {
			'type': 'string',
			'enum': ['off', 'on', 'relative'],
			'default': 'on',
			'description': nls.localize('lineNumbers', "Controls the display of line numbers. Possible values are 'on', 'off', and 'relative'. 'relative' shows the line count from the current cursor position.")
		},
		'editor.rulers': {
			'type': 'array',
			'items': {
				'type': 'number'
			},
			'default': EDITOR_DEFAULTS.viewInfo.rulers,
			'description': nls.localize('rulers', "Columns at which to show vertical rulers")
		},
		'editor.wordSeparators': {
			'type': 'string',
			'default': EDITOR_DEFAULTS.wordSeparators,
			'description': nls.localize('wordSeparators', "Characters that will be used as word separators when doing word related navigations or operations")
		},
		'editor.tabSize': {
			'type': 'number',
			'default': EDITOR_MODEL_DEFAULTS.tabSize,
			'minimum': 1,
			'description': nls.localize('tabSize', "The number of spaces a tab is equal to. This setting is overriden based on the file contents when `editor.detectIndentation` is on."),
			'errorMessage': nls.localize('tabSize.errorMessage', "Expected 'number'. Note that the value \"auto\" has been replaced by the `editor.detectIndentation` setting.")
		},
		'editor.insertSpaces': {
			'type': 'boolean',
			'default': EDITOR_MODEL_DEFAULTS.insertSpaces,
			'description': nls.localize('insertSpaces', "Insert spaces when pressing Tab. This setting is overriden based on the file contents when `editor.detectIndentation` is on."),
			'errorMessage': nls.localize('insertSpaces.errorMessage', "Expected 'boolean'. Note that the value \"auto\" has been replaced by the `editor.detectIndentation` setting.")
		},
		'editor.detectIndentation': {
			'type': 'boolean',
			'default': EDITOR_MODEL_DEFAULTS.detectIndentation,
			'description': nls.localize('detectIndentation', "When opening a file, `editor.tabSize` and `editor.insertSpaces` will be detected based on the file contents.")
		},
		'editor.roundedSelection': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.roundedSelection,
			'description': nls.localize('roundedSelection', "Controls if selections have rounded corners")
		},
		'editor.scrollBeyondLastLine': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.scrollBeyondLastLine,
			'description': nls.localize('scrollBeyondLastLine', "Controls if the editor will scroll beyond the last line")
		},
		'editor.smoothScrolling': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.smoothScrolling,
			'description': nls.localize('smoothScrolling', "Controls if the editor will scroll using an animation")
		},
		'editor.minimap.enabled': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.minimap.enabled,
			'description': nls.localize('minimap.enabled', "Controls if the minimap is shown")
		},
		'editor.minimap.showSlider': {
			'type': 'string',
			'enum': ['always', 'mouseover'],
			'default': EDITOR_DEFAULTS.viewInfo.minimap.showSlider,
			'description': nls.localize('minimap.showSlider', "Controls whether the minimap slider is automatically hidden. Possible values are \'always\' and \'mouseover\'")
		},
		'editor.minimap.renderCharacters': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.minimap.renderCharacters,
			'description': nls.localize('minimap.renderCharacters', "Render the actual characters on a line (as opposed to color blocks)")
		},
		'editor.minimap.maxColumn': {
			'type': 'number',
			'default': EDITOR_DEFAULTS.viewInfo.minimap.maxColumn,
			'description': nls.localize('minimap.maxColumn', "Limit the width of the minimap to render at most a certain number of columns")
		},
		'editor.find.seedSearchStringFromSelection': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.find.seedSearchStringFromSelection,
			'description': nls.localize('find.seedSearchStringFromSelection', "Controls if we seed the search string in Find Widget from editor selection")
		},
		'editor.find.autoFindInSelection': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.find.autoFindInSelection,
			'description': nls.localize('find.autoFindInSelection', "Controls if Find in Selection flag is turned on when multiple characters or lines of text are selected in the editor")
		},
		'editor.wordWrap': {
			'type': 'string',
			'enum': ['off', 'on', 'wordWrapColumn', 'bounded'],
			'enumDescriptions': [
				nls.localize('wordWrap.off', "Lines will never wrap."),
				nls.localize('wordWrap.on', "Lines will wrap at the viewport width."),
				nls.localize({
					key: 'wordWrap.wordWrapColumn',
					comment: [
						'- `editor.wordWrapColumn` refers to a different setting and should not be localized.'
					]
				}, "Lines will wrap at `editor.wordWrapColumn`."),
				nls.localize({
					key: 'wordWrap.bounded',
					comment: [
						'- viewport means the edge of the visible window size.',
						'- `editor.wordWrapColumn` refers to a different setting and should not be localized.'
					]
				}, "Lines will wrap at the minimum of viewport and `editor.wordWrapColumn`."),
			],
			'default': EDITOR_DEFAULTS.wordWrap,
			'description': nls.localize({
				key: 'wordWrap',
				comment: [
					'- \'off\', \'on\', \'wordWrapColumn\' and \'bounded\' refer to values the setting can take and should not be localized.',
					'- `editor.wordWrapColumn` refers to a different setting and should not be localized.'
				]
			}, "Controls how lines should wrap. Can be:\n - 'off' (disable wrapping),\n - 'on' (viewport wrapping),\n - 'wordWrapColumn' (wrap at `editor.wordWrapColumn`) or\n - 'bounded' (wrap at minimum of viewport and `editor.wordWrapColumn`).")
		},
		'editor.wordWrapColumn': {
			'type': 'integer',
			'default': EDITOR_DEFAULTS.wordWrapColumn,
			'minimum': 1,
			'description': nls.localize({
				key: 'wordWrapColumn',
				comment: [
					'- `editor.wordWrap` refers to a different setting and should not be localized.',
					'- \'wordWrapColumn\' and \'bounded\' refer to values the different setting can take and should not be localized.'
				]
			}, "Controls the wrapping column of the editor when `editor.wordWrap` is 'wordWrapColumn' or 'bounded'.")
		},
		'editor.wrappingIndent': {
			'type': 'string',
			'enum': ['none', 'same', 'indent'],
			'default': 'same',
			'description': nls.localize('wrappingIndent', "Controls the indentation of wrapped lines. Can be one of 'none', 'same' or 'indent'.")
		},
		'editor.mouseWheelScrollSensitivity': {
			'type': 'number',
			'default': EDITOR_DEFAULTS.viewInfo.scrollbar.mouseWheelScrollSensitivity,
			'description': nls.localize('mouseWheelScrollSensitivity', "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events")
		},
		'editor.multiCursorModifier': {
			'type': 'string',
			'enum': ['ctrlCmd', 'alt'],
			'enumDescriptions': [
				nls.localize('multiCursorModifier.ctrlCmd', "Maps to `Control` on Windows and Linux and to `Command` on OSX."),
				nls.localize('multiCursorModifier.alt', "Maps to `Alt` on Windows and Linux and to `Option` on OSX.")
			],
			'default': 'alt',
			'description': nls.localize({
				key: 'multiCursorModifier',
				comment: [
					'- `ctrlCmd` refers to a value the setting can take and should not be localized.',
					'- `Control` and `Command` refer to the modifier keys Ctrl or Cmd on the keyboard and can be localized.'
				]
			}, "The modifier to be used to add multiple cursors with the mouse. `ctrlCmd` maps to `Control` on Windows and Linux and to `Command` on OSX. The Go To Definition and Open Link mouse gestures will adapt such that they do not conflict with the multicursor modifier.")
		},
		'editor.quickSuggestions': {
			'anyOf': [
				{
					type: 'boolean',
				},
				{
					type: 'object',
					properties: {
						strings: {
							type: 'boolean',
							default: false,
							description: nls.localize('quickSuggestions.strings', "Enable quick suggestions inside strings.")
						},
						comments: {
							type: 'boolean',
							default: false,
							description: nls.localize('quickSuggestions.comments', "Enable quick suggestions inside comments.")
						},
						other: {
							type: 'boolean',
							default: true,
							description: nls.localize('quickSuggestions.other', "Enable quick suggestions outside of strings and comments.")
						},
					}
				}
			],
			'default': EDITOR_DEFAULTS.contribInfo.quickSuggestions,
			'description': nls.localize('quickSuggestions', "Controls if suggestions should automatically show up while typing")
		},
		'editor.quickSuggestionsDelay': {
			'type': 'integer',
			'default': EDITOR_DEFAULTS.contribInfo.quickSuggestionsDelay,
			'minimum': 0,
			'description': nls.localize('quickSuggestionsDelay', "Controls the delay in ms after which quick suggestions will show up")
		},
		'editor.parameterHints': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.parameterHints,
			'description': nls.localize('parameterHints', "Enables pop-up that shows parameter documentation and type information as you type")
		},
		'editor.autoClosingBrackets': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.autoClosingBrackets,
			'description': nls.localize('autoClosingBrackets', "Controls if the editor should automatically close brackets after opening them")
		},
		'editor.formatOnType': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.formatOnType,
			'description': nls.localize('formatOnType', "Controls if the editor should automatically format the line after typing")
		},
		'editor.formatOnPaste': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.formatOnPaste,
			'description': nls.localize('formatOnPaste', "Controls if the editor should automatically format the pasted content. A formatter must be available and the formatter should be able to format a range in a document.")
		},
		'editor.autoIndent': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.autoIndent,
			'description': nls.localize('autoIndent', "Controls if the editor should automatically adjust the indentation when users type, paste or move lines. Indentation rules of the language must be available. ")
		},
		'editor.suggestOnTriggerCharacters': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.suggestOnTriggerCharacters,
			'description': nls.localize('suggestOnTriggerCharacters', "Controls if suggestions should automatically show up when typing trigger characters")
		},
		'editor.acceptSuggestionOnEnter': {
			'type': 'string',
			'enum': ['on', 'smart', 'off'],
			'default': EDITOR_DEFAULTS.contribInfo.acceptSuggestionOnEnter,
			'description': nls.localize('acceptSuggestionOnEnter', "Controls if suggestions should be accepted on 'Enter' - in addition to 'Tab'. Helps to avoid ambiguity between inserting new lines or accepting suggestions. The value 'smart' means only accept a suggestion with Enter when it makes a textual change")
		},
		'editor.acceptSuggestionOnCommitCharacter': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.acceptSuggestionOnCommitCharacter,
			'description': nls.localize('acceptSuggestionOnCommitCharacter', "Controls if suggestions should be accepted on commit characters. For instance in JavaScript the semi-colon (';') can be a commit character that accepts a suggestion and types that character.")
		},
		'editor.snippetSuggestions': {
			'type': 'string',
			'enum': ['top', 'bottom', 'inline', 'none'],
			'enumDescriptions': [
				nls.localize('snippetSuggestions.top', "Show snippet suggestions on top of other suggestions."),
				nls.localize('snippetSuggestions.bottom', "Show snippet suggestions below other suggestions."),
				nls.localize('snippetSuggestions.inline', "Show snippets suggestions with other suggestions."),
				nls.localize('snippetSuggestions.none', "Do not show snippet suggestions."),
			],
			'default': EDITOR_DEFAULTS.contribInfo.snippetSuggestions,
			'description': nls.localize('snippetSuggestions', "Controls whether snippets are shown with other suggestions and how they are sorted.")
		},
		'editor.emptySelectionClipboard': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.emptySelectionClipboard,
			'description': nls.localize('emptySelectionClipboard', "Controls whether copying without a selection copies the current line.")
		},
		'editor.wordBasedSuggestions': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.wordBasedSuggestions,
			'description': nls.localize('wordBasedSuggestions', "Controls whether completions should be computed based on words in the document.")
		},
		'editor.suggestFontSize': {
			'type': 'integer',
			'default': 0,
			'minimum': 0,
			'description': nls.localize('suggestFontSize', "Font size for the suggest widget")
		},
		'editor.suggestLineHeight': {
			'type': 'integer',
			'default': 0,
			'minimum': 0,
			'description': nls.localize('suggestLineHeight', "Line height for the suggest widget")
		},
		'editor.selectionHighlight': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.selectionHighlight,
			'description': nls.localize('selectionHighlight', "Controls whether the editor should highlight similar matches to the selection")
		},
		'editor.occurrencesHighlight': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.occurrencesHighlight,
			'description': nls.localize('occurrencesHighlight', "Controls whether the editor should highlight semantic symbol occurrences")
		},
		'editor.overviewRulerLanes': {
			'type': 'integer',
			'default': 3,
			'description': nls.localize('overviewRulerLanes', "Controls the number of decorations that can show up at the same position in the overview ruler")
		},
		'editor.overviewRulerBorder': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.overviewRulerBorder,
			'description': nls.localize('overviewRulerBorder', "Controls if a border should be drawn around the overview ruler.")
		},
		'editor.cursorBlinking': {
			'type': 'string',
			'enum': ['blink', 'smooth', 'phase', 'expand', 'solid'],
			'default': editorOptions.blinkingStyleToString(EDITOR_DEFAULTS.viewInfo.cursorBlinking),
			'description': nls.localize('cursorBlinking', "Control the cursor animation style, possible values are 'blink', 'smooth', 'phase', 'expand' and 'solid'")
		},
		'editor.mouseWheelZoom': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.mouseWheelZoom,
			'description': nls.localize('mouseWheelZoom', "Zoom the font of the editor when using mouse wheel and holding Ctrl")
		},
		'editor.cursorStyle': {
			'type': 'string',
			'enum': ['block', 'block-outline', 'line', 'line-thin', 'underline', 'underline-thin'],
			'default': editorOptions.cursorStyleToString(EDITOR_DEFAULTS.viewInfo.cursorStyle),
			'description': nls.localize('cursorStyle', "Controls the cursor style, accepted values are 'block', 'block-outline', 'line', 'line-thin', 'underline' and 'underline-thin'")
		},
		'editor.fontLigatures': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.fontLigatures,
			'description': nls.localize('fontLigatures', "Enables font ligatures")
		},
		'editor.hideCursorInOverviewRuler': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.hideCursorInOverviewRuler,
			'description': nls.localize('hideCursorInOverviewRuler', "Controls if the cursor should be hidden in the overview ruler.")
		},
		'editor.renderWhitespace': {
			'type': 'string',
			'enum': ['none', 'boundary', 'all'],
			default: EDITOR_DEFAULTS.viewInfo.renderWhitespace,
			description: nls.localize('renderWhitespace', "Controls how the editor should render whitespace characters, possibilities are 'none', 'boundary', and 'all'. The 'boundary' option does not render single spaces between words.")
		},
		'editor.renderControlCharacters': {
			'type': 'boolean',
			default: EDITOR_DEFAULTS.viewInfo.renderControlCharacters,
			description: nls.localize('renderControlCharacters', "Controls whether the editor should render control characters")
		},
		'editor.renderIndentGuides': {
			'type': 'boolean',
			default: EDITOR_DEFAULTS.viewInfo.renderIndentGuides,
			description: nls.localize('renderIndentGuides', "Controls whether the editor should render indent guides")
		},
		'editor.renderLineHighlight': {
			'type': 'string',
			'enum': ['none', 'gutter', 'line', 'all'],
			default: EDITOR_DEFAULTS.viewInfo.renderLineHighlight,
			description: nls.localize('renderLineHighlight', "Controls how the editor should render the current line highlight, possibilities are 'none', 'gutter', 'line', and 'all'.")
		},
		'editor.codeLens': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.codeLens,
			'description': nls.localize('codeLens', "Controls if the editor shows code lenses")
		},
		'editor.folding': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.folding,
			'description': nls.localize('folding', "Controls whether the editor has code folding enabled")
		},
		'editor.showFoldingControls': {
			'type': 'string',
			'enum': ['always', 'mouseover'],
			'default': EDITOR_DEFAULTS.contribInfo.showFoldingControls,
			'description': nls.localize('showFoldingControls', "Controls whether the fold controls on the gutter are automatically hidden.")
		},
		'editor.matchBrackets': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.matchBrackets,
			'description': nls.localize('matchBrackets', "Highlight matching brackets when one of them is selected.")
		},
		'editor.glyphMargin': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.viewInfo.glyphMargin,
			'description': nls.localize('glyphMargin', "Controls whether the editor should render the vertical glyph margin. Glyph margin is mostly used for debugging.")
		},
		'editor.useTabStops': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.useTabStops,
			'description': nls.localize('useTabStops', "Inserting and deleting whitespace follows tab stops")
		},
		'editor.trimAutoWhitespace': {
			'type': 'boolean',
			'default': EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
			'description': nls.localize('trimAutoWhitespace', "Remove trailing auto inserted whitespace")
		},
		'editor.stablePeek': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('stablePeek', "Keep peek editors open even when double clicking their content or when hitting Escape.")
		},
		'editor.dragAndDrop': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.dragAndDrop,
			'description': nls.localize('dragAndDrop', "Controls if the editor should allow to move selections via drag and drop.")
		},
		'editor.accessibilitySupport': {
			'type': 'string',
			'enum': ['auto', 'on', 'off'],
			'enumDescriptions': [
				nls.localize('accessibilitySupport.auto', "The editor will use platform APIs to detect when a Screen Reader is attached."),
				nls.localize('accessibilitySupport.on', "The editor will be permanently optimized for usage with a Screen Reader."),
				nls.localize('accessibilitySupport.off', "The editor will never be optimized for usage with a Screen Reader."),
			],
			'default': EDITOR_DEFAULTS.accessibilitySupport,
			'description': nls.localize('accessibilitySupport', "Controls whether the editor should run in a mode where it is optimized for screen readers.")
		},
		'editor.links': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.links,
			'description': nls.localize('links', "Controls whether the editor should detect links and make them clickable")
		},
		'editor.colorDecorators': {
			'type': 'boolean',
			'default': EDITOR_DEFAULTS.contribInfo.colorDecorators,
			'description': nls.localize('colorDecorators', "Controls whether the editor should render the inline color decorators and color picker.")
		},
		'diffEditor.renderSideBySide': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('sideBySide', "Controls if the diff editor shows the diff side by side or inline")
		},
		'diffEditor.ignoreTrimWhitespace': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('ignoreTrimWhitespace', "Controls if the diff editor shows changes in leading or trailing whitespace as diffs")
		},
		'diffEditor.renderIndicators': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('renderIndicators', "Controls if the diff editor shows +/- indicators for added/removed changes")
		}
	}
};

if (platform.isLinux) {
	editorConfiguration['properties']['editor.selectionClipboard'] = {
		'type': 'boolean',
		'default': EDITOR_DEFAULTS.contribInfo.selectionClipboard,
		'description': nls.localize('selectionClipboard', "Controls if the Linux primary clipboard should be supported.")
	};
}

configurationRegistry.registerConfiguration(editorConfiguration);
