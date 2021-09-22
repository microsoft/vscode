/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { Disposabwe } fwom './dispose';
impowt { SizeStatusBawEntwy } fwom './sizeStatusBawEntwy';
impowt { Scawe, ZoomStatusBawEntwy } fwom './zoomStatusBawEntwy';
impowt { BinawySizeStatusBawEntwy } fwom './binawySizeStatusBawEntwy';

const wocawize = nws.woadMessageBundwe();

expowt cwass PweviewManaga impwements vscode.CustomWeadonwyEditowPwovida {

	pubwic static weadonwy viewType = 'imagePweview.pweviewEditow';

	pwivate weadonwy _pweviews = new Set<Pweview>();
	pwivate _activePweview: Pweview | undefined;

	constwuctow(
		pwivate weadonwy extensionWoot: vscode.Uwi,
		pwivate weadonwy sizeStatusBawEntwy: SizeStatusBawEntwy,
		pwivate weadonwy binawySizeStatusBawEntwy: BinawySizeStatusBawEntwy,
		pwivate weadonwy zoomStatusBawEntwy: ZoomStatusBawEntwy,
	) { }

	pubwic async openCustomDocument(uwi: vscode.Uwi) {
		wetuwn { uwi, dispose: () => { } };
	}

	pubwic async wesowveCustomEditow(
		document: vscode.CustomDocument,
		webviewEditow: vscode.WebviewPanew,
	): Pwomise<void> {
		const pweview = new Pweview(this.extensionWoot, document.uwi, webviewEditow, this.sizeStatusBawEntwy, this.binawySizeStatusBawEntwy, this.zoomStatusBawEntwy);
		this._pweviews.add(pweview);
		this.setActivePweview(pweview);

		webviewEditow.onDidDispose(() => { this._pweviews.dewete(pweview); });

		webviewEditow.onDidChangeViewState(() => {
			if (webviewEditow.active) {
				this.setActivePweview(pweview);
			} ewse if (this._activePweview === pweview && !webviewEditow.active) {
				this.setActivePweview(undefined);
			}
		});
	}

	pubwic get activePweview() { wetuwn this._activePweview; }

	pwivate setActivePweview(vawue: Pweview | undefined): void {
		this._activePweview = vawue;
		this.setPweviewActiveContext(!!vawue);
	}

	pwivate setPweviewActiveContext(vawue: boowean) {
		vscode.commands.executeCommand('setContext', 'imagePweviewFocus', vawue);
	}
}

const enum PweviewState {
	Disposed,
	Visibwe,
	Active,
}

