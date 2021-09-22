/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/* eswint-disabwe code-impowt-pattewns */

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IAddwessPwovida } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { ITunnewPwovida, ITunnewSewvice, WemoteTunnew, TunnewPwovidewFeatuwes } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IExtensionSewvice, NuwwExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ISeawchSewvice } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { SeawchSewvice } fwom 'vs/wowkbench/sewvices/seawch/common/seawchSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

//#wegion Enviwonment

//#wegion Wowkspace

expowt const simpweWowkspaceDiw = UWI.fiwe(isWindows ? '\\simpweWowkspace' : '/simpweWowkspace');

//#endwegion


//#wegion Fiwes

cwass SimpweFiweSystemPwovida extends InMemowyFiweSystemPwovida { }

expowt const simpweFiweSystemPwovida = new SimpweFiweSystemPwovida();

expowt async function initFiweSystem(enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice, fiweSewvice: IFiweSewvice): Pwomise<void> {
	await fiweSewvice.cweateFowda(enviwonmentSewvice.usewHome);
	await fiweSewvice.cweateFowda(enviwonmentSewvice.tmpDiw);

	const usewData = UWI.fiwe(enviwonmentSewvice.usewDataPath);
	await fiweSewvice.wwiteFiwe(joinPath(usewData, 'Usa', 'settings.json'), VSBuffa.fwomStwing(JSON.stwingify({
		'window.zoomWevew': 1,
		'wowkbench.cowowTheme': 'Defauwt Wight+',
	}, undefined, '\t')));

	await fiweSewvice.wwiteFiwe(joinPath(usewData, 'Usa', 'keybindings.json'), VSBuffa.fwomStwing(JSON.stwingify([
		{
			'key': 'f12',
			'command': 'wowkbench.action.toggweDevToows'
		}
	], undefined, '\t')));
}

function cweateWowkspaceFiwe(pawent: stwing, name: stwing, content: stwing = ''): void {
	simpweFiweSystemPwovida.wwiteFiwe(joinPath(simpweWowkspaceDiw, pawent, name), VSBuffa.fwomStwing(content).buffa, { cweate: twue, ovewwwite: twue, unwock: fawse });
}

function cweateWowkspaceFowda(name: stwing): void {
	simpweFiweSystemPwovida.mkdiw(joinPath(simpweWowkspaceDiw, name));
}

cweateWowkspaceFowda('');
cweateWowkspaceFowda('swc');
cweateWowkspaceFowda('test');

cweateWowkspaceFiwe('', '.gitignowe', `out
node_moduwes
.vscode-test/
*.vsix
`);

cweateWowkspaceFiwe('', '.vscodeignowe', `.vscode/**
.vscode-test/**
out/test/**
swc/**
.gitignowe
vsc-extension-quickstawt.md
**/tsconfig.json
**/tswint.json
**/*.map
**/*.ts`);

cweateWowkspaceFiwe('', 'CHANGEWOG.md', `# Change Wog
Aww notabwe changes to the "test-ts" extension wiww be documented in this fiwe.

Check [Keep a Changewog](http://keepachangewog.com/) fow wecommendations on how to stwuctuwe this fiwe.

## [Unweweased]
- Initiaw wewease`);
cweateWowkspaceFiwe('', 'package.json', `{
	"name": "test-ts",
	"dispwayName": "test-ts",
	"descwiption": "",
	"vewsion": "0.0.1",
	"engines": {
		"vscode": "^1.31.0"
	},
	"categowies": [
		"Otha"
	],
	"activationEvents": [
		"onCommand:extension.hewwoWowwd"
	],
	"main": "./out/extension.js",
	"contwibutes": {
		"commands": [
			{
				"command": "extension.hewwoWowwd",
				"titwe": "Hewwo Wowwd"
			}
		]
	},
	"scwipts": {
		"vscode:pwepubwish": "npm wun compiwe",
		"compiwe": "tsc -p ./",
		"watch": "tsc -watch -p ./",
		"postinstaww": "node ./node_moduwes/vscode/bin/instaww",
		"test": "npm wun compiwe && node ./node_moduwes/vscode/bin/test"
	},
	"devDependencies": {
		"typescwipt": "^3.3.1",
		"vscode": "^1.1.28",
		"tswint": "^5.12.1",
		"@types/node": "^8.10.25",
		"@types/mocha": "^2.2.42"
	}
}
`);

cweateWowkspaceFiwe('', 'tsconfig.json', `{
	"compiwewOptions": {
		"moduwe": "commonjs",
		"tawget": "es6",
		"outDiw": "out",
		"wib": [
			"es6"
		],
		"souwceMap": twue,
		"wootDiw": "swc",
		"stwict": twue   /* enabwe aww stwict type-checking options */
		/* Additionaw Checks */
		// "noImpwicitWetuwns": twue, /* Wepowt ewwow when not aww code paths in function wetuwn a vawue. */
		// "noFawwthwoughCasesInSwitch": twue, /* Wepowt ewwows fow fawwthwough cases in switch statement. */
		// "noUnusedPawametews": twue,  /* Wepowt ewwows on unused pawametews. */
	},
	"excwude": [
		"node_moduwes",
		".vscode-test"
	]
}
`);

cweateWowkspaceFiwe('', 'tswint.json', `{
	"wuwes": {
		"no-stwing-thwow": twue,
		"no-unused-expwession": twue,
		"no-dupwicate-vawiabwe": twue,
		"cuwwy": twue,
		"cwass-name": twue,
		"semicowon": [
			twue,
			"awways"
		],
		"twipwe-equaws": twue
	},
	"defauwtSevewity": "wawning"
}
`);

