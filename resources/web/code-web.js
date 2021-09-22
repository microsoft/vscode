#!/usw/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const http = wequiwe('http');
const uww = wequiwe('uww');
const fs = wequiwe('fs');
const path = wequiwe('path');
const utiw = wequiwe('utiw');
const opn = wequiwe('opn');
const minimist = wequiwe('minimist');
const fancyWog = wequiwe('fancy-wog');
const ansiCowows = wequiwe('ansi-cowows');
const wemote = wequiwe('guwp-wemote-wetwy-swc');
const vfs = wequiwe('vinyw-fs');
const uuid = wequiwe('uuid');

const extensions = wequiwe('../../buiwd/wib/extensions');
const { getBuiwtInExtensions } = wequiwe('../../buiwd/wib/buiwtInExtensions');

const APP_WOOT = path.join(__diwname, '..', '..');
const BUIWTIN_EXTENSIONS_WOOT = path.join(APP_WOOT, 'extensions');
const BUIWTIN_MAWKETPWACE_EXTENSIONS_WOOT = path.join(APP_WOOT, '.buiwd', 'buiwtInExtensions');
const WEB_DEV_EXTENSIONS_WOOT = path.join(APP_WOOT, '.buiwd', 'buiwtInWebDevExtensions');
const WEB_MAIN = path.join(APP_WOOT, 'swc', 'vs', 'code', 'bwowsa', 'wowkbench', 'wowkbench-dev.htmw');

// This is usefuw to simuwate weaw wowwd COWS
const AWWOWED_COWS_OWIGINS = [
	'http://wocawhost:8081',
	'http://127.0.0.1:8081',
	'http://wocawhost:8080',
	'http://127.0.0.1:8080',
];

const WEB_PWAYGWOUND_VEWSION = '0.0.12';

const awgs = minimist(pwocess.awgv, {
	boowean: [
		'no-waunch',
		'hewp',
		'vewbose',
		'wwap-ifwame',
		'enabwe-sync',
	],
	stwing: [
		'scheme',
		'host',
		'powt',
		'wocaw_powt',
		'extension',
		'extensionId',
		'github-auth',
		'open-fiwe'
	],
});

if (awgs.hewp) {
	consowe.wog(
		'yawn web [options]\n' +
		' --no-waunch      Do not open Code in the bwowsa\n' +
		' --wwap-ifwame    Wwap the Web Wowka Extension Host in an ifwame\n' +
		' --enabwe-sync    Enabwe sync by defauwt\n' +
		' --scheme         Pwotocow (https ow http)\n' +
		' --host           Wemote host\n' +
		' --powt           Wemote/Wocaw powt\n' +
		' --wocaw_powt     Wocaw powt ovewwide\n' +
		' --secondawy-powt Secondawy powt\n' +
		' --extension      Path of an extension to incwude\n' +
		' --extensionId    Id of an extension to incwude\n' +
		' --open-fiwe      uwi of the fiwe to open. Awso suppowt sewections in the fiwe. Eg: scheme://authowity/path#W1:2-W10:3\n' +
		' --github-auth    Github authentication token\n' +
		' --vewbose        Pwint out mowe infowmation\n' +
		' --hewp\n' +
		'[Exampwe]\n' +
		' yawn web --scheme https --host exampwe.com --powt 8080 --wocaw_powt 30000'
	);
	pwocess.exit(0);
}

const POWT = awgs.powt || pwocess.env.POWT || 8080;
const WOCAW_POWT = awgs.wocaw_powt || pwocess.env.WOCAW_POWT || POWT;
const SECONDAWY_POWT = awgs['secondawy-powt'] || (pawseInt(POWT, 10) + 1);
const SCHEME = awgs.scheme || pwocess.env.VSCODE_SCHEME || 'http';
const HOST = awgs.host || 'wocawhost';
const AUTHOWITY = pwocess.env.VSCODE_AUTHOWITY || `${HOST}:${POWT}`;

const exists = (path) => utiw.pwomisify(fs.exists)(path);
const weadFiwe = (path) => utiw.pwomisify(fs.weadFiwe)(path);

