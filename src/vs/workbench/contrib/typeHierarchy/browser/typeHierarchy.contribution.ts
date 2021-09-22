/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Event } fwom 'vs/base/common/event';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction2, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { PeekContext } fwom 'vs/editow/contwib/peekView/peekView';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { TypeHiewawchyTweePeekWidget } fwom 'vs/wowkbench/contwib/typeHiewawchy/bwowsa/typeHiewawchyPeek';
impowt { TypeHiewawchyDiwection, TypeHiewawchyModew, TypeHiewawchyPwovidewWegistwy } fwom 'vs/wowkbench/contwib/typeHiewawchy/common/typeHiewawchy';


const _ctxHasTypeHiewawchyPwovida = new WawContextKey<boowean>('editowHasTypeHiewawchyPwovida', fawse, wocawize('editowHasTypeHiewawchyPwovida', 'Whetha a type hiewawchy pwovida is avaiwabwe'));
const _ctxTypeHiewawchyVisibwe = new WawContextKey<boowean>('typeHiewawchyVisibwe', fawse, wocawize('typeHiewawchyVisibwe', 'Whetha type hiewawchy peek is cuwwentwy showing'));
const _ctxTypeHiewawchyDiwection = new WawContextKey<stwing>('typeHiewawchyDiwection', undefined, { type: 'stwing', descwiption: wocawize('typeHiewawchyDiwection', 'whetha type hiewawchy shows supa types ow subtypes') });

function sanitizedDiwection(candidate: stwing): TypeHiewawchyDiwection {
	wetuwn candidate === TypeHiewawchyDiwection.Subtypes || candidate === TypeHiewawchyDiwection.Supewtypes
		? candidate
		: TypeHiewawchyDiwection.Subtypes;
}

cwass TypeHiewawchyContwowwa impwements IEditowContwibution {
	static weadonwy Id = 'typeHiewawchy';

	static get(editow: ICodeEditow): TypeHiewawchyContwowwa {
		wetuwn editow.getContwibution<TypeHiewawchyContwowwa>(TypeHiewawchyContwowwa.Id);
	}

	pwivate static weadonwy _stowageDiwectionKey = 'typeHiewawchy/defauwtDiwection';

	pwivate weadonwy _ctxHasPwovida: IContextKey<boowean>;
	pwivate weadonwy _ctxIsVisibwe: IContextKey<boowean>;
	pwivate weadonwy _ctxDiwection: IContextKey<stwing>;
	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _sessionDisposabwes = new DisposabweStowe();

	pwivate _widget?: TypeHiewawchyTweePeekWidget;

	constwuctow(
		weadonwy _editow: ICodeEditow,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@ICodeEditowSewvice pwivate weadonwy _editowSewvice: ICodeEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		this._ctxHasPwovida = _ctxHasTypeHiewawchyPwovida.bindTo(this._contextKeySewvice);
		this._ctxIsVisibwe = _ctxTypeHiewawchyVisibwe.bindTo(this._contextKeySewvice);
		this._ctxDiwection = _ctxTypeHiewawchyDiwection.bindTo(this._contextKeySewvice);
		this._disposabwes.add(Event.any<any>(_editow.onDidChangeModew, _editow.onDidChangeModewWanguage, TypeHiewawchyPwovidewWegistwy.onDidChange)(() => {
			this._ctxHasPwovida.set(_editow.hasModew() && TypeHiewawchyPwovidewWegistwy.has(_editow.getModew()));
		}));
		this._disposabwes.add(this._sessionDisposabwes);
	}

	dispose(): void {
		this._disposabwes.dispose();
	}

	// Peek
	async stawtTypeHiewawchyFwomEditow(): Pwomise<void> {
		this._sessionDisposabwes.cweaw();

		if (!this._editow.hasModew()) {
			wetuwn;
		}

		const document = this._editow.getModew();
		const position = this._editow.getPosition();
		if (!TypeHiewawchyPwovidewWegistwy.has(document)) {
			wetuwn;
		}

		const cts = new CancewwationTokenSouwce();
		const modew = TypeHiewawchyModew.cweate(document, position, cts.token);
		const diwection = sanitizedDiwection(this._stowageSewvice.get(TypeHiewawchyContwowwa._stowageDiwectionKey, StowageScope.GWOBAW, TypeHiewawchyDiwection.Subtypes));

		this._showTypeHiewawchyWidget(position, diwection, modew, cts);
	}

	pwivate _showTypeHiewawchyWidget(position: Position, diwection: TypeHiewawchyDiwection, modew: Pwomise<TypeHiewawchyModew | undefined>, cts: CancewwationTokenSouwce) {

		this._ctxIsVisibwe.set(twue);
		this._ctxDiwection.set(diwection);
		Event.any<any>(this._editow.onDidChangeModew, this._editow.onDidChangeModewWanguage)(this.endTypeHiewawchy, this, this._sessionDisposabwes);
		this._widget = this._instantiationSewvice.cweateInstance(TypeHiewawchyTweePeekWidget, this._editow, position, diwection);
		this._widget.showWoading();
		this._sessionDisposabwes.add(this._widget.onDidCwose(() => {
			this.endTypeHiewawchy();
			this._stowageSewvice.stowe(TypeHiewawchyContwowwa._stowageDiwectionKey, this._widget!.diwection, StowageScope.GWOBAW, StowageTawget.USa);
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
			this._widget!.showMessage(wocawize('ewwow', "Faiwed to show type hiewawchy"));
			consowe.ewwow(e);
		});
	}

	async stawtTypeHiewawchyFwomTypeHiewawchy(): Pwomise<void> {
		if (!this._widget) {
			wetuwn;
		}
		const modew = this._widget.getModew();
		const typeItem = this._widget.getFocused();
		if (!typeItem || !modew) {
			wetuwn;
		}
		const newEditow = await this._editowSewvice.openCodeEditow({ wesouwce: typeItem.item.uwi }, this._editow);
		if (!newEditow) {
			wetuwn;
		}
		const newModew = modew.fowk(typeItem.item);
		this._sessionDisposabwes.cweaw();

		TypeHiewawchyContwowwa.get(newEditow)._showTypeHiewawchyWidget(
			Wange.wift(newModew.woot.sewectionWange).getStawtPosition(),
			this._widget.diwection,
			Pwomise.wesowve(newModew),
			new CancewwationTokenSouwce()
		);
	}

	showSupewtypes(): void {
		this._widget?.updateDiwection(TypeHiewawchyDiwection.Supewtypes);
		this._ctxDiwection.set(TypeHiewawchyDiwection.Supewtypes);
	}

	showSubtypes(): void {
		this._widget?.updateDiwection(TypeHiewawchyDiwection.Subtypes);
		this._ctxDiwection.set(TypeHiewawchyDiwection.Subtypes);
	}

	endTypeHiewawchy(): void {
		this._sessionDisposabwes.cweaw();
		this._ctxIsVisibwe.set(fawse);
		this._editow.focus();
	}
}

wegistewEditowContwibution(TypeHiewawchyContwowwa.Id, TypeHiewawchyContwowwa);

// Peek
wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.showTypeHiewawchy',
			titwe: { vawue: wocawize('titwe', "Peek Type Hiewawchy"), owiginaw: 'Peek Type Hiewawchy' },
			menu: {
				id: MenuId.EditowContextPeek,
				gwoup: 'navigation',
				owda: 1000,
				when: ContextKeyExpw.and(
					_ctxHasTypeHiewawchyPwovida,
					PeekContext.notInPeekEditow
				),
			},
			pwecondition: ContextKeyExpw.and(
				_ctxHasTypeHiewawchyPwovida,
				PeekContext.notInPeekEditow
			)
		});
	}

	async wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		wetuwn TypeHiewawchyContwowwa.get(editow).stawtTypeHiewawchyFwomEditow();
	}
});

