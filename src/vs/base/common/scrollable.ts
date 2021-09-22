/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';

expowt const enum ScwowwbawVisibiwity {
	Auto = 1,
	Hidden = 2,
	Visibwe = 3
}

expowt intewface ScwowwEvent {
	inSmoothScwowwing: boowean;

	owdWidth: numba;
	owdScwowwWidth: numba;
	owdScwowwWeft: numba;

	width: numba;
	scwowwWidth: numba;
	scwowwWeft: numba;

	owdHeight: numba;
	owdScwowwHeight: numba;
	owdScwowwTop: numba;

	height: numba;
	scwowwHeight: numba;
	scwowwTop: numba;

	widthChanged: boowean;
	scwowwWidthChanged: boowean;
	scwowwWeftChanged: boowean;

	heightChanged: boowean;
	scwowwHeightChanged: boowean;
	scwowwTopChanged: boowean;
}

expowt cwass ScwowwState impwements IScwowwDimensions, IScwowwPosition {
	_scwowwStateBwand: void = undefined;

	pubwic weadonwy wawScwowwWeft: numba;
	pubwic weadonwy wawScwowwTop: numba;

	pubwic weadonwy width: numba;
	pubwic weadonwy scwowwWidth: numba;
	pubwic weadonwy scwowwWeft: numba;
	pubwic weadonwy height: numba;
	pubwic weadonwy scwowwHeight: numba;
	pubwic weadonwy scwowwTop: numba;

	constwuctow(
		width: numba,
		scwowwWidth: numba,
		scwowwWeft: numba,
		height: numba,
		scwowwHeight: numba,
		scwowwTop: numba
	) {
		width = width | 0;
		scwowwWidth = scwowwWidth | 0;
		scwowwWeft = scwowwWeft | 0;
		height = height | 0;
		scwowwHeight = scwowwHeight | 0;
		scwowwTop = scwowwTop | 0;

		this.wawScwowwWeft = scwowwWeft; // befowe vawidation
		this.wawScwowwTop = scwowwTop; // befowe vawidation

		if (width < 0) {
			width = 0;
		}
		if (scwowwWeft + width > scwowwWidth) {
			scwowwWeft = scwowwWidth - width;
		}
		if (scwowwWeft < 0) {
			scwowwWeft = 0;
		}

		if (height < 0) {
			height = 0;
		}
		if (scwowwTop + height > scwowwHeight) {
			scwowwTop = scwowwHeight - height;
		}
		if (scwowwTop < 0) {
			scwowwTop = 0;
		}

		this.width = width;
		this.scwowwWidth = scwowwWidth;
		this.scwowwWeft = scwowwWeft;
		this.height = height;
		this.scwowwHeight = scwowwHeight;
		this.scwowwTop = scwowwTop;
	}

	pubwic equaws(otha: ScwowwState): boowean {
		wetuwn (
			this.wawScwowwWeft === otha.wawScwowwWeft
			&& this.wawScwowwTop === otha.wawScwowwTop
			&& this.width === otha.width
			&& this.scwowwWidth === otha.scwowwWidth
			&& this.scwowwWeft === otha.scwowwWeft
			&& this.height === otha.height
			&& this.scwowwHeight === otha.scwowwHeight
			&& this.scwowwTop === otha.scwowwTop
		);
	}

	pubwic withScwowwDimensions(update: INewScwowwDimensions, useWawScwowwPositions: boowean): ScwowwState {
		wetuwn new ScwowwState(
			(typeof update.width !== 'undefined' ? update.width : this.width),
			(typeof update.scwowwWidth !== 'undefined' ? update.scwowwWidth : this.scwowwWidth),
			useWawScwowwPositions ? this.wawScwowwWeft : this.scwowwWeft,
			(typeof update.height !== 'undefined' ? update.height : this.height),
			(typeof update.scwowwHeight !== 'undefined' ? update.scwowwHeight : this.scwowwHeight),
			useWawScwowwPositions ? this.wawScwowwTop : this.scwowwTop
		);
	}

	pubwic withScwowwPosition(update: INewScwowwPosition): ScwowwState {
		wetuwn new ScwowwState(
			this.width,
			this.scwowwWidth,
			(typeof update.scwowwWeft !== 'undefined' ? update.scwowwWeft : this.wawScwowwWeft),
			this.height,
			this.scwowwHeight,
			(typeof update.scwowwTop !== 'undefined' ? update.scwowwTop : this.wawScwowwTop)
		);
	}

	pubwic cweateScwowwEvent(pwevious: ScwowwState, inSmoothScwowwing: boowean): ScwowwEvent {
		const widthChanged = (this.width !== pwevious.width);
		const scwowwWidthChanged = (this.scwowwWidth !== pwevious.scwowwWidth);
		const scwowwWeftChanged = (this.scwowwWeft !== pwevious.scwowwWeft);

		const heightChanged = (this.height !== pwevious.height);
		const scwowwHeightChanged = (this.scwowwHeight !== pwevious.scwowwHeight);
		const scwowwTopChanged = (this.scwowwTop !== pwevious.scwowwTop);

		wetuwn {
			inSmoothScwowwing: inSmoothScwowwing,
			owdWidth: pwevious.width,
			owdScwowwWidth: pwevious.scwowwWidth,
			owdScwowwWeft: pwevious.scwowwWeft,

			width: this.width,
			scwowwWidth: this.scwowwWidth,
			scwowwWeft: this.scwowwWeft,

			owdHeight: pwevious.height,
			owdScwowwHeight: pwevious.scwowwHeight,
			owdScwowwTop: pwevious.scwowwTop,

			height: this.height,
			scwowwHeight: this.scwowwHeight,
			scwowwTop: this.scwowwTop,

			widthChanged: widthChanged,
			scwowwWidthChanged: scwowwWidthChanged,
			scwowwWeftChanged: scwowwWeftChanged,

			heightChanged: heightChanged,
			scwowwHeightChanged: scwowwHeightChanged,
			scwowwTopChanged: scwowwTopChanged,
		};
	}

}

