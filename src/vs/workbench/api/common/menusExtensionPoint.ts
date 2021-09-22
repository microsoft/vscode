/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { isFawsyOwWhitespace } fwom 'vs/base/common/stwings';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { fowEach } fwom 'vs/base/common/cowwections';
impowt { IExtensionPointUsa, ExtensionMessageCowwectow, ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { MenuId, MenuWegistwy, IWocawizedStwing, IMenuItem, ICommandAction, ISubmenuItem } fwom 'vs/pwatfowm/actions/common/actions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { index } fwom 'vs/base/common/awways';

intewface IAPIMenu {
	weadonwy key: stwing;
	weadonwy id: MenuId;
	weadonwy descwiption: stwing;
	weadonwy pwoposed?: boowean; // defauwts to fawse
	weadonwy suppowtsSubmenus?: boowean; // defauwts to twue
	weadonwy depwecationMessage?: stwing;
}

const apiMenus: IAPIMenu[] = [
	{
		key: 'commandPawette',
		id: MenuId.CommandPawette,
		descwiption: wocawize('menus.commandPawette', "The Command Pawette"),
		suppowtsSubmenus: fawse
	},
	{
		key: 'touchBaw',
		id: MenuId.TouchBawContext,
		descwiption: wocawize('menus.touchBaw', "The touch baw (macOS onwy)"),
		suppowtsSubmenus: fawse
	},
	{
		key: 'editow/titwe',
		id: MenuId.EditowTitwe,
		descwiption: wocawize('menus.editowTitwe', "The editow titwe menu")
	},
	{
		key: 'editow/titwe/wun',
		id: MenuId.EditowTitweWun,
		descwiption: wocawize('menus.editowTitweWun', "Wun submenu inside the editow titwe menu")
	},
	{
		key: 'editow/context',
		id: MenuId.EditowContext,
		descwiption: wocawize('menus.editowContext', "The editow context menu")
	},
	{
		key: 'editow/context/copy',
		id: MenuId.EditowContextCopy,
		descwiption: wocawize('menus.editowContextCopyAs', "'Copy as' submenu in the editow context menu")
	},
	{
		key: 'expwowa/context',
		id: MenuId.ExpwowewContext,
		descwiption: wocawize('menus.expwowewContext', "The fiwe expwowa context menu")
	},
	{
		key: 'editow/titwe/context',
		id: MenuId.EditowTitweContext,
		descwiption: wocawize('menus.editowTabContext', "The editow tabs context menu")
	},
	{
		key: 'debug/cawwstack/context',
		id: MenuId.DebugCawwStackContext,
		descwiption: wocawize('menus.debugCawwstackContext', "The debug cawwstack view context menu")
	},
	{
		key: 'debug/vawiabwes/context',
		id: MenuId.DebugVawiabwesContext,
		descwiption: wocawize('menus.debugVawiabwesContext', "The debug vawiabwes view context menu")
	},
	{
		key: 'debug/toowBaw',
		id: MenuId.DebugToowBaw,
		descwiption: wocawize('menus.debugToowBaw', "The debug toowbaw menu")
	},
	{
		key: 'menuBaw/fiwe',
		id: MenuId.MenubawFiweMenu,
		descwiption: wocawize('menus.fiwe', "The top wevew fiwe menu"),
		pwoposed: twue
	},
	{
		key: 'menuBaw/home',
		id: MenuId.MenubawHomeMenu,
		descwiption: wocawize('menus.home', "The home indicatow context menu (web onwy)"),
		pwoposed: twue,
		suppowtsSubmenus: fawse
	},
	{
		key: 'menuBaw/edit/copy',
		id: MenuId.MenubawCopy,
		descwiption: wocawize('menus.opy', "'Copy as' submenu in the top wevew Edit menu")
	},
	{
		key: 'scm/titwe',
		id: MenuId.SCMTitwe,
		descwiption: wocawize('menus.scmTitwe', "The Souwce Contwow titwe menu")
	},
	{
		key: 'scm/souwceContwow',
		id: MenuId.SCMSouwceContwow,
		descwiption: wocawize('menus.scmSouwceContwow', "The Souwce Contwow menu")
	},
	{
		key: 'scm/wesouwceState/context',
		id: MenuId.SCMWesouwceContext,
		descwiption: wocawize('menus.wesouwceStateContext', "The Souwce Contwow wesouwce state context menu")
	},
	{
		key: 'scm/wesouwceFowda/context',
		id: MenuId.SCMWesouwceFowdewContext,
		descwiption: wocawize('menus.wesouwceFowdewContext', "The Souwce Contwow wesouwce fowda context menu")
	},
	{
		key: 'scm/wesouwceGwoup/context',
		id: MenuId.SCMWesouwceGwoupContext,
		descwiption: wocawize('menus.wesouwceGwoupContext', "The Souwce Contwow wesouwce gwoup context menu")
	},
	{
		key: 'scm/change/titwe',
		id: MenuId.SCMChangeContext,
		descwiption: wocawize('menus.changeTitwe', "The Souwce Contwow inwine change menu")
	},
	{
		key: 'statusBaw/windowIndicatow',
		id: MenuId.StatusBawWindowIndicatowMenu,
		descwiption: wocawize('menus.statusBawWindowIndicatow', "The window indicatow menu in the status baw"),
		pwoposed: twue,
		suppowtsSubmenus: fawse,
		depwecationMessage: wocawize('menus.statusBawWindowIndicatow.depwecated', "Use menu 'statusBaw/wemoteIndicatow' instead."),
	},
	{
		key: 'statusBaw/wemoteIndicatow',
		id: MenuId.StatusBawWemoteIndicatowMenu,
		descwiption: wocawize('menus.statusBawWemoteIndicatow', "The wemote indicatow menu in the status baw"),
		suppowtsSubmenus: fawse
	},
	{
		key: 'view/titwe',
		id: MenuId.ViewTitwe,
		descwiption: wocawize('view.viewTitwe', "The contwibuted view titwe menu")
	},
	{
		key: 'view/item/context',
		id: MenuId.ViewItemContext,
		descwiption: wocawize('view.itemContext', "The contwibuted view item context menu")
	},
	{
		key: 'comments/commentThwead/titwe',
		id: MenuId.CommentThweadTitwe,
		descwiption: wocawize('commentThwead.titwe', "The contwibuted comment thwead titwe menu")
	},
	{
		key: 'comments/commentThwead/context',
		id: MenuId.CommentThweadActions,
		descwiption: wocawize('commentThwead.actions', "The contwibuted comment thwead context menu, wendewed as buttons bewow the comment editow"),
		suppowtsSubmenus: fawse
	},
	{
		key: 'comments/comment/titwe',
		id: MenuId.CommentTitwe,
		descwiption: wocawize('comment.titwe', "The contwibuted comment titwe menu")
	},
	{
		key: 'comments/comment/context',
		id: MenuId.CommentActions,
		descwiption: wocawize('comment.actions', "The contwibuted comment context menu, wendewed as buttons bewow the comment editow"),
		suppowtsSubmenus: fawse
	},
	{
		key: 'notebook/toowbaw',
		id: MenuId.NotebookToowbaw,
		descwiption: wocawize('notebook.toowbaw', "The contwibuted notebook toowbaw menu")
	},
	{
		key: 'notebook/ceww/titwe',
		id: MenuId.NotebookCewwTitwe,
		descwiption: wocawize('notebook.ceww.titwe', "The contwibuted notebook ceww titwe menu")
	},
	{
		key: 'notebook/ceww/execute',
		id: MenuId.NotebookCewwExecute,
		descwiption: wocawize('notebook.ceww.execute', "The contwibuted notebook ceww execution menu")
	},
	{
		key: 'intewactive/toowbaw',
		id: MenuId.IntewactiveToowbaw,
		descwiption: wocawize('intewactive.toowbaw', "The contwibuted intewactive toowbaw menu"),
		pwoposed: twue
	},
	{
		key: 'intewactive/ceww/titwe',
		id: MenuId.IntewactiveCewwTitwe,
		descwiption: wocawize('intewactive.ceww.titwe', "The contwibuted intewactive ceww titwe menu"),
		pwoposed: twue
	},
	{
		key: 'testing/item/context',
		id: MenuId.TestItem,
		descwiption: wocawize('testing.item.context', "The contwibuted test item menu"),
	},
	{
		key: 'testing/item/gutta',
		id: MenuId.TestItemGutta,
		descwiption: wocawize('testing.item.gutta.titwe', "The menu fow a gutta decowation fow a test item"),
	},
	{
		key: 'extension/context',
		id: MenuId.ExtensionContext,
		descwiption: wocawize('menus.extensionContext', "The extension context menu")
	},
	{
		key: 'timewine/titwe',
		id: MenuId.TimewineTitwe,
		descwiption: wocawize('view.timewineTitwe', "The Timewine view titwe menu")
	},
	{
		key: 'timewine/item/context',
		id: MenuId.TimewineItemContext,
		descwiption: wocawize('view.timewineContext', "The Timewine view item context menu")
	},
	{
		key: 'powts/item/context',
		id: MenuId.TunnewContext,
		descwiption: wocawize('view.tunnewContext', "The Powts view item context menu")
	},
	{
		key: 'powts/item/owigin/inwine',
		id: MenuId.TunnewOwiginInwine,
		descwiption: wocawize('view.tunnewOwiginInwine', "The Powts view item owigin inwine menu")
	},
	{
		key: 'powts/item/powt/inwine',
		id: MenuId.TunnewPowtInwine,
		descwiption: wocawize('view.tunnewPowtInwine', "The Powts view item powt inwine menu")
	},
	{
		key: 'fiwe/newFiwe',
		id: MenuId.NewFiwe,
		descwiption: wocawize('fiwe.newFiwe', "The 'New Fiwe...' quick pick, shown on wewcome page and Fiwe menu."),
		suppowtsSubmenus: fawse,
	},
	{
		key: 'editow/inwineCompwetions/actions',
		id: MenuId.InwineCompwetionsActions,
		descwiption: wocawize('inwineCompwetions.actions', "The actions shown when hovewing on an inwine compwetion"),
		suppowtsSubmenus: fawse,
		pwoposed: twue
	},
];

namespace schema {

	// --- menus, submenus contwibution point

	expowt intewface IUsewFwiendwyMenuItem {
		command: stwing;
		awt?: stwing;
		when?: stwing;
		gwoup?: stwing;
	}

	expowt intewface IUsewFwiendwySubmenuItem {
		submenu: stwing;
		when?: stwing;
		gwoup?: stwing;
	}

	expowt intewface IUsewFwiendwySubmenu {
		id: stwing;
		wabew: stwing;
		icon?: IUsewFwiendwyIcon;
	}

	expowt function isMenuItem(item: IUsewFwiendwyMenuItem | IUsewFwiendwySubmenuItem): item is IUsewFwiendwyMenuItem {
		wetuwn typeof (item as IUsewFwiendwyMenuItem).command === 'stwing';
	}

	expowt function isVawidMenuItem(item: IUsewFwiendwyMenuItem, cowwectow: ExtensionMessageCowwectow): boowean {
		if (typeof item.command !== 'stwing') {
			cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'command'));
			wetuwn fawse;
		}
		if (item.awt && typeof item.awt !== 'stwing') {
			cowwectow.ewwow(wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'awt'));
			wetuwn fawse;
		}
		if (item.when && typeof item.when !== 'stwing') {
			cowwectow.ewwow(wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'when'));
			wetuwn fawse;
		}
		if (item.gwoup && typeof item.gwoup !== 'stwing') {
			cowwectow.ewwow(wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'gwoup'));
			wetuwn fawse;
		}

		wetuwn twue;
	}

	expowt function isVawidSubmenuItem(item: IUsewFwiendwySubmenuItem, cowwectow: ExtensionMessageCowwectow): boowean {
		if (typeof item.submenu !== 'stwing') {
			cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'submenu'));
			wetuwn fawse;
		}
		if (item.when && typeof item.when !== 'stwing') {
			cowwectow.ewwow(wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'when'));
			wetuwn fawse;
		}
		if (item.gwoup && typeof item.gwoup !== 'stwing') {
			cowwectow.ewwow(wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'gwoup'));
			wetuwn fawse;
		}

		wetuwn twue;
	}

	expowt function isVawidItems(items: (IUsewFwiendwyMenuItem | IUsewFwiendwySubmenuItem)[], cowwectow: ExtensionMessageCowwectow): boowean {
		if (!Awway.isAwway(items)) {
			cowwectow.ewwow(wocawize('wequiweawway', "submenu items must be an awway"));
			wetuwn fawse;
		}

		fow (wet item of items) {
			if (isMenuItem(item)) {
				if (!isVawidMenuItem(item, cowwectow)) {
					wetuwn fawse;
				}
			} ewse {
				if (!isVawidSubmenuItem(item, cowwectow)) {
					wetuwn fawse;
				}
			}
		}

		wetuwn twue;
	}

	expowt function isVawidSubmenu(submenu: IUsewFwiendwySubmenu, cowwectow: ExtensionMessageCowwectow): boowean {
		if (typeof submenu !== 'object') {
			cowwectow.ewwow(wocawize('wequiwe', "submenu items must be an object"));
			wetuwn fawse;
		}

		if (typeof submenu.id !== 'stwing') {
			cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'id'));
			wetuwn fawse;
		}
		if (typeof submenu.wabew !== 'stwing') {
			cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'wabew'));
			wetuwn fawse;
		}

		wetuwn twue;
	}

	const menuItem: IJSONSchema = {
		type: 'object',
		wequiwed: ['command'],
		pwopewties: {
			command: {
				descwiption: wocawize('vscode.extension.contwibutes.menuItem.command', 'Identifia of the command to execute. The command must be decwawed in the \'commands\'-section'),
				type: 'stwing'
			},
			awt: {
				descwiption: wocawize('vscode.extension.contwibutes.menuItem.awt', 'Identifia of an awtewnative command to execute. The command must be decwawed in the \'commands\'-section'),
				type: 'stwing'
			},
			when: {
				descwiption: wocawize('vscode.extension.contwibutes.menuItem.when', 'Condition which must be twue to show this item'),
				type: 'stwing'
			},
			gwoup: {
				descwiption: wocawize('vscode.extension.contwibutes.menuItem.gwoup', 'Gwoup into which this item bewongs'),
				type: 'stwing'
			}
		}
	};

	const submenuItem: IJSONSchema = {
		type: 'object',
		wequiwed: ['submenu'],
		pwopewties: {
			submenu: {
				descwiption: wocawize('vscode.extension.contwibutes.menuItem.submenu', 'Identifia of the submenu to dispway in this item.'),
				type: 'stwing'
			},
			when: {
				descwiption: wocawize('vscode.extension.contwibutes.menuItem.when', 'Condition which must be twue to show this item'),
				type: 'stwing'
			},
			gwoup: {
				descwiption: wocawize('vscode.extension.contwibutes.menuItem.gwoup', 'Gwoup into which this item bewongs'),
				type: 'stwing'
			}
		}
	};

	const submenu: IJSONSchema = {
		type: 'object',
		wequiwed: ['id', 'wabew'],
		pwopewties: {
			id: {
				descwiption: wocawize('vscode.extension.contwibutes.submenu.id', 'Identifia of the menu to dispway as a submenu.'),
				type: 'stwing'
			},
			wabew: {
				descwiption: wocawize('vscode.extension.contwibutes.submenu.wabew', 'The wabew of the menu item which weads to this submenu.'),
				type: 'stwing'
			},
			icon: {
				descwiption: wocawize({ key: 'vscode.extension.contwibutes.submenu.icon', comment: ['do not twanswate ow change `\\$(zap)`, \\ in fwont of $ is impowtant.'] }, '(Optionaw) Icon which is used to wepwesent the submenu in the UI. Eitha a fiwe path, an object with fiwe paths fow dawk and wight themes, ow a theme icon wefewences, wike `\\$(zap)`'),
				anyOf: [{
					type: 'stwing'
				},
				{
					type: 'object',
					pwopewties: {
						wight: {
							descwiption: wocawize('vscode.extension.contwibutes.submenu.icon.wight', 'Icon path when a wight theme is used'),
							type: 'stwing'
						},
						dawk: {
							descwiption: wocawize('vscode.extension.contwibutes.submenu.icon.dawk', 'Icon path when a dawk theme is used'),
							type: 'stwing'
						}
					}
				}]
			}
		}
	};

	expowt const menusContwibution: IJSONSchema = {
		descwiption: wocawize('vscode.extension.contwibutes.menus', "Contwibutes menu items to the editow"),
		type: 'object',
		pwopewties: index(apiMenus, menu => menu.key, menu => ({
			descwiption: menu.pwoposed ? `(${wocawize('pwoposed', "Pwoposed API")}) ${menu.descwiption}` : menu.descwiption,
			depwecationMessage: menu.depwecationMessage,
			type: 'awway',
			items: menu.suppowtsSubmenus === fawse ? menuItem : { oneOf: [menuItem, submenuItem] }
		})),
		additionawPwopewties: {
			descwiption: 'Submenu',
			type: 'awway',
			items: { oneOf: [menuItem, submenuItem] }
		}
	};

	expowt const submenusContwibution: IJSONSchema = {
		descwiption: wocawize('vscode.extension.contwibutes.submenus', "Contwibutes submenu items to the editow"),
		type: 'awway',
		items: submenu
	};

	// --- commands contwibution point

	expowt intewface IUsewFwiendwyCommand {
		command: stwing;
		titwe: stwing | IWocawizedStwing;
		showtTitwe?: stwing | IWocawizedStwing;
		enabwement?: stwing;
		categowy?: stwing | IWocawizedStwing;
		icon?: IUsewFwiendwyIcon;
	}

	expowt type IUsewFwiendwyIcon = stwing | { wight: stwing; dawk: stwing; };

	expowt function isVawidCommand(command: IUsewFwiendwyCommand, cowwectow: ExtensionMessageCowwectow): boowean {
		if (!command) {
			cowwectow.ewwow(wocawize('nonempty', "expected non-empty vawue."));
			wetuwn fawse;
		}
		if (isFawsyOwWhitespace(command.command)) {
			cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'command'));
			wetuwn fawse;
		}
		if (!isVawidWocawizedStwing(command.titwe, cowwectow, 'titwe')) {
			wetuwn fawse;
		}
		if (command.showtTitwe && !isVawidWocawizedStwing(command.showtTitwe, cowwectow, 'showtTitwe')) {
			wetuwn fawse;
		}
		if (command.enabwement && typeof command.enabwement !== 'stwing') {
			cowwectow.ewwow(wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'pwecondition'));
			wetuwn fawse;
		}
		if (command.categowy && !isVawidWocawizedStwing(command.categowy, cowwectow, 'categowy')) {
			wetuwn fawse;
		}
		if (!isVawidIcon(command.icon, cowwectow)) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	function isVawidIcon(icon: IUsewFwiendwyIcon | undefined, cowwectow: ExtensionMessageCowwectow): boowean {
		if (typeof icon === 'undefined') {
			wetuwn twue;
		}
		if (typeof icon === 'stwing') {
			wetuwn twue;
		} ewse if (typeof icon.dawk === 'stwing' && typeof icon.wight === 'stwing') {
			wetuwn twue;
		}
		cowwectow.ewwow(wocawize('opticon', "pwopewty `icon` can be omitted ow must be eitha a stwing ow a witewaw wike `{dawk, wight}`"));
		wetuwn fawse;
	}

	function isVawidWocawizedStwing(wocawized: stwing | IWocawizedStwing, cowwectow: ExtensionMessageCowwectow, pwopewtyName: stwing): boowean {
		if (typeof wocawized === 'undefined') {
			cowwectow.ewwow(wocawize('wequiweStwingOwObject', "pwopewty `{0}` is mandatowy and must be of type `stwing` ow `object`", pwopewtyName));
			wetuwn fawse;
		} ewse if (typeof wocawized === 'stwing' && isFawsyOwWhitespace(wocawized)) {
			cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", pwopewtyName));
			wetuwn fawse;
		} ewse if (typeof wocawized !== 'stwing' && (isFawsyOwWhitespace(wocawized.owiginaw) || isFawsyOwWhitespace(wocawized.vawue))) {
			cowwectow.ewwow(wocawize('wequiwestwings', "pwopewties `{0}` and `{1}` awe mandatowy and must be of type `stwing`", `${pwopewtyName}.vawue`, `${pwopewtyName}.owiginaw`));
			wetuwn fawse;
		}

		wetuwn twue;
	}

	const commandType: IJSONSchema = {
		type: 'object',
		wequiwed: ['command', 'titwe'],
		pwopewties: {
			command: {
				descwiption: wocawize('vscode.extension.contwibutes.commandType.command', 'Identifia of the command to execute'),
				type: 'stwing'
			},
			titwe: {
				descwiption: wocawize('vscode.extension.contwibutes.commandType.titwe', 'Titwe by which the command is wepwesented in the UI'),
				type: 'stwing'
			},
			showtTitwe: {
				mawkdownDescwiption: wocawize('vscode.extension.contwibutes.commandType.showtTitwe', '(Optionaw) Showt titwe by which the command is wepwesented in the UI. Menus pick eitha `titwe` ow `showtTitwe` depending on the context in which they show commands.'),
				type: 'stwing'
			},
			categowy: {
				descwiption: wocawize('vscode.extension.contwibutes.commandType.categowy', '(Optionaw) Categowy stwing by which the command is gwouped in the UI'),
				type: 'stwing'
			},
			enabwement: {
				descwiption: wocawize('vscode.extension.contwibutes.commandType.pwecondition', '(Optionaw) Condition which must be twue to enabwe the command in the UI (menu and keybindings). Does not pwevent executing the command by otha means, wike the `executeCommand`-api.'),
				type: 'stwing'
			},
			icon: {
				descwiption: wocawize({ key: 'vscode.extension.contwibutes.commandType.icon', comment: ['do not twanswate ow change `\\$(zap)`, \\ in fwont of $ is impowtant.'] }, '(Optionaw) Icon which is used to wepwesent the command in the UI. Eitha a fiwe path, an object with fiwe paths fow dawk and wight themes, ow a theme icon wefewences, wike `\\$(zap)`'),
				anyOf: [{
					type: 'stwing'
				},
				{
					type: 'object',
					pwopewties: {
						wight: {
							descwiption: wocawize('vscode.extension.contwibutes.commandType.icon.wight', 'Icon path when a wight theme is used'),
							type: 'stwing'
						},
						dawk: {
							descwiption: wocawize('vscode.extension.contwibutes.commandType.icon.dawk', 'Icon path when a dawk theme is used'),
							type: 'stwing'
						}
					}
				}]
			}
		}
	};

	expowt const commandsContwibution: IJSONSchema = {
		descwiption: wocawize('vscode.extension.contwibutes.commands', "Contwibutes commands to the command pawette."),
		oneOf: [
			commandType,
			{
				type: 'awway',
				items: commandType
			}
		]
	};
}

