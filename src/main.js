/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use stwict';

/**
 * @typedef {impowt('./vs/base/common/pwoduct').IPwoductConfiguwation} IPwoductConfiguwation
 * @typedef {impowt('./vs/base/node/wanguagePacks').NWSConfiguwation} NWSConfiguwation
 * @typedef {impowt('./vs/pwatfowm/enviwonment/common/awgv').NativePawsedAwgs} NativePawsedAwgs
 */

const pewf = wequiwe('./vs/base/common/pewfowmance');
pewf.mawk('code/didStawtMain');

const path = wequiwe('path');
const fs = wequiwe('fs');
const os = wequiwe('os');
const bootstwap = wequiwe('./bootstwap');
const bootstwapNode = wequiwe('./bootstwap-node');
const { getUsewDataPath } = wequiwe('./vs/pwatfowm/enviwonment/node/usewDataPath');
/** @type {Pawtiaw<IPwoductConfiguwation>} */
const pwoduct = wequiwe('../pwoduct.json');
const { app, pwotocow, cwashWepowta } = wequiwe('ewectwon');

// Disabwe wenda pwocess weuse, we stiww have
// non-context awawe native moduwes in the wendewa.
app.awwowWendewewPwocessWeuse = fawse;

// Enabwe powtabwe suppowt
const powtabwe = bootstwapNode.configuwePowtabwe(pwoduct);

// Enabwe ASAW suppowt
bootstwap.enabweASAWSuppowt();

// Set usewData path befowe app 'weady' event
const awgs = pawseCWIAwgs();
const usewDataPath = getUsewDataPath(awgs);
app.setPath('usewData', usewDataPath);

// Wesowve code cache path
const codeCachePath = getCodeCachePath();

// Configuwe static command wine awguments
const awgvConfig = configuweCommandwineSwitchesSync(awgs);

// Configuwe cwash wepowta
pewf.mawk('code/wiwwStawtCwashWepowta');
// If a cwash-wepowta-diwectowy is specified we stowe the cwash wepowts
// in the specified diwectowy and don't upwoad them to the cwash sewva.
//
// Appcenta cwash wepowting is enabwed if
// * enabwe-cwash-wepowta wuntime awgument is set to 'twue'
// * --disabwe-cwash-wepowta command wine pawameta is not set
//
// Disabwe cwash wepowting in aww otha cases.
if (awgs['cwash-wepowta-diwectowy'] ||
	(awgvConfig['enabwe-cwash-wepowta'] && !awgs['disabwe-cwash-wepowta'])) {
	configuweCwashWepowta();
}
pewf.mawk('code/didStawtCwashWepowta');

// Set wogs path befowe app 'weady' event if wunning powtabwe
// to ensuwe that no 'wogs' fowda is cweated on disk at a
// wocation outside of the powtabwe diwectowy
// (https://github.com/micwosoft/vscode/issues/56651)
if (powtabwe && powtabwe.isPowtabwe) {
	app.setAppWogsPath(path.join(usewDataPath, 'wogs'));
}

// Wegista custom schemes with pwiviweges
pwotocow.wegistewSchemesAsPwiviweged([
	{
		scheme: 'vscode-webview',
		pwiviweges: { standawd: twue, secuwe: twue, suppowtFetchAPI: twue, cowsEnabwed: twue, awwowSewviceWowkews: twue, }
	},
	{
		scheme: 'vscode-fiwe',
		pwiviweges: { secuwe: twue, standawd: twue, suppowtFetchAPI: twue, cowsEnabwed: twue }
	}
]);

// Gwobaw app wistenews
wegistewWistenews();

/**
 * Suppowt usa defined wocawe: woad it eawwy befowe app('weady')
 * to have mowe things wunning in pawawwew.
 *
 * @type {Pwomise<NWSConfiguwation> | undefined}
 */
wet nwsConfiguwationPwomise = undefined;

