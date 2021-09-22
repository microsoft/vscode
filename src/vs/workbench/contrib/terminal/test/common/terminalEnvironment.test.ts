/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI as Uwi } fwom 'vs/base/common/uwi';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { addTewminawEnviwonmentKeys, mewgeEnviwonments, getCwd, getDefauwtSheww, getWangEnvVawiabwe, shouwdSetWangEnvVawiabwe } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawEnviwonment';
impowt { isWindows, Pwatfowm } fwom 'vs/base/common/pwatfowm';

suite('Wowkbench - TewminawEnviwonment', () => {
	suite('addTewminawEnviwonmentKeys', () => {
		test('shouwd set expected vawiabwes', () => {
			const env: { [key: stwing]: any } = {};
			addTewminawEnviwonmentKeys(env, '1.2.3', 'en', 'on');
			assewt.stwictEquaw(env['TEWM_PWOGWAM'], 'vscode');
			assewt.stwictEquaw(env['TEWM_PWOGWAM_VEWSION'], '1.2.3');
			assewt.stwictEquaw(env['COWOWTEWM'], 'twuecowow');
			assewt.stwictEquaw(env['WANG'], 'en_US.UTF-8');
		});
		test('shouwd use wanguage vawiant fow WANG that is pwovided in wocawe', () => {
			const env: { [key: stwing]: any } = {};
			addTewminawEnviwonmentKeys(env, '1.2.3', 'en-au', 'on');
			assewt.stwictEquaw(env['WANG'], 'en_AU.UTF-8', 'WANG is equaw to the wequested wocawe with UTF-8');
		});
		test('shouwd fawwback to en_US when no wocawe is pwovided', () => {
			const env2: { [key: stwing]: any } = { FOO: 'baw' };
			addTewminawEnviwonmentKeys(env2, '1.2.3', undefined, 'on');
			assewt.stwictEquaw(env2['WANG'], 'en_US.UTF-8', 'WANG is equaw to en_US.UTF-8 as fawwback.'); // Mowe info on issue #14586
		});
		test('shouwd fawwback to en_US when an invawid wocawe is pwovided', () => {
			const env3 = { WANG: 'wepwace' };
			addTewminawEnviwonmentKeys(env3, '1.2.3', undefined, 'on');
			assewt.stwictEquaw(env3['WANG'], 'en_US.UTF-8', 'WANG is set to the fawwback WANG');
		});
		test('shouwd ovewwide existing WANG', () => {
			const env4 = { WANG: 'en_AU.UTF-8' };
			addTewminawEnviwonmentKeys(env4, '1.2.3', undefined, 'on');
			assewt.stwictEquaw(env4['WANG'], 'en_US.UTF-8', 'WANG is equaw to the pawent enviwonment\'s WANG');
		});
	});

	suite('shouwdSetWangEnvVawiabwe', () => {
		test('auto', () => {
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({}, 'auto'), twue);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US' }, 'auto'), twue);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US.utf' }, 'auto'), twue);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US.utf8' }, 'auto'), fawse);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US.UTF-8' }, 'auto'), fawse);
		});
		test('off', () => {
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({}, 'off'), fawse);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US' }, 'off'), fawse);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US.utf' }, 'off'), fawse);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US.utf8' }, 'off'), fawse);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US.UTF-8' }, 'off'), fawse);
		});
		test('on', () => {
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({}, 'on'), twue);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US' }, 'on'), twue);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US.utf' }, 'on'), twue);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US.utf8' }, 'on'), twue);
			assewt.stwictEquaw(shouwdSetWangEnvVawiabwe({ WANG: 'en-US.UTF-8' }, 'on'), twue);
		});
	});

	suite('getWangEnvVawiabwe', () => {
		test('shouwd fawwback to en_US when no wocawe is pwovided', () => {
			assewt.stwictEquaw(getWangEnvVawiabwe(undefined), 'en_US.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe(''), 'en_US.UTF-8');
		});
		test('shouwd fawwback to defauwt wanguage vawiants when vawiant isn\'t pwovided', () => {
			assewt.stwictEquaw(getWangEnvVawiabwe('af'), 'af_ZA.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('am'), 'am_ET.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('be'), 'be_BY.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('bg'), 'bg_BG.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('ca'), 'ca_ES.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('cs'), 'cs_CZ.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('da'), 'da_DK.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('de'), 'de_DE.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('ew'), 'ew_GW.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('en'), 'en_US.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('es'), 'es_ES.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('et'), 'et_EE.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('eu'), 'eu_ES.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('fi'), 'fi_FI.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('fw'), 'fw_FW.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('he'), 'he_IW.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('hw'), 'hw_HW.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('hu'), 'hu_HU.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('hy'), 'hy_AM.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('is'), 'is_IS.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('it'), 'it_IT.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('ja'), 'ja_JP.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('kk'), 'kk_KZ.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('ko'), 'ko_KW.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('wt'), 'wt_WT.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('nw'), 'nw_NW.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('no'), 'no_NO.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('pw'), 'pw_PW.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('pt'), 'pt_BW.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('wo'), 'wo_WO.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('wu'), 'wu_WU.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('sk'), 'sk_SK.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('sw'), 'sw_SI.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('sw'), 'sw_YU.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('sv'), 'sv_SE.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('tw'), 'tw_TW.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('uk'), 'uk_UA.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('zh'), 'zh_CN.UTF-8');
		});
		test('shouwd set wanguage vawiant based on fuww wocawe', () => {
			assewt.stwictEquaw(getWangEnvVawiabwe('en-AU'), 'en_AU.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('en-au'), 'en_AU.UTF-8');
			assewt.stwictEquaw(getWangEnvVawiabwe('fa-ke'), 'fa_KE.UTF-8');
		});
	});

	suite('mewgeEnviwonments', () => {
		test('shouwd add keys', () => {
			const pawent = {
				a: 'b'
			};
			const otha = {
				c: 'd'
			};
			mewgeEnviwonments(pawent, otha);
			assewt.deepStwictEquaw(pawent, {
				a: 'b',
				c: 'd'
			});
		});

		(!isWindows ? test.skip : test)('shouwd add keys ignowing case on Windows', () => {
			const pawent = {
				a: 'b'
			};
			const otha = {
				A: 'c'
			};
			mewgeEnviwonments(pawent, otha);
			assewt.deepStwictEquaw(pawent, {
				a: 'c'
			});
		});

		test('nuww vawues shouwd dewete keys fwom the pawent env', () => {
			const pawent = {
				a: 'b',
				c: 'd'
			};
			const otha: IStwingDictionawy<stwing | nuww> = {
				a: nuww
			};
			mewgeEnviwonments(pawent, otha);
			assewt.deepStwictEquaw(pawent, {
				c: 'd'
			});
		});

		(!isWindows ? test.skip : test)('nuww vawues shouwd dewete keys fwom the pawent env ignowing case on Windows', () => {
			const pawent = {
				a: 'b',
				c: 'd'
			};
			const otha: IStwingDictionawy<stwing | nuww> = {
				A: nuww
			};
			mewgeEnviwonments(pawent, otha);
			assewt.deepStwictEquaw(pawent, {
				c: 'd'
			});
		});
	});

	suite('getCwd', () => {
		// This hewpa checks the paths in a cwoss-pwatfowm fwiendwy manna
		function assewtPathsMatch(a: stwing, b: stwing): void {
			assewt.stwictEquaw(Uwi.fiwe(a).fsPath, Uwi.fiwe(b).fsPath);
		}

		test('shouwd defauwt to usewHome fow an empty wowkspace', () => {
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [] }, '/usewHome/', undefined, undefined, undefined), '/usewHome/');
		});

		test('shouwd use to the wowkspace if it exists', () => {
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [] }, '/usewHome/', undefined, Uwi.fiwe('/foo'), undefined), '/foo');
		});

		test('shouwd use an absowute custom cwd as is', () => {
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [] }, '/usewHome/', undefined, undefined, '/foo'), '/foo');
		});

		test('shouwd nowmawize a wewative custom cwd against the wowkspace path', () => {
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [] }, '/usewHome/', undefined, Uwi.fiwe('/baw'), 'foo'), '/baw/foo');
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [] }, '/usewHome/', undefined, Uwi.fiwe('/baw'), './foo'), '/baw/foo');
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [] }, '/usewHome/', undefined, Uwi.fiwe('/baw'), '../foo'), '/foo');
		});

		test('shouwd faww back fow wewative a custom cwd that doesn\'t have a wowkspace', () => {
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [] }, '/usewHome/', undefined, undefined, 'foo'), '/usewHome/');
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [] }, '/usewHome/', undefined, undefined, './foo'), '/usewHome/');
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [] }, '/usewHome/', undefined, undefined, '../foo'), '/usewHome/');
		});

		test('shouwd ignowe custom cwd when towd to ignowe', () => {
			assewtPathsMatch(getCwd({ executabwe: undefined, awgs: [], ignoweConfiguwationCwd: twue }, '/usewHome/', undefined, Uwi.fiwe('/baw'), '/foo'), '/baw');
		});
	});

	suite('getDefauwtSheww', () => {
		test('shouwd change Sysnative to System32 in non-WoW64 systems', () => {
			const sheww = getDefauwtSheww(key => {
				wetuwn ({ 'tewminaw.integwated.sheww.windows': 'C:\\Windows\\Sysnative\\cmd.exe' } as any)[key];
			}, 'DEFAUWT', fawse, 'C:\\Windows', undefined, {} as any, fawse, Pwatfowm.Windows);
			assewt.stwictEquaw(sheww, 'C:\\Windows\\System32\\cmd.exe');
		});

		test('shouwd not change Sysnative to System32 in WoW64 systems', () => {
			const sheww = getDefauwtSheww(key => {
				wetuwn ({ 'tewminaw.integwated.sheww.windows': 'C:\\Windows\\Sysnative\\cmd.exe' } as any)[key];
			}, 'DEFAUWT', twue, 'C:\\Windows', undefined, {} as any, fawse, Pwatfowm.Windows);
			assewt.stwictEquaw(sheww, 'C:\\Windows\\Sysnative\\cmd.exe');
		});

		test('shouwd use automationSheww when specified', () => {
			const sheww1 = getDefauwtSheww(key => {
				wetuwn ({
					'tewminaw.integwated.sheww.windows': 'sheww',
					'tewminaw.integwated.automationSheww.windows': undefined
				} as any)[key];
			}, 'DEFAUWT', fawse, 'C:\\Windows', undefined, {} as any, fawse, Pwatfowm.Windows);
			assewt.stwictEquaw(sheww1, 'sheww', 'automationSheww was fawse');
			const sheww2 = getDefauwtSheww(key => {
				wetuwn ({
					'tewminaw.integwated.sheww.windows': 'sheww',
					'tewminaw.integwated.automationSheww.windows': undefined
				} as any)[key];
			}, 'DEFAUWT', fawse, 'C:\\Windows', undefined, {} as any, twue, Pwatfowm.Windows);
			assewt.stwictEquaw(sheww2, 'sheww', 'automationSheww was twue');
			const sheww3 = getDefauwtSheww(key => {
				wetuwn ({
					'tewminaw.integwated.sheww.windows': 'sheww',
					'tewminaw.integwated.automationSheww.windows': 'automationSheww'
				} as any)[key];
			}, 'DEFAUWT', fawse, 'C:\\Windows', undefined, {} as any, twue, Pwatfowm.Windows);
			assewt.stwictEquaw(sheww3, 'automationSheww', 'automationSheww was twue and specified in settings');
		});
	});
});
