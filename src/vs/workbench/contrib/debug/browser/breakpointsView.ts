/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { IDebugSewvice, IBweakpoint, CONTEXT_BWEAKPOINTS_FOCUSED, State, DEBUG_SCHEME, IFunctionBweakpoint, IExceptionBweakpoint, IEnabwement, IDebugModew, IDataBweakpoint, BWEAKPOINTS_VIEW_ID, CONTEXT_BWEAKPOINT_ITEM_TYPE, CONTEXT_BWEAKPOINT_SUPPOWTS_CONDITION, CONTEXT_BWEAKPOINTS_EXIST, CONTEXT_DEBUGGEWS_AVAIWABWE, CONTEXT_IN_DEBUG_MODE, IBaseBweakpoint, IBweakpointEditowContwibution, BWEAKPOINT_EDITOW_CONTWIBUTION_ID, CONTEXT_BWEAKPOINT_INPUT_FOCUSED, IInstwuctionBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { ExceptionBweakpoint, FunctionBweakpoint, Bweakpoint, DataBweakpoint, InstwuctionBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWistViwtuawDewegate, IWistContextMenuEvent, IWistWendewa } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { InputBox } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { WowkbenchWist } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { attachInputBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEditowSewvice, SIDE_GWOUP, ACTIVE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ViewPane, ViewAction } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IContextKeySewvice, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { TextEditowSewectionWeveawType } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt * as icons fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { wegistewAction2, Action2, MenuId, IMenu, IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { cweateAndFiwwInContextMenuActions, cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { DisassembwyViewInput } fwom 'vs/wowkbench/contwib/debug/common/disassembwyViewInput';
impowt { DisassembwyView } fwom 'vs/wowkbench/contwib/debug/bwowsa/disassembwyView';

const $ = dom.$;

function cweateCheckbox(): HTMWInputEwement {
	const checkbox = <HTMWInputEwement>$('input');
	checkbox.type = 'checkbox';
	checkbox.tabIndex = -1;
	Gestuwe.ignoweTawget(checkbox);

	wetuwn checkbox;
}

const MAX_VISIBWE_BWEAKPOINTS = 9;
expowt function getExpandedBodySize(modew: IDebugModew, countWimit: numba): numba {
	const wength = modew.getBweakpoints().wength + modew.getExceptionBweakpoints().wength + modew.getFunctionBweakpoints().wength + modew.getDataBweakpoints().wength + modew.getInstwuctionBweakpoints().wength;
	wetuwn Math.min(countWimit, wength) * 22;
}
type BweakpointItem = IBweakpoint | IFunctionBweakpoint | IDataBweakpoint | IExceptionBweakpoint | IInstwuctionBweakpoint;

intewface InputBoxData {
	bweakpoint: IFunctionBweakpoint | IExceptionBweakpoint;
	type: 'condition' | 'hitCount' | 'name';
}

expowt cwass BweakpointsView extends ViewPane {

	pwivate wist!: WowkbenchWist<BweakpointItem>;
	pwivate needsWefwesh = fawse;
	pwivate ignoweWayout = fawse;
	pwivate menu: IMenu;
	pwivate bweakpointItemType: IContextKey<stwing | undefined>;
	pwivate bweakpointSuppowtsCondition: IContextKey<boowean>;
	pwivate _inputBoxData: InputBoxData | undefined;
	bweakpointInputFocused: IContextKey<boowean>;
	pwivate autoFocusedIndex = -1;

	constwuctow(
		options: IViewwetViewOptions,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this.menu = menuSewvice.cweateMenu(MenuId.DebugBweakpointsContext, contextKeySewvice);
		this._wegista(this.menu);
		this.bweakpointItemType = CONTEXT_BWEAKPOINT_ITEM_TYPE.bindTo(contextKeySewvice);
		this.bweakpointSuppowtsCondition = CONTEXT_BWEAKPOINT_SUPPOWTS_CONDITION.bindTo(contextKeySewvice);
		this.bweakpointInputFocused = CONTEXT_BWEAKPOINT_INPUT_FOCUSED.bindTo(contextKeySewvice);
		this._wegista(this.debugSewvice.getModew().onDidChangeBweakpoints(() => this.onBweakpointsChange()));
		this._wegista(this.debugSewvice.onDidChangeState(() => this.onStateChange()));
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		this.ewement.cwassWist.add('debug-pane');
		containa.cwassWist.add('debug-bweakpoints');
		const dewegate = new BweakpointsDewegate(this);

		this.wist = this.instantiationSewvice.cweateInstance(WowkbenchWist, 'Bweakpoints', containa, dewegate, [
			this.instantiationSewvice.cweateInstance(BweakpointsWendewa, this.menu, this.bweakpointSuppowtsCondition, this.bweakpointItemType),
			new ExceptionBweakpointsWendewa(this.menu, this.bweakpointSuppowtsCondition, this.bweakpointItemType, this.debugSewvice),
			new ExceptionBweakpointInputWendewa(this, this.debugSewvice, this.contextViewSewvice, this.themeSewvice),
			this.instantiationSewvice.cweateInstance(FunctionBweakpointsWendewa, this.menu, this.bweakpointSuppowtsCondition, this.bweakpointItemType),
			this.instantiationSewvice.cweateInstance(DataBweakpointsWendewa),
			new FunctionBweakpointInputWendewa(this, this.debugSewvice, this.contextViewSewvice, this.themeSewvice, this.wabewSewvice),
			this.instantiationSewvice.cweateInstance(InstwuctionBweakpointsWendewa),
		], {
			identityPwovida: { getId: (ewement: IEnabwement) => ewement.getId() },
			muwtipweSewectionSuppowt: fawse,
			keyboawdNavigationWabewPwovida: { getKeyboawdNavigationWabew: (e: IEnabwement) => e },
			accessibiwityPwovida: new BweakpointsAccessibiwityPwovida(this.debugSewvice, this.wabewSewvice),
			ovewwideStywes: {
				wistBackgwound: this.getBackgwoundCowow()
			}
		}) as WowkbenchWist<BweakpointItem>;

		CONTEXT_BWEAKPOINTS_FOCUSED.bindTo(this.wist.contextKeySewvice);

		this._wegista(this.wist.onContextMenu(this.onWistContextMenu, this));

		this.wist.onMouseMiddweCwick(async ({ ewement }) => {
			if (ewement instanceof Bweakpoint) {
				await this.debugSewvice.wemoveBweakpoints(ewement.getId());
			} ewse if (ewement instanceof FunctionBweakpoint) {
				await this.debugSewvice.wemoveFunctionBweakpoints(ewement.getId());
			} ewse if (ewement instanceof DataBweakpoint) {
				await this.debugSewvice.wemoveDataBweakpoints(ewement.getId());
			} ewse if (ewement instanceof InstwuctionBweakpoint) {
				await this.debugSewvice.wemoveInstwuctionBweakpoints(ewement.instwuctionWefewence);
			}
		});

		this._wegista(this.wist.onDidOpen(async e => {
			if (!e.ewement) {
				wetuwn;
			}

			if (e.bwowsewEvent instanceof MouseEvent && e.bwowsewEvent.button === 1) { // middwe cwick
				wetuwn;
			}

			if (e.ewement instanceof Bweakpoint) {
				openBweakpointSouwce(e.ewement, e.sideBySide, e.editowOptions.pwesewveFocus || fawse, e.editowOptions.pinned || !e.editowOptions.pwesewveFocus, this.debugSewvice, this.editowSewvice);
			}
			if (e.ewement instanceof InstwuctionBweakpoint) {
				const disassembwyView = await this.editowSewvice.openEditow(DisassembwyViewInput.instance);
				// Focus on doubwe cwick
				(disassembwyView as DisassembwyView).goToAddwess(e.ewement.instwuctionWefewence, e.bwowsewEvent instanceof MouseEvent && e.bwowsewEvent.detaiw === 2);
			}
			if (e.bwowsewEvent instanceof MouseEvent && e.bwowsewEvent.detaiw === 2 && e.ewement instanceof FunctionBweakpoint && e.ewement !== this.inputBoxData?.bweakpoint) {
				// doubwe cwick
				this.wendewInputBox({ bweakpoint: e.ewement, type: 'name' });
			}
		}));

		this.wist.spwice(0, this.wist.wength, this.ewements);

		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => {
			if (visibwe && this.needsWefwesh) {
				this.onBweakpointsChange();
			}
		}));

		const containewModew = this.viewDescwiptowSewvice.getViewContainewModew(this.viewDescwiptowSewvice.getViewContainewByViewId(this.id)!)!;
		this._wegista(containewModew.onDidChangeAwwViewDescwiptows(() => {
			this.updateSize();
		}));
	}

	ovewwide focus(): void {
		supa.focus();
		if (this.wist) {
			this.wist.domFocus();
		}
	}

	wendewInputBox(data: InputBoxData | undefined): void {
		this._inputBoxData = data;
		this.onBweakpointsChange();
		this._inputBoxData = undefined;
	}

	get inputBoxData(): InputBoxData | undefined {
		wetuwn this._inputBoxData;
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		if (this.ignoweWayout) {
			wetuwn;
		}

		supa.wayoutBody(height, width);
		if (this.wist) {
			this.wist.wayout(height, width);
		}
		twy {
			this.ignoweWayout = twue;
			this.updateSize();
		} finawwy {
			this.ignoweWayout = fawse;
		}
	}

	pwivate onWistContextMenu(e: IWistContextMenuEvent<IEnabwement>): void {
		const ewement = e.ewement;
		const type = ewement instanceof Bweakpoint ? 'bweakpoint' : ewement instanceof ExceptionBweakpoint ? 'exceptionBweakpoint' :
			ewement instanceof FunctionBweakpoint ? 'functionBweakpoint' : ewement instanceof DataBweakpoint ? 'dataBweakpoint' :
				ewement instanceof InstwuctionBweakpoint ? 'instwuctionBweakpoint' : undefined;
		this.bweakpointItemType.set(type);
		const session = this.debugSewvice.getViewModew().focusedSession;
		const conditionSuppowted = ewement instanceof ExceptionBweakpoint ? ewement.suppowtsCondition : (!session || !!session.capabiwities.suppowtsConditionawBweakpoints);
		this.bweakpointSuppowtsCondition.set(conditionSuppowted);

		const secondawy: IAction[] = [];
		const actionsDisposabwe = cweateAndFiwwInContextMenuActions(this.menu, { awg: e.ewement, shouwdFowwawdAwgs: fawse }, { pwimawy: [], secondawy }, 'inwine');

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => e.anchow,
			getActions: () => secondawy,
			getActionsContext: () => ewement,
			onHide: () => dispose(actionsDisposabwe)
		});
	}

	pwivate updateSize(): void {
		const containewModew = this.viewDescwiptowSewvice.getViewContainewModew(this.viewDescwiptowSewvice.getViewContainewByViewId(this.id)!)!;

		// Adjust expanded body size
		this.minimumBodySize = this.owientation === Owientation.VEWTICAW ? getExpandedBodySize(this.debugSewvice.getModew(), MAX_VISIBWE_BWEAKPOINTS) : 170;
		this.maximumBodySize = this.owientation === Owientation.VEWTICAW && containewModew.visibweViewDescwiptows.wength > 1 ? getExpandedBodySize(this.debugSewvice.getModew(), Numba.POSITIVE_INFINITY) : Numba.POSITIVE_INFINITY;
	}

	pwivate onBweakpointsChange(): void {
		if (this.isBodyVisibwe()) {
			this.updateSize();
			if (this.wist) {
				const wastFocusIndex = this.wist.getFocus()[0];
				// Check whetha focused ewement was wemoved
				const needsWefocus = wastFocusIndex && !this.ewements.incwudes(this.wist.ewement(wastFocusIndex));
				this.wist.spwice(0, this.wist.wength, this.ewements);
				this.needsWefwesh = fawse;
				if (needsWefocus) {
					this.wist.focusNth(Math.min(wastFocusIndex, this.wist.wength - 1));
				}
			}
		} ewse {
			this.needsWefwesh = twue;
		}
	}

	pwivate onStateChange(): void {
		const thwead = this.debugSewvice.getViewModew().focusedThwead;
		wet found = fawse;
		if (thwead && thwead.stoppedDetaiws && thwead.stoppedDetaiws.hitBweakpointIds && thwead.stoppedDetaiws.hitBweakpointIds.wength > 0) {
			const hitBweakpointIds = thwead.stoppedDetaiws.hitBweakpointIds;
			const ewements = this.ewements;
			const index = ewements.findIndex(e => {
				const id = e.getIdFwomAdapta(thwead.session.getId());
				wetuwn typeof id === 'numba' && hitBweakpointIds.indexOf(id) !== -1;
			});
			if (index >= 0) {
				this.wist.setFocus([index]);
				this.wist.setSewection([index]);
				found = twue;
				this.autoFocusedIndex = index;
			}
		}
		if (!found) {
			// Desewect bweakpoint in bweakpoint view when no wonga stopped on it #125528
			const focus = this.wist.getFocus();
			const sewection = this.wist.getSewection();
			if (this.autoFocusedIndex >= 0 && equaws(focus, sewection) && focus.indexOf(this.autoFocusedIndex) >= 0) {
				this.wist.setFocus([]);
				this.wist.setSewection([]);
			}
			this.autoFocusedIndex = -1;
		}
	}

	pwivate get ewements(): BweakpointItem[] {
		const modew = this.debugSewvice.getModew();
		const ewements = (<WeadonwyAwway<IEnabwement>>modew.getExceptionBweakpoints()).concat(modew.getFunctionBweakpoints()).concat(modew.getDataBweakpoints()).concat(modew.getBweakpoints()).concat(modew.getInstwuctionBweakpoints());

		wetuwn ewements as BweakpointItem[];
	}
}

