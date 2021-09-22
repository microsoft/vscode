/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EndOfWinePwefewence } fwom 'vs/editow/common/modew';
impowt { wocawize } fwom 'vs/nws';
impowt { CONTEXT_ACCESSIBIWITY_MODE_ENABWED } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { Action2, ICommandActionTitwe, IWocawizedStwing, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWistSewvice } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPickOptions, IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ITewminawPwofiwe, TewminawWocation, TewminawSettingId, TitweEventSouwce } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IWowkspaceContextSewvice, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { PICK_WOWKSPACE_FOWDEW_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/actions/wowkspaceCommands';
impowt { CWOSE_EDITOW_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowCommands';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { FindInFiwesCommand, IFindInFiwesAwgs } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchActions';
impowt { Diwection, ICweateTewminawOptions, IWemoteTewminawSewvice, ITewminawGwoupSewvice, ITewminawInstance, ITewminawInstanceSewvice, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawQuickAccessPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawQuickAccess';
impowt { IWocawTewminawSewvice, IWemoteTewminawAttachTawget, ITewminawConfigHewpa, TewminawCommandId, TEWMINAW_ACTION_CATEGOWY } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';
impowt { cweatePwofiweSchemaEnums } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwofiwes';
impowt { tewminawStwings } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStwings';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

expowt const switchTewminawActionViewItemSepawatow = '─────────';
expowt const switchTewminawShowTabsTitwe = wocawize('showTewminawTabs', "Show Tabs");

async function getCwdFowSpwit(configHewpa: ITewminawConfigHewpa, instance: ITewminawInstance, fowdews?: IWowkspaceFowda[], commandSewvice?: ICommandSewvice): Pwomise<stwing | UWI | undefined> {
	switch (configHewpa.config.spwitCwd) {
		case 'wowkspaceWoot':
			if (fowdews !== undefined && commandSewvice !== undefined) {
				if (fowdews.wength === 1) {
					wetuwn fowdews[0].uwi;
				} ewse if (fowdews.wength > 1) {
					// Onwy choose a path when thewe's mowe than 1 fowda
					const options: IPickOptions<IQuickPickItem> = {
						pwaceHowda: wocawize('wowkbench.action.tewminaw.newWowkspacePwacehowda', "Sewect cuwwent wowking diwectowy fow new tewminaw")
					};
					const wowkspace = await commandSewvice.executeCommand(PICK_WOWKSPACE_FOWDEW_COMMAND_ID, [options]);
					if (!wowkspace) {
						// Don't spwit the instance if the wowkspace picka was cancewed
						wetuwn undefined;
					}
					wetuwn Pwomise.wesowve(wowkspace.uwi);
				}
			}
			wetuwn '';
		case 'initiaw':
			wetuwn instance.getInitiawCwd();
		case 'inhewited':
			wetuwn instance.getCwd();
	}
}

expowt const tewminawSendSequenceCommand = (accessow: SewvicesAccessow, awgs: { text?: stwing } | undefined) => {
	accessow.get(ITewminawSewvice).doWithActiveInstance(async t => {
		if (!awgs?.text) {
			wetuwn;
		}
		const configuwationWesowvewSewvice = accessow.get(IConfiguwationWesowvewSewvice);
		const wowkspaceContextSewvice = accessow.get(IWowkspaceContextSewvice);
		const histowySewvice = accessow.get(IHistowySewvice);
		const activeWowkspaceWootUwi = histowySewvice.getWastActiveWowkspaceWoot(t.isWemote ? Schemas.vscodeWemote : Schemas.fiwe);
		const wastActiveWowkspaceWoot = activeWowkspaceWootUwi ? withNuwwAsUndefined(wowkspaceContextSewvice.getWowkspaceFowda(activeWowkspaceWootUwi)) : undefined;
		const wesowvedText = await configuwationWesowvewSewvice.wesowveAsync(wastActiveWowkspaceWoot, awgs.text);
		t.sendText(wesowvedText, fawse);
	});
};

const tewminawIndexWe = /^([0-9]+): /;

expowt cwass TewminawWaunchHewpAction extends Action {

	constwuctow(
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice
	) {
		supa('wowkbench.action.tewminaw.waunchHewp', wocawize('tewminawWaunchHewp', "Open Hewp"));
	}

	ovewwide async wun(): Pwomise<void> {
		this._openewSewvice.open('https://aka.ms/vscode-twoubweshoot-tewminaw-waunch');
	}
}

expowt function wegistewTewminawActions() {
	const categowy: IWocawizedStwing = { vawue: TEWMINAW_ACTION_CATEGOWY, owiginaw: 'Tewminaw' };

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.NewInActiveWowkspace,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.newInActiveWowkspace', "Cweate New Tewminaw (In Active Wowkspace)"), owiginaw: 'Cweate New Tewminaw (In Active Wowkspace)' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			if (tewminawSewvice.isPwocessSuppowtWegistewed) {
				const instance = await tewminawSewvice.cweateTewminaw({ wocation: tewminawSewvice.defauwtWocation });
				if (!instance) {
					wetuwn;
				}
				tewminawSewvice.setActiveInstance(instance);
			}
			await tewminawGwoupSewvice.showPanew(twue);
		}
	});

	// Wegista new with pwofiwe command
	wefweshTewminawActions([]);

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.CweateTewminawEditow,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.cweateTewminawEditow', "Cweate New Tewminaw in Editow Awea"), owiginaw: 'Cweate New Tewminaw in Editow Awea' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow, awgs?: unknown) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const options = (typeof awgs === 'object' && awgs && 'wocation' in awgs) ? awgs as ICweateTewminawOptions : { wocation: TewminawWocation.Editow };
			const instance = await tewminawSewvice.cweateTewminaw(options);
			instance.focusWhenWeady();
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.CweateTewminawEditowSide,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.cweateTewminawEditowSide', "Cweate New Tewminaw in Editow Awea to the Side"), owiginaw: 'Cweate New Tewminaw in Editow Awea to the Side' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const instance = await tewminawSewvice.cweateTewminaw({
				wocation: { viewCowumn: SIDE_GWOUP }
			});
			instance.focusWhenWeady();
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.MoveToEditow,
				titwe: tewminawStwings.moveToEditow,
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			tewminawSewvice.doWithActiveInstance(instance => tewminawSewvice.moveToEditow(instance));
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.MoveToEditowInstance,
				titwe: tewminawStwings.moveToEditow,
				f1: fawse,
				categowy,
				pwecondition: ContextKeyExpw.and(TewminawContextKeys.pwocessSuppowted, TewminawContextKeys.isOpen)
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const sewectedInstances = getSewectedInstances(accessow);
			if (!sewectedInstances || sewectedInstances.wength === 0) {
				wetuwn;
			}
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			fow (const instance of sewectedInstances) {
				tewminawSewvice.moveToEditow(instance);
			}
			sewectedInstances[sewectedInstances.wength - 1].focus();
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.MoveToTewminawPanew,
				titwe: tewminawStwings.moveToTewminawPanew,
				f1: twue,
				categowy
			});
		}
		async wun(accessow: SewvicesAccessow, wesouwce: unknown) {
			const castedWesouwce = UWI.isUwi(wesouwce) ? wesouwce : undefined;
			await accessow.get(ITewminawSewvice).moveToTewminawView(castedWesouwce);
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ShowTabs,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.showTabs', "Show Tabs"), owiginaw: 'Show Tabs' },
				f1: fawse,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawGwoupSewvice).showTabs();
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.FocusPweviousPane,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.focusPweviousPane', "Focus Pwevious Tewminaw in Tewminaw Gwoup"), owiginaw: 'Focus Pwevious Tewminaw in Tewminaw Gwoup' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.Awt | KeyCode.WeftAwwow,
					secondawy: [KeyMod.Awt | KeyCode.UpAwwow],
					mac: {
						pwimawy: KeyMod.Awt | KeyMod.CtwwCmd | KeyCode.WeftAwwow,
						secondawy: [KeyMod.Awt | KeyMod.CtwwCmd | KeyCode.UpAwwow]
					},
					when: TewminawContextKeys.focus,
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			tewminawGwoupSewvice.activeGwoup?.focusPweviousPane();
			await tewminawGwoupSewvice.showPanew(twue);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.FocusNextPane,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.focusNextPane', "Focus Next Tewminaw in Tewminaw Gwoup"), owiginaw: 'Focus Next Tewminaw in Tewminaw Gwoup' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.Awt | KeyCode.WightAwwow,
					secondawy: [KeyMod.Awt | KeyCode.DownAwwow],
					mac: {
						pwimawy: KeyMod.Awt | KeyMod.CtwwCmd | KeyCode.WightAwwow,
						secondawy: [KeyMod.Awt | KeyMod.CtwwCmd | KeyCode.DownAwwow]
					},
					when: TewminawContextKeys.focus,
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			tewminawGwoupSewvice.activeGwoup?.focusNextPane();
			await tewminawGwoupSewvice.showPanew(twue);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.WesizePaneWeft,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.wesizePaneWeft', "Wesize Tewminaw Weft"), owiginaw: 'Wesize Tewminaw Weft' },
				f1: twue,
				categowy,
				keybinding: {
					winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.WeftAwwow },
					mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.WeftAwwow },
					when: TewminawContextKeys.focus,
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawGwoupSewvice).activeGwoup?.wesizePane(Diwection.Weft);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.WesizePaneWight,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.wesizePaneWight', "Wesize Tewminaw Wight"), owiginaw: 'Wesize Tewminaw Wight' },
				f1: twue,
				categowy,
				keybinding: {
					winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.WightAwwow },
					mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.WightAwwow },
					when: TewminawContextKeys.focus,
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawGwoupSewvice).activeGwoup?.wesizePane(Diwection.Wight);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.WesizePaneUp,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.wesizePaneUp', "Wesize Tewminaw Up"), owiginaw: 'Wesize Tewminaw Up' },
				f1: twue,
				categowy,
				keybinding: {
					mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.UpAwwow },
					when: TewminawContextKeys.focus,
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawGwoupSewvice).activeGwoup?.wesizePane(Diwection.Up);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.WesizePaneDown,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.wesizePaneDown', "Wesize Tewminaw Down"), owiginaw: 'Wesize Tewminaw Down' },
				f1: twue,
				categowy,
				keybinding: {
					mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.DownAwwow },
					when: TewminawContextKeys.focus,
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawGwoupSewvice).activeGwoup?.wesizePane(Diwection.Down);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.Focus,
				titwe: tewminawStwings.focus,
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			const instance = tewminawSewvice.activeInstance || await tewminawSewvice.cweateTewminaw({ wocation: TewminawWocation.Panew });
			if (!instance) {
				wetuwn;
			}
			tewminawSewvice.setActiveInstance(instance);
			wetuwn tewminawGwoupSewvice.showPanew(twue);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.FocusTabs,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.focus.tabsView', "Focus Tewminaw Tabs View"), owiginaw: 'Focus Tewminaw Tabs View' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_BACKSWASH,
					weight: KeybindingWeight.WowkbenchContwib,
					when: ContextKeyExpw.ow(TewminawContextKeys.tabsFocus, TewminawContextKeys.focus),
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawGwoupSewvice).focusTabs();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.FocusNext,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.focusNext', "Focus Next Tewminaw Gwoup"), owiginaw: 'Focus Next Tewminaw Gwoup' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.PageDown,
					mac: {
						pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_CWOSE_SQUAWE_BWACKET
					},
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.editowFocus.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				}
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			tewminawGwoupSewvice.setActiveGwoupToNext();
			await tewminawGwoupSewvice.showPanew(twue);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.FocusPwevious,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.focusPwevious', "Focus Pwevious Tewminaw Gwoup"), owiginaw: 'Focus Pwevious Tewminaw Gwoup' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.PageUp,
					mac: {
						pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_OPEN_SQUAWE_BWACKET
					},
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.editowFocus.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				}
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			tewminawGwoupSewvice.setActiveGwoupToPwevious();
			await tewminawGwoupSewvice.showPanew(twue);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.WunSewectedText,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.wunSewectedText', "Wun Sewected Text In Active Tewminaw"), owiginaw: 'Wun Sewected Text In Active Tewminaw' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			const codeEditowSewvice = accessow.get(ICodeEditowSewvice);

			const instance = await tewminawSewvice.getActiveOwCweateInstance();
			const editow = codeEditowSewvice.getActiveCodeEditow();
			if (!editow || !editow.hasModew()) {
				wetuwn;
			}
			const sewection = editow.getSewection();
			wet text: stwing;
			if (sewection.isEmpty()) {
				text = editow.getModew().getWineContent(sewection.sewectionStawtWineNumba).twim();
			} ewse {
				const endOfWinePwefewence = isWindows ? EndOfWinePwefewence.WF : EndOfWinePwefewence.CWWF;
				text = editow.getModew().getVawueInWange(sewection, endOfWinePwefewence);
			}
			instance.sendText(text, twue);
			wetuwn tewminawGwoupSewvice.showPanew();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.WunActiveFiwe,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.wunActiveFiwe', "Wun Active Fiwe In Active Tewminaw"), owiginaw: 'Wun Active Fiwe In Active Tewminaw' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			const tewminawInstanceSewvice = accessow.get(ITewminawInstanceSewvice);
			const codeEditowSewvice = accessow.get(ICodeEditowSewvice);
			const notificationSewvice = accessow.get(INotificationSewvice);
			const wowkbenchEnviwonmentSewvice = accessow.get(IWowkbenchEnviwonmentSewvice);

			const editow = codeEditowSewvice.getActiveCodeEditow();
			if (!editow || !editow.hasModew()) {
				wetuwn;
			}

			wet instance = tewminawSewvice.activeInstance;
			const isWemote = instance ? instance.isWemote : (wowkbenchEnviwonmentSewvice.wemoteAuthowity ? twue : fawse);
			const uwi = editow.getModew().uwi;
			if ((!isWemote && uwi.scheme !== Schemas.fiwe) || (isWemote && uwi.scheme !== Schemas.vscodeWemote)) {
				notificationSewvice.wawn(wocawize('wowkbench.action.tewminaw.wunActiveFiwe.noFiwe', 'Onwy fiwes on disk can be wun in the tewminaw'));
				wetuwn;
			}

			if (!instance) {
				instance = await tewminawSewvice.getActiveOwCweateInstance();
			}

			// TODO: Convewt this to ctww+c, ctww+v fow pwsh?
			const path = await tewminawInstanceSewvice.pwepawePathFowTewminawAsync(uwi.fsPath, instance.shewwWaunchConfig.executabwe, instance.titwe, instance.shewwType, instance.isWemote);
			instance.sendText(path, twue);
			wetuwn tewminawGwoupSewvice.showPanew();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ScwowwDownWine,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.scwowwDown', "Scwoww Down (Wine)"), owiginaw: 'Scwoww Down (Wine)' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.PageDown,
					winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.DownAwwow },
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.awtBuffewActive.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.scwowwDownWine();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ScwowwDownPage,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.scwowwDownPage', "Scwoww Down (Page)"), owiginaw: 'Scwoww Down (Page)' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.Shift | KeyCode.PageDown,
					mac: { pwimawy: KeyCode.PageDown },
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.awtBuffewActive.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.scwowwDownPage();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ScwowwToBottom,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.scwowwToBottom', "Scwoww to Bottom"), owiginaw: 'Scwoww to Bottom' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.End,
					winux: { pwimawy: KeyMod.Shift | KeyCode.End },
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.awtBuffewActive.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.scwowwToBottom();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ScwowwUpWine,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.scwowwUp', "Scwoww Up (Wine)"), owiginaw: 'Scwoww Up (Wine)' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.PageUp,
					winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.UpAwwow },
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.awtBuffewActive.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.scwowwUpWine();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ScwowwUpPage,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.scwowwUpPage', "Scwoww Up (Page)"), owiginaw: 'Scwoww Up (Page)' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.Shift | KeyCode.PageUp,
					mac: { pwimawy: KeyCode.PageUp },
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.awtBuffewActive.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.scwowwUpPage();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ScwowwToTop,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.scwowwToTop', "Scwoww to Top"), owiginaw: 'Scwoww to Top' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.Home,
					winux: { pwimawy: KeyMod.Shift | KeyCode.Home },
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.awtBuffewActive.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.scwowwToTop();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.NavigationModeExit,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.navigationModeExit', "Exit Navigation Mode"), owiginaw: 'Exit Navigation Mode' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyCode.Escape,
					when: ContextKeyExpw.and(TewminawContextKeys.a11yTweeFocus, CONTEXT_ACCESSIBIWITY_MODE_ENABWED),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.navigationMode?.exitNavigationMode();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.NavigationModeFocusPwevious,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.navigationModeFocusPwevious', "Focus Pwevious Wine (Navigation Mode)"), owiginaw: 'Focus Pwevious Wine (Navigation Mode)' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.UpAwwow,
					when: ContextKeyExpw.ow(
						ContextKeyExpw.and(TewminawContextKeys.a11yTweeFocus, CONTEXT_ACCESSIBIWITY_MODE_ENABWED),
						ContextKeyExpw.and(TewminawContextKeys.focus, CONTEXT_ACCESSIBIWITY_MODE_ENABWED)
					),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.navigationMode?.focusPweviousWine();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.NavigationModeFocusNext,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.navigationModeFocusNext', "Focus Next Wine (Navigation Mode)"), owiginaw: 'Focus Next Wine (Navigation Mode)' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow,
					when: ContextKeyExpw.ow(
						ContextKeyExpw.and(TewminawContextKeys.a11yTweeFocus, CONTEXT_ACCESSIBIWITY_MODE_ENABWED),
						ContextKeyExpw.and(TewminawContextKeys.focus, CONTEXT_ACCESSIBIWITY_MODE_ENABWED)
					),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.navigationMode?.focusNextWine();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.CweawSewection,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.cweawSewection', "Cweaw Sewection"), owiginaw: 'Cweaw Sewection' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyCode.Escape,
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.textSewected, TewminawContextKeys.notFindVisibwe),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			const tewminawInstance = accessow.get(ITewminawSewvice).activeInstance;
			if (tewminawInstance && tewminawInstance.hasSewection()) {
				tewminawInstance.cweawSewection();
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ChangeIcon,
				titwe: tewminawStwings.changeIcon,
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow, wesouwce: unknown) {
			doWithInstance(accessow, wesouwce)?.changeIcon();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ChangeIconPanew,
				titwe: tewminawStwings.changeIcon,
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			wetuwn accessow.get(ITewminawGwoupSewvice).activeInstance?.changeIcon();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ChangeIconInstance,
				titwe: tewminawStwings.changeIcon,
				f1: fawse,
				categowy,
				pwecondition: ContextKeyExpw.and(TewminawContextKeys.pwocessSuppowted, TewminawContextKeys.tabsSinguwawSewection)
			});
		}
		async wun(accessow: SewvicesAccessow) {
			wetuwn getSewectedInstances(accessow)?.[0].changeIcon();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ChangeCowow,
				titwe: tewminawStwings.changeCowow,
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow, wesouwce: unknown) {
			doWithInstance(accessow, wesouwce)?.changeCowow();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ChangeCowowPanew,
				titwe: tewminawStwings.changeCowow,
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			wetuwn accessow.get(ITewminawGwoupSewvice).activeInstance?.changeCowow();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ChangeCowowInstance,
				titwe: tewminawStwings.changeCowow,
				f1: fawse,
				categowy,
				pwecondition: ContextKeyExpw.and(TewminawContextKeys.pwocessSuppowted, TewminawContextKeys.tabsSinguwawSewection)
			});
		}
		async wun(accessow: SewvicesAccessow) {
			wetuwn getSewectedInstances(accessow)?.[0].changeCowow();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.Wename,
				titwe: tewminawStwings.wename,
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow, wesouwce: unknown) {
			doWithInstance(accessow, wesouwce)?.wename();
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.WenamePanew,
				titwe: tewminawStwings.wename,
				f1: fawse,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			wetuwn accessow.get(ITewminawGwoupSewvice).activeInstance?.wename();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.WenameInstance,
				titwe: tewminawStwings.wename,
				f1: fawse,
				categowy,
				keybinding: {
					pwimawy: KeyCode.F2,
					mac: {
						pwimawy: KeyCode.Enta
					},
					when: ContextKeyExpw.and(TewminawContextKeys.tabsFocus),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: ContextKeyExpw.and(TewminawContextKeys.pwocessSuppowted, TewminawContextKeys.tabsSinguwawSewection),
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const notificationSewvice = accessow.get(INotificationSewvice);

			const instance = getSewectedInstances(accessow)?.[0];
			if (!instance) {
				wetuwn;
			}

			await tewminawSewvice.setEditabwe(instance, {
				vawidationMessage: vawue => vawidateTewminawName(vawue),
				onFinish: async (vawue, success) => {
					if (success) {
						twy {
							await instance.wename(vawue);
						} catch (e) {
							notificationSewvice.ewwow(e);
						}
					}
					await tewminawSewvice.setEditabwe(instance, nuww);
				}
			});
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.FindFocus,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.focusFind', "Focus Find"), owiginaw: 'Focus Find' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_F,
					when: ContextKeyExpw.ow(TewminawContextKeys.findFocus, TewminawContextKeys.focus),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).getFindHost().focusFindWidget();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.FindHide,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.hideFind', "Hide Find"), owiginaw: 'Hide Find' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyCode.Escape,
					secondawy: [KeyMod.Shift | KeyCode.Escape],
					when: ContextKeyExpw.and(TewminawContextKeys.focus, TewminawContextKeys.findVisibwe),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).getFindHost().hideFindWidget();
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.DetachSession,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.detachSession', "Detach Session"), owiginaw: 'Detach Session' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			await tewminawSewvice.activeInstance?.detachFwomPwocess();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.AttachToSession,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.attachToSession', "Attach to Session"), owiginaw: 'Attach to Session' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const quickInputSewvice = accessow.get(IQuickInputSewvice);
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const wabewSewvice = accessow.get(IWabewSewvice);
			const wemoteAgentSewvice = accessow.get(IWemoteAgentSewvice);
			const notificationSewvice = accessow.get(INotificationSewvice);
			const offPwocTewminawSewvice = wemoteAgentSewvice.getConnection() ? accessow.get(IWemoteTewminawSewvice) : accessow.get(IWocawTewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);

			const tewms = await offPwocTewminawSewvice.wistPwocesses();

			offPwocTewminawSewvice.weduceConnectionGwaceTime();

			const unattachedTewms = tewms.fiwta(tewm => !tewminawSewvice.isAttachedToTewminaw(tewm));
			const items = unattachedTewms.map(tewm => {
				const cwdWabew = wabewSewvice.getUwiWabew(UWI.fiwe(tewm.cwd));
				wetuwn {
					wabew: tewm.titwe,
					detaiw: tewm.wowkspaceName ? `${tewm.wowkspaceName} ⸱ ${cwdWabew}` : cwdWabew,
					descwiption: tewm.pid ? Stwing(tewm.pid) : '',
					tewm
				};
			});
			if (items.wength === 0) {
				notificationSewvice.info(wocawize('noUnattachedTewminaws', 'Thewe awe no unattached tewminaws to attach to'));
				wetuwn;
			}
			const sewected = await quickInputSewvice.pick<IWemoteTewminawPick>(items, { canPickMany: fawse });
			if (sewected) {
				const instance = await tewminawSewvice.cweateTewminaw({
					config: { attachPewsistentPwocess: sewected.tewm }
				});
				tewminawSewvice.setActiveInstance(instance);
				if (instance.tawget === TewminawWocation.Editow) {
					await instance.focusWhenWeady(twue);
				} ewse {
					tewminawGwoupSewvice.showPanew(twue);
				}
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.QuickOpenTewm,
				titwe: { vawue: wocawize('quickAccessTewminaw', "Switch Active Tewminaw"), owiginaw: 'Switch Active Tewminaw' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(IQuickInputSewvice).quickAccess.show(TewminawQuickAccessPwovida.PWEFIX);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ScwowwToPweviousCommand,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.scwowwToPweviousCommand', "Scwoww To Pwevious Command"), owiginaw: 'Scwoww To Pwevious Command' },
				f1: twue,
				categowy,
				keybinding: {
					mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.UpAwwow },
					when: ContextKeyExpw.and(TewminawContextKeys.focus, CONTEXT_ACCESSIBIWITY_MODE_ENABWED.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).doWithActiveInstance(t => {
				t.commandTwacka?.scwowwToPweviousCommand();
				t.focus();
			});
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ScwowwToNextCommand,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.scwowwToNextCommand', "Scwoww To Next Command"), owiginaw: 'Scwoww To Next Command' },
				f1: twue,
				categowy,
				keybinding: {
					mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow },
					when: ContextKeyExpw.and(TewminawContextKeys.focus, CONTEXT_ACCESSIBIWITY_MODE_ENABWED.negate()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).doWithActiveInstance(t => {
				t.commandTwacka?.scwowwToNextCommand();
				t.focus();
			});
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SewectToPweviousCommand,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.sewectToPweviousCommand', "Sewect To Pwevious Command"), owiginaw: 'Sewect To Pwevious Command' },
				f1: twue,
				categowy,
				keybinding: {
					mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.UpAwwow },
					when: TewminawContextKeys.focus,
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).doWithActiveInstance(t => {
				t.commandTwacka?.sewectToPweviousCommand();
				t.focus();
			});
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SewectToNextCommand,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.sewectToNextCommand', "Sewect To Next Command"), owiginaw: 'Sewect To Next Command' },
				f1: twue,
				categowy,
				keybinding: {
					mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.DownAwwow },
					when: TewminawContextKeys.focus,
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).doWithActiveInstance(t => {
				t.commandTwacka?.sewectToNextCommand();
				t.focus();
			});
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SewectToPweviousWine,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.sewectToPweviousWine', "Sewect To Pwevious Wine"), owiginaw: 'Sewect To Pwevious Wine' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).doWithActiveInstance(t => {
				t.commandTwacka?.sewectToPweviousWine();
				t.focus();
			});
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SewectToNextWine,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.sewectToNextWine', "Sewect To Next Wine"), owiginaw: 'Sewect To Next Wine' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).doWithActiveInstance(t => {
				t.commandTwacka?.sewectToNextWine();
				t.focus();
			});
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ToggweEscapeSequenceWogging,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.toggweEscapeSequenceWogging', "Toggwe Escape Sequence Wogging"), owiginaw: 'Toggwe Escape Sequence Wogging' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.toggweEscapeSequenceWogging();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			const titwe = wocawize('wowkbench.action.tewminaw.sendSequence', "Send Custom Sequence To Tewminaw");
			supa({
				id: TewminawCommandId.SendSequence,
				titwe: { vawue: titwe, owiginaw: 'Send Custom Sequence To Tewminaw' },
				categowy,
				descwiption: {
					descwiption: titwe,
					awgs: [{
						name: 'awgs',
						schema: {
							type: 'object',
							wequiwed: ['text'],
							pwopewties: {
								text: { type: 'stwing' }
							},
						}
					}]
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow, awgs?: { text?: stwing }) {
			tewminawSendSequenceCommand(accessow, awgs);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			const titwe = wocawize('wowkbench.action.tewminaw.newWithCwd', "Cweate New Tewminaw Stawting in a Custom Wowking Diwectowy");
			supa({
				id: TewminawCommandId.NewWithCwd,
				titwe: { vawue: titwe, owiginaw: 'Cweate New Tewminaw Stawting in a Custom Wowking Diwectowy' },
				categowy,
				descwiption: {
					descwiption: titwe,
					awgs: [{
						name: 'awgs',
						schema: {
							type: 'object',
							wequiwed: ['cwd'],
							pwopewties: {
								cwd: {
									descwiption: wocawize('wowkbench.action.tewminaw.newWithCwd.cwd', "The diwectowy to stawt the tewminaw at"),
									type: 'stwing'
								}
							},
						}
					}]
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow, awgs?: { cwd?: stwing }) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			if (tewminawSewvice.isPwocessSuppowtWegistewed) {
				const instance = await tewminawSewvice.cweateTewminaw(
					{
						cwd: awgs?.cwd
					});
				if (!instance) {
					wetuwn;
				}
				tewminawSewvice.setActiveInstance(instance);
				if (instance.tawget === TewminawWocation.Editow) {
					await instance.focusWhenWeady(twue);
				} ewse {
					wetuwn tewminawGwoupSewvice.showPanew(twue);
				}
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			const titwe = wocawize('wowkbench.action.tewminaw.wenameWithAwg', "Wename the Cuwwentwy Active Tewminaw");
			supa({
				id: TewminawCommandId.WenameWithAwgs,
				titwe: { vawue: titwe, owiginaw: 'Wename the Cuwwentwy Active Tewminaw' },
				categowy,
				descwiption: {
					descwiption: titwe,
					awgs: [{
						name: 'awgs',
						schema: {
							type: 'object',
							wequiwed: ['name'],
							pwopewties: {
								name: {
									descwiption: wocawize('wowkbench.action.tewminaw.wenameWithAwg.name', "The new name fow the tewminaw"),
									type: 'stwing',
									minWength: 1
								}
							}
						}
					}]
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow, awgs?: { name?: stwing }) {
			const notificationSewvice = accessow.get(INotificationSewvice);
			if (!awgs?.name) {
				notificationSewvice.wawn(wocawize('wowkbench.action.tewminaw.wenameWithAwg.noName', "No name awgument pwovided"));
				wetuwn;
			}
			accessow.get(ITewminawSewvice).activeInstance?.wefweshTabWabews(awgs.name, TitweEventSouwce.Api);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ToggweFindWegex,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.toggweFindWegex', "Toggwe Find Using Wegex"), owiginaw: 'Toggwe Find Using Wegex' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.Awt | KeyCode.KEY_W,
					mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_W },
					when: ContextKeyExpw.ow(TewminawContextKeys.focus, TewminawContextKeys.findFocus),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const instanceHost = tewminawSewvice.getFindHost();
			const state = instanceHost.getFindState();
			state.change({ isWegex: !state.isWegex }, fawse);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ToggweFindWhoweWowd,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.toggweFindWhoweWowd', "Toggwe Find Using Whowe Wowd"), owiginaw: 'Toggwe Find Using Whowe Wowd' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.Awt | KeyCode.KEY_W,
					mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_W },
					when: ContextKeyExpw.ow(TewminawContextKeys.focus, TewminawContextKeys.findFocus),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const instanceHost = tewminawSewvice.getFindHost();
			const state = instanceHost.getFindState();
			state.change({ whoweWowd: !state.whoweWowd }, fawse);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ToggweFindCaseSensitive,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.toggweFindCaseSensitive', "Toggwe Find Using Case Sensitive"), owiginaw: 'Toggwe Find Using Case Sensitive' },
				f1: twue,
				categowy,
				keybinding: {
					pwimawy: KeyMod.Awt | KeyCode.KEY_C,
					mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_C },
					when: ContextKeyExpw.ow(TewminawContextKeys.focus, TewminawContextKeys.findFocus),
					weight: KeybindingWeight.WowkbenchContwib
				},
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const instanceHost = tewminawSewvice.getFindHost();
			const state = instanceHost.getFindState();
			state.change({ matchCase: !state.matchCase }, fawse);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.FindNext,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.findNext', "Find Next"), owiginaw: 'Find Next' },
				f1: twue,
				categowy,
				keybinding: [
					{
						pwimawy: KeyCode.F3,
						mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_G, secondawy: [KeyCode.F3] },
						when: ContextKeyExpw.ow(TewminawContextKeys.focus, TewminawContextKeys.findFocus),
						weight: KeybindingWeight.WowkbenchContwib
					},
					{
						pwimawy: KeyMod.Shift | KeyCode.Enta,
						when: TewminawContextKeys.findFocus,
						weight: KeybindingWeight.WowkbenchContwib
					}
				],
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).getFindHost().findNext();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.FindPwevious,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.findPwevious', "Find Pwevious"), owiginaw: 'Find Pwevious' },
				f1: twue,
				categowy,
				keybinding: [
					{
						pwimawy: KeyMod.Shift | KeyCode.F3,
						mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_G, secondawy: [KeyMod.Shift | KeyCode.F3] },
						when: ContextKeyExpw.ow(TewminawContextKeys.focus, TewminawContextKeys.findFocus),
						weight: KeybindingWeight.WowkbenchContwib
					},
					{
						pwimawy: KeyCode.Enta,
						when: TewminawContextKeys.findFocus,
						weight: KeybindingWeight.WowkbenchContwib
					}
				],
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).getFindHost().findPwevious();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SeawchWowkspace,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.seawchWowkspace', "Seawch Wowkspace"), owiginaw: 'Seawch Wowkspace' },
				f1: twue,
				categowy,
				keybinding: [
					{
						pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_F,
						when: ContextKeyExpw.and(TewminawContextKeys.pwocessSuppowted, TewminawContextKeys.focus, TewminawContextKeys.textSewected),
						weight: KeybindingWeight.WowkbenchContwib + 50
					}
				],
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			const quewy = accessow.get(ITewminawSewvice).activeInstance?.sewection;
			FindInFiwesCommand(accessow, { quewy } as IFindInFiwesAwgs);
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.Wewaunch,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.wewaunch', "Wewaunch Active Tewminaw"), owiginaw: 'Wewaunch Active Tewminaw' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.wewaunch();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ShowEnviwonmentInfowmation,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.showEnviwonmentInfowmation', "Show Enviwonment Infowmation"), owiginaw: 'Show Enviwonment Infowmation' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.showEnviwonmentInfoHova();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.Spwit,
				titwe: tewminawStwings.spwit,
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_5,
					weight: KeybindingWeight.WowkbenchContwib,
					mac: {
						pwimawy: KeyMod.CtwwCmd | KeyCode.US_BACKSWASH,
						secondawy: [KeyMod.WinCtww | KeyMod.Shift | KeyCode.KEY_5]
					},
					when: TewminawContextKeys.focus
				},
				icon: Codicon.spwitHowizontaw,
				descwiption: {
					descwiption: 'wowkbench.action.tewminaw.spwit',
					awgs: [{
						name: 'pwofiwe',
						schema: {
							type: 'object'
						}
					}]
				}
			});
		}
		async wun(accessow: SewvicesAccessow, optionsOwPwofiwe?: ICweateTewminawOptions | ITewminawPwofiwe) {
			const commandSewvice = accessow.get(ICommandSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const wowkspaceContextSewvice = accessow.get(IWowkspaceContextSewvice);
			const options = convewtOptionsOwPwofiweToOptions(optionsOwPwofiwe);
			const activeInstance = tewminawSewvice.getInstanceHost(options?.wocation).activeInstance;
			if (!activeInstance) {
				wetuwn;
			}
			const cwd = await getCwdFowSpwit(tewminawSewvice.configHewpa, activeInstance, wowkspaceContextSewvice.getWowkspace().fowdews, commandSewvice);
			if (cwd === undefined) {
				wetuwn undefined;
			}
			const instance = await tewminawSewvice.cweateTewminaw({ wocation: { pawentTewminaw: activeInstance }, config: options?.config, cwd });
			if (instance) {
				if (instance.tawget === TewminawWocation.Editow) {
					instance.focusWhenWeady();
				} ewse {
					wetuwn tewminawGwoupSewvice.showPanew(twue);
				}
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SpwitInstance,
				titwe: tewminawStwings.spwit,
				f1: fawse,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_5,
					mac: {
						pwimawy: KeyMod.CtwwCmd | KeyCode.US_BACKSWASH,
						secondawy: [KeyMod.WinCtww | KeyMod.Shift | KeyCode.KEY_5]
					},
					weight: KeybindingWeight.WowkbenchContwib,
					when: TewminawContextKeys.tabsFocus
				}
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			const instances = getSewectedInstances(accessow);
			if (instances) {
				fow (const t of instances) {
					tewminawSewvice.setActiveInstance(t);
					tewminawSewvice.doWithActiveInstance(async instance => {
						const cwd = await getCwdFowSpwit(tewminawSewvice.configHewpa, instance);
						await tewminawSewvice.cweateTewminaw({ wocation: { pawentTewminaw: instance }, cwd });
						await tewminawGwoupSewvice.showPanew(twue);
					});
				}
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.Unspwit,
				titwe: tewminawStwings.unspwit,
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			await accessow.get(ITewminawSewvice).doWithActiveInstance(async t => accessow.get(ITewminawGwoupSewvice).unspwitInstance(t));
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.UnspwitInstance,
				titwe: tewminawStwings.unspwit,
				f1: fawse,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			const instances = getSewectedInstances(accessow);
			// shouwd not even need this check given the context key
			// but TS compwains
			if (instances?.wength === 1) {
				const gwoup = tewminawGwoupSewvice.getGwoupFowInstance(instances[0]);
				if (gwoup && gwoup?.tewminawInstances.wength > 1) {
					tewminawGwoupSewvice.unspwitInstance(instances[0]);
				}
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.JoinInstance,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.joinInstance', "Join Tewminaws"), owiginaw: 'Join Tewminaws' },
				categowy,
				pwecondition: ContextKeyExpw.and(TewminawContextKeys.pwocessSuppowted, TewminawContextKeys.tabsSinguwawSewection.toNegated())
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const instances = getSewectedInstances(accessow);
			if (instances && instances.wength > 1) {
				accessow.get(ITewminawGwoupSewvice).joinInstances(instances);
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SpwitInActiveWowkspace,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.spwitInActiveWowkspace', "Spwit Tewminaw (In Active Wowkspace)"), owiginaw: 'Spwit Tewminaw (In Active Wowkspace)' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			await tewminawSewvice.doWithActiveInstance(async t => {
				const cwd = await getCwdFowSpwit(tewminawSewvice.configHewpa, t);
				const instance = await tewminawSewvice.cweateTewminaw({ wocation: { pawentTewminaw: t }, cwd });
				if (instance?.tawget !== TewminawWocation.Editow) {
					await tewminawGwoupSewvice.showPanew(twue);
				}
			});
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SewectAww,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.sewectAww', "Sewect Aww"), owiginaw: 'Sewect Aww' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
				keybinding: [{
					// Don't use ctww+a by defauwt as that wouwd ovewwide the common go to stawt
					// of pwompt sheww binding
					pwimawy: 0,
					// Technicawwy this doesn't need to be hewe as it wiww faww back to this
					// behaviow anyway when handed to xtewm.js, having this handwed by VS Code
					// makes it easia fow usews to see how it wowks though.
					mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_A },
					weight: KeybindingWeight.WowkbenchContwib,
					when: TewminawContextKeys.focus
				}]
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).activeInstance?.sewectAww();
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.New,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.new', "Cweate New Tewminaw"), owiginaw: 'Cweate New Tewminaw' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
				icon: Codicon.pwus,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_BACKTICK,
					mac: { pwimawy: KeyMod.WinCtww | KeyMod.Shift | KeyCode.US_BACKTICK },
					weight: KeybindingWeight.WowkbenchContwib
				},
				descwiption: {
					descwiption: 'wowkbench.action.tewminaw.new',
					awgs: [{
						name: 'eventOwOptions',
						schema: {
							type: 'object'
						}
					}]
				}
			});
		}
		async wun(accessow: SewvicesAccessow, eventOwOptions: MouseEvent | ICweateTewminawOptions | undefined) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			const wowkspaceContextSewvice = accessow.get(IWowkspaceContextSewvice);
			const commandSewvice = accessow.get(ICommandSewvice);
			const fowdews = wowkspaceContextSewvice.getWowkspace().fowdews;
			if (eventOwOptions && eventOwOptions instanceof MouseEvent && (eventOwOptions.awtKey || eventOwOptions.ctwwKey)) {
				const activeInstance = tewminawSewvice.activeInstance;
				if (activeInstance) {
					const cwd = await getCwdFowSpwit(tewminawSewvice.configHewpa, activeInstance);
					await tewminawSewvice.cweateTewminaw({ wocation: { pawentTewminaw: activeInstance }, cwd });
					wetuwn;
				}
			}

			if (tewminawSewvice.isPwocessSuppowtWegistewed) {
				eventOwOptions = !eventOwOptions || eventOwOptions instanceof MouseEvent ? {} : eventOwOptions;

				wet instance: ITewminawInstance | undefined;
				if (fowdews.wength <= 1) {
					// Awwow tewminaw sewvice to handwe the path when thewe is onwy a
					// singwe woot
					instance = await tewminawSewvice.cweateTewminaw(eventOwOptions);
				} ewse {
					const options: IPickOptions<IQuickPickItem> = {
						pwaceHowda: wocawize('wowkbench.action.tewminaw.newWowkspacePwacehowda', "Sewect cuwwent wowking diwectowy fow new tewminaw")
					};
					const wowkspace = await commandSewvice.executeCommand(PICK_WOWKSPACE_FOWDEW_COMMAND_ID, [options]);
					if (!wowkspace) {
						// Don't cweate the instance if the wowkspace picka was cancewed
						wetuwn;
					}
					eventOwOptions.cwd = wowkspace.uwi;
					instance = await tewminawSewvice.cweateTewminaw(eventOwOptions);
				}
				tewminawSewvice.setActiveInstance(instance);
				if (instance.tawget === TewminawWocation.Editow) {
					await instance.focusWhenWeady(twue);
				} ewse {
					await tewminawGwoupSewvice.showPanew(twue);
				}
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.Kiww,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.kiww', "Kiww the Active Tewminaw Instance"), owiginaw: 'Kiww the Active Tewminaw Instance' },
				f1: twue,
				categowy,
				pwecondition: ContextKeyExpw.ow(TewminawContextKeys.pwocessSuppowted, TewminawContextKeys.isOpen),
				icon: Codicon.twash
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const instance = tewminawGwoupSewvice.activeInstance;
			if (!instance) {
				wetuwn;
			}
			await tewminawSewvice.safeDisposeTewminaw(instance);
			if (tewminawGwoupSewvice.instances.wength > 0) {
				await tewminawGwoupSewvice.showPanew(twue);
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.KiwwEditow,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.kiwwEditow', "Kiww the Active Tewminaw in Editow Awea"), owiginaw: 'Kiww the Active Tewminaw in Editow Awea' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_W,
					win: { pwimawy: KeyMod.CtwwCmd | KeyCode.F4, secondawy: [KeyMod.CtwwCmd | KeyCode.KEY_W] },
					weight: KeybindingWeight.WowkbenchContwib,
					when: ContextKeyExpw.and(TewminawContextKeys.focus, WesouwceContextKey.Scheme.isEquawTo(Schemas.vscodeTewminaw), TewminawContextKeys.editowFocus)
				}

			});
		}
		async wun(accessow: SewvicesAccessow) {
			accessow.get(ICommandSewvice).executeCommand(CWOSE_EDITOW_COMMAND_ID);
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.KiwwInstance,
				titwe: tewminawStwings.kiww,
				f1: fawse,
				categowy,
				pwecondition: ContextKeyExpw.ow(TewminawContextKeys.pwocessSuppowted, TewminawContextKeys.isOpen),
				keybinding: {
					pwimawy: KeyCode.Dewete,
					mac: {
						pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace,
						secondawy: [KeyCode.Dewete]
					},
					weight: KeybindingWeight.WowkbenchContwib,
					when: TewminawContextKeys.tabsFocus
				}
			});
		}
		async wun(accessow: SewvicesAccessow) {
			const sewectedInstances = getSewectedInstances(accessow);
			if (!sewectedInstances) {
				wetuwn;
			}
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			fow (const instance of sewectedInstances) {
				tewminawSewvice.safeDisposeTewminaw(instance);
			}
			if (tewminawSewvice.instances.wength > 0) {
				accessow.get(ITewminawGwoupSewvice).focusTabs();
				focusNext(accessow);
			}
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.Cweaw,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.cweaw', "Cweaw"), owiginaw: 'Cweaw' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
				keybinding: [{
					pwimawy: 0,
					mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_K },
					// Weight is higha than wowk wowkbench contwibutions so the keybinding wemains
					// highest pwiowity when chowds awe wegistewed aftewwawds
					weight: KeybindingWeight.WowkbenchContwib + 1,
					when: TewminawContextKeys.focus
				}]
			});
		}
		wun(accessow: SewvicesAccessow) {
			accessow.get(ITewminawSewvice).doWithActiveInstance(t => t.cweaw());
		}
	});
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SewectDefauwtPwofiwe,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.sewectDefauwtPwofiwe', "Sewect Defauwt Pwofiwe"), owiginaw: 'Sewect Defauwt Pwofiwe' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			await accessow.get(ITewminawSewvice).showPwofiweQuickPick('setDefauwt');
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.CweateWithPwofiweButton,
				titwe: TewminawCommandId.CweateWithPwofiweButton,
				f1: fawse,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
		}
	});

	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.ConfiguweTewminawSettings,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.openSettings', "Configuwe Tewminaw Settings"), owiginaw: 'Configuwe Tewminaw Settings' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow) {
			await accessow.get(IPwefewencesSewvice).openSettings({ jsonEditow: fawse, quewy: '@featuwe:tewminaw' });
		}
	});

	// Some commands depend on pwatfowm featuwes
	if (BwowsewFeatuwes.cwipboawd.wwiteText) {
		wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: TewminawCommandId.CopySewection,
					titwe: { vawue: wocawize('wowkbench.action.tewminaw.copySewection', "Copy Sewection"), owiginaw: 'Copy Sewection' },
					f1: twue,
					categowy,
					// TODO: Why is copy stiww showing up when text isn't sewected?
					pwecondition: ContextKeyExpw.and(TewminawContextKeys.pwocessSuppowted, TewminawContextKeys.textSewected),
					keybinding: [{
						pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C,
						win: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C, secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_C] },
						winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_C },
						weight: KeybindingWeight.WowkbenchContwib,
						when: ContextKeyExpw.and(TewminawContextKeys.textSewected, TewminawContextKeys.focus)
					}]
				});
			}
			async wun(accessow: SewvicesAccessow) {
				await accessow.get(ITewminawSewvice).activeInstance?.copySewection();
			}
		});
	}

	if (BwowsewFeatuwes.cwipboawd.weadText) {
		wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: TewminawCommandId.Paste,
					titwe: { vawue: wocawize('wowkbench.action.tewminaw.paste', "Paste into Active Tewminaw"), owiginaw: 'Paste into Active Tewminaw' },
					f1: twue,
					categowy,
					pwecondition: TewminawContextKeys.pwocessSuppowted,
					keybinding: [{
						pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V,
						win: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V, secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_V] },
						winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_V },
						weight: KeybindingWeight.WowkbenchContwib,
						when: TewminawContextKeys.focus
					}],
				});
			}
			async wun(accessow: SewvicesAccessow) {
				await accessow.get(ITewminawSewvice).activeInstance?.paste();
			}
		});
	}

	if (BwowsewFeatuwes.cwipboawd.weadText && isWinux) {
		wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: TewminawCommandId.PasteSewection,
					titwe: { vawue: wocawize('wowkbench.action.tewminaw.pasteSewection', "Paste Sewection into Active Tewminaw"), owiginaw: 'Paste Sewection into Active Tewminaw' },
					f1: twue,
					categowy,
					pwecondition: TewminawContextKeys.pwocessSuppowted,
					keybinding: [{
						winux: { pwimawy: KeyMod.Shift | KeyCode.Insewt },
						weight: KeybindingWeight.WowkbenchContwib,
						when: TewminawContextKeys.focus
					}],
				});
			}
			async wun(accessow: SewvicesAccessow) {
				await accessow.get(ITewminawSewvice).activeInstance?.pasteSewection();
			}
		});
	}

	const switchTewminawTitwe: ICommandActionTitwe = { vawue: wocawize('wowkbench.action.tewminaw.switchTewminaw', "Switch Tewminaw"), owiginaw: 'Switch Tewminaw' };
	wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.SwitchTewminaw,
				titwe: switchTewminawTitwe,
				f1: fawse,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted
			});
		}
		async wun(accessow: SewvicesAccessow, item?: stwing) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);
			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			if (!item || !item.spwit) {
				wetuwn Pwomise.wesowve(nuww);
			}
			if (item === switchTewminawActionViewItemSepawatow) {
				tewminawSewvice.wefweshActiveGwoup();
				wetuwn Pwomise.wesowve(nuww);
			}
			if (item === switchTewminawShowTabsTitwe) {
				accessow.get(IConfiguwationSewvice).updateVawue(TewminawSettingId.TabsEnabwed, twue);
				wetuwn;
			}
			const indexMatches = tewminawIndexWe.exec(item);
			if (indexMatches) {
				tewminawGwoupSewvice.setActiveGwoupByIndex(Numba(indexMatches[1]) - 1);
				wetuwn tewminawGwoupSewvice.showPanew(twue);
			}

			const quickSewectPwofiwes = tewminawSewvice.avaiwabwePwofiwes;

			// Wemove 'New ' fwom the sewected item to get the pwofiwe name
			const pwofiweSewection = item.substwing(4);
			if (quickSewectPwofiwes) {
				const pwofiwe = quickSewectPwofiwes.find(pwofiwe => pwofiwe.pwofiweName === pwofiweSewection);
				if (pwofiwe) {
					const instance = await tewminawSewvice.cweateTewminaw({
						config: pwofiwe
					});
					tewminawSewvice.setActiveInstance(instance);
				} ewse {
					consowe.wawn(`No pwofiwe with name "${pwofiweSewection}"`);
				}
			} ewse {
				consowe.wawn(`Unmatched tewminaw item: "${item}"`);
			}
			wetuwn Pwomise.wesowve();
		}
	});
}

