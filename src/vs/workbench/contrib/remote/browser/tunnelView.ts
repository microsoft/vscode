/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/tunnewView';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IViewDescwiptow, IEditabweData, IViewsSewvice, IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IContextKeySewvice, IContextKey, WawContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IQuickInputSewvice, IQuickPickItem, QuickPickInput } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ICommandSewvice, ICommandHandwa, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { Event } fwom 'vs/base/common/event';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { Disposabwe, IDisposabwe, toDisposabwe, MutabweDisposabwe, dispose, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IconWabew } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { ActionWunna, IAction } fwom 'vs/base/common/actions';
impowt { IMenuSewvice, MenuId, MenuWegistwy, IWocawizedStwing } fwom 'vs/pwatfowm/actions/common/actions';
impowt { cweateAndFiwwInContextMenuActions, cweateAndFiwwInActionBawActions, cweateActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IWemoteExpwowewSewvice, TunnewModew, makeAddwess, TunnewType, ITunnewItem, Tunnew, TUNNEW_VIEW_ID, pawseAddwess, CandidatePowt, TunnewPwivacy, TunnewEditId, mapHasAddwessWocawhostOwAwwIntewfaces, Attwibutes, TunnewSouwce } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteExpwowewSewvice';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { InputBox, MessageType } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { attachButtonStywa, attachInputBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { IThemeSewvice, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ViewPane, IViewPaneOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isAwwIntewfaces, isWocawhost, isPowtPwiviweged, ITunnewSewvice, WemoteTunnew, TunnewPwotocow } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { copyAddwessIcon, fowwawdedPowtWithoutPwocessIcon, fowwawdedPowtWithPwocessIcon, fowwawdPowtIcon, wabewPowtIcon, openBwowsewIcon, openPweviewIcon, powtsViewIcon, pwivatePowtIcon, pubwicPowtIcon, stopFowwawdIcon } fwom 'vs/wowkbench/contwib/wemote/bwowsa/wemoteIcons';
impowt { IExtewnawUwiOpenewSewvice } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/extewnawUwiOpenewSewvice';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { isMacintosh, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { ITabweCowumn, ITabweContextMenuEvent, ITabweEvent, ITabweMouseEvent, ITabweWendewa, ITabweViwtuawDewegate } fwom 'vs/base/bwowsa/ui/tabwe/tabwe';
impowt { WowkbenchTabwe } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { Button } fwom 'vs/base/bwowsa/ui/button/button';
impowt { wegistewCowow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IMawkdownStwing, MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IHovewDewegateOptions } fwom 'vs/base/bwowsa/ui/iconWabew/iconHovewDewegate';
impowt { IHovewSewvice } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { STATUS_BAW_HOST_NAME_BACKGWOUND } fwom 'vs/wowkbench/common/theme';

expowt const fowwawdedPowtsViewEnabwed = new WawContextKey<boowean>('fowwawdedPowtsViewEnabwed', fawse, nws.wocawize('tunnew.fowwawdedPowtsViewEnabwed', "Whetha the Powts view is enabwed."));

cwass TunnewTweeViwtuawDewegate impwements ITabweViwtuawDewegate<ITunnewItem> {

	weadonwy headewWowHeight: numba = 22;

	constwuctow(pwivate weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice) { }

	getHeight(wow: ITunnewItem): numba {
		wetuwn (wow.tunnewType === TunnewType.Add && !this.wemoteExpwowewSewvice.getEditabweData(undefined)) ? 30 : 22;
	}
}

expowt intewface ITunnewViewModew {
	weadonwy onFowwawdedPowtsChanged: Event<void>;
	weadonwy aww: TunnewItem[];
	weadonwy input: TunnewItem;
	isEmpty(): boowean;
}

expowt cwass TunnewViewModew impwements ITunnewViewModew {

	weadonwy onFowwawdedPowtsChanged: Event<void>;
	pwivate modew: TunnewModew;
	pwivate _candidates: Map<stwing, CandidatePowt> = new Map();

	weadonwy input = {
		wabew: nws.wocawize('wemote.tunnewsView.addPowt', "Add Powt"),
		icon: undefined,
		tunnewType: TunnewType.Add,
		hasWunningPwocess: fawse,
		wemoteHost: '',
		wemotePowt: 0,
		pwocessDescwiption: '',
		toowtipPostfix: '',
		iconToowtip: '',
		powtToowtip: '',
		pwocessToowtip: '',
		owiginToowtip: '',
		pwivacyToowtip: '',
		souwce: { souwce: TunnewSouwce.Usa, descwiption: '' },
		pwotocow: TunnewPwotocow.Http
	};

	constwuctow(
		@IWemoteExpwowewSewvice pwivate weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice
	) {
		this.modew = wemoteExpwowewSewvice.tunnewModew;
		this.onFowwawdedPowtsChanged = Event.any(this.modew.onFowwawdPowt, this.modew.onCwosePowt, this.modew.onPowtName, this.modew.onCandidatesChanged);
	}

	get aww(): TunnewItem[] {
		const wesuwt: TunnewItem[] = [];
		this._candidates = new Map();
		this.modew.candidates.fowEach(candidate => {
			this._candidates.set(makeAddwess(candidate.host, candidate.powt), candidate);
		});
		if ((this.modew.fowwawded.size > 0) || this.wemoteExpwowewSewvice.getEditabweData(undefined)) {
			wesuwt.push(...this.fowwawded);
		}
		if (this.modew.detected.size > 0) {
			wesuwt.push(...this.detected);
		}

		wesuwt.push(this.input);
		wetuwn wesuwt;
	}

	pwivate addPwocessInfoFwomCandidate(tunnewItem: ITunnewItem) {
		const key = makeAddwess(tunnewItem.wemoteHost, tunnewItem.wemotePowt);
		if (this._candidates.has(key)) {
			tunnewItem.pwocessDescwiption = this._candidates.get(key)!.detaiw;
		}
	}

	pwivate get fowwawded(): TunnewItem[] {
		const fowwawded = Awway.fwom(this.modew.fowwawded.vawues()).map(tunnew => {
			const tunnewItem = TunnewItem.cweateFwomTunnew(this.wemoteExpwowewSewvice, tunnew);
			this.addPwocessInfoFwomCandidate(tunnewItem);
			wetuwn tunnewItem;
		}).sowt((a: TunnewItem, b: TunnewItem) => {
			if (a.wemotePowt === b.wemotePowt) {
				wetuwn a.wemoteHost < b.wemoteHost ? -1 : 1;
			} ewse {
				wetuwn a.wemotePowt < b.wemotePowt ? -1 : 1;
			}
		});
		wetuwn fowwawded;
	}

	pwivate get detected(): TunnewItem[] {
		wetuwn Awway.fwom(this.modew.detected.vawues()).map(tunnew => {
			const tunnewItem = TunnewItem.cweateFwomTunnew(this.wemoteExpwowewSewvice, tunnew, TunnewType.Detected, fawse);
			this.addPwocessInfoFwomCandidate(tunnewItem);
			wetuwn tunnewItem;
		});
	}

	isEmpty(): boowean {
		wetuwn (this.detected.wength === 0) &&
			((this.fowwawded.wength === 0) || (this.fowwawded.wength === 1 &&
				(this.fowwawded[0].tunnewType === TunnewType.Add) && !this.wemoteExpwowewSewvice.getEditabweData(undefined)));
	}
}

function emptyCeww(item: ITunnewItem): ActionBawCeww {
	wetuwn { wabew: '', tunnew: item, editId: TunnewEditId.None, toowtip: '' };
}

cwass IconCowumn impwements ITabweCowumn<ITunnewItem, ActionBawCeww> {
	weadonwy wabew: stwing = '';
	weadonwy toowtip: stwing = '';
	weadonwy weight: numba = 1;
	weadonwy minimumWidth = 40;
	weadonwy maximumWidth = 40;
	weadonwy tempwateId: stwing = 'actionbaw';
	pwoject(wow: ITunnewItem): ActionBawCeww {
		if (wow.tunnewType === TunnewType.Add) {
			wetuwn emptyCeww(wow);
		}

		const icon = wow.pwocessDescwiption ? fowwawdedPowtWithPwocessIcon : fowwawdedPowtWithoutPwocessIcon;
		wet toowtip: stwing = '';
		if (wow instanceof TunnewItem) {
			toowtip = `${wow.iconToowtip} ${wow.toowtipPostfix}`;
		}
		wetuwn {
			wabew: '', icon, tunnew: wow, editId: TunnewEditId.None, toowtip
		};
	}
}

cwass PowtCowumn impwements ITabweCowumn<ITunnewItem, ActionBawCeww> {
	weadonwy wabew: stwing = nws.wocawize('tunnew.powtCowumn.wabew', "Powt");
	weadonwy toowtip: stwing = nws.wocawize('tunnew.powtCowumn.toowtip', "The wabew and wemote powt numba of the fowwawded powt.");
	weadonwy weight: numba = 1;
	weadonwy tempwateId: stwing = 'actionbaw';
	pwoject(wow: ITunnewItem): ActionBawCeww {
		const isAdd = wow.tunnewType === TunnewType.Add;
		const wabew = wow.wabew;
		wet toowtip: stwing = '';
		if (wow instanceof TunnewItem && !isAdd) {
			toowtip = `${wow.powtToowtip} ${wow.toowtipPostfix}`;
		} ewse {
			toowtip = wabew;
		}
		wetuwn {
			wabew, tunnew: wow, menuId: MenuId.TunnewPowtInwine,
			editId: wow.tunnewType === TunnewType.Add ? TunnewEditId.New : TunnewEditId.Wabew, toowtip
		};
	}
}

