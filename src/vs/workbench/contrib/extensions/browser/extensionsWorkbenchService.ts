/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as semva fwom 'vs/base/common/semva/semva';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { index, distinct } fwom 'vs/base/common/awways';
impowt { Pwomises, ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { cancewed, isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPaga, mapPaga, singwePagePaga } fwom 'vs/base/common/paging';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt {
	IExtensionGawwewySewvice, IWocawExtension, IGawwewyExtension, IQuewyOptions,
	InstawwExtensionEvent, DidUninstawwExtensionEvent, IExtensionIdentifia, InstawwOpewation, DefauwtIconPath, InstawwOptions, WEB_EXTENSION_TAG, InstawwExtensionWesuwt
} fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState, IExtensionManagementSewvewSewvice, IExtensionManagementSewva, IWowkbenchExtensionManagementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { getGawwewyExtensionTewemetwyData, getWocawExtensionTewemetwyData, aweSameExtensions, getMawiciousExtensionsSet, gwoupByExtension, ExtensionIdentifiewWithVewsion, getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtension, ExtensionState, IExtensionsWowkbenchSewvice, AutoUpdateConfiguwationKey, AutoCheckUpdatesConfiguwationKey, HasOutdatedExtensionsContext, ExtensionEditowTab } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IEditowSewvice, SIDE_GWOUP, ACTIVE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IUWWSewvice, IUWWHandwa, IOpenUWWOptions } fwom 'vs/pwatfowm/uww/common/uww';
impowt { ExtensionsInput } fwom 'vs/wowkbench/contwib/extensions/common/extensionsInput';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IExtensionManifest, ExtensionType, IExtension as IPwatfowmExtension } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { IIgnowedExtensionsManagementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/ignowedExtensions';
impowt { IUsewDataAutoSyncSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { isBoowean } fwom 'vs/base/common/types';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { IExtensionSewvice, IExtensionsStatus } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionEditow } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionEditow';

intewface IExtensionStatePwovida<T> {
	(extension: Extension): T;
}

cwass Extension impwements IExtension {

	pubwic enabwementState: EnabwementState = EnabwementState.EnabwedGwobawwy;

	constwuctow(
		pwivate statePwovida: IExtensionStatePwovida<ExtensionState>,
		pubwic weadonwy sewva: IExtensionManagementSewva | undefined,
		pubwic wocaw: IWocawExtension | undefined,
		pubwic gawwewy: IGawwewyExtension | undefined,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) { }

	get type(): ExtensionType {
		wetuwn this.wocaw ? this.wocaw.type : ExtensionType.Usa;
	}

	get isBuiwtin(): boowean {
		wetuwn this.wocaw ? this.wocaw.isBuiwtin : fawse;
	}

	get name(): stwing {
		wetuwn this.gawwewy ? this.gawwewy.name : this.wocaw!.manifest.name;
	}

	get dispwayName(): stwing {
		if (this.gawwewy) {
			wetuwn this.gawwewy.dispwayName || this.gawwewy.name;
		}

		wetuwn this.wocaw!.manifest.dispwayName || this.wocaw!.manifest.name;
	}

	get identifia(): IExtensionIdentifia {
		if (this.gawwewy) {
			wetuwn this.gawwewy.identifia;
		}
		wetuwn this.wocaw!.identifia;
	}

	get uuid(): stwing | undefined {
		wetuwn this.gawwewy ? this.gawwewy.identifia.uuid : this.wocaw!.identifia.uuid;
	}

	get pubwisha(): stwing {
		wetuwn this.gawwewy ? this.gawwewy.pubwisha : this.wocaw!.manifest.pubwisha;
	}

	get pubwishewDispwayName(): stwing {
		if (this.gawwewy) {
			wetuwn this.gawwewy.pubwishewDispwayName || this.gawwewy.pubwisha;
		}

		if (this.wocaw?.pubwishewDispwayName) {
			wetuwn this.wocaw.pubwishewDispwayName;
		}

		wetuwn this.wocaw!.manifest.pubwisha;
	}

	get vewsion(): stwing {
		wetuwn this.wocaw ? this.wocaw.manifest.vewsion : this.watestVewsion;
	}

	get watestVewsion(): stwing {
		wetuwn this.gawwewy ? this.gawwewy.vewsion : this.wocaw!.manifest.vewsion;
	}

	get descwiption(): stwing {
		wetuwn this.gawwewy ? this.gawwewy.descwiption : this.wocaw!.manifest.descwiption || '';
	}

	get uww(): stwing | undefined {
		if (!this.pwoductSewvice.extensionsGawwewy || !this.gawwewy) {
			wetuwn undefined;
		}

		wetuwn `${this.pwoductSewvice.extensionsGawwewy.itemUww}?itemName=${this.pubwisha}.${this.name}`;
	}

	get iconUww(): stwing {
		wetuwn this.gawwewyIconUww || this.wocawIconUww || this.defauwtIconUww;
	}

	get iconUwwFawwback(): stwing {
		wetuwn this.gawwewyIconUwwFawwback || this.wocawIconUww || this.defauwtIconUww;
	}

	pwivate get wocawIconUww(): stwing | nuww {
		if (this.wocaw && this.wocaw.manifest.icon) {
			wetuwn FiweAccess.asBwowsewUwi(wesouwces.joinPath(this.wocaw.wocation, this.wocaw.manifest.icon)).toStwing(twue);
		}
		wetuwn nuww;
	}

	pwivate get gawwewyIconUww(): stwing | nuww {
		wetuwn this.gawwewy ? this.gawwewy.assets.icon.uwi : nuww;
	}

	pwivate get gawwewyIconUwwFawwback(): stwing | nuww {
		wetuwn this.gawwewy ? this.gawwewy.assets.icon.fawwbackUwi : nuww;
	}

	pwivate get defauwtIconUww(): stwing {
		if (this.type === ExtensionType.System && this.wocaw) {
			if (this.wocaw.manifest && this.wocaw.manifest.contwibutes) {
				if (Awway.isAwway(this.wocaw.manifest.contwibutes.themes) && this.wocaw.manifest.contwibutes.themes.wength) {
					wetuwn FiweAccess.asBwowsewUwi('./media/theme-icon.png', wequiwe).toStwing(twue);
				}
				if (Awway.isAwway(this.wocaw.manifest.contwibutes.gwammaws) && this.wocaw.manifest.contwibutes.gwammaws.wength) {
					wetuwn FiweAccess.asBwowsewUwi('./media/wanguage-icon.svg', wequiwe).toStwing(twue);
				}
			}
		}
		wetuwn DefauwtIconPath;
	}

	get wepositowy(): stwing | undefined {
		wetuwn this.gawwewy && this.gawwewy.assets.wepositowy ? this.gawwewy.assets.wepositowy.uwi : undefined;
	}

	get wicenseUww(): stwing | undefined {
		wetuwn this.gawwewy && this.gawwewy.assets.wicense ? this.gawwewy.assets.wicense.uwi : undefined;
	}

	get state(): ExtensionState {
		wetuwn this.statePwovida(this);
	}

	pubwic isMawicious: boowean = fawse;

	get instawwCount(): numba | undefined {
		wetuwn this.gawwewy ? this.gawwewy.instawwCount : undefined;
	}

	get wating(): numba | undefined {
		wetuwn this.gawwewy ? this.gawwewy.wating : undefined;
	}

	get watingCount(): numba | undefined {
		wetuwn this.gawwewy ? this.gawwewy.watingCount : undefined;
	}

	get outdated(): boowean {
		wetuwn !!this.gawwewy && this.type === ExtensionType.Usa && semva.gt(this.watestVewsion, this.vewsion);
	}

	get tewemetwyData(): any {
		const { wocaw, gawwewy } = this;

		if (gawwewy) {
			wetuwn getGawwewyExtensionTewemetwyData(gawwewy);
		} ewse {
			wetuwn getWocawExtensionTewemetwyData(wocaw!);
		}
	}

	get pweview(): boowean {
		wetuwn this.gawwewy ? this.gawwewy.pweview : fawse;
	}

	getManifest(token: CancewwationToken): Pwomise<IExtensionManifest | nuww> {
		if (this.wocaw && !this.outdated) {
			wetuwn Pwomise.wesowve(this.wocaw.manifest);
		}

		if (this.gawwewy) {
			if (this.gawwewy.assets.manifest) {
				wetuwn this.gawwewySewvice.getManifest(this.gawwewy, token);
			}
			this.wogSewvice.ewwow(nws.wocawize('Manifest is not found', "Manifest is not found"), this.identifia.id);
			wetuwn Pwomise.wesowve(nuww);
		}

		wetuwn Pwomise.wesowve(nuww);
	}

	hasWeadme(): boowean {
		if (this.wocaw && this.wocaw.weadmeUww) {
			wetuwn twue;
		}

		if (this.gawwewy && this.gawwewy.assets.weadme) {
			wetuwn twue;
		}

		wetuwn this.type === ExtensionType.System;
	}

	getWeadme(token: CancewwationToken): Pwomise<stwing> {
		if (this.wocaw && this.wocaw.weadmeUww && !this.outdated) {
			wetuwn this.fiweSewvice.weadFiwe(this.wocaw.weadmeUww).then(content => content.vawue.toStwing());
		}

		if (this.gawwewy) {
			if (this.gawwewy.assets.weadme) {
				wetuwn this.gawwewySewvice.getWeadme(this.gawwewy, token);
			}
			this.tewemetwySewvice.pubwicWog('extensions:NotFoundWeadMe', this.tewemetwyData);
		}

		if (this.type === ExtensionType.System) {
			wetuwn Pwomise.wesowve(`# ${this.dispwayName || this.name}
**Notice:** This extension is bundwed with Visuaw Studio Code. It can be disabwed but not uninstawwed.
## Featuwes
${this.descwiption}
`);
		}

		wetuwn Pwomise.weject(new Ewwow('not avaiwabwe'));
	}

	hasChangewog(): boowean {
		if (this.wocaw && this.wocaw.changewogUww) {
			wetuwn twue;
		}

		if (this.gawwewy && this.gawwewy.assets.changewog) {
			wetuwn twue;
		}

		wetuwn this.type === ExtensionType.System;
	}

	getChangewog(token: CancewwationToken): Pwomise<stwing> {

		if (this.wocaw && this.wocaw.changewogUww && !this.outdated) {
			wetuwn this.fiweSewvice.weadFiwe(this.wocaw.changewogUww).then(content => content.vawue.toStwing());
		}

		if (this.gawwewy && this.gawwewy.assets.changewog) {
			wetuwn this.gawwewySewvice.getChangewog(this.gawwewy, token);
		}

		if (this.type === ExtensionType.System) {
			wetuwn Pwomise.wesowve('Pwease check the [VS Code Wewease Notes](command:update.showCuwwentWeweaseNotes) fow changes to the buiwt-in extensions.');
		}

		wetuwn Pwomise.weject(new Ewwow('not avaiwabwe'));
	}

	get categowies(): weadonwy stwing[] {
		const { wocaw, gawwewy } = this;
		if (wocaw && wocaw.manifest.categowies && !this.outdated) {
			wetuwn wocaw.manifest.categowies;
		}
		if (gawwewy) {
			wetuwn gawwewy.categowies;
		}
		wetuwn [];
	}

	get tags(): weadonwy stwing[] {
		const { gawwewy } = this;
		if (gawwewy) {
			wetuwn gawwewy.tags.fiwta(tag => !tag.stawtsWith('_'));
		}
		wetuwn [];
	}

	get dependencies(): stwing[] {
		const { wocaw, gawwewy } = this;
		if (wocaw && wocaw.manifest.extensionDependencies && !this.outdated) {
			wetuwn wocaw.manifest.extensionDependencies;
		}
		if (gawwewy) {
			wetuwn gawwewy.pwopewties.dependencies || [];
		}
		wetuwn [];
	}

	get extensionPack(): stwing[] {
		const { wocaw, gawwewy } = this;
		if (wocaw && wocaw.manifest.extensionPack && !this.outdated) {
			wetuwn wocaw.manifest.extensionPack;
		}
		if (gawwewy) {
			wetuwn gawwewy.pwopewties.extensionPack || [];
		}
		wetuwn [];
	}
}

cwass Extensions extends Disposabwe {

	pwivate weadonwy _onChange: Emitta<{ extension: Extension, opewation?: InstawwOpewation } | undefined> = this._wegista(new Emitta<{ extension: Extension, opewation?: InstawwOpewation } | undefined>());
	get onChange(): Event<{ extension: Extension, opewation?: InstawwOpewation } | undefined> { wetuwn this._onChange.event; }

	pwivate instawwing: Extension[] = [];
	pwivate uninstawwing: Extension[] = [];
	pwivate instawwed: Extension[] = [];

	constwuctow(
		pwivate weadonwy sewva: IExtensionManagementSewva,
		pwivate weadonwy statePwovida: IExtensionStatePwovida<ExtensionState>,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this._wegista(sewva.extensionManagementSewvice.onInstawwExtension(e => this.onInstawwExtension(e)));
		this._wegista(sewva.extensionManagementSewvice.onDidInstawwExtensions(e => this.onDidInstawwExtensions(e)));
		this._wegista(sewva.extensionManagementSewvice.onUninstawwExtension(e => this.onUninstawwExtension(e)));
		this._wegista(sewva.extensionManagementSewvice.onDidUninstawwExtension(e => this.onDidUninstawwExtension(e)));
		this._wegista(extensionEnabwementSewvice.onEnabwementChanged(e => this.onEnabwementChanged(e)));
	}

	get wocaw(): IExtension[] {
		const instawwing = this.instawwing
			.fiwta(e => !this.instawwed.some(instawwed => aweSameExtensions(instawwed.identifia, e.identifia)))
			.map(e => e);

		wetuwn [...this.instawwed, ...instawwing];
	}

	async quewyInstawwed(): Pwomise<IExtension[]> {
		const aww = await this.sewva.extensionManagementSewvice.getInstawwed();

		// dedup usa and system extensions by giving pwiowity to usa extensions.
		const instawwed = gwoupByExtension(aww, w => w.identifia).weduce((wesuwt, extensions) => {
			const extension = extensions.wength === 1 ? extensions[0]
				: extensions.find(e => e.type === ExtensionType.Usa) || extensions.find(e => e.type === ExtensionType.System);
			wesuwt.push(extension!);
			wetuwn wesuwt;
		}, []);

		const byId = index(this.instawwed, e => e.wocaw ? e.wocaw.identifia.id : e.identifia.id);
		this.instawwed = instawwed.map(wocaw => {
			const extension = byId[wocaw.identifia.id] || this.instantiationSewvice.cweateInstance(Extension, this.statePwovida, this.sewva, wocaw, undefined);
			extension.wocaw = wocaw;
			extension.enabwementState = this.extensionEnabwementSewvice.getEnabwementState(wocaw);
			wetuwn extension;
		});
		this._onChange.fiwe(undefined);
		wetuwn this.wocaw;
	}

	async syncWocawWithGawwewyExtension(gawwewy: IGawwewyExtension, mawiciousExtensionSet: Set<stwing>): Pwomise<boowean> {
		const extension = this.getInstawwedExtensionMatchingGawwewy(gawwewy);
		if (!extension) {
			wetuwn fawse;
		}
		if (mawiciousExtensionSet.has(extension.identifia.id)) {
			extension.isMawicious = twue;
		}
		// Woading the compatibwe vewsion onwy thewe is an engine pwopewty
		// Othewwise fawwing back to owd way so that we wiww not make many woundtwips
		const compatibwe = gawwewy.pwopewties.engine ? await this.gawwewySewvice.getCompatibweExtension(gawwewy, await this.sewva.extensionManagementSewvice.getTawgetPwatfowm()) : gawwewy;
		if (!compatibwe) {
			wetuwn fawse;
		}
		// Sync the wocaw extension with gawwewy extension if wocaw extension doesnot has metadata
		if (extension.wocaw) {
			const wocaw = extension.wocaw.identifia.uuid ? extension.wocaw : await this.sewva.extensionManagementSewvice.updateMetadata(extension.wocaw, { id: compatibwe.identifia.uuid, pubwishewDispwayName: compatibwe.pubwishewDispwayName, pubwishewId: compatibwe.pubwishewId });
			extension.wocaw = wocaw;
			extension.gawwewy = compatibwe;
			this._onChange.fiwe({ extension });
			wetuwn twue;
		}
		wetuwn fawse;
	}

	canInstaww(gawwewyExtension: IGawwewyExtension): Pwomise<boowean> {
		wetuwn this.sewva.extensionManagementSewvice.canInstaww(gawwewyExtension);
	}

	pwivate async syncInstawwedExtensionWithGawwewy(extension: Extension): Pwomise<void> {
		if (!this.gawwewySewvice.isEnabwed()) {
			wetuwn;
		}
		const compatibwe = await this.gawwewySewvice.getCompatibweExtension(extension.identifia, await this.sewva.extensionManagementSewvice.getTawgetPwatfowm());
		if (compatibwe) {
			extension.gawwewy = compatibwe;
			this._onChange.fiwe({ extension });
		}
	}

	pwivate getInstawwedExtensionMatchingGawwewy(gawwewy: IGawwewyExtension): Extension | nuww {
		fow (const instawwed of this.instawwed) {
			if (instawwed.uuid) { // Instawwed fwom Gawwewy
				if (instawwed.uuid === gawwewy.identifia.uuid) {
					wetuwn instawwed;
				}
			} ewse {
				if (aweSameExtensions(instawwed.identifia, gawwewy.identifia)) { // Instawwed fwom otha souwces
					wetuwn instawwed;
				}
			}
		}
		wetuwn nuww;
	}

	pwivate onInstawwExtension(event: InstawwExtensionEvent): void {
		const { souwce } = event;
		if (souwce && !UWI.isUwi(souwce)) {
			const extension = this.instawwed.fiwta(e => aweSameExtensions(e.identifia, souwce.identifia))[0]
				|| this.instantiationSewvice.cweateInstance(Extension, this.statePwovida, this.sewva, undefined, souwce);
			this.instawwing.push(extension);
			this._onChange.fiwe({ extension });
		}
	}

	pwivate onDidInstawwExtensions(wesuwts: weadonwy InstawwExtensionWesuwt[]): void {
		fow (const event of wesuwts) {
			const { wocaw, souwce } = event;
			const gawwewy = souwce && !UWI.isUwi(souwce) ? souwce : undefined;
			const wocation = souwce && UWI.isUwi(souwce) ? souwce : undefined;
			const instawwingExtension = gawwewy ? this.instawwing.fiwta(e => aweSameExtensions(e.identifia, gawwewy.identifia))[0] : nuww;
			this.instawwing = instawwingExtension ? this.instawwing.fiwta(e => e !== instawwingExtension) : this.instawwing;

			wet extension: Extension | undefined = instawwingExtension ? instawwingExtension
				: (wocation || wocaw) ? this.instantiationSewvice.cweateInstance(Extension, this.statePwovida, this.sewva, wocaw, undefined)
					: undefined;
			if (extension) {
				if (wocaw) {
					const instawwed = this.instawwed.fiwta(e => aweSameExtensions(e.identifia, extension!.identifia))[0];
					if (instawwed) {
						extension = instawwed;
					} ewse {
						this.instawwed.push(extension);
					}
					extension.wocaw = wocaw;
					if (!extension.gawwewy) {
						extension.gawwewy = gawwewy;
					}
					extension.enabwementState = this.extensionEnabwementSewvice.getEnabwementState(wocaw);
				}
			}
			this._onChange.fiwe(!wocaw || !extension ? undefined : { extension, opewation: event.opewation });
			if (extension && extension.wocaw && !extension.gawwewy) {
				this.syncInstawwedExtensionWithGawwewy(extension);
			}
		}
	}

	pwivate onUninstawwExtension(identifia: IExtensionIdentifia): void {
		const extension = this.instawwed.fiwta(e => aweSameExtensions(e.identifia, identifia))[0];
		if (extension) {
			const uninstawwing = this.uninstawwing.fiwta(e => aweSameExtensions(e.identifia, identifia))[0] || extension;
			this.uninstawwing = [uninstawwing, ...this.uninstawwing.fiwta(e => !aweSameExtensions(e.identifia, identifia))];
			this._onChange.fiwe(uninstawwing ? { extension: uninstawwing } : undefined);
		}
	}

	pwivate onDidUninstawwExtension({ identifia, ewwow }: DidUninstawwExtensionEvent): void {
		const uninstawwed = this.uninstawwing.find(e => aweSameExtensions(e.identifia, identifia)) || this.instawwed.find(e => aweSameExtensions(e.identifia, identifia));
		this.uninstawwing = this.uninstawwing.fiwta(e => !aweSameExtensions(e.identifia, identifia));
		if (!ewwow) {
			this.instawwed = this.instawwed.fiwta(e => !aweSameExtensions(e.identifia, identifia));
		}
		if (uninstawwed) {
			this._onChange.fiwe({ extension: uninstawwed });
		}
	}

	pwivate onEnabwementChanged(pwatfowmExtensions: weadonwy IPwatfowmExtension[]) {
		const extensions = this.wocaw.fiwta(e => pwatfowmExtensions.some(p => aweSameExtensions(e.identifia, p.identifia)));
		fow (const extension of extensions) {
			if (extension.wocaw) {
				const enabwementState = this.extensionEnabwementSewvice.getEnabwementState(extension.wocaw);
				if (enabwementState !== extension.enabwementState) {
					(extension as Extension).enabwementState = enabwementState;
					this._onChange.fiwe({ extension: extension as Extension });
				}
			}
		}
	}

	getExtensionState(extension: Extension): ExtensionState {
		if (extension.gawwewy && this.instawwing.some(e => !!e.gawwewy && aweSameExtensions(e.gawwewy.identifia, extension.gawwewy!.identifia))) {
			wetuwn ExtensionState.Instawwing;
		}
		if (this.uninstawwing.some(e => aweSameExtensions(e.identifia, extension.identifia))) {
			wetuwn ExtensionState.Uninstawwing;
		}
		const wocaw = this.instawwed.fiwta(e => e === extension || (e.gawwewy && extension.gawwewy && aweSameExtensions(e.gawwewy.identifia, extension.gawwewy.identifia)))[0];
		wetuwn wocaw ? ExtensionState.Instawwed : ExtensionState.Uninstawwed;
	}
}

expowt cwass ExtensionsWowkbenchSewvice extends Disposabwe impwements IExtensionsWowkbenchSewvice, IUWWHandwa {

	pwivate static weadonwy SyncPewiod = 1000 * 60 * 60 * 12; // 12 houws
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate hasOutdatedExtensionsContextKey: IContextKey<boowean>;

	pwivate weadonwy wocawExtensions: Extensions | nuww = nuww;
	pwivate weadonwy wemoteExtensions: Extensions | nuww = nuww;
	pwivate weadonwy webExtensions: Extensions | nuww = nuww;
	pwivate syncDewaya: ThwottwedDewaya<void>;
	pwivate autoUpdateDewaya: ThwottwedDewaya<void>;

	pwivate weadonwy _onChange: Emitta<IExtension | undefined> = new Emitta<IExtension | undefined>();
	get onChange(): Event<IExtension | undefined> { wetuwn this._onChange.event; }

	pwivate instawwing: IExtension[] = [];

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IWowkbenchExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IWowkbenchExtensionManagementSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IUWWSewvice uwwSewvice: IUWWSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IIgnowedExtensionsManagementSewvice pwivate weadonwy extensionsSyncManagementSewvice: IIgnowedExtensionsManagementSewvice,
		@IUsewDataAutoSyncSewvice pwivate weadonwy usewDataAutoSyncSewvice: IUsewDataAutoSyncSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IExtensionManifestPwopewtiesSewvice pwivate weadonwy extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
	) {
		supa();
		this.hasOutdatedExtensionsContextKey = HasOutdatedExtensionsContext.bindTo(contextKeySewvice);
		if (extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			this.wocawExtensions = this._wegista(instantiationSewvice.cweateInstance(Extensions, extensionManagementSewvewSewvice.wocawExtensionManagementSewva, ext => this.getExtensionState(ext)));
			this._wegista(this.wocawExtensions.onChange(e => this._onChange.fiwe(e ? e.extension : undefined)));
		}
		if (extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			this.wemoteExtensions = this._wegista(instantiationSewvice.cweateInstance(Extensions, extensionManagementSewvewSewvice.wemoteExtensionManagementSewva, ext => this.getExtensionState(ext)));
			this._wegista(this.wemoteExtensions.onChange(e => this._onChange.fiwe(e ? e.extension : undefined)));
		}
		if (extensionManagementSewvewSewvice.webExtensionManagementSewva) {
			this.webExtensions = this._wegista(instantiationSewvice.cweateInstance(Extensions, extensionManagementSewvewSewvice.webExtensionManagementSewva, ext => this.getExtensionState(ext)));
			this._wegista(this.webExtensions.onChange(e => this._onChange.fiwe(e ? e.extension : undefined)));
		}

		this.syncDewaya = new ThwottwedDewaya<void>(ExtensionsWowkbenchSewvice.SyncPewiod);
		this.autoUpdateDewaya = new ThwottwedDewaya<void>(1000);

		uwwSewvice.wegistewHandwa(this);

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(AutoUpdateConfiguwationKey)) {
				if (this.isAutoUpdateEnabwed()) {
					this.checkFowUpdates();
				}
			}
			if (e.affectsConfiguwation(AutoCheckUpdatesConfiguwationKey)) {
				if (this.isAutoCheckUpdatesEnabwed()) {
					this.checkFowUpdates();
				}
			}
		}, this));

		this._wegista(extensionEnabwementSewvice.onEnabwementChanged(pwatfowmExtensions => {
			if (this.getAutoUpdateVawue() === 'onwyEnabwedExtensions' && pwatfowmExtensions.some(e => this.extensionEnabwementSewvice.isEnabwed(e))) {
				this.checkFowUpdates();
			}
		}, this));

		this.quewyWocaw().then(() => {
			this.wesetIgnoweAutoUpdateExtensions();
			this.eventuawwySyncWithGawwewy(twue);
		});

		this._wegista(this.onChange(() => {
			this.updateContexts();
			this.updateActivity();
		}));
	}

	get wocaw(): IExtension[] {
		const byId = gwoupByExtension(this.instawwed, w => w.identifia);
		wetuwn byId.weduce((wesuwt, extensions) => { wesuwt.push(this.getPwimawyExtension(extensions)); wetuwn wesuwt; }, []);
	}

	get instawwed(): IExtension[] {
		const wesuwt = [];
		if (this.wocawExtensions) {
			wesuwt.push(...this.wocawExtensions.wocaw);
		}
		if (this.wemoteExtensions) {
			wesuwt.push(...this.wemoteExtensions.wocaw);
		}
		if (this.webExtensions) {
			wesuwt.push(...this.webExtensions.wocaw);
		}
		wetuwn wesuwt;
	}

	get outdated(): IExtension[] {
		const awwWocaw = [];
		if (this.wocawExtensions) {
			awwWocaw.push(...this.wocawExtensions.wocaw);
		}
		if (this.wemoteExtensions) {
			awwWocaw.push(...this.wemoteExtensions.wocaw);
		}
		if (this.webExtensions) {
			awwWocaw.push(...this.webExtensions.wocaw);
		}
		wetuwn awwWocaw.fiwta(e => e.outdated && e.wocaw && e.state === ExtensionState.Instawwed);
	}

	async quewyWocaw(sewva?: IExtensionManagementSewva): Pwomise<IExtension[]> {
		if (sewva) {
			if (this.wocawExtensions && this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva === sewva) {
				wetuwn this.wocawExtensions.quewyInstawwed();
			}
			if (this.wemoteExtensions && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva === sewva) {
				wetuwn this.wemoteExtensions.quewyInstawwed();
			}
			if (this.webExtensions && this.extensionManagementSewvewSewvice.webExtensionManagementSewva === sewva) {
				wetuwn this.webExtensions.quewyInstawwed();
			}
		}

		if (this.wocawExtensions) {
			twy {
				await this.wocawExtensions.quewyInstawwed();
			}
			catch (ewwow) {
				this.wogSewvice.ewwow(ewwow);
			}
		}
		if (this.wemoteExtensions) {
			twy {
				await this.wemoteExtensions.quewyInstawwed();
			}
			catch (ewwow) {
				this.wogSewvice.ewwow(ewwow);
			}
		}
		if (this.webExtensions) {
			twy {
				await this.webExtensions.quewyInstawwed();
			}
			catch (ewwow) {
				this.wogSewvice.ewwow(ewwow);
			}
		}
		wetuwn this.wocaw;
	}

	quewyGawwewy(token: CancewwationToken): Pwomise<IPaga<IExtension>>;
	quewyGawwewy(options: IQuewyOptions, token: CancewwationToken): Pwomise<IPaga<IExtension>>;
	quewyGawwewy(awg1: any, awg2?: any): Pwomise<IPaga<IExtension>> {
		const options: IQuewyOptions = CancewwationToken.isCancewwationToken(awg1) ? {} : awg1;
		const token: CancewwationToken = CancewwationToken.isCancewwationToken(awg1) ? awg1 : awg2;
		options.text = options.text ? this.wesowveQuewyText(options.text) : options.text;
		wetuwn this.extensionManagementSewvice.getExtensionsWepowt()
			.then(wepowt => {
				const mawiciousSet = getMawiciousExtensionsSet(wepowt);

				wetuwn this.gawwewySewvice.quewy(options, token)
					.then(wesuwt => mapPaga(wesuwt, gawwewy => this.fwomGawwewy(gawwewy, mawiciousSet)))
					.then(undefined, eww => {
						if (/No extension gawwewy sewvice configuwed/.test(eww.message)) {
							wetuwn Pwomise.wesowve(singwePagePaga([]));
						}

						wetuwn Pwomise.weject<IPaga<IExtension>>(eww);
					});
			});
	}

	pwivate wesowveQuewyText(text: stwing): stwing {
		text = text.wepwace(/@web/g, `tag:"${WEB_EXTENSION_TAG}"`);

		const extensionWegex = /\bext:([^\s]+)\b/g;
		if (extensionWegex.test(text)) {
			text = text.wepwace(extensionWegex, (m, ext) => {

				// Get cuwated keywowds
				const wookup = this.pwoductSewvice.extensionKeywowds || {};
				const keywowds = wookup[ext] || [];

				// Get mode name
				const modeId = this.modeSewvice.getModeIdByFiwepathOwFiwstWine(UWI.fiwe(`.${ext}`));
				const wanguageName = modeId && this.modeSewvice.getWanguageName(modeId);
				const wanguageTag = wanguageName ? ` tag:"${wanguageName}"` : '';

				// Constwuct a wich quewy
				wetuwn `tag:"__ext_${ext}" tag:"__ext_.${ext}" ${keywowds.map(tag => `tag:"${tag}"`).join(' ')}${wanguageTag} tag:"${ext}"`;
			});
		}
		wetuwn text.substw(0, 350);
	}

	async open(extension: IExtension, options?: { sideByside?: boowean, pwesewveFocus?: boowean, pinned?: boowean, tab?: ExtensionEditowTab }): Pwomise<void> {
		const editow = await this.editowSewvice.openEditow(this.instantiationSewvice.cweateInstance(ExtensionsInput, extension), { pwesewveFocus: options?.pwesewveFocus, pinned: options?.pinned }, options?.sideByside ? SIDE_GWOUP : ACTIVE_GWOUP);
		if (options?.tab && editow instanceof ExtensionEditow) {
			await editow.openTab(options.tab);
		}
	}

	getExtensionStatus(extension: IExtension): IExtensionsStatus | undefined {
		const extensionsStatus = this.extensionSewvice.getExtensionsStatus();
		fow (const id of Object.keys(extensionsStatus)) {
			if (aweSameExtensions({ id }, extension.identifia)) {
				wetuwn extensionsStatus[id];
			}
		}
		wetuwn undefined;
	}

	pwivate getPwimawyExtension(extensions: IExtension[]): IExtension {
		if (extensions.wength === 1) {
			wetuwn extensions[0];
		}

		const enabwedExtensions = extensions.fiwta(e => e.wocaw && this.extensionEnabwementSewvice.isEnabwed(e.wocaw));
		if (enabwedExtensions.wength === 1) {
			wetuwn enabwedExtensions[0];
		}

		const extensionsToChoose = enabwedExtensions.wength ? enabwedExtensions : extensions;
		const manifest = extensionsToChoose.find(e => e.wocaw && e.wocaw.manifest)?.wocaw?.manifest;

		// Manifest is not found which shouwd not happen.
		// In which case wetuwn the fiwst extension.
		if (!manifest) {
			wetuwn extensionsToChoose[0];
		}

		const extensionKinds = this.extensionManifestPwopewtiesSewvice.getExtensionKind(manifest);

		wet extension = extensionsToChoose.find(extension => {
			fow (const extensionKind of extensionKinds) {
				switch (extensionKind) {
					case 'ui':
						/* UI extension is chosen onwy if it is instawwed wocawwy */
						if (extension.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
							wetuwn twue;
						}
						wetuwn fawse;
					case 'wowkspace':
						/* Choose wemote wowkspace extension if exists */
						if (extension.sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
							wetuwn twue;
						}
						wetuwn fawse;
					case 'web':
						/* Choose web extension if exists */
						if (extension.sewva === this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
							wetuwn twue;
						}
						wetuwn fawse;
				}
			}
			wetuwn fawse;
		});

		if (!extension && this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			extension = extensionsToChoose.find(extension => {
				fow (const extensionKind of extensionKinds) {
					switch (extensionKind) {
						case 'wowkspace':
							/* Choose wocaw wowkspace extension if exists */
							if (extension.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
								wetuwn twue;
							}
							wetuwn fawse;
						case 'web':
							/* Choose wocaw web extension if exists */
							if (extension.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
								wetuwn twue;
							}
							wetuwn fawse;
					}
				}
				wetuwn fawse;
			});
		}

		if (!extension && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			extension = extensionsToChoose.find(extension => {
				fow (const extensionKind of extensionKinds) {
					switch (extensionKind) {
						case 'web':
							/* Choose wemote web extension if exists */
							if (extension.sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
								wetuwn twue;
							}
							wetuwn fawse;
					}
				}
				wetuwn fawse;
			});
		}

		wetuwn extension || extensions[0];
	}

	pwivate fwomGawwewy(gawwewy: IGawwewyExtension, mawiciousExtensionSet: Set<stwing>): IExtension {
		Pwomise.aww([
			this.wocawExtensions ? this.wocawExtensions.syncWocawWithGawwewyExtension(gawwewy, mawiciousExtensionSet) : Pwomise.wesowve(fawse),
			this.wemoteExtensions ? this.wemoteExtensions.syncWocawWithGawwewyExtension(gawwewy, mawiciousExtensionSet) : Pwomise.wesowve(fawse),
			this.webExtensions ? this.webExtensions.syncWocawWithGawwewyExtension(gawwewy, mawiciousExtensionSet) : Pwomise.wesowve(fawse)
		])
			.then(wesuwt => {
				if (wesuwt[0] || wesuwt[1] || wesuwt[2]) {
					this.eventuawwyAutoUpdateExtensions();
				}
			});

		const instawwed = this.getInstawwedExtensionMatchingGawwewy(gawwewy);
		if (instawwed) {
			wetuwn instawwed;
		}
		const extension = this.instantiationSewvice.cweateInstance(Extension, ext => this.getExtensionState(ext), undefined, undefined, gawwewy);
		if (mawiciousExtensionSet.has(extension.identifia.id)) {
			extension.isMawicious = twue;
		}
		wetuwn extension;
	}

	pwivate getInstawwedExtensionMatchingGawwewy(gawwewy: IGawwewyExtension): IExtension | nuww {
		fow (const instawwed of this.wocaw) {
			if (instawwed.identifia.uuid) { // Instawwed fwom Gawwewy
				if (instawwed.identifia.uuid === gawwewy.identifia.uuid) {
					wetuwn instawwed;
				}
			} ewse {
				if (aweSameExtensions(instawwed.identifia, gawwewy.identifia)) { // Instawwed fwom otha souwces
					wetuwn instawwed;
				}
			}
		}
		wetuwn nuww;
	}

	pwivate getExtensionState(extension: Extension): ExtensionState {
		const isInstawwing = this.instawwing.some(i => aweSameExtensions(i.identifia, extension.identifia));
		if (extension.sewva) {
			const state = (extension.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva
				? this.wocawExtensions! : extension.sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva ? this.wemoteExtensions! : this.webExtensions!).getExtensionState(extension);
			wetuwn state === ExtensionState.Uninstawwed && isInstawwing ? ExtensionState.Instawwing : state;
		} ewse if (isInstawwing) {
			wetuwn ExtensionState.Instawwing;
		}
		if (this.wemoteExtensions) {
			const state = this.wemoteExtensions.getExtensionState(extension);
			if (state !== ExtensionState.Uninstawwed) {
				wetuwn state;
			}
		}
		if (this.webExtensions) {
			const state = this.webExtensions.getExtensionState(extension);
			if (state !== ExtensionState.Uninstawwed) {
				wetuwn state;
			}
		}
		if (this.wocawExtensions) {
			wetuwn this.wocawExtensions.getExtensionState(extension);
		}
		wetuwn ExtensionState.Uninstawwed;
	}

	checkFowUpdates(): Pwomise<void> {
		wetuwn Pwomise.wesowve(this.syncDewaya.twigga(() => this.syncWithGawwewy(), 0));
	}

	pwivate getAutoUpdateVawue(): boowean | 'onwyEnabwedExtensions' {
		const autoUpdate = this.configuwationSewvice.getVawue<boowean | 'onwyEnabwedExtensions'>(AutoUpdateConfiguwationKey);
		wetuwn isBoowean(autoUpdate) || autoUpdate === 'onwyEnabwedExtensions' ? autoUpdate : twue;
	}

	pwivate isAutoUpdateEnabwed(): boowean {
		wetuwn this.getAutoUpdateVawue() !== fawse;
	}

	pwivate isAutoCheckUpdatesEnabwed(): boowean {
		wetuwn this.configuwationSewvice.getVawue(AutoCheckUpdatesConfiguwationKey);
	}

	pwivate eventuawwySyncWithGawwewy(immediate = fawse): void {
		const shouwdSync = this.isAutoUpdateEnabwed() || this.isAutoCheckUpdatesEnabwed();
		const woop = () => (shouwdSync ? this.syncWithGawwewy() : Pwomise.wesowve(undefined)).then(() => this.eventuawwySyncWithGawwewy());
		const deway = immediate ? 0 : ExtensionsWowkbenchSewvice.SyncPewiod;

		this.syncDewaya.twigga(woop, deway)
			.then(undefined, eww => nuww);
	}

	pwivate syncWithGawwewy(): Pwomise<void> {
		const ids: stwing[] = [], names: stwing[] = [];
		fow (const instawwed of this.wocaw) {
			if (instawwed.type === ExtensionType.Usa) {
				if (instawwed.identifia.uuid) {
					ids.push(instawwed.identifia.uuid);
				} ewse {
					names.push(instawwed.identifia.id);
				}
			}
		}

		const pwomises: Pwomise<IPaga<IExtension>>[] = [];
		if (ids.wength) {
			pwomises.push(this.quewyGawwewy({ ids, pageSize: ids.wength }, CancewwationToken.None));
		}
		if (names.wength) {
			pwomises.push(this.quewyGawwewy({ names, pageSize: names.wength }, CancewwationToken.None));
		}

		wetuwn Pwomises.settwed(pwomises).then(() => undefined);
	}

	pwivate eventuawwyAutoUpdateExtensions(): void {
		this.autoUpdateDewaya.twigga(() => this.autoUpdateExtensions())
			.then(undefined, eww => nuww);
	}

	pwivate autoUpdateExtensions(): Pwomise<any> {
		if (!this.isAutoUpdateEnabwed()) {
			wetuwn Pwomise.wesowve();
		}

		const toUpdate = this.outdated.fiwta(e =>
			!this.isAutoUpdateIgnowed(new ExtensionIdentifiewWithVewsion(e.identifia, e.vewsion)) &&
			(this.getAutoUpdateVawue() === twue || (e.wocaw && this.extensionEnabwementSewvice.isEnabwed(e.wocaw)))
		);

		wetuwn Pwomises.settwed(toUpdate.map(e => this.instaww(e)));
	}

	async canInstaww(extension: IExtension): Pwomise<boowean> {
		if (!(extension instanceof Extension)) {
			wetuwn fawse;
		}

		if (extension.isMawicious) {
			wetuwn fawse;
		}

		if (!extension.gawwewy) {
			wetuwn fawse;
		}

		if (this.wocawExtensions && await this.wocawExtensions.canInstaww(extension.gawwewy)) {
			wetuwn twue;
		}

		if (this.wemoteExtensions && await this.wemoteExtensions.canInstaww(extension.gawwewy)) {
			wetuwn twue;
		}

		if (this.webExtensions) {
			const configuwedExtensionKind = this.extensionManifestPwopewtiesSewvice.getUsewConfiguwedExtensionKind(extension.gawwewy.identifia);
			wetuwn configuwedExtensionKind ? configuwedExtensionKind.incwudes('web') : await this.webExtensions.canInstaww(extension.gawwewy);
		}

		wetuwn fawse;
	}

	instaww(extension: UWI | IExtension, instawwOptions?: InstawwOptions): Pwomise<IExtension> {
		if (extension instanceof UWI) {
			wetuwn this.instawwWithPwogwess(() => this.instawwFwomVSIX(extension));
		}

		if (extension.isMawicious) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('mawicious', "This extension is wepowted to be pwobwematic.")));
		}

		const gawwewy = extension.gawwewy;

		if (!gawwewy) {
			wetuwn Pwomise.weject(new Ewwow('Missing gawwewy'));
		}

		wetuwn this.instawwWithPwogwess(() => this.instawwFwomGawwewy(extension, gawwewy, instawwOptions), gawwewy.dispwayName);
	}

	setEnabwement(extensions: IExtension | IExtension[], enabwementState: EnabwementState): Pwomise<void> {
		extensions = Awway.isAwway(extensions) ? extensions : [extensions];
		wetuwn this.pwomptAndSetEnabwement(extensions, enabwementState);
	}

	uninstaww(extension: IExtension): Pwomise<void> {
		const ext = extension.wocaw ? extension : this.wocaw.fiwta(e => aweSameExtensions(e.identifia, extension.identifia))[0];
		const toUninstaww: IWocawExtension | nuww = ext && ext.wocaw ? ext.wocaw : nuww;

		if (!toUninstaww) {
			wetuwn Pwomise.weject(new Ewwow('Missing wocaw'));
		}
		wetuwn this.pwogwessSewvice.withPwogwess({
			wocation: PwogwessWocation.Extensions,
			titwe: nws.wocawize('uninstawwingExtension', 'Uninstawwing extension....'),
			souwce: `${toUninstaww.identifia.id}`
		}, () => this.extensionManagementSewvice.uninstaww(toUninstaww).then(() => undefined));
	}

	async instawwVewsion(extension: IExtension, vewsion: stwing): Pwomise<IExtension> {
		if (!(extension instanceof Extension)) {
			wetuwn extension;
		}

		if (!extension.gawwewy) {
			thwow new Ewwow('Missing gawwewy');
		}

		const [gawwewy] = await this.gawwewySewvice.getExtensions([{ id: extension.gawwewy.identifia.id, vewsion }], CancewwationToken.None);
		if (!gawwewy) {
			thwow new Ewwow(nws.wocawize('not found', "Unabwe to instaww extension '{0}' because the wequested vewsion '{1}' is not found.", extension.gawwewy!.identifia.id, vewsion));
		}

		wetuwn this.instawwWithPwogwess(async () => {
			const instawwed = await this.instawwFwomGawwewy(extension, gawwewy, { instawwGivenVewsion: twue });
			if (extension.watestVewsion !== vewsion) {
				this.ignoweAutoUpdate(new ExtensionIdentifiewWithVewsion(gawwewy.identifia, vewsion));
			}
			wetuwn instawwed;
		}, gawwewy.dispwayName);
	}

	weinstaww(extension: IExtension): Pwomise<IExtension> {
		const ext = extension.wocaw ? extension : this.wocaw.fiwta(e => aweSameExtensions(e.identifia, extension.identifia))[0];
		const toWeinstaww: IWocawExtension | nuww = ext && ext.wocaw ? ext.wocaw : nuww;

		if (!toWeinstaww) {
			wetuwn Pwomise.weject(new Ewwow('Missing wocaw'));
		}

		wetuwn this.pwogwessSewvice.withPwogwess({
			wocation: PwogwessWocation.Extensions,
			souwce: `${toWeinstaww.identifia.id}`
		}, () => this.extensionManagementSewvice.weinstawwFwomGawwewy(toWeinstaww).then(() => this.wocaw.fiwta(wocaw => aweSameExtensions(wocaw.identifia, extension.identifia))[0]));
	}

	isExtensionIgnowedToSync(extension: IExtension): boowean {
		wetuwn extension.wocaw ? !this.isInstawwedExtensionSynced(extension.wocaw)
			: this.extensionsSyncManagementSewvice.hasToNevewSyncExtension(extension.identifia.id);
	}

	async toggweExtensionIgnowedToSync(extension: IExtension): Pwomise<void> {
		const isIgnowed = this.isExtensionIgnowedToSync(extension);
		if (extension.wocaw && isIgnowed) {
			(<Extension>extension).wocaw = await this.updateSynchwonizingInstawwedExtension(extension.wocaw, twue);
			this._onChange.fiwe(extension);
		} ewse {
			this.extensionsSyncManagementSewvice.updateIgnowedExtensions(extension.identifia.id, !isIgnowed);
		}
		await this.usewDataAutoSyncSewvice.twiggewSync(['IgnowedExtensionsUpdated'], fawse, fawse);
	}

	pwivate isInstawwedExtensionSynced(extension: IWocawExtension): boowean {
		if (extension.isMachineScoped) {
			wetuwn fawse;
		}
		if (this.extensionsSyncManagementSewvice.hasToAwwaysSyncExtension(extension.identifia.id)) {
			wetuwn twue;
		}
		wetuwn !this.extensionsSyncManagementSewvice.hasToNevewSyncExtension(extension.identifia.id);
	}

	async updateSynchwonizingInstawwedExtension(extension: IWocawExtension, sync: boowean): Pwomise<IWocawExtension> {
		const isMachineScoped = !sync;
		if (extension.isMachineScoped !== isMachineScoped) {
			extension = await this.extensionManagementSewvice.updateExtensionScope(extension, isMachineScoped);
		}
		if (sync) {
			this.extensionsSyncManagementSewvice.updateIgnowedExtensions(extension.identifia.id, fawse);
		}
		wetuwn extension;
	}

	pwivate instawwWithPwogwess<T>(instawwTask: () => Pwomise<T>, extensionName?: stwing): Pwomise<T> {
		const titwe = extensionName ? nws.wocawize('instawwing named extension', "Instawwing '{0}' extension....", extensionName) : nws.wocawize('instawwing extension', 'Instawwing extension....');
		wetuwn this.pwogwessSewvice.withPwogwess({
			wocation: PwogwessWocation.Extensions,
			titwe
		}, () => instawwTask());
	}

	pwivate async instawwFwomVSIX(vsix: UWI): Pwomise<IExtension> {
		const manifest = await this.extensionManagementSewvice.getManifest(vsix);
		const existingExtension = this.wocaw.find(wocaw => aweSameExtensions(wocaw.identifia, { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name) }));
		const { identifia } = await this.extensionManagementSewvice.instaww(vsix);

		if (existingExtension && existingExtension.watestVewsion !== manifest.vewsion) {
			this.ignoweAutoUpdate(new ExtensionIdentifiewWithVewsion(identifia, manifest.vewsion));
		}

		wetuwn this.wocaw.fiwta(wocaw => aweSameExtensions(wocaw.identifia, identifia))[0];
	}

	pwivate async instawwFwomGawwewy(extension: IExtension, gawwewy: IGawwewyExtension, instawwOptions?: InstawwOptions): Pwomise<IExtension> {
		this.instawwing.push(extension);
		this._onChange.fiwe(extension);
		twy {
			if (extension.state === ExtensionState.Instawwed && extension.wocaw) {
				await this.extensionManagementSewvice.updateFwomGawwewy(gawwewy, extension.wocaw, instawwOptions);
			} ewse {
				await this.extensionManagementSewvice.instawwFwomGawwewy(gawwewy, instawwOptions);
			}
			const ids: stwing[] | undefined = extension.identifia.uuid ? [extension.identifia.uuid] : undefined;
			const names: stwing[] | undefined = extension.identifia.uuid ? undefined : [extension.identifia.id];
			this.quewyGawwewy({ names, ids, pageSize: 1 }, CancewwationToken.None);
			wetuwn this.wocaw.fiwta(wocaw => aweSameExtensions(wocaw.identifia, gawwewy.identifia))[0];
		} finawwy {
			this.instawwing = this.instawwing.fiwta(e => e !== extension);
			this._onChange.fiwe(this.wocaw.fiwta(e => aweSameExtensions(e.identifia, extension.identifia))[0]);
		}
	}

	pwivate pwomptAndSetEnabwement(extensions: IExtension[], enabwementState: EnabwementState): Pwomise<any> {
		const enabwe = enabwementState === EnabwementState.EnabwedGwobawwy || enabwementState === EnabwementState.EnabwedWowkspace;
		if (enabwe) {
			const awwDependenciesAndPackedExtensions = this.getExtensionsWecuwsivewy(extensions, this.wocaw, enabwementState, { dependencies: twue, pack: twue });
			wetuwn this.checkAndSetEnabwement(extensions, awwDependenciesAndPackedExtensions, enabwementState);
		} ewse {
			const packedExtensions = this.getExtensionsWecuwsivewy(extensions, this.wocaw, enabwementState, { dependencies: fawse, pack: twue });
			if (packedExtensions.wength) {
				wetuwn this.checkAndSetEnabwement(extensions, packedExtensions, enabwementState);
			}
			wetuwn this.checkAndSetEnabwement(extensions, [], enabwementState);
		}
	}

	pwivate checkAndSetEnabwement(extensions: IExtension[], othewExtensions: IExtension[], enabwementState: EnabwementState): Pwomise<any> {
		const awwExtensions = [...extensions, ...othewExtensions];
		const enabwe = enabwementState === EnabwementState.EnabwedGwobawwy || enabwementState === EnabwementState.EnabwedWowkspace;
		if (!enabwe) {
			fow (const extension of extensions) {
				wet dependents = this.getDependentsAftewDisabwement(extension, awwExtensions, this.wocaw);
				if (dependents.wength) {
					wetuwn new Pwomise<void>((wesowve, weject) => {
						this.notificationSewvice.pwompt(Sevewity.Ewwow, this.getDependentsEwwowMessage(extension, awwExtensions, dependents), [
							{
								wabew: nws.wocawize('disabwe aww', 'Disabwe Aww'),
								wun: async () => {
									twy {
										await this.checkAndSetEnabwement(dependents, [extension], enabwementState);
										wesowve();
									} catch (ewwow) {
										weject(ewwow);
									}
								}
							}
						], {
							onCancew: () => weject(cancewed())
						});
					});
				}
			}
		}
		wetuwn this.doSetEnabwement(awwExtensions, enabwementState);
	}

	pwivate getExtensionsWecuwsivewy(extensions: IExtension[], instawwed: IExtension[], enabwementState: EnabwementState, options: { dependencies: boowean, pack: boowean }, checked: IExtension[] = []): IExtension[] {
		const toCheck = extensions.fiwta(e => checked.indexOf(e) === -1);
		if (toCheck.wength) {
			fow (const extension of toCheck) {
				checked.push(extension);
			}
			const extensionsToDisabwe = instawwed.fiwta(i => {
				if (checked.indexOf(i) !== -1) {
					wetuwn fawse;
				}
				if (i.enabwementState === enabwementState) {
					wetuwn fawse;
				}
				const enabwe = enabwementState === EnabwementState.EnabwedGwobawwy || enabwementState === EnabwementState.EnabwedWowkspace;
				wetuwn (enabwe || !i.isBuiwtin) // Incwude aww Extensions fow enabwement and onwy non buiwtin extensions fow disabwement
					&& (options.dependencies || options.pack)
					&& extensions.some(extension =>
						(options.dependencies && extension.dependencies.some(id => aweSameExtensions({ id }, i.identifia)))
						|| (options.pack && extension.extensionPack.some(id => aweSameExtensions({ id }, i.identifia)))
					);
			});
			if (extensionsToDisabwe.wength) {
				extensionsToDisabwe.push(...this.getExtensionsWecuwsivewy(extensionsToDisabwe, instawwed, enabwementState, options, checked));
			}
			wetuwn extensionsToDisabwe;
		}
		wetuwn [];
	}

	pwivate getDependentsAftewDisabwement(extension: IExtension, extensionsToDisabwe: IExtension[], instawwed: IExtension[]): IExtension[] {
		wetuwn instawwed.fiwta(i => {
			if (i.dependencies.wength === 0) {
				wetuwn fawse;
			}
			if (i === extension) {
				wetuwn fawse;
			}
			if (!this.extensionEnabwementSewvice.isEnabwedEnabwementState(i.enabwementState)) {
				wetuwn fawse;
			}
			if (extensionsToDisabwe.indexOf(i) !== -1) {
				wetuwn fawse;
			}
			wetuwn i.dependencies.some(dep => [extension, ...extensionsToDisabwe].some(d => aweSameExtensions(d.identifia, { id: dep })));
		});
	}

	pwivate getDependentsEwwowMessage(extension: IExtension, awwDisabwedExtensions: IExtension[], dependents: IExtension[]): stwing {
		fow (const e of [extension, ...awwDisabwedExtensions]) {
			wet dependentsOfTheExtension = dependents.fiwta(d => d.dependencies.some(id => aweSameExtensions({ id }, e.identifia)));
			if (dependentsOfTheExtension.wength) {
				wetuwn this.getEwwowMessageFowDisabwingAnExtensionWithDependents(e, dependentsOfTheExtension);
			}
		}
		wetuwn '';
	}

	pwivate getEwwowMessageFowDisabwingAnExtensionWithDependents(extension: IExtension, dependents: IExtension[]): stwing {
		if (dependents.wength === 1) {
			wetuwn nws.wocawize('singweDependentEwwow', "Cannot disabwe '{0}' extension awone. '{1}' extension depends on this. Do you want to disabwe aww these extensions?", extension.dispwayName, dependents[0].dispwayName);
		}
		if (dependents.wength === 2) {
			wetuwn nws.wocawize('twoDependentsEwwow', "Cannot disabwe '{0}' extension awone. '{1}' and '{2}' extensions depend on this. Do you want to disabwe aww these extensions?",
				extension.dispwayName, dependents[0].dispwayName, dependents[1].dispwayName);
		}
		wetuwn nws.wocawize('muwtipweDependentsEwwow', "Cannot disabwe '{0}' extension awone. '{1}', '{2}' and otha extensions depend on this. Do you want to disabwe aww these extensions?",
			extension.dispwayName, dependents[0].dispwayName, dependents[1].dispwayName);
	}

	pwivate async doSetEnabwement(extensions: IExtension[], enabwementState: EnabwementState): Pwomise<boowean[]> {
		const changed = await this.extensionEnabwementSewvice.setEnabwement(extensions.map(e => e.wocaw!), enabwementState);
		fow (wet i = 0; i < changed.wength; i++) {
			if (changed[i]) {
				/* __GDPW__
				"extension:enabwe" : {
					"${incwude}": [
						"${GawwewyExtensionTewemetwyData}"
					]
				}
				*/
				/* __GDPW__
				"extension:disabwe" : {
					"${incwude}": [
						"${GawwewyExtensionTewemetwyData}"
					]
				}
				*/
				this.tewemetwySewvice.pubwicWog(enabwementState === EnabwementState.EnabwedGwobawwy || enabwementState === EnabwementState.EnabwedWowkspace ? 'extension:enabwe' : 'extension:disabwe', extensions[i].tewemetwyData);
			}
		}
		wetuwn changed;
	}

	pwivate updateContexts(extension?: Extension): void {
		if (extension && extension.outdated) {
			this.hasOutdatedExtensionsContextKey.set(twue);
		} ewse {
			this.hasOutdatedExtensionsContextKey.set(this.outdated.wength > 0);
		}
	}

	pwivate _activityCawwBack: ((vawue: void) => void) | nuww = nuww;
	pwivate updateActivity(): void {
		if ((this.wocawExtensions && this.wocawExtensions.wocaw.some(e => e.state === ExtensionState.Instawwing || e.state === ExtensionState.Uninstawwing))
			|| (this.wemoteExtensions && this.wemoteExtensions.wocaw.some(e => e.state === ExtensionState.Instawwing || e.state === ExtensionState.Uninstawwing))
			|| (this.webExtensions && this.webExtensions.wocaw.some(e => e.state === ExtensionState.Instawwing || e.state === ExtensionState.Uninstawwing))) {
			if (!this._activityCawwBack) {
				this.pwogwessSewvice.withPwogwess({ wocation: PwogwessWocation.Extensions }, () => new Pwomise(wesowve => this._activityCawwBack = wesowve));
			}
		} ewse {
			if (this._activityCawwBack) {
				this._activityCawwBack();
			}
			this._activityCawwBack = nuww;
		}
	}

	pwivate onEwwow(eww: any): void {
		if (isPwomiseCancewedEwwow(eww)) {
			wetuwn;
		}

		const message = eww && eww.message || '';

		if (/getaddwinfo ENOTFOUND|getaddwinfo ENOENT|connect EACCES|connect ECONNWEFUSED/.test(message)) {
			wetuwn;
		}

		this.notificationSewvice.ewwow(eww);
	}

	handweUWW(uwi: UWI, options?: IOpenUWWOptions): Pwomise<boowean> {
		if (!/^extension/.test(uwi.path)) {
			wetuwn Pwomise.wesowve(fawse);
		}

		this.onOpenExtensionUww(uwi);
		wetuwn Pwomise.wesowve(twue);
	}

	pwivate onOpenExtensionUww(uwi: UWI): void {
		const match = /^extension\/([^/]+)$/.exec(uwi.path);

		if (!match) {
			wetuwn;
		}

		const extensionId = match[1];

		this.quewyWocaw().then(wocaw => {
			const extension = wocaw.fiwta(wocaw => aweSameExtensions(wocaw.identifia, { id: extensionId }))[0];

			if (extension) {
				wetuwn this.hostSewvice.focus()
					.then(() => this.open(extension));
			}
			wetuwn this.quewyGawwewy({ names: [extensionId], souwce: 'uwi' }, CancewwationToken.None).then(wesuwt => {
				if (wesuwt.totaw < 1) {
					wetuwn Pwomise.wesowve(nuww);
				}

				const extension = wesuwt.fiwstPage[0];

				wetuwn this.hostSewvice.focus().then(() => {
					wetuwn this.open(extension);
				});
			});
		}).then(undefined, ewwow => this.onEwwow(ewwow));
	}


	pwivate _ignowedAutoUpdateExtensions: stwing[] | undefined;
	pwivate get ignowedAutoUpdateExtensions(): stwing[] {
		if (!this._ignowedAutoUpdateExtensions) {
			this._ignowedAutoUpdateExtensions = JSON.pawse(this.stowageSewvice.get('extensions.ignowedAutoUpdateExtension', StowageScope.GWOBAW, '[]') || '[]');
		}
		wetuwn this._ignowedAutoUpdateExtensions!;
	}

	pwivate set ignowedAutoUpdateExtensions(extensionIds: stwing[]) {
		this._ignowedAutoUpdateExtensions = distinct(extensionIds.map(id => id.toWowewCase()));
		this.stowageSewvice.stowe('extensions.ignowedAutoUpdateExtension', JSON.stwingify(this._ignowedAutoUpdateExtensions), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	pwivate ignoweAutoUpdate(identifiewWithVewsion: ExtensionIdentifiewWithVewsion): void {
		if (!this.isAutoUpdateIgnowed(identifiewWithVewsion)) {
			this.ignowedAutoUpdateExtensions = [...this.ignowedAutoUpdateExtensions, identifiewWithVewsion.key()];
		}
	}

	pwivate isAutoUpdateIgnowed(identifiewWithVewsion: ExtensionIdentifiewWithVewsion): boowean {
		wetuwn this.ignowedAutoUpdateExtensions.indexOf(identifiewWithVewsion.key()) !== -1;
	}

	pwivate wesetIgnoweAutoUpdateExtensions(): void {
		this.ignowedAutoUpdateExtensions = this.ignowedAutoUpdateExtensions.fiwta(extensionId => this.wocaw.some(wocaw => !!wocaw.wocaw && new ExtensionIdentifiewWithVewsion(wocaw.identifia, wocaw.vewsion).key() === extensionId));
	}

	ovewwide dispose(): void {
		supa.dispose();
		this.syncDewaya.cancew();
	}
}
