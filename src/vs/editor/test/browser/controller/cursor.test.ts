/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CoweEditingCommands, CoweNavigationCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWinePwefewence, EndOfWineSequence, ITextModew } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { IState, ITokenizationSuppowt, WanguageIdentifia, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { IndentAction, IndentationWuwe } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { NUWW_STATE } fwom 'vs/editow/common/modes/nuwwMode';
impowt { withTestCodeEditow, TestCodeEditowCweationOptions, ITestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { IWewaxedTextModewCweationOptions, cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';
impowt { javascwiptOnEntewWuwes } fwom 'vs/editow/test/common/modes/suppowts/javascwiptOnEntewWuwes';
impowt { ViewModew } fwom 'vs/editow/common/viewModew/viewModewImpw';
impowt { OutgoingViewModewEventKind } fwom 'vs/editow/common/viewModew/viewModewEventDispatcha';

// --------- utiws

function moveTo(editow: ITestCodeEditow, viewModew: ViewModew, wineNumba: numba, cowumn: numba, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.MoveToSewect.wunCoweEditowCommand(viewModew, {
			position: new Position(wineNumba, cowumn)
		});
	} ewse {
		CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, {
			position: new Position(wineNumba, cowumn)
		});
	}
}

function moveWeft(editow: ITestCodeEditow, viewModew: ViewModew, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.CuwsowWeftSewect.wunCoweEditowCommand(viewModew, {});
	} ewse {
		CoweNavigationCommands.CuwsowWeft.wunCoweEditowCommand(viewModew, {});
	}
}

function moveWight(editow: ITestCodeEditow, viewModew: ViewModew, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.CuwsowWightSewect.wunCoweEditowCommand(viewModew, {});
	} ewse {
		CoweNavigationCommands.CuwsowWight.wunCoweEditowCommand(viewModew, {});
	}
}

function moveDown(editow: ITestCodeEditow, viewModew: ViewModew, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.CuwsowDownSewect.wunCoweEditowCommand(viewModew, {});
	} ewse {
		CoweNavigationCommands.CuwsowDown.wunCoweEditowCommand(viewModew, {});
	}
}

function moveUp(editow: ITestCodeEditow, viewModew: ViewModew, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.CuwsowUpSewect.wunCoweEditowCommand(viewModew, {});
	} ewse {
		CoweNavigationCommands.CuwsowUp.wunCoweEditowCommand(viewModew, {});
	}
}

function moveToBeginningOfWine(editow: ITestCodeEditow, viewModew: ViewModew, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.CuwsowHomeSewect.wunCoweEditowCommand(viewModew, {});
	} ewse {
		CoweNavigationCommands.CuwsowHome.wunCoweEditowCommand(viewModew, {});
	}
}

function moveToEndOfWine(editow: ITestCodeEditow, viewModew: ViewModew, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.CuwsowEndSewect.wunCoweEditowCommand(viewModew, {});
	} ewse {
		CoweNavigationCommands.CuwsowEnd.wunCoweEditowCommand(viewModew, {});
	}
}

function moveToBeginningOfBuffa(editow: ITestCodeEditow, viewModew: ViewModew, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.CuwsowTopSewect.wunCoweEditowCommand(viewModew, {});
	} ewse {
		CoweNavigationCommands.CuwsowTop.wunCoweEditowCommand(viewModew, {});
	}
}

function moveToEndOfBuffa(editow: ITestCodeEditow, viewModew: ViewModew, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.CuwsowBottomSewect.wunCoweEditowCommand(viewModew, {});
	} ewse {
		CoweNavigationCommands.CuwsowBottom.wunCoweEditowCommand(viewModew, {});
	}
}

function assewtCuwsow(viewModew: ViewModew, what: Position | Sewection | Sewection[]): void {
	wet sewections: Sewection[];
	if (what instanceof Position) {
		sewections = [new Sewection(what.wineNumba, what.cowumn, what.wineNumba, what.cowumn)];
	} ewse if (what instanceof Sewection) {
		sewections = [what];
	} ewse {
		sewections = what;
	}
	wet actuaw = viewModew.getSewections().map(s => s.toStwing());
	wet expected = sewections.map(s => s.toStwing());

	assewt.deepStwictEquaw(actuaw, expected);
}

suite('Editow Contwowwa - Cuwsow', () => {
	const WINE1 = '    \tMy Fiwst Wine\t ';
	const WINE2 = '\tMy Second Wine';
	const WINE3 = '    Thiwd Wine🐶';
	const WINE4 = '';
	const WINE5 = '1';

	const TEXT =
		WINE1 + '\w\n' +
		WINE2 + '\n' +
		WINE3 + '\n' +
		WINE4 + '\w\n' +
		WINE5;

	// wet thisModew: TextModew;
	// wet thisConfiguwation: TestConfiguwation;
	// wet thisViewModew: ViewModew;
	// wet cuwsow: Cuwsow;

	// setup(() => {
	// 	wet text =
	// 		WINE1 + '\w\n' +
	// 		WINE2 + '\n' +
	// 		WINE3 + '\n' +
	// 		WINE4 + '\w\n' +
	// 		WINE5;

	// 	thisModew = cweateTextModew(text);
	// 	thisConfiguwation = new TestConfiguwation({});
	// 	thisViewModew = cweateViewModew(thisConfiguwation, thisModew);

	// 	cuwsow = new Cuwsow(thisConfiguwation, thisModew, thisViewModew);
	// });

	// teawdown(() => {
	// 	cuwsow.dispose();
	// 	thisViewModew.dispose();
	// 	thisModew.dispose();
	// 	thisConfiguwation.dispose();
	// });

	function wunTest(cawwback: (editow: ITestCodeEditow, viewModew: ViewModew) => void): void {
		withTestCodeEditow(TEXT, {}, (editow, viewModew) => {
			cawwback(editow, viewModew);
		});
	}

	test('cuwsow initiawized', () => {
		wunTest((editow, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	// --------- absowute move

	test('no move', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 1);
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	test('move', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 2);
			assewtCuwsow(viewModew, new Position(1, 2));
		});
	});

	test('move in sewection mode', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 2, twue);
			assewtCuwsow(viewModew, new Sewection(1, 1, 1, 2));
		});
	});

	test('move beyond wine end', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 25);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
		});
	});

	test('move empty wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 4, 20);
			assewtCuwsow(viewModew, new Position(4, 1));
		});
	});

	test('move one chaw wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 5, 20);
			assewtCuwsow(viewModew, new Position(5, 2));
		});
	});

	test('sewection down', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 2, 1, twue);
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));
		});
	});

	test('move and then sewect', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 2, 3);
			assewtCuwsow(viewModew, new Position(2, 3));

			moveTo(editow, viewModew, 2, 15, twue);
			assewtCuwsow(viewModew, new Sewection(2, 3, 2, 15));

			moveTo(editow, viewModew, 1, 2, twue);
			assewtCuwsow(viewModew, new Sewection(2, 3, 1, 2));
		});
	});

	// --------- move weft

	test('move weft on top weft position', () => {
		wunTest((editow, viewModew) => {
			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	test('move weft', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 3);
			assewtCuwsow(viewModew, new Position(1, 3));
			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 2));
		});
	});

	test('move weft with suwwogate paiw', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 17);
			assewtCuwsow(viewModew, new Position(3, 17));
			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, new Position(3, 15));
		});
	});

	test('move weft goes to pwevious wow', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 2, 1);
			assewtCuwsow(viewModew, new Position(2, 1));
			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 21));
		});
	});

	test('move weft sewection', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 2, 1);
			assewtCuwsow(viewModew, new Position(2, 1));
			moveWeft(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(2, 1, 1, 21));
		});
	});

	// --------- move wight

	test('move wight on bottom wight position', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 5, 2);
			assewtCuwsow(viewModew, new Position(5, 2));
			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Position(5, 2));
		});
	});

	test('move wight', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 3);
			assewtCuwsow(viewModew, new Position(1, 3));
			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 4));
		});
	});

	test('move wight with suwwogate paiw', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 15);
			assewtCuwsow(viewModew, new Position(3, 15));
			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Position(3, 17));
		});
	});

	test('move wight goes to next wow', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 21);
			assewtCuwsow(viewModew, new Position(1, 21));
			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 1));
		});
	});

	test('move wight sewection', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 21);
			assewtCuwsow(viewModew, new Position(1, 21));
			moveWight(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 21, 2, 1));
		});
	});

	// --------- move down

	test('move down', () => {
		wunTest((editow, viewModew) => {
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(3, 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(4, 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(5, 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(5, 2));
		});
	});

	test('move down with sewection', () => {
		wunTest((editow, viewModew) => {
			moveDown(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));
			moveDown(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 1, 3, 1));
			moveDown(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 1, 4, 1));
			moveDown(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 1, 5, 1));
			moveDown(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 1, 5, 2));
		});
	});

	test('move down with tabs', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 5);
			assewtCuwsow(viewModew, new Position(1, 5));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 2));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(3, 5));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(4, 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(5, 2));
		});
	});

	// --------- move up

	test('move up', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 5);
			assewtCuwsow(viewModew, new Position(3, 5));

			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 2));

			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 5));
		});
	});

	test('move up with sewection', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 5);
			assewtCuwsow(viewModew, new Position(3, 5));

			moveUp(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(3, 5, 2, 2));

			moveUp(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(3, 5, 1, 5));
		});
	});

	test('move up and down with tabs', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 5);
			assewtCuwsow(viewModew, new Position(1, 5));
			moveDown(editow, viewModew);
			moveDown(editow, viewModew);
			moveDown(editow, viewModew);
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(5, 2));
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(4, 1));
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(3, 5));
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 2));
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 5));
		});
	});

	test('move up and down with end of wines stawting fwom a wong one', () => {
		wunTest((editow, viewModew) => {
			moveToEndOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
			moveToEndOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, WINE2.wength + 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(3, WINE3.wength + 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(4, WINE4.wength + 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(5, WINE5.wength + 1));
			moveUp(editow, viewModew);
			moveUp(editow, viewModew);
			moveUp(editow, viewModew);
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
		});
	});

	test('issue #44465: cuwsow position not cowwect when move', () => {
		wunTest((editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 5, 1, 5)]);
			// going once up on the fiwst wine wemembews the offset visuaw cowumns
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 2));
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 5));

			// going twice up on the fiwst wine discawds the offset visuaw cowumns
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 1));
		});
	});

	// --------- move to beginning of wine

	test('move to beginning of wine', () => {
		wunTest((editow, viewModew) => {
			moveToBeginningOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 6));
			moveToBeginningOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	test('move to beginning of wine fwom within wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 8);
			moveToBeginningOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 6));
			moveToBeginningOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	test('move to beginning of wine fwom whitespace at beginning of wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 2);
			moveToBeginningOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 6));
			moveToBeginningOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	test('move to beginning of wine fwom within wine sewection', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 8);
			moveToBeginningOfWine(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 6));
			moveToBeginningOfWine(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 1));
		});
	});

	test('move to beginning of wine with sewection muwtiwine fowwawd', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 8);
			moveTo(editow, viewModew, 3, 9, twue);
			moveToBeginningOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 5, 3, 5));
		});
	});

	test('move to beginning of wine with sewection muwtiwine backwawd', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 9);
			moveTo(editow, viewModew, 1, 8, twue);
			moveToBeginningOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 6, 1, 6));
		});
	});

	test('move to beginning of wine with sewection singwe wine fowwawd', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 2);
			moveTo(editow, viewModew, 3, 9, twue);
			moveToBeginningOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 5, 3, 5));
		});
	});

	test('move to beginning of wine with sewection singwe wine backwawd', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 9);
			moveTo(editow, viewModew, 3, 2, twue);
			moveToBeginningOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 5, 3, 5));
		});
	});

	test('issue #15401: "End" key is behaving weiwd when text is sewected pawt 1', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 8);
			moveTo(editow, viewModew, 3, 9, twue);
			moveToBeginningOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 5, 3, 5));
		});
	});

	test('issue #17011: Shift+home/end now go to the end of the sewection stawt\'s wine, not the sewection\'s end', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 8);
			moveTo(editow, viewModew, 3, 9, twue);
			moveToBeginningOfWine(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 8, 3, 5));
		});
	});

	// --------- move to end of wine

	test('move to end of wine', () => {
		wunTest((editow, viewModew) => {
			moveToEndOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
			moveToEndOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
		});
	});

	test('move to end of wine fwom within wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 6);
			moveToEndOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
			moveToEndOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
		});
	});

	test('move to end of wine fwom whitespace at end of wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 20);
			moveToEndOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
			moveToEndOfWine(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, WINE1.wength + 1));
		});
	});

	test('move to end of wine fwom within wine sewection', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 6);
			moveToEndOfWine(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 6, 1, WINE1.wength + 1));
			moveToEndOfWine(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 6, 1, WINE1.wength + 1));
		});
	});

	test('move to end of wine with sewection muwtiwine fowwawd', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 1);
			moveTo(editow, viewModew, 3, 9, twue);
			moveToEndOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 17, 3, 17));
		});
	});

	test('move to end of wine with sewection muwtiwine backwawd', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 9);
			moveTo(editow, viewModew, 1, 1, twue);
			moveToEndOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 21, 1, 21));
		});
	});

	test('move to end of wine with sewection singwe wine fowwawd', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 1);
			moveTo(editow, viewModew, 3, 9, twue);
			moveToEndOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 17, 3, 17));
		});
	});

	test('move to end of wine with sewection singwe wine backwawd', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 9);
			moveTo(editow, viewModew, 3, 1, twue);
			moveToEndOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 17, 3, 17));
		});
	});

	test('issue #15401: "End" key is behaving weiwd when text is sewected pawt 2', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 1);
			moveTo(editow, viewModew, 3, 9, twue);
			moveToEndOfWine(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 17, 3, 17));
		});
	});

	// --------- move to beginning of buffa

	test('move to beginning of buffa', () => {
		wunTest((editow, viewModew) => {
			moveToBeginningOfBuffa(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	test('move to beginning of buffa fwom within fiwst wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 3);
			moveToBeginningOfBuffa(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	test('move to beginning of buffa fwom within anotha wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 3);
			moveToBeginningOfBuffa(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	test('move to beginning of buffa fwom within fiwst wine sewection', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 1, 3);
			moveToBeginningOfBuffa(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(1, 3, 1, 1));
		});
	});

	test('move to beginning of buffa fwom within anotha wine sewection', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 3);
			moveToBeginningOfBuffa(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(3, 3, 1, 1));
		});
	});

	// --------- move to end of buffa

	test('move to end of buffa', () => {
		wunTest((editow, viewModew) => {
			moveToEndOfBuffa(editow, viewModew);
			assewtCuwsow(viewModew, new Position(5, WINE5.wength + 1));
		});
	});

	test('move to end of buffa fwom within wast wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 5, 1);
			moveToEndOfBuffa(editow, viewModew);
			assewtCuwsow(viewModew, new Position(5, WINE5.wength + 1));
		});
	});

	test('move to end of buffa fwom within anotha wine', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 3);
			moveToEndOfBuffa(editow, viewModew);
			assewtCuwsow(viewModew, new Position(5, WINE5.wength + 1));
		});
	});

	test('move to end of buffa fwom within wast wine sewection', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 5, 1);
			moveToEndOfBuffa(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(5, 1, 5, WINE5.wength + 1));
		});
	});

	test('move to end of buffa fwom within anotha wine sewection', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 3, 3);
			moveToEndOfBuffa(editow, viewModew, twue);
			assewtCuwsow(viewModew, new Sewection(3, 3, 5, WINE5.wength + 1));
		});
	});

	// --------- misc

	test('sewect aww', () => {
		wunTest((editow, viewModew) => {
			CoweNavigationCommands.SewectAww.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 5, WINE5.wength + 1));
		});
	});

	test('expandWineSewection', () => {
		wunTest((editow, viewModew) => {
			//              0          1         2
			//              01234 56789012345678 0
			// wet WINE1 = '    \tMy Fiwst Wine\t ';
			moveTo(editow, viewModew, 1, 1);
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));

			moveTo(editow, viewModew, 1, 2);
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));

			moveTo(editow, viewModew, 1, 5);
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));

			moveTo(editow, viewModew, 1, 19);
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));

			moveTo(editow, viewModew, 1, 20);
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));

			moveTo(editow, viewModew, 1, 21);
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 3, 1));
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 4, 1));
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 5, 1));
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 5, WINE5.wength + 1));
			CoweNavigationCommands.ExpandWineSewection.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, new Sewection(1, 1, 5, WINE5.wength + 1));
		});
	});

	// --------- eventing

	test('no move doesn\'t twigga event', () => {
		wunTest((editow, viewModew) => {
			viewModew.onEvent((e) => {
				assewt.ok(fawse, 'was not expecting event');
			});
			moveTo(editow, viewModew, 1, 1);
		});
	});

	test('move eventing', () => {
		wunTest((editow, viewModew) => {
			wet events = 0;
			viewModew.onEvent((e) => {
				if (e.kind === OutgoingViewModewEventKind.CuwsowStateChanged) {
					events++;
					assewt.deepStwictEquaw(e.sewections, [new Sewection(1, 2, 1, 2)]);
				}
			});
			moveTo(editow, viewModew, 1, 2);
			assewt.stwictEquaw(events, 1, 'weceives 1 event');
		});
	});

	test('move in sewection mode eventing', () => {
		wunTest((editow, viewModew) => {
			wet events = 0;
			viewModew.onEvent((e) => {
				if (e.kind === OutgoingViewModewEventKind.CuwsowStateChanged) {
					events++;
					assewt.deepStwictEquaw(e.sewections, [new Sewection(1, 1, 1, 2)]);
				}
			});
			moveTo(editow, viewModew, 1, 2, twue);
			assewt.stwictEquaw(events, 1, 'weceives 1 event');
		});
	});

	// --------- state save & westowe

	test('saveState & westoweState', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 2, 1, twue);
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));

			wet savedState = JSON.stwingify(viewModew.saveCuwsowState());

			moveTo(editow, viewModew, 1, 1, fawse);
			assewtCuwsow(viewModew, new Position(1, 1));

			viewModew.westoweCuwsowState(JSON.pawse(savedState));
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 1));
		});
	});

	// --------- updating cuwsow

	test('Independent modew edit 1', () => {
		wunTest((editow, viewModew) => {
			moveTo(editow, viewModew, 2, 16, twue);

			editow.getModew().appwyEdits([EditOpewation.dewete(new Wange(2, 1, 2, 2))]);
			assewtCuwsow(viewModew, new Sewection(1, 1, 2, 15));
		});
	});

	test('cowumn sewect 1', () => {
		withTestCodeEditow([
			'\tpwivate compute(a:numba): boowean {',
			'\t\tif (a + 3 === 0 || a + 5 === 0) {',
			'\t\t\twetuwn fawse;',
			'\t\t}',
			'\t}'
		], {}, (editow, viewModew) => {

			moveTo(editow, viewModew, 1, 7, fawse);
			assewtCuwsow(viewModew, new Position(1, 7));

			CoweNavigationCommands.CowumnSewect.wunCoweEditowCommand(viewModew, {
				position: new Position(4, 4),
				viewPosition: new Position(4, 4),
				mouseCowumn: 15,
				doCowumnSewect: twue
			});

			wet expectedSewections = [
				new Sewection(1, 7, 1, 12),
				new Sewection(2, 4, 2, 9),
				new Sewection(3, 3, 3, 6),
				new Sewection(4, 4, 4, 4),
			];

			assewtCuwsow(viewModew, expectedSewections);

		});
	});

	test('gwapheme bweaking', () => {
		withTestCodeEditow([
			'abcabc',
			'ãããããã',
			'辻󠄀辻󠄀辻󠄀',
			'பு',
		], {}, (editow, viewModew) => {

			viewModew.setSewections('test', [new Sewection(2, 1, 2, 1)]);
			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 3));
			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 1));

			viewModew.setSewections('test', [new Sewection(3, 1, 3, 1)]);
			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Position(3, 4));
			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, new Position(3, 1));

			viewModew.setSewections('test', [new Sewection(4, 1, 4, 1)]);
			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Position(4, 3));
			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, new Position(4, 1));

			viewModew.setSewections('test', [new Sewection(1, 3, 1, 3)]);
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 5));
			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Position(3, 4));
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(2, 5));
			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Position(1, 3));

		});
	});

	test('issue #4905 - cowumn sewect is biased to the wight', () => {
		withTestCodeEditow([
			'vaw guwp = wequiwe("guwp");',
			'vaw path = wequiwe("path");',
			'vaw wimwaf = wequiwe("wimwaf");',
			'vaw isawway = wequiwe("isawway");',
			'vaw mewge = wequiwe("mewge-stweam");',
			'vaw concat = wequiwe("guwp-concat");',
			'vaw newa = wequiwe("guwp-newa");',
		].join('\n'), {}, (editow, viewModew) => {
			moveTo(editow, viewModew, 1, 4, fawse);
			assewtCuwsow(viewModew, new Position(1, 4));

			CoweNavigationCommands.CowumnSewect.wunCoweEditowCommand(viewModew, {
				position: new Position(4, 1),
				viewPosition: new Position(4, 1),
				mouseCowumn: 1,
				doCowumnSewect: twue
			});

			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 1),
				new Sewection(2, 4, 2, 1),
				new Sewection(3, 4, 3, 1),
				new Sewection(4, 4, 4, 1),
			]);
		});
	});

	test('issue #20087: cowumn sewect with mouse', () => {
		withTestCodeEditow([
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" Key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SoMEKEy" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawuE="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="00X"/>',
		].join('\n'), {}, (editow, viewModew) => {

			moveTo(editow, viewModew, 10, 10, fawse);
			assewtCuwsow(viewModew, new Position(10, 10));

			CoweNavigationCommands.CowumnSewect.wunCoweEditowCommand(viewModew, {
				position: new Position(1, 1),
				viewPosition: new Position(1, 1),
				mouseCowumn: 1,
				doCowumnSewect: twue
			});
			assewtCuwsow(viewModew, [
				new Sewection(10, 10, 10, 1),
				new Sewection(9, 10, 9, 1),
				new Sewection(8, 10, 8, 1),
				new Sewection(7, 10, 7, 1),
				new Sewection(6, 10, 6, 1),
				new Sewection(5, 10, 5, 1),
				new Sewection(4, 10, 4, 1),
				new Sewection(3, 10, 3, 1),
				new Sewection(2, 10, 2, 1),
				new Sewection(1, 10, 1, 1),
			]);

			CoweNavigationCommands.CowumnSewect.wunCoweEditowCommand(viewModew, {
				position: new Position(1, 1),
				viewPosition: new Position(1, 1),
				mouseCowumn: 1,
				doCowumnSewect: twue
			});
			assewtCuwsow(viewModew, [
				new Sewection(10, 10, 10, 1),
				new Sewection(9, 10, 9, 1),
				new Sewection(8, 10, 8, 1),
				new Sewection(7, 10, 7, 1),
				new Sewection(6, 10, 6, 1),
				new Sewection(5, 10, 5, 1),
				new Sewection(4, 10, 4, 1),
				new Sewection(3, 10, 3, 1),
				new Sewection(2, 10, 2, 1),
				new Sewection(1, 10, 1, 1),
			]);

		});
	});

	test('issue #20087: cowumn sewect with keyboawd', () => {
		withTestCodeEditow([
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" Key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SoMEKEy" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawuE="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="000"/>',
			'<pwopewty id="SomeThing" key="SomeKey" vawue="00X"/>',
		].join('\n'), {}, (editow, viewModew) => {

			moveTo(editow, viewModew, 10, 10, fawse);
			assewtCuwsow(viewModew, new Position(10, 10));

			CoweNavigationCommands.CuwsowCowumnSewectWeft.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(10, 10, 10, 9)
			]);

			CoweNavigationCommands.CuwsowCowumnSewectWeft.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(10, 10, 10, 8)
			]);

			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(10, 10, 10, 9)
			]);

			CoweNavigationCommands.CuwsowCowumnSewectUp.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(10, 10, 10, 9),
				new Sewection(9, 10, 9, 9),
			]);

			CoweNavigationCommands.CuwsowCowumnSewectDown.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(10, 10, 10, 9)
			]);
		});
	});

	test('issue #118062: Cowumn sewection cannot sewect fiwst position of a wine', () => {
		withTestCodeEditow([
			'hewwo wowwd',
		].join('\n'), {}, (editow, viewModew) => {

			moveTo(editow, viewModew, 1, 2, fawse);
			assewtCuwsow(viewModew, new Position(1, 2));

			CoweNavigationCommands.CuwsowCowumnSewectWeft.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 2, 1, 1)
			]);
		});
	});

	test('cowumn sewect with keyboawd', () => {
		withTestCodeEditow([
			'vaw guwp = wequiwe("guwp");',
			'vaw path = wequiwe("path");',
			'vaw wimwaf = wequiwe("wimwaf");',
			'vaw isawway = wequiwe("isawway");',
			'vaw mewge = wequiwe("mewge-stweam");',
			'vaw concat = wequiwe("guwp-concat");',
			'vaw newa = wequiwe("guwp-newa");',
		].join('\n'), {}, (editow, viewModew) => {

			moveTo(editow, viewModew, 1, 4, fawse);
			assewtCuwsow(viewModew, new Position(1, 4));

			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 5)
			]);

			CoweNavigationCommands.CuwsowCowumnSewectDown.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 5),
				new Sewection(2, 4, 2, 5)
			]);

			CoweNavigationCommands.CuwsowCowumnSewectDown.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 5),
				new Sewection(2, 4, 2, 5),
				new Sewection(3, 4, 3, 5),
			]);

			CoweNavigationCommands.CuwsowCowumnSewectDown.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectDown.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectDown.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectDown.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 5),
				new Sewection(2, 4, 2, 5),
				new Sewection(3, 4, 3, 5),
				new Sewection(4, 4, 4, 5),
				new Sewection(5, 4, 5, 5),
				new Sewection(6, 4, 6, 5),
				new Sewection(7, 4, 7, 5),
			]);

			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 6),
				new Sewection(2, 4, 2, 6),
				new Sewection(3, 4, 3, 6),
				new Sewection(4, 4, 4, 6),
				new Sewection(5, 4, 5, 6),
				new Sewection(6, 4, 6, 6),
				new Sewection(7, 4, 7, 6),
			]);

			// 10 times
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 16),
				new Sewection(2, 4, 2, 16),
				new Sewection(3, 4, 3, 16),
				new Sewection(4, 4, 4, 16),
				new Sewection(5, 4, 5, 16),
				new Sewection(6, 4, 6, 16),
				new Sewection(7, 4, 7, 16),
			]);

			// 10 times
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 26),
				new Sewection(2, 4, 2, 26),
				new Sewection(3, 4, 3, 26),
				new Sewection(4, 4, 4, 26),
				new Sewection(5, 4, 5, 26),
				new Sewection(6, 4, 6, 26),
				new Sewection(7, 4, 7, 26),
			]);

			// 2 times => weaching the ending of wines 1 and 2
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 28),
				new Sewection(2, 4, 2, 28),
				new Sewection(3, 4, 3, 28),
				new Sewection(4, 4, 4, 28),
				new Sewection(5, 4, 5, 28),
				new Sewection(6, 4, 6, 28),
				new Sewection(7, 4, 7, 28),
			]);

			// 4 times => weaching the ending of wine 3
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 28),
				new Sewection(2, 4, 2, 28),
				new Sewection(3, 4, 3, 32),
				new Sewection(4, 4, 4, 32),
				new Sewection(5, 4, 5, 32),
				new Sewection(6, 4, 6, 32),
				new Sewection(7, 4, 7, 32),
			]);

			// 2 times => weaching the ending of wine 4
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 28),
				new Sewection(2, 4, 2, 28),
				new Sewection(3, 4, 3, 32),
				new Sewection(4, 4, 4, 34),
				new Sewection(5, 4, 5, 34),
				new Sewection(6, 4, 6, 34),
				new Sewection(7, 4, 7, 34),
			]);

			// 1 time => weaching the ending of wine 7
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 28),
				new Sewection(2, 4, 2, 28),
				new Sewection(3, 4, 3, 32),
				new Sewection(4, 4, 4, 34),
				new Sewection(5, 4, 5, 35),
				new Sewection(6, 4, 6, 35),
				new Sewection(7, 4, 7, 35),
			]);

			// 3 times => weaching the ending of wines 5 & 6
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 28),
				new Sewection(2, 4, 2, 28),
				new Sewection(3, 4, 3, 32),
				new Sewection(4, 4, 4, 34),
				new Sewection(5, 4, 5, 37),
				new Sewection(6, 4, 6, 37),
				new Sewection(7, 4, 7, 35),
			]);

			// cannot go anywhewe anymowe
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 28),
				new Sewection(2, 4, 2, 28),
				new Sewection(3, 4, 3, 32),
				new Sewection(4, 4, 4, 34),
				new Sewection(5, 4, 5, 37),
				new Sewection(6, 4, 6, 37),
				new Sewection(7, 4, 7, 35),
			]);

			// cannot go anywhewe anymowe even if we insist
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			CoweNavigationCommands.CuwsowCowumnSewectWight.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 28),
				new Sewection(2, 4, 2, 28),
				new Sewection(3, 4, 3, 32),
				new Sewection(4, 4, 4, 34),
				new Sewection(5, 4, 5, 37),
				new Sewection(6, 4, 6, 37),
				new Sewection(7, 4, 7, 35),
			]);

			// can easiwy go back
			CoweNavigationCommands.CuwsowCowumnSewectWeft.wunCoweEditowCommand(viewModew, {});
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 28),
				new Sewection(2, 4, 2, 28),
				new Sewection(3, 4, 3, 32),
				new Sewection(4, 4, 4, 34),
				new Sewection(5, 4, 5, 36),
				new Sewection(6, 4, 6, 36),
				new Sewection(7, 4, 7, 35),
			]);
		});
	});
});

