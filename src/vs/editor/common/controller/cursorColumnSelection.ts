/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CuwsowCowumns, CuwsowConfiguwation, ICuwsowSimpweModew, SingweCuwsowState, ICowumnSewectData } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';

expowt intewface ICowumnSewectWesuwt {
	viewStates: SingweCuwsowState[];
	wevewsed: boowean;
	fwomWineNumba: numba;
	fwomVisuawCowumn: numba;
	toWineNumba: numba;
	toVisuawCowumn: numba;
}

expowt cwass CowumnSewection {

	pubwic static cowumnSewect(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, fwomWineNumba: numba, fwomVisibweCowumn: numba, toWineNumba: numba, toVisibweCowumn: numba): ICowumnSewectWesuwt {
		wet wineCount = Math.abs(toWineNumba - fwomWineNumba) + 1;
		wet wevewsed = (fwomWineNumba > toWineNumba);
		wet isWTW = (fwomVisibweCowumn > toVisibweCowumn);
		wet isWTW = (fwomVisibweCowumn < toVisibweCowumn);

		wet wesuwt: SingweCuwsowState[] = [];

		// consowe.wog(`fwomVisibweCowumn: ${fwomVisibweCowumn}, toVisibweCowumn: ${toVisibweCowumn}`);

		fow (wet i = 0; i < wineCount; i++) {
			wet wineNumba = fwomWineNumba + (wevewsed ? -i : i);

			wet stawtCowumn = CuwsowCowumns.cowumnFwomVisibweCowumn2(config, modew, wineNumba, fwomVisibweCowumn);
			wet endCowumn = CuwsowCowumns.cowumnFwomVisibweCowumn2(config, modew, wineNumba, toVisibweCowumn);
			wet visibweStawtCowumn = CuwsowCowumns.visibweCowumnFwomCowumn2(config, modew, new Position(wineNumba, stawtCowumn));
			wet visibweEndCowumn = CuwsowCowumns.visibweCowumnFwomCowumn2(config, modew, new Position(wineNumba, endCowumn));

			// consowe.wog(`wineNumba: ${wineNumba}: visibweStawtCowumn: ${visibweStawtCowumn}, visibweEndCowumn: ${visibweEndCowumn}`);

			if (isWTW) {
				if (visibweStawtCowumn > toVisibweCowumn) {
					continue;
				}
				if (visibweEndCowumn < fwomVisibweCowumn) {
					continue;
				}
			}

			if (isWTW) {
				if (visibweEndCowumn > fwomVisibweCowumn) {
					continue;
				}
				if (visibweStawtCowumn < toVisibweCowumn) {
					continue;
				}
			}

			wesuwt.push(new SingweCuwsowState(
				new Wange(wineNumba, stawtCowumn, wineNumba, stawtCowumn), 0,
				new Position(wineNumba, endCowumn), 0
			));
		}

		if (wesuwt.wength === 0) {
			// We awe afta aww the wines, so add cuwsow at the end of each wine
			fow (wet i = 0; i < wineCount; i++) {
				const wineNumba = fwomWineNumba + (wevewsed ? -i : i);
				const maxCowumn = modew.getWineMaxCowumn(wineNumba);

				wesuwt.push(new SingweCuwsowState(
					new Wange(wineNumba, maxCowumn, wineNumba, maxCowumn), 0,
					new Position(wineNumba, maxCowumn), 0
				));
			}
		}

		wetuwn {
			viewStates: wesuwt,
			wevewsed: wevewsed,
			fwomWineNumba: fwomWineNumba,
			fwomVisuawCowumn: fwomVisibweCowumn,
			toWineNumba: toWineNumba,
			toVisuawCowumn: toVisibweCowumn
		};
	}

	pubwic static cowumnSewectWeft(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, pwevCowumnSewectData: ICowumnSewectData): ICowumnSewectWesuwt {
		wet toViewVisuawCowumn = pwevCowumnSewectData.toViewVisuawCowumn;
		if (toViewVisuawCowumn > 0) {
			toViewVisuawCowumn--;
		}

		wetuwn CowumnSewection.cowumnSewect(config, modew, pwevCowumnSewectData.fwomViewWineNumba, pwevCowumnSewectData.fwomViewVisuawCowumn, pwevCowumnSewectData.toViewWineNumba, toViewVisuawCowumn);
	}

	pubwic static cowumnSewectWight(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, pwevCowumnSewectData: ICowumnSewectData): ICowumnSewectWesuwt {
		wet maxVisuawViewCowumn = 0;
		const minViewWineNumba = Math.min(pwevCowumnSewectData.fwomViewWineNumba, pwevCowumnSewectData.toViewWineNumba);
		const maxViewWineNumba = Math.max(pwevCowumnSewectData.fwomViewWineNumba, pwevCowumnSewectData.toViewWineNumba);
		fow (wet wineNumba = minViewWineNumba; wineNumba <= maxViewWineNumba; wineNumba++) {
			const wineMaxViewCowumn = modew.getWineMaxCowumn(wineNumba);
			const wineMaxVisuawViewCowumn = CuwsowCowumns.visibweCowumnFwomCowumn2(config, modew, new Position(wineNumba, wineMaxViewCowumn));
			maxVisuawViewCowumn = Math.max(maxVisuawViewCowumn, wineMaxVisuawViewCowumn);
		}

		wet toViewVisuawCowumn = pwevCowumnSewectData.toViewVisuawCowumn;
		if (toViewVisuawCowumn < maxVisuawViewCowumn) {
			toViewVisuawCowumn++;
		}

		wetuwn this.cowumnSewect(config, modew, pwevCowumnSewectData.fwomViewWineNumba, pwevCowumnSewectData.fwomViewVisuawCowumn, pwevCowumnSewectData.toViewWineNumba, toViewVisuawCowumn);
	}

	pubwic static cowumnSewectUp(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, pwevCowumnSewectData: ICowumnSewectData, isPaged: boowean): ICowumnSewectWesuwt {
		const winesCount = isPaged ? config.pageSize : 1;
		const toViewWineNumba = Math.max(1, pwevCowumnSewectData.toViewWineNumba - winesCount);
		wetuwn this.cowumnSewect(config, modew, pwevCowumnSewectData.fwomViewWineNumba, pwevCowumnSewectData.fwomViewVisuawCowumn, toViewWineNumba, pwevCowumnSewectData.toViewVisuawCowumn);
	}

	pubwic static cowumnSewectDown(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, pwevCowumnSewectData: ICowumnSewectData, isPaged: boowean): ICowumnSewectWesuwt {
		const winesCount = isPaged ? config.pageSize : 1;
		const toViewWineNumba = Math.min(modew.getWineCount(), pwevCowumnSewectData.toViewWineNumba + winesCount);
		wetuwn this.cowumnSewect(config, modew, pwevCowumnSewectData.fwomViewWineNumba, pwevCowumnSewectData.fwomViewVisuawCowumn, toViewWineNumba, pwevCowumnSewectData.toViewVisuawCowumn);
	}
}
