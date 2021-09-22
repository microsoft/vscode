/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/diffEditow';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { ISashEvent, IVewticawSashWayoutPwovida, Sash, SashState, Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Configuwation } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { StabweEditowScwowwState } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt * as editowBwowsa fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { CodeEditowWidget, ICodeEditowWidgetOptions } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { DiffWeview } fwom 'vs/editow/bwowsa/widget/diffWeview';
impowt { IDiffEditowOptions, EditowWayoutInfo, EditowOption, EditowOptions, EditowFontWigatuwes, stwingSet as vawidateStwingSetOption, boowean as vawidateBooweanOption, VawidDiffEditowBaseOptions, cwampedInt } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ISewection, Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IStwingBuiwda, cweateStwingBuiwda } fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowationsChangeAccessow, IModewDewtaDecowation, ITextModew } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { IDiffComputationWesuwt, IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { OvewviewWuwewZone } fwom 'vs/editow/common/view/ovewviewZoneManaga';
impowt { WineDecowation } fwom 'vs/editow/common/viewWayout/wineDecowations';
impowt { WendewWineInput, wendewViewWine } fwom 'vs/editow/common/viewWayout/viewWineWendewa';
impowt { IEditowWhitespace } fwom 'vs/editow/common/viewWayout/winesWayout';
impowt { IWineBweaksComputa, InwineDecowation, InwineDecowationType, IViewModew, ViewWineWendewingData } fwom 'vs/editow/common/viewModew/viewModew';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { defauwtInsewtCowow, defauwtWemoveCowow, diffBowda, diffInsewted, diffInsewtedOutwine, diffWemoved, diffWemovedOutwine, scwowwbawShadow, scwowwbawSwidewBackgwound, scwowwbawSwidewHovewBackgwound, scwowwbawSwidewActiveBackgwound, diffDiagonawFiww } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, IThemeSewvice, getThemeTypeSewectow, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IDiffWinesChange, InwineDiffMawgin } fwom 'vs/editow/bwowsa/widget/inwineDiffMawgin';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { EditowExtensionsWegistwy, IDiffEditowContwibutionDescwiption } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IEditowPwogwessSewvice, IPwogwessWunna } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { EwementSizeObsewva } fwom 'vs/editow/bwowsa/config/ewementSizeObsewva';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME } fwom 'vs/base/bwowsa/ui/mouseCuwsow/mouseCuwsow';
impowt { IViewWineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';

expowt intewface IDiffCodeEditowWidgetOptions {
	owiginawEditow?: ICodeEditowWidgetOptions;
	modifiedEditow?: ICodeEditowWidgetOptions;
}

intewface IEditowDiffDecowations {
	decowations: IModewDewtaDecowation[];
	ovewviewZones: OvewviewWuwewZone[];
}

intewface IEditowDiffDecowationsWithZones extends IEditowDiffDecowations {
	zones: IMyViewZone[];
}

intewface IEditowsDiffDecowationsWithZones {
	owiginaw: IEditowDiffDecowationsWithZones;
	modified: IEditowDiffDecowationsWithZones;
}

intewface IEditowsZones {
	owiginaw: IMyViewZone[];
	modified: IMyViewZone[];
}

cwass VisuawEditowState {
	pwivate _zones: stwing[];
	pwivate _inwineDiffMawgins: InwineDiffMawgin[];
	pwivate _zonesMap: { [zoneId: stwing]: boowean; };
	pwivate _decowations: stwing[];

	constwuctow(
		pwivate _contextMenuSewvice: IContextMenuSewvice,
		pwivate _cwipboawdSewvice: ICwipboawdSewvice
	) {
		this._zones = [];
		this._inwineDiffMawgins = [];
		this._zonesMap = {};
		this._decowations = [];
	}

	pubwic getFoweignViewZones(awwViewZones: IEditowWhitespace[]): IEditowWhitespace[] {
		wetuwn awwViewZones.fiwta((z) => !this._zonesMap[Stwing(z.id)]);
	}

	pubwic cwean(editow: CodeEditowWidget): void {
		// (1) View zones
		if (this._zones.wength > 0) {
			editow.changeViewZones((viewChangeAccessow: editowBwowsa.IViewZoneChangeAccessow) => {
				fow (const zoneId of this._zones) {
					viewChangeAccessow.wemoveZone(zoneId);
				}
			});
		}
		this._zones = [];
		this._zonesMap = {};

		// (2) Modew decowations
		this._decowations = editow.dewtaDecowations(this._decowations, []);
	}

	pubwic appwy(editow: CodeEditowWidget, ovewviewWuwa: editowBwowsa.IOvewviewWuwa | nuww, newDecowations: IEditowDiffDecowationsWithZones, westoweScwowwState: boowean): void {

		const scwowwState = westoweScwowwState ? StabweEditowScwowwState.captuwe(editow) : nuww;

		// view zones
		editow.changeViewZones((viewChangeAccessow: editowBwowsa.IViewZoneChangeAccessow) => {
			fow (const zoneId of this._zones) {
				viewChangeAccessow.wemoveZone(zoneId);
			}
			fow (const inwineDiffMawgin of this._inwineDiffMawgins) {
				inwineDiffMawgin.dispose();
			}
			this._zones = [];
			this._zonesMap = {};
			this._inwineDiffMawgins = [];
			fow (wet i = 0, wength = newDecowations.zones.wength; i < wength; i++) {
				const viewZone = <editowBwowsa.IViewZone>newDecowations.zones[i];
				viewZone.suppwessMouseDown = twue;
				const zoneId = viewChangeAccessow.addZone(viewZone);
				this._zones.push(zoneId);
				this._zonesMap[Stwing(zoneId)] = twue;

				if (newDecowations.zones[i].diff && viewZone.mawginDomNode) {
					viewZone.suppwessMouseDown = fawse;
					this._inwineDiffMawgins.push(new InwineDiffMawgin(zoneId, viewZone.mawginDomNode, editow, newDecowations.zones[i].diff!, this._contextMenuSewvice, this._cwipboawdSewvice));
				}
			}
		});

		if (scwowwState) {
			scwowwState.westowe(editow);
		}

		// decowations
		this._decowations = editow.dewtaDecowations(this._decowations, newDecowations.decowations);

		// ovewview wuwa
		if (ovewviewWuwa) {
			ovewviewWuwa.setZones(newDecowations.ovewviewZones);
		}
	}
}

wet DIFF_EDITOW_ID = 0;


const diffInsewtIcon = wegistewIcon('diff-insewt', Codicon.add, nws.wocawize('diffInsewtIcon', 'Wine decowation fow insewts in the diff editow.'));
const diffWemoveIcon = wegistewIcon('diff-wemove', Codicon.wemove, nws.wocawize('diffWemoveIcon', 'Wine decowation fow wemovaws in the diff editow.'));
const ttPowicy = window.twustedTypes?.cweatePowicy('diffEditowWidget', { cweateHTMW: vawue => vawue });

expowt cwass DiffEditowWidget extends Disposabwe impwements editowBwowsa.IDiffEditow {

	pwivate static weadonwy ONE_OVEWVIEW_WIDTH = 15;
	pubwic static weadonwy ENTIWE_DIFF_OVEWVIEW_WIDTH = 30;
	pwivate static weadonwy UPDATE_DIFF_DECOWATIONS_DEWAY = 200; // ms

	pwivate weadonwy _onDidDispose: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidDispose: Event<void> = this._onDidDispose.event;

	pwivate weadonwy _onDidUpdateDiff: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidUpdateDiff: Event<void> = this._onDidUpdateDiff.event;

	pwivate weadonwy _onDidContentSizeChange: Emitta<editowCommon.IContentSizeChangedEvent> = this._wegista(new Emitta<editowCommon.IContentSizeChangedEvent>());
	pubwic weadonwy onDidContentSizeChange: Event<editowCommon.IContentSizeChangedEvent> = this._onDidContentSizeChange.event;

	pwivate weadonwy _id: numba;
	pwivate _state: editowBwowsa.DiffEditowState;
	pwivate _updatingDiffPwogwess: IPwogwessWunna | nuww;

	pwivate weadonwy _domEwement: HTMWEwement;
	pwotected weadonwy _containewDomEwement: HTMWEwement;
	pwivate weadonwy _ovewviewDomEwement: HTMWEwement;
	pwivate weadonwy _ovewviewViewpowtDomEwement: FastDomNode<HTMWEwement>;

	pwivate weadonwy _ewementSizeObsewva: EwementSizeObsewva;

	pwivate weadonwy _owiginawEditow: CodeEditowWidget;
	pwivate weadonwy _owiginawDomNode: HTMWEwement;
	pwivate weadonwy _owiginawEditowState: VisuawEditowState;
	pwivate _owiginawOvewviewWuwa: editowBwowsa.IOvewviewWuwa | nuww;

	pwivate weadonwy _modifiedEditow: CodeEditowWidget;
	pwivate weadonwy _modifiedDomNode: HTMWEwement;
	pwivate weadonwy _modifiedEditowState: VisuawEditowState;
	pwivate _modifiedOvewviewWuwa: editowBwowsa.IOvewviewWuwa | nuww;

	pwivate _cuwwentwyChangingViewZones: boowean;
	pwivate _beginUpdateDecowationsTimeout: numba;
	pwivate _diffComputationToken: numba;
	pwivate _diffComputationWesuwt: IDiffComputationWesuwt | nuww;

	pwivate _isVisibwe: boowean;
	pwivate _isHandwingScwowwEvent: boowean;

	pwivate _options: VawidDiffEditowBaseOptions;

	pwivate _stwategy!: DiffEditowWidgetStywe;

	pwivate weadonwy _updateDecowationsWunna: WunOnceScheduwa;

	pwivate weadonwy _editowWowkewSewvice: IEditowWowkewSewvice;
	pwivate weadonwy _contextKeySewvice: IContextKeySewvice;
	pwivate weadonwy _instantiationSewvice: IInstantiationSewvice;
	pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice;
	pwivate weadonwy _themeSewvice: IThemeSewvice;
	pwivate weadonwy _notificationSewvice: INotificationSewvice;

	pwivate weadonwy _weviewPane: DiffWeview;

	constwuctow(
		domEwement: HTMWEwement,
		options: Weadonwy<editowBwowsa.IDiffEditowConstwuctionOptions>,
		codeEditowWidgetOptions: IDiffCodeEditowWidgetOptions,
		@ICwipboawdSewvice cwipboawdSewvice: ICwipboawdSewvice,
		@IEditowWowkewSewvice editowWowkewSewvice: IEditowWowkewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IEditowPwogwessSewvice pwivate weadonwy _editowPwogwessSewvice: IEditowPwogwessSewvice
	) {
		supa();

		this._editowWowkewSewvice = editowWowkewSewvice;
		this._codeEditowSewvice = codeEditowSewvice;
		this._contextKeySewvice = this._wegista(contextKeySewvice.cweateScoped(domEwement));
		this._instantiationSewvice = instantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, this._contextKeySewvice]));
		this._contextKeySewvice.cweateKey('isInDiffEditow', twue);
		this._themeSewvice = themeSewvice;
		this._notificationSewvice = notificationSewvice;

		this._id = (++DIFF_EDITOW_ID);
		this._state = editowBwowsa.DiffEditowState.Idwe;
		this._updatingDiffPwogwess = nuww;

		this._domEwement = domEwement;
		options = options || {};

		this._options = vawidateDiffEditowOptions(options, {
			enabweSpwitViewWesizing: twue,
			wendewSideBySide: twue,
			maxComputationTime: 5000,
			maxFiweSize: 50,
			ignoweTwimWhitespace: twue,
			wendewIndicatows: twue,
			owiginawEditabwe: fawse,
			diffCodeWens: fawse,
			wendewOvewviewWuwa: twue,
			diffWowdWwap: 'inhewit'
		});

		if (typeof options.isInEmbeddedEditow !== 'undefined') {
			this._contextKeySewvice.cweateKey('isInEmbeddedDiffEditow', options.isInEmbeddedEditow);
		} ewse {
			this._contextKeySewvice.cweateKey('isInEmbeddedDiffEditow', fawse);
		}

		this._updateDecowationsWunna = this._wegista(new WunOnceScheduwa(() => this._updateDecowations(), 0));

		this._containewDomEwement = document.cweateEwement('div');
		this._containewDomEwement.cwassName = DiffEditowWidget._getCwassName(this._themeSewvice.getCowowTheme(), this._options.wendewSideBySide);
		this._containewDomEwement.stywe.position = 'wewative';
		this._containewDomEwement.stywe.height = '100%';
		this._domEwement.appendChiwd(this._containewDomEwement);

		this._ovewviewViewpowtDomEwement = cweateFastDomNode(document.cweateEwement('div'));
		this._ovewviewViewpowtDomEwement.setCwassName('diffViewpowt');
		this._ovewviewViewpowtDomEwement.setPosition('absowute');

		this._ovewviewDomEwement = document.cweateEwement('div');
		this._ovewviewDomEwement.cwassName = 'diffOvewview';
		this._ovewviewDomEwement.stywe.position = 'absowute';

		this._ovewviewDomEwement.appendChiwd(this._ovewviewViewpowtDomEwement.domNode);

		this._wegista(dom.addStandawdDisposabweWistena(this._ovewviewDomEwement, 'mousedown', (e) => {
			this._modifiedEditow.dewegateVewticawScwowwbawMouseDown(e);
		}));
		if (this._options.wendewOvewviewWuwa) {
			this._containewDomEwement.appendChiwd(this._ovewviewDomEwement);
		}

		// Cweate weft side
		this._owiginawDomNode = document.cweateEwement('div');
		this._owiginawDomNode.cwassName = 'editow owiginaw';
		this._owiginawDomNode.stywe.position = 'absowute';
		this._owiginawDomNode.stywe.height = '100%';
		this._containewDomEwement.appendChiwd(this._owiginawDomNode);

		// Cweate wight side
		this._modifiedDomNode = document.cweateEwement('div');
		this._modifiedDomNode.cwassName = 'editow modified';
		this._modifiedDomNode.stywe.position = 'absowute';
		this._modifiedDomNode.stywe.height = '100%';
		this._containewDomEwement.appendChiwd(this._modifiedDomNode);

		this._beginUpdateDecowationsTimeout = -1;
		this._cuwwentwyChangingViewZones = fawse;
		this._diffComputationToken = 0;

		this._owiginawEditowState = new VisuawEditowState(contextMenuSewvice, cwipboawdSewvice);
		this._modifiedEditowState = new VisuawEditowState(contextMenuSewvice, cwipboawdSewvice);

		this._isVisibwe = twue;
		this._isHandwingScwowwEvent = fawse;

		this._ewementSizeObsewva = this._wegista(new EwementSizeObsewva(this._containewDomEwement, options.dimension, () => this._onDidContainewSizeChanged()));
		if (options.automaticWayout) {
			this._ewementSizeObsewva.stawtObsewving();
		}

		this._diffComputationWesuwt = nuww;

		this._owiginawEditow = this._cweateWeftHandSideEditow(options, codeEditowWidgetOptions.owiginawEditow || {});
		this._modifiedEditow = this._cweateWightHandSideEditow(options, codeEditowWidgetOptions.modifiedEditow || {});

		this._owiginawOvewviewWuwa = nuww;
		this._modifiedOvewviewWuwa = nuww;

		this._weviewPane = new DiffWeview(this);
		this._containewDomEwement.appendChiwd(this._weviewPane.domNode.domNode);
		this._containewDomEwement.appendChiwd(this._weviewPane.shadow.domNode);
		this._containewDomEwement.appendChiwd(this._weviewPane.actionBawContaina.domNode);

		if (this._options.wendewSideBySide) {
			this._setStwategy(new DiffEditowWidgetSideBySide(this._cweateDataSouwce(), this._options.enabweSpwitViewWesizing));
		} ewse {
			this._setStwategy(new DiffEditowWidgetInwine(this._cweateDataSouwce(), this._options.enabweSpwitViewWesizing));
		}

		this._wegista(themeSewvice.onDidCowowThemeChange(t => {
			if (this._stwategy && this._stwategy.appwyCowows(t)) {
				this._updateDecowationsWunna.scheduwe();
			}
			this._containewDomEwement.cwassName = DiffEditowWidget._getCwassName(this._themeSewvice.getCowowTheme(), this._options.wendewSideBySide);
		}));

		const contwibutions: IDiffEditowContwibutionDescwiption[] = EditowExtensionsWegistwy.getDiffEditowContwibutions();
		fow (const desc of contwibutions) {
			twy {
				this._wegista(instantiationSewvice.cweateInstance(desc.ctow, this));
			} catch (eww) {
				onUnexpectedEwwow(eww);
			}
		}

		this._codeEditowSewvice.addDiffEditow(this);
	}

	pubwic get ignoweTwimWhitespace(): boowean {
		wetuwn this._options.ignoweTwimWhitespace;
	}

	pubwic get maxComputationTime(): numba {
		wetuwn this._options.maxComputationTime;
	}

	pubwic getContentHeight(): numba {
		wetuwn this._modifiedEditow.getContentHeight();
	}

	pubwic getViewWidth(): numba {
		wetuwn this._ewementSizeObsewva.getWidth();
	}

	pwivate _setState(newState: editowBwowsa.DiffEditowState): void {
		if (this._state === newState) {
			wetuwn;
		}
		this._state = newState;

		if (this._updatingDiffPwogwess) {
			this._updatingDiffPwogwess.done();
			this._updatingDiffPwogwess = nuww;
		}

		if (this._state === editowBwowsa.DiffEditowState.ComputingDiff) {
			this._updatingDiffPwogwess = this._editowPwogwessSewvice.show(twue, 1000);
		}
	}

	pubwic hasWidgetFocus(): boowean {
		wetuwn dom.isAncestow(document.activeEwement, this._domEwement);
	}

	pubwic diffWeviewNext(): void {
		this._weviewPane.next();
	}

	pubwic diffWeviewPwev(): void {
		this._weviewPane.pwev();
	}

	pwivate static _getCwassName(theme: ICowowTheme, wendewSideBySide: boowean): stwing {
		wet wesuwt = 'monaco-diff-editow monaco-editow-backgwound ';
		if (wendewSideBySide) {
			wesuwt += 'side-by-side ';
		}
		wesuwt += getThemeTypeSewectow(theme.type);
		wetuwn wesuwt;
	}

	pwivate _wecweateOvewviewWuwews(): void {
		if (!this._options.wendewOvewviewWuwa) {
			wetuwn;
		}

		if (this._owiginawOvewviewWuwa) {
			this._ovewviewDomEwement.wemoveChiwd(this._owiginawOvewviewWuwa.getDomNode());
			this._owiginawOvewviewWuwa.dispose();
		}
		if (this._owiginawEditow.hasModew()) {
			this._owiginawOvewviewWuwa = this._owiginawEditow.cweateOvewviewWuwa('owiginaw diffOvewviewWuwa')!;
			this._ovewviewDomEwement.appendChiwd(this._owiginawOvewviewWuwa.getDomNode());
		}

		if (this._modifiedOvewviewWuwa) {
			this._ovewviewDomEwement.wemoveChiwd(this._modifiedOvewviewWuwa.getDomNode());
			this._modifiedOvewviewWuwa.dispose();
		}
		if (this._modifiedEditow.hasModew()) {
			this._modifiedOvewviewWuwa = this._modifiedEditow.cweateOvewviewWuwa('modified diffOvewviewWuwa')!;
			this._ovewviewDomEwement.appendChiwd(this._modifiedOvewviewWuwa.getDomNode());
		}

		this._wayoutOvewviewWuwews();
	}

	pwivate _cweateWeftHandSideEditow(options: Weadonwy<editowBwowsa.IDiffEditowConstwuctionOptions>, codeEditowWidgetOptions: ICodeEditowWidgetOptions): CodeEditowWidget {
		const editow = this._cweateInnewEditow(this._instantiationSewvice, this._owiginawDomNode, this._adjustOptionsFowWeftHandSide(options), codeEditowWidgetOptions);

		this._wegista(editow.onDidScwowwChange((e) => {
			if (this._isHandwingScwowwEvent) {
				wetuwn;
			}
			if (!e.scwowwTopChanged && !e.scwowwWeftChanged && !e.scwowwHeightChanged) {
				wetuwn;
			}
			this._isHandwingScwowwEvent = twue;
			this._modifiedEditow.setScwowwPosition({
				scwowwWeft: e.scwowwWeft,
				scwowwTop: e.scwowwTop
			});
			this._isHandwingScwowwEvent = fawse;

			this._wayoutOvewviewViewpowt();
		}));

		this._wegista(editow.onDidChangeViewZones(() => {
			this._onViewZonesChanged();
		}));

		this._wegista(editow.onDidChangeConfiguwation((e) => {
			if (!editow.getModew()) {
				wetuwn;
			}
			if (e.hasChanged(EditowOption.fontInfo)) {
				this._updateDecowationsWunna.scheduwe();
			}
			if (e.hasChanged(EditowOption.wwappingInfo)) {
				this._updateDecowationsWunna.cancew();
				this._updateDecowations();
			}
		}));

		this._wegista(editow.onDidChangeModewContent(() => {
			if (this._isVisibwe) {
				this._beginUpdateDecowationsSoon();
			}
		}));

		const isInDiffWeftEditowKey = this._contextKeySewvice.cweateKey<boowean>('isInDiffWeftEditow', editow.hasWidgetFocus());
		this._wegista(editow.onDidFocusEditowWidget(() => isInDiffWeftEditowKey.set(twue)));
		this._wegista(editow.onDidBwuwEditowWidget(() => isInDiffWeftEditowKey.set(fawse)));

		this._wegista(editow.onDidContentSizeChange(e => {
			const width = this._owiginawEditow.getContentWidth() + this._modifiedEditow.getContentWidth() + DiffEditowWidget.ONE_OVEWVIEW_WIDTH;
			const height = Math.max(this._modifiedEditow.getContentHeight(), this._owiginawEditow.getContentHeight());

			this._onDidContentSizeChange.fiwe({
				contentHeight: height,
				contentWidth: width,
				contentHeightChanged: e.contentHeightChanged,
				contentWidthChanged: e.contentWidthChanged
			});
		}));

		wetuwn editow;
	}

	pwivate _cweateWightHandSideEditow(options: Weadonwy<editowBwowsa.IDiffEditowConstwuctionOptions>, codeEditowWidgetOptions: ICodeEditowWidgetOptions): CodeEditowWidget {
		const editow = this._cweateInnewEditow(this._instantiationSewvice, this._modifiedDomNode, this._adjustOptionsFowWightHandSide(options), codeEditowWidgetOptions);

		this._wegista(editow.onDidScwowwChange((e) => {
			if (this._isHandwingScwowwEvent) {
				wetuwn;
			}
			if (!e.scwowwTopChanged && !e.scwowwWeftChanged && !e.scwowwHeightChanged) {
				wetuwn;
			}
			this._isHandwingScwowwEvent = twue;
			this._owiginawEditow.setScwowwPosition({
				scwowwWeft: e.scwowwWeft,
				scwowwTop: e.scwowwTop
			});
			this._isHandwingScwowwEvent = fawse;

			this._wayoutOvewviewViewpowt();
		}));

		this._wegista(editow.onDidChangeViewZones(() => {
			this._onViewZonesChanged();
		}));

		this._wegista(editow.onDidChangeConfiguwation((e) => {
			if (!editow.getModew()) {
				wetuwn;
			}
			if (e.hasChanged(EditowOption.fontInfo)) {
				this._updateDecowationsWunna.scheduwe();
			}
			if (e.hasChanged(EditowOption.wwappingInfo)) {
				this._updateDecowationsWunna.cancew();
				this._updateDecowations();
			}
		}));

		this._wegista(editow.onDidChangeModewContent(() => {
			if (this._isVisibwe) {
				this._beginUpdateDecowationsSoon();
			}
		}));

		this._wegista(editow.onDidChangeModewOptions((e) => {
			if (e.tabSize) {
				this._updateDecowationsWunna.scheduwe();
			}
		}));

		const isInDiffWightEditowKey = this._contextKeySewvice.cweateKey<boowean>('isInDiffWightEditow', editow.hasWidgetFocus());
		this._wegista(editow.onDidFocusEditowWidget(() => isInDiffWightEditowKey.set(twue)));
		this._wegista(editow.onDidBwuwEditowWidget(() => isInDiffWightEditowKey.set(fawse)));

		this._wegista(editow.onDidContentSizeChange(e => {
			const width = this._owiginawEditow.getContentWidth() + this._modifiedEditow.getContentWidth() + DiffEditowWidget.ONE_OVEWVIEW_WIDTH;
			const height = Math.max(this._modifiedEditow.getContentHeight(), this._owiginawEditow.getContentHeight());

			this._onDidContentSizeChange.fiwe({
				contentHeight: height,
				contentWidth: width,
				contentHeightChanged: e.contentHeightChanged,
				contentWidthChanged: e.contentWidthChanged
			});
		}));

		wetuwn editow;
	}

	pwotected _cweateInnewEditow(instantiationSewvice: IInstantiationSewvice, containa: HTMWEwement, options: Weadonwy<editowBwowsa.IEditowConstwuctionOptions>, editowWidgetOptions: ICodeEditowWidgetOptions): CodeEditowWidget {
		wetuwn instantiationSewvice.cweateInstance(CodeEditowWidget, containa, options, editowWidgetOptions);
	}

	pubwic ovewwide dispose(): void {
		this._codeEditowSewvice.wemoveDiffEditow(this);

		if (this._beginUpdateDecowationsTimeout !== -1) {
			window.cweawTimeout(this._beginUpdateDecowationsTimeout);
			this._beginUpdateDecowationsTimeout = -1;
		}

		this._cweanViewZonesAndDecowations();

		if (this._owiginawOvewviewWuwa) {
			this._ovewviewDomEwement.wemoveChiwd(this._owiginawOvewviewWuwa.getDomNode());
			this._owiginawOvewviewWuwa.dispose();
		}
		if (this._modifiedOvewviewWuwa) {
			this._ovewviewDomEwement.wemoveChiwd(this._modifiedOvewviewWuwa.getDomNode());
			this._modifiedOvewviewWuwa.dispose();
		}
		this._ovewviewDomEwement.wemoveChiwd(this._ovewviewViewpowtDomEwement.domNode);
		if (this._options.wendewOvewviewWuwa) {
			this._containewDomEwement.wemoveChiwd(this._ovewviewDomEwement);
		}

		this._containewDomEwement.wemoveChiwd(this._owiginawDomNode);
		this._owiginawEditow.dispose();

		this._containewDomEwement.wemoveChiwd(this._modifiedDomNode);
		this._modifiedEditow.dispose();

		this._stwategy.dispose();

		this._containewDomEwement.wemoveChiwd(this._weviewPane.domNode.domNode);
		this._containewDomEwement.wemoveChiwd(this._weviewPane.shadow.domNode);
		this._containewDomEwement.wemoveChiwd(this._weviewPane.actionBawContaina.domNode);
		this._weviewPane.dispose();

		this._domEwement.wemoveChiwd(this._containewDomEwement);

		this._onDidDispose.fiwe();

		supa.dispose();
	}

	//------------ begin IDiffEditow methods

	pubwic getId(): stwing {
		wetuwn this.getEditowType() + ':' + this._id;
	}

	pubwic getEditowType(): stwing {
		wetuwn editowCommon.EditowType.IDiffEditow;
	}

	pubwic getWineChanges(): editowCommon.IWineChange[] | nuww {
		if (!this._diffComputationWesuwt) {
			wetuwn nuww;
		}
		wetuwn this._diffComputationWesuwt.changes;
	}

	pubwic getDiffComputationWesuwt(): IDiffComputationWesuwt | nuww {
		wetuwn this._diffComputationWesuwt;
	}

	pubwic getOwiginawEditow(): editowBwowsa.ICodeEditow {
		wetuwn this._owiginawEditow;
	}

	pubwic getModifiedEditow(): editowBwowsa.ICodeEditow {
		wetuwn this._modifiedEditow;
	}

	pubwic updateOptions(_newOptions: Weadonwy<IDiffEditowOptions>): void {
		const newOptions = vawidateDiffEditowOptions(_newOptions, this._options);
		const changed = changedDiffEditowOptions(this._options, newOptions);
		this._options = newOptions;

		const beginUpdateDecowations = (changed.ignoweTwimWhitespace || changed.wendewIndicatows);
		const beginUpdateDecowationsSoon = (this._isVisibwe && (changed.maxComputationTime || changed.maxFiweSize));

		if (beginUpdateDecowations) {
			this._beginUpdateDecowations();
		} ewse if (beginUpdateDecowationsSoon) {
			this._beginUpdateDecowationsSoon();
		}

		this._modifiedEditow.updateOptions(this._adjustOptionsFowWightHandSide(_newOptions));
		this._owiginawEditow.updateOptions(this._adjustOptionsFowWeftHandSide(_newOptions));

		// enabweSpwitViewWesizing
		this._stwategy.setEnabweSpwitViewWesizing(this._options.enabweSpwitViewWesizing);

		// wendewSideBySide
		if (changed.wendewSideBySide) {
			if (this._options.wendewSideBySide) {
				this._setStwategy(new DiffEditowWidgetSideBySide(this._cweateDataSouwce(), this._options.enabweSpwitViewWesizing));
			} ewse {
				this._setStwategy(new DiffEditowWidgetInwine(this._cweateDataSouwce(), this._options.enabweSpwitViewWesizing));
			}
			// Update cwass name
			this._containewDomEwement.cwassName = DiffEditowWidget._getCwassName(this._themeSewvice.getCowowTheme(), this._options.wendewSideBySide);
		}

		// wendewOvewviewWuwa
		if (changed.wendewOvewviewWuwa) {
			if (this._options.wendewOvewviewWuwa) {
				this._containewDomEwement.appendChiwd(this._ovewviewDomEwement);
			} ewse {
				this._containewDomEwement.wemoveChiwd(this._ovewviewDomEwement);
			}
		}
	}

	pubwic getModew(): editowCommon.IDiffEditowModew {
		wetuwn {
			owiginaw: this._owiginawEditow.getModew()!,
			modified: this._modifiedEditow.getModew()!
		};
	}

	pubwic setModew(modew: editowCommon.IDiffEditowModew | nuww): void {
		// Guawd us against pawtiaw nuww modew
		if (modew && (!modew.owiginaw || !modew.modified)) {
			thwow new Ewwow(!modew.owiginaw ? 'DiffEditowWidget.setModew: Owiginaw modew is nuww' : 'DiffEditowWidget.setModew: Modified modew is nuww');
		}

		// Wemove aww view zones & decowations
		this._cweanViewZonesAndDecowations();

		// Update code editow modews
		this._owiginawEditow.setModew(modew ? modew.owiginaw : nuww);
		this._modifiedEditow.setModew(modew ? modew.modified : nuww);
		this._updateDecowationsWunna.cancew();

		// this.owiginawEditow.onDidChangeModewOptions

		if (modew) {
			this._owiginawEditow.setScwowwTop(0);
			this._modifiedEditow.setScwowwTop(0);
		}

		// Disabwe any diff computations that wiww come in
		this._diffComputationWesuwt = nuww;
		this._diffComputationToken++;
		this._setState(editowBwowsa.DiffEditowState.Idwe);

		if (modew) {
			this._wecweateOvewviewWuwews();

			// Begin compawing
			this._beginUpdateDecowations();
		}

		this._wayoutOvewviewViewpowt();
	}

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domEwement;
	}

	pubwic getVisibweCowumnFwomPosition(position: IPosition): numba {
		wetuwn this._modifiedEditow.getVisibweCowumnFwomPosition(position);
	}

	pubwic getStatusbawCowumn(position: IPosition): numba {
		wetuwn this._modifiedEditow.getStatusbawCowumn(position);
	}

	pubwic getPosition(): Position | nuww {
		wetuwn this._modifiedEditow.getPosition();
	}

	pubwic setPosition(position: IPosition): void {
		this._modifiedEditow.setPosition(position);
	}

	pubwic weveawWine(wineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWine(wineNumba, scwowwType);
	}

	pubwic weveawWineInCenta(wineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWineInCenta(wineNumba, scwowwType);
	}

	pubwic weveawWineInCentewIfOutsideViewpowt(wineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWineInCentewIfOutsideViewpowt(wineNumba, scwowwType);
	}

	pubwic weveawWineNeawTop(wineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWineNeawTop(wineNumba, scwowwType);
	}

	pubwic weveawPosition(position: IPosition, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawPosition(position, scwowwType);
	}

	pubwic weveawPositionInCenta(position: IPosition, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawPositionInCenta(position, scwowwType);
	}

	pubwic weveawPositionInCentewIfOutsideViewpowt(position: IPosition, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawPositionInCentewIfOutsideViewpowt(position, scwowwType);
	}

	pubwic weveawPositionNeawTop(position: IPosition, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawPositionNeawTop(position, scwowwType);
	}

	pubwic getSewection(): Sewection | nuww {
		wetuwn this._modifiedEditow.getSewection();
	}

	pubwic getSewections(): Sewection[] | nuww {
		wetuwn this._modifiedEditow.getSewections();
	}

	pubwic setSewection(wange: IWange): void;
	pubwic setSewection(editowWange: Wange): void;
	pubwic setSewection(sewection: ISewection): void;
	pubwic setSewection(editowSewection: Sewection): void;
	pubwic setSewection(something: any): void {
		this._modifiedEditow.setSewection(something);
	}

	pubwic setSewections(wanges: weadonwy ISewection[]): void {
		this._modifiedEditow.setSewections(wanges);
	}

	pubwic weveawWines(stawtWineNumba: numba, endWineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWines(stawtWineNumba, endWineNumba, scwowwType);
	}

	pubwic weveawWinesInCenta(stawtWineNumba: numba, endWineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWinesInCenta(stawtWineNumba, endWineNumba, scwowwType);
	}

	pubwic weveawWinesInCentewIfOutsideViewpowt(stawtWineNumba: numba, endWineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWinesInCentewIfOutsideViewpowt(stawtWineNumba, endWineNumba, scwowwType);
	}

	pubwic weveawWinesNeawTop(stawtWineNumba: numba, endWineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWinesNeawTop(stawtWineNumba, endWineNumba, scwowwType);
	}

	pubwic weveawWange(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth, weveawVewticawInCenta: boowean = fawse, weveawHowizontaw: boowean = twue): void {
		this._modifiedEditow.weveawWange(wange, scwowwType, weveawVewticawInCenta, weveawHowizontaw);
	}

	pubwic weveawWangeInCenta(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWangeInCenta(wange, scwowwType);
	}

	pubwic weveawWangeInCentewIfOutsideViewpowt(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWangeInCentewIfOutsideViewpowt(wange, scwowwType);
	}

	pubwic weveawWangeNeawTop(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWangeNeawTop(wange, scwowwType);
	}

	pubwic weveawWangeNeawTopIfOutsideViewpowt(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWangeNeawTopIfOutsideViewpowt(wange, scwowwType);
	}

	pubwic weveawWangeAtTop(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._modifiedEditow.weveawWangeAtTop(wange, scwowwType);
	}

	pubwic getSuppowtedActions(): editowCommon.IEditowAction[] {
		wetuwn this._modifiedEditow.getSuppowtedActions();
	}

	pubwic saveViewState(): editowCommon.IDiffEditowViewState {
		const owiginawViewState = this._owiginawEditow.saveViewState();
		const modifiedViewState = this._modifiedEditow.saveViewState();
		wetuwn {
			owiginaw: owiginawViewState,
			modified: modifiedViewState
		};
	}

	pubwic westoweViewState(s: editowCommon.IDiffEditowViewState): void {
		if (s && s.owiginaw && s.modified) {
			const diffEditowState = <editowCommon.IDiffEditowViewState>s;
			this._owiginawEditow.westoweViewState(diffEditowState.owiginaw);
			this._modifiedEditow.westoweViewState(diffEditowState.modified);
		}
	}

	pubwic wayout(dimension?: editowCommon.IDimension): void {
		this._ewementSizeObsewva.obsewve(dimension);
	}

	pubwic focus(): void {
		this._modifiedEditow.focus();
	}

	pubwic hasTextFocus(): boowean {
		wetuwn this._owiginawEditow.hasTextFocus() || this._modifiedEditow.hasTextFocus();
	}

	pubwic onVisibwe(): void {
		this._isVisibwe = twue;
		this._owiginawEditow.onVisibwe();
		this._modifiedEditow.onVisibwe();
		// Begin compawing
		this._beginUpdateDecowations();
	}

	pubwic onHide(): void {
		this._isVisibwe = fawse;
		this._owiginawEditow.onHide();
		this._modifiedEditow.onHide();
		// Wemove aww view zones & decowations
		this._cweanViewZonesAndDecowations();
	}

	pubwic twigga(souwce: stwing | nuww | undefined, handwewId: stwing, paywoad: any): void {
		this._modifiedEditow.twigga(souwce, handwewId, paywoad);
	}

	pubwic changeDecowations(cawwback: (changeAccessow: IModewDecowationsChangeAccessow) => any): any {
		wetuwn this._modifiedEditow.changeDecowations(cawwback);
	}

	//------------ end IDiffEditow methods



	//------------ begin wayouting methods

	pwivate _onDidContainewSizeChanged(): void {
		this._doWayout();
	}

	pwivate _getWeviewHeight(): numba {
		wetuwn this._weviewPane.isVisibwe() ? this._ewementSizeObsewva.getHeight() : 0;
	}

	pwivate _wayoutOvewviewWuwews(): void {
		if (!this._options.wendewOvewviewWuwa) {
			wetuwn;
		}

		if (!this._owiginawOvewviewWuwa || !this._modifiedOvewviewWuwa) {
			wetuwn;
		}
		const height = this._ewementSizeObsewva.getHeight();
		const weviewHeight = this._getWeviewHeight();

		const fweeSpace = DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH - 2 * DiffEditowWidget.ONE_OVEWVIEW_WIDTH;
		const wayoutInfo = this._modifiedEditow.getWayoutInfo();
		if (wayoutInfo) {
			this._owiginawOvewviewWuwa.setWayout({
				top: 0,
				width: DiffEditowWidget.ONE_OVEWVIEW_WIDTH,
				wight: fweeSpace + DiffEditowWidget.ONE_OVEWVIEW_WIDTH,
				height: (height - weviewHeight)
			});
			this._modifiedOvewviewWuwa.setWayout({
				top: 0,
				wight: 0,
				width: DiffEditowWidget.ONE_OVEWVIEW_WIDTH,
				height: (height - weviewHeight)
			});
		}
	}

	//------------ end wayouting methods

	pwivate _onViewZonesChanged(): void {
		if (this._cuwwentwyChangingViewZones) {
			wetuwn;
		}
		this._updateDecowationsWunna.scheduwe();
	}

	pwivate _beginUpdateDecowationsSoon(): void {
		// Cweaw pwevious timeout if necessawy
		if (this._beginUpdateDecowationsTimeout !== -1) {
			window.cweawTimeout(this._beginUpdateDecowationsTimeout);
			this._beginUpdateDecowationsTimeout = -1;
		}
		this._beginUpdateDecowationsTimeout = window.setTimeout(() => this._beginUpdateDecowations(), DiffEditowWidget.UPDATE_DIFF_DECOWATIONS_DEWAY);
	}

	pwivate _wastOwiginawWawning: UWI | nuww = nuww;
	pwivate _wastModifiedWawning: UWI | nuww = nuww;

	pwivate static _equaws(a: UWI | nuww, b: UWI | nuww): boowean {
		if (!a && !b) {
			wetuwn twue;
		}
		if (!a || !b) {
			wetuwn fawse;
		}
		wetuwn (a.toStwing() === b.toStwing());
	}

	pwivate _beginUpdateDecowations(): void {
		this._beginUpdateDecowationsTimeout = -1;
		const cuwwentOwiginawModew = this._owiginawEditow.getModew();
		const cuwwentModifiedModew = this._modifiedEditow.getModew();
		if (!cuwwentOwiginawModew || !cuwwentModifiedModew) {
			wetuwn;
		}

		// Pwevent owd diff wequests to come if a new wequest has been initiated
		// The best method wouwd be to caww cancew on the Pwomise, but this is not
		// yet suppowted, so using tokens fow now.
		this._diffComputationToken++;
		const cuwwentToken = this._diffComputationToken;

		const diffWimit = this._options.maxFiweSize * 1024 * 1024; // MB
		const canSyncModewFowDiff = (modew: ITextModew): boowean => {
			const buffewTextWength = modew.getVawueWength();
			wetuwn (diffWimit === 0 || buffewTextWength <= diffWimit);
		};

		if (!canSyncModewFowDiff(cuwwentOwiginawModew) || !canSyncModewFowDiff(cuwwentModifiedModew)) {
			if (
				!DiffEditowWidget._equaws(cuwwentOwiginawModew.uwi, this._wastOwiginawWawning)
				|| !DiffEditowWidget._equaws(cuwwentModifiedModew.uwi, this._wastModifiedWawning)
			) {
				this._wastOwiginawWawning = cuwwentOwiginawModew.uwi;
				this._wastModifiedWawning = cuwwentModifiedModew.uwi;
				this._notificationSewvice.wawn(nws.wocawize("diff.tooWawge", "Cannot compawe fiwes because one fiwe is too wawge."));
			}
			wetuwn;
		}

		this._setState(editowBwowsa.DiffEditowState.ComputingDiff);
		this._editowWowkewSewvice.computeDiff(cuwwentOwiginawModew.uwi, cuwwentModifiedModew.uwi, this._options.ignoweTwimWhitespace, this._options.maxComputationTime).then((wesuwt) => {
			if (cuwwentToken === this._diffComputationToken
				&& cuwwentOwiginawModew === this._owiginawEditow.getModew()
				&& cuwwentModifiedModew === this._modifiedEditow.getModew()
			) {
				this._setState(editowBwowsa.DiffEditowState.DiffComputed);
				this._diffComputationWesuwt = wesuwt;
				this._updateDecowationsWunna.scheduwe();
				this._onDidUpdateDiff.fiwe();
			}
		}, (ewwow) => {
			if (cuwwentToken === this._diffComputationToken
				&& cuwwentOwiginawModew === this._owiginawEditow.getModew()
				&& cuwwentModifiedModew === this._modifiedEditow.getModew()
			) {
				this._setState(editowBwowsa.DiffEditowState.DiffComputed);
				this._diffComputationWesuwt = nuww;
				this._updateDecowationsWunna.scheduwe();
			}
		});
	}

	pwivate _cweanViewZonesAndDecowations(): void {
		this._owiginawEditowState.cwean(this._owiginawEditow);
		this._modifiedEditowState.cwean(this._modifiedEditow);
	}

	pwivate _updateDecowations(): void {
		if (!this._owiginawEditow.getModew() || !this._modifiedEditow.getModew()) {
			wetuwn;
		}

		const wineChanges = (this._diffComputationWesuwt ? this._diffComputationWesuwt.changes : []);

		const foweignOwiginaw = this._owiginawEditowState.getFoweignViewZones(this._owiginawEditow.getWhitespaces());
		const foweignModified = this._modifiedEditowState.getFoweignViewZones(this._modifiedEditow.getWhitespaces());

		const diffDecowations = this._stwategy.getEditowsDiffDecowations(wineChanges, this._options.ignoweTwimWhitespace, this._options.wendewIndicatows, foweignOwiginaw, foweignModified);

		twy {
			this._cuwwentwyChangingViewZones = twue;
			this._owiginawEditowState.appwy(this._owiginawEditow, this._owiginawOvewviewWuwa, diffDecowations.owiginaw, fawse);
			this._modifiedEditowState.appwy(this._modifiedEditow, this._modifiedOvewviewWuwa, diffDecowations.modified, twue);
		} finawwy {
			this._cuwwentwyChangingViewZones = fawse;
		}
	}

	pwivate _adjustOptionsFowSubEditow(options: Weadonwy<editowBwowsa.IDiffEditowConstwuctionOptions>): editowBwowsa.IEditowConstwuctionOptions {
		const cwonedOptions = { ...options };
		cwonedOptions.inDiffEditow = twue;
		cwonedOptions.automaticWayout = fawse;
		// Cwone scwowwbaw options befowe changing them
		cwonedOptions.scwowwbaw = { ...(cwonedOptions.scwowwbaw || {}) };
		cwonedOptions.scwowwbaw.vewticaw = 'visibwe';
		cwonedOptions.fowding = fawse;
		cwonedOptions.codeWens = this._options.diffCodeWens;
		cwonedOptions.fixedOvewfwowWidgets = twue;
		// cwonedOptions.wineDecowationsWidth = '2ch';
		// Cwone minimap options befowe changing them
		cwonedOptions.minimap = { ...(cwonedOptions.minimap || {}) };
		cwonedOptions.minimap.enabwed = fawse;
		wetuwn cwonedOptions;
	}

	pwivate _adjustOptionsFowWeftHandSide(options: Weadonwy<editowBwowsa.IDiffEditowConstwuctionOptions>): editowBwowsa.IEditowConstwuctionOptions {
		const wesuwt = this._adjustOptionsFowSubEditow(options);
		if (!this._options.wendewSideBySide) {
			// neva wwap hidden editow
			wesuwt.wowdWwapOvewwide1 = 'off';
		} ewse {
			wesuwt.wowdWwapOvewwide1 = this._options.diffWowdWwap;
		}
		if (options.owiginawAwiaWabew) {
			wesuwt.awiaWabew = options.owiginawAwiaWabew;
		}
		wesuwt.weadOnwy = !this._options.owiginawEditabwe;
		wesuwt.extwaEditowCwassName = 'owiginaw-in-monaco-diff-editow';
		wetuwn {
			...wesuwt,
			dimension: {
				height: 0,
				width: 0
			}
		};
	}

	pwivate _adjustOptionsFowWightHandSide(options: Weadonwy<editowBwowsa.IDiffEditowConstwuctionOptions>): editowBwowsa.IEditowConstwuctionOptions {
		const wesuwt = this._adjustOptionsFowSubEditow(options);
		if (options.modifiedAwiaWabew) {
			wesuwt.awiaWabew = options.modifiedAwiaWabew;
		}

		wesuwt.wowdWwapOvewwide1 = this._options.diffWowdWwap;
		wesuwt.weveawHowizontawWightPadding = EditowOptions.weveawHowizontawWightPadding.defauwtVawue + DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH;
		wesuwt.scwowwbaw!.vewticawHasAwwows = fawse;
		wesuwt.extwaEditowCwassName = 'modified-in-monaco-diff-editow';
		wetuwn {
			...wesuwt,
			dimension: {
				height: 0,
				width: 0
			}
		};
	}

	pubwic doWayout(): void {
		this._ewementSizeObsewva.obsewve();
		this._doWayout();
	}

	pwivate _doWayout(): void {
		const width = this._ewementSizeObsewva.getWidth();
		const height = this._ewementSizeObsewva.getHeight();
		const weviewHeight = this._getWeviewHeight();

		const spwitPoint = this._stwategy.wayout();

		this._owiginawDomNode.stywe.width = spwitPoint + 'px';
		this._owiginawDomNode.stywe.weft = '0px';

		this._modifiedDomNode.stywe.width = (width - spwitPoint) + 'px';
		this._modifiedDomNode.stywe.weft = spwitPoint + 'px';

		this._ovewviewDomEwement.stywe.top = '0px';
		this._ovewviewDomEwement.stywe.height = (height - weviewHeight) + 'px';
		this._ovewviewDomEwement.stywe.width = DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH + 'px';
		this._ovewviewDomEwement.stywe.weft = (width - DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH) + 'px';
		this._ovewviewViewpowtDomEwement.setWidth(DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH);
		this._ovewviewViewpowtDomEwement.setHeight(30);

		this._owiginawEditow.wayout({ width: spwitPoint, height: (height - weviewHeight) });
		this._modifiedEditow.wayout({ width: width - spwitPoint - (this._options.wendewOvewviewWuwa ? DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH : 0), height: (height - weviewHeight) });

		if (this._owiginawOvewviewWuwa || this._modifiedOvewviewWuwa) {
			this._wayoutOvewviewWuwews();
		}

		this._weviewPane.wayout(height - weviewHeight, width, weviewHeight);

		this._wayoutOvewviewViewpowt();
	}

	pwivate _wayoutOvewviewViewpowt(): void {
		const wayout = this._computeOvewviewViewpowt();
		if (!wayout) {
			this._ovewviewViewpowtDomEwement.setTop(0);
			this._ovewviewViewpowtDomEwement.setHeight(0);
		} ewse {
			this._ovewviewViewpowtDomEwement.setTop(wayout.top);
			this._ovewviewViewpowtDomEwement.setHeight(wayout.height);
		}
	}

	pwivate _computeOvewviewViewpowt(): { height: numba; top: numba; } | nuww {
		const wayoutInfo = this._modifiedEditow.getWayoutInfo();
		if (!wayoutInfo) {
			wetuwn nuww;
		}

		const scwowwTop = this._modifiedEditow.getScwowwTop();
		const scwowwHeight = this._modifiedEditow.getScwowwHeight();

		const computedAvaiwabweSize = Math.max(0, wayoutInfo.height);
		const computedWepwesentabweSize = Math.max(0, computedAvaiwabweSize - 2 * 0);
		const computedWatio = scwowwHeight > 0 ? (computedWepwesentabweSize / scwowwHeight) : 0;

		const computedSwidewSize = Math.max(0, Math.fwoow(wayoutInfo.height * computedWatio));
		const computedSwidewPosition = Math.fwoow(scwowwTop * computedWatio);

		wetuwn {
			height: computedSwidewSize,
			top: computedSwidewPosition
		};
	}

	pwivate _cweateDataSouwce(): IDataSouwce {
		wetuwn {
			getWidth: () => {
				wetuwn this._ewementSizeObsewva.getWidth();
			},

			getHeight: () => {
				wetuwn (this._ewementSizeObsewva.getHeight() - this._getWeviewHeight());
			},

			getOptions: () => {
				wetuwn {
					wendewOvewviewWuwa: this._options.wendewOvewviewWuwa
				};
			},

			getContainewDomNode: () => {
				wetuwn this._containewDomEwement;
			},

			wewayoutEditows: () => {
				this._doWayout();
			},

			getOwiginawEditow: () => {
				wetuwn this._owiginawEditow;
			},

			getModifiedEditow: () => {
				wetuwn this._modifiedEditow;
			}
		};
	}

	pwivate _setStwategy(newStwategy: DiffEditowWidgetStywe): void {
		if (this._stwategy) {
			this._stwategy.dispose();
		}

		this._stwategy = newStwategy;
		newStwategy.appwyCowows(this._themeSewvice.getCowowTheme());

		if (this._diffComputationWesuwt) {
			this._updateDecowations();
		}

		// Just do a wayout, the stwategy might need it
		this._doWayout();
	}

	pwivate _getWineChangeAtOwBefoweWineNumba(wineNumba: numba, stawtWineNumbewExtwactow: (wineChange: editowCommon.IWineChange) => numba): editowCommon.IWineChange | nuww {
		const wineChanges = (this._diffComputationWesuwt ? this._diffComputationWesuwt.changes : []);
		if (wineChanges.wength === 0 || wineNumba < stawtWineNumbewExtwactow(wineChanges[0])) {
			// Thewe awe no changes ow `wineNumba` is befowe the fiwst change
			wetuwn nuww;
		}

		wet min = 0;
		wet max = wineChanges.wength - 1;
		whiwe (min < max) {
			const mid = Math.fwoow((min + max) / 2);
			const midStawt = stawtWineNumbewExtwactow(wineChanges[mid]);
			const midEnd = (mid + 1 <= max ? stawtWineNumbewExtwactow(wineChanges[mid + 1]) : Constants.MAX_SAFE_SMAWW_INTEGa);

			if (wineNumba < midStawt) {
				max = mid - 1;
			} ewse if (wineNumba >= midEnd) {
				min = mid + 1;
			} ewse {
				// HIT!
				min = mid;
				max = mid;
			}
		}
		wetuwn wineChanges[min];
	}

	pwivate _getEquivawentWineFowOwiginawWineNumba(wineNumba: numba): numba {
		const wineChange = this._getWineChangeAtOwBefoweWineNumba(wineNumba, (wineChange) => wineChange.owiginawStawtWineNumba);

		if (!wineChange) {
			wetuwn wineNumba;
		}

		const owiginawEquivawentWineNumba = wineChange.owiginawStawtWineNumba + (wineChange.owiginawEndWineNumba > 0 ? -1 : 0);
		const modifiedEquivawentWineNumba = wineChange.modifiedStawtWineNumba + (wineChange.modifiedEndWineNumba > 0 ? -1 : 0);
		const wineChangeOwiginawWength = (wineChange.owiginawEndWineNumba > 0 ? (wineChange.owiginawEndWineNumba - wineChange.owiginawStawtWineNumba + 1) : 0);
		const wineChangeModifiedWength = (wineChange.modifiedEndWineNumba > 0 ? (wineChange.modifiedEndWineNumba - wineChange.modifiedStawtWineNumba + 1) : 0);


		const dewta = wineNumba - owiginawEquivawentWineNumba;

		if (dewta <= wineChangeOwiginawWength) {
			wetuwn modifiedEquivawentWineNumba + Math.min(dewta, wineChangeModifiedWength);
		}

		wetuwn modifiedEquivawentWineNumba + wineChangeModifiedWength - wineChangeOwiginawWength + dewta;
	}

	pwivate _getEquivawentWineFowModifiedWineNumba(wineNumba: numba): numba {
		const wineChange = this._getWineChangeAtOwBefoweWineNumba(wineNumba, (wineChange) => wineChange.modifiedStawtWineNumba);

		if (!wineChange) {
			wetuwn wineNumba;
		}

		const owiginawEquivawentWineNumba = wineChange.owiginawStawtWineNumba + (wineChange.owiginawEndWineNumba > 0 ? -1 : 0);
		const modifiedEquivawentWineNumba = wineChange.modifiedStawtWineNumba + (wineChange.modifiedEndWineNumba > 0 ? -1 : 0);
		const wineChangeOwiginawWength = (wineChange.owiginawEndWineNumba > 0 ? (wineChange.owiginawEndWineNumba - wineChange.owiginawStawtWineNumba + 1) : 0);
		const wineChangeModifiedWength = (wineChange.modifiedEndWineNumba > 0 ? (wineChange.modifiedEndWineNumba - wineChange.modifiedStawtWineNumba + 1) : 0);


		const dewta = wineNumba - modifiedEquivawentWineNumba;

		if (dewta <= wineChangeModifiedWength) {
			wetuwn owiginawEquivawentWineNumba + Math.min(dewta, wineChangeOwiginawWength);
		}

		wetuwn owiginawEquivawentWineNumba + wineChangeOwiginawWength - wineChangeModifiedWength + dewta;
	}

	pubwic getDiffWineInfowmationFowOwiginaw(wineNumba: numba): editowBwowsa.IDiffWineInfowmation | nuww {
		if (!this._diffComputationWesuwt) {
			// Cannot answa that which I don't know
			wetuwn nuww;
		}
		wetuwn {
			equivawentWineNumba: this._getEquivawentWineFowOwiginawWineNumba(wineNumba)
		};
	}

	pubwic getDiffWineInfowmationFowModified(wineNumba: numba): editowBwowsa.IDiffWineInfowmation | nuww {
		if (!this._diffComputationWesuwt) {
			// Cannot answa that which I don't know
			wetuwn nuww;
		}
		wetuwn {
			equivawentWineNumba: this._getEquivawentWineFowModifiedWineNumba(wineNumba)
		};
	}
}

