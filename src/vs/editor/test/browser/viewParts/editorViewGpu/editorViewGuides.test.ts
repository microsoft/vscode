/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorViewBracketGuideColors, toEditorViewBracketGuide } from '../../../../browser/viewParts/editorViewGpu/editorViewGuides.js';
import { BracketPairGuidesClassNames } from '../../../../common/model/guidesTextModelPart.js';
import { IndentGuide, IndentGuideHorizontalLine } from '../../../../common/textModelGuides.js';

suite('EditorView bracket guides', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const names = new BracketPairGuidesClassNames();
	const guideClass = (level: number, active = false) => names.getInlineClassNameOfLevel(level) + (active ? ` ${names.activeClassName}` : '');

	test('converts vertical and horizontal model/visual columns without measuring in the host', () => {
		const guides = [
			new IndentGuide(5, -1, guideClass(0), null, -1, -1),
			new IndentGuide(-1, 3, guideClass(1), new IndentGuideHorizontalLine(false, 9), -1, -1),
			new IndentGuide(1, -1, guideClass(2), new IndentGuideHorizontalLine(true, 5), -1, -1),
		];
		assert.deepStrictEqual(guides.map(guide => toEditorViewBracketGuide(guide, 0xff00ffff)), [
			{ visibleColumn: 4, color: 0xff00ffff, horizontalLine: undefined },
			{ column: 2, color: 0xff00ffff, horizontalLine: { top: false, endColumn: 8 } },
			{ visibleColumn: 0, color: 0xff00ffff, horizontalLine: { top: true, endColumn: 4 } },
		]);
	});

	function colors(values: Record<string, string>): EditorViewBracketGuideColors {
		return new EditorViewBracketGuideColors({
			getColor: id => values[id] ? Color.fromHex(values[id]) : undefined,
		});
	}

	test('matches bracket color fallbacks, transparent overrides and filtered palette cycling', () => {
		const resolver = colors({
			'editorBracketHighlight.foreground1': '#ff0000',
			'editorBracketPairGuide.background1': '#00000000',
			'editorBracketPairGuide.activeBackground1': '#00000000',
			'editorBracketHighlight.foreground2': '#00000000',
			'editorBracketHighlight.foreground3': '#0000ff',
		});
		assert.deepStrictEqual([
			resolver.getColor(guideClass(0))?.rgba,
			resolver.getColor(guideClass(0, true))?.rgba,
			resolver.getColor(guideClass(1, true))?.rgba,
			resolver.getColor(guideClass(2, true))?.rgba,
		], [
			Color.fromHex('#ff0000').transparent(0.3).rgba,
			Color.fromHex('#ff0000').rgba,
			Color.fromHex('#0000ff').rgba,
			Color.fromHex('#ff0000').rgba,
		]);
	});

	test('honors explicit guide colors independently of bracket glyph colors', () => {
		const resolver = colors({
			'editorBracketHighlight.foreground1': '#ff0000',
			'editorBracketPairGuide.background1': '#112233',
			'editorBracketPairGuide.activeBackground1': '#445566',
		});
		assert.deepStrictEqual([
			resolver.getColor(guideClass(29))?.rgba,
			resolver.getColor(guideClass(29, true))?.rgba,
		], [Color.fromHex('#112233').rgba, Color.fromHex('#445566').rgba]);
	});

	test('missing palette is invisible and unknown guide classes are rejected', () => {
		const resolver = colors({});
		assert.strictEqual(resolver.getColor(guideClass(0)), undefined);
		assert.throws(() => resolver.getColor('unexpected'), /Unexpected bracket guide class/);
	});
});