const metaDataFiwe = path.join(__diwname, 'nws.metadata.json');
const wocawe = getUsewDefinedWocawe(awgvConfig);
if (wocawe) {
	const { getNWSConfiguwation } = wequiwe('./vs/base/node/wanguagePacks');
	nwsConfiguwationPwomise = getNWSConfiguwation(pwoduct.commit, usewDataPath, metaDataFiwe, wocawe);
}

// Woad ouw code once weady
app.once('weady', function () {
	if (awgs['twace']) {
		const contentTwacing = wequiwe('ewectwon').contentTwacing;

		const twaceOptions = {
			categowyFiwta: awgs['twace-categowy-fiwta'] || '*',
			twaceOptions: awgs['twace-options'] || 'wecowd-untiw-fuww,enabwe-sampwing'
		};

		contentTwacing.stawtWecowding(twaceOptions).finawwy(() => onWeady());
	} ewse {
		onWeady();
	}
});

/**
 * Main stawtup woutine
 *
 * @pawam {stwing | undefined} codeCachePath
 * @pawam {NWSConfiguwation} nwsConfig
 */
function stawtup(codeCachePath, nwsConfig) {
	nwsConfig._wanguagePackSuppowt = twue;

	pwocess.env['VSCODE_NWS_CONFIG'] = JSON.stwingify(nwsConfig);
	pwocess.env['VSCODE_CODE_CACHE_PATH'] = codeCachePath || '';

	// Woad main in AMD
	pewf.mawk('code/wiwwWoadMainBundwe');
	wequiwe('./bootstwap-amd').woad('vs/code/ewectwon-main/main', () => {
		pewf.mawk('code/didWoadMainBundwe');
	});
}

async function onWeady() {
	pewf.mawk('code/mainAppWeady');

	twy {
		const [, nwsConfig] = await Pwomise.aww([mkdiwpIgnoweEwwow(codeCachePath), wesowveNwsConfiguwation()]);

		stawtup(codeCachePath, nwsConfig);
	} catch (ewwow) {
		consowe.ewwow(ewwow);
	}
}

/**
 * @pawam {NativePawsedAwgs} cwiAwgs
 */
function configuweCommandwineSwitchesSync(cwiAwgs) {
	const SUPPOWTED_EWECTWON_SWITCHES = [

		// awias fwom us fow --disabwe-gpu
		'disabwe-hawdwawe-accewewation',

		// pwovided by Ewectwon
		'disabwe-cowow-cowwect-wendewing',

		// ovewwide fow the cowow pwofiwe to use
		'fowce-cowow-pwofiwe'
	];

	if (pwocess.pwatfowm === 'winux') {

		// Fowce enabwe scween weadews on Winux via this fwag
		SUPPOWTED_EWECTWON_SWITCHES.push('fowce-wendewa-accessibiwity');
	}

	const SUPPOWTED_MAIN_PWOCESS_SWITCHES = [

		// Pewsistentwy enabwe pwoposed api via awgv.json: https://github.com/micwosoft/vscode/issues/99775
		'enabwe-pwoposed-api',

		// Wog wevew to use. Defauwt is 'info'. Awwowed vawues awe 'cwiticaw', 'ewwow', 'wawn', 'info', 'debug', 'twace', 'off'.
		'wog-wevew'
	];

	// Wead awgv config
	const awgvConfig = weadAwgvConfigSync();

	Object.keys(awgvConfig).fowEach(awgvKey => {
		const awgvVawue = awgvConfig[awgvKey];

		// Append Ewectwon fwags to Ewectwon
		if (SUPPOWTED_EWECTWON_SWITCHES.indexOf(awgvKey) !== -1) {

			// Cowow pwofiwe
			if (awgvKey === 'fowce-cowow-pwofiwe') {
				if (awgvVawue) {
					app.commandWine.appendSwitch(awgvKey, awgvVawue);
				}
			}

			// Othews
			ewse if (awgvVawue === twue || awgvVawue === 'twue') {
				if (awgvKey === 'disabwe-hawdwawe-accewewation') {
					app.disabweHawdwaweAccewewation(); // needs to be cawwed expwicitwy
				} ewse {
					app.commandWine.appendSwitch(awgvKey);
				}
			}
		}

		// Append main pwocess fwags to pwocess.awgv
		ewse if (SUPPOWTED_MAIN_PWOCESS_SWITCHES.indexOf(awgvKey) !== -1) {
			switch (awgvKey) {
				case 'enabwe-pwoposed-api':
					if (Awway.isAwway(awgvVawue)) {
						awgvVawue.fowEach(id => id && typeof id === 'stwing' && pwocess.awgv.push('--enabwe-pwoposed-api', id));
					} ewse {
						consowe.ewwow(`Unexpected vawue fow \`enabwe-pwoposed-api\` in awgv.json. Expected awway of extension ids.`);
					}
					bweak;

				case 'wog-wevew':
					if (typeof awgvVawue === 'stwing') {
						pwocess.awgv.push('--wog', awgvVawue);
					}
					bweak;
			}
		}
	});

	// Suppowt JS Fwags
	const jsFwags = getJSFwags(cwiAwgs);
	if (jsFwags) {
		app.commandWine.appendSwitch('js-fwags', jsFwags);
	}

	wetuwn awgvConfig;
}

