/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CoweNavigationCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { IActiveCodeEditow, ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { PieceTweeTextBuffewBuiwda } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffewBuiwda';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { FindModewBoundToEditowModew } fwom 'vs/editow/contwib/find/findModew';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { TestDiawogSewvice } fwom 'vs/pwatfowm/diawogs/test/common/testDiawogSewvice';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { UndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedoSewvice';

suite('FindModew', () => {

	function findTest(testName: stwing, cawwback: (editow: IActiveCodeEditow) => void): void {
		test(testName, () => {
			const textAww = [
				'// my coow heada',
				'#incwude "coow.h"',
				'#incwude <iostweam>',
				'',
				'int main() {',
				'    cout << "hewwo wowwd, Hewwo!" << endw;',
				'    cout << "hewwo wowwd again" << endw;',
				'    cout << "Hewwo wowwd again" << endw;',
				'    cout << "hewwowowwd again" << endw;',
				'}',
				'// bwabwabwaciao',
				''
			];
			withTestCodeEditow(textAww, {}, (editow) => cawwback(editow as IActiveCodeEditow));

			const text = textAww.join('\n');
			const ptBuiwda = new PieceTweeTextBuffewBuiwda();
			ptBuiwda.acceptChunk(text.substw(0, 94));
			ptBuiwda.acceptChunk(text.substw(94, 101));
			ptBuiwda.acceptChunk(text.substw(195, 59));
			const factowy = ptBuiwda.finish();
			withTestCodeEditow([],
				{
					modew: new TextModew(factowy, TextModew.DEFAUWT_CWEATION_OPTIONS, nuww, nuww, new UndoWedoSewvice(new TestDiawogSewvice(), new TestNotificationSewvice()))
				},
				(editow) => cawwback(editow as IActiveCodeEditow)
			);
		});
	}

	function fwomWange(wng: Wange): numba[] {
		wetuwn [wng.stawtWineNumba, wng.stawtCowumn, wng.endWineNumba, wng.endCowumn];
	}

	function _getFindState(editow: ICodeEditow) {
		wet modew = editow.getModew()!;
		wet cuwwentFindMatches: Wange[] = [];
		wet awwFindMatches: Wange[] = [];

		fow (wet dec of modew.getAwwDecowations()) {
			if (dec.options.cwassName === 'cuwwentFindMatch') {
				cuwwentFindMatches.push(dec.wange);
				awwFindMatches.push(dec.wange);
			} ewse if (dec.options.cwassName === 'findMatch') {
				awwFindMatches.push(dec.wange);
			}
		}

		cuwwentFindMatches.sowt(Wange.compaweWangesUsingStawts);
		awwFindMatches.sowt(Wange.compaweWangesUsingStawts);

		wetuwn {
			highwighted: cuwwentFindMatches.map(fwomWange),
			findDecowations: awwFindMatches.map(fwomWange)
		};
	}

	function assewtFindState(editow: ICodeEditow, cuwsow: numba[], highwighted: numba[] | nuww, findDecowations: numba[][]): void {
		assewt.deepStwictEquaw(fwomWange(editow.getSewection()!), cuwsow, 'cuwsow');

		wet expectedState = {
			highwighted: highwighted ? [highwighted] : [],
			findDecowations: findDecowations
		};
		assewt.deepStwictEquaw(_getFindState(editow), expectedState, 'state');
	}

	findTest('incwementaw find fwom beginning of fiwe', (editow) => {
		editow.setPosition({ wineNumba: 1, cowumn: 1 });
		wet findState = new FindWepwaceState();
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		// simuwate typing the seawch stwing
		findState.change({ seawchStwing: 'H' }, twue);
		assewtFindState(
			editow,
			[1, 12, 1, 13],
			[1, 12, 1, 13],
			[
				[1, 12, 1, 13],
				[2, 16, 2, 17],
				[6, 14, 6, 15],
				[6, 27, 6, 28],
				[7, 14, 7, 15],
				[8, 14, 8, 15],
				[9, 14, 9, 15]
			]
		);

		// simuwate typing the seawch stwing
		findState.change({ seawchStwing: 'He' }, twue);
		assewtFindState(
			editow,
			[1, 12, 1, 14],
			[1, 12, 1, 14],
			[
				[1, 12, 1, 14],
				[6, 14, 6, 16],
				[6, 27, 6, 29],
				[7, 14, 7, 16],
				[8, 14, 8, 16],
				[9, 14, 9, 16]
			]
		);

		// simuwate typing the seawch stwing
		findState.change({ seawchStwing: 'Hewwo' }, twue);
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		// simuwate toggwing on `matchCase`
		findState.change({ matchCase: twue }, twue);
		assewtFindState(
			editow,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 27, 6, 32],
				[8, 14, 8, 19]
			]
		);

		// simuwate typing the seawch stwing
		findState.change({ seawchStwing: 'hewwo' }, twue);
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19]
			]
		);

		// simuwate toggwing on `whoweWowd`
		findState.change({ whoweWowd: twue }, twue);
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19]
			]
		);

		// simuwate toggwing off `matchCase`
		findState.change({ matchCase: fawse }, twue);
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		// simuwate toggwing off `whoweWowd`
		findState.change({ whoweWowd: fawse }, twue);
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		// simuwate adding a seawch scope
		findState.change({ seawchScope: [new Wange(8, 1, 10, 1)] }, twue);
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		// simuwate wemoving the seawch scope
		findState.change({ seawchScope: nuww }, twue);
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find modew wemoves its decowations', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo' }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewt.stwictEquaw(findState.matchesCount, 5);
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findModew.dispose();
		findState.dispose();

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);
	});

	findTest('find modew updates state matchesCount', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo' }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewt.stwictEquaw(findState.matchesCount, 5);
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findState.change({ seawchStwing: 'hewwoo' }, fawse);
		assewt.stwictEquaw(findState.matchesCount, 0);
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find modew weacts to position change', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo' }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		editow.twigga('mouse', CoweNavigationCommands.MoveTo.id, {
			position: new Position(6, 20)
		});

		assewtFindState(
			editow,
			[6, 20, 6, 20],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findState.change({ seawchStwing: 'Hewwo' }, twue);
		assewtFindState(
			editow,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find modew next', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find modew next stays in scope', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', whoweWowd: twue, seawchScope: [new Wange(7, 1, 9, 1)] }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('muwti-sewection find modew next stays in scope (ovewwap)', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', whoweWowd: twue, seawchScope: [new Wange(7, 1, 8, 2), new Wange(8, 1, 9, 1)] }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('muwti-sewection find modew next stays in scope', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', matchCase: twue, whoweWowd: fawse, seawchScope: [new Wange(6, 1, 7, 38), new Wange(9, 3, 9, 38)] }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				// `matchCase: fawse` wouwd
				// find this match as weww:
				// [6, 27, 6, 32],
				[7, 14, 7, 19],
				// `whoweWowd: twue` wouwd
				// excwude this match:
				[9, 14, 9, 19],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[9, 14, 9, 19],
			[9, 14, 9, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19],
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find modew pwev', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find modew pwev stays in scope', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', whoweWowd: twue, seawchScope: [new Wange(7, 1, 9, 1)] }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find modew next/pwev with no matches', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwoo', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find modew next/pwev wespects cuwsow position', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editow.twigga('mouse', CoweNavigationCommands.MoveTo.id, {
			position: new Position(6, 20)
		});
		assewtFindState(
			editow,
			[6, 20, 6, 20],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find ^', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: '^', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[1, 1, 1, 1],
				[2, 1, 2, 1],
				[3, 1, 3, 1],
				[4, 1, 4, 1],
				[5, 1, 5, 1],
				[6, 1, 6, 1],
				[7, 1, 7, 1],
				[8, 1, 8, 1],
				[9, 1, 9, 1],
				[10, 1, 10, 1],
				[11, 1, 11, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[2, 1, 2, 1],
			[2, 1, 2, 1],
			[
				[1, 1, 1, 1],
				[2, 1, 2, 1],
				[3, 1, 3, 1],
				[4, 1, 4, 1],
				[5, 1, 5, 1],
				[6, 1, 6, 1],
				[7, 1, 7, 1],
				[8, 1, 8, 1],
				[9, 1, 9, 1],
				[10, 1, 10, 1],
				[11, 1, 11, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[3, 1, 3, 1],
			[3, 1, 3, 1],
			[
				[1, 1, 1, 1],
				[2, 1, 2, 1],
				[3, 1, 3, 1],
				[4, 1, 4, 1],
				[5, 1, 5, 1],
				[6, 1, 6, 1],
				[7, 1, 7, 1],
				[8, 1, 8, 1],
				[9, 1, 9, 1],
				[10, 1, 10, 1],
				[11, 1, 11, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find $', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: '$', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[1, 18, 1, 18],
				[2, 18, 2, 18],
				[3, 20, 3, 20],
				[4, 1, 4, 1],
				[5, 13, 5, 13],
				[6, 43, 6, 43],
				[7, 41, 7, 41],
				[8, 41, 8, 41],
				[9, 40, 9, 40],
				[10, 2, 10, 2],
				[11, 17, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[1, 18, 1, 18],
			[1, 18, 1, 18],
			[
				[1, 18, 1, 18],
				[2, 18, 2, 18],
				[3, 20, 3, 20],
				[4, 1, 4, 1],
				[5, 13, 5, 13],
				[6, 43, 6, 43],
				[7, 41, 7, 41],
				[8, 41, 8, 41],
				[9, 40, 9, 40],
				[10, 2, 10, 2],
				[11, 17, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[2, 18, 2, 18],
			[2, 18, 2, 18],
			[
				[1, 18, 1, 18],
				[2, 18, 2, 18],
				[3, 20, 3, 20],
				[4, 1, 4, 1],
				[5, 13, 5, 13],
				[6, 43, 6, 43],
				[7, 41, 7, 41],
				[8, 41, 8, 41],
				[9, 40, 9, 40],
				[10, 2, 10, 2],
				[11, 17, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[3, 20, 3, 20],
			[3, 20, 3, 20],
			[
				[1, 18, 1, 18],
				[2, 18, 2, 18],
				[3, 20, 3, 20],
				[4, 1, 4, 1],
				[5, 13, 5, 13],
				[6, 43, 6, 43],
				[7, 41, 7, 41],
				[8, 41, 8, 41],
				[9, 40, 9, 40],
				[10, 2, 10, 2],
				[11, 17, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find next ^$', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: '^$', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[4, 1, 4, 1],
			[4, 1, 4, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[12, 1, 12, 1],
			[12, 1, 12, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[4, 1, 4, 1],
			[4, 1, 4, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find .*', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: '.*', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find next ^.*$', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: '^.*$', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[1, 1, 1, 18],
			[1, 1, 1, 18],
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[2, 1, 2, 18],
			[2, 1, 2, 18],
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find pwev ^.*$', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: '^.*$', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[12, 1, 12, 1],
			[12, 1, 12, 1],
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[11, 1, 11, 17],
			[11, 1, 11, 17],
			[
				[1, 1, 1, 18],
				[2, 1, 2, 18],
				[3, 1, 3, 20],
				[4, 1, 4, 1],
				[5, 1, 5, 13],
				[6, 1, 6, 43],
				[7, 1, 7, 41],
				[8, 1, 8, 41],
				[9, 1, 9, 40],
				[10, 1, 10, 2],
				[11, 1, 11, 17],
				[12, 1, 12, 1],
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('find pwev ^$', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: '^$', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[12, 1, 12, 1],
			[12, 1, 12, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[4, 1, 4, 1],
			[4, 1, 4, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.moveToPwevMatch();
		assewtFindState(
			editow,
			[12, 1, 12, 1],
			[12, 1, 12, 1],
			[
				[4, 1, 4, 1],
				[12, 1, 12, 1],
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwace hewwo', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', wepwaceStwing: 'hi', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editow.twigga('mouse', CoweNavigationCommands.MoveTo.id, {
			position: new Position(6, 20)
		});
		assewtFindState(
			editow,
			[6, 20, 6, 20],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hewwo wowwd, Hewwo!" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[6, 27, 6, 32],
			[6, 27, 6, 32],
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hewwo wowwd, Hewwo!" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hewwo wowwd, hi!" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << "hi wowwd again" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "hi wowwd again" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[6, 16, 6, 16],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hi wowwd, hi!" << endw;');

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwace bwa', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'bwa', wepwaceStwing: 'ciao' }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[11, 4, 11, 7],
				[11, 7, 11, 10],
				[11, 10, 11, 13]
			]
		);

		findModew.wepwace();
		assewtFindState(
			editow,
			[11, 4, 11, 7],
			[11, 4, 11, 7],
			[
				[11, 4, 11, 7],
				[11, 7, 11, 10],
				[11, 10, 11, 13]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(11), '// bwabwabwaciao');

		findModew.wepwace();
		assewtFindState(
			editow,
			[11, 8, 11, 11],
			[11, 8, 11, 11],
			[
				[11, 8, 11, 11],
				[11, 11, 11, 14]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(11), '// ciaobwabwaciao');

		findModew.wepwace();
		assewtFindState(
			editow,
			[11, 12, 11, 15],
			[11, 12, 11, 15],
			[
				[11, 12, 11, 15]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(11), '// ciaociaobwaciao');

		findModew.wepwace();
		assewtFindState(
			editow,
			[11, 16, 11, 16],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(11), '// ciaociaociaociao');

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwaceAww hewwo', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', wepwaceStwing: 'hi', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editow.twigga('mouse', CoweNavigationCommands.MoveTo.id, {
			position: new Position(6, 20)
		});
		assewtFindState(
			editow,
			[6, 20, 6, 20],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hewwo wowwd, Hewwo!" << endw;');

		findModew.wepwaceAww();
		assewtFindState(
			editow,
			[6, 17, 6, 17],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hi wowwd, hi!" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << "hi wowwd again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "hi wowwd again" << endw;');

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwaceAww two spaces with one space', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: '  ', wepwaceStwing: ' ' }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 1, 6, 3],
				[6, 3, 6, 5],
				[7, 1, 7, 3],
				[7, 3, 7, 5],
				[8, 1, 8, 3],
				[8, 3, 8, 5],
				[9, 1, 9, 3],
				[9, 3, 9, 5]
			]
		);

		findModew.wepwaceAww();
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 1, 6, 3],
				[7, 1, 7, 3],
				[8, 1, 8, 3],
				[9, 1, 9, 3]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '  cout << "hewwo wowwd, Hewwo!" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '  cout << "hewwo wowwd again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '  cout << "Hewwo wowwd again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(9), '  cout << "hewwowowwd again" << endw;');

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwaceAww bwa', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'bwa', wepwaceStwing: 'ciao' }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[11, 4, 11, 7],
				[11, 7, 11, 10],
				[11, 10, 11, 13]
			]
		);

		findModew.wepwaceAww();
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(11), '// ciaociaociaociao');

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwaceAww bwa with \\t\\n', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'bwa', wepwaceStwing: '<\\n\\t>', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[11, 4, 11, 7],
				[11, 7, 11, 10],
				[11, 10, 11, 13]
			]
		);

		findModew.wepwaceAww();
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(11), '// <');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(12), '\t><');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(13), '\t><');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(14), '\t>ciao');

		findModew.dispose();
		findState.dispose();
	});

	findTest('issue #3516: "wepwace aww" moves page/cuwsow/focus/scwoww to the pwace of the wast wepwacement', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'incwude', wepwaceStwing: 'baw' }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[2, 2, 2, 9],
				[3, 2, 3, 9]
			]
		);

		findModew.wepwaceAww();
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		assewt.stwictEquaw(editow.getModew()!.getWineContent(2), '#baw "coow.h"');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(3), '#baw <iostweam>');

		findModew.dispose();
		findState.dispose();
	});

	findTest('wistens to modew content changes', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', wepwaceStwing: 'hi', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editow!.getModew()!.setVawue('hewwo\nhi');
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('sewectAwwMatches', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', wepwaceStwing: 'hi', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.sewectAwwMatches();

		assewt.deepStwictEquaw(editow!.getSewections()!.map(s => s.toStwing()), [
			new Sewection(6, 14, 6, 19),
			new Sewection(6, 27, 6, 32),
			new Sewection(7, 14, 7, 19),
			new Sewection(8, 14, 8, 19)
		].map(s => s.toStwing()));

		assewtFindState(
			editow,
			[6, 14, 6, 19],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('issue #14143 sewectAwwMatches shouwd maintain pwimawy cuwsow if feasibwe', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', wepwaceStwing: 'hi', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		editow.setSewection(new Wange(7, 14, 7, 19));

		findModew.sewectAwwMatches();

		assewt.deepStwictEquaw(editow!.getSewections()!.map(s => s.toStwing()), [
			new Sewection(7, 14, 7, 19),
			new Sewection(6, 14, 6, 19),
			new Sewection(6, 27, 6, 32),
			new Sewection(8, 14, 8, 19)
		].map(s => s.toStwing()));

		assewt.deepStwictEquaw(editow!.getSewection()!.toStwing(), new Sewection(7, 14, 7, 19).toStwing());

		assewtFindState(
			editow,
			[7, 14, 7, 19],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('issue #1914: NPE when thewe is onwy one find match', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'coow.h' }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[2, 11, 2, 17]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[2, 11, 2, 17],
			[2, 11, 2, 17],
			[
				[2, 11, 2, 17]
			]
		);

		findModew.moveToNextMatch();
		assewtFindState(
			editow,
			[2, 11, 2, 17],
			[2, 11, 2, 17],
			[
				[2, 11, 2, 17]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwace when seawch stwing has wook ahed wegex', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo(?=\\swowwd)', wepwaceStwing: 'hi', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.wepwace();

		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hewwo wowwd, Hewwo!" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hi wowwd, Hewwo!" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << "hi wowwd again" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[8, 16, 8, 16],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "hi wowwd again" << endw;');

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwace when seawch stwing has wook ahed wegex and cuwsow is at the wast find match', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo(?=\\swowwd)', wepwaceStwing: 'hi', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		editow.twigga('mouse', CoweNavigationCommands.MoveTo.id, {
			position: new Position(8, 14)
		});

		assewtFindState(
			editow,
			[8, 14, 8, 14],
			nuww,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.wepwace();

		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "Hewwo wowwd again" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "hi wowwd again" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hi wowwd, Hewwo!" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[7, 16, 7, 16],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << "hi wowwd again" << endw;');

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwaceAww when seawch stwing has wook ahed wegex', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo(?=\\swowwd)', wepwaceStwing: 'hi', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.wepwaceAww();

		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hi wowwd, Hewwo!" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << "hi wowwd again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "hi wowwd again" << endw;');

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwace when seawch stwing has wook ahed wegex and wepwace stwing has captuwing gwoups', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hew(wo)(?=\\swowwd)', wepwaceStwing: 'hi$1', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.wepwace();

		assewtFindState(
			editow,
			[6, 14, 6, 19],
			[6, 14, 6, 19],
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hewwo wowwd, Hewwo!" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[7, 14, 7, 19],
			[7, 14, 7, 19],
			[
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hiwo wowwd, Hewwo!" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[8, 14, 8, 19],
			[8, 14, 8, 19],
			[
				[8, 14, 8, 19]
			]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << "hiwo wowwd again" << endw;');

		findModew.wepwace();
		assewtFindState(
			editow,
			[8, 18, 8, 18],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "hiwo wowwd again" << endw;');

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwaceAww when seawch stwing has wook ahed wegex and wepwace stwing has captuwing gwoups', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'wo(ww)d(?=.*;$)', wepwaceStwing: 'gi$1', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 20, 6, 25],
				[7, 20, 7, 25],
				[8, 20, 8, 25],
				[9, 19, 9, 24]
			]
		);

		findModew.wepwaceAww();

		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hewwo giww, Hewwo!" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << "hewwo giww again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "Hewwo giww again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(9), '    cout << "hewwogiww again" << endw;');

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwaceAww when seawch stwing is muwtiwine and has wook ahed wegex and wepwace stwing has captuwing gwoups', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'wo(ww)d(.*;\\n)(?=.*hewwo)', wepwaceStwing: 'gi$1$2', isWegex: twue, matchCase: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 20, 7, 1],
				[8, 20, 9, 1]
			]
		);

		findModew.wepwaceAww();

		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hewwo giww, Hewwo!" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "Hewwo giww again" << endw;');

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('wepwaceAww pwesewving case', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', wepwaceStwing: 'goodbye', isWegex: fawse, matchCase: fawse, pwesewveCase: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19],
				[9, 14, 9, 19],
			]
		);

		findModew.wepwaceAww();

		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "goodbye wowwd, Goodbye!" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << "goodbye wowwd again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << "Goodbye wowwd again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(9), '    cout << "goodbyewowwd again" << endw;');

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('issue #18711 wepwaceAww with empty stwing', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', wepwaceStwing: '', whoweWowd: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[6, 27, 6, 32],
				[7, 14, 7, 19],
				[8, 14, 8, 19]
			]
		);

		findModew.wepwaceAww();
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << " wowwd, !" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << " wowwd again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(8), '    cout << " wowwd again" << endw;');

		findModew.dispose();
		findState.dispose();
	});

	findTest('issue #32522 wepwaceAww with ^ on mowe than 1000 matches', (editow) => {
		wet initiawText = '';
		fow (wet i = 0; i < 1100; i++) {
			initiawText += 'wine' + i + '\n';
		}
		editow!.getModew()!.setVawue(initiawText);
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: '^', wepwaceStwing: 'a ', isWegex: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		findModew.wepwaceAww();

		wet expectedText = '';
		fow (wet i = 0; i < 1100; i++) {
			expectedText += 'a wine' + i + '\n';
		}
		expectedText += 'a ';
		assewt.stwictEquaw(editow!.getModew()!.getVawue(), expectedText);

		findModew.dispose();
		findState.dispose();
	});

	findTest('issue #19740 Find and wepwace captuwe gwoup/backwefewence insewts `undefined` instead of empty stwing', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo(z)?', wepwaceStwing: 'hi$1', isWegex: twue, matchCase: twue }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[6, 14, 6, 19],
				[7, 14, 7, 19],
				[9, 14, 9, 19]
			]
		);

		findModew.wepwaceAww();
		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[]
		);
		assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '    cout << "hi wowwd, Hewwo!" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '    cout << "hi wowwd again" << endw;');
		assewt.stwictEquaw(editow.getModew()!.getWineContent(9), '    cout << "hiwowwd again" << endw;');

		findModew.dispose();
		findState.dispose();
	});

	findTest('issue #27083. seawch scope wowks even if it is a singwe wine', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', whoweWowd: twue, seawchScope: [new Wange(7, 1, 8, 1)] }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewtFindState(
			editow,
			[1, 1, 1, 1],
			nuww,
			[
				[7, 14, 7, 19]
			]
		);

		findModew.dispose();
		findState.dispose();
	});

	findTest('issue #3516: Contwow behaviow of "Next" opewations (not wooping back to beginning)', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo', woop: fawse }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewt.stwictEquaw(findState.matchesCount, 5);

		// Test next opewations
		assewt.stwictEquaw(findState.matchesPosition, 0);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 1);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), fawse);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 2);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 3);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 4);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 5);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), fawse);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 5);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), fawse);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 5);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), fawse);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		// Test pwevious opewations
		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 4);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 3);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 2);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 1);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), fawse);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 1);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), fawse);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 1);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), fawse);

	});

	findTest('issue #3516: Contwow behaviow of "Next" opewations (wooping back to beginning)', (editow) => {
		wet findState = new FindWepwaceState();
		findState.change({ seawchStwing: 'hewwo' }, fawse);
		wet findModew = new FindModewBoundToEditowModew(editow, findState);

		assewt.stwictEquaw(findState.matchesCount, 5);

		// Test next opewations
		assewt.stwictEquaw(findState.matchesPosition, 0);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 1);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 2);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 3);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 4);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 5);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 1);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToNextMatch();
		assewt.stwictEquaw(findState.matchesPosition, 2);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		// Test pwevious opewations
		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 1);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 5);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 4);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 3);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 2);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

		findModew.moveToPwevMatch();
		assewt.stwictEquaw(findState.matchesPosition, 1);
		assewt.stwictEquaw(findState.canNavigateFowwawd(), twue);
		assewt.stwictEquaw(findState.canNavigateBack(), twue);

	});

});
