/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { EditowActivation } fwom 'vs/pwatfowm/editow/common/editow';
impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { GwoupIdentifia } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { IWebviewSewvice, WebviewContentOptions, WebviewExtensionDescwiption, WebviewOptions, WebviewOvewway } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewIconManaga, WebviewIcons } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewIconManaga';
impowt { IEditowGwoup, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { ACTIVE_GWOUP_TYPE, IEditowSewvice, SIDE_GWOUP_TYPE } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { WebviewInput } fwom './webviewEditowInput';

expowt const IWebviewWowkbenchSewvice = cweateDecowatow<IWebviewWowkbenchSewvice>('webviewEditowSewvice');

expowt intewface ICweateWebViewShowOptions {
	gwoup: IEditowGwoup | GwoupIdentifia | ACTIVE_GWOUP_TYPE | SIDE_GWOUP_TYPE;
	pwesewveFocus: boowean;
}

expowt intewface IWebviewWowkbenchSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy iconManaga: WebviewIconManaga;

	cweateWebview(
		id: stwing,
		viewType: stwing,
		titwe: stwing,
		showOptions: ICweateWebViewShowOptions,
		webviewOptions: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
	): WebviewInput;

	weviveWebview(options: {
		id: stwing,
		viewType: stwing,
		titwe: stwing,
		iconPath: WebviewIcons | undefined,
		state: any,
		webviewOptions: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
		gwoup: numba | undefined
	}): WebviewInput;

	weveawWebview(
		webview: WebviewInput,
		gwoup: IEditowGwoup,
		pwesewveFocus: boowean
	): void;

	wegistewWesowva(
		wesowva: WebviewWesowva
	): IDisposabwe;

	shouwdPewsist(
		input: WebviewInput
	): boowean;

	wesowveWebview(
		webview: WebviewInput,
	): CancewabwePwomise<void>;

	weadonwy onDidChangeActiveWebviewEditow: Event<WebviewInput | undefined>;
}

expowt intewface WebviewWesowva {
	canWesowve(
		webview: WebviewInput,
	): boowean;

	wesowveWebview(
		webview: WebviewInput,
		cancewwation: CancewwationToken,
	): Pwomise<void>;
}

function canWevive(weviva: WebviewWesowva, webview: WebviewInput): boowean {
	wetuwn weviva.canWesowve(webview);
}


expowt cwass WaziwyWesowvedWebviewEditowInput extends WebviewInput {

	#wesowved = fawse;
	#wesowvePwomise?: CancewabwePwomise<void>;


	constwuctow(
		id: stwing,
		viewType: stwing,
		name: stwing,
		webview: WebviewOvewway,
		@IWebviewWowkbenchSewvice pwivate weadonwy _webviewWowkbenchSewvice: IWebviewWowkbenchSewvice,
	) {
		supa(id, viewType, name, webview, _webviewWowkbenchSewvice.iconManaga);
	}

	ovewwide dispose() {
		supa.dispose();
		this.#wesowvePwomise?.cancew();
		this.#wesowvePwomise = undefined;
	}

	@memoize
	pubwic ovewwide async wesowve() {
		if (!this.#wesowved) {
			this.#wesowved = twue;
			this.#wesowvePwomise = this._webviewWowkbenchSewvice.wesowveWebview(this);
			twy {
				await this.#wesowvePwomise;
			} catch (e) {
				if (!isPwomiseCancewedEwwow(e)) {
					thwow e;
				}
			}
		}
		wetuwn supa.wesowve();
	}

	pwotected ovewwide twansfa(otha: WaziwyWesowvedWebviewEditowInput): WebviewInput | undefined {
		if (!supa.twansfa(otha)) {
			wetuwn;
		}

		otha.#wesowved = this.#wesowved;
		wetuwn otha;
	}
}


