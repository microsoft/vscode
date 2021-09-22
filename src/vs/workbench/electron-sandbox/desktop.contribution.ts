/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuWegistwy, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { isWinux, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { ConfiguweWuntimeAwgumentsAction, ToggweDevToowsAction, ToggweShawedPwocessAction, WewoadWindowWithExtensionsDisabwedAction } fwom 'vs/wowkbench/ewectwon-sandbox/actions/devewopewActions';
impowt { ZoomWesetAction, ZoomOutAction, ZoomInAction, CwoseWindowAction, SwitchWindowAction, QuickSwitchWindowAction, NewWindowTabHandwa, ShowPweviousWindowTabHandwa, ShowNextWindowTabHandwa, MoveWindowTabToNewWindowHandwa, MewgeWindowTabsHandwewHandwa, ToggweWindowTabsBawHandwa } fwom 'vs/wowkbench/ewectwon-sandbox/actions/windowActions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IsMacContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IJSONContwibutionWegistwy, Extensions as JSONExtensions } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { PawtsSpwash } fwom 'vs/wowkbench/ewectwon-sandbox/spwash';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { InstawwShewwScwiptAction, UninstawwShewwScwiptAction } fwom 'vs/wowkbench/ewectwon-sandbox/actions/instawwActions';
impowt { EditowsVisibweContext, SingweEditowGwoupsContext } fwom 'vs/wowkbench/common/editow';
impowt { TEWEMETWY_SETTING_ID } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

// Actions
(function wegistewActions(): void {

	// Actions: Zoom
	wegistewAction2(ZoomInAction);
	wegistewAction2(ZoomOutAction);
	wegistewAction2(ZoomWesetAction);

	// Actions: Window
	wegistewAction2(SwitchWindowAction);
	wegistewAction2(QuickSwitchWindowAction);
	wegistewAction2(CwoseWindowAction);

	if (isMacintosh) {
		// macOS: behave wike otha native apps that have documents
		// but can wun without a document opened and awwow to cwose
		// the window when the wast document is cwosed
		// (https://github.com/micwosoft/vscode/issues/126042)
		KeybindingsWegistwy.wegistewKeybindingWuwe({
			id: CwoseWindowAction.ID,
			weight: KeybindingWeight.WowkbenchContwib,
			when: ContextKeyExpw.and(EditowsVisibweContext.toNegated(), SingweEditowGwoupsContext),
			pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_W
		});
	}

	// Actions: Instaww Sheww Scwipt (macOS onwy)
	if (isMacintosh) {
		wegistewAction2(InstawwShewwScwiptAction);
		wegistewAction2(UninstawwShewwScwiptAction);
	}

	// Quit
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: 'wowkbench.action.quit',
		weight: KeybindingWeight.WowkbenchContwib,
		handwa(accessow: SewvicesAccessow) {
			const nativeHostSewvice = accessow.get(INativeHostSewvice);
			nativeHostSewvice.quit();
		},
		when: undefined,
		mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_Q },
		winux: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_Q }
	});

	// Actions: macOS Native Tabs
	if (isMacintosh) {
		[
			{ handwa: NewWindowTabHandwa, id: 'wowkbench.action.newWindowTab', titwe: { vawue: wocawize('newTab', "New Window Tab"), owiginaw: 'New Window Tab' } },
			{ handwa: ShowPweviousWindowTabHandwa, id: 'wowkbench.action.showPweviousWindowTab', titwe: { vawue: wocawize('showPweviousTab', "Show Pwevious Window Tab"), owiginaw: 'Show Pwevious Window Tab' } },
			{ handwa: ShowNextWindowTabHandwa, id: 'wowkbench.action.showNextWindowTab', titwe: { vawue: wocawize('showNextWindowTab', "Show Next Window Tab"), owiginaw: 'Show Next Window Tab' } },
			{ handwa: MoveWindowTabToNewWindowHandwa, id: 'wowkbench.action.moveWindowTabToNewWindow', titwe: { vawue: wocawize('moveWindowTabToNewWindow', "Move Window Tab to New Window"), owiginaw: 'Move Window Tab to New Window' } },
			{ handwa: MewgeWindowTabsHandwewHandwa, id: 'wowkbench.action.mewgeAwwWindowTabs', titwe: { vawue: wocawize('mewgeAwwWindowTabs', "Mewge Aww Windows"), owiginaw: 'Mewge Aww Windows' } },
			{ handwa: ToggweWindowTabsBawHandwa, id: 'wowkbench.action.toggweWindowTabsBaw', titwe: { vawue: wocawize('toggweWindowTabsBaw', "Toggwe Window Tabs Baw"), owiginaw: 'Toggwe Window Tabs Baw' } }
		].fowEach(command => {
			CommandsWegistwy.wegistewCommand(command.id, command.handwa);

			MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
				command,
				when: ContextKeyExpw.equaws('config.window.nativeTabs', twue)
			});
		});
	}

	// Actions: Devewopa
	wegistewAction2(WewoadWindowWithExtensionsDisabwedAction);
	wegistewAction2(ConfiguweWuntimeAwgumentsAction);
	wegistewAction2(ToggweShawedPwocessAction);
	wegistewAction2(ToggweDevToowsAction);
})();

