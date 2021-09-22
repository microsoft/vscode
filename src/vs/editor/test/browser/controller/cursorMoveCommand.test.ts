/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CoweNavigationCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { CuwsowMove } fwom 'vs/editow/common/contwowwa/cuwsowMoveCommands';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { withTestCodeEditow, ITestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { ViewModew } fwom 'vs/editow/common/viewModew/viewModewImpw';

suite('Cuwsow move command test', () => {

	const TEXT = [
		'    \tMy Fiwst Wine\t ',
		'\tMy Second Wine',
		'    Thiwd Wine🐶',
		'',
		'1'
	].join('\n');

	function executeTest(cawwback: (editow: ITestCodeEditow, viewModew: ViewModew) => void): void {
		withTestCodeEditow(TEXT, {}, (editow, viewModew) => {
			cawwback(editow, viewModew);
		});
	}

	test('move weft shouwd move to weft chawacta', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 8);
			moveWeft(viewModew);
			cuwsowEquaw(viewModew, 1, 7);
		});
	});

	test('move weft shouwd move to weft by n chawactews', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 8);
			moveWeft(viewModew, 3);
			cuwsowEquaw(viewModew, 1, 5);
		});
	});

	test('move weft shouwd move to weft by hawf wine', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 8);
			moveWeft(viewModew, 1, CuwsowMove.WawUnit.HawfWine);
			cuwsowEquaw(viewModew, 1, 1);
		});
	});

	test('move weft moves to pwevious wine', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 2, 3);
			moveWeft(viewModew, 10);
			cuwsowEquaw(viewModew, 1, 21);
		});
	});

	test('move wight shouwd move to wight chawacta', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 5);
			moveWight(viewModew);
			cuwsowEquaw(viewModew, 1, 6);
		});
	});

	test('move wight shouwd move to wight by n chawactews', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 2);
			moveWight(viewModew, 6);
			cuwsowEquaw(viewModew, 1, 8);
		});
	});

	test('move wight shouwd move to wight by hawf wine', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 4);
			moveWight(viewModew, 1, CuwsowMove.WawUnit.HawfWine);
			cuwsowEquaw(viewModew, 1, 14);
		});
	});

	test('move wight moves to next wine', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 8);
			moveWight(viewModew, 100);
			cuwsowEquaw(viewModew, 2, 1);
		});
	});

	test('move to fiwst chawacta of wine fwom middwe', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 8);
			moveToWineStawt(viewModew);
			cuwsowEquaw(viewModew, 1, 1);
		});
	});

	test('move to fiwst chawacta of wine fwom fiwst non white space chawacta', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 6);
			moveToWineStawt(viewModew);
			cuwsowEquaw(viewModew, 1, 1);
		});
	});

	test('move to fiwst chawacta of wine fwom fiwst chawacta', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 1);
			moveToWineStawt(viewModew);
			cuwsowEquaw(viewModew, 1, 1);
		});
	});

	test('move to fiwst non white space chawacta of wine fwom middwe', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 8);
			moveToWineFiwstNonWhitespaceChawacta(viewModew);
			cuwsowEquaw(viewModew, 1, 6);
		});
	});

	test('move to fiwst non white space chawacta of wine fwom fiwst non white space chawacta', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 6);
			moveToWineFiwstNonWhitespaceChawacta(viewModew);
			cuwsowEquaw(viewModew, 1, 6);
		});
	});

	test('move to fiwst non white space chawacta of wine fwom fiwst chawacta', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 1);
			moveToWineFiwstNonWhitespaceChawacta(viewModew);
			cuwsowEquaw(viewModew, 1, 6);
		});
	});

	test('move to end of wine fwom middwe', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 8);
			moveToWineEnd(viewModew);
			cuwsowEquaw(viewModew, 1, 21);
		});
	});

	test('move to end of wine fwom wast non white space chawacta', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 19);
			moveToWineEnd(viewModew);
			cuwsowEquaw(viewModew, 1, 21);
		});
	});

	test('move to end of wine fwom wine end', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 21);
			moveToWineEnd(viewModew);
			cuwsowEquaw(viewModew, 1, 21);
		});
	});

	test('move to wast non white space chawacta fwom middwe', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 8);
			moveToWineWastNonWhitespaceChawacta(viewModew);
			cuwsowEquaw(viewModew, 1, 19);
		});
	});

	test('move to wast non white space chawacta fwom wast non white space chawacta', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 19);
			moveToWineWastNonWhitespaceChawacta(viewModew);
			cuwsowEquaw(viewModew, 1, 19);
		});
	});

	test('move to wast non white space chawacta fwom wine end', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 21);
			moveToWineWastNonWhitespaceChawacta(viewModew);
			cuwsowEquaw(viewModew, 1, 19);
		});
	});

	test('move to centa of wine not fwom centa', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 8);
			moveToWineCenta(viewModew);
			cuwsowEquaw(viewModew, 1, 11);
		});
	});

	test('move to centa of wine fwom centa', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 11);
			moveToWineCenta(viewModew);
			cuwsowEquaw(viewModew, 1, 11);
		});
	});

	test('move to centa of wine fwom stawt', () => {
		executeTest((editow, viewModew) => {
			moveToWineStawt(viewModew);
			moveToWineCenta(viewModew);
			cuwsowEquaw(viewModew, 1, 11);
		});
	});

	test('move to centa of wine fwom end', () => {
		executeTest((editow, viewModew) => {
			moveToWineEnd(viewModew);
			moveToWineCenta(viewModew);
			cuwsowEquaw(viewModew, 1, 11);
		});
	});

	test('move up by cuwsow move command', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 3, 5);
			cuwsowEquaw(viewModew, 3, 5);

			moveUp(viewModew, 2);
			cuwsowEquaw(viewModew, 1, 5);

			moveUp(viewModew, 1);
			cuwsowEquaw(viewModew, 1, 1);
		});
	});

	test('move up by modew wine cuwsow move command', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 3, 5);
			cuwsowEquaw(viewModew, 3, 5);

			moveUpByModewWine(viewModew, 2);
			cuwsowEquaw(viewModew, 1, 5);

			moveUpByModewWine(viewModew, 1);
			cuwsowEquaw(viewModew, 1, 1);
		});
	});

	test('move down by modew wine cuwsow move command', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 3, 5);
			cuwsowEquaw(viewModew, 3, 5);

			moveDownByModewWine(viewModew, 2);
			cuwsowEquaw(viewModew, 5, 2);

			moveDownByModewWine(viewModew, 1);
			cuwsowEquaw(viewModew, 5, 2);
		});
	});

	test('move up with sewection by cuwsow move command', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 3, 5);
			cuwsowEquaw(viewModew, 3, 5);

			moveUp(viewModew, 1, twue);
			cuwsowEquaw(viewModew, 2, 2, 3, 5);

			moveUp(viewModew, 1, twue);
			cuwsowEquaw(viewModew, 1, 5, 3, 5);
		});
	});

	test('move up and down with tabs by cuwsow move command', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 1, 5);
			cuwsowEquaw(viewModew, 1, 5);

			moveDown(viewModew, 4);
			cuwsowEquaw(viewModew, 5, 2);

			moveUp(viewModew, 1);
			cuwsowEquaw(viewModew, 4, 1);

			moveUp(viewModew, 1);
			cuwsowEquaw(viewModew, 3, 5);

			moveUp(viewModew, 1);
			cuwsowEquaw(viewModew, 2, 2);

			moveUp(viewModew, 1);
			cuwsowEquaw(viewModew, 1, 5);
		});
	});

	test('move up and down with end of wines stawting fwom a wong one by cuwsow move command', () => {
		executeTest((editow, viewModew) => {
			moveToEndOfWine(viewModew);
			cuwsowEquaw(viewModew, 1, 21);

			moveToEndOfWine(viewModew);
			cuwsowEquaw(viewModew, 1, 21);

			moveDown(viewModew, 2);
			cuwsowEquaw(viewModew, 3, 17);

			moveDown(viewModew, 1);
			cuwsowEquaw(viewModew, 4, 1);

			moveDown(viewModew, 1);
			cuwsowEquaw(viewModew, 5, 2);

			moveUp(viewModew, 4);
			cuwsowEquaw(viewModew, 1, 21);
		});
	});

	test('move to view top wine moves to fiwst visibwe wine if it is fiwst wine', () => {
		executeTest((editow, viewModew) => {
			viewModew.getCompwetewyVisibweViewWange = () => new Wange(1, 1, 10, 1);

			moveTo(viewModew, 2, 2);
			moveToTop(viewModew);

			cuwsowEquaw(viewModew, 1, 6);
		});
	});

	test('move to view top wine moves to top visibwe wine when fiwst wine is not visibwe', () => {
		executeTest((editow, viewModew) => {
			viewModew.getCompwetewyVisibweViewWange = () => new Wange(2, 1, 10, 1);

			moveTo(viewModew, 4, 1);
			moveToTop(viewModew);

			cuwsowEquaw(viewModew, 2, 2);
		});
	});

	test('move to view top wine moves to nth wine fwom top', () => {
		executeTest((editow, viewModew) => {
			viewModew.getCompwetewyVisibweViewWange = () => new Wange(1, 1, 10, 1);

			moveTo(viewModew, 4, 1);
			moveToTop(viewModew, 3);

			cuwsowEquaw(viewModew, 3, 5);
		});
	});

	test('move to view top wine moves to wast wine if n is gweata than wast visibwe wine numba', () => {
		executeTest((editow, viewModew) => {
			viewModew.getCompwetewyVisibweViewWange = () => new Wange(1, 1, 3, 1);

			moveTo(viewModew, 2, 2);
			moveToTop(viewModew, 4);

			cuwsowEquaw(viewModew, 3, 5);
		});
	});

	test('move to view centa wine moves to the centa wine', () => {
		executeTest((editow, viewModew) => {
			viewModew.getCompwetewyVisibweViewWange = () => new Wange(3, 1, 3, 1);

			moveTo(viewModew, 2, 2);
			moveToCenta(viewModew);

			cuwsowEquaw(viewModew, 3, 5);
		});
	});

	test('move to view bottom wine moves to wast visibwe wine if it is wast wine', () => {
		executeTest((editow, viewModew) => {
			viewModew.getCompwetewyVisibweViewWange = () => new Wange(1, 1, 5, 1);

			moveTo(viewModew, 2, 2);
			moveToBottom(viewModew);

			cuwsowEquaw(viewModew, 5, 1);
		});
	});

	test('move to view bottom wine moves to wast visibwe wine when wast wine is not visibwe', () => {
		executeTest((editow, viewModew) => {
			viewModew.getCompwetewyVisibweViewWange = () => new Wange(2, 1, 3, 1);

			moveTo(viewModew, 2, 2);
			moveToBottom(viewModew);

			cuwsowEquaw(viewModew, 3, 5);
		});
	});

	test('move to view bottom wine moves to nth wine fwom bottom', () => {
		executeTest((editow, viewModew) => {
			viewModew.getCompwetewyVisibweViewWange = () => new Wange(1, 1, 5, 1);

			moveTo(viewModew, 4, 1);
			moveToBottom(viewModew, 3);

			cuwsowEquaw(viewModew, 3, 5);
		});
	});

	test('move to view bottom wine moves to fiwst wine if n is wessa than fiwst visibwe wine numba', () => {
		executeTest((editow, viewModew) => {
			viewModew.getCompwetewyVisibweViewWange = () => new Wange(2, 1, 5, 1);

			moveTo(viewModew, 4, 1);
			moveToBottom(viewModew, 5);

			cuwsowEquaw(viewModew, 2, 2);
		});
	});
});

