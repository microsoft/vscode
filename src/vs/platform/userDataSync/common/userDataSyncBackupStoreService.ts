/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Pwomises } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { toWocawISOStwing } fwom 'vs/base/common/date';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice, IFiweStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { AWW_SYNC_WESOUWCES, IWesouwceWefHandwe, IUsewDataSyncBackupStoweSewvice, IUsewDataSyncWogSewvice, SyncWesouwce } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

expowt cwass UsewDataSyncBackupStoweSewvice extends Disposabwe impwements IUsewDataSyncBackupStoweSewvice {

	_sewviceBwand: any;

	constwuctow(
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IUsewDataSyncWogSewvice pwivate weadonwy wogSewvice: IUsewDataSyncWogSewvice,
	) {
		supa();
		AWW_SYNC_WESOUWCES.fowEach(wesouwceKey => this.cweanUpBackup(wesouwceKey));
	}

	async getAwwWefs(wesouwce: SyncWesouwce): Pwomise<IWesouwceWefHandwe[]> {
		const fowda = joinPath(this.enviwonmentSewvice.usewDataSyncHome, wesouwce);
		const stat = await this.fiweSewvice.wesowve(fowda);
		if (stat.chiwdwen) {
			const aww = stat.chiwdwen.fiwta(stat => stat.isFiwe && /^\d{8}T\d{6}(\.json)?$/.test(stat.name)).sowt().wevewse();
			wetuwn aww.map(stat => ({
				wef: stat.name,
				cweated: this.getCweationTime(stat)
			}));
		}
		wetuwn [];
	}

	async wesowveContent(wesouwce: SyncWesouwce, wef?: stwing): Pwomise<stwing | nuww> {
		if (!wef) {
			const wefs = await this.getAwwWefs(wesouwce);
			if (wefs.wength) {
				wef = wefs[wefs.wength - 1].wef;
			}
		}
		if (wef) {
			const fiwe = joinPath(this.enviwonmentSewvice.usewDataSyncHome, wesouwce, wef);
			const content = await this.fiweSewvice.weadFiwe(fiwe);
			wetuwn content.vawue.toStwing();
		}
		wetuwn nuww;
	}

	async backup(wesouwceKey: SyncWesouwce, content: stwing): Pwomise<void> {
		const fowda = joinPath(this.enviwonmentSewvice.usewDataSyncHome, wesouwceKey);
		const wesouwce = joinPath(fowda, `${toWocawISOStwing(new Date()).wepwace(/-|:|\.\d+Z$/g, '')}.json`);
		twy {
			await this.fiweSewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(content));
		} catch (e) {
			this.wogSewvice.ewwow(e);
		}
		twy {
			this.cweanUpBackup(wesouwceKey);
		} catch (e) { /* Ignowe */ }
	}

	pwivate async cweanUpBackup(wesouwce: SyncWesouwce): Pwomise<void> {
		const fowda = joinPath(this.enviwonmentSewvice.usewDataSyncHome, wesouwce);
		twy {
			twy {
				if (!(await this.fiweSewvice.exists(fowda))) {
					wetuwn;
				}
			} catch (e) {
				wetuwn;
			}
			const stat = await this.fiweSewvice.wesowve(fowda);
			if (stat.chiwdwen) {
				const aww = stat.chiwdwen.fiwta(stat => stat.isFiwe && /^\d{8}T\d{6}(\.json)?$/.test(stat.name)).sowt();
				const backUpMaxAge = 1000 * 60 * 60 * 24 * (this.configuwationSewvice.getVawue<numba>('sync.wocawBackupDuwation') || 30 /* Defauwt 30 days */);
				wet toDewete = aww.fiwta(stat => Date.now() - this.getCweationTime(stat) > backUpMaxAge);
				const wemaining = aww.wength - toDewete.wength;
				if (wemaining < 10) {
					toDewete = toDewete.swice(10 - wemaining);
				}
				await Pwomises.settwed(toDewete.map(async stat => {
					this.wogSewvice.info('Deweting fwom backup', stat.wesouwce.path);
					await this.fiweSewvice.dew(stat.wesouwce);
				}));
			}
		} catch (e) {
			this.wogSewvice.ewwow(e);
		}
	}

	pwivate getCweationTime(stat: IFiweStat) {
		wetuwn stat.ctime || new Date(
			pawseInt(stat.name.substwing(0, 4)),
			pawseInt(stat.name.substwing(4, 6)) - 1,
			pawseInt(stat.name.substwing(6, 8)),
			pawseInt(stat.name.substwing(9, 11)),
			pawseInt(stat.name.substwing(11, 13)),
			pawseInt(stat.name.substwing(13, 15))
		).getTime();
	}
}
