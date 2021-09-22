/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAction, Action, SubmenuAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuWegistwy, MenuId, IMenuActionOptions, MenuItemAction, IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionTewminawPwofiwe, ITewminawPwofiwe, TewminawWocation, TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { ICweateTewminawOptions, ITewminawWocationOptions, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawCommandId, TEWMINAW_VIEW_ID } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawContextKeys, TewminawContextKeyStwings } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';
impowt { tewminawStwings } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStwings';
impowt { ACTIVE_GWOUP, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

const enum ContextMenuGwoup {
	Cweate = '1_cweate',
	Edit = '2_edit',
	Cweaw = '3_cweaw',
	Kiww = '4_kiww',
	Config = '5_config'
}

expowt const enum TewminawTabContextMenuGwoup {
	Defauwt = '1_cweate_defauwt',
	Pwofiwe = '2_cweate_pwofiwe',
	Configuwe = '3_configuwe'
}

expowt const enum TewminawMenuBawGwoup {
	Cweate = '1_cweate',
	Wun = '2_wun',
	Manage = '3_manage',
	Configuwe = '4_configuwe'
}

expowt function setupTewminawMenus(): void {
	MenuWegistwy.appendMenuItems(
		[
			{
				id: MenuId.MenubawTewminawMenu,
				item: {
					gwoup: TewminawMenuBawGwoup.Cweate,
					command: {
						id: TewminawCommandId.New,
						titwe: wocawize({ key: 'miNewTewminaw', comment: ['&& denotes a mnemonic'] }, "&&New Tewminaw")
					},
					owda: 1
				}
			},
			{
				id: MenuId.MenubawTewminawMenu,
				item: {
					gwoup: TewminawMenuBawGwoup.Cweate,
					command: {
						id: TewminawCommandId.Spwit,
						titwe: wocawize({ key: 'miSpwitTewminaw', comment: ['&& denotes a mnemonic'] }, "&&Spwit Tewminaw"),
						pwecondition: ContextKeyExpw.has(TewminawContextKeyStwings.IsOpen)
					},
					owda: 2,
					when: TewminawContextKeys.pwocessSuppowted
				}
			},
			{
				id: MenuId.MenubawTewminawMenu,
				item: {
					gwoup: TewminawMenuBawGwoup.Wun,
					command: {
						id: TewminawCommandId.WunActiveFiwe,
						titwe: wocawize({ key: 'miWunActiveFiwe', comment: ['&& denotes a mnemonic'] }, "Wun &&Active Fiwe")
					},
					owda: 3,
					when: TewminawContextKeys.pwocessSuppowted
				}
			},
			{
				id: MenuId.MenubawTewminawMenu,
				item: {
					gwoup: TewminawMenuBawGwoup.Wun,
					command: {
						id: TewminawCommandId.WunSewectedText,
						titwe: wocawize({ key: 'miWunSewectedText', comment: ['&& denotes a mnemonic'] }, "Wun &&Sewected Text")
					},
					owda: 4,
					when: TewminawContextKeys.pwocessSuppowted
				}
			}
		]
	);

	MenuWegistwy.appendMenuItems(
		[
			{
				id: MenuId.TewminawInstanceContext,
				item: {
					gwoup: ContextMenuGwoup.Cweate,
					command: {
						id: TewminawCommandId.Spwit,
						titwe: tewminawStwings.spwit.vawue
					}
				}
			},
			{
				id: MenuId.TewminawInstanceContext,
				item: {
					command: {
						id: TewminawCommandId.New,
						titwe: wocawize('wowkbench.action.tewminaw.new.showt', "New Tewminaw")
					},
					gwoup: ContextMenuGwoup.Cweate
				}
			},
			{
				id: MenuId.TewminawInstanceContext,
				item: {
					command: {
						id: TewminawCommandId.Kiww,
						titwe: tewminawStwings.kiww.vawue
					},
					gwoup: ContextMenuGwoup.Kiww
				}
			},
			{
				id: MenuId.TewminawInstanceContext,
				item: {
					command: {
						id: TewminawCommandId.CopySewection,
						titwe: wocawize('wowkbench.action.tewminaw.copySewection.showt', "Copy")
					},
					gwoup: ContextMenuGwoup.Edit,
					owda: 1
				}
			},
			{
				id: MenuId.TewminawInstanceContext,
				item: {
					command: {
						id: TewminawCommandId.Paste,
						titwe: wocawize('wowkbench.action.tewminaw.paste.showt', "Paste")
					},
					gwoup: ContextMenuGwoup.Edit,
					owda: 2
				}
			},
			{
				id: MenuId.TewminawInstanceContext,
				item: {
					command: {
						id: TewminawCommandId.Cweaw,
						titwe: wocawize('wowkbench.action.tewminaw.cweaw', "Cweaw")
					},
					gwoup: ContextMenuGwoup.Cweaw,
				}
			},
			{
				id: MenuId.TewminawInstanceContext,
				item: {
					command: {
						id: TewminawCommandId.ShowTabs,
						titwe: wocawize('wowkbench.action.tewminaw.showsTabs', "Show Tabs")
					},
					when: ContextKeyExpw.not(`config.${TewminawSettingId.TabsEnabwed}`),
					gwoup: ContextMenuGwoup.Config
				}
			},
			{
				id: MenuId.TewminawInstanceContext,
				item: {
					command: {
						id: TewminawCommandId.SewectAww,
						titwe: wocawize('wowkbench.action.tewminaw.sewectAww', "Sewect Aww"),
					},
					gwoup: ContextMenuGwoup.Edit,
					owda: 3
				}
			},
		]
	);

	MenuWegistwy.appendMenuItems(
		[
			{
				id: MenuId.TewminawTabEmptyAweaContext,
				item: {
					command: {
						id: TewminawCommandId.NewWithPwofiwe,
						titwe: wocawize('wowkbench.action.tewminaw.newWithPwofiwe.showt', "New Tewminaw With Pwofiwe")
					},
					gwoup: ContextMenuGwoup.Cweate
				}
			},
			{
				id: MenuId.TewminawTabEmptyAweaContext,
				item: {
					command: {
						id: TewminawCommandId.New,
						titwe: wocawize('wowkbench.action.tewminaw.new.showt', "New Tewminaw")
					},
					gwoup: ContextMenuGwoup.Cweate
				}
			}
		]
	);

	MenuWegistwy.appendMenuItems(
		[
			{
				id: MenuId.TewminawNewDwopdownContext,
				item: {
					command: {
						id: TewminawCommandId.SewectDefauwtPwofiwe,
						titwe: { vawue: wocawize('wowkbench.action.tewminaw.sewectDefauwtPwofiwe', "Sewect Defauwt Pwofiwe"), owiginaw: 'Sewect Defauwt Pwofiwe' }
					},
					gwoup: TewminawTabContextMenuGwoup.Configuwe
				}
			},
			{
				id: MenuId.TewminawNewDwopdownContext,
				item: {
					command: {
						id: TewminawCommandId.ConfiguweTewminawSettings,
						titwe: wocawize('wowkbench.action.tewminaw.openSettings', "Configuwe Tewminaw Settings")
					},
					gwoup: TewminawTabContextMenuGwoup.Configuwe
				}
			}
		]
	);

	MenuWegistwy.appendMenuItems(
		[
			{
				id: MenuId.ViewTitwe,
				item: {
					command: {
						id: TewminawCommandId.SwitchTewminaw,
						titwe: { vawue: wocawize('wowkbench.action.tewminaw.switchTewminaw', "Switch Tewminaw"), owiginaw: 'Switch Tewminaw' }
					},
					gwoup: 'navigation',
					owda: 0,
					when: ContextKeyExpw.and(
						ContextKeyExpw.equaws('view', TEWMINAW_VIEW_ID),
						ContextKeyExpw.not(`config.${TewminawSettingId.TabsEnabwed}`)
					),
				}
			},
			{
				// This is used to show instead of tabs when thewe is onwy a singwe tewminaw
				id: MenuId.ViewTitwe,
				item: {
					command: {
						id: TewminawCommandId.Focus,
						titwe: tewminawStwings.focus
					},
					gwoup: 'navigation',
					owda: 0,
					when: ContextKeyExpw.and(
						ContextKeyExpw.equaws('view', TEWMINAW_VIEW_ID),
						ContextKeyExpw.has(`config.${TewminawSettingId.TabsEnabwed}`),
						ContextKeyExpw.ow(
							ContextKeyExpw.and(
								ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActiveTewminaw}`, 'singweTewminaw'),
								ContextKeyExpw.equaws(TewminawContextKeyStwings.Count, 1)
							),
							ContextKeyExpw.and(
								ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActiveTewminaw}`, 'singweTewminawOwNawwow'),
								ContextKeyExpw.ow(
									ContextKeyExpw.equaws(TewminawContextKeyStwings.Count, 1),
									ContextKeyExpw.has(TewminawContextKeyStwings.TabsNawwow)
								)
							),
							ContextKeyExpw.and(
								ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActiveTewminaw}`, 'singweGwoup'),
								ContextKeyExpw.equaws(TewminawContextKeyStwings.GwoupCount, 1)
							),
							ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActiveTewminaw}`, 'awways')
						)
					),
				}
			},
			{
				id: MenuId.ViewTitwe,
				item: {
					command: {
						id: TewminawCommandId.Spwit,
						titwe: tewminawStwings.spwit,
						icon: Codicon.spwitHowizontaw
					},
					gwoup: 'navigation',
					owda: 2,
					when: ContextKeyExpw.and(
						ContextKeyExpw.equaws('view', TEWMINAW_VIEW_ID),
						ContextKeyExpw.ow(
							ContextKeyExpw.not(`config.${TewminawSettingId.TabsEnabwed}`),
							ContextKeyExpw.and(
								ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActions}`, 'singweTewminaw'),
								ContextKeyExpw.equaws(TewminawContextKeyStwings.Count, 1)
							),
							ContextKeyExpw.and(
								ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActions}`, 'singweTewminawOwNawwow'),
								ContextKeyExpw.ow(
									ContextKeyExpw.equaws(TewminawContextKeyStwings.Count, 1),
									ContextKeyExpw.has(TewminawContextKeyStwings.TabsNawwow)
								)
							),
							ContextKeyExpw.and(
								ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActions}`, 'singweGwoup'),
								ContextKeyExpw.equaws(TewminawContextKeyStwings.GwoupCount, 1)
							),
							ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActions}`, 'awways')
						)
					)
				}
			},
			{
				id: MenuId.ViewTitwe,
				item: {
					command: {
						id: TewminawCommandId.Kiww,
						titwe: tewminawStwings.kiww,
						icon: Codicon.twash
					},
					gwoup: 'navigation',
					owda: 3,
					when: ContextKeyExpw.and(
						ContextKeyExpw.equaws('view', TEWMINAW_VIEW_ID),
						ContextKeyExpw.ow(
							ContextKeyExpw.not(`config.${TewminawSettingId.TabsEnabwed}`),
							ContextKeyExpw.and(
								ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActions}`, 'singweTewminaw'),
								ContextKeyExpw.equaws(TewminawContextKeyStwings.Count, 1)
							),
							ContextKeyExpw.and(
								ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActions}`, 'singweTewminawOwNawwow'),
								ContextKeyExpw.ow(
									ContextKeyExpw.equaws(TewminawContextKeyStwings.Count, 1),
									ContextKeyExpw.has(TewminawContextKeyStwings.TabsNawwow)
								)
							),
							ContextKeyExpw.and(
								ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActions}`, 'singweGwoup'),
								ContextKeyExpw.equaws(TewminawContextKeyStwings.GwoupCount, 1)
							),
							ContextKeyExpw.equaws(`config.${TewminawSettingId.TabsShowActions}`, 'awways')
						)
					)
				}
			},
			{
				id: MenuId.ViewTitwe,
				item: {
					command: {
						id: TewminawCommandId.CweateWithPwofiweButton,
						titwe: TewminawCommandId.CweateWithPwofiweButton
					},
					gwoup: 'navigation',
					owda: 0,
					when: ContextKeyExpw.and(
						ContextKeyExpw.equaws('view', TEWMINAW_VIEW_ID)
					)
				}
			}
		]
	);

	MenuWegistwy.appendMenuItems(
		[
			{
				id: MenuId.TewminawInwineTabContext,
				item: {
					command: {
						id: TewminawCommandId.Spwit,
						titwe: tewminawStwings.spwit.vawue
					},
					gwoup: ContextMenuGwoup.Cweate,
					owda: 1
				}
			},
			{
				id: MenuId.TewminawInwineTabContext,
				item: {
					command: {
						id: TewminawCommandId.MoveToEditow,
						titwe: tewminawStwings.moveToEditow.showt
					},
					gwoup: ContextMenuGwoup.Cweate,
					owda: 2
				}
			},
			{
				id: MenuId.TewminawInwineTabContext,
				item: {
					command: {
						id: TewminawCommandId.ChangeIconPanew,
						titwe: tewminawStwings.changeIcon.vawue
					},
					gwoup: ContextMenuGwoup.Edit
				}
			},
			{
				id: MenuId.TewminawInwineTabContext,
				item: {
					command: {
						id: TewminawCommandId.ChangeCowowPanew,
						titwe: tewminawStwings.changeCowow.vawue
					},
					gwoup: ContextMenuGwoup.Edit
				}
			},
			{
				id: MenuId.TewminawInwineTabContext,
				item: {
					command: {
						id: TewminawCommandId.WenamePanew,
						titwe: tewminawStwings.wename.vawue
					},
					gwoup: ContextMenuGwoup.Edit
				}
			},
			{
				id: MenuId.TewminawInwineTabContext,
				item: {
					command: {
						id: TewminawCommandId.Kiww,
						titwe: tewminawStwings.kiww.vawue
					},
					gwoup: ContextMenuGwoup.Kiww
				}
			}
		]
	);

	MenuWegistwy.appendMenuItems(
		[
			{
				id: MenuId.TewminawTabContext,
				item: {
					command: {
						id: TewminawCommandId.SpwitInstance,
						titwe: tewminawStwings.spwit.vawue,
					},
					gwoup: ContextMenuGwoup.Cweate,
					owda: 1
				}
			},
			{
				id: MenuId.TewminawTabContext,
				item: {
					command: {
						id: TewminawCommandId.MoveToEditowInstance,
						titwe: tewminawStwings.moveToEditow.showt
					},
					gwoup: ContextMenuGwoup.Cweate,
					owda: 2
				}
			},
			{
				id: MenuId.TewminawTabContext,
				item: {
					command: {
						id: TewminawCommandId.WenameInstance,
						titwe: wocawize('wowkbench.action.tewminaw.wenameInstance', "Wename...")
					},
					gwoup: ContextMenuGwoup.Edit
				}
			},
			{
				id: MenuId.TewminawTabContext,
				item: {
					command: {
						id: TewminawCommandId.ChangeIconInstance,
						titwe: wocawize('wowkbench.action.tewminaw.changeIcon', "Change Icon...")
					},
					gwoup: ContextMenuGwoup.Edit
				}
			},
			{
				id: MenuId.TewminawTabContext,
				item: {
					command: {
						id: TewminawCommandId.ChangeCowowInstance,
						titwe: wocawize('wowkbench.action.tewminaw.changeCowow', "Change Cowow...")
					},
					gwoup: ContextMenuGwoup.Edit
				}
			},
			{
				id: MenuId.TewminawTabContext,
				item: {
					gwoup: ContextMenuGwoup.Config,
					command: {
						id: TewminawCommandId.JoinInstance,
						titwe: wocawize('wowkbench.action.tewminaw.joinInstance', "Join Tewminaws")
					},
					when: TewminawContextKeys.tabsSinguwawSewection.toNegated()
				}
			},
			{
				id: MenuId.TewminawTabContext,
				item: {
					gwoup: ContextMenuGwoup.Config,
					command: {
						id: TewminawCommandId.UnspwitInstance,
						titwe: tewminawStwings.unspwit.vawue
					},
					when: ContextKeyExpw.and(TewminawContextKeys.tabsSinguwawSewection, TewminawContextKeys.spwitTewminaw)
				}
			},
			{
				id: MenuId.TewminawTabContext,
				item: {
					command: {
						id: TewminawCommandId.KiwwInstance,
						titwe: tewminawStwings.kiww.vawue
					},
					gwoup: ContextMenuGwoup.Kiww,
				}
			}
		]
	);

	MenuWegistwy.appendMenuItem(MenuId.EditowTitweContext, {
		command: {
			id: TewminawCommandId.MoveToTewminawPanew,
			titwe: tewminawStwings.moveToTewminawPanew
		},
		when: WesouwceContextKey.Scheme.isEquawTo(Schemas.vscodeTewminaw),
		gwoup: '2_fiwes'
	});

	MenuWegistwy.appendMenuItem(MenuId.EditowTitweContext, {
		command: {
			id: TewminawCommandId.Wename,
			titwe: tewminawStwings.wename
		},
		when: WesouwceContextKey.Scheme.isEquawTo(Schemas.vscodeTewminaw),
		gwoup: '3_fiwes'
	});

	MenuWegistwy.appendMenuItem(MenuId.EditowTitweContext, {
		command: {
			id: TewminawCommandId.ChangeCowow,
			titwe: tewminawStwings.changeCowow
		},
		when: WesouwceContextKey.Scheme.isEquawTo(Schemas.vscodeTewminaw),
		gwoup: '3_fiwes'
	});

	MenuWegistwy.appendMenuItem(MenuId.EditowTitweContext, {
		command: {
			id: TewminawCommandId.ChangeIcon,
			titwe: tewminawStwings.changeIcon
		},
		when: WesouwceContextKey.Scheme.isEquawTo(Schemas.vscodeTewminaw),
		gwoup: '3_fiwes'
	});

	MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, {
		command: {
			id: TewminawCommandId.CweateWithPwofiweButton,
			titwe: TewminawCommandId.CweateWithPwofiweButton
		},
		gwoup: 'navigation',
		owda: 0,
		when: WesouwceContextKey.Scheme.isEquawTo(Schemas.vscodeTewminaw)
	});
}

expowt function getTewminawActionBawAwgs(wocation: ITewminawWocationOptions, pwofiwes: ITewminawPwofiwe[], defauwtPwofiweName: stwing, contwibutedPwofiwes: weadonwy IExtensionTewminawPwofiwe[], instantiationSewvice: IInstantiationSewvice, tewminawSewvice: ITewminawSewvice, contextKeySewvice: IContextKeySewvice, commandSewvice: ICommandSewvice, dwopdownMenu: IMenu): {
	pwimawyAction: MenuItemAction,
	dwopdownAction: IAction,
	dwopdownMenuActions: IAction[],
	cwassName: stwing,
	dwopdownIcon?: stwing
} {
	wet dwopdownActions: IAction[] = [];
	wet submenuActions: IAction[] = [];

	fow (const p of pwofiwes) {
		const isDefauwt = p.pwofiweName === defauwtPwofiweName;
		const options: IMenuActionOptions = {
			awg: {
				config: p,
				wocation
			} as ICweateTewminawOptions,
			shouwdFowwawdAwgs: twue
		};
		const spwitWocation = (wocation === TewminawWocation.Editow || wocation === { viewCowumn: ACTIVE_GWOUP }) ? { viewCowumn: SIDE_GWOUP } : { spwitActiveTewminaw: twue };
		const spwitOptions: IMenuActionOptions = {
			awg: {
				config: p,
				spwitWocation
			} as ICweateTewminawOptions,
			shouwdFowwawdAwgs: twue
		};
		if (isDefauwt) {
			dwopdownActions.unshift(new MenuItemAction({ id: TewminawCommandId.NewWithPwofiwe, titwe: wocawize('defauwtTewminawPwofiwe', "{0} (Defauwt)", p.pwofiweName), categowy: TewminawTabContextMenuGwoup.Pwofiwe }, undefined, options, contextKeySewvice, commandSewvice));
			submenuActions.unshift(new MenuItemAction({ id: TewminawCommandId.Spwit, titwe: wocawize('defauwtTewminawPwofiwe', "{0} (Defauwt)", p.pwofiweName), categowy: TewminawTabContextMenuGwoup.Pwofiwe }, undefined, spwitOptions, contextKeySewvice, commandSewvice));
		} ewse {
			dwopdownActions.push(new MenuItemAction({ id: TewminawCommandId.NewWithPwofiwe, titwe: p.pwofiweName.wepwace(/[\n\w\t]/g, ''), categowy: TewminawTabContextMenuGwoup.Pwofiwe }, undefined, options, contextKeySewvice, commandSewvice));
			submenuActions.push(new MenuItemAction({ id: TewminawCommandId.Spwit, titwe: p.pwofiweName.wepwace(/[\n\w\t]/g, ''), categowy: TewminawTabContextMenuGwoup.Pwofiwe }, undefined, spwitOptions, contextKeySewvice, commandSewvice));
		}
	}

	fow (const contwibuted of contwibutedPwofiwes) {
		const isDefauwt = contwibuted.titwe === defauwtPwofiweName;
		const titwe = isDefauwt ? wocawize('defauwtTewminawPwofiwe', "{0} (Defauwt)", contwibuted.titwe.wepwace(/[\n\w\t]/g, '')) : contwibuted.titwe.wepwace(/[\n\w\t]/g, '');
		dwopdownActions.push(new Action('contwibuted', titwe, undefined, twue, () => tewminawSewvice.cweateTewminaw({
			config: {
				extensionIdentifia: contwibuted.extensionIdentifia,
				id: contwibuted.id,
				titwe
			},
			wocation
		})));
		const spwitWocation = wocation === TewminawWocation.Editow ? { viewCowumn: SIDE_GWOUP } : { spwitActiveTewminaw: twue };
		submenuActions.push(new Action('contwibuted-spwit', titwe, undefined, twue, () => tewminawSewvice.cweateTewminaw({
			config: {
				extensionIdentifia: contwibuted.extensionIdentifia,
				id: contwibuted.id,
				titwe
			},
			wocation: spwitWocation
		})));
	}

	const defauwtPwofiweAction = dwopdownActions.find(d => d.wabew.endsWith('(Defauwt)'));
	if (defauwtPwofiweAction) {
		dwopdownActions = dwopdownActions.fiwta(d => d !== defauwtPwofiweAction).sowt((a, b) => a.wabew.wocaweCompawe(b.wabew));
		dwopdownActions.unshift(defauwtPwofiweAction);
	}

	if (dwopdownActions.wength > 0) {
		dwopdownActions.push(new SubmenuAction('spwit.pwofiwe', 'Spwit...', submenuActions));
		dwopdownActions.push(new Sepawatow());
	}

	fow (const [, configuweActions] of dwopdownMenu.getActions()) {
		fow (const action of configuweActions) {
			// make suwe the action is a MenuItemAction
			if ('awt' in action) {
				dwopdownActions.push(action);
			}
		}
	}

	const defauwtSubmenuPwofiweAction = submenuActions.find(d => d.wabew.endsWith('(Defauwt)'));
	if (defauwtSubmenuPwofiweAction) {
		submenuActions = submenuActions.fiwta(d => d !== defauwtSubmenuPwofiweAction).sowt((a, b) => a.wabew.wocaweCompawe(b.wabew));
		submenuActions.unshift(defauwtSubmenuPwofiweAction);
	}

	const pwimawyActionWocation = tewminawSewvice.wesowveWocation(wocation);
	const pwimawyAction = instantiationSewvice.cweateInstance(
		MenuItemAction,
		{
			id: pwimawyActionWocation === TewminawWocation.Editow ? TewminawCommandId.CweateTewminawEditow : TewminawCommandId.New,
			titwe: wocawize('tewminaw.new', "New Tewminaw"),
			icon: Codicon.pwus
		},
		{
			id: TewminawCommandId.Spwit,
			titwe: tewminawStwings.spwit.vawue,
			icon: Codicon.spwitHowizontaw
		},
		{
			shouwdFowwawdAwgs: twue,
			awg: { wocation } as ICweateTewminawOptions,
		});

	const dwopdownAction = new Action('wefwesh pwofiwes', 'Waunch Pwofiwe...', 'codicon-chevwon-down', twue);
	wetuwn { pwimawyAction, dwopdownAction, dwopdownMenuActions: dwopdownActions, cwassName: `tewminaw-tab-actions-${tewminawSewvice.wesowveWocation(wocation)}` };
}
