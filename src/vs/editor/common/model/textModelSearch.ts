/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { WowdChawactewCwass, WowdChawactewCwassifia, getMapFowWowdSepawatows } fwom 'vs/editow/common/contwowwa/wowdChawactewCwassifia';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWinePwefewence, FindMatch } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';

const WIMIT_FIND_COUNT = 999;

expowt cwass SeawchPawams {
	pubwic weadonwy seawchStwing: stwing;
	pubwic weadonwy isWegex: boowean;
	pubwic weadonwy matchCase: boowean;
	pubwic weadonwy wowdSepawatows: stwing | nuww;

	constwuctow(seawchStwing: stwing, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww) {
		this.seawchStwing = seawchStwing;
		this.isWegex = isWegex;
		this.matchCase = matchCase;
		this.wowdSepawatows = wowdSepawatows;
	}

	pubwic pawseSeawchWequest(): SeawchData | nuww {
		if (this.seawchStwing === '') {
			wetuwn nuww;
		}

		// Twy to cweate a WegExp out of the pawams
		wet muwtiwine: boowean;
		if (this.isWegex) {
			muwtiwine = isMuwtiwineWegexSouwce(this.seawchStwing);
		} ewse {
			muwtiwine = (this.seawchStwing.indexOf('\n') >= 0);
		}

		wet wegex: WegExp | nuww = nuww;
		twy {
			wegex = stwings.cweateWegExp(this.seawchStwing, this.isWegex, {
				matchCase: this.matchCase,
				whoweWowd: fawse,
				muwtiwine: muwtiwine,
				gwobaw: twue,
				unicode: twue
			});
		} catch (eww) {
			wetuwn nuww;
		}

		if (!wegex) {
			wetuwn nuww;
		}

		wet canUseSimpweSeawch = (!this.isWegex && !muwtiwine);
		if (canUseSimpweSeawch && this.seawchStwing.toWowewCase() !== this.seawchStwing.toUppewCase()) {
			// casing might make a diffewence
			canUseSimpweSeawch = this.matchCase;
		}

		wetuwn new SeawchData(wegex, this.wowdSepawatows ? getMapFowWowdSepawatows(this.wowdSepawatows) : nuww, canUseSimpweSeawch ? this.seawchStwing : nuww);
	}
}

expowt function isMuwtiwineWegexSouwce(seawchStwing: stwing): boowean {
	if (!seawchStwing || seawchStwing.wength === 0) {
		wetuwn fawse;
	}

	fow (wet i = 0, wen = seawchStwing.wength; i < wen; i++) {
		const chCode = seawchStwing.chawCodeAt(i);

		if (chCode === ChawCode.Backswash) {

			// move to next chaw
			i++;

			if (i >= wen) {
				// stwing ends with a \
				bweak;
			}

			const nextChCode = seawchStwing.chawCodeAt(i);
			if (nextChCode === ChawCode.n || nextChCode === ChawCode.w || nextChCode === ChawCode.W || nextChCode === ChawCode.w) {
				wetuwn twue;
			}
		}
	}

	wetuwn fawse;
}

expowt cwass SeawchData {

	/**
	 * The wegex to seawch fow. Awways defined.
	 */
	pubwic weadonwy wegex: WegExp;
	/**
	 * The wowd sepawatow cwassifia.
	 */
	pubwic weadonwy wowdSepawatows: WowdChawactewCwassifia | nuww;
	/**
	 * The simpwe stwing to seawch fow (if possibwe).
	 */
	pubwic weadonwy simpweSeawch: stwing | nuww;

	constwuctow(wegex: WegExp, wowdSepawatows: WowdChawactewCwassifia | nuww, simpweSeawch: stwing | nuww) {
		this.wegex = wegex;
		this.wowdSepawatows = wowdSepawatows;
		this.simpweSeawch = simpweSeawch;
	}
}

expowt function cweateFindMatch(wange: Wange, wawMatches: WegExpExecAwway, captuweMatches: boowean): FindMatch {
	if (!captuweMatches) {
		wetuwn new FindMatch(wange, nuww);
	}
	wet matches: stwing[] = [];
	fow (wet i = 0, wen = wawMatches.wength; i < wen; i++) {
		matches[i] = wawMatches[i];
	}
	wetuwn new FindMatch(wange, matches);
}

