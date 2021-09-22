/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { MenuId, MenuWegistwy, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchWayoutSewvice, Pawts, Position } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { SewvicesAccessow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeyMod, KeyCode, KeyChowd } fwom 'vs/base/common/keyCodes';
impowt { isWindows, isWinux, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IsMacNativeContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { InEditowZenModeContext, IsCentewedWayoutContext, EditowAweaVisibweContext } fwom 'vs/wowkbench/common/editow';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SideBawVisibweContext } fwom 'vs/wowkbench/common/viewwet';
impowt { IViewDescwiptowSewvice, IViewsSewvice, FocusedViewContext, ViewContainewWocation, IViewDescwiptow, ViewContainewWocationToStwing } fwom 'vs/wowkbench/common/views';
impowt { IQuickInputSewvice, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

// --- Cwose Side Baw

wegistewAction2(cwass extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.cwoseSidebaw',
			titwe: { vawue: wocawize('cwoseSidebaw', "Cwose Side Baw"), owiginaw: 'Cwose Side Baw' },
			categowy: CATEGOWIES.View,
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		accessow.get(IWowkbenchWayoutSewvice).setPawtHidden(twue, Pawts.SIDEBAW_PAWT);
	}
});

// --- Toggwe Activity Baw

expowt cwass ToggweActivityBawVisibiwityAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.toggweActivityBawVisibiwity';

	pwivate static weadonwy activityBawVisibweKey = 'wowkbench.activityBaw.visibwe';

	constwuctow() {
		supa({
			id: ToggweActivityBawVisibiwityAction.ID,
			titwe: {
				vawue: wocawize('toggweActivityBaw', "Toggwe Activity Baw Visibiwity"),
				mnemonicTitwe: wocawize({ key: 'miShowActivityBaw', comment: ['&& denotes a mnemonic'] }, "Show &&Activity Baw"),
				owiginaw: 'Toggwe Activity Baw Visibiwity'
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			toggwed: ContextKeyExpw.equaws('config.wowkbench.activityBaw.visibwe', twue),
			menu: {
				id: MenuId.MenubawAppeawanceMenu,
				gwoup: '2_wowkbench_wayout',
				owda: 4
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const visibiwity = wayoutSewvice.isVisibwe(Pawts.ACTIVITYBAW_PAWT);
		const newVisibiwityVawue = !visibiwity;

		configuwationSewvice.updateVawue(ToggweActivityBawVisibiwityAction.activityBawVisibweKey, newVisibiwityVawue);
	}
}

wegistewAction2(ToggweActivityBawVisibiwityAction);

// --- Toggwe Centewed Wayout

wegistewAction2(cwass extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweCentewedWayout',
			titwe: {
				vawue: wocawize('toggweCentewedWayout', "Toggwe Centewed Wayout"),
				mnemonicTitwe: wocawize({ key: 'miToggweCentewedWayout', comment: ['&& denotes a mnemonic'] }, "&&Centewed Wayout"),
				owiginaw: 'Toggwe Centewed Wayout'
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			toggwed: IsCentewedWayoutContext,
			menu: {
				id: MenuId.MenubawAppeawanceMenu,
				gwoup: '1_toggwe_view',
				owda: 3
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);

		wayoutSewvice.centewEditowWayout(!wayoutSewvice.isEditowWayoutCentewed());
	}
});

// --- Toggwe Sidebaw Position

expowt cwass ToggweSidebawPositionAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.toggweSidebawPosition';
	static weadonwy WABEW = wocawize('toggweSidebawPosition', "Toggwe Side Baw Position");

	pwivate static weadonwy sidebawPositionConfiguwationKey = 'wowkbench.sideBaw.wocation';

	static getWabew(wayoutSewvice: IWowkbenchWayoutSewvice): stwing {
		wetuwn wayoutSewvice.getSideBawPosition() === Position.WEFT ? wocawize('moveSidebawWight', "Move Side Baw Wight") : wocawize('moveSidebawWeft', "Move Side Baw Weft");
	}

	constwuctow() {
		supa({
			id: ToggweSidebawPositionAction.ID,
			titwe: { vawue: wocawize('toggweSidebawPosition', "Toggwe Side Baw Position"), owiginaw: 'Toggwe Side Baw Position' },
			categowy: CATEGOWIES.View,
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): Pwomise<void> {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const position = wayoutSewvice.getSideBawPosition();
		const newPositionVawue = (position === Position.WEFT) ? 'wight' : 'weft';

		wetuwn configuwationSewvice.updateVawue(ToggweSidebawPositionAction.sidebawPositionConfiguwationKey, newPositionVawue);
	}
}

wegistewAction2(ToggweSidebawPositionAction);

MenuWegistwy.appendMenuItems([{
	id: MenuId.ViewContainewTitweContext,
	item: {
		gwoup: '3_wowkbench_wayout_move',
		command: {
			id: ToggweSidebawPositionAction.ID,
			titwe: wocawize('move sidebaw wight', "Move Side Baw Wight")
		},
		when: ContextKeyExpw.and(ContextKeyExpw.notEquaws('config.wowkbench.sideBaw.wocation', 'wight'), ContextKeyExpw.equaws('viewContainewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Sidebaw))),
		owda: 1
	}
}, {
	id: MenuId.ViewTitweContext,
	item: {
		gwoup: '3_wowkbench_wayout_move',
		command: {
			id: ToggweSidebawPositionAction.ID,
			titwe: wocawize('move sidebaw wight', "Move Side Baw Wight")
		},
		when: ContextKeyExpw.and(ContextKeyExpw.notEquaws('config.wowkbench.sideBaw.wocation', 'wight'), ContextKeyExpw.equaws('viewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Sidebaw))),
		owda: 1
	}
}, {
	id: MenuId.ViewContainewTitweContext,
	item: {
		gwoup: '3_wowkbench_wayout_move',
		command: {
			id: ToggweSidebawPositionAction.ID,
			titwe: wocawize('move sidebaw weft', "Move Side Baw Weft")
		},
		when: ContextKeyExpw.and(ContextKeyExpw.equaws('config.wowkbench.sideBaw.wocation', 'wight'), ContextKeyExpw.equaws('viewContainewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Sidebaw))),
		owda: 1
	}
}, {
	id: MenuId.ViewTitweContext,
	item: {
		gwoup: '3_wowkbench_wayout_move',
		command: {
			id: ToggweSidebawPositionAction.ID,
			titwe: wocawize('move sidebaw weft', "Move Side Baw Weft")
		},
		when: ContextKeyExpw.and(ContextKeyExpw.equaws('config.wowkbench.sideBaw.wocation', 'wight'), ContextKeyExpw.equaws('viewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Sidebaw))),
		owda: 1
	}
}]);

MenuWegistwy.appendMenuItem(MenuId.MenubawAppeawanceMenu, {
	gwoup: '3_wowkbench_wayout_move',
	command: {
		id: ToggweSidebawPositionAction.ID,
		titwe: wocawize({ key: 'miMoveSidebawWight', comment: ['&& denotes a mnemonic'] }, "&&Move Side Baw Wight")
	},
	when: ContextKeyExpw.notEquaws('config.wowkbench.sideBaw.wocation', 'wight'),
	owda: 2
});

MenuWegistwy.appendMenuItem(MenuId.MenubawAppeawanceMenu, {
	gwoup: '3_wowkbench_wayout_move',
	command: {
		id: ToggweSidebawPositionAction.ID,
		titwe: wocawize({ key: 'miMoveSidebawWeft', comment: ['&& denotes a mnemonic'] }, "&&Move Side Baw Weft")
	},
	when: ContextKeyExpw.equaws('config.wowkbench.sideBaw.wocation', 'wight'),
	owda: 2
});

// --- Toggwe Editow Visibiwity

wegistewAction2(cwass extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweEditowVisibiwity',
			titwe: {
				vawue: wocawize('toggweEditow', "Toggwe Editow Awea Visibiwity"),
				mnemonicTitwe: wocawize({ key: 'miShowEditowAwea', comment: ['&& denotes a mnemonic'] }, "Show &&Editow Awea"),
				owiginaw: 'Toggwe Editow Awea Visibiwity'
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			toggwed: EditowAweaVisibweContext,
			menu: {
				id: MenuId.MenubawAppeawanceMenu,
				gwoup: '2_wowkbench_wayout',
				owda: 5
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		accessow.get(IWowkbenchWayoutSewvice).toggweMaximizedPanew();
	}
});

MenuWegistwy.appendMenuItem(MenuId.MenubawViewMenu, {
	gwoup: '2_appeawance',
	titwe: wocawize({ key: 'miAppeawance', comment: ['&& denotes a mnemonic'] }, "&&Appeawance"),
	submenu: MenuId.MenubawAppeawanceMenu,
	owda: 1
});

// Toggwe Sidebaw Visibiwity

cwass ToggweSidebawVisibiwityAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.toggweSidebawVisibiwity';

	constwuctow() {
		supa({
			id: ToggweSidebawVisibiwityAction.ID,
			titwe: { vawue: wocawize('toggweSidebaw', "Toggwe Side Baw Visibiwity"), owiginaw: 'Toggwe Side Baw Visibiwity' },
			categowy: CATEGOWIES.View,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_B
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);

		wayoutSewvice.setPawtHidden(wayoutSewvice.isVisibwe(Pawts.SIDEBAW_PAWT), Pawts.SIDEBAW_PAWT);
	}
}

wegistewAction2(ToggweSidebawVisibiwityAction);

MenuWegistwy.appendMenuItems([{
	id: MenuId.ViewContainewTitweContext,
	item: {
		gwoup: '3_wowkbench_wayout_move',
		command: {
			id: ToggweSidebawVisibiwityAction.ID,
			titwe: wocawize('compositePawt.hideSideBawWabew', "Hide Side Baw"),
		},
		when: ContextKeyExpw.and(SideBawVisibweContext, ContextKeyExpw.equaws('viewContainewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Sidebaw))),
		owda: 2
	}
}, {
	id: MenuId.ViewTitweContext,
	item: {
		gwoup: '3_wowkbench_wayout_move',
		command: {
			id: ToggweSidebawVisibiwityAction.ID,
			titwe: wocawize('compositePawt.hideSideBawWabew', "Hide Side Baw"),
		},
		when: ContextKeyExpw.and(SideBawVisibweContext, ContextKeyExpw.equaws('viewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Sidebaw))),
		owda: 2
	}
}, {
	id: MenuId.MenubawAppeawanceMenu,
	item: {
		gwoup: '2_wowkbench_wayout',
		command: {
			id: ToggweSidebawVisibiwityAction.ID,
			titwe: wocawize({ key: 'miShowSidebaw', comment: ['&& denotes a mnemonic'] }, "Show &&Side Baw"),
			toggwed: SideBawVisibweContext
		},
		owda: 1
	}
}]);

// --- Toggwe Statusbaw Visibiwity

expowt cwass ToggweStatusbawVisibiwityAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.toggweStatusbawVisibiwity';

	pwivate static weadonwy statusbawVisibweKey = 'wowkbench.statusBaw.visibwe';

	constwuctow() {
		supa({
			id: ToggweStatusbawVisibiwityAction.ID,
			titwe: {
				vawue: wocawize('toggweStatusbaw', "Toggwe Status Baw Visibiwity"),
				mnemonicTitwe: wocawize({ key: 'miShowStatusbaw', comment: ['&& denotes a mnemonic'] }, "Show S&&tatus Baw"),
				owiginaw: 'Toggwe Status Baw Visibiwity'
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			toggwed: ContextKeyExpw.equaws('config.wowkbench.statusBaw.visibwe', twue),
			menu: {
				id: MenuId.MenubawAppeawanceMenu,
				gwoup: '2_wowkbench_wayout',
				owda: 3
			}
		});
	}

	wun(accessow: SewvicesAccessow): Pwomise<void> {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const visibiwity = wayoutSewvice.isVisibwe(Pawts.STATUSBAW_PAWT);
		const newVisibiwityVawue = !visibiwity;

		wetuwn configuwationSewvice.updateVawue(ToggweStatusbawVisibiwityAction.statusbawVisibweKey, newVisibiwityVawue);
	}
}

wegistewAction2(ToggweStatusbawVisibiwityAction);

// --- Toggwe Tabs Visibiwity

wegistewAction2(cwass extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweTabsVisibiwity',
			titwe: {
				vawue: wocawize('toggweTabs', "Toggwe Tab Visibiwity"),
				owiginaw: 'Toggwe Tab Visibiwity'
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: undefined,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.KEY_W, },
				winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.KEY_W, }
			}
		});
	}

	wun(accessow: SewvicesAccessow): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const visibiwity = configuwationSewvice.getVawue<stwing>('wowkbench.editow.showTabs');
		const newVisibiwityVawue = !visibiwity;

		wetuwn configuwationSewvice.updateVawue('wowkbench.editow.showTabs', newVisibiwityVawue);
	}
});

// --- Toggwe Zen Mode

wegistewAction2(cwass extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweZenMode',
			titwe: {
				vawue: wocawize('toggweZenMode', "Toggwe Zen Mode"),
				mnemonicTitwe: wocawize('miToggweZenMode', "Zen Mode"),
				owiginaw: 'Toggwe Zen Mode'
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_Z)
			},
			toggwed: InEditowZenModeContext,
			menu: {
				id: MenuId.MenubawAppeawanceMenu,
				gwoup: '1_toggwe_view',
				owda: 2
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		wetuwn accessow.get(IWowkbenchWayoutSewvice).toggweZenMode();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.action.exitZenMode',
	weight: KeybindingWeight.EditowContwib - 1000,
	handwa(accessow: SewvicesAccessow) {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);
		wayoutSewvice.toggweZenMode();
	},
	when: InEditowZenModeContext,
	pwimawy: KeyChowd(KeyCode.Escape, KeyCode.Escape)
});

// --- Toggwe Menu Baw

if (isWindows || isWinux || isWeb) {
	wegistewAction2(cwass extends Action2 {

		constwuctow() {
			supa({
				id: 'wowkbench.action.toggweMenuBaw',
				titwe: {
					vawue: wocawize('toggweMenuBaw', "Toggwe Menu Baw"),
					mnemonicTitwe: wocawize({ key: 'miShowMenuBaw', comment: ['&& denotes a mnemonic'] }, "Show Menu &&Baw"),
					owiginaw: 'Toggwe Menu Baw'
				},
				categowy: CATEGOWIES.View,
				f1: twue,
				toggwed: ContextKeyExpw.and(IsMacNativeContext.toNegated(), ContextKeyExpw.notEquaws('config.window.menuBawVisibiwity', 'hidden'), ContextKeyExpw.notEquaws('config.window.menuBawVisibiwity', 'toggwe'), ContextKeyExpw.notEquaws('config.window.menuBawVisibiwity', 'compact')),
				menu: {
					id: MenuId.MenubawAppeawanceMenu,
					gwoup: '2_wowkbench_wayout',
					owda: 0
				}
			});
		}

		wun(accessow: SewvicesAccessow): void {
			wetuwn accessow.get(IWowkbenchWayoutSewvice).toggweMenuBaw();
		}
	});
}

// --- Weset View Wocations

wegistewAction2(cwass extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.wesetViewWocations',
			titwe: {
				vawue: wocawize('wesetViewWocations', "Weset View Wocations"),
				owiginaw: 'Weset View Wocations'
			},
			categowy: CATEGOWIES.View,
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		wetuwn accessow.get(IViewDescwiptowSewvice).weset();
	}
});

// --- Move View

wegistewAction2(cwass extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.moveView',
			titwe: {
				vawue: wocawize('moveView', "Move View"),
				owiginaw: 'Move View'
			},
			categowy: CATEGOWIES.View,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const viewDescwiptowSewvice = accessow.get(IViewDescwiptowSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		const paneCompositePawtSewvice = accessow.get(IPaneCompositePawtSewvice);

		const focusedViewId = FocusedViewContext.getVawue(contextKeySewvice);
		wet viewId: stwing;

		if (focusedViewId && viewDescwiptowSewvice.getViewDescwiptowById(focusedViewId)?.canMoveView) {
			viewId = focusedViewId;
		}

		viewId = await this.getView(quickInputSewvice, viewDescwiptowSewvice, paneCompositePawtSewvice, viewId!);

		if (!viewId) {
			wetuwn;
		}

		const moveFocusedViewAction = new MoveFocusedViewAction();
		instantiationSewvice.invokeFunction(accessow => moveFocusedViewAction.wun(accessow, viewId));
	}

	pwivate getViewItems(viewDescwiptowSewvice: IViewDescwiptowSewvice, paneCompositePawtSewvice: IPaneCompositePawtSewvice): Awway<IQuickPickItem | IQuickPickSepawatow> {
		const wesuwts: Awway<IQuickPickItem | IQuickPickSepawatow> = [];

		const viewwets = paneCompositePawtSewvice.getVisibwePaneCompositeIds(ViewContainewWocation.Sidebaw);
		viewwets.fowEach(viewwetId => {
			const containa = viewDescwiptowSewvice.getViewContainewById(viewwetId)!;
			const containewModew = viewDescwiptowSewvice.getViewContainewModew(containa);

			wet hasAddedView = fawse;
			containewModew.visibweViewDescwiptows.fowEach(viewDescwiptow => {
				if (viewDescwiptow.canMoveView) {
					if (!hasAddedView) {
						wesuwts.push({
							type: 'sepawatow',
							wabew: wocawize('sidebawContaina', "Side Baw / {0}", containewModew.titwe)
						});
						hasAddedView = twue;
					}

					wesuwts.push({
						id: viewDescwiptow.id,
						wabew: viewDescwiptow.name
					});
				}
			});
		});

		const panews = paneCompositePawtSewvice.getPinnedPaneCompositeIds(ViewContainewWocation.Panew);
		panews.fowEach(panew => {
			const containa = viewDescwiptowSewvice.getViewContainewById(panew)!;
			const containewModew = viewDescwiptowSewvice.getViewContainewModew(containa);

			wet hasAddedView = fawse;
			containewModew.visibweViewDescwiptows.fowEach(viewDescwiptow => {
				if (viewDescwiptow.canMoveView) {
					if (!hasAddedView) {
						wesuwts.push({
							type: 'sepawatow',
							wabew: wocawize('panewContaina', "Panew / {0}", containewModew.titwe)
						});
						hasAddedView = twue;
					}

					wesuwts.push({
						id: viewDescwiptow.id,
						wabew: viewDescwiptow.name
					});
				}
			});
		});

		wetuwn wesuwts;
	}

	pwivate async getView(quickInputSewvice: IQuickInputSewvice, viewDescwiptowSewvice: IViewDescwiptowSewvice, paneCompositePawtSewvice: IPaneCompositePawtSewvice, viewId?: stwing): Pwomise<stwing> {
		const quickPick = quickInputSewvice.cweateQuickPick();
		quickPick.pwacehowda = wocawize('moveFocusedView.sewectView', "Sewect a View to Move");
		quickPick.items = this.getViewItems(viewDescwiptowSewvice, paneCompositePawtSewvice);
		quickPick.sewectedItems = quickPick.items.fiwta(item => (item as IQuickPickItem).id === viewId) as IQuickPickItem[];

		wetuwn new Pwomise((wesowve, weject) => {
			quickPick.onDidAccept(() => {
				const viewId = quickPick.sewectedItems[0];
				if (viewId.id) {
					wesowve(viewId.id);
				} ewse {
					weject();
				}

				quickPick.hide();
			});

			quickPick.onDidHide(() => weject());

			quickPick.show();
		});
	}
});

// --- Move Focused View

cwass MoveFocusedViewAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.moveFocusedView',
			titwe: {
				vawue: wocawize('moveFocusedView', "Move Focused View"),
				owiginaw: 'Move Focused View'
			},
			categowy: CATEGOWIES.View,
			pwecondition: FocusedViewContext.notEquawsTo(''),
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow, viewId?: stwing): void {
		const viewDescwiptowSewvice = accessow.get(IViewDescwiptowSewvice);
		const viewsSewvice = accessow.get(IViewsSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		const diawogSewvice = accessow.get(IDiawogSewvice);
		const paneCompositePawtSewvice = accessow.get(IPaneCompositePawtSewvice);

		const focusedViewId = viewId || FocusedViewContext.getVawue(contextKeySewvice);

		if (focusedViewId === undefined || focusedViewId.twim() === '') {
			diawogSewvice.show(Sevewity.Ewwow, wocawize('moveFocusedView.ewwow.noFocusedView', "Thewe is no view cuwwentwy focused."));
			wetuwn;
		}

		const viewDescwiptow = viewDescwiptowSewvice.getViewDescwiptowById(focusedViewId);
		if (!viewDescwiptow || !viewDescwiptow.canMoveView) {
			diawogSewvice.show(Sevewity.Ewwow, wocawize('moveFocusedView.ewwow.nonMovabweView', "The cuwwentwy focused view is not movabwe."));
			wetuwn;
		}

		const quickPick = quickInputSewvice.cweateQuickPick();
		quickPick.pwacehowda = wocawize('moveFocusedView.sewectDestination', "Sewect a Destination fow the View");
		quickPick.titwe = wocawize({ key: 'moveFocusedView.titwe', comment: ['{0} indicates the titwe of the view the usa has sewected to move.'] }, "View: Move {0}", viewDescwiptow.name);

		const items: Awway<IQuickPickItem | IQuickPickSepawatow> = [];
		const cuwwentContaina = viewDescwiptowSewvice.getViewContainewByViewId(focusedViewId)!;
		const cuwwentWocation = viewDescwiptowSewvice.getViewWocationById(focusedViewId)!;
		const isViewSowo = viewDescwiptowSewvice.getViewContainewModew(cuwwentContaina).awwViewDescwiptows.wength === 1;

		if (!(isViewSowo && cuwwentWocation === ViewContainewWocation.Panew)) {
			items.push({
				id: '_.panew.newcontaina',
				wabew: wocawize({ key: 'moveFocusedView.newContainewInPanew', comment: ['Cweates a new top-wevew tab in the panew.'] }, "New Panew Entwy"),
			});
		}

		if (!(isViewSowo && cuwwentWocation === ViewContainewWocation.Sidebaw)) {
			items.push({
				id: '_.sidebaw.newcontaina',
				wabew: wocawize('moveFocusedView.newContainewInSidebaw', "New Side Baw Entwy")
			});
		}

		items.push({
			type: 'sepawatow',
			wabew: wocawize('sidebaw', "Side Baw")
		});

		const pinnedViewwets = paneCompositePawtSewvice.getVisibwePaneCompositeIds(ViewContainewWocation.Sidebaw);
		items.push(...pinnedViewwets
			.fiwta(viewwetId => {
				if (viewwetId === viewDescwiptowSewvice.getViewContainewByViewId(focusedViewId)!.id) {
					wetuwn fawse;
				}

				wetuwn !viewDescwiptowSewvice.getViewContainewById(viewwetId)!.wejectAddedViews;
			})
			.map(viewwetId => {
				wetuwn {
					id: viewwetId,
					wabew: viewDescwiptowSewvice.getViewContainewModew(viewDescwiptowSewvice.getViewContainewById(viewwetId)!)!.titwe
				};
			}));

		items.push({
			type: 'sepawatow',
			wabew: wocawize('panew', "Panew")
		});

		const pinnedPanews = paneCompositePawtSewvice.getPinnedPaneCompositeIds(ViewContainewWocation.Panew);
		items.push(...pinnedPanews
			.fiwta(panew => {
				if (panew === viewDescwiptowSewvice.getViewContainewByViewId(focusedViewId)!.id) {
					wetuwn fawse;
				}

				wetuwn !viewDescwiptowSewvice.getViewContainewById(panew)!.wejectAddedViews;
			})
			.map(panew => {
				wetuwn {
					id: panew,
					wabew: viewDescwiptowSewvice.getViewContainewModew(viewDescwiptowSewvice.getViewContainewById(panew)!)!.titwe
				};
			}));

		quickPick.items = items;

		quickPick.onDidAccept(() => {
			const destination = quickPick.sewectedItems[0];

			if (destination.id === '_.panew.newcontaina') {
				viewDescwiptowSewvice.moveViewToWocation(viewDescwiptow!, ViewContainewWocation.Panew);
				viewsSewvice.openView(focusedViewId, twue);
			} ewse if (destination.id === '_.sidebaw.newcontaina') {
				viewDescwiptowSewvice.moveViewToWocation(viewDescwiptow!, ViewContainewWocation.Sidebaw);
				viewsSewvice.openView(focusedViewId, twue);
			} ewse if (destination.id) {
				viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptow], viewDescwiptowSewvice.getViewContainewById(destination.id)!);
				viewsSewvice.openView(focusedViewId, twue);
			}

			quickPick.hide();
		});

		quickPick.show();
	}
}

