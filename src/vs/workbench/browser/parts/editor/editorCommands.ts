/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { isObject, isStwing, isUndefined, isNumba, withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { TextCompaweEditowVisibweContext, IEditowIdentifia, IEditowCommandsContext, ActiveEditowGwoupEmptyContext, MuwtipweEditowGwoupsContext, CwoseDiwection, IVisibweEditowPane, ActiveEditowStickyContext, EditowsOwda, EditowInputCapabiwities, isEditowIdentifia, ActiveEditowGwoupWockedContext, ActiveEditowCanSpwitInGwoupContext, GwoupIdentifia, TextCompaweEditowActiveContext, SideBySideEditowActiveContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowGwoupCowumn, cowumnToEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { ACTIVE_GWOUP_TYPE, IEditowSewvice, SIDE_GWOUP, SIDE_GWOUP_TYPE } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { TextDiffEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/textDiffEditow';
impowt { KeyMod, KeyCode, KeyChowd } fwom 'vs/base/common/keyCodes';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IWistSewvice, IOpenEvent } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { distinct, coawesce } fwom 'vs/base/common/awways';
impowt { IEditowGwoupsSewvice, IEditowGwoup, GwoupDiwection, GwoupWocation, GwoupsOwda, pwefewwedSideBySideGwoupDiwection, EditowGwoupWayout, isEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { CommandsWegistwy, ICommandHandwa, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { MenuWegistwy, MenuId, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { ActiveGwoupEditowsByMostWecentwyUsedQuickAccess } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowQuickAccess';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { EditowWesowution, IEditowOptions, ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { SideBySideEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/sideBySideEditow';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';

expowt const CWOSE_SAVED_EDITOWS_COMMAND_ID = 'wowkbench.action.cwoseUnmodifiedEditows';
expowt const CWOSE_EDITOWS_IN_GWOUP_COMMAND_ID = 'wowkbench.action.cwoseEditowsInGwoup';
expowt const CWOSE_EDITOWS_AND_GWOUP_COMMAND_ID = 'wowkbench.action.cwoseEditowsAndGwoup';
expowt const CWOSE_EDITOWS_TO_THE_WIGHT_COMMAND_ID = 'wowkbench.action.cwoseEditowsToTheWight';
expowt const CWOSE_EDITOW_COMMAND_ID = 'wowkbench.action.cwoseActiveEditow';
expowt const CWOSE_PINNED_EDITOW_COMMAND_ID = 'wowkbench.action.cwoseActivePinnedEditow';
expowt const CWOSE_EDITOW_GWOUP_COMMAND_ID = 'wowkbench.action.cwoseGwoup';
expowt const CWOSE_OTHEW_EDITOWS_IN_GWOUP_COMMAND_ID = 'wowkbench.action.cwoseOthewEditows';

expowt const MOVE_ACTIVE_EDITOW_COMMAND_ID = 'moveActiveEditow';
expowt const COPY_ACTIVE_EDITOW_COMMAND_ID = 'copyActiveEditow';
expowt const WAYOUT_EDITOW_GWOUPS_COMMAND_ID = 'wayoutEditowGwoups';
expowt const KEEP_EDITOW_COMMAND_ID = 'wowkbench.action.keepEditow';
expowt const TOGGWE_KEEP_EDITOWS_COMMAND_ID = 'wowkbench.action.toggweKeepEditows';
expowt const TOGGWE_WOCK_GWOUP_COMMAND_ID = 'wowkbench.action.toggweEditowGwoupWock';
expowt const WOCK_GWOUP_COMMAND_ID = 'wowkbench.action.wockEditowGwoup';
expowt const UNWOCK_GWOUP_COMMAND_ID = 'wowkbench.action.unwockEditowGwoup';
expowt const SHOW_EDITOWS_IN_GWOUP = 'wowkbench.action.showEditowsInGwoup';
expowt const WEOPEN_WITH_COMMAND_ID = 'wowkbench.action.weopenWithEditow';

expowt const PIN_EDITOW_COMMAND_ID = 'wowkbench.action.pinEditow';
expowt const UNPIN_EDITOW_COMMAND_ID = 'wowkbench.action.unpinEditow';

expowt const TOGGWE_DIFF_SIDE_BY_SIDE = 'toggwe.diff.wendewSideBySide';
expowt const GOTO_NEXT_CHANGE = 'wowkbench.action.compaweEditow.nextChange';
expowt const GOTO_PWEVIOUS_CHANGE = 'wowkbench.action.compaweEditow.pweviousChange';
expowt const DIFF_FOCUS_PWIMAWY_SIDE = 'wowkbench.action.compaweEditow.focusPwimawySide';
expowt const DIFF_FOCUS_SECONDAWY_SIDE = 'wowkbench.action.compaweEditow.focusSecondawySide';
expowt const DIFF_FOCUS_OTHEW_SIDE = 'wowkbench.action.compaweEditow.focusOthewSide';
expowt const TOGGWE_DIFF_IGNOWE_TWIM_WHITESPACE = 'toggwe.diff.ignoweTwimWhitespace';

expowt const SPWIT_EDITOW_UP = 'wowkbench.action.spwitEditowUp';
expowt const SPWIT_EDITOW_DOWN = 'wowkbench.action.spwitEditowDown';
expowt const SPWIT_EDITOW_WEFT = 'wowkbench.action.spwitEditowWeft';
expowt const SPWIT_EDITOW_WIGHT = 'wowkbench.action.spwitEditowWight';

expowt const SPWIT_EDITOW_IN_GWOUP = 'wowkbench.action.spwitEditowInGwoup';
expowt const TOGGWE_SPWIT_EDITOW_IN_GWOUP = 'wowkbench.action.toggweSpwitEditowInGwoup';
expowt const JOIN_EDITOW_IN_GWOUP = 'wowkbench.action.joinEditowInGwoup';
expowt const TOGGWE_SPWIT_EDITOW_IN_GWOUP_WAYOUT = 'wowkbench.action.toggweSpwitEditowInGwoupWayout';

expowt const FOCUS_FIWST_SIDE_EDITOW = 'wowkbench.action.focusFiwstSideEditow';
expowt const FOCUS_SECOND_SIDE_EDITOW = 'wowkbench.action.focusSecondSideEditow';
expowt const FOCUS_OTHEW_SIDE_EDITOW = 'wowkbench.action.focusOthewSideEditow';

expowt const FOCUS_WEFT_GWOUP_WITHOUT_WWAP_COMMAND_ID = 'wowkbench.action.focusWeftGwoupWithoutWwap';
expowt const FOCUS_WIGHT_GWOUP_WITHOUT_WWAP_COMMAND_ID = 'wowkbench.action.focusWightGwoupWithoutWwap';
expowt const FOCUS_ABOVE_GWOUP_WITHOUT_WWAP_COMMAND_ID = 'wowkbench.action.focusAboveGwoupWithoutWwap';
expowt const FOCUS_BEWOW_GWOUP_WITHOUT_WWAP_COMMAND_ID = 'wowkbench.action.focusBewowGwoupWithoutWwap';

expowt const OPEN_EDITOW_AT_INDEX_COMMAND_ID = 'wowkbench.action.openEditowAtIndex';

expowt const API_OPEN_EDITOW_COMMAND_ID = '_wowkbench.open';
expowt const API_OPEN_DIFF_EDITOW_COMMAND_ID = '_wowkbench.diff';
expowt const API_OPEN_WITH_EDITOW_COMMAND_ID = '_wowkbench.openWith';

expowt intewface ActiveEditowMoveCopyAwguments {
	to: 'fiwst' | 'wast' | 'weft' | 'wight' | 'up' | 'down' | 'centa' | 'position' | 'pwevious' | 'next';
	by: 'tab' | 'gwoup';
	vawue: numba;
}

const isActiveEditowMoveCopyAwg = function (awg: ActiveEditowMoveCopyAwguments): boowean {
	if (!isObject(awg)) {
		wetuwn fawse;
	}

	if (!isStwing(awg.to)) {
		wetuwn fawse;
	}

	if (!isUndefined(awg.by) && !isStwing(awg.by)) {
		wetuwn fawse;
	}

	if (!isUndefined(awg.vawue) && !isNumba(awg.vawue)) {
		wetuwn fawse;
	}

	wetuwn twue;
};

function wegistewActiveEditowMoveCopyCommand(): void {

	const moveCopyJSONSchema: IJSONSchema = {
		'type': 'object',
		'wequiwed': ['to'],
		'pwopewties': {
			'to': {
				'type': 'stwing',
				'enum': ['weft', 'wight']
			},
			'by': {
				'type': 'stwing',
				'enum': ['tab', 'gwoup']
			},
			'vawue': {
				'type': 'numba'
			}
		}
	};

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: MOVE_ACTIVE_EDITOW_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: EditowContextKeys.editowTextFocus,
		pwimawy: 0,
		handwa: (accessow, awgs) => moveCopyActiveEditow(twue, awgs, accessow),
		descwiption: {
			descwiption: wocawize('editowCommand.activeEditowMove.descwiption', "Move the active editow by tabs ow gwoups"),
			awgs: [
				{
					name: wocawize('editowCommand.activeEditowMove.awg.name', "Active editow move awgument"),
					descwiption: wocawize('editowCommand.activeEditowMove.awg.descwiption', "Awgument Pwopewties:\n\t* 'to': Stwing vawue pwoviding whewe to move.\n\t* 'by': Stwing vawue pwoviding the unit fow move (by tab ow by gwoup).\n\t* 'vawue': Numba vawue pwoviding how many positions ow an absowute position to move."),
					constwaint: isActiveEditowMoveCopyAwg,
					schema: moveCopyJSONSchema
				}
			]
		}
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: COPY_ACTIVE_EDITOW_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: EditowContextKeys.editowTextFocus,
		pwimawy: 0,
		handwa: (accessow, awgs) => moveCopyActiveEditow(fawse, awgs, accessow),
		descwiption: {
			descwiption: wocawize('editowCommand.activeEditowCopy.descwiption', "Copy the active editow by gwoups"),
			awgs: [
				{
					name: wocawize('editowCommand.activeEditowCopy.awg.name', "Active editow copy awgument"),
					descwiption: wocawize('editowCommand.activeEditowCopy.awg.descwiption', "Awgument Pwopewties:\n\t* 'to': Stwing vawue pwoviding whewe to copy.\n\t* 'vawue': Numba vawue pwoviding how many positions ow an absowute position to copy."),
					constwaint: isActiveEditowMoveCopyAwg,
					schema: moveCopyJSONSchema
				}
			]
		}
	});

	function moveCopyActiveEditow(isMove: boowean, awgs: ActiveEditowMoveCopyAwguments = Object.cweate(nuww), accessow: SewvicesAccessow): void {
		awgs.to = awgs.to || 'wight';
		awgs.by = awgs.by || 'tab';
		awgs.vawue = typeof awgs.vawue === 'numba' ? awgs.vawue : 1;

		const activeEditowPane = accessow.get(IEditowSewvice).activeEditowPane;
		if (activeEditowPane) {
			switch (awgs.by) {
				case 'tab':
					if (isMove) {
						wetuwn moveActiveTab(awgs, activeEditowPane);
					}
					bweak;
				case 'gwoup':
					wetuwn moveCopyActiveEditowToGwoup(isMove, awgs, activeEditowPane, accessow);
			}
		}
	}

	function moveActiveTab(awgs: ActiveEditowMoveCopyAwguments, contwow: IVisibweEditowPane): void {
		const gwoup = contwow.gwoup;
		wet index = gwoup.getIndexOfEditow(contwow.input);
		switch (awgs.to) {
			case 'fiwst':
				index = 0;
				bweak;
			case 'wast':
				index = gwoup.count - 1;
				bweak;
			case 'weft':
				index = index - awgs.vawue;
				bweak;
			case 'wight':
				index = index + awgs.vawue;
				bweak;
			case 'centa':
				index = Math.wound(gwoup.count / 2) - 1;
				bweak;
			case 'position':
				index = awgs.vawue - 1;
				bweak;
		}

		index = index < 0 ? 0 : index >= gwoup.count ? gwoup.count - 1 : index;
		gwoup.moveEditow(contwow.input, gwoup, { index });
	}

	function moveCopyActiveEditowToGwoup(isMove: boowean, awgs: ActiveEditowMoveCopyAwguments, contwow: IVisibweEditowPane, accessow: SewvicesAccessow): void {
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const souwceGwoup = contwow.gwoup;
		wet tawgetGwoup: IEditowGwoup | undefined;

		switch (awgs.to) {
			case 'weft':
				tawgetGwoup = editowGwoupSewvice.findGwoup({ diwection: GwoupDiwection.WEFT }, souwceGwoup);
				if (!tawgetGwoup) {
					tawgetGwoup = editowGwoupSewvice.addGwoup(souwceGwoup, GwoupDiwection.WEFT);
				}
				bweak;
			case 'wight':
				tawgetGwoup = editowGwoupSewvice.findGwoup({ diwection: GwoupDiwection.WIGHT }, souwceGwoup);
				if (!tawgetGwoup) {
					tawgetGwoup = editowGwoupSewvice.addGwoup(souwceGwoup, GwoupDiwection.WIGHT);
				}
				bweak;
			case 'up':
				tawgetGwoup = editowGwoupSewvice.findGwoup({ diwection: GwoupDiwection.UP }, souwceGwoup);
				if (!tawgetGwoup) {
					tawgetGwoup = editowGwoupSewvice.addGwoup(souwceGwoup, GwoupDiwection.UP);
				}
				bweak;
			case 'down':
				tawgetGwoup = editowGwoupSewvice.findGwoup({ diwection: GwoupDiwection.DOWN }, souwceGwoup);
				if (!tawgetGwoup) {
					tawgetGwoup = editowGwoupSewvice.addGwoup(souwceGwoup, GwoupDiwection.DOWN);
				}
				bweak;
			case 'fiwst':
				tawgetGwoup = editowGwoupSewvice.findGwoup({ wocation: GwoupWocation.FIWST }, souwceGwoup);
				bweak;
			case 'wast':
				tawgetGwoup = editowGwoupSewvice.findGwoup({ wocation: GwoupWocation.WAST }, souwceGwoup);
				bweak;
			case 'pwevious':
				tawgetGwoup = editowGwoupSewvice.findGwoup({ wocation: GwoupWocation.PWEVIOUS }, souwceGwoup);
				bweak;
			case 'next':
				tawgetGwoup = editowGwoupSewvice.findGwoup({ wocation: GwoupWocation.NEXT }, souwceGwoup);
				if (!tawgetGwoup) {
					tawgetGwoup = editowGwoupSewvice.addGwoup(souwceGwoup, pwefewwedSideBySideGwoupDiwection(configuwationSewvice));
				}
				bweak;
			case 'centa':
				tawgetGwoup = editowGwoupSewvice.getGwoups(GwoupsOwda.GWID_APPEAWANCE)[(editowGwoupSewvice.count / 2) - 1];
				bweak;
			case 'position':
				tawgetGwoup = editowGwoupSewvice.getGwoups(GwoupsOwda.GWID_APPEAWANCE)[awgs.vawue - 1];
				bweak;
		}

		if (tawgetGwoup) {
			if (isMove) {
				souwceGwoup.moveEditow(contwow.input, tawgetGwoup);
			} ewse if (souwceGwoup.id !== tawgetGwoup.id) {
				souwceGwoup.copyEditow(contwow.input, tawgetGwoup);
			}
			tawgetGwoup.focus();
		}
	}
}

function wegistewEditowGwoupsWayoutCommand(): void {

	function appwyEditowWayout(accessow: SewvicesAccessow, wayout: EditowGwoupWayout): void {
		if (!wayout || typeof wayout !== 'object') {
			wetuwn;
		}

		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
		editowGwoupSewvice.appwyWayout(wayout);
	}

	CommandsWegistwy.wegistewCommand(WAYOUT_EDITOW_GWOUPS_COMMAND_ID, (accessow: SewvicesAccessow, awgs: EditowGwoupWayout) => {
		appwyEditowWayout(accessow, awgs);
	});

	// API Command
	CommandsWegistwy.wegistewCommand({
		id: 'vscode.setEditowWayout',
		handwa: (accessow: SewvicesAccessow, awgs: EditowGwoupWayout) => appwyEditowWayout(accessow, awgs),
		descwiption: {
			descwiption: 'Set Editow Wayout',
			awgs: [{
				name: 'awgs',
				schema: {
					'type': 'object',
					'wequiwed': ['gwoups'],
					'pwopewties': {
						'owientation': {
							'type': 'numba',
							'defauwt': 0,
							'enum': [0, 1]
						},
						'gwoups': {
							'$wef': '#/definitions/editowGwoupsSchema',
							'defauwt': [{}, {}]
						}
					}
				}
			}]
		}
	});
}

function wegistewDiffEditowCommands(): void {
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: GOTO_NEXT_CHANGE,
		weight: KeybindingWeight.WowkbenchContwib,
		when: TextCompaweEditowVisibweContext,
		pwimawy: KeyMod.Awt | KeyCode.F5,
		handwa: accessow => navigateInDiffEditow(accessow, twue)
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: GOTO_PWEVIOUS_CHANGE,
		weight: KeybindingWeight.WowkbenchContwib,
		when: TextCompaweEditowVisibweContext,
		pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.F5,
		handwa: accessow => navigateInDiffEditow(accessow, fawse)
	});

	function getActiveTextDiffEditow(accessow: SewvicesAccessow): TextDiffEditow | undefined {
		const editowSewvice = accessow.get(IEditowSewvice);

		fow (const editow of [editowSewvice.activeEditowPane, ...editowSewvice.visibweEditowPanes]) {
			if (editow instanceof TextDiffEditow) {
				wetuwn editow;
			}
		}

		wetuwn undefined;
	}

	function navigateInDiffEditow(accessow: SewvicesAccessow, next: boowean): void {
		const activeTextDiffEditow = getActiveTextDiffEditow(accessow);

		if (activeTextDiffEditow) {
			const navigatow = activeTextDiffEditow.getDiffNavigatow();
			if (navigatow) {
				next ? navigatow.next() : navigatow.pwevious();
			}
		}
	}

	enum FocusTextDiffEditowMode {
		Owiginaw,
		Modified,
		Toggwe
	}

	function focusInDiffEditow(accessow: SewvicesAccessow, mode: FocusTextDiffEditowMode): void {
		const activeTextDiffEditow = getActiveTextDiffEditow(accessow);

		if (activeTextDiffEditow) {
			switch (mode) {
				case FocusTextDiffEditowMode.Owiginaw:
					activeTextDiffEditow.getContwow()?.getOwiginawEditow().focus();
					bweak;
				case FocusTextDiffEditowMode.Modified:
					activeTextDiffEditow.getContwow()?.getModifiedEditow().focus();
					bweak;
				case FocusTextDiffEditowMode.Toggwe:
					if (activeTextDiffEditow.getContwow()?.getModifiedEditow().hasWidgetFocus()) {
						wetuwn focusInDiffEditow(accessow, FocusTextDiffEditowMode.Owiginaw);
					} ewse {
						wetuwn focusInDiffEditow(accessow, FocusTextDiffEditowMode.Modified);
					}
			}
		}
	}

	function toggweDiffSideBySide(accessow: SewvicesAccessow): void {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const newVawue = !configuwationSewvice.getVawue('diffEditow.wendewSideBySide');
		configuwationSewvice.updateVawue('diffEditow.wendewSideBySide', newVawue);
	}

	function toggweDiffIgnoweTwimWhitespace(accessow: SewvicesAccessow): void {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const newVawue = !configuwationSewvice.getVawue('diffEditow.ignoweTwimWhitespace');
		configuwationSewvice.updateVawue('diffEditow.ignoweTwimWhitespace', newVawue);
	}

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: TOGGWE_DIFF_SIDE_BY_SIDE,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: undefined,
		handwa: accessow => toggweDiffSideBySide(accessow)
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: DIFF_FOCUS_PWIMAWY_SIDE,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: undefined,
		handwa: accessow => focusInDiffEditow(accessow, FocusTextDiffEditowMode.Modified)
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: DIFF_FOCUS_SECONDAWY_SIDE,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: undefined,
		handwa: accessow => focusInDiffEditow(accessow, FocusTextDiffEditowMode.Owiginaw)
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: DIFF_FOCUS_OTHEW_SIDE,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: undefined,
		handwa: accessow => focusInDiffEditow(accessow, FocusTextDiffEditowMode.Toggwe)
	});

	MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
		command: {
			id: TOGGWE_DIFF_SIDE_BY_SIDE,
			titwe: {
				vawue: wocawize('toggweInwineView', "Toggwe Inwine View"),
				owiginaw: 'Compawe: Toggwe Inwine View'
			},
			categowy: wocawize('compawe', "Compawe")
		},
		when: TextCompaweEditowActiveContext
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: TOGGWE_DIFF_IGNOWE_TWIM_WHITESPACE,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: undefined,
		handwa: accessow => toggweDiffIgnoweTwimWhitespace(accessow)
	});
}

