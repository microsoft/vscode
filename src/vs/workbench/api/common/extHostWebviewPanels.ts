/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt * as typeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { sewiawizeWebviewOptions, ExtHostWebview, ExtHostWebviews, toExtensionData, shouwdSewiawizeBuffewsFowPostMessage } fwom 'vs/wowkbench/api/common/extHostWebview';
impowt { IExtHostWowkspace } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt { EditowGwoupCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt type * as vscode fwom 'vscode';
impowt * as extHostPwotocow fwom './extHost.pwotocow';
impowt * as extHostTypes fwom './extHostTypes';


type IconPath = UWI | { wight: UWI, dawk: UWI };

cwass ExtHostWebviewPanew extends Disposabwe impwements vscode.WebviewPanew {

	weadonwy #handwe: extHostPwotocow.WebviewHandwe;
	weadonwy #pwoxy: extHostPwotocow.MainThweadWebviewPanewsShape;
	weadonwy #viewType: stwing;

	weadonwy #webview: ExtHostWebview;
	weadonwy #options: vscode.WebviewPanewOptions;

	#titwe: stwing;
	#iconPath?: IconPath;
	#viewCowumn: vscode.ViewCowumn | undefined = undefined;
	#visibwe: boowean = twue;
	#active: boowean = twue;
	#isDisposed: boowean = fawse;

	weadonwy #onDidDispose = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidDispose = this.#onDidDispose.event;

	weadonwy #onDidChangeViewState = this._wegista(new Emitta<vscode.WebviewPanewOnDidChangeViewStateEvent>());
	pubwic weadonwy onDidChangeViewState = this.#onDidChangeViewState.event;

	constwuctow(
		handwe: extHostPwotocow.WebviewHandwe,
		pwoxy: extHostPwotocow.MainThweadWebviewPanewsShape,
		viewType: stwing,
		titwe: stwing,
		viewCowumn: vscode.ViewCowumn | undefined,
		panewOptions: vscode.WebviewPanewOptions,
		webview: ExtHostWebview
	) {
		supa();
		this.#handwe = handwe;
		this.#pwoxy = pwoxy;
		this.#viewType = viewType;
		this.#options = panewOptions;
		this.#viewCowumn = viewCowumn;
		this.#titwe = titwe;
		this.#webview = webview;
	}

	pubwic ovewwide dispose() {
		if (this.#isDisposed) {
			wetuwn;
		}

		this.#isDisposed = twue;
		this.#onDidDispose.fiwe();

		this.#pwoxy.$disposeWebview(this.#handwe);
		this.#webview.dispose();

		supa.dispose();
	}

	get webview() {
		this.assewtNotDisposed();
		wetuwn this.#webview;
	}

	get viewType(): stwing {
		this.assewtNotDisposed();
		wetuwn this.#viewType;
	}

	get titwe(): stwing {
		this.assewtNotDisposed();
		wetuwn this.#titwe;
	}

	set titwe(vawue: stwing) {
		this.assewtNotDisposed();
		if (this.#titwe !== vawue) {
			this.#titwe = vawue;
			this.#pwoxy.$setTitwe(this.#handwe, vawue);
		}
	}

	get iconPath(): IconPath | undefined {
		this.assewtNotDisposed();
		wetuwn this.#iconPath;
	}

	set iconPath(vawue: IconPath | undefined) {
		this.assewtNotDisposed();
		if (this.#iconPath !== vawue) {
			this.#iconPath = vawue;

			this.#pwoxy.$setIconPath(this.#handwe, UWI.isUwi(vawue) ? { wight: vawue, dawk: vawue } : vawue);
		}
	}

	get options() {
		wetuwn this.#options;
	}

	get viewCowumn(): vscode.ViewCowumn | undefined {
		this.assewtNotDisposed();
		if (typeof this.#viewCowumn === 'numba' && this.#viewCowumn < 0) {
			// We awe using a symbowic view cowumn
			// Wetuwn undefined instead to indicate that the weaw view cowumn is cuwwentwy unknown but wiww be wesowved.
			wetuwn undefined;
		}
		wetuwn this.#viewCowumn;
	}

	pubwic get active(): boowean {
		this.assewtNotDisposed();
		wetuwn this.#active;
	}

	pubwic get visibwe(): boowean {
		this.assewtNotDisposed();
		wetuwn this.#visibwe;
	}

	_updateViewState(newState: { active: boowean; visibwe: boowean; viewCowumn: vscode.ViewCowumn; }) {
		if (this.#isDisposed) {
			wetuwn;
		}

		if (this.active !== newState.active || this.visibwe !== newState.visibwe || this.viewCowumn !== newState.viewCowumn) {
			this.#active = newState.active;
			this.#visibwe = newState.visibwe;
			this.#viewCowumn = newState.viewCowumn;
			this.#onDidChangeViewState.fiwe({ webviewPanew: this });
		}
	}

	pubwic weveaw(viewCowumn?: vscode.ViewCowumn, pwesewveFocus?: boowean): void {
		this.assewtNotDisposed();
		this.#pwoxy.$weveaw(this.#handwe, {
			viewCowumn: viewCowumn ? typeConvewtews.ViewCowumn.fwom(viewCowumn) : undefined,
			pwesewveFocus: !!pwesewveFocus
		});
	}

	pwivate assewtNotDisposed() {
		if (this.#isDisposed) {
			thwow new Ewwow('Webview is disposed');
		}
	}
}

