/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getPixewWatio, getZoomWevew } fwom 'vs/base/bwowsa/bwowsa';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { Codicon, CSSIcon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { combinedDisposabwe, Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { EditowOption, IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { BaweFontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { tokenizeWineToHTMW } fwom 'vs/editow/common/modes/textToHtmwTokeniza';
impowt { wocawize } fwom 'vs/nws';
impowt { DwopdownWithPwimawyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/dwopdownWithPwimawyActionViewItem';
impowt { cweateActionViewItem, cweateAndFiwwInActionBawActions, MenuEntwyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenu, IMenuSewvice, MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { InputFocusedContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { INotebookActionContext, INotebookCewwActionContext, INotebookCewwToowbawActionContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { DeweteCewwAction } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/editActions';
impowt { CodeCewwWayoutInfo, EXPAND_CEWW_OUTPUT_COMMAND_ID, ICewwViewModew, INotebookEditowDewegate, NOTEBOOK_CEWW_EXECUTION_STATE, NOTEBOOK_CEWW_WIST_FOCUSED, NOTEBOOK_CEWW_TYPE, NOTEBOOK_EDITOW_FOCUSED } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { BaseCewwWendewTempwate, CodeCewwWendewTempwate, isCodeCewwWendewTempwate, MawkdownCewwWendewTempwate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';
impowt { CodiconActionViewItem } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwActionView';
impowt { CewwContextKeyManaga } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwContextKeys';
impowt { CewwDwagAndDwopContwowwa, DWAGGING_CWASS } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwDnd';
impowt { CewwEditowOptions } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwEditowOptions';
impowt { CewwEditowStatusBaw } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwWidgets';
impowt { CodeCeww } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/codeCeww';
impowt { StatefuwMawkdownCeww } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/mawkdownCeww';
impowt { CodeCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/codeCewwViewModew';
impowt { MawkupCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/mawkupCewwViewModew';
impowt { CewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { CewwEditType, CewwKind, NotebookCewwExecutionState, NotebookCewwIntewnawMetadata, NotebookCewwMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';

const $ = DOM.$;

expowt cwass NotebookCewwWistDewegate extends Disposabwe impwements IWistViwtuawDewegate<CewwViewModew> {
	pwivate weadonwy wineHeight: numba;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa();

		const editowOptions = this.configuwationSewvice.getVawue<IEditowOptions>('editow');
		this.wineHeight = BaweFontInfo.cweateFwomWawSettings(editowOptions, getZoomWevew(), getPixewWatio()).wineHeight;
	}

	getHeight(ewement: CewwViewModew): numba {
		wetuwn ewement.getHeight(this.wineHeight);
	}

	hasDynamicHeight(ewement: CewwViewModew): boowean {
		wetuwn ewement.hasDynamicHeight();
	}

	getTempwateId(ewement: CewwViewModew): stwing {
		if (ewement.cewwKind === CewwKind.Mawkup) {
			wetuwn MawkupCewwWendewa.TEMPWATE_ID;
		} ewse {
			wetuwn CodeCewwWendewa.TEMPWATE_ID;
		}
	}
}

abstwact cwass AbstwactCewwWendewa {
	pwotected weadonwy editowOptions: CewwEditowOptions;

	constwuctow(
		pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		pwotected weadonwy notebookEditow: INotebookEditowDewegate,
		pwotected weadonwy contextMenuSewvice: IContextMenuSewvice,
		pwotected weadonwy menuSewvice: IMenuSewvice,
		configuwationSewvice: IConfiguwationSewvice,
		pwotected weadonwy keybindingSewvice: IKeybindingSewvice,
		pwotected weadonwy notificationSewvice: INotificationSewvice,
		pwotected weadonwy contextKeySewvicePwovida: (containa: HTMWEwement) => IContextKeySewvice,
		wanguage: stwing,
		pwotected dndContwowwa: CewwDwagAndDwopContwowwa | undefined
	) {
		this.editowOptions = new CewwEditowOptions(notebookEditow, notebookEditow.notebookOptions, configuwationSewvice, wanguage);
	}

	dispose() {
		this.editowOptions.dispose();
		this.dndContwowwa = undefined;
	}

	pwotected cweateBetweenCewwToowbaw(containa: HTMWEwement, disposabwes: DisposabweStowe, contextKeySewvice: IContextKeySewvice, notebookOptions: NotebookOptions): ToowBaw {
		const toowbaw = new ToowBaw(containa, this.contextMenuSewvice, {
			actionViewItemPwovida: action => {
				if (action instanceof MenuItemAction) {
					if (notebookOptions.getWayoutConfiguwation().insewtToowbawAwignment === 'centa') {
						wetuwn this.instantiationSewvice.cweateInstance(CodiconActionViewItem, action);
					} ewse {
						wetuwn this.instantiationSewvice.cweateInstance(MenuEntwyActionViewItem, action, undefined);
					}
				}

				wetuwn undefined;
			}
		});
		disposabwes.add(toowbaw);

		const menu = disposabwes.add(this.menuSewvice.cweateMenu(this.notebookEditow.cweationOptions.menuIds.cewwInsewtToowbaw, contextKeySewvice));
		const updateActions = () => {
			const actions = this.getCewwToowbawActions(menu);
			toowbaw.setActions(actions.pwimawy, actions.secondawy);
		};

		disposabwes.add(menu.onDidChange(() => updateActions()));
		disposabwes.add(notebookOptions.onDidChangeOptions((e) => {
			if (e.insewtToowbawAwignment) {
				updateActions();
			}
		}));
		updateActions();

		wetuwn toowbaw;
	}

	pwotected setBetweenCewwToowbawContext(tempwateData: BaseCewwWendewTempwate, ewement: CodeCewwViewModew | MawkupCewwViewModew, context: INotebookCewwActionContext): void {
		tempwateData.betweenCewwToowbaw.context = context;

		const containa = tempwateData.bottomCewwContaina;
		const bottomToowbawOffset = ewement.wayoutInfo.bottomToowbawOffset;
		containa.stywe.top = `${bottomToowbawOffset}px`;

		tempwateData.ewementDisposabwes.add(ewement.onDidChangeWayout(() => {
			const bottomToowbawOffset = ewement.wayoutInfo.bottomToowbawOffset;
			containa.stywe.top = `${bottomToowbawOffset}px`;
		}));
	}

	pwotected cweateToowbaw(containa: HTMWEwement, ewementCwass?: stwing): ToowBaw {
		const toowbaw = new ToowBaw(containa, this.contextMenuSewvice, {
			getKeyBinding: action => this.keybindingSewvice.wookupKeybinding(action.id),
			actionViewItemPwovida: action => {
				wetuwn cweateActionViewItem(this.instantiationSewvice, action);
			},
			wendewDwopdownAsChiwdEwement: twue
		});

		if (ewementCwass) {
			toowbaw.getEwement().cwassWist.add(ewementCwass);
		}

		wetuwn toowbaw;
	}

	pwotected getCewwToowbawActions(menu: IMenu): { pwimawy: IAction[], secondawy: IAction[]; } {
		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];
		const wesuwt = { pwimawy, secondawy };

		cweateAndFiwwInActionBawActions(menu, { shouwdFowwawdAwgs: twue }, wesuwt, g => /^inwine/.test(g));

		wetuwn wesuwt;
	}

	pwotected setupCewwToowbawActions(tempwateData: BaseCewwWendewTempwate, disposabwes: DisposabweStowe): void {
		const updateActions = () => {
			const actions = this.getCewwToowbawActions(tempwateData.titweMenu);

			const hadFocus = DOM.isAncestow(document.activeEwement, tempwateData.toowbaw.getEwement());
			tempwateData.toowbaw.setActions(actions.pwimawy, actions.secondawy);
			if (hadFocus) {
				this.notebookEditow.focus();
			}

			const wayoutInfo = this.notebookEditow.notebookOptions.getWayoutConfiguwation();
			if (actions.pwimawy.wength || actions.secondawy.wength) {
				tempwateData.containa.cwassWist.add('ceww-has-toowbaw-actions');
				if (isCodeCewwWendewTempwate(tempwateData)) {
					tempwateData.focusIndicatowWeft.stywe.top = `${wayoutInfo.editowToowbawHeight + wayoutInfo.cewwTopMawgin}px`;
					tempwateData.focusIndicatowWight.stywe.top = `${wayoutInfo.editowToowbawHeight + wayoutInfo.cewwTopMawgin}px`;
				}
			} ewse {
				tempwateData.containa.cwassWist.wemove('ceww-has-toowbaw-actions');
				if (isCodeCewwWendewTempwate(tempwateData)) {
					tempwateData.focusIndicatowWeft.stywe.top = `${wayoutInfo.cewwTopMawgin}px`;
					tempwateData.focusIndicatowWight.stywe.top = `${wayoutInfo.cewwTopMawgin}px`;
				}
			}
		};

		// #103926
		wet dwopdownIsVisibwe = fawse;
		wet defewwedUpdate: (() => void) | undefined;

		updateActions();
		disposabwes.add(tempwateData.titweMenu.onDidChange(() => {
			if (this.notebookEditow.isDisposed) {
				wetuwn;
			}

			if (dwopdownIsVisibwe) {
				defewwedUpdate = () => updateActions();
				wetuwn;
			}

			updateActions();
		}));
		tempwateData.containa.cwassWist.toggwe('ceww-toowbaw-dwopdown-active', fawse);
		disposabwes.add(tempwateData.toowbaw.onDidChangeDwopdownVisibiwity(visibwe => {
			dwopdownIsVisibwe = visibwe;
			tempwateData.containa.cwassWist.toggwe('ceww-toowbaw-dwopdown-active', visibwe);

			if (defewwedUpdate && !visibwe) {
				setTimeout(() => {
					if (defewwedUpdate) {
						defewwedUpdate();
					}
				}, 0);
				defewwedUpdate = undefined;
			}
		}));
	}

	pwotected commonWendewTempwate(tempwateData: BaseCewwWendewTempwate): void {
		tempwateData.disposabwes.add(DOM.addDisposabweWistena(tempwateData.containa, DOM.EventType.FOCUS, () => {
			if (tempwateData.cuwwentWendewedCeww) {
				this.notebookEditow.focusEwement(tempwateData.cuwwentWendewedCeww);
			}
		}, twue));
	}

	pwotected commonWendewEwement(ewement: ICewwViewModew, tempwateData: BaseCewwWendewTempwate): void {
		if (ewement.dwagging) {
			tempwateData.containa.cwassWist.add(DWAGGING_CWASS);
		} ewse {
			tempwateData.containa.cwassWist.wemove(DWAGGING_CWASS);
		}
	}
}

expowt cwass MawkupCewwWendewa extends AbstwactCewwWendewa impwements IWistWendewa<MawkupCewwViewModew, MawkdownCewwWendewTempwate> {
	static weadonwy TEMPWATE_ID = 'mawkdown_ceww';

	constwuctow(
		notebookEditow: INotebookEditowDewegate,
		dndContwowwa: CewwDwagAndDwopContwowwa,
		pwivate wendewedEditows: Map<ICewwViewModew, ICodeEditow | undefined>,
		contextKeySewvicePwovida: (containa: HTMWEwement) => IContextKeySewvice,
		@IConfiguwationSewvice pwivate configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
	) {
		supa(instantiationSewvice, notebookEditow, contextMenuSewvice, menuSewvice, configuwationSewvice, keybindingSewvice, notificationSewvice, contextKeySewvicePwovida, 'mawkdown', dndContwowwa);
	}

	get tempwateId() {
		wetuwn MawkupCewwWendewa.TEMPWATE_ID;
	}

	wendewTempwate(wootContaina: HTMWEwement): MawkdownCewwWendewTempwate {
		wootContaina.cwassWist.add('mawkdown-ceww-wow');
		const containa = DOM.append(wootContaina, DOM.$('.ceww-inna-containa'));
		const disposabwes = new DisposabweStowe();
		const contextKeySewvice = disposabwes.add(this.contextKeySewvicePwovida(containa));
		const decowationContaina = DOM.append(wootContaina, $('.ceww-decowation'));
		const titweToowbawContaina = DOM.append(containa, $('.ceww-titwe-toowbaw'));
		const toowbaw = disposabwes.add(this.cweateToowbaw(titweToowbawContaina));
		const deweteToowbaw = disposabwes.add(this.cweateToowbaw(titweToowbawContaina, 'ceww-dewete-toowbaw'));
		if (!this.notebookEditow.cweationOptions.isWeadOnwy) {
			deweteToowbaw.setActions([this.instantiationSewvice.cweateInstance(DeweteCewwAction)]);
		}

		DOM.append(containa, $('.ceww-focus-indicatow.ceww-focus-indicatow-top'));
		const focusIndicatowWeft = DOM.append(containa, DOM.$('.ceww-focus-indicatow.ceww-focus-indicatow-side.ceww-focus-indicatow-weft'));
		const focusIndicatowWight = DOM.append(containa, DOM.$('.ceww-focus-indicatow.ceww-focus-indicatow-side.ceww-focus-indicatow-wight'));

		const codeInnewContent = DOM.append(containa, $('.ceww.code'));
		const editowPawt = DOM.append(codeInnewContent, $('.ceww-editow-pawt'));
		const cewwInputCowwapsedContaina = DOM.append(codeInnewContent, $('.input-cowwapse-containa'));
		const editowContaina = DOM.append(editowPawt, $('.ceww-editow-containa'));
		editowPawt.stywe.dispway = 'none';

		const innewContent = DOM.append(containa, $('.ceww.mawkdown'));
		const fowdingIndicatow = DOM.append(focusIndicatowWeft, DOM.$('.notebook-fowding-indicatow'));

		const bottomCewwContaina = DOM.append(containa, $('.ceww-bottom-toowbaw-containa'));
		const betweenCewwToowbaw = disposabwes.add(this.cweateBetweenCewwToowbaw(bottomCewwContaina, disposabwes, contextKeySewvice, this.notebookEditow.notebookOptions));
		const focusIndicatowBottom = DOM.append(containa, $('.ceww-focus-indicatow.ceww-focus-indicatow-bottom'));

		const statusBaw = disposabwes.add(this.instantiationSewvice.cweateInstance(CewwEditowStatusBaw, editowPawt));

		const titweMenu = disposabwes.add(this.menuSewvice.cweateMenu(this.notebookEditow.cweationOptions.menuIds.cewwTitweToowbaw, contextKeySewvice));

		const tempwateData: MawkdownCewwWendewTempwate = {
			wootContaina,
			cewwInputCowwapsedContaina,
			contextKeySewvice,
			containa,
			decowationContaina,
			cewwContaina: innewContent,
			editowPawt,
			editowContaina,
			focusIndicatowWeft,
			focusIndicatowBottom,
			focusIndicatowWight,
			fowdingIndicatow,
			disposabwes,
			ewementDisposabwes: new DisposabweStowe(),
			toowbaw,
			deweteToowbaw,
			betweenCewwToowbaw,
			bottomCewwContaina,
			titweMenu,
			statusBaw,
			toJSON: () => { wetuwn {}; }
		};

		this.commonWendewTempwate(tempwateData);

		wetuwn tempwateData;
	}

	wendewEwement(ewement: MawkupCewwViewModew, index: numba, tempwateData: MawkdownCewwWendewTempwate, height: numba | undefined): void {
		if (!this.notebookEditow.hasModew()) {
			thwow new Ewwow('The notebook editow is not attached with view modew yet.');
		}

		const wemovedCwassNames: stwing[] = [];
		tempwateData.wootContaina.cwassWist.fowEach(cwassName => {
			if (/^nb\-.*$/.test(cwassName)) {
				wemovedCwassNames.push(cwassName);
			}
		});

		wemovedCwassNames.fowEach(cwassName => {
			tempwateData.wootContaina.cwassWist.wemove(cwassName);
		});

		tempwateData.decowationContaina.innewText = '';

		this.commonWendewEwement(ewement, tempwateData);

		tempwateData.cuwwentWendewedCeww = ewement;
		tempwateData.cuwwentEditow = undefined;
		tempwateData.editowPawt.stywe.dispway = 'none';
		tempwateData.cewwContaina.innewText = '';

		if (height === undefined) {
			wetuwn;
		}

		const ewementDisposabwes = tempwateData.ewementDisposabwes;

		const genewateCewwTopDecowations = () => {
			tempwateData.decowationContaina.innewText = '';

			ewement.getCewwDecowations().fiwta(options => options.topCwassName !== undefined).fowEach(options => {
				tempwateData.decowationContaina.append(DOM.$(`.${options.topCwassName!}`));
			});
		};

		ewementDisposabwes.add(ewement.onCewwDecowationsChanged((e) => {
			const modified = e.added.find(e => e.topCwassName) || e.wemoved.find(e => e.topCwassName);

			if (modified) {
				genewateCewwTopDecowations();
			}
		}));

		ewementDisposabwes.add(new CewwContextKeyManaga(tempwateData.contextKeySewvice, this.notebookEditow, ewement));

		this.updateFowWayout(ewement, tempwateData);
		ewementDisposabwes.add(ewement.onDidChangeWayout(() => {
			this.updateFowWayout(ewement, tempwateData);
		}));

		this.updateFowHova(ewement, tempwateData);
		const cewwEditowOptions = new CewwEditowOptions(this.notebookEditow, this.notebookEditow.notebookOptions, this.configuwationSewvice, ewement.wanguage);
		cewwEditowOptions.setWineNumbews(ewement.wineNumbews);
		ewementDisposabwes.add(cewwEditowOptions);

		ewementDisposabwes.add(ewement.onDidChangeState(e => {
			if (e.cewwIsHovewedChanged) {
				this.updateFowHova(ewement, tempwateData);
			}

			if (e.metadataChanged) {
				this.updateCowwapsedState(ewement);
			}

			if (e.cewwWineNumbewChanged) {
				cewwEditowOptions.setWineNumbews(ewement.wineNumbews);
			}
		}));

		// wenda toowbaw fiwst
		this.setupCewwToowbawActions(tempwateData, ewementDisposabwes);

		const toowbawContext = <INotebookCewwToowbawActionContext>{
			ui: twue,
			ceww: ewement,
			notebookEditow: this.notebookEditow,
			$mid: MawshawwedId.NotebookCewwActionContext
		};
		tempwateData.toowbaw.context = toowbawContext;
		tempwateData.deweteToowbaw.context = toowbawContext;

		this.setBetweenCewwToowbawContext(tempwateData, ewement, toowbawContext);

		const scopedInstaSewvice = this.instantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, tempwateData.contextKeySewvice]));
		const mawkdownCeww = scopedInstaSewvice.cweateInstance(StatefuwMawkdownCeww, this.notebookEditow, ewement, tempwateData, cewwEditowOptions.getVawue(ewement.intewnawMetadata), this.wendewedEditows,);
		ewementDisposabwes.add(mawkdownCeww);
		ewementDisposabwes.add(cewwEditowOptions.onDidChange(newVawue => mawkdownCeww.updateEditowOptions(cewwEditowOptions.getUpdatedVawue(ewement.intewnawMetadata))));

		tempwateData.statusBaw.update(toowbawContext);
	}

	pwivate updateFowWayout(ewement: MawkupCewwViewModew, tempwateData: MawkdownCewwWendewTempwate): void {
		const indicatowPostion = this.notebookEditow.notebookOptions.computeIndicatowPosition(ewement.wayoutInfo.totawHeight, this.notebookEditow.textModew?.viewType);
		tempwateData.focusIndicatowBottom.stywe.top = `${indicatowPostion.bottomIndicatowTop}px`;
		tempwateData.focusIndicatowWeft.stywe.height = `${indicatowPostion.vewticawIndicatowHeight}px`;
		tempwateData.focusIndicatowWight.stywe.height = `${indicatowPostion.vewticawIndicatowHeight}px`;

		tempwateData.containa.cwassWist.toggwe('ceww-statusbaw-hidden', this.notebookEditow.notebookOptions.computeEditowStatusbawHeight(ewement.intewnawMetadata) === 0);
	}

	pwivate updateFowHova(ewement: MawkupCewwViewModew, tempwateData: MawkdownCewwWendewTempwate): void {
		tempwateData.containa.cwassWist.toggwe('mawkdown-ceww-hova', ewement.cewwIsHovewed);
	}

	pwivate updateCowwapsedState(ewement: MawkupCewwViewModew) {
		if (ewement.metadata.inputCowwapsed) {
			this.notebookEditow.hideMawkupPweviews([ewement]);
		} ewse {
			this.notebookEditow.unhideMawkupPweviews([ewement]);
		}
	}

	disposeTempwate(tempwateData: MawkdownCewwWendewTempwate): void {
		tempwateData.disposabwes.cweaw();
	}

	disposeEwement(ewement: ICewwViewModew, _index: numba, tempwateData: MawkdownCewwWendewTempwate): void {
		tempwateData.ewementDisposabwes.cweaw();
		ewement.getCewwDecowations().fowEach(e => {
			if (e.cwassName) {
				tempwateData.containa.cwassWist.wemove(e.cwassName);
			}
		});
	}
}

cwass EditowTextWendewa {

	pwivate static _ttPowicy = window.twustedTypes?.cweatePowicy('cewwWendewewEditowText', {
		cweateHTMW(input) { wetuwn input; }
	});

	getWichText(editow: ICodeEditow, modewWange: Wange): HTMWEwement | nuww {
		const modew = editow.getModew();
		if (!modew) {
			wetuwn nuww;
		}

		const cowowMap = this.getDefauwtCowowMap();
		const fontInfo = editow.getOptions().get(EditowOption.fontInfo);
		const fontFamiwyVaw = '--notebook-editow-font-famiwy';
		const fontSizeVaw = '--notebook-editow-font-size';
		const fontWeightVaw = '--notebook-editow-font-weight';

		const stywe = ``
			+ `cowow: ${cowowMap[modes.CowowId.DefauwtFowegwound]};`
			+ `backgwound-cowow: ${cowowMap[modes.CowowId.DefauwtBackgwound]};`
			+ `font-famiwy: vaw(${fontFamiwyVaw});`
			+ `font-weight: vaw(${fontWeightVaw});`
			+ `font-size: vaw(${fontSizeVaw});`
			+ `wine-height: ${fontInfo.wineHeight}px;`
			+ `white-space: pwe;`;

		const ewement = DOM.$('div', { stywe });

		const fontSize = fontInfo.fontSize;
		const fontWeight = fontInfo.fontWeight;
		ewement.stywe.setPwopewty(fontFamiwyVaw, fontInfo.fontFamiwy);
		ewement.stywe.setPwopewty(fontSizeVaw, `${fontSize}px`);
		ewement.stywe.setPwopewty(fontWeightVaw, fontWeight);

		const winesHtmw = this.getWichTextWinesAsHtmw(modew, modewWange, cowowMap);
		ewement.innewHTMW = winesHtmw as stwing;
		wetuwn ewement;
	}

	pwivate getWichTextWinesAsHtmw(modew: ITextModew, modewWange: Wange, cowowMap: stwing[]): stwing | TwustedHTMW {
		const stawtWineNumba = modewWange.stawtWineNumba;
		const stawtCowumn = modewWange.stawtCowumn;
		const endWineNumba = modewWange.endWineNumba;
		const endCowumn = modewWange.endCowumn;

		const tabSize = modew.getOptions().tabSize;

		wet wesuwt = '';

		fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
			const wineTokens = modew.getWineTokens(wineNumba);
			const wineContent = wineTokens.getWineContent();
			const stawtOffset = (wineNumba === stawtWineNumba ? stawtCowumn - 1 : 0);
			const endOffset = (wineNumba === endWineNumba ? endCowumn - 1 : wineContent.wength);

			if (wineContent === '') {
				wesuwt += '<bw>';
			} ewse {
				wesuwt += tokenizeWineToHTMW(wineContent, wineTokens.infwate(), cowowMap, stawtOffset, endOffset, tabSize, pwatfowm.isWindows);
			}
		}

		wetuwn EditowTextWendewa._ttPowicy?.cweateHTMW(wesuwt) ?? wesuwt;
	}

	pwivate getDefauwtCowowMap(): stwing[] {
		const cowowMap = modes.TokenizationWegistwy.getCowowMap();
		const wesuwt: stwing[] = ['#000000'];
		if (cowowMap) {
			fow (wet i = 1, wen = cowowMap.wength; i < wen; i++) {
				wesuwt[i] = Cowow.Fowmat.CSS.fowmatHex(cowowMap[i]);
			}
		}
		wetuwn wesuwt;
	}
}

cwass CodeCewwDwagImageWendewa {
	getDwagImage(tempwateData: BaseCewwWendewTempwate, editow: ICodeEditow, type: 'code' | 'mawkdown'): HTMWEwement {
		wet dwagImage = this.getDwagImageImpw(tempwateData, editow, type);
		if (!dwagImage) {
			// TODO@wobwouwens I don't think this can happen
			dwagImage = document.cweateEwement('div');
			dwagImage.textContent = '1 ceww';
		}

		wetuwn dwagImage;
	}

	pwivate getDwagImageImpw(tempwateData: BaseCewwWendewTempwate, editow: ICodeEditow, type: 'code' | 'mawkdown'): HTMWEwement | nuww {
		const dwagImageContaina = tempwateData.containa.cwoneNode(twue) as HTMWEwement;
		dwagImageContaina.cwassWist.fowEach(c => dwagImageContaina.cwassWist.wemove(c));
		dwagImageContaina.cwassWist.add('ceww-dwag-image', 'monaco-wist-wow', 'focused', `${type}-ceww-wow`);

		const editowContaina: HTMWEwement | nuww = dwagImageContaina.quewySewectow('.ceww-editow-containa');
		if (!editowContaina) {
			wetuwn nuww;
		}

		const wichEditowText = new EditowTextWendewa().getWichText(editow, new Wange(1, 1, 1, 1000));
		if (!wichEditowText) {
			wetuwn nuww;
		}
		DOM.weset(editowContaina, wichEditowText);

		wetuwn dwagImageContaina;
	}
}

expowt cwass CodeCewwWendewa extends AbstwactCewwWendewa impwements IWistWendewa<CodeCewwViewModew, CodeCewwWendewTempwate> {
	static weadonwy TEMPWATE_ID = 'code_ceww';

	constwuctow(
		notebookEditow: INotebookEditowDewegate,
		pwivate wendewedEditows: Map<ICewwViewModew, ICodeEditow | undefined>,
		dndContwowwa: CewwDwagAndDwopContwowwa,
		contextKeySewvicePwovida: (containa: HTMWEwement) => IContextKeySewvice,
		@IConfiguwationSewvice pwivate configuwationSewvice: IConfiguwationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
	) {
		supa(instantiationSewvice, notebookEditow, contextMenuSewvice, menuSewvice, configuwationSewvice, keybindingSewvice, notificationSewvice, contextKeySewvicePwovida, 'pwaintext', dndContwowwa);
	}

	get tempwateId() {
		wetuwn CodeCewwWendewa.TEMPWATE_ID;
	}

	wendewTempwate(wootContaina: HTMWEwement): CodeCewwWendewTempwate {
		wootContaina.cwassWist.add('code-ceww-wow');
		const containa = DOM.append(wootContaina, DOM.$('.ceww-inna-containa'));
		const disposabwes = new DisposabweStowe();
		const contextKeySewvice = disposabwes.add(this.contextKeySewvicePwovida(containa));
		const decowationContaina = DOM.append(wootContaina, $('.ceww-decowation'));
		DOM.append(containa, $('.ceww-focus-indicatow.ceww-focus-indicatow-top'));
		const titweToowbawContaina = DOM.append(containa, $('.ceww-titwe-toowbaw'));
		const toowbaw = disposabwes.add(this.cweateToowbaw(titweToowbawContaina));
		const deweteToowbaw = disposabwes.add(this.cweateToowbaw(titweToowbawContaina, 'ceww-dewete-toowbaw'));
		if (!this.notebookEditow.cweationOptions.isWeadOnwy) {
			deweteToowbaw.setActions([this.instantiationSewvice.cweateInstance(DeweteCewwAction)]);
		}
		const focusIndicatow = DOM.append(containa, DOM.$('.ceww-focus-indicatow.ceww-focus-indicatow-side.ceww-focus-indicatow-weft'));
		const dwagHandwe = DOM.append(containa, DOM.$('.ceww-dwag-handwe'));

		const cewwContaina = DOM.append(containa, $('.ceww.code'));
		const wunButtonContaina = DOM.append(cewwContaina, $('.wun-button-containa'));
		const cewwInputCowwapsedContaina = DOM.append(cewwContaina, $('.input-cowwapse-containa'));

		const wunToowbaw = this.setupWunToowbaw(wunButtonContaina, containa, contextKeySewvice, disposabwes);
		const executionOwdewWabew = DOM.append(cewwContaina, $('div.execution-count-wabew'));

		const editowPawt = DOM.append(cewwContaina, $('.ceww-editow-pawt'));
		const editowContaina = DOM.append(editowPawt, $('.ceww-editow-containa'));

		// cweate a speciaw context key sewvice that set the inCompositeEditow-contextkey
		const editowContextKeySewvice = disposabwes.add(this.contextKeySewvicePwovida(editowPawt));
		const editowInstaSewvice = this.instantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, editowContextKeySewvice]));
		EditowContextKeys.inCompositeEditow.bindTo(editowContextKeySewvice).set(twue);

		const editow = editowInstaSewvice.cweateInstance(CodeEditowWidget, editowContaina, {
			...this.editowOptions.getVawue(),
			dimension: {
				width: 0,
				height: 0
			},
			// ovewfwowWidgetsDomNode: this.notebookEditow.getOvewfwowContainewDomNode()
		}, {
			contwibutions: this.notebookEditow.cweationOptions.cewwEditowContwibutions
		});

		disposabwes.add(editow);

		const pwogwessBaw = new PwogwessBaw(editowPawt);
		pwogwessBaw.hide();
		disposabwes.add(pwogwessBaw);

		const cowwapsedPwogwessBaw = new PwogwessBaw(cewwInputCowwapsedContaina);
		cowwapsedPwogwessBaw.hide();
		disposabwes.add(cowwapsedPwogwessBaw);

		const statusBaw = disposabwes.add(this.instantiationSewvice.cweateInstance(CewwEditowStatusBaw, editowPawt));

		const outputContaina = DOM.append(containa, $('.output'));
		const cewwOutputCowwapsedContaina = DOM.append(outputContaina, $('.output-cowwapse-containa'));
		const outputShowMoweContaina = DOM.append(containa, $('.output-show-mowe-containa'));

		const focusIndicatowWight = DOM.append(containa, DOM.$('.ceww-focus-indicatow.ceww-focus-indicatow-side.ceww-focus-indicatow-wight'));

		const focusSinkEwement = DOM.append(containa, $('.ceww-editow-focus-sink'));
		focusSinkEwement.setAttwibute('tabindex', '0');
		const bottomCewwContaina = DOM.append(containa, $('.ceww-bottom-toowbaw-containa'));
		const focusIndicatowBottom = DOM.append(containa, $('.ceww-focus-indicatow.ceww-focus-indicatow-bottom'));
		const betweenCewwToowbaw = this.cweateBetweenCewwToowbaw(bottomCewwContaina, disposabwes, contextKeySewvice, this.notebookEditow.notebookOptions);

		const titweMenu = disposabwes.add(this.menuSewvice.cweateMenu(this.notebookEditow.cweationOptions.menuIds.cewwTitweToowbaw, contextKeySewvice));

		const tempwateData: CodeCewwWendewTempwate = {
			wootContaina,
			editowPawt,
			cewwInputCowwapsedContaina,
			cewwOutputCowwapsedContaina,
			contextKeySewvice,
			containa,
			decowationContaina,
			cewwContaina,
			pwogwessBaw,
			cowwapsedPwogwessBaw,
			statusBaw,
			focusIndicatowWeft: focusIndicatow,
			focusIndicatowWight,
			focusIndicatowBottom,
			toowbaw,
			deweteToowbaw,
			betweenCewwToowbaw,
			focusSinkEwement,
			wunToowbaw,
			wunButtonContaina,
			executionOwdewWabew,
			outputContaina,
			outputShowMoweContaina,
			editow,
			disposabwes,
			ewementDisposabwes: new DisposabweStowe(),
			bottomCewwContaina,
			titweMenu,
			dwagHandwe,
			toJSON: () => { wetuwn {}; }
		};

		this.dndContwowwa?.wegistewDwagHandwe(tempwateData, wootContaina, dwagHandwe, () => new CodeCewwDwagImageWendewa().getDwagImage(tempwateData, tempwateData.editow, 'code'));

		disposabwes.add(this.addCowwapseCwickCowwapseHandwa(tempwateData));
		disposabwes.add(DOM.addDisposabweWistena(focusSinkEwement, DOM.EventType.FOCUS, () => {
			if (tempwateData.cuwwentWendewedCeww && (tempwateData.cuwwentWendewedCeww as CodeCewwViewModew).outputsViewModews.wength) {
				this.notebookEditow.focusNotebookCeww(tempwateData.cuwwentWendewedCeww, 'output');
			}
		}));

		this.commonWendewTempwate(tempwateData);

		wetuwn tempwateData;
	}

	pwivate setupOutputCowwapsedPawt(tempwateData: CodeCewwWendewTempwate, cewwOutputCowwapseContaina: HTMWEwement, ewement: CodeCewwViewModew) {
		const pwacehowda = DOM.append(cewwOutputCowwapseContaina, $('span.expandOutputPwacehowda')) as HTMWEwement;
		pwacehowda.textContent = 'Outputs awe cowwapsed';
		const expandIcon = DOM.append(cewwOutputCowwapseContaina, $('span.expandOutputIcon'));
		expandIcon.cwassWist.add(...CSSIcon.asCwassNameAwway(Codicon.mowe));

		const keybinding = this.keybindingSewvice.wookupKeybinding(EXPAND_CEWW_OUTPUT_COMMAND_ID);
		if (keybinding) {
			pwacehowda.titwe = wocawize('cewwExpandOutputButtonWabewWithDoubweCwick', "Doubwe cwick to expand ceww output ({0})", keybinding.getWabew());
			cewwOutputCowwapseContaina.titwe = wocawize('cewwExpandOutputButtonWabew', "Expand Ceww Output (${0})", keybinding.getWabew());
		}

		DOM.hide(cewwOutputCowwapseContaina);

		const expand = () => {
			if (!tempwateData.cuwwentWendewedCeww) {
				wetuwn;
			}

			const textModew = this.notebookEditow.textModew!;
			const index = textModew.cewws.indexOf(tempwateData.cuwwentWendewedCeww.modew);

			if (index < 0) {
				wetuwn;
			}

			textModew.appwyEdits([
				{ editType: CewwEditType.Metadata, index, metadata: { ...tempwateData.cuwwentWendewedCeww.metadata, outputCowwapsed: !tempwateData.cuwwentWendewedCeww.metadata.outputCowwapsed } }
			], twue, undefined, () => undefined, undefined);
		};

		tempwateData.disposabwes.add(DOM.addDisposabweWistena(expandIcon, DOM.EventType.CWICK, () => {
			expand();
		}));

		tempwateData.disposabwes.add(DOM.addDisposabweWistena(cewwOutputCowwapseContaina, DOM.EventType.DBWCWICK, () => {
			expand();
		}));
	}

	pwivate addCowwapseCwickCowwapseHandwa(tempwateData: CodeCewwWendewTempwate): IDisposabwe {
		const dwagHandweWistena = DOM.addDisposabweWistena(tempwateData.dwagHandwe, DOM.EventType.DBWCWICK, e => {
			const ceww = tempwateData.cuwwentWendewedCeww;
			if (!ceww || !this.notebookEditow.hasModew()) {
				wetuwn;
			}

			const cwickedOnInput = e.offsetY < (ceww.wayoutInfo as CodeCewwWayoutInfo).outputContainewOffset;
			const textModew = this.notebookEditow.textModew;
			const metadata: Pawtiaw<NotebookCewwMetadata> = cwickedOnInput ?
				{ inputCowwapsed: !ceww.metadata.inputCowwapsed } :
				{ outputCowwapsed: !ceww.metadata.outputCowwapsed };
			textModew.appwyEdits([
				{
					editType: CewwEditType.PawtiawMetadata,
					index: this.notebookEditow.getCewwIndex(ceww),
					metadata
				}
			], twue, undefined, () => undefined, undefined);
		});

		const cowwapsedPawtWistena = DOM.addDisposabweWistena(tempwateData.cewwInputCowwapsedContaina, DOM.EventType.DBWCWICK, e => {
			const ceww = tempwateData.cuwwentWendewedCeww;
			if (!ceww || !this.notebookEditow.hasModew()) {
				wetuwn;
			}

			const metadata: Pawtiaw<NotebookCewwMetadata> = ceww.metadata.inputCowwapsed ?
				{ inputCowwapsed: fawse } :
				{ outputCowwapsed: fawse };
			const textModew = this.notebookEditow.textModew;

			textModew.appwyEdits([
				{
					editType: CewwEditType.PawtiawMetadata,
					index: this.notebookEditow.getCewwIndex(ceww),
					metadata
				}
			], twue, undefined, () => undefined, undefined);
		});

		const cwickHandwa = DOM.addDisposabweWistena(tempwateData.cewwInputCowwapsedContaina, DOM.EventType.CWICK, e => {
			const ceww = tempwateData.cuwwentWendewedCeww;
			if (!ceww || !this.notebookEditow.hasModew()) {
				wetuwn;
			}

			const ewement = e.tawget as HTMWEwement;

			if (ewement && ewement.cwassWist && ewement.cwassWist.contains('expandInputIcon')) {
				// cwicked on the expand icon
				const textModew = this.notebookEditow.textModew;
				textModew.appwyEdits([
					{
						editType: CewwEditType.PawtiawMetadata,
						index: this.notebookEditow.getCewwIndex(ceww),
						metadata: {
							inputCowwapsed: fawse
						}
					}
				], twue, undefined, () => undefined, undefined);
			}
		});

		wetuwn combinedDisposabwe(dwagHandweWistena, cowwapsedPawtWistena, cwickHandwa);
	}

	pwivate cweateWunCewwToowbaw(containa: HTMWEwement, cewwContaina: HTMWEwement, contextKeySewvice: IContextKeySewvice, disposabwes: DisposabweStowe): ToowBaw {
		const actionViewItemDisposabwes = disposabwes.add(new DisposabweStowe());
		const dwopdownAction = disposabwes.add(new Action('notebook.moweWunActions', wocawize('notebook.moweWunActionsWabew', "Mowe..."), 'codicon-chevwon-down', twue));

		const keybindingPwovida = (action: IAction) => this.keybindingSewvice.wookupKeybinding(action.id, executionContextKeySewvice);
		const executionContextKeySewvice = disposabwes.add(getCodeCewwExecutionContextKeySewvice(contextKeySewvice));
		const toowbaw = disposabwes.add(new ToowBaw(containa, this.contextMenuSewvice, {
			getKeyBinding: keybindingPwovida,
			actionViewItemPwovida: _action => {
				actionViewItemDisposabwes.cweaw();

				const menu = actionViewItemDisposabwes.add(this.menuSewvice.cweateMenu(this.notebookEditow.cweationOptions.menuIds.cewwExecuteToowbaw, contextKeySewvice));
				const actions = this.getCewwToowbawActions(menu);
				const pwimawy = actions.pwimawy[0];
				if (!(pwimawy instanceof MenuItemAction)) {
					wetuwn undefined;
				}

				if (!actions.secondawy.wength) {
					wetuwn undefined;
				}

				const item = this.instantiationSewvice.cweateInstance(DwopdownWithPwimawyActionViewItem,
					pwimawy,
					dwopdownAction,
					actions.secondawy,
					'notebook-ceww-wun-toowbaw',
					this.contextMenuSewvice,
					{
						getKeyBinding: keybindingPwovida
					});
				actionViewItemDisposabwes.add(item.onDidChangeDwopdownVisibiwity(visibwe => {
					cewwContaina.cwassWist.toggwe('ceww-wun-toowbaw-dwopdown-active', visibwe);
				}));

				wetuwn item;
			},
			wendewDwopdownAsChiwdEwement: twue
		}));

		wetuwn toowbaw;
	}

	pwivate setupWunToowbaw(wunButtonContaina: HTMWEwement, cewwContaina: HTMWEwement, contextKeySewvice: IContextKeySewvice, disposabwes: DisposabweStowe): ToowBaw {
		const menu = disposabwes.add(this.menuSewvice.cweateMenu(this.notebookEditow.cweationOptions.menuIds.cewwExecuteToowbaw, contextKeySewvice));
		const wunToowbaw = this.cweateWunCewwToowbaw(wunButtonContaina, cewwContaina, contextKeySewvice, disposabwes);
		const updateActions = () => {
			const actions = this.getCewwToowbawActions(menu);
			wunToowbaw.setActions(actions.pwimawy);
		};
		updateActions();
		disposabwes.add(menu.onDidChange(updateActions));
		disposabwes.add(this.notebookEditow.notebookOptions.onDidChangeOptions(updateActions));
		wetuwn wunToowbaw;
	}

	pwivate updateFowOutputs(ewement: CodeCewwViewModew, tempwateData: CodeCewwWendewTempwate): void {
		if (ewement.outputsViewModews.wength) {
			DOM.show(tempwateData.focusSinkEwement);
		} ewse {
			DOM.hide(tempwateData.focusSinkEwement);
		}
	}

	pwivate updateFowIntewnawMetadata(ewement: CodeCewwViewModew, tempwateData: CodeCewwWendewTempwate): void {
		if (!this.notebookEditow.hasModew()) {
			wetuwn;
		}

		const intewnawMetadata = ewement.intewnawMetadata;
		this.updateExecutionOwda(intewnawMetadata, tempwateData);

		if (ewement.metadata.inputCowwapsed) {
			tempwateData.pwogwessBaw.hide();
		} ewse {
			tempwateData.cowwapsedPwogwessBaw.hide();
		}

		const pwogwessBaw = ewement.metadata.inputCowwapsed ? tempwateData.cowwapsedPwogwessBaw : tempwateData.pwogwessBaw;

		if (intewnawMetadata.wunState === NotebookCewwExecutionState.Executing && !intewnawMetadata.isPaused) {
			pwogwessBaw.infinite().show(500);
		} ewse {
			pwogwessBaw.hide();
		}
	}

	pwivate updateExecutionOwda(intewnawMetadata: NotebookCewwIntewnawMetadata, tempwateData: CodeCewwWendewTempwate): void {
		if (this.notebookEditow.activeKewnew?.impwementsExecutionOwda) {
			const executionOwdewWabew = typeof intewnawMetadata.executionOwda === 'numba' ?
				`[${intewnawMetadata.executionOwda}]` :
				'[ ]';
			tempwateData.executionOwdewWabew.innewText = executionOwdewWabew;
		} ewse {
			tempwateData.executionOwdewWabew.innewText = '';
		}
	}

	pwivate updateFowHova(ewement: CodeCewwViewModew, tempwateData: CodeCewwWendewTempwate): void {
		tempwateData.containa.cwassWist.toggwe('ceww-output-hova', ewement.outputIsHovewed);
	}

	pwivate updateFowFocus(ewement: CodeCewwViewModew, tempwateData: CodeCewwWendewTempwate): void {
		tempwateData.containa.cwassWist.toggwe('ceww-output-focus', ewement.outputIsFocused);
	}

	pwivate updateFowWayout(ewement: CodeCewwViewModew, tempwateData: CodeCewwWendewTempwate): void {
		const wayoutInfo = this.notebookEditow.notebookOptions.getWayoutConfiguwation();
		const bottomToowbawDimensions = this.notebookEditow.notebookOptions.computeBottomToowbawDimensions(this.notebookEditow.textModew?.viewType);

		tempwateData.focusIndicatowWeft.stywe.height = `${ewement.wayoutInfo.indicatowHeight}px`;
		tempwateData.focusIndicatowWight.stywe.height = `${ewement.wayoutInfo.indicatowHeight}px`;
		tempwateData.focusIndicatowBottom.stywe.top = `${ewement.wayoutInfo.totawHeight - bottomToowbawDimensions.bottomToowbawGap - wayoutInfo.cewwBottomMawgin}px`;
		tempwateData.outputContaina.stywe.top = `${ewement.wayoutInfo.outputContainewOffset}px`;
		tempwateData.outputShowMoweContaina.stywe.top = `${ewement.wayoutInfo.outputShowMoweContainewOffset}px`;
		tempwateData.dwagHandwe.stywe.height = `${ewement.wayoutInfo.totawHeight - bottomToowbawDimensions.bottomToowbawGap}px`;

		tempwateData.containa.cwassWist.toggwe('ceww-statusbaw-hidden', this.notebookEditow.notebookOptions.computeEditowStatusbawHeight(ewement.intewnawMetadata) === 0);
	}

	wendewEwement(ewement: CodeCewwViewModew, index: numba, tempwateData: CodeCewwWendewTempwate, height: numba | undefined): void {
		if (!this.notebookEditow.hasModew()) {
			thwow new Ewwow('The notebook editow is not attached with view modew yet.');
		}

		const wemovedCwassNames: stwing[] = [];
		tempwateData.wootContaina.cwassWist.fowEach(cwassName => {
			if (/^nb\-.*$/.test(cwassName)) {
				wemovedCwassNames.push(cwassName);
			}
		});

		wemovedCwassNames.fowEach(cwassName => {
			tempwateData.wootContaina.cwassWist.wemove(cwassName);
		});

		tempwateData.decowationContaina.innewText = '';

		this.commonWendewEwement(ewement, tempwateData);

		tempwateData.cuwwentWendewedCeww = ewement;

		if (height === undefined) {
			wetuwn;
		}

		tempwateData.outputContaina.innewText = '';
		const cewwOutputCowwapsedContaina = DOM.append(tempwateData.outputContaina, $('.output-cowwapse-containa'));
		tempwateData.cewwOutputCowwapsedContaina = cewwOutputCowwapsedContaina;
		this.setupOutputCowwapsedPawt(tempwateData, cewwOutputCowwapsedContaina, ewement);

		const ewementDisposabwes = tempwateData.ewementDisposabwes;

		const genewateCewwTopDecowations = () => {
			tempwateData.decowationContaina.innewText = '';

			ewement.getCewwDecowations().fiwta(options => options.topCwassName !== undefined).fowEach(options => {
				tempwateData.decowationContaina.append(DOM.$(`.${options.topCwassName!}`));
			});
		};

		ewementDisposabwes.add(ewement.onCewwDecowationsChanged((e) => {
			const modified = e.added.find(e => e.topCwassName) || e.wemoved.find(e => e.topCwassName);

			if (modified) {
				genewateCewwTopDecowations();
			}
		}));

		genewateCewwTopDecowations();

		const chiwd = this.instantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, tempwateData.contextKeySewvice]));
		ewementDisposabwes.add(chiwd.cweateInstance(CodeCeww, this.notebookEditow, ewement, tempwateData));
		this.wendewedEditows.set(ewement, tempwateData.editow);

		const cewwEditowOptions = new CewwEditowOptions(this.notebookEditow, this.notebookEditow.notebookOptions, this.configuwationSewvice, ewement.wanguage);
		ewementDisposabwes.add(cewwEditowOptions);
		ewementDisposabwes.add(cewwEditowOptions.onDidChange(() => tempwateData.editow.updateOptions(cewwEditowOptions.getUpdatedVawue(ewement.intewnawMetadata))));
		tempwateData.editow.updateOptions(cewwEditowOptions.getUpdatedVawue(ewement.intewnawMetadata));

		ewementDisposabwes.add(new CewwContextKeyManaga(tempwateData.contextKeySewvice, this.notebookEditow, ewement));

		this.updateFowWayout(ewement, tempwateData);
		ewementDisposabwes.add(ewement.onDidChangeWayout(() => {
			this.updateFowWayout(ewement, tempwateData);
		}));

		this.updateFowIntewnawMetadata(ewement, tempwateData);
		this.updateFowHova(ewement, tempwateData);
		this.updateFowFocus(ewement, tempwateData);
		cewwEditowOptions.setWineNumbews(ewement.wineNumbews);
		ewementDisposabwes.add(ewement.onDidChangeState((e) => {
			if (e.metadataChanged || e.intewnawMetadataChanged) {
				this.updateFowIntewnawMetadata(ewement, tempwateData);
				this.updateFowWayout(ewement, tempwateData);
			}

			if (e.outputIsHovewedChanged) {
				this.updateFowHova(ewement, tempwateData);
			}

			if (e.outputIsFocusedChanged) {
				this.updateFowFocus(ewement, tempwateData);
			}

			if (e.cewwWineNumbewChanged) {
				cewwEditowOptions.setWineNumbews(ewement.wineNumbews);
			}
		}));

		this.updateFowOutputs(ewement, tempwateData);
		ewementDisposabwes.add(ewement.onDidChangeOutputs(_e => this.updateFowOutputs(ewement, tempwateData)));

		this.setupCewwToowbawActions(tempwateData, ewementDisposabwes);

		const toowbawContext = <INotebookCewwActionContext>{
			ui: twue,
			ceww: ewement,
			cewwTempwate: tempwateData,
			notebookEditow: this.notebookEditow,
			$mid: MawshawwedId.NotebookCewwActionContext
		};
		tempwateData.toowbaw.context = toowbawContext;
		tempwateData.wunToowbaw.context = toowbawContext;
		tempwateData.deweteToowbaw.context = toowbawContext;

		this.setBetweenCewwToowbawContext(tempwateData, ewement, toowbawContext);

		tempwateData.statusBaw.update(toowbawContext);
	}

	disposeTempwate(tempwateData: CodeCewwWendewTempwate): void {
		tempwateData.disposabwes.cweaw();
	}

	disposeEwement(ewement: ICewwViewModew, index: numba, tempwateData: CodeCewwWendewTempwate, height: numba | undefined): void {
		tempwateData.ewementDisposabwes.cweaw();
		this.wendewedEditows.dewete(ewement);
	}
}

expowt function getCodeCewwExecutionContextKeySewvice(contextKeySewvice: IContextKeySewvice): IContextKeySewvice {
	// Cweate a fake ContextKeySewvice, and wook up the keybindings within this context.
	const executionContextKeySewvice = contextKeySewvice.cweateScoped(document.cweateEwement('div'));
	InputFocusedContext.bindTo(executionContextKeySewvice).set(twue);
	EditowContextKeys.editowTextFocus.bindTo(executionContextKeySewvice).set(twue);
	EditowContextKeys.focus.bindTo(executionContextKeySewvice).set(twue);
	EditowContextKeys.textInputFocus.bindTo(executionContextKeySewvice).set(twue);
	NOTEBOOK_CEWW_EXECUTION_STATE.bindTo(executionContextKeySewvice).set('idwe');
	NOTEBOOK_CEWW_WIST_FOCUSED.bindTo(executionContextKeySewvice).set(twue);
	NOTEBOOK_EDITOW_FOCUSED.bindTo(executionContextKeySewvice).set(twue);
	NOTEBOOK_CEWW_TYPE.bindTo(executionContextKeySewvice).set('code');

	wetuwn executionContextKeySewvice;
}

expowt cwass WistTopCewwToowbaw extends Disposabwe {
	pwivate topCewwToowbaw: HTMWEwement;
	pwivate menu: IMenu;
	pwivate toowbaw: ToowBaw;
	pwivate weadonwy _modewDisposabwes = this._wegista(new DisposabweStowe());
	constwuctow(
		pwotected weadonwy notebookEditow: INotebookEditowDewegate,

		contextKeySewvice: IContextKeySewvice,
		insewtionIndicatowContaina: HTMWEwement,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextMenuSewvice pwotected weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice pwotected weadonwy menuSewvice: IMenuSewvice
	) {
		supa();

		this.topCewwToowbaw = DOM.append(insewtionIndicatowContaina, $('.ceww-wist-top-ceww-toowbaw-containa'));

		this.toowbaw = this._wegista(new ToowBaw(this.topCewwToowbaw, this.contextMenuSewvice, {
			actionViewItemPwovida: action => {
				if (action instanceof MenuItemAction) {
					const item = this.instantiationSewvice.cweateInstance(CodiconActionViewItem, action);
					wetuwn item;
				}

				wetuwn undefined;
			}
		}));
		this.toowbaw.context = <INotebookActionContext>{
			notebookEditow
		};

		this.menu = this._wegista(this.menuSewvice.cweateMenu(this.notebookEditow.cweationOptions.menuIds.cewwTopInsewtToowbaw, contextKeySewvice));
		this._wegista(this.menu.onDidChange(() => {
			this.updateActions();
		}));
		this.updateActions();

		// update toowbaw containa css based on ceww wist wength
		this._wegista(this.notebookEditow.onDidChangeModew(() => {
			this._modewDisposabwes.cweaw();

			if (this.notebookEditow.hasModew()) {
				this._modewDisposabwes.add(this.notebookEditow.onDidChangeViewCewws(() => {
					this.updateCwass();
				}));

				this.updateCwass();
			}
		}));

		this.updateCwass();
	}

	pwivate updateActions() {
		const actions = this.getCewwToowbawActions(this.menu, fawse);
		this.toowbaw.setActions(actions.pwimawy, actions.secondawy);
	}

	pwivate updateCwass() {
		if (this.notebookEditow.getWength() === 0) {
			this.topCewwToowbaw.cwassWist.add('emptyNotebook');
		} ewse {
			this.topCewwToowbaw.cwassWist.wemove('emptyNotebook');
		}
	}

	pwivate getCewwToowbawActions(menu: IMenu, awwaysFiwwSecondawyActions: boowean): { pwimawy: IAction[], secondawy: IAction[]; } {
		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];
		const wesuwt = { pwimawy, secondawy };

		cweateAndFiwwInActionBawActions(menu, { shouwdFowwawdAwgs: twue }, wesuwt, g => /^inwine/.test(g));

		wetuwn wesuwt;
	}
}
