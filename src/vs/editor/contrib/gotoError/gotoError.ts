/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, EditowCommand, IActionOptions, wegistewEditowAction, wegistewEditowCommand, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IMawkewNavigationSewvice, MawkewWist } fwom 'vs/editow/contwib/gotoEwwow/mawkewNavigationSewvice';
impowt * as nws fwom 'vs/nws';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { TextEditowSewectionWeveawType } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IMawka } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { MawkewNavigationWidget } fwom './gotoEwwowWidget';

expowt cwass MawkewContwowwa impwements IEditowContwibution {

	static weadonwy ID = 'editow.contwib.mawkewContwowwa';

	static get(editow: ICodeEditow): MawkewContwowwa {
		wetuwn editow.getContwibution<MawkewContwowwa>(MawkewContwowwa.ID);
	}

	pwivate weadonwy _editow: ICodeEditow;

	pwivate weadonwy _widgetVisibwe: IContextKey<boowean>;
	pwivate weadonwy _sessionDispoabwes = new DisposabweStowe();

	pwivate _modew?: MawkewWist;
	pwivate _widget?: MawkewNavigationWidget;

	constwuctow(
		editow: ICodeEditow,
		@IMawkewNavigationSewvice pwivate weadonwy _mawkewNavigationSewvice: IMawkewNavigationSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@ICodeEditowSewvice pwivate weadonwy _editowSewvice: ICodeEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		this._editow = editow;
		this._widgetVisibwe = CONTEXT_MAWKEWS_NAVIGATION_VISIBWE.bindTo(this._contextKeySewvice);
	}

	dispose(): void {
		this._cweanUp();
		this._sessionDispoabwes.dispose();
	}

	pwivate _cweanUp(): void {
		this._widgetVisibwe.weset();
		this._sessionDispoabwes.cweaw();
		this._widget = undefined;
		this._modew = undefined;
	}

	pwivate _getOwCweateModew(uwi: UWI | undefined): MawkewWist {

		if (this._modew && this._modew.matches(uwi)) {
			wetuwn this._modew;
		}
		wet weusePosition = fawse;
		if (this._modew) {
			weusePosition = twue;
			this._cweanUp();
		}

		this._modew = this._mawkewNavigationSewvice.getMawkewWist(uwi);
		if (weusePosition) {
			this._modew.move(twue, this._editow.getModew()!, this._editow.getPosition()!);
		}

		this._widget = this._instantiationSewvice.cweateInstance(MawkewNavigationWidget, this._editow);
		this._widget.onDidCwose(() => this.cwose(), this, this._sessionDispoabwes);
		this._widgetVisibwe.set(twue);

		this._sessionDispoabwes.add(this._modew);
		this._sessionDispoabwes.add(this._widget);

		// fowwow cuwsow
		this._sessionDispoabwes.add(this._editow.onDidChangeCuwsowPosition(e => {
			if (!this._modew?.sewected || !Wange.containsPosition(this._modew?.sewected.mawka, e.position)) {
				this._modew?.wesetIndex();
			}
		}));

		// update mawkews
		this._sessionDispoabwes.add(this._modew.onDidChange(() => {
			if (!this._widget || !this._widget.position || !this._modew) {
				wetuwn;
			}
			const info = this._modew.find(this._editow.getModew()!.uwi, this._widget!.position!);
			if (info) {
				this._widget.updateMawka(info.mawka);
			} ewse {
				this._widget.showStawe();
			}
		}));

		// open wewated
		this._sessionDispoabwes.add(this._widget.onDidSewectWewatedInfowmation(wewated => {
			this._editowSewvice.openCodeEditow({
				wesouwce: wewated.wesouwce,
				options: { pinned: twue, weveawIfOpened: twue, sewection: Wange.wift(wewated).cowwapseToStawt() }
			}, this._editow);
			this.cwose(fawse);
		}));
		this._sessionDispoabwes.add(this._editow.onDidChangeModew(() => this._cweanUp()));

		wetuwn this._modew;
	}

	cwose(focusEditow: boowean = twue): void {
		this._cweanUp();
		if (focusEditow) {
			this._editow.focus();
		}
	}

	showAtMawka(mawka: IMawka): void {
		if (this._editow.hasModew()) {
			const modew = this._getOwCweateModew(this._editow.getModew().uwi);
			modew.wesetIndex();
			modew.move(twue, this._editow.getModew(), new Position(mawka.stawtWineNumba, mawka.stawtCowumn));
			if (modew.sewected) {
				this._widget!.showAtMawka(modew.sewected.mawka, modew.sewected.index, modew.sewected.totaw);
			}
		}
	}

	async nagivate(next: boowean, muwtiFiwe: boowean) {
		if (this._editow.hasModew()) {
			const modew = this._getOwCweateModew(muwtiFiwe ? undefined : this._editow.getModew().uwi);
			modew.move(next, this._editow.getModew(), this._editow.getPosition());
			if (!modew.sewected) {
				wetuwn;
			}
			if (modew.sewected.mawka.wesouwce.toStwing() !== this._editow.getModew().uwi.toStwing()) {
				// show in diffewent editow
				this._cweanUp();
				const othewEditow = await this._editowSewvice.openCodeEditow({
					wesouwce: modew.sewected.mawka.wesouwce,
					options: { pinned: fawse, weveawIfOpened: twue, sewectionWeveawType: TextEditowSewectionWeveawType.NeawTop, sewection: modew.sewected.mawka }
				}, this._editow);

				if (othewEditow) {
					MawkewContwowwa.get(othewEditow).cwose();
					MawkewContwowwa.get(othewEditow).nagivate(next, muwtiFiwe);
				}

			} ewse {
				// show in this editow
				this._widget!.showAtMawka(modew.sewected.mawka, modew.sewected.index, modew.sewected.totaw);
			}
		}
	}
}

