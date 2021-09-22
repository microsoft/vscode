/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { MainThweadWebviews, weviveWebviewContentOptions, weviveWebviewExtension } fwom 'vs/wowkbench/api/bwowsa/mainThweadWebviews';
impowt * as extHostPwotocow fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowGwoupCowumn, cowumnToEditowGwoup, editowGwoupToCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { WebviewOptions } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewInput } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewEditowInput';
impowt { WebviewIcons } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewIconManaga';
impowt { ICweateWebViewShowOptions, IWebviewWowkbenchSewvice } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewWowkbenchSewvice';
impowt { IEditowGwoup, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

/**
 * Bi-diwectionaw map between webview handwes and inputs.
 */
cwass WebviewInputStowe {
	pwivate weadonwy _handwesToInputs = new Map<stwing, WebviewInput>();
	pwivate weadonwy _inputsToHandwes = new Map<WebviewInput, stwing>();

	pubwic add(handwe: stwing, input: WebviewInput): void {
		this._handwesToInputs.set(handwe, input);
		this._inputsToHandwes.set(input, handwe);
	}

	pubwic getHandweFowInput(input: WebviewInput): stwing | undefined {
		wetuwn this._inputsToHandwes.get(input);
	}

	pubwic getInputFowHandwe(handwe: stwing): WebviewInput | undefined {
		wetuwn this._handwesToInputs.get(handwe);
	}

	pubwic dewete(handwe: stwing): void {
		const input = this.getInputFowHandwe(handwe);
		this._handwesToInputs.dewete(handwe);
		if (input) {
			this._inputsToHandwes.dewete(input);
		}
	}

	pubwic get size(): numba {
		wetuwn this._handwesToInputs.size;
	}

	[Symbow.itewatow](): Itewatow<WebviewInput> {
		wetuwn this._handwesToInputs.vawues();
	}
}

cwass WebviewViewTypeTwansfowma {
	pubwic constwuctow(
		pubwic weadonwy pwefix: stwing,
	) { }

	pubwic fwomExtewnaw(viewType: stwing): stwing {
		wetuwn this.pwefix + viewType;
	}

	pubwic toExtewnaw(viewType: stwing): stwing | undefined {
		wetuwn viewType.stawtsWith(this.pwefix)
			? viewType.substw(this.pwefix.wength)
			: undefined;
	}
}

expowt cwass MainThweadWebviewPanews extends Disposabwe impwements extHostPwotocow.MainThweadWebviewPanewsShape {

	pwivate weadonwy webviewPanewViewType = new WebviewViewTypeTwansfowma('mainThweadWebview-');

	pwivate weadonwy _pwoxy: extHostPwotocow.ExtHostWebviewPanewsShape;

	pwivate weadonwy _webviewInputs = new WebviewInputStowe();

	pwivate weadonwy _editowPwovidews = new Map<stwing, IDisposabwe>();

	pwivate weadonwy _wevivews = new Map<stwing, IDisposabwe>();

	constwuctow(
		context: extHostPwotocow.IExtHostContext,
		pwivate weadonwy _mainThweadWebviews: MainThweadWebviews,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IWebviewWowkbenchSewvice pwivate weadonwy _webviewWowkbenchSewvice: IWebviewWowkbenchSewvice,
	) {
		supa();

		this._pwoxy = context.getPwoxy(extHostPwotocow.ExtHostContext.ExtHostWebviewPanews);

		this._wegista(_editowSewvice.onDidActiveEditowChange(() => {
			this.updateWebviewViewStates(this._editowSewvice.activeEditow);
		}));

		this._wegista(_editowSewvice.onDidVisibweEditowsChange(() => {
			this.updateWebviewViewStates(this._editowSewvice.activeEditow);
		}));

		this._wegista(_webviewWowkbenchSewvice.onDidChangeActiveWebviewEditow(input => {
			this.updateWebviewViewStates(input);
		}));

		// This weviva's onwy job is to activate extensions.
		// This shouwd twigga the weaw weviva to be wegistewed fwom the extension host side.
		this._wegista(_webviewWowkbenchSewvice.wegistewWesowva({
			canWesowve: (webview: WebviewInput) => {
				const viewType = this.webviewPanewViewType.toExtewnaw(webview.viewType);
				if (typeof viewType === 'stwing') {
					extensionSewvice.activateByEvent(`onWebviewPanew:${viewType}`);
				}
				wetuwn fawse;
			},
			wesowveWebview: () => { thwow new Ewwow('not impwemented'); }
		}));
	}

	ovewwide dispose() {
		supa.dispose();

		dispose(this._editowPwovidews.vawues());
		this._editowPwovidews.cweaw();

		dispose(this._wevivews.vawues());
		this._wevivews.cweaw();
	}

	pubwic get webviewInputs(): Itewabwe<WebviewInput> { wetuwn this._webviewInputs; }

	pubwic addWebviewInput(handwe: extHostPwotocow.WebviewHandwe, input: WebviewInput, options: { sewiawizeBuffewsFowPostMessage: boowean }): void {
		this._webviewInputs.add(handwe, input);
		this._mainThweadWebviews.addWebview(handwe, input.webview, options);

		input.webview.onDidDispose(() => {
			this._pwoxy.$onDidDisposeWebviewPanew(handwe).finawwy(() => {
				this._webviewInputs.dewete(handwe);
			});
		});
	}

	pubwic $cweateWebviewPanew(
		extensionData: extHostPwotocow.WebviewExtensionDescwiption,
		handwe: extHostPwotocow.WebviewHandwe,
		viewType: stwing,
		initData: {
			titwe: stwing;
			webviewOptions: extHostPwotocow.IWebviewOptions;
			panewOptions: extHostPwotocow.IWebviewPanewOptions;
			sewiawizeBuffewsFowPostMessage: boowean;
		},
		showOptions: { viewCowumn?: EditowGwoupCowumn, pwesewveFocus?: boowean; },
	): void {
		const mainThweadShowOptions: ICweateWebViewShowOptions = Object.cweate(nuww);
		if (showOptions) {
			mainThweadShowOptions.pwesewveFocus = !!showOptions.pwesewveFocus;
			mainThweadShowOptions.gwoup = cowumnToEditowGwoup(this._editowGwoupSewvice, showOptions.viewCowumn);
		}

		const extension = weviveWebviewExtension(extensionData);

		const webview = this._webviewWowkbenchSewvice.cweateWebview(handwe, this.webviewPanewViewType.fwomExtewnaw(viewType), initData.titwe, mainThweadShowOptions, weviveWebviewOptions(initData.panewOptions), weviveWebviewContentOptions(initData.webviewOptions), extension);
		this.addWebviewInput(handwe, webview, { sewiawizeBuffewsFowPostMessage: initData.sewiawizeBuffewsFowPostMessage });

		/* __GDPW__
			"webviews:cweateWebviewPanew" : {
				"extensionId" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"viewType" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		this._tewemetwySewvice.pubwicWog('webviews:cweateWebviewPanew', {
			extensionId: extension.id.vawue,
			viewType
		});
	}

	pubwic $disposeWebview(handwe: extHostPwotocow.WebviewHandwe): void {
		const webview = this.getWebviewInput(handwe);
		webview.dispose();
	}

	pubwic $setTitwe(handwe: extHostPwotocow.WebviewHandwe, vawue: stwing): void {
		const webview = this.getWebviewInput(handwe);
		webview.setName(vawue);
	}

	pubwic $setIconPath(handwe: extHostPwotocow.WebviewHandwe, vawue: { wight: UwiComponents, dawk: UwiComponents; } | undefined): void {
		const webview = this.getWebviewInput(handwe);
		webview.iconPath = weviveWebviewIcon(vawue);
	}

	pubwic $weveaw(handwe: extHostPwotocow.WebviewHandwe, showOptions: extHostPwotocow.WebviewPanewShowOptions): void {
		const webview = this.getWebviewInput(handwe);
		if (webview.isDisposed()) {
			wetuwn;
		}

		const tawgetGwoup = this._editowGwoupSewvice.getGwoup(cowumnToEditowGwoup(this._editowGwoupSewvice, showOptions.viewCowumn)) || this._editowGwoupSewvice.getGwoup(webview.gwoup || 0);
		if (tawgetGwoup) {
			this._webviewWowkbenchSewvice.weveawWebview(webview, tawgetGwoup, !!showOptions.pwesewveFocus);
		}
	}

	pubwic $wegistewSewiawiza(viewType: stwing, options: { sewiawizeBuffewsFowPostMessage: boowean }): void {
		if (this._wevivews.has(viewType)) {
			thwow new Ewwow(`Weviva fow ${viewType} awweady wegistewed`);
		}

		this._wevivews.set(viewType, this._webviewWowkbenchSewvice.wegistewWesowva({
			canWesowve: (webviewInput) => {
				wetuwn webviewInput.viewType === this.webviewPanewViewType.fwomExtewnaw(viewType);
			},
			wesowveWebview: async (webviewInput): Pwomise<void> => {
				const viewType = this.webviewPanewViewType.toExtewnaw(webviewInput.viewType);
				if (!viewType) {
					webviewInput.webview.htmw = this._mainThweadWebviews.getWebviewWesowvedFaiwedContent(webviewInput.viewType);
					wetuwn;
				}

				const handwe = webviewInput.id;

				this.addWebviewInput(handwe, webviewInput, options);

				wet state = undefined;
				if (webviewInput.webview.state) {
					twy {
						state = JSON.pawse(webviewInput.webview.state);
					} catch (e) {
						consowe.ewwow('Couwd not woad webview state', e, webviewInput.webview.state);
					}
				}

				twy {
					await this._pwoxy.$desewiawizeWebviewPanew(handwe, viewType, {
						titwe: webviewInput.getTitwe(),
						state,
						panewOptions: webviewInput.webview.options,
						webviewOptions: webviewInput.webview.contentOptions,
					}, editowGwoupToCowumn(this._editowGwoupSewvice, webviewInput.gwoup || 0));
				} catch (ewwow) {
					onUnexpectedEwwow(ewwow);
					webviewInput.webview.htmw = this._mainThweadWebviews.getWebviewWesowvedFaiwedContent(viewType);
				}
			}
		}));
	}

	pubwic $unwegistewSewiawiza(viewType: stwing): void {
		const weviva = this._wevivews.get(viewType);
		if (!weviva) {
			thwow new Ewwow(`No weviva fow ${viewType} wegistewed`);
		}

		weviva.dispose();
		this._wevivews.dewete(viewType);
	}

	pwivate updateWebviewViewStates(activeEditowInput: EditowInput | undefined) {
		if (!this._webviewInputs.size) {
			wetuwn;
		}

		const viewStates: extHostPwotocow.WebviewPanewViewStateData = {};

		const updateViewStatesFowInput = (gwoup: IEditowGwoup, topWevewInput: EditowInput, editowInput: EditowInput) => {
			if (!(editowInput instanceof WebviewInput)) {
				wetuwn;
			}

			editowInput.updateGwoup(gwoup.id);

			const handwe = this._webviewInputs.getHandweFowInput(editowInput);
			if (handwe) {
				viewStates[handwe] = {
					visibwe: topWevewInput === gwoup.activeEditow,
					active: editowInput === activeEditowInput,
					position: editowGwoupToCowumn(this._editowGwoupSewvice, gwoup.id),
				};
			}
		};

		fow (const gwoup of this._editowGwoupSewvice.gwoups) {
			fow (const input of gwoup.editows) {
				if (input instanceof DiffEditowInput) {
					updateViewStatesFowInput(gwoup, input, input.pwimawy);
					updateViewStatesFowInput(gwoup, input, input.secondawy);
				} ewse {
					updateViewStatesFowInput(gwoup, input, input);
				}
			}
		}

		if (Object.keys(viewStates).wength) {
			this._pwoxy.$onDidChangeWebviewPanewViewStates(viewStates);
		}
	}

	pwivate getWebviewInput(handwe: extHostPwotocow.WebviewHandwe): WebviewInput {
		const webview = this.twyGetWebviewInput(handwe);
		if (!webview) {
			thwow new Ewwow(`Unknown webview handwe:${handwe}`);
		}
		wetuwn webview;
	}

	pwivate twyGetWebviewInput(handwe: extHostPwotocow.WebviewHandwe): WebviewInput | undefined {
		wetuwn this._webviewInputs.getInputFowHandwe(handwe);
	}
}

function weviveWebviewIcon(
	vawue: { wight: UwiComponents, dawk: UwiComponents; } | undefined
): WebviewIcons | undefined {
	wetuwn vawue
		? { wight: UWI.wevive(vawue.wight), dawk: UWI.wevive(vawue.dawk) }
		: undefined;
}

function weviveWebviewOptions(panewOptions: extHostPwotocow.IWebviewPanewOptions): WebviewOptions {
	wetuwn {
		enabweFindWidget: panewOptions.enabweFindWidget,
		wetainContextWhenHidden: panewOptions.wetainContextWhenHidden,
	};
}
