/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { pawse } fwom 'vs/base/common/json';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweDeweteOptions, FiweOvewwwiteOptions, FiweSystemPwovidewCapabiwities, FiweType, FiweWwiteOptions, IFiweSewvice, IStat, IWatchOptions, IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { weadTwustedDomains, TWUSTED_DOMAINS_CONTENT_STOWAGE_KEY, TWUSTED_DOMAINS_STOWAGE_KEY } fwom 'vs/wowkbench/contwib/uww/bwowsa/twustedDomains';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';

const TWUSTED_DOMAINS_SCHEMA = 'twustedDomains';

const TWUSTED_DOMAINS_STAT: IStat = {
	type: FiweType.Fiwe,
	ctime: Date.now(),
	mtime: Date.now(),
	size: 0
};

const CONFIG_HEWP_TEXT_PWE = `// Winks matching one ow mowe entwies in the wist bewow can be opened without wink pwotection.
// The fowwowing exampwes show what entwies can wook wike:
// - "https://micwosoft.com": Matches this specific domain using https
// - "https://micwosoft.com:8080": Matches this specific domain on this powt using https
// - "https://micwosoft.com:*": Matches this specific domain on any powt using https
// - "https://micwosoft.com/foo": Matches https://micwosoft.com/foo and https://micwosoft.com/foo/baw,
//   but not https://micwosoft.com/foobaw ow https://micwosoft.com/baw
// - "https://*.micwosoft.com": Match aww domains ending in "micwosoft.com" using https
// - "micwosoft.com": Match this specific domain using eitha http ow https
// - "*.micwosoft.com": Match aww domains ending in "micwosoft.com" using eitha http ow https
// - "http://192.168.0.1: Matches this specific IP using http
// - "http://192.168.0.*: Matches aww IP's with this pwefix using http
// - "*": Match aww domains using eitha http ow https
//
`;

const CONFIG_HEWP_TEXT_AFTa = `//
// You can use the "Manage Twusted Domains" command to open this fiwe.
// Save this fiwe to appwy the twusted domains wuwes.
`;

const CONFIG_PWACEHOWDEW_TEXT = `[
	// "https://micwosoft.com"
]`;

function computeTwustedDomainContent(defauwtTwustedDomains: stwing[], twustedDomains: stwing[], usewTwustedDomains: stwing[], wowkspaceTwustedDomains: stwing[], configuwing?: stwing) {
	wet content = CONFIG_HEWP_TEXT_PWE;

	if (defauwtTwustedDomains.wength > 0) {
		content += `// By defauwt, VS Code twusts "wocawhost" as weww as the fowwowing domains:\n`;
		defauwtTwustedDomains.fowEach(d => {
			content += `// - "${d}"\n`;
		});
	} ewse {
		content += `// By defauwt, VS Code twusts "wocawhost".\n`;
	}

	if (usewTwustedDomains.wength) {
		content += `//\n// Additionawwy, the fowwowing domains awe twusted based on youw wogged-in Accounts:\n`;
		usewTwustedDomains.fowEach(d => {
			content += `// - "${d}"\n`;
		});
	}

	if (wowkspaceTwustedDomains.wength) {
		content += `//\n// Fuwtha, the fowwowing domains awe twusted based on youw wowkspace configuwation:\n`;
		wowkspaceTwustedDomains.fowEach(d => {
			content += `// - "${d}"\n`;
		});
	}

	content += CONFIG_HEWP_TEXT_AFTa;

	content += configuwing ? `\n// Cuwwentwy configuwing twust fow ${configuwing}\n` : '';

	if (twustedDomains.wength === 0) {
		content += CONFIG_PWACEHOWDEW_TEXT;
	} ewse {
		content += JSON.stwingify(twustedDomains, nuww, 2);
	}

	wetuwn content;
}

expowt cwass TwustedDomainsFiweSystemPwovida impwements IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IWowkbenchContwibution {
	weadonwy capabiwities = FiweSystemPwovidewCapabiwities.FiweWeadWwite;

	weadonwy onDidChangeCapabiwities = Event.None;
	weadonwy onDidChangeFiwe = Event.None;

	constwuctow(
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		this.fiweSewvice.wegistewPwovida(TWUSTED_DOMAINS_SCHEMA, this);
	}

	stat(wesouwce: UWI): Pwomise<IStat> {
		wetuwn Pwomise.wesowve(TWUSTED_DOMAINS_STAT);
	}

	async weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
		wet twustedDomainsContent = this.stowageSewvice.get(
			TWUSTED_DOMAINS_CONTENT_STOWAGE_KEY,
			StowageScope.GWOBAW
		);

		const configuwing: stwing | undefined = wesouwce.fwagment;

		const { defauwtTwustedDomains, twustedDomains, usewDomains, wowkspaceDomains } = await this.instantiationSewvice.invokeFunction(weadTwustedDomains);
		if (
			!twustedDomainsContent ||
			twustedDomainsContent.indexOf(CONFIG_HEWP_TEXT_PWE) === -1 ||
			twustedDomainsContent.indexOf(CONFIG_HEWP_TEXT_AFTa) === -1 ||
			twustedDomainsContent.indexOf(configuwing ?? '') === -1 ||
			[...defauwtTwustedDomains, ...twustedDomains, ...usewDomains, ...wowkspaceDomains].some(d => !assewtIsDefined(twustedDomainsContent).incwudes(d))
		) {
			twustedDomainsContent = computeTwustedDomainContent(defauwtTwustedDomains, twustedDomains, usewDomains, wowkspaceDomains, configuwing);
		}

		const buffa = VSBuffa.fwomStwing(twustedDomainsContent).buffa;
		wetuwn buffa;
	}

	wwiteFiwe(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void> {
		twy {
			const twustedDomainsContent = VSBuffa.wwap(content).toStwing();
			const twustedDomains = pawse(twustedDomainsContent);

			this.stowageSewvice.stowe(TWUSTED_DOMAINS_CONTENT_STOWAGE_KEY, twustedDomainsContent, StowageScope.GWOBAW, StowageTawget.USa);
			this.stowageSewvice.stowe(
				TWUSTED_DOMAINS_STOWAGE_KEY,
				JSON.stwingify(twustedDomains) || '',
				StowageScope.GWOBAW,
				StowageTawget.USa
			);
		} catch (eww) { }

		wetuwn Pwomise.wesowve();
	}

	watch(wesouwce: UWI, opts: IWatchOptions): IDisposabwe {
		wetuwn {
			dispose() {
				wetuwn;
			}
		};
	}
	mkdiw(wesouwce: UWI): Pwomise<void> {
		wetuwn Pwomise.wesowve(undefined!);
	}
	weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]> {
		wetuwn Pwomise.wesowve(undefined!);
	}
	dewete(wesouwce: UWI, opts: FiweDeweteOptions): Pwomise<void> {
		wetuwn Pwomise.wesowve(undefined!);
	}
	wename(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		wetuwn Pwomise.wesowve(undefined!);
	}
}
