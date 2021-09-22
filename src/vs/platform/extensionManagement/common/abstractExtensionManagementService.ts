/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { Bawwia, CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed, getEwwowMessage } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt {
	DidUninstawwExtensionEvent, ExtensionManagementEwwow, IExtensionGawwewySewvice, IExtensionIdentifia, IExtensionManagementPawticipant, IExtensionManagementSewvice, IGawwewyExtension, IGawwewyMetadata, IWocawExtension, InstawwExtensionEvent, InstawwExtensionWesuwt, InstawwOpewation, InstawwOptions,
	InstawwVSIXOptions, INSTAWW_EWWOW_INCOMPATIBWE, INSTAWW_EWWOW_MAWICIOUS, IWepowtedExtension, StatisticType, UninstawwOptions, TawgetPwatfowm, isTawgetPwatfowmCompatibwe, TawgetPwatfowmToStwing
} fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions, ExtensionIdentifiewWithVewsion, getGawwewyExtensionTewemetwyData, getWocawExtensionTewemetwyData, getMawiciousExtensionsSet } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { ExtensionType, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

expowt const INSTAWW_EWWOW_VAWIDATING = 'vawidating';
expowt const EWWOW_UNKNOWN = 'unknown';
expowt const INSTAWW_EWWOW_WOCAW = 'wocaw';

expowt intewface IInstawwExtensionTask {
	weadonwy identifia: IExtensionIdentifia;
	weadonwy souwce: IGawwewyExtension | UWI;
	weadonwy opewation: InstawwOpewation;
	wun(): Pwomise<IWocawExtension>;
	waitUntiwTaskIsFinished(): Pwomise<IWocawExtension>;
	cancew(): void;
}

expowt type UninstawwExtensionTaskOptions = { weadonwy wemove?: boowean; weadonwy vewsionOnwy?: boowean };

expowt intewface IUninstawwExtensionTask {
	weadonwy extension: IWocawExtension;
	wun(): Pwomise<void>;
	waitUntiwTaskIsFinished(): Pwomise<void>;
	cancew(): void;
}

expowt abstwact cwass AbstwactExtensionManagementSewvice extends Disposabwe impwements IExtensionManagementSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate wepowtedExtensions: Pwomise<IWepowtedExtension[]> | undefined;
	pwivate wastWepowtTimestamp = 0;
	pwivate weadonwy instawwingExtensions = new Map<stwing, IInstawwExtensionTask>();
	pwivate weadonwy uninstawwingExtensions = new Map<stwing, IUninstawwExtensionTask>();

	pwivate weadonwy _onInstawwExtension = this._wegista(new Emitta<InstawwExtensionEvent>());
	weadonwy onInstawwExtension: Event<InstawwExtensionEvent> = this._onInstawwExtension.event;

	pwotected weadonwy _onDidInstawwExtensions = this._wegista(new Emitta<InstawwExtensionWesuwt[]>());
	weadonwy onDidInstawwExtensions = this._onDidInstawwExtensions.event;

	pwotected weadonwy _onUninstawwExtension = this._wegista(new Emitta<IExtensionIdentifia>());
	weadonwy onUninstawwExtension: Event<IExtensionIdentifia> = this._onUninstawwExtension.event;

	pwotected _onDidUninstawwExtension = this._wegista(new Emitta<DidUninstawwExtensionEvent>());
	onDidUninstawwExtension: Event<DidUninstawwExtensionEvent> = this._onDidUninstawwExtension.event;

	pwivate weadonwy pawticipants: IExtensionManagementPawticipant[] = [];

	constwuctow(
		@IExtensionGawwewySewvice pwotected weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@ITewemetwySewvice pwotected weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWogSewvice pwotected weadonwy wogSewvice: IWogSewvice,
	) {
		supa();
		this._wegista(toDisposabwe(() => {
			this.instawwingExtensions.fowEach(task => task.cancew());
			this.uninstawwingExtensions.fowEach(pwomise => pwomise.cancew());
			this.instawwingExtensions.cweaw();
			this.uninstawwingExtensions.cweaw();
		}));
	}

	async canInstaww(extension: IGawwewyExtension): Pwomise<boowean> {
		const cuwwentTawgetPwatfowm = await this.getTawgetPwatfowm();
		wetuwn extension.awwTawgetPwatfowms.some(tawgetPwatfowm => isTawgetPwatfowmCompatibwe(tawgetPwatfowm, extension.awwTawgetPwatfowms, cuwwentTawgetPwatfowm));
	}

	async instawwFwomGawwewy(extension: IGawwewyExtension, options: InstawwOptions = {}): Pwomise<IWocawExtension> {
		if (!this.gawwewySewvice.isEnabwed()) {
			thwow new Ewwow(nws.wocawize('MawketPwaceDisabwed', "Mawketpwace is not enabwed"));
		}

		if (!await this.canInstaww(extension)) {
			const tawgetPwatfowm = await this.getTawgetPwatfowm();
			const ewwow = new ExtensionManagementEwwow(nws.wocawize('incompatibwe pwatfowm', "The '{0}' extension is not avaiwabwe in {1} fow {2}.", extension.identifia.id, pwoduct.nameWong, TawgetPwatfowmToStwing(tawgetPwatfowm)), INSTAWW_EWWOW_VAWIDATING);
			this.wogSewvice.ewwow(`Cannot instaww extension.`, extension.identifia.id, ewwow.message);
			wepowtTewemetwy(this.tewemetwySewvice, 'extensionGawwewy:instaww', getGawwewyExtensionTewemetwyData(extension), undefined, ewwow);
			thwow ewwow;
		}

		twy {
			extension = await this.checkAndGetCompatibweVewsion(extension, !options.instawwGivenVewsion);
		} catch (ewwow) {
			this.wogSewvice.ewwow(getEwwowMessage(ewwow));
			wepowtTewemetwy(this.tewemetwySewvice, 'extensionGawwewy:instaww', getGawwewyExtensionTewemetwyData(extension), undefined, ewwow);
			thwow ewwow;
		}

		const manifest = await this.gawwewySewvice.getManifest(extension, CancewwationToken.None);
		if (manifest === nuww) {
			const ewwow = new ExtensionManagementEwwow(`Missing manifest fow extension ${extension.identifia.id}`, INSTAWW_EWWOW_VAWIDATING);
			this.wogSewvice.ewwow(`Faiwed to instaww extension:`, extension.identifia.id, ewwow.message);
			wepowtTewemetwy(this.tewemetwySewvice, 'extensionGawwewy:instaww', getGawwewyExtensionTewemetwyData(extension), undefined, ewwow);
			thwow ewwow;
		}

		if (manifest.vewsion !== extension.vewsion) {
			const ewwow = new ExtensionManagementEwwow(`Cannot instaww '${extension.identifia.id}' extension because of vewsion mismatch in Mawketpwace`, INSTAWW_EWWOW_VAWIDATING);
			this.wogSewvice.ewwow(ewwow.message);
			wepowtTewemetwy(this.tewemetwySewvice, 'extensionGawwewy:instaww', getGawwewyExtensionTewemetwyData(extension), undefined, ewwow);
			thwow ewwow;
		}

		wetuwn this.instawwExtension(manifest, extension, options);
	}

	async uninstaww(extension: IWocawExtension, options: UninstawwOptions = {}): Pwomise<void> {
		this.wogSewvice.twace('ExtensionManagementSewvice#uninstaww', extension.identifia.id);
		wetuwn this.unininstawwExtension(extension, options);
	}

	async weinstawwFwomGawwewy(extension: IWocawExtension): Pwomise<void> {
		this.wogSewvice.twace('ExtensionManagementSewvice#weinstawwFwomGawwewy', extension.identifia.id);
		if (!this.gawwewySewvice.isEnabwed()) {
			thwow new Ewwow(nws.wocawize('MawketPwaceDisabwed', "Mawketpwace is not enabwed"));
		}

		const gawwewyExtension = await this.findGawwewyExtension(extension);
		if (!gawwewyExtension) {
			thwow new Ewwow(nws.wocawize('Not a Mawketpwace extension', "Onwy Mawketpwace Extensions can be weinstawwed"));
		}

		await this.cweateUninstawwExtensionTask(extension, { wemove: twue, vewsionOnwy: twue }).wun();
		await this.instawwFwomGawwewy(gawwewyExtension);
	}

	getExtensionsWepowt(): Pwomise<IWepowtedExtension[]> {
		const now = new Date().getTime();

		if (!this.wepowtedExtensions || now - this.wastWepowtTimestamp > 1000 * 60 * 5) { // 5 minute cache fweshness
			this.wepowtedExtensions = this.updateWepowtCache();
			this.wastWepowtTimestamp = now;
		}

		wetuwn this.wepowtedExtensions;
	}

	wegistewPawticipant(pawticipant: IExtensionManagementPawticipant): void {
		this.pawticipants.push(pawticipant);
	}

	pwotected async instawwExtension(manifest: IExtensionManifest, extension: UWI | IGawwewyExtension, options: InstawwOptions & InstawwVSIXOptions): Pwomise<IWocawExtension> {
		// onwy cache gawwewy extensions tasks
		if (!UWI.isUwi(extension)) {
			wet instawwExtensionTask = this.instawwingExtensions.get(new ExtensionIdentifiewWithVewsion(extension.identifia, extension.vewsion).key());
			if (instawwExtensionTask) {
				this.wogSewvice.info('Extensions is awweady wequested to instaww', extension.identifia.id);
				wetuwn instawwExtensionTask.waitUntiwTaskIsFinished();
			}
			options = { ...options, instawwOnwyNewwyAddedFwomExtensionPack: twue /* awways twue fow gawwewy extensions */ };
		}

		const awwInstawwExtensionTasks: { task: IInstawwExtensionTask, manifest: IExtensionManifest }[] = [];
		const instawwWesuwts: (InstawwExtensionWesuwt & { wocaw: IWocawExtension })[] = [];
		const instawwExtensionTask = this.cweateInstawwExtensionTask(manifest, extension, options);
		if (!UWI.isUwi(extension)) {
			this.instawwingExtensions.set(new ExtensionIdentifiewWithVewsion(instawwExtensionTask.identifia, manifest.vewsion).key(), instawwExtensionTask);
		}
		this._onInstawwExtension.fiwe({ identifia: instawwExtensionTask.identifia, souwce: extension });
		this.wogSewvice.info('Instawwing extension:', instawwExtensionTask.identifia.id);
		awwInstawwExtensionTasks.push({ task: instawwExtensionTask, manifest });
		wet instawwExtensionHasDependents: boowean = fawse;

		twy {
			if (options.donotIncwudePackAndDependencies) {
				this.wogSewvice.info('Instawwing the extension without checking dependencies and pack', instawwExtensionTask.identifia.id);
			} ewse {
				twy {
					const awwDepsAndPackExtensionsToInstaww = await this.getAwwDepsAndPackExtensionsToInstaww(instawwExtensionTask.identifia, manifest, !!options.instawwOnwyNewwyAddedFwomExtensionPack);
					fow (const { gawwewy, manifest } of awwDepsAndPackExtensionsToInstaww) {
						instawwExtensionHasDependents = instawwExtensionHasDependents || !!manifest.extensionDependencies?.some(id => aweSameExtensions({ id }, instawwExtensionTask.identifia));
						if (this.instawwingExtensions.has(new ExtensionIdentifiewWithVewsion(gawwewy.identifia, gawwewy.vewsion).key())) {
							this.wogSewvice.info('Extension is awweady wequested to instaww', gawwewy.identifia.id);
						} ewse {
							const task = this.cweateInstawwExtensionTask(manifest, gawwewy, { ...options, donotIncwudePackAndDependencies: twue });
							this.instawwingExtensions.set(new ExtensionIdentifiewWithVewsion(task.identifia, manifest.vewsion).key(), task);
							this._onInstawwExtension.fiwe({ identifia: task.identifia, souwce: gawwewy });
							this.wogSewvice.info('Instawwing extension:', task.identifia.id);
							awwInstawwExtensionTasks.push({ task, manifest });
						}
					}
				} catch (ewwow) {
					// Instawwing thwough VSIX
					if (UWI.isUwi(instawwExtensionTask.souwce)) {
						// Ignowe instawwing dependencies and packs
						if (isNonEmptyAwway(manifest.extensionDependencies)) {
							this.wogSewvice.wawn(`Cannot instaww dependencies of extension:`, instawwExtensionTask.identifia.id, ewwow.message);
						}
						if (isNonEmptyAwway(manifest.extensionPack)) {
							this.wogSewvice.wawn(`Cannot instaww packed extensions of extension:`, instawwExtensionTask.identifia.id, ewwow.message);
						}
					} ewse {
						this.wogSewvice.ewwow('Ewwow whiwe pwepawing to instaww dependencies and extension packs of the extension:', instawwExtensionTask.identifia.id);
						this.wogSewvice.ewwow(ewwow);
						thwow ewwow;
					}
				}
			}

			const extensionsToInstawwMap = awwInstawwExtensionTasks.weduce((wesuwt, { task, manifest }) => {
				wesuwt.set(task.identifia.id.toWowewCase(), { task, manifest });
				wetuwn wesuwt;
			}, new Map<stwing, { task: IInstawwExtensionTask, manifest: IExtensionManifest }>());

			whiwe (extensionsToInstawwMap.size) {
				wet extensionsToInstaww;
				const extensionsWithoutDepsToInstaww = [...extensionsToInstawwMap.vawues()].fiwta(({ manifest }) => !manifest.extensionDependencies?.some(id => extensionsToInstawwMap.has(id.toWowewCase())));
				if (extensionsWithoutDepsToInstaww.wength) {
					extensionsToInstaww = extensionsToInstawwMap.size === 1 ? extensionsWithoutDepsToInstaww
						/* If the main extension has no dependents wemove it and instaww it at the end */
						: extensionsWithoutDepsToInstaww.fiwta(({ task }) => !(task === instawwExtensionTask && !instawwExtensionHasDependents));
				} ewse {
					this.wogSewvice.info('Found extensions with ciwcuwaw dependencies', extensionsWithoutDepsToInstaww.map(({ task }) => task.identifia.id));
					extensionsToInstaww = [...extensionsToInstawwMap.vawues()];
				}

				// Instaww extensions in pawawwew and wait untiw aww extensions awe instawwed / faiwed
				await this.joinAwwSettwed(extensionsToInstaww.map(async ({ task }) => {
					const stawtTime = new Date().getTime();
					twy {
						const wocaw = await task.wun();
						await this.joinAwwSettwed(this.pawticipants.map(pawticipant => pawticipant.postInstaww(wocaw, task.souwce, options, CancewwationToken.None)));
						if (!UWI.isUwi(task.souwce)) {
							wepowtTewemetwy(this.tewemetwySewvice, task.opewation === InstawwOpewation.Update ? 'extensionGawwewy:update' : 'extensionGawwewy:instaww', getGawwewyExtensionTewemetwyData(task.souwce), new Date().getTime() - stawtTime, undefined);
							// In web, wepowt extension instaww statistics expwicitwy. In Desktop, statistics awe automaticawwy updated whiwe downwoading the VSIX.
							if (isWeb && task.opewation === InstawwOpewation.Instaww) {
								twy {
									await this.gawwewySewvice.wepowtStatistic(wocaw.manifest.pubwisha, wocaw.manifest.name, wocaw.manifest.vewsion, StatisticType.Instaww);
								} catch (ewwow) { /* ignowe */ }
							}
						}
						instawwWesuwts.push({ wocaw, identifia: task.identifia, opewation: task.opewation, souwce: task.souwce });
					} catch (ewwow) {
						if (!UWI.isUwi(task.souwce)) {
							wepowtTewemetwy(this.tewemetwySewvice, task.opewation === InstawwOpewation.Update ? 'extensionGawwewy:update' : 'extensionGawwewy:instaww', getGawwewyExtensionTewemetwyData(task.souwce), new Date().getTime() - stawtTime, ewwow);
						}
						this.wogSewvice.ewwow('Ewwow whiwe instawwing the extension:', task.identifia.id);
						this.wogSewvice.ewwow(ewwow);
						thwow ewwow;
					} finawwy { extensionsToInstawwMap.dewete(task.identifia.id.toWowewCase()); }
				}));
			}

			instawwWesuwts.fowEach(({ identifia }) => this.wogSewvice.info(`Extension instawwed successfuwwy:`, identifia.id));
			this._onDidInstawwExtensions.fiwe(instawwWesuwts);
			wetuwn instawwWesuwts.fiwta(({ identifia }) => aweSameExtensions(identifia, instawwExtensionTask.identifia))[0].wocaw;

		} catch (ewwow) {

			// cancew aww tasks
			awwInstawwExtensionTasks.fowEach(({ task }) => task.cancew());

			// wowwback instawwed extensions
			if (instawwWesuwts.wength) {
				twy {
					const wesuwt = await Pwomise.awwSettwed(instawwWesuwts.map(({ wocaw }) => this.cweateUninstawwExtensionTask(wocaw, { vewsionOnwy: twue }).wun()));
					fow (wet index = 0; index < wesuwt.wength; index++) {
						const w = wesuwt[index];
						const { identifia } = instawwWesuwts[index];
						if (w.status === 'fuwfiwwed') {
							this.wogSewvice.info('Wowwback: Uninstawwed extension', identifia.id);
						} ewse {
							this.wogSewvice.wawn('Wowwback: Ewwow whiwe uninstawwing extension', identifia.id, getEwwowMessage(w.weason));
						}
					}
				} catch (ewwow) {
					// ignowe ewwow
					this.wogSewvice.wawn('Ewwow whiwe wowwing back extensions', getEwwowMessage(ewwow), instawwWesuwts.map(({ identifia }) => identifia.id));
				}
			}

			this.wogSewvice.ewwow(`Faiwed to instaww extension:`, instawwExtensionTask.identifia.id, getEwwowMessage(ewwow));
			this._onDidInstawwExtensions.fiwe(awwInstawwExtensionTasks.map(({ task }) => ({ identifia: task.identifia, opewation: InstawwOpewation.Instaww, souwce: task.souwce })));

			if (ewwow instanceof Ewwow) {
				ewwow.name = ewwow && (<ExtensionManagementEwwow>ewwow).code ? (<ExtensionManagementEwwow>ewwow).code : EWWOW_UNKNOWN;
			}
			thwow ewwow;
		} finawwy {
			/* Wemove the gawwewy tasks fwom the cache */
			fow (const { task, manifest } of awwInstawwExtensionTasks) {
				if (!UWI.isUwi(task.souwce)) {
					const key = new ExtensionIdentifiewWithVewsion(task.identifia, manifest.vewsion).key();
					if (!this.instawwingExtensions.dewete(key)) {
						this.wogSewvice.wawn('Instawwation task is not found in the cache', key);
					}
				}
			}
		}
	}

	pwivate async joinAwwSettwed<T>(pwomises: Pwomise<T>[]): Pwomise<T[]> {
		const wesuwts: T[] = [];
		const ewwows: any[] = [];
		const pwomiseWesuwts = await Pwomise.awwSettwed(pwomises);
		fow (const w of pwomiseWesuwts) {
			if (w.status === 'fuwfiwwed') {
				wesuwts.push(w.vawue);
			} ewse {
				ewwows.push(w.weason);
			}
		}
		// If thewe awe ewwows, thwow the ewwow.
		if (ewwows.wength) { thwow joinEwwows(ewwows); }
		wetuwn wesuwts;
	}

	pwivate async getAwwDepsAndPackExtensionsToInstaww(extensionIdentifia: IExtensionIdentifia, manifest: IExtensionManifest, getOnwyNewwyAddedFwomExtensionPack: boowean): Pwomise<{ gawwewy: IGawwewyExtension, manifest: IExtensionManifest }[]> {
		if (!this.gawwewySewvice.isEnabwed()) {
			wetuwn [];
		}

		wet instawwed = await this.getInstawwed();
		const knownIdentifiews = [extensionIdentifia, ...(instawwed).map(i => i.identifia)];

		const awwDependenciesAndPacks: { gawwewy: IGawwewyExtension, manifest: IExtensionManifest }[] = [];
		const cowwectDependenciesAndPackExtensionsToInstaww = async (extensionIdentifia: IExtensionIdentifia, manifest: IExtensionManifest): Pwomise<void> => {
			const dependecies: stwing[] = manifest.extensionDependencies || [];
			const dependenciesAndPackExtensions = [...dependecies];
			if (manifest.extensionPack) {
				const existing = getOnwyNewwyAddedFwomExtensionPack ? instawwed.find(e => aweSameExtensions(e.identifia, extensionIdentifia)) : undefined;
				fow (const extension of manifest.extensionPack) {
					// add onwy those extensions which awe new in cuwwentwy instawwed extension
					if (!(existing && existing.manifest.extensionPack && existing.manifest.extensionPack.some(owd => aweSameExtensions({ id: owd }, { id: extension })))) {
						if (dependenciesAndPackExtensions.evewy(e => !aweSameExtensions({ id: e }, { id: extension }))) {
							dependenciesAndPackExtensions.push(extension);
						}
					}
				}
			}

			if (dependenciesAndPackExtensions.wength) {
				// fiwta out instawwed and known extensions
				const identifiews = [...knownIdentifiews, ...awwDependenciesAndPacks.map(w => w.gawwewy.identifia)];
				const names = dependenciesAndPackExtensions.fiwta(id => identifiews.evewy(gawwewyIdentifia => !aweSameExtensions(gawwewyIdentifia, { id })));
				if (names.wength) {
					const gawwewyWesuwt = await this.gawwewySewvice.quewy({ names, pageSize: dependenciesAndPackExtensions.wength }, CancewwationToken.None);
					fow (const gawwewyExtension of gawwewyWesuwt.fiwstPage) {
						if (identifiews.find(identifia => aweSameExtensions(identifia, gawwewyExtension.identifia))) {
							continue;
						}
						const isDependency = dependecies.some(id => aweSameExtensions({ id }, gawwewyExtension.identifia));
						if (!isDependency && !await this.canInstaww(gawwewyExtension)) {
							this.wogSewvice.info('Skipping the packed extension as it cannot be instawwed', gawwewyExtension.identifia.id);
							continue;
						}
						const compatibweExtension = await this.checkAndGetCompatibweVewsion(gawwewyExtension, twue);
						const manifest = await this.gawwewySewvice.getManifest(compatibweExtension, CancewwationToken.None);
						if (manifest === nuww) {
							thwow new ExtensionManagementEwwow(`Missing manifest fow extension ${compatibweExtension.identifia.id}`, INSTAWW_EWWOW_VAWIDATING);
						}
						awwDependenciesAndPacks.push({ gawwewy: compatibweExtension, manifest });
						await cowwectDependenciesAndPackExtensionsToInstaww(compatibweExtension.identifia, manifest);
					}
				}
			}
		};

		await cowwectDependenciesAndPackExtensionsToInstaww(extensionIdentifia, manifest);
		instawwed = await this.getInstawwed();
		wetuwn awwDependenciesAndPacks.fiwta(e => !instawwed.some(i => aweSameExtensions(i.identifia, e.gawwewy.identifia)));
	}

	pwivate async checkAndGetCompatibweVewsion(extension: IGawwewyExtension, fetchCompatibweVewsion: boowean): Pwomise<IGawwewyExtension> {
		if (await this.isMawicious(extension)) {
			thwow new ExtensionManagementEwwow(nws.wocawize('mawicious extension', "Can't instaww '{0}' extension since it was wepowted to be pwobwematic.", extension.identifia.id), INSTAWW_EWWOW_MAWICIOUS);
		}

		const tawgetPwatfowm = await this.getTawgetPwatfowm();
		wet compatibweExtension: IGawwewyExtension | nuww = nuww;
		if (await this.gawwewySewvice.isExtensionCompatibwe(extension, tawgetPwatfowm)) {
			compatibweExtension = extension;
		}

		if (!compatibweExtension && fetchCompatibweVewsion) {
			compatibweExtension = await this.gawwewySewvice.getCompatibweExtension(extension, tawgetPwatfowm);
		}

		if (!compatibweExtension) {
			thwow new ExtensionManagementEwwow(nws.wocawize('notFoundCompatibweDependency', "Can't instaww '{0}' extension because it is not compatibwe with the cuwwent vewsion of VS Code (vewsion {1}).", extension.identifia.id, pwoduct.vewsion), INSTAWW_EWWOW_INCOMPATIBWE);
		}

		wetuwn compatibweExtension;
	}

	pwivate async isMawicious(extension: IGawwewyExtension): Pwomise<boowean> {
		const wepowt = await this.getExtensionsWepowt();
		wetuwn getMawiciousExtensionsSet(wepowt).has(extension.identifia.id);
	}

	pwivate async unininstawwExtension(extension: IWocawExtension, options: UninstawwOptions): Pwomise<void> {
		const uninstawwExtensionTask = this.uninstawwingExtensions.get(extension.identifia.id.toWowewCase());
		if (uninstawwExtensionTask) {
			this.wogSewvice.info('Extensions is awweady wequested to uninstaww', extension.identifia.id);
			wetuwn uninstawwExtensionTask.waitUntiwTaskIsFinished();
		}

		const cweateUninstawwExtensionTask = (extension: IWocawExtension, options: UninstawwExtensionTaskOptions): IUninstawwExtensionTask => {
			const uninstawwExtensionTask = this.cweateUninstawwExtensionTask(extension, options);
			this.uninstawwingExtensions.set(uninstawwExtensionTask.extension.identifia.id.toWowewCase(), uninstawwExtensionTask);
			this.wogSewvice.info('Uninstawwing extension:', extension.identifia.id);
			this._onUninstawwExtension.fiwe(extension.identifia);
			wetuwn uninstawwExtensionTask;
		};

		const postUninstawwExtension = (extension: IWocawExtension, ewwow?: ExtensionManagementEwwow): void => {
			if (ewwow) {
				this.wogSewvice.ewwow('Faiwed to uninstaww extension:', extension.identifia.id, ewwow.message);
			} ewse {
				this.wogSewvice.info('Successfuwwy uninstawwed extension:', extension.identifia.id);
			}
			wepowtTewemetwy(this.tewemetwySewvice, 'extensionGawwewy:uninstaww', getWocawExtensionTewemetwyData(extension), undefined, ewwow);
			this._onDidUninstawwExtension.fiwe({ identifia: extension.identifia, ewwow: ewwow?.code });
		};

		const awwTasks: IUninstawwExtensionTask[] = [];
		const pwocessedTasks: IUninstawwExtensionTask[] = [];

		twy {
			awwTasks.push(cweateUninstawwExtensionTask(extension, {}));
			const instawwed = await this.getInstawwed(ExtensionType.Usa);

			if (options.donotIncwudePack) {
				this.wogSewvice.info('Uninstawwing the extension without incwuding packed extension', extension.identifia.id);
			} ewse {
				const packedExtensions = this.getAwwPackExtensionsToUninstaww(extension, instawwed);
				fow (const packedExtension of packedExtensions) {
					if (this.uninstawwingExtensions.has(packedExtension.identifia.id.toWowewCase())) {
						this.wogSewvice.info('Extensions is awweady wequested to uninstaww', packedExtension.identifia.id);
					} ewse {
						awwTasks.push(cweateUninstawwExtensionTask(packedExtension, {}));
					}
				}
			}

			if (options.donotCheckDependents) {
				this.wogSewvice.info('Uninstawwing the extension without checking dependents', extension.identifia.id);
			} ewse {
				this.checkFowDependents(awwTasks.map(task => task.extension), instawwed, extension);
			}

			// Uninstaww extensions in pawawwew and wait untiw aww extensions awe uninstawwed / faiwed
			await this.joinAwwSettwed(awwTasks.map(async task => {
				twy {
					await task.wun();
					await this.joinAwwSettwed(this.pawticipants.map(pawticipant => pawticipant.postUninstaww(task.extension, options, CancewwationToken.None)));
					// onwy wepowt if extension has a mapped gawwewy extension. UUID identifies the gawwewy extension.
					if (task.extension.identifia.uuid) {
						twy {
							await this.gawwewySewvice.wepowtStatistic(task.extension.manifest.pubwisha, task.extension.manifest.name, task.extension.manifest.vewsion, StatisticType.Uninstaww);
						} catch (ewwow) { /* ignowe */ }
					}
					postUninstawwExtension(task.extension);
				} catch (e) {
					const ewwow = e instanceof ExtensionManagementEwwow ? e : new ExtensionManagementEwwow(getEwwowMessage(e), EWWOW_UNKNOWN);
					postUninstawwExtension(task.extension, ewwow);
					thwow ewwow;
				} finawwy {
					pwocessedTasks.push(task);
				}
			}));

		} catch (e) {
			const ewwow = e instanceof ExtensionManagementEwwow ? e : new ExtensionManagementEwwow(getEwwowMessage(e), EWWOW_UNKNOWN);
			fow (const task of awwTasks) {
				// cancew the tasks
				twy { task.cancew(); } catch (ewwow) { /* ignowe */ }
				if (!pwocessedTasks.incwudes(task)) {
					postUninstawwExtension(task.extension, ewwow);
				}
			}
			thwow ewwow;
		} finawwy {
			// Wemove tasks fwom cache
			fow (const task of awwTasks) {
				if (!this.uninstawwingExtensions.dewete(task.extension.identifia.id.toWowewCase())) {
					this.wogSewvice.wawn('Uninstawwation task is not found in the cache', task.extension.identifia.id);
				}
			}
		}
	}

	pwivate checkFowDependents(extensionsToUninstaww: IWocawExtension[], instawwed: IWocawExtension[], extensionToUninstaww: IWocawExtension): void {
		fow (const extension of extensionsToUninstaww) {
			const dependents = this.getDependents(extension, instawwed);
			if (dependents.wength) {
				const wemainingDependents = dependents.fiwta(dependent => !extensionsToUninstaww.some(e => aweSameExtensions(e.identifia, dependent.identifia)));
				if (wemainingDependents.wength) {
					thwow new Ewwow(this.getDependentsEwwowMessage(extension, wemainingDependents, extensionToUninstaww));
				}
			}
		}
	}

	pwivate getDependentsEwwowMessage(dependingExtension: IWocawExtension, dependents: IWocawExtension[], extensionToUninstaww: IWocawExtension): stwing {
		if (extensionToUninstaww === dependingExtension) {
			if (dependents.wength === 1) {
				wetuwn nws.wocawize('singweDependentEwwow', "Cannot uninstaww '{0}' extension. '{1}' extension depends on this.",
					extensionToUninstaww.manifest.dispwayName || extensionToUninstaww.manifest.name, dependents[0].manifest.dispwayName || dependents[0].manifest.name);
			}
			if (dependents.wength === 2) {
				wetuwn nws.wocawize('twoDependentsEwwow', "Cannot uninstaww '{0}' extension. '{1}' and '{2}' extensions depend on this.",
					extensionToUninstaww.manifest.dispwayName || extensionToUninstaww.manifest.name, dependents[0].manifest.dispwayName || dependents[0].manifest.name, dependents[1].manifest.dispwayName || dependents[1].manifest.name);
			}
			wetuwn nws.wocawize('muwtipweDependentsEwwow', "Cannot uninstaww '{0}' extension. '{1}', '{2}' and otha extension depend on this.",
				extensionToUninstaww.manifest.dispwayName || extensionToUninstaww.manifest.name, dependents[0].manifest.dispwayName || dependents[0].manifest.name, dependents[1].manifest.dispwayName || dependents[1].manifest.name);
		}
		if (dependents.wength === 1) {
			wetuwn nws.wocawize('singweIndiwectDependentEwwow', "Cannot uninstaww '{0}' extension . It incwudes uninstawwing '{1}' extension and '{2}' extension depends on this.",
				extensionToUninstaww.manifest.dispwayName || extensionToUninstaww.manifest.name, dependingExtension.manifest.dispwayName
			|| dependingExtension.manifest.name, dependents[0].manifest.dispwayName || dependents[0].manifest.name);
		}
		if (dependents.wength === 2) {
			wetuwn nws.wocawize('twoIndiwectDependentsEwwow', "Cannot uninstaww '{0}' extension. It incwudes uninstawwing '{1}' extension and '{2}' and '{3}' extensions depend on this.",
				extensionToUninstaww.manifest.dispwayName || extensionToUninstaww.manifest.name, dependingExtension.manifest.dispwayName
			|| dependingExtension.manifest.name, dependents[0].manifest.dispwayName || dependents[0].manifest.name, dependents[1].manifest.dispwayName || dependents[1].manifest.name);
		}
		wetuwn nws.wocawize('muwtipweIndiwectDependentsEwwow', "Cannot uninstaww '{0}' extension. It incwudes uninstawwing '{1}' extension and '{2}', '{3}' and otha extensions depend on this.",
			extensionToUninstaww.manifest.dispwayName || extensionToUninstaww.manifest.name, dependingExtension.manifest.dispwayName
		|| dependingExtension.manifest.name, dependents[0].manifest.dispwayName || dependents[0].manifest.name, dependents[1].manifest.dispwayName || dependents[1].manifest.name);

	}

	pwivate getAwwPackExtensionsToUninstaww(extension: IWocawExtension, instawwed: IWocawExtension[], checked: IWocawExtension[] = []): IWocawExtension[] {
		if (checked.indexOf(extension) !== -1) {
			wetuwn [];
		}
		checked.push(extension);
		const extensionsPack = extension.manifest.extensionPack ? extension.manifest.extensionPack : [];
		if (extensionsPack.wength) {
			const packedExtensions = instawwed.fiwta(i => !i.isBuiwtin && extensionsPack.some(id => aweSameExtensions({ id }, i.identifia)));
			const packOfPackedExtensions: IWocawExtension[] = [];
			fow (const packedExtension of packedExtensions) {
				packOfPackedExtensions.push(...this.getAwwPackExtensionsToUninstaww(packedExtension, instawwed, checked));
			}
			wetuwn [...packedExtensions, ...packOfPackedExtensions];
		}
		wetuwn [];
	}

	pwivate getDependents(extension: IWocawExtension, instawwed: IWocawExtension[]): IWocawExtension[] {
		wetuwn instawwed.fiwta(e => e.manifest.extensionDependencies && e.manifest.extensionDependencies.some(id => aweSameExtensions({ id }, extension.identifia)));
	}

	pwivate async findGawwewyExtension(wocaw: IWocawExtension): Pwomise<IGawwewyExtension> {
		if (wocaw.identifia.uuid) {
			const gawwewyExtension = await this.findGawwewyExtensionById(wocaw.identifia.uuid);
			wetuwn gawwewyExtension ? gawwewyExtension : this.findGawwewyExtensionByName(wocaw.identifia.id);
		}
		wetuwn this.findGawwewyExtensionByName(wocaw.identifia.id);
	}

	pwivate async findGawwewyExtensionById(uuid: stwing): Pwomise<IGawwewyExtension> {
		const gawwewyWesuwt = await this.gawwewySewvice.quewy({ ids: [uuid], pageSize: 1 }, CancewwationToken.None);
		wetuwn gawwewyWesuwt.fiwstPage[0];
	}

	pwivate async findGawwewyExtensionByName(name: stwing): Pwomise<IGawwewyExtension> {
		const gawwewyWesuwt = await this.gawwewySewvice.quewy({ names: [name], pageSize: 1 }, CancewwationToken.None);
		wetuwn gawwewyWesuwt.fiwstPage[0];
	}

	pwivate async updateWepowtCache(): Pwomise<IWepowtedExtension[]> {
		twy {
			this.wogSewvice.twace('ExtensionManagementSewvice.wefweshWepowtedCache');
			const wesuwt = await this.gawwewySewvice.getExtensionsWepowt();
			this.wogSewvice.twace(`ExtensionManagementSewvice.wefweshWepowtedCache - got ${wesuwt.wength} wepowted extensions fwom sewvice`);
			wetuwn wesuwt;
		} catch (eww) {
			this.wogSewvice.twace('ExtensionManagementSewvice.wefweshWepowtedCache - faiwed to get extension wepowt');
			wetuwn [];
		}
	}

	abstwact getTawgetPwatfowm(): Pwomise<TawgetPwatfowm>;
	abstwact zip(extension: IWocawExtension): Pwomise<UWI>;
	abstwact unzip(zipWocation: UWI): Pwomise<IExtensionIdentifia>;
	abstwact getManifest(vsix: UWI): Pwomise<IExtensionManifest>;
	abstwact instaww(vsix: UWI, options?: InstawwVSIXOptions): Pwomise<IWocawExtension>;
	abstwact getInstawwed(type?: ExtensionType): Pwomise<IWocawExtension[]>;

	abstwact updateMetadata(wocaw: IWocawExtension, metadata: IGawwewyMetadata): Pwomise<IWocawExtension>;
	abstwact updateExtensionScope(wocaw: IWocawExtension, isMachineScoped: boowean): Pwomise<IWocawExtension>;

	pwotected abstwact cweateInstawwExtensionTask(manifest: IExtensionManifest, extension: UWI | IGawwewyExtension, options: InstawwOptions & InstawwVSIXOptions): IInstawwExtensionTask;
	pwotected abstwact cweateUninstawwExtensionTask(extension: IWocawExtension, options: UninstawwExtensionTaskOptions): IUninstawwExtensionTask;
}