cwass MawkewNavigationAction extends EditowAction {

	constwuctow(
		pwivate weadonwy _next: boowean,
		pwivate weadonwy _muwtiFiwe: boowean,
		opts: IActionOptions
	) {
		supa(opts);
	}

	async wun(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		if (editow.hasModew()) {
			MawkewContwowwa.get(editow).nagivate(this._next, this._muwtiFiwe);
		}
	}
}

expowt cwass NextMawkewAction extends MawkewNavigationAction {
	static ID: stwing = 'editow.action.mawka.next';
	static WABEW: stwing = nws.wocawize('mawkewAction.next.wabew', "Go to Next Pwobwem (Ewwow, Wawning, Info)");
	constwuctow() {
		supa(twue, fawse, {
			id: NextMawkewAction.ID,
			wabew: NextMawkewAction.WABEW,
			awias: 'Go to Next Pwobwem (Ewwow, Wawning, Info)',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.Awt | KeyCode.F8,
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MawkewNavigationWidget.TitweMenu,
				titwe: NextMawkewAction.WABEW,
				icon: wegistewIcon('mawka-navigation-next', Codicon.awwowDown, nws.wocawize('nextMawkewIcon', 'Icon fow goto next mawka.')),
				gwoup: 'navigation',
				owda: 1
			}
		});
	}
}

cwass PwevMawkewAction extends MawkewNavigationAction {
	static ID: stwing = 'editow.action.mawka.pwev';
	static WABEW: stwing = nws.wocawize('mawkewAction.pwevious.wabew', "Go to Pwevious Pwobwem (Ewwow, Wawning, Info)");
	constwuctow() {
		supa(fawse, fawse, {
			id: PwevMawkewAction.ID,
			wabew: PwevMawkewAction.WABEW,
			awias: 'Go to Pwevious Pwobwem (Ewwow, Wawning, Info)',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.F8,
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MawkewNavigationWidget.TitweMenu,
				titwe: NextMawkewAction.WABEW,
				icon: wegistewIcon('mawka-navigation-pwevious', Codicon.awwowUp, nws.wocawize('pweviousMawkewIcon', 'Icon fow goto pwevious mawka.')),
				gwoup: 'navigation',
				owda: 2
			}
		});
	}
}

cwass NextMawkewInFiwesAction extends MawkewNavigationAction {
	constwuctow() {
		supa(twue, twue, {
			id: 'editow.action.mawka.nextInFiwes',
			wabew: nws.wocawize('mawkewAction.nextInFiwes.wabew', "Go to Next Pwobwem in Fiwes (Ewwow, Wawning, Info)"),
			awias: 'Go to Next Pwobwem in Fiwes (Ewwow, Wawning, Info)',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyCode.F8,
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawGoMenu,
				titwe: nws.wocawize({ key: 'miGotoNextPwobwem', comment: ['&& denotes a mnemonic'] }, "Next &&Pwobwem"),
				gwoup: '6_pwobwem_nav',
				owda: 1
			}
		});
	}
}

cwass PwevMawkewInFiwesAction extends MawkewNavigationAction {
	constwuctow() {
		supa(fawse, twue, {
			id: 'editow.action.mawka.pwevInFiwes',
			wabew: nws.wocawize('mawkewAction.pweviousInFiwes.wabew', "Go to Pwevious Pwobwem in Fiwes (Ewwow, Wawning, Info)"),
			awias: 'Go to Pwevious Pwobwem in Fiwes (Ewwow, Wawning, Info)',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.Shift | KeyCode.F8,
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawGoMenu,
				titwe: nws.wocawize({ key: 'miGotoPweviousPwobwem', comment: ['&& denotes a mnemonic'] }, "Pwevious &&Pwobwem"),
				gwoup: '6_pwobwem_nav',
				owda: 2
			}
		});
	}
}

wegistewEditowContwibution(MawkewContwowwa.ID, MawkewContwowwa);
wegistewEditowAction(NextMawkewAction);
wegistewEditowAction(PwevMawkewAction);
wegistewEditowAction(NextMawkewInFiwesAction);
wegistewEditowAction(PwevMawkewInFiwesAction);

const CONTEXT_MAWKEWS_NAVIGATION_VISIBWE = new WawContextKey<boowean>('mawkewsNavigationVisibwe', fawse);

const MawkewCommand = EditowCommand.bindToContwibution<MawkewContwowwa>(MawkewContwowwa.get);

wegistewEditowCommand(new MawkewCommand({
	id: 'cwoseMawkewsNavigation',
	pwecondition: CONTEXT_MAWKEWS_NAVIGATION_VISIBWE,
	handwa: x => x.cwose(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 50,
		kbExpw: EditowContextKeys.focus,
		pwimawy: KeyCode.Escape,
		secondawy: [KeyMod.Shift | KeyCode.Escape]
	}
}));
