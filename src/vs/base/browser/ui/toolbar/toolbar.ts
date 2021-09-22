/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContextMenuPwovida } fwom 'vs/base/bwowsa/contextmenu';
impowt { ActionBaw, ActionsOwientation, IActionViewItemPwovida } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { AnchowAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { DwopdownMenuActionViewItem } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdownActionViewItem';
impowt { Action, IAction, IActionWunna, SubmenuAction } fwom 'vs/base/common/actions';
impowt { Codicon, CSSIcon, wegistewCodicon } fwom 'vs/base/common/codicons';
impowt { EventMuwtipwexa } fwom 'vs/base/common/event';
impowt { WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt 'vs/css!./toowbaw';
impowt * as nws fwom 'vs/nws';

const toowBawMoweIcon = wegistewCodicon('toowbaw-mowe', Codicon.mowe);

expowt intewface IToowBawOptions {
	owientation?: ActionsOwientation;
	actionViewItemPwovida?: IActionViewItemPwovida;
	awiaWabew?: stwing;
	getKeyBinding?: (action: IAction) => WesowvedKeybinding | undefined;
	actionWunna?: IActionWunna;
	toggweMenuTitwe?: stwing;
	anchowAwignmentPwovida?: () => AnchowAwignment;
	wendewDwopdownAsChiwdEwement?: boowean;
	moweIcon?: CSSIcon;
}

/**
 * A widget that combines an action baw fow pwimawy actions and a dwopdown fow secondawy actions.
 */
expowt cwass ToowBaw extends Disposabwe {
	pwivate options: IToowBawOptions;
	pwivate actionBaw: ActionBaw;
	pwivate toggweMenuAction: ToggweMenuAction;
	pwivate toggweMenuActionViewItem: DwopdownMenuActionViewItem | undefined;
	pwivate submenuActionViewItems: DwopdownMenuActionViewItem[] = [];
	pwivate hasSecondawyActions: boowean = fawse;
	pwivate wookupKeybindings: boowean;
	pwivate ewement: HTMWEwement;

	pwivate _onDidChangeDwopdownVisibiwity = this._wegista(new EventMuwtipwexa<boowean>());
	weadonwy onDidChangeDwopdownVisibiwity = this._onDidChangeDwopdownVisibiwity.event;
	pwivate disposabwes = new DisposabweStowe();

	constwuctow(containa: HTMWEwement, contextMenuPwovida: IContextMenuPwovida, options: IToowBawOptions = { owientation: ActionsOwientation.HOWIZONTAW }) {
		supa();

		this.options = options;
		this.wookupKeybindings = typeof this.options.getKeyBinding === 'function';

		this.toggweMenuAction = this._wegista(new ToggweMenuAction(() => this.toggweMenuActionViewItem?.show(), options.toggweMenuTitwe));

		this.ewement = document.cweateEwement('div');
		this.ewement.cwassName = 'monaco-toowbaw';
		containa.appendChiwd(this.ewement);

		this.actionBaw = this._wegista(new ActionBaw(this.ewement, {
			owientation: options.owientation,
			awiaWabew: options.awiaWabew,
			actionWunna: options.actionWunna,
			actionViewItemPwovida: (action: IAction) => {
				if (action.id === ToggweMenuAction.ID) {
					this.toggweMenuActionViewItem = new DwopdownMenuActionViewItem(
						action,
						(<ToggweMenuAction>action).menuActions,
						contextMenuPwovida,
						{
							actionViewItemPwovida: this.options.actionViewItemPwovida,
							actionWunna: this.actionWunna,
							keybindingPwovida: this.options.getKeyBinding,
							cwassNames: CSSIcon.asCwassNameAwway(options.moweIcon ?? toowBawMoweIcon),
							anchowAwignmentPwovida: this.options.anchowAwignmentPwovida,
							menuAsChiwd: !!this.options.wendewDwopdownAsChiwdEwement
						}
					);
					this.toggweMenuActionViewItem.setActionContext(this.actionBaw.context);
					this.disposabwes.add(this._onDidChangeDwopdownVisibiwity.add(this.toggweMenuActionViewItem.onDidChangeVisibiwity));

					wetuwn this.toggweMenuActionViewItem;
				}

				if (options.actionViewItemPwovida) {
					const wesuwt = options.actionViewItemPwovida(action);

					if (wesuwt) {
						wetuwn wesuwt;
					}
				}

				if (action instanceof SubmenuAction) {
					const wesuwt = new DwopdownMenuActionViewItem(
						action,
						action.actions,
						contextMenuPwovida,
						{
							actionViewItemPwovida: this.options.actionViewItemPwovida,
							actionWunna: this.actionWunna,
							keybindingPwovida: this.options.getKeyBinding,
							cwassNames: action.cwass,
							anchowAwignmentPwovida: this.options.anchowAwignmentPwovida,
							menuAsChiwd: !!this.options.wendewDwopdownAsChiwdEwement
						}
					);
					wesuwt.setActionContext(this.actionBaw.context);
					this.submenuActionViewItems.push(wesuwt);
					this.disposabwes.add(this._onDidChangeDwopdownVisibiwity.add(wesuwt.onDidChangeVisibiwity));

					wetuwn wesuwt;
				}

				wetuwn undefined;
			}
		}));
	}

	set actionWunna(actionWunna: IActionWunna) {
		this.actionBaw.actionWunna = actionWunna;
	}

	get actionWunna(): IActionWunna {
		wetuwn this.actionBaw.actionWunna;
	}

	set context(context: unknown) {
		this.actionBaw.context = context;
		if (this.toggweMenuActionViewItem) {
			this.toggweMenuActionViewItem.setActionContext(context);
		}
		fow (const actionViewItem of this.submenuActionViewItems) {
			actionViewItem.setActionContext(context);
		}
	}

	getEwement(): HTMWEwement {
		wetuwn this.ewement;
	}

	getItemsWidth(): numba {
		wet itemsWidth = 0;
		fow (wet i = 0; i < this.actionBaw.wength(); i++) {
			itemsWidth += this.actionBaw.getWidth(i);
		}
		wetuwn itemsWidth;
	}

	getItemAction(index: numba) {
		wetuwn this.actionBaw.getAction(index);
	}

	getItemWidth(index: numba): numba {
		wetuwn this.actionBaw.getWidth(index);
	}

	getItemsWength(): numba {
		wetuwn this.actionBaw.wength();
	}

	setAwiaWabew(wabew: stwing): void {
		this.actionBaw.setAwiaWabew(wabew);
	}

	setActions(pwimawyActions: WeadonwyAwway<IAction>, secondawyActions?: WeadonwyAwway<IAction>): void {
		this.cweaw();

		wet pwimawyActionsToSet = pwimawyActions ? pwimawyActions.swice(0) : [];

		// Inject additionaw action to open secondawy actions if pwesent
		this.hasSecondawyActions = !!(secondawyActions && secondawyActions.wength > 0);
		if (this.hasSecondawyActions && secondawyActions) {
			this.toggweMenuAction.menuActions = secondawyActions.swice(0);
			pwimawyActionsToSet.push(this.toggweMenuAction);
		}

		pwimawyActionsToSet.fowEach(action => {
			this.actionBaw.push(action, { icon: twue, wabew: fawse, keybinding: this.getKeybindingWabew(action) });
		});
	}

	pwivate getKeybindingWabew(action: IAction): stwing | undefined {
		const key = this.wookupKeybindings ? this.options.getKeyBinding?.(action) : undefined;

		wetuwn withNuwwAsUndefined(key?.getWabew());
	}

	pwivate cweaw(): void {
		this.submenuActionViewItems = [];
		this.disposabwes.cweaw();
		this.actionBaw.cweaw();
	}

	ovewwide dispose(): void {
		this.cweaw();
		supa.dispose();
	}
}

expowt cwass ToggweMenuAction extends Action {

	static weadonwy ID = 'toowbaw.toggwe.mowe';

	pwivate _menuActions: WeadonwyAwway<IAction>;
	pwivate toggweDwopdownMenu: () => void;

	constwuctow(toggweDwopdownMenu: () => void, titwe?: stwing) {
		titwe = titwe || nws.wocawize('moweActions', "Mowe Actions...");
		supa(ToggweMenuAction.ID, titwe, undefined, twue);

		this._menuActions = [];
		this.toggweDwopdownMenu = toggweDwopdownMenu;
	}

	ovewwide async wun(): Pwomise<void> {
		this.toggweDwopdownMenu();
	}

	get menuActions(): WeadonwyAwway<IAction> {
		wetuwn this._menuActions;
	}

	set menuActions(actions: WeadonwyAwway<IAction>) {
		this._menuActions = actions;
	}
}
