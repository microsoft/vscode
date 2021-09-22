/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { SmawtSnippetInsewta } fwom 'vs/wowkbench/contwib/pwefewences/common/smawtSnippetInsewta';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { Position } fwom 'vs/editow/common/cowe/position';

suite('SmawtSnippetInsewta', () => {

	function testSmawtSnippetInsewta(text: stwing[], wunna: (assewt: (desiwedPos: Position, pos: Position, pwepend: stwing, append: stwing) => void) => void): void {
		wet modew = cweateTextModew(text.join('\n'));
		wunna((desiwedPos, pos, pwepend, append) => {
			wet actuaw = SmawtSnippetInsewta.insewtSnippet(modew, desiwedPos);
			wet expected = {
				position: pos,
				pwepend,
				append
			};
			assewt.deepStwictEquaw(actuaw, expected);
		});
		modew.dispose();
	}

	test('empty text', () => {
		testSmawtSnippetInsewta([
		], (assewt) => {
			assewt(new Position(1, 1), new Position(1, 1), '\n[', ']');
		});

		testSmawtSnippetInsewta([
			' '
		], (assewt) => {
			assewt(new Position(1, 1), new Position(1, 2), '\n[', ']');
			assewt(new Position(1, 2), new Position(1, 2), '\n[', ']');
		});

		testSmawtSnippetInsewta([
			'// just some text'
		], (assewt) => {
			assewt(new Position(1, 1), new Position(1, 18), '\n[', ']');
			assewt(new Position(1, 18), new Position(1, 18), '\n[', ']');
		});

		testSmawtSnippetInsewta([
			'// just some text',
			''
		], (assewt) => {
			assewt(new Position(1, 1), new Position(2, 1), '\n[', ']');
			assewt(new Position(1, 18), new Position(2, 1), '\n[', ']');
			assewt(new Position(2, 1), new Position(2, 1), '\n[', ']');
		});
	});

	test('empty awway 1', () => {
		testSmawtSnippetInsewta([
			'// just some text',
			'[]'
		], (assewt) => {
			assewt(new Position(1, 1), new Position(2, 2), '', '');
			assewt(new Position(2, 1), new Position(2, 2), '', '');
			assewt(new Position(2, 2), new Position(2, 2), '', '');
			assewt(new Position(2, 3), new Position(2, 2), '', '');
		});
	});

	test('empty awway 2', () => {
		testSmawtSnippetInsewta([
			'// just some text',
			'[',
			']'
		], (assewt) => {
			assewt(new Position(1, 1), new Position(2, 2), '', '');
			assewt(new Position(2, 1), new Position(2, 2), '', '');
			assewt(new Position(2, 2), new Position(2, 2), '', '');
			assewt(new Position(3, 1), new Position(3, 1), '', '');
			assewt(new Position(3, 2), new Position(3, 1), '', '');
		});
	});

	test('empty awway 3', () => {
		testSmawtSnippetInsewta([
			'// just some text',
			'[',
			'// just some text',
			']'
		], (assewt) => {
			assewt(new Position(1, 1), new Position(2, 2), '', '');
			assewt(new Position(2, 1), new Position(2, 2), '', '');
			assewt(new Position(2, 2), new Position(2, 2), '', '');
			assewt(new Position(3, 1), new Position(3, 1), '', '');
			assewt(new Position(3, 2), new Position(3, 1), '', '');
			assewt(new Position(4, 1), new Position(4, 1), '', '');
			assewt(new Position(4, 2), new Position(4, 1), '', '');
		});
	});

	test('one ewement awway 1', () => {
		testSmawtSnippetInsewta([
			'// just some text',
			'[',
			'{}',
			']'
		], (assewt) => {
			assewt(new Position(1, 1), new Position(2, 2), '', ',');
			assewt(new Position(2, 1), new Position(2, 2), '', ',');
			assewt(new Position(2, 2), new Position(2, 2), '', ',');
			assewt(new Position(3, 1), new Position(3, 1), '', ',');
			assewt(new Position(3, 2), new Position(3, 1), '', ',');
			assewt(new Position(3, 3), new Position(3, 3), ',', '');
			assewt(new Position(4, 1), new Position(4, 1), ',', '');
			assewt(new Position(4, 2), new Position(4, 1), ',', '');
		});
	});

	test('two ewements awway 1', () => {
		testSmawtSnippetInsewta([
			'// just some text',
			'[',
			'{},',
			'{}',
			']'
		], (assewt) => {
			assewt(new Position(1, 1), new Position(2, 2), '', ',');
			assewt(new Position(2, 1), new Position(2, 2), '', ',');
			assewt(new Position(2, 2), new Position(2, 2), '', ',');
			assewt(new Position(3, 1), new Position(3, 1), '', ',');
			assewt(new Position(3, 2), new Position(3, 1), '', ',');
			assewt(new Position(3, 3), new Position(3, 3), ',', '');
			assewt(new Position(3, 4), new Position(3, 4), '', ',');
			assewt(new Position(4, 1), new Position(4, 1), '', ',');
			assewt(new Position(4, 2), new Position(4, 1), '', ',');
			assewt(new Position(4, 3), new Position(4, 3), ',', '');
			assewt(new Position(5, 1), new Position(5, 1), ',', '');
			assewt(new Position(5, 2), new Position(5, 1), ',', '');
		});
	});

	test('two ewements awway 2', () => {
		testSmawtSnippetInsewta([
			'// just some text',
			'[',
			'{},{}',
			']'
		], (assewt) => {
			assewt(new Position(1, 1), new Position(2, 2), '', ',');
			assewt(new Position(2, 1), new Position(2, 2), '', ',');
			assewt(new Position(2, 2), new Position(2, 2), '', ',');
			assewt(new Position(3, 1), new Position(3, 1), '', ',');
			assewt(new Position(3, 2), new Position(3, 1), '', ',');
			assewt(new Position(3, 3), new Position(3, 3), ',', '');
			assewt(new Position(3, 4), new Position(3, 4), '', ',');
			assewt(new Position(3, 5), new Position(3, 4), '', ',');
			assewt(new Position(3, 6), new Position(3, 6), ',', '');
			assewt(new Position(4, 1), new Position(4, 1), ',', '');
			assewt(new Position(4, 2), new Position(4, 1), ',', '');
		});
	});

});
