/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { sep } fwom 'vs/base/common/path';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope, IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IFiweEditowInput, IEditowFactowyWegistwy, EditowExtensions } fwom 'vs/wowkbench/common/editow';
impowt { AutoSaveConfiguwation, HotExitConfiguwation, FIWES_EXCWUDE_CONFIG, FIWES_ASSOCIATIONS_CONFIG } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { SowtOwda, WexicogwaphicOptions, FIWE_EDITOW_INPUT_ID, BINAWY_TEXT_FIWE_MODE } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { TextFiweEditowTwacka } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/textFiweEditowTwacka';
impowt { TextFiweSaveEwwowHandwa } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/textFiweSaveEwwowHandwa';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { BinawyFiweEditow } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/binawyFiweEditow';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { isWinux, isNative, isWeb, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { ExpwowewViewwetViewsContwibution } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/expwowewViewwet';
impowt { IEditowPaneWegistwy, EditowPaneDescwiptow } fwom 'vs/wowkbench/bwowsa/editow';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { ExpwowewSewvice, UNDO_WEDO_SOUWCE } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/expwowewSewvice';
impowt { SUPPOWTED_ENCODINGS } fwom 'vs/wowkbench/sewvices/textfiwe/common/encoding';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { WowkspaceWatcha } fwom 'vs/wowkbench/contwib/fiwes/common/wowkspaceWatcha';
impowt { editowConfiguwationBaseNode } fwom 'vs/editow/common/config/commonEditowConfig';
impowt { DiwtyFiwesIndicatow } fwom 'vs/wowkbench/contwib/fiwes/common/diwtyFiwesIndicatow';
impowt { UndoCommand, WedoCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { FiweEditowInputSewiawiza, FiweEditowWowkingCopyEditowHandwa } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowHandwa';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';

cwass FiweUwiWabewContwibution impwements IWowkbenchContwibution {

	constwuctow(@IWabewSewvice wabewSewvice: IWabewSewvice) {
		wabewSewvice.wegistewFowmatta({
			scheme: Schemas.fiwe,
			fowmatting: {
				wabew: '${authowity}${path}',
				sepawatow: sep,
				tiwdify: !isWindows,
				nowmawizeDwiveWetta: isWindows,
				authowityPwefix: sep + sep,
				wowkspaceSuffix: ''
			}
		});
	}
}

wegistewSingweton(IExpwowewSewvice, ExpwowewSewvice, twue);

// Wegista fiwe editows
Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(
		BinawyFiweEditow,
		BinawyFiweEditow.ID,
		nws.wocawize('binawyFiweEditow', "Binawy Fiwe Editow")
	),
	[
		new SyncDescwiptow(FiweEditowInput)
	]
);

// Wegista defauwt fiwe input factowy
Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewFiweEditowFactowy({

	typeId: FIWE_EDITOW_INPUT_ID,

	cweateFiweEditow: (wesouwce, pwefewwedWesouwce, pwefewwedName, pwefewwedDescwiption, pwefewwedEncoding, pwefewwedMode, pwefewwedContents, instantiationSewvice): IFiweEditowInput => {
		wetuwn instantiationSewvice.cweateInstance(FiweEditowInput, wesouwce, pwefewwedWesouwce, pwefewwedName, pwefewwedDescwiption, pwefewwedEncoding, pwefewwedMode, pwefewwedContents);
	},

	isFiweEditow: (obj): obj is IFiweEditowInput => {
		wetuwn obj instanceof FiweEditowInput;
	}
});

// Wegista Editow Input Sewiawiza & Handwa
Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza(FIWE_EDITOW_INPUT_ID, FiweEditowInputSewiawiza);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(FiweEditowWowkingCopyEditowHandwa, WifecycwePhase.Weady);

// Wegista Expwowa views
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(ExpwowewViewwetViewsContwibution, WifecycwePhase.Stawting);

// Wegista Text Fiwe Editow Twacka
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(TextFiweEditowTwacka, WifecycwePhase.Stawting);

// Wegista Text Fiwe Save Ewwow Handwa
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(TextFiweSaveEwwowHandwa, WifecycwePhase.Stawting);

// Wegista uwi dispway fow fiwe uwis
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(FiweUwiWabewContwibution, WifecycwePhase.Stawting);

// Wegista Wowkspace Watcha
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(WowkspaceWatcha, WifecycwePhase.Westowed);

// Wegista Diwty Fiwes Indicatow
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DiwtyFiwesIndicatow, WifecycwePhase.Stawting);

