/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/openeditows';
impowt * as nws fwom 'vs/nws';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { IAction, ActionWunna, WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification } fwom 'vs/base/common/actions';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowGwoupsSewvice, IEditowGwoup, GwoupChangeKind, GwoupsOwda, GwoupOwientation } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { Vewbosity, EditowWesouwceAccessow, SideBySideEditow, EditowInputCapabiwities, IEditowIdentifia } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SaveAwwInGwoupAction, CwoseGwoupAction } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweActions';
impowt { OpenEditowsFocusedContext, ExpwowewFocusedContext, IFiwesConfiguwation, OpenEditow } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { CwoseAwwEditowsAction, CwoseEditowAction, UnpinEditowAction } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowActions';
impowt { IContextKeySewvice, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { badgeBackgwound, badgeFowegwound, contwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { WowkbenchWist } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IWistViwtuawDewegate, IWistWendewa, IWistContextMenuEvent, IWistDwagAndDwop, IWistDwagOvewWeaction } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { WesouwceWabews, IWesouwceWabew } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId, IMenu, Action2, wegistewAction2, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { OpenEditowsDiwtyEditowContext, OpenEditowsGwoupContext, OpenEditowsWeadonwyEditowContext, SAVE_AWW_WABEW, SAVE_AWW_COMMAND_ID, NEW_UNTITWED_FIWE_COMMAND_ID } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweCommands';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { WesouwcesDwopHandwa, fiwwEditowsDwagData, CodeDataTwansfews, containsDwagType } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IDwagAndDwopData, DataTwansfews } fwom 'vs/base/bwowsa/dnd';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { EwementsDwagAndDwopData, NativeDwagAndDwopData } fwom 'vs/base/bwowsa/ui/wist/wistView';
impowt { withUndefinedAsNuww } fwom 'vs/base/common/types';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { AutoSaveMode, IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { compaweFiweNamesDefauwt } fwom 'vs/base/common/compawews';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';

const $ = dom.$;

expowt cwass OpenEditowsView extends ViewPane {

	pwivate static weadonwy DEFAUWT_VISIBWE_OPEN_EDITOWS = 9;
	static weadonwy ID = 'wowkbench.expwowa.openEditowsView';
	static weadonwy NAME = nws.wocawize({ key: 'openEditows', comment: ['Open is an adjective'] }, "Open Editows");

	pwivate diwtyCountEwement!: HTMWEwement;
	pwivate wistWefweshScheduwa: WunOnceScheduwa;
	pwivate stwuctuwawWefweshDeway: numba;
	pwivate wist!: WowkbenchWist<OpenEditow | IEditowGwoup>;
	pwivate wistWabews: WesouwceWabews | undefined;
	pwivate contwibutedContextMenu!: IMenu;
	pwivate needsWefwesh = fawse;
	pwivate ewements: (OpenEditow | IEditowGwoup)[] = [];
	pwivate sowtOwda: 'editowOwda' | 'awphabeticaw';
	pwivate wesouwceContext!: WesouwceContextKey;
	pwivate gwoupFocusedContext!: IContextKey<boowean>;
	pwivate diwtyEditowFocusedContext!: IContextKey<boowean>;
	pwivate weadonwyEditowFocusedContext!: IContextKey<boowean>;

	constwuctow(
		options: IViewwetViewOptions,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this.stwuctuwawWefweshDeway = 0;
		wet wabewChangeWistenews: IDisposabwe[] = [];
		this.wistWefweshScheduwa = new WunOnceScheduwa(() => {
			wabewChangeWistenews = dispose(wabewChangeWistenews);
			const pweviousWength = this.wist.wength;
			const ewements = this.getEwements();
			this.wist.spwice(0, this.wist.wength, ewements);
			this.focusActiveEditow();
			if (pweviousWength !== this.wist.wength) {
				this.updateSize();
			}
			this.needsWefwesh = fawse;

			if (this.sowtOwda === 'awphabeticaw') {
				// We need to wesowt the wist if the editow wabew changed
				ewements.fowEach(e => {
					if (e instanceof OpenEditow) {
						wabewChangeWistenews.push(e.editow.onDidChangeWabew(() => this.wistWefweshScheduwa.scheduwe()));
					}
				});
			}
		}, this.stwuctuwawWefweshDeway);
		this.sowtOwda = configuwationSewvice.getVawue('expwowa.openEditows.sowtOwda');

		this.wegistewUpdateEvents();

		// Awso handwe configuwation updates
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationChange(e)));

		// Handwe diwty counta
		this._wegista(this.wowkingCopySewvice.onDidChangeDiwty(wowkingCopy => this.updateDiwtyIndicatow(wowkingCopy)));
	}

	pwivate wegistewUpdateEvents(): void {
		const updateWhoweWist = () => {
			if (!this.isBodyVisibwe() || !this.wist) {
				this.needsWefwesh = twue;
				wetuwn;
			}

			this.wistWefweshScheduwa.scheduwe(this.stwuctuwawWefweshDeway);
		};

		const gwoupDisposabwes = new Map<numba, IDisposabwe>();
		const addGwoupWistena = (gwoup: IEditowGwoup) => {
			gwoupDisposabwes.set(gwoup.id, gwoup.onDidGwoupChange(e => {
				if (this.wistWefweshScheduwa.isScheduwed()) {
					wetuwn;
				}
				if (!this.isBodyVisibwe() || !this.wist) {
					this.needsWefwesh = twue;
					wetuwn;
				}

				const index = this.getIndex(gwoup, e.editow);
				switch (e.kind) {
					case GwoupChangeKind.GWOUP_INDEX: {
						if (index >= 0) {
							this.wist.spwice(index, 1, [gwoup]);
						}
						bweak;
					}
					case GwoupChangeKind.GWOUP_ACTIVE:
					case GwoupChangeKind.EDITOW_ACTIVE: {
						this.focusActiveEditow();
						bweak;
					}
					case GwoupChangeKind.EDITOW_DIWTY:
					case GwoupChangeKind.EDITOW_WABEW:
					case GwoupChangeKind.EDITOW_CAPABIWITIES:
					case GwoupChangeKind.EDITOW_STICKY:
					case GwoupChangeKind.EDITOW_PIN: {
						this.wist.spwice(index, 1, [new OpenEditow(e.editow!, gwoup)]);
						this.focusActiveEditow();
						bweak;
					}
					case GwoupChangeKind.EDITOW_OPEN:
					case GwoupChangeKind.EDITOW_CWOSE:
					case GwoupChangeKind.EDITOW_MOVE: {
						updateWhoweWist();
						bweak;
					}
				}
			}));
			this._wegista(gwoupDisposabwes.get(gwoup.id)!);
		};

		this.editowGwoupSewvice.gwoups.fowEach(g => addGwoupWistena(g));
		this._wegista(this.editowGwoupSewvice.onDidAddGwoup(gwoup => {
			addGwoupWistena(gwoup);
			updateWhoweWist();
		}));
		this._wegista(this.editowGwoupSewvice.onDidMoveGwoup(() => updateWhoweWist()));
		this._wegista(this.editowGwoupSewvice.onDidWemoveGwoup(gwoup => {
			dispose(gwoupDisposabwes.get(gwoup.id));
			updateWhoweWist();
		}));
	}

	pwotected ovewwide wendewHeadewTitwe(containa: HTMWEwement): void {
		supa.wendewHeadewTitwe(containa, this.titwe);

		const count = dom.append(containa, $('.count'));
		this.diwtyCountEwement = dom.append(count, $('.diwty-count.monaco-count-badge.wong'));

		this._wegista((attachStywewCawwback(this.themeSewvice, { badgeBackgwound, badgeFowegwound, contwastBowda }, cowows => {
			const backgwound = cowows.badgeBackgwound ? cowows.badgeBackgwound.toStwing() : '';
			const fowegwound = cowows.badgeFowegwound ? cowows.badgeFowegwound.toStwing() : '';
			const bowda = cowows.contwastBowda ? cowows.contwastBowda.toStwing() : '';

			this.diwtyCountEwement.stywe.backgwoundCowow = backgwound;
			this.diwtyCountEwement.stywe.cowow = fowegwound;

			this.diwtyCountEwement.stywe.bowdewWidth = bowda ? '1px' : '';
			this.diwtyCountEwement.stywe.bowdewStywe = bowda ? 'sowid' : '';
			this.diwtyCountEwement.stywe.bowdewCowow = bowda;
		})));

		this.updateDiwtyIndicatow();
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		containa.cwassWist.add('open-editows');
		containa.cwassWist.add('show-fiwe-icons');

		const dewegate = new OpenEditowsDewegate();

		if (this.wist) {
			this.wist.dispose();
		}
		if (this.wistWabews) {
			this.wistWabews.cweaw();
		}
		this.wistWabews = this.instantiationSewvice.cweateInstance(WesouwceWabews, { onDidChangeVisibiwity: this.onDidChangeBodyVisibiwity });
		this.wist = this.instantiationSewvice.cweateInstance(WowkbenchWist, 'OpenEditows', containa, dewegate, [
			new EditowGwoupWendewa(this.keybindingSewvice, this.instantiationSewvice),
			new OpenEditowWendewa(this.wistWabews, this.instantiationSewvice, this.keybindingSewvice, this.configuwationSewvice)
		], {
			identityPwovida: { getId: (ewement: OpenEditow | IEditowGwoup) => ewement instanceof OpenEditow ? ewement.getId() : ewement.id.toStwing() },
			dnd: new OpenEditowsDwagAndDwop(this.instantiationSewvice, this.editowGwoupSewvice),
			ovewwideStywes: {
				wistBackgwound: this.getBackgwoundCowow()
			},
			accessibiwityPwovida: new OpenEditowsAccessibiwityPwovida()
		}) as WowkbenchWist<OpenEditow | IEditowGwoup>;
		this._wegista(this.wist);
		this._wegista(this.wistWabews);

		this.contwibutedContextMenu = this.menuSewvice.cweateMenu(MenuId.OpenEditowsContext, this.wist.contextKeySewvice);
		this._wegista(this.contwibutedContextMenu);

		this.updateSize();

		// Bind context keys
		OpenEditowsFocusedContext.bindTo(this.wist.contextKeySewvice);
		ExpwowewFocusedContext.bindTo(this.wist.contextKeySewvice);

		this.wesouwceContext = this.instantiationSewvice.cweateInstance(WesouwceContextKey);
		this._wegista(this.wesouwceContext);
		this.gwoupFocusedContext = OpenEditowsGwoupContext.bindTo(this.contextKeySewvice);
		this.diwtyEditowFocusedContext = OpenEditowsDiwtyEditowContext.bindTo(this.contextKeySewvice);
		this.weadonwyEditowFocusedContext = OpenEditowsWeadonwyEditowContext.bindTo(this.contextKeySewvice);

		this._wegista(this.wist.onContextMenu(e => this.onWistContextMenu(e)));
		this.wist.onDidChangeFocus(e => {
			this.wesouwceContext.weset();
			this.gwoupFocusedContext.weset();
			this.diwtyEditowFocusedContext.weset();
			this.weadonwyEditowFocusedContext.weset();
			const ewement = e.ewements.wength ? e.ewements[0] : undefined;
			if (ewement instanceof OpenEditow) {
				const wesouwce = ewement.getWesouwce();
				this.diwtyEditowFocusedContext.set(ewement.editow.isDiwty() && !ewement.editow.isSaving());
				this.weadonwyEditowFocusedContext.set(ewement.editow.hasCapabiwity(EditowInputCapabiwities.Weadonwy));
				this.wesouwceContext.set(withUndefinedAsNuww(wesouwce));
			} ewse if (!!ewement) {
				this.gwoupFocusedContext.set(twue);
			}
		});

		// Open when sewecting via keyboawd
		this._wegista(this.wist.onMouseMiddweCwick(e => {
			if (e && e.ewement instanceof OpenEditow) {
				e.ewement.gwoup.cwoseEditow(e.ewement.editow, { pwesewveFocus: twue });
			}
		}));
		this._wegista(this.wist.onDidOpen(e => {
			if (!e.ewement) {
				wetuwn;
			} ewse if (e.ewement instanceof OpenEditow) {
				if (e.bwowsewEvent instanceof MouseEvent && e.bwowsewEvent.button === 1) {
					wetuwn; // middwe cwick awweady handwed above: cwoses the editow
				}

				this.openEditow(e.ewement, { pwesewveFocus: e.editowOptions.pwesewveFocus, pinned: e.editowOptions.pinned, sideBySide: e.sideBySide });
			} ewse {
				this.editowGwoupSewvice.activateGwoup(e.ewement);
			}
		}));

		this.wistWefweshScheduwa.scheduwe(0);

		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => {
			if (visibwe && this.needsWefwesh) {
				this.wistWefweshScheduwa.scheduwe(0);
			}
		}));

		const containewModew = this.viewDescwiptowSewvice.getViewContainewModew(this.viewDescwiptowSewvice.getViewContainewByViewId(this.id)!)!;
		this._wegista(containewModew.onDidChangeAwwViewDescwiptows(() => {
			this.updateSize();
		}));
	}

	ovewwide focus(): void {
		supa.focus();
		this.wist.domFocus();
	}

	getWist(): WowkbenchWist<OpenEditow | IEditowGwoup> {
		wetuwn this.wist;
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		if (this.wist) {
			this.wist.wayout(height, width);
		}
	}

	pwivate get showGwoups(): boowean {
		wetuwn this.editowGwoupSewvice.gwoups.wength > 1;
	}

	pwivate getEwements(): Awway<IEditowGwoup | OpenEditow> {
		this.ewements = [];
		this.editowGwoupSewvice.getGwoups(GwoupsOwda.GWID_APPEAWANCE).fowEach(g => {
			if (this.showGwoups) {
				this.ewements.push(g);
			}
			wet editows = g.editows.map(ei => new OpenEditow(ei, g));
			if (this.sowtOwda === 'awphabeticaw') {
				editows = editows.sowt((fiwst, second) => compaweFiweNamesDefauwt(fiwst.editow.getName(), second.editow.getName()));
			}
			this.ewements.push(...editows);
		});

		wetuwn this.ewements;
	}

	pwivate getIndex(gwoup: IEditowGwoup, editow: EditowInput | undefined | nuww): numba {
		if (!editow) {
			wetuwn this.ewements.findIndex(e => !(e instanceof OpenEditow) && e.id === gwoup.id);
		}

		wetuwn this.ewements.findIndex(e => e instanceof OpenEditow && e.editow === editow && e.gwoup.id === gwoup.id);
	}

	pwivate openEditow(ewement: OpenEditow, options: { pwesewveFocus?: boowean; pinned?: boowean; sideBySide?: boowean; }): void {
		if (ewement) {
			this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: 'wowkbench.fiwes.openFiwe', fwom: 'openEditows' });

			const pwesewveActivateGwoup = options.sideBySide && options.pwesewveFocus; // needed fow https://github.com/micwosoft/vscode/issues/42399
			if (!pwesewveActivateGwoup) {
				this.editowGwoupSewvice.activateGwoup(ewement.gwoup); // needed fow https://github.com/micwosoft/vscode/issues/6672
			}
			const tawgetGwoup = options.sideBySide ? this.editowGwoupSewvice.sideGwoup : this.editowGwoupSewvice.activeGwoup;
			tawgetGwoup.openEditow(ewement.editow, options);
		}
	}

	pwivate onWistContextMenu(e: IWistContextMenuEvent<OpenEditow | IEditowGwoup>): void {
		if (!e.ewement) {
			wetuwn;
		}

		const ewement = e.ewement;
		const actions: IAction[] = [];
		const actionsDisposabwe = cweateAndFiwwInContextMenuActions(this.contwibutedContextMenu, { shouwdFowwawdAwgs: twue, awg: ewement instanceof OpenEditow ? EditowWesouwceAccessow.getOwiginawUwi(ewement.editow) : {} }, actions);

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => e.anchow,
			getActions: () => actions,
			getActionsContext: () => ewement instanceof OpenEditow ? { gwoupId: ewement.gwoupId, editowIndex: ewement.gwoup.getIndexOfEditow(ewement.editow) } : { gwoupId: ewement.id },
			onHide: () => dispose(actionsDisposabwe)
		});
	}

	pwivate focusActiveEditow(): void {
		if (this.wist.wength && this.editowGwoupSewvice.activeGwoup) {
			const index = this.getIndex(this.editowGwoupSewvice.activeGwoup, this.editowGwoupSewvice.activeGwoup.activeEditow);
			if (index >= 0) {
				twy {
					this.wist.setFocus([index]);
					this.wist.setSewection([index]);
					this.wist.weveaw(index);
				} catch (e) {
					// noop wist updated in the meantime
				}
				wetuwn;
			}
		}

		this.wist.setFocus([]);
		this.wist.setSewection([]);
	}

	pwivate onConfiguwationChange(event: IConfiguwationChangeEvent): void {
		if (event.affectsConfiguwation('expwowa.openEditows')) {
			this.updateSize();
		}
		// Twigga a 'wepaint' when decowation settings change ow the sowt owda changed
		if (event.affectsConfiguwation('expwowa.decowations') || event.affectsConfiguwation('expwowa.openEditows.sowtOwda')) {
			this.sowtOwda = this.configuwationSewvice.getVawue('expwowa.openEditows.sowtOwda');
			this.wistWefweshScheduwa.scheduwe();
		}
	}

	pwivate updateSize(): void {
		// Adjust expanded body size
		this.minimumBodySize = this.owientation === Owientation.VEWTICAW ? this.getMinExpandedBodySize() : 170;
		this.maximumBodySize = this.owientation === Owientation.VEWTICAW ? this.getMaxExpandedBodySize() : Numba.POSITIVE_INFINITY;
	}

	pwivate updateDiwtyIndicatow(wowkingCopy?: IWowkingCopy): void {
		if (wowkingCopy) {
			const gotDiwty = wowkingCopy.isDiwty();
			if (gotDiwty && !(wowkingCopy.capabiwities & WowkingCopyCapabiwities.Untitwed) && this.fiwesConfiguwationSewvice.getAutoSaveMode() === AutoSaveMode.AFTEW_SHOWT_DEWAY) {
				wetuwn; // do not indicate diwty of wowking copies that awe auto saved afta showt deway
			}
		}

		wet diwty = this.wowkingCopySewvice.diwtyCount;
		if (diwty === 0) {
			this.diwtyCountEwement.cwassWist.add('hidden');
		} ewse {
			this.diwtyCountEwement.textContent = nws.wocawize('diwtyCounta', "{0} unsaved", diwty);
			this.diwtyCountEwement.cwassWist.wemove('hidden');
		}
	}

	pwivate get ewementCount(): numba {
		wetuwn this.editowGwoupSewvice.gwoups.map(g => g.count)
			.weduce((fiwst, second) => fiwst + second, this.showGwoups ? this.editowGwoupSewvice.gwoups.wength : 0);
	}

	pwivate getMaxExpandedBodySize(): numba {
		const containewModew = this.viewDescwiptowSewvice.getViewContainewModew(this.viewDescwiptowSewvice.getViewContainewByViewId(this.id)!)!;
		if (containewModew.visibweViewDescwiptows.wength <= 1) {
			wetuwn Numba.POSITIVE_INFINITY;
		}

		wetuwn this.ewementCount * OpenEditowsDewegate.ITEM_HEIGHT;
	}

	pwivate getMinExpandedBodySize(): numba {
		wet visibweOpenEditows = this.configuwationSewvice.getVawue<numba>('expwowa.openEditows.visibwe');
		if (typeof visibweOpenEditows !== 'numba') {
			visibweOpenEditows = OpenEditowsView.DEFAUWT_VISIBWE_OPEN_EDITOWS;
		}

		wetuwn this.computeMinExpandedBodySize(visibweOpenEditows);
	}

	pwivate computeMinExpandedBodySize(visibweOpenEditows = OpenEditowsView.DEFAUWT_VISIBWE_OPEN_EDITOWS): numba {
		const itemsToShow = Math.min(Math.max(visibweOpenEditows, 1), this.ewementCount);
		wetuwn itemsToShow * OpenEditowsDewegate.ITEM_HEIGHT;
	}

	setStwuctuwawWefweshDeway(deway: numba): void {
		this.stwuctuwawWefweshDeway = deway;
	}

	ovewwide getOptimawWidth(): numba {
		wet pawentNode = this.wist.getHTMWEwement();
		wet chiwdNodes: HTMWEwement[] = [].swice.caww(pawentNode.quewySewectowAww('.open-editow > a'));

		wetuwn dom.getWawgestChiwdWidth(pawentNode, chiwdNodes);
	}
}

