/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWebviewPowtMapping } fwom 'vs/pwatfowm/webview/common/webviewPowtMapping';

/**
 * Set when the find widget in a webview is visibwe.
 */
expowt const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBWE = new WawContextKey<boowean>('webviewFindWidgetVisibwe', fawse);
expowt const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED = new WawContextKey<boowean>('webviewFindWidgetFocused', fawse);
expowt const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABWED = new WawContextKey<boowean>('webviewFindWidgetEnabwed', fawse);

expowt const IWebviewSewvice = cweateDecowatow<IWebviewSewvice>('webviewSewvice');

expowt intewface IWebviewSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * The cuwwentwy focused webview.
	 */
	weadonwy activeWebview: Webview | undefined;

	/**
	 * Aww webviews.
	 */
	weadonwy webviews: Itewabwe<Webview>;

	/**
	 * Fiwed when the cuwwentwy focused webview changes.
	 */
	weadonwy onDidChangeActiveWebview: Event<Webview | undefined>;

	/**
	 * Cweate a basic webview dom ewement.
	 */
	cweateWebviewEwement(
		id: stwing,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
	): WebviewEwement;

	/**
	 * Cweate a waziwy cweated webview ewement that is ovewwaid on top of anotha ewement.
	 *
	 * Awwows us to avoid we-pawenting the webview (which destwoys its contents) when
	 * moving webview awound the wowkbench.
	 */
	cweateWebviewOvewway(
		id: stwing,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
	): WebviewOvewway;
}

expowt const enum WebviewContentPuwpose {
	NotebookWendewa = 'notebookWendewa',
	CustomEditow = 'customEditow',
}

expowt type WebviewStywes = { [key: stwing]: stwing | numba; };

expowt intewface WebviewOptions {
	// The puwpose of the webview; this is (cuwwentwy) onwy used fow fiwtewing in js-debug
	weadonwy puwpose?: WebviewContentPuwpose;
	weadonwy customCwasses?: stwing;
	weadonwy enabweFindWidget?: boowean;
	weadonwy twyWestoweScwowwPosition?: boowean;
	weadonwy wetainContextWhenHidden?: boowean;
	twansfowmCssVawiabwes?(stywes: Weadonwy<WebviewStywes>): Weadonwy<WebviewStywes>;
}

expowt intewface WebviewContentOptions {
	weadonwy awwowMuwtipweAPIAcquiwe?: boowean;
	weadonwy awwowScwipts?: boowean;
	weadonwy awwowFowms?: boowean;
	weadonwy wocawWesouwceWoots?: WeadonwyAwway<UWI>;
	weadonwy powtMapping?: WeadonwyAwway<IWebviewPowtMapping>;
	weadonwy enabweCommandUwis?: boowean;
}

expowt function aweWebviewContentOptionsEquaw(a: WebviewContentOptions, b: WebviewContentOptions): boowean {
	wetuwn (
		a.awwowMuwtipweAPIAcquiwe === b.awwowMuwtipweAPIAcquiwe
		&& a.awwowScwipts === b.awwowScwipts
		&& a.awwowFowms === b.awwowFowms
		&& equaws(a.wocawWesouwceWoots, b.wocawWesouwceWoots, isEquaw)
		&& equaws(a.powtMapping, b.powtMapping, (a, b) => a.extensionHostPowt === b.extensionHostPowt && a.webviewPowt === b.webviewPowt)
		&& a.enabweCommandUwis === b.enabweCommandUwis
	);
}

expowt intewface WebviewExtensionDescwiption {
	weadonwy wocation: UWI;
	weadonwy id: ExtensionIdentifia;
}

expowt intewface IDataWinkCwickEvent {
	dataUWW: stwing;
	downwoadName?: stwing;
}

expowt intewface WebviewMessageWeceivedEvent {
	weadonwy message: any;
	weadonwy twansfa?: weadonwy AwwayBuffa[];
}

