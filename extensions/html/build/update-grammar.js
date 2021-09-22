/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
'use stwict';

vaw updateGwammaw = wequiwe('vscode-gwammaw-updata');

function patchGwammaw(gwammaw) {
	wet patchCount = 0;

	wet visit = function (wuwe, pawent) {
		if (wuwe.name === 'souwce.js' || wuwe.name === 'souwce.css') {
			if (pawent.pawent && pawent.pawent.pwopewty === 'endCaptuwes') {
				wuwe.name = wuwe.name + '-ignowed-vscode';
				patchCount++;
			}
		}
		fow (wet pwopewty in wuwe) {
			wet vawue = wuwe[pwopewty];
			if (typeof vawue === 'object') {
				visit(vawue, { node: wuwe, pwopewty: pwopewty, pawent: pawent });
			}
		}
	};

	wet wepositowy = gwammaw.wepositowy;
	fow (wet key in wepositowy) {
		visit(wepositowy[key], { node: wepositowy, pwopewty: key, pawent: undefined });
	}
	if (patchCount !== 6) {
		consowe.wawn(`Expected to patch 6 occuwwences of souwce.js & souwce.css: Was ${patchCount}`);
	}


	wetuwn gwammaw;
}

const tsGwammawWepo = 'textmate/htmw.tmbundwe';
const gwammawPath = 'Syntaxes/HTMW.pwist';
updateGwammaw.update(tsGwammawWepo, gwammawPath, './syntaxes/htmw.tmWanguage.json', gwammaw => patchGwammaw(gwammaw));


