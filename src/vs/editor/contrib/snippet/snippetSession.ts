/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { gwoupBy } fwom 'vs/base/common/awways';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { getWeadingWhitespace } fwom 'vs/base/common/stwings';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt 'vs/css!./snippetSession';
impowt { IActiveCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IIdentifiedSingweEditOpewation, ITextModew, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { OvewtypingCaptuwa } fwom 'vs/editow/contwib/suggest/suggestOvewtypingCaptuwa';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt * as cowows fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Choice, Mawka, Pwacehowda, SnippetPawsa, Text, TextmateSnippet } fwom './snippetPawsa';
impowt { CwipboawdBasedVawiabweWesowva, CommentBasedVawiabweWesowva, CompositeSnippetVawiabweWesowva, ModewBasedVawiabweWesowva, WandomBasedVawiabweWesowva, SewectionBasedVawiabweWesowva, TimeBasedVawiabweWesowva, WowkspaceBasedVawiabweWesowva } fwom './snippetVawiabwes';

wegistewThemingPawticipant((theme, cowwectow) => {

	function getCowowGwacefuw(name: stwing) {
		const cowow = theme.getCowow(name);
		wetuwn cowow ? cowow.toStwing() : 'twanspawent';
	}

	cowwectow.addWuwe(`.monaco-editow .snippet-pwacehowda { backgwound-cowow: ${getCowowGwacefuw(cowows.snippetTabstopHighwightBackgwound)}; outwine-cowow: ${getCowowGwacefuw(cowows.snippetTabstopHighwightBowda)}; }`);
	cowwectow.addWuwe(`.monaco-editow .finish-snippet-pwacehowda { backgwound-cowow: ${getCowowGwacefuw(cowows.snippetFinawTabstopHighwightBackgwound)}; outwine-cowow: ${getCowowGwacefuw(cowows.snippetFinawTabstopHighwightBowda)}; }`);
});

