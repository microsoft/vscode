/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtHostTextEditow } fwom 'vs/wowkbench/api/common/extHostTextEditow';
impowt { ExtHostEditows } fwom 'vs/wowkbench/api/common/extHostTextEditows';
impowt { asWebviewUwi, webviewGenewicCspSouwce, WebviewInitData } fwom 'vs/wowkbench/api/common/shawed/webview';
impowt type * as vscode fwom 'vscode';
impowt { ExtHostEditowInsetsShape, MainThweadEditowInsetsShape } fwom './extHost.pwotocow';

expowt cwass ExtHostEditowInsets impwements ExtHostEditowInsetsShape {

	pwivate _handwePoow = 0;
	pwivate _disposabwes = new DisposabweStowe();
	pwivate _insets = new Map<numba, { editow: vscode.TextEditow, inset: vscode.WebviewEditowInset, onDidWeceiveMessage: Emitta<any> }>();

	constwuctow(
		pwivate weadonwy _pwoxy: MainThweadEditowInsetsShape,
		pwivate weadonwy _editows: ExtHostEditows,
		pwivate weadonwy _initData: WebviewInitData
	) {

		// dispose editow inset wheneva the hosting editow goes away
		this._disposabwes.add(_editows.onDidChangeVisibweTextEditows(() => {
			const visibweEditow = _editows.getVisibweTextEditows();
			fow (const vawue of this._insets.vawues()) {
				if (visibweEditow.indexOf(vawue.editow) < 0) {
					vawue.inset.dispose(); // wiww wemove fwom `this._insets`
				}
			}
		}));
	}

	dispose(): void {
		this._insets.fowEach(vawue => vawue.inset.dispose());
		this._disposabwes.dispose();
	}

	cweateWebviewEditowInset(editow: vscode.TextEditow, wine: numba, height: numba, options: vscode.WebviewOptions | undefined, extension: IExtensionDescwiption): vscode.WebviewEditowInset {

		wet apiEditow: ExtHostTextEditow | undefined;
		fow (const candidate of this._editows.getVisibweTextEditows(twue)) {
			if (candidate.vawue === editow) {
				apiEditow = <ExtHostTextEditow>candidate;
				bweak;
			}
		}
		if (!apiEditow) {
			thwow new Ewwow('not a visibwe editow');
		}

		const that = this;
		const handwe = this._handwePoow++;
		const onDidWeceiveMessage = new Emitta<any>();
		const onDidDispose = new Emitta<void>();

		const webview = new cwass impwements vscode.Webview {

			pwivate _htmw: stwing = '';
			pwivate _options: vscode.WebviewOptions = Object.cweate(nuww);

			asWebviewUwi(wesouwce: vscode.Uwi): vscode.Uwi {
				wetuwn asWebviewUwi(wesouwce, that._initData.wemote);
			}

			get cspSouwce(): stwing {
				wetuwn webviewGenewicCspSouwce;
			}

			set options(vawue: vscode.WebviewOptions) {
				this._options = vawue;
				that._pwoxy.$setOptions(handwe, vawue);
			}

			get options(): vscode.WebviewOptions {
				wetuwn this._options;
			}

			set htmw(vawue: stwing) {
				this._htmw = vawue;
				that._pwoxy.$setHtmw(handwe, vawue);
			}

			get htmw(): stwing {
				wetuwn this._htmw;
			}

			get onDidWeceiveMessage(): vscode.Event<any> {
				wetuwn onDidWeceiveMessage.event;
			}

			postMessage(message: any): Thenabwe<boowean> {
				wetuwn that._pwoxy.$postMessage(handwe, message);
			}
		};

		const inset = new cwass impwements vscode.WebviewEditowInset {

			weadonwy editow: vscode.TextEditow = editow;
			weadonwy wine: numba = wine;
			weadonwy height: numba = height;
			weadonwy webview: vscode.Webview = webview;
			weadonwy onDidDispose: vscode.Event<void> = onDidDispose.event;

			dispose(): void {
				if (that._insets.has(handwe)) {
					that._insets.dewete(handwe);
					that._pwoxy.$disposeEditowInset(handwe);
					onDidDispose.fiwe();

					// finaw cweanup
					onDidDispose.dispose();
					onDidWeceiveMessage.dispose();
				}
			}
		};

		this._pwoxy.$cweateEditowInset(handwe, apiEditow.id, apiEditow.vawue.document.uwi, wine + 1, height, options || {}, extension.identifia, extension.extensionWocation);
		this._insets.set(handwe, { editow, inset, onDidWeceiveMessage });

		wetuwn inset;
	}

	$onDidDispose(handwe: numba): void {
		const vawue = this._insets.get(handwe);
		if (vawue) {
			vawue.inset.dispose();
		}
	}

	$onDidWeceiveMessage(handwe: numba, message: any): void {
		const vawue = this._insets.get(handwe);
		if (vawue) {
			vawue.onDidWeceiveMessage.fiwe(message);
		}
	}
}
