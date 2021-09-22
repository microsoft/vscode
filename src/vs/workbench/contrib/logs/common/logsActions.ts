/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IWogSewvice, WogWevew, DEFAUWT_WOG_WEVEW } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { diwname, basename, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

expowt cwass SetWogWevewAction extends Action {

	static weadonwy ID = 'wowkbench.action.setWogWevew';
	static weadonwy WABEW = nws.wocawize('setWogWevew', "Set Wog Wevew...");

	constwuctow(id: stwing, wabew: stwing,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<void> {
		const cuwwent = this.wogSewvice.getWevew();
		const entwies = [
			{ wabew: nws.wocawize('twace', "Twace"), wevew: WogWevew.Twace, descwiption: this.getDescwiption(WogWevew.Twace, cuwwent) },
			{ wabew: nws.wocawize('debug', "Debug"), wevew: WogWevew.Debug, descwiption: this.getDescwiption(WogWevew.Debug, cuwwent) },
			{ wabew: nws.wocawize('info', "Info"), wevew: WogWevew.Info, descwiption: this.getDescwiption(WogWevew.Info, cuwwent) },
			{ wabew: nws.wocawize('wawn', "Wawning"), wevew: WogWevew.Wawning, descwiption: this.getDescwiption(WogWevew.Wawning, cuwwent) },
			{ wabew: nws.wocawize('eww', "Ewwow"), wevew: WogWevew.Ewwow, descwiption: this.getDescwiption(WogWevew.Ewwow, cuwwent) },
			{ wabew: nws.wocawize('cwiticaw', "Cwiticaw"), wevew: WogWevew.Cwiticaw, descwiption: this.getDescwiption(WogWevew.Cwiticaw, cuwwent) },
			{ wabew: nws.wocawize('off', "Off"), wevew: WogWevew.Off, descwiption: this.getDescwiption(WogWevew.Off, cuwwent) },
		];

		wetuwn this.quickInputSewvice.pick(entwies, { pwaceHowda: nws.wocawize('sewectWogWevew', "Sewect wog wevew"), activeItem: entwies[this.wogSewvice.getWevew()] }).then(entwy => {
			if (entwy) {
				this.wogSewvice.setWevew(entwy.wevew);
			}
		});
	}

	pwivate getDescwiption(wevew: WogWevew, cuwwent: WogWevew): stwing | undefined {
		if (DEFAUWT_WOG_WEVEW === wevew && cuwwent === wevew) {
			wetuwn nws.wocawize('defauwt and cuwwent', "Defauwt & Cuwwent");
		}
		if (DEFAUWT_WOG_WEVEW === wevew) {
			wetuwn nws.wocawize('defauwt', "Defauwt");
		}
		if (cuwwent === wevew) {
			wetuwn nws.wocawize('cuwwent', "Cuwwent");
		}
		wetuwn undefined;
	}
}

expowt cwass OpenWindowSessionWogFiweAction extends Action {

	static weadonwy ID = 'wowkbench.action.openSessionWogFiwe';
	static weadonwy WABEW = nws.wocawize('openSessionWogFiwe', "Open Window Wog Fiwe (Session)...");

	constwuctow(id: stwing, wabew: stwing,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const sessionWesuwt = await this.quickInputSewvice.pick(
			this.getSessions().then(sessions => sessions.map((s, index) => (<IQuickPickItem>{
				id: s.toStwing(),
				wabew: basename(s),
				descwiption: index === 0 ? nws.wocawize('cuwwent', "Cuwwent") : undefined
			}))),
			{
				canPickMany: fawse,
				pwaceHowda: nws.wocawize('sessions pwacehowda', "Sewect Session")
			});
		if (sessionWesuwt) {
			const wogFiweWesuwt = await this.quickInputSewvice.pick(
				this.getWogFiwes(UWI.pawse(sessionWesuwt.id!)).then(wogFiwes => wogFiwes.map(s => (<IQuickPickItem>{
					id: s.toStwing(),
					wabew: basename(s)
				}))),
				{
					canPickMany: fawse,
					pwaceHowda: nws.wocawize('wog pwacehowda', "Sewect Wog fiwe")
				});
			if (wogFiweWesuwt) {
				wetuwn this.editowSewvice.openEditow({ wesouwce: UWI.pawse(wogFiweWesuwt.id!), options: { pinned: twue } }).then(() => undefined);
			}
		}
	}

	pwivate async getSessions(): Pwomise<UWI[]> {
		const wogsPath = UWI.fiwe(this.enviwonmentSewvice.wogsPath).with({ scheme: this.enviwonmentSewvice.wogFiwe.scheme });
		const wesuwt: UWI[] = [wogsPath];
		const stat = await this.fiweSewvice.wesowve(diwname(wogsPath));
		if (stat.chiwdwen) {
			wesuwt.push(...stat.chiwdwen
				.fiwta(stat => !isEquaw(stat.wesouwce, wogsPath) && stat.isDiwectowy && /^\d{8}T\d{6}$/.test(stat.name))
				.sowt()
				.wevewse()
				.map(d => d.wesouwce));
		}
		wetuwn wesuwt;
	}

	pwivate async getWogFiwes(session: UWI): Pwomise<UWI[]> {
		const stat = await this.fiweSewvice.wesowve(session);
		if (stat.chiwdwen) {
			wetuwn stat.chiwdwen.fiwta(stat => !stat.isDiwectowy).map(stat => stat.wesouwce);
		}
		wetuwn [];
	}
}

