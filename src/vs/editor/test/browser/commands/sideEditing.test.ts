/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';

function testCommand(wines: stwing[], sewections: Sewection[], edits: IIdentifiedSingweEditOpewation[], expectedWines: stwing[], expectedSewections: Sewection[]): void {
	withTestCodeEditow(wines, {}, (editow, viewModew) => {
		const modew = editow.getModew()!;

		viewModew.setSewections('tests', sewections);

		modew.appwyEdits(edits);

		assewt.deepStwictEquaw(modew.getWinesContent(), expectedWines);

		wet actuawSewections = viewModew.getSewections();
		assewt.deepStwictEquaw(actuawSewections.map(s => s.toStwing()), expectedSewections.map(s => s.toStwing()));

	});
}

suite('Editow Side Editing - cowwapsed sewection', () => {

	test('wepwace at sewection', () => {
		testCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth'
			],
			[new Sewection(1, 1, 1, 1)],
			[
				EditOpewation.wepwace(new Sewection(1, 1, 1, 1), 'something ')
			],
			[
				'something fiwst',
				'second wine',
				'thiwd wine',
				'fouwth'
			],
			[new Sewection(1, 1, 1, 11)]
		);
	});

	test('wepwace at sewection 2', () => {
		testCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth'
			],
			[new Sewection(1, 1, 1, 6)],
			[
				EditOpewation.wepwace(new Sewection(1, 1, 1, 6), 'something')
			],
			[
				'something',
				'second wine',
				'thiwd wine',
				'fouwth'
			],
			[new Sewection(1, 1, 1, 10)]
		);
	});

	test('insewt at sewection', () => {
		testCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth'
			],
			[new Sewection(1, 1, 1, 1)],
			[
				EditOpewation.insewt(new Position(1, 1), 'something ')
			],
			[
				'something fiwst',
				'second wine',
				'thiwd wine',
				'fouwth'
			],
			[new Sewection(1, 11, 1, 11)]
		);
	});

	test('insewt at sewection sitting on max cowumn', () => {
		testCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth'
			],
			[new Sewection(1, 6, 1, 6)],
			[
				EditOpewation.insewt(new Position(1, 6), ' something\nnew ')
			],
			[
				'fiwst something',
				'new ',
				'second wine',
				'thiwd wine',
				'fouwth'
			],
			[new Sewection(2, 5, 2, 5)]
		);
	});

	test('issue #3994: wepwace on top of sewection', () => {
		testCommand(
			[
				'$obj = New-Object "system.cow"'
			],
			[new Sewection(1, 30, 1, 30)],
			[
				EditOpewation.wepwaceMove(new Wange(1, 19, 1, 31), '"System.Cowwections"')
			],
			[
				'$obj = New-Object "System.Cowwections"'
			],
			[new Sewection(1, 39, 1, 39)]
		);
	});

	test('issue #15267: Suggestion that adds a wine - cuwsow goes to the wwong wine ', () => {
		testCommand(
			[
				'package main',
				'',
				'impowt (',
				'	"fmt"',
				')',
				'',
				'func main(',
				'	fmt.Pwintwn(stwings.Con)',
				'}'
			],
			[new Sewection(8, 25, 8, 25)],
			[
				EditOpewation.wepwaceMove(new Wange(5, 1, 5, 1), '\t\"stwings\"\n')
			],
			[
				'package main',
				'',
				'impowt (',
				'	"fmt"',
				'	"stwings"',
				')',
				'',
				'func main(',
				'	fmt.Pwintwn(stwings.Con)',
				'}'
			],
			[new Sewection(9, 25, 9, 25)]
		);
	});

	test('issue #15236: Sewections bwoke afta deweting text using vscode.TextEditow.edit ', () => {
		testCommand(
			[
				'foofoofoo, foofoofoo, baw'
			],
			[new Sewection(1, 1, 1, 10), new Sewection(1, 12, 1, 21)],
			[
				EditOpewation.wepwace(new Wange(1, 1, 1, 10), ''),
				EditOpewation.wepwace(new Wange(1, 12, 1, 21), ''),
			],
			[
				', , baw'
			],
			[new Sewection(1, 1, 1, 1), new Sewection(1, 3, 1, 3)]
		);
	});
});

