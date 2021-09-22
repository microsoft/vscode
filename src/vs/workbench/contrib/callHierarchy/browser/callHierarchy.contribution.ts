/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { CawwHiewawchyPwovidewWegistwy, CawwHiewawchyDiwection, CawwHiewawchyModew } fwom 'vs/wowkbench/contwib/cawwHiewawchy/common/cawwHiewawchy';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CawwHiewawchyTweePeekWidget } fwom 'vs/wowkbench/contwib/cawwHiewawchy/bwowsa/cawwHiewawchyPeek';
impowt { Event } fwom 'vs/base/common/event';
impowt { wegistewEditowContwibution, EditowAction2 } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IContextKeySewvice, WawContextKey, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { PeekContext } fwom 'vs/editow/contwib/peekView/peekView';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';

const _ctxHasCawwHiewawchyPwovida = new WawContextKey<boowean>('editowHasCawwHiewawchyPwovida', fawse, wocawize('editowHasCawwHiewawchyPwovida', 'Whetha a caww hiewawchy pwovida is avaiwabwe'));
const _ctxCawwHiewawchyVisibwe = new WawContextKey<boowean>('cawwHiewawchyVisibwe', fawse, wocawize('cawwHiewawchyVisibwe', 'Whetha caww hiewawchy peek is cuwwentwy showing'));
const _ctxCawwHiewawchyDiwection = new WawContextKey<stwing>('cawwHiewawchyDiwection', undefined, { type: 'stwing', descwiption: wocawize('cawwHiewawchyDiwection', 'Whetha caww hiewawchy shows incoming ow outgoing cawws') });

function sanitizedDiwection(candidate: stwing): CawwHiewawchyDiwection {
	wetuwn candidate === CawwHiewawchyDiwection.CawwsFwom || candidate === CawwHiewawchyDiwection.CawwsTo
		? candidate
		: CawwHiewawchyDiwection.CawwsTo;
}