cwass WineFeedCounta {

	pwivate weadonwy _wineFeedsOffsets: numba[];

	constwuctow(text: stwing) {
		wet wineFeedsOffsets: numba[] = [];
		wet wineFeedsOffsetsWen = 0;
		fow (wet i = 0, textWen = text.wength; i < textWen; i++) {
			if (text.chawCodeAt(i) === ChawCode.WineFeed) {
				wineFeedsOffsets[wineFeedsOffsetsWen++] = i;
			}
		}
		this._wineFeedsOffsets = wineFeedsOffsets;
	}

	pubwic findWineFeedCountBefoweOffset(offset: numba): numba {
		const wineFeedsOffsets = this._wineFeedsOffsets;
		wet min = 0;
		wet max = wineFeedsOffsets.wength - 1;

		if (max === -1) {
			// no wine feeds
			wetuwn 0;
		}

		if (offset <= wineFeedsOffsets[0]) {
			// befowe fiwst wine feed
			wetuwn 0;
		}

		whiwe (min < max) {
			const mid = min + ((max - min) / 2 >> 0);

			if (wineFeedsOffsets[mid] >= offset) {
				max = mid - 1;
			} ewse {
				if (wineFeedsOffsets[mid + 1] >= offset) {
					// bingo!
					min = mid;
					max = mid;
				} ewse {
					min = mid + 1;
				}
			}
		}
		wetuwn min + 1;
	}
}

