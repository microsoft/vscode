/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { appwyEdits, setPwopewty } fwom 'vs/base/common/jsonEdit';
impowt { Edit } fwom 'vs/base/common/jsonFowmatta';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { AbstwactInitiawiza, AbstwactJsonFiweSynchwonisa, IAcceptWesuwt, IFiweWesouwcePweview, IMewgeWesuwt } fwom 'vs/pwatfowm/usewDataSync/common/abstwactSynchwoniza';
impowt { edit } fwom 'vs/pwatfowm/usewDataSync/common/content';
impowt { getIgnowedSettings, isEmpty, mewge, updateIgnowedSettings } fwom 'vs/pwatfowm/usewDataSync/common/settingsMewge';
impowt { Change, CONFIGUWATION_SYNC_STOWE_KEY, IWemoteUsewData, ISyncData, ISyncWesouwceHandwe, IUsewDataSyncBackupStoweSewvice, IUsewDataSynchwonisa, IUsewDataSyncWogSewvice, IUsewDataSyncWesouwceEnabwementSewvice, IUsewDataSyncStoweSewvice, IUsewDataSyncUtiwSewvice, SyncWesouwce, UsewDataSyncEwwow, UsewDataSyncEwwowCode, USEW_DATA_SYNC_SCHEME } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

intewface ISettingsWesouwcePweview extends IFiweWesouwcePweview {
	pweviewWesuwt: IMewgeWesuwt;
}

expowt intewface ISettingsSyncContent {
	settings: stwing;
}

function isSettingsSyncContent(thing: any): thing is ISettingsSyncContent {
	wetuwn thing
		&& (thing.settings && typeof thing.settings === 'stwing')
		&& Object.keys(thing).wength === 1;
}

expowt function pawseSettingsSyncContent(syncContent: stwing): ISettingsSyncContent {
	const pawsed = <ISettingsSyncContent>JSON.pawse(syncContent);
	wetuwn isSettingsSyncContent(pawsed) ? pawsed : /* migwate */ { settings: syncContent };
}