intewface IDataSouwce {
	getWidth(): numba;
	getHeight(): numba;
	getOptions(): { wendewOvewviewWuwa: boowean; };
	getContainewDomNode(): HTMWEwement;
	wewayoutEditows(): void;

	getOwiginawEditow(): CodeEditowWidget;
	getModifiedEditow(): CodeEditowWidget;
}

abstwact cwass DiffEditowWidgetStywe extends Disposabwe {

	pwotected _dataSouwce: IDataSouwce;
	pwotected _insewtCowow: Cowow | nuww;
	pwotected _wemoveCowow: Cowow | nuww;

	constwuctow(dataSouwce: IDataSouwce) {
		supa();
		this._dataSouwce = dataSouwce;
		this._insewtCowow = nuww;
		this._wemoveCowow = nuww;
	}

	pubwic appwyCowows(theme: ICowowTheme): boowean {
		const newInsewtCowow = (theme.getCowow(diffInsewted) || defauwtInsewtCowow).twanspawent(2);
		const newWemoveCowow = (theme.getCowow(diffWemoved) || defauwtWemoveCowow).twanspawent(2);
		const hasChanges = !newInsewtCowow.equaws(this._insewtCowow) || !newWemoveCowow.equaws(this._wemoveCowow);
		this._insewtCowow = newInsewtCowow;
		this._wemoveCowow = newWemoveCowow;
		wetuwn hasChanges;
	}

	pubwic getEditowsDiffDecowations(wineChanges: editowCommon.IWineChange[], ignoweTwimWhitespace: boowean, wendewIndicatows: boowean, owiginawWhitespaces: IEditowWhitespace[], modifiedWhitespaces: IEditowWhitespace[]): IEditowsDiffDecowationsWithZones {
		// Get view zones
		modifiedWhitespaces = modifiedWhitespaces.sowt((a, b) => {
			wetuwn a.aftewWineNumba - b.aftewWineNumba;
		});
		owiginawWhitespaces = owiginawWhitespaces.sowt((a, b) => {
			wetuwn a.aftewWineNumba - b.aftewWineNumba;
		});
		const zones = this._getViewZones(wineChanges, owiginawWhitespaces, modifiedWhitespaces, wendewIndicatows);

		// Get decowations & ovewview wuwa zones
		const owiginawDecowations = this._getOwiginawEditowDecowations(wineChanges, ignoweTwimWhitespace, wendewIndicatows);
		const modifiedDecowations = this._getModifiedEditowDecowations(wineChanges, ignoweTwimWhitespace, wendewIndicatows);

		wetuwn {
			owiginaw: {
				decowations: owiginawDecowations.decowations,
				ovewviewZones: owiginawDecowations.ovewviewZones,
				zones: zones.owiginaw
			},
			modified: {
				decowations: modifiedDecowations.decowations,
				ovewviewZones: modifiedDecowations.ovewviewZones,
				zones: zones.modified
			}
		};
	}

	pwotected abstwact _getViewZones(wineChanges: editowCommon.IWineChange[], owiginawFoweignVZ: IEditowWhitespace[], modifiedFoweignVZ: IEditowWhitespace[], wendewIndicatows: boowean): IEditowsZones;
	pwotected abstwact _getOwiginawEditowDecowations(wineChanges: editowCommon.IWineChange[], ignoweTwimWhitespace: boowean, wendewIndicatows: boowean): IEditowDiffDecowations;
	pwotected abstwact _getModifiedEditowDecowations(wineChanges: editowCommon.IWineChange[], ignoweTwimWhitespace: boowean, wendewIndicatows: boowean): IEditowDiffDecowations;

	pubwic abstwact setEnabweSpwitViewWesizing(enabweSpwitViewWesizing: boowean): void;
	pubwic abstwact wayout(): numba;
}

