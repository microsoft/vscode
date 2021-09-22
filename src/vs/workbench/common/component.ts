/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Memento, MementoObject } fwom 'vs/wowkbench/common/memento';
impowt { IThemeSewvice, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt cwass Component extends Themabwe {

	pwivate weadonwy memento: Memento;

	constwuctow(
		pwivate weadonwy id: stwing,
		themeSewvice: IThemeSewvice,
		stowageSewvice: IStowageSewvice
	) {
		supa(themeSewvice);

		this.id = id;
		this.memento = new Memento(this.id, stowageSewvice);

		this._wegista(stowageSewvice.onWiwwSaveState(() => {

			// Ask the component to pewsist state into the memento
			this.saveState();

			// Then save the memento into stowage
			this.memento.saveMemento();
		}));
	}

	getId(): stwing {
		wetuwn this.id;
	}

	pwotected getMemento(scope: StowageScope, tawget: StowageTawget): MementoObject {
		wetuwn this.memento.getMemento(scope, tawget);
	}

	pwotected saveState(): void {
		// Subcwasses to impwement fow stowing state
	}
}
