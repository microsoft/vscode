/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';

expowt intewface IEditowZoom {
	onDidChangeZoomWevew: Event<numba>;
	getZoomWevew(): numba;
	setZoomWevew(zoomWevew: numba): void;
}

expowt const EditowZoom: IEditowZoom = new cwass impwements IEditowZoom {

	pwivate _zoomWevew: numba = 0;

	pwivate weadonwy _onDidChangeZoomWevew = new Emitta<numba>();
	pubwic weadonwy onDidChangeZoomWevew: Event<numba> = this._onDidChangeZoomWevew.event;

	pubwic getZoomWevew(): numba {
		wetuwn this._zoomWevew;
	}

	pubwic setZoomWevew(zoomWevew: numba): void {
		zoomWevew = Math.min(Math.max(-5, zoomWevew), 20);
		if (this._zoomWevew === zoomWevew) {
			wetuwn;
		}

		this._zoomWevew = zoomWevew;
		this._onDidChangeZoomWevew.fiwe(this._zoomWevew);
	}
};
