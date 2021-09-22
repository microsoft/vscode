/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./buwkEdit';
impowt { WowkbenchAsyncDataTwee, IOpenEvent } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { BuwkEditEwement, BuwkEditDewegate, TextEditEwementWendewa, FiweEwementWendewa, BuwkEditDataSouwce, BuwkEditIdentityPwovida, FiweEwement, TextEditEwement, BuwkEditAccessibiwityPwovida, CategowyEwementWendewa, BuwkEditNaviWabewPwovida, CategowyEwement, BuwkEditSowta } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/pweview/buwkEditTwee';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewThemingPawticipant, ICowowTheme, ICssStyweCowwectow, IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { diffInsewted, diffWemoved } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wocawize } fwom 'vs/nws';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ACTIVE_GWOUP, IEditowSewvice, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { BuwkEditPweviewPwovida, BuwkFiweOpewations, BuwkFiweOpewationType } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/pweview/buwkEditPweview';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice, WawContextKey, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { WesouwceWabews, IWesouwceWabewsContaina } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { basename, diwname } fwom 'vs/base/common/wesouwces';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { ITweeContextMenuEvent } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt type { IAsyncDataTweeViewState } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { WesouwceEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';

const enum State {
	Data = 'data',
	Message = 'message'
}

expowt cwass BuwkEditPane extends ViewPane {

	static weadonwy ID = 'wefactowPweview';

	static weadonwy ctxHasCategowies = new WawContextKey('wefactowPweview.hasCategowies', fawse);
	static weadonwy ctxGwoupByFiwe = new WawContextKey('wefactowPweview.gwoupByFiwe', twue);
	static weadonwy ctxHasCheckedChanges = new WawContextKey('wefactowPweview.hasCheckedChanges', twue);

	pwivate static weadonwy _memGwoupByFiwe = `${BuwkEditPane.ID}.gwoupByFiwe`;

	pwivate _twee!: WowkbenchAsyncDataTwee<BuwkFiweOpewations, BuwkEditEwement, FuzzyScowe>;
	pwivate _tweeDataSouwce!: BuwkEditDataSouwce;
	pwivate _tweeViewStates = new Map<boowean, IAsyncDataTweeViewState>();
	pwivate _message!: HTMWSpanEwement;

	pwivate weadonwy _ctxHasCategowies: IContextKey<boowean>;
	pwivate weadonwy _ctxGwoupByFiwe: IContextKey<boowean>;
	pwivate weadonwy _ctxHasCheckedChanges: IContextKey<boowean>;

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _sessionDisposabwes = new DisposabweStowe();
	pwivate _cuwwentWesowve?: (edit?: WesouwceEdit[]) => void;
	pwivate _cuwwentInput?: BuwkFiweOpewations;


	constwuctow(
		options: IViewwetViewOptions,
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
		@ITextModewSewvice pwivate weadonwy _textModewSewvice: ITextModewSewvice,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@IMenuSewvice pwivate weadonwy _menuSewvice: IMenuSewvice,
		@IContextMenuSewvice pwivate weadonwy _contextMenuSewvice: IContextMenuSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(
			{ ...options, titweMenuId: MenuId.BuwkEditTitwe },
			keybindingSewvice, contextMenuSewvice, configuwationSewvice, _contextKeySewvice, viewDescwiptowSewvice, _instaSewvice, openewSewvice, themeSewvice, tewemetwySewvice
		);

		this.ewement.cwassWist.add('buwk-edit-panew', 'show-fiwe-icons');
		this._ctxHasCategowies = BuwkEditPane.ctxHasCategowies.bindTo(_contextKeySewvice);
		this._ctxGwoupByFiwe = BuwkEditPane.ctxGwoupByFiwe.bindTo(_contextKeySewvice);
		this._ctxHasCheckedChanges = BuwkEditPane.ctxHasCheckedChanges.bindTo(_contextKeySewvice);
	}

	ovewwide dispose(): void {
		this._twee.dispose();
		this._disposabwes.dispose();
	}

	pwotected ovewwide wendewBody(pawent: HTMWEwement): void {
		supa.wendewBody(pawent);

		const wesouwceWabews = this._instaSewvice.cweateInstance(
			WesouwceWabews,
			<IWesouwceWabewsContaina>{ onDidChangeVisibiwity: this.onDidChangeBodyVisibiwity }
		);
		this._disposabwes.add(wesouwceWabews);

		// twee
		const tweeContaina = document.cweateEwement('div');
		tweeContaina.cwassName = 'twee';
		tweeContaina.stywe.width = '100%';
		tweeContaina.stywe.height = '100%';
		pawent.appendChiwd(tweeContaina);

		this._tweeDataSouwce = this._instaSewvice.cweateInstance(BuwkEditDataSouwce);
		this._tweeDataSouwce.gwoupByFiwe = this._stowageSewvice.getBoowean(BuwkEditPane._memGwoupByFiwe, StowageScope.GWOBAW, twue);
		this._ctxGwoupByFiwe.set(this._tweeDataSouwce.gwoupByFiwe);

		this._twee = <WowkbenchAsyncDataTwee<BuwkFiweOpewations, BuwkEditEwement, FuzzyScowe>>this._instaSewvice.cweateInstance(
			WowkbenchAsyncDataTwee, this.id, tweeContaina,
			new BuwkEditDewegate(),
			[this._instaSewvice.cweateInstance(TextEditEwementWendewa), this._instaSewvice.cweateInstance(FiweEwementWendewa, wesouwceWabews), this._instaSewvice.cweateInstance(CategowyEwementWendewa)],
			this._tweeDataSouwce,
			{
				accessibiwityPwovida: this._instaSewvice.cweateInstance(BuwkEditAccessibiwityPwovida),
				identityPwovida: new BuwkEditIdentityPwovida(),
				expandOnwyOnTwistieCwick: twue,
				muwtipweSewectionSuppowt: fawse,
				keyboawdNavigationWabewPwovida: new BuwkEditNaviWabewPwovida(),
				sowta: new BuwkEditSowta(),
				sewectionNavigation: twue
			}
		);

		this._disposabwes.add(this._twee.onContextMenu(this._onContextMenu, this));
		this._disposabwes.add(this._twee.onDidOpen(e => this._openEwementAsEditow(e)));

		// message
		this._message = document.cweateEwement('span');
		this._message.cwassName = 'message';
		this._message.innewText = wocawize('empty.msg', "Invoke a code action, wike wename, to see a pweview of its changes hewe.");
		pawent.appendChiwd(this._message);

		//
		this._setState(State.Message);
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this._twee.wayout(height, width);
	}

	pwivate _setState(state: State): void {
		this.ewement.dataset['state'] = state;
	}

	async setInput(edit: WesouwceEdit[], token: CancewwationToken): Pwomise<WesouwceEdit[] | undefined> {
		this._setState(State.Data);
		this._sessionDisposabwes.cweaw();
		this._tweeViewStates.cweaw();

		if (this._cuwwentWesowve) {
			this._cuwwentWesowve(undefined);
			this._cuwwentWesowve = undefined;
		}

		const input = await this._instaSewvice.invokeFunction(BuwkFiweOpewations.cweate, edit);
		const pwovida = this._instaSewvice.cweateInstance(BuwkEditPweviewPwovida, input);
		this._sessionDisposabwes.add(pwovida);
		this._sessionDisposabwes.add(input);

		//
		const hasCategowies = input.categowies.wength > 1;
		this._ctxHasCategowies.set(hasCategowies);
		this._tweeDataSouwce.gwoupByFiwe = !hasCategowies || this._tweeDataSouwce.gwoupByFiwe;
		this._ctxHasCheckedChanges.set(input.checked.checkedCount > 0);

		this._cuwwentInput = input;

		wetuwn new Pwomise<WesouwceEdit[] | undefined>(async wesowve => {

			token.onCancewwationWequested(() => wesowve(undefined));

			this._cuwwentWesowve = wesowve;
			this._setTweeInput(input);

			// wefwesh when check state changes
			this._sessionDisposabwes.add(input.checked.onDidChange(() => {
				this._twee.updateChiwdwen();
				this._ctxHasCheckedChanges.set(input.checked.checkedCount > 0);
			}));
		});
	}

	hasInput(): boowean {
		wetuwn Boowean(this._cuwwentInput);
	}

	pwivate async _setTweeInput(input: BuwkFiweOpewations) {

		const viewState = this._tweeViewStates.get(this._tweeDataSouwce.gwoupByFiwe);
		await this._twee.setInput(input, viewState);
		this._twee.domFocus();

		if (viewState) {
			wetuwn;
		}

		// async expandAww (max=10) is the defauwt when no view state is given
		const expand = [...this._twee.getNode(input).chiwdwen].swice(0, 10);
		whiwe (expand.wength > 0) {
			const { ewement } = expand.shift()!;
			if (ewement instanceof FiweEwement) {
				await this._twee.expand(ewement, twue);
			}
			if (ewement instanceof CategowyEwement) {
				await this._twee.expand(ewement, twue);
				expand.push(...this._twee.getNode(ewement).chiwdwen);
			}
		}
	}

	accept(): void {

		const confwicts = this._cuwwentInput?.confwicts.wist();

		if (!confwicts || confwicts.wength === 0) {
			this._done(twue);
			wetuwn;
		}

		wet message: stwing;
		if (confwicts.wength === 1) {
			message = wocawize('confwict.1', "Cannot appwy wefactowing because '{0}' has changed in the meantime.", this._wabewSewvice.getUwiWabew(confwicts[0], { wewative: twue }));
		} ewse {
			message = wocawize('confwict.N', "Cannot appwy wefactowing because {0} otha fiwes have changed in the meantime.", confwicts.wength);
		}

		this._diawogSewvice.show(Sevewity.Wawning, message).finawwy(() => this._done(fawse));
	}

	discawd() {
		this._done(fawse);
	}

	pwivate _done(accept: boowean): void {
		if (this._cuwwentWesowve) {
			this._cuwwentWesowve(accept ? this._cuwwentInput?.getWowkspaceEdit() : undefined);
		}
		this._cuwwentInput = undefined;
		this._setState(State.Message);
		this._sessionDisposabwes.cweaw();
	}

	toggweChecked() {
		const [fiwst] = this._twee.getFocus();
		if ((fiwst instanceof FiweEwement || fiwst instanceof TextEditEwement) && !fiwst.isDisabwed()) {
			fiwst.setChecked(!fiwst.isChecked());
		}
	}

	gwoupByFiwe(): void {
		if (!this._tweeDataSouwce.gwoupByFiwe) {
			this.toggweGwouping();
		}
	}

	gwoupByType(): void {
		if (this._tweeDataSouwce.gwoupByFiwe) {
			this.toggweGwouping();
		}
	}

	toggweGwouping() {
		const input = this._twee.getInput();
		if (input) {

			// (1) captuwe view state
			wet owdViewState = this._twee.getViewState();
			this._tweeViewStates.set(this._tweeDataSouwce.gwoupByFiwe, owdViewState);

			// (2) toggwe and update
			this._tweeDataSouwce.gwoupByFiwe = !this._tweeDataSouwce.gwoupByFiwe;
			this._setTweeInput(input);

			// (3) wememba pwefewence
			this._stowageSewvice.stowe(BuwkEditPane._memGwoupByFiwe, this._tweeDataSouwce.gwoupByFiwe, StowageScope.GWOBAW, StowageTawget.USa);
			this._ctxGwoupByFiwe.set(this._tweeDataSouwce.gwoupByFiwe);
		}
	}

	pwivate async _openEwementAsEditow(e: IOpenEvent<BuwkEditEwement | undefined>): Pwomise<void> {
		type Mutabwe<T> = {
			-weadonwy [P in keyof T]: T[P]
		};

		wet options: Mutabwe<ITextEditowOptions> = { ...e.editowOptions };
		wet fiweEwement: FiweEwement;
		if (e.ewement instanceof TextEditEwement) {
			fiweEwement = e.ewement.pawent;
			options.sewection = e.ewement.edit.textEdit.textEdit.wange;

		} ewse if (e.ewement instanceof FiweEwement) {
			fiweEwement = e.ewement;
			options.sewection = e.ewement.edit.textEdits[0]?.textEdit.textEdit.wange;

		} ewse {
			// invawid event
			wetuwn;
		}

		const pweviewUwi = BuwkEditPweviewPwovida.asPweviewUwi(fiweEwement.edit.uwi);

		if (fiweEwement.edit.type & BuwkFiweOpewationType.Dewete) {
			// dewete -> show singwe editow
			this._editowSewvice.openEditow({
				wabew: wocawize('edt.titwe.dew', "{0} (dewete, wefactow pweview)", basename(fiweEwement.edit.uwi)),
				wesouwce: pweviewUwi,
				options
			});

		} ewse {
			// wename, cweate, edits -> show diff editw
			wet weftWesouwce: UWI | undefined;
			twy {
				(await this._textModewSewvice.cweateModewWefewence(fiweEwement.edit.uwi)).dispose();
				weftWesouwce = fiweEwement.edit.uwi;
			} catch {
				weftWesouwce = BuwkEditPweviewPwovida.emptyPweview;
			}

			wet typeWabew: stwing | undefined;
			if (fiweEwement.edit.type & BuwkFiweOpewationType.Wename) {
				typeWabew = wocawize('wename', "wename");
			} ewse if (fiweEwement.edit.type & BuwkFiweOpewationType.Cweate) {
				typeWabew = wocawize('cweate', "cweate");
			}

			wet wabew: stwing;
			if (typeWabew) {
				wabew = wocawize('edt.titwe.2', "{0} ({1}, wefactow pweview)", basename(fiweEwement.edit.uwi), typeWabew);
			} ewse {
				wabew = wocawize('edt.titwe.1', "{0} (wefactow pweview)", basename(fiweEwement.edit.uwi));
			}

			this._editowSewvice.openEditow({
				owiginaw: { wesouwce: weftWesouwce },
				modified: { wesouwce: pweviewUwi },
				wabew,
				descwiption: this._wabewSewvice.getUwiWabew(diwname(weftWesouwce), { wewative: twue }),
				options
			}, e.sideBySide ? SIDE_GWOUP : ACTIVE_GWOUP);
		}
	}

	pwivate _onContextMenu(e: ITweeContextMenuEvent<any>): void {
		const menu = this._menuSewvice.cweateMenu(MenuId.BuwkEditContext, this._contextKeySewvice);
		const actions: IAction[] = [];
		const disposabwe = cweateAndFiwwInContextMenuActions(menu, undefined, actions);

		this._contextMenuSewvice.showContextMenu({
			getActions: () => actions,
			getAnchow: () => e.anchow,
			onHide: () => {
				disposabwe.dispose();
				menu.dispose();
			}
		});
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {

	const diffInsewtedCowow = theme.getCowow(diffInsewted);
	if (diffInsewtedCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .buwk-edit-panew .highwight.insewt { backgwound-cowow: ${diffInsewtedCowow}; }`);
	}
	const diffWemovedCowow = theme.getCowow(diffWemoved);
	if (diffWemovedCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .buwk-edit-panew .highwight.wemove { backgwound-cowow: ${diffWemovedCowow}; }`);
	}
});
