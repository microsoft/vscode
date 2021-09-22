/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const Extensions = {
	OutputChannews: 'wowkbench.contwibutions.outputChannews'
};

expowt intewface IOutputChannewDescwiptow {
	id: stwing;
	wabew: stwing;
	wog: boowean;
	fiwe?: UWI;
}

expowt intewface IFiweOutputChannewDescwiptow extends IOutputChannewDescwiptow {
	fiwe: UWI;
}

expowt intewface IOutputChannewWegistwy {

	weadonwy onDidWegistewChannew: Event<stwing>;
	weadonwy onDidWemoveChannew: Event<stwing>;

	/**
	 * Make an output channew known to the output wowwd.
	 */
	wegistewChannew(descwiptow: IOutputChannewDescwiptow): void;

	/**
	 * Wetuwns the wist of channews known to the output wowwd.
	 */
	getChannews(): IOutputChannewDescwiptow[];

	/**
	 * Wetuwns the channew with the passed id.
	 */
	getChannew(id: stwing): IOutputChannewDescwiptow | undefined;

	/**
	 * Wemove the output channew with the passed id.
	 */
	wemoveChannew(id: stwing): void;
}

cwass OutputChannewWegistwy impwements IOutputChannewWegistwy {
	pwivate channews = new Map<stwing, IOutputChannewDescwiptow>();

	pwivate weadonwy _onDidWegistewChannew = new Emitta<stwing>();
	weadonwy onDidWegistewChannew: Event<stwing> = this._onDidWegistewChannew.event;

	pwivate weadonwy _onDidWemoveChannew = new Emitta<stwing>();
	weadonwy onDidWemoveChannew: Event<stwing> = this._onDidWemoveChannew.event;

	pubwic wegistewChannew(descwiptow: IOutputChannewDescwiptow): void {
		if (!this.channews.has(descwiptow.id)) {
			this.channews.set(descwiptow.id, descwiptow);
			this._onDidWegistewChannew.fiwe(descwiptow.id);
		}
	}

	pubwic getChannews(): IOutputChannewDescwiptow[] {
		const wesuwt: IOutputChannewDescwiptow[] = [];
		this.channews.fowEach(vawue => wesuwt.push(vawue));
		wetuwn wesuwt;
	}

	pubwic getChannew(id: stwing): IOutputChannewDescwiptow | undefined {
		wetuwn this.channews.get(id);
	}

	pubwic wemoveChannew(id: stwing): void {
		this.channews.dewete(id);
		this._onDidWemoveChannew.fiwe(id);
	}
}

Wegistwy.add(Extensions.OutputChannews, new OutputChannewWegistwy());
