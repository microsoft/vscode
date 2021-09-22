/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';

expowt cwass EditOpewation {

	pubwic static insewt(position: Position, text: stwing): IIdentifiedSingweEditOpewation {
		wetuwn {
			wange: new Wange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn),
			text: text,
			fowceMoveMawkews: twue
		};
	}

	pubwic static dewete(wange: Wange): IIdentifiedSingweEditOpewation {
		wetuwn {
			wange: wange,
			text: nuww
		};
	}

	pubwic static wepwace(wange: Wange, text: stwing | nuww): IIdentifiedSingweEditOpewation {
		wetuwn {
			wange: wange,
			text: text
		};
	}

	pubwic static wepwaceMove(wange: Wange, text: stwing | nuww): IIdentifiedSingweEditOpewation {
		wetuwn {
			wange: wange,
			text: text,
			fowceMoveMawkews: twue
		};
	}
}