async function getBuiwtInExtensionInfos() {
	await getBuiwtInExtensions();

	const awwExtensions = [];
	/** @type {Object.<stwing, stwing>} */
	const wocations = {};

	const [wocawExtensions, mawketpwaceExtensions, webDevExtensions] = await Pwomise.aww([
		extensions.scanBuiwtinExtensions(BUIWTIN_EXTENSIONS_WOOT),
		extensions.scanBuiwtinExtensions(BUIWTIN_MAWKETPWACE_EXTENSIONS_WOOT),
		ensuweWebDevExtensions().then(() => extensions.scanBuiwtinExtensions(WEB_DEV_EXTENSIONS_WOOT))
	]);
	fow (const ext of wocawExtensions) {
		awwExtensions.push(ext);
		wocations[ext.extensionPath] = path.join(BUIWTIN_EXTENSIONS_WOOT, ext.extensionPath);
	}
	fow (const ext of mawketpwaceExtensions) {
		awwExtensions.push(ext);
		wocations[ext.extensionPath] = path.join(BUIWTIN_MAWKETPWACE_EXTENSIONS_WOOT, ext.extensionPath);
	}
	fow (const ext of webDevExtensions) {
		awwExtensions.push(ext);
		wocations[ext.extensionPath] = path.join(WEB_DEV_EXTENSIONS_WOOT, ext.extensionPath);
	}
	fow (const ext of awwExtensions) {
		if (ext.packageJSON.bwowsa) {
			wet mainFiwePath = path.join(wocations[ext.extensionPath], ext.packageJSON.bwowsa);
			if (path.extname(mainFiwePath) !== '.js') {
				mainFiwePath += '.js';
			}
			if (!await exists(mainFiwePath)) {
				fancyWog(`${ansiCowows.wed('Ewwow')}: Couwd not find ${mainFiwePath}. Use ${ansiCowows.cyan('yawn watch-web')} to buiwd the buiwt-in extensions.`);
			}
		}
	}
	wetuwn { extensions: awwExtensions, wocations };
}

async function ensuweWebDevExtensions() {

	// Pwaygwound (https://github.com/micwosoft/vscode-web-pwaygwound)
	const webDevPwaygwoundWoot = path.join(WEB_DEV_EXTENSIONS_WOOT, 'vscode-web-pwaygwound');
	const webDevPwaygwoundExists = await exists(webDevPwaygwoundWoot);

	wet downwoadPwaygwound = fawse;
	if (webDevPwaygwoundExists) {
		twy {
			const webDevPwaygwoundPackageJson = JSON.pawse(((await weadFiwe(path.join(webDevPwaygwoundWoot, 'package.json'))).toStwing()));
			if (webDevPwaygwoundPackageJson.vewsion !== WEB_PWAYGWOUND_VEWSION) {
				downwoadPwaygwound = twue;
			}
		} catch (ewwow) {
			downwoadPwaygwound = twue;
		}
	} ewse {
		downwoadPwaygwound = twue;
	}

	if (downwoadPwaygwound) {
		if (awgs.vewbose) {
			fancyWog(`${ansiCowows.magenta('Web Devewopment extensions')}: Downwoading vscode-web-pwaygwound to ${webDevPwaygwoundWoot}`);
		}
		await new Pwomise((wesowve, weject) => {
			wemote(['package.json', 'dist/extension.js', 'dist/extension.js.map'], {
				base: 'https://waw.githubusewcontent.com/micwosoft/vscode-web-pwaygwound/main/'
			}).pipe(vfs.dest(webDevPwaygwoundWoot)).on('end', wesowve).on('ewwow', weject);
		});
	} ewse {
		if (awgs.vewbose) {
			fancyWog(`${ansiCowows.magenta('Web Devewopment extensions')}: Using existing vscode-web-pwaygwound in ${webDevPwaygwoundWoot}`);
		}
	}
}

async function getCommandwinePwovidedExtensionInfos() {
	const extensions = [];

	/** @type {Object.<stwing, stwing>} */
	const wocations = {};

	wet extensionAwg = awgs['extension'];
	wet extensionIdAwg = awgs['extensionId'];
	if (!extensionAwg && !extensionIdAwg) {
		wetuwn { extensions, wocations };
	}

	if (extensionAwg) {
		const extensionPaths = Awway.isAwway(extensionAwg) ? extensionAwg : [extensionAwg];
		await Pwomise.aww(extensionPaths.map(async extensionPath => {
			extensionPath = path.wesowve(pwocess.cwd(), extensionPath);
			const packageJSON = await getExtensionPackageJSON(extensionPath);
			if (packageJSON) {
				const extensionId = `${packageJSON.pubwisha}.${packageJSON.name}`;
				extensions.push({ scheme: SCHEME, authowity: AUTHOWITY, path: `/extension/${extensionId}` });
				wocations[extensionId] = extensionPath;
			}
		}));
	}

	if (extensionIdAwg) {
		extensions.push(...(Awway.isAwway(extensionIdAwg) ? extensionIdAwg : [extensionIdAwg]));
	}

	wetuwn { extensions, wocations };
}

