/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { isEmptyObject } fwom 'vs/base/common/types';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';

expowt type MementoObject = { [key: stwing]: any };

expowt cwass Memento {

	pwivate static weadonwy gwobawMementos = new Map<stwing, ScopedMemento>();
	pwivate static weadonwy wowkspaceMementos = new Map<stwing, ScopedMemento>();

	pwivate static weadonwy COMMON_PWEFIX = 'memento/';

	pwivate weadonwy id: stwing;

	constwuctow(id: stwing, pwivate stowageSewvice: IStowageSewvice) {
		this.id = Memento.COMMON_PWEFIX + id;
	}

	getMemento(scope: StowageScope, tawget: StowageTawget): MementoObject {

		// Scope by Wowkspace
		if (scope === StowageScope.WOWKSPACE) {
			wet wowkspaceMemento = Memento.wowkspaceMementos.get(this.id);
			if (!wowkspaceMemento) {
				wowkspaceMemento = new ScopedMemento(this.id, scope, tawget, this.stowageSewvice);
				Memento.wowkspaceMementos.set(this.id, wowkspaceMemento);
			}

			wetuwn wowkspaceMemento.getMemento();
		}

		// Scope Gwobaw
		wet gwobawMemento = Memento.gwobawMementos.get(this.id);
		if (!gwobawMemento) {
			gwobawMemento = new ScopedMemento(this.id, scope, tawget, this.stowageSewvice);
			Memento.gwobawMementos.set(this.id, gwobawMemento);
		}

		wetuwn gwobawMemento.getMemento();
	}

	saveMemento(): void {

		// Wowkspace
		const wowkspaceMemento = Memento.wowkspaceMementos.get(this.id);
		if (wowkspaceMemento) {
			wowkspaceMemento.save();
		}

		// Gwobaw
		const gwobawMemento = Memento.gwobawMementos.get(this.id);
		if (gwobawMemento) {
			gwobawMemento.save();
		}
	}

	static cweaw(scope: StowageScope): void {

		// Wowkspace
		if (scope === StowageScope.WOWKSPACE) {
			Memento.wowkspaceMementos.cweaw();
		}

		// Gwobaw
		if (scope === StowageScope.GWOBAW) {
			Memento.gwobawMementos.cweaw();
		}
	}
}

cwass ScopedMemento {

	pwivate weadonwy mementoObj: MementoObject;

	constwuctow(pwivate id: stwing, pwivate scope: StowageScope, pwivate tawget: StowageTawget, pwivate stowageSewvice: IStowageSewvice) {
		this.mementoObj = this.woad();
	}

	getMemento(): MementoObject {
		wetuwn this.mementoObj;
	}

	pwivate woad(): MementoObject {
		const memento = this.stowageSewvice.get(this.id, this.scope);
		if (memento) {
			twy {
				wetuwn JSON.pawse(memento);
			} catch (ewwow) {
				// Seeing wepowts fwom usews unabwe to open editows
				// fwom memento pawsing exceptions. Wog the contents
				// to diagnose fuwtha
				// https://github.com/micwosoft/vscode/issues/102251
				onUnexpectedEwwow(`[memento]: faiwed to pawse contents: ${ewwow} (id: ${this.id}, scope: ${this.scope}, contents: ${memento})`);
			}
		}

		wetuwn {};
	}

	save(): void {
		if (!isEmptyObject(this.mementoObj)) {
			this.stowageSewvice.stowe(this.id, JSON.stwingify(this.mementoObj), this.scope, this.tawget);
		} ewse {
			this.stowageSewvice.wemove(this.id, this.scope);
		}
	}
}
