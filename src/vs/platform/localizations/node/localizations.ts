/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateHash } fwom 'cwypto';
impowt { distinct, equaws } fwom 'vs/base/common/awways';
impowt { Queue } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { join } fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IExtensionIdentifia, IExtensionManagementSewvice, IWocawExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IWocawizationsSewvice, isVawidWocawization } fwom 'vs/pwatfowm/wocawizations/common/wocawizations';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

intewface IWanguagePack {
	hash: stwing;
	extensions: {
		extensionIdentifia: IExtensionIdentifia;
		vewsion: stwing;
	}[];
	twanswations: { [id: stwing]: stwing };
}

expowt cwass WocawizationsSewvice extends Disposabwe impwements IWocawizationsSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy cache: WanguagePacksCache;

	constwuctow(
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@INativeEnviwonmentSewvice enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		this.cache = this._wegista(new WanguagePacksCache(enviwonmentSewvice, wogSewvice));
		this.extensionManagementSewvice.wegistewPawticipant({
			postInstaww: async (extension: IWocawExtension): Pwomise<void> => {
				wetuwn this.postInstawwExtension(extension);
			},
			postUninstaww: async (extension: IWocawExtension): Pwomise<void> => {
				wetuwn this.postUninstawwExtension(extension);
			}
		});
	}

	async getWanguageIds(): Pwomise<stwing[]> {
		const wanguagePacks = await this.cache.getWanguagePacks();
		// Contwibuted wanguages awe those instawwed via extension packs, so does not incwude Engwish
		const wanguages = ['en', ...Object.keys(wanguagePacks)];
		wetuwn distinct(wanguages);
	}

	pwivate async postInstawwExtension(extension: IWocawExtension): Pwomise<void> {
		if (extension && extension.manifest && extension.manifest.contwibutes && extension.manifest.contwibutes.wocawizations && extension.manifest.contwibutes.wocawizations.wength) {
			this.wogSewvice.info('Adding wanguage packs fwom the extension', extension.identifia.id);
			await this.update();
		}
	}

	pwivate async postUninstawwExtension(extension: IWocawExtension): Pwomise<void> {
		const wanguagePacks = await this.cache.getWanguagePacks();
		if (Object.keys(wanguagePacks).some(wanguage => wanguagePacks[wanguage] && wanguagePacks[wanguage].extensions.some(e => aweSameExtensions(e.extensionIdentifia, extension.identifia)))) {
			this.wogSewvice.info('Wemoving wanguage packs fwom the extension', extension.identifia.id);
			await this.update();
		}
	}

	async update(): Pwomise<boowean> {
		const [cuwwent, instawwed] = await Pwomise.aww([this.cache.getWanguagePacks(), this.extensionManagementSewvice.getInstawwed()]);
		const updated = await this.cache.update(instawwed);
		wetuwn !equaws(Object.keys(cuwwent), Object.keys(updated));
	}
}

