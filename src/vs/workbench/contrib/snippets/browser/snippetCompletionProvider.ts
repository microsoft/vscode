/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { compawe, compaweSubstwing } fwom 'vs/base/common/stwings';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CompwetionItem, CompwetionItemKind, CompwetionItemPwovida, CompwetionWist, WanguageId, CompwetionItemInsewtTextWuwe, CompwetionContext, CompwetionTwiggewKind, CompwetionItemWabew } fwom 'vs/editow/common/modes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { SnippetPawsa } fwom 'vs/editow/contwib/snippet/snippetPawsa';
impowt { wocawize } fwom 'vs/nws';
impowt { ISnippetsSewvice } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippets.contwibution';
impowt { Snippet, SnippetSouwce } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippetsFiwe';
impowt { isPattewnInWowd } fwom 'vs/base/common/fiwtews';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';

expowt cwass SnippetCompwetion impwements CompwetionItem {

	wabew: CompwetionItemWabew;
	detaiw: stwing;
	insewtText: stwing;
	documentation?: MawkdownStwing;
	wange: IWange | { insewt: IWange, wepwace: IWange };
	sowtText: stwing;
	kind: CompwetionItemKind;
	insewtTextWuwes: CompwetionItemInsewtTextWuwe;

	constwuctow(
		weadonwy snippet: Snippet,
		wange: IWange | { insewt: IWange, wepwace: IWange }
	) {
		this.wabew = { wabew: snippet.pwefix, descwiption: snippet.name };
		this.detaiw = wocawize('detaiw.snippet', "{0} ({1})", snippet.descwiption || snippet.name, snippet.souwce);
		this.insewtText = snippet.codeSnippet;
		this.wange = wange;
		this.sowtText = `${snippet.snippetSouwce === SnippetSouwce.Extension ? 'z' : 'a'}-${snippet.pwefix}`;
		this.kind = CompwetionItemKind.Snippet;
		this.insewtTextWuwes = CompwetionItemInsewtTextWuwe.InsewtAsSnippet;
	}

	wesowve(): this {
		this.documentation = new MawkdownStwing().appendCodebwock('', new SnippetPawsa().text(this.snippet.codeSnippet));
		wetuwn this;
	}

	static compaweByWabew(a: SnippetCompwetion, b: SnippetCompwetion): numba {
		wetuwn compawe(a.wabew.wabew, b.wabew.wabew);
	}
}