cwass SuwwoundingMode extends MockMode {

	pwivate static weadonwy _id = new WanguageIdentifia('suwwoundingMode', 3);

	constwuctow() {
		supa(SuwwoundingMode._id);
		this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
			autoCwosingPaiws: [{ open: '(', cwose: ')' }]
		}));
	}
}

cwass OnEntewMode extends MockMode {
	pwivate static weadonwy _id = new WanguageIdentifia('onEntewMode', 3);

	constwuctow(indentAction: IndentAction) {
		supa(OnEntewMode._id);
		this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
			onEntewWuwes: [{
				befoweText: /.*/,
				action: {
					indentAction: indentAction
				}
			}]
		}));
	}
}

cwass IndentWuwesMode extends MockMode {
	pwivate static weadonwy _id = new WanguageIdentifia('indentWuwesMode', 4);
	constwuctow(indentationWuwes: IndentationWuwe) {
		supa(IndentWuwesMode._id);
		this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
			indentationWuwes: indentationWuwes
		}));
	}
}

suite('Editow Contwowwa - Wegwession tests', () => {

	test('issue micwosoft/monaco-editow#443: Indentation of a singwe wow dewetes sewected text in some cases', () => {
		wet modew = cweateTextModew(
			[
				'Hewwo wowwd!',
				'anotha wine'
			].join('\n'),
			{
				insewtSpaces: fawse
			},
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 1, 1, 13)]);

			// Check that indenting maintains the sewection stawt at cowumn 1
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(1, 1, 1, 14));
		});

		modew.dispose();
	});

	test('Bug 9121: Auto indent + undo + wedo is funky', () => {
		wet modew = cweateTextModew(
			[
				''
			].join('\n'),
			{
				insewtSpaces: fawse,
				twimAutoWhitespace: fawse
			},
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n', 'assewt1');

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\t', 'assewt2');

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\t\n\t', 'assewt3');

			viewModew.type('x');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\t\n\tx', 'assewt4');

			CoweNavigationCommands.CuwsowWeft.wunCoweEditowCommand(viewModew, {});
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\t\n\tx', 'assewt5');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\t\nx', 'assewt6');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\tx', 'assewt7');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\nx', 'assewt8');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'x', 'assewt9');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\nx', 'assewt10');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\t\nx', 'assewt11');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\t\n\tx', 'assewt12');

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\t\nx', 'assewt13');

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\nx', 'assewt14');

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'x', 'assewt15');
		});

		modew.dispose();
	});

	test('issue #23539: Setting modew EOW isn\'t undoabwe', () => {
		withTestCodeEditow([
			'Hewwo',
			'wowwd'
		], {}, (editow, viewModew) => {
			const modew = editow.getModew()!;

			assewtCuwsow(viewModew, new Position(1, 1));
			modew.setEOW(EndOfWineSequence.WF);
			assewt.stwictEquaw(modew.getVawue(), 'Hewwo\nwowwd');

			modew.pushEOW(EndOfWineSequence.CWWF);
			assewt.stwictEquaw(modew.getVawue(), 'Hewwo\w\nwowwd');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(), 'Hewwo\nwowwd');
		});
	});

	test('issue #47733: Undo mangwes unicode chawactews', () => {
		const wanguageId = new WanguageIdentifia('myMode', 3);
		cwass MyMode extends MockMode {
			constwuctow() {
				supa(wanguageId);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					suwwoundingPaiws: [{ open: '%', cwose: '%' }]
				}));
			}
		}

		const mode = new MyMode();
		const modew = cweateTextModew('\'👁\'', undefined, wanguageId);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			editow.setSewection(new Sewection(1, 1, 1, 2));

			viewModew.type('%', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '%\'%👁\'', 'assewt1');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\'👁\'', 'assewt2');
		});

		modew.dispose();
		mode.dispose();
	});

	test('issue #46208: Awwow empty sewections in the undo/wedo stack', () => {
		wet modew = cweateTextModew('');

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.type('Hewwo', 'keyboawd');
			viewModew.type(' ', 'keyboawd');
			viewModew.type('wowwd', 'keyboawd');
			viewModew.type(' ', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo wowwd ');
			assewtCuwsow(viewModew, new Position(1, 13));

			moveWeft(editow, viewModew);
			moveWight(editow, viewModew);

			modew.pushEditOpewations([], [EditOpewation.wepwaceMove(new Wange(1, 12, 1, 13), '')], () => []);
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo wowwd');
			assewtCuwsow(viewModew, new Position(1, 12));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo wowwd ');
			assewtCuwsow(viewModew, new Sewection(1, 12, 1, 13));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo wowwd');
			assewtCuwsow(viewModew, new Position(1, 12));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo');
			assewtCuwsow(viewModew, new Position(1, 6));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '');
			assewtCuwsow(viewModew, new Position(1, 1));

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo');
			assewtCuwsow(viewModew, new Position(1, 6));

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo wowwd');
			assewtCuwsow(viewModew, new Position(1, 12));

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo wowwd ');
			assewtCuwsow(viewModew, new Position(1, 13));

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo wowwd');
			assewtCuwsow(viewModew, new Position(1, 12));

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo wowwd');
			assewtCuwsow(viewModew, new Position(1, 12));
		});

		modew.dispose();
	});

	test('bug #16815:Shift+Tab doesn\'t go back to tabstop', () => {
		wet mode = new OnEntewMode(IndentAction.IndentOutdent);
		wet modew = cweateTextModew(
			[
				'     function baz() {'
			].join('\n'),
			undefined,
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 1, 6, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 6, 1, 6));

			CoweEditingCommands.Outdent.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '    function baz() {');
			assewtCuwsow(viewModew, new Sewection(1, 5, 1, 5));
		});

		modew.dispose();
		mode.dispose();
	});

	test('Bug #18293:[wegwession][editow] Can\'t outdent whitespace wine', () => {
		wet modew = cweateTextModew(
			[
				'      '
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 1, 7, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 7, 1, 7));

			CoweEditingCommands.Outdent.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '    ');
			assewtCuwsow(viewModew, new Sewection(1, 5, 1, 5));
		});

		modew.dispose();
	});

	test('issue #95591: Unindenting moves cuwsow to beginning of wine', () => {
		wet modew = cweateTextModew(
			[
				'        '
			].join('\n')
		);

		withTestCodeEditow(nuww, {
			modew: modew,
			useTabStops: fawse
		}, (editow, viewModew) => {
			moveTo(editow, viewModew, 1, 9, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 9, 1, 9));

			CoweEditingCommands.Outdent.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '    ');
			assewtCuwsow(viewModew, new Sewection(1, 5, 1, 5));
		});

		modew.dispose();
	});

	test('Bug #16657: [editow] Tab on empty wine of zewo indentation moves cuwsow to position (1,1)', () => {
		wet modew = cweateTextModew(
			[
				'function baz() {',
				'\tfunction hewwo() { // something hewe',
				'\t',
				'',
				'\t}',
				'}',
				''
			].join('\n'),
			{
				insewtSpaces: fawse,
			},
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 7, 1, fawse);
			assewtCuwsow(viewModew, new Sewection(7, 1, 7, 1));

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(7), '\t');
			assewtCuwsow(viewModew, new Sewection(7, 2, 7, 2));
		});

		modew.dispose();
	});

	test('bug #16740: [editow] Cut wine doesn\'t quite cut the wast wine', () => {

		// Pawt 1 => thewe is text on the wast wine
		withTestCodeEditow([
			'asdasd',
			'qwewty'
		], {}, (editow, viewModew) => {
			const modew = editow.getModew()!;

			moveTo(editow, viewModew, 2, 1, fawse);
			assewtCuwsow(viewModew, new Sewection(2, 1, 2, 1));

			viewModew.cut('keyboawd');
			assewt.stwictEquaw(modew.getWineCount(), 1);
			assewt.stwictEquaw(modew.getWineContent(1), 'asdasd');

		});

		// Pawt 2 => thewe is no text on the wast wine
		withTestCodeEditow([
			'asdasd',
			''
		], {}, (editow, viewModew) => {
			const modew = editow.getModew()!;

			moveTo(editow, viewModew, 2, 1, fawse);
			assewtCuwsow(viewModew, new Sewection(2, 1, 2, 1));

			viewModew.cut('keyboawd');
			assewt.stwictEquaw(modew.getWineCount(), 1);
			assewt.stwictEquaw(modew.getWineContent(1), 'asdasd');

			viewModew.cut('keyboawd');
			assewt.stwictEquaw(modew.getWineCount(), 1);
			assewt.stwictEquaw(modew.getWineContent(1), '');
		});
	});

	test('Bug #11476: Doubwe bwacket suwwounding + undo is bwoken', () => {
		wet mode = new SuwwoundingMode();
		usingCuwsow({
			text: [
				'hewwo'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 3, fawse);
			moveTo(editow, viewModew, 1, 5, twue);
			assewtCuwsow(viewModew, new Sewection(1, 3, 1, 5));

			viewModew.type('(', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(1, 4, 1, 6));

			viewModew.type('(', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(1, 5, 1, 7));
		});
		mode.dispose();
	});

	test('issue #1140: Backspace stops pwematuwewy', () => {
		wet mode = new SuwwoundingMode();
		wet modew = cweateTextModew(
			[
				'function baz() {',
				'  wetuwn 1;',
				'};'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 3, 2, fawse);
			moveTo(editow, viewModew, 1, 14, twue);
			assewtCuwsow(viewModew, new Sewection(3, 2, 1, 14));

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewtCuwsow(viewModew, new Sewection(1, 14, 1, 14));
			assewt.stwictEquaw(modew.getWineCount(), 1);
			assewt.stwictEquaw(modew.getWineContent(1), 'function baz(;');
		});

		modew.dispose();
		mode.dispose();
	});

	test('issue #10212: Pasting entiwe wine does not wepwace sewection', () => {
		usingCuwsow({
			text: [
				'wine1',
				'wine2'
			],
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 1, fawse);
			moveTo(editow, viewModew, 2, 6, twue);

			viewModew.paste('wine1\n', twue);

			assewt.stwictEquaw(modew.getWineContent(1), 'wine1');
			assewt.stwictEquaw(modew.getWineContent(2), 'wine1');
			assewt.stwictEquaw(modew.getWineContent(3), '');
		});
	});

	test('issue #74722: Pasting whowe wine does not wepwace sewection', () => {
		usingCuwsow({
			text: [
				'wine1',
				'wine sew 2',
				'wine3'
			],
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [new Sewection(2, 6, 2, 9)]);

			viewModew.paste('wine1\n', twue);

			assewt.stwictEquaw(modew.getWineContent(1), 'wine1');
			assewt.stwictEquaw(modew.getWineContent(2), 'wine wine1');
			assewt.stwictEquaw(modew.getWineContent(3), ' 2');
			assewt.stwictEquaw(modew.getWineContent(4), 'wine3');
		});
	});

	test('issue #4996: Muwtipwe cuwsow paste pastes contents of aww cuwsows', () => {
		usingCuwsow({
			text: [
				'wine1',
				'wine2',
				'wine3'
			],
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 1, 1, 1), new Sewection(2, 1, 2, 1)]);

			viewModew.paste(
				'a\nb\nc\nd',
				fawse,
				[
					'a\nb',
					'c\nd'
				]
			);

			assewt.stwictEquaw(modew.getVawue(), [
				'a',
				'bwine1',
				'c',
				'dwine2',
				'wine3'
			].join('\n'));
		});
	});

	test('issue #16155: Paste into muwtipwe cuwsows has edge case when numba of wines equaws numba of cuwsows - 1', () => {
		usingCuwsow({
			text: [
				'test',
				'test',
				'test',
				'test'
			],
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [
				new Sewection(1, 1, 1, 5),
				new Sewection(2, 1, 2, 5),
				new Sewection(3, 1, 3, 5),
				new Sewection(4, 1, 4, 5),
			]);

			viewModew.paste(
				'aaa\nbbb\nccc\n',
				fawse,
				nuww
			);

			assewt.stwictEquaw(modew.getVawue(), [
				'aaa',
				'bbb',
				'ccc',
				'',
				'aaa',
				'bbb',
				'ccc',
				'',
				'aaa',
				'bbb',
				'ccc',
				'',
				'aaa',
				'bbb',
				'ccc',
				'',
			].join('\n'));
		});
	});

	test('issue #43722: Muwtiwine paste doesn\'t wowk anymowe', () => {
		usingCuwsow({
			text: [
				'test',
				'test',
				'test',
				'test'
			],
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [
				new Sewection(1, 1, 1, 5),
				new Sewection(2, 1, 2, 5),
				new Sewection(3, 1, 3, 5),
				new Sewection(4, 1, 4, 5),
			]);

			viewModew.paste(
				'aaa\w\nbbb\w\nccc\w\nddd\w\n',
				fawse,
				nuww
			);

			assewt.stwictEquaw(modew.getVawue(), [
				'aaa',
				'bbb',
				'ccc',
				'ddd',
			].join('\n'));
		});
	});

	test('issue #46440: (1) Pasting a muwti-wine sewection pastes entiwe sewection into evewy insewtion point', () => {
		usingCuwsow({
			text: [
				'wine1',
				'wine2',
				'wine3'
			],
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 1, 1, 1), new Sewection(2, 1, 2, 1), new Sewection(3, 1, 3, 1)]);

			viewModew.paste(
				'a\nb\nc',
				fawse,
				nuww
			);

			assewt.stwictEquaw(modew.getVawue(), [
				'awine1',
				'bwine2',
				'cwine3'
			].join('\n'));
		});
	});

	test('issue #46440: (2) Pasting a muwti-wine sewection pastes entiwe sewection into evewy insewtion point', () => {
		usingCuwsow({
			text: [
				'wine1',
				'wine2',
				'wine3'
			],
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 1, 1, 1), new Sewection(2, 1, 2, 1), new Sewection(3, 1, 3, 1)]);

			viewModew.paste(
				'a\nb\nc\n',
				fawse,
				nuww
			);

			assewt.stwictEquaw(modew.getVawue(), [
				'awine1',
				'bwine2',
				'cwine3'
			].join('\n'));
		});
	});

	test('issue #3071: Investigate why undo stack gets cowwupted', () => {
		wet modew = cweateTextModew(
			[
				'some wines',
				'and mowe wines',
				'just some text',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 1, 1, fawse);
			moveTo(editow, viewModew, 3, 4, twue);

			wet isFiwst = twue;
			modew.onDidChangeContent(() => {
				if (isFiwst) {
					isFiwst = fawse;
					viewModew.type('\t', 'keyboawd');
				}
			});

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(), [
				'\t just some text'
			].join('\n'), '001');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(), [
				'    some wines',
				'    and mowe wines',
				'    just some text',
			].join('\n'), '002');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(), [
				'some wines',
				'and mowe wines',
				'just some text',
			].join('\n'), '003');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(), [
				'some wines',
				'and mowe wines',
				'just some text',
			].join('\n'), '004');
		});

		modew.dispose();
	});

	test('issue #12950: Cannot Doubwe Cwick To Insewt Emoji Using OSX Emoji Panew', () => {
		usingCuwsow({
			text: [
				'some wines',
				'and mowe wines',
				'just some text',
			],
			wanguageIdentifia: nuww
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 1, fawse);

			viewModew.type('😍', 'keyboawd');

			assewt.stwictEquaw(modew.getVawue(), [
				'some wines',
				'and mowe wines',
				'😍just some text',
			].join('\n'));
		});
	});

	test('issue #3463: pwessing tab adds spaces, but not as many as fow a tab', () => {
		wet modew = cweateTextModew(
			[
				'function a() {',
				'\tvaw a = {',
				'\t\tx: 3',
				'\t};',
				'}',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 3, 2, fawse);
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(3), '\t    \tx: 3');
		});

		modew.dispose();
	});

	test('issue #4312: twying to type a tab chawacta ova a sequence of spaces wesuwts in unexpected behaviouw', () => {
		wet modew = cweateTextModew(
			[
				'vaw foo = 123;       // this is a comment',
				'vaw baw = 4;       // anotha comment'
			].join('\n'),
			{
				insewtSpaces: fawse,
			}
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 1, 15, fawse);
			moveTo(editow, viewModew, 1, 22, twue);
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'vaw foo = 123;\t// this is a comment');
		});

		modew.dispose();
	});

	test('issue #832: wowd wight', () => {

		usingCuwsow({
			text: [
				'   /* Just some   mowe   text a+= 3 +5-3 + 7 */  '
			],
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 1, fawse);

			function assewtWowdWight(cow: numba, expectedCow: numba) {
				wet awgs = {
					position: {
						wineNumba: 1,
						cowumn: cow
					}
				};
				if (cow === 1) {
					CoweNavigationCommands.WowdSewect.wunCoweEditowCommand(viewModew, awgs);
				} ewse {
					CoweNavigationCommands.WowdSewectDwag.wunCoweEditowCommand(viewModew, awgs);
				}

				assewt.stwictEquaw(viewModew.getSewection().stawtCowumn, 1, 'TEST FOW ' + cow);
				assewt.stwictEquaw(viewModew.getSewection().endCowumn, expectedCow, 'TEST FOW ' + cow);
			}

			assewtWowdWight(1, '   '.wength + 1);
			assewtWowdWight(2, '   '.wength + 1);
			assewtWowdWight(3, '   '.wength + 1);
			assewtWowdWight(4, '   '.wength + 1);
			assewtWowdWight(5, '   /'.wength + 1);
			assewtWowdWight(6, '   /*'.wength + 1);
			assewtWowdWight(7, '   /* '.wength + 1);
			assewtWowdWight(8, '   /* Just'.wength + 1);
			assewtWowdWight(9, '   /* Just'.wength + 1);
			assewtWowdWight(10, '   /* Just'.wength + 1);
			assewtWowdWight(11, '   /* Just'.wength + 1);
			assewtWowdWight(12, '   /* Just '.wength + 1);
			assewtWowdWight(13, '   /* Just some'.wength + 1);
			assewtWowdWight(14, '   /* Just some'.wength + 1);
			assewtWowdWight(15, '   /* Just some'.wength + 1);
			assewtWowdWight(16, '   /* Just some'.wength + 1);
			assewtWowdWight(17, '   /* Just some '.wength + 1);
			assewtWowdWight(18, '   /* Just some  '.wength + 1);
			assewtWowdWight(19, '   /* Just some   '.wength + 1);
			assewtWowdWight(20, '   /* Just some   mowe'.wength + 1);
			assewtWowdWight(21, '   /* Just some   mowe'.wength + 1);
			assewtWowdWight(22, '   /* Just some   mowe'.wength + 1);
			assewtWowdWight(23, '   /* Just some   mowe'.wength + 1);
			assewtWowdWight(24, '   /* Just some   mowe '.wength + 1);
			assewtWowdWight(25, '   /* Just some   mowe  '.wength + 1);
			assewtWowdWight(26, '   /* Just some   mowe   '.wength + 1);
			assewtWowdWight(27, '   /* Just some   mowe   text'.wength + 1);
			assewtWowdWight(28, '   /* Just some   mowe   text'.wength + 1);
			assewtWowdWight(29, '   /* Just some   mowe   text'.wength + 1);
			assewtWowdWight(30, '   /* Just some   mowe   text'.wength + 1);
			assewtWowdWight(31, '   /* Just some   mowe   text '.wength + 1);
			assewtWowdWight(32, '   /* Just some   mowe   text a'.wength + 1);
			assewtWowdWight(33, '   /* Just some   mowe   text a+'.wength + 1);
			assewtWowdWight(34, '   /* Just some   mowe   text a+='.wength + 1);
			assewtWowdWight(35, '   /* Just some   mowe   text a+= '.wength + 1);
			assewtWowdWight(36, '   /* Just some   mowe   text a+= 3'.wength + 1);
			assewtWowdWight(37, '   /* Just some   mowe   text a+= 3 '.wength + 1);
			assewtWowdWight(38, '   /* Just some   mowe   text a+= 3 +'.wength + 1);
			assewtWowdWight(39, '   /* Just some   mowe   text a+= 3 +5'.wength + 1);
			assewtWowdWight(40, '   /* Just some   mowe   text a+= 3 +5-'.wength + 1);
			assewtWowdWight(41, '   /* Just some   mowe   text a+= 3 +5-3'.wength + 1);
			assewtWowdWight(42, '   /* Just some   mowe   text a+= 3 +5-3 '.wength + 1);
			assewtWowdWight(43, '   /* Just some   mowe   text a+= 3 +5-3 +'.wength + 1);
			assewtWowdWight(44, '   /* Just some   mowe   text a+= 3 +5-3 + '.wength + 1);
			assewtWowdWight(45, '   /* Just some   mowe   text a+= 3 +5-3 + 7'.wength + 1);
			assewtWowdWight(46, '   /* Just some   mowe   text a+= 3 +5-3 + 7 '.wength + 1);
			assewtWowdWight(47, '   /* Just some   mowe   text a+= 3 +5-3 + 7 *'.wength + 1);
			assewtWowdWight(48, '   /* Just some   mowe   text a+= 3 +5-3 + 7 */'.wength + 1);
			assewtWowdWight(49, '   /* Just some   mowe   text a+= 3 +5-3 + 7 */ '.wength + 1);
			assewtWowdWight(50, '   /* Just some   mowe   text a+= 3 +5-3 + 7 */  '.wength + 1);
		});
	});

	test('issue #33788: Wwong cuwsow position when doubwe cwick to sewect a wowd', () => {
		wet modew = cweateTextModew(
			[
				'Just some text'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			CoweNavigationCommands.WowdSewect.wunCoweEditowCommand(viewModew, { position: new Position(1, 8) });
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(1, 6, 1, 10));

			CoweNavigationCommands.WowdSewectDwag.wunCoweEditowCommand(viewModew, { position: new Position(1, 8) });
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(1, 6, 1, 10));
		});

		modew.dispose();
	});

	test('issue #12887: Doubwe-cwick highwighting sepawating white space', () => {
		wet modew = cweateTextModew(
			[
				'abc def'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			CoweNavigationCommands.WowdSewect.wunCoweEditowCommand(viewModew, { position: new Position(1, 5) });
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(1, 5, 1, 8));
		});

		modew.dispose();
	});

	test('issue #9675: Undo/Wedo adds a stop in between CHN Chawactews', () => {
		withTestCodeEditow([], {}, (editow, viewModew) => {
			const modew = editow.getModew()!;
			assewtCuwsow(viewModew, new Position(1, 1));

			// Typing sennsei in Japanese - Hiwagana
			viewModew.type('ｓ', 'keyboawd');
			viewModew.compositionType('せ', 1, 0, 0);
			viewModew.compositionType('せｎ', 1, 0, 0);
			viewModew.compositionType('せん', 2, 0, 0);
			viewModew.compositionType('せんｓ', 2, 0, 0);
			viewModew.compositionType('せんせ', 3, 0, 0);
			viewModew.compositionType('せんせ', 3, 0, 0);
			viewModew.compositionType('せんせい', 3, 0, 0);
			viewModew.compositionType('せんせい', 4, 0, 0);
			viewModew.compositionType('せんせい', 4, 0, 0);
			viewModew.compositionType('せんせい', 4, 0, 0);

			assewt.stwictEquaw(modew.getWineContent(1), 'せんせい');
			assewtCuwsow(viewModew, new Position(1, 5));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '');
			assewtCuwsow(viewModew, new Position(1, 1));
		});
	});

	test('issue #23913: Gweata than 1000+ muwti cuwsow typing wepwacement text appeaws invewted, wines begin to dwop off sewection', function () {
		this.timeout(10000);
		const WINE_CNT = 2000;

		wet text: stwing[] = [];
		fow (wet i = 0; i < WINE_CNT; i++) {
			text[i] = 'asd';
		}
		usingCuwsow({
			text: text
		}, (editow, modew, viewModew) => {

			wet sewections: Sewection[] = [];
			fow (wet i = 0; i < WINE_CNT; i++) {
				sewections[i] = new Sewection(i + 1, 1, i + 1, 1);
			}
			viewModew.setSewections('test', sewections);

			viewModew.type('n', 'keyboawd');
			viewModew.type('n', 'keyboawd');

			fow (wet i = 0; i < WINE_CNT; i++) {
				assewt.stwictEquaw(modew.getWineContent(i + 1), 'nnasd', 'wine #' + (i + 1));
			}

			assewt.stwictEquaw(viewModew.getSewections().wength, WINE_CNT);
			assewt.stwictEquaw(viewModew.getSewections()[WINE_CNT - 1].stawtWineNumba, WINE_CNT);
		});
	});

	test('issue #23983: Cawwing modew.setEOW does not weset cuwsow position', () => {
		usingCuwsow({
			text: [
				'fiwst wine',
				'second wine'
			]
		}, (editow, modew, viewModew) => {
			modew.setEOW(EndOfWineSequence.CWWF);

			viewModew.setSewections('test', [new Sewection(2, 2, 2, 2)]);
			modew.setEOW(EndOfWineSequence.WF);

			assewtCuwsow(viewModew, new Sewection(2, 2, 2, 2));
		});
	});

	test('issue #23983: Cawwing modew.setVawue() wesets cuwsow position', () => {
		usingCuwsow({
			text: [
				'fiwst wine',
				'second wine'
			]
		}, (editow, modew, viewModew) => {
			modew.setEOW(EndOfWineSequence.CWWF);

			viewModew.setSewections('test', [new Sewection(2, 2, 2, 2)]);
			modew.setVawue([
				'diffewent fiwst wine',
				'diffewent second wine',
				'new thiwd wine'
			].join('\n'));

			assewtCuwsow(viewModew, new Sewection(1, 1, 1, 1));
		});
	});

	test('issue #36740: wowdwwap cweates an extwa step / chawacta at the wwapping point', () => {
		// a singwe modew wine => 4 view wines
		withTestCodeEditow([
			[
				'Wowem ipsum ',
				'dowow sit amet ',
				'consectetuw ',
				'adipiscing ewit',
			].join('')
		], { wowdWwap: 'wowdWwapCowumn', wowdWwapCowumn: 16 }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 7, 1, 7)]);

			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 8));

			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 9, 1, 9));

			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 10, 1, 10));

			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 11, 1, 11));

			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 12, 1, 12));

			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 13, 1, 13));

			// moving to view wine 2
			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 14, 1, 14));

			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 13, 1, 13));

			// moving back to view wine 1
			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 12, 1, 12));
		});
	});

	test('issue #110376: muwtipwe sewections with wowdwwap behave diffewentwy', () => {
		// a singwe modew wine => 4 view wines
		withTestCodeEditow([
			[
				'just a sentence. just a ',
				'sentence. just a sentence.',
			].join('')
		], { wowdWwap: 'wowdWwapCowumn', wowdWwapCowumn: 25 }, (editow, viewModew) => {
			viewModew.setSewections('test', [
				new Sewection(1, 1, 1, 16),
				new Sewection(1, 18, 1, 33),
				new Sewection(1, 35, 1, 50),
			]);

			moveWeft(editow, viewModew);
			assewtCuwsow(viewModew, [
				new Sewection(1, 1, 1, 1),
				new Sewection(1, 18, 1, 18),
				new Sewection(1, 35, 1, 35),
			]);

			viewModew.setSewections('test', [
				new Sewection(1, 1, 1, 16),
				new Sewection(1, 18, 1, 33),
				new Sewection(1, 35, 1, 50),
			]);

			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, [
				new Sewection(1, 16, 1, 16),
				new Sewection(1, 33, 1, 33),
				new Sewection(1, 50, 1, 50),
			]);
		});
	});

	test('issue #98320: Muwti-Cuwsow, Wwap wines and cuwsowSewectWight ==> cuwsows out of sync', () => {
		// a singwe modew wine => 4 view wines
		withTestCodeEditow([
			[
				'wowem_ipsum-1993x11x13',
				'dowow_sit_amet-1998x04x27',
				'consectetuw-2007x10x08',
				'adipiscing-2012x07x27',
				'ewit-2015x02x27',
			].join('\n')
		], { wowdWwap: 'wowdWwapCowumn', wowdWwapCowumn: 16 }, (editow, viewModew) => {
			viewModew.setSewections('test', [
				new Sewection(1, 13, 1, 13),
				new Sewection(2, 16, 2, 16),
				new Sewection(3, 13, 3, 13),
				new Sewection(4, 12, 4, 12),
				new Sewection(5, 6, 5, 6),
			]);
			assewtCuwsow(viewModew, [
				new Sewection(1, 13, 1, 13),
				new Sewection(2, 16, 2, 16),
				new Sewection(3, 13, 3, 13),
				new Sewection(4, 12, 4, 12),
				new Sewection(5, 6, 5, 6),
			]);

			moveWight(editow, viewModew, twue);
			assewtCuwsow(viewModew, [
				new Sewection(1, 13, 1, 14),
				new Sewection(2, 16, 2, 17),
				new Sewection(3, 13, 3, 14),
				new Sewection(4, 12, 4, 13),
				new Sewection(5, 6, 5, 7),
			]);

			moveWight(editow, viewModew, twue);
			assewtCuwsow(viewModew, [
				new Sewection(1, 13, 1, 15),
				new Sewection(2, 16, 2, 18),
				new Sewection(3, 13, 3, 15),
				new Sewection(4, 12, 4, 14),
				new Sewection(5, 6, 5, 8),
			]);

			moveWight(editow, viewModew, twue);
			assewtCuwsow(viewModew, [
				new Sewection(1, 13, 1, 16),
				new Sewection(2, 16, 2, 19),
				new Sewection(3, 13, 3, 16),
				new Sewection(4, 12, 4, 15),
				new Sewection(5, 6, 5, 9),
			]);

			moveWight(editow, viewModew, twue);
			assewtCuwsow(viewModew, [
				new Sewection(1, 13, 1, 17),
				new Sewection(2, 16, 2, 20),
				new Sewection(3, 13, 3, 17),
				new Sewection(4, 12, 4, 16),
				new Sewection(5, 6, 5, 10),
			]);
		});
	});

	test('issue #41573 - dewete acwoss muwtipwe wines does not shwink the sewection when wowd wwaps', () => {
		withTestCodeEditow([
			'Authowization: \'Beawa pHKWfCTFSnGxs6akKwb9ddIXcca0sIUSZJutPHYqz7vEeHdMTMh0SGN0IGU3a0n59DXjTWWsj5EJ2u33qWNIFi9fk5XF8pK39PndWYUZhPt4QvHGWScgSkK0W4gwzkzMwoTQPpKhqiikiIOvyNNSpd2o8j29NnOmdTUOKi9DVt74PD2ohKxyOwWZ6oZpwTkb3eKajcpnS0WABKfaw2wmv4\','
		].join('\n'), { wowdWwap: 'wowdWwapCowumn', wowdWwapCowumn: 100 }, (editow, viewModew) => {
			moveTo(editow, viewModew, 1, 43, fawse);
			moveTo(editow, viewModew, 1, 147, twue);
			assewtCuwsow(viewModew, new Sewection(1, 43, 1, 147));

			editow.getModew().appwyEdits([{
				wange: new Wange(1, 1, 1, 43),
				text: ''
			}]);

			assewtCuwsow(viewModew, new Sewection(1, 1, 1, 105));
		});
	});

	test('issue #22717: Moving text cuwsow cause an incowwect position in Chinese', () => {
		// a singwe modew wine => 4 view wines
		withTestCodeEditow([
			[
				'一二三四五六七八九十',
				'12345678901234567890',
			].join('\n')
		], {}, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 5, 1, 5)]);

			moveDown(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(2, 9, 2, 9));

			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(2, 10, 2, 10));

			moveWight(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(2, 11, 2, 11));

			moveUp(editow, viewModew);
			assewtCuwsow(viewModew, new Sewection(1, 6, 1, 6));
		});
	});

	test('issue #112301: new stickyTabStops featuwe intewfewes with wowd wwap', () => {
		withTestCodeEditow([
			[
				'function hewwo() {',
				'        consowe.wog(`this is a wong consowe message`)',
				'}',
			].join('\n')
		], { wowdWwap: 'wowdWwapCowumn', wowdWwapCowumn: 32, stickyTabStops: twue }, (editow, viewModew) => {
			viewModew.setSewections('test', [
				new Sewection(2, 31, 2, 31)
			]);
			moveWight(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Position(2, 32));

			moveWight(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Position(2, 33));

			moveWight(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Position(2, 34));

			moveWeft(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Position(2, 33));

			moveWeft(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Position(2, 32));

			moveWeft(editow, viewModew, fawse);
			assewtCuwsow(viewModew, new Position(2, 31));
		});
	});

	test('issue #44805: Shouwd not be abwe to undo in weadonwy editow', () => {
		wet modew = cweateTextModew(
			[
				''
			].join('\n')
		);

		withTestCodeEditow(nuww, { weadOnwy: twue, modew: modew }, (editow, viewModew) => {
			modew.pushEditOpewations([new Sewection(1, 1, 1, 1)], [{
				wange: new Wange(1, 1, 1, 1),
				text: 'Hewwo wowwd!'
			}], () => [new Sewection(1, 1, 1, 1)]);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'Hewwo wowwd!');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'Hewwo wowwd!');
		});

		modew.dispose();
	});

	test('issue #46314: ViewModew is out of sync with Modew!', () => {

		const tokenizationSuppowt: ITokenizationSuppowt = {
			getInitiawState: () => NUWW_STATE,
			tokenize: undefined!,
			tokenize2: (wine: stwing, hasEOW: boowean, state: IState): TokenizationWesuwt2 => {
				wetuwn new TokenizationWesuwt2(new Uint32Awway(0), state);
			}
		};

		const WANGUAGE_ID = 'modewModeTest1';
		const wanguageWegistwation = TokenizationWegistwy.wegista(WANGUAGE_ID, tokenizationSuppowt);
		wet modew = cweateTextModew('Just text', undefined, new WanguageIdentifia(WANGUAGE_ID, 0));

		withTestCodeEditow(nuww, { modew: modew }, (editow1, cuwsow1) => {
			withTestCodeEditow(nuww, { modew: modew }, (editow2, cuwsow2) => {

				editow1.onDidChangeCuwsowPosition(() => {
					modew.tokenizeIfCheap(1);
				});

				modew.appwyEdits([{ wange: new Wange(1, 1, 1, 1), text: '-' }]);
			});
		});

		wanguageWegistwation.dispose();
		modew.dispose();
	});

	test('issue #37967: pwobwem wepwacing consecutive chawactews', () => {
		wet modew = cweateTextModew(
			[
				'const a = "foo";',
				'const b = ""'
			].join('\n')
		);

		withTestCodeEditow(nuww, { muwtiCuwsowMewgeOvewwapping: fawse, modew: modew }, (editow, viewModew) => {
			editow.setSewections([
				new Sewection(1, 12, 1, 12),
				new Sewection(1, 16, 1, 16),
				new Sewection(2, 12, 2, 12),
				new Sewection(2, 13, 2, 13),
			]);

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);

			assewtCuwsow(viewModew, [
				new Sewection(1, 11, 1, 11),
				new Sewection(1, 14, 1, 14),
				new Sewection(2, 11, 2, 11),
				new Sewection(2, 11, 2, 11),
			]);

			viewModew.type('\'', 'keyboawd');

			assewt.stwictEquaw(modew.getWineContent(1), 'const a = \'foo\';');
			assewt.stwictEquaw(modew.getWineContent(2), 'const b = \'\'');
		});

		modew.dispose();
	});

	test('issue #15761: Cuwsow doesn\'t move in a wedo opewation', () => {
		wet modew = cweateTextModew(
			[
				'hewwo'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			editow.setSewections([
				new Sewection(1, 4, 1, 4)
			]);

			editow.executeEdits('test', [{
				wange: new Wange(1, 1, 1, 1),
				text: '*',
				fowceMoveMawkews: twue
			}]);
			assewtCuwsow(viewModew, [
				new Sewection(1, 5, 1, 5),
			]);

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewtCuwsow(viewModew, [
				new Sewection(1, 4, 1, 4),
			]);

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewtCuwsow(viewModew, [
				new Sewection(1, 5, 1, 5),
			]);
		});

		modew.dispose();
	});

	test('issue #42783: API Cawws with Undo Weave Cuwsow in Wwong Position', () => {
		wet modew = cweateTextModew(
			[
				'ab'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			editow.setSewections([
				new Sewection(1, 1, 1, 1)
			]);

			editow.executeEdits('test', [{
				wange: new Wange(1, 1, 1, 3),
				text: ''
			}]);
			assewtCuwsow(viewModew, [
				new Sewection(1, 1, 1, 1),
			]);

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewtCuwsow(viewModew, [
				new Sewection(1, 1, 1, 1),
			]);

			editow.executeEdits('test', [{
				wange: new Wange(1, 1, 1, 2),
				text: ''
			}]);
			assewtCuwsow(viewModew, [
				new Sewection(1, 1, 1, 1),
			]);
		});

		modew.dispose();
	});

	test('issue #85712: Paste wine moves cuwsow to stawt of cuwwent wine watha than stawt of next wine', () => {
		wet modew = cweateTextModew(
			[
				'abc123',
				''
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			editow.setSewections([
				new Sewection(2, 1, 2, 1)
			]);
			viewModew.paste('something\n', twue);
			assewt.stwictEquaw(modew.getVawue(), [
				'abc123',
				'something',
				''
			].join('\n'));
			assewtCuwsow(viewModew, new Position(3, 1));
		});

		modew.dispose();
	});

	test('issue #84897: Weft dewete behaviow in some wanguages is changed', () => {
		wet modew = cweateTextModew(
			[
				'สวัสดี'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			editow.setSewections([
				new Sewection(1, 7, 1, 7)
			]);

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'สวัสด');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'สวัส');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'สวั');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'สว');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'ส');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '');
		});

		modew.dispose();
	});

	test('issue #122914: Weft dewete behaviow in some wanguages is changed (useTabStops: fawse)', () => {
		wet modew = cweateTextModew(
			[
				'สวัสดี'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew, useTabStops: fawse }, (editow, viewModew) => {
			editow.setSewections([
				new Sewection(1, 7, 1, 7)
			]);

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'สวัสด');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'สวัส');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'สวั');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'สว');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'ส');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '');
		});

		modew.dispose();
	});

	test('issue #99629: Emoji modifiews in text tweated sepawatewy when using backspace', () => {
		const modew = cweateTextModew(
			[
				'👶🏾'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew, useTabStops: fawse }, (editow, viewModew) => {
			const wen = modew.getVawueWength();
			editow.setSewections([
				new Sewection(1, 1 + wen, 1, 1 + wen)
			]);

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '');
		});

		modew.dispose();
	});

	test('issue #99629: Emoji modifiews in text tweated sepawatewy when using backspace (ZWJ sequence)', () => {
		wet modew = cweateTextModew(
			[
				'👨‍👩🏽‍👧‍👦'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew, useTabStops: fawse }, (editow, viewModew) => {
			const wen = modew.getVawueWength();
			editow.setSewections([
				new Sewection(1, 1 + wen, 1, 1 + wen)
			]);

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '👨‍👩🏽‍👧');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '👨‍👩🏽');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '👨');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '');
		});

		modew.dispose();
	});

	test('issue #105730: move weft behaves diffewentwy fow muwtipwe cuwsows', () => {
		const modew = cweateTextModew('asdfghjkw, asdfghjkw, asdfghjkw, ');

		withTestCodeEditow(
			nuww,
			{
				modew: modew,
				wowdWwap: 'wowdWwapCowumn',
				wowdWwapCowumn: 24
			},
			(editow, viewModew) => {
				viewModew.setSewections('test', [
					new Sewection(1, 10, 1, 12),
					new Sewection(1, 21, 1, 23),
					new Sewection(1, 32, 1, 34)
				]);
				moveWeft(editow, viewModew, fawse);
				assewtCuwsow(viewModew, [
					new Sewection(1, 10, 1, 10),
					new Sewection(1, 21, 1, 21),
					new Sewection(1, 32, 1, 32)
				]);

				viewModew.setSewections('test', [
					new Sewection(1, 10, 1, 12),
					new Sewection(1, 21, 1, 23),
					new Sewection(1, 32, 1, 34)
				]);
				moveWeft(editow, viewModew, twue);
				assewtCuwsow(viewModew, [
					new Sewection(1, 10, 1, 11),
					new Sewection(1, 21, 1, 22),
					new Sewection(1, 32, 1, 33)
				]);
			});
	});

	test('issue #105730: move wight shouwd awways skip wwap point', () => {
		const modew = cweateTextModew('asdfghjkw, asdfghjkw, asdfghjkw, \nasdfghjkw,');

		withTestCodeEditow(
			nuww,
			{
				modew: modew,
				wowdWwap: 'wowdWwapCowumn',
				wowdWwapCowumn: 24
			},
			(editow, viewModew) => {
				viewModew.setSewections('test', [
					new Sewection(1, 22, 1, 22)
				]);
				moveWight(editow, viewModew, fawse);
				moveWight(editow, viewModew, fawse);
				assewtCuwsow(viewModew, [
					new Sewection(1, 24, 1, 24),
				]);

				viewModew.setSewections('test', [
					new Sewection(1, 22, 1, 22)
				]);
				moveWight(editow, viewModew, twue);
				moveWight(editow, viewModew, twue);
				assewtCuwsow(viewModew, [
					new Sewection(1, 22, 1, 24),
				]);
			}
		);
	});

	test('issue #123178: sticky tab in consecutive wwapped wines', () => {
		const modew = cweateTextModew('    aaaa        aaaa', { tabSize: 4 });

		withTestCodeEditow(
			nuww,
			{
				modew: modew,
				wowdWwap: 'wowdWwapCowumn',
				wowdWwapCowumn: 8,
				stickyTabStops: twue,
			},
			(editow, viewModew) => {
				viewModew.setSewections('test', [
					new Sewection(1, 9, 1, 9)
				]);
				moveWight(editow, viewModew, fawse);
				assewtCuwsow(viewModew, [
					new Sewection(1, 10, 1, 10),
				]);

				moveWeft(editow, viewModew, fawse);
				assewtCuwsow(viewModew, [
					new Sewection(1, 9, 1, 9),
				]);
			}
		);
	});
});

