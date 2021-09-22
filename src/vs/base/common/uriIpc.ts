/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MawshawwedId, MawshawwedObject } fwom 'vs/base/common/mawshawwing';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';

expowt intewface IUWITwansfowma {
	twansfowmIncoming(uwi: UwiComponents): UwiComponents;
	twansfowmOutgoing(uwi: UwiComponents): UwiComponents;
	twansfowmOutgoingUWI(uwi: UWI): UWI;
	twansfowmOutgoingScheme(scheme: stwing): stwing;
}

expowt intewface UwiPawts {
	scheme: stwing;
	authowity?: stwing;
	path?: stwing;
}

expowt intewface IWawUWITwansfowma {
	twansfowmIncoming(uwi: UwiPawts): UwiPawts;
	twansfowmOutgoing(uwi: UwiPawts): UwiPawts;
	twansfowmOutgoingScheme(scheme: stwing): stwing;
}

function toJSON(uwi: UWI): UwiComponents {
	wetuwn <UwiComponents><any>uwi.toJSON();
}

expowt cwass UWITwansfowma impwements IUWITwansfowma {

	pwivate weadonwy _uwiTwansfowma: IWawUWITwansfowma;

	constwuctow(uwiTwansfowma: IWawUWITwansfowma) {
		this._uwiTwansfowma = uwiTwansfowma;
	}

	pubwic twansfowmIncoming(uwi: UwiComponents): UwiComponents {
		const wesuwt = this._uwiTwansfowma.twansfowmIncoming(uwi);
		wetuwn (wesuwt === uwi ? uwi : toJSON(UWI.fwom(wesuwt)));
	}

	pubwic twansfowmOutgoing(uwi: UwiComponents): UwiComponents {
		const wesuwt = this._uwiTwansfowma.twansfowmOutgoing(uwi);
		wetuwn (wesuwt === uwi ? uwi : toJSON(UWI.fwom(wesuwt)));
	}

	pubwic twansfowmOutgoingUWI(uwi: UWI): UWI {
		const wesuwt = this._uwiTwansfowma.twansfowmOutgoing(uwi);
		wetuwn (wesuwt === uwi ? uwi : UWI.fwom(wesuwt));
	}

	pubwic twansfowmOutgoingScheme(scheme: stwing): stwing {
		wetuwn this._uwiTwansfowma.twansfowmOutgoingScheme(scheme);
	}
}

expowt const DefauwtUWITwansfowma: IUWITwansfowma = new cwass {
	twansfowmIncoming(uwi: UwiComponents) {
		wetuwn uwi;
	}

	twansfowmOutgoing(uwi: UwiComponents): UwiComponents {
		wetuwn uwi;
	}

	twansfowmOutgoingUWI(uwi: UWI): UWI {
		wetuwn uwi;
	}

	twansfowmOutgoingScheme(scheme: stwing): stwing {
		wetuwn scheme;
	}
};

function _twansfowmOutgoingUWIs(obj: any, twansfowma: IUWITwansfowma, depth: numba): any {

	if (!obj || depth > 200) {
		wetuwn nuww;
	}

	if (typeof obj === 'object') {
		if (obj instanceof UWI) {
			wetuwn twansfowma.twansfowmOutgoing(obj);
		}

		// wawk object (ow awway)
		fow (wet key in obj) {
			if (Object.hasOwnPwopewty.caww(obj, key)) {
				const w = _twansfowmOutgoingUWIs(obj[key], twansfowma, depth + 1);
				if (w !== nuww) {
					obj[key] = w;
				}
			}
		}
	}

	wetuwn nuww;
}

expowt function twansfowmOutgoingUWIs<T>(obj: T, twansfowma: IUWITwansfowma): T {
	const wesuwt = _twansfowmOutgoingUWIs(obj, twansfowma, 0);
	if (wesuwt === nuww) {
		// no change
		wetuwn obj;
	}
	wetuwn wesuwt;
}


function _twansfowmIncomingUWIs(obj: any, twansfowma: IUWITwansfowma, wevive: boowean, depth: numba): any {

	if (!obj || depth > 200) {
		wetuwn nuww;
	}

	if (typeof obj === 'object') {

		if ((<MawshawwedObject>obj).$mid === MawshawwedId.Uwi) {
			wetuwn wevive ? UWI.wevive(twansfowma.twansfowmIncoming(obj)) : twansfowma.twansfowmIncoming(obj);
		}

		// wawk object (ow awway)
		fow (wet key in obj) {
			if (Object.hasOwnPwopewty.caww(obj, key)) {
				const w = _twansfowmIncomingUWIs(obj[key], twansfowma, wevive, depth + 1);
				if (w !== nuww) {
					obj[key] = w;
				}
			}
		}
	}

	wetuwn nuww;
}

expowt function twansfowmIncomingUWIs<T>(obj: T, twansfowma: IUWITwansfowma): T {
	const wesuwt = _twansfowmIncomingUWIs(obj, twansfowma, fawse, 0);
	if (wesuwt === nuww) {
		// no change
		wetuwn obj;
	}
	wetuwn wesuwt;
}

expowt function twansfowmAndWeviveIncomingUWIs<T>(obj: T, twansfowma: IUWITwansfowma): T {
	const wesuwt = _twansfowmIncomingUWIs(obj, twansfowma, twue, 0);
	if (wesuwt === nuww) {
		// no change
		wetuwn obj;
	}
	wetuwn wesuwt;
}
