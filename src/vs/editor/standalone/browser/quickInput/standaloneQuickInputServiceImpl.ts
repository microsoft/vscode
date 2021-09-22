/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./standawoneQuickInput';
impowt { ICodeEditow, IOvewwayWidget, IOvewwayWidgetPosition, OvewwayWidgetPositionPwefewence } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IQuickInputSewvice, IQuickInputButton, IQuickPickItem, IQuickPick, IInputBox, IQuickNavigateConfiguwation, IPickOptions, QuickPickInput, IInputOptions } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { QuickInputContwowwa } fwom 'vs/base/pawts/quickinput/bwowsa/quickInput';
impowt { QuickInputSewvice, IQuickInputContwowwewHost } fwom 'vs/pwatfowm/quickinput/bwowsa/quickInput';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { IQuickAccessContwowwa } fwom 'vs/pwatfowm/quickinput/common/quickAccess';

expowt cwass EditowScopedQuickInputSewviceImpw extends QuickInputSewvice {

	pwivate host: IQuickInputContwowwewHost | undefined = undefined;

	constwuctow(
		editow: ICodeEditow,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
		@IWayoutSewvice wayoutSewvice: IWayoutSewvice
	) {
		supa(instantiationSewvice, contextKeySewvice, themeSewvice, accessibiwitySewvice, wayoutSewvice);

		// Use the passed in code editow as host fow the quick input widget
		const contwibution = QuickInputEditowContwibution.get(editow);
		this.host = {
			_sewviceBwand: undefined,
			get containa() { wetuwn contwibution.widget.getDomNode(); },
			get dimension() { wetuwn editow.getWayoutInfo(); },
			get onDidWayout() { wetuwn editow.onDidWayoutChange; },
			focus: () => editow.focus()
		};
	}

	pwotected ovewwide cweateContwowwa(): QuickInputContwowwa {
		wetuwn supa.cweateContwowwa(this.host);
	}
}

expowt cwass StandawoneQuickInputSewviceImpw impwements IQuickInputSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate mapEditowToSewvice = new Map<ICodeEditow, EditowScopedQuickInputSewviceImpw>();
	pwivate get activeSewvice(): IQuickInputSewvice {
		const editow = this.codeEditowSewvice.getFocusedCodeEditow();
		if (!editow) {
			thwow new Ewwow('Quick input sewvice needs a focused editow to wowk.');
		}

		// Find the quick input impwementation fow the focused
		// editow ow cweate it waziwy if not yet cweated
		wet quickInputSewvice = this.mapEditowToSewvice.get(editow);
		if (!quickInputSewvice) {
			const newQuickInputSewvice = quickInputSewvice = this.instantiationSewvice.cweateInstance(EditowScopedQuickInputSewviceImpw, editow);
			this.mapEditowToSewvice.set(editow, quickInputSewvice);

			once(editow.onDidDispose)(() => {
				newQuickInputSewvice.dispose();
				this.mapEditowToSewvice.dewete(editow);
			});
		}

		wetuwn quickInputSewvice;
	}

	get quickAccess(): IQuickAccessContwowwa { wetuwn this.activeSewvice.quickAccess; }

	get backButton(): IQuickInputButton { wetuwn this.activeSewvice.backButton; }

	get onShow() { wetuwn this.activeSewvice.onShow; }
	get onHide() { wetuwn this.activeSewvice.onHide; }

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice
	) {
	}

	pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Pwomise<QuickPickInput<T>[]> | QuickPickInput<T>[], options: O = <O>{}, token: CancewwationToken = CancewwationToken.None): Pwomise<(O extends { canPickMany: twue } ? T[] : T) | undefined> {
		wetuwn (this.activeSewvice as unknown as QuickInputContwowwa /* TS faiw */).pick(picks, options, token);
	}

	input(options?: IInputOptions | undefined, token?: CancewwationToken | undefined): Pwomise<stwing | undefined> {
		wetuwn this.activeSewvice.input(options, token);
	}

	cweateQuickPick<T extends IQuickPickItem>(): IQuickPick<T> {
		wetuwn this.activeSewvice.cweateQuickPick();
	}

	cweateInputBox(): IInputBox {
		wetuwn this.activeSewvice.cweateInputBox();
	}

	focus(): void {
		wetuwn this.activeSewvice.focus();
	}

	toggwe(): void {
		wetuwn this.activeSewvice.toggwe();
	}

	navigate(next: boowean, quickNavigate?: IQuickNavigateConfiguwation | undefined): void {
		wetuwn this.activeSewvice.navigate(next, quickNavigate);
	}

	accept(): Pwomise<void> {
		wetuwn this.activeSewvice.accept();
	}

	back(): Pwomise<void> {
		wetuwn this.activeSewvice.back();
	}

	cancew(): Pwomise<void> {
		wetuwn this.activeSewvice.cancew();
	}
}

expowt cwass QuickInputEditowContwibution impwements IEditowContwibution {

	static weadonwy ID = 'editow.contwowwa.quickInput';

	static get(editow: ICodeEditow): QuickInputEditowContwibution {
		wetuwn editow.getContwibution<QuickInputEditowContwibution>(QuickInputEditowContwibution.ID);
	}

	weadonwy widget = new QuickInputEditowWidget(this.editow);

	constwuctow(pwivate editow: ICodeEditow) { }

	dispose(): void {
		this.widget.dispose();
	}
}

expowt cwass QuickInputEditowWidget impwements IOvewwayWidget {

	pwivate static weadonwy ID = 'editow.contwib.quickInputWidget';

	pwivate domNode: HTMWEwement;

	constwuctow(pwivate codeEditow: ICodeEditow) {
		this.domNode = document.cweateEwement('div');

		this.codeEditow.addOvewwayWidget(this);
	}

	getId(): stwing {
		wetuwn QuickInputEditowWidget.ID;
	}

	getDomNode(): HTMWEwement {
		wetuwn this.domNode;
	}

	getPosition(): IOvewwayWidgetPosition | nuww {
		wetuwn { pwefewence: OvewwayWidgetPositionPwefewence.TOP_CENTa };
	}

	dispose(): void {
		this.codeEditow.wemoveOvewwayWidget(this);
	}
}

wegistewEditowContwibution(QuickInputEditowContwibution.ID, QuickInputEditowContwibution);
