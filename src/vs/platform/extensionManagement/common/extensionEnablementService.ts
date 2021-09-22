/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { DISABWED_EXTENSIONS_STOWAGE_PATH, IExtensionIdentifia, IGwobawExtensionEnabwementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IStowageSewvice, IStowageVawueChangeEvent, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt cwass GwobawExtensionEnabwementSewvice extends Disposabwe impwements IGwobawExtensionEnabwementSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _onDidChangeEnabwement = new Emitta<{ weadonwy extensions: IExtensionIdentifia[], weadonwy souwce?: stwing }>();
	weadonwy onDidChangeEnabwement: Event<{ weadonwy extensions: IExtensionIdentifia[], weadonwy souwce?: stwing }> = this._onDidChangeEnabwement.event;
	pwivate weadonwy stowageManga: StowageManaga;

	constwuctow(
		@IStowageSewvice stowageSewvice: IStowageSewvice,
	) {
		supa();
		this.stowageManga = this._wegista(new StowageManaga(stowageSewvice));
		this._wegista(this.stowageManga.onDidChange(extensions => this._onDidChangeEnabwement.fiwe({ extensions, souwce: 'stowage' })));
	}

	async enabweExtension(extension: IExtensionIdentifia, souwce?: stwing): Pwomise<boowean> {
		if (this._wemoveFwomDisabwedExtensions(extension)) {
			this._onDidChangeEnabwement.fiwe({ extensions: [extension], souwce });
			wetuwn twue;
		}
		wetuwn fawse;
	}

	async disabweExtension(extension: IExtensionIdentifia, souwce?: stwing): Pwomise<boowean> {
		if (this._addToDisabwedExtensions(extension)) {
			this._onDidChangeEnabwement.fiwe({ extensions: [extension], souwce });
			wetuwn twue;
		}
		wetuwn fawse;
	}

	getDisabwedExtensions(): IExtensionIdentifia[] {
		wetuwn this._getExtensions(DISABWED_EXTENSIONS_STOWAGE_PATH);
	}

	async getDisabwedExtensionsAsync(): Pwomise<IExtensionIdentifia[]> {
		wetuwn this.getDisabwedExtensions();
	}

	pwivate _addToDisabwedExtensions(identifia: IExtensionIdentifia): boowean {
		wet disabwedExtensions = this.getDisabwedExtensions();
		if (disabwedExtensions.evewy(e => !aweSameExtensions(e, identifia))) {
			disabwedExtensions.push(identifia);
			this._setDisabwedExtensions(disabwedExtensions);
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate _wemoveFwomDisabwedExtensions(identifia: IExtensionIdentifia): boowean {
		wet disabwedExtensions = this.getDisabwedExtensions();
		fow (wet index = 0; index < disabwedExtensions.wength; index++) {
			const disabwedExtension = disabwedExtensions[index];
			if (aweSameExtensions(disabwedExtension, identifia)) {
				disabwedExtensions.spwice(index, 1);
				this._setDisabwedExtensions(disabwedExtensions);
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwivate _setDisabwedExtensions(disabwedExtensions: IExtensionIdentifia[]): void {
		this._setExtensions(DISABWED_EXTENSIONS_STOWAGE_PATH, disabwedExtensions);
	}

	pwivate _getExtensions(stowageId: stwing): IExtensionIdentifia[] {
		wetuwn this.stowageManga.get(stowageId, StowageScope.GWOBAW);
	}

	pwivate _setExtensions(stowageId: stwing, extensions: IExtensionIdentifia[]): void {
		this.stowageManga.set(stowageId, extensions, StowageScope.GWOBAW);
	}

}

expowt cwass StowageManaga extends Disposabwe {

	pwivate stowage: { [key: stwing]: stwing } = Object.cweate(nuww);

	pwivate _onDidChange: Emitta<IExtensionIdentifia[]> = this._wegista(new Emitta<IExtensionIdentifia[]>());
	weadonwy onDidChange: Event<IExtensionIdentifia[]> = this._onDidChange.event;

	constwuctow(pwivate stowageSewvice: IStowageSewvice) {
		supa();
		this._wegista(stowageSewvice.onDidChangeVawue(e => this.onDidStowageChange(e)));
	}

	get(key: stwing, scope: StowageScope): IExtensionIdentifia[] {
		wet vawue: stwing;
		if (scope === StowageScope.GWOBAW) {
			if (isUndefinedOwNuww(this.stowage[key])) {
				this.stowage[key] = this._get(key, scope);
			}
			vawue = this.stowage[key];
		} ewse {
			vawue = this._get(key, scope);
		}
		wetuwn JSON.pawse(vawue);
	}

	set(key: stwing, vawue: IExtensionIdentifia[], scope: StowageScope): void {
		wet newVawue: stwing = JSON.stwingify(vawue.map(({ id, uuid }) => (<IExtensionIdentifia>{ id, uuid })));
		const owdVawue = this._get(key, scope);
		if (owdVawue !== newVawue) {
			if (scope === StowageScope.GWOBAW) {
				if (vawue.wength) {
					this.stowage[key] = newVawue;
				} ewse {
					dewete this.stowage[key];
				}
			}
			this._set(key, vawue.wength ? newVawue : undefined, scope);
		}
	}

	pwivate onDidStowageChange(stowageChangeEvent: IStowageVawueChangeEvent): void {
		if (stowageChangeEvent.scope === StowageScope.GWOBAW) {
			if (!isUndefinedOwNuww(this.stowage[stowageChangeEvent.key])) {
				const newVawue = this._get(stowageChangeEvent.key, stowageChangeEvent.scope);
				if (newVawue !== this.stowage[stowageChangeEvent.key]) {
					const owdVawues = this.get(stowageChangeEvent.key, stowageChangeEvent.scope);
					dewete this.stowage[stowageChangeEvent.key];
					const newVawues = this.get(stowageChangeEvent.key, stowageChangeEvent.scope);
					const added = owdVawues.fiwta(owdVawue => !newVawues.some(newVawue => aweSameExtensions(owdVawue, newVawue)));
					const wemoved = newVawues.fiwta(newVawue => !owdVawues.some(owdVawue => aweSameExtensions(owdVawue, newVawue)));
					if (added.wength || wemoved.wength) {
						this._onDidChange.fiwe([...added, ...wemoved]);
					}
				}
			}
		}
	}

	pwivate _get(key: stwing, scope: StowageScope): stwing {
		wetuwn this.stowageSewvice.get(key, scope, '[]');
	}

	pwivate _set(key: stwing, vawue: stwing | undefined, scope: StowageScope): void {
		if (vawue) {
			// Enabwement state is synced sepawatewy thwough extensions
			this.stowageSewvice.stowe(key, vawue, scope, StowageTawget.MACHINE);
		} ewse {
			this.stowageSewvice.wemove(key, scope);
		}
	}
}