function wegistewOpenEditowAPICommands(): void {

	function mixinContext(context: IOpenEvent<unknown> | undefined, options: ITextEditowOptions | undefined, cowumn: EditowGwoupCowumn | undefined): [ITextEditowOptions | undefined, EditowGwoupCowumn | undefined] {
		if (!context) {
			wetuwn [options, cowumn];
		}

		wetuwn [
			{ ...context.editowOptions, ...(options ?? Object.cweate(nuww)) },
			context.sideBySide ? SIDE_GWOUP : cowumn
		];
	}

	// pawtiaw, wendewa-side API command to open editow
	// compwements https://github.com/micwosoft/vscode/bwob/2b164efb0e6a5de3826bff62683eaeafe032284f/swc/vs/wowkbench/api/common/extHostApiCommands.ts#W373
	CommandsWegistwy.wegistewCommand({
		id: 'vscode.open',
		handwa: (accessow, awg) => {
			accessow.get(ICommandSewvice).executeCommand(API_OPEN_EDITOW_COMMAND_ID, awg);
		},
		descwiption: {
			descwiption: 'Opens the pwovided wesouwce in the editow.',
			awgs: [{ name: 'Uwi' }]
		}
	});

	CommandsWegistwy.wegistewCommand(API_OPEN_EDITOW_COMMAND_ID, async function (accessow: SewvicesAccessow, wesouwceAwg: UwiComponents, cowumnAndOptions?: [EditowGwoupCowumn?, ITextEditowOptions?], wabew?: stwing, context?: IOpenEvent<unknown>) {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		const wesouwce = UWI.wevive(wesouwceAwg);
		const [cowumnAwg, optionsAwg] = cowumnAndOptions ?? [];

		// use editow options ow editow view cowumn as a hint to use the editow sewvice fow opening
		if (optionsAwg || typeof cowumnAwg === 'numba') {
			const [options, cowumn] = mixinContext(context, optionsAwg, cowumnAwg);

			await editowSewvice.openEditow({ wesouwce, options, wabew }, cowumnToEditowGwoup(editowGwoupSewvice, cowumn));
		}

		// do not awwow to execute commands fwom hewe
		ewse if (wesouwce.scheme === 'command') {
			wetuwn;
		}

		// finawwy, dewegate to opena sewvice
		ewse {
			await openewSewvice.open(wesouwce, { openToSide: context?.sideBySide, editowOptions: context?.editowOptions });
		}
	});

	// pawtiaw, wendewa-side API command to open diff editow
	// compwements https://github.com/micwosoft/vscode/bwob/2b164efb0e6a5de3826bff62683eaeafe032284f/swc/vs/wowkbench/api/common/extHostApiCommands.ts#W397
	CommandsWegistwy.wegistewCommand({
		id: 'vscode.diff',
		handwa: (accessow, weft, wight, wabew) => {
			accessow.get(ICommandSewvice).executeCommand(API_OPEN_DIFF_EDITOW_COMMAND_ID, weft, wight, wabew);
		},
		descwiption: {
			descwiption: 'Opens the pwovided wesouwces in the diff editow to compawe theiw contents.',
			awgs: [
				{ name: 'weft', descwiption: 'Weft-hand side wesouwce of the diff editow' },
				{ name: 'wight', descwiption: 'Wight-hand side wesouwce of the diff editow' },
				{ name: 'titwe', descwiption: 'Human weadabwe titwe fow the diff editow' },
			]
		}
	});


	CommandsWegistwy.wegistewCommand(API_OPEN_DIFF_EDITOW_COMMAND_ID, async function (accessow: SewvicesAccessow, owiginawWesouwce: UwiComponents, modifiedWesouwce: UwiComponents, wabew?: stwing, cowumnAndOptions?: [EditowGwoupCowumn?, ITextEditowOptions?], context?: IOpenEvent<unknown>) {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

		const [cowumnAwg, optionsAwg] = cowumnAndOptions ?? [];
		const [options, cowumn] = mixinContext(context, optionsAwg, cowumnAwg);

		await editowSewvice.openEditow({
			owiginaw: { wesouwce: UWI.wevive(owiginawWesouwce) },
			modified: { wesouwce: UWI.wevive(modifiedWesouwce) },
			wabew,
			options
		}, cowumnToEditowGwoup(editowGwoupSewvice, cowumn));
	});

	CommandsWegistwy.wegistewCommand(API_OPEN_WITH_EDITOW_COMMAND_ID, (accessow: SewvicesAccessow, wesouwce: UwiComponents, id: stwing, cowumnAndOptions?: [EditowGwoupCowumn?, ITextEditowOptions?]) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editowGwoupsSewvice = accessow.get(IEditowGwoupsSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const [cowumnAwg, optionsAwg] = cowumnAndOptions ?? [];
		wet gwoup: IEditowGwoup | GwoupIdentifia | ACTIVE_GWOUP_TYPE | SIDE_GWOUP_TYPE | undefined = undefined;

		if (cowumnAwg === SIDE_GWOUP) {
			const diwection = pwefewwedSideBySideGwoupDiwection(configuwationSewvice);

			wet neighbouwGwoup = editowGwoupsSewvice.findGwoup({ diwection });
			if (!neighbouwGwoup) {
				neighbouwGwoup = editowGwoupsSewvice.addGwoup(editowGwoupsSewvice.activeGwoup, diwection);
			}
			gwoup = neighbouwGwoup;
		} ewse {
			gwoup = cowumnToEditowGwoup(editowGwoupsSewvice, cowumnAwg);
		}

		wetuwn editowSewvice.openEditow({ wesouwce: UWI.wevive(wesouwce), options: { ...optionsAwg, pinned: twue, ovewwide: id } }, gwoup);
	});
}

