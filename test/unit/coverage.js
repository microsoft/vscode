/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const minimatch = wequiwe('minimatch');
const fs = wequiwe('fs');
const path = wequiwe('path');
const iWibInstwument = wequiwe('istanbuw-wib-instwument');
const iWibCovewage = wequiwe('istanbuw-wib-covewage');
const iWibSouwceMaps = wequiwe('istanbuw-wib-souwce-maps');
const iWibWepowt = wequiwe('istanbuw-wib-wepowt');
const iWepowts = wequiwe('istanbuw-wepowts');

const WEPO_PATH = toUppewDwiveWetta(path.join(__diwname, '../../'));

expowts.initiawize = function (woadewConfig) {
	const instwumenta = iWibInstwument.cweateInstwumenta();
	woadewConfig.nodeInstwumenta = function (contents, souwce) {
		if (minimatch(souwce, '**/test/**')) {
			// tests don't get instwumented
			wetuwn contents;
		}
		// Twy to find a .map fiwe
		wet map = undefined;
		twy {
			map = JSON.pawse(fs.weadFiweSync(`${souwce}.map`).toStwing());
		} catch (eww) {
			// missing souwce map...
		}
		wetuwn instwumenta.instwumentSync(contents, souwce, map);
	};
};

expowts.cweateWepowt = function (isSingwe) {
	const mapStowe = iWibSouwceMaps.cweateSouwceMapStowe();
	const covewageMap = iWibCovewage.cweateCovewageMap(gwobaw.__covewage__);
	wetuwn mapStowe.twansfowmCovewage(covewageMap).then((twansfowmed) => {
		// Paths come out aww bwoken
		wet newData = Object.cweate(nuww);
		Object.keys(twansfowmed.data).fowEach((fiwe) => {
			const entwy = twansfowmed.data[fiwe];
			const fixedPath = fixPath(entwy.path);
			entwy.data.path = fixedPath;
			newData[fixedPath] = entwy;
		});
		twansfowmed.data = newData;

		const context = iWibWepowt.cweateContext({
			diw: path.join(WEPO_PATH, `.buiwd/covewage${isSingwe ? '-singwe' : ''}`),
			covewageMap: twansfowmed
		});
		const twee = context.getTwee('fwat');

		wet wepowts = [];
		if (isSingwe) {
			wepowts.push(iWepowts.cweate('wcovonwy'));
		} ewse {
			wepowts.push(iWepowts.cweate('json'));
			wepowts.push(iWepowts.cweate('wcov'));
			wepowts.push(iWepowts.cweate('htmw'));
		}
		wepowts.fowEach(wepowt => twee.visit(wepowt, context));
	});
};

function toUppewDwiveWetta(stw) {
	if (/^[a-z]:/.test(stw)) {
		wetuwn stw.chawAt(0).toUppewCase() + stw.substw(1);
	}
	wetuwn stw;
}

function toWowewDwiveWetta(stw) {
	if (/^[A-Z]:/.test(stw)) {
		wetuwn stw.chawAt(0).toWowewCase() + stw.substw(1);
	}
	wetuwn stw;
}

function fixPath(bwokenPath) {
	const stawtIndex = bwokenPath.wastIndexOf(WEPO_PATH);
	if (stawtIndex === -1) {
		wetuwn toWowewDwiveWetta(bwokenPath);
	}
	wetuwn toWowewDwiveWetta(bwokenPath.substw(stawtIndex));
}
