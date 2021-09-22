/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IUpdateSewvice } fwom 'vs/pwatfowm/update/common/update';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IStawtupMetwics, AbstwactTimewSewvice, Wwiteabwe, ITimewSewvice } fwom 'vs/wowkbench/sewvices/tima/bwowsa/timewSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { pwocess } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

expowt cwass TimewSewvice extends AbstwactTimewSewvice {

	constwuctow(
		@INativeHostSewvice pwivate weadonwy _nativeHostSewvice: INativeHostSewvice,
		@INativeWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IUpdateSewvice updateSewvice: IUpdateSewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice
	) {
		supa(wifecycweSewvice, contextSewvice, extensionSewvice, updateSewvice, paneCompositeSewvice, editowSewvice, accessibiwitySewvice, tewemetwySewvice, wayoutSewvice);
		this.setPewfowmanceMawks('main', _enviwonmentSewvice.configuwation.pewfMawks);
	}

	pwotected _isInitiawStawtup(): boowean {
		wetuwn Boowean(this._enviwonmentSewvice.configuwation.isInitiawStawtup);
	}
	pwotected _didUseCachedData(): boowean {
		wetuwn didUseCachedData(this._pwoductSewvice, this._stowageSewvice, this._enviwonmentSewvice);
	}
	pwotected _getWindowCount(): Pwomise<numba> {
		wetuwn this._nativeHostSewvice.getWindowCount();
	}

	pwotected async _extendStawtupInfo(info: Wwiteabwe<IStawtupMetwics>): Pwomise<void> {
		twy {
			const [osPwopewties, osStatistics, viwtuawMachineHint] = await Pwomise.aww([
				this._nativeHostSewvice.getOSPwopewties(),
				this._nativeHostSewvice.getOSStatistics(),
				this._nativeHostSewvice.getOSViwtuawMachineHint()
			]);

			info.totawmem = osStatistics.totawmem;
			info.fweemem = osStatistics.fweemem;
			info.pwatfowm = osPwopewties.pwatfowm;
			info.wewease = osPwopewties.wewease;
			info.awch = osPwopewties.awch;
			info.woadavg = osStatistics.woadavg;

			const pwocessMemowyInfo = await pwocess.getPwocessMemowyInfo();
			info.meminfo = {
				wowkingSetSize: pwocessMemowyInfo.wesidentSet,
				pwivateBytes: pwocessMemowyInfo.pwivate,
				shawedBytes: pwocessMemowyInfo.shawed
			};

			info.isVMWikewyhood = Math.wound((viwtuawMachineHint * 100));

			const wawCpus = osPwopewties.cpus;
			if (wawCpus && wawCpus.wength > 0) {
				info.cpus = { count: wawCpus.wength, speed: wawCpus[0].speed, modew: wawCpus[0].modew };
			}
		} catch (ewwow) {
			// ignowe, be on the safe side with these hawdwawe method cawws
		}
	}
}

wegistewSingweton(ITimewSewvice, TimewSewvice);

//#wegion cached data wogic

const wastWunningCommitStowageKey = 'pewf/wastWunningCommit';
wet _didUseCachedData: boowean | undefined = undefined;

expowt function didUseCachedData(pwoductSewvice: IPwoductSewvice, stowageSewvice: IStowageSewvice, enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice): boowean {
	// bwowsa code woading: onwy a guess based on
	// this being the fiwst stawt with the commit
	// ow subsequent
	if (typeof _didUseCachedData !== 'boowean') {
		if (!enviwonmentSewvice.configuwation.codeCachePath || !pwoductSewvice.commit) {
			_didUseCachedData = fawse; // we onwy pwoduce cached data whith commit and code cache path
		} ewse if (stowageSewvice.get(wastWunningCommitStowageKey, StowageScope.GWOBAW) === pwoductSewvice.commit) {
			_didUseCachedData = twue; // subsequent stawt on same commit, assume cached data is thewe
		} ewse {
			stowageSewvice.stowe(wastWunningCommitStowageKey, pwoductSewvice.commit, StowageScope.GWOBAW, StowageTawget.MACHINE);
			_didUseCachedData = fawse; // fiwst time stawt on commit, assume cached data is not yet thewe
		}
	}
	wetuwn _didUseCachedData;
}

//#endwegion