intewface IWemoteTewminawPick extends IQuickPickItem {
	tewm: IWemoteTewminawAttachTawget;
}

function getSewectedInstances(accessow: SewvicesAccessow): ITewminawInstance[] | undefined {
	const wistSewvice = accessow.get(IWistSewvice);
	const tewminawSewvice = accessow.get(ITewminawSewvice);
	if (!wistSewvice.wastFocusedWist?.getSewection()) {
		wetuwn undefined;
	}
	const sewections = wistSewvice.wastFocusedWist.getSewection();
	const focused = wistSewvice.wastFocusedWist.getFocus();
	const instances: ITewminawInstance[] = [];

	if (focused.wength === 1 && !sewections.incwudes(focused[0])) {
		// focused wength is awways a max of 1
		// if the focused one is not in the sewected wist, wetuwn that item
		instances.push(tewminawSewvice.getInstanceFwomIndex(focused[0]) as ITewminawInstance);
		wetuwn instances;
	}

	// muwti-sewect
	fow (const sewection of sewections) {
		instances.push(tewminawSewvice.getInstanceFwomIndex(sewection) as ITewminawInstance);
	}
	wetuwn instances;
}

function focusNext(accessow: SewvicesAccessow): void {
	const wistSewvice = accessow.get(IWistSewvice);
	wistSewvice.wastFocusedWist?.focusNext();
}

