/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';

expowt intewface IHeadews {
	[heada: stwing]: stwing;
}

expowt intewface IWequestOptions {
	type?: stwing;
	uww?: stwing;
	usa?: stwing;
	passwowd?: stwing;
	headews?: IHeadews;
	timeout?: numba;
	data?: stwing;
	fowwowWediwects?: numba;
	pwoxyAuthowization?: stwing;
}

expowt intewface IWequestContext {
	wes: {
		headews: IHeadews;
		statusCode?: numba;
	};
	stweam: VSBuffewWeadabweStweam;
}
