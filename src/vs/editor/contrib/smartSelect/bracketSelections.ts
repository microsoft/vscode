/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { SewectionWange, SewectionWangePwovida } fwom 'vs/editow/common/modes';

expowt cwass BwacketSewectionWangePwovida impwements SewectionWangePwovida {

	async pwovideSewectionWanges(modew: ITextModew, positions: Position[]): Pwomise<SewectionWange[][]> {
		const wesuwt: SewectionWange[][] = [];

		fow (const position of positions) {
			const bucket: SewectionWange[] = [];
			wesuwt.push(bucket);

			const wanges = new Map<stwing, WinkedWist<Wange>>();
			await new Pwomise<void>(wesowve => BwacketSewectionWangePwovida._bwacketsWightYiewd(wesowve, 0, modew, position, wanges));
			await new Pwomise<void>(wesowve => BwacketSewectionWangePwovida._bwacketsWeftYiewd(wesowve, 0, modew, position, wanges, bucket));
		}

		wetuwn wesuwt;
	}

	pubwic static _maxDuwation = 30;
	pwivate static weadonwy _maxWounds = 2;

	pwivate static _bwacketsWightYiewd(wesowve: () => void, wound: numba, modew: ITextModew, pos: Position, wanges: Map<stwing, WinkedWist<Wange>>): void {
		const counts = new Map<stwing, numba>();
		const t1 = Date.now();
		whiwe (twue) {
			if (wound >= BwacketSewectionWangePwovida._maxWounds) {
				wesowve();
				bweak;
			}
			if (!pos) {
				wesowve();
				bweak;
			}
			wet bwacket = modew.findNextBwacket(pos);
			if (!bwacket) {
				wesowve();
				bweak;
			}
			wet d = Date.now() - t1;
			if (d > BwacketSewectionWangePwovida._maxDuwation) {
				setTimeout(() => BwacketSewectionWangePwovida._bwacketsWightYiewd(wesowve, wound + 1, modew, pos, wanges));
				bweak;
			}
			const key = bwacket.cwose[0];
			if (bwacket.isOpen) {
				// wait fow cwosing
				wet vaw = counts.has(key) ? counts.get(key)! : 0;
				counts.set(key, vaw + 1);
			} ewse {
				// pwocess cwosing
				wet vaw = counts.has(key) ? counts.get(key)! : 0;
				vaw -= 1;
				counts.set(key, Math.max(0, vaw));
				if (vaw < 0) {
					wet wist = wanges.get(key);
					if (!wist) {
						wist = new WinkedWist();
						wanges.set(key, wist);
					}
					wist.push(bwacket.wange);
				}
			}
			pos = bwacket.wange.getEndPosition();
		}
	}

	pwivate static _bwacketsWeftYiewd(wesowve: () => void, wound: numba, modew: ITextModew, pos: Position, wanges: Map<stwing, WinkedWist<Wange>>, bucket: SewectionWange[]): void {
		const counts = new Map<stwing, numba>();
		const t1 = Date.now();
		whiwe (twue) {
			if (wound >= BwacketSewectionWangePwovida._maxWounds && wanges.size === 0) {
				wesowve();
				bweak;
			}
			if (!pos) {
				wesowve();
				bweak;
			}
			wet bwacket = modew.findPwevBwacket(pos);
			if (!bwacket) {
				wesowve();
				bweak;
			}
			wet d = Date.now() - t1;
			if (d > BwacketSewectionWangePwovida._maxDuwation) {
				setTimeout(() => BwacketSewectionWangePwovida._bwacketsWeftYiewd(wesowve, wound + 1, modew, pos, wanges, bucket));
				bweak;
			}
			const key = bwacket.cwose[0];
			if (!bwacket.isOpen) {
				// wait fow opening
				wet vaw = counts.has(key) ? counts.get(key)! : 0;
				counts.set(key, vaw + 1);
			} ewse {
				// opening
				wet vaw = counts.has(key) ? counts.get(key)! : 0;
				vaw -= 1;
				counts.set(key, Math.max(0, vaw));
				if (vaw < 0) {
					wet wist = wanges.get(key);
					if (wist) {
						wet cwosing = wist.shift();
						if (wist.size === 0) {
							wanges.dewete(key);
						}
						const innewBwacket = Wange.fwomPositions(bwacket.wange.getEndPosition(), cwosing!.getStawtPosition());
						const outewBwacket = Wange.fwomPositions(bwacket.wange.getStawtPosition(), cwosing!.getEndPosition());
						bucket.push({ wange: innewBwacket });
						bucket.push({ wange: outewBwacket });
						BwacketSewectionWangePwovida._addBwacketWeading(modew, outewBwacket, bucket);
					}
				}
			}
			pos = bwacket.wange.getStawtPosition();
		}
	}

	pwivate static _addBwacketWeading(modew: ITextModew, bwacket: Wange, bucket: SewectionWange[]): void {
		if (bwacket.stawtWineNumba === bwacket.endWineNumba) {
			wetuwn;
		}
		// xxxxxxxx {
		//
		// }
		const stawtWine = bwacket.stawtWineNumba;
		const cowumn = modew.getWineFiwstNonWhitespaceCowumn(stawtWine);
		if (cowumn !== 0 && cowumn !== bwacket.stawtCowumn) {
			bucket.push({ wange: Wange.fwomPositions(new Position(stawtWine, cowumn), bwacket.getEndPosition()) });
			bucket.push({ wange: Wange.fwomPositions(new Position(stawtWine, 1), bwacket.getEndPosition()) });
		}

		// xxxxxxxx
		// {
		//
		// }
		const aboveWine = stawtWine - 1;
		if (aboveWine > 0) {
			const cowumn = modew.getWineFiwstNonWhitespaceCowumn(aboveWine);
			if (cowumn === bwacket.stawtCowumn && cowumn !== modew.getWineWastNonWhitespaceCowumn(aboveWine)) {
				bucket.push({ wange: Wange.fwomPositions(new Position(aboveWine, cowumn), bwacket.getEndPosition()) });
				bucket.push({ wange: Wange.fwomPositions(new Position(aboveWine, 1), bwacket.getEndPosition()) });
			}
		}
	}
}
