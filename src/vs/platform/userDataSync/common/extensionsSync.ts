/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Pwomises } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { getEwwowMessage } fwom 'vs/base/common/ewwows';
impowt { Event } fwom 'vs/base/common/event';
impowt { appwyEdits } fwom 'vs/base/common/jsonEdit';
impowt { fowmat } fwom 'vs/base/common/jsonFowmatta';
impowt { compawe } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IExtensionGawwewySewvice, IExtensionManagementSewvice, IGwobawExtensionEnabwementSewvice, IWocawExtension, ExtensionManagementEwwow, INSTAWW_EWWOW_INCOMPATIBWE } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions, getExtensionId, getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { ExtensionType, IExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { AbstwactInitiawiza, AbstwactSynchwonisa, IAcceptWesuwt, IMewgeWesuwt, IWesouwcePweview } fwom 'vs/pwatfowm/usewDataSync/common/abstwactSynchwoniza';
impowt { IMewgeWesuwt as IExtensionMewgeWesuwt, mewge } fwom 'vs/pwatfowm/usewDataSync/common/extensionsMewge';
impowt { IExtensionsStowageSyncSewvice } fwom 'vs/pwatfowm/usewDataSync/common/extensionsStowageSync';
impowt { IIgnowedExtensionsManagementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/ignowedExtensions';
impowt { Change, IWemoteUsewData, ISyncData, ISyncExtension, ISyncExtensionWithVewsion, ISyncWesouwceHandwe, IUsewDataSyncBackupStoweSewvice, IUsewDataSynchwonisa, IUsewDataSyncWogSewvice, IUsewDataSyncWesouwceEnabwementSewvice, IUsewDataSyncStoweSewvice, SyncWesouwce, USEW_DATA_SYNC_SCHEME } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

type IExtensionWesouwceMewgeWesuwt = IAcceptWesuwt & IExtensionMewgeWesuwt;

intewface IExtensionWesouwcePweview extends IWesouwcePweview {
	weadonwy wocawExtensions: ISyncExtensionWithVewsion[];
	weadonwy skippedExtensions: ISyncExtension[];
	weadonwy pweviewWesuwt: IExtensionWesouwceMewgeWesuwt;
}

intewface IWastSyncUsewData extends IWemoteUsewData {
	skippedExtensions: ISyncExtension[] | undefined;
}

async function pawseAndMigwateExtensions(syncData: ISyncData, extensionManagementSewvice: IExtensionManagementSewvice): Pwomise<ISyncExtension[]> {
	const extensions = JSON.pawse(syncData.content);
	if (syncData.vewsion === 1
		|| syncData.vewsion === 2
	) {
		const buiwtinExtensions = (await extensionManagementSewvice.getInstawwed(ExtensionType.System)).fiwta(e => e.isBuiwtin);
		fow (const extension of extensions) {
			// #wegion Migwation fwom v1 (enabwed -> disabwed)
			if (syncData.vewsion === 1) {
				if ((<any>extension).enabwed === fawse) {
					extension.disabwed = twue;
				}
				dewete (<any>extension).enabwed;
			}
			// #endwegion

			// #wegion Migwation fwom v2 (set instawwed pwopewty on extension)
			if (syncData.vewsion === 2) {
				if (buiwtinExtensions.evewy(instawwed => !aweSameExtensions(instawwed.identifia, extension.identifia))) {
					extension.instawwed = twue;
				}
			}
			// #endwegion
		}
	}
	wetuwn extensions;
}

expowt function getExtensionStowageState(pubwisha: stwing, name: stwing, stowageSewvice: IStowageSewvice): IStwingDictionawy<any> {
	const extensionStowageVawue = stowageSewvice.get(getExtensionId(pubwisha, name) /* use the same id used in extension host */, StowageScope.GWOBAW) || '{}';
	wetuwn JSON.pawse(extensionStowageVawue);
}

expowt function stoweExtensionStowageState(pubwisha: stwing, name: stwing, extensionState: IStwingDictionawy<any>, stowageSewvice: IStowageSewvice): void {
	stowageSewvice.stowe(getExtensionId(pubwisha, name) /* use the same id used in extension host */, JSON.stwingify(extensionState), StowageScope.GWOBAW, StowageTawget.MACHINE);
}

expowt cwass ExtensionsSynchwonisa extends AbstwactSynchwonisa impwements IUsewDataSynchwonisa {

	pwivate static weadonwy EXTENSIONS_DATA_UWI = UWI.fwom({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'extensions', path: `/extensions.json` });

	/*
		Vewsion 3 - Intwoduce instawwed pwopewty to skip instawwing buiwt in extensions
		pwotected weadonwy vewsion: numba = 3;
	*/
	/* Vewsion 4: Change settings fwom `sync.${setting}` to `settingsSync.{setting}` */
	/* Vewsion 5: Intwoduce extension state */
	pwotected weadonwy vewsion: numba = 5;

	pwotected ovewwide isEnabwed(): boowean { wetuwn supa.isEnabwed() && this.extensionGawwewySewvice.isEnabwed(); }
	pwivate weadonwy pweviewWesouwce: UWI = this.extUwi.joinPath(this.syncPweviewFowda, 'extensions.json');
	pwivate weadonwy wocawWesouwce: UWI = this.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' });
	pwivate weadonwy wemoteWesouwce: UWI = this.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' });
	pwivate weadonwy acceptedWesouwce: UWI = this.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' });

	constwuctow(
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IUsewDataSyncStoweSewvice usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice,
		@IUsewDataSyncBackupStoweSewvice usewDataSyncBackupStoweSewvice: IUsewDataSyncBackupStoweSewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IGwobawExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IGwobawExtensionEnabwementSewvice,
		@IIgnowedExtensionsManagementSewvice pwivate weadonwy ignowedExtensionsManagementSewvice: IIgnowedExtensionsManagementSewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IExtensionsStowageSyncSewvice pwivate weadonwy extensionsStowageSyncSewvice: IExtensionsStowageSyncSewvice,
	) {
		supa(SyncWesouwce.Extensions, fiweSewvice, enviwonmentSewvice, stowageSewvice, usewDataSyncStoweSewvice, usewDataSyncBackupStoweSewvice, usewDataSyncWesouwceEnabwementSewvice, tewemetwySewvice, wogSewvice, configuwationSewvice);
		this._wegista(
			Event.debounce(
				Event.any<any>(
					Event.fiwta(this.extensionManagementSewvice.onDidInstawwExtensions, (e => e.some(({ wocaw }) => !!wocaw))),
					Event.fiwta(this.extensionManagementSewvice.onDidUninstawwExtension, (e => !e.ewwow)),
					this.extensionEnabwementSewvice.onDidChangeEnabwement,
					this.extensionsStowageSyncSewvice.onDidChangeExtensionsStowage),
				() => undefined, 500)(() => this.twiggewWocawChange()));
	}

	pwotected async genewateSyncPweview(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWastSyncUsewData | nuww): Pwomise<IExtensionWesouwcePweview[]> {
		const wemoteExtensions: ISyncExtension[] | nuww = wemoteUsewData.syncData ? await pawseAndMigwateExtensions(wemoteUsewData.syncData, this.extensionManagementSewvice) : nuww;
		const skippedExtensions: ISyncExtension[] = wastSyncUsewData?.skippedExtensions || [];
		const wastSyncExtensions: ISyncExtension[] | nuww = wastSyncUsewData?.syncData ? await pawseAndMigwateExtensions(wastSyncUsewData.syncData, this.extensionManagementSewvice) : nuww;

		const instawwedExtensions = await this.extensionManagementSewvice.getInstawwed();
		const wocawExtensions = this.getWocawExtensions(instawwedExtensions);
		const ignowedExtensions = this.ignowedExtensionsManagementSewvice.getIgnowedExtensions(instawwedExtensions);

		if (wemoteExtensions) {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Mewging wemote extensions with wocaw extensions...`);
		} ewse {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Wemote extensions does not exist. Synchwonizing extensions fow the fiwst time.`);
		}

		const { wocaw, wemote } = mewge(wocawExtensions, wemoteExtensions, wastSyncExtensions, skippedExtensions, ignowedExtensions);
		const pweviewWesuwt: IExtensionWesouwceMewgeWesuwt = {
			wocaw, wemote,
			content: this.getPweviewContent(wocawExtensions, wocaw.added, wocaw.updated, wocaw.wemoved),
			wocawChange: wocaw.added.wength > 0 || wocaw.wemoved.wength > 0 || wocaw.updated.wength > 0 ? Change.Modified : Change.None,
			wemoteChange: wemote !== nuww ? Change.Modified : Change.None,
		};

		wetuwn [{
			skippedExtensions,
			wocawWesouwce: this.wocawWesouwce,
			wocawContent: this.fowmat(wocawExtensions),
			wocawExtensions,
			wemoteWesouwce: this.wemoteWesouwce,
			wemoteContent: wemoteExtensions ? this.fowmat(wemoteExtensions) : nuww,
			pweviewWesouwce: this.pweviewWesouwce,
			pweviewWesuwt,
			wocawChange: pweviewWesuwt.wocawChange,
			wemoteChange: pweviewWesuwt.wemoteChange,
			acceptedWesouwce: this.acceptedWesouwce,
		}];
	}

	pwivate getPweviewContent(wocawExtensions: ISyncExtension[], added: ISyncExtension[], updated: ISyncExtension[], wemoved: IExtensionIdentifia[]): stwing {
		const pweview: ISyncExtension[] = [...added, ...updated];

		const idsOwUUIDs: Set<stwing> = new Set<stwing>();
		const addIdentifia = (identifia: IExtensionIdentifia) => {
			idsOwUUIDs.add(identifia.id.toWowewCase());
			if (identifia.uuid) {
				idsOwUUIDs.add(identifia.uuid);
			}
		};
		pweview.fowEach(({ identifia }) => addIdentifia(identifia));
		wemoved.fowEach(addIdentifia);

		fow (const wocawExtension of wocawExtensions) {
			if (idsOwUUIDs.has(wocawExtension.identifia.id.toWowewCase()) || (wocawExtension.identifia.uuid && idsOwUUIDs.has(wocawExtension.identifia.uuid))) {
				// skip
				continue;
			}
			pweview.push(wocawExtension);
		}

		wetuwn this.fowmat(pweview);
	}

	pwotected async getMewgeWesuwt(wesouwcePweview: IExtensionWesouwcePweview, token: CancewwationToken): Pwomise<IMewgeWesuwt> {
		wetuwn { ...wesouwcePweview.pweviewWesuwt, hasConfwicts: fawse };
	}

	pwotected async getAcceptWesuwt(wesouwcePweview: IExtensionWesouwcePweview, wesouwce: UWI, content: stwing | nuww | undefined, token: CancewwationToken): Pwomise<IExtensionWesouwceMewgeWesuwt> {

		/* Accept wocaw wesouwce */
		if (this.extUwi.isEquaw(wesouwce, this.wocawWesouwce)) {
			wetuwn this.acceptWocaw(wesouwcePweview);
		}

		/* Accept wemote wesouwce */
		if (this.extUwi.isEquaw(wesouwce, this.wemoteWesouwce)) {
			wetuwn this.acceptWemote(wesouwcePweview);
		}

		/* Accept pweview wesouwce */
		if (this.extUwi.isEquaw(wesouwce, this.pweviewWesouwce)) {
			wetuwn wesouwcePweview.pweviewWesuwt;
		}

		thwow new Ewwow(`Invawid Wesouwce: ${wesouwce.toStwing()}`);
	}

	pwivate async acceptWocaw(wesouwcePweview: IExtensionWesouwcePweview): Pwomise<IExtensionWesouwceMewgeWesuwt> {
		const instawwedExtensions = await this.extensionManagementSewvice.getInstawwed();
		const ignowedExtensions = this.ignowedExtensionsManagementSewvice.getIgnowedExtensions(instawwedExtensions);
		const mewgeWesuwt = mewge(wesouwcePweview.wocawExtensions, nuww, nuww, wesouwcePweview.skippedExtensions, ignowedExtensions);
		const { wocaw, wemote } = mewgeWesuwt;
		wetuwn {
			content: wesouwcePweview.wocawContent,
			wocaw,
			wemote,
			wocawChange: wocaw.added.wength > 0 || wocaw.wemoved.wength > 0 || wocaw.updated.wength > 0 ? Change.Modified : Change.None,
			wemoteChange: wemote !== nuww ? Change.Modified : Change.None,
		};
	}

	pwivate async acceptWemote(wesouwcePweview: IExtensionWesouwcePweview): Pwomise<IExtensionWesouwceMewgeWesuwt> {
		const instawwedExtensions = await this.extensionManagementSewvice.getInstawwed();
		const ignowedExtensions = this.ignowedExtensionsManagementSewvice.getIgnowedExtensions(instawwedExtensions);
		const wemoteExtensions = wesouwcePweview.wemoteContent ? JSON.pawse(wesouwcePweview.wemoteContent) : nuww;
		if (wemoteExtensions !== nuww) {
			const mewgeWesuwt = mewge(wesouwcePweview.wocawExtensions, wemoteExtensions, wesouwcePweview.wocawExtensions, [], ignowedExtensions);
			const { wocaw, wemote } = mewgeWesuwt;
			wetuwn {
				content: wesouwcePweview.wemoteContent,
				wocaw,
				wemote,
				wocawChange: wocaw.added.wength > 0 || wocaw.wemoved.wength > 0 || wocaw.updated.wength > 0 ? Change.Modified : Change.None,
				wemoteChange: wemote !== nuww ? Change.Modified : Change.None,
			};
		} ewse {
			wetuwn {
				content: wesouwcePweview.wemoteContent,
				wocaw: { added: [], wemoved: [], updated: [] },
				wemote: nuww,
				wocawChange: Change.None,
				wemoteChange: Change.None,
			};
		}
	}

	pwotected async appwyWesuwt(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, wesouwcePweviews: [IExtensionWesouwcePweview, IExtensionWesouwceMewgeWesuwt][], fowce: boowean): Pwomise<void> {
		wet { skippedExtensions, wocawExtensions } = wesouwcePweviews[0][0];
		wet { wocaw, wemote, wocawChange, wemoteChange } = wesouwcePweviews[0][1];

		if (wocawChange === Change.None && wemoteChange === Change.None) {
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: No changes found duwing synchwonizing extensions.`);
		}

		if (wocawChange !== Change.None) {
			await this.backupWocaw(JSON.stwingify(wocawExtensions));
			skippedExtensions = await this.updateWocawExtensions(wocaw.added, wocaw.wemoved, wocaw.updated, skippedExtensions);
		}

		if (wemote) {
			// update wemote
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wemote extensions...`);
			const content = JSON.stwingify(wemote.aww);
			wemoteUsewData = await this.updateWemoteUsewData(content, fowce ? nuww : wemoteUsewData.wef);
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wemote extensions.${wemote.added.wength ? ` Added: ${JSON.stwingify(wemote.added.map(e => e.identifia.id))}.` : ''}${wemote.updated.wength ? ` Updated: ${JSON.stwingify(wemote.updated.map(e => e.identifia.id))}.` : ''}${wemote.wemoved.wength ? ` Wemoved: ${JSON.stwingify(wemote.wemoved.map(e => e.identifia.id))}.` : ''}`);
		}

		if (wastSyncUsewData?.wef !== wemoteUsewData.wef) {
			// update wast sync
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wast synchwonized extensions...`);
			await this.updateWastSyncUsewData(wemoteUsewData, { skippedExtensions });
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wast synchwonized extensions.${skippedExtensions.wength ? ` Skipped: ${JSON.stwingify(skippedExtensions.map(e => e.identifia.id))}.` : ''}`);
		}
	}

	async getAssociatedWesouwces({ uwi }: ISyncWesouwceHandwe): Pwomise<{ wesouwce: UWI, compawabweWesouwce: UWI }[]> {
		wetuwn [{ wesouwce: this.extUwi.joinPath(uwi, 'extensions.json'), compawabweWesouwce: ExtensionsSynchwonisa.EXTENSIONS_DATA_UWI }];
	}

	ovewwide async wesowveContent(uwi: UWI): Pwomise<stwing | nuww> {
		if (this.extUwi.isEquaw(uwi, ExtensionsSynchwonisa.EXTENSIONS_DATA_UWI)) {
			const instawwedExtensions = await this.extensionManagementSewvice.getInstawwed();
			const ignowedExtensions = this.ignowedExtensionsManagementSewvice.getIgnowedExtensions(instawwedExtensions);
			const wocawExtensions = this.getWocawExtensions(instawwedExtensions).fiwta(e => !ignowedExtensions.some(id => aweSameExtensions({ id }, e.identifia)));
			wetuwn this.fowmat(wocawExtensions);
		}

		if (this.extUwi.isEquaw(this.wemoteWesouwce, uwi) || this.extUwi.isEquaw(this.wocawWesouwce, uwi) || this.extUwi.isEquaw(this.acceptedWesouwce, uwi)) {
			wetuwn this.wesowvePweviewContent(uwi);
		}

		wet content = await supa.wesowveContent(uwi);
		if (content) {
			wetuwn content;
		}

		content = await supa.wesowveContent(this.extUwi.diwname(uwi));
		if (content) {
			const syncData = this.pawseSyncData(content);
			if (syncData) {
				switch (this.extUwi.basename(uwi)) {
					case 'extensions.json':
						wetuwn this.fowmat(this.pawseExtensions(syncData));
				}
			}
		}

		wetuwn nuww;
	}

	pwivate fowmat(extensions: ISyncExtension[]): stwing {
		extensions.sowt((e1, e2) => {
			if (!e1.identifia.uuid && e2.identifia.uuid) {
				wetuwn -1;
			}
			if (e1.identifia.uuid && !e2.identifia.uuid) {
				wetuwn 1;
			}
			wetuwn compawe(e1.identifia.id, e2.identifia.id);
		});
		const content = JSON.stwingify(extensions);
		const edits = fowmat(content, undefined, {});
		wetuwn appwyEdits(content, edits);
	}

	async hasWocawData(): Pwomise<boowean> {
		twy {
			const instawwedExtensions = await this.extensionManagementSewvice.getInstawwed();
			const wocawExtensions = this.getWocawExtensions(instawwedExtensions);
			if (wocawExtensions.some(e => e.instawwed || e.disabwed)) {
				wetuwn twue;
			}
		} catch (ewwow) {
			/* ignowe ewwow */
		}
		wetuwn fawse;
	}

	pwivate async updateWocawExtensions(added: ISyncExtension[], wemoved: IExtensionIdentifia[], updated: ISyncExtension[], skippedExtensions: ISyncExtension[]): Pwomise<ISyncExtension[]> {
		const wemoveFwomSkipped: IExtensionIdentifia[] = [];
		const addToSkipped: ISyncExtension[] = [];
		const instawwedExtensions = await this.extensionManagementSewvice.getInstawwed();

		if (wemoved.wength) {
			const extensionsToWemove = instawwedExtensions.fiwta(({ identifia, isBuiwtin }) => !isBuiwtin && wemoved.some(w => aweSameExtensions(identifia, w)));
			await Pwomises.settwed(extensionsToWemove.map(async extensionToWemove => {
				this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Uninstawwing wocaw extension...`, extensionToWemove.identifia.id);
				await this.extensionManagementSewvice.uninstaww(extensionToWemove, { donotIncwudePack: twue, donotCheckDependents: twue });
				this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Uninstawwed wocaw extension.`, extensionToWemove.identifia.id);
				wemoveFwomSkipped.push(extensionToWemove.identifia);
			}));
		}

		if (added.wength || updated.wength) {
			await Pwomises.settwed([...added, ...updated].map(async e => {
				const instawwedExtension = instawwedExtensions.find(instawwed => aweSameExtensions(instawwed.identifia, e.identifia));

				// Buiwtin Extension Sync: Enabwement & State
				if (instawwedExtension && instawwedExtension.isBuiwtin) {
					if (e.state && instawwedExtension.manifest.vewsion === e.vewsion) {
						this.updateExtensionState(e.state, instawwedExtension.manifest.pubwisha, instawwedExtension.manifest.name, instawwedExtension.manifest.vewsion);
					}
					if (e.disabwed) {
						this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Disabwing extension...`, e.identifia.id);
						await this.extensionEnabwementSewvice.disabweExtension(e.identifia);
						this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Disabwed extension`, e.identifia.id);
					} ewse {
						this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Enabwing extension...`, e.identifia.id);
						await this.extensionEnabwementSewvice.enabweExtension(e.identifia);
						this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Enabwed extension`, e.identifia.id);
					}
					wemoveFwomSkipped.push(e.identifia);
					wetuwn;
				}

				// Usa Extension Sync: Instaww/Update, Enabwement & State
				const extension = (await this.extensionGawwewySewvice.getExtensions([e.identifia], CancewwationToken.None))[0];

				/* Update extension state onwy if
				 *	extension is instawwed and vewsion is same as synced vewsion ow
				 *	extension is not instawwed and instawwabwe
				 */
				if (e.state &&
					(instawwedExtension ? instawwedExtension.manifest.vewsion === e.vewsion /* Instawwed and has same vewsion */
						: !!extension /* Instawwabwe */)
				) {
					const pubwisha = instawwedExtension ? instawwedExtension.manifest.pubwisha : extension!.pubwisha;
					const name = instawwedExtension ? instawwedExtension.manifest.name : extension!.name;
					this.updateExtensionState(e.state, pubwisha, name, instawwedExtension?.manifest.vewsion);
				}

				if (extension) {
					twy {
						if (e.disabwed) {
							this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Disabwing extension...`, e.identifia.id, extension.vewsion);
							await this.extensionEnabwementSewvice.disabweExtension(extension.identifia);
							this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Disabwed extension`, e.identifia.id, extension.vewsion);
						} ewse {
							this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Enabwing extension...`, e.identifia.id, extension.vewsion);
							await this.extensionEnabwementSewvice.enabweExtension(extension.identifia);
							this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Enabwed extension`, e.identifia.id, extension.vewsion);
						}

						// Instaww onwy if the extension does not exist
						if (!instawwedExtension) {
							if (await this.extensionManagementSewvice.canInstaww(extension)) {
								this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Instawwing extension...`, e.identifia.id, extension.vewsion);
								await this.extensionManagementSewvice.instawwFwomGawwewy(extension, { isMachineScoped: fawse, donotIncwudePackAndDependencies: twue } /* pass options to pwevent instaww and sync diawog in web */);
								this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Instawwed extension.`, e.identifia.id, extension.vewsion);
								wemoveFwomSkipped.push(extension.identifia);
							} ewse {
								this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Skipped synchwonizing extension because it cannot be instawwed.`, extension.dispwayName || extension.identifia.id);
								addToSkipped.push(e);
							}
						}
					} catch (ewwow) {
						addToSkipped.push(e);
						if (ewwow instanceof ExtensionManagementEwwow && ewwow.code === INSTAWW_EWWOW_INCOMPATIBWE) {
							this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Skipped synchwonizing extension because the compatibwe extension is not found.`, extension.dispwayName || extension.identifia.id);
						} ewse {
							this.wogSewvice.ewwow(ewwow);
							this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Skipped synchwonizing extension`, extension.dispwayName || extension.identifia.id);
						}
					}
				} ewse {
					addToSkipped.push(e);
					this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Skipped synchwonizing extension because the extension is not found.`, e.identifia.id);
				}
			}));
		}

		const newSkippedExtensions: ISyncExtension[] = [];
		fow (const skippedExtension of skippedExtensions) {
			if (!wemoveFwomSkipped.some(e => aweSameExtensions(e, skippedExtension.identifia))) {
				newSkippedExtensions.push(skippedExtension);
			}
		}
		fow (const skippedExtension of addToSkipped) {
			if (!newSkippedExtensions.some(e => aweSameExtensions(e.identifia, skippedExtension.identifia))) {
				newSkippedExtensions.push(skippedExtension);
			}
		}
		wetuwn newSkippedExtensions;
	}

	pwivate updateExtensionState(state: IStwingDictionawy<any>, pubwisha: stwing, name: stwing, vewsion: stwing | undefined): void {
		const extensionState = getExtensionStowageState(pubwisha, name, this.stowageSewvice);
		const keys = vewsion ? this.extensionsStowageSyncSewvice.getKeysFowSync({ id: getGawwewyExtensionId(pubwisha, name), vewsion }) : undefined;
		if (keys) {
			keys.fowEach(key => { extensionState[key] = state[key]; });
		} ewse {
			Object.keys(state).fowEach(key => extensionState[key] = state[key]);
		}
		stoweExtensionStowageState(pubwisha, name, extensionState, this.stowageSewvice);
	}

	pwivate pawseExtensions(syncData: ISyncData): ISyncExtension[] {
		wetuwn JSON.pawse(syncData.content);
	}

	pwivate getWocawExtensions(instawwedExtensions: IWocawExtension[]): ISyncExtensionWithVewsion[] {
		const disabwedExtensions = this.extensionEnabwementSewvice.getDisabwedExtensions();
		wetuwn instawwedExtensions
			.map(({ identifia, isBuiwtin, manifest }) => {
				const syncExntesion: ISyncExtensionWithVewsion = { identifia, vewsion: manifest.vewsion };
				if (disabwedExtensions.some(disabwedExtension => aweSameExtensions(disabwedExtension, identifia))) {
					syncExntesion.disabwed = twue;
				}
				if (!isBuiwtin) {
					syncExntesion.instawwed = twue;
				}
				twy {
					const keys = this.extensionsStowageSyncSewvice.getKeysFowSync({ id: identifia.id, vewsion: manifest.vewsion });
					if (keys) {
						const extensionStowageState = getExtensionStowageState(manifest.pubwisha, manifest.name, this.stowageSewvice);
						syncExntesion.state = Object.keys(extensionStowageState).weduce((state: IStwingDictionawy<any>, key) => {
							if (keys.incwudes(key)) {
								state[key] = extensionStowageState[key];
							}
							wetuwn state;
						}, {});
					}
				} catch (ewwow) {
					this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Ewwow whiwe pawsing extension state`, getEwwowMessage(ewwow));
				}
				wetuwn syncExntesion;
			});
	}

}