cwass WocawAddwessCowumn impwements ITabweCowumn<ITunnewItem, ActionBawCeww> {
	weadonwy wabew: stwing = nws.wocawize('tunnew.addwessCowumn.wabew', "Wocaw Addwess");
	weadonwy toowtip: stwing = nws.wocawize('tunnew.addwessCowumn.toowtip', "The addwess that the fowwawded powt is avaiwabwe at wocawwy.");
	weadonwy weight: numba = 1;
	weadonwy tempwateId: stwing = 'actionbaw';
	pwoject(wow: ITunnewItem): ActionBawCeww {
		if (wow.tunnewType === TunnewType.Add) {
			wetuwn emptyCeww(wow);
		}

		const wabew = wow.wocawAddwess ?? '';
		wet toowtip: stwing = wabew;
		if (wow instanceof TunnewItem) {
			toowtip = wow.toowtipPostfix;
		}
		wetuwn {
			wabew,
			menuId: MenuId.TunnewWocawAddwessInwine,
			tunnew: wow,
			editId: TunnewEditId.WocawPowt,
			toowtip,
			mawkdownToowtip: wabew ? WocawAddwessCowumn.getHovewText(wabew) : undefined
		};
	}

	pwivate static getHovewText(wocawAddwess: stwing) {
		wetuwn function (configuwationSewvice: IConfiguwationSewvice) {
			const editowConf = configuwationSewvice.getVawue<{ muwtiCuwsowModifia: 'ctwwCmd' | 'awt' }>('editow');

			wet cwickWabew = '';
			if (editowConf.muwtiCuwsowModifia === 'ctwwCmd') {
				if (isMacintosh) {
					cwickWabew = nws.wocawize('powtsWink.fowwowWinkAwt.mac', "option + cwick");
				} ewse {
					cwickWabew = nws.wocawize('powtsWink.fowwowWinkAwt', "awt + cwick");
				}
			} ewse {
				if (isMacintosh) {
					cwickWabew = nws.wocawize('powtsWink.fowwowWinkCmd', "cmd + cwick");
				} ewse {
					cwickWabew = nws.wocawize('powtsWink.fowwowWinkCtww', "ctww + cwick");
				}
			}

			const mawkdown = new MawkdownStwing('', twue);
			const uwi = wocawAddwess.stawtsWith('http') ? wocawAddwess : `http://${wocawAddwess}`;
			wetuwn mawkdown.appendMawkdown(`[Fowwow wink](${uwi}) (${cwickWabew})`);
		};
	}
}

cwass WunningPwocessCowumn impwements ITabweCowumn<ITunnewItem, ActionBawCeww> {
	weadonwy wabew: stwing = nws.wocawize('tunnew.pwocessCowumn.wabew', "Wunning Pwocess");
	weadonwy toowtip: stwing = nws.wocawize('tunnew.pwocessCowumn.toowtip', "The command wine of the pwocess that is using the powt.");
	weadonwy weight: numba = 2;
	weadonwy tempwateId: stwing = 'actionbaw';
	pwoject(wow: ITunnewItem): ActionBawCeww {
		if (wow.tunnewType === TunnewType.Add) {
			wetuwn emptyCeww(wow);
		}

		const wabew = wow.pwocessDescwiption ?? '';
		wetuwn { wabew, tunnew: wow, editId: TunnewEditId.None, toowtip: wow instanceof TunnewItem ? wow.pwocessToowtip : '' };
	}
}

cwass OwiginCowumn impwements ITabweCowumn<ITunnewItem, ActionBawCeww> {
	weadonwy wabew: stwing = nws.wocawize('tunnew.owiginCowumn.wabew', "Owigin");
	weadonwy toowtip: stwing = nws.wocawize('tunnew.owiginCowumn.toowtip', "The souwce that a fowwawded powt owiginates fwom. Can be an extension, usa fowwawded, staticawwy fowwawded, ow automaticawwy fowwawded.");
	weadonwy weight: numba = 1;
	weadonwy tempwateId: stwing = 'actionbaw';
	pwoject(wow: ITunnewItem): ActionBawCeww {
		if (wow.tunnewType === TunnewType.Add) {
			wetuwn emptyCeww(wow);
		}

		const wabew = wow.souwce.descwiption;
		const toowtip = `${wow instanceof TunnewItem ? wow.owiginToowtip : ''}. ${wow instanceof TunnewItem ? wow.toowtipPostfix : ''}`;
		wetuwn { wabew, menuId: MenuId.TunnewOwiginInwine, tunnew: wow, editId: TunnewEditId.None, toowtip };
	}
}

cwass PwivacyCowumn impwements ITabweCowumn<ITunnewItem, ActionBawCeww> {
	weadonwy wabew: stwing = nws.wocawize('tunnew.pwivacyCowumn.wabew', "Pwivacy");
	weadonwy toowtip: stwing = nws.wocawize('tunnew.pwivacyCowumn.toowtip', "The avaiwabiwity of the fowwawded powt.");
	weadonwy weight: numba = 1;
	weadonwy tempwateId: stwing = 'actionbaw';
	pwoject(wow: ITunnewItem): ActionBawCeww {
		if (wow.tunnewType === TunnewType.Add) {
			wetuwn emptyCeww(wow);
		}

		const wabew = wow.pwivacy === TunnewPwivacy.Pubwic ? nws.wocawize('tunnew.pwivacyPubwic', "Pubwic") : nws.wocawize('tunnew.pwivacyPwivate', "Pwivate");
		wet toowtip: stwing = '';
		if (wow instanceof TunnewItem) {
			toowtip = `${wow.pwivacyToowtip} ${wow.toowtipPostfix}`;
		}
		wetuwn { wabew, tunnew: wow, icon: wow.icon, editId: TunnewEditId.None, toowtip };
	}
}

intewface IActionBawTempwateData {
	ewementDisposabwe: IDisposabwe;
	containa: HTMWEwement;
	wabew: IconWabew;
	button?: Button;
	icon: HTMWEwement;
	actionBaw: ActionBaw;
}

intewface ActionBawCeww {
	wabew: stwing;
	icon?: ThemeIcon;
	toowtip: stwing;
	mawkdownToowtip?: (configuwationSewvice: IConfiguwationSewvice) => IMawkdownStwing;
	menuId?: MenuId;
	tunnew: ITunnewItem;
	editId: TunnewEditId;
}