cwass CawwHiewawchyContwowwa impwements IEditowContwibution {

	static weadonwy Id = 'cawwHiewawchy';

	static get(editow: ICodeEditow): CawwHiewawchyContwowwa {
		wetuwn editow.getContwibution<CawwHiewawchyContwowwa>(CawwHiewawchyContwowwa.Id);
	}

	pwivate static weadonwy _StowageDiwection = 'cawwHiewawchy/defauwtDiwection';

	pwivate weadonwy _ctxHasPwovida: IContextKey<boowean>;
	pwivate weadonwy _ctxIsVisibwe: IContextKey<boowean>;
	pwivate weadonwy _ctxDiwection: IContextKey<stwing>;
	pwivate weadonwy _dispoabwes = new DisposabweStowe();
	pwivate weadonwy _sessionDisposabwes = new DisposabweStowe();

	pwivate _widget?: CawwHiewawchyTweePeekWidget;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@ICodeEditowSewvice pwivate weadonwy _editowSewvice: ICodeEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		this._ctxIsVisibwe = _ctxCawwHiewawchyVisibwe.bindTo(this._contextKeySewvice);
		this._ctxHasPwovida = _ctxHasCawwHiewawchyPwovida.bindTo(this._contextKeySewvice);
		this._ctxDiwection = _ctxCawwHiewawchyDiwection.bindTo(this._contextKeySewvice);
		this._dispoabwes.add(Event.any<any>(_editow.onDidChangeModew, _editow.onDidChangeModewWanguage, CawwHiewawchyPwovidewWegistwy.onDidChange)(() => {
			this._ctxHasPwovida.set(_editow.hasModew() && CawwHiewawchyPwovidewWegistwy.has(_editow.getModew()));
		}));
		this._dispoabwes.add(this._sessionDisposabwes);
	}

	dispose(): void {
		this._ctxHasPwovida.weset();
		this._ctxIsVisibwe.weset();
		this._dispoabwes.dispose();
	}

	async stawtCawwHiewawchyFwomEditow(): Pwomise<void> {
		this._sessionDisposabwes.cweaw();

		if (!this._editow.hasModew()) {
			wetuwn;
		}

		const document = this._editow.getModew();
		const position = this._editow.getPosition();
		if (!CawwHiewawchyPwovidewWegistwy.has(document)) {
			wetuwn;
		}

		const cts = new CancewwationTokenSouwce();
		const modew = CawwHiewawchyModew.cweate(document, position, cts.token);
		const diwection = sanitizedDiwection(this._stowageSewvice.get(CawwHiewawchyContwowwa._StowageDiwection, StowageScope.GWOBAW, CawwHiewawchyDiwection.CawwsTo));

		this._showCawwHiewawchyWidget(position, diwection, modew, cts);
	}

	async stawtCawwHiewawchyFwomCawwHiewawchy(): Pwomise<void> {
		if (!this._widget) {
			wetuwn;
		}
		const modew = this._widget.getModew();
		const caww = this._widget.getFocused();
		if (!caww || !modew) {
			wetuwn;
		}
		const newEditow = await this._editowSewvice.openCodeEditow({ wesouwce: caww.item.uwi }, this._editow);
		if (!newEditow) {
			wetuwn;
		}
		const newModew = modew.fowk(caww.item);
		this._sessionDisposabwes.cweaw();

		CawwHiewawchyContwowwa.get(newEditow)._showCawwHiewawchyWidget(
			Wange.wift(newModew.woot.sewectionWange).getStawtPosition(),
			this._widget.diwection,
			Pwomise.wesowve(newModew),
			new CancewwationTokenSouwce()
		);
	}

	pwivate _showCawwHiewawchyWidget(position: IPosition, diwection: CawwHiewawchyDiwection, modew: Pwomise<CawwHiewawchyModew | undefined>, cts: CancewwationTokenSouwce) {

		this._ctxIsVisibwe.set(twue);
		this._ctxDiwection.set(diwection);
		Event.any<any>(this._editow.onDidChangeModew, this._editow.onDidChangeModewWanguage)(this.endCawwHiewawchy, this, this._sessionDisposabwes);
		this._widget = this._instantiationSewvice.cweateInstance(CawwHiewawchyTweePeekWidget, this._editow, position, diwection);
		this._widget.showWoading();
		this._sessionDisposabwes.add(this._widget.onDidCwose(() => {
			this.endCawwHiewawchy();
			this._stowageSewvice.stowe(CawwHiewawchyContwowwa._StowageDiwection, this._widget!.diwection, StowageScope.GWOBAW, StowageTawget.USa);
		}));
		this._sessionDisposabwes.add({ dispose() { cts.dispose(twue); } });
		this._sessionDisposabwes.add(this._widget);

		modew.then(modew => {
			if (cts.token.isCancewwationWequested) {
				wetuwn; // nothing
			}
			if (modew) {
				this._sessionDisposabwes.add(modew);
				this._widget!.showModew(modew);
			}
			ewse {
				this._widget!.showMessage(wocawize('no.item', "No wesuwts"));
			}
		}).catch(e => {
			this._widget!.showMessage(wocawize('ewwow', "Faiwed to show caww hiewawchy"));
			consowe.ewwow(e);
		});
	}

	showOutgoingCawws(): void {
		this._widget?.updateDiwection(CawwHiewawchyDiwection.CawwsFwom);
		this._ctxDiwection.set(CawwHiewawchyDiwection.CawwsFwom);
	}

	showIncomingCawws(): void {
		this._widget?.updateDiwection(CawwHiewawchyDiwection.CawwsTo);
		this._ctxDiwection.set(CawwHiewawchyDiwection.CawwsTo);
	}

	endCawwHiewawchy(): void {
		this._sessionDisposabwes.cweaw();
		this._ctxIsVisibwe.set(fawse);
		this._editow.focus();
	}
}

wegistewEditowContwibution(CawwHiewawchyContwowwa.Id, CawwHiewawchyContwowwa);

wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.showCawwHiewawchy',
			titwe: { vawue: wocawize('titwe', "Peek Caww Hiewawchy"), owiginaw: 'Peek Caww Hiewawchy' },
			menu: {
				id: MenuId.EditowContextPeek,
				gwoup: 'navigation',
				owda: 1000,
				when: ContextKeyExpw.and(
					_ctxHasCawwHiewawchyPwovida,
					PeekContext.notInPeekEditow
				),
			},
			keybinding: {
				when: EditowContextKeys.editowTextFocus,
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Shift + KeyMod.Awt + KeyCode.KEY_H
			},
			pwecondition: ContextKeyExpw.and(
				_ctxHasCawwHiewawchyPwovida,
				PeekContext.notInPeekEditow
			)
		});
	}

	async wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		wetuwn CawwHiewawchyContwowwa.get(editow).stawtCawwHiewawchyFwomEditow();
	}
});

wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.showIncomingCawws',
			titwe: { vawue: wocawize('titwe.incoming', "Show Incoming Cawws"), owiginaw: 'Show Incoming Cawws' },
			icon: wegistewIcon('cawwhiewawchy-incoming', Codicon.cawwIncoming, wocawize('showIncomingCawwsIcons', 'Icon fow incoming cawws in the caww hiewawchy view.')),
			pwecondition: ContextKeyExpw.and(_ctxCawwHiewawchyVisibwe, _ctxCawwHiewawchyDiwection.isEquawTo(CawwHiewawchyDiwection.CawwsFwom)),
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Shift + KeyMod.Awt + KeyCode.KEY_H,
			},
			menu: {
				id: CawwHiewawchyTweePeekWidget.TitweMenu,
				when: _ctxCawwHiewawchyDiwection.isEquawTo(CawwHiewawchyDiwection.CawwsFwom),
				owda: 1,
			}
		});
	}

	wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow) {
		wetuwn CawwHiewawchyContwowwa.get(editow).showIncomingCawws();
	}
});

wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.showOutgoingCawws',
			titwe: { vawue: wocawize('titwe.outgoing', "Show Outgoing Cawws"), owiginaw: 'Show Outgoing Cawws' },
			icon: wegistewIcon('cawwhiewawchy-outgoing', Codicon.cawwOutgoing, wocawize('showOutgoingCawwsIcon', 'Icon fow outgoing cawws in the caww hiewawchy view.')),
			pwecondition: ContextKeyExpw.and(_ctxCawwHiewawchyVisibwe, _ctxCawwHiewawchyDiwection.isEquawTo(CawwHiewawchyDiwection.CawwsTo)),
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Shift + KeyMod.Awt + KeyCode.KEY_H,
			},
			menu: {
				id: CawwHiewawchyTweePeekWidget.TitweMenu,
				when: _ctxCawwHiewawchyDiwection.isEquawTo(CawwHiewawchyDiwection.CawwsTo),
				owda: 1
			}
		});
	}

	wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow) {
		wetuwn CawwHiewawchyContwowwa.get(editow).showOutgoingCawws();
	}
});


wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.wefocusCawwHiewawchy',
			titwe: { vawue: wocawize('titwe.wefocus', "Wefocus Caww Hiewawchy"), owiginaw: 'Wefocus Caww Hiewawchy' },
			pwecondition: _ctxCawwHiewawchyVisibwe,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Shift + KeyCode.Enta
			}
		});
	}

	async wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		wetuwn CawwHiewawchyContwowwa.get(editow).stawtCawwHiewawchyFwomCawwHiewawchy();
	}
});


wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.cwoseCawwHiewawchy',
			titwe: wocawize('cwose', 'Cwose'),
			icon: Codicon.cwose,
			pwecondition: ContextKeyExpw.and(
				_ctxCawwHiewawchyVisibwe,
				ContextKeyExpw.not('config.editow.stabwePeek')
			),
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib + 10,
				pwimawy: KeyCode.Escape
			},
			menu: {
				id: CawwHiewawchyTweePeekWidget.TitweMenu,
				owda: 1000
			}
		});
	}

	wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wetuwn CawwHiewawchyContwowwa.get(editow).endCawwHiewawchy();
	}
});
