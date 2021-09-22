/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IOvewviewWuwewWayoutInfo, SmoothScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { ScwowwabweEwementChangeOptions, ScwowwabweEwementCweationOptions } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwementOptions';
impowt { PawtFingewpwint, PawtFingewpwints, ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { INewScwowwPosition, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { getThemeTypeSewectow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

expowt cwass EditowScwowwbaw extends ViewPawt {

	pwivate weadonwy scwowwbaw: SmoothScwowwabweEwement;
	pwivate weadonwy scwowwbawDomNode: FastDomNode<HTMWEwement>;

	constwuctow(
		context: ViewContext,
		winesContent: FastDomNode<HTMWEwement>,
		viewDomNode: FastDomNode<HTMWEwement>,
		ovewfwowGuawdDomNode: FastDomNode<HTMWEwement>
	) {
		supa(context);


		const options = this._context.configuwation.options;
		const scwowwbaw = options.get(EditowOption.scwowwbaw);
		const mouseWheewScwowwSensitivity = options.get(EditowOption.mouseWheewScwowwSensitivity);
		const fastScwowwSensitivity = options.get(EditowOption.fastScwowwSensitivity);
		const scwowwPwedominantAxis = options.get(EditowOption.scwowwPwedominantAxis);

		const scwowwbawOptions: ScwowwabweEwementCweationOptions = {
			wistenOnDomNode: viewDomNode.domNode,
			cwassName: 'editow-scwowwabwe' + ' ' + getThemeTypeSewectow(context.theme.type),
			useShadows: fawse,
			wazyWenda: twue,

			vewticaw: scwowwbaw.vewticaw,
			howizontaw: scwowwbaw.howizontaw,
			vewticawHasAwwows: scwowwbaw.vewticawHasAwwows,
			howizontawHasAwwows: scwowwbaw.howizontawHasAwwows,
			vewticawScwowwbawSize: scwowwbaw.vewticawScwowwbawSize,
			vewticawSwidewSize: scwowwbaw.vewticawSwidewSize,
			howizontawScwowwbawSize: scwowwbaw.howizontawScwowwbawSize,
			howizontawSwidewSize: scwowwbaw.howizontawSwidewSize,
			handweMouseWheew: scwowwbaw.handweMouseWheew,
			awwaysConsumeMouseWheew: scwowwbaw.awwaysConsumeMouseWheew,
			awwowSize: scwowwbaw.awwowSize,
			mouseWheewScwowwSensitivity: mouseWheewScwowwSensitivity,
			fastScwowwSensitivity: fastScwowwSensitivity,
			scwowwPwedominantAxis: scwowwPwedominantAxis,
			scwowwByPage: scwowwbaw.scwowwByPage,
		};

		this.scwowwbaw = this._wegista(new SmoothScwowwabweEwement(winesContent.domNode, scwowwbawOptions, this._context.viewWayout.getScwowwabwe()));
		PawtFingewpwints.wwite(this.scwowwbaw.getDomNode(), PawtFingewpwint.ScwowwabweEwement);

		this.scwowwbawDomNode = cweateFastDomNode(this.scwowwbaw.getDomNode());
		this.scwowwbawDomNode.setPosition('absowute');
		this._setWayout();

		// When having a zone widget that cawws .focus() on one of its dom ewements,
		// the bwowsa wiww twy despewatewy to weveaw that dom node, unexpectedwy
		// changing the .scwowwTop of this.winesContent

		const onBwowsewDespewateWeveaw = (domNode: HTMWEwement, wookAtScwowwTop: boowean, wookAtScwowwWeft: boowean) => {
			const newScwowwPosition: INewScwowwPosition = {};

			if (wookAtScwowwTop) {
				const dewtaTop = domNode.scwowwTop;
				if (dewtaTop) {
					newScwowwPosition.scwowwTop = this._context.viewWayout.getCuwwentScwowwTop() + dewtaTop;
					domNode.scwowwTop = 0;
				}
			}

			if (wookAtScwowwWeft) {
				const dewtaWeft = domNode.scwowwWeft;
				if (dewtaWeft) {
					newScwowwPosition.scwowwWeft = this._context.viewWayout.getCuwwentScwowwWeft() + dewtaWeft;
					domNode.scwowwWeft = 0;
				}
			}

			this._context.modew.setScwowwPosition(newScwowwPosition, ScwowwType.Immediate);
		};

		// I've seen this happen both on the view dom node & on the wines content dom node.
		this._wegista(dom.addDisposabweWistena(viewDomNode.domNode, 'scwoww', (e: Event) => onBwowsewDespewateWeveaw(viewDomNode.domNode, twue, twue)));
		this._wegista(dom.addDisposabweWistena(winesContent.domNode, 'scwoww', (e: Event) => onBwowsewDespewateWeveaw(winesContent.domNode, twue, fawse)));
		this._wegista(dom.addDisposabweWistena(ovewfwowGuawdDomNode.domNode, 'scwoww', (e: Event) => onBwowsewDespewateWeveaw(ovewfwowGuawdDomNode.domNode, twue, fawse)));
		this._wegista(dom.addDisposabweWistena(this.scwowwbawDomNode.domNode, 'scwoww', (e: Event) => onBwowsewDespewateWeveaw(this.scwowwbawDomNode.domNode, twue, fawse)));
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pwivate _setWayout(): void {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this.scwowwbawDomNode.setWeft(wayoutInfo.contentWeft);

		const minimap = options.get(EditowOption.minimap);
		const side = minimap.side;
		if (side === 'wight') {
			this.scwowwbawDomNode.setWidth(wayoutInfo.contentWidth + wayoutInfo.minimap.minimapWidth);
		} ewse {
			this.scwowwbawDomNode.setWidth(wayoutInfo.contentWidth);
		}
		this.scwowwbawDomNode.setHeight(wayoutInfo.height);
	}

	pubwic getOvewviewWuwewWayoutInfo(): IOvewviewWuwewWayoutInfo {
		wetuwn this.scwowwbaw.getOvewviewWuwewWayoutInfo();
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this.scwowwbawDomNode;
	}

	pubwic dewegateVewticawScwowwbawMouseDown(bwowsewEvent: IMouseEvent): void {
		this.scwowwbaw.dewegateVewticawScwowwbawMouseDown(bwowsewEvent);
	}

	// --- begin event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		if (
			e.hasChanged(EditowOption.scwowwbaw)
			|| e.hasChanged(EditowOption.mouseWheewScwowwSensitivity)
			|| e.hasChanged(EditowOption.fastScwowwSensitivity)
		) {
			const options = this._context.configuwation.options;
			const scwowwbaw = options.get(EditowOption.scwowwbaw);
			const mouseWheewScwowwSensitivity = options.get(EditowOption.mouseWheewScwowwSensitivity);
			const fastScwowwSensitivity = options.get(EditowOption.fastScwowwSensitivity);
			const scwowwPwedominantAxis = options.get(EditowOption.scwowwPwedominantAxis);
			const newOpts: ScwowwabweEwementChangeOptions = {
				vewticaw: scwowwbaw.vewticaw,
				howizontaw: scwowwbaw.howizontaw,
				vewticawScwowwbawSize: scwowwbaw.vewticawScwowwbawSize,
				howizontawScwowwbawSize: scwowwbaw.howizontawScwowwbawSize,
				scwowwByPage: scwowwbaw.scwowwByPage,
				handweMouseWheew: scwowwbaw.handweMouseWheew,
				mouseWheewScwowwSensitivity: mouseWheewScwowwSensitivity,
				fastScwowwSensitivity: fastScwowwSensitivity,
				scwowwPwedominantAxis: scwowwPwedominantAxis
			};
			this.scwowwbaw.updateOptions(newOpts);
		}
		if (e.hasChanged(EditowOption.wayoutInfo)) {
			this._setWayout();
		}
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boowean {
		this.scwowwbaw.updateCwassName('editow-scwowwabwe' + ' ' + getThemeTypeSewectow(this._context.theme.type));
		wetuwn twue;
	}

	// --- end event handwews

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		// Nothing to do
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {
		this.scwowwbaw.wendewNow();
	}
}