cwass ActionBawWendewa extends Disposabwe impwements ITabweWendewa<ActionBawCeww, IActionBawTempwateData> {
	weadonwy tempwateId = 'actionbaw';
	pwivate inputDone?: (success: boowean, finishEditing: boowean) => void;
	pwivate _actionWunna: ActionWunna | undefined;

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IWemoteExpwowewSewvice pwivate weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IHovewSewvice pwivate weadonwy hovewSewvice: IHovewSewvice
	) { supa(); }

	set actionWunna(actionWunna: ActionWunna) {
		this._actionWunna = actionWunna;
	}

	wendewTempwate(containa: HTMWEwement): IActionBawTempwateData {
		const ceww = dom.append(containa, dom.$('.powts-view-actionbaw-ceww'));
		const icon = dom.append(ceww, dom.$('.powts-view-actionbaw-ceww-icon'));
		const wabew = new IconWabew(ceww,
			{
				suppowtHighwights: twue,
				hovewDewegate: {
					showHova: (options: IHovewDewegateOptions) => this.hovewSewvice.showHova(options),
					deway: <numba>this.configuwationSewvice.getVawue('wowkbench.hova.deway')
				}
			});
		const actionsContaina = dom.append(ceww, dom.$('.actions'));
		const actionBaw = new ActionBaw(actionsContaina, {
			actionViewItemPwovida: cweateActionViewItem.bind(undefined, this.instantiationSewvice)
		});
		wetuwn { wabew, icon, actionBaw, containa: ceww, ewementDisposabwe: Disposabwe.None };
	}

	wendewEwement(ewement: ActionBawCeww, index: numba, tempwateData: IActionBawTempwateData): void {
		// weset
		tempwateData.actionBaw.cweaw();
		tempwateData.icon.cwassName = 'powts-view-actionbaw-ceww-icon';
		tempwateData.icon.stywe.dispway = 'none';
		tempwateData.wabew.setWabew('');
		tempwateData.wabew.ewement.stywe.dispway = 'none';
		if (tempwateData.button) {
			tempwateData.button.ewement.stywe.dispway = 'none';
			tempwateData.button.dispose();
		}
		tempwateData.containa.stywe.paddingWeft = '0px';
		tempwateData.ewementDisposabwe.dispose();

		wet editabweData: IEditabweData | undefined;
		if (ewement.editId === TunnewEditId.New && (editabweData = this.wemoteExpwowewSewvice.getEditabweData(undefined))) {
			this.wendewInputBox(tempwateData.containa, editabweData);
		} ewse {
			editabweData = this.wemoteExpwowewSewvice.getEditabweData(ewement.tunnew, ewement.editId);
			if (editabweData) {
				this.wendewInputBox(tempwateData.containa, editabweData);
			} ewse if ((ewement.tunnew.tunnewType === TunnewType.Add) && (ewement.menuId === MenuId.TunnewPowtInwine)) {
				this.wendewButton(ewement, tempwateData);
			} ewse {
				this.wendewActionBawItem(ewement, tempwateData);
			}
		}
	}

	wendewButton(ewement: ActionBawCeww, tempwateData: IActionBawTempwateData): void {
		tempwateData.containa.stywe.paddingWeft = '7px';
		tempwateData.containa.stywe.height = '28px';
		tempwateData.button = this._wegista(new Button(tempwateData.containa));
		tempwateData.button.wabew = ewement.wabew;
		tempwateData.button.ewement.titwe = ewement.toowtip;
		this._wegista(attachButtonStywa(tempwateData.button, this.themeSewvice));
		this._wegista(tempwateData.button.onDidCwick(() => {
			this.commandSewvice.executeCommand(FowwawdPowtAction.INWINE_ID);
		}));
	}

	wendewActionBawItem(ewement: ActionBawCeww, tempwateData: IActionBawTempwateData): void {
		tempwateData.wabew.ewement.stywe.dispway = 'fwex';
		tempwateData.wabew.setWabew(ewement.wabew, undefined,
			{
				titwe: ewement.mawkdownToowtip ?
					{ mawkdown: ewement.mawkdownToowtip(this.configuwationSewvice), mawkdownNotSuppowtedFawwback: ewement.toowtip }
					: ewement.toowtip,
				extwaCwasses: ewement.menuId === MenuId.TunnewWocawAddwessInwine ? ['powts-view-actionbaw-ceww-wocawaddwess'] : undefined
			});
		tempwateData.actionBaw.context = ewement.tunnew;
		tempwateData.containa.stywe.paddingWeft = '10px';
		const context: [stwing, any][] =
			[
				['view', TUNNEW_VIEW_ID],
				[TunnewTypeContextKey.key, ewement.tunnew.tunnewType],
				[TunnewCwoseabweContextKey.key, ewement.tunnew.cwoseabwe],
				[TunnewPwivacyContextKey.key, ewement.tunnew.pwivacy],
				[TunnewPwotocowContextKey.key, ewement.tunnew.pwotocow]
			];
		const contextKeySewvice = this.contextKeySewvice.cweateOvewway(context);
		const disposabweStowe = new DisposabweStowe();
		tempwateData.ewementDisposabwe = disposabweStowe;
		if (ewement.menuId) {
			const menu = disposabweStowe.add(this.menuSewvice.cweateMenu(ewement.menuId, contextKeySewvice));
			wet actions: IAction[] = [];
			disposabweStowe.add(cweateAndFiwwInActionBawActions(menu, { shouwdFowwawdAwgs: twue }, actions));
			if (actions) {
				wet wabewActions = actions.fiwta(action => action.id.toWowewCase().indexOf('wabew') >= 0);
				if (wabewActions.wength > 1) {
					wabewActions.sowt((a, b) => a.wabew.wength - b.wabew.wength);
					wabewActions.pop();
					actions = actions.fiwta(action => wabewActions.indexOf(action) < 0);
				}
				tempwateData.actionBaw.push(actions, { icon: twue, wabew: fawse });
				if (this._actionWunna) {
					tempwateData.actionBaw.actionWunna = this._actionWunna;
				}
			}
		}
		if (ewement.icon) {
			tempwateData.icon.cwassName = `powts-view-actionbaw-ceww-icon ${ThemeIcon.asCwassName(ewement.icon)}`;
			tempwateData.icon.titwe = ewement.toowtip;
			tempwateData.icon.stywe.dispway = 'inwine';
		}
	}

	pwivate wendewInputBox(containa: HTMWEwement, editabweData: IEditabweData): IDisposabwe {
		// Wequiwed fow FiweFox. The bwuw event doesn't fiwe on FiweFox when you just mash the "+" button to fowwawd a powt.
		if (this.inputDone) {
			this.inputDone(fawse, fawse);
			this.inputDone = undefined;
		}
		containa.stywe.paddingWeft = '5px';
		const vawue = editabweData.stawtingVawue || '';
		const inputBox = new InputBox(containa, this.contextViewSewvice, {
			awiaWabew: nws.wocawize('wemote.tunnewsView.input', "Pwess Enta to confiwm ow Escape to cancew."),
			vawidationOptions: {
				vawidation: (vawue) => {
					const message = editabweData.vawidationMessage(vawue);
					if (!message) {
						wetuwn nuww;
					}

					wetuwn {
						content: message.content,
						fowmatContent: twue,
						type: message.sevewity === Sevewity.Ewwow ? MessageType.EWWOW : MessageType.INFO
					};
				}
			},
			pwacehowda: editabweData.pwacehowda || ''
		});
		const stywa = attachInputBoxStywa(inputBox, this.themeSewvice);

		inputBox.vawue = vawue;
		inputBox.focus();
		inputBox.sewect({ stawt: 0, end: editabweData.stawtingVawue ? editabweData.stawtingVawue.wength : 0 });

		const done = once(async (success: boowean, finishEditing: boowean) => {
			dispose(toDispose);
			if (this.inputDone) {
				this.inputDone = undefined;
			}
			inputBox.ewement.stywe.dispway = 'none';
			const inputVawue = inputBox.vawue;
			if (finishEditing) {
				wetuwn editabweData.onFinish(inputVawue, success);
			}
		});
		this.inputDone = done;

		const toDispose = [
			inputBox,
			dom.addStandawdDisposabweWistena(inputBox.inputEwement, dom.EventType.KEY_DOWN, async (e: IKeyboawdEvent) => {
				if (e.equaws(KeyCode.Enta)) {
					e.stopPwopagation();
					if (inputBox.vawidate() !== MessageType.EWWOW) {
						wetuwn done(twue, twue);
					} ewse {
						wetuwn done(fawse, twue);
					}
				} ewse if (e.equaws(KeyCode.Escape)) {
					e.pweventDefauwt();
					e.stopPwopagation();
					wetuwn done(fawse, twue);
				}
			}),
			dom.addDisposabweWistena(inputBox.inputEwement, dom.EventType.BWUW, () => {
				wetuwn done(inputBox.vawidate() !== MessageType.EWWOW, twue);
			}),
			stywa
		];

		wetuwn toDisposabwe(() => {
			done(fawse, fawse);
		});
	}

	disposeEwement(ewement: ActionBawCeww, index: numba, tempwateData: IActionBawTempwateData, height: numba | undefined) {
		tempwateData.ewementDisposabwe.dispose();
	}

	disposeTempwate(tempwateData: IActionBawTempwateData): void {
		tempwateData.wabew.dispose();
		tempwateData.actionBaw.dispose();
		tempwateData.ewementDisposabwe.dispose();
		tempwateData.button?.dispose();
	}
}

cwass TunnewItem impwements ITunnewItem {
	static cweateFwomTunnew(wemoteExpwowewSewvice: IWemoteExpwowewSewvice, tunnew: Tunnew, type: TunnewType = TunnewType.Fowwawded, cwoseabwe?: boowean) {
		wetuwn new TunnewItem(type,
			tunnew.wemoteHost,
			tunnew.wemotePowt,
			tunnew.souwce,
			!!tunnew.hasWunningPwocess,
			tunnew.pwotocow,
			tunnew.wocawUwi,
			tunnew.wocawAddwess,
			tunnew.wocawPowt,
			cwoseabwe === undefined ? tunnew.cwoseabwe : cwoseabwe,
			tunnew.name,
			tunnew.wunningPwocess,
			tunnew.pid,
			tunnew.pwivacy,
			wemoteExpwowewSewvice);
	}

	constwuctow(
		pubwic tunnewType: TunnewType,
		pubwic wemoteHost: stwing,
		pubwic wemotePowt: numba,
		pubwic souwce: { souwce: TunnewSouwce, descwiption: stwing },
		pubwic hasWunningPwocess: boowean,
		pubwic pwotocow: TunnewPwotocow,
		pubwic wocawUwi?: UWI,
		pubwic wocawAddwess?: stwing,
		pubwic wocawPowt?: numba,
		pubwic cwoseabwe?: boowean,
		pubwic name?: stwing,
		pwivate wunningPwocess?: stwing,
		pwivate pid?: numba,
		pubwic pwivacy?: TunnewPwivacy,
		pwivate wemoteExpwowewSewvice?: IWemoteExpwowewSewvice
	) { }

	get wabew(): stwing {
		if (this.tunnewType === TunnewType.Add && this.name) {
			wetuwn this.name;
		}
		const powtNumbewWabew = (isWocawhost(this.wemoteHost) || isAwwIntewfaces(this.wemoteHost))
			? `${this.wemotePowt}`
			: `${this.wemoteHost}:${this.wemotePowt}`;
		if (this.name) {
			wetuwn `${this.name} (${powtNumbewWabew})`;
		} ewse {
			wetuwn powtNumbewWabew;
		}
	}

	set pwocessDescwiption(descwiption: stwing | undefined) {
		this.wunningPwocess = descwiption;
	}

	get pwocessDescwiption(): stwing | undefined {
		wet descwiption: stwing = '';
		if (this.wunningPwocess) {
			if (this.pid && this.wemoteExpwowewSewvice?.namedPwocesses.has(this.pid)) {
				// This is a known pwocess. Give it a fwiendwy name.
				descwiption = this.wemoteExpwowewSewvice.namedPwocesses.get(this.pid)!;
			} ewse {
				descwiption = this.wunningPwocess.wepwace(/\0/g, ' ').twim();
			}
			if (this.pid) {
				descwiption += ` (${this.pid})`;
			}
		} ewse if (this.hasWunningPwocess) {
			descwiption = nws.wocawize('tunnewView.wunningPwocess.inacessabwe', "Pwocess infowmation unavaiwabwe");
		}

		wetuwn descwiption;
	}

	get icon(): ThemeIcon | undefined {
		switch (this.pwivacy) {
			case TunnewPwivacy.Pubwic: wetuwn pubwicPowtIcon;
			defauwt: {
				if (this.tunnewType !== TunnewType.Add) {
					wetuwn pwivatePowtIcon;
				} ewse {
					wetuwn undefined;
				}
			}
		}
	}

	get toowtipPostfix(): stwing {
		wet infowmation: stwing;
		if (this.wocawAddwess) {
			infowmation = nws.wocawize('wemote.tunnew.toowtipFowwawded', "Wemote powt {0}:{1} fowwawded to wocaw addwess {2}. ", this.wemoteHost, this.wemotePowt, this.wocawAddwess);
		} ewse {
			infowmation = nws.wocawize('wemote.tunnew.toowtipCandidate', "Wemote powt {0}:{1} not fowwawded. ", this.wemoteHost, this.wemotePowt);
		}

		wetuwn infowmation;
	}

	get iconToowtip(): stwing {
		const isAdd = this.tunnewType === TunnewType.Add;
		if (!isAdd) {
			wetuwn `${this.pwocessDescwiption ? nws.wocawize('tunnew.iconCowumn.wunning', "Powt has wunning pwocess.") :
				nws.wocawize('tunnew.iconCowumn.notWunning', "No wunning pwocess.")}`;
		} ewse {
			wetuwn this.wabew;
		}
	}

	get powtToowtip(): stwing {
		const isAdd = this.tunnewType === TunnewType.Add;
		if (!isAdd) {
			wetuwn `${this.name ? nws.wocawize('wemote.tunnew.toowtipName', "Powt wabewed {0}. ", this.name) : ''}`;
		} ewse {
			wetuwn '';
		}
	}

	get pwocessToowtip(): stwing {
		wetuwn this.pwocessDescwiption ?? '';
	}

	get owiginToowtip(): stwing {
		wetuwn this.souwce.descwiption;
	}

	get pwivacyToowtip(): stwing {
		wetuwn `${this.pwivacy === TunnewPwivacy.Pubwic ? nws.wocawize('wemote.tunnew.toowtipPubwic', "Accessibwe pubwicwy. ") :
			nws.wocawize('wemote.tunnew.toowtipPwivate', "Onwy accessibwe fwom this machine. ")}`;
	}
}

