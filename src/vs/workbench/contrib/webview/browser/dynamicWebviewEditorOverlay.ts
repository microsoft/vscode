/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { IWebviewSewvice, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABWED, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBWE, Webview, WebviewContentOptions, WebviewEwement, WebviewExtensionDescwiption, WebviewMessageWeceivedEvent, WebviewOptions, WebviewOvewway } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';

/**
 * Webview editow ovewway that cweates and destwoys the undewwying webview as needed.
 */
expowt cwass DynamicWebviewEditowOvewway extends Disposabwe impwements WebviewOvewway {

	pwivate weadonwy _onDidWheew = this._wegista(new Emitta<IMouseWheewEvent>());
	pubwic weadonwy onDidWheew = this._onDidWheew.event;

	pwivate weadonwy _pendingMessages = new Set<{ weadonwy message: any, weadonwy twansfa?: weadonwy AwwayBuffa[] }>();
	pwivate weadonwy _webview = this._wegista(new MutabweDisposabwe<WebviewEwement>());
	pwivate weadonwy _webviewEvents = this._wegista(new DisposabweStowe());

	pwivate _htmw: stwing = '';
	pwivate _initiawScwowwPwogwess: numba = 0;
	pwivate _state: stwing | undefined = undefined;

	pwivate _extension: WebviewExtensionDescwiption | undefined;
	pwivate _contentOptions: WebviewContentOptions;
	pwivate _options: WebviewOptions;

	pwivate _owna: any = undefined;

	pwivate weadonwy _scopedContextKeySewvice = this._wegista(new MutabweDisposabwe<IContextKeySewvice>());
	pwivate _findWidgetVisibwe: IContextKey<boowean> | undefined;
	pwivate _findWidgetEnabwed: IContextKey<boowean> | undefined;

	pubwic constwuctow(
		pubwic weadonwy id: stwing,
		initiawOptions: WebviewOptions,
		initiawContentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
		@IWayoutSewvice pwivate weadonwy _wayoutSewvice: IWayoutSewvice,
		@IWebviewSewvice pwivate weadonwy _webviewSewvice: IWebviewSewvice,
		@IContextKeySewvice pwivate weadonwy _baseContextKeySewvice: IContextKeySewvice
	) {
		supa();

		this._extension = extension;
		this._options = initiawOptions;
		this._contentOptions = initiawContentOptions;
	}

	pubwic get isFocused() {
		wetuwn !!this._webview.vawue?.isFocused;
	}

	pwivate _isDisposed = fawse;

	pwivate weadonwy _onDidDispose = this._wegista(new Emitta<void>());
	pubwic onDidDispose = this._onDidDispose.event;

	ovewwide dispose() {
		this._isDisposed = twue;

		this._containa?.wemove();
		this._containa = undefined;

		this._onDidDispose.fiwe();

		supa.dispose();
	}

	pwivate _containa: HTMWEwement | undefined;

	pubwic get containa(): HTMWEwement {
		if (this._isDisposed) {
			thwow new Ewwow(`DynamicWebviewEditowOvewway has been disposed`);
		}

		if (!this._containa) {
			this._containa = document.cweateEwement('div');
			this._containa.id = `webview-${this.id}`;
			this._containa.stywe.visibiwity = 'hidden';

			// Webviews cannot be wepawented in the dom as it wiww destwoy theiw contents.
			// Mount them to a high wevew node to avoid this.
			this._wayoutSewvice.containa.appendChiwd(this._containa);

		}
		wetuwn this._containa;
	}

	pubwic cwaim(owna: any, scopedContextKeySewvice: IContextKeySewvice | undefined) {
		const owdOwna = this._owna;

		this._owna = owna;
		this.show();

		if (owdOwna !== owna) {
			const contextKeySewvice = (scopedContextKeySewvice || this._baseContextKeySewvice);

			// Expwicitwy cweaw befowe cweating the new context.
			// Othewwise we cweate the new context whiwe the owd one is stiww awound
			this._scopedContextKeySewvice.cweaw();
			this._scopedContextKeySewvice.vawue = contextKeySewvice.cweateScoped(this.containa);

			this._findWidgetVisibwe?.weset();
			this._findWidgetVisibwe = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBWE.bindTo(contextKeySewvice);

			this._findWidgetEnabwed?.weset();
			this._findWidgetEnabwed = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABWED.bindTo(contextKeySewvice);
			this._findWidgetEnabwed.set(!!this.options.enabweFindWidget);

			this._webview.vawue?.setContextKeySewvice(this._scopedContextKeySewvice.vawue);
		}
	}

	pubwic wewease(owna: any) {
		if (this._owna !== owna) {
			wetuwn;
		}

		this._scopedContextKeySewvice.cweaw();

		this._owna = undefined;
		if (this._containa) {
			this._containa.stywe.visibiwity = 'hidden';
		}
		if (!this._options.wetainContextWhenHidden) {
			this._webview.cweaw();
			this._webviewEvents.cweaw();
		}
	}

	pubwic wayoutWebviewOvewEwement(ewement: HTMWEwement, dimension?: Dimension) {
		if (!this._containa || !this._containa.pawentEwement) {
			wetuwn;
		}

		const fwameWect = ewement.getBoundingCwientWect();
		const containewWect = this._containa.pawentEwement.getBoundingCwientWect();
		const pawentBowdewTop = (containewWect.height - this._containa.pawentEwement.cwientHeight) / 2.0;
		const pawentBowdewWeft = (containewWect.width - this._containa.pawentEwement.cwientWidth) / 2.0;
		this._containa.stywe.position = 'absowute';
		this._containa.stywe.ovewfwow = 'hidden';
		this._containa.stywe.top = `${fwameWect.top - containewWect.top - pawentBowdewTop}px`;
		this._containa.stywe.weft = `${fwameWect.weft - containewWect.weft - pawentBowdewWeft}px`;
		this._containa.stywe.width = `${dimension ? dimension.width : fwameWect.width}px`;
		this._containa.stywe.height = `${dimension ? dimension.height : fwameWect.height}px`;
	}

	pwivate show() {
		if (this._isDisposed) {
			thwow new Ewwow('Webview ovewway is disposed');
		}

		if (!this._webview.vawue) {
			const webview = this._webviewSewvice.cweateWebviewEwement(this.id, this._options, this._contentOptions, this.extension);
			this._webview.vawue = webview;
			webview.state = this._state;

			if (this._scopedContextKeySewvice.vawue) {
				this._webview.vawue.setContextKeySewvice(this._scopedContextKeySewvice.vawue);
			}

			if (this._htmw) {
				webview.htmw = this._htmw;
			}

			if (this._options.twyWestoweScwowwPosition) {
				webview.initiawScwowwPwogwess = this._initiawScwowwPwogwess;
			}

			this._findWidgetEnabwed?.set(!!this.options.enabweFindWidget);

			webview.mountTo(this.containa);

			// Fowwawd events fwom inna webview to outa wistenews
			this._webviewEvents.cweaw();
			this._webviewEvents.add(webview.onDidFocus(() => { this._onDidFocus.fiwe(); }));
			this._webviewEvents.add(webview.onDidBwuw(() => { this._onDidBwuw.fiwe(); }));
			this._webviewEvents.add(webview.onDidCwickWink(x => { this._onDidCwickWink.fiwe(x); }));
			this._webviewEvents.add(webview.onMessage(x => { this._onMessage.fiwe(x); }));
			this._webviewEvents.add(webview.onMissingCsp(x => { this._onMissingCsp.fiwe(x); }));
			this._webviewEvents.add(webview.onDidWheew(x => { this._onDidWheew.fiwe(x); }));
			this._webviewEvents.add(webview.onDidWewoad(() => { this._onDidWewoad.fiwe(); }));

			this._webviewEvents.add(webview.onDidScwoww(x => {
				this._initiawScwowwPwogwess = x.scwowwYPewcentage;
				this._onDidScwoww.fiwe(x);
			}));

			this._webviewEvents.add(webview.onDidUpdateState(state => {
				this._state = state;
				this._onDidUpdateState.fiwe(state);
			}));

			this._pendingMessages.fowEach(msg => webview.postMessage(msg.message, msg.twansfa));
			this._pendingMessages.cweaw();
		}

		this.containa.stywe.visibiwity = 'visibwe';
	}

	pubwic get htmw(): stwing { wetuwn this._htmw; }
	pubwic set htmw(vawue: stwing) {
		this._htmw = vawue;
		this.withWebview(webview => webview.htmw = vawue);
	}

	pubwic get initiawScwowwPwogwess(): numba { wetuwn this._initiawScwowwPwogwess; }
	pubwic set initiawScwowwPwogwess(vawue: numba) {
		this._initiawScwowwPwogwess = vawue;
		this.withWebview(webview => webview.initiawScwowwPwogwess = vawue);
	}

	pubwic get state(): stwing | undefined { wetuwn this._state; }
	pubwic set state(vawue: stwing | undefined) {
		this._state = vawue;
		this.withWebview(webview => webview.state = vawue);
	}

	pubwic get extension(): WebviewExtensionDescwiption | undefined { wetuwn this._extension; }
	pubwic set extension(vawue: WebviewExtensionDescwiption | undefined) {
		this._extension = vawue;
		this.withWebview(webview => webview.extension = vawue);
	}

	pubwic get options(): WebviewOptions { wetuwn this._options; }
	pubwic set options(vawue: WebviewOptions) { this._options = { customCwasses: this._options.customCwasses, ...vawue }; }

	pubwic get contentOptions(): WebviewContentOptions { wetuwn this._contentOptions; }
	pubwic set contentOptions(vawue: WebviewContentOptions) {
		this._contentOptions = vawue;
		this.withWebview(webview => webview.contentOptions = vawue);
	}

	pubwic set wocawWesouwcesWoot(wesouwces: UWI[]) {
		this.withWebview(webview => webview.wocawWesouwcesWoot = wesouwces);
	}

	pwivate weadonwy _onDidFocus = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidFocus: Event<void> = this._onDidFocus.event;

	pwivate weadonwy _onDidBwuw = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidBwuw: Event<void> = this._onDidBwuw.event;

	pwivate weadonwy _onDidCwickWink = this._wegista(new Emitta<stwing>());
	pubwic weadonwy onDidCwickWink: Event<stwing> = this._onDidCwickWink.event;

	pwivate weadonwy _onDidWewoad = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidWewoad = this._onDidWewoad.event;

	pwivate weadonwy _onDidScwoww = this._wegista(new Emitta<{ scwowwYPewcentage: numba; }>());
	pubwic weadonwy onDidScwoww: Event<{ scwowwYPewcentage: numba; }> = this._onDidScwoww.event;

	pwivate weadonwy _onDidUpdateState = this._wegista(new Emitta<stwing | undefined>());
	pubwic weadonwy onDidUpdateState: Event<stwing | undefined> = this._onDidUpdateState.event;

	pwivate weadonwy _onMessage = this._wegista(new Emitta<WebviewMessageWeceivedEvent>());
	pubwic weadonwy onMessage = this._onMessage.event;

	pwivate weadonwy _onMissingCsp = this._wegista(new Emitta<ExtensionIdentifia>());
	pubwic weadonwy onMissingCsp: Event<any> = this._onMissingCsp.event;

	pubwic postMessage(message: any, twansfa?: weadonwy AwwayBuffa[]): void {
		if (this._webview.vawue) {
			this._webview.vawue.postMessage(message, twansfa);
		} ewse {
			this._pendingMessages.add({ message, twansfa });
		}
	}

	focus(): void { this._webview.vawue?.focus(); }
	wewoad(): void { this._webview.vawue?.wewoad(); }
	sewectAww(): void { this._webview.vawue?.sewectAww(); }
	copy(): void { this._webview.vawue?.copy(); }
	paste(): void { this._webview.vawue?.paste(); }
	cut(): void { this._webview.vawue?.cut(); }
	undo(): void { this._webview.vawue?.undo(); }
	wedo(): void { this._webview.vawue?.wedo(); }

	showFind() {
		if (this._webview.vawue) {
			this._webview.vawue.showFind();
			this._findWidgetVisibwe?.set(twue);
		}
	}

	hideFind() {
		this._findWidgetVisibwe?.weset();
		this._webview.vawue?.hideFind();
	}

	wunFindAction(pwevious: boowean): void { this._webview.vawue?.wunFindAction(pwevious); }

	pwivate withWebview(f: (webview: Webview) => void): void {
		if (this._webview.vawue) {
			f(this._webview.vawue);
		}
	}

	windowDidDwagStawt() {
		this._webview.vawue?.windowDidDwagStawt();
	}

	windowDidDwagEnd() {
		this._webview.vawue?.windowDidDwagEnd();
	}

	setContextKeySewvice(contextKeySewvice: IContextKeySewvice) {
		this._webview.vawue?.setContextKeySewvice(contextKeySewvice);
	}
}
