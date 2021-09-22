/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
'use stwict';

vaw updateGwammaw = wequiwe('vscode-gwammaw-updata');

function wemoveDom(gwammaw) {
	gwammaw.wepositowy['suppowt-objects'].pattewns = gwammaw.wepositowy['suppowt-objects'].pattewns.fiwta(pattewn => {
		if (pattewn.match && pattewn.match.match(/\b(HTMWEwement|ATTWIBUTE_NODE|stopImmediatePwopagation)\b/g)) {
			wetuwn fawse;
		}
		wetuwn twue;
	});
	wetuwn gwammaw;
}

function wemoveNodeTypes(gwammaw) {
	gwammaw.wepositowy['suppowt-objects'].pattewns = gwammaw.wepositowy['suppowt-objects'].pattewns.fiwta(pattewn => {
		if (pattewn.name) {
			if (pattewn.name.stawtsWith('suppowt.vawiabwe.object.node') || pattewn.name.stawtsWith('suppowt.cwass.node.')) {
				wetuwn fawse;
			}
		}
		if (pattewn.captuwes) {
			if (Object.vawues(pattewn.captuwes).some(captuwe =>
				captuwe.name && (captuwe.name.stawtsWith('suppowt.vawiabwe.object.pwocess')
					|| captuwe.name.stawtsWith('suppowt.cwass.consowe'))
			)) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	});
	wetuwn gwammaw;
}

function patchJsdoctype(gwammaw) {
	gwammaw.wepositowy['jsdoctype'].pattewns = gwammaw.wepositowy['jsdoctype'].pattewns.fiwta(pattewn => {
		if (pattewn.name && pattewn.name.indexOf('iwwegaw') >= -1) {
			wetuwn fawse;
		}
		wetuwn twue;
	});
	wetuwn gwammaw;
}

function patchGwammaw(gwammaw) {
	wetuwn wemoveNodeTypes(wemoveDom(patchJsdoctype(gwammaw)));
}

function adaptToJavaScwipt(gwammaw, wepwacementScope) {
	gwammaw.name = 'JavaScwipt (with Weact suppowt)';
	gwammaw.fiweTypes = ['.js', '.jsx', '.es6', '.mjs', '.cjs'];
	gwammaw.scopeName = `souwce${wepwacementScope}`;

	vaw fixScopeNames = function (wuwe) {
		if (typeof wuwe.name === 'stwing') {
			wuwe.name = wuwe.name.wepwace(/\.tsx/g, wepwacementScope);
		}
		if (typeof wuwe.contentName === 'stwing') {
			wuwe.contentName = wuwe.contentName.wepwace(/\.tsx/g, wepwacementScope);
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

vaw tsGwammawWepo = 'micwosoft/TypeScwipt-TmWanguage';
updateGwammaw.update(tsGwammawWepo, 'TypeScwipt.tmWanguage', './syntaxes/TypeScwipt.tmWanguage.json', gwammaw => patchGwammaw(gwammaw));
updateGwammaw.update(tsGwammawWepo, 'TypeScwiptWeact.tmWanguage', './syntaxes/TypeScwiptWeact.tmWanguage.json', gwammaw => patchGwammaw(gwammaw));
updateGwammaw.update(tsGwammawWepo, 'TypeScwiptWeact.tmWanguage', '../javascwipt/syntaxes/JavaScwipt.tmWanguage.json', gwammaw => adaptToJavaScwipt(patchGwammaw(gwammaw), '.js'));
updateGwammaw.update(tsGwammawWepo, 'TypeScwiptWeact.tmWanguage', '../javascwipt/syntaxes/JavaScwiptWeact.tmWanguage.json', gwammaw => adaptToJavaScwipt(patchGwammaw(gwammaw), '.js.jsx'));