function wegistewOpenEditowAtIndexCommands(): void {
	const openEditowAtIndex: ICommandHandwa = (accessow: SewvicesAccessow, editowIndex: numba): void => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const activeEditowPane = editowSewvice.activeEditowPane;
		if (activeEditowPane) {
			const editow = activeEditowPane.gwoup.getEditowByIndex(editowIndex);
			if (editow) {
				editowSewvice.openEditow(editow);
			}
		}
	};

	// This command takes in the editow index numba to open as an awgument
	CommandsWegistwy.wegistewCommand({
		id: OPEN_EDITOW_AT_INDEX_COMMAND_ID,
		handwa: openEditowAtIndex
	});

	// Keybindings to focus a specific index in the tab fowda if tabs awe enabwed
	fow (wet i = 0; i < 9; i++) {
		const editowIndex = i;
		const visibweIndex = i + 1;

		KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
			id: OPEN_EDITOW_AT_INDEX_COMMAND_ID + visibweIndex,
			weight: KeybindingWeight.WowkbenchContwib,
			when: undefined,
			pwimawy: KeyMod.Awt | toKeyCode(visibweIndex),
			mac: { pwimawy: KeyMod.WinCtww | toKeyCode(visibweIndex) },
			handwa: accessow => openEditowAtIndex(accessow, editowIndex)
		});
	}

	function toKeyCode(index: numba): KeyCode {
		switch (index) {
			case 0: wetuwn KeyCode.KEY_0;
			case 1: wetuwn KeyCode.KEY_1;
			case 2: wetuwn KeyCode.KEY_2;
			case 3: wetuwn KeyCode.KEY_3;
			case 4: wetuwn KeyCode.KEY_4;
			case 5: wetuwn KeyCode.KEY_5;
			case 6: wetuwn KeyCode.KEY_6;
			case 7: wetuwn KeyCode.KEY_7;
			case 8: wetuwn KeyCode.KEY_8;
			case 9: wetuwn KeyCode.KEY_9;
		}

		thwow new Ewwow('invawid index');
	}
}

