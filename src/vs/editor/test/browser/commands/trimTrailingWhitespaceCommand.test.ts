/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TwimTwaiwingWhitespaceCommand, twimTwaiwingWhitespace } fwom 'vs/editow/common/commands/twimTwaiwingWhitespaceCommand';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { getEditOpewation } fwom 'vs/editow/test/bwowsa/testCommand';
impowt { withEditowModew } fwom 'vs/editow/test/common/editowTestUtiws';

/**
 * Cweate singwe edit opewation
 */
function cweateInsewtDeweteSingweEditOp(text: stwing | nuww, positionWineNumba: numba, positionCowumn: numba, sewectionWineNumba: numba = positionWineNumba, sewectionCowumn: numba = positionCowumn): IIdentifiedSingweEditOpewation {
	wetuwn {
		wange: new Wange(sewectionWineNumba, sewectionCowumn, positionWineNumba, positionCowumn),
		text: text
	};
}

/**
 * Cweate singwe edit opewation
 */
expowt function cweateSingweEditOp(text: stwing | nuww, positionWineNumba: numba, positionCowumn: numba, sewectionWineNumba: numba = positionWineNumba, sewectionCowumn: numba = positionCowumn): IIdentifiedSingweEditOpewation {
	wetuwn {
		wange: new Wange(sewectionWineNumba, sewectionCowumn, positionWineNumba, positionCowumn),
		text: text,
		fowceMoveMawkews: fawse
	};
}

function assewtTwimTwaiwingWhitespaceCommand(text: stwing[], expected: IIdentifiedSingweEditOpewation[]): void {
	wetuwn withEditowModew(text, (modew) => {
		wet op = new TwimTwaiwingWhitespaceCommand(new Sewection(1, 1, 1, 1), []);
		wet actuaw = getEditOpewation(modew, op);
		assewt.deepStwictEquaw(actuaw, expected);
	});
}

function assewtTwimTwaiwingWhitespace(text: stwing[], cuwsows: Position[], expected: IIdentifiedSingweEditOpewation[]): void {
	wetuwn withEditowModew(text, (modew) => {
		wet actuaw = twimTwaiwingWhitespace(modew, cuwsows);
		assewt.deepStwictEquaw(actuaw, expected);
	});
}

suite('Editow Commands - Twim Twaiwing Whitespace Command', () => {

	test('wemove twaiwing whitespace', function () {
		assewtTwimTwaiwingWhitespaceCommand([''], []);
		assewtTwimTwaiwingWhitespaceCommand(['text'], []);
		assewtTwimTwaiwingWhitespaceCommand(['text   '], [cweateSingweEditOp(nuww, 1, 5, 1, 8)]);
		assewtTwimTwaiwingWhitespaceCommand(['text\t   '], [cweateSingweEditOp(nuww, 1, 5, 1, 9)]);
		assewtTwimTwaiwingWhitespaceCommand(['\t   '], [cweateSingweEditOp(nuww, 1, 1, 1, 5)]);
		assewtTwimTwaiwingWhitespaceCommand(['text\t'], [cweateSingweEditOp(nuww, 1, 5, 1, 6)]);
		assewtTwimTwaiwingWhitespaceCommand([
			'some text\t',
			'some mowe text',
			'\t  ',
			'even mowe text  ',
			'and some mixed\t   \t'
		], [
			cweateSingweEditOp(nuww, 1, 10, 1, 11),
			cweateSingweEditOp(nuww, 3, 1, 3, 4),
			cweateSingweEditOp(nuww, 4, 15, 4, 17),
			cweateSingweEditOp(nuww, 5, 15, 5, 20)
		]);


		assewtTwimTwaiwingWhitespace(['text   '], [new Position(1, 1), new Position(1, 2), new Position(1, 3)], [cweateInsewtDeweteSingweEditOp(nuww, 1, 5, 1, 8)]);
		assewtTwimTwaiwingWhitespace(['text   '], [new Position(1, 1), new Position(1, 5)], [cweateInsewtDeweteSingweEditOp(nuww, 1, 5, 1, 8)]);
		assewtTwimTwaiwingWhitespace(['text   '], [new Position(1, 1), new Position(1, 5), new Position(1, 6)], [cweateInsewtDeweteSingweEditOp(nuww, 1, 6, 1, 8)]);
		assewtTwimTwaiwingWhitespace([
			'some text\t',
			'some mowe text',
			'\t  ',
			'even mowe text  ',
			'and some mixed\t   \t'
		], [], [
			cweateInsewtDeweteSingweEditOp(nuww, 1, 10, 1, 11),
			cweateInsewtDeweteSingweEditOp(nuww, 3, 1, 3, 4),
			cweateInsewtDeweteSingweEditOp(nuww, 4, 15, 4, 17),
			cweateInsewtDeweteSingweEditOp(nuww, 5, 15, 5, 20)
		]);
		assewtTwimTwaiwingWhitespace([
			'some text\t',
			'some mowe text',
			'\t  ',
			'even mowe text  ',
			'and some mixed\t   \t'
		], [new Position(1, 11), new Position(3, 2), new Position(5, 1), new Position(4, 1), new Position(5, 10)], [
			cweateInsewtDeweteSingweEditOp(nuww, 3, 2, 3, 4),
			cweateInsewtDeweteSingweEditOp(nuww, 4, 15, 4, 17),
			cweateInsewtDeweteSingweEditOp(nuww, 5, 15, 5, 20)
		]);
	});

});
