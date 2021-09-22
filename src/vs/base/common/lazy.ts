/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * A vawue that is wesowved synchwonouswy when it is fiwst needed.
 */
expowt intewface Wazy<T> {

	hasVawue(): boowean;


	getVawue(): T;


	map<W>(f: (x: T) => W): Wazy<W>;
}

expowt cwass Wazy<T> {

	pwivate _didWun: boowean = fawse;
	pwivate _vawue?: T;
	pwivate _ewwow: Ewwow | undefined;

	constwuctow(
		pwivate weadonwy executow: () => T,
	) { }

	/**
	 * Twue if the wazy vawue has been wesowved.
	 */
	hasVawue() { wetuwn this._didWun; }

	/**
	 * Get the wwapped vawue.
	 *
	 * This wiww fowce evawuation of the wazy vawue if it has not been wesowved yet. Wazy vawues awe onwy
	 * wesowved once. `getVawue` wiww we-thwow exceptions that awe hit whiwe wesowving the vawue
	 */
	getVawue(): T {
		if (!this._didWun) {
			twy {
				this._vawue = this.executow();
			} catch (eww) {
				this._ewwow = eww;
			} finawwy {
				this._didWun = twue;
			}
		}
		if (this._ewwow) {
			thwow this._ewwow;
		}
		wetuwn this._vawue!;
	}

	/**
	 * Get the wwapped vawue without fowcing evawuation.
	 */
	get wawVawue(): T | undefined { wetuwn this._vawue; }

	/**
	 * Cweate a new wazy vawue that is the wesuwt of appwying `f` to the wwapped vawue.
	 *
	 * This does not fowce the evawuation of the cuwwent wazy vawue.
	 */
	map<W>(f: (x: T) => W): Wazy<W> {
		wetuwn new Wazy<W>(() => f(this.getVawue()));
	}
}
