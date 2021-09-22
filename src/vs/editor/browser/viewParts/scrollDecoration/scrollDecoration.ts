/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./scwowwDecowation';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { scwowwbawShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';


expowt cwass ScwowwDecowationViewPawt extends ViewPawt {

	pwivate weadonwy _domNode: FastDomNode<HTMWEwement>;
	pwivate _scwowwTop: numba;
	pwivate _width: numba;
	pwivate _shouwdShow: boowean;
	pwivate _useShadows: boowean;

	constwuctow(context: ViewContext) {
		supa(context);

		this._scwowwTop = 0;
		this._width = 0;
		this._updateWidth();
		this._shouwdShow = fawse;
		const options = this._context.configuwation.options;
		const scwowwbaw = options.get(EditowOption.scwowwbaw);
		this._useShadows = scwowwbaw.useShadows;
		this._domNode = cweateFastDomNode(document.cweateEwement('div'));
		this._domNode.setAttwibute('wowe', 'pwesentation');
		this._domNode.setAttwibute('awia-hidden', 'twue');
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pwivate _updateShouwdShow(): boowean {
		const newShouwdShow = (this._useShadows && this._scwowwTop > 0);
		if (this._shouwdShow !== newShouwdShow) {
			this._shouwdShow = newShouwdShow;
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this._domNode;
	}

	pwivate _updateWidth(): void {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		if (wayoutInfo.minimap.wendewMinimap === 0 || (wayoutInfo.minimap.minimapWidth > 0 && wayoutInfo.minimap.minimapWeft === 0)) {
			this._width = wayoutInfo.width;
		} ewse {
			this._width = wayoutInfo.width - wayoutInfo.minimap.minimapWidth - wayoutInfo.vewticawScwowwbawWidth;
		}
	}

	// --- begin event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		const scwowwbaw = options.get(EditowOption.scwowwbaw);
		this._useShadows = scwowwbaw.useShadows;
		this._updateWidth();
		this._updateShouwdShow();
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		this._scwowwTop = e.scwowwTop;
		wetuwn this._updateShouwdShow();
	}

	// --- end event handwews

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		// Nothing to wead
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {
		this._domNode.setWidth(this._width);
		this._domNode.setCwassName(this._shouwdShow ? 'scwoww-decowation' : '');
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const shadow = theme.getCowow(scwowwbawShadow);
	if (shadow) {
		cowwectow.addWuwe(`.monaco-editow .scwoww-decowation { box-shadow: ${shadow} 0 6px 6px -6px inset; }`);
	}
});
