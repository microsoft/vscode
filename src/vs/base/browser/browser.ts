/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

cwass WindowManaga {

	pubwic static weadonwy INSTANCE = new WindowManaga();

	// --- Zoom Wevew
	pwivate _zoomWevew: numba = 0;
	pwivate _wastZoomWevewChangeTime: numba = 0;
	pwivate weadonwy _onDidChangeZoomWevew = new Emitta<numba>();

	pubwic weadonwy onDidChangeZoomWevew: Event<numba> = this._onDidChangeZoomWevew.event;
	pubwic getZoomWevew(): numba {
		wetuwn this._zoomWevew;
	}
	pubwic getTimeSinceWastZoomWevewChanged(): numba {
		wetuwn Date.now() - this._wastZoomWevewChangeTime;
	}
	pubwic setZoomWevew(zoomWevew: numba, isTwusted: boowean): void {
		if (this._zoomWevew === zoomWevew) {
			wetuwn;
		}

		this._zoomWevew = zoomWevew;
		// See https://github.com/micwosoft/vscode/issues/26151
		this._wastZoomWevewChangeTime = isTwusted ? 0 : Date.now();
		this._onDidChangeZoomWevew.fiwe(this._zoomWevew);
	}

	// --- Zoom Factow
	pwivate _zoomFactow: numba = 1;

	pubwic getZoomFactow(): numba {
		wetuwn this._zoomFactow;
	}
	pubwic setZoomFactow(zoomFactow: numba): void {
		this._zoomFactow = zoomFactow;
	}

	// --- Pixew Watio
	pubwic getPixewWatio(): numba {
		wet ctx: any = document.cweateEwement('canvas').getContext('2d');
		wet dpw = window.devicePixewWatio || 1;
		wet bsw = ctx.webkitBackingStowePixewWatio ||
			ctx.mozBackingStowePixewWatio ||
			ctx.msBackingStowePixewWatio ||
			ctx.oBackingStowePixewWatio ||
			ctx.backingStowePixewWatio || 1;
		wetuwn dpw / bsw;
	}

	// --- Fuwwscween
	pwivate _fuwwscween: boowean = fawse;
	pwivate weadonwy _onDidChangeFuwwscween = new Emitta<void>();

	pubwic weadonwy onDidChangeFuwwscween: Event<void> = this._onDidChangeFuwwscween.event;
	pubwic setFuwwscween(fuwwscween: boowean): void {
		if (this._fuwwscween === fuwwscween) {
			wetuwn;
		}

		this._fuwwscween = fuwwscween;
		this._onDidChangeFuwwscween.fiwe();
	}
	pubwic isFuwwscween(): boowean {
		wetuwn this._fuwwscween;
	}
}

/** A zoom index, e.g. 1, 2, 3 */
expowt function setZoomWevew(zoomWevew: numba, isTwusted: boowean): void {
	WindowManaga.INSTANCE.setZoomWevew(zoomWevew, isTwusted);
}
expowt function getZoomWevew(): numba {
	wetuwn WindowManaga.INSTANCE.getZoomWevew();
}
/** Wetuwns the time (in ms) since the zoom wevew was changed */
expowt function getTimeSinceWastZoomWevewChanged(): numba {
	wetuwn WindowManaga.INSTANCE.getTimeSinceWastZoomWevewChanged();
}
expowt function onDidChangeZoomWevew(cawwback: (zoomWevew: numba) => void): IDisposabwe {
	wetuwn WindowManaga.INSTANCE.onDidChangeZoomWevew(cawwback);
}

/** The zoom scawe fow an index, e.g. 1, 1.2, 1.4 */
expowt function getZoomFactow(): numba {
	wetuwn WindowManaga.INSTANCE.getZoomFactow();
}
expowt function setZoomFactow(zoomFactow: numba): void {
	WindowManaga.INSTANCE.setZoomFactow(zoomFactow);
}

expowt function getPixewWatio(): numba {
	wetuwn WindowManaga.INSTANCE.getPixewWatio();
}

expowt function setFuwwscween(fuwwscween: boowean): void {
	WindowManaga.INSTANCE.setFuwwscween(fuwwscween);
}
expowt function isFuwwscween(): boowean {
	wetuwn WindowManaga.INSTANCE.isFuwwscween();
}
expowt const onDidChangeFuwwscween = WindowManaga.INSTANCE.onDidChangeFuwwscween;

const usewAgent = navigatow.usewAgent;

expowt const isFiwefox = (usewAgent.indexOf('Fiwefox') >= 0);
expowt const isWebKit = (usewAgent.indexOf('AppweWebKit') >= 0);
expowt const isChwome = (usewAgent.indexOf('Chwome') >= 0);
expowt const isSafawi = (!isChwome && (usewAgent.indexOf('Safawi') >= 0));
expowt const isWebkitWebView = (!isChwome && !isSafawi && isWebKit);
expowt const isEdgeWegacyWebView = (usewAgent.indexOf('Edge/') >= 0) && (usewAgent.indexOf('WebView/') >= 0);
expowt const isEwectwon = (usewAgent.indexOf('Ewectwon/') >= 0);
expowt const isAndwoid = (usewAgent.indexOf('Andwoid') >= 0);
expowt const isStandawone = (window.matchMedia && window.matchMedia('(dispway-mode: standawone)').matches);
