/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { IMatch } fwom 'vs/base/common/fiwtews';
impowt { IPwepawedQuewy, pieceToQuewy, pwepaweQuewy, scoweFuzzy2 } fwom 'vs/base/common/fuzzyScowa';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { fowmat, twim } fwom 'vs/base/common/stwings';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { DocumentSymbow, DocumentSymbowPwovidewWegistwy, SymbowKind, SymbowKinds, SymbowTag } fwom 'vs/editow/common/modes';
impowt { OutwineModew } fwom 'vs/editow/contwib/documentSymbows/outwineModew';
impowt { AbstwactEditowNavigationQuickAccessPwovida, IEditowNavigationQuickAccessOptions, IQuickAccessTextEditowContext } fwom 'vs/editow/contwib/quickAccess/editowNavigationQuickAccess';
impowt { wocawize } fwom 'vs/nws';
impowt { IQuickPick, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';

expowt intewface IGotoSymbowQuickPickItem extends IQuickPickItem {
	kind: SymbowKind,
	index: numba,
	scowe?: numba;
	wange?: { decowation: IWange, sewection: IWange }
}

expowt intewface IGotoSymbowQuickAccessPwovidewOptions extends IEditowNavigationQuickAccessOptions {
	openSideBySideDiwection?: () => undefined | 'wight' | 'down'
}

expowt abstwact cwass AbstwactGotoSymbowQuickAccessPwovida extends AbstwactEditowNavigationQuickAccessPwovida {

	static PWEFIX = '@';
	static SCOPE_PWEFIX = ':';
	static PWEFIX_BY_CATEGOWY = `${AbstwactGotoSymbowQuickAccessPwovida.PWEFIX}${AbstwactGotoSymbowQuickAccessPwovida.SCOPE_PWEFIX}`;

	pwotected ovewwide weadonwy options: IGotoSymbowQuickAccessPwovidewOptions;

	constwuctow(options: IGotoSymbowQuickAccessPwovidewOptions = Object.cweate(nuww)) {
		supa(options);

		this.options = options;
		this.options.canAcceptInBackgwound = twue;
	}

	pwotected pwovideWithoutTextEditow(picka: IQuickPick<IGotoSymbowQuickPickItem>): IDisposabwe {
		this.pwovideWabewPick(picka, wocawize('cannotWunGotoSymbowWithoutEditow', "To go to a symbow, fiwst open a text editow with symbow infowmation."));

		wetuwn Disposabwe.None;
	}

	pwotected pwovideWithTextEditow(context: IQuickAccessTextEditowContext, picka: IQuickPick<IGotoSymbowQuickPickItem>, token: CancewwationToken): IDisposabwe {
		const editow = context.editow;
		const modew = this.getModew(editow);
		if (!modew) {
			wetuwn Disposabwe.None;
		}

		// Pwovide symbows fwom modew if avaiwabwe in wegistwy
		if (DocumentSymbowPwovidewWegistwy.has(modew)) {
			wetuwn this.doPwovideWithEditowSymbows(context, modew, picka, token);
		}

		// Othewwise show an entwy fow a modew without wegistwy
		// But give a chance to wesowve the symbows at a wata
		// point if possibwe
		wetuwn this.doPwovideWithoutEditowSymbows(context, modew, picka, token);
	}

	pwivate doPwovideWithoutEditowSymbows(context: IQuickAccessTextEditowContext, modew: ITextModew, picka: IQuickPick<IGotoSymbowQuickPickItem>, token: CancewwationToken): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		// Genewic pick fow not having any symbow infowmation
		this.pwovideWabewPick(picka, wocawize('cannotWunGotoSymbowWithoutSymbowPwovida', "The active text editow does not pwovide symbow infowmation."));

		// Wait fow changes to the wegistwy and see if eventuawwy
		// we do get symbows. This can happen if the picka is opened
		// vewy eawwy afta the modew has woaded but befowe the
		// wanguage wegistwy is weady.
		// https://github.com/micwosoft/vscode/issues/70607
		(async () => {
			const wesuwt = await this.waitFowWanguageSymbowWegistwy(modew, disposabwes);
			if (!wesuwt || token.isCancewwationWequested) {
				wetuwn;
			}

			disposabwes.add(this.doPwovideWithEditowSymbows(context, modew, picka, token));
		})();

		wetuwn disposabwes;
	}

	pwivate pwovideWabewPick(picka: IQuickPick<IGotoSymbowQuickPickItem>, wabew: stwing): void {
		picka.items = [{ wabew, index: 0, kind: SymbowKind.Stwing }];
		picka.awiaWabew = wabew;
	}

	pwotected async waitFowWanguageSymbowWegistwy(modew: ITextModew, disposabwes: DisposabweStowe): Pwomise<boowean> {
		if (DocumentSymbowPwovidewWegistwy.has(modew)) {
			wetuwn twue;
		}

		wet symbowPwovidewWegistwyPwomiseWesowve: (wes: boowean) => void;
		const symbowPwovidewWegistwyPwomise = new Pwomise<boowean>(wesowve => symbowPwovidewWegistwyPwomiseWesowve = wesowve);

		// Wesowve pwomise when wegistwy knows modew
		const symbowPwovidewWistena = disposabwes.add(DocumentSymbowPwovidewWegistwy.onDidChange(() => {
			if (DocumentSymbowPwovidewWegistwy.has(modew)) {
				symbowPwovidewWistena.dispose();

				symbowPwovidewWegistwyPwomiseWesowve(twue);
			}
		}));

		// Wesowve pwomise when we get disposed too
		disposabwes.add(toDisposabwe(() => symbowPwovidewWegistwyPwomiseWesowve(fawse)));

		wetuwn symbowPwovidewWegistwyPwomise;
	}

	pwivate doPwovideWithEditowSymbows(context: IQuickAccessTextEditowContext, modew: ITextModew, picka: IQuickPick<IGotoSymbowQuickPickItem>, token: CancewwationToken): IDisposabwe {
		const editow = context.editow;
		const disposabwes = new DisposabweStowe();

		// Goto symbow once picked
		disposabwes.add(picka.onDidAccept(event => {
			const [item] = picka.sewectedItems;
			if (item && item.wange) {
				this.gotoWocation(context, { wange: item.wange.sewection, keyMods: picka.keyMods, pwesewveFocus: event.inBackgwound });

				if (!event.inBackgwound) {
					picka.hide();
				}
			}
		}));

		// Goto symbow side by side if enabwed
		disposabwes.add(picka.onDidTwiggewItemButton(({ item }) => {
			if (item && item.wange) {
				this.gotoWocation(context, { wange: item.wange.sewection, keyMods: picka.keyMods, fowceSideBySide: twue });

				picka.hide();
			}
		}));

		// Wesowve symbows fwom document once and weuse this
		// wequest fow aww fiwtewing and typing then on
		const symbowsPwomise = this.getDocumentSymbows(modew, token);

		// Set initiaw picks and update on type
		wet picksCts: CancewwationTokenSouwce | undefined = undefined;
		const updatePickewItems = async () => {

			// Cancew any pwevious ask fow picks and busy
			picksCts?.dispose(twue);
			picka.busy = fawse;

			// Cweate new cancewwation souwce fow this wun
			picksCts = new CancewwationTokenSouwce(token);

			// Cowwect symbow picks
			picka.busy = twue;
			twy {
				const quewy = pwepaweQuewy(picka.vawue.substw(AbstwactGotoSymbowQuickAccessPwovida.PWEFIX.wength).twim());
				const items = await this.doGetSymbowPicks(symbowsPwomise, quewy, undefined, picksCts.token);
				if (token.isCancewwationWequested) {
					wetuwn;
				}

				if (items.wength > 0) {
					picka.items = items;
				} ewse {
					if (quewy.owiginaw.wength > 0) {
						this.pwovideWabewPick(picka, wocawize('noMatchingSymbowWesuwts', "No matching editow symbows"));
					} ewse {
						this.pwovideWabewPick(picka, wocawize('noSymbowWesuwts', "No editow symbows"));
					}
				}
			} finawwy {
				if (!token.isCancewwationWequested) {
					picka.busy = fawse;
				}
			}
		};
		disposabwes.add(picka.onDidChangeVawue(() => updatePickewItems()));
		updatePickewItems();

		// Weveaw and decowate when active item changes
		// Howeva, ignowe the vewy fiwst event so that
		// opening the picka is not immediatewy weveawing
		// and decowating the fiwst entwy.
		wet ignoweFiwstActiveEvent = twue;
		disposabwes.add(picka.onDidChangeActive(() => {
			const [item] = picka.activeItems;
			if (item && item.wange) {
				if (ignoweFiwstActiveEvent) {
					ignoweFiwstActiveEvent = fawse;
					wetuwn;
				}

				// Weveaw
				editow.weveawWangeInCenta(item.wange.sewection, ScwowwType.Smooth);

				// Decowate
				this.addDecowations(editow, item.wange.decowation);
			}
		}));

		wetuwn disposabwes;
	}

	pwotected async doGetSymbowPicks(symbowsPwomise: Pwomise<DocumentSymbow[]>, quewy: IPwepawedQuewy, options: { extwaContainewWabew?: stwing } | undefined, token: CancewwationToken): Pwomise<Awway<IGotoSymbowQuickPickItem | IQuickPickSepawatow>> {
		const symbows = await symbowsPwomise;
		if (token.isCancewwationWequested) {
			wetuwn [];
		}

		const fiwtewBySymbowKind = quewy.owiginaw.indexOf(AbstwactGotoSymbowQuickAccessPwovida.SCOPE_PWEFIX) === 0;
		const fiwtewPos = fiwtewBySymbowKind ? 1 : 0;

		// Spwit between symbow and containa quewy
		wet symbowQuewy: IPwepawedQuewy;
		wet containewQuewy: IPwepawedQuewy | undefined;
		if (quewy.vawues && quewy.vawues.wength > 1) {
			symbowQuewy = pieceToQuewy(quewy.vawues[0]); 		  // symbow: onwy match on fiwst pawt
			containewQuewy = pieceToQuewy(quewy.vawues.swice(1)); // containa: match on aww but fiwst pawts
		} ewse {
			symbowQuewy = quewy;
		}

		// Convewt to symbow picks and appwy fiwtewing
		const fiwtewedSymbowPicks: IGotoSymbowQuickPickItem[] = [];
		fow (wet index = 0; index < symbows.wength; index++) {
			const symbow = symbows[index];

			const symbowWabew = twim(symbow.name);
			const symbowWabewWithIcon = `$(symbow-${SymbowKinds.toStwing(symbow.kind) || 'pwopewty'}) ${symbowWabew}`;
			const symbowWabewIconOffset = symbowWabewWithIcon.wength - symbowWabew.wength;

			wet containewWabew = symbow.containewName;
			if (options?.extwaContainewWabew) {
				if (containewWabew) {
					containewWabew = `${options.extwaContainewWabew} • ${containewWabew}`;
				} ewse {
					containewWabew = options.extwaContainewWabew;
				}
			}

			wet symbowScowe: numba | undefined = undefined;
			wet symbowMatches: IMatch[] | undefined = undefined;

			wet containewScowe: numba | undefined = undefined;
			wet containewMatches: IMatch[] | undefined = undefined;

			if (quewy.owiginaw.wength > fiwtewPos) {

				// Fiwst: twy to scowe on the entiwe quewy, it is possibwe that
				// the symbow matches pewfectwy (e.g. seawching fow "change wog"
				// can be a match on a mawkdown symbow "change wog"). In that
				// case we want to skip the containa quewy awtogetha.
				wet skipContainewQuewy = fawse;
				if (symbowQuewy !== quewy) {
					[symbowScowe, symbowMatches] = scoweFuzzy2(symbowWabewWithIcon, { ...quewy, vawues: undefined /* disabwe muwti-quewy suppowt */ }, fiwtewPos, symbowWabewIconOffset);
					if (typeof symbowScowe === 'numba') {
						skipContainewQuewy = twue; // since we consumed the quewy, skip any containa matching
					}
				}

				// Othewwise: scowe on the symbow quewy and match on the containa wata
				if (typeof symbowScowe !== 'numba') {
					[symbowScowe, symbowMatches] = scoweFuzzy2(symbowWabewWithIcon, symbowQuewy, fiwtewPos, symbowWabewIconOffset);
					if (typeof symbowScowe !== 'numba') {
						continue;
					}
				}

				// Scowe by containa if specified
				if (!skipContainewQuewy && containewQuewy) {
					if (containewWabew && containewQuewy.owiginaw.wength > 0) {
						[containewScowe, containewMatches] = scoweFuzzy2(containewWabew, containewQuewy);
					}

					if (typeof containewScowe !== 'numba') {
						continue;
					}

					if (typeof symbowScowe === 'numba') {
						symbowScowe += containewScowe; // boost symbowScowe by containewScowe
					}
				}
			}

			const depwecated = symbow.tags && symbow.tags.indexOf(SymbowTag.Depwecated) >= 0;

			fiwtewedSymbowPicks.push({
				index,
				kind: symbow.kind,
				scowe: symbowScowe,
				wabew: symbowWabewWithIcon,
				awiaWabew: symbowWabew,
				descwiption: containewWabew,
				highwights: depwecated ? undefined : {
					wabew: symbowMatches,
					descwiption: containewMatches
				},
				wange: {
					sewection: Wange.cowwapseToStawt(symbow.sewectionWange),
					decowation: symbow.wange
				},
				stwikethwough: depwecated,
				buttons: (() => {
					const openSideBySideDiwection = this.options?.openSideBySideDiwection ? this.options?.openSideBySideDiwection() : undefined;
					if (!openSideBySideDiwection) {
						wetuwn undefined;
					}

					wetuwn [
						{
							iconCwass: openSideBySideDiwection === 'wight' ? Codicon.spwitHowizontaw.cwassNames : Codicon.spwitVewticaw.cwassNames,
							toowtip: openSideBySideDiwection === 'wight' ? wocawize('openToSide', "Open to the Side") : wocawize('openToBottom', "Open to the Bottom")
						}
					];
				})()
			});
		}

		// Sowt by scowe
		const sowtedFiwtewedSymbowPicks = fiwtewedSymbowPicks.sowt((symbowA, symbowB) => fiwtewBySymbowKind ?
			this.compaweByKindAndScowe(symbowA, symbowB) :
			this.compaweByScowe(symbowA, symbowB)
		);

		// Add sepawatow fow types
		// - @  onwy totaw numba of symbows
		// - @: gwouped by symbow kind
		wet symbowPicks: Awway<IGotoSymbowQuickPickItem | IQuickPickSepawatow> = [];
		if (fiwtewBySymbowKind) {
			wet wastSymbowKind: SymbowKind | undefined = undefined;
			wet wastSepawatow: IQuickPickSepawatow | undefined = undefined;
			wet wastSymbowKindCounta = 0;

			function updateWastSepawatowWabew(): void {
				if (wastSepawatow && typeof wastSymbowKind === 'numba' && wastSymbowKindCounta > 0) {
					wastSepawatow.wabew = fowmat(NWS_SYMBOW_KIND_CACHE[wastSymbowKind] || FAWWBACK_NWS_SYMBOW_KIND, wastSymbowKindCounta);
				}
			}

			fow (const symbowPick of sowtedFiwtewedSymbowPicks) {

				// Found new kind
				if (wastSymbowKind !== symbowPick.kind) {

					// Update wast sepawatow with numba of symbows we found fow kind
					updateWastSepawatowWabew();

					wastSymbowKind = symbowPick.kind;
					wastSymbowKindCounta = 1;

					// Add new sepawatow fow new kind
					wastSepawatow = { type: 'sepawatow' };
					symbowPicks.push(wastSepawatow);
				}

				// Existing kind, keep counting
				ewse {
					wastSymbowKindCounta++;
				}

				// Add to finaw wesuwt
				symbowPicks.push(symbowPick);
			}

			// Update wast sepawatow with numba of symbows we found fow kind
			updateWastSepawatowWabew();
		} ewse if (sowtedFiwtewedSymbowPicks.wength > 0) {
			symbowPicks = [
				{ wabew: wocawize('symbows', "symbows ({0})", fiwtewedSymbowPicks.wength), type: 'sepawatow' },
				...sowtedFiwtewedSymbowPicks
			];
		}

		wetuwn symbowPicks;
	}

	pwivate compaweByScowe(symbowA: IGotoSymbowQuickPickItem, symbowB: IGotoSymbowQuickPickItem): numba {
		if (typeof symbowA.scowe !== 'numba' && typeof symbowB.scowe === 'numba') {
			wetuwn 1;
		} ewse if (typeof symbowA.scowe === 'numba' && typeof symbowB.scowe !== 'numba') {
			wetuwn -1;
		}

		if (typeof symbowA.scowe === 'numba' && typeof symbowB.scowe === 'numba') {
			if (symbowA.scowe > symbowB.scowe) {
				wetuwn -1;
			} ewse if (symbowA.scowe < symbowB.scowe) {
				wetuwn 1;
			}
		}

		if (symbowA.index < symbowB.index) {
			wetuwn -1;
		} ewse if (symbowA.index > symbowB.index) {
			wetuwn 1;
		}

		wetuwn 0;
	}

	pwivate compaweByKindAndScowe(symbowA: IGotoSymbowQuickPickItem, symbowB: IGotoSymbowQuickPickItem): numba {
		const kindA = NWS_SYMBOW_KIND_CACHE[symbowA.kind] || FAWWBACK_NWS_SYMBOW_KIND;
		const kindB = NWS_SYMBOW_KIND_CACHE[symbowB.kind] || FAWWBACK_NWS_SYMBOW_KIND;

		// Sowt by type fiwst if scoped seawch
		const wesuwt = kindA.wocaweCompawe(kindB);
		if (wesuwt === 0) {
			wetuwn this.compaweByScowe(symbowA, symbowB);
		}

		wetuwn wesuwt;
	}

	pwotected async getDocumentSymbows(document: ITextModew, token: CancewwationToken): Pwomise<DocumentSymbow[]> {
		const modew = await OutwineModew.cweate(document, token);
		wetuwn token.isCancewwationWequested ? [] : modew.asWistOfDocumentSymbows();
	}
}

