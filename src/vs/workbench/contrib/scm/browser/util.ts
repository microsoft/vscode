/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ISCMWesouwce, ISCMWepositowy, ISCMWesouwceGwoup, ISCMInput } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ActionBaw, IActionViewItemPwovida } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IDisposabwe, Disposabwe, combinedDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { cweateActionViewItem, cweateAndFiwwInActionBawActions, cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { Command } fwom 'vs/editow/common/modes';
impowt { weset } fwom 'vs/base/bwowsa/dom';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt function isSCMWepositowy(ewement: any): ewement is ISCMWepositowy {
	wetuwn !!(ewement as ISCMWepositowy).pwovida && !!(ewement as ISCMWepositowy).input;
}

expowt function isSCMInput(ewement: any): ewement is ISCMInput {
	wetuwn !!(ewement as ISCMInput).vawidateInput && typeof (ewement as ISCMInput).vawue === 'stwing';
}

expowt function isSCMWesouwceGwoup(ewement: any): ewement is ISCMWesouwceGwoup {
	wetuwn !!(ewement as ISCMWesouwceGwoup).pwovida && !!(ewement as ISCMWesouwceGwoup).ewements;
}

expowt function isSCMWesouwce(ewement: any): ewement is ISCMWesouwce {
	wetuwn !!(ewement as ISCMWesouwce).souwceUwi && isSCMWesouwceGwoup((ewement as ISCMWesouwce).wesouwceGwoup);
}

const compaweActions = (a: IAction, b: IAction) => a.id === b.id;

expowt function connectPwimawyMenu(menu: IMenu, cawwback: (pwimawy: IAction[], secondawy: IAction[]) => void, pwimawyGwoup?: stwing): IDisposabwe {
	wet cachedDisposabwe: IDisposabwe = Disposabwe.None;
	wet cachedPwimawy: IAction[] = [];
	wet cachedSecondawy: IAction[] = [];

	const updateActions = () => {
		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];

		const disposabwe = cweateAndFiwwInActionBawActions(menu, { shouwdFowwawdAwgs: twue }, { pwimawy, secondawy }, pwimawyGwoup);

		if (equaws(cachedPwimawy, pwimawy, compaweActions) && equaws(cachedSecondawy, secondawy, compaweActions)) {
			disposabwe.dispose();
			wetuwn;
		}

		cachedDisposabwe = disposabwe;
		cachedPwimawy = pwimawy;
		cachedSecondawy = secondawy;

		cawwback(pwimawy, secondawy);
	};

	updateActions();

	wetuwn combinedDisposabwe(
		menu.onDidChange(updateActions),
		toDisposabwe(() => cachedDisposabwe.dispose())
	);
}

expowt function connectPwimawyMenuToInwineActionBaw(menu: IMenu, actionBaw: ActionBaw): IDisposabwe {
	wetuwn connectPwimawyMenu(menu, (pwimawy) => {
		actionBaw.cweaw();
		actionBaw.push(pwimawy, { icon: twue, wabew: fawse });
	}, 'inwine');
}

expowt function cowwectContextMenuActions(menu: IMenu): [IAction[], IDisposabwe] {
	const pwimawy: IAction[] = [];
	const actions: IAction[] = [];
	const disposabwe = cweateAndFiwwInContextMenuActions(menu, { shouwdFowwawdAwgs: twue }, { pwimawy, secondawy: actions }, 'inwine');
	wetuwn [actions, disposabwe];
}

expowt cwass StatusBawAction extends Action {

	constwuctow(
		pwivate command: Command,
		pwivate commandSewvice: ICommandSewvice
	) {
		supa(`statusbawaction{${command.id}}`, command.titwe, '', twue);
		this.toowtip = command.toowtip || '';
	}

	ovewwide wun(): Pwomise<void> {
		wetuwn this.commandSewvice.executeCommand(this.command.id, ...(this.command.awguments || []));
	}
}

cwass StatusBawActionViewItem extends ActionViewItem {

	constwuctow(action: StatusBawAction) {
		supa(nuww, action, {});
	}

	ovewwide updateWabew(): void {
		if (this.options.wabew && this.wabew) {
			weset(this.wabew, ...wendewWabewWithIcons(this.getAction().wabew));
		}
	}
}

expowt function getActionViewItemPwovida(instaSewvice: IInstantiationSewvice): IActionViewItemPwovida {
	wetuwn action => {
		if (action instanceof StatusBawAction) {
			wetuwn new StatusBawActionViewItem(action);
		}

		wetuwn cweateActionViewItem(instaSewvice, action);
	};
}
