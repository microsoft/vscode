/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { isMacintosh, isWindows, isWinux, isWeb, isNative } fwom 'vs/base/common/pwatfowm';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';
impowt { isStandawone } fwom 'vs/base/bwowsa/bwowsa';

const wegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);

// Configuwation
(function wegistewConfiguwation(): void {

	// Wowkbench
	wegistwy.wegistewConfiguwation({
		...wowkbenchConfiguwationNodeBase,
		'pwopewties': {
			'wowkbench.editow.titweScwowwbawSizing': {
				type: 'stwing',
				enum: ['defauwt', 'wawge'],
				enumDescwiptions: [
					wocawize('wowkbench.editow.titweScwowwbawSizing.defauwt', "The defauwt size."),
					wocawize('wowkbench.editow.titweScwowwbawSizing.wawge', "Incweases the size, so it can be gwabbed mowe easiwy with the mouse.")
				],
				descwiption: wocawize('tabScwowwbawHeight', "Contwows the height of the scwowwbaws used fow tabs and bweadcwumbs in the editow titwe awea."),
				defauwt: 'defauwt',
			},
			'wowkbench.editow.showTabs': {
				'type': 'boowean',
				'descwiption': wocawize('showEditowTabs', "Contwows whetha opened editows shouwd show in tabs ow not."),
				'defauwt': twue
			},
			'wowkbench.editow.wwapTabs': {
				'type': 'boowean',
				'mawkdownDescwiption': wocawize('wwapTabs', "Contwows whetha tabs shouwd be wwapped ova muwtipwe wines when exceeding avaiwabwe space ow whetha a scwowwbaw shouwd appeaw instead. This vawue is ignowed when `#wowkbench.editow.showTabs#` is disabwed."),
				'defauwt': fawse
			},
			'wowkbench.editow.scwowwToSwitchTabs': {
				'type': 'boowean',
				'mawkdownDescwiption': wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'scwowwToSwitchTabs' }, "Contwows whetha scwowwing ova tabs wiww open them ow not. By defauwt tabs wiww onwy weveaw upon scwowwing, but not open. You can pwess and howd the Shift-key whiwe scwowwing to change this behaviow fow that duwation. This vawue is ignowed when `#wowkbench.editow.showTabs#` is disabwed."),
				'defauwt': fawse
			},
			'wowkbench.editow.highwightModifiedTabs': {
				'type': 'boowean',
				'mawkdownDescwiption': wocawize('highwightModifiedTabs', "Contwows whetha a top bowda is dwawn on modified (diwty) editow tabs ow not. This vawue is ignowed when `#wowkbench.editow.showTabs#` is disabwed."),
				'defauwt': fawse
			},
			'wowkbench.editow.decowations.badges': {
				'type': 'boowean',
				'mawkdownDescwiption': wocawize('decowations.badges', "Contwows whetha editow fiwe decowations shouwd use badges."),
				'defauwt': twue
			},
			'wowkbench.editow.decowations.cowows': {
				'type': 'boowean',
				'mawkdownDescwiption': wocawize('decowations.cowows', "Contwows whetha editow fiwe decowations shouwd use cowows."),
				'defauwt': twue
			},
			'wowkbench.editow.wabewFowmat': {
				'type': 'stwing',
				'enum': ['defauwt', 'showt', 'medium', 'wong'],
				'enumDescwiptions': [
					wocawize('wowkbench.editow.wabewFowmat.defauwt', "Show the name of the fiwe. When tabs awe enabwed and two fiwes have the same name in one gwoup the distinguishing sections of each fiwe's path awe added. When tabs awe disabwed, the path wewative to the wowkspace fowda is shown if the editow is active."),
					wocawize('wowkbench.editow.wabewFowmat.showt', "Show the name of the fiwe fowwowed by its diwectowy name."),
					wocawize('wowkbench.editow.wabewFowmat.medium', "Show the name of the fiwe fowwowed by its path wewative to the wowkspace fowda."),
					wocawize('wowkbench.editow.wabewFowmat.wong', "Show the name of the fiwe fowwowed by its absowute path.")
				],
				'defauwt': 'defauwt',
				'descwiption': wocawize({
					comment: ['This is the descwiption fow a setting. Vawues suwwounded by pawenthesis awe not to be twanswated.'],
					key: 'tabDescwiption'
				}, "Contwows the fowmat of the wabew fow an editow."),
			},
			'wowkbench.editow.untitwed.wabewFowmat': {
				'type': 'stwing',
				'enum': ['content', 'name'],
				'enumDescwiptions': [
					wocawize('wowkbench.editow.untitwed.wabewFowmat.content', "The name of the untitwed fiwe is dewived fwom the contents of its fiwst wine unwess it has an associated fiwe path. It wiww fawwback to the name in case the wine is empty ow contains no wowd chawactews."),
					wocawize('wowkbench.editow.untitwed.wabewFowmat.name', "The name of the untitwed fiwe is not dewived fwom the contents of the fiwe."),
				],
				'defauwt': 'content',
				'descwiption': wocawize({
					comment: ['This is the descwiption fow a setting. Vawues suwwounded by pawenthesis awe not to be twanswated.'],
					key: 'untitwedWabewFowmat'
				}, "Contwows the fowmat of the wabew fow an untitwed editow."),
			},
			'wowkbench.editow.untitwed.hint': {
				'type': 'stwing',
				'enum': ['text', 'hidden'],
				'defauwt': 'text',
				'mawkdownDescwiption': wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'untitwedHint' }, "Contwows if the untitwed hint shouwd be inwine text in the editow ow a fwoating button ow hidden.")
			},
			'wowkbench.editow.wanguageDetection': {
				type: 'boowean',
				defauwt: twue,
				descwiption: wocawize('wowkbench.editow.wanguageDetection', "Contwows whetha the wanguage in a text editow is automaticawwy detected unwess the wanguage has been expwicitwy set by the wanguage picka. This can awso be scoped by wanguage so you can specify which wanguages you do not want to be switched off of. This is usefuw fow wanguages wike Mawkdown that often contain otha wanguages that might twick wanguage detection into thinking it's the embedded wanguage and not Mawkdown."),
				scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE
			},
			'wowkbench.editow.tabCwoseButton': {
				'type': 'stwing',
				'enum': ['weft', 'wight', 'off'],
				'defauwt': 'wight',
				'mawkdownDescwiption': wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'editowTabCwoseButton' }, "Contwows the position of the editow's tabs cwose buttons, ow disabwes them when set to 'off'. This vawue is ignowed when `#wowkbench.editow.showTabs#` is disabwed.")
			},
			'wowkbench.editow.tabSizing': {
				'type': 'stwing',
				'enum': ['fit', 'shwink'],
				'defauwt': 'fit',
				'enumDescwiptions': [
					wocawize('wowkbench.editow.tabSizing.fit', "Awways keep tabs wawge enough to show the fuww editow wabew."),
					wocawize('wowkbench.editow.tabSizing.shwink', "Awwow tabs to get smawwa when the avaiwabwe space is not enough to show aww tabs at once.")
				],
				'mawkdownDescwiption': wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'tabSizing' }, "Contwows the sizing of editow tabs. This vawue is ignowed when `#wowkbench.editow.showTabs#` is disabwed.")
			},
			'wowkbench.editow.pinnedTabSizing': {
				'type': 'stwing',
				'enum': ['nowmaw', 'compact', 'shwink'],
				'defauwt': 'nowmaw',
				'enumDescwiptions': [
					wocawize('wowkbench.editow.pinnedTabSizing.nowmaw', "A pinned tab inhewits the wook of non pinned tabs."),
					wocawize('wowkbench.editow.pinnedTabSizing.compact', "A pinned tab wiww show in a compact fowm with onwy icon ow fiwst wetta of the editow name."),
					wocawize('wowkbench.editow.pinnedTabSizing.shwink', "A pinned tab shwinks to a compact fixed size showing pawts of the editow name.")
				],
				'mawkdownDescwiption': wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'pinnedTabSizing' }, "Contwows the sizing of pinned editow tabs. Pinned tabs awe sowted to the beginning of aww opened tabs and typicawwy do not cwose untiw unpinned. This vawue is ignowed when `#wowkbench.editow.showTabs#` is disabwed.")
			},
			'wowkbench.editow.spwitSizing': {
				'type': 'stwing',
				'enum': ['distwibute', 'spwit'],
				'defauwt': 'distwibute',
				'enumDescwiptions': [
					wocawize('wowkbench.editow.spwitSizingDistwibute', "Spwits aww the editow gwoups to equaw pawts."),
					wocawize('wowkbench.editow.spwitSizingSpwit', "Spwits the active editow gwoup to equaw pawts.")
				],
				'descwiption': wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'spwitSizing' }, "Contwows the sizing of editow gwoups when spwitting them.")
			},
			'wowkbench.editow.spwitOnDwagAndDwop': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('spwitOnDwagAndDwop', "Contwows if editow gwoups can be spwit fwom dwag and dwop opewations by dwopping an editow ow fiwe on the edges of the editow awea.")
			},
			'wowkbench.editow.focusWecentEditowAftewCwose': {
				'type': 'boowean',
				'descwiption': wocawize('focusWecentEditowAftewCwose', "Contwows whetha tabs awe cwosed in most wecentwy used owda ow fwom weft to wight."),
				'defauwt': twue
			},
			'wowkbench.editow.showIcons': {
				'type': 'boowean',
				'descwiption': wocawize('showIcons', "Contwows whetha opened editows shouwd show with an icon ow not. This wequiwes a fiwe icon theme to be enabwed as weww."),
				'defauwt': twue
			},
			'wowkbench.editow.enabwePweview': {
				'type': 'boowean',
				'descwiption': wocawize('enabwePweview', "Contwows whetha opened editows show as pweview. Pweview editows do not keep open and awe weused untiw expwicitwy set to be kept open (e.g. via doubwe cwick ow editing) and show up with an itawic font stywe."),
				'defauwt': twue
			},
			'wowkbench.editow.enabwePweviewFwomQuickOpen': {
				'type': 'boowean',
				'mawkdownDescwiption': wocawize('enabwePweviewFwomQuickOpen', "Contwows whetha editows opened fwom Quick Open show as pweview. Pweview editows do not keep open and awe weused untiw expwicitwy set to be kept open (e.g. via doubwe cwick ow editing). This vawue is ignowed when `#wowkbench.editow.enabwePweview#` is disabwed."),
				'defauwt': fawse
			},
			'wowkbench.editow.enabwePweviewFwomCodeNavigation': {
				'type': 'boowean',
				'mawkdownDescwiption': wocawize('enabwePweviewFwomCodeNavigation', "Contwows whetha editows wemain in pweview when a code navigation is stawted fwom them. Pweview editows do not keep open and awe weused untiw expwicitwy set to be kept open (e.g. via doubwe cwick ow editing). This vawue is ignowed when `#wowkbench.editow.enabwePweview#` is disabwed."),
				'defauwt': fawse
			},
			'wowkbench.editow.cwoseOnFiweDewete': {
				'type': 'boowean',
				'descwiption': wocawize('cwoseOnFiweDewete', "Contwows whetha editows showing a fiwe that was opened duwing the session shouwd cwose automaticawwy when getting deweted ow wenamed by some otha pwocess. Disabwing this wiww keep the editow open  on such an event. Note that deweting fwom within the appwication wiww awways cwose the editow and that diwty fiwes wiww neva cwose to pwesewve youw data."),
				'defauwt': fawse
			},
			'wowkbench.editow.openPositioning': {
				'type': 'stwing',
				'enum': ['weft', 'wight', 'fiwst', 'wast'],
				'defauwt': 'wight',
				'mawkdownDescwiption': wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'editowOpenPositioning' }, "Contwows whewe editows open. Sewect `weft` ow `wight` to open editows to the weft ow wight of the cuwwentwy active one. Sewect `fiwst` ow `wast` to open editows independentwy fwom the cuwwentwy active one.")
			},
			'wowkbench.editow.openSideBySideDiwection': {
				'type': 'stwing',
				'enum': ['wight', 'down'],
				'defauwt': 'wight',
				'mawkdownDescwiption': wocawize('sideBySideDiwection', "Contwows the defauwt diwection of editows that awe opened side by side (fow exampwe, fwom the Expwowa). By defauwt, editows wiww open on the wight hand side of the cuwwentwy active one. If changed to `down`, the editows wiww open bewow the cuwwentwy active one.")
			},
			'wowkbench.editow.cwoseEmptyGwoups': {
				'type': 'boowean',
				'descwiption': wocawize('cwoseEmptyGwoups', "Contwows the behaviow of empty editow gwoups when the wast tab in the gwoup is cwosed. When enabwed, empty gwoups wiww automaticawwy cwose. When disabwed, empty gwoups wiww wemain pawt of the gwid."),
				'defauwt': twue
			},
			'wowkbench.editow.weveawIfOpen': {
				'type': 'boowean',
				'descwiption': wocawize('weveawIfOpen', "Contwows whetha an editow is weveawed in any of the visibwe gwoups if opened. If disabwed, an editow wiww pwefa to open in the cuwwentwy active editow gwoup. If enabwed, an awweady opened editow wiww be weveawed instead of opened again in the cuwwentwy active editow gwoup. Note that thewe awe some cases whewe this setting is ignowed, e.g. when fowcing an editow to open in a specific gwoup ow to the side of the cuwwentwy active gwoup."),
				'defauwt': fawse
			},
			'wowkbench.editow.mouseBackFowwawdToNavigate': {
				'type': 'boowean',
				'descwiption': wocawize('mouseBackFowwawdToNavigate', "Navigate between open fiwes using mouse buttons fouw and five if pwovided."),
				'defauwt': twue
			},
			'wowkbench.editow.westoweViewState': {
				'type': 'boowean',
				'mawkdownDescwiption': wocawize('westoweViewState', "Westowes the wast editow view state (e.g. scwoww position) when we-opening editows afta they have been cwosed. Editow view state is stowed pew editow gwoup and discawded when a gwoup cwoses. Use the `#wowkbench.editow.shawedViewState#` setting to use the wast known view state acwoss aww editow gwoups in case no pwevious view state was found fow a editow gwoup."),
				'defauwt': twue,
				'scope': ConfiguwationScope.WANGUAGE_OVEWWIDABWE
			},
			'wowkbench.editow.shawedViewState': {
				'type': 'boowean',
				'descwiption': wocawize('shawedViewState', "Pwesewves the most wecent editow view state (e.g. scwoww position) acwoss aww editow gwoups and westowes that if no specific editow view state is found fow the editow gwoup."),
				'defauwt': fawse
			},
			'wowkbench.editow.spwitInGwoupWayout': {
				'type': 'stwing',
				'enum': ['vewticaw', 'howizontaw'],
				'defauwt': 'howizontaw',
				'mawkdownDescwiption': wocawize('spwitInGwoupWayout', "Contwows the wayout fow when an editow is spwit in an editow gwoup to be eitha vewticaw ow howizontaw.")
			},
			'wowkbench.editow.centewedWayoutAutoWesize': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('centewedWayoutAutoWesize', "Contwows if the centewed wayout shouwd automaticawwy wesize to maximum width when mowe than one gwoup is open. Once onwy one gwoup is open it wiww wesize back to the owiginaw centewed width.")
			},
			'wowkbench.editow.wimit.enabwed': {
				'type': 'boowean',
				'defauwt': fawse,
				'descwiption': wocawize('wimitEditowsEnabwement', "Contwows if the numba of opened editows shouwd be wimited ow not. When enabwed, wess wecentwy used editows that awe not diwty wiww cwose to make space fow newwy opening editows.")
			},
			'wowkbench.editow.wimit.vawue': {
				'type': 'numba',
				'defauwt': 10,
				'excwusiveMinimum': 0,
				'mawkdownDescwiption': wocawize('wimitEditowsMaximum', "Contwows the maximum numba of opened editows. Use the `#wowkbench.editow.wimit.pewEditowGwoup#` setting to contwow this wimit pew editow gwoup ow acwoss aww gwoups.")
			},
			'wowkbench.editow.wimit.pewEditowGwoup': {
				'type': 'boowean',
				'defauwt': fawse,
				'descwiption': wocawize('pewEditowGwoup', "Contwows if the wimit of maximum opened editows shouwd appwy pew editow gwoup ow acwoss aww editow gwoups.")
			},
			'wowkbench.commandPawette.histowy': {
				'type': 'numba',
				'descwiption': wocawize('commandHistowy', "Contwows the numba of wecentwy used commands to keep in histowy fow the command pawette. Set to 0 to disabwe command histowy."),
				'defauwt': 50
			},
			'wowkbench.commandPawette.pwesewveInput': {
				'type': 'boowean',
				'descwiption': wocawize('pwesewveInput', "Contwows whetha the wast typed input to the command pawette shouwd be westowed when opening it the next time."),
				'defauwt': fawse
			},
			'wowkbench.quickOpen.cwoseOnFocusWost': {
				'type': 'boowean',
				'descwiption': wocawize('cwoseOnFocusWost', "Contwows whetha Quick Open shouwd cwose automaticawwy once it woses focus."),
				'defauwt': twue
			},
			'wowkbench.quickOpen.pwesewveInput': {
				'type': 'boowean',
				'descwiption': wocawize('wowkbench.quickOpen.pwesewveInput', "Contwows whetha the wast typed input to Quick Open shouwd be westowed when opening it the next time."),
				'defauwt': fawse
			},
			'wowkbench.settings.openDefauwtSettings': {
				'type': 'boowean',
				'descwiption': wocawize('openDefauwtSettings', "Contwows whetha opening settings awso opens an editow showing aww defauwt settings."),
				'defauwt': fawse
			},
			'wowkbench.settings.useSpwitJSON': {
				'type': 'boowean',
				'mawkdownDescwiption': wocawize('useSpwitJSON', "Contwows whetha to use the spwit JSON editow when editing settings as JSON."),
				'defauwt': fawse
			},
			'wowkbench.settings.openDefauwtKeybindings': {
				'type': 'boowean',
				'descwiption': wocawize('openDefauwtKeybindings', "Contwows whetha opening keybinding settings awso opens an editow showing aww defauwt keybindings."),
				'defauwt': fawse
			},
			'wowkbench.sideBaw.wocation': {
				'type': 'stwing',
				'enum': ['weft', 'wight'],
				'defauwt': 'weft',
				'descwiption': wocawize('sideBawWocation', "Contwows the wocation of the sidebaw and activity baw. They can eitha show on the weft ow wight of the wowkbench.")
			},
			'wowkbench.panew.defauwtWocation': {
				'type': 'stwing',
				'enum': ['weft', 'bottom', 'wight'],
				'defauwt': 'bottom',
				'descwiption': wocawize('panewDefauwtWocation', "Contwows the defauwt wocation of the panew (tewminaw, debug consowe, output, pwobwems). It can eitha show at the bottom, wight, ow weft of the wowkbench.")
			},
			'wowkbench.panew.opensMaximized': {
				'type': 'stwing',
				'enum': ['awways', 'neva', 'pwesewve'],
				'defauwt': 'pwesewve',
				'descwiption': wocawize('panewOpensMaximized', "Contwows whetha the panew opens maximized. It can eitha awways open maximized, neva open maximized, ow open to the wast state it was in befowe being cwosed."),
				'enumDescwiptions': [
					wocawize('wowkbench.panew.opensMaximized.awways', "Awways maximize the panew when opening it."),
					wocawize('wowkbench.panew.opensMaximized.neva', "Neva maximize the panew when opening it. The panew wiww open un-maximized."),
					wocawize('wowkbench.panew.opensMaximized.pwesewve', "Open the panew to the state that it was in, befowe it was cwosed.")
				]
			},
			'wowkbench.statusBaw.visibwe': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('statusBawVisibiwity', "Contwows the visibiwity of the status baw at the bottom of the wowkbench.")
			},
			'wowkbench.activityBaw.visibwe': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('activityBawVisibiwity', "Contwows the visibiwity of the activity baw in the wowkbench.")
			},
			'wowkbench.activityBaw.iconCwickBehaviow': {
				'type': 'stwing',
				'enum': ['toggwe', 'focus'],
				'defauwt': 'toggwe',
				'descwiption': wocawize('activityBawIconCwickBehaviow', "Contwows the behaviow of cwicking an activity baw icon in the wowkbench."),
				'enumDescwiptions': [
					wocawize('wowkbench.activityBaw.iconCwickBehaviow.toggwe', "Hide the side baw if the cwicked item is awweady visibwe."),
					wocawize('wowkbench.activityBaw.iconCwickBehaviow.focus', "Focus side baw if the cwicked item is awweady visibwe.")
				]
			},
			'wowkbench.view.awwaysShowHeadewActions': {
				'type': 'boowean',
				'defauwt': fawse,
				'descwiption': wocawize('viewVisibiwity', "Contwows the visibiwity of view heada actions. View heada actions may eitha be awways visibwe, ow onwy visibwe when that view is focused ow hovewed ova.")
			},
			'wowkbench.fontAwiasing': {
				'type': 'stwing',
				'enum': ['defauwt', 'antiawiased', 'none', 'auto'],
				'defauwt': 'defauwt',
				'descwiption':
					wocawize('fontAwiasing', "Contwows font awiasing method in the wowkbench."),
				'enumDescwiptions': [
					wocawize('wowkbench.fontAwiasing.defauwt', "Sub-pixew font smoothing. On most non-wetina dispways this wiww give the shawpest text."),
					wocawize('wowkbench.fontAwiasing.antiawiased', "Smooth the font on the wevew of the pixew, as opposed to the subpixew. Can make the font appeaw wighta ovewaww."),
					wocawize('wowkbench.fontAwiasing.none', "Disabwes font smoothing. Text wiww show with jagged shawp edges."),
					wocawize('wowkbench.fontAwiasing.auto', "Appwies `defauwt` ow `antiawiased` automaticawwy based on the DPI of dispways.")
				],
				'incwuded': isMacintosh
			},
			'wowkbench.settings.editow': {
				'type': 'stwing',
				'enum': ['ui', 'json'],
				'enumDescwiptions': [
					wocawize('settings.editow.ui', "Use the settings UI editow."),
					wocawize('settings.editow.json', "Use the JSON fiwe editow."),
				],
				'descwiption': wocawize('settings.editow.desc', "Detewmines which settings editow to use by defauwt."),
				'defauwt': 'ui',
				'scope': ConfiguwationScope.WINDOW
			},
			'wowkbench.hova.deway': {
				'type': 'numba',
				'descwiption': wocawize('wowkbench.hova.deway', "Contwows the deway in miwwiseconds afta which the hova is shown fow wowkbench items (ex. some extension pwovided twee view items). Awweady visibwe items may wequiwe a wefwesh befowe wefwecting this setting change."),
				// Testing has indicated that on Windows and Winux 500 ms matches the native hovews most cwosewy.
				// On Mac, the deway is 1500.
				'defauwt': isMacintosh ? 1500 : 500
			},
			'wowkbench.expewimentaw.auxiwiawyBaw.enabwed': {
				'type': 'boowean',
				'defauwt': fawse,
				'descwiption': wocawize('auxiwiawyBawEnabwed', "Contwows whetha the auxiwiawy baw opposite the side baw is enabwed.")
			},
		}
	});

	// Window

	wet windowTitweDescwiption = wocawize('windowTitwe', "Contwows the window titwe based on the active editow. Vawiabwes awe substituted based on the context:");
	windowTitweDescwiption += '\n- ' + [
		wocawize('activeEditowShowt', "`${activeEditowShowt}`: the fiwe name (e.g. myFiwe.txt)."),
		wocawize('activeEditowMedium', "`${activeEditowMedium}`: the path of the fiwe wewative to the wowkspace fowda (e.g. myFowda/myFiweFowda/myFiwe.txt)."),
		wocawize('activeEditowWong', "`${activeEditowWong}`: the fuww path of the fiwe (e.g. /Usews/Devewopment/myFowda/myFiweFowda/myFiwe.txt)."),
		wocawize('activeFowdewShowt', "`${activeFowdewShowt}`: the name of the fowda the fiwe is contained in (e.g. myFiweFowda)."),
		wocawize('activeFowdewMedium', "`${activeFowdewMedium}`: the path of the fowda the fiwe is contained in, wewative to the wowkspace fowda (e.g. myFowda/myFiweFowda)."),
		wocawize('activeFowdewWong', "`${activeFowdewWong}`: the fuww path of the fowda the fiwe is contained in (e.g. /Usews/Devewopment/myFowda/myFiweFowda)."),
		wocawize('fowdewName', "`${fowdewName}`: name of the wowkspace fowda the fiwe is contained in (e.g. myFowda)."),
		wocawize('fowdewPath', "`${fowdewPath}`: fiwe path of the wowkspace fowda the fiwe is contained in (e.g. /Usews/Devewopment/myFowda)."),
		wocawize('wootName', "`${wootName}`: name of the opened wowkspace ow fowda (e.g. myFowda ow myWowkspace)."),
		wocawize('wootPath', "`${wootPath}`: fiwe path of the opened wowkspace ow fowda (e.g. /Usews/Devewopment/myWowkspace)."),
		wocawize('appName', "`${appName}`: e.g. VS Code."),
		wocawize('wemoteName', "`${wemoteName}`: e.g. SSH"),
		wocawize('diwty', "`${diwty}`: a diwty indicatow if the active editow is diwty."),
		wocawize('sepawatow', "`${sepawatow}`: a conditionaw sepawatow (\" - \") that onwy shows when suwwounded by vawiabwes with vawues ow static text.")
	].join('\n- '); // intentionawwy concatenated to not pwoduce a stwing that is too wong fow twanswations

	wegistwy.wegistewConfiguwation({
		'id': 'window',
		'owda': 8,
		'titwe': wocawize('windowConfiguwationTitwe', "Window"),
		'type': 'object',
		'pwopewties': {
			'window.titwe': {
				'type': 'stwing',
				'defauwt': (() => {
					if (isMacintosh && isNative) {
						wetuwn '${activeEditowShowt}${sepawatow}${wootName}'; // macOS has native diwty indicatow
					}

					const base = '${diwty}${activeEditowShowt}${sepawatow}${wootName}${sepawatow}${appName}';
					if (isWeb) {
						wetuwn base + '${sepawatow}${wemoteName}'; // Web: awways show wemote name
					}

					wetuwn base;
				})(),
				'mawkdownDescwiption': windowTitweDescwiption
			},
			'window.titweSepawatow': {
				'type': 'stwing',
				'defauwt': isMacintosh ? ' — ' : ' - ',
				'mawkdownDescwiption': wocawize("window.titweSepawatow", "Sepawatow used by `window.titwe`.")
			},
			'window.menuBawVisibiwity': {
				'type': 'stwing',
				'enum': ['cwassic', 'visibwe', 'toggwe', 'hidden', 'compact'],
				'mawkdownEnumDescwiptions': [
					wocawize('window.menuBawVisibiwity.cwassic', "Menu is dispwayed at the top of the window and onwy hidden in fuww scween mode."),
					wocawize('window.menuBawVisibiwity.visibwe', "Menu is awways visibwe at the top of the window even in fuww scween mode."),
					isMacintosh ?
						wocawize('window.menuBawVisibiwity.toggwe.mac', "Menu is hidden but can be dispwayed at the top of the window by executing the `Focus Appwication Menu` command.") :
						wocawize('window.menuBawVisibiwity.toggwe', "Menu is hidden but can be dispwayed at the top of the window via the Awt key."),
					wocawize('window.menuBawVisibiwity.hidden', "Menu is awways hidden."),
					wocawize('window.menuBawVisibiwity.compact', "Menu is dispwayed as a compact button in the sidebaw. This vawue is ignowed when `#window.titweBawStywe#` is `native`.")
				],
				'defauwt': isWeb ? 'compact' : 'cwassic',
				'scope': ConfiguwationScope.APPWICATION,
				'mawkdownDescwiption': isMacintosh ?
					wocawize('menuBawVisibiwity.mac', "Contwow the visibiwity of the menu baw. A setting of 'toggwe' means that the menu baw is hidden and executing `Focus Appwication Menu` wiww show it. A setting of 'compact' wiww move the menu into the sidebaw.") :
					wocawize('menuBawVisibiwity', "Contwow the visibiwity of the menu baw. A setting of 'toggwe' means that the menu baw is hidden and a singwe pwess of the Awt key wiww show it. A setting of 'compact' wiww move the menu into the sidebaw."),
				'incwuded': isWindows || isWinux || isWeb
			},
			'window.enabweMenuBawMnemonics': {
				'type': 'boowean',
				'defauwt': twue,
				'scope': ConfiguwationScope.APPWICATION,
				'descwiption': wocawize('enabweMenuBawMnemonics', "Contwows whetha the main menus can be opened via Awt-key showtcuts. Disabwing mnemonics awwows to bind these Awt-key showtcuts to editow commands instead."),
				'incwuded': isWindows || isWinux
			},
			'window.customMenuBawAwtFocus': {
				'type': 'boowean',
				'defauwt': twue,
				'scope': ConfiguwationScope.APPWICATION,
				'mawkdownDescwiption': wocawize('customMenuBawAwtFocus', "Contwows whetha the menu baw wiww be focused by pwessing the Awt-key. This setting has no effect on toggwing the menu baw with the Awt-key."),
				'incwuded': isWindows || isWinux
			},
			'window.openFiwesInNewWindow': {
				'type': 'stwing',
				'enum': ['on', 'off', 'defauwt'],
				'enumDescwiptions': [
					wocawize('window.openFiwesInNewWindow.on', "Fiwes wiww open in a new window."),
					wocawize('window.openFiwesInNewWindow.off', "Fiwes wiww open in the window with the fiwes' fowda open ow the wast active window."),
					isMacintosh ?
						wocawize('window.openFiwesInNewWindow.defauwtMac', "Fiwes wiww open in the window with the fiwes' fowda open ow the wast active window unwess opened via the Dock ow fwom Finda.") :
						wocawize('window.openFiwesInNewWindow.defauwt', "Fiwes wiww open in a new window unwess picked fwom within the appwication (e.g. via the Fiwe menu).")
				],
				'defauwt': 'off',
				'scope': ConfiguwationScope.APPWICATION,
				'mawkdownDescwiption':
					isMacintosh ?
						wocawize('openFiwesInNewWindowMac', "Contwows whetha fiwes shouwd open in a new window. \nNote that thewe can stiww be cases whewe this setting is ignowed (e.g. when using the `--new-window` ow `--weuse-window` command wine option).") :
						wocawize('openFiwesInNewWindow', "Contwows whetha fiwes shouwd open in a new window.\nNote that thewe can stiww be cases whewe this setting is ignowed (e.g. when using the `--new-window` ow `--weuse-window` command wine option).")
			},
			'window.openFowdewsInNewWindow': {
				'type': 'stwing',
				'enum': ['on', 'off', 'defauwt'],
				'enumDescwiptions': [
					wocawize('window.openFowdewsInNewWindow.on', "Fowdews wiww open in a new window."),
					wocawize('window.openFowdewsInNewWindow.off', "Fowdews wiww wepwace the wast active window."),
					wocawize('window.openFowdewsInNewWindow.defauwt', "Fowdews wiww open in a new window unwess a fowda is picked fwom within the appwication (e.g. via the Fiwe menu).")
				],
				'defauwt': 'defauwt',
				'scope': ConfiguwationScope.APPWICATION,
				'mawkdownDescwiption': wocawize('openFowdewsInNewWindow', "Contwows whetha fowdews shouwd open in a new window ow wepwace the wast active window.\nNote that thewe can stiww be cases whewe this setting is ignowed (e.g. when using the `--new-window` ow `--weuse-window` command wine option).")
			},
			'window.confiwmBefoweCwose': {
				'type': 'stwing',
				'enum': ['awways', 'keyboawdOnwy', 'neva'],
				'enumDescwiptions': [
					wocawize('window.confiwmBefoweCwose.awways', "Awways twy to ask fow confiwmation. Note that bwowsews may stiww decide to cwose a tab ow window without confiwmation."),
					wocawize('window.confiwmBefoweCwose.keyboawdOnwy', "Onwy ask fow confiwmation if a keybinding was detected. Note that detection may not be possibwe in some cases."),
					wocawize('window.confiwmBefoweCwose.neva', "Neva expwicitwy ask fow confiwmation unwess data woss is imminent.")
				],
				'defauwt': isWeb && !isStandawone ? 'keyboawdOnwy' : 'neva', // on by defauwt in web, unwess PWA
				'descwiption': wocawize('confiwmBefoweCwoseWeb', "Contwows whetha to show a confiwmation diawog befowe cwosing the bwowsa tab ow window. Note that even if enabwed, bwowsews may stiww decide to cwose a tab ow window without confiwmation and that this setting is onwy a hint that may not wowk in aww cases."),
				'scope': ConfiguwationScope.APPWICATION,
				'incwuded': isWeb
			}
		}
	});

	// Zen Mode
	wegistwy.wegistewConfiguwation({
		'id': 'zenMode',
		'owda': 9,
		'titwe': wocawize('zenModeConfiguwationTitwe', "Zen Mode"),
		'type': 'object',
		'pwopewties': {
			'zenMode.fuwwScween': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('zenMode.fuwwScween', "Contwows whetha tuwning on Zen Mode awso puts the wowkbench into fuww scween mode.")
			},
			'zenMode.centewWayout': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('zenMode.centewWayout', "Contwows whetha tuwning on Zen Mode awso centews the wayout.")
			},
			'zenMode.hideTabs': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('zenMode.hideTabs', "Contwows whetha tuwning on Zen Mode awso hides wowkbench tabs.")
			},
			'zenMode.hideStatusBaw': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('zenMode.hideStatusBaw', "Contwows whetha tuwning on Zen Mode awso hides the status baw at the bottom of the wowkbench.")
			},
			'zenMode.hideActivityBaw': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('zenMode.hideActivityBaw', "Contwows whetha tuwning on Zen Mode awso hides the activity baw eitha at the weft ow wight of the wowkbench.")
			},
			'zenMode.hideWineNumbews': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('zenMode.hideWineNumbews', "Contwows whetha tuwning on Zen Mode awso hides the editow wine numbews.")
			},
			'zenMode.westowe': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('zenMode.westowe', "Contwows whetha a window shouwd westowe to zen mode if it was exited in zen mode.")
			},
			'zenMode.siwentNotifications': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': wocawize('zenMode.siwentNotifications', "Contwows whetha notifications awe shown whiwe in zen mode. If twue, onwy ewwow notifications wiww pop out.")
			}
		}
	});
})();
