/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { EditorOptions, WrappingIndent } from 'vs/editor/common/config/editorOptions';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { ILineBreaksComputerFactory, ModelLineProjectionData } from 'vs/editor/common/modelLineProjectionData';
import { MonospaceLineBreaksComputerFactory } from 'vs/editor/common/viewModel/monospaceLineBreaksComputer';

function parseAnnotatedText(annotatedText: string): { text: string; indices: number[] } {
	let text = '';
	let currentLineIndex = 0;
	const indices: number[] = [];
	for (let i = 0, len = annotatedText.length; i < len; i++) {
		if (annotatedText.charAt(i) === '|') {
			currentLineIndex++;
		} else {
			text += annotatedText.charAt(i);
			indices[text.length - 1] = currentLineIndex;
		}
	}
	return { text: text, indices: indices };
}

function toAnnotatedText(text: string, lineBreakData: ModelLineProjectionData | null): string {
	// Insert line break markers again, according to algorithm
	let actualAnnotatedText = '';
	if (lineBreakData) {
		let previousLineIndex = 0;
		for (let i = 0, len = text.length; i < len; i++) {
			const r = lineBreakData.translateToOutputPosition(i);
			if (previousLineIndex !== r.outputLineIndex) {
				previousLineIndex = r.outputLineIndex;
				actualAnnotatedText += '|';
			}
			actualAnnotatedText += text.charAt(i);
		}
	} else {
		// No wrapping
		actualAnnotatedText = text;
	}
	return actualAnnotatedText;
}

function getLineBreakData(factory: ILineBreaksComputerFactory, tabSize: number, breakAfter: number, columnsForFullWidthChar: number, wrappingIndent: WrappingIndent, wordBreak: 'normal' | 'keepAll', text: string, previousLineBreakData: ModelLineProjectionData | null): ModelLineProjectionData | null {
	const fontInfo = new FontInfo({
		pixelRatio: 1,
		fontFamily: 'testFontFamily',
		fontWeight: 'normal',
		fontSize: 14,
		fontFeatureSettings: '',
		fontVariationSettings: '',
		lineHeight: 19,
		letterSpacing: 0,
		isMonospace: true,
		typicalHalfwidthCharacterWidth: 7,
		typicalFullwidthCharacterWidth: 7 * columnsForFullWidthChar,
		canUseHalfwidthRightwardsArrow: true,
		spaceWidth: 7,
		middotWidth: 7,
		wsmiddotWidth: 7,
		maxDigitWidth: 7
	}, false);
	const lineBreaksComputer = factory.createLineBreaksComputer(fontInfo, tabSize, breakAfter, wrappingIndent, wordBreak);
	const previousLineBreakDataClone = previousLineBreakData ? new ModelLineProjectionData(null, null, previousLineBreakData.breakOffsets.slice(0), previousLineBreakData.breakOffsetsVisibleColumn.slice(0), previousLineBreakData.wrappedTextIndentLength) : null;
	lineBreaksComputer.addRequest(text, null, previousLineBreakDataClone);
	return lineBreaksComputer.finalize()[0];
}

function assertLineBreaks(factory: ILineBreaksComputerFactory, tabSize: number, breakAfter: number, annotatedText: string, wrappingIndent = WrappingIndent.None, wordBreak: 'normal' | 'keepAll' = 'normal'): ModelLineProjectionData | null {
	// Create version of `annotatedText` with line break markers removed
	const text = parseAnnotatedText(annotatedText).text;
	const lineBreakData = getLineBreakData(factory, tabSize, breakAfter, 2, wrappingIndent, wordBreak, text, null);
	const actualAnnotatedText = toAnnotatedText(text, lineBreakData);

	assert.strictEqual(actualAnnotatedText, annotatedText);

	return lineBreakData;
}

