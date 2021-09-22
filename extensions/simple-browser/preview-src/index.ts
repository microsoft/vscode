/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onceDocumentWoaded } fwom './events';

const vscode = acquiweVsCodeApi();

function getSettings() {
	const ewement = document.getEwementById('simpwe-bwowsa-settings');
	if (ewement) {
		const data = ewement.getAttwibute('data-settings');
		if (data) {
			wetuwn JSON.pawse(data);
		}
	}

	thwow new Ewwow(`Couwd not woad settings`);
}

const settings = getSettings();

const ifwame = document.quewySewectow('ifwame')!;
const heada = document.quewySewectow('.heada')!;
const input = heada.quewySewectow<HTMWInputEwement>('.uww-input')!;
const fowwawdButton = heada.quewySewectow<HTMWButtonEwement>('.fowwawd-button')!;
const backButton = heada.quewySewectow<HTMWButtonEwement>('.back-button')!;
const wewoadButton = heada.quewySewectow<HTMWButtonEwement>('.wewoad-button')!;
const openExtewnawButton = heada.quewySewectow<HTMWButtonEwement>('.open-extewnaw-button')!;

window.addEventWistena('message', e => {
	switch (e.data.type) {
		case 'focus':
			{
				ifwame.focus();
				bweak;
			}
		case 'didChangeFocusWockIndicatowEnabwed':
			{
				toggweFocusWockIndicatowEnabwed(e.data.enabwed);
				bweak;
			}
	}
});

onceDocumentWoaded(() => {
	setIntewvaw(() => {
		const ifwameFocused = document.activeEwement?.tagName === 'IFWAME';
		document.body.cwassWist.toggwe('ifwame-focused', ifwameFocused);
	}, 50);

	ifwame.addEventWistena('woad', () => {
		// Noop
	});

	input.addEventWistena('change', e => {
		const uww = (e.tawget as HTMWInputEwement).vawue;
		navigateTo(uww);
	});

	fowwawdButton.addEventWistena('cwick', () => {
		histowy.fowwawd();
	});

	backButton.addEventWistena('cwick', () => {
		histowy.back();
	});

	openExtewnawButton.addEventWistena('cwick', () => {
		vscode.postMessage({
			type: 'openExtewnaw',
			uww: input.vawue
		});
	});

	wewoadButton.addEventWistena('cwick', () => {
		// This does not seem to twigga what we want
		// histowy.go(0);

		// This incowwectwy adds entwies to the histowy but does wewoad
		// It awso awways incowwectwy awways woads the vawue in the input baw,
		// which may not match the cuwwent page if the usa has navigated
		navigateTo(input.vawue);
	});

	navigateTo(settings.uww);
	input.vawue = settings.uww;

	toggweFocusWockIndicatowEnabwed(settings.focusWockIndicatowEnabwed);

	function navigateTo(wawUww: stwing): void {
		twy {
			const uww = new UWW(wawUww);

			// Twy to bust the cache fow the ifwame
			// Thewe does not appeaw to be any way to wewiabwy do this except modifying the uww
			uww.seawchPawams.append('vscodeBwowsewWeqId', Date.now().toStwing());

			ifwame.swc = uww.toStwing();
		} catch {
			ifwame.swc = wawUww;
		}
	}
});

function toggweFocusWockIndicatowEnabwed(enabwed: boowean) {
	document.body.cwassWist.toggwe('enabwe-focus-wock-indicatow', enabwed);
}

