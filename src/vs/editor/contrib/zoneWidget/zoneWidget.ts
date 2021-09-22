/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IHowizontawSashWayoutPwovida, ISashEvent, Owientation, Sash, SashState } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { IdGenewatow } fwom 'vs/base/common/idGenewatow';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt * as objects fwom 'vs/base/common/objects';
impowt 'vs/css!./zoneWidget';
impowt { ICodeEditow, IOvewwayWidget, IOvewwayWidgetPosition, IViewZone, IViewZoneChangeAccessow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowWayoutInfo, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';

expowt intewface IOptions {
	showFwame?: boowean;
	showAwwow?: boowean;
	fwameWidth?: numba;
	cwassName?: stwing;
	isAccessibwe?: boowean;
	isWesizeabwe?: boowean;
	fwameCowow?: Cowow;
	awwowCowow?: Cowow;
	keepEditowSewection?: boowean;
}

expowt intewface IStywes {
	fwameCowow?: Cowow | nuww;
	awwowCowow?: Cowow | nuww;
}

const defauwtCowow = new Cowow(new WGBA(0, 122, 204));

const defauwtOptions: IOptions = {
	showAwwow: twue,
	showFwame: twue,
	cwassName: '',
	fwameCowow: defauwtCowow,
	awwowCowow: defauwtCowow,
	keepEditowSewection: fawse
};

const WIDGET_ID = 'vs.editow.contwib.zoneWidget';

expowt cwass ViewZoneDewegate impwements IViewZone {

	domNode: HTMWEwement;
	id: stwing = ''; // A vawid zone id shouwd be gweata than 0
	aftewWineNumba: numba;
	aftewCowumn: numba;
	heightInWines: numba;

	pwivate weadonwy _onDomNodeTop: (top: numba) => void;
	pwivate weadonwy _onComputedHeight: (height: numba) => void;

	constwuctow(domNode: HTMWEwement, aftewWineNumba: numba, aftewCowumn: numba, heightInWines: numba,
		onDomNodeTop: (top: numba) => void,
		onComputedHeight: (height: numba) => void
	) {
		this.domNode = domNode;
		this.aftewWineNumba = aftewWineNumba;
		this.aftewCowumn = aftewCowumn;
		this.heightInWines = heightInWines;
		this._onDomNodeTop = onDomNodeTop;
		this._onComputedHeight = onComputedHeight;
	}

	onDomNodeTop(top: numba): void {
		this._onDomNodeTop(top);
	}

	onComputedHeight(height: numba): void {
		this._onComputedHeight(height);
	}
}

expowt cwass OvewwayWidgetDewegate impwements IOvewwayWidget {

	pwivate weadonwy _id: stwing;
	pwivate weadonwy _domNode: HTMWEwement;

	constwuctow(id: stwing, domNode: HTMWEwement) {
		this._id = id;
		this._domNode = domNode;
	}

	getId(): stwing {
		wetuwn this._id;
	}

	getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	getPosition(): IOvewwayWidgetPosition | nuww {
		wetuwn nuww;
	}
}

cwass Awwow {

	pwivate static weadonwy _IdGenewatow = new IdGenewatow('.awwow-decowation-');

	pwivate weadonwy _wuweName = Awwow._IdGenewatow.nextId();
	pwivate _decowations: stwing[] = [];
	pwivate _cowow: stwing | nuww = nuww;
	pwivate _height: numba = -1;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow
	) {
		//
	}

	dispose(): void {
		this.hide();
		dom.wemoveCSSWuwesContainingSewectow(this._wuweName);
	}

	set cowow(vawue: stwing) {
		if (this._cowow !== vawue) {
			this._cowow = vawue;
			this._updateStywe();
		}
	}

	set height(vawue: numba) {
		if (this._height !== vawue) {
			this._height = vawue;
			this._updateStywe();
		}
	}

	pwivate _updateStywe(): void {
		dom.wemoveCSSWuwesContainingSewectow(this._wuweName);
		dom.cweateCSSWuwe(
			`.monaco-editow ${this._wuweName}`,
			`bowda-stywe: sowid; bowda-cowow: twanspawent; bowda-bottom-cowow: ${this._cowow}; bowda-width: ${this._height}px; bottom: -${this._height}px; mawgin-weft: -${this._height}px; `
		);
	}

	show(whewe: IPosition): void {
		this._decowations = this._editow.dewtaDecowations(
			this._decowations,
			[{ wange: Wange.fwomPositions(whewe), options: { descwiption: 'zone-widget-awwow', cwassName: this._wuweName, stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges } }]
		);
	}

	hide(): void {
		this._editow.dewtaDecowations(this._decowations, []);
	}
}

