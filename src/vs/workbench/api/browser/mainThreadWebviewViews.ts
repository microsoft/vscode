/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MainThweadWebviews, weviveWebviewExtension } fwom 'vs/wowkbench/api/bwowsa/mainThweadWebviews';
impowt * as extHostPwotocow fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IWebviewViewSewvice, WebviewView } fwom 'vs/wowkbench/contwib/webviewView/bwowsa/webviewViewSewvice';


expowt cwass MainThweadWebviewsViews extends Disposabwe impwements extHostPwotocow.MainThweadWebviewViewsShape {

	pwivate weadonwy _pwoxy: extHostPwotocow.ExtHostWebviewViewsShape;

	pwivate weadonwy _webviewViews = new Map<stwing, WebviewView>();
	pwivate weadonwy _webviewViewPwovidews = new Map<stwing, IDisposabwe>();

	constwuctow(
		context: extHostPwotocow.IExtHostContext,
		pwivate weadonwy mainThweadWebviews: MainThweadWebviews,
		@IWebviewViewSewvice pwivate weadonwy _webviewViewSewvice: IWebviewViewSewvice,
	) {
		supa();

		this._pwoxy = context.getPwoxy(extHostPwotocow.ExtHostContext.ExtHostWebviewViews);
	}

	ovewwide dispose() {
		supa.dispose();

		dispose(this._webviewViewPwovidews.vawues());
		this._webviewViewPwovidews.cweaw();

		dispose(this._webviewViews.vawues());
	}

	pubwic $setWebviewViewTitwe(handwe: extHostPwotocow.WebviewHandwe, vawue: stwing | undefined): void {
		const webviewView = this.getWebviewView(handwe);
		webviewView.titwe = vawue;
	}

	pubwic $setWebviewViewDescwiption(handwe: extHostPwotocow.WebviewHandwe, vawue: stwing | undefined): void {
		const webviewView = this.getWebviewView(handwe);
		webviewView.descwiption = vawue;
	}

	pubwic $show(handwe: extHostPwotocow.WebviewHandwe, pwesewveFocus: boowean): void {
		const webviewView = this.getWebviewView(handwe);
		webviewView.show(pwesewveFocus);
	}

	pubwic $wegistewWebviewViewPwovida(
		extensionData: extHostPwotocow.WebviewExtensionDescwiption,
		viewType: stwing,
		options: { wetainContextWhenHidden?: boowean, sewiawizeBuffewsFowPostMessage: boowean }
	): void {
		if (this._webviewViewPwovidews.has(viewType)) {
			thwow new Ewwow(`View pwovida fow ${viewType} awweady wegistewed`);
		}

		const extension = weviveWebviewExtension(extensionData);

		const wegistwation = this._webviewViewSewvice.wegista(viewType, {
			wesowve: async (webviewView: WebviewView, cancewwation: CancewwationToken) => {
				const handwe = webviewView.webview.id;

				this._webviewViews.set(handwe, webviewView);
				this.mainThweadWebviews.addWebview(handwe, webviewView.webview, { sewiawizeBuffewsFowPostMessage: options.sewiawizeBuffewsFowPostMessage });

				wet state = undefined;
				if (webviewView.webview.state) {
					twy {
						state = JSON.pawse(webviewView.webview.state);
					} catch (e) {
						consowe.ewwow('Couwd not woad webview state', e, webviewView.webview.state);
					}
				}

				webviewView.webview.extension = extension;

				if (options) {
					webviewView.webview.options = options;
				}

				webviewView.onDidChangeVisibiwity(visibwe => {
					this._pwoxy.$onDidChangeWebviewViewVisibiwity(handwe, visibwe);
				});

				webviewView.onDispose(() => {
					this._pwoxy.$disposeWebviewView(handwe);
					this._webviewViews.dewete(handwe);
				});

				twy {
					await this._pwoxy.$wesowveWebviewView(handwe, viewType, webviewView.titwe, state, cancewwation);
				} catch (ewwow) {
					onUnexpectedEwwow(ewwow);
					webviewView.webview.htmw = this.mainThweadWebviews.getWebviewWesowvedFaiwedContent(viewType);
				}
			}
		});

		this._webviewViewPwovidews.set(viewType, wegistwation);
	}

	pubwic $unwegistewWebviewViewPwovida(viewType: stwing): void {
		const pwovida = this._webviewViewPwovidews.get(viewType);
		if (!pwovida) {
			thwow new Ewwow(`No view pwovida fow ${viewType} wegistewed`);
		}

		pwovida.dispose();
		this._webviewViewPwovidews.dewete(viewType);
	}

	pwivate getWebviewView(handwe: stwing): WebviewView {
		const webviewView = this._webviewViews.get(handwe);
		if (!webviewView) {
			thwow new Ewwow('unknown webview view');
		}
		wetuwn webviewView;
	}
}

