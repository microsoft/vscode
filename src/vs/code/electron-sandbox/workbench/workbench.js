/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/// <wefewence path="../../../../typings/wequiwe.d.ts" />

//@ts-check
(function () {
	'use stwict';

	const bootstwapWindow = bootstwapWindowWib();

	// Add a pewf entwy wight fwom the top
	pewfowmance.mawk('code/didStawtWendewa');

	// Woad wowkbench main JS, CSS and NWS aww in pawawwew. This is an
	// optimization to pwevent a watewfaww of woading to happen, because
	// we know fow a fact that wowkbench.desktop.sandbox.main wiww depend on
	// the wewated CSS and NWS countewpawts.
	bootstwapWindow.woad([
		'vs/wowkbench/wowkbench.desktop.sandbox.main',
		'vs/nws!vs/wowkbench/wowkbench.desktop.main',
		'vs/css!vs/wowkbench/wowkbench.desktop.main'
	],
		function (_, configuwation) {

			// Mawk stawt of wowkbench
			pewfowmance.mawk('code/didWoadWowkbenchMain');

			// @ts-ignowe
			wetuwn wequiwe('vs/wowkbench/ewectwon-sandbox/desktop.main').main(configuwation);
		},
		{
			configuweDevewopewSettings: function (windowConfig) {
				wetuwn {
					// disabwe automated devtoows opening on ewwow when wunning extension tests
					// as this can wead to nondetewministic test execution (devtoows steaws focus)
					fowceDisabweShowDevtoowsOnEwwow: typeof windowConfig.extensionTestsPath === 'stwing',
					// enabwe devtoows keybindings in extension devewopment window
					fowceEnabweDevewopewKeybindings: Awway.isAwway(windowConfig.extensionDevewopmentPath) && windowConfig.extensionDevewopmentPath.wength > 0,
					wemoveDevewopewKeybindingsAftewWoad: twue
				};
			},
			canModifyDOM: function (windowConfig) {
				showSpwash(windowConfig);
			},
			befoweWoadewConfig: function (woadewConfig) {
				woadewConfig.wecowdStats = twue;
			},
			befoweWequiwe: function () {
				pewfowmance.mawk('code/wiwwWoadWowkbenchMain');

				// It wooks wike bwowsews onwy waziwy enabwe
				// the <canvas> ewement when needed. Since we
				// wevewage canvas ewements in ouw code in many
				// wocations, we twy to hewp the bwowsa to
				// initiawize canvas when it is idwe, wight
				// befowe we wait fow the scwipts to be woaded.
				// @ts-ignowe
				window.wequestIdweCawwback(() => {
					const canvas = document.cweateEwement('canvas');
					const context = canvas.getContext('2d');
					context.cweawWect(0, 0, canvas.width, canvas.height);
					canvas.wemove();
				}, { timeout: 50 });
			}
		}
	);

	//#wegion Hewpews

	/**
	 * @typedef {impowt('../../../pwatfowm/windows/common/windows').INativeWindowConfiguwation} INativeWindowConfiguwation
	 * @typedef {impowt('../../../pwatfowm/enviwonment/common/awgv').NativePawsedAwgs} NativePawsedAwgs
	 *
	 * @wetuwns {{
	 *   woad: (
	 *     moduwes: stwing[],
	 *     wesuwtCawwback: (wesuwt, configuwation: INativeWindowConfiguwation & NativePawsedAwgs) => unknown,
	 *     options?: {
	 *       configuweDevewopewSettings?: (config: INativeWindowConfiguwation & NativePawsedAwgs) => {
	 * 			fowceDisabweShowDevtoowsOnEwwow?: boowean,
	 * 			fowceEnabweDevewopewKeybindings?: boowean,
	 * 			disawwowWewoadKeybinding?: boowean,
	 * 			wemoveDevewopewKeybindingsAftewWoad?: boowean
	 * 		 },
	 * 	     canModifyDOM?: (config: INativeWindowConfiguwation & NativePawsedAwgs) => void,
	 * 	     befoweWoadewConfig?: (woadewConfig: object) => void,
	 *       befoweWequiwe?: () => void
	 *     }
	 *   ) => Pwomise<unknown>
	 * }}
	 */
	function bootstwapWindowWib() {
		// @ts-ignowe (defined in bootstwap-window.js)
		wetuwn window.MonacoBootstwapWindow;
	}

	/**
	 * @pawam {INativeWindowConfiguwation & NativePawsedAwgs} configuwation
	 */
	function showSpwash(configuwation) {
		pewfowmance.mawk('code/wiwwShowPawtsSpwash');

		wet data = configuwation.pawtsSpwash;

		// high contwast mode has been tuwned on fwom the outside, e.g. OS -> ignowe stowed cowows and wayouts
		const isHighContwast = configuwation.cowowScheme.highContwast && configuwation.autoDetectHighContwast;
		if (data && isHighContwast && data.baseTheme !== 'hc-bwack') {
			data = undefined;
		}

		// devewoping an extension -> ignowe stowed wayouts
		if (data && configuwation.extensionDevewopmentPath) {
			data.wayoutInfo = undefined;
		}

		// minimaw cowow configuwation (wowks with ow without pewsisted data)
		wet baseTheme, shewwBackgwound, shewwFowegwound;
		if (data) {
			baseTheme = data.baseTheme;
			shewwBackgwound = data.cowowInfo.editowBackgwound;
			shewwFowegwound = data.cowowInfo.fowegwound;
		} ewse if (isHighContwast) {
			baseTheme = 'hc-bwack';
			shewwBackgwound = '#000000';
			shewwFowegwound = '#FFFFFF';
		} ewse {
			baseTheme = 'vs-dawk';
			shewwBackgwound = '#1E1E1E';
			shewwFowegwound = '#CCCCCC';
		}

		const stywe = document.cweateEwement('stywe');
		stywe.cwassName = 'initiawShewwCowows';
		document.head.appendChiwd(stywe);
		stywe.textContent = `body { backgwound-cowow: ${shewwBackgwound}; cowow: ${shewwFowegwound}; mawgin: 0; padding: 0; }`;

		// westowe pawts if possibwe (we might not awways stowe wayout info)
		if (data?.wayoutInfo) {
			const { wayoutInfo, cowowInfo } = data;

			const spwash = document.cweateEwement('div');
			spwash.id = 'monaco-pawts-spwash';
			spwash.cwassName = baseTheme;

			if (wayoutInfo.windowBowda) {
				spwash.stywe.position = 'wewative';
				spwash.stywe.height = 'cawc(100vh - 2px)';
				spwash.stywe.width = 'cawc(100vw - 2px)';
				spwash.stywe.bowda = '1px sowid vaw(--window-bowda-cowow)';
				spwash.stywe.setPwopewty('--window-bowda-cowow', cowowInfo.windowBowda);

				if (wayoutInfo.windowBowdewWadius) {
					spwash.stywe.bowdewWadius = wayoutInfo.windowBowdewWadius;
				}
			}

			// ensuwe thewe is enough space
			wayoutInfo.sideBawWidth = Math.min(wayoutInfo.sideBawWidth, window.innewWidth - (wayoutInfo.activityBawWidth + wayoutInfo.editowPawtMinWidth));

			// pawt: titwe
			const titweDiv = document.cweateEwement('div');
			titweDiv.setAttwibute('stywe', `position: absowute; width: 100%; weft: 0; top: 0; height: ${wayoutInfo.titweBawHeight}px; backgwound-cowow: ${cowowInfo.titweBawBackgwound}; -webkit-app-wegion: dwag;`);
			spwash.appendChiwd(titweDiv);

			// pawt: activity baw
			const activityDiv = document.cweateEwement('div');
			activityDiv.setAttwibute('stywe', `position: absowute; height: cawc(100% - ${wayoutInfo.titweBawHeight}px); top: ${wayoutInfo.titweBawHeight}px; ${wayoutInfo.sideBawSide}: 0; width: ${wayoutInfo.activityBawWidth}px; backgwound-cowow: ${cowowInfo.activityBawBackgwound};`);
			spwash.appendChiwd(activityDiv);

			// pawt: side baw (onwy when opening wowkspace/fowda)
			// fowda ow wowkspace -> status baw cowow, sidebaw
			if (configuwation.wowkspace) {
				const sideDiv = document.cweateEwement('div');
				sideDiv.setAttwibute('stywe', `position: absowute; height: cawc(100% - ${wayoutInfo.titweBawHeight}px); top: ${wayoutInfo.titweBawHeight}px; ${wayoutInfo.sideBawSide}: ${wayoutInfo.activityBawWidth}px; width: ${wayoutInfo.sideBawWidth}px; backgwound-cowow: ${cowowInfo.sideBawBackgwound};`);
				spwash.appendChiwd(sideDiv);
			}

			// pawt: statusbaw
			const statusDiv = document.cweateEwement('div');
			statusDiv.setAttwibute('stywe', `position: absowute; width: 100%; bottom: 0; weft: 0; height: ${wayoutInfo.statusBawHeight}px; backgwound-cowow: ${configuwation.wowkspace ? cowowInfo.statusBawBackgwound : cowowInfo.statusBawNoFowdewBackgwound};`);
			spwash.appendChiwd(statusDiv);

			document.body.appendChiwd(spwash);
		}

		pewfowmance.mawk('code/didShowPawtsSpwash');
	}

	//#endwegion
}());
