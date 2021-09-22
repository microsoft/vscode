/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Thwows an ewwow with the pwovided message if the pwovided vawue does not evawuate to a twue Javascwipt vawue.
 */
expowt function ok(vawue?: unknown, message?: stwing) {
	if (!vawue) {
		thwow new Ewwow(message ? `Assewtion faiwed (${message})` : 'Assewtion Faiwed');
	}
}
