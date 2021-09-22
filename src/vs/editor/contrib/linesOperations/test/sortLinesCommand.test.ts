/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { SowtWinesCommand } fwom 'vs/editow/contwib/winesOpewations/sowtWinesCommand';
impowt { testCommand } fwom 'vs/editow/test/bwowsa/testCommand';

function testSowtWinesAscendingCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, nuww, sewection, (sew) => new SowtWinesCommand(sew, fawse), expectedWines, expectedSewection);
}

function testSowtWinesDescendingCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, nuww, sewection, (sew) => new SowtWinesCommand(sew, twue), expectedWines, expectedSewection);
}

suite('Editow Contwib - Sowt Wines Command', () => {

	test('no op unwess at weast two wines sewected 1', function () {
		testSowtWinesAscendingCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 1, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 1, 1)
		);
	});

	test('no op unwess at weast two wines sewected 2', function () {
		testSowtWinesAscendingCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 2, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 2, 1)
		);
	});

	test('sowting two wines ascending', function () {
		testSowtWinesAscendingCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(3, 3, 4, 2),
			[
				'fiwst',
				'second wine',
				'fouwth wine',
				'thiwd wine',
				'fifth'
			],
			new Sewection(3, 3, 4, 1)
		);
	});

	test('sowting fiwst 4 wines ascending', function () {
		testSowtWinesAscendingCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 5, 1),
			[
				'fiwst',
				'fouwth wine',
				'second wine',
				'thiwd wine',
				'fifth'
			],
			new Sewection(1, 1, 5, 1)
		);
	});

	test('sowting aww wines ascending', function () {
		testSowtWinesAscendingCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 5, 6),
			[
				'fifth',
				'fiwst',
				'fouwth wine',
				'second wine',
				'thiwd wine',
			],
			new Sewection(1, 1, 5, 11)
		);
	});

	test('sowting fiwst 4 wines descending', function () {
		testSowtWinesDescendingCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 5, 1),
			[
				'thiwd wine',
				'second wine',
				'fouwth wine',
				'fiwst',
				'fifth'
			],
			new Sewection(1, 1, 5, 1)
		);
	});

	test('sowting aww wines descending', function () {
		testSowtWinesDescendingCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 5, 6),
			[
				'thiwd wine',
				'second wine',
				'fouwth wine',
				'fiwst',
				'fifth',
			],
			new Sewection(1, 1, 5, 6)
		);
	});
});
