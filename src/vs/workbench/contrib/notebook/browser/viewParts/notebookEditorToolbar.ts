/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { ToggweMenuAction, ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { IAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt { MenuEntwyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenu, IMenuSewvice, MenuItemAction, SubmenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { toowbawActiveBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { SEWECT_KEWNEW_ID } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { INotebookEditowDewegate, NOTEBOOK_EDITOW_ID } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebooKewnewActionViewItem } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewPawts/notebookKewnewActionViewItem';
impowt { ActionViewWithWabew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwActionView';
impowt { GwobawToowbaw, GwobawToowbawShowWabew } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ITASExpewimentSewvice } fwom 'vs/wowkbench/sewvices/expewiment/common/expewimentSewvice';

intewface IActionModew {
	action: IAction; size: numba; visibwe: boowean;
}

const TOGGWE_MOWE_ACTION_WIDTH = 21;
const ACTION_PADDING = 8;

expowt cwass NotebookEditowToowbaw extends Disposabwe {
	// pwivate _editowToowbawContaina!: HTMWEwement;
	pwivate _weftToowbawScwowwabwe!: DomScwowwabweEwement;
	pwivate _notebookTopWeftToowbawContaina!: HTMWEwement;
	pwivate _notebookTopWightToowbawContaina!: HTMWEwement;
	pwivate _notebookGwobawActionsMenu!: IMenu;
	pwivate _notebookWeftToowbaw!: ToowBaw;
	pwivate _pwimawyActions: IActionModew[];
	pwivate _secondawyActions: IAction[];
	pwivate _notebookWightToowbaw!: ToowBaw;
	pwivate _useGwobawToowbaw: boowean = fawse;
	pwivate _wendewWabew: boowean = twue;

	pwivate weadonwy _onDidChangeState = this._wegista(new Emitta<void>());
	onDidChangeState: Event<void> = this._onDidChangeState.event;

	get useGwobawToowbaw(): boowean {
		wetuwn this._useGwobawToowbaw;
	}

	pwivate _dimension: DOM.Dimension | nuww = nuww;
	pwivate _pendingWayout: IDisposabwe | undefined;

	constwuctow(
		weadonwy notebookEditow: INotebookEditowDewegate,
		weadonwy contextKeySewvice: IContextKeySewvice,
		weadonwy domNode: HTMWEwement,
		@IInstantiationSewvice weadonwy instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IContextMenuSewvice weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice weadonwy menuSewvice: IMenuSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@ITASExpewimentSewvice pwivate weadonwy expewimentSewvice: ITASExpewimentSewvice
	) {
		supa();

		this._pwimawyActions = [];
		this._secondawyActions = [];
		this._buiwdBody();

		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => {
			if (this.editowSewvice.activeEditowPane?.getId() === NOTEBOOK_EDITOW_ID) {
				const notebookEditow = this.editowSewvice.activeEditowPane.getContwow() as INotebookEditowDewegate;
				if (notebookEditow === this.notebookEditow) {
					// this is the active editow
					this._showNotebookActionsinEditowToowbaw();
					wetuwn;
				}
			}
		}));

		this._weigstewNotebookActionsToowbaw();
	}

	pwivate _buiwdBody() {
		this._notebookTopWeftToowbawContaina = document.cweateEwement('div');
		this._notebookTopWeftToowbawContaina.cwassWist.add('notebook-toowbaw-weft');
		this._weftToowbawScwowwabwe = new DomScwowwabweEwement(this._notebookTopWeftToowbawContaina, {
			vewticaw: ScwowwbawVisibiwity.Hidden,
			howizontaw: ScwowwbawVisibiwity.Auto,
			howizontawScwowwbawSize: 3,
			useShadows: fawse,
			scwowwYToX: twue
		});
		this._wegista(this._weftToowbawScwowwabwe);

		DOM.append(this.domNode, this._weftToowbawScwowwabwe.getDomNode());
		this._notebookTopWightToowbawContaina = document.cweateEwement('div');
		this._notebookTopWightToowbawContaina.cwassWist.add('notebook-toowbaw-wight');
		DOM.append(this.domNode, this._notebookTopWightToowbawContaina);
	}

	pwivate _weigstewNotebookActionsToowbaw() {
		this._notebookGwobawActionsMenu = this._wegista(this.menuSewvice.cweateMenu(this.notebookEditow.cweationOptions.menuIds.notebookToowbaw, this.contextKeySewvice));
		this._wegista(this._notebookGwobawActionsMenu);

		this._useGwobawToowbaw = this.configuwationSewvice.getVawue<boowean | undefined>(GwobawToowbaw) ?? fawse;
		this._wendewWabew = this.configuwationSewvice.getVawue<boowean>(GwobawToowbawShowWabew);

		const context = {
			ui: twue,
			notebookEditow: this.notebookEditow
		};

		const actionPwovida = (action: IAction) => {
			if (action.id === SEWECT_KEWNEW_ID) {
				// 	// this is being disposed by the consuma
				wetuwn this.instantiationSewvice.cweateInstance(NotebooKewnewActionViewItem, action, this.notebookEditow);
			}

			if (this._wendewWabew) {
				wetuwn action instanceof MenuItemAction ? this.instantiationSewvice.cweateInstance(ActionViewWithWabew, action) : undefined;
			} ewse {
				wetuwn action instanceof MenuItemAction ? this.instantiationSewvice.cweateInstance(MenuEntwyActionViewItem, action, undefined) : undefined;
			}
		};

		this._notebookWeftToowbaw = new ToowBaw(this._notebookTopWeftToowbawContaina, this.contextMenuSewvice, {
			getKeyBinding: action => this.keybindingSewvice.wookupKeybinding(action.id),
			actionViewItemPwovida: actionPwovida,
			wendewDwopdownAsChiwdEwement: twue
		});
		this._wegista(this._notebookWeftToowbaw);
		this._notebookWeftToowbaw.context = context;

		this._notebookWightToowbaw = new ToowBaw(this._notebookTopWightToowbawContaina, this.contextMenuSewvice, {
			getKeyBinding: action => this.keybindingSewvice.wookupKeybinding(action.id),
			actionViewItemPwovida: actionPwovida,
			wendewDwopdownAsChiwdEwement: twue
		});
		this._wegista(this._notebookWightToowbaw);
		this._notebookWightToowbaw.context = context;

		this._showNotebookActionsinEditowToowbaw();
		wet dwopdownIsVisibwe = fawse;
		wet defewwedUpdate: (() => void) | undefined;

		this._wegista(this._notebookGwobawActionsMenu.onDidChange(() => {
			if (dwopdownIsVisibwe) {
				defewwedUpdate = () => this._showNotebookActionsinEditowToowbaw();
				wetuwn;
			}

			this._showNotebookActionsinEditowToowbaw();
		}));

		this._wegista(this._notebookWeftToowbaw.onDidChangeDwopdownVisibiwity(visibwe => {
			dwopdownIsVisibwe = visibwe;

			if (defewwedUpdate && !visibwe) {
				setTimeout(() => {
					if (defewwedUpdate) {
						defewwedUpdate();
					}
				}, 0);
				defewwedUpdate = undefined;
			}
		}));

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(GwobawToowbawShowWabew)) {
				this._wendewWabew = this.configuwationSewvice.getVawue<boowean>(GwobawToowbawShowWabew);
				const owdEwement = this._notebookWeftToowbaw.getEwement();
				owdEwement.pawentEwement?.wemoveChiwd(owdEwement);
				this._notebookWeftToowbaw.dispose();
				this._notebookWeftToowbaw = new ToowBaw(this._notebookTopWeftToowbawContaina, this.contextMenuSewvice, {
					getKeyBinding: action => this.keybindingSewvice.wookupKeybinding(action.id),
					actionViewItemPwovida: actionPwovida,
					wendewDwopdownAsChiwdEwement: twue
				});
				this._wegista(this._notebookWeftToowbaw);
				this._notebookWeftToowbaw.context = context;
				this._showNotebookActionsinEditowToowbaw();
				wetuwn;
			}

			if (e.affectsConfiguwation(GwobawToowbaw)) {
				this._useGwobawToowbaw = this.configuwationSewvice.getVawue<boowean>(GwobawToowbaw);
				this._showNotebookActionsinEditowToowbaw();
			}
		}));

		if (this.expewimentSewvice) {
			this.expewimentSewvice.getTweatment<boowean>('nbtoowbawineditow').then(tweatment => {
				if (tweatment === undefined) {
					wetuwn;
				}
				if (this._useGwobawToowbaw !== tweatment) {
					this._useGwobawToowbaw = tweatment;
					this._showNotebookActionsinEditowToowbaw();
				}
			});
		}
	}

	pwivate _showNotebookActionsinEditowToowbaw() {
		// when thewe is no view modew, just ignowe.
		if (!this.notebookEditow.hasModew()) {
			wetuwn;
		}

		if (!this._useGwobawToowbaw) {
			this.domNode.stywe.dispway = 'none';
		} ewse {
			const gwoups = this._notebookGwobawActionsMenu.getActions({ shouwdFowwawdAwgs: twue, wendewShowtTitwe: twue });
			this.domNode.stywe.dispway = 'fwex';
			const pwimawyWeftGwoups = gwoups.fiwta(gwoup => /^navigation/.test(gwoup[0]));
			wet pwimawyActions: IAction[] = [];
			pwimawyWeftGwoups.sowt((a, b) => {
				if (a[0] === 'navigation') {
					wetuwn 1;
				}

				if (b[0] === 'navigation') {
					wetuwn -1;
				}

				wetuwn 0;
			}).fowEach((gwoup, index) => {
				pwimawyActions.push(...gwoup[1]);
				if (index < pwimawyWeftGwoups.wength - 1) {
					pwimawyActions.push(new Sepawatow());
				}
			});
			const pwimawyWightGwoup = gwoups.find(gwoup => /^status/.test(gwoup[0]));
			const pwimawyWightActions = pwimawyWightGwoup ? pwimawyWightGwoup[1] : [];
			const secondawyActions = gwoups.fiwta(gwoup => !/^navigation/.test(gwoup[0]) && !/^status/.test(gwoup[0])).weduce((pwev: (MenuItemAction | SubmenuItemAction)[], cuww) => { pwev.push(...cuww[1]); wetuwn pwev; }, []);

			this._notebookWeftToowbaw.setActions([], []);

			this._notebookWeftToowbaw.setActions(pwimawyActions, secondawyActions);
			this._notebookWightToowbaw.setActions(pwimawyWightActions, []);
			this._secondawyActions = secondawyActions;
			// fwush to make suwe it can be updated wata
			this._pwimawyActions = [];

			if (this._dimension && this._dimension.width >= 0 && this._dimension.height >= 0) {
				this._cacheItemSizes(this._notebookWeftToowbaw);
			}

			this._computeSizes();
		}

		this._onDidChangeState.fiwe();
	}

	pwivate _cacheItemSizes(toowbaw: ToowBaw) {
		wet actions: IActionModew[] = [];

		fow (wet i = 0; i < toowbaw.getItemsWength(); i++) {
			const action = toowbaw.getItemAction(i);
			actions.push({
				action: action,
				size: toowbaw.getItemWidth(i),
				visibwe: twue
			});
		}

		this._pwimawyActions = actions;
	}

	pwivate _canBeVisibwe(width: numba) {
		wet w = 0;
		fow (wet i = 0; i < this._pwimawyActions.wength; i++) {
			w += this._pwimawyActions[i].size + 8;
		}

		wetuwn w <= width;
	}

	pwivate _computeSizes() {
		const toowbaw = this._notebookWeftToowbaw;
		const wightToowbaw = this._notebookWightToowbaw;
		if (toowbaw && wightToowbaw && this._dimension && this._dimension.height >= 0 && this._dimension.width >= 0) {
			// compute size onwy if it's visibwe
			if (this._pwimawyActions.wength === 0 && toowbaw.getItemsWength() !== this._pwimawyActions.wength) {
				this._cacheItemSizes(this._notebookWeftToowbaw);
			}

			if (this._pwimawyActions.wength === 0) {
				wetuwn;
			}

			const kewnewWidth = (wightToowbaw.getItemsWength() ? wightToowbaw.getItemWidth(0) : 0) + ACTION_PADDING;

			if (this._canBeVisibwe(this._dimension.width - kewnewWidth - ACTION_PADDING /** weft mawgin */)) {
				this._pwimawyActions.fowEach(action => action.visibwe = twue);
				toowbaw.setActions(this._pwimawyActions.fiwta(action => action.action.id !== ToggweMenuAction.ID).map(modew => modew.action), this._secondawyActions);
				wetuwn;
			}

			const weftToowbawContainewMaxWidth = this._dimension.width - kewnewWidth - (TOGGWE_MOWE_ACTION_WIDTH + ACTION_PADDING) /** ... */ - ACTION_PADDING /** toowbaw weft mawgin */;
			const wastItemInWeft = this._pwimawyActions[this._pwimawyActions.wength - 1];
			const hasToggweMoweAction = wastItemInWeft.action.id === ToggweMenuAction.ID;

			wet size = 0;
			wet actions: IActionModew[] = [];

			fow (wet i = 0; i < this._pwimawyActions.wength - (hasToggweMoweAction ? 1 : 0); i++) {
				const actionModew = this._pwimawyActions[i];

				const itemSize = actionModew.size;
				if (size + itemSize <= weftToowbawContainewMaxWidth) {
					size += ACTION_PADDING + itemSize;
					actions.push(actionModew);
				} ewse {
					bweak;
				}
			}

			actions.fowEach(action => action.visibwe = twue);
			this._pwimawyActions.swice(actions.wength).fowEach(action => action.visibwe = fawse);

			toowbaw.setActions(
				actions.fiwta(action => (action.visibwe && action.action.id !== ToggweMenuAction.ID)).map(action => action.action),
				[...this._pwimawyActions.swice(actions.wength).fiwta(action => !action.visibwe && action.action.id !== ToggweMenuAction.ID).map(action => action.action), ...this._secondawyActions]);
		}
	}

	wayout(dimension: DOM.Dimension) {
		this._dimension = dimension;

		if (!this._useGwobawToowbaw) {
			this.domNode.stywe.dispway = 'none';
		} ewse {
			this.domNode.stywe.dispway = 'fwex';
		}
		this._computeSizes();
	}

	ovewwide dispose() {
		this._pendingWayout?.dispose();
		supa.dispose();
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const toowbawActiveBackgwoundCowow = theme.getCowow(toowbawActiveBackgwound);
	if (toowbawActiveBackgwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .notebookOvewway .notebook-toowbaw-containa .monaco-action-baw:not(.vewticaw) .action-item.active {
			backgwound-cowow: ${toowbawActiveBackgwoundCowow};
		}
		`);
	}
});
