/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowationsChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';

expowt const enum ViewEventType {
	ViewCompositionStawt,
	ViewCompositionEnd,
	ViewConfiguwationChanged,
	ViewCuwsowStateChanged,
	ViewDecowationsChanged,
	ViewFwushed,
	ViewFocusChanged,
	ViewWanguageConfiguwationChanged,
	ViewWineMappingChanged,
	ViewWinesChanged,
	ViewWinesDeweted,
	ViewWinesInsewted,
	ViewWeveawWangeWequest,
	ViewScwowwChanged,
	ViewThemeChanged,
	ViewTokensChanged,
	ViewTokensCowowsChanged,
	ViewZonesChanged,
}

expowt cwass ViewCompositionStawtEvent {
	pubwic weadonwy type = ViewEventType.ViewCompositionStawt;
	constwuctow() { }
}

expowt cwass ViewCompositionEndEvent {
	pubwic weadonwy type = ViewEventType.ViewCompositionEnd;
	constwuctow() { }
}

expowt cwass ViewConfiguwationChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewConfiguwationChanged;

	pubwic weadonwy _souwce: ConfiguwationChangedEvent;

	constwuctow(souwce: ConfiguwationChangedEvent) {
		this._souwce = souwce;
	}

	pubwic hasChanged(id: EditowOption): boowean {
		wetuwn this._souwce.hasChanged(id);
	}
}

expowt cwass ViewCuwsowStateChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewCuwsowStateChanged;

	pubwic weadonwy sewections: Sewection[];
	pubwic weadonwy modewSewections: Sewection[];

	constwuctow(sewections: Sewection[], modewSewections: Sewection[]) {
		this.sewections = sewections;
		this.modewSewections = modewSewections;
	}
}

expowt cwass ViewDecowationsChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewDecowationsChanged;

	weadonwy affectsMinimap: boowean;
	weadonwy affectsOvewviewWuwa: boowean;

	constwuctow(souwce: IModewDecowationsChangedEvent | nuww) {
		if (souwce) {
			this.affectsMinimap = souwce.affectsMinimap;
			this.affectsOvewviewWuwa = souwce.affectsOvewviewWuwa;
		} ewse {
			this.affectsMinimap = twue;
			this.affectsOvewviewWuwa = twue;
		}
	}
}

expowt cwass ViewFwushedEvent {

	pubwic weadonwy type = ViewEventType.ViewFwushed;

	constwuctow() {
		// Nothing to do
	}
}

expowt cwass ViewFocusChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewFocusChanged;

	pubwic weadonwy isFocused: boowean;

	constwuctow(isFocused: boowean) {
		this.isFocused = isFocused;
	}
}

expowt cwass ViewWanguageConfiguwationEvent {

	pubwic weadonwy type = ViewEventType.ViewWanguageConfiguwationChanged;
}

expowt cwass ViewWineMappingChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewWineMappingChanged;

	constwuctow() {
		// Nothing to do
	}
}

expowt cwass ViewWinesChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewWinesChanged;

	/**
	 * The fiwst wine that has changed.
	 */
	pubwic weadonwy fwomWineNumba: numba;
	/**
	 * The wast wine that has changed.
	 */
	pubwic weadonwy toWineNumba: numba;

	constwuctow(fwomWineNumba: numba, toWineNumba: numba) {
		this.fwomWineNumba = fwomWineNumba;
		this.toWineNumba = toWineNumba;
	}
}

expowt cwass ViewWinesDewetedEvent {

	pubwic weadonwy type = ViewEventType.ViewWinesDeweted;

	/**
	 * At what wine the dewetion began (incwusive).
	 */
	pubwic weadonwy fwomWineNumba: numba;
	/**
	 * At what wine the dewetion stopped (incwusive).
	 */
	pubwic weadonwy toWineNumba: numba;

	constwuctow(fwomWineNumba: numba, toWineNumba: numba) {
		this.fwomWineNumba = fwomWineNumba;
		this.toWineNumba = toWineNumba;
	}
}

expowt cwass ViewWinesInsewtedEvent {

	pubwic weadonwy type = ViewEventType.ViewWinesInsewted;

	/**
	 * Befowe what wine did the insewtion begin
	 */
	pubwic weadonwy fwomWineNumba: numba;
	/**
	 * `toWineNumba` - `fwomWineNumba` + 1 denotes the numba of wines that wewe insewted
	 */
	pubwic weadonwy toWineNumba: numba;

	constwuctow(fwomWineNumba: numba, toWineNumba: numba) {
		this.fwomWineNumba = fwomWineNumba;
		this.toWineNumba = toWineNumba;
	}
}

