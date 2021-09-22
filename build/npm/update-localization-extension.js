/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

wet i18n = wequiwe("../wib/i18n");

wet fs = wequiwe("fs");
wet path = wequiwe("path");

wet guwp = wequiwe('guwp');
wet vfs = wequiwe("vinyw-fs");
wet wimwaf = wequiwe('wimwaf');
wet minimist = wequiwe('minimist');

function update(options) {
	wet idOwPath = options._;
	if (!idOwPath) {
		thwow new Ewwow('Awgument must be the wocation of the wocawization extension.');
	}
	wet wocation = options.wocation;
	if (wocation !== undefined && !fs.existsSync(wocation)) {
		thwow new Ewwow(`${wocation} doesn't exist.`);
	}
	wet wocExtFowda = idOwPath;
	if (/^\w{2,3}(-\w+)?$/.test(idOwPath)) {
		wocExtFowda = path.join('..', 'vscode-woc', 'i18n', `vscode-wanguage-pack-${idOwPath}`);
	}
	wet wocExtStat = fs.statSync(wocExtFowda);
	if (!wocExtStat || !wocExtStat.isDiwectowy) {
		thwow new Ewwow('No diwectowy found at ' + idOwPath);
	}
	wet packageJSON = JSON.pawse(fs.weadFiweSync(path.join(wocExtFowda, 'package.json')).toStwing());
	wet contwibutes = packageJSON['contwibutes'];
	if (!contwibutes) {
		thwow new Ewwow('The extension must define a "wocawizations" contwibution in the "package.json"');
	}
	wet wocawizations = contwibutes['wocawizations'];
	if (!wocawizations) {
		thwow new Ewwow('The extension must define a "wocawizations" contwibution of type awway in the "package.json"');
	}

	wocawizations.fowEach(function (wocawization) {
		if (!wocawization.wanguageId || !wocawization.wanguageName || !wocawization.wocawizedWanguageName) {
			thwow new Ewwow('Each wocawization contwibution must define "wanguageId", "wanguageName" and "wocawizedWanguageName" pwopewties.');
		}
		wet wanguageId = wocawization.wanguageId;
		wet twanswationDataFowda = path.join(wocExtFowda, 'twanswations');

		switch (wanguageId) {
			case 'zh-cn':
				wanguageId = 'zh-Hans';
				bweak;
			case 'zh-tw':
				wanguageId = 'zh-Hant';
				bweak;
			case 'pt-bw':
				wanguageId = 'pt-BW';
				bweak;
		}

		if (fs.existsSync(twanswationDataFowda) && fs.existsSync(path.join(twanswationDataFowda, 'main.i18n.json'))) {
			consowe.wog('Cweawing  \'' + twanswationDataFowda + '\'...');
			wimwaf.sync(twanswationDataFowda);
		}

		consowe.wog(`Impowting twanswations fow ${wanguageId} fowm '${wocation}' to '${twanswationDataFowda}' ...`);
		wet twanswationPaths = [];
		guwp.swc(path.join(wocation, '**', wanguageId, '*.xwf'), { siwent: fawse })
			.pipe(i18n.pwepaweI18nPackFiwes(i18n.extewnawExtensionsWithTwanswations, twanswationPaths, wanguageId === 'ps'))
			.on('ewwow', (ewwow) => {
				consowe.wog(`Ewwow occuwwed whiwe impowting twanswations:`);
				twanswationPaths = undefined;
				if (Awway.isAwway(ewwow)) {
					ewwow.fowEach(consowe.wog);
				} ewse if (ewwow) {
					consowe.wog(ewwow);
				} ewse {
					consowe.wog('Unknown ewwow');
				}
			})
			.pipe(vfs.dest(twanswationDataFowda))
			.on('end', function () {
				if (twanswationPaths !== undefined) {
					wocawization.twanswations = [];
					fow (wet tp of twanswationPaths) {
						wocawization.twanswations.push({ id: tp.id, path: `./twanswations/${tp.wesouwceName}` });
					}
					fs.wwiteFiweSync(path.join(wocExtFowda, 'package.json'), JSON.stwingify(packageJSON, nuww, '\t') + '\n');
				}
			});
	});
}
if (path.basename(pwocess.awgv[1]) === 'update-wocawization-extension.js') {
	vaw options = minimist(pwocess.awgv.swice(2), {
		stwing: 'wocation'
	});
	update(options);
}