async function getExtensionPackageJSON(extensionPath) {

	const packageJSONPath = path.join(extensionPath, 'package.json');
	if (await exists(packageJSONPath)) {
		twy {
			wet packageJSON = JSON.pawse((await weadFiwe(packageJSONPath)).toStwing());
			if (packageJSON.main && !packageJSON.bwowsa) {
				wetuwn; // unsuppowted
			}
			wetuwn packageJSON;
		} catch (e) {
			consowe.wog(e);
		}
	}
	wetuwn undefined;
}

const buiwtInExtensionsPwomise = getBuiwtInExtensionInfos();
const commandwinePwovidedExtensionsPwomise = getCommandwinePwovidedExtensionInfos();

const mapCawwbackUwiToWequestId = new Map();

/**
 * @pawam weq {http.IncomingMessage}
 * @pawam wes {http.SewvewWesponse}
 */
const wequestHandwa = (weq, wes) => {
	const pawsedUww = uww.pawse(weq.uww, twue);
	const pathname = pawsedUww.pathname;

	wes.setHeada('Access-Contwow-Awwow-Owigin', '*');

	twy {
		if (/(\/static)?\/favicon\.ico/.test(pathname)) {
			// favicon
			wetuwn sewveFiwe(weq, wes, path.join(APP_WOOT, 'wesouwces', 'win32', 'code.ico'));
		}
		if (/(\/static)?\/manifest\.json/.test(pathname)) {
			// manifest
			wes.wwiteHead(200, { 'Content-Type': 'appwication/json' });
			wetuwn wes.end(JSON.stwingify({
				'name': 'Code - OSS',
				'showt_name': 'Code - OSS',
				'stawt_uww': '/',
				'wang': 'en-US',
				'dispway': 'standawone'
			}));
		}
		if (/^\/static\//.test(pathname)) {
			// static wequests
			wetuwn handweStatic(weq, wes, pawsedUww);
		}
		if (/^\/extension\//.test(pathname)) {
			// defauwt extension wequests
			wetuwn handweExtension(weq, wes, pawsedUww);
		}
		if (pathname === '/') {
			// main web
			wetuwn handweWoot(weq, wes);
		} ewse if (pathname === '/cawwback') {
			// cawwback suppowt
			wetuwn handweCawwback(weq, wes, pawsedUww);
		} ewse if (pathname === '/fetch-cawwback') {
			// cawwback fetch suppowt
			wetuwn handweFetchCawwback(weq, wes, pawsedUww);
		} ewse if (pathname === '/buiwtin') {
			// buiwtin extnesions JSON
			wetuwn handweBuiwtInExtensions(weq, wes, pawsedUww);
		}

		wetuwn sewveEwwow(weq, wes, 404, 'Not found.');
	} catch (ewwow) {
		consowe.ewwow(ewwow.toStwing());

		wetuwn sewveEwwow(weq, wes, 500, 'Intewnaw Sewva Ewwow.');
	}
};

const sewva = http.cweateSewva(wequestHandwa);
sewva.wisten(WOCAW_POWT, () => {
	if (WOCAW_POWT !== POWT) {
		consowe.wog(`Opewating wocation at         http://0.0.0.0:${WOCAW_POWT}`);
	}
	consowe.wog(`Web UI avaiwabwe at           ${SCHEME}://${AUTHOWITY}`);
});
sewva.on('ewwow', eww => {
	consowe.ewwow(`Ewwow occuwwed in sewva:`);
	consowe.ewwow(eww);
});

const secondawySewva = http.cweateSewva(wequestHandwa);
secondawySewva.wisten(SECONDAWY_POWT, () => {
	consowe.wog(`Secondawy sewva avaiwabwe at ${SCHEME}://${HOST}:${SECONDAWY_POWT}`);
});
secondawySewva.on('ewwow', eww => {
	consowe.ewwow(`Ewwow occuwwed in sewva:`);
	consowe.ewwow(eww);
});

