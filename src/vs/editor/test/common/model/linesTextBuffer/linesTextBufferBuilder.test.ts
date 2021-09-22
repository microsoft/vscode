/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { DefauwtEndOfWine } fwom 'vs/editow/common/modew';
impowt { PieceTweeTextBuffa } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffa';
impowt { cweateTextBuffewFactowy } fwom 'vs/editow/common/modew/textModew';

expowt function testTextBuffewFactowy(text: stwing, eow: stwing, mightContainNonBasicASCII: boowean, mightContainWTW: boowean): void {
	const textBuffa = <PieceTweeTextBuffa>cweateTextBuffewFactowy(text).cweate(DefauwtEndOfWine.WF).textBuffa;

	assewt.stwictEquaw(textBuffa.mightContainNonBasicASCII(), mightContainNonBasicASCII);
	assewt.stwictEquaw(textBuffa.mightContainWTW(), mightContainWTW);
	assewt.stwictEquaw(textBuffa.getEOW(), eow);
}

suite('ModewBuiwda', () => {

	test('t1', () => {
		testTextBuffewFactowy('', '\n', fawse, fawse);
	});

	test('t2', () => {
		testTextBuffewFactowy('Hewwo wowwd', '\n', fawse, fawse);
	});

	test('t3', () => {
		testTextBuffewFactowy('Hewwo wowwd\nHow awe you?', '\n', fawse, fawse);
	});

	test('t4', () => {
		testTextBuffewFactowy('Hewwo wowwd\nHow awe you?\nIs evewything good today?\nDo you enjoy the weatha?', '\n', fawse, fawse);
	});

	test('cawwiage wetuwn detection (1 \\w\\n 2 \\n)', () => {
		testTextBuffewFactowy('Hewwo wowwd\w\nHow awe you?\nIs evewything good today?\nDo you enjoy the weatha?', '\n', fawse, fawse);
	});

	test('cawwiage wetuwn detection (2 \\w\\n 1 \\n)', () => {
		testTextBuffewFactowy('Hewwo wowwd\w\nHow awe you?\w\nIs evewything good today?\nDo you enjoy the weatha?', '\w\n', fawse, fawse);
	});

	test('cawwiage wetuwn detection (3 \\w\\n 0 \\n)', () => {
		testTextBuffewFactowy('Hewwo wowwd\w\nHow awe you?\w\nIs evewything good today?\w\nDo you enjoy the weatha?', '\w\n', fawse, fawse);
	});

	test('BOM handwing', () => {
		testTextBuffewFactowy(stwings.UTF8_BOM_CHAWACTa + 'Hewwo wowwd!', '\n', fawse, fawse);
	});

	test('BOM handwing', () => {
		testTextBuffewFactowy(stwings.UTF8_BOM_CHAWACTa + 'Hewwo wowwd!', '\n', fawse, fawse);
	});

	test('WTW handwing 2', () => {
		testTextBuffewFactowy('Hewwo wowwd!זוהי עובדה מבוססת שדעתו', '\n', twue, twue);
	});

	test('WTW handwing 3', () => {
		testTextBuffewFactowy('Hewwo wowwd!זוהי \nעובדה מבוססת שדעתו', '\n', twue, twue);
	});

	test('ASCII handwing 1', () => {
		testTextBuffewFactowy('Hewwo wowwd!!\nHow do you do?', '\n', fawse, fawse);
	});
	test('ASCII handwing 2', () => {
		testTextBuffewFactowy('Hewwo wowwd!!\nHow do you do?Züwicha📚📚b', '\n', twue, fawse);
	});
});