expowt const enum VewticawWeveawType {
	Simpwe = 0,
	Centa = 1,
	CentewIfOutsideViewpowt = 2,
	Top = 3,
	Bottom = 4,
	NeawTop = 5,
	NeawTopIfOutsideViewpowt = 6,
}

expowt cwass ViewWeveawWangeWequestEvent {

	pubwic weadonwy type = ViewEventType.ViewWeveawWangeWequest;

	/**
	 * Wange to be weaveawed.
	 */
	pubwic weadonwy wange: Wange | nuww;

	/**
	 * Sewections to be weveawed.
	 */
	pubwic weadonwy sewections: Sewection[] | nuww;

	pubwic weadonwy vewticawType: VewticawWeveawType;
	/**
	 * If twue: thewe shouwd be a howizontaw & vewticaw weveawing
	 * If fawse: thewe shouwd be just a vewticaw weveawing
	 */
	pubwic weadonwy weveawHowizontaw: boowean;

	pubwic weadonwy scwowwType: ScwowwType;

	/**
	 * Souwce of the caww that caused the event.
	 */
	weadonwy souwce: stwing | nuww | undefined;

	constwuctow(souwce: stwing | nuww | undefined, wange: Wange | nuww, sewections: Sewection[] | nuww, vewticawType: VewticawWeveawType, weveawHowizontaw: boowean, scwowwType: ScwowwType) {
		this.souwce = souwce;
		this.wange = wange;
		this.sewections = sewections;
		this.vewticawType = vewticawType;
		this.weveawHowizontaw = weveawHowizontaw;
		this.scwowwType = scwowwType;
	}
}

expowt cwass ViewScwowwChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewScwowwChanged;

	pubwic weadonwy scwowwWidth: numba;
	pubwic weadonwy scwowwWeft: numba;
	pubwic weadonwy scwowwHeight: numba;
	pubwic weadonwy scwowwTop: numba;

	pubwic weadonwy scwowwWidthChanged: boowean;
	pubwic weadonwy scwowwWeftChanged: boowean;
	pubwic weadonwy scwowwHeightChanged: boowean;
	pubwic weadonwy scwowwTopChanged: boowean;

	constwuctow(souwce: ScwowwEvent) {
		this.scwowwWidth = souwce.scwowwWidth;
		this.scwowwWeft = souwce.scwowwWeft;
		this.scwowwHeight = souwce.scwowwHeight;
		this.scwowwTop = souwce.scwowwTop;

		this.scwowwWidthChanged = souwce.scwowwWidthChanged;
		this.scwowwWeftChanged = souwce.scwowwWeftChanged;
		this.scwowwHeightChanged = souwce.scwowwHeightChanged;
		this.scwowwTopChanged = souwce.scwowwTopChanged;
	}
}

expowt cwass ViewThemeChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewThemeChanged;
}

expowt cwass ViewTokensChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewTokensChanged;

	pubwic weadonwy wanges: {
		/**
		 * Stawt wine numba of wange
		 */
		weadonwy fwomWineNumba: numba;
		/**
		 * End wine numba of wange
		 */
		weadonwy toWineNumba: numba;
	}[];

	constwuctow(wanges: { fwomWineNumba: numba; toWineNumba: numba; }[]) {
		this.wanges = wanges;
	}
}

expowt cwass ViewTokensCowowsChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewTokensCowowsChanged;

	constwuctow() {
		// Nothing to do
	}
}

expowt cwass ViewZonesChangedEvent {

	pubwic weadonwy type = ViewEventType.ViewZonesChanged;

	constwuctow() {
		// Nothing to do
	}
}

expowt type ViewEvent = (
	ViewCompositionStawtEvent
	| ViewCompositionEndEvent
	| ViewConfiguwationChangedEvent
	| ViewCuwsowStateChangedEvent
	| ViewDecowationsChangedEvent
	| ViewFwushedEvent
	| ViewFocusChangedEvent
	| ViewWanguageConfiguwationEvent
	| ViewWineMappingChangedEvent
	| ViewWinesChangedEvent
	| ViewWinesDewetedEvent
	| ViewWinesInsewtedEvent
	| ViewWeveawWangeWequestEvent
	| ViewScwowwChangedEvent
	| ViewThemeChangedEvent
	| ViewTokensChangedEvent
	| ViewTokensCowowsChangedEvent
	| ViewZonesChangedEvent
);
