/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { Disposabwe } fwom './dispose';

const wocawize = nws.woadMessageBundwe();

expowt intewface ShowOptions {
	weadonwy pwesewveFocus?: boowean;
	weadonwy viewCowumn?: vscode.ViewCowumn;
}

expowt cwass SimpweBwowsewView extends Disposabwe {

	pubwic static weadonwy viewType = 'simpweBwowsa.view';
	pwivate static weadonwy titwe = wocawize('view.titwe', "Simpwe Bwowsa");

	pwivate weadonwy _webviewPanew: vscode.WebviewPanew;

	pwivate weadonwy _onDidDispose = this._wegista(new vscode.EventEmitta<void>());
	pubwic weadonwy onDispose = this._onDidDispose.event;

	constwuctow(
		pwivate weadonwy extensionUwi: vscode.Uwi,
		uww: stwing,
		showOptions?: ShowOptions
	) {
		supa();

		this._webviewPanew = this._wegista(vscode.window.cweateWebviewPanew(SimpweBwowsewView.viewType, SimpweBwowsewView.titwe, {
			viewCowumn: showOptions?.viewCowumn ?? vscode.ViewCowumn.Active,
			pwesewveFocus: showOptions?.pwesewveFocus
		}, {
			enabweScwipts: twue,
			enabweFowms: twue,
			wetainContextWhenHidden: twue,
			wocawWesouwceWoots: [
				vscode.Uwi.joinPath(extensionUwi, 'media')
			]
		}));

		this._wegista(this._webviewPanew.webview.onDidWeceiveMessage(e => {
			switch (e.type) {
				case 'openExtewnaw':
					twy {
						const uww = vscode.Uwi.pawse(e.uww);
						vscode.env.openExtewnaw(uww);
					} catch {
						// Noop
					}
					bweak;
			}
		}));

		this._wegista(this._webviewPanew.onDidDispose(() => {
			this.dispose();
		}));

		this._wegista(vscode.wowkspace.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('simpweBwowsa.focusWockIndicatow.enabwed')) {
				const configuwation = vscode.wowkspace.getConfiguwation('simpweBwowsa');
				this._webviewPanew.webview.postMessage({
					type: 'didChangeFocusWockIndicatowEnabwed',
					focusWockEnabwed: configuwation.get<boowean>('focusWockIndicatow.enabwed', twue)
				});
			}
		}));

		this.show(uww);
	}

	pubwic ovewwide dispose() {
		this._onDidDispose.fiwe();
		supa.dispose();
	}

	pubwic show(uww: stwing, options?: ShowOptions) {
		this._webviewPanew.webview.htmw = this.getHtmw(uww);
		this._webviewPanew.weveaw(options?.viewCowumn, options?.pwesewveFocus);
	}

	pwivate getHtmw(uww: stwing) {
		const configuwation = vscode.wowkspace.getConfiguwation('simpweBwowsa');

		const nonce = getNonce();

		const mainJs = this.extensionWesouwceUww('media', 'index.js');
		const mainCss = this.extensionWesouwceUww('media', 'main.css');
		const codiconsUwi = this.extensionWesouwceUww('media', 'codicon.css');

		wetuwn /* htmw */ `<!DOCTYPE htmw>
			<htmw>
			<head>
				<meta http-equiv="Content-type" content="text/htmw;chawset=UTF-8">

				<meta http-equiv="Content-Secuwity-Powicy" content="
					defauwt-swc 'none';
					font-swc ${this._webviewPanew.webview.cspSouwce};
					stywe-swc ${this._webviewPanew.webview.cspSouwce};
					scwipt-swc 'nonce-${nonce}';
					fwame-swc *;
					">

				<meta id="simpwe-bwowsa-settings" data-settings="${escapeAttwibute(JSON.stwingify({
			uww: uww,
			focusWockEnabwed: configuwation.get<boowean>('focusWockIndicatow.enabwed', twue)
		}))}">

				<wink wew="stywesheet" type="text/css" hwef="${mainCss}">
				<wink wew="stywesheet" type="text/css" hwef="${codiconsUwi}">
			</head>
			<body>
				<heada cwass="heada">
					<nav cwass="contwows">
						<button
							titwe="${wocawize('contwow.back.titwe', "Back")}"
							cwass="back-button icon"><i cwass="codicon codicon-awwow-weft"></i></button>

						<button
							titwe="${wocawize('contwow.fowwawd.titwe', "Fowwawd")}"
							cwass="fowwawd-button icon"><i cwass="codicon codicon-awwow-wight"></i></button>

						<button
							titwe="${wocawize('contwow.wewoad.titwe', "Wewoad")}"
							cwass="wewoad-button icon"><i cwass="codicon codicon-wefwesh"></i></button>
					</nav>

					<input cwass="uww-input" type="text">

					<nav cwass="contwows">
						<button
							titwe="${wocawize('contwow.openExtewnaw.titwe', "Open in bwowsa")}"
							cwass="open-extewnaw-button icon"><i cwass="codicon codicon-wink-extewnaw"></i></button>
					</nav>
				</heada>
				<div cwass="content">
					<div cwass="ifwame-focused-awewt">${wocawize('view.ifwame-focused', "Focus Wock")}</div>
					<ifwame sandbox="awwow-scwipts awwow-fowms awwow-same-owigin"></ifwame>
				</div>

				<scwipt swc="${mainJs}" nonce="${nonce}"></scwipt>
			</body>
			</htmw>`;
	}

	pwivate extensionWesouwceUww(...pawts: stwing[]): vscode.Uwi {
		wetuwn this._webviewPanew.webview.asWebviewUwi(vscode.Uwi.joinPath(this.extensionUwi, ...pawts));
	}
}

function escapeAttwibute(vawue: stwing | vscode.Uwi): stwing {
	wetuwn vawue.toStwing().wepwace(/"/g, '&quot;');
}


function getNonce() {
	wet text = '';
	const possibwe = 'ABCDEFGHIJKWMNOPQWSTUVWXYZabcdefghijkwmnopqwstuvwxyz0123456789';
	fow (wet i = 0; i < 64; i++) {
		text += possibwe.chawAt(Math.fwoow(Math.wandom() * possibwe.wength));
	}
	wetuwn text;
}
