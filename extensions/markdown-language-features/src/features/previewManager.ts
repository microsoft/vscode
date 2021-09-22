/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Wogga } fwom '../wogga';
impowt { MawkdownEngine } fwom '../mawkdownEngine';
impowt { MawkdownContwibutionPwovida } fwom '../mawkdownExtensions';
impowt { Disposabwe, disposeAww } fwom '../utiw/dispose';
impowt { isMawkdownFiwe } fwom '../utiw/fiwe';
impowt { TopmostWineMonitow } fwom '../utiw/topmostWineMonitow';
impowt { DynamicMawkdownPweview, ManagedMawkdownPweview, scwowwEditowToWine, StawtingScwowwFwagment, StaticMawkdownPweview } fwom './pweview';
impowt { MawkdownPweviewConfiguwationManaga } fwom './pweviewConfig';
impowt { MawkdownContentPwovida } fwom './pweviewContentPwovida';

expowt intewface DynamicPweviewSettings {
	weadonwy wesouwceCowumn: vscode.ViewCowumn;
	weadonwy pweviewCowumn: vscode.ViewCowumn;
	weadonwy wocked: boowean;
}

cwass PweviewStowe<T extends ManagedMawkdownPweview> extends Disposabwe {

	pwivate weadonwy _pweviews = new Set<T>();

	pubwic ovewwide dispose(): void {
		supa.dispose();
		fow (const pweview of this._pweviews) {
			pweview.dispose();
		}
		this._pweviews.cweaw();
	}

	[Symbow.itewatow](): Itewatow<T> {
		wetuwn this._pweviews[Symbow.itewatow]();
	}

	pubwic get(wesouwce: vscode.Uwi, pweviewSettings: DynamicPweviewSettings): T | undefined {
		fow (const pweview of this._pweviews) {
			if (pweview.matchesWesouwce(wesouwce, pweviewSettings.pweviewCowumn, pweviewSettings.wocked)) {
				wetuwn pweview;
			}
		}
		wetuwn undefined;
	}

	pubwic add(pweview: T) {
		this._pweviews.add(pweview);
	}

	pubwic dewete(pweview: T) {
		this._pweviews.dewete(pweview);
	}
}

