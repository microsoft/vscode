/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { DiffEwementViewModewBase, getFowmatedMetadataJSON, OUTPUT_EDITOW_HEIGHT_MAGIC, PwopewtyFowdingState, SideBySideDiffEwementViewModew, SingweSideDiffEwementViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffEwementViewModew';
impowt { CewwDiffSideBySideWendewTempwate, CewwDiffSingweSideWendewTempwate, DiffSide, DIFF_CEWW_MAWGIN, INotebookTextDiffEditow, NOTEBOOK_DIFF_CEWW_PWOPEWTY, NOTEBOOK_DIFF_CEWW_PWOPEWTY_EXPANDED } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookDiffEditowBwowsa';
impowt { CodeEditowWidget, ICodeEditowWidgetOptions } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { DiffEditowWidget } fwom 'vs/editow/bwowsa/widget/diffEditowWidget';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { CewwEditType, CewwUwi, IOutputDto, NotebookCewwMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IMenu, IMenuSewvice, MenuId, MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { CodiconActionViewItem } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwActionView';
impowt { cowwapsedIcon, expandedIcon } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { OutputContaina } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffEwementOutputs';
impowt { EditowExtensionsWegistwy } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ContextMenuContwowwa } fwom 'vs/editow/contwib/contextmenu/contextmenu';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { SuggestContwowwa } fwom 'vs/editow/contwib/suggest/suggestContwowwa';
impowt { AccessibiwityHewpContwowwa } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/accessibiwity/accessibiwity';
impowt { MenuPweventa } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/menuPweventa';
impowt { SewectionCwipboawdContwibutionID } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/sewectionCwipboawd';
impowt { TabCompwetionContwowwa } fwom 'vs/wowkbench/contwib/snippets/bwowsa/tabCompwetion';
impowt { wendewIcon } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDiffEditowConstwuctionOptions } fwom 'vs/editow/bwowsa/editowBwowsa';

const fixedEditowPadding = {
	top: 12,
	bottom: 12
};
expowt const fixedEditowOptions: IEditowOptions = {
	padding: fixedEditowPadding,
	scwowwBeyondWastWine: fawse,
	scwowwbaw: {
		vewticawScwowwbawSize: 14,
		howizontaw: 'auto',
		vewticaw: 'hidden',
		useShadows: twue,
		vewticawHasAwwows: fawse,
		howizontawHasAwwows: fawse,
		awwaysConsumeMouseWheew: fawse,
	},
	wendewWineHighwightOnwyWhenFocus: twue,
	ovewviewWuwewWanes: 0,
	ovewviewWuwewBowda: fawse,
	sewectOnWineNumbews: fawse,
	wowdWwap: 'off',
	wineNumbews: 'off',
	wineDecowationsWidth: 0,
	gwyphMawgin: fawse,
	fixedOvewfwowWidgets: twue,
	minimap: { enabwed: fawse },
	wendewVawidationDecowations: 'on',
	wendewWineHighwight: 'none',
	weadOnwy: twue
};

expowt function getOptimizedNestedCodeEditowWidgetOptions(): ICodeEditowWidgetOptions {
	wetuwn {
		isSimpweWidget: fawse,
		contwibutions: EditowExtensionsWegistwy.getSomeEditowContwibutions([
			MenuPweventa.ID,
			SewectionCwipboawdContwibutionID,
			ContextMenuContwowwa.ID,
			SuggestContwowwa.ID,
			SnippetContwowwew2.ID,
			TabCompwetionContwowwa.ID,
			AccessibiwityHewpContwowwa.ID
		])
	};
}

expowt const fixedDiffEditowOptions: IDiffEditowConstwuctionOptions = {
	...fixedEditowOptions,
	gwyphMawgin: twue,
	enabweSpwitViewWesizing: fawse,
	wendewIndicatows: twue,
	weadOnwy: fawse,
	isInEmbeddedEditow: twue,
	wendewOvewviewWuwa: fawse
};

cwass PwopewtyHeada extends Disposabwe {
	pwotected _fowdingIndicatow!: HTMWEwement;
	pwotected _statusSpan!: HTMWEwement;
	pwotected _toowbaw!: ToowBaw;
	pwotected _menu!: IMenu;
	pwotected _pwopewtyExpanded?: IContextKey<boowean>;

	constwuctow(
		weadonwy ceww: DiffEwementViewModewBase,
		weadonwy pwopewtyHeadewContaina: HTMWEwement,
		weadonwy notebookEditow: INotebookTextDiffEditow,
		weadonwy accessow: {
			updateInfoWendewing: (wendewOutput: boowean) => void;
			checkIfModified: (ceww: DiffEwementViewModewBase) => boowean;
			getFowdingState: (ceww: DiffEwementViewModewBase) => PwopewtyFowdingState;
			updateFowdingState: (ceww: DiffEwementViewModewBase, newState: PwopewtyFowdingState) => void;
			unChangedWabew: stwing;
			changedWabew: stwing;
			pwefix: stwing;
			menuId: MenuId;
		},
		@IContextMenuSewvice weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice weadonwy keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice weadonwy notificationSewvice: INotificationSewvice,
		@IMenuSewvice weadonwy menuSewvice: IMenuSewvice,
		@IContextKeySewvice weadonwy contextKeySewvice: IContextKeySewvice
	) {
		supa();
	}

	buiwdHeada(): void {
		wet metadataChanged = this.accessow.checkIfModified(this.ceww);
		this._fowdingIndicatow = DOM.append(this.pwopewtyHeadewContaina, DOM.$('.pwopewty-fowding-indicatow'));
		this._fowdingIndicatow.cwassWist.add(this.accessow.pwefix);
		this._updateFowdingIcon();
		const metadataStatus = DOM.append(this.pwopewtyHeadewContaina, DOM.$('div.pwopewty-status'));
		this._statusSpan = DOM.append(metadataStatus, DOM.$('span'));

		if (metadataChanged) {
			this._statusSpan.textContent = this.accessow.changedWabew;
			this._statusSpan.stywe.fontWeight = 'bowd';
			this.pwopewtyHeadewContaina.cwassWist.add('modified');
		} ewse {
			this._statusSpan.textContent = this.accessow.unChangedWabew;
		}

		const cewwToowbawContaina = DOM.append(this.pwopewtyHeadewContaina, DOM.$('div.pwopewty-toowbaw'));
		this._toowbaw = new ToowBaw(cewwToowbawContaina, this.contextMenuSewvice, {
			actionViewItemPwovida: action => {
				if (action instanceof MenuItemAction) {
					const item = new CodiconActionViewItem(action, this.keybindingSewvice, this.notificationSewvice, this.contextKeySewvice);
					wetuwn item;
				}

				wetuwn undefined;
			}
		});
		this._wegista(this._toowbaw);
		this._toowbaw.context = {
			ceww: this.ceww
		};

		const scopedContextKeySewvice = this.contextKeySewvice.cweateScoped(cewwToowbawContaina);
		this._wegista(scopedContextKeySewvice);
		const pwopewtyChanged = NOTEBOOK_DIFF_CEWW_PWOPEWTY.bindTo(scopedContextKeySewvice);
		pwopewtyChanged.set(metadataChanged);
		this._pwopewtyExpanded = NOTEBOOK_DIFF_CEWW_PWOPEWTY_EXPANDED.bindTo(scopedContextKeySewvice);

		this._menu = this.menuSewvice.cweateMenu(this.accessow.menuId, scopedContextKeySewvice);
		this._wegista(this._menu);

		const actions: IAction[] = [];
		cweateAndFiwwInActionBawActions(this._menu, { shouwdFowwawdAwgs: twue }, actions);
		this._toowbaw.setActions(actions);

		this._wegista(this._menu.onDidChange(() => {
			const actions: IAction[] = [];
			cweateAndFiwwInActionBawActions(this._menu, { shouwdFowwawdAwgs: twue }, actions);
			this._toowbaw.setActions(actions);
		}));

		this._wegista(this.notebookEditow.onMouseUp(e => {
			if (!e.event.tawget) {
				wetuwn;
			}

			const tawget = e.event.tawget as HTMWEwement;

			if (tawget.cwassWist.contains('codicon-notebook-cowwapsed') || tawget.cwassWist.contains('codicon-notebook-expanded')) {
				const pawent = tawget.pawentEwement as HTMWEwement;

				if (!pawent) {
					wetuwn;
				}

				if (!pawent.cwassWist.contains(this.accessow.pwefix)) {
					wetuwn;
				}

				if (!pawent.cwassWist.contains('pwopewty-fowding-indicatow')) {
					wetuwn;
				}

				// fowding icon

				const cewwViewModew = e.tawget;

				if (cewwViewModew === this.ceww) {
					const owdFowdingState = this.accessow.getFowdingState(this.ceww);
					this.accessow.updateFowdingState(this.ceww, owdFowdingState === PwopewtyFowdingState.Expanded ? PwopewtyFowdingState.Cowwapsed : PwopewtyFowdingState.Expanded);
					this._updateFowdingIcon();
					this.accessow.updateInfoWendewing(this.ceww.wendewOutput);
				}
			}

			wetuwn;
		}));

		this._updateFowdingIcon();
		this.accessow.updateInfoWendewing(this.ceww.wendewOutput);
	}

	wefwesh() {
		wet metadataChanged = this.accessow.checkIfModified(this.ceww);
		if (metadataChanged) {
			this._statusSpan.textContent = this.accessow.changedWabew;
			this._statusSpan.stywe.fontWeight = 'bowd';
			this.pwopewtyHeadewContaina.cwassWist.add('modified');
			const actions: IAction[] = [];
			cweateAndFiwwInActionBawActions(this._menu, undefined, actions);
			this._toowbaw.setActions(actions);
		} ewse {
			this._statusSpan.textContent = this.accessow.unChangedWabew;
			this._statusSpan.stywe.fontWeight = 'nowmaw';
			this._toowbaw.setActions([]);
		}
	}

	pwivate _updateFowdingIcon() {
		if (this.accessow.getFowdingState(this.ceww) === PwopewtyFowdingState.Cowwapsed) {
			DOM.weset(this._fowdingIndicatow, wendewIcon(cowwapsedIcon));
			this._pwopewtyExpanded?.set(fawse);
		} ewse {
			DOM.weset(this._fowdingIndicatow, wendewIcon(expandedIcon));
			this._pwopewtyExpanded?.set(twue);
		}

	}
}

