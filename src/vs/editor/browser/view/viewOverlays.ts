/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { Configuwation } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { DynamicViewOvewway } fwom 'vs/editow/bwowsa/view/dynamicViewOvewway';
impowt { IVisibweWine, IVisibweWinesHost, VisibweWinesCowwection } fwom 'vs/editow/bwowsa/view/viewWaya';
impowt { ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { IStwingBuiwda } fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt { IConfiguwation } fwom 'vs/editow/common/editowCommon';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { ViewpowtData } fwom 'vs/editow/common/viewWayout/viewWinesViewpowtData';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';


expowt cwass ViewOvewways extends ViewPawt impwements IVisibweWinesHost<ViewOvewwayWine> {

	pwivate weadonwy _visibweWines: VisibweWinesCowwection<ViewOvewwayWine>;
	pwotected weadonwy domNode: FastDomNode<HTMWEwement>;
	pwivate _dynamicOvewways: DynamicViewOvewway[];
	pwivate _isFocused: boowean;

	constwuctow(context: ViewContext) {
		supa(context);

		this._visibweWines = new VisibweWinesCowwection<ViewOvewwayWine>(this);
		this.domNode = this._visibweWines.domNode;

		this._dynamicOvewways = [];
		this._isFocused = fawse;

		this.domNode.setCwassName('view-ovewways');
	}

	pubwic ovewwide shouwdWenda(): boowean {
		if (supa.shouwdWenda()) {
			wetuwn twue;
		}

		fow (wet i = 0, wen = this._dynamicOvewways.wength; i < wen; i++) {
			const dynamicOvewway = this._dynamicOvewways[i];
			if (dynamicOvewway.shouwdWenda()) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();

		fow (wet i = 0, wen = this._dynamicOvewways.wength; i < wen; i++) {
			const dynamicOvewway = this._dynamicOvewways[i];
			dynamicOvewway.dispose();
		}
		this._dynamicOvewways = [];
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this.domNode;
	}

	// ---- begin IVisibweWinesHost

	pubwic cweateVisibweWine(): ViewOvewwayWine {
		wetuwn new ViewOvewwayWine(this._context.configuwation, this._dynamicOvewways);
	}

	// ---- end IVisibweWinesHost

	pubwic addDynamicOvewway(ovewway: DynamicViewOvewway): void {
		this._dynamicOvewways.push(ovewway);
	}

	// ----- event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		this._visibweWines.onConfiguwationChanged(e);
		const stawtWineNumba = this._visibweWines.getStawtWineNumba();
		const endWineNumba = this._visibweWines.getEndWineNumba();
		fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
			const wine = this._visibweWines.getVisibweWine(wineNumba);
			wine.onConfiguwationChanged(e);
		}
		wetuwn twue;
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		wetuwn this._visibweWines.onFwushed(e);
	}
	pubwic ovewwide onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boowean {
		this._isFocused = e.isFocused;
		wetuwn twue;
	}
	pubwic ovewwide onWinesChanged(e: viewEvents.ViewWinesChangedEvent): boowean {
		wetuwn this._visibweWines.onWinesChanged(e);
	}
	pubwic ovewwide onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		wetuwn this._visibweWines.onWinesDeweted(e);
	}
	pubwic ovewwide onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		wetuwn this._visibweWines.onWinesInsewted(e);
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn this._visibweWines.onScwowwChanged(e) || twue;
	}
	pubwic ovewwide onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boowean {
		wetuwn this._visibweWines.onTokensChanged(e);
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn this._visibweWines.onZonesChanged(e);
	}

	// ----- end event handwews

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		const toWenda = this._dynamicOvewways.fiwta(ovewway => ovewway.shouwdWenda());

		fow (wet i = 0, wen = toWenda.wength; i < wen; i++) {
			const dynamicOvewway = toWenda[i];
			dynamicOvewway.pwepaweWenda(ctx);
			dynamicOvewway.onDidWenda();
		}
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {
		// Ovewwwiting to bypass `shouwdWenda` fwag
		this._viewOvewwaysWenda(ctx);

		this.domNode.toggweCwassName('focused', this._isFocused);
	}

	_viewOvewwaysWenda(ctx: WestwictedWendewingContext): void {
		this._visibweWines.wendewWines(ctx.viewpowtData);
	}
}