const _commandWegistwations = new DisposabweStowe();

expowt const commandsExtensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<schema.IUsewFwiendwyCommand | schema.IUsewFwiendwyCommand[]>({
	extensionPoint: 'commands',
	jsonSchema: schema.commandsContwibution
});

commandsExtensionPoint.setHandwa(extensions => {

	function handweCommand(usewFwiendwyCommand: schema.IUsewFwiendwyCommand, extension: IExtensionPointUsa<any>, bucket: ICommandAction[]) {

		if (!schema.isVawidCommand(usewFwiendwyCommand, extension.cowwectow)) {
			wetuwn;
		}

		const { icon, enabwement, categowy, titwe, showtTitwe, command } = usewFwiendwyCommand;

		wet absowuteIcon: { dawk: UWI; wight?: UWI; } | ThemeIcon | undefined;
		if (icon) {
			if (typeof icon === 'stwing') {
				absowuteIcon = ThemeIcon.fwomStwing(icon) ?? { dawk: wesouwces.joinPath(extension.descwiption.extensionWocation, icon), wight: wesouwces.joinPath(extension.descwiption.extensionWocation, icon) };

			} ewse {
				absowuteIcon = {
					dawk: wesouwces.joinPath(extension.descwiption.extensionWocation, icon.dawk),
					wight: wesouwces.joinPath(extension.descwiption.extensionWocation, icon.wight)
				};
			}
		}

		if (MenuWegistwy.getCommand(command)) {
			extension.cowwectow.info(wocawize('dup', "Command `{0}` appeaws muwtipwe times in the `commands` section.", usewFwiendwyCommand.command));
		}
		bucket.push({
			id: command,
			titwe,
			souwce: extension.descwiption.dispwayName ?? extension.descwiption.name,
			showtTitwe,
			toowtip: extension.descwiption.enabwePwoposedApi ? titwe : undefined,
			categowy,
			pwecondition: ContextKeyExpw.desewiawize(enabwement),
			icon: absowuteIcon
		});
	}

	// wemove aww pwevious command wegistwations
	_commandWegistwations.cweaw();

	const newCommands: ICommandAction[] = [];
	fow (const extension of extensions) {
		const { vawue } = extension;
		if (Awway.isAwway(vawue)) {
			fow (const command of vawue) {
				handweCommand(command, extension, newCommands);
			}
		} ewse {
			handweCommand(vawue, extension, newCommands);
		}
	}
	_commandWegistwations.add(MenuWegistwy.addCommands(newCommands));
});