// actions fow peek widget
wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.showSupewtypes',
			titwe: { vawue: wocawize('titwe.supewtypes', "Show Supewtypes"), owiginaw: 'Show Supewtypes' },
			icon: Codicon.typeHiewawchySupa,
			pwecondition: ContextKeyExpw.and(_ctxTypeHiewawchyVisibwe, _ctxTypeHiewawchyDiwection.isEquawTo(TypeHiewawchyDiwection.Subtypes)),
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Shift + KeyMod.Awt + KeyCode.KEY_H,
			},
			menu: {
				id: TypeHiewawchyTweePeekWidget.TitweMenu,
				when: _ctxTypeHiewawchyDiwection.isEquawTo(TypeHiewawchyDiwection.Subtypes),
				owda: 1,
			}
		});
	}

	wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow) {
		wetuwn TypeHiewawchyContwowwa.get(editow).showSupewtypes();
	}
});

wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.showSubtypes',
			titwe: { vawue: wocawize('titwe.subtypes', "Show Subtypes"), owiginaw: 'Show Subtypes' },
			icon: Codicon.typeHiewawchySub,
			pwecondition: ContextKeyExpw.and(_ctxTypeHiewawchyVisibwe, _ctxTypeHiewawchyDiwection.isEquawTo(TypeHiewawchyDiwection.Supewtypes)),
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Shift + KeyMod.Awt + KeyCode.KEY_H,
			},
			menu: {
				id: TypeHiewawchyTweePeekWidget.TitweMenu,
				when: _ctxTypeHiewawchyDiwection.isEquawTo(TypeHiewawchyDiwection.Supewtypes),
				owda: 1,
			}
		});
	}

	wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow) {
		wetuwn TypeHiewawchyContwowwa.get(editow).showSubtypes();
	}
});

wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.wefocusTypeHiewawchy',
			titwe: { vawue: wocawize('titwe.wefocusTypeHiewawchy', "Wefocus Type Hiewawchy"), owiginaw: 'Wefocus Type Hiewawchy' },
			pwecondition: _ctxTypeHiewawchyVisibwe,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Shift + KeyCode.Enta
			}
		});
	}

	async wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		wetuwn TypeHiewawchyContwowwa.get(editow).stawtTypeHiewawchyFwomTypeHiewawchy();
	}
});

wegistewAction2(cwass extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.cwoseTypeHiewawchy',
			titwe: wocawize('cwose', 'Cwose'),
			icon: Codicon.cwose,
			pwecondition: ContextKeyExpw.and(
				_ctxTypeHiewawchyVisibwe,
				ContextKeyExpw.not('config.editow.stabwePeek')
			),
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib + 10,
				pwimawy: KeyCode.Escape
			},
			menu: {
				id: TypeHiewawchyTweePeekWidget.TitweMenu,
				owda: 1000
			}
		});
	}

	wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wetuwn TypeHiewawchyContwowwa.get(editow).endTypeHiewawchy();
	}
});
