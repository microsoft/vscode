/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { WrappingIndent, EditorOptions } from 'vs/editor/common/config/editorOptions';
import { CharacterHardWrappingLineMapperFactory } from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import { ILineMapperFactory, LineBreakingData } from 'vs/editor/common/viewModel/splitLinesCollection';

function parseAnnotatedText(annotatedText: string): { text: string; indices: number[]; } {
	let text = '';
	let currentLineIndex = 0;
	let indices: number[] = [];
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

function toAnnotatedText(text: string, lineBreakingData: LineBreakingData | null): string {
	// Insert line break markers again, according to algorithm
	let actualAnnotatedText = '';
	if (lineBreakingData) {
		let previousLineIndex = 0;
		for (let i = 0, len = text.length; i < len; i++) {
			let r = LineBreakingData.getOutputPositionOfInputOffset(lineBreakingData.breakOffsets, i);
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

function getLineBreakingData(factory: ILineMapperFactory, tabSize: number, breakAfter: number, columnsForFullWidthChar: number, wrappingIndent: WrappingIndent, text: string, previousLineBreakingData: LineBreakingData | null): LineBreakingData | null {
	const lineMappingComputer = factory.createLineMappingComputer(tabSize, breakAfter, columnsForFullWidthChar, wrappingIndent);
	const previousLineBreakingDataClone = previousLineBreakingData ? new LineBreakingData(previousLineBreakingData.breakOffsets.slice(0), previousLineBreakingData.breakingOffsetsVisibleColumn.slice(0), previousLineBreakingData.wrappedTextIndentLength) : null;
	lineMappingComputer.addRequest(text, previousLineBreakingDataClone);
	return lineMappingComputer.finalize()[0];
}

function assertLineMapping(factory: ILineMapperFactory, tabSize: number, breakAfter: number, annotatedText: string, wrappingIndent = WrappingIndent.None): LineBreakingData | null {
	// Create version of `annotatedText` with line break markers removed
	const text = parseAnnotatedText(annotatedText).text;
	const lineBreakingData = getLineBreakingData(factory, tabSize, breakAfter, 2, wrappingIndent, text, null);
	const actualAnnotatedText = toAnnotatedText(text, lineBreakingData);

	assert.equal(actualAnnotatedText, annotatedText);

	return lineBreakingData;
}

suite('Editor ViewModel - CharacterHardWrappingLineMapper', () => {
	test('CharacterHardWrappingLineMapper', () => {

		let factory = new CharacterHardWrappingLineMapperFactory('(', '\t).');

		// Empty string
		assertLineMapping(factory, 4, 5, '');

		// No wrapping if not necessary
		assertLineMapping(factory, 4, 5, 'aaa');
		assertLineMapping(factory, 4, 5, 'aaaaa');
		assertLineMapping(factory, 4, -1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

		// Acts like hard wrapping if no char found
		assertLineMapping(factory, 4, 5, 'aaaaa|a');

		// Honors wrapping character
		assertLineMapping(factory, 4, 5, 'aaaaa|.');
		assertLineMapping(factory, 4, 5, 'aaaaa|a.|aaa.|aa');
		assertLineMapping(factory, 4, 5, 'aaaaa|a..|aaa.|aa');
		assertLineMapping(factory, 4, 5, 'aaaaa|a...|aaa.|aa');
		assertLineMapping(factory, 4, 5, 'aaaaa|a....|aaa.|aa');

		// Honors tabs when computing wrapping position
		assertLineMapping(factory, 4, 5, '\t');
		assertLineMapping(factory, 4, 5, '\t|aaa');
		assertLineMapping(factory, 4, 5, '\t|a\t|aa');
		assertLineMapping(factory, 4, 5, 'aa\ta');
		assertLineMapping(factory, 4, 5, 'aa\t|aa');

		// Honors wrapping before characters (& gives it priority)
		assertLineMapping(factory, 4, 5, 'aaa.|aa');
		assertLineMapping(factory, 4, 5, 'aaa(.|aa');

		// Honors wrapping after characters (& gives it priority)
		assertLineMapping(factory, 4, 5, 'aaa))|).aaa');
		assertLineMapping(factory, 4, 5, 'aaa))|).|aaaa');
		assertLineMapping(factory, 4, 5, 'aaa)|().|aaa');
		assertLineMapping(factory, 4, 5, 'aaa(|().|aaa');
		assertLineMapping(factory, 4, 5, 'aa.(|().|aaa');
		assertLineMapping(factory, 4, 5, 'aa.(.|).aaa');
	});

	function assertIncrementalLineMapping(factory: ILineMapperFactory, text: string, tabSize: number, breakAfter1: number, annotatedText1: string, breakAfter2: number, annotatedText2: string, wrappingIndent = WrappingIndent.None): void {
		// sanity check the test
		assert.equal(text, parseAnnotatedText(annotatedText1).text);
		assert.equal(text, parseAnnotatedText(annotatedText2).text);

		// check that the direct mapping is ok for 1
		const directLineBreakingData1 = getLineBreakingData(factory, tabSize, breakAfter1, 2, wrappingIndent, text, null);
		assert.equal(toAnnotatedText(text, directLineBreakingData1), annotatedText1);

		// check that the direct mapping is ok for 2
		const directLineBreakingData2 = getLineBreakingData(factory, tabSize, breakAfter2, 2, wrappingIndent, text, null);
		assert.equal(toAnnotatedText(text, directLineBreakingData2), annotatedText2);

		// check that going from 1 to 2 is ok
		const lineBreakingData2from1 = getLineBreakingData(factory, tabSize, breakAfter2, 2, wrappingIndent, text, directLineBreakingData1);
		assert.equal(toAnnotatedText(text, lineBreakingData2from1), annotatedText2);
		assert.deepEqual(lineBreakingData2from1, directLineBreakingData2);

		// check that going from 2 to 1 is ok
		const lineBreakingData1from2 = getLineBreakingData(factory, tabSize, breakAfter1, 2, wrappingIndent, text, directLineBreakingData2);
		assert.equal(toAnnotatedText(text, lineBreakingData1from2), annotatedText1);
		assert.deepEqual(lineBreakingData1from2, directLineBreakingData1);
	}

	test('CharacterHardWrappingLineMapper incremental 1', () => {

		let factory = new CharacterHardWrappingLineMapperFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);

		assertIncrementalLineMapping(
			factory, 'just some text and more', 4,
			10, 'just some |text and |more',
			15, 'just some text |and more'
		);

		assertIncrementalLineMapping(
			factory, 'Cu scripserit suscipiantur eos, in affert pericula contentiones sed, cetero sanctus et pro. Ius vidit magna regione te, sit ei elaboraret liberavisse. Mundi verear eu mea, eam vero scriptorem in, vix in menandri assueverit. Natum definiebas cu vim. Vim doming vocibus efficiantur id. In indoctum deseruisse voluptatum vim, ad debitis verterem sed.', 4,
			47, 'Cu scripserit suscipiantur eos, in affert |pericula contentiones sed, cetero sanctus et |pro. Ius vidit magna regione te, sit ei |elaboraret liberavisse. Mundi verear eu mea, |eam vero scriptorem in, vix in menandri |assueverit. Natum definiebas cu vim. Vim |doming vocibus efficiantur id. In indoctum |deseruisse voluptatum vim, ad debitis verterem |sed.',
			142, 'Cu scripserit suscipiantur eos, in affert pericula contentiones sed, cetero sanctus et pro. Ius vidit magna regione te, sit ei elaboraret |liberavisse. Mundi verear eu mea, eam vero scriptorem in, vix in menandri assueverit. Natum definiebas cu vim. Vim doming vocibus efficiantur |id. In indoctum deseruisse voluptatum vim, ad debitis verterem sed.',
		);

		assertIncrementalLineMapping(
			factory, 'An his legere persecuti, oblique delicata efficiantur ex vix, vel at graecis officiis maluisset. Et per impedit voluptua, usu discere maiorum at. Ut assum ornatus temporibus vis, an sea melius pericula. Ea dicunt oblique phaedrum nam, eu duo movet nobis. His melius facilis eu, vim malorum temporibus ne. Nec no sale regione, meliore civibus placerat id eam. Mea alii fabulas definitionem te, agam volutpat ad vis, et per bonorum nonumes repudiandae.', 4,
			57, 'An his legere persecuti, oblique delicata efficiantur ex |vix, vel at graecis officiis maluisset. Et per impedit |voluptua, usu discere maiorum at. Ut assum ornatus |temporibus vis, an sea melius pericula. Ea dicunt |oblique phaedrum nam, eu duo movet nobis. His melius |facilis eu, vim malorum temporibus ne. Nec no sale |regione, meliore civibus placerat id eam. Mea alii |fabulas definitionem te, agam volutpat ad vis, et per |bonorum nonumes repudiandae.',
			58, 'An his legere persecuti, oblique delicata efficiantur ex |vix, vel at graecis officiis maluisset. Et per impedit |voluptua, usu discere maiorum at. Ut assum ornatus |temporibus vis, an sea melius pericula. Ea dicunt oblique |phaedrum nam, eu duo movet nobis. His melius facilis eu, |vim malorum temporibus ne. Nec no sale regione, meliore |civibus placerat id eam. Mea alii fabulas definitionem te,| agam volutpat ad vis, et per bonorum nonumes repudiandae.'
		);

		assertIncrementalLineMapping(
			factory, '\t\t"owner": "vscode",', 4,
			14, '\t\t"owner|": |"vscod|e",',
			16, '\t\t"owner":| |"vscode"|,',
			WrappingIndent.Same
		);

		assertIncrementalLineMapping(
			factory, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇&👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬', 4,
			51, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇&|👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬',
			50, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇|&|👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬',
			WrappingIndent.Same
		);

		assertIncrementalLineMapping(
			factory, '🐇👬&🌞🌖', 4,
			5, '🐇👬&|🌞🌖',
			4, '🐇👬|&|🌞🌖',
			WrappingIndent.Same
		);

		assertIncrementalLineMapping(
			factory, '\t\tfunc(\'🌞🏇🍼🌞🏇🍼🐇&👬🌖🌞👬🌖🌞🏇🍼🐇👬\', WrappingIndent.Same);', 4,
			26, '\t\tfunc|(\'🌞🏇🍼🌞🏇🍼🐇&|👬🌖🌞👬🌖🌞🏇🍼🐇|👬\', |WrappingIndent.|Same);',
			27, '\t\tfunc|(\'🌞🏇🍼🌞🏇🍼🐇&|👬🌖🌞👬🌖🌞🏇🍼🐇|👬\', |WrappingIndent.|Same);',
			WrappingIndent.Same
		);

		assertIncrementalLineMapping(
			factory, 'factory, "xtxtfunc(x"🌞🏇🍼🌞🏇🍼🐇&👬🌖🌞👬🌖🌞🏇🍼🐇👬x"', 4,
			16, 'factory, |"xtxtfunc|(x"🌞🏇🍼🌞🏇🍼|🐇&|👬🌖🌞👬🌖🌞🏇🍼|🐇👬x"',
			17, 'factory, |"xtxtfunc|(x"🌞🏇🍼🌞🏇🍼🐇|&👬🌖🌞👬🌖🌞🏇🍼|🐇👬x"',
			WrappingIndent.Same
		);
	});


	test('CharacterHardWrappingLineMapper - CJK and Kinsoku Shori', () => {
		let factory = new CharacterHardWrappingLineMapperFactory('(', '\t)');
		assertLineMapping(factory, 4, 5, 'aa \u5b89|\u5b89');
		assertLineMapping(factory, 4, 5, '\u3042 \u5b89|\u5b89');
		assertLineMapping(factory, 4, 5, '\u3042\u3042|\u5b89\u5b89');
		assertLineMapping(factory, 4, 5, 'aa |\u5b89)\u5b89|\u5b89');
		assertLineMapping(factory, 4, 5, 'aa \u3042|\u5b89\u3042)|\u5b89');
		assertLineMapping(factory, 4, 5, 'aa |(\u5b89aa|\u5b89');
	});

	test('CharacterHardWrappingLineMapper - WrappingIndent.Same', () => {
		let factory = new CharacterHardWrappingLineMapperFactory('', '\t ');
		assertLineMapping(factory, 4, 38, ' *123456789012345678901234567890123456|7890', WrappingIndent.Same);
	});

	test('issue #16332: Scroll bar overlaying on top of text', () => {
		let factory = new CharacterHardWrappingLineMapperFactory('', '\t ');
		assertLineMapping(factory, 4, 24, 'a/ very/long/line/of/tex|t/that/expands/beyon|d/your/typical/line/|of/code/', WrappingIndent.Indent);
	});

	test('issue #35162: wrappingIndent not consistently working', () => {
		let factory = new CharacterHardWrappingLineMapperFactory('', '\t ');
		let mapper = assertLineMapping(factory, 4, 24, '                t h i s |i s |a l |o n |g l |i n |e', WrappingIndent.Indent);
		assert.equal(mapper!.wrappedTextIndentLength, '                    '.length);
	});

	test('issue #75494: surrogate pairs', () => {
		let factory = new CharacterHardWrappingLineMapperFactory('\t', ' ');
		assertLineMapping(factory, 4, 49, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼|🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼|🐇👬', WrappingIndent.Same);
	});

	test('issue #75494: surrogate pairs overrun 1', () => {
		const factory = new CharacterHardWrappingLineMapperFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertLineMapping(factory, 4, 4, '🐇👬|&|🌞🌖', WrappingIndent.Same);
	});

	test('issue #75494: surrogate pairs overrun 2', () => {
		const factory = new CharacterHardWrappingLineMapperFactory(EditorOptions.wordWrapBreakBeforeCharacters.defaultValue, EditorOptions.wordWrapBreakAfterCharacters.defaultValue);
		assertLineMapping(factory, 4, 17, 'factory, |"xtxtfunc|(x"🌞🏇🍼🌞🏇🍼🐇|&👬🌖🌞👬🌖🌞🏇🍼|🐇👬x"', WrappingIndent.Same);
	});

	test('CharacterHardWrappingLineMapper - WrappingIndent.DeepIndent', () => {
		let factory = new CharacterHardWrappingLineMapperFactory('', '\t ');
		let mapper = assertLineMapping(factory, 4, 26, '        W e A r e T e s t |i n g D e |e p I n d |e n t a t |i o n', WrappingIndent.DeepIndent);
		assert.equal(mapper!.wrappedTextIndentLength, '                '.length);
	});
});