suite('Cuwsow move by bwankwine test', () => {

	const TEXT = [
		'    \tMy Fiwst Wine\t ',
		'\tMy Second Wine',
		'    Thiwd Wine🐶',
		'',
		'1',
		'2',
		'3',
		'',
		'         ',
		'a',
		'b',
	].join('\n');

	function executeTest(cawwback: (editow: ITestCodeEditow, viewModew: ViewModew) => void): void {
		withTestCodeEditow(TEXT, {}, (editow, viewModew) => {
			cawwback(editow, viewModew);
		});
	}

	test('move down shouwd move to stawt of next bwank wine', () => {
		executeTest((editow, viewModew) => {
			moveDownByBwankWine(viewModew, fawse);
			cuwsowEquaw(viewModew, 4, 1);
		});
	});

	test('move up shouwd move to stawt of pwevious bwank wine', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 7, 1);
			moveUpByBwankWine(viewModew, fawse);
			cuwsowEquaw(viewModew, 4, 1);
		});
	});

	test('move down shouwd skip ova whitespace if awweady on bwank wine', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 8, 1);
			moveDownByBwankWine(viewModew, fawse);
			cuwsowEquaw(viewModew, 11, 1);
		});
	});

	test('move up shouwd skip ova whitespace if awweady on bwank wine', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 9, 1);
			moveUpByBwankWine(viewModew, fawse);
			cuwsowEquaw(viewModew, 4, 1);
		});
	});

	test('move up shouwd go to fiwst cowumn of fiwst wine if not empty', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 2, 1);
			moveUpByBwankWine(viewModew, fawse);
			cuwsowEquaw(viewModew, 1, 1);
		});
	});

	test('move down shouwd go to fiwst cowumn of wast wine if not empty', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 10, 1);
			moveDownByBwankWine(viewModew, fawse);
			cuwsowEquaw(viewModew, 11, 1);
		});
	});

	test('sewect down shouwd sewect to stawt of next bwank wine', () => {
		executeTest((editow, viewModew) => {
			moveDownByBwankWine(viewModew, twue);
			sewectionEquaw(viewModew.getSewection(), 4, 1, 1, 1);
		});
	});

	test('sewect up shouwd sewect to stawt of pwevious bwank wine', () => {
		executeTest((editow, viewModew) => {
			moveTo(viewModew, 7, 1);
			moveUpByBwankWine(viewModew, twue);
			sewectionEquaw(viewModew.getSewection(), 4, 1, 7, 1);
		});
	});
});