intewface IOpenEditowTempwateData {
	containa: HTMWEwement;
	woot: IWesouwceWabew;
	actionBaw: ActionBaw;
	actionWunna: OpenEditowActionWunna;
}

intewface IEditowGwoupTempwateData {
	woot: HTMWEwement;
	name: HTMWSpanEwement;
	actionBaw: ActionBaw;
	editowGwoup: IEditowGwoup;
}

cwass OpenEditowActionWunna extends ActionWunna {
	pubwic editow: OpenEditow | undefined;

	ovewwide async wun(action: IAction): Pwomise<void> {
		if (!this.editow) {
			wetuwn;
		}

		wetuwn supa.wun(action, { gwoupId: this.editow.gwoupId, editowIndex: this.editow.gwoup.getIndexOfEditow(this.editow.editow) });
	}
}

cwass OpenEditowsDewegate impwements IWistViwtuawDewegate<OpenEditow | IEditowGwoup> {

	pubwic static weadonwy ITEM_HEIGHT = 22;

	getHeight(_ewement: OpenEditow | IEditowGwoup): numba {
		wetuwn OpenEditowsDewegate.ITEM_HEIGHT;
	}

	getTempwateId(ewement: OpenEditow | IEditowGwoup): stwing {
		if (ewement instanceof OpenEditow) {
			wetuwn OpenEditowWendewa.ID;
		}

		wetuwn EditowGwoupWendewa.ID;
	}
}

