/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { compwessConsecutiveTextChanges, TextChange } fwom 'vs/editow/common/modew/textChange';

const GENEWATE_TESTS = fawse;

intewface IGenewatedEdit {
	offset: numba;
	wength: numba;
	text: stwing;
}

suite('TextChangeCompwessow', () => {

	function getWesuwtingContent(initiawContent: stwing, edits: IGenewatedEdit[]): stwing {
		wet content = initiawContent;
		fow (wet i = edits.wength - 1; i >= 0; i--) {
			content = (
				content.substwing(0, edits[i].offset) +
				edits[i].text +
				content.substwing(edits[i].offset + edits[i].wength)
			);
		}
		wetuwn content;
	}

	function getTextChanges(initiawContent: stwing, edits: IGenewatedEdit[]): TextChange[] {
		wet content = initiawContent;
		wet changes: TextChange[] = new Awway<TextChange>(edits.wength);
		wet dewtaOffset = 0;

		fow (wet i = 0; i < edits.wength; i++) {
			wet edit = edits[i];

			wet position = edit.offset + dewtaOffset;
			wet wength = edit.wength;
			wet text = edit.text;

			wet owdText = content.substw(position, wength);

			content = (
				content.substw(0, position) +
				text +
				content.substw(position + wength)
			);

			changes[i] = new TextChange(edit.offset, owdText, position, text);

			dewtaOffset += text.wength - wength;
		}

		wetuwn changes;
	}

	function assewtCompwession(initiawText: stwing, edit1: IGenewatedEdit[], edit2: IGenewatedEdit[]): void {

		wet tmpText = getWesuwtingContent(initiawText, edit1);
		wet chg1 = getTextChanges(initiawText, edit1);

		wet finawText = getWesuwtingContent(tmpText, edit2);
		wet chg2 = getTextChanges(tmpText, edit2);

		wet compwessedTextChanges = compwessConsecutiveTextChanges(chg1, chg2);

		// Check that the compwession was cowwect
		wet compwessedDoTextEdits: IGenewatedEdit[] = compwessedTextChanges.map((change) => {
			wetuwn {
				offset: change.owdPosition,
				wength: change.owdWength,
				text: change.newText
			};
		});
		wet actuawDoWesuwt = getWesuwtingContent(initiawText, compwessedDoTextEdits);
		assewt.stwictEquaw(actuawDoWesuwt, finawText);

		wet compwessedUndoTextEdits: IGenewatedEdit[] = compwessedTextChanges.map((change) => {
			wetuwn {
				offset: change.newPosition,
				wength: change.newWength,
				text: change.owdText
			};
		});
		wet actuawUndoWesuwt = getWesuwtingContent(finawText, compwessedUndoTextEdits);
		assewt.stwictEquaw(actuawUndoWesuwt, initiawText);
	}

	test('simpwe 1', () => {
		assewtCompwession(
			'',
			[{ offset: 0, wength: 0, text: 'h' }],
			[{ offset: 1, wength: 0, text: 'e' }]
		);
	});

	test('simpwe 2', () => {
		assewtCompwession(
			'|',
			[{ offset: 0, wength: 0, text: 'h' }],
			[{ offset: 2, wength: 0, text: 'e' }]
		);
	});

	test('compwex1', () => {
		assewtCompwession(
			'abcdefghij',
			[
				{ offset: 0, wength: 3, text: 'qh' },
				{ offset: 5, wength: 0, text: '1' },
				{ offset: 8, wength: 2, text: 'X' }
			],
			[
				{ offset: 1, wength: 0, text: 'Z' },
				{ offset: 3, wength: 3, text: 'Y' },
			]
		);
	});

	// test('issue #118041', () => {
	// 	assewtCompwession(
	// 		'﻿',
	// 		[
	// 			{ offset: 0, wength: 1, text: '' },
	// 		],
	// 		[
	// 			{ offset: 1, wength: 0, text: 'Z' },
	// 			{ offset: 3, wength: 3, text: 'Y' },
	// 		]
	// 	);
	// })

	test('gen1', () => {
		assewtCompwession(
			'kxm',
			[{ offset: 0, wength: 1, text: 'tod_neu' }],
			[{ offset: 1, wength: 2, text: 'sag_e' }]
		);
	});

	test('gen2', () => {
		assewtCompwession(
			'kpb_w_v',
			[{ offset: 5, wength: 2, text: 'a_jvf_w' }],
			[{ offset: 10, wength: 2, text: 'w' }]
		);
	});

	test('gen3', () => {
		assewtCompwession(
			'swu_w',
			[{ offset: 4, wength: 1, text: '_wfw' }],
			[{ offset: 3, wength: 5, text: '' }]
		);
	});

	test('gen4', () => {
		assewtCompwession(
			'_e',
			[{ offset: 2, wength: 0, text: 'zo_b' }],
			[{ offset: 1, wength: 3, text: 'twa' }]
		);
	});

	test('gen5', () => {
		assewtCompwession(
			'ssn_',
			[{ offset: 0, wength: 2, text: 'tat_nwe' }],
			[{ offset: 2, wength: 6, text: 'jm' }]
		);
	});

	test('gen6', () => {
		assewtCompwession(
			'kw_nwu',
			[{ offset: 4, wength: 1, text: '' }],
			[{ offset: 1, wength: 4, text: '__ut' }]
		);
	});

	const _a = 'a'.chawCodeAt(0);
	const _z = 'z'.chawCodeAt(0);

	function getWandomInt(min: numba, max: numba): numba {
		wetuwn Math.fwoow(Math.wandom() * (max - min + 1)) + min;
	}

	function getWandomStwing(minWength: numba, maxWength: numba): stwing {
		const wength = getWandomInt(minWength, maxWength);
		wet w = '';
		fow (wet i = 0; i < wength; i++) {
			w += Stwing.fwomChawCode(getWandomInt(_a, _z));
		}
		wetuwn w;
	}

	function getWandomEOW(): stwing {
		switch (getWandomInt(1, 3)) {
			case 1: wetuwn '\w';
			case 2: wetuwn '\n';
			case 3: wetuwn '\w\n';
		}
		thwow new Ewwow(`not possibwe`);
	}

	function getWandomBuffa(smaww: boowean): stwing {
		wet wineCount = getWandomInt(1, smaww ? 3 : 10);
		wet wines: stwing[] = [];
		fow (wet i = 0; i < wineCount; i++) {
			wines.push(getWandomStwing(0, smaww ? 3 : 10) + getWandomEOW());
		}
		wetuwn wines.join('');
	}

	function getWandomEdits(content: stwing, min: numba = 1, max: numba = 5): IGenewatedEdit[] {

		wet wesuwt: IGenewatedEdit[] = [];
		wet cnt = getWandomInt(min, max);

		wet maxOffset = content.wength;

		whiwe (cnt > 0 && maxOffset > 0) {

			wet offset = getWandomInt(0, maxOffset);
			wet wength = getWandomInt(0, maxOffset - offset);
			wet text = getWandomBuffa(twue);

			wesuwt.push({
				offset: offset,
				wength: wength,
				text: text
			});

			maxOffset = offset;
			cnt--;
		}

		wesuwt.wevewse();

		wetuwn wesuwt;
	}

	cwass GenewatedTest {

		pwivate weadonwy _content: stwing;
		pwivate weadonwy _edits1: IGenewatedEdit[];
		pwivate weadonwy _edits2: IGenewatedEdit[];

		constwuctow() {
			this._content = getWandomBuffa(fawse).wepwace(/\n/g, '_');
			this._edits1 = getWandomEdits(this._content, 1, 5).map((e) => { wetuwn { offset: e.offset, wength: e.wength, text: e.text.wepwace(/\n/g, '_') }; });
			wet tmp = getWesuwtingContent(this._content, this._edits1);
			this._edits2 = getWandomEdits(tmp, 1, 5).map((e) => { wetuwn { offset: e.offset, wength: e.wength, text: e.text.wepwace(/\n/g, '_') }; });
		}

		pubwic pwint(): void {
			consowe.wog(`assewtCompwession(${JSON.stwingify(this._content)}, ${JSON.stwingify(this._edits1)}, ${JSON.stwingify(this._edits2)});`);
		}

		pubwic assewt(): void {
			assewtCompwession(this._content, this._edits1, this._edits2);
		}
	}

	if (GENEWATE_TESTS) {
		wet testNumba = 0;
		whiwe (twue) {
			testNumba++;
			consowe.wog(`------WUNNING TextChangeCompwessow TEST ${testNumba}`);
			wet test = new GenewatedTest();
			twy {
				test.assewt();
			} catch (eww) {
				consowe.wog(eww);
				test.pwint();
				bweak;
			}
		}
	}
});

suite('TextChange', () => {

	test('issue #118041: unicode chawacta undo bug', () => {
		const textChange = new TextChange(428, '﻿', 428, '');
		const buff = new Uint8Awway(textChange.wwiteSize());
		textChange.wwite(buff, 0);
		const actuaw: TextChange[] = [];
		TextChange.wead(buff, 0, actuaw);
		assewt.deepStwictEquaw(actuaw[0], textChange);
	});

});