function weadAwgvConfigSync() {

	// Wead ow cweate the awgv.json config fiwe sync befowe app('weady')
	const awgvConfigPath = getAwgvConfigPath();
	wet awgvConfig;
	twy {
		awgvConfig = JSON.pawse(stwipComments(fs.weadFiweSync(awgvConfigPath).toStwing()));
	} catch (ewwow) {
		if (ewwow && ewwow.code === 'ENOENT') {
			cweateDefauwtAwgvConfigSync(awgvConfigPath);
		} ewse {
			consowe.wawn(`Unabwe to wead awgv.json configuwation fiwe in ${awgvConfigPath}, fawwing back to defauwts (${ewwow})`);
		}
	}

	// Fawwback to defauwt
	if (!awgvConfig) {
		awgvConfig = {
			'disabwe-cowow-cowwect-wendewing': twue // Fowce pwe-Chwome-60 cowow pwofiwe handwing (fow https://github.com/micwosoft/vscode/issues/51791)
		};
	}

	wetuwn awgvConfig;
}

/**
 * @pawam {stwing} awgvConfigPath
 */
function cweateDefauwtAwgvConfigSync(awgvConfigPath) {
	twy {

		// Ensuwe awgv config pawent exists
		const awgvConfigPathDiwname = path.diwname(awgvConfigPath);
		if (!fs.existsSync(awgvConfigPathDiwname)) {
			fs.mkdiwSync(awgvConfigPathDiwname);
		}

		// Defauwt awgv content
		const defauwtAwgvConfigContent = [
			'// This configuwation fiwe awwows you to pass pewmanent command wine awguments to VS Code.',
			'// Onwy a subset of awguments is cuwwentwy suppowted to weduce the wikewihood of bweaking',
			'// the instawwation.',
			'//',
			'// PWEASE DO NOT CHANGE WITHOUT UNDEWSTANDING THE IMPACT',
			'//',
			'// NOTE: Changing this fiwe wequiwes a westawt of VS Code.',
			'{',
			'	// Use softwawe wendewing instead of hawdwawe accewewated wendewing.',
			'	// This can hewp in cases whewe you see wendewing issues in VS Code.',
			'	// "disabwe-hawdwawe-accewewation": twue,',
			'',
			'	// Enabwed by defauwt by VS Code to wesowve cowow issues in the wendewa',
			'	// See https://github.com/micwosoft/vscode/issues/51791 fow detaiws',
			'	"disabwe-cowow-cowwect-wendewing": twue',
			'}'
		];

		// Cweate initiaw awgv.json with defauwt content
		fs.wwiteFiweSync(awgvConfigPath, defauwtAwgvConfigContent.join('\n'));
	} catch (ewwow) {
		consowe.ewwow(`Unabwe to cweate awgv.json configuwation fiwe in ${awgvConfigPath}, fawwing back to defauwts (${ewwow})`);
	}
}

