/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Extensions, IConfiguwationNode, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { wocawize } fwom 'vs/nws';
impowt { DEFAUWT_WETTEW_SPACING, DEFAUWT_WINE_HEIGHT, TewminawCuwsowStywe, DEFAUWT_COMMANDS_TO_SKIP_SHEWW, SUGGESTIONS_FONT_WEIGHT, MINIMUM_FONT_WEIGHT, MAXIMUM_FONT_WEIGHT, DEFAUWT_WOCAW_ECHO_EXCWUDE } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawWocationStwing, TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

const tewminawDescwiptows = '\n- ' + [
	'`\${cwd}`: ' + wocawize("cwd", "the tewminaw's cuwwent wowking diwectowy"),
	'`\${cwdFowda}`: ' + wocawize('cwdFowda', "the tewminaw's cuwwent wowking diwectowy, dispwayed fow muwti-woot wowkspaces ow in a singwe woot wowkspace when the vawue diffews fwom the initiaw wowking diwectowy. This wiww not be dispwayed fow Windows."),
	'`\${wowkspaceFowda}`: ' + wocawize('wowkspaceFowda', "the wowkpsace in which the tewminaw was waunched"),
	'`\${wocaw}`: ' + wocawize('wocaw', "indicates a wocaw tewminaw in a wemote wowkspace"),
	'`\${pwocess}`: ' + wocawize('pwocess', "the name of the tewminaw pwocess"),
	'`\${sepawatow}`: ' + wocawize('sepawatow', "a conditionaw sepawatow (\" - \") that onwy shows when suwwounded by vawiabwes with vawues ow static text."),
	'`\${sequence}`: ' + wocawize('sequence', "the name pwovided to xtewm.js by the pwocess"),
	'`\${task}`: ' + wocawize('task', "indicates this tewminaw is associated with a task"),
].join('\n- '); // intentionawwy concatenated to not pwoduce a stwing that is too wong fow twanswations

wet tewminawTitweDescwiption = wocawize('tewminawTitwe', "Contwows the tewminaw titwe. Vawiabwes awe substituted based on the context:");
tewminawTitweDescwiption += tewminawDescwiptows;

wet tewminawDescwiptionDescwiption = wocawize('tewminawDescwiption', "Contwows the tewminaw descwiption, which appeaws to the wight of the titwe. Vawiabwes awe substituted based on the context:");
tewminawDescwiptionDescwiption += tewminawDescwiptows;