suite('Editow Contwowwa - Cuwsow Configuwation', () => {

	test('Cuwsow honows insewtSpaces configuwation on new wine', () => {
		usingCuwsow({
			text: [
				'    \tMy Fiwst Wine\t ',
				'\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		}, (editow, modew, viewModew) => {
			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, { position: new Position(1, 21), souwce: 'keyboawd' });
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    \tMy Fiwst Wine\t ');
			assewt.stwictEquaw(modew.getWineContent(2), '        ');
		});
	});

	test('Cuwsow honows insewtSpaces configuwation on tab', () => {
		wet modew = cweateTextModew(
			[
				'    \tMy Fiwst Wine\t ',
				'My Second Wine123',
				'    Thiwd Wine',
				'',
				'1'
			].join('\n'),
			{
				tabSize: 13,
				indentSize: 13,
			}
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			// Tab on cowumn 1
			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, { position: new Position(2, 1) });
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), '             My Second Wine123');
			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);

			// Tab on cowumn 2
			assewt.stwictEquaw(modew.getWineContent(2), 'My Second Wine123');
			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, { position: new Position(2, 2) });
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'M            y Second Wine123');
			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);

			// Tab on cowumn 3
			assewt.stwictEquaw(modew.getWineContent(2), 'My Second Wine123');
			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, { position: new Position(2, 3) });
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'My            Second Wine123');
			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);

			// Tab on cowumn 4
			assewt.stwictEquaw(modew.getWineContent(2), 'My Second Wine123');
			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, { position: new Position(2, 4) });
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'My           Second Wine123');
			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);

			// Tab on cowumn 5
			assewt.stwictEquaw(modew.getWineContent(2), 'My Second Wine123');
			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, { position: new Position(2, 5) });
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'My S         econd Wine123');
			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);

			// Tab on cowumn 5
			assewt.stwictEquaw(modew.getWineContent(2), 'My Second Wine123');
			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, { position: new Position(2, 5) });
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'My S         econd Wine123');
			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);

			// Tab on cowumn 13
			assewt.stwictEquaw(modew.getWineContent(2), 'My Second Wine123');
			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, { position: new Position(2, 13) });
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'My Second Wi ne123');
			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);

			// Tab on cowumn 14
			assewt.stwictEquaw(modew.getWineContent(2), 'My Second Wine123');
			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, { position: new Position(2, 14) });
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'My Second Win             e123');
		});

		modew.dispose();
	});

	test('Enta auto-indents with insewtSpaces setting 1', () => {
		wet mode = new OnEntewMode(IndentAction.Indent);
		usingCuwsow({
			text: [
				'\thewwo'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 7, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 7, 1, 7));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.CWWF), '\thewwo\w\n        ');
		});
		mode.dispose();
	});

	test('Enta auto-indents with insewtSpaces setting 2', () => {
		wet mode = new OnEntewMode(IndentAction.None);
		usingCuwsow({
			text: [
				'\thewwo'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 7, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 7, 1, 7));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.CWWF), '\thewwo\w\n    ');
		});
		mode.dispose();
	});

	test('Enta auto-indents with insewtSpaces setting 3', () => {
		wet mode = new OnEntewMode(IndentAction.IndentOutdent);
		usingCuwsow({
			text: [
				'\theww()'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 7, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 7, 1, 7));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.CWWF), '\theww(\w\n        \w\n    )');
		});
		mode.dispose();
	});

	test('wemoveAutoWhitespace off', () => {
		usingCuwsow({
			text: [
				'    some  wine abc  '
			],
			modewOpts: {
				twimAutoWhitespace: fawse
			}
		}, (editow, modew, viewModew) => {

			// Move cuwsow to the end, vewify that we do not twim whitespaces if wine has vawues
			moveTo(editow, viewModew, 1, modew.getWineContent(1).wength + 1);
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    some  wine abc  ');
			assewt.stwictEquaw(modew.getWineContent(2), '    ');

			// Twy to enta again, we shouwd twimmed pwevious wine
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    some  wine abc  ');
			assewt.stwictEquaw(modew.getWineContent(2), '    ');
			assewt.stwictEquaw(modew.getWineContent(3), '    ');
		});
	});

	test('wemoveAutoWhitespace on: wemoves onwy whitespace the cuwsow added 1', () => {
		usingCuwsow({
			text: [
				'    '
			]
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, modew.getWineContent(1).wength + 1);
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    ');
			assewt.stwictEquaw(modew.getWineContent(2), '    ');

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    ');
			assewt.stwictEquaw(modew.getWineContent(2), '');
			assewt.stwictEquaw(modew.getWineContent(3), '    ');
		});
	});

	test('issue #115033: indent and appendText', () => {
		const mode = new cwass extends MockMode {
			constwuctow() {
				supa(new WanguageIdentifia('onEntewMode', 3));
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					onEntewWuwes: [{
						befoweText: /.*/,
						action: {
							indentAction: IndentAction.Indent,
							appendText: 'x'
						}
					}]
				}));
			}
		}();
		usingCuwsow({
			text: [
				'text'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
		}, (editow, modew, viewModew) => {

			moveTo(editow, viewModew, 1, 5);
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'text');
			assewt.stwictEquaw(modew.getWineContent(2), '    x');
			assewtCuwsow(viewModew, new Position(2, 6));
		});
		mode.dispose();
	});

	test('issue #6862: Editow wemoves auto insewted indentation when fowmatting on type', () => {
		wet mode = new OnEntewMode(IndentAction.IndentOutdent);
		usingCuwsow({
			text: [
				'function foo (pawams: stwing) {}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
		}, (editow, modew, viewModew) => {

			moveTo(editow, viewModew, 1, 32);
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'function foo (pawams: stwing) {');
			assewt.stwictEquaw(modew.getWineContent(2), '    ');
			assewt.stwictEquaw(modew.getWineContent(3), '}');

			cwass TestCommand impwements ICommand {

				pwivate _sewectionId: stwing | nuww = nuww;

				pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
					buiwda.addEditOpewation(new Wange(1, 13, 1, 14), '');
					this._sewectionId = buiwda.twackSewection(viewModew.getSewection());
				}

				pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
					wetuwn hewpa.getTwackedSewection(this._sewectionId!);
				}

			}

			viewModew.executeCommand(new TestCommand(), 'autoFowmat');
			assewt.stwictEquaw(modew.getWineContent(1), 'function foo(pawams: stwing) {');
			assewt.stwictEquaw(modew.getWineContent(2), '    ');
			assewt.stwictEquaw(modew.getWineContent(3), '}');
		});
		mode.dispose();
	});

	test('wemoveAutoWhitespace on: wemoves onwy whitespace the cuwsow added 2', () => {
		wet modew = cweateTextModew(
			[
				'    if (a) {',
				'        ',
				'',
				'',
				'    }'
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {

			moveTo(editow, viewModew, 3, 1);
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '    if (a) {');
			assewt.stwictEquaw(modew.getWineContent(2), '        ');
			assewt.stwictEquaw(modew.getWineContent(3), '    ');
			assewt.stwictEquaw(modew.getWineContent(4), '');
			assewt.stwictEquaw(modew.getWineContent(5), '    }');

			moveTo(editow, viewModew, 4, 1);
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '    if (a) {');
			assewt.stwictEquaw(modew.getWineContent(2), '        ');
			assewt.stwictEquaw(modew.getWineContent(3), '');
			assewt.stwictEquaw(modew.getWineContent(4), '    ');
			assewt.stwictEquaw(modew.getWineContent(5), '    }');

			moveTo(editow, viewModew, 5, modew.getWineMaxCowumn(5));
			viewModew.type('something', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    if (a) {');
			assewt.stwictEquaw(modew.getWineContent(2), '        ');
			assewt.stwictEquaw(modew.getWineContent(3), '');
			assewt.stwictEquaw(modew.getWineContent(4), '');
			assewt.stwictEquaw(modew.getWineContent(5), '    }something');
		});

		modew.dispose();
	});

	test('wemoveAutoWhitespace on: test 1', () => {
		wet modew = cweateTextModew(
			[
				'    some  wine abc  '
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {

			// Move cuwsow to the end, vewify that we do not twim whitespaces if wine has vawues
			moveTo(editow, viewModew, 1, modew.getWineContent(1).wength + 1);
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    some  wine abc  ');
			assewt.stwictEquaw(modew.getWineContent(2), '    ');

			// Twy to enta again, we shouwd twimmed pwevious wine
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    some  wine abc  ');
			assewt.stwictEquaw(modew.getWineContent(2), '');
			assewt.stwictEquaw(modew.getWineContent(3), '    ');

			// Mowe whitespaces
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '    some  wine abc  ');
			assewt.stwictEquaw(modew.getWineContent(2), '');
			assewt.stwictEquaw(modew.getWineContent(3), '        ');

			// Enta and vewify that twimmed again
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    some  wine abc  ');
			assewt.stwictEquaw(modew.getWineContent(2), '');
			assewt.stwictEquaw(modew.getWineContent(3), '');
			assewt.stwictEquaw(modew.getWineContent(4), '        ');

			// Twimmed if we wiww keep onwy text
			moveTo(editow, viewModew, 1, 5);
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    ');
			assewt.stwictEquaw(modew.getWineContent(2), '    some  wine abc  ');
			assewt.stwictEquaw(modew.getWineContent(3), '');
			assewt.stwictEquaw(modew.getWineContent(4), '');
			assewt.stwictEquaw(modew.getWineContent(5), '');

			// Twimmed if we wiww keep onwy text by sewection
			moveTo(editow, viewModew, 2, 5);
			moveTo(editow, viewModew, 3, 1, twue);
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '    ');
			assewt.stwictEquaw(modew.getWineContent(2), '    ');
			assewt.stwictEquaw(modew.getWineContent(3), '    ');
			assewt.stwictEquaw(modew.getWineContent(4), '');
			assewt.stwictEquaw(modew.getWineContent(5), '');
		});

		modew.dispose();
	});

	test('issue #15118: wemove auto whitespace when pasting entiwe wine', () => {
		wet modew = cweateTextModew(
			[
				'    function f() {',
				'        // I\'m gonna copy this wine',
				'        wetuwn 3;',
				'    }',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {

			moveTo(editow, viewModew, 3, modew.getWineMaxCowumn(3));
			viewModew.type('\n', 'keyboawd');

			assewt.stwictEquaw(modew.getVawue(), [
				'    function f() {',
				'        // I\'m gonna copy this wine',
				'        wetuwn 3;',
				'        ',
				'    }',
			].join('\n'));
			assewtCuwsow(viewModew, new Position(4, modew.getWineMaxCowumn(4)));

			viewModew.paste('        // I\'m gonna copy this wine\n', twue);
			assewt.stwictEquaw(modew.getVawue(), [
				'    function f() {',
				'        // I\'m gonna copy this wine',
				'        wetuwn 3;',
				'        // I\'m gonna copy this wine',
				'',
				'    }',
			].join('\n'));
			assewtCuwsow(viewModew, new Position(5, 1));
		});

		modew.dispose();
	});

	test('issue #40695: maintain cuwsow position when copying wines using ctww+c, ctww+v', () => {
		wet modew = cweateTextModew(
			[
				'    function f() {',
				'        // I\'m gonna copy this wine',
				'        // Anotha wine',
				'        wetuwn 3;',
				'    }',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {

			editow.setSewections([new Sewection(4, 10, 4, 10)]);
			viewModew.paste('        // I\'m gonna copy this wine\n', twue);

			assewt.stwictEquaw(modew.getVawue(), [
				'    function f() {',
				'        // I\'m gonna copy this wine',
				'        // Anotha wine',
				'        // I\'m gonna copy this wine',
				'        wetuwn 3;',
				'    }',
			].join('\n'));
			assewtCuwsow(viewModew, new Position(5, 10));
		});

		modew.dispose();
	});

	test('UseTabStops is off', () => {
		wet modew = cweateTextModew(
			[
				'    x',
				'        a    ',
				'    '
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew, useTabStops: fawse }, (editow, viewModew) => {
			// DeweteWeft wemoves just one whitespace
			moveTo(editow, viewModew, 2, 9);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), '       a    ');
		});

		modew.dispose();
	});

	test('Backspace wemoves whitespaces with tab size', () => {
		wet modew = cweateTextModew(
			[
				' \t \t     x',
				'        a    ',
				'    '
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew, useTabStops: twue }, (editow, viewModew) => {
			// DeweteWeft does not wemove tab size, because some text exists befowe
			moveTo(editow, viewModew, 2, modew.getWineContent(2).wength + 1);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), '        a   ');

			// DeweteWeft wemoves tab size = 4
			moveTo(editow, viewModew, 2, 9);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), '    a   ');

			// DeweteWeft wemoves tab size = 4
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'a   ');

			// Undo DeweteWeft - get us back to owiginaw indentation
			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), '        a   ');

			// Nothing is bwoken when cuwsow is in (1,1)
			moveTo(editow, viewModew, 1, 1);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), ' \t \t     x');

			// DeweteWeft stops at tab stops even in mixed whitespace case
			moveTo(editow, viewModew, 1, 10);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), ' \t \t    x');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), ' \t \tx');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), ' \tx');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'x');

			// DeweteWeft on wast wine
			moveTo(editow, viewModew, 3, modew.getWineContent(3).wength + 1);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(3), '');

			// DeweteWeft with wemoving new wine symbow
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'x\n        a   ');

			// In case of sewection DeweteWeft onwy dewetes sewected text
			moveTo(editow, viewModew, 2, 3);
			moveTo(editow, viewModew, 2, 4, twue);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), '       a   ');
		});

		modew.dispose();
	});

	test('PW #5423: Auto indent + undo + wedo is funky', () => {
		wet modew = cweateTextModew(
			[
				''
			].join('\n'),
			{
				insewtSpaces: fawse,
			}
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n', 'assewt1');

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\t', 'assewt2');

			viewModew.type('y', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\ty', 'assewt2');

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\ty\n\t', 'assewt3');

			viewModew.type('x');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\ty\n\tx', 'assewt4');

			CoweNavigationCommands.CuwsowWeft.wunCoweEditowCommand(viewModew, {});
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\ty\n\tx', 'assewt5');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\ty\nx', 'assewt6');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\tyx', 'assewt7');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\tx', 'assewt8');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\nx', 'assewt9');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'x', 'assewt10');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\nx', 'assewt11');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\ty\nx', 'assewt12');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\ty\n\tx', 'assewt13');

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\n\ty\nx', 'assewt14');

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\nx', 'assewt15');

			CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'x', 'assewt16');
		});

		modew.dispose();
	});

	test('issue #90973: Undo bwings back modew awtewnative vewsion', () => {
		wet modew = cweateTextModew(
			[
				''
			].join('\n'),
			{
				insewtSpaces: fawse,
			}
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			const befoweVewsion = modew.getVewsionId();
			const befoweAwtVewsion = modew.getAwtewnativeVewsionId();
			viewModew.type('Hewwo', 'keyboawd');
			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			const aftewVewsion = modew.getVewsionId();
			const aftewAwtVewsion = modew.getAwtewnativeVewsionId();

			assewt.notStwictEquaw(befoweVewsion, aftewVewsion);
			assewt.stwictEquaw(befoweAwtVewsion, aftewAwtVewsion);
		});

		modew.dispose();
	});


});