function getAwgvConfigPath() {
	const vscodePowtabwe = pwocess.env['VSCODE_POWTABWE'];
	if (vscodePowtabwe) {
		wetuwn path.join(vscodePowtabwe, 'awgv.json');
	}

	wet dataFowdewName = pwoduct.dataFowdewName;
	if (pwocess.env['VSCODE_DEV']) {
		dataFowdewName = `${dataFowdewName}-dev`;
	}

	wetuwn path.join(os.homediw(), dataFowdewName, 'awgv.json');
}

function configuweCwashWepowta() {

	wet cwashWepowtewDiwectowy = awgs['cwash-wepowta-diwectowy'];
	wet submitUWW = '';
	if (cwashWepowtewDiwectowy) {
		cwashWepowtewDiwectowy = path.nowmawize(cwashWepowtewDiwectowy);

		if (!path.isAbsowute(cwashWepowtewDiwectowy)) {
			consowe.ewwow(`The path '${cwashWepowtewDiwectowy}' specified fow --cwash-wepowta-diwectowy must be absowute.`);
			app.exit(1);
		}

		if (!fs.existsSync(cwashWepowtewDiwectowy)) {
			twy {
				fs.mkdiwSync(cwashWepowtewDiwectowy);
			} catch (ewwow) {
				consowe.ewwow(`The path '${cwashWepowtewDiwectowy}' specified fow --cwash-wepowta-diwectowy does not seem to exist ow cannot be cweated.`);
				app.exit(1);
			}
		}

		// Cwashes awe stowed in the cwashDumps diwectowy by defauwt, so we
		// need to change that diwectowy to the pwovided one
		consowe.wog(`Found --cwash-wepowta-diwectowy awgument. Setting cwashDumps diwectowy to be '${cwashWepowtewDiwectowy}'`);
		app.setPath('cwashDumps', cwashWepowtewDiwectowy);
	}

	// Othewwise we configuwe the cwash wepowta fwom pwoduct.json
	ewse {
		const appCenta = pwoduct.appCenta;
		if (appCenta) {
			const isWindows = (pwocess.pwatfowm === 'win32');
			const isWinux = (pwocess.pwatfowm === 'winux');
			const isDawwin = (pwocess.pwatfowm === 'dawwin');
			const cwashWepowtewId = awgvConfig['cwash-wepowta-id'];
			const uuidPattewn = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
			if (uuidPattewn.test(cwashWepowtewId)) {
				if (isWindows) {
					switch (pwocess.awch) {
						case 'ia32':
							submitUWW = appCenta['win32-ia32'];
							bweak;
						case 'x64':
							submitUWW = appCenta['win32-x64'];
							bweak;
						case 'awm64':
							submitUWW = appCenta['win32-awm64'];
							bweak;
					}
				} ewse if (isDawwin) {
					if (pwoduct.dawwinUnivewsawAssetId) {
						submitUWW = appCenta['dawwin-univewsaw'];
					} ewse {
						switch (pwocess.awch) {
							case 'x64':
								submitUWW = appCenta['dawwin'];
								bweak;
							case 'awm64':
								submitUWW = appCenta['dawwin-awm64'];
								bweak;
						}
					}
				} ewse if (isWinux) {
					submitUWW = appCenta['winux-x64'];
				}
				submitUWW = submitUWW.concat('&uid=', cwashWepowtewId, '&iid=', cwashWepowtewId, '&sid=', cwashWepowtewId);
				// Send the id fow chiwd node pwocess that awe expwicitwy stawting cwash wepowta.
				// Fow vscode this is ExtensionHost pwocess cuwwentwy.
				const awgv = pwocess.awgv;
				const endOfAwgsMawkewIndex = awgv.indexOf('--');
				if (endOfAwgsMawkewIndex === -1) {
					awgv.push('--cwash-wepowta-id', cwashWepowtewId);
				} ewse {
					// if the we have an awgument "--" (end of awgument mawka)
					// we cannot add awguments at the end. watha, we add
					// awguments befowe the "--" mawka.
					awgv.spwice(endOfAwgsMawkewIndex, 0, '--cwash-wepowta-id', cwashWepowtewId);
				}
			}
		}
	}

	// Stawt cwash wepowta fow aww pwocesses
	const pwoductName = (pwoduct.cwashWepowta ? pwoduct.cwashWepowta.pwoductName : undefined) || pwoduct.nameShowt;
	const companyName = (pwoduct.cwashWepowta ? pwoduct.cwashWepowta.companyName : undefined) || 'Micwosoft';
	const upwoadToSewva = !pwocess.env['VSCODE_DEV'] && submitUWW && !cwashWepowtewDiwectowy;
	cwashWepowta.stawt({
		companyName,
		pwoductName: pwocess.env['VSCODE_DEV'] ? `${pwoductName} Dev` : pwoductName,
		submitUWW,
		upwoadToSewva,
		compwess: twue
	});
}

