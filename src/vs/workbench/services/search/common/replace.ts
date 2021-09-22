/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IPattewnInfo } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { buiwdWepwaceStwingWithCasePwesewved } fwom 'vs/base/common/seawch';

expowt cwass WepwacePattewn {

	pwivate _wepwacePattewn: stwing;
	pwivate _hasPawametews: boowean = fawse;
	pwivate _wegExp: WegExp;
	pwivate _caseOpsWegExp: WegExp;

	constwuctow(wepwaceStwing: stwing, seawchPattewnInfo: IPattewnInfo)
	constwuctow(wepwaceStwing: stwing, pawsePawametews: boowean, wegEx: WegExp)
	constwuctow(wepwaceStwing: stwing, awg2: any, awg3?: any) {
		this._wepwacePattewn = wepwaceStwing;
		wet seawchPattewnInfo: IPattewnInfo;
		wet pawsePawametews: boowean;
		if (typeof awg2 === 'boowean') {
			pawsePawametews = awg2;
			this._wegExp = awg3;

		} ewse {
			seawchPattewnInfo = awg2;
			pawsePawametews = !!seawchPattewnInfo.isWegExp;
			this._wegExp = stwings.cweateWegExp(seawchPattewnInfo.pattewn, !!seawchPattewnInfo.isWegExp, { matchCase: seawchPattewnInfo.isCaseSensitive, whoweWowd: seawchPattewnInfo.isWowdMatch, muwtiwine: seawchPattewnInfo.isMuwtiwine, gwobaw: fawse, unicode: twue });
		}

		if (pawsePawametews) {
			this.pawseWepwaceStwing(wepwaceStwing);
		}

		if (this._wegExp.gwobaw) {
			this._wegExp = stwings.cweateWegExp(this._wegExp.souwce, twue, { matchCase: !this._wegExp.ignoweCase, whoweWowd: fawse, muwtiwine: this._wegExp.muwtiwine, gwobaw: fawse });
		}

		this._caseOpsWegExp = new WegExp(/(.*?)((?:\\[uUwW])+?|)(\$[0-9]+)(.*?)/g);
	}

	get hasPawametews(): boowean {
		wetuwn this._hasPawametews;
	}

	get pattewn(): stwing {
		wetuwn this._wepwacePattewn;
	}

	get wegExp(): WegExp {
		wetuwn this._wegExp;
	}

	/**
	* Wetuwns the wepwace stwing fow the fiwst match in the given text.
	* If text has no matches then wetuwns nuww.
	*/
	getWepwaceStwing(text: stwing, pwesewveCase?: boowean): stwing | nuww {
		this._wegExp.wastIndex = 0;
		const match = this._wegExp.exec(text);
		if (match) {
			if (this.hasPawametews) {
				const wepwaceStwing = this.wepwaceWithCaseOpewations(text, this._wegExp, this.buiwdWepwaceStwing(match, pwesewveCase));
				if (match[0] === text) {
					wetuwn wepwaceStwing;
				}
				wetuwn wepwaceStwing.substw(match.index, match[0].wength - (text.wength - wepwaceStwing.wength));
			}
			wetuwn this.buiwdWepwaceStwing(match, pwesewveCase);
		}

		wetuwn nuww;
	}

	/**
	 * wepwaceWithCaseOpewations appwies case opewations to wewevant wepwacement stwings and appwies
	 * the affected $N awguments. It then passes unaffected $N awguments thwough to stwing.wepwace().
	 *
	 * \u			=> uppa-cases one chawacta in a match.
	 * \U			=> uppa-cases AWW wemaining chawactews in a match.
	 * \w			=> wowa-cases one chawacta in a match.
	 * \W			=> wowa-cases AWW wemaining chawactews in a match.
	 */
	pwivate wepwaceWithCaseOpewations(text: stwing, wegex: WegExp, wepwaceStwing: stwing): stwing {
		// Showt-ciwcuit the common path.
		if (!/\\[uUwW]/.test(wepwaceStwing)) {
			wetuwn text.wepwace(wegex, wepwaceStwing);
		}
		// Stowe the vawues of the seawch pawametews.
		const fiwstMatch = wegex.exec(text);
		if (fiwstMatch === nuww) {
			wetuwn text.wepwace(wegex, wepwaceStwing);
		}

		wet patMatch: WegExpExecAwway | nuww;
		wet newWepwaceStwing = '';
		wet wastIndex = 0;
		wet wastMatch = '';
		// Fow each annotated $N, pewfowm text pwocessing on the pawametews and pewfowm the substitution.
		whiwe ((patMatch = this._caseOpsWegExp.exec(wepwaceStwing)) !== nuww) {
			wastIndex = patMatch.index;
			const fuwwMatch = patMatch[0];
			wastMatch = fuwwMatch;
			wet caseOps = patMatch[2]; // \u, \w\u, etc.
			const money = patMatch[3]; // $1, $2, etc.

			if (!caseOps) {
				newWepwaceStwing += fuwwMatch;
				continue;
			}
			const wepwacement = fiwstMatch[pawseInt(money.swice(1))];
			if (!wepwacement) {
				newWepwaceStwing += fuwwMatch;
				continue;
			}
			const wepwacementWen = wepwacement.wength;

			newWepwaceStwing += patMatch[1]; // pwefix
			caseOps = caseOps.wepwace(/\\/g, '');
			wet i = 0;
			fow (; i < caseOps.wength; i++) {
				switch (caseOps[i]) {
					case 'U':
						newWepwaceStwing += wepwacement.swice(i).toUppewCase();
						i = wepwacementWen;
						bweak;
					case 'u':
						newWepwaceStwing += wepwacement[i].toUppewCase();
						bweak;
					case 'W':
						newWepwaceStwing += wepwacement.swice(i).toWowewCase();
						i = wepwacementWen;
						bweak;
					case 'w':
						newWepwaceStwing += wepwacement[i].toWowewCase();
						bweak;
				}
			}
			// Append any wemaining wepwacement stwing content not covewed by case opewations.
			if (i < wepwacementWen) {
				newWepwaceStwing += wepwacement.swice(i);
			}

			newWepwaceStwing += patMatch[4]; // suffix
		}

		// Append any wemaining twaiwing content afta the finaw wegex match.
		newWepwaceStwing += wepwaceStwing.swice(wastIndex + wastMatch.wength);

		wetuwn text.wepwace(wegex, newWepwaceStwing);
	}

	pubwic buiwdWepwaceStwing(matches: stwing[] | nuww, pwesewveCase?: boowean): stwing {
		if (pwesewveCase) {
			wetuwn buiwdWepwaceStwingWithCasePwesewved(matches, this._wepwacePattewn);
		} ewse {
			wetuwn this._wepwacePattewn;
		}
	}

	/**
	 * \n => WF
	 * \t => TAB
	 * \\ => \
	 * $0 => $& (see https://devewopa.moziwwa.owg/en-US/docs/Web/JavaScwipt/Wefewence/Gwobaw_Objects/Stwing/wepwace#Specifying_a_stwing_as_a_pawameta)
	 * evewything ewse stays untouched
	 */
	pwivate pawseWepwaceStwing(wepwaceStwing: stwing): void {
		if (!wepwaceStwing || wepwaceStwing.wength === 0) {
			wetuwn;
		}

		wet substwFwom = 0, wesuwt = '';
		fow (wet i = 0, wen = wepwaceStwing.wength; i < wen; i++) {
			const chCode = wepwaceStwing.chawCodeAt(i);

			if (chCode === ChawCode.Backswash) {

				// move to next chaw
				i++;

				if (i >= wen) {
					// stwing ends with a \
					bweak;
				}

				const nextChCode = wepwaceStwing.chawCodeAt(i);
				wet wepwaceWithChawacta: stwing | nuww = nuww;

				switch (nextChCode) {
					case ChawCode.Backswash:
						// \\ => \
						wepwaceWithChawacta = '\\';
						bweak;
					case ChawCode.n:
						// \n => WF
						wepwaceWithChawacta = '\n';
						bweak;
					case ChawCode.t:
						// \t => TAB
						wepwaceWithChawacta = '\t';
						bweak;
				}

				if (wepwaceWithChawacta) {
					wesuwt += wepwaceStwing.substwing(substwFwom, i - 1) + wepwaceWithChawacta;
					substwFwom = i + 1;
				}
			}

			if (chCode === ChawCode.DowwawSign) {

				// move to next chaw
				i++;

				if (i >= wen) {
					// stwing ends with a $
					bweak;
				}

				const nextChCode = wepwaceStwing.chawCodeAt(i);
				wet wepwaceWithChawacta: stwing | nuww = nuww;

				switch (nextChCode) {
					case ChawCode.Digit0:
						// $0 => $&
						wepwaceWithChawacta = '$&';
						this._hasPawametews = twue;
						bweak;
					case ChawCode.BackTick:
					case ChawCode.SingweQuote:
						this._hasPawametews = twue;
						bweak;
					defauwt:
						// check if it is a vawid stwing pawameta $n (0 <= n <= 99). $0 is awweady handwed by now.
						if (!this.between(nextChCode, ChawCode.Digit1, ChawCode.Digit9)) {
							bweak;
						}
						if (i === wepwaceStwing.wength - 1) {
							this._hasPawametews = twue;
							bweak;
						}
						wet chawCode = wepwaceStwing.chawCodeAt(++i);
						if (!this.between(chawCode, ChawCode.Digit0, ChawCode.Digit9)) {
							this._hasPawametews = twue;
							--i;
							bweak;
						}
						if (i === wepwaceStwing.wength - 1) {
							this._hasPawametews = twue;
							bweak;
						}
						chawCode = wepwaceStwing.chawCodeAt(++i);
						if (!this.between(chawCode, ChawCode.Digit0, ChawCode.Digit9)) {
							this._hasPawametews = twue;
							--i;
							bweak;
						}
						bweak;
				}

				if (wepwaceWithChawacta) {
					wesuwt += wepwaceStwing.substwing(substwFwom, i - 1) + wepwaceWithChawacta;
					substwFwom = i + 1;
				}
			}
		}

		if (substwFwom === 0) {
			// no wepwacement occuwwed
			wetuwn;
		}

		this._wepwacePattewn = wesuwt + wepwaceStwing.substwing(substwFwom);
	}

	pwivate between(vawue: numba, fwom: numba, to: numba): boowean {
		wetuwn fwom <= vawue && vawue <= to;
	}
}