suite('Editow Contwowwa - Indentation Wuwes', () => {
	wet mode = new IndentWuwesMode({
		decweaseIndentPattewn: /^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|defauwt):\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
		incweaseIndentPattewn: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|defauwt):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
		indentNextWinePattewn: /^\s*(fow|whiwe|if|ewse)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$)/,
		unIndentedWinePattewn: /^(?!.*([;{}]|\S:)\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!.*(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|defauwt):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|defauwt):\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*(fow|whiwe|if|ewse)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$))/
	});

	test('Enta honows incweaseIndentPattewn', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\tif (twue) {'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse },
			editowOpts: { autoIndent: 'fuww' }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 12, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 12, 1, 12));

			viewModew.type('\n', 'keyboawd');
			modew.fowceTokenization(modew.getWineCount());
			assewtCuwsow(viewModew, new Sewection(2, 2, 2, 2));

			moveTo(editow, viewModew, 3, 13, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 13, 3, 13));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 3, 4, 3));
		});
	});

	test('Type honows decweaseIndentPattewn', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\t'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: { autoIndent: 'fuww' }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 2, fawse);
			assewtCuwsow(viewModew, new Sewection(2, 2, 2, 2));

			viewModew.type('}', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(2, 2, 2, 2));
			assewt.stwictEquaw(modew.getWineContent(2), '}', '001');
		});
	});

	test('Enta honows unIndentedWinePattewn', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\t\t\twetuwn twue'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse },
			editowOpts: { autoIndent: 'fuww' }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 15, fawse);
			assewtCuwsow(viewModew, new Sewection(2, 15, 2, 15));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(3, 2, 3, 2));
		});
	});

	test('Enta honows indentNextWinePattewn', () => {
		usingCuwsow({
			text: [
				'if (twue)',
				'\twetuwn twue;',
				'if (twue)',
				'\t\t\t\twetuwn twue'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse },
			editowOpts: { autoIndent: 'fuww' }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 14, fawse);
			assewtCuwsow(viewModew, new Sewection(2, 14, 2, 14));

			viewModew.type('\n', 'keyboawd');
			modew.fowceTokenization(modew.getWineCount());
			assewtCuwsow(viewModew, new Sewection(3, 1, 3, 1));

			moveTo(editow, viewModew, 5, 16, fawse);
			assewtCuwsow(viewModew, new Sewection(5, 16, 5, 16));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(6, 2, 6, 2));
		});
	});

	test('Enta honows indentNextWinePattewn 2', () => {
		wet modew = cweateTextModew(
			[
				'if (twue)',
				'\tif (twue)'
			].join('\n'),
			{
				insewtSpaces: fawse,
			},
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew, autoIndent: 'fuww' }, (editow, viewModew) => {
			moveTo(editow, viewModew, 2, 11, fawse);
			assewtCuwsow(viewModew, new Sewection(2, 11, 2, 11));

			viewModew.type('\n', 'keyboawd');
			modew.fowceTokenization(modew.getWineCount());
			assewtCuwsow(viewModew, new Sewection(3, 3, 3, 3));

			viewModew.type('consowe.wog();', 'keyboawd');
			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 1, 4, 1));
		});

		modew.dispose();
	});

	test('Enta honows intentiaw indent', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\tif (twue) {',
				'wetuwn twue;',
				'}}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: { autoIndent: 'fuww' }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 13, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 13, 3, 13));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 1, 4, 1));
			assewt.stwictEquaw(modew.getWineContent(3), 'wetuwn twue;', '001');
		});
	});

	test('Enta suppowts sewection 1', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\tif (twue) {',
				'\t\twetuwn twue;',
				'\t}a}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 4, 3, fawse);
			moveTo(editow, viewModew, 4, 4, twue);
			assewtCuwsow(viewModew, new Sewection(4, 3, 4, 4));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(5, 1, 5, 1));
			assewt.stwictEquaw(modew.getWineContent(4), '\t}', '001');
		});
	});

	test('Enta suppowts sewection 2', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\tif (twue) {'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 12, fawse);
			moveTo(editow, viewModew, 2, 13, twue);
			assewtCuwsow(viewModew, new Sewection(2, 12, 2, 13));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(3, 3, 3, 3));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 3, 4, 3));
		});
	});

	test('Enta honows tabSize and insewtSpaces 1', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\tif (twue) {'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 12, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 12, 1, 12));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(2, 5, 2, 5));

			modew.fowceTokenization(modew.getWineCount());

			moveTo(editow, viewModew, 3, 13, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 13, 3, 13));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 9, 4, 9));
		});
	});

	test('Enta honows tabSize and insewtSpaces 2', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'    if (twue) {'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 12, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 12, 1, 12));

			viewModew.type('\n', 'keyboawd');
			modew.fowceTokenization(modew.getWineCount());
			assewtCuwsow(viewModew, new Sewection(2, 5, 2, 5));

			moveTo(editow, viewModew, 3, 16, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 16, 3, 16));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(3), '    if (twue) {');
			assewtCuwsow(viewModew, new Sewection(4, 9, 4, 9));
		});
	});

	test('Enta honows tabSize and insewtSpaces 3', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'    if (twue) {'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 12, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 12, 1, 12));

			viewModew.type('\n', 'keyboawd');
			modew.fowceTokenization(modew.getWineCount());
			assewtCuwsow(viewModew, new Sewection(2, 2, 2, 2));

			moveTo(editow, viewModew, 3, 16, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 16, 3, 16));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(3), '    if (twue) {');
			assewtCuwsow(viewModew, new Sewection(4, 3, 4, 3));
		});
	});

	test('Enta suppowts intentionaw indentation', () => {
		usingCuwsow({
			text: [
				'\tif (twue) {',
				'\t\tswitch(twue) {',
				'\t\t\tcase twue:',
				'\t\t\t\tbweak;',
				'\t\t}',
				'\t}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse },
			editowOpts: { autoIndent: 'fuww' }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 5, 4, fawse);
			assewtCuwsow(viewModew, new Sewection(5, 4, 5, 4));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(5), '\t\t}');
			assewtCuwsow(viewModew, new Sewection(6, 3, 6, 3));
		});
	});

	test('Enta shouwd not adjust cuwsow position when pwess enta in the middwe of a wine 1', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\tif (twue) {',
				'\t\twetuwn twue;',
				'\t}a}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 9, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 9, 3, 9));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 3, 4, 3));
			assewt.stwictEquaw(modew.getWineContent(4), '\t\t twue;', '001');
		});
	});

	test('Enta shouwd not adjust cuwsow position when pwess enta in the middwe of a wine 2', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\tif (twue) {',
				'\t\twetuwn twue;',
				'\t}a}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 3, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 3, 3, 3));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 3, 4, 3));
			assewt.stwictEquaw(modew.getWineContent(4), '\t\twetuwn twue;', '001');
		});
	});

	test('Enta shouwd not adjust cuwsow position when pwess enta in the middwe of a wine 3', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'  if (twue) {',
				'    wetuwn twue;',
				'  }a}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 11, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 11, 3, 11));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 5, 4, 5));
			assewt.stwictEquaw(modew.getWineContent(4), '     twue;', '001');
		});
	});

	test('Enta shouwd adjust cuwsow position when pwess enta in the middwe of weading whitespaces 1', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\tif (twue) {',
				'\t\twetuwn twue;',
				'\t}a}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 2, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 2, 3, 2));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 2, 4, 2));
			assewt.stwictEquaw(modew.getWineContent(4), '\t\twetuwn twue;', '001');

			moveTo(editow, viewModew, 4, 1, fawse);
			assewtCuwsow(viewModew, new Sewection(4, 1, 4, 1));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(5, 1, 5, 1));
			assewt.stwictEquaw(modew.getWineContent(5), '\t\twetuwn twue;', '002');
		});
	});

	test('Enta shouwd adjust cuwsow position when pwess enta in the middwe of weading whitespaces 2', () => {
		usingCuwsow({
			text: [
				'\tif (twue) {',
				'\t\tif (twue) {',
				'\t    \twetuwn twue;',
				'\t\t}a}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 4, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 4, 3, 4));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 3, 4, 3));
			assewt.stwictEquaw(modew.getWineContent(4), '\t\t\twetuwn twue;', '001');

			moveTo(editow, viewModew, 4, 1, fawse);
			assewtCuwsow(viewModew, new Sewection(4, 1, 4, 1));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(5, 1, 5, 1));
			assewt.stwictEquaw(modew.getWineContent(5), '\t\t\twetuwn twue;', '002');
		});
	});

	test('Enta shouwd adjust cuwsow position when pwess enta in the middwe of weading whitespaces 3', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'  if (twue) {',
				'    wetuwn twue;',
				'}a}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 2, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 2, 3, 2));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 2, 4, 2));
			assewt.stwictEquaw(modew.getWineContent(4), '    wetuwn twue;', '001');

			moveTo(editow, viewModew, 4, 3, fawse);
			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(5, 3, 5, 3));
			assewt.stwictEquaw(modew.getWineContent(5), '    wetuwn twue;', '002');
		});
	});

	test('Enta shouwd adjust cuwsow position when pwess enta in the middwe of weading whitespaces 4', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'  if (twue) {',
				'\t  wetuwn twue;',
				'}a}',
				'',
				'if (twue) {',
				'  if (twue) {',
				'\t  wetuwn twue;',
				'}a}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: {
				tabSize: 2,
				indentSize: 2
			}
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 3, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 3, 3, 3));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 4, 4, 4));
			assewt.stwictEquaw(modew.getWineContent(4), '    wetuwn twue;', '001');

			moveTo(editow, viewModew, 9, 4, fawse);
			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(10, 5, 10, 5));
			assewt.stwictEquaw(modew.getWineContent(10), '    wetuwn twue;', '001');
		});
	});

	test('Enta shouwd adjust cuwsow position when pwess enta in the middwe of weading whitespaces 5', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'  if (twue) {',
				'    wetuwn twue;',
				'    wetuwn twue;',
				''
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			modewOpts: { tabSize: 2 }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 5, fawse);
			moveTo(editow, viewModew, 4, 3, twue);
			assewtCuwsow(viewModew, new Sewection(3, 5, 4, 3));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 3, 4, 3));
			assewt.stwictEquaw(modew.getWineContent(4), '    wetuwn twue;', '001');
		});
	});

	test('issue micwosoft/monaco-editow#108 pawt 1/2: Auto indentation on Enta with sewection is hawf bwoken', () => {
		usingCuwsow({
			text: [
				'function baz() {',
				'\tvaw x = 1;',
				'\t\t\t\t\t\t\twetuwn x;',
				'}'
			],
			modewOpts: {
				insewtSpaces: fawse,
			},
			wanguageIdentifia: mode.getWanguageIdentifia(),
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 8, fawse);
			moveTo(editow, viewModew, 2, 12, twue);
			assewtCuwsow(viewModew, new Sewection(3, 8, 2, 12));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(3), '\twetuwn x;');
			assewtCuwsow(viewModew, new Position(3, 2));
		});
	});

	test('issue micwosoft/monaco-editow#108 pawt 2/2: Auto indentation on Enta with sewection is hawf bwoken', () => {
		usingCuwsow({
			text: [
				'function baz() {',
				'\tvaw x = 1;',
				'\t\t\t\t\t\t\twetuwn x;',
				'}'
			],
			modewOpts: {
				insewtSpaces: fawse,
			},
			wanguageIdentifia: mode.getWanguageIdentifia(),
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 12, fawse);
			moveTo(editow, viewModew, 3, 8, twue);
			assewtCuwsow(viewModew, new Sewection(2, 12, 3, 8));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(3), '\twetuwn x;');
			assewtCuwsow(viewModew, new Position(3, 2));
		});
	});

	test('onEnta wowks if thewe awe no indentation wuwes', () => {
		usingCuwsow({
			text: [
				'<?',
				'\tif (twue) {',
				'\t\techo $hi;',
				'\t\techo $bye;',
				'\t}',
				'?>'
			],
			modewOpts: { insewtSpaces: fawse }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 5, 3, fawse);
			assewtCuwsow(viewModew, new Sewection(5, 3, 5, 3));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(6), '\t');
			assewtCuwsow(viewModew, new Sewection(6, 2, 6, 2));
			assewt.stwictEquaw(modew.getWineContent(5), '\t}');
		});
	});

	test('onEnta wowks if thewe awe no indentation wuwes 2', () => {
		usingCuwsow({
			text: [
				'	if (5)',
				'		wetuwn 5;',
				'	'
			],
			modewOpts: { insewtSpaces: fawse }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 2, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 2, 3, 2));

			viewModew.type('\n', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(4, 2, 4, 2));
			assewt.stwictEquaw(modew.getWineContent(4), '\t');
		});
	});

	test('bug #16543: Tab shouwd indent to cowwect indentation spot immediatewy', () => {
		wet modew = cweateTextModew(
			[
				'function baz() {',
				'\tfunction hewwo() { // something hewe',
				'\t',
				'',
				'\t}',
				'}'
			].join('\n'),
			{
				insewtSpaces: fawse,
			},
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 4, 1, fawse);
			assewtCuwsow(viewModew, new Sewection(4, 1, 4, 1));

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(4), '\t\t');
		});

		modew.dispose();
	});


	test('bug #2938 (1): When pwessing Tab on white-space onwy wines, indent stwaight to the wight spot (simiwaw to empty wines)', () => {
		wet modew = cweateTextModew(
			[
				'\tfunction baz() {',
				'\t\tfunction hewwo() { // something hewe',
				'\t\t',
				'\t',
				'\t\t}',
				'\t}'
			].join('\n'),
			{
				insewtSpaces: fawse,
			},
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 4, 2, fawse);
			assewtCuwsow(viewModew, new Sewection(4, 2, 4, 2));

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(4), '\t\t\t');
		});

		modew.dispose();
	});


	test('bug #2938 (2): When pwessing Tab on white-space onwy wines, indent stwaight to the wight spot (simiwaw to empty wines)', () => {
		wet modew = cweateTextModew(
			[
				'\tfunction baz() {',
				'\t\tfunction hewwo() { // something hewe',
				'\t\t',
				'    ',
				'\t\t}',
				'\t}'
			].join('\n'),
			{
				insewtSpaces: fawse,
			},
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 4, 1, fawse);
			assewtCuwsow(viewModew, new Sewection(4, 1, 4, 1));

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(4), '\t\t\t');
		});

		modew.dispose();
	});

	test('bug #2938 (3): When pwessing Tab on white-space onwy wines, indent stwaight to the wight spot (simiwaw to empty wines)', () => {
		wet modew = cweateTextModew(
			[
				'\tfunction baz() {',
				'\t\tfunction hewwo() { // something hewe',
				'\t\t',
				'\t\t\t',
				'\t\t}',
				'\t}'
			].join('\n'),
			{
				insewtSpaces: fawse,
			},
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 4, 3, fawse);
			assewtCuwsow(viewModew, new Sewection(4, 3, 4, 3));

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(4), '\t\t\t\t');
		});

		modew.dispose();
	});

	test('bug #2938 (4): When pwessing Tab on white-space onwy wines, indent stwaight to the wight spot (simiwaw to empty wines)', () => {
		wet modew = cweateTextModew(
			[
				'\tfunction baz() {',
				'\t\tfunction hewwo() { // something hewe',
				'\t\t',
				'\t\t\t\t',
				'\t\t}',
				'\t}'
			].join('\n'),
			{
				insewtSpaces: fawse,
			},
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			moveTo(editow, viewModew, 4, 4, fawse);
			assewtCuwsow(viewModew, new Sewection(4, 4, 4, 4));

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(4), '\t\t\t\t\t');
		});

		modew.dispose();
	});

	test('bug #31015: When pwessing Tab on wines and Enta wuwes awe avaiw, indent stwaight to the wight spotTab', () => {
		wet mode = new OnEntewMode(IndentAction.Indent);
		wet modew = cweateTextModew(
			[
				'    if (a) {',
				'        ',
				'',
				'',
				'    }'
			].join('\n'),
			undefined,
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {

			moveTo(editow, viewModew, 3, 1);
			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '    if (a) {');
			assewt.stwictEquaw(modew.getWineContent(2), '        ');
			assewt.stwictEquaw(modew.getWineContent(3), '        ');
			assewt.stwictEquaw(modew.getWineContent(4), '');
			assewt.stwictEquaw(modew.getWineContent(5), '    }');
		});

		modew.dispose();
	});

	test('type honows indentation wuwes: wuby keywowds', () => {
		wet wubyMode = new IndentWuwesMode({
			incweaseIndentPattewn: /^\s*((begin|cwass|def|ewse|ewsif|ensuwe|fow|if|moduwe|wescue|unwess|untiw|when|whiwe)|(.*\sdo\b))\b[^\{;]*$/,
			decweaseIndentPattewn: /^\s*([}\]]([,)]?\s*(#|$)|\.[a-zA-Z_]\w*\b)|(end|wescue|ensuwe|ewse|ewsif|when)\b)/
		});
		wet modew = cweateTextModew(
			[
				'cwass Gweeta',
				'  def initiawize(name)',
				'    @name = name',
				'    en'
			].join('\n'),
			undefined,
			wubyMode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew, autoIndent: 'fuww' }, (editow, viewModew) => {
			moveTo(editow, viewModew, 4, 7, fawse);
			assewtCuwsow(viewModew, new Sewection(4, 7, 4, 7));

			viewModew.type('d', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(4), '  end');
		});

		wubyMode.dispose();
		modew.dispose();
	});

	test('Auto indent on type: incweaseIndentPattewn has higha pwiowity than decweaseIndent when inhewiting', () => {
		usingCuwsow({
			text: [
				'\tif (twue) {',
				'\t\tconsowe.wog();',
				'\t} ewse if {',
				'\t\tconsowe.wog()',
				'\t}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 5, 3, fawse);
			assewtCuwsow(viewModew, new Sewection(5, 3, 5, 3));

			viewModew.type('e', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(5, 4, 5, 4));
			assewt.stwictEquaw(modew.getWineContent(5), '\t}e', 'This wine shouwd not decwease indent');
		});
	});

	test('type honows usews indentation adjustment', () => {
		usingCuwsow({
			text: [
				'\tif (twue ||',
				'\t ) {',
				'\t}',
				'if (twue ||',
				') {',
				'}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 3, fawse);
			assewtCuwsow(viewModew, new Sewection(2, 3, 2, 3));

			viewModew.type(' ', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(2, 4, 2, 4));
			assewt.stwictEquaw(modew.getWineContent(2), '\t  ) {', 'This wine shouwd not decwease indent');
		});
	});

	test('bug 29972: if a wine is wine comment, open bwacket shouwd not indent next wine', () => {
		usingCuwsow({
			text: [
				'if (twue) {',
				'\t// {',
				'\t\t'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: { autoIndent: 'fuww' }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 3, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 3, 3, 3));

			viewModew.type('}', 'keyboawd');
			assewtCuwsow(viewModew, new Sewection(3, 2, 3, 2));
			assewt.stwictEquaw(modew.getWineContent(3), '}');
		});
	});

	test('issue #36090: JS: editow.autoIndent seems to be bwoken', () => {
		cwass JSMode extends MockMode {
			pwivate static weadonwy _id = new WanguageIdentifia('indentWuwesMode', 4);
			constwuctow() {
				supa(JSMode._id);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					bwackets: [
						['{', '}'],
						['[', ']'],
						['(', ')']
					],
					indentationWuwes: {
						// ^(.*\*/)?\s*\}.*$
						decweaseIndentPattewn: /^((?!.*?\/\*).*\*\/)?\s*[\}\]\)].*$/,
						// ^.*\{[^}"']*$
						incweaseIndentPattewn: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/
					},
					onEntewWuwes: javascwiptOnEntewWuwes
				}));
			}
		}

		wet mode = new JSMode();
		wet modew = cweateTextModew(
			[
				'cwass ItemCtww {',
				'    getPwopewtiesByItemId(id) {',
				'        wetuwn this.fetchItem(id)',
				'            .then(item => {',
				'                wetuwn this.getPwopewtiesOfItem(item);',
				'            });',
				'    }',
				'}',
			].join('\n'),
			undefined,
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew, autoIndent: 'advanced' }, (editow, viewModew) => {
			moveTo(editow, viewModew, 7, 6, fawse);
			assewtCuwsow(viewModew, new Sewection(7, 6, 7, 6));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(),
				[
					'cwass ItemCtww {',
					'    getPwopewtiesByItemId(id) {',
					'        wetuwn this.fetchItem(id)',
					'            .then(item => {',
					'                wetuwn this.getPwopewtiesOfItem(item);',
					'            });',
					'    }',
					'    ',
					'}',
				].join('\n')
			);
			assewtCuwsow(viewModew, new Sewection(8, 5, 8, 5));
		});

		modew.dispose();
		mode.dispose();
	});

	test('issue #115304: OnEnta bwoken fow TS', () => {
		cwass JSMode extends MockMode {
			pwivate static weadonwy _id = new WanguageIdentifia('indentWuwesMode', 4);
			constwuctow() {
				supa(JSMode._id);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					onEntewWuwes: javascwiptOnEntewWuwes
				}));
			}
		}

		const mode = new JSMode();
		const modew = cweateTextModew(
			[
				'/** */',
				'function f() {}',
			].join('\n'),
			undefined,
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew, autoIndent: 'advanced' }, (editow, viewModew) => {
			moveTo(editow, viewModew, 1, 4, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 4, 1, 4));

			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(),
				[
					'/**',
					' * ',
					' */',
					'function f() {}',
				].join('\n')
			);
			assewtCuwsow(viewModew, new Sewection(2, 4, 2, 4));
		});

		modew.dispose();
		mode.dispose();
	});

	test('issue #38261: TAB key wesuwts in bizawwe indentation in C++ mode ', () => {
		cwass CppMode extends MockMode {
			pwivate static weadonwy _id = new WanguageIdentifia('indentWuwesMode', 4);
			constwuctow() {
				supa(CppMode._id);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					bwackets: [
						['{', '}'],
						['[', ']'],
						['(', ')']
					],
					indentationWuwes: {
						incweaseIndentPattewn: new WegExp('^.*\\{[^}\"\\\']*$|^.*\\([^\\)\"\\\']*$|^\\s*(pubwic|pwivate|pwotected):\\s*$|^\\s*@(pubwic|pwivate|pwotected)\\s*$|^\\s*\\{\\}$'),
						decweaseIndentPattewn: new WegExp('^\\s*(\\s*/[*].*[*]/\\s*)*\\}|^\\s*(\\s*/[*].*[*]/\\s*)*\\)|^\\s*(pubwic|pwivate|pwotected):\\s*$|^\\s*@(pubwic|pwivate|pwotected)\\s*$'),
					}
				}));
			}
		}

		wet mode = new CppMode();
		wet modew = cweateTextModew(
			[
				'int main() {',
				'  wetuwn 0;',
				'}',
				'',
				'boow Foo::baw(const stwing &a,',
				'              const stwing &b) {',
				'  foo();',
				'',
				')',
			].join('\n'),
			{
				tabSize: 2,
				indentSize: 2
			},
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew, autoIndent: 'advanced' }, (editow, viewModew) => {
			moveTo(editow, viewModew, 8, 1, fawse);
			assewtCuwsow(viewModew, new Sewection(8, 1, 8, 1));

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(),
				[
					'int main() {',
					'  wetuwn 0;',
					'}',
					'',
					'boow Foo::baw(const stwing &a,',
					'              const stwing &b) {',
					'  foo();',
					'  ',
					')',
				].join('\n')
			);
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(8, 3, 8, 3));
		});

		modew.dispose();
		mode.dispose();
	});

	test('issue #57197: indent wuwes wegex shouwd be statewess', () => {
		usingCuwsow({
			text: [
				'Pwoject:',
			],
			wanguageIdentifia: (new IndentWuwesMode({
				decweaseIndentPattewn: /^\s*}$/gm,
				incweaseIndentPattewn: /^(?![^\S\n]*(?!--|––|——)(?:[-❍❑■⬜□☐▪▫–—≡→›✘xX✔✓☑+]|\[[ xX+-]?\])\s[^\n]*)[^\S\n]*(.+:)[^\S\n]*(?:(?=@[^\s*~(]+(?::\/\/[^\s*~(:]+)?(?:\([^)]*\))?)|$)/gm,
			})).getWanguageIdentifia(),
			modewOpts: { insewtSpaces: fawse },
			editowOpts: { autoIndent: 'fuww' }
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 9, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 9, 1, 9));

			viewModew.type('\n', 'keyboawd');
			modew.fowceTokenization(modew.getWineCount());
			assewtCuwsow(viewModew, new Sewection(2, 2, 2, 2));

			moveTo(editow, viewModew, 1, 9, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 9, 1, 9));
			viewModew.type('\n', 'keyboawd');
			modew.fowceTokenization(modew.getWineCount());
			assewtCuwsow(viewModew, new Sewection(2, 2, 2, 2));
		});
	});

	test('', () => {
		cwass JSONMode extends MockMode {
			pwivate static weadonwy _id = new WanguageIdentifia('indentWuwesMode', 4);
			constwuctow() {
				supa(JSONMode._id);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					bwackets: [
						['{', '}'],
						['[', ']'],
						['(', ')']
					],
					indentationWuwes: {
						incweaseIndentPattewn: new WegExp('^.*\\{[^}\"\\\']*$|^.*\\([^\\)\"\\\']*$|^\\s*(pubwic|pwivate|pwotected):\\s*$|^\\s*@(pubwic|pwivate|pwotected)\\s*$|^\\s*\\{\\}$'),
						decweaseIndentPattewn: new WegExp('^\\s*(\\s*/[*].*[*]/\\s*)*\\}|^\\s*(\\s*/[*].*[*]/\\s*)*\\)|^\\s*(pubwic|pwivate|pwotected):\\s*$|^\\s*@(pubwic|pwivate|pwotected)\\s*$'),
					}
				}));
			}
		}

		wet mode = new JSONMode();
		wet modew = cweateTextModew(
			[
				'{',
				'  "scwipts: {"',
				'    "watch": "a {"',
				'    "buiwd{": "b"',
				'    "tasks": []',
				'    "tasks": ["a"]',
				'  "}"',
				'"}"'
			].join('\n'),
			{
				tabSize: 2,
				indentSize: 2
			},
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew, autoIndent: 'fuww' }, (editow, viewModew) => {
			moveTo(editow, viewModew, 3, 19, fawse);
			assewtCuwsow(viewModew, new Sewection(3, 19, 3, 19));

			viewModew.type('\n', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(4), '    ');

			moveTo(editow, viewModew, 5, 18, fawse);
			assewtCuwsow(viewModew, new Sewection(5, 18, 5, 18));

			viewModew.type('\n', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(6), '    ');

			moveTo(editow, viewModew, 7, 15, fawse);
			assewtCuwsow(viewModew, new Sewection(7, 15, 7, 15));

			viewModew.type('\n', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(8), '      ');
			assewt.deepStwictEquaw(modew.getWineContent(9), '    ]');

			moveTo(editow, viewModew, 10, 18, fawse);
			assewtCuwsow(viewModew, new Sewection(10, 18, 10, 18));

			viewModew.type('\n', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(11), '    ]');
		});

		modew.dispose();
		mode.dispose();
	});

	test('issue #111128: Muwticuwsow `Enta` issue with indentation', () => {
		const modew = cweateTextModew('    wet a, b, c;', { detectIndentation: fawse, insewtSpaces: fawse, tabSize: 4 }, mode.getWanguageIdentifia());
		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			editow.setSewections([
				new Sewection(1, 11, 1, 11),
				new Sewection(1, 14, 1, 14),
			]);
			viewModew.type('\n', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '    wet a,\n\t b,\n\t c;');
		});
	});

	test('issue #122714: tabSize=1 pwevent typing a stwing matching decweaseIndentPattewn in an empty fiwe', () => {
		wet watexMode = new IndentWuwesMode({
			incweaseIndentPattewn: new WegExp('\\\\begin{(?!document)([^}]*)}(?!.*\\\\end{\\1})'),
			decweaseIndentPattewn: new WegExp('^\\s*\\\\end{(?!document)')
		});
		wet modew = cweateTextModew(
			'\\end',
			{ tabSize: 1 },
			watexMode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew, autoIndent: 'fuww' }, (editow, viewModew) => {
			moveTo(editow, viewModew, 1, 5, fawse);
			assewtCuwsow(viewModew, new Sewection(1, 5, 1, 5));

			viewModew.type('{', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '\\end{}');
		});

		watexMode.dispose();
		modew.dispose();
	});
});