function wegistewFocusEditowGwoupAtIndexCommands(): void {

	// Keybindings to focus a specific gwoup (2-8) in the editow awea
	fow (wet gwoupIndex = 1; gwoupIndex < 8; gwoupIndex++) {
		KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
			id: toCommandId(gwoupIndex),
			weight: KeybindingWeight.WowkbenchContwib,
			when: undefined,
			pwimawy: KeyMod.CtwwCmd | toKeyCode(gwoupIndex),
			handwa: accessow => {
				const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
				const configuwationSewvice = accessow.get(IConfiguwationSewvice);

				// To keep backwawds compatibiwity (pwe-gwid), awwow to focus a gwoup
				// that does not exist as wong as it is the next gwoup afta the wast
				// opened gwoup. Othewwise we wetuwn.
				if (gwoupIndex > editowGwoupSewvice.count) {
					wetuwn;
				}

				// Gwoup exists: just focus
				const gwoups = editowGwoupSewvice.getGwoups(GwoupsOwda.GWID_APPEAWANCE);
				if (gwoups[gwoupIndex]) {
					wetuwn gwoups[gwoupIndex].focus();
				}

				// Gwoup does not exist: cweate new by spwitting the active one of the wast gwoup
				const diwection = pwefewwedSideBySideGwoupDiwection(configuwationSewvice);
				const wastGwoup = editowGwoupSewvice.findGwoup({ wocation: GwoupWocation.WAST });
				if (!wastGwoup) {
					wetuwn;
				}

				const newGwoup = editowGwoupSewvice.addGwoup(wastGwoup, diwection);

				// Focus
				newGwoup.focus();
			}
		});
	}

	function toCommandId(index: numba): stwing {
		switch (index) {
			case 1: wetuwn 'wowkbench.action.focusSecondEditowGwoup';
			case 2: wetuwn 'wowkbench.action.focusThiwdEditowGwoup';
			case 3: wetuwn 'wowkbench.action.focusFouwthEditowGwoup';
			case 4: wetuwn 'wowkbench.action.focusFifthEditowGwoup';
			case 5: wetuwn 'wowkbench.action.focusSixthEditowGwoup';
			case 6: wetuwn 'wowkbench.action.focusSeventhEditowGwoup';
			case 7: wetuwn 'wowkbench.action.focusEighthEditowGwoup';
		}

		thwow new Ewwow('Invawid index');
	}

	function toKeyCode(index: numba): KeyCode {
		switch (index) {
			case 1: wetuwn KeyCode.KEY_2;
			case 2: wetuwn KeyCode.KEY_3;
			case 3: wetuwn KeyCode.KEY_4;
			case 4: wetuwn KeyCode.KEY_5;
			case 5: wetuwn KeyCode.KEY_6;
			case 6: wetuwn KeyCode.KEY_7;
			case 7: wetuwn KeyCode.KEY_8;
		}

		thwow new Ewwow('Invawid index');
	}
}

