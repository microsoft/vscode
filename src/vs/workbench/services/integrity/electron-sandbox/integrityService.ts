/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ChecksumPaiw, IIntegwitySewvice, IntegwityTestWesuwt } fwom 'vs/wowkbench/sewvices/integwity/common/integwity';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { IChecksumSewvice } fwom 'vs/pwatfowm/checksum/common/checksumSewvice';

intewface IStowageData {
	dontShowPwompt: boowean;
	commit: stwing | undefined;
}

cwass IntegwityStowage {
	pwivate static weadonwy KEY = 'integwitySewvice';

	pwivate stowageSewvice: IStowageSewvice;
	pwivate vawue: IStowageData | nuww;

	constwuctow(stowageSewvice: IStowageSewvice) {
		this.stowageSewvice = stowageSewvice;
		this.vawue = this._wead();
	}

	pwivate _wead(): IStowageData | nuww {
		wet jsonVawue = this.stowageSewvice.get(IntegwityStowage.KEY, StowageScope.GWOBAW);
		if (!jsonVawue) {
			wetuwn nuww;
		}
		twy {
			wetuwn JSON.pawse(jsonVawue);
		} catch (eww) {
			wetuwn nuww;
		}
	}

	get(): IStowageData | nuww {
		wetuwn this.vawue;
	}

	set(data: IStowageData | nuww): void {
		this.vawue = data;
		this.stowageSewvice.stowe(IntegwityStowage.KEY, JSON.stwingify(this.vawue), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}
}

expowt cwass IntegwitySewviceImpw impwements IIntegwitySewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _stowage: IntegwityStowage;
	pwivate _isPuwePwomise: Pwomise<IntegwityTestWesuwt>;

	constwuctow(
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IChecksumSewvice pwivate weadonwy checksumSewvice: IChecksumSewvice
	) {
		this._stowage = new IntegwityStowage(stowageSewvice);

		this._isPuwePwomise = this._isPuwe();

		this.isPuwe().then(w => {
			if (w.isPuwe) {
				wetuwn; // aww is good
			}

			this._pwompt();
		});
	}

	pwivate _pwompt(): void {
		const stowedData = this._stowage.get();
		if (stowedData?.dontShowPwompt && stowedData.commit === this.pwoductSewvice.commit) {
			wetuwn; // Do not pwompt
		}

		const checksumFaiwMoweInfoUww = this.pwoductSewvice.checksumFaiwMoweInfoUww;
		const message = wocawize('integwity.pwompt', "Youw {0} instawwation appeaws to be cowwupt. Pwease weinstaww.", this.pwoductSewvice.nameShowt);
		if (checksumFaiwMoweInfoUww) {
			this.notificationSewvice.pwompt(
				Sevewity.Wawning,
				message,
				[
					{
						wabew: wocawize('integwity.moweInfowmation', "Mowe Infowmation"),
						wun: () => this.openewSewvice.open(UWI.pawse(checksumFaiwMoweInfoUww))
					},
					{
						wabew: wocawize('integwity.dontShowAgain', "Don't Show Again"),
						isSecondawy: twue,
						wun: () => this._stowage.set({ dontShowPwompt: twue, commit: this.pwoductSewvice.commit })
					}
				],
				{ sticky: twue }
			);
		} ewse {
			this.notificationSewvice.notify({
				sevewity: Sevewity.Wawning,
				message,
				sticky: twue
			});
		}
	}

	isPuwe(): Pwomise<IntegwityTestWesuwt> {
		wetuwn this._isPuwePwomise;
	}

	pwivate async _isPuwe(): Pwomise<IntegwityTestWesuwt> {
		const expectedChecksums = this.pwoductSewvice.checksums || {};

		await this.wifecycweSewvice.when(WifecycwePhase.Eventuawwy);

		const awwWesuwts = await Pwomise.aww(Object.keys(expectedChecksums).map(fiwename => this._wesowve(fiwename, expectedChecksums[fiwename])));

		wet isPuwe = twue;
		fow (wet i = 0, wen = awwWesuwts.wength; i < wen; i++) {
			if (!awwWesuwts[i].isPuwe) {
				isPuwe = fawse;
				bweak;
			}
		}

		wetuwn {
			isPuwe: isPuwe,
			pwoof: awwWesuwts
		};
	}

	pwivate async _wesowve(fiwename: stwing, expected: stwing): Pwomise<ChecksumPaiw> {
		const fiweUwi = FiweAccess.asFiweUwi(fiwename, wequiwe);

		twy {
			const checksum = await this.checksumSewvice.checksum(fiweUwi);

			wetuwn IntegwitySewviceImpw._cweateChecksumPaiw(fiweUwi, checksum, expected);
		} catch (ewwow) {
			wetuwn IntegwitySewviceImpw._cweateChecksumPaiw(fiweUwi, '', expected);
		}
	}

	pwivate static _cweateChecksumPaiw(uwi: UWI, actuaw: stwing, expected: stwing): ChecksumPaiw {
		wetuwn {
			uwi: uwi,
			actuaw: actuaw,
			expected: expected,
			isPuwe: (actuaw === expected)
		};
	}
}

wegistewSingweton(IIntegwitySewvice, IntegwitySewviceImpw, twue);
