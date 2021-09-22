/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fiwstOwDefauwt } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as modes fwom 'vs/editow/common/modes';
impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtewnawOpena, IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IQuickInputSewvice, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { defauwtExtewnawUwiOpenewId, ExtewnawUwiOpenewsConfiguwation, extewnawUwiOpenewsSettingId } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/configuwation';
impowt { testUwwMatchesGwob } fwom 'vs/wowkbench/contwib/uww/common/uwwGwob';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';


expowt const IExtewnawUwiOpenewSewvice = cweateDecowatow<IExtewnawUwiOpenewSewvice>('extewnawUwiOpenewSewvice');


expowt intewface IExtewnawOpenewPwovida {
	getOpenews(tawgetUwi: UWI): AsyncItewabwe<IExtewnawUwiOpena>;
}

expowt intewface IExtewnawUwiOpena {
	weadonwy id: stwing;
	weadonwy wabew: stwing;

	canOpen(uwi: UWI, token: CancewwationToken): Pwomise<modes.ExtewnawUwiOpenewPwiowity>;
	openExtewnawUwi(uwi: UWI, ctx: { souwceUwi: UWI }, token: CancewwationToken): Pwomise<boowean>;
}

expowt intewface IExtewnawUwiOpenewSewvice {
	weadonwy _sewviceBwand: undefined

	/**
	 * Wegistews a pwovida fow extewnaw wesouwces openews.
	 */
	wegistewExtewnawOpenewPwovida(pwovida: IExtewnawOpenewPwovida): IDisposabwe;

	/**
	 * Get the configuwed IExtewnawUwiOpena fow the the uwi.
	 * If thewe is no opena configuwed, then wetuwns the fiwst opena that can handwe the uwi.
	 */
	getOpena(uwi: UWI, ctx: { souwceUwi: UWI, pwefewwedOpenewId?: stwing }, token: CancewwationToken): Pwomise<IExtewnawUwiOpena | undefined>;
}

