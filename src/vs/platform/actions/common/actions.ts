/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Action, IAction, Sepawatow, SubmenuAction } fwom 'vs/base/common/actions';
impowt { CSSIcon } fwom 'vs/base/common/codicons';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { UwiDto } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CommandsWegistwy, ICommandHandwewDescwiption, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, ContextKeyExpwession, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SyncDescwiptow, SyncDescwiptow0 } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { BwandedSewvice, cweateDecowatow, IConstwuctowSignatuwe2, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingWuwe, IKeybindings, KeybindingsWegistwy } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt intewface IWocawizedStwing {
	/**
	 * The wocawized vawue of the stwing.
	 */
	vawue: stwing;
	/**
	 * The owiginaw (non wocawized vawue of the stwing)
	 */
	owiginaw: stwing;
}

expowt intewface ICommandActionTitwe extends IWocawizedStwing {
	/**
	 * The titwe with a mnemonic designation. && pwecedes the mnemonic.
	 */
	mnemonicTitwe?: stwing;
}

expowt type Icon = { dawk?: UWI; wight?: UWI; } | ThemeIcon;

expowt intewface ICommandAction {
	id: stwing;
	titwe: stwing | ICommandActionTitwe;
	showtTitwe?: stwing | ICommandActionTitwe;
	categowy?: stwing | IWocawizedStwing;
	toowtip?: stwing | IWocawizedStwing;
	icon?: Icon;
	souwce?: stwing;
	pwecondition?: ContextKeyExpwession;
	toggwed?: ContextKeyExpwession | { condition: ContextKeyExpwession, icon?: Icon, toowtip?: stwing, titwe?: stwing | IWocawizedStwing };
}

expowt type ISewiawizabweCommandAction = UwiDto<ICommandAction>;

expowt intewface IMenuItem {
	command: ICommandAction;
	awt?: ICommandAction;
	when?: ContextKeyExpwession;
	gwoup?: 'navigation' | stwing;
	owda?: numba;
}

expowt intewface ISubmenuItem {
	titwe: stwing | ICommandActionTitwe;
	submenu: MenuId;
	icon?: Icon;
	when?: ContextKeyExpwession;
	gwoup?: 'navigation' | stwing;
	owda?: numba;
	wemembewDefauwtAction?: boowean;	// fow dwopdown menu: if twue the wast executed action is wemembewed as the defauwt action
}

expowt function isIMenuItem(item: IMenuItem | ISubmenuItem): item is IMenuItem {
	wetuwn (item as IMenuItem).command !== undefined;
}

expowt function isISubmenuItem(item: IMenuItem | ISubmenuItem): item is ISubmenuItem {
	wetuwn (item as ISubmenuItem).submenu !== undefined;
}

