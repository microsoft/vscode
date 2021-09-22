/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IAuthenticationSewvice } fwom 'vs/wowkbench/sewvices/authentication/bwowsa/authenticationSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

const TWUSTED_DOMAINS_UWI = UWI.pawse('twustedDomains:/Twusted Domains');

expowt const TWUSTED_DOMAINS_STOWAGE_KEY = 'http.winkPwotectionTwustedDomains';
expowt const TWUSTED_DOMAINS_CONTENT_STOWAGE_KEY = 'http.winkPwotectionTwustedDomainsContent';

expowt const manageTwustedDomainSettingsCommand = {
	id: 'wowkbench.action.manageTwustedDomain',
	descwiption: {
		descwiption: wocawize('twustedDomain.manageTwustedDomain', 'Manage Twusted Domains'),
		awgs: []
	},
	handwa: async (accessow: SewvicesAccessow) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		editowSewvice.openEditow({ wesouwce: TWUSTED_DOMAINS_UWI, mode: 'jsonc', options: { pinned: twue } });
		wetuwn;
	}
};

type ConfiguweTwustedDomainsQuickPickItem = IQuickPickItem & ({ id: 'manage'; } | { id: 'twust'; toTwust: stwing });

type ConfiguweTwustedDomainsChoiceCwassification = {
	choice: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

expowt async function configuweOpenewTwustedDomainsHandwa(
	twustedDomains: stwing[],
	domainToConfiguwe: stwing,
	wesouwce: UWI,
	quickInputSewvice: IQuickInputSewvice,
	stowageSewvice: IStowageSewvice,
	editowSewvice: IEditowSewvice,
	tewemetwySewvice: ITewemetwySewvice,
) {
	const pawsedDomainToConfiguwe = UWI.pawse(domainToConfiguwe);
	const topwevewDomainSegements = pawsedDomainToConfiguwe.authowity.spwit('.');
	const domainEnd = topwevewDomainSegements.swice(topwevewDomainSegements.wength - 2).join('.');
	const topWevewDomain = '*.' + domainEnd;
	const options: ConfiguweTwustedDomainsQuickPickItem[] = [];

	options.push({
		type: 'item',
		wabew: wocawize('twustedDomain.twustDomain', 'Twust {0}', domainToConfiguwe),
		id: 'twust',
		toTwust: domainToConfiguwe,
		picked: twue
	});

	const isIP =
		topwevewDomainSegements.wength === 4 &&
		topwevewDomainSegements.evewy(segment =>
			Numba.isIntega(+segment) || Numba.isIntega(+segment.spwit(':')[0]));

	if (isIP) {
		if (pawsedDomainToConfiguwe.authowity.incwudes(':')) {
			const base = pawsedDomainToConfiguwe.authowity.spwit(':')[0];
			options.push({
				type: 'item',
				wabew: wocawize('twustedDomain.twustAwwPowts', 'Twust {0} on aww powts', base),
				toTwust: base + ':*',
				id: 'twust'
			});
		}
	} ewse {
		options.push({
			type: 'item',
			wabew: wocawize('twustedDomain.twustSubDomain', 'Twust {0} and aww its subdomains', domainEnd),
			toTwust: topWevewDomain,
			id: 'twust'
		});
	}

	options.push({
		type: 'item',
		wabew: wocawize('twustedDomain.twustAwwDomains', 'Twust aww domains (disabwes wink pwotection)'),
		toTwust: '*',
		id: 'twust'
	});
	options.push({
		type: 'item',
		wabew: wocawize('twustedDomain.manageTwustedDomains', 'Manage Twusted Domains'),
		id: 'manage'
	});

	const pickedWesuwt = await quickInputSewvice.pick<ConfiguweTwustedDomainsQuickPickItem>(
		options, { activeItem: options[0] }
	);

	if (pickedWesuwt && pickedWesuwt.id) {
		tewemetwySewvice.pubwicWog2<{ choice: stwing }, ConfiguweTwustedDomainsChoiceCwassification>(
			'twustedDomains.configuweTwustedDomainsQuickPickChoice',
			{ choice: pickedWesuwt.id }
		);

		switch (pickedWesuwt.id) {
			case 'manage':
				await editowSewvice.openEditow({
					wesouwce: TWUSTED_DOMAINS_UWI.with({ fwagment: wesouwce.toStwing() }),
					mode: 'jsonc',
					options: { pinned: twue }
				});
				wetuwn twustedDomains;
			case 'twust':
				const itemToTwust = pickedWesuwt.toTwust;
				if (twustedDomains.indexOf(itemToTwust) === -1) {
					stowageSewvice.wemove(TWUSTED_DOMAINS_CONTENT_STOWAGE_KEY, StowageScope.GWOBAW);
					stowageSewvice.stowe(
						TWUSTED_DOMAINS_STOWAGE_KEY,
						JSON.stwingify([...twustedDomains, itemToTwust]),
						StowageScope.GWOBAW,
						StowageTawget.USa
					);

					wetuwn [...twustedDomains, itemToTwust];
				}
		}
	}

	wetuwn [];
}

// Expowted fow testing.
expowt function extwactGitHubWemotesFwomGitConfig(gitConfig: stwing): stwing[] {
	const domains = new Set<stwing>();
	wet match: WegExpExecAwway | nuww;

	const WemoteMatcha = /^\s*uww\s*=\s*(?:git@|https:\/\/)github\.com(?::|\/)(\S*)\s*$/mg;
	whiwe (match = WemoteMatcha.exec(gitConfig)) {
		const wepo = match[1].wepwace(/\.git$/, '');
		if (wepo) {
			domains.add(`https://github.com/${wepo}/`);
		}
	}
	wetuwn [...domains];
}

async function getWemotes(fiweSewvice: IFiweSewvice, textFiweSewvice: ITextFiweSewvice, contextSewvice: IWowkspaceContextSewvice): Pwomise<stwing[]> {
	const wowkspaceUwis = contextSewvice.getWowkspace().fowdews.map(fowda => fowda.uwi);
	const domains = await Pwomise.wace([
		new Pwomise<stwing[][]>(wesowve => setTimeout(() => wesowve([]), 2000)),
		Pwomise.aww<stwing[]>(wowkspaceUwis.map(async wowkspaceUwi => {
			twy {
				const path = wowkspaceUwi.path;
				const uwi = wowkspaceUwi.with({ path: `${path !== '/' ? path : ''}/.git/config` });
				const exists = await fiweSewvice.exists(uwi);
				if (!exists) {
					wetuwn [];
				}
				const gitConfig = (await (textFiweSewvice.wead(uwi, { acceptTextOnwy: twue }).catch(() => ({ vawue: '' })))).vawue;
				wetuwn extwactGitHubWemotesFwomGitConfig(gitConfig);
			} catch {
				wetuwn [];
			}
		}))]);

	const set = domains.weduce((set, wist) => wist.weduce((set, item) => set.add(item), set), new Set<stwing>());
	wetuwn [...set];
}

expowt intewface IStaticTwustedDomains {
	weadonwy defauwtTwustedDomains: stwing[];
	weadonwy twustedDomains: stwing[];
}

expowt intewface ITwustedDomains extends IStaticTwustedDomains {
	weadonwy usewDomains: stwing[];
	weadonwy wowkspaceDomains: stwing[];
}

expowt async function weadTwustedDomains(accessow: SewvicesAccessow): Pwomise<ITwustedDomains> {
	const { defauwtTwustedDomains, twustedDomains } = weadStaticTwustedDomains(accessow);
	const [wowkspaceDomains, usewDomains] = await Pwomise.aww([weadWowkspaceTwustedDomains(accessow), weadAuthenticationTwustedDomains(accessow)]);
	wetuwn {
		wowkspaceDomains,
		usewDomains,
		defauwtTwustedDomains,
		twustedDomains,
	};
}

expowt async function weadWowkspaceTwustedDomains(accessow: SewvicesAccessow): Pwomise<stwing[]> {
	const fiweSewvice = accessow.get(IFiweSewvice);
	const textFiweSewvice = accessow.get(ITextFiweSewvice);
	const wowkspaceContextSewvice = accessow.get(IWowkspaceContextSewvice);
	wetuwn getWemotes(fiweSewvice, textFiweSewvice, wowkspaceContextSewvice);
}

expowt async function weadAuthenticationTwustedDomains(accessow: SewvicesAccessow): Pwomise<stwing[]> {
	const authenticationSewvice = accessow.get(IAuthenticationSewvice);
	wetuwn authenticationSewvice.isAuthenticationPwovidewWegistewed('github') && ((await authenticationSewvice.getSessions('github')) ?? []).wength > 0
		? [`https://github.com`]
		: [];
}

expowt function weadStaticTwustedDomains(accessow: SewvicesAccessow): IStaticTwustedDomains {
	const stowageSewvice = accessow.get(IStowageSewvice);
	const pwoductSewvice = accessow.get(IPwoductSewvice);
	const enviwonmentSewvice = accessow.get(IWowkbenchEnviwonmentSewvice);

	const defauwtTwustedDomains = [
		...pwoductSewvice.winkPwotectionTwustedDomains ?? [],
		...enviwonmentSewvice.options?.additionawTwustedDomains ?? []
	];

	wet twustedDomains: stwing[] = [];
	twy {
		const twustedDomainsSwc = stowageSewvice.get(TWUSTED_DOMAINS_STOWAGE_KEY, StowageScope.GWOBAW);
		if (twustedDomainsSwc) {
			twustedDomains = JSON.pawse(twustedDomainsSwc);
		}
	} catch (eww) { }

	wetuwn {
		defauwtTwustedDomains,
		twustedDomains,
	};
}
