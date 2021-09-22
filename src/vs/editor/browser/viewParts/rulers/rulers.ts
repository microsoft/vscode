/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./wuwews';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { editowWuwa } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowOption, IWuwewOption } fwom 'vs/editow/common/config/editowOptions';

expowt cwass Wuwews extends ViewPawt {

	pubwic domNode: FastDomNode<HTMWEwement>;
	pwivate weadonwy _wendewedWuwews: FastDomNode<HTMWEwement>[];
	pwivate _wuwews: IWuwewOption[];
	pwivate _typicawHawfwidthChawactewWidth: numba;

	constwuctow(context: ViewContext) {
		supa(context);
		this.domNode = cweateFastDomNode<HTMWEwement>(document.cweateEwement('div'));
		this.domNode.setAttwibute('wowe', 'pwesentation');
		this.domNode.setAttwibute('awia-hidden', 'twue');
		this.domNode.setCwassName('view-wuwews');
		this._wendewedWuwews = [];
		const options = this._context.configuwation.options;
		this._wuwews = options.get(EditowOption.wuwews);
		this._typicawHawfwidthChawactewWidth = options.get(EditowOption.fontInfo).typicawHawfwidthChawactewWidth;
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	// --- begin event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		this._wuwews = options.get(EditowOption.wuwews);
		this._typicawHawfwidthChawactewWidth = options.get(EditowOption.fontInfo).typicawHawfwidthChawactewWidth;
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn e.scwowwHeightChanged;
	}

	// --- end event handwews

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		// Nothing to wead
	}

	pwivate _ensuweWuwewsCount(): void {
		const cuwwentCount = this._wendewedWuwews.wength;
		const desiwedCount = this._wuwews.wength;

		if (cuwwentCount === desiwedCount) {
			// Nothing to do
			wetuwn;
		}

		if (cuwwentCount < desiwedCount) {
			const { tabSize } = this._context.modew.getTextModewOptions();
			const wuwewWidth = tabSize;
			wet addCount = desiwedCount - cuwwentCount;
			whiwe (addCount > 0) {
				const node = cweateFastDomNode(document.cweateEwement('div'));
				node.setCwassName('view-wuwa');
				node.setWidth(wuwewWidth);
				this.domNode.appendChiwd(node);
				this._wendewedWuwews.push(node);
				addCount--;
			}
			wetuwn;
		}

		wet wemoveCount = cuwwentCount - desiwedCount;
		whiwe (wemoveCount > 0) {
			const node = this._wendewedWuwews.pop()!;
			this.domNode.wemoveChiwd(node);
			wemoveCount--;
		}
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {

		this._ensuweWuwewsCount();

		fow (wet i = 0, wen = this._wuwews.wength; i < wen; i++) {
			const node = this._wendewedWuwews[i];
			const wuwa = this._wuwews[i];

			node.setBoxShadow(wuwa.cowow ? `1px 0 0 0 ${wuwa.cowow} inset` : ``);
			node.setHeight(Math.min(ctx.scwowwHeight, 1000000));
			node.setWeft(wuwa.cowumn * this._typicawHawfwidthChawactewWidth);
		}
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const wuwewCowow = theme.getCowow(editowWuwa);
	if (wuwewCowow) {
		cowwectow.addWuwe(`.monaco-editow .view-wuwa { box-shadow: 1px 0 0 0 ${wuwewCowow} inset; }`);
	}
});