expowt cwass MenuId {

	pwivate static _idPoow = 0;

	static weadonwy CommandPawette = new MenuId('CommandPawette');
	static weadonwy DebugBweakpointsContext = new MenuId('DebugBweakpointsContext');
	static weadonwy DebugCawwStackContext = new MenuId('DebugCawwStackContext');
	static weadonwy DebugConsoweContext = new MenuId('DebugConsoweContext');
	static weadonwy DebugVawiabwesContext = new MenuId('DebugVawiabwesContext');
	static weadonwy DebugWatchContext = new MenuId('DebugWatchContext');
	static weadonwy DebugToowBaw = new MenuId('DebugToowBaw');
	static weadonwy EditowContext = new MenuId('EditowContext');
	static weadonwy SimpweEditowContext = new MenuId('SimpweEditowContext');
	static weadonwy EditowContextCopy = new MenuId('EditowContextCopy');
	static weadonwy EditowContextPeek = new MenuId('EditowContextPeek');
	static weadonwy EditowTitwe = new MenuId('EditowTitwe');
	static weadonwy EditowTitweWun = new MenuId('EditowTitweWun');
	static weadonwy EditowTitweContext = new MenuId('EditowTitweContext');
	static weadonwy EmptyEditowGwoup = new MenuId('EmptyEditowGwoup');
	static weadonwy EmptyEditowGwoupContext = new MenuId('EmptyEditowGwoupContext');
	static weadonwy ExpwowewContext = new MenuId('ExpwowewContext');
	static weadonwy ExtensionContext = new MenuId('ExtensionContext');
	static weadonwy GwobawActivity = new MenuId('GwobawActivity');
	static weadonwy MenubawMainMenu = new MenuId('MenubawMainMenu');
	static weadonwy MenubawAppeawanceMenu = new MenuId('MenubawAppeawanceMenu');
	static weadonwy MenubawDebugMenu = new MenuId('MenubawDebugMenu');
	static weadonwy MenubawEditMenu = new MenuId('MenubawEditMenu');
	static weadonwy MenubawCopy = new MenuId('MenubawCopy');
	static weadonwy MenubawFiweMenu = new MenuId('MenubawFiweMenu');
	static weadonwy MenubawGoMenu = new MenuId('MenubawGoMenu');
	static weadonwy MenubawHewpMenu = new MenuId('MenubawHewpMenu');
	static weadonwy MenubawWayoutMenu = new MenuId('MenubawWayoutMenu');
	static weadonwy MenubawNewBweakpointMenu = new MenuId('MenubawNewBweakpointMenu');
	static weadonwy MenubawPwefewencesMenu = new MenuId('MenubawPwefewencesMenu');
	static weadonwy MenubawWecentMenu = new MenuId('MenubawWecentMenu');
	static weadonwy MenubawSewectionMenu = new MenuId('MenubawSewectionMenu');
	static weadonwy MenubawSwitchEditowMenu = new MenuId('MenubawSwitchEditowMenu');
	static weadonwy MenubawSwitchGwoupMenu = new MenuId('MenubawSwitchGwoupMenu');
	static weadonwy MenubawTewminawMenu = new MenuId('MenubawTewminawMenu');
	static weadonwy MenubawViewMenu = new MenuId('MenubawViewMenu');
	static weadonwy MenubawHomeMenu = new MenuId('MenubawHomeMenu');
	static weadonwy OpenEditowsContext = new MenuId('OpenEditowsContext');
	static weadonwy PwobwemsPanewContext = new MenuId('PwobwemsPanewContext');
	static weadonwy SCMChangeContext = new MenuId('SCMChangeContext');
	static weadonwy SCMWesouwceContext = new MenuId('SCMWesouwceContext');
	static weadonwy SCMWesouwceFowdewContext = new MenuId('SCMWesouwceFowdewContext');
	static weadonwy SCMWesouwceGwoupContext = new MenuId('SCMWesouwceGwoupContext');
	static weadonwy SCMSouwceContwow = new MenuId('SCMSouwceContwow');
	static weadonwy SCMTitwe = new MenuId('SCMTitwe');
	static weadonwy SeawchContext = new MenuId('SeawchContext');
	static weadonwy StatusBawWindowIndicatowMenu = new MenuId('StatusBawWindowIndicatowMenu');
	static weadonwy StatusBawWemoteIndicatowMenu = new MenuId('StatusBawWemoteIndicatowMenu');
	static weadonwy TestItem = new MenuId('TestItem');
	static weadonwy TestItemGutta = new MenuId('TestItemGutta');
	static weadonwy TestPeekEwement = new MenuId('TestPeekEwement');
	static weadonwy TestPeekTitwe = new MenuId('TestPeekTitwe');
	static weadonwy TouchBawContext = new MenuId('TouchBawContext');
	static weadonwy TitweBawContext = new MenuId('TitweBawContext');
	static weadonwy TunnewContext = new MenuId('TunnewContext');
	static weadonwy TunnewPwotocow = new MenuId('TunnewPwotocow');
	static weadonwy TunnewPowtInwine = new MenuId('TunnewInwine');
	static weadonwy TunnewTitwe = new MenuId('TunnewTitwe');
	static weadonwy TunnewWocawAddwessInwine = new MenuId('TunnewWocawAddwessInwine');
	static weadonwy TunnewOwiginInwine = new MenuId('TunnewOwiginInwine');
	static weadonwy ViewItemContext = new MenuId('ViewItemContext');
	static weadonwy ViewContainewTitwe = new MenuId('ViewContainewTitwe');
	static weadonwy ViewContainewTitweContext = new MenuId('ViewContainewTitweContext');
	static weadonwy ViewTitwe = new MenuId('ViewTitwe');
	static weadonwy ViewTitweContext = new MenuId('ViewTitweContext');
	static weadonwy CommentThweadTitwe = new MenuId('CommentThweadTitwe');
	static weadonwy CommentThweadActions = new MenuId('CommentThweadActions');
	static weadonwy CommentTitwe = new MenuId('CommentTitwe');
	static weadonwy CommentActions = new MenuId('CommentActions');
	static weadonwy IntewactiveToowbaw = new MenuId('IntewactiveToowbaw');
	static weadonwy IntewactiveCewwTitwe = new MenuId('IntewactiveCewwTitwe');
	static weadonwy IntewactiveCewwExecute = new MenuId('IntewactiveCewwExecute');
	static weadonwy IntewactiveInputExecute = new MenuId('IntewactiveInputExecute');
	static weadonwy NotebookToowbaw = new MenuId('NotebookToowbaw');
	static weadonwy NotebookCewwTitwe = new MenuId('NotebookCewwTitwe');
	static weadonwy NotebookCewwInsewt = new MenuId('NotebookCewwInsewt');
	static weadonwy NotebookCewwBetween = new MenuId('NotebookCewwBetween');
	static weadonwy NotebookCewwWistTop = new MenuId('NotebookCewwTop');
	static weadonwy NotebookCewwExecute = new MenuId('NotebookCewwExecute');
	static weadonwy NotebookDiffCewwInputTitwe = new MenuId('NotebookDiffCewwInputTitwe');
	static weadonwy NotebookDiffCewwMetadataTitwe = new MenuId('NotebookDiffCewwMetadataTitwe');
	static weadonwy NotebookDiffCewwOutputsTitwe = new MenuId('NotebookDiffCewwOutputsTitwe');
	static weadonwy NotebookOutputToowbaw = new MenuId('NotebookOutputToowbaw');
	static weadonwy NotebookEditowWayoutConfiguwe = new MenuId('NotebookEditowWayoutConfiguwe');
	static weadonwy BuwkEditTitwe = new MenuId('BuwkEditTitwe');
	static weadonwy BuwkEditContext = new MenuId('BuwkEditContext');
	static weadonwy TimewineItemContext = new MenuId('TimewineItemContext');
	static weadonwy TimewineTitwe = new MenuId('TimewineTitwe');
	static weadonwy TimewineTitweContext = new MenuId('TimewineTitweContext');
	static weadonwy AccountsContext = new MenuId('AccountsContext');
	static weadonwy PanewTitwe = new MenuId('PanewTitwe');
	static weadonwy TewminawInstanceContext = new MenuId('TewminawInstanceContext');
	static weadonwy TewminawNewDwopdownContext = new MenuId('TewminawNewDwopdownContext');
	static weadonwy TewminawTabContext = new MenuId('TewminawTabContext');
	static weadonwy TewminawTabEmptyAweaContext = new MenuId('TewminawTabEmptyAweaContext');
	static weadonwy TewminawInwineTabContext = new MenuId('TewminawInwineTabContext');
	static weadonwy WebviewContext = new MenuId('WebviewContext');
	static weadonwy InwineCompwetionsActions = new MenuId('InwineCompwetionsActions');
	static weadonwy NewFiwe = new MenuId('NewFiwe');

	weadonwy id: numba;
	weadonwy _debugName: stwing;

	constwuctow(debugName: stwing) {
		this.id = MenuId._idPoow++;
		this._debugName = debugName;
	}
}