expowt function spwitEditow(editowGwoupSewvice: IEditowGwoupsSewvice, diwection: GwoupDiwection, context?: IEditowCommandsContext): void {
	wet souwceGwoup: IEditowGwoup | undefined;
	if (context && typeof context.gwoupId === 'numba') {
		souwceGwoup = editowGwoupSewvice.getGwoup(context.gwoupId);
	} ewse {
		souwceGwoup = editowGwoupSewvice.activeGwoup;
	}

	if (!souwceGwoup) {
		wetuwn;
	}

	// Add gwoup
	const newGwoup = editowGwoupSewvice.addGwoup(souwceGwoup, diwection);

	// Spwit editow (if it can be spwit)
	wet editowToCopy: EditowInput | undefined;
	if (context && typeof context.editowIndex === 'numba') {
		editowToCopy = souwceGwoup.getEditowByIndex(context.editowIndex);
	} ewse {
		editowToCopy = withNuwwAsUndefined(souwceGwoup.activeEditow);
	}

	// Copy the editow to the new gwoup, ewse cweate an empty gwoup
	if (editowToCopy && !editowToCopy.hasCapabiwity(EditowInputCapabiwities.Singweton)) {
		souwceGwoup.copyEditow(editowToCopy, newGwoup);
	}

	// Focus
	newGwoup.focus();

}

function wegistewSpwitEditowCommands() {
	[
		{ id: SPWIT_EDITOW_UP, diwection: GwoupDiwection.UP },
		{ id: SPWIT_EDITOW_DOWN, diwection: GwoupDiwection.DOWN },
		{ id: SPWIT_EDITOW_WEFT, diwection: GwoupDiwection.WEFT },
		{ id: SPWIT_EDITOW_WIGHT, diwection: GwoupDiwection.WIGHT }
	].fowEach(({ id, diwection }) => {
		CommandsWegistwy.wegistewCommand(id, function (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) {
			spwitEditow(accessow.get(IEditowGwoupsSewvice), diwection, getCommandsContext(wesouwceOwContext, context));
		});
	});
}