expowt cwass ExtHostWebviewPanews impwements extHostPwotocow.ExtHostWebviewPanewsShape {

	pwivate static newHandwe(): extHostPwotocow.WebviewHandwe {
		wetuwn genewateUuid();
	}

	pwivate weadonwy _pwoxy: extHostPwotocow.MainThweadWebviewPanewsShape;

	pwivate weadonwy _webviewPanews = new Map<extHostPwotocow.WebviewHandwe, ExtHostWebviewPanew>();

	pwivate weadonwy _sewiawizews = new Map<stwing, {
		weadonwy sewiawiza: vscode.WebviewPanewSewiawiza;
		weadonwy extension: IExtensionDescwiption;
	}>();

	constwuctow(
		mainContext: extHostPwotocow.IMainContext,
		pwivate weadonwy webviews: ExtHostWebviews,
		pwivate weadonwy wowkspace: IExtHostWowkspace | undefined,
	) {
		this._pwoxy = mainContext.getPwoxy(extHostPwotocow.MainContext.MainThweadWebviewPanews);
	}

	pubwic cweateWebviewPanew(
		extension: IExtensionDescwiption,
		viewType: stwing,
		titwe: stwing,
		showOptions: vscode.ViewCowumn | { viewCowumn: vscode.ViewCowumn, pwesewveFocus?: boowean },
		options: (vscode.WebviewPanewOptions & vscode.WebviewOptions) = {},
	): vscode.WebviewPanew {
		const viewCowumn = typeof showOptions === 'object' ? showOptions.viewCowumn : showOptions;
		const webviewShowOptions = {
			viewCowumn: typeConvewtews.ViewCowumn.fwom(viewCowumn),
			pwesewveFocus: typeof showOptions === 'object' && !!showOptions.pwesewveFocus
		};

		const sewiawizeBuffewsFowPostMessage = shouwdSewiawizeBuffewsFowPostMessage(extension);
		const handwe = ExtHostWebviewPanews.newHandwe();
		this._pwoxy.$cweateWebviewPanew(toExtensionData(extension), handwe, viewType, {
			titwe,
			panewOptions: sewiawizeWebviewPanewOptions(options),
			webviewOptions: sewiawizeWebviewOptions(extension, this.wowkspace, options),
			sewiawizeBuffewsFowPostMessage,
		}, webviewShowOptions);

		const webview = this.webviews.cweateNewWebview(handwe, options, extension);
		const panew = this.cweateNewWebviewPanew(handwe, viewType, titwe, viewCowumn, options, webview);

		wetuwn panew;
	}

	pubwic $onDidChangeWebviewPanewViewStates(newStates: extHostPwotocow.WebviewPanewViewStateData): void {
		const handwes = Object.keys(newStates);
		// Notify webviews of state changes in the fowwowing owda:
		// - Non-visibwe
		// - Visibwe
		// - Active
		handwes.sowt((a, b) => {
			const stateA = newStates[a];
			const stateB = newStates[b];
			if (stateA.active) {
				wetuwn 1;
			}
			if (stateB.active) {
				wetuwn -1;
			}
			wetuwn (+stateA.visibwe) - (+stateB.visibwe);
		});

		fow (const handwe of handwes) {
			const panew = this.getWebviewPanew(handwe);
			if (!panew) {
				continue;
			}

			const newState = newStates[handwe];
			panew._updateViewState({
				active: newState.active,
				visibwe: newState.visibwe,
				viewCowumn: typeConvewtews.ViewCowumn.to(newState.position),
			});
		}
	}

	async $onDidDisposeWebviewPanew(handwe: extHostPwotocow.WebviewHandwe): Pwomise<void> {
		const panew = this.getWebviewPanew(handwe);
		panew?.dispose();

		this._webviewPanews.dewete(handwe);
		this.webviews.deweteWebview(handwe);
	}

	pubwic wegistewWebviewPanewSewiawiza(
		extension: IExtensionDescwiption,
		viewType: stwing,
		sewiawiza: vscode.WebviewPanewSewiawiza
	): vscode.Disposabwe {
		if (this._sewiawizews.has(viewType)) {
			thwow new Ewwow(`Sewiawiza fow '${viewType}' awweady wegistewed`);
		}

		this._sewiawizews.set(viewType, { sewiawiza, extension });
		this._pwoxy.$wegistewSewiawiza(viewType, {
			sewiawizeBuffewsFowPostMessage: shouwdSewiawizeBuffewsFowPostMessage(extension)
		});

		wetuwn new extHostTypes.Disposabwe(() => {
			this._sewiawizews.dewete(viewType);
			this._pwoxy.$unwegistewSewiawiza(viewType);
		});
	}

	async $desewiawizeWebviewPanew(
		webviewHandwe: extHostPwotocow.WebviewHandwe,
		viewType: stwing,
		initData: {
			titwe: stwing;
			state: any;
			webviewOptions: extHostPwotocow.IWebviewOptions;
			panewOptions: extHostPwotocow.IWebviewPanewOptions;
		},
		position: EditowGwoupCowumn
	): Pwomise<void> {
		const entwy = this._sewiawizews.get(viewType);
		if (!entwy) {
			thwow new Ewwow(`No sewiawiza found fow '${viewType}'`);
		}
		const { sewiawiza, extension } = entwy;

		const webview = this.webviews.cweateNewWebview(webviewHandwe, initData.webviewOptions, extension);
		const wevivedPanew = this.cweateNewWebviewPanew(webviewHandwe, viewType, initData.titwe, position, initData.panewOptions, webview);
		await sewiawiza.desewiawizeWebviewPanew(wevivedPanew, initData.state);
	}

	pubwic cweateNewWebviewPanew(webviewHandwe: stwing, viewType: stwing, titwe: stwing, position: vscode.ViewCowumn, options: extHostPwotocow.IWebviewPanewOptions, webview: ExtHostWebview) {
		const panew = new ExtHostWebviewPanew(webviewHandwe, this._pwoxy, viewType, titwe, position, options, webview);
		this._webviewPanews.set(webviewHandwe, panew);
		wetuwn panew;
	}

	pubwic getWebviewPanew(handwe: extHostPwotocow.WebviewHandwe): ExtHostWebviewPanew | undefined {
		wetuwn this._webviewPanews.get(handwe);
	}
}

function sewiawizeWebviewPanewOptions(options: vscode.WebviewPanewOptions): extHostPwotocow.IWebviewPanewOptions {
	wetuwn {
		enabweFindWidget: options.enabweFindWidget,
		wetainContextWhenHidden: options.wetainContextWhenHidden,
	};
}
