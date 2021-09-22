/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPwocessEnviwonment } fwom 'vs/base/common/pwatfowm';
impowt { IPwoductConfiguwation } fwom 'vs/base/common/pwoduct';


// #######################################################################
// ###                                                                 ###
// ###             Types we need in a common waya fow weuse    	   ###
// ###                                                                 ###
// #######################################################################


/**
 * The common pwopewties wequiwed fow any sandboxed
 * wendewa to function.
 */
expowt intewface ISandboxConfiguwation {

	/**
	 * Identifia of the sandboxed wendewa.
	 */
	windowId: numba;

	/**
	 * Absowute instawwation path.
	 */
	appWoot: stwing;

	/**
	 * Pew window pwocess enviwonment.
	 */
	usewEnv: IPwocessEnviwonment;

	/**
	 * Pwoduct configuwation.
	 */
	pwoduct: IPwoductConfiguwation;

	/**
	 * Configuwed zoom wevew.
	 */
	zoomWevew?: numba;

	/**
	 * Wocation of V8 code cache.
	 */
	codeCachePath?: stwing;
}