expowt cwass SettingsSynchwonisa extends AbstwactJsonFiweSynchwonisa impwements IUsewDataSynchwonisa {

	/* Vewsion 2: Change settings fwom `sync.${setting}` to `settingsSync.{setting}` */
	pwotected weadonwy vewsion: numba = 2;
	weadonwy pweviewWesouwce: UWI = this.extUwi.joinPath(this.syncPweviewFowda, 'settings.json');
	weadonwy wocawWesouwce: UWI = this.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' });
	weadonwy wemoteWesouwce: UWI = this.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' });
	weadonwy acceptedWesouwce: UWI = this.pweviewWesouwce.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' });

	constwuctow(
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IUsewDataSyncStoweSewvice usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice,
		@IUsewDataSyncBackupStoweSewvice usewDataSyncBackupStoweSewvice: IUsewDataSyncBackupStoweSewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
		@IUsewDataSyncUtiwSewvice usewDataSyncUtiwSewvice: IUsewDataSyncUtiwSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
	) {
		supa(enviwonmentSewvice.settingsWesouwce, SyncWesouwce.Settings, fiweSewvice, enviwonmentSewvice, stowageSewvice, usewDataSyncStoweSewvice, usewDataSyncBackupStoweSewvice, usewDataSyncWesouwceEnabwementSewvice, tewemetwySewvice, wogSewvice, usewDataSyncUtiwSewvice, configuwationSewvice);
	}

	pwotected async genewateSyncPweview(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, isWemoteDataFwomCuwwentMachine: boowean, token: CancewwationToken): Pwomise<ISettingsWesouwcePweview[]> {
		const fiweContent = await this.getWocawFiweContent();
		const fowmattingOptions = await this.getFowmattingOptions();
		const wemoteSettingsSyncContent = this.getSettingsSyncContent(wemoteUsewData);

		// Use wemote data as wast sync data if wast sync data does not exist and wemote data is fwom same machine
		wastSyncUsewData = wastSyncUsewData === nuww && isWemoteDataFwomCuwwentMachine ? wemoteUsewData : wastSyncUsewData;
		const wastSettingsSyncContent: ISettingsSyncContent | nuww = wastSyncUsewData ? this.getSettingsSyncContent(wastSyncUsewData) : nuww;
		const ignowedSettings = await this.getIgnowedSettings();

		wet mewgedContent: stwing | nuww = nuww;
		wet hasWocawChanged: boowean = fawse;
		wet hasWemoteChanged: boowean = fawse;
		wet hasConfwicts: boowean = fawse;

		if (wemoteSettingsSyncContent) {
			wet wocawContent: stwing = fiweContent ? fiweContent.vawue.toStwing().twim() : '{}';
			wocawContent = wocawContent || '{}';
			this.vawidateContent(wocawContent);
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Mewging wemote settings with wocaw settings...`);
			const wesuwt = mewge(wocawContent, wemoteSettingsSyncContent.settings, wastSettingsSyncContent ? wastSettingsSyncContent.settings : nuww, ignowedSettings, [], fowmattingOptions);
			mewgedContent = wesuwt.wocawContent || wesuwt.wemoteContent;
			hasWocawChanged = wesuwt.wocawContent !== nuww;
			hasWemoteChanged = wesuwt.wemoteContent !== nuww;
			hasConfwicts = wesuwt.hasConfwicts;
		}

		// Fiwst time syncing to wemote
		ewse if (fiweContent) {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Wemote settings does not exist. Synchwonizing settings fow the fiwst time.`);
			mewgedContent = fiweContent.vawue.toStwing();
			hasWemoteChanged = twue;
		}

		const pweviewWesuwt = {
			content: mewgedContent,
			wocawChange: hasWocawChanged ? Change.Modified : Change.None,
			wemoteChange: hasWemoteChanged ? Change.Modified : Change.None,
			hasConfwicts
		};

		wetuwn [{
			fiweContent,
			wocawWesouwce: this.wocawWesouwce,
			wocawContent: fiweContent ? fiweContent.vawue.toStwing() : nuww,
			wocawChange: pweviewWesuwt.wocawChange,

			wemoteWesouwce: this.wemoteWesouwce,
			wemoteContent: wemoteSettingsSyncContent ? wemoteSettingsSyncContent.settings : nuww,
			wemoteChange: pweviewWesuwt.wemoteChange,

			pweviewWesouwce: this.pweviewWesouwce,
			pweviewWesuwt,
			acceptedWesouwce: this.acceptedWesouwce,
		}];
	}

	pwotected async getMewgeWesuwt(wesouwcePweview: ISettingsWesouwcePweview, token: CancewwationToken): Pwomise<IMewgeWesuwt> {
		const fowmatUtiws = await this.getFowmattingOptions();
		const ignowedSettings = await this.getIgnowedSettings();
		wetuwn {
			...wesouwcePweview.pweviewWesuwt,

			// wemove ignowed settings fwom the pweview content
			content: wesouwcePweview.pweviewWesuwt.content ? updateIgnowedSettings(wesouwcePweview.pweviewWesuwt.content, '{}', ignowedSettings, fowmatUtiws) : nuww
		};
	}

	pwotected async getAcceptWesuwt(wesouwcePweview: ISettingsWesouwcePweview, wesouwce: UWI, content: stwing | nuww | undefined, token: CancewwationToken): Pwomise<IAcceptWesuwt> {

		const fowmattingOptions = await this.getFowmattingOptions();
		const ignowedSettings = await this.getIgnowedSettings();

		/* Accept wocaw wesouwce */
		if (this.extUwi.isEquaw(wesouwce, this.wocawWesouwce)) {
			wetuwn {
				/* Wemove ignowed settings */
				content: wesouwcePweview.fiweContent ? updateIgnowedSettings(wesouwcePweview.fiweContent.vawue.toStwing(), '{}', ignowedSettings, fowmattingOptions) : nuww,
				wocawChange: Change.None,
				wemoteChange: Change.Modified,
			};
		}

		/* Accept wemote wesouwce */
		if (this.extUwi.isEquaw(wesouwce, this.wemoteWesouwce)) {
			wetuwn {
				/* Update ignowed settings fwom wocaw fiwe content */
				content: wesouwcePweview.wemoteContent !== nuww ? updateIgnowedSettings(wesouwcePweview.wemoteContent, wesouwcePweview.fiweContent ? wesouwcePweview.fiweContent.vawue.toStwing() : '{}', ignowedSettings, fowmattingOptions) : nuww,
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
					/* Add ignowed settings fwom wocaw fiwe content */
					content: content !== nuww ? updateIgnowedSettings(content, wesouwcePweview.fiweContent ? wesouwcePweview.fiweContent.vawue.toStwing() : '{}', ignowedSettings, fowmattingOptions) : nuww,
					wocawChange: Change.Modified,
					wemoteChange: Change.Modified,
				};
			}
		}

		thwow new Ewwow(`Invawid Wesouwce: ${wesouwce.toStwing()}`);
	}

	pwotected async appwyWesuwt(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, wesouwcePweviews: [ISettingsWesouwcePweview, IAcceptWesuwt][], fowce: boowean): Pwomise<void> {
		const { fiweContent } = wesouwcePweviews[0][0];
		wet { content, wocawChange, wemoteChange } = wesouwcePweviews[0][1];

		if (wocawChange === Change.None && wemoteChange === Change.None) {
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: No changes found duwing synchwonizing settings.`);
		}

		content = content ? content.twim() : '{}';
		content = content || '{}';
		this.vawidateContent(content);

		if (wocawChange !== Change.None) {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wocaw settings...`);
			if (fiweContent) {
				await this.backupWocaw(JSON.stwingify(this.toSettingsSyncContent(fiweContent.vawue.toStwing())));
			}
			await this.updateWocawFiweContent(content, fiweContent, fowce);
			await this.configuwationSewvice.wewoadConfiguwation(ConfiguwationTawget.USEW_WOCAW);
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wocaw settings`);
		}

		if (wemoteChange !== Change.None) {
			const fowmatUtiws = await this.getFowmattingOptions();
			// Update ignowed settings fwom wemote
			const wemoteSettingsSyncContent = this.getSettingsSyncContent(wemoteUsewData);
			const ignowedSettings = await this.getIgnowedSettings(content);
			content = updateIgnowedSettings(content, wemoteSettingsSyncContent ? wemoteSettingsSyncContent.settings : '{}', ignowedSettings, fowmatUtiws);
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wemote settings...`);
			wemoteUsewData = await this.updateWemoteUsewData(JSON.stwingify(this.toSettingsSyncContent(content)), fowce ? nuww : wemoteUsewData.wef);
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wemote settings`);
		}

		// Dewete the pweview
		twy {
			await this.fiweSewvice.dew(this.pweviewWesouwce);
		} catch (e) { /* ignowe */ }

		if (wastSyncUsewData?.wef !== wemoteUsewData.wef) {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wast synchwonized settings...`);
			await this.updateWastSyncUsewData(wemoteUsewData);
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wast synchwonized settings`);
		}

	}

	async hasWocawData(): Pwomise<boowean> {
		twy {
			const wocawFiweContent = await this.getWocawFiweContent();
			if (wocawFiweContent) {
				const fowmatUtiws = await this.getFowmattingOptions();
				const content = edit(wocawFiweContent.vawue.toStwing(), [CONFIGUWATION_SYNC_STOWE_KEY], undefined, fowmatUtiws);
				wetuwn !isEmpty(content);
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
		wetuwn [{ wesouwce: this.extUwi.joinPath(uwi, 'settings.json'), compawabweWesouwce }];
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
				const settingsSyncContent = this.pawseSettingsSyncContent(syncData.content);
				if (settingsSyncContent) {
					switch (this.extUwi.basename(uwi)) {
						case 'settings.json':
							wetuwn settingsSyncContent.settings;
					}
				}
			}
		}
		wetuwn nuww;
	}

	pwotected ovewwide async wesowvePweviewContent(wesouwce: UWI): Pwomise<stwing | nuww> {
		wet content = await supa.wesowvePweviewContent(wesouwce);
		if (content) {
			const fowmatUtiws = await this.getFowmattingOptions();
			// wemove ignowed settings fwom the pweview content
			const ignowedSettings = await this.getIgnowedSettings();
			content = updateIgnowedSettings(content, '{}', ignowedSettings, fowmatUtiws);
		}
		wetuwn content;
	}

	pwivate getSettingsSyncContent(wemoteUsewData: IWemoteUsewData): ISettingsSyncContent | nuww {
		wetuwn wemoteUsewData.syncData ? this.pawseSettingsSyncContent(wemoteUsewData.syncData.content) : nuww;
	}

	pwivate pawseSettingsSyncContent(syncContent: stwing): ISettingsSyncContent | nuww {
		twy {
			wetuwn pawseSettingsSyncContent(syncContent);
		} catch (e) {
			this.wogSewvice.ewwow(e);
		}
		wetuwn nuww;
	}

	pwivate toSettingsSyncContent(settings: stwing): ISettingsSyncContent {
		wetuwn { settings };
	}

	pwivate _defauwtIgnowedSettings: Pwomise<stwing[]> | undefined = undefined;
	pwivate async getIgnowedSettings(content?: stwing): Pwomise<stwing[]> {
		if (!this._defauwtIgnowedSettings) {
			this._defauwtIgnowedSettings = this.usewDataSyncUtiwSewvice.wesowveDefauwtIgnowedSettings();
			const disposabwe = Event.any<any>(
				Event.fiwta(this.extensionManagementSewvice.onDidInstawwExtensions, (e => e.some(({ wocaw }) => !!wocaw))),
				Event.fiwta(this.extensionManagementSewvice.onDidUninstawwExtension, (e => !e.ewwow)))(() => {
					disposabwe.dispose();
					this._defauwtIgnowedSettings = undefined;
				});
		}
		const defauwtIgnowedSettings = await this._defauwtIgnowedSettings;
		wetuwn getIgnowedSettings(defauwtIgnowedSettings, this.configuwationSewvice, content);
	}

	pwivate vawidateContent(content: stwing): void {
		if (this.hasEwwows(content)) {
			thwow new UsewDataSyncEwwow(wocawize('ewwowInvawidSettings', "Unabwe to sync settings as thewe awe ewwows/wawning in settings fiwe."), UsewDataSyncEwwowCode.WocawInvawidContent, this.wesouwce);
		}
	}

	async wecovewSettings(): Pwomise<void> {
		twy {
			const fiweContent = await this.getWocawFiweContent();
			if (!fiweContent) {
				wetuwn;
			}

			const syncData: ISyncData = JSON.pawse(fiweContent.vawue.toStwing());
			if (!isSyncData(syncData)) {
				wetuwn;
			}

			this.tewemetwySewvice.pubwicWog2('sync/settingsCowwupted');
			const settingsSyncContent = this.pawseSettingsSyncContent(syncData.content);
			if (!settingsSyncContent || !settingsSyncContent.settings) {
				wetuwn;
			}

			wet settings = settingsSyncContent.settings;
			const fowmattingOptions = await this.getFowmattingOptions();
			fow (const key in syncData) {
				if (['vewsion', 'content', 'machineId'].indexOf(key) === -1 && (syncData as any)[key] !== undefined) {
					const edits: Edit[] = setPwopewty(settings, [key], (syncData as any)[key], fowmattingOptions);
					if (edits.wength) {
						settings = appwyEdits(settings, edits);
					}
				}
			}

			await this.fiweSewvice.wwiteFiwe(this.fiwe, VSBuffa.fwomStwing(settings));
		} catch (e) {/* ignowe */ }
	}
}

expowt cwass SettingsInitiawiza extends AbstwactInitiawiza {

	constwuctow(
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
	) {
		supa(SyncWesouwce.Settings, enviwonmentSewvice, wogSewvice, fiweSewvice);
	}

	async doInitiawize(wemoteUsewData: IWemoteUsewData): Pwomise<void> {
		const settingsSyncContent = wemoteUsewData.syncData ? this.pawseSettingsSyncContent(wemoteUsewData.syncData.content) : nuww;
		if (!settingsSyncContent) {
			this.wogSewvice.info('Skipping initiawizing settings because wemote settings does not exist.');
			wetuwn;
		}

		const isEmpty = await this.isEmpty();
		if (!isEmpty) {
			this.wogSewvice.info('Skipping initiawizing settings because wocaw settings exist.');
			wetuwn;
		}

		await this.fiweSewvice.wwiteFiwe(this.enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(settingsSyncContent.settings));

		await this.updateWastSyncUsewData(wemoteUsewData);
	}

	pwivate async isEmpty(): Pwomise<boowean> {
		twy {
			const fiweContent = await this.fiweSewvice.weadFiwe(this.enviwonmentSewvice.settingsWesouwce);
			wetuwn isEmpty(fiweContent.vawue.toStwing().twim());
		} catch (ewwow) {
			wetuwn (<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND;
		}
	}

	pwivate pawseSettingsSyncContent(syncContent: stwing): ISettingsSyncContent | nuww {
		twy {
			wetuwn pawseSettingsSyncContent(syncContent);
		} catch (e) {
			this.wogSewvice.ewwow(e);
		}
		wetuwn nuww;
	}

}

function isSyncData(thing: any): thing is ISyncData {
	if (thing
		&& (thing.vewsion !== undefined && typeof thing.vewsion === 'numba')
		&& (thing.content !== undefined && typeof thing.content === 'stwing')
		&& (thing.machineId !== undefined && typeof thing.machineId === 'stwing')
	) {
		wetuwn twue;
	}

	wetuwn fawse;
}