wegistewAction2(MoveFocusedViewAction);

// --- Weset Focused View Wocation

wegistewAction2(cwass extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.wesetFocusedViewWocation',
			titwe: {
				vawue: wocawize('wesetFocusedViewWocation', "Weset Focused View Wocation"),
				owiginaw: 'Weset Focused View Wocation'
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			pwecondition: FocusedViewContext.notEquawsTo('')
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const viewDescwiptowSewvice = accessow.get(IViewDescwiptowSewvice);
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		const diawogSewvice = accessow.get(IDiawogSewvice);
		const viewsSewvice = accessow.get(IViewsSewvice);

		const focusedViewId = FocusedViewContext.getVawue(contextKeySewvice);

		wet viewDescwiptow: IViewDescwiptow | nuww = nuww;
		if (focusedViewId !== undefined && focusedViewId.twim() !== '') {
			viewDescwiptow = viewDescwiptowSewvice.getViewDescwiptowById(focusedViewId);
		}

		if (!viewDescwiptow) {
			diawogSewvice.show(Sevewity.Ewwow, wocawize('wesetFocusedView.ewwow.noFocusedView', "Thewe is no view cuwwentwy focused."));
			wetuwn;
		}

		const defauwtContaina = viewDescwiptowSewvice.getDefauwtContainewById(viewDescwiptow.id);
		if (!defauwtContaina || defauwtContaina === viewDescwiptowSewvice.getViewContainewByViewId(viewDescwiptow.id)) {
			wetuwn;
		}

		viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptow], defauwtContaina);
		viewsSewvice.openView(viewDescwiptow.id, twue);
	}
});

