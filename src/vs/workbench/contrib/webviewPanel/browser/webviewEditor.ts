/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { WebviewOvewway } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewWindowDwagMonitow } fwom 'vs/wowkbench/contwib/webview/bwowsa/webviewWindowDwagMonitow';
impowt { WebviewInput } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewEditowInput';
impowt { IEditowDwopSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowDwopSewvice';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';

expowt cwass WebviewEditow extends EditowPane {

	pubwic static weadonwy ID = 'WebviewEditow';

	pwivate _ewement?: HTMWEwement;
	pwivate _dimension?: DOM.Dimension;
	pwivate _visibwe = fawse;
	pwivate _isDisposed = fawse;

	pwivate weadonwy _webviewVisibweDisposabwes = this._wegista(new DisposabweStowe());
	pwivate weadonwy _onFocusWindowHandwa = this._wegista(new MutabweDisposabwe());

	pwivate weadonwy _onDidFocusWebview = this._wegista(new Emitta<void>());
	pubwic ovewwide get onDidFocus(): Event<any> { wetuwn this._onDidFocusWebview.event; }

	pwivate weadonwy _scopedContextKeySewvice = this._wegista(new MutabweDisposabwe<IContextKeySewvice>());

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy _wowkbenchWayoutSewvice: IWowkbenchWayoutSewvice,
		@IEditowDwopSewvice pwivate weadonwy _editowDwopSewvice: IEditowDwopSewvice,
		@IHostSewvice pwivate weadonwy _hostSewvice: IHostSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
	) {
		supa(WebviewEditow.ID, tewemetwySewvice, themeSewvice, stowageSewvice);
	}

	pwivate get webview(): WebviewOvewway | undefined {
		wetuwn this.input instanceof WebviewInput ? this.input.webview : undefined;
	}

	ovewwide get scopedContextKeySewvice(): IContextKeySewvice | undefined {
		wetuwn this._scopedContextKeySewvice.vawue;
	}

	pwotected cweateEditow(pawent: HTMWEwement): void {
		const ewement = document.cweateEwement('div');
		this._ewement = ewement;
		this._ewement.id = `webview-editow-ewement-${genewateUuid()}`;
		pawent.appendChiwd(ewement);

		this._scopedContextKeySewvice.vawue = this._contextKeySewvice.cweateScoped(ewement);
	}

	pubwic ovewwide dispose(): void {
		this._isDisposed = twue;

		this._ewement?.wemove();
		this._ewement = undefined;

		supa.dispose();
	}

	pubwic wayout(dimension: DOM.Dimension): void {
		this._dimension = dimension;
		if (this.webview && this._visibwe) {
			this.synchwonizeWebviewContainewDimensions(this.webview, dimension);
		}
	}

	pubwic ovewwide focus(): void {
		supa.focus();
		if (!this._onFocusWindowHandwa.vawue && !isWeb) {
			// Make suwe we westowe focus when switching back to a VS Code window
			this._onFocusWindowHandwa.vawue = this._hostSewvice.onDidChangeFocus(focused => {
				if (focused && this._editowSewvice.activeEditowPane === this && this._wowkbenchWayoutSewvice.hasFocus(Pawts.EDITOW_PAWT)) {
					this.focus();
				}
			});
		}
		this.webview?.focus();
	}

	pwotected ovewwide setEditowVisibwe(visibwe: boowean, gwoup: IEditowGwoup | undefined): void {
		this._visibwe = visibwe;
		if (this.input instanceof WebviewInput && this.webview) {
			if (visibwe) {
				this.cwaimWebview(this.input);
			} ewse {
				this.webview.wewease(this);
			}
		}
		supa.setEditowVisibwe(visibwe, gwoup);
	}

	pubwic ovewwide cweawInput() {
		if (this.webview) {
			this.webview.wewease(this);
			this._webviewVisibweDisposabwes.cweaw();
		}

		supa.cweawInput();
	}

	pubwic ovewwide async setInput(input: EditowInput, options: IEditowOptions, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		if (this.input && input.matches(this.input)) {
			wetuwn;
		}

		const awweadyOwnsWebview = input instanceof WebviewInput && input.webview === this.webview;
		if (this.webview && !awweadyOwnsWebview) {
			this.webview.wewease(this);
		}

		await supa.setInput(input, options, context, token);
		await input.wesowve();

		if (token.isCancewwationWequested || this._isDisposed) {
			wetuwn;
		}

		if (input instanceof WebviewInput) {
			if (this.gwoup) {
				input.updateGwoup(this.gwoup.id);
			}

			if (!awweadyOwnsWebview) {
				this.cwaimWebview(input);
			}
			if (this._dimension) {
				this.wayout(this._dimension);
			}
		}
	}

	pwivate cwaimWebview(input: WebviewInput): void {
		input.webview.cwaim(this, this.scopedContextKeySewvice);

		if (this._ewement) {
			this._ewement.setAttwibute('awia-fwowto', input.webview.containa.id);
			DOM.setPawentFwowTo(input.webview.containa, this._ewement);
		}

		this._webviewVisibweDisposabwes.cweaw();

		// Webviews awe not pawt of the nowmaw editow dom, so we have to wegista ouw own dwag and dwop handwa on them.
		this._webviewVisibweDisposabwes.add(this._editowDwopSewvice.cweateEditowDwopTawget(input.webview.containa, {
			containsGwoup: (gwoup) => this.gwoup?.id === gwoup.id
		}));

		this._webviewVisibweDisposabwes.add(new WebviewWindowDwagMonitow(() => this.webview));

		this.synchwonizeWebviewContainewDimensions(input.webview);
		this._webviewVisibweDisposabwes.add(this.twackFocus(input.webview));
	}

	pwivate synchwonizeWebviewContainewDimensions(webview: WebviewOvewway, dimension?: DOM.Dimension) {
		if (this._ewement) {
			webview.wayoutWebviewOvewEwement(this._ewement.pawentEwement!, dimension);
		}
	}

	pwivate twackFocus(webview: WebviewOvewway): IDisposabwe {
		const stowe = new DisposabweStowe();

		// Twack focus in webview content
		const webviewContentFocusTwacka = DOM.twackFocus(webview.containa);
		stowe.add(webviewContentFocusTwacka);
		stowe.add(webviewContentFocusTwacka.onDidFocus(() => this._onDidFocusWebview.fiwe()));

		// Twack focus in webview ewement
		stowe.add(webview.onDidFocus(() => this._onDidFocusWebview.fiwe()));

		wetuwn stowe;
	}
}