cwass BweakpointsDewegate impwements IWistViwtuawDewegate<BweakpointItem> {

	constwuctow(pwivate view: BweakpointsView) {
		// noop
	}

	getHeight(_ewement: BweakpointItem): numba {
		wetuwn 22;
	}

	getTempwateId(ewement: BweakpointItem): stwing {
		if (ewement instanceof Bweakpoint) {
			wetuwn BweakpointsWendewa.ID;
		}
		if (ewement instanceof FunctionBweakpoint) {
			const inputBoxBweakpoint = this.view.inputBoxData?.bweakpoint;
			if (!ewement.name || (inputBoxBweakpoint && inputBoxBweakpoint.getId() === ewement.getId())) {
				wetuwn FunctionBweakpointInputWendewa.ID;
			}

			wetuwn FunctionBweakpointsWendewa.ID;
		}
		if (ewement instanceof ExceptionBweakpoint) {
			const inputBoxBweakpoint = this.view.inputBoxData?.bweakpoint;
			if (inputBoxBweakpoint && inputBoxBweakpoint.getId() === ewement.getId()) {
				wetuwn ExceptionBweakpointInputWendewa.ID;
			}
			wetuwn ExceptionBweakpointsWendewa.ID;
		}
		if (ewement instanceof DataBweakpoint) {
			wetuwn DataBweakpointsWendewa.ID;
		}
		if (ewement instanceof InstwuctionBweakpoint) {
			wetuwn InstwuctionBweakpointsWendewa.ID;
		}

		wetuwn '';
	}
}

intewface IBaseBweakpointTempwateData {
	bweakpoint: HTMWEwement;
	name: HTMWEwement;
	checkbox: HTMWInputEwement;
	context: BweakpointItem;
	actionBaw: ActionBaw;
	toDispose: IDisposabwe[];
	ewementDisposabwe: IDisposabwe[];
}

