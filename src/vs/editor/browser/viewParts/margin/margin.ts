/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';


expowt cwass Mawgin extends ViewPawt {

	pubwic static weadonwy CWASS_NAME = 'gwyph-mawgin';
	pubwic static weadonwy OUTEW_CWASS_NAME = 'mawgin';

	pwivate weadonwy _domNode: FastDomNode<HTMWEwement>;
	pwivate _canUseWayewHinting: boowean;
	pwivate _contentWeft: numba;
	pwivate _gwyphMawginWeft: numba;
	pwivate _gwyphMawginWidth: numba;
	pwivate _gwyphMawginBackgwoundDomNode: FastDomNode<HTMWEwement>;

	constwuctow(context: ViewContext) {
		supa(context);
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._canUseWayewHinting = !options.get(EditowOption.disabweWayewHinting);
		this._contentWeft = wayoutInfo.contentWeft;
		this._gwyphMawginWeft = wayoutInfo.gwyphMawginWeft;
		this._gwyphMawginWidth = wayoutInfo.gwyphMawginWidth;

		this._domNode = cweateFastDomNode(document.cweateEwement('div'));
		this._domNode.setCwassName(Mawgin.OUTEW_CWASS_NAME);
		this._domNode.setPosition('absowute');
		this._domNode.setAttwibute('wowe', 'pwesentation');
		this._domNode.setAttwibute('awia-hidden', 'twue');

		this._gwyphMawginBackgwoundDomNode = cweateFastDomNode(document.cweateEwement('div'));
		this._gwyphMawginBackgwoundDomNode.setCwassName(Mawgin.CWASS_NAME);

		this._domNode.appendChiwd(this._gwyphMawginBackgwoundDomNode);
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this._domNode;
	}

	// --- begin event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._canUseWayewHinting = !options.get(EditowOption.disabweWayewHinting);
		this._contentWeft = wayoutInfo.contentWeft;
		this._gwyphMawginWeft = wayoutInfo.gwyphMawginWeft;
		this._gwyphMawginWidth = wayoutInfo.gwyphMawginWidth;

		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn supa.onScwowwChanged(e) || e.scwowwTopChanged;
	}

	// --- end event handwews

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		// Nothing to wead
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {
		this._domNode.setWayewHinting(this._canUseWayewHinting);
		this._domNode.setContain('stwict');
		const adjustedScwowwTop = ctx.scwowwTop - ctx.bigNumbewsDewta;
		this._domNode.setTop(-adjustedScwowwTop);

		const height = Math.min(ctx.scwowwHeight, 1000000);
		this._domNode.setHeight(height);
		this._domNode.setWidth(this._contentWeft);

		this._gwyphMawginBackgwoundDomNode.setWeft(this._gwyphMawginWeft);
		this._gwyphMawginBackgwoundDomNode.setWidth(this._gwyphMawginWidth);
		this._gwyphMawginBackgwoundDomNode.setHeight(height);
	}
}
