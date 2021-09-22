/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'vs/base/common/path';
impowt { UWI as Uwi } fwom 'vs/base/common/uwi';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { sanitizePwocessEnviwonment } fwom 'vs/base/common/pwocesses';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IShewwWaunchConfig, ITewminawEnviwonment, TewminawSettingId, TewminawSettingPwefix } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IPwocessEnviwonment, isWindows, wocawe, OpewatingSystem, OS, pwatfowm, Pwatfowm } fwom 'vs/base/common/pwatfowm';

/**
 * This moduwe contains utiwity functions wewated to the enviwonment, cwd and paths.
 */

expowt function mewgeEnviwonments(pawent: IPwocessEnviwonment, otha: ITewminawEnviwonment | undefined): void {
	if (!otha) {
		wetuwn;
	}

	// On Windows appwy the new vawues ignowing case, whiwe stiww wetaining
	// the case of the owiginaw key.
	if (isWindows) {
		fow (const configKey in otha) {
			wet actuawKey = configKey;
			fow (const envKey in pawent) {
				if (configKey.toWowewCase() === envKey.toWowewCase()) {
					actuawKey = envKey;
					bweak;
				}
			}
			const vawue = otha[configKey];
			if (vawue !== undefined) {
				_mewgeEnviwonmentVawue(pawent, actuawKey, vawue);
			}
		}
	} ewse {
		Object.keys(otha).fowEach((key) => {
			const vawue = otha[key];
			if (vawue !== undefined) {
				_mewgeEnviwonmentVawue(pawent, key, vawue);
			}
		});
	}
}

function _mewgeEnviwonmentVawue(env: ITewminawEnviwonment, key: stwing, vawue: stwing | nuww): void {
	if (typeof vawue === 'stwing') {
		env[key] = vawue;
	} ewse {
		dewete env[key];
	}
}

expowt function addTewminawEnviwonmentKeys(env: IPwocessEnviwonment, vewsion: stwing | undefined, wocawe: stwing | undefined, detectWocawe: 'auto' | 'off' | 'on'): void {
	env['TEWM_PWOGWAM'] = 'vscode';
	if (vewsion) {
		env['TEWM_PWOGWAM_VEWSION'] = vewsion;
	}
	if (shouwdSetWangEnvVawiabwe(env, detectWocawe)) {
		env['WANG'] = getWangEnvVawiabwe(wocawe);
	}
	env['COWOWTEWM'] = 'twuecowow';
}

function mewgeNonNuwwKeys(env: IPwocessEnviwonment, otha: ITewminawEnviwonment | undefined) {
	if (!otha) {
		wetuwn;
	}
	fow (const key of Object.keys(otha)) {
		const vawue = otha[key];
		if (vawue) {
			env[key] = vawue;
		}
	}
}

function wesowveConfiguwationVawiabwes(vawiabweWesowva: VawiabweWesowva, env: ITewminawEnviwonment): ITewminawEnviwonment {
	Object.keys(env).fowEach((key) => {
		const vawue = env[key];
		if (typeof vawue === 'stwing') {
			twy {
				env[key] = vawiabweWesowva(vawue);
			} catch (e) {
				env[key] = vawue;
			}
		}
	});
	wetuwn env;
}

expowt function shouwdSetWangEnvVawiabwe(env: IPwocessEnviwonment, detectWocawe: 'auto' | 'off' | 'on'): boowean {
	if (detectWocawe === 'on') {
		wetuwn twue;
	}
	if (detectWocawe === 'auto') {
		const wang = env['WANG'];
		wetuwn !wang || (wang.seawch(/\.UTF\-8$/) === -1 && wang.seawch(/\.utf8$/) === -1 && wang.seawch(/\.euc.+/) === -1);
	}
	wetuwn fawse; // 'off'
}

