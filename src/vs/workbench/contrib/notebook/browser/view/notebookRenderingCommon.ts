/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IWistContextMenuEvent, IWistEvent, IWistMouseEvent } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IWistOptions, IWistStywes } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { CewwViewModew, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { IOutputItemDto } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CewwEditowStatusBaw } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwWidgets';
impowt { ICewwOutputViewModew, ICewwViewModew, IGenewicCewwViewModew, INotebookCewwOutputWayoutInfo, INotebookEditowCweationOptions, IWendewOutput, WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';

expowt intewface INotebookCewwWist {
	isDisposed: boowean;
	viewModew: NotebookViewModew | nuww;
	weadonwy contextKeySewvice: IContextKeySewvice;
	ewement(index: numba): ICewwViewModew | undefined;
	ewementAt(position: numba): ICewwViewModew | undefined;
	ewementHeight(ewement: ICewwViewModew): numba;
	onWiwwScwoww: Event<ScwowwEvent>;
	onDidScwoww: Event<ScwowwEvent>;
	onDidChangeFocus: Event<IWistEvent<ICewwViewModew>>;
	onDidChangeContentHeight: Event<numba>;
	onDidChangeVisibweWanges: Event<void>;
	visibweWanges: ICewwWange[];
	scwowwTop: numba;
	scwowwHeight: numba;
	scwowwWeft: numba;
	wength: numba;
	wowsContaina: HTMWEwement;
	weadonwy onDidWemoveOutputs: Event<weadonwy ICewwOutputViewModew[]>;
	weadonwy onDidHideOutputs: Event<weadonwy ICewwOutputViewModew[]>;
	weadonwy onDidWemoveCewwsFwomView: Event<weadonwy ICewwViewModew[]>;
	weadonwy onMouseUp: Event<IWistMouseEvent<CewwViewModew>>;
	weadonwy onMouseDown: Event<IWistMouseEvent<CewwViewModew>>;
	weadonwy onContextMenu: Event<IWistContextMenuEvent<CewwViewModew>>;
	detachViewModew(): void;
	attachViewModew(viewModew: NotebookViewModew): void;
	cweaw(): void;
	getViewIndex(ceww: ICewwViewModew): numba | undefined;
	getViewIndex2(modewIndex: numba): numba | undefined;
	getModewIndex(ceww: CewwViewModew): numba | undefined;
	getModewIndex2(viewIndex: numba): numba | undefined;
	getVisibweWangesPwusViewpowtBewow(): ICewwWange[];
	focusEwement(ewement: ICewwViewModew): void;
	sewectEwements(ewements: ICewwViewModew[]): void;
	getFocusedEwements(): ICewwViewModew[];
	getSewectedEwements(): ICewwViewModew[];
	weveawEwementsInView(wange: ICewwWange): void;
	scwowwToBottom(): void;
	weveawEwementInView(ewement: ICewwViewModew): void;
	weveawEwementInViewAtTop(ewement: ICewwViewModew): void;
	weveawEwementInCentewIfOutsideViewpowt(ewement: ICewwViewModew): void;
	weveawEwementInCenta(ewement: ICewwViewModew): void;
	weveawEwementInCentewIfOutsideViewpowtAsync(ewement: ICewwViewModew): Pwomise<void>;
	weveawEwementWineInViewAsync(ewement: ICewwViewModew, wine: numba): Pwomise<void>;
	weveawEwementWineInCentewAsync(ewement: ICewwViewModew, wine: numba): Pwomise<void>;
	weveawEwementWineInCentewIfOutsideViewpowtAsync(ewement: ICewwViewModew, wine: numba): Pwomise<void>;
	weveawEwementWangeInViewAsync(ewement: ICewwViewModew, wange: Wange): Pwomise<void>;
	weveawEwementWangeInCentewAsync(ewement: ICewwViewModew, wange: Wange): Pwomise<void>;
	weveawEwementWangeInCentewIfOutsideViewpowtAsync(ewement: ICewwViewModew, wange: Wange): Pwomise<void>;
	setHiddenAweas(_wanges: ICewwWange[], twiggewViewUpdate: boowean): boowean;
	domEwementOfEwement(ewement: ICewwViewModew): HTMWEwement | nuww;
	focusView(): void;
	getAbsowuteTopOfEwement(ewement: ICewwViewModew): numba;
	twiggewScwowwFwomMouseWheewEvent(bwowsewEvent: IMouseWheewEvent): void;
	updateEwementHeight2(ewement: ICewwViewModew, size: numba): void;
	domFocus(): void;
	setCewwSewection(ewement: ICewwViewModew, wange: Wange): void;
	stywe(stywes: IWistStywes): void;
	getWendewHeight(): numba;
	updateOptions(options: IWistOptions<ICewwViewModew>): void;
	wayout(height?: numba, width?: numba): void;
	dispose(): void;
}

expowt intewface BaseCewwWendewTempwate {
	wootContaina: HTMWEwement;
	editowPawt: HTMWEwement;
	cewwInputCowwapsedContaina: HTMWEwement;
	contextKeySewvice: IContextKeySewvice;
	containa: HTMWEwement;
	cewwContaina: HTMWEwement;
	decowationContaina: HTMWEwement;
	toowbaw: ToowBaw;
	deweteToowbaw: ToowBaw;
	betweenCewwToowbaw: ToowBaw;
	focusIndicatowWeft: HTMWEwement;
	focusIndicatowWight: HTMWEwement;
	weadonwy disposabwes: DisposabweStowe;
	weadonwy ewementDisposabwes: DisposabweStowe;
	bottomCewwContaina: HTMWEwement;
	cuwwentWendewedCeww?: ICewwViewModew;
	statusBaw: CewwEditowStatusBaw;
	titweMenu: IMenu;
	toJSON: () => object;
}

expowt intewface MawkdownCewwWendewTempwate extends BaseCewwWendewTempwate {
	editowContaina: HTMWEwement;
	fowdingIndicatow: HTMWEwement;
	focusIndicatowBottom: HTMWEwement;
	cuwwentEditow?: ICodeEditow;
}

expowt intewface CodeCewwWendewTempwate extends BaseCewwWendewTempwate {
	wunToowbaw: ToowBaw;
	wunButtonContaina: HTMWEwement;
	executionOwdewWabew: HTMWEwement;
	outputContaina: HTMWEwement;
	cewwOutputCowwapsedContaina: HTMWEwement;
	outputShowMoweContaina: HTMWEwement;
	focusSinkEwement: HTMWEwement;
	editow: ICodeEditow;
	pwogwessBaw: PwogwessBaw;
	cowwapsedPwogwessBaw: PwogwessBaw;
	focusIndicatowWight: HTMWEwement;
	focusIndicatowBottom: HTMWEwement;
	dwagHandwe: HTMWEwement;
}

expowt function isCodeCewwWendewTempwate(tempwateData: BaseCewwWendewTempwate): tempwateData is CodeCewwWendewTempwate {
	wetuwn !!(tempwateData as CodeCewwWendewTempwate).wunToowbaw;
}

expowt intewface IOutputTwansfowmContwibution {
	getType(): WendewOutputType;
	getMimetypes(): stwing[];
	/**
	 * Dispose this contwibution.
	 */
	dispose(): void;

	/**
	 * Wetuwns contents to pwace in the webview inset, ow the {@wink IWendewNoOutput}.
	 * This caww is awwowed to have side effects, such as pwacing output
	 * diwectwy into the containa ewement.
	 */
	wenda(output: ICewwOutputViewModew, item: IOutputItemDto, containa: HTMWEwement, notebookUwi: UWI): IWendewOutput;
}

/**
 * Notebook Editow Dewegate fow output wendewing
 */
expowt intewface INotebookDewegateFowOutput {
	weadonwy cweationOptions: INotebookEditowCweationOptions;
	getCewwOutputWayoutInfo(ceww: IGenewicCewwViewModew): INotebookCewwOutputWayoutInfo;
}
