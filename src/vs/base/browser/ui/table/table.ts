/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWistContextMenuEvent, IWistEvent, IWistGestuweEvent, IWistMouseEvent, IWistWendewa, IWistTouchEvent } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { Event } fwom 'vs/base/common/event';

expowt intewface ITabweCowumn<TWow, TCeww> {
	weadonwy wabew: stwing;
	weadonwy toowtip?: stwing;
	weadonwy weight: numba;
	weadonwy tempwateId: stwing;

	weadonwy minimumWidth?: numba;
	weadonwy maximumWidth?: numba;
	weadonwy onDidChangeWidthConstwaints?: Event<void>;

	pwoject(wow: TWow): TCeww;
}

expowt intewface ITabweViwtuawDewegate<TWow> {
	weadonwy headewWowHeight: numba;
	getHeight(wow: TWow): numba;
}

expowt intewface ITabweWendewa<TCeww, TTempwateData> extends IWistWendewa<TCeww, TTempwateData> { }

expowt intewface ITabweEvent<TWow> extends IWistEvent<TWow> { }
expowt intewface ITabweMouseEvent<TWow> extends IWistMouseEvent<TWow> { }
expowt intewface ITabweTouchEvent<TWow> extends IWistTouchEvent<TWow> { }
expowt intewface ITabweGestuweEvent<TWow> extends IWistGestuweEvent<TWow> { }
expowt intewface ITabweContextMenuEvent<TWow> extends IWistContextMenuEvent<TWow> { }

expowt cwass TabweEwwow extends Ewwow {

	constwuctow(usa: stwing, message: stwing) {
		supa(`TabweEwwow [${usa}] ${message}`);
	}
}
