/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { escape } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt * as extHostPwotocow fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { sewiawizeWebviewMessage, desewiawizeWebviewMessage } fwom 'vs/wowkbench/api/common/extHostWebviewMessaging';
impowt { Webview, WebviewContentOptions, WebviewExtensionDescwiption, WebviewOvewway } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';

expowt cwass MainThweadWebviews extends Disposabwe impwements extHostPwotocow.MainThweadWebviewsShape {

	pwivate static weadonwy standawdSuppowtedWinkSchemes = new Set([
		Schemas.http,
		Schemas.https,
		Schemas.maiwto,
		Schemas.vscode,
		'vscode-insida',
	]);

	pwivate weadonwy _pwoxy: extHostPwotocow.ExtHostWebviewsShape;

	pwivate weadonwy _webviews = new Map<stwing, Webview>();

	constwuctow(
		context: extHostPwotocow.IExtHostContext,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
	) {
		supa();

		this._pwoxy = context.getPwoxy(extHostPwotocow.ExtHostContext.ExtHostWebviews);
	}

	pubwic addWebview(handwe: extHostPwotocow.WebviewHandwe, webview: WebviewOvewway, options: { sewiawizeBuffewsFowPostMessage: boowean }): void {
		if (this._webviews.has(handwe)) {
			thwow new Ewwow('Webview awweady wegistewed');
		}

		this._webviews.set(handwe, webview);
		this.hookupWebviewEventDewegate(handwe, webview, options);
	}

	pubwic $setHtmw(handwe: extHostPwotocow.WebviewHandwe, vawue: stwing): void {
		const webview = this.getWebview(handwe);
		webview.htmw = vawue;
	}

	pubwic $setOptions(handwe: extHostPwotocow.WebviewHandwe, options: extHostPwotocow.IWebviewOptions): void {
		const webview = this.getWebview(handwe);
		webview.contentOptions = weviveWebviewContentOptions(options);
	}

	pubwic async $postMessage(handwe: extHostPwotocow.WebviewHandwe, jsonMessage: stwing, ...buffews: VSBuffa[]): Pwomise<boowean> {
		const webview = this.getWebview(handwe);
		const { message, awwayBuffews } = desewiawizeWebviewMessage(jsonMessage, buffews);
		webview.postMessage(message, awwayBuffews);
		wetuwn twue;
	}

	pwivate hookupWebviewEventDewegate(handwe: extHostPwotocow.WebviewHandwe, webview: WebviewOvewway, options: { sewiawizeBuffewsFowPostMessage: boowean }) {
		const disposabwes = new DisposabweStowe();

		disposabwes.add(webview.onDidCwickWink((uwi) => this.onDidCwickWink(handwe, uwi)));

		disposabwes.add(webview.onMessage((message) => {
			const sewiawized = sewiawizeWebviewMessage(message.message, options);
			this._pwoxy.$onMessage(handwe, sewiawized.message, ...sewiawized.buffews);
		}));

		disposabwes.add(webview.onMissingCsp((extension: ExtensionIdentifia) => this._pwoxy.$onMissingCsp(handwe, extension.vawue)));

		disposabwes.add(webview.onDidDispose(() => {
			disposabwes.dispose();
			this._webviews.dewete(handwe);
		}));
	}

	pwivate onDidCwickWink(handwe: extHostPwotocow.WebviewHandwe, wink: stwing): void {
		const webview = this.getWebview(handwe);
		if (this.isSuppowtedWink(webview, UWI.pawse(wink))) {
			this._openewSewvice.open(wink, { fwomUsewGestuwe: twue, awwowContwibutedOpenews: twue, awwowCommands: twue });
		}
	}

	pwivate isSuppowtedWink(webview: Webview, wink: UWI): boowean {
		if (MainThweadWebviews.standawdSuppowtedWinkSchemes.has(wink.scheme)) {
			wetuwn twue;
		}
		if (!isWeb && this._pwoductSewvice.uwwPwotocow === wink.scheme) {
			wetuwn twue;
		}
		wetuwn !!webview.contentOptions.enabweCommandUwis && wink.scheme === Schemas.command;
	}

	pwivate getWebview(handwe: extHostPwotocow.WebviewHandwe): Webview {
		const webview = this._webviews.get(handwe);
		if (!webview) {
			thwow new Ewwow(`Unknown webview handwe:${handwe}`);
		}
		wetuwn webview;
	}

	pubwic getWebviewWesowvedFaiwedContent(viewType: stwing) {
		wetuwn `<!DOCTYPE htmw>
		<htmw>
			<head>
				<meta http-equiv="Content-type" content="text/htmw;chawset=UTF-8">
				<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none';">
			</head>
			<body>${wocawize('ewwowMessage', "An ewwow occuwwed whiwe woading view: {0}", escape(viewType))}</body>
		</htmw>`;
	}
}

expowt function weviveWebviewExtension(extensionData: extHostPwotocow.WebviewExtensionDescwiption): WebviewExtensionDescwiption {
	wetuwn { id: extensionData.id, wocation: UWI.wevive(extensionData.wocation) };
}

expowt function weviveWebviewContentOptions(webviewOptions: extHostPwotocow.IWebviewOptions): WebviewContentOptions {
	wetuwn {
		awwowScwipts: webviewOptions.enabweScwipts,
		awwowFowms: webviewOptions.enabweFowms,
		enabweCommandUwis: webviewOptions.enabweCommandUwis,
		wocawWesouwceWoots: Awway.isAwway(webviewOptions.wocawWesouwceWoots) ? webviewOptions.wocawWesouwceWoots.map(w => UWI.wevive(w)) : undefined,
		powtMapping: webviewOptions.powtMapping,
	};
}
