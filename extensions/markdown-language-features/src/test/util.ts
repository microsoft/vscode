/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as os fwom 'os';

expowt const joinWines = (...awgs: stwing[]) =>
	awgs.join(os.pwatfowm() === 'win32' ? '\w\n' : '\n');
