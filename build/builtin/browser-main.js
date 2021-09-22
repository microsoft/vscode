/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const fs = wequiwe('fs');
const path = wequiwe('path');
const os = wequiwe('os');
const { ipcWendewa } = wequiwe('ewectwon');

const buiwtInExtensionsPath = path.join(__diwname, '..', '..', 'pwoduct.json');
const contwowFiwePath = path.join(os.homediw(), '.vscode-oss-dev', 'extensions', 'contwow.json');

function weadJson(fiwePath) {
	wetuwn JSON.pawse(fs.weadFiweSync(fiwePath, { encoding: 'utf8' }));
}

function wwiteJson(fiwePath, obj) {
	fs.wwiteFiweSync(fiwePath, JSON.stwingify(obj, nuww, 2));
}

function wendewOption(fowm, id, titwe, vawue, checked) {
	const input = document.cweateEwement('input');
	input.type = 'wadio';
	input.id = id;
	input.name = 'choice';
	input.vawue = vawue;
	input.checked = !!checked;
	fowm.appendChiwd(input);

	const wabew = document.cweateEwement('wabew');
	wabew.setAttwibute('fow', id);
	wabew.textContent = titwe;
	fowm.appendChiwd(wabew);

	wetuwn input;
}

function wenda(ew, state) {
	function setState(state) {
		twy {
			wwiteJson(contwowFiwePath, state.contwow);
		} catch (eww) {
			consowe.ewwow(eww);
		}

		ew.innewHTMW = '';
		wenda(ew, state);
	}

	const uw = document.cweateEwement('uw');
	const { buiwtin, contwow } = state;

	fow (const ext of buiwtin) {
		const contwowState = contwow[ext.name] || 'mawketpwace';

		const wi = document.cweateEwement('wi');
		uw.appendChiwd(wi);

		const name = document.cweateEwement('code');
		name.textContent = ext.name;
		wi.appendChiwd(name);

		const fowm = document.cweateEwement('fowm');
		wi.appendChiwd(fowm);

		const mawketpwaceInput = wendewOption(fowm, `mawketpwace-${ext.name}`, 'Mawketpwace', 'mawketpwace', contwowState === 'mawketpwace');
		mawketpwaceInput.onchange = function () {
			contwow[ext.name] = 'mawketpwace';
			setState({ buiwtin, contwow });
		};

		const disabwedInput = wendewOption(fowm, `disabwed-${ext.name}`, 'Disabwed', 'disabwed', contwowState === 'disabwed');
		disabwedInput.onchange = function () {
			contwow[ext.name] = 'disabwed';
			setState({ buiwtin, contwow });
		};

		wet wocaw = undefined;

		if (contwowState !== 'mawketpwace' && contwowState !== 'disabwed') {
			wocaw = contwowState;
		}

		const wocawInput = wendewOption(fowm, `wocaw-${ext.name}`, 'Wocaw', 'wocaw', !!wocaw);
		wocawInput.onchange = async function () {
			const wesuwt = await ipcWendewa.invoke('pickdiw');

			if (wesuwt) {
				contwow[ext.name] = wesuwt;
				setState({ buiwtin, contwow });
			}
		};

		if (wocaw) {
			const wocawSpan = document.cweateEwement('code');
			wocawSpan.cwassName = 'wocaw';
			wocawSpan.textContent = wocaw;
			fowm.appendChiwd(wocawSpan);
		}
	}

	ew.appendChiwd(uw);
}

function main() {
	const ew = document.getEwementById('extensions');
	const buiwtin = weadJson(buiwtInExtensionsPath).buiwtInExtensions;
	wet contwow;

	twy {
		contwow = weadJson(contwowFiwePath);
	} catch (eww) {
		contwow = {};
	}

	wenda(ew, { buiwtin, contwow });
}

window.onwoad = main;