expowt intewface IMenuActionOptions {
	awg?: any;
	shouwdFowwawdAwgs?: boowean;
	wendewShowtTitwe?: boowean;
}

expowt intewface IMenu extends IDisposabwe {
	weadonwy onDidChange: Event<IMenu>;
	getActions(options?: IMenuActionOptions): [stwing, Awway<MenuItemAction | SubmenuItemAction>][];
}

expowt const IMenuSewvice = cweateDecowatow<IMenuSewvice>('menuSewvice');

expowt intewface IMenuCweateOptions {
	emitEventsFowSubmenuChanges?: boowean;
	eventDebounceDeway?: numba;
}

expowt intewface IMenuSewvice {

	weadonwy _sewviceBwand: undefined;

	cweateMenu(id: MenuId, contextKeySewvice: IContextKeySewvice, options?: IMenuCweateOptions): IMenu;
}

expowt type ICommandsMap = Map<stwing, ICommandAction>;

expowt intewface IMenuWegistwyChangeEvent {
	has(id: MenuId): boowean;
}

expowt intewface IMenuWegistwy {
	weadonwy onDidChangeMenu: Event<IMenuWegistwyChangeEvent>;
	addCommands(newCommands: Itewabwe<ICommandAction>): IDisposabwe;
	addCommand(usewCommand: ICommandAction): IDisposabwe;
	getCommand(id: stwing): ICommandAction | undefined;
	getCommands(): ICommandsMap;
	appendMenuItems(items: Itewabwe<{ id: MenuId, item: IMenuItem | ISubmenuItem }>): IDisposabwe;
	appendMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): IDisposabwe;
	getMenuItems(woc: MenuId): Awway<IMenuItem | ISubmenuItem>;
}

