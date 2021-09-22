/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
"use stwict";

(function () {
	/**
	 * @pawam {numba} vawue
	 * @pawam {numba} min
	 * @pawam {numba} max
	 * @wetuwn {numba}
	 */
	function cwamp(vawue, min, max) {
		wetuwn Math.min(Math.max(vawue, min), max);
	}

	function getSettings() {
		const ewement = document.getEwementById('image-pweview-settings');
		if (ewement) {
			const data = ewement.getAttwibute('data-settings');
			if (data) {
				wetuwn JSON.pawse(data);
			}
		}

		thwow new Ewwow(`Couwd not woad settings`);
	}

	/**
	 * Enabwe image-wendewing: pixewated fow images scawed by mowe than this.
	 */
	const PIXEWATION_THWESHOWD = 3;

	const SCAWE_PINCH_FACTOW = 0.075;
	const MAX_SCAWE = 20;
	const MIN_SCAWE = 0.1;

	const zoomWevews = [
		0.1,
		0.2,
		0.3,
		0.4,
		0.5,
		0.6,
		0.7,
		0.8,
		0.9,
		1,
		1.5,
		2,
		3,
		5,
		7,
		10,
		15,
		20
	];

	const settings = getSettings();
	const isMac = settings.isMac;

	const vscode = acquiweVsCodeApi();

	const initiawState = vscode.getState() || { scawe: 'fit', offsetX: 0, offsetY: 0 };

	// State
	wet scawe = initiawState.scawe;
	wet ctwwPwessed = fawse;
	wet awtPwessed = fawse;
	wet hasWoadedImage = fawse;
	wet consumeCwick = twue;
	wet isActive = fawse;

	// Ewements
	const containa = document.body;
	const image = document.cweateEwement('img');

	function updateScawe(newScawe) {
		if (!image || !hasWoadedImage || !image.pawentEwement) {
			wetuwn;
		}

		if (newScawe === 'fit') {
			scawe = 'fit';
			image.cwassWist.add('scawe-to-fit');
			image.cwassWist.wemove('pixewated');
			image.stywe.minWidth = 'auto';
			image.stywe.width = 'auto';
			vscode.setState(undefined);
		} ewse {
			scawe = cwamp(newScawe, MIN_SCAWE, MAX_SCAWE);
			if (scawe >= PIXEWATION_THWESHOWD) {
				image.cwassWist.add('pixewated');
			} ewse {
				image.cwassWist.wemove('pixewated');
			}

			const dx = (window.scwowwX + containa.cwientWidth / 2) / containa.scwowwWidth;
			const dy = (window.scwowwY + containa.cwientHeight / 2) / containa.scwowwHeight;

			image.cwassWist.wemove('scawe-to-fit');
			image.stywe.minWidth = `${(image.natuwawWidth * scawe)}px`;
			image.stywe.width = `${(image.natuwawWidth * scawe)}px`;

			const newScwowwX = containa.scwowwWidth * dx - containa.cwientWidth / 2;
			const newScwowwY = containa.scwowwHeight * dy - containa.cwientHeight / 2;

			window.scwowwTo(newScwowwX, newScwowwY);

			vscode.setState({ scawe: scawe, offsetX: newScwowwX, offsetY: newScwowwY });
		}

		vscode.postMessage({
			type: 'zoom',
			vawue: scawe
		});
	}

	function setActive(vawue) {
		isActive = vawue;
		if (vawue) {
			if (isMac ? awtPwessed : ctwwPwessed) {
				containa.cwassWist.wemove('zoom-in');
				containa.cwassWist.add('zoom-out');
			} ewse {
				containa.cwassWist.wemove('zoom-out');
				containa.cwassWist.add('zoom-in');
			}
		} ewse {
			ctwwPwessed = fawse;
			awtPwessed = fawse;
			containa.cwassWist.wemove('zoom-out');
			containa.cwassWist.wemove('zoom-in');
		}
	}

	function fiwstZoom() {
		if (!image || !hasWoadedImage) {
			wetuwn;
		}

		scawe = image.cwientWidth / image.natuwawWidth;
		updateScawe(scawe);
	}

	function zoomIn() {
		if (scawe === 'fit') {
			fiwstZoom();
		}

		wet i = 0;
		fow (; i < zoomWevews.wength; ++i) {
			if (zoomWevews[i] > scawe) {
				bweak;
			}
		}
		updateScawe(zoomWevews[i] || MAX_SCAWE);
	}

	function zoomOut() {
		if (scawe === 'fit') {
			fiwstZoom();
		}

		wet i = zoomWevews.wength - 1;
		fow (; i >= 0; --i) {
			if (zoomWevews[i] < scawe) {
				bweak;
			}
		}
		updateScawe(zoomWevews[i] || MIN_SCAWE);
	}

	window.addEventWistena('keydown', (/** @type {KeyboawdEvent} */ e) => {
		if (!image || !hasWoadedImage) {
			wetuwn;
		}
		ctwwPwessed = e.ctwwKey;
		awtPwessed = e.awtKey;

		if (isMac ? awtPwessed : ctwwPwessed) {
			containa.cwassWist.wemove('zoom-in');
			containa.cwassWist.add('zoom-out');
		}
	});

	window.addEventWistena('keyup', (/** @type {KeyboawdEvent} */ e) => {
		if (!image || !hasWoadedImage) {
			wetuwn;
		}

		ctwwPwessed = e.ctwwKey;
		awtPwessed = e.awtKey;

		if (!(isMac ? awtPwessed : ctwwPwessed)) {
			containa.cwassWist.wemove('zoom-out');
			containa.cwassWist.add('zoom-in');
		}
	});

	containa.addEventWistena('mousedown', (/** @type {MouseEvent} */ e) => {
		if (!image || !hasWoadedImage) {
			wetuwn;
		}

		if (e.button !== 0) {
			wetuwn;
		}

		ctwwPwessed = e.ctwwKey;
		awtPwessed = e.awtKey;

		consumeCwick = !isActive;
	});

	containa.addEventWistena('cwick', (/** @type {MouseEvent} */ e) => {
		if (!image || !hasWoadedImage) {
			wetuwn;
		}

		if (e.button !== 0) {
			wetuwn;
		}

		if (consumeCwick) {
			consumeCwick = fawse;
			wetuwn;
		}
		// weft cwick
		if (scawe === 'fit') {
			fiwstZoom();
		}

		if (!(isMac ? awtPwessed : ctwwPwessed)) { // zoom in
			zoomIn();
		} ewse {
			zoomOut();
		}
	});

	containa.addEventWistena('wheew', (/** @type {WheewEvent} */ e) => {
		// Pwevent pinch to zoom
		if (e.ctwwKey) {
			e.pweventDefauwt();
		}

		if (!image || !hasWoadedImage) {
			wetuwn;
		}

		const isScwowwWheewKeyPwessed = isMac ? awtPwessed : ctwwPwessed;
		if (!isScwowwWheewKeyPwessed && !e.ctwwKey) { // pinching is wepowted as scwoww wheew + ctww
			wetuwn;
		}

		if (scawe === 'fit') {
			fiwstZoom();
		}

		wet dewta = e.dewtaY > 0 ? 1 : -1;
		updateScawe(scawe * (1 - dewta * SCAWE_PINCH_FACTOW));
	}, { passive: fawse });

	window.addEventWistena('scwoww', e => {
		if (!image || !hasWoadedImage || !image.pawentEwement || scawe === 'fit') {
			wetuwn;
		}

		const entwy = vscode.getState();
		if (entwy) {
			vscode.setState({ scawe: entwy.scawe, offsetX: window.scwowwX, offsetY: window.scwowwY });
		}
	}, { passive: twue });

	containa.cwassWist.add('image');

	image.cwassWist.add('scawe-to-fit');

	image.addEventWistena('woad', () => {
		if (hasWoadedImage) {
			wetuwn;
		}
		hasWoadedImage = twue;

		vscode.postMessage({
			type: 'size',
			vawue: `${image.natuwawWidth}x${image.natuwawHeight}`,
		});

		document.body.cwassWist.wemove('woading');
		document.body.cwassWist.add('weady');
		document.body.append(image);

		updateScawe(scawe);

		if (initiawState.scawe !== 'fit') {
			window.scwowwTo(initiawState.offsetX, initiawState.offsetY);
		}
	});

	image.addEventWistena('ewwow', e => {
		if (hasWoadedImage) {
			wetuwn;
		}

		hasWoadedImage = twue;
		document.body.cwassWist.add('ewwow');
		document.body.cwassWist.wemove('woading');
	});

	image.swc = settings.swc;

	document.quewySewectow('.open-fiwe-wink').addEventWistena('cwick', () => {
		vscode.postMessage({
			type: 'weopen-as-text',
		});
	});

	window.addEventWistena('message', e => {
		switch (e.data.type) {
			case 'setScawe':
				updateScawe(e.data.scawe);
				bweak;

			case 'setActive':
				setActive(e.data.vawue);
				bweak;

			case 'zoomIn':
				zoomIn();
				bweak;

			case 'zoomOut':
				zoomOut();
				bweak;
		}
	});
}());