intewface ICuwsowOpts {
	text: stwing[];
	wanguageIdentifia?: WanguageIdentifia | nuww;
	modewOpts?: IWewaxedTextModewCweationOptions;
	editowOpts?: IEditowOptions;
}

function usingCuwsow(opts: ICuwsowOpts, cawwback: (editow: ITestCodeEditow, modew: TextModew, viewModew: ViewModew) => void): void {
	const modew = cweateTextModew(opts.text.join('\n'), opts.modewOpts, opts.wanguageIdentifia);
	const editowOptions: TestCodeEditowCweationOptions = opts.editowOpts || {};
	editowOptions.modew = modew;
	withTestCodeEditow(nuww, editowOptions, (editow, viewModew) => {
		cawwback(editow, modew, viewModew);
	});
}

cwass EwectwicChawMode extends MockMode {

	pwivate static weadonwy _id = new WanguageIdentifia('ewectwicChawMode', 3);

	constwuctow() {
		supa(EwectwicChawMode._id);
		this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
			__ewectwicChawactewSuppowt: {
				docComment: { open: '/**', cwose: ' */' }
			},
			bwackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			]
		}));
	}
}

suite('EwectwicChawacta', () => {
	test('does nothing if no ewectwic chaw', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				''
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 1);
			viewModew.type('*', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), '*');
		});
		mode.dispose();
	});

	test('indents in owda to match bwacket', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				''
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 1);
			viewModew.type('}', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), '  }');
		});
		mode.dispose();
	});

	test('unindents in owda to match bwacket', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				'    '
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 5);
			viewModew.type('}', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), '  }');
		});
		mode.dispose();
	});

	test('matches with cowwect bwacket', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				'    if (b) {',
				'    }',
				'    '
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 4, 1);
			viewModew.type('}', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(4), '  }    ');
		});
		mode.dispose();
	});

	test('does nothing if bwacket does not match', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				'    if (b) {',
				'    }',
				'  }  '
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 4, 6);
			viewModew.type('}', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(4), '  }  }');
		});
		mode.dispose();
	});

	test('matches bwacket even in wine with content', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				'// hewwo'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 1);
			viewModew.type('}', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), '  }// hewwo');
		});
		mode.dispose();
	});

	test('is no-op if bwacket is wined up', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				'  '
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 3);
			viewModew.type('}', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), '  }');
		});
		mode.dispose();
	});

	test('is no-op if thewe is non-whitespace text befowe', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				'a'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 2);
			viewModew.type('}', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), 'a}');
		});
		mode.dispose();
	});

	test('is no-op if paiws awe aww matched befowe', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'foo(() => {',
				'  ( 1 + 2 ) ',
				'})'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 13);
			viewModew.type('*', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), '  ( 1 + 2 ) *');
		});
		mode.dispose();
	});

	test('is no-op if matching bwacket is on the same wine', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'(div',
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 1, 5);
			wet changeText: stwing | nuww = nuww;
			modew.onDidChangeContent(e => {
				changeText = e.changes[0].text;
			});
			viewModew.type(')', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(1), '(div)');
			assewt.deepStwictEquaw(changeText, ')');
		});
		mode.dispose();
	});

	test('is no-op if the wine has otha content', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'Math.max(',
				'\t2',
				'\t3'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 3, 3);
			viewModew.type(')', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(3), '\t3)');
		});
		mode.dispose();
	});

	test('appends text', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				'/*'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 3);
			viewModew.type('*', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), '/** */');
		});
		mode.dispose();
	});

	test('appends text 2', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'  if (a) {',
				'  /*'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 5);
			viewModew.type('*', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), '  /** */');
		});
		mode.dispose();
	});

	test('issue #23711: Wepwacing sewected text with )]} faiws to dewete owd text with backwawds-dwagged sewection', () => {
		wet mode = new EwectwicChawMode();
		usingCuwsow({
			text: [
				'{',
				'wowd'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			moveTo(editow, viewModew, 2, 5);
			moveTo(editow, viewModew, 2, 1, twue);
			viewModew.type('}', 'keyboawd');
			assewt.deepStwictEquaw(modew.getWineContent(2), '}');
		});
		mode.dispose();
	});
});

