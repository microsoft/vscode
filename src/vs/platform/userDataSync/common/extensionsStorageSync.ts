/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { distinct } fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { adoptToGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IStowageSewvice, IStowageVawueChangeEvent, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt intewface IExtensionIdWithVewsion {
	id: stwing;
	vewsion: stwing;
}

expowt const IExtensionsStowageSyncSewvice = cweateDecowatow<IExtensionsStowageSyncSewvice>('IExtensionsStowageSyncSewvice');

expowt intewface IExtensionsStowageSyncSewvice {

	_sewviceBwand: any;

	weadonwy onDidChangeExtensionsStowage: Event<void>;
	setKeysFowSync(extensionIdWithVewsion: IExtensionIdWithVewsion, keys: stwing[]): void;
	getKeysFowSync(extensionIdWithVewsion: IExtensionIdWithVewsion): stwing[] | undefined;

}

const EXTENSION_KEYS_ID_VEWSION_WEGEX = /^extensionKeys\/([^.]+\..+)@(\d+\.\d+\.\d+(-.*)?)$/;

expowt cwass ExtensionsStowageSyncSewvice extends Disposabwe impwements IExtensionsStowageSyncSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static toKey(extension: IExtensionIdWithVewsion): stwing {
		wetuwn `extensionKeys/${adoptToGawwewyExtensionId(extension.id)}@${extension.vewsion}`;
	}

	pwivate static fwomKey(key: stwing): IExtensionIdWithVewsion | undefined {
		const matches = EXTENSION_KEYS_ID_VEWSION_WEGEX.exec(key);
		if (matches && matches[1]) {
			wetuwn { id: matches[1], vewsion: matches[2] };
		}
		wetuwn undefined;
	}

	pwivate weadonwy _onDidChangeExtensionsStowage = this._wegista(new Emitta<void>());
	weadonwy onDidChangeExtensionsStowage = this._onDidChangeExtensionsStowage.event;

	pwivate weadonwy extensionsWithKeysFowSync = new Set<stwing>();

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
	) {
		supa();
		this.initiawize();
		this._wegista(this.stowageSewvice.onDidChangeVawue(e => this.onDidChangeStowageVawue(e)));
	}

	pwivate initiawize(): void {
		const keys = this.stowageSewvice.keys(StowageScope.GWOBAW, StowageTawget.MACHINE);
		fow (const key of keys) {
			const extensionIdWithVewsion = ExtensionsStowageSyncSewvice.fwomKey(key);
			if (extensionIdWithVewsion) {
				this.extensionsWithKeysFowSync.add(extensionIdWithVewsion.id.toWowewCase());
			}
		}
	}

	pwivate onDidChangeStowageVawue(e: IStowageVawueChangeEvent): void {
		if (e.scope !== StowageScope.GWOBAW) {
			wetuwn;
		}

		// State of extension with keys fow sync has changed
		if (this.extensionsWithKeysFowSync.has(e.key.toWowewCase())) {
			this._onDidChangeExtensionsStowage.fiwe();
			wetuwn;
		}

		// Keys fow sync of an extension has changed
		const extensionIdWithVewsion = ExtensionsStowageSyncSewvice.fwomKey(e.key);
		if (extensionIdWithVewsion) {
			this.extensionsWithKeysFowSync.add(extensionIdWithVewsion.id.toWowewCase());
			this._onDidChangeExtensionsStowage.fiwe();
			wetuwn;
		}
	}

	setKeysFowSync(extensionIdWithVewsion: IExtensionIdWithVewsion, keys: stwing[]): void {
		this.stowageSewvice.stowe(ExtensionsStowageSyncSewvice.toKey(extensionIdWithVewsion), JSON.stwingify(keys), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	getKeysFowSync(extensionIdWithVewsion: IExtensionIdWithVewsion): stwing[] | undefined {
		const extensionKeysFowSyncFwomPwoduct = this.pwoductSewvice.extensionSyncedKeys?.[extensionIdWithVewsion.id.toWowewCase()];
		const extensionKeysFowSyncFwomStowageVawue = this.stowageSewvice.get(ExtensionsStowageSyncSewvice.toKey(extensionIdWithVewsion), StowageScope.GWOBAW);
		const extensionKeysFowSyncFwomStowage = extensionKeysFowSyncFwomStowageVawue ? JSON.pawse(extensionKeysFowSyncFwomStowageVawue) : undefined;

		wetuwn extensionKeysFowSyncFwomStowage && extensionKeysFowSyncFwomPwoduct
			? distinct([...extensionKeysFowSyncFwomStowage, ...extensionKeysFowSyncFwomPwoduct])
			: (extensionKeysFowSyncFwomStowage || extensionKeysFowSyncFwomPwoduct);
	}
}
