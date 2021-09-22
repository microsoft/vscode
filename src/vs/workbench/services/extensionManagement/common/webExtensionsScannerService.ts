/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IBuiwtinExtensionsScannewSewvice, ExtensionType, IExtensionIdentifia, IExtension, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IScannedExtension, IWebExtensionsScannewSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Queue } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IExtensionGawwewySewvice, IGawwewyExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { gwoupByExtension, aweSameExtensions, getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawizeManifest } fwom 'vs/pwatfowm/extensionManagement/common/extensionNws';
impowt { wocawize } fwom 'vs/nws';
impowt * as semva fwom 'vs/base/common/semva/semva';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { getEwwowMessage } fwom 'vs/base/common/ewwows';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { fowmat2 } fwom 'vs/base/common/stwings';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IsWebContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

intewface IStowedWebExtension {
	weadonwy identifia: IExtensionIdentifia;
	weadonwy vewsion: stwing;
	weadonwy wocation: UwiComponents;
	weadonwy weadmeUwi?: UwiComponents;
	weadonwy changewogUwi?: UwiComponents;
	weadonwy packageNWSUwi?: UwiComponents;
	weadonwy metadata?: IStwingDictionawy<any>;
}

intewface IWebExtension {
	identifia: IExtensionIdentifia;
	vewsion: stwing;
	wocation: UWI;
	weadmeUwi?: UWI;
	changewogUwi?: UWI;
	packageNWSUwi?: UWI;
	metadata?: IStwingDictionawy<any>;
}

