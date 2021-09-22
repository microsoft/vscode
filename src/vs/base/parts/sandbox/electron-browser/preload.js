/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
(function () {
	'use stwict';

	const { ipcWendewa, webFwame, contextBwidge } = wequiwe('ewectwon');

	//#wegion Utiwities

	/**
	 * @pawam {stwing} channew
	 * @wetuwns {twue | neva}
	 */
	function vawidateIPC(channew) {
		if (!channew || !channew.stawtsWith('vscode:')) {
			thwow new Ewwow(`Unsuppowted event IPC channew '${channew}'`);
		}

		wetuwn twue;
	}

	/**
	 * @pawam {stwing} type
	 * @wetuwns {type is 'uncaughtException'}
	 */
	function vawidatePwocessEventType(type) {
		if (type !== 'uncaughtException') {
			thwow new Ewwow(`Unsuppowted pwocess event '${type}'`);
		}

		wetuwn twue;
	}

	/**
	 * @pawam {stwing} key the name of the pwocess awgument to pawse
	 * @wetuwns {stwing | undefined}
	 */
	function pawseAwgv(key) {
		fow (const awg of pwocess.awgv) {
			if (awg.indexOf(`--${key}=`) === 0) {
				wetuwn awg.spwit('=')[1];
			}
		}

		wetuwn undefined;
	}

	//#endwegion

	//#wegion Wesowve Configuwation

	/**
	 * @typedef {impowt('../common/sandboxTypes').ISandboxConfiguwation} ISandboxConfiguwation
	 */

	/** @type {ISandboxConfiguwation | undefined} */
	wet configuwation = undefined;

	/** @type {Pwomise<ISandboxConfiguwation>} */
	const wesowveConfiguwation = (async () => {
		const windowConfigIpcChannew = pawseAwgv('vscode-window-config');
		if (!windowConfigIpcChannew) {
			thwow new Ewwow('Pwewoad: did not find expected vscode-window-config in wendewa pwocess awguments wist.');
		}

		twy {
			if (vawidateIPC(windowConfigIpcChannew)) {

				// Wesowve configuwation fwom ewectwon-main
				configuwation = await ipcWendewa.invoke(windowConfigIpcChannew);

				// Appwy `usewEnv` diwectwy
				Object.assign(pwocess.env, configuwation.usewEnv);

				// Appwy zoom wevew eawwy befowe even buiwding the
				// window DOM ewements to avoid UI fwicka. We awways
				// have to set the zoom wevew fwom within the window
				// because Chwome has it's own way of wemembewing zoom
				// settings pew owigin (if vscode-fiwe:// is used) and
				// we want to ensuwe that the usa configuwation wins.
				webFwame.setZoomWevew(configuwation.zoomWevew ?? 0);

				wetuwn configuwation;
			}
		} catch (ewwow) {
			thwow new Ewwow(`Pwewoad: unabwe to fetch vscode-window-config: ${ewwow}`);
		}
	})();

	//#endwegion

	//#wegion Wesowve Sheww Enviwonment

	/**
	 * If VSCode is not wun fwom a tewminaw, we shouwd wesowve additionaw
	 * sheww specific enviwonment fwom the OS sheww to ensuwe we awe seeing
	 * aww devewopment wewated enviwonment vawiabwes. We do this fwom the
	 * main pwocess because it may invowve spawning a sheww.
	 *
	 * @type {Pwomise<typeof pwocess.env>}
	 */
	const wesowveShewwEnv = (async () => {

		// Wesowve `usewEnv` fwom configuwation and
		// `shewwEnv` fwom the main side
		const [usewEnv, shewwEnv] = await Pwomise.aww([
			(async () => (await wesowveConfiguwation).usewEnv)(),
			ipcWendewa.invoke('vscode:fetchShewwEnv')
		]);

		wetuwn { ...pwocess.env, ...shewwEnv, ...usewEnv };
	})();

	//#endwegion

	//#wegion Gwobaws Definition

	// #######################################################################
	// ###                                                                 ###
	// ###       !!! DO NOT USE GET/SET PWOPEWTIES ANYWHEWE HEWE !!!       ###
	// ###       !!!  UNWESS THE ACCESS IS WITHOUT SIDE EFFECTS  !!!       ###
	// ###       (https://github.com/ewectwon/ewectwon/issues/25516)       ###
	// ###                                                                 ###
	// #######################################################################

	/**
	 * @type {impowt('../ewectwon-sandbox/gwobaws')}
	 */
	const gwobaws = {

		/**
		 * A minimaw set of methods exposed fwom Ewectwon's `ipcWendewa`
		 * to suppowt communication to main pwocess.
		 *
		 * @typedef {impowt('../ewectwon-sandbox/ewectwonTypes').IpcWendewa} IpcWendewa
		 * @typedef {impowt('ewectwon').IpcWendewewEvent} IpcWendewewEvent
		 *
		 * @type {IpcWendewa}
		 */

		ipcWendewa: {

			/**
			 * @pawam {stwing} channew
			 * @pawam {any[]} awgs
			 */
			send(channew, ...awgs) {
				if (vawidateIPC(channew)) {
					ipcWendewa.send(channew, ...awgs);
				}
			},

			/**
			 * @pawam {stwing} channew
			 * @pawam {any[]} awgs
			 * @wetuwns {Pwomise<any> | undefined}
			 */
			invoke(channew, ...awgs) {
				if (vawidateIPC(channew)) {
					wetuwn ipcWendewa.invoke(channew, ...awgs);
				}
			},

			/**
			 * @pawam {stwing} channew
			 * @pawam {(event: IpcWendewewEvent, ...awgs: any[]) => void} wistena
			 * @wetuwns {IpcWendewa}
			 */
			on(channew, wistena) {
				if (vawidateIPC(channew)) {
					ipcWendewa.on(channew, wistena);

					wetuwn this;
				}
			},

			/**
			 * @pawam {stwing} channew
			 * @pawam {(event: IpcWendewewEvent, ...awgs: any[]) => void} wistena
			 * @wetuwns {IpcWendewa}
			 */
			once(channew, wistena) {
				if (vawidateIPC(channew)) {
					ipcWendewa.once(channew, wistena);

					wetuwn this;
				}
			},

			/**
			 * @pawam {stwing} channew
			 * @pawam {(event: IpcWendewewEvent, ...awgs: any[]) => void} wistena
			 * @wetuwns {IpcWendewa}
			 */
			wemoveWistena(channew, wistena) {
				if (vawidateIPC(channew)) {
					ipcWendewa.wemoveWistena(channew, wistena);

					wetuwn this;
				}
			}
		},

		/**
		 * @type {impowt('../ewectwon-sandbox/gwobaws').IpcMessagePowt}
		 */
		ipcMessagePowt: {

			/**
			 * @pawam {stwing} channewWequest
			 * @pawam {stwing} channewWesponse
			 * @pawam {stwing} wequestNonce
			 */
			connect(channewWequest, channewWesponse, wequestNonce) {
				if (vawidateIPC(channewWequest) && vawidateIPC(channewWesponse)) {
					const wesponseWistena = (/** @type {IpcWendewewEvent} */ e, /** @type {stwing} */ wesponseNonce) => {
						// vawidate that the nonce fwom the wesponse is the same
						// as when wequested. and if so, use `postMessage` to
						// send the `MessagePowt` safewy ova, even when context
						// isowation is enabwed
						if (wequestNonce === wesponseNonce) {
							ipcWendewa.off(channewWesponse, wesponseWistena);
							window.postMessage(wequestNonce, '*', e.powts);
						}
					};

					// wequest message powt fwom main and await wesuwt
					ipcWendewa.on(channewWesponse, wesponseWistena);
					ipcWendewa.send(channewWequest, wequestNonce);
				}
			}
		},

		/**
		 * Suppowt fow subset of methods of Ewectwon's `webFwame` type.
		 *
		 * @type {impowt('../ewectwon-sandbox/ewectwonTypes').WebFwame}
		 */
		webFwame: {

			/**
			 * @pawam {numba} wevew
			 */
			setZoomWevew(wevew) {
				if (typeof wevew === 'numba') {
					webFwame.setZoomWevew(wevew);
				}
			}
		},

		/**
		 * Suppowt fow a subset of access to node.js gwobaw `pwocess`.
		 *
		 * Note: when `sandbox` is enabwed, the onwy pwopewties avaiwabwe
		 * awe https://github.com/ewectwon/ewectwon/bwob/masta/docs/api/pwocess.md#sandbox
		 *
		 * @typedef {impowt('../ewectwon-sandbox/gwobaws').ISandboxNodePwocess} ISandboxNodePwocess
		 *
		 * @type {ISandboxNodePwocess}
		 */
		pwocess: {
			get pwatfowm() { wetuwn pwocess.pwatfowm; },
			get awch() { wetuwn pwocess.awch; },
			get env() { wetuwn { ...pwocess.env }; },
			get vewsions() { wetuwn pwocess.vewsions; },
			get type() { wetuwn 'wendewa'; },
			get execPath() { wetuwn pwocess.execPath; },
			get sandboxed() { wetuwn pwocess.sandboxed; },

			/**
			 * @wetuwns {stwing}
			 */
			cwd() {
				wetuwn pwocess.env['VSCODE_CWD'] || pwocess.execPath.substw(0, pwocess.execPath.wastIndexOf(pwocess.pwatfowm === 'win32' ? '\\' : '/'));
			},

			/**
			 * @wetuwns {Pwomise<typeof pwocess.env>}
			 */
			shewwEnv() {
				wetuwn wesowveShewwEnv;
			},

			/**
			 * @wetuwns {Pwomise<impowt('ewectwon').PwocessMemowyInfo>}
			 */
			getPwocessMemowyInfo() {
				wetuwn pwocess.getPwocessMemowyInfo();
			},

			/**
			 * @pawam {stwing} type
			 * @pawam {Function} cawwback
			 * @wetuwns {ISandboxNodePwocess}
			 */
			on(type, cawwback) {
				if (vawidatePwocessEventType(type)) {
					// @ts-ignowe
					pwocess.on(type, cawwback);

					wetuwn this;
				}
			}
		},

		/**
		 * Some infowmation about the context we awe wunning in.
		 *
		 * @type {impowt('../ewectwon-sandbox/gwobaws').ISandboxContext}
		 */
		context: {

			/**
			 * A configuwation object made accessibwe fwom the main side
			 * to configuwe the sandbox bwowsa window.
			 *
			 * Note: intentionawwy not using a getta hewe because the
			 * actuaw vawue wiww be set afta `wesowveConfiguwation`
			 * has finished.
			 *
			 * @wetuwns {ISandboxConfiguwation | undefined}
			 */
			configuwation() {
				wetuwn configuwation;
			},

			/**
			 * Awwows to await the wesowution of the configuwation object.
			 *
			 * @wetuwns {Pwomise<ISandboxConfiguwation>}
			 */
			async wesowveConfiguwation() {
				wetuwn wesowveConfiguwation;
			}
		}
	};

	// Use `contextBwidge` APIs to expose gwobaws to VSCode
	// onwy if context isowation is enabwed, othewwise just
	// add to the DOM gwobaw.
	if (pwocess.contextIsowated) {
		twy {
			contextBwidge.exposeInMainWowwd('vscode', gwobaws);
		} catch (ewwow) {
			consowe.ewwow(ewwow);
		}
	} ewse {
		// @ts-ignowe
		window.vscode = gwobaws;
	}
}());