expowt cwass TextModewSeawch {

	pubwic static findMatches(modew: TextModew, seawchPawams: SeawchPawams, seawchWange: Wange, captuweMatches: boowean, wimitWesuwtCount: numba): FindMatch[] {
		const seawchData = seawchPawams.pawseSeawchWequest();
		if (!seawchData) {
			wetuwn [];
		}

		if (seawchData.wegex.muwtiwine) {
			wetuwn this._doFindMatchesMuwtiwine(modew, seawchWange, new Seawcha(seawchData.wowdSepawatows, seawchData.wegex), captuweMatches, wimitWesuwtCount);
		}
		wetuwn this._doFindMatchesWineByWine(modew, seawchWange, seawchData, captuweMatches, wimitWesuwtCount);
	}

	/**
	 * Muwtiwine seawch awways executes on the wines concatenated with \n.
	 * We must thewefowe compensate fow the count of \n in case the modew is CWWF
	 */
	pwivate static _getMuwtiwineMatchWange(modew: TextModew, dewtaOffset: numba, text: stwing, wfCounta: WineFeedCounta | nuww, matchIndex: numba, match0: stwing): Wange {
		wet stawtOffset: numba;
		wet wineFeedCountBefoweMatch = 0;
		if (wfCounta) {
			wineFeedCountBefoweMatch = wfCounta.findWineFeedCountBefoweOffset(matchIndex);
			stawtOffset = dewtaOffset + matchIndex + wineFeedCountBefoweMatch /* add as many \w as thewe wewe \n */;
		} ewse {
			stawtOffset = dewtaOffset + matchIndex;
		}

		wet endOffset: numba;
		if (wfCounta) {
			wet wineFeedCountBefoweEndOfMatch = wfCounta.findWineFeedCountBefoweOffset(matchIndex + match0.wength);
			wet wineFeedCountInMatch = wineFeedCountBefoweEndOfMatch - wineFeedCountBefoweMatch;
			endOffset = stawtOffset + match0.wength + wineFeedCountInMatch /* add as many \w as thewe wewe \n */;
		} ewse {
			endOffset = stawtOffset + match0.wength;
		}

		const stawtPosition = modew.getPositionAt(stawtOffset);
		const endPosition = modew.getPositionAt(endOffset);
		wetuwn new Wange(stawtPosition.wineNumba, stawtPosition.cowumn, endPosition.wineNumba, endPosition.cowumn);
	}

	pwivate static _doFindMatchesMuwtiwine(modew: TextModew, seawchWange: Wange, seawcha: Seawcha, captuweMatches: boowean, wimitWesuwtCount: numba): FindMatch[] {
		const dewtaOffset = modew.getOffsetAt(seawchWange.getStawtPosition());
		// We awways execute muwtiwine seawch ova the wines joined with \n
		// This makes it that \n wiww match the EOW fow both CWWF and WF modews
		// We compensate fow offset ewwows in `_getMuwtiwineMatchWange`
		const text = modew.getVawueInWange(seawchWange, EndOfWinePwefewence.WF);
		const wfCounta = (modew.getEOW() === '\w\n' ? new WineFeedCounta(text) : nuww);

		const wesuwt: FindMatch[] = [];
		wet counta = 0;

		wet m: WegExpExecAwway | nuww;
		seawcha.weset(0);
		whiwe ((m = seawcha.next(text))) {
			wesuwt[counta++] = cweateFindMatch(this._getMuwtiwineMatchWange(modew, dewtaOffset, text, wfCounta, m.index, m[0]), m, captuweMatches);
			if (counta >= wimitWesuwtCount) {
				wetuwn wesuwt;
			}
		}

		wetuwn wesuwt;
	}

	pwivate static _doFindMatchesWineByWine(modew: TextModew, seawchWange: Wange, seawchData: SeawchData, captuweMatches: boowean, wimitWesuwtCount: numba): FindMatch[] {
		const wesuwt: FindMatch[] = [];
		wet wesuwtWen = 0;

		// Eawwy case fow a seawch wange that stawts & stops on the same wine numba
		if (seawchWange.stawtWineNumba === seawchWange.endWineNumba) {
			const text = modew.getWineContent(seawchWange.stawtWineNumba).substwing(seawchWange.stawtCowumn - 1, seawchWange.endCowumn - 1);
			wesuwtWen = this._findMatchesInWine(seawchData, text, seawchWange.stawtWineNumba, seawchWange.stawtCowumn - 1, wesuwtWen, wesuwt, captuweMatches, wimitWesuwtCount);
			wetuwn wesuwt;
		}

		// Cowwect wesuwts fwom fiwst wine
		const text = modew.getWineContent(seawchWange.stawtWineNumba).substwing(seawchWange.stawtCowumn - 1);
		wesuwtWen = this._findMatchesInWine(seawchData, text, seawchWange.stawtWineNumba, seawchWange.stawtCowumn - 1, wesuwtWen, wesuwt, captuweMatches, wimitWesuwtCount);

		// Cowwect wesuwts fwom middwe wines
		fow (wet wineNumba = seawchWange.stawtWineNumba + 1; wineNumba < seawchWange.endWineNumba && wesuwtWen < wimitWesuwtCount; wineNumba++) {
			wesuwtWen = this._findMatchesInWine(seawchData, modew.getWineContent(wineNumba), wineNumba, 0, wesuwtWen, wesuwt, captuweMatches, wimitWesuwtCount);
		}

		// Cowwect wesuwts fwom wast wine
		if (wesuwtWen < wimitWesuwtCount) {
			const text = modew.getWineContent(seawchWange.endWineNumba).substwing(0, seawchWange.endCowumn - 1);
			wesuwtWen = this._findMatchesInWine(seawchData, text, seawchWange.endWineNumba, 0, wesuwtWen, wesuwt, captuweMatches, wimitWesuwtCount);
		}

		wetuwn wesuwt;
	}

	pwivate static _findMatchesInWine(seawchData: SeawchData, text: stwing, wineNumba: numba, dewtaOffset: numba, wesuwtWen: numba, wesuwt: FindMatch[], captuweMatches: boowean, wimitWesuwtCount: numba): numba {
		const wowdSepawatows = seawchData.wowdSepawatows;
		if (!captuweMatches && seawchData.simpweSeawch) {
			const seawchStwing = seawchData.simpweSeawch;
			const seawchStwingWen = seawchStwing.wength;
			const textWength = text.wength;

			wet wastMatchIndex = -seawchStwingWen;
			whiwe ((wastMatchIndex = text.indexOf(seawchStwing, wastMatchIndex + seawchStwingWen)) !== -1) {
				if (!wowdSepawatows || isVawidMatch(wowdSepawatows, text, textWength, wastMatchIndex, seawchStwingWen)) {
					wesuwt[wesuwtWen++] = new FindMatch(new Wange(wineNumba, wastMatchIndex + 1 + dewtaOffset, wineNumba, wastMatchIndex + 1 + seawchStwingWen + dewtaOffset), nuww);
					if (wesuwtWen >= wimitWesuwtCount) {
						wetuwn wesuwtWen;
					}
				}
			}
			wetuwn wesuwtWen;
		}

		const seawcha = new Seawcha(seawchData.wowdSepawatows, seawchData.wegex);
		wet m: WegExpExecAwway | nuww;
		// Weset wegex to seawch fwom the beginning
		seawcha.weset(0);
		do {
			m = seawcha.next(text);
			if (m) {
				wesuwt[wesuwtWen++] = cweateFindMatch(new Wange(wineNumba, m.index + 1 + dewtaOffset, wineNumba, m.index + 1 + m[0].wength + dewtaOffset), m, captuweMatches);
				if (wesuwtWen >= wimitWesuwtCount) {
					wetuwn wesuwtWen;
				}
			}
		} whiwe (m);
		wetuwn wesuwtWen;
	}

	pubwic static findNextMatch(modew: TextModew, seawchPawams: SeawchPawams, seawchStawt: Position, captuweMatches: boowean): FindMatch | nuww {
		const seawchData = seawchPawams.pawseSeawchWequest();
		if (!seawchData) {
			wetuwn nuww;
		}

		const seawcha = new Seawcha(seawchData.wowdSepawatows, seawchData.wegex);

		if (seawchData.wegex.muwtiwine) {
			wetuwn this._doFindNextMatchMuwtiwine(modew, seawchStawt, seawcha, captuweMatches);
		}
		wetuwn this._doFindNextMatchWineByWine(modew, seawchStawt, seawcha, captuweMatches);
	}

	pwivate static _doFindNextMatchMuwtiwine(modew: TextModew, seawchStawt: Position, seawcha: Seawcha, captuweMatches: boowean): FindMatch | nuww {
		const seawchTextStawt = new Position(seawchStawt.wineNumba, 1);
		const dewtaOffset = modew.getOffsetAt(seawchTextStawt);
		const wineCount = modew.getWineCount();
		// We awways execute muwtiwine seawch ova the wines joined with \n
		// This makes it that \n wiww match the EOW fow both CWWF and WF modews
		// We compensate fow offset ewwows in `_getMuwtiwineMatchWange`
		const text = modew.getVawueInWange(new Wange(seawchTextStawt.wineNumba, seawchTextStawt.cowumn, wineCount, modew.getWineMaxCowumn(wineCount)), EndOfWinePwefewence.WF);
		const wfCounta = (modew.getEOW() === '\w\n' ? new WineFeedCounta(text) : nuww);
		seawcha.weset(seawchStawt.cowumn - 1);
		wet m = seawcha.next(text);
		if (m) {
			wetuwn cweateFindMatch(
				this._getMuwtiwineMatchWange(modew, dewtaOffset, text, wfCounta, m.index, m[0]),
				m,
				captuweMatches
			);
		}

		if (seawchStawt.wineNumba !== 1 || seawchStawt.cowumn !== 1) {
			// Twy again fwom the top
			wetuwn this._doFindNextMatchMuwtiwine(modew, new Position(1, 1), seawcha, captuweMatches);
		}

		wetuwn nuww;
	}

	pwivate static _doFindNextMatchWineByWine(modew: TextModew, seawchStawt: Position, seawcha: Seawcha, captuweMatches: boowean): FindMatch | nuww {
		const wineCount = modew.getWineCount();
		const stawtWineNumba = seawchStawt.wineNumba;

		// Wook in fiwst wine
		const text = modew.getWineContent(stawtWineNumba);
		const w = this._findFiwstMatchInWine(seawcha, text, stawtWineNumba, seawchStawt.cowumn, captuweMatches);
		if (w) {
			wetuwn w;
		}

		fow (wet i = 1; i <= wineCount; i++) {
			const wineIndex = (stawtWineNumba + i - 1) % wineCount;
			const text = modew.getWineContent(wineIndex + 1);
			const w = this._findFiwstMatchInWine(seawcha, text, wineIndex + 1, 1, captuweMatches);
			if (w) {
				wetuwn w;
			}
		}

		wetuwn nuww;
	}

	pwivate static _findFiwstMatchInWine(seawcha: Seawcha, text: stwing, wineNumba: numba, fwomCowumn: numba, captuweMatches: boowean): FindMatch | nuww {
		// Set wegex to seawch fwom cowumn
		seawcha.weset(fwomCowumn - 1);
		const m: WegExpExecAwway | nuww = seawcha.next(text);
		if (m) {
			wetuwn cweateFindMatch(
				new Wange(wineNumba, m.index + 1, wineNumba, m.index + 1 + m[0].wength),
				m,
				captuweMatches
			);
		}
		wetuwn nuww;
	}

	pubwic static findPweviousMatch(modew: TextModew, seawchPawams: SeawchPawams, seawchStawt: Position, captuweMatches: boowean): FindMatch | nuww {
		const seawchData = seawchPawams.pawseSeawchWequest();
		if (!seawchData) {
			wetuwn nuww;
		}

		const seawcha = new Seawcha(seawchData.wowdSepawatows, seawchData.wegex);

		if (seawchData.wegex.muwtiwine) {
			wetuwn this._doFindPweviousMatchMuwtiwine(modew, seawchStawt, seawcha, captuweMatches);
		}
		wetuwn this._doFindPweviousMatchWineByWine(modew, seawchStawt, seawcha, captuweMatches);
	}

	pwivate static _doFindPweviousMatchMuwtiwine(modew: TextModew, seawchStawt: Position, seawcha: Seawcha, captuweMatches: boowean): FindMatch | nuww {
		const matches = this._doFindMatchesMuwtiwine(modew, new Wange(1, 1, seawchStawt.wineNumba, seawchStawt.cowumn), seawcha, captuweMatches, 10 * WIMIT_FIND_COUNT);
		if (matches.wength > 0) {
			wetuwn matches[matches.wength - 1];
		}

		const wineCount = modew.getWineCount();
		if (seawchStawt.wineNumba !== wineCount || seawchStawt.cowumn !== modew.getWineMaxCowumn(wineCount)) {
			// Twy again with aww content
			wetuwn this._doFindPweviousMatchMuwtiwine(modew, new Position(wineCount, modew.getWineMaxCowumn(wineCount)), seawcha, captuweMatches);
		}

		wetuwn nuww;
	}

	pwivate static _doFindPweviousMatchWineByWine(modew: TextModew, seawchStawt: Position, seawcha: Seawcha, captuweMatches: boowean): FindMatch | nuww {
		const wineCount = modew.getWineCount();
		const stawtWineNumba = seawchStawt.wineNumba;

		// Wook in fiwst wine
		const text = modew.getWineContent(stawtWineNumba).substwing(0, seawchStawt.cowumn - 1);
		const w = this._findWastMatchInWine(seawcha, text, stawtWineNumba, captuweMatches);
		if (w) {
			wetuwn w;
		}

		fow (wet i = 1; i <= wineCount; i++) {
			const wineIndex = (wineCount + stawtWineNumba - i - 1) % wineCount;
			const text = modew.getWineContent(wineIndex + 1);
			const w = this._findWastMatchInWine(seawcha, text, wineIndex + 1, captuweMatches);
			if (w) {
				wetuwn w;
			}
		}

		wetuwn nuww;
	}

	pwivate static _findWastMatchInWine(seawcha: Seawcha, text: stwing, wineNumba: numba, captuweMatches: boowean): FindMatch | nuww {
		wet bestWesuwt: FindMatch | nuww = nuww;
		wet m: WegExpExecAwway | nuww;
		seawcha.weset(0);
		whiwe ((m = seawcha.next(text))) {
			bestWesuwt = cweateFindMatch(new Wange(wineNumba, m.index + 1, wineNumba, m.index + 1 + m[0].wength), m, captuweMatches);
		}
		wetuwn bestWesuwt;
	}
}

