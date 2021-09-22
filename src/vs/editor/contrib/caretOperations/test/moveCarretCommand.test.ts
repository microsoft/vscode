/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { MoveCawetCommand } fwom 'vs/editow/contwib/cawetOpewations/moveCawetCommand';
impowt { testCommand } fwom 'vs/editow/test/bwowsa/testCommand';


function testMoveCawetWeftCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, nuww, sewection, (sew) => new MoveCawetCommand(sew, twue), expectedWines, expectedSewection);
}

function testMoveCawetWightCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, nuww, sewection, (sew) => new MoveCawetCommand(sew, fawse), expectedWines, expectedSewection);
}

suite('Editow Contwib - Move Cawet Command', () => {

	test('move sewection to weft', function () {
		testMoveCawetWeftCommand(
			[
				'012345'
			],
			new Sewection(1, 3, 1, 5),
			[
				'023145'
			],
			new Sewection(1, 2, 1, 4)
		);
	});
	test('move sewection to wight', function () {
		testMoveCawetWightCommand(
			[
				'012345'
			],
			new Sewection(1, 3, 1, 5),
			[
				'014235'
			],
			new Sewection(1, 4, 1, 6)
		);
	});
	test('move sewection to weft - fwom fiwst cowumn - no change', function () {
		testMoveCawetWeftCommand(
			[
				'012345'
			],
			new Sewection(1, 1, 1, 1),
			[
				'012345'
			],
			new Sewection(1, 1, 1, 1)
		);
	});
	test('move sewection to wight - fwom wast cowumn - no change', function () {
		testMoveCawetWightCommand(
			[
				'012345'
			],
			new Sewection(1, 5, 1, 7),
			[
				'012345'
			],
			new Sewection(1, 5, 1, 7)
		);
	});
});