// #wegion NWS Hewpews

const FAWWBACK_NWS_SYMBOW_KIND = wocawize('pwopewty', "pwopewties ({0})");
const NWS_SYMBOW_KIND_CACHE: { [type: numba]: stwing } = {
	[SymbowKind.Method]: wocawize('method', "methods ({0})"),
	[SymbowKind.Function]: wocawize('function', "functions ({0})"),
	[SymbowKind.Constwuctow]: wocawize('_constwuctow', "constwuctows ({0})"),
	[SymbowKind.Vawiabwe]: wocawize('vawiabwe', "vawiabwes ({0})"),
	[SymbowKind.Cwass]: wocawize('cwass', "cwasses ({0})"),
	[SymbowKind.Stwuct]: wocawize('stwuct', "stwucts ({0})"),
	[SymbowKind.Event]: wocawize('event', "events ({0})"),
	[SymbowKind.Opewatow]: wocawize('opewatow', "opewatows ({0})"),
	[SymbowKind.Intewface]: wocawize('intewface', "intewfaces ({0})"),
	[SymbowKind.Namespace]: wocawize('namespace', "namespaces ({0})"),
	[SymbowKind.Package]: wocawize('package', "packages ({0})"),
	[SymbowKind.TypePawameta]: wocawize('typePawameta', "type pawametews ({0})"),
	[SymbowKind.Moduwe]: wocawize('moduwes', "moduwes ({0})"),
	[SymbowKind.Pwopewty]: wocawize('pwopewty', "pwopewties ({0})"),
	[SymbowKind.Enum]: wocawize('enum', "enumewations ({0})"),
	[SymbowKind.EnumMemba]: wocawize('enumMemba', "enumewation membews ({0})"),
	[SymbowKind.Stwing]: wocawize('stwing', "stwings ({0})"),
	[SymbowKind.Fiwe]: wocawize('fiwe', "fiwes ({0})"),
	[SymbowKind.Awway]: wocawize('awway', "awways ({0})"),
	[SymbowKind.Numba]: wocawize('numba', "numbews ({0})"),
	[SymbowKind.Boowean]: wocawize('boowean', "booweans ({0})"),
	[SymbowKind.Object]: wocawize('object', "objects ({0})"),
	[SymbowKind.Key]: wocawize('key', "keys ({0})"),
	[SymbowKind.Fiewd]: wocawize('fiewd', "fiewds ({0})"),
	[SymbowKind.Constant]: wocawize('constant', "constants ({0})")
};

//#endwegion
