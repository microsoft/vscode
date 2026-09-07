/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../../editor/browser/config/editorConfiguration.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { IModelDeltaDecoration, ITextModel, TextDirection } from '../../../../../editor/common/model.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

/**
 * Wraps into three view lines at `WORD_WRAP_COLUMN`, followed by a line short enough to
 * stay on a single view line, so that soft wraps and real line breaks sit next to each other.
 */
const SAMPLE_TEXT = [
	'The quick brown fox jumps over the lazy dog near the river bank.',
	'A short line.',
	'Pack my box with five dozen liquor jugs.',
].join('\n');

const RTL_SAMPLE_TEXT = [
	'שועל חום מהיר קופץ מעל הכלב העצלן ליד גדת הנהר.',
	'שורה קצרה.',
].join('\n');

/**
 * A right-to-left line above a left-to-right one, both long enough to wrap, so that the two
 * glyph variants and the two edges they are pinned to show up side by side.
 */
const MIXED_DIRECTION_TEXT = [
	'שועל חום מהיר קופץ מעל הכלב העצלן ליד גדת הנהר.',
	'The quick brown fox jumps over the lazy dog.',
].join('\n');

/**
 * A single token with no break opportunity in it, so wrapping has to split it mid word.
 */
const UNBREAKABLE_TEXT = [
	'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ',
	'A short line.',
].join('\n');

const WORD_WRAP_COLUMN = 28;

interface IWordWrapIndicatorFixtureOptions {
	readonly text?: string;
	readonly options?: IEditorConstructionOptions;
	/**
	 * Decorations to apply once the model is attached, e.g. to override the line height or the
	 * text direction of a line.
	 */
	readonly decorations?: (model: ITextModel) => IModelDeltaDecoration[];
	/**
	 * Selection to place once the model is attached, to show how the glyph sits against the
	 * selection background.
	 */
	readonly selection?: Selection;
}

function renderWordWrapIndicator(
	{ container, disposableStore, theme }: ComponentFixtureContext,
	{ text = SAMPLE_TEXT, options, decorations, selection }: IWordWrapIndicatorFixtureOptions = {}
): void {
	container.style.width = '360px';
	container.style.height = '200px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	const model = disposableStore.add(createTextModel(
		instantiationService,
		text,
		URI.parse('inmemory://word-wrap-indicator.txt'),
		'plaintext'
	));

	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			automaticLayout: true,
			fontFamily: 'Consolas, "Courier New", monospace',
			fontSize: 14,
			glyphMargin: false,
			lineNumbers: 'on',
			minimap: { enabled: false },
			renderLineHighlight: 'none',
			scrollBeyondLastLine: false,
			wordWrap: 'wordWrapColumn',
			wordWrapColumn: WORD_WRAP_COLUMN,
			wordWrapIndicator: true,
			...options,
		},
		{ contributions: [] }
	));
	editor.setModel(model);

	if (decorations) {
		model.deltaDecorations([], decorations(model));
	}
	if (selection) {
		editor.setSelection(selection);
	}
}

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	WordWrapIndicator: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['Three numbered lines of plain text, the first and third of which wrap onto further unnumbered view lines. Every view line that continues onto the next one ends with a small muted hooked arrow glyph placed immediately after its last character. The unwrapped short line and the final view line of each wrapped line have no glyph.'],
		render: context => renderWordWrapIndicator(context),
	}),
	WordWrapIndicatorDisabled: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The same wrapped plain text as the enabled fixture, with no glyph at the end of any view line. Line breaks and wrap positions are otherwise identical.'],
		render: context => renderWordWrapIndicator(context, { options: { wordWrapIndicator: false } }),
	}),
	WordWrapIndicatorVariableLineHeight: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The first model line is rendered at double the height of the others. The hooked arrow glyphs on its wrapped view lines are as tall as those taller lines and stay aligned with the text, while the glyph on the last line keeps the default height.'],
		render: context => renderWordWrapIndicator(context, {
			decorations: model => [{
				range: new Range(1, 1, 1, model.getLineMaxColumn(1)),
				options: { description: 'fixture-line-height', lineHeight: 2 },
			}],
		}),
	}),
	WordWrapIndicatorRightToLeft: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Right-to-left Hebrew text, right aligned and wrapping onto several view lines. Every view line that continues onto the next one ends with a small muted hooked arrow glyph at its left edge, immediately left of the last character and pointing rightwards, mirroring the left-pointing glyph used on left-to-right lines. The final view line of the wrapped line and the short unwrapped line have no glyph.'],
		render: context => renderWordWrapIndicator(context, {
			text: RTL_SAMPLE_TEXT,
			decorations: model => [{
				range: new Range(1, 1, 1, model.getLineMaxColumn(1)),
				options: { description: 'fixture-rtl', textDirection: TextDirection.RTL },
			}],
		}),
	}),
	WordWrapIndicatorMixedDirection: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A right-to-left Hebrew line above a left-to-right English line, both wrapping onto further view lines. The wrapped view lines of the Hebrew line carry a rightwards hooked arrow at their left edge, the wrapped view lines of the English line a leftwards hooked arrow at their right edge, so each glyph sits where its own line ends and points back along its own reading direction.'],
		render: context => renderWordWrapIndicator(context, {
			text: MIXED_DIRECTION_TEXT,
			decorations: model => [{
				range: new Range(1, 1, 1, model.getLineMaxColumn(1)),
				options: { description: 'fixture-rtl', textDirection: TextDirection.RTL },
			}],
		}),
	}),
	WordWrapIndicatorWrappingIndent: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same wrapped plain text, with every continuation view line indented past the start of its model line. The hooked arrow glyphs stay pinned to the end of each wrapped view line, so they are unaffected by the indent and remain flush with the wrap column.'],
		render: context => renderWordWrapIndicator(context, { options: { wrappingIndent: 'indent' } }),
	}),
	WordWrapIndicatorUnbreakableToken: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A single long run of letters with no spaces in it, broken mid token across two view lines above a short unwrapped line. The first view line ends with a hooked arrow glyph immediately after its last letter, showing that a mid word break is marked the same way as a break at a space.'],
		render: context => renderWordWrapIndicator(context, { text: UNBREAKABLE_TEXT }),
	}),
	WordWrapIndicatorSelected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same wrapped plain text with the whole first model line selected, so its view lines carry a selection background. The hooked arrow glyphs on those view lines stay visible against the selection background, painted underneath the selected text rather than over it.'],
		render: context => renderWordWrapIndicator(context, {
			selection: new Selection(1, 1, 2, 1),
		}),
	}),
	WordWrapIndicatorWithWhitespace: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same wrapped plain text with whitespace rendering turned on, so every space shows as a small dot. The hooked arrow glyphs sit immediately after the trailing dot of each wrapped view line and are drawn in the same muted colour as the dots, since the indicator colour defaults to the whitespace colour.'],
		render: context => renderWordWrapIndicator(context, { options: { renderWhitespace: 'all' } }),
	}),
});
