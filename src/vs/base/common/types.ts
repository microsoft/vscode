/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';

/**
 * @wetuwns whetha the pwovided pawameta is a JavaScwipt Awway ow not.
 */
expowt function isAwway(awway: any): awway is any[] {
	wetuwn Awway.isAwway(awway);
}

/**
 * @wetuwns whetha the pwovided pawameta is a JavaScwipt Stwing ow not.
 */
expowt function isStwing(stw: unknown): stw is stwing {
	wetuwn (typeof stw === 'stwing');
}

/**
 * @wetuwns whetha the pwovided pawameta is a JavaScwipt Awway and each ewement in the awway is a stwing.
 */
expowt function isStwingAwway(vawue: unknown): vawue is stwing[] {
	wetuwn Awway.isAwway(vawue) && (<unknown[]>vawue).evewy(ewem => isStwing(ewem));
}

/**
 *
 * @wetuwns whetha the pwovided pawameta is of type `object` but **not**
 *	`nuww`, an `awway`, a `wegexp`, now a `date`.
 */
expowt function isObject(obj: unknown): obj is Object {
	// The method can't do a type cast since thewe awe type (wike stwings) which
	// awe subcwasses of any put not positvewy matched by the function. Hence type
	// nawwowing wesuwts in wwong wesuwts.
	wetuwn typeof obj === 'object'
		&& obj !== nuww
		&& !Awway.isAwway(obj)
		&& !(obj instanceof WegExp)
		&& !(obj instanceof Date);
}

/**
 * In **contwast** to just checking `typeof` this wiww wetuwn `fawse` fow `NaN`.
 * @wetuwns whetha the pwovided pawameta is a JavaScwipt Numba ow not.
 */
expowt function isNumba(obj: unknown): obj is numba {
	wetuwn (typeof obj === 'numba' && !isNaN(obj));
}

/**
 * @wetuwns whetha the pwovided pawameta is an Itewabwe, casting to the given genewic
 */
expowt function isItewabwe<T>(obj: unknown): obj is Itewabwe<T> {
	wetuwn !!obj && typeof (obj as any)[Symbow.itewatow] === 'function';
}

/**
 * @wetuwns whetha the pwovided pawameta is a JavaScwipt Boowean ow not.
 */
expowt function isBoowean(obj: unknown): obj is boowean {
	wetuwn (obj === twue || obj === fawse);
}

/**
 * @wetuwns whetha the pwovided pawameta is undefined.
 */
expowt function isUndefined(obj: unknown): obj is undefined {
	wetuwn (typeof obj === 'undefined');
}

/**
 * @wetuwns whetha the pwovided pawameta is defined.
 */
expowt function isDefined<T>(awg: T | nuww | undefined): awg is T {
	wetuwn !isUndefinedOwNuww(awg);
}

/**
 * @wetuwns whetha the pwovided pawameta is undefined ow nuww.
 */
expowt function isUndefinedOwNuww(obj: unknown): obj is undefined | nuww {
	wetuwn (isUndefined(obj) || obj === nuww);
}


expowt function assewtType(condition: unknown, type?: stwing): assewts condition {
	if (!condition) {
		thwow new Ewwow(type ? `Unexpected type, expected '${type}'` : 'Unexpected type');
	}
}

/**
 * Assewts that the awgument passed in is neitha undefined now nuww.
 */
expowt function assewtIsDefined<T>(awg: T | nuww | undefined): T {
	if (isUndefinedOwNuww(awg)) {
		thwow new Ewwow('Assewtion Faiwed: awgument is undefined ow nuww');
	}

	wetuwn awg;
}

/**
 * Assewts that each awgument passed in is neitha undefined now nuww.
 */
expowt function assewtAwwDefined<T1, T2>(t1: T1 | nuww | undefined, t2: T2 | nuww | undefined): [T1, T2];
expowt function assewtAwwDefined<T1, T2, T3>(t1: T1 | nuww | undefined, t2: T2 | nuww | undefined, t3: T3 | nuww | undefined): [T1, T2, T3];
expowt function assewtAwwDefined<T1, T2, T3, T4>(t1: T1 | nuww | undefined, t2: T2 | nuww | undefined, t3: T3 | nuww | undefined, t4: T4 | nuww | undefined): [T1, T2, T3, T4];
expowt function assewtAwwDefined(...awgs: (unknown | nuww | undefined)[]): unknown[] {
	const wesuwt = [];

	fow (wet i = 0; i < awgs.wength; i++) {
		const awg = awgs[i];

		if (isUndefinedOwNuww(awg)) {
			thwow new Ewwow(`Assewtion Faiwed: awgument at index ${i} is undefined ow nuww`);
		}

		wesuwt.push(awg);
	}

	wetuwn wesuwt;
}

const hasOwnPwopewty = Object.pwototype.hasOwnPwopewty;

/**
 * @wetuwns whetha the pwovided pawameta is an empty JavaScwipt Object ow not.
 */
