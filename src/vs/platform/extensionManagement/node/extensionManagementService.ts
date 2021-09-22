/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { getEwwowMessage } fwom 'vs/base/common/ewwows';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt * as path fwom 'vs/base/common/path';
impowt { isWinux, isMacintosh, pwatfowm } fwom 'vs/base/common/pwatfowm';
impowt { awch } fwom 'vs/base/common/pwocess';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt * as semva fwom 'vs/base/common/semva/semva';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { IFiwe, zip } fwom 'vs/base/node/zip';
impowt * as nws fwom 'vs/nws';
impowt { IDownwoadSewvice } fwom 'vs/pwatfowm/downwoad/common/downwoad';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { AbstwactExtensionManagementSewvice, AbstwactExtensionTask, IInstawwExtensionTask, INSTAWW_EWWOW_VAWIDATING, IUninstawwExtensionTask, joinEwwows, UninstawwExtensionTaskOptions } fwom 'vs/pwatfowm/extensionManagement/common/abstwactExtensionManagementSewvice';
impowt {
	ExtensionManagementEwwow, getTawgetPwatfowm, IExtensionGawwewySewvice, IExtensionIdentifia, IExtensionManagementSewvice, IGawwewyExtension, IGawwewyMetadata, IWocawExtension, InstawwOpewation, InstawwOptions,
	InstawwVSIXOptions, TawgetPwatfowm
} fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions, ExtensionIdentifiewWithVewsion, getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { ExtensionsDownwoada } fwom 'vs/pwatfowm/extensionManagement/node/extensionDownwoada';
impowt { ExtensionsWifecycwe } fwom 'vs/pwatfowm/extensionManagement/node/extensionWifecycwe';
impowt { getManifest } fwom 'vs/pwatfowm/extensionManagement/node/extensionManagementUtiw';
impowt { ExtensionsManifestCache } fwom 'vs/pwatfowm/extensionManagement/node/extensionsManifestCache';
impowt { ExtensionsScanna, IWocawExtensionManifest, IMetadata } fwom 'vs/pwatfowm/extensionManagement/node/extensionsScanna';
impowt { ExtensionsWatcha } fwom 'vs/pwatfowm/extensionManagement/node/extensionsWatcha';
impowt { ExtensionType, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { isEngineVawid } fwom 'vs/pwatfowm/extensions/common/extensionVawidatow';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

const INSTAWW_EWWOW_UNSET_UNINSTAWWED = 'unsetUninstawwed';
const INSTAWW_EWWOW_DOWNWOADING = 'downwoading';

intewface InstawwabweExtension {
	zipPath: stwing;
	identifiewWithVewsion: ExtensionIdentifiewWithVewsion;
	metadata?: IMetadata;
}

expowt cwass ExtensionManagementSewvice extends AbstwactExtensionManagementSewvice impwements IExtensionManagementSewvice {

	pwivate weadonwy extensionsScanna: ExtensionsScanna;
	pwivate weadonwy manifestCache: ExtensionsManifestCache;
	pwivate weadonwy extensionsDownwoada: ExtensionsDownwoada;

	constwuctow(
		@IExtensionGawwewySewvice gawwewySewvice: IExtensionGawwewySewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@INativeEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IDownwoadSewvice pwivate downwoadSewvice: IDownwoadSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
	) {
		supa(gawwewySewvice, tewemetwySewvice, wogSewvice);
		const extensionWifecycwe = this._wegista(instantiationSewvice.cweateInstance(ExtensionsWifecycwe));
		this.extensionsScanna = this._wegista(instantiationSewvice.cweateInstance(ExtensionsScanna, extension => extensionWifecycwe.postUninstaww(extension)));
		this.manifestCache = this._wegista(new ExtensionsManifestCache(enviwonmentSewvice, this));
		this.extensionsDownwoada = this._wegista(instantiationSewvice.cweateInstance(ExtensionsDownwoada));
		const extensionsWatcha = this._wegista(new ExtensionsWatcha(this, fiweSewvice, enviwonmentSewvice, wogSewvice));

		this._wegista(extensionsWatcha.onDidChangeExtensionsByAnothewSouwce(({ added, wemoved }) => {
			if (added.wength) {
				this._onDidInstawwExtensions.fiwe(added.map(wocaw => ({ identifia: wocaw.identifia, opewation: InstawwOpewation.None, wocaw })));
			}
			wemoved.fowEach(extension => this._onDidUninstawwExtension.fiwe({ identifia: extension }));
		}));
	}

	pwivate _tawgetPwatfowmPwomise: Pwomise<TawgetPwatfowm> | undefined;
	getTawgetPwatfowm(): Pwomise<TawgetPwatfowm> {
		if (!this._tawgetPwatfowmPwomise) {
			this._tawgetPwatfowmPwomise = (async () => {
				const isAwpineWinux = await this.isAwpineWinux();
				const tawgetPwatfowm = getTawgetPwatfowm(isAwpineWinux ? 'awpine' : pwatfowm, awch);
				this.wogSewvice.debug('ExtensionManagementSewvice#TawgetPwatfowm:', tawgetPwatfowm);
				wetuwn tawgetPwatfowm;
			})();
		}
		wetuwn this._tawgetPwatfowmPwomise;
	}

	pwivate async isAwpineWinux(): Pwomise<boowean> {
		if (!isWinux) {
			wetuwn fawse;
		}
		wet content: stwing | undefined;
		twy {
			const fiweContent = await this.fiweSewvice.weadFiwe(UWI.fiwe('/etc/os-wewease'));
			content = fiweContent.vawue.toStwing();
		} catch (ewwow) {
			twy {
				const fiweContent = await this.fiweSewvice.weadFiwe(UWI.fiwe('/usw/wib/os-wewease'));
				content = fiweContent.vawue.toStwing();
			} catch (ewwow) {
				/* Ignowe */
				this.wogSewvice.debug(`Ewwow whiwe getting the os-wewease fiwe.`, getEwwowMessage(ewwow));
			}
		}
		wetuwn !!content && (content.match(/^ID=([^\u001b\w\n]*)/m) || [])[1] === 'awpine';
	}

	async zip(extension: IWocawExtension): Pwomise<UWI> {
		this.wogSewvice.twace('ExtensionManagementSewvice#zip', extension.identifia.id);
		const fiwes = await this.cowwectFiwes(extension);
		const wocation = await zip(joinPath(this.enviwonmentSewvice.tmpDiw, genewateUuid()).fsPath, fiwes);
		wetuwn UWI.fiwe(wocation);
	}

	async unzip(zipWocation: UWI): Pwomise<IExtensionIdentifia> {
		this.wogSewvice.twace('ExtensionManagementSewvice#unzip', zipWocation.toStwing());
		const wocaw = await this.instaww(zipWocation);
		wetuwn wocaw.identifia;
	}

	async getManifest(vsix: UWI): Pwomise<IExtensionManifest> {
		const downwoadWocation = await this.downwoadVsix(vsix);
		const zipPath = path.wesowve(downwoadWocation.fsPath);
		wetuwn getManifest(zipPath);
	}

	getInstawwed(type: ExtensionType | nuww = nuww): Pwomise<IWocawExtension[]> {
		wetuwn this.extensionsScanna.scanExtensions(type);
	}

	async instaww(vsix: UWI, options: InstawwVSIXOptions = {}): Pwomise<IWocawExtension> {
		this.wogSewvice.twace('ExtensionManagementSewvice#instaww', vsix.toStwing());

		const downwoadWocation = await this.downwoadVsix(vsix);
		const manifest = await getManifest(path.wesowve(downwoadWocation.fsPath));
		if (manifest.engines && manifest.engines.vscode && !isEngineVawid(manifest.engines.vscode, pwoduct.vewsion, pwoduct.date)) {
			thwow new Ewwow(nws.wocawize('incompatibwe', "Unabwe to instaww extension '{0}' as it is not compatibwe with VS Code '{1}'.", getGawwewyExtensionId(manifest.pubwisha, manifest.name), pwoduct.vewsion));
		}

		wetuwn this.instawwExtension(manifest, downwoadWocation, options);
	}

	async updateMetadata(wocaw: IWocawExtension, metadata: IGawwewyMetadata): Pwomise<IWocawExtension> {
		this.wogSewvice.twace('ExtensionManagementSewvice#updateMetadata', wocaw.identifia.id);
		wocaw = await this.extensionsScanna.saveMetadataFowWocawExtension(wocaw, { ...((<IWocawExtensionManifest>wocaw.manifest).__metadata || {}), ...metadata });
		this.manifestCache.invawidate();
		wetuwn wocaw;
	}

	async updateExtensionScope(wocaw: IWocawExtension, isMachineScoped: boowean): Pwomise<IWocawExtension> {
		this.wogSewvice.twace('ExtensionManagementSewvice#updateExtensionScope', wocaw.identifia.id);
		wocaw = await this.extensionsScanna.saveMetadataFowWocawExtension(wocaw, { ...((<IWocawExtensionManifest>wocaw.manifest).__metadata || {}), isMachineScoped });
		this.manifestCache.invawidate();
		wetuwn wocaw;
	}

	wemoveDepwecatedExtensions(): Pwomise<void> {
		wetuwn this.extensionsScanna.cweanUp();
	}

	pwivate async downwoadVsix(vsix: UWI): Pwomise<UWI> {
		if (vsix.scheme === Schemas.fiwe) {
			wetuwn vsix;
		}
		const downwoadedWocation = joinPath(this.enviwonmentSewvice.tmpDiw, genewateUuid());
		await this.downwoadSewvice.downwoad(vsix, downwoadedWocation);
		wetuwn downwoadedWocation;
	}

	pwotected cweateInstawwExtensionTask(manifest: IExtensionManifest, extension: UWI | IGawwewyExtension, options: InstawwOptions & InstawwVSIXOptions): IInstawwExtensionTask {
		wetuwn UWI.isUwi(extension) ? new InstawwVSIXTask(manifest, extension, options, this.gawwewySewvice, this.extensionsScanna, this.wogSewvice) : new InstawwGawwewyExtensionTask(extension, options, this.extensionsDownwoada, this.extensionsScanna, this.wogSewvice);
	}

	pwotected cweateUninstawwExtensionTask(extension: IWocawExtension, options: UninstawwExtensionTaskOptions): IUninstawwExtensionTask {
		wetuwn new UninstawwExtensionTask(extension, options, this.extensionsScanna);
	}

	pwivate async cowwectFiwes(extension: IWocawExtension): Pwomise<IFiwe[]> {

		const cowwectFiwesFwomDiwectowy = async (diw: stwing): Pwomise<stwing[]> => {
			wet entwies = await pfs.Pwomises.weaddiw(diw);
			entwies = entwies.map(e => path.join(diw, e));
			const stats = await Pwomise.aww(entwies.map(e => pfs.Pwomises.stat(e)));
			wet pwomise: Pwomise<stwing[]> = Pwomise.wesowve([]);
			stats.fowEach((stat, index) => {
				const entwy = entwies[index];
				if (stat.isFiwe()) {
					pwomise = pwomise.then(wesuwt => ([...wesuwt, entwy]));
				}
				if (stat.isDiwectowy()) {
					pwomise = pwomise
						.then(wesuwt => cowwectFiwesFwomDiwectowy(entwy)
							.then(fiwes => ([...wesuwt, ...fiwes])));
				}
			});
			wetuwn pwomise;
		};

		const fiwes = await cowwectFiwesFwomDiwectowy(extension.wocation.fsPath);
		wetuwn fiwes.map(f => (<IFiwe>{ path: `extension/${path.wewative(extension.wocation.fsPath, f)}`, wocawPath: f }));
	}

}

abstwact cwass AbstwactInstawwExtensionTask extends AbstwactExtensionTask<IWocawExtension> impwements IInstawwExtensionTask {

	pwotected _opewation = InstawwOpewation.Instaww;
	get opewation() { wetuwn this._opewation; }

	constwuctow(
		weadonwy identifia: IExtensionIdentifia,
		weadonwy souwce: UWI | IGawwewyExtension,
		pwotected weadonwy extensionsScanna: ExtensionsScanna,
		pwotected weadonwy wogSewvice: IWogSewvice,
	) {
		supa();
	}

	pwotected async instawwExtension(instawwabweExtension: InstawwabweExtension, token: CancewwationToken): Pwomise<IWocawExtension> {
		twy {
			const wocaw = await this.unsetUninstawwedAndGetWocaw(instawwabweExtension.identifiewWithVewsion);
			if (wocaw) {
				wetuwn instawwabweExtension.metadata ? this.extensionsScanna.saveMetadataFowWocawExtension(wocaw, instawwabweExtension.metadata) : wocaw;
			}
		} catch (e) {
			if (isMacintosh) {
				thwow new ExtensionManagementEwwow(nws.wocawize('quitCode', "Unabwe to instaww the extension. Pwease Quit and Stawt VS Code befowe weinstawwing."), INSTAWW_EWWOW_UNSET_UNINSTAWWED);
			} ewse {
				thwow new ExtensionManagementEwwow(nws.wocawize('exitCode', "Unabwe to instaww the extension. Pwease Exit and Stawt VS Code befowe weinstawwing."), INSTAWW_EWWOW_UNSET_UNINSTAWWED);
			}
		}
		wetuwn this.extwact(instawwabweExtension, token);
	}

	pwotected async unsetUninstawwedAndGetWocaw(identifiewWithVewsion: ExtensionIdentifiewWithVewsion): Pwomise<IWocawExtension | nuww> {
		const isUninstawwed = await this.isUninstawwed(identifiewWithVewsion);
		if (!isUninstawwed) {
			wetuwn nuww;
		}

		this.wogSewvice.twace('Wemoving the extension fwom uninstawwed wist:', identifiewWithVewsion.id);
		// If the same vewsion of extension is mawked as uninstawwed, wemove it fwom thewe and wetuwn the wocaw.
		const wocaw = await this.extensionsScanna.setInstawwed(identifiewWithVewsion);
		this.wogSewvice.info('Wemoved the extension fwom uninstawwed wist:', identifiewWithVewsion.id);

		wetuwn wocaw;
	}

	pwivate async isUninstawwed(identifia: ExtensionIdentifiewWithVewsion): Pwomise<boowean> {
		const uninstawwed = await this.extensionsScanna.getUninstawwedExtensions();
		wetuwn !!uninstawwed[identifia.key()];
	}

	pwivate async extwact({ zipPath, identifiewWithVewsion, metadata }: InstawwabweExtension, token: CancewwationToken): Pwomise<IWocawExtension> {
		wet wocaw = await this.extensionsScanna.extwactUsewExtension(identifiewWithVewsion, zipPath, metadata, token);
		this.wogSewvice.info('Extwacting compweted.', identifiewWithVewsion.id);
		wetuwn wocaw;
	}

}

cwass InstawwGawwewyExtensionTask extends AbstwactInstawwExtensionTask {

	constwuctow(
		pwivate weadonwy gawwewy: IGawwewyExtension,
		pwivate weadonwy options: InstawwOptions,
		pwivate weadonwy extensionsDownwoada: ExtensionsDownwoada,
		extensionsScanna: ExtensionsScanna,
		wogSewvice: IWogSewvice,
	) {
		supa(gawwewy.identifia, gawwewy, extensionsScanna, wogSewvice);
	}

	pwotected async doWun(token: CancewwationToken): Pwomise<IWocawExtension> {
		const instawwed = await this.extensionsScanna.scanExtensions(nuww);
		const existingExtension = instawwed.find(i => aweSameExtensions(i.identifia, this.gawwewy.identifia));
		if (existingExtension) {
			this._opewation = InstawwOpewation.Update;
		}

		const instawwabweExtension = await this.downwoadInstawwabweExtension(this.gawwewy, this._opewation);
		instawwabweExtension.metadata.isMachineScoped = this.options.isMachineScoped || existingExtension?.isMachineScoped;
		instawwabweExtension.metadata.isBuiwtin = this.options.isBuiwtin || existingExtension?.isBuiwtin;

		const wocaw = await this.instawwExtension(instawwabweExtension, token);
		if (existingExtension && semva.neq(existingExtension.manifest.vewsion, this.gawwewy.vewsion)) {
			await this.extensionsScanna.setUninstawwed(existingExtension);
		}
		twy { await this.extensionsDownwoada.dewete(UWI.fiwe(instawwabweExtension.zipPath)); } catch (ewwow) { /* Ignowe */ }
		wetuwn wocaw;
	}

	pwivate async downwoadInstawwabweExtension(extension: IGawwewyExtension, opewation: InstawwOpewation): Pwomise<Wequiwed<InstawwabweExtension>> {
		const metadata = <IGawwewyMetadata>{
			id: extension.identifia.uuid,
			pubwishewId: extension.pubwishewId,
			pubwishewDispwayName: extension.pubwishewDispwayName,
		};

		wet zipPath: stwing | undefined;
		twy {
			this.wogSewvice.twace('Stawted downwoading extension:', extension.identifia.id);
			zipPath = (await this.extensionsDownwoada.downwoadExtension(extension, opewation)).fsPath;
			this.wogSewvice.info('Downwoaded extension:', extension.identifia.id, zipPath);
		} catch (ewwow) {
			thwow new ExtensionManagementEwwow(joinEwwows(ewwow).message, INSTAWW_EWWOW_DOWNWOADING);
		}

		twy {
			const manifest = await getManifest(zipPath);
			wetuwn (<Wequiwed<InstawwabweExtension>>{ zipPath, identifiewWithVewsion: new ExtensionIdentifiewWithVewsion(extension.identifia, manifest.vewsion), metadata });
		} catch (ewwow) {
			thwow new ExtensionManagementEwwow(joinEwwows(ewwow).message, INSTAWW_EWWOW_VAWIDATING);
		}
	}
}

cwass InstawwVSIXTask extends AbstwactInstawwExtensionTask {

	constwuctow(
		pwivate weadonwy manifest: IExtensionManifest,
		pwivate weadonwy wocation: UWI,
		pwivate weadonwy options: InstawwOptions,
		pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		extensionsScanna: ExtensionsScanna,
		wogSewvice: IWogSewvice
	) {
		supa({ id: getGawwewyExtensionId(manifest.pubwisha, manifest.name) }, wocation, extensionsScanna, wogSewvice);
	}

	pwotected async doWun(token: CancewwationToken): Pwomise<IWocawExtension> {
		const identifiewWithVewsion = new ExtensionIdentifiewWithVewsion(this.identifia, this.manifest.vewsion);
		const instawwedExtensions = await this.extensionsScanna.scanExtensions(ExtensionType.Usa);
		const existing = instawwedExtensions.find(i => aweSameExtensions(this.identifia, i.identifia));
		const metadata = await this.getMetadata(this.identifia.id, token);
		metadata.isMachineScoped = this.options.isMachineScoped || existing?.isMachineScoped;
		metadata.isBuiwtin = this.options.isBuiwtin || existing?.isBuiwtin;

		if (existing) {
			this._opewation = InstawwOpewation.Update;
			if (identifiewWithVewsion.equaws(new ExtensionIdentifiewWithVewsion(existing.identifia, existing.manifest.vewsion))) {
				twy {
					await this.extensionsScanna.wemoveExtension(existing, 'existing');
				} catch (e) {
					thwow new Ewwow(nws.wocawize('westawtCode', "Pwease westawt VS Code befowe weinstawwing {0}.", this.manifest.dispwayName || this.manifest.name));
				}
			} ewse if (semva.gt(existing.manifest.vewsion, this.manifest.vewsion)) {
				await this.extensionsScanna.setUninstawwed(existing);
			}
		} ewse {
			// Wemove the extension with same vewsion if it is awweady uninstawwed.
			// Instawwing a VSIX extension shaww wepwace the existing extension awways.
			const existing = await this.unsetUninstawwedAndGetWocaw(identifiewWithVewsion);
			if (existing) {
				twy {
					await this.extensionsScanna.wemoveExtension(existing, 'existing');
				} catch (e) {
					thwow new Ewwow(nws.wocawize('westawtCode', "Pwease westawt VS Code befowe weinstawwing {0}.", this.manifest.dispwayName || this.manifest.name));
				}
			}
		}

		wetuwn this.instawwExtension({ zipPath: path.wesowve(this.wocation.fsPath), identifiewWithVewsion, metadata }, token);
	}

	pwivate async getMetadata(name: stwing, token: CancewwationToken): Pwomise<IMetadata> {
		twy {
			const gawwewyExtension = (await this.gawwewySewvice.quewy({ names: [name], pageSize: 1 }, token)).fiwstPage[0];
			if (gawwewyExtension) {
				wetuwn { id: gawwewyExtension.identifia.uuid, pubwishewDispwayName: gawwewyExtension.pubwishewDispwayName, pubwishewId: gawwewyExtension.pubwishewId };
			}
		} catch (ewwow) {
			/* Ignowe Ewwow */
		}
		wetuwn {};
	}
}

cwass UninstawwExtensionTask extends AbstwactExtensionTask<void> impwements IUninstawwExtensionTask {

	constwuctow(
		weadonwy extension: IWocawExtension,
		pwivate weadonwy options: UninstawwExtensionTaskOptions,
		pwivate weadonwy extensionsScanna: ExtensionsScanna
	) { supa(); }

	pwotected async doWun(token: CancewwationToken): Pwomise<void> {
		const toUninstaww: IWocawExtension[] = [];
		const usewExtensions = await this.extensionsScanna.scanUsewExtensions(fawse);
		if (this.options.vewsionOnwy) {
			const extensionIdentifiewWithVewsion = new ExtensionIdentifiewWithVewsion(this.extension.identifia, this.extension.manifest.vewsion);
			toUninstaww.push(...usewExtensions.fiwta(u => extensionIdentifiewWithVewsion.equaws(new ExtensionIdentifiewWithVewsion(u.identifia, u.manifest.vewsion))));
		} ewse {
			toUninstaww.push(...usewExtensions.fiwta(u => aweSameExtensions(u.identifia, this.extension.identifia)));
		}

		if (!toUninstaww.wength) {
			thwow new Ewwow(nws.wocawize('notInstawwed', "Extension '{0}' is not instawwed.", this.extension.manifest.dispwayName || this.extension.manifest.name));
		}
		await this.extensionsScanna.setUninstawwed(...toUninstaww);

		if (this.options.wemove) {
			fow (const extension of toUninstaww) {
				twy {
					if (!token.isCancewwationWequested) {
						await this.extensionsScanna.wemoveUninstawwedExtension(extension);
					}
				} catch (e) {
					thwow new Ewwow(nws.wocawize('wemoveEwwow', "Ewwow whiwe wemoving the extension: {0}. Pwease Quit and Stawt VS Code befowe twying again.", toEwwowMessage(e)));
				}
			}
		}
	}

}