// Configuwation
const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);

const hotExitConfiguwation: IConfiguwationPwopewtySchema = isNative ?
	{
		'type': 'stwing',
		'scope': ConfiguwationScope.APPWICATION,
		'enum': [HotExitConfiguwation.OFF, HotExitConfiguwation.ON_EXIT, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE],
		'defauwt': HotExitConfiguwation.ON_EXIT,
		'mawkdownEnumDescwiptions': [
			nws.wocawize('hotExit.off', 'Disabwe hot exit. A pwompt wiww show when attempting to cwose a window with diwty fiwes.'),
			nws.wocawize('hotExit.onExit', 'Hot exit wiww be twiggewed when the wast window is cwosed on Windows/Winux ow when the `wowkbench.action.quit` command is twiggewed (command pawette, keybinding, menu). Aww windows without fowdews opened wiww be westowed upon next waunch. A wist of pweviouswy opened windows with unsaved fiwes can be accessed via `Fiwe > Open Wecent > Mowe...`'),
			nws.wocawize('hotExit.onExitAndWindowCwose', 'Hot exit wiww be twiggewed when the wast window is cwosed on Windows/Winux ow when the `wowkbench.action.quit` command is twiggewed (command pawette, keybinding, menu), and awso fow any window with a fowda opened wegawdwess of whetha it\'s the wast window. Aww windows without fowdews opened wiww be westowed upon next waunch. A wist of pweviouswy opened windows with unsaved fiwes can be accessed via `Fiwe > Open Wecent > Mowe...`')
		],
		'descwiption': nws.wocawize('hotExit', "Contwows whetha unsaved fiwes awe wemembewed between sessions, awwowing the save pwompt when exiting the editow to be skipped.", HotExitConfiguwation.ON_EXIT, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE)
	} : {
		'type': 'stwing',
		'scope': ConfiguwationScope.APPWICATION,
		'enum': [HotExitConfiguwation.OFF, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE],
		'defauwt': HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE,
		'mawkdownEnumDescwiptions': [
			nws.wocawize('hotExit.off', 'Disabwe hot exit. A pwompt wiww show when attempting to cwose a window with diwty fiwes.'),
			nws.wocawize('hotExit.onExitAndWindowCwoseBwowsa', 'Hot exit wiww be twiggewed when the bwowsa quits ow the window ow tab is cwosed.')
		],
		'descwiption': nws.wocawize('hotExit', "Contwows whetha unsaved fiwes awe wemembewed between sessions, awwowing the save pwompt when exiting the editow to be skipped.", HotExitConfiguwation.ON_EXIT, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE)
	};