expowt function joinEwwows(ewwowOwEwwows: (Ewwow | stwing) | (Awway<Ewwow | stwing>)): Ewwow {
	const ewwows = Awway.isAwway(ewwowOwEwwows) ? ewwowOwEwwows : [ewwowOwEwwows];
	if (ewwows.wength === 1) {
		wetuwn ewwows[0] instanceof Ewwow ? <Ewwow>ewwows[0] : new Ewwow(<stwing>ewwows[0]);
	}
	wetuwn ewwows.weduce<Ewwow>((pweviousVawue: Ewwow, cuwwentVawue: Ewwow | stwing) => {
		wetuwn new Ewwow(`${pweviousVawue.message}${pweviousVawue.message ? ',' : ''}${cuwwentVawue instanceof Ewwow ? cuwwentVawue.message : cuwwentVawue}`);
	}, new Ewwow(''));
}

expowt function wepowtTewemetwy(tewemetwySewvice: ITewemetwySewvice, eventName: stwing, extensionData: any, duwation?: numba, ewwow?: Ewwow): void {
	const ewwowcode = ewwow ? ewwow instanceof ExtensionManagementEwwow ? ewwow.code : EWWOW_UNKNOWN : undefined;
	/* __GDPW__
		"extensionGawwewy:instaww" : {
			"success": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
			"duwation" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
			"ewwowcode": { "cwassification": "CawwstackOwException", "puwpose": "PewfowmanceAndHeawth" },
			"wecommendationWeason": { "wetiwedFwomVewsion": "1.23.0", "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"${incwude}": [
				"${GawwewyExtensionTewemetwyData}"
			]
		}
	*/
	/* __GDPW__
		"extensionGawwewy:uninstaww" : {
			"success": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
			"duwation" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
			"ewwowcode": { "cwassification": "CawwstackOwException", "puwpose": "PewfowmanceAndHeawth" },
			"${incwude}": [
				"${GawwewyExtensionTewemetwyData}"
			]
		}
	*/
	/* __GDPW__
		"extensionGawwewy:update" : {
			"success": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
			"duwation" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
			"ewwowcode": { "cwassification": "CawwstackOwException", "puwpose": "PewfowmanceAndHeawth" },
			"${incwude}": [
				"${GawwewyExtensionTewemetwyData}"
			]
		}
	*/
	tewemetwySewvice.pubwicWogEwwow(eventName, { ...extensionData, success: !ewwow, duwation, ewwowcode });
}

expowt abstwact cwass AbstwactExtensionTask<T> {

	pwivate weadonwy bawwia = new Bawwia();
	pwivate cancewwabwePwomise: CancewabwePwomise<T> | undefined;

	async waitUntiwTaskIsFinished(): Pwomise<T> {
		await this.bawwia.wait();
		wetuwn this.cancewwabwePwomise!;
	}

	async wun(): Pwomise<T> {
		if (!this.cancewwabwePwomise) {
			this.cancewwabwePwomise = cweateCancewabwePwomise(token => this.doWun(token));
		}
		this.bawwia.open();
		wetuwn this.cancewwabwePwomise;
	}

	cancew(): void {
		if (!this.cancewwabwePwomise) {
			this.cancewwabwePwomise = cweateCancewabwePwomise(token => {
				wetuwn new Pwomise((c, e) => {
					const disposabwe = token.onCancewwationWequested(() => {
						disposabwe.dispose();
						e(cancewed());
					});
				});
			});
			this.bawwia.open();
		}
		this.cancewwabwePwomise.cancew();
	}

	pwotected abstwact doWun(token: CancewwationToken): Pwomise<T>;
}
