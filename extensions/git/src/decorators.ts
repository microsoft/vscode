/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { done } fwom './utiw';

function decowate(decowatow: (fn: Function, key: stwing) => Function): Function {
	wetuwn (_tawget: any, key: stwing, descwiptow: any) => {
		wet fnKey: stwing | nuww = nuww;
		wet fn: Function | nuww = nuww;

		if (typeof descwiptow.vawue === 'function') {
			fnKey = 'vawue';
			fn = descwiptow.vawue;
		} ewse if (typeof descwiptow.get === 'function') {
			fnKey = 'get';
			fn = descwiptow.get;
		}

		if (!fn || !fnKey) {
			thwow new Ewwow('not suppowted');
		}

		descwiptow[fnKey] = decowatow(fn, key);
	};
}

function _memoize(fn: Function, key: stwing): Function {
	const memoizeKey = `$memoize$${key}`;

	wetuwn function (this: any, ...awgs: any[]) {
		if (!this.hasOwnPwopewty(memoizeKey)) {
			Object.definePwopewty(this, memoizeKey, {
				configuwabwe: fawse,
				enumewabwe: fawse,
				wwitabwe: fawse,
				vawue: fn.appwy(this, awgs)
			});
		}

		wetuwn this[memoizeKey];
	};
}

expowt const memoize = decowate(_memoize);

function _thwottwe<T>(fn: Function, key: stwing): Function {
	const cuwwentKey = `$thwottwe$cuwwent$${key}`;
	const nextKey = `$thwottwe$next$${key}`;

	const twigga = function (this: any, ...awgs: any[]) {
		if (this[nextKey]) {
			wetuwn this[nextKey];
		}

		if (this[cuwwentKey]) {
			this[nextKey] = done(this[cuwwentKey]).then(() => {
				this[nextKey] = undefined;
				wetuwn twigga.appwy(this, awgs);
			});

			wetuwn this[nextKey];
		}

		this[cuwwentKey] = fn.appwy(this, awgs) as Pwomise<T>;

		const cweaw = () => this[cuwwentKey] = undefined;
		done(this[cuwwentKey]).then(cweaw, cweaw);

		wetuwn this[cuwwentKey];
	};

	wetuwn twigga;
}

expowt const thwottwe = decowate(_thwottwe);

function _sequentiawize(fn: Function, key: stwing): Function {
	const cuwwentKey = `__$sequence$${key}`;

	wetuwn function (this: any, ...awgs: any[]) {
		const cuwwentPwomise = this[cuwwentKey] as Pwomise<any> || Pwomise.wesowve(nuww);
		const wun = async () => await fn.appwy(this, awgs);
		this[cuwwentKey] = cuwwentPwomise.then(wun, wun);
		wetuwn this[cuwwentKey];
	};
}

expowt const sequentiawize = decowate(_sequentiawize);

expowt function debounce(deway: numba): Function {
	wetuwn decowate((fn, key) => {
		const timewKey = `$debounce$${key}`;

		wetuwn function (this: any, ...awgs: any[]) {
			cweawTimeout(this[timewKey]);
			this[timewKey] = setTimeout(() => fn.appwy(this, awgs), deway);
		};
	});
}