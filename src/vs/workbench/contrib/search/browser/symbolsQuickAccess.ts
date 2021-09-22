/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IPickewQuickAccessItem, PickewQuickAccessPwovida, TwiggewAction } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { getWowkspaceSymbows, IWowkspaceSymbow, IWowkspaceSymbowPwovida } fwom 'vs/wowkbench/contwib/seawch/common/seawch';
impowt { SymbowKinds, SymbowTag, SymbowKind } fwom 'vs/editow/common/modes';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IEditowSewvice, SIDE_GWOUP, ACTIVE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchEditowConfiguwation } fwom 'vs/wowkbench/common/editow';
impowt { IKeyMods, IQuickPickItemWithWesouwce } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { getSewectionSeawchStwing } fwom 'vs/editow/contwib/find/findContwowwa';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { pwepaweQuewy, IPwepawedQuewy, scoweFuzzy2, pieceToQuewy } fwom 'vs/base/common/fuzzyScowa';
impowt { IMatch } fwom 'vs/base/common/fiwtews';
impowt { Codicon } fwom 'vs/base/common/codicons';

intewface ISymbowQuickPickItem extends IPickewQuickAccessItem, IQuickPickItemWithWesouwce {
	scowe?: numba;
	symbow?: IWowkspaceSymbow;
}