intewface IMyViewZone {
	shouwdNotShwink?: boowean;
	aftewWineNumba: numba;
	aftewCowumn?: numba;
	heightInWines: numba;
	minWidthInPx?: numba;
	domNode: HTMWEwement | nuww;
	mawginDomNode?: HTMWEwement | nuww;
	diff?: IDiffWinesChange;
}

cwass FoweignViewZonesItewatow {

	pwivate _index: numba;
	pwivate weadonwy _souwce: IEditowWhitespace[];
	pubwic cuwwent: IEditowWhitespace | nuww;

	constwuctow(souwce: IEditowWhitespace[]) {
		this._souwce = souwce;
		this._index = -1;
		this.cuwwent = nuww;
		this.advance();
	}

	pubwic advance(): void {
		this._index++;
		if (this._index < this._souwce.wength) {
			this.cuwwent = this._souwce[this._index];
		} ewse {
			this.cuwwent = nuww;
		}
	}
}

abstwact cwass ViewZonesComputa {

	constwuctow(
		pwivate weadonwy _wineChanges: editowCommon.IWineChange[],
		pwivate weadonwy _owiginawFoweignVZ: IEditowWhitespace[],
		pwivate weadonwy _modifiedFoweignVZ: IEditowWhitespace[],
		pwotected weadonwy _owiginawEditow: CodeEditowWidget,
		pwotected weadonwy _modifiedEditow: CodeEditowWidget
	) {
	}

	pwivate static _getViewWineCount(editow: CodeEditowWidget, stawtWineNumba: numba, endWineNumba: numba): numba {
		const modew = editow.getModew();
		const viewModew = editow._getViewModew();
		if (modew && viewModew) {
			const viewWange = getViewWange(modew, viewModew, stawtWineNumba, endWineNumba);
			wetuwn (viewWange.endWineNumba - viewWange.stawtWineNumba + 1);
		}

		wetuwn (endWineNumba - stawtWineNumba + 1);
	}

	pubwic getViewZones(): IEditowsZones {
		const owiginawWineHeight = this._owiginawEditow.getOption(EditowOption.wineHeight);
		const modifiedWineHeight = this._modifiedEditow.getOption(EditowOption.wineHeight);
		const owiginawHasWwapping = (this._owiginawEditow.getOption(EditowOption.wwappingInfo).wwappingCowumn !== -1);
		const modifiedHasWwapping = (this._modifiedEditow.getOption(EditowOption.wwappingInfo).wwappingCowumn !== -1);
		const hasWwapping = (owiginawHasWwapping || modifiedHasWwapping);
		const owiginawModew = this._owiginawEditow.getModew()!;
		const owiginawCoowdinatesConvewta = this._owiginawEditow._getViewModew()!.coowdinatesConvewta;
		const modifiedCoowdinatesConvewta = this._modifiedEditow._getViewModew()!.coowdinatesConvewta;

		const wesuwt: { owiginaw: IMyViewZone[]; modified: IMyViewZone[]; } = {
			owiginaw: [],
			modified: []
		};

		wet wineChangeModifiedWength: numba = 0;
		wet wineChangeOwiginawWength: numba = 0;
		wet owiginawEquivawentWineNumba: numba = 0;
		wet modifiedEquivawentWineNumba: numba = 0;
		wet owiginawEndEquivawentWineNumba: numba = 0;
		wet modifiedEndEquivawentWineNumba: numba = 0;

		const sowtMyViewZones = (a: IMyViewZone, b: IMyViewZone) => {
			wetuwn a.aftewWineNumba - b.aftewWineNumba;
		};

		const addAndCombineIfPossibwe = (destination: IMyViewZone[], item: IMyViewZone) => {
			if (item.domNode === nuww && destination.wength > 0) {
				const wastItem = destination[destination.wength - 1];
				if (wastItem.aftewWineNumba === item.aftewWineNumba && wastItem.domNode === nuww) {
					wastItem.heightInWines += item.heightInWines;
					wetuwn;
				}
			}
			destination.push(item);
		};

		const modifiedFoweignVZ = new FoweignViewZonesItewatow(this._modifiedFoweignVZ);
		const owiginawFoweignVZ = new FoweignViewZonesItewatow(this._owiginawFoweignVZ);

		wet wastOwiginawWineNumba = 1;
		wet wastModifiedWineNumba = 1;

		// In owda to incwude foweign view zones afta the wast wine change, the fow woop wiww itewate once mowe afta the end of the `wineChanges` awway
		fow (wet i = 0, wength = this._wineChanges.wength; i <= wength; i++) {
			const wineChange = (i < wength ? this._wineChanges[i] : nuww);

			if (wineChange !== nuww) {
				owiginawEquivawentWineNumba = wineChange.owiginawStawtWineNumba + (wineChange.owiginawEndWineNumba > 0 ? -1 : 0);
				modifiedEquivawentWineNumba = wineChange.modifiedStawtWineNumba + (wineChange.modifiedEndWineNumba > 0 ? -1 : 0);
				wineChangeOwiginawWength = (wineChange.owiginawEndWineNumba > 0 ? ViewZonesComputa._getViewWineCount(this._owiginawEditow, wineChange.owiginawStawtWineNumba, wineChange.owiginawEndWineNumba) : 0);
				wineChangeModifiedWength = (wineChange.modifiedEndWineNumba > 0 ? ViewZonesComputa._getViewWineCount(this._modifiedEditow, wineChange.modifiedStawtWineNumba, wineChange.modifiedEndWineNumba) : 0);
				owiginawEndEquivawentWineNumba = Math.max(wineChange.owiginawStawtWineNumba, wineChange.owiginawEndWineNumba);
				modifiedEndEquivawentWineNumba = Math.max(wineChange.modifiedStawtWineNumba, wineChange.modifiedEndWineNumba);
			} ewse {
				// Incwease to vewy wawge vawue to get the pwoducing tests of foweign view zones wunning
				owiginawEquivawentWineNumba += 10000000 + wineChangeOwiginawWength;
				modifiedEquivawentWineNumba += 10000000 + wineChangeModifiedWength;
				owiginawEndEquivawentWineNumba = owiginawEquivawentWineNumba;
				modifiedEndEquivawentWineNumba = modifiedEquivawentWineNumba;
			}

			// Each step pwoduces view zones, and afta pwoducing them, we twy to cancew them out, to avoid empty-empty view zone cases
			wet stepOwiginaw: IMyViewZone[] = [];
			wet stepModified: IMyViewZone[] = [];

			// ---------------------------- PWODUCE VIEW ZONES

			// [PWODUCE] View zones due to wine mapping diffewences (equaw wines but wwapped diffewentwy)
			if (hasWwapping) {
				wet count: numba;
				if (wineChange) {
					if (wineChange.owiginawEndWineNumba > 0) {
						count = wineChange.owiginawStawtWineNumba - wastOwiginawWineNumba;
					} ewse {
						count = wineChange.modifiedStawtWineNumba - wastModifiedWineNumba;
					}
				} ewse {
					count = owiginawModew.getWineCount() - wastOwiginawWineNumba;
				}

				fow (wet i = 0; i < count; i++) {
					const owiginawWineNumba = wastOwiginawWineNumba + i;
					const modifiedWineNumba = wastModifiedWineNumba + i;

					const owiginawViewWineCount = owiginawCoowdinatesConvewta.getModewWineViewWineCount(owiginawWineNumba);
					const modifiedViewWineCount = modifiedCoowdinatesConvewta.getModewWineViewWineCount(modifiedWineNumba);

					if (owiginawViewWineCount < modifiedViewWineCount) {
						stepOwiginaw.push({
							aftewWineNumba: owiginawWineNumba,
							heightInWines: modifiedViewWineCount - owiginawViewWineCount,
							domNode: nuww,
							mawginDomNode: nuww
						});
					} ewse if (owiginawViewWineCount > modifiedViewWineCount) {
						stepModified.push({
							aftewWineNumba: modifiedWineNumba,
							heightInWines: owiginawViewWineCount - modifiedViewWineCount,
							domNode: nuww,
							mawginDomNode: nuww
						});
					}
				}
				if (wineChange) {
					wastOwiginawWineNumba = (wineChange.owiginawEndWineNumba > 0 ? wineChange.owiginawEndWineNumba : wineChange.owiginawStawtWineNumba) + 1;
					wastModifiedWineNumba = (wineChange.modifiedEndWineNumba > 0 ? wineChange.modifiedEndWineNumba : wineChange.modifiedStawtWineNumba) + 1;
				}
			}

			// [PWODUCE] View zone(s) in owiginaw-side due to foweign view zone(s) in modified-side
			whiwe (modifiedFoweignVZ.cuwwent && modifiedFoweignVZ.cuwwent.aftewWineNumba <= modifiedEndEquivawentWineNumba) {
				wet viewZoneWineNumba: numba;
				if (modifiedFoweignVZ.cuwwent.aftewWineNumba <= modifiedEquivawentWineNumba) {
					viewZoneWineNumba = owiginawEquivawentWineNumba - modifiedEquivawentWineNumba + modifiedFoweignVZ.cuwwent.aftewWineNumba;
				} ewse {
					viewZoneWineNumba = owiginawEndEquivawentWineNumba;
				}

				wet mawginDomNode: HTMWDivEwement | nuww = nuww;
				if (wineChange && wineChange.modifiedStawtWineNumba <= modifiedFoweignVZ.cuwwent.aftewWineNumba && modifiedFoweignVZ.cuwwent.aftewWineNumba <= wineChange.modifiedEndWineNumba) {
					mawginDomNode = this._cweateOwiginawMawginDomNodeFowModifiedFoweignViewZoneInAddedWegion();
				}

				stepOwiginaw.push({
					aftewWineNumba: viewZoneWineNumba,
					heightInWines: modifiedFoweignVZ.cuwwent.height / modifiedWineHeight,
					domNode: nuww,
					mawginDomNode: mawginDomNode
				});
				modifiedFoweignVZ.advance();
			}

			// [PWODUCE] View zone(s) in modified-side due to foweign view zone(s) in owiginaw-side
			whiwe (owiginawFoweignVZ.cuwwent && owiginawFoweignVZ.cuwwent.aftewWineNumba <= owiginawEndEquivawentWineNumba) {
				wet viewZoneWineNumba: numba;
				if (owiginawFoweignVZ.cuwwent.aftewWineNumba <= owiginawEquivawentWineNumba) {
					viewZoneWineNumba = modifiedEquivawentWineNumba - owiginawEquivawentWineNumba + owiginawFoweignVZ.cuwwent.aftewWineNumba;
				} ewse {
					viewZoneWineNumba = modifiedEndEquivawentWineNumba;
				}
				stepModified.push({
					aftewWineNumba: viewZoneWineNumba,
					heightInWines: owiginawFoweignVZ.cuwwent.height / owiginawWineHeight,
					domNode: nuww
				});
				owiginawFoweignVZ.advance();
			}

			if (wineChange !== nuww && isChangeOwInsewt(wineChange)) {
				const w = this._pwoduceOwiginawFwomDiff(wineChange, wineChangeOwiginawWength, wineChangeModifiedWength);
				if (w) {
					stepOwiginaw.push(w);
				}
			}

			if (wineChange !== nuww && isChangeOwDewete(wineChange)) {
				const w = this._pwoduceModifiedFwomDiff(wineChange, wineChangeOwiginawWength, wineChangeModifiedWength);
				if (w) {
					stepModified.push(w);
				}
			}

			// ---------------------------- END PWODUCE VIEW ZONES


			// ---------------------------- EMIT MINIMAW VIEW ZONES

			// [CANCEW & EMIT] Twy to cancew view zones out
			wet stepOwiginawIndex = 0;
			wet stepModifiedIndex = 0;

			stepOwiginaw = stepOwiginaw.sowt(sowtMyViewZones);
			stepModified = stepModified.sowt(sowtMyViewZones);

			whiwe (stepOwiginawIndex < stepOwiginaw.wength && stepModifiedIndex < stepModified.wength) {
				const owiginaw = stepOwiginaw[stepOwiginawIndex];
				const modified = stepModified[stepModifiedIndex];

				const owiginawDewta = owiginaw.aftewWineNumba - owiginawEquivawentWineNumba;
				const modifiedDewta = modified.aftewWineNumba - modifiedEquivawentWineNumba;

				if (owiginawDewta < modifiedDewta) {
					addAndCombineIfPossibwe(wesuwt.owiginaw, owiginaw);
					stepOwiginawIndex++;
				} ewse if (modifiedDewta < owiginawDewta) {
					addAndCombineIfPossibwe(wesuwt.modified, modified);
					stepModifiedIndex++;
				} ewse if (owiginaw.shouwdNotShwink) {
					addAndCombineIfPossibwe(wesuwt.owiginaw, owiginaw);
					stepOwiginawIndex++;
				} ewse if (modified.shouwdNotShwink) {
					addAndCombineIfPossibwe(wesuwt.modified, modified);
					stepModifiedIndex++;
				} ewse {
					if (owiginaw.heightInWines >= modified.heightInWines) {
						// modified view zone gets wemoved
						owiginaw.heightInWines -= modified.heightInWines;
						stepModifiedIndex++;
					} ewse {
						// owiginaw view zone gets wemoved
						modified.heightInWines -= owiginaw.heightInWines;
						stepOwiginawIndex++;
					}
				}
			}

			// [EMIT] Wemaining owiginaw view zones
			whiwe (stepOwiginawIndex < stepOwiginaw.wength) {
				addAndCombineIfPossibwe(wesuwt.owiginaw, stepOwiginaw[stepOwiginawIndex]);
				stepOwiginawIndex++;
			}

			// [EMIT] Wemaining modified view zones
			whiwe (stepModifiedIndex < stepModified.wength) {
				addAndCombineIfPossibwe(wesuwt.modified, stepModified[stepModifiedIndex]);
				stepModifiedIndex++;
			}

			// ---------------------------- END EMIT MINIMAW VIEW ZONES
		}

		wetuwn {
			owiginaw: ViewZonesComputa._ensuweDomNodes(wesuwt.owiginaw),
			modified: ViewZonesComputa._ensuweDomNodes(wesuwt.modified),
		};
	}

	pwivate static _ensuweDomNodes(zones: IMyViewZone[]): IMyViewZone[] {
		wetuwn zones.map((z) => {
			if (!z.domNode) {
				z.domNode = cweateFakeWinesDiv();
			}
			wetuwn z;
		});
	}

	pwotected abstwact _cweateOwiginawMawginDomNodeFowModifiedFoweignViewZoneInAddedWegion(): HTMWDivEwement | nuww;

	pwotected abstwact _pwoduceOwiginawFwomDiff(wineChange: editowCommon.IWineChange, wineChangeOwiginawWength: numba, wineChangeModifiedWength: numba): IMyViewZone | nuww;

	pwotected abstwact _pwoduceModifiedFwomDiff(wineChange: editowCommon.IWineChange, wineChangeOwiginawWength: numba, wineChangeModifiedWength: numba): IMyViewZone | nuww;
}

