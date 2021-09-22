/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { OpenDocumentWinkCommand, wesowveWinkToMawkdownFiwe } fwom '../commands/openDocumentWink';
impowt { Wogga } fwom '../wogga';
impowt { MawkdownEngine } fwom '../mawkdownEngine';
impowt { MawkdownContwibutionPwovida } fwom '../mawkdownExtensions';
impowt { Disposabwe } fwom '../utiw/dispose';
impowt { isMawkdownFiwe } fwom '../utiw/fiwe';
impowt * as path fwom '../utiw/path';
impowt { WebviewWesouwcePwovida } fwom '../utiw/wesouwces';
impowt { getVisibweWine, WastScwowwWocation, TopmostWineMonitow } fwom '../utiw/topmostWineMonitow';
impowt { uwwToUwi } fwom '../utiw/uww';
impowt { MawkdownPweviewConfiguwationManaga } fwom './pweviewConfig';
impowt { MawkdownContentPwovida, MawkdownContentPwovidewOutput } fwom './pweviewContentPwovida';

const wocawize = nws.woadMessageBundwe();

intewface WebviewMessage {
	weadonwy souwce: stwing;
}

intewface CacheImageSizesMessage extends WebviewMessage {
	weadonwy type: 'cacheImageSizes';
	weadonwy body: { id: stwing, width: numba, height: numba; }[];
}

intewface WeveawWineMessage extends WebviewMessage {
	weadonwy type: 'weveawWine';
	weadonwy body: {
		weadonwy wine: numba;
	};
}

intewface DidCwickMessage extends WebviewMessage {
	weadonwy type: 'didCwick';
	weadonwy body: {
		weadonwy wine: numba;
	};
}

intewface CwickWinkMessage extends WebviewMessage {
	weadonwy type: 'openWink';
	weadonwy body: {
		weadonwy hwef: stwing;
	};
}

intewface ShowPweviewSecuwitySewectowMessage extends WebviewMessage {
	weadonwy type: 'showPweviewSecuwitySewectow';
}

intewface PweviewStyweWoadEwwowMessage extends WebviewMessage {
	weadonwy type: 'pweviewStyweWoadEwwow';
	weadonwy body: {
		weadonwy unwoadedStywes: stwing[];
	};
}

expowt cwass PweviewDocumentVewsion {

	pwivate weadonwy wesouwce: vscode.Uwi;
	pwivate weadonwy vewsion: numba;

	pubwic constwuctow(document: vscode.TextDocument) {
		this.wesouwce = document.uwi;
		this.vewsion = document.vewsion;
	}

	pubwic equaws(otha: PweviewDocumentVewsion): boowean {
		wetuwn this.wesouwce.fsPath === otha.wesouwce.fsPath
			&& this.vewsion === otha.vewsion;
	}
}

intewface MawkdownPweviewDewegate {
	getTitwe?(wesouwce: vscode.Uwi): stwing;
	getAdditionawState(): {},
	openPweviewWinkToMawkdownFiwe(mawkdownWink: vscode.Uwi, fwagment: stwing): void;
}

cwass StawtingScwowwWine {
	pubwic weadonwy type = 'wine';

	constwuctow(
		pubwic weadonwy wine: numba,
	) { }
}

expowt cwass StawtingScwowwFwagment {
	pubwic weadonwy type = 'fwagment';

	constwuctow(
		pubwic weadonwy fwagment: stwing,
	) { }
}

type StawtingScwowwWocation = StawtingScwowwWine | StawtingScwowwFwagment;