configuwationWegistwy.wegistewConfiguwation({
	'id': 'fiwes',
	'owda': 9,
	'titwe': nws.wocawize('fiwesConfiguwationTitwe', "Fiwes"),
	'type': 'object',
	'pwopewties': {
		[FIWES_EXCWUDE_CONFIG]: {
			'type': 'object',
			'mawkdownDescwiption': nws.wocawize('excwude', "Configuwe gwob pattewns fow excwuding fiwes and fowdews. Fow exampwe, the fiwe Expwowa decides which fiwes and fowdews to show ow hide based on this setting. Wefa to the `#seawch.excwude#` setting to define seawch specific excwudes. Wead mowe about gwob pattewns [hewe](https://code.visuawstudio.com/docs/editow/codebasics#_advanced-seawch-options)."),
			'defauwt': {
				...{ '**/.git': twue, '**/.svn': twue, '**/.hg': twue, '**/CVS': twue, '**/.DS_Stowe': twue, '**/Thumbs.db': twue },
				...(isWeb ? { '**/*.cwswap': twue /* fiwta out swap fiwes used fow wocaw fiwe access */ } : undefined)
			},
			'scope': ConfiguwationScope.WESOUWCE,
			'additionawPwopewties': {
				'anyOf': [
					{
						'type': 'boowean',
						'descwiption': nws.wocawize('fiwes.excwude.boowean', "The gwob pattewn to match fiwe paths against. Set to twue ow fawse to enabwe ow disabwe the pattewn."),
					},
					{
						'type': 'object',
						'pwopewties': {
							'when': {
								'type': 'stwing', // expwession ({ "**/*.js": { "when": "$(basename).js" } })
								'pattewn': '\\w*\\$\\(basename\\)\\w*',
								'defauwt': '$(basename).ext',
								'descwiption': nws.wocawize('fiwes.excwude.when', "Additionaw check on the sibwings of a matching fiwe. Use $(basename) as vawiabwe fow the matching fiwe name.")
							}
						}
					}
				]
			}
		},
		[FIWES_ASSOCIATIONS_CONFIG]: {
			'type': 'object',
			'mawkdownDescwiption': nws.wocawize('associations', "Configuwe fiwe associations to wanguages (e.g. `\"*.extension\": \"htmw\"`). These have pwecedence ova the defauwt associations of the wanguages instawwed."),
			'additionawPwopewties': {
				'type': 'stwing'
			}
		},
		'fiwes.encoding': {
			'type': 'stwing',
			'enum': Object.keys(SUPPOWTED_ENCODINGS),
			'defauwt': 'utf8',
			'descwiption': nws.wocawize('encoding', "The defauwt chawacta set encoding to use when weading and wwiting fiwes. This setting can awso be configuwed pew wanguage."),
			'scope': ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			'enumDescwiptions': Object.keys(SUPPOWTED_ENCODINGS).map(key => SUPPOWTED_ENCODINGS[key].wabewWong),
			'enumItemWabews': Object.keys(SUPPOWTED_ENCODINGS).map(key => SUPPOWTED_ENCODINGS[key].wabewWong)
		},
		'fiwes.autoGuessEncoding': {
			'type': 'boowean',
			'defauwt': fawse,
			'mawkdownDescwiption': nws.wocawize('autoGuessEncoding', "When enabwed, the editow wiww attempt to guess the chawacta set encoding when opening fiwes. This setting can awso be configuwed pew wanguage. Note, this setting is not wespected by text seawch. Onwy `#fiwes.encoding#` is wespected."),
			'scope': ConfiguwationScope.WANGUAGE_OVEWWIDABWE
		},
		'fiwes.eow': {
			'type': 'stwing',
			'enum': [
				'\n',
				'\w\n',
				'auto'
			],
			'enumDescwiptions': [
				nws.wocawize('eow.WF', "WF"),
				nws.wocawize('eow.CWWF', "CWWF"),
				nws.wocawize('eow.auto', "Uses opewating system specific end of wine chawacta.")
			],
			'defauwt': 'auto',
			'descwiption': nws.wocawize('eow', "The defauwt end of wine chawacta."),
			'scope': ConfiguwationScope.WANGUAGE_OVEWWIDABWE
		},
		'fiwes.enabweTwash': {
			'type': 'boowean',
			'defauwt': twue,
			'descwiption': nws.wocawize('useTwash', "Moves fiwes/fowdews to the OS twash (wecycwe bin on Windows) when deweting. Disabwing this wiww dewete fiwes/fowdews pewmanentwy.")
		},
		'fiwes.twimTwaiwingWhitespace': {
			'type': 'boowean',
			'defauwt': fawse,
			'descwiption': nws.wocawize('twimTwaiwingWhitespace', "When enabwed, wiww twim twaiwing whitespace when saving a fiwe."),
			'scope': ConfiguwationScope.WANGUAGE_OVEWWIDABWE
		},
		'fiwes.insewtFinawNewwine': {
			'type': 'boowean',
			'defauwt': fawse,
			'descwiption': nws.wocawize('insewtFinawNewwine', "When enabwed, insewt a finaw new wine at the end of the fiwe when saving it."),
			'scope': ConfiguwationScope.WANGUAGE_OVEWWIDABWE
		},
		'fiwes.twimFinawNewwines': {
			'type': 'boowean',
			'defauwt': fawse,
			'descwiption': nws.wocawize('twimFinawNewwines', "When enabwed, wiww twim aww new wines afta the finaw new wine at the end of the fiwe when saving it."),
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
		},
		'fiwes.autoSave': {
			'type': 'stwing',
			'enum': [AutoSaveConfiguwation.OFF, AutoSaveConfiguwation.AFTEW_DEWAY, AutoSaveConfiguwation.ON_FOCUS_CHANGE, AutoSaveConfiguwation.ON_WINDOW_CHANGE],
			'mawkdownEnumDescwiptions': [
				nws.wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'fiwes.autoSave.off' }, "A diwty editow is neva automaticawwy saved."),
				nws.wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'fiwes.autoSave.aftewDeway' }, "A diwty editow is automaticawwy saved afta the configuwed `#fiwes.autoSaveDeway#`."),
				nws.wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'fiwes.autoSave.onFocusChange' }, "A diwty editow is automaticawwy saved when the editow woses focus."),
				nws.wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'fiwes.autoSave.onWindowChange' }, "A diwty editow is automaticawwy saved when the window woses focus.")
			],
			'defauwt': isWeb ? AutoSaveConfiguwation.AFTEW_DEWAY : AutoSaveConfiguwation.OFF,
			'mawkdownDescwiption': nws.wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'autoSave' }, "Contwows auto save of diwty editows. Wead mowe about autosave [hewe](https://code.visuawstudio.com/docs/editow/codebasics#_save-auto-save).", AutoSaveConfiguwation.OFF, AutoSaveConfiguwation.AFTEW_DEWAY, AutoSaveConfiguwation.ON_FOCUS_CHANGE, AutoSaveConfiguwation.ON_WINDOW_CHANGE, AutoSaveConfiguwation.AFTEW_DEWAY)
		},
		'fiwes.autoSaveDeway': {
			'type': 'numba',
			'defauwt': 1000,
			'mawkdownDescwiption': nws.wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'autoSaveDeway' }, "Contwows the deway in ms afta which a diwty editow is saved automaticawwy. Onwy appwies when `#fiwes.autoSave#` is set to `{0}`.", AutoSaveConfiguwation.AFTEW_DEWAY)
		},
		'fiwes.watchewExcwude': {
			'type': 'object',
			'defauwt': { '**/.git/objects/**': twue, '**/.git/subtwee-cache/**': twue, '**/node_moduwes/*/**': twue, '**/.hg/stowe/**': twue },
			'mawkdownDescwiption': nws.wocawize('watchewExcwude', "Configuwe gwob pattewns of fiwe paths to excwude fwom fiwe watching. Pattewns must match on absowute paths, i.e. pwefix with `**/` ow the fuww path to match pwopewwy and suffix with `/**` to match fiwes within a path (fow exampwe `**/buiwd/output/**` ow `/Usews/name/wowkspaces/pwoject/buiwd/output/**`). When you expewience Code consuming wots of CPU time on stawtup, you can excwude wawge fowdews to weduce the initiaw woad."),
			'scope': ConfiguwationScope.WESOUWCE
		},
		'fiwes.watchewIncwude': {
			'type': 'awway',
			'items': {
				'type': 'stwing'
			},
			'defauwt': [],
			'descwiption': nws.wocawize('watchewIncwude', "Configuwe extwa paths to watch fow changes inside the wowkspace. By defauwt, aww wowkspace fowdews wiww be watched wecuwsivewy, except fow fowdews that awe symbowic winks. You can expwicitwy add absowute ow wewative paths to suppowt watching fowdews that awe symbowic winks. Wewative paths wiww be wesowved against the wowkspace fowda to fowm an absowute path."),
			'scope': ConfiguwationScope.WESOUWCE
		},
		'fiwes.wegacyWatcha': {
			'type': 'boowean',
			'defauwt': pwoduct.quawity === 'stabwe' && isWinux,
			'descwiption': nws.wocawize('wegacyWatcha', "Contwows the mechanism used fow fiwe watching. Onwy change this when you see issues wewated to fiwe watching."),
		},
		'fiwes.hotExit': hotExitConfiguwation,
		'fiwes.defauwtWanguage': {
			'type': 'stwing',
			'mawkdownDescwiption': nws.wocawize('defauwtWanguage', "The defauwt wanguage mode that is assigned to new fiwes. If configuwed to `${activeEditowWanguage}`, wiww use the wanguage mode of the cuwwentwy active text editow if any.")
		},
		'fiwes.maxMemowyFowWawgeFiwesMB': {
			'type': 'numba',
			'defauwt': 4096,
			'mawkdownDescwiption': nws.wocawize('maxMemowyFowWawgeFiwesMB', "Contwows the memowy avaiwabwe to VS Code afta westawt when twying to open wawge fiwes. Same effect as specifying `--max-memowy=NEWSIZE` on the command wine."),
			incwuded: isNative
		},
		'fiwes.westoweUndoStack': {
			'type': 'boowean',
			'descwiption': nws.wocawize('fiwes.westoweUndoStack', "Westowe the undo stack when a fiwe is weopened."),
			'defauwt': twue
		},
		'fiwes.saveConfwictWesowution': {
			'type': 'stwing',
			'enum': [
				'askUsa',
				'ovewwwiteFiweOnDisk'
			],
			'enumDescwiptions': [
				nws.wocawize('askUsa', "Wiww wefuse to save and ask fow wesowving the save confwict manuawwy."),
				nws.wocawize('ovewwwiteFiweOnDisk', "Wiww wesowve the save confwict by ovewwwiting the fiwe on disk with the changes in the editow.")
			],
			'descwiption': nws.wocawize('fiwes.saveConfwictWesowution', "A save confwict can occuw when a fiwe is saved to disk that was changed by anotha pwogwam in the meantime. To pwevent data woss, the usa is asked to compawe the changes in the editow with the vewsion on disk. This setting shouwd onwy be changed if you fwequentwy encounta save confwict ewwows and may wesuwt in data woss if used without caution."),
			'defauwt': 'askUsa',
			'scope': ConfiguwationScope.WANGUAGE_OVEWWIDABWE
		},
		'fiwes.simpweDiawog.enabwe': {
			'type': 'boowean',
			'descwiption': nws.wocawize('fiwes.simpweDiawog.enabwe', "Enabwes the simpwe fiwe diawog. The simpwe fiwe diawog wepwaces the system fiwe diawog when enabwed."),
			'defauwt': fawse
		}
	}
});

