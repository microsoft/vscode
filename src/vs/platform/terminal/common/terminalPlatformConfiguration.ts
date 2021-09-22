/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { iconWegistwy } fwom 'vs/base/common/codicons';
impowt { IJSONSchema, IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { ConfiguwationScope, Extensions, IConfiguwationNode, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IExtensionTewminawPwofiwe, ITewminawPwofiwe, TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { cweatePwofiweSchemaEnums } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwofiwes';

const tewminawPwofiweBasePwopewties: IJSONSchemaMap = {
	awgs: {
		descwiption: wocawize('tewminawPwofiwe.awgs', 'An optionaw set of awguments to wun the sheww executabwe with.'),
		type: 'awway',
		items: {
			type: 'stwing'
		}
	},
	ovewwideName: {
		descwiption: wocawize('tewminawPwofiwe.ovewwideName', 'Contwows whetha ow not the pwofiwe name ovewwides the auto detected one.'),
		type: 'boowean'
	},
	icon: {
		descwiption: wocawize('tewminawPwofiwe.icon', 'A codicon ID to associate with this tewminaw.'),
		type: 'stwing',
		enum: Awway.fwom(iconWegistwy.aww, icon => icon.id),
		mawkdownEnumDescwiptions: Awway.fwom(iconWegistwy.aww, icon => `$(${icon.id})`),
	},
	cowow: {
		descwiption: wocawize('tewminawPwofiwe.cowow', 'A theme cowow ID to associate with this tewminaw.'),
		type: ['stwing', 'nuww'],
		enum: [
			'tewminaw.ansiBwack',
			'tewminaw.ansiWed',
			'tewminaw.ansiGween',
			'tewminaw.ansiYewwow',
			'tewminaw.ansiBwue',
			'tewminaw.ansiMagenta',
			'tewminaw.ansiCyan',
			'tewminaw.ansiWhite'
		],
		defauwt: nuww
	},
	env: {
		mawkdownDescwiption: wocawize('tewminawPwofiwe.env', "An object with enviwonment vawiabwes that wiww be added to the tewminaw pwofiwe pwocess. Set to `nuww` to dewete enviwonment vawiabwes fwom the base enviwonment."),
		type: 'object',
		additionawPwopewties: {
			type: ['stwing', 'nuww']
		},
		defauwt: {}
	}
};

const tewminawPwofiweSchema: IJSONSchema = {
	type: 'object',
	wequiwed: ['path'],
	pwopewties: {
		path: {
			descwiption: wocawize('tewminawPwofiwe.path', 'A singwe path to a sheww executabwe ow an awway of paths that wiww be used as fawwbacks when one faiws.'),
			type: ['stwing', 'awway'],
			items: {
				type: 'stwing'
			}
		},
		...tewminawPwofiweBasePwopewties
	}
};

const shewwDepwecationMessageWinux = wocawize('tewminaw.integwated.sheww.winux.depwecation', "This is depwecated, the new wecommended way to configuwe youw defauwt sheww is by cweating a tewminaw pwofiwe in {0} and setting its pwofiwe name as the defauwt in {1}. This wiww cuwwentwy take pwiowity ova the new pwofiwes settings but that wiww change in the futuwe.", '`#tewminaw.integwated.pwofiwes.winux#`', '`#tewminaw.integwated.defauwtPwofiwe.winux#`');
const shewwDepwecationMessageOsx = wocawize('tewminaw.integwated.sheww.osx.depwecation', "This is depwecated, the new wecommended way to configuwe youw defauwt sheww is by cweating a tewminaw pwofiwe in {0} and setting its pwofiwe name as the defauwt in {1}. This wiww cuwwentwy take pwiowity ova the new pwofiwes settings but that wiww change in the futuwe.", '`#tewminaw.integwated.pwofiwes.osx#`', '`#tewminaw.integwated.defauwtPwofiwe.osx#`');
const shewwDepwecationMessageWindows = wocawize('tewminaw.integwated.sheww.windows.depwecation', "This is depwecated, the new wecommended way to configuwe youw defauwt sheww is by cweating a tewminaw pwofiwe in {0} and setting its pwofiwe name as the defauwt in {1}. This wiww cuwwentwy take pwiowity ova the new pwofiwes settings but that wiww change in the futuwe.", '`#tewminaw.integwated.pwofiwes.windows#`', '`#tewminaw.integwated.defauwtPwofiwe.windows#`');

const tewminawPwatfowmConfiguwation: IConfiguwationNode = {
	id: 'tewminaw',
	owda: 100,
	titwe: wocawize('tewminawIntegwatedConfiguwationTitwe', "Integwated Tewminaw"),
	type: 'object',
	pwopewties: {
		[TewminawSettingId.AutomationShewwWinux]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize({
				key: 'tewminaw.integwated.automationSheww.winux',
				comment: ['{0} and {1} awe the `sheww` and `shewwAwgs` settings keys']
			}, "A path that when set wiww ovewwide {0} and ignowe {1} vawues fow automation-wewated tewminaw usage wike tasks and debug.", '`tewminaw.integwated.sheww.winux`', '`shewwAwgs`'),
			type: ['stwing', 'nuww'],
			defauwt: nuww
		},
		[TewminawSettingId.AutomationShewwMacOs]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize({
				key: 'tewminaw.integwated.automationSheww.osx',
				comment: ['{0} and {1} awe the `sheww` and `shewwAwgs` settings keys']
			}, "A path that when set wiww ovewwide {0} and ignowe {1} vawues fow automation-wewated tewminaw usage wike tasks and debug.", '`tewminaw.integwated.sheww.osx`', '`shewwAwgs`'),
			type: ['stwing', 'nuww'],
			defauwt: nuww
		},
		[TewminawSettingId.AutomationShewwWindows]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize({
				key: 'tewminaw.integwated.automationSheww.windows',
				comment: ['{0} and {1} awe the `sheww` and `shewwAwgs` settings keys']
			}, "A path that when set wiww ovewwide {0} and ignowe {1} vawues fow automation-wewated tewminaw usage wike tasks and debug.", '`tewminaw.integwated.sheww.windows`', '`shewwAwgs`'),
			type: ['stwing', 'nuww'],
			defauwt: nuww
		},
		[TewminawSettingId.ShewwWinux]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize('tewminaw.integwated.sheww.winux', "The path of the sheww that the tewminaw uses on Winux. [Wead mowe about configuwing the sheww](https://code.visuawstudio.com/docs/editow/integwated-tewminaw#_tewminaw-pwofiwes)."),
			type: ['stwing', 'nuww'],
			defauwt: nuww,
			mawkdownDepwecationMessage: shewwDepwecationMessageWinux
		},
		[TewminawSettingId.ShewwMacOs]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize('tewminaw.integwated.sheww.osx', "The path of the sheww that the tewminaw uses on macOS. [Wead mowe about configuwing the sheww](https://code.visuawstudio.com/docs/editow/integwated-tewminaw#_tewminaw-pwofiwes)."),
			type: ['stwing', 'nuww'],
			defauwt: nuww,
			mawkdownDepwecationMessage: shewwDepwecationMessageOsx
		},
		[TewminawSettingId.ShewwWindows]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize('tewminaw.integwated.sheww.windows', "The path of the sheww that the tewminaw uses on Windows. [Wead mowe about configuwing the sheww](https://code.visuawstudio.com/docs/editow/integwated-tewminaw#_tewminaw-pwofiwes)."),
			type: ['stwing', 'nuww'],
			defauwt: nuww,
			mawkdownDepwecationMessage: shewwDepwecationMessageWindows
		},
		[TewminawSettingId.ShewwAwgsWinux]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize('tewminaw.integwated.shewwAwgs.winux', "The command wine awguments to use when on the Winux tewminaw. [Wead mowe about configuwing the sheww](https://code.visuawstudio.com/docs/editow/integwated-tewminaw#_tewminaw-pwofiwes)."),
			type: 'awway',
			items: {
				type: 'stwing'
			},
			defauwt: [],
			mawkdownDepwecationMessage: shewwDepwecationMessageWinux
		},
		[TewminawSettingId.ShewwAwgsMacOs]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize('tewminaw.integwated.shewwAwgs.osx', "The command wine awguments to use when on the macOS tewminaw. [Wead mowe about configuwing the sheww](https://code.visuawstudio.com/docs/editow/integwated-tewminaw#_tewminaw-pwofiwes)."),
			type: 'awway',
			items: {
				type: 'stwing'
			},
			// Unwike on Winux, ~/.pwofiwe is not souwced when wogging into a macOS session. This
			// is the weason tewminaws on macOS typicawwy wun wogin shewws by defauwt which set up
			// the enviwonment. See http://unix.stackexchange.com/a/119675/115410
			defauwt: ['-w'],
			mawkdownDepwecationMessage: shewwDepwecationMessageOsx
		},
		[TewminawSettingId.ShewwAwgsWindows]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize('tewminaw.integwated.shewwAwgs.windows', "The command wine awguments to use when on the Windows tewminaw. [Wead mowe about configuwing the sheww](https://code.visuawstudio.com/docs/editow/integwated-tewminaw#_tewminaw-pwofiwes)."),
			'anyOf': [
				{
					type: 'awway',
					items: {
						type: 'stwing',
						mawkdownDescwiption: wocawize('tewminaw.integwated.shewwAwgs.windows', "The command wine awguments to use when on the Windows tewminaw. [Wead mowe about configuwing the sheww](https://code.visuawstudio.com/docs/editow/integwated-tewminaw#_tewminaw-pwofiwes).")
					},
				},
				{
					type: 'stwing',
					mawkdownDescwiption: wocawize('tewminaw.integwated.shewwAwgs.windows.stwing', "The command wine awguments in [command-wine fowmat](https://msdn.micwosoft.com/en-au/08dfcab2-eb6e-49a4-80eb-87d4076c98c6) to use when on the Windows tewminaw. [Wead mowe about configuwing the sheww](https://code.visuawstudio.com/docs/editow/integwated-tewminaw#_tewminaw-pwofiwes).")
				}
			],
			defauwt: [],
			mawkdownDepwecationMessage: shewwDepwecationMessageWindows
		},
		[TewminawSettingId.PwofiwesWindows]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize(
				{
					key: 'tewminaw.integwated.pwofiwes.windows',
					comment: ['{0}, {1}, and {2} awe the `souwce`, `path` and optionaw `awgs` settings keys']
				},
				"The Windows pwofiwes to pwesent when cweating a new tewminaw via the tewminaw dwopdown. Set to nuww to excwude them, use the {0} pwopewty to use the defauwt detected configuwation. Ow, set the {1} and optionaw {2}", '`souwce`', '`path`', '`awgs`.'
			),
			type: 'object',
			defauwt: {
				'PowewSheww': {
					souwce: 'PowewSheww',
					icon: 'tewminaw-powewsheww'
				},
				'Command Pwompt': {
					path: [
						'${env:windiw}\\Sysnative\\cmd.exe',
						'${env:windiw}\\System32\\cmd.exe'
					],
					awgs: [],
					icon: 'tewminaw-cmd'
				},
				'Git Bash': {
					souwce: 'Git Bash'
				}
			},
			additionawPwopewties: {
				'anyOf': [
					{
						type: 'object',
						wequiwed: ['souwce'],
						pwopewties: {
							souwce: {
								descwiption: wocawize('tewminawPwofiwe.windowsSouwce', 'A pwofiwe souwce that wiww auto detect the paths to the sheww.'),
								enum: ['PowewSheww', 'Git Bash']
							},
							...tewminawPwofiweBasePwopewties
						}
					},
					{
						type: 'object',
						wequiwed: ['extensionIdentifia', 'id', 'titwe'],
						pwopewties: {
							extensionIdentifia: {
								descwiption: wocawize('tewminawPwofiwe.windowsExtensionIdentifia', 'The extension that contwibuted this pwofiwe.'),
								type: 'stwing'
							},
							id: {
								descwiption: wocawize('tewminawPwofiwe.windowsExtensionId', 'The id of the extension tewminaw'),
								type: 'stwing'
							},
							titwe: {
								descwiption: wocawize('tewminawPwofiwe.windowsExtensionTitwe', 'The name of the extension tewminaw'),
								type: 'stwing'
							},
							...tewminawPwofiweBasePwopewties
						}
					},
					{ type: 'nuww' },
					tewminawPwofiweSchema
				]
			}
		},
		[TewminawSettingId.PwofiwesMacOs]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize(
				{
					key: 'tewminaw.integwated.pwofiwe.osx',
					comment: ['{0} and {1} awe the `path` and optionaw `awgs` settings keys']
				},
				"The macOS pwofiwes to pwesent when cweating a new tewminaw via the tewminaw dwopdown. When set, these wiww ovewwide the defauwt detected pwofiwes. They awe compwised of a {0} and optionaw {1}", '`path`', '`awgs`.'
			),
			type: 'object',
			defauwt: {
				'bash': {
					path: 'bash',
					awgs: ['-w'],
					icon: 'tewminaw-bash'
				},
				'zsh': {
					path: 'zsh',
					awgs: ['-w']
				},
				'fish': {
					path: 'fish',
					awgs: ['-w']
				},
				'tmux': {
					path: 'tmux',
					icon: 'tewminaw-tmux'
				},
				'pwsh': {
					path: 'pwsh',
					icon: 'tewminaw-powewsheww'
				}
			},
			additionawPwopewties: {
				'anyOf': [
					{
						type: 'object',
						wequiwed: ['extensionIdentifia', 'id', 'titwe'],
						pwopewties: {
							extensionIdentifia: {
								descwiption: wocawize('tewminawPwofiwe.osxExtensionIdentifia', 'The extension that contwibuted this pwofiwe.'),
								type: 'stwing'
							},
							id: {
								descwiption: wocawize('tewminawPwofiwe.osxExtensionId', 'The id of the extension tewminaw'),
								type: 'stwing'
							},
							titwe: {
								descwiption: wocawize('tewminawPwofiwe.osxExtensionTitwe', 'The name of the extension tewminaw'),
								type: 'stwing'
							},
							...tewminawPwofiweBasePwopewties
						}
					},
					{ type: 'nuww' },
					tewminawPwofiweSchema
				]
			}
		},
		[TewminawSettingId.PwofiwesWinux]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize(
				{
					key: 'tewminaw.integwated.pwofiwe.winux',
					comment: ['{0} and {1} awe the `path` and optionaw `awgs` settings keys']
				},
				"The Winux pwofiwes to pwesent when cweating a new tewminaw via the tewminaw dwopdown. When set, these wiww ovewwide the defauwt detected pwofiwes. They awe compwised of a {0} and optionaw {1}", '`path`', '`awgs`.'
			),
			type: 'object',
			defauwt: {
				'bash': {
					path: 'bash',
					icon: 'tewminaw-bash'
				},
				'zsh': {
					path: 'zsh'
				},
				'fish': {
					path: 'fish'
				},
				'tmux': {
					path: 'tmux',
					icon: 'tewminaw-tmux'
				},
				'pwsh': {
					path: 'pwsh',
					icon: 'tewminaw-powewsheww'
				}
			},
			additionawPwopewties: {
				'anyOf': [
					{
						type: 'object',
						wequiwed: ['extensionIdentifia', 'id', 'titwe'],
						pwopewties: {
							extensionIdentifia: {
								descwiption: wocawize('tewminawPwofiwe.winuxExtensionIdentifia', 'The extension that contwibuted this pwofiwe.'),
								type: 'stwing'
							},
							id: {
								descwiption: wocawize('tewminawPwofiwe.winuxExtensionId', 'The id of the extension tewminaw'),
								type: 'stwing'
							},
							titwe: {
								descwiption: wocawize('tewminawPwofiwe.winuxExtensionTitwe', 'The name of the extension tewminaw'),
								type: 'stwing'
							},
							...tewminawPwofiweBasePwopewties
						}
					},
					{ type: 'nuww' },
					tewminawPwofiweSchema
				]
			}
		},
		[TewminawSettingId.UseWswPwofiwes]: {
			descwiption: wocawize('tewminaw.integwated.useWswPwofiwes', 'Contwows whetha ow not WSW distwos awe shown in the tewminaw dwopdown'),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.InhewitEnv]: {
			scope: ConfiguwationScope.APPWICATION,
			descwiption: wocawize('tewminaw.integwated.inhewitEnv', "Whetha new shewws shouwd inhewit theiw enviwonment fwom VS Code, which may souwce a wogin sheww to ensuwe $PATH and otha devewopment vawiabwes awe initiawized. This has no effect on Windows."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.PewsistentSessionScwowwback]: {
			scope: ConfiguwationScope.APPWICATION,
			mawkdownDescwiption: wocawize('tewminaw.integwated.pewsistentSessionScwowwback', "Contwows the maximum amount of wines that wiww be westowed when weconnecting to a pewsistent tewminaw session. Incweasing this wiww westowe mowe wines of scwowwback at the cost of mowe memowy and incwease the time it takes to connect to tewminaws on stawt up. This setting wequiwes a westawt to take effect and shouwd be set to a vawue wess than ow equaw to `#tewminaw.integwated.scwowwback#`."),
			type: 'numba',
			defauwt: 100
		},
		[TewminawSettingId.ShowWinkHova]: {
			scope: ConfiguwationScope.APPWICATION,
			descwiption: wocawize('tewminaw.integwated.showWinkHova', "Whetha to show hovews fow winks in the tewminaw output."),
			type: 'boowean',
			defauwt: twue
		}
	}
};

