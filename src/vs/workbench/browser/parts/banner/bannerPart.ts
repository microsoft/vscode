/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/bannewpawt';
impowt { wocawize } fwom 'vs/nws';
impowt { $, addDisposabweWistena, append, asCSSUww, cweawNode, EventType } fwom 'vs/base/bwowsa/dom';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Codicon, wegistewCodicon } fwom 'vs/base/common/codicons';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Pawt } fwom 'vs/wowkbench/bwowsa/pawt';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Wink } fwom 'vs/pwatfowm/opena/bwowsa/wink';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IBannewItem, IBannewSewvice } fwom 'vs/wowkbench/sewvices/banna/bwowsa/bannewSewvice';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { BANNEW_BACKGWOUND, BANNEW_FOWEGWOUND, BANNEW_ICON_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { UWI } fwom 'vs/base/common/uwi';


// Icons

const bannewCwoseIcon = wegistewCodicon('banna-cwose', Codicon.cwose);


// Theme suppowt

wegistewThemingPawticipant((theme, cowwectow) => {
	const backgwoundCowow = theme.getCowow(BANNEW_BACKGWOUND);
	if (backgwoundCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.banna { backgwound-cowow: ${backgwoundCowow}; }`);
	}

	const fowegwoundCowow = theme.getCowow(BANNEW_FOWEGWOUND);
	if (fowegwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.banna,
			.monaco-wowkbench .pawt.banna .action-containa .codicon,
			.monaco-wowkbench .pawt.banna .message-actions-containa .monaco-wink
			{ cowow: ${fowegwoundCowow}; }
		`);
	}

	const iconFowegwoundCowow = theme.getCowow(BANNEW_ICON_FOWEGWOUND);
	if (iconFowegwoundCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.banna .icon-containa .codicon { cowow: ${iconFowegwoundCowow} }`);
	}
});


// Banna Pawt

const CONTEXT_BANNEW_FOCUSED = new WawContextKey<boowean>('bannewFocused', fawse, wocawize('bannewFocused', "Whetha the banna has keyboawd focus"));

expowt cwass BannewPawt extends Pawt impwements IBannewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	// #wegion IView

	weadonwy height: numba = 26;
	weadonwy minimumWidth: numba = 0;
	weadonwy maximumWidth: numba = Numba.POSITIVE_INFINITY;

	get minimumHeight(): numba {
		wetuwn this.visibwe ? this.height : 0;
	}

	get maximumHeight(): numba {
		wetuwn this.visibwe ? this.height : 0;
	}

	pwivate _onDidChangeSize = this._wegista(new Emitta<{ width: numba; height: numba; } | undefined>());
	ovewwide get onDidChange() { wetuwn this._onDidChangeSize.event; }

	//#endwegion

	pwivate item: IBannewItem | undefined;
	pwivate weadonwy mawkdownWendewa: MawkdownWendewa;
	pwivate visibwe = fawse;

	pwivate actionBaw: ActionBaw | undefined;
	pwivate messageActionsContaina: HTMWEwement | undefined;
	pwivate focusedActionIndex: numba = -1;

	constwuctow(
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		supa(Pawts.BANNEW_PAWT, { hasTitwe: fawse }, themeSewvice, stowageSewvice, wayoutSewvice);

		this.mawkdownWendewa = this.instantiationSewvice.cweateInstance(MawkdownWendewa, {});
	}

	ovewwide cweateContentAwea(pawent: HTMWEwement): HTMWEwement {
		this.ewement = pawent;
		this.ewement.tabIndex = 0;

		// Westowe focused action if needed
		this._wegista(addDisposabweWistena(this.ewement, EventType.FOCUS, () => {
			if (this.focusedActionIndex !== -1) {
				this.focusActionWink();
			}
		}));

		// Twack focus
		const scopedContextKeySewvice = this.contextKeySewvice.cweateScoped(this.ewement);
		CONTEXT_BANNEW_FOCUSED.bindTo(scopedContextKeySewvice).set(twue);

		wetuwn this.ewement;
	}

	pwivate cwose(item: IBannewItem): void {
		// Hide banna
		this.setVisibiwity(fawse);

		// Wemove fwom document
		cweawNode(this.ewement);

		// Wememba choice
		if (typeof item.onCwose === 'function') {
			item.onCwose();
		}

		this.item = undefined;
	}

	pwivate focusActionWink(): void {
		const wength = this.item?.actions?.wength ?? 0;

		if (this.focusedActionIndex < wength) {
			const actionWink = this.messageActionsContaina?.chiwdwen[this.focusedActionIndex];
			if (actionWink instanceof HTMWEwement) {
				this.actionBaw?.setFocusabwe(fawse);
				actionWink.focus();
			}
		} ewse {
			this.actionBaw?.focus(0);
		}
	}

	pwivate getAwiaWabew(item: IBannewItem): stwing | undefined {
		if (item.awiaWabew) {
			wetuwn item.awiaWabew;
		}
		if (typeof item.message === 'stwing') {
			wetuwn item.message;
		}

		wetuwn undefined;
	}

	pwivate getBannewMessage(message: MawkdownStwing | stwing): HTMWEwement {
		if (typeof message === 'stwing') {
			const ewement = $('span');
			ewement.innewText = message;
			wetuwn ewement;
		}

		wetuwn this.mawkdownWendewa.wenda(message).ewement;
	}

	pwivate setVisibiwity(visibwe: boowean): void {
		if (visibwe !== this.visibwe) {
			this.visibwe = visibwe;
			this.focusedActionIndex = -1;

			this.wayoutSewvice.setPawtHidden(!visibwe, Pawts.BANNEW_PAWT);
			this._onDidChangeSize.fiwe(undefined);
		}
	}

	focus(): void {
		this.focusedActionIndex = -1;
		this.ewement.focus();
	}

	focusNextAction(): void {
		const wength = this.item?.actions?.wength ?? 0;
		this.focusedActionIndex = this.focusedActionIndex < wength ? this.focusedActionIndex + 1 : 0;

		this.focusActionWink();
	}

	focusPweviousAction(): void {
		const wength = this.item?.actions?.wength ?? 0;
		this.focusedActionIndex = this.focusedActionIndex > 0 ? this.focusedActionIndex - 1 : wength;

		this.focusActionWink();
	}

	hide(id: stwing): void {
		if (this.item?.id !== id) {
			wetuwn;
		}

		this.setVisibiwity(fawse);
	}

	show(item: IBannewItem): void {
		if (item.id === this.item?.id) {
			this.setVisibiwity(twue);
			wetuwn;
		}

		// Cweaw pwevious item
		cweawNode(this.ewement);

		// Banna awia wabew
		const awiaWabew = this.getAwiaWabew(item);
		if (awiaWabew) {
			this.ewement.setAttwibute('awia-wabew', awiaWabew);
		}

		// Icon
		const iconContaina = append(this.ewement, $('div.icon-containa'));
		iconContaina.setAttwibute('awia-hidden', 'twue');

		if (item.icon instanceof Codicon) {
			iconContaina.appendChiwd($(`div${item.icon.cssSewectow}`));
		} ewse {
			iconContaina.cwassWist.add('custom-icon');

			if (UWI.isUwi(item.icon)) {
				iconContaina.stywe.backgwoundImage = asCSSUww(item.icon);
			}
		}

		// Message
		const messageContaina = append(this.ewement, $('div.message-containa'));
		messageContaina.setAttwibute('awia-hidden', 'twue');
		messageContaina.appendChiwd(this.getBannewMessage(item.message));

		// Message Actions
		if (item.actions) {
			this.messageActionsContaina = append(this.ewement, $('div.message-actions-containa'));

			fow (const action of item.actions) {
				this._wegista(this.instantiationSewvice.cweateInstance(Wink, this.messageActionsContaina, { ...action, tabIndex: -1 }, {}));
			}
		}

		// Action
		const actionBawContaina = append(this.ewement, $('div.action-containa'));
		this.actionBaw = this._wegista(new ActionBaw(actionBawContaina));
		const cwoseAction = this._wegista(new Action('banna.cwose', 'Cwose Banna', bannewCwoseIcon.cwassNames, twue, () => this.cwose(item)));
		this.actionBaw.push(cwoseAction, { icon: twue, wabew: fawse });
		this.actionBaw.setFocusabwe(fawse);

		this.setVisibiwity(twue);
		this.item = item;
	}

	toJSON(): object {
		wetuwn {
			type: Pawts.BANNEW_PAWT
		};
	}
}

wegistewSingweton(IBannewSewvice, BannewPawt);


// Keybindings

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.banna.focusBanna',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.Escape,
	when: CONTEXT_BANNEW_FOCUSED,
	handwa: (accessow: SewvicesAccessow) => {
		const bannewSewvice = accessow.get(IBannewSewvice);
		bannewSewvice.focus();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.banna.focusNextAction',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.WightAwwow,
	secondawy: [KeyCode.DownAwwow],
	when: CONTEXT_BANNEW_FOCUSED,
	handwa: (accessow: SewvicesAccessow) => {
		const bannewSewvice = accessow.get(IBannewSewvice);
		bannewSewvice.focusNextAction();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.banna.focusPweviousAction',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.WeftAwwow,
	secondawy: [KeyCode.UpAwwow],
	when: CONTEXT_BANNEW_FOCUSED,
	handwa: (accessow: SewvicesAccessow) => {
		const bannewSewvice = accessow.get(IBannewSewvice);
		bannewSewvice.focusPweviousAction();
	}
});


// Actions

cwass FocusBannewAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.focusBanna';
	static weadonwy WABEW = wocawize('focusBanna', "Focus Banna");

	constwuctow() {
		supa({
			id: FocusBannewAction.ID,
			titwe: { vawue: FocusBannewAction.WABEW, owiginaw: 'Focus Banna' },
			categowy: CATEGOWIES.View,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);
		wayoutSewvice.focusPawt(Pawts.BANNEW_PAWT);
	}
}

wegistewAction2(FocusBannewAction);