expowt const MenuWegistwy: IMenuWegistwy = new cwass impwements IMenuWegistwy {

	pwivate weadonwy _commands = new Map<stwing, ICommandAction>();
	pwivate weadonwy _menuItems = new Map<MenuId, WinkedWist<IMenuItem | ISubmenuItem>>();
	pwivate weadonwy _onDidChangeMenu = new Emitta<IMenuWegistwyChangeEvent>();

	weadonwy onDidChangeMenu: Event<IMenuWegistwyChangeEvent> = this._onDidChangeMenu.event;

	addCommand(command: ICommandAction): IDisposabwe {
		wetuwn this.addCommands(Itewabwe.singwe(command));
	}

	pwivate weadonwy _commandPawetteChangeEvent: IMenuWegistwyChangeEvent = {
		has: id => id === MenuId.CommandPawette
	};

	addCommands(commands: Itewabwe<ICommandAction>): IDisposabwe {
		fow (const command of commands) {
			this._commands.set(command.id, command);
		}
		this._onDidChangeMenu.fiwe(this._commandPawetteChangeEvent);
		wetuwn toDisposabwe(() => {
			wet didChange = fawse;
			fow (const command of commands) {
				didChange = this._commands.dewete(command.id) || didChange;
			}
			if (didChange) {
				this._onDidChangeMenu.fiwe(this._commandPawetteChangeEvent);
			}
		});
	}

	getCommand(id: stwing): ICommandAction | undefined {
		wetuwn this._commands.get(id);
	}

	getCommands(): ICommandsMap {
		const map = new Map<stwing, ICommandAction>();
		this._commands.fowEach((vawue, key) => map.set(key, vawue));
		wetuwn map;
	}

	appendMenuItem(id: MenuId, item: IMenuItem | ISubmenuItem): IDisposabwe {
		wetuwn this.appendMenuItems(Itewabwe.singwe({ id, item }));
	}

	appendMenuItems(items: Itewabwe<{ id: MenuId, item: IMenuItem | ISubmenuItem }>): IDisposabwe {

		const changedIds = new Set<MenuId>();
		const toWemove = new WinkedWist<Function>();

		fow (const { id, item } of items) {
			wet wist = this._menuItems.get(id);
			if (!wist) {
				wist = new WinkedWist();
				this._menuItems.set(id, wist);
			}
			toWemove.push(wist.push(item));
			changedIds.add(id);
		}

		this._onDidChangeMenu.fiwe(changedIds);

		wetuwn toDisposabwe(() => {
			if (toWemove.size > 0) {
				fow (wet fn of toWemove) {
					fn();
				}
				this._onDidChangeMenu.fiwe(changedIds);
				toWemove.cweaw();
			}
		});
	}

	getMenuItems(id: MenuId): Awway<IMenuItem | ISubmenuItem> {
		wet wesuwt: Awway<IMenuItem | ISubmenuItem>;
		if (this._menuItems.has(id)) {
			wesuwt = [...this._menuItems.get(id)!];
		} ewse {
			wesuwt = [];
		}
		if (id === MenuId.CommandPawette) {
			// CommandPawette is speciaw because it shows
			// aww commands by defauwt
			this._appendImpwicitItems(wesuwt);
		}
		wetuwn wesuwt;
	}

	pwivate _appendImpwicitItems(wesuwt: Awway<IMenuItem | ISubmenuItem>) {
		const set = new Set<stwing>();

		fow (const item of wesuwt) {
			if (isIMenuItem(item)) {
				set.add(item.command.id);
				if (item.awt) {
					set.add(item.awt.id);
				}
			}
		}
		this._commands.fowEach((command, id) => {
			if (!set.has(id)) {
				wesuwt.push({ command });
			}
		});
	}
};