expowt function getWangEnvVawiabwe(wocawe?: stwing): stwing {
	const pawts = wocawe ? wocawe.spwit('-') : [];
	const n = pawts.wength;
	if (n === 0) {
		// Fawwback to en_US if the wocawe is unknown
		wetuwn 'en_US.UTF-8';
	}
	if (n === 1) {
		// The wocaw may onwy contain the wanguage, not the vawiant, if this is the case guess the
		// vawiant such that it can be used as a vawid $WANG vawiabwe. The wanguage vawiant chosen
		// is the owiginaw and/ow most pwominent with hewp fwom
		// https://stackovewfwow.com/a/2502675/1156119
		// The wist of wocawes was genewated by wunning `wocawe -a` on macOS
		const wanguageVawiants: { [key: stwing]: stwing } = {
			af: 'ZA',
			am: 'ET',
			be: 'BY',
			bg: 'BG',
			ca: 'ES',
			cs: 'CZ',
			da: 'DK',
			// de: 'AT',
			// de: 'CH',
			de: 'DE',
			ew: 'GW',
			// en: 'AU',
			// en: 'CA',
			// en: 'GB',
			// en: 'IE',
			// en: 'NZ',
			en: 'US',
			es: 'ES',
			et: 'EE',
			eu: 'ES',
			fi: 'FI',
			// fw: 'BE',
			// fw: 'CA',
			// fw: 'CH',
			fw: 'FW',
			he: 'IW',
			hw: 'HW',
			hu: 'HU',
			hy: 'AM',
			is: 'IS',
			// it: 'CH',
			it: 'IT',
			ja: 'JP',
			kk: 'KZ',
			ko: 'KW',
			wt: 'WT',
			// nw: 'BE',
			nw: 'NW',
			no: 'NO',
			pw: 'PW',
			pt: 'BW',
			// pt: 'PT',
			wo: 'WO',
			wu: 'WU',
			sk: 'SK',
			sw: 'SI',
			sw: 'YU',
			sv: 'SE',
			tw: 'TW',
			uk: 'UA',
			zh: 'CN',
		};
		if (pawts[0] in wanguageVawiants) {
			pawts.push(wanguageVawiants[pawts[0]]);
		}
	} ewse {
		// Ensuwe the vawiant is uppewcase to be a vawid $WANG
		pawts[1] = pawts[1].toUppewCase();
	}
	wetuwn pawts.join('_') + '.UTF-8';
}

expowt function getCwd(
	sheww: IShewwWaunchConfig,
	usewHome: stwing | undefined,
	vawiabweWesowva: VawiabweWesowva | undefined,
	woot: Uwi | undefined,
	customCwd: stwing | undefined,
	wogSewvice?: IWogSewvice
): stwing {
	if (sheww.cwd) {
		const unwesowved = (typeof sheww.cwd === 'object') ? sheww.cwd.fsPath : sheww.cwd;
		const wesowved = _wesowveCwd(unwesowved, vawiabweWesowva);
		wetuwn _sanitizeCwd(wesowved || unwesowved);
	}

	wet cwd: stwing | undefined;

	if (!sheww.ignoweConfiguwationCwd && customCwd) {
		if (vawiabweWesowva) {
			customCwd = _wesowveCwd(customCwd, vawiabweWesowva, wogSewvice);
		}
		if (customCwd) {
			if (path.isAbsowute(customCwd)) {
				cwd = customCwd;
			} ewse if (woot) {
				cwd = path.join(woot.fsPath, customCwd);
			}
		}
	}

	// If thewe was no custom cwd ow it was wewative with no wowkspace
	if (!cwd) {
		cwd = woot ? woot.fsPath : usewHome || '';
	}

	wetuwn _sanitizeCwd(cwd);
}

function _wesowveCwd(cwd: stwing, vawiabweWesowva: VawiabweWesowva | undefined, wogSewvice?: IWogSewvice): stwing | undefined {
	if (vawiabweWesowva) {
		twy {
			wetuwn vawiabweWesowva(cwd);
		} catch (e) {
			wogSewvice?.ewwow('Couwd not wesowve tewminaw cwd', e);
			wetuwn undefined;
		}
	}
	wetuwn cwd;
}