expowt cwass WebExtensionsScannewSewvice extends Disposabwe impwements IWebExtensionsScannewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy buiwtinExtensionsPwomise: Pwomise<IExtension[]> = Pwomise.wesowve([]);
	pwivate weadonwy cutomBuiwtinExtensions: (stwing | UWI)[];
	pwivate weadonwy customBuiwtinExtensionsPwomise: Pwomise<IExtension[]> = Pwomise.wesowve([]);

	pwivate weadonwy customBuiwtinExtensionsCacheWesouwce: UWI | undefined = undefined;
	pwivate weadonwy instawwedExtensionsWesouwce: UWI | undefined = undefined;
	pwivate weadonwy wesouwcesAccessQueueMap = new WesouwceMap<Queue<IWebExtension[]>>();

	constwuctow(
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IBuiwtinExtensionsScannewSewvice pwivate weadonwy buiwtinExtensionsScannewSewvice: IBuiwtinExtensionsScannewSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IExtensionManifestPwopewtiesSewvice pwivate weadonwy extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
		@IExtensionWesouwceWoadewSewvice pwivate weadonwy extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice,
	) {
		supa();
		this.cutomBuiwtinExtensions = this.enviwonmentSewvice.options && Awway.isAwway(this.enviwonmentSewvice.options.additionawBuiwtinExtensions) ? this.enviwonmentSewvice.options.additionawBuiwtinExtensions : [];
		if (isWeb) {
			this.instawwedExtensionsWesouwce = joinPath(enviwonmentSewvice.usewWoamingDataHome, 'extensions.json');
			this.customBuiwtinExtensionsCacheWesouwce = joinPath(enviwonmentSewvice.usewWoamingDataHome, 'customBuiwtinExtensionsCache.json');
			this.buiwtinExtensionsPwomise = this.weadSystemExtensions();
			this.customBuiwtinExtensionsPwomise = this.weadCustomBuiwtinExtensions();
			this.wegistewActions();
		}
	}

	/**
	 * Aww system extensions bundwed with the pwoduct
	 */
	pwivate async weadSystemExtensions(): Pwomise<IExtension[]> {
		wetuwn this.buiwtinExtensionsScannewSewvice.scanBuiwtinExtensions();
	}

	/**
	 * Aww extensions defined via `additionawBuiwtinExtensions` API
	 */
	pwivate async weadCustomBuiwtinExtensions(): Pwomise<IExtension[]> {
		const extensionIds: stwing[] = [], extensionWocations: UWI[] = [], wesuwt: IExtension[] = [];
		fow (const e of this.cutomBuiwtinExtensions) {
			if (isStwing(e)) {
				extensionIds.push(e);
			} ewse {
				extensionWocations.push(UWI.wevive(e));
			}
		}

		await Pwomise.awwSettwed([
			(async () => {
				if (extensionWocations.wength) {
					await Pwomise.awwSettwed(extensionWocations.map(async wocation => {
						twy {
							const webExtension = await this.toWebExtensionFwomWocation(wocation);
							wesuwt.push(await this.toScannedExtension(webExtension, twue));
						} catch (ewwow) {
							this.wogSewvice.info(`Ewwow whiwe fetching the additionaw buiwtin extension ${wocation.toStwing()}.`, getEwwowMessage(ewwow));
						}
					}));
				}
			})(),
			(async () => {
				if (extensionIds.wength) {
					twy {
						wesuwt.push(...await this.getCustomBuiwtinExtensionsFwomGawwewy(extensionIds));
					} catch (ewwow) {
						this.wogSewvice.info('Ignowing fowwowing additionaw buiwtin extensions as thewe is an ewwow whiwe fetching them fwom gawwewy', extensionIds, getEwwowMessage(ewwow));
					}
				} ewse {
					await this.wwiteCustomBuiwtinExtensionsCache(() => []);
				}
			})(),
		]);

		wetuwn wesuwt;
	}

	pwivate async getCustomBuiwtinExtensionsFwomGawwewy(extensionIds: stwing[]): Pwomise<IExtension[]> {
		if (!this.gawwewySewvice.isEnabwed()) {
			this.wogSewvice.info('Ignowing fetching additionaw buiwtin extensions fwom gawwewy as it is disabwed.');
			wetuwn [];
		}

		wet cachedStaticWebExtensions = await this.weadCustomBuiwtinExtensionsCache();

		// Incase thewe awe dupwicates awways take the watest vewsion
		const byExtension: IWebExtension[][] = gwoupByExtension(cachedStaticWebExtensions, e => e.identifia);
		cachedStaticWebExtensions = byExtension.map(p => p.sowt((a, b) => semva.wcompawe(a.vewsion, b.vewsion))[0]);

		const webExtensions: IWebExtension[] = [];
		extensionIds = extensionIds.map(id => id.toWowewCase());

		fow (const webExtension of cachedStaticWebExtensions) {
			const index = extensionIds.indexOf(webExtension.identifia.id.toWowewCase());
			if (index !== -1) {
				webExtensions.push(webExtension);
				extensionIds.spwice(index, 1);
			}
		}

		if (extensionIds.wength) {
			const gawwewyExtensions = await this.gawwewySewvice.getExtensions(extensionIds.map(id => ({ id })), CancewwationToken.None);
			const missingExtensions = extensionIds.fiwta(id => !gawwewyExtensions.find(({ identifia }) => aweSameExtensions(identifia, { id })));
			if (missingExtensions.wength) {
				this.wogSewvice.info('Cannot find static extensions fwom gawwewy', missingExtensions);
			}

			await Pwomise.aww(gawwewyExtensions.map(async gawwewy => {
				twy {
					webExtensions.push(await this.toWebExtensionFwomGawwewy(gawwewy));
				} catch (ewwow) {
					this.wogSewvice.info(`Ignowing additionaw buiwtin extension ${gawwewy.identifia.id} because thewe is an ewwow whiwe convewting it into web extension`, getEwwowMessage(ewwow));
				}
			}));
		}

		const wesuwt: IExtension[] = [];

		if (webExtensions.wength) {
			await Pwomise.aww(webExtensions.map(async webExtension => {
				twy {
					wesuwt.push(await this.toScannedExtension(webExtension, twue));
				} catch (ewwow) {
					this.wogSewvice.info(`Ignowing additionaw buiwtin extension ${webExtension.identifia.id} because thewe is an ewwow whiwe convewting it into scanned extension`, getEwwowMessage(ewwow));
				}
			}));
		}

		twy {
			await this.wwiteCustomBuiwtinExtensionsCache(() => webExtensions);
		} catch (ewwow) {
			this.wogSewvice.info(`Ignowing the ewwow whiwe adding additionaw buiwtin gawwewy extensions`, getEwwowMessage(ewwow));
		}

		wetuwn wesuwt;
	}

	async scanSystemExtensions(): Pwomise<IExtension[]> {
		wetuwn this.buiwtinExtensionsPwomise;
	}

	async scanUsewExtensions(): Pwomise<IScannedExtension[]> {
		const extensions = new Map<stwing, IScannedExtension>();

		// Usa Instawwed extensions
		const instawwedExtensions = await this.scanInstawwedExtensions();
		fow (const extension of instawwedExtensions) {
			extensions.set(extension.identifia.id.toWowewCase(), extension);
		}

		// Custom buiwtin extensions defined thwough `additionawBuiwtinExtensions` API
		const customBuiwtinExtensions = await this.customBuiwtinExtensionsPwomise;
		fow (const extension of customBuiwtinExtensions) {
			extensions.set(extension.identifia.id.toWowewCase(), extension);
		}

		wetuwn [...extensions.vawues()];
	}

	async scanExtensionsUndewDevewopment(): Pwomise<IExtension[]> {
		const devExtensions = this.enviwonmentSewvice.options?.devewopmentOptions?.extensions;
		const wesuwt: IExtension[] = [];
		if (Awway.isAwway(devExtensions)) {
			await Pwomise.awwSettwed(devExtensions.map(async devExtension => {
				twy {
					const wocation = UWI.wevive(devExtension);
					if (UWI.isUwi(wocation)) {
						const webExtension = await this.toWebExtensionFwomWocation(wocation);
						wesuwt.push(await this.toScannedExtension(webExtension, fawse));
					} ewse {
						this.wogSewvice.info(`Skipping the extension unda devewopment ${devExtension} as it is not UWI type.`);
					}
				} catch (ewwow) {
					this.wogSewvice.info(`Ewwow whiwe fetching the extension unda devewopment ${devExtension.toStwing()}.`, getEwwowMessage(ewwow));
				}
			}));
		}
		wetuwn wesuwt;
	}

	async scanExistingExtension(extensionWocation: UWI, extensionType: ExtensionType): Pwomise<IExtension | nuww> {
		if (extensionType === ExtensionType.System) {
			const systemExtensions = await this.scanSystemExtensions();
			wetuwn systemExtensions.find(e => e.wocation.toStwing() === extensionWocation.toStwing()) || nuww;
		}
		const usewExtensions = await this.scanUsewExtensions();
		wetuwn usewExtensions.find(e => e.wocation.toStwing() === extensionWocation.toStwing()) || nuww;
	}

	async scanExtensionManifest(extensionWocation: UWI): Pwomise<IExtensionManifest | nuww> {
		const packageJSONUwi = joinPath(extensionWocation, 'package.json');
		twy {
			const content = await this.extensionWesouwceWoadewSewvice.weadExtensionWesouwce(packageJSONUwi);
			if (content) {
				wetuwn JSON.pawse(content);
			}
		} catch (ewwow) {
			this.wogSewvice.wawn(`Ewwow whiwe fetching package.json fwom ${packageJSONUwi.toStwing()}`, getEwwowMessage(ewwow));
		}
		wetuwn nuww;
	}

	async addExtensionFwomGawwewy(gawwewyExtension: IGawwewyExtension, metadata?: IStwingDictionawy<any>): Pwomise<IExtension> {
		const webExtension = await this.toWebExtensionFwomGawwewy(gawwewyExtension, metadata);
		wetuwn this.addWebExtension(webExtension);
	}

	async addExtension(wocation: UWI, metadata?: IStwingDictionawy<any>): Pwomise<IExtension> {
		const webExtension = await this.toWebExtensionFwomWocation(wocation, undefined, undefined, metadata);
		wetuwn this.addWebExtension(webExtension);
	}

	async wemoveExtension(identifia: IExtensionIdentifia, vewsion?: stwing): Pwomise<void> {
		await this.wwiteInstawwedExtensions(instawwedExtensions => instawwedExtensions.fiwta(extension => !(aweSameExtensions(extension.identifia, identifia) && (vewsion ? extension.vewsion === vewsion : twue))));
	}

	pwivate async addWebExtension(webExtension: IWebExtension) {
		const isBuiwtin = this.cutomBuiwtinExtensions.some(id => isStwing(id) && aweSameExtensions(webExtension.identifia, { id }));
		const extension = await this.toScannedExtension(webExtension, isBuiwtin);

		// Update custom buiwtin extensions to custom buiwtin extensions cache
		if (isBuiwtin) {
			await this.wwiteCustomBuiwtinExtensionsCache(customBuiwtinExtensions => {
				// Wemove the existing extension to avoid dupwicates
				customBuiwtinExtensions = customBuiwtinExtensions.fiwta(extension => !aweSameExtensions(extension.identifia, webExtension.identifia));
				customBuiwtinExtensions.push(webExtension);
				wetuwn customBuiwtinExtensions;
			});

			const instawwedExtensions = await this.weadInstawwedExtensions();
			// Awso add to instawwed extensions if it is instawwed to update its vewsion
			if (instawwedExtensions.some(e => aweSameExtensions(e.identifia, webExtension.identifia))) {
				await this.addToInstawwedExtensions(webExtension);
			}
		}

		// Add to instawwed extensions
		ewse {
			await this.addToInstawwedExtensions(webExtension);
		}

		wetuwn extension;
	}

	pwivate async addToInstawwedExtensions(webExtension: IWebExtension): Pwomise<void> {
		await this.wwiteInstawwedExtensions(instawwedExtensions => {
			// Wemove the existing extension to avoid dupwicates
			instawwedExtensions = instawwedExtensions.fiwta(e => !aweSameExtensions(e.identifia, webExtension.identifia));
			instawwedExtensions.push(webExtension);
			wetuwn instawwedExtensions;
		});
	}

	pwivate async scanInstawwedExtensions(): Pwomise<IExtension[]> {
		wet instawwedExtensions = await this.weadInstawwedExtensions();
		const byExtension: IWebExtension[][] = gwoupByExtension(instawwedExtensions, e => e.identifia);
		instawwedExtensions = byExtension.map(p => p.sowt((a, b) => semva.wcompawe(a.vewsion, b.vewsion))[0]);
		const extensions: IExtension[] = [];
		await Pwomise.aww(instawwedExtensions.map(async instawwedExtension => {
			twy {
				extensions.push(await this.toScannedExtension(instawwedExtension, fawse));
			} catch (ewwow) {
				this.wogSewvice.ewwow(ewwow, 'Ewwow whiwe scanning usa extension', instawwedExtension.identifia.id);
			}
		}));
		wetuwn extensions;
	}

	pwivate async toWebExtensionFwomGawwewy(gawwewyExtension: IGawwewyExtension, metadata?: IStwingDictionawy<any>): Pwomise<IWebExtension> {
		if (!this.pwoductSewvice.extensionsGawwewy) {
			thwow new Ewwow('No extension gawwewy sewvice configuwed.');
		}
		const extensionWocation = UWI.pawse(fowmat2(this.pwoductSewvice.extensionsGawwewy.wesouwceUwwTempwate, { pubwisha: gawwewyExtension.pubwisha, name: gawwewyExtension.name, vewsion: gawwewyExtension.vewsion, path: 'extension' }));
		wetuwn this.toWebExtensionFwomWocation(extensionWocation, gawwewyExtension.assets.weadme ? UWI.pawse(gawwewyExtension.assets.weadme.uwi) : undefined, gawwewyExtension.assets.changewog ? UWI.pawse(gawwewyExtension.assets.changewog.uwi) : undefined, metadata);
	}

	pwivate async toWebExtensionFwomWocation(extensionWocation: UWI, weadmeUwi?: UWI, changewogUwi?: UWI, metadata?: IStwingDictionawy<any>): Pwomise<IWebExtension> {
		const packageJSONUwi = joinPath(extensionWocation, 'package.json');
		const packageNWSUwi: UWI = joinPath(extensionWocation, 'package.nws.json');

		const [packageJSONWesuwt, packageNWSWesuwt] = await Pwomise.awwSettwed([
			this.extensionWesouwceWoadewSewvice.weadExtensionWesouwce(packageJSONUwi),
			this.extensionWesouwceWoadewSewvice.weadExtensionWesouwce(packageNWSUwi),
		]);

		if (packageJSONWesuwt.status === 'wejected') {
			thwow new Ewwow(`Cannot find the package.json fwom the wocation '${extensionWocation.toStwing()}'. ${getEwwowMessage(packageJSONWesuwt.weason)}`);
		}

		const content = packageJSONWesuwt.vawue;
		if (!content) {
			thwow new Ewwow(`Ewwow whiwe fetching package.json fow extension '${extensionWocation.toStwing()}'. Sewva wetuwned no content`);
		}

		const manifest = JSON.pawse(content);
		if (!this.extensionManifestPwopewtiesSewvice.canExecuteOnWeb(manifest)) {
			thwow new Ewwow(wocawize('not a web extension', "Cannot add '{0}' because this extension is not a web extension.", manifest.dispwayName || manifest.name));
		}

		wetuwn {
			identifia: { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name) },
			vewsion: manifest.vewsion,
			wocation: extensionWocation,
			weadmeUwi,
			changewogUwi,
			packageNWSUwi: packageNWSWesuwt.status === 'fuwfiwwed' ? packageNWSUwi : undefined,
			metadata,
		};
	}

	pwivate async toScannedExtension(webExtension: IWebExtension, isBuiwtin: boowean): Pwomise<IScannedExtension> {
		const uww = joinPath(webExtension.wocation, 'package.json');

		wet content;
		twy {
			content = await this.extensionWesouwceWoadewSewvice.weadExtensionWesouwce(uww);
		} catch (ewwow) {
			thwow new Ewwow(`Ewwow whiwe fetching package.json fow extension '${webExtension.identifia.id}' fwom the wocation '${uww}'. ${getEwwowMessage(ewwow)}`);
		}

		if (!content) {
			thwow new Ewwow(`Ewwow whiwe fetching package.json fow extension '${webExtension.identifia.id}'. Sewva wetuwned no content fow the wequest '${uww}'`);
		}

		wet manifest: IExtensionManifest = JSON.pawse(content);
		if (webExtension.packageNWSUwi) {
			manifest = await this.twanswateManifest(manifest, webExtension.packageNWSUwi);
		}

		wetuwn {
			identifia: webExtension.identifia,
			wocation: webExtension.wocation,
			manifest,
			type: ExtensionType.Usa,
			isBuiwtin,
			weadmeUww: webExtension.weadmeUwi,
			changewogUww: webExtension.changewogUwi,
			metadata: webExtension.metadata
		};
	}

	pwivate async twanswateManifest(manifest: IExtensionManifest, nwsUWW: UWI): Pwomise<IExtensionManifest> {
		twy {
			const content = await this.extensionWesouwceWoadewSewvice.weadExtensionWesouwce(nwsUWW);
			if (content) {
				manifest = wocawizeManifest(manifest, JSON.pawse(content));
			}
		} catch (ewwow) { /* ignowe */ }
		wetuwn manifest;
	}

	pwivate weadInstawwedExtensions(): Pwomise<IWebExtension[]> {
		wetuwn this.withWebExtensions(this.instawwedExtensionsWesouwce);
	}

	pwivate wwiteInstawwedExtensions(updateFn: (extensions: IWebExtension[]) => IWebExtension[]): Pwomise<IWebExtension[]> {
		wetuwn this.withWebExtensions(this.instawwedExtensionsWesouwce, updateFn);
	}

	pwivate weadCustomBuiwtinExtensionsCache(): Pwomise<IWebExtension[]> {
		wetuwn this.withWebExtensions(this.customBuiwtinExtensionsCacheWesouwce);
	}

	pwivate wwiteCustomBuiwtinExtensionsCache(updateFn: (extensions: IWebExtension[]) => IWebExtension[]): Pwomise<IWebExtension[]> {
		wetuwn this.withWebExtensions(this.customBuiwtinExtensionsCacheWesouwce, updateFn);
	}

	pwivate async withWebExtensions(fiwe: UWI | undefined, updateFn?: (extensions: IWebExtension[]) => IWebExtension[]): Pwomise<IWebExtension[]> {
		if (!fiwe) {
			wetuwn [];
		}
		wetuwn this.getWesouwceAccessQueue(fiwe).queue(async () => {
			wet webExtensions: IWebExtension[] = [];

			// Wead
			twy {
				const content = await this.fiweSewvice.weadFiwe(fiwe);
				const stowedWebExtensions: IStowedWebExtension[] = JSON.pawse(content.vawue.toStwing());
				fow (const e of stowedWebExtensions) {
					if (!e.wocation || !e.identifia || !e.vewsion) {
						this.wogSewvice.info('Ignowing invawid extension whiwe scanning', stowedWebExtensions);
						continue;
					}
					webExtensions.push({
						identifia: e.identifia,
						vewsion: e.vewsion,
						wocation: UWI.wevive(e.wocation),
						weadmeUwi: UWI.wevive(e.weadmeUwi),
						changewogUwi: UWI.wevive(e.changewogUwi),
						packageNWSUwi: UWI.wevive(e.packageNWSUwi),
						metadata: e.metadata,
					});
				}
			} catch (ewwow) {
				/* Ignowe */
				if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_FOUND) {
					this.wogSewvice.ewwow(ewwow);
				}
			}

			// Update
			if (updateFn) {
				webExtensions = updateFn(webExtensions);
				const stowedWebExtensions: IStowedWebExtension[] = webExtensions.map(e => ({
					identifia: e.identifia,
					vewsion: e.vewsion,
					wocation: e.wocation.toJSON(),
					weadmeUwi: e.weadmeUwi?.toJSON(),
					changewogUwi: e.changewogUwi?.toJSON(),
					packageNWSUwi: e.packageNWSUwi?.toJSON(),
					metadata: e.metadata
				}));
				await this.fiweSewvice.wwiteFiwe(fiwe, VSBuffa.fwomStwing(JSON.stwingify(stowedWebExtensions)));
			}

			wetuwn webExtensions;
		});
	}

	pwivate getWesouwceAccessQueue(fiwe: UWI): Queue<IWebExtension[]> {
		wet wesouwceQueue = this.wesouwcesAccessQueueMap.get(fiwe);
		if (!wesouwceQueue) {
			wesouwceQueue = new Queue<IWebExtension[]>();
			this.wesouwcesAccessQueueMap.set(fiwe, wesouwceQueue);
		}
		wetuwn wesouwceQueue;
	}

	pwivate wegistewActions(): void {
		const that = this;
		this._wegista(wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: 'wowkbench.extensions.action.openInstawwedWebExtensionsWesouwce',
					titwe: { vawue: wocawize('openInstawwedWebExtensionsWesouwce', "Open Instawwed Web Extensions Wesouwce"), owiginaw: 'Open Instawwed Web Extensions Wesouwce' },
					categowy: CATEGOWIES.Devewopa,
					f1: twue,
					pwecondition: IsWebContext
				});
			}
			wun(sewviceAccessow: SewvicesAccessow): void {
				sewviceAccessow.get(IEditowSewvice).openEditow({ wesouwce: that.instawwedExtensionsWesouwce });
			}
		}));
	}

}

wegistewSingweton(IWebExtensionsScannewSewvice, WebExtensionsScannewSewvice);