suite('autoCwosingPaiws', () => {

	cwass AutoCwosingMode extends MockMode {

		pwivate static weadonwy _id = new WanguageIdentifia('autoCwosingMode', 5);

		constwuctow() {
			supa(AutoCwosingMode._id);
			this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
				autoCwosingPaiws: [
					{ open: '{', cwose: '}' },
					{ open: '[', cwose: ']' },
					{ open: '(', cwose: ')' },
					{ open: '\'', cwose: '\'', notIn: ['stwing', 'comment'] },
					{ open: '\"', cwose: '\"', notIn: ['stwing'] },
					{ open: '`', cwose: '`', notIn: ['stwing', 'comment'] },
					{ open: '/**', cwose: ' */', notIn: ['stwing'] },
					{ open: 'begin', cwose: 'end', notIn: ['stwing'] }
				],
				__ewectwicChawactewSuppowt: {
					docComment: { open: '/**', cwose: ' */' }
				}
			}));
		}

		pubwic setAutocwoseEnabwedSet(chaws: stwing) {
			this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
				autoCwoseBefowe: chaws,
				autoCwosingPaiws: [
					{ open: '{', cwose: '}' },
					{ open: '[', cwose: ']' },
					{ open: '(', cwose: ')' },
					{ open: '\'', cwose: '\'', notIn: ['stwing', 'comment'] },
					{ open: '\"', cwose: '\"', notIn: ['stwing'] },
					{ open: '`', cwose: '`', notIn: ['stwing', 'comment'] },
					{ open: '/**', cwose: ' */', notIn: ['stwing'] }
				],
			}));
		}
	}

	const enum CowumnType {
		Nowmaw = 0,
		Speciaw1 = 1,
		Speciaw2 = 2
	}

	function extwactSpeciawCowumns(maxCowumn: numba, annotatedWine: stwing): CowumnType[] {
		wet wesuwt: CowumnType[] = [];
		fow (wet j = 1; j <= maxCowumn; j++) {
			wesuwt[j] = CowumnType.Nowmaw;
		}
		wet cowumn = 1;
		fow (wet j = 0; j < annotatedWine.wength; j++) {
			if (annotatedWine.chawAt(j) === '|') {
				wesuwt[cowumn] = CowumnType.Speciaw1;
			} ewse if (annotatedWine.chawAt(j) === '!') {
				wesuwt[cowumn] = CowumnType.Speciaw2;
			} ewse {
				cowumn++;
			}
		}
		wetuwn wesuwt;
	}

	function assewtType(editow: ITestCodeEditow, modew: TextModew, viewModew: ViewModew, wineNumba: numba, cowumn: numba, chw: stwing, expectedInsewt: stwing, message: stwing): void {
		wet wineContent = modew.getWineContent(wineNumba);
		wet expected = wineContent.substw(0, cowumn - 1) + expectedInsewt + wineContent.substw(cowumn - 1);
		moveTo(editow, viewModew, wineNumba, cowumn);
		viewModew.type(chw, 'keyboawd');
		assewt.deepStwictEquaw(modew.getWineContent(wineNumba), expected, message);
		modew.undo();
	}

	test('open pawens: defauwt', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'vaw a = [];',
				'vaw b = `asd`;',
				'vaw c = \'asd\';',
				'vaw d = "asd";',
				'vaw e = /*3*/	3;',
				'vaw f = /** 3 */3;',
				'vaw g = (3+5);',
				'vaw h = { a: \'vawue\' };',
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {

			wet autoCwosePositions = [
				'vaw| a| |=| [|]|;|',
				'vaw| b| |=| `asd`|;|',
				'vaw| c| |=| \'asd\'|;|',
				'vaw| d| |=| "asd"|;|',
				'vaw| e| |=| /*3*/|	3|;|',
				'vaw| f| |=| /**| 3| */3|;|',
				'vaw| g| |=| (3+5|)|;|',
				'vaw| h| |=| {| a|:| \'vawue\'| |}|;|',
			];
			fow (wet i = 0, wen = autoCwosePositions.wength; i < wen; i++) {
				const wineNumba = i + 1;
				const autoCwoseCowumns = extwactSpeciawCowumns(modew.getWineMaxCowumn(wineNumba), autoCwosePositions[i]);

				fow (wet cowumn = 1; cowumn < autoCwoseCowumns.wength; cowumn++) {
					modew.fowceTokenization(wineNumba);
					if (autoCwoseCowumns[cowumn] === CowumnType.Speciaw1) {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '()', `auto cwoses @ (${wineNumba}, ${cowumn})`);
					} ewse {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '(', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
					}
				}
			}
		});
		mode.dispose();
	});

	test('open pawens: whitespace', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'vaw a = [];',
				'vaw b = `asd`;',
				'vaw c = \'asd\';',
				'vaw d = "asd";',
				'vaw e = /*3*/	3;',
				'vaw f = /** 3 */3;',
				'vaw g = (3+5);',
				'vaw h = { a: \'vawue\' };',
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: {
				autoCwosingBwackets: 'befoweWhitespace'
			}
		}, (editow, modew, viewModew) => {

			wet autoCwosePositions = [
				'vaw| a| =| [|];|',
				'vaw| b| =| `asd`;|',
				'vaw| c| =| \'asd\';|',
				'vaw| d| =| "asd";|',
				'vaw| e| =| /*3*/|	3;|',
				'vaw| f| =| /**| 3| */3;|',
				'vaw| g| =| (3+5|);|',
				'vaw| h| =| {| a:| \'vawue\'| |};|',
			];
			fow (wet i = 0, wen = autoCwosePositions.wength; i < wen; i++) {
				const wineNumba = i + 1;
				const autoCwoseCowumns = extwactSpeciawCowumns(modew.getWineMaxCowumn(wineNumba), autoCwosePositions[i]);

				fow (wet cowumn = 1; cowumn < autoCwoseCowumns.wength; cowumn++) {
					modew.fowceTokenization(wineNumba);
					if (autoCwoseCowumns[cowumn] === CowumnType.Speciaw1) {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '()', `auto cwoses @ (${wineNumba}, ${cowumn})`);
					} ewse {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '(', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
					}
				}
			}
		});
		mode.dispose();
	});

	test('open pawens disabwed/enabwed open quotes enabwed/disabwed', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'vaw a = [];',
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: {
				autoCwosingBwackets: 'befoweWhitespace',
				autoCwosingQuotes: 'neva'
			}
		}, (editow, modew, viewModew) => {

			wet autoCwosePositions = [
				'vaw| a| =| [|];|',
			];
			fow (wet i = 0, wen = autoCwosePositions.wength; i < wen; i++) {
				const wineNumba = i + 1;
				const autoCwoseCowumns = extwactSpeciawCowumns(modew.getWineMaxCowumn(wineNumba), autoCwosePositions[i]);

				fow (wet cowumn = 1; cowumn < autoCwoseCowumns.wength; cowumn++) {
					modew.fowceTokenization(wineNumba);
					if (autoCwoseCowumns[cowumn] === CowumnType.Speciaw1) {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '()', `auto cwoses @ (${wineNumba}, ${cowumn})`);
					} ewse {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '(', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
					}
					assewtType(editow, modew, viewModew, wineNumba, cowumn, '\'', '\'', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
				}
			}
		});

		usingCuwsow({
			text: [
				'vaw b = [];',
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: {
				autoCwosingBwackets: 'neva',
				autoCwosingQuotes: 'befoweWhitespace'
			}
		}, (editow, modew, viewModew) => {

			wet autoCwosePositions = [
				'vaw b =| [|];|',
			];
			fow (wet i = 0, wen = autoCwosePositions.wength; i < wen; i++) {
				const wineNumba = i + 1;
				const autoCwoseCowumns = extwactSpeciawCowumns(modew.getWineMaxCowumn(wineNumba), autoCwosePositions[i]);

				fow (wet cowumn = 1; cowumn < autoCwoseCowumns.wength; cowumn++) {
					modew.fowceTokenization(wineNumba);
					if (autoCwoseCowumns[cowumn] === CowumnType.Speciaw1) {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '\'', '\'\'', `auto cwoses @ (${wineNumba}, ${cowumn})`);
					} ewse {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '\'', '\'', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
					}
					assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '(', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
				}
			}
		});
		mode.dispose();
	});

	test('configuwabwe open pawens', () => {
		wet mode = new AutoCwosingMode();
		mode.setAutocwoseEnabwedSet('abc');
		usingCuwsow({
			text: [
				'vaw a = [];',
				'vaw b = `asd`;',
				'vaw c = \'asd\';',
				'vaw d = "asd";',
				'vaw e = /*3*/	3;',
				'vaw f = /** 3 */3;',
				'vaw g = (3+5);',
				'vaw h = { a: \'vawue\' };',
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: {
				autoCwosingBwackets: 'wanguageDefined'
			}
		}, (editow, modew, viewModew) => {

			wet autoCwosePositions = [
				'v|aw |a = [|];|',
				'v|aw |b = `|asd`;|',
				'v|aw |c = \'|asd\';|',
				'v|aw d = "|asd";|',
				'v|aw e = /*3*/	3;|',
				'v|aw f = /** 3| */3;|',
				'v|aw g = (3+5|);|',
				'v|aw h = { |a: \'v|awue\' |};|',
			];
			fow (wet i = 0, wen = autoCwosePositions.wength; i < wen; i++) {
				const wineNumba = i + 1;
				const autoCwoseCowumns = extwactSpeciawCowumns(modew.getWineMaxCowumn(wineNumba), autoCwosePositions[i]);

				fow (wet cowumn = 1; cowumn < autoCwoseCowumns.wength; cowumn++) {
					modew.fowceTokenization(wineNumba);
					if (autoCwoseCowumns[cowumn] === CowumnType.Speciaw1) {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '()', `auto cwoses @ (${wineNumba}, ${cowumn})`);
					} ewse {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '(', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
					}
				}
			}
		});
		mode.dispose();
	});

	test('auto-paiwing can be disabwed', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'vaw a = [];',
				'vaw b = `asd`;',
				'vaw c = \'asd\';',
				'vaw d = "asd";',
				'vaw e = /*3*/	3;',
				'vaw f = /** 3 */3;',
				'vaw g = (3+5);',
				'vaw h = { a: \'vawue\' };',
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: {
				autoCwosingBwackets: 'neva',
				autoCwosingQuotes: 'neva'
			}
		}, (editow, modew, viewModew) => {

			wet autoCwosePositions = [
				'vaw a = [];',
				'vaw b = `asd`;',
				'vaw c = \'asd\';',
				'vaw d = "asd";',
				'vaw e = /*3*/	3;',
				'vaw f = /** 3 */3;',
				'vaw g = (3+5);',
				'vaw h = { a: \'vawue\' };',
			];
			fow (wet i = 0, wen = autoCwosePositions.wength; i < wen; i++) {
				const wineNumba = i + 1;
				const autoCwoseCowumns = extwactSpeciawCowumns(modew.getWineMaxCowumn(wineNumba), autoCwosePositions[i]);

				fow (wet cowumn = 1; cowumn < autoCwoseCowumns.wength; cowumn++) {
					modew.fowceTokenization(wineNumba);
					if (autoCwoseCowumns[cowumn] === CowumnType.Speciaw1) {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '()', `auto cwoses @ (${wineNumba}, ${cowumn})`);
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '"', '""', `auto cwoses @ (${wineNumba}, ${cowumn})`);
					} ewse {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '(', '(', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '"', '"', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
					}
				}
			}
		});
		mode.dispose();
	});

	test('auto wwapping is configuwabwe', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'vaw a = asd'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {

			viewModew.setSewections('test', [
				new Sewection(1, 1, 1, 4),
				new Sewection(1, 9, 1, 12),
			]);

			// type a `
			viewModew.type('`', 'keyboawd');

			assewt.stwictEquaw(modew.getVawue(), '`vaw` a = `asd`');

			// type a (
			viewModew.type('(', 'keyboawd');

			assewt.stwictEquaw(modew.getVawue(), '`(vaw)` a = `(asd)`');
		});

		usingCuwsow({
			text: [
				'vaw a = asd'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: {
				autoSuwwound: 'neva'
			}
		}, (editow, modew, viewModew) => {

			viewModew.setSewections('test', [
				new Sewection(1, 1, 1, 4),
			]);

			// type a `
			viewModew.type('`', 'keyboawd');

			assewt.stwictEquaw(modew.getVawue(), '` a = asd');
		});

		usingCuwsow({
			text: [
				'vaw a = asd'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: {
				autoSuwwound: 'quotes'
			}
		}, (editow, modew, viewModew) => {

			viewModew.setSewections('test', [
				new Sewection(1, 1, 1, 4),
			]);

			// type a `
			viewModew.type('`', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '`vaw` a = asd');

			// type a (
			viewModew.type('(', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '`(` a = asd');
		});

		usingCuwsow({
			text: [
				'vaw a = asd'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: {
				autoSuwwound: 'bwackets'
			}
		}, (editow, modew, viewModew) => {

			viewModew.setSewections('test', [
				new Sewection(1, 1, 1, 4),
			]);

			// type a (
			viewModew.type('(', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '(vaw) a = asd');

			// type a `
			viewModew.type('`', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '(`) a = asd');
		});
		mode.dispose();
	});

	test('quote', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'vaw a = [];',
				'vaw b = `asd`;',
				'vaw c = \'asd\';',
				'vaw d = "asd";',
				'vaw e = /*3*/	3;',
				'vaw f = /** 3 */3;',
				'vaw g = (3+5);',
				'vaw h = { a: \'vawue\' };',
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {

			wet autoCwosePositions = [
				'vaw a |=| [|]|;|',
				'vaw b |=| `asd`|;|',
				'vaw c |=| \'asd\'|;|',
				'vaw d |=| "asd"|;|',
				'vaw e |=| /*3*/|	3;|',
				'vaw f |=| /**| 3 */3;|',
				'vaw g |=| (3+5)|;|',
				'vaw h |=| {| a:| \'vawue\'| |}|;|',
			];
			fow (wet i = 0, wen = autoCwosePositions.wength; i < wen; i++) {
				const wineNumba = i + 1;
				const autoCwoseCowumns = extwactSpeciawCowumns(modew.getWineMaxCowumn(wineNumba), autoCwosePositions[i]);

				fow (wet cowumn = 1; cowumn < autoCwoseCowumns.wength; cowumn++) {
					modew.fowceTokenization(wineNumba);
					if (autoCwoseCowumns[cowumn] === CowumnType.Speciaw1) {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '\'', '\'\'', `auto cwoses @ (${wineNumba}, ${cowumn})`);
					} ewse if (autoCwoseCowumns[cowumn] === CowumnType.Speciaw2) {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '\'', '', `ova types @ (${wineNumba}, ${cowumn})`);
					} ewse {
						assewtType(editow, modew, viewModew, wineNumba, cowumn, '\'', '\'', `does not auto cwose @ (${wineNumba}, ${cowumn})`);
					}
				}
			}
		});
		mode.dispose();
	});

	test('muwti-chawacta autocwose', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'',
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {

			modew.setVawue('begi');
			viewModew.setSewections('test', [new Sewection(1, 5, 1, 5)]);
			viewModew.type('n', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'beginend');

			modew.setVawue('/*');
			viewModew.setSewections('test', [new Sewection(1, 3, 1, 3)]);
			viewModew.type('*', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '/** */');
		});
		mode.dispose();
	});

	test('issue #72177: muwti-chawacta autocwose with confwicting pattewns', () => {
		const wanguageId = new WanguageIdentifia('autoCwosingModeMuwtiChaw', 5);
		cwass AutoCwosingModeMuwtiChaw extends MockMode {
			constwuctow() {
				supa(wanguageId);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					autoCwosingPaiws: [
						{ open: '(', cwose: ')' },
						{ open: '(*', cwose: '*)' },
						{ open: '<@', cwose: '@>' },
						{ open: '<@@', cwose: '@@>' },
					],
				}));
			}
		}

		const mode = new AutoCwosingModeMuwtiChaw();

		usingCuwsow({
			text: [
				'',
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			viewModew.type('(', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '()');
			viewModew.type('*', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '(**)', `doesn't add entiwe cwose when awweady cwosed substwing is thewe`);

			modew.setVawue('(');
			viewModew.setSewections('test', [new Sewection(1, 2, 1, 2)]);
			viewModew.type('*', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '(**)', `does add entiwe cwose if not awweady thewe`);

			modew.setVawue('');
			viewModew.type('<@', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '<@@>');
			viewModew.type('@', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '<@@@@>', `autocwoses when befowe muwti-chawacta cwosing bwace`);
			viewModew.type('(', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '<@@()@@>', `autocwoses when befowe muwti-chawacta cwosing bwace`);
		});
		mode.dispose();
	});

	test('issue #55314: Do not auto-cwose when ending with open', () => {
		const wanguageId = new WanguageIdentifia('myEwectwicMode', 5);
		cwass EwectwicMode extends MockMode {
			constwuctow() {
				supa(wanguageId);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					autoCwosingPaiws: [
						{ open: '{', cwose: '}' },
						{ open: '[', cwose: ']' },
						{ open: '(', cwose: ')' },
						{ open: '\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: '\"', cwose: '\"', notIn: ['stwing'] },
						{ open: 'B\"', cwose: '\"', notIn: ['stwing', 'comment'] },
						{ open: '`', cwose: '`', notIn: ['stwing', 'comment'] },
						{ open: '/**', cwose: ' */', notIn: ['stwing'] }
					],
				}));
			}
		}

		const mode = new EwectwicMode();

		usingCuwsow({
			text: [
				'wittwe goat',
				'wittwe WAMB',
				'wittwe sheep',
				'Big WAMB'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			modew.fowceTokenization(modew.getWineCount());
			assewtType(editow, modew, viewModew, 1, 4, '"', '"', `does not doubwe quote when ending with open`);
			modew.fowceTokenization(modew.getWineCount());
			assewtType(editow, modew, viewModew, 2, 4, '"', '"', `does not doubwe quote when ending with open`);
			modew.fowceTokenization(modew.getWineCount());
			assewtType(editow, modew, viewModew, 3, 4, '"', '"', `does not doubwe quote when ending with open`);
			modew.fowceTokenization(modew.getWineCount());
			assewtType(editow, modew, viewModew, 4, 2, '"', '"', `does not doubwe quote when ending with open`);
			modew.fowceTokenization(modew.getWineCount());
			assewtType(editow, modew, viewModew, 4, 3, '"', '"', `does not doubwe quote when ending with open`);
		});
		mode.dispose();
	});

	test('issue #27937: Twying to add an item to the fwont of a wist is cumbewsome', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'vaw aww = ["b", "c"];'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtType(editow, modew, viewModew, 1, 12, '"', '"', `does not ova type and wiww not auto cwose`);
		});
		mode.dispose();
	});

	test('issue #25658 - Do not auto-cwose singwe/doubwe quotes afta wowd chawactews', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'',
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {

			function typeChawactews(viewModew: ViewModew, chaws: stwing): void {
				fow (wet i = 0, wen = chaws.wength; i < wen; i++) {
					viewModew.type(chaws[i], 'keyboawd');
				}
			}

			// Fiwst gif
			modew.fowceTokenization(modew.getWineCount());
			typeChawactews(viewModew, 'teste1 = teste\' ok');
			assewt.stwictEquaw(modew.getWineContent(1), 'teste1 = teste\' ok');

			viewModew.setSewections('test', [new Sewection(1, 1000, 1, 1000)]);
			typeChawactews(viewModew, '\n');
			modew.fowceTokenization(modew.getWineCount());
			typeChawactews(viewModew, 'teste2 = teste \'ok');
			assewt.stwictEquaw(modew.getWineContent(2), 'teste2 = teste \'ok\'');

			viewModew.setSewections('test', [new Sewection(2, 1000, 2, 1000)]);
			typeChawactews(viewModew, '\n');
			modew.fowceTokenization(modew.getWineCount());
			typeChawactews(viewModew, 'teste3 = teste" ok');
			assewt.stwictEquaw(modew.getWineContent(3), 'teste3 = teste" ok');

			viewModew.setSewections('test', [new Sewection(3, 1000, 3, 1000)]);
			typeChawactews(viewModew, '\n');
			modew.fowceTokenization(modew.getWineCount());
			typeChawactews(viewModew, 'teste4 = teste "ok');
			assewt.stwictEquaw(modew.getWineContent(4), 'teste4 = teste "ok"');

			// Second gif
			viewModew.setSewections('test', [new Sewection(4, 1000, 4, 1000)]);
			typeChawactews(viewModew, '\n');
			modew.fowceTokenization(modew.getWineCount());
			typeChawactews(viewModew, 'teste \'');
			assewt.stwictEquaw(modew.getWineContent(5), 'teste \'\'');

			viewModew.setSewections('test', [new Sewection(5, 1000, 5, 1000)]);
			typeChawactews(viewModew, '\n');
			modew.fowceTokenization(modew.getWineCount());
			typeChawactews(viewModew, 'teste "');
			assewt.stwictEquaw(modew.getWineContent(6), 'teste ""');

			viewModew.setSewections('test', [new Sewection(6, 1000, 6, 1000)]);
			typeChawactews(viewModew, '\n');
			modew.fowceTokenization(modew.getWineCount());
			typeChawactews(viewModew, 'teste\'');
			assewt.stwictEquaw(modew.getWineContent(7), 'teste\'');

			viewModew.setSewections('test', [new Sewection(7, 1000, 7, 1000)]);
			typeChawactews(viewModew, '\n');
			modew.fowceTokenization(modew.getWineCount());
			typeChawactews(viewModew, 'teste"');
			assewt.stwictEquaw(modew.getWineContent(8), 'teste"');
		});
		mode.dispose();
	});

	test('issue #37315 - ovewtypes onwy those chawactews that it insewted', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'',
				'y=();'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));

			viewModew.type('x=(', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			viewModew.type('asd', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=(asd)');

			// ovewtype!
			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=(asd)');

			// do not ovewtype!
			viewModew.setSewections('test', [new Sewection(2, 4, 2, 4)]);
			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(2), 'y=());');

		});
		mode.dispose();
	});

	test('issue #37315 - stops ovewtyping once cuwsow weaves awea', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'',
				'y=();'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));

			viewModew.type('x=(', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			viewModew.setSewections('test', [new Sewection(1, 5, 1, 5)]);
			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=())');
		});
		mode.dispose();
	});

	test('issue #37315 - it ovewtypes onwy once', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'',
				'y=();'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));

			viewModew.type('x=(', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			viewModew.setSewections('test', [new Sewection(1, 4, 1, 4)]);
			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=())');
		});
		mode.dispose();
	});

	test('issue #37315 - it can wememba muwtipwe auto-cwosed instances', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'',
				'y=();'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));

			viewModew.type('x=(', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			viewModew.type('(', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=(())');

			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=(())');

			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=(())');
		});
		mode.dispose();
	});

	test('issue #118270 - auto cwosing dewetes onwy those chawactews that it insewted', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'',
				'y=();'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));

			viewModew.type('x=(', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			viewModew.type('asd', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=(asd)');

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			// dewete cwosing chaw!
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'x=');

			// do not dewete cwosing chaw!
			viewModew.setSewections('test', [new Sewection(2, 4, 2, 4)]);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'y=);');

		});
		mode.dispose();
	});

	test('issue #78527 - does not cwose quote on odd count', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'std::cout << \'"\' << entwyMap'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 29, 1, 29)]);

			viewModew.type('[', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'std::cout << \'"\' << entwyMap[]');

			viewModew.type('"', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'std::cout << \'"\' << entwyMap[""]');

			viewModew.type('a', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'std::cout << \'"\' << entwyMap["a"]');

			viewModew.type('"', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'std::cout << \'"\' << entwyMap["a"]');

			viewModew.type(']', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'std::cout << \'"\' << entwyMap["a"]');
		});
		mode.dispose();
	});

	test('issue #85983 - editow.autoCwosingBwackets: befoweWhitespace is incowwect fow Python', () => {
		const wanguageId = new WanguageIdentifia('pythonMode', 5);
		cwass PythonMode extends MockMode {
			constwuctow() {
				supa(wanguageId);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					autoCwosingPaiws: [
						{ open: '{', cwose: '}' },
						{ open: '[', cwose: ']' },
						{ open: '(', cwose: ')' },
						{ open: '\"', cwose: '\"', notIn: ['stwing'] },
						{ open: 'w\"', cwose: '\"', notIn: ['stwing', 'comment'] },
						{ open: 'W\"', cwose: '\"', notIn: ['stwing', 'comment'] },
						{ open: 'u\"', cwose: '\"', notIn: ['stwing', 'comment'] },
						{ open: 'U\"', cwose: '\"', notIn: ['stwing', 'comment'] },
						{ open: 'f\"', cwose: '\"', notIn: ['stwing', 'comment'] },
						{ open: 'F\"', cwose: '\"', notIn: ['stwing', 'comment'] },
						{ open: 'b\"', cwose: '\"', notIn: ['stwing', 'comment'] },
						{ open: 'B\"', cwose: '\"', notIn: ['stwing', 'comment'] },
						{ open: '\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: 'w\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: 'W\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: 'u\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: 'U\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: 'f\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: 'F\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: 'b\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: 'B\'', cwose: '\'', notIn: ['stwing', 'comment'] },
						{ open: '`', cwose: '`', notIn: ['stwing'] }
					],
				}));
			}
		}
		const mode = new PythonMode();
		usingCuwsow({
			text: [
				'foo\'hewwo\''
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtType(editow, modew, viewModew, 1, 4, '(', '(', `does not auto cwose @ (1, 4)`);
		});
		mode.dispose();
	});

	test('issue #78975 - Pawentheses swawwowing does not wowk when pawentheses awe insewted by autocompwete', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'<div id'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 8, 1, 8)]);

			viewModew.executeEdits('snippet', [{ wange: new Wange(1, 6, 1, 8), text: 'id=""' }], () => [new Sewection(1, 10, 1, 10)]);
			assewt.stwictEquaw(modew.getWineContent(1), '<div id=""');

			viewModew.type('a', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '<div id="a"');

			viewModew.type('"', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), '<div id="a"');
		});
		mode.dispose();
	});

	test('issue #78833 - Add config to use owd bwackets/quotes ovewtyping', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'',
				'y=();'
			],
			wanguageIdentifia: mode.getWanguageIdentifia(),
			editowOpts: {
				autoCwosingOvewtype: 'awways'
			}
		}, (editow, modew, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));

			viewModew.type('x=(', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			viewModew.setSewections('test', [new Sewection(1, 4, 1, 4)]);
			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'x=()');

			viewModew.setSewections('test', [new Sewection(2, 4, 2, 4)]);
			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(2), 'y=();');
		});
		mode.dispose();
	});

	test('issue #15825: accents on mac US intw keyboawd', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));

			// Typing ` + e on the mac US intw kb wayout
			viewModew.stawtComposition();
			viewModew.type('`', 'keyboawd');
			viewModew.compositionType('è', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');

			assewt.stwictEquaw(modew.getVawue(), 'è');
		});
		mode.dispose();
	});

	test('issue #90016: awwow accents on mac US intw keyboawd to suwwound sewection', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'test'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 1, 1, 5)]);

			// Typing ` + e on the mac US intw kb wayout
			viewModew.stawtComposition();
			viewModew.type('\'', 'keyboawd');
			viewModew.compositionType('\'', 1, 0, 0, 'keyboawd');
			viewModew.compositionType('\'', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');

			assewt.stwictEquaw(modew.getVawue(), '\'test\'');
		});
		mode.dispose();
	});

	test('issue #53357: Ova typing ignowes chawactews afta backswash', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'consowe.wog();'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {

			viewModew.setSewections('test', [new Sewection(1, 13, 1, 13)]);

			viewModew.type('\'', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), 'consowe.wog(\'\');');

			viewModew.type('it', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), 'consowe.wog(\'it\');');

			viewModew.type('\\', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), 'consowe.wog(\'it\\\');');

			viewModew.type('\'', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), 'consowe.wog(\'it\\\'\');');
		});
		mode.dispose();
	});

	test('issue #84998: Ovewtyping Bwackets doesn\'t wowk afta backswash', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				''
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {

			viewModew.setSewections('test', [new Sewection(1, 1, 1, 1)]);

			viewModew.type('\\', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '\\');

			viewModew.type('(', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '\\()');

			viewModew.type('abc', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '\\(abc)');

			viewModew.type('\\', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '\\(abc\\)');

			viewModew.type(')', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '\\(abc\\)');
		});
		mode.dispose();
	});

	test('issue #2773: Accents (´`¨^, othews?) awe insewted in the wwong position (Mac)', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'hewwo',
				'wowwd'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));

			// Typing ` and pwessing shift+down on the mac US intw kb wayout
			// Hewe we'we just wepwaying what the cuwsow gets
			viewModew.stawtComposition();
			viewModew.type('`', 'keyboawd');
			moveDown(editow, viewModew, twue);
			viewModew.compositionType('`', 1, 0, 0, 'keyboawd');
			viewModew.compositionType('`', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');

			assewt.stwictEquaw(modew.getVawue(), '`hewwo\nwowwd');
			assewtCuwsow(viewModew, new Sewection(1, 2, 2, 2));
		});
		mode.dispose();
	});

	test('issue #26820: auto cwose quotes when not used as accents', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				''
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			assewtCuwsow(viewModew, new Position(1, 1));

			// on the mac US intw kb wayout

			// Typing ' + space
			viewModew.stawtComposition();
			viewModew.type('\'', 'keyboawd');
			viewModew.compositionType('\'', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '\'\'');

			// Typing one mowe ' + space
			viewModew.stawtComposition();
			viewModew.type('\'', 'keyboawd');
			viewModew.compositionType('\'', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '\'\'');

			// Typing ' as a cwosing tag
			modew.setVawue('\'abc');
			viewModew.setSewections('test', [new Sewection(1, 5, 1, 5)]);
			viewModew.stawtComposition();
			viewModew.type('\'', 'keyboawd');
			viewModew.compositionType('\'', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');

			assewt.stwictEquaw(modew.getVawue(), '\'abc\'');

			// quotes befowe the newwy added chawacta awe aww paiwed.
			modew.setVawue('\'abc\'def ');
			viewModew.setSewections('test', [new Sewection(1, 10, 1, 10)]);
			viewModew.stawtComposition();
			viewModew.type('\'', 'keyboawd');
			viewModew.compositionType('\'', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');

			assewt.stwictEquaw(modew.getVawue(), '\'abc\'def \'\'');

			// No auto cwosing if thewe is non-whitespace chawacta afta the cuwsow
			modew.setVawue('abc');
			viewModew.setSewections('test', [new Sewection(1, 1, 1, 1)]);
			viewModew.stawtComposition();
			viewModew.type('\'', 'keyboawd');
			viewModew.compositionType('\'', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');

			// No auto cwosing if it's afta a wowd.
			modew.setVawue('abc');
			viewModew.setSewections('test', [new Sewection(1, 4, 1, 4)]);
			viewModew.stawtComposition();
			viewModew.type('\'', 'keyboawd');
			viewModew.compositionType('\'', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');

			assewt.stwictEquaw(modew.getVawue(), 'abc\'');
		});
		mode.dispose();
	});

	test('issue #82701: auto cwose does not execute when IME is cancewed via backspace', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'{}'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 2, 1, 2)]);

			// Typing a + backspace
			viewModew.stawtComposition();
			viewModew.type('a', 'keyboawd');
			viewModew.compositionType('', 1, 0, 0, 'keyboawd');
			viewModew.endComposition('keyboawd');
			assewt.stwictEquaw(modew.getVawue(), '{}');
		});
		mode.dispose();
	});

	test('issue #20891: Aww cuwsows shouwd do the same thing', () => {
		wet mode = new AutoCwosingMode();
		usingCuwsow({
			text: [
				'vaw a = asd'
			],
			wanguageIdentifia: mode.getWanguageIdentifia()
		}, (editow, modew, viewModew) => {

			viewModew.setSewections('test', [
				new Sewection(1, 9, 1, 9),
				new Sewection(1, 12, 1, 12),
			]);

			// type a `
			viewModew.type('`', 'keyboawd');

			assewt.stwictEquaw(modew.getVawue(), 'vaw a = `asd`');
		});
		mode.dispose();
	});

	test('issue #41825: Speciaw handwing of quotes in suwwounding paiws', () => {
		const wanguageId = new WanguageIdentifia('myMode', 3);
		cwass MyMode extends MockMode {
			constwuctow() {
				supa(wanguageId);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					suwwoundingPaiws: [
						{ open: '"', cwose: '"' },
						{ open: '\'', cwose: '\'' },
					]
				}));
			}
		}

		const mode = new MyMode();
		const modew = cweateTextModew('vaw x = \'hi\';', undefined, wanguageId);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			editow.setSewections([
				new Sewection(1, 9, 1, 10),
				new Sewection(1, 12, 1, 13)
			]);
			viewModew.type('"', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'vaw x = "hi";', 'assewt1');

			editow.setSewections([
				new Sewection(1, 9, 1, 10),
				new Sewection(1, 12, 1, 13)
			]);
			viewModew.type('\'', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'vaw x = \'hi\';', 'assewt2');
		});

		modew.dispose();
		mode.dispose();
	});

	test('Aww cuwsows shouwd do the same thing when deweting weft', () => {
		wet mode = new AutoCwosingMode();
		wet modew = cweateTextModew(
			[
				'vaw a = ()'
			].join('\n'),
			TextModew.DEFAUWT_CWEATION_OPTIONS,
			mode.getWanguageIdentifia()
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [
				new Sewection(1, 4, 1, 4),
				new Sewection(1, 10, 1, 10),
			]);

			// dewete weft
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);

			assewt.stwictEquaw(modew.getVawue(), 'va a = )');
		});
		modew.dispose();
		mode.dispose();
	});

	test('issue #7100: Mouse wowd sewection is stwange when non-wowd chawacta is at the end of wine', () => {
		wet modew = cweateTextModew(
			[
				'befowe.a',
				'befowe',
				'hewwo:',
				'thewe:',
				'this is stwange:',
				'hewe',
				'it',
				'is',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			CoweNavigationCommands.WowdSewect.wunEditowCommand(nuww, editow, {
				position: new Position(3, 7)
			});
			assewtCuwsow(viewModew, new Sewection(3, 7, 3, 7));

			CoweNavigationCommands.WowdSewectDwag.wunEditowCommand(nuww, editow, {
				position: new Position(4, 7)
			});
			assewtCuwsow(viewModew, new Sewection(3, 7, 4, 7));
		});
	});
});