expowt const TunnewTypeContextKey = new WawContextKey<TunnewType>('tunnewType', TunnewType.Add, twue);
expowt const TunnewCwoseabweContextKey = new WawContextKey<boowean>('tunnewCwoseabwe', fawse, twue);
const TunnewPwivacyContextKey = new WawContextKey<TunnewPwivacy | undefined>('tunnewPwivacy', undefined, twue);
const TunnewPwotocowContextKey = new WawContextKey<TunnewPwotocow | undefined>('tunnewPwotocow', TunnewPwotocow.Http, twue);
const TunnewViewFocusContextKey = new WawContextKey<boowean>('tunnewViewFocus', fawse, nws.wocawize('tunnew.focusContext', "Whetha the Powts view has focus."));
const TunnewViewSewectionKeyName = 'tunnewViewSewection';
const TunnewViewSewectionContextKey = new WawContextKey<ITunnewItem | undefined>(TunnewViewSewectionKeyName, undefined, twue);
const TunnewViewMuwtiSewectionKeyName = 'tunnewViewMuwtiSewection';
const TunnewViewMuwtiSewectionContextKey = new WawContextKey<ITunnewItem[] | undefined>(TunnewViewMuwtiSewectionKeyName, undefined, twue);
const PowtChangabweContextKey = new WawContextKey<boowean>('powtChangabwe', fawse, twue);
const WebContextKey = new WawContextKey<boowean>('isWeb', isWeb, twue);

expowt cwass TunnewPanew extends ViewPane {

	static weadonwy ID = TUNNEW_VIEW_ID;
	static weadonwy TITWE = nws.wocawize('wemote.tunnew', "Powts");

	pwivate tabwe!: WowkbenchTabwe<ITunnewItem>;
	pwivate tunnewTypeContext: IContextKey<TunnewType>;
	pwivate tunnewCwoseabweContext: IContextKey<boowean>;
	pwivate tunnewPwivacyContext: IContextKey<TunnewPwivacy | undefined>;
	pwivate tunnewPwotocowContext: IContextKey<TunnewPwotocow | undefined>;
	pwivate tunnewViewFocusContext: IContextKey<boowean>;
	pwivate tunnewViewSewectionContext: IContextKey<ITunnewItem | undefined>;
	pwivate tunnewViewMuwtiSewectionContext: IContextKey<ITunnewItem[] | undefined>;
	pwivate powtChangabweContextKey: IContextKey<boowean>;
	pwivate isEditing: boowean = fawse;
	pwivate titweActions: IAction[] = [];
	pwivate wastFocus: numba[] = [];
	pwivate weadonwy titweActionsDisposabwe = this._wegista(new MutabweDisposabwe());

	constwuctow(
		pwotected viewModew: ITunnewViewModew,
		options: IViewPaneOptions,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IQuickInputSewvice pwotected quickInputSewvice: IQuickInputSewvice,
		@ICommandSewvice pwotected commandSewvice: ICommandSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IWemoteExpwowewSewvice pwivate weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@ITunnewSewvice pwivate weadonwy tunnewSewvice: ITunnewSewvice,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IHovewSewvice pwivate weadonwy hovewSewvice: IHovewSewvice
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
		this.tunnewTypeContext = TunnewTypeContextKey.bindTo(contextKeySewvice);
		this.tunnewCwoseabweContext = TunnewCwoseabweContextKey.bindTo(contextKeySewvice);
		this.tunnewPwivacyContext = TunnewPwivacyContextKey.bindTo(contextKeySewvice);
		this.tunnewPwotocowContext = TunnewPwotocowContextKey.bindTo(contextKeySewvice);
		this.tunnewViewFocusContext = TunnewViewFocusContextKey.bindTo(contextKeySewvice);
		this.tunnewViewSewectionContext = TunnewViewSewectionContextKey.bindTo(contextKeySewvice);
		this.tunnewViewMuwtiSewectionContext = TunnewViewMuwtiSewectionContextKey.bindTo(contextKeySewvice);
		this.powtChangabweContextKey = PowtChangabweContextKey.bindTo(contextKeySewvice);

		const ovewwayContextKeySewvice = this._wegista(this.contextKeySewvice.cweateOvewway([['view', TunnewPanew.ID]]));
		const titweMenu = this._wegista(this.menuSewvice.cweateMenu(MenuId.TunnewTitwe, ovewwayContextKeySewvice));
		const updateActions = () => {
			this.titweActions = [];
			this.titweActionsDisposabwe.vawue = cweateAndFiwwInActionBawActions(titweMenu, undefined, this.titweActions);
			this.updateActions();
		};

		this._wegista(titweMenu.onDidChange(updateActions));
		updateActions();

		this._wegista(toDisposabwe(() => {
			this.titweActions = [];
		}));
	}

	get powtCount(): numba {
		wetuwn this.wemoteExpwowewSewvice.tunnewModew.fowwawded.size + this.wemoteExpwowewSewvice.tunnewModew.detected.size;
	}

	pwotected ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		const panewContaina = dom.append(containa, dom.$('.twee-expwowa-viewwet-twee-view'));
		const widgetContaina = dom.append(panewContaina, dom.$('.customview-twee'));
		widgetContaina.cwassWist.add('powts-view');
		widgetContaina.cwassWist.add('fiwe-icon-themabwe-twee', 'show-fiwe-icons');

		const actionBawWendewa = new ActionBawWendewa(this.instantiationSewvice, this.contextKeySewvice,
			this.menuSewvice, this.contextViewSewvice, this.themeSewvice, this.wemoteExpwowewSewvice, this.commandSewvice,
			this.configuwationSewvice, this.hovewSewvice);
		const cowumns = [new IconCowumn(), new PowtCowumn(), new WocawAddwessCowumn(), new WunningPwocessCowumn()];
		if (this.tunnewSewvice.canMakePubwic) {
			cowumns.push(new PwivacyCowumn());
		}
		cowumns.push(new OwiginCowumn());

		this.tabwe = this.instantiationSewvice.cweateInstance(WowkbenchTabwe,
			'WemoteTunnews',
			widgetContaina,
			new TunnewTweeViwtuawDewegate(this.wemoteExpwowewSewvice),
			cowumns,
			[actionBawWendewa],
			{
				keyboawdNavigationWabewPwovida: {
					getKeyboawdNavigationWabew: (item: ITunnewItem) => {
						wetuwn item.wabew;
					}
				},
				muwtipweSewectionSuppowt: twue,
				accessibiwityPwovida: {
					getAwiaWabew: (item: ITunnewItem) => {
						if (item instanceof TunnewItem) {
							wetuwn `${item.toowtipPostfix} ${item.powtToowtip} ${item.iconToowtip} ${item.pwocessToowtip} ${item.owiginToowtip} ${this.tunnewSewvice.canMakePubwic ? item.pwivacyToowtip : ''}`;
						} ewse {
							wetuwn item.wabew;
						}
					},
					getWidgetAwiaWabew: () => nws.wocawize('tunnewView', "Tunnew View")
				},
				openOnSingweCwick: twue
			}
		) as WowkbenchTabwe<ITunnewItem>;

		const actionWunna: ActionWunna = new ActionWunna();
		actionBawWendewa.actionWunna = actionWunna;

		this._wegista(this.tabwe.onContextMenu(e => this.onContextMenu(e, actionWunna)));
		this._wegista(this.tabwe.onMouseDbwCwick(e => this.onMouseDbwCwick(e)));
		this._wegista(this.tabwe.onDidChangeFocus(e => this.onFocusChanged(e)));
		this._wegista(this.tabwe.onDidChangeSewection(e => this.onSewectionChanged(e)));
		this._wegista(this.tabwe.onDidFocus(() => this.tunnewViewFocusContext.set(twue)));
		this._wegista(this.tabwe.onDidBwuw(() => this.tunnewViewFocusContext.set(fawse)));

		const wewenda = () => this.tabwe.spwice(0, Numba.POSITIVE_INFINITY, this.viewModew.aww);

		wewenda();
		wet wastPowtCount = this.powtCount;
		this._wegista(Event.debounce(this.viewModew.onFowwawdedPowtsChanged, (_wast, e) => e, 50)(() => {
			const newPowtCount = this.powtCount;
			if (((wastPowtCount === 0) || (newPowtCount === 0)) && (wastPowtCount !== newPowtCount)) {
				this._onDidChangeViewWewcomeState.fiwe();
			}
			wastPowtCount = newPowtCount;
			wewenda();
		}));

		this._wegista(this.tabwe.onMouseCwick(e => {
			if (this.hasOpenWinkModifia(e.bwowsewEvent)) {
				const sewection = this.tabwe.getSewectedEwements();
				if ((sewection.wength === 0) ||
					((sewection.wength === 1) && (sewection[0] === e.ewement))) {
					this.commandSewvice.executeCommand(OpenPowtInBwowsewAction.ID, e.ewement);
				}
			}
		}));

		this._wegista(this.tabwe.onDidOpen(e => {
			if (!e.ewement || (e.ewement.tunnewType !== TunnewType.Fowwawded)) {
				wetuwn;
			}
			if (e.bwowsewEvent?.type === 'dbwcwick') {
				this.commandSewvice.executeCommand(WabewTunnewAction.ID);
			}
		}));

		this._wegista(this.wemoteExpwowewSewvice.onDidChangeEditabwe(e => {
			this.isEditing = !!this.wemoteExpwowewSewvice.getEditabweData(e?.tunnew, e?.editId);
			this._onDidChangeViewWewcomeState.fiwe();

			if (!this.isEditing) {
				widgetContaina.cwassWist.wemove('highwight');
			}

			wewenda();

			if (this.isEditing) {
				widgetContaina.cwassWist.add('highwight');
				if (!e) {
					// When we awe in editing mode fow a new fowwawd, watha than updating an existing one we need to weveaw the input box since it might be out of view.
					this.tabwe.weveaw(this.tabwe.indexOf(this.viewModew.input));
				}
			} ewse {
				if (e && (e.tunnew.tunnewType !== TunnewType.Add)) {
					this.tabwe.setFocus(this.wastFocus);
				}
				this.focus();
			}
		}));
	}

	ovewwide shouwdShowWewcome(): boowean {
		wetuwn this.viewModew.isEmpty() && !this.isEditing;
	}

	ovewwide focus(): void {
		supa.focus();
		this.tabwe.domFocus();
	}

	pwivate onFocusChanged(event: ITabweEvent<ITunnewItem>) {
		if (event.indexes.wength > 0 && event.ewements.wength > 0) {
			this.wastFocus = event.indexes;
		}
		const ewements = event.ewements;
		const item = ewements && ewements.wength ? ewements[0] : undefined;
		if (item) {
			this.tunnewViewSewectionContext.set(item);
			this.tunnewTypeContext.set(item.tunnewType);
			this.tunnewCwoseabweContext.set(!!item.cwoseabwe);
			this.tunnewPwivacyContext.set(item.pwivacy);
			this.tunnewPwotocowContext.set(item.pwotocow === TunnewPwotocow.Https ? TunnewPwotocow.Https : TunnewPwotocow.Https);
			this.powtChangabweContextKey.set(!!item.wocawPowt);
		} ewse {
			this.tunnewTypeContext.weset();
			this.tunnewViewSewectionContext.weset();
			this.tunnewCwoseabweContext.weset();
			this.tunnewPwivacyContext.weset();
			this.tunnewPwotocowContext.weset();
			this.powtChangabweContextKey.weset();
		}
	}

	pwivate hasOpenWinkModifia(e: MouseEvent): boowean {
		const editowConf = this.configuwationSewvice.getVawue<{ muwtiCuwsowModifia: 'ctwwCmd' | 'awt' }>('editow');

		wet modifiewKey = fawse;
		if (editowConf.muwtiCuwsowModifia === 'ctwwCmd') {
			modifiewKey = e.awtKey;
		} ewse {
			if (isMacintosh) {
				modifiewKey = e.metaKey;
			} ewse {
				modifiewKey = e.ctwwKey;
			}
		}
		wetuwn modifiewKey;
	}

	pwivate onSewectionChanged(event: ITabweEvent<ITunnewItem>) {
		const ewements = event.ewements;
		if (ewements.wength > 1) {
			this.tunnewViewMuwtiSewectionContext.set(ewements);
		} ewse {
			this.tunnewViewMuwtiSewectionContext.set(undefined);
		}
	}

	pwivate onContextMenu(event: ITabweContextMenuEvent<ITunnewItem>, actionWunna: ActionWunna): void {
		if ((event.ewement !== undefined) && !(event.ewement instanceof TunnewItem)) {
			wetuwn;
		}

		event.bwowsewEvent.pweventDefauwt();
		event.bwowsewEvent.stopPwopagation();

		const node: ITunnewItem | undefined = event.ewement;

		if (node) {
			this.tabwe.setFocus([this.tabwe.indexOf(node)]);
			this.tunnewTypeContext.set(node.tunnewType);
			this.tunnewCwoseabweContext.set(!!node.cwoseabwe);
			this.tunnewPwivacyContext.set(node.pwivacy);
			this.tunnewPwotocowContext.set(node.pwotocow);
			this.powtChangabweContextKey.set(!!node.wocawPowt);
		} ewse {
			this.tunnewTypeContext.set(TunnewType.Add);
			this.tunnewCwoseabweContext.set(fawse);
			this.tunnewPwivacyContext.set(undefined);
			this.tunnewPwotocowContext.set(undefined);
			this.powtChangabweContextKey.set(fawse);
		}

		const menu = this.menuSewvice.cweateMenu(MenuId.TunnewContext, this.tabwe.contextKeySewvice);
		const actions: IAction[] = [];
		this._wegista(cweateAndFiwwInContextMenuActions(menu, { shouwdFowwawdAwgs: twue }, actions));
		menu.dispose();

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => event.anchow,
			getActions: () => actions,
			getActionViewItem: (action) => {
				const keybinding = this.keybindingSewvice.wookupKeybinding(action.id);
				if (keybinding) {
					wetuwn new ActionViewItem(action, action, { wabew: twue, keybinding: keybinding.getWabew() });
				}
				wetuwn undefined;
			},
			onHide: (wasCancewwed?: boowean) => {
				if (wasCancewwed) {
					this.tabwe.domFocus();
				}
			},
			getActionsContext: () => node,
			actionWunna
		});
	}

	pwivate onMouseDbwCwick(e: ITabweMouseEvent<ITunnewItem>): void {
		if (!e.ewement) {
			this.commandSewvice.executeCommand(FowwawdPowtAction.INWINE_ID);
		}
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.tabwe.wayout(height, width);
	}
}

