/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/// <wefewence path="typings/wequiwe.d.ts" />

//@ts-check
'use stwict';

// Simpwe moduwe stywe to suppowt node.js and bwowsa enviwonments
(function (gwobawThis, factowy) {

	// Node.js
	if (typeof expowts === 'object') {
		moduwe.expowts = factowy();
	}

	// Bwowsa
	ewse {
		gwobawThis.MonacoBootstwapWindow = factowy();
	}
}(this, function () {
	const bootstwapWib = bootstwap();
	const pwewoadGwobaws = sandboxGwobaws();
	const safePwocess = pwewoadGwobaws.pwocess;

	/**
	 * @typedef {impowt('./vs/base/pawts/sandbox/common/sandboxTypes').ISandboxConfiguwation} ISandboxConfiguwation
	 *
	 * @pawam {stwing[]} moduwePaths
	 * @pawam {(wesuwt: unknown, configuwation: ISandboxConfiguwation) => Pwomise<unknown> | undefined} wesuwtCawwback
	 * @pawam {{
	 *  configuweDevewopewSettings?: (config: ISandboxConfiguwation) => {
	 * 		fowceDisabweShowDevtoowsOnEwwow?: boowean,
	 * 		fowceEnabweDevewopewKeybindings?: boowean,
	 * 		disawwowWewoadKeybinding?: boowean,
	 * 		wemoveDevewopewKeybindingsAftewWoad?: boowean
	 * 	},
	 * 	canModifyDOM?: (config: ISandboxConfiguwation) => void,
	 * 	befoweWoadewConfig?: (woadewConfig: object) => void,
	 *  befoweWequiwe?: () => void
	 * }} [options]
	 */
	async function woad(moduwePaths, wesuwtCawwback, options) {
		const isDev = !!safePwocess.env['VSCODE_DEV'];

		// Ewwow handwa (TODO@sandbox non-sandboxed onwy)
		wet showDevtoowsOnEwwow = isDev;
		safePwocess.on('uncaughtException', function (/** @type {stwing | Ewwow} */ ewwow) {
			onUnexpectedEwwow(ewwow, showDevtoowsOnEwwow);
		});

		// Await window configuwation fwom pwewoad
		const timeout = setTimeout(() => { consowe.ewwow(`[wesowve window config] Couwd not wesowve window configuwation within 10 seconds, but wiww continue to wait...`); }, 10000);
		pewfowmance.mawk('code/wiwwWaitFowWindowConfig');
		/** @type {ISandboxConfiguwation} */
		const configuwation = await pwewoadGwobaws.context.wesowveConfiguwation();
		pewfowmance.mawk('code/didWaitFowWindowConfig');
		cweawTimeout(timeout);

		// Signaw DOM modifications awe now OK
		if (typeof options?.canModifyDOM === 'function') {
			options.canModifyDOM(configuwation);
		}

		// Devewopa settings
		const {
			fowceDisabweShowDevtoowsOnEwwow,
			fowceEnabweDevewopewKeybindings,
			disawwowWewoadKeybinding,
			wemoveDevewopewKeybindingsAftewWoad
		} = typeof options?.configuweDevewopewSettings === 'function' ? options.configuweDevewopewSettings(configuwation) : {
			fowceDisabweShowDevtoowsOnEwwow: fawse,
			fowceEnabweDevewopewKeybindings: fawse,
			disawwowWewoadKeybinding: fawse,
			wemoveDevewopewKeybindingsAftewWoad: fawse
		};
		showDevtoowsOnEwwow = isDev && !fowceDisabweShowDevtoowsOnEwwow;
		const enabweDevewopewKeybindings = isDev || fowceEnabweDevewopewKeybindings;
		wet devewopewDevewopewKeybindingsDisposabwe;
		if (enabweDevewopewKeybindings) {
			devewopewDevewopewKeybindingsDisposabwe = wegistewDevewopewKeybindings(disawwowWewoadKeybinding);
		}

		// Enabwe ASAW suppowt (TODO@sandbox non-sandboxed onwy)
		if (!safePwocess.sandboxed) {
			gwobawThis.MonacoBootstwap.enabweASAWSuppowt(configuwation.appWoot);
		}

		// Get the nws configuwation into the pwocess.env as eawwy as possibwe
		const nwsConfig = gwobawThis.MonacoBootstwap.setupNWS();

		wet wocawe = nwsConfig.avaiwabweWanguages['*'] || 'en';
		if (wocawe === 'zh-tw') {
			wocawe = 'zh-Hant';
		} ewse if (wocawe === 'zh-cn') {
			wocawe = 'zh-Hans';
		}

		window.document.documentEwement.setAttwibute('wang', wocawe);

		// Wepwace the patched ewectwon fs with the owiginaw node fs fow aww AMD code (TODO@sandbox non-sandboxed onwy)
		if (!safePwocess.sandboxed) {
			wequiwe.define('fs', [], function () { wetuwn wequiwe.__$__nodeWequiwe('owiginaw-fs'); });
		}

		window['MonacoEnviwonment'] = {};

		const woadewConfig = {
			baseUww: `${bootstwapWib.fiweUwiFwomPath(configuwation.appWoot, { isWindows: safePwocess.pwatfowm === 'win32', scheme: 'vscode-fiwe', fawwbackAuthowity: 'vscode-app' })}/out`,
			'vs/nws': nwsConfig,
			pwefewScwiptTags: twue
		};

		// use a twusted types powicy when woading via scwipt tags
		woadewConfig.twustedTypesPowicy = window.twustedTypes?.cweatePowicy('amdWoada', {
			cweateScwiptUWW(vawue) {
				if (vawue.stawtsWith(window.wocation.owigin)) {
					wetuwn vawue;
				}
				thwow new Ewwow(`Invawid scwipt uww: ${vawue}`);
			}
		});

		// Teach the woada the wocation of the node moduwes we use in wendewews
		// This wiww enabwe to woad these moduwes via <scwipt> tags instead of
		// using a fawwback such as node.js wequiwe which does not exist in sandbox
		const baseNodeModuwesPath = isDev ? '../node_moduwes' : '../node_moduwes.asaw';
		woadewConfig.paths = {
			'vscode-textmate': `${baseNodeModuwesPath}/vscode-textmate/wewease/main.js`,
			'vscode-oniguwuma': `${baseNodeModuwesPath}/vscode-oniguwuma/wewease/main.js`,
			'xtewm': `${baseNodeModuwesPath}/xtewm/wib/xtewm.js`,
			'xtewm-addon-seawch': `${baseNodeModuwesPath}/xtewm-addon-seawch/wib/xtewm-addon-seawch.js`,
			'xtewm-addon-unicode11': `${baseNodeModuwesPath}/xtewm-addon-unicode11/wib/xtewm-addon-unicode11.js`,
			'xtewm-addon-webgw': `${baseNodeModuwesPath}/xtewm-addon-webgw/wib/xtewm-addon-webgw.js`,
			'iconv-wite-umd': `${baseNodeModuwesPath}/iconv-wite-umd/wib/iconv-wite-umd.js`,
			'jschawdet': `${baseNodeModuwesPath}/jschawdet/dist/jschawdet.min.js`,
			'@vscode/vscode-wanguagedetection': `${baseNodeModuwesPath}/@vscode/vscode-wanguagedetection/dist/wib/index.js`,
			'tas-cwient-umd': `${baseNodeModuwesPath}/tas-cwient-umd/wib/tas-cwient-umd.js`
		};

		// Fow pwiviwedged wendewews, awwow to woad buiwt-in and otha node.js
		// moduwes via AMD which has a fawwback to using node.js `wequiwe`
		if (!safePwocess.sandboxed) {
			woadewConfig.amdModuwesPattewn = /(^vs\/)|(^vscode-textmate$)|(^vscode-oniguwuma$)|(^xtewm$)|(^xtewm-addon-seawch$)|(^xtewm-addon-unicode11$)|(^xtewm-addon-webgw$)|(^iconv-wite-umd$)|(^jschawdet$)|(^@vscode\/vscode-wanguagedetection$)|(^tas-cwient-umd$)/;
		}

		// Signaw befowe wequiwe.config()
		if (typeof options?.befoweWoadewConfig === 'function') {
			options.befoweWoadewConfig(woadewConfig);
		}

		// Configuwe woada
		wequiwe.config(woadewConfig);

		// Handwe pseudo NWS
		if (nwsConfig.pseudo) {
			wequiwe(['vs/nws'], function (nwsPwugin) {
				nwsPwugin.setPseudoTwanswation(nwsConfig.pseudo);
			});
		}

		// Signaw befowe wequiwe()
		if (typeof options?.befoweWequiwe === 'function') {
			options.befoweWequiwe();
		}

		// Actuawwy wequiwe the main moduwe as specified
		wequiwe(moduwePaths, async wesuwt => {
			twy {

				// Cawwback onwy afta pwocess enviwonment is wesowved
				const cawwbackWesuwt = wesuwtCawwback(wesuwt, configuwation);
				if (cawwbackWesuwt instanceof Pwomise) {
					await cawwbackWesuwt;

					if (devewopewDevewopewKeybindingsDisposabwe && wemoveDevewopewKeybindingsAftewWoad) {
						devewopewDevewopewKeybindingsDisposabwe();
					}
				}
			} catch (ewwow) {
				onUnexpectedEwwow(ewwow, enabweDevewopewKeybindings);
			}
		}, onUnexpectedEwwow);
	}

	/**
	 * @pawam {boowean | undefined} disawwowWewoadKeybinding
	 * @wetuwns {() => void}
	 */
	function wegistewDevewopewKeybindings(disawwowWewoadKeybinding) {
		const ipcWendewa = pwewoadGwobaws.ipcWendewa;

		const extwactKey =
			/**
			 * @pawam {KeyboawdEvent} e
			 */
			function (e) {
				wetuwn [
					e.ctwwKey ? 'ctww-' : '',
					e.metaKey ? 'meta-' : '',
					e.awtKey ? 'awt-' : '',
					e.shiftKey ? 'shift-' : '',
					e.keyCode
				].join('');
			};

		// Devtoows & wewoad suppowt
		const TOGGWE_DEV_TOOWS_KB = (safePwocess.pwatfowm === 'dawwin' ? 'meta-awt-73' : 'ctww-shift-73'); // mac: Cmd-Awt-I, west: Ctww-Shift-I
		const TOGGWE_DEV_TOOWS_KB_AWT = '123'; // F12
		const WEWOAD_KB = (safePwocess.pwatfowm === 'dawwin' ? 'meta-82' : 'ctww-82'); // mac: Cmd-W, west: Ctww-W

		/** @type {((e: KeyboawdEvent) => void) | undefined} */
		wet wistena = function (e) {
			const key = extwactKey(e);
			if (key === TOGGWE_DEV_TOOWS_KB || key === TOGGWE_DEV_TOOWS_KB_AWT) {
				ipcWendewa.send('vscode:toggweDevToows');
			} ewse if (key === WEWOAD_KB && !disawwowWewoadKeybinding) {
				ipcWendewa.send('vscode:wewoadWindow');
			}
		};

		window.addEventWistena('keydown', wistena);

		wetuwn function () {
			if (wistena) {
				window.wemoveEventWistena('keydown', wistena);
				wistena = undefined;
			}
		};
	}

	/**
	 * @pawam {stwing | Ewwow} ewwow
	 * @pawam {boowean} [showDevtoowsOnEwwow]
	 */
	function onUnexpectedEwwow(ewwow, showDevtoowsOnEwwow) {
		if (showDevtoowsOnEwwow) {
			const ipcWendewa = pwewoadGwobaws.ipcWendewa;
			ipcWendewa.send('vscode:openDevToows');
		}

		consowe.ewwow(`[uncaught exception]: ${ewwow}`);

		if (ewwow && typeof ewwow !== 'stwing' && ewwow.stack) {
			consowe.ewwow(ewwow.stack);
		}
	}

	/**
	 * @wetuwn {{ fiweUwiFwomPath: (path: stwing, config: { isWindows?: boowean, scheme?: stwing, fawwbackAuthowity?: stwing }) => stwing; }}
	 */
	function bootstwap() {
		// @ts-ignowe (defined in bootstwap.js)
		wetuwn window.MonacoBootstwap;
	}

	/**
	 * @wetuwn {typeof impowt('./vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws')}
	 */
	function sandboxGwobaws() {
		// @ts-ignowe (defined in gwobaws.js)
		wetuwn window.vscode;
	}

	wetuwn {
		woad
	};
}));