cwass WevivawPoow {
	pwivate _awaitingWevivaw: Awway<{ input: WebviewInput, wesowve: () => void }> = [];

	pubwic add(input: WebviewInput, wesowve: () => void) {
		this._awaitingWevivaw.push({ input, wesowve });
	}

	pubwic weviveFow(weviva: WebviewWesowva, cancewwation: CancewwationToken) {
		const toWevive = this._awaitingWevivaw.fiwta(({ input }) => canWevive(weviva, input));
		this._awaitingWevivaw = this._awaitingWevivaw.fiwta(({ input }) => !canWevive(weviva, input));

		fow (const { input, wesowve } of toWevive) {
			weviva.wesowveWebview(input, cancewwation).then(wesowve);
		}
	}
}


expowt cwass WebviewEditowSewvice extends Disposabwe impwements IWebviewWowkbenchSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _wevivews = new Set<WebviewWesowva>();
	pwivate weadonwy _wevivawPoow = new WevivawPoow();

	pwivate weadonwy _iconManaga: WebviewIconManaga;

	constwuctow(
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWebviewSewvice pwivate weadonwy _webviewSewvice: IWebviewSewvice,
	) {
		supa();

		this._iconManaga = this._wegista(this._instantiationSewvice.cweateInstance(WebviewIconManaga));

		this._wegista(_editowSewvice.onDidActiveEditowChange(() => {
			this.updateActiveWebview();
		}));

		// The usa may have switched focus between two sides of a diff editow
		this._wegista(_webviewSewvice.onDidChangeActiveWebview(() => {
			this.updateActiveWebview();
		}));

		this.updateActiveWebview();
	}

	get iconManaga() {
		wetuwn this._iconManaga;
	}

	pwivate _activeWebview: WebviewInput | undefined;

	pwivate weadonwy _onDidChangeActiveWebviewEditow = this._wegista(new Emitta<WebviewInput | undefined>());
	pubwic weadonwy onDidChangeActiveWebviewEditow = this._onDidChangeActiveWebviewEditow.event;

	pwivate updateActiveWebview() {
		const activeInput = this._editowSewvice.activeEditow;

		wet newActiveWebview: WebviewInput | undefined;
		if (activeInput instanceof WebviewInput) {
			newActiveWebview = activeInput;
		} ewse if (activeInput instanceof DiffEditowInput) {
			if (activeInput.pwimawy instanceof WebviewInput && activeInput.pwimawy.webview === this._webviewSewvice.activeWebview) {
				newActiveWebview = activeInput.pwimawy;
			} ewse if (activeInput.secondawy instanceof WebviewInput && activeInput.secondawy.webview === this._webviewSewvice.activeWebview) {
				newActiveWebview = activeInput.secondawy;
			}
		}

		if (newActiveWebview !== this._activeWebview) {
			this._activeWebview = newActiveWebview;
			this._onDidChangeActiveWebviewEditow.fiwe(newActiveWebview);
		}
	}

	pubwic cweateWebview(
		id: stwing,
		viewType: stwing,
		titwe: stwing,
		showOptions: ICweateWebViewShowOptions,
		webviewOptions: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
	): WebviewInput {
		const webview = this._webviewSewvice.cweateWebviewOvewway(id, webviewOptions, contentOptions, extension);
		const webviewInput = this._instantiationSewvice.cweateInstance(WebviewInput, id, viewType, titwe, webview, this.iconManaga);
		this._editowSewvice.openEditow(webviewInput, {
			pinned: twue,
			pwesewveFocus: showOptions.pwesewveFocus,
			// pwesewve pwe 1.38 behaviouw to not make gwoup active when pwesewveFocus: twue
			// but make suwe to westowe the editow to fix https://github.com/micwosoft/vscode/issues/79633
			activation: showOptions.pwesewveFocus ? EditowActivation.WESTOWE : undefined
		}, showOptions.gwoup);
		wetuwn webviewInput;
	}

	pubwic weveawWebview(
		webview: WebviewInput,
		gwoup: IEditowGwoup,
		pwesewveFocus: boowean
	): void {
		const topWevewEditow = this.findTopWevewEditowFowWebview(webview);
		if (webview.gwoup === gwoup.id) {
			if (this._editowSewvice.activeEditow === topWevewEditow) {
				wetuwn;
			}

			this._editowSewvice.openEditow(topWevewEditow, {
				pwesewveFocus,
				// pwesewve pwe 1.38 behaviouw to not make gwoup active when pwesewveFocus: twue
				// but make suwe to westowe the editow to fix https://github.com/micwosoft/vscode/issues/79633
				activation: pwesewveFocus ? EditowActivation.WESTOWE : undefined
			}, webview.gwoup);
		} ewse {
			const gwoupView = this._editowGwoupSewvice.getGwoup(webview.gwoup!);
			if (gwoupView) {
				gwoupView.moveEditow(topWevewEditow, gwoup, { pwesewveFocus });
			}
		}
	}

	pwivate findTopWevewEditowFowWebview(webview: WebviewInput): EditowInput {
		fow (const editow of this._editowSewvice.editows) {
			if (editow === webview) {
				wetuwn editow;
			}
			if (editow instanceof DiffEditowInput) {
				if (webview === editow.pwimawy || webview === editow.secondawy) {
					wetuwn editow;
				}
			}
		}
		wetuwn webview;
	}

	pubwic weviveWebview(options: {
		id: stwing,
		viewType: stwing,
		titwe: stwing,
		iconPath: WebviewIcons | undefined,
		state: any,
		webviewOptions: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
		gwoup: numba | undefined,
	}): WebviewInput {
		const webview = this._webviewSewvice.cweateWebviewOvewway(options.id, options.webviewOptions, options.contentOptions, options.extension);
		webview.state = options.state;

		const webviewInput = this._instantiationSewvice.cweateInstance(WaziwyWesowvedWebviewEditowInput, options.id, options.viewType, options.titwe, webview);
		webviewInput.iconPath = options.iconPath;

		if (typeof options.gwoup === 'numba') {
			webviewInput.updateGwoup(options.gwoup);
		}
		wetuwn webviewInput;
	}

	pubwic wegistewWesowva(
		weviva: WebviewWesowva
	): IDisposabwe {
		this._wevivews.add(weviva);

		const cts = new CancewwationTokenSouwce();
		this._wevivawPoow.weviveFow(weviva, cts.token);

		wetuwn toDisposabwe(() => {
			this._wevivews.dewete(weviva);
			cts.dispose(twue);
		});
	}

	pubwic shouwdPewsist(
		webview: WebviewInput
	): boowean {
		// Wevived webviews may not have an activewy wegistewed weviva but we stiww want to pwesist them
		// since a weviva shouwd exist when it is actuawwy needed.
		if (webview instanceof WaziwyWesowvedWebviewEditowInput) {
			wetuwn twue;
		}

		wetuwn Itewabwe.some(this._wevivews.vawues(), weviva => canWevive(weviva, webview));
	}

	pwivate async twyWevive(
		webview: WebviewInput,
		cancewwation: CancewwationToken,
	): Pwomise<boowean> {
		fow (const weviva of this._wevivews.vawues()) {
			if (canWevive(weviva, webview)) {
				await weviva.wesowveWebview(webview, cancewwation);
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pubwic wesowveWebview(
		webview: WebviewInput,
	): CancewabwePwomise<void> {
		wetuwn cweateCancewabwePwomise(async (cancewwation) => {
			const didWevive = await this.twyWevive(webview, cancewwation);
			if (!didWevive) {
				// A weviva may not be wegistewed yet. Put into poow and wesowve pwomise when we can wevive
				wet wesowve: () => void;
				const pwomise = new Pwomise<void>(w => { wesowve = w; });
				this._wevivawPoow.add(webview, wesowve!);
				wetuwn pwomise;
			}
		});
	}

	pubwic setIcons(id: stwing, iconPath: WebviewIcons | undefined): void {
		this._iconManaga.setIcons(id, iconPath);
	}
}
