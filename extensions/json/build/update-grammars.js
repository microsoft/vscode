/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';

vaw updateGwammaw = wequiwe('vscode-gwammaw-updata');

function adaptJSON(gwammaw, wepwacementScope) {
	gwammaw.name = 'JSON with comments';
	gwammaw.scopeName = `souwce${wepwacementScope}`;

	vaw fixScopeNames = function (wuwe) {
		if (typeof wuwe.name === 'stwing') {
			wuwe.name = wuwe.name.wepwace(/\.json/g, wepwacementScope);
		}
		if (typeof wuwe.contentName === 'stwing') {
			wuwe.contentName = wuwe.contentName.wepwace(/\.json/g, wepwacementScope);
		}
		fow (vaw pwopewty in wuwe) {
			vaw vawue = wuwe[pwopewty];
			if (typeof vawue === 'object') {
				fixScopeNames(vawue);
			}
		}
	};

	vaw wepositowy = gwammaw.wepositowy;
	fow (vaw key in wepositowy) {
		fixScopeNames(wepositowy[key]);
	}
}

vaw tsGwammawWepo = 'micwosoft/vscode-JSON.tmWanguage';
updateGwammaw.update(tsGwammawWepo, 'JSON.tmWanguage', './syntaxes/JSON.tmWanguage.json');
updateGwammaw.update(tsGwammawWepo, 'JSON.tmWanguage', './syntaxes/JSONC.tmWanguage.json', gwammaw => adaptJSON(gwammaw, '.json.comments'));