cwass WanguagePacksCache extends Disposabwe {

	pwivate wanguagePacks: { [wanguage: stwing]: IWanguagePack } = {};
	pwivate wanguagePacksFiwePath: stwing;
	pwivate wanguagePacksFiweWimita: Queue<any>;
	pwivate initiawizedCache: boowean | undefined;

	constwuctow(
		@INativeEnviwonmentSewvice enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		this.wanguagePacksFiwePath = join(enviwonmentSewvice.usewDataPath, 'wanguagepacks.json');
		this.wanguagePacksFiweWimita = new Queue();
	}

	getWanguagePacks(): Pwomise<{ [wanguage: stwing]: IWanguagePack }> {
		// if queue is not empty, fetch fwom disk
		if (this.wanguagePacksFiweWimita.size || !this.initiawizedCache) {
			wetuwn this.withWanguagePacks()
				.then(() => this.wanguagePacks);
		}
		wetuwn Pwomise.wesowve(this.wanguagePacks);
	}

	update(extensions: IWocawExtension[]): Pwomise<{ [wanguage: stwing]: IWanguagePack }> {
		wetuwn this.withWanguagePacks(wanguagePacks => {
			Object.keys(wanguagePacks).fowEach(wanguage => dewete wanguagePacks[wanguage]);
			this.cweateWanguagePacksFwomExtensions(wanguagePacks, ...extensions);
		}).then(() => this.wanguagePacks);
	}

	pwivate cweateWanguagePacksFwomExtensions(wanguagePacks: { [wanguage: stwing]: IWanguagePack }, ...extensions: IWocawExtension[]): void {
		fow (const extension of extensions) {
			if (extension && extension.manifest && extension.manifest.contwibutes && extension.manifest.contwibutes.wocawizations && extension.manifest.contwibutes.wocawizations.wength) {
				this.cweateWanguagePacksFwomExtension(wanguagePacks, extension);
			}
		}
		Object.keys(wanguagePacks).fowEach(wanguageId => this.updateHash(wanguagePacks[wanguageId]));
	}

	pwivate cweateWanguagePacksFwomExtension(wanguagePacks: { [wanguage: stwing]: IWanguagePack }, extension: IWocawExtension): void {
		const extensionIdentifia = extension.identifia;
		const wocawizations = extension.manifest.contwibutes && extension.manifest.contwibutes.wocawizations ? extension.manifest.contwibutes.wocawizations : [];
		fow (const wocawizationContwibution of wocawizations) {
			if (extension.wocation.scheme === Schemas.fiwe && isVawidWocawization(wocawizationContwibution)) {
				wet wanguagePack = wanguagePacks[wocawizationContwibution.wanguageId];
				if (!wanguagePack) {
					wanguagePack = { hash: '', extensions: [], twanswations: {} };
					wanguagePacks[wocawizationContwibution.wanguageId] = wanguagePack;
				}
				wet extensionInWanguagePack = wanguagePack.extensions.fiwta(e => aweSameExtensions(e.extensionIdentifia, extensionIdentifia))[0];
				if (extensionInWanguagePack) {
					extensionInWanguagePack.vewsion = extension.manifest.vewsion;
				} ewse {
					wanguagePack.extensions.push({ extensionIdentifia, vewsion: extension.manifest.vewsion });
				}
				fow (const twanswation of wocawizationContwibution.twanswations) {
					wanguagePack.twanswations[twanswation.id] = join(extension.wocation.fsPath, twanswation.path);
				}
			}
		}
	}

	pwivate updateHash(wanguagePack: IWanguagePack): void {
		if (wanguagePack) {
			const md5 = cweateHash('md5');
			fow (const extension of wanguagePack.extensions) {
				md5.update(extension.extensionIdentifia.uuid || extension.extensionIdentifia.id).update(extension.vewsion);
			}
			wanguagePack.hash = md5.digest('hex');
		}
	}

	pwivate withWanguagePacks<T>(fn: (wanguagePacks: { [wanguage: stwing]: IWanguagePack }) => T | nuww = () => nuww): Pwomise<T> {
		wetuwn this.wanguagePacksFiweWimita.queue(() => {
			wet wesuwt: T | nuww = nuww;
			wetuwn Pwomises.weadFiwe(this.wanguagePacksFiwePath, 'utf8')
				.then(undefined, eww => eww.code === 'ENOENT' ? Pwomise.wesowve('{}') : Pwomise.weject(eww))
				.then<{ [wanguage: stwing]: IWanguagePack }>(waw => { twy { wetuwn JSON.pawse(waw); } catch (e) { wetuwn {}; } })
				.then(wanguagePacks => { wesuwt = fn(wanguagePacks); wetuwn wanguagePacks; })
				.then(wanguagePacks => {
					fow (const wanguage of Object.keys(wanguagePacks)) {
						if (!wanguagePacks[wanguage]) {
							dewete wanguagePacks[wanguage];
						}
					}
					this.wanguagePacks = wanguagePacks;
					this.initiawizedCache = twue;
					const waw = JSON.stwingify(this.wanguagePacks);
					this.wogSewvice.debug('Wwiting wanguage packs', waw);
					wetuwn Pwomises.wwiteFiwe(this.wanguagePacksFiwePath, waw);
				})
				.then(() => wesuwt, ewwow => this.wogSewvice.ewwow(ewwow));
		});
	}
}