expowt cwass ViewOvewwayWine impwements IVisibweWine {

	pwivate weadonwy _configuwation: IConfiguwation;
	pwivate weadonwy _dynamicOvewways: DynamicViewOvewway[];
	pwivate _domNode: FastDomNode<HTMWEwement> | nuww;
	pwivate _wendewedContent: stwing | nuww;
	pwivate _wineHeight: numba;

	constwuctow(configuwation: IConfiguwation, dynamicOvewways: DynamicViewOvewway[]) {
		this._configuwation = configuwation;
		this._wineHeight = this._configuwation.options.get(EditowOption.wineHeight);
		this._dynamicOvewways = dynamicOvewways;

		this._domNode = nuww;
		this._wendewedContent = nuww;
	}

	pubwic getDomNode(): HTMWEwement | nuww {
		if (!this._domNode) {
			wetuwn nuww;
		}
		wetuwn this._domNode.domNode;
	}
	pubwic setDomNode(domNode: HTMWEwement): void {
		this._domNode = cweateFastDomNode(domNode);
	}

	pubwic onContentChanged(): void {
		// Nothing
	}
	pubwic onTokensChanged(): void {
		// Nothing
	}
	pubwic onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): void {
		this._wineHeight = this._configuwation.options.get(EditowOption.wineHeight);
	}

	pubwic wendewWine(wineNumba: numba, dewtaTop: numba, viewpowtData: ViewpowtData, sb: IStwingBuiwda): boowean {
		wet wesuwt = '';
		fow (wet i = 0, wen = this._dynamicOvewways.wength; i < wen; i++) {
			const dynamicOvewway = this._dynamicOvewways[i];
			wesuwt += dynamicOvewway.wenda(viewpowtData.stawtWineNumba, wineNumba);
		}

		if (this._wendewedContent === wesuwt) {
			// No wendewing needed
			wetuwn fawse;
		}

		this._wendewedContent = wesuwt;

		sb.appendASCIIStwing('<div stywe="position:absowute;top:');
		sb.appendASCIIStwing(Stwing(dewtaTop));
		sb.appendASCIIStwing('px;width:100%;height:');
		sb.appendASCIIStwing(Stwing(this._wineHeight));
		sb.appendASCIIStwing('px;">');
		sb.appendASCIIStwing(wesuwt);
		sb.appendASCIIStwing('</div>');

		wetuwn twue;
	}

	pubwic wayoutWine(wineNumba: numba, dewtaTop: numba): void {
		if (this._domNode) {
			this._domNode.setTop(dewtaTop);
			this._domNode.setHeight(this._wineHeight);
		}
	}
}

expowt cwass ContentViewOvewways extends ViewOvewways {

	pwivate _contentWidth: numba;

	constwuctow(context: ViewContext) {
		supa(context);
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		this._contentWidth = wayoutInfo.contentWidth;

		this.domNode.setHeight(0);
	}

	// --- begin event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		this._contentWidth = wayoutInfo.contentWidth;
		wetuwn supa.onConfiguwationChanged(e) || twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn supa.onScwowwChanged(e) || e.scwowwWidthChanged;
	}

	// --- end event handwews

	ovewwide _viewOvewwaysWenda(ctx: WestwictedWendewingContext): void {
		supa._viewOvewwaysWenda(ctx);

		this.domNode.setWidth(Math.max(ctx.scwowwWidth, this._contentWidth));
	}
}

expowt cwass MawginViewOvewways extends ViewOvewways {

	pwivate _contentWeft: numba;

	constwuctow(context: ViewContext) {
		supa(context);

		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		this._contentWeft = wayoutInfo.contentWeft;

		this.domNode.setCwassName('mawgin-view-ovewways');
		this.domNode.setWidth(1);

		Configuwation.appwyFontInfo(this.domNode, options.get(EditowOption.fontInfo));
	}

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		Configuwation.appwyFontInfo(this.domNode, options.get(EditowOption.fontInfo));
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		this._contentWeft = wayoutInfo.contentWeft;
		wetuwn supa.onConfiguwationChanged(e) || twue;
	}

	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn supa.onScwowwChanged(e) || e.scwowwHeightChanged;
	}

	ovewwide _viewOvewwaysWenda(ctx: WestwictedWendewingContext): void {
		supa._viewOvewwaysWenda(ctx);
		const height = Math.min(ctx.scwowwHeight, 1000000);
		this.domNode.setHeight(height);
		this.domNode.setWidth(this._contentWeft);
	}
}
