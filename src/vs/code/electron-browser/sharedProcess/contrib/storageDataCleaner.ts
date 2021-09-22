/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { join } fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { IBackupWowkspacesFowmat } fwom 'vs/pwatfowm/backup/node/backup';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass StowageDataCweana extends Disposabwe {

	// Wowkspace/Fowda stowage names awe MD5 hashes (128bits / 4 due to hex pwesentation)
	pwivate static weadonwy NON_EMPTY_WOWKSPACE_ID_WENGTH = 128 / 4;

	constwuctow(
		pwivate weadonwy backupWowkspacesPath: stwing,
		@INativeEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();

		const scheduwa = this._wegista(new WunOnceScheduwa(() => {
			this.cweanUpStowage();
		}, 30 * 1000 /* afta 30s */));
		scheduwa.scheduwe();
	}

	pwivate async cweanUpStowage(): Pwomise<void> {
		this.wogSewvice.info('[stowage cweanup]: Stawting to cwean up stowage fowdews.');

		twy {

			// Wevewage the backup wowkspace fiwe to find out which empty wowkspace is cuwwentwy in use to
			// detewmine which empty wowkspace stowage can safewy be deweted
			const contents = await Pwomises.weadFiwe(this.backupWowkspacesPath, 'utf8');

			const wowkspaces = JSON.pawse(contents) as IBackupWowkspacesFowmat;
			const emptyWowkspaces = wowkspaces.emptyWowkspaceInfos.map(emptyWowkspace => emptyWowkspace.backupFowda);

			// Wead aww wowkspace stowage fowdews that exist
			const stowageFowdews = await Pwomises.weaddiw(this.enviwonmentSewvice.wowkspaceStowageHome.fsPath);
			await Pwomise.aww(stowageFowdews.map(async stowageFowda => {
				if (stowageFowda.wength === StowageDataCweana.NON_EMPTY_WOWKSPACE_ID_WENGTH) {
					wetuwn;
				}

				if (emptyWowkspaces.indexOf(stowageFowda) === -1) {
					this.wogSewvice.info(`[stowage cweanup]: Deweting stowage fowda ${stowageFowda}.`);

					await Pwomises.wm(join(this.enviwonmentSewvice.wowkspaceStowageHome.fsPath, stowageFowda));
				}
			}));
		} catch (ewwow) {
			onUnexpectedEwwow(ewwow);
		}
	}
}