suite('Editor ViewModel - MonospaceLineBreaksComputer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('MonospaceLineBreaksComputer', () => {

		const factory = new MonospaceLineBreaksComputerFactory('(', '\t).');

		// Empty string
		assertLineBreaks(factory, 4, 5, '');

		// No wrapping if not necessary
		assertLineBreaks(factory, 4, 5, 'aaa');
		assertLineBreaks(factory, 4, 5, 'aaaaa');
		assertLineBreaks(factory, 4, -1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

		// Acts like hard wrapping if no char found
		assertLineBreaks(factory, 4, 5, 'aaaaa|a');

		// Honors wrapping character
		assertLineBreaks(factory, 4, 5, 'aaaaa|.');
		assertLineBreaks(factory, 4, 5, 'aaaaa|a.|aaa.|aa');
		assertLineBreaks(factory, 4, 5, 'aaaaa|a..|aaa.|aa');
		assertLineBreaks(factory, 4, 5, 'aaaaa|a...|aaa.|aa');
		assertLineBreaks(factory, 4, 5, 'aaaaa|a....|aaa.|aa');

		// Honors tabs when computing wrapping position
		assertLineBreaks(factory, 4, 5, '\t');
		assertLineBreaks(factory, 4, 5, '\t|aaa');
		assertLineBreaks(factory, 4, 5, '\t|a\t|aa');
		assertLineBreaks(factory, 4, 5, 'aa\ta');
		assertLineBreaks(factory, 4, 5, 'aa\t|aa');

		// Honors wrapping before characters (& gives it priority)
		assertLineBreaks(factory, 4, 5, 'aaa.|aa');
		assertLineBreaks(factory, 4, 5, 'aaa(.|aa');

		// Honors wrapping after characters (& gives it priority)
		assertLineBreaks(factory, 4, 5, 'aaa))|).aaa');
		assertLineBreaks(factory, 4, 5, 'aaa))|).|aaaa');
		assertLineBreaks(factory, 4, 5, 'aaa)|().|aaa');
		assertLineBreaks(factory, 4, 5, 'aaa|(().|aaa');
		assertLineBreaks(factory, 4, 5, 'aa.|(().|aaa');
		assertLineBreaks(factory, 4, 5, 'aa.|(.).|aaa');
	});

	function assertLineBreakDataEqual(a: ModelLineProjectionData | null, b: ModelLineProjectionData | null): void {
		if (!a || !b) {
			assert.deepStrictEqual(a, b);
			return;
		}
		assert.deepStrictEqual(a.breakOffsets, b.breakOffsets);
		assert.deepStrictEqual(a.wrappedTextIndentLength, b.wrappedTextIndentLength);
		for (let i = 0; i < a.breakOffsetsVisibleColumn.length; i++) {
			const diff = a.breakOffsetsVisibleColumn[i] - b.breakOffsetsVisibleColumn[i];
			assert.ok(diff < 0.001);
		}
	}

	function assertIncrementalLineBreaks(factory: ILineBreaksComputerFactory, text: string, tabSize: number, breakAfter1: number, annotatedText1: string, breakAfter2: number, annotatedText2: string, wrappingIndent = WrappingIndent.None, columnsForFullWidthChar: number = 2): void {
		// sanity check the test
		assert.strictEqual(text, parseAnnotatedText(annotatedText1).text);
		assert.strictEqual(text, parseAnnotatedText(annotatedText2).text);

		// check that the direct mapping is ok for 1
		const directLineBreakData1 = getLineBreakData(factory, tabSize, breakAfter1, columnsForFullWidthChar, wrappingIndent, 'normal', text, null);
		assert.strictEqual(toAnnotatedText(text, directLineBreakData1), annotatedText1);

		// check that the direct mapping is ok for 2
		const directLineBreakData2 = getLineBreakData(factory, tabSize, breakAfter2, columnsForFullWidthChar, wrappingIndent, 'normal', text, null);
		assert.strictEqual(toAnnotatedText(text, directLineBreakData2), annotatedText2);

		// check that going from 1 to 2 is ok
		const lineBreakData2from1 = getLineBreakData(factory, tabSize, breakAfter2, columnsForFullWidthChar, wrappingIndent, 'normal', text, directLineBreakData1);
		assert.strictEqual(toAnnotatedText(text, lineBreakData2from1), annotatedText2);
		assertLineBreakDataEqual(lineBreakData2from1, directLineBreakData2);

		// check that going from 2 to 1 is ok
		const lineBreakData1from2 = getLineBreakData(factory, tabSize, breakAfter1, columnsForFullWidthChar, wrappingIndent, 'normal', text, directLineBreakData2);
		assert.strictEqual(toAnnotatedText(text, lineBreakData1from2), annotatedText1);
		assertLineBreakDataEqual(lineBreakData1from2, directLineBreakData1);
	}

	test('MonospaceLineBreaksComputer incremental 1', () => {

		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);

		assertIncrementalLineBreaks(
			factory, 'just some text and more', 4,
			10, 'just some |text and |more',
			15, 'just some text |and more'
		);

		assertIncrementalLineBreaks(
			factory, 'Cu scripserit suscipiantur eos, in affert pericula contentiones sed, cetero sanctus et pro. Ius vidit magna regione te, sit ei elaboraret liberavisse. Mundi verear eu mea, eam vero scriptorem in, vix in menandri assueverit. Natum definiebas cu vim. Vim doming vocibus efficiantur id. In indoctum deseruisse voluptatum vim, ad debitis verterem sed.', 4,
			47, 'Cu scripserit suscipiantur eos, in affert |pericula contentiones sed, cetero sanctus et |pro. Ius vidit magna regione te, sit ei |elaboraret liberavisse. Mundi verear eu mea, |eam vero scriptorem in, vix in menandri |assueverit. Natum definiebas cu vim. Vim |doming vocibus efficiantur id. In indoctum |deseruisse voluptatum vim, ad debitis verterem |sed.',
			142, 'Cu scripserit suscipiantur eos, in affert pericula contentiones sed, cetero sanctus et pro. Ius vidit magna regione te, sit ei elaboraret |liberavisse. Mundi verear eu mea, eam vero scriptorem in, vix in menandri assueverit. Natum definiebas cu vim. Vim doming vocibus efficiantur |id. In indoctum deseruisse voluptatum vim, ad debitis verterem sed.',
		);

		assertIncrementalLineBreaks(
			factory, 'An his legere persecuti, oblique delicata efficiantur ex vix, vel at graecis officiis maluisset. Et per impedit voluptua, usu discere maiorum at. Ut assum ornatus temporibus vis, an sea melius pericula. Ea dicunt oblique phaedrum nam, eu duo movet nobis. His melius facilis eu, vim malorum temporibus ne. Nec no sale regione, meliore civibus placerat id eam. Mea alii fabulas definitionem te, agam volutpat ad vis, et per bonorum nonumes repudiandae.', 4,
			57, 'An his legere persecuti, oblique delicata efficiantur ex |vix, vel at graecis officiis maluisset. Et per impedit |voluptua, usu discere maiorum at. Ut assum ornatus |temporibus vis, an sea melius pericula. Ea dicunt |oblique phaedrum nam, eu duo movet nobis. His melius |facilis eu, vim malorum temporibus ne. Nec no sale |regione, meliore civibus placerat id eam. Mea alii |fabulas definitionem te, agam volutpat ad vis, et per |bonorum nonumes repudiandae.',
			58, 'An his legere persecuti, oblique delicata efficiantur ex |vix, vel at graecis officiis maluisset. Et per impedit |voluptua, usu discere maiorum at. Ut assum ornatus |temporibus vis, an sea melius pericula. Ea dicunt oblique |phaedrum nam, eu duo movet nobis. His melius facilis eu, |vim malorum temporibus ne. Nec no sale regione, meliore |civibus placerat id eam. Mea alii fabulas definitionem |te, agam volutpat ad vis, et per bonorum nonumes |repudiandae.'
		);

		assertIncrementalLineBreaks(
			factory, '\t\t"owner": "vscode",', 4,
			14, '\t\t"owner|": |"vscod|e",',
			16, '\t\t"owner":| |"vscode"|,',
			WrappingIndent.Same
		);

		assertIncrementalLineBreaks(
			factory, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇&👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬', 4,
			51, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇&|👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬',
			50, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇|&|👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬',
			WrappingIndent.Same
		);

		assertIncrementalLineBreaks(
			factory, '🐇👬&🌞🌖', 4,
			5, '🐇👬&|🌞🌖',
			4, '🐇👬|&|🌞🌖',
			WrappingIndent.Same
		);

		assertIncrementalLineBreaks(
			factory, '\t\tfunc(\'🌞🏇🍼🌞🏇🍼🐇&👬🌖🌞👬🌖🌞🏇🍼🐇👬\', WrappingIndent.Same);', 4,
			26, '\t\tfunc|(\'🌞🏇🍼🌞🏇🍼🐇&|👬🌖🌞👬🌖🌞🏇🍼🐇|👬\', |WrappingIndent.|Same);',
			27, '\t\tfunc|(\'🌞🏇🍼🌞🏇🍼🐇&|👬🌖🌞👬🌖🌞🏇🍼🐇|👬\', |WrappingIndent.|Same);',
			WrappingIndent.Same
		);

		assertIncrementalLineBreaks(
			factory, 'factory, "xtxtfunc(x"🌞🏇🍼🌞🏇🍼🐇&👬🌖🌞👬🌖🌞🏇🍼🐇👬x"', 4,
			16, 'factory, |"xtxtfunc|(x"🌞🏇🍼🌞🏇🍼|🐇&|👬🌖🌞👬🌖🌞🏇🍼|🐇👬x"',
			17, 'factory, |"xtxtfunc|(x"🌞🏇🍼🌞🏇🍼🐇|&👬🌖🌞👬🌖🌞🏇🍼|🐇👬x"',
			WrappingIndent.Same
		);
	});

	test('issue #95686: CRITICAL: loop forever on the monospaceLineBreaksComputer', () => {
		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertIncrementalLineBreaks(
			factory,
			'						<tr dmx-class:table-danger="(alt <= 50)" dmx-class:table-warning="(alt <= 200)" dmx-class:table-primary="(alt <= 400)" dmx-class:table-info="(alt <= 800)" dmx-class:table-success="(alt >= 400)">',
			4,
			179, '						<tr dmx-class:table-danger="(alt <= 50)" dmx-class:table-warning="(alt <= 200)" dmx-class:table-primary="(alt <= 400)" dmx-class:table-info="(alt <= 800)" |dmx-class:table-success="(alt >= 400)">',
			1, '	|	|	|	|	|	|<|t|r| |d|m|x|-|c|l|a|s|s|:|t|a|b|l|e|-|d|a|n|g|e|r|=|"|(|a|l|t| |<|=| |5|0|)|"| |d|m|x|-|c|l|a|s|s|:|t|a|b|l|e|-|w|a|r|n|i|n|g|=|"|(|a|l|t| |<|=| |2|0|0|)|"| |d|m|x|-|c|l|a|s|s|:|t|a|b|l|e|-|p|r|i|m|a|r|y|=|"|(|a|l|t| |<|=| |4|0|0|)|"| |d|m|x|-|c|l|a|s|s|:|t|a|b|l|e|-|i|n|f|o|=|"|(|a|l|t| |<|=| |8|0|0|)|"| |d|m|x|-|c|l|a|s|s|:|t|a|b|l|e|-|s|u|c|c|e|s|s|=|"|(|a|l|t| |>|=| |4|0|0|)|"|>',
			WrappingIndent.Same
		);
	});

	test('issue #110392: Occasional crash when resize with panel on the right', () => {
		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertIncrementalLineBreaks(
			factory,
			'你好 **hello** **hello** **hello-world** hey there!',
			4,
			15, '你好 **hello** |**hello** |**hello-world**| hey there!',
			1, '你|好| |*|*|h|e|l|l|o|*|*| |*|*|h|e|l|l|o|*|*| |*|*|h|e|l|l|o|-|w|o|r|l|d|*|*| |h|e|y| |t|h|e|r|e|!',
			WrappingIndent.Same,
			1.6605405405405405
		);
	});

	test('MonospaceLineBreaksComputer - CJK and Kinsoku Shori', () => {
		const factory = new MonospaceLineBreaksComputerFactory('(', '\t)');
		assertLineBreaks(factory, 4, 5, 'aa \u5b89|\u5b89');
		assertLineBreaks(factory, 4, 5, '\u3042 \u5b89|\u5b89');
		assertLineBreaks(factory, 4, 5, '\u3042\u3042|\u5b89\u5b89');
		assertLineBreaks(factory, 4, 5, 'aa |\u5b89)\u5b89|\u5b89');
		assertLineBreaks(factory, 4, 5, 'aa \u3042|\u5b89\u3042)|\u5b89');
		assertLineBreaks(factory, 4, 5, 'aa |(\u5b89aa|\u5b89');
	});

	test('MonospaceLineBreaksComputer - WrappingIndent.Same', () => {
		const factory = new MonospaceLineBreaksComputerFactory('', '\t ');
		assertLineBreaks(factory, 4, 38, ' *123456789012345678901234567890123456|7890', WrappingIndent.Same);
	});

	test('issue #16332: Scroll bar overlaying on top of text', () => {
		const factory = new MonospaceLineBreaksComputerFactory('', '\t ');
		assertLineBreaks(factory, 4, 24, 'a/ very/long/line/of/tex|t/that/expands/beyon|d/your/typical/line/|of/code/', WrappingIndent.Indent);
	});

	test('issue #35162: wrappingIndent not consistently working', () => {
		const factory = new MonospaceLineBreaksComputerFactory('', '\t ');
		const mapper = assertLineBreaks(factory, 4, 24, '                t h i s |i s |a l |o n |g l |i n |e', WrappingIndent.Indent);
		assert.strictEqual(mapper!.wrappedTextIndentLength, '                    '.length);
	});

	test('issue #75494: surrogate pairs', () => {
		const factory = new MonospaceLineBreaksComputerFactory('\t', ' ');
		assertLineBreaks(factory, 4, 49, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼|🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼|🐇👬', WrappingIndent.Same);
	});

	test('issue #75494: surrogate pairs overrun 1', () => {
		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertLineBreaks(factory, 4, 4, '🐇👬|&|🌞🌖', WrappingIndent.Same);
	});

	test('issue #75494: surrogate pairs overrun 2', () => {
		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertLineBreaks(factory, 4, 17, 'factory, |"xtxtfunc|(x"🌞🏇🍼🌞🏇🍼🐇|&👬🌖🌞👬🌖🌞🏇🍼|🐇👬x"', WrappingIndent.Same);
	});

	test('MonospaceLineBreaksComputer - WrappingIndent.DeepIndent', () => {
		const factory = new MonospaceLineBreaksComputerFactory('', '\t ');
		const mapper = assertLineBreaks(factory, 4, 26, '        W e A r e T e s t |i n g D e |e p I n d |e n t a t |i o n', WrappingIndent.DeepIndent);
		assert.strictEqual(mapper!.wrappedTextIndentLength, '                '.length);
	});

	test('issue #33366: Word wrap algorithm behaves differently around punctuation', () => {
		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertLineBreaks(factory, 4, 23, 'this is a line of |text, text that sits |on a line', WrappingIndent.Same);
	});

	test('issue #152773: Word wrap algorithm behaves differently with bracket followed by comma', () => {
		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertLineBreaks(factory, 4, 24, 'this is a line of |(text), text that sits |on a line', WrappingIndent.Same);
	});

	test('issue #112382: Word wrap doesn\'t work well with control characters', () => {
		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertLineBreaks(factory, 4, 6, '\x06\x06\x06|\x06\x06\x06', WrappingIndent.Same);
	});

	test('Word break work well with Chinese/Japanese/Korean (CJK) text when setting normal', () => {
		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertLineBreaks(factory, 4, 5, '你好|1111', WrappingIndent.Same, 'normal');
	});

	test('Word break work well with Chinese/Japanese/Korean (CJK) text when setting keepAll', () => {
		const factory = new MonospaceLineBreaksComputerFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertLineBreaks(factory, 4, 8, '你好1111', WrappingIndent.Same, 'keepAll');
	});
});