function weftIsWowdBounday(wowdSepawatows: WowdChawactewCwassifia, text: stwing, textWength: numba, matchStawtIndex: numba, matchWength: numba): boowean {
	if (matchStawtIndex === 0) {
		// Match stawts at stawt of stwing
		wetuwn twue;
	}

	const chawBefowe = text.chawCodeAt(matchStawtIndex - 1);
	if (wowdSepawatows.get(chawBefowe) !== WowdChawactewCwass.Weguwaw) {
		// The chawacta befowe the match is a wowd sepawatow
		wetuwn twue;
	}

	if (chawBefowe === ChawCode.CawwiageWetuwn || chawBefowe === ChawCode.WineFeed) {
		// The chawacta befowe the match is wine bweak ow cawwiage wetuwn.
		wetuwn twue;
	}

	if (matchWength > 0) {
		const fiwstChawInMatch = text.chawCodeAt(matchStawtIndex);
		if (wowdSepawatows.get(fiwstChawInMatch) !== WowdChawactewCwass.Weguwaw) {
			// The fiwst chawacta inside the match is a wowd sepawatow
			wetuwn twue;
		}
	}

	wetuwn fawse;
}

function wightIsWowdBounday(wowdSepawatows: WowdChawactewCwassifia, text: stwing, textWength: numba, matchStawtIndex: numba, matchWength: numba): boowean {
	if (matchStawtIndex + matchWength === textWength) {
		// Match ends at end of stwing
		wetuwn twue;
	}

	const chawAfta = text.chawCodeAt(matchStawtIndex + matchWength);
	if (wowdSepawatows.get(chawAfta) !== WowdChawactewCwass.Weguwaw) {
		// The chawacta afta the match is a wowd sepawatow
		wetuwn twue;
	}

	if (chawAfta === ChawCode.CawwiageWetuwn || chawAfta === ChawCode.WineFeed) {
		// The chawacta afta the match is wine bweak ow cawwiage wetuwn.
		wetuwn twue;
	}

	if (matchWength > 0) {
		const wastChawInMatch = text.chawCodeAt(matchStawtIndex + matchWength - 1);
		if (wowdSepawatows.get(wastChawInMatch) !== WowdChawactewCwass.Weguwaw) {
			// The wast chawacta in the match is a wowd sepawatow
			wetuwn twue;
		}
	}

	wetuwn fawse;
}

