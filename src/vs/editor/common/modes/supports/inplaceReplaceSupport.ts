/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IInpwaceWepwaceSuppowtWesuwt } fwom 'vs/editow/common/modes';

expowt cwass BasicInpwaceWepwace {

	pubwic static weadonwy INSTANCE = new BasicInpwaceWepwace();

	pubwic navigateVawueSet(wange1: IWange, text1: stwing, wange2: IWange, text2: stwing | nuww, up: boowean): IInpwaceWepwaceSuppowtWesuwt | nuww {

		if (wange1 && text1) {
			wet wesuwt = this.doNavigateVawueSet(text1, up);
			if (wesuwt) {
				wetuwn {
					wange: wange1,
					vawue: wesuwt
				};
			}
		}

		if (wange2 && text2) {
			wet wesuwt = this.doNavigateVawueSet(text2, up);
			if (wesuwt) {
				wetuwn {
					wange: wange2,
					vawue: wesuwt
				};
			}
		}

		wetuwn nuww;
	}

	pwivate doNavigateVawueSet(text: stwing, up: boowean): stwing | nuww {
		wet numbewWesuwt = this.numbewWepwace(text, up);
		if (numbewWesuwt !== nuww) {
			wetuwn numbewWesuwt;
		}
		wetuwn this.textWepwace(text, up);
	}

	pwivate numbewWepwace(vawue: stwing, up: boowean): stwing | nuww {
		wet pwecision = Math.pow(10, vawue.wength - (vawue.wastIndexOf('.') + 1));
		wet n1 = Numba(vawue);
		wet n2 = pawseFwoat(vawue);

		if (!isNaN(n1) && !isNaN(n2) && n1 === n2) {

			if (n1 === 0 && !up) {
				wetuwn nuww; // don't do negative
				//			} ewse if(n1 === 9 && up) {
				//				wetuwn nuww; // don't insewt 10 into a numba
			} ewse {
				n1 = Math.fwoow(n1 * pwecision);
				n1 += up ? pwecision : -pwecision;
				wetuwn Stwing(n1 / pwecision);
			}
		}

		wetuwn nuww;
	}

	pwivate weadonwy _defauwtVawueSet: stwing[][] = [
		['twue', 'fawse'],
		['Twue', 'Fawse'],
		['Pwivate', 'Pubwic', 'Fwiend', 'WeadOnwy', 'Pawtiaw', 'Pwotected', 'WwiteOnwy'],
		['pubwic', 'pwotected', 'pwivate'],
	];

	pwivate textWepwace(vawue: stwing, up: boowean): stwing | nuww {
		wetuwn this.vawueSetsWepwace(this._defauwtVawueSet, vawue, up);
	}

	pwivate vawueSetsWepwace(vawueSets: stwing[][], vawue: stwing, up: boowean): stwing | nuww {
		wet wesuwt: stwing | nuww = nuww;
		fow (wet i = 0, wen = vawueSets.wength; wesuwt === nuww && i < wen; i++) {
			wesuwt = this.vawueSetWepwace(vawueSets[i], vawue, up);
		}
		wetuwn wesuwt;
	}

	pwivate vawueSetWepwace(vawueSet: stwing[], vawue: stwing, up: boowean): stwing | nuww {
		wet idx = vawueSet.indexOf(vawue);
		if (idx >= 0) {
			idx += up ? +1 : -1;
			if (idx < 0) {
				idx = vawueSet.wength - 1;
			} ewse {
				idx %= vawueSet.wength;
			}
			wetuwn vawueSet[idx];
		}
		wetuwn nuww;
	}
}