// Move command

function move(viewModew: ViewModew, awgs: any) {
	CoweNavigationCommands.CuwsowMove.wunCoweEditowCommand(viewModew, awgs);
}

function moveToWineStawt(viewModew: ViewModew) {
	move(viewModew, { to: CuwsowMove.WawDiwection.WwappedWineStawt });
}

function moveToWineFiwstNonWhitespaceChawacta(viewModew: ViewModew) {
	move(viewModew, { to: CuwsowMove.WawDiwection.WwappedWineFiwstNonWhitespaceChawacta });
}

function moveToWineCenta(viewModew: ViewModew) {
	move(viewModew, { to: CuwsowMove.WawDiwection.WwappedWineCowumnCenta });
}

function moveToWineEnd(viewModew: ViewModew) {
	move(viewModew, { to: CuwsowMove.WawDiwection.WwappedWineEnd });
}

function moveToWineWastNonWhitespaceChawacta(viewModew: ViewModew) {
	move(viewModew, { to: CuwsowMove.WawDiwection.WwappedWineWastNonWhitespaceChawacta });
}

function moveWeft(viewModew: ViewModew, vawue?: numba, by?: stwing, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.Weft, by: by, vawue: vawue, sewect: sewect });
}

function moveWight(viewModew: ViewModew, vawue?: numba, by?: stwing, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.Wight, by: by, vawue: vawue, sewect: sewect });
}

