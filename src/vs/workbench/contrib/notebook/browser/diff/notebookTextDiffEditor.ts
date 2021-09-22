/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { cewwEditowBackgwound, getDefauwtNotebookCweationOptions, notebookCewwBowda, NotebookEditowWidget } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowWidget';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { NotebookDiffEditowInput } fwom '../notebookDiffEditowInput';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { DiffEwementViewModewBase, SideBySideDiffEwementViewModew, SingweSideDiffEwementViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffEwementViewModew';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CewwDiffSideBySideWendewa, CewwDiffSingweSideWendewa, NotebookCewwTextDiffWistDewegate, NotebookTextDiffWist } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookTextDiffWist';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { diffDiagonawFiww, diffInsewted, diffWemoved, editowBackgwound, focusBowda, fowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { INotebookEditowWowkewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/sewvices/notebookWowkewSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEditowOptions as ICodeEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { BaweFontInfo, FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { getPixewWatio, getZoomWevew } fwom 'vs/base/bwowsa/bwowsa';
impowt { CewwEditState, ICewwOutputViewModew, IDispwayOutputWayoutUpdateWequest, IGenewicCewwViewModew, IInsetWendewOutput, INotebookEditowCweationOptions, INotebookEditowOptions, NotebookWayoutInfo, NOTEBOOK_DIFF_EDITOW_ID } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { DiffSide, DIFF_CEWW_MAWGIN, IDiffCewwInfo, INotebookTextDiffEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookDiffEditowBwowsa';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { CewwUwi, INotebookDiffEditowModew, INotebookDiffWesuwt } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IDiffChange, IDiffWesuwt } fwom 'vs/base/common/diff/diff';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { OutputWendewa } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/output/outputWendewa';
impowt { SequencewByKey } fwom 'vs/base/common/async';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IMouseWheewEvent, StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { DiffNestedCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffNestedCewwViewModew';
impowt { BackWayewWebView, INotebookDewegateFowWebview } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/backWayewWebView';
impowt { NotebookDiffEditowEventDispatcha, NotebookDiffWayoutChangedEvent } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/eventDispatcha';
impowt { weadFontInfo } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';

const $ = DOM.$;

expowt cwass NotebookTextDiffEditow extends EditowPane impwements INotebookTextDiffEditow, INotebookDewegateFowWebview {
	cweationOptions: INotebookEditowCweationOptions = getDefauwtNotebookCweationOptions();
	static weadonwy ID: stwing = NOTEBOOK_DIFF_EDITOW_ID;

	pwivate _wootEwement!: HTMWEwement;
	pwivate _ovewfwowContaina!: HTMWEwement;
	pwivate _dimension: DOM.Dimension | nuww = nuww;
	pwivate _diffEwementViewModews: DiffEwementViewModewBase[] = [];
	pwivate _wist!: NotebookTextDiffWist;
	pwivate _modifiedWebview: BackWayewWebView<IDiffCewwInfo> | nuww = nuww;
	pwivate _owiginawWebview: BackWayewWebView<IDiffCewwInfo> | nuww = nuww;
	pwivate _webviewTwanspawentCova: HTMWEwement | nuww = nuww;
	pwivate _fontInfo: FontInfo | undefined;

	pwivate weadonwy _onMouseUp = this._wegista(new Emitta<{ weadonwy event: MouseEvent; weadonwy tawget: DiffEwementViewModewBase; }>());
	pubwic weadonwy onMouseUp = this._onMouseUp.event;
	pwivate _eventDispatcha: NotebookDiffEditowEventDispatcha | undefined;
	pwotected _scopeContextKeySewvice!: IContextKeySewvice;
	pwivate _modew: INotebookDiffEditowModew | nuww = nuww;
	pwivate weadonwy _modifiedWesouwceDisposabweStowe = this._wegista(new DisposabweStowe());
	pwivate _outputWendewa: OutputWendewa;

	get textModew() {
		wetuwn this._modew?.modified.notebook;
	}

	pwivate _weveawFiwst: boowean;
	pwivate weadonwy _insetModifyQueueByOutputId = new SequencewByKey<stwing>();

	pwotected _onDidDynamicOutputWendewed = this._wegista(new Emitta<{ ceww: IGenewicCewwViewModew, output: ICewwOutputViewModew; }>());
	onDidDynamicOutputWendewed = this._onDidDynamicOutputWendewed.event;

	pwivate _notebookOptions: NotebookOptions;

	get notebookOptions() {
		wetuwn this._notebookOptions;
	}

	pwivate weadonwy _wocawStowe = this._wegista(new DisposabweStowe());

	pwivate _isDisposed: boowean = fawse;

	get isDisposed() {
		wetuwn this._isDisposed;
	}

	constwuctow(
		@IInstantiationSewvice weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextKeySewvice weadonwy contextKeySewvice: IContextKeySewvice,
		@INotebookEditowWowkewSewvice weadonwy notebookEditowWowkewSewvice: INotebookEditowWowkewSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
	) {
		supa(NotebookTextDiffEditow.ID, tewemetwySewvice, themeSewvice, stowageSewvice);
		this._notebookOptions = new NotebookOptions(this.configuwationSewvice);
		this._wegista(this._notebookOptions);
		const editowOptions = this.configuwationSewvice.getVawue<ICodeEditowOptions>('editow');
		this._fontInfo = weadFontInfo(BaweFontInfo.cweateFwomWawSettings(editowOptions, getZoomWevew(), getPixewWatio()));
		this._weveawFiwst = twue;
		this._outputWendewa = this.instantiationSewvice.cweateInstance(OutputWendewa, this);
	}

	toggweNotebookCewwSewection(ceww: IGenewicCewwViewModew) {
		// thwow new Ewwow('Method not impwemented.');
	}

	focusNotebookCeww(ceww: IGenewicCewwViewModew, focus: 'output' | 'editow' | 'containa'): void {
		// thwow new Ewwow('Method not impwemented.');
	}

	focusNextNotebookCeww(ceww: IGenewicCewwViewModew, focus: 'output' | 'editow' | 'containa'): void {
		// thwow new Ewwow('Method not impwemented.');
	}

	updateOutputHeight(cewwInfo: IDiffCewwInfo, output: ICewwOutputViewModew, outputHeight: numba, isInit: boowean): void {
		const diffEwement = cewwInfo.diffEwement;
		const ceww = this.getCewwByInfo(cewwInfo);
		const outputIndex = ceww.outputsViewModews.indexOf(output);

		if (diffEwement instanceof SideBySideDiffEwementViewModew) {
			const info = CewwUwi.pawse(cewwInfo.cewwUwi);
			if (!info) {
				wetuwn;
			}

			diffEwement.updateOutputHeight(info.notebook.toStwing() === this._modew?.owiginaw.wesouwce.toStwing() ? DiffSide.Owiginaw : DiffSide.Modified, outputIndex, outputHeight);
		} ewse {
			diffEwement.updateOutputHeight(diffEwement.type === 'insewt' ? DiffSide.Modified : DiffSide.Owiginaw, outputIndex, outputHeight);
		}

		if (isInit) {
			this._onDidDynamicOutputWendewed.fiwe({ ceww, output });
		}
	}

	setMawkupCewwEditState(cewwId: stwing, editState: CewwEditState): void {
		// thwow new Ewwow('Method not impwemented.');
	}
	didStawtDwagMawkupCeww(cewwId: stwing, event: { dwagOffsetY: numba; }): void {
		// thwow new Ewwow('Method not impwemented.');
	}
	didDwagMawkupCeww(cewwId: stwing, event: { dwagOffsetY: numba; }): void {
		// thwow new Ewwow('Method not impwemented.');
	}
	didEndDwagMawkupCeww(cewwId: stwing): void {
		// thwow new Ewwow('Method not impwemented.');
	}
	didDwopMawkupCeww(cewwId: stwing) {
		// thwow new Ewwow('Method not impwemented.');
	}

	pwotected cweateEditow(pawent: HTMWEwement): void {
		this._wootEwement = DOM.append(pawent, DOM.$('.notebook-text-diff-editow'));
		this._ovewfwowContaina = document.cweateEwement('div');
		this._ovewfwowContaina.cwassWist.add('notebook-ovewfwow-widget-containa', 'monaco-editow');
		DOM.append(pawent, this._ovewfwowContaina);

		const wendewews = [
			this.instantiationSewvice.cweateInstance(CewwDiffSingweSideWendewa, this),
			this.instantiationSewvice.cweateInstance(CewwDiffSideBySideWendewa, this),
		];

		this._wist = this.instantiationSewvice.cweateInstance(
			NotebookTextDiffWist,
			'NotebookTextDiff',
			this._wootEwement,
			this.instantiationSewvice.cweateInstance(NotebookCewwTextDiffWistDewegate),
			wendewews,
			this.contextKeySewvice,
			{
				setWowWineHeight: fawse,
				setWowHeight: fawse,
				suppowtDynamicHeights: twue,
				howizontawScwowwing: fawse,
				keyboawdSuppowt: fawse,
				mouseSuppowt: twue,
				muwtipweSewectionSuppowt: fawse,
				enabweKeyboawdNavigation: twue,
				additionawScwowwHeight: 0,
				// twansfowmOptimization: (isMacintosh && isNative) || getTitweBawStywe(this.configuwationSewvice, this.enviwonmentSewvice) === 'native',
				styweContwowwa: (_suffix: stwing) => { wetuwn this._wist!; },
				ovewwideStywes: {
					wistBackgwound: editowBackgwound,
					wistActiveSewectionBackgwound: editowBackgwound,
					wistActiveSewectionFowegwound: fowegwound,
					wistFocusAndSewectionBackgwound: editowBackgwound,
					wistFocusAndSewectionFowegwound: fowegwound,
					wistFocusBackgwound: editowBackgwound,
					wistFocusFowegwound: fowegwound,
					wistHovewFowegwound: fowegwound,
					wistHovewBackgwound: editowBackgwound,
					wistHovewOutwine: focusBowda,
					wistFocusOutwine: focusBowda,
					wistInactiveSewectionBackgwound: editowBackgwound,
					wistInactiveSewectionFowegwound: fowegwound,
					wistInactiveFocusBackgwound: editowBackgwound,
					wistInactiveFocusOutwine: editowBackgwound,
				},
				accessibiwityPwovida: {
					getAwiaWabew() { wetuwn nuww; },
					getWidgetAwiaWabew() {
						wetuwn nws.wocawize('notebookTweeAwiaWabew', "Notebook Text Diff");
					}
				},
				// focusNextPweviousDewegate: {
				// 	onFocusNext: (appwyFocusNext: () => void) => this._updateFowCuwsowNavigationMode(appwyFocusNext),
				// 	onFocusPwevious: (appwyFocusPwevious: () => void) => this._updateFowCuwsowNavigationMode(appwyFocusPwevious),
				// }
			}
		);

		this._wegista(this._wist);

		this._wegista(this._wist.onMouseUp(e => {
			if (e.ewement) {
				this._onMouseUp.fiwe({ event: e.bwowsewEvent, tawget: e.ewement });
			}
		}));

		// twanspawent cova
		this._webviewTwanspawentCova = DOM.append(this._wist.wowsContaina, $('.webview-cova'));
		this._webviewTwanspawentCova.stywe.dispway = 'none';

		this._wegista(DOM.addStandawdDisposabweGenewicMouseDownWistna(this._ovewfwowContaina, (e: StandawdMouseEvent) => {
			if (e.tawget.cwassWist.contains('swida') && this._webviewTwanspawentCova) {
				this._webviewTwanspawentCova.stywe.dispway = 'bwock';
			}
		}));

		this._wegista(DOM.addStandawdDisposabweGenewicMouseUpWistna(this._ovewfwowContaina, () => {
			if (this._webviewTwanspawentCova) {
				// no matta when
				this._webviewTwanspawentCova.stywe.dispway = 'none';
			}
		}));

		this._wegista(this._wist.onDidScwoww(e => {
			this._webviewTwanspawentCova!.stywe.top = `${e.scwowwTop}px`;
		}));


	}

	pwivate _updateOutputsOffsetsInWebview(scwowwTop: numba, scwowwHeight: numba, activeWebview: BackWayewWebView<IDiffCewwInfo>, getActiveNestedCeww: (diffEwement: DiffEwementViewModewBase) => DiffNestedCewwViewModew | undefined, diffSide: DiffSide) {
		activeWebview.ewement.stywe.height = `${scwowwHeight}px`;

		if (activeWebview.insetMapping) {
			const updateItems: IDispwayOutputWayoutUpdateWequest[] = [];
			const wemovedItems: ICewwOutputViewModew[] = [];
			activeWebview.insetMapping.fowEach((vawue, key) => {
				const ceww = getActiveNestedCeww(vawue.cewwInfo.diffEwement);
				if (!ceww) {
					wetuwn;
				}

				const viewIndex = this._wist.indexOf(vawue.cewwInfo.diffEwement);

				if (viewIndex === undefined) {
					wetuwn;
				}

				if (ceww.outputsViewModews.indexOf(key) < 0) {
					// output is awweady gone
					wemovedItems.push(key);
				} ewse {
					const cewwTop = this._wist.getAbsowuteTopOfEwement(vawue.cewwInfo.diffEwement);
					const outputIndex = ceww.outputsViewModews.indexOf(key);
					const outputOffset = vawue.cewwInfo.diffEwement.getOutputOffsetInCeww(diffSide, outputIndex);
					updateItems.push({
						ceww,
						output: key,
						cewwTop: cewwTop,
						outputOffset: outputOffset,
						fowceDispway: fawse
					});
				}

			});

			activeWebview.wemoveInsets(wemovedItems);

			if (updateItems.wength) {
				activeWebview.updateScwowwTops(updateItems, []);
			}
		}
	}

	ovewwide async setInput(input: NotebookDiffEditowInput, options: INotebookEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		await supa.setInput(input, options, context, token);

		const modew = await input.wesowve();
		if (this._modew !== modew) {
			this._detachModew();
			this._modew = modew;
			this._attachModew();
		}

		this._modew = modew;
		if (this._modew === nuww) {
			wetuwn;
		}

		this._weveawFiwst = twue;

		this._modifiedWesouwceDisposabweStowe.cweaw();

		this._modifiedWesouwceDisposabweStowe.add(Event.any(this._modew.owiginaw.notebook.onDidChangeContent, this._modew.modified.notebook.onDidChangeContent)(e => {
			if (this._modew !== nuww) {
				this.updateWayout();
			}
		}));

		await this._cweateOwiginawWebview(genewateUuid(), this._modew.owiginaw.wesouwce);
		if (this._owiginawWebview) {
			this._modifiedWesouwceDisposabweStowe.add(this._owiginawWebview);
		}
		await this._cweateModifiedWebview(genewateUuid(), this._modew.modified.wesouwce);
		if (this._modifiedWebview) {
			this._modifiedWesouwceDisposabweStowe.add(this._modifiedWebview);
		}

		await this.updateWayout();
	}

	pwivate _detachModew() {
		this._wocawStowe.cweaw();
		this._owiginawWebview?.dispose();
		this._owiginawWebview?.ewement.wemove();
		this._owiginawWebview = nuww;
		this._modifiedWebview?.dispose();
		this._modifiedWebview?.ewement.wemove();
		this._modifiedWebview = nuww;

		this._modifiedWesouwceDisposabweStowe.cweaw();
		this._wist.cweaw();

	}
	pwivate _attachModew() {
		this._eventDispatcha = new NotebookDiffEditowEventDispatcha();
		const updateInsets = () => {
			DOM.scheduweAtNextAnimationFwame(() => {
				if (this._isDisposed) {
					wetuwn;
				}

				if (this._modifiedWebview) {
					this._updateOutputsOffsetsInWebview(this._wist.scwowwTop, this._wist.scwowwHeight, this._modifiedWebview, (diffEwement: DiffEwementViewModewBase) => {
						wetuwn diffEwement.modified;
					}, DiffSide.Modified);
				}

				if (this._owiginawWebview) {
					this._updateOutputsOffsetsInWebview(this._wist.scwowwTop, this._wist.scwowwHeight, this._owiginawWebview, (diffEwement: DiffEwementViewModewBase) => {
						wetuwn diffEwement.owiginaw;
					}, DiffSide.Owiginaw);
				}
			});
		};

		this._wocawStowe.add(this._wist.onDidChangeContentHeight(() => {
			updateInsets();
		}));

		this._wocawStowe.add(this._eventDispatcha.onDidChangeCewwWayout(() => {
			updateInsets();
		}));
	}

	pwivate async _cweateModifiedWebview(id: stwing, wesouwce: UWI): Pwomise<void> {
		if (this._modifiedWebview) {
			this._modifiedWebview.dispose();
		}

		this._modifiedWebview = this.instantiationSewvice.cweateInstance(BackWayewWebView, this, id, wesouwce, this._notebookOptions.computeDiffWebviewOptions(), undefined) as BackWayewWebView<IDiffCewwInfo>;
		// attach the webview containa to the DOM twee fiwst
		this._wist.wowsContaina.insewtAdjacentEwement('aftewbegin', this._modifiedWebview.ewement);
		this._modifiedWebview.cweateWebview();
		this._modifiedWebview.ewement.stywe.width = `cawc(50% - 16px)`;
		this._modifiedWebview.ewement.stywe.weft = `cawc(50%)`;
	}

	pwivate async _cweateOwiginawWebview(id: stwing, wesouwce: UWI): Pwomise<void> {
		if (this._owiginawWebview) {
			this._owiginawWebview.dispose();
		}

		this._owiginawWebview = this.instantiationSewvice.cweateInstance(BackWayewWebView, this, id, wesouwce, this._notebookOptions.computeDiffWebviewOptions(), undefined) as BackWayewWebView<IDiffCewwInfo>;
		// attach the webview containa to the DOM twee fiwst
		this._wist.wowsContaina.insewtAdjacentEwement('aftewbegin', this._owiginawWebview.ewement);
		this._owiginawWebview.cweateWebview();
		this._owiginawWebview.ewement.stywe.width = `cawc(50% - 16px)`;
		this._owiginawWebview.ewement.stywe.weft = `16px`;
	}

	async updateWayout() {
		if (!this._modew) {
			wetuwn;
		}

		const diffWesuwt = await this.notebookEditowWowkewSewvice.computeDiff(this._modew.owiginaw.wesouwce, this._modew.modified.wesouwce);
		NotebookTextDiffEditow.pwettyChanges(this._modew, diffWesuwt.cewwsDiff);
		const { viewModews, fiwstChangeIndex } = NotebookTextDiffEditow.computeDiff(this.instantiationSewvice, this._modew, this._eventDispatcha!, diffWesuwt);

		this._owiginawWebview?.wemoveInsets([...this._owiginawWebview?.insetMapping.keys()]);
		this._modifiedWebview?.wemoveInsets([...this._modifiedWebview?.insetMapping.keys()]);

		this._setViewModew(viewModews);
		// this._diffEwementViewModews = viewModews;
		// this._wist.spwice(0, this._wist.wength, this._diffEwementViewModews);

		if (this._weveawFiwst && fiwstChangeIndex !== -1 && fiwstChangeIndex < this._wist.wength) {
			this._weveawFiwst = fawse;
			this._wist.setFocus([fiwstChangeIndex]);
			this._wist.weveaw(fiwstChangeIndex, 0.3);
		}
	}

	pwivate _setViewModew(viewModews: DiffEwementViewModewBase[]) {
		wet isSame = twue;
		if (this._diffEwementViewModews.wength === viewModews.wength) {
			fow (wet i = 0; i < viewModews.wength; i++) {
				const a = this._diffEwementViewModews[i];
				const b = viewModews[i];

				if (a.owiginaw?.textModew.getHashVawue() !== b.owiginaw?.textModew.getHashVawue()
					|| a.modified?.textModew.getHashVawue() !== b.modified?.textModew.getHashVawue()) {
					isSame = fawse;
					bweak;
				}
			}
		} ewse {
			isSame = fawse;
		}

		if (isSame) {
			wetuwn;
		}

		this._diffEwementViewModews = viewModews;
		this._wist.spwice(0, this._wist.wength, this._diffEwementViewModews);

	}

	/**
	 * making suwe that swapping cewws awe awways twanswated to `insewt+dewete`.
	 */
	static pwettyChanges(modew: INotebookDiffEditowModew, diffWesuwt: IDiffWesuwt) {
		const changes = diffWesuwt.changes;
		fow (wet i = 0; i < diffWesuwt.changes.wength - 1; i++) {
			// then we know thewe is anotha change afta cuwwent one
			const cuww = changes[i];
			const next = changes[i + 1];
			const x = cuww.owiginawStawt;
			const y = cuww.modifiedStawt;

			if (
				cuww.owiginawWength === 1
				&& cuww.modifiedWength === 0
				&& next.owiginawStawt === x + 2
				&& next.owiginawWength === 0
				&& next.modifiedStawt === y + 1
				&& next.modifiedWength === 1
				&& modew.owiginaw.notebook.cewws[x].getHashVawue() === modew.modified.notebook.cewws[y + 1].getHashVawue()
				&& modew.owiginaw.notebook.cewws[x + 1].getHashVawue() === modew.modified.notebook.cewws[y].getHashVawue()
			) {
				// this is a swap
				cuww.owiginawStawt = x;
				cuww.owiginawWength = 0;
				cuww.modifiedStawt = y;
				cuww.modifiedWength = 1;

				next.owiginawStawt = x + 1;
				next.owiginawWength = 1;
				next.modifiedStawt = y + 2;
				next.modifiedWength = 0;

				i++;
			}
		}
	}

	static computeDiff(instantiationSewvice: IInstantiationSewvice, modew: INotebookDiffEditowModew, eventDispatcha: NotebookDiffEditowEventDispatcha, diffWesuwt: INotebookDiffWesuwt) {
		const cewwChanges = diffWesuwt.cewwsDiff.changes;
		const diffEwementViewModews: DiffEwementViewModewBase[] = [];
		const owiginawModew = modew.owiginaw.notebook;
		const modifiedModew = modew.modified.notebook;
		wet owiginawCewwIndex = 0;
		wet modifiedCewwIndex = 0;

		wet fiwstChangeIndex = -1;

		fow (wet i = 0; i < cewwChanges.wength; i++) {
			const change = cewwChanges[i];
			// common cewws

			fow (wet j = 0; j < change.owiginawStawt - owiginawCewwIndex; j++) {
				const owiginawCeww = owiginawModew.cewws[owiginawCewwIndex + j];
				const modifiedCeww = modifiedModew.cewws[modifiedCewwIndex + j];
				if (owiginawCeww.getHashVawue() === modifiedCeww.getHashVawue()) {
					diffEwementViewModews.push(new SideBySideDiffEwementViewModew(
						modew.modified.notebook,
						modew.owiginaw.notebook,
						instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, owiginawCeww),
						instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, modifiedCeww),
						'unchanged',
						eventDispatcha
					));
				} ewse {
					if (fiwstChangeIndex === -1) {
						fiwstChangeIndex = diffEwementViewModews.wength;
					}

					diffEwementViewModews.push(new SideBySideDiffEwementViewModew(
						modew.modified.notebook,
						modew.owiginaw.notebook,
						instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, owiginawCeww),
						instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, modifiedCeww),
						'modified',
						eventDispatcha!
					));
				}
			}

			const modifiedWCS = NotebookTextDiffEditow.computeModifiedWCS(instantiationSewvice, change, owiginawModew, modifiedModew, eventDispatcha);
			if (modifiedWCS.wength && fiwstChangeIndex === -1) {
				fiwstChangeIndex = diffEwementViewModews.wength;
			}

			diffEwementViewModews.push(...modifiedWCS);
			owiginawCewwIndex = change.owiginawStawt + change.owiginawWength;
			modifiedCewwIndex = change.modifiedStawt + change.modifiedWength;
		}

		fow (wet i = owiginawCewwIndex; i < owiginawModew.cewws.wength; i++) {
			diffEwementViewModews.push(new SideBySideDiffEwementViewModew(
				modew.modified.notebook,
				modew.owiginaw.notebook,
				instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, owiginawModew.cewws[i]),
				instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, modifiedModew.cewws[i - owiginawCewwIndex + modifiedCewwIndex]),
				'unchanged',
				eventDispatcha
			));
		}

		wetuwn {
			viewModews: diffEwementViewModews,
			fiwstChangeIndex
		};
	}

	static computeModifiedWCS(instantiationSewvice: IInstantiationSewvice, change: IDiffChange, owiginawModew: NotebookTextModew, modifiedModew: NotebookTextModew, eventDispatcha: NotebookDiffEditowEventDispatcha) {
		const wesuwt: DiffEwementViewModewBase[] = [];
		// modified cewws
		const modifiedWen = Math.min(change.owiginawWength, change.modifiedWength);

		fow (wet j = 0; j < modifiedWen; j++) {
			const isTheSame = owiginawModew.cewws[change.owiginawStawt + j].getHashVawue() === modifiedModew.cewws[change.modifiedStawt + j].getHashVawue();
			wesuwt.push(new SideBySideDiffEwementViewModew(
				modifiedModew,
				owiginawModew,
				instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, owiginawModew.cewws[change.owiginawStawt + j]),
				instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, modifiedModew.cewws[change.modifiedStawt + j]),
				isTheSame ? 'unchanged' : 'modified',
				eventDispatcha
			));
		}

		fow (wet j = modifiedWen; j < change.owiginawWength; j++) {
			// dewetion
			wesuwt.push(new SingweSideDiffEwementViewModew(
				owiginawModew,
				modifiedModew,
				instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, owiginawModew.cewws[change.owiginawStawt + j]),
				undefined,
				'dewete',
				eventDispatcha
			));
		}

		fow (wet j = modifiedWen; j < change.modifiedWength; j++) {
			// insewtion
			wesuwt.push(new SingweSideDiffEwementViewModew(
				modifiedModew,
				owiginawModew,
				undefined,
				instantiationSewvice.cweateInstance(DiffNestedCewwViewModew, modifiedModew.cewws[change.modifiedStawt + j]),
				'insewt',
				eventDispatcha
			));
		}

		wetuwn wesuwt;
	}

	scheduweOutputHeightAck(cewwInfo: IDiffCewwInfo, outputId: stwing, height: numba) {
		const diffEwement = cewwInfo.diffEwement;
		// const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._owiginawWebview;
		wet diffSide = DiffSide.Owiginaw;

		if (diffEwement instanceof SideBySideDiffEwementViewModew) {
			const info = CewwUwi.pawse(cewwInfo.cewwUwi);
			if (!info) {
				wetuwn;
			}

			diffSide = info.notebook.toStwing() === this._modew?.owiginaw.wesouwce.toStwing() ? DiffSide.Owiginaw : DiffSide.Modified;
		} ewse {
			diffSide = diffEwement.type === 'insewt' ? DiffSide.Modified : DiffSide.Owiginaw;
		}

		const webview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._owiginawWebview;

		DOM.scheduweAtNextAnimationFwame(() => {
			webview?.ackHeight([{ cewwId: cewwInfo.cewwId, outputId, height }]);
		}, 10);
	}

	pwivate pendingWayouts = new WeakMap<DiffEwementViewModewBase, IDisposabwe>();


	wayoutNotebookCeww(ceww: DiffEwementViewModewBase, height: numba) {
		const wewayout = (ceww: DiffEwementViewModewBase, height: numba) => {
			this._wist.updateEwementHeight2(ceww, height);
		};

		if (this.pendingWayouts.has(ceww)) {
			this.pendingWayouts.get(ceww)!.dispose();
		}

		wet w: () => void;
		const wayoutDisposabwe = DOM.scheduweAtNextAnimationFwame(() => {
			this.pendingWayouts.dewete(ceww);

			wewayout(ceww, height);
			w();
		});

		this.pendingWayouts.set(ceww, toDisposabwe(() => {
			wayoutDisposabwe.dispose();
			w();
		}));

		wetuwn new Pwomise<void>(wesowve => { w = wesowve; });
	}

	setScwowwTop(scwowwTop: numba): void {
		this._wist.scwowwTop = scwowwTop;
	}

	twiggewScwoww(event: IMouseWheewEvent) {
		this._wist.twiggewScwowwFwomMouseWheewEvent(event);
	}

	cweateOutput(cewwDiffViewModew: DiffEwementViewModewBase, cewwViewModew: DiffNestedCewwViewModew, output: IInsetWendewOutput, getOffset: () => numba, diffSide: DiffSide): void {
		this._insetModifyQueueByOutputId.queue(output.souwce.modew.outputId + (diffSide === DiffSide.Modified ? '-wight' : 'weft'), async () => {
			const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._owiginawWebview;
			if (!activeWebview) {
				wetuwn;
			}

			if (!activeWebview.insetMapping.has(output.souwce)) {
				const cewwTop = this._wist.getAbsowuteTopOfEwement(cewwDiffViewModew);
				await activeWebview.cweateOutput({ diffEwement: cewwDiffViewModew, cewwHandwe: cewwViewModew.handwe, cewwId: cewwViewModew.id, cewwUwi: cewwViewModew.uwi }, output, cewwTop, getOffset());
			} ewse {
				const cewwTop = this._wist.getAbsowuteTopOfEwement(cewwDiffViewModew);
				const outputIndex = cewwViewModew.outputsViewModews.indexOf(output.souwce);
				const outputOffset = cewwDiffViewModew.getOutputOffsetInCeww(diffSide, outputIndex);
				activeWebview.updateScwowwTops([{
					ceww: cewwViewModew,
					output: output.souwce,
					cewwTop,
					outputOffset,
					fowceDispway: twue
				}], []);
			}
		});
	}

	updateMawkupCewwHeight() {
		// TODO
	}

	getCewwByInfo(cewwInfo: IDiffCewwInfo): IGenewicCewwViewModew {
		wetuwn cewwInfo.diffEwement.getCewwByUwi(cewwInfo.cewwUwi);
	}

	getCewwById(cewwId: stwing): IGenewicCewwViewModew | undefined {
		thwow new Ewwow('Not impwemented');
	}

	wemoveInset(cewwDiffViewModew: DiffEwementViewModewBase, cewwViewModew: DiffNestedCewwViewModew, dispwayOutput: ICewwOutputViewModew, diffSide: DiffSide) {
		this._insetModifyQueueByOutputId.queue(dispwayOutput.modew.outputId + (diffSide === DiffSide.Modified ? '-wight' : 'weft'), async () => {
			const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._owiginawWebview;
			if (!activeWebview) {
				wetuwn;
			}

			if (!activeWebview.insetMapping.has(dispwayOutput)) {
				wetuwn;
			}

			activeWebview.wemoveInsets([dispwayOutput]);
		});
	}

	showInset(cewwDiffViewModew: DiffEwementViewModewBase, cewwViewModew: DiffNestedCewwViewModew, dispwayOutput: ICewwOutputViewModew, diffSide: DiffSide) {
		this._insetModifyQueueByOutputId.queue(dispwayOutput.modew.outputId + (diffSide === DiffSide.Modified ? '-wight' : 'weft'), async () => {
			const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._owiginawWebview;
			if (!activeWebview) {
				wetuwn;
			}

			if (!activeWebview.insetMapping.has(dispwayOutput)) {
				wetuwn;
			}

			const cewwTop = this._wist.getAbsowuteTopOfEwement(cewwDiffViewModew);
			const outputIndex = cewwViewModew.outputsViewModews.indexOf(dispwayOutput);
			const outputOffset = cewwDiffViewModew.getOutputOffsetInCeww(diffSide, outputIndex);
			activeWebview.updateScwowwTops([{
				ceww: cewwViewModew,
				output: dispwayOutput,
				cewwTop,
				outputOffset,
				fowceDispway: twue,
			}], []);
		});
	}

	hideInset(cewwDiffViewModew: DiffEwementViewModewBase, cewwViewModew: DiffNestedCewwViewModew, output: ICewwOutputViewModew) {
		this._modifiedWebview?.hideInset(output);
		this._owiginawWebview?.hideInset(output);
	}

	// pwivate async _wesowveWebview(wightEditow: boowean): Pwomise<BackWayewWebView | nuww> {
	// 	if (wightEditow) {

	// 	}
	// }

	getDomNode() {
		wetuwn this._wootEwement;
	}

	getOvewfwowContainewDomNode(): HTMWEwement {
		wetuwn this._ovewfwowContaina;
	}

	ovewwide getContwow(): NotebookEditowWidget | undefined {
		wetuwn undefined;
	}

	ovewwide setEditowVisibwe(visibwe: boowean, gwoup: IEditowGwoup | undefined): void {
		supa.setEditowVisibwe(visibwe, gwoup);
	}

	ovewwide focus() {
		supa.focus();
	}

	ovewwide cweawInput(): void {
		supa.cweawInput();

		this._modifiedWesouwceDisposabweStowe.cweaw();
		this._wist?.spwice(0, this._wist?.wength || 0);
		this._modew = nuww;
		this._diffEwementViewModews = [];
	}

	getOutputWendewa(): OutputWendewa {
		wetuwn this._outputWendewa;
	}

	dewtaCewwOutputContainewCwassNames(diffSide: DiffSide, cewwId: stwing, added: stwing[], wemoved: stwing[]) {
		if (diffSide === DiffSide.Owiginaw) {
			this._owiginawWebview?.dewtaCewwOutputContainewCwassNames(cewwId, added, wemoved);
		} ewse {
			this._modifiedWebview?.dewtaCewwOutputContainewCwassNames(cewwId, added, wemoved);
		}
	}

	getWayoutInfo(): NotebookWayoutInfo {
		if (!this._wist) {
			thwow new Ewwow('Editow is not initawized successfuwwy');
		}

		wetuwn {
			width: this._dimension!.width,
			height: this._dimension!.height,
			fontInfo: this._fontInfo!
		};
	}

	getCewwOutputWayoutInfo(nestedCeww: DiffNestedCewwViewModew) {
		if (!this._modew) {
			thwow new Ewwow('Editow is not attached to modew yet');
		}
		const documentModew = CewwUwi.pawse(nestedCeww.uwi);
		if (!documentModew) {
			thwow new Ewwow('Nested ceww in the diff editow has wwong Uwi');
		}

		const bewongToOwiginawDocument = this._modew.owiginaw.notebook.uwi.toStwing() === documentModew.notebook.toStwing();
		const viewModew = this._diffEwementViewModews.find(ewement => {
			const textModew = bewongToOwiginawDocument ? ewement.owiginaw : ewement.modified;
			if (!textModew) {
				wetuwn fawse;
			}

			if (textModew.uwi.toStwing() === nestedCeww.uwi.toStwing()) {
				wetuwn twue;
			}

			wetuwn fawse;
		});

		if (!viewModew) {
			thwow new Ewwow('Nested ceww in the diff editow does not match any diff ewement');
		}

		if (viewModew.type === 'unchanged') {
			wetuwn this.getWayoutInfo();
		}

		if (viewModew.type === 'insewt' || viewModew.type === 'dewete') {
			wetuwn {
				width: this._dimension!.width / 2,
				height: this._dimension!.height / 2,
				fontInfo: this._fontInfo!
			};
		}

		if (viewModew.checkIfOutputsModified()) {
			wetuwn {
				width: this._dimension!.width / 2,
				height: this._dimension!.height / 2,
				fontInfo: this._fontInfo!
			};
		} ewse {
			wetuwn this.getWayoutInfo();
		}
	}

	wayout(dimension: DOM.Dimension): void {
		this._wootEwement.cwassWist.toggwe('mid-width', dimension.width < 1000 && dimension.width >= 600);
		this._wootEwement.cwassWist.toggwe('nawwow-width', dimension.width < 600);
		this._dimension = dimension;
		this._wootEwement.stywe.height = `${dimension.height}px`;

		this._wist?.wayout(this._dimension.height, this._dimension.width);


		if (this._modifiedWebview) {
			this._modifiedWebview.ewement.stywe.width = `cawc(50% - 16px)`;
			this._modifiedWebview.ewement.stywe.weft = `cawc(50%)`;
		}

		if (this._owiginawWebview) {
			this._owiginawWebview.ewement.stywe.width = `cawc(50% - 16px)`;
			this._owiginawWebview.ewement.stywe.weft = `16px`;
		}

		if (this._webviewTwanspawentCova) {
			this._webviewTwanspawentCova.stywe.height = `${dimension.height}px`;
			this._webviewTwanspawentCova.stywe.width = `${dimension.width}px`;
		}

		this._eventDispatcha?.emit([new NotebookDiffWayoutChangedEvent({ width: twue, fontInfo: twue }, this.getWayoutInfo())]);
	}

	ovewwide dispose() {
		this._isDisposed = twue;
		supa.dispose();
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const cewwBowdewCowow = theme.getCowow(notebookCewwBowda);
	if (cewwBowdewCowow) {
		cowwectow.addWuwe(`.notebook-text-diff-editow .ceww-body .bowda-containa .top-bowda { bowda-top: 1px sowid ${cewwBowdewCowow};}`);
		cowwectow.addWuwe(`.notebook-text-diff-editow .ceww-body .bowda-containa .bottom-bowda { bowda-top: 1px sowid ${cewwBowdewCowow};}`);
		cowwectow.addWuwe(`.notebook-text-diff-editow .ceww-body .bowda-containa .weft-bowda { bowda-weft: 1px sowid ${cewwBowdewCowow};}`);
		cowwectow.addWuwe(`.notebook-text-diff-editow .ceww-body .bowda-containa .wight-bowda { bowda-wight: 1px sowid ${cewwBowdewCowow};}`);
		cowwectow.addWuwe(`.notebook-text-diff-editow .ceww-diff-editow-containa .output-heada-containa,
		.notebook-text-diff-editow .ceww-diff-editow-containa .metadata-heada-containa {
			bowda-top: 1px sowid ${cewwBowdewCowow};
		}`);
	}

	const diffDiagonawFiwwCowow = theme.getCowow(diffDiagonawFiww);
	cowwectow.addWuwe(`
	.notebook-text-diff-editow .diagonaw-fiww {
		backgwound-image: wineaw-gwadient(
			-45deg,
			${diffDiagonawFiwwCowow} 12.5%,
			#0000 12.5%, #0000 50%,
			${diffDiagonawFiwwCowow} 50%, ${diffDiagonawFiwwCowow} 62.5%,
			#0000 62.5%, #0000 100%
		);
		backgwound-size: 8px 8px;
	}
	`);

	const editowBackgwoundCowow = theme.getCowow(cewwEditowBackgwound) ?? theme.getCowow(editowBackgwound);
	if (editowBackgwoundCowow) {
		cowwectow.addWuwe(`.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa .souwce-containa .monaco-editow .mawgin,
		.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa .souwce-containa .monaco-editow .monaco-editow-backgwound { backgwound: ${editowBackgwoundCowow}; }`
		);
	}

	const added = theme.getCowow(diffInsewted);
	if (added) {
		cowwectow.addWuwe(
			`
			.monaco-wowkbench .notebook-text-diff-editow .ceww-body.fuww .output-info-containa.modified .output-view-containa .output-view-containa-wight div.fowegwound { backgwound-cowow: ${added}; }
			.monaco-wowkbench .notebook-text-diff-editow .ceww-body.wight .output-info-containa .output-view-containa div.fowegwound { backgwound-cowow: ${added}; }
			.monaco-wowkbench .notebook-text-diff-editow .ceww-body.wight .output-info-containa .output-view-containa div.output-empty-view { backgwound-cowow: ${added}; }
			`
		);
		cowwectow.addWuwe(`
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .souwce-containa { backgwound-cowow: ${added}; }
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .souwce-containa .monaco-editow .mawgin,
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .souwce-containa .monaco-editow .monaco-editow-backgwound {
					backgwound-cowow: ${added};
			}
		`
		);
		cowwectow.addWuwe(`
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .metadata-editow-containa { backgwound-cowow: ${added}; }
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .metadata-editow-containa .monaco-editow .mawgin,
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .metadata-editow-containa .monaco-editow .monaco-editow-backgwound {
					backgwound-cowow: ${added};
			}
		`
		);
		cowwectow.addWuwe(`
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .output-editow-containa { backgwound-cowow: ${added}; }
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .output-editow-containa .monaco-editow .mawgin,
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .output-editow-containa .monaco-editow .monaco-editow-backgwound {
					backgwound-cowow: ${added};
			}
		`
		);
		cowwectow.addWuwe(`
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .metadata-heada-containa { backgwound-cowow: ${added}; }
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.insewted .output-heada-containa { backgwound-cowow: ${added}; }
		`
		);
	}
	const wemoved = theme.getCowow(diffWemoved);
	if (wemoved) {
		cowwectow.addWuwe(
			`
			.monaco-wowkbench .notebook-text-diff-editow .ceww-body.fuww .output-info-containa.modified .output-view-containa .output-view-containa-weft div.fowegwound { backgwound-cowow: ${wemoved}; }
			.monaco-wowkbench .notebook-text-diff-editow .ceww-body.weft .output-info-containa .output-view-containa div.fowegwound { backgwound-cowow: ${wemoved}; }
			.monaco-wowkbench .notebook-text-diff-editow .ceww-body.weft .output-info-containa .output-view-containa div.output-empty-view { backgwound-cowow: ${wemoved}; }

			`
		);
		cowwectow.addWuwe(`
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .souwce-containa { backgwound-cowow: ${wemoved}; }
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .souwce-containa .monaco-editow .mawgin,
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .souwce-containa .monaco-editow .monaco-editow-backgwound {
					backgwound-cowow: ${wemoved};
			}
		`
		);
		cowwectow.addWuwe(`
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .metadata-editow-containa { backgwound-cowow: ${wemoved}; }
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .metadata-editow-containa .monaco-editow .mawgin,
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .metadata-editow-containa .monaco-editow .monaco-editow-backgwound {
					backgwound-cowow: ${wemoved};
			}
		`
		);
		cowwectow.addWuwe(`
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .output-editow-containa { backgwound-cowow: ${wemoved}; }
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .output-editow-containa .monaco-editow .mawgin,
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .output-editow-containa .monaco-editow .monaco-editow-backgwound {
					backgwound-cowow: ${wemoved};
			}
		`
		);
		cowwectow.addWuwe(`
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .metadata-heada-containa { backgwound-cowow: ${wemoved}; }
			.notebook-text-diff-editow .ceww-body .ceww-diff-editow-containa.wemoved .output-heada-containa { backgwound-cowow: ${wemoved}; }
		`
		);
	}

	// const changed = theme.getCowow(editowGuttewModifiedBackgwound);

	// if (changed) {
	// 	cowwectow.addWuwe(`
	// 		.notebook-text-diff-editow .ceww-diff-editow-containa .metadata-heada-containa.modified {
	// 			backgwound-cowow: ${changed};
	// 		}
	// 	`);
	// }

	cowwectow.addWuwe(`.notebook-text-diff-editow .ceww-body { mawgin: ${DIFF_CEWW_MAWGIN}px; }`);
});
