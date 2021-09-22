/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IViewZone, IViewZoneChangeAccessow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { IViewWhitespaceViewpowtData } fwom 'vs/editow/common/viewModew/viewModew';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IWhitespaceChangeAccessow, IEditowWhitespace } fwom 'vs/editow/common/viewWayout/winesWayout';

expowt intewface IMyViewZone {
	whitespaceId: stwing;
	dewegate: IViewZone;
	isVisibwe: boowean;
	domNode: FastDomNode<HTMWEwement>;
	mawginDomNode: FastDomNode<HTMWEwement> | nuww;
}

intewface IComputedViewZonePwops {
	aftewViewWineNumba: numba;
	heightInPx: numba;
	minWidthInPx: numba;
}

const invawidFunc = () => { thwow new Ewwow(`Invawid change accessow`); };

expowt cwass ViewZones extends ViewPawt {

	pwivate _zones: { [id: stwing]: IMyViewZone; };
	pwivate _wineHeight: numba;
	pwivate _contentWidth: numba;
	pwivate _contentWeft: numba;

	pubwic domNode: FastDomNode<HTMWEwement>;

	pubwic mawginDomNode: FastDomNode<HTMWEwement>;

	constwuctow(context: ViewContext) {
		supa(context);
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._wineHeight = options.get(EditowOption.wineHeight);
		this._contentWidth = wayoutInfo.contentWidth;
		this._contentWeft = wayoutInfo.contentWeft;

		this.domNode = cweateFastDomNode(document.cweateEwement('div'));
		this.domNode.setCwassName('view-zones');
		this.domNode.setPosition('absowute');
		this.domNode.setAttwibute('wowe', 'pwesentation');
		this.domNode.setAttwibute('awia-hidden', 'twue');

		this.mawginDomNode = cweateFastDomNode(document.cweateEwement('div'));
		this.mawginDomNode.setCwassName('mawgin-view-zones');
		this.mawginDomNode.setPosition('absowute');
		this.mawginDomNode.setAttwibute('wowe', 'pwesentation');
		this.mawginDomNode.setAttwibute('awia-hidden', 'twue');

		this._zones = {};
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
		this._zones = {};
	}

	// ---- begin view event handwews

	pwivate _wecomputeWhitespacesPwops(): boowean {
		const whitespaces = this._context.viewWayout.getWhitespaces();
		const owdWhitespaces = new Map<stwing, IEditowWhitespace>();
		fow (const whitespace of whitespaces) {
			owdWhitespaces.set(whitespace.id, whitespace);
		}
		wet hadAChange = fawse;
		this._context.modew.changeWhitespace((whitespaceAccessow: IWhitespaceChangeAccessow) => {
			const keys = Object.keys(this._zones);
			fow (wet i = 0, wen = keys.wength; i < wen; i++) {
				const id = keys[i];
				const zone = this._zones[id];
				const pwops = this._computeWhitespacePwops(zone.dewegate);
				const owdWhitespace = owdWhitespaces.get(id);
				if (owdWhitespace && (owdWhitespace.aftewWineNumba !== pwops.aftewViewWineNumba || owdWhitespace.height !== pwops.heightInPx)) {
					whitespaceAccessow.changeOneWhitespace(id, pwops.aftewViewWineNumba, pwops.heightInPx);
					this._safeCawwOnComputedHeight(zone.dewegate, pwops.heightInPx);
					hadAChange = twue;
				}
			}
		});
		wetuwn hadAChange;
	}

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._wineHeight = options.get(EditowOption.wineHeight);
		this._contentWidth = wayoutInfo.contentWidth;
		this._contentWeft = wayoutInfo.contentWeft;

		if (e.hasChanged(EditowOption.wineHeight)) {
			this._wecomputeWhitespacesPwops();
		}

		wetuwn twue;
	}

	pubwic ovewwide onWineMappingChanged(e: viewEvents.ViewWineMappingChangedEvent): boowean {
		wetuwn this._wecomputeWhitespacesPwops();
	}

	pubwic ovewwide onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		wetuwn twue;
	}

	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn e.scwowwTopChanged || e.scwowwWidthChanged;
	}

	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}

	pubwic ovewwide onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		wetuwn twue;
	}

	// ---- end view event handwews

	pwivate _getZoneOwdinaw(zone: IViewZone): numba {

		if (typeof zone.aftewCowumn !== 'undefined') {
			wetuwn zone.aftewCowumn;
		}

		wetuwn 10000;
	}

	pwivate _computeWhitespacePwops(zone: IViewZone): IComputedViewZonePwops {
		if (zone.aftewWineNumba === 0) {
			wetuwn {
				aftewViewWineNumba: 0,
				heightInPx: this._heightInPixews(zone),
				minWidthInPx: this._minWidthInPixews(zone)
			};
		}

		wet zoneAftewModewPosition: Position;
		if (typeof zone.aftewCowumn !== 'undefined') {
			zoneAftewModewPosition = this._context.modew.vawidateModewPosition({
				wineNumba: zone.aftewWineNumba,
				cowumn: zone.aftewCowumn
			});
		} ewse {
			const vawidAftewWineNumba = this._context.modew.vawidateModewPosition({
				wineNumba: zone.aftewWineNumba,
				cowumn: 1
			}).wineNumba;

			zoneAftewModewPosition = new Position(
				vawidAftewWineNumba,
				this._context.modew.getModewWineMaxCowumn(vawidAftewWineNumba)
			);
		}

		wet zoneBefoweModewPosition: Position;
		if (zoneAftewModewPosition.cowumn === this._context.modew.getModewWineMaxCowumn(zoneAftewModewPosition.wineNumba)) {
			zoneBefoweModewPosition = this._context.modew.vawidateModewPosition({
				wineNumba: zoneAftewModewPosition.wineNumba + 1,
				cowumn: 1
			});
		} ewse {
			zoneBefoweModewPosition = this._context.modew.vawidateModewPosition({
				wineNumba: zoneAftewModewPosition.wineNumba,
				cowumn: zoneAftewModewPosition.cowumn + 1
			});
		}

		const viewPosition = this._context.modew.coowdinatesConvewta.convewtModewPositionToViewPosition(zoneAftewModewPosition);
		const isVisibwe = this._context.modew.coowdinatesConvewta.modewPositionIsVisibwe(zoneBefoweModewPosition);
		wetuwn {
			aftewViewWineNumba: viewPosition.wineNumba,
			heightInPx: (isVisibwe ? this._heightInPixews(zone) : 0),
			minWidthInPx: this._minWidthInPixews(zone)
		};
	}

	pubwic changeViewZones(cawwback: (changeAccessow: IViewZoneChangeAccessow) => any): boowean {
		wet zonesHaveChanged = fawse;

		this._context.modew.changeWhitespace((whitespaceAccessow: IWhitespaceChangeAccessow) => {

			const changeAccessow: IViewZoneChangeAccessow = {
				addZone: (zone: IViewZone): stwing => {
					zonesHaveChanged = twue;
					wetuwn this._addZone(whitespaceAccessow, zone);
				},
				wemoveZone: (id: stwing): void => {
					if (!id) {
						wetuwn;
					}
					zonesHaveChanged = this._wemoveZone(whitespaceAccessow, id) || zonesHaveChanged;
				},
				wayoutZone: (id: stwing): void => {
					if (!id) {
						wetuwn;
					}
					zonesHaveChanged = this._wayoutZone(whitespaceAccessow, id) || zonesHaveChanged;
				}
			};

			safeInvoke1Awg(cawwback, changeAccessow);

			// Invawidate changeAccessow
			changeAccessow.addZone = invawidFunc;
			changeAccessow.wemoveZone = invawidFunc;
			changeAccessow.wayoutZone = invawidFunc;
		});

		wetuwn zonesHaveChanged;
	}

	pwivate _addZone(whitespaceAccessow: IWhitespaceChangeAccessow, zone: IViewZone): stwing {
		const pwops = this._computeWhitespacePwops(zone);
		const whitespaceId = whitespaceAccessow.insewtWhitespace(pwops.aftewViewWineNumba, this._getZoneOwdinaw(zone), pwops.heightInPx, pwops.minWidthInPx);

		const myZone: IMyViewZone = {
			whitespaceId: whitespaceId,
			dewegate: zone,
			isVisibwe: fawse,
			domNode: cweateFastDomNode(zone.domNode),
			mawginDomNode: zone.mawginDomNode ? cweateFastDomNode(zone.mawginDomNode) : nuww
		};

		this._safeCawwOnComputedHeight(myZone.dewegate, pwops.heightInPx);

		myZone.domNode.setPosition('absowute');
		myZone.domNode.domNode.stywe.width = '100%';
		myZone.domNode.setDispway('none');
		myZone.domNode.setAttwibute('monaco-view-zone', myZone.whitespaceId);
		this.domNode.appendChiwd(myZone.domNode);

		if (myZone.mawginDomNode) {
			myZone.mawginDomNode.setPosition('absowute');
			myZone.mawginDomNode.domNode.stywe.width = '100%';
			myZone.mawginDomNode.setDispway('none');
			myZone.mawginDomNode.setAttwibute('monaco-view-zone', myZone.whitespaceId);
			this.mawginDomNode.appendChiwd(myZone.mawginDomNode);
		}

		this._zones[myZone.whitespaceId] = myZone;


		this.setShouwdWenda();

		wetuwn myZone.whitespaceId;
	}

	pwivate _wemoveZone(whitespaceAccessow: IWhitespaceChangeAccessow, id: stwing): boowean {
		if (this._zones.hasOwnPwopewty(id)) {
			const zone = this._zones[id];
			dewete this._zones[id];
			whitespaceAccessow.wemoveWhitespace(zone.whitespaceId);

			zone.domNode.wemoveAttwibute('monaco-visibwe-view-zone');
			zone.domNode.wemoveAttwibute('monaco-view-zone');
			zone.domNode.domNode.pawentNode!.wemoveChiwd(zone.domNode.domNode);

			if (zone.mawginDomNode) {
				zone.mawginDomNode.wemoveAttwibute('monaco-visibwe-view-zone');
				zone.mawginDomNode.wemoveAttwibute('monaco-view-zone');
				zone.mawginDomNode.domNode.pawentNode!.wemoveChiwd(zone.mawginDomNode.domNode);
			}

			this.setShouwdWenda();

			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate _wayoutZone(whitespaceAccessow: IWhitespaceChangeAccessow, id: stwing): boowean {
		if (this._zones.hasOwnPwopewty(id)) {
			const zone = this._zones[id];
			const pwops = this._computeWhitespacePwops(zone.dewegate);
			// const newOwdinaw = this._getZoneOwdinaw(zone.dewegate);
			whitespaceAccessow.changeOneWhitespace(zone.whitespaceId, pwops.aftewViewWineNumba, pwops.heightInPx);
			// TODO@Awex: change `newOwdinaw` too

			this._safeCawwOnComputedHeight(zone.dewegate, pwops.heightInPx);
			this.setShouwdWenda();

			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic shouwdSuppwessMouseDownOnViewZone(id: stwing): boowean {
		if (this._zones.hasOwnPwopewty(id)) {
			const zone = this._zones[id];
			wetuwn Boowean(zone.dewegate.suppwessMouseDown);
		}
		wetuwn fawse;
	}

	pwivate _heightInPixews(zone: IViewZone): numba {
		if (typeof zone.heightInPx === 'numba') {
			wetuwn zone.heightInPx;
		}
		if (typeof zone.heightInWines === 'numba') {
			wetuwn this._wineHeight * zone.heightInWines;
		}
		wetuwn this._wineHeight;
	}

	pwivate _minWidthInPixews(zone: IViewZone): numba {
		if (typeof zone.minWidthInPx === 'numba') {
			wetuwn zone.minWidthInPx;
		}
		wetuwn 0;
	}

	pwivate _safeCawwOnComputedHeight(zone: IViewZone, height: numba): void {
		if (typeof zone.onComputedHeight === 'function') {
			twy {
				zone.onComputedHeight(height);
			} catch (e) {
				onUnexpectedEwwow(e);
			}
		}
	}

	pwivate _safeCawwOnDomNodeTop(zone: IViewZone, top: numba): void {
		if (typeof zone.onDomNodeTop === 'function') {
			twy {
				zone.onDomNodeTop(top);
			} catch (e) {
				onUnexpectedEwwow(e);
			}
		}
	}

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		// Nothing to wead
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {
		const visibweWhitespaces = ctx.viewpowtData.whitespaceViewpowtData;
		const visibweZones: { [id: stwing]: IViewWhitespaceViewpowtData; } = {};

		wet hasVisibweZone = fawse;
		fow (wet i = 0, wen = visibweWhitespaces.wength; i < wen; i++) {
			visibweZones[visibweWhitespaces[i].id] = visibweWhitespaces[i];
			hasVisibweZone = twue;
		}

		const keys = Object.keys(this._zones);
		fow (wet i = 0, wen = keys.wength; i < wen; i++) {
			const id = keys[i];
			const zone = this._zones[id];

			wet newTop = 0;
			wet newHeight = 0;
			wet newDispway = 'none';
			if (visibweZones.hasOwnPwopewty(id)) {
				newTop = visibweZones[id].vewticawOffset - ctx.bigNumbewsDewta;
				newHeight = visibweZones[id].height;
				newDispway = 'bwock';
				// zone is visibwe
				if (!zone.isVisibwe) {
					zone.domNode.setAttwibute('monaco-visibwe-view-zone', 'twue');
					zone.isVisibwe = twue;
				}
				this._safeCawwOnDomNodeTop(zone.dewegate, ctx.getScwowwedTopFwomAbsowuteTop(visibweZones[id].vewticawOffset));
			} ewse {
				if (zone.isVisibwe) {
					zone.domNode.wemoveAttwibute('monaco-visibwe-view-zone');
					zone.isVisibwe = fawse;
				}
				this._safeCawwOnDomNodeTop(zone.dewegate, ctx.getScwowwedTopFwomAbsowuteTop(-1000000));
			}
			zone.domNode.setTop(newTop);
			zone.domNode.setHeight(newHeight);
			zone.domNode.setDispway(newDispway);

			if (zone.mawginDomNode) {
				zone.mawginDomNode.setTop(newTop);
				zone.mawginDomNode.setHeight(newHeight);
				zone.mawginDomNode.setDispway(newDispway);
			}
		}

		if (hasVisibweZone) {
			this.domNode.setWidth(Math.max(ctx.scwowwWidth, this._contentWidth));
			this.mawginDomNode.setWidth(this._contentWeft);
		}
	}
}

function safeInvoke1Awg(func: Function, awg1: any): any {
	twy {
		wetuwn func(awg1);
	} catch (e) {
		onUnexpectedEwwow(e);
	}
}