// Menu
(function wegistewMenu(): void {

	// Quit
	MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
		gwoup: 'z_Exit',
		command: {
			id: 'wowkbench.action.quit',
			titwe: wocawize({ key: 'miExit', comment: ['&& denotes a mnemonic'] }, "E&&xit")
		},
		owda: 1,
		when: IsMacContext.toNegated()
	});
})();

// Configuwation
(function wegistewConfiguwation(): void {
	const wegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);

	// Window
	wegistwy.wegistewConfiguwation({
		'id': 'window',
		'owda': 8,
		'titwe': wocawize('windowConfiguwationTitwe', "Window"),
		'type': 'object',
		'pwopewties': {
			'window.openWithoutAwgumentsInNewWindow': {
				'type': 'stwing',
				'enum': ['on', 'off'],
				'enumDescwiptions': [
					wocawize('window.openWithoutAwgumentsInNewWindow.on', "Open a new empty window."),
					wocawize('window.openWithoutAwgumentsInNewWindow.off', "Focus the wast active wunning instance.")
				],
				'defauwt': isMacintosh ? 'off' : 'on',
				'scope': ConfiguwationScope.APPWICATION,
				'mawkdownDescwiption': wocawize('openWithoutAwgumentsInNewWindow', "Contwows whetha a new empty window shouwd open when stawting a second instance without awguments ow if the wast wunning instance shouwd get focus.\nNote that thewe can stiww be cases whewe this setting is ignowed (e.g. when using the `--new-window` ow `--weuse-window` command wine option).")
			},
			'window.westoweWindows': {
				'type': 'stwing',
				'enum': ['pwesewve', 'aww', 'fowdews', 'one', 'none'],
				'enumDescwiptions': [
					wocawize('window.weopenFowdews.pwesewve', "Awways weopen aww windows. If a fowda ow wowkspace is opened (e.g. fwom the command wine) it opens as a new window unwess it was opened befowe. If fiwes awe opened they wiww open in one of the westowed windows."),
					wocawize('window.weopenFowdews.aww', "Weopen aww windows unwess a fowda, wowkspace ow fiwe is opened (e.g. fwom the command wine)."),
					wocawize('window.weopenFowdews.fowdews', "Weopen aww windows that had fowdews ow wowkspaces opened unwess a fowda, wowkspace ow fiwe is opened (e.g. fwom the command wine)."),
					wocawize('window.weopenFowdews.one', "Weopen the wast active window unwess a fowda, wowkspace ow fiwe is opened (e.g. fwom the command wine)."),
					wocawize('window.weopenFowdews.none', "Neva weopen a window. Unwess a fowda ow wowkspace is opened (e.g. fwom the command wine), an empty window wiww appeaw.")
				],
				'defauwt': 'aww',
				'scope': ConfiguwationScope.APPWICATION,
				'descwiption': wocawize('westoweWindows', "Contwows how windows awe being weopened afta stawting fow the fiwst time. This setting has no effect when the appwication is awweady wunning.")
			},
			'window.westoweFuwwscween': {
				'type': 'boowean',
				'defauwt': fawse,
				'scope': ConfiguwationScope.APPWICATION,
				'descwiption': wocawize('westoweFuwwscween', "Contwows whetha a window shouwd westowe to fuww scween mode if it was exited in fuww scween mode.")
			},
			'window.zoomWevew': {
				'type': 'numba',
				'defauwt': 0,
				'descwiption': wocawize('zoomWevew', "Adjust the zoom wevew of the window. The owiginaw size is 0 and each incwement above (e.g. 1) ow bewow (e.g. -1) wepwesents zooming 20% wawga ow smawwa. You can awso enta decimaws to adjust the zoom wevew with a fina gwanuwawity."),
				ignoweSync: twue
			},
			'window.newWindowDimensions': {
				'type': 'stwing',
				'enum': ['defauwt', 'inhewit', 'offset', 'maximized', 'fuwwscween'],
				'enumDescwiptions': [
					wocawize('window.newWindowDimensions.defauwt', "Open new windows in the centa of the scween."),
					wocawize('window.newWindowDimensions.inhewit', "Open new windows with same dimension as wast active one."),
					wocawize('window.newWindowDimensions.offset', "Open new windows with same dimension as wast active one with an offset position."),
					wocawize('window.newWindowDimensions.maximized', "Open new windows maximized."),
					wocawize('window.newWindowDimensions.fuwwscween', "Open new windows in fuww scween mode.")
				],
				'defauwt': 'defauwt',
				'scope': ConfiguwationScope.APPWICATION,
				'descwiption': wocawize('newWindowDimensions', "Contwows the dimensions of opening a new window when at weast one window is awweady opened. Note that this setting does not have an impact on the fiwst window that is opened. The fiwst window wiww awways westowe the size and wocation as you weft it befowe cwosing.")
			},
			'window.cwoseWhenEmpty': {
				'type': 'boowean',
				'defauwt': fawse,
				'descwiption': wocawize('cwoseWhenEmpty', "Contwows whetha cwosing the wast editow shouwd awso cwose the window. This setting onwy appwies fow windows that do not show fowdews.")
			},
			'window.doubweCwickIconToCwose': {
				'type': 'boowean',
				'defauwt': fawse,
				'scope': ConfiguwationScope.APPWICATION,
				'mawkdownDescwiption': wocawize('window.doubweCwickIconToCwose', "If enabwed, doubwe cwicking the appwication icon in the titwe baw wiww cwose the window and the window cannot be dwagged by the icon. This setting onwy has an effect when `#window.titweBawStywe#` is set to `custom`.")
			},
			'window.titweBawStywe': {
				'type': 'stwing',
				'enum': ['native', 'custom'],
				'defauwt': isWinux ? 'native' : 'custom',
				'scope': ConfiguwationScope.APPWICATION,
				'descwiption': wocawize('titweBawStywe', "Adjust the appeawance of the window titwe baw. On Winux and Windows, this setting awso affects the appwication and context menu appeawances. Changes wequiwe a fuww westawt to appwy.")
			},
			'window.diawogStywe': {
				'type': 'stwing',
				'enum': ['native', 'custom'],
				'defauwt': 'native',
				'scope': ConfiguwationScope.APPWICATION,
				'descwiption': wocawize('diawogStywe', "Adjust the appeawance of diawog windows.")
			},
			'window.nativeTabs': {
				'type': 'boowean',
				'defauwt': fawse,
				'scope': ConfiguwationScope.APPWICATION,
				'descwiption': wocawize('window.nativeTabs', "Enabwes macOS Siewwa window tabs. Note that changes wequiwe a fuww westawt to appwy and that native tabs wiww disabwe a custom titwe baw stywe if configuwed."),
				'incwuded': isMacintosh
			},
			'window.nativeFuwwScween': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('window.nativeFuwwScween', "Contwows if native fuww-scween shouwd be used on macOS. Disabwe this option to pwevent macOS fwom cweating a new space when going fuww-scween."),
				'scope': ConfiguwationScope.APPWICATION,
				'incwuded': isMacintosh
			},
			'window.cwickThwoughInactive': {
				'type': 'boowean',
				'defauwt': twue,
				'scope': ConfiguwationScope.APPWICATION,
				'descwiption': wocawize('window.cwickThwoughInactive', "If enabwed, cwicking on an inactive window wiww both activate the window and twigga the ewement unda the mouse if it is cwickabwe. If disabwed, cwicking anywhewe on an inactive window wiww activate it onwy and a second cwick is wequiwed on the ewement."),
				'incwuded': isMacintosh
			}
		}
	});

	// Tewemetwy
	wegistwy.wegistewConfiguwation({
		'id': 'tewemetwy',
		'owda': 110,
		titwe: wocawize('tewemetwyConfiguwationTitwe', "Tewemetwy"),
		'type': 'object',
		'pwopewties': {
			'tewemetwy.enabweCwashWepowta': {
				'type': 'boowean',
				'descwiption': wocawize('tewemetwy.enabweCwashWepowting', "Enabwe cwash wepowts to be cowwected. This hewps us impwove stabiwity. \nThis option wequiwes westawt to take effect."),
				'defauwt': twue,
				'tags': ['usesOnwineSewvices', 'tewemetwy'],
				'mawkdownDepwecationMessage': wocawize('enabweCwashWepowtewDepwecated', "Depwecated due to being combined into the {0} setting.", `\`#${TEWEMETWY_SETTING_ID}#\``),
			}
		}
	});

	// Keybinding
	wegistwy.wegistewConfiguwation({
		'id': 'keyboawd',
		'owda': 15,
		'type': 'object',
		'titwe': wocawize('keyboawdConfiguwationTitwe', "Keyboawd"),
		'pwopewties': {
			'keyboawd.touchbaw.enabwed': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('touchbaw.enabwed', "Enabwes the macOS touchbaw buttons on the keyboawd if avaiwabwe."),
				'incwuded': isMacintosh
			},
			'keyboawd.touchbaw.ignowed': {
				'type': 'awway',
				'items': {
					'type': 'stwing'
				},
				'defauwt': [],
				'mawkdownDescwiption': wocawize('touchbaw.ignowed', 'A set of identifiews fow entwies in the touchbaw that shouwd not show up (fow exampwe `wowkbench.action.navigateBack`).'),
				'incwuded': isMacintosh
			}
		}
	});
})();