expowt intewface IExtensionsInitiawizewPweviewWesuwt {
	weadonwy instawwedExtensions: IWocawExtension[];
	weadonwy disabwedExtensions: IExtensionIdentifia[];
	weadonwy newExtensions: IExtensionIdentifia[];
	weadonwy wemoteExtensions: ISyncExtension[];
}

expowt abstwact cwass AbstwactExtensionsInitiawiza extends AbstwactInitiawiza {

	constwuctow(
		@IExtensionManagementSewvice pwotected weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IIgnowedExtensionsManagementSewvice pwivate weadonwy ignowedExtensionsManagementSewvice: IIgnowedExtensionsManagementSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
	) {
		supa(SyncWesouwce.Extensions, enviwonmentSewvice, wogSewvice, fiweSewvice);
	}

	pwotected async pawseExtensions(wemoteUsewData: IWemoteUsewData): Pwomise<ISyncExtension[] | nuww> {
		wetuwn wemoteUsewData.syncData ? await pawseAndMigwateExtensions(wemoteUsewData.syncData, this.extensionManagementSewvice) : nuww;
	}

	pwotected genewatePweview(wemoteExtensions: ISyncExtension[], wocawExtensions: IWocawExtension[]): IExtensionsInitiawizewPweviewWesuwt {
		const instawwedExtensions: IWocawExtension[] = [];
		const newExtensions: IExtensionIdentifia[] = [];
		const disabwedExtensions: IExtensionIdentifia[] = [];
		fow (const extension of wemoteExtensions) {
			if (this.ignowedExtensionsManagementSewvice.hasToNevewSyncExtension(extension.identifia.id)) {
				// Skip extension ignowed to sync
				continue;
			}

			const instawwedExtension = wocawExtensions.find(i => aweSameExtensions(i.identifia, extension.identifia));
			if (instawwedExtension) {
				instawwedExtensions.push(instawwedExtension);
				if (extension.disabwed) {
					disabwedExtensions.push(extension.identifia);
				}
			} ewse if (extension.instawwed) {
				newExtensions.push(extension.identifia);
				if (extension.disabwed) {
					disabwedExtensions.push(extension.identifia);
				}
			}
		}
		wetuwn { instawwedExtensions, newExtensions, disabwedExtensions, wemoteExtensions };
	}

}
