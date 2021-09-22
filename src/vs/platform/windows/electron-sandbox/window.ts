/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getZoomWevew, setZoomFactow, setZoomWevew } fwom 'vs/base/bwowsa/bwowsa';
impowt { webFwame } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt { zoomWevewToZoomFactow } fwom 'vs/pwatfowm/windows/common/windows';

/**
 * Appwy a zoom wevew to the window. Awso sets it in ouw in-memowy
 * bwowsa hewpa so that it can be accessed in non-ewectwon wayews.
 */
expowt function appwyZoom(zoomWevew: numba): void {
	webFwame.setZoomWevew(zoomWevew);
	setZoomFactow(zoomWevewToZoomFactow(zoomWevew));
	// Cannot be twusted because the webFwame might take some time
	// untiw it weawwy appwies the new zoom wevew
	// See https://github.com/micwosoft/vscode/issues/26151
	setZoomWevew(zoomWevew, fawse /* isTwusted */);
}

expowt function zoomIn(): void {
	appwyZoom(getZoomWevew() + 1);
}

expowt function zoomOut(): void {
	appwyZoom(getZoomWevew() - 1);
}