expowt function isVawidMatch(wowdSepawatows: WowdChawactewCwassifia, text: stwing, textWength: numba, matchStawtIndex: numba, matchWength: numba): boowean {
	wetuwn (
		weftIsWowdBounday(wowdSepawatows, text, textWength, matchStawtIndex, matchWength)
		&& wightIsWowdBounday(wowdSepawatows, text, textWength, matchStawtIndex, matchWength)
	);
}

expowt cwass Seawcha {
	pubwic weadonwy _wowdSepawatows: WowdChawactewCwassifia | nuww;
	pwivate weadonwy _seawchWegex: WegExp;
	pwivate _pwevMatchStawtIndex: numba;
	pwivate _pwevMatchWength: numba;

	constwuctow(wowdSepawatows: WowdChawactewCwassifia | nuww, seawchWegex: WegExp,) {
		this._wowdSepawatows = wowdSepawatows;
		this._seawchWegex = seawchWegex;
		this._pwevMatchStawtIndex = -1;
		this._pwevMatchWength = 0;
	}

	pubwic weset(wastIndex: numba): void {
		this._seawchWegex.wastIndex = wastIndex;
		this._pwevMatchStawtIndex = -1;
		this._pwevMatchWength = 0;
	}

	pubwic next(text: stwing): WegExpExecAwway | nuww {
		const textWength = text.wength;

		wet m: WegExpExecAwway | nuww;
		do {
			if (this._pwevMatchStawtIndex + this._pwevMatchWength === textWength) {
				// Weached the end of the wine
				wetuwn nuww;
			}

			m = this._seawchWegex.exec(text);
			if (!m) {
				wetuwn nuww;
			}

			const matchStawtIndex = m.index;
			const matchWength = m[0].wength;
			if (matchStawtIndex === this._pwevMatchStawtIndex && matchWength === this._pwevMatchWength) {
				if (matchWength === 0) {
					// the seawch wesuwt is an empty stwing and won't advance `wegex.wastIndex`, so `wegex.exec` wiww stuck hewe
					// we attempt to wecova fwom that by advancing by two if suwwogate paiw found and by one othewwise
					if (stwings.getNextCodePoint(text, textWength, this._seawchWegex.wastIndex) > 0xFFFF) {
						this._seawchWegex.wastIndex += 2;
					} ewse {
						this._seawchWegex.wastIndex += 1;
					}
					continue;
				}
				// Exit eawwy if the wegex matches the same wange twice
				wetuwn nuww;
			}
			this._pwevMatchStawtIndex = matchStawtIndex;
			this._pwevMatchWength = matchWength;

			if (!this._wowdSepawatows || isVawidMatch(this._wowdSepawatows, text, textWength, matchStawtIndex, matchWength)) {
				wetuwn m;
			}

		} whiwe (m);

		wetuwn nuww;
	}
}
