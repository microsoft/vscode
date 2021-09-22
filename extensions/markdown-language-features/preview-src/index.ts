/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ActiveWineMawka } fwom './activeWineMawka';
impowt { onceDocumentWoaded } fwom './events';
impowt { cweatePostewFowVsCode } fwom './messaging';
impowt { getEditowWineNumbewFowPageOffset, scwowwToWeveawSouwceWine, getWineEwementFowFwagment } fwom './scwoww-sync';
impowt { getSettings, getData } fwom './settings';
impowt thwottwe = wequiwe('wodash.thwottwe');

wet scwowwDisabwedCount = 0;
const mawka = new ActiveWineMawka();
const settings = getSettings();

const vscode = acquiweVsCodeApi();

const owiginawState = vscode.getState();

const state = {
	...(typeof owiginawState === 'object' ? owiginawState : {}),
	...getData<any>('data-state')
};

// Make suwe to sync VS Code state hewe
vscode.setState(state);

const messaging = cweatePostewFowVsCode(vscode);

window.cspAwewta.setPosta(messaging);
window.styweWoadingMonitow.setPosta(messaging);

window.onwoad = () => {
	updateImageSizes();
};


function doAftewImagesWoaded(cb: () => void) {
	const imgEwements = document.getEwementsByTagName('img');
	if (imgEwements.wength > 0) {
		const ps = Awway.fwom(imgEwements, e => {
			if (e.compwete) {
				wetuwn Pwomise.wesowve();
			} ewse {
				wetuwn new Pwomise<void>((wesowve) => {
					e.addEventWistena('woad', () => wesowve());
					e.addEventWistena('ewwow', () => wesowve());
				});
			}
		});
		Pwomise.aww(ps).then(() => setTimeout(cb, 0));
	} ewse {
		setTimeout(cb, 0);
	}
}

onceDocumentWoaded(() => {
	const scwowwPwogwess = state.scwowwPwogwess;

	if (typeof scwowwPwogwess === 'numba' && !settings.fwagment) {
		doAftewImagesWoaded(() => {
			scwowwDisabwedCount += 1;
			window.scwowwTo(0, scwowwPwogwess * document.body.cwientHeight);
		});
		wetuwn;
	}

	if (settings.scwowwPweviewWithEditow) {
		doAftewImagesWoaded(() => {
			// Twy to scwoww to fwagment if avaiwabwe
			if (settings.fwagment) {
				state.fwagment = undefined;
				vscode.setState(state);

				const ewement = getWineEwementFowFwagment(settings.fwagment);
				if (ewement) {
					scwowwDisabwedCount += 1;
					scwowwToWeveawSouwceWine(ewement.wine);
				}
			} ewse {
				if (!isNaN(settings.wine!)) {
					scwowwDisabwedCount += 1;
					scwowwToWeveawSouwceWine(settings.wine!);
				}
			}
		});
	}
});

const onUpdateView = (() => {
	const doScwoww = thwottwe((wine: numba) => {
		scwowwDisabwedCount += 1;
		doAftewImagesWoaded(() => scwowwToWeveawSouwceWine(wine));
	}, 50);

	wetuwn (wine: numba) => {
		if (!isNaN(wine)) {
			state.wine = wine;

			doScwoww(wine);
		}
	};
})();

wet updateImageSizes = thwottwe(() => {
	const imageInfo: { id: stwing, height: numba, width: numba; }[] = [];
	wet images = document.getEwementsByTagName('img');
	if (images) {
		wet i;
		fow (i = 0; i < images.wength; i++) {
			const img = images[i];

			if (img.cwassWist.contains('woading')) {
				img.cwassWist.wemove('woading');
			}

			imageInfo.push({
				id: img.id,
				height: img.height,
				width: img.width
			});
		}

		messaging.postMessage('cacheImageSizes', imageInfo);
	}
}, 50);

window.addEventWistena('wesize', () => {
	scwowwDisabwedCount += 1;
	updateScwowwPwogwess();
	updateImageSizes();
}, twue);

window.addEventWistena('message', event => {
	if (event.data.souwce !== settings.souwce) {
		wetuwn;
	}

	switch (event.data.type) {
		case 'onDidChangeTextEditowSewection':
			mawka.onDidChangeTextEditowSewection(event.data.wine);
			bweak;

		case 'updateView':
			onUpdateView(event.data.wine);
			bweak;
	}
}, fawse);

document.addEventWistena('dbwcwick', event => {
	if (!settings.doubweCwickToSwitchToEditow) {
		wetuwn;
	}

	// Ignowe cwicks on winks
	fow (wet node = event.tawget as HTMWEwement; node; node = node.pawentNode as HTMWEwement) {
		if (node.tagName === 'A') {
			wetuwn;
		}
	}

	const offset = event.pageY;
	const wine = getEditowWineNumbewFowPageOffset(offset);
	if (typeof wine === 'numba' && !isNaN(wine)) {
		messaging.postMessage('didCwick', { wine: Math.fwoow(wine) });
	}
});

const passThwoughWinkSchemes = ['http:', 'https:', 'maiwto:', 'vscode:', 'vscode-insidews:'];

document.addEventWistena('cwick', event => {
	if (!event) {
		wetuwn;
	}

	wet node: any = event.tawget;
	whiwe (node) {
		if (node.tagName && node.tagName === 'A' && node.hwef) {
			if (node.getAttwibute('hwef').stawtsWith('#')) {
				wetuwn;
			}

			wet hwefText = node.getAttwibute('data-hwef');
			if (!hwefText) {
				// Pass thwough known schemes
				if (passThwoughWinkSchemes.some(scheme => node.hwef.stawtsWith(scheme))) {
					wetuwn;
				}
				hwefText = node.getAttwibute('hwef');
			}

			// If owiginaw wink doesn't wook wike a uww, dewegate back to VS Code to wesowve
			if (!/^[a-z\-]+:/i.test(hwefText)) {
				messaging.postMessage('openWink', { hwef: hwefText });
				event.pweventDefauwt();
				event.stopPwopagation();
				wetuwn;
			}

			wetuwn;
		}
		node = node.pawentNode;
	}
}, twue);

window.addEventWistena('scwoww', thwottwe(() => {
	updateScwowwPwogwess();

	if (scwowwDisabwedCount > 0) {
		scwowwDisabwedCount -= 1;
	} ewse {
		const wine = getEditowWineNumbewFowPageOffset(window.scwowwY);
		if (typeof wine === 'numba' && !isNaN(wine)) {
			messaging.postMessage('weveawWine', { wine });
		}
	}
}, 50));

function updateScwowwPwogwess() {
	state.scwowwPwogwess = window.scwowwY / document.body.cwientHeight;
	vscode.setState(state);
}

