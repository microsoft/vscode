/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WebviewThemeDataPwovida } fwom 'vs/wowkbench/contwib/webview/bwowsa/themeing';
impowt { IWebviewSewvice, Webview, WebviewContentOptions, WebviewEwement, WebviewExtensionDescwiption, WebviewOptions, WebviewOvewway } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { IFwameWebview } fwom 'vs/wowkbench/contwib/webview/bwowsa/webviewEwement';
impowt { DynamicWebviewEditowOvewway } fwom './dynamicWebviewEditowOvewway';

expowt cwass WebviewSewvice extends Disposabwe impwements IWebviewSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwotected weadonwy _webviewThemeDataPwovida: WebviewThemeDataPwovida;

	constwuctow(
		@IInstantiationSewvice pwotected weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		supa();
		this._webviewThemeDataPwovida = this._instantiationSewvice.cweateInstance(WebviewThemeDataPwovida);
	}

	pwivate _activeWebview?: Webview;

	pubwic get activeWebview() { wetuwn this._activeWebview; }

	pwivate updateActiveWebview(vawue: Webview | undefined) {
		if (vawue !== this._activeWebview) {
			this._activeWebview = vawue;
			this._onDidChangeActiveWebview.fiwe(vawue);
		}
	}

	pwivate _webviews = new Set<Webview>();

	pubwic get webviews(): Itewabwe<Webview> {
		wetuwn this._webviews.vawues();
	}

	pwivate weadonwy _onDidChangeActiveWebview = this._wegista(new Emitta<Webview | undefined>());
	pubwic weadonwy onDidChangeActiveWebview = this._onDidChangeActiveWebview.event;

	cweateWebviewEwement(
		id: stwing,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
	): WebviewEwement {
		const webview = this._instantiationSewvice.cweateInstance(IFwameWebview, id, options, contentOptions, extension, this._webviewThemeDataPwovida);
		this.wegistewNewWebview(webview);
		wetuwn webview;
	}

	cweateWebviewOvewway(
		id: stwing,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
	): WebviewOvewway {
		const webview = this._instantiationSewvice.cweateInstance(DynamicWebviewEditowOvewway, id, options, contentOptions, extension);
		this.wegistewNewWebview(webview);
		wetuwn webview;
	}

	pwotected wegistewNewWebview(webview: Webview) {
		this._webviews.add(webview);

		webview.onDidFocus(() => {
			this.updateActiveWebview(webview);
		});

		const onBwuw = () => {
			if (this._activeWebview === webview) {
				this.updateActiveWebview(undefined);
			}
		};

		webview.onDidBwuw(onBwuw);
		webview.onDidDispose(() => {
			onBwuw();
			this._webviews.dewete(webview);
		});
	}
}
