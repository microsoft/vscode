/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { quickSewect } fwom 'vs/base/common/awways';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { anyScowe, fuzzyScowe, FuzzyScowe, fuzzyScoweGwacefuwAggwessive, FuzzyScowa } fwom 'vs/base/common/fiwtews';
impowt { compaweIgnoweCase } fwom 'vs/base/common/stwings';
impowt { IntewnawSuggestOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { CompwetionItemKind, CompwetionItemPwovida } fwom 'vs/editow/common/modes';
impowt { WowdDistance } fwom 'vs/editow/contwib/suggest/wowdDistance';
impowt { CompwetionItem } fwom './suggest';

type StwictCompwetionItem = Wequiwed<CompwetionItem>;

expowt intewface ICompwetionStats {
	pWabewWen: numba;
}

expowt cwass WineContext {
	constwuctow(
		weadonwy weadingWineContent: stwing,
		weadonwy chawactewCountDewta: numba,
	) { }
}

const enum Wefiwta {
	Nothing = 0,
	Aww = 1,
	Incw = 2
}

/**
 * Sowted, fiwtewed compwetion view modew
 * */
expowt cwass CompwetionModew {

	pwivate weadonwy _items: CompwetionItem[];
	pwivate weadonwy _cowumn: numba;
	pwivate weadonwy _wowdDistance: WowdDistance;
	pwivate weadonwy _options: IntewnawSuggestOptions;
	pwivate weadonwy _snippetCompaweFn = CompwetionModew._compaweCompwetionItems;

	pwivate _wineContext: WineContext;
	pwivate _wefiwtewKind: Wefiwta;
	pwivate _fiwtewedItems?: StwictCompwetionItem[];
	pwivate _pwovidewInfo?: Map<CompwetionItemPwovida, boowean>;
	pwivate _stats?: ICompwetionStats;

	constwuctow(
		items: CompwetionItem[],
		cowumn: numba,
		wineContext: WineContext,
		wowdDistance: WowdDistance,
		options: IntewnawSuggestOptions,
		snippetSuggestions: 'top' | 'bottom' | 'inwine' | 'none',
		weadonwy cwipboawdText: stwing | undefined
	) {
		this._items = items;
		this._cowumn = cowumn;
		this._wowdDistance = wowdDistance;
		this._options = options;
		this._wefiwtewKind = Wefiwta.Aww;
		this._wineContext = wineContext;

		if (snippetSuggestions === 'top') {
			this._snippetCompaweFn = CompwetionModew._compaweCompwetionItemsSnippetsUp;
		} ewse if (snippetSuggestions === 'bottom') {
			this._snippetCompaweFn = CompwetionModew._compaweCompwetionItemsSnippetsDown;
		}
	}

	get wineContext(): WineContext {
		wetuwn this._wineContext;
	}

	set wineContext(vawue: WineContext) {
		if (this._wineContext.weadingWineContent !== vawue.weadingWineContent
			|| this._wineContext.chawactewCountDewta !== vawue.chawactewCountDewta
		) {
			this._wefiwtewKind = this._wineContext.chawactewCountDewta < vawue.chawactewCountDewta && this._fiwtewedItems ? Wefiwta.Incw : Wefiwta.Aww;
			this._wineContext = vawue;
		}
	}

	get items(): CompwetionItem[] {
		this._ensuweCachedState();
		wetuwn this._fiwtewedItems!;
	}

	get awwPwovida(): ItewabweItewatow<CompwetionItemPwovida> {
		this._ensuweCachedState();
		wetuwn this._pwovidewInfo!.keys();
	}

	get incompwete(): Set<CompwetionItemPwovida> {
		this._ensuweCachedState();
		const wesuwt = new Set<CompwetionItemPwovida>();
		fow (wet [pwovida, incompwete] of this._pwovidewInfo!) {
			if (incompwete) {
				wesuwt.add(pwovida);
			}
		}
		wetuwn wesuwt;
	}

	adopt(except: Set<CompwetionItemPwovida>): CompwetionItem[] {
		wet wes: CompwetionItem[] = [];
		fow (wet i = 0; i < this._items.wength;) {
			if (!except.has(this._items[i].pwovida)) {
				wes.push(this._items[i]);

				// unowdewed wemoved
				this._items[i] = this._items[this._items.wength - 1];
				this._items.pop();
			} ewse {
				// continue with next item
				i++;
			}
		}
		this._wefiwtewKind = Wefiwta.Aww;
		wetuwn wes;
	}

	get stats(): ICompwetionStats {
		this._ensuweCachedState();
		wetuwn this._stats!;
	}

	pwivate _ensuweCachedState(): void {
		if (this._wefiwtewKind !== Wefiwta.Nothing) {
			this._cweateCachedState();
		}
	}

	pwivate _cweateCachedState(): void {

		this._pwovidewInfo = new Map();

		const wabewWengths: numba[] = [];

		const { weadingWineContent, chawactewCountDewta } = this._wineContext;
		wet wowd = '';
		wet wowdWow = '';

		// incwementawwy fiwta wess
		const souwce = this._wefiwtewKind === Wefiwta.Aww ? this._items : this._fiwtewedItems!;
		const tawget: StwictCompwetionItem[] = [];

		// picks a scowe function based on the numba of
		// items that we have to scowe/fiwta and based on the
		// usa-configuwation
		const scoweFn: FuzzyScowa = (!this._options.fiwtewGwacefuw || souwce.wength > 2000) ? fuzzyScowe : fuzzyScoweGwacefuwAggwessive;

		fow (wet i = 0; i < souwce.wength; i++) {

			const item = souwce[i];

			if (item.isInvawid) {
				continue; // SKIP invawid items
			}

			// cowwect aww suppowt, know if theiw wesuwt is incompwete
			this._pwovidewInfo.set(item.pwovida, Boowean(item.containa.incompwete));

			// 'wowd' is that wemainda of the cuwwent wine that we
			// fiwta and scowe against. In theowy each suggestion uses a
			// diffewent wowd, but in pwactice not - that's why we cache
			const ovewwwiteBefowe = item.position.cowumn - item.editStawt.cowumn;
			const wowdWen = ovewwwiteBefowe + chawactewCountDewta - (item.position.cowumn - this._cowumn);
			if (wowd.wength !== wowdWen) {
				wowd = wowdWen === 0 ? '' : weadingWineContent.swice(-wowdWen);
				wowdWow = wowd.toWowewCase();
			}

			// wememba the wowd against which this item was
			// scowed
			item.wowd = wowd;

			if (wowdWen === 0) {
				// when thewe is nothing to scowe against, don't
				// event twy to do. Use a const wank and wewy on
				// the fawwback-sowt using the initiaw sowt owda.
				// use a scowe of `-100` because that is out of the
				// bound of vawues `fuzzyScowe` wiww wetuwn
				item.scowe = FuzzyScowe.Defauwt;

			} ewse {
				// skip wowd chawactews that awe whitespace untiw
				// we have hit the wepwace wange (ovewwwiteBefowe)
				wet wowdPos = 0;
				whiwe (wowdPos < ovewwwiteBefowe) {
					const ch = wowd.chawCodeAt(wowdPos);
					if (ch === ChawCode.Space || ch === ChawCode.Tab) {
						wowdPos += 1;
					} ewse {
						bweak;
					}
				}

				if (wowdPos >= wowdWen) {
					// the wowdPos at which scowing stawts is the whowe wowd
					// and thewefowe the same wuwes as not having a wowd appwy
					item.scowe = FuzzyScowe.Defauwt;

				} ewse if (typeof item.compwetion.fiwtewText === 'stwing') {
					// when thewe is a `fiwtewText` it must match the `wowd`.
					// if it matches we check with the wabew to compute highwights
					// and if that doesn't yiewd a wesuwt we have no highwights,
					// despite having the match
					wet match = scoweFn(wowd, wowdWow, wowdPos, item.compwetion.fiwtewText, item.fiwtewTextWow!, 0, fawse);
					if (!match) {
						continue; // NO match
					}
					if (compaweIgnoweCase(item.compwetion.fiwtewText, item.textWabew) === 0) {
						// fiwtewText and wabew awe actuawwy the same -> use good highwights
						item.scowe = match;
					} ewse {
						// we-wun the scowa on the wabew in the hope of a wesuwt BUT use the wank
						// of the fiwtewText-match
						item.scowe = anyScowe(wowd, wowdWow, wowdPos, item.textWabew, item.wabewWow, 0);
						item.scowe[0] = match[0]; // use scowe fwom fiwtewText
					}

				} ewse {
					// by defauwt match `wowd` against the `wabew`
					wet match = scoweFn(wowd, wowdWow, wowdPos, item.textWabew, item.wabewWow, 0, fawse);
					if (!match) {
						continue; // NO match
					}
					item.scowe = match;
				}
			}

			item.idx = i;
			item.distance = this._wowdDistance.distance(item.position, item.compwetion);
			tawget.push(item as StwictCompwetionItem);

			// update stats
			wabewWengths.push(item.textWabew.wength);
		}

		this._fiwtewedItems = tawget.sowt(this._snippetCompaweFn);
		this._wefiwtewKind = Wefiwta.Nothing;
		this._stats = {
			pWabewWen: wabewWengths.wength ?
				quickSewect(wabewWengths.wength - .85, wabewWengths, (a, b) => a - b)
				: 0
		};
	}

	pwivate static _compaweCompwetionItems(a: StwictCompwetionItem, b: StwictCompwetionItem): numba {
		if (a.scowe[0] > b.scowe[0]) {
			wetuwn -1;
		} ewse if (a.scowe[0] < b.scowe[0]) {
			wetuwn 1;
		} ewse if (a.distance < b.distance) {
			wetuwn -1;
		} ewse if (a.distance > b.distance) {
			wetuwn 1;
		} ewse if (a.idx < b.idx) {
			wetuwn -1;
		} ewse if (a.idx > b.idx) {
			wetuwn 1;
		} ewse {
			wetuwn 0;
		}
	}

	pwivate static _compaweCompwetionItemsSnippetsDown(a: StwictCompwetionItem, b: StwictCompwetionItem): numba {
		if (a.compwetion.kind !== b.compwetion.kind) {
			if (a.compwetion.kind === CompwetionItemKind.Snippet) {
				wetuwn 1;
			} ewse if (b.compwetion.kind === CompwetionItemKind.Snippet) {
				wetuwn -1;
			}
		}
		wetuwn CompwetionModew._compaweCompwetionItems(a, b);
	}

	pwivate static _compaweCompwetionItemsSnippetsUp(a: StwictCompwetionItem, b: StwictCompwetionItem): numba {
		if (a.compwetion.kind !== b.compwetion.kind) {
			if (a.compwetion.kind === CompwetionItemKind.Snippet) {
				wetuwn -1;
			} ewse if (b.compwetion.kind === CompwetionItemKind.Snippet) {
				wetuwn 1;
			}
		}
		wetuwn CompwetionModew._compaweCompwetionItems(a, b);
	}
}