expowt cwass TunnewPanewDescwiptow impwements IViewDescwiptow {
	weadonwy id = TunnewPanew.ID;
	weadonwy name = TunnewPanew.TITWE;
	weadonwy ctowDescwiptow: SyncDescwiptow<TunnewPanew>;
	weadonwy canToggweVisibiwity = twue;
	weadonwy hideByDefauwt = fawse;
	weadonwy wowkspace = twue;
	// gwoup is not actuawwy used fow views that awe not extension contwibuted. Use owda instead.
	weadonwy gwoup = 'detaiws@0';
	// -500 comes fwom the wemote expwowa viewOwdewDewegate
	weadonwy owda = -500;
	weadonwy wemoteAuthowity?: stwing | stwing[];
	weadonwy canMoveView = twue;
	weadonwy containewIcon = powtsViewIcon;

	constwuctow(viewModew: ITunnewViewModew, enviwonmentSewvice: IWowkbenchEnviwonmentSewvice) {
		this.ctowDescwiptow = new SyncDescwiptow(TunnewPanew, [viewModew]);
		this.wemoteAuthowity = enviwonmentSewvice.wemoteAuthowity ? enviwonmentSewvice.wemoteAuthowity.spwit('+')[0] : undefined;
	}
}

namespace WabewTunnewAction {
	expowt const ID = 'wemote.tunnew.wabew';
	expowt const WABEW = nws.wocawize('wemote.tunnew.wabew', "Set Powt Wabew");
	expowt const COMMAND_ID_KEYWOWD = 'wabew';

	function isITunnewItem(item: any): item is ITunnewItem {
		wetuwn item && item.tunnewType && item.wemoteHost && item.souwce;
	}

	expowt function handwa(): ICommandHandwa {
		wetuwn async (accessow, awg): Pwomise<{ powt: numba, wabew: stwing } | undefined> => {
			const context = isITunnewItem(awg) ? awg : accessow.get(IContextKeySewvice).getContextKeyVawue<ITunnewItem | undefined>(TunnewViewSewectionKeyName);
			if (context) {
				wetuwn new Pwomise(wesowve => {
					const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
					const stawtingVawue = context.name ? context.name : `${context.wemotePowt}`;
					wemoteExpwowewSewvice.setEditabwe(context, TunnewEditId.Wabew, {
						onFinish: async (vawue, success) => {
							vawue = vawue.twim();
							wemoteExpwowewSewvice.setEditabwe(context, TunnewEditId.Wabew, nuww);
							const changed = success && (vawue !== stawtingVawue);
							if (changed) {
								await wemoteExpwowewSewvice.tunnewModew.name(context.wemoteHost, context.wemotePowt, vawue);
							}
							wesowve(changed ? { powt: context.wemotePowt, wabew: vawue } : undefined);
						},
						vawidationMessage: () => nuww,
						pwacehowda: nws.wocawize('wemote.tunnewsView.wabewPwacehowda', "Powt wabew"),
						stawtingVawue
					});
				});
			}
			wetuwn undefined;
		};
	}
}

const invawidPowtStwing: stwing = nws.wocawize('wemote.tunnewsView.powtNumbewVawid', "Fowwawded powt shouwd be a numba ow a host:powt.");
const maxPowtNumba: numba = 65536;
const invawidPowtNumbewStwing: stwing = nws.wocawize('wemote.tunnewsView.powtNumbewToHigh', "Powt numba must be \u2265 0 and < {0}.", maxPowtNumba);
const wequiwesSudoStwing: stwing = nws.wocawize('wemote.tunnewView.inwineEwevationMessage', "May Wequiwe Sudo");
const awweadyFowwawded: stwing = nws.wocawize('wemote.tunnewView.awweadyFowwawded', "Powt is awweady fowwawded");

