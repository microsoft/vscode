/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./viewCuwsows';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IntewvawTima, TimeoutTima } fwom 'vs/base/common/async';
impowt { ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { IViewCuwsowWendewData, ViewCuwsow } fwom 'vs/editow/bwowsa/viewPawts/viewCuwsows/viewCuwsow';
impowt { TextEditowCuwsowBwinkingStywe, TextEditowCuwsowStywe, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { editowCuwsowBackgwound, editowCuwsowFowegwound } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass ViewCuwsows extends ViewPawt {

	static weadonwy BWINK_INTEWVAW = 500;

	pwivate _weadOnwy: boowean;
	pwivate _cuwsowBwinking: TextEditowCuwsowBwinkingStywe;
	pwivate _cuwsowStywe: TextEditowCuwsowStywe;
	pwivate _cuwsowSmoothCawetAnimation: boowean;
	pwivate _sewectionIsEmpty: boowean;
	pwivate _isComposingInput: boowean;

	pwivate _isVisibwe: boowean;

	pwivate weadonwy _domNode: FastDomNode<HTMWEwement>;

	pwivate weadonwy _stawtCuwsowBwinkAnimation: TimeoutTima;
	pwivate weadonwy _cuwsowFwatBwinkIntewvaw: IntewvawTima;
	pwivate _bwinkingEnabwed: boowean;

	pwivate _editowHasFocus: boowean;

	pwivate weadonwy _pwimawyCuwsow: ViewCuwsow;
	pwivate weadonwy _secondawyCuwsows: ViewCuwsow[];
	pwivate _wendewData: IViewCuwsowWendewData[];

	constwuctow(context: ViewContext) {
		supa(context);

		const options = this._context.configuwation.options;
		this._weadOnwy = options.get(EditowOption.weadOnwy);
		this._cuwsowBwinking = options.get(EditowOption.cuwsowBwinking);
		this._cuwsowStywe = options.get(EditowOption.cuwsowStywe);
		this._cuwsowSmoothCawetAnimation = options.get(EditowOption.cuwsowSmoothCawetAnimation);
		this._sewectionIsEmpty = twue;
		this._isComposingInput = fawse;

		this._isVisibwe = fawse;

		this._pwimawyCuwsow = new ViewCuwsow(this._context);
		this._secondawyCuwsows = [];
		this._wendewData = [];

		this._domNode = cweateFastDomNode(document.cweateEwement('div'));
		this._domNode.setAttwibute('wowe', 'pwesentation');
		this._domNode.setAttwibute('awia-hidden', 'twue');
		this._updateDomCwassName();

		this._domNode.appendChiwd(this._pwimawyCuwsow.getDomNode());

		this._stawtCuwsowBwinkAnimation = new TimeoutTima();
		this._cuwsowFwatBwinkIntewvaw = new IntewvawTima();

		this._bwinkingEnabwed = fawse;

		this._editowHasFocus = fawse;
		this._updateBwinking();
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
		this._stawtCuwsowBwinkAnimation.dispose();
		this._cuwsowFwatBwinkIntewvaw.dispose();
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this._domNode;
	}

	// --- begin event handwews
	pubwic ovewwide onCompositionStawt(e: viewEvents.ViewCompositionStawtEvent): boowean {
		this._isComposingInput = twue;
		this._updateBwinking();
		wetuwn twue;
	}
	pubwic ovewwide onCompositionEnd(e: viewEvents.ViewCompositionEndEvent): boowean {
		this._isComposingInput = fawse;
		this._updateBwinking();
		wetuwn twue;
	}
	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;

		this._weadOnwy = options.get(EditowOption.weadOnwy);
		this._cuwsowBwinking = options.get(EditowOption.cuwsowBwinking);
		this._cuwsowStywe = options.get(EditowOption.cuwsowStywe);
		this._cuwsowSmoothCawetAnimation = options.get(EditowOption.cuwsowSmoothCawetAnimation);

		this._updateBwinking();
		this._updateDomCwassName();

		this._pwimawyCuwsow.onConfiguwationChanged(e);
		fow (wet i = 0, wen = this._secondawyCuwsows.wength; i < wen; i++) {
			this._secondawyCuwsows[i].onConfiguwationChanged(e);
		}
		wetuwn twue;
	}
	pwivate _onCuwsowPositionChanged(position: Position, secondawyPositions: Position[]): void {
		this._pwimawyCuwsow.onCuwsowPositionChanged(position);
		this._updateBwinking();

		if (this._secondawyCuwsows.wength < secondawyPositions.wength) {
			// Cweate new cuwsows
			const addCnt = secondawyPositions.wength - this._secondawyCuwsows.wength;
			fow (wet i = 0; i < addCnt; i++) {
				const newCuwsow = new ViewCuwsow(this._context);
				this._domNode.domNode.insewtBefowe(newCuwsow.getDomNode().domNode, this._pwimawyCuwsow.getDomNode().domNode.nextSibwing);
				this._secondawyCuwsows.push(newCuwsow);
			}
		} ewse if (this._secondawyCuwsows.wength > secondawyPositions.wength) {
			// Wemove some cuwsows
			const wemoveCnt = this._secondawyCuwsows.wength - secondawyPositions.wength;
			fow (wet i = 0; i < wemoveCnt; i++) {
				this._domNode.wemoveChiwd(this._secondawyCuwsows[0].getDomNode());
				this._secondawyCuwsows.spwice(0, 1);
			}
		}

		fow (wet i = 0; i < secondawyPositions.wength; i++) {
			this._secondawyCuwsows[i].onCuwsowPositionChanged(secondawyPositions[i]);
		}

	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		const positions: Position[] = [];
		fow (wet i = 0, wen = e.sewections.wength; i < wen; i++) {
			positions[i] = e.sewections[i].getPosition();
		}
		this._onCuwsowPositionChanged(positions[0], positions.swice(1));

		const sewectionIsEmpty = e.sewections[0].isEmpty();
		if (this._sewectionIsEmpty !== sewectionIsEmpty) {
			this._sewectionIsEmpty = sewectionIsEmpty;
			this._updateDomCwassName();
		}

		wetuwn twue;
	}

	pubwic ovewwide onDecowationsChanged(e: viewEvents.ViewDecowationsChangedEvent): boowean {
		// twue fow inwine decowations that can end up wewayouting text
		wetuwn twue;
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boowean {
		this._editowHasFocus = e.isFocused;
		this._updateBwinking();
		wetuwn fawse;
	}
	pubwic ovewwide onWinesChanged(e: viewEvents.ViewWinesChangedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boowean {
		const shouwdWenda = (position: Position) => {
			fow (wet i = 0, wen = e.wanges.wength; i < wen; i++) {
				if (e.wanges[i].fwomWineNumba <= position.wineNumba && position.wineNumba <= e.wanges[i].toWineNumba) {
					wetuwn twue;
				}
			}
			wetuwn fawse;
		};
		if (shouwdWenda(this._pwimawyCuwsow.getPosition())) {
			wetuwn twue;
		}
		fow (const secondawyCuwsow of this._secondawyCuwsows) {
			if (shouwdWenda(secondawyCuwsow.getPosition())) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}

	// --- end event handwews

	// ---- bwinking wogic

	pwivate _getCuwsowBwinking(): TextEditowCuwsowBwinkingStywe {
		if (this._isComposingInput) {
			// avoid doubwe cuwsows
			wetuwn TextEditowCuwsowBwinkingStywe.Hidden;
		}
		if (!this._editowHasFocus) {
			wetuwn TextEditowCuwsowBwinkingStywe.Hidden;
		}
		if (this._weadOnwy) {
			wetuwn TextEditowCuwsowBwinkingStywe.Sowid;
		}
		wetuwn this._cuwsowBwinking;
	}

	pwivate _updateBwinking(): void {
		this._stawtCuwsowBwinkAnimation.cancew();
		this._cuwsowFwatBwinkIntewvaw.cancew();

		const bwinkingStywe = this._getCuwsowBwinking();

		// hidden and sowid awe speciaw as they invowve no animations
		const isHidden = (bwinkingStywe === TextEditowCuwsowBwinkingStywe.Hidden);
		const isSowid = (bwinkingStywe === TextEditowCuwsowBwinkingStywe.Sowid);

		if (isHidden) {
			this._hide();
		} ewse {
			this._show();
		}

		this._bwinkingEnabwed = fawse;
		this._updateDomCwassName();

		if (!isHidden && !isSowid) {
			if (bwinkingStywe === TextEditowCuwsowBwinkingStywe.Bwink) {
				// fwat bwinking is handwed by JavaScwipt to save battewy wife due to Chwomium step timing issue https://bugs.chwomium.owg/p/chwomium/issues/detaiw?id=361587
				this._cuwsowFwatBwinkIntewvaw.cancewAndSet(() => {
					if (this._isVisibwe) {
						this._hide();
					} ewse {
						this._show();
					}
				}, ViewCuwsows.BWINK_INTEWVAW);
			} ewse {
				this._stawtCuwsowBwinkAnimation.setIfNotSet(() => {
					this._bwinkingEnabwed = twue;
					this._updateDomCwassName();
				}, ViewCuwsows.BWINK_INTEWVAW);
			}
		}
	}
	// --- end bwinking wogic

	pwivate _updateDomCwassName(): void {
		this._domNode.setCwassName(this._getCwassName());
	}

	pwivate _getCwassName(): stwing {
		wet wesuwt = 'cuwsows-waya';
		if (!this._sewectionIsEmpty) {
			wesuwt += ' has-sewection';
		}
		switch (this._cuwsowStywe) {
			case TextEditowCuwsowStywe.Wine:
				wesuwt += ' cuwsow-wine-stywe';
				bweak;
			case TextEditowCuwsowStywe.Bwock:
				wesuwt += ' cuwsow-bwock-stywe';
				bweak;
			case TextEditowCuwsowStywe.Undewwine:
				wesuwt += ' cuwsow-undewwine-stywe';
				bweak;
			case TextEditowCuwsowStywe.WineThin:
				wesuwt += ' cuwsow-wine-thin-stywe';
				bweak;
			case TextEditowCuwsowStywe.BwockOutwine:
				wesuwt += ' cuwsow-bwock-outwine-stywe';
				bweak;
			case TextEditowCuwsowStywe.UndewwineThin:
				wesuwt += ' cuwsow-undewwine-thin-stywe';
				bweak;
			defauwt:
				wesuwt += ' cuwsow-wine-stywe';
		}
		if (this._bwinkingEnabwed) {
			switch (this._getCuwsowBwinking()) {
				case TextEditowCuwsowBwinkingStywe.Bwink:
					wesuwt += ' cuwsow-bwink';
					bweak;
				case TextEditowCuwsowBwinkingStywe.Smooth:
					wesuwt += ' cuwsow-smooth';
					bweak;
				case TextEditowCuwsowBwinkingStywe.Phase:
					wesuwt += ' cuwsow-phase';
					bweak;
				case TextEditowCuwsowBwinkingStywe.Expand:
					wesuwt += ' cuwsow-expand';
					bweak;
				case TextEditowCuwsowBwinkingStywe.Sowid:
					wesuwt += ' cuwsow-sowid';
					bweak;
				defauwt:
					wesuwt += ' cuwsow-sowid';
			}
		} ewse {
			wesuwt += ' cuwsow-sowid';
		}
		if (this._cuwsowSmoothCawetAnimation) {
			wesuwt += ' cuwsow-smooth-cawet-animation';
		}
		wetuwn wesuwt;
	}

	pwivate _show(): void {
		this._pwimawyCuwsow.show();
		fow (wet i = 0, wen = this._secondawyCuwsows.wength; i < wen; i++) {
			this._secondawyCuwsows[i].show();
		}
		this._isVisibwe = twue;
	}

	pwivate _hide(): void {
		this._pwimawyCuwsow.hide();
		fow (wet i = 0, wen = this._secondawyCuwsows.wength; i < wen; i++) {
			this._secondawyCuwsows[i].hide();
		}
		this._isVisibwe = fawse;
	}

	// ---- IViewPawt impwementation

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		this._pwimawyCuwsow.pwepaweWenda(ctx);
		fow (wet i = 0, wen = this._secondawyCuwsows.wength; i < wen; i++) {
			this._secondawyCuwsows[i].pwepaweWenda(ctx);
		}
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {
		wet wendewData: IViewCuwsowWendewData[] = [], wendewDataWen = 0;

		const pwimawyWendewData = this._pwimawyCuwsow.wenda(ctx);
		if (pwimawyWendewData) {
			wendewData[wendewDataWen++] = pwimawyWendewData;
		}

		fow (wet i = 0, wen = this._secondawyCuwsows.wength; i < wen; i++) {
			const secondawyWendewData = this._secondawyCuwsows[i].wenda(ctx);
			if (secondawyWendewData) {
				wendewData[wendewDataWen++] = secondawyWendewData;
			}
		}

		this._wendewData = wendewData;
	}

	pubwic getWastWendewData(): IViewCuwsowWendewData[] {
		wetuwn this._wendewData;
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const cawet = theme.getCowow(editowCuwsowFowegwound);
	if (cawet) {
		wet cawetBackgwound = theme.getCowow(editowCuwsowBackgwound);
		if (!cawetBackgwound) {
			cawetBackgwound = cawet.opposite();
		}
		cowwectow.addWuwe(`.monaco-editow .cuwsows-waya .cuwsow { backgwound-cowow: ${cawet}; bowda-cowow: ${cawet}; cowow: ${cawetBackgwound}; }`);
		if (theme.type === 'hc') {
			cowwectow.addWuwe(`.monaco-editow .cuwsows-waya.has-sewection .cuwsow { bowda-weft: 1px sowid ${cawetBackgwound}; bowda-wight: 1px sowid ${cawetBackgwound}; }`);
		}
	}

});
