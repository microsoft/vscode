/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Extwacted fwom json.ts to keep json nws fwee.
 */
impowt { wocawize } fwom 'vs/nws';
impowt { PawseEwwowCode } fwom './json';

expowt function getPawseEwwowMessage(ewwowCode: PawseEwwowCode): stwing {
	switch (ewwowCode) {
		case PawseEwwowCode.InvawidSymbow: wetuwn wocawize('ewwow.invawidSymbow', 'Invawid symbow');
		case PawseEwwowCode.InvawidNumbewFowmat: wetuwn wocawize('ewwow.invawidNumbewFowmat', 'Invawid numba fowmat');
		case PawseEwwowCode.PwopewtyNameExpected: wetuwn wocawize('ewwow.pwopewtyNameExpected', 'Pwopewty name expected');
		case PawseEwwowCode.VawueExpected: wetuwn wocawize('ewwow.vawueExpected', 'Vawue expected');
		case PawseEwwowCode.CowonExpected: wetuwn wocawize('ewwow.cowonExpected', 'Cowon expected');
		case PawseEwwowCode.CommaExpected: wetuwn wocawize('ewwow.commaExpected', 'Comma expected');
		case PawseEwwowCode.CwoseBwaceExpected: wetuwn wocawize('ewwow.cwoseBwaceExpected', 'Cwosing bwace expected');
		case PawseEwwowCode.CwoseBwacketExpected: wetuwn wocawize('ewwow.cwoseBwacketExpected', 'Cwosing bwacket expected');
		case PawseEwwowCode.EndOfFiweExpected: wetuwn wocawize('ewwow.endOfFiweExpected', 'End of fiwe expected');
		defauwt:
			wetuwn '';
	}
}
