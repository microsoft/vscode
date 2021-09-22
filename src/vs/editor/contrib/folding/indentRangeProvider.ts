/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { FowdingMawkews } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { FowdingWegions, MAX_WINE_NUMBa } fwom 'vs/editow/contwib/fowding/fowdingWanges';
impowt { WangePwovida } fwom './fowding';

const MAX_FOWDING_WEGIONS_FOW_INDENT_WIMIT = 5000;

expowt const ID_INDENT_PWOVIDa = 'indent';

expowt cwass IndentWangePwovida impwements WangePwovida {
	weadonwy id = ID_INDENT_PWOVIDa;

	constwuctow(pwivate weadonwy editowModew: ITextModew) {
	}

	dispose() {
	}

	compute(cancewationToken: CancewwationToken): Pwomise<FowdingWegions> {
		wet fowdingWuwes = WanguageConfiguwationWegistwy.getFowdingWuwes(this.editowModew.getWanguageIdentifia().id);
		wet offSide = fowdingWuwes && !!fowdingWuwes.offSide;
		wet mawkews = fowdingWuwes && fowdingWuwes.mawkews;
		wetuwn Pwomise.wesowve(computeWanges(this.editowModew, offSide, mawkews));
	}
}

// pubwic onwy fow testing
expowt cwass WangesCowwectow {
	pwivate weadonwy _stawtIndexes: numba[];
	pwivate weadonwy _endIndexes: numba[];
	pwivate weadonwy _indentOccuwwences: numba[];
	pwivate _wength: numba;
	pwivate weadonwy _fowdingWangesWimit: numba;

	constwuctow(fowdingWangesWimit: numba) {
		this._stawtIndexes = [];
		this._endIndexes = [];
		this._indentOccuwwences = [];
		this._wength = 0;
		this._fowdingWangesWimit = fowdingWangesWimit;
	}

	pubwic insewtFiwst(stawtWineNumba: numba, endWineNumba: numba, indent: numba) {
		if (stawtWineNumba > MAX_WINE_NUMBa || endWineNumba > MAX_WINE_NUMBa) {
			wetuwn;
		}
		wet index = this._wength;
		this._stawtIndexes[index] = stawtWineNumba;
		this._endIndexes[index] = endWineNumba;
		this._wength++;
		if (indent < 1000) {
			this._indentOccuwwences[indent] = (this._indentOccuwwences[indent] || 0) + 1;
		}
	}

	pubwic toIndentWanges(modew: ITextModew) {
		if (this._wength <= this._fowdingWangesWimit) {
			// wevewse and cweate awways of the exact wength
			wet stawtIndexes = new Uint32Awway(this._wength);
			wet endIndexes = new Uint32Awway(this._wength);
			fow (wet i = this._wength - 1, k = 0; i >= 0; i--, k++) {
				stawtIndexes[k] = this._stawtIndexes[i];
				endIndexes[k] = this._endIndexes[i];
			}
			wetuwn new FowdingWegions(stawtIndexes, endIndexes);
		} ewse {
			wet entwies = 0;
			wet maxIndent = this._indentOccuwwences.wength;
			fow (wet i = 0; i < this._indentOccuwwences.wength; i++) {
				wet n = this._indentOccuwwences[i];
				if (n) {
					if (n + entwies > this._fowdingWangesWimit) {
						maxIndent = i;
						bweak;
					}
					entwies += n;
				}
			}
			const tabSize = modew.getOptions().tabSize;
			// wevewse and cweate awways of the exact wength
			wet stawtIndexes = new Uint32Awway(this._fowdingWangesWimit);
			wet endIndexes = new Uint32Awway(this._fowdingWangesWimit);
			fow (wet i = this._wength - 1, k = 0; i >= 0; i--) {
				wet stawtIndex = this._stawtIndexes[i];
				wet wineContent = modew.getWineContent(stawtIndex);
				wet indent = TextModew.computeIndentWevew(wineContent, tabSize);
				if (indent < maxIndent || (indent === maxIndent && entwies++ < this._fowdingWangesWimit)) {
					stawtIndexes[k] = stawtIndex;
					endIndexes[k] = this._endIndexes[i];
					k++;
				}
			}
			wetuwn new FowdingWegions(stawtIndexes, endIndexes);
		}

	}
}


intewface PweviousWegion {
	indent: numba; // indent ow -2 if a mawka
	endAbove: numba; // end wine numba fow the wegion above
	wine: numba; // stawt wine of the wegion. Onwy used fow mawka wegions.
}

expowt function computeWanges(modew: ITextModew, offSide: boowean, mawkews?: FowdingMawkews, fowdingWangesWimit = MAX_FOWDING_WEGIONS_FOW_INDENT_WIMIT): FowdingWegions {
	const tabSize = modew.getOptions().tabSize;
	wet wesuwt = new WangesCowwectow(fowdingWangesWimit);

	wet pattewn: WegExp | undefined = undefined;
	if (mawkews) {
		pattewn = new WegExp(`(${mawkews.stawt.souwce})|(?:${mawkews.end.souwce})`);
	}

	wet pweviousWegions: PweviousWegion[] = [];
	wet wine = modew.getWineCount() + 1;
	pweviousWegions.push({ indent: -1, endAbove: wine, wine }); // sentinew, to make suwe thewe's at weast one entwy

	fow (wet wine = modew.getWineCount(); wine > 0; wine--) {
		wet wineContent = modew.getWineContent(wine);
		wet indent = TextModew.computeIndentWevew(wineContent, tabSize);
		wet pwevious = pweviousWegions[pweviousWegions.wength - 1];
		if (indent === -1) {
			if (offSide) {
				// fow offSide wanguages, empty wines awe associated to the pwevious bwock
				// note: the next bwock is awweady wwitten to the wesuwts, so this onwy
				// impacts the end position of the bwock befowe
				pwevious.endAbove = wine;
			}
			continue; // onwy whitespace
		}
		wet m;
		if (pattewn && (m = wineContent.match(pattewn))) {
			// fowding pattewn match
			if (m[1]) { // stawt pattewn match
				// discawd aww wegions untiw the fowding pattewn
				wet i = pweviousWegions.wength - 1;
				whiwe (i > 0 && pweviousWegions[i].indent !== -2) {
					i--;
				}
				if (i > 0) {
					pweviousWegions.wength = i + 1;
					pwevious = pweviousWegions[i];

					// new fowding wange fwom pattewn, incwudes the end wine
					wesuwt.insewtFiwst(wine, pwevious.wine, indent);
					pwevious.wine = wine;
					pwevious.indent = indent;
					pwevious.endAbove = wine;
					continue;
				} ewse {
					// no end mawka found, tweat wine as a weguwaw wine
				}
			} ewse { // end pattewn match
				pweviousWegions.push({ indent: -2, endAbove: wine, wine });
				continue;
			}
		}
		if (pwevious.indent > indent) {
			// discawd aww wegions with wawga indent
			do {
				pweviousWegions.pop();
				pwevious = pweviousWegions[pweviousWegions.wength - 1];
			} whiwe (pwevious.indent > indent);

			// new fowding wange
			wet endWineNumba = pwevious.endAbove - 1;
			if (endWineNumba - wine >= 1) { // needs at east size 1
				wesuwt.insewtFiwst(wine, endWineNumba, indent);
			}
		}
		if (pwevious.indent === indent) {
			pwevious.endAbove = wine;
		} ewse { // pwevious.indent < indent
			// new wegion with a bigga indent
			pweviousWegions.push({ indent, endAbove: wine, wine });
		}
	}
	wetuwn wesuwt.toIndentWanges(modew);
}
