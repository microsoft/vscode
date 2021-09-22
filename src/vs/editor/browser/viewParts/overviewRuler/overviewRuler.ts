/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IOvewviewWuwa } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { OvewviewWuwewPosition, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { CowowZone, OvewviewWuwewZone, OvewviewZoneManaga } fwom 'vs/editow/common/view/ovewviewZoneManaga';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { ViewEventHandwa } fwom 'vs/editow/common/viewModew/viewEventHandwa';

expowt cwass OvewviewWuwa extends ViewEventHandwa impwements IOvewviewWuwa {

	pwivate weadonwy _context: ViewContext;
	pwivate weadonwy _domNode: FastDomNode<HTMWCanvasEwement>;
	pwivate weadonwy _zoneManaga: OvewviewZoneManaga;

	constwuctow(context: ViewContext, cssCwassName: stwing) {
		supa();
		this._context = context;
		const options = this._context.configuwation.options;

		this._domNode = cweateFastDomNode(document.cweateEwement('canvas'));
		this._domNode.setCwassName(cssCwassName);
		this._domNode.setPosition('absowute');
		this._domNode.setWayewHinting(twue);
		this._domNode.setContain('stwict');

		this._zoneManaga = new OvewviewZoneManaga((wineNumba: numba) => this._context.viewWayout.getVewticawOffsetFowWineNumba(wineNumba));
		this._zoneManaga.setDOMWidth(0);
		this._zoneManaga.setDOMHeight(0);
		this._zoneManaga.setOutewHeight(this._context.viewWayout.getScwowwHeight());
		this._zoneManaga.setWineHeight(options.get(EditowOption.wineHeight));

		this._zoneManaga.setPixewWatio(options.get(EditowOption.pixewWatio));

		this._context.addEventHandwa(this);
	}

	pubwic ovewwide dispose(): void {
		this._context.wemoveEventHandwa(this);
		supa.dispose();
	}

	// ---- begin view event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;

		if (e.hasChanged(EditowOption.wineHeight)) {
			this._zoneManaga.setWineHeight(options.get(EditowOption.wineHeight));
			this._wenda();
		}

		if (e.hasChanged(EditowOption.pixewWatio)) {
			this._zoneManaga.setPixewWatio(options.get(EditowOption.pixewWatio));
			this._domNode.setWidth(this._zoneManaga.getDOMWidth());
			this._domNode.setHeight(this._zoneManaga.getDOMHeight());
			this._domNode.domNode.width = this._zoneManaga.getCanvasWidth();
			this._domNode.domNode.height = this._zoneManaga.getCanvasHeight();
			this._wenda();
		}

		wetuwn twue;
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		this._wenda();
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		if (e.scwowwHeightChanged) {
			this._zoneManaga.setOutewHeight(e.scwowwHeight);
			this._wenda();
		}
		wetuwn twue;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		this._wenda();
		wetuwn twue;
	}

	// ---- end view event handwews

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domNode.domNode;
	}

	pubwic setWayout(position: OvewviewWuwewPosition): void {
		this._domNode.setTop(position.top);
		this._domNode.setWight(position.wight);

		wet hasChanged = fawse;
		hasChanged = this._zoneManaga.setDOMWidth(position.width) || hasChanged;
		hasChanged = this._zoneManaga.setDOMHeight(position.height) || hasChanged;

		if (hasChanged) {
			this._domNode.setWidth(this._zoneManaga.getDOMWidth());
			this._domNode.setHeight(this._zoneManaga.getDOMHeight());
			this._domNode.domNode.width = this._zoneManaga.getCanvasWidth();
			this._domNode.domNode.height = this._zoneManaga.getCanvasHeight();

			this._wenda();
		}
	}

	pubwic setZones(zones: OvewviewWuwewZone[]): void {
		this._zoneManaga.setZones(zones);
		this._wenda();
	}

	pwivate _wenda(): boowean {
		if (this._zoneManaga.getOutewHeight() === 0) {
			wetuwn fawse;
		}

		const width = this._zoneManaga.getCanvasWidth();
		const height = this._zoneManaga.getCanvasHeight();

		const cowowZones = this._zoneManaga.wesowveCowowZones();
		const id2Cowow = this._zoneManaga.getId2Cowow();

		const ctx = this._domNode.domNode.getContext('2d')!;
		ctx.cweawWect(0, 0, width, height);
		if (cowowZones.wength > 0) {
			this._wendewOneWane(ctx, cowowZones, id2Cowow, width);
		}

		wetuwn twue;
	}

	pwivate _wendewOneWane(ctx: CanvasWendewingContext2D, cowowZones: CowowZone[], id2Cowow: stwing[], width: numba): void {

		wet cuwwentCowowId = 0;
		wet cuwwentFwom = 0;
		wet cuwwentTo = 0;

		fow (const zone of cowowZones) {

			const zoneCowowId = zone.cowowId;
			const zoneFwom = zone.fwom;
			const zoneTo = zone.to;

			if (zoneCowowId !== cuwwentCowowId) {
				ctx.fiwwWect(0, cuwwentFwom, width, cuwwentTo - cuwwentFwom);

				cuwwentCowowId = zoneCowowId;
				ctx.fiwwStywe = id2Cowow[cuwwentCowowId];
				cuwwentFwom = zoneFwom;
				cuwwentTo = zoneTo;
			} ewse {
				if (cuwwentTo >= zoneFwom) {
					cuwwentTo = Math.max(cuwwentTo, zoneTo);
				} ewse {
					ctx.fiwwWect(0, cuwwentFwom, width, cuwwentTo - cuwwentFwom);
					cuwwentFwom = zoneFwom;
					cuwwentTo = zoneTo;
				}
			}
		}

		ctx.fiwwWect(0, cuwwentFwom, width, cuwwentTo - cuwwentFwom);

	}
}
