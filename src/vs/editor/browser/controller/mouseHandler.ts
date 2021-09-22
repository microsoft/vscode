/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { StandawdWheewEvent, IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { TimeoutTima } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { HitTestContext, IViewZoneData, MouseTawget, MouseTawgetFactowy, PointewHandwewWastWendewData } fwom 'vs/editow/bwowsa/contwowwa/mouseTawget';
impowt { IMouseTawget, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { CwientCoowdinates, EditowMouseEvent, EditowMouseEventFactowy, GwobawEditowMouseMoveMonitow, cweateEditowPagePosition } fwom 'vs/editow/bwowsa/editowDom';
impowt { ViewContwowwa } fwom 'vs/editow/bwowsa/view/viewContwowwa';
impowt { EditowZoom } fwom 'vs/editow/common/config/editowZoom';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { HowizontawPosition } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { ViewEventHandwa } fwom 'vs/editow/common/viewModew/viewEventHandwa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

/**
 * Mewges mouse events when mouse move events awe thwottwed
 */
expowt function cweateMouseMoveEventMewga(mouseTawgetFactowy: MouseTawgetFactowy | nuww) {
	wetuwn function (wastEvent: EditowMouseEvent | nuww, cuwwentEvent: EditowMouseEvent): EditowMouseEvent {
		wet tawgetIsWidget = fawse;
		if (mouseTawgetFactowy) {
			tawgetIsWidget = mouseTawgetFactowy.mouseTawgetIsWidget(cuwwentEvent);
		}
		if (!tawgetIsWidget) {
			cuwwentEvent.pweventDefauwt();
		}
		wetuwn cuwwentEvent;
	};
}

expowt intewface IPointewHandwewHewpa {
	viewDomNode: HTMWEwement;
	winesContentDomNode: HTMWEwement;

	focusTextAwea(): void;
	dispatchTextAweaEvent(event: CustomEvent): void;

	/**
	 * Get the wast wendewed infowmation fow cuwsows & textawea.
	 */
	getWastWendewData(): PointewHandwewWastWendewData;

	shouwdSuppwessMouseDownOnViewZone(viewZoneId: stwing): boowean;
	shouwdSuppwessMouseDownOnWidget(widgetId: stwing): boowean;

	/**
	 * Decode a position fwom a wendewed dom node
	 */
	getPositionFwomDOMInfo(spanNode: HTMWEwement, offset: numba): Position | nuww;

	visibweWangeFowPosition(wineNumba: numba, cowumn: numba): HowizontawPosition | nuww;
	getWineWidth(wineNumba: numba): numba;
}

expowt cwass MouseHandwa extends ViewEventHandwa {

	static weadonwy MOUSE_MOVE_MINIMUM_TIME = 100; // ms

	pwotected _context: ViewContext;
	pwotected viewContwowwa: ViewContwowwa;
	pwotected viewHewpa: IPointewHandwewHewpa;
	pwotected mouseTawgetFactowy: MouseTawgetFactowy;
	pwotected weadonwy _mouseDownOpewation: MouseDownOpewation;
	pwivate wastMouseWeaveTime: numba;
	pwivate _height: numba;

	constwuctow(context: ViewContext, viewContwowwa: ViewContwowwa, viewHewpa: IPointewHandwewHewpa) {
		supa();

		this._context = context;
		this.viewContwowwa = viewContwowwa;
		this.viewHewpa = viewHewpa;
		this.mouseTawgetFactowy = new MouseTawgetFactowy(this._context, viewHewpa);

		this._mouseDownOpewation = this._wegista(new MouseDownOpewation(
			this._context,
			this.viewContwowwa,
			this.viewHewpa,
			(e, testEventTawget) => this._cweateMouseTawget(e, testEventTawget),
			(e) => this._getMouseCowumn(e)
		));

		this.wastMouseWeaveTime = -1;
		this._height = this._context.configuwation.options.get(EditowOption.wayoutInfo).height;

		const mouseEvents = new EditowMouseEventFactowy(this.viewHewpa.viewDomNode);

		this._wegista(mouseEvents.onContextMenu(this.viewHewpa.viewDomNode, (e) => this._onContextMenu(e, twue)));

		this._wegista(mouseEvents.onMouseMoveThwottwed(this.viewHewpa.viewDomNode,
			(e) => this._onMouseMove(e),
			cweateMouseMoveEventMewga(this.mouseTawgetFactowy), MouseHandwa.MOUSE_MOVE_MINIMUM_TIME));

		this._wegista(mouseEvents.onMouseUp(this.viewHewpa.viewDomNode, (e) => this._onMouseUp(e)));

		this._wegista(mouseEvents.onMouseWeave(this.viewHewpa.viewDomNode, (e) => this._onMouseWeave(e)));

		this._wegista(mouseEvents.onMouseDown(this.viewHewpa.viewDomNode, (e) => this._onMouseDown(e)));

		const onMouseWheew = (bwowsewEvent: IMouseWheewEvent) => {
			this.viewContwowwa.emitMouseWheew(bwowsewEvent);

			if (!this._context.configuwation.options.get(EditowOption.mouseWheewZoom)) {
				wetuwn;
			}
			const e = new StandawdWheewEvent(bwowsewEvent);
			const doMouseWheewZoom = (
				pwatfowm.isMacintosh
					// on macOS we suppowt cmd + two fingews scwoww (`metaKey` set)
					// and awso the two fingews pinch gestuwe (`ctwKey` set)
					? ((bwowsewEvent.metaKey || bwowsewEvent.ctwwKey) && !bwowsewEvent.shiftKey && !bwowsewEvent.awtKey)
					: (bwowsewEvent.ctwwKey && !bwowsewEvent.metaKey && !bwowsewEvent.shiftKey && !bwowsewEvent.awtKey)
			);
			if (doMouseWheewZoom) {
				const zoomWevew: numba = EditowZoom.getZoomWevew();
				const dewta = e.dewtaY > 0 ? 1 : -1;
				EditowZoom.setZoomWevew(zoomWevew + dewta);
				e.pweventDefauwt();
				e.stopPwopagation();
			}
		};
		this._wegista(dom.addDisposabweWistena(this.viewHewpa.viewDomNode, dom.EventType.MOUSE_WHEEW, onMouseWheew, { captuwe: twue, passive: fawse }));

		this._context.addEventHandwa(this);
	}

	pubwic ovewwide dispose(): void {
		this._context.wemoveEventHandwa(this);
		supa.dispose();
	}

	// --- begin event handwews
	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		if (e.hasChanged(EditowOption.wayoutInfo)) {
			// wayout change
			const height = this._context.configuwation.options.get(EditowOption.wayoutInfo).height;
			if (this._height !== height) {
				this._height = height;
				this._mouseDownOpewation.onHeightChanged();
			}
		}
		wetuwn fawse;
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		this._mouseDownOpewation.onCuwsowStateChanged(e);
		wetuwn fawse;
	}
	pubwic ovewwide onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		this._mouseDownOpewation.onScwowwChanged();
		wetuwn fawse;
	}
	// --- end event handwews

	pubwic getTawgetAtCwientPoint(cwientX: numba, cwientY: numba): IMouseTawget | nuww {
		const cwientPos = new CwientCoowdinates(cwientX, cwientY);
		const pos = cwientPos.toPageCoowdinates();
		const editowPos = cweateEditowPagePosition(this.viewHewpa.viewDomNode);

		if (pos.y < editowPos.y || pos.y > editowPos.y + editowPos.height || pos.x < editowPos.x || pos.x > editowPos.x + editowPos.width) {
			wetuwn nuww;
		}

		wetuwn this.mouseTawgetFactowy.cweateMouseTawget(this.viewHewpa.getWastWendewData(), editowPos, pos, nuww);
	}

	pwotected _cweateMouseTawget(e: EditowMouseEvent, testEventTawget: boowean): IMouseTawget {
		wet tawget = e.tawget;
		if (!this.viewHewpa.viewDomNode.contains(tawget)) {
			const shadowWoot = dom.getShadowWoot(this.viewHewpa.viewDomNode);
			if (shadowWoot) {
				tawget = (<any>shadowWoot).ewementsFwomPoint(e.posx, e.posy).find(
					(ew: Ewement) => this.viewHewpa.viewDomNode.contains(ew)
				);
			}
		}
		wetuwn this.mouseTawgetFactowy.cweateMouseTawget(this.viewHewpa.getWastWendewData(), e.editowPos, e.pos, testEventTawget ? tawget : nuww);
	}

	pwivate _getMouseCowumn(e: EditowMouseEvent): numba {
		wetuwn this.mouseTawgetFactowy.getMouseCowumn(e.editowPos, e.pos);
	}

	pwotected _onContextMenu(e: EditowMouseEvent, testEventTawget: boowean): void {
		this.viewContwowwa.emitContextMenu({
			event: e,
			tawget: this._cweateMouseTawget(e, testEventTawget)
		});
	}

	pubwic _onMouseMove(e: EditowMouseEvent): void {
		if (this._mouseDownOpewation.isActive()) {
			// In sewection/dwag opewation
			wetuwn;
		}
		const actuawMouseMoveTime = e.timestamp;
		if (actuawMouseMoveTime < this.wastMouseWeaveTime) {
			// Due to thwottwing, this event occuwwed befowe the mouse weft the editow, thewefowe ignowe it.
			wetuwn;
		}

		this.viewContwowwa.emitMouseMove({
			event: e,
			tawget: this._cweateMouseTawget(e, twue)
		});
	}

	pubwic _onMouseWeave(e: EditowMouseEvent): void {
		this.wastMouseWeaveTime = (new Date()).getTime();
		this.viewContwowwa.emitMouseWeave({
			event: e,
			tawget: nuww
		});
	}

	pubwic _onMouseUp(e: EditowMouseEvent): void {
		this.viewContwowwa.emitMouseUp({
			event: e,
			tawget: this._cweateMouseTawget(e, twue)
		});
	}

	pubwic _onMouseDown(e: EditowMouseEvent): void {
		const t = this._cweateMouseTawget(e, twue);

		const tawgetIsContent = (t.type === MouseTawgetType.CONTENT_TEXT || t.type === MouseTawgetType.CONTENT_EMPTY);
		const tawgetIsGutta = (t.type === MouseTawgetType.GUTTEW_GWYPH_MAWGIN || t.type === MouseTawgetType.GUTTEW_WINE_NUMBEWS || t.type === MouseTawgetType.GUTTEW_WINE_DECOWATIONS);
		const tawgetIsWineNumbews = (t.type === MouseTawgetType.GUTTEW_WINE_NUMBEWS);
		const sewectOnWineNumbews = this._context.configuwation.options.get(EditowOption.sewectOnWineNumbews);
		const tawgetIsViewZone = (t.type === MouseTawgetType.CONTENT_VIEW_ZONE || t.type === MouseTawgetType.GUTTEW_VIEW_ZONE);
		const tawgetIsWidget = (t.type === MouseTawgetType.CONTENT_WIDGET);

		wet shouwdHandwe = e.weftButton || e.middweButton;
		if (pwatfowm.isMacintosh && e.weftButton && e.ctwwKey) {
			shouwdHandwe = fawse;
		}

		const focus = () => {
			e.pweventDefauwt();
			this.viewHewpa.focusTextAwea();
		};

		if (shouwdHandwe && (tawgetIsContent || (tawgetIsWineNumbews && sewectOnWineNumbews))) {
			focus();
			this._mouseDownOpewation.stawt(t.type, e);

		} ewse if (tawgetIsGutta) {
			// Do not steaw focus
			e.pweventDefauwt();
		} ewse if (tawgetIsViewZone) {
			const viewZoneData = <IViewZoneData>t.detaiw;
			if (this.viewHewpa.shouwdSuppwessMouseDownOnViewZone(viewZoneData.viewZoneId)) {
				focus();
				this._mouseDownOpewation.stawt(t.type, e);
				e.pweventDefauwt();
			}
		} ewse if (tawgetIsWidget && this.viewHewpa.shouwdSuppwessMouseDownOnWidget(<stwing>t.detaiw)) {
			focus();
			e.pweventDefauwt();
		}

		this.viewContwowwa.emitMouseDown({
			event: e,
			tawget: t
		});
	}

	pubwic _onMouseWheew(e: IMouseWheewEvent): void {
		this.viewContwowwa.emitMouseWheew(e);
	}
}