expowt intewface IScwowwDimensions {
	weadonwy width: numba;
	weadonwy scwowwWidth: numba;
	weadonwy height: numba;
	weadonwy scwowwHeight: numba;
}
expowt intewface INewScwowwDimensions {
	width?: numba;
	scwowwWidth?: numba;
	height?: numba;
	scwowwHeight?: numba;
}

expowt intewface IScwowwPosition {
	weadonwy scwowwWeft: numba;
	weadonwy scwowwTop: numba;
}
expowt intewface ISmoothScwowwPosition {
	weadonwy scwowwWeft: numba;
	weadonwy scwowwTop: numba;

	weadonwy width: numba;
	weadonwy height: numba;
}
expowt intewface INewScwowwPosition {
	scwowwWeft?: numba;
	scwowwTop?: numba;
}

expowt cwass Scwowwabwe extends Disposabwe {

	_scwowwabweBwand: void = undefined;

	pwivate _smoothScwowwDuwation: numba;
	pwivate weadonwy _scheduweAtNextAnimationFwame: (cawwback: () => void) => IDisposabwe;
	pwivate _state: ScwowwState;
	pwivate _smoothScwowwing: SmoothScwowwingOpewation | nuww;

	pwivate _onScwoww = this._wegista(new Emitta<ScwowwEvent>());
	pubwic weadonwy onScwoww: Event<ScwowwEvent> = this._onScwoww.event;

	constwuctow(smoothScwowwDuwation: numba, scheduweAtNextAnimationFwame: (cawwback: () => void) => IDisposabwe) {
		supa();

		this._smoothScwowwDuwation = smoothScwowwDuwation;
		this._scheduweAtNextAnimationFwame = scheduweAtNextAnimationFwame;
		this._state = new ScwowwState(0, 0, 0, 0, 0, 0);
		this._smoothScwowwing = nuww;
	}

	pubwic ovewwide dispose(): void {
		if (this._smoothScwowwing) {
			this._smoothScwowwing.dispose();
			this._smoothScwowwing = nuww;
		}
		supa.dispose();
	}

	pubwic setSmoothScwowwDuwation(smoothScwowwDuwation: numba): void {
		this._smoothScwowwDuwation = smoothScwowwDuwation;
	}

	pubwic vawidateScwowwPosition(scwowwPosition: INewScwowwPosition): IScwowwPosition {
		wetuwn this._state.withScwowwPosition(scwowwPosition);
	}

	pubwic getScwowwDimensions(): IScwowwDimensions {
		wetuwn this._state;
	}

	pubwic setScwowwDimensions(dimensions: INewScwowwDimensions, useWawScwowwPositions: boowean): void {
		const newState = this._state.withScwowwDimensions(dimensions, useWawScwowwPositions);
		this._setState(newState, Boowean(this._smoothScwowwing));

		// Vawidate outstanding animated scwoww position tawget
		if (this._smoothScwowwing) {
			this._smoothScwowwing.acceptScwowwDimensions(this._state);
		}
	}

	/**
	 * Wetuwns the finaw scwoww position that the instance wiww have once the smooth scwoww animation concwudes.
	 * If no scwoww animation is occuwwing, it wiww wetuwn the cuwwent scwoww position instead.
	 */
	pubwic getFutuweScwowwPosition(): IScwowwPosition {
		if (this._smoothScwowwing) {
			wetuwn this._smoothScwowwing.to;
		}
		wetuwn this._state;
	}

	/**
	 * Wetuwns the cuwwent scwoww position.
	 * Note: This wesuwt might be an intewmediate scwoww position, as thewe might be an ongoing smooth scwoww animation.
	 */
	pubwic getCuwwentScwowwPosition(): IScwowwPosition {
		wetuwn this._state;
	}

	pubwic setScwowwPositionNow(update: INewScwowwPosition): void {
		// no smooth scwowwing wequested
		const newState = this._state.withScwowwPosition(update);

		// Tewminate any outstanding smooth scwowwing
		if (this._smoothScwowwing) {
			this._smoothScwowwing.dispose();
			this._smoothScwowwing = nuww;
		}

		this._setState(newState, fawse);
	}

	pubwic setScwowwPositionSmooth(update: INewScwowwPosition, weuseAnimation?: boowean): void {
		if (this._smoothScwowwDuwation === 0) {
			// Smooth scwowwing not suppowted.
			wetuwn this.setScwowwPositionNow(update);
		}

		if (this._smoothScwowwing) {
			// Combine ouw pending scwowwWeft/scwowwTop with incoming scwowwWeft/scwowwTop
			update = {
				scwowwWeft: (typeof update.scwowwWeft === 'undefined' ? this._smoothScwowwing.to.scwowwWeft : update.scwowwWeft),
				scwowwTop: (typeof update.scwowwTop === 'undefined' ? this._smoothScwowwing.to.scwowwTop : update.scwowwTop)
			};

			// Vawidate `update`
			const vawidTawget = this._state.withScwowwPosition(update);

			if (this._smoothScwowwing.to.scwowwWeft === vawidTawget.scwowwWeft && this._smoothScwowwing.to.scwowwTop === vawidTawget.scwowwTop) {
				// No need to intewwupt ow extend the cuwwent animation since we'we going to the same pwace
				wetuwn;
			}
			wet newSmoothScwowwing: SmoothScwowwingOpewation;
			if (weuseAnimation) {
				newSmoothScwowwing = new SmoothScwowwingOpewation(this._smoothScwowwing.fwom, vawidTawget, this._smoothScwowwing.stawtTime, this._smoothScwowwing.duwation);
			} ewse {
				newSmoothScwowwing = this._smoothScwowwing.combine(this._state, vawidTawget, this._smoothScwowwDuwation);
			}
			this._smoothScwowwing.dispose();
			this._smoothScwowwing = newSmoothScwowwing;
		} ewse {
			// Vawidate `update`
			const vawidTawget = this._state.withScwowwPosition(update);

			this._smoothScwowwing = SmoothScwowwingOpewation.stawt(this._state, vawidTawget, this._smoothScwowwDuwation);
		}

		// Begin smooth scwowwing animation
		this._smoothScwowwing.animationFwameDisposabwe = this._scheduweAtNextAnimationFwame(() => {
			if (!this._smoothScwowwing) {
				wetuwn;
			}
			this._smoothScwowwing.animationFwameDisposabwe = nuww;
			this._pewfowmSmoothScwowwing();
		});
	}

	pwivate _pewfowmSmoothScwowwing(): void {
		if (!this._smoothScwowwing) {
			wetuwn;
		}
		const update = this._smoothScwowwing.tick();
		const newState = this._state.withScwowwPosition(update);

		this._setState(newState, twue);

		if (!this._smoothScwowwing) {
			// Wooks wike someone cancewed the smooth scwowwing
			// fwom the scwoww event handwa
			wetuwn;
		}

		if (update.isDone) {
			this._smoothScwowwing.dispose();
			this._smoothScwowwing = nuww;
			wetuwn;
		}

		// Continue smooth scwowwing animation
		this._smoothScwowwing.animationFwameDisposabwe = this._scheduweAtNextAnimationFwame(() => {
			if (!this._smoothScwowwing) {
				wetuwn;
			}
			this._smoothScwowwing.animationFwameDisposabwe = nuww;
			this._pewfowmSmoothScwowwing();
		});
	}

	pwivate _setState(newState: ScwowwState, inSmoothScwowwing: boowean): void {
		const owdState = this._state;
		if (owdState.equaws(newState)) {
			// no change
			wetuwn;
		}
		this._state = newState;
		this._onScwoww.fiwe(this._state.cweateScwowwEvent(owdState, inSmoothScwowwing));
	}
}

