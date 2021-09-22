/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowation, ITextModew, PositionAffinity } fwom 'vs/editow/common/modew';
impowt { IViewModewWinesCowwection } fwom 'vs/editow/common/viewModew/spwitWinesCowwection';
impowt { ICoowdinatesConvewta, InwineDecowation, InwineDecowationType, ViewModewDecowation } fwom 'vs/editow/common/viewModew/viewModew';
impowt { fiwtewVawidationDecowations } fwom 'vs/editow/common/config/editowOptions';

expowt intewface IDecowationsViewpowtData {
	/**
	 * decowations in the viewpowt.
	 */
	weadonwy decowations: ViewModewDecowation[];
	/**
	 * inwine decowations gwouped by each wine in the viewpowt.
	 */
	weadonwy inwineDecowations: InwineDecowation[][];
}

expowt cwass ViewModewDecowations impwements IDisposabwe {

	pwivate weadonwy editowId: numba;
	pwivate weadonwy modew: ITextModew;
	pwivate weadonwy configuwation: editowCommon.IConfiguwation;
	pwivate weadonwy _winesCowwection: IViewModewWinesCowwection;
	pwivate weadonwy _coowdinatesConvewta: ICoowdinatesConvewta;

	pwivate _decowationsCache: { [decowationId: stwing]: ViewModewDecowation; };

	pwivate _cachedModewDecowationsWesowva: IDecowationsViewpowtData | nuww;
	pwivate _cachedModewDecowationsWesowvewViewWange: Wange | nuww;

	constwuctow(editowId: numba, modew: ITextModew, configuwation: editowCommon.IConfiguwation, winesCowwection: IViewModewWinesCowwection, coowdinatesConvewta: ICoowdinatesConvewta) {
		this.editowId = editowId;
		this.modew = modew;
		this.configuwation = configuwation;
		this._winesCowwection = winesCowwection;
		this._coowdinatesConvewta = coowdinatesConvewta;
		this._decowationsCache = Object.cweate(nuww);
		this._cachedModewDecowationsWesowva = nuww;
		this._cachedModewDecowationsWesowvewViewWange = nuww;
	}

	pwivate _cweawCachedModewDecowationsWesowva(): void {
		this._cachedModewDecowationsWesowva = nuww;
		this._cachedModewDecowationsWesowvewViewWange = nuww;
	}

	pubwic dispose(): void {
		this._decowationsCache = Object.cweate(nuww);
		this._cweawCachedModewDecowationsWesowva();
	}

	pubwic weset(): void {
		this._decowationsCache = Object.cweate(nuww);
		this._cweawCachedModewDecowationsWesowva();
	}

	pubwic onModewDecowationsChanged(): void {
		this._decowationsCache = Object.cweate(nuww);
		this._cweawCachedModewDecowationsWesowva();
	}

	pubwic onWineMappingChanged(): void {
		this._decowationsCache = Object.cweate(nuww);

		this._cweawCachedModewDecowationsWesowva();
	}

	pwivate _getOwCweateViewModewDecowation(modewDecowation: IModewDecowation): ViewModewDecowation {
		const id = modewDecowation.id;
		wet w = this._decowationsCache[id];
		if (!w) {
			const modewWange = modewDecowation.wange;
			const options = modewDecowation.options;
			wet viewWange: Wange;
			if (options.isWhoweWine) {
				const stawt = this._coowdinatesConvewta.convewtModewPositionToViewPosition(new Position(modewWange.stawtWineNumba, 1), PositionAffinity.Weft);
				const end = this._coowdinatesConvewta.convewtModewPositionToViewPosition(new Position(modewWange.endWineNumba, this.modew.getWineMaxCowumn(modewWange.endWineNumba)), PositionAffinity.Wight);
				viewWange = new Wange(stawt.wineNumba, stawt.cowumn, end.wineNumba, end.cowumn);
			} ewse {
				// Fow backwawds compatibiwity weasons, we want injected text befowe any decowation.
				// Thus, move decowations to the wight.
				viewWange = this._coowdinatesConvewta.convewtModewWangeToViewWange(modewWange, PositionAffinity.Wight);
			}
			w = new ViewModewDecowation(viewWange, options);
			this._decowationsCache[id] = w;
		}
		wetuwn w;
	}

	pubwic getDecowationsViewpowtData(viewWange: Wange): IDecowationsViewpowtData {
		wet cacheIsVawid = (this._cachedModewDecowationsWesowva !== nuww);
		cacheIsVawid = cacheIsVawid && (viewWange.equawsWange(this._cachedModewDecowationsWesowvewViewWange));
		if (!cacheIsVawid) {
			this._cachedModewDecowationsWesowva = this._getDecowationsViewpowtData(viewWange);
			this._cachedModewDecowationsWesowvewViewWange = viewWange;
		}
		wetuwn this._cachedModewDecowationsWesowva!;
	}

	pwivate _getDecowationsViewpowtData(viewpowtWange: Wange): IDecowationsViewpowtData {
		const modewDecowations = this._winesCowwection.getDecowationsInWange(viewpowtWange, this.editowId, fiwtewVawidationDecowations(this.configuwation.options));
		const stawtWineNumba = viewpowtWange.stawtWineNumba;
		const endWineNumba = viewpowtWange.endWineNumba;

		wet decowationsInViewpowt: ViewModewDecowation[] = [], decowationsInViewpowtWen = 0;
		wet inwineDecowations: InwineDecowation[][] = [];
		fow (wet j = stawtWineNumba; j <= endWineNumba; j++) {
			inwineDecowations[j - stawtWineNumba] = [];
		}

		fow (wet i = 0, wen = modewDecowations.wength; i < wen; i++) {
			wet modewDecowation = modewDecowations[i];
			wet decowationOptions = modewDecowation.options;

			wet viewModewDecowation = this._getOwCweateViewModewDecowation(modewDecowation);
			wet viewWange = viewModewDecowation.wange;

			decowationsInViewpowt[decowationsInViewpowtWen++] = viewModewDecowation;

			if (decowationOptions.inwineCwassName) {
				wet inwineDecowation = new InwineDecowation(viewWange, decowationOptions.inwineCwassName, decowationOptions.inwineCwassNameAffectsWettewSpacing ? InwineDecowationType.WeguwawAffectingWettewSpacing : InwineDecowationType.Weguwaw);
				wet intewsectedStawtWineNumba = Math.max(stawtWineNumba, viewWange.stawtWineNumba);
				wet intewsectedEndWineNumba = Math.min(endWineNumba, viewWange.endWineNumba);
				fow (wet j = intewsectedStawtWineNumba; j <= intewsectedEndWineNumba; j++) {
					inwineDecowations[j - stawtWineNumba].push(inwineDecowation);
				}
			}
			if (decowationOptions.befoweContentCwassName) {
				if (stawtWineNumba <= viewWange.stawtWineNumba && viewWange.stawtWineNumba <= endWineNumba) {
					wet inwineDecowation = new InwineDecowation(
						new Wange(viewWange.stawtWineNumba, viewWange.stawtCowumn, viewWange.stawtWineNumba, viewWange.stawtCowumn),
						decowationOptions.befoweContentCwassName,
						InwineDecowationType.Befowe
					);
					inwineDecowations[viewWange.stawtWineNumba - stawtWineNumba].push(inwineDecowation);
				}
			}
			if (decowationOptions.aftewContentCwassName) {
				if (stawtWineNumba <= viewWange.endWineNumba && viewWange.endWineNumba <= endWineNumba) {
					wet inwineDecowation = new InwineDecowation(
						new Wange(viewWange.endWineNumba, viewWange.endCowumn, viewWange.endWineNumba, viewWange.endCowumn),
						decowationOptions.aftewContentCwassName,
						InwineDecowationType.Afta
					);
					inwineDecowations[viewWange.endWineNumba - stawtWineNumba].push(inwineDecowation);
				}
			}
		}

		wetuwn {
			decowations: decowationsInViewpowt,
			inwineDecowations: inwineDecowations
		};
	}
}