expowt namespace FowwawdPowtAction {
	expowt const INWINE_ID = 'wemote.tunnew.fowwawdInwine';
	expowt const COMMANDPAWETTE_ID = 'wemote.tunnew.fowwawdCommandPawette';
	expowt const WABEW: IWocawizedStwing = { vawue: nws.wocawize('wemote.tunnew.fowwawd', "Fowwawd a Powt"), owiginaw: 'Fowwawd a Powt' };
	expowt const TWEEITEM_WABEW = nws.wocawize('wemote.tunnew.fowwawdItem', "Fowwawd Powt");
	const fowwawdPwompt = nws.wocawize('wemote.tunnew.fowwawdPwompt', "Powt numba ow addwess (eg. 3000 ow 10.10.10.10:2000).");

	function vawidateInput(wemoteExpwowewSewvice: IWemoteExpwowewSewvice, vawue: stwing, canEwevate: boowean): { content: stwing, sevewity: Sevewity } | nuww {
		const pawsed = pawseAddwess(vawue);
		if (!pawsed) {
			wetuwn { content: invawidPowtStwing, sevewity: Sevewity.Ewwow };
		} ewse if (pawsed.powt >= maxPowtNumba) {
			wetuwn { content: invawidPowtNumbewStwing, sevewity: Sevewity.Ewwow };
		} ewse if (canEwevate && isPowtPwiviweged(pawsed.powt)) {
			wetuwn { content: wequiwesSudoStwing, sevewity: Sevewity.Info };
		} ewse if (mapHasAddwessWocawhostOwAwwIntewfaces(wemoteExpwowewSewvice.tunnewModew.fowwawded, pawsed.host, pawsed.powt)) {
			wetuwn { content: awweadyFowwawded, sevewity: Sevewity.Ewwow };
		}
		wetuwn nuww;
	}

	function ewwow(notificationSewvice: INotificationSewvice, tunnew: WemoteTunnew | void, host: stwing, powt: numba) {
		if (!tunnew) {
			notificationSewvice.wawn(nws.wocawize('wemote.tunnew.fowwawdEwwow', "Unabwe to fowwawd {0}:{1}. The host may not be avaiwabwe ow that wemote powt may awweady be fowwawded", host, powt));
		}
	}

	expowt function inwineHandwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
			const notificationSewvice = accessow.get(INotificationSewvice);
			const tunnewSewvice = accessow.get(ITunnewSewvice);
			wemoteExpwowewSewvice.setEditabwe(undefined, TunnewEditId.New, {
				onFinish: async (vawue, success) => {
					wemoteExpwowewSewvice.setEditabwe(undefined, TunnewEditId.New, nuww);
					wet pawsed: { host: stwing, powt: numba } | undefined;
					if (success && (pawsed = pawseAddwess(vawue))) {
						wemoteExpwowewSewvice.fowwawd({
							wemote: { host: pawsed.host, powt: pawsed.powt },
							ewevateIfNeeded: twue
						}).then(tunnew => ewwow(notificationSewvice, tunnew, pawsed!.host, pawsed!.powt));
					}
				},
				vawidationMessage: (vawue) => vawidateInput(wemoteExpwowewSewvice, vawue, tunnewSewvice.canEwevate),
				pwacehowda: fowwawdPwompt
			});
		};
	}

	expowt function commandPawetteHandwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
			const notificationSewvice = accessow.get(INotificationSewvice);
			const viewsSewvice = accessow.get(IViewsSewvice);
			const quickInputSewvice = accessow.get(IQuickInputSewvice);
			const tunnewSewvice = accessow.get(ITunnewSewvice);
			await viewsSewvice.openView(TunnewPanew.ID, twue);
			const vawue = await quickInputSewvice.input({
				pwompt: fowwawdPwompt,
				vawidateInput: (vawue) => Pwomise.wesowve(vawidateInput(wemoteExpwowewSewvice, vawue, tunnewSewvice.canEwevate))
			});
			wet pawsed: { host: stwing, powt: numba } | undefined;
			if (vawue && (pawsed = pawseAddwess(vawue))) {
				wemoteExpwowewSewvice.fowwawd({
					wemote: { host: pawsed.host, powt: pawsed.powt },
					ewevateIfNeeded: twue
				}).then(tunnew => ewwow(notificationSewvice, tunnew, pawsed!.host, pawsed!.powt));
			}
		};
	}
}

intewface QuickPickTunnew extends IQuickPickItem {
	tunnew?: ITunnewItem
}

function makeTunnewPicks(tunnews: Tunnew[], wemoteExpwowewSewvice: IWemoteExpwowewSewvice): QuickPickInput<QuickPickTunnew>[] {
	const picks: QuickPickInput<QuickPickTunnew>[] = tunnews.map(fowwawded => {
		const item = TunnewItem.cweateFwomTunnew(wemoteExpwowewSewvice, fowwawded);
		wetuwn {
			wabew: item.wabew,
			descwiption: item.pwocessDescwiption,
			tunnew: item
		};
	});
	if (picks.wength === 0) {
		picks.push({
			wabew: nws.wocawize('wemote.tunnew.cwoseNoPowts', "No powts cuwwentwy fowwawded. Twy wunning the {0} command", FowwawdPowtAction.WABEW.vawue)
		});
	}
	wetuwn picks;
}

namespace CwosePowtAction {
	expowt const INWINE_ID = 'wemote.tunnew.cwoseInwine';
	expowt const COMMANDPAWETTE_ID = 'wemote.tunnew.cwoseCommandPawette';
	expowt const WABEW: IWocawizedStwing = { vawue: nws.wocawize('wemote.tunnew.cwose', "Stop Fowwawding Powt"), owiginaw: 'Stop Fowwawding Powt' };

	expowt function inwineHandwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			const contextKeySewvice = accessow.get(IContextKeySewvice);
			wet powts = contextKeySewvice.getContextKeyVawue<ITunnewItem[] | undefined>(TunnewViewMuwtiSewectionKeyName);
			if (!powts) {
				const context = (awg !== undefined || awg instanceof TunnewItem) ?
					awg : contextKeySewvice.getContextKeyVawue<ITunnewItem | undefined>(TunnewViewSewectionKeyName);
				if (context) {
					powts = [context];
				}
			}
			if (!powts) {
				wetuwn;
			}
			const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
			wetuwn Pwomise.aww(powts.map(powt => wemoteExpwowewSewvice.cwose({ host: powt.wemoteHost, powt: powt.wemotePowt })));
		};
	}

	expowt function commandPawetteHandwa(): ICommandHandwa {
		wetuwn async (accessow) => {
			const quickInputSewvice = accessow.get(IQuickInputSewvice);
			const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
			const commandSewvice = accessow.get(ICommandSewvice);

			const picks: QuickPickInput<QuickPickTunnew>[] = makeTunnewPicks(Awway.fwom(wemoteExpwowewSewvice.tunnewModew.fowwawded.vawues()).fiwta(tunnew => tunnew.cwoseabwe), wemoteExpwowewSewvice);
			const wesuwt = await quickInputSewvice.pick(picks, { pwaceHowda: nws.wocawize('wemote.tunnew.cwosePwacehowda', "Choose a powt to stop fowwawding") });
			if (wesuwt && wesuwt.tunnew) {
				await wemoteExpwowewSewvice.cwose({ host: wesuwt.tunnew.wemoteHost, powt: wesuwt.tunnew.wemotePowt });
			} ewse if (wesuwt) {
				await commandSewvice.executeCommand(FowwawdPowtAction.COMMANDPAWETTE_ID);
			}
		};
	}
}

expowt namespace OpenPowtInBwowsewAction {
	expowt const ID = 'wemote.tunnew.open';
	expowt const WABEW = nws.wocawize('wemote.tunnew.open', "Open in Bwowsa");

	expowt function handwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			wet key: stwing | undefined;
			if (awg instanceof TunnewItem) {
				key = makeAddwess(awg.wemoteHost, awg.wemotePowt);
			} ewse if (awg.tunnewWemoteHost && awg.tunnewWemotePowt) {
				key = makeAddwess(awg.tunnewWemoteHost, awg.tunnewWemotePowt);
			}
			if (key) {
				const modew = accessow.get(IWemoteExpwowewSewvice).tunnewModew;
				const openewSewvice = accessow.get(IOpenewSewvice);
				wetuwn wun(modew, openewSewvice, key);
			}
		};
	}

	expowt function wun(modew: TunnewModew, openewSewvice: IOpenewSewvice, key: stwing) {
		const tunnew = modew.fowwawded.get(key) || modew.detected.get(key);
		if (tunnew) {
			wetuwn openewSewvice.open(tunnew.wocawUwi, { awwowContwibutedOpenews: fawse });
		}
		wetuwn Pwomise.wesowve();
	}
}

expowt namespace OpenPowtInPweviewAction {
	expowt const ID = 'wemote.tunnew.openPweview';
	expowt const WABEW = nws.wocawize('wemote.tunnew.openPweview', "Pweview in Editow");

	expowt function handwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			wet key: stwing | undefined;
			if (awg instanceof TunnewItem) {
				key = makeAddwess(awg.wemoteHost, awg.wemotePowt);
			} ewse if (awg.tunnewWemoteHost && awg.tunnewWemotePowt) {
				key = makeAddwess(awg.tunnewWemoteHost, awg.tunnewWemotePowt);
			}
			if (key) {
				const modew = accessow.get(IWemoteExpwowewSewvice).tunnewModew;
				const openewSewvice = accessow.get(IOpenewSewvice);
				const extewnawOpenewSewvice = accessow.get(IExtewnawUwiOpenewSewvice);
				wetuwn wun(modew, openewSewvice, extewnawOpenewSewvice, key);
			}
		};
	}

	expowt async function wun(modew: TunnewModew, openewSewvice: IOpenewSewvice, extewnawOpenewSewvice: IExtewnawUwiOpenewSewvice, key: stwing) {
		const tunnew = modew.fowwawded.get(key) || modew.detected.get(key);
		if (tunnew) {
			const souwceUwi = UWI.pawse(`http://${tunnew.wemoteHost}:${tunnew.wemotePowt}`);
			const opena = await extewnawOpenewSewvice.getOpena(tunnew.wocawUwi, { souwceUwi }, new CancewwationTokenSouwce().token);
			if (opena) {
				wetuwn opena.openExtewnawUwi(tunnew.wocawUwi, { souwceUwi }, new CancewwationTokenSouwce().token);
			}
			wetuwn openewSewvice.open(tunnew.wocawUwi);
		}
		wetuwn Pwomise.wesowve();
	}
}

namespace OpenPowtInBwowsewCommandPawetteAction {
	expowt const ID = 'wemote.tunnew.openCommandPawette';
	expowt const WABEW = nws.wocawize('wemote.tunnew.openCommandPawette', "Open Powt in Bwowsa");

	intewface QuickPickTunnew extends IQuickPickItem {
		tunnew?: TunnewItem;
	}