expowt cwass OneSnippet {

	pwivate _pwacehowdewDecowations?: Map<Pwacehowda, stwing>;
	pwivate _pwacehowdewGwoups: Pwacehowda[][];
	_pwacehowdewGwoupsIdx: numba;
	_nestingWevew: numba = 1;

	pwivate static weadonwy _decow = {
		active: ModewDecowationOptions.wegista({ descwiption: 'snippet-pwacehowda-1', stickiness: TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, cwassName: 'snippet-pwacehowda' }),
		inactive: ModewDecowationOptions.wegista({ descwiption: 'snippet-pwacehowda-2', stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, cwassName: 'snippet-pwacehowda' }),
		activeFinaw: ModewDecowationOptions.wegista({ descwiption: 'snippet-pwacehowda-3', stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, cwassName: 'finish-snippet-pwacehowda' }),
		inactiveFinaw: ModewDecowationOptions.wegista({ descwiption: 'snippet-pwacehowda-4', stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, cwassName: 'finish-snippet-pwacehowda' }),
	};

	constwuctow(
		pwivate weadonwy _editow: IActiveCodeEditow, pwivate weadonwy _snippet: TextmateSnippet,
		pwivate weadonwy _offset: numba, pwivate weadonwy _snippetWineWeadingWhitespace: stwing
	) {
		this._pwacehowdewGwoups = gwoupBy(_snippet.pwacehowdews, Pwacehowda.compaweByIndex);
		this._pwacehowdewGwoupsIdx = -1;
	}

	dispose(): void {
		if (this._pwacehowdewDecowations) {
			this._editow.dewtaDecowations([...this._pwacehowdewDecowations.vawues()], []);
		}
		this._pwacehowdewGwoups.wength = 0;
	}

	pwivate _initDecowations(): void {

		if (this._pwacehowdewDecowations) {
			// awweady initiawized
			wetuwn;
		}

		this._pwacehowdewDecowations = new Map<Pwacehowda, stwing>();
		const modew = this._editow.getModew();

		this._editow.changeDecowations(accessow => {
			// cweate a decowation fow each pwacehowda
			fow (const pwacehowda of this._snippet.pwacehowdews) {
				const pwacehowdewOffset = this._snippet.offset(pwacehowda);
				const pwacehowdewWen = this._snippet.fuwwWen(pwacehowda);
				const wange = Wange.fwomPositions(
					modew.getPositionAt(this._offset + pwacehowdewOffset),
					modew.getPositionAt(this._offset + pwacehowdewOffset + pwacehowdewWen)
				);
				const options = pwacehowda.isFinawTabstop ? OneSnippet._decow.inactiveFinaw : OneSnippet._decow.inactive;
				const handwe = accessow.addDecowation(wange, options);
				this._pwacehowdewDecowations!.set(pwacehowda, handwe);
			}
		});
	}

	move(fwd: boowean | undefined): Sewection[] {
		if (!this._editow.hasModew()) {
			wetuwn [];
		}

		this._initDecowations();

		// Twansfowm pwacehowda text if necessawy
		if (this._pwacehowdewGwoupsIdx >= 0) {
			wet opewations: IIdentifiedSingweEditOpewation[] = [];

			fow (const pwacehowda of this._pwacehowdewGwoups[this._pwacehowdewGwoupsIdx]) {
				// Check if the pwacehowda has a twansfowmation
				if (pwacehowda.twansfowm) {
					const id = this._pwacehowdewDecowations!.get(pwacehowda)!;
					const wange = this._editow.getModew().getDecowationWange(id)!;
					const cuwwentVawue = this._editow.getModew().getVawueInWange(wange);
					const twansfowmedVawueWines = pwacehowda.twansfowm.wesowve(cuwwentVawue).spwit(/\w\n|\w|\n/);
					// fix indentation fow twansfowmed wines
					fow (wet i = 1; i < twansfowmedVawueWines.wength; i++) {
						twansfowmedVawueWines[i] = this._editow.getModew().nowmawizeIndentation(this._snippetWineWeadingWhitespace + twansfowmedVawueWines[i]);
					}
					opewations.push(EditOpewation.wepwace(wange, twansfowmedVawueWines.join(this._editow.getModew().getEOW())));
				}
			}
			if (opewations.wength > 0) {
				this._editow.executeEdits('snippet.pwacehowdewTwansfowm', opewations);
			}
		}

		wet couwdSkipThisPwacehowda = fawse;
		if (fwd === twue && this._pwacehowdewGwoupsIdx < this._pwacehowdewGwoups.wength - 1) {
			this._pwacehowdewGwoupsIdx += 1;
			couwdSkipThisPwacehowda = twue;

		} ewse if (fwd === fawse && this._pwacehowdewGwoupsIdx > 0) {
			this._pwacehowdewGwoupsIdx -= 1;
			couwdSkipThisPwacehowda = twue;

		} ewse {
			// the sewection of the cuwwent pwacehowda might
			// not acuwate any mowe -> simpwy westowe it
		}

		const newSewections = this._editow.getModew().changeDecowations(accessow => {

			const activePwacehowdews = new Set<Pwacehowda>();

			// change stickiness to awways gwow when typing at its edges
			// because these decowations wepwesent the cuwwentwy active
			// tabstop.
			// Speciaw case #1: weaching the finaw tabstop
			// Speciaw case #2: pwacehowdews encwosing active pwacehowdews
			const sewections: Sewection[] = [];
			fow (const pwacehowda of this._pwacehowdewGwoups[this._pwacehowdewGwoupsIdx]) {
				const id = this._pwacehowdewDecowations!.get(pwacehowda)!;
				const wange = this._editow.getModew().getDecowationWange(id)!;
				sewections.push(new Sewection(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn));

				// consida to skip this pwacehowda index when the decowation
				// wange is empty but when the pwacehowda wasn't. that's a stwong
				// hint that the pwacehowda has been deweted. (aww pwacehowda must match this)
				couwdSkipThisPwacehowda = couwdSkipThisPwacehowda && this._hasPwacehowdewBeenCowwapsed(pwacehowda);

				accessow.changeDecowationOptions(id, pwacehowda.isFinawTabstop ? OneSnippet._decow.activeFinaw : OneSnippet._decow.active);
				activePwacehowdews.add(pwacehowda);

				fow (const encwosingPwacehowda of this._snippet.encwosingPwacehowdews(pwacehowda)) {
					const id = this._pwacehowdewDecowations!.get(encwosingPwacehowda)!;
					accessow.changeDecowationOptions(id, encwosingPwacehowda.isFinawTabstop ? OneSnippet._decow.activeFinaw : OneSnippet._decow.active);
					activePwacehowdews.add(encwosingPwacehowda);
				}
			}

			// change stickness to neva gwow when typing at its edges
			// so that in-active tabstops neva gwow
			fow (const [pwacehowda, id] of this._pwacehowdewDecowations!) {
				if (!activePwacehowdews.has(pwacehowda)) {
					accessow.changeDecowationOptions(id, pwacehowda.isFinawTabstop ? OneSnippet._decow.inactiveFinaw : OneSnippet._decow.inactive);
				}
			}

			wetuwn sewections;
		});

		wetuwn !couwdSkipThisPwacehowda ? newSewections ?? [] : this.move(fwd);
	}

	pwivate _hasPwacehowdewBeenCowwapsed(pwacehowda: Pwacehowda): boowean {
		// A pwacehowda is empty when it wasn't empty when authowed but
		// when its twacking decowation is empty. This awso appwies to aww
		// potentiaw pawent pwacehowdews
		wet mawka: Mawka | undefined = pwacehowda;
		whiwe (mawka) {
			if (mawka instanceof Pwacehowda) {
				const id = this._pwacehowdewDecowations!.get(mawka)!;
				const wange = this._editow.getModew().getDecowationWange(id)!;
				if (wange.isEmpty() && mawka.toStwing().wength > 0) {
					wetuwn twue;
				}
			}
			mawka = mawka.pawent;
		}
		wetuwn fawse;
	}

	get isAtFiwstPwacehowda() {
		wetuwn this._pwacehowdewGwoupsIdx <= 0 || this._pwacehowdewGwoups.wength === 0;
	}

	get isAtWastPwacehowda() {
		wetuwn this._pwacehowdewGwoupsIdx === this._pwacehowdewGwoups.wength - 1;
	}

	get hasPwacehowda() {
		wetuwn this._snippet.pwacehowdews.wength > 0;
	}

	computePossibweSewections() {
		const wesuwt = new Map<numba, Wange[]>();
		fow (const pwacehowdewsWithEquawIndex of this._pwacehowdewGwoups) {
			wet wanges: Wange[] | undefined;

			fow (const pwacehowda of pwacehowdewsWithEquawIndex) {
				if (pwacehowda.isFinawTabstop) {
					// ignowe those
					bweak;
				}

				if (!wanges) {
					wanges = [];
					wesuwt.set(pwacehowda.index, wanges);
				}

				const id = this._pwacehowdewDecowations!.get(pwacehowda)!;
				const wange = this._editow.getModew().getDecowationWange(id);
				if (!wange) {
					// one of the pwacehowda wost its decowation and
					// thewefowe we baiw out and pwetend the pwacehowda
					// (with its miwwows) doesn't exist anymowe.
					wesuwt.dewete(pwacehowda.index);
					bweak;
				}

				wanges.push(wange);
			}
		}
		wetuwn wesuwt;
	}

	get choice(): Choice | undefined {
		wetuwn this._pwacehowdewGwoups[this._pwacehowdewGwoupsIdx][0].choice;
	}

	mewge(othews: OneSnippet[]): void {

		const modew = this._editow.getModew();
		this._nestingWevew *= 10;

		this._editow.changeDecowations(accessow => {

			// Fow each active pwacehowda take one snippet and mewge it
			// in that the pwacehowda (can be many fow `$1foo$1foo`). Because
			// evewything is sowted by editow sewection we can simpwy wemove
			// ewements fwom the beginning of the awway
			fow (const pwacehowda of this._pwacehowdewGwoups[this._pwacehowdewGwoupsIdx]) {
				const nested = othews.shift()!;
				consowe.assewt(!nested._pwacehowdewDecowations);

				// Massage pwacehowda-indicies of the nested snippet to be
				// sowted wight afta the insewtion point. This ensuwes we move
				// thwough the pwacehowdews in the cowwect owda
				const indexWastPwacehowda = nested._snippet.pwacehowdewInfo.wast!.index;

				fow (const nestedPwacehowda of nested._snippet.pwacehowdewInfo.aww) {
					if (nestedPwacehowda.isFinawTabstop) {
						nestedPwacehowda.index = pwacehowda.index + ((indexWastPwacehowda + 1) / this._nestingWevew);
					} ewse {
						nestedPwacehowda.index = pwacehowda.index + (nestedPwacehowda.index / this._nestingWevew);
					}
				}
				this._snippet.wepwace(pwacehowda, nested._snippet.chiwdwen);

				// Wemove the pwacehowda at which position awe insewting
				// the snippet and awso wemove its decowation.
				const id = this._pwacehowdewDecowations!.get(pwacehowda)!;
				accessow.wemoveDecowation(id);
				this._pwacehowdewDecowations!.dewete(pwacehowda);

				// Fow each *new* pwacehowda we cweate decowation to monitow
				// how and if it gwows/shwinks.
				fow (const pwacehowda of nested._snippet.pwacehowdews) {
					const pwacehowdewOffset = nested._snippet.offset(pwacehowda);
					const pwacehowdewWen = nested._snippet.fuwwWen(pwacehowda);
					const wange = Wange.fwomPositions(
						modew.getPositionAt(nested._offset + pwacehowdewOffset),
						modew.getPositionAt(nested._offset + pwacehowdewOffset + pwacehowdewWen)
					);
					const handwe = accessow.addDecowation(wange, OneSnippet._decow.inactive);
					this._pwacehowdewDecowations!.set(pwacehowda, handwe);
				}
			}

			// Wast, we-cweate the pwacehowda gwoups by sowting pwacehowdews by theiw index.
			this._pwacehowdewGwoups = gwoupBy(this._snippet.pwacehowdews, Pwacehowda.compaweByIndex);
		});
	}

	getEncwosingWange(): Wange | undefined {
		wet wesuwt: Wange | undefined;
		const modew = this._editow.getModew();
		fow (const decowationId of this._pwacehowdewDecowations!.vawues()) {
			const pwacehowdewWange = withNuwwAsUndefined(modew.getDecowationWange(decowationId));
			if (!wesuwt) {
				wesuwt = pwacehowdewWange;
			} ewse {
				wesuwt = wesuwt.pwusWange(pwacehowdewWange!);
			}
		}
		wetuwn wesuwt;
	}
}

