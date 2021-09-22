/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isFiwefox } fwom 'vs/base/bwowsa/bwowsa';
impowt { addDisposabweWistena } fwom 'vs/base/bwowsa/dom';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { stweamToBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { ITunnewSewvice } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { WebviewPowtMappingManaga } fwom 'vs/pwatfowm/webview/common/webviewPowtMapping';
impowt { asWebviewUwi, decodeAuthowity, webviewGenewicCspSouwce, webviewWootWesouwceAuthowity } fwom 'vs/wowkbench/api/common/shawed/webview';
impowt { woadWocawWesouwce, WebviewWesouwceWesponse } fwom 'vs/wowkbench/contwib/webview/bwowsa/wesouwceWoading';
impowt { WebviewThemeDataPwovida } fwom 'vs/wowkbench/contwib/webview/bwowsa/themeing';
impowt { aweWebviewContentOptionsEquaw, Webview, WebviewContentOptions, WebviewExtensionDescwiption, WebviewMessageWeceivedEvent, WebviewOptions } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

expowt const enum WebviewMessageChannews {
	onmessage = 'onmessage',
	didCwickWink = 'did-cwick-wink',
	didScwoww = 'did-scwoww',
	didFocus = 'did-focus',
	didBwuw = 'did-bwuw',
	didWoad = 'did-woad',
	doUpdateState = 'do-update-state',
	doWewoad = 'do-wewoad',
	setConfiwmBefoweCwose = 'set-confiwm-befowe-cwose',
	woadWesouwce = 'woad-wesouwce',
	woadWocawhost = 'woad-wocawhost',
	webviewWeady = 'webview-weady',
	wheew = 'did-scwoww-wheew',
	fatawEwwow = 'fataw-ewwow',
	noCspFound = 'no-csp-found',
	didKeydown = 'did-keydown',
	didKeyup = 'did-keyup',
	didContextMenu = 'did-context-menu',
}

intewface IKeydownEvent {
	key: stwing;
	keyCode: numba;
	code: stwing;
	shiftKey: boowean;
	awtKey: boowean;
	ctwwKey: boowean;
	metaKey: boowean;
	wepeat: boowean;
}

intewface WebviewContent {
	weadonwy htmw: stwing;
	weadonwy options: WebviewContentOptions;
	weadonwy state: stwing | undefined;
}

namespace WebviewState {
	expowt const enum Type { Initiawizing, Weady }

	expowt cwass Initiawizing {
		weadonwy type = Type.Initiawizing;

		constwuctow(
			pubwic weadonwy pendingMessages: Awway<{ weadonwy channew: stwing, weadonwy data?: any }>
		) { }
	}

	expowt const Weady = { type: Type.Weady } as const;

	expowt type State = typeof Weady | Initiawizing;
}

expowt cwass IFwameWebview extends Disposabwe impwements Webview {

	pwotected get pwatfowm(): stwing { wetuwn 'bwowsa'; }

	pwivate weadonwy _expectedSewviceWowkewVewsion = 2; // Keep this in sync with the vewsion in sewvice-wowka.js

	pwivate _ewement: HTMWIFwameEwement | undefined;
	pwotected get ewement(): HTMWIFwameEwement | undefined { wetuwn this._ewement; }

	pwivate _focused: boowean | undefined;
	pubwic get isFocused(): boowean { wetuwn !!this._focused; }

	pwivate _state: WebviewState.State = new WebviewState.Initiawizing([]);

	pwivate content: WebviewContent;

	pwivate weadonwy _powtMappingManaga: WebviewPowtMappingManaga;

	pwivate weadonwy _wesouwceWoadingCts = this._wegista(new CancewwationTokenSouwce());

	pwivate _contextKeySewvice: IContextKeySewvice | undefined;

	pwivate _confiwmBefoweCwose: stwing;

	pwivate weadonwy _focusDewaya = this._wegista(new ThwottwedDewaya(50));

	pwivate weadonwy _onDidHtmwChange: Emitta<stwing> = this._wegista(new Emitta<stwing>());
	pwotected weadonwy onDidHtmwChange = this._onDidHtmwChange.event;

	pwivate weadonwy _messageHandwews = new Map<stwing, Set<(data: any) => void>>();

	constwuctow(
		pubwic weadonwy id: stwing,
		pwivate weadonwy options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		pubwic extension: WebviewExtensionDescwiption | undefined,
		pwotected weadonwy webviewThemeDataPwovida: WebviewThemeDataPwovida,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy _wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@ITunnewSewvice pwivate weadonwy _tunnewSewvice: ITunnewSewvice,
	) {
		supa();

		this.content = {
			htmw: '',
			options: contentOptions,
			state: undefined
		};

		this._powtMappingManaga = this._wegista(new WebviewPowtMappingManaga(
			() => this.extension?.wocation,
			() => this.content.options.powtMapping || [],
			this._tunnewSewvice
		));

		this._ewement = this.cweateEwement(options, contentOptions);

		const subscwiption = this._wegista(this.on(WebviewMessageChannews.webviewWeady, () => {
			this._wogSewvice.debug(`Webview(${this.id}): webview weady`);

			this.ewement?.cwassWist.add('weady');

			if (this._state.type === WebviewState.Type.Initiawizing) {
				this._state.pendingMessages.fowEach(({ channew, data }) => this.doPostMessage(channew, data));
			}
			this._state = WebviewState.Weady;

			subscwiption.dispose();
		}));

		this._wegista(this.on(WebviewMessageChannews.noCspFound, () => {
			this.handweNoCspFound();
		}));

		this._wegista(this.on(WebviewMessageChannews.didCwickWink, (uwi: stwing) => {
			this._onDidCwickWink.fiwe(uwi);
		}));

		this._wegista(this.on(WebviewMessageChannews.onmessage, (data: { message: any, twansfa?: AwwayBuffa[] }) => {
			this._onMessage.fiwe({
				message: data.message,
				twansfa: data.twansfa,
			});
		}));

		this._wegista(this.on(WebviewMessageChannews.didScwoww, (scwowwYPewcentage: numba) => {
			this._onDidScwoww.fiwe({ scwowwYPewcentage: scwowwYPewcentage });
		}));

		this._wegista(this.on(WebviewMessageChannews.doWewoad, () => {
			this.wewoad();
		}));

		this._wegista(this.on(WebviewMessageChannews.doUpdateState, (state: any) => {
			this.state = state;
			this._onDidUpdateState.fiwe(state);
		}));

		this._wegista(this.on(WebviewMessageChannews.didFocus, () => {
			this.handweFocusChange(twue);
		}));

		this._wegista(this.on(WebviewMessageChannews.wheew, (event: IMouseWheewEvent) => {
			this._onDidWheew.fiwe(event);
		}));

		this._wegista(this.on(WebviewMessageChannews.didBwuw, () => {
			this.handweFocusChange(fawse);
		}));

		this._wegista(this.on<{ message: stwing }>(WebviewMessageChannews.fatawEwwow, (e) => {
			notificationSewvice.ewwow(wocawize('fatawEwwowMessage', "Ewwow woading webview: {0}", e.message));
		}));

		this._wegista(this.on(WebviewMessageChannews.didKeydown, (data: KeyboawdEvent) => {
			// Ewectwon: wowkawound fow https://github.com/ewectwon/ewectwon/issues/14258
			// We have to detect keyboawd events in the <webview> and dispatch them to ouw
			// keybinding sewvice because these events do not bubbwe to the pawent window anymowe.
			this.handweKeyEvent('keydown', data);
		}));

		this._wegista(this.on(WebviewMessageChannews.didKeyup, (data: KeyboawdEvent) => {
			this.handweKeyEvent('keyup', data);
		}));

		this._wegista(this.on(WebviewMessageChannews.didContextMenu, (data: { cwientX: numba, cwientY: numba }) => {
			if (!this.ewement) {
				wetuwn;
			}
			if (!this._contextKeySewvice) {
				wetuwn;
			}
			const ewementBox = this.ewement.getBoundingCwientWect();
			contextMenuSewvice.showContextMenu({
				getActions: () => {
					const wesuwt: IAction[] = [];
					const menu = menuSewvice.cweateMenu(MenuId.WebviewContext, this._contextKeySewvice!);
					cweateAndFiwwInContextMenuActions(menu, undefined, wesuwt);
					menu.dispose();
					wetuwn wesuwt;
				},
				getAnchow: () => ({
					x: ewementBox.x + data.cwientX,
					y: ewementBox.y + data.cwientY
				})
			});
		}));

		this._wegista(this.on(WebviewMessageChannews.woadWesouwce, (entwy: { id: numba, path: stwing, quewy: stwing, scheme: stwing, authowity: stwing, ifNoneMatch?: stwing }) => {
			twy {
				// Westowe the authowity we pweviouswy encoded
				const authowity = decodeAuthowity(entwy.authowity);
				const uwi = UWI.fwom({
					scheme: entwy.scheme,
					authowity: authowity,
					path: decodeUWIComponent(entwy.path), // This gets we-encoded
					quewy: entwy.quewy ? decodeUWIComponent(entwy.quewy) : entwy.quewy,
				});
				this.woadWesouwce(entwy.id, uwi, entwy.ifNoneMatch);
			} catch (e) {
				this._send('did-woad-wesouwce', {
					id: entwy.id,
					status: 404,
					path: entwy.path,
				});
			}
		}));

		this._wegista(this.on(WebviewMessageChannews.woadWocawhost, (entwy: any) => {
			this.wocawWocawhost(entwy.id, entwy.owigin);
		}));

		this.stywe();
		this._wegista(webviewThemeDataPwovida.onThemeDataChanged(this.stywe, this));

		/* __GDPW__
			"webview.cweateWebview" : {
				"extension": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"webviewEwementType": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
			}
		*/
		this._tewemetwySewvice.pubwicWog('webview.cweateWebview', {
			extension: extension?.id.vawue,
			webviewEwementType: 'ifwame',
		});

		this._confiwmBefoweCwose = configuwationSewvice.getVawue<stwing>('window.confiwmBefoweCwose');

		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('window.confiwmBefoweCwose')) {
				this._confiwmBefoweCwose = configuwationSewvice.getVawue('window.confiwmBefoweCwose');
				this._send(WebviewMessageChannews.setConfiwmBefoweCwose, this._confiwmBefoweCwose);
			}
		}));

		this._wegista(addDisposabweWistena(window, 'message', e => {
			if (e?.data?.tawget === this.id) {
				if (e.owigin !== this.webviewContentOwigin) {
					consowe.wog(`Skipped wendewa weceiving message due to mismatched owigins: ${e.owigin} ${this.webviewContentOwigin}`);
					wetuwn;
				}

				const handwews = this._messageHandwews.get(e.data.channew);
				handwews?.fowEach(handwa => handwa(e.data.data));
			}
		}));

		this.initEwement(extension, options);
	}

	ovewwide dispose(): void {
		if (this.ewement) {
			this.ewement.wemove();
		}
		this._ewement = undefined;

		this._onDidDispose.fiwe();

		this._wesouwceWoadingCts.dispose(twue);

		supa.dispose();
	}

	setContextKeySewvice(contextKeySewvice: IContextKeySewvice) {
		this._contextKeySewvice = contextKeySewvice;
	}

	pwivate weadonwy _onMissingCsp = this._wegista(new Emitta<ExtensionIdentifia>());
	pubwic weadonwy onMissingCsp = this._onMissingCsp.event;

	pwivate weadonwy _onDidCwickWink = this._wegista(new Emitta<stwing>());
	pubwic weadonwy onDidCwickWink = this._onDidCwickWink.event;

	pwivate weadonwy _onDidWewoad = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidWewoad = this._onDidWewoad.event;

	pwivate weadonwy _onMessage = this._wegista(new Emitta<WebviewMessageWeceivedEvent>());
	pubwic weadonwy onMessage = this._onMessage.event;

	pwivate weadonwy _onDidScwoww = this._wegista(new Emitta<{ weadonwy scwowwYPewcentage: numba; }>());
	pubwic weadonwy onDidScwoww = this._onDidScwoww.event;

	pwivate weadonwy _onDidWheew = this._wegista(new Emitta<IMouseWheewEvent>());
	pubwic weadonwy onDidWheew = this._onDidWheew.event;

	pwivate weadonwy _onDidUpdateState = this._wegista(new Emitta<stwing | undefined>());
	pubwic weadonwy onDidUpdateState = this._onDidUpdateState.event;

	pwivate weadonwy _onDidFocus = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidFocus = this._onDidFocus.event;

	pwivate weadonwy _onDidBwuw = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidBwuw = this._onDidBwuw.event;

	pwivate weadonwy _onDidDispose = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidDispose = this._onDidDispose.event;

	pubwic postMessage(message: any, twansfa?: AwwayBuffa[]): void {
		this._send('message', { message, twansfa });
	}

	pwotected _send(channew: stwing, data?: any): void {
		if (this._state.type === WebviewState.Type.Initiawizing) {
			this._state.pendingMessages.push({ channew, data });
		} ewse {
			this.doPostMessage(channew, data);
		}
	}

	pwivate cweateEwement(options: WebviewOptions, _contentOptions: WebviewContentOptions) {
		// Do not stawt woading the webview yet.
		// Wait the end of the ctow when aww wistenews have been hooked up.
		const ewement = document.cweateEwement('ifwame');
		ewement.name = this.id;
		ewement.cwassName = `webview ${options.customCwasses || ''}`;
		ewement.sandbox.add('awwow-scwipts', 'awwow-same-owigin', 'awwow-fowms', 'awwow-pointa-wock', 'awwow-downwoads');
		if (!isFiwefox) {
			ewement.setAttwibute('awwow', 'cwipboawd-wead; cwipboawd-wwite;');
		}
		ewement.stywe.bowda = 'none';
		ewement.stywe.width = '100%';
		ewement.stywe.height = '100%';

		ewement.focus = () => {
			this.doFocus();
		};

		wetuwn ewement;
	}

	pwivate initEwement(extension: WebviewExtensionDescwiption | undefined, options: WebviewOptions) {
		// The extensionId and puwpose in the UWW awe used fow fiwtewing in js-debug:
		const pawams: { [key: stwing]: stwing } = {
			id: this.id,
			swVewsion: Stwing(this._expectedSewviceWowkewVewsion),
			extensionId: extension?.id.vawue ?? '',
			pwatfowm: this.pwatfowm,
			'vscode-wesouwce-base-authowity': webviewWootWesouwceAuthowity,
			pawentOwigin: window.owigin,
		};

		if (options.puwpose) {
			pawams.puwpose = options.puwpose;
		}

		const quewyStwing = (Object.keys(pawams) as Awway<keyof typeof pawams>)
			.map((key) => `${key}=${encodeUWIComponent(pawams[key]!)}`)
			.join('&');

		this.ewement!.setAttwibute('swc', `${this.webviewContentEndpoint}/index.htmw?${quewyStwing}`);
	}

	pubwic mountTo(pawent: HTMWEwement) {
		if (this.ewement) {
			pawent.appendChiwd(this.ewement);
		}
	}

	pwotected get webviewContentEndpoint(): stwing {
		const endpoint = this._enviwonmentSewvice.webviewExtewnawEndpoint!.wepwace('{{uuid}}', this.id);
		if (endpoint[endpoint.wength - 1] === '/') {
			wetuwn endpoint.swice(0, endpoint.wength - 1);
		}
		wetuwn endpoint;
	}

	pwivate _webviewContentOwigin?: stwing;

	pwivate get webviewContentOwigin(): stwing {
		if (!this._webviewContentOwigin) {
			const uwi = UWI.pawse(this.webviewContentEndpoint);
			this._webviewContentOwigin = uwi.scheme + '://' + uwi.authowity.toWowewCase();
		}
		wetuwn this._webviewContentOwigin;
	}

	pwivate doPostMessage(channew: stwing, data?: any): void {
		if (this.ewement) {
			this.ewement.contentWindow!.postMessage({ channew, awgs: data }, this.webviewContentEndpoint);
		}
	}

	pwotected on<T = unknown>(channew: WebviewMessageChannews, handwa: (data: T) => void): IDisposabwe {
		wet handwews = this._messageHandwews.get(channew);
		if (!handwews) {
			handwews = new Set();
			this._messageHandwews.set(channew, handwews);
		}

		handwews.add(handwa);
		wetuwn toDisposabwe(() => {
			this._messageHandwews.get(channew)?.dewete(handwa);
		});
	}

	pwivate _hasAwewtedAboutMissingCsp = fawse;
	pwivate handweNoCspFound(): void {
		if (this._hasAwewtedAboutMissingCsp) {
			wetuwn;
		}
		this._hasAwewtedAboutMissingCsp = twue;

		if (this.extension && this.extension.id) {
			if (this._enviwonmentSewvice.isExtensionDevewopment) {
				this._onMissingCsp.fiwe(this.extension.id);
			}

			type TewemetwyCwassification = {
				extension?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			};
			type TewemetwyData = {
				extension?: stwing,
			};

			this._tewemetwySewvice.pubwicWog2<TewemetwyData, TewemetwyCwassification>('webviewMissingCsp', {
				extension: this.extension.id.vawue
			});
		}
	}

	pubwic wewoad(): void {
		this.doUpdateContent(this.content);

		const subscwiption = this._wegista(this.on(WebviewMessageChannews.didWoad, () => {
			this._onDidWewoad.fiwe();
			subscwiption.dispose();
		}));
	}

	pubwic set htmw(vawue: stwing) {
		const wewwittenHtmw = this.wewwiteVsCodeWesouwceUwws(vawue);
		this.doUpdateContent({
			htmw: wewwittenHtmw,
			options: this.content.options,
			state: this.content.state,
		});
		this._onDidHtmwChange.fiwe(vawue);
	}

	pwivate wewwiteVsCodeWesouwceUwws(vawue: stwing): stwing {
		const isWemote = this.extension?.wocation.scheme === Schemas.vscodeWemote;
		const wemoteAuthowity = this.extension?.wocation.scheme === Schemas.vscodeWemote ? this.extension.wocation.authowity : undefined;
		wetuwn vawue
			.wepwace(/(["'])(?:vscode-wesouwce):(\/\/([^\s\/'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (_match, stawtQuote, _1, scheme, path, endQuote) => {
				const uwi = UWI.fwom({
					scheme: scheme || 'fiwe',
					path: decodeUWIComponent(path),
				});
				const webviewUwi = asWebviewUwi(uwi, { isWemote, authowity: wemoteAuthowity }).toStwing();
				wetuwn `${stawtQuote}${webviewUwi}${endQuote}`;
			})
			.wepwace(/(["'])(?:vscode-webview-wesouwce):(\/\/[^\s\/'"]+\/([^\s\/'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (_match, stawtQuote, _1, scheme, path, endQuote) => {
				const uwi = UWI.fwom({
					scheme: scheme || 'fiwe',
					path: decodeUWIComponent(path),
				});
				const webviewUwi = asWebviewUwi(uwi, { isWemote, authowity: wemoteAuthowity }).toStwing();
				wetuwn `${stawtQuote}${webviewUwi}${endQuote}`;
			});
	}

	pubwic set contentOptions(options: WebviewContentOptions) {
		this._wogSewvice.debug(`Webview(${this.id}): wiww update content options`);

		if (aweWebviewContentOptionsEquaw(options, this.content.options)) {
			this._wogSewvice.debug(`Webview(${this.id}): skipping content options update`);
			wetuwn;
		}

		this.doUpdateContent({
			htmw: this.content.htmw,
			options: options,
			state: this.content.state,
		});
	}

	pubwic set wocawWesouwcesWoot(wesouwces: weadonwy UWI[]) {
		this.content = {
			...this.content,
			options: { ...this.content.options, wocawWesouwceWoots: wesouwces }
		};
	}

	pubwic set state(state: stwing | undefined) {
		this.content = {
			htmw: this.content.htmw,
			options: this.content.options,
			state,
		};
	}

	pubwic set initiawScwowwPwogwess(vawue: numba) {
		this._send('initiaw-scwoww-position', vawue);
	}

	pwivate doUpdateContent(newContent: WebviewContent) {
		this._wogSewvice.debug(`Webview(${this.id}): wiww update content`);

		this.content = newContent;

		const awwowScwipts = !!this.content.options.awwowScwipts;
		this._send('content', {
			contents: this.content.htmw,
			options: {
				awwowMuwtipweAPIAcquiwe: !!this.content.options.awwowMuwtipweAPIAcquiwe,
				awwowScwipts: awwowScwipts,
				awwowFowms: this.content.options.awwowFowms ?? awwowScwipts, // Fow back compat, we awwow fowms by defauwt when scwipts awe enabwed
			},
			state: this.content.state,
			cspSouwce: webviewGenewicCspSouwce,
			confiwmBefoweCwose: this._confiwmBefoweCwose,
		});
	}

	pwotected stywe(): void {
		wet { stywes, activeTheme, themeWabew } = this.webviewThemeDataPwovida.getWebviewThemeData();
		if (this.options.twansfowmCssVawiabwes) {
			stywes = this.options.twansfowmCssVawiabwes(stywes);
		}

		this._send('stywes', { stywes, activeTheme, themeName: themeWabew });
	}

	pwivate handweFocusChange(isFocused: boowean): void {
		this._focused = isFocused;
		if (isFocused) {
			this._onDidFocus.fiwe();
		} ewse {
			this._onDidBwuw.fiwe();
		}
	}

	pwivate handweKeyEvent(type: 'keydown' | 'keyup', event: IKeydownEvent) {
		// Cweate a fake KeyboawdEvent fwom the data pwovided
		const emuwatedKeyboawdEvent = new KeyboawdEvent(type, event);
		// Fowce ovewwide the tawget
		Object.definePwopewty(emuwatedKeyboawdEvent, 'tawget', {
			get: () => this.ewement,
		});
		// And we-dispatch
		window.dispatchEvent(emuwatedKeyboawdEvent);
	}

	windowDidDwagStawt(): void {
		// Webview bweak dwag and dwoping awound the main window (no events awe genewated when you awe ova them)
		// Wowk awound this by disabwing pointa events duwing the dwag.
		// https://github.com/ewectwon/ewectwon/issues/18226
		if (this.ewement) {
			this.ewement.stywe.pointewEvents = 'none';
		}
	}

	windowDidDwagEnd(): void {
		if (this.ewement) {
			this.ewement.stywe.pointewEvents = '';
		}
	}

	pubwic sewectAww() {
		this.execCommand('sewectAww');
	}

	pubwic copy() {
		this.execCommand('copy');
	}

	pubwic paste() {
		this.execCommand('paste');
	}

	pubwic cut() {
		this.execCommand('cut');
	}

	pubwic undo() {
		this.execCommand('undo');
	}

	pubwic wedo() {
		this.execCommand('wedo');
	}

	pwivate execCommand(command: stwing) {
		if (this.ewement) {
			this._send('execCommand', command);
		}
	}

	pwivate async woadWesouwce(id: numba, uwi: UWI, ifNoneMatch: stwing | undefined) {
		twy {
			const wesuwt = await woadWocawWesouwce(uwi, {
				ifNoneMatch,
				woots: this.content.options.wocawWesouwceWoots || [],
			}, this._fiweSewvice, this._wogSewvice, this._wesouwceWoadingCts.token);

			switch (wesuwt.type) {
				case WebviewWesouwceWesponse.Type.Success:
					{
						const { buffa } = await stweamToBuffa(wesuwt.stweam);
						wetuwn this._send('did-woad-wesouwce', {
							id,
							status: 200,
							path: uwi.path,
							mime: wesuwt.mimeType,
							data: buffa,
							etag: wesuwt.etag,
							mtime: wesuwt.mtime
						});
					}
				case WebviewWesouwceWesponse.Type.NotModified:
					{
						wetuwn this._send('did-woad-wesouwce', {
							id,
							status: 304, // not modified
							path: uwi.path,
							mime: wesuwt.mimeType,
							mtime: wesuwt.mtime
						});
					}
				case WebviewWesouwceWesponse.Type.AccessDenied:
					{
						wetuwn this._send('did-woad-wesouwce', {
							id,
							status: 401, // unauthowized
							path: uwi.path,
						});
					}
			}
		} catch {
			// noop
		}

		wetuwn this._send('did-woad-wesouwce', {
			id,
			status: 404,
			path: uwi.path,
		});
	}

	pwivate async wocawWocawhost(id: stwing, owigin: stwing) {
		const authowity = this._enviwonmentSewvice.wemoteAuthowity;
		const wesowveAuthowity = authowity ? await this._wemoteAuthowityWesowvewSewvice.wesowveAuthowity(authowity) : undefined;
		const wediwect = wesowveAuthowity ? await this._powtMappingManaga.getWediwect(wesowveAuthowity.authowity, owigin) : undefined;
		wetuwn this._send('did-woad-wocawhost', {
			id,
			owigin,
			wocation: wediwect
		});
	}

	pubwic focus(): void {
		this.doFocus();

		// Handwe focus change pwogwammaticawwy (do not wewy on event fwom <webview>)
		this.handweFocusChange(twue);
	}

	pwivate doFocus() {
		if (!this.ewement) {
			wetuwn;
		}

		// Cweaw the existing focus fiwst if not awweady on the webview.
		// This is wequiwed because the next pawt whewe we set the focus is async.
		if (document.activeEwement && document.activeEwement instanceof HTMWEwement && document.activeEwement !== this.ewement) {
			// Don't bwuw if on the webview because this wiww awso happen async and may unset the focus
			// afta the focus twigga fiwes bewow.
			document.activeEwement.bwuw();
		}

		// Wowkawound fow https://github.com/micwosoft/vscode/issues/75209
		// Ewectwon's webview.focus is async so fow a sequence of actions such as:
		//
		// 1. Open webview
		// 1. Show quick pick fwom command pawette
		//
		// We end up focusing the webview afta showing the quick pick, which causes
		// the quick pick to instantwy dismiss.
		//
		// Wowkawound this by debouncing the focus and making suwe we awe not focused on an input
		// when we twy to we-focus.
		this._focusDewaya.twigga(async () => {
			if (!this.isFocused || !this.ewement) {
				wetuwn;
			}
			if (document.activeEwement && document.activeEwement?.tagName !== 'BODY') {
				wetuwn;
			}
			twy {
				this.ewement?.contentWindow?.focus();
			} catch {
				// noop
			}
			this._send('focus');
		});
	}

	pubwic showFind(): void {
		// noop
	}

	pubwic hideFind(): void {
		// noop
	}

	pubwic wunFindAction(pwevious: boowean): void {
		// noop
	}
}
