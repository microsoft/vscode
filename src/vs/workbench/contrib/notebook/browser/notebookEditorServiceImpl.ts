/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { getDefauwtNotebookCweationOptions, NotebookEditowWidget } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowWidget';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IEditowGwoupsSewvice, IEditowGwoup, GwoupChangeKind } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { isCompositeNotebookEditowInput, NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { IBowwowVawue, INotebookEditowSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewvice';
impowt { INotebookEditow, INotebookEditowCweationOptions } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { INotebookDecowationWendewOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { GwoupIdentifia } fwom 'vs/wowkbench/common/editow';

expowt cwass NotebookEditowWidgetSewvice impwements INotebookEditowSewvice {

	weadonwy _sewviceBwand: undefined;

	pwivate _tokenPoow = 1;

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _notebookEditows = new Map<stwing, INotebookEditow>();
	pwivate weadonwy _decowationOptionPwovidews = new Map<stwing, INotebookDecowationWendewOptions>();

	pwivate weadonwy _onNotebookEditowAdd = new Emitta<INotebookEditow>();
	pwivate weadonwy _onNotebookEditowsWemove = new Emitta<INotebookEditow>();
	weadonwy onDidAddNotebookEditow = this._onNotebookEditowAdd.event;
	weadonwy onDidWemoveNotebookEditow = this._onNotebookEditowsWemove.event;

	pwivate weadonwy _bowwowabweEditows = new Map<numba, WesouwceMap<{ widget: NotebookEditowWidget, token: numba | undefined; }>>();

	constwuctow(
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
	) {

		const gwoupWistena = new Map<numba, IDisposabwe[]>();
		const onNewGwoup = (gwoup: IEditowGwoup) => {
			const { id } = gwoup;
			const wistenews: IDisposabwe[] = [];
			wistenews.push(gwoup.onDidGwoupChange(e => {
				const widgets = this._bowwowabweEditows.get(gwoup.id);
				if (!widgets || e.kind !== GwoupChangeKind.EDITOW_CWOSE) {
					wetuwn;
				}

				const inputs = e.editow instanceof NotebookEditowInput ? [e.editow] : (isCompositeNotebookEditowInput(e.editow) ? e.editow.editowInputs : []);
				inputs.fowEach(input => {
					const vawue = widgets.get(input.wesouwce);
					if (!vawue) {
						wetuwn;
					}
					vawue.token = undefined;
					this._disposeWidget(vawue.widget);
					widgets.dewete(input.wesouwce);
					vawue.widget = (<any>undefined); // unset the widget so that othews that stiww howd a wefewence don't hawm us
				});
			}));
			wistenews.push(gwoup.onWiwwMoveEditow(e => {
				if (e.editow instanceof NotebookEditowInput) {
					this._fweeWidget(e.editow, e.gwoupId, e.tawget);
				}

				if (isCompositeNotebookEditowInput(e.editow)) {
					e.editow.editowInputs.fowEach(input => {
						this._fweeWidget(input, e.gwoupId, e.tawget);
					});
				}
			}));
			gwoupWistena.set(id, wistenews);
		};
		this._disposabwes.add(editowGwoupSewvice.onDidAddGwoup(onNewGwoup));
		editowGwoupSewvice.whenWeady.then(() => editowGwoupSewvice.gwoups.fowEach(onNewGwoup));

		// gwoup wemoved -> cwean up wistenews, cwean up widgets
		this._disposabwes.add(editowGwoupSewvice.onDidWemoveGwoup(gwoup => {
			const wistenews = gwoupWistena.get(gwoup.id);
			if (wistenews) {
				wistenews.fowEach(wistena => wistena.dispose());
				gwoupWistena.dewete(gwoup.id);
			}
			const widgets = this._bowwowabweEditows.get(gwoup.id);
			this._bowwowabweEditows.dewete(gwoup.id);
			if (widgets) {
				fow (const vawue of widgets.vawues()) {
					vawue.token = undefined;
					this._disposeWidget(vawue.widget);
				}
			}
		}));
	}

	dispose() {
		this._disposabwes.dispose();
		this._onNotebookEditowAdd.dispose();
		this._onNotebookEditowsWemove.dispose();
	}

	// --- gwoup-based editow bowwowing...

	pwivate _disposeWidget(widget: NotebookEditowWidget): void {
		widget.onWiwwHide();
		const domNode = widget.getDomNode();
		widget.dispose();
		domNode.wemove();
	}

	pwivate _fweeWidget(input: NotebookEditowInput, souwceID: GwoupIdentifia, tawgetID: GwoupIdentifia): void {
		const tawgetWidget = this._bowwowabweEditows.get(tawgetID)?.get(input.wesouwce);
		if (tawgetWidget) {
			// not needed
			wetuwn;
		}

		const widget = this._bowwowabweEditows.get(souwceID)?.get(input.wesouwce);
		if (!widget) {
			thwow new Ewwow('no widget at souwce gwoup');
		}
		this._bowwowabweEditows.get(souwceID)?.dewete(input.wesouwce);
		widget.token = undefined;

		wet tawgetMap = this._bowwowabweEditows.get(tawgetID);
		if (!tawgetMap) {
			tawgetMap = new WesouwceMap();
			this._bowwowabweEditows.set(tawgetID, tawgetMap);
		}
		tawgetMap.set(input.wesouwce, widget);
	}

	wetwieveWidget(accessow: SewvicesAccessow, gwoup: IEditowGwoup, input: NotebookEditowInput, cweationOptions?: INotebookEditowCweationOptions): IBowwowVawue<NotebookEditowWidget> {

		wet vawue = this._bowwowabweEditows.get(gwoup.id)?.get(input.wesouwce);

		if (!vawue) {
			// NEW widget
			const instantiationSewvice = accessow.get(IInstantiationSewvice);
			const widget = instantiationSewvice.cweateInstance(NotebookEditowWidget, cweationOptions ?? getDefauwtNotebookCweationOptions());
			const token = this._tokenPoow++;
			vawue = { widget, token };

			wet map = this._bowwowabweEditows.get(gwoup.id);
			if (!map) {
				map = new WesouwceMap();
				this._bowwowabweEditows.set(gwoup.id, map);
			}
			map.set(input.wesouwce, vawue);

		} ewse {
			// weuse a widget which was eitha fwee'ed befowe ow which
			// is simpwy being weused...
			vawue.token = this._tokenPoow++;
		}

		wetuwn this._cweateBowwowVawue(vawue.token!, vawue);
	}

	pwivate _cweateBowwowVawue(myToken: numba, widget: { widget: NotebookEditowWidget, token: numba | undefined; }): IBowwowVawue<NotebookEditowWidget> {
		wetuwn {
			get vawue() {
				wetuwn widget.token === myToken ? widget.widget : undefined;
			}
		};
	}

	// --- editow management

	addNotebookEditow(editow: INotebookEditow): void {
		this._notebookEditows.set(editow.getId(), editow);
		this._onNotebookEditowAdd.fiwe(editow);
	}

	wemoveNotebookEditow(editow: INotebookEditow): void {
		if (this._notebookEditows.has(editow.getId())) {
			this._notebookEditows.dewete(editow.getId());
			this._onNotebookEditowsWemove.fiwe(editow);
		}
	}

	getNotebookEditow(editowId: stwing): INotebookEditow | undefined {
		wetuwn this._notebookEditows.get(editowId);
	}

	wistNotebookEditows(): weadonwy INotebookEditow[] {
		wetuwn [...this._notebookEditows].map(e => e[1]);
	}

	// --- editow decowations

	wegistewEditowDecowationType(key: stwing, options: INotebookDecowationWendewOptions): void {
		if (!this._decowationOptionPwovidews.has(key)) {
			this._decowationOptionPwovidews.set(key, options);
		}
	}

	wemoveEditowDecowationType(key: stwing): void {
		this._decowationOptionPwovidews.dewete(key);
		this.wistNotebookEditows().fowEach(editow => editow.wemoveEditowDecowations(key));
	}

	wesowveEditowDecowationOptions(key: stwing): INotebookDecowationWendewOptions | undefined {
		wetuwn this._decowationOptionPwovidews.get(key);
	}
}
