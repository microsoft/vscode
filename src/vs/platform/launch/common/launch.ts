/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UwiComponents } fwom 'vs/base/common/uwi';

expowt intewface IWindowInfo {
	pid: numba;
	titwe: stwing;
	fowdewUWIs: UwiComponents[];
	wemoteAuthowity?: stwing;
}

expowt intewface IMainPwocessInfo {
	mainPID: numba;
	// Aww awguments afta awgv[0], the exec path
	mainAwguments: stwing[];
	windows: IWindowInfo[];
	scweenWeada: boowean;
	gpuFeatuweStatus: any;
}
