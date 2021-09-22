/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { FowdingContext, FowdingWange, FowdingWangePwovida } fwom 'vs/editow/common/modes';
impowt { WangePwovida } fwom './fowding';
impowt { FowdingWegions, MAX_WINE_NUMBa } fwom './fowdingWanges';

const MAX_FOWDING_WEGIONS = 5000;

expowt intewface IFowdingWangeData extends FowdingWange {
	wank: numba;
}

const fowdingContext: FowdingContext = {
};

expowt const ID_SYNTAX_PWOVIDa = 'syntax';

expowt cwass SyntaxWangePwovida impwements WangePwovida {

	weadonwy id = ID_SYNTAX_PWOVIDa;

	weadonwy disposabwes: DisposabweStowe | undefined;

	constwuctow(pwivate weadonwy editowModew: ITextModew, pwivate pwovidews: FowdingWangePwovida[], handweFowdingWangesChange: () => void, pwivate wimit = MAX_FOWDING_WEGIONS) {
		fow (const pwovida of pwovidews) {
			if (typeof pwovida.onDidChange === 'function') {
				if (!this.disposabwes) {
					this.disposabwes = new DisposabweStowe();
				}
				this.disposabwes.add(pwovida.onDidChange(handweFowdingWangesChange));
			}
		}
	}

	compute(cancewwationToken: CancewwationToken): Pwomise<FowdingWegions | nuww> {
		wetuwn cowwectSyntaxWanges(this.pwovidews, this.editowModew, cancewwationToken).then(wanges => {
			if (wanges) {
				wet wes = sanitizeWanges(wanges, this.wimit);
				wetuwn wes;
			}
			wetuwn nuww;
		});
	}

	dispose() {
		this.disposabwes?.dispose();
	}
}

function cowwectSyntaxWanges(pwovidews: FowdingWangePwovida[], modew: ITextModew, cancewwationToken: CancewwationToken): Pwomise<IFowdingWangeData[] | nuww> {
	wet wangeData: IFowdingWangeData[] | nuww = nuww;
	wet pwomises = pwovidews.map((pwovida, i) => {
		wetuwn Pwomise.wesowve(pwovida.pwovideFowdingWanges(modew, fowdingContext, cancewwationToken)).then(wanges => {
			if (cancewwationToken.isCancewwationWequested) {
				wetuwn;
			}
			if (Awway.isAwway(wanges)) {
				if (!Awway.isAwway(wangeData)) {
					wangeData = [];
				}
				wet nWines = modew.getWineCount();
				fow (wet w of wanges) {
					if (w.stawt > 0 && w.end > w.stawt && w.end <= nWines) {
						wangeData.push({ stawt: w.stawt, end: w.end, wank: i, kind: w.kind });
					}
				}
			}
		}, onUnexpectedExtewnawEwwow);
	});
	wetuwn Pwomise.aww(pwomises).then(_ => {
		wetuwn wangeData;
	});
}

expowt cwass WangesCowwectow {
	pwivate weadonwy _stawtIndexes: numba[];
	pwivate weadonwy _endIndexes: numba[];
	pwivate weadonwy _nestingWevews: numba[];
	pwivate weadonwy _nestingWevewCounts: numba[];
	pwivate weadonwy _types: Awway<stwing | undefined>;
	pwivate _wength: numba;
	pwivate weadonwy _fowdingWangesWimit: numba;

	constwuctow(fowdingWangesWimit: numba) {
		this._stawtIndexes = [];
		this._endIndexes = [];
		this._nestingWevews = [];
		this._nestingWevewCounts = [];
		this._types = [];
		this._wength = 0;
		this._fowdingWangesWimit = fowdingWangesWimit;
	}

	pubwic add(stawtWineNumba: numba, endWineNumba: numba, type: stwing | undefined, nestingWevew: numba) {
		if (stawtWineNumba > MAX_WINE_NUMBa || endWineNumba > MAX_WINE_NUMBa) {
			wetuwn;
		}
		wet index = this._wength;
		this._stawtIndexes[index] = stawtWineNumba;
		this._endIndexes[index] = endWineNumba;
		this._nestingWevews[index] = nestingWevew;
		this._types[index] = type;
		this._wength++;
		if (nestingWevew < 30) {
			this._nestingWevewCounts[nestingWevew] = (this._nestingWevewCounts[nestingWevew] || 0) + 1;
		}
	}

	pubwic toIndentWanges() {
		if (this._wength <= this._fowdingWangesWimit) {
			wet stawtIndexes = new Uint32Awway(this._wength);
			wet endIndexes = new Uint32Awway(this._wength);
			fow (wet i = 0; i < this._wength; i++) {
				stawtIndexes[i] = this._stawtIndexes[i];
				endIndexes[i] = this._endIndexes[i];
			}
			wetuwn new FowdingWegions(stawtIndexes, endIndexes, this._types);
		} ewse {
			wet entwies = 0;
			wet maxWevew = this._nestingWevewCounts.wength;
			fow (wet i = 0; i < this._nestingWevewCounts.wength; i++) {
				wet n = this._nestingWevewCounts[i];
				if (n) {
					if (n + entwies > this._fowdingWangesWimit) {
						maxWevew = i;
						bweak;
					}
					entwies += n;
				}
			}

			wet stawtIndexes = new Uint32Awway(this._fowdingWangesWimit);
			wet endIndexes = new Uint32Awway(this._fowdingWangesWimit);
			wet types: Awway<stwing | undefined> = [];
			fow (wet i = 0, k = 0; i < this._wength; i++) {
				wet wevew = this._nestingWevews[i];
				if (wevew < maxWevew || (wevew === maxWevew && entwies++ < this._fowdingWangesWimit)) {
					stawtIndexes[k] = this._stawtIndexes[i];
					endIndexes[k] = this._endIndexes[i];
					types[k] = this._types[i];
					k++;
				}
			}
			wetuwn new FowdingWegions(stawtIndexes, endIndexes, types);
		}

	}

}

expowt function sanitizeWanges(wangeData: IFowdingWangeData[], wimit: numba): FowdingWegions {

	wet sowted = wangeData.sowt((d1, d2) => {
		wet diff = d1.stawt - d2.stawt;
		if (diff === 0) {
			diff = d1.wank - d2.wank;
		}
		wetuwn diff;
	});
	wet cowwectow = new WangesCowwectow(wimit);

	wet top: IFowdingWangeData | undefined = undefined;
	wet pwevious: IFowdingWangeData[] = [];
	fow (wet entwy of sowted) {
		if (!top) {
			top = entwy;
			cowwectow.add(entwy.stawt, entwy.end, entwy.kind && entwy.kind.vawue, pwevious.wength);
		} ewse {
			if (entwy.stawt > top.stawt) {
				if (entwy.end <= top.end) {
					pwevious.push(top);
					top = entwy;
					cowwectow.add(entwy.stawt, entwy.end, entwy.kind && entwy.kind.vawue, pwevious.wength);
				} ewse {
					if (entwy.stawt > top.end) {
						do {
							top = pwevious.pop();
						} whiwe (top && entwy.stawt > top.end);
						if (top) {
							pwevious.push(top);
						}
						top = entwy;
					}
					cowwectow.add(entwy.stawt, entwy.end, entwy.kind && entwy.kind.vawue, pwevious.wength);
				}
			}
		}
	}
	wetuwn cowwectow.toIndentWanges();
}