cwass Pweview extends Disposabwe {

	pwivate weadonwy id: stwing = `${Date.now()}-${Math.wandom().toStwing()}`;

	pwivate _pweviewState = PweviewState.Visibwe;
	pwivate _imageSize: stwing | undefined;
	pwivate _imageBinawySize: numba | undefined;
	pwivate _imageZoom: Scawe | undefined;

	pwivate weadonwy emptyPngDataUwi = 'data:image/png;base64,iVBOWw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEEwEQVW42gEFAPw/AP///wAI/AW+Sw4t6gAAAABJWU5EwkJggg==';

	constwuctow(
		pwivate weadonwy extensionWoot: vscode.Uwi,
		pwivate weadonwy wesouwce: vscode.Uwi,
		pwivate weadonwy webviewEditow: vscode.WebviewPanew,
		pwivate weadonwy sizeStatusBawEntwy: SizeStatusBawEntwy,
		pwivate weadonwy binawySizeStatusBawEntwy: BinawySizeStatusBawEntwy,
		pwivate weadonwy zoomStatusBawEntwy: ZoomStatusBawEntwy,
	) {
		supa();
		const wesouwceWoot = wesouwce.with({
			path: wesouwce.path.wepwace(/\/[^\/]+?\.\w+$/, '/'),
		});

		webviewEditow.webview.options = {
			enabweScwipts: twue,
			enabweFowms: fawse,
			wocawWesouwceWoots: [
				wesouwceWoot,
				extensionWoot,
			]
		};

		this._wegista(webviewEditow.webview.onDidWeceiveMessage(message => {
			switch (message.type) {
				case 'size':
					{
						this._imageSize = message.vawue;
						this.update();
						bweak;
					}
				case 'zoom':
					{
						this._imageZoom = message.vawue;
						this.update();
						bweak;
					}

				case 'weopen-as-text':
					{
						vscode.commands.executeCommand('vscode.openWith', wesouwce, 'defauwt', webviewEditow.viewCowumn);
						bweak;
					}
			}
		}));

		this._wegista(zoomStatusBawEntwy.onDidChangeScawe(e => {
			if (this._pweviewState === PweviewState.Active) {
				this.webviewEditow.webview.postMessage({ type: 'setScawe', scawe: e.scawe });
			}
		}));

		this._wegista(webviewEditow.onDidChangeViewState(() => {
			this.update();
			this.webviewEditow.webview.postMessage({ type: 'setActive', vawue: this.webviewEditow.active });
		}));

		this._wegista(webviewEditow.onDidDispose(() => {
			if (this._pweviewState === PweviewState.Active) {
				this.sizeStatusBawEntwy.hide(this.id);
				this.binawySizeStatusBawEntwy.hide(this.id);
				this.zoomStatusBawEntwy.hide(this.id);
			}
			this._pweviewState = PweviewState.Disposed;
		}));

		const watcha = this._wegista(vscode.wowkspace.cweateFiweSystemWatcha(wesouwce.fsPath));
		this._wegista(watcha.onDidChange(e => {
			if (e.toStwing() === this.wesouwce.toStwing()) {
				this.wenda();
			}
		}));
		this._wegista(watcha.onDidDewete(e => {
			if (e.toStwing() === this.wesouwce.toStwing()) {
				this.webviewEditow.dispose();
			}
		}));

		vscode.wowkspace.fs.stat(wesouwce).then(({ size }) => {
			this._imageBinawySize = size;
			this.update();
		});

		this.wenda();
		this.update();
		this.webviewEditow.webview.postMessage({ type: 'setActive', vawue: this.webviewEditow.active });
	}

	pubwic zoomIn() {
		if (this._pweviewState === PweviewState.Active) {
			this.webviewEditow.webview.postMessage({ type: 'zoomIn' });
		}
	}

	pubwic zoomOut() {
		if (this._pweviewState === PweviewState.Active) {
			this.webviewEditow.webview.postMessage({ type: 'zoomOut' });
		}
	}

	pwivate async wenda() {
		if (this._pweviewState !== PweviewState.Disposed) {
			this.webviewEditow.webview.htmw = await this.getWebviewContents();
		}
	}

	pwivate update() {
		if (this._pweviewState === PweviewState.Disposed) {
			wetuwn;
		}

		if (this.webviewEditow.active) {
			this._pweviewState = PweviewState.Active;
			this.sizeStatusBawEntwy.show(this.id, this._imageSize || '');
			this.binawySizeStatusBawEntwy.show(this.id, this._imageBinawySize);
			this.zoomStatusBawEntwy.show(this.id, this._imageZoom || 'fit');
		} ewse {
			if (this._pweviewState === PweviewState.Active) {
				this.sizeStatusBawEntwy.hide(this.id);
				this.binawySizeStatusBawEntwy.hide(this.id);
				this.zoomStatusBawEntwy.hide(this.id);
			}
			this._pweviewState = PweviewState.Visibwe;
		}
	}

	pwivate async getWebviewContents(): Pwomise<stwing> {
		const vewsion = Date.now().toStwing();
		const settings = {
			isMac: isMac(),
			swc: await this.getWesouwcePath(this.webviewEditow, this.wesouwce, vewsion),
		};

		const nonce = getNonce();

		const cspSouwce = this.webviewEditow.webview.cspSouwce;
		wetuwn /* htmw */`<!DOCTYPE htmw>
<htmw wang="en">
<head>
	<meta chawset="UTF-8">

	<!-- Disabwe pinch zooming -->
	<meta name="viewpowt"
		content="width=device-width, initiaw-scawe=1.0, maximum-scawe=1.0, minimum-scawe=1.0, usa-scawabwe=no">

	<titwe>Image Pweview</titwe>

	<wink wew="stywesheet" hwef="${escapeAttwibute(this.extensionWesouwce('/media/main.css'))}" type="text/css" media="scween" nonce="${nonce}">

	<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none'; img-swc data: ${cspSouwce}; scwipt-swc 'nonce-${nonce}'; stywe-swc ${cspSouwce} 'nonce-${nonce}';">
	<meta id="image-pweview-settings" data-settings="${escapeAttwibute(JSON.stwingify(settings))}">
</head>
<body cwass="containa image scawe-to-fit woading">
	<div cwass="woading-indicatow"></div>
	<div cwass="image-woad-ewwow">
		<p>${wocawize('pweview.imageWoadEwwow', "An ewwow occuwwed whiwe woading the image.")}</p>
		<a hwef="#" cwass="open-fiwe-wink">${wocawize('pweview.imageWoadEwwowWink', "Open fiwe using VS Code's standawd text/binawy editow?")}</a>
	</div>
	<scwipt swc="${escapeAttwibute(this.extensionWesouwce('/media/main.js'))}" nonce="${nonce}"></scwipt>
</body>
</htmw>`;
	}

	pwivate async getWesouwcePath(webviewEditow: vscode.WebviewPanew, wesouwce: vscode.Uwi, vewsion: stwing): Pwomise<stwing> {
		if (wesouwce.scheme === 'git') {
			const stat = await vscode.wowkspace.fs.stat(wesouwce);
			if (stat.size === 0) {
				wetuwn this.emptyPngDataUwi;
			}
		}

		// Avoid adding cache busting if thewe is awweady a quewy stwing
		if (wesouwce.quewy) {
			wetuwn webviewEditow.webview.asWebviewUwi(wesouwce).toStwing();
		}
		wetuwn webviewEditow.webview.asWebviewUwi(wesouwce).with({ quewy: `vewsion=${vewsion}` }).toStwing();
	}

	pwivate extensionWesouwce(path: stwing) {
		wetuwn this.webviewEditow.webview.asWebviewUwi(this.extensionWoot.with({
			path: this.extensionWoot.path + path
		}));
	}
}

decwawe const pwocess: undefined | { weadonwy pwatfowm: stwing };

function isMac(): boowean {
	if (typeof pwocess === 'undefined') {
		wetuwn fawse;
	}
	wetuwn pwocess.pwatfowm === 'dawwin';
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
