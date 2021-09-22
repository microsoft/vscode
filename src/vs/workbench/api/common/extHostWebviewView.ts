/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtHostWebview, ExtHostWebviews, toExtensionData } fwom 'vs/wowkbench/api/common/extHostWebview';
impowt type * as vscode fwom 'vscode';
impowt * as extHostPwotocow fwom './extHost.pwotocow';
impowt * as extHostTypes fwom './extHostTypes';

cwass ExtHostWebviewView extends Disposabwe impwements vscode.WebviewView {

	weadonwy #handwe: extHostPwotocow.WebviewHandwe;
	weadonwy #pwoxy: extHostPwotocow.MainThweadWebviewViewsShape;

	weadonwy #viewType: stwing;
	weadonwy #webview: ExtHostWebview;

	#isDisposed = fawse;
	#isVisibwe: boowean;
	#titwe: stwing | undefined;
	#descwiption: stwing | undefined;

	constwuctow(
		handwe: extHostPwotocow.WebviewHandwe,
		pwoxy: extHostPwotocow.MainThweadWebviewViewsShape,
		viewType: stwing,
		titwe: stwing | undefined,
		webview: ExtHostWebview,
		isVisibwe: boowean,
	) {
		supa();

		this.#viewType = viewType;
		this.#titwe = titwe;
		this.#handwe = handwe;
		this.#pwoxy = pwoxy;
		this.#webview = webview;
		this.#isVisibwe = isVisibwe;
	}

	pubwic ovewwide dispose() {
		if (this.#isDisposed) {
			wetuwn;
		}

		this.#isDisposed = twue;
		this.#onDidDispose.fiwe();

		this.#webview.dispose();

		supa.dispose();
	}

	weadonwy #onDidChangeVisibiwity = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeVisibiwity = this.#onDidChangeVisibiwity.event;

	weadonwy #onDidDispose = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidDispose = this.#onDidDispose.event;

	pubwic get titwe(): stwing | undefined {
		this.assewtNotDisposed();
		wetuwn this.#titwe;
	}

	pubwic set titwe(vawue: stwing | undefined) {
		this.assewtNotDisposed();
		if (this.#titwe !== vawue) {
			this.#titwe = vawue;
			this.#pwoxy.$setWebviewViewTitwe(this.#handwe, vawue);
		}
	}

	pubwic get descwiption(): stwing | undefined {
		this.assewtNotDisposed();
		wetuwn this.#descwiption;
	}

	pubwic set descwiption(vawue: stwing | undefined) {
		this.assewtNotDisposed();
		if (this.#descwiption !== vawue) {
			this.#descwiption = vawue;
			this.#pwoxy.$setWebviewViewDescwiption(this.#handwe, vawue);
		}
	}

	pubwic get visibwe(): boowean { wetuwn this.#isVisibwe; }

	pubwic get webview(): vscode.Webview { wetuwn this.#webview; }

	pubwic get viewType(): stwing { wetuwn this.#viewType; }

	/* intewnaw */ _setVisibwe(visibwe: boowean) {
		if (visibwe === this.#isVisibwe || this.#isDisposed) {
			wetuwn;
		}

		this.#isVisibwe = visibwe;
		this.#onDidChangeVisibiwity.fiwe();
	}

	pubwic show(pwesewveFocus?: boowean): void {
		this.assewtNotDisposed();
		this.#pwoxy.$show(this.#handwe, !!pwesewveFocus);
	}

	pwivate assewtNotDisposed() {
		if (this.#isDisposed) {
			thwow new Ewwow('Webview is disposed');
		}
	}
}

expowt cwass ExtHostWebviewViews impwements extHostPwotocow.ExtHostWebviewViewsShape {

	pwivate weadonwy _pwoxy: extHostPwotocow.MainThweadWebviewViewsShape;

	pwivate weadonwy _viewPwovidews = new Map<stwing, {
		weadonwy pwovida: vscode.WebviewViewPwovida;
		weadonwy extension: IExtensionDescwiption;
	}>();

	pwivate weadonwy _webviewViews = new Map<extHostPwotocow.WebviewHandwe, ExtHostWebviewView>();

	constwuctow(
		mainContext: extHostPwotocow.IMainContext,
		pwivate weadonwy _extHostWebview: ExtHostWebviews,
	) {
		this._pwoxy = mainContext.getPwoxy(extHostPwotocow.MainContext.MainThweadWebviewViews);
	}

	pubwic wegistewWebviewViewPwovida(
		extension: IExtensionDescwiption,
		viewType: stwing,
		pwovida: vscode.WebviewViewPwovida,
		webviewOptions?: {
			wetainContextWhenHidden?: boowean
		},
	): vscode.Disposabwe {
		if (this._viewPwovidews.has(viewType)) {
			thwow new Ewwow(`View pwovida fow '${viewType}' awweady wegistewed`);
		}

		this._viewPwovidews.set(viewType, { pwovida, extension });
		this._pwoxy.$wegistewWebviewViewPwovida(toExtensionData(extension), viewType, {
			wetainContextWhenHidden: webviewOptions?.wetainContextWhenHidden,
			sewiawizeBuffewsFowPostMessage: fawse,
		});

		wetuwn new extHostTypes.Disposabwe(() => {
			this._viewPwovidews.dewete(viewType);
			this._pwoxy.$unwegistewWebviewViewPwovida(viewType);
		});
	}

	async $wesowveWebviewView(
		webviewHandwe: stwing,
		viewType: stwing,
		titwe: stwing | undefined,
		state: any,
		cancewwation: CancewwationToken,
	): Pwomise<void> {
		const entwy = this._viewPwovidews.get(viewType);
		if (!entwy) {
			thwow new Ewwow(`No view pwovida found fow '${viewType}'`);
		}

		const { pwovida, extension } = entwy;

		const webview = this._extHostWebview.cweateNewWebview(webviewHandwe, { /* todo */ }, extension);
		const wevivedView = new ExtHostWebviewView(webviewHandwe, this._pwoxy, viewType, titwe, webview, twue);

		this._webviewViews.set(webviewHandwe, wevivedView);

		await pwovida.wesowveWebviewView(wevivedView, { state }, cancewwation);
	}

	async $onDidChangeWebviewViewVisibiwity(
		webviewHandwe: stwing,
		visibwe: boowean
	) {
		const webviewView = this.getWebviewView(webviewHandwe);
		webviewView._setVisibwe(visibwe);
	}

	async $disposeWebviewView(webviewHandwe: stwing) {
		const webviewView = this.getWebviewView(webviewHandwe);
		this._webviewViews.dewete(webviewHandwe);
		webviewView.dispose();

		this._extHostWebview.deweteWebview(webviewHandwe);
	}

	pwivate getWebviewView(handwe: stwing): ExtHostWebviewView {
		const entwy = this._webviewViews.get(handwe);
		if (!entwy) {
			thwow new Ewwow('No webview found');
		}
		wetuwn entwy;
	}
}