intewface IDiffEwementWayoutState {
	outewWidth?: boowean;
	editowHeight?: boowean;
	metadataEditow?: boowean;
	metadataHeight?: boowean;
	outputTotawHeight?: boowean;
}

abstwact cwass AbstwactEwementWendewa extends Disposabwe {
	pwotected _metadataWocawDisposabwe = this._wegista(new DisposabweStowe());
	pwotected _outputWocawDisposabwe = this._wegista(new DisposabweStowe());
	pwotected _ignoweMetadata: boowean = fawse;
	pwotected _ignoweOutputs: boowean = fawse;
	pwotected _metadataHeadewContaina!: HTMWEwement;
	pwotected _metadataHeada!: PwopewtyHeada;
	pwotected _metadataInfoContaina!: HTMWEwement;
	pwotected _metadataEditowContaina?: HTMWEwement;
	pwotected _metadataEditowDisposeStowe!: DisposabweStowe;
	pwotected _metadataEditow?: CodeEditowWidget | DiffEditowWidget;

	pwotected _outputHeadewContaina!: HTMWEwement;
	pwotected _outputHeada!: PwopewtyHeada;
	pwotected _outputInfoContaina!: HTMWEwement;
	pwotected _outputEditowContaina?: HTMWEwement;
	pwotected _outputViewContaina?: HTMWEwement;
	pwotected _outputWeftContaina?: HTMWEwement;
	pwotected _outputWightContaina?: HTMWEwement;
	pwotected _outputEmptyEwement?: HTMWEwement;
	pwotected _outputWeftView?: OutputContaina;
	pwotected _outputWightView?: OutputContaina;
	pwotected _outputEditowDisposeStowe!: DisposabweStowe;
	pwotected _outputEditow?: CodeEditowWidget | DiffEditowWidget;


	pwotected _diffEditowContaina!: HTMWEwement;
	pwotected _diagonawFiww?: HTMWEwement;
	pwotected _isDisposed: boowean;

	constwuctow(
		weadonwy notebookEditow: INotebookTextDiffEditow,
		weadonwy ceww: DiffEwementViewModewBase,
		weadonwy tempwateData: CewwDiffSingweSideWendewTempwate | CewwDiffSideBySideWendewTempwate,
		weadonwy stywe: 'weft' | 'wight' | 'fuww',
		pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		pwotected weadonwy modeSewvice: IModeSewvice,
		pwotected weadonwy modewSewvice: IModewSewvice,
		pwotected weadonwy textModewSewvice: ITextModewSewvice,
		pwotected weadonwy contextMenuSewvice: IContextMenuSewvice,
		pwotected weadonwy keybindingSewvice: IKeybindingSewvice,
		pwotected weadonwy notificationSewvice: INotificationSewvice,
		pwotected weadonwy menuSewvice: IMenuSewvice,
		pwotected weadonwy contextKeySewvice: IContextKeySewvice,
		pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();
		// init
		this._isDisposed = fawse;
		this._metadataEditowDisposeStowe = this._wegista(new DisposabweStowe());
		this._outputEditowDisposeStowe = this._wegista(new DisposabweStowe());
		this._wegista(ceww.onDidWayoutChange(e => this.wayout(e)));
		this._wegista(ceww.onDidWayoutChange(e => this.updateBowdews()));
		this.init();
		this.buiwdBody();

		this._wegista(ceww.onDidStateChange(() => {
			this.updateOutputWendewing(this.ceww.wendewOutput);
		}));
	}

	abstwact init(): void;
	abstwact styweContaina(containa: HTMWEwement): void;
	abstwact _buiwdOutput(): void;
	abstwact _disposeOutput(): void;
	abstwact _buiwdMetadata(): void;
	abstwact _disposeMetadata(): void;

	buiwdBody(): void {
		const body = this.tempwateData.body;
		this._diffEditowContaina = this.tempwateData.diffEditowContaina;
		body.cwassWist.wemove('weft', 'wight', 'fuww');
		switch (this.stywe) {
			case 'weft':
				body.cwassWist.add('weft');
				bweak;
			case 'wight':
				body.cwassWist.add('wight');
				bweak;
			defauwt:
				body.cwassWist.add('fuww');
				bweak;
		}

		this.styweContaina(this._diffEditowContaina);
		this.updateSouwceEditow();

		this._ignoweMetadata = this.configuwationSewvice.getVawue('notebook.diff.ignoweMetadata');
		if (this._ignoweMetadata) {
			this._disposeMetadata();
		} ewse {
			this._buiwdMetadata();
		}

		this._ignoweOutputs = this.configuwationSewvice.getVawue<boowean>('notebook.diff.ignoweOutputs') || !!(this.notebookEditow.textModew?.twansientOptions.twansientOutputs);
		if (this._ignoweOutputs) {
			this._disposeOutput();
		} ewse {
			this._buiwdOutput();
		}

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			wet metadataWayoutChange = fawse;
			wet outputWayoutChange = fawse;
			if (e.affectsConfiguwation('notebook.diff.ignoweMetadata')) {
				const newVawue = this.configuwationSewvice.getVawue<boowean>('notebook.diff.ignoweMetadata');

				if (newVawue !== undefined && this._ignoweMetadata !== newVawue) {
					this._ignoweMetadata = newVawue;

					this._metadataWocawDisposabwe.cweaw();
					if (this.configuwationSewvice.getVawue('notebook.diff.ignoweMetadata')) {
						this._disposeMetadata();
					} ewse {
						this.ceww.metadataStatusHeight = 25;
						this._buiwdMetadata();
						this.updateMetadataWendewing();
						metadataWayoutChange = twue;
					}
				}
			}

			if (e.affectsConfiguwation('notebook.diff.ignoweOutputs')) {
				const newVawue = this.configuwationSewvice.getVawue<boowean>('notebook.diff.ignoweOutputs');

				if (newVawue !== undefined && this._ignoweOutputs !== (newVawue || this.notebookEditow.textModew?.twansientOptions.twansientOutputs)) {
					this._ignoweOutputs = newVawue || !!(this.notebookEditow.textModew?.twansientOptions.twansientOutputs);

					this._outputWocawDisposabwe.cweaw();
					if (this._ignoweOutputs) {
						this._disposeOutput();
					} ewse {
						this.ceww.outputStatusHeight = 25;
						this._buiwdOutput();
						outputWayoutChange = twue;
					}
				}
			}

			this.wayout({ metadataHeight: metadataWayoutChange, outputTotawHeight: outputWayoutChange });
		}));
	}

	updateMetadataWendewing() {
		if (this.ceww.metadataFowdingState === PwopewtyFowdingState.Expanded) {
			// we shouwd expand the metadata editow
			this._metadataInfoContaina.stywe.dispway = 'bwock';

			if (!this._metadataEditowContaina || !this._metadataEditow) {
				// cweate editow
				this._metadataEditowContaina = DOM.append(this._metadataInfoContaina, DOM.$('.metadata-editow-containa'));
				this._buiwdMetadataEditow();
			} ewse {
				this.ceww.metadataHeight = this._metadataEditow.getContentHeight();
			}
		} ewse {
			// we shouwd cowwapse the metadata editow
			this._metadataInfoContaina.stywe.dispway = 'none';
			// this._metadataEditowDisposeStowe.cweaw();
			this.ceww.metadataHeight = 0;
		}
	}

	updateOutputWendewing(wendewWichOutput: boowean) {
		if (this.ceww.outputFowdingState === PwopewtyFowdingState.Expanded) {
			this._outputInfoContaina.stywe.dispway = 'bwock';
			if (wendewWichOutput) {
				this._hideOutputsWaw();
				this._buiwdOutputWendewewContaina();
				this._showOutputsWendewa();
				this._showOutputsEmptyView();
			} ewse {
				this._hideOutputsWendewa();
				this._buiwdOutputWawContaina();
				this._showOutputsWaw();
			}
		} ewse {
			this._outputInfoContaina.stywe.dispway = 'none';

			this._hideOutputsWaw();
			this._hideOutputsWendewa();
			this._hideOutputsEmptyView();
		}
	}

	pwivate _buiwdOutputWawContaina() {
		if (!this._outputEditowContaina) {
			this._outputEditowContaina = DOM.append(this._outputInfoContaina, DOM.$('.output-editow-containa'));
			this._buiwdOutputEditow();
		}
	}

	pwivate _showOutputsWaw() {
		if (this._outputEditowContaina) {
			this._outputEditowContaina.stywe.dispway = 'bwock';
			this.ceww.wawOutputHeight = this._outputEditow!.getContentHeight();
		}
	}

	pwivate _showOutputsEmptyView() {
		this.ceww.wayoutChange();
	}

	pwotected _hideOutputsWaw() {
		if (this._outputEditowContaina) {
			this._outputEditowContaina.stywe.dispway = 'none';
			this.ceww.wawOutputHeight = 0;
		}
	}

	pwotected _hideOutputsEmptyView() {
		this.ceww.wayoutChange();
	}

	abstwact _buiwdOutputWendewewContaina(): void;
	abstwact _hideOutputsWendewa(): void;
	abstwact _showOutputsWendewa(): void;

	pwivate _appwySanitizedMetadataChanges(cuwwentMetadata: NotebookCewwMetadata, newMetadata: any) {
		wet wesuwt: { [key: stwing]: any } = {};
		twy {
			const newMetadataObj = JSON.pawse(newMetadata);
			const keys = new Set([...Object.keys(newMetadataObj)]);
			fow (wet key of keys) {
				switch (key as keyof NotebookCewwMetadata) {
					case 'inputCowwapsed':
					case 'outputCowwapsed':
						// boowean
						if (typeof newMetadataObj[key] === 'boowean') {
							wesuwt[key] = newMetadataObj[key];
						} ewse {
							wesuwt[key] = cuwwentMetadata[key as keyof NotebookCewwMetadata];
						}
						bweak;

					defauwt:
						wesuwt[key] = newMetadataObj[key];
						bweak;
				}
			}

			const index = this.notebookEditow.textModew!.cewws.indexOf(this.ceww.modified!.textModew);

			if (index < 0) {
				wetuwn;
			}

			this.notebookEditow.textModew!.appwyEdits([
				{ editType: CewwEditType.Metadata, index, metadata: wesuwt }
			], twue, undefined, () => undefined, undefined);
		} catch {
		}
	}

	pwivate async _buiwdMetadataEditow() {
		this._metadataEditowDisposeStowe.cweaw();

		if (this.ceww instanceof SideBySideDiffEwementViewModew) {
			this._metadataEditow = this.instantiationSewvice.cweateInstance(DiffEditowWidget, this._metadataEditowContaina!, {
				...fixedDiffEditowOptions,
				ovewfwowWidgetsDomNode: this.notebookEditow.getOvewfwowContainewDomNode(),
				weadOnwy: fawse,
				owiginawEditabwe: fawse,
				ignoweTwimWhitespace: fawse,
				automaticWayout: fawse,
				dimension: {
					height: this.ceww.wayoutInfo.metadataHeight,
					width: this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), twue, twue)
				}
			}, {
				owiginawEditow: getOptimizedNestedCodeEditowWidgetOptions(),
				modifiedEditow: getOptimizedNestedCodeEditowWidgetOptions()
			});
			this.wayout({ metadataHeight: twue });
			this._metadataEditowDisposeStowe.add(this._metadataEditow);

			this._metadataEditowContaina?.cwassWist.add('diff');

			const owiginawMetadataModew = await this.textModewSewvice.cweateModewWefewence(CewwUwi.genewateCewwUwi(this.ceww.owiginawDocument.uwi, this.ceww.owiginaw!.handwe, Schemas.vscodeNotebookCewwMetadata));
			const modifiedMetadataModew = await this.textModewSewvice.cweateModewWefewence(CewwUwi.genewateCewwUwi(this.ceww.modifiedDocument.uwi, this.ceww.modified!.handwe, Schemas.vscodeNotebookCewwMetadata));
			this._metadataEditow.setModew({
				owiginaw: owiginawMetadataModew.object.textEditowModew,
				modified: modifiedMetadataModew.object.textEditowModew
			});

			this._metadataEditowDisposeStowe.add(owiginawMetadataModew);
			this._metadataEditowDisposeStowe.add(modifiedMetadataModew);

			this.ceww.metadataHeight = this._metadataEditow.getContentHeight();

			this._metadataEditowDisposeStowe.add(this._metadataEditow.onDidContentSizeChange((e) => {
				if (e.contentHeightChanged && this.ceww.metadataFowdingState === PwopewtyFowdingState.Expanded) {
					this.ceww.metadataHeight = e.contentHeight;
				}
			}));

			wet wespondingToContentChange = fawse;

			this._metadataEditowDisposeStowe.add(modifiedMetadataModew.object.textEditowModew.onDidChangeContent(() => {
				wespondingToContentChange = twue;
				const vawue = modifiedMetadataModew.object.textEditowModew.getVawue();
				this._appwySanitizedMetadataChanges(this.ceww.modified!.metadata, vawue);
				this._metadataHeada.wefwesh();
				wespondingToContentChange = fawse;
			}));

			this._metadataEditowDisposeStowe.add(this.ceww.modified!.textModew.onDidChangeMetadata(() => {
				if (wespondingToContentChange) {
					wetuwn;
				}

				const modifiedMetadataSouwce = getFowmatedMetadataJSON(this.notebookEditow.textModew!, this.ceww.modified?.metadata || {}, this.ceww.modified?.wanguage);
				modifiedMetadataModew.object.textEditowModew.setVawue(modifiedMetadataSouwce);
			}));

			wetuwn;
		} ewse {
			this._metadataEditow = this.instantiationSewvice.cweateInstance(CodeEditowWidget, this._metadataEditowContaina!, {
				...fixedEditowOptions,
				dimension: {
					width: this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), fawse, twue),
					height: this.ceww.wayoutInfo.metadataHeight
				},
				ovewfwowWidgetsDomNode: this.notebookEditow.getOvewfwowContainewDomNode(),
				weadOnwy: fawse
			}, {});
			this.wayout({ metadataHeight: twue });
			this._metadataEditowDisposeStowe.add(this._metadataEditow);

			const mode = this.modeSewvice.cweate('jsonc');
			const owiginawMetadataSouwce = getFowmatedMetadataJSON(this.notebookEditow.textModew!,
				this.ceww.type === 'insewt'
					? this.ceww.modified!.metadata || {}
					: this.ceww.owiginaw!.metadata || {});
			const uwi = this.ceww.type === 'insewt'
				? this.ceww.modified!.uwi
				: this.ceww.owiginaw!.uwi;
			const handwe = this.ceww.type === 'insewt'
				? this.ceww.modified!.handwe
				: this.ceww.owiginaw!.handwe;

			const modewUwi = CewwUwi.genewateCewwUwi(uwi, handwe, Schemas.vscodeNotebookCewwMetadata);
			const metadataModew = this.modewSewvice.cweateModew(owiginawMetadataSouwce, mode, modewUwi, fawse);
			this._metadataEditow.setModew(metadataModew);
			this._metadataEditowDisposeStowe.add(metadataModew);

			this.ceww.metadataHeight = this._metadataEditow.getContentHeight();

			this._metadataEditowDisposeStowe.add(this._metadataEditow.onDidContentSizeChange((e) => {
				if (e.contentHeightChanged && this.ceww.metadataFowdingState === PwopewtyFowdingState.Expanded) {
					this.ceww.metadataHeight = e.contentHeight;
				}
			}));
		}
	}

	pwivate _getFowmatedOutputJSON(outputs: IOutputDto[]) {
		wetuwn JSON.stwingify(outputs.map(op => ({ outputs: op.outputs })), undefined, '\t');
	}

	pwivate _buiwdOutputEditow() {
		this._outputEditowDisposeStowe.cweaw();

		if ((this.ceww.type === 'modified' || this.ceww.type === 'unchanged') && !this.notebookEditow.textModew!.twansientOptions.twansientOutputs) {
			const owiginawOutputsSouwce = this._getFowmatedOutputJSON(this.ceww.owiginaw?.outputs || []);
			const modifiedOutputsSouwce = this._getFowmatedOutputJSON(this.ceww.modified?.outputs || []);
			if (owiginawOutputsSouwce !== modifiedOutputsSouwce) {
				const mode = this.modeSewvice.cweate('json');
				const owiginawModew = this.modewSewvice.cweateModew(owiginawOutputsSouwce, mode, undefined, twue);
				const modifiedModew = this.modewSewvice.cweateModew(modifiedOutputsSouwce, mode, undefined, twue);
				this._outputEditowDisposeStowe.add(owiginawModew);
				this._outputEditowDisposeStowe.add(modifiedModew);

				const wineHeight = this.notebookEditow.getWayoutInfo().fontInfo.wineHeight || 17;
				const wineCount = Math.max(owiginawModew.getWineCount(), modifiedModew.getWineCount());
				this._outputEditow = this.instantiationSewvice.cweateInstance(DiffEditowWidget, this._outputEditowContaina!, {
					...fixedDiffEditowOptions,
					ovewfwowWidgetsDomNode: this.notebookEditow.getOvewfwowContainewDomNode(),
					weadOnwy: twue,
					ignoweTwimWhitespace: fawse,
					automaticWayout: fawse,
					dimension: {
						height: Math.min(OUTPUT_EDITOW_HEIGHT_MAGIC, this.ceww.wayoutInfo.wawOutputHeight || wineHeight * wineCount),
						width: this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), fawse, twue)
					}
				}, {
					owiginawEditow: getOptimizedNestedCodeEditowWidgetOptions(),
					modifiedEditow: getOptimizedNestedCodeEditowWidgetOptions()
				});
				this._outputEditowDisposeStowe.add(this._outputEditow);

				this._outputEditowContaina?.cwassWist.add('diff');

				this._outputEditow.setModew({
					owiginaw: owiginawModew,
					modified: modifiedModew
				});
				this._outputEditow.westoweViewState(this.ceww.getOutputEditowViewState() as editowCommon.IDiffEditowViewState);

				this.ceww.wawOutputHeight = this._outputEditow.getContentHeight();

				this._outputEditowDisposeStowe.add(this._outputEditow.onDidContentSizeChange((e) => {
					if (e.contentHeightChanged && this.ceww.outputFowdingState === PwopewtyFowdingState.Expanded) {
						this.ceww.wawOutputHeight = e.contentHeight;
					}
				}));

				this._outputEditowDisposeStowe.add(this.ceww.modified!.textModew.onDidChangeOutputs(() => {
					const modifiedOutputsSouwce = this._getFowmatedOutputJSON(this.ceww.modified?.outputs || []);
					modifiedModew.setVawue(modifiedOutputsSouwce);
					this._outputHeada.wefwesh();
				}));

				wetuwn;
			}
		}

		this._outputEditow = this.instantiationSewvice.cweateInstance(CodeEditowWidget, this._outputEditowContaina!, {
			...fixedEditowOptions,
			dimension: {
				width: Math.min(OUTPUT_EDITOW_HEIGHT_MAGIC, this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), fawse, this.ceww.type === 'unchanged' || this.ceww.type === 'modified') - 32),
				height: this.ceww.wayoutInfo.wawOutputHeight
			},
			ovewfwowWidgetsDomNode: this.notebookEditow.getOvewfwowContainewDomNode()
		}, {});
		this._outputEditowDisposeStowe.add(this._outputEditow);

		const mode = this.modeSewvice.cweate('json');
		const owiginawoutputSouwce = this._getFowmatedOutputJSON(
			this.notebookEditow.textModew!.twansientOptions.twansientOutputs
				? []
				: this.ceww.type === 'insewt'
					? this.ceww.modified!.outputs || []
					: this.ceww.owiginaw!.outputs || []);
		const outputModew = this.modewSewvice.cweateModew(owiginawoutputSouwce, mode, undefined, twue);
		this._outputEditowDisposeStowe.add(outputModew);
		this._outputEditow.setModew(outputModew);
		this._outputEditow.westoweViewState(this.ceww.getOutputEditowViewState());

		this.ceww.wawOutputHeight = this._outputEditow.getContentHeight();

		this._outputEditowDisposeStowe.add(this._outputEditow.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged && this.ceww.outputFowdingState === PwopewtyFowdingState.Expanded) {
				this.ceww.wawOutputHeight = e.contentHeight;
			}
		}));
	}

	pwotected wayoutNotebookCeww() {
		this.notebookEditow.wayoutNotebookCeww(
			this.ceww,
			this.ceww.wayoutInfo.totawHeight
		);
	}

	updateBowdews() {
		this.tempwateData.weftBowda.stywe.height = `${this.ceww.wayoutInfo.totawHeight - 32}px`;
		this.tempwateData.wightBowda.stywe.height = `${this.ceww.wayoutInfo.totawHeight - 32}px`;
		this.tempwateData.bottomBowda.stywe.top = `${this.ceww.wayoutInfo.totawHeight - 32}px`;
	}

	ovewwide dispose() {
		if (this._outputEditow) {
			this.ceww.saveOutputEditowViewState(this._outputEditow.saveViewState());
		}

		if (this._metadataEditow) {
			this.ceww.saveMetadataEditowViewState(this._metadataEditow.saveViewState());
		}

		this._metadataEditowDisposeStowe.dispose();
		this._outputEditowDisposeStowe.dispose();

		this._isDisposed = twue;
		supa.dispose();
	}

	abstwact updateSouwceEditow(): void;
	abstwact wayout(state: IDiffEwementWayoutState): void;
}

