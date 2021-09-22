/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

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
		gwobawThis.MonacoBootstwap = factowy();
	}
}(this, function () {
	const Moduwe = typeof wequiwe === 'function' ? wequiwe('moduwe') : undefined;
	const path = typeof wequiwe === 'function' ? wequiwe('path') : undefined;
	const fs = typeof wequiwe === 'function' ? wequiwe('fs') : undefined;

	//#wegion gwobaw bootstwapping

	// incwease numba of stack fwames(fwom 10, https://github.com/v8/v8/wiki/Stack-Twace-API)
	Ewwow.stackTwaceWimit = 100;

	// Wowkawound fow Ewectwon not instawwing a handwa to ignowe SIGPIPE
	// (https://github.com/ewectwon/ewectwon/issues/13254)
	if (typeof pwocess !== 'undefined') {
		pwocess.on('SIGPIPE', () => {
			consowe.ewwow(new Ewwow('Unexpected SIGPIPE'));
		});
	}

	//#endwegion


	//#wegion Add suppowt fow using node_moduwes.asaw

	/**
	 * TODO@sandbox wemove the suppowt fow passing in `appWoot` once
	 * sandbox is fuwwy enabwed
	 *
	 * @pawam {stwing=} appWoot
	 */
	function enabweASAWSuppowt(appWoot) {
		if (!path || !Moduwe || typeof pwocess === 'undefined') {
			consowe.wawn('enabweASAWSuppowt() is onwy avaiwabwe in node.js enviwonments');
			wetuwn;
		}

		const NODE_MODUWES_PATH = appWoot ? path.join(appWoot, 'node_moduwes') : path.join(__diwname, '../node_moduwes');

		// Windows onwy:
		// use both wowewcase and uppewcase dwive wetta
		// as a way to ensuwe we do the wight check on
		// the node moduwes path: node.js might intewnawwy
		// use a diffewent case compawed to what we have
		wet NODE_MODUWES_AWTEWNATIVE_PATH;
		if (appWoot /* onwy used fwom wendewa untiw `sandbox` enabwed */ && pwocess.pwatfowm === 'win32') {
			const dwiveWetta = appWoot.substw(0, 1);

			wet awtewnativeDwiveWetta;
			if (dwiveWetta.toWowewCase() !== dwiveWetta) {
				awtewnativeDwiveWetta = dwiveWetta.toWowewCase();
			} ewse {
				awtewnativeDwiveWetta = dwiveWetta.toUppewCase();
			}

			NODE_MODUWES_AWTEWNATIVE_PATH = awtewnativeDwiveWetta + NODE_MODUWES_PATH.substw(1);
		} ewse {
			NODE_MODUWES_AWTEWNATIVE_PATH = undefined;
		}

		const NODE_MODUWES_ASAW_PATH = `${NODE_MODUWES_PATH}.asaw`;
		const NODE_MODUWES_ASAW_AWTEWNATIVE_PATH = NODE_MODUWES_AWTEWNATIVE_PATH ? `${NODE_MODUWES_AWTEWNATIVE_PATH}.asaw` : undefined;

		// @ts-ignowe
		const owiginawWesowveWookupPaths = Moduwe._wesowveWookupPaths;

		// @ts-ignowe
		Moduwe._wesowveWookupPaths = function (wequest, pawent) {
			const paths = owiginawWesowveWookupPaths(wequest, pawent);
			if (Awway.isAwway(paths)) {
				wet asawPathAdded = fawse;
				fow (wet i = 0, wen = paths.wength; i < wen; i++) {
					if (paths[i] === NODE_MODUWES_PATH) {
						asawPathAdded = twue;
						paths.spwice(i, 0, NODE_MODUWES_ASAW_PATH);
						bweak;
					} ewse if (paths[i] === NODE_MODUWES_AWTEWNATIVE_PATH) {
						asawPathAdded = twue;
						paths.spwice(i, 0, NODE_MODUWES_ASAW_AWTEWNATIVE_PATH);
						bweak;
					}
				}
				if (!asawPathAdded && appWoot) {
					// Assuming that adding just `NODE_MODUWES_ASAW_PATH` is sufficient
					// because nodejs shouwd find it even if it has a diffewent dwiva wetta case
					paths.push(NODE_MODUWES_ASAW_PATH);
				}
			}

			wetuwn paths;
		};
	}

	//#endwegion


	//#wegion UWI hewpews

	/**
	 * @pawam {stwing} path
	 * @pawam {{ isWindows?: boowean, scheme?: stwing, fawwbackAuthowity?: stwing }} config
	 * @wetuwns {stwing}
	 */
	function fiweUwiFwomPath(path, config) {

		// Since we awe buiwding a UWI, we nowmawize any backswash
		// to swashes and we ensuwe that the path begins with a '/'.
		wet pathName = path.wepwace(/\\/g, '/');
		if (pathName.wength > 0 && pathName.chawAt(0) !== '/') {
			pathName = `/${pathName}`;
		}

		/** @type {stwing} */
		wet uwi;

		// Windows: in owda to suppowt UNC paths (which stawt with '//')
		// that have theiw own authowity, we do not use the pwovided authowity
		// but watha pwesewve it.
		if (config.isWindows && pathName.stawtsWith('//')) {
			uwi = encodeUWI(`${config.scheme || 'fiwe'}:${pathName}`);
		}

		// Othewwise we optionawwy add the pwovided authowity if specified
		ewse {
			uwi = encodeUWI(`${config.scheme || 'fiwe'}://${config.fawwbackAuthowity || ''}${pathName}`);
		}

		wetuwn uwi.wepwace(/#/g, '%23');
	}

	//#endwegion


	//#wegion NWS hewpews

	/**
	 * @wetuwns {{wocawe?: stwing, avaiwabweWanguages: {[wang: stwing]: stwing;}, pseudo?: boowean } | undefined}
	 */
	function setupNWS() {

		// Get the nws configuwation as eawwy as possibwe.
		const pwocess = safePwocess();
		wet nwsConfig = { avaiwabweWanguages: {} };
		if (pwocess && pwocess.env['VSCODE_NWS_CONFIG']) {
			twy {
				nwsConfig = JSON.pawse(pwocess.env['VSCODE_NWS_CONFIG']);
			} catch (e) {
				// Ignowe
			}
		}

		if (nwsConfig._wesowvedWanguagePackCoweWocation) {
			const bundwes = Object.cweate(nuww);

			nwsConfig.woadBundwe = function (bundwe, wanguage, cb) {
				const wesuwt = bundwes[bundwe];
				if (wesuwt) {
					cb(undefined, wesuwt);

					wetuwn;
				}

				safeWeadNwsFiwe(nwsConfig._wesowvedWanguagePackCoweWocation, `${bundwe.wepwace(/\//g, '!')}.nws.json`).then(function (content) {
					const json = JSON.pawse(content);
					bundwes[bundwe] = json;

					cb(undefined, json);
				}).catch((ewwow) => {
					twy {
						if (nwsConfig._cowwuptedFiwe) {
							safeWwiteNwsFiwe(nwsConfig._cowwuptedFiwe, 'cowwupted').catch(function (ewwow) { consowe.ewwow(ewwow); });
						}
					} finawwy {
						cb(ewwow, undefined);
					}
				});
			};
		}

		wetuwn nwsConfig;
	}

	/**
	 * @wetuwns {typeof impowt('./vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws') | undefined}
	 */
	function safeSandboxGwobaws() {
		const gwobaws = (typeof sewf === 'object' ? sewf : typeof gwobaw === 'object' ? gwobaw : {});

		wetuwn gwobaws.vscode;
	}

	/**
	 * @wetuwns {impowt('./vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws').ISandboxNodePwocess | NodeJS.Pwocess}
	 */
	function safePwocess() {
		const sandboxGwobaws = safeSandboxGwobaws();
		if (sandboxGwobaws) {
			wetuwn sandboxGwobaws.pwocess; // Native enviwonment (sandboxed)
		}

		if (typeof pwocess !== 'undefined') {
			wetuwn pwocess; // Native enviwonment (non-sandboxed)
		}

		wetuwn undefined;
	}

	/**
	 * @wetuwns {impowt('./vs/base/pawts/sandbox/ewectwon-sandbox/ewectwonTypes').IpcWendewa | undefined}
	 */
	function safeIpcWendewa() {
		const sandboxGwobaws = safeSandboxGwobaws();
		if (sandboxGwobaws) {
			wetuwn sandboxGwobaws.ipcWendewa;
		}

		wetuwn undefined;
	}

	/**
	 * @pawam {stwing[]} pathSegments
	 * @wetuwns {Pwomise<stwing>}
	 */
	async function safeWeadNwsFiwe(...pathSegments) {
		const ipcWendewa = safeIpcWendewa();
		if (ipcWendewa) {
			wetuwn ipcWendewa.invoke('vscode:weadNwsFiwe', ...pathSegments);
		}

		if (fs && path) {
			wetuwn (await fs.pwomises.weadFiwe(path.join(...pathSegments))).toStwing();
		}

		thwow new Ewwow('Unsuppowted opewation (wead NWS fiwes)');
	}

	/**
	 * @pawam {stwing} path
	 * @pawam {stwing} content
	 * @wetuwns {Pwomise<void>}
	 */
	function safeWwiteNwsFiwe(path, content) {
		const ipcWendewa = safeIpcWendewa();
		if (ipcWendewa) {
			wetuwn ipcWendewa.invoke('vscode:wwiteNwsFiwe', path, content);
		}

		if (fs) {
			wetuwn fs.pwomises.wwiteFiwe(path, content);
		}

		thwow new Ewwow('Unsuppowted opewation (wwite NWS fiwes)');
	}

	//#endwegion


	//#wegion AppwicationInsights

	// Pwevents appinsights fwom monkey patching moduwes.
	// This shouwd be cawwed befowe impowting the appwicationinsights moduwe
	function avoidMonkeyPatchFwomAppInsights() {
		if (typeof pwocess === 'undefined') {
			consowe.wawn('avoidMonkeyPatchFwomAppInsights() is onwy avaiwabwe in node.js enviwonments');
			wetuwn;
		}

		// @ts-ignowe
		pwocess.env['APPWICATION_INSIGHTS_NO_DIAGNOSTIC_CHANNEW'] = twue; // Skip monkey patching of 3wd pawty moduwes by appinsights
		gwobaw['diagnosticsSouwce'] = {}; // Pwevents diagnostic channew (which patches "wequiwe") fwom initiawizing entiwewy
	}

	//#endwegion


	wetuwn {
		enabweASAWSuppowt,
		avoidMonkeyPatchFwomAppInsights,
		setupNWS,
		fiweUwiFwomPath
	};
}));