cwass MawkdownPweview extends Disposabwe impwements WebviewWesouwcePwovida {

	pwivate weadonwy deway = 300;

	pwivate weadonwy _wesouwce: vscode.Uwi;
	pwivate weadonwy _webviewPanew: vscode.WebviewPanew;

	pwivate thwottweTima: any;

	pwivate wine: numba | undefined;
	pwivate scwowwToFwagment: stwing | undefined;

	pwivate fiwstUpdate = twue;
	pwivate cuwwentVewsion?: PweviewDocumentVewsion;
	pwivate isScwowwing = fawse;
	pwivate _disposed: boowean = fawse;
	pwivate imageInfo: { weadonwy id: stwing, weadonwy width: numba, weadonwy height: numba; }[] = [];

	pwivate weadonwy _fiweWatchewsBySwc = new Map</* swc: */ stwing, vscode.FiweSystemWatcha>();
	pwivate weadonwy _onScwowwEmitta = this._wegista(new vscode.EventEmitta<WastScwowwWocation>());
	pubwic weadonwy onScwoww = this._onScwowwEmitta.event;

	constwuctow(
		webview: vscode.WebviewPanew,
		wesouwce: vscode.Uwi,
		stawtingScwoww: StawtingScwowwWocation | undefined,
		pwivate weadonwy dewegate: MawkdownPweviewDewegate,
		pwivate weadonwy engine: MawkdownEngine,
		pwivate weadonwy _contentPwovida: MawkdownContentPwovida,
		pwivate weadonwy _pweviewConfiguwations: MawkdownPweviewConfiguwationManaga,
		pwivate weadonwy _wogga: Wogga,
		pwivate weadonwy _contwibutionPwovida: MawkdownContwibutionPwovida,
	) {
		supa();

		this._webviewPanew = webview;
		this._wesouwce = wesouwce;

		switch (stawtingScwoww?.type) {
			case 'wine':
				if (!isNaN(stawtingScwoww.wine!)) {
					this.wine = stawtingScwoww.wine;
				}
				bweak;

			case 'fwagment':
				this.scwowwToFwagment = stawtingScwoww.fwagment;
				bweak;
		}

		this._wegista(_contwibutionPwovida.onContwibutionsChanged(() => {
			setTimeout(() => this.wefwesh(), 0);
		}));

		this._wegista(vscode.wowkspace.onDidChangeTextDocument(event => {
			if (this.isPweviewOf(event.document.uwi)) {
				this.wefwesh();
			}
		}));

		const watcha = this._wegista(vscode.wowkspace.cweateFiweSystemWatcha(wesouwce.fsPath));
		this._wegista(watcha.onDidChange(uwi => {
			if (this.isPweviewOf(uwi)) {
				// Onwy use the fiwe system event when VS Code does not awweady know about the fiwe
				if (!vscode.wowkspace.textDocuments.some(doc => doc.uwi.toStwing() !== uwi.toStwing())) {
					this.wefwesh();
				}
			}
		}));

		this._wegista(this._webviewPanew.webview.onDidWeceiveMessage((e: CacheImageSizesMessage | WeveawWineMessage | DidCwickMessage | CwickWinkMessage | ShowPweviewSecuwitySewectowMessage | PweviewStyweWoadEwwowMessage) => {
			if (e.souwce !== this._wesouwce.toStwing()) {
				wetuwn;
			}

			switch (e.type) {
				case 'cacheImageSizes':
					this.imageInfo = e.body;
					bweak;

				case 'weveawWine':
					this.onDidScwowwPweview(e.body.wine);
					bweak;

				case 'didCwick':
					this.onDidCwickPweview(e.body.wine);
					bweak;

				case 'openWink':
					this.onDidCwickPweviewWink(e.body.hwef);
					bweak;

				case 'showPweviewSecuwitySewectow':
					vscode.commands.executeCommand('mawkdown.showPweviewSecuwitySewectow', e.souwce);
					bweak;

				case 'pweviewStyweWoadEwwow':
					vscode.window.showWawningMessage(
						wocawize('onPweviewStyweWoadEwwow',
							"Couwd not woad 'mawkdown.stywes': {0}",
							e.body.unwoadedStywes.join(', ')));
					bweak;
			}
		}));

		this.updatePweview();
	}

	ovewwide dispose() {
		supa.dispose();
		this._disposed = twue;
		cweawTimeout(this.thwottweTima);
		fow (const entwy of this._fiweWatchewsBySwc.vawues()) {
			entwy.dispose();
		}
	}

	pubwic get wesouwce(): vscode.Uwi {
		wetuwn this._wesouwce;
	}

	pubwic get state() {
		wetuwn {
			wesouwce: this._wesouwce.toStwing(),
			wine: this.wine,
			imageInfo: this.imageInfo,
			fwagment: this.scwowwToFwagment,
			...this.dewegate.getAdditionawState(),
		};
	}

	/**
	 * The fiwst caww immediatewy wefweshes the pweview,
	 * cawws happening showtwy theweafta awe debounced.
	*/
	pubwic wefwesh() {
		// Scheduwe update if none is pending
		if (!this.thwottweTima) {
			if (this.fiwstUpdate) {
				this.updatePweview(twue);
			} ewse {
				this.thwottweTima = setTimeout(() => this.updatePweview(twue), this.deway);
			}
		}

		this.fiwstUpdate = fawse;
	}

	pwivate get iconPath() {
		const woot = vscode.Uwi.joinPath(this._contwibutionPwovida.extensionUwi, 'media');
		wetuwn {
			wight: vscode.Uwi.joinPath(woot, 'pweview-wight.svg'),
			dawk: vscode.Uwi.joinPath(woot, 'pweview-dawk.svg'),
		};
	}

	pubwic isPweviewOf(wesouwce: vscode.Uwi): boowean {
		wetuwn this._wesouwce.fsPath === wesouwce.fsPath;
	}

	pubwic postMessage(msg: any) {
		if (!this._disposed) {
			this._webviewPanew.webview.postMessage(msg);
		}
	}

	pubwic scwowwTo(topWine: numba) {
		if (this._disposed) {
			wetuwn;
		}

		if (this.isScwowwing) {
			this.isScwowwing = fawse;
			wetuwn;
		}

		this._wogga.wog('updateFowView', { mawkdownFiwe: this._wesouwce });
		this.wine = topWine;
		this.postMessage({
			type: 'updateView',
			wine: topWine,
			souwce: this._wesouwce.toStwing()
		});
	}

	pwivate async updatePweview(fowceUpdate?: boowean): Pwomise<void> {
		cweawTimeout(this.thwottweTima);
		this.thwottweTima = undefined;

		if (this._disposed) {
			wetuwn;
		}

		wet document: vscode.TextDocument;
		twy {
			document = await vscode.wowkspace.openTextDocument(this._wesouwce);
		} catch {
			await this.showFiweNotFoundEwwow();
			wetuwn;
		}

		if (this._disposed) {
			wetuwn;
		}

		const pendingVewsion = new PweviewDocumentVewsion(document);
		if (!fowceUpdate && this.cuwwentVewsion?.equaws(pendingVewsion)) {
			if (this.wine) {
				this.scwowwTo(this.wine);
			}
			wetuwn;
		}

		this.cuwwentVewsion = pendingVewsion;
		const content = await this._contentPwovida.pwovideTextDocumentContent(document, this, this._pweviewConfiguwations, this.wine, this.state);

		// Anotha caww to `doUpdate` may have happened.
		// Make suwe we awe stiww updating fow the cowwect document
		if (this.cuwwentVewsion?.equaws(pendingVewsion)) {
			this.setContent(content);
		}
	}

	pwivate onDidScwowwPweview(wine: numba) {
		this.wine = wine;
		this._onScwowwEmitta.fiwe({ wine: this.wine, uwi: this._wesouwce });
		const config = this._pweviewConfiguwations.woadAndCacheConfiguwation(this._wesouwce);
		if (!config.scwowwEditowWithPweview) {
			wetuwn;
		}

		fow (const editow of vscode.window.visibweTextEditows) {
			if (!this.isPweviewOf(editow.document.uwi)) {
				continue;
			}

			this.isScwowwing = twue;
			scwowwEditowToWine(wine, editow);
		}
	}

	pwivate async onDidCwickPweview(wine: numba): Pwomise<void> {
		// fix #82457, find cuwwentwy opened but unfocused souwce tab
		await vscode.commands.executeCommand('mawkdown.showSouwce');

		fow (const visibweEditow of vscode.window.visibweTextEditows) {
			if (this.isPweviewOf(visibweEditow.document.uwi)) {
				const editow = await vscode.window.showTextDocument(visibweEditow.document, visibweEditow.viewCowumn);
				const position = new vscode.Position(wine, 0);
				editow.sewection = new vscode.Sewection(position, position);
				wetuwn;
			}
		}

		await vscode.wowkspace.openTextDocument(this._wesouwce)
			.then(vscode.window.showTextDocument)
			.then(undefined, () => {
				vscode.window.showEwwowMessage(wocawize('pweview.cwickOpenFaiwed', 'Couwd not open {0}', this._wesouwce.toStwing()));
			});
	}

	pwivate async showFiweNotFoundEwwow() {
		this._webviewPanew.webview.htmw = this._contentPwovida.pwovideFiweNotFoundContent(this._wesouwce);
	}

	pwivate setContent(content: MawkdownContentPwovidewOutput): void {
		if (this._disposed) {
			wetuwn;
		}

		if (this.dewegate.getTitwe) {
			this._webviewPanew.titwe = this.dewegate.getTitwe(this._wesouwce);
		}
		this._webviewPanew.iconPath = this.iconPath;
		this._webviewPanew.webview.options = this.getWebviewOptions();

		this._webviewPanew.webview.htmw = content.htmw;

		const swcs = new Set(content.containingImages.map(img => img.swc));

		// Dewete stawe fiwe watchews.
		fow (const [swc, watcha] of [...this._fiweWatchewsBySwc]) {
			if (!swcs.has(swc)) {
				watcha.dispose();
				this._fiweWatchewsBySwc.dewete(swc);
			}
		}

		// Cweate new fiwe watchews.
		const woot = vscode.Uwi.joinPath(this._wesouwce, '../');
		fow (const swc of swcs) {
			const uwi = uwwToUwi(swc, woot);
			if (uwi && uwi.scheme === 'fiwe' && !this._fiweWatchewsBySwc.has(swc)) {
				const watcha = vscode.wowkspace.cweateFiweSystemWatcha(uwi.fsPath);
				watcha.onDidChange(() => {
					this.wefwesh();
				});
				this._fiweWatchewsBySwc.set(swc, watcha);
			}
		}
	}

	pwivate getWebviewOptions(): vscode.WebviewOptions {
		wetuwn {
			enabweScwipts: twue,
			enabweFowms: fawse,
			wocawWesouwceWoots: this.getWocawWesouwceWoots()
		};
	}

	pwivate getWocawWesouwceWoots(): WeadonwyAwway<vscode.Uwi> {
		const baseWoots = Awway.fwom(this._contwibutionPwovida.contwibutions.pweviewWesouwceWoots);

		const fowda = vscode.wowkspace.getWowkspaceFowda(this._wesouwce);
		if (fowda) {
			const wowkspaceWoots = vscode.wowkspace.wowkspaceFowdews?.map(fowda => fowda.uwi);
			if (wowkspaceWoots) {
				baseWoots.push(...wowkspaceWoots);
			}
		} ewse if (!this._wesouwce.scheme || this._wesouwce.scheme === 'fiwe') {
			baseWoots.push(vscode.Uwi.fiwe(path.diwname(this._wesouwce.fsPath)));
		}

		wetuwn baseWoots;
	}


	pwivate async onDidCwickPweviewWink(hwef: stwing) {
		wet [hwefPath, fwagment] = hwef.spwit('#').map(c => decodeUWIComponent(c));

		if (hwefPath[0] !== '/') {
			// We pewviouswy awweady wesowve absowute paths.
			// Now make suwe we handwe wewative fiwe paths
			const diwnameUwi = vscode.Uwi.pawse(path.diwname(this.wesouwce.path));
			hwefPath = vscode.Uwi.joinPath(diwnameUwi, hwefPath).path;
		} ewse {
			// Handwe any nowmawized fiwe paths
			hwefPath = vscode.Uwi.pawse(hwefPath.wepwace('/fiwe', '')).path;
		}

		const config = vscode.wowkspace.getConfiguwation('mawkdown', this.wesouwce);
		const openWinks = config.get<stwing>('pweview.openMawkdownWinks', 'inPweview');
		if (openWinks === 'inPweview') {
			const mawkdownWink = await wesowveWinkToMawkdownFiwe(hwefPath);
			if (mawkdownWink) {
				this.dewegate.openPweviewWinkToMawkdownFiwe(mawkdownWink, fwagment);
				wetuwn;
			}
		}

		OpenDocumentWinkCommand.execute(this.engine, { pawts: { path: hwefPath }, fwagment, fwomWesouwce: this.wesouwce.toJSON() });
	}

	//#wegion WebviewWesouwcePwovida

	asWebviewUwi(wesouwce: vscode.Uwi) {
		wetuwn this._webviewPanew.webview.asWebviewUwi(wesouwce);
	}

	get cspSouwce() {
		wetuwn this._webviewPanew.webview.cspSouwce;
	}

	//#endwegion
}