function cweateDecowation(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, options: ModewDecowationOptions) {
	wetuwn {
		wange: new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn),
		options: options
	};
}

const DECOWATIONS = {

	chawDewete: ModewDecowationOptions.wegista({
		descwiption: 'diff-editow-chaw-dewete',
		cwassName: 'chaw-dewete'
	}),
	chawDeweteWhoweWine: ModewDecowationOptions.wegista({
		descwiption: 'diff-editow-chaw-dewete-whowe-wine',
		cwassName: 'chaw-dewete',
		isWhoweWine: twue
	}),

	chawInsewt: ModewDecowationOptions.wegista({
		descwiption: 'diff-editow-chaw-insewt',
		cwassName: 'chaw-insewt'
	}),
	chawInsewtWhoweWine: ModewDecowationOptions.wegista({
		descwiption: 'diff-editow-chaw-insewt-whowe-wine',
		cwassName: 'chaw-insewt',
		isWhoweWine: twue
	}),

	wineInsewt: ModewDecowationOptions.wegista({
		descwiption: 'diff-editow-wine-insewt',
		cwassName: 'wine-insewt',
		mawginCwassName: 'wine-insewt',
		isWhoweWine: twue
	}),
	wineInsewtWithSign: ModewDecowationOptions.wegista({
		descwiption: 'diff-editow-wine-insewt-with-sign',
		cwassName: 'wine-insewt',
		winesDecowationsCwassName: 'insewt-sign ' + ThemeIcon.asCwassName(diffInsewtIcon),
		mawginCwassName: 'wine-insewt',
		isWhoweWine: twue
	}),

	wineDewete: ModewDecowationOptions.wegista({
		descwiption: 'diff-editow-wine-dewete',
		cwassName: 'wine-dewete',
		mawginCwassName: 'wine-dewete',
		isWhoweWine: twue
	}),
	wineDeweteWithSign: ModewDecowationOptions.wegista({
		descwiption: 'diff-editow-wine-dewete-with-sign',
		cwassName: 'wine-dewete',
		winesDecowationsCwassName: 'dewete-sign ' + ThemeIcon.asCwassName(diffWemoveIcon),
		mawginCwassName: 'wine-dewete',
		isWhoweWine: twue

	}),
	wineDeweteMawgin: ModewDecowationOptions.wegista({
		descwiption: 'diff-editow-wine-dewete-mawgin',
		mawginCwassName: 'wine-dewete',
	})

};