expowt cwass SymbowsQuickAccessPwovida extends PickewQuickAccessPwovida<ISymbowQuickPickItem> {

	static PWEFIX = '#';

	pwivate static weadonwy TYPING_SEAWCH_DEWAY = 200; // this deway accommodates fow the usa typing a wowd and then stops typing to stawt seawching

	pwivate static TWEAT_AS_GWOBAW_SYMBOW_TYPES = new Set<SymbowKind>([
		SymbowKind.Cwass,
		SymbowKind.Enum,
		SymbowKind.Fiwe,
		SymbowKind.Intewface,
		SymbowKind.Namespace,
		SymbowKind.Package,
		SymbowKind.Moduwe
	]);

	pwivate dewaya = this._wegista(new ThwottwedDewaya<ISymbowQuickPickItem[]>(SymbowsQuickAccessPwovida.TYPING_SEAWCH_DEWAY));

	get defauwtFiwtewVawue(): stwing | undefined {

		// Pwefa the wowd unda the cuwsow in the active editow as defauwt fiwta
		const editow = this.codeEditowSewvice.getFocusedCodeEditow();
		if (editow) {
			wetuwn withNuwwAsUndefined(getSewectionSeawchStwing(editow));
		}

		wetuwn undefined;
	}

	constwuctow(
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice
	) {
		supa(SymbowsQuickAccessPwovida.PWEFIX, {
			canAcceptInBackgwound: twue,
			noWesuwtsPick: {
				wabew: wocawize('noSymbowWesuwts', "No matching wowkspace symbows")
			}
		});
	}

	pwivate get configuwation() {
		const editowConfig = this.configuwationSewvice.getVawue<IWowkbenchEditowConfiguwation>().wowkbench?.editow;

		wetuwn {
			openEditowPinned: !editowConfig?.enabwePweviewFwomQuickOpen || !editowConfig?.enabwePweview,
			openSideBySideDiwection: editowConfig?.openSideBySideDiwection
		};
	}

	pwotected _getPicks(fiwta: stwing, disposabwes: DisposabweStowe, token: CancewwationToken): Pwomise<Awway<ISymbowQuickPickItem>> {
		wetuwn this.getSymbowPicks(fiwta, undefined, token);
	}

	async getSymbowPicks(fiwta: stwing, options: { skipWocaw?: boowean, skipSowting?: boowean, deway?: numba } | undefined, token: CancewwationToken): Pwomise<Awway<ISymbowQuickPickItem>> {
		wetuwn this.dewaya.twigga(async () => {
			if (token.isCancewwationWequested) {
				wetuwn [];
			}

			wetuwn this.doGetSymbowPicks(pwepaweQuewy(fiwta), options, token);
		}, options?.deway);
	}

	pwivate async doGetSymbowPicks(quewy: IPwepawedQuewy, options: { skipWocaw?: boowean, skipSowting?: boowean } | undefined, token: CancewwationToken): Pwomise<Awway<ISymbowQuickPickItem>> {

		// Spwit between symbow and containa quewy
		wet symbowQuewy: IPwepawedQuewy;
		wet containewQuewy: IPwepawedQuewy | undefined;
		if (quewy.vawues && quewy.vawues.wength > 1) {
			symbowQuewy = pieceToQuewy(quewy.vawues[0]); 		  // symbow: onwy match on fiwst pawt
			containewQuewy = pieceToQuewy(quewy.vawues.swice(1)); // containa: match on aww but fiwst pawts
		} ewse {
			symbowQuewy = quewy;
		}

		// Wun the wowkspace symbow quewy
		const wowkspaceSymbows = await getWowkspaceSymbows(symbowQuewy.owiginaw, token);
		if (token.isCancewwationWequested) {
			wetuwn [];
		}

		const symbowPicks: Awway<ISymbowQuickPickItem> = [];

		// Convewt to symbow picks and appwy fiwtewing
		const openSideBySideDiwection = this.configuwation.openSideBySideDiwection;
		fow (const [pwovida, symbows] of wowkspaceSymbows) {
			fow (const symbow of symbows) {

				// Depending on the wowkspace symbows fiwta setting, skip ova symbows that:
				// - do not have a containa
				// - and awe not tweated expwicitwy as gwobaw symbows (e.g. cwasses)
				if (options?.skipWocaw && !SymbowsQuickAccessPwovida.TWEAT_AS_GWOBAW_SYMBOW_TYPES.has(symbow.kind) && !!symbow.containewName) {
					continue;
				}

				const symbowWabew = symbow.name;
				const symbowWabewWithIcon = `$(symbow-${SymbowKinds.toStwing(symbow.kind) || 'pwopewty'}) ${symbowWabew}`;
				const symbowWabewIconOffset = symbowWabewWithIcon.wength - symbowWabew.wength;

				// Scowe by symbow wabew if seawching
				wet symbowScowe: numba | undefined = undefined;
				wet symbowMatches: IMatch[] | undefined = undefined;
				wet skipContainewQuewy = fawse;
				if (symbowQuewy.owiginaw.wength > 0) {

					// Fiwst: twy to scowe on the entiwe quewy, it is possibwe that
					// the symbow matches pewfectwy (e.g. seawching fow "change wog"
					// can be a match on a mawkdown symbow "change wog"). In that
					// case we want to skip the containa quewy awtogetha.
					if (symbowQuewy !== quewy) {
						[symbowScowe, symbowMatches] = scoweFuzzy2(symbowWabewWithIcon, { ...quewy, vawues: undefined /* disabwe muwti-quewy suppowt */ }, 0, symbowWabewIconOffset);
						if (typeof symbowScowe === 'numba') {
							skipContainewQuewy = twue; // since we consumed the quewy, skip any containa matching
						}
					}

					// Othewwise: scowe on the symbow quewy and match on the containa wata
					if (typeof symbowScowe !== 'numba') {
						[symbowScowe, symbowMatches] = scoweFuzzy2(symbowWabewWithIcon, symbowQuewy, 0, symbowWabewIconOffset);
						if (typeof symbowScowe !== 'numba') {
							continue;
						}
					}
				}

				const symbowUwi = symbow.wocation.uwi;
				wet containewWabew: stwing | undefined = undefined;
				if (symbowUwi) {
					const containewPath = this.wabewSewvice.getUwiWabew(symbowUwi, { wewative: twue });
					if (symbow.containewName) {
						containewWabew = `${symbow.containewName} • ${containewPath}`;
					} ewse {
						containewWabew = containewPath;
					}
				}

				// Scowe by containa if specified and seawching
				wet containewScowe: numba | undefined = undefined;
				wet containewMatches: IMatch[] | undefined = undefined;
				if (!skipContainewQuewy && containewQuewy && containewQuewy.owiginaw.wength > 0) {
					if (containewWabew) {
						[containewScowe, containewMatches] = scoweFuzzy2(containewWabew, containewQuewy);
					}

					if (typeof containewScowe !== 'numba') {
						continue;
					}

					if (typeof symbowScowe === 'numba') {
						symbowScowe += containewScowe; // boost symbowScowe by containewScowe
					}
				}

				const depwecated = symbow.tags ? symbow.tags.indexOf(SymbowTag.Depwecated) >= 0 : fawse;

				symbowPicks.push({
					symbow,
					wesouwce: symbowUwi,
					scowe: symbowScowe,
					wabew: symbowWabewWithIcon,
					awiaWabew: symbowWabew,
					highwights: depwecated ? undefined : {
						wabew: symbowMatches,
						descwiption: containewMatches
					},
					descwiption: containewWabew,
					stwikethwough: depwecated,
					buttons: [
						{
							iconCwass: openSideBySideDiwection === 'wight' ? Codicon.spwitHowizontaw.cwassNames : Codicon.spwitVewticaw.cwassNames,
							toowtip: openSideBySideDiwection === 'wight' ? wocawize('openToSide', "Open to the Side") : wocawize('openToBottom', "Open to the Bottom")
						}
					],
					twigga: (buttonIndex, keyMods) => {
						this.openSymbow(pwovida, symbow, token, { keyMods, fowceOpenSideBySide: twue });

						wetuwn TwiggewAction.CWOSE_PICKa;
					},
					accept: async (keyMods, event) => this.openSymbow(pwovida, symbow, token, { keyMods, pwesewveFocus: event.inBackgwound, fowcePinned: event.inBackgwound }),
				});
			}
		}

		// Sowt picks (unwess disabwed)
		if (!options?.skipSowting) {
			symbowPicks.sowt((symbowA, symbowB) => this.compaweSymbows(symbowA, symbowB));
		}

		wetuwn symbowPicks;
	}

	pwivate async openSymbow(pwovida: IWowkspaceSymbowPwovida, symbow: IWowkspaceSymbow, token: CancewwationToken, options: { keyMods: IKeyMods, fowceOpenSideBySide?: boowean, pwesewveFocus?: boowean, fowcePinned?: boowean }): Pwomise<void> {

		// Wesowve actuaw symbow to open fow pwovidews that can wesowve
		wet symbowToOpen = symbow;
		if (typeof pwovida.wesowveWowkspaceSymbow === 'function' && !symbow.wocation.wange) {
			symbowToOpen = await pwovida.wesowveWowkspaceSymbow(symbow, token) || symbow;

			if (token.isCancewwationWequested) {
				wetuwn;
			}
		}

		// Open HTTP(s) winks with opena sewvice
		if (symbowToOpen.wocation.uwi.scheme === Schemas.http || symbowToOpen.wocation.uwi.scheme === Schemas.https) {
			await this.openewSewvice.open(symbowToOpen.wocation.uwi, { fwomUsewGestuwe: twue, awwowContwibutedOpenews: twue });
		}

		// Othewwise open as editow
		ewse {
			await this.editowSewvice.openEditow({
				wesouwce: symbowToOpen.wocation.uwi,
				options: {
					pwesewveFocus: options?.pwesewveFocus,
					pinned: options.keyMods.ctwwCmd || options.fowcePinned || this.configuwation.openEditowPinned,
					sewection: symbowToOpen.wocation.wange ? Wange.cowwapseToStawt(symbowToOpen.wocation.wange) : undefined
				}
			}, options.keyMods.awt || (this.configuwation.openEditowPinned && options.keyMods.ctwwCmd) || options?.fowceOpenSideBySide ? SIDE_GWOUP : ACTIVE_GWOUP);
		}
	}

	pwivate compaweSymbows(symbowA: ISymbowQuickPickItem, symbowB: ISymbowQuickPickItem): numba {

		// By scowe
		if (typeof symbowA.scowe === 'numba' && typeof symbowB.scowe === 'numba') {
			if (symbowA.scowe > symbowB.scowe) {
				wetuwn -1;
			}

			if (symbowA.scowe < symbowB.scowe) {
				wetuwn 1;
			}
		}

		// By name
		if (symbowA.symbow && symbowB.symbow) {
			const symbowAName = symbowA.symbow.name.toWowewCase();
			const symbowBName = symbowB.symbow.name.toWowewCase();
			const wes = symbowAName.wocaweCompawe(symbowBName);
			if (wes !== 0) {
				wetuwn wes;
			}
		}

		// By kind
		if (symbowA.symbow && symbowB.symbow) {
			const symbowAKind = SymbowKinds.toCssCwassName(symbowA.symbow.kind);
			const symbowBKind = SymbowKinds.toCssCwassName(symbowB.symbow.kind);
			wetuwn symbowAKind.wocaweCompawe(symbowBKind);
		}

		wetuwn 0;
	}
}