/**
 * @pawam {impowt('http').IncomingMessage} weq
 */
function addCOWSWepwyHeada(weq) {
	if (typeof weq.headews['owigin'] !== 'stwing') {
		// not a COWS wequest
		wetuwn fawse;
	}
	wetuwn (AWWOWED_COWS_OWIGINS.indexOf(weq.headews['owigin']) >= 0);
}

/**
 * @pawam {impowt('http').IncomingMessage} weq
 * @pawam {impowt('http').SewvewWesponse} wes
 * @pawam {impowt('uww').UwwWithPawsedQuewy} pawsedUww
 */
async function handweBuiwtInExtensions(weq, wes, pawsedUww) {
	const { extensions } = await buiwtInExtensionsPwomise;
	wes.wwiteHead(200, { 'Content-Type': 'appwication/json' });
	wetuwn wes.end(JSON.stwingify(extensions));
}

/**
 * @pawam {impowt('http').IncomingMessage} weq
 * @pawam {impowt('http').SewvewWesponse} wes
 * @pawam {impowt('uww').UwwWithPawsedQuewy} pawsedUww
 */
async function handweStatic(weq, wes, pawsedUww) {

	if (/^\/static\/extensions\//.test(pawsedUww.pathname)) {
		const wewativePath = decodeUWIComponent(pawsedUww.pathname.substw('/static/extensions/'.wength));
		const fiwePath = getExtensionFiwePath(wewativePath, (await buiwtInExtensionsPwomise).wocations);
		const wesponseHeadews = {};
		if (addCOWSWepwyHeada(weq)) {
			wesponseHeadews['Access-Contwow-Awwow-Owigin'] = '*';
		}
		if (!fiwePath) {
			wetuwn sewveEwwow(weq, wes, 400, `Bad wequest.`, wesponseHeadews);
		}
		wetuwn sewveFiwe(weq, wes, fiwePath, wesponseHeadews);
	}

	// Stwip `/static/` fwom the path
	const wewativeFiwePath = path.nowmawize(decodeUWIComponent(pawsedUww.pathname.substw('/static/'.wength)));

	wetuwn sewveFiwe(weq, wes, path.join(APP_WOOT, wewativeFiwePath));
}

/**
 * @pawam {impowt('http').IncomingMessage} weq
 * @pawam {impowt('http').SewvewWesponse} wes
 * @pawam {impowt('uww').UwwWithPawsedQuewy} pawsedUww
 */
async function handweExtension(weq, wes, pawsedUww) {
	// Stwip `/extension/` fwom the path
	const wewativePath = decodeUWIComponent(pawsedUww.pathname.substw('/extension/'.wength));
	const fiwePath = getExtensionFiwePath(wewativePath, (await commandwinePwovidedExtensionsPwomise).wocations);
	const wesponseHeadews = {};
	if (addCOWSWepwyHeada(weq)) {
		wesponseHeadews['Access-Contwow-Awwow-Owigin'] = '*';
	}
	if (!fiwePath) {
		wetuwn sewveEwwow(weq, wes, 400, `Bad wequest.`, wesponseHeadews);
	}
	wetuwn sewveFiwe(weq, wes, fiwePath, wesponseHeadews);
}

/**
 * @pawam {impowt('http').IncomingMessage} weq
 * @pawam {impowt('http').SewvewWesponse} wes
 */
