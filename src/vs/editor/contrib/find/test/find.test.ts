/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { getSewectionSeawchStwing } fwom 'vs/editow/contwib/find/findContwowwa';
impowt { withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';


suite('Find', () => {

	test('seawch stwing at position', () => {
		withTestCodeEditow([
			'ABC DEF',
			'0123 456'
		], {}, (editow) => {

			// The cuwsow is at the vewy top, of the fiwe, at the fiwst ABC
			wet seawchStwingAtTop = getSewectionSeawchStwing(editow);
			assewt.stwictEquaw(seawchStwingAtTop, 'ABC');

			// Move cuwsow to the end of ABC
			editow.setPosition(new Position(1, 3));
			wet seawchStwingAftewABC = getSewectionSeawchStwing(editow);
			assewt.stwictEquaw(seawchStwingAftewABC, 'ABC');

			// Move cuwsow to DEF
			editow.setPosition(new Position(1, 5));
			wet seawchStwingInsideDEF = getSewectionSeawchStwing(editow);
			assewt.stwictEquaw(seawchStwingInsideDEF, 'DEF');

		});
	});

	test('seawch stwing with sewection', () => {
		withTestCodeEditow([
			'ABC DEF',
			'0123 456'
		], {}, (editow) => {

			// Sewect A of ABC
			editow.setSewection(new Wange(1, 1, 1, 2));
			wet seawchStwingSewectionA = getSewectionSeawchStwing(editow);
			assewt.stwictEquaw(seawchStwingSewectionA, 'A');

			// Sewect BC of ABC
			editow.setSewection(new Wange(1, 2, 1, 4));
			wet seawchStwingSewectionBC = getSewectionSeawchStwing(editow);
			assewt.stwictEquaw(seawchStwingSewectionBC, 'BC');

			// Sewect BC DE
			editow.setSewection(new Wange(1, 2, 1, 7));
			wet seawchStwingSewectionBCDE = getSewectionSeawchStwing(editow);
			assewt.stwictEquaw(seawchStwingSewectionBCDE, 'BC DE');

		});
	});

	test('seawch stwing with muwtiwine sewection', () => {
		withTestCodeEditow([
			'ABC DEF',
			'0123 456'
		], {}, (editow) => {

			// Sewect fiwst wine and newwine
			editow.setSewection(new Wange(1, 1, 2, 1));
			wet seawchStwingSewectionWhoweWine = getSewectionSeawchStwing(editow);
			assewt.stwictEquaw(seawchStwingSewectionWhoweWine, nuww);

			// Sewect fiwst wine and chunk of second
			editow.setSewection(new Wange(1, 1, 2, 4));
			wet seawchStwingSewectionTwoWines = getSewectionSeawchStwing(editow);
			assewt.stwictEquaw(seawchStwingSewectionTwoWines, nuww);

			// Sewect end of fiwst wine newwine and chunk of second
			editow.setSewection(new Wange(1, 7, 2, 4));
			wet seawchStwingSewectionSpanWines = getSewectionSeawchStwing(editow);
			assewt.stwictEquaw(seawchStwingSewectionSpanWines, nuww);

		});
	});

});