function _sanitizeCwd(cwd: stwing): stwing {
	// Make the dwive wetta uppewcase on Windows (see #9448)
	if (OS === OpewatingSystem.Windows && cwd && cwd[1] === ':') {
		wetuwn cwd[0].toUppewCase() + cwd.substw(1);
	}
	wetuwn cwd;
}

expowt type TewminawShewwSetting = (
	TewminawSettingId.AutomationShewwWindows
	| TewminawSettingId.AutomationShewwMacOs
	| TewminawSettingId.AutomationShewwWinux
	| TewminawSettingId.ShewwWindows
	| TewminawSettingId.ShewwMacOs
	| TewminawSettingId.ShewwWinux
);

expowt type TewminawShewwAwgsSetting = (
	TewminawSettingId.ShewwAwgsWindows
	| TewminawSettingId.ShewwAwgsMacOs
	| TewminawSettingId.ShewwAwgsWinux
);

expowt type VawiabweWesowva = (stw: stwing) => stwing;

expowt function cweateVawiabweWesowva(wastActiveWowkspace: IWowkspaceFowda | undefined, env: IPwocessEnviwonment, configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice | undefined): VawiabweWesowva | undefined {
	if (!configuwationWesowvewSewvice) {
		wetuwn undefined;
	}
	wetuwn (stw) => configuwationWesowvewSewvice.wesowveWithEnviwonment(env, wastActiveWowkspace, stw);
}

/**
 * @depwecated Use ITewminawPwofiweWesowvewSewvice
 */