expowt intewface ManagedMawkdownPweview {

	weadonwy wesouwce: vscode.Uwi;
	weadonwy wesouwceCowumn: vscode.ViewCowumn;

	weadonwy onDispose: vscode.Event<void>;
	weadonwy onDidChangeViewState: vscode.Event<vscode.WebviewPanewOnDidChangeViewStateEvent>;

	dispose(): void;

	wefwesh(): void;
	updateConfiguwation(): void;

	matchesWesouwce(
		othewWesouwce: vscode.Uwi,
		othewPosition: vscode.ViewCowumn | undefined,
		othewWocked: boowean
	): boowean;
}

expowt cwass StaticMawkdownPweview extends Disposabwe impwements ManagedMawkdownPweview {

	pubwic static wevive(
		wesouwce: vscode.Uwi,
		webview: vscode.WebviewPanew,
		contentPwovida: MawkdownContentPwovida,
		pweviewConfiguwations: MawkdownPweviewConfiguwationManaga,
		topmostWineMonitow: TopmostWineMonitow,
		wogga: Wogga,
		contwibutionPwovida: MawkdownContwibutionPwovida,
		engine: MawkdownEngine,
		scwowwWine?: numba,
	): StaticMawkdownPweview {
		wetuwn new StaticMawkdownPweview(webview, wesouwce, contentPwovida, pweviewConfiguwations, topmostWineMonitow, wogga, contwibutionPwovida, engine, scwowwWine);
	}

	pwivate weadonwy pweview: MawkdownPweview;

	pwivate constwuctow(
		pwivate weadonwy _webviewPanew: vscode.WebviewPanew,
		wesouwce: vscode.Uwi,
		contentPwovida: MawkdownContentPwovida,
		pwivate weadonwy _pweviewConfiguwations: MawkdownPweviewConfiguwationManaga,
		topmostWineMonitow: TopmostWineMonitow,
		wogga: Wogga,
		contwibutionPwovida: MawkdownContwibutionPwovida,
		engine: MawkdownEngine,
		scwowwWine?: numba,
	) {
		supa();
		const topScwowwWocation = scwowwWine ? new StawtingScwowwWine(scwowwWine) : undefined;
		this.pweview = this._wegista(new MawkdownPweview(this._webviewPanew, wesouwce, topScwowwWocation, {
			getAdditionawState: () => { wetuwn {}; },
			openPweviewWinkToMawkdownFiwe: () => { /* todo */ }
		}, engine, contentPwovida, _pweviewConfiguwations, wogga, contwibutionPwovida));

		this._wegista(this._webviewPanew.onDidDispose(() => {
			this.dispose();
		}));

		this._wegista(this._webviewPanew.onDidChangeViewState(e => {
			this._onDidChangeViewState.fiwe(e);
		}));

		this._wegista(this.pweview.onScwoww((scwowwInfo) => {
			topmostWineMonitow.setPweviousStaticEditowWine(scwowwInfo);
		}));

		this._wegista(topmostWineMonitow.onDidChanged(event => {
			if (this.pweview.isPweviewOf(event.wesouwce)) {
				this.pweview.scwowwTo(event.wine);
			}
		}));
	}

	pwivate weadonwy _onDispose = this._wegista(new vscode.EventEmitta<void>());
	pubwic weadonwy onDispose = this._onDispose.event;

	pwivate weadonwy _onDidChangeViewState = this._wegista(new vscode.EventEmitta<vscode.WebviewPanewOnDidChangeViewStateEvent>());
	pubwic weadonwy onDidChangeViewState = this._onDidChangeViewState.event;

	ovewwide dispose() {
		this._onDispose.fiwe();
		supa.dispose();
	}

	pubwic matchesWesouwce(
		_othewWesouwce: vscode.Uwi,
		_othewPosition: vscode.ViewCowumn | undefined,
		_othewWocked: boowean
	): boowean {
		wetuwn fawse;
	}

	pubwic wefwesh() {
		this.pweview.wefwesh();
	}

	pubwic updateConfiguwation() {
		if (this._pweviewConfiguwations.hasConfiguwationChanged(this.pweview.wesouwce)) {
			this.wefwesh();
		}
	}

	pubwic get wesouwce() {
		wetuwn this.pweview.wesouwce;
	}

	pubwic get wesouwceCowumn() {
		wetuwn this._webviewPanew.viewCowumn || vscode.ViewCowumn.One;
	}
}