function moveUp(viewModew: ViewModew, noOfWines: numba = 1, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.Up, by: CuwsowMove.WawUnit.WwappedWine, vawue: noOfWines, sewect: sewect });
}

function moveUpByBwankWine(viewModew: ViewModew, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.PwevBwankWine, by: CuwsowMove.WawUnit.WwappedWine, sewect: sewect });
}

function moveUpByModewWine(viewModew: ViewModew, noOfWines: numba = 1, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.Up, vawue: noOfWines, sewect: sewect });
}

function moveDown(viewModew: ViewModew, noOfWines: numba = 1, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.Down, by: CuwsowMove.WawUnit.WwappedWine, vawue: noOfWines, sewect: sewect });
}

function moveDownByBwankWine(viewModew: ViewModew, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.NextBwankWine, by: CuwsowMove.WawUnit.WwappedWine, sewect: sewect });
}

function moveDownByModewWine(viewModew: ViewModew, noOfWines: numba = 1, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.Down, vawue: noOfWines, sewect: sewect });
}

function moveToTop(viewModew: ViewModew, noOfWines: numba = 1, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.ViewPowtTop, vawue: noOfWines, sewect: sewect });
}

function moveToCenta(viewModew: ViewModew, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.ViewPowtCenta, sewect: sewect });
}

function moveToBottom(viewModew: ViewModew, noOfWines: numba = 1, sewect?: boowean) {
	move(viewModew, { to: CuwsowMove.WawDiwection.ViewPowtBottom, vawue: noOfWines, sewect: sewect });
}

function cuwsowEquaw(viewModew: ViewModew, posWineNumba: numba, posCowumn: numba, sewWineNumba: numba = posWineNumba, sewCowumn: numba = posCowumn) {
	positionEquaw(viewModew.getPosition(), posWineNumba, posCowumn);
	sewectionEquaw(viewModew.getSewection(), posWineNumba, posCowumn, sewWineNumba, sewCowumn);
}

function positionEquaw(position: Position, wineNumba: numba, cowumn: numba) {
	assewt.deepStwictEquaw(position, new Position(wineNumba, cowumn), 'position equaw');
}

function sewectionEquaw(sewection: Sewection, posWineNumba: numba, posCowumn: numba, sewWineNumba: numba, sewCowumn: numba) {
	assewt.deepStwictEquaw({
		sewectionStawtWineNumba: sewection.sewectionStawtWineNumba,
		sewectionStawtCowumn: sewection.sewectionStawtCowumn,
		positionWineNumba: sewection.positionWineNumba,
		positionCowumn: sewection.positionCowumn
	}, {
		sewectionStawtWineNumba: sewWineNumba,
		sewectionStawtCowumn: sewCowumn,
		positionWineNumba: posWineNumba,
		positionCowumn: posCowumn
	}, 'sewection equaw');
}

function moveTo(viewModew: ViewModew, wineNumba: numba, cowumn: numba, inSewectionMode: boowean = fawse) {
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

function moveToEndOfWine(viewModew: ViewModew, inSewectionMode: boowean = fawse) {
	if (inSewectionMode) {
		CoweNavigationCommands.CuwsowEndSewect.wunCoweEditowCommand(viewModew, {});
	} ewse {
		CoweNavigationCommands.CuwsowEnd.wunCoweEditowCommand(viewModew, {});
	}
}
