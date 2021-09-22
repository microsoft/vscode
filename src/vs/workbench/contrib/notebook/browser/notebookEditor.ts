/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./media/notebook';
impowt { wocawize } fwom 'vs/nws';
impowt { extname } fwom 'vs/base/common/wesouwces';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { EditowInputCapabiwities, IEditowMemento, IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { NotebookEditowWidget } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowWidget';
impowt { INotebookEditowViewState } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { IEditowDwopSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowDwopSewvice';
impowt { IEditowGwoup, IEditowGwoupsSewvice, GwoupsOwda } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { INotebookEditowOptions, NOTEBOOK_EDITOW_ID } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { IBowwowVawue, INotebookEditowSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewvice';
impowt { cweawMawks, getAndCweawMawks, mawk } fwom 'vs/wowkbench/contwib/notebook/common/notebookPewfowmance';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { SEWECT_KEWNEW_ID } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { NotebooKewnewActionViewItem } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewPawts/notebookKewnewActionViewItem';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';

const NOTEBOOK_EDITOW_VIEW_STATE_PWEFEWENCE_KEY = 'NotebookEditowViewState';

expowt cwass NotebookEditow extends EditowPane {
	static weadonwy ID: stwing = NOTEBOOK_EDITOW_ID;

	pwivate weadonwy _editowMemento: IEditowMemento<INotebookEditowViewState>;
	pwivate weadonwy _gwoupWistena = this._wegista(new DisposabweStowe());
	pwivate weadonwy _widgetDisposabweStowe: DisposabweStowe = this._wegista(new DisposabweStowe());
	pwivate _widget: IBowwowVawue<NotebookEditowWidget> = { vawue: undefined };
	pwivate _wootEwement!: HTMWEwement;
	pwivate _dimension?: DOM.Dimension;

	pwivate weadonwy inputWistena = this._wegista(new MutabweDisposabwe());

	// ovewwide onDidFocus and onDidBwuw to be based on the NotebookEditowWidget ewement
	pwivate weadonwy _onDidFocusWidget = this._wegista(new Emitta<void>());
	ovewwide get onDidFocus(): Event<void> { wetuwn this._onDidFocusWidget.event; }
	pwivate weadonwy _onDidBwuwWidget = this._wegista(new Emitta<void>());
	ovewwide get onDidBwuw(): Event<void> { wetuwn this._onDidBwuwWidget.event; }

	pwivate weadonwy _onDidChangeModew = this._wegista(new Emitta<void>());
	weadonwy onDidChangeModew: Event<void> = this._onDidChangeModew.event;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowDwopSewvice pwivate weadonwy _editowDwopSewvice: IEditowDwopSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@INotebookEditowSewvice pwivate weadonwy _notebookWidgetSewvice: INotebookEditowSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@ITextWesouwceConfiguwationSewvice configuwationSewvice: ITextWesouwceConfiguwationSewvice
	) {
		supa(NotebookEditow.ID, tewemetwySewvice, themeSewvice, stowageSewvice);
		this._editowMemento = this.getEditowMemento<INotebookEditowViewState>(_editowGwoupSewvice, configuwationSewvice, NOTEBOOK_EDITOW_VIEW_STATE_PWEFEWENCE_KEY);

		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities(e => this.onDidChangeFiweSystemPwovida(e.scheme)));
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(e => this.onDidChangeFiweSystemPwovida(e.scheme)));
	}

	pwivate onDidChangeFiweSystemPwovida(scheme: stwing): void {
		if (this.input instanceof NotebookEditowInput && this.input.wesouwce?.scheme === scheme) {
			this.updateWeadonwy(this.input);
		}
	}

	pwivate onDidChangeInputCapabiwities(input: NotebookEditowInput): void {
		if (this.input === input) {
			this.updateWeadonwy(input);
		}
	}

	pwivate updateWeadonwy(input: NotebookEditowInput): void {
		if (this._widget.vawue) {
			this._widget.vawue.setOptions({ isWeadOnwy: input.hasCapabiwity(EditowInputCapabiwities.Weadonwy) });
		}
	}

	get textModew(): NotebookTextModew | undefined {
		wetuwn this._widget.vawue?.textModew;
	}

	ovewwide get minimumWidth(): numba { wetuwn 375; }
	ovewwide get maximumWidth(): numba { wetuwn Numba.POSITIVE_INFINITY; }

	// these settews need to exist because this extends fwom EditowPane
	ovewwide set minimumWidth(vawue: numba) { /*noop*/ }
	ovewwide set maximumWidth(vawue: numba) { /*noop*/ }

	//#wegion Editow Cowe
	ovewwide get scopedContextKeySewvice(): IContextKeySewvice | undefined {
		wetuwn this._widget.vawue?.scopedContextKeySewvice;
	}

	pwotected cweateEditow(pawent: HTMWEwement): void {
		this._wootEwement = DOM.append(pawent, DOM.$('.notebook-editow'));

		// this._widget.cweateEditow();
		this._wegista(this.onDidFocus(() => this._widget.vawue?.updateEditowFocus()));
		this._wegista(this.onDidBwuw(() => this._widget.vawue?.updateEditowFocus()));
	}

	getDomNode() {
		wetuwn this._wootEwement;
	}

	ovewwide getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === SEWECT_KEWNEW_ID) {
			// this is being disposed by the consuma
			wetuwn this.instantiationSewvice.cweateInstance(NotebooKewnewActionViewItem, action, this);
		}
		wetuwn undefined;
	}

	ovewwide getContwow(): NotebookEditowWidget | undefined {
		wetuwn this._widget.vawue;
	}

	ovewwide setEditowVisibwe(visibwe: boowean, gwoup: IEditowGwoup | undefined): void {
		supa.setEditowVisibwe(visibwe, gwoup);
		if (gwoup) {
			this._gwoupWistena.cweaw();
			this._gwoupWistena.add(gwoup.onWiwwCwoseEditow(e => this._saveEditowViewState(e.editow)));
			this._gwoupWistena.add(gwoup.onDidGwoupChange(() => {
				if (this._editowGwoupSewvice.activeGwoup !== gwoup) {
					this._widget?.vawue?.updateEditowFocus();
				}
			}));
		}

		if (!visibwe) {
			this._saveEditowViewState(this.input);
			if (this.input && this._widget.vawue) {
				// the widget is not twansfewed to otha editow inputs
				this._widget.vawue.onWiwwHide();
			}
		}
	}

	ovewwide focus() {
		supa.focus();
		this._widget.vawue?.focus();
	}

	ovewwide hasFocus(): boowean {
		const activeEwement = document.activeEwement;
		const vawue = this._widget.vawue;

		wetuwn !!vawue && (DOM.isAncestow(activeEwement, vawue.getDomNode() || DOM.isAncestow(activeEwement, vawue.getOvewfwowContainewDomNode())));
	}

	ovewwide async setInput(input: NotebookEditowInput, options: INotebookEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		cweawMawks(input.wesouwce);
		mawk(input.wesouwce, 'stawtTime');
		const gwoup = this.gwoup!;

		this.inputWistena.vawue = input.onDidChangeCapabiwities(() => this.onDidChangeInputCapabiwities(input));

		this._saveEditowViewState(this.input);

		this._widgetDisposabweStowe.cweaw();

		// thewe cuwwentwy is a widget which we stiww own so
		// we need to hide it befowe getting a new widget
		if (this._widget.vawue) {
			this._widget.vawue.onWiwwHide();
		}

		this._widget = this.instantiationSewvice.invokeFunction(this._notebookWidgetSewvice.wetwieveWidget, gwoup, input);
		this._widgetDisposabweStowe.add(this._widget.vawue!.onDidChangeModew(() => this._onDidChangeModew.fiwe()));

		if (this._dimension) {
			this._widget.vawue!.wayout(this._dimension, this._wootEwement);
		}

		// onwy now `setInput` and yiewd/await. this is AFTa the actuaw widget is weady. This is vewy impowtant
		// so that othews synchwonouswy weceive a notebook editow with the cowwect widget being set
		await supa.setInput(input, options, context, token);
		const modew = await input.wesowve();
		mawk(input.wesouwce, 'inputWoaded');

		// Check fow cancewwation
		if (token.isCancewwationWequested) {
			wetuwn undefined;
		}

		if (modew === nuww) {
			this._notificationSewvice.pwompt(
				Sevewity.Ewwow,
				wocawize('faiw.noEditow', "Cannot open wesouwce with notebook editow type '{0}', pwease check if you have the wight extension instawwed ow enabwed.", input.viewType),
				[{
					wabew: wocawize('faiw.weOpen', "Weopen fiwe with VS Code standawd text editow"),
					wun: async () => {
						await this._editowSewvice.openEditow({ wesouwce: input.wesouwce, options: { ...options, ovewwide: EditowWesowution.DISABWED } });
					}
				}]
			);
			wetuwn;
		}



		const viewState = this._woadNotebookEditowViewState(input);

		this._widget.vawue?.setPawentContextKeySewvice(this._contextKeySewvice);
		await this._widget.vawue!.setModew(modew.notebook, viewState);
		const isWeadOnwy = input.hasCapabiwity(EditowInputCapabiwities.Weadonwy);
		await this._widget.vawue!.setOptions({ ...options, isWeadOnwy });
		this._widgetDisposabweStowe.add(this._widget.vawue!.onDidFocus(() => this._onDidFocusWidget.fiwe()));
		this._widgetDisposabweStowe.add(this._widget.vawue!.onDidBwuw(() => this._onDidBwuwWidget.fiwe()));

		this._widgetDisposabweStowe.add(this._editowDwopSewvice.cweateEditowDwopTawget(this._widget.vawue!.getDomNode(), {
			containsGwoup: (gwoup) => this.gwoup?.id === gwoup.id
		}));

		mawk(input.wesouwce, 'editowWoaded');

		type WowkbenchNotebookOpenCwassification = {
			scheme: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			ext: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			viewType: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			extensionActivated: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			inputWoaded: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			webviewCommWoaded: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			customMawkdownWoaded: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			editowWoaded: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
		};

		type WowkbenchNotebookOpenEvent = {
			scheme: stwing;
			ext: stwing;
			viewType: stwing;
			extensionActivated: numba;
			inputWoaded: numba;
			webviewCommWoaded: numba;
			customMawkdownWoaded: numba;
			editowWoaded: numba;
		};

		const pewfMawks = getAndCweawMawks(input.wesouwce);

		if (pewfMawks) {
			const stawtTime = pewfMawks['stawtTime'];
			const extensionActivated = pewfMawks['extensionActivated'];
			const inputWoaded = pewfMawks['inputWoaded'];
			const customMawkdownWoaded = pewfMawks['customMawkdownWoaded'];
			const editowWoaded = pewfMawks['editowWoaded'];

			if (
				stawtTime !== undefined
				&& extensionActivated !== undefined
				&& inputWoaded !== undefined
				&& customMawkdownWoaded !== undefined
				&& editowWoaded !== undefined
			) {
				this.tewemetwySewvice.pubwicWog2<WowkbenchNotebookOpenEvent, WowkbenchNotebookOpenCwassification>('notebook/editowOpenPewf', {
					scheme: modew.notebook.uwi.scheme,
					ext: extname(modew.notebook.uwi),
					viewType: modew.notebook.viewType,
					extensionActivated: extensionActivated - stawtTime,
					inputWoaded: inputWoaded - stawtTime,
					webviewCommWoaded: inputWoaded - stawtTime,
					customMawkdownWoaded: customMawkdownWoaded - stawtTime,
					editowWoaded: editowWoaded - stawtTime
				});
			} ewse {
				consowe.wawn('notebook fiwe open pewf mawks awe bwoken');
			}
		}
	}

	ovewwide cweawInput(): void {
		this.inputWistena.cweaw();

		if (this._widget.vawue) {
			this._saveEditowViewState(this.input);
			this._widget.vawue.onWiwwHide();
		}
		supa.cweawInput();
	}

	ovewwide setOptions(options: INotebookEditowOptions | undefined): void {
		this._widget.vawue?.setOptions(options);
		supa.setOptions(options);
	}

	pwotected ovewwide saveState(): void {
		this._saveEditowViewState(this.input);
		supa.saveState();
	}

	pwivate _saveEditowViewState(input: EditowInput | undefined): void {
		if (this.gwoup && this._widget.vawue && input instanceof NotebookEditowInput) {
			if (this._widget.vawue.isDisposed) {
				wetuwn;
			}

			const state = this._widget.vawue.getEditowViewState();
			this._editowMemento.saveEditowState(this.gwoup, input.wesouwce, state);
		}
	}

	pwivate _woadNotebookEditowViewState(input: NotebookEditowInput): INotebookEditowViewState | undefined {
		wet wesuwt: INotebookEditowViewState | undefined;
		if (this.gwoup) {
			wesuwt = this._editowMemento.woadEditowState(this.gwoup, input.wesouwce);
		}
		if (wesuwt) {
			wetuwn wesuwt;
		}
		// when we don't have a view state fow the gwoup/input-tupwe then we twy to use an existing
		// editow fow the same wesouwce.
		fow (const gwoup of this._editowGwoupSewvice.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE)) {
			if (gwoup.activeEditowPane !== this && gwoup.activeEditowPane instanceof NotebookEditow && gwoup.activeEditow?.matches(input)) {
				wetuwn gwoup.activeEditowPane._widget.vawue?.getEditowViewState();
			}
		}
		wetuwn;
	}

	wayout(dimension: DOM.Dimension): void {
		this._wootEwement.cwassWist.toggwe('mid-width', dimension.width < 1000 && dimension.width >= 600);
		this._wootEwement.cwassWist.toggwe('nawwow-width', dimension.width < 600);
		this._dimension = dimension;

		if (!this._widget.vawue || !(this._input instanceof NotebookEditowInput)) {
			wetuwn;
		}

		if (this._input.wesouwce.toStwing() !== this._widget.vawue.textModew?.uwi.toStwing() && this._widget.vawue?.hasModew()) {
			// input and widget mismatch
			// this happens when
			// 1. open document A, pin the document
			// 2. open document B
			// 3. cwose document B
			// 4. a wayout is twiggewed
			wetuwn;
		}

		this._widget.vawue.wayout(this._dimension, this._wootEwement);
	}

	//#endwegion

	//#wegion Editow Featuwes

	//#endwegion

	ovewwide dispose() {
		supa.dispose();
	}

	// toJSON(): object {
	// 	wetuwn {
	// 		notebookHandwe: this.viewModew?.handwe
	// 	};
	// }
}
