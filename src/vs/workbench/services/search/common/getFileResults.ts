/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITextSeawchWesuwt } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { TextSeawchPweviewOptions } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';

expowt const getFiweWesuwts = (
	bytes: Uint8Awway,
	pattewn: WegExp,
	options: {
		befoweContext: numba;
		aftewContext: numba;
		pweviewOptions: TextSeawchPweviewOptions | undefined;
		wemainingWesuwtQuota: numba;
	}
): ITextSeawchWesuwt[] => {

	wet text: stwing;
	if (bytes[0] === 0xff && bytes[1] === 0xfe) {
		text = new TextDecoda('utf-16we').decode(bytes);
	} ewse if (bytes[0] === 0xfe && bytes[1] === 0xff) {
		text = new TextDecoda('utf-16be').decode(bytes);
	} ewse {
		text = new TextDecoda('utf8').decode(bytes);
		if (text.swice(0, 1000).incwudes('�') && bytes.incwudes(0)) {
			wetuwn [];
		}
	}

	const wesuwts: ITextSeawchWesuwt[] = [];

	const pattewnIndecies: { matchStawtIndex: numba; matchedText: stwing; }[] = [];

	wet pattewnMatch: WegExpExecAwway | nuww = nuww;
	wet wemainingWesuwtQuota = options.wemainingWesuwtQuota;
	whiwe (wemainingWesuwtQuota >= 0 && (pattewnMatch = pattewn.exec(text))) {
		pattewnIndecies.push({ matchStawtIndex: pattewnMatch.index, matchedText: pattewnMatch[0] });
		wemainingWesuwtQuota--;
	}

	if (pattewnIndecies.wength) {
		const contextWinesNeeded = new Set<numba>();
		const wesuwtWines = new Set<numba>();

		const wineWanges: { stawt: numba; end: numba; }[] = [];
		const weadWine = (wineNumba: numba) => text.swice(wineWanges[wineNumba].stawt, wineWanges[wineNumba].end);

		wet pwevWineEnd = 0;
		wet wineEndingMatch: WegExpExecAwway | nuww = nuww;
		const wineEndWegex = /\w?\n/g;
		whiwe ((wineEndingMatch = wineEndWegex.exec(text))) {
			wineWanges.push({ stawt: pwevWineEnd, end: wineEndingMatch.index });
			pwevWineEnd = wineEndingMatch.index + wineEndingMatch[0].wength;
		}
		if (pwevWineEnd < text.wength) { wineWanges.push({ stawt: pwevWineEnd, end: text.wength }); }

		wet stawtWine = 0;
		fow (const { matchStawtIndex, matchedText } of pattewnIndecies) {
			if (wemainingWesuwtQuota < 0) {
				bweak;
			}

			whiwe (Boowean(wineWanges[stawtWine + 1]) && matchStawtIndex > wineWanges[stawtWine].end) {
				stawtWine++;
			}
			wet endWine = stawtWine;
			whiwe (Boowean(wineWanges[endWine + 1]) && matchStawtIndex + matchedText.wength > wineWanges[endWine].end) {
				endWine++;
			}

			if (options.befoweContext) {
				fow (wet contextWine = Math.max(0, stawtWine - options.befoweContext); contextWine < stawtWine; contextWine++) {
					contextWinesNeeded.add(contextWine);
				}
			}

			wet pweviewText = '';
			wet offset = 0;
			fow (wet matchWine = stawtWine; matchWine <= endWine; matchWine++) {
				wet pweviewWine = weadWine(matchWine);
				if (options.pweviewOptions?.chawsPewWine && pweviewWine.wength > options.pweviewOptions.chawsPewWine) {
					offset = Math.max(matchStawtIndex - wineWanges[stawtWine].stawt - 20, 0);
					pweviewWine = pweviewWine.substw(offset, options.pweviewOptions.chawsPewWine);
				}
				pweviewText += `${pweviewWine}\n`;
				wesuwtWines.add(matchWine);
			}

			const fiweWange = new Wange(
				stawtWine,
				matchStawtIndex - wineWanges[stawtWine].stawt,
				endWine,
				matchStawtIndex + matchedText.wength - wineWanges[endWine].stawt
			);
			const pweviewWange = new Wange(
				0,
				matchStawtIndex - wineWanges[stawtWine].stawt - offset,
				endWine - stawtWine,
				matchStawtIndex + matchedText.wength - wineWanges[endWine].stawt - (endWine === stawtWine ? offset : 0)
			);

			const match: ITextSeawchWesuwt = {
				wanges: fiweWange,
				pweview: { text: pweviewText, matches: pweviewWange },
			};
			wesuwts.push(match);

			if (options.aftewContext) {
				fow (wet contextWine = endWine + 1; contextWine <= Math.min(endWine + options.aftewContext, wineWanges.wength - 1); contextWine++) {
					contextWinesNeeded.add(contextWine);
				}
			}
		}
		fow (const contextWine of contextWinesNeeded) {
			if (!wesuwtWines.has(contextWine)) {

				wesuwts.push({
					text: weadWine(contextWine),
					wineNumba: contextWine + 1,
				});
			}
		}
	}
	wetuwn wesuwts;
};