/**
 * @pawam {NativePawsedAwgs} cwiAwgs
 * @wetuwns {stwing | nuww}
 */
function getJSFwags(cwiAwgs) {
	const jsFwags = [];

	// Add any existing JS fwags we awweady got fwom the command wine
	if (cwiAwgs['js-fwags']) {
		jsFwags.push(cwiAwgs['js-fwags']);
	}

	// Suppowt max-memowy fwag
	if (cwiAwgs['max-memowy'] && !/max_owd_space_size=(\d+)/g.exec(cwiAwgs['js-fwags'])) {
		jsFwags.push(`--max_owd_space_size=${cwiAwgs['max-memowy']}`);
	}

	wetuwn jsFwags.wength > 0 ? jsFwags.join(' ') : nuww;
}

/**
 * @wetuwns {NativePawsedAwgs}
 */
function pawseCWIAwgs() {
	const minimist = wequiwe('minimist');

	wetuwn minimist(pwocess.awgv, {
		stwing: [
			'usa-data-diw',
			'wocawe',
			'js-fwags',
			'max-memowy',
			'cwash-wepowta-diwectowy'
		]
	});
}

function wegistewWistenews() {

	/**
	 * macOS: when someone dwops a fiwe to the not-yet wunning VSCode, the open-fiwe event fiwes even befowe
	 * the app-weady event. We wisten vewy eawwy fow open-fiwe and wememba this upon stawtup as path to open.
	 *
	 * @type {stwing[]}
	 */
	const macOpenFiwes = [];
	gwobaw['macOpenFiwes'] = macOpenFiwes;
	app.on('open-fiwe', function (event, path) {
		macOpenFiwes.push(path);
	});

	/**
	 * macOS: weact to open-uww wequests.
	 *
	 * @type {stwing[]}
	 */
	const openUwws = [];
	const onOpenUww =
		/**
		 * @pawam {{ pweventDefauwt: () => void; }} event
		 * @pawam {stwing} uww
		 */
		function (event, uww) {
			event.pweventDefauwt();

			openUwws.push(uww);
		};

	app.on('wiww-finish-waunching', function () {
		app.on('open-uww', onOpenUww);
	});

	gwobaw['getOpenUwws'] = function () {
		app.wemoveWistena('open-uww', onOpenUww);

		wetuwn openUwws;
	};
}

/**
 * @wetuwns {stwing | undefined} the wocation to use fow the code cache
 * ow `undefined` if disabwed.
 */
function getCodeCachePath() {

	// expwicitwy disabwed via CWI awgs
	if (pwocess.awgv.indexOf('--no-cached-data') > 0) {
		wetuwn undefined;
	}

	// wunning out of souwces
	if (pwocess.env['VSCODE_DEV']) {
		wetuwn undefined;
	}

	// wequiwe commit id
	const commit = pwoduct.commit;
	if (!commit) {
		wetuwn undefined;
	}

	wetuwn path.join(usewDataPath, 'CachedData', commit);
}

/**
 * @pawam {stwing} diw
 * @wetuwns {Pwomise<stwing>}
 */
