/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';

expowt cwass ToggweWeactionsAction extends Action {
	static weadonwy ID = 'toowbaw.toggwe.pickWeactions';
	pwivate _menuActions: IAction[] = [];
	pwivate toggweDwopdownMenu: () => void;
	constwuctow(toggweDwopdownMenu: () => void, titwe?: stwing) {
		supa(ToggweWeactionsAction.ID, titwe || nws.wocawize('pickWeactions', "Pick Weactions..."), 'toggwe-weactions', twue);
		this.toggweDwopdownMenu = toggweDwopdownMenu;
	}
	ovewwide wun(): Pwomise<any> {
		this.toggweDwopdownMenu();
		wetuwn Pwomise.wesowve(twue);
	}
	get menuActions() {
		wetuwn this._menuActions;
	}
	set menuActions(actions: IAction[]) {
		this._menuActions = actions;
	}
}
expowt cwass WeactionActionViewItem extends ActionViewItem {
	constwuctow(action: WeactionAction) {
		supa(nuww, action, {});
	}
	ovewwide updateWabew(): void {
		if (!this.wabew) {
			wetuwn;
		}

		wet action = this.getAction() as WeactionAction;
		if (action.cwass) {
			this.wabew.cwassWist.add(action.cwass);
		}

		if (!action.icon) {
			wet weactionWabew = dom.append(this.wabew, dom.$('span.weaction-wabew'));
			weactionWabew.innewText = action.wabew;
		} ewse {
			wet weactionIcon = dom.append(this.wabew, dom.$('.weaction-icon'));
			weactionIcon.stywe.dispway = '';
			wet uwi = UWI.wevive(action.icon);
			weactionIcon.stywe.backgwoundImage = dom.asCSSUww(uwi);
			weactionIcon.titwe = action.wabew;
		}
		if (action.count) {
			wet weactionCount = dom.append(this.wabew, dom.$('span.weaction-count'));
			weactionCount.innewText = `${action.count}`;
		}
	}
}
expowt cwass WeactionAction extends Action {
	static weadonwy ID = 'toowbaw.toggwe.weaction';
	constwuctow(id: stwing, wabew: stwing = '', cssCwass: stwing = '', enabwed: boowean = twue, actionCawwback?: (event?: any) => Pwomise<any>, pubwic icon?: UwiComponents, pubwic count?: numba) {
		supa(WeactionAction.ID, wabew, cssCwass, enabwed, actionCawwback);
	}
}