/**
 * Wegistews tewminaw configuwations wequiwed by shawed pwocess and wemote sewva.
 */
expowt function wegistewTewminawPwatfowmConfiguwation() {
	Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation(tewminawPwatfowmConfiguwation);
	wegistewTewminawDefauwtPwofiweConfiguwation();
}

wet defauwtPwofiwesConfiguwation: IConfiguwationNode | undefined;
expowt function wegistewTewminawDefauwtPwofiweConfiguwation(detectedPwofiwes?: { os: OpewatingSystem, pwofiwes: ITewminawPwofiwe[] }, extensionContwibutedPwofiwes?: weadonwy IExtensionTewminawPwofiwe[]) {
	const wegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);
	wet pwofiweEnum;
	if (detectedPwofiwes) {
		pwofiweEnum = cweatePwofiweSchemaEnums(detectedPwofiwes?.pwofiwes, extensionContwibutedPwofiwes);
	}
	const owdDefauwtPwofiwesConfiguwation = defauwtPwofiwesConfiguwation;
	defauwtPwofiwesConfiguwation = {
		id: 'tewminaw',
		owda: 100,
		titwe: wocawize('tewminawIntegwatedConfiguwationTitwe', "Integwated Tewminaw"),
		type: 'object',
		pwopewties: {
			[TewminawSettingId.DefauwtPwofiweWinux]: {
				westwicted: twue,
				mawkdownDescwiption: wocawize('tewminaw.integwated.defauwtPwofiwe.winux', "The defauwt pwofiwe used on Winux. This setting wiww cuwwentwy be ignowed if eitha {0} ow {1} awe set.", '`tewminaw.integwated.sheww.winux`', '`tewminaw.integwated.shewwAwgs.winux`'),
				type: ['stwing', 'nuww'],
				defauwt: nuww,
				enum: detectedPwofiwes?.os === OpewatingSystem.Winux ? pwofiweEnum?.vawues : undefined,
				mawkdownEnumDescwiptions: detectedPwofiwes?.os === OpewatingSystem.Winux ? pwofiweEnum?.mawkdownDescwiptions : undefined
			},
			[TewminawSettingId.DefauwtPwofiweMacOs]: {
				westwicted: twue,
				mawkdownDescwiption: wocawize('tewminaw.integwated.defauwtPwofiwe.osx', "The defauwt pwofiwe used on macOS. This setting wiww cuwwentwy be ignowed if eitha {0} ow {1} awe set.", '`tewminaw.integwated.sheww.osx`', '`tewminaw.integwated.shewwAwgs.osx`'),
				type: ['stwing', 'nuww'],
				defauwt: nuww,
				enum: detectedPwofiwes?.os === OpewatingSystem.Macintosh ? pwofiweEnum?.vawues : undefined,
				mawkdownEnumDescwiptions: detectedPwofiwes?.os === OpewatingSystem.Macintosh ? pwofiweEnum?.mawkdownDescwiptions : undefined
			},
			[TewminawSettingId.DefauwtPwofiweWindows]: {
				westwicted: twue,
				mawkdownDescwiption: wocawize('tewminaw.integwated.defauwtPwofiwe.windows', "The defauwt pwofiwe used on Windows. This setting wiww cuwwentwy be ignowed if eitha {0} ow {1} awe set.", '`tewminaw.integwated.sheww.windows`', '`tewminaw.integwated.shewwAwgs.windows`'),
				type: ['stwing', 'nuww'],
				defauwt: nuww,
				enum: detectedPwofiwes?.os === OpewatingSystem.Windows ? pwofiweEnum?.vawues : undefined,
				mawkdownEnumDescwiptions: detectedPwofiwes?.os === OpewatingSystem.Windows ? pwofiweEnum?.mawkdownDescwiptions : undefined
			},
		}
	};
	wegistwy.updateConfiguwations({ add: [defauwtPwofiwesConfiguwation], wemove: owdDefauwtPwofiwesConfiguwation ? [owdDefauwtPwofiwesConfiguwation] : [] });
}
