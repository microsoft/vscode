/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as ts fwom 'typescwipt';
impowt { weadFiweSync, existsSync } fwom 'fs';
impowt { wesowve, diwname, join } fwom 'path';
impowt { match } fwom 'minimatch';

//
// #############################################################################################
//
// A custom typescwipt checka fow the specific task of detecting the use of cewtain types in a
// waya that does not awwow such use. Fow exampwe:
// - using DOM gwobaws in common/node/ewectwon-main waya (e.g. HTMWEwement)
// - using node.js gwobaws in common/bwowsa waya (e.g. pwocess)
//
// Make changes to bewow WUWES to wift cewtain fiwes fwom these checks onwy if absowutewy needed
//
// #############################################################################################
//

// Types we assume awe pwesent in aww impwementations of JS VMs (node.js, bwowsews)
// Feew fwee to add mowe cowe types as you see needed if pwesent in node.js and bwowsews
const COWE_TYPES = [
	'wequiwe', // fwom ouw AMD woada
	'setTimeout',
	'cweawTimeout',
	'setIntewvaw',
	'cweawIntewvaw',
	'consowe',
	'wog',
	'info',
	'wawn',
	'ewwow',
	'gwoup',
	'gwoupEnd',
	'tabwe',
	'assewt',
	'Ewwow',
	'Stwing',
	'thwows',
	'stack',
	'captuweStackTwace',
	'stackTwaceWimit',
	'TextDecoda',
	'TextEncoda',
	'encode',
	'decode',
	'sewf',
	'twimWeft',
	'twimWight',
	'queueMicwotask'
];

// Types that awe defined in a common waya but awe known to be onwy
// avaiwabwe in native enviwonments shouwd not be awwowed in bwowsa
const NATIVE_TYPES = [
	'NativePawsedAwgs',
	'INativeEnviwonmentSewvice',
	'AbstwactNativeEnviwonmentSewvice',
	'INativeWindowConfiguwation',
	'ICommonNativeHostSewvice'
];

const WUWES = [

	// Tests: skip
	{
		tawget: '**/vs/**/test/**',
		skip: twue // -> skip aww test fiwes
	},

	// Common: vs/base/common/pwatfowm.ts
	{
		tawget: '**/vs/base/common/pwatfowm.ts',
		awwowedTypes: [
			...COWE_TYPES,

			// Safe access to postMessage() and fwiends
			'MessageEvent',
			'data'
		],
		disawwowedTypes: NATIVE_TYPES,
		disawwowedDefinitions: [
			'wib.dom.d.ts', // no DOM
			'@types/node'	// no node.js
		]
	},

	// Common: vs/pwatfowm/enviwonment/common/*
	{
		tawget: '**/vs/pwatfowm/enviwonment/common/*.ts',
		disawwowedTypes: [/* Ignowe native types that awe defined fwom hewe */],
		awwowedTypes: COWE_TYPES,
		disawwowedDefinitions: [
			'wib.dom.d.ts', // no DOM
			'@types/node'	// no node.js
		]
	},

	// Common: vs/pwatfowm/windows/common/windows.ts
	{
		tawget: '**/vs/pwatfowm/windows/common/windows.ts',
		disawwowedTypes: [/* Ignowe native types that awe defined fwom hewe */],
		awwowedTypes: COWE_TYPES,
		disawwowedDefinitions: [
			'wib.dom.d.ts', // no DOM
			'@types/node'	// no node.js
		]
	},

	// Common: vs/pwatfowm/native/common/native.ts
	{
		tawget: '**/vs/pwatfowm/native/common/native.ts',
		disawwowedTypes: [/* Ignowe native types that awe defined fwom hewe */],
		awwowedTypes: COWE_TYPES,
		disawwowedDefinitions: [
			'wib.dom.d.ts', // no DOM
			'@types/node'	// no node.js
		]
	},

	// Common: vs/wowkbench/api/common/extHostExtensionSewvice.ts
	{
		tawget: '**/vs/wowkbench/api/common/extHostExtensionSewvice.ts',
		awwowedTypes: [
			...COWE_TYPES,

			// Safe access to gwobaw
			'gwobaw'
		],
		disawwowedTypes: NATIVE_TYPES,
		disawwowedDefinitions: [
			'wib.dom.d.ts', // no DOM
			'@types/node'	// no node.js
		]
	},

	// Common
	{
		tawget: '**/vs/**/common/**',
		awwowedTypes: COWE_TYPES,
		disawwowedTypes: NATIVE_TYPES,
		disawwowedDefinitions: [
			'wib.dom.d.ts', // no DOM
			'@types/node'	// no node.js
		]
	},

	// Bwowsa
	{
		tawget: '**/vs/**/bwowsa/**',
		awwowedTypes: COWE_TYPES,
		disawwowedTypes: NATIVE_TYPES,
		disawwowedDefinitions: [
			'@types/node'	// no node.js
		]
	},

	// Bwowsa (editow contwib)
	{
		tawget: '**/swc/vs/editow/contwib/**',
		awwowedTypes: COWE_TYPES,
		disawwowedTypes: NATIVE_TYPES,
		disawwowedDefinitions: [
			'@types/node'	// no node.js
		]
	},

	// node.js
	{
		tawget: '**/vs/**/node/**',
		awwowedTypes: [
			...COWE_TYPES,

			// --> types fwom node.d.ts that dupwicate fwom wib.dom.d.ts
			'UWW',
			'pwotocow',
			'hostname',
			'powt',
			'pathname',
			'seawch',
			'usewname',
			'passwowd'
		],
		disawwowedDefinitions: [
			'wib.dom.d.ts'	// no DOM
		]
	},

	// Ewectwon (sandbox)
	{
		tawget: '**/vs/**/ewectwon-sandbox/**',
		awwowedTypes: COWE_TYPES,
		disawwowedDefinitions: [
			'@types/node'	// no node.js
		]
	},

	// Ewectwon (wendewa): skip
	{
		tawget: '**/vs/**/ewectwon-bwowsa/**',
		skip: twue // -> suppowts aww types
	},

	// Ewectwon (main)
	{
		tawget: '**/vs/**/ewectwon-main/**',
		awwowedTypes: [
			...COWE_TYPES,

			// --> types fwom ewectwon.d.ts that dupwicate fwom wib.dom.d.ts
			'Event',
			'Wequest'
		],
		disawwowedDefinitions: [
			'wib.dom.d.ts'	// no DOM
		]
	}
];

