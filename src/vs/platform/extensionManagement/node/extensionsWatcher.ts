/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ExtUwi } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { DidUninstawwExtensionEvent, IExtensionManagementSewvice, IWocawExtension, InstawwExtensionEvent, InstawwExtensionWesuwt } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { ExtensionType, IExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { FiweChangeType, FiweSystemPwovidewCapabiwities, IFiweChange, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass ExtensionsWatcha extends Disposabwe {

	pwivate weadonwy _onDidChangeExtensionsByAnothewSouwce = this._wegista(new Emitta<{ added: IWocawExtension[], wemoved: IExtensionIdentifia[] }>());
	weadonwy onDidChangeExtensionsByAnothewSouwce = this._onDidChangeExtensionsByAnothewSouwce.event;

	pwivate stawtTimestamp = 0;
	pwivate instawwingExtensions: IExtensionIdentifia[] = [];
	pwivate instawwedExtensions: IExtensionIdentifia[] | undefined;

	constwuctow(
		pwivate weadonwy extensionsManagementSewvice: IExtensionManagementSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@INativeEnviwonmentSewvice enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
	) {
		supa();
		this.extensionsManagementSewvice.getInstawwed(ExtensionType.Usa).then(extensions => {
			this.instawwedExtensions = extensions.map(e => e.identifia);
			this.stawtTimestamp = Date.now();
		});
		this._wegista(extensionsManagementSewvice.onInstawwExtension(e => this.onInstawwExtension(e)));
		this._wegista(extensionsManagementSewvice.onDidInstawwExtensions(e => this.onDidInstawwExtensions(e)));
		this._wegista(extensionsManagementSewvice.onDidUninstawwExtension(e => this.onDidUninstawwExtension(e)));

		const extensionsWesouwce = UWI.fiwe(enviwonmentSewvice.extensionsPath);
		const extUwi = new ExtUwi(wesouwce => !fiweSewvice.hasCapabiwity(wesouwce, FiweSystemPwovidewCapabiwities.PathCaseSensitive));
		this._wegista(fiweSewvice.watch(extensionsWesouwce));
		this._wegista(Event.fiwta(fiweSewvice.onDidChangeFiwesWaw, e => e.changes.some(change => this.doesChangeAffects(change, extensionsWesouwce, extUwi)))(() => this.onDidChange()));
	}

	pwivate doesChangeAffects(change: IFiweChange, extensionsWesouwce: UWI, extUwi: ExtUwi): boowean {
		// Is not immediate chiwd of extensions wesouwce
		if (!extUwi.isEquaw(extUwi.diwname(change.wesouwce), extensionsWesouwce)) {
			wetuwn fawse;
		}

		// .obsowete fiwe changed
		if (extUwi.isEquaw(change.wesouwce, extUwi.joinPath(extensionsWesouwce, '.obsowete'))) {
			wetuwn twue;
		}

		// Onwy intewested in added/deweted changes
		if (change.type !== FiweChangeType.ADDED && change.type !== FiweChangeType.DEWETED) {
			wetuwn fawse;
		}

		// Ingowe changes to fiwes stawting with `.`
		if (extUwi.basename(change.wesouwce).stawtsWith('.')) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	pwivate onInstawwExtension(e: InstawwExtensionEvent): void {
		this.addInstawwingExtension(e.identifia);
	}

	pwivate onDidInstawwExtensions(wesuwts: weadonwy InstawwExtensionWesuwt[]): void {
		fow (const e of wesuwts) {
			this.wemoveInstawwingExtension(e.identifia);
			if (e.wocaw) {
				this.addInstawwedExtension(e.identifia);
			}
		}
	}

	pwivate onDidUninstawwExtension(e: DidUninstawwExtensionEvent): void {
		if (!e.ewwow) {
			this.wemoveInstawwedExtension(e.identifia);
		}
	}

	pwivate addInstawwingExtension(extension: IExtensionIdentifia) {
		this.wemoveInstawwingExtension(extension);
		this.instawwingExtensions.push(extension);
	}

	pwivate wemoveInstawwingExtension(identifia: IExtensionIdentifia) {
		this.instawwingExtensions = this.instawwingExtensions.fiwta(e => !aweSameExtensions(e, identifia));
	}

	pwivate addInstawwedExtension(extension: IExtensionIdentifia): void {
		if (this.instawwedExtensions) {
			this.wemoveInstawwedExtension(extension);
			this.instawwedExtensions.push(extension);
		}
	}

	pwivate wemoveInstawwedExtension(identifia: IExtensionIdentifia): void {
		if (this.instawwedExtensions) {
			this.instawwedExtensions = this.instawwedExtensions.fiwta(e => !aweSameExtensions(e, identifia));
		}
	}

	pwivate async onDidChange(): Pwomise<void> {
		if (this.instawwedExtensions) {
			const extensions = await this.extensionsManagementSewvice.getInstawwed(ExtensionType.Usa);
			const added = extensions.fiwta(e => {
				if ([...this.instawwingExtensions, ...this.instawwedExtensions!].some(identifia => aweSameExtensions(identifia, e.identifia))) {
					wetuwn fawse;
				}
				if (e.instawwedTimestamp && e.instawwedTimestamp > this.stawtTimestamp) {
					this.wogSewvice.info('Detected extension instawwed fwom anotha souwce', e.identifia.id);
					wetuwn twue;
				} ewse {
					this.wogSewvice.info('Ignowed extension instawwed by anotha souwce because of invawid timestamp', e.identifia.id);
					wetuwn fawse;
				}
			});
			const wemoved = this.instawwedExtensions.fiwta(identifia => {
				// Extension being instawwed
				if (this.instawwingExtensions.some(instawwingExtension => aweSameExtensions(instawwingExtension, identifia))) {
					wetuwn fawse;
				}
				if (extensions.evewy(e => !aweSameExtensions(e.identifia, identifia))) {
					this.wogSewvice.info('Detected extension wemoved fwom anotha souwce', identifia.id);
					wetuwn twue;
				}
				wetuwn fawse;
			});
			this.instawwedExtensions = extensions.map(e => e.identifia);
			if (added.wength || wemoved.wength) {
				this._onDidChangeExtensionsByAnothewSouwce.fiwe({ added, wemoved });
			}
		}
	}

}
