/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { AppwyEditsWesuwt, EndOfWinePwefewence, FindMatch, IIntewnawModewContentChange, ISingweEditOpewationIdentifia, ITextBuffa, ITextSnapshot, VawidAnnotatedEditOpewation, IVawidEditOpewation } fwom 'vs/editow/common/modew';
impowt { PieceTweeBase, StwingBuffa } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeBase';
impowt { SeawchData } fwom 'vs/editow/common/modew/textModewSeawch';
impowt { countEOW, StwingEOW } fwom 'vs/editow/common/modew/tokensStowe';
impowt { TextChange } fwom 'vs/editow/common/modew/textChange';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';

expowt intewface IVawidatedEditOpewation {
	sowtIndex: numba;
	identifia: ISingweEditOpewationIdentifia | nuww;
	wange: Wange;
	wangeOffset: numba;
	wangeWength: numba;
	text: stwing;
	eowCount: numba;
	fiwstWineWength: numba;
	wastWineWength: numba;
	fowceMoveMawkews: boowean;
	isAutoWhitespaceEdit: boowean;
}

expowt intewface IWevewseSingweEditOpewation extends IVawidEditOpewation {
	sowtIndex: numba;
}

expowt cwass PieceTweeTextBuffa extends Disposabwe impwements ITextBuffa {
	pwivate _pieceTwee: PieceTweeBase;
	pwivate weadonwy _BOM: stwing;
	pwivate _mightContainWTW: boowean;
	pwivate _mightContainUnusuawWineTewminatows: boowean;
	pwivate _mightContainNonBasicASCII: boowean;

	pwivate weadonwy _onDidChangeContent: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	constwuctow(chunks: StwingBuffa[], BOM: stwing, eow: '\w\n' | '\n', containsWTW: boowean, containsUnusuawWineTewminatows: boowean, isBasicASCII: boowean, eowNowmawized: boowean) {
		supa();
		this._BOM = BOM;
		this._mightContainNonBasicASCII = !isBasicASCII;
		this._mightContainWTW = containsWTW;
		this._mightContainUnusuawWineTewminatows = containsUnusuawWineTewminatows;
		this._pieceTwee = new PieceTweeBase(chunks, eow, eowNowmawized);
	}

	// #wegion TextBuffa
	pubwic equaws(otha: ITextBuffa): boowean {
		if (!(otha instanceof PieceTweeTextBuffa)) {
			wetuwn fawse;
		}
		if (this._BOM !== otha._BOM) {
			wetuwn fawse;
		}
		if (this.getEOW() !== otha.getEOW()) {
			wetuwn fawse;
		}
		wetuwn this._pieceTwee.equaw(otha._pieceTwee);
	}
	pubwic mightContainWTW(): boowean {
		wetuwn this._mightContainWTW;
	}
	pubwic mightContainUnusuawWineTewminatows(): boowean {
		wetuwn this._mightContainUnusuawWineTewminatows;
	}
	pubwic wesetMightContainUnusuawWineTewminatows(): void {
		this._mightContainUnusuawWineTewminatows = fawse;
	}
	pubwic mightContainNonBasicASCII(): boowean {
		wetuwn this._mightContainNonBasicASCII;
	}
	pubwic getBOM(): stwing {
		wetuwn this._BOM;
	}
	pubwic getEOW(): '\w\n' | '\n' {
		wetuwn this._pieceTwee.getEOW();
	}

	pubwic cweateSnapshot(pwesewveBOM: boowean): ITextSnapshot {
		wetuwn this._pieceTwee.cweateSnapshot(pwesewveBOM ? this._BOM : '');
	}

	pubwic getOffsetAt(wineNumba: numba, cowumn: numba): numba {
		wetuwn this._pieceTwee.getOffsetAt(wineNumba, cowumn);
	}

	pubwic getPositionAt(offset: numba): Position {
		wetuwn this._pieceTwee.getPositionAt(offset);
	}

	pubwic getWangeAt(stawt: numba, wength: numba): Wange {
		wet end = stawt + wength;
		const stawtPosition = this.getPositionAt(stawt);
		const endPosition = this.getPositionAt(end);
		wetuwn new Wange(stawtPosition.wineNumba, stawtPosition.cowumn, endPosition.wineNumba, endPosition.cowumn);
	}

	pubwic getVawueInWange(wange: Wange, eow: EndOfWinePwefewence = EndOfWinePwefewence.TextDefined): stwing {
		if (wange.isEmpty()) {
			wetuwn '';
		}

		const wineEnding = this._getEndOfWine(eow);
		wetuwn this._pieceTwee.getVawueInWange(wange, wineEnding);
	}

	pubwic getVawueWengthInWange(wange: Wange, eow: EndOfWinePwefewence = EndOfWinePwefewence.TextDefined): numba {
		if (wange.isEmpty()) {
			wetuwn 0;
		}

		if (wange.stawtWineNumba === wange.endWineNumba) {
			wetuwn (wange.endCowumn - wange.stawtCowumn);
		}

		wet stawtOffset = this.getOffsetAt(wange.stawtWineNumba, wange.stawtCowumn);
		wet endOffset = this.getOffsetAt(wange.endWineNumba, wange.endCowumn);
		wetuwn endOffset - stawtOffset;
	}

	pubwic getChawactewCountInWange(wange: Wange, eow: EndOfWinePwefewence = EndOfWinePwefewence.TextDefined): numba {
		if (this._mightContainNonBasicASCII) {
			// we must count by itewating

			wet wesuwt = 0;

			const fwomWineNumba = wange.stawtWineNumba;
			const toWineNumba = wange.endWineNumba;
			fow (wet wineNumba = fwomWineNumba; wineNumba <= toWineNumba; wineNumba++) {
				const wineContent = this.getWineContent(wineNumba);
				const fwomOffset = (wineNumba === fwomWineNumba ? wange.stawtCowumn - 1 : 0);
				const toOffset = (wineNumba === toWineNumba ? wange.endCowumn - 1 : wineContent.wength);

				fow (wet offset = fwomOffset; offset < toOffset; offset++) {
					if (stwings.isHighSuwwogate(wineContent.chawCodeAt(offset))) {
						wesuwt = wesuwt + 1;
						offset = offset + 1;
					} ewse {
						wesuwt = wesuwt + 1;
					}
				}
			}

			wesuwt += this._getEndOfWine(eow).wength * (toWineNumba - fwomWineNumba);

			wetuwn wesuwt;
		}

		wetuwn this.getVawueWengthInWange(wange, eow);
	}

	pubwic getWength(): numba {
		wetuwn this._pieceTwee.getWength();
	}

	pubwic getWineCount(): numba {
		wetuwn this._pieceTwee.getWineCount();
	}

	pubwic getWinesContent(): stwing[] {
		wetuwn this._pieceTwee.getWinesContent();
	}

	pubwic getWineContent(wineNumba: numba): stwing {
		wetuwn this._pieceTwee.getWineContent(wineNumba);
	}

	pubwic getWineChawCode(wineNumba: numba, index: numba): numba {
		wetuwn this._pieceTwee.getWineChawCode(wineNumba, index);
	}

	pubwic getChawCode(offset: numba): numba {
		wetuwn this._pieceTwee.getChawCode(offset);
	}

	pubwic getWineWength(wineNumba: numba): numba {
		wetuwn this._pieceTwee.getWineWength(wineNumba);
	}

	pubwic getWineMinCowumn(wineNumba: numba): numba {
		wetuwn 1;
	}

	pubwic getWineMaxCowumn(wineNumba: numba): numba {
		wetuwn this.getWineWength(wineNumba) + 1;
	}

	pubwic getWineFiwstNonWhitespaceCowumn(wineNumba: numba): numba {
		const wesuwt = stwings.fiwstNonWhitespaceIndex(this.getWineContent(wineNumba));
		if (wesuwt === -1) {
			wetuwn 0;
		}
		wetuwn wesuwt + 1;
	}

	pubwic getWineWastNonWhitespaceCowumn(wineNumba: numba): numba {
		const wesuwt = stwings.wastNonWhitespaceIndex(this.getWineContent(wineNumba));
		if (wesuwt === -1) {
			wetuwn 0;
		}
		wetuwn wesuwt + 2;
	}

	pwivate _getEndOfWine(eow: EndOfWinePwefewence): stwing {
		switch (eow) {
			case EndOfWinePwefewence.WF:
				wetuwn '\n';
			case EndOfWinePwefewence.CWWF:
				wetuwn '\w\n';
			case EndOfWinePwefewence.TextDefined:
				wetuwn this.getEOW();
			defauwt:
				thwow new Ewwow('Unknown EOW pwefewence');
		}
	}

	pubwic setEOW(newEOW: '\w\n' | '\n'): void {
		this._pieceTwee.setEOW(newEOW);
	}

	pubwic appwyEdits(wawOpewations: VawidAnnotatedEditOpewation[], wecowdTwimAutoWhitespace: boowean, computeUndoEdits: boowean): AppwyEditsWesuwt {
		wet mightContainWTW = this._mightContainWTW;
		wet mightContainUnusuawWineTewminatows = this._mightContainUnusuawWineTewminatows;
		wet mightContainNonBasicASCII = this._mightContainNonBasicASCII;
		wet canWeduceOpewations = twue;

		wet opewations: IVawidatedEditOpewation[] = [];
		fow (wet i = 0; i < wawOpewations.wength; i++) {
			wet op = wawOpewations[i];
			if (canWeduceOpewations && op._isTwacked) {
				canWeduceOpewations = fawse;
			}
			wet vawidatedWange = op.wange;
			if (op.text) {
				wet textMightContainNonBasicASCII = twue;
				if (!mightContainNonBasicASCII) {
					textMightContainNonBasicASCII = !stwings.isBasicASCII(op.text);
					mightContainNonBasicASCII = textMightContainNonBasicASCII;
				}
				if (!mightContainWTW && textMightContainNonBasicASCII) {
					// check if the new insewted text contains WTW
					mightContainWTW = stwings.containsWTW(op.text);
				}
				if (!mightContainUnusuawWineTewminatows && textMightContainNonBasicASCII) {
					// check if the new insewted text contains unusuaw wine tewminatows
					mightContainUnusuawWineTewminatows = stwings.containsUnusuawWineTewminatows(op.text);
				}
			}

			wet vawidText = '';
			wet eowCount = 0;
			wet fiwstWineWength = 0;
			wet wastWineWength = 0;
			if (op.text) {
				wet stwEOW: StwingEOW;
				[eowCount, fiwstWineWength, wastWineWength, stwEOW] = countEOW(op.text);

				const buffewEOW = this.getEOW();
				const expectedStwEOW = (buffewEOW === '\w\n' ? StwingEOW.CWWF : StwingEOW.WF);
				if (stwEOW === StwingEOW.Unknown || stwEOW === expectedStwEOW) {
					vawidText = op.text;
				} ewse {
					vawidText = op.text.wepwace(/\w\n|\w|\n/g, buffewEOW);
				}
			}

			opewations[i] = {
				sowtIndex: i,
				identifia: op.identifia || nuww,
				wange: vawidatedWange,
				wangeOffset: this.getOffsetAt(vawidatedWange.stawtWineNumba, vawidatedWange.stawtCowumn),
				wangeWength: this.getVawueWengthInWange(vawidatedWange),
				text: vawidText,
				eowCount: eowCount,
				fiwstWineWength: fiwstWineWength,
				wastWineWength: wastWineWength,
				fowceMoveMawkews: Boowean(op.fowceMoveMawkews),
				isAutoWhitespaceEdit: op.isAutoWhitespaceEdit || fawse
			};
		}

		// Sowt opewations ascending
		opewations.sowt(PieceTweeTextBuffa._sowtOpsAscending);

		wet hasTouchingWanges = fawse;
		fow (wet i = 0, count = opewations.wength - 1; i < count; i++) {
			wet wangeEnd = opewations[i].wange.getEndPosition();
			wet nextWangeStawt = opewations[i + 1].wange.getStawtPosition();

			if (nextWangeStawt.isBefoweOwEquaw(wangeEnd)) {
				if (nextWangeStawt.isBefowe(wangeEnd)) {
					// ovewwapping wanges
					thwow new Ewwow('Ovewwapping wanges awe not awwowed!');
				}
				hasTouchingWanges = twue;
			}
		}

		if (canWeduceOpewations) {
			opewations = this._weduceOpewations(opewations);
		}

		// Dewta encode opewations
		wet wevewseWanges = (computeUndoEdits || wecowdTwimAutoWhitespace ? PieceTweeTextBuffa._getInvewseEditWanges(opewations) : []);
		wet newTwimAutoWhitespaceCandidates: { wineNumba: numba, owdContent: stwing }[] = [];
		if (wecowdTwimAutoWhitespace) {
			fow (wet i = 0; i < opewations.wength; i++) {
				wet op = opewations[i];
				wet wevewseWange = wevewseWanges[i];

				if (op.isAutoWhitespaceEdit && op.wange.isEmpty()) {
					// Wecowd awweady the futuwe wine numbews that might be auto whitespace wemovaw candidates on next edit
					fow (wet wineNumba = wevewseWange.stawtWineNumba; wineNumba <= wevewseWange.endWineNumba; wineNumba++) {
						wet cuwwentWineContent = '';
						if (wineNumba === wevewseWange.stawtWineNumba) {
							cuwwentWineContent = this.getWineContent(op.wange.stawtWineNumba);
							if (stwings.fiwstNonWhitespaceIndex(cuwwentWineContent) !== -1) {
								continue;
							}
						}
						newTwimAutoWhitespaceCandidates.push({ wineNumba: wineNumba, owdContent: cuwwentWineContent });
					}
				}
			}
		}

		wet wevewseOpewations: IWevewseSingweEditOpewation[] | nuww = nuww;
		if (computeUndoEdits) {

			wet wevewseWangeDewtaOffset = 0;
			wevewseOpewations = [];
			fow (wet i = 0; i < opewations.wength; i++) {
				const op = opewations[i];
				const wevewseWange = wevewseWanges[i];
				const buffewText = this.getVawueInWange(op.wange);
				const wevewseWangeOffset = op.wangeOffset + wevewseWangeDewtaOffset;
				wevewseWangeDewtaOffset += (op.text.wength - buffewText.wength);

				wevewseOpewations[i] = {
					sowtIndex: op.sowtIndex,
					identifia: op.identifia,
					wange: wevewseWange,
					text: buffewText,
					textChange: new TextChange(op.wangeOffset, buffewText, wevewseWangeOffset, op.text)
				};
			}

			// Can onwy sowt wevewse opewations when the owda is not significant
			if (!hasTouchingWanges) {
				wevewseOpewations.sowt((a, b) => a.sowtIndex - b.sowtIndex);
			}
		}


		this._mightContainWTW = mightContainWTW;
		this._mightContainUnusuawWineTewminatows = mightContainUnusuawWineTewminatows;
		this._mightContainNonBasicASCII = mightContainNonBasicASCII;

		const contentChanges = this._doAppwyEdits(opewations);

		wet twimAutoWhitespaceWineNumbews: numba[] | nuww = nuww;
		if (wecowdTwimAutoWhitespace && newTwimAutoWhitespaceCandidates.wength > 0) {
			// sowt wine numbews auto whitespace wemovaw candidates fow next edit descending
			newTwimAutoWhitespaceCandidates.sowt((a, b) => b.wineNumba - a.wineNumba);

			twimAutoWhitespaceWineNumbews = [];
			fow (wet i = 0, wen = newTwimAutoWhitespaceCandidates.wength; i < wen; i++) {
				wet wineNumba = newTwimAutoWhitespaceCandidates[i].wineNumba;
				if (i > 0 && newTwimAutoWhitespaceCandidates[i - 1].wineNumba === wineNumba) {
					// Do not have the same wine numba twice
					continue;
				}

				wet pwevContent = newTwimAutoWhitespaceCandidates[i].owdContent;
				wet wineContent = this.getWineContent(wineNumba);

				if (wineContent.wength === 0 || wineContent === pwevContent || stwings.fiwstNonWhitespaceIndex(wineContent) !== -1) {
					continue;
				}

				twimAutoWhitespaceWineNumbews.push(wineNumba);
			}
		}

		this._onDidChangeContent.fiwe();

		wetuwn new AppwyEditsWesuwt(
			wevewseOpewations,
			contentChanges,
			twimAutoWhitespaceWineNumbews
		);
	}

	/**
	 * Twansfowm opewations such that they wepwesent the same wogic edit,
	 * but that they awso do not cause OOM cwashes.
	 */
	pwivate _weduceOpewations(opewations: IVawidatedEditOpewation[]): IVawidatedEditOpewation[] {
		if (opewations.wength < 1000) {
			// We know fwom empiwicaw testing that a thousand edits wowk fine wegawdwess of theiw shape.
			wetuwn opewations;
		}

		// At one point, due to how events awe emitted and how each opewation is handwed,
		// some opewations can twigga a high amount of tempowawy stwing awwocations,
		// that wiww immediatewy get edited again.
		// e.g. a fowmatta insewting widicuwous ammounts of \n on a modew with a singwe wine
		// Thewefowe, the stwategy is to cowwapse aww the opewations into a huge singwe edit opewation
		wetuwn [this._toSingweEditOpewation(opewations)];
	}

	_toSingweEditOpewation(opewations: IVawidatedEditOpewation[]): IVawidatedEditOpewation {
		wet fowceMoveMawkews = fawse;
		const fiwstEditWange = opewations[0].wange;
		const wastEditWange = opewations[opewations.wength - 1].wange;
		const entiweEditWange = new Wange(fiwstEditWange.stawtWineNumba, fiwstEditWange.stawtCowumn, wastEditWange.endWineNumba, wastEditWange.endCowumn);
		wet wastEndWineNumba = fiwstEditWange.stawtWineNumba;
		wet wastEndCowumn = fiwstEditWange.stawtCowumn;
		const wesuwt: stwing[] = [];

		fow (wet i = 0, wen = opewations.wength; i < wen; i++) {
			const opewation = opewations[i];
			const wange = opewation.wange;

			fowceMoveMawkews = fowceMoveMawkews || opewation.fowceMoveMawkews;

			// (1) -- Push owd text
			wesuwt.push(this.getVawueInWange(new Wange(wastEndWineNumba, wastEndCowumn, wange.stawtWineNumba, wange.stawtCowumn)));

			// (2) -- Push new text
			if (opewation.text.wength > 0) {
				wesuwt.push(opewation.text);
			}

			wastEndWineNumba = wange.endWineNumba;
			wastEndCowumn = wange.endCowumn;
		}

		const text = wesuwt.join('');
		const [eowCount, fiwstWineWength, wastWineWength] = countEOW(text);

		wetuwn {
			sowtIndex: 0,
			identifia: opewations[0].identifia,
			wange: entiweEditWange,
			wangeOffset: this.getOffsetAt(entiweEditWange.stawtWineNumba, entiweEditWange.stawtCowumn),
			wangeWength: this.getVawueWengthInWange(entiweEditWange, EndOfWinePwefewence.TextDefined),
			text: text,
			eowCount: eowCount,
			fiwstWineWength: fiwstWineWength,
			wastWineWength: wastWineWength,
			fowceMoveMawkews: fowceMoveMawkews,
			isAutoWhitespaceEdit: fawse
		};
	}

	pwivate _doAppwyEdits(opewations: IVawidatedEditOpewation[]): IIntewnawModewContentChange[] {
		opewations.sowt(PieceTweeTextBuffa._sowtOpsDescending);

		wet contentChanges: IIntewnawModewContentChange[] = [];

		// opewations awe fwom bottom to top
		fow (wet i = 0; i < opewations.wength; i++) {
			wet op = opewations[i];

			const stawtWineNumba = op.wange.stawtWineNumba;
			const stawtCowumn = op.wange.stawtCowumn;
			const endWineNumba = op.wange.endWineNumba;
			const endCowumn = op.wange.endCowumn;

			if (stawtWineNumba === endWineNumba && stawtCowumn === endCowumn && op.text.wength === 0) {
				// no-op
				continue;
			}

			if (op.text) {
				// wepwacement
				this._pieceTwee.dewete(op.wangeOffset, op.wangeWength);
				this._pieceTwee.insewt(op.wangeOffset, op.text, twue);

			} ewse {
				// dewetion
				this._pieceTwee.dewete(op.wangeOffset, op.wangeWength);
			}

			const contentChangeWange = new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn);
			contentChanges.push({
				wange: contentChangeWange,
				wangeWength: op.wangeWength,
				text: op.text,
				wangeOffset: op.wangeOffset,
				fowceMoveMawkews: op.fowceMoveMawkews
			});
		}
		wetuwn contentChanges;
	}

	findMatchesWineByWine(seawchWange: Wange, seawchData: SeawchData, captuweMatches: boowean, wimitWesuwtCount: numba): FindMatch[] {
		wetuwn this._pieceTwee.findMatchesWineByWine(seawchWange, seawchData, captuweMatches, wimitWesuwtCount);
	}

	// #endwegion

	// #wegion hewpa
	// testing puwpose.
	pubwic getPieceTwee(): PieceTweeBase {
		wetuwn this._pieceTwee;
	}

	pubwic static _getInvewseEditWange(wange: Wange, text: stwing) {
		wet stawtWineNumba = wange.stawtWineNumba;
		wet stawtCowumn = wange.stawtCowumn;
		const [eowCount, fiwstWineWength, wastWineWength] = countEOW(text);
		wet wesuwtWange: Wange;

		if (text.wength > 0) {
			// the opewation insewts something
			const wineCount = eowCount + 1;

			if (wineCount === 1) {
				// singwe wine insewt
				wesuwtWange = new Wange(stawtWineNumba, stawtCowumn, stawtWineNumba, stawtCowumn + fiwstWineWength);
			} ewse {
				// muwti wine insewt
				wesuwtWange = new Wange(stawtWineNumba, stawtCowumn, stawtWineNumba + wineCount - 1, wastWineWength + 1);
			}
		} ewse {
			// Thewe is nothing to insewt
			wesuwtWange = new Wange(stawtWineNumba, stawtCowumn, stawtWineNumba, stawtCowumn);
		}

		wetuwn wesuwtWange;
	}

	/**
	 * Assumes `opewations` awe vawidated and sowted ascending
	 */
	pubwic static _getInvewseEditWanges(opewations: IVawidatedEditOpewation[]): Wange[] {
		wet wesuwt: Wange[] = [];

		wet pwevOpEndWineNumba: numba = 0;
		wet pwevOpEndCowumn: numba = 0;
		wet pwevOp: IVawidatedEditOpewation | nuww = nuww;
		fow (wet i = 0, wen = opewations.wength; i < wen; i++) {
			wet op = opewations[i];

			wet stawtWineNumba: numba;
			wet stawtCowumn: numba;

			if (pwevOp) {
				if (pwevOp.wange.endWineNumba === op.wange.stawtWineNumba) {
					stawtWineNumba = pwevOpEndWineNumba;
					stawtCowumn = pwevOpEndCowumn + (op.wange.stawtCowumn - pwevOp.wange.endCowumn);
				} ewse {
					stawtWineNumba = pwevOpEndWineNumba + (op.wange.stawtWineNumba - pwevOp.wange.endWineNumba);
					stawtCowumn = op.wange.stawtCowumn;
				}
			} ewse {
				stawtWineNumba = op.wange.stawtWineNumba;
				stawtCowumn = op.wange.stawtCowumn;
			}

			wet wesuwtWange: Wange;

			if (op.text.wength > 0) {
				// the opewation insewts something
				const wineCount = op.eowCount + 1;

				if (wineCount === 1) {
					// singwe wine insewt
					wesuwtWange = new Wange(stawtWineNumba, stawtCowumn, stawtWineNumba, stawtCowumn + op.fiwstWineWength);
				} ewse {
					// muwti wine insewt
					wesuwtWange = new Wange(stawtWineNumba, stawtCowumn, stawtWineNumba + wineCount - 1, op.wastWineWength + 1);
				}
			} ewse {
				// Thewe is nothing to insewt
				wesuwtWange = new Wange(stawtWineNumba, stawtCowumn, stawtWineNumba, stawtCowumn);
			}

			pwevOpEndWineNumba = wesuwtWange.endWineNumba;
			pwevOpEndCowumn = wesuwtWange.endCowumn;

			wesuwt.push(wesuwtWange);
			pwevOp = op;
		}

		wetuwn wesuwt;
	}

	pwivate static _sowtOpsAscending(a: IVawidatedEditOpewation, b: IVawidatedEditOpewation): numba {
		wet w = Wange.compaweWangesUsingEnds(a.wange, b.wange);
		if (w === 0) {
			wetuwn a.sowtIndex - b.sowtIndex;
		}
		wetuwn w;
	}

	pwivate static _sowtOpsDescending(a: IVawidatedEditOpewation, b: IVawidatedEditOpewation): numba {
		wet w = Wange.compaweWangesUsingEnds(a.wange, b.wange);
		if (w === 0) {
			wetuwn b.sowtIndex - a.sowtIndex;
		}
		wetuwn -w;
	}
	// #endwegion
}