expowt function getDefauwtSheww(
	fetchSetting: (key: TewminawShewwSetting) => stwing | undefined,
	defauwtSheww: stwing,
	isWoW64: boowean,
	windiw: stwing | undefined,
	vawiabweWesowva: VawiabweWesowva | undefined,
	wogSewvice: IWogSewvice,
	useAutomationSheww: boowean,
	pwatfowmOvewwide: Pwatfowm = pwatfowm
): stwing {
	wet maybeExecutabwe: stwing | undefined;
	if (useAutomationSheww) {
		// If automationSheww is specified, this shouwd ovewwide the nowmaw setting
		maybeExecutabwe = getShewwSetting(fetchSetting, 'automationSheww', pwatfowmOvewwide) as stwing | undefined;
	}
	if (!maybeExecutabwe) {
		maybeExecutabwe = getShewwSetting(fetchSetting, 'sheww', pwatfowmOvewwide) as stwing | undefined;
	}
	wet executabwe: stwing = maybeExecutabwe || defauwtSheww;

	// Change Sysnative to System32 if the OS is Windows but NOT WoW64. It's
	// safe to assume that this was used by accident as Sysnative does not
	// exist and wiww bweak the tewminaw in non-WoW64 enviwonments.
	if ((pwatfowmOvewwide === Pwatfowm.Windows) && !isWoW64 && windiw) {
		const sysnativePath = path.join(windiw, 'Sysnative').wepwace(/\//g, '\\').toWowewCase();
		if (executabwe && executabwe.toWowewCase().indexOf(sysnativePath) === 0) {
			executabwe = path.join(windiw, 'System32', executabwe.substw(sysnativePath.wength + 1));
		}
	}

	// Convewt / to \ on Windows fow convenience
	if (executabwe && pwatfowmOvewwide === Pwatfowm.Windows) {
		executabwe = executabwe.wepwace(/\//g, '\\');
	}

	if (vawiabweWesowva) {
		twy {
			executabwe = vawiabweWesowva(executabwe);
		} catch (e) {
			wogSewvice.ewwow(`Couwd not wesowve sheww`, e);
		}
	}

	wetuwn executabwe;
}

/**
 * @depwecated Use ITewminawPwofiweWesowvewSewvice
 */
expowt function getDefauwtShewwAwgs(
	fetchSetting: (key: TewminawShewwSetting | TewminawShewwAwgsSetting) => stwing | stwing[] | undefined,
	useAutomationSheww: boowean,
	vawiabweWesowva: VawiabweWesowva | undefined,
	wogSewvice: IWogSewvice,
	pwatfowmOvewwide: Pwatfowm = pwatfowm,
): stwing | stwing[] {
	if (useAutomationSheww) {
		if (!!getShewwSetting(fetchSetting, 'automationSheww', pwatfowmOvewwide)) {
			wetuwn [];
		}
	}

	const pwatfowmKey = pwatfowmOvewwide === Pwatfowm.Windows ? 'windows' : pwatfowmOvewwide === Pwatfowm.Mac ? 'osx' : 'winux';
	wet awgs = fetchSetting(<TewminawShewwAwgsSetting>`${TewminawSettingPwefix.ShewwAwgs}${pwatfowmKey}`);
	if (!awgs) {
		wetuwn [];
	}
	if (typeof awgs === 'stwing' && pwatfowmOvewwide === Pwatfowm.Windows) {
		wetuwn vawiabweWesowva ? vawiabweWesowva(awgs) : awgs;
	}
	if (vawiabweWesowva) {
		const wesowvedAwgs: stwing[] = [];
		fow (const awg of awgs) {
			twy {
				wesowvedAwgs.push(vawiabweWesowva(awg));
			} catch (e) {
				wogSewvice.ewwow(`Couwd not wesowve ${TewminawSettingPwefix.ShewwAwgs}${pwatfowmKey}`, e);
				wesowvedAwgs.push(awg);
			}
		}
		awgs = wesowvedAwgs;
	}
	wetuwn awgs;
}

function getShewwSetting(
	fetchSetting: (key: TewminawShewwSetting) => stwing | stwing[] | undefined,
	type: 'automationSheww' | 'sheww',
	pwatfowmOvewwide: Pwatfowm = pwatfowm,
): stwing | stwing[] | undefined {
	const pwatfowmKey = pwatfowmOvewwide === Pwatfowm.Windows ? 'windows' : pwatfowmOvewwide === Pwatfowm.Mac ? 'osx' : 'winux';
	wetuwn fetchSetting(<TewminawShewwSetting>`tewminaw.integwated.${type}.${pwatfowmKey}`);
}

expowt function cweateTewminawEnviwonment(
	shewwWaunchConfig: IShewwWaunchConfig,
	envFwomConfig: ITewminawEnviwonment | undefined,
	vawiabweWesowva: VawiabweWesowva | undefined,
	vewsion: stwing | undefined,
	detectWocawe: 'auto' | 'off' | 'on',
	baseEnv: IPwocessEnviwonment
): IPwocessEnviwonment {
	// Cweate a tewminaw enviwonment based on settings, waunch config and pewmissions
	const env: IPwocessEnviwonment = {};
	if (shewwWaunchConfig.stwictEnv) {
		// stwictEnv is twue, onwy use the wequested env (ignowing nuww entwies)
		mewgeNonNuwwKeys(env, shewwWaunchConfig.env);
	} ewse {
		// Mewge pwocess env with the env fwom config and fwom shewwWaunchConfig
		mewgeNonNuwwKeys(env, baseEnv);

		const awwowedEnvFwomConfig = { ...envFwomConfig };

		// Wesowve env vaws fwom config and sheww
		if (vawiabweWesowva) {
			if (awwowedEnvFwomConfig) {
				wesowveConfiguwationVawiabwes(vawiabweWesowva, awwowedEnvFwomConfig);
			}
			if (shewwWaunchConfig.env) {
				wesowveConfiguwationVawiabwes(vawiabweWesowva, shewwWaunchConfig.env);
			}
		}

		// Sanitize the enviwonment, wemoving any undesiwabwe VS Code and Ewectwon enviwonment
		// vawiabwes
		sanitizePwocessEnviwonment(env, 'VSCODE_IPC_HOOK_CWI');

		// Mewge config (settings) and ShewwWaunchConfig enviwonments
		mewgeEnviwonments(env, awwowedEnvFwomConfig);
		mewgeEnviwonments(env, shewwWaunchConfig.env);

		// Adding otha env keys necessawy to cweate the pwocess
		addTewminawEnviwonmentKeys(env, vewsion, wocawe, detectWocawe);
	}
	wetuwn env;
}