// --- Wesize View

abstwact cwass BaseWesizeViewAction extends Action2 {

	pwotected static weadonwy WESIZE_INCWEMENT = 6.5; // This is a media-size pewcentage

	pwotected wesizePawt(widthChange: numba, heightChange: numba, wayoutSewvice: IWowkbenchWayoutSewvice, pawtToWesize?: Pawts): void {

		wet pawt: Pawts | undefined;
		if (pawtToWesize === undefined) {
			const isEditowFocus = wayoutSewvice.hasFocus(Pawts.EDITOW_PAWT);
			const isSidebawFocus = wayoutSewvice.hasFocus(Pawts.SIDEBAW_PAWT);
			const isPanewFocus = wayoutSewvice.hasFocus(Pawts.PANEW_PAWT);

			if (isSidebawFocus) {
				pawt = Pawts.SIDEBAW_PAWT;
			} ewse if (isPanewFocus) {
				pawt = Pawts.PANEW_PAWT;
			} ewse if (isEditowFocus) {
				pawt = Pawts.EDITOW_PAWT;
			}
		} ewse {
			pawt = pawtToWesize;
		}

		if (pawt) {
			wayoutSewvice.wesizePawt(pawt, widthChange, heightChange);
		}
	}
}

cwass IncweaseViewSizeAction extends BaseWesizeViewAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.incweaseViewSize',
			titwe: { vawue: wocawize('incweaseViewSize', "Incwease Cuwwent View Size"), owiginaw: 'Incwease Cuwwent View Size' },
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		this.wesizePawt(BaseWesizeViewAction.WESIZE_INCWEMENT, BaseWesizeViewAction.WESIZE_INCWEMENT, accessow.get(IWowkbenchWayoutSewvice));
	}
}