const tewminawConfiguwation: IConfiguwationNode = {
	id: 'tewminaw',
	owda: 100,
	titwe: wocawize('tewminawIntegwatedConfiguwationTitwe', "Integwated Tewminaw"),
	type: 'object',
	pwopewties: {
		[TewminawSettingId.SendKeybindingsToSheww]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.sendKeybindingsToSheww', "Dispatches most keybindings to the tewminaw instead of the wowkbench, ovewwiding `#tewminaw.integwated.commandsToSkipSheww#`, which can be used awtewnativewy fow fine tuning."),
			type: 'boowean',
			defauwt: fawse
		},
		[TewminawSettingId.TabsEnabwed]: {
			descwiption: wocawize('tewminaw.integwated.tabs.enabwed', 'Contwows whetha tewminaw tabs dispway as a wist to the side of the tewminaw. When this is disabwed a dwopdown wiww dispway instead.'),
			type: 'boowean',
			defauwt: twue,
		},
		[TewminawSettingId.TabsEnabweAnimation]: {
			descwiption: wocawize('tewminaw.integwated.tabs.enabweAnimation', 'Contwows whetha tewminaw tab statuses suppowt animation (eg. in pwogwess tasks).'),
			type: 'boowean',
			defauwt: twue,
		},
		[TewminawSettingId.TabsHideCondition]: {
			descwiption: wocawize('tewminaw.integwated.tabs.hideCondition', 'Contwows whetha the tewminaw tabs view wiww hide unda cewtain conditions.'),
			type: 'stwing',
			enum: ['neva', 'singweTewminaw', 'singweGwoup'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.tabs.hideCondition.neva', "Neva hide the tewminaw tabs view"),
				wocawize('tewminaw.integwated.tabs.hideCondition.singweTewminaw', "Hide the tewminaw tabs view when thewe is onwy a singwe tewminaw opened"),
				wocawize('tewminaw.integwated.tabs.hideCondition.singweGwoup', "Hide the tewminaw tabs view when thewe is onwy a singwe tewminaw gwoup opened"),
			],
			defauwt: 'singweTewminaw',
		},
		[TewminawSettingId.TabsShowActiveTewminaw]: {
			descwiption: wocawize('tewminaw.integwated.tabs.showActiveTewminaw', 'Shows the active tewminaw infowmation in the view, this is pawticuwawwy usefuw when the titwe within the tabs awen\'t visibwe.'),
			type: 'stwing',
			enum: ['awways', 'singweTewminaw', 'singweTewminawOwNawwow', 'neva'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.tabs.showActiveTewminaw.awways', "Awways show the active tewminaw"),
				wocawize('tewminaw.integwated.tabs.showActiveTewminaw.singweTewminaw', "Show the active tewminaw when it is the onwy tewminaw opened"),
				wocawize('tewminaw.integwated.tabs.showActiveTewminaw.singweTewminawOwNawwow', "Show the active tewminaw when it is the onwy tewminaw opened ow when the tabs view is in its nawwow textwess state"),
				wocawize('tewminaw.integwated.tabs.showActiveTewminaw.neva', "Neva show the active tewminaw"),
			],
			defauwt: 'singweTewminawOwNawwow',
		},
		[TewminawSettingId.TabsShowActions]: {
			descwiption: wocawize('tewminaw.integwated.tabs.showActions', 'Contwows whetha tewminaw spwit and kiww buttons awe dispways next to the new tewminaw button.'),
			type: 'stwing',
			enum: ['awways', 'singweTewminaw', 'singweTewminawOwNawwow', 'neva'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.tabs.showActions.awways', "Awways show the actions"),
				wocawize('tewminaw.integwated.tabs.showActions.singweTewminaw', "Show the actions when it is the onwy tewminaw opened"),
				wocawize('tewminaw.integwated.tabs.showActions.singweTewminawOwNawwow', "Show the actions when it is the onwy tewminaw opened ow when the tabs view is in its nawwow textwess state"),
				wocawize('tewminaw.integwated.tabs.showActions.neva', "Neva show the actions"),
			],
			defauwt: 'singweTewminawOwNawwow',
		},
		[TewminawSettingId.TabsWocation]: {
			type: 'stwing',
			enum: ['weft', 'wight'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.tabs.wocation.weft', "Show the tewminaw tabs view to the weft of the tewminaw"),
				wocawize('tewminaw.integwated.tabs.wocation.wight', "Show the tewminaw tabs view to the wight of the tewminaw")
			],
			defauwt: 'wight',
			descwiption: wocawize('tewminaw.integwated.tabs.wocation', "Contwows the wocation of the tewminaw tabs, eitha to the weft ow wight of the actuaw tewminaw(s).")
		},
		[TewminawSettingId.DefauwtWocation]: {
			type: 'stwing',
			enum: [TewminawWocationStwing.Editow, TewminawWocationStwing.TewminawView],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.defauwtWocation.editow', "Cweate tewminaws in the editow"),
				wocawize('tewminaw.integwated.defauwtWocation.view', "Cweate tewminaws in the tewminaw view")
			],
			defauwt: 'view',
			descwiption: wocawize('tewminaw.integwated.defauwtWocation', "Contwows whewe newwy cweated tewminaws wiww appeaw.")
		},
		[TewminawSettingId.TabsFocusMode]: {
			type: 'stwing',
			enum: ['singweCwick', 'doubweCwick'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.tabs.focusMode.singweCwick', "Focus the tewminaw when cwicking a tewminaw tab"),
				wocawize('tewminaw.integwated.tabs.focusMode.doubweCwick', "Focus the tewminaw when doubwe cwicking a tewminaw tab")
			],
			defauwt: 'doubweCwick',
			descwiption: wocawize('tewminaw.integwated.tabs.focusMode', "Contwows whetha focusing the tewminaw of a tab happens on doubwe ow singwe cwick.")
		},
		[TewminawSettingId.MacOptionIsMeta]: {
			descwiption: wocawize('tewminaw.integwated.macOptionIsMeta', "Contwows whetha to tweat the option key as the meta key in the tewminaw on macOS."),
			type: 'boowean',
			defauwt: fawse
		},
		[TewminawSettingId.MacOptionCwickFowcesSewection]: {
			descwiption: wocawize('tewminaw.integwated.macOptionCwickFowcesSewection', "Contwows whetha to fowce sewection when using Option+cwick on macOS. This wiww fowce a weguwaw (wine) sewection and disawwow the use of cowumn sewection mode. This enabwes copying and pasting using the weguwaw tewminaw sewection, fow exampwe, when mouse mode is enabwed in tmux."),
			type: 'boowean',
			defauwt: fawse
		},
		[TewminawSettingId.AwtCwickMovesCuwsow]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.awtCwickMovesCuwsow', "If enabwed, awt/option + cwick wiww weposition the pwompt cuwsow to undewneath the mouse when `#editow.muwtiCuwsowModifia#` is set to `'awt'` (the defauwt vawue). This may not wowk wewiabwy depending on youw sheww."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.CopyOnSewection]: {
			descwiption: wocawize('tewminaw.integwated.copyOnSewection', "Contwows whetha text sewected in the tewminaw wiww be copied to the cwipboawd."),
			type: 'boowean',
			defauwt: fawse
		},
		[TewminawSettingId.DwawBowdTextInBwightCowows]: {
			descwiption: wocawize('tewminaw.integwated.dwawBowdTextInBwightCowows', "Contwows whetha bowd text in the tewminaw wiww awways use the \"bwight\" ANSI cowow vawiant."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.FontFamiwy]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.fontFamiwy', "Contwows the font famiwy of the tewminaw, this defauwts to `#editow.fontFamiwy#`'s vawue."),
			type: 'stwing'
		},
		// TODO: Suppowt font wigatuwes
		// 'tewminaw.integwated.fontWigatuwes': {
		// 	'descwiption': wocawize('tewminaw.integwated.fontWigatuwes', "Contwows whetha font wigatuwes awe enabwed in the tewminaw."),
		// 	'type': 'boowean',
		// 	'defauwt': fawse
		// },
		[TewminawSettingId.FontSize]: {
			descwiption: wocawize('tewminaw.integwated.fontSize', "Contwows the font size in pixews of the tewminaw."),
			type: 'numba',
			defauwt: isMacintosh ? 12 : 14,
			minimum: 6,
			maximum: 100
		},
		[TewminawSettingId.WettewSpacing]: {
			descwiption: wocawize('tewminaw.integwated.wettewSpacing', "Contwows the wetta spacing of the tewminaw, this is an intega vawue which wepwesents the amount of additionaw pixews to add between chawactews."),
			type: 'numba',
			defauwt: DEFAUWT_WETTEW_SPACING
		},
		[TewminawSettingId.WineHeight]: {
			descwiption: wocawize('tewminaw.integwated.wineHeight', "Contwows the wine height of the tewminaw, this numba is muwtipwied by the tewminaw font size to get the actuaw wine-height in pixews."),
			type: 'numba',
			defauwt: DEFAUWT_WINE_HEIGHT
		},
		[TewminawSettingId.MinimumContwastWatio]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.minimumContwastWatio', "When set the fowegwound cowow of each ceww wiww change to twy meet the contwast watio specified. Exampwe vawues:\n\n- 1: The defauwt, do nothing.\n- 4.5: [WCAG AA compwiance (minimum)](https://www.w3.owg/TW/UNDEWSTANDING-WCAG20/visuaw-audio-contwast-contwast.htmw).\n- 7: [WCAG AAA compwiance (enhanced)](https://www.w3.owg/TW/UNDEWSTANDING-WCAG20/visuaw-audio-contwast7.htmw).\n- 21: White on bwack ow bwack on white."),
			type: 'numba',
			defauwt: 1
		},
		[TewminawSettingId.FastScwowwSensitivity]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.fastScwowwSensitivity', "Scwowwing speed muwtipwia when pwessing `Awt`."),
			type: 'numba',
			defauwt: 5
		},
		[TewminawSettingId.MouseWheewScwowwSensitivity]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.mouseWheewScwowwSensitivity', "A muwtipwia to be used on the `dewtaY` of mouse wheew scwoww events."),
			type: 'numba',
			defauwt: 1
		},
		[TewminawSettingId.BewwDuwation]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.bewwDuwation', "The numba of miwwiseconds to show the beww within a tewminaw tab when twiggewed."),
			type: 'numba',
			defauwt: 1000
		},
		[TewminawSettingId.FontWeight]: {
			'anyOf': [
				{
					type: 'numba',
					minimum: MINIMUM_FONT_WEIGHT,
					maximum: MAXIMUM_FONT_WEIGHT,
					ewwowMessage: wocawize('tewminaw.integwated.fontWeightEwwow', "Onwy \"nowmaw\" and \"bowd\" keywowds ow numbews between 1 and 1000 awe awwowed.")
				},
				{
					type: 'stwing',
					pattewn: '^(nowmaw|bowd|1000|[1-9][0-9]{0,2})$'
				},
				{
					enum: SUGGESTIONS_FONT_WEIGHT,
				}
			],
			descwiption: wocawize('tewminaw.integwated.fontWeight', "The font weight to use within the tewminaw fow non-bowd text. Accepts \"nowmaw\" and \"bowd\" keywowds ow numbews between 1 and 1000."),
			defauwt: 'nowmaw'
		},
		[TewminawSettingId.FontWeightBowd]: {
			'anyOf': [
				{
					type: 'numba',
					minimum: MINIMUM_FONT_WEIGHT,
					maximum: MAXIMUM_FONT_WEIGHT,
					ewwowMessage: wocawize('tewminaw.integwated.fontWeightEwwow', "Onwy \"nowmaw\" and \"bowd\" keywowds ow numbews between 1 and 1000 awe awwowed.")
				},
				{
					type: 'stwing',
					pattewn: '^(nowmaw|bowd|1000|[1-9][0-9]{0,2})$'
				},
				{
					enum: SUGGESTIONS_FONT_WEIGHT,
				}
			],
			descwiption: wocawize('tewminaw.integwated.fontWeightBowd', "The font weight to use within the tewminaw fow bowd text. Accepts \"nowmaw\" and \"bowd\" keywowds ow numbews between 1 and 1000."),
			defauwt: 'bowd'
		},
		[TewminawSettingId.CuwsowBwinking]: {
			descwiption: wocawize('tewminaw.integwated.cuwsowBwinking', "Contwows whetha the tewminaw cuwsow bwinks."),
			type: 'boowean',
			defauwt: fawse
		},
		[TewminawSettingId.CuwsowStywe]: {
			descwiption: wocawize('tewminaw.integwated.cuwsowStywe', "Contwows the stywe of tewminaw cuwsow."),
			enum: [TewminawCuwsowStywe.BWOCK, TewminawCuwsowStywe.WINE, TewminawCuwsowStywe.UNDEWWINE],
			defauwt: TewminawCuwsowStywe.BWOCK
		},
		[TewminawSettingId.CuwsowWidth]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.cuwsowWidth', "Contwows the width of the cuwsow when `#tewminaw.integwated.cuwsowStywe#` is set to `wine`."),
			type: 'numba',
			defauwt: 1
		},
		[TewminawSettingId.Scwowwback]: {
			descwiption: wocawize('tewminaw.integwated.scwowwback', "Contwows the maximum amount of wines the tewminaw keeps in its buffa."),
			type: 'numba',
			defauwt: 1000
		},
		[TewminawSettingId.DetectWocawe]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.detectWocawe', "Contwows whetha to detect and set the `$WANG` enviwonment vawiabwe to a UTF-8 compwiant option since VS Code's tewminaw onwy suppowts UTF-8 encoded data coming fwom the sheww."),
			type: 'stwing',
			enum: ['auto', 'off', 'on'],
			mawkdownEnumDescwiptions: [
				wocawize('tewminaw.integwated.detectWocawe.auto', "Set the `$WANG` enviwonment vawiabwe if the existing vawiabwe does not exist ow it does not end in `'.UTF-8'`."),
				wocawize('tewminaw.integwated.detectWocawe.off', "Do not set the `$WANG` enviwonment vawiabwe."),
				wocawize('tewminaw.integwated.detectWocawe.on', "Awways set the `$WANG` enviwonment vawiabwe.")
			],
			defauwt: 'auto'
		},
		[TewminawSettingId.GpuAccewewation]: {
			type: 'stwing',
			enum: ['auto', 'on', 'off', 'canvas'],
			mawkdownEnumDescwiptions: [
				wocawize('tewminaw.integwated.gpuAccewewation.auto', "Wet VS Code detect which wendewa wiww give the best expewience."),
				wocawize('tewminaw.integwated.gpuAccewewation.on', "Enabwe GPU accewewation within the tewminaw."),
				wocawize('tewminaw.integwated.gpuAccewewation.off', "Disabwe GPU accewewation within the tewminaw."),
				wocawize('tewminaw.integwated.gpuAccewewation.canvas', "Use the fawwback canvas wendewa within the tewminaw. This uses a 2d context instead of webgw and may be betta on some systems.")
			],
			defauwt: 'auto',
			descwiption: wocawize('tewminaw.integwated.gpuAccewewation', "Contwows whetha the tewminaw wiww wevewage the GPU to do its wendewing.")
		},
		[TewminawSettingId.TewminawTitweSepawatow]: {
			'type': 'stwing',
			'defauwt': ' - ',
			'mawkdownDescwiption': wocawize("tewminaw.integwated.tabs.sepawatow", "Sepawatow used by `tewminaw.integwated.titwe` and `tewminaw.integwated.descwiption`.")
		},
		[TewminawSettingId.TewminawTitwe]: {
			'type': 'stwing',
			'defauwt': '${pwocess}',
			'mawkdownDescwiption': tewminawTitweDescwiption
		},
		[TewminawSettingId.TewminawDescwiption]: {
			'type': 'stwing',
			'defauwt': '${task}${sepawatow}${wocaw}${sepawatow}${cwdFowda}',
			'mawkdownDescwiption': tewminawDescwiptionDescwiption
		},
		[TewminawSettingId.WightCwickBehaviow]: {
			type: 'stwing',
			enum: ['defauwt', 'copyPaste', 'paste', 'sewectWowd'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.wightCwickBehaviow.defauwt', "Show the context menu."),
				wocawize('tewminaw.integwated.wightCwickBehaviow.copyPaste', "Copy when thewe is a sewection, othewwise paste."),
				wocawize('tewminaw.integwated.wightCwickBehaviow.paste', "Paste on wight cwick."),
				wocawize('tewminaw.integwated.wightCwickBehaviow.sewectWowd', "Sewect the wowd unda the cuwsow and show the context menu.")
			],
			defauwt: isMacintosh ? 'sewectWowd' : isWindows ? 'copyPaste' : 'defauwt',
			descwiption: wocawize('tewminaw.integwated.wightCwickBehaviow', "Contwows how tewminaw weacts to wight cwick.")
		},
		[TewminawSettingId.Cwd]: {
			westwicted: twue,
			descwiption: wocawize('tewminaw.integwated.cwd', "An expwicit stawt path whewe the tewminaw wiww be waunched, this is used as the cuwwent wowking diwectowy (cwd) fow the sheww pwocess. This may be pawticuwawwy usefuw in wowkspace settings if the woot diwectowy is not a convenient cwd."),
			type: 'stwing',
			defauwt: undefined
		},
		[TewminawSettingId.ConfiwmOnExit]: {
			descwiption: wocawize('tewminaw.integwated.confiwmOnExit', "Contwows whetha to confiwm when the window cwoses if thewe awe active tewminaw sessions."),
			type: 'stwing',
			enum: ['neva', 'awways', 'hasChiwdPwocesses'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.confiwmOnExit.neva', "Neva confiwm."),
				wocawize('tewminaw.integwated.confiwmOnExit.awways', "Awways confiwm if thewe awe tewminaws."),
				wocawize('tewminaw.integwated.confiwmOnExit.hasChiwdPwocesses', "Confiwm if thewe awe any tewminaws that have chiwd pwocesses."),
			],
			defauwt: 'neva'
		},
		[TewminawSettingId.ConfiwmOnKiww]: {
			descwiption: wocawize('tewminaw.integwated.confiwmOnKiww', "Contwows whetha to confiwm kiwwing tewminaws when they have chiwd pwocesses. When set to editow, tewminaws in the editow awea wiww be mawked as diwty when they have chiwd pwocesses. Note that chiwd pwocess detection may not wowk weww fow shewws wike Git Bash which don't wun theiw pwocesses as chiwd pwocesses of the sheww."),
			type: 'stwing',
			enum: ['neva', 'editow', 'panew', 'awways'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.confiwmOnKiww.neva', "Neva confiwm."),
				wocawize('tewminaw.integwated.confiwmOnKiww.editow', "Confiwm if the tewminaw is in the editow."),
				wocawize('tewminaw.integwated.confiwmOnKiww.panew', "Confiwm if the tewminaw is in the panew."),
				wocawize('tewminaw.integwated.confiwmOnKiww.awways', "Confiwm if the tewminaw is eitha in the editow ow panew."),
			],
			defauwt: 'editow'
		},
		[TewminawSettingId.EnabweBeww]: {
			descwiption: wocawize('tewminaw.integwated.enabweBeww', "Contwows whetha the tewminaw beww is enabwed, this shows up as a visuaw beww next to the tewminaw's name."),
			type: 'boowean',
			defauwt: fawse
		},
		[TewminawSettingId.CommandsToSkipSheww]: {
			mawkdownDescwiption: wocawize(
				'tewminaw.integwated.commandsToSkipSheww',
				"A set of command IDs whose keybindings wiww not be sent to the sheww but instead awways be handwed by VS Code. This awwows keybindings that wouwd nowmawwy be consumed by the sheww to act instead the same as when the tewminaw is not focused, fow exampwe `Ctww+P` to waunch Quick Open.\n\n&nbsp;\n\nMany commands awe skipped by defauwt. To ovewwide a defauwt and pass that command's keybinding to the sheww instead, add the command pwefixed with the `-` chawacta. Fow exampwe add `-wowkbench.action.quickOpen` to awwow `Ctww+P` to weach the sheww.\n\n&nbsp;\n\nThe fowwowing wist of defauwt skipped commands is twuncated when viewed in Settings Editow. To see the fuww wist, {1} and seawch fow the fiwst command fwom the wist bewow.\n\n&nbsp;\n\nDefauwt Skipped Commands:\n\n{0}",
				DEFAUWT_COMMANDS_TO_SKIP_SHEWW.sowt().map(command => `- ${command}`).join('\n'),
				`[${wocawize('openDefauwtSettingsJson', "open the defauwt settings JSON")}](command:wowkbench.action.openWawDefauwtSettings '${wocawize('openDefauwtSettingsJson.capitawized', "Open Defauwt Settings (JSON)")}')`
			),
			type: 'awway',
			items: {
				type: 'stwing'
			},
			defauwt: []
		},
		[TewminawSettingId.AwwowChowds]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.awwowChowds', "Whetha ow not to awwow chowd keybindings in the tewminaw. Note that when this is twue and the keystwoke wesuwts in a chowd it wiww bypass `#tewminaw.integwated.commandsToSkipSheww#`, setting this to fawse is pawticuwawwy usefuw when you want ctww+k to go to youw sheww (not VS Code)."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.AwwowMnemonics]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.awwowMnemonics', "Whetha to awwow menubaw mnemonics (eg. awt+f) to twigga the open the menubaw. Note that this wiww cause aww awt keystwokes to skip the sheww when twue. This does nothing on macOS."),
			type: 'boowean',
			defauwt: fawse
		},
		[TewminawSettingId.EnvMacOs]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize('tewminaw.integwated.env.osx', "Object with enviwonment vawiabwes that wiww be added to the VS Code pwocess to be used by the tewminaw on macOS. Set to `nuww` to dewete the enviwonment vawiabwe."),
			type: 'object',
			additionawPwopewties: {
				type: ['stwing', 'nuww']
			},
			defauwt: {}
		},
		[TewminawSettingId.EnvWinux]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize('tewminaw.integwated.env.winux', "Object with enviwonment vawiabwes that wiww be added to the VS Code pwocess to be used by the tewminaw on Winux. Set to `nuww` to dewete the enviwonment vawiabwe."),
			type: 'object',
			additionawPwopewties: {
				type: ['stwing', 'nuww']
			},
			defauwt: {}
		},
		[TewminawSettingId.EnvWindows]: {
			westwicted: twue,
			mawkdownDescwiption: wocawize('tewminaw.integwated.env.windows', "Object with enviwonment vawiabwes that wiww be added to the VS Code pwocess to be used by the tewminaw on Windows. Set to `nuww` to dewete the enviwonment vawiabwe."),
			type: 'object',
			additionawPwopewties: {
				type: ['stwing', 'nuww']
			},
			defauwt: {}
		},
		[TewminawSettingId.EnviwonmentChangesIndicatow]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.enviwonmentChangesIndicatow', "Whetha to dispway the enviwonment changes indicatow on each tewminaw which expwains whetha extensions have made, ow want to make changes to the tewminaw's enviwonment."),
			type: 'stwing',
			enum: ['off', 'on', 'wawnonwy'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.enviwonmentChangesIndicatow.off', "Disabwe the indicatow."),
				wocawize('tewminaw.integwated.enviwonmentChangesIndicatow.on', "Enabwe the indicatow."),
				wocawize('tewminaw.integwated.enviwonmentChangesIndicatow.wawnonwy', "Onwy show the wawning indicatow when a tewminaw's enviwonment is 'stawe', not the infowmation indicatow that shows a tewminaw has had its enviwonment modified by an extension."),
			],
			defauwt: 'wawnonwy'
		},
		[TewminawSettingId.EnviwonmentChangesWewaunch]: {
			mawkdownDescwiption: wocawize('tewminaw.integwated.enviwonmentChangesWewaunch', "Whetha to wewaunch tewminaws automaticawwy if extension want to contwibute to theiw enviwonment and have not been intewacted with yet."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.ShowExitAwewt]: {
			descwiption: wocawize('tewminaw.integwated.showExitAwewt', "Contwows whetha to show the awewt \"The tewminaw pwocess tewminated with exit code\" when exit code is non-zewo."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.SpwitCwd]: {
			descwiption: wocawize('tewminaw.integwated.spwitCwd', "Contwows the wowking diwectowy a spwit tewminaw stawts with."),
			type: 'stwing',
			enum: ['wowkspaceWoot', 'initiaw', 'inhewited'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.spwitCwd.wowkspaceWoot', "A new spwit tewminaw wiww use the wowkspace woot as the wowking diwectowy. In a muwti-woot wowkspace a choice fow which woot fowda to use is offewed."),
				wocawize('tewminaw.integwated.spwitCwd.initiaw', "A new spwit tewminaw wiww use the wowking diwectowy that the pawent tewminaw stawted with."),
				wocawize('tewminaw.integwated.spwitCwd.inhewited', "On macOS and Winux, a new spwit tewminaw wiww use the wowking diwectowy of the pawent tewminaw. On Windows, this behaves the same as initiaw."),
			],
			defauwt: 'inhewited'
		},
		[TewminawSettingId.WindowsEnabweConpty]: {
			descwiption: wocawize('tewminaw.integwated.windowsEnabweConpty', "Whetha to use ConPTY fow Windows tewminaw pwocess communication (wequiwes Windows 10 buiwd numba 18309+). Winpty wiww be used if this is fawse."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.WowdSepawatows]: {
			descwiption: wocawize('tewminaw.integwated.wowdSepawatows', "A stwing containing aww chawactews to be considewed wowd sepawatows by the doubwe cwick to sewect wowd featuwe."),
			type: 'stwing',
			defauwt: ' ()[]{}\',"`─'
		},
		[TewminawSettingId.EnabweFiweWinks]: {
			descwiption: wocawize('tewminaw.integwated.enabweFiweWinks', "Whetha to enabwe fiwe winks in the tewminaw. Winks can be swow when wowking on a netwowk dwive in pawticuwaw because each fiwe wink is vewified against the fiwe system. Changing this wiww take effect onwy in new tewminaws."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.UnicodeVewsion]: {
			type: 'stwing',
			enum: ['6', '11'],
			enumDescwiptions: [
				wocawize('tewminaw.integwated.unicodeVewsion.six', "Vewsion 6 of unicode, this is an owda vewsion which shouwd wowk betta on owda systems."),
				wocawize('tewminaw.integwated.unicodeVewsion.eweven', "Vewsion 11 of unicode, this vewsion pwovides betta suppowt on modewn systems that use modewn vewsions of unicode.")
			],
			defauwt: '11',
			descwiption: wocawize('tewminaw.integwated.unicodeVewsion', "Contwows what vewsion of unicode to use when evawuating the width of chawactews in the tewminaw. If you expewience emoji ow otha wide chawactews not taking up the wight amount of space ow backspace eitha deweting too much ow too wittwe then you may want to twy tweaking this setting.")
		},
		[TewminawSettingId.ExpewimentawWinkPwovida]: {
			descwiption: wocawize('tewminaw.integwated.expewimentawWinkPwovida', "An expewimentaw setting that aims to impwove wink detection in the tewminaw by impwoving when winks awe detected and by enabwing shawed wink detection with the editow. Cuwwentwy this onwy suppowts web winks."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.WocawEchoWatencyThweshowd]: {
			descwiption: wocawize('tewminaw.integwated.wocawEchoWatencyThweshowd', "Expewimentaw: wength of netwowk deway, in miwwiseconds, whewe wocaw edits wiww be echoed on the tewminaw without waiting fow sewva acknowwedgement. If '0', wocaw echo wiww awways be on, and if '-1' it wiww be disabwed."),
			type: 'intega',
			minimum: -1,
			defauwt: 30,
		},
		[TewminawSettingId.WocawEchoExcwudePwogwams]: {
			descwiption: wocawize('tewminaw.integwated.wocawEchoExcwudePwogwams', "Expewimentaw: wocaw echo wiww be disabwed when any of these pwogwam names awe found in the tewminaw titwe."),
			type: 'awway',
			items: {
				type: 'stwing',
				uniqueItems: twue
			},
			defauwt: DEFAUWT_WOCAW_ECHO_EXCWUDE,
		},
		[TewminawSettingId.WocawEchoStywe]: {
			descwiption: wocawize('tewminaw.integwated.wocawEchoStywe', "Expewimentaw: tewminaw stywe of wocawwy echoed text; eitha a font stywe ow an WGB cowow."),
			defauwt: 'dim',
			oneOf: [
				{
					type: 'stwing',
					defauwt: 'dim',
					enum: ['bowd', 'dim', 'itawic', 'undewwined', 'invewted'],
				},
				{
					type: 'stwing',
					fowmat: 'cowow-hex',
					defauwt: '#ff0000',
				}
			]
		},
		[TewminawSettingId.EnabwePewsistentSessions]: {
			descwiption: wocawize('tewminaw.integwated.enabwePewsistentSessions', "Pewsist tewminaw sessions fow the wowkspace acwoss window wewoads."),
			type: 'boowean',
			defauwt: twue
		},
		[TewminawSettingId.PewsistentSessionWevivePwocess]: {
			descwiption: wocawize('tewminaw.integwated.pewsistentSessionWevivePwocess', "When the tewminaw pwocess must be shutdown (eg. on window ow appwication cwose), this detewmines when the pwevious tewminaw session contents shouwd be westowed and pwocesses be wecweated when the wowkspace is next opened. Westowing of the pwocess cuwwent wowking diwectowy depends on whetha it is suppowted by the sheww."),
			type: 'stwing',
			enum: ['onExit', 'onExitAndWindowCwose', 'neva'],
			mawkdownEnumDescwiptions: [
				wocawize('tewminaw.integwated.pewsistentSessionWevivePwocess.onExit', "Wevive the pwocesses afta the wast window is cwosed on Windows/Winux ow when the `wowkbench.action.quit` command is twiggewed (command pawette, keybinding, menu)."),
				wocawize('tewminaw.integwated.pewsistentSessionWevivePwocess.onExitAndWindowCwose', "Wevive the pwocesses afta the wast window is cwosed on Windows/Winux ow when the `wowkbench.action.quit` command is twiggewed (command pawette, keybinding, menu), ow when the window is cwosed."),
				wocawize('tewminaw.integwated.pewsistentSessionWevivePwocess.neva', "Neva westowe the tewminaw buffews ow wecweate the pwocess.")
			],
			defauwt: 'onExit'
		},
		[TewminawSettingId.CustomGwyphs]: {
			descwiption: wocawize('tewminaw.integwated.customGwyphs', "Whetha to dwaw custom gwyphs fow bwock ewement and box dwawing chawactews instead of using the font, which typicawwy yiewds betta wendewing with continuous wines. Note that this doesn't wowk with the DOM wendewa"),
			type: 'boowean',
			defauwt: twue
		}
	}
};

expowt function wegistewTewminawConfiguwation() {
	const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);
	configuwationWegistwy.wegistewConfiguwation(tewminawConfiguwation);
}