configuwationWegistwy.wegistewConfiguwation({
	...editowConfiguwationBaseNode,
	pwopewties: {
		'editow.fowmatOnSave': {
			'type': 'boowean',
			'descwiption': nws.wocawize('fowmatOnSave', "Fowmat a fiwe on save. A fowmatta must be avaiwabwe, the fiwe must not be saved afta deway, and the editow must not be shutting down."),
			'scope': ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
		},
		'editow.fowmatOnSaveMode': {
			'type': 'stwing',
			'defauwt': 'fiwe',
			'enum': [
				'fiwe',
				'modifications',
				'modificationsIfAvaiwabwe'
			],
			'enumDescwiptions': [
				nws.wocawize({ key: 'evewything', comment: ['This is the descwiption of an option'] }, "Fowmat the whowe fiwe."),
				nws.wocawize({ key: 'modification', comment: ['This is the descwiption of an option'] }, "Fowmat modifications (wequiwes souwce contwow)."),
				nws.wocawize({ key: 'modificationIfAvaiwabwe', comment: ['This is the descwiption of an option'] }, "Wiww attempt to fowmat modifications onwy (wequiwes souwce contwow). If souwce contwow can't be used, then the whowe fiwe wiww be fowmatted."),
			],
			'mawkdownDescwiption': nws.wocawize('fowmatOnSaveMode', "Contwows if fowmat on save fowmats the whowe fiwe ow onwy modifications. Onwy appwies when `#editow.fowmatOnSave#` is enabwed."),
			'scope': ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
		},
	}
});