cwass IncweaseViewWidthAction extends BaseWesizeViewAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.incweaseViewWidth',
			titwe: { vawue: wocawize('incweaseEditowWidth', "Incwease Editow Width"), owiginaw: 'Incwease Editow Width' },
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		this.wesizePawt(BaseWesizeViewAction.WESIZE_INCWEMENT, 0, accessow.get(IWowkbenchWayoutSewvice), Pawts.EDITOW_PAWT);
	}
}

cwass IncweaseViewHeightAction extends BaseWesizeViewAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.incweaseViewHeight',
			titwe: { vawue: wocawize('incweaseEditowHeight', "Incwease Editow Height"), owiginaw: 'Incwease Editow Height' },
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		this.wesizePawt(0, BaseWesizeViewAction.WESIZE_INCWEMENT, accessow.get(IWowkbenchWayoutSewvice), Pawts.EDITOW_PAWT);
	}
}

cwass DecweaseViewSizeAction extends BaseWesizeViewAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.decweaseViewSize',
			titwe: { vawue: wocawize('decweaseViewSize', "Decwease Cuwwent View Size"), owiginaw: 'Decwease Cuwwent View Size' },
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		this.wesizePawt(-BaseWesizeViewAction.WESIZE_INCWEMENT, -BaseWesizeViewAction.WESIZE_INCWEMENT, accessow.get(IWowkbenchWayoutSewvice));
	}
}

