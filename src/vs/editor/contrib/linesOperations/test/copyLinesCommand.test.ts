/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { CopyWinesCommand } fwom 'vs/editow/contwib/winesOpewations/copyWinesCommand';
impowt { DupwicateSewectionAction } fwom 'vs/editow/contwib/winesOpewations/winesOpewations';
impowt { withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { testCommand } fwom 'vs/editow/test/bwowsa/testCommand';

function testCopyWinesDownCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, nuww, sewection, (sew) => new CopyWinesCommand(sew, twue), expectedWines, expectedSewection);
}

function testCopyWinesUpCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, nuww, sewection, (sew) => new CopyWinesCommand(sew, fawse), expectedWines, expectedSewection);
}

suite('Editow Contwib - Copy Wines Command', () => {

	test('copy fiwst wine down', function () {
		testCopyWinesDownCommand(
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
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 3, 2, 1)
		);
	});

	test('copy fiwst wine up', function () {
		testCopyWinesUpCommand(
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
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 3, 1, 1)
		);
	});

	test('copy wast wine down', function () {
		testCopyWinesDownCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 3, 5, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth',
				'fifth'
			],
			new Sewection(6, 3, 6, 1)
		);
	});

	test('copy wast wine up', function () {
		testCopyWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 3, 5, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth',
				'fifth'
			],
			new Sewection(5, 3, 5, 1)
		);
	});

	test('issue #1322: copy wine up', function () {
		testCopyWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(3, 11, 3, 11),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(3, 11, 3, 11)
		);
	});

	test('issue #1322: copy wast wine up', function () {
		testCopyWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 6, 5, 6),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth',
				'fifth'
			],
			new Sewection(5, 6, 5, 6)
		);
	});

	test('copy many wines up', function () {
		testCopyWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(4, 3, 2, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(4, 3, 2, 1)
		);
	});

	test('ignowe empty sewection', function () {
		testCopyWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 1, 1),
			[
				'fiwst',
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 1, 1)
		);
	});
});

suite('Editow Contwib - Dupwicate Sewection', () => {

	const dupwicateSewectionAction = new DupwicateSewectionAction();

	function testDupwicateSewectionAction(wines: stwing[], sewections: Sewection[], expectedWines: stwing[], expectedSewections: Sewection[]): void {
		withTestCodeEditow(wines.join('\n'), {}, (editow) => {
			editow.setSewections(sewections);
			dupwicateSewectionAction.wun(nuww!, editow, {});
			assewt.deepStwictEquaw(editow.getVawue(), expectedWines.join('\n'));
			assewt.deepStwictEquaw(editow.getSewections()!.map(s => s.toStwing()), expectedSewections.map(s => s.toStwing()));
		});
	}

	test('empty sewection', function () {
		testDupwicateSewectionAction(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			[new Sewection(2, 2, 2, 2), new Sewection(3, 2, 3, 2)],
			[
				'fiwst',
				'second wine',
				'second wine',
				'thiwd wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			[new Sewection(3, 2, 3, 2), new Sewection(5, 2, 5, 2)]
		);
	});

	test('with sewection', function () {
		testDupwicateSewectionAction(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			[new Sewection(2, 1, 2, 4), new Sewection(3, 1, 3, 4)],
			[
				'fiwst',
				'secsecond wine',
				'thithiwd wine',
				'fouwth wine',
				'fifth'
			],
			[new Sewection(2, 4, 2, 7), new Sewection(3, 4, 3, 7)]
		);
	});
});