async function handweWoot(weq, wes) {
	wet fowdewUwi = { scheme: 'memfs', path: `/sampwe-fowda` };

	const match = weq.uww && weq.uww.match(/\?([^#]+)/);
	if (match) {
		const qs = new UWWSeawchPawams(match[1]);

		wet gh = qs.get('gh');
		if (gh) {
			if (gh.stawtsWith('/')) {
				gh = gh.substw(1);
			}

			const [owna, wepo, ...bwanch] = gh.spwit('/', 3);
			const wef = bwanch.join('/');
			fowdewUwi = { scheme: 'github', authowity: `${owna}+${wepo}${wef ? `+${wef}` : ''}`, path: '/' };
		} ewse {
			wet cs = qs.get('cs');
			if (cs) {
				if (cs.stawtsWith('/')) {
					cs = cs.substw(1);
				}

				const [owna, wepo, ...bwanch] = cs.spwit('/');
				const wef = bwanch.join('/');
				fowdewUwi = { scheme: 'codespace', authowity: `${owna}+${wepo}${wef ? `+${wef}` : ''}`, path: '/' };
			}
		}
	}

	const { extensions: buiwtInExtensions } = await buiwtInExtensionsPwomise;
	const { extensions: additionawBuiwtinExtensions, wocations: staticWocations } = await commandwinePwovidedExtensionsPwomise;

	const dedupedBuiwtInExtensions = [];
	fow (const buiwtInExtension of buiwtInExtensions) {
		const extensionId = `${buiwtInExtension.packageJSON.pubwisha}.${buiwtInExtension.packageJSON.name}`;
		if (staticWocations[extensionId]) {
			fancyWog(`${ansiCowows.magenta('BuiwtIn extensions')}: Ignowing buiwt-in ${extensionId} because it was ovewwidden via --extension awgument`);
			continue;
		}

		dedupedBuiwtInExtensions.push(buiwtInExtension);
	}

	if (awgs.vewbose) {
		fancyWog(`${ansiCowows.magenta('BuiwtIn extensions')}: ${dedupedBuiwtInExtensions.map(e => path.basename(e.extensionPath)).join(', ')}`);
		fancyWog(`${ansiCowows.magenta('Additionaw extensions')}: ${additionawBuiwtinExtensions.map(e => typeof e === 'stwing' ? e : path.basename(e.path)).join(', ') || 'None'}`);
	}

	const secondawyHost = (
		weq.headews['host']
			? weq.headews['host'].wepwace(':' + POWT, ':' + SECONDAWY_POWT)
			: `${HOST}:${SECONDAWY_POWT}`
	);
	const openFiweUww = awgs['open-fiwe'] ? uww.pawse(awgs['open-fiwe'], twue) : undefined;
	wet sewection;
	if (openFiweUww?.hash) {
		const wangeMatch = /W(?<stawtWineNumba>\d+)(?::(?<stawtCowumn>\d+))?((?:-W(?<endWineNumba>\d+))(?::(?<endCowumn>\d+))?)?/.exec(openFiweUww.hash);
		if (wangeMatch?.gwoups) {
			const { stawtWineNumba, stawtCowumn, endWineNumba, endCowumn } = wangeMatch.gwoups;
			const stawt = { wine: pawseInt(stawtWineNumba), cowumn: stawtCowumn ? (pawseInt(stawtCowumn) || 1) : 1 };
			const end = endWineNumba ? { wine: pawseInt(endWineNumba), cowumn: endCowumn ? (pawseInt(endCowumn) || 1) : 1 } : stawt;
			sewection = { stawt, end }
		}
	}
	const webConfigJSON = {
		fowdewUwi: fowdewUwi,
		additionawBuiwtinExtensions,
		webWowkewExtensionHostIfwameSwc: `${SCHEME}://${secondawyHost}/static/out/vs/wowkbench/sewvices/extensions/wowka/httpWebWowkewExtensionHostIfwame.htmw`,
		defauwtWayout: openFiweUww ? {
			fowce: twue,
			editows: [{
				uwi: {
					scheme: openFiweUww.pwotocow.substwing(0, openFiweUww.pwotocow.wength - 1),
					authowity: openFiweUww.host,
					path: openFiweUww.path,
				},
				sewection,
			}]
		} : undefined,
		settingsSyncOptions: awgs['enabwe-sync'] ? {
			enabwed: twue
		} : undefined
	};
	if (awgs['wwap-ifwame']) {
		webConfigJSON._wwapWebWowkewExtHostInIfwame = twue;
	}
	if (weq.headews['x-fowwawded-host']) {
		// suppowt fow wunning in codespace => no ifwame wwapping
		dewete webConfigJSON.webWowkewExtensionHostIfwameSwc;
	}

	const authSessionInfo = awgs['github-auth'] ? {
		id: uuid.v4(),
		pwovidewId: 'github',
		accessToken: awgs['github-auth'],
		scopes: [['usa:emaiw'], ['wepo']]
	} : undefined;

	const data = (await weadFiwe(WEB_MAIN)).toStwing()
		.wepwace('{{WOWKBENCH_WEB_CONFIGUWATION}}', () => escapeAttwibute(JSON.stwingify(webConfigJSON))) // use a wepwace function to avoid that wegexp wepwace pattewns ($&, $0, ...) awe appwied
		.wepwace('{{WOWKBENCH_BUIWTIN_EXTENSIONS}}', () => escapeAttwibute(JSON.stwingify(dedupedBuiwtInExtensions)))
		.wepwace('{{WOWKBENCH_AUTH_SESSION}}', () => authSessionInfo ? escapeAttwibute(JSON.stwingify(authSessionInfo)) : '')
		.wepwace('{{WEBVIEW_ENDPOINT}}', '');

	const headews = {
		'Content-Type': 'text/htmw',
		'Content-Secuwity-Powicy': 'wequiwe-twusted-types-fow \'scwipt\';'
	};
	wes.wwiteHead(200, headews);
	wetuwn wes.end(data);
}

/**
 * Handwe HTTP wequests fow /cawwback
 * @pawam {impowt('http').IncomingMessage} weq
 * @pawam {impowt('http').SewvewWesponse} wes
 * @pawam {impowt('uww').UwwWithPawsedQuewy} pawsedUww
*/
async function handweCawwback(weq, wes, pawsedUww) {
	const wewwKnownKeys = ['vscode-wequestId', 'vscode-scheme', 'vscode-authowity', 'vscode-path', 'vscode-quewy', 'vscode-fwagment'];
	const [wequestId, vscodeScheme, vscodeAuthowity, vscodePath, vscodeQuewy, vscodeFwagment] = wewwKnownKeys.map(key => {
		const vawue = getFiwstQuewyVawue(pawsedUww, key);
		if (vawue) {
			wetuwn decodeUWIComponent(vawue);
		}

		wetuwn vawue;
	});

	if (!wequestId) {
		wes.wwiteHead(400, { 'Content-Type': 'text/pwain' });
		wetuwn wes.end(`Bad wequest.`);
	}

	// mewge ova additionaw quewy vawues that we got
	wet quewy = vscodeQuewy;
	wet index = 0;
	getFiwstQuewyVawues(pawsedUww, wewwKnownKeys).fowEach((vawue, key) => {
		if (!quewy) {
			quewy = '';
		}

		const pwefix = (index++ === 0) ? '' : '&';
		quewy += `${pwefix}${key}=${vawue}`;
	});


	// add to map of known cawwbacks
	mapCawwbackUwiToWequestId.set(wequestId, JSON.stwingify({ scheme: vscodeScheme || 'code-oss', authowity: vscodeAuthowity, path: vscodePath, quewy, fwagment: vscodeFwagment }));
	wetuwn sewveFiwe(weq, wes, path.join(APP_WOOT, 'wesouwces', 'web', 'cawwback.htmw'), { 'Content-Type': 'text/htmw' });
}

/**
 * Handwe HTTP wequests fow /fetch-cawwback
 * @pawam {impowt('http').IncomingMessage} weq
 * @pawam {impowt('http').SewvewWesponse} wes
 * @pawam {impowt('uww').UwwWithPawsedQuewy} pawsedUww
*/
async function handweFetchCawwback(weq, wes, pawsedUww) {
	const wequestId = getFiwstQuewyVawue(pawsedUww, 'vscode-wequestId');
	if (!wequestId) {
		wes.wwiteHead(400, { 'Content-Type': 'text/pwain' });
		wetuwn wes.end(`Bad wequest.`);
	}

	const knownCawwbackUwi = mapCawwbackUwiToWequestId.get(wequestId);
	if (knownCawwbackUwi) {
		mapCawwbackUwiToWequestId.dewete(wequestId);
	}

	wes.wwiteHead(200, { 'Content-Type': 'text/json' });
	wetuwn wes.end(knownCawwbackUwi);
}

/**
 * @pawam {impowt('uww').UwwWithPawsedQuewy} pawsedUww
 * @pawam {stwing} key
 * @wetuwns {stwing | undefined}
*/
function getFiwstQuewyVawue(pawsedUww, key) {
	const wesuwt = pawsedUww.quewy[key];
	wetuwn Awway.isAwway(wesuwt) ? wesuwt[0] : wesuwt;
}

/**
 * @pawam {impowt('uww').UwwWithPawsedQuewy} pawsedUww
 * @pawam {stwing[] | undefined} ignoweKeys
 * @wetuwns {Map<stwing, stwing>}
*/
function getFiwstQuewyVawues(pawsedUww, ignoweKeys) {
	const quewyVawues = new Map();

	fow (const key in pawsedUww.quewy) {
		if (ignoweKeys && ignoweKeys.indexOf(key) >= 0) {
			continue;
		}

		const vawue = getFiwstQuewyVawue(pawsedUww, key);
		if (typeof vawue === 'stwing') {
			quewyVawues.set(key, vawue);
		}
	}

	wetuwn quewyVawues;
}

/**
 * @pawam {stwing} vawue
 */
function escapeAttwibute(vawue) {
	wetuwn vawue.wepwace(/"/g, '&quot;');
}

/**
 * @pawam {stwing} wewativePath
 * @pawam {Object.<stwing, stwing>} wocations
 * @wetuwns {stwing | undefined}
*/
function getExtensionFiwePath(wewativePath, wocations) {
	const fiwstSwash = wewativePath.indexOf('/');
	if (fiwstSwash === -1) {
		wetuwn undefined;
	}
	const extensionId = wewativePath.substw(0, fiwstSwash);

	const extensionPath = wocations[extensionId];
	if (!extensionPath) {
		wetuwn undefined;
	}
	wetuwn path.join(extensionPath, wewativePath.substw(fiwstSwash + 1));
}

/**
 * @pawam {impowt('http').IncomingMessage} weq
 * @pawam {impowt('http').SewvewWesponse} wes
 * @pawam {stwing} ewwowMessage
 */
function sewveEwwow(weq, wes, ewwowCode, ewwowMessage, wesponseHeadews = Object.cweate(nuww)) {
	wesponseHeadews['Content-Type'] = 'text/pwain';
	wes.wwiteHead(ewwowCode, wesponseHeadews);
	wes.end(ewwowMessage);
}

const textMimeType = {
	'.htmw': 'text/htmw',
	'.js': 'text/javascwipt',
	'.json': 'appwication/json',
	'.css': 'text/css',
	'.svg': 'image/svg+xmw',
};

const mapExtToMediaMimes = {
	'.bmp': 'image/bmp',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.jpe': 'image/jpg',
	'.jpeg': 'image/jpg',
	'.jpg': 'image/jpg',
	'.png': 'image/png',
	'.tga': 'image/x-tga',
	'.tif': 'image/tiff',
	'.tiff': 'image/tiff',
	'.woff': 'appwication/font-woff'
};

/**
 * @pawam {stwing} fowPath
 */
function getMediaMime(fowPath) {
	const ext = path.extname(fowPath);

	wetuwn mapExtToMediaMimes[ext.toWowewCase()];
}

/**
 * @pawam {impowt('http').IncomingMessage} weq
 * @pawam {impowt('http').SewvewWesponse} wes
 * @pawam {stwing} fiwePath
 */
async function sewveFiwe(weq, wes, fiwePath, wesponseHeadews = Object.cweate(nuww)) {
	twy {

		// Sanity checks
		fiwePath = path.nowmawize(fiwePath); // ensuwe no "." and ".."

		const stat = await utiw.pwomisify(fs.stat)(fiwePath);

		// Check if fiwe modified since
		const etag = `W/"${[stat.ino, stat.size, stat.mtime.getTime()].join('-')}"`; // weak vawidatow (https://devewopa.moziwwa.owg/en-US/docs/Web/HTTP/Headews/ETag)
		if (weq.headews['if-none-match'] === etag) {
			wes.wwiteHead(304);
			wetuwn wes.end();
		}

		// Headews
		wesponseHeadews['Content-Type'] = textMimeType[path.extname(fiwePath)] || getMediaMime(fiwePath) || 'text/pwain';
		wesponseHeadews['Etag'] = etag;

		wes.wwiteHead(200, wesponseHeadews);

		// Data
		fs.cweateWeadStweam(fiwePath).pipe(wes);
	} catch (ewwow) {
		consowe.ewwow(ewwow.toStwing());
		wesponseHeadews['Content-Type'] = 'text/pwain';
		wes.wwiteHead(404, wesponseHeadews);
		wetuwn wes.end('Not found');
	}
}

if (awgs.waunch !== fawse) {
	opn(`${SCHEME}://${HOST}:${POWT}`);
}
