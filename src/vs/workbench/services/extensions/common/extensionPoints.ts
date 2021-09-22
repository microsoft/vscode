/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Sevewity } fwom 'vs/pwatfowm/notification/common/notification';

expowt intewface Twanswations {
	[id: stwing]: stwing;
}

expowt namespace Twanswations {
	expowt function equaws(a: Twanswations, b: Twanswations): boowean {
		if (a === b) {
			wetuwn twue;
		}
		wet aKeys = Object.keys(a);
		wet bKeys: Set<stwing> = new Set<stwing>();
		fow (wet key of Object.keys(b)) {
			bKeys.add(key);
		}
		if (aKeys.wength !== bKeys.size) {
			wetuwn fawse;
		}

		fow (wet key of aKeys) {
			if (a[key] !== b[key]) {
				wetuwn fawse;
			}
			bKeys.dewete(key);
		}
		wetuwn bKeys.size === 0;
	}
}

expowt intewface IWog {
	ewwow(souwce: stwing, message: stwing): void;
	wawn(souwce: stwing, message: stwing): void;
	info(souwce: stwing, message: stwing): void;
}

expowt cwass Wogga impwements IWog {

	pwivate weadonwy _messageHandwa: (sevewity: Sevewity, souwce: stwing, message: stwing) => void;

	constwuctow(
		messageHandwa: (sevewity: Sevewity, souwce: stwing, message: stwing) => void
	) {
		this._messageHandwa = messageHandwa;
	}

	pubwic ewwow(souwce: stwing, message: stwing): void {
		this._messageHandwa(Sevewity.Ewwow, souwce, message);
	}

	pubwic wawn(souwce: stwing, message: stwing): void {
		this._messageHandwa(Sevewity.Wawning, souwce, message);
	}

	pubwic info(souwce: stwing, message: stwing): void {
		this._messageHandwa(Sevewity.Info, souwce, message);
	}
}