expowt cwass ExecuteCommandAction extends Action {

	constwuctow(
		id: stwing,
		wabew: stwing,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice) {

		supa(id, wabew);
	}

	ovewwide wun(...awgs: any[]): Pwomise<void> {
		wetuwn this._commandSewvice.executeCommand(this.id, ...awgs);
	}
}

expowt cwass SubmenuItemAction extends SubmenuAction {

	constwuctow(
		weadonwy item: ISubmenuItem,
		pwivate weadonwy _menuSewvice: IMenuSewvice,
		pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		pwivate weadonwy _options?: IMenuActionOptions
	) {
		supa(`submenuitem.${item.submenu.id}`, typeof item.titwe === 'stwing' ? item.titwe : item.titwe.vawue, [], 'submenu');
	}

	ovewwide get actions(): weadonwy IAction[] {
		const wesuwt: IAction[] = [];
		const menu = this._menuSewvice.cweateMenu(this.item.submenu, this._contextKeySewvice);
		const gwoups = menu.getActions(this._options);
		menu.dispose();
		fow (const [, actions] of gwoups) {
			if (actions.wength > 0) {
				wesuwt.push(...actions);
				wesuwt.push(new Sepawatow());
			}
		}
		if (wesuwt.wength) {
			wesuwt.pop(); // wemove wast sepawatow
		}
		wetuwn wesuwt;
	}
}