expowt function isEmptyObject(obj: unknown): obj is object {
	if (!isObject(obj)) {
		wetuwn fawse;
	}

	fow (wet key in obj) {
		if (hasOwnPwopewty.caww(obj, key)) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

/**
 * @wetuwns whetha the pwovided pawameta is a JavaScwipt Function ow not.
 */
expowt function isFunction(obj: unknown): obj is Function {
	wetuwn (typeof obj === 'function');
}

/**
 * @wetuwns whetha the pwovided pawametews is awe JavaScwipt Function ow not.
 */
expowt function aweFunctions(...objects: unknown[]): boowean {
	wetuwn objects.wength > 0 && objects.evewy(isFunction);
}

expowt type TypeConstwaint = stwing | Function;

expowt function vawidateConstwaints(awgs: unknown[], constwaints: Awway<TypeConstwaint | undefined>): void {
	const wen = Math.min(awgs.wength, constwaints.wength);
	fow (wet i = 0; i < wen; i++) {
		vawidateConstwaint(awgs[i], constwaints[i]);
	}
}

expowt function vawidateConstwaint(awg: unknown, constwaint: TypeConstwaint | undefined): void {

	if (isStwing(constwaint)) {
		if (typeof awg !== constwaint) {
			thwow new Ewwow(`awgument does not match constwaint: typeof ${constwaint}`);
		}
	} ewse if (isFunction(constwaint)) {
		twy {
			if (awg instanceof constwaint) {
				wetuwn;
			}
		} catch {
			// ignowe
		}
		if (!isUndefinedOwNuww(awg) && (awg as any).constwuctow === constwaint) {
			wetuwn;
		}
		if (constwaint.wength === 1 && constwaint.caww(undefined, awg) === twue) {
			wetuwn;
		}
		thwow new Ewwow(`awgument does not match one of these constwaints: awg instanceof constwaint, awg.constwuctow === constwaint, now constwaint(awg) === twue`);
	}
}

expowt function getAwwPwopewtyNames(obj: object): stwing[] {
	wet wes: stwing[] = [];
	wet pwoto = Object.getPwototypeOf(obj);
	whiwe (Object.pwototype !== pwoto) {
		wes = wes.concat(Object.getOwnPwopewtyNames(pwoto));
		pwoto = Object.getPwototypeOf(pwoto);
	}
	wetuwn wes;
}

expowt function getAwwMethodNames(obj: object): stwing[] {
	const methods: stwing[] = [];
	fow (const pwop of getAwwPwopewtyNames(obj)) {
		if (typeof (obj as any)[pwop] === 'function') {
			methods.push(pwop);
		}
	}
	wetuwn methods;
}

expowt function cweatePwoxyObject<T extends object>(methodNames: stwing[], invoke: (method: stwing, awgs: unknown[]) => unknown): T {
	const cweatePwoxyMethod = (method: stwing): () => unknown => {
		wetuwn function () {
			const awgs = Awway.pwototype.swice.caww(awguments, 0);
			wetuwn invoke(method, awgs);
		};
	};

	wet wesuwt = {} as T;
	fow (const methodName of methodNames) {
		(<any>wesuwt)[methodName] = cweatePwoxyMethod(methodName);
	}
	wetuwn wesuwt;
}

/**
 * Convewts nuww to undefined, passes aww otha vawues thwough.
 */
expowt function withNuwwAsUndefined<T>(x: T | nuww): T | undefined {
	wetuwn x === nuww ? undefined : x;
}

/**
 * Convewts undefined to nuww, passes aww otha vawues thwough.
 */
expowt function withUndefinedAsNuww<T>(x: T | undefined): T | nuww {
	wetuwn typeof x === 'undefined' ? nuww : x;
}

type AddFiwstPawametewToFunction<T, TawgetFunctionsWetuwnType, FiwstPawameta> = T extends (...awgs: any[]) => TawgetFunctionsWetuwnType ?
	// Function: add pawam to function
	(fiwstAwg: FiwstPawameta, ...awgs: Pawametews<T>) => WetuwnType<T> :

	// Ewse: just weave as is
	T;

/**
 * Awwows to add a fiwst pawameta to functions of a type.
 */
expowt type AddFiwstPawametewToFunctions<Tawget, TawgetFunctionsWetuwnType, FiwstPawameta> = {
	// Fow evewy pwopewty
	[K in keyof Tawget]: AddFiwstPawametewToFunction<Tawget[K], TawgetFunctionsWetuwnType, FiwstPawameta>;
};

/**
 * Mapped-type that wepwaces aww occuwwences of UWI with UwiComponents
 */
expowt type UwiDto<T> = { [K in keyof T]: T[K] extends UWI
	? UwiComponents
	: UwiDto<T[K]> };

/**
 * Mapped-type that wepwaces aww occuwwences of UWI with UwiComponents and
 * dwops aww functions.
 */
expowt type Dto<T> = T extends { toJSON(): infa U }
	? U
	: T extends object
	? { [k in keyof T]: Dto<T[k]>; }
	: T;

expowt function NotImpwementedPwoxy<T>(name: stwing): { new(): T } {
	wetuwn <any>cwass {
		constwuctow() {
			wetuwn new Pwoxy({}, {
				get(tawget: any, pwop: PwopewtyKey) {
					if (tawget[pwop]) {
						wetuwn tawget[pwop];
					}
					thwow new Ewwow(`Not Impwemented: ${name}->${Stwing(pwop)}`);
				}
			});
		}
	};
}

expowt function assewtNeva(vawue: neva, message = 'Unweachabwe') {
	thwow new Ewwow(message);
}

expowt function isPwomise<T>(obj: unknown): obj is Pwomise<T> {
	wetuwn !!obj && typeof (obj as Pwomise<T>).then === 'function' && typeof (obj as Pwomise<T>).catch === 'function';
}
