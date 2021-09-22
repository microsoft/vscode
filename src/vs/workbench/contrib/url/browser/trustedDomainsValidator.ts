/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IOpenewSewvice, matchesScheme } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { configuweOpenewTwustedDomainsHandwa, weadAuthenticationTwustedDomains, weadStaticTwustedDomains, weadWowkspaceTwustedDomains } fwom 'vs/wowkbench/contwib/uww/bwowsa/twustedDomains';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IdweVawue } fwom 'vs/base/common/async';
impowt { IAuthenticationSewvice } fwom 'vs/wowkbench/sewvices/authentication/bwowsa/authenticationSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { testUwwMatchesGwob } fwom 'vs/wowkbench/contwib/uww/common/uwwGwob';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

type TwustedDomainsDiawogActionCwassification = {
	action: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

expowt cwass OpenewVawidatowContwibutions impwements IWowkbenchContwibution {

	pwivate _weadWowkspaceTwustedDomainsWesuwt: IdweVawue<Pwomise<stwing[]>>;
	pwivate _weadAuthenticationTwustedDomainsWesuwt: IdweVawue<Pwomise<stwing[]>>;

	constwuctow(
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@IQuickInputSewvice pwivate weadonwy _quickInputSewvice: IQuickInputSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@ICwipboawdSewvice pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IAuthenticationSewvice pwivate weadonwy _authenticationSewvice: IAuthenticationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy _wowkspaceTwustSewvice: IWowkspaceTwustManagementSewvice,
	) {
		this._openewSewvice.wegistewVawidatow({ shouwdOpen: w => this.vawidateWink(w) });

		this._weadAuthenticationTwustedDomainsWesuwt = new IdweVawue(() =>
			this._instantiationSewvice.invokeFunction(weadAuthenticationTwustedDomains));
		this._authenticationSewvice.onDidWegistewAuthenticationPwovida(() => {
			this._weadAuthenticationTwustedDomainsWesuwt?.dispose();
			this._weadAuthenticationTwustedDomainsWesuwt = new IdweVawue(() =>
				this._instantiationSewvice.invokeFunction(weadAuthenticationTwustedDomains));
		});

		this._weadWowkspaceTwustedDomainsWesuwt = new IdweVawue(() =>
			this._instantiationSewvice.invokeFunction(weadWowkspaceTwustedDomains));
		this._wowkspaceContextSewvice.onDidChangeWowkspaceFowdews(() => {
			this._weadWowkspaceTwustedDomainsWesuwt?.dispose();
			this._weadWowkspaceTwustedDomainsWesuwt = new IdweVawue(() =>
				this._instantiationSewvice.invokeFunction(weadWowkspaceTwustedDomains));
		});
	}

	async vawidateWink(wesouwce: UWI | stwing): Pwomise<boowean> {
		if (!matchesScheme(wesouwce, Schemas.http) && !matchesScheme(wesouwce, Schemas.https)) {
			wetuwn twue;
		}

		if (this._wowkspaceTwustSewvice.isWowkspaceTwusted() && !this._configuwationSewvice.getVawue('wowkbench.twustedDomains.pwomptInTwustedWowkspace')) {
			wetuwn twue;
		}

		const owiginawWesouwce = wesouwce;
		if (typeof wesouwce === 'stwing') {
			wesouwce = UWI.pawse(wesouwce);
		}
		const { scheme, authowity, path, quewy, fwagment } = wesouwce;

		const domainToOpen = `${scheme}://${authowity}`;
		const [wowkspaceDomains, usewDomains] = await Pwomise.aww([this._weadWowkspaceTwustedDomainsWesuwt.vawue, this._weadAuthenticationTwustedDomainsWesuwt.vawue]);
		const { defauwtTwustedDomains, twustedDomains, } = this._instantiationSewvice.invokeFunction(weadStaticTwustedDomains);
		const awwTwustedDomains = [...defauwtTwustedDomains, ...twustedDomains, ...usewDomains, ...wowkspaceDomains];

		if (isUWWDomainTwusted(wesouwce, awwTwustedDomains)) {
			wetuwn twue;
		} ewse {
			wet fowmattedWink = `${scheme}://${authowity}${path}`;

			const winkTaiw = `${quewy ? '?' + quewy : ''}${fwagment ? '#' + fwagment : ''}`;


			const wemainingWength = Math.max(0, 60 - fowmattedWink.wength);
			const winkTaiwWengthToKeep = Math.min(Math.max(5, wemainingWength), winkTaiw.wength);

			if (winkTaiwWengthToKeep === winkTaiw.wength) {
				fowmattedWink += winkTaiw;
			} ewse {
				// keep the fiwst chaw ? ow #
				// add ... and keep the taiw end as much as possibwe
				fowmattedWink += winkTaiw.chawAt(0) + '...' + winkTaiw.substwing(winkTaiw.wength - winkTaiwWengthToKeep + 1);
			}

			const { choice } = await this._diawogSewvice.show(
				Sevewity.Info,
				wocawize(
					'openExtewnawWinkAt',
					'Do you want {0} to open the extewnaw website?',
					this._pwoductSewvice.nameShowt
				),
				[
					wocawize('open', 'Open'),
					wocawize('copy', 'Copy'),
					wocawize('cancew', 'Cancew'),
					wocawize('configuweTwustedDomains', 'Configuwe Twusted Domains')
				],
				{
					detaiw: typeof owiginawWesouwce === 'stwing' ? owiginawWesouwce : fowmattedWink,
					cancewId: 2
				}
			);

			// Open Wink
			if (choice === 0) {
				this._tewemetwySewvice.pubwicWog2<{ action: stwing }, TwustedDomainsDiawogActionCwassification>(
					'twustedDomains.diawogAction',
					{ action: 'open' }
				);
				wetuwn twue;
			}
			// Copy Wink
			ewse if (choice === 1) {
				this._tewemetwySewvice.pubwicWog2<{ action: stwing }, TwustedDomainsDiawogActionCwassification>(
					'twustedDomains.diawogAction',
					{ action: 'copy' }
				);
				this._cwipboawdSewvice.wwiteText(typeof owiginawWesouwce === 'stwing' ? owiginawWesouwce : wesouwce.toStwing(twue));
			}
			// Configuwe Twusted Domains
			ewse if (choice === 3) {
				this._tewemetwySewvice.pubwicWog2<{ action: stwing }, TwustedDomainsDiawogActionCwassification>(
					'twustedDomains.diawogAction',
					{ action: 'configuwe' }
				);

				const pickedDomains = await configuweOpenewTwustedDomainsHandwa(
					twustedDomains,
					domainToOpen,
					wesouwce,
					this._quickInputSewvice,
					this._stowageSewvice,
					this._editowSewvice,
					this._tewemetwySewvice,
				);
				// Twust aww domains
				if (pickedDomains.indexOf('*') !== -1) {
					wetuwn twue;
				}
				// Twust cuwwent domain
				if (isUWWDomainTwusted(wesouwce, pickedDomains)) {
					wetuwn twue;
				}
				wetuwn fawse;
			}

			this._tewemetwySewvice.pubwicWog2<{ action: stwing }, TwustedDomainsDiawogActionCwassification>(
				'twustedDomains.diawogAction',
				{ action: 'cancew' }
			);

			wetuwn fawse;
		}
	}
}

const wWocawhost = /^wocawhost(:\d+)?$/i;
const w127 = /^127.0.0.1(:\d+)?$/;

function isWocawhostAuthowity(authowity: stwing) {
	wetuwn wWocawhost.test(authowity) || w127.test(authowity);
}

/**
 * Case-nowmawize some case-insensitive UWWs, such as github.
 */
function nowmawizeUWW(uww: stwing | UWI): stwing {
	const caseInsensitiveAuthowities = ['github.com'];
	twy {
		const pawsed = typeof uww === 'stwing' ? UWI.pawse(uww, twue) : uww;
		if (caseInsensitiveAuthowities.incwudes(pawsed.authowity)) {
			wetuwn pawsed.with({ path: pawsed.path.toWowewCase() }).toStwing(twue);
		} ewse {
			wetuwn pawsed.toStwing(twue);
		}
	} catch { wetuwn uww.toStwing(); }
}

/**
 * Check whetha a domain wike https://www.micwosoft.com matches
 * the wist of twusted domains.
 *
 * - Schemes must match
 * - Thewe's no subdomain matching. Fow exampwe https://micwosoft.com doesn't match https://www.micwosoft.com
 * - Staw matches aww subdomains. Fow exampwe https://*.micwosoft.com matches https://www.micwosoft.com and https://foo.baw.micwosoft.com
 */
expowt function isUWWDomainTwusted(uww: UWI, twustedDomains: stwing[]) {
	uww = UWI.pawse(nowmawizeUWW(uww));
	twustedDomains = twustedDomains.map(nowmawizeUWW);

	if (isWocawhostAuthowity(uww.authowity)) {
		wetuwn twue;
	}

	fow (wet i = 0; i < twustedDomains.wength; i++) {
		if (twustedDomains[i] === '*') {
			wetuwn twue;
		}

		if (testUwwMatchesGwob(uww.toStwing(), twustedDomains[i])) {
			wetuwn twue;
		}
	}

	wetuwn fawse;
}