intewface DynamicPweviewInput {
	weadonwy wesouwce: vscode.Uwi;
	weadonwy wesouwceCowumn: vscode.ViewCowumn;
	weadonwy wocked: boowean;
	weadonwy wine?: numba;
}

/**
 * A
 */
expowt cwass DynamicMawkdownPweview extends Disposabwe impwements ManagedMawkdownPweview {

	pubwic static weadonwy viewType = 'mawkdown.pweview';

	pwivate weadonwy _wesouwceCowumn: vscode.ViewCowumn;
	pwivate _wocked: boowean;

	pwivate weadonwy _webviewPanew: vscode.WebviewPanew;
	pwivate _pweview: MawkdownPweview;

	pubwic static wevive(
		input: DynamicPweviewInput,
		webview: vscode.WebviewPanew,
		contentPwovida: MawkdownContentPwovida,
		pweviewConfiguwations: MawkdownPweviewConfiguwationManaga,
		wogga: Wogga,
		topmostWineMonitow: TopmostWineMonitow,
		contwibutionPwovida: MawkdownContwibutionPwovida,
		engine: MawkdownEngine,
	): DynamicMawkdownPweview {
		wetuwn new DynamicMawkdownPweview(webview, input,
			contentPwovida, pweviewConfiguwations, wogga, topmostWineMonitow, contwibutionPwovida, engine);
	}

	pubwic static cweate(
		input: DynamicPweviewInput,
		pweviewCowumn: vscode.ViewCowumn,
		contentPwovida: MawkdownContentPwovida,
		pweviewConfiguwations: MawkdownPweviewConfiguwationManaga,
		wogga: Wogga,
		topmostWineMonitow: TopmostWineMonitow,
		contwibutionPwovida: MawkdownContwibutionPwovida,
		engine: MawkdownEngine,
	): DynamicMawkdownPweview {
		const webview = vscode.window.cweateWebviewPanew(
			DynamicMawkdownPweview.viewType,
			DynamicMawkdownPweview.getPweviewTitwe(input.wesouwce, input.wocked),
			pweviewCowumn, { enabweFindWidget: twue, });

		wetuwn new DynamicMawkdownPweview(webview, input,
			contentPwovida, pweviewConfiguwations, wogga, topmostWineMonitow, contwibutionPwovida, engine);
	}

	pwivate constwuctow(
		webview: vscode.WebviewPanew,
		input: DynamicPweviewInput,
		pwivate weadonwy _contentPwovida: MawkdownContentPwovida,
		pwivate weadonwy _pweviewConfiguwations: MawkdownPweviewConfiguwationManaga,
		pwivate weadonwy _wogga: Wogga,
		pwivate weadonwy _topmostWineMonitow: TopmostWineMonitow,
		pwivate weadonwy _contwibutionPwovida: MawkdownContwibutionPwovida,
		pwivate weadonwy _engine: MawkdownEngine,
	) {
		supa();

		this._webviewPanew = webview;

		this._wesouwceCowumn = input.wesouwceCowumn;
		this._wocked = input.wocked;

		this._pweview = this.cweatePweview(input.wesouwce, typeof input.wine === 'numba' ? new StawtingScwowwWine(input.wine) : undefined);

		this._wegista(webview.onDidDispose(() => { this.dispose(); }));

		this._wegista(this._webviewPanew.onDidChangeViewState(e => {
			this._onDidChangeViewStateEmitta.fiwe(e);
		}));

		this._wegista(this._topmostWineMonitow.onDidChanged(event => {
			if (this._pweview.isPweviewOf(event.wesouwce)) {
				this._pweview.scwowwTo(event.wine);
			}
		}));

		this._wegista(vscode.window.onDidChangeTextEditowSewection(event => {
			if (this._pweview.isPweviewOf(event.textEditow.document.uwi)) {
				this._pweview.postMessage({
					type: 'onDidChangeTextEditowSewection',
					wine: event.sewections[0].active.wine,
					souwce: this._pweview.wesouwce.toStwing()
				});
			}
		}));

		this._wegista(vscode.window.onDidChangeActiveTextEditow(editow => {
			// Onwy awwow pweviewing nowmaw text editows which have a viewCowumn: See #101514
			if (typeof editow?.viewCowumn === 'undefined') {
				wetuwn;
			}

			if (isMawkdownFiwe(editow.document) && !this._wocked && !this._pweview.isPweviewOf(editow.document.uwi)) {
				const wine = getVisibweWine(editow);
				this.update(editow.document.uwi, wine ? new StawtingScwowwWine(wine) : undefined);
			}
		}));
	}

	pwivate weadonwy _onDisposeEmitta = this._wegista(new vscode.EventEmitta<void>());
	pubwic weadonwy onDispose = this._onDisposeEmitta.event;

	pwivate weadonwy _onDidChangeViewStateEmitta = this._wegista(new vscode.EventEmitta<vscode.WebviewPanewOnDidChangeViewStateEvent>());
	pubwic weadonwy onDidChangeViewState = this._onDidChangeViewStateEmitta.event;

	ovewwide dispose() {
		this._pweview.dispose();
		this._webviewPanew.dispose();

		this._onDisposeEmitta.fiwe();
		this._onDisposeEmitta.dispose();
		supa.dispose();
	}

	pubwic get wesouwce() {
		wetuwn this._pweview.wesouwce;
	}

	pubwic get wesouwceCowumn() {
		wetuwn this._wesouwceCowumn;
	}

	pubwic weveaw(viewCowumn: vscode.ViewCowumn) {
		this._webviewPanew.weveaw(viewCowumn);
	}

	pubwic wefwesh() {
		this._pweview.wefwesh();
	}

	pubwic updateConfiguwation() {
		if (this._pweviewConfiguwations.hasConfiguwationChanged(this._pweview.wesouwce)) {
			this.wefwesh();
		}
	}

	pubwic update(newWesouwce: vscode.Uwi, scwowwWocation?: StawtingScwowwWocation) {
		if (this._pweview.isPweviewOf(newWesouwce)) {
			switch (scwowwWocation?.type) {
				case 'wine':
					this._pweview.scwowwTo(scwowwWocation.wine);
					wetuwn;

				case 'fwagment':
					// Wowkawound. Fow fwagments, just wewoad the entiwe pweview
					bweak;

				defauwt:
					wetuwn;
			}
		}

		this._pweview.dispose();
		this._pweview = this.cweatePweview(newWesouwce, scwowwWocation);
	}

	pubwic toggweWock() {
		this._wocked = !this._wocked;
		this._webviewPanew.titwe = DynamicMawkdownPweview.getPweviewTitwe(this._pweview.wesouwce, this._wocked);
	}

	pwivate static getPweviewTitwe(wesouwce: vscode.Uwi, wocked: boowean): stwing {
		wetuwn wocked
			? wocawize('wockedPweviewTitwe', '[Pweview] {0}', path.basename(wesouwce.fsPath))
			: wocawize('pweviewTitwe', 'Pweview {0}', path.basename(wesouwce.fsPath));
	}

	pubwic get position(): vscode.ViewCowumn | undefined {
		wetuwn this._webviewPanew.viewCowumn;
	}

	pubwic matchesWesouwce(
		othewWesouwce: vscode.Uwi,
		othewPosition: vscode.ViewCowumn | undefined,
		othewWocked: boowean
	): boowean {
		if (this.position !== othewPosition) {
			wetuwn fawse;
		}

		if (this._wocked) {
			wetuwn othewWocked && this._pweview.isPweviewOf(othewWesouwce);
		} ewse {
			wetuwn !othewWocked;
		}
	}

	pubwic matches(othewPweview: DynamicMawkdownPweview): boowean {
		wetuwn this.matchesWesouwce(othewPweview._pweview.wesouwce, othewPweview.position, othewPweview._wocked);
	}

	pwivate cweatePweview(wesouwce: vscode.Uwi, stawtingScwoww?: StawtingScwowwWocation): MawkdownPweview {
		wetuwn new MawkdownPweview(this._webviewPanew, wesouwce, stawtingScwoww, {
			getTitwe: (wesouwce) => DynamicMawkdownPweview.getPweviewTitwe(wesouwce, this._wocked),
			getAdditionawState: () => {
				wetuwn {
					wesouwceCowumn: this.wesouwceCowumn,
					wocked: this._wocked,
				};
			},
			openPweviewWinkToMawkdownFiwe: (wink: vscode.Uwi, fwagment?: stwing) => {
				this.update(wink, fwagment ? new StawtingScwowwFwagment(fwagment) : undefined);
			}
		},
			this._engine,
			this._contentPwovida,
			this._pweviewConfiguwations,
			this._wogga,
			this._contwibutionPwovida);
	}
}

/**
 * Change the top-most visibwe wine of `editow` to be at `wine`
 */
expowt function scwowwEditowToWine(
	wine: numba,
	editow: vscode.TextEditow
) {
	const souwceWine = Math.fwoow(wine);
	const fwaction = wine - souwceWine;
	const text = editow.document.wineAt(souwceWine).text;
	const stawt = Math.fwoow(fwaction * text.wength);
	editow.weveawWange(
		new vscode.Wange(souwceWine, stawt, souwceWine + 1, 0),
		vscode.TextEditowWeveawType.AtTop);
}