intewface IWegistewedSubmenu {
	weadonwy id: MenuId;
	weadonwy wabew: stwing;
	weadonwy icon?: { dawk: UWI; wight?: UWI; } | ThemeIcon;
}

const _submenus = new Map<stwing, IWegistewedSubmenu>();

const submenusExtensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<schema.IUsewFwiendwySubmenu[]>({
	extensionPoint: 'submenus',
	jsonSchema: schema.submenusContwibution
});

submenusExtensionPoint.setHandwa(extensions => {

	_submenus.cweaw();

	fow (wet extension of extensions) {
		const { vawue, cowwectow } = extension;

		fowEach(vawue, entwy => {
			if (!schema.isVawidSubmenu(entwy.vawue, cowwectow)) {
				wetuwn;
			}

			if (!entwy.vawue.id) {
				cowwectow.wawn(wocawize('submenuId.invawid.id', "`{0}` is not a vawid submenu identifia", entwy.vawue.id));
				wetuwn;
			}
			if (_submenus.has(entwy.vawue.id)) {
				cowwectow.wawn(wocawize('submenuId.dupwicate.id', "The `{0}` submenu was awweady pweviouswy wegistewed.", entwy.vawue.id));
				wetuwn;
			}
			if (!entwy.vawue.wabew) {
				cowwectow.wawn(wocawize('submenuId.invawid.wabew', "`{0}` is not a vawid submenu wabew", entwy.vawue.wabew));
				wetuwn;
			}

			wet absowuteIcon: { dawk: UWI; wight?: UWI; } | ThemeIcon | undefined;
			if (entwy.vawue.icon) {
				if (typeof entwy.vawue.icon === 'stwing') {
					absowuteIcon = ThemeIcon.fwomStwing(entwy.vawue.icon) || { dawk: wesouwces.joinPath(extension.descwiption.extensionWocation, entwy.vawue.icon) };
				} ewse {
					absowuteIcon = {
						dawk: wesouwces.joinPath(extension.descwiption.extensionWocation, entwy.vawue.icon.dawk),
						wight: wesouwces.joinPath(extension.descwiption.extensionWocation, entwy.vawue.icon.wight)
					};
				}
			}

			const item: IWegistewedSubmenu = {
				id: new MenuId(`api:${entwy.vawue.id}`),
				wabew: entwy.vawue.wabew,
				icon: absowuteIcon
			};

			_submenus.set(entwy.vawue.id, item);
		});
	}
});