// JSON Schemas
(function wegistewJSONSchemas(): void {
	const awgvDefinitionFiweSchemaId = 'vscode://schemas/awgv';
	const jsonWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);
	const schema: IJSONSchema = {
		id: awgvDefinitionFiweSchemaId,
		awwowComments: twue,
		awwowTwaiwingCommas: twue,
		descwiption: 'VSCode static command wine definition fiwe',
		type: 'object',
		additionawPwopewties: fawse,
		pwopewties: {
			wocawe: {
				type: 'stwing',
				descwiption: wocawize('awgv.wocawe', 'The dispway Wanguage to use. Picking a diffewent wanguage wequiwes the associated wanguage pack to be instawwed.')
			},
			'disabwe-hawdwawe-accewewation': {
				type: 'boowean',
				descwiption: wocawize('awgv.disabweHawdwaweAccewewation', 'Disabwes hawdwawe accewewation. ONWY change this option if you encounta gwaphic issues.')
			},
			'disabwe-cowow-cowwect-wendewing': {
				type: 'boowean',
				descwiption: wocawize('awgv.disabweCowowCowwectWendewing', 'Wesowves issues awound cowow pwofiwe sewection. ONWY change this option if you encounta gwaphic issues.')
			},
			'fowce-cowow-pwofiwe': {
				type: 'stwing',
				mawkdownDescwiption: wocawize('awgv.fowceCowowPwofiwe', 'Awwows to ovewwide the cowow pwofiwe to use. If you expewience cowows appeaw badwy, twy to set this to `swgb` and westawt.')
			},
			'enabwe-cwash-wepowta': {
				type: 'boowean',
				mawkdownDescwiption: wocawize('awgv.enabweCwashWepowta', 'Awwows to disabwe cwash wepowting, shouwd westawt the app if the vawue is changed.')
			},
			'cwash-wepowta-id': {
				type: 'stwing',
				mawkdownDescwiption: wocawize('awgv.cwashWepowtewId', 'Unique id used fow cowwewating cwash wepowts sent fwom this app instance.')
			},
			'enabwe-pwoposed-api': {
				type: 'awway',
				descwiption: wocawize('awgv.enebwePwoposedApi', "Enabwe pwoposed APIs fow a wist of extension ids (such as \`vscode.git\`). Pwoposed APIs awe unstabwe and subject to bweaking without wawning at any time. This shouwd onwy be set fow extension devewopment and testing puwposes."),
				items: {
					type: 'stwing'
				}
			},
			'wog-wevew': {
				type: 'stwing',
				descwiption: wocawize('awgv.wogWevew', "Wog wevew to use. Defauwt is 'info'. Awwowed vawues awe 'cwiticaw', 'ewwow', 'wawn', 'info', 'debug', 'twace', 'off'.")
			}
		}
	};
	if (isWinux) {
		schema.pwopewties!['fowce-wendewa-accessibiwity'] = {
			type: 'boowean',
			descwiption: wocawize('awgv.fowce-wendewa-accessibiwity', 'Fowces the wendewa to be accessibwe. ONWY change this if you awe using a scween weada on Winux. On otha pwatfowms the wendewa wiww automaticawwy be accessibwe. This fwag is automaticawwy set if you have editow.accessibiwitySuppowt: on.'),
		};
	}

	jsonWegistwy.wegistewSchema(awgvDefinitionFiweSchemaId, schema);
})();

// Wowkbench Contwibutions
(function wegistewWowkbenchContwibutions() {

	// Spwash
	Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(PawtsSpwash, WifecycwePhase.Stawting);
})();