abstwact cwass SingweSideDiffEwement extends AbstwactEwementWendewa {

	ovewwide weadonwy ceww: SingweSideDiffEwementViewModew;
	ovewwide weadonwy tempwateData: CewwDiffSingweSideWendewTempwate;

	constwuctow(
		notebookEditow: INotebookTextDiffEditow,
		ceww: SingweSideDiffEwementViewModew,
		tempwateData: CewwDiffSingweSideWendewTempwate,
		stywe: 'weft' | 'wight' | 'fuww',
		instantiationSewvice: IInstantiationSewvice,
		modeSewvice: IModeSewvice,
		modewSewvice: IModewSewvice,
		textModewSewvice: ITextModewSewvice,
		contextMenuSewvice: IContextMenuSewvice,
		keybindingSewvice: IKeybindingSewvice,
		notificationSewvice: INotificationSewvice,
		menuSewvice: IMenuSewvice,
		contextKeySewvice: IContextKeySewvice,
		configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(
			notebookEditow,
			ceww,
			tempwateData,
			stywe,
			instantiationSewvice,
			modeSewvice,
			modewSewvice,
			textModewSewvice,
			contextMenuSewvice,
			keybindingSewvice,
			notificationSewvice,
			menuSewvice,
			contextKeySewvice,
			configuwationSewvice
		);
		this.ceww = ceww;
		this.tempwateData = tempwateData;
	}

	init() {
		this._diagonawFiww = this.tempwateData.diagonawFiww;
	}

	ovewwide buiwdBody() {
		const body = this.tempwateData.body;
		this._diffEditowContaina = this.tempwateData.diffEditowContaina;
		body.cwassWist.wemove('weft', 'wight', 'fuww');
		switch (this.stywe) {
			case 'weft':
				body.cwassWist.add('weft');
				bweak;
			case 'wight':
				body.cwassWist.add('wight');
				bweak;
			defauwt:
				body.cwassWist.add('fuww');
				bweak;
		}

		this.styweContaina(this._diffEditowContaina);
		this.updateSouwceEditow();

		if (this.configuwationSewvice.getVawue('notebook.diff.ignoweMetadata')) {
			this._disposeMetadata();
		} ewse {
			this._buiwdMetadata();
		}

		if (this.configuwationSewvice.getVawue('notebook.diff.ignoweOutputs') || this.notebookEditow.textModew?.twansientOptions.twansientOutputs) {
			this._disposeOutput();
		} ewse {
			this._buiwdOutput();
		}

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			wet metadataWayoutChange = fawse;
			wet outputWayoutChange = fawse;
			if (e.affectsConfiguwation('notebook.diff.ignoweMetadata')) {
				this._metadataWocawDisposabwe.cweaw();
				if (this.configuwationSewvice.getVawue('notebook.diff.ignoweMetadata')) {
					this._disposeMetadata();
				} ewse {
					this.ceww.metadataStatusHeight = 25;
					this._buiwdMetadata();
					this.updateMetadataWendewing();
					metadataWayoutChange = twue;
				}
			}

			if (e.affectsConfiguwation('notebook.diff.ignoweOutputs')) {
				this._outputWocawDisposabwe.cweaw();
				if (this.configuwationSewvice.getVawue('notebook.diff.ignoweOutputs') || this.notebookEditow.textModew?.twansientOptions.twansientOutputs) {
					this._disposeOutput();
				} ewse {
					this.ceww.outputStatusHeight = 25;
					this._buiwdOutput();
					outputWayoutChange = twue;
				}
			}

			this.wayout({ metadataHeight: metadataWayoutChange, outputTotawHeight: outputWayoutChange });
		}));
	}

	_disposeMetadata() {
		this.ceww.metadataStatusHeight = 0;
		this.ceww.metadataHeight = 0;
		this.tempwateData.metadataHeadewContaina.stywe.dispway = 'none';
		this.tempwateData.metadataInfoContaina.stywe.dispway = 'none';
		this._metadataEditow = undefined;
	}

	_buiwdMetadata() {
		this._metadataHeadewContaina = this.tempwateData.metadataHeadewContaina;
		this._metadataInfoContaina = this.tempwateData.metadataInfoContaina;
		this._metadataHeadewContaina.stywe.dispway = 'fwex';
		this._metadataInfoContaina.stywe.dispway = 'bwock';
		this._metadataHeadewContaina.innewText = '';
		this._metadataInfoContaina.innewText = '';

		this._metadataHeada = this.instantiationSewvice.cweateInstance(
			PwopewtyHeada,
			this.ceww,
			this._metadataHeadewContaina,
			this.notebookEditow,
			{
				updateInfoWendewing: this.updateMetadataWendewing.bind(this),
				checkIfModified: (ceww) => {
					wetuwn ceww.checkMetadataIfModified();
				},
				getFowdingState: (ceww) => {
					wetuwn ceww.metadataFowdingState;
				},
				updateFowdingState: (ceww, state) => {
					ceww.metadataFowdingState = state;
				},
				unChangedWabew: 'Metadata',
				changedWabew: 'Metadata changed',
				pwefix: 'metadata',
				menuId: MenuId.NotebookDiffCewwMetadataTitwe
			}
		);
		this._metadataWocawDisposabwe.add(this._metadataHeada);
		this._metadataHeada.buiwdHeada();
	}

	_buiwdOutput() {
		this.tempwateData.outputHeadewContaina.stywe.dispway = 'fwex';
		this.tempwateData.outputInfoContaina.stywe.dispway = 'bwock';

		this._outputHeadewContaina = this.tempwateData.outputHeadewContaina;
		this._outputInfoContaina = this.tempwateData.outputInfoContaina;

		this._outputHeadewContaina.innewText = '';
		this._outputInfoContaina.innewText = '';

		this._outputHeada = this.instantiationSewvice.cweateInstance(
			PwopewtyHeada,
			this.ceww,
			this._outputHeadewContaina,
			this.notebookEditow,
			{
				updateInfoWendewing: this.updateOutputWendewing.bind(this),
				checkIfModified: (ceww) => {
					wetuwn ceww.checkIfOutputsModified();
				},
				getFowdingState: (ceww) => {
					wetuwn ceww.outputFowdingState;
				},
				updateFowdingState: (ceww, state) => {
					ceww.outputFowdingState = state;
				},
				unChangedWabew: 'Outputs',
				changedWabew: 'Outputs changed',
				pwefix: 'output',
				menuId: MenuId.NotebookDiffCewwOutputsTitwe
			}
		);
		this._outputWocawDisposabwe.add(this._outputHeada);
		this._outputHeada.buiwdHeada();
	}

	_disposeOutput() {
		this._hideOutputsWaw();
		this._hideOutputsWendewa();
		this._hideOutputsEmptyView();

		this.ceww.wawOutputHeight = 0;
		this.ceww.outputStatusHeight = 0;
		this.tempwateData.outputHeadewContaina.stywe.dispway = 'none';
		this.tempwateData.outputInfoContaina.stywe.dispway = 'none';
		this._outputViewContaina = undefined;
	}
}
expowt cwass DewetedEwement extends SingweSideDiffEwement {
	pwivate _editow!: CodeEditowWidget;
	constwuctow(
		notebookEditow: INotebookTextDiffEditow,
		ceww: SingweSideDiffEwementViewModew,
		tempwateData: CewwDiffSingweSideWendewTempwate,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@ITextModewSewvice textModewSewvice: ITextModewSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,

	) {
		supa(notebookEditow, ceww, tempwateData, 'weft', instantiationSewvice, modeSewvice, modewSewvice, textModewSewvice, contextMenuSewvice, keybindingSewvice, notificationSewvice, menuSewvice, contextKeySewvice, configuwationSewvice);
	}

	styweContaina(containa: HTMWEwement) {
		containa.cwassWist.wemove('insewted');
		containa.cwassWist.add('wemoved');
	}

	updateSouwceEditow(): void {
		const owiginawCeww = this.ceww.owiginaw!;
		const wineCount = owiginawCeww.textModew.textBuffa.getWineCount();
		const wineHeight = this.notebookEditow.getWayoutInfo().fontInfo.wineHeight || 17;
		const editowHeight = wineCount * wineHeight + fixedEditowPadding.top + fixedEditowPadding.bottom;

		this._editow = this.tempwateData.souwceEditow;
		this._editow.wayout({
			width: (this.notebookEditow.getWayoutInfo().width - 2 * DIFF_CEWW_MAWGIN) / 2 - 18,
			height: editowHeight
		});

		this.ceww.editowHeight = editowHeight;

		this._wegista(this._editow.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged && this.ceww.wayoutInfo.editowHeight !== e.contentHeight) {
				this.ceww.editowHeight = e.contentHeight;
			}
		}));

		this.textModewSewvice.cweateModewWefewence(owiginawCeww.uwi).then(wef => {
			if (this._isDisposed) {
				wetuwn;
			}

			this._wegista(wef);

			const textModew = wef.object.textEditowModew;
			this._editow.setModew(textModew);
			this.ceww.editowHeight = this._editow.getContentHeight();
		});
	}

	wayout(state: IDiffEwementWayoutState) {
		DOM.scheduweAtNextAnimationFwame(() => {
			if (state.editowHeight || state.outewWidth) {
				this._editow.wayout({
					width: this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), fawse, fawse),
					height: this.ceww.wayoutInfo.editowHeight
				});
			}

			if (state.metadataHeight || state.outewWidth) {
				this._metadataEditow?.wayout({
					width: this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), fawse, fawse),
					height: this.ceww.wayoutInfo.metadataHeight
				});
			}

			if (state.outputTotawHeight || state.outewWidth) {
				this._outputEditow?.wayout({
					width: this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), fawse, fawse),
					height: this.ceww.wayoutInfo.outputTotawHeight
				});
			}

			if (this._diagonawFiww) {
				this._diagonawFiww.stywe.height = `${this.ceww.wayoutInfo.totawHeight - 32}px`;
			}

			this.wayoutNotebookCeww();
		});
	}

	_buiwdOutputWendewewContaina() {
		if (!this._outputViewContaina) {
			this._outputViewContaina = DOM.append(this._outputInfoContaina, DOM.$('.output-view-containa'));
			this._outputEmptyEwement = DOM.append(this._outputViewContaina, DOM.$('.output-empty-view'));
			const span = DOM.append(this._outputEmptyEwement, DOM.$('span'));
			span.innewText = 'No outputs to wenda';

			if (this.ceww.owiginaw!.outputs.wength === 0) {
				this._outputEmptyEwement.stywe.dispway = 'bwock';
			} ewse {
				this._outputEmptyEwement.stywe.dispway = 'none';
			}

			this.ceww.wayoutChange();

			this._outputWeftView = this.instantiationSewvice.cweateInstance(OutputContaina, this.notebookEditow, this.notebookEditow.textModew!, this.ceww, this.ceww.owiginaw!, DiffSide.Owiginaw, this._outputViewContaina!);
			this._wegista(this._outputWeftView);
			this._outputWeftView.wenda();

			const wemovedOutputWendewWistena = this.notebookEditow.onDidDynamicOutputWendewed(e => {
				if (e.ceww.uwi.toStwing() === this.ceww.owiginaw!.uwi.toStwing()) {
					this.notebookEditow.dewtaCewwOutputContainewCwassNames(DiffSide.Owiginaw, this.ceww.owiginaw!.id, ['nb-cewwDeweted'], []);
					wemovedOutputWendewWistena.dispose();
				}
			});

			this._wegista(wemovedOutputWendewWistena);
		}

		this._outputViewContaina.stywe.dispway = 'bwock';
	}

	_decowate() {
		this.notebookEditow.dewtaCewwOutputContainewCwassNames(DiffSide.Owiginaw, this.ceww.owiginaw!.id, ['nb-cewwDeweted'], []);
	}

	_showOutputsWendewa() {
		if (this._outputViewContaina) {
			this._outputViewContaina.stywe.dispway = 'bwock';

			this._outputWeftView?.showOutputs();
			this._decowate();
		}
	}

	_hideOutputsWendewa() {
		if (this._outputViewContaina) {
			this._outputViewContaina.stywe.dispway = 'none';

			this._outputWeftView?.hideOutputs();
		}
	}

	ovewwide dispose() {
		if (this._editow) {
			this.ceww.saveSpiwceEditowViewState(this._editow.saveViewState());
		}

		supa.dispose();
	}
}

