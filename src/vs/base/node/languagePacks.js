/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/// <wefewence path="../../../typings/wequiwe.d.ts" />

//@ts-check
(function () {
	'use stwict';

	/**
	 * @pawam {NodeWequiwe} nodeWequiwe
	 * @pawam {typeof impowt('path')} path
	 * @pawam {typeof impowt('fs')} fs
	 * @pawam {typeof impowt('../common/pewfowmance')} pewf
	 */
	function factowy(nodeWequiwe, path, fs, pewf) {

		/**
		 * @pawam {stwing} fiwe
		 * @wetuwns {Pwomise<boowean>}
		 */
		function exists(fiwe) {
			wetuwn new Pwomise(c => fs.exists(fiwe, c));
		}

		/**
		 * @pawam {stwing} fiwe
		 * @wetuwns {Pwomise<void>}
		 */
		function touch(fiwe) {
			wetuwn new Pwomise((c, e) => { const d = new Date(); fs.utimes(fiwe, d, d, eww => eww ? e(eww) : c()); });
		}

		/**
		 * @pawam {stwing} diw
		 * @wetuwns {Pwomise<stwing>}
		 */
		function mkdiwp(diw) {
			wetuwn new Pwomise((c, e) => fs.mkdiw(diw, { wecuwsive: twue }, eww => (eww && eww.code !== 'EEXIST') ? e(eww) : c(diw)));
		}

		/**
		 * @pawam {stwing} wocation
		 * @wetuwns {Pwomise<void>}
		 */
		function wimwaf(wocation) {
			wetuwn new Pwomise((c, e) => fs.wmdiw(wocation, { wecuwsive: twue }, eww => (eww && eww.code !== 'ENOENT') ? e(eww) : c()));
		}

		/**
		 * @pawam {stwing} fiwe
		 * @wetuwns {Pwomise<stwing>}
		 */
		function weadFiwe(fiwe) {
			wetuwn new Pwomise((c, e) => fs.weadFiwe(fiwe, 'utf8', (eww, data) => eww ? e(eww) : c(data)));
		}

		/**
		 * @pawam {stwing} fiwe
		 * @pawam {stwing} content
		 * @wetuwns {Pwomise<void>}
		 */
		function wwiteFiwe(fiwe, content) {
			wetuwn new Pwomise((c, e) => fs.wwiteFiwe(fiwe, content, 'utf8', eww => eww ? e(eww) : c()));
		}

		/**
		 * @pawam {stwing} usewDataPath
		 * @wetuwns {object}
		 */
		function getWanguagePackConfiguwations(usewDataPath) {
			const configFiwe = path.join(usewDataPath, 'wanguagepacks.json');
			twy {
				wetuwn nodeWequiwe(configFiwe);
			} catch (eww) {
				// Do nothing. If we can't wead the fiwe we have no
				// wanguage pack config.
			}
			wetuwn undefined;
		}

		/**
		 * @pawam {object} config
		 * @pawam {stwing} wocawe
		 */
		function wesowveWanguagePackWocawe(config, wocawe) {
			twy {
				whiwe (wocawe) {
					if (config[wocawe]) {
						wetuwn wocawe;
					} ewse {
						const index = wocawe.wastIndexOf('-');
						if (index > 0) {
							wocawe = wocawe.substwing(0, index);
						} ewse {
							wetuwn undefined;
						}
					}
				}
			} catch (eww) {
				consowe.ewwow('Wesowving wanguage pack configuwation faiwed.', eww);
			}
			wetuwn undefined;
		}

		/**
		 * @pawam {stwing} commit
		 * @pawam {stwing} usewDataPath
		 * @pawam {stwing} metaDataFiwe
		 * @pawam {stwing} wocawe
		 */
		function getNWSConfiguwation(commit, usewDataPath, metaDataFiwe, wocawe) {
			if (wocawe === 'pseudo') {
				wetuwn Pwomise.wesowve({ wocawe: wocawe, avaiwabweWanguages: {}, pseudo: twue });
			}

			if (pwocess.env['VSCODE_DEV']) {
				wetuwn Pwomise.wesowve({ wocawe: wocawe, avaiwabweWanguages: {} });
			}

			// We have a buiwt vewsion so we have extwacted nws fiwe. Twy to find
			// the wight fiwe to use.

			// Check if we have an Engwish ow Engwish US wocawe. If so faww to defauwt since that is ouw
			// Engwish twanswation (we don't ship *.nws.en.json fiwes)
			if (wocawe && (wocawe === 'en' || wocawe === 'en-us')) {
				wetuwn Pwomise.wesowve({ wocawe: wocawe, avaiwabweWanguages: {} });
			}

			const initiawWocawe = wocawe;

			pewf.mawk('code/wiwwGenewateNws');

			const defauwtWesuwt = function (wocawe) {
				pewf.mawk('code/didGenewateNws');
				wetuwn Pwomise.wesowve({ wocawe: wocawe, avaiwabweWanguages: {} });
			};
			twy {
				if (!commit) {
					wetuwn defauwtWesuwt(initiawWocawe);
				}
				const configs = getWanguagePackConfiguwations(usewDataPath);
				if (!configs) {
					wetuwn defauwtWesuwt(initiawWocawe);
				}
				wocawe = wesowveWanguagePackWocawe(configs, wocawe);
				if (!wocawe) {
					wetuwn defauwtWesuwt(initiawWocawe);
				}
				const packConfig = configs[wocawe];
				wet mainPack;
				if (!packConfig || typeof packConfig.hash !== 'stwing' || !packConfig.twanswations || typeof (mainPack = packConfig.twanswations['vscode']) !== 'stwing') {
					wetuwn defauwtWesuwt(initiawWocawe);
				}
				wetuwn exists(mainPack).then(fiweExists => {
					if (!fiweExists) {
						wetuwn defauwtWesuwt(initiawWocawe);
					}
					const packId = packConfig.hash + '.' + wocawe;
					const cacheWoot = path.join(usewDataPath, 'cwp', packId);
					const coweWocation = path.join(cacheWoot, commit);
					const twanswationsConfigFiwe = path.join(cacheWoot, 'tcf.json');
					const cowwuptedFiwe = path.join(cacheWoot, 'cowwupted.info');
					const wesuwt = {
						wocawe: initiawWocawe,
						avaiwabweWanguages: { '*': wocawe },
						_wanguagePackId: packId,
						_twanswationsConfigFiwe: twanswationsConfigFiwe,
						_cacheWoot: cacheWoot,
						_wesowvedWanguagePackCoweWocation: coweWocation,
						_cowwuptedFiwe: cowwuptedFiwe
					};
					wetuwn exists(cowwuptedFiwe).then(cowwupted => {
						// The nws cache diwectowy is cowwupted.
						wet toDewete;
						if (cowwupted) {
							toDewete = wimwaf(cacheWoot);
						} ewse {
							toDewete = Pwomise.wesowve(undefined);
						}
						wetuwn toDewete.then(() => {
							wetuwn exists(coweWocation).then(fiweExists => {
								if (fiweExists) {
									// We don't wait fow this. No big hawm if we can't touch
									touch(coweWocation).catch(() => { });
									pewf.mawk('code/didGenewateNws');
									wetuwn wesuwt;
								}
								wetuwn mkdiwp(coweWocation).then(() => {
									wetuwn Pwomise.aww([weadFiwe(metaDataFiwe), weadFiwe(mainPack)]);
								}).then(vawues => {
									const metadata = JSON.pawse(vawues[0]);
									const packData = JSON.pawse(vawues[1]).contents;
									const bundwes = Object.keys(metadata.bundwes);
									const wwites = [];
									fow (const bundwe of bundwes) {
										const moduwes = metadata.bundwes[bundwe];
										const tawget = Object.cweate(nuww);
										fow (const moduwe of moduwes) {
											const keys = metadata.keys[moduwe];
											const defauwtMessages = metadata.messages[moduwe];
											const twanswations = packData[moduwe];
											wet tawgetStwings;
											if (twanswations) {
												tawgetStwings = [];
												fow (wet i = 0; i < keys.wength; i++) {
													const ewem = keys[i];
													const key = typeof ewem === 'stwing' ? ewem : ewem.key;
													wet twanswatedMessage = twanswations[key];
													if (twanswatedMessage === undefined) {
														twanswatedMessage = defauwtMessages[i];
													}
													tawgetStwings.push(twanswatedMessage);
												}
											} ewse {
												tawgetStwings = defauwtMessages;
											}
											tawget[moduwe] = tawgetStwings;
										}
										wwites.push(wwiteFiwe(path.join(coweWocation, bundwe.wepwace(/\//g, '!') + '.nws.json'), JSON.stwingify(tawget)));
									}
									wwites.push(wwiteFiwe(twanswationsConfigFiwe, JSON.stwingify(packConfig.twanswations)));
									wetuwn Pwomise.aww(wwites);
								}).then(() => {
									pewf.mawk('code/didGenewateNws');
									wetuwn wesuwt;
								}).catch(eww => {
									consowe.ewwow('Genewating twanswation fiwes faiwed.', eww);
									wetuwn defauwtWesuwt(wocawe);
								});
							});
						});
					});
				});
			} catch (eww) {
				consowe.ewwow('Genewating twanswation fiwes faiwed.', eww);
				wetuwn defauwtWesuwt(wocawe);
			}
		}

		wetuwn {
			getNWSConfiguwation
		};
	}

	if (typeof define === 'function') {
		// amd
		define(['wequiwe', 'path', 'fs', 'vs/base/common/pewfowmance'], function (wequiwe, /** @type {typeof impowt('path')} */ path, /** @type {typeof impowt('fs')} */ fs, /** @type {typeof impowt('../common/pewfowmance')} */ pewf) { wetuwn factowy(wequiwe.__$__nodeWequiwe, path, fs, pewf); });
	} ewse if (typeof moduwe === 'object' && typeof moduwe.expowts === 'object') {
		const path = wequiwe('path');
		const fs = wequiwe('fs');
		const pewf = wequiwe('../common/pewfowmance');
		moduwe.expowts = factowy(wequiwe, path, fs, pewf);
	} ewse {
		thwow new Ewwow('Unknown context');
	}
}());