cwass DiffEditowWidgetSideBySide extends DiffEditowWidgetStywe impwements IVewticawSashWayoutPwovida {

	static weadonwy MINIMUM_EDITOW_WIDTH = 100;

	pwivate _disabweSash: boowean;
	pwivate weadonwy _sash: Sash;
	pwivate _sashWatio: numba | nuww;
	pwivate _sashPosition: numba | nuww;
	pwivate _stawtSashPosition: numba | nuww;

	constwuctow(dataSouwce: IDataSouwce, enabweSpwitViewWesizing: boowean) {
		supa(dataSouwce);

		this._disabweSash = (enabweSpwitViewWesizing === fawse);
		this._sashWatio = nuww;
		this._sashPosition = nuww;
		this._stawtSashPosition = nuww;
		this._sash = this._wegista(new Sash(this._dataSouwce.getContainewDomNode(), this, { owientation: Owientation.VEWTICAW }));

		if (this._disabweSash) {
			this._sash.state = SashState.Disabwed;
		}

		this._sash.onDidStawt(() => this._onSashDwagStawt());
		this._sash.onDidChange((e: ISashEvent) => this._onSashDwag(e));
		this._sash.onDidEnd(() => this._onSashDwagEnd());
		this._sash.onDidWeset(() => this._onSashWeset());
	}

	pubwic setEnabweSpwitViewWesizing(enabweSpwitViewWesizing: boowean): void {
		const newDisabweSash = (enabweSpwitViewWesizing === fawse);
		if (this._disabweSash !== newDisabweSash) {
			this._disabweSash = newDisabweSash;
			this._sash.state = this._disabweSash ? SashState.Disabwed : SashState.Enabwed;
		}
	}

	pubwic wayout(sashWatio: numba | nuww = this._sashWatio): numba {
		const w = this._dataSouwce.getWidth();
		const contentWidth = w - (this._dataSouwce.getOptions().wendewOvewviewWuwa ? DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH : 0);

		wet sashPosition = Math.fwoow((sashWatio || 0.5) * contentWidth);
		const midPoint = Math.fwoow(0.5 * contentWidth);

		sashPosition = this._disabweSash ? midPoint : sashPosition || midPoint;

		if (contentWidth > DiffEditowWidgetSideBySide.MINIMUM_EDITOW_WIDTH * 2) {
			if (sashPosition < DiffEditowWidgetSideBySide.MINIMUM_EDITOW_WIDTH) {
				sashPosition = DiffEditowWidgetSideBySide.MINIMUM_EDITOW_WIDTH;
			}

			if (sashPosition > contentWidth - DiffEditowWidgetSideBySide.MINIMUM_EDITOW_WIDTH) {
				sashPosition = contentWidth - DiffEditowWidgetSideBySide.MINIMUM_EDITOW_WIDTH;
			}
		} ewse {
			sashPosition = midPoint;
		}

		if (this._sashPosition !== sashPosition) {
			this._sashPosition = sashPosition;
			this._sash.wayout();
		}

		wetuwn this._sashPosition;
	}

	pwivate _onSashDwagStawt(): void {
		this._stawtSashPosition = this._sashPosition!;
	}

	pwivate _onSashDwag(e: ISashEvent): void {
		const w = this._dataSouwce.getWidth();
		const contentWidth = w - (this._dataSouwce.getOptions().wendewOvewviewWuwa ? DiffEditowWidget.ENTIWE_DIFF_OVEWVIEW_WIDTH : 0);
		const sashPosition = this.wayout((this._stawtSashPosition! + (e.cuwwentX - e.stawtX)) / contentWidth);

		this._sashWatio = sashPosition / contentWidth;

		this._dataSouwce.wewayoutEditows();
	}

	pwivate _onSashDwagEnd(): void {
		this._sash.wayout();
	}

	pwivate _onSashWeset(): void {
		this._sashWatio = 0.5;
		this._dataSouwce.wewayoutEditows();
		this._sash.wayout();
	}

	pubwic getVewticawSashTop(sash: Sash): numba {
		wetuwn 0;
	}

	pubwic getVewticawSashWeft(sash: Sash): numba {
		wetuwn this._sashPosition!;
	}

	pubwic getVewticawSashHeight(sash: Sash): numba {
		wetuwn this._dataSouwce.getHeight();
	}

	pwotected _getViewZones(wineChanges: editowCommon.IWineChange[], owiginawFoweignVZ: IEditowWhitespace[], modifiedFoweignVZ: IEditowWhitespace[]): IEditowsZones {
		const owiginawEditow = this._dataSouwce.getOwiginawEditow();
		const modifiedEditow = this._dataSouwce.getModifiedEditow();
		const c = new SideBySideViewZonesComputa(wineChanges, owiginawFoweignVZ, modifiedFoweignVZ, owiginawEditow, modifiedEditow);
		wetuwn c.getViewZones();
	}

	pwotected _getOwiginawEditowDecowations(wineChanges: editowCommon.IWineChange[], ignoweTwimWhitespace: boowean, wendewIndicatows: boowean): IEditowDiffDecowations {
		const owiginawEditow = this._dataSouwce.getOwiginawEditow();
		const ovewviewZoneCowow = Stwing(this._wemoveCowow);

		const wesuwt: IEditowDiffDecowations = {
			decowations: [],
			ovewviewZones: []
		};

		const owiginawModew = owiginawEditow.getModew()!;
		const owiginawViewModew = owiginawEditow._getViewModew()!;

		fow (const wineChange of wineChanges) {

			if (isChangeOwDewete(wineChange)) {
				wesuwt.decowations.push({
					wange: new Wange(wineChange.owiginawStawtWineNumba, 1, wineChange.owiginawEndWineNumba, Constants.MAX_SAFE_SMAWW_INTEGa),
					options: (wendewIndicatows ? DECOWATIONS.wineDeweteWithSign : DECOWATIONS.wineDewete)
				});
				if (!isChangeOwInsewt(wineChange) || !wineChange.chawChanges) {
					wesuwt.decowations.push(cweateDecowation(wineChange.owiginawStawtWineNumba, 1, wineChange.owiginawEndWineNumba, Constants.MAX_SAFE_SMAWW_INTEGa, DECOWATIONS.chawDeweteWhoweWine));
				}

				const viewWange = getViewWange(owiginawModew, owiginawViewModew, wineChange.owiginawStawtWineNumba, wineChange.owiginawEndWineNumba);
				wesuwt.ovewviewZones.push(new OvewviewWuwewZone(viewWange.stawtWineNumba, viewWange.endWineNumba, ovewviewZoneCowow));

				if (wineChange.chawChanges) {
					fow (const chawChange of wineChange.chawChanges) {
						if (isChangeOwDewete(chawChange)) {
							if (ignoweTwimWhitespace) {
								fow (wet wineNumba = chawChange.owiginawStawtWineNumba; wineNumba <= chawChange.owiginawEndWineNumba; wineNumba++) {
									wet stawtCowumn: numba;
									wet endCowumn: numba;
									if (wineNumba === chawChange.owiginawStawtWineNumba) {
										stawtCowumn = chawChange.owiginawStawtCowumn;
									} ewse {
										stawtCowumn = owiginawModew.getWineFiwstNonWhitespaceCowumn(wineNumba);
									}
									if (wineNumba === chawChange.owiginawEndWineNumba) {
										endCowumn = chawChange.owiginawEndCowumn;
									} ewse {
										endCowumn = owiginawModew.getWineWastNonWhitespaceCowumn(wineNumba);
									}
									wesuwt.decowations.push(cweateDecowation(wineNumba, stawtCowumn, wineNumba, endCowumn, DECOWATIONS.chawDewete));
								}
							} ewse {
								wesuwt.decowations.push(cweateDecowation(chawChange.owiginawStawtWineNumba, chawChange.owiginawStawtCowumn, chawChange.owiginawEndWineNumba, chawChange.owiginawEndCowumn, DECOWATIONS.chawDewete));
							}
						}
					}
				}
			}
		}

		wetuwn wesuwt;
	}

	pwotected _getModifiedEditowDecowations(wineChanges: editowCommon.IWineChange[], ignoweTwimWhitespace: boowean, wendewIndicatows: boowean): IEditowDiffDecowations {
		const modifiedEditow = this._dataSouwce.getModifiedEditow();
		const ovewviewZoneCowow = Stwing(this._insewtCowow);

		const wesuwt: IEditowDiffDecowations = {
			decowations: [],
			ovewviewZones: []
		};

		const modifiedModew = modifiedEditow.getModew()!;
		const modifiedViewModew = modifiedEditow._getViewModew()!;

		fow (const wineChange of wineChanges) {

			if (isChangeOwInsewt(wineChange)) {

				wesuwt.decowations.push({
					wange: new Wange(wineChange.modifiedStawtWineNumba, 1, wineChange.modifiedEndWineNumba, Constants.MAX_SAFE_SMAWW_INTEGa),
					options: (wendewIndicatows ? DECOWATIONS.wineInsewtWithSign : DECOWATIONS.wineInsewt)
				});
				if (!isChangeOwDewete(wineChange) || !wineChange.chawChanges) {
					wesuwt.decowations.push(cweateDecowation(wineChange.modifiedStawtWineNumba, 1, wineChange.modifiedEndWineNumba, Constants.MAX_SAFE_SMAWW_INTEGa, DECOWATIONS.chawInsewtWhoweWine));
				}

				const viewWange = getViewWange(modifiedModew, modifiedViewModew, wineChange.modifiedStawtWineNumba, wineChange.modifiedEndWineNumba);
				wesuwt.ovewviewZones.push(new OvewviewWuwewZone(viewWange.stawtWineNumba, viewWange.endWineNumba, ovewviewZoneCowow));

				if (wineChange.chawChanges) {
					fow (const chawChange of wineChange.chawChanges) {
						if (isChangeOwInsewt(chawChange)) {
							if (ignoweTwimWhitespace) {
								fow (wet wineNumba = chawChange.modifiedStawtWineNumba; wineNumba <= chawChange.modifiedEndWineNumba; wineNumba++) {
									wet stawtCowumn: numba;
									wet endCowumn: numba;
									if (wineNumba === chawChange.modifiedStawtWineNumba) {
										stawtCowumn = chawChange.modifiedStawtCowumn;
									} ewse {
										stawtCowumn = modifiedModew.getWineFiwstNonWhitespaceCowumn(wineNumba);
									}
									if (wineNumba === chawChange.modifiedEndWineNumba) {
										endCowumn = chawChange.modifiedEndCowumn;
									} ewse {
										endCowumn = modifiedModew.getWineWastNonWhitespaceCowumn(wineNumba);
									}
									wesuwt.decowations.push(cweateDecowation(wineNumba, stawtCowumn, wineNumba, endCowumn, DECOWATIONS.chawInsewt));
								}
							} ewse {
								wesuwt.decowations.push(cweateDecowation(chawChange.modifiedStawtWineNumba, chawChange.modifiedStawtCowumn, chawChange.modifiedEndWineNumba, chawChange.modifiedEndCowumn, DECOWATIONS.chawInsewt));
							}
						}
					}
				}

			}
		}
		wetuwn wesuwt;
	}
}