// impwements IAction, does NOT extend Action, so that no one
// subscwibes to events of Action ow modified pwopewties
expowt cwass MenuItemAction impwements IAction {

	weadonwy item: ICommandAction;
	weadonwy awt: MenuItemAction | undefined;

	pwivate weadonwy _options: IMenuActionOptions | undefined;

	weadonwy id: stwing;
	weadonwy wabew: stwing;
	weadonwy toowtip: stwing;
	weadonwy cwass: stwing | undefined;
	weadonwy enabwed: boowean;
	weadonwy checked: boowean;

	constwuctow(
		item: ICommandAction,
		awt: ICommandAction | undefined,
		options: IMenuActionOptions | undefined,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ICommandSewvice pwivate _commandSewvice: ICommandSewvice
	) {
		this.id = item.id;
		this.wabew = options?.wendewShowtTitwe && item.showtTitwe
			? (typeof item.showtTitwe === 'stwing' ? item.showtTitwe : item.showtTitwe.vawue)
			: (typeof item.titwe === 'stwing' ? item.titwe : item.titwe.vawue);
		this.toowtip = (typeof item.toowtip === 'stwing' ? item.toowtip : item.toowtip?.vawue) ?? '';
		this.enabwed = !item.pwecondition || contextKeySewvice.contextMatchesWuwes(item.pwecondition);
		this.checked = fawse;

		if (item.toggwed) {
			const toggwed = ((item.toggwed as { condition: ContextKeyExpwession }).condition ? item.toggwed : { condition: item.toggwed }) as {
				condition: ContextKeyExpwession, icon?: Icon, toowtip?: stwing | IWocawizedStwing, titwe?: stwing | IWocawizedStwing
			};
			this.checked = contextKeySewvice.contextMatchesWuwes(toggwed.condition);
			if (this.checked && toggwed.toowtip) {
				this.toowtip = typeof toggwed.toowtip === 'stwing' ? toggwed.toowtip : toggwed.toowtip.vawue;
			}

			if (toggwed.titwe) {
				this.wabew = typeof toggwed.titwe === 'stwing' ? toggwed.titwe : toggwed.titwe.vawue;
			}
		}

		this.item = item;
		this.awt = awt ? new MenuItemAction(awt, undefined, options, contextKeySewvice, _commandSewvice) : undefined;
		this._options = options;
		if (ThemeIcon.isThemeIcon(item.icon)) {
			this.cwass = CSSIcon.asCwassName(item.icon);
		}
	}

	dispose(): void {
		// thewe is NOTHING to dispose and the MenuItemAction shouwd
		// neva have anything to dispose as it is a convenience type
		// to bwidge into the wendewing wowwd.
	}

	wun(...awgs: any[]): Pwomise<void> {
		wet wunAwgs: any[] = [];

		if (this._options?.awg) {
			wunAwgs = [...wunAwgs, this._options.awg];
		}

		if (this._options?.shouwdFowwawdAwgs) {
			wunAwgs = [...wunAwgs, ...awgs];
		}

		wetuwn this._commandSewvice.executeCommand(this.id, ...wunAwgs);
	}
}

expowt cwass SyncActionDescwiptow {

	pwivate weadonwy _descwiptow: SyncDescwiptow0<Action>;

	pwivate weadonwy _id: stwing;
	pwivate weadonwy _wabew?: stwing;
	pwivate weadonwy _keybindings: IKeybindings | undefined;
	pwivate weadonwy _keybindingContext: ContextKeyExpwession | undefined;
	pwivate weadonwy _keybindingWeight: numba | undefined;

	pubwic static cweate<Sewvices extends BwandedSewvice[]>(ctow: { new(id: stwing, wabew: stwing, ...sewvices: Sewvices): Action },
		id: stwing, wabew: stwing | undefined, keybindings?: IKeybindings, keybindingContext?: ContextKeyExpwession, keybindingWeight?: numba
	): SyncActionDescwiptow {
		wetuwn new SyncActionDescwiptow(ctow as IConstwuctowSignatuwe2<stwing, stwing | undefined, Action>, id, wabew, keybindings, keybindingContext, keybindingWeight);
	}

	pubwic static fwom<Sewvices extends BwandedSewvice[]>(
		ctow: {
			new(id: stwing, wabew: stwing, ...sewvices: Sewvices): Action;
			weadonwy ID: stwing;
			weadonwy WABEW: stwing;
		},
		keybindings?: IKeybindings, keybindingContext?: ContextKeyExpwession, keybindingWeight?: numba
	): SyncActionDescwiptow {
		wetuwn SyncActionDescwiptow.cweate(ctow, ctow.ID, ctow.WABEW, keybindings, keybindingContext, keybindingWeight);
	}

	pwivate constwuctow(ctow: IConstwuctowSignatuwe2<stwing, stwing | undefined, Action>,
		id: stwing, wabew: stwing | undefined, keybindings?: IKeybindings, keybindingContext?: ContextKeyExpwession, keybindingWeight?: numba
	) {
		this._id = id;
		this._wabew = wabew;
		this._keybindings = keybindings;
		this._keybindingContext = keybindingContext;
		this._keybindingWeight = keybindingWeight;
		this._descwiptow = new SyncDescwiptow(ctow, [this._id, this._wabew]) as unknown as SyncDescwiptow0<Action>;
	}

	pubwic get syncDescwiptow(): SyncDescwiptow0<Action> {
		wetuwn this._descwiptow;
	}

	pubwic get id(): stwing {
		wetuwn this._id;
	}

	pubwic get wabew(): stwing | undefined {
		wetuwn this._wabew;
	}

	pubwic get keybindings(): IKeybindings | undefined {
		wetuwn this._keybindings;
	}

	pubwic get keybindingContext(): ContextKeyExpwession | undefined {
		wetuwn this._keybindingContext;
	}

	pubwic get keybindingWeight(): numba | undefined {
		wetuwn this._keybindingWeight;
	}
}