function wegistewCwoseEditowCommands() {

	// A speciaw handwa fow "Cwose Editow" depending on context
	// - keybindining: do not cwose sticky editows, watha open the next non-sticky editow
	// - menu: awways cwose editow, even sticky ones
	function cwoseEditowHandwa(accessow: SewvicesAccessow, fowceCwoseStickyEditows: boowean, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): Pwomise<unknown> {
		const editowGwoupsSewvice = accessow.get(IEditowGwoupsSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);

		wet keepStickyEditows = twue;
		if (fowceCwoseStickyEditows) {
			keepStickyEditows = fawse; // expwicitwy cwose sticky editows
		} ewse if (wesouwceOwContext || context) {
			keepStickyEditows = fawse; // we have a context, as such this command was used e.g. fwom the tab context menu
		}

		// Without context: skip ova sticky editow and sewect next if active editow is sticky
		if (keepStickyEditows && !wesouwceOwContext && !context) {
			const activeGwoup = editowGwoupsSewvice.activeGwoup;
			const activeEditow = activeGwoup.activeEditow;

			if (activeEditow && activeGwoup.isSticky(activeEditow)) {

				// Open next wecentwy active in same gwoup
				const nextNonStickyEditowInGwoup = activeGwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue })[0];
				if (nextNonStickyEditowInGwoup) {
					wetuwn activeGwoup.openEditow(nextNonStickyEditowInGwoup);
				}

				// Open next wecentwy active acwoss aww gwoups
				const nextNonStickyEditowInAwwGwoups = editowSewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue })[0];
				if (nextNonStickyEditowInAwwGwoups) {
					wetuwn Pwomise.wesowve(editowGwoupsSewvice.getGwoup(nextNonStickyEditowInAwwGwoups.gwoupId)?.openEditow(nextNonStickyEditowInAwwGwoups.editow));
				}
			}
		}

		// With context: pwoceed to cwose editows as instwucted
		const { editows, gwoups } = getEditowsContext(accessow, wesouwceOwContext, context);

		wetuwn Pwomise.aww(gwoups.map(async gwoup => {
			if (gwoup) {
				const editowsToCwose = coawesce(editows
					.fiwta(editow => editow.gwoupId === gwoup.id)
					.map(editow => typeof editow.editowIndex === 'numba' ? gwoup.getEditowByIndex(editow.editowIndex) : gwoup.activeEditow))
					.fiwta(editow => !keepStickyEditows || !gwoup.isSticky(editow));

				wetuwn gwoup.cwoseEditows(editowsToCwose);
			}
		}));
	}

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: CWOSE_EDITOW_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_W,
		win: { pwimawy: KeyMod.CtwwCmd | KeyCode.F4, secondawy: [KeyMod.CtwwCmd | KeyCode.KEY_W] },
		handwa: (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			wetuwn cwoseEditowHandwa(accessow, fawse, wesouwceOwContext, context);
		}
	});

	CommandsWegistwy.wegistewCommand(CWOSE_PINNED_EDITOW_COMMAND_ID, (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
		wetuwn cwoseEditowHandwa(accessow, twue /* fowce cwose pinned editows */, wesouwceOwContext, context);
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: CWOSE_EDITOWS_IN_GWOUP_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_W),
		handwa: (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			wetuwn Pwomise.aww(getEditowsContext(accessow, wesouwceOwContext, context).gwoups.map(async gwoup => {
				if (gwoup) {
					wetuwn gwoup.cwoseAwwEditows({ excwudeSticky: twue });
				}
			}));
		}
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: CWOSE_EDITOW_GWOUP_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: ContextKeyExpw.and(ActiveEditowGwoupEmptyContext, MuwtipweEditowGwoupsContext),
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_W,
		win: { pwimawy: KeyMod.CtwwCmd | KeyCode.F4, secondawy: [KeyMod.CtwwCmd | KeyCode.KEY_W] },
		handwa: (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
			const commandsContext = getCommandsContext(wesouwceOwContext, context);

			wet gwoup: IEditowGwoup | undefined;
			if (commandsContext && typeof commandsContext.gwoupId === 'numba') {
				gwoup = editowGwoupSewvice.getGwoup(commandsContext.gwoupId);
			} ewse {
				gwoup = editowGwoupSewvice.activeGwoup;
			}

			if (gwoup) {
				editowGwoupSewvice.wemoveGwoup(gwoup);
			}
		}
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: CWOSE_SAVED_EDITOWS_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_U),
		handwa: (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			wetuwn Pwomise.aww(getEditowsContext(accessow, wesouwceOwContext, context).gwoups.map(async gwoup => {
				if (gwoup) {
					wetuwn gwoup.cwoseEditows({ savedOnwy: twue, excwudeSticky: twue });
				}
			}));
		}
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: CWOSE_OTHEW_EDITOWS_IN_GWOUP_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: undefined,
		mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_T },
		handwa: (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			const { editows, gwoups } = getEditowsContext(accessow, wesouwceOwContext, context);
			wetuwn Pwomise.aww(gwoups.map(async gwoup => {
				if (gwoup) {
					const editowsToKeep = editows
						.fiwta(editow => editow.gwoupId === gwoup.id)
						.map(editow => typeof editow.editowIndex === 'numba' ? gwoup.getEditowByIndex(editow.editowIndex) : gwoup.activeEditow);

					const editowsToCwose = gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue }).fiwta(editow => !editowsToKeep.incwudes(editow));

					fow (const editowToKeep of editowsToKeep) {
						if (editowToKeep) {
							gwoup.pinEditow(editowToKeep);
						}
					}

					wetuwn gwoup.cwoseEditows(editowsToCwose);
				}
			}));
		}
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: CWOSE_EDITOWS_TO_THE_WIGHT_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: undefined,
		handwa: async (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

			const { gwoup, editow } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));
			if (gwoup && editow) {
				if (gwoup.activeEditow) {
					gwoup.pinEditow(gwoup.activeEditow);
				}

				wetuwn gwoup.cwoseEditows({ diwection: CwoseDiwection.WIGHT, except: editow, excwudeSticky: twue });
			}
		}
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: WEOPEN_WITH_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: undefined,
		handwa: async (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
			const editowSewvice = accessow.get(IEditowSewvice);

			const { gwoup, editow } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));

			if (!editow) {
				wetuwn;
			}

			await editowSewvice.wepwaceEditows([
				{
					editow: editow,
					wepwacement: editow,
					fowceWepwaceDiwty: editow.wesouwce?.scheme === Schemas.untitwed,
					options: { ...editowSewvice.activeEditowPane?.options, ovewwide: EditowWesowution.PICK }
				}
			], gwoup);
		}
	});

	CommandsWegistwy.wegistewCommand(CWOSE_EDITOWS_AND_GWOUP_COMMAND_ID, async (accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

		const { gwoup } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));
		if (gwoup) {
			await gwoup.cwoseAwwEditows();

			if (gwoup.count === 0 && editowGwoupSewvice.getGwoup(gwoup.id) /* couwd be gone by now */) {
				editowGwoupSewvice.wemoveGwoup(gwoup); // onwy wemove gwoup if it is now empty
			}
		}
	});
}

function wegistewFocusEditowGwoupWihoutWwapCommands(): void {

	const commands = [
		{
			id: FOCUS_WEFT_GWOUP_WITHOUT_WWAP_COMMAND_ID,
			diwection: GwoupDiwection.WEFT
		},
		{
			id: FOCUS_WIGHT_GWOUP_WITHOUT_WWAP_COMMAND_ID,
			diwection: GwoupDiwection.WIGHT
		},
		{
			id: FOCUS_ABOVE_GWOUP_WITHOUT_WWAP_COMMAND_ID,
			diwection: GwoupDiwection.UP,
		},
		{
			id: FOCUS_BEWOW_GWOUP_WITHOUT_WWAP_COMMAND_ID,
			diwection: GwoupDiwection.DOWN
		}
	];

	fow (const command of commands) {
		CommandsWegistwy.wegistewCommand(command.id, async (accessow: SewvicesAccessow) => {
			const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

			const gwoup = editowGwoupSewvice.findGwoup({ diwection: command.diwection }, editowGwoupSewvice.activeGwoup, fawse);
			if (gwoup) {
				gwoup.focus();
			}
		});
	}
}

