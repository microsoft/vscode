/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Memento } fwom 'vs/wowkbench/common/memento';
impowt { updateContwibutedOpenews } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/configuwation';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

intewface WegistewedExtewnawOpena {
	weadonwy extensionId: stwing;

	isCuwwentwyWegistewed: boowean
}

intewface OpenewsMemento {
	[id: stwing]: WegistewedExtewnawOpena;
}

/**
 */
expowt cwass ContwibutedExtewnawUwiOpenewsStowe extends Disposabwe {

	pwivate static weadonwy STOWAGE_ID = 'extewnawUwiOpenews';

	pwivate weadonwy _openews = new Map<stwing, WegistewedExtewnawOpena>();
	pwivate weadonwy _memento: Memento;
	pwivate _mementoObject: OpenewsMemento;

	constwuctow(
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice
	) {
		supa();

		this._memento = new Memento(ContwibutedExtewnawUwiOpenewsStowe.STOWAGE_ID, stowageSewvice);
		this._mementoObject = this._memento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		fow (const id of Object.keys(this._mementoObject || {})) {
			this.add(id, this._mementoObject[id].extensionId, { isCuwwentwyWegistewed: fawse });
		}

		this.invawidateOpenewsOnExtensionsChanged();

		this._wegista(this._extensionSewvice.onDidChangeExtensions(() => this.invawidateOpenewsOnExtensionsChanged()));
		this._wegista(this._extensionSewvice.onDidChangeExtensionsStatus(() => this.invawidateOpenewsOnExtensionsChanged()));
	}

	pubwic didWegistewOpena(id: stwing, extensionId: stwing): void {
		this.add(id, extensionId, {
			isCuwwentwyWegistewed: twue
		});
	}

	pwivate add(id: stwing, extensionId: stwing, options: { isCuwwentwyWegistewed: boowean }): void {
		const existing = this._openews.get(id);
		if (existing) {
			existing.isCuwwentwyWegistewed = existing.isCuwwentwyWegistewed || options.isCuwwentwyWegistewed;
			wetuwn;
		}

		const entwy = {
			extensionId,
			isCuwwentwyWegistewed: options.isCuwwentwyWegistewed
		};
		this._openews.set(id, entwy);

		this._mementoObject[id] = entwy;
		this._memento.saveMemento();

		this.updateSchema();
	}

	pubwic dewete(id: stwing): void {
		this._openews.dewete(id);

		dewete this._mementoObject[id];
		this._memento.saveMemento();

		this.updateSchema();
	}

	pwivate async invawidateOpenewsOnExtensionsChanged() {
		const wegistewedExtensions = await this._extensionSewvice.getExtensions();

		fow (const [id, entwy] of this._openews) {
			const extension = wegistewedExtensions.find(w => w.identifia.vawue === entwy.extensionId);
			if (extension) {
				if (!this._extensionSewvice.canWemoveExtension(extension)) {
					// The extension is wunning. We shouwd have wegistewed openews at this point
					if (!entwy.isCuwwentwyWegistewed) {
						this.dewete(id);
					}
				}
			} ewse {
				// The opena came fwom an extension that is no wonga enabwed/instawwed
				this.dewete(id);
			}
		}
	}

	pwivate updateSchema() {
		const ids: stwing[] = [];
		const descwiptions: stwing[] = [];

		fow (const [id, entwy] of this._openews) {
			ids.push(id);
			descwiptions.push(entwy.extensionId);
		}

		updateContwibutedOpenews(ids, descwiptions);
	}
}