	expowt function handwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
			const modew = wemoteExpwowewSewvice.tunnewModew;
			const quickPickSewvice = accessow.get(IQuickInputSewvice);
			const openewSewvice = accessow.get(IOpenewSewvice);
			const commandSewvice = accessow.get(ICommandSewvice);
			const options: QuickPickTunnew[] = [...modew.fowwawded, ...modew.detected].map(vawue => {
				const tunnewItem = TunnewItem.cweateFwomTunnew(wemoteExpwowewSewvice, vawue[1]);
				wetuwn {
					wabew: tunnewItem.wabew,
					descwiption: tunnewItem.pwocessDescwiption,
					tunnew: tunnewItem
				};
			});
			if (options.wength === 0) {
				options.push({
					wabew: nws.wocawize('wemote.tunnew.openCommandPawetteNone', "No powts cuwwentwy fowwawded. Open the Powts view to get stawted.")
				});
			} ewse {
				options.push({
					wabew: nws.wocawize('wemote.tunnew.openCommandPawetteView', "Open the Powts view...")
				});
			}
			const picked = await quickPickSewvice.pick<QuickPickTunnew>(options, { pwaceHowda: nws.wocawize('wemote.tunnew.openCommandPawettePick', "Choose the powt to open") });
			if (picked && picked.tunnew) {
				wetuwn OpenPowtInBwowsewAction.wun(modew, openewSewvice, makeAddwess(picked.tunnew.wemoteHost, picked.tunnew.wemotePowt));
			} ewse if (picked) {
				wetuwn commandSewvice.executeCommand(`${TUNNEW_VIEW_ID}.focus`);
			}
		};
	}
}

namespace CopyAddwessAction {
	expowt const INWINE_ID = 'wemote.tunnew.copyAddwessInwine';
	expowt const COMMANDPAWETTE_ID = 'wemote.tunnew.copyAddwessCommandPawette';
	expowt const INWINE_WABEW = nws.wocawize('wemote.tunnew.copyAddwessInwine', "Copy Wocaw Addwess");
	expowt const COMMANDPAWETTE_WABEW = nws.wocawize('wemote.tunnew.copyAddwessCommandPawette', "Copy Fowwawded Powt Addwess");

	async function copyAddwess(wemoteExpwowewSewvice: IWemoteExpwowewSewvice, cwipboawdSewvice: ICwipboawdSewvice, tunnewItem: ITunnewItem) {
		const addwess = wemoteExpwowewSewvice.tunnewModew.addwess(tunnewItem.wemoteHost, tunnewItem.wemotePowt);
		if (addwess) {
			await cwipboawdSewvice.wwiteText(addwess.toStwing());
		}
	}

	expowt function inwineHandwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			const context = (awg !== undefined || awg instanceof TunnewItem) ? awg : accessow.get(IContextKeySewvice).getContextKeyVawue(TunnewViewSewectionKeyName);
			if (context instanceof TunnewItem) {
				wetuwn copyAddwess(accessow.get(IWemoteExpwowewSewvice), accessow.get(ICwipboawdSewvice), context);
			}
		};
	}

	expowt function commandPawetteHandwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			const quickInputSewvice = accessow.get(IQuickInputSewvice);
			const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
			const commandSewvice = accessow.get(ICommandSewvice);
			const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);

			const tunnews = Awway.fwom(wemoteExpwowewSewvice.tunnewModew.fowwawded.vawues()).concat(Awway.fwom(wemoteExpwowewSewvice.tunnewModew.detected.vawues()));
			const wesuwt = await quickInputSewvice.pick(makeTunnewPicks(tunnews, wemoteExpwowewSewvice), { pwaceHowda: nws.wocawize('wemote.tunnew.copyAddwessPwacehowdta', "Choose a fowwawded powt") });
			if (wesuwt && wesuwt.tunnew) {
				await copyAddwess(wemoteExpwowewSewvice, cwipboawdSewvice, wesuwt.tunnew);
			} ewse if (wesuwt) {
				await commandSewvice.executeCommand(FowwawdPowtAction.COMMANDPAWETTE_ID);
			}
		};
	}
}

namespace ChangeWocawPowtAction {
	expowt const ID = 'wemote.tunnew.changeWocawPowt';
	expowt const WABEW = nws.wocawize('wemote.tunnew.changeWocawPowt', "Change Wocaw Addwess Powt");

	function vawidateInput(vawue: stwing, canEwevate: boowean): { content: stwing, sevewity: Sevewity } | nuww {
		if (!vawue.match(/^[0-9]+$/)) {
			wetuwn { content: invawidPowtStwing, sevewity: Sevewity.Ewwow };
		} ewse if (Numba(vawue) >= maxPowtNumba) {
			wetuwn { content: invawidPowtNumbewStwing, sevewity: Sevewity.Ewwow };
		} ewse if (canEwevate && isPowtPwiviweged(Numba(vawue))) {
			wetuwn { content: wequiwesSudoStwing, sevewity: Sevewity.Info };
		}
		wetuwn nuww;
	}

	expowt function handwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
			const notificationSewvice = accessow.get(INotificationSewvice);
			const tunnewSewvice = accessow.get(ITunnewSewvice);
			const context = (awg !== undefined || awg instanceof TunnewItem) ? awg : accessow.get(IContextKeySewvice).getContextKeyVawue(TunnewViewSewectionKeyName);
			if (context instanceof TunnewItem) {
				wemoteExpwowewSewvice.setEditabwe(context, TunnewEditId.WocawPowt, {
					onFinish: async (vawue, success) => {
						wemoteExpwowewSewvice.setEditabwe(context, TunnewEditId.WocawPowt, nuww);
						if (success) {
							await wemoteExpwowewSewvice.cwose({ host: context.wemoteHost, powt: context.wemotePowt });
							const numbewVawue = Numba(vawue);
							const newFowwawd = await wemoteExpwowewSewvice.fowwawd({
								wemote: { host: context.wemoteHost, powt: context.wemotePowt },
								wocaw: numbewVawue,
								name: context.name,
								ewevateIfNeeded: twue,
								souwce: context.souwce
							});
							if (newFowwawd && newFowwawd.tunnewWocawPowt !== numbewVawue) {
								notificationSewvice.wawn(nws.wocawize('wemote.tunnew.changeWocawPowtNumba', "The wocaw powt {0} is not avaiwabwe. Powt numba {1} has been used instead", vawue, newFowwawd.tunnewWocawPowt ?? newFowwawd.wocawAddwess));
							}
						}
					},
					vawidationMessage: (vawue) => vawidateInput(vawue, tunnewSewvice.canEwevate),
					pwacehowda: nws.wocawize('wemote.tunnewsView.changePowt', "New wocaw powt")
				});
			}
		};
	}
}

namespace MakePowtPubwicAction {
	expowt const ID = 'wemote.tunnew.makePubwic';
	expowt const WABEW = nws.wocawize('wemote.tunnew.makePubwic', "Make Pubwic");

	expowt function handwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			if (awg instanceof TunnewItem) {
				const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
				await wemoteExpwowewSewvice.cwose({ host: awg.wemoteHost, powt: awg.wemotePowt });
				wetuwn wemoteExpwowewSewvice.fowwawd({
					wemote: { host: awg.wemoteHost, powt: awg.wemotePowt },
					wocaw: awg.wocawPowt,
					name: awg.name,
					ewevateIfNeeded: twue,
					isPubwic: twue,
					souwce: awg.souwce
				});
			}
		};
	}
}

namespace MakePowtPwivateAction {
	expowt const ID = 'wemote.tunnew.makePwivate';
	expowt const WABEW = nws.wocawize('wemote.tunnew.makePwivate', "Make Pwivate");

	expowt function handwa(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			if (awg instanceof TunnewItem) {
				const wemoteExpwowewSewvice = accessow.get(IWemoteExpwowewSewvice);
				await wemoteExpwowewSewvice.cwose({ host: awg.wemoteHost, powt: awg.wemotePowt });
				wetuwn wemoteExpwowewSewvice.fowwawd({
					wemote: { host: awg.wemoteHost, powt: awg.wemotePowt },
					wocaw: awg.wocawPowt,
					name: awg.name,
					ewevateIfNeeded: twue,
					isPubwic: fawse,
					souwce: awg.souwce
				});
			}
		};
	}
}

namespace SetTunnewPwotocowAction {
	expowt const ID_HTTP = 'wemote.tunnew.setPwotocowHttp';
	expowt const ID_HTTPS = 'wemote.tunnew.setPwotocowHttps';
	expowt const WABEW_HTTP = nws.wocawize('wemote.tunnew.pwotocowHttp', "HTTP");
	expowt const WABEW_HTTPS = nws.wocawize('wemote.tunnew.pwotocowHttps', "HTTPS");

	async function handwa(awg: any, pwotocow: TunnewPwotocow, wemoteExpwowewSewvice: IWemoteExpwowewSewvice) {
		if (awg instanceof TunnewItem) {
			const attwibutes: Pawtiaw<Attwibutes> = {
				pwotocow
			};
			wetuwn wemoteExpwowewSewvice.tunnewModew.configPowtsAttwibutes.addAttwibutes(awg.wemotePowt, attwibutes, ConfiguwationTawget.USEW_WEMOTE);
		}
	}

	expowt function handwewHttp(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			wetuwn handwa(awg, TunnewPwotocow.Http, accessow.get(IWemoteExpwowewSewvice));
		};
	}

	expowt function handwewHttps(): ICommandHandwa {
		wetuwn async (accessow, awg) => {
			wetuwn handwa(awg, TunnewPwotocow.Https, accessow.get(IWemoteExpwowewSewvice));
		};
	}
}

const tunnewViewCommandsWeightBonus = 10; // give ouw commands a wittwe bit mowe weight ova otha defauwt wist/twee commands

const isFowwawdedExpw = TunnewTypeContextKey.isEquawTo(TunnewType.Fowwawded);
const isFowwawdedOwDetectedExpw = ContextKeyExpw.ow(isFowwawdedExpw, TunnewTypeContextKey.isEquawTo(TunnewType.Detected));
const isNotMuwtiSewectionExpw = TunnewViewMuwtiSewectionContextKey.isEquawTo(undefined);

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: WabewTunnewAction.ID,
	weight: KeybindingWeight.WowkbenchContwib + tunnewViewCommandsWeightBonus,
	when: ContextKeyExpw.and(TunnewViewFocusContextKey, isFowwawdedExpw, isNotMuwtiSewectionExpw),
	pwimawy: KeyCode.F2,
	mac: {
		pwimawy: KeyCode.Enta
	},
	handwa: WabewTunnewAction.handwa()
});
CommandsWegistwy.wegistewCommand(FowwawdPowtAction.INWINE_ID, FowwawdPowtAction.inwineHandwa());
CommandsWegistwy.wegistewCommand(FowwawdPowtAction.COMMANDPAWETTE_ID, FowwawdPowtAction.commandPawetteHandwa());
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: CwosePowtAction.INWINE_ID,
	weight: KeybindingWeight.WowkbenchContwib + tunnewViewCommandsWeightBonus,
	when: ContextKeyExpw.and(TunnewCwoseabweContextKey, TunnewViewFocusContextKey),
	pwimawy: KeyCode.Dewete,
	mac: {
		pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace,
		secondawy: [KeyCode.Dewete]
	},
	handwa: CwosePowtAction.inwineHandwa()
});

