/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../../editor/browser/config/editorConfiguration.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { IModelDeltaDecoration, ITextModel } from '../../../../../editor/common/model.js';
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

/**
 * A single token with no break opportunity in it, so wrapping has to split it mid word.
 */
const UNBREAKABLE_TEXT = [
	'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ',
	'A short line.',
].join('\n');

/**
 * Unbreakable tokens, enough of them to overflow the height of the fixture so that the vertical
 * scrollbar is painted. None of them offers a break opportunity, so wrapping has to split them at
 * the wrap column itself, which puts the end of the wrapped view lines as far right as they go.
 */
const VIEWPORT_FILLING_TEXT = [
	'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ',
	'A short line.',
	'0123456789012345678901234567890123456789012345678901234567890123456789012345',
	'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
	'Another short line.',
	'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ',
].join('\n');

const WIDE_FIXED_COLUMN_TEXT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ';

const WORD_WRAP_COLUMN = 28;

interface IWordWrapIndicatorFixtureOptions {
	readonly text?: string;
	readonly options?: IEditorConstructionOptions;
	/**
	 * Decorations to apply once the model is attached, e.g. to override the line height of a line.
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
		expectedVisualDescriptions: ['Three numbered lines of plain text, the first and third of which wrap onto further unnumbered view lines. Every view line that continues onto the next one has a small muted hooked arrow glyph aligned at the configured wrapping column. The unwrapped short line and the final view line of each wrapped line have no glyph.'],
		render: context => renderWordWrapIndicator(context),
	}),
	WordWrapIndicatorDisabled: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The same wrapped plain text as the enabled fixture, with no glyph at the end of any view line. Line breaks and wrap positions are otherwise identical.'],
		render: context => renderWordWrapIndicator(context, { options: { wordWrapIndicator: false } }),
	}),
	WordWrapIndicatorVariableLineHeight: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The first model line is rendered at double the height of the others. The hooked arrow glyphs remain aligned at the configured wrapping column and are as tall as their corresponding view lines.'],
		render: context => renderWordWrapIndicator(context, {
			decorations: model => [{
				range: new Range(1, 1, 1, model.getLineMaxColumn(1)),
				options: { description: 'fixture-line-height', lineHeight: 2 },
			}],
		}),
	}),
	WordWrapIndicatorWrappingIndent: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same wrapped plain text, with every continuation view line indented past the start of its model line. The hooked arrow glyphs stay aligned at the configured wrapping column, unaffected by the indent or the length of the wrapped text.'],
		render: context => renderWordWrapIndicator(context, { options: { wrappingIndent: 'indent' } }),
	}),
	WordWrapIndicatorUnbreakableToken: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A single long run of letters with no spaces in it, broken mid token across two view lines above a short unwrapped line. The first view line has a hooked arrow glyph at the configured wrapping column, showing that a mid word break is marked the same way as a break at a space.'],
		render: context => renderWordWrapIndicator(context, { text: UNBREAKABLE_TEXT }),
	}),
	WordWrapIndicatorViewportWrapping: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['Long unbreakable runs of letters and digits separated by short unwrapped lines, wrapped to the width of the editor rather than to a fixed column. They add up to more view lines than fit the height, so the vertical scrollbar is painted along the right edge and the bottom view line is clipped. Every wrapped view line has a hooked arrow glyph at the viewport-derived wrapping column, immediately before the scrollbar. The glyphs are fully visible rather than cut off or painted underneath the scrollbar. The short line and the final view line of each run carry no glyph.'],
		render: context => renderWordWrapIndicator(context, {
			text: VIEWPORT_FILLING_TEXT,
			options: { wordWrap: 'on', scrollbar: { vertical: 'visible' } },
		}),
	}),
	WordWrapIndicatorFixedColumnBeyondViewport: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A long unbroken token wraps at a fixed column beyond the right edge of the editor viewport. The visible text reaches the viewport edge without a hooked arrow glyph covering any character.'],
		render: context => renderWordWrapIndicator(context, {
			text: WIDE_FIXED_COLUMN_TEXT,
			options: { wordWrapColumn: 80 },
		}),
	}),
	WordWrapIndicatorSelected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same wrapped plain text with the whole first model line selected, so its view lines carry a selection background. The hooked arrow glyphs remain visible at the configured wrapping column.'],
		render: context => renderWordWrapIndicator(context, {
			selection: new Selection(1, 1, 2, 1),
		}),
	}),
	WordWrapIndicatorWithWhitespace: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The same wrapped plain text with whitespace rendering turned on, so every space shows as a small dot. The hooked arrow glyphs remain aligned at the configured wrapping column and use the same muted colour as the dots, since the indicator colour defaults to the whitespace colour.'],
		render: context => renderWordWrapIndicator(context, { options: { renderWhitespace: 'all' } }),
	}),
});