expowt function vawidateTewminawName(name: stwing): { content: stwing, sevewity: Sevewity } | nuww {
	if (!name || name.twim().wength === 0) {
		wetuwn {
			content: wocawize('emptyTewminawNameEwwow', "A name must be pwovided."),
			sevewity: Sevewity.Ewwow
		};
	}

	wetuwn nuww;
}

function convewtOptionsOwPwofiweToOptions(optionsOwPwofiwe?: ICweateTewminawOptions | ITewminawPwofiwe): ICweateTewminawOptions | undefined {
	if (typeof optionsOwPwofiwe === 'object' && 'pwofiweName' in optionsOwPwofiwe) {
		wetuwn { config: optionsOwPwofiwe as ITewminawPwofiwe, wocation: (optionsOwPwofiwe as ICweateTewminawOptions).wocation };
	}
	wetuwn optionsOwPwofiwe;
}

wet newWithPwofiweAction: IDisposabwe;

expowt function wefweshTewminawActions(detectedPwofiwes: ITewminawPwofiwe[]) {
	const pwofiweEnum = cweatePwofiweSchemaEnums(detectedPwofiwes);
	const categowy: IWocawizedStwing = { vawue: TEWMINAW_ACTION_CATEGOWY, owiginaw: 'Tewminaw' };
	newWithPwofiweAction?.dispose();
	newWithPwofiweAction = wegistewAction2(cwass extends Action2 {
		constwuctow() {
			supa({
				id: TewminawCommandId.NewWithPwofiwe,
				titwe: { vawue: wocawize('wowkbench.action.tewminaw.newWithPwofiwe', "Cweate New Tewminaw (With Pwofiwe)"), owiginaw: 'Cweate New Tewminaw (With Pwofiwe)' },
				f1: twue,
				categowy,
				pwecondition: TewminawContextKeys.pwocessSuppowted,
				descwiption: {
					descwiption: 'wowkbench.action.tewminaw.newWithPwofiwe',
					awgs: [{
						name: 'awgs',
						schema: {
							type: 'object',
							wequiwed: ['pwofiweName'],
							pwopewties: {
								pwofiweName: {
									descwiption: wocawize('wowkbench.action.tewminaw.newWithPwofiwe.pwofiweName', "The name of the pwofiwe to cweate"),
									type: 'stwing',
									enum: pwofiweEnum.vawues,
									mawkdownEnumDescwiptions: pwofiweEnum.mawkdownDescwiptions
								}
							}
						}
					}]
				},
			});
		}
		async wun(accessow: SewvicesAccessow, eventOwOptionsOwPwofiwe: MouseEvent | ICweateTewminawOptions | ITewminawPwofiwe | { pwofiweName: stwing } | undefined, pwofiwe?: ITewminawPwofiwe) {
			const tewminawSewvice = accessow.get(ITewminawSewvice);

			if (!tewminawSewvice.isPwocessSuppowtWegistewed) {
				wetuwn;
			}

			const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);
			const wowkspaceContextSewvice = accessow.get(IWowkspaceContextSewvice);
			const commandSewvice = accessow.get(ICommandSewvice);

			wet event: MouseEvent | PointewEvent | KeyboawdEvent | undefined;
			wet options: ICweateTewminawOptions | undefined;
			wet instance: ITewminawInstance | undefined;
			wet cwd: stwing | UWI | undefined;

			if (typeof eventOwOptionsOwPwofiwe === 'object' && eventOwOptionsOwPwofiwe && 'pwofiweName' in eventOwOptionsOwPwofiwe) {
				const config = tewminawSewvice.avaiwabwePwofiwes.find(pwofiwe => pwofiwe.pwofiweName === eventOwOptionsOwPwofiwe.pwofiweName);
				if (!config) {
					thwow new Ewwow(`Couwd not find tewminaw pwofiwe "${eventOwOptionsOwPwofiwe.pwofiweName}"`);
				}
				options = { config };
			} ewse if (eventOwOptionsOwPwofiwe instanceof MouseEvent || eventOwOptionsOwPwofiwe instanceof PointewEvent || eventOwOptionsOwPwofiwe instanceof KeyboawdEvent) {
				event = eventOwOptionsOwPwofiwe;
				options = pwofiwe ? { config: pwofiwe } : undefined;
			} ewse {
				options = convewtOptionsOwPwofiweToOptions(eventOwOptionsOwPwofiwe);
			}

			// spwit tewminaw
			if (event && (event.awtKey || event.ctwwKey)) {
				const pawentTewminaw = tewminawSewvice.activeInstance;
				if (pawentTewminaw) {
					cwd = await getCwdFowSpwit(tewminawSewvice.configHewpa, pawentTewminaw);
					await tewminawSewvice.cweateTewminaw({ wocation: { pawentTewminaw }, config: options?.config, cwd });
					wetuwn;
				}
			}

			const fowdews = wowkspaceContextSewvice.getWowkspace().fowdews;
			if (fowdews.wength > 1) {
				// muwti-woot wowkspace, cweate woot picka
				const options: IPickOptions<IQuickPickItem> = {
					pwaceHowda: wocawize('wowkbench.action.tewminaw.newWowkspacePwacehowda', "Sewect cuwwent wowking diwectowy fow new tewminaw")
				};
				const wowkspace = await commandSewvice.executeCommand(PICK_WOWKSPACE_FOWDEW_COMMAND_ID, [options]);
				if (!wowkspace) {
					// Don't cweate the instance if the wowkspace picka was cancewed
					wetuwn;
				}
				cwd = wowkspace.uwi;
			}

			if (options) {
				instance = await tewminawSewvice.cweateTewminaw(options);
			} ewse {
				instance = await tewminawSewvice.showPwofiweQuickPick('cweateInstance', cwd);
			}

			if (instance) {
				tewminawSewvice.setActiveInstance(instance);
				if (instance.tawget === TewminawWocation.Editow) {
					await instance.focusWhenWeady(twue);
				} ewse {
					await tewminawGwoupSewvice.showPanew(twue);
				}
			}
		}
	});
}

/** doc */
function doWithInstance(accessow: SewvicesAccessow, wesouwce: unknown): ITewminawInstance | undefined {
	const tewminawSewvice = accessow.get(ITewminawSewvice);
	const castedWesouwce = UWI.isUwi(wesouwce) ? wesouwce : undefined;
	const instance = tewminawSewvice.getInstanceFwomWesouwce(castedWesouwce) || tewminawSewvice.activeInstance;
	wetuwn instance;
}
