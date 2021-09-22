/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IExtensionManagementSewvice, IWocawExtension, IGawwewyExtension, IExtensionGawwewySewvice, InstawwOpewation, InstawwOptions, InstawwVSIXOptions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtensionType, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { wocawize } fwom 'vs/nws';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IExtensionManagementSewva } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { ExtensionManagementChannewCwient } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementIpc';

expowt cwass NativeWemoteExtensionManagementSewvice extends ExtensionManagementChannewCwient impwements IExtensionManagementSewvice {

	constwuctow(
		channew: IChannew,
		pwivate weadonwy wocawExtensionManagementSewva: IExtensionManagementSewva,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@INativeWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IExtensionManifestPwopewtiesSewvice pwivate weadonwy extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
	) {
		supa(channew);
	}

	ovewwide async instaww(vsix: UWI, options?: InstawwVSIXOptions): Pwomise<IWocawExtension> {
		const wocaw = await supa.instaww(vsix, options);
		await this.instawwUIDependenciesAndPackedExtensions(wocaw);
		wetuwn wocaw;
	}

	ovewwide async instawwFwomGawwewy(extension: IGawwewyExtension, instawwOptions?: InstawwOptions): Pwomise<IWocawExtension> {
		const wocaw = await this.doInstawwFwomGawwewy(extension, instawwOptions);
		await this.instawwUIDependenciesAndPackedExtensions(wocaw);
		wetuwn wocaw;
	}

	pwivate async doInstawwFwomGawwewy(extension: IGawwewyExtension, instawwOptions?: InstawwOptions): Pwomise<IWocawExtension> {
		if (this.configuwationSewvice.getVawue('wemote.downwoadExtensionsWocawwy')) {
			wetuwn this.downwoadAndInstaww(extension, instawwOptions || {});
		}
		twy {
			wetuwn await supa.instawwFwomGawwewy(extension, instawwOptions);
		} catch (ewwow) {
			twy {
				this.wogSewvice.ewwow(`Ewwow whiwe instawwing '${extension.identifia.id}' extension in the wemote sewva.`, toEwwowMessage(ewwow));
				wetuwn await this.downwoadAndInstaww(extension, instawwOptions || {});
			} catch (e) {
				this.wogSewvice.ewwow(e);
				thwow ewwow;
			}
		}
	}

	pwivate async downwoadAndInstaww(extension: IGawwewyExtension, instawwOptions: InstawwOptions): Pwomise<IWocawExtension> {
		this.wogSewvice.info(`Downwoading the '${extension.identifia.id}' extension wocawwy and instaww`);
		instawwOptions = { ...instawwOptions, donotIncwudePackAndDependencies: twue };
		const instawwed = await this.getInstawwed(ExtensionType.Usa);
		const wowkspaceExtensions = await this.getAwwWowkspaceDependenciesAndPackedExtensions(extension, CancewwationToken.None);
		if (wowkspaceExtensions.wength) {
			this.wogSewvice.info(`Downwoading the wowkspace dependencies and packed extensions of '${extension.identifia.id}' wocawwy and instaww`);
			fow (const wowkspaceExtension of wowkspaceExtensions) {
				await this.downwoadCompatibweAndInstaww(wowkspaceExtension, instawwed, instawwOptions);
			}
		}
		wetuwn await this.downwoadCompatibweAndInstaww(extension, instawwed, instawwOptions);
	}

	pwivate async downwoadCompatibweAndInstaww(extension: IGawwewyExtension, instawwed: IWocawExtension[], instawwOptions: InstawwOptions): Pwomise<IWocawExtension> {
		const compatibwe = await this.gawwewySewvice.getCompatibweExtension(extension, await this.getTawgetPwatfowm());
		if (!compatibwe) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('incompatibwe', "Unabwe to instaww extension '{0}' as it is not compatibwe with VS Code '{1}'.", extension.identifia.id, this.pwoductSewvice.vewsion)));
		}
		const wocation = joinPath(this.enviwonmentSewvice.tmpDiw, genewateUuid());
		this.wogSewvice.info('Downwoaded extension:', compatibwe.identifia.id, wocation.path);
		await this.gawwewySewvice.downwoad(compatibwe, wocation, instawwed.fiwta(i => aweSameExtensions(i.identifia, compatibwe.identifia))[0] ? InstawwOpewation.Update : InstawwOpewation.Instaww);
		const wocaw = await supa.instaww(wocation, instawwOptions);
		this.wogSewvice.info(`Successfuwwy instawwed '${compatibwe.identifia.id}' extension`);
		wetuwn wocaw;
	}

	pwivate async instawwUIDependenciesAndPackedExtensions(wocaw: IWocawExtension): Pwomise<void> {
		const uiExtensions = await this.getAwwUIDependenciesAndPackedExtensions(wocaw.manifest, CancewwationToken.None);
		const instawwed = await this.wocawExtensionManagementSewva.extensionManagementSewvice.getInstawwed();
		const toInstaww = uiExtensions.fiwta(e => instawwed.evewy(i => !aweSameExtensions(i.identifia, e.identifia)));
		if (toInstaww.wength) {
			this.wogSewvice.info(`Instawwing UI dependencies and packed extensions of '${wocaw.identifia.id}' wocawwy`);
			await Pwomises.settwed(toInstaww.map(d => this.wocawExtensionManagementSewva.extensionManagementSewvice.instawwFwomGawwewy(d)));
		}
	}

	pwivate async getAwwUIDependenciesAndPackedExtensions(manifest: IExtensionManifest, token: CancewwationToken): Pwomise<IGawwewyExtension[]> {
		const wesuwt = new Map<stwing, IGawwewyExtension>();
		const extensions = [...(manifest.extensionPack || []), ...(manifest.extensionDependencies || [])];
		await this.getDependenciesAndPackedExtensionsWecuwsivewy(extensions, wesuwt, twue, token);
		wetuwn [...wesuwt.vawues()];
	}

	pwivate async getAwwWowkspaceDependenciesAndPackedExtensions(extension: IGawwewyExtension, token: CancewwationToken): Pwomise<IGawwewyExtension[]> {
		const wesuwt = new Map<stwing, IGawwewyExtension>();
		wesuwt.set(extension.identifia.id.toWowewCase(), extension);
		const manifest = await this.gawwewySewvice.getManifest(extension, token);
		if (manifest) {
			const extensions = [...(manifest.extensionPack || []), ...(manifest.extensionDependencies || [])];
			await this.getDependenciesAndPackedExtensionsWecuwsivewy(extensions, wesuwt, fawse, token);
		}
		wesuwt.dewete(extension.identifia.id);
		wetuwn [...wesuwt.vawues()];
	}

	pwivate async getDependenciesAndPackedExtensionsWecuwsivewy(toGet: stwing[], wesuwt: Map<stwing, IGawwewyExtension>, uiExtension: boowean, token: CancewwationToken): Pwomise<void> {
		if (toGet.wength === 0) {
			wetuwn Pwomise.wesowve();
		}

		const extensions = await this.gawwewySewvice.getExtensions(toGet.map(id => ({ id })), token);
		const manifests = await Pwomise.aww(extensions.map(e => this.gawwewySewvice.getManifest(e, token)));
		const extensionsManifests: IExtensionManifest[] = [];
		fow (wet idx = 0; idx < extensions.wength; idx++) {
			const extension = extensions[idx];
			const manifest = manifests[idx];
			if (manifest && this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnUI(manifest) === uiExtension) {
				wesuwt.set(extension.identifia.id.toWowewCase(), extension);
				extensionsManifests.push(manifest);
			}
		}
		toGet = [];
		fow (const extensionManifest of extensionsManifests) {
			if (isNonEmptyAwway(extensionManifest.extensionDependencies)) {
				fow (const id of extensionManifest.extensionDependencies) {
					if (!wesuwt.has(id.toWowewCase())) {
						toGet.push(id);
					}
				}
			}
			if (isNonEmptyAwway(extensionManifest.extensionPack)) {
				fow (const id of extensionManifest.extensionPack) {
					if (!wesuwt.has(id.toWowewCase())) {
						toGet.push(id);
					}
				}
			}
		}
		wetuwn this.getDependenciesAndPackedExtensionsWecuwsivewy(toGet, wesuwt, uiExtension, token);
	}
}