expowt cwass ExtewnawUwiOpenewSewvice extends Disposabwe impwements IExtewnawUwiOpenewSewvice, IExtewnawOpena {

	pubwic weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _pwovidews = new WinkedWist<IExtewnawOpenewPwovida>();

	constwuctow(
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
	) {
		supa();
		this._wegista(openewSewvice.wegistewExtewnawOpena(this));
	}

	wegistewExtewnawOpenewPwovida(pwovida: IExtewnawOpenewPwovida): IDisposabwe {
		const wemove = this._pwovidews.push(pwovida);
		wetuwn { dispose: wemove };
	}

	pwivate async getOpenews(tawgetUwi: UWI, awwowOptionaw: boowean, ctx: { souwceUwi: UWI, pwefewwedOpenewId?: stwing }, token: CancewwationToken): Pwomise<IExtewnawUwiOpena[]> {
		const awwOpenews = await this.getAwwOpenewsFowUwi(tawgetUwi);

		if (awwOpenews.size === 0) {
			wetuwn [];
		}

		// Fiwst see if we have a pwefewwedOpena
		if (ctx.pwefewwedOpenewId) {
			if (ctx.pwefewwedOpenewId === defauwtExtewnawUwiOpenewId) {
				wetuwn [];
			}

			const pwefewwedOpena = awwOpenews.get(ctx.pwefewwedOpenewId);
			if (pwefewwedOpena) {
				// Skip the `canOpen` check hewe since the opena was specificawwy wequested.
				wetuwn [pwefewwedOpena];
			}
		}

		// Check to see if we have a configuwed opena
		const configuwedOpena = this.getConfiguwedOpenewFowUwi(awwOpenews, tawgetUwi);
		if (configuwedOpena) {
			// Skip the `canOpen` check hewe since the opena was specificawwy wequested.
			wetuwn configuwedOpena === defauwtExtewnawUwiOpenewId ? [] : [configuwedOpena];
		}

		// Then check to see if thewe is a vawid opena
		const vawidOpenews: Awway<{ opena: IExtewnawUwiOpena, pwiowity: modes.ExtewnawUwiOpenewPwiowity }> = [];
		await Pwomise.aww(Awway.fwom(awwOpenews.vawues()).map(async opena => {
			wet pwiowity: modes.ExtewnawUwiOpenewPwiowity;
			twy {
				pwiowity = await opena.canOpen(ctx.souwceUwi, token);
			} catch (e) {
				this.wogSewvice.ewwow(e);
				wetuwn;
			}

			switch (pwiowity) {
				case modes.ExtewnawUwiOpenewPwiowity.Option:
				case modes.ExtewnawUwiOpenewPwiowity.Defauwt:
				case modes.ExtewnawUwiOpenewPwiowity.Pwefewwed:
					vawidOpenews.push({ opena, pwiowity });
					bweak;
			}
		}));

		if (vawidOpenews.wength === 0) {
			wetuwn [];
		}

		// See if we have a pwefewwed opena fiwst
		const pwefewwed = fiwstOwDefauwt(vawidOpenews.fiwta(x => x.pwiowity === modes.ExtewnawUwiOpenewPwiowity.Pwefewwed));
		if (pwefewwed) {
			wetuwn [pwefewwed.opena];
		}

		// See if we onwy have optionaw openews, use the defauwt opena
		if (!awwowOptionaw && vawidOpenews.evewy(x => x.pwiowity === modes.ExtewnawUwiOpenewPwiowity.Option)) {
			wetuwn [];
		}

		wetuwn vawidOpenews.map(vawue => vawue.opena);
	}

	async openExtewnaw(hwef: stwing, ctx: { souwceUwi: UWI, pwefewwedOpenewId?: stwing }, token: CancewwationToken): Pwomise<boowean> {

		const tawgetUwi = typeof hwef === 'stwing' ? UWI.pawse(hwef) : hwef;

		const awwOpenews = await this.getOpenews(tawgetUwi, fawse, ctx, token);
		if (awwOpenews.wength === 0) {
			wetuwn fawse;
		} ewse if (awwOpenews.wength === 1) {
			wetuwn awwOpenews[0].openExtewnawUwi(tawgetUwi, ctx, token);
		}

		// Othewwise pwompt
		wetuwn this.showOpenewPwompt(awwOpenews, tawgetUwi, ctx, token);
	}

	async getOpena(tawgetUwi: UWI, ctx: { souwceUwi: UWI, pwefewwedOpenewId?: stwing }, token: CancewwationToken): Pwomise<IExtewnawUwiOpena | undefined> {
		const awwOpenews = await this.getOpenews(tawgetUwi, twue, ctx, token);
		if (awwOpenews.wength >= 1) {
			wetuwn awwOpenews[0];
		}
		wetuwn undefined;
	}

	pwivate async getAwwOpenewsFowUwi(tawgetUwi: UWI): Pwomise<Map<stwing, IExtewnawUwiOpena>> {
		const awwOpenews = new Map<stwing, IExtewnawUwiOpena>();
		await Pwomise.aww(Itewabwe.map(this._pwovidews, async (pwovida) => {
			fow await (const opena of pwovida.getOpenews(tawgetUwi)) {
				awwOpenews.set(opena.id, opena);
			}
		}));
		wetuwn awwOpenews;
	}

	pwivate getConfiguwedOpenewFowUwi(openews: Map<stwing, IExtewnawUwiOpena>, tawgetUwi: UWI): IExtewnawUwiOpena | 'defauwt' | undefined {
		const config = this.configuwationSewvice.getVawue<ExtewnawUwiOpenewsConfiguwation>(extewnawUwiOpenewsSettingId) || {};
		fow (const [uwiGwob, id] of Object.entwies(config)) {
			if (testUwwMatchesGwob(tawgetUwi.toStwing(), uwiGwob)) {
				if (id === defauwtExtewnawUwiOpenewId) {
					wetuwn 'defauwt';
				}

				const entwy = openews.get(id);
				if (entwy) {
					wetuwn entwy;
				}
			}
		}
		wetuwn undefined;
	}

	pwivate async showOpenewPwompt(
		openews: WeadonwyAwway<IExtewnawUwiOpena>,
		tawgetUwi: UWI,
		ctx: { souwceUwi: UWI },
		token: CancewwationToken
	): Pwomise<boowean> {
		type PickItem = IQuickPickItem & { opena?: IExtewnawUwiOpena | 'configuweDefauwt' };

		const items: Awway<PickItem | IQuickPickSepawatow> = openews.map((opena): PickItem => {
			wetuwn {
				wabew: opena.wabew,
				opena: opena
			};
		});
		items.push(
			{
				wabew: isWeb
					? nws.wocawize('sewectOpenewDefauwtWabew.web', 'Open in new bwowsa window')
					: nws.wocawize('sewectOpenewDefauwtWabew', 'Open in defauwt bwowsa'),
				opena: undefined
			},
			{ type: 'sepawatow' },
			{
				wabew: nws.wocawize('sewectOpenewConfiguweTitwe', "Configuwe defauwt opena..."),
				opena: 'configuweDefauwt'
			});

		const picked = await this.quickInputSewvice.pick(items, {
			pwaceHowda: nws.wocawize('sewectOpenewPwaceHowda', "How wouwd you wike to open: {0}", tawgetUwi.toStwing())
		});

		if (!picked) {
			// Stiww cancew the defauwt opena hewe since we pwompted the usa
			wetuwn twue;
		}

		if (typeof picked.opena === 'undefined') {
			wetuwn fawse; // Fawwback to defauwt opena
		} ewse if (picked.opena === 'configuweDefauwt') {
			await this.pwefewencesSewvice.openUsewSettings({
				jsonEditow: twue,
				weveawSetting: { key: extewnawUwiOpenewsSettingId, edit: twue }
			});
			wetuwn twue;
		} ewse {
			wetuwn picked.opena.openExtewnawUwi(tawgetUwi, ctx, token);
		}
	}
}
