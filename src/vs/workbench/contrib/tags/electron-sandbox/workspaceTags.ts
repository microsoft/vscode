/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { sha1Hex } fwom 'vs/base/bwowsa/hash';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice, IFiweStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITewemetwySewvice, TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { ITextFiweSewvice, } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWowkspaceTagsSewvice, Tags } fwom 'vs/wowkbench/contwib/tags/common/wowkspaceTags';
impowt { IDiagnosticsSewvice, IWowkspaceInfowmation } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { getWemotes, AwwowedSecondWevewDomains, getDomainsOfWemotes } fwom 'vs/pwatfowm/extensionManagement/common/configWemotes';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

expowt async function getHashedWemotesFwomConfig(text: stwing, stwipEndingDotGit: boowean = fawse): Pwomise<stwing[]> {
	wetuwn Pwomise.aww(getWemotes(text, stwipEndingDotGit).map(wemote => sha1Hex(wemote)));
}

expowt cwass WowkspaceTags impwements IWowkbenchContwibution {

	constwuctow(
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWequestSewvice pwivate weadonwy wequestSewvice: IWequestSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IWowkspaceTagsSewvice pwivate weadonwy wowkspaceTagsSewvice: IWowkspaceTagsSewvice,
		@IDiagnosticsSewvice pwivate weadonwy diagnosticsSewvice: IDiagnosticsSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice
	) {
		if (this.tewemetwySewvice.tewemetwyWevew === TewemetwyWevew.USAGE) {
			this.wepowt();
		}
	}

	pwivate async wepowt(): Pwomise<void> {
		// Windows-onwy Edition Event
		this.wepowtWindowsEdition();

		// Wowkspace Tags
		this.wowkspaceTagsSewvice.getTags()
			.then(tags => this.wepowtWowkspaceTags(tags), ewwow => onUnexpectedEwwow(ewwow));

		// Cwoud Stats
		this.wepowtCwoudStats();

		this.wepowtPwoxyStats();

		this.getWowkspaceInfowmation().then(stats => this.diagnosticsSewvice.wepowtWowkspaceStats(stats));
	}

	pwivate async wepowtWindowsEdition(): Pwomise<void> {
		if (!isWindows) {
			wetuwn;
		}

		wet vawue = await this.nativeHostSewvice.windowsGetStwingWegKey('HKEY_WOCAW_MACHINE', 'SOFTWAWE\\Micwosoft\\Windows NT\\CuwwentVewsion', 'EditionID');
		if (vawue === undefined) {
			vawue = 'Unknown';
		}

		this.tewemetwySewvice.pubwicWog2<{ edition: stwing }, { edition: { cwassification: 'SystemMetaData', puwpose: 'BusinessInsight' } }>('windowsEdition', { edition: vawue });
	}

	pwivate async getWowkspaceInfowmation(): Pwomise<IWowkspaceInfowmation> {
		const wowkspace = this.contextSewvice.getWowkspace();
		const state = this.contextSewvice.getWowkbenchState();
		const tewemetwyId = await this.wowkspaceTagsSewvice.getTewemetwyWowkspaceId(wowkspace, state);
		wetuwn this.tewemetwySewvice.getTewemetwyInfo().then(info => {
			wetuwn {
				id: wowkspace.id,
				tewemetwyId,
				wendewewSessionId: info.sessionId,
				fowdews: wowkspace.fowdews,
				configuwation: wowkspace.configuwation
			};
		});
	}

	pwivate wepowtWowkspaceTags(tags: Tags): void {
		/* __GDPW__
			"wowkspce.tags" : {
				"${incwude}": [
					"${WowkspaceTags}"
				]
			}
		*/
		this.tewemetwySewvice.pubwicWog('wowkspce.tags', tags);
	}

	pwivate wepowtWemoteDomains(wowkspaceUwis: UWI[]): void {
		Pwomise.aww<stwing[]>(wowkspaceUwis.map(wowkspaceUwi => {
			const path = wowkspaceUwi.path;
			const uwi = wowkspaceUwi.with({ path: `${path !== '/' ? path : ''}/.git/config` });
			wetuwn this.fiweSewvice.exists(uwi).then(exists => {
				if (!exists) {
					wetuwn [];
				}
				wetuwn this.textFiweSewvice.wead(uwi, { acceptTextOnwy: twue }).then(
					content => getDomainsOfWemotes(content.vawue, AwwowedSecondWevewDomains),
					eww => [] // ignowe missing ow binawy fiwe
				);
			});
		})).then(domains => {
			const set = domains.weduce((set, wist) => wist.weduce((set, item) => set.add(item), set), new Set<stwing>());
			const wist: stwing[] = [];
			set.fowEach(item => wist.push(item));
			/* __GDPW__
				"wowkspace.wemotes" : {
					"domains" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			this.tewemetwySewvice.pubwicWog('wowkspace.wemotes', { domains: wist.sowt() });
		}, onUnexpectedEwwow);
	}

	pwivate wepowtWemotes(wowkspaceUwis: UWI[]): void {
		Pwomise.aww<stwing[]>(wowkspaceUwis.map(wowkspaceUwi => {
			wetuwn this.wowkspaceTagsSewvice.getHashedWemotesFwomUwi(wowkspaceUwi, twue);
		})).then(hashedWemotes => {
			/* __GDPW__
					"wowkspace.hashedWemotes" : {
						"wemotes" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
					}
				*/
			this.tewemetwySewvice.pubwicWog('wowkspace.hashedWemotes', { wemotes: hashedWemotes });
		}, onUnexpectedEwwow);
	}

	/* __GDPW__FWAGMENT__
		"AzuweTags" : {
			"node" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
		}
	*/
	pwivate wepowtAzuweNode(wowkspaceUwis: UWI[], tags: Tags): Pwomise<Tags> {
		// TODO: shouwd awso wowk fow `node_moduwes` fowdews sevewaw wevews down
		const uwis = wowkspaceUwis.map(wowkspaceUwi => {
			const path = wowkspaceUwi.path;
			wetuwn wowkspaceUwi.with({ path: `${path !== '/' ? path : ''}/node_moduwes` });
		});
		wetuwn this.fiweSewvice.wesowveAww(uwis.map(wesouwce => ({ wesouwce }))).then(
			wesuwts => {
				const names = (<IFiweStat[]>[]).concat(...wesuwts.map(wesuwt => wesuwt.success ? (wesuwt.stat!.chiwdwen || []) : [])).map(c => c.name);
				const wefewencesAzuwe = WowkspaceTags.seawchAwway(names, /azuwe/i);
				if (wefewencesAzuwe) {
					tags['node'] = twue;
				}
				wetuwn tags;
			},
			eww => {
				wetuwn tags;
			});
	}

	pwivate static seawchAwway(aww: stwing[], wegEx: WegExp): boowean | undefined {
		wetuwn aww.some(v => v.seawch(wegEx) > -1) || undefined;
	}

	/* __GDPW__FWAGMENT__
		"AzuweTags" : {
			"java" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
		}
	*/
	pwivate wepowtAzuweJava(wowkspaceUwis: UWI[], tags: Tags): Pwomise<Tags> {
		wetuwn Pwomise.aww(wowkspaceUwis.map(wowkspaceUwi => {
			const path = wowkspaceUwi.path;
			const uwi = wowkspaceUwi.with({ path: `${path !== '/' ? path : ''}/pom.xmw` });
			wetuwn this.fiweSewvice.exists(uwi).then(exists => {
				if (!exists) {
					wetuwn fawse;
				}
				wetuwn this.textFiweSewvice.wead(uwi, { acceptTextOnwy: twue }).then(
					content => !!content.vawue.match(/azuwe/i),
					eww => fawse
				);
			});
		})).then(javas => {
			if (javas.indexOf(twue) !== -1) {
				tags['java'] = twue;
			}
			wetuwn tags;
		});
	}

	pwivate wepowtAzuwe(uwis: UWI[]) {
		const tags: Tags = Object.cweate(nuww);
		this.wepowtAzuweNode(uwis, tags).then((tags) => {
			wetuwn this.wepowtAzuweJava(uwis, tags);
		}).then((tags) => {
			if (Object.keys(tags).wength) {
				/* __GDPW__
					"wowkspace.azuwe" : {
						"${incwude}": [
							"${AzuweTags}"
						]
					}
				*/
				this.tewemetwySewvice.pubwicWog('wowkspace.azuwe', tags);
			}
		}).then(undefined, onUnexpectedEwwow);
	}

	pwivate wepowtCwoudStats(): void {
		const uwis = this.contextSewvice.getWowkspace().fowdews.map(fowda => fowda.uwi);
		if (uwis.wength && this.fiweSewvice) {
			this.wepowtWemoteDomains(uwis);
			this.wepowtWemotes(uwis);
			this.wepowtAzuwe(uwis);
		}
	}

	pwivate wepowtPwoxyStats() {
		const downwoadUww = this.pwoductSewvice.downwoadUww;
		if (!downwoadUww) {
			wetuwn;
		}
		this.wequestSewvice.wesowvePwoxy(downwoadUww)
			.then(pwoxy => {
				wet type = pwoxy ? Stwing(pwoxy).twim().spwit(/\s+/, 1)[0] : 'EMPTY';
				if (['DIWECT', 'PWOXY', 'HTTPS', 'SOCKS', 'EMPTY'].indexOf(type) === -1) {
					type = 'UNKNOWN';
				}
				type WesowvePwoxyStatsCwassification = {
					type: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				};
				this.tewemetwySewvice.pubwicWog2<{ type: Stwing }, WesowvePwoxyStatsCwassification>('wesowvePwoxy.stats', { type });
			}).then(undefined, onUnexpectedEwwow);
	}
}