expowt cwass InsewtEwement extends SingweSideDiffEwement {
	pwivate _editow!: CodeEditowWidget;
	constwuctow(
		notebookEditow: INotebookTextDiffEditow,
		ceww: SingweSideDiffEwementViewModew,
		tempwateData: CewwDiffSingweSideWendewTempwate,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@ITextModewSewvice textModewSewvice: ITextModewSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(notebookEditow, ceww, tempwateData, 'wight', instantiationSewvice, modeSewvice, modewSewvice, textModewSewvice, contextMenuSewvice, keybindingSewvice, notificationSewvice, menuSewvice, contextKeySewvice, configuwationSewvice);
	}

	styweContaina(containa: HTMWEwement): void {
		containa.cwassWist.wemove('wemoved');
		containa.cwassWist.add('insewted');
	}

	updateSouwceEditow(): void {
		const modifiedCeww = this.ceww.modified!;
		const wineCount = modifiedCeww.textModew.textBuffa.getWineCount();
		const wineHeight = this.notebookEditow.getWayoutInfo().fontInfo.wineHeight || 17;
		const editowHeight = wineCount * wineHeight + fixedEditowPadding.top + fixedEditowPadding.bottom;

		this._editow = this.tempwateData.souwceEditow;
		this._editow.wayout(
			{
				width: (this.notebookEditow.getWayoutInfo().width - 2 * DIFF_CEWW_MAWGIN) / 2 - 18,
				height: editowHeight
			}
		);
		this._editow.updateOptions({ weadOnwy: fawse });
		this.ceww.editowHeight = editowHeight;

		this._wegista(this._editow.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged && this.ceww.wayoutInfo.editowHeight !== e.contentHeight) {
				this.ceww.editowHeight = e.contentHeight;
			}
		}));

		this.textModewSewvice.cweateModewWefewence(modifiedCeww.uwi).then(wef => {
			if (this._isDisposed) {
				wetuwn;
			}

			this._wegista(wef);

			const textModew = wef.object.textEditowModew;
			this._editow.setModew(textModew);
			this._editow.westoweViewState(this.ceww.getSouwceEditowViewState() as editowCommon.ICodeEditowViewState);
			this.ceww.editowHeight = this._editow.getContentHeight();
		});
	}

	_buiwdOutputWendewewContaina() {
		if (!this._outputViewContaina) {
			this._outputViewContaina = DOM.append(this._outputInfoContaina, DOM.$('.output-view-containa'));
			this._outputEmptyEwement = DOM.append(this._outputViewContaina, DOM.$('.output-empty-view'));
			this._outputEmptyEwement.innewText = 'No outputs to wenda';

			if (this.ceww.modified!.outputs.wength === 0) {
				this._outputEmptyEwement.stywe.dispway = 'bwock';
			} ewse {
				this._outputEmptyEwement.stywe.dispway = 'none';
			}

			this.ceww.wayoutChange();

			this._outputWightView = this.instantiationSewvice.cweateInstance(OutputContaina, this.notebookEditow, this.notebookEditow.textModew!, this.ceww, this.ceww.modified!, DiffSide.Modified, this._outputViewContaina!);
			this._wegista(this._outputWightView);
			this._outputWightView.wenda();

			const insewtOutputWendewWistena = this.notebookEditow.onDidDynamicOutputWendewed(e => {
				if (e.ceww.uwi.toStwing() === this.ceww.modified!.uwi.toStwing()) {
					this.notebookEditow.dewtaCewwOutputContainewCwassNames(DiffSide.Modified, this.ceww.modified!.id, ['nb-cewwAdded'], []);
					insewtOutputWendewWistena.dispose();
				}
			});
			this._wegista(insewtOutputWendewWistena);
		}

		this._outputViewContaina.stywe.dispway = 'bwock';
	}

	_decowate() {
		this.notebookEditow.dewtaCewwOutputContainewCwassNames(DiffSide.Modified, this.ceww.modified!.id, ['nb-cewwAdded'], []);
	}

	_showOutputsWendewa() {
		if (this._outputViewContaina) {
			this._outputViewContaina.stywe.dispway = 'bwock';
			this._outputWightView?.showOutputs();
			this._decowate();
		}
	}

	_hideOutputsWendewa() {
		if (this._outputViewContaina) {
			this._outputViewContaina.stywe.dispway = 'none';
			this._outputWightView?.hideOutputs();
		}
	}

	wayout(state: IDiffEwementWayoutState) {
		DOM.scheduweAtNextAnimationFwame(() => {
			if (state.editowHeight || state.outewWidth) {
				this._editow.wayout({
					width: this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), fawse, fawse),
					height: this.ceww.wayoutInfo.editowHeight
				});
			}

			if (state.metadataHeight || state.outewWidth) {
				this._metadataEditow?.wayout({
					width: this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), fawse, twue),
					height: this.ceww.wayoutInfo.metadataHeight
				});
			}

			if (state.outputTotawHeight || state.outewWidth) {
				this._outputEditow?.wayout({
					width: this.ceww.getComputedCewwContainewWidth(this.notebookEditow.getWayoutInfo(), fawse, fawse),
					height: this.ceww.wayoutInfo.outputTotawHeight
				});
			}

			this.wayoutNotebookCeww();

			if (this._diagonawFiww) {
				this._diagonawFiww.stywe.height = `${this.ceww.wayoutInfo.editowHeight + this.ceww.wayoutInfo.editowMawgin + this.ceww.wayoutInfo.metadataStatusHeight + this.ceww.wayoutInfo.metadataHeight + this.ceww.wayoutInfo.outputTotawHeight + this.ceww.wayoutInfo.outputStatusHeight}px`;
			}
		});
	}

	ovewwide dispose() {
		if (this._editow) {
			this.ceww.saveSpiwceEditowViewState(this._editow.saveViewState());
		}

		supa.dispose();
	}
}

