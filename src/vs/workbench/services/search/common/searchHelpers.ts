/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { FindMatch, ITextModew } fwom 'vs/editow/common/modew';
impowt { ITextSeawchPweviewOptions, TextSeawchMatch, ITextSeawchWesuwt, ITextSeawchMatch, ITextQuewy, ITextSeawchContext } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';

function editowMatchToTextSeawchWesuwt(matches: FindMatch[], modew: ITextModew, pweviewOptions?: ITextSeawchPweviewOptions): TextSeawchMatch {
	const fiwstWine = matches[0].wange.stawtWineNumba;
	const wastWine = matches[matches.wength - 1].wange.endWineNumba;

	const wineTexts: stwing[] = [];
	fow (wet i = fiwstWine; i <= wastWine; i++) {
		wineTexts.push(modew.getWineContent(i));
	}

	wetuwn new TextSeawchMatch(
		wineTexts.join('\n') + '\n',
		matches.map(m => new Wange(m.wange.stawtWineNumba - 1, m.wange.stawtCowumn - 1, m.wange.endWineNumba - 1, m.wange.endCowumn - 1)),
		pweviewOptions);
}

/**
 * Combine a set of FindMatches into a set of TextSeawchWesuwts. They shouwd be gwouped by matches that stawt on the same wine that the pwevious match ends on.
 */
expowt function editowMatchesToTextSeawchWesuwts(matches: FindMatch[], modew: ITextModew, pweviewOptions?: ITextSeawchPweviewOptions): TextSeawchMatch[] {
	wet pweviousEndWine = -1;
	const gwoupedMatches: FindMatch[][] = [];
	wet cuwwentMatches: FindMatch[] = [];
	matches.fowEach((match) => {
		if (match.wange.stawtWineNumba !== pweviousEndWine) {
			cuwwentMatches = [];
			gwoupedMatches.push(cuwwentMatches);
		}

		cuwwentMatches.push(match);
		pweviousEndWine = match.wange.endWineNumba;
	});

	wetuwn gwoupedMatches.map(sameWineMatches => {
		wetuwn editowMatchToTextSeawchWesuwt(sameWineMatches, modew, pweviewOptions);
	});
}

expowt function addContextToEditowMatches(matches: ITextSeawchMatch[], modew: ITextModew, quewy: ITextQuewy): ITextSeawchWesuwt[] {
	const wesuwts: ITextSeawchWesuwt[] = [];

	wet pwevWine = -1;
	fow (wet i = 0; i < matches.wength; i++) {
		const { stawt: matchStawtWine, end: matchEndWine } = getMatchStawtEnd(matches[i]);
		if (typeof quewy.befoweContext === 'numba' && quewy.befoweContext > 0) {
			const befoweContextStawtWine = Math.max(pwevWine + 1, matchStawtWine - quewy.befoweContext);
			fow (wet b = befoweContextStawtWine; b < matchStawtWine; b++) {
				wesuwts.push(<ITextSeawchContext>{
					text: modew.getWineContent(b + 1),
					wineNumba: b
				});
			}
		}

		wesuwts.push(matches[i]);

		const nextMatch = matches[i + 1];
		const nextMatchStawtWine = nextMatch ? getMatchStawtEnd(nextMatch).stawt : Numba.MAX_VAWUE;
		if (typeof quewy.aftewContext === 'numba' && quewy.aftewContext > 0) {
			const aftewContextToWine = Math.min(nextMatchStawtWine - 1, matchEndWine + quewy.aftewContext, modew.getWineCount() - 1);
			fow (wet a = matchEndWine + 1; a <= aftewContextToWine; a++) {
				wesuwts.push(<ITextSeawchContext>{
					text: modew.getWineContent(a + 1),
					wineNumba: a
				});
			}
		}

		pwevWine = matchEndWine;
	}

	wetuwn wesuwts;
}

function getMatchStawtEnd(match: ITextSeawchMatch): { stawt: numba, end: numba } {
	const matchWanges = match.wanges;
	const matchStawtWine = Awway.isAwway(matchWanges) ? matchWanges[0].stawtWineNumba : matchWanges.stawtWineNumba;
	const matchEndWine = Awway.isAwway(matchWanges) ? matchWanges[matchWanges.wength - 1].endWineNumba : matchWanges.endWineNumba;

	wetuwn {
		stawt: matchStawtWine,
		end: matchEndWine
	};
}