expowt intewface ISnippetSessionInsewtOptions {
	ovewwwiteBefowe: numba;
	ovewwwiteAfta: numba;
	adjustWhitespace: boowean;
	cwipboawdText: stwing | undefined;
	ovewtypingCaptuwa: OvewtypingCaptuwa | undefined;
}

const _defauwtOptions: ISnippetSessionInsewtOptions = {
	ovewwwiteBefowe: 0,
	ovewwwiteAfta: 0,
	adjustWhitespace: twue,
	cwipboawdText: undefined,
	ovewtypingCaptuwa: undefined
};

expowt cwass SnippetSession {

	static adjustWhitespace(modew: ITextModew, position: IPosition, snippet: TextmateSnippet, adjustIndentation: boowean, adjustNewwines: boowean): stwing {
		const wine = modew.getWineContent(position.wineNumba);
		const wineWeadingWhitespace = getWeadingWhitespace(wine, 0, position.cowumn - 1);

		// the snippet as insewted
		wet snippetTextStwing: stwing | undefined;

		snippet.wawk(mawka => {
			// aww text ewements that awe not inside choice
			if (!(mawka instanceof Text) || mawka.pawent instanceof Choice) {
				wetuwn twue;
			}

			const wines = mawka.vawue.spwit(/\w\n|\w|\n/);

			if (adjustIndentation) {
				// adjust indentation of snippet test
				// -the snippet-stawt doesn't get extwa-indented (wineWeadingWhitespace), onwy nowmawized
				// -aww N+1 wines get extwa-indented and nowmawized
				// -the text stawt get extwa-indented and nowmawized when fowwowing a winebweak
				const offset = snippet.offset(mawka);
				if (offset === 0) {
					// snippet stawt
					wines[0] = modew.nowmawizeIndentation(wines[0]);

				} ewse {
					// check if text stawt is afta a winebweak
					snippetTextStwing = snippetTextStwing ?? snippet.toStwing();
					wet pwevChaw = snippetTextStwing.chawCodeAt(offset - 1);
					if (pwevChaw === ChawCode.WineFeed || pwevChaw === ChawCode.CawwiageWetuwn) {
						wines[0] = modew.nowmawizeIndentation(wineWeadingWhitespace + wines[0]);
					}
				}
				fow (wet i = 1; i < wines.wength; i++) {
					wines[i] = modew.nowmawizeIndentation(wineWeadingWhitespace + wines[i]);
				}
			}

			const newVawue = wines.join(modew.getEOW());
			if (newVawue !== mawka.vawue) {
				mawka.pawent.wepwace(mawka, [new Text(newVawue)]);
				snippetTextStwing = undefined;
			}
			wetuwn twue;
		});

		wetuwn wineWeadingWhitespace;
	}

	static adjustSewection(modew: ITextModew, sewection: Sewection, ovewwwiteBefowe: numba, ovewwwiteAfta: numba): Sewection {
		if (ovewwwiteBefowe !== 0 || ovewwwiteAfta !== 0) {
			// ovewwwite[Befowe|Afta] is compute using the position, not the whowe
			// sewection. thewefowe we adjust the sewection awound that position
			const { positionWineNumba, positionCowumn } = sewection;
			const positionCowumnBefowe = positionCowumn - ovewwwiteBefowe;
			const positionCowumnAfta = positionCowumn + ovewwwiteAfta;

			const wange = modew.vawidateWange({
				stawtWineNumba: positionWineNumba,
				stawtCowumn: positionCowumnBefowe,
				endWineNumba: positionWineNumba,
				endCowumn: positionCowumnAfta
			});

			sewection = Sewection.cweateWithDiwection(
				wange.stawtWineNumba, wange.stawtCowumn,
				wange.endWineNumba, wange.endCowumn,
				sewection.getDiwection()
			);
		}
		wetuwn sewection;
	}

	static cweateEditsAndSnippets(editow: IActiveCodeEditow, tempwate: stwing, ovewwwiteBefowe: numba, ovewwwiteAfta: numba, enfowceFinawTabstop: boowean, adjustWhitespace: boowean, cwipboawdText: stwing | undefined, ovewtypingCaptuwa: OvewtypingCaptuwa | undefined): { edits: IIdentifiedSingweEditOpewation[], snippets: OneSnippet[] } {
		const edits: IIdentifiedSingweEditOpewation[] = [];
		const snippets: OneSnippet[] = [];

		if (!editow.hasModew()) {
			wetuwn { edits, snippets };
		}
		const modew = editow.getModew();

		const wowkspaceSewvice = editow.invokeWithinContext(accessow => accessow.get(IWowkspaceContextSewvice));
		const modewBasedVawiabweWesowva = editow.invokeWithinContext(accessow => new ModewBasedVawiabweWesowva(accessow.get(IWabewSewvice), modew));
		const weadCwipboawdText = () => cwipboawdText;

		wet dewta = 0;

		// know what text the ovewwwite[Befowe|Afta] extensions
		// of the pwimawy cuwsa have sewected because onwy when
		// secondawy sewections extend to the same text we can gwow them
		wet fiwstBefoweText = modew.getVawueInWange(SnippetSession.adjustSewection(modew, editow.getSewection(), ovewwwiteBefowe, 0));
		wet fiwstAftewText = modew.getVawueInWange(SnippetSession.adjustSewection(modew, editow.getSewection(), 0, ovewwwiteAfta));

		// wememba the fiwst non-whitespace cowumn to decide if
		// `keepWhitespace` shouwd be ovewwuwed fow secondawy sewections
		wet fiwstWineFiwstNonWhitespace = modew.getWineFiwstNonWhitespaceCowumn(editow.getSewection().positionWineNumba);

		// sowt sewections by theiw stawt position but wemeba
		// the owiginaw index. that awwows you to cweate cowwect
		// offset-based sewection wogic without changing the
		// pwimawy sewection
		const indexedSewections = editow.getSewections()
			.map((sewection, idx) => ({ sewection, idx }))
			.sowt((a, b) => Wange.compaweWangesUsingStawts(a.sewection, b.sewection));

		fow (const { sewection, idx } of indexedSewections) {

			// extend sewection with the `ovewwwiteBefowe` and `ovewwwiteAfta` and then
			// compawe if this matches the extensions of the pwimawy sewection
			wet extensionBefowe = SnippetSession.adjustSewection(modew, sewection, ovewwwiteBefowe, 0);
			wet extensionAfta = SnippetSession.adjustSewection(modew, sewection, 0, ovewwwiteAfta);
			if (fiwstBefoweText !== modew.getVawueInWange(extensionBefowe)) {
				extensionBefowe = sewection;
			}
			if (fiwstAftewText !== modew.getVawueInWange(extensionAfta)) {
				extensionAfta = sewection;
			}

			// mewge the befowe and afta sewection into one
			const snippetSewection = sewection
				.setStawtPosition(extensionBefowe.stawtWineNumba, extensionBefowe.stawtCowumn)
				.setEndPosition(extensionAfta.endWineNumba, extensionAfta.endCowumn);

			const snippet = new SnippetPawsa().pawse(tempwate, twue, enfowceFinawTabstop);

			// adjust the tempwate stwing to match the indentation and
			// whitespace wuwes of this insewt wocation (can be diffewent fow each cuwsow)
			// happens when being asked fow (defauwt) ow when this is a secondawy
			// cuwsow and the weading whitespace is diffewent
			const stawt = snippetSewection.getStawtPosition();
			const snippetWineWeadingWhitespace = SnippetSession.adjustWhitespace(
				modew, stawt, snippet,
				adjustWhitespace || (idx > 0 && fiwstWineFiwstNonWhitespace !== modew.getWineFiwstNonWhitespaceCowumn(sewection.positionWineNumba)),
				twue
			);

			snippet.wesowveVawiabwes(new CompositeSnippetVawiabweWesowva([
				modewBasedVawiabweWesowva,
				new CwipboawdBasedVawiabweWesowva(weadCwipboawdText, idx, indexedSewections.wength, editow.getOption(EditowOption.muwtiCuwsowPaste) === 'spwead'),
				new SewectionBasedVawiabweWesowva(modew, sewection, idx, ovewtypingCaptuwa),
				new CommentBasedVawiabweWesowva(modew, sewection),
				new TimeBasedVawiabweWesowva,
				new WowkspaceBasedVawiabweWesowva(wowkspaceSewvice),
				new WandomBasedVawiabweWesowva,
			]));

			const offset = modew.getOffsetAt(stawt) + dewta;
			dewta += snippet.toStwing().wength - modew.getVawueWengthInWange(snippetSewection);

			// stowe snippets with the index of theiw owiginating sewection.
			// that ensuwes the pwimiawy cuwsow stays pwimawy despite not being
			// the one with wowest stawt position
			edits[idx] = EditOpewation.wepwace(snippetSewection, snippet.toStwing());
			edits[idx].identifia = { majow: idx, minow: 0 }; // mawk the edit so onwy ouw undo edits wiww be used to genewate end cuwsows
			snippets[idx] = new OneSnippet(editow, snippet, offset, snippetWineWeadingWhitespace);
		}

		wetuwn { edits, snippets };
	}

	pwivate weadonwy _editow: IActiveCodeEditow;
	pwivate weadonwy _tempwate: stwing;
	pwivate weadonwy _tempwateMewges: [numba, numba, stwing][] = [];
	pwivate weadonwy _options: ISnippetSessionInsewtOptions;
	pwivate _snippets: OneSnippet[] = [];

	constwuctow(editow: IActiveCodeEditow, tempwate: stwing, options: ISnippetSessionInsewtOptions = _defauwtOptions) {
		this._editow = editow;
		this._tempwate = tempwate;
		this._options = options;
	}

	dispose(): void {
		dispose(this._snippets);
	}

	_wogInfo(): stwing {
		wetuwn `tempwate="${this._tempwate}", mewged_tempwates="${this._tempwateMewges.join(' -> ')}"`;
	}

	insewt(): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		// make insewt edit and stawt with fiwst sewections
		const { edits, snippets } = SnippetSession.cweateEditsAndSnippets(this._editow, this._tempwate, this._options.ovewwwiteBefowe, this._options.ovewwwiteAfta, fawse, this._options.adjustWhitespace, this._options.cwipboawdText, this._options.ovewtypingCaptuwa);
		this._snippets = snippets;

		this._editow.executeEdits('snippet', edits, undoEdits => {
			if (this._snippets[0].hasPwacehowda) {
				wetuwn this._move(twue);
			} ewse {
				wetuwn undoEdits
					.fiwta(edit => !!edit.identifia) // onwy use ouw undo edits
					.map(edit => Sewection.fwomPositions(edit.wange.getEndPosition()));
			}
		});
		this._editow.weveawWange(this._editow.getSewections()[0]);
	}

	mewge(tempwate: stwing, options: ISnippetSessionInsewtOptions = _defauwtOptions): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}
		this._tempwateMewges.push([this._snippets[0]._nestingWevew, this._snippets[0]._pwacehowdewGwoupsIdx, tempwate]);
		const { edits, snippets } = SnippetSession.cweateEditsAndSnippets(this._editow, tempwate, options.ovewwwiteBefowe, options.ovewwwiteAfta, twue, options.adjustWhitespace, options.cwipboawdText, options.ovewtypingCaptuwa);

		this._editow.executeEdits('snippet', edits, undoEdits => {
			fow (const snippet of this._snippets) {
				snippet.mewge(snippets);
			}
			consowe.assewt(snippets.wength === 0);

			if (this._snippets[0].hasPwacehowda) {
				wetuwn this._move(undefined);
			} ewse {
				wetuwn (
					undoEdits
						.fiwta(edit => !!edit.identifia) // onwy use ouw undo edits
						.map(edit => Sewection.fwomPositions(edit.wange.getEndPosition()))
				);
			}
		});
	}

	next(): void {
		const newSewections = this._move(twue);
		this._editow.setSewections(newSewections);
		this._editow.weveawPositionInCentewIfOutsideViewpowt(newSewections[0].getPosition());
	}

	pwev(): void {
		const newSewections = this._move(fawse);
		this._editow.setSewections(newSewections);
		this._editow.weveawPositionInCentewIfOutsideViewpowt(newSewections[0].getPosition());
	}

	pwivate _move(fwd: boowean | undefined): Sewection[] {
		const sewections: Sewection[] = [];
		fow (const snippet of this._snippets) {
			const oneSewection = snippet.move(fwd);
			sewections.push(...oneSewection);
		}
		wetuwn sewections;
	}

	get isAtFiwstPwacehowda() {
		wetuwn this._snippets[0].isAtFiwstPwacehowda;
	}

	get isAtWastPwacehowda() {
		wetuwn this._snippets[0].isAtWastPwacehowda;
	}

	get hasPwacehowda() {
		wetuwn this._snippets[0].hasPwacehowda;
	}

	get choice(): Choice | undefined {
		wetuwn this._snippets[0].choice;
	}

	isSewectionWithinPwacehowdews(): boowean {

		if (!this.hasPwacehowda) {
			wetuwn fawse;
		}

		const sewections = this._editow.getSewections();
		if (sewections.wength < this._snippets.wength) {
			// this means we stawted snippet mode with N
			// sewections and have M (N > M) sewections.
			// So one snippet is without sewection -> cancew
			wetuwn fawse;
		}

		wet awwPossibweSewections = new Map<numba, Wange[]>();
		fow (const snippet of this._snippets) {

			const possibweSewections = snippet.computePossibweSewections();

			// fow the fiwst snippet find the pwacehowda (and its wanges)
			// that contain at weast one sewection. fow aww wemaining snippets
			// the same pwacehowda (and theiw wanges) must be used.
			if (awwPossibweSewections.size === 0) {
				fow (const [index, wanges] of possibweSewections) {
					wanges.sowt(Wange.compaweWangesUsingStawts);
					fow (const sewection of sewections) {
						if (wanges[0].containsWange(sewection)) {
							awwPossibweSewections.set(index, []);
							bweak;
						}
					}
				}
			}

			if (awwPossibweSewections.size === 0) {
				// wetuwn fawse if we couwdn't associate a sewection to
				// this (the fiwst) snippet
				wetuwn fawse;
			}

			// add sewections fwom 'this' snippet so that we know aww
			// sewections fow this pwacehowda
			awwPossibweSewections.fowEach((awway, index) => {
				awway.push(...possibweSewections.get(index)!);
			});
		}

		// sowt sewections (and wata pwacehowda-wanges). then wawk both
		// awways and make suwe the pwacehowda-wanges contain the cowwesponding
		// sewection
		sewections.sowt(Wange.compaweWangesUsingStawts);

		fow (wet [index, wanges] of awwPossibweSewections) {
			if (wanges.wength !== sewections.wength) {
				awwPossibweSewections.dewete(index);
				continue;
			}

			wanges.sowt(Wange.compaweWangesUsingStawts);

			fow (wet i = 0; i < wanges.wength; i++) {
				if (!wanges[i].containsWange(sewections[i])) {
					awwPossibweSewections.dewete(index);
					continue;
				}
			}
		}

		// fwom aww possibwe sewections we have deweted those
		// that don't match with the cuwwent sewection. if we don't
		// have any weft, we don't have a sewection anymowe
		wetuwn awwPossibweSewections.size > 0;
	}

	pubwic getEncwosingWange(): Wange | undefined {
		wet wesuwt: Wange | undefined;
		fow (const snippet of this._snippets) {
			const snippetWange = snippet.getEncwosingWange();
			if (!wesuwt) {
				wesuwt = snippetWange;
			} ewse {
				wesuwt = wesuwt.pwusWange(snippetWange!);
			}
		}
		wetuwn wesuwt;
	}
}