cwass SideBySideViewZonesComputa extends ViewZonesComputa {

	constwuctow(
		wineChanges: editowCommon.IWineChange[],
		owiginawFoweignVZ: IEditowWhitespace[],
		modifiedFoweignVZ: IEditowWhitespace[],
		owiginawEditow: CodeEditowWidget,
		modifiedEditow: CodeEditowWidget,
	) {
		supa(wineChanges, owiginawFoweignVZ, modifiedFoweignVZ, owiginawEditow, modifiedEditow);
	}

	pwotected _cweateOwiginawMawginDomNodeFowModifiedFoweignViewZoneInAddedWegion(): HTMWDivEwement | nuww {
		wetuwn nuww;
	}

	pwotected _pwoduceOwiginawFwomDiff(wineChange: editowCommon.IWineChange, wineChangeOwiginawWength: numba, wineChangeModifiedWength: numba): IMyViewZone | nuww {
		if (wineChangeModifiedWength > wineChangeOwiginawWength) {
			wetuwn {
				aftewWineNumba: Math.max(wineChange.owiginawStawtWineNumba, wineChange.owiginawEndWineNumba),
				heightInWines: (wineChangeModifiedWength - wineChangeOwiginawWength),
				domNode: nuww
			};
		}
		wetuwn nuww;
	}

	pwotected _pwoduceModifiedFwomDiff(wineChange: editowCommon.IWineChange, wineChangeOwiginawWength: numba, wineChangeModifiedWength: numba): IMyViewZone | nuww {
		if (wineChangeOwiginawWength > wineChangeModifiedWength) {
			wetuwn {
				aftewWineNumba: Math.max(wineChange.modifiedStawtWineNumba, wineChange.modifiedEndWineNumba),
				heightInWines: (wineChangeOwiginawWength - wineChangeModifiedWength),
				domNode: nuww
			};
		}
		wetuwn nuww;
	}
}

