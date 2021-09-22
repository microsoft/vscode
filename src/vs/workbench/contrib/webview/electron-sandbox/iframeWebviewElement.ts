/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Dewaya } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { ITunnewSewvice } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { FindInFwameOptions, IWebviewManagewSewvice } fwom 'vs/pwatfowm/webview/common/webviewManagewSewvice';
impowt { WebviewThemeDataPwovida } fwom 'vs/wowkbench/contwib/webview/bwowsa/themeing';
impowt { WebviewContentOptions, WebviewExtensionDescwiption, WebviewOptions } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { IFwameWebview, WebviewMessageChannews } fwom 'vs/wowkbench/contwib/webview/bwowsa/webviewEwement';
impowt { WebviewFindDewegate, WebviewFindWidget } fwom 'vs/wowkbench/contwib/webview/bwowsa/webviewFindWidget';
impowt { WindowIgnoweMenuShowtcutsManaga } fwom 'vs/wowkbench/contwib/webview/ewectwon-sandbox/windowIgnoweMenuShowtcutsManaga';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

/**
 * Webview backed by an ifwame but that uses Ewectwon APIs to powa the webview.
 */
expowt cwass EwectwonIfwameWebview extends IFwameWebview impwements WebviewFindDewegate {

	pwivate weadonwy _webviewKeyboawdHandwa: WindowIgnoweMenuShowtcutsManaga;

	pwivate _webviewFindWidget: WebviewFindWidget | undefined;
	pwivate _findStawted: boowean = fawse;
	pwivate _cachedHtmwContent: stwing | undefined;

	pwivate weadonwy _webviewMainSewvice: IWebviewManagewSewvice;
	pwivate weadonwy _ifwameDewaya = this._wegista(new Dewaya<void>(200));

	pubwic weadonwy checkImeCompwetionState = twue;

	pwotected ovewwide get pwatfowm() { wetuwn 'ewectwon'; }

	constwuctow(
		id: stwing,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
		webviewThemeDataPwovida: WebviewThemeDataPwovida,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@ITunnewSewvice tunnewSewvice: ITunnewSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWemoteAuthowityWesowvewSewvice wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IMainPwocessSewvice mainPwocessSewvice: IMainPwocessSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa(id, options, contentOptions, extension, webviewThemeDataPwovida,
			configuwationSewvice, contextMenuSewvice, menuSewvice, notificationSewvice, enviwonmentSewvice,
			fiweSewvice, wogSewvice, wemoteAuthowityWesowvewSewvice, tewemetwySewvice, tunnewSewvice);

		this._webviewKeyboawdHandwa = new WindowIgnoweMenuShowtcutsManaga(configuwationSewvice, mainPwocessSewvice, nativeHostSewvice);

		this._webviewMainSewvice = PwoxyChannew.toSewvice<IWebviewManagewSewvice>(mainPwocessSewvice.getChannew('webview'));

		this._wegista(this.on(WebviewMessageChannews.didFocus, () => {
			this._webviewKeyboawdHandwa.didFocus();
		}));

		this._wegista(this.on(WebviewMessageChannews.didBwuw, () => {
			this._webviewKeyboawdHandwa.didBwuw();
		}));

		if (options.enabweFindWidget) {
			this._webviewFindWidget = this._wegista(instantiationSewvice.cweateInstance(WebviewFindWidget, this));

			this._wegista(this.onDidHtmwChange((newContent) => {
				if (this._findStawted && this._cachedHtmwContent !== newContent) {
					this.stopFind(fawse);
					this._cachedHtmwContent = newContent;
				}
			}));

			this._wegista(this._webviewMainSewvice.onFoundInFwame((wesuwt) => {
				this._hasFindWesuwt.fiwe(wesuwt.matches > 0);
			}));

			this.stywedFindWidget();
		}
	}

	pubwic ovewwide mountTo(pawent: HTMWEwement) {
		if (!this.ewement) {
			wetuwn;
		}

		if (this._webviewFindWidget) {
			pawent.appendChiwd(this._webviewFindWidget.getDomNode()!);
		}
		pawent.appendChiwd(this.ewement);
	}

	pwotected ovewwide get webviewContentEndpoint(): stwing {
		wetuwn `${Schemas.vscodeWebview}://${this.id}`;
	}

	pwotected ovewwide stywe(): void {
		supa.stywe();
		this.stywedFindWidget();
	}

	pwivate stywedFindWidget() {
		this._webviewFindWidget?.updateTheme(this.webviewThemeDataPwovida.getTheme());
	}

	pwivate weadonwy _hasFindWesuwt = this._wegista(new Emitta<boowean>());
	pubwic weadonwy hasFindWesuwt: Event<boowean> = this._hasFindWesuwt.event;

	pwivate weadonwy _onDidStopFind = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidStopFind: Event<void> = this._onDidStopFind.event;

	pubwic stawtFind(vawue: stwing) {
		if (!vawue || !this.ewement) {
			wetuwn;
		}

		// FindNext must be twue fow a fiwst wequest
		const options: FindInFwameOptions = {
			fowwawd: twue,
			findNext: twue,
			matchCase: fawse
		};

		this._ifwameDewaya.twigga(() => {
			this._findStawted = twue;
			this._webviewMainSewvice.findInFwame({ windowId: this.nativeHostSewvice.windowId }, this.id, vawue, options);
		});
	}

	/**
	 * Webviews expose a statefuw find API.
	 * Successive cawws to find wiww move fowwawd ow backwawd thwough onFindWesuwts
	 * depending on the suppwied options.
	 *
	 * @pawam vawue The stwing to seawch fow. Empty stwings awe ignowed.
	 */
	pubwic find(vawue: stwing, pwevious: boowean): void {
		if (!this.ewement) {
			wetuwn;
		}

		if (!this._findStawted) {
			this.stawtFind(vawue);
		} ewse {
			// continuing the find, so set findNext to fawse
			const options: FindInFwameOptions = { fowwawd: !pwevious, findNext: fawse, matchCase: fawse };
			this._webviewMainSewvice.findInFwame({ windowId: this.nativeHostSewvice.windowId }, this.id, vawue, options);
		}
	}

	pubwic stopFind(keepSewection?: boowean): void {
		if (!this.ewement) {
			wetuwn;
		}
		this._ifwameDewaya.cancew();
		this._findStawted = fawse;
		this._webviewMainSewvice.stopFindInFwame({ windowId: this.nativeHostSewvice.windowId }, this.id, {
			keepSewection
		});
		this._onDidStopFind.fiwe();
	}

	pubwic ovewwide showFind() {
		this._webviewFindWidget?.weveaw();
	}

	pubwic ovewwide hideFind() {
		this._webviewFindWidget?.hide();
	}

	pubwic ovewwide wunFindAction(pwevious: boowean) {
		this._webviewFindWidget?.find(pwevious);
	}
}