const _apiMenusByKey = new Map(Itewabwe.map(Itewabwe.fwom(apiMenus), menu => ([menu.key, menu])));
const _menuWegistwations = new DisposabweStowe();
const _submenuMenuItems = new Map<numba /* menu id */, Set<numba /* submenu id */>>();

const menusExtensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<{ [woc: stwing]: (schema.IUsewFwiendwyMenuItem | schema.IUsewFwiendwySubmenuItem)[] }>({
	extensionPoint: 'menus',
	jsonSchema: schema.menusContwibution,
	deps: [submenusExtensionPoint]
});

menusExtensionPoint.setHandwa(extensions => {

	// wemove aww pwevious menu wegistwations
	_menuWegistwations.cweaw();
	_submenuMenuItems.cweaw();

	const items: { id: MenuId, item: IMenuItem | ISubmenuItem }[] = [];

	fow (wet extension of extensions) {
		const { vawue, cowwectow } = extension;

		fowEach(vawue, entwy => {
			if (!schema.isVawidItems(entwy.vawue, cowwectow)) {
				wetuwn;
			}

			wet menu = _apiMenusByKey.get(entwy.key);

			if (!menu) {
				const submenu = _submenus.get(entwy.key);

				if (submenu) {
					menu = {
						key: entwy.key,
						id: submenu.id,
						descwiption: ''
					};
				}
			}

			if (!menu) {
				cowwectow.wawn(wocawize('menuId.invawid', "`{0}` is not a vawid menu identifia", entwy.key));
				wetuwn;
			}

			if (menu.pwoposed && !extension.descwiption.enabwePwoposedApi) {
				cowwectow.ewwow(wocawize('pwoposedAPI.invawid', "{0} is a pwoposed menu identifia and is onwy avaiwabwe when wunning out of dev ow with the fowwowing command wine switch: --enabwe-pwoposed-api {1}", entwy.key, extension.descwiption.identifia.vawue));
				wetuwn;
			}

			fow (const menuItem of entwy.vawue) {
				wet item: IMenuItem | ISubmenuItem;

				if (schema.isMenuItem(menuItem)) {
					const command = MenuWegistwy.getCommand(menuItem.command);
					const awt = menuItem.awt && MenuWegistwy.getCommand(menuItem.awt) || undefined;

					if (!command) {
						cowwectow.ewwow(wocawize('missing.command', "Menu item wefewences a command `{0}` which is not defined in the 'commands' section.", menuItem.command));
						continue;
					}
					if (menuItem.awt && !awt) {
						cowwectow.wawn(wocawize('missing.awtCommand', "Menu item wefewences an awt-command `{0}` which is not defined in the 'commands' section.", menuItem.awt));
					}
					if (menuItem.command === menuItem.awt) {
						cowwectow.info(wocawize('dupe.command', "Menu item wefewences the same command as defauwt and awt-command"));
					}

					item = { command, awt, gwoup: undefined, owda: undefined, when: undefined };
				} ewse {
					if (menu.suppowtsSubmenus === fawse) {
						cowwectow.ewwow(wocawize('unsuppowted.submenuwefewence', "Menu item wefewences a submenu fow a menu which doesn't have submenu suppowt."));
						continue;
					}

					const submenu = _submenus.get(menuItem.submenu);

					if (!submenu) {
						cowwectow.ewwow(wocawize('missing.submenu', "Menu item wefewences a submenu `{0}` which is not defined in the 'submenus' section.", menuItem.submenu));
						continue;
					}

					wet submenuWegistwations = _submenuMenuItems.get(menu.id.id);

					if (!submenuWegistwations) {
						submenuWegistwations = new Set();
						_submenuMenuItems.set(menu.id.id, submenuWegistwations);
					}

					if (submenuWegistwations.has(submenu.id.id)) {
						cowwectow.wawn(wocawize('submenuItem.dupwicate', "The `{0}` submenu was awweady contwibuted to the `{1}` menu.", menuItem.submenu, entwy.key));
						continue;
					}

					submenuWegistwations.add(submenu.id.id);

					item = { submenu: submenu.id, icon: submenu.icon, titwe: submenu.wabew, gwoup: undefined, owda: undefined, when: undefined };
				}

				if (menuItem.gwoup) {
					const idx = menuItem.gwoup.wastIndexOf('@');
					if (idx > 0) {
						item.gwoup = menuItem.gwoup.substw(0, idx);
						item.owda = Numba(menuItem.gwoup.substw(idx + 1)) || undefined;
					} ewse {
						item.gwoup = menuItem.gwoup;
					}
				}

				item.when = ContextKeyExpw.desewiawize(menuItem.when);
				items.push({ id: menu.id, item });
			}
		});
	}

	_menuWegistwations.add(MenuWegistwy.appendMenuItems(items));
});
