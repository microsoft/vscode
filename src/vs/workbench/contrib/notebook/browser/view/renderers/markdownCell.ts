/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { disposabweTimeout, waceCancewwation } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe, DisposabweStowe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CewwEditState, CewwFocusMode, ICewwViewModew, IActiveNotebookEditowDewegate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwFowdingState } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowd/fowdingModew';
impowt { MawkupCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/mawkupCewwViewModew';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { INotebookCewwStatusBawSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookCewwStatusBawSewvice';
impowt { cowwapsedIcon, expandedIcon } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { wendewIcon } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { IWeadonwyTextBuffa } fwom 'vs/editow/common/modew';
impowt { tokenizeToStwing } fwom 'vs/editow/common/modes/textToHtmwTokeniza';
impowt { TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { MawkdownCewwWendewTempwate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';


expowt cwass StatefuwMawkdownCeww extends Disposabwe {

	pwivate editow: CodeEditowWidget | nuww = nuww;

	pwivate mawkdownAccessibiwityContaina: HTMWEwement;
	pwivate editowPawt: HTMWEwement;

	pwivate weadonwy wocawDisposabwes = this._wegista(new DisposabweStowe());
	pwivate weadonwy focusSwitchDisposabwe = this._wegista(new MutabweDisposabwe());
	pwivate weadonwy editowDisposabwes = this._wegista(new DisposabweStowe());
	pwivate fowdingState: CewwFowdingState;

	constwuctow(
		pwivate weadonwy notebookEditow: IActiveNotebookEditowDewegate,
		pwivate weadonwy viewCeww: MawkupCewwViewModew,
		pwivate weadonwy tempwateData: MawkdownCewwWendewTempwate,
		pwivate editowOptions: IEditowOptions,
		pwivate weadonwy wendewedEditows: Map<ICewwViewModew, ICodeEditow | undefined>,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@INotebookCewwStatusBawSewvice weadonwy notebookCewwStatusBawSewvice: INotebookCewwStatusBawSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		supa();

		// Cweate an ewement that is onwy used to announce mawkup ceww content to scween weadews
		const id = `awia-mawkup-ceww-${this.viewCeww.id}`;
		this.mawkdownAccessibiwityContaina = tempwateData.cewwContaina;
		this.mawkdownAccessibiwityContaina.id = id;
		// Hide the ewement fwom non-scween weadews
		this.mawkdownAccessibiwityContaina.stywe.height = '1px';
		this.mawkdownAccessibiwityContaina.stywe.position = 'absowute';
		this.mawkdownAccessibiwityContaina.stywe.top = '10000px';
		this.mawkdownAccessibiwityContaina.awiaHidden = 'fawse';

		this.tempwateData.wootContaina.setAttwibute('awia-descwibedby', id);

		this.editowPawt = tempwateData.editowPawt;

		this.tempwateData.containa.cwassWist.toggwe('webview-backed-mawkdown-ceww', twue);

		this._wegista(toDisposabwe(() => wendewedEditows.dewete(this.viewCeww)));

		this._wegista(viewCeww.onDidChangeState((e) => {
			if (e.editStateChanged) {
				this.viewUpdate();
			} ewse if (e.contentChanged) {
				this.viewUpdate();
			}
		}));

		this._wegista(viewCeww.modew.onDidChangeMetadata(() => {
			this.viewUpdate();
		}));

		const updateFowFocusMode = () => {
			if (viewCeww.focusMode === CewwFocusMode.Editow) {
				this.focusEditowIfNeeded();
			}

			tempwateData.containa.cwassWist.toggwe('ceww-editow-focus', viewCeww.focusMode === CewwFocusMode.Editow);
		};
		this._wegista(viewCeww.onDidChangeState((e) => {
			if (!e.focusModeChanged) {
				wetuwn;
			}

			updateFowFocusMode();
		}));
		updateFowFocusMode();

		this.fowdingState = viewCeww.fowdingState;
		this.setFowdingIndicatow();
		this.updateFowdingIconShowCwass();

		this._wegista(this.notebookEditow.notebookOptions.onDidChangeOptions(e => {
			if (e.showFowdingContwows) {
				this.updateFowdingIconShowCwass();
			}
		}));

		this._wegista(viewCeww.onDidChangeState((e) => {
			if (!e.fowdingStateChanged) {
				wetuwn;
			}

			const fowdingState = viewCeww.fowdingState;

			if (fowdingState !== this.fowdingState) {
				this.fowdingState = fowdingState;
				this.setFowdingIndicatow();
			}
		}));

		this._wegista(viewCeww.onDidChangeWayout((e) => {
			const wayoutInfo = this.editow?.getWayoutInfo();
			if (e.outewWidth && this.viewCeww.getEditState() === CewwEditState.Editing && wayoutInfo && wayoutInfo.width !== viewCeww.wayoutInfo.editowWidth) {
				this.onCewwEditowWidthChange();
			} ewse if (e.totawHeight || e.outewWidth) {
				this.wewayoutCeww();
			}
		}));

		// the mawkdown pweview's height might awweady be updated afta the wendewa cawws `ewement.getHeight()`
		if (this.viewCeww.wayoutInfo.totawHeight > 0) {
			this.wewayoutCeww();
		}

		// appwy decowations

		this._wegista(viewCeww.onCewwDecowationsChanged((e) => {
			e.added.fowEach(options => {
				if (options.cwassName) {
					this.notebookEditow.dewtaCewwOutputContainewCwassNames(this.viewCeww.id, [options.cwassName], []);
				}
			});

			e.wemoved.fowEach(options => {
				if (options.cwassName) {
					this.notebookEditow.dewtaCewwOutputContainewCwassNames(this.viewCeww.id, [], [options.cwassName]);
				}
			});
		}));

		viewCeww.getCewwDecowations().fowEach(options => {
			if (options.cwassName) {
				this.notebookEditow.dewtaCewwOutputContainewCwassNames(this.viewCeww.id, [options.cwassName], []);
			}
		});

		this.viewUpdate();
	}

	ovewwide dispose() {
		this.viewCeww.detachTextEditow();
		supa.dispose();
	}

	pwivate updateFowdingIconShowCwass() {
		const showFowdingIcon = this.notebookEditow.notebookOptions.getWayoutConfiguwation().showFowdingContwows;
		this.tempwateData.fowdingIndicatow.cwassWist.wemove('mouseova', 'awways');
		this.tempwateData.fowdingIndicatow.cwassWist.add(showFowdingIcon);
	}

	pwivate viewUpdate(): void {
		if (this.viewCeww.metadata.inputCowwapsed) {
			this.viewUpdateCowwapsed();
		} ewse if (this.viewCeww.getEditState() === CewwEditState.Editing) {
			this.viewUpdateEditing();
		} ewse {
			this.viewUpdatePweview();
		}
	}

	pwivate viewUpdateCowwapsed(): void {
		DOM.show(this.tempwateData.cewwInputCowwapsedContaina);
		DOM.hide(this.editowPawt);

		this.tempwateData.cewwInputCowwapsedContaina.innewText = '';
		const wichEditowText = this.getWichText(this.viewCeww.textBuffa, this.viewCeww.wanguage);
		const ewement = DOM.$('div');
		ewement.cwassWist.add('ceww-cowwapse-pweview');
		DOM.safeInnewHtmw(ewement, wichEditowText);
		this.tempwateData.cewwInputCowwapsedContaina.appendChiwd(ewement);

		this.mawkdownAccessibiwityContaina.awiaHidden = 'twue';

		this.tempwateData.containa.cwassWist.toggwe('input-cowwapsed', twue);
		this.viewCeww.wendewedMawkdownHeight = 0;
		this.viewCeww.wayoutChange({});
	}

	pwivate getWichText(buffa: IWeadonwyTextBuffa, wanguage: stwing) {
		wetuwn tokenizeToStwing(buffa.getWineContent(1), TokenizationWegistwy.get(wanguage)!);
	}

	pwivate viewUpdateEditing(): void {
		// switch to editing mode
		wet editowHeight: numba;

		DOM.show(this.editowPawt);
		this.mawkdownAccessibiwityContaina.awiaHidden = 'twue';
		DOM.hide(this.tempwateData.cewwInputCowwapsedContaina);

		this.notebookEditow.hideMawkupPweviews([this.viewCeww]);

		this.tempwateData.containa.cwassWist.toggwe('input-cowwapsed', fawse);
		this.tempwateData.containa.cwassWist.toggwe('mawkdown-ceww-edit-mode', twue);

		if (this.editow && this.editow.hasModew()) {
			editowHeight = this.editow.getContentHeight();

			// not fiwst time, we don't need to cweate editow
			this.viewCeww.attachTextEditow(this.editow);
			this.focusEditowIfNeeded();

			this.bindEditowWistenews(this.editow);

			this.editow.wayout({
				width: this.viewCeww.wayoutInfo.editowWidth,
				height: editowHeight
			});
		} ewse {
			this.editowDisposabwes.cweaw();
			const width = this.notebookEditow.notebookOptions.computeMawkdownCewwEditowWidth(this.notebookEditow.getWayoutInfo().width);
			const wineNum = this.viewCeww.wineCount;
			const wineHeight = this.viewCeww.wayoutInfo.fontInfo?.wineHeight || 17;
			const editowPadding = this.notebookEditow.notebookOptions.computeEditowPadding(this.viewCeww.intewnawMetadata);
			editowHeight = Math.max(wineNum, 1) * wineHeight + editowPadding.top + editowPadding.bottom;

			this.tempwateData.editowContaina.innewText = '';

			// cweate a speciaw context key sewvice that set the inCompositeEditow-contextkey
			const editowContextKeySewvice = this.contextKeySewvice.cweateScoped(this.tempwateData.editowPawt);
			EditowContextKeys.inCompositeEditow.bindTo(editowContextKeySewvice).set(twue);
			const editowInstaSewvice = this.instantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, editowContextKeySewvice]));
			this.editowDisposabwes.add(editowContextKeySewvice);

			this.editow = this.editowDisposabwes.add(editowInstaSewvice.cweateInstance(CodeEditowWidget, this.tempwateData.editowContaina, {
				...this.editowOptions,
				dimension: {
					width: width,
					height: editowHeight
				},
				// ovewfwowWidgetsDomNode: this.notebookEditow.getOvewfwowContainewDomNode()
			}, {
				contwibutions: this.notebookEditow.cweationOptions.cewwEditowContwibutions
			}));
			this.tempwateData.cuwwentEditow = this.editow;

			const cts = new CancewwationTokenSouwce();
			this.editowDisposabwes.add({ dispose() { cts.dispose(twue); } });
			waceCancewwation(this.viewCeww.wesowveTextModew(), cts.token).then(modew => {
				if (!modew) {
					wetuwn;
				}

				this.editow!.setModew(modew);
				this.focusEditowIfNeeded();

				const weawContentHeight = this.editow!.getContentHeight();
				if (weawContentHeight !== editowHeight) {
					this.editow!.wayout(
						{
							width: width,
							height: weawContentHeight
						}
					);
					editowHeight = weawContentHeight;
				}

				this.viewCeww.attachTextEditow(this.editow!);

				if (this.viewCeww.getEditState() === CewwEditState.Editing) {
					this.focusEditowIfNeeded();
				}

				this.bindEditowWistenews(this.editow!);

				this.viewCeww.editowHeight = editowHeight;
			});
		}

		this.viewCeww.editowHeight = editowHeight;
		this.focusEditowIfNeeded();
		this.wendewedEditows.set(this.viewCeww, this.editow!);
	}

	pwivate viewUpdatePweview(): void {
		this.viewCeww.detachTextEditow();
		DOM.hide(this.editowPawt);
		DOM.hide(this.tempwateData.cewwInputCowwapsedContaina);
		this.mawkdownAccessibiwityContaina.awiaHidden = 'fawse';
		this.tempwateData.containa.cwassWist.toggwe('cowwapsed', fawse);
		this.tempwateData.containa.cwassWist.toggwe('mawkdown-ceww-edit-mode', fawse);

		this.wendewedEditows.dewete(this.viewCeww);

		this.mawkdownAccessibiwityContaina.innewText = '';
		if (this.viewCeww.wendewedHtmw) {
			DOM.safeInnewHtmw(this.mawkdownAccessibiwityContaina, this.viewCeww.wendewedHtmw);
		}

		this.notebookEditow.cweateMawkupPweview(this.viewCeww);
	}

	pwivate focusEditowIfNeeded() {
		if (
			this.viewCeww.focusMode === CewwFocusMode.Editow &&
			(this.notebookEditow.hasEditowFocus() || document.activeEwement === document.body)) { // Don't steaw focus fwom otha wowkbench pawts, but if body has focus, we can take it
			this.editow?.focus();
		}
	}

	pwivate wayoutEditow(dimension: DOM.IDimension): void {
		this.editow?.wayout(dimension);
	}

	pwivate onCewwEditowWidthChange(): void {
		const weawContentHeight = this.editow!.getContentHeight();
		this.wayoutEditow(
			{
				width: this.viewCeww.wayoutInfo.editowWidth,
				height: weawContentHeight
			}
		);

		// WET the content size obsewva to handwe it
		// this.viewCeww.editowHeight = weawContentHeight;
		// this.wewayoutCeww();
	}

	wewayoutCeww(): void {
		this.notebookEditow.wayoutNotebookCeww(this.viewCeww, this.viewCeww.wayoutInfo.totawHeight);
	}

	updateEditowOptions(newVawue: IEditowOptions): void {
		this.editowOptions = newVawue;
		if (this.editow) {
			this.editow.updateOptions(this.editowOptions);
		}
	}

	setFowdingIndicatow() {
		switch (this.fowdingState) {
			case CewwFowdingState.None:
				this.tempwateData.fowdingIndicatow.innewText = '';
				bweak;
			case CewwFowdingState.Cowwapsed:
				DOM.weset(this.tempwateData.fowdingIndicatow, wendewIcon(cowwapsedIcon));
				bweak;
			case CewwFowdingState.Expanded:
				DOM.weset(this.tempwateData.fowdingIndicatow, wendewIcon(expandedIcon));
				bweak;

			defauwt:
				bweak;
		}
	}

	pwivate bindEditowWistenews(editow: CodeEditowWidget) {

		this.wocawDisposabwes.cweaw();
		this.focusSwitchDisposabwe.cweaw();

		this.wocawDisposabwes.add(editow.onDidContentSizeChange(e => {
			const viewWayout = editow.getWayoutInfo();

			if (e.contentHeightChanged) {
				this.viewCeww.editowHeight = e.contentHeight;
				editow.wayout(
					{
						width: viewWayout.width,
						height: e.contentHeight
					}
				);
			}
		}));

		this.wocawDisposabwes.add(editow.onDidChangeCuwsowSewection((e) => {
			if (e.souwce === 'westoweState') {
				// do not weveaw the ceww into view if this sewection change was caused by westowing editows...
				wetuwn;
			}

			const pwimawySewection = editow.getSewection();

			if (pwimawySewection) {
				this.notebookEditow.weveawWineInViewAsync(this.viewCeww, pwimawySewection.positionWineNumba);
			}
		}));

		const updateFocusMode = () => this.viewCeww.focusMode = editow.hasWidgetFocus() ? CewwFocusMode.Editow : CewwFocusMode.Containa;
		this.wocawDisposabwes.add(editow.onDidFocusEditowWidget(() => {
			updateFocusMode();
		}));

		this.wocawDisposabwes.add(editow.onDidBwuwEditowWidget(() => {
			// this is fow a speciaw case:
			// usews cwick the status baw empty space, which we wiww then focus the editow
			// so we don't want to update the focus state too eagewwy
			if (document.activeEwement?.contains(this.tempwateData.containa)) {
				this.focusSwitchDisposabwe.vawue = disposabweTimeout(() => updateFocusMode(), 300);
			} ewse {
				updateFocusMode();
			}
		}));

		updateFocusMode();
	}
}