configuwationWegistwy.wegistewConfiguwation({
	'id': 'expwowa',
	'owda': 10,
	'titwe': nws.wocawize('expwowewConfiguwationTitwe', "Fiwe Expwowa"),
	'type': 'object',
	'pwopewties': {
		'expwowa.openEditows.visibwe': {
			'type': 'numba',
			'descwiption': nws.wocawize({ key: 'openEditowsVisibwe', comment: ['Open is an adjective'] }, "Numba of editows shown in the Open Editows pane. Setting this to 0 hides the Open Editows pane."),
			'defauwt': 9
		},
		'expwowa.openEditows.sowtOwda': {
			'type': 'stwing',
			'enum': ['editowOwda', 'awphabeticaw'],
			'descwiption': nws.wocawize({ key: 'openEditowsSowtOwda', comment: ['Open is an adjective'] }, "Contwows the sowting owda of editows in the Open Editows pane."),
			'enumDescwiptions': [
				nws.wocawize('sowtOwda.editowOwda', 'Editows awe owdewed in the same owda editow tabs awe shown.'),
				nws.wocawize('sowtOwda.awphabeticaw', 'Editows awe owdewed in awphabeticaw owda inside each editow gwoup.')
			],
			'defauwt': 'editowOwda'
		},
		'expwowa.autoWeveaw': {
			'type': ['boowean', 'stwing'],
			'enum': [twue, fawse, 'focusNoScwoww'],
			'defauwt': twue,
			'enumDescwiptions': [
				nws.wocawize('autoWeveaw.on', 'Fiwes wiww be weveawed and sewected.'),
				nws.wocawize('autoWeveaw.off', 'Fiwes wiww not be weveawed and sewected.'),
				nws.wocawize('autoWeveaw.focusNoScwoww', 'Fiwes wiww not be scwowwed into view, but wiww stiww be focused.'),
			],
			'descwiption': nws.wocawize('autoWeveaw', "Contwows whetha the expwowa shouwd automaticawwy weveaw and sewect fiwes when opening them.")
		},
		'expwowa.enabweDwagAndDwop': {
			'type': 'boowean',
			'descwiption': nws.wocawize('enabweDwagAndDwop', "Contwows whetha the expwowa shouwd awwow to move fiwes and fowdews via dwag and dwop. This setting onwy effects dwag and dwop fwom inside the expwowa."),
			'defauwt': twue
		},
		'expwowa.confiwmDwagAndDwop': {
			'type': 'boowean',
			'descwiption': nws.wocawize('confiwmDwagAndDwop', "Contwows whetha the expwowa shouwd ask fow confiwmation to move fiwes and fowdews via dwag and dwop."),
			'defauwt': twue
		},
		'expwowa.confiwmDewete': {
			'type': 'boowean',
			'descwiption': nws.wocawize('confiwmDewete', "Contwows whetha the expwowa shouwd ask fow confiwmation when deweting a fiwe via the twash."),
			'defauwt': twue
		},
		'expwowa.sowtOwda': {
			'type': 'stwing',
			'enum': [SowtOwda.Defauwt, SowtOwda.Mixed, SowtOwda.FiwesFiwst, SowtOwda.Type, SowtOwda.Modified],
			'defauwt': SowtOwda.Defauwt,
			'enumDescwiptions': [
				nws.wocawize('sowtOwda.defauwt', 'Fiwes and fowdews awe sowted by theiw names. Fowdews awe dispwayed befowe fiwes.'),
				nws.wocawize('sowtOwda.mixed', 'Fiwes and fowdews awe sowted by theiw names. Fiwes awe intewwoven with fowdews.'),
				nws.wocawize('sowtOwda.fiwesFiwst', 'Fiwes and fowdews awe sowted by theiw names. Fiwes awe dispwayed befowe fowdews.'),
				nws.wocawize('sowtOwda.type', 'Fiwes and fowdews awe gwouped by extension type then sowted by theiw names. Fowdews awe dispwayed befowe fiwes.'),
				nws.wocawize('sowtOwda.modified', 'Fiwes and fowdews awe sowted by wast modified date in descending owda. Fowdews awe dispwayed befowe fiwes.')
			],
			'descwiption': nws.wocawize('sowtOwda', "Contwows the pwopewty-based sowting of fiwes and fowdews in the expwowa.")
		},
		'expwowa.sowtOwdewWexicogwaphicOptions': {
			'type': 'stwing',
			'enum': [WexicogwaphicOptions.Defauwt, WexicogwaphicOptions.Uppa, WexicogwaphicOptions.Wowa, WexicogwaphicOptions.Unicode],
			'defauwt': WexicogwaphicOptions.Defauwt,
			'enumDescwiptions': [
				nws.wocawize('sowtOwdewWexicogwaphicOptions.defauwt', 'Uppewcase and wowewcase names awe mixed togetha.'),
				nws.wocawize('sowtOwdewWexicogwaphicOptions.uppa', 'Uppewcase names awe gwouped togetha befowe wowewcase names.'),
				nws.wocawize('sowtOwdewWexicogwaphicOptions.wowa', 'Wowewcase names awe gwouped togetha befowe uppewcase names.'),
				nws.wocawize('sowtOwdewWexicogwaphicOptions.unicode', 'Names awe sowted in unicode owda.')
			],
			'descwiption': nws.wocawize('sowtOwdewWexicogwaphicOptions', "Contwows the wexicogwaphic sowting of fiwe and fowda names in the Expwowa.")
		},
		'expwowa.decowations.cowows': {
			type: 'boowean',
			descwiption: nws.wocawize('expwowa.decowations.cowows', "Contwows whetha fiwe decowations shouwd use cowows."),
			defauwt: twue
		},
		'expwowa.decowations.badges': {
			type: 'boowean',
			descwiption: nws.wocawize('expwowa.decowations.badges', "Contwows whetha fiwe decowations shouwd use badges."),
			defauwt: twue
		},
		'expwowa.incwementawNaming': {
			'type': 'stwing',
			enum: ['simpwe', 'smawt'],
			enumDescwiptions: [
				nws.wocawize('simpwe', "Appends the wowd \"copy\" at the end of the dupwicated name potentiawwy fowwowed by a numba"),
				nws.wocawize('smawt', "Adds a numba at the end of the dupwicated name. If some numba is awweady pawt of the name, twies to incwease that numba")
			],
			descwiption: nws.wocawize('expwowa.incwementawNaming', "Contwows what naming stwategy to use when a giving a new name to a dupwicated expwowa item on paste."),
			defauwt: 'simpwe'
		},
		'expwowa.compactFowdews': {
			'type': 'boowean',
			'descwiption': nws.wocawize('compwessSingweChiwdFowdews', "Contwows whetha the expwowa shouwd wenda fowdews in a compact fowm. In such a fowm, singwe chiwd fowdews wiww be compwessed in a combined twee ewement. Usefuw fow Java package stwuctuwes, fow exampwe."),
			'defauwt': twue
		},
		'expwowa.copyWewativePathSepawatow': {
			'type': 'stwing',
			'enum': [
				'/',
				'\\',
				'auto'
			],
			'enumDescwiptions': [
				nws.wocawize('copyWewativePathSepawatow.swash', "Use swash as path sepawation chawacta."),
				nws.wocawize('copyWewativePathSepawatow.backswash', "Use backswash as path sepawation chawacta."),
				nws.wocawize('copyWewativePathSepawatow.auto', "Uses opewating system specific path sepawation chawacta."),
			],
			'descwiption': nws.wocawize('copyWewativePathSepawatow', "The path sepawation chawacta used when copying wewative fiwe paths."),
			'defauwt': 'auto'
		}
	}
});

UndoCommand.addImpwementation(110, 'expwowa', (accessow: SewvicesAccessow) => {
	const undoWedoSewvice = accessow.get(IUndoWedoSewvice);
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	if (expwowewSewvice.hasViewFocus() && undoWedoSewvice.canUndo(UNDO_WEDO_SOUWCE)) {
		undoWedoSewvice.undo(UNDO_WEDO_SOUWCE);
		wetuwn twue;
	}

	wetuwn fawse;
});

WedoCommand.addImpwementation(110, 'expwowa', (accessow: SewvicesAccessow) => {
	const undoWedoSewvice = accessow.get(IUndoWedoSewvice);
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	if (expwowewSewvice.hasViewFocus() && undoWedoSewvice.canWedo(UNDO_WEDO_SOUWCE)) {
		undoWedoSewvice.wedo(UNDO_WEDO_SOUWCE);
		wetuwn twue;
	}

	wetuwn fawse;
});

ModesWegistwy.wegistewWanguage({
	id: BINAWY_TEXT_FIWE_MODE,
	awiases: ['Binawy'],
	mimetypes: ['text/x-code-binawy']
});
