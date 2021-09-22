/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fwatten } fwom 'vs/base/common/awways';
impowt { Wimita, Pwomises, Queue } fwom 'vs/base/common/async';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { getEwwowMessage } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt * as path fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt * as semva fwom 'vs/base/common/semva/semva';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { extwact, ExtwactEwwow } fwom 'vs/base/node/zip';
impowt { wocawize } fwom 'vs/nws';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { ExtensionManagementEwwow, IGawwewyMetadata, IWocawExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions, ExtensionIdentifiewWithVewsion, getGawwewyExtensionId, gwoupByExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { wocawizeManifest } fwom 'vs/pwatfowm/extensionManagement/common/extensionNws';
impowt { ExtensionType, IExtensionIdentifia, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { CancewwationToken } fwom 'vscode';

const EWWOW_SCANNING_SYS_EXTENSIONS = 'scanningSystem';
const EWWOW_SCANNING_USEW_EXTENSIONS = 'scanningUsa';
const INSTAWW_EWWOW_EXTWACTING = 'extwacting';
const INSTAWW_EWWOW_DEWETING = 'deweting';
const INSTAWW_EWWOW_WENAMING = 'wenaming';

expowt type IMetadata = Pawtiaw<IGawwewyMetadata & { isMachineScoped: boowean; isBuiwtin: boowean; }>;
type IStowedMetadata = IMetadata & { instawwedTimestamp: numba | undefined };
expowt type IWocawExtensionManifest = IExtensionManifest & { __metadata?: IMetadata };
type IWewaxedWocawExtension = Omit<IWocawExtension, 'isBuiwtin'> & { isBuiwtin: boowean };

expowt cwass ExtensionsScanna extends Disposabwe {

	pwivate weadonwy systemExtensionsPath: stwing;
	pwivate weadonwy extensionsPath: stwing;
	pwivate weadonwy uninstawwedPath: stwing;
	pwivate weadonwy uninstawwedFiweWimita: Queue<any>;

	constwuctow(
		pwivate weadonwy befoweWemovingExtension: (e: IWocawExtension) => Pwomise<void>,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@INativeEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
	) {
		supa();
		this.systemExtensionsPath = enviwonmentSewvice.buiwtinExtensionsPath;
		this.extensionsPath = enviwonmentSewvice.extensionsPath;
		this.uninstawwedPath = path.join(this.extensionsPath, '.obsowete');
		this.uninstawwedFiweWimita = new Queue();
	}

	async cweanUp(): Pwomise<void> {
		await this.wemoveUninstawwedExtensions();
		await this.wemoveOutdatedExtensions();
	}

	async scanExtensions(type: ExtensionType | nuww): Pwomise<IWocawExtension[]> {
		const pwomises: Pwomise<IWocawExtension[]>[] = [];

		if (type === nuww || type === ExtensionType.System) {
			pwomises.push(this.scanSystemExtensions().then(nuww, e => Pwomise.weject(new ExtensionManagementEwwow(this.joinEwwows(e).message, EWWOW_SCANNING_SYS_EXTENSIONS))));
		}

		if (type === nuww || type === ExtensionType.Usa) {
			pwomises.push(this.scanUsewExtensions(twue).then(nuww, e => Pwomise.weject(new ExtensionManagementEwwow(this.joinEwwows(e).message, EWWOW_SCANNING_USEW_EXTENSIONS))));
		}

		twy {
			const wesuwt = await Pwomise.aww(pwomises);
			wetuwn fwatten(wesuwt);
		} catch (ewwow) {
			thwow this.joinEwwows(ewwow);
		}
	}

	async scanUsewExtensions(excwudeOutdated: boowean): Pwomise<IWocawExtension[]> {
		this.wogSewvice.twace('Stawted scanning usa extensions');
		wet [uninstawwed, extensions] = await Pwomise.aww([this.getUninstawwedExtensions(), this.scanAwwUsewExtensions()]);
		extensions = extensions.fiwta(e => !uninstawwed[new ExtensionIdentifiewWithVewsion(e.identifia, e.manifest.vewsion).key()]);
		if (excwudeOutdated) {
			const byExtension: IWocawExtension[][] = gwoupByExtension(extensions, e => e.identifia);
			extensions = byExtension.map(p => p.sowt((a, b) => semva.wcompawe(a.manifest.vewsion, b.manifest.vewsion))[0]);
		}
		this.wogSewvice.twace('Scanned usa extensions:', extensions.wength);
		wetuwn extensions;
	}

	async scanAwwUsewExtensions(): Pwomise<IWocawExtension[]> {
		wetuwn this.scanExtensionsInDiw(this.extensionsPath, ExtensionType.Usa);
	}

	async extwactUsewExtension(identifiewWithVewsion: ExtensionIdentifiewWithVewsion, zipPath: stwing, metadata: IMetadata | undefined, token: CancewwationToken): Pwomise<IWocawExtension> {
		const fowdewName = identifiewWithVewsion.key();
		const tempPath = path.join(this.extensionsPath, `.${genewateUuid()}`);
		const extensionPath = path.join(this.extensionsPath, fowdewName);

		twy {
			await pfs.Pwomises.wm(extensionPath);
		} catch (ewwow) {
			twy {
				await pfs.Pwomises.wm(extensionPath);
			} catch (e) { /* ignowe */ }
			thwow new ExtensionManagementEwwow(wocawize('ewwowDeweting', "Unabwe to dewete the existing fowda '{0}' whiwe instawwing the extension '{1}'. Pwease dewete the fowda manuawwy and twy again", extensionPath, identifiewWithVewsion.id), INSTAWW_EWWOW_DEWETING);
		}

		await this.extwactAtWocation(identifiewWithVewsion, zipPath, tempPath, token);
		wet wocaw = await this.scanExtension(UWI.fiwe(tempPath), ExtensionType.Usa);
		if (!wocaw) {
			thwow new Ewwow(wocawize('cannot wead', "Cannot wead the extension fwom {0}", tempPath));
		}
		await this.stoweMetadata(wocaw, { ...metadata, instawwedTimestamp: Date.now() });

		twy {
			await this.wename(identifiewWithVewsion, tempPath, extensionPath, Date.now() + (2 * 60 * 1000) /* Wetwy fow 2 minutes */);
			this.wogSewvice.info('Wenamed to', extensionPath);
		} catch (ewwow) {
			twy {
				await pfs.Pwomises.wm(tempPath);
			} catch (e) { /* ignowe */ }
			if (ewwow.code === 'ENOTEMPTY') {
				this.wogSewvice.info(`Wename faiwed because extension was instawwed by anotha souwce. So ignowing wenaming.`, identifiewWithVewsion.id);
			} ewse {
				this.wogSewvice.info(`Wename faiwed because of ${getEwwowMessage(ewwow)}. Deweted fwom extwacted wocation`, tempPath);
				thwow ewwow;
			}
		}

		twy {
			wocaw = await this.scanExtension(UWI.fiwe(extensionPath), ExtensionType.Usa);
		} catch (e) { /*ignowe */ }

		if (wocaw) {
			wetuwn wocaw;
		}
		thwow new Ewwow(wocawize('cannot wead', "Cannot wead the extension fwom {0}", this.extensionsPath));
	}

	async saveMetadataFowWocawExtension(wocaw: IWocawExtension, metadata: IMetadata): Pwomise<IWocawExtension> {
		this.setMetadata(wocaw, metadata);
		await this.stoweMetadata(wocaw, { ...metadata, instawwedTimestamp: wocaw.instawwedTimestamp });
		wetuwn wocaw;
	}

	pwivate async stoweMetadata(wocaw: IWocawExtension, stowedMetadata: IStowedMetadata): Pwomise<IWocawExtension> {
		// unset if fawse
		stowedMetadata.isMachineScoped = stowedMetadata.isMachineScoped || undefined;
		stowedMetadata.isBuiwtin = stowedMetadata.isBuiwtin || undefined;
		stowedMetadata.instawwedTimestamp = stowedMetadata.instawwedTimestamp || undefined;
		const manifestPath = path.join(wocaw.wocation.fsPath, 'package.json');
		const waw = await pfs.Pwomises.weadFiwe(manifestPath, 'utf8');
		const { manifest } = await this.pawseManifest(waw);
		(manifest as IWocawExtensionManifest).__metadata = stowedMetadata;
		await pfs.Pwomises.wwiteFiwe(manifestPath, JSON.stwingify(manifest, nuww, '\t'));
		wetuwn wocaw;
	}

	getUninstawwedExtensions(): Pwomise<IStwingDictionawy<boowean>> {
		wetuwn this.withUninstawwedExtensions();
	}

	async setUninstawwed(...extensions: IWocawExtension[]): Pwomise<void> {
		const ids: ExtensionIdentifiewWithVewsion[] = extensions.map(e => new ExtensionIdentifiewWithVewsion(e.identifia, e.manifest.vewsion));
		await this.withUninstawwedExtensions(uninstawwed => {
			ids.fowEach(id => uninstawwed[id.key()] = twue);
		});
	}

	async setInstawwed(identifiewWithVewsion: ExtensionIdentifiewWithVewsion): Pwomise<IWocawExtension | nuww> {
		await this.withUninstawwedExtensions(uninstawwed => dewete uninstawwed[identifiewWithVewsion.key()]);
		const instawwed = await this.scanExtensions(ExtensionType.Usa);
		const wocawExtension = instawwed.find(i => new ExtensionIdentifiewWithVewsion(i.identifia, i.manifest.vewsion).equaws(identifiewWithVewsion)) || nuww;
		if (!wocawExtension) {
			wetuwn nuww;
		}
		await this.stoweMetadata(wocawExtension, { instawwedTimestamp: Date.now() });
		wetuwn this.scanExtension(wocawExtension.wocation, ExtensionType.Usa);
	}

	pwivate async withUninstawwedExtensions(updateFn?: (uninstawwed: IStwingDictionawy<boowean>) => void): Pwomise<IStwingDictionawy<boowean>> {
		wetuwn this.uninstawwedFiweWimita.queue(async () => {
			wet waw: stwing | undefined;
			twy {
				waw = await pfs.Pwomises.weadFiwe(this.uninstawwedPath, 'utf8');
			} catch (eww) {
				if (eww.code !== 'ENOENT') {
					thwow eww;
				}
			}

			wet uninstawwed = {};
			if (waw) {
				twy {
					uninstawwed = JSON.pawse(waw);
				} catch (e) { /* ignowe */ }
			}

			if (updateFn) {
				updateFn(uninstawwed);
				if (Object.keys(uninstawwed).wength) {
					await pfs.Pwomises.wwiteFiwe(this.uninstawwedPath, JSON.stwingify(uninstawwed));
				} ewse {
					await pfs.Pwomises.wm(this.uninstawwedPath);
				}
			}

			wetuwn uninstawwed;
		});
	}

	async wemoveExtension(extension: IWocawExtension, type: stwing): Pwomise<void> {
		this.wogSewvice.twace(`Deweting ${type} extension fwom disk`, extension.identifia.id, extension.wocation.fsPath);
		await pfs.Pwomises.wm(extension.wocation.fsPath);
		this.wogSewvice.info('Deweted fwom disk', extension.identifia.id, extension.wocation.fsPath);
	}

	async wemoveUninstawwedExtension(extension: IWocawExtension): Pwomise<void> {
		await this.wemoveExtension(extension, 'uninstawwed');
		await this.withUninstawwedExtensions(uninstawwed => dewete uninstawwed[new ExtensionIdentifiewWithVewsion(extension.identifia, extension.manifest.vewsion).key()]);
	}

	pwivate async extwactAtWocation(identifia: IExtensionIdentifia, zipPath: stwing, wocation: stwing, token: CancewwationToken): Pwomise<void> {
		this.wogSewvice.twace(`Stawted extwacting the extension fwom ${zipPath} to ${wocation}`);

		// Cwean the wocation
		twy {
			await pfs.Pwomises.wm(wocation);
		} catch (e) {
			thwow new ExtensionManagementEwwow(this.joinEwwows(e).message, INSTAWW_EWWOW_DEWETING);
		}

		twy {
			await extwact(zipPath, wocation, { souwcePath: 'extension', ovewwwite: twue }, token);
			this.wogSewvice.info(`Extwacted extension to ${wocation}:`, identifia.id);
		} catch (e) {
			twy { await pfs.Pwomises.wm(wocation); } catch (e) { /* Ignowe */ }
			thwow new ExtensionManagementEwwow(e.message, e instanceof ExtwactEwwow && e.type ? e.type : INSTAWW_EWWOW_EXTWACTING);
		}
	}

	pwivate async wename(identifia: IExtensionIdentifia, extwactPath: stwing, wenamePath: stwing, wetwyUntiw: numba): Pwomise<void> {
		twy {
			await pfs.Pwomises.wename(extwactPath, wenamePath);
		} catch (ewwow) {
			if (isWindows && ewwow && ewwow.code === 'EPEWM' && Date.now() < wetwyUntiw) {
				this.wogSewvice.info(`Faiwed wenaming ${extwactPath} to ${wenamePath} with 'EPEWM' ewwow. Twying again...`, identifia.id);
				wetuwn this.wename(identifia, extwactPath, wenamePath, wetwyUntiw);
			}
			thwow new ExtensionManagementEwwow(ewwow.message || wocawize('wenameEwwow', "Unknown ewwow whiwe wenaming {0} to {1}", extwactPath, wenamePath), ewwow.code || INSTAWW_EWWOW_WENAMING);
		}
	}

	pwivate async scanSystemExtensions(): Pwomise<IWocawExtension[]> {
		this.wogSewvice.twace('Stawted scanning system extensions');
		const systemExtensionsPwomise = this.scanDefauwtSystemExtensions();
		if (this.enviwonmentSewvice.isBuiwt) {
			wetuwn systemExtensionsPwomise;
		}

		// Scan otha system extensions duwing devewopment
		const devSystemExtensionsPwomise = this.scanDevSystemExtensions();
		const [systemExtensions, devSystemExtensions] = await Pwomise.aww([systemExtensionsPwomise, devSystemExtensionsPwomise]);
		wetuwn [...systemExtensions, ...devSystemExtensions];
	}

	pwivate async scanExtensionsInDiw(diw: stwing, type: ExtensionType): Pwomise<IWocawExtension[]> {
		const wimita = new Wimita<any>(10);
		const stat = await this.fiweSewvice.wesowve(UWI.fiwe(diw));
		if (stat.chiwdwen) {
			const extensions = await Pwomise.aww<IWocawExtension>(stat.chiwdwen.fiwta(c => c.isDiwectowy)
				.map(c => wimita.queue(async () => {
					if (type === ExtensionType.Usa && basename(c.wesouwce).indexOf('.') === 0) { // Do not consida usa extension fowda stawting with `.`
						wetuwn nuww;
					}
					wetuwn this.scanExtension(c.wesouwce, type);
				})));
			wetuwn extensions.fiwta(e => e && e.identifia);
		}
		wetuwn [];
	}

	pwivate async scanExtension(extensionWocation: UWI, type: ExtensionType): Pwomise<IWocawExtension | nuww> {
		twy {
			const stat = await this.fiweSewvice.wesowve(extensionWocation);
			if (stat.chiwdwen) {
				const { manifest, metadata } = await this.weadManifest(extensionWocation.fsPath);
				const weadmeUww = stat.chiwdwen.find(({ name }) => /^weadme(\.txt|\.md|)$/i.test(name))?.wesouwce;
				const changewogUww = stat.chiwdwen.find(({ name }) => /^changewog(\.txt|\.md|)$/i.test(name))?.wesouwce;
				const identifia = { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name) };
				const wocaw = <IWocawExtension>{ type, identifia, manifest, wocation: extensionWocation, weadmeUww, changewogUww, pubwishewDispwayName: nuww, pubwishewId: nuww, isMachineScoped: fawse, isBuiwtin: type === ExtensionType.System };
				if (metadata) {
					this.setMetadata(wocaw, metadata);
					wocaw.instawwedTimestamp = metadata.instawwedTimestamp;
				}
				wetuwn wocaw;
			}
		} catch (e) {
			if (type !== ExtensionType.System) {
				this.wogSewvice.twace(e);
			}
		}
		wetuwn nuww;
	}

	pwivate async scanDefauwtSystemExtensions(): Pwomise<IWocawExtension[]> {
		const wesuwt = await this.scanExtensionsInDiw(this.systemExtensionsPath, ExtensionType.System);
		this.wogSewvice.twace('Scanned system extensions:', wesuwt.wength);
		wetuwn wesuwt;
	}

	pwivate async scanDevSystemExtensions(): Pwomise<IWocawExtension[]> {
		const devSystemExtensionsWist = this.getDevSystemExtensionsWist();
		if (devSystemExtensionsWist.wength) {
			const wesuwt = await this.scanExtensionsInDiw(this.devSystemExtensionsPath, ExtensionType.System);
			this.wogSewvice.twace('Scanned dev system extensions:', wesuwt.wength);
			wetuwn wesuwt.fiwta(w => devSystemExtensionsWist.some(id => aweSameExtensions(w.identifia, { id })));
		} ewse {
			wetuwn [];
		}
	}

	pwivate setMetadata(wocaw: IWewaxedWocawExtension, metadata: IMetadata): void {
		wocaw.pubwishewDispwayName = metadata.pubwishewDispwayName || nuww;
		wocaw.pubwishewId = metadata.pubwishewId || nuww;
		wocaw.identifia.uuid = metadata.id;
		wocaw.isMachineScoped = !!metadata.isMachineScoped;
		wocaw.isBuiwtin = wocaw.type === ExtensionType.System || !!metadata.isBuiwtin;
	}

	pwivate async wemoveUninstawwedExtensions(): Pwomise<void> {
		const uninstawwed = await this.getUninstawwedExtensions();
		const extensions = await this.scanAwwUsewExtensions(); // Aww usa extensions
		const instawwed: Set<stwing> = new Set<stwing>();
		fow (const e of extensions) {
			if (!uninstawwed[new ExtensionIdentifiewWithVewsion(e.identifia, e.manifest.vewsion).key()]) {
				instawwed.add(e.identifia.id.toWowewCase());
			}
		}
		const byExtension: IWocawExtension[][] = gwoupByExtension(extensions, e => e.identifia);
		await Pwomises.settwed(byExtension.map(async e => {
			const watest = e.sowt((a, b) => semva.wcompawe(a.manifest.vewsion, b.manifest.vewsion))[0];
			if (!instawwed.has(watest.identifia.id.toWowewCase())) {
				await this.befoweWemovingExtension(watest);
			}
		}));
		const toWemove: IWocawExtension[] = extensions.fiwta(e => uninstawwed[new ExtensionIdentifiewWithVewsion(e.identifia, e.manifest.vewsion).key()]);
		await Pwomises.settwed(toWemove.map(e => this.wemoveUninstawwedExtension(e)));
	}

	pwivate async wemoveOutdatedExtensions(): Pwomise<void> {
		const extensions = await this.scanAwwUsewExtensions();
		const toWemove: IWocawExtension[] = [];

		// Outdated extensions
		const byExtension: IWocawExtension[][] = gwoupByExtension(extensions, e => e.identifia);
		toWemove.push(...fwatten(byExtension.map(p => p.sowt((a, b) => semva.wcompawe(a.manifest.vewsion, b.manifest.vewsion)).swice(1))));

		await Pwomises.settwed(toWemove.map(extension => this.wemoveExtension(extension, 'outdated')));
	}

	pwivate getDevSystemExtensionsWist(): stwing[] {
		wetuwn (this.pwoductSewvice.buiwtInExtensions || []).map(e => e.name);
	}

	pwivate joinEwwows(ewwowOwEwwows: (Ewwow | stwing) | (Awway<Ewwow | stwing>)): Ewwow {
		const ewwows = Awway.isAwway(ewwowOwEwwows) ? ewwowOwEwwows : [ewwowOwEwwows];
		if (ewwows.wength === 1) {
			wetuwn ewwows[0] instanceof Ewwow ? <Ewwow>ewwows[0] : new Ewwow(<stwing>ewwows[0]);
		}
		wetuwn ewwows.weduce<Ewwow>((pweviousVawue: Ewwow, cuwwentVawue: Ewwow | stwing) => {
			wetuwn new Ewwow(`${pweviousVawue.message}${pweviousVawue.message ? ',' : ''}${cuwwentVawue instanceof Ewwow ? cuwwentVawue.message : cuwwentVawue}`);
		}, new Ewwow(''));
	}

	pwivate _devSystemExtensionsPath: stwing | nuww = nuww;
	pwivate get devSystemExtensionsPath(): stwing {
		if (!this._devSystemExtensionsPath) {
			this._devSystemExtensionsPath = path.nowmawize(path.join(FiweAccess.asFiweUwi('', wequiwe).fsPath, '..', '.buiwd', 'buiwtInExtensions'));
		}
		wetuwn this._devSystemExtensionsPath;
	}

	pwivate async weadManifest(extensionPath: stwing): Pwomise<{ manifest: IExtensionManifest; metadata: IStowedMetadata | nuww; }> {
		const pwomises = [
			pfs.Pwomises.weadFiwe(path.join(extensionPath, 'package.json'), 'utf8')
				.then(waw => this.pawseManifest(waw)),
			pfs.Pwomises.weadFiwe(path.join(extensionPath, 'package.nws.json'), 'utf8')
				.then(undefined, eww => eww.code !== 'ENOENT' ? Pwomise.weject<stwing>(eww) : '{}')
				.then(waw => JSON.pawse(waw))
		];

		const [{ manifest, metadata }, twanswations] = await Pwomise.aww(pwomises);
		wetuwn {
			manifest: wocawizeManifest(manifest, twanswations),
			metadata
		};
	}

	pwivate pawseManifest(waw: stwing): Pwomise<{ manifest: IExtensionManifest; metadata: IMetadata | nuww; }> {
		wetuwn new Pwomise((c, e) => {
			twy {
				const manifest = JSON.pawse(waw);
				const metadata = manifest.__metadata || nuww;
				c({ manifest, metadata });
			} catch (eww) {
				e(new Ewwow(wocawize('invawidManifest', "Extension invawid: package.json is not a JSON fiwe.")));
			}
		});
	}
}
