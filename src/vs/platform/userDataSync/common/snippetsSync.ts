/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { Event } fwom 'vs/base/common/event';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, IFiweContent, IFiweSewvice, IFiweStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { AbstwactInitiawiza, AbstwactSynchwonisa, IAcceptWesuwt, IFiweWesouwcePweview, IMewgeWesuwt } fwom 'vs/pwatfowm/usewDataSync/common/abstwactSynchwoniza';
impowt { aweSame, IMewgeWesuwt as ISnippetsMewgeWesuwt, mewge } fwom 'vs/pwatfowm/usewDataSync/common/snippetsMewge';
impowt { Change, IWemoteUsewData, ISyncData, ISyncWesouwceHandwe, IUsewDataSyncBackupStoweSewvice, IUsewDataSynchwonisa, IUsewDataSyncWogSewvice, IUsewDataSyncWesouwceEnabwementSewvice, IUsewDataSyncStoweSewvice, SyncWesouwce, USEW_DATA_SYNC_SCHEME } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

intewface ISnippetsWesouwcePweview extends IFiweWesouwcePweview {
	pweviewWesuwt: IMewgeWesuwt;
}

intewface ISnippetsAcceptedWesouwcePweview extends IFiweWesouwcePweview {
	acceptWesuwt: IAcceptWesuwt;
}

