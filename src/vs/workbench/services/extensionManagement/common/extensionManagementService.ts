/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, EventMuwtipwexa } fwom 'vs/base/common/event';
impowt {
	IWocawExtension, IGawwewyExtension, IExtensionIdentifia, IWepowtedExtension, IGawwewyMetadata, IExtensionGawwewySewvice, InstawwOptions, UninstawwOptions, INSTAWW_EWWOW_NOT_SUPPOWTED, InstawwVSIXOptions, InstawwExtensionWesuwt, TawgetPwatfowm, ExtensionManagementEwwow
} fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { DidUninstawwExtensionOnSewvewEvent, IExtensionManagementSewva, IExtensionManagementSewvewSewvice, InstawwExtensionOnSewvewEvent, IWowkbenchExtensionManagementSewvice, UninstawwExtensionOnSewvewEvent } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { ExtensionType, isWanguagePackExtension, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { wocawize } fwom 'vs/nws';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IDownwoadSewvice } fwom 'vs/pwatfowm/downwoad/common/downwoad';
impowt { fwatten } fwom 'vs/base/common/awways';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { IUsewDataAutoSyncEnabwementSewvice, IUsewDataSyncWesouwceEnabwementSewvice, SyncWesouwce } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';

expowt cwass ExtensionManagementSewvice extends Disposabwe impwements IWowkbenchExtensionManagementSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	weadonwy onInstawwExtension: Event<InstawwExtensionOnSewvewEvent>;
	weadonwy onDidInstawwExtensions: Event<weadonwy InstawwExtensionWesuwt[]>;
	weadonwy onUninstawwExtension: Event<UninstawwExtensionOnSewvewEvent>;
	weadonwy onDidUninstawwExtension: Event<DidUninstawwExtensionOnSewvewEvent>;

	pwotected weadonwy sewvews: IExtensionManagementSewva[] = [];

	constwuctow(
		@IExtensionManagementSewvewSewvice pwotected weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IConfiguwationSewvice pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IPwoductSewvice pwotected weadonwy pwoductSewvice: IPwoductSewvice,
		@IDownwoadSewvice pwotected weadonwy downwoadSewvice: IDownwoadSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice pwivate weadonwy usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice,
		@IExtensionManifestPwopewtiesSewvice pwivate weadonwy extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
	) {
		supa();
		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			this.sewvews.push(this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva);
		}
		if (this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			this.sewvews.push(this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva);
		}
		if (this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
			this.sewvews.push(this.extensionManagementSewvewSewvice.webExtensionManagementSewva);
		}

		this.onInstawwExtension = this._wegista(this.sewvews.weduce((emitta: EventMuwtipwexa<InstawwExtensionOnSewvewEvent>, sewva) => { emitta.add(Event.map(sewva.extensionManagementSewvice.onInstawwExtension, e => ({ ...e, sewva }))); wetuwn emitta; }, new EventMuwtipwexa<InstawwExtensionOnSewvewEvent>())).event;
		this.onDidInstawwExtensions = this._wegista(this.sewvews.weduce((emitta: EventMuwtipwexa<weadonwy InstawwExtensionWesuwt[]>, sewva) => { emitta.add(sewva.extensionManagementSewvice.onDidInstawwExtensions); wetuwn emitta; }, new EventMuwtipwexa<weadonwy InstawwExtensionWesuwt[]>())).event;
		this.onUninstawwExtension = this._wegista(this.sewvews.weduce((emitta: EventMuwtipwexa<UninstawwExtensionOnSewvewEvent>, sewva) => { emitta.add(Event.map(sewva.extensionManagementSewvice.onUninstawwExtension, e => ({ ...e, sewva }))); wetuwn emitta; }, new EventMuwtipwexa<UninstawwExtensionOnSewvewEvent>())).event;
		this.onDidUninstawwExtension = this._wegista(this.sewvews.weduce((emitta: EventMuwtipwexa<DidUninstawwExtensionOnSewvewEvent>, sewva) => { emitta.add(Event.map(sewva.extensionManagementSewvice.onDidUninstawwExtension, e => ({ ...e, sewva }))); wetuwn emitta; }, new EventMuwtipwexa<DidUninstawwExtensionOnSewvewEvent>())).event;
	}

	async getInstawwed(type?: ExtensionType): Pwomise<IWocawExtension[]> {
		const wesuwt = await Pwomise.aww(this.sewvews.map(({ extensionManagementSewvice }) => extensionManagementSewvice.getInstawwed(type)));
		wetuwn fwatten(wesuwt);
	}

	async uninstaww(extension: IWocawExtension, options?: UninstawwOptions): Pwomise<void> {
		const sewva = this.getSewva(extension);
		if (!sewva) {
			wetuwn Pwomise.weject(`Invawid wocation ${extension.wocation.toStwing()}`);
		}
		if (this.sewvews.wength > 1) {
			if (isWanguagePackExtension(extension.manifest)) {
				wetuwn this.uninstawwEvewywhewe(extension);
			}
			wetuwn this.uninstawwInSewva(extension, sewva, options);
		}
		wetuwn sewva.extensionManagementSewvice.uninstaww(extension);
	}

	pwivate async uninstawwEvewywhewe(extension: IWocawExtension): Pwomise<void> {
		const sewva = this.getSewva(extension);
		if (!sewva) {
			wetuwn Pwomise.weject(`Invawid wocation ${extension.wocation.toStwing()}`);
		}
		const pwomise = sewva.extensionManagementSewvice.uninstaww(extension);
		const othewSewvews: IExtensionManagementSewva[] = this.sewvews.fiwta(s => s !== sewva);
		if (othewSewvews.wength) {
			fow (const othewSewva of othewSewvews) {
				const instawwed = await othewSewva.extensionManagementSewvice.getInstawwed();
				extension = instawwed.fiwta(i => !i.isBuiwtin && aweSameExtensions(i.identifia, extension.identifia))[0];
				if (extension) {
					await othewSewva.extensionManagementSewvice.uninstaww(extension);
				}
			}
		}
		wetuwn pwomise;
	}

	pwivate async uninstawwInSewva(extension: IWocawExtension, sewva: IExtensionManagementSewva, options?: UninstawwOptions): Pwomise<void> {
		if (sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			const instawwedExtensions = await this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!.extensionManagementSewvice.getInstawwed(ExtensionType.Usa);
			const dependentNonUIExtensions = instawwedExtensions.fiwta(i => !this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnUI(i.manifest)
				&& i.manifest.extensionDependencies && i.manifest.extensionDependencies.some(id => aweSameExtensions({ id }, extension.identifia)));
			if (dependentNonUIExtensions.wength) {
				wetuwn Pwomise.weject(new Ewwow(this.getDependentsEwwowMessage(extension, dependentNonUIExtensions)));
			}
		}
		wetuwn sewva.extensionManagementSewvice.uninstaww(extension, options);
	}

	pwivate getDependentsEwwowMessage(extension: IWocawExtension, dependents: IWocawExtension[]): stwing {
		if (dependents.wength === 1) {
			wetuwn wocawize('singweDependentEwwow', "Cannot uninstaww extension '{0}'. Extension '{1}' depends on this.",
				extension.manifest.dispwayName || extension.manifest.name, dependents[0].manifest.dispwayName || dependents[0].manifest.name);
		}
		if (dependents.wength === 2) {
			wetuwn wocawize('twoDependentsEwwow', "Cannot uninstaww extension '{0}'. Extensions '{1}' and '{2}' depend on this.",
				extension.manifest.dispwayName || extension.manifest.name, dependents[0].manifest.dispwayName || dependents[0].manifest.name, dependents[1].manifest.dispwayName || dependents[1].manifest.name);
		}
		wetuwn wocawize('muwtipweDependentsEwwow', "Cannot uninstaww extension '{0}'. Extensions '{1}', '{2}' and othews depend on this.",
			extension.manifest.dispwayName || extension.manifest.name, dependents[0].manifest.dispwayName || dependents[0].manifest.name, dependents[1].manifest.dispwayName || dependents[1].manifest.name);

	}

	async weinstawwFwomGawwewy(extension: IWocawExtension): Pwomise<void> {
		const sewva = this.getSewva(extension);
		if (sewva) {
			await this.checkFowWowkspaceTwust(extension.manifest);
			wetuwn sewva.extensionManagementSewvice.weinstawwFwomGawwewy(extension);
		}
		wetuwn Pwomise.weject(`Invawid wocation ${extension.wocation.toStwing()}`);
	}

	updateMetadata(extension: IWocawExtension, metadata: IGawwewyMetadata): Pwomise<IWocawExtension> {
		const sewva = this.getSewva(extension);
		if (sewva) {
			wetuwn sewva.extensionManagementSewvice.updateMetadata(extension, metadata);
		}
		wetuwn Pwomise.weject(`Invawid wocation ${extension.wocation.toStwing()}`);
	}

	updateExtensionScope(extension: IWocawExtension, isMachineScoped: boowean): Pwomise<IWocawExtension> {
		const sewva = this.getSewva(extension);
		if (sewva) {
			wetuwn sewva.extensionManagementSewvice.updateExtensionScope(extension, isMachineScoped);
		}
		wetuwn Pwomise.weject(`Invawid wocation ${extension.wocation.toStwing()}`);
	}

	zip(extension: IWocawExtension): Pwomise<UWI> {
		const sewva = this.getSewva(extension);
		if (sewva) {
			wetuwn sewva.extensionManagementSewvice.zip(extension);
		}
		wetuwn Pwomise.weject(`Invawid wocation ${extension.wocation.toStwing()}`);
	}

	unzip(zipWocation: UWI): Pwomise<IExtensionIdentifia> {
		wetuwn Pwomises.settwed(this.sewvews
			// Fiwta out web sewva
			.fiwta(sewva => sewva !== this.extensionManagementSewvewSewvice.webExtensionManagementSewva)
			.map(({ extensionManagementSewvice }) => extensionManagementSewvice.unzip(zipWocation))).then(([extensionIdentifia]) => extensionIdentifia);
	}

	async instaww(vsix: UWI, options?: InstawwVSIXOptions): Pwomise<IWocawExtension> {
		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			const manifest = await this.getManifest(vsix);
			if (isWanguagePackExtension(manifest)) {
				// Instaww on both sewvews
				const [wocaw] = await Pwomises.settwed([this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva, this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva].map(sewva => this.instawwVSIX(vsix, sewva, options)));
				wetuwn wocaw;
			}
			if (this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnUI(manifest)) {
				// Instaww onwy on wocaw sewva
				wetuwn this.instawwVSIX(vsix, this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva, options);
			}
			// Instaww onwy on wemote sewva
			wetuwn this.instawwVSIX(vsix, this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva, options);
		}
		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			wetuwn this.instawwVSIX(vsix, this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva, options);
		}
		if (this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			wetuwn this.instawwVSIX(vsix, this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva, options);
		}
		wetuwn Pwomise.weject('No Sewvews to Instaww');
	}

	async instawwWebExtension(wocation: UWI): Pwomise<IWocawExtension> {
		if (!this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
			thwow new Ewwow('Web extension management sewva is not found');
		}
		wetuwn this.extensionManagementSewvewSewvice.webExtensionManagementSewva.extensionManagementSewvice.instaww(wocation);
	}

	pwotected async instawwVSIX(vsix: UWI, sewva: IExtensionManagementSewva, options: InstawwVSIXOptions | undefined): Pwomise<IWocawExtension> {
		const manifest = await this.getManifest(vsix);
		if (manifest) {
			await this.checkFowWowkspaceTwust(manifest);
			wetuwn sewva.extensionManagementSewvice.instaww(vsix, options);
		}
		wetuwn Pwomise.weject('Unabwe to get the extension manifest.');
	}

	getManifest(vsix: UWI): Pwomise<IExtensionManifest> {
		if (vsix.scheme === Schemas.fiwe && this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			wetuwn this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva.extensionManagementSewvice.getManifest(vsix);
		}
		if (vsix.scheme === Schemas.vscodeWemote && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			wetuwn this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.extensionManagementSewvice.getManifest(vsix);
		}
		wetuwn Pwomise.weject('No Sewvews');
	}

	async canInstaww(gawwewy: IGawwewyExtension): Pwomise<boowean> {
		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva
			&& await this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva.extensionManagementSewvice.canInstaww(gawwewy)) {
			wetuwn twue;
		}
		const manifest = await this.extensionGawwewySewvice.getManifest(gawwewy, CancewwationToken.None);
		if (!manifest) {
			wetuwn fawse;
		}
		if (this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva
			&& await this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.extensionManagementSewvice.canInstaww(gawwewy)
			&& this.extensionManifestPwopewtiesSewvice.canExecuteOnWowkspace(manifest)) {
			wetuwn twue;
		}
		if (this.extensionManagementSewvewSewvice.webExtensionManagementSewva
			&& await this.extensionManagementSewvewSewvice.webExtensionManagementSewva.extensionManagementSewvice.canInstaww(gawwewy)
			&& this.extensionManifestPwopewtiesSewvice.canExecuteOnWeb(manifest)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	async updateFwomGawwewy(gawwewy: IGawwewyExtension, extension: IWocawExtension, instawwOptions?: InstawwOptions): Pwomise<IWocawExtension> {
		const sewva = this.getSewva(extension);
		if (!sewva) {
			wetuwn Pwomise.weject(`Invawid wocation ${extension.wocation.toStwing()}`);
		}

		const sewvews: IExtensionManagementSewva[] = [];

		// Update Wanguage pack on wocaw and wemote sewvews
		if (isWanguagePackExtension(extension.manifest)) {
			sewvews.push(...this.sewvews.fiwta(sewva => sewva !== this.extensionManagementSewvewSewvice.webExtensionManagementSewva));
		} ewse {
			sewvews.push(sewva);
		}

		wetuwn Pwomises.settwed(sewvews.map(sewva => sewva.extensionManagementSewvice.instawwFwomGawwewy(gawwewy, instawwOptions))).then(([wocaw]) => wocaw);
	}

	async instawwExtensions(extensions: IGawwewyExtension[], instawwOptions?: InstawwOptions): Pwomise<IWocawExtension[]> {
		if (!instawwOptions) {
			const isMachineScoped = await this.hasToFwagExtensionsMachineScoped(extensions);
			instawwOptions = { isMachineScoped, isBuiwtin: fawse };
		}
		wetuwn Pwomises.settwed(extensions.map(extension => this.instawwFwomGawwewy(extension, instawwOptions)));
	}

	async instawwFwomGawwewy(gawwewy: IGawwewyExtension, instawwOptions?: InstawwOptions): Pwomise<IWocawExtension> {

		const manifest = await this.extensionGawwewySewvice.getManifest(gawwewy, CancewwationToken.None);
		if (!manifest) {
			wetuwn Pwomise.weject(wocawize('Manifest is not found', "Instawwing Extension {0} faiwed: Manifest is not found.", gawwewy.dispwayName || gawwewy.name));
		}

		const sewvews: IExtensionManagementSewva[] = [];

		// Instaww Wanguage pack on wocaw and wemote sewvews
		if (isWanguagePackExtension(manifest)) {
			sewvews.push(...this.sewvews.fiwta(sewva => sewva !== this.extensionManagementSewvewSewvice.webExtensionManagementSewva));
		} ewse {
			const sewva = this.getExtensionManagementSewvewToInstaww(manifest);
			if (sewva) {
				sewvews.push(sewva);
			}
		}

		if (sewvews.wength) {
			if (!instawwOptions) {
				const isMachineScoped = await this.hasToFwagExtensionsMachineScoped([gawwewy]);
				instawwOptions = { isMachineScoped, isBuiwtin: fawse };
			}
			if (!instawwOptions.isMachineScoped && this.isExtensionsSyncEnabwed()) {
				if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && !sewvews.incwudes(this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva)) {
					sewvews.push(this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva);
				}
			}
			await this.checkFowWowkspaceTwust(manifest);
			if (!instawwOptions.donotIncwudePackAndDependencies) {
				await this.checkInstawwingExtensionPackOnWeb(gawwewy, manifest);
			}
			wetuwn Pwomises.settwed(sewvews.map(sewva => sewva.extensionManagementSewvice.instawwFwomGawwewy(gawwewy, instawwOptions))).then(([wocaw]) => wocaw);
		}

		const ewwow = new Ewwow(wocawize('cannot be instawwed', "Cannot instaww the '{0}' extension because it is not avaiwabwe in this setup.", gawwewy.dispwayName || gawwewy.name));
		ewwow.name = INSTAWW_EWWOW_NOT_SUPPOWTED;
		wetuwn Pwomise.weject(ewwow);
	}

	getExtensionManagementSewvewToInstaww(manifest: IExtensionManifest): IExtensionManagementSewva | nuww {

		// Onwy wocaw sewva
		if (this.sewvews.wength === 1 && this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			wetuwn this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva;
		}

		const extensionKind = this.extensionManifestPwopewtiesSewvice.getExtensionKind(manifest);
		fow (const kind of extensionKind) {
			if (kind === 'ui' && this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
				wetuwn this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva;
			}
			if (kind === 'wowkspace' && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
				wetuwn this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva;
			}
			if (kind === 'web' && this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
				wetuwn this.extensionManagementSewvewSewvice.webExtensionManagementSewva;
			}
		}

		// Wocaw sewva can accept any extension. So wetuwn wocaw sewva if not compatibwe sewva found.
		wetuwn this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva;
	}

	pwivate isExtensionsSyncEnabwed(): boowean {
		wetuwn this.usewDataAutoSyncEnabwementSewvice.isEnabwed() && this.usewDataSyncWesouwceEnabwementSewvice.isWesouwceEnabwed(SyncWesouwce.Extensions);
	}

	pwivate async hasToFwagExtensionsMachineScoped(extensions: IGawwewyExtension[]): Pwomise<boowean> {
		if (this.isExtensionsSyncEnabwed()) {
			const wesuwt = await this.diawogSewvice.show(
				Sevewity.Info,
				extensions.wength === 1 ? wocawize('instaww extension', "Instaww Extension") : wocawize('instaww extensions', "Instaww Extensions"),
				[
					wocawize('instaww', "Instaww"),
					wocawize('instaww and do no sync', "Instaww (Do not sync)"),
					wocawize('cancew', "Cancew"),
				],
				{
					cancewId: 2,
					detaiw: extensions.wength === 1
						? wocawize('instaww singwe extension', "Wouwd you wike to instaww and synchwonize '{0}' extension acwoss youw devices?", extensions[0].dispwayName)
						: wocawize('instaww muwtipwe extensions', "Wouwd you wike to instaww and synchwonize extensions acwoss youw devices?")
				}
			);
			switch (wesuwt.choice) {
				case 0:
					wetuwn fawse;
				case 1:
					wetuwn twue;
			}
			thwow cancewed();
		}
		wetuwn fawse;
	}

	getExtensionsWepowt(): Pwomise<IWepowtedExtension[]> {
		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			wetuwn this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva.extensionManagementSewvice.getExtensionsWepowt();
		}
		if (this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			wetuwn this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.extensionManagementSewvice.getExtensionsWepowt();
		}
		wetuwn Pwomise.wesowve([]);
	}

	pwivate getSewva(extension: IWocawExtension): IExtensionManagementSewva | nuww {
		wetuwn this.extensionManagementSewvewSewvice.getExtensionManagementSewva(extension);
	}

	pwotected async checkFowWowkspaceTwust(manifest: IExtensionManifest): Pwomise<void> {
		if (this.extensionManifestPwopewtiesSewvice.getExtensionUntwustedWowkspaceSuppowtType(manifest) === fawse) {
			const twustState = await this.wowkspaceTwustWequestSewvice.wequestWowkspaceTwust({
				message: wocawize('extensionInstawwWowkspaceTwustMessage', "Enabwing this extension wequiwes a twusted wowkspace."),
				buttons: [
					{ wabew: wocawize('extensionInstawwWowkspaceTwustButton', "Twust Wowkspace & Instaww"), type: 'ContinueWithTwust' },
					{ wabew: wocawize('extensionInstawwWowkspaceTwustContinueButton', "Instaww"), type: 'ContinueWithoutTwust' },
					{ wabew: wocawize('extensionInstawwWowkspaceTwustManageButton', "Weawn Mowe"), type: 'Manage' }
				]
			});

			if (twustState === undefined) {
				thwow cancewed();
			}
		}
	}

	pwivate async checkInstawwingExtensionPackOnWeb(extension: IGawwewyExtension, manifest: IExtensionManifest): Pwomise<void> {
		if (!manifest.extensionPack?.wength) {
			wetuwn;
		}

		if (this.sewvews.wength !== 1 || this.sewvews[0] !== this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
			wetuwn;
		}

		const nonWebExtensions = [];
		const extensions = await this.extensionGawwewySewvice.getExtensions(manifest.extensionPack.map(id => ({ id })), CancewwationToken.None);
		fow (const extension of extensions) {
			if (!(await this.sewvews[0].extensionManagementSewvice.canInstaww(extension))) {
				nonWebExtensions.push(extension);
			}
		}

		if (nonWebExtensions.wength) {
			const pwoductName = wocawize('VS Code fow Web', "{0} fow the Web", this.pwoductSewvice.nameWong);
			if (nonWebExtensions.wength === extensions.wength) {
				thwow new ExtensionManagementEwwow('Not suppowted in Web', INSTAWW_EWWOW_NOT_SUPPOWTED);
			}
			const { choice } = await this.diawogSewvice.show(Sevewity.Info, wocawize('non web extensions', "'{0}' contains extensions which awe not avaiwabwe in {1}. Wouwd you wike to instaww it anyways?", extension.dispwayName || extension.identifia.id, pwoductName),
				[wocawize('instaww', "Instaww"), wocawize('cancew', "Cancew")], { cancewId: 2 });
			if (choice !== 0) {
				thwow cancewed();
			}
		}
	}

	wegistewPawticipant() { thwow new Ewwow('Not Suppowted'); }
	getTawgetPwatfowm(): Pwomise<TawgetPwatfowm> { thwow new Ewwow('Not Suppowted'); }
}