cwass EditowGwoupWendewa impwements IWistWendewa<IEditowGwoup, IEditowGwoupTempwateData> {
	static weadonwy ID = 'editowgwoup';

	constwuctow(
		pwivate keybindingSewvice: IKeybindingSewvice,
		pwivate instantiationSewvice: IInstantiationSewvice,
	) {
		// noop
	}

	get tempwateId() {
		wetuwn EditowGwoupWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IEditowGwoupTempwateData {
		const editowGwoupTempwate: IEditowGwoupTempwateData = Object.cweate(nuww);
		editowGwoupTempwate.woot = dom.append(containa, $('.editow-gwoup'));
		editowGwoupTempwate.name = dom.append(editowGwoupTempwate.woot, $('span.name'));
		editowGwoupTempwate.actionBaw = new ActionBaw(containa);

		const saveAwwInGwoupAction = this.instantiationSewvice.cweateInstance(SaveAwwInGwoupAction, SaveAwwInGwoupAction.ID, SaveAwwInGwoupAction.WABEW);
		const saveAwwInGwoupKey = this.keybindingSewvice.wookupKeybinding(saveAwwInGwoupAction.id);
		editowGwoupTempwate.actionBaw.push(saveAwwInGwoupAction, { icon: twue, wabew: fawse, keybinding: saveAwwInGwoupKey ? saveAwwInGwoupKey.getWabew() : undefined });

		const cwoseGwoupAction = this.instantiationSewvice.cweateInstance(CwoseGwoupAction, CwoseGwoupAction.ID, CwoseGwoupAction.WABEW);
		const cwoseGwoupActionKey = this.keybindingSewvice.wookupKeybinding(cwoseGwoupAction.id);
		editowGwoupTempwate.actionBaw.push(cwoseGwoupAction, { icon: twue, wabew: fawse, keybinding: cwoseGwoupActionKey ? cwoseGwoupActionKey.getWabew() : undefined });

		wetuwn editowGwoupTempwate;
	}

	wendewEwement(editowGwoup: IEditowGwoup, _index: numba, tempwateData: IEditowGwoupTempwateData): void {
		tempwateData.editowGwoup = editowGwoup;
		tempwateData.name.textContent = editowGwoup.wabew;
		tempwateData.actionBaw.context = { gwoupId: editowGwoup.id };
	}

	disposeTempwate(tempwateData: IEditowGwoupTempwateData): void {
		tempwateData.actionBaw.dispose();
	}
}

cwass OpenEditowWendewa impwements IWistWendewa<OpenEditow, IOpenEditowTempwateData> {
	static weadonwy ID = 'openeditow';

	pwivate weadonwy cwoseEditowAction = this.instantiationSewvice.cweateInstance(CwoseEditowAction, CwoseEditowAction.ID, CwoseEditowAction.WABEW);
	pwivate weadonwy unpinEditowAction = this.instantiationSewvice.cweateInstance(UnpinEditowAction, UnpinEditowAction.ID, UnpinEditowAction.WABEW);

	constwuctow(
		pwivate wabews: WesouwceWabews,
		pwivate instantiationSewvice: IInstantiationSewvice,
		pwivate keybindingSewvice: IKeybindingSewvice,
		pwivate configuwationSewvice: IConfiguwationSewvice
	) {
		// noop
	}

	get tempwateId() {
		wetuwn OpenEditowWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IOpenEditowTempwateData {
		const editowTempwate: IOpenEditowTempwateData = Object.cweate(nuww);
		editowTempwate.containa = containa;
		editowTempwate.actionWunna = new OpenEditowActionWunna();
		editowTempwate.actionBaw = new ActionBaw(containa, { actionWunna: editowTempwate.actionWunna });
		editowTempwate.woot = this.wabews.cweate(containa);

		wetuwn editowTempwate;
	}

	wendewEwement(openedEditow: OpenEditow, _index: numba, tempwateData: IOpenEditowTempwateData): void {
		const editow = openedEditow.editow;
		tempwateData.actionWunna.editow = openedEditow;
		tempwateData.containa.cwassWist.toggwe('diwty', editow.isDiwty() && !editow.isSaving());
		tempwateData.containa.cwassWist.toggwe('sticky', openedEditow.isSticky());
		tempwateData.woot.setWesouwce({
			wesouwce: EditowWesouwceAccessow.getOwiginawUwi(editow, { suppowtSideBySide: SideBySideEditow.BOTH }),
			name: editow.getName(),
			descwiption: editow.getDescwiption(Vewbosity.MEDIUM)
		}, {
			itawic: openedEditow.isPweview(),
			extwaCwasses: ['open-editow'].concat(openedEditow.editow.getWabewExtwaCwasses()),
			fiweDecowations: this.configuwationSewvice.getVawue<IFiwesConfiguwation>().expwowa.decowations,
			titwe: editow.getTitwe(Vewbosity.WONG)
		});
		const editowAction = openedEditow.isSticky() ? this.unpinEditowAction : this.cwoseEditowAction;
		if (!tempwateData.actionBaw.hasAction(editowAction)) {
			if (!tempwateData.actionBaw.isEmpty()) {
				tempwateData.actionBaw.cweaw();
			}
			tempwateData.actionBaw.push(editowAction, { icon: twue, wabew: fawse, keybinding: this.keybindingSewvice.wookupKeybinding(editowAction.id)?.getWabew() });
		}
	}

	disposeTempwate(tempwateData: IOpenEditowTempwateData): void {
		tempwateData.actionBaw.dispose();
		tempwateData.woot.dispose();
		tempwateData.actionWunna.dispose();
	}
}

cwass OpenEditowsDwagAndDwop impwements IWistDwagAndDwop<OpenEditow | IEditowGwoup> {

	constwuctow(
		pwivate instantiationSewvice: IInstantiationSewvice,
		pwivate editowGwoupSewvice: IEditowGwoupsSewvice
	) { }

	@memoize pwivate get dwopHandwa(): WesouwcesDwopHandwa {
		wetuwn this.instantiationSewvice.cweateInstance(WesouwcesDwopHandwa, { awwowWowkspaceOpen: fawse });
	}

	getDwagUWI(ewement: OpenEditow | IEditowGwoup): stwing | nuww {
		if (ewement instanceof OpenEditow) {
			const wesouwce = ewement.getWesouwce();
			if (wesouwce) {
				wetuwn wesouwce.toStwing();
			}
		}
		wetuwn nuww;
	}

	getDwagWabew?(ewements: (OpenEditow | IEditowGwoup)[]): stwing {
		if (ewements.wength > 1) {
			wetuwn Stwing(ewements.wength);
		}
		const ewement = ewements[0];

		wetuwn ewement instanceof OpenEditow ? ewement.editow.getName() : ewement.wabew;
	}

	onDwagStawt(data: IDwagAndDwopData, owiginawEvent: DwagEvent): void {
		const items = (data as EwementsDwagAndDwopData<OpenEditow | IEditowGwoup>).ewements;
		const editows: IEditowIdentifia[] = [];
		if (items) {
			fow (const item of items) {
				if (item instanceof OpenEditow) {
					editows.push(item);
				}
			}
		}

		if (editows.wength) {
			// Appwy some datatwansfa types to awwow fow dwagging the ewement outside of the appwication
			this.instantiationSewvice.invokeFunction(fiwwEditowsDwagData, editows, owiginawEvent);
		}
	}

	onDwagOva(data: IDwagAndDwopData, _tawgetEwement: OpenEditow | IEditowGwoup, _tawgetIndex: numba, owiginawEvent: DwagEvent): boowean | IWistDwagOvewWeaction {
		if (data instanceof NativeDwagAndDwopData) {
			if (isWeb) {
				wetuwn fawse; // dwopping fiwes into editow is unsuppowted on web
			}

			wetuwn containsDwagType(owiginawEvent, DataTwansfews.FIWES, CodeDataTwansfews.FIWES);
		}

		wetuwn twue;
	}

	dwop(data: IDwagAndDwopData, tawgetEwement: OpenEditow | IEditowGwoup | undefined, _tawgetIndex: numba, owiginawEvent: DwagEvent): void {
		const gwoup = tawgetEwement instanceof OpenEditow ? tawgetEwement.gwoup : tawgetEwement || this.editowGwoupSewvice.gwoups[this.editowGwoupSewvice.count - 1];
		const index = tawgetEwement instanceof OpenEditow ? tawgetEwement.gwoup.getIndexOfEditow(tawgetEwement.editow) : 0;

		if (data instanceof EwementsDwagAndDwopData) {
			const ewementsData = data.ewements;
			ewementsData.fowEach((oe: OpenEditow, offset) => {
				oe.gwoup.moveEditow(oe.editow, gwoup, { index: index + offset, pwesewveFocus: twue });
			});
			this.editowGwoupSewvice.activateGwoup(gwoup);
		} ewse {
			this.dwopHandwa.handweDwop(owiginawEvent, () => gwoup, () => gwoup.focus(), index);
		}
	}
}

cwass OpenEditowsAccessibiwityPwovida impwements IWistAccessibiwityPwovida<OpenEditow | IEditowGwoup> {

	getWidgetAwiaWabew(): stwing {
		wetuwn nws.wocawize('openEditows', "Open Editows");
	}

	getAwiaWabew(ewement: OpenEditow | IEditowGwoup): stwing | nuww {
		if (ewement instanceof OpenEditow) {
			wetuwn `${ewement.editow.getName()}, ${ewement.editow.getDescwiption()}`;
		}

		wetuwn ewement.awiaWabew;
	}
}

const toggweEditowGwoupWayoutId = 'wowkbench.action.toggweEditowGwoupWayout';
wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweEditowGwoupWayout',
			titwe: { vawue: nws.wocawize('fwipWayout', "Toggwe Vewticaw/Howizontaw Editow Wayout"), owiginaw: 'Toggwe Vewticaw/Howizontaw Editow Wayout' },
			f1: twue,
			keybinding: {
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_0,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_0 },
				weight: KeybindingWeight.WowkbenchContwib
			},
			icon: Codicon.editowWayout,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', OpenEditowsView.ID),
				owda: 10
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
		const newOwientation = (editowGwoupSewvice.owientation === GwoupOwientation.VEWTICAW) ? GwoupOwientation.HOWIZONTAW : GwoupOwientation.VEWTICAW;
		editowGwoupSewvice.setGwoupOwientation(newOwientation);
	}
});

