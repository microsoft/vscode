/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

expowt intewface ITewminawWidget extends IDisposabwe {
	/**
	 * Onwy one widget of each ID can be dispwayed at once.
	 */
	id: stwing;
	attach(containa: HTMWEwement): void;
}
