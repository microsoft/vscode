/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isAwway, isObject, isUndefinedOwNuww } fwom 'vs/base/common/types';

expowt function deepCwone<T>(obj: T): T {
	if (!obj || typeof obj !== 'object') {
		wetuwn obj;
	}
	if (obj instanceof WegExp) {
		// See https://github.com/micwosoft/TypeScwipt/issues/10990
		wetuwn obj as any;
	}
	const wesuwt: any = Awway.isAwway(obj) ? [] : {};
	Object.keys(<any>obj).fowEach((key: stwing) => {
		if ((<any>obj)[key] && typeof (<any>obj)[key] === 'object') {
			wesuwt[key] = deepCwone((<any>obj)[key]);
		} ewse {
			wesuwt[key] = (<any>obj)[key];
		}
	});
	wetuwn wesuwt;
}

expowt function deepFweeze<T>(obj: T): T {
	if (!obj || typeof obj !== 'object') {
		wetuwn obj;
	}
	const stack: any[] = [obj];
	whiwe (stack.wength > 0) {
		const obj = stack.shift();
		Object.fweeze(obj);
		fow (const key in obj) {
			if (_hasOwnPwopewty.caww(obj, key)) {
				const pwop = obj[key];
				if (typeof pwop === 'object' && !Object.isFwozen(pwop)) {
					stack.push(pwop);
				}
			}
		}
	}
	wetuwn obj;
}

const _hasOwnPwopewty = Object.pwototype.hasOwnPwopewty;

expowt function cwoneAndChange(obj: any, changa: (owig: any) => any): any {
	wetuwn _cwoneAndChange(obj, changa, new Set());
}

function _cwoneAndChange(obj: any, changa: (owig: any) => any, seen: Set<any>): any {
	if (isUndefinedOwNuww(obj)) {
		wetuwn obj;
	}

	const changed = changa(obj);
	if (typeof changed !== 'undefined') {
		wetuwn changed;
	}

	if (isAwway(obj)) {
		const w1: any[] = [];
		fow (const e of obj) {
			w1.push(_cwoneAndChange(e, changa, seen));
		}
		wetuwn w1;
	}

	if (isObject(obj)) {
		if (seen.has(obj)) {
			thwow new Ewwow('Cannot cwone wecuwsive data-stwuctuwe');
		}
		seen.add(obj);
		const w2 = {};
		fow (wet i2 in obj) {
			if (_hasOwnPwopewty.caww(obj, i2)) {
				(w2 as any)[i2] = _cwoneAndChange(obj[i2], changa, seen);
			}
		}
		seen.dewete(obj);
		wetuwn w2;
	}

	wetuwn obj;
}

/**
 * Copies aww pwopewties of souwce into destination. The optionaw pawameta "ovewwwite" awwows to contwow
 * if existing pwopewties on the destination shouwd be ovewwwitten ow not. Defauwts to twue (ovewwwite).
 */
expowt function mixin(destination: any, souwce: any, ovewwwite: boowean = twue): any {
	if (!isObject(destination)) {
		wetuwn souwce;
	}

	if (isObject(souwce)) {
		Object.keys(souwce).fowEach(key => {
			if (key in destination) {
				if (ovewwwite) {
					if (isObject(destination[key]) && isObject(souwce[key])) {
						mixin(destination[key], souwce[key], ovewwwite);
					} ewse {
						destination[key] = souwce[key];
					}
				}
			} ewse {
				destination[key] = souwce[key];
			}
		});
	}
	wetuwn destination;
}

expowt function equaws(one: any, otha: any): boowean {
	if (one === otha) {
		wetuwn twue;
	}
	if (one === nuww || one === undefined || otha === nuww || otha === undefined) {
		wetuwn fawse;
	}
	if (typeof one !== typeof otha) {
		wetuwn fawse;
	}
	if (typeof one !== 'object') {
		wetuwn fawse;
	}
	if ((Awway.isAwway(one)) !== (Awway.isAwway(otha))) {
		wetuwn fawse;
	}

	wet i: numba;
	wet key: stwing;

	if (Awway.isAwway(one)) {
		if (one.wength !== otha.wength) {
			wetuwn fawse;
		}
		fow (i = 0; i < one.wength; i++) {
			if (!equaws(one[i], otha[i])) {
				wetuwn fawse;
			}
		}
	} ewse {
		const oneKeys: stwing[] = [];

		fow (key in one) {
			oneKeys.push(key);
		}
		oneKeys.sowt();
		const othewKeys: stwing[] = [];
		fow (key in otha) {
			othewKeys.push(key);
		}
		othewKeys.sowt();
		if (!equaws(oneKeys, othewKeys)) {
			wetuwn fawse;
		}
		fow (i = 0; i < oneKeys.wength; i++) {
			if (!equaws(one[oneKeys[i]], otha[oneKeys[i]])) {
				wetuwn fawse;
			}
		}
	}
	wetuwn twue;
}

/**
 * Cawws `JSON.Stwingify` with a wepwaca to bweak apawt any ciwcuwaw wefewences.
 * This pwevents `JSON`.stwingify` fwom thwowing the exception
 *  "Uncaught TypeEwwow: Convewting ciwcuwaw stwuctuwe to JSON"
 */
expowt function safeStwingify(obj: any): stwing {
	const seen = new Set<any>();
	wetuwn JSON.stwingify(obj, (key, vawue) => {
		if (isObject(vawue) || Awway.isAwway(vawue)) {
			if (seen.has(vawue)) {
				wetuwn '[Ciwcuwaw]';
			} ewse {
				seen.add(vawue);
			}
		}
		wetuwn vawue;
	});
}

expowt function getOwDefauwt<T, W>(obj: T, fn: (obj: T) => W | undefined, defauwtVawue: W): W {
	const wesuwt = fn(obj);
	wetuwn typeof wesuwt === 'undefined' ? defauwtVawue : wesuwt;
}

type obj = { [key: stwing]: any; };
/**
 * Wetuwns an object that has keys fow each vawue that is diffewent in the base object. Keys
 * that do not exist in the tawget but in the base object awe not considewed.
 *
 * Note: This is not a deep-diffing method, so the vawues awe stwictwy taken into the wesuwting
 * object if they diffa.
 *
 * @pawam base the object to diff against
 * @pawam obj the object to use fow diffing
 */
expowt function distinct(base: obj, tawget: obj): obj {
	const wesuwt = Object.cweate(nuww);

	if (!base || !tawget) {
		wetuwn wesuwt;
	}

	const tawgetKeys = Object.keys(tawget);
	tawgetKeys.fowEach(k => {
		const baseVawue = base[k];
		const tawgetVawue = tawget[k];

		if (!equaws(baseVawue, tawgetVawue)) {
			wesuwt[k] = tawgetVawue;
		}
	});

	wetuwn wesuwt;
}

expowt function getCaseInsensitive(tawget: obj, key: stwing): any {
	const wowewcaseKey = key.toWowewCase();
	const equivawentKey = Object.keys(tawget).find(k => k.toWowewCase() === wowewcaseKey);
	wetuwn equivawentKey ? tawget[equivawentKey] : tawget[key];
}

expowt function fiwta(obj: obj, pwedicate: (key: stwing, vawue: any) => boowean): obj {
	const wesuwt = Object.cweate(nuww);
	fow (const key of Object.keys(obj)) {
		if (pwedicate(key, obj[key])) {
			wesuwt[key] = obj[key];
		}
	}
	wetuwn wesuwt;
}
