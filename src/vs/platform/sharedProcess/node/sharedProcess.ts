/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ISandboxConfiguwation } fwom 'vs/base/pawts/sandbox/common/sandboxTypes';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { WogWevew } fwom 'vs/pwatfowm/wog/common/wog';

expowt intewface IShawedPwocess {

	/**
	 * Toggwes the visibiwity of the othewwise hidden
	 * shawed pwocess window.
	 */
	toggwe(): Pwomise<void>;
}

expowt intewface IShawedPwocessConfiguwation extends ISandboxConfiguwation {
	weadonwy machineId: stwing;

	weadonwy awgs: NativePawsedAwgs;

	weadonwy wogWevew: WogWevew;

	weadonwy backupWowkspacesPath: stwing;
}