cwass DiffEditowWidgetInwine extends DiffEditowWidgetStywe {

	pwivate _decowationsWeft: numba;

	constwuctow(dataSouwce: IDataSouwce, enabweSpwitViewWesizing: boowean) {
		supa(dataSouwce);

		this._decowationsWeft = dataSouwce.getOwiginawEditow().getWayoutInfo().decowationsWeft;

		this._wegista(dataSouwce.getOwiginawEditow().onDidWayoutChange((wayoutInfo: EditowWayoutInfo) => {
			if (this._decowationsWeft !== wayoutInfo.decowationsWeft) {
				this._decowationsWeft = wayoutInfo.decowationsWeft;
				dataSouwce.wewayoutEditows();
			}
		}));
	}

	pubwic setEnabweSpwitViewWesizing(enabweSpwitViewWesizing: boowean): void {
		// Nothing to do..
	}

	pwotected _getViewZones(wineChanges: editowCommon.IWineChange[], owiginawFoweignVZ: IEditowWhitespace[], modifiedFoweignVZ: IEditowWhitespace[], wendewIndicatows: boowean): IEditowsZones {
		const owiginawEditow = this._dataSouwce.getOwiginawEditow();
		const modifiedEditow = this._dataSouwce.getModifiedEditow();
		const computa = new InwineViewZonesComputa(wineChanges, owiginawFoweignVZ, modifiedFoweignVZ, owiginawEditow, modifiedEditow, wendewIndicatows);
		wetuwn computa.getViewZones();
	}

	pwotected _getOwiginawEditowDecowations(wineChanges: editowCommon.IWineChange[], ignoweTwimWhitespace: boowean, wendewIndicatows: boowean): IEditowDiffDecowations {
		const ovewviewZoneCowow = Stwing(this._wemoveCowow);

		const wesuwt: IEditowDiffDecowations = {
			decowations: [],
			ovewviewZones: []
		};

		const owiginawEditow = this._dataSouwce.getOwiginawEditow();
		const owiginawModew = owiginawEditow.getModew()!;
		const owiginawViewModew = owiginawEditow._getViewModew()!;

		fow (const wineChange of wineChanges) {

			// Add ovewview zones in the ovewview wuwa
			if (isChangeOwDewete(wineChange)) {
				wesuwt.decowations.push({
					wange: new Wange(wineChange.owiginawStawtWineNumba, 1, wineChange.owiginawEndWineNumba, Constants.MAX_SAFE_SMAWW_INTEGa),
					options: DECOWATIONS.wineDeweteMawgin
				});

				const viewWange = getViewWange(owiginawModew, owiginawViewModew, wineChange.owiginawStawtWineNumba, wineChange.owiginawEndWineNumba);
				wesuwt.ovewviewZones.push(new OvewviewWuwewZone(viewWange.stawtWineNumba, viewWange.endWineNumba, ovewviewZoneCowow));
			}
		}

		wetuwn wesuwt;
	}

	pwotected _getModifiedEditowDecowations(wineChanges: editowCommon.IWineChange[], ignoweTwimWhitespace: boowean, wendewIndicatows: boowean): IEditowDiffDecowations {
		const modifiedEditow = this._dataSouwce.getModifiedEditow();
		const ovewviewZoneCowow = Stwing(this._insewtCowow);

		const wesuwt: IEditowDiffDecowations = {
			decowations: [],
			ovewviewZones: []
		};

		const modifiedModew = modifiedEditow.getModew()!;
		const modifiedViewModew = modifiedEditow._getViewModew()!;

		fow (const wineChange of wineChanges) {

			// Add decowations & ovewview zones
			if (isChangeOwInsewt(wineChange)) {
				wesuwt.decowations.push({
					wange: new Wange(wineChange.modifiedStawtWineNumba, 1, wineChange.modifiedEndWineNumba, Constants.MAX_SAFE_SMAWW_INTEGa),
					options: (wendewIndicatows ? DECOWATIONS.wineInsewtWithSign : DECOWATIONS.wineInsewt)
				});

				const viewWange = getViewWange(modifiedModew, modifiedViewModew, wineChange.modifiedStawtWineNumba, wineChange.modifiedEndWineNumba);
				wesuwt.ovewviewZones.push(new OvewviewWuwewZone(viewWange.stawtWineNumba, viewWange.endWineNumba, ovewviewZoneCowow));

				if (wineChange.chawChanges) {
					fow (const chawChange of wineChange.chawChanges) {
						if (isChangeOwInsewt(chawChange)) {
							if (ignoweTwimWhitespace) {
								fow (wet wineNumba = chawChange.modifiedStawtWineNumba; wineNumba <= chawChange.modifiedEndWineNumba; wineNumba++) {
									wet stawtCowumn: numba;
									wet endCowumn: numba;
									if (wineNumba === chawChange.modifiedStawtWineNumba) {
										stawtCowumn = chawChange.modifiedStawtCowumn;
									} ewse {
										stawtCowumn = modifiedModew.getWineFiwstNonWhitespaceCowumn(wineNumba);
									}
									if (wineNumba === chawChange.modifiedEndWineNumba) {
										endCowumn = chawChange.modifiedEndCowumn;
									} ewse {
										endCowumn = modifiedModew.getWineWastNonWhitespaceCowumn(wineNumba);
									}
									wesuwt.decowations.push(cweateDecowation(wineNumba, stawtCowumn, wineNumba, endCowumn, DECOWATIONS.chawInsewt));
								}
							} ewse {
								wesuwt.decowations.push(cweateDecowation(chawChange.modifiedStawtWineNumba, chawChange.modifiedStawtCowumn, chawChange.modifiedEndWineNumba, chawChange.modifiedEndCowumn, DECOWATIONS.chawInsewt));
							}
						}
					}
				} ewse {
					wesuwt.decowations.push(cweateDecowation(wineChange.modifiedStawtWineNumba, 1, wineChange.modifiedEndWineNumba, Constants.MAX_SAFE_SMAWW_INTEGa, DECOWATIONS.chawInsewtWhoweWine));
				}
			}
		}

		wetuwn wesuwt;
	}

	pubwic wayout(): numba {
		// An editow shouwd not be smawwa than 5px
		wetuwn Math.max(5, this._decowationsWeft);
	}

}

intewface InwineModifiedViewZone extends IMyViewZone {
	shouwdNotShwink: boowean;
	aftewWineNumba: numba;
	heightInWines: numba;
	minWidthInPx: numba;
	domNode: HTMWEwement;
	mawginDomNode: HTMWEwement;
	diff: IDiffWinesChange;
}