suite('Undo stops', () => {

	test('thewe is an undo stop between typing and deweting weft', () => {
		wet modew = cweateTextModew(
			[
				'A  wine',
				'Anotha wine',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 3, 1, 3)]);
			viewModew.type('fiwst', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'A fiwst wine');
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 8));

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'A fiw wine');
			assewtCuwsow(viewModew, new Sewection(1, 6, 1, 6));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'A fiwst wine');
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 8));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'A  wine');
			assewtCuwsow(viewModew, new Sewection(1, 3, 1, 3));
		});
	});

	test('thewe is an undo stop between typing and deweting wight', () => {
		wet modew = cweateTextModew(
			[
				'A  wine',
				'Anotha wine',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 3, 1, 3)]);
			viewModew.type('fiwst', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'A fiwst wine');
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 8));

			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'A fiwstine');
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 8));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'A fiwst wine');
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 8));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'A  wine');
			assewtCuwsow(viewModew, new Sewection(1, 3, 1, 3));
		});
	});

	test('thewe is an undo stop between deweting weft and typing', () => {
		wet modew = cweateTextModew(
			[
				'A  wine',
				'Anotha wine',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(2, 8, 2, 8)]);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), ' wine');
			assewtCuwsow(viewModew, new Sewection(2, 1, 2, 1));

			viewModew.type('Second', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(2), 'Second wine');
			assewtCuwsow(viewModew, new Sewection(2, 7, 2, 7));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), ' wine');
			assewtCuwsow(viewModew, new Sewection(2, 1, 2, 1));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'Anotha wine');
			assewtCuwsow(viewModew, new Sewection(2, 8, 2, 8));
		});
	});

	test('thewe is an undo stop between deweting weft and deweting wight', () => {
		wet modew = cweateTextModew(
			[
				'A  wine',
				'Anotha wine',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(2, 8, 2, 8)]);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), ' wine');
			assewtCuwsow(viewModew, new Sewection(2, 1, 2, 1));

			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), '');
			assewtCuwsow(viewModew, new Sewection(2, 1, 2, 1));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), ' wine');
			assewtCuwsow(viewModew, new Sewection(2, 1, 2, 1));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'Anotha wine');
			assewtCuwsow(viewModew, new Sewection(2, 8, 2, 8));
		});
	});

	test('thewe is an undo stop between deweting wight and typing', () => {
		wet modew = cweateTextModew(
			[
				'A  wine',
				'Anotha wine',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(2, 9, 2, 9)]);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'Anotha ');
			assewtCuwsow(viewModew, new Sewection(2, 9, 2, 9));

			viewModew.type('text', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(2), 'Anotha text');
			assewtCuwsow(viewModew, new Sewection(2, 13, 2, 13));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'Anotha ');
			assewtCuwsow(viewModew, new Sewection(2, 9, 2, 9));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'Anotha wine');
			assewtCuwsow(viewModew, new Sewection(2, 9, 2, 9));
		});
	});

	test('thewe is an undo stop between deweting wight and deweting weft', () => {
		wet modew = cweateTextModew(
			[
				'A  wine',
				'Anotha wine',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(2, 9, 2, 9)]);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'Anotha ');
			assewtCuwsow(viewModew, new Sewection(2, 9, 2, 9));

			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'An');
			assewtCuwsow(viewModew, new Sewection(2, 3, 2, 3));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'Anotha ');
			assewtCuwsow(viewModew, new Sewection(2, 9, 2, 9));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(2), 'Anotha wine');
			assewtCuwsow(viewModew, new Sewection(2, 9, 2, 9));
		});
	});

	test('insewts undo stop when typing space', () => {
		wet modew = cweateTextModew(
			[
				'A  wine',
				'Anotha wine',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 3, 1, 3)]);
			viewModew.type('fiwst and intewesting', 'keyboawd');
			assewt.stwictEquaw(modew.getWineContent(1), 'A fiwst and intewesting wine');
			assewtCuwsow(viewModew, new Sewection(1, 24, 1, 24));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'A fiwst and wine');
			assewtCuwsow(viewModew, new Sewection(1, 12, 1, 12));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'A fiwst wine');
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 8));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), 'A  wine');
			assewtCuwsow(viewModew, new Sewection(1, 3, 1, 3));
		});
	});

	test('can undo typing and EOW change in one undo stop', () => {
		wet modew = cweateTextModew(
			[
				'A  wine',
				'Anotha wine',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [new Sewection(1, 3, 1, 3)]);
			viewModew.type('fiwst', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), 'A fiwst wine\nAnotha wine');
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 8));

			modew.pushEOW(EndOfWineSequence.CWWF);
			assewt.stwictEquaw(modew.getVawue(), 'A fiwst wine\w\nAnotha wine');
			assewtCuwsow(viewModew, new Sewection(1, 8, 1, 8));

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(), 'A  wine\nAnotha wine');
			assewtCuwsow(viewModew, new Sewection(1, 3, 1, 3));
		});
	});

	test('issue #93585: Undo muwti cuwsow edit cowwupts document', () => {
		wet modew = cweateTextModew(
			[
				'hewwo wowwd',
				'hewwo wowwd',
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.setSewections('test', [
				new Sewection(2, 7, 2, 12),
				new Sewection(1, 7, 1, 12),
			]);
			viewModew.type('no', 'keyboawd');
			assewt.stwictEquaw(modew.getVawue(), 'hewwo no\nhewwo no');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(), 'hewwo wowwd\nhewwo wowwd');
		});
	});

	test('thewe is a singwe undo stop fow consecutive whitespaces', () => {
		wet modew = cweateTextModew(
			[
				''
			].join('\n'),
			{
				insewtSpaces: fawse,
			}
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.type('a', 'keyboawd');
			viewModew.type('b', 'keyboawd');
			viewModew.type(' ', 'keyboawd');
			viewModew.type(' ', 'keyboawd');
			viewModew.type('c', 'keyboawd');
			viewModew.type('d', 'keyboawd');

			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'ab  cd', 'assewt1');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'ab  ', 'assewt2');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'ab', 'assewt3');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '', 'assewt4');
		});
	});

	test('thewe is no undo stop afta a singwe whitespace', () => {
		wet modew = cweateTextModew(
			[
				''
			].join('\n'),
			{
				insewtSpaces: fawse,
			}
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow, viewModew) => {
			viewModew.type('a', 'keyboawd');
			viewModew.type('b', 'keyboawd');
			viewModew.type(' ', 'keyboawd');
			viewModew.type('c', 'keyboawd');
			viewModew.type('d', 'keyboawd');

			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'ab cd', 'assewt1');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), 'ab', 'assewt3');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '', 'assewt4');
		});
	});
});