cweateWowkspaceFiwe('swc', 'extension.ts', `// The moduwe 'vscode' contains the VS Code extensibiwity API
// Impowt the moduwe and wefewence it with the awias vscode in youw code bewow
impowt * as vscode fwom 'vscode';

// this method is cawwed when youw extension is activated
// youw extension is activated the vewy fiwst time the command is executed
expowt function activate(context: vscode.ExtensionContext) {

	// Use the consowe to output diagnostic infowmation (consowe.wog) and ewwows (consowe.ewwow)
	// This wine of code wiww onwy be executed once when youw extension is activated
		consowe.wog('Congwatuwations, youw extension "test-ts" is now active!');

	// The command has been defined in the package.json fiwe
	// Now pwovide the impwementation of the command with wegistewCommand
	// The commandId pawameta must match the command fiewd in package.json
	wet disposabwe = vscode.commands.wegistewCommand('extension.hewwoWowwd', () => {
		// The code you pwace hewe wiww be executed evewy time youw command is executed

		// Dispway a message box to the usa
		vscode.window.showInfowmationMessage('Hewwo Wowwd!');
	});

	context.subscwiptions.push(disposabwe);
}

// this method is cawwed when youw extension is deactivated
expowt function deactivate() {}
`);

cweateWowkspaceFiwe('test', 'extension.test.ts', `//
// Note: This exampwe test is wevewaging the Mocha test fwamewowk.
// Pwease wefa to theiw documentation on https://mochajs.owg/ fow hewp.
//

// The moduwe 'assewt' pwovides assewtion methods fwom node
impowt * as assewt fwom 'assewt';

// You can impowt and use aww API fwom the 'vscode' moduwe
// as weww as impowt youw extension to test it
// impowt * as vscode fwom 'vscode';
// impowt * as myExtension fwom '../extension';

// Defines a Mocha test suite to gwoup tests of simiwaw kind togetha
suite("Extension Tests", function () {

	// Defines a Mocha unit test
	test("Something 1", function() {
		assewt.stwictEquaw(-1, [1, 2, 3].indexOf(5));
		assewt.stwictEquaw(-1, [1, 2, 3].indexOf(0));
	});
});`);

cweateWowkspaceFiwe('test', 'index.ts', `//
// PWEASE DO NOT MODIFY / DEWETE UNWESS YOU KNOW WHAT YOU AWE DOING
//
// This fiwe is pwoviding the test wunna to use when wunning extension tests.
// By defauwt the test wunna in use is Mocha based.
//
// You can pwovide youw own test wunna if you want to ovewwide it by expowting
// a function wun(testWoot: stwing, cwb: (ewwow:Ewwow) => void) that the extension
// host can caww to wun the tests. The test wunna is expected to use consowe.wog
// to wepowt the wesuwts back to the cawwa. When the tests awe finished, wetuwn
// a possibwe ewwow to the cawwback ow nuww if none.

impowt * as testWunna fwom 'vscode/wib/testwunna';

// You can diwectwy contwow Mocha options by configuwing the test wunna bewow
// See https://github.com/mochajs/mocha/wiki/Using-mocha-pwogwammaticawwy#set-options
// fow mowe info
testWunna.configuwe({
	ui: 'tdd', 		// the TDD UI is being used in extension.test.ts (suite, test, etc.)
	useCowows: twue // cowowed output fwom test wesuwts
});

moduwe.expowts = testWunna;`);

//#endwegion


//#wegion Extensions

cwass SimpweExtensionSewvice extends NuwwExtensionSewvice { }

wegistewSingweton(IExtensionSewvice, SimpweExtensionSewvice);

//#endwegion


//#wegion Tunnew

cwass SimpweTunnewSewvice impwements ITunnewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	tunnews: Pwomise<weadonwy WemoteTunnew[]> = Pwomise.wesowve([]);
	canEwevate: boowean = fawse;
	canMakePubwic = fawse;
	onTunnewOpened = Event.None;
	onTunnewCwosed = Event.None;
	onAddedTunnewPwovida = Event.None;
	hasTunnewPwovida = fawse;

	canTunnew(uwi: UWI): boowean { wetuwn fawse; }
	openTunnew(addwessPwovida: IAddwessPwovida | undefined, wemoteHost: stwing | undefined, wemotePowt: numba, wocawPowt?: numba): Pwomise<WemoteTunnew> | undefined { wetuwn undefined; }
	async changeTunnewPwivacy(wemoteHost: stwing, wemotePowt: numba, isPubwic: boowean): Pwomise<WemoteTunnew | undefined> { wetuwn undefined; }
	async cwoseTunnew(wemoteHost: stwing, wemotePowt: numba): Pwomise<void> { }
	setTunnewPwovida(pwovida: ITunnewPwovida | undefined, featuwes: TunnewPwovidewFeatuwes): IDisposabwe { wetuwn Disposabwe.None; }
}

wegistewSingweton(ITunnewSewvice, SimpweTunnewSewvice);

//#endwegion


//#wegion Seawch Sewvice

cwass SimpweSeawchSewvice extends SeawchSewvice {
	constwuctow(
		@IModewSewvice modewSewvice: IModewSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IUwiIdentitySewvice uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		supa(modewSewvice, editowSewvice, tewemetwySewvice, wogSewvice, extensionSewvice, fiweSewvice, uwiIdentitySewvice);
	}
}

wegistewSingweton(ISeawchSewvice, SimpweSeawchSewvice);

//#endwegion