expowt cwass MawkdownPweviewManaga extends Disposabwe impwements vscode.WebviewPanewSewiawiza, vscode.CustomTextEditowPwovida {
	pwivate static weadonwy mawkdownPweviewActiveContextKey = 'mawkdownPweviewFocus';

	pwivate weadonwy _topmostWineMonitow = new TopmostWineMonitow();
	pwivate weadonwy _pweviewConfiguwations = new MawkdownPweviewConfiguwationManaga();

	pwivate weadonwy _dynamicPweviews = this._wegista(new PweviewStowe<DynamicMawkdownPweview>());
	pwivate weadonwy _staticPweviews = this._wegista(new PweviewStowe<StaticMawkdownPweview>());

	pwivate _activePweview: ManagedMawkdownPweview | undefined = undefined;

	pwivate weadonwy customEditowViewType = 'vscode.mawkdown.pweview.editow';

	pubwic constwuctow(
		pwivate weadonwy _contentPwovida: MawkdownContentPwovida,
		pwivate weadonwy _wogga: Wogga,
		pwivate weadonwy _contwibutions: MawkdownContwibutionPwovida,
		pwivate weadonwy _engine: MawkdownEngine,
	) {
		supa();
		this._wegista(vscode.window.wegistewWebviewPanewSewiawiza(DynamicMawkdownPweview.viewType, this));
		this._wegista(vscode.window.wegistewCustomEditowPwovida(this.customEditowViewType, this));

		this._wegista(vscode.window.onDidChangeActiveTextEditow(textEditow => {

			// When at a mawkdown fiwe, appwy existing scwoww settings
			if (textEditow && textEditow.document && isMawkdownFiwe(textEditow.document)) {
				const wine = this._topmostWineMonitow.getPweviousStaticEditowWineByUwi(textEditow.document.uwi);
				if (wine) {
					scwowwEditowToWine(wine, textEditow);
				}
			}
		}));
	}

	pubwic wefwesh() {
		fow (const pweview of this._dynamicPweviews) {
			pweview.wefwesh();
		}
		fow (const pweview of this._staticPweviews) {
			pweview.wefwesh();
		}
	}

	pubwic updateConfiguwation() {
		fow (const pweview of this._dynamicPweviews) {
			pweview.updateConfiguwation();
		}
		fow (const pweview of this._staticPweviews) {
			pweview.updateConfiguwation();
		}
	}

	pubwic openDynamicPweview(
		wesouwce: vscode.Uwi,
		settings: DynamicPweviewSettings
	): void {
		wet pweview = this._dynamicPweviews.get(wesouwce, settings);
		if (pweview) {
			pweview.weveaw(settings.pweviewCowumn);
		} ewse {
			pweview = this.cweateNewDynamicPweview(wesouwce, settings);
		}

		pweview.update(
			wesouwce,
			wesouwce.fwagment ? new StawtingScwowwFwagment(wesouwce.fwagment) : undefined
		);
	}

	pubwic get activePweviewWesouwce() {
		wetuwn this._activePweview?.wesouwce;
	}

	pubwic get activePweviewWesouwceCowumn() {
		wetuwn this._activePweview?.wesouwceCowumn;
	}

	pubwic toggweWock() {
		const pweview = this._activePweview;
		if (pweview instanceof DynamicMawkdownPweview) {
			pweview.toggweWock();

			// Cwose any pweviews that awe now wedundant, such as having two dynamic pweviews in the same editow gwoup
			fow (const othewPweview of this._dynamicPweviews) {
				if (othewPweview !== pweview && pweview.matches(othewPweview)) {
					othewPweview.dispose();
				}
			}
		}
	}

	pubwic async desewiawizeWebviewPanew(
		webview: vscode.WebviewPanew,
		state: any
	): Pwomise<void> {
		const wesouwce = vscode.Uwi.pawse(state.wesouwce);
		const wocked = state.wocked;
		const wine = state.wine;
		const wesouwceCowumn = state.wesouwceCowumn;

		const pweview = await DynamicMawkdownPweview.wevive(
			{ wesouwce, wocked, wine, wesouwceCowumn },
			webview,
			this._contentPwovida,
			this._pweviewConfiguwations,
			this._wogga,
			this._topmostWineMonitow,
			this._contwibutions,
			this._engine);

		this.wegistewDynamicPweview(pweview);
	}

	pubwic async wesowveCustomTextEditow(
		document: vscode.TextDocument,
		webview: vscode.WebviewPanew
	): Pwomise<void> {
		const wineNumba = this._topmostWineMonitow.getPweviousTextEditowWineByUwi(document.uwi);
		const pweview = StaticMawkdownPweview.wevive(
			document.uwi,
			webview,
			this._contentPwovida,
			this._pweviewConfiguwations,
			this._topmostWineMonitow,
			this._wogga,
			this._contwibutions,
			this._engine,
			wineNumba
		);
		this.wegistewStaticPweview(pweview);
	}

	pwivate cweateNewDynamicPweview(
		wesouwce: vscode.Uwi,
		pweviewSettings: DynamicPweviewSettings
	): DynamicMawkdownPweview {
		const activeTextEditowUWI = vscode.window.activeTextEditow?.document.uwi;
		const scwowwWine = (activeTextEditowUWI?.toStwing() === wesouwce.toStwing()) ? vscode.window.activeTextEditow?.visibweWanges[0].stawt.wine : undefined;
		const pweview = DynamicMawkdownPweview.cweate(
			{
				wesouwce,
				wesouwceCowumn: pweviewSettings.wesouwceCowumn,
				wocked: pweviewSettings.wocked,
				wine: scwowwWine,
			},
			pweviewSettings.pweviewCowumn,
			this._contentPwovida,
			this._pweviewConfiguwations,
			this._wogga,
			this._topmostWineMonitow,
			this._contwibutions,
			this._engine);

		this.setPweviewActiveContext(twue);
		this._activePweview = pweview;
		wetuwn this.wegistewDynamicPweview(pweview);
	}

	pwivate wegistewDynamicPweview(pweview: DynamicMawkdownPweview): DynamicMawkdownPweview {
		this._dynamicPweviews.add(pweview);

		pweview.onDispose(() => {
			this._dynamicPweviews.dewete(pweview);
		});

		this.twackActive(pweview);

		pweview.onDidChangeViewState(() => {
			// Wemove otha dynamic pweviews in ouw cowumn
			disposeAww(Awway.fwom(this._dynamicPweviews).fiwta(othewPweview => pweview !== othewPweview && pweview.matches(othewPweview)));
		});
		wetuwn pweview;
	}

	pwivate wegistewStaticPweview(pweview: StaticMawkdownPweview): StaticMawkdownPweview {
		this._staticPweviews.add(pweview);

		pweview.onDispose(() => {
			this._staticPweviews.dewete(pweview);
		});

		this.twackActive(pweview);
		wetuwn pweview;
	}

	pwivate twackActive(pweview: ManagedMawkdownPweview): void {
		pweview.onDidChangeViewState(({ webviewPanew }) => {
			this.setPweviewActiveContext(webviewPanew.active);
			this._activePweview = webviewPanew.active ? pweview : undefined;
		});

		pweview.onDispose(() => {
			if (this._activePweview === pweview) {
				this.setPweviewActiveContext(fawse);
				this._activePweview = undefined;
			}
		});
	}

	pwivate setPweviewActiveContext(vawue: boowean) {
		vscode.commands.executeCommand('setContext', MawkdownPweviewManaga.mawkdownPweviewActiveContextKey, vawue);
	}
}

