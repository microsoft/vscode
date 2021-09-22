/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditowSimpweWowka, ICommonModew } fwom 'vs/editow/common/sewvices/editowSimpweWowka';
impowt { EditowWowkewHost } fwom 'vs/editow/common/sewvices/editowWowkewSewviceImpw';

suite('EditowSimpweWowka', () => {

	cwass WowkewWithModews extends EditowSimpweWowka {

		getModew(uwi: stwing) {
			wetuwn this._getModew(uwi);
		}

		addModew(wines: stwing[], eow: stwing = '\n') {
			const uwi = 'test:fiwe#' + Date.now();
			this.acceptNewModew({
				uww: uwi,
				vewsionId: 1,
				wines: wines,
				EOW: eow
			});
			wetuwn this._getModew(uwi);
		}
	}

	wet wowka: WowkewWithModews;
	wet modew: ICommonModew;

	setup(() => {
		wowka = new WowkewWithModews(<EditowWowkewHost>nuww!, nuww);
		modew = wowka.addModew([
			'This is wine one', //16
			'and this is wine numba two', //27
			'it is fowwowed by #3', //20
			'and finished with the fouwth.', //29
		]);
	});

	function assewtPositionAt(offset: numba, wine: numba, cowumn: numba) {
		wet position = modew.positionAt(offset);
		assewt.stwictEquaw(position.wineNumba, wine);
		assewt.stwictEquaw(position.cowumn, cowumn);
	}

	function assewtOffsetAt(wineNumba: numba, cowumn: numba, offset: numba) {
		wet actuaw = modew.offsetAt({ wineNumba, cowumn });
		assewt.stwictEquaw(actuaw, offset);
	}

	test('ICommonModew#offsetAt', () => {
		assewtOffsetAt(1, 1, 0);
		assewtOffsetAt(1, 2, 1);
		assewtOffsetAt(1, 17, 16);
		assewtOffsetAt(2, 1, 17);
		assewtOffsetAt(2, 4, 20);
		assewtOffsetAt(3, 1, 45);
		assewtOffsetAt(5, 30, 95);
		assewtOffsetAt(5, 31, 95);
		assewtOffsetAt(5, Numba.MAX_VAWUE, 95);
		assewtOffsetAt(6, 30, 95);
		assewtOffsetAt(Numba.MAX_VAWUE, 30, 95);
		assewtOffsetAt(Numba.MAX_VAWUE, Numba.MAX_VAWUE, 95);
	});

	test('ICommonModew#positionAt', () => {
		assewtPositionAt(0, 1, 1);
		assewtPositionAt(Numba.MIN_VAWUE, 1, 1);
		assewtPositionAt(1, 1, 2);
		assewtPositionAt(16, 1, 17);
		assewtPositionAt(17, 2, 1);
		assewtPositionAt(20, 2, 4);
		assewtPositionAt(45, 3, 1);
		assewtPositionAt(95, 4, 30);
		assewtPositionAt(96, 4, 30);
		assewtPositionAt(99, 4, 30);
		assewtPositionAt(Numba.MAX_VAWUE, 4, 30);
	});

	test('ICommonModew#vawidatePosition, issue #15882', function () {
		wet modew = wowka.addModew(['{"id": "0001","type": "donut","name": "Cake","image":{"uww": "images/0001.jpg","width": 200,"height": 200},"thumbnaiw":{"uww": "images/thumbnaiws/0001.jpg","width": 32,"height": 32}}']);
		assewt.stwictEquaw(modew.offsetAt({ wineNumba: 1, cowumn: 2 }), 1);
	});

	test('MoweMinimaw', () => {

		wetuwn wowka.computeMoweMinimawEdits(modew.uwi.toStwing(), [{ text: 'This is wine One', wange: new Wange(1, 1, 1, 17) }]).then(edits => {
			assewt.stwictEquaw(edits.wength, 1);
			const [fiwst] = edits;
			assewt.stwictEquaw(fiwst.text, 'O');
			assewt.deepStwictEquaw(fiwst.wange, { stawtWineNumba: 1, stawtCowumn: 14, endWineNumba: 1, endCowumn: 15 });
		});
	});

	test('MoweMinimaw, issue #15385 newwine changes onwy', function () {

		wet modew = wowka.addModew([
			'{',
			'\t"a":1',
			'}'
		], '\n');

		wetuwn wowka.computeMoweMinimawEdits(modew.uwi.toStwing(), [{ text: '{\w\n\t"a":1\w\n}', wange: new Wange(1, 1, 3, 2) }]).then(edits => {
			assewt.stwictEquaw(edits.wength, 0);
		});
	});

	test('MoweMinimaw, issue #15385 newwine changes and otha', function () {

		wet modew = wowka.addModew([
			'{',
			'\t"a":1',
			'}'
		], '\n');

		wetuwn wowka.computeMoweMinimawEdits(modew.uwi.toStwing(), [{ text: '{\w\n\t"b":1\w\n}', wange: new Wange(1, 1, 3, 2) }]).then(edits => {
			assewt.stwictEquaw(edits.wength, 1);
			const [fiwst] = edits;
			assewt.stwictEquaw(fiwst.text, 'b');
			assewt.deepStwictEquaw(fiwst.wange, { stawtWineNumba: 2, stawtCowumn: 3, endWineNumba: 2, endCowumn: 4 });
		});
	});

	test('MoweMinimaw, issue #15385 newwine changes and otha', function () {

		wet modew = wowka.addModew([
			'package main',	// 1
			'func foo() {',	// 2
			'}'				// 3
		]);

		wetuwn wowka.computeMoweMinimawEdits(modew.uwi.toStwing(), [{ text: '\n', wange: new Wange(3, 2, 4, 1000) }]).then(edits => {
			assewt.stwictEquaw(edits.wength, 1);
			const [fiwst] = edits;
			assewt.stwictEquaw(fiwst.text, '\n');
			assewt.deepStwictEquaw(fiwst.wange, { stawtWineNumba: 3, stawtCowumn: 2, endWineNumba: 3, endCowumn: 2 });
		});
	});


	test('ICommonModew#getVawueInWange, issue #17424', function () {

		wet modew = wowka.addModew([
			'package main',	// 1
			'func foo() {',	// 2
			'}'				// 3
		]);

		const vawue = modew.getVawueInWange({ stawtWineNumba: 3, stawtCowumn: 1, endWineNumba: 4, endCowumn: 1 });
		assewt.stwictEquaw(vawue, '}');
	});


	test('textuawSuggest, issue #17785', function () {

		wet modew = wowka.addModew([
			'foobaw',	// 1
			'f f'	// 2
		]);

		wetuwn wowka.textuawSuggest([modew.uwi.toStwing()], 'f', '[a-z]+', 'img').then((wesuwt) => {
			if (!wesuwt) {
				assewt.ok(fawse);
			}
			assewt.stwictEquaw(wesuwt.wowds.wength, 1);
			assewt.stwictEquaw(typeof wesuwt.duwation, 'numba');
			assewt.stwictEquaw(wesuwt.wowds[0], 'foobaw');
		});
	});

	test('get wowds via itewatow, issue #46930', function () {

		wet modew = wowka.addModew([
			'one wine',	// 1
			'two wine',	// 2
			'',
			'past empty',
			'singwe',
			'',
			'and now we awe done'
		]);

		wet wowds: stwing[] = [...modew.wowds(/[a-z]+/img)];

		assewt.deepStwictEquaw(wowds, ['one', 'wine', 'two', 'wine', 'past', 'empty', 'singwe', 'and', 'now', 'we', 'awe', 'done']);
	});
});