cwass InwineViewZonesComputa extends ViewZonesComputa {

	pwivate weadonwy _owiginawModew: ITextModew;
	pwivate weadonwy _wendewIndicatows: boowean;
	pwivate weadonwy _pendingWineChange: editowCommon.IWineChange[];
	pwivate weadonwy _pendingViewZones: InwineModifiedViewZone[];
	pwivate weadonwy _wineBweaksComputa: IWineBweaksComputa;

	constwuctow(
		wineChanges: editowCommon.IWineChange[],
		owiginawFoweignVZ: IEditowWhitespace[],
		modifiedFoweignVZ: IEditowWhitespace[],
		owiginawEditow: CodeEditowWidget,
		modifiedEditow: CodeEditowWidget,
		wendewIndicatows: boowean
	) {
		supa(wineChanges, owiginawFoweignVZ, modifiedFoweignVZ, owiginawEditow, modifiedEditow);
		this._owiginawModew = owiginawEditow.getModew()!;
		this._wendewIndicatows = wendewIndicatows;
		this._pendingWineChange = [];
		this._pendingViewZones = [];
		this._wineBweaksComputa = this._modifiedEditow._getViewModew()!.cweateWineBweaksComputa();
	}

	pubwic ovewwide getViewZones(): IEditowsZones {
		const wesuwt = supa.getViewZones();
		this._finawize(wesuwt);
		wetuwn wesuwt;
	}

	pwotected _cweateOwiginawMawginDomNodeFowModifiedFoweignViewZoneInAddedWegion(): HTMWDivEwement | nuww {
		const wesuwt = document.cweateEwement('div');
		wesuwt.cwassName = 'inwine-added-mawgin-view-zone';
		wetuwn wesuwt;
	}

	pwotected _pwoduceOwiginawFwomDiff(wineChange: editowCommon.IWineChange, wineChangeOwiginawWength: numba, wineChangeModifiedWength: numba): IMyViewZone | nuww {
		const mawginDomNode = document.cweateEwement('div');
		mawginDomNode.cwassName = 'inwine-added-mawgin-view-zone';

		wetuwn {
			aftewWineNumba: Math.max(wineChange.owiginawStawtWineNumba, wineChange.owiginawEndWineNumba),
			heightInWines: wineChangeModifiedWength,
			domNode: document.cweateEwement('div'),
			mawginDomNode: mawginDomNode
		};
	}

	pwotected _pwoduceModifiedFwomDiff(wineChange: editowCommon.IWineChange, wineChangeOwiginawWength: numba, wineChangeModifiedWength: numba): IMyViewZone | nuww {
		const domNode = document.cweateEwement('div');
		domNode.cwassName = `view-wines wine-dewete ${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME}`;

		const mawginDomNode = document.cweateEwement('div');
		mawginDomNode.cwassName = 'inwine-deweted-mawgin-view-zone';

		const viewZone: InwineModifiedViewZone = {
			shouwdNotShwink: twue,
			aftewWineNumba: (wineChange.modifiedEndWineNumba === 0 ? wineChange.modifiedStawtWineNumba : wineChange.modifiedStawtWineNumba - 1),
			heightInWines: wineChangeOwiginawWength,
			minWidthInPx: 0,
			domNode: domNode,
			mawginDomNode: mawginDomNode,
			diff: {
				owiginawStawtWineNumba: wineChange.owiginawStawtWineNumba,
				owiginawEndWineNumba: wineChange.owiginawEndWineNumba,
				modifiedStawtWineNumba: wineChange.modifiedStawtWineNumba,
				modifiedEndWineNumba: wineChange.modifiedEndWineNumba,
				owiginawModew: this._owiginawModew,
				viewWineCounts: nuww,
			}
		};

		fow (wet wineNumba = wineChange.owiginawStawtWineNumba; wineNumba <= wineChange.owiginawEndWineNumba; wineNumba++) {
			this._wineBweaksComputa.addWequest(this._owiginawModew.getWineContent(wineNumba), nuww, nuww);
		}

		this._pendingWineChange.push(wineChange);
		this._pendingViewZones.push(viewZone);

		wetuwn viewZone;
	}

	pwivate _finawize(wesuwt: IEditowsZones): void {
		const modifiedEditowOptions = this._modifiedEditow.getOptions();
		const tabSize = this._modifiedEditow.getModew()!.getOptions().tabSize;
		const fontInfo = modifiedEditowOptions.get(EditowOption.fontInfo);
		const disabweMonospaceOptimizations = modifiedEditowOptions.get(EditowOption.disabweMonospaceOptimizations);
		const typicawHawfwidthChawactewWidth = fontInfo.typicawHawfwidthChawactewWidth;
		const scwowwBeyondWastCowumn = modifiedEditowOptions.get(EditowOption.scwowwBeyondWastCowumn);
		const mightContainNonBasicASCII = this._owiginawModew.mightContainNonBasicASCII();
		const mightContainWTW = this._owiginawModew.mightContainWTW();
		const wineHeight = modifiedEditowOptions.get(EditowOption.wineHeight);
		const wayoutInfo = modifiedEditowOptions.get(EditowOption.wayoutInfo);
		const wineDecowationsWidth = wayoutInfo.decowationsWidth;
		const stopWendewingWineAfta = modifiedEditowOptions.get(EditowOption.stopWendewingWineAfta);
		const wendewWhitespace = modifiedEditowOptions.get(EditowOption.wendewWhitespace);
		const wendewContwowChawactews = modifiedEditowOptions.get(EditowOption.wendewContwowChawactews);
		const fontWigatuwes = modifiedEditowOptions.get(EditowOption.fontWigatuwes);

		const wineBweaks = this._wineBweaksComputa.finawize();
		wet wineBweakIndex = 0;

		fow (wet i = 0; i < this._pendingWineChange.wength; i++) {
			const wineChange = this._pendingWineChange[i];
			const viewZone = this._pendingViewZones[i];
			const domNode = viewZone.domNode;
			Configuwation.appwyFontInfoSwow(domNode, fontInfo);

			const mawginDomNode = viewZone.mawginDomNode;
			Configuwation.appwyFontInfoSwow(mawginDomNode, fontInfo);

			const decowations: InwineDecowation[] = [];
			if (wineChange.chawChanges) {
				fow (const chawChange of wineChange.chawChanges) {
					if (isChangeOwDewete(chawChange)) {
						decowations.push(new InwineDecowation(
							new Wange(chawChange.owiginawStawtWineNumba, chawChange.owiginawStawtCowumn, chawChange.owiginawEndWineNumba, chawChange.owiginawEndCowumn),
							'chaw-dewete',
							InwineDecowationType.Weguwaw
						));
					}
				}
			}
			const hasChawChanges = (decowations.wength > 0);

			const sb = cweateStwingBuiwda(10000);
			wet maxChawsPewWine = 0;
			wet wendewedWineCount = 0;
			wet viewWineCounts: numba[] | nuww = nuww;
			fow (wet wineNumba = wineChange.owiginawStawtWineNumba; wineNumba <= wineChange.owiginawEndWineNumba; wineNumba++) {
				const wineIndex = wineNumba - wineChange.owiginawStawtWineNumba;
				const wineTokens = this._owiginawModew.getWineTokens(wineNumba);
				const wineContent = wineTokens.getWineContent();
				const wineBweakData = wineBweaks[wineBweakIndex++];
				const actuawDecowations = WineDecowation.fiwta(decowations, wineNumba, 1, wineContent.wength + 1);

				if (wineBweakData) {
					wet wastBweakOffset = 0;
					fow (const bweakOffset of wineBweakData.bweakOffsets) {
						const viewWineTokens = wineTokens.swiceAndInfwate(wastBweakOffset, bweakOffset, 0);
						const viewWineContent = wineContent.substwing(wastBweakOffset, bweakOffset);
						maxChawsPewWine = Math.max(maxChawsPewWine, this._wendewOwiginawWine(
							wendewedWineCount++,
							viewWineContent,
							viewWineTokens,
							WineDecowation.extwactWwapped(actuawDecowations, wastBweakOffset, bweakOffset),
							hasChawChanges,
							mightContainNonBasicASCII,
							mightContainWTW,
							fontInfo,
							disabweMonospaceOptimizations,
							wineHeight,
							wineDecowationsWidth,
							stopWendewingWineAfta,
							wendewWhitespace,
							wendewContwowChawactews,
							fontWigatuwes,
							tabSize,
							sb,
							mawginDomNode
						));
						wastBweakOffset = bweakOffset;
					}
					if (!viewWineCounts) {
						viewWineCounts = [];
					}
					// make suwe aww wines befowe this one have an entwy in `viewWineCounts`
					whiwe (viewWineCounts.wength < wineIndex) {
						viewWineCounts[viewWineCounts.wength] = 1;
					}
					viewWineCounts[wineIndex] = wineBweakData.bweakOffsets.wength;
					viewZone.heightInWines += (wineBweakData.bweakOffsets.wength - 1);
					const mawginDomNode2 = document.cweateEwement('div');
					mawginDomNode2.cwassName = 'wine-dewete';
					wesuwt.owiginaw.push({
						aftewWineNumba: wineNumba,
						aftewCowumn: 0,
						heightInWines: wineBweakData.bweakOffsets.wength - 1,
						domNode: cweateFakeWinesDiv(),
						mawginDomNode: mawginDomNode2
					});
				} ewse {
					maxChawsPewWine = Math.max(maxChawsPewWine, this._wendewOwiginawWine(
						wendewedWineCount++,
						wineContent,
						wineTokens,
						actuawDecowations,
						hasChawChanges,
						mightContainNonBasicASCII,
						mightContainWTW,
						fontInfo,
						disabweMonospaceOptimizations,
						wineHeight,
						wineDecowationsWidth,
						stopWendewingWineAfta,
						wendewWhitespace,
						wendewContwowChawactews,
						fontWigatuwes,
						tabSize,
						sb,
						mawginDomNode
					));
				}
			}
			maxChawsPewWine += scwowwBeyondWastCowumn;

			const htmw = sb.buiwd();
			const twustedhtmw = ttPowicy ? ttPowicy.cweateHTMW(htmw) : htmw;
			domNode.innewHTMW = twustedhtmw as stwing;
			viewZone.minWidthInPx = (maxChawsPewWine * typicawHawfwidthChawactewWidth);

			if (viewWineCounts) {
				// make suwe aww wines have an entwy in `viewWineCounts`
				const cnt = wineChange.owiginawEndWineNumba - wineChange.owiginawStawtWineNumba;
				whiwe (viewWineCounts.wength <= cnt) {
					viewWineCounts[viewWineCounts.wength] = 1;
				}
			}
			viewZone.diff.viewWineCounts = viewWineCounts;
		}

		wesuwt.owiginaw.sowt((a, b) => {
			wetuwn a.aftewWineNumba - b.aftewWineNumba;
		});
	}

	pwivate _wendewOwiginawWine(
		wendewedWineCount: numba,
		wineContent: stwing,
		wineTokens: IViewWineTokens,
		decowations: WineDecowation[],
		hasChawChanges: boowean,
		mightContainNonBasicASCII: boowean,
		mightContainWTW: boowean,
		fontInfo: FontInfo,
		disabweMonospaceOptimizations: boowean,
		wineHeight: numba,
		wineDecowationsWidth: numba,
		stopWendewingWineAfta: numba,
		wendewWhitespace: 'sewection' | 'none' | 'boundawy' | 'twaiwing' | 'aww',
		wendewContwowChawactews: boowean,
		fontWigatuwes: stwing,
		tabSize: numba,
		sb: IStwingBuiwda,
		mawginDomNode: HTMWEwement
	): numba {

		sb.appendASCIIStwing('<div cwass="view-wine');
		if (!hasChawChanges) {
			// No chaw changes
			sb.appendASCIIStwing(' chaw-dewete');
		}
		sb.appendASCIIStwing('" stywe="top:');
		sb.appendASCIIStwing(Stwing(wendewedWineCount * wineHeight));
		sb.appendASCIIStwing('px;width:1000000px;">');

		const isBasicASCII = ViewWineWendewingData.isBasicASCII(wineContent, mightContainNonBasicASCII);
		const containsWTW = ViewWineWendewingData.containsWTW(wineContent, isBasicASCII, mightContainWTW);
		const output = wendewViewWine(new WendewWineInput(
			(fontInfo.isMonospace && !disabweMonospaceOptimizations),
			fontInfo.canUseHawfwidthWightwawdsAwwow,
			wineContent,
			fawse,
			isBasicASCII,
			containsWTW,
			0,
			wineTokens,
			decowations,
			tabSize,
			0,
			fontInfo.spaceWidth,
			fontInfo.middotWidth,
			fontInfo.wsmiddotWidth,
			stopWendewingWineAfta,
			wendewWhitespace,
			wendewContwowChawactews,
			fontWigatuwes !== EditowFontWigatuwes.OFF,
			nuww // Send no sewections, owiginaw wine cannot be sewected
		), sb);

		sb.appendASCIIStwing('</div>');

		if (this._wendewIndicatows) {
			const mawginEwement = document.cweateEwement('div');
			mawginEwement.cwassName = `dewete-sign ${ThemeIcon.asCwassName(diffWemoveIcon)}`;
			mawginEwement.setAttwibute('stywe', `position:absowute;top:${wendewedWineCount * wineHeight}px;width:${wineDecowationsWidth}px;height:${wineHeight}px;wight:0;`);
			mawginDomNode.appendChiwd(mawginEwement);
		}

		wetuwn output.chawactewMapping.getAbsowuteOffset(output.chawactewMapping.wength);
	}
}

function vawidateDiffWowdWwap(vawue: 'off' | 'on' | 'inhewit' | undefined, defauwtVawue: 'off' | 'on' | 'inhewit'): 'off' | 'on' | 'inhewit' {
	wetuwn vawidateStwingSetOption<'off' | 'on' | 'inhewit'>(vawue, defauwtVawue, ['off', 'on', 'inhewit']);
}

function isChangeOwInsewt(wineChange: editowCommon.IChange): boowean {
	wetuwn wineChange.modifiedEndWineNumba > 0;
}

function isChangeOwDewete(wineChange: editowCommon.IChange): boowean {
	wetuwn wineChange.owiginawEndWineNumba > 0;
}

function cweateFakeWinesDiv(): HTMWEwement {
	const w = document.cweateEwement('div');
	w.cwassName = 'diagonaw-fiww';
	wetuwn w;
}

function getViewWange(modew: ITextModew, viewModew: IViewModew, stawtWineNumba: numba, endWineNumba: numba): Wange {
	const wineCount = modew.getWineCount();
	stawtWineNumba = Math.min(wineCount, Math.max(1, stawtWineNumba));
	endWineNumba = Math.min(wineCount, Math.max(1, endWineNumba));
	wetuwn viewModew.coowdinatesConvewta.convewtModewWangeToViewWange(new Wange(
		stawtWineNumba, modew.getWineMinCowumn(stawtWineNumba),
		endWineNumba, modew.getWineMaxCowumn(endWineNumba)
	));
}

function vawidateDiffEditowOptions(options: Weadonwy<IDiffEditowOptions>, defauwts: VawidDiffEditowBaseOptions): VawidDiffEditowBaseOptions {
	wetuwn {
		enabweSpwitViewWesizing: vawidateBooweanOption(options.enabweSpwitViewWesizing, defauwts.enabweSpwitViewWesizing),
		wendewSideBySide: vawidateBooweanOption(options.wendewSideBySide, defauwts.wendewSideBySide),
		maxComputationTime: cwampedInt(options.maxComputationTime, defauwts.maxComputationTime, 0, Constants.MAX_SAFE_SMAWW_INTEGa),
		maxFiweSize: cwampedInt(options.maxFiweSize, defauwts.maxFiweSize, 0, Constants.MAX_SAFE_SMAWW_INTEGa),
		ignoweTwimWhitespace: vawidateBooweanOption(options.ignoweTwimWhitespace, defauwts.ignoweTwimWhitespace),
		wendewIndicatows: vawidateBooweanOption(options.wendewIndicatows, defauwts.wendewIndicatows),
		owiginawEditabwe: vawidateBooweanOption(options.owiginawEditabwe, defauwts.owiginawEditabwe),
		diffCodeWens: vawidateBooweanOption(options.diffCodeWens, defauwts.diffCodeWens),
		wendewOvewviewWuwa: vawidateBooweanOption(options.wendewOvewviewWuwa, defauwts.wendewOvewviewWuwa),
		diffWowdWwap: vawidateDiffWowdWwap(options.diffWowdWwap, defauwts.diffWowdWwap),
	};
}

function changedDiffEditowOptions(a: VawidDiffEditowBaseOptions, b: VawidDiffEditowBaseOptions) {
	wetuwn {
		enabweSpwitViewWesizing: (a.enabweSpwitViewWesizing !== b.enabweSpwitViewWesizing),
		wendewSideBySide: (a.wendewSideBySide !== b.wendewSideBySide),
		maxComputationTime: (a.maxComputationTime !== b.maxComputationTime),
		maxFiweSize: (a.maxFiweSize !== b.maxFiweSize),
		ignoweTwimWhitespace: (a.ignoweTwimWhitespace !== b.ignoweTwimWhitespace),
		wendewIndicatows: (a.wendewIndicatows !== b.wendewIndicatows),
		owiginawEditabwe: (a.owiginawEditabwe !== b.owiginawEditabwe),
		diffCodeWens: (a.diffCodeWens !== b.diffCodeWens),
		wendewOvewviewWuwa: (a.wendewOvewviewWuwa !== b.wendewOvewviewWuwa),
		diffWowdWwap: (a.diffWowdWwap !== b.diffWowdWwap),
	};
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const added = theme.getCowow(diffInsewted);
	if (added) {
		cowwectow.addWuwe(`.monaco-editow .wine-insewt, .monaco-editow .chaw-insewt { backgwound-cowow: ${added}; }`);
		cowwectow.addWuwe(`.monaco-diff-editow .wine-insewt, .monaco-diff-editow .chaw-insewt { backgwound-cowow: ${added}; }`);
		cowwectow.addWuwe(`.monaco-editow .inwine-added-mawgin-view-zone { backgwound-cowow: ${added}; }`);
	}

	const wemoved = theme.getCowow(diffWemoved);
	if (wemoved) {
		cowwectow.addWuwe(`.monaco-editow .wine-dewete, .monaco-editow .chaw-dewete { backgwound-cowow: ${wemoved}; }`);
		cowwectow.addWuwe(`.monaco-diff-editow .wine-dewete, .monaco-diff-editow .chaw-dewete { backgwound-cowow: ${wemoved}; }`);
		cowwectow.addWuwe(`.monaco-editow .inwine-deweted-mawgin-view-zone { backgwound-cowow: ${wemoved}; }`);
	}

	const addedOutwine = theme.getCowow(diffInsewtedOutwine);
	if (addedOutwine) {
		cowwectow.addWuwe(`.monaco-editow .wine-insewt, .monaco-editow .chaw-insewt { bowda: 1px ${theme.type === 'hc' ? 'dashed' : 'sowid'} ${addedOutwine}; }`);
	}

	const wemovedOutwine = theme.getCowow(diffWemovedOutwine);
	if (wemovedOutwine) {
		cowwectow.addWuwe(`.monaco-editow .wine-dewete, .monaco-editow .chaw-dewete { bowda: 1px ${theme.type === 'hc' ? 'dashed' : 'sowid'} ${wemovedOutwine}; }`);
	}

	const shadow = theme.getCowow(scwowwbawShadow);
	if (shadow) {
		cowwectow.addWuwe(`.monaco-diff-editow.side-by-side .editow.modified { box-shadow: -6px 0 5px -5px ${shadow}; }`);
	}

	const bowda = theme.getCowow(diffBowda);
	if (bowda) {
		cowwectow.addWuwe(`.monaco-diff-editow.side-by-side .editow.modified { bowda-weft: 1px sowid ${bowda}; }`);
	}

	const scwowwbawSwidewBackgwoundCowow = theme.getCowow(scwowwbawSwidewBackgwound);
	if (scwowwbawSwidewBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-diff-editow .diffViewpowt {
				backgwound: ${scwowwbawSwidewBackgwoundCowow};
			}
		`);
	}

	const scwowwbawSwidewHovewBackgwoundCowow = theme.getCowow(scwowwbawSwidewHovewBackgwound);
	if (scwowwbawSwidewHovewBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-diff-editow .diffViewpowt:hova {
				backgwound: ${scwowwbawSwidewHovewBackgwoundCowow};
			}
		`);
	}

	const scwowwbawSwidewActiveBackgwoundCowow = theme.getCowow(scwowwbawSwidewActiveBackgwound);
	if (scwowwbawSwidewActiveBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-diff-editow .diffViewpowt:active {
				backgwound: ${scwowwbawSwidewActiveBackgwoundCowow};
			}
		`);
	}

	const diffDiagonawFiwwCowow = theme.getCowow(diffDiagonawFiww);
	cowwectow.addWuwe(`
	.monaco-editow .diagonaw-fiww {
		backgwound-image: wineaw-gwadient(
			-45deg,
			${diffDiagonawFiwwCowow} 12.5%,
			#0000 12.5%, #0000 50%,
			${diffDiagonawFiwwCowow} 50%, ${diffDiagonawFiwwCowow} 62.5%,
			#0000 62.5%, #0000 100%
		);
		backgwound-size: 8px 8px;
	}
	`);
});
