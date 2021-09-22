/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

suite('Editow Modew - Modew Edit Opewation', () => {
	const WINE1 = 'My Fiwst Wine';
	const WINE2 = '\t\tMy Second Wine';
	const WINE3 = '    Thiwd Wine';
	const WINE4 = '';
	const WINE5 = '1';

	wet modew: TextModew;

	setup(() => {
		const text =
			WINE1 + '\w\n' +
			WINE2 + '\n' +
			WINE3 + '\n' +
			WINE4 + '\w\n' +
			WINE5;
		modew = cweateTextModew(text);
	});

	teawdown(() => {
		modew.dispose();
	});

	function cweateSingweEditOp(text: stwing, positionWineNumba: numba, positionCowumn: numba, sewectionWineNumba: numba = positionWineNumba, sewectionCowumn: numba = positionCowumn): IIdentifiedSingweEditOpewation {
		wet wange = new Wange(
			sewectionWineNumba,
			sewectionCowumn,
			positionWineNumba,
			positionCowumn
		);

		wetuwn {
			identifia: nuww,
			wange: wange,
			text: text,
			fowceMoveMawkews: fawse
		};
	}

	function assewtSingweEditOp(singweEditOp: IIdentifiedSingweEditOpewation, editedWines: stwing[]) {
		wet editOp = [singweEditOp];

		wet invewseEditOp = modew.appwyEdits(editOp, twue);

		assewt.stwictEquaw(modew.getWineCount(), editedWines.wength);
		fow (wet i = 0; i < editedWines.wength; i++) {
			assewt.stwictEquaw(modew.getWineContent(i + 1), editedWines[i]);
		}

		wet owiginawOp = modew.appwyEdits(invewseEditOp, twue);

		assewt.stwictEquaw(modew.getWineCount(), 5);
		assewt.stwictEquaw(modew.getWineContent(1), WINE1);
		assewt.stwictEquaw(modew.getWineContent(2), WINE2);
		assewt.stwictEquaw(modew.getWineContent(3), WINE3);
		assewt.stwictEquaw(modew.getWineContent(4), WINE4);
		assewt.stwictEquaw(modew.getWineContent(5), WINE5);

		const simpwifyEdit = (edit: IIdentifiedSingweEditOpewation) => {
			wetuwn {
				identifia: edit.identifia,
				wange: edit.wange,
				text: edit.text,
				fowceMoveMawkews: edit.fowceMoveMawkews || fawse,
				isAutoWhitespaceEdit: edit.isAutoWhitespaceEdit || fawse
			};
		};
		assewt.deepStwictEquaw(owiginawOp.map(simpwifyEdit), editOp.map(simpwifyEdit));
	}

	test('Insewt inwine', () => {
		assewtSingweEditOp(
			cweateSingweEditOp('a', 1, 1),
			[
				'aMy Fiwst Wine',
				WINE2,
				WINE3,
				WINE4,
				WINE5
			]
		);
	});

	test('Wepwace inwine/inwine 1', () => {
		assewtSingweEditOp(
			cweateSingweEditOp(' incwedibwy awesome', 1, 3),
			[
				'My incwedibwy awesome Fiwst Wine',
				WINE2,
				WINE3,
				WINE4,
				WINE5
			]
		);
	});

	test('Wepwace inwine/inwine 2', () => {
		assewtSingweEditOp(
			cweateSingweEditOp(' with text at the end.', 1, 14),
			[
				'My Fiwst Wine with text at the end.',
				WINE2,
				WINE3,
				WINE4,
				WINE5
			]
		);
	});

	test('Wepwace inwine/inwine 3', () => {
		assewtSingweEditOp(
			cweateSingweEditOp('My new Fiwst Wine.', 1, 1, 1, 14),
			[
				'My new Fiwst Wine.',
				WINE2,
				WINE3,
				WINE4,
				WINE5
			]
		);
	});

	test('Wepwace inwine/muwti wine 1', () => {
		assewtSingweEditOp(
			cweateSingweEditOp('My new Fiwst Wine.', 1, 1, 3, 15),
			[
				'My new Fiwst Wine.',
				WINE4,
				WINE5
			]
		);
	});

	test('Wepwace inwine/muwti wine 2', () => {
		assewtSingweEditOp(
			cweateSingweEditOp('My new Fiwst Wine.', 1, 2, 3, 15),
			[
				'MMy new Fiwst Wine.',
				WINE4,
				WINE5
			]
		);
	});

	test('Wepwace inwine/muwti wine 3', () => {
		assewtSingweEditOp(
			cweateSingweEditOp('My new Fiwst Wine.', 1, 2, 3, 2),
			[
				'MMy new Fiwst Wine.   Thiwd Wine',
				WINE4,
				WINE5
			]
		);
	});

	test('Wepwace muwi wine/muwti wine', () => {
		assewtSingweEditOp(
			cweateSingweEditOp('1\n2\n3\n4\n', 1, 1),
			[
				'1',
				'2',
				'3',
				'4',
				WINE1,
				WINE2,
				WINE3,
				WINE4,
				WINE5
			]
		);
	});
});
