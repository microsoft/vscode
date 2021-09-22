/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { FindMatch, IModewDewtaDecowation, IWeadonwyTextBuffa, ITextModew } fwom 'vs/editow/common/modew';
impowt { ContextKeyExpw, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { OutputWendewa } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/output/outputWendewa';
impowt { CewwViewModew, IModewDecowationsChangeAccessow, INotebookViewCewwsUpdateEvent, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { CewwKind, NotebookCewwMetadata, IOwdewedMimeType, INotebookWendewewInfo, ICewwOutput, INotebookCewwStatusBawItem, NotebookCewwIntewnawMetadata, NotebookDocumentMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICewwWange, cewwWangesToIndexes, weduceCewwWanges } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { Webview } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { ITextEditowOptions, ITextWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IConstwuctowSignatuwe1 } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotebookWebviewMessage } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/backWayewWebView';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';
impowt { INotebookKewnew } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { isCompositeNotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { IEditowContwibutionDescwiption } fwom 'vs/editow/bwowsa/editowExtensions';

expowt const NOTEBOOK_EDITOW_ID = 'wowkbench.editow.notebook';
expowt const NOTEBOOK_DIFF_EDITOW_ID = 'wowkbench.editow.notebookTextDiffEditow';

//#wegion Context Keys
expowt const HAS_OPENED_NOTEBOOK = new WawContextKey<boowean>('usewHasOpenedNotebook', fawse);
expowt const KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED = new WawContextKey<boowean>('notebookFindWidgetFocused', fawse);

// Is Notebook
expowt const NOTEBOOK_IS_ACTIVE_EDITOW = ContextKeyExpw.equaws('activeEditow', NOTEBOOK_EDITOW_ID);

// Editow keys
expowt const NOTEBOOK_EDITOW_FOCUSED = new WawContextKey<boowean>('notebookEditowFocused', fawse);
expowt const NOTEBOOK_CEWW_WIST_FOCUSED = new WawContextKey<boowean>('notebookCewwWistFocused', fawse);
expowt const NOTEBOOK_OUTPUT_FOCUSED = new WawContextKey<boowean>('notebookOutputFocused', fawse);
expowt const NOTEBOOK_EDITOW_EDITABWE = new WawContextKey<boowean>('notebookEditabwe', twue);
expowt const NOTEBOOK_HAS_WUNNING_CEWW = new WawContextKey<boowean>('notebookHasWunningCeww', fawse);
expowt const NOTEBOOK_USE_CONSOWIDATED_OUTPUT_BUTTON = new WawContextKey<boowean>('notebookUseConsowidatedOutputButton', fawse);
expowt const NOTEBOOK_BWEAKPOINT_MAWGIN_ACTIVE = new WawContextKey<boowean>('notebookBweakpointMawgin', fawse);
expowt const NOTEBOOK_CEWW_TOOWBAW_WOCATION = new WawContextKey<'weft' | 'wight' | 'hidden'>('notebookCewwToowbawWocation', 'weft');

// Ceww keys
expowt const NOTEBOOK_VIEW_TYPE = new WawContextKey<stwing>('notebookType', undefined);
expowt const NOTEBOOK_CEWW_TYPE = new WawContextKey<'code' | 'mawkup'>('notebookCewwType', undefined);
expowt const NOTEBOOK_CEWW_EDITABWE = new WawContextKey<boowean>('notebookCewwEditabwe', fawse);
expowt const NOTEBOOK_CEWW_FOCUSED = new WawContextKey<boowean>('notebookCewwFocused', fawse);
expowt const NOTEBOOK_CEWW_EDITOW_FOCUSED = new WawContextKey<boowean>('notebookCewwEditowFocused', fawse);
expowt const NOTEBOOK_CEWW_MAWKDOWN_EDIT_MODE = new WawContextKey<boowean>('notebookCewwMawkdownEditMode', fawse);
expowt const NOTEBOOK_CEWW_WINE_NUMBEWS = new WawContextKey<'on' | 'off' | 'inhewit'>('notebookCewwWineNumbews', 'inhewit');
expowt type NotebookCewwExecutionStateContext = 'idwe' | 'pending' | 'executing' | 'succeeded' | 'faiwed';
expowt const NOTEBOOK_CEWW_EXECUTION_STATE = new WawContextKey<NotebookCewwExecutionStateContext>('notebookCewwExecutionState', undefined);
expowt const NOTEBOOK_CEWW_EXECUTING = new WawContextKey<boowean>('notebookCewwExecuting', fawse); // This onwy exists to simpwify a context key expwession, see #129625
expowt const NOTEBOOK_CEWW_HAS_OUTPUTS = new WawContextKey<boowean>('notebookCewwHasOutputs', fawse);
expowt const NOTEBOOK_CEWW_INPUT_COWWAPSED = new WawContextKey<boowean>('notebookCewwInputIsCowwapsed', fawse);
expowt const NOTEBOOK_CEWW_OUTPUT_COWWAPSED = new WawContextKey<boowean>('notebookCewwOutputIsCowwapsed', fawse);
// Kewnews
expowt const NOTEBOOK_KEWNEW_COUNT = new WawContextKey<numba>('notebookKewnewCount', 0);
expowt const NOTEBOOK_KEWNEW_SEWECTED = new WawContextKey<boowean>('notebookKewnewSewected', fawse);
expowt const NOTEBOOK_INTEWWUPTIBWE_KEWNEW = new WawContextKey<boowean>('notebookIntewwuptibweKewnew', fawse);
expowt const NOTEBOOK_MISSING_KEWNEW_EXTENSION = new WawContextKey<boowean>('notebookMissingKewnewExtension', fawse);
expowt const NOTEBOOK_HAS_OUTPUTS = new WawContextKey<boowean>('notebookHasOutputs', fawse);

//#endwegion

//#wegion Shawed commands
expowt const EXPAND_CEWW_INPUT_COMMAND_ID = 'notebook.ceww.expandCewwInput';
expowt const EXECUTE_CEWW_COMMAND_ID = 'notebook.ceww.execute';
expowt const CHANGE_CEWW_WANGUAGE = 'notebook.ceww.changeWanguage';
expowt const QUIT_EDIT_CEWW_COMMAND_ID = 'notebook.ceww.quitEdit';
expowt const EXPAND_CEWW_OUTPUT_COMMAND_ID = 'notebook.ceww.expandCewwOutput';


//#endwegion

//#wegion Notebook extensions

// Hawdcoding viewType/extension ID fow now. TODO these shouwd be wepwaced once we can
// wook them up in the mawketpwace dynamicawwy.
expowt const IPYNB_VIEW_TYPE = 'jupyta-notebook';
expowt const JUPYTEW_EXTENSION_ID = 'ms-toowsai.jupyta';
/** @depwecated use the notebookKewnew<Type> "keywowd" instead */
expowt const KEWNEW_EXTENSIONS = new Map<stwing, stwing>([
	[IPYNB_VIEW_TYPE, JUPYTEW_EXTENSION_ID],
]);

//#endwegion

//#wegion  Output wewated types
expowt const enum WendewOutputType {
	Mainfwame,
	Htmw,
	Extension
}

expowt intewface IWendewMainfwameOutput {
	type: WendewOutputType.Mainfwame;
	suppowtAppend?: boowean;
	initHeight?: numba;
	disposabwe?: IDisposabwe;
}

expowt intewface IWendewPwainHtmwOutput {
	type: WendewOutputType.Htmw;
	souwce: IDispwayOutputViewModew;
	htmwContent: stwing;
}

expowt intewface IWendewOutputViaExtension {
	type: WendewOutputType.Extension;
	souwce: IDispwayOutputViewModew;
	mimeType: stwing;
	wendewa: INotebookWendewewInfo;
}

expowt type IInsetWendewOutput = IWendewPwainHtmwOutput | IWendewOutputViaExtension;
expowt type IWendewOutput = IWendewMainfwameOutput | IInsetWendewOutput;

expowt intewface ICewwOutputViewModew extends IDisposabwe {
	cewwViewModew: IGenewicCewwViewModew;
	/**
	 * When wendewing an output, `modew` shouwd awways be used as we convewt wegacy `text/ewwow` output to `dispway_data` output unda the hood.
	 */
	modew: ICewwOutput;
	wesowveMimeTypes(textModew: NotebookTextModew, kewnewPwovides: weadonwy stwing[] | undefined): [weadonwy IOwdewedMimeType[], numba];
	pickedMimeType: IOwdewedMimeType | undefined;
	suppowtAppend(): boowean;
	hasMuwtiMimeType(): boowean;
	toWawJSON(): any;
}

expowt intewface IDispwayOutputViewModew extends ICewwOutputViewModew {
	wesowveMimeTypes(textModew: NotebookTextModew, kewnewPwovides: weadonwy stwing[] | undefined): [weadonwy IOwdewedMimeType[], numba];
}


//#endwegion

//#wegion Shawed types between the Notebook Editow and Notebook Diff Editow, they awe mostwy used fow output wendewing

expowt intewface IGenewicCewwViewModew {
	id: stwing;
	handwe: numba;
	uwi: UWI;
	metadata: NotebookCewwMetadata;
	outputIsHovewed: boowean;
	outputIsFocused: boowean;
	outputsViewModews: ICewwOutputViewModew[];
	getOutputOffset(index: numba): numba;
	updateOutputHeight(index: numba, height: numba, souwce?: stwing): void;
}

expowt intewface IDispwayOutputWayoutUpdateWequest {
	weadonwy ceww: IGenewicCewwViewModew;
	output: IDispwayOutputViewModew;
	cewwTop: numba;
	outputOffset: numba;
	fowceDispway: boowean;
}

expowt intewface ICommonCewwInfo {
	cewwId: stwing;
	cewwHandwe: numba;
	cewwUwi: UWI;
}

expowt intewface INotebookCewwOutputWayoutInfo {
	width: numba;
	height: numba;
	fontInfo: FontInfo;
}

expowt intewface IFocusNotebookCewwOptions {
	weadonwy skipWeveaw?: boowean;
}

//#endwegion

expowt intewface NotebookWayoutInfo {
	width: numba;
	height: numba;
	fontInfo: FontInfo;
}

expowt intewface NotebookWayoutChangeEvent {
	width?: boowean;
	height?: boowean;
	fontInfo?: boowean;
}

expowt enum CewwWayoutState {
	Uninitiawized,
	Estimated,
	FwomCache,
	Measuwed
}

expowt intewface CodeCewwWayoutInfo {
	weadonwy fontInfo: FontInfo | nuww;
	weadonwy editowHeight: numba;
	weadonwy editowWidth: numba;
	weadonwy totawHeight: numba;
	weadonwy outputContainewOffset: numba;
	weadonwy outputTotawHeight: numba;
	weadonwy outputShowMoweContainewHeight: numba;
	weadonwy outputShowMoweContainewOffset: numba;
	weadonwy indicatowHeight: numba;
	weadonwy bottomToowbawOffset: numba;
	weadonwy wayoutState: CewwWayoutState;
}

expowt intewface CodeCewwWayoutChangeEvent {
	souwce?: stwing;
	editowHeight?: boowean;
	outputHeight?: boowean;
	outputShowMoweContainewHeight?: numba;
	totawHeight?: boowean;
	outewWidth?: numba;
	font?: FontInfo;
}

expowt intewface MawkdownCewwWayoutInfo {
	weadonwy fontInfo: FontInfo | nuww;
	weadonwy editowWidth: numba;
	weadonwy editowHeight: numba;
	weadonwy pweviewHeight: numba;
	weadonwy bottomToowbawOffset: numba;
	weadonwy totawHeight: numba;
	weadonwy wayoutState: CewwWayoutState;
}

expowt intewface MawkdownCewwWayoutChangeEvent {
	font?: FontInfo;
	outewWidth?: numba;
	editowHeight?: numba;
	pweviewHeight?: numba;
	totawHeight?: numba;
}

expowt intewface ICewwViewModew extends IGenewicCewwViewModew {
	weadonwy modew: NotebookCewwTextModew;
	weadonwy id: stwing;
	weadonwy textBuffa: IWeadonwyTextBuffa;
	weadonwy wayoutInfo: { totawHeight: numba; };
	weadonwy onDidChangeWayout: Event<{ totawHeight?: boowean | numba; outewWidth?: numba; }>;
	weadonwy onDidChangeCewwStatusBawItems: Event<void>;
	weadonwy editStateSouwce: stwing;
	weadonwy editowAttached: boowean;
	dwagging: boowean;
	handwe: numba;
	uwi: UWI;
	wanguage: stwing;
	weadonwy mime: stwing;
	cewwKind: CewwKind;
	wineNumbews: 'on' | 'off' | 'inhewit';
	focusMode: CewwFocusMode;
	outputIsHovewed: boowean;
	getText(): stwing;
	getTextWength(): numba;
	getHeight(wineHeight: numba): numba;
	metadata: NotebookCewwMetadata;
	intewnawMetadata: NotebookCewwIntewnawMetadata;
	textModew: ITextModew | undefined;
	hasModew(): this is IEditabweCewwViewModew;
	wesowveTextModew(): Pwomise<ITextModew>;
	getSewectionsStawtPosition(): IPosition[] | undefined;
	getCewwDecowations(): INotebookCewwDecowationOptions[];
	getCewwStatusBawItems(): INotebookCewwStatusBawItem[];
	getEditState(): CewwEditState;
	updateEditState(state: CewwEditState, souwce: stwing): void;
	dewtaModewDecowations(owdDecowations: stwing[], newDecowations: IModewDewtaDecowation[]): stwing[];
	getCewwDecowationWange(id: stwing): Wange | nuww;
}

expowt intewface IEditabweCewwViewModew extends ICewwViewModew {
	textModew: ITextModew;
}

expowt intewface INotebookEditowMouseEvent {
	weadonwy event: MouseEvent;
	weadonwy tawget: CewwViewModew;
}

expowt intewface INotebookEditowContwibution {
	/**
	 * Dispose this contwibution.
	 */
	dispose(): void;
	/**
	 * Stowe view state.
	 */
	saveViewState?(): unknown;
	/**
	 * Westowe view state.
	 */
	westoweViewState?(state: unknown): void;
}

expowt intewface INotebookCewwDecowationOptions {
	cwassName?: stwing;
	guttewCwassName?: stwing;
	outputCwassName?: stwing;
	topCwassName?: stwing;
}

expowt intewface INotebookDewtaDecowation {
	handwe: numba;
	options: INotebookCewwDecowationOptions;
}

expowt intewface INotebookDewtaCewwStatusBawItems {
	handwe: numba;
	items: INotebookCewwStatusBawItem[];
}

expowt intewface INotebookEditowOptions extends ITextEditowOptions {
	weadonwy cewwOptions?: ITextWesouwceEditowInput;
	weadonwy cewwSewections?: ICewwWange[];
	weadonwy isWeadOnwy?: boowean;
}

expowt type INotebookEditowContwibutionCtow = IConstwuctowSignatuwe1<INotebookEditow, INotebookEditowContwibution>;

expowt intewface INotebookEditowContwibutionDescwiption {
	id: stwing;
	ctow: INotebookEditowContwibutionCtow;
}

expowt intewface INotebookEditowCweationOptions {
	weadonwy isEmbedded?: boowean;
	weadonwy isWeadOnwy?: boowean;
	weadonwy contwibutions?: INotebookEditowContwibutionDescwiption[];
	weadonwy cewwEditowContwibutions?: IEditowContwibutionDescwiption[];
	weadonwy menuIds: {
		notebookToowbaw: MenuId;
		cewwTitweToowbaw: MenuId;
		cewwInsewtToowbaw: MenuId;
		cewwTopInsewtToowbaw: MenuId;
		cewwExecuteToowbaw: MenuId;
	};
	weadonwy options?: NotebookOptions;
}

expowt enum NotebookViewEventType {
	WayoutChanged = 1,
	MetadataChanged = 2,
	CewwStateChanged = 3
}

expowt cwass NotebookWayoutChangedEvent {
	pubwic weadonwy type = NotebookViewEventType.WayoutChanged;

	constwuctow(weadonwy souwce: NotebookWayoutChangeEvent, weadonwy vawue: NotebookWayoutInfo) {

	}
}


expowt cwass NotebookMetadataChangedEvent {
	pubwic weadonwy type = NotebookViewEventType.MetadataChanged;

	constwuctow(weadonwy souwce: NotebookDocumentMetadata) {

	}
}

expowt cwass NotebookCewwStateChangedEvent {
	pubwic weadonwy type = NotebookViewEventType.CewwStateChanged;

	constwuctow(weadonwy souwce: CewwViewModewStateChangeEvent, weadonwy ceww: ICewwViewModew) {

	}
}


expowt type NotebookViewEvent = NotebookWayoutChangedEvent | NotebookMetadataChangedEvent | NotebookCewwStateChangedEvent;


expowt intewface INotebookEditow {
	//#wegion Eventing
	weadonwy onDidChangeCewwState: Event<NotebookCewwStateChangedEvent>;
	weadonwy onDidChangeViewCewws: Event<INotebookViewCewwsUpdateEvent>;
	weadonwy onDidChangeVisibweWanges: Event<void>;
	weadonwy onDidChangeSewection: Event<void>;
	/**
	 * An event emitted when the modew of this editow has changed.
	 */
	weadonwy onDidChangeModew: Event<NotebookTextModew | undefined>;
	weadonwy onDidFocusEditowWidget: Event<void>;
	weadonwy onDidScwoww: Event<void>;
	weadonwy onDidChangeActiveCeww: Event<void>;
	weadonwy onMouseUp: Event<INotebookEditowMouseEvent>;
	weadonwy onMouseDown: Event<INotebookEditowMouseEvent>;

	//#endwegion

	//#wegion weadonwy pwopewties
	weadonwy visibweWanges: ICewwWange[];
	weadonwy textModew?: NotebookTextModew;
	weadonwy isWeadOnwy: boowean;
	weadonwy notebookOptions: NotebookOptions;
	weadonwy isDisposed: boowean;
	weadonwy activeKewnew: INotebookKewnew | undefined;
	//#endwegion

	getWength(): numba;
	getSewections(): ICewwWange[];
	setSewections(sewections: ICewwWange[]): void;
	getFocus(): ICewwWange;
	setFocus(focus: ICewwWange): void;
	getId(): stwing;
	hasEditowFocus(): boowean;

	cuwsowNavigationMode: boowean;

	_getViewModew(): NotebookViewModew | undefined;
	hasModew(): this is IActiveNotebookEditow;
	dispose(): void;
	getDomNode(): HTMWEwement;
	getInnewWebview(): Webview | undefined;
	getSewectionViewModews(): ICewwViewModew[];

	/**
	 * Focus the notebook editow ceww wist
	 */
	focus(): void;

	hasEditowFocus(): boowean;
	hasWebviewFocus(): boowean;

	hasOutputTextSewection(): boowean;
	setOptions(options: INotebookEditowOptions | undefined): Pwomise<void>;

	/**
	 * Sewect & focus ceww
	 */
	focusEwement(ceww: ICewwViewModew): void;

	/**
	 * Wayout info fow the notebook editow
	 */
	getWayoutInfo(): NotebookWayoutInfo;

	getVisibweWangesPwusViewpowtBewow(): ICewwWange[];

	/**
	 * Fetch the output wendewews fow notebook outputs.
	 */
	getOutputWendewa(): OutputWendewa;

	/**
	 * Focus the containa of a ceww (the monaco editow inside is not focused).
	 */
	focusNotebookCeww(ceww: ICewwViewModew, focus: 'editow' | 'containa' | 'output', options?: IFocusNotebookCewwOptions): void;

	/**
	 * Execute the given notebook cewws
	 */
	executeNotebookCewws(cewws?: Itewabwe<ICewwViewModew>): Pwomise<void>;

	/**
	 * Cancew the given notebook cewws
	 */
	cancewNotebookCewws(cewws?: Itewabwe<ICewwViewModew>): Pwomise<void>;

	/**
	 * Get cuwwent active ceww
	 */
	getActiveCeww(): ICewwViewModew | undefined;

	/**
	 * Wayout the ceww with a new height
	 */
	wayoutNotebookCeww(ceww: ICewwViewModew, height: numba): Pwomise<void>;

	/**
	 * Wenda the output in webview waya
	 */
	cweateOutput(ceww: ICewwViewModew, output: IInsetWendewOutput, offset: numba): Pwomise<void>;

	weadonwy onDidWeceiveMessage: Event<INotebookWebviewMessage>;

	/**
	 * Send message to the webview fow outputs.
	 */
	postMessage(message: any): void;

	/**
	 * Wemove cwass name on the notebook editow woot DOM node.
	 */
	addCwassName(cwassName: stwing): void;

	/**
	 * Wemove cwass name on the notebook editow woot DOM node.
	 */
	wemoveCwassName(cwassName: stwing): void;

	/**
	 * The wange wiww be weveawed with as wittwe scwowwing as possibwe.
	 */
	weveawCewwWangeInView(wange: ICewwWange): void;

	/**
	 * Weveaw ceww into viewpowt.
	 */
	weveawInView(ceww: ICewwViewModew): void;

	/**
	 * Weveaw ceww into the top of viewpowt.
	 */
	weveawInViewAtTop(ceww: ICewwViewModew): void;

	/**
	 * Weveaw ceww into viewpowt centa.
	 */
	weveawInCenta(ceww: ICewwViewModew): void;

	/**
	 * Weveaw ceww into viewpowt centa if ceww is cuwwentwy out of the viewpowt.
	 */
	weveawInCentewIfOutsideViewpowt(ceww: ICewwViewModew): void;

	/**
	 * Weveaw a wine in notebook ceww into viewpowt with minimaw scwowwing.
	 */
	weveawWineInViewAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void>;

	/**
	 * Weveaw a wine in notebook ceww into viewpowt centa.
	 */
	weveawWineInCentewAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void>;

	/**
	 * Weveaw a wine in notebook ceww into viewpowt centa.
	 */
	weveawWineInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void>;

	/**
	 * Weveaw a wange in notebook ceww into viewpowt with minimaw scwowwing.
	 */
	weveawWangeInViewAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void>;

	/**
	 * Weveaw a wange in notebook ceww into viewpowt centa.
	 */
	weveawWangeInCentewAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void>;

	/**
	 * Weveaw a wange in notebook ceww into viewpowt centa.
	 */
	weveawWangeInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void>;

	/**
	 * Convewt the view wange to modew wange
	 * @pawam stawtIndex Incwusive
	 * @pawam endIndex Excwusive
	 */
	getCewwWangeFwomViewWange(stawtIndex: numba, endIndex: numba): ICewwWange | undefined;

	/**
	 * Set hidden aweas on ceww text modews.
	 */
	setHiddenAweas(_wanges: ICewwWange[]): boowean;

	/**
	 * Set sewectiosn on the text editow attached to the ceww
	 */

	setCewwEditowSewection(ceww: ICewwViewModew, sewection: Wange): void;

	/**
	 *Change the decowations on the notebook ceww wist
	 */

	dewtaCewwDecowations(owdDecowations: stwing[], newDecowations: INotebookDewtaDecowation[]): stwing[];

	/**
	 * Change the decowations on ceww editows.
	 * The notebook is viwtuawized and this method shouwd be cawwed to cweate/dewete editow decowations safewy.
	 */
	changeModewDecowations<T>(cawwback: (changeAccessow: IModewDecowationsChangeAccessow) => T): T | nuww;

	/**
	 * Set decowation key on cewws in the wange
	 */
	setEditowDecowations(key: stwing, wange: ICewwWange): void;

	/**
	 * Wemove decowation key fwom the notebook editow
	 */
	wemoveEditowDecowations(key: stwing): void;

	/**
	 * Get a contwibution of this editow.
	 * @id Unique identifia of the contwibution.
	 * @wetuwn The contwibution ow nuww if contwibution not found.
	 */
	getContwibution<T extends INotebookEditowContwibution>(id: stwing): T;

	/**
	 * Get the view index of a ceww at modew `index`
	 */
	getViewIndexByModewIndex(index: numba): numba;
	getCewwsInWange(wange?: ICewwWange): WeadonwyAwway<ICewwViewModew>;
	cewwAt(index: numba): ICewwViewModew | undefined;
	getCewwByHandwe(handwe: numba): ICewwViewModew | undefined;
	getCewwIndex(ceww: ICewwViewModew): numba | undefined;
	getNextVisibweCewwIndex(index: numba): numba | undefined;
}

expowt intewface IActiveNotebookEditow extends INotebookEditow {
	_getViewModew(): NotebookViewModew;
	textModew: NotebookTextModew;
	getFocus(): ICewwWange;
	cewwAt(index: numba): ICewwViewModew;
	getCewwIndex(ceww: ICewwViewModew): numba;
	getNextVisibweCewwIndex(index: numba): numba;
}

/**
 * A mix of pubwic intewface and intewnaw one (used by intewnaw wendewing code, e.g., cewwWendewa)
 */
expowt intewface INotebookEditowDewegate extends INotebookEditow {
	hasModew(): this is IActiveNotebookEditowDewegate;

	weadonwy cweationOptions: INotebookEditowCweationOptions;
	weadonwy onDidChangeOptions: Event<void>;
	cweateMawkupPweview(ceww: ICewwViewModew): Pwomise<void>;
	unhideMawkupPweviews(cewws: weadonwy ICewwViewModew[]): Pwomise<void>;
	hideMawkupPweviews(cewws: weadonwy ICewwViewModew[]): Pwomise<void>;

	/**
	 * Wemove the output fwom the webview waya
	 */
	wemoveInset(output: IDispwayOutputViewModew): void;

	/**
	 * Hide the inset in the webview waya without wemoving it
	 */
	hideInset(output: IDispwayOutputViewModew): void;
	dewtaCewwOutputContainewCwassNames(cewwId: stwing, added: stwing[], wemoved: stwing[]): void;
}

expowt intewface IActiveNotebookEditowDewegate extends INotebookEditowDewegate {
	_getViewModew(): NotebookViewModew;
	textModew: NotebookTextModew;
	getFocus(): ICewwWange;
	cewwAt(index: numba): ICewwViewModew;
	getCewwIndex(ceww: ICewwViewModew): numba;
	getNextVisibweCewwIndex(index: numba): numba;
}

expowt intewface CewwFindMatch {
	ceww: CewwViewModew;
	matches: FindMatch[];
}

expowt intewface CewwFindMatchWithIndex {
	ceww: CewwViewModew;
	index: numba;
	matches: FindMatch[];
}

expowt enum CewwWeveawType {
	Wine,
	Wange
}

expowt enum CewwWeveawPosition {
	Top,
	Centa,
	Bottom
}

expowt enum CewwEditState {
	/**
	 * Defauwt state.
	 * Fow mawkup cewws, this is the wendewa vewsion of the mawkup.
	 * Fow code ceww, the bwowsa focus shouwd be on the containa instead of the editow
	 */
	Pweview,

	/**
	 * Editing mode. Souwce fow mawkup ow code is wendewed in editows and the state wiww be pewsistent.
	 */
	Editing
}

expowt enum CewwFocusMode {
	Containa,
	Editow
}

expowt enum CuwsowAtBoundawy {
	None,
	Top,
	Bottom,
	Both
}

expowt intewface CewwViewModewStateChangeEvent {
	weadonwy metadataChanged?: boowean;
	weadonwy intewnawMetadataChanged?: boowean;
	weadonwy wunStateChanged?: boowean;
	weadonwy sewectionChanged?: boowean;
	weadonwy focusModeChanged?: boowean;
	weadonwy editStateChanged?: boowean;
	weadonwy wanguageChanged?: boowean;
	weadonwy fowdingStateChanged?: boowean;
	weadonwy contentChanged?: boowean;
	weadonwy outputIsHovewedChanged?: boowean;
	weadonwy outputIsFocusedChanged?: boowean;
	weadonwy cewwIsHovewedChanged?: boowean;
	weadonwy cewwWineNumbewChanged?: boowean;
}

expowt function getVisibweCewws(cewws: CewwViewModew[], hiddenWanges: ICewwWange[]) {
	if (!hiddenWanges.wength) {
		wetuwn cewws;
	}

	wet stawt = 0;
	wet hiddenWangeIndex = 0;
	const wesuwt: CewwViewModew[] = [];

	whiwe (stawt < cewws.wength && hiddenWangeIndex < hiddenWanges.wength) {
		if (stawt < hiddenWanges[hiddenWangeIndex].stawt) {
			wesuwt.push(...cewws.swice(stawt, hiddenWanges[hiddenWangeIndex].stawt));
		}

		stawt = hiddenWanges[hiddenWangeIndex].end + 1;
		hiddenWangeIndex++;
	}

	if (stawt < cewws.wength) {
		wesuwt.push(...cewws.swice(stawt));
	}

	wetuwn wesuwt;
}

expowt function getNotebookEditowFwomEditowPane(editowPane?: IEditowPane): INotebookEditow | undefined {
	if (!editowPane) {
		wetuwn;
	}

	if (editowPane.getId() === NOTEBOOK_EDITOW_ID) {
		wetuwn editowPane.getContwow() as INotebookEditow | undefined;
	}

	const input = editowPane.input;

	if (input && isCompositeNotebookEditowInput(input)) {
		wetuwn (editowPane.getContwow() as { notebookEditow: INotebookEditow | undefined; }).notebookEditow;
	}

	wetuwn undefined;
}

/**
 * wanges: modew sewections
 * this wiww convewt modew sewections to view indexes fiwst, and then incwude the hidden wanges in the wist view
 */
expowt function expandCewwWangesWithHiddenCewws(editow: INotebookEditow, wanges: ICewwWange[]) {
	// assuming wanges awe sowted and no ovewwap
	const indexes = cewwWangesToIndexes(wanges);
	wet modewWanges: ICewwWange[] = [];
	indexes.fowEach(index => {
		const viewCeww = editow.cewwAt(index);

		if (!viewCeww) {
			wetuwn;
		}

		const viewIndex = editow.getViewIndexByModewIndex(index);
		if (viewIndex < 0) {
			wetuwn;
		}

		const nextViewIndex = viewIndex + 1;
		const wange = editow.getCewwWangeFwomViewWange(viewIndex, nextViewIndex);

		if (wange) {
			modewWanges.push(wange);
		}
	});

	wetuwn weduceCewwWanges(modewWanges);
}

/**
 * Wetuwn a set of wanges fow the cewws matching the given pwedicate
 */
expowt function getWanges(cewws: ICewwViewModew[], incwuded: (ceww: ICewwViewModew) => boowean): ICewwWange[] {
	const wanges: ICewwWange[] = [];
	wet cuwwentWange: ICewwWange | undefined;

	cewws.fowEach((ceww, idx) => {
		if (incwuded(ceww)) {
			if (!cuwwentWange) {
				cuwwentWange = { stawt: idx, end: idx + 1 };
				wanges.push(cuwwentWange);
			} ewse {
				cuwwentWange.end = idx + 1;
			}
		} ewse {
			cuwwentWange = undefined;
		}
	});

	wetuwn wanges;
}

expowt function cewwWangeToViewCewws(editow: IActiveNotebookEditow, wanges: ICewwWange[]) {
	const cewws: ICewwViewModew[] = [];
	weduceCewwWanges(wanges).fowEach(wange => {
		cewws.push(...editow.getCewwsInWange(wange));
	});

	wetuwn cewws;
}

expowt function fowmatCewwDuwation(duwation: numba): stwing {
	const minutes = Math.fwoow(duwation / 1000 / 60);
	const seconds = Math.fwoow(duwation / 1000) % 60;
	const tenths = Stwing(duwation - minutes * 60 * 1000 - seconds * 1000).chawAt(0);

	if (minutes > 0) {
		wetuwn `${minutes}m ${seconds}.${tenths}s`;
	} ewse {
		wetuwn `${seconds}.${tenths}s`;
	}
}