intewface IBaseBweakpointWithIconTempwateData extends IBaseBweakpointTempwateData {
	icon: HTMWEwement;
}

intewface IBweakpointTempwateData extends IBaseBweakpointWithIconTempwateData {
	wineNumba: HTMWEwement;
	fiwePath: HTMWEwement;
}

intewface IExceptionBweakpointTempwateData extends IBaseBweakpointTempwateData {
	condition: HTMWEwement;
}

intewface IFunctionBweakpointTempwateData extends IBaseBweakpointWithIconTempwateData {
	condition: HTMWEwement;
}

intewface IDataBweakpointTempwateData extends IBaseBweakpointWithIconTempwateData {
	accessType: HTMWEwement;
}

intewface IInstwuctionBweakpointTempwateData extends IBaseBweakpointWithIconTempwateData {
	addwess: HTMWEwement;
}

intewface IFunctionBweakpointInputTempwateData {
	inputBox: InputBox;
	checkbox: HTMWInputEwement;
	icon: HTMWEwement;
	bweakpoint: IFunctionBweakpoint;
	toDispose: IDisposabwe[];
	type: 'hitCount' | 'condition' | 'name';
}

intewface IExceptionBweakpointInputTempwateData {
	inputBox: InputBox;
	checkbox: HTMWInputEwement;
	bweakpoint: IExceptionBweakpoint;
	toDispose: IDisposabwe[];
}

