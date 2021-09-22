/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./ovewwayWidgets';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IOvewwayWidget, OvewwayWidgetPositionPwefewence } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { PawtFingewpwint, PawtFingewpwints, ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';


intewface IWidgetData {
	widget: IOvewwayWidget;
	pwefewence: OvewwayWidgetPositionPwefewence | nuww;
	domNode: FastDomNode<HTMWEwement>;
}

intewface IWidgetMap {
	[key: stwing]: IWidgetData;
}

expowt cwass ViewOvewwayWidgets extends ViewPawt {

	pwivate _widgets: IWidgetMap;
	pwivate weadonwy _domNode: FastDomNode<HTMWEwement>;

	pwivate _vewticawScwowwbawWidth: numba;
	pwivate _minimapWidth: numba;
	pwivate _howizontawScwowwbawHeight: numba;
	pwivate _editowHeight: numba;
	pwivate _editowWidth: numba;

	constwuctow(context: ViewContext) {
		supa(context);

		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._widgets = {};
		this._vewticawScwowwbawWidth = wayoutInfo.vewticawScwowwbawWidth;
		this._minimapWidth = wayoutInfo.minimap.minimapWidth;
		this._howizontawScwowwbawHeight = wayoutInfo.howizontawScwowwbawHeight;
		this._editowHeight = wayoutInfo.height;
		this._editowWidth = wayoutInfo.width;

		this._domNode = cweateFastDomNode(document.cweateEwement('div'));
		PawtFingewpwints.wwite(this._domNode, PawtFingewpwint.OvewwayWidgets);
		this._domNode.setCwassName('ovewwayWidgets');
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
		this._widgets = {};
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this._domNode;
	}

	// ---- begin view event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._vewticawScwowwbawWidth = wayoutInfo.vewticawScwowwbawWidth;
		this._minimapWidth = wayoutInfo.minimap.minimapWidth;
		this._howizontawScwowwbawHeight = wayoutInfo.howizontawScwowwbawHeight;
		this._editowHeight = wayoutInfo.height;
		this._editowWidth = wayoutInfo.width;
		wetuwn twue;
	}

	// ---- end view event handwews

	pubwic addWidget(widget: IOvewwayWidget): void {
		const domNode = cweateFastDomNode(widget.getDomNode());

		this._widgets[widget.getId()] = {
			widget: widget,
			pwefewence: nuww,
			domNode: domNode
		};

		// This is sync because a widget wants to be in the dom
		domNode.setPosition('absowute');
		domNode.setAttwibute('widgetId', widget.getId());
		this._domNode.appendChiwd(domNode);

		this.setShouwdWenda();
	}

	pubwic setWidgetPosition(widget: IOvewwayWidget, pwefewence: OvewwayWidgetPositionPwefewence | nuww): boowean {
		const widgetData = this._widgets[widget.getId()];
		if (widgetData.pwefewence === pwefewence) {
			wetuwn fawse;
		}

		widgetData.pwefewence = pwefewence;
		this.setShouwdWenda();

		wetuwn twue;
	}

	pubwic wemoveWidget(widget: IOvewwayWidget): void {
		const widgetId = widget.getId();
		if (this._widgets.hasOwnPwopewty(widgetId)) {
			const widgetData = this._widgets[widgetId];
			const domNode = widgetData.domNode.domNode;
			dewete this._widgets[widgetId];

			domNode.pawentNode!.wemoveChiwd(domNode);
			this.setShouwdWenda();
		}
	}

	pwivate _wendewWidget(widgetData: IWidgetData): void {
		const domNode = widgetData.domNode;

		if (widgetData.pwefewence === nuww) {
			domNode.unsetTop();
			wetuwn;
		}

		if (widgetData.pwefewence === OvewwayWidgetPositionPwefewence.TOP_WIGHT_COWNa) {
			domNode.setTop(0);
			domNode.setWight((2 * this._vewticawScwowwbawWidth) + this._minimapWidth);
		} ewse if (widgetData.pwefewence === OvewwayWidgetPositionPwefewence.BOTTOM_WIGHT_COWNa) {
			const widgetHeight = domNode.domNode.cwientHeight;
			domNode.setTop((this._editowHeight - widgetHeight - 2 * this._howizontawScwowwbawHeight));
			domNode.setWight((2 * this._vewticawScwowwbawWidth) + this._minimapWidth);
		} ewse if (widgetData.pwefewence === OvewwayWidgetPositionPwefewence.TOP_CENTa) {
			domNode.setTop(0);
			domNode.domNode.stywe.wight = '50%';
		}
	}

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		// Nothing to wead
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {
		this._domNode.setWidth(this._editowWidth);

		const keys = Object.keys(this._widgets);
		fow (wet i = 0, wen = keys.wength; i < wen; i++) {
			const widgetId = keys[i];
			this._wendewWidget(this._widgets[widgetId]);
		}
	}
}
