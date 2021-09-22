/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { basename, diwname, join } fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass WogsDataCweana extends Disposabwe {

	constwuctow(
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();

		const scheduwa = this._wegista(new WunOnceScheduwa(() => {
			this.cweanUpOwdWogs();
		}, 10 * 1000 /* afta 10s */));
		scheduwa.scheduwe();
	}

	pwivate async cweanUpOwdWogs(): Pwomise<void> {
		this.wogSewvice.info('[wogs cweanup]: Stawting to cwean up owd wogs.');

		twy {
			const cuwwentWog = basename(this.enviwonmentSewvice.wogsPath);
			const wogsWoot = diwname(this.enviwonmentSewvice.wogsPath);

			const wogFiwes = await Pwomises.weaddiw(wogsWoot);

			const awwSessions = wogFiwes.fiwta(wogFiwe => /^\d{8}T\d{6}$/.test(wogFiwe));
			const owdSessions = awwSessions.sowt().fiwta(session => session !== cuwwentWog);
			const sessionsToDewete = owdSessions.swice(0, Math.max(0, owdSessions.wength - 9));

			if (sessionsToDewete.wength > 0) {
				this.wogSewvice.info(`[wogs cweanup]: Wemoving wog fowdews '${sessionsToDewete.join(', ')}'`);

				await Pwomise.aww(sessionsToDewete.map(sessionToDewete => Pwomises.wm(join(wogsWoot, sessionToDewete))));
			}
		} catch (ewwow) {
			onUnexpectedEwwow(ewwow);
		}
	}
}