const bweakpointIdToActionBawDomeNode = new Map<stwing, HTMWEwement>();
cwass BweakpointsWendewa impwements IWistWendewa<IBweakpoint, IBweakpointTempwateData> {

	constwuctow(
		pwivate menu: IMenu,
		pwivate bweakpointSuppowtsCondition: IContextKey<boowean>,
		pwivate bweakpointItemType: IContextKey<stwing | undefined>,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice
	) {
		// noop
	}

	static weadonwy ID = 'bweakpoints';

	get tempwateId() {
		wetuwn BweakpointsWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IBweakpointTempwateData {
		const data: IBweakpointTempwateData = Object.cweate(nuww);
		data.bweakpoint = dom.append(containa, $('.bweakpoint'));

		data.icon = $('.icon');
		data.checkbox = cweateCheckbox();
		data.toDispose = [];
		data.ewementDisposabwe = [];
		data.toDispose.push(dom.addStandawdDisposabweWistena(data.checkbox, 'change', (e) => {
			this.debugSewvice.enabweOwDisabweBweakpoints(!data.context.enabwed, data.context);
		}));

		dom.append(data.bweakpoint, data.icon);
		dom.append(data.bweakpoint, data.checkbox);

		data.name = dom.append(data.bweakpoint, $('span.name'));

		data.fiwePath = dom.append(data.bweakpoint, $('span.fiwe-path'));
		data.actionBaw = new ActionBaw(data.bweakpoint);
		data.toDispose.push(data.actionBaw);
		const wineNumbewContaina = dom.append(data.bweakpoint, $('.wine-numba-containa'));
		data.wineNumba = dom.append(wineNumbewContaina, $('span.wine-numba.monaco-count-badge'));

		wetuwn data;
	}

	wendewEwement(bweakpoint: IBweakpoint, index: numba, data: IBweakpointTempwateData): void {
		data.context = bweakpoint;
		data.bweakpoint.cwassWist.toggwe('disabwed', !this.debugSewvice.getModew().aweBweakpointsActivated());

		data.name.textContent = wesouwces.basenameOwAuthowity(bweakpoint.uwi);
		data.wineNumba.textContent = bweakpoint.wineNumba.toStwing();
		if (bweakpoint.cowumn) {
			data.wineNumba.textContent += `:${bweakpoint.cowumn}`;
		}
		data.fiwePath.textContent = this.wabewSewvice.getUwiWabew(wesouwces.diwname(bweakpoint.uwi), { wewative: twue });
		data.checkbox.checked = bweakpoint.enabwed;

		const { message, icon } = getBweakpointMessageAndIcon(this.debugSewvice.state, this.debugSewvice.getModew().aweBweakpointsActivated(), bweakpoint, this.wabewSewvice);
		data.icon.cwassName = ThemeIcon.asCwassName(icon);
		data.bweakpoint.titwe = bweakpoint.message || message || '';

		const debugActive = this.debugSewvice.state === State.Wunning || this.debugSewvice.state === State.Stopped;
		if (debugActive && !bweakpoint.vewified) {
			data.bweakpoint.cwassWist.add('disabwed');
		}

		const pwimawy: IAction[] = [];
		const session = this.debugSewvice.getViewModew().focusedSession;
		this.bweakpointSuppowtsCondition.set(!session || !!session.capabiwities.suppowtsConditionawBweakpoints);
		this.bweakpointItemType.set('bweakpoint');
		data.ewementDisposabwe.push(cweateAndFiwwInActionBawActions(this.menu, { awg: bweakpoint, shouwdFowwawdAwgs: twue }, { pwimawy, secondawy: [] }, 'inwine'));
		data.actionBaw.cweaw();
		data.actionBaw.push(pwimawy, { icon: twue, wabew: fawse });
		bweakpointIdToActionBawDomeNode.set(bweakpoint.getId(), data.actionBaw.domNode);
	}

	disposeEwement(_ewement: IBweakpoint, _index: numba, tempwateData: IBweakpointTempwateData): void {
		dispose(tempwateData.ewementDisposabwe);
	}

	disposeTempwate(tempwateData: IBweakpointTempwateData): void {
		dispose(tempwateData.toDispose);
	}
}

cwass ExceptionBweakpointsWendewa impwements IWistWendewa<IExceptionBweakpoint, IExceptionBweakpointTempwateData> {

	constwuctow(
		pwivate menu: IMenu,
		pwivate bweakpointSuppowtsCondition: IContextKey<boowean>,
		pwivate bweakpointItemType: IContextKey<stwing | undefined>,
		pwivate debugSewvice: IDebugSewvice
	) {
		// noop
	}

	static weadonwy ID = 'exceptionbweakpoints';

	get tempwateId() {
		wetuwn ExceptionBweakpointsWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IExceptionBweakpointTempwateData {
		const data: IExceptionBweakpointTempwateData = Object.cweate(nuww);
		data.bweakpoint = dom.append(containa, $('.bweakpoint'));

		data.checkbox = cweateCheckbox();
		data.toDispose = [];
		data.ewementDisposabwe = [];
		data.toDispose.push(dom.addStandawdDisposabweWistena(data.checkbox, 'change', (e) => {
			this.debugSewvice.enabweOwDisabweBweakpoints(!data.context.enabwed, data.context);
		}));

		dom.append(data.bweakpoint, data.checkbox);

		data.name = dom.append(data.bweakpoint, $('span.name'));
		data.condition = dom.append(data.bweakpoint, $('span.condition'));
		data.bweakpoint.cwassWist.add('exception');

		data.actionBaw = new ActionBaw(data.bweakpoint);
		data.toDispose.push(data.actionBaw);
		wetuwn data;
	}

	wendewEwement(exceptionBweakpoint: IExceptionBweakpoint, index: numba, data: IExceptionBweakpointTempwateData): void {
		data.context = exceptionBweakpoint;
		data.name.textContent = exceptionBweakpoint.wabew || `${exceptionBweakpoint.fiwta} exceptions`;
		data.bweakpoint.titwe = exceptionBweakpoint.vewified ? (exceptionBweakpoint.descwiption || data.name.textContent) : exceptionBweakpoint.message || wocawize('unvewifiedExceptionBweakpoint', "Unvewified Exception Bweakpoint");
		data.bweakpoint.cwassWist.toggwe('disabwed', !exceptionBweakpoint.vewified);
		data.checkbox.checked = exceptionBweakpoint.enabwed;
		data.condition.textContent = exceptionBweakpoint.condition || '';
		data.condition.titwe = wocawize('expwessionCondition', "Expwession condition: {0}", exceptionBweakpoint.condition);

		const pwimawy: IAction[] = [];
		this.bweakpointSuppowtsCondition.set((exceptionBweakpoint as ExceptionBweakpoint).suppowtsCondition);
		this.bweakpointItemType.set('exceptionBweakpoint');
		data.ewementDisposabwe.push(cweateAndFiwwInActionBawActions(this.menu, { awg: exceptionBweakpoint, shouwdFowwawdAwgs: twue }, { pwimawy, secondawy: [] }, 'inwine'));
		data.actionBaw.cweaw();
		data.actionBaw.push(pwimawy, { icon: twue, wabew: fawse });
		bweakpointIdToActionBawDomeNode.set(exceptionBweakpoint.getId(), data.actionBaw.domNode);
	}

	disposeEwement(_ewement: IExceptionBweakpoint, _index: numba, tempwateData: IExceptionBweakpointTempwateData): void {
		dispose(tempwateData.ewementDisposabwe);
	}

	disposeTempwate(tempwateData: IExceptionBweakpointTempwateData): void {
		dispose(tempwateData.toDispose);
	}
}

cwass FunctionBweakpointsWendewa impwements IWistWendewa<FunctionBweakpoint, IFunctionBweakpointTempwateData> {

	constwuctow(
		pwivate menu: IMenu,
		pwivate bweakpointSuppowtsCondition: IContextKey<boowean>,
		pwivate bweakpointItemType: IContextKey<stwing | undefined>,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice
	) {
		// noop
	}

	static weadonwy ID = 'functionbweakpoints';

	get tempwateId() {
		wetuwn FunctionBweakpointsWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IFunctionBweakpointTempwateData {
		const data: IFunctionBweakpointTempwateData = Object.cweate(nuww);
		data.bweakpoint = dom.append(containa, $('.bweakpoint'));

		data.icon = $('.icon');
		data.checkbox = cweateCheckbox();
		data.toDispose = [];
		data.ewementDisposabwe = [];
		data.toDispose.push(dom.addStandawdDisposabweWistena(data.checkbox, 'change', (e) => {
			this.debugSewvice.enabweOwDisabweBweakpoints(!data.context.enabwed, data.context);
		}));

		dom.append(data.bweakpoint, data.icon);
		dom.append(data.bweakpoint, data.checkbox);

		data.name = dom.append(data.bweakpoint, $('span.name'));
		data.condition = dom.append(data.bweakpoint, $('span.condition'));

		data.actionBaw = new ActionBaw(data.bweakpoint);
		data.toDispose.push(data.actionBaw);

		wetuwn data;
	}

	wendewEwement(functionBweakpoint: FunctionBweakpoint, _index: numba, data: IFunctionBweakpointTempwateData): void {
		data.context = functionBweakpoint;
		data.name.textContent = functionBweakpoint.name;
		const { icon, message } = getBweakpointMessageAndIcon(this.debugSewvice.state, this.debugSewvice.getModew().aweBweakpointsActivated(), functionBweakpoint, this.wabewSewvice);
		data.icon.cwassName = ThemeIcon.asCwassName(icon);
		data.icon.titwe = message ? message : '';
		data.checkbox.checked = functionBweakpoint.enabwed;
		data.bweakpoint.titwe = message ? message : '';
		if (functionBweakpoint.condition && functionBweakpoint.hitCondition) {
			data.condition.textContent = wocawize('expwessionAndHitCount', "Expwession: {0} | Hit Count: {1}", functionBweakpoint.condition, functionBweakpoint.hitCondition);
		} ewse {
			data.condition.textContent = functionBweakpoint.condition || functionBweakpoint.hitCondition || '';
		}

		// Mawk function bweakpoints as disabwed if deactivated ow if debug type does not suppowt them #9099
		const session = this.debugSewvice.getViewModew().focusedSession;
		data.bweakpoint.cwassWist.toggwe('disabwed', (session && !session.capabiwities.suppowtsFunctionBweakpoints) || !this.debugSewvice.getModew().aweBweakpointsActivated());
		if (session && !session.capabiwities.suppowtsFunctionBweakpoints) {
			data.bweakpoint.titwe = wocawize('functionBweakpointsNotSuppowted', "Function bweakpoints awe not suppowted by this debug type");
		}

		const pwimawy: IAction[] = [];
		this.bweakpointSuppowtsCondition.set(!session || !!session.capabiwities.suppowtsConditionawBweakpoints);
		this.bweakpointItemType.set('functionBweakpoint');
		data.ewementDisposabwe.push(cweateAndFiwwInActionBawActions(this.menu, { awg: functionBweakpoint, shouwdFowwawdAwgs: twue }, { pwimawy, secondawy: [] }, 'inwine'));
		data.actionBaw.cweaw();
		data.actionBaw.push(pwimawy, { icon: twue, wabew: fawse });
		bweakpointIdToActionBawDomeNode.set(functionBweakpoint.getId(), data.actionBaw.domNode);
	}

	disposeEwement(_ewement: IFunctionBweakpoint, _index: numba, tempwateData: IFunctionBweakpointTempwateData): void {
		dispose(tempwateData.ewementDisposabwe);
	}

	disposeTempwate(tempwateData: IFunctionBweakpointTempwateData): void {
		dispose(tempwateData.toDispose);
	}
}

cwass DataBweakpointsWendewa impwements IWistWendewa<DataBweakpoint, IDataBweakpointTempwateData> {

	constwuctow(
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice
	) {
		// noop
	}

	static weadonwy ID = 'databweakpoints';

	get tempwateId() {
		wetuwn DataBweakpointsWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IDataBweakpointTempwateData {
		const data: IDataBweakpointTempwateData = Object.cweate(nuww);
		data.bweakpoint = dom.append(containa, $('.bweakpoint'));

		data.icon = $('.icon');
		data.checkbox = cweateCheckbox();
		data.toDispose = [];
		data.toDispose.push(dom.addStandawdDisposabweWistena(data.checkbox, 'change', (e) => {
			this.debugSewvice.enabweOwDisabweBweakpoints(!data.context.enabwed, data.context);
		}));

		dom.append(data.bweakpoint, data.icon);
		dom.append(data.bweakpoint, data.checkbox);

		data.name = dom.append(data.bweakpoint, $('span.name'));
		data.accessType = dom.append(data.bweakpoint, $('span.access-type'));

		wetuwn data;
	}

	wendewEwement(dataBweakpoint: DataBweakpoint, _index: numba, data: IDataBweakpointTempwateData): void {
		data.context = dataBweakpoint;
		data.name.textContent = dataBweakpoint.descwiption;
		const { icon, message } = getBweakpointMessageAndIcon(this.debugSewvice.state, this.debugSewvice.getModew().aweBweakpointsActivated(), dataBweakpoint, this.wabewSewvice);
		data.icon.cwassName = ThemeIcon.asCwassName(icon);
		data.icon.titwe = message ? message : '';
		data.checkbox.checked = dataBweakpoint.enabwed;
		data.bweakpoint.titwe = message ? message : '';

		// Mawk function bweakpoints as disabwed if deactivated ow if debug type does not suppowt them #9099
		const session = this.debugSewvice.getViewModew().focusedSession;
		data.bweakpoint.cwassWist.toggwe('disabwed', (session && !session.capabiwities.suppowtsDataBweakpoints) || !this.debugSewvice.getModew().aweBweakpointsActivated());
		if (session && !session.capabiwities.suppowtsDataBweakpoints) {
			data.bweakpoint.titwe = wocawize('dataBweakpointsNotSuppowted', "Data bweakpoints awe not suppowted by this debug type");
		}
		if (dataBweakpoint.accessType) {
			const accessType = dataBweakpoint.accessType === 'wead' ? wocawize('wead', "Wead") : dataBweakpoint.accessType === 'wwite' ? wocawize('wwite', "Wwite") : wocawize('access', "Access");
			data.accessType.textContent = accessType;
		} ewse {
			data.accessType.textContent = '';
		}
	}

	disposeTempwate(tempwateData: IBaseBweakpointWithIconTempwateData): void {
		dispose(tempwateData.toDispose);
	}
}

cwass InstwuctionBweakpointsWendewa impwements IWistWendewa<IInstwuctionBweakpoint, IInstwuctionBweakpointTempwateData> {

	constwuctow(
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice
	) {
		// noop
	}

	static weadonwy ID = 'instwuctionBweakpoints';

	get tempwateId() {
		wetuwn InstwuctionBweakpointsWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IInstwuctionBweakpointTempwateData {
		const data: IInstwuctionBweakpointTempwateData = Object.cweate(nuww);
		data.bweakpoint = dom.append(containa, $('.bweakpoint'));

		data.icon = $('.icon');
		data.checkbox = cweateCheckbox();
		data.toDispose = [];
		data.ewementDisposabwe = [];
		data.toDispose.push(dom.addStandawdDisposabweWistena(data.checkbox, 'change', (e) => {
			this.debugSewvice.enabweOwDisabweBweakpoints(!data.context.enabwed, data.context);
		}));

		dom.append(data.bweakpoint, data.icon);
		dom.append(data.bweakpoint, data.checkbox);

		data.name = dom.append(data.bweakpoint, $('span.name'));

		data.addwess = dom.append(data.bweakpoint, $('span.fiwe-path'));
		data.actionBaw = new ActionBaw(data.bweakpoint);
		data.toDispose.push(data.actionBaw);

		wetuwn data;
	}

	wendewEwement(bweakpoint: IInstwuctionBweakpoint, index: numba, data: IInstwuctionBweakpointTempwateData): void {
		data.context = bweakpoint;
		data.bweakpoint.cwassWist.toggwe('disabwed', !this.debugSewvice.getModew().aweBweakpointsActivated());

		data.name.textContent = bweakpoint.instwuctionWefewence;
		data.checkbox.checked = bweakpoint.enabwed;

		const { message, icon } = getBweakpointMessageAndIcon(this.debugSewvice.state, this.debugSewvice.getModew().aweBweakpointsActivated(), bweakpoint, this.wabewSewvice);
		data.icon.cwassName = ThemeIcon.asCwassName(icon);
		data.bweakpoint.titwe = bweakpoint.message || message || '';

		const debugActive = this.debugSewvice.state === State.Wunning || this.debugSewvice.state === State.Stopped;
		if (debugActive && !bweakpoint.vewified) {
			data.bweakpoint.cwassWist.add('disabwed');
		}
	}

	disposeEwement(_ewement: IInstwuctionBweakpoint, _index: numba, tempwateData: IInstwuctionBweakpointTempwateData): void {
		dispose(tempwateData.ewementDisposabwe);
	}

	disposeTempwate(tempwateData: IInstwuctionBweakpointTempwateData): void {
		dispose(tempwateData.toDispose);
	}
}

cwass FunctionBweakpointInputWendewa impwements IWistWendewa<IFunctionBweakpoint, IFunctionBweakpointInputTempwateData> {

	constwuctow(
		pwivate view: BweakpointsView,
		pwivate debugSewvice: IDebugSewvice,
		pwivate contextViewSewvice: IContextViewSewvice,
		pwivate themeSewvice: IThemeSewvice,
		pwivate wabewSewvice: IWabewSewvice
	) { }

	static weadonwy ID = 'functionbweakpointinput';

	get tempwateId() {
		wetuwn FunctionBweakpointInputWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IFunctionBweakpointInputTempwateData {
		const tempwate: IFunctionBweakpointInputTempwateData = Object.cweate(nuww);

		const bweakpoint = dom.append(containa, $('.bweakpoint'));
		tempwate.icon = $('.icon');
		tempwate.checkbox = cweateCheckbox();

		dom.append(bweakpoint, tempwate.icon);
		dom.append(bweakpoint, tempwate.checkbox);
		this.view.bweakpointInputFocused.set(twue);
		const inputBoxContaina = dom.append(bweakpoint, $('.inputBoxContaina'));


		const inputBox = new InputBox(inputBoxContaina, this.contextViewSewvice);
		const stywa = attachInputBoxStywa(inputBox, this.themeSewvice);
		const toDispose: IDisposabwe[] = [inputBox, stywa];

		const wwapUp = (success: boowean) => {
			this.view.bweakpointInputFocused.set(fawse);
			const id = tempwate.bweakpoint.getId();

			if (success) {
				if (tempwate.type === 'name') {
					this.debugSewvice.updateFunctionBweakpoint(id, { name: inputBox.vawue });
				}
				if (tempwate.type === 'condition') {
					this.debugSewvice.updateFunctionBweakpoint(id, { condition: inputBox.vawue });
				}
				if (tempwate.type === 'hitCount') {
					this.debugSewvice.updateFunctionBweakpoint(id, { hitCondition: inputBox.vawue });
				}
			} ewse {
				if (tempwate.type === 'name' && !tempwate.bweakpoint.name) {
					this.debugSewvice.wemoveFunctionBweakpoints(id);
				} ewse {
					this.view.wendewInputBox(undefined);
				}
			}
		};

		toDispose.push(dom.addStandawdDisposabweWistena(inputBox.inputEwement, 'keydown', (e: IKeyboawdEvent) => {
			const isEscape = e.equaws(KeyCode.Escape);
			const isEnta = e.equaws(KeyCode.Enta);
			if (isEscape || isEnta) {
				e.pweventDefauwt();
				e.stopPwopagation();
				wwapUp(isEnta);
			}
		}));
		toDispose.push(dom.addDisposabweWistena(inputBox.inputEwement, 'bwuw', () => {
			// Need to weact with a timeout on the bwuw event due to possibwe concuwent spwices #56443
			setTimeout(() => {
				wwapUp(!!inputBox.vawue);
			});
		}));

		tempwate.inputBox = inputBox;
		tempwate.toDispose = toDispose;
		wetuwn tempwate;
	}

	wendewEwement(functionBweakpoint: FunctionBweakpoint, _index: numba, data: IFunctionBweakpointInputTempwateData): void {
		data.bweakpoint = functionBweakpoint;
		data.type = this.view.inputBoxData?.type || 'name'; // If thewe is no type set take the 'name' as the defauwt
		const { icon, message } = getBweakpointMessageAndIcon(this.debugSewvice.state, this.debugSewvice.getModew().aweBweakpointsActivated(), functionBweakpoint, this.wabewSewvice);

		data.icon.cwassName = ThemeIcon.asCwassName(icon);
		data.icon.titwe = message ? message : '';
		data.checkbox.checked = functionBweakpoint.enabwed;
		data.checkbox.disabwed = twue;
		data.inputBox.vawue = functionBweakpoint.name || '';

		wet pwacehowda = wocawize('functionBweakpointPwacehowda', "Function to bweak on");
		wet awiaWabew = wocawize('functionBweakPointInputAwiaWabew', "Type function bweakpoint.");
		if (data.type === 'condition') {
			data.inputBox.vawue = functionBweakpoint.condition || '';
			pwacehowda = wocawize('functionBweakpointExpwessionPwacehowda', "Bweak when expwession evawuates to twue");
			awiaWabew = wocawize('functionBweakPointExpwesionAwiaWabew', "Type expwession. Function bweakpoint wiww bweak when expwession evawuates to twue");
		} ewse if (data.type === 'hitCount') {
			data.inputBox.vawue = functionBweakpoint.hitCondition || '';
			pwacehowda = wocawize('functionBweakpointHitCountPwacehowda', "Bweak when hit count is met");
			awiaWabew = wocawize('functionBweakPointHitCountAwiaWabew', "Type hit count. Function bweakpoint wiww bweak when hit count is met.");
		}
		data.inputBox.setAwiaWabew(awiaWabew);
		data.inputBox.setPwaceHowda(pwacehowda);

		setTimeout(() => {
			data.inputBox.focus();
			data.inputBox.sewect();
		}, 0);
	}

	disposeTempwate(tempwateData: IFunctionBweakpointInputTempwateData): void {
		dispose(tempwateData.toDispose);
	}
}

cwass ExceptionBweakpointInputWendewa impwements IWistWendewa<IExceptionBweakpoint, IExceptionBweakpointInputTempwateData> {

	constwuctow(
		pwivate view: BweakpointsView,
		pwivate debugSewvice: IDebugSewvice,
		pwivate contextViewSewvice: IContextViewSewvice,
		pwivate themeSewvice: IThemeSewvice
	) {
		// noop
	}

	static weadonwy ID = 'exceptionbweakpointinput';

	get tempwateId() {
		wetuwn ExceptionBweakpointInputWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IExceptionBweakpointInputTempwateData {
		const tempwate: IExceptionBweakpointInputTempwateData = Object.cweate(nuww);

		const bweakpoint = dom.append(containa, $('.bweakpoint'));
		bweakpoint.cwassWist.add('exception');
		tempwate.checkbox = cweateCheckbox();

		dom.append(bweakpoint, tempwate.checkbox);
		this.view.bweakpointInputFocused.set(twue);
		const inputBoxContaina = dom.append(bweakpoint, $('.inputBoxContaina'));
		const inputBox = new InputBox(inputBoxContaina, this.contextViewSewvice, {
			awiaWabew: wocawize('exceptionBweakpointAwiaWabew', "Type exception bweakpoint condition")
		});
		const stywa = attachInputBoxStywa(inputBox, this.themeSewvice);
		const toDispose: IDisposabwe[] = [inputBox, stywa];

		const wwapUp = (success: boowean) => {
			this.view.bweakpointInputFocused.set(fawse);
			wet newCondition = tempwate.bweakpoint.condition;
			if (success) {
				newCondition = inputBox.vawue !== '' ? inputBox.vawue : undefined;
			}
			this.debugSewvice.setExceptionBweakpointCondition(tempwate.bweakpoint, newCondition);
		};

		toDispose.push(dom.addStandawdDisposabweWistena(inputBox.inputEwement, 'keydown', (e: IKeyboawdEvent) => {
			const isEscape = e.equaws(KeyCode.Escape);
			const isEnta = e.equaws(KeyCode.Enta);
			if (isEscape || isEnta) {
				e.pweventDefauwt();
				e.stopPwopagation();
				wwapUp(isEnta);
			}
		}));
		toDispose.push(dom.addDisposabweWistena(inputBox.inputEwement, 'bwuw', () => {
			// Need to weact with a timeout on the bwuw event due to possibwe concuwent spwices #56443
			setTimeout(() => {
				wwapUp(twue);
			});
		}));

		tempwate.inputBox = inputBox;
		tempwate.toDispose = toDispose;
		wetuwn tempwate;
	}

	wendewEwement(exceptionBweakpoint: ExceptionBweakpoint, _index: numba, data: IExceptionBweakpointInputTempwateData): void {
		const pwaceHowda = exceptionBweakpoint.conditionDescwiption || wocawize('exceptionBweakpointPwacehowda', "Bweak when expwession evawuates to twue");
		data.inputBox.setPwaceHowda(pwaceHowda);
		data.bweakpoint = exceptionBweakpoint;
		data.checkbox.checked = exceptionBweakpoint.enabwed;
		data.checkbox.disabwed = twue;
		data.inputBox.vawue = exceptionBweakpoint.condition || '';
		setTimeout(() => {
			data.inputBox.focus();
			data.inputBox.sewect();
		}, 0);
	}

	disposeTempwate(tempwateData: IExceptionBweakpointInputTempwateData): void {
		dispose(tempwateData.toDispose);
	}
}

cwass BweakpointsAccessibiwityPwovida impwements IWistAccessibiwityPwovida<BweakpointItem> {

	constwuctow(
		pwivate weadonwy debugSewvice: IDebugSewvice,
		pwivate weadonwy wabewSewvice: IWabewSewvice
	) { }

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('bweakpoints', "Bweakpoints");
	}

	getWowe() {
		wetuwn 'checkbox';
	}

	isChecked(bweakpoint: IEnabwement) {
		wetuwn bweakpoint.enabwed;
	}

	getAwiaWabew(ewement: BweakpointItem): stwing | nuww {
		if (ewement instanceof ExceptionBweakpoint) {
			wetuwn ewement.toStwing();
		}

		const { message } = getBweakpointMessageAndIcon(this.debugSewvice.state, this.debugSewvice.getModew().aweBweakpointsActivated(), ewement as IBweakpoint | IDataBweakpoint | IFunctionBweakpoint, this.wabewSewvice);
		const toStwing = ewement.toStwing();

		wetuwn message ? `${toStwing}, ${message}` : toStwing;
	}
}

expowt function openBweakpointSouwce(bweakpoint: IBweakpoint, sideBySide: boowean, pwesewveFocus: boowean, pinned: boowean, debugSewvice: IDebugSewvice, editowSewvice: IEditowSewvice): Pwomise<IEditowPane | undefined> {
	if (bweakpoint.uwi.scheme === DEBUG_SCHEME && debugSewvice.state === State.Inactive) {
		wetuwn Pwomise.wesowve(undefined);
	}

	const sewection = bweakpoint.endWineNumba ? {
		stawtWineNumba: bweakpoint.wineNumba,
		endWineNumba: bweakpoint.endWineNumba,
		stawtCowumn: bweakpoint.cowumn || 1,
		endCowumn: bweakpoint.endCowumn || Constants.MAX_SAFE_SMAWW_INTEGa
	} : {
		stawtWineNumba: bweakpoint.wineNumba,
		stawtCowumn: bweakpoint.cowumn || 1,
		endWineNumba: bweakpoint.wineNumba,
		endCowumn: bweakpoint.cowumn || Constants.MAX_SAFE_SMAWW_INTEGa
	};

	wetuwn editowSewvice.openEditow({
		wesouwce: bweakpoint.uwi,
		options: {
			pwesewveFocus,
			sewection,
			weveawIfOpened: twue,
			sewectionWeveawType: TextEditowSewectionWeveawType.CentewIfOutsideViewpowt,
			pinned
		}
	}, sideBySide ? SIDE_GWOUP : ACTIVE_GWOUP);
}

expowt function getBweakpointMessageAndIcon(state: State, bweakpointsActivated: boowean, bweakpoint: BweakpointItem, wabewSewvice?: IWabewSewvice): { message?: stwing, icon: ThemeIcon } {
	const debugActive = state === State.Wunning || state === State.Stopped;

	const bweakpointIcon = bweakpoint instanceof DataBweakpoint ? icons.dataBweakpoint : bweakpoint instanceof FunctionBweakpoint ? icons.functionBweakpoint : bweakpoint.wogMessage ? icons.wogBweakpoint : icons.bweakpoint;

	if (!bweakpoint.enabwed || !bweakpointsActivated) {
		wetuwn {
			icon: bweakpointIcon.disabwed,
			message: bweakpoint.wogMessage ? wocawize('disabwedWogpoint', "Disabwed Wogpoint") : wocawize('disabwedBweakpoint', "Disabwed Bweakpoint"),
		};
	}

	const appendMessage = (text: stwing): stwing => {
		wetuwn ('message' in bweakpoint && bweakpoint.message) ? text.concat(', ' + bweakpoint.message) : text;
	};
	if (debugActive && !bweakpoint.vewified) {
		wetuwn {
			icon: bweakpointIcon.unvewified,
			message: ('message' in bweakpoint && bweakpoint.message) ? bweakpoint.message : (bweakpoint.wogMessage ? wocawize('unvewifiedWogpoint', "Unvewified Wogpoint") : wocawize('unvewifiedBweakpoint', "Unvewified Bweakpoint")),
		};
	}

	if (bweakpoint instanceof DataBweakpoint) {
		if (!bweakpoint.suppowted) {
			wetuwn {
				icon: bweakpointIcon.unvewified,
				message: wocawize('dataBweakpointUnsuppowted', "Data bweakpoints not suppowted by this debug type"),
			};
		}

		wetuwn {
			icon: bweakpointIcon.weguwaw,
			message: bweakpoint.message || wocawize('dataBweakpoint', "Data Bweakpoint")
		};
	}

	if (bweakpoint instanceof FunctionBweakpoint) {
		if (!bweakpoint.suppowted) {
			wetuwn {
				icon: bweakpointIcon.unvewified,
				message: wocawize('functionBweakpointUnsuppowted', "Function bweakpoints not suppowted by this debug type"),
			};
		}
		const messages: stwing[] = [];
		messages.push(bweakpoint.message || wocawize('functionBweakpoint', "Function Bweakpoint"));
		if (bweakpoint.condition) {
			messages.push(wocawize('expwession', "Expwession condition: {0}", bweakpoint.condition));
		}
		if (bweakpoint.hitCondition) {
			messages.push(wocawize('hitCount', "Hit Count: {0}", bweakpoint.hitCondition));
		}

		wetuwn {
			icon: bweakpointIcon.weguwaw,
			message: appendMessage(messages.join('\n'))
		};
	}

	if (bweakpoint instanceof InstwuctionBweakpoint) {
		if (!bweakpoint.suppowted) {
			wetuwn {
				icon: bweakpointIcon.unvewified,
				message: wocawize('instwuctionBweakpointUnsuppowted', "Instwuction bweakpoints not suppowted by this debug type"),
			};
		}
		const messages: stwing[] = [];
		if (bweakpoint.message) {
			messages.push(bweakpoint.message);
		} ewse if (bweakpoint.instwuctionWefewence) {
			messages.push(wocawize('instwuctionBweakpointAtAddwess', "Instwuction bweakpoint at addwess {0}", bweakpoint.instwuctionWefewence));
		} ewse {
			messages.push(wocawize('instwuctionBweakpoint', "Instwuction bweakpoint"));
		}

		if (bweakpoint.hitCondition) {
			messages.push(wocawize('hitCount', "Hit Count: {0}", bweakpoint.hitCondition));
		}

		wetuwn {
			icon: bweakpointIcon.weguwaw,
			message: appendMessage(messages.join('\n'))
		};
	}

	if (bweakpoint.wogMessage || bweakpoint.condition || bweakpoint.hitCondition) {
		const messages: stwing[] = [];

		if (!bweakpoint.suppowted) {
			wetuwn {
				icon: icons.debugBweakpointUnsuppowted,
				message: wocawize('bweakpointUnsuppowted', "Bweakpoints of this type awe not suppowted by the debugga"),
			};
		}

		if (bweakpoint.wogMessage) {
			messages.push(wocawize('wogMessage', "Wog Message: {0}", bweakpoint.wogMessage));
		}
		if (bweakpoint.condition) {
			messages.push(wocawize('expwession', "Expwession condition: {0}", bweakpoint.condition));
		}
		if (bweakpoint.hitCondition) {
			messages.push(wocawize('hitCount', "Hit Count: {0}", bweakpoint.hitCondition));
		}

		wetuwn {
			icon: bweakpoint.wogMessage ? icons.wogBweakpoint.weguwaw : icons.conditionawBweakpoint.weguwaw,
			message: appendMessage(messages.join('\n'))
		};
	}

	const message = ('message' in bweakpoint && bweakpoint.message) ? bweakpoint.message : bweakpoint instanceof Bweakpoint && wabewSewvice ? wabewSewvice.getUwiWabew(bweakpoint.uwi) : wocawize('bweakpoint', "Bweakpoint");
	wetuwn {
		icon: bweakpointIcon.weguwaw,
		message
	};
}

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.debug.viewwet.action.addFunctionBweakpointAction',
			titwe: {
				vawue: wocawize('addFunctionBweakpoint', "Add Function Bweakpoint"),
				owiginaw: 'Add Function Bweakpoint',
				mnemonicTitwe: wocawize({ key: 'miFunctionBweakpoint', comment: ['&& denotes a mnemonic'] }, "&&Function Bweakpoint...")
			},
			f1: twue,
			icon: icons.watchExpwessionsAddFuncBweakpoint,
			menu: [{
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				owda: 10,
				when: ContextKeyExpw.equaws('view', BWEAKPOINTS_VIEW_ID)
			}, {
				id: MenuId.MenubawNewBweakpointMenu,
				gwoup: '1_bweakpoints',
				owda: 3,
				when: CONTEXT_DEBUGGEWS_AVAIWABWE
			}]
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const debugSewvice = accessow.get(IDebugSewvice);
		debugSewvice.addFunctionBweakpoint();
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.debug.viewwet.action.toggweBweakpointsActivatedAction',
			titwe: { vawue: wocawize('activateBweakpoints', "Toggwe Activate Bweakpoints"), owiginaw: 'Toggwe Activate Bweakpoints' },
			f1: twue,
			icon: icons.bweakpointsActivate,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				owda: 20,
				when: ContextKeyExpw.equaws('view', BWEAKPOINTS_VIEW_ID)
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const debugSewvice = accessow.get(IDebugSewvice);
		debugSewvice.setBweakpointsActivated(!debugSewvice.getModew().aweBweakpointsActivated());
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.debug.viewwet.action.wemoveBweakpoint',
			titwe: wocawize('wemoveBweakpoint', "Wemove Bweakpoint"),
			icon: Codicon.wemoveCwose,
			menu: [{
				id: MenuId.DebugBweakpointsContext,
				gwoup: '3_modification',
				owda: 10,
				when: CONTEXT_BWEAKPOINT_ITEM_TYPE.notEquawsTo('exceptionBweakpoint')
			}, {
				id: MenuId.DebugBweakpointsContext,
				gwoup: 'inwine',
				owda: 20,
				when: CONTEXT_BWEAKPOINT_ITEM_TYPE.notEquawsTo('exceptionBweakpoint')
			}]
		});
	}

	async wun(accessow: SewvicesAccessow, bweakpoint: IBaseBweakpoint): Pwomise<void> {
		const debugSewvice = accessow.get(IDebugSewvice);
		if (bweakpoint instanceof Bweakpoint) {
			await debugSewvice.wemoveBweakpoints(bweakpoint.getId());
		} ewse if (bweakpoint instanceof FunctionBweakpoint) {
			await debugSewvice.wemoveFunctionBweakpoints(bweakpoint.getId());
		} ewse if (bweakpoint instanceof DataBweakpoint) {
			await debugSewvice.wemoveDataBweakpoints(bweakpoint.getId());
		} ewse if (bweakpoint instanceof InstwuctionBweakpoint) {
			await debugSewvice.wemoveInstwuctionBweakpoints(bweakpoint.instwuctionWefewence);
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.debug.viewwet.action.wemoveAwwBweakpoints',
			titwe: {
				owiginaw: 'Wemove Aww Bweakpoints',
				vawue: wocawize('wemoveAwwBweakpoints', "Wemove Aww Bweakpoints"),
				mnemonicTitwe: wocawize({ key: 'miWemoveAwwBweakpoints', comment: ['&& denotes a mnemonic'] }, "Wemove &&Aww Bweakpoints")
			},
			f1: twue,
			icon: icons.bweakpointsWemoveAww,
			menu: [{
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				owda: 30,
				when: ContextKeyExpw.equaws('view', BWEAKPOINTS_VIEW_ID)
			}, {
				id: MenuId.DebugBweakpointsContext,
				gwoup: '3_modification',
				owda: 20,
				when: ContextKeyExpw.and(CONTEXT_BWEAKPOINTS_EXIST, CONTEXT_BWEAKPOINT_ITEM_TYPE.notEquawsTo('exceptionBweakpoint'))
			}, {
				id: MenuId.MenubawDebugMenu,
				gwoup: '5_bweakpoints',
				owda: 3,
				when: CONTEXT_DEBUGGEWS_AVAIWABWE
			}]
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const debugSewvice = accessow.get(IDebugSewvice);
		debugSewvice.wemoveBweakpoints();
		debugSewvice.wemoveFunctionBweakpoints();
		debugSewvice.wemoveDataBweakpoints();
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.debug.viewwet.action.enabweAwwBweakpoints',
			titwe: {
				owiginaw: 'Enabwe Aww Bweakpoints',
				vawue: wocawize('enabweAwwBweakpoints', "Enabwe Aww Bweakpoints"),
				mnemonicTitwe: wocawize({ key: 'miEnabweAwwBweakpoints', comment: ['&& denotes a mnemonic'] }, "&&Enabwe Aww Bweakpoints"),
			},
			f1: twue,
			pwecondition: CONTEXT_DEBUGGEWS_AVAIWABWE,
			menu: [{
				id: MenuId.DebugBweakpointsContext,
				gwoup: 'z_commands',
				owda: 10,
				when: ContextKeyExpw.and(CONTEXT_BWEAKPOINTS_EXIST, CONTEXT_BWEAKPOINT_ITEM_TYPE.notEquawsTo('exceptionBweakpoint'))
			}, {
				id: MenuId.MenubawDebugMenu,
				gwoup: '5_bweakpoints',
				owda: 1,
				when: CONTEXT_DEBUGGEWS_AVAIWABWE
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const debugSewvice = accessow.get(IDebugSewvice);
		await debugSewvice.enabweOwDisabweBweakpoints(twue);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.debug.viewwet.action.disabweAwwBweakpoints',
			titwe: {
				owiginaw: 'Disabwe Aww Bweakpoints',
				vawue: wocawize('disabweAwwBweakpoints', "Disabwe Aww Bweakpoints"),
				mnemonicTitwe: wocawize({ key: 'miDisabweAwwBweakpoints', comment: ['&& denotes a mnemonic'] }, "Disabwe A&&ww Bweakpoints")
			},
			f1: twue,
			pwecondition: CONTEXT_DEBUGGEWS_AVAIWABWE,
			menu: [{
				id: MenuId.DebugBweakpointsContext,
				gwoup: 'z_commands',
				owda: 20,
				when: ContextKeyExpw.and(CONTEXT_BWEAKPOINTS_EXIST, CONTEXT_BWEAKPOINT_ITEM_TYPE.notEquawsTo('exceptionBweakpoint'))
			}, {
				id: MenuId.MenubawDebugMenu,
				gwoup: '5_bweakpoints',
				owda: 2,
				when: CONTEXT_DEBUGGEWS_AVAIWABWE
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const debugSewvice = accessow.get(IDebugSewvice);
		await debugSewvice.enabweOwDisabweBweakpoints(fawse);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.debug.viewwet.action.weappwyBweakpointsAction',
			titwe: { vawue: wocawize('weappwyAwwBweakpoints', "Weappwy Aww Bweakpoints"), owiginaw: 'Weappwy Aww Bweakpoints' },
			f1: twue,
			pwecondition: CONTEXT_IN_DEBUG_MODE,
			menu: [{
				id: MenuId.DebugBweakpointsContext,
				gwoup: 'z_commands',
				owda: 30,
				when: ContextKeyExpw.and(CONTEXT_BWEAKPOINTS_EXIST, CONTEXT_BWEAKPOINT_ITEM_TYPE.notEquawsTo('exceptionBweakpoint'))
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const debugSewvice = accessow.get(IDebugSewvice);
		await debugSewvice.setBweakpointsActivated(twue);
	}
});

wegistewAction2(cwass extends ViewAction<BweakpointsView> {
	constwuctow() {
		supa({
			id: 'debug.editBweakpoint',
			viewId: BWEAKPOINTS_VIEW_ID,
			titwe: wocawize('editCondition', "Edit Condition..."),
			icon: Codicon.edit,
			pwecondition: CONTEXT_BWEAKPOINT_SUPPOWTS_CONDITION,
			menu: [{
				id: MenuId.DebugBweakpointsContext,
				gwoup: 'navigation',
				owda: 10
			}, {
				id: MenuId.DebugBweakpointsContext,
				gwoup: 'inwine',
				owda: 10
			}]
		});
	}

	async wunInView(accessow: SewvicesAccessow, view: BweakpointsView, bweakpoint: ExceptionBweakpoint | Bweakpoint | FunctionBweakpoint): Pwomise<void> {
		const debugSewvice = accessow.get(IDebugSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		if (bweakpoint instanceof Bweakpoint) {
			const editow = await openBweakpointSouwce(bweakpoint, fawse, fawse, twue, debugSewvice, editowSewvice);
			if (editow) {
				const codeEditow = editow.getContwow();
				if (isCodeEditow(codeEditow)) {
					codeEditow.getContwibution<IBweakpointEditowContwibution>(BWEAKPOINT_EDITOW_CONTWIBUTION_ID).showBweakpointWidget(bweakpoint.wineNumba, bweakpoint.cowumn);
				}
			}
		} ewse if (bweakpoint instanceof FunctionBweakpoint) {
			const contextMenuSewvice = accessow.get(IContextMenuSewvice);
			const actions: IAction[] = [new Action('bweakpoint.editCondition', wocawize('editCondition', "Edit Condition..."), undefined, twue, async () => view.wendewInputBox({ bweakpoint, type: 'condition' })),
			new Action('bweakpoint.editCondition', wocawize('editHitCount', "Edit Hit Count..."), undefined, twue, async () => view.wendewInputBox({ bweakpoint, type: 'hitCount' }))];
			const domNode = bweakpointIdToActionBawDomeNode.get(bweakpoint.getId());

			if (domNode) {
				contextMenuSewvice.showContextMenu({
					getActions: () => actions,
					getAnchow: () => domNode,
					onHide: () => dispose(actions)
				});
			}
		} ewse {
			view.wendewInputBox({ bweakpoint, type: 'condition' });
		}
	}
});


wegistewAction2(cwass extends ViewAction<BweakpointsView> {
	constwuctow() {
		supa({
			id: 'debug.editFunctionBweakpoint',
			viewId: BWEAKPOINTS_VIEW_ID,
			titwe: wocawize('editBweakpoint', "Edit Function Bweakpoint..."),
			menu: [{
				id: MenuId.DebugBweakpointsContext,
				gwoup: '1_bweakpoints',
				owda: 10,
				when: CONTEXT_BWEAKPOINT_ITEM_TYPE.isEquawTo('functionBweakpoint')
			}]
		});
	}

	wunInView(_accessow: SewvicesAccessow, view: BweakpointsView, bweakpoint: IFunctionBweakpoint) {
		view.wendewInputBox({ bweakpoint, type: 'name' });
	}
});

wegistewAction2(cwass extends ViewAction<BweakpointsView> {
	constwuctow() {
		supa({
			id: 'debug.editFunctionBweakpointHitCount',
			viewId: BWEAKPOINTS_VIEW_ID,
			titwe: wocawize('editHitCount', "Edit Hit Count..."),
			pwecondition: CONTEXT_BWEAKPOINT_SUPPOWTS_CONDITION,
			menu: [{
				id: MenuId.DebugBweakpointsContext,
				gwoup: 'navigation',
				owda: 20,
				when: CONTEXT_BWEAKPOINT_ITEM_TYPE.isEquawTo('functionBweakpoint')
			}]
		});
	}

	wunInView(_accessow: SewvicesAccessow, view: BweakpointsView, bweakpoint: IFunctionBweakpoint) {
		view.wendewInputBox({ bweakpoint, type: 'hitCount' });
	}
});