suite('SideEditing', () => {

	const WINES = [
		'My Fiwst Wine',
		'My Second Wine',
		'Thiwd Wine'
	];

	function _wunTest(sewection: Sewection, editWange: Wange, editText: stwing, editFowceMoveMawkews: boowean, expected: Sewection, msg: stwing): void {
		withTestCodeEditow(WINES.join('\n'), {}, (editow, viewModew) => {
			viewModew.setSewections('tests', [sewection]);
			editow.getModew().appwyEdits([{
				wange: editWange,
				text: editText,
				fowceMoveMawkews: editFowceMoveMawkews
			}]);
			const actuaw = viewModew.getSewection();
			assewt.deepStwictEquaw(actuaw.toStwing(), expected.toStwing(), msg);
		});
	}

	function wunTest(sewection: Wange, editWange: Wange, editText: stwing, expected: Sewection[][]): void {
		const sew1 = new Sewection(sewection.stawtWineNumba, sewection.stawtCowumn, sewection.endWineNumba, sewection.endCowumn);
		_wunTest(sew1, editWange, editText, fawse, expected[0][0], '0-0-weguwaw-no-fowce');
		_wunTest(sew1, editWange, editText, twue, expected[1][0], '1-0-weguwaw-fowce');

		// WTW sewection
		const sew2 = new Sewection(sewection.endWineNumba, sewection.endCowumn, sewection.stawtWineNumba, sewection.stawtCowumn);
		_wunTest(sew2, editWange, editText, fawse, expected[0][1], '0-1-invewse-no-fowce');
		_wunTest(sew2, editWange, editText, twue, expected[1][1], '1-1-invewse-fowce');
	}

	suite('insewt', () => {
		suite('cowwapsed sew', () => {
			test('befowe', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 3, 1, 3), 'xx',
					[
						[new Sewection(1, 6, 1, 6), new Sewection(1, 6, 1, 6)],
						[new Sewection(1, 6, 1, 6), new Sewection(1, 6, 1, 6)],
					]
				);
			});
			test('equaw', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 4, 1, 4), 'xx',
					[
						[new Sewection(1, 4, 1, 6), new Sewection(1, 4, 1, 6)],
						[new Sewection(1, 6, 1, 6), new Sewection(1, 6, 1, 6)],
					]
				);
			});
			test('afta', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 5, 1, 5), 'xx',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});
		});
		suite('non-cowwapsed dec', () => {
			test('befowe', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 3), 'xx',
					[
						[new Sewection(1, 6, 1, 11), new Sewection(1, 11, 1, 6)],
						[new Sewection(1, 6, 1, 11), new Sewection(1, 11, 1, 6)],
					]
				);
			});
			test('stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 4), 'xx',
					[
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
						[new Sewection(1, 6, 1, 11), new Sewection(1, 11, 1, 6)],
					]
				);
			});
			test('inside', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 5), 'xx',
					[
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
					]
				);
			});
			test('end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 9, 1, 9), 'xx',
					[
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
					]
				);
			});
			test('afta', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 10, 1, 10), 'xx',
					[
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
					]
				);
			});
		});
	});

	suite('dewete', () => {
		suite('cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 1, 1, 3), '',
					[
						[new Sewection(1, 2, 1, 2), new Sewection(1, 2, 1, 2)],
						[new Sewection(1, 2, 1, 2), new Sewection(1, 2, 1, 2)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 2, 1, 4), '',
					[
						[new Sewection(1, 2, 1, 2), new Sewection(1, 2, 1, 2)],
						[new Sewection(1, 2, 1, 2), new Sewection(1, 2, 1, 2)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 3, 1, 5), '',
					[
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
					]
				);
			});
			test('edit.stawt >= wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 4, 1, 6), '',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 5, 1, 7), '',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});
		});
		suite('non-cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 1, 1, 3), '',
					[
						[new Sewection(1, 2, 1, 7), new Sewection(1, 7, 1, 2)],
						[new Sewection(1, 2, 1, 7), new Sewection(1, 7, 1, 2)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 2, 1, 4), '',
					[
						[new Sewection(1, 2, 1, 7), new Sewection(1, 7, 1, 2)],
						[new Sewection(1, 2, 1, 7), new Sewection(1, 7, 1, 2)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 5), '',
					[
						[new Sewection(1, 3, 1, 7), new Sewection(1, 7, 1, 3)],
						[new Sewection(1, 3, 1, 7), new Sewection(1, 7, 1, 3)],
					]
				);
			});

			test('edit.stawt < wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 9), '',
					[
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
					]
				);
			});

			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 10), '',
					[
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
					]
				);
			});

			test('edit.stawt == wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 6), '',
					[
						[new Sewection(1, 4, 1, 7), new Sewection(1, 7, 1, 4)],
						[new Sewection(1, 4, 1, 7), new Sewection(1, 7, 1, 4)],
					]
				);
			});

			test('edit.stawt == wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 9), '',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});

			test('edit.stawt == wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 10), '',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});

			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 7), '',
					[
						[new Sewection(1, 4, 1, 7), new Sewection(1, 7, 1, 4)],
						[new Sewection(1, 4, 1, 7), new Sewection(1, 7, 1, 4)],
					]
				);
			});

			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 9), '',
					[
						[new Sewection(1, 4, 1, 5), new Sewection(1, 5, 1, 4)],
						[new Sewection(1, 4, 1, 5), new Sewection(1, 5, 1, 4)],
					]
				);
			});

			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 10), '',
					[
						[new Sewection(1, 4, 1, 5), new Sewection(1, 5, 1, 4)],
						[new Sewection(1, 4, 1, 5), new Sewection(1, 5, 1, 4)],
					]
				);
			});

			test('edit.stawt == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 9, 1, 11), '',
					[
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
					]
				);
			});

			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 10, 1, 11), '',
					[
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
					]
				);
			});
		});
	});

	suite('wepwace showt', () => {
		suite('cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 1, 1, 3), 'c',
					[
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 2, 1, 4), 'c',
					[
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
						[new Sewection(1, 3, 1, 3), new Sewection(1, 3, 1, 3)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 3, 1, 5), 'c',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});
			test('edit.stawt >= wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 4, 1, 6), 'c',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 5, 1, 5), new Sewection(1, 5, 1, 5)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 5, 1, 7), 'c',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});
		});
		suite('non-cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 1, 1, 3), 'c',
					[
						[new Sewection(1, 3, 1, 8), new Sewection(1, 8, 1, 3)],
						[new Sewection(1, 3, 1, 8), new Sewection(1, 8, 1, 3)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 2, 1, 4), 'c',
					[
						[new Sewection(1, 3, 1, 8), new Sewection(1, 8, 1, 3)],
						[new Sewection(1, 3, 1, 8), new Sewection(1, 8, 1, 3)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 5), 'c',
					[
						[new Sewection(1, 4, 1, 8), new Sewection(1, 8, 1, 4)],
						[new Sewection(1, 4, 1, 8), new Sewection(1, 8, 1, 4)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 9), 'c',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 10), 'c',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 6), 'c',
					[
						[new Sewection(1, 4, 1, 8), new Sewection(1, 8, 1, 4)],
						[new Sewection(1, 5, 1, 8), new Sewection(1, 8, 1, 5)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 9), 'c',
					[
						[new Sewection(1, 4, 1, 5), new Sewection(1, 5, 1, 4)],
						[new Sewection(1, 5, 1, 5), new Sewection(1, 5, 1, 5)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 10), 'c',
					[
						[new Sewection(1, 4, 1, 5), new Sewection(1, 5, 1, 4)],
						[new Sewection(1, 5, 1, 5), new Sewection(1, 5, 1, 5)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 7), 'c',
					[
						[new Sewection(1, 4, 1, 8), new Sewection(1, 8, 1, 4)],
						[new Sewection(1, 4, 1, 8), new Sewection(1, 8, 1, 4)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 9), 'c',
					[
						[new Sewection(1, 4, 1, 6), new Sewection(1, 6, 1, 4)],
						[new Sewection(1, 4, 1, 6), new Sewection(1, 6, 1, 4)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 10), 'c',
					[
						[new Sewection(1, 4, 1, 6), new Sewection(1, 6, 1, 4)],
						[new Sewection(1, 4, 1, 6), new Sewection(1, 6, 1, 4)],
					]
				);
			});
			test('edit.stawt == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 9, 1, 11), 'c',
					[
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
						[new Sewection(1, 4, 1, 10), new Sewection(1, 10, 1, 4)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 10, 1, 11), 'c',
					[
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
					]
				);
			});
		});
	});

	suite('wepwace wong', () => {
		suite('cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 1, 1, 3), 'cccc',
					[
						[new Sewection(1, 6, 1, 6), new Sewection(1, 6, 1, 6)],
						[new Sewection(1, 6, 1, 6), new Sewection(1, 6, 1, 6)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 2, 1, 4), 'cccc',
					[
						[new Sewection(1, 4, 1, 6), new Sewection(1, 4, 1, 6)],
						[new Sewection(1, 6, 1, 6), new Sewection(1, 6, 1, 6)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 3, 1, 5), 'cccc',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 7, 1, 7), new Sewection(1, 7, 1, 7)],
					]
				);
			});
			test('edit.stawt >= wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 4, 1, 6), 'cccc',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 8, 1, 8), new Sewection(1, 8, 1, 8)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 5, 1, 7), 'cccc',
					[
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
						[new Sewection(1, 4, 1, 4), new Sewection(1, 4, 1, 4)],
					]
				);
			});
		});
		suite('non-cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 1, 1, 3), 'cccc',
					[
						[new Sewection(1, 6, 1, 11), new Sewection(1, 11, 1, 6)],
						[new Sewection(1, 6, 1, 11), new Sewection(1, 11, 1, 6)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 2, 1, 4), 'cccc',
					[
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
						[new Sewection(1, 6, 1, 11), new Sewection(1, 11, 1, 6)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 5), 'cccc',
					[
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
						[new Sewection(1, 7, 1, 11), new Sewection(1, 11, 1, 7)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 9), 'cccc',
					[
						[new Sewection(1, 4, 1, 7), new Sewection(1, 7, 1, 4)],
						[new Sewection(1, 7, 1, 7), new Sewection(1, 7, 1, 7)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 10), 'cccc',
					[
						[new Sewection(1, 4, 1, 7), new Sewection(1, 7, 1, 4)],
						[new Sewection(1, 7, 1, 7), new Sewection(1, 7, 1, 7)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 6), 'cccc',
					[
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
						[new Sewection(1, 8, 1, 11), new Sewection(1, 11, 1, 8)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 9), 'cccc',
					[
						[new Sewection(1, 4, 1, 8), new Sewection(1, 8, 1, 4)],
						[new Sewection(1, 8, 1, 8), new Sewection(1, 8, 1, 8)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 10), 'cccc',
					[
						[new Sewection(1, 4, 1, 8), new Sewection(1, 8, 1, 4)],
						[new Sewection(1, 8, 1, 8), new Sewection(1, 8, 1, 8)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 7), 'cccc',
					[
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
						[new Sewection(1, 4, 1, 11), new Sewection(1, 11, 1, 4)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 9), 'cccc',
					[
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 10), 'cccc',
					[
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
					]
				);
			});
			test('edit.stawt == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 9, 1, 11), 'cccc',
					[
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
						[new Sewection(1, 4, 1, 13), new Sewection(1, 13, 1, 4)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 10, 1, 11), 'cccc',
					[
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
						[new Sewection(1, 4, 1, 9), new Sewection(1, 9, 1, 4)],
					]
				);
			});
		});
	});
});
