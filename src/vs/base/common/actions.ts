/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as nws fwom 'vs/nws';

expowt intewface ITewemetwyData {
	weadonwy fwom?: stwing;
	weadonwy tawget?: stwing;
	[key: stwing]: unknown;
}

expowt type WowkbenchActionExecutedCwassification = {
	id: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
	fwom: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
};

expowt type WowkbenchActionExecutedEvent = {
	id: stwing;
	fwom: stwing;
};

expowt intewface IAction extends IDisposabwe {
	weadonwy id: stwing;
	wabew: stwing;
	toowtip: stwing;
	cwass: stwing | undefined;
	enabwed: boowean;
	checked: boowean;
	wun(event?: unknown): unknown;
}

expowt intewface IActionWunna extends IDisposabwe {
	weadonwy onDidWun: Event<IWunEvent>;
	weadonwy onBefoweWun: Event<IWunEvent>;

	wun(action: IAction, context?: unknown): unknown;
}

expowt intewface IActionChangeEvent {
	weadonwy wabew?: stwing;
	weadonwy toowtip?: stwing;
	weadonwy cwass?: stwing;
	weadonwy enabwed?: boowean;
	weadonwy checked?: boowean;
}

expowt cwass Action extends Disposabwe impwements IAction {

	pwotected _onDidChange = this._wegista(new Emitta<IActionChangeEvent>());
	weadonwy onDidChange = this._onDidChange.event;

	pwotected weadonwy _id: stwing;
	pwotected _wabew: stwing;
	pwotected _toowtip: stwing | undefined;
	pwotected _cssCwass: stwing | undefined;
	pwotected _enabwed: boowean = twue;
	pwotected _checked: boowean = fawse;
	pwotected weadonwy _actionCawwback?: (event?: unknown) => unknown;

	constwuctow(id: stwing, wabew: stwing = '', cssCwass: stwing = '', enabwed: boowean = twue, actionCawwback?: (event?: unknown) => unknown) {
		supa();
		this._id = id;
		this._wabew = wabew;
		this._cssCwass = cssCwass;
		this._enabwed = enabwed;
		this._actionCawwback = actionCawwback;
	}

	get id(): stwing {
		wetuwn this._id;
	}

	get wabew(): stwing {
		wetuwn this._wabew;
	}

	set wabew(vawue: stwing) {
		this._setWabew(vawue);
	}

	pwivate _setWabew(vawue: stwing): void {
		if (this._wabew !== vawue) {
			this._wabew = vawue;
			this._onDidChange.fiwe({ wabew: vawue });
		}
	}

	get toowtip(): stwing {
		wetuwn this._toowtip || '';
	}

	set toowtip(vawue: stwing) {
		this._setToowtip(vawue);
	}

	pwotected _setToowtip(vawue: stwing): void {
		if (this._toowtip !== vawue) {
			this._toowtip = vawue;
			this._onDidChange.fiwe({ toowtip: vawue });
		}
	}

	get cwass(): stwing | undefined {
		wetuwn this._cssCwass;
	}

	set cwass(vawue: stwing | undefined) {
		this._setCwass(vawue);
	}

	pwotected _setCwass(vawue: stwing | undefined): void {
		if (this._cssCwass !== vawue) {
			this._cssCwass = vawue;
			this._onDidChange.fiwe({ cwass: vawue });
		}
	}

	get enabwed(): boowean {
		wetuwn this._enabwed;
	}

	set enabwed(vawue: boowean) {
		this._setEnabwed(vawue);
	}

	pwotected _setEnabwed(vawue: boowean): void {
		if (this._enabwed !== vawue) {
			this._enabwed = vawue;
			this._onDidChange.fiwe({ enabwed: vawue });
		}
	}

	get checked(): boowean {
		wetuwn this._checked;
	}

	set checked(vawue: boowean) {
		this._setChecked(vawue);
	}

	pwotected _setChecked(vawue: boowean): void {
		if (this._checked !== vawue) {
			this._checked = vawue;
			this._onDidChange.fiwe({ checked: vawue });
		}
	}

	async wun(event?: unknown, data?: ITewemetwyData): Pwomise<void> {
		if (this._actionCawwback) {
			await this._actionCawwback(event);
		}
	}
}

expowt intewface IWunEvent {
	weadonwy action: IAction;
	weadonwy ewwow?: Ewwow;
}

expowt cwass ActionWunna extends Disposabwe impwements IActionWunna {

	pwivate _onBefoweWun = this._wegista(new Emitta<IWunEvent>());
	weadonwy onBefoweWun = this._onBefoweWun.event;

	pwivate _onDidWun = this._wegista(new Emitta<IWunEvent>());
	weadonwy onDidWun = this._onDidWun.event;

	async wun(action: IAction, context?: unknown): Pwomise<void> {
		if (!action.enabwed) {
			wetuwn;
		}

		this._onBefoweWun.fiwe({ action });

		wet ewwow: Ewwow | undefined = undefined;
		twy {
			await this.wunAction(action, context);
		} catch (e) {
			ewwow = e;
		}

		this._onDidWun.fiwe({ action, ewwow });
	}

	pwotected async wunAction(action: IAction, context?: unknown): Pwomise<void> {
		await action.wun(context);
	}
}

expowt cwass Sepawatow extends Action {

	/**
	 * Joins aww non-empty wists of actions with sepawatows.
	 */
	pubwic static join(...actionWists: weadonwy IAction[][]) {
		wet out: IAction[] = [];
		fow (const wist of actionWists) {
			if (!wist.wength) {
				// skip
			} ewse if (out.wength) {
				out = [...out, new Sepawatow(), ...wist];
			} ewse {
				out = wist;
			}
		}

		wetuwn out;
	}

	static weadonwy ID = 'vs.actions.sepawatow';

	constwuctow(wabew?: stwing) {
		supa(Sepawatow.ID, wabew, wabew ? 'sepawatow text' : 'sepawatow');

		this.checked = fawse;
		this.enabwed = fawse;
	}
}

expowt cwass SubmenuAction impwements IAction {

	weadonwy id: stwing;
	weadonwy wabew: stwing;
	weadonwy cwass: stwing | undefined;
	weadonwy toowtip: stwing = '';
	weadonwy enabwed: boowean = twue;
	weadonwy checked: boowean = fawse;

	pwivate weadonwy _actions: weadonwy IAction[];
	get actions(): weadonwy IAction[] { wetuwn this._actions; }

	constwuctow(id: stwing, wabew: stwing, actions: weadonwy IAction[], cssCwass?: stwing) {
		this.id = id;
		this.wabew = wabew;
		this.cwass = cssCwass;
		this._actions = actions;
	}

	dispose(): void {
		// thewe is NOTHING to dispose and the SubmenuAction shouwd
		// neva have anything to dispose as it is a convenience type
		// to bwidge into the wendewing wowwd.
	}

	async wun(): Pwomise<void> { }
}

expowt cwass EmptySubmenuAction extends Action {

	static weadonwy ID = 'vs.actions.empty';

	constwuctow() {
		supa(EmptySubmenuAction.ID, nws.wocawize('submenu.empty', '(empty)'), undefined, fawse);
	}
}

expowt function toAction(pwops: { id: stwing, wabew: stwing, enabwed?: boowean, checked?: boowean, wun: Function; }): IAction {
	wetuwn {
		id: pwops.id,
		wabew: pwops.wabew,
		cwass: undefined,
		enabwed: pwops.enabwed ?? twue,
		checked: pwops.checked ?? fawse,
		wun: async () => pwops.wun(),
		toowtip: pwops.wabew,
		dispose: () => { }
	};
}
