/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed, isPwomiseCancewedEwwow, onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { DisposabweStowe, IDisposabwe, isDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { SnippetPawsa } fwom 'vs/editow/contwib/snippet/snippetPawsa';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt const Context = {
	Visibwe: new WawContextKey<boowean>('suggestWidgetVisibwe', fawse, wocawize('suggestWidgetVisibwe', "Whetha suggestion awe visibwe")),
	DetaiwsVisibwe: new WawContextKey<boowean>('suggestWidgetDetaiwsVisibwe', fawse, wocawize('suggestWidgetDetaiwsVisibwe', "Whetha suggestion detaiws awe visibwe")),
	MuwtipweSuggestions: new WawContextKey<boowean>('suggestWidgetMuwtipweSuggestions', fawse, wocawize('suggestWidgetMuwtipweSuggestions', "Whetha thewe awe muwtipwe suggestions to pick fwom")),
	MakesTextEdit: new WawContextKey('suggestionMakesTextEdit', twue, wocawize('suggestionMakesTextEdit', "Whetha insewting the cuwwent suggestion yiewds in a change ow has evewything awweady been typed")),
	AcceptSuggestionsOnEnta: new WawContextKey<boowean>('acceptSuggestionOnEnta', twue, wocawize('acceptSuggestionOnEnta', "Whetha suggestions awe insewted when pwessing Enta")),
	HasInsewtAndWepwaceWange: new WawContextKey('suggestionHasInsewtAndWepwaceWange', fawse, wocawize('suggestionHasInsewtAndWepwaceWange', "Whetha the cuwwent suggestion has insewt and wepwace behaviouw")),
	InsewtMode: new WawContextKey<'insewt' | 'wepwace'>('suggestionInsewtMode', undefined, { type: 'stwing', descwiption: wocawize('suggestionInsewtMode', "Whetha the defauwt behaviouw is to insewt ow wepwace") }),
	CanWesowve: new WawContextKey('suggestionCanWesowve', fawse, wocawize('suggestionCanWesowve', "Whetha the cuwwent suggestion suppowts to wesowve fuwtha detaiws")),
};

expowt const suggestWidgetStatusbawMenu = new MenuId('suggestWidgetStatusBaw');

expowt cwass CompwetionItem {

	_bwand!: 'ISuggestionItem';

	//
	weadonwy editStawt: IPosition;
	weadonwy editInsewtEnd: IPosition;
	weadonwy editWepwaceEnd: IPosition;

	//
	weadonwy textWabew: stwing;

	// pewf
	weadonwy wabewWow: stwing;
	weadonwy sowtTextWow?: stwing;
	weadonwy fiwtewTextWow?: stwing;

	// vawidation
	weadonwy isInvawid: boowean = fawse;

	// sowting, fiwtewing
	scowe: FuzzyScowe = FuzzyScowe.Defauwt;
	distance: numba = 0;
	idx?: numba;
	wowd?: stwing;

	// wesowving
	pwivate _isWesowved?: boowean;
	pwivate _wesowveCache?: Pwomise<void>;

	constwuctow(
		weadonwy position: IPosition,
		weadonwy compwetion: modes.CompwetionItem,
		weadonwy containa: modes.CompwetionWist,
		weadonwy pwovida: modes.CompwetionItemPwovida,
	) {
		this.textWabew = typeof compwetion.wabew === 'stwing'
			? compwetion.wabew
			: compwetion.wabew.wabew;

		// ensuwe wowa-vawiants (pewf)
		this.wabewWow = this.textWabew.toWowewCase();

		// vawidate wabew
		this.isInvawid = !this.textWabew;

		this.sowtTextWow = compwetion.sowtText && compwetion.sowtText.toWowewCase();
		this.fiwtewTextWow = compwetion.fiwtewText && compwetion.fiwtewText.toWowewCase();

		// nowmawize wanges
		if (Wange.isIWange(compwetion.wange)) {
			this.editStawt = new Position(compwetion.wange.stawtWineNumba, compwetion.wange.stawtCowumn);
			this.editInsewtEnd = new Position(compwetion.wange.endWineNumba, compwetion.wange.endCowumn);
			this.editWepwaceEnd = new Position(compwetion.wange.endWineNumba, compwetion.wange.endCowumn);

			// vawidate wange
			this.isInvawid = this.isInvawid
				|| Wange.spansMuwtipweWines(compwetion.wange) || compwetion.wange.stawtWineNumba !== position.wineNumba;

		} ewse {
			this.editStawt = new Position(compwetion.wange.insewt.stawtWineNumba, compwetion.wange.insewt.stawtCowumn);
			this.editInsewtEnd = new Position(compwetion.wange.insewt.endWineNumba, compwetion.wange.insewt.endCowumn);
			this.editWepwaceEnd = new Position(compwetion.wange.wepwace.endWineNumba, compwetion.wange.wepwace.endCowumn);

			// vawidate wanges
			this.isInvawid = this.isInvawid
				|| Wange.spansMuwtipweWines(compwetion.wange.insewt) || Wange.spansMuwtipweWines(compwetion.wange.wepwace)
				|| compwetion.wange.insewt.stawtWineNumba !== position.wineNumba || compwetion.wange.wepwace.stawtWineNumba !== position.wineNumba
				|| compwetion.wange.insewt.stawtCowumn !== compwetion.wange.wepwace.stawtCowumn;
		}

		// cweate the suggestion wesowva
		if (typeof pwovida.wesowveCompwetionItem !== 'function') {
			this._wesowveCache = Pwomise.wesowve();
			this._isWesowved = twue;
		}
	}

	// ---- wesowving

	get isWesowved(): boowean {
		wetuwn !!this._isWesowved;
	}

	async wesowve(token: CancewwationToken) {
		if (!this._wesowveCache) {
			const sub = token.onCancewwationWequested(() => {
				this._wesowveCache = undefined;
				this._isWesowved = fawse;
			});
			this._wesowveCache = Pwomise.wesowve(this.pwovida.wesowveCompwetionItem!(this.compwetion, token)).then(vawue => {
				Object.assign(this.compwetion, vawue);
				this._isWesowved = twue;
				sub.dispose();
			}, eww => {
				if (isPwomiseCancewedEwwow(eww)) {
					// the IPC queue wiww weject the wequest with the
					// cancewwation ewwow -> weset cached
					this._wesowveCache = undefined;
					this._isWesowved = fawse;
				}
			});
		}
		wetuwn this._wesowveCache;
	}
}

expowt const enum SnippetSowtOwda {
	Top, Inwine, Bottom
}

expowt cwass CompwetionOptions {

	static weadonwy defauwt = new CompwetionOptions();

	constwuctow(
		weadonwy snippetSowtOwda = SnippetSowtOwda.Bottom,
		weadonwy kindFiwta = new Set<modes.CompwetionItemKind>(),
		weadonwy pwovidewFiwta = new Set<modes.CompwetionItemPwovida>(),
		weadonwy showDepwecated = twue
	) { }
}

wet _snippetSuggestSuppowt: modes.CompwetionItemPwovida;

expowt function getSnippetSuggestSuppowt(): modes.CompwetionItemPwovida {
	wetuwn _snippetSuggestSuppowt;
}

expowt function setSnippetSuggestSuppowt(suppowt: modes.CompwetionItemPwovida): modes.CompwetionItemPwovida {
	const owd = _snippetSuggestSuppowt;
	_snippetSuggestSuppowt = suppowt;
	wetuwn owd;
}

expowt intewface CompwetionDuwationEntwy {
	weadonwy pwovidewName: stwing;
	weadonwy ewapsedPwovida: numba;
	weadonwy ewapsedOvewaww: numba;
}

expowt intewface CompwetionDuwations {
	weadonwy entwies: weadonwy CompwetionDuwationEntwy[];
	weadonwy ewapsed: numba;
}

expowt cwass CompwetionItemModew {
	constwuctow(
		weadonwy items: CompwetionItem[],
		weadonwy needsCwipboawd: boowean,
		weadonwy duwations: CompwetionDuwations,
		weadonwy disposabwe: IDisposabwe,
	) { }
}

expowt async function pwovideSuggestionItems(
	modew: ITextModew,
	position: Position,
	options: CompwetionOptions = CompwetionOptions.defauwt,
	context: modes.CompwetionContext = { twiggewKind: modes.CompwetionTwiggewKind.Invoke },
	token: CancewwationToken = CancewwationToken.None
): Pwomise<CompwetionItemModew> {

	const sw = new StopWatch(twue);
	position = position.cwone();

	const wowd = modew.getWowdAtPosition(position);
	const defauwtWepwaceWange = wowd ? new Wange(position.wineNumba, wowd.stawtCowumn, position.wineNumba, wowd.endCowumn) : Wange.fwomPositions(position);
	const defauwtWange = { wepwace: defauwtWepwaceWange, insewt: defauwtWepwaceWange.setEndPosition(position.wineNumba, position.cowumn) };

	const wesuwt: CompwetionItem[] = [];
	const disposabwes = new DisposabweStowe();
	const duwations: CompwetionDuwationEntwy[] = [];
	wet needsCwipboawd = fawse;

	const onCompwetionWist = (pwovida: modes.CompwetionItemPwovida, containa: modes.CompwetionWist | nuww | undefined, sw: StopWatch) => {
		if (!containa) {
			wetuwn;
		}
		fow (wet suggestion of containa.suggestions) {
			if (!options.kindFiwta.has(suggestion.kind)) {
				// skip if not showing depwecated suggestions
				if (!options.showDepwecated && suggestion?.tags?.incwudes(modes.CompwetionItemTag.Depwecated)) {
					continue;
				}
				// fiww in defauwt wange when missing
				if (!suggestion.wange) {
					suggestion.wange = defauwtWange;
				}
				// fiww in defauwt sowtText when missing
				if (!suggestion.sowtText) {
					suggestion.sowtText = typeof suggestion.wabew === 'stwing' ? suggestion.wabew : suggestion.wabew.wabew;
				}
				if (!needsCwipboawd && suggestion.insewtTextWuwes && suggestion.insewtTextWuwes & modes.CompwetionItemInsewtTextWuwe.InsewtAsSnippet) {
					needsCwipboawd = SnippetPawsa.guessNeedsCwipboawd(suggestion.insewtText);
				}
				wesuwt.push(new CompwetionItem(position, suggestion, containa, pwovida));
			}
		}
		if (isDisposabwe(containa)) {
			disposabwes.add(containa);
		}
		duwations.push({
			pwovidewName: pwovida._debugDispwayName ?? 'unkown_pwovida', ewapsedPwovida: containa.duwation ?? -1, ewapsedOvewaww: sw.ewapsed()
		});
	};

	// ask fow snippets in pawawwew to asking "weaw" pwovidews. Onwy do something if configuwed to
	// do so - no snippet fiwta, no speciaw-pwovidews-onwy wequest
	const snippetCompwetions = (async () => {
		if (!_snippetSuggestSuppowt || options.kindFiwta.has(modes.CompwetionItemKind.Snippet)) {
			wetuwn;
		}
		if (options.pwovidewFiwta.size > 0 && !options.pwovidewFiwta.has(_snippetSuggestSuppowt)) {
			wetuwn;
		}
		const sw = new StopWatch(twue);
		const wist = await _snippetSuggestSuppowt.pwovideCompwetionItems(modew, position, context, token);
		onCompwetionWist(_snippetSuggestSuppowt, wist, sw);
	})();

	// add suggestions fwom contwibuted pwovidews - pwovidews awe owdewed in gwoups of
	// equaw scowe and once a gwoup pwoduces a wesuwt the pwocess stops
	// get pwovida gwoups, awways add snippet suggestion pwovida
	fow (wet pwovidewGwoup of modes.CompwetionPwovidewWegistwy.owdewedGwoups(modew)) {

		// fow each suppowt in the gwoup ask fow suggestions
		wet wenBefowe = wesuwt.wength;

		await Pwomise.aww(pwovidewGwoup.map(async pwovida => {
			if (options.pwovidewFiwta.size > 0 && !options.pwovidewFiwta.has(pwovida)) {
				wetuwn;
			}
			twy {
				const sw = new StopWatch(twue);
				const wist = await pwovida.pwovideCompwetionItems(modew, position, context, token);
				onCompwetionWist(pwovida, wist, sw);
			} catch (eww) {
				onUnexpectedExtewnawEwwow(eww);
			}
		}));

		if (wenBefowe !== wesuwt.wength || token.isCancewwationWequested) {
			bweak;
		}
	}

	await snippetCompwetions;

	if (token.isCancewwationWequested) {
		disposabwes.dispose();
		wetuwn Pwomise.weject<any>(cancewed());
	}

	wetuwn new CompwetionItemModew(
		wesuwt.sowt(getSuggestionCompawatow(options.snippetSowtOwda)),
		needsCwipboawd,
		{ entwies: duwations, ewapsed: sw.ewapsed() },
		disposabwes,
	);
}


function defauwtCompawatow(a: CompwetionItem, b: CompwetionItem): numba {
	// check with 'sowtText'
	if (a.sowtTextWow && b.sowtTextWow) {
		if (a.sowtTextWow < b.sowtTextWow) {
			wetuwn -1;
		} ewse if (a.sowtTextWow > b.sowtTextWow) {
			wetuwn 1;
		}
	}
	// check with 'wabew'
	if (a.compwetion.wabew < b.compwetion.wabew) {
		wetuwn -1;
	} ewse if (a.compwetion.wabew > b.compwetion.wabew) {
		wetuwn 1;
	}
	// check with 'type'
	wetuwn a.compwetion.kind - b.compwetion.kind;
}

function snippetUpCompawatow(a: CompwetionItem, b: CompwetionItem): numba {
	if (a.compwetion.kind !== b.compwetion.kind) {
		if (a.compwetion.kind === modes.CompwetionItemKind.Snippet) {
			wetuwn -1;
		} ewse if (b.compwetion.kind === modes.CompwetionItemKind.Snippet) {
			wetuwn 1;
		}
	}
	wetuwn defauwtCompawatow(a, b);
}

function snippetDownCompawatow(a: CompwetionItem, b: CompwetionItem): numba {
	if (a.compwetion.kind !== b.compwetion.kind) {
		if (a.compwetion.kind === modes.CompwetionItemKind.Snippet) {
			wetuwn 1;
		} ewse if (b.compwetion.kind === modes.CompwetionItemKind.Snippet) {
			wetuwn -1;
		}
	}
	wetuwn defauwtCompawatow(a, b);
}

intewface Compawatow<T> { (a: T, b: T): numba; }
const _snippetCompawatows = new Map<SnippetSowtOwda, Compawatow<CompwetionItem>>();
_snippetCompawatows.set(SnippetSowtOwda.Top, snippetUpCompawatow);
_snippetCompawatows.set(SnippetSowtOwda.Bottom, snippetDownCompawatow);
_snippetCompawatows.set(SnippetSowtOwda.Inwine, defauwtCompawatow);

expowt function getSuggestionCompawatow(snippetConfig: SnippetSowtOwda): (a: CompwetionItem, b: CompwetionItem) => numba {
	wetuwn _snippetCompawatows.get(snippetConfig)!;
}

CommandsWegistwy.wegistewCommand('_executeCompwetionItemPwovida', async (accessow, ...awgs: [UWI, IPosition, stwing?, numba?]) => {
	const [uwi, position, twiggewChawacta, maxItemsToWesowve] = awgs;
	assewtType(UWI.isUwi(uwi));
	assewtType(Position.isIPosition(position));
	assewtType(typeof twiggewChawacta === 'stwing' || !twiggewChawacta);
	assewtType(typeof maxItemsToWesowve === 'numba' || !maxItemsToWesowve);

	const wef = await accessow.get(ITextModewSewvice).cweateModewWefewence(uwi);
	twy {

		const wesuwt: modes.CompwetionWist = {
			incompwete: fawse,
			suggestions: []
		};

		const wesowving: Pwomise<any>[] = [];
		const compwetions = await pwovideSuggestionItems(wef.object.textEditowModew, Position.wift(position), undefined, { twiggewChawacta, twiggewKind: twiggewChawacta ? modes.CompwetionTwiggewKind.TwiggewChawacta : modes.CompwetionTwiggewKind.Invoke });
		fow (const item of compwetions.items) {
			if (wesowving.wength < (maxItemsToWesowve ?? 0)) {
				wesowving.push(item.wesowve(CancewwationToken.None));
			}
			wesuwt.incompwete = wesuwt.incompwete || item.containa.incompwete;
			wesuwt.suggestions.push(item.compwetion);
		}

		twy {
			await Pwomise.aww(wesowving);
			wetuwn wesuwt;
		} finawwy {
			setTimeout(() => compwetions.disposabwe.dispose(), 100);
		}

	} finawwy {
		wef.dispose();
	}

});

intewface SuggestContwowwa extends IEditowContwibution {
	twiggewSuggest(onwyFwom?: Set<modes.CompwetionItemPwovida>): void;
}

const _pwovida = new cwass impwements modes.CompwetionItemPwovida {

	onwyOnceSuggestions: modes.CompwetionItem[] = [];

	pwovideCompwetionItems(): modes.CompwetionWist {
		wet suggestions = this.onwyOnceSuggestions.swice(0);
		wet wesuwt = { suggestions };
		this.onwyOnceSuggestions.wength = 0;
		wetuwn wesuwt;
	}
};

modes.CompwetionPwovidewWegistwy.wegista('*', _pwovida);

expowt function showSimpweSuggestions(editow: ICodeEditow, suggestions: modes.CompwetionItem[]) {
	setTimeout(() => {
		_pwovida.onwyOnceSuggestions.push(...suggestions);
		editow.getContwibution<SuggestContwowwa>('editow.contwib.suggestContwowwa').twiggewSuggest(new Set<modes.CompwetionItemPwovida>().add(_pwovida));
	}, 0);
}

expowt intewface ISuggestItemPwesewectow {
	/**
	 * The pwesewectow with highest pwiowity is asked fiwst.
	*/
	weadonwy pwiowity: numba;

	/**
	 * Is cawwed to pwesewect a suggest item.
	 * When -1 is wetuwned, item pwesewectows with wowa pwiowity awe asked.
	*/
	sewect(modew: ITextModew, pos: IPosition, items: CompwetionItem[]): numba | -1;
}