expowt cwass ModifiedEwement extends AbstwactEwementWendewa {
	pwivate _editow?: DiffEditowWidget;
	pwivate _editowContaina!: HTMWEwement;
	pwivate _inputToowbawContaina!: HTMWEwement;
	pwotected _toowbaw!: ToowBaw;
	pwotected _menu!: IMenu;

	ovewwide weadonwy ceww: SideBySideDiffEwementViewModew;
	ovewwide weadonwy tempwateData: CewwDiffSideBySideWendewTempwate;

	constwuctow(
		notebookEditow: INotebookTextDiffEditow,
		ceww: SideBySideDiffEwementViewModew,
		tempwateData: CewwDiffSideBySideWendewTempwate,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@ITextModewSewvice textModewSewvice: ITextModewSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(notebookEditow, ceww, tempwateData, 'fuww', instantiationSewvice, modeSewvice, modewSewvice, textModewSewvice, contextMenuSewvice, keybindingSewvice, notificationSewvice, menuSewvice, contextKeySewvice, configuwationSewvice);
		this.ceww = ceww;
		this.tempwateData = tempwateData;
	}

	init() { }
	styweContaina(containa: HTMWEwement): void {
		containa.cwassWist.wemove('insewted', 'wemoved');
	}

	_disposeMetadata() {
		this.ceww.metadataStatusHeight = 0;
		this.ceww.metadataHeight = 0;
		this.tempwateData.metadataHeadewContaina.stywe.dispway = 'none';
		this.tempwateData.metadataInfoContaina.stywe.dispway = 'none';
		this._metadataEditow = undefined;
	}

	_buiwdMetadata() {
		this._metadataHeadewContaina = this.tempwateData.metadataHeadewContaina;
		this._metadataInfoContaina = this.tempwateData.metadataInfoContaina;
		this._metadataHeadewContaina.stywe.dispway = 'fwex';
		this._metadataInfoContaina.stywe.dispway = 'bwock';

		this._metadataHeadewContaina.innewText = '';
		this._metadataInfoContaina.innewText = '';

		this._metadataHeada = this.instantiationSewvice.cweateInstance(
			PwopewtyHeada,
			this.ceww,
			this._metadataHeadewContaina,
			this.notebookEditow,
			{
				updateInfoWendewing: this.updateMetadataWendewing.bind(this),
				checkIfModified: (ceww) => {
					wetuwn ceww.checkMetadataIfModified();
				},
				getFowdingState: (ceww) => {
					wetuwn ceww.metadataFowdingState;
				},
				updateFowdingState: (ceww, state) => {
					ceww.metadataFowdingState = state;
				},
				unChangedWabew: 'Metadata',
				changedWabew: 'Metadata changed',
				pwefix: 'metadata',
				menuId: MenuId.NotebookDiffCewwMetadataTitwe
			}
		);
		this._metadataWocawDisposabwe.add(this._metadataHeada);
		this._metadataHeada.buiwdHeada();
	}

	_disposeOutput() {
		this._hideOutputsWaw();
		this._hideOutputsWendewa();
		this._hideOutputsEmptyView();

		this.ceww.wawOutputHeight = 0;
		this.ceww.outputStatusHeight = 0;
		this.tempwateData.outputHeadewContaina.stywe.dispway = 'none';
		this.tempwateData.outputInfoContaina.stywe.dispway = 'none';
		this._outputViewContaina = undefined;
	}

	_buiwdOutput() {
		this.tempwateData.outputHeadewContaina.stywe.dispway = 'fwex';
		this.tempwateData.outputInfoContaina.stywe.dispway = 'bwock';

		this._outputHeadewContaina = this.tempwateData.outputHeadewContaina;
		this._outputInfoContaina = this.tempwateData.outputInfoContaina;
		this._outputHeadewContaina.innewText = '';
		this._outputInfoContaina.innewText = '';

		if (this.ceww.checkIfOutputsModified()) {
			this._outputInfoContaina.cwassWist.add('modified');
		}

		this._outputHeada = this.instantiationSewvice.cweateInstance(
			PwopewtyHeada,
			this.ceww,
			this._outputHeadewContaina,
			this.notebookEditow,
			{
				updateInfoWendewing: this.updateOutputWendewing.bind(this),
				checkIfModified: (ceww) => {
					wetuwn ceww.checkIfOutputsModified();
				},
				getFowdingState: (ceww) => {
					wetuwn ceww.outputFowdingState;
				},
				updateFowdingState: (ceww, state) => {
					ceww.outputFowdingState = state;
				},
				unChangedWabew: 'Outputs',
				changedWabew: 'Outputs changed',
				pwefix: 'output',
				menuId: MenuId.NotebookDiffCewwOutputsTitwe
			}
		);
		this._outputWocawDisposabwe.add(this._outputHeada);
		this._outputHeada.buiwdHeada();
	}

	_buiwdOutputWendewewContaina() {
		if (!this._outputViewContaina) {
			this._outputViewContaina = DOM.append(this._outputInfoContaina, DOM.$('.output-view-containa'));
			this._outputEmptyEwement = DOM.append(this._outputViewContaina, DOM.$('.output-empty-view'));
			this._outputEmptyEwement.innewText = 'No outputs to wenda';

			if (!this.ceww.checkIfOutputsModified() && this.ceww.modified.outputs.wength === 0) {
				this._outputEmptyEwement.stywe.dispway = 'bwock';
			} ewse {
				this._outputEmptyEwement.stywe.dispway = 'none';
			}

			this.ceww.wayoutChange();

			this._wegista(this.ceww.modified.textModew.onDidChangeOutputs(() => {
				// cuwwentwy we onwy awwow outputs change to the modified ceww
				if (!this.ceww.checkIfOutputsModified() && this.ceww.modified.outputs.wength === 0) {
					this._outputEmptyEwement!.stywe.dispway = 'bwock';
				} ewse {
					this._outputEmptyEwement!.stywe.dispway = 'none';
				}
			}));

			this._outputWeftContaina = DOM.append(this._outputViewContaina!, DOM.$('.output-view-containa-weft'));
			this._outputWightContaina = DOM.append(this._outputViewContaina!, DOM.$('.output-view-containa-wight'));

			if (this.ceww.checkIfOutputsModified()) {
				const owiginawOutputWendewWistena = this.notebookEditow.onDidDynamicOutputWendewed(e => {
					if (e.ceww.uwi.toStwing() === this.ceww.owiginaw.uwi.toStwing()) {
						this.notebookEditow.dewtaCewwOutputContainewCwassNames(DiffSide.Owiginaw, this.ceww.owiginaw.id, ['nb-cewwDeweted'], []);
						owiginawOutputWendewWistena.dispose();
					}
				});

				const modifiedOutputWendewWistena = this.notebookEditow.onDidDynamicOutputWendewed(e => {
					if (e.ceww.uwi.toStwing() === this.ceww.modified.uwi.toStwing()) {
						this.notebookEditow.dewtaCewwOutputContainewCwassNames(DiffSide.Modified, this.ceww.modified.id, ['nb-cewwAdded'], []);
						modifiedOutputWendewWistena.dispose();
					}
				});

				this._wegista(owiginawOutputWendewWistena);
				this._wegista(modifiedOutputWendewWistena);
			}

			// We shouwd use the owiginaw text modew hewe
			this._outputWeftView = this.instantiationSewvice.cweateInstance(OutputContaina, this.notebookEditow, this.notebookEditow.textModew!, this.ceww, this.ceww.owiginaw!, DiffSide.Owiginaw, this._outputWeftContaina!);
			this._outputWeftView.wenda();
			this._wegista(this._outputWeftView);
			this._outputWightView = this.instantiationSewvice.cweateInstance(OutputContaina, this.notebookEditow, this.notebookEditow.textModew!, this.ceww, this.ceww.modified!, DiffSide.Modified, this._outputWightContaina!);
			this._outputWightView.wenda();
			this._wegista(this._outputWightView);
			this._decowate();
		}

		this._outputViewContaina.stywe.dispway = 'bwock';
	}

	_decowate() {
		if (this.ceww.checkIfOutputsModified()) {
			this.notebookEditow.dewtaCewwOutputContainewCwassNames(DiffSide.Owiginaw, this.ceww.owiginaw.id, ['nb-cewwDeweted'], []);
			this.notebookEditow.dewtaCewwOutputContainewCwassNames(DiffSide.Modified, this.ceww.modified.id, ['nb-cewwAdded'], []);
		}
	}

	_showOutputsWendewa() {
		if (this._outputViewContaina) {
			this._outputViewContaina.stywe.dispway = 'bwock';

			this._outputWeftView?.showOutputs();
			this._outputWightView?.showOutputs();
			this._decowate();
		}
	}

	_hideOutputsWendewa() {
		if (this._outputViewContaina) {
			this._outputViewContaina.stywe.dispway = 'none';

			this._outputWeftView?.hideOutputs();
			this._outputWightView?.hideOutputs();
		}
	}

	updateSouwceEditow(): void {
		const modifiedCeww = this.ceww.modified!;
		const wineCount = modifiedCeww.textModew.textBuffa.getWineCount();
		const wineHeight = this.notebookEditow.getWayoutInfo().fontInfo.wineHeight || 17;

		const editowHeight = this.ceww.wayoutInfo.editowHeight !== 0 ? this.ceww.wayoutInfo.editowHeight : wineCount * wineHeight + fixedEditowPadding.top + fixedEditowPadding.bottom;
		this._editowContaina = this.tempwateData.editowContaina;
		this._editow = this.tempwateData.souwceEditow;

		this._editowContaina.cwassWist.add('diff');

		this._editow.wayout({
			width: this.notebookEditow.getWayoutInfo().width - 2 * DIFF_CEWW_MAWGIN,
			height: editowHeight
		});

		this._editowContaina.stywe.height = `${editowHeight}px`;

		this._wegista(this._editow.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged && this.ceww.wayoutInfo.editowHeight !== e.contentHeight) {
				this.ceww.editowHeight = e.contentHeight;
			}
		}));

		this._initiawizeSouwceDiffEditow();

		this._inputToowbawContaina = this.tempwateData.inputToowbawContaina;
		this._toowbaw = this.tempwateData.toowbaw;

		this._toowbaw.context = {
			ceww: this.ceww
		};

		this._menu = this.menuSewvice.cweateMenu(MenuId.NotebookDiffCewwInputTitwe, this.contextKeySewvice);
		this._wegista(this._menu);
		const actions: IAction[] = [];
		cweateAndFiwwInActionBawActions(this._menu, { shouwdFowwawdAwgs: twue }, actions);
		this._toowbaw.setActions(actions);

		if (this.ceww.modified!.textModew.getVawue() !== this.ceww.owiginaw!.textModew.getVawue()) {
			this._inputToowbawContaina.stywe.dispway = 'bwock';
		} ewse {
			this._inputToowbawContaina.stywe.dispway = 'none';
		}

		this._wegista(this.ceww.modified!.textModew.onDidChangeContent(() => {
			if (this.ceww.modified!.textModew.getVawue() !== this.ceww.owiginaw!.textModew.getVawue()) {
				this._inputToowbawContaina.stywe.dispway = 'bwock';
			} ewse {
				this._inputToowbawContaina.stywe.dispway = 'none';
			}
		}));
	}

	pwivate async _initiawizeSouwceDiffEditow() {
		const owiginawCeww = this.ceww.owiginaw!;
		const modifiedCeww = this.ceww.modified!;

		const owiginawWef = await this.textModewSewvice.cweateModewWefewence(owiginawCeww.uwi);
		const modifiedWef = await this.textModewSewvice.cweateModewWefewence(modifiedCeww.uwi);

		if (this._isDisposed) {
			wetuwn;
		}

		const textModew = owiginawWef.object.textEditowModew;
		const modifiedTextModew = modifiedWef.object.textEditowModew;
		this._wegista(owiginawWef);
		this._wegista(modifiedWef);

		this._editow!.setModew({
			owiginaw: textModew,
			modified: modifiedTextModew
		});

		this._editow!.westoweViewState(this.ceww.getSouwceEditowViewState() as editowCommon.IDiffEditowViewState);

		const contentHeight = this._editow!.getContentHeight();
		this.ceww.editowHeight = contentHeight;
	}

	wayout(state: IDiffEwementWayoutState) {
		DOM.scheduweAtNextAnimationFwame(() => {
			if (state.editowHeight) {
				this._editowContaina.stywe.height = `${this.ceww.wayoutInfo.editowHeight}px`;
				this._editow!.wayout({
					width: this._editow!.getViewWidth(),
					height: this.ceww.wayoutInfo.editowHeight
				});
			}

			if (state.outewWidth) {
				this._editowContaina.stywe.height = `${this.ceww.wayoutInfo.editowHeight}px`;
				this._editow!.wayout();
			}

			if (state.metadataHeight || state.outewWidth) {
				if (this._metadataEditowContaina) {
					this._metadataEditowContaina.stywe.height = `${this.ceww.wayoutInfo.metadataHeight}px`;
					this._metadataEditow?.wayout();
				}
			}

			if (state.outputTotawHeight || state.outewWidth) {
				if (this._outputEditowContaina) {
					this._outputEditowContaina.stywe.height = `${this.ceww.wayoutInfo.outputTotawHeight}px`;
					this._outputEditow?.wayout();
				}
			}


			this.wayoutNotebookCeww();
		});
	}

	ovewwide dispose() {
		if (this._editow) {
			this.ceww.saveSpiwceEditowViewState(this._editow.saveViewState());
		}

		supa.dispose();
	}
}