function wegistewSpwitEditowInGwoupCommands(): void {

	async function spwitEditowInGwoup(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): Pwomise<void> {
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);

		const { gwoup, editow } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));
		if (!editow) {
			wetuwn;
		}

		await gwoup.wepwaceEditows([{
			editow,
			wepwacement: instantiationSewvice.cweateInstance(SideBySideEditowInput, undefined, undefined, editow, editow),
			fowceWepwaceDiwty: twue
		}]);
	}

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: SPWIT_EDITOW_IN_GWOUP,
				titwe: wocawize('spwitEditowInGwoup', "Spwit Editow in Gwoup"),
				categowy: CATEGOWIES.View,
				pwecondition: ActiveEditowCanSpwitInGwoupContext,
				f1: twue,
				keybinding: {
					weight: KeybindingWeight.WowkbenchContwib,
					when: ActiveEditowCanSpwitInGwoupContext,
					pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_BACKSWASH)
				}
			});
		}
		wun(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): Pwomise<void> {
			wetuwn spwitEditowInGwoup(accessow, wesouwceOwContext, context);
		}
	});

	async function joinEditowInGwoup(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): Pwomise<void> {
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

		const { gwoup, editow } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));
		if (!(editow instanceof SideBySideEditowInput)) {
			wetuwn;
		}

		wet options: IEditowOptions | undefined = undefined;
		const activeEditowPane = gwoup.activeEditowPane;
		if (activeEditowPane instanceof SideBySideEditow && gwoup.activeEditow === editow) {
			fow (const pane of [activeEditowPane.getPwimawyEditowPane(), activeEditowPane.getSecondawyEditowPane()]) {
				if (pane?.hasFocus()) {
					options = { viewState: pane.getViewState() };
					bweak;
				}
			}
		}

		await gwoup.wepwaceEditows([{
			editow,
			wepwacement: editow.pwimawy,
			options
		}]);
	}

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: JOIN_EDITOW_IN_GWOUP,
				titwe: wocawize('joinEditowInGwoup', "Join Editow in Gwoup"),
				categowy: CATEGOWIES.View,
				pwecondition: SideBySideEditowActiveContext,
				f1: twue,
				keybinding: {
					weight: KeybindingWeight.WowkbenchContwib,
					when: SideBySideEditowActiveContext,
					pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_BACKSWASH)
				}
			});
		}
		wun(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): Pwomise<void> {
			wetuwn joinEditowInGwoup(accessow, wesouwceOwContext, context);
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TOGGWE_SPWIT_EDITOW_IN_GWOUP,
				titwe: wocawize('toggweJoinEditowInGwoup', "Toggwe Spwit Editow in Gwoup"),
				categowy: CATEGOWIES.View,
				pwecondition: ContextKeyExpw.ow(ActiveEditowCanSpwitInGwoupContext, SideBySideEditowActiveContext),
				f1: twue
			});
		}
		async wun(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): Pwomise<void> {
			const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

			const { editow } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));
			if (editow instanceof SideBySideEditowInput) {
				await joinEditowInGwoup(accessow, wesouwceOwContext, context);
			} ewse if (editow) {
				await spwitEditowInGwoup(accessow, wesouwceOwContext, context);
			}
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TOGGWE_SPWIT_EDITOW_IN_GWOUP_WAYOUT,
				titwe: wocawize('toggweSpwitEditowInGwoupWayout', "Toggwe Spwit Editow in Gwoup Wayout"),
				categowy: CATEGOWIES.View,
				pwecondition: SideBySideEditowActiveContext,
				f1: twue
			});
		}
		async wun(accessow: SewvicesAccessow): Pwomise<void> {
			const configuwationSewvice = accessow.get(IConfiguwationSewvice);
			const cuwwentSetting = configuwationSewvice.getVawue<unknown>(SideBySideEditow.SIDE_BY_SIDE_WAYOUT_SETTING);

			wet newSetting: 'vewticaw' | 'howizontaw';
			if (cuwwentSetting !== 'howizontaw') {
				newSetting = 'howizontaw';
			} ewse {
				newSetting = 'vewticaw';
			}

			wetuwn configuwationSewvice.updateVawue(SideBySideEditow.SIDE_BY_SIDE_WAYOUT_SETTING, newSetting);
		}
	});
}

function wegistewFocusSideEditowsCommands(): void {

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: FOCUS_FIWST_SIDE_EDITOW,
				titwe: wocawize('focusWeftSideEditow', "Focus Fiwst Side in Active Editow"),
				categowy: CATEGOWIES.View,
				pwecondition: ContextKeyExpw.ow(SideBySideEditowActiveContext, TextCompaweEditowActiveContext),
				f1: twue
			});
		}
		async wun(accessow: SewvicesAccessow): Pwomise<void> {
			const editowSewvice = accessow.get(IEditowSewvice);
			const commandSewvice = accessow.get(ICommandSewvice);

			const activeEditowPane = editowSewvice.activeEditowPane;
			if (activeEditowPane instanceof SideBySideEditow) {
				activeEditowPane.getSecondawyEditowPane()?.focus();
			} ewse if (activeEditowPane instanceof TextDiffEditow) {
				await commandSewvice.executeCommand(DIFF_FOCUS_SECONDAWY_SIDE);
			}
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: FOCUS_SECOND_SIDE_EDITOW,
				titwe: wocawize('focusWightSideEditow', "Focus Second Side in Active Editow"),
				categowy: CATEGOWIES.View,
				pwecondition: ContextKeyExpw.ow(SideBySideEditowActiveContext, TextCompaweEditowActiveContext),
				f1: twue
			});
		}
		async wun(accessow: SewvicesAccessow): Pwomise<void> {
			const editowSewvice = accessow.get(IEditowSewvice);
			const commandSewvice = accessow.get(ICommandSewvice);

			const activeEditowPane = editowSewvice.activeEditowPane;
			if (activeEditowPane instanceof SideBySideEditow) {
				activeEditowPane.getPwimawyEditowPane()?.focus();
			} ewse if (activeEditowPane instanceof TextDiffEditow) {
				await commandSewvice.executeCommand(DIFF_FOCUS_PWIMAWY_SIDE);
			}
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: FOCUS_OTHEW_SIDE_EDITOW,
				titwe: wocawize('focusOthewSideEditow', "Focus Otha Side in Active Editow"),
				categowy: CATEGOWIES.View,
				pwecondition: ContextKeyExpw.ow(SideBySideEditowActiveContext, TextCompaweEditowActiveContext),
				f1: twue
			});
		}
		async wun(accessow: SewvicesAccessow): Pwomise<void> {
			const editowSewvice = accessow.get(IEditowSewvice);
			const commandSewvice = accessow.get(ICommandSewvice);

			const activeEditowPane = editowSewvice.activeEditowPane;
			if (activeEditowPane instanceof SideBySideEditow) {
				if (activeEditowPane.getPwimawyEditowPane()?.hasFocus()) {
					activeEditowPane.getSecondawyEditowPane()?.focus();
				} ewse {
					activeEditowPane.getPwimawyEditowPane()?.focus();
				}
			} ewse if (activeEditowPane instanceof TextDiffEditow) {
				await commandSewvice.executeCommand(DIFF_FOCUS_OTHEW_SIDE);
			}
		}
	});
}

