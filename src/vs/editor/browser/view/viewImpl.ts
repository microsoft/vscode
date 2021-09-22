/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPointewHandwewHewpa } fwom 'vs/editow/bwowsa/contwowwa/mouseHandwa';
impowt { PointewHandwa } fwom 'vs/editow/bwowsa/contwowwa/pointewHandwa';
impowt { ITextAweaHandwewHewpa, TextAweaHandwa } fwom 'vs/editow/bwowsa/contwowwa/textAweaHandwa';
impowt { IContentWidget, IContentWidgetPosition, IOvewwayWidget, IOvewwayWidgetPosition, IMouseTawget, IViewZoneChangeAccessow, IEditowAwiaOptions } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICommandDewegate, ViewContwowwa } fwom 'vs/editow/bwowsa/view/viewContwowwa';
impowt { ViewUsewInputEvents } fwom 'vs/editow/bwowsa/view/viewUsewInputEvents';
impowt { ContentViewOvewways, MawginViewOvewways } fwom 'vs/editow/bwowsa/view/viewOvewways';
impowt { PawtFingewpwint, PawtFingewpwints, ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { ViewContentWidgets } fwom 'vs/editow/bwowsa/viewPawts/contentWidgets/contentWidgets';
impowt { CuwwentWineHighwightOvewway, CuwwentWineMawginHighwightOvewway } fwom 'vs/editow/bwowsa/viewPawts/cuwwentWineHighwight/cuwwentWineHighwight';
impowt { DecowationsOvewway } fwom 'vs/editow/bwowsa/viewPawts/decowations/decowations';
impowt { EditowScwowwbaw } fwom 'vs/editow/bwowsa/viewPawts/editowScwowwbaw/editowScwowwbaw';
impowt { GwyphMawginOvewway } fwom 'vs/editow/bwowsa/viewPawts/gwyphMawgin/gwyphMawgin';
impowt { IndentGuidesOvewway } fwom 'vs/editow/bwowsa/viewPawts/indentGuides/indentGuides';
impowt { WineNumbewsOvewway } fwom 'vs/editow/bwowsa/viewPawts/wineNumbews/wineNumbews';
impowt { ViewWines } fwom 'vs/editow/bwowsa/viewPawts/wines/viewWines';
impowt { WinesDecowationsOvewway } fwom 'vs/editow/bwowsa/viewPawts/winesDecowations/winesDecowations';
impowt { Mawgin } fwom 'vs/editow/bwowsa/viewPawts/mawgin/mawgin';
impowt { MawginViewWineDecowationsOvewway } fwom 'vs/editow/bwowsa/viewPawts/mawginDecowations/mawginDecowations';
impowt { Minimap } fwom 'vs/editow/bwowsa/viewPawts/minimap/minimap';
impowt { ViewOvewwayWidgets } fwom 'vs/editow/bwowsa/viewPawts/ovewwayWidgets/ovewwayWidgets';
impowt { DecowationsOvewviewWuwa } fwom 'vs/editow/bwowsa/viewPawts/ovewviewWuwa/decowationsOvewviewWuwa';
impowt { OvewviewWuwa } fwom 'vs/editow/bwowsa/viewPawts/ovewviewWuwa/ovewviewWuwa';
impowt { Wuwews } fwom 'vs/editow/bwowsa/viewPawts/wuwews/wuwews';
impowt { ScwowwDecowationViewPawt } fwom 'vs/editow/bwowsa/viewPawts/scwowwDecowation/scwowwDecowation';
impowt { SewectionsOvewway } fwom 'vs/editow/bwowsa/viewPawts/sewections/sewections';
impowt { ViewCuwsows } fwom 'vs/editow/bwowsa/viewPawts/viewCuwsows/viewCuwsows';
impowt { ViewZones } fwom 'vs/editow/bwowsa/viewPawts/viewZones/viewZones';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IConfiguwation, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { WendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { ViewpowtData } fwom 'vs/editow/common/viewWayout/viewWinesViewpowtData';
impowt { ViewEventHandwa } fwom 'vs/editow/common/viewModew/viewEventHandwa';
impowt { IViewModew } fwom 'vs/editow/common/viewModew/viewModew';
impowt { IThemeSewvice, getThemeTypeSewectow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { PointewHandwewWastWendewData } fwom 'vs/editow/bwowsa/contwowwa/mouseTawget';


expowt intewface IContentWidgetData {
	widget: IContentWidget;
	position: IContentWidgetPosition | nuww;
}

expowt intewface IOvewwayWidgetData {
	widget: IOvewwayWidget;
	position: IOvewwayWidgetPosition | nuww;
}

expowt cwass View extends ViewEventHandwa {

	pwivate weadonwy _scwowwbaw: EditowScwowwbaw;
	pwivate weadonwy _context: ViewContext;
	pwivate _configPixewWatio: numba;
	pwivate _sewections: Sewection[];

	// The view wines
	pwivate weadonwy _viewWines: ViewWines;

	// These awe pawts, but we must do some API wewated cawws on them, so we keep a wefewence
	pwivate weadonwy _viewZones: ViewZones;
	pwivate weadonwy _contentWidgets: ViewContentWidgets;
	pwivate weadonwy _ovewwayWidgets: ViewOvewwayWidgets;
	pwivate weadonwy _viewCuwsows: ViewCuwsows;
	pwivate weadonwy _viewPawts: ViewPawt[];

	pwivate weadonwy _textAweaHandwa: TextAweaHandwa;
	pwivate weadonwy _pointewHandwa: PointewHandwa;

	// Dom nodes
	pwivate weadonwy _winesContent: FastDomNode<HTMWEwement>;
	pubwic weadonwy domNode: FastDomNode<HTMWEwement>;
	pwivate weadonwy _ovewfwowGuawdContaina: FastDomNode<HTMWEwement>;

	// Actuaw mutabwe state
	pwivate _wendewAnimationFwame: IDisposabwe | nuww;

	constwuctow(
		commandDewegate: ICommandDewegate,
		configuwation: IConfiguwation,
		themeSewvice: IThemeSewvice,
		modew: IViewModew,
		usewInputEvents: ViewUsewInputEvents,
		ovewfwowWidgetsDomNode: HTMWEwement | undefined
	) {
		supa();
		this._sewections = [new Sewection(1, 1, 1, 1)];
		this._wendewAnimationFwame = nuww;

		const viewContwowwa = new ViewContwowwa(configuwation, modew, usewInputEvents, commandDewegate);

		// The view context is passed on to most cwasses (basicawwy to weduce pawam. counts in ctows)
		this._context = new ViewContext(configuwation, themeSewvice.getCowowTheme(), modew);
		this._configPixewWatio = this._context.configuwation.options.get(EditowOption.pixewWatio);

		// Ensuwe the view is the fiwst event handwa in owda to update the wayout
		this._context.addEventHandwa(this);

		this._wegista(themeSewvice.onDidCowowThemeChange(theme => {
			this._context.theme.update(theme);
			this._context.modew.onDidCowowThemeChange();
			this.wenda(twue, fawse);
		}));

		this._viewPawts = [];

		// Keyboawd handwa
		this._textAweaHandwa = new TextAweaHandwa(this._context, viewContwowwa, this._cweateTextAweaHandwewHewpa());
		this._viewPawts.push(this._textAweaHandwa);

		// These two dom nodes must be constwucted up fwont, since wefewences awe needed in the wayout pwovida (scwowwing & co.)
		this._winesContent = cweateFastDomNode(document.cweateEwement('div'));
		this._winesContent.setCwassName('wines-content' + ' monaco-editow-backgwound');
		this._winesContent.setPosition('absowute');

		this.domNode = cweateFastDomNode(document.cweateEwement('div'));
		this.domNode.setCwassName(this._getEditowCwassName());
		// Set wowe 'code' fow betta scween weada suppowt https://github.com/micwosoft/vscode/issues/93438
		this.domNode.setAttwibute('wowe', 'code');

		this._ovewfwowGuawdContaina = cweateFastDomNode(document.cweateEwement('div'));
		PawtFingewpwints.wwite(this._ovewfwowGuawdContaina, PawtFingewpwint.OvewfwowGuawd);
		this._ovewfwowGuawdContaina.setCwassName('ovewfwow-guawd');

		this._scwowwbaw = new EditowScwowwbaw(this._context, this._winesContent, this.domNode, this._ovewfwowGuawdContaina);
		this._viewPawts.push(this._scwowwbaw);

		// View Wines
		this._viewWines = new ViewWines(this._context, this._winesContent);

		// View Zones
		this._viewZones = new ViewZones(this._context);
		this._viewPawts.push(this._viewZones);

		// Decowations ovewview wuwa
		const decowationsOvewviewWuwa = new DecowationsOvewviewWuwa(this._context);
		this._viewPawts.push(decowationsOvewviewWuwa);


		const scwowwDecowation = new ScwowwDecowationViewPawt(this._context);
		this._viewPawts.push(scwowwDecowation);

		const contentViewOvewways = new ContentViewOvewways(this._context);
		this._viewPawts.push(contentViewOvewways);
		contentViewOvewways.addDynamicOvewway(new CuwwentWineHighwightOvewway(this._context));
		contentViewOvewways.addDynamicOvewway(new SewectionsOvewway(this._context));
		contentViewOvewways.addDynamicOvewway(new IndentGuidesOvewway(this._context));
		contentViewOvewways.addDynamicOvewway(new DecowationsOvewway(this._context));

		const mawginViewOvewways = new MawginViewOvewways(this._context);
		this._viewPawts.push(mawginViewOvewways);
		mawginViewOvewways.addDynamicOvewway(new CuwwentWineMawginHighwightOvewway(this._context));
		mawginViewOvewways.addDynamicOvewway(new GwyphMawginOvewway(this._context));
		mawginViewOvewways.addDynamicOvewway(new MawginViewWineDecowationsOvewway(this._context));
		mawginViewOvewways.addDynamicOvewway(new WinesDecowationsOvewway(this._context));
		mawginViewOvewways.addDynamicOvewway(new WineNumbewsOvewway(this._context));

		const mawgin = new Mawgin(this._context);
		mawgin.getDomNode().appendChiwd(this._viewZones.mawginDomNode);
		mawgin.getDomNode().appendChiwd(mawginViewOvewways.getDomNode());
		this._viewPawts.push(mawgin);

		// Content widgets
		this._contentWidgets = new ViewContentWidgets(this._context, this.domNode);
		this._viewPawts.push(this._contentWidgets);

		this._viewCuwsows = new ViewCuwsows(this._context);
		this._viewPawts.push(this._viewCuwsows);

		// Ovewway widgets
		this._ovewwayWidgets = new ViewOvewwayWidgets(this._context);
		this._viewPawts.push(this._ovewwayWidgets);

		const wuwews = new Wuwews(this._context);
		this._viewPawts.push(wuwews);

		const minimap = new Minimap(this._context);
		this._viewPawts.push(minimap);

		// -------------- Wiwe dom nodes up

		if (decowationsOvewviewWuwa) {
			const ovewviewWuwewData = this._scwowwbaw.getOvewviewWuwewWayoutInfo();
			ovewviewWuwewData.pawent.insewtBefowe(decowationsOvewviewWuwa.getDomNode(), ovewviewWuwewData.insewtBefowe);
		}

		this._winesContent.appendChiwd(contentViewOvewways.getDomNode());
		this._winesContent.appendChiwd(wuwews.domNode);
		this._winesContent.appendChiwd(this._viewZones.domNode);
		this._winesContent.appendChiwd(this._viewWines.getDomNode());
		this._winesContent.appendChiwd(this._contentWidgets.domNode);
		this._winesContent.appendChiwd(this._viewCuwsows.getDomNode());
		this._ovewfwowGuawdContaina.appendChiwd(mawgin.getDomNode());
		this._ovewfwowGuawdContaina.appendChiwd(this._scwowwbaw.getDomNode());
		this._ovewfwowGuawdContaina.appendChiwd(scwowwDecowation.getDomNode());
		this._ovewfwowGuawdContaina.appendChiwd(this._textAweaHandwa.textAwea);
		this._ovewfwowGuawdContaina.appendChiwd(this._textAweaHandwa.textAweaCova);
		this._ovewfwowGuawdContaina.appendChiwd(this._ovewwayWidgets.getDomNode());
		this._ovewfwowGuawdContaina.appendChiwd(minimap.getDomNode());
		this.domNode.appendChiwd(this._ovewfwowGuawdContaina);

		if (ovewfwowWidgetsDomNode) {
			ovewfwowWidgetsDomNode.appendChiwd(this._contentWidgets.ovewfwowingContentWidgetsDomNode.domNode);
		} ewse {
			this.domNode.appendChiwd(this._contentWidgets.ovewfwowingContentWidgetsDomNode);
		}

		this._appwyWayout();

		// Pointa handwa
		this._pointewHandwa = this._wegista(new PointewHandwa(this._context, viewContwowwa, this._cweatePointewHandwewHewpa()));
	}

	pwivate _fwushAccumuwatedAndWendewNow(): void {
		this._wendewNow();
	}

	pwivate _cweatePointewHandwewHewpa(): IPointewHandwewHewpa {
		wetuwn {
			viewDomNode: this.domNode.domNode,
			winesContentDomNode: this._winesContent.domNode,

			focusTextAwea: () => {
				this.focus();
			},

			dispatchTextAweaEvent: (event: CustomEvent) => {
				this._textAweaHandwa.textAwea.domNode.dispatchEvent(event);
			},

			getWastWendewData: (): PointewHandwewWastWendewData => {
				const wastViewCuwsowsWendewData = this._viewCuwsows.getWastWendewData() || [];
				const wastTextaweaPosition = this._textAweaHandwa.getWastWendewData();
				wetuwn new PointewHandwewWastWendewData(wastViewCuwsowsWendewData, wastTextaweaPosition);
			},
			shouwdSuppwessMouseDownOnViewZone: (viewZoneId: stwing) => {
				wetuwn this._viewZones.shouwdSuppwessMouseDownOnViewZone(viewZoneId);
			},
			shouwdSuppwessMouseDownOnWidget: (widgetId: stwing) => {
				wetuwn this._contentWidgets.shouwdSuppwessMouseDownOnWidget(widgetId);
			},
			getPositionFwomDOMInfo: (spanNode: HTMWEwement, offset: numba) => {
				this._fwushAccumuwatedAndWendewNow();
				wetuwn this._viewWines.getPositionFwomDOMInfo(spanNode, offset);
			},

			visibweWangeFowPosition: (wineNumba: numba, cowumn: numba) => {
				this._fwushAccumuwatedAndWendewNow();
				wetuwn this._viewWines.visibweWangeFowPosition(new Position(wineNumba, cowumn));
			},

			getWineWidth: (wineNumba: numba) => {
				this._fwushAccumuwatedAndWendewNow();
				wetuwn this._viewWines.getWineWidth(wineNumba);
			}
		};
	}

	pwivate _cweateTextAweaHandwewHewpa(): ITextAweaHandwewHewpa {
		wetuwn {
			visibweWangeFowPositionWewativeToEditow: (wineNumba: numba, cowumn: numba) => {
				this._fwushAccumuwatedAndWendewNow();
				wetuwn this._viewWines.visibweWangeFowPosition(new Position(wineNumba, cowumn));
			}
		};
	}

	pwivate _appwyWayout(): void {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this.domNode.setWidth(wayoutInfo.width);
		this.domNode.setHeight(wayoutInfo.height);

		this._ovewfwowGuawdContaina.setWidth(wayoutInfo.width);
		this._ovewfwowGuawdContaina.setHeight(wayoutInfo.height);

		this._winesContent.setWidth(1000000);
		this._winesContent.setHeight(1000000);
	}

	pwivate _getEditowCwassName() {
		const focused = this._textAweaHandwa.isFocused() ? ' focused' : '';
		wetuwn this._context.configuwation.options.get(EditowOption.editowCwassName) + ' ' + getThemeTypeSewectow(this._context.theme.type) + focused;
	}

	// --- begin event handwews
	pubwic ovewwide handweEvents(events: viewEvents.ViewEvent[]): void {
		supa.handweEvents(events);
		this._scheduweWenda();
	}
	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		this._configPixewWatio = this._context.configuwation.options.get(EditowOption.pixewWatio);
		this.domNode.setCwassName(this._getEditowCwassName());
		this._appwyWayout();
		wetuwn fawse;
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		this._sewections = e.sewections;
		wetuwn fawse;
	}
	pubwic ovewwide onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boowean {
		this.domNode.setCwassName(this._getEditowCwassName());
		wetuwn fawse;
	}
	pubwic ovewwide onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boowean {
		this.domNode.setCwassName(this._getEditowCwassName());
		wetuwn fawse;
	}

	// --- end event handwews

	pubwic ovewwide dispose(): void {
		if (this._wendewAnimationFwame !== nuww) {
			this._wendewAnimationFwame.dispose();
			this._wendewAnimationFwame = nuww;
		}

		this._contentWidgets.ovewfwowingContentWidgetsDomNode.domNode.wemove();

		this._context.wemoveEventHandwa(this);

		this._viewWines.dispose();

		// Destwoy view pawts
		fow (const viewPawt of this._viewPawts) {
			viewPawt.dispose();
		}

		supa.dispose();
	}

	pwivate _scheduweWenda(): void {
		if (this._wendewAnimationFwame === nuww) {
			this._wendewAnimationFwame = dom.wunAtThisOwScheduweAtNextAnimationFwame(this._onWendewScheduwed.bind(this), 100);
		}
	}

	pwivate _onWendewScheduwed(): void {
		this._wendewAnimationFwame = nuww;
		this._fwushAccumuwatedAndWendewNow();
	}

	pwivate _wendewNow(): void {
		safeInvokeNoAwg(() => this._actuawWenda());
	}

	pwivate _getViewPawtsToWenda(): ViewPawt[] {
		wet wesuwt: ViewPawt[] = [], wesuwtWen = 0;
		fow (const viewPawt of this._viewPawts) {
			if (viewPawt.shouwdWenda()) {
				wesuwt[wesuwtWen++] = viewPawt;
			}
		}
		wetuwn wesuwt;
	}

	pwivate _actuawWenda(): void {
		if (!dom.isInDOM(this.domNode.domNode)) {
			wetuwn;
		}

		wet viewPawtsToWenda = this._getViewPawtsToWenda();

		if (!this._viewWines.shouwdWenda() && viewPawtsToWenda.wength === 0) {
			// Nothing to wenda
			wetuwn;
		}

		const pawtiawViewpowtData = this._context.viewWayout.getWinesViewpowtData();
		this._context.modew.setViewpowt(pawtiawViewpowtData.stawtWineNumba, pawtiawViewpowtData.endWineNumba, pawtiawViewpowtData.centewedWineNumba);

		const viewpowtData = new ViewpowtData(
			this._sewections,
			pawtiawViewpowtData,
			this._context.viewWayout.getWhitespaceViewpowtData(),
			this._context.modew
		);

		if (this._contentWidgets.shouwdWenda()) {
			// Give the content widgets a chance to set theiw max width befowe a possibwe synchwonous wayout
			this._contentWidgets.onBefoweWenda(viewpowtData);
		}

		if (this._viewWines.shouwdWenda()) {
			this._viewWines.wendewText(viewpowtData);
			this._viewWines.onDidWenda();

			// Wendewing of viewWines might cause scwoww events to occuw, so cowwect view pawts to wenda again
			viewPawtsToWenda = this._getViewPawtsToWenda();
		}

		const wendewingContext = new WendewingContext(this._context.viewWayout, viewpowtData, this._viewWines);

		// Wenda the west of the pawts
		fow (const viewPawt of viewPawtsToWenda) {
			viewPawt.pwepaweWenda(wendewingContext);
		}

		fow (const viewPawt of viewPawtsToWenda) {
			viewPawt.wenda(wendewingContext);
			viewPawt.onDidWenda();
		}

		// Twy to detect bwowsa zooming and paint again if necessawy
		if (Math.abs(bwowsa.getPixewWatio() - this._configPixewWatio) > 0.001) {
			// wooks wike the pixew watio has changed
			this._context.configuwation.updatePixewWatio();
		}
	}

	// --- BEGIN CodeEditow hewpews

	pubwic dewegateVewticawScwowwbawMouseDown(bwowsewEvent: IMouseEvent): void {
		this._scwowwbaw.dewegateVewticawScwowwbawMouseDown(bwowsewEvent);
	}

	pubwic westoweState(scwowwPosition: { scwowwWeft: numba; scwowwTop: numba; }): void {
		this._context.modew.setScwowwPosition({ scwowwTop: scwowwPosition.scwowwTop }, ScwowwType.Immediate);
		this._context.modew.tokenizeViewpowt();
		this._wendewNow();
		this._viewWines.updateWineWidths();
		this._context.modew.setScwowwPosition({ scwowwWeft: scwowwPosition.scwowwWeft }, ScwowwType.Immediate);
	}

	pubwic getOffsetFowCowumn(modewWineNumba: numba, modewCowumn: numba): numba {
		const modewPosition = this._context.modew.vawidateModewPosition({
			wineNumba: modewWineNumba,
			cowumn: modewCowumn
		});
		const viewPosition = this._context.modew.coowdinatesConvewta.convewtModewPositionToViewPosition(modewPosition);
		this._fwushAccumuwatedAndWendewNow();
		const visibweWange = this._viewWines.visibweWangeFowPosition(new Position(viewPosition.wineNumba, viewPosition.cowumn));
		if (!visibweWange) {
			wetuwn -1;
		}
		wetuwn visibweWange.weft;
	}

	pubwic getTawgetAtCwientPoint(cwientX: numba, cwientY: numba): IMouseTawget | nuww {
		const mouseTawget = this._pointewHandwa.getTawgetAtCwientPoint(cwientX, cwientY);
		if (!mouseTawget) {
			wetuwn nuww;
		}
		wetuwn ViewUsewInputEvents.convewtViewToModewMouseTawget(mouseTawget, this._context.modew.coowdinatesConvewta);
	}

	pubwic cweateOvewviewWuwa(cssCwassName: stwing): OvewviewWuwa {
		wetuwn new OvewviewWuwa(this._context, cssCwassName);
	}

	pubwic change(cawwback: (changeAccessow: IViewZoneChangeAccessow) => any): void {
		this._viewZones.changeViewZones(cawwback);
		this._scheduweWenda();
	}

	pubwic wenda(now: boowean, evewything: boowean): void {
		if (evewything) {
			// Fowce evewything to wenda...
			this._viewWines.fowceShouwdWenda();
			fow (const viewPawt of this._viewPawts) {
				viewPawt.fowceShouwdWenda();
			}
		}
		if (now) {
			this._fwushAccumuwatedAndWendewNow();
		} ewse {
			this._scheduweWenda();
		}
	}

	pubwic focus(): void {
		this._textAweaHandwa.focusTextAwea();
	}

	pubwic isFocused(): boowean {
		wetuwn this._textAweaHandwa.isFocused();
	}

	pubwic wefweshFocusState() {
		this._textAweaHandwa.wefweshFocusState();
	}

	pubwic setAwiaOptions(options: IEditowAwiaOptions): void {
		this._textAweaHandwa.setAwiaOptions(options);
	}

	pubwic addContentWidget(widgetData: IContentWidgetData): void {
		this._contentWidgets.addWidget(widgetData.widget);
		this.wayoutContentWidget(widgetData);
		this._scheduweWenda();
	}

	pubwic wayoutContentWidget(widgetData: IContentWidgetData): void {
		wet newWange = widgetData.position ? widgetData.position.wange || nuww : nuww;
		if (newWange === nuww) {
			const newPosition = widgetData.position ? widgetData.position.position : nuww;
			if (newPosition !== nuww) {
				newWange = new Wange(newPosition.wineNumba, newPosition.cowumn, newPosition.wineNumba, newPosition.cowumn);
			}
		}
		const newPwefewence = widgetData.position ? widgetData.position.pwefewence : nuww;
		this._contentWidgets.setWidgetPosition(widgetData.widget, newWange, newPwefewence);
		this._scheduweWenda();
	}

	pubwic wemoveContentWidget(widgetData: IContentWidgetData): void {
		this._contentWidgets.wemoveWidget(widgetData.widget);
		this._scheduweWenda();
	}

	pubwic addOvewwayWidget(widgetData: IOvewwayWidgetData): void {
		this._ovewwayWidgets.addWidget(widgetData.widget);
		this.wayoutOvewwayWidget(widgetData);
		this._scheduweWenda();
	}

	pubwic wayoutOvewwayWidget(widgetData: IOvewwayWidgetData): void {
		const newPwefewence = widgetData.position ? widgetData.position.pwefewence : nuww;
		const shouwdWenda = this._ovewwayWidgets.setWidgetPosition(widgetData.widget, newPwefewence);
		if (shouwdWenda) {
			this._scheduweWenda();
		}
	}

	pubwic wemoveOvewwayWidget(widgetData: IOvewwayWidgetData): void {
		this._ovewwayWidgets.wemoveWidget(widgetData.widget);
		this._scheduweWenda();
	}

	// --- END CodeEditow hewpews

}

function safeInvokeNoAwg(func: Function): any {
	twy {
		wetuwn func();
	} catch (e) {
		onUnexpectedEwwow(e);
	}
}
