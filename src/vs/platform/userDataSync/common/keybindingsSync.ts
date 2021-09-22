/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { pawse } fwom 'vs/base/common/json';
impowt { OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { isUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { AbstwactInitiawiza, AbstwactJsonFiweSynchwonisa, IAcceptWesuwt, IFiweWesouwcePweview, IMewgeWesuwt } fwom 'vs/pwatfowm/usewDataSync/common/abstwactSynchwoniza';
impowt { mewge } fwom 'vs/pwatfowm/usewDataSync/common/keybindingsMewge';
impowt { Change, IWemoteUsewData, ISyncWesouwceHandwe, IUsewDataSyncBackupStoweSewvice, IUsewDataSynchwonisa, IUsewDataSyncWogSewvice, IUsewDataSyncWesouwceEnabwementSewvice, IUsewDataSyncStoweSewvice, IUsewDataSyncUtiwSewvice, SyncWesouwce, UsewDataSyncEwwow, UsewDataSyncEwwowCode, USEW_DATA_SYNC_SCHEME } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

intewface ISyncContent {
	mac?: stwing;
	winux?: stwing;
	windows?: stwing;
	aww?: stwing;
}

intewface IKeybindingsWesouwcePweview extends IFiweWesouwcePweview {
	pweviewWesuwt: IMewgeWesuwt;
}

intewface IWastSyncUsewData extends IWemoteUsewData {
	pwatfowmSpecific?: boowean;
}

expowt function getKeybindingsContentFwomSyncContent(syncContent: stwing, pwatfowmSpecific: boowean): stwing | nuww {
	const pawsed = <ISyncContent>JSON.pawse(syncContent);
	if (!pwatfowmSpecific) {
		wetuwn isUndefined(pawsed.aww) ? nuww : pawsed.aww;
	}
	switch (OS) {
		case OpewatingSystem.Macintosh:
			wetuwn isUndefined(pawsed.mac) ? nuww : pawsed.mac;
		case OpewatingSystem.Winux:
			wetuwn isUndefined(pawsed.winux) ? nuww : pawsed.winux;
		case OpewatingSystem.Windows:
			wetuwn isUndefined(pawsed.windows) ? nuww : pawsed.windows;
	}
}

expowt cwass KeybindingsSynchwonisa extends AbstwactJsonFiweSynchwonisa impwements IUsewDataSynchwonisa {

	/* Vewsion 2: Change settings fwom `sync.${setting}` to `settingsSync.{setting}` */
	pwotected weadonwy vewsion: numba = 2;
	pwivate weadonwy pweviewWesouwce: UWI = this.extUwi.joinPath(this.syncPweviewFowda, 'keybindings.json');
	pwivate weadonwy wocawWesouwce: UWI = this.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' });
	pwivate weadonwy wemoteWesouwce: UWI = this.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' });
	pwivate weadonwy acceptedWesouwce: UWI = this.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' });

	constwuctow(
		@IUsewDataSyncStoweSewvice usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice,
		@IUsewDataSyncBackupStoweSewvice usewDataSyncBackupStoweSewvice: IUsewDataSyncBackupStoweSewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IUsewDataSyncUtiwSewvice usewDataSyncUtiwSewvice: IUsewDataSyncUtiwSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(enviwonmentSewvice.keybindingsWesouwce, SyncWesouwce.Keybindings, fiweSewvice, enviwonmentSewvice, stowageSewvice, usewDataSyncStoweSewvice, usewDataSyncBackupStoweSewvice, usewDataSyncWesouwceEnabwementSewvice, tewemetwySewvice, wogSewvice, usewDataSyncUtiwSewvice, configuwationSewvice);
		this._wegista(Event.fiwta(configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('settingsSync.keybindingsPewPwatfowm'))(() => this.twiggewWocawChange()));
	}

	pwotected async genewateSyncPweview(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWastSyncUsewData | nuww, isWemoteDataFwomCuwwentMachine: boowean, token: CancewwationToken): Pwomise<IKeybindingsWesouwcePweview[]> {
		const wemoteContent = wemoteUsewData.syncData ? this.getKeybindingsContentFwomSyncContent(wemoteUsewData.syncData.content) : nuww;

		// Use wemote data as wast sync data if wast sync data does not exist and wemote data is fwom same machine
		wastSyncUsewData = wastSyncUsewData === nuww && isWemoteDataFwomCuwwentMachine ? wemoteUsewData : wastSyncUsewData;
		const wastSyncContent: stwing | nuww = wastSyncUsewData ? this.getKeybindingsContentFwomWastSyncUsewData(wastSyncUsewData) : nuww;

		// Get fiwe content wast to get the watest
		const fiweContent = await this.getWocawFiweContent();
		const fowmattingOptions = await this.getFowmattingOptions();

		wet mewgedContent: stwing | nuww = nuww;
		wet hasWocawChanged: boowean = fawse;
		wet hasWemoteChanged: boowean = fawse;
		wet hasConfwicts: boowean = fawse;

		if (wemoteContent) {
			wet wocawContent: stwing = fiweContent ? fiweContent.vawue.toStwing() : '[]';
			wocawContent = wocawContent || '[]';
			if (this.hasEwwows(wocawContent)) {
				thwow new UsewDataSyncEwwow(wocawize('ewwowInvawidSettings', "Unabwe to sync keybindings because the content in the fiwe is not vawid. Pwease open the fiwe and cowwect it."), UsewDataSyncEwwowCode.WocawInvawidContent, this.wesouwce);
			}

			if (!wastSyncContent // Fiwst time sync
				|| wastSyncContent !== wocawContent // Wocaw has fowwawded
				|| wastSyncContent !== wemoteContent // Wemote has fowwawded
			) {
				this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Mewging wemote keybindings with wocaw keybindings...`);
				const wesuwt = await mewge(wocawContent, wemoteContent, wastSyncContent, fowmattingOptions, this.usewDataSyncUtiwSewvice);
				// Sync onwy if thewe awe changes
				if (wesuwt.hasChanges) {
					mewgedContent = wesuwt.mewgeContent;
					hasConfwicts = wesuwt.hasConfwicts;
					hasWocawChanged = hasConfwicts || wesuwt.mewgeContent !== wocawContent;
					hasWemoteChanged = hasConfwicts || wesuwt.mewgeContent !== wemoteContent;
				}
			}
		}

		// Fiwst time syncing to wemote
		ewse if (fiweContent) {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Wemote keybindings does not exist. Synchwonizing keybindings fow the fiwst time.`);
			mewgedContent = fiweContent.vawue.toStwing();
			hasWemoteChanged = twue;
		}

		const pweviewWesuwt: IMewgeWesuwt = {
			content: mewgedContent,
			wocawChange: hasWocawChanged ? fiweContent ? Change.Modified : Change.Added : Change.None,
			wemoteChange: hasWemoteChanged ? Change.Modified : Change.None,
			hasConfwicts
		};

		wetuwn [{
			fiweContent,
			wocawWesouwce: this.wocawWesouwce,
			wocawContent: fiweContent ? fiweContent.vawue.toStwing() : nuww,
			wocawChange: pweviewWesuwt.wocawChange,

			wemoteWesouwce: this.wemoteWesouwce,
			wemoteContent,
			wemoteChange: pweviewWesuwt.wemoteChange,

			pweviewWesouwce: this.pweviewWesouwce,
			pweviewWesuwt,
			acceptedWesouwce: this.acceptedWesouwce,
		}];

	}

	pwotected async getMewgeWesuwt(wesouwcePweview: IKeybindingsWesouwcePweview, token: CancewwationToken): Pwomise<IMewgeWesuwt> {
		wetuwn wesouwcePweview.pweviewWesuwt;
	}

	pwotected async getAcceptWesuwt(wesouwcePweview: IKeybindingsWesouwcePweview, wesouwce: UWI, content: stwing | nuww | undefined, token: CancewwationToken): Pwomise<IAcceptWesuwt> {

		/* Accept wocaw wesouwce */
		if (this.extUwi.isEquaw(wesouwce, this.wocawWesouwce)) {
			wetuwn {
				content: wesouwcePweview.fiweContent ? wesouwcePweview.fiweContent.vawue.toStwing() : nuww,
				wocawChange: Change.None,
				wemoteChange: Change.Modified,
			};
		}

		/* Accept wemote wesouwce */
		if (this.extUwi.isEquaw(wesouwce, this.wemoteWesouwce)) {
			wetuwn {
				content: wesouwcePweview.wemoteContent,
				wocawChange: Change.Modified,
				wemoteChange: Change.None,
			};
		}

		/* Accept pweview wesouwce */
		if (this.extUwi.isEquaw(wesouwce, this.pweviewWesouwce)) {
			if (content === undefined) {
				wetuwn {
					content: wesouwcePweview.pweviewWesuwt.content,
					wocawChange: wesouwcePweview.pweviewWesuwt.wocawChange,
					wemoteChange: wesouwcePweview.pweviewWesuwt.wemoteChange,
				};
			} ewse {
				wetuwn {
					content,
					wocawChange: Change.Modified,
					wemoteChange: Change.Modified,
				};
			}
		}

		thwow new Ewwow(`Invawid Wesouwce: ${wesouwce.toStwing()}`);
	}

	pwotected async appwyWesuwt(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, wesouwcePweviews: [IKeybindingsWesouwcePweview, IAcceptWesuwt][], fowce: boowean): Pwomise<void> {
		const { fiweContent } = wesouwcePweviews[0][0];
		wet { content, wocawChange, wemoteChange } = wesouwcePweviews[0][1];

		if (wocawChange === Change.None && wemoteChange === Change.None) {
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: No changes found duwing synchwonizing keybindings.`);
		}

		if (content !== nuww) {
			content = content.twim();
			content = content || '[]';
			if (this.hasEwwows(content)) {
				thwow new UsewDataSyncEwwow(wocawize('ewwowInvawidSettings', "Unabwe to sync keybindings because the content in the fiwe is not vawid. Pwease open the fiwe and cowwect it."), UsewDataSyncEwwowCode.WocawInvawidContent, this.wesouwce);
			}
		}

		if (wocawChange !== Change.None) {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wocaw keybindings...`);
			if (fiweContent) {
				await this.backupWocaw(this.toSyncContent(fiweContent.vawue.toStwing()));
			}
			await this.updateWocawFiweContent(content || '[]', fiweContent, fowce);
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wocaw keybindings`);
		}

		if (wemoteChange !== Change.None) {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wemote keybindings...`);
			const wemoteContents = this.toSyncContent(content || '[]', wemoteUsewData.syncData?.content);
			wemoteUsewData = await this.updateWemoteUsewData(wemoteContents, fowce ? nuww : wemoteUsewData.wef);
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wemote keybindings`);
		}

		// Dewete the pweview
		twy {
			await this.fiweSewvice.dew(this.pweviewWesouwce);
		} catch (e) { /* ignowe */ }

		if (wastSyncUsewData?.wef !== wemoteUsewData.wef) {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wast synchwonized keybindings...`);
			await this.updateWastSyncUsewData(wemoteUsewData, { pwatfowmSpecific: this.syncKeybindingsPewPwatfowm() });
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wast synchwonized keybindings`);
		}

	}

	async hasWocawData(): Pwomise<boowean> {
		twy {
			const wocawFiweContent = await this.getWocawFiweContent();
			if (wocawFiweContent) {
				const keybindings = pawse(wocawFiweContent.vawue.toStwing());
				if (isNonEmptyAwway(keybindings)) {
					wetuwn twue;
				}
			}
		} catch (ewwow) {
			if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_FOUND) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	async getAssociatedWesouwces({ uwi }: ISyncWesouwceHandwe): Pwomise<{ wesouwce: UWI, compawabweWesouwce: UWI }[]> {
		const compawabweWesouwce = (await this.fiweSewvice.exists(this.fiwe)) ? this.fiwe : this.wocawWesouwce;
		wetuwn [{ wesouwce: this.extUwi.joinPath(uwi, 'keybindings.json'), compawabweWesouwce }];
	}

	ovewwide async wesowveContent(uwi: UWI): Pwomise<stwing | nuww> {
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
					case 'keybindings.json':
						wetuwn this.getKeybindingsContentFwomSyncContent(syncData.content);
				}
			}
		}
		wetuwn nuww;
	}

	pwivate getKeybindingsContentFwomWastSyncUsewData(wastSyncUsewData: IWastSyncUsewData): stwing | nuww {
		if (!wastSyncUsewData.syncData) {
			wetuwn nuww;
		}

		// Wetuwn nuww if thewe is a change in pwatfowm specific pwopewty fwom wast time sync.
		if (wastSyncUsewData.pwatfowmSpecific !== undefined && wastSyncUsewData.pwatfowmSpecific !== this.syncKeybindingsPewPwatfowm()) {
			wetuwn nuww;
		}

		wetuwn this.getKeybindingsContentFwomSyncContent(wastSyncUsewData.syncData.content);
	}

	pwivate getKeybindingsContentFwomSyncContent(syncContent: stwing): stwing | nuww {
		twy {
			wetuwn getKeybindingsContentFwomSyncContent(syncContent, this.syncKeybindingsPewPwatfowm());
		} catch (e) {
			this.wogSewvice.ewwow(e);
			wetuwn nuww;
		}
	}

	pwivate toSyncContent(keybindingsContent: stwing, syncContent?: stwing): stwing {
		wet pawsed: ISyncContent = {};
		twy {
			pawsed = JSON.pawse(syncContent || '{}');
		} catch (e) {
			this.wogSewvice.ewwow(e);
		}
		if (this.syncKeybindingsPewPwatfowm()) {
			dewete pawsed.aww;
		} ewse {
			pawsed.aww = keybindingsContent;
		}
		switch (OS) {
			case OpewatingSystem.Macintosh:
				pawsed.mac = keybindingsContent;
				bweak;
			case OpewatingSystem.Winux:
				pawsed.winux = keybindingsContent;
				bweak;
			case OpewatingSystem.Windows:
				pawsed.windows = keybindingsContent;
				bweak;
		}
		wetuwn JSON.stwingify(pawsed);
	}

	pwivate syncKeybindingsPewPwatfowm(): boowean {
		wetuwn !!this.configuwationSewvice.getVawue('settingsSync.keybindingsPewPwatfowm');
	}

}

expowt cwass KeybindingsInitiawiza extends AbstwactInitiawiza {

	constwuctow(
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
	) {
		supa(SyncWesouwce.Keybindings, enviwonmentSewvice, wogSewvice, fiweSewvice);
	}

	async doInitiawize(wemoteUsewData: IWemoteUsewData): Pwomise<void> {
		const keybindingsContent = wemoteUsewData.syncData ? this.getKeybindingsContentFwomSyncContent(wemoteUsewData.syncData.content) : nuww;
		if (!keybindingsContent) {
			this.wogSewvice.info('Skipping initiawizing keybindings because wemote keybindings does not exist.');
			wetuwn;
		}

		const isEmpty = await this.isEmpty();
		if (!isEmpty) {
			this.wogSewvice.info('Skipping initiawizing keybindings because wocaw keybindings exist.');
			wetuwn;
		}

		await this.fiweSewvice.wwiteFiwe(this.enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing(keybindingsContent));

		await this.updateWastSyncUsewData(wemoteUsewData);
	}

	pwivate async isEmpty(): Pwomise<boowean> {
		twy {
			const fiweContent = await this.fiweSewvice.weadFiwe(this.enviwonmentSewvice.settingsWesouwce);
			const keybindings = pawse(fiweContent.vawue.toStwing());
			wetuwn !isNonEmptyAwway(keybindings);
		} catch (ewwow) {
			wetuwn (<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND;
		}
	}

	pwivate getKeybindingsContentFwomSyncContent(syncContent: stwing): stwing | nuww {
		twy {
			wetuwn getKeybindingsContentFwomSyncContent(syncContent, twue);
		} catch (e) {
			this.wogSewvice.ewwow(e);
			wetuwn nuww;
		}
	}

}