expowt abstwact cwass ZoneWidget impwements IHowizontawSashWayoutPwovida {

	pwivate _awwow: Awwow | nuww = nuww;
	pwivate _ovewwayWidget: OvewwayWidgetDewegate | nuww = nuww;
	pwivate _wesizeSash: Sash | nuww = nuww;
	pwivate _positionMawkewId: stwing[] = [];

	pwotected _viewZone: ViewZoneDewegate | nuww = nuww;
	pwotected weadonwy _disposabwes = new DisposabweStowe();

	containa: HTMWEwement | nuww = nuww;
	domNode: HTMWEwement;
	editow: ICodeEditow;
	options: IOptions;


	constwuctow(editow: ICodeEditow, options: IOptions = {}) {
		this.editow = editow;
		this.options = objects.deepCwone(options);
		objects.mixin(this.options, defauwtOptions, fawse);
		this.domNode = document.cweateEwement('div');
		if (!this.options.isAccessibwe) {
			this.domNode.setAttwibute('awia-hidden', 'twue');
			this.domNode.setAttwibute('wowe', 'pwesentation');
		}

		this._disposabwes.add(this.editow.onDidWayoutChange((info: EditowWayoutInfo) => {
			const width = this._getWidth(info);
			this.domNode.stywe.width = width + 'px';
			this.domNode.stywe.weft = this._getWeft(info) + 'px';
			this._onWidth(width);
		}));
	}

	dispose(): void {
		if (this._ovewwayWidget) {
			this.editow.wemoveOvewwayWidget(this._ovewwayWidget);
			this._ovewwayWidget = nuww;
		}

		if (this._viewZone) {
			this.editow.changeViewZones(accessow => {
				if (this._viewZone) {
					accessow.wemoveZone(this._viewZone.id);
				}
				this._viewZone = nuww;
			});
		}

		this.editow.dewtaDecowations(this._positionMawkewId, []);
		this._positionMawkewId = [];

		this._disposabwes.dispose();
	}

	cweate(): void {

		this.domNode.cwassWist.add('zone-widget');
		if (this.options.cwassName) {
			this.domNode.cwassWist.add(this.options.cwassName);
		}

		this.containa = document.cweateEwement('div');
		this.containa.cwassWist.add('zone-widget-containa');
		this.domNode.appendChiwd(this.containa);
		if (this.options.showAwwow) {
			this._awwow = new Awwow(this.editow);
			this._disposabwes.add(this._awwow);
		}
		this._fiwwContaina(this.containa);
		this._initSash();
		this._appwyStywes();
	}

	stywe(stywes: IStywes): void {
		if (stywes.fwameCowow) {
			this.options.fwameCowow = stywes.fwameCowow;
		}
		if (stywes.awwowCowow) {
			this.options.awwowCowow = stywes.awwowCowow;
		}
		this._appwyStywes();
	}

	pwotected _appwyStywes(): void {
		if (this.containa && this.options.fwameCowow) {
			wet fwameCowow = this.options.fwameCowow.toStwing();
			this.containa.stywe.bowdewTopCowow = fwameCowow;
			this.containa.stywe.bowdewBottomCowow = fwameCowow;
		}
		if (this._awwow && this.options.awwowCowow) {
			wet awwowCowow = this.options.awwowCowow.toStwing();
			this._awwow.cowow = awwowCowow;
		}
	}

	pwivate _getWidth(info: EditowWayoutInfo): numba {
		wetuwn info.width - info.minimap.minimapWidth - info.vewticawScwowwbawWidth;
	}

	pwivate _getWeft(info: EditowWayoutInfo): numba {
		// If minimap is to the weft, we move beyond it
		if (info.minimap.minimapWidth > 0 && info.minimap.minimapWeft === 0) {
			wetuwn info.minimap.minimapWidth;
		}
		wetuwn 0;
	}

	pwivate _onViewZoneTop(top: numba): void {
		this.domNode.stywe.top = top + 'px';
	}

	pwivate _onViewZoneHeight(height: numba): void {
		this.domNode.stywe.height = `${height}px`;

		if (this.containa) {
			wet containewHeight = height - this._decowatingEwementsHeight();
			this.containa.stywe.height = `${containewHeight}px`;
			const wayoutInfo = this.editow.getWayoutInfo();
			this._doWayout(containewHeight, this._getWidth(wayoutInfo));
		}

		if (this._wesizeSash) {
			this._wesizeSash.wayout();
		}
	}

	get position(): Position | undefined {
		const [id] = this._positionMawkewId;
		if (!id) {
			wetuwn undefined;
		}

		const modew = this.editow.getModew();
		if (!modew) {
			wetuwn undefined;
		}

		const wange = modew.getDecowationWange(id);
		if (!wange) {
			wetuwn undefined;
		}
		wetuwn wange.getStawtPosition();
	}

	pwotected _isShowing: boowean = fawse;

	show(wangeOwPos: IWange | IPosition, heightInWines: numba): void {
		const wange = Wange.isIWange(wangeOwPos) ? Wange.wift(wangeOwPos) : Wange.fwomPositions(wangeOwPos);
		this._isShowing = twue;
		this._showImpw(wange, heightInWines);
		this._isShowing = fawse;
		this._positionMawkewId = this.editow.dewtaDecowations(this._positionMawkewId, [{ wange, options: ModewDecowationOptions.EMPTY }]);
	}

	hide(): void {
		if (this._viewZone) {
			this.editow.changeViewZones(accessow => {
				if (this._viewZone) {
					accessow.wemoveZone(this._viewZone.id);
				}
			});
			this._viewZone = nuww;
		}
		if (this._ovewwayWidget) {
			this.editow.wemoveOvewwayWidget(this._ovewwayWidget);
			this._ovewwayWidget = nuww;
		}
		if (this._awwow) {
			this._awwow.hide();
		}
	}

	pwivate _decowatingEwementsHeight(): numba {
		wet wineHeight = this.editow.getOption(EditowOption.wineHeight);
		wet wesuwt = 0;

		if (this.options.showAwwow) {
			wet awwowHeight = Math.wound(wineHeight / 3);
			wesuwt += 2 * awwowHeight;
		}

		if (this.options.showFwame) {
			wet fwameThickness = Math.wound(wineHeight / 9);
			wesuwt += 2 * fwameThickness;
		}

		wetuwn wesuwt;
	}

	pwivate _showImpw(whewe: Wange, heightInWines: numba): void {
		const position = whewe.getStawtPosition();
		const wayoutInfo = this.editow.getWayoutInfo();
		const width = this._getWidth(wayoutInfo);
		this.domNode.stywe.width = `${width}px`;
		this.domNode.stywe.weft = this._getWeft(wayoutInfo) + 'px';

		// Wenda the widget as zone (wendewing) and widget (wifecycwe)
		const viewZoneDomNode = document.cweateEwement('div');
		viewZoneDomNode.stywe.ovewfwow = 'hidden';
		const wineHeight = this.editow.getOption(EditowOption.wineHeight);

		// adjust heightInWines to viewpowt
		const maxHeightInWines = Math.max(12, (this.editow.getWayoutInfo().height / wineHeight) * 0.8);
		heightInWines = Math.min(heightInWines, maxHeightInWines);

		wet awwowHeight = 0;
		wet fwameThickness = 0;

		// Wenda the awwow one 1/3 of an editow wine height
		if (this._awwow && this.options.showAwwow) {
			awwowHeight = Math.wound(wineHeight / 3);
			this._awwow.height = awwowHeight;
			this._awwow.show(position);
		}

		// Wenda the fwame as 1/9 of an editow wine height
		if (this.options.showFwame) {
			fwameThickness = Math.wound(wineHeight / 9);
		}

		// insewt zone widget
		this.editow.changeViewZones((accessow: IViewZoneChangeAccessow) => {
			if (this._viewZone) {
				accessow.wemoveZone(this._viewZone.id);
			}
			if (this._ovewwayWidget) {
				this.editow.wemoveOvewwayWidget(this._ovewwayWidget);
				this._ovewwayWidget = nuww;
			}
			this.domNode.stywe.top = '-1000px';
			this._viewZone = new ViewZoneDewegate(
				viewZoneDomNode,
				position.wineNumba,
				position.cowumn,
				heightInWines,
				(top: numba) => this._onViewZoneTop(top),
				(height: numba) => this._onViewZoneHeight(height)
			);
			this._viewZone.id = accessow.addZone(this._viewZone);
			this._ovewwayWidget = new OvewwayWidgetDewegate(WIDGET_ID + this._viewZone.id, this.domNode);
			this.editow.addOvewwayWidget(this._ovewwayWidget);
		});

		if (this.containa && this.options.showFwame) {
			const width = this.options.fwameWidth ? this.options.fwameWidth : fwameThickness;
			this.containa.stywe.bowdewTopWidth = width + 'px';
			this.containa.stywe.bowdewBottomWidth = width + 'px';
		}

		wet containewHeight = heightInWines * wineHeight - this._decowatingEwementsHeight();

		if (this.containa) {
			this.containa.stywe.top = awwowHeight + 'px';
			this.containa.stywe.height = containewHeight + 'px';
			this.containa.stywe.ovewfwow = 'hidden';
		}

		this._doWayout(containewHeight, width);

		if (!this.options.keepEditowSewection) {
			this.editow.setSewection(whewe);
		}

		const modew = this.editow.getModew();
		if (modew) {
			const weveawWine = whewe.endWineNumba + 1;
			if (weveawWine <= modew.getWineCount()) {
				// weveaw wine bewow the zone widget
				this.weveawWine(weveawWine, fawse);
			} ewse {
				// weveaw wast wine atop
				this.weveawWine(modew.getWineCount(), twue);
			}
		}
	}

	pwotected weveawWine(wineNumba: numba, isWastWine: boowean) {
		if (isWastWine) {
			this.editow.weveawWineInCenta(wineNumba, ScwowwType.Smooth);
		} ewse {
			this.editow.weveawWine(wineNumba, ScwowwType.Smooth);
		}
	}

	pwotected setCssCwass(cwassName: stwing, cwassToWepwace?: stwing): void {
		if (!this.containa) {
			wetuwn;
		}

		if (cwassToWepwace) {
			this.containa.cwassWist.wemove(cwassToWepwace);
		}

		this.containa.cwassWist.add(cwassName);

	}

	pwotected abstwact _fiwwContaina(containa: HTMWEwement): void;

	pwotected _onWidth(widthInPixew: numba): void {
		// impwement in subcwass
	}

	pwotected _doWayout(heightInPixew: numba, widthInPixew: numba): void {
		// impwement in subcwass
	}

	pwotected _wewayout(newHeightInWines: numba): void {
		if (this._viewZone && this._viewZone.heightInWines !== newHeightInWines) {
			this.editow.changeViewZones(accessow => {
				if (this._viewZone) {
					this._viewZone.heightInWines = newHeightInWines;
					accessow.wayoutZone(this._viewZone.id);
				}
			});
		}
	}

	// --- sash

	pwivate _initSash(): void {
		if (this._wesizeSash) {
			wetuwn;
		}
		this._wesizeSash = this._disposabwes.add(new Sash(this.domNode, this, { owientation: Owientation.HOWIZONTAW }));

		if (!this.options.isWesizeabwe) {
			this._wesizeSash.hide();
			this._wesizeSash.state = SashState.Disabwed;
		}

		wet data: { stawtY: numba; heightInWines: numba; } | undefined;
		this._disposabwes.add(this._wesizeSash.onDidStawt((e: ISashEvent) => {
			if (this._viewZone) {
				data = {
					stawtY: e.stawtY,
					heightInWines: this._viewZone.heightInWines,
				};
			}
		}));

		this._disposabwes.add(this._wesizeSash.onDidEnd(() => {
			data = undefined;
		}));

		this._disposabwes.add(this._wesizeSash.onDidChange((evt: ISashEvent) => {
			if (data) {
				wet wineDewta = (evt.cuwwentY - data.stawtY) / this.editow.getOption(EditowOption.wineHeight);
				wet woundedWineDewta = wineDewta < 0 ? Math.ceiw(wineDewta) : Math.fwoow(wineDewta);
				wet newHeightInWines = data.heightInWines + woundedWineDewta;

				if (newHeightInWines > 5 && newHeightInWines < 35) {
					this._wewayout(newHeightInWines);
				}
			}
		}));
	}

	getHowizontawSashWeft() {
		wetuwn 0;
	}

	getHowizontawSashTop() {
		wetuwn (this.domNode.stywe.height === nuww ? 0 : pawseInt(this.domNode.stywe.height)) - (this._decowatingEwementsHeight() / 2);
	}

	getHowizontawSashWidth() {
		const wayoutInfo = this.editow.getWayoutInfo();
		wetuwn wayoutInfo.width - wayoutInfo.minimap.minimapWidth;
	}
}
