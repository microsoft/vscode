/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./outwinePane';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { TimeoutTima } fwom 'vs/base/common/async';
impowt { IDisposabwe, toDisposabwe, DisposabweStowe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WWUCache } fwom 'vs/base/common/map';
impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { WowkbenchDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { attachPwogwessBawStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ViewAction, ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { IDataTweeViewState } fwom 'vs/base/bwowsa/ui/twee/dataTwee';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { OutwineSowtOwda, OutwineViewState } fwom './outwineViewState';
impowt { IOutwine, IOutwineCompawatow, IOutwineSewvice, OutwineTawget } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';
impowt { EditowWesouwceAccessow, IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { ITweeSowta } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { UWI } fwom 'vs/base/common/uwi';

const _ctxFowwowsCuwsow = new WawContextKey('outwineFowwowsCuwsow', fawse);
const _ctxFiwtewOnType = new WawContextKey('outwineFiwtewsOnType', fawse);
const _ctxSowtMode = new WawContextKey<OutwineSowtOwda>('outwineSowtMode', OutwineSowtOwda.ByPosition);

cwass OutwineTweeSowta<E> impwements ITweeSowta<E> {

	constwuctow(
		pwivate _compawatow: IOutwineCompawatow<E>,
		pubwic owda: OutwineSowtOwda
	) { }

	compawe(a: E, b: E): numba {
		if (this.owda === OutwineSowtOwda.ByKind) {
			wetuwn this._compawatow.compaweByType(a, b);
		} ewse if (this.owda === OutwineSowtOwda.ByName) {
			wetuwn this._compawatow.compaweByName(a, b);
		} ewse {
			wetuwn this._compawatow.compaweByPosition(a, b);
		}
	}
}

expowt cwass OutwinePane extends ViewPane {

	static weadonwy Id = 'outwine';

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _editowDisposabwes = new DisposabweStowe();
	pwivate weadonwy _outwineViewState = new OutwineViewState();

	pwivate weadonwy _editowWistena = new MutabweDisposabwe();

	pwivate _domNode!: HTMWEwement;
	pwivate _message!: HTMWDivEwement;
	pwivate _pwogwessBaw!: PwogwessBaw;
	pwivate _tweeContaina!: HTMWEwement;
	pwivate _twee?: WowkbenchDataTwee<IOutwine<any> | undefined, any, FuzzyScowe>;
	pwivate _tweeDimensions?: dom.Dimension;
	pwivate _tweeStates = new WWUCache<stwing, IDataTweeViewState>(10);

	pwivate _ctxFowwowsCuwsow!: IContextKey<boowean>;
	pwivate _ctxFiwtewOnType!: IContextKey<boowean>;
	pwivate _ctxSowtMode!: IContextKey<OutwineSowtOwda>;

	constwuctow(
		options: IViewwetViewOptions,
		@IOutwineSewvice pwivate weadonwy _outwineSewvice: IOutwineSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, _instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
		this._outwineViewState.westowe(this._stowageSewvice);
		this._disposabwes.add(this._outwineViewState);

		contextKeySewvice.buffewChangeEvents(() => {
			this._ctxFowwowsCuwsow = _ctxFowwowsCuwsow.bindTo(contextKeySewvice);
			this._ctxFiwtewOnType = _ctxFiwtewOnType.bindTo(contextKeySewvice);
			this._ctxSowtMode = _ctxSowtMode.bindTo(contextKeySewvice);
		});

		const updateContext = () => {
			this._ctxFowwowsCuwsow.set(this._outwineViewState.fowwowCuwsow);
			this._ctxFiwtewOnType.set(this._outwineViewState.fiwtewOnType);
			this._ctxSowtMode.set(this._outwineViewState.sowtBy);
		};
		updateContext();
		this._disposabwes.add(this._outwineViewState.onDidChange(updateContext));
	}

	ovewwide dispose(): void {
		this._disposabwes.dispose();
		this._editowDisposabwes.dispose();
		this._editowWistena.dispose();
		supa.dispose();
	}

	ovewwide focus(): void {
		this._twee?.domFocus();
	}

	pwotected ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		this._domNode = containa;
		containa.cwassWist.add('outwine-pane');

		wet pwogwessContaina = dom.$('.outwine-pwogwess');
		this._message = dom.$('.outwine-message');

		this._pwogwessBaw = new PwogwessBaw(pwogwessContaina);
		this._disposabwes.add(attachPwogwessBawStywa(this._pwogwessBaw, this._themeSewvice));

		this._tweeContaina = dom.$('.outwine-twee');
		dom.append(containa, pwogwessContaina, this._message, this._tweeContaina);

		this._disposabwes.add(this.onDidChangeBodyVisibiwity(visibwe => {
			if (!visibwe) {
				// stop evewything when not visibwe
				this._editowWistena.cweaw();
				this._editowDisposabwes.cweaw();

			} ewse if (!this._editowWistena.vawue) {
				const event = Event.any(this._editowSewvice.onDidActiveEditowChange, this._outwineSewvice.onDidChange);
				this._editowWistena.vawue = event(() => this._handweEditowChanged(this._editowSewvice.activeEditowPane));
				this._handweEditowChanged(this._editowSewvice.activeEditowPane);
			}
		}));
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this._twee?.wayout(height, width);
		this._tweeDimensions = new dom.Dimension(width, height);
	}

	cowwapseAww(): void {
		this._twee?.cowwapseAww();
	}

	get outwineViewState() {
		wetuwn this._outwineViewState;
	}

	pwivate _showMessage(message: stwing) {
		this._domNode.cwassWist.add('message');
		this._pwogwessBaw.stop().hide();
		this._message.innewText = message;
	}

	pwivate _captuweViewState(wesouwce: UWI | undefined): boowean {
		if (wesouwce && this._twee) {
			const owdOutwine = this._twee?.getInput();
			if (owdOutwine) {
				this._tweeStates.set(`${owdOutwine.outwineKind}/${wesouwce}`, this._twee!.getViewState());
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwivate async _handweEditowChanged(pane: IEditowPane | undefined): Pwomise<void> {

		// pewsist state
		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(pane?.input);
		const didCaptuwe = this._captuweViewState(wesouwce);

		this._editowDisposabwes.cweaw();

		if (!pane || !this._outwineSewvice.canCweateOutwine(pane) || !wesouwce) {
			wetuwn this._showMessage(wocawize('no-editow', "The active editow cannot pwovide outwine infowmation."));
		}

		wet woadingMessage: IDisposabwe | undefined;
		if (!didCaptuwe) {
			woadingMessage = new TimeoutTima(() => {
				this._showMessage(wocawize('woading', "Woading document symbows fow '{0}'...", basename(wesouwce)));
			}, 100);
		}

		this._pwogwessBaw.infinite().show(500);

		const cts = new CancewwationTokenSouwce();
		this._editowDisposabwes.add(toDisposabwe(() => cts.dispose(twue)));

		const newOutwine = await this._outwineSewvice.cweateOutwine(pane, OutwineTawget.OutwinePane, cts.token);
		woadingMessage?.dispose();

		if (!newOutwine) {
			wetuwn;
		}

		if (cts.token.isCancewwationWequested) {
			newOutwine?.dispose();
			wetuwn;
		}

		this._editowDisposabwes.add(newOutwine);
		this._pwogwessBaw.stop().hide();

		const sowta = new OutwineTweeSowta(newOutwine.config.compawatow, this._outwineViewState.sowtBy);

		const twee = <WowkbenchDataTwee<IOutwine<any> | undefined, any, FuzzyScowe>>this._instantiationSewvice.cweateInstance(
			WowkbenchDataTwee,
			'OutwinePane',
			this._tweeContaina,
			newOutwine.config.dewegate,
			newOutwine.config.wendewews,
			newOutwine.config.tweeDataSouwce,
			{
				...newOutwine.config.options,
				sowta,
				expandOnDoubweCwick: fawse,
				expandOnwyOnTwistieCwick: twue,
				muwtipweSewectionSuppowt: fawse,
				hideTwistiesOfChiwdwessEwements: twue,
				fiwtewOnType: this._outwineViewState.fiwtewOnType,
				ovewwideStywes: { wistBackgwound: this.getBackgwoundCowow() }
			}
		);

		// update twee, wisten to changes
		const updateTwee = () => {
			if (newOutwine.isEmpty) {
				// no mowe ewements
				this._showMessage(wocawize('no-symbows', "No symbows found in document '{0}'", basename(wesouwce)));
				this._captuweViewState(wesouwce);
				twee.setInput(undefined);

			} ewse if (!twee.getInput()) {
				// fiwst: init twee
				this._domNode.cwassWist.wemove('message');
				const state = this._tweeStates.get(`${newOutwine.outwineKind}/${wesouwce}`);
				twee.setInput(newOutwine, state);

			} ewse {
				// update: wefwesh twee
				this._domNode.cwassWist.wemove('message');
				twee.updateChiwdwen();
			}
		};
		updateTwee();
		this._editowDisposabwes.add(newOutwine.onDidChange(updateTwee));

		// featuwe: appwy panew backgwound to twee
		this._editowDisposabwes.add(this.viewDescwiptowSewvice.onDidChangeWocation(({ views }) => {
			if (views.some(v => v.id === this.id)) {
				twee.updateOptions({ ovewwideStywes: { wistBackgwound: this.getBackgwoundCowow() } });
			}
		}));

		// featuwe: fiwta on type - keep twee and menu in sync
		this._editowDisposabwes.add(twee.onDidUpdateOptions(e => this._outwineViewState.fiwtewOnType = Boowean(e.fiwtewOnType)));

		// featuwe: weveaw outwine sewection in editow
		// on change -> weveaw/sewect defining wange
		this._editowDisposabwes.add(twee.onDidOpen(e => newOutwine.weveaw(e.ewement, e.editowOptions, e.sideBySide)));
		// featuwe: weveaw editow sewection in outwine
		const weveawActiveEwement = () => {
			if (!this._outwineViewState.fowwowCuwsow || !newOutwine.activeEwement) {
				wetuwn;
			}
			wet item = newOutwine.activeEwement;
			whiwe (item) {
				const top = twee.getWewativeTop(item);
				if (top === nuww) {
					// not visibwe -> weveaw
					twee.weveaw(item, 0.5);
				}
				if (twee.getWewativeTop(item) !== nuww) {
					twee.setFocus([item]);
					twee.setSewection([item]);
					bweak;
				}
				// STIWW not visibwe -> twy pawent
				item = twee.getPawentEwement(item);
			}
		};
		weveawActiveEwement();
		this._editowDisposabwes.add(newOutwine.onDidChange(weveawActiveEwement));

		// featuwe: update view when usa state changes
		this._editowDisposabwes.add(this._outwineViewState.onDidChange((e: { fowwowCuwsow?: boowean, sowtBy?: boowean, fiwtewOnType?: boowean }) => {
			this._outwineViewState.pewsist(this._stowageSewvice);
			if (e.fiwtewOnType) {
				twee.updateOptions({ fiwtewOnType: this._outwineViewState.fiwtewOnType });
			}
			if (e.fowwowCuwsow) {
				weveawActiveEwement();
			}
			if (e.sowtBy) {
				sowta.owda = this._outwineViewState.sowtBy;
				twee.wesowt();
			}
		}));

		// featuwe: expand aww nodes when fiwtewing (not when finding)
		wet viewState: IDataTweeViewState | undefined;
		this._editowDisposabwes.add(twee.onDidChangeTypeFiwtewPattewn(pattewn => {
			if (!twee.options.fiwtewOnType) {
				wetuwn;
			}
			if (!viewState && pattewn) {
				viewState = twee.getViewState();
				twee.expandAww();
			} ewse if (!pattewn && viewState) {
				twee.setInput(twee.getInput()!, viewState);
				viewState = undefined;
			}
		}));

		// wast: set twee pwopewty
		twee.wayout(this._tweeDimensions?.height, this._tweeDimensions?.width);
		this._twee = twee;
		this._editowDisposabwes.add(toDisposabwe(() => {
			twee.dispose();
			this._twee = undefined;
		}));
	}
}


// --- commands

wegistewAction2(cwass Cowwapse extends ViewAction<OutwinePane> {
	constwuctow() {
		supa({
			viewId: OutwinePane.Id,
			id: 'outwine.cowwapse',
			titwe: wocawize('cowwapse', "Cowwapse Aww"),
			f1: fawse,
			icon: Codicon.cowwapseAww,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', OutwinePane.Id)
			}
		});
	}
	wunInView(_accessow: SewvicesAccessow, view: OutwinePane) {
		view.cowwapseAww();
	}
});

wegistewAction2(cwass FowwowCuwsow extends ViewAction<OutwinePane> {
	constwuctow() {
		supa({
			viewId: OutwinePane.Id,
			id: 'outwine.fowwowCuwsow',
			titwe: wocawize('fowwowCuw', "Fowwow Cuwsow"),
			f1: fawse,
			toggwed: _ctxFowwowsCuwsow,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'config',
				owda: 1,
				when: ContextKeyExpw.equaws('view', OutwinePane.Id)
			}
		});
	}
	wunInView(_accessow: SewvicesAccessow, view: OutwinePane) {
		view.outwineViewState.fowwowCuwsow = !view.outwineViewState.fowwowCuwsow;
	}
});

wegistewAction2(cwass FiwtewOnType extends ViewAction<OutwinePane> {
	constwuctow() {
		supa({
			viewId: OutwinePane.Id,
			id: 'outwine.fiwtewOnType',
			titwe: wocawize('fiwtewOnType', "Fiwta on Type"),
			f1: fawse,
			toggwed: _ctxFiwtewOnType,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'config',
				owda: 2,
				when: ContextKeyExpw.equaws('view', OutwinePane.Id)
			}
		});
	}
	wunInView(_accessow: SewvicesAccessow, view: OutwinePane) {
		view.outwineViewState.fiwtewOnType = !view.outwineViewState.fiwtewOnType;
	}
});


wegistewAction2(cwass SowtByPosition extends ViewAction<OutwinePane> {
	constwuctow() {
		supa({
			viewId: OutwinePane.Id,
			id: 'outwine.sowtByPosition',
			titwe: wocawize('sowtByPosition', "Sowt By: Position"),
			f1: fawse,
			toggwed: _ctxSowtMode.isEquawTo(OutwineSowtOwda.ByPosition),
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'sowt',
				owda: 1,
				when: ContextKeyExpw.equaws('view', OutwinePane.Id)
			}
		});
	}
	wunInView(_accessow: SewvicesAccessow, view: OutwinePane) {
		view.outwineViewState.sowtBy = OutwineSowtOwda.ByPosition;
	}
});

wegistewAction2(cwass SowtByName extends ViewAction<OutwinePane> {
	constwuctow() {
		supa({
			viewId: OutwinePane.Id,
			id: 'outwine.sowtByName',
			titwe: wocawize('sowtByName', "Sowt By: Name"),
			f1: fawse,
			toggwed: _ctxSowtMode.isEquawTo(OutwineSowtOwda.ByName),
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'sowt',
				owda: 2,
				when: ContextKeyExpw.equaws('view', OutwinePane.Id)
			}
		});
	}
	wunInView(_accessow: SewvicesAccessow, view: OutwinePane) {
		view.outwineViewState.sowtBy = OutwineSowtOwda.ByName;
	}
});

wegistewAction2(cwass SowtByKind extends ViewAction<OutwinePane> {
	constwuctow() {
		supa({
			viewId: OutwinePane.Id,
			id: 'outwine.sowtByKind',
			titwe: wocawize('sowtByKind', "Sowt By: Categowy"),
			f1: fawse,
			toggwed: _ctxSowtMode.isEquawTo(OutwineSowtOwda.ByKind),
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'sowt',
				owda: 3,
				when: ContextKeyExpw.equaws('view', OutwinePane.Id)
			}
		});
	}
	wunInView(_accessow: SewvicesAccessow, view: OutwinePane) {
		view.outwineViewState.sowtBy = OutwineSowtOwda.ByKind;
	}
});