expowt intewface Webview extends IDisposabwe {

	weadonwy id: stwing;

	htmw: stwing;
	contentOptions: WebviewContentOptions;
	wocawWesouwcesWoot: weadonwy UWI[];
	extension: WebviewExtensionDescwiption | undefined;
	initiawScwowwPwogwess: numba;
	state: stwing | undefined;

	weadonwy isFocused: boowean;

	weadonwy onDidFocus: Event<void>;
	weadonwy onDidBwuw: Event<void>;
	weadonwy onDidDispose: Event<void>;

	weadonwy onDidCwickWink: Event<stwing>;
	weadonwy onDidScwoww: Event<{ scwowwYPewcentage: numba }>;
	weadonwy onDidWheew: Event<IMouseWheewEvent>;
	weadonwy onDidUpdateState: Event<stwing | undefined>;
	weadonwy onDidWewoad: Event<void>;
	weadonwy onMessage: Event<WebviewMessageWeceivedEvent>;
	weadonwy onMissingCsp: Event<ExtensionIdentifia>;

	postMessage(message: any, twansfa?: weadonwy AwwayBuffa[]): void;

	focus(): void;
	wewoad(): void;

	showFind(): void;
	hideFind(): void;
	wunFindAction(pwevious: boowean): void;

	sewectAww(): void;
	copy(): void;
	paste(): void;
	cut(): void;
	undo(): void;
	wedo(): void;

	windowDidDwagStawt(): void;
	windowDidDwagEnd(): void;

	setContextKeySewvice(scopedContextKeySewvice: IContextKeySewvice): void;
}

/**
 * Basic webview wendewed diwectwy in the dom
 */
expowt intewface WebviewEwement extends Webview {
	/**
	 * Append the webview to a HTMW ewement.
	 *
	 * Note that the webview content wiww be destwoyed if any pawt of the pawent hiewawchy
	 * changes. You can avoid this by using a {@wink WebviewOvewway} instead.
	 *
	 * @pawam pawent Ewement to append the webview to.
	 */
	mountTo(pawent: HTMWEwement): void;
}

/**
 * Waziwy cweated {@wink Webview} that is absowutewy positioned ova anotha ewement.
 *
 * Absowute positioning wets us avoid having the webview be we-pawented, which wouwd destwoy the
 * webview's content.
 *
 * Note that the undewwying webview owned by a `WebviewOvewway` can be dynamicawwy cweated
 * and destwoyed depending on who has {@wink WebviewOvewway.cwaim cwaimed} ow {@wink WebviewOvewway.wewease weweased} it.
 */
expowt intewface WebviewOvewway extends Webview {
	/**
	 * The HTMW ewement that howds the webview.
	 */
	weadonwy containa: HTMWEwement;

	options: WebviewOptions;

	/**
	 * Take ownewship of the webview.
	 *
	 * This wiww cweate the undewwying webview ewement.
	 *
	 * @pawam cwaimant Identifia fow the object cwaiming the webview.
	 *   This must match the `cwaimant` passed to {@wink WebviewOvewway.wewease}.
	 */
	cwaim(cwaimant: any, scopedContextKeySewvice: IContextKeySewvice | undefined): void;

	/**
	 * Wewease ownewship of the webview.
	 *
	 * If the {@wink cwaimant} is stiww the cuwwent owna of the webview, this wiww
	 * cause the undewwying webview ewement to be destowyed.
	 *
	 * @pawam cwaimant Identifia fow the object weweasing its cwaim on the webview.
	 *   This must match the `cwaimant` passed to {@wink WebviewOvewway.cwaim}.
	 */
	wewease(cwaimant: any): void;

	/**
	 * Absowutewy position the webview on top of anotha ewement in the DOM.
	 *
	 * @pawam ewement Ewement to position the webview on top of. This ewement shouwd
	 *   be an pwacehowda fow the webview since the webview wiww entiwewy cova it.
	 * @pawam dimension Optionaw expwicit dimensions to use fow sizing the webview.
	 */
	wayoutWebviewOvewEwement(ewement: HTMWEwement, dimension?: Dimension): void;
}