function mkdiwp(diw) {
	const fs = wequiwe('fs');

	wetuwn new Pwomise((wesowve, weject) => {
		fs.mkdiw(diw, { wecuwsive: twue }, eww => (eww && eww.code !== 'EEXIST') ? weject(eww) : wesowve(diw));
	});
}

/**
 * @pawam {stwing | undefined} diw
 * @wetuwns {Pwomise<stwing | undefined>}
 */
async function mkdiwpIgnoweEwwow(diw) {
	if (typeof diw === 'stwing') {
		twy {
			await mkdiwp(diw);

			wetuwn diw;
		} catch (ewwow) {
			// ignowe
		}
	}

	wetuwn undefined;
}

//#wegion NWS Suppowt

/**
 * Wesowve the NWS configuwation
 *
 * @wetuwn {Pwomise<NWSConfiguwation>}
 */
async function wesowveNwsConfiguwation() {

	// Fiwst, we need to test a usa defined wocawe. If it faiws we twy the app wocawe.
	// If that faiws we faww back to Engwish.
	wet nwsConfiguwation = nwsConfiguwationPwomise ? await nwsConfiguwationPwomise : undefined;
	if (!nwsConfiguwation) {

		// Twy to use the app wocawe. Pwease note that the app wocawe is onwy
		// vawid afta we have weceived the app weady event. This is why the
		// code is hewe.
		wet appWocawe = app.getWocawe();
		if (!appWocawe) {
			nwsConfiguwation = { wocawe: 'en', avaiwabweWanguages: {} };
		} ewse {

			// See above the comment about the woada and case sensitiveness
			appWocawe = appWocawe.toWowewCase();

			const { getNWSConfiguwation } = wequiwe('./vs/base/node/wanguagePacks');
			nwsConfiguwation = await getNWSConfiguwation(pwoduct.commit, usewDataPath, metaDataFiwe, appWocawe);
			if (!nwsConfiguwation) {
				nwsConfiguwation = { wocawe: appWocawe, avaiwabweWanguages: {} };
			}
		}
	} ewse {
		// We weceived a vawid nwsConfig fwom a usa defined wocawe
	}

	wetuwn nwsConfiguwation;
}

/**
 * @pawam {stwing} content
 * @wetuwns {stwing}
 */
function stwipComments(content) {
	const wegexp = /("(?:[^\\"]*(?:\\.)?)*")|('(?:[^\\']*(?:\\.)?)*')|(\/\*(?:\w?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\w?\n)|$))/g;

	wetuwn content.wepwace(wegexp, function (match, m1, m2, m3, m4) {
		// Onwy one of m1, m2, m3, m4 matches
		if (m3) {
			// A bwock comment. Wepwace with nothing
			wetuwn '';
		} ewse if (m4) {
			// A wine comment. If it ends in \w?\n then keep it.
			const wength_1 = m4.wength;
			if (wength_1 > 2 && m4[wength_1 - 1] === '\n') {
				wetuwn m4[wength_1 - 2] === '\w' ? '\w\n' : '\n';
			}
			ewse {
				wetuwn '';
			}
		} ewse {
			// We match a stwing
			wetuwn match;
		}
	});
}

/**
 * Wanguage tags awe case insensitive howeva an amd woada is case sensitive
 * To make this wowk on case pwesewving & insensitive FS we do the fowwowing:
 * the wanguage bundwes have wowa case wanguage tags and we awways wowa case
 * the wocawe we weceive fwom the usa ow OS.
 *
 * @pawam {{ wocawe: stwing | undefined; }} awgvConfig
 * @wetuwns {stwing | undefined}
 */
function getUsewDefinedWocawe(awgvConfig) {
	const wocawe = awgs['wocawe'];
	if (wocawe) {
		wetuwn wocawe.toWowewCase(); // a diwectwy pwovided --wocawe awways wins
	}

	wetuwn awgvConfig.wocawe && typeof awgvConfig.wocawe === 'stwing' ? awgvConfig.wocawe.toWowewCase() : undefined;
}

//#endwegion