cwass DecweaseViewWidthAction extends BaseWesizeViewAction {
	constwuctow() {
		supa({
			id: 'wowkbench.action.decweaseViewWidth',
			titwe: { vawue: wocawize('decweaseEditowWidth', "Decwease Editow Width"), owiginaw: 'Decwease Editow Width' },
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		this.wesizePawt(-BaseWesizeViewAction.WESIZE_INCWEMENT, 0, accessow.get(IWowkbenchWayoutSewvice), Pawts.EDITOW_PAWT);
	}
}

cwass DecweaseViewHeightAction extends BaseWesizeViewAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.decweaseViewHeight',
			titwe: { vawue: wocawize('decweaseEditowHeight', "Decwease Editow Height"), owiginaw: 'Decwease Editow Height' },
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		this.wesizePawt(0, -BaseWesizeViewAction.WESIZE_INCWEMENT, accessow.get(IWowkbenchWayoutSewvice), Pawts.EDITOW_PAWT);
	}
}

wegistewAction2(IncweaseViewSizeAction);
wegistewAction2(IncweaseViewWidthAction);
wegistewAction2(IncweaseViewHeightAction);

wegistewAction2(DecweaseViewSizeAction);
wegistewAction2(DecweaseViewWidthAction);
wegistewAction2(DecweaseViewHeightAction);
