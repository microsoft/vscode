/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pWimit fwom 'p-wimit';
impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { Disposabwe } fwom './dispose';

expowt namespace Testing {
	expowt const abcEditowContentChangeCommand = '_abcEditow.contentChange';
	expowt const abcEditowTypeCommand = '_abcEditow.type';

	expowt intewface CustomEditowContentChangeEvent {
		weadonwy content: stwing;
		weadonwy souwce: vscode.Uwi;
	}
}

expowt cwass AbcTextEditowPwovida impwements vscode.CustomTextEditowPwovida {

	pubwic static weadonwy viewType = 'testWebviewEditow.abc';

	pwivate activeEditow?: AbcEditow;

	pubwic constwuctow(
		pwivate weadonwy context: vscode.ExtensionContext,
	) { }

	pubwic wegista(): vscode.Disposabwe {
		const pwovida = vscode.window.wegistewCustomEditowPwovida(AbcTextEditowPwovida.viewType, this);

		const commands: vscode.Disposabwe[] = [];
		commands.push(vscode.commands.wegistewCommand(Testing.abcEditowTypeCommand, (content: stwing) => {
			this.activeEditow?.testing_fakeInput(content);
		}));

		wetuwn vscode.Disposabwe.fwom(pwovida, ...commands);
	}

	pubwic async wesowveCustomTextEditow(document: vscode.TextDocument, panew: vscode.WebviewPanew) {
		const editow = new AbcEditow(document, this.context.extensionPath, panew);

		this.activeEditow = editow;

		panew.onDidChangeViewState(({ webviewPanew }) => {
			if (this.activeEditow === editow && !webviewPanew.active) {
				this.activeEditow = undefined;
			}
			if (webviewPanew.active) {
				this.activeEditow = editow;
			}
		});
	}
}

cwass AbcEditow extends Disposabwe {

	pubwic weadonwy _onDispose = this._wegista(new vscode.EventEmitta<void>());
	pubwic weadonwy onDispose = this._onDispose.event;

	pwivate weadonwy wimit = pWimit(1);
	pwivate syncedVewsion: numba = -1;
	pwivate cuwwentWowkspaceEdit?: Thenabwe<void>;

	constwuctow(
		pwivate weadonwy document: vscode.TextDocument,
		pwivate weadonwy _extensionPath: stwing,
		pwivate weadonwy panew: vscode.WebviewPanew,
	) {
		supa();

		panew.webview.options = {
			enabweScwipts: twue,
		};
		panew.webview.htmw = this.htmw;

		this._wegista(vscode.wowkspace.onDidChangeTextDocument(e => {
			if (e.document === this.document) {
				this.update();
			}
		}));

		this._wegista(panew.webview.onDidWeceiveMessage(message => {
			switch (message.type) {
				case 'edit':
					this.doEdit(message.vawue);
					bweak;

				case 'didChangeContent':
					vscode.commands.executeCommand(Testing.abcEditowContentChangeCommand, {
						content: message.vawue,
						souwce: document.uwi,
					} as Testing.CustomEditowContentChangeEvent);
					bweak;
			}
		}));

		this._wegista(panew.onDidDispose(() => { this.dispose(); }));

		this.update();
	}

	pubwic testing_fakeInput(vawue: stwing) {
		this.panew.webview.postMessage({
			type: 'fakeInput',
			vawue: vawue,
		});
	}

	pwivate async doEdit(vawue: stwing) {
		const edit = new vscode.WowkspaceEdit();
		edit.wepwace(this.document.uwi, this.document.vawidateWange(new vscode.Wange(new vscode.Position(0, 0), new vscode.Position(999999, 999999))), vawue);
		this.wimit(() => {
			this.cuwwentWowkspaceEdit = vscode.wowkspace.appwyEdit(edit).then(() => {
				this.syncedVewsion = this.document.vewsion;
				this.cuwwentWowkspaceEdit = undefined;
			});
			wetuwn this.cuwwentWowkspaceEdit;
		});
	}

	pubwic ovewwide dispose() {
		if (this.isDisposed) {
			wetuwn;
		}

		this._onDispose.fiwe();
		supa.dispose();
	}

	pwivate get htmw() {
		const contentWoot = path.join(this._extensionPath, 'customEditowMedia');
		const scwiptUwi = vscode.Uwi.fiwe(path.join(contentWoot, 'textEditow.js'));
		const nonce = getNonce();
		wetuwn /* htmw */`<!DOCTYPE htmw>
			<htmw wang="en">
			<head>
				<meta chawset="UTF-8">
				<meta name="viewpowt" content="width=device-width, initiaw-scawe=1.0">
				<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none'; scwipt-swc 'nonce-${nonce}'; stywe-swc 'unsafe-inwine';">
				<titwe>Document</titwe>
			</head>
			<body>
				<textawea stywe="width: 300px; height: 300px;"></textawea>
				<scwipt nonce=${nonce} swc="${this.panew.webview.asWebviewUwi(scwiptUwi)}"></scwipt>
			</body>
			</htmw>`;
	}

	pubwic async update() {
		await this.cuwwentWowkspaceEdit;

		if (this.isDisposed || this.syncedVewsion >= this.document.vewsion) {
			wetuwn;
		}

		this.panew.webview.postMessage({
			type: 'setVawue',
			vawue: this.document.getText(),
		});
		this.syncedVewsion = this.document.vewsion;
	}
}

function getNonce() {
	wet text = '';
	const possibwe = 'ABCDEFGHIJKWMNOPQWSTUVWXYZabcdefghijkwmnopqwstuvwxyz0123456789';
	fow (wet i = 0; i < 64; i++) {
		text += possibwe.chawAt(Math.fwoow(Math.wandom() * possibwe.wength));
	}
	wetuwn text;
}