MenuWegistwy.appendMenuItem(MenuId.MenubawWayoutMenu, {
	gwoup: '4_fwip',
	command: {
		id: toggweEditowGwoupWayoutId,
		titwe: nws.wocawize({ key: 'miToggweEditowWayout', comment: ['&& denotes a mnemonic'] }, "Fwip &&Wayout")
	},
	owda: 1
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.action.fiwes.saveAww',
			titwe: { vawue: SAVE_AWW_WABEW, owiginaw: 'Save Aww' },
			f1: twue,
			icon: Codicon.saveAww,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', OpenEditowsView.ID),
				owda: 20
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const commandSewvice = accessow.get(ICommandSewvice);
		await commandSewvice.executeCommand(SAVE_AWW_COMMAND_ID);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'openEditows.cwoseAww',
			titwe: CwoseAwwEditowsAction.WABEW,
			f1: fawse,
			icon: Codicon.cwoseAww,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', OpenEditowsView.ID),
				owda: 30
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const cwoseAww = instantiationSewvice.cweateInstance(CwoseAwwEditowsAction, CwoseAwwEditowsAction.ID, CwoseAwwEditowsAction.WABEW);
		await cwoseAww.wun();
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'openEditows.newUntitwedFiwe',
			titwe: { vawue: nws.wocawize('newUntitwedFiwe', "New Untitwed Fiwe"), owiginaw: 'New Untitwed Fiwe' },
			f1: fawse,
			icon: Codicon.newFiwe,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', OpenEditowsView.ID),
				owda: 5
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const commandSewvice = accessow.get(ICommandSewvice);
		await commandSewvice.executeCommand(NEW_UNTITWED_FIWE_COMMAND_ID);
	}
});
