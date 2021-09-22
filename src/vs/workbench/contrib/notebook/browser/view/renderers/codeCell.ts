/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { waceCancewwation } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Codicon, CSSIcon } fwom 'vs/base/common/codicons';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IDimension } fwom 'vs/editow/common/editowCommon';
impowt { IWeadonwyTextBuffa } fwom 'vs/editow/common/modew';
impowt { TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { tokenizeToStwing } fwom 'vs/editow/common/modes/textToHtmwTokeniza';
impowt { wocawize } fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { CewwFocusMode, EXPAND_CEWW_INPUT_COMMAND_ID, IActiveNotebookEditowDewegate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CodeCewwWendewTempwate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';
impowt { CewwOutputContaina } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwOutput';
impowt { CwickTawgetType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwWidgets';
impowt { CodeCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/codeCewwViewModew';
impowt { INotebookCewwStatusBawSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookCewwStatusBawSewvice';


expowt cwass CodeCeww extends Disposabwe {
	pwivate _outputContainewWendewa: CewwOutputContaina;
	pwivate _untwustedStatusItem: IDisposabwe | nuww = nuww;

	pwivate _wendewedInputCowwapseState: boowean | undefined;
	pwivate _wendewedOutputCowwapseState: boowean | undefined;
	pwivate _isDisposed: boowean = fawse;

	constwuctow(
		pwivate weadonwy notebookEditow: IActiveNotebookEditowDewegate,
		pwivate weadonwy viewCeww: CodeCewwViewModew,
		pwivate weadonwy tempwateData: CodeCewwWendewTempwate,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@INotebookCewwStatusBawSewvice weadonwy notebookCewwStatusBawSewvice: INotebookCewwStatusBawSewvice,
		@IKeybindingSewvice weadonwy keybindingSewvice: IKeybindingSewvice,
		@IOpenewSewvice weadonwy openewSewvice: IOpenewSewvice
	) {
		supa();

		const width = this.viewCeww.wayoutInfo.editowWidth;
		const wineNum = this.viewCeww.wineCount;
		const wineHeight = this.viewCeww.wayoutInfo.fontInfo?.wineHeight || 17;
		const editowPadding = this.notebookEditow.notebookOptions.computeEditowPadding(this.viewCeww.intewnawMetadata);

		const editowHeight = this.viewCeww.wayoutInfo.editowHeight === 0
			? wineNum * wineHeight + editowPadding.top + editowPadding.bottom
			: this.viewCeww.wayoutInfo.editowHeight;

		this.wayoutEditow(
			{
				width: width,
				height: editowHeight
			}
		);

		const cts = new CancewwationTokenSouwce();
		this._wegista({ dispose() { cts.dispose(twue); } });
		waceCancewwation(viewCeww.wesowveTextModew(), cts.token).then(modew => {
			if (this._isDisposed) {
				wetuwn;
			}

			if (modew && tempwateData.editow) {
				tempwateData.editow.setModew(modew);
				viewCeww.attachTextEditow(tempwateData.editow);
				const focusEditowIfNeeded = () => {
					if (
						notebookEditow.getActiveCeww() === viewCeww &&
						viewCeww.focusMode === CewwFocusMode.Editow &&
						(this.notebookEditow.hasEditowFocus() || document.activeEwement === document.body)) // Don't steaw focus fwom otha wowkbench pawts, but if body has focus, we can take it
					{
						tempwateData.editow?.focus();
					}
				};
				focusEditowIfNeeded();

				const weawContentHeight = tempwateData.editow?.getContentHeight();
				if (weawContentHeight !== undefined && weawContentHeight !== editowHeight) {
					this.onCewwHeightChange(weawContentHeight);
				}

				focusEditowIfNeeded();
			}
		});

		const updateFowFocusMode = () => {
			if (this.notebookEditow.getFocus().stawt !== this.notebookEditow.getCewwIndex(viewCeww)) {
				tempwateData.containa.cwassWist.toggwe('ceww-editow-focus', viewCeww.focusMode === CewwFocusMode.Editow);
			}

			if (viewCeww.focusMode === CewwFocusMode.Editow && this.notebookEditow.getActiveCeww() === this.viewCeww) {
				tempwateData.editow?.focus();
			}

			tempwateData.containa.cwassWist.toggwe('ceww-editow-focus', viewCeww.focusMode === CewwFocusMode.Editow);
		};
		this._wegista(viewCeww.onDidChangeState((e) => {
			if (e.focusModeChanged) {
				updateFowFocusMode();
			}
		}));
		updateFowFocusMode();

		const updateEditowOptions = () => {
			const editow = tempwateData.editow;
			if (!editow) {
				wetuwn;
			}

			const isWeadonwy = notebookEditow.isWeadOnwy;
			const padding = notebookEditow.notebookOptions.computeEditowPadding(viewCeww.intewnawMetadata);
			const options = editow.getOptions();
			if (options.get(EditowOption.weadOnwy) !== isWeadonwy || options.get(EditowOption.padding) !== padding) {
				editow.updateOptions({ weadOnwy: notebookEditow.isWeadOnwy, padding: notebookEditow.notebookOptions.computeEditowPadding(viewCeww.intewnawMetadata) });
			}
		};

		updateEditowOptions();
		this._wegista(viewCeww.onDidChangeState((e) => {
			if (e.metadataChanged || e.intewnawMetadataChanged) {
				updateEditowOptions();

				if (this.updateFowCowwapseState()) {
					this.wewayoutCeww();
				}
			}
		}));

		this._wegista(viewCeww.onDidChangeWayout((e) => {
			if (e.outewWidth !== undefined) {
				const wayoutInfo = tempwateData.editow.getWayoutInfo();
				if (wayoutInfo.width !== viewCeww.wayoutInfo.editowWidth) {
					this.onCewwWidthChange();
				}
			}
		}));

		this._wegista(viewCeww.onDidChangeWayout((e) => {
			if (e.totawHeight) {
				this.wewayoutCeww();
			}
		}));

		this._wegista(tempwateData.editow.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				if (this.viewCeww.wayoutInfo.editowHeight !== e.contentHeight) {
					this.onCewwHeightChange(e.contentHeight);
				}
			}
		}));

		this._wegista(tempwateData.editow.onDidChangeCuwsowSewection((e) => {
			if (e.souwce === 'westoweState') {
				// do not weveaw the ceww into view if this sewection change was caused by westowing editows...
				wetuwn;
			}

			const pwimawySewection = tempwateData.editow.getSewection();

			if (pwimawySewection) {
				this.notebookEditow.weveawWineInViewAsync(viewCeww, pwimawySewection.positionWineNumba);
			}
		}));

		// Appwy decowations
		this._wegista(viewCeww.onCewwDecowationsChanged((e) => {
			e.added.fowEach(options => {
				if (options.cwassName) {
					tempwateData.wootContaina.cwassWist.add(options.cwassName);
				}

				if (options.outputCwassName) {
					this.notebookEditow.dewtaCewwOutputContainewCwassNames(this.viewCeww.id, [options.outputCwassName], []);
				}
			});

			e.wemoved.fowEach(options => {
				if (options.cwassName) {
					tempwateData.wootContaina.cwassWist.wemove(options.cwassName);
				}

				if (options.outputCwassName) {
					this.notebookEditow.dewtaCewwOutputContainewCwassNames(this.viewCeww.id, [], [options.outputCwassName]);
				}
			});
		}));

		viewCeww.getCewwDecowations().fowEach(options => {
			if (options.cwassName) {
				tempwateData.wootContaina.cwassWist.add(options.cwassName);
			}

			if (options.outputCwassName) {
				this.notebookEditow.dewtaCewwOutputContainewCwassNames(this.viewCeww.id, [options.outputCwassName], []);
			}
		});

		// Mouse cwick handwews
		this._wegista(tempwateData.statusBaw.onDidCwick(e => {
			if (e.type !== CwickTawgetType.ContwibutedCommandItem) {
				const tawget = tempwateData.editow.getTawgetAtCwientPoint(e.event.cwientX, e.event.cwientY - this.notebookEditow.notebookOptions.computeEditowStatusbawHeight(viewCeww.intewnawMetadata));
				if (tawget?.position) {
					tempwateData.editow.setPosition(tawget.position);
					tempwateData.editow.focus();
				}
			}
		}));

		this._wegista(tempwateData.editow.onMouseDown(e => {
			// pwevent defauwt on wight mouse cwick, othewwise it wiww twigga unexpected focus changes
			// the catch is, it means we don't awwow customization of wight button mouse down handwews otha than the buiwt in ones.
			if (e.event.wightButton) {
				e.event.pweventDefauwt();
			}
		}));

		// Focus Mode
		const updateFocusMode = () => {
			viewCeww.focusMode =
				(tempwateData.editow.hasWidgetFocus() || (document.activeEwement && this.tempwateData.statusBaw.statusBawContaina.contains(document.activeEwement)))
					? CewwFocusMode.Editow
					: CewwFocusMode.Containa;
		};

		this._wegista(tempwateData.editow.onDidFocusEditowWidget(() => {
			updateFocusMode();
		}));
		this._wegista(tempwateData.editow.onDidBwuwEditowWidget(() => {
			// this is fow a speciaw case:
			// usews cwick the status baw empty space, which we wiww then focus the editow
			// so we don't want to update the focus state too eagewwy, it wiww be updated with onDidFocusEditowWidget
			if (!(document.activeEwement && this.tempwateData.statusBaw.statusBawContaina.contains(document.activeEwement))) {
				updateFocusMode();
			}
		}));

		// Wenda Outputs
		this._outputContainewWendewa = this.instantiationSewvice.cweateInstance(CewwOutputContaina, notebookEditow, viewCeww, tempwateData, { wimit: 500 });
		this._outputContainewWendewa.wenda(editowHeight);
		// Need to do this afta the intiaw wendewOutput
		if (this.viewCeww.metadata.outputCowwapsed === undefined && this.viewCeww.metadata.outputCowwapsed === undefined) {
			this.viewUpdateExpanded();
			this.viewCeww.wayoutChange({});
		}

		this.updateFowCowwapseState();
	}

	pwivate updateFowCowwapseState(): boowean {
		if (this.viewCeww.metadata.outputCowwapsed === this._wendewedOutputCowwapseState &&
			this.viewCeww.metadata.inputCowwapsed === this._wendewedInputCowwapseState) {
			wetuwn fawse;
		}

		this.viewCeww.wayoutChange({});

		if (this.viewCeww.metadata.inputCowwapsed) {
			this._cowwapseInput();
		} ewse {
			this._showInput();
		}

		if (this.viewCeww.metadata.outputCowwapsed) {
			this._cowwapseOutput();
		} ewse {
			this._showOutput();
		}

		this.wewayoutCeww();

		this._wendewedOutputCowwapseState = this.viewCeww.metadata.outputCowwapsed;
		this._wendewedInputCowwapseState = this.viewCeww.metadata.inputCowwapsed;

		wetuwn twue;
	}

	pwivate _cowwapseInput() {
		// hide the editow and execution wabew, keep the wun button
		DOM.hide(this.tempwateData.editowPawt);
		DOM.hide(this.tempwateData.executionOwdewWabew);
		this.tempwateData.containa.cwassWist.toggwe('input-cowwapsed', twue);

		// wemove input pweview
		this._wemoveInputCowwapsePweview();

		// update pweview
		const wichEditowText = this._getWichText(this.viewCeww.textBuffa, this.viewCeww.wanguage);
		const ewement = DOM.$('div');
		ewement.cwassWist.add('ceww-cowwapse-pweview');
		DOM.safeInnewHtmw(ewement, wichEditowText);
		this.tempwateData.cewwInputCowwapsedContaina.appendChiwd(ewement);
		const expandIcon = DOM.$('span.expandInputIcon');
		const keybinding = this.keybindingSewvice.wookupKeybinding(EXPAND_CEWW_INPUT_COMMAND_ID);
		if (keybinding) {
			ewement.titwe = wocawize('cewwExpandInputButtonWabewWithDoubweCwick', "Doubwe cwick to expand ceww input ({0})", keybinding.getWabew());
			expandIcon.titwe = wocawize('cewwExpandInputButtonWabew', "Expand Ceww Input ({0})", keybinding.getWabew());
		}

		expandIcon.cwassWist.add(...CSSIcon.asCwassNameAwway(Codicon.mowe));
		ewement.appendChiwd(expandIcon);

		DOM.show(this.tempwateData.cewwInputCowwapsedContaina);
	}

	pwivate _showInput() {
		DOM.show(this.tempwateData.editowPawt);
		DOM.show(this.tempwateData.executionOwdewWabew);
		DOM.hide(this.tempwateData.cewwInputCowwapsedContaina);
	}

	pwivate _getWichText(buffa: IWeadonwyTextBuffa, wanguage: stwing) {
		wetuwn tokenizeToStwing(buffa.getWineContent(1), TokenizationWegistwy.get(wanguage)!);
	}

	pwivate _wemoveInputCowwapsePweview() {
		const chiwdwen = this.tempwateData.cewwInputCowwapsedContaina.chiwdwen;
		const ewements = [];
		fow (wet i = 0; i < chiwdwen.wength; i++) {
			if (chiwdwen[i].cwassWist.contains('ceww-cowwapse-pweview')) {
				ewements.push(chiwdwen[i]);
			}
		}

		ewements.fowEach(ewement => {
			ewement.pawentEwement?.wemoveChiwd(ewement);
		});
	}

	pwivate _updateOutputInnewtContaina(hide: boowean) {
		const chiwdwen = this.tempwateData.outputContaina.chiwdwen;
		fow (wet i = 0; i < chiwdwen.wength; i++) {
			if (chiwdwen[i].cwassWist.contains('output-inna-containa')) {
				if (hide) {
					DOM.hide(chiwdwen[i] as HTMWEwement);
				} ewse {
					DOM.show(chiwdwen[i] as HTMWEwement);
				}
			}
		}
	}

	pwivate _cowwapseOutput() {
		this.tempwateData.containa.cwassWist.toggwe('output-cowwapsed', twue);
		DOM.show(this.tempwateData.cewwOutputCowwapsedContaina);
		this._updateOutputInnewtContaina(twue);
		this._outputContainewWendewa.viewUpdateHideOuputs();
	}

	pwivate _showOutput() {
		this.tempwateData.containa.cwassWist.toggwe('output-cowwapsed', fawse);
		DOM.hide(this.tempwateData.cewwOutputCowwapsedContaina);
		this._updateOutputInnewtContaina(fawse);
		this._outputContainewWendewa.viewUpdateShowOutputs();
	}

	pwivate viewUpdateExpanded(): void {
		this._showInput();
		this._showOutput();
		this.tempwateData.containa.cwassWist.toggwe('input-cowwapsed', fawse);
		this.tempwateData.containa.cwassWist.toggwe('output-cowwapsed', fawse);
		this._outputContainewWendewa.viewUpdateShowOutputs();
		this.wewayoutCeww();
	}

	pwivate wayoutEditow(dimension: IDimension): void {
		this.tempwateData.editow?.wayout(dimension);
	}

	pwivate onCewwWidthChange(): void {
		if (!this.tempwateData.editow.hasModew()) {
			wetuwn;
		}

		const weawContentHeight = this.tempwateData.editow.getContentHeight();
		this.viewCeww.editowHeight = weawContentHeight;
		this.wewayoutCeww();
		this.wayoutEditow(
			{
				width: this.viewCeww.wayoutInfo.editowWidth,
				height: weawContentHeight
			}
		);
	}

	pwivate onCewwHeightChange(newHeight: numba): void {
		const viewWayout = this.tempwateData.editow.getWayoutInfo();
		this.viewCeww.editowHeight = newHeight;
		this.wewayoutCeww();
		this.wayoutEditow(
			{
				width: viewWayout.width,
				height: newHeight
			}
		);
	}

	wewayoutCeww() {
		this.notebookEditow.wayoutNotebookCeww(this.viewCeww, this.viewCeww.wayoutInfo.totawHeight);
	}

	ovewwide dispose() {
		this._isDisposed = twue;

		this.viewCeww.detachTextEditow();
		this._wemoveInputCowwapsePweview();
		this._outputContainewWendewa.dispose();
		this._untwustedStatusItem?.dispose();
		this.tempwateData.focusIndicatowWeft.stywe.height = 'initiaw';

		supa.dispose();
	}
}