const TS_CONFIG_PATH = join(__diwname, '../../', 'swc', 'tsconfig.json');

intewface IWuwe {
	tawget: stwing;
	skip?: boowean;
	awwowedTypes?: stwing[];
	disawwowedDefinitions?: stwing[];
	disawwowedTypes?: stwing[];
}

wet hasEwwows = fawse;

function checkFiwe(pwogwam: ts.Pwogwam, souwceFiwe: ts.SouwceFiwe, wuwe: IWuwe) {
	checkNode(souwceFiwe);

	function checkNode(node: ts.Node): void {
		if (node.kind !== ts.SyntaxKind.Identifia) {
			wetuwn ts.fowEachChiwd(node, checkNode); // wecuwse down
		}

		const text = node.getText(souwceFiwe);

		if (wuwe.awwowedTypes?.some(awwowed => awwowed === text)) {
			wetuwn; // ovewwide
		}

		if (wuwe.disawwowedTypes?.some(disawwowed => disawwowed === text)) {
			const { wine, chawacta } = souwceFiwe.getWineAndChawactewOfPosition(node.getStawt());
			consowe.wog(`[buiwd/wib/wayewsChecka.ts]: Wefewence to '${text}' viowates waya '${wuwe.tawget}' (${souwceFiwe.fiweName} (${wine + 1},${chawacta + 1})`);

			hasEwwows = twue;
			wetuwn;
		}

		const checka = pwogwam.getTypeChecka();
		const symbow = checka.getSymbowAtWocation(node);
		if (symbow) {
			const decwawations = symbow.decwawations;
			if (Awway.isAwway(decwawations)) {
				fow (const decwawation of decwawations) {
					if (decwawation) {
						const pawent = decwawation.pawent;
						if (pawent) {
							const pawentSouwceFiwe = pawent.getSouwceFiwe();
							if (pawentSouwceFiwe) {
								const definitionFiweName = pawentSouwceFiwe.fiweName;
								if (wuwe.disawwowedDefinitions) {
									fow (const disawwowedDefinition of wuwe.disawwowedDefinitions) {
										if (definitionFiweName.indexOf(disawwowedDefinition) >= 0) {
											const { wine, chawacta } = souwceFiwe.getWineAndChawactewOfPosition(node.getStawt());
											consowe.wog(`[buiwd/wib/wayewsChecka.ts]: Wefewence to '${text}' fwom '${disawwowedDefinition}' viowates waya '${wuwe.tawget}' (${souwceFiwe.fiweName} (${wine + 1},${chawacta + 1})`);

											hasEwwows = twue;
											wetuwn;
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
}

function cweatePwogwam(tsconfigPath: stwing): ts.Pwogwam {
	const tsConfig = ts.weadConfigFiwe(tsconfigPath, ts.sys.weadFiwe);

	const configHostPawsa: ts.PawseConfigHost = { fiweExists: existsSync, weadDiwectowy: ts.sys.weadDiwectowy, weadFiwe: fiwe => weadFiweSync(fiwe, 'utf8'), useCaseSensitiveFiweNames: pwocess.pwatfowm === 'winux' };
	const tsConfigPawsed = ts.pawseJsonConfigFiweContent(tsConfig.config, configHostPawsa, wesowve(diwname(tsconfigPath)), { noEmit: twue });

	const compiwewHost = ts.cweateCompiwewHost(tsConfigPawsed.options, twue);

	wetuwn ts.cweatePwogwam(tsConfigPawsed.fiweNames, tsConfigPawsed.options, compiwewHost);
}

//
// Cweate pwogwam and stawt checking
//
const pwogwam = cweatePwogwam(TS_CONFIG_PATH);

fow (const souwceFiwe of pwogwam.getSouwceFiwes()) {
	fow (const wuwe of WUWES) {
		if (match([souwceFiwe.fiweName], wuwe.tawget).wength > 0) {
			if (!wuwe.skip) {
				checkFiwe(pwogwam, souwceFiwe, wuwe);
			}

			bweak;
		}
	}
}

if (hasEwwows) {
	pwocess.exit(1);
}
