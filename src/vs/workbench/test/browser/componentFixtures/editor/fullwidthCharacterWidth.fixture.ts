/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../../editor/browser/config/editorConfiguration.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

/**
 * Four full-width characters are supposed to line up with eight narrow ones, so the trailing
 * pipes only form a straight column when every full-width character occupies exactly two cells.
 */
const GRID = [
	'+--------+--------+',
	'|漢字漢字|abcdefgh|',
	'|ＡＢＣＤ|12345678|',
	'|ひらがな|ijklmnop|',
	'|カタカナ|qrstuvwx|',
	'|、。「」|........|',
	'+--------+--------+',
].join('\n');

/**
 * Characters the centering has to leave alone, for three different reasons: half-width katakana
 * and accented Latin are not full-width to begin with, a full-width character carrying a
 * combining mark would be torn away from its accent, and astral plane CJK is genuinely wide but
 * escapes detection because `isFullWidthCharacter` only ever inspects a single UTF-16 code unit.
 */
const MIXED = [
	'|ｱｲｳｴｵｶｷｸ|halfwidth|',
	'|Ünïcödé  |accented |',
	'|あ́い́う́    |combining|',
	'|𠀋𡈽𡌛    |astral   |',
].join('\n');

const CODE = [
	'// 全角文字はここで二つのセルを占めます',
	'const greeting = "こんにちは、世界";',
	'const width = "ab".length; // 二文字',
].join('\n');

let modelCounter = 0;

function createEditor(context: ComponentFixtureContext, content: string, options: IEditorConstructionOptions = {}) {
	const { container, disposableStore, theme } = context;
	container.style.width = '420px';
	container.style.height = '150px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const model = disposableStore.add(createTextModel(
		instantiationService,
		content,
		URI.parse(`inmemory://fullwidth/${modelCounter++}.txt`),
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
			lineNumbers: 'off',
			minimap: { enabled: false },
			renderLineHighlight: 'none',
			scrollBeyondLastLine: false,
			scrollbar: { horizontal: 'hidden', vertical: 'hidden' },
			wordWrap: 'off',
			...options,
		},
		{ contributions: [] }
	));
	editor.setModel(model);

	return { editor, instantiationService };
}

function renderGrid(context: ComponentFixtureContext, forceFullwidthCharacterWidth: boolean): void {
	createEditor(context, GRID, { forceFullwidthCharacterWidth });
}

function renderMixed(context: ComponentFixtureContext, forceFullwidthCharacterWidth: boolean): void {
	createEditor(context, MIXED, { forceFullwidthCharacterWidth });
}

function renderCode(context: ComponentFixtureContext, forceFullwidthCharacterWidth: boolean): void {
	createEditor(context, CODE, { forceFullwidthCharacterWidth });
}

function renderSelection(context: ComponentFixtureContext, forceFullwidthCharacterWidth: boolean): void {
	const { editor } = createEditor(context, GRID, { forceFullwidthCharacterWidth });
	editor.setSelection(new Range(2, 2, 4, 6));
}

function renderProportionalFont(context: ComponentFixtureContext): void {
	// The setting is computed away when the font is not monospace, because the surrounding
	// narrow characters do not sit on a grid to line up with in the first place.
	createEditor(context, GRID, { forceFullwidthCharacterWidth: true, fontFamily: 'Georgia, serif' });
}

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	FullwidthCharacterWidthOff: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['An ASCII box drawing contains five rows. The left column holds four CJK characters per row and the right column holds eight narrow characters. The pipe separating the two columns is allowed to sit at a different horizontal position on the CJK rows than on the dashed border rows.'],
		render: context => renderGrid(context, false),
	}),
	FullwidthCharacterWidthOn: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['An ASCII box drawing contains five rows. Every pipe forms one straight unbroken vertical line down the whole box, and the closing pipes line up with the plus signs of the dashed borders above and below. Each CJK character is horizontally centered over the two narrow cells it occupies, with even spacing on both sides.'],
		render: context => renderGrid(context, true),
	}),
	FullwidthCharacterWidthNotCentered: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['Four rows of text each start and end with a pipe. Half-width katakana and accented Latin letters render narrow, while the hiragana carrying combining accents and the astral plane CJK characters render at their natural width. None of them is centered inside a two-cell box: no extra space is inserted around any of them, and no accent is separated from the character it belongs to.'],
		render: context => renderMixed(context, true),
	}),
	FullwidthCharacterWidthCode: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['Three lines of source code mix Latin identifiers with Japanese text. The Latin code renders normally and the Japanese characters are evenly spaced, with the quotes and semicolons remaining attached to the text they belong to.'],
		render: context => renderCode(context, true),
	}),
	FullwidthCharacterWidthSelection: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A selection spans three rows of an ASCII box drawing. The highlighted region is a continuous block with straight vertical edges and no gaps or slivers between adjacent CJK characters. The selection starts and ends exactly on a character cell boundary rather than partway through a glyph.'],
		render: context => renderSelection(context, true),
	}),
	FullwidthCharacterWidthProportionalFont: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['An ASCII box drawing is rendered in a proportional serif font. The columns do not line up, which is expected: the setting has no effect because the narrow characters are not on a fixed grid either.'],
		render: renderProportionalFont,
	}),
});