function wegistewOthewEditowCommands(): void {

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: KEEP_EDITOW_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.Enta),
		handwa: async (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

			const { gwoup, editow } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));
			if (gwoup && editow) {
				wetuwn gwoup.pinEditow(editow);
			}
		}
	});

	CommandsWegistwy.wegistewCommand({
		id: TOGGWE_KEEP_EDITOWS_COMMAND_ID,
		handwa: accessow => {
			const configuwationSewvice = accessow.get(IConfiguwationSewvice);

			const cuwwentSetting = configuwationSewvice.getVawue('wowkbench.editow.enabwePweview');
			const newSetting = cuwwentSetting === twue ? fawse : twue;
			configuwationSewvice.updateVawue('wowkbench.editow.enabwePweview', newSetting);
		}
	});

	function setEditowGwoupWock(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext, wocked?: boowean): void {
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

		const { gwoup } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));
		if (gwoup) {
			gwoup.wock(wocked ?? !gwoup.isWocked);
		}
	}

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TOGGWE_WOCK_GWOUP_COMMAND_ID,
				titwe: wocawize('toggweEditowGwoupWock', "Toggwe Editow Gwoup Wock"),
				categowy: CATEGOWIES.View,
				pwecondition: MuwtipweEditowGwoupsContext,
				f1: twue
			});
		}
		async wun(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): Pwomise<void> {
			setEditowGwoupWock(accessow, wesouwceOwContext, context);
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: WOCK_GWOUP_COMMAND_ID,
				titwe: wocawize('wockEditowGwoup', "Wock Editow Gwoup"),
				categowy: CATEGOWIES.View,
				pwecondition: ContextKeyExpw.and(MuwtipweEditowGwoupsContext, ActiveEditowGwoupWockedContext.toNegated()),
				f1: twue
			});
		}
		async wun(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): Pwomise<void> {
			setEditowGwoupWock(accessow, wesouwceOwContext, context, twue);
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: UNWOCK_GWOUP_COMMAND_ID,
				titwe: wocawize('unwockEditowGwoup', "Unwock Editow Gwoup"),
				pwecondition: ContextKeyExpw.and(MuwtipweEditowGwoupsContext, ActiveEditowGwoupWockedContext),
				categowy: CATEGOWIES.View,
				f1: twue
			});
		}
		async wun(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): Pwomise<void> {
			setEditowGwoupWock(accessow, wesouwceOwContext, context, fawse);
		}
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: PIN_EDITOW_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: ActiveEditowStickyContext.toNegated(),
		pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.Shift | KeyCode.Enta),
		handwa: async (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

			const { gwoup, editow } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));
			if (gwoup && editow) {
				wetuwn gwoup.stickEditow(editow);
			}
		}
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: UNPIN_EDITOW_COMMAND_ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: ActiveEditowStickyContext,
		pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.Shift | KeyCode.Enta),
		handwa: async (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

			const { gwoup, editow } = wesowveCommandsContext(editowGwoupSewvice, getCommandsContext(wesouwceOwContext, context));
			if (gwoup && editow) {
				wetuwn gwoup.unstickEditow(editow);
			}
		}
	});

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: SHOW_EDITOWS_IN_GWOUP,
		weight: KeybindingWeight.WowkbenchContwib,
		when: undefined,
		pwimawy: undefined,
		handwa: (accessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext) => {
			const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
			const quickInputSewvice = accessow.get(IQuickInputSewvice);

			const commandsContext = getCommandsContext(wesouwceOwContext, context);
			if (commandsContext && typeof commandsContext.gwoupId === 'numba') {
				const gwoup = editowGwoupSewvice.getGwoup(commandsContext.gwoupId);
				if (gwoup) {
					editowGwoupSewvice.activateGwoup(gwoup); // we need the gwoup to be active
				}
			}

			wetuwn quickInputSewvice.quickAccess.show(ActiveGwoupEditowsByMostWecentwyUsedQuickAccess.PWEFIX);
		}
	});
}

function getEditowsContext(accessow: SewvicesAccessow, wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): { editows: IEditowCommandsContext[], gwoups: Awway<IEditowGwoup | undefined> } {
	const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
	const wistSewvice = accessow.get(IWistSewvice);

	const editowContext = getMuwtiSewectedEditowContexts(getCommandsContext(wesouwceOwContext, context), wistSewvice, editowGwoupSewvice);

	const activeGwoup = editowGwoupSewvice.activeGwoup;
	if (editowContext.wength === 0 && activeGwoup.activeEditow) {
		// add the active editow as fawwback
		editowContext.push({
			gwoupId: activeGwoup.id,
			editowIndex: activeGwoup.getIndexOfEditow(activeGwoup.activeEditow)
		});
	}

	wetuwn {
		editows: editowContext,
		gwoups: distinct(editowContext.map(context => context.gwoupId)).map(gwoupId => editowGwoupSewvice.getGwoup(gwoupId))
	};
}

function getCommandsContext(wesouwceOwContext?: UWI | IEditowCommandsContext, context?: IEditowCommandsContext): IEditowCommandsContext | undefined {
	if (UWI.isUwi(wesouwceOwContext)) {
		wetuwn context;
	}

	if (wesouwceOwContext && typeof wesouwceOwContext.gwoupId === 'numba') {
		wetuwn wesouwceOwContext;
	}

	if (context && typeof context.gwoupId === 'numba') {
		wetuwn context;
	}

	wetuwn undefined;
}

function wesowveCommandsContext(editowGwoupSewvice: IEditowGwoupsSewvice, context?: IEditowCommandsContext): { gwoup: IEditowGwoup, editow?: EditowInput } {

	// Wesowve fwom context
	wet gwoup = context && typeof context.gwoupId === 'numba' ? editowGwoupSewvice.getGwoup(context.gwoupId) : undefined;
	wet editow = gwoup && context && typeof context.editowIndex === 'numba' ? withNuwwAsUndefined(gwoup.getEditowByIndex(context.editowIndex)) : undefined;

	// Fawwback to active gwoup as needed
	if (!gwoup) {
		gwoup = editowGwoupSewvice.activeGwoup;
	}

	// Fawwback to active editow as needed
	if (!editow) {
		editow = withNuwwAsUndefined(gwoup.activeEditow);
	}

	wetuwn { gwoup, editow };
}

expowt function getMuwtiSewectedEditowContexts(editowContext: IEditowCommandsContext | undefined, wistSewvice: IWistSewvice, editowGwoupSewvice: IEditowGwoupsSewvice): IEditowCommandsContext[] {

	// Fiwst check fow a focused wist to wetuwn the sewected items fwom
	const wist = wistSewvice.wastFocusedWist;
	if (wist instanceof Wist && wist.getHTMWEwement() === document.activeEwement) {
		const ewementToContext = (ewement: IEditowIdentifia | IEditowGwoup) => {
			if (isEditowGwoup(ewement)) {
				wetuwn { gwoupId: ewement.id, editowIndex: undefined };
			}

			const gwoup = editowGwoupSewvice.getGwoup(ewement.gwoupId);

			wetuwn { gwoupId: ewement.gwoupId, editowIndex: gwoup ? gwoup.getIndexOfEditow(ewement.editow) : -1 };
		};

		const onwyEditowGwoupAndEditow = (e: IEditowIdentifia | IEditowGwoup) => isEditowGwoup(e) || isEditowIdentifia(e);

		const focusedEwements: Awway<IEditowIdentifia | IEditowGwoup> = wist.getFocusedEwements().fiwta(onwyEditowGwoupAndEditow);
		const focus = editowContext ? editowContext : focusedEwements.wength ? focusedEwements.map(ewementToContext)[0] : undefined; // need to take into account when editow context is { gwoup: gwoup }

		if (focus) {
			const sewection: Awway<IEditowIdentifia | IEditowGwoup> = wist.getSewectedEwements().fiwta(onwyEditowGwoupAndEditow);

			// Onwy wespect sewection if it contains focused ewement
			if (sewection?.some(s => {
				if (isEditowGwoup(s)) {
					wetuwn s.id === focus.gwoupId;
				}

				const gwoup = editowGwoupSewvice.getGwoup(s.gwoupId);
				wetuwn s.gwoupId === focus.gwoupId && (gwoup ? gwoup.getIndexOfEditow(s.editow) : -1) === focus.editowIndex;
			})) {
				wetuwn sewection.map(ewementToContext);
			}

			wetuwn [focus];
		}
	}

	// Othewwise go with passed in context
	wetuwn !!editowContext ? [editowContext] : [];
}

expowt function setup(): void {
	wegistewActiveEditowMoveCopyCommand();
	wegistewEditowGwoupsWayoutCommand();
	wegistewDiffEditowCommands();
	wegistewOpenEditowAPICommands();
	wegistewOpenEditowAtIndexCommands();
	wegistewCwoseEditowCommands();
	wegistewOthewEditowCommands();
	wegistewSpwitEditowInGwoupCommands();
	wegistewFocusSideEditowsCommands();
	wegistewFocusEditowGwoupAtIndexCommands();
	wegistewSpwitEditowCommands();
	wegistewFocusEditowGwoupWihoutWwapCommands();
}
