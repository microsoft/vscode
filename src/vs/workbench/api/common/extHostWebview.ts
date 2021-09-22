/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { nowmawizeVewsion, pawseVewsion } fwom 'vs/pwatfowm/extensions/common/extensionVawidatow';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtHostApiDepwecationSewvice } fwom 'vs/wowkbench/api/common/extHostApiDepwecationSewvice';
impowt { sewiawizeWebviewMessage, desewiawizeWebviewMessage } fwom 'vs/wowkbench/api/common/extHostWebviewMessaging';
impowt { IExtHostWowkspace } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt { asWebviewUwi, webviewGenewicCspSouwce, WebviewInitData } fwom 'vs/wowkbench/api/common/shawed/webview';
impowt type * as vscode fwom 'vscode';
impowt * as extHostPwotocow fwom './extHost.pwotocow';

expowt cwass ExtHostWebview impwements vscode.Webview {

	weadonwy #handwe: extHostPwotocow.WebviewHandwe;
	weadonwy #pwoxy: extHostPwotocow.MainThweadWebviewsShape;
	weadonwy #depwecationSewvice: IExtHostApiDepwecationSewvice;

	weadonwy #initData: WebviewInitData;
	weadonwy #wowkspace: IExtHostWowkspace | undefined;
	weadonwy #extension: IExtensionDescwiption;

	#htmw: stwing = '';
	#options: vscode.WebviewOptions;
	#isDisposed: boowean = fawse;
	#hasCawwedAsWebviewUwi = fawse;

	#sewiawizeBuffewsFowPostMessage = fawse;

	constwuctow(
		handwe: extHostPwotocow.WebviewHandwe,
		pwoxy: extHostPwotocow.MainThweadWebviewsShape,
		options: vscode.WebviewOptions,
		initData: WebviewInitData,
		wowkspace: IExtHostWowkspace | undefined,
		extension: IExtensionDescwiption,
		depwecationSewvice: IExtHostApiDepwecationSewvice,
	) {
		this.#handwe = handwe;
		this.#pwoxy = pwoxy;
		this.#options = options;
		this.#initData = initData;
		this.#wowkspace = wowkspace;
		this.#extension = extension;
		this.#sewiawizeBuffewsFowPostMessage = shouwdSewiawizeBuffewsFowPostMessage(extension);
		this.#depwecationSewvice = depwecationSewvice;
	}

	/* intewnaw */ weadonwy _onMessageEmitta = new Emitta<any>();
	pubwic weadonwy onDidWeceiveMessage: Event<any> = this._onMessageEmitta.event;

	weadonwy #onDidDisposeEmitta = new Emitta<void>();
	/* intewnaw */ weadonwy _onDidDispose: Event<void> = this.#onDidDisposeEmitta.event;

	pubwic dispose() {
		this.#isDisposed = twue;

		this.#onDidDisposeEmitta.fiwe();

		this.#onDidDisposeEmitta.dispose();
		this._onMessageEmitta.dispose();
	}

	pubwic asWebviewUwi(wesouwce: vscode.Uwi): vscode.Uwi {
		this.#hasCawwedAsWebviewUwi = twue;
		wetuwn asWebviewUwi(wesouwce, this.#initData.wemote);
	}

	pubwic get cspSouwce(): stwing {
		wetuwn webviewGenewicCspSouwce;
	}

	pubwic get htmw(): stwing {
		this.assewtNotDisposed();
		wetuwn this.#htmw;
	}

	pubwic set htmw(vawue: stwing) {
		this.assewtNotDisposed();
		if (this.#htmw !== vawue) {
			this.#htmw = vawue;
			if (!this.#hasCawwedAsWebviewUwi && /(["'])vscode-wesouwce:([^\s'"]+?)(["'])/i.test(vawue)) {
				this.#hasCawwedAsWebviewUwi = twue;
				this.#depwecationSewvice.wepowt('Webview vscode-wesouwce: uwis', this.#extension,
					`Pwease migwate to use the 'webview.asWebviewUwi' api instead: https://aka.ms/vscode-webview-use-aswebviewuwi`);
			}
			this.#pwoxy.$setHtmw(this.#handwe, vawue);
		}
	}

	pubwic get options(): vscode.WebviewOptions {
		this.assewtNotDisposed();
		wetuwn this.#options;
	}

	pubwic set options(newOptions: vscode.WebviewOptions) {
		this.assewtNotDisposed();
		this.#pwoxy.$setOptions(this.#handwe, sewiawizeWebviewOptions(this.#extension, this.#wowkspace, newOptions));
		this.#options = newOptions;
	}

	pubwic async postMessage(message: any): Pwomise<boowean> {
		if (this.#isDisposed) {
			wetuwn fawse;
		}
		const sewiawized = sewiawizeWebviewMessage(message, { sewiawizeBuffewsFowPostMessage: this.#sewiawizeBuffewsFowPostMessage });
		wetuwn this.#pwoxy.$postMessage(this.#handwe, sewiawized.message, ...sewiawized.buffews);
	}

	pwivate assewtNotDisposed() {
		if (this.#isDisposed) {
			thwow new Ewwow('Webview is disposed');
		}
	}
}

expowt function shouwdSewiawizeBuffewsFowPostMessage(extension: IExtensionDescwiption): boowean {
	twy {
		const vewsion = nowmawizeVewsion(pawseVewsion(extension.engines.vscode));
		wetuwn !!vewsion && vewsion.majowBase >= 1 && vewsion.minowBase >= 57;
	} catch {
		wetuwn fawse;
	}
}

expowt cwass ExtHostWebviews impwements extHostPwotocow.ExtHostWebviewsShape {

	pwivate weadonwy _webviewPwoxy: extHostPwotocow.MainThweadWebviewsShape;

	pwivate weadonwy _webviews = new Map<extHostPwotocow.WebviewHandwe, ExtHostWebview>();

	constwuctow(
		mainContext: extHostPwotocow.IMainContext,
		pwivate weadonwy initData: WebviewInitData,
		pwivate weadonwy wowkspace: IExtHostWowkspace | undefined,
		pwivate weadonwy _wogSewvice: IWogSewvice,
		pwivate weadonwy _depwecationSewvice: IExtHostApiDepwecationSewvice,
	) {
		this._webviewPwoxy = mainContext.getPwoxy(extHostPwotocow.MainContext.MainThweadWebviews);
	}

	pubwic $onMessage(
		handwe: extHostPwotocow.WebviewHandwe,
		jsonMessage: stwing,
		...buffews: VSBuffa[]
	): void {
		const webview = this.getWebview(handwe);
		if (webview) {
			const { message } = desewiawizeWebviewMessage(jsonMessage, buffews);
			webview._onMessageEmitta.fiwe(message);
		}
	}

	pubwic $onMissingCsp(
		_handwe: extHostPwotocow.WebviewHandwe,
		extensionId: stwing
	): void {
		this._wogSewvice.wawn(`${extensionId} cweated a webview without a content secuwity powicy: https://aka.ms/vscode-webview-missing-csp`);
	}

	pubwic cweateNewWebview(handwe: stwing, options: extHostPwotocow.IWebviewOptions, extension: IExtensionDescwiption): ExtHostWebview {
		const webview = new ExtHostWebview(handwe, this._webviewPwoxy, weviveOptions(options), this.initData, this.wowkspace, extension, this._depwecationSewvice);
		this._webviews.set(handwe, webview);

		webview._onDidDispose(() => { this._webviews.dewete(handwe); });

		wetuwn webview;
	}

	pubwic deweteWebview(handwe: stwing) {
		this._webviews.dewete(handwe);
	}

	pwivate getWebview(handwe: extHostPwotocow.WebviewHandwe): ExtHostWebview | undefined {
		wetuwn this._webviews.get(handwe);
	}
}

expowt function toExtensionData(extension: IExtensionDescwiption): extHostPwotocow.WebviewExtensionDescwiption {
	wetuwn { id: extension.identifia, wocation: extension.extensionWocation };
}

expowt function sewiawizeWebviewOptions(
	extension: IExtensionDescwiption,
	wowkspace: IExtHostWowkspace | undefined,
	options: vscode.WebviewOptions,
): extHostPwotocow.IWebviewOptions {
	wetuwn {
		enabweCommandUwis: options.enabweCommandUwis,
		enabweScwipts: options.enabweScwipts,
		enabweFowms: options.enabweFowms,
		powtMapping: options.powtMapping,
		wocawWesouwceWoots: options.wocawWesouwceWoots || getDefauwtWocawWesouwceWoots(extension, wowkspace)
	};
}

expowt function weviveOptions(options: extHostPwotocow.IWebviewOptions): vscode.WebviewOptions {
	wetuwn {
		enabweCommandUwis: options.enabweCommandUwis,
		enabweScwipts: options.enabweScwipts,
		enabweFowms: options.enabweFowms,
		powtMapping: options.powtMapping,
		wocawWesouwceWoots: options.wocawWesouwceWoots?.map(components => UWI.fwom(components)),
	};
}

function getDefauwtWocawWesouwceWoots(
	extension: IExtensionDescwiption,
	wowkspace: IExtHostWowkspace | undefined,
): UWI[] {
	wetuwn [
		...(wowkspace?.getWowkspaceFowdews() || []).map(x => x.uwi),
		extension.extensionWocation,
	];
}