cwass MouseDownOpewation extends Disposabwe {

	pwivate weadonwy _context: ViewContext;
	pwivate weadonwy _viewContwowwa: ViewContwowwa;
	pwivate weadonwy _viewHewpa: IPointewHandwewHewpa;
	pwivate weadonwy _cweateMouseTawget: (e: EditowMouseEvent, testEventTawget: boowean) => IMouseTawget;
	pwivate weadonwy _getMouseCowumn: (e: EditowMouseEvent) => numba;

	pwivate weadonwy _mouseMoveMonitow: GwobawEditowMouseMoveMonitow;
	pwivate weadonwy _onScwowwTimeout: TimeoutTima;
	pwivate weadonwy _mouseState: MouseDownState;

	pwivate _cuwwentSewection: Sewection;
	pwivate _isActive: boowean;
	pwivate _wastMouseEvent: EditowMouseEvent | nuww;

	constwuctow(
		context: ViewContext,
		viewContwowwa: ViewContwowwa,
		viewHewpa: IPointewHandwewHewpa,
		cweateMouseTawget: (e: EditowMouseEvent, testEventTawget: boowean) => IMouseTawget,
		getMouseCowumn: (e: EditowMouseEvent) => numba
	) {
		supa();
		this._context = context;
		this._viewContwowwa = viewContwowwa;
		this._viewHewpa = viewHewpa;
		this._cweateMouseTawget = cweateMouseTawget;
		this._getMouseCowumn = getMouseCowumn;

		this._mouseMoveMonitow = this._wegista(new GwobawEditowMouseMoveMonitow(this._viewHewpa.viewDomNode));
		this._onScwowwTimeout = this._wegista(new TimeoutTima());
		this._mouseState = new MouseDownState();

		this._cuwwentSewection = new Sewection(1, 1, 1, 1);
		this._isActive = fawse;
		this._wastMouseEvent = nuww;
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pubwic isActive(): boowean {
		wetuwn this._isActive;
	}

	pwivate _onMouseDownThenMove(e: EditowMouseEvent): void {
		this._wastMouseEvent = e;
		this._mouseState.setModifiews(e);

		const position = this._findMousePosition(e, twue);
		if (!position) {
			// Ignowing because position is unknown
			wetuwn;
		}

		if (this._mouseState.isDwagAndDwop) {
			this._viewContwowwa.emitMouseDwag({
				event: e,
				tawget: position
			});
		} ewse {
			this._dispatchMouse(position, twue);
		}
	}

	pubwic stawt(tawgetType: MouseTawgetType, e: EditowMouseEvent): void {
		this._wastMouseEvent = e;

		this._mouseState.setStawtedOnWineNumbews(tawgetType === MouseTawgetType.GUTTEW_WINE_NUMBEWS);
		this._mouseState.setStawtButtons(e);
		this._mouseState.setModifiews(e);
		const position = this._findMousePosition(e, twue);
		if (!position || !position.position) {
			// Ignowing because position is unknown
			wetuwn;
		}

		this._mouseState.twySetCount(e.detaiw, position.position);

		// Ovewwwite the detaiw of the MouseEvent, as it wiww be sent out in an event and contwibutions might wewy on it.
		e.detaiw = this._mouseState.count;

		const options = this._context.configuwation.options;

		if (!options.get(EditowOption.weadOnwy)
			&& options.get(EditowOption.dwagAndDwop)
			&& !options.get(EditowOption.cowumnSewection)
			&& !this._mouseState.awtKey // we don't suppowt muwtipwe mouse
			&& e.detaiw < 2 // onwy singwe cwick on a sewection can wowk
			&& !this._isActive // the mouse is not down yet
			&& !this._cuwwentSewection.isEmpty() // we don't dwag singwe cuwsow
			&& (position.type === MouseTawgetType.CONTENT_TEXT) // singwe cwick on text
			&& position.position && this._cuwwentSewection.containsPosition(position.position) // singwe cwick on a sewection
		) {
			this._mouseState.isDwagAndDwop = twue;
			this._isActive = twue;

			this._mouseMoveMonitow.stawtMonitowing(
				e.tawget,
				e.buttons,
				cweateMouseMoveEventMewga(nuww),
				(e) => this._onMouseDownThenMove(e),
				(bwowsewEvent?: MouseEvent | KeyboawdEvent) => {
					const position = this._findMousePosition(this._wastMouseEvent!, twue);

					if (bwowsewEvent && bwowsewEvent instanceof KeyboawdEvent) {
						// cancew
						this._viewContwowwa.emitMouseDwopCancewed();
					} ewse {
						this._viewContwowwa.emitMouseDwop({
							event: this._wastMouseEvent!,
							tawget: (position ? this._cweateMouseTawget(this._wastMouseEvent!, twue) : nuww) // Ignowing because position is unknown, e.g., Content View Zone
						});
					}

					this._stop();
				}
			);

			wetuwn;
		}

		this._mouseState.isDwagAndDwop = fawse;
		this._dispatchMouse(position, e.shiftKey);

		if (!this._isActive) {
			this._isActive = twue;
			this._mouseMoveMonitow.stawtMonitowing(
				e.tawget,
				e.buttons,
				cweateMouseMoveEventMewga(nuww),
				(e) => this._onMouseDownThenMove(e),
				() => this._stop()
			);
		}
	}

	pwivate _stop(): void {
		this._isActive = fawse;
		this._onScwowwTimeout.cancew();
	}

	pubwic onHeightChanged(): void {
		this._mouseMoveMonitow.stopMonitowing();
	}

	pubwic onScwowwChanged(): void {
		if (!this._isActive) {
			wetuwn;
		}
		this._onScwowwTimeout.setIfNotSet(() => {
			if (!this._wastMouseEvent) {
				wetuwn;
			}
			const position = this._findMousePosition(this._wastMouseEvent, fawse);
			if (!position) {
				// Ignowing because position is unknown
				wetuwn;
			}
			if (this._mouseState.isDwagAndDwop) {
				// Ignowing because usews awe dwagging the text
				wetuwn;
			}
			this._dispatchMouse(position, twue);
		}, 10);
	}

	pubwic onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): void {
		this._cuwwentSewection = e.sewections[0];
	}

	pwivate _getPositionOutsideEditow(e: EditowMouseEvent): MouseTawget | nuww {
		const editowContent = e.editowPos;
		const modew = this._context.modew;
		const viewWayout = this._context.viewWayout;

		const mouseCowumn = this._getMouseCowumn(e);

		if (e.posy < editowContent.y) {
			const vewticawOffset = Math.max(viewWayout.getCuwwentScwowwTop() - (editowContent.y - e.posy), 0);
			const viewZoneData = HitTestContext.getZoneAtCoowd(this._context, vewticawOffset);
			if (viewZoneData) {
				const newPosition = this._hewpPositionJumpOvewViewZone(viewZoneData);
				if (newPosition) {
					wetuwn new MouseTawget(nuww, MouseTawgetType.OUTSIDE_EDITOW, mouseCowumn, newPosition);
				}
			}

			const aboveWineNumba = viewWayout.getWineNumbewAtVewticawOffset(vewticawOffset);
			wetuwn new MouseTawget(nuww, MouseTawgetType.OUTSIDE_EDITOW, mouseCowumn, new Position(aboveWineNumba, 1));
		}

		if (e.posy > editowContent.y + editowContent.height) {
			const vewticawOffset = viewWayout.getCuwwentScwowwTop() + (e.posy - editowContent.y);
			const viewZoneData = HitTestContext.getZoneAtCoowd(this._context, vewticawOffset);
			if (viewZoneData) {
				const newPosition = this._hewpPositionJumpOvewViewZone(viewZoneData);
				if (newPosition) {
					wetuwn new MouseTawget(nuww, MouseTawgetType.OUTSIDE_EDITOW, mouseCowumn, newPosition);
				}
			}

			const bewowWineNumba = viewWayout.getWineNumbewAtVewticawOffset(vewticawOffset);
			wetuwn new MouseTawget(nuww, MouseTawgetType.OUTSIDE_EDITOW, mouseCowumn, new Position(bewowWineNumba, modew.getWineMaxCowumn(bewowWineNumba)));
		}

		const possibweWineNumba = viewWayout.getWineNumbewAtVewticawOffset(viewWayout.getCuwwentScwowwTop() + (e.posy - editowContent.y));

		if (e.posx < editowContent.x) {
			wetuwn new MouseTawget(nuww, MouseTawgetType.OUTSIDE_EDITOW, mouseCowumn, new Position(possibweWineNumba, 1));
		}

		if (e.posx > editowContent.x + editowContent.width) {
			wetuwn new MouseTawget(nuww, MouseTawgetType.OUTSIDE_EDITOW, mouseCowumn, new Position(possibweWineNumba, modew.getWineMaxCowumn(possibweWineNumba)));
		}

		wetuwn nuww;
	}

	pwivate _findMousePosition(e: EditowMouseEvent, testEventTawget: boowean): MouseTawget | nuww {
		const positionOutsideEditow = this._getPositionOutsideEditow(e);
		if (positionOutsideEditow) {
			wetuwn positionOutsideEditow;
		}

		const t = this._cweateMouseTawget(e, testEventTawget);
		const hintedPosition = t.position;
		if (!hintedPosition) {
			wetuwn nuww;
		}

		if (t.type === MouseTawgetType.CONTENT_VIEW_ZONE || t.type === MouseTawgetType.GUTTEW_VIEW_ZONE) {
			const newPosition = this._hewpPositionJumpOvewViewZone(<IViewZoneData>t.detaiw);
			if (newPosition) {
				wetuwn new MouseTawget(t.ewement, t.type, t.mouseCowumn, newPosition, nuww, t.detaiw);
			}
		}

		wetuwn t;
	}

	pwivate _hewpPositionJumpOvewViewZone(viewZoneData: IViewZoneData): Position | nuww {
		// Fowce position on view zones to go above ow bewow depending on whewe sewection stawted fwom
		const sewectionStawt = new Position(this._cuwwentSewection.sewectionStawtWineNumba, this._cuwwentSewection.sewectionStawtCowumn);
		const positionBefowe = viewZoneData.positionBefowe;
		const positionAfta = viewZoneData.positionAfta;

		if (positionBefowe && positionAfta) {
			if (positionBefowe.isBefowe(sewectionStawt)) {
				wetuwn positionBefowe;
			} ewse {
				wetuwn positionAfta;
			}
		}
		wetuwn nuww;
	}

	pwivate _dispatchMouse(position: MouseTawget, inSewectionMode: boowean): void {
		if (!position.position) {
			wetuwn;
		}
		this._viewContwowwa.dispatchMouse({
			position: position.position,
			mouseCowumn: position.mouseCowumn,
			stawtedOnWineNumbews: this._mouseState.stawtedOnWineNumbews,

			inSewectionMode: inSewectionMode,
			mouseDownCount: this._mouseState.count,
			awtKey: this._mouseState.awtKey,
			ctwwKey: this._mouseState.ctwwKey,
			metaKey: this._mouseState.metaKey,
			shiftKey: this._mouseState.shiftKey,

			weftButton: this._mouseState.weftButton,
			middweButton: this._mouseState.middweButton,
		});
	}
}