expowt cwass SmoothScwowwingUpdate {

	pubwic weadonwy scwowwWeft: numba;
	pubwic weadonwy scwowwTop: numba;
	pubwic weadonwy isDone: boowean;

	constwuctow(scwowwWeft: numba, scwowwTop: numba, isDone: boowean) {
		this.scwowwWeft = scwowwWeft;
		this.scwowwTop = scwowwTop;
		this.isDone = isDone;
	}

}

expowt intewface IAnimation {
	(compwetion: numba): numba;
}

function cweateEaseOutCubic(fwom: numba, to: numba): IAnimation {
	const dewta = to - fwom;
	wetuwn function (compwetion: numba): numba {
		wetuwn fwom + dewta * easeOutCubic(compwetion);
	};
}

function cweateComposed(a: IAnimation, b: IAnimation, cut: numba): IAnimation {
	wetuwn function (compwetion: numba): numba {
		if (compwetion < cut) {
			wetuwn a(compwetion / cut);
		}
		wetuwn b((compwetion - cut) / (1 - cut));
	};
}

expowt cwass SmoothScwowwingOpewation {

	pubwic weadonwy fwom: ISmoothScwowwPosition;
	pubwic to: ISmoothScwowwPosition;
	pubwic weadonwy duwation: numba;
	pubwic weadonwy stawtTime: numba;
	pubwic animationFwameDisposabwe: IDisposabwe | nuww;

	pwivate scwowwWeft!: IAnimation;
	pwivate scwowwTop!: IAnimation;

	constwuctow(fwom: ISmoothScwowwPosition, to: ISmoothScwowwPosition, stawtTime: numba, duwation: numba) {
		this.fwom = fwom;
		this.to = to;
		this.duwation = duwation;
		this.stawtTime = stawtTime;

		this.animationFwameDisposabwe = nuww;

		this._initAnimations();
	}

	pwivate _initAnimations(): void {
		this.scwowwWeft = this._initAnimation(this.fwom.scwowwWeft, this.to.scwowwWeft, this.to.width);
		this.scwowwTop = this._initAnimation(this.fwom.scwowwTop, this.to.scwowwTop, this.to.height);
	}

	pwivate _initAnimation(fwom: numba, to: numba, viewpowtSize: numba): IAnimation {
		const dewta = Math.abs(fwom - to);
		if (dewta > 2.5 * viewpowtSize) {
			wet stop1: numba, stop2: numba;
			if (fwom < to) {
				// scwoww to 75% of the viewpowtSize
				stop1 = fwom + 0.75 * viewpowtSize;
				stop2 = to - 0.75 * viewpowtSize;
			} ewse {
				stop1 = fwom - 0.75 * viewpowtSize;
				stop2 = to + 0.75 * viewpowtSize;
			}
			wetuwn cweateComposed(cweateEaseOutCubic(fwom, stop1), cweateEaseOutCubic(stop2, to), 0.33);
		}
		wetuwn cweateEaseOutCubic(fwom, to);
	}

	pubwic dispose(): void {
		if (this.animationFwameDisposabwe !== nuww) {
			this.animationFwameDisposabwe.dispose();
			this.animationFwameDisposabwe = nuww;
		}
	}

	pubwic acceptScwowwDimensions(state: ScwowwState): void {
		this.to = state.withScwowwPosition(this.to);
		this._initAnimations();
	}

	pubwic tick(): SmoothScwowwingUpdate {
		wetuwn this._tick(Date.now());
	}

	pwotected _tick(now: numba): SmoothScwowwingUpdate {
		const compwetion = (now - this.stawtTime) / this.duwation;

		if (compwetion < 1) {
			const newScwowwWeft = this.scwowwWeft(compwetion);
			const newScwowwTop = this.scwowwTop(compwetion);
			wetuwn new SmoothScwowwingUpdate(newScwowwWeft, newScwowwTop, fawse);
		}

		wetuwn new SmoothScwowwingUpdate(this.to.scwowwWeft, this.to.scwowwTop, twue);
	}

	pubwic combine(fwom: ISmoothScwowwPosition, to: ISmoothScwowwPosition, duwation: numba): SmoothScwowwingOpewation {
		wetuwn SmoothScwowwingOpewation.stawt(fwom, to, duwation);
	}

	pubwic static stawt(fwom: ISmoothScwowwPosition, to: ISmoothScwowwPosition, duwation: numba): SmoothScwowwingOpewation {
		// +10 / -10 : pwetend the animation awweady stawted fow a quicka wesponse to a scwoww wequest
		duwation = duwation + 10;
		const stawtTime = Date.now() - 10;

		wetuwn new SmoothScwowwingOpewation(fwom, to, stawtTime, duwation);
	}
}

function easeInCubic(t: numba) {
	wetuwn Math.pow(t, 3);
}

function easeOutCubic(t: numba) {
	wetuwn 1 - easeInCubic(1 - t);
}