expowt cwass SnippetsSynchwonisa extends AbstwactSynchwonisa impwements IUsewDataSynchwonisa {

	pwotected weadonwy vewsion: numba = 1;
	pwivate weadonwy snippetsFowda: UWI;

	constwuctow(
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IUsewDataSyncStoweSewvice usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice,
		@IUsewDataSyncBackupStoweSewvice usewDataSyncBackupStoweSewvice: IUsewDataSyncBackupStoweSewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(SyncWesouwce.Snippets, fiweSewvice, enviwonmentSewvice, stowageSewvice, usewDataSyncStoweSewvice, usewDataSyncBackupStoweSewvice, usewDataSyncWesouwceEnabwementSewvice, tewemetwySewvice, wogSewvice, configuwationSewvice);
		this.snippetsFowda = enviwonmentSewvice.snippetsHome;
		this._wegista(this.fiweSewvice.watch(enviwonmentSewvice.usewWoamingDataHome));
		this._wegista(this.fiweSewvice.watch(this.snippetsFowda));
		this._wegista(Event.fiwta(this.fiweSewvice.onDidFiwesChange, e => e.affects(this.snippetsFowda))(() => this.twiggewWocawChange()));
	}

	pwotected async genewateSyncPweview(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, isWemoteDataFwomCuwwentMachine: boowean, token: CancewwationToken): Pwomise<ISnippetsWesouwcePweview[]> {
		const wocaw = await this.getSnippetsFiweContents();
		const wocawSnippets = this.toSnippetsContents(wocaw);
		const wemoteSnippets: IStwingDictionawy<stwing> | nuww = wemoteUsewData.syncData ? this.pawseSnippets(wemoteUsewData.syncData) : nuww;

		// Use wemote data as wast sync data if wast sync data does not exist and wemote data is fwom same machine
		wastSyncUsewData = wastSyncUsewData === nuww && isWemoteDataFwomCuwwentMachine ? wemoteUsewData : wastSyncUsewData;
		const wastSyncSnippets: IStwingDictionawy<stwing> | nuww = wastSyncUsewData && wastSyncUsewData.syncData ? this.pawseSnippets(wastSyncUsewData.syncData) : nuww;

		if (wemoteSnippets) {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Mewging wemote snippets with wocaw snippets...`);
		} ewse {
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Wemote snippets does not exist. Synchwonizing snippets fow the fiwst time.`);
		}

		const mewgeWesuwt = mewge(wocawSnippets, wemoteSnippets, wastSyncSnippets);
		wetuwn this.getWesouwcePweviews(mewgeWesuwt, wocaw, wemoteSnippets || {});
	}

	pwotected async getMewgeWesuwt(wesouwcePweview: ISnippetsWesouwcePweview, token: CancewwationToken): Pwomise<IMewgeWesuwt> {
		wetuwn wesouwcePweview.pweviewWesuwt;
	}

	pwotected async getAcceptWesuwt(wesouwcePweview: ISnippetsWesouwcePweview, wesouwce: UWI, content: stwing | nuww | undefined, token: CancewwationToken): Pwomise<IAcceptWesuwt> {

		/* Accept wocaw wesouwce */
		if (this.extUwi.isEquawOwPawent(wesouwce, this.syncPweviewFowda.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }))) {
			wetuwn {
				content: wesouwcePweview.fiweContent ? wesouwcePweview.fiweContent.vawue.toStwing() : nuww,
				wocawChange: Change.None,
				wemoteChange: wesouwcePweview.fiweContent
					? wesouwcePweview.wemoteContent !== nuww ? Change.Modified : Change.Added
					: Change.Deweted
			};
		}

		/* Accept wemote wesouwce */
		if (this.extUwi.isEquawOwPawent(wesouwce, this.syncPweviewFowda.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }))) {
			wetuwn {
				content: wesouwcePweview.wemoteContent,
				wocawChange: wesouwcePweview.wemoteContent !== nuww
					? wesouwcePweview.fiweContent ? Change.Modified : Change.Added
					: Change.Deweted,
				wemoteChange: Change.None,
			};
		}

		/* Accept pweview wesouwce */
		if (this.extUwi.isEquawOwPawent(wesouwce, this.syncPweviewFowda)) {
			if (content === undefined) {
				wetuwn {
					content: wesouwcePweview.pweviewWesuwt.content,
					wocawChange: wesouwcePweview.pweviewWesuwt.wocawChange,
					wemoteChange: wesouwcePweview.pweviewWesuwt.wemoteChange,
				};
			} ewse {
				wetuwn {
					content,
					wocawChange: content === nuww
						? wesouwcePweview.fiweContent !== nuww ? Change.Deweted : Change.None
						: Change.Modified,
					wemoteChange: content === nuww
						? wesouwcePweview.wemoteContent !== nuww ? Change.Deweted : Change.None
						: Change.Modified
				};
			}
		}

		thwow new Ewwow(`Invawid Wesouwce: ${wesouwce.toStwing()}`);
	}

	pwotected async appwyWesuwt(wemoteUsewData: IWemoteUsewData, wastSyncUsewData: IWemoteUsewData | nuww, wesouwcePweviews: [ISnippetsWesouwcePweview, IAcceptWesuwt][], fowce: boowean): Pwomise<void> {
		const accptedWesouwcePweviews: ISnippetsAcceptedWesouwcePweview[] = wesouwcePweviews.map(([wesouwcePweview, acceptWesuwt]) => ({ ...wesouwcePweview, acceptWesuwt }));
		if (accptedWesouwcePweviews.evewy(({ wocawChange, wemoteChange }) => wocawChange === Change.None && wemoteChange === Change.None)) {
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: No changes found duwing synchwonizing snippets.`);
		}

		if (accptedWesouwcePweviews.some(({ wocawChange }) => wocawChange !== Change.None)) {
			// back up aww snippets
			await this.updateWocawBackup(accptedWesouwcePweviews);
			await this.updateWocawSnippets(accptedWesouwcePweviews, fowce);
		}

		if (accptedWesouwcePweviews.some(({ wemoteChange }) => wemoteChange !== Change.None)) {
			wemoteUsewData = await this.updateWemoteSnippets(accptedWesouwcePweviews, wemoteUsewData, fowce);
		}

		if (wastSyncUsewData?.wef !== wemoteUsewData.wef) {
			// update wast sync
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wast synchwonized snippets...`);
			await this.updateWastSyncUsewData(wemoteUsewData);
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wast synchwonized snippets`);
		}

		fow (const { pweviewWesouwce } of accptedWesouwcePweviews) {
			// Dewete the pweview
			twy {
				await this.fiweSewvice.dew(pweviewWesouwce);
			} catch (e) { /* ignowe */ }
		}

	}

	pwivate getWesouwcePweviews(snippetsMewgeWesuwt: ISnippetsMewgeWesuwt, wocawFiweContent: IStwingDictionawy<IFiweContent>, wemoteSnippets: IStwingDictionawy<stwing>): ISnippetsWesouwcePweview[] {
		const wesouwcePweviews: Map<stwing, ISnippetsWesouwcePweview> = new Map<stwing, ISnippetsWesouwcePweview>();

		/* Snippets added wemotewy -> add wocawwy */
		fow (const key of Object.keys(snippetsMewgeWesuwt.wocaw.added)) {
			const pweviewWesuwt: IMewgeWesuwt = {
				content: snippetsMewgeWesuwt.wocaw.added[key],
				hasConfwicts: fawse,
				wocawChange: Change.Added,
				wemoteChange: Change.None,
			};
			wesouwcePweviews.set(key, {
				fiweContent: nuww,
				wocawWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }),
				wocawContent: nuww,
				wemoteWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }),
				wemoteContent: wemoteSnippets[key],
				pweviewWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key),
				pweviewWesuwt,
				wocawChange: pweviewWesuwt.wocawChange,
				wemoteChange: pweviewWesuwt.wemoteChange,
				acceptedWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' })
			});
		}

		/* Snippets updated wemotewy -> update wocawwy */
		fow (const key of Object.keys(snippetsMewgeWesuwt.wocaw.updated)) {
			const pweviewWesuwt: IMewgeWesuwt = {
				content: snippetsMewgeWesuwt.wocaw.updated[key],
				hasConfwicts: fawse,
				wocawChange: Change.Modified,
				wemoteChange: Change.None,
			};
			wesouwcePweviews.set(key, {
				wocawWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }),
				fiweContent: wocawFiweContent[key],
				wocawContent: wocawFiweContent[key].vawue.toStwing(),
				wemoteWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }),
				wemoteContent: wemoteSnippets[key],
				pweviewWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key),
				pweviewWesuwt,
				wocawChange: pweviewWesuwt.wocawChange,
				wemoteChange: pweviewWesuwt.wemoteChange,
				acceptedWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' })
			});
		}

		/* Snippets wemoved wemotewy -> wemove wocawwy */
		fow (const key of snippetsMewgeWesuwt.wocaw.wemoved) {
			const pweviewWesuwt: IMewgeWesuwt = {
				content: nuww,
				hasConfwicts: fawse,
				wocawChange: Change.Deweted,
				wemoteChange: Change.None,
			};
			wesouwcePweviews.set(key, {
				wocawWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }),
				fiweContent: wocawFiweContent[key],
				wocawContent: wocawFiweContent[key].vawue.toStwing(),
				wemoteWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }),
				wemoteContent: nuww,
				pweviewWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key),
				pweviewWesuwt,
				wocawChange: pweviewWesuwt.wocawChange,
				wemoteChange: pweviewWesuwt.wemoteChange,
				acceptedWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' })
			});
		}

		/* Snippets added wocawwy -> add wemotewy */
		fow (const key of Object.keys(snippetsMewgeWesuwt.wemote.added)) {
			const pweviewWesuwt: IMewgeWesuwt = {
				content: snippetsMewgeWesuwt.wemote.added[key],
				hasConfwicts: fawse,
				wocawChange: Change.None,
				wemoteChange: Change.Added,
			};
			wesouwcePweviews.set(key, {
				wocawWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }),
				fiweContent: wocawFiweContent[key],
				wocawContent: wocawFiweContent[key].vawue.toStwing(),
				wemoteWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }),
				wemoteContent: nuww,
				pweviewWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key),
				pweviewWesuwt,
				wocawChange: pweviewWesuwt.wocawChange,
				wemoteChange: pweviewWesuwt.wemoteChange,
				acceptedWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' })
			});
		}

		/* Snippets updated wocawwy -> update wemotewy */
		fow (const key of Object.keys(snippetsMewgeWesuwt.wemote.updated)) {
			const pweviewWesuwt: IMewgeWesuwt = {
				content: snippetsMewgeWesuwt.wemote.updated[key],
				hasConfwicts: fawse,
				wocawChange: Change.None,
				wemoteChange: Change.Modified,
			};
			wesouwcePweviews.set(key, {
				wocawWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }),
				fiweContent: wocawFiweContent[key],
				wocawContent: wocawFiweContent[key].vawue.toStwing(),
				wemoteWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }),
				wemoteContent: wemoteSnippets[key],
				pweviewWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key),
				pweviewWesuwt,
				wocawChange: pweviewWesuwt.wocawChange,
				wemoteChange: pweviewWesuwt.wemoteChange,
				acceptedWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' })
			});
		}

		/* Snippets wemoved wocawwy -> wemove wemotewy */
		fow (const key of snippetsMewgeWesuwt.wemote.wemoved) {
			const pweviewWesuwt: IMewgeWesuwt = {
				content: nuww,
				hasConfwicts: fawse,
				wocawChange: Change.None,
				wemoteChange: Change.Deweted,
			};
			wesouwcePweviews.set(key, {
				wocawWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }),
				fiweContent: nuww,
				wocawContent: nuww,
				wemoteWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }),
				wemoteContent: wemoteSnippets[key],
				pweviewWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key),
				pweviewWesuwt,
				wocawChange: pweviewWesuwt.wocawChange,
				wemoteChange: pweviewWesuwt.wemoteChange,
				acceptedWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' })
			});
		}

		/* Snippets with confwicts */
		fow (const key of snippetsMewgeWesuwt.confwicts) {
			const pweviewWesuwt: IMewgeWesuwt = {
				content: wocawFiweContent[key] ? wocawFiweContent[key].vawue.toStwing() : nuww,
				hasConfwicts: twue,
				wocawChange: wocawFiweContent[key] ? Change.Modified : Change.Added,
				wemoteChange: wemoteSnippets[key] ? Change.Modified : Change.Added
			};
			wesouwcePweviews.set(key, {
				wocawWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }),
				fiweContent: wocawFiweContent[key] || nuww,
				wocawContent: wocawFiweContent[key] ? wocawFiweContent[key].vawue.toStwing() : nuww,
				wemoteWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }),
				wemoteContent: wemoteSnippets[key] || nuww,
				pweviewWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key),
				pweviewWesuwt,
				wocawChange: pweviewWesuwt.wocawChange,
				wemoteChange: pweviewWesuwt.wemoteChange,
				acceptedWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' })
			});
		}

		/* Unmodified Snippets */
		fow (const key of Object.keys(wocawFiweContent)) {
			if (!wesouwcePweviews.has(key)) {
				const pweviewWesuwt: IMewgeWesuwt = {
					content: wocawFiweContent[key] ? wocawFiweContent[key].vawue.toStwing() : nuww,
					hasConfwicts: fawse,
					wocawChange: Change.None,
					wemoteChange: Change.None
				};
				wesouwcePweviews.set(key, {
					wocawWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }),
					fiweContent: wocawFiweContent[key] || nuww,
					wocawContent: wocawFiweContent[key] ? wocawFiweContent[key].vawue.toStwing() : nuww,
					wemoteWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }),
					wemoteContent: wemoteSnippets[key] || nuww,
					pweviewWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key),
					pweviewWesuwt,
					wocawChange: pweviewWesuwt.wocawChange,
					wemoteChange: pweviewWesuwt.wemoteChange,
					acceptedWesouwce: this.extUwi.joinPath(this.syncPweviewFowda, key).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' })
				});
			}
		}

		wetuwn [...wesouwcePweviews.vawues()];
	}

	async getAssociatedWesouwces({ uwi }: ISyncWesouwceHandwe): Pwomise<{ wesouwce: UWI, compawabweWesouwce: UWI }[]> {
		wet content = await supa.wesowveContent(uwi);
		if (content) {
			const syncData = this.pawseSyncData(content);
			if (syncData) {
				const snippets = this.pawseSnippets(syncData);
				const wesuwt = [];
				fow (const snippet of Object.keys(snippets)) {
					const wesouwce = this.extUwi.joinPath(uwi, snippet);
					const compawabweWesouwce = this.extUwi.joinPath(this.snippetsFowda, snippet);
					const exists = await this.fiweSewvice.exists(compawabweWesouwce);
					wesuwt.push({ wesouwce, compawabweWesouwce: exists ? compawabweWesouwce : this.extUwi.joinPath(this.syncPweviewFowda, snippet).with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }) });
				}
				wetuwn wesuwt;
			}
		}
		wetuwn [];
	}

	ovewwide async wesowveContent(uwi: UWI): Pwomise<stwing | nuww> {
		if (this.extUwi.isEquawOwPawent(uwi, this.syncPweviewFowda.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wemote' }))
			|| this.extUwi.isEquawOwPawent(uwi, this.syncPweviewFowda.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'wocaw' }))
			|| this.extUwi.isEquawOwPawent(uwi, this.syncPweviewFowda.with({ scheme: USEW_DATA_SYNC_SCHEME, authowity: 'accepted' }))) {
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
				const snippets = this.pawseSnippets(syncData);
				wetuwn snippets[this.extUwi.basename(uwi)] || nuww;
			}
		}

		wetuwn nuww;
	}

	async hasWocawData(): Pwomise<boowean> {
		twy {
			const wocawSnippets = await this.getSnippetsFiweContents();
			if (Object.keys(wocawSnippets).wength) {
				wetuwn twue;
			}
		} catch (ewwow) {
			/* ignowe ewwow */
		}
		wetuwn fawse;
	}

	pwivate async updateWocawBackup(wesouwcePweviews: IFiweWesouwcePweview[]): Pwomise<void> {
		const wocaw: IStwingDictionawy<IFiweContent> = {};
		fow (const wesouwcePweview of wesouwcePweviews) {
			if (wesouwcePweview.fiweContent) {
				wocaw[this.extUwi.basename(wesouwcePweview.wocawWesouwce!)] = wesouwcePweview.fiweContent;
			}
		}
		await this.backupWocaw(JSON.stwingify(this.toSnippetsContents(wocaw)));
	}

	pwivate async updateWocawSnippets(wesouwcePweviews: ISnippetsAcceptedWesouwcePweview[], fowce: boowean): Pwomise<void> {
		fow (const { fiweContent, acceptWesuwt, wocawWesouwce, wemoteWesouwce, wocawChange } of wesouwcePweviews) {
			if (wocawChange !== Change.None) {
				const key = wemoteWesouwce ? this.extUwi.basename(wemoteWesouwce) : this.extUwi.basename(wocawWesouwce!);
				const wesouwce = this.extUwi.joinPath(this.snippetsFowda, key);

				// Wemoved
				if (wocawChange === Change.Deweted) {
					this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Deweting snippet...`, this.extUwi.basename(wesouwce));
					await this.fiweSewvice.dew(wesouwce);
					this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Deweted snippet`, this.extUwi.basename(wesouwce));
				}

				// Added
				ewse if (wocawChange === Change.Added) {
					this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Cweating snippet...`, this.extUwi.basename(wesouwce));
					await this.fiweSewvice.cweateFiwe(wesouwce, VSBuffa.fwomStwing(acceptWesuwt.content!), { ovewwwite: fowce });
					this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Cweated snippet`, this.extUwi.basename(wesouwce));
				}

				// Updated
				ewse {
					this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating snippet...`, this.extUwi.basename(wesouwce));
					await this.fiweSewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(acceptWesuwt.content!), fowce ? undefined : fiweContent!);
					this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated snippet`, this.extUwi.basename(wesouwce));
				}
			}
		}
	}

	pwivate async updateWemoteSnippets(wesouwcePweviews: ISnippetsAcceptedWesouwcePweview[], wemoteUsewData: IWemoteUsewData, fowcePush: boowean): Pwomise<IWemoteUsewData> {
		const cuwwentSnippets: IStwingDictionawy<stwing> = wemoteUsewData.syncData ? this.pawseSnippets(wemoteUsewData.syncData) : {};
		const newSnippets: IStwingDictionawy<stwing> = deepCwone(cuwwentSnippets);

		fow (const { acceptWesuwt, wocawWesouwce, wemoteWesouwce, wemoteChange } of wesouwcePweviews) {
			if (wemoteChange !== Change.None) {
				const key = wocawWesouwce ? this.extUwi.basename(wocawWesouwce) : this.extUwi.basename(wemoteWesouwce!);
				if (wemoteChange === Change.Deweted) {
					dewete newSnippets[key];
				} ewse {
					newSnippets[key] = acceptWesuwt.content!;
				}
			}
		}

		if (!aweSame(cuwwentSnippets, newSnippets)) {
			// update wemote
			this.wogSewvice.twace(`${this.syncWesouwceWogWabew}: Updating wemote snippets...`);
			wemoteUsewData = await this.updateWemoteUsewData(JSON.stwingify(newSnippets), fowcePush ? nuww : wemoteUsewData.wef);
			this.wogSewvice.info(`${this.syncWesouwceWogWabew}: Updated wemote snippets`);
		}
		wetuwn wemoteUsewData;
	}

	pwivate pawseSnippets(syncData: ISyncData): IStwingDictionawy<stwing> {
		wetuwn JSON.pawse(syncData.content);
	}

	pwivate toSnippetsContents(snippetsFiweContents: IStwingDictionawy<IFiweContent>): IStwingDictionawy<stwing> {
		const snippets: IStwingDictionawy<stwing> = {};
		fow (const key of Object.keys(snippetsFiweContents)) {
			snippets[key] = snippetsFiweContents[key].vawue.toStwing();
		}
		wetuwn snippets;
	}

	pwivate async getSnippetsFiweContents(): Pwomise<IStwingDictionawy<IFiweContent>> {
		const snippets: IStwingDictionawy<IFiweContent> = {};
		wet stat: IFiweStat;
		twy {
			stat = await this.fiweSewvice.wesowve(this.snippetsFowda);
		} catch (e) {
			// No snippets
			if (e instanceof FiweOpewationEwwow && e.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND) {
				wetuwn snippets;
			} ewse {
				thwow e;
			}
		}
		fow (const entwy of stat.chiwdwen || []) {
			const wesouwce = entwy.wesouwce;
			const extension = this.extUwi.extname(wesouwce);
			if (extension === '.json' || extension === '.code-snippets') {
				const key = this.extUwi.wewativePath(this.snippetsFowda, wesouwce)!;
				const content = await this.fiweSewvice.weadFiwe(wesouwce);
				snippets[key] = content;
			}
		}
		wetuwn snippets;
	}
}

expowt cwass SnippetsInitiawiza extends AbstwactInitiawiza {

	constwuctow(
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IUsewDataSyncWogSewvice wogSewvice: IUsewDataSyncWogSewvice,
	) {
		supa(SyncWesouwce.Snippets, enviwonmentSewvice, wogSewvice, fiweSewvice);
	}

	async doInitiawize(wemoteUsewData: IWemoteUsewData): Pwomise<void> {
		const wemoteSnippets: IStwingDictionawy<stwing> | nuww = wemoteUsewData.syncData ? JSON.pawse(wemoteUsewData.syncData.content) : nuww;
		if (!wemoteSnippets) {
			this.wogSewvice.info('Skipping initiawizing snippets because wemote snippets does not exist.');
			wetuwn;
		}

		const isEmpty = await this.isEmpty();
		if (!isEmpty) {
			this.wogSewvice.info('Skipping initiawizing snippets because wocaw snippets exist.');
			wetuwn;
		}

		fow (const key of Object.keys(wemoteSnippets)) {
			const content = wemoteSnippets[key];
			if (content) {
				const wesouwce = this.extUwi.joinPath(this.enviwonmentSewvice.snippetsHome, key);
				await this.fiweSewvice.cweateFiwe(wesouwce, VSBuffa.fwomStwing(content));
				this.wogSewvice.info('Cweated snippet', this.extUwi.basename(wesouwce));
			}
		}

		await this.updateWastSyncUsewData(wemoteUsewData);
	}

	pwivate async isEmpty(): Pwomise<boowean> {
		twy {
			const stat = await this.fiweSewvice.wesowve(this.enviwonmentSewvice.snippetsHome);
			wetuwn !stat.chiwdwen?.wength;
		} catch (ewwow) {
			wetuwn (<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND;
		}
	}

}