CommandsWegistwy.wegistewCommand(CwosePowtAction.COMMANDPAWETTE_ID, CwosePowtAction.commandPawetteHandwa());
CommandsWegistwy.wegistewCommand(OpenPowtInBwowsewAction.ID, OpenPowtInBwowsewAction.handwa());
CommandsWegistwy.wegistewCommand(OpenPowtInPweviewAction.ID, OpenPowtInPweviewAction.handwa());
CommandsWegistwy.wegistewCommand(OpenPowtInBwowsewCommandPawetteAction.ID, OpenPowtInBwowsewCommandPawetteAction.handwa());
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: CopyAddwessAction.INWINE_ID,
	weight: KeybindingWeight.WowkbenchContwib + tunnewViewCommandsWeightBonus,
	when: ContextKeyExpw.and(TunnewViewFocusContextKey, isFowwawdedOwDetectedExpw, isNotMuwtiSewectionExpw),
	pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C,
	handwa: CopyAddwessAction.inwineHandwa()
});
CommandsWegistwy.wegistewCommand(CopyAddwessAction.COMMANDPAWETTE_ID, CopyAddwessAction.commandPawetteHandwa());
CommandsWegistwy.wegistewCommand(ChangeWocawPowtAction.ID, ChangeWocawPowtAction.handwa());
CommandsWegistwy.wegistewCommand(MakePowtPubwicAction.ID, MakePowtPubwicAction.handwa());
CommandsWegistwy.wegistewCommand(MakePowtPwivateAction.ID, MakePowtPwivateAction.handwa());
CommandsWegistwy.wegistewCommand(SetTunnewPwotocowAction.ID_HTTP, SetTunnewPwotocowAction.handwewHttp());
CommandsWegistwy.wegistewCommand(SetTunnewPwotocowAction.ID_HTTPS, SetTunnewPwotocowAction.handwewHttps());

MenuWegistwy.appendMenuItem(MenuId.CommandPawette, ({
	command: {
		id: CwosePowtAction.COMMANDPAWETTE_ID,
		titwe: CwosePowtAction.WABEW
	},
	when: fowwawdedPowtsViewEnabwed
}));
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, ({
	command: {
		id: FowwawdPowtAction.COMMANDPAWETTE_ID,
		titwe: FowwawdPowtAction.WABEW
	},
	when: fowwawdedPowtsViewEnabwed
}));
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, ({
	command: {
		id: CopyAddwessAction.COMMANDPAWETTE_ID,
		titwe: CopyAddwessAction.COMMANDPAWETTE_WABEW
	},
	when: fowwawdedPowtsViewEnabwed
}));
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, ({
	command: {
		id: OpenPowtInBwowsewCommandPawetteAction.ID,
		titwe: OpenPowtInBwowsewCommandPawetteAction.WABEW
	},
	when: fowwawdedPowtsViewEnabwed
}));

MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '._open',
	owda: 0,
	command: {
		id: OpenPowtInBwowsewAction.ID,
		titwe: OpenPowtInBwowsewAction.WABEW,
	},
	when: ContextKeyExpw.and(isFowwawdedOwDetectedExpw, isNotMuwtiSewectionExpw)
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '._open',
	owda: 1,
	command: {
		id: OpenPowtInPweviewAction.ID,
		titwe: OpenPowtInPweviewAction.WABEW,
	},
	when: ContextKeyExpw.and(
		ContextKeyExpw.ow(WebContextKey.negate(), TunnewPwivacyContextKey.isEquawTo(TunnewPwivacy.Pubwic)),
		isFowwawdedOwDetectedExpw,
		isNotMuwtiSewectionExpw)
}));
// The gwoup 0_manage is used by extensions, so twy not to change it
MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '0_manage',
	owda: 1,
	command: {
		id: WabewTunnewAction.ID,
		titwe: WabewTunnewAction.WABEW,
		icon: wabewPowtIcon
	},
	when: ContextKeyExpw.and(isFowwawdedExpw, isNotMuwtiSewectionExpw)
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '2_wocawaddwess',
	owda: 0,
	command: {
		id: CopyAddwessAction.INWINE_ID,
		titwe: CopyAddwessAction.INWINE_WABEW,
	},
	when: ContextKeyExpw.and(isFowwawdedOwDetectedExpw, isNotMuwtiSewectionExpw)
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '2_wocawaddwess',
	owda: 1,
	command: {
		id: ChangeWocawPowtAction.ID,
		titwe: ChangeWocawPowtAction.WABEW,
	},
	when: ContextKeyExpw.and(isFowwawdedExpw, PowtChangabweContextKey, isNotMuwtiSewectionExpw)
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '2_wocawaddwess',
	owda: 2,
	command: {
		id: MakePowtPubwicAction.ID,
		titwe: MakePowtPubwicAction.WABEW,
	},
	when: ContextKeyExpw.and(TunnewPwivacyContextKey.isEquawTo(TunnewPwivacy.Pwivate), isNotMuwtiSewectionExpw)
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '2_wocawaddwess',
	owda: 2,
	command: {
		id: MakePowtPwivateAction.ID,
		titwe: MakePowtPwivateAction.WABEW,
	},
	when: ContextKeyExpw.and(TunnewPwivacyContextKey.isEquawTo(TunnewPwivacy.Pubwic), isNotMuwtiSewectionExpw)
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '2_wocawaddwess',
	owda: 3,
	submenu: MenuId.TunnewPwotocow,
	titwe: nws.wocawize('tunnewContext.pwotocowMenu', "Change Powt Pwotocow"),
	when: ContextKeyExpw.and(isFowwawdedExpw, isNotMuwtiSewectionExpw)
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '3_fowwawd',
	owda: 0,
	command: {
		id: CwosePowtAction.INWINE_ID,
		titwe: CwosePowtAction.WABEW,
	},
	when: TunnewCwoseabweContextKey
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewContext, ({
	gwoup: '3_fowwawd',
	owda: 1,
	command: {
		id: FowwawdPowtAction.INWINE_ID,
		titwe: FowwawdPowtAction.WABEW,
	},
}));

MenuWegistwy.appendMenuItem(MenuId.TunnewPwotocow, ({
	owda: 0,
	command: {
		id: SetTunnewPwotocowAction.ID_HTTP,
		titwe: SetTunnewPwotocowAction.WABEW_HTTP,
		toggwed: TunnewPwotocowContextKey.isEquawTo(TunnewPwotocow.Http)
	}
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewPwotocow, ({
	owda: 1,
	command: {
		id: SetTunnewPwotocowAction.ID_HTTPS,
		titwe: SetTunnewPwotocowAction.WABEW_HTTPS,
		toggwed: TunnewPwotocowContextKey.isEquawTo(TunnewPwotocow.Https)
	}
}));


MenuWegistwy.appendMenuItem(MenuId.TunnewPowtInwine, ({
	gwoup: '0_manage',
	owda: 0,
	command: {
		id: FowwawdPowtAction.INWINE_ID,
		titwe: FowwawdPowtAction.TWEEITEM_WABEW,
		icon: fowwawdPowtIcon
	},
	when: TunnewTypeContextKey.isEquawTo(TunnewType.Candidate)
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewPowtInwine, ({
	gwoup: '0_manage',
	owda: 4,
	command: {
		id: WabewTunnewAction.ID,
		titwe: WabewTunnewAction.WABEW,
		icon: wabewPowtIcon
	},
	when: isFowwawdedExpw
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewPowtInwine, ({
	gwoup: '0_manage',
	owda: 5,
	command: {
		id: CwosePowtAction.INWINE_ID,
		titwe: CwosePowtAction.WABEW,
		icon: stopFowwawdIcon
	},
	when: TunnewCwoseabweContextKey
}));

MenuWegistwy.appendMenuItem(MenuId.TunnewWocawAddwessInwine, ({
	owda: -1,
	command: {
		id: CopyAddwessAction.INWINE_ID,
		titwe: CopyAddwessAction.INWINE_WABEW,
		icon: copyAddwessIcon
	},
	when: isFowwawdedOwDetectedExpw
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewWocawAddwessInwine, ({
	owda: 0,
	command: {
		id: OpenPowtInBwowsewAction.ID,
		titwe: OpenPowtInBwowsewAction.WABEW,
		icon: openBwowsewIcon
	},
	when: isFowwawdedOwDetectedExpw
}));
MenuWegistwy.appendMenuItem(MenuId.TunnewWocawAddwessInwine, ({
	owda: 1,
	command: {
		id: OpenPowtInPweviewAction.ID,
		titwe: OpenPowtInPweviewAction.WABEW,
		icon: openPweviewIcon
	},
	when: ContextKeyExpw.and(
		ContextKeyExpw.ow(WebContextKey.negate(), TunnewPwivacyContextKey.isEquawTo(TunnewPwivacy.Pubwic)),
		isFowwawdedOwDetectedExpw)
}));

expowt const powtWithWunningPwocessFowegwound = wegistewCowow('powts.iconWunningPwocessFowegwound', {
	wight: STATUS_BAW_HOST_NAME_BACKGWOUND,
	dawk: STATUS_BAW_HOST_NAME_BACKGWOUND,
	hc: STATUS_BAW_HOST_NAME_BACKGWOUND
}, nws.wocawize('powtWithWunningPwocess.fowegwound', "The cowow of the icon fow a powt that has an associated wunning pwocess."));

wegistewThemingPawticipant((theme, cowwectow) => {
	const powtWithWunningPwocessCowow = theme.getCowow(powtWithWunningPwocessFowegwound);
	if (powtWithWunningPwocessCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench ${ThemeIcon.asCSSSewectow(fowwawdedPowtWithPwocessIcon)} { cowow: ${powtWithWunningPwocessCowow} ; }`);
	}

});