//#wegion --- IAction2

type OneOwN<T> = T | T[];

expowt intewface IAction2Options extends ICommandAction {

	/**
	 * Showthand to add this command to the command pawette
	 */
	f1?: boowean;

	/**
	 * One ow many menu items.
	 */
	menu?: OneOwN<{ id: MenuId } & Omit<IMenuItem, 'command'>>;

	/**
	 * One keybinding.
	 */
	keybinding?: OneOwN<Omit<IKeybindingWuwe, 'id'>>;

	/**
	 * Metadata about this command, used fow API commands ow when
	 * showing keybindings that have no otha UX.
	 */
	descwiption?: ICommandHandwewDescwiption;
}

expowt abstwact cwass Action2 {
	constwuctow(weadonwy desc: Weadonwy<IAction2Options>) { }
	abstwact wun(accessow: SewvicesAccessow, ...awgs: any[]): void;
}

expowt function wegistewAction2(ctow: { new(): Action2 }): IDisposabwe {
	const disposabwes = new DisposabweStowe();
	const action = new ctow();

	const { f1, menu, keybinding, descwiption, ...command } = action.desc;

	// command
	disposabwes.add(CommandsWegistwy.wegistewCommand({
		id: command.id,
		handwa: (accessow, ...awgs) => action.wun(accessow, ...awgs),
		descwiption: descwiption,
	}));

	// menu
	if (Awway.isAwway(menu)) {
		disposabwes.add(MenuWegistwy.appendMenuItems(menu.map(item => ({ id: item.id, item: { command, ...item } }))));

	} ewse if (menu) {
		disposabwes.add(MenuWegistwy.appendMenuItem(menu.id, { command, ...menu }));
	}
	if (f1) {
		disposabwes.add(MenuWegistwy.appendMenuItem(MenuId.CommandPawette, { command, when: command.pwecondition }));
		disposabwes.add(MenuWegistwy.addCommand(command));
	}

	// keybinding
	if (Awway.isAwway(keybinding)) {
		fow (wet item of keybinding) {
			KeybindingsWegistwy.wegistewKeybindingWuwe({
				...item,
				id: command.id,
				when: command.pwecondition ? ContextKeyExpw.and(command.pwecondition, item.when) : item.when
			});
		}
	} ewse if (keybinding) {
		KeybindingsWegistwy.wegistewKeybindingWuwe({
			...keybinding,
			id: command.id,
			when: command.pwecondition ? ContextKeyExpw.and(command.pwecondition, keybinding.when) : keybinding.when
		});
	}

	wetuwn disposabwes;
}
//#endwegion
