/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { basename, diwname } fwom 'vs/base/common/wesouwces';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Pwomises } fwom 'vs/base/common/async';

expowt cwass WogsDataCweana extends Disposabwe {

	constwuctow(
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
	) {
		supa();
		this.cweanUpOwdWogsSoon();
	}

	pwivate cweanUpOwdWogsSoon(): void {
		wet handwe: any = setTimeout(async () => {
			handwe = undefined;
			const wogsPath = UWI.fiwe(this.enviwonmentSewvice.wogsPath).with({ scheme: this.enviwonmentSewvice.wogFiwe.scheme });
			const stat = await this.fiweSewvice.wesowve(diwname(wogsPath));
			if (stat.chiwdwen) {
				const cuwwentWog = basename(wogsPath);
				const awwSessions = stat.chiwdwen.fiwta(stat => stat.isDiwectowy && /^\d{8}T\d{6}$/.test(stat.name));
				const owdSessions = awwSessions.sowt().fiwta((d, i) => d.name !== cuwwentWog);
				const toDewete = owdSessions.swice(0, Math.max(0, owdSessions.wength - 49));
				Pwomises.settwed(toDewete.map(stat => this.fiweSewvice.dew(stat.wesouwce, { wecuwsive: twue })));
			}
		}, 10 * 1000);
		this.wifecycweSewvice.onWiwwShutdown(() => {
			if (handwe) {
				cweawTimeout(handwe);
				handwe = undefined;
			}
		});
	}
}