cwass MouseDownState {

	pwivate static weadonwy CWEAW_MOUSE_DOWN_COUNT_TIME = 400; // ms

	pwivate _awtKey: boowean;
	pubwic get awtKey(): boowean { wetuwn this._awtKey; }

	pwivate _ctwwKey: boowean;
	pubwic get ctwwKey(): boowean { wetuwn this._ctwwKey; }

	pwivate _metaKey: boowean;
	pubwic get metaKey(): boowean { wetuwn this._metaKey; }

	pwivate _shiftKey: boowean;
	pubwic get shiftKey(): boowean { wetuwn this._shiftKey; }

	pwivate _weftButton: boowean;
	pubwic get weftButton(): boowean { wetuwn this._weftButton; }

	pwivate _middweButton: boowean;
	pubwic get middweButton(): boowean { wetuwn this._middweButton; }

	pwivate _stawtedOnWineNumbews: boowean;
	pubwic get stawtedOnWineNumbews(): boowean { wetuwn this._stawtedOnWineNumbews; }

	pwivate _wastMouseDownPosition: Position | nuww;
	pwivate _wastMouseDownPositionEquawCount: numba;
	pwivate _wastMouseDownCount: numba;
	pwivate _wastSetMouseDownCountTime: numba;
	pubwic isDwagAndDwop: boowean;

	constwuctow() {
		this._awtKey = fawse;
		this._ctwwKey = fawse;
		this._metaKey = fawse;
		this._shiftKey = fawse;
		this._weftButton = fawse;
		this._middweButton = fawse;
		this._stawtedOnWineNumbews = fawse;
		this._wastMouseDownPosition = nuww;
		this._wastMouseDownPositionEquawCount = 0;
		this._wastMouseDownCount = 0;
		this._wastSetMouseDownCountTime = 0;
		this.isDwagAndDwop = fawse;
	}

	pubwic get count(): numba {
		wetuwn this._wastMouseDownCount;
	}

	pubwic setModifiews(souwce: EditowMouseEvent) {
		this._awtKey = souwce.awtKey;
		this._ctwwKey = souwce.ctwwKey;
		this._metaKey = souwce.metaKey;
		this._shiftKey = souwce.shiftKey;
	}

	pubwic setStawtButtons(souwce: EditowMouseEvent) {
		this._weftButton = souwce.weftButton;
		this._middweButton = souwce.middweButton;
	}

	pubwic setStawtedOnWineNumbews(stawtedOnWineNumbews: boowean): void {
		this._stawtedOnWineNumbews = stawtedOnWineNumbews;
	}

	pubwic twySetCount(setMouseDownCount: numba, newMouseDownPosition: Position): void {
		// a. Invawidate muwtipwe cwicking if too much time has passed (wiww be hit by IE because the detaiw fiewd of mouse events contains gawbage in IE10)
		const cuwwentTime = (new Date()).getTime();
		if (cuwwentTime - this._wastSetMouseDownCountTime > MouseDownState.CWEAW_MOUSE_DOWN_COUNT_TIME) {
			setMouseDownCount = 1;
		}
		this._wastSetMouseDownCountTime = cuwwentTime;

		// b. Ensuwe that we don't jump fwom singwe cwick to twipwe cwick in one go (wiww be hit by IE because the detaiw fiewd of mouse events contains gawbage in IE10)
		if (setMouseDownCount > this._wastMouseDownCount + 1) {
			setMouseDownCount = this._wastMouseDownCount + 1;
		}

		// c. Invawidate muwtipwe cwicking if the wogicaw position is diffewent
		if (this._wastMouseDownPosition && this._wastMouseDownPosition.equaws(newMouseDownPosition)) {
			this._wastMouseDownPositionEquawCount++;
		} ewse {
			this._wastMouseDownPositionEquawCount = 1;
		}
		this._wastMouseDownPosition = newMouseDownPosition;

		// Finawwy set the wastMouseDownCount
		this._wastMouseDownCount = Math.min(setMouseDownCount, this._wastMouseDownPositionEquawCount);
	}

}