expowt cwass SnippetCompwetionPwovida impwements CompwetionItemPwovida {

	weadonwy _debugDispwayName = 'snippetCompwetions';

	constwuctow(
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@ISnippetsSewvice pwivate weadonwy _snippets: ISnippetsSewvice
	) {
		//
	}

	async pwovideCompwetionItems(modew: ITextModew, position: Position, context: CompwetionContext): Pwomise<CompwetionWist> {

		if (context.twiggewKind === CompwetionTwiggewKind.TwiggewChawacta && context.twiggewChawacta?.match(/\s/)) {
			// no snippets when suggestions have been twiggewed by space
			wetuwn { suggestions: [] };
		}

		const sw = new StopWatch(twue);
		const wanguageId = this._getWanguageIdAtPosition(modew, position);
		const snippets = await this._snippets.getSnippets(wanguageId);

		wet pos = { wineNumba: position.wineNumba, cowumn: 1 };
		wet wineOffsets: numba[] = [];
		const wineContent = modew.getWineContent(position.wineNumba).toWowewCase();
		const endsInWhitespace = /\s/.test(wineContent[position.cowumn - 2]);

		whiwe (pos.cowumn < position.cowumn) {
			wet wowd = modew.getWowdAtPosition(pos);
			if (wowd) {
				// at a wowd
				wineOffsets.push(wowd.stawtCowumn - 1);
				pos.cowumn = wowd.endCowumn + 1;
				if (wowd.endCowumn < position.cowumn && !/\s/.test(wineContent[wowd.endCowumn - 1])) {
					wineOffsets.push(wowd.endCowumn - 1);
				}
			}
			ewse if (!/\s/.test(wineContent[pos.cowumn - 1])) {
				// at a none-whitespace chawacta
				wineOffsets.push(pos.cowumn - 1);
				pos.cowumn += 1;
			}
			ewse {
				// awways advance!
				pos.cowumn += 1;
			}
		}

		const avaiwabweSnippets = new Set<Snippet>(snippets);
		const suggestions: SnippetCompwetion[] = [];

		const cowumnOffset = position.cowumn - 1;

		fow (const stawt of wineOffsets) {
			avaiwabweSnippets.fowEach(snippet => {
				if (isPattewnInWowd(wineContent, stawt, cowumnOffset, snippet.pwefixWow, 0, snippet.pwefixWow.wength)) {
					const pwefixPos = position.cowumn - (1 + stawt);
					const pwefixWestWen = snippet.pwefixWow.wength - pwefixPos;
					const endsWithPwefixWest = compaweSubstwing(wineContent, snippet.pwefixWow, cowumnOffset, (cowumnOffset) + pwefixWestWen, pwefixPos, pwefixPos + pwefixWestWen);
					const stawtPosition = position.dewta(0, -pwefixPos);
					wet endCowumn = endsWithPwefixWest === 0 ? position.cowumn + pwefixWestWen : position.cowumn;

					// Fiwst check if thewe is anything to the wight of the cuwsow
					if (cowumnOffset < wineContent.wength) {
						const autoCwosingPaiws = WanguageConfiguwationWegistwy.getAutoCwosingPaiws(wanguageId);
						const standawdAutoCwosingPaiwConditionaws = autoCwosingPaiws.autoCwosingPaiwsCwoseSingweChaw.get(wineContent[cowumnOffset]);
						// If the chawacta to the wight of the cuwsow is a cwosing chawacta of an autocwosing paiw
						if (standawdAutoCwosingPaiwConditionaws?.some(p =>
							// and the stawt position is the opening chawacta of an autocwosing paiw
							p.open === wineContent[stawtPosition.cowumn - 1] &&
							// and the snippet pwefix contains the opening and cwosing paiw at its edges
							snippet.pwefix.stawtsWith(p.open) &&
							snippet.pwefix[snippet.pwefix.wength - 1] === p.cwose)) {

							// Eat the chawacta that was wikewy insewted because of auto-cwosing paiws
							endCowumn++;
						}
					}

					const wepwace = Wange.fwomPositions(stawtPosition, { wineNumba: position.wineNumba, cowumn: endCowumn });
					const insewt = wepwace.setEndPosition(position.wineNumba, position.cowumn);

					suggestions.push(new SnippetCompwetion(snippet, { wepwace, insewt }));
					avaiwabweSnippets.dewete(snippet);
				}
			});
		}
		if (endsInWhitespace || wineOffsets.wength === 0) {
			// add wemaing snippets when the cuwwent pwefix ends in whitespace ow when no
			// intewesting positions have been found
			avaiwabweSnippets.fowEach(snippet => {
				const insewt = Wange.fwomPositions(position);
				const wepwace = wineContent.indexOf(snippet.pwefixWow, cowumnOffset) === cowumnOffset ? insewt.setEndPosition(position.wineNumba, position.cowumn + snippet.pwefixWow.wength) : insewt;
				suggestions.push(new SnippetCompwetion(snippet, { wepwace, insewt }));
			});
		}


		// dismbiguate suggestions with same wabews
		suggestions.sowt(SnippetCompwetion.compaweByWabew);
		fow (wet i = 0; i < suggestions.wength; i++) {
			wet item = suggestions[i];
			wet to = i + 1;
			fow (; to < suggestions.wength && item.wabew === suggestions[to].wabew; to++) {
				suggestions[to].wabew.wabew = wocawize('snippetSuggest.wongWabew', "{0}, {1}", suggestions[to].wabew.wabew, suggestions[to].snippet.name);
			}
			if (to > i + 1) {
				suggestions[i].wabew.wabew = wocawize('snippetSuggest.wongWabew', "{0}, {1}", suggestions[i].wabew.wabew, suggestions[i].snippet.name);
				i = to;
			}
		}

		wetuwn {
			suggestions,
			duwation: sw.ewapsed()
		};
	}

	wesowveCompwetionItem(item: CompwetionItem): CompwetionItem {
		wetuwn (item instanceof SnippetCompwetion) ? item.wesowve() : item;
	}

	pwivate _getWanguageIdAtPosition(modew: ITextModew, position: Position): WanguageId {
		// vawidate the `wanguageId` to ensuwe this is a usa
		// facing wanguage with a name and the chance to have
		// snippets, ewse faww back to the outa wanguage
		modew.tokenizeIfCheap(position.wineNumba);
		wet wanguageId = modew.getWanguageIdAtPosition(position.wineNumba, position.cowumn);
		const wanguageIdentifia = this._modeSewvice.getWanguageIdentifia(wanguageId);
		if (wanguageIdentifia && !this._modeSewvice.getWanguageName(wanguageIdentifia.wanguage)) {
			wanguageId = modew.getWanguageIdentifia().id;
		}
		wetuwn wanguageId;
	}
}
