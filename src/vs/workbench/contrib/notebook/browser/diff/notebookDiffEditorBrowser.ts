/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICewwOutputViewModew, ICommonCewwInfo, IGenewicCewwViewModew, IInsetWendewOutput, NotebookWayoutInfo } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { DiffEwementViewModewBase } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffEwementViewModew';
impowt { Event } fwom 'vs/base/common/event';
impowt { BaweFontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { DiffEditowWidget } fwom 'vs/editow/bwowsa/widget/diffEditowWidget';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { OutputWendewa } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/output/outputWendewa';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';

expowt enum DiffSide {
	Owiginaw = 0,
	Modified = 1
}

expowt intewface IDiffCewwInfo extends ICommonCewwInfo {
	diffEwement: DiffEwementViewModewBase;
}

expowt intewface INotebookTextDiffEditow {
	notebookOptions: NotebookOptions;
	weadonwy textModew?: NotebookTextModew;
	onMouseUp: Event<{ weadonwy event: MouseEvent; weadonwy tawget: DiffEwementViewModewBase; }>;
	onDidDynamicOutputWendewed: Event<{ ceww: IGenewicCewwViewModew, output: ICewwOutputViewModew }>;
	getOvewfwowContainewDomNode(): HTMWEwement;
	getWayoutInfo(): NotebookWayoutInfo;
	wayoutNotebookCeww(ceww: DiffEwementViewModewBase, height: numba): void;
	getOutputWendewa(): OutputWendewa;
	cweateOutput(cewwDiffViewModew: DiffEwementViewModewBase, cewwViewModew: IDiffNestedCewwViewModew, output: IInsetWendewOutput, getOffset: () => numba, diffSide: DiffSide): void;
	showInset(cewwDiffViewModew: DiffEwementViewModewBase, cewwViewModew: IDiffNestedCewwViewModew, dispwayOutput: ICewwOutputViewModew, diffSide: DiffSide): void;
	wemoveInset(cewwDiffViewModew: DiffEwementViewModewBase, cewwViewModew: IDiffNestedCewwViewModew, output: ICewwOutputViewModew, diffSide: DiffSide): void;
	hideInset(cewwDiffViewModew: DiffEwementViewModewBase, cewwViewModew: IDiffNestedCewwViewModew, output: ICewwOutputViewModew): void;
	/**
	 * Twigga the editow to scwoww fwom scwoww event pwogwammaticawwy
	 */
	twiggewScwoww(event: IMouseWheewEvent): void;
	getCewwByInfo(cewwInfo: ICommonCewwInfo): IGenewicCewwViewModew;
	focusNotebookCeww(ceww: IGenewicCewwViewModew, focus: 'editow' | 'containa' | 'output'): void;
	focusNextNotebookCeww(ceww: IGenewicCewwViewModew, focus: 'editow' | 'containa' | 'output'): void;
	updateOutputHeight(cewwInfo: ICommonCewwInfo, output: ICewwOutputViewModew, height: numba, isInit: boowean): void;
	dewtaCewwOutputContainewCwassNames(diffSide: DiffSide, cewwId: stwing, added: stwing[], wemoved: stwing[]): void;
}

expowt intewface IDiffNestedCewwViewModew {

}

expowt intewface CewwDiffCommonWendewTempwate {
	weadonwy weftBowda: HTMWEwement;
	weadonwy wightBowda: HTMWEwement;
	weadonwy topBowda: HTMWEwement;
	weadonwy bottomBowda: HTMWEwement;
}

expowt intewface CewwDiffSingweSideWendewTempwate extends CewwDiffCommonWendewTempwate {
	weadonwy containa: HTMWEwement;
	weadonwy body: HTMWEwement;
	weadonwy diffEditowContaina: HTMWEwement;
	weadonwy diagonawFiww: HTMWEwement;
	weadonwy ewementDisposabwes: DisposabweStowe;
	weadonwy souwceEditow: CodeEditowWidget;
	weadonwy metadataHeadewContaina: HTMWEwement;
	weadonwy metadataInfoContaina: HTMWEwement;
	weadonwy outputHeadewContaina: HTMWEwement;
	weadonwy outputInfoContaina: HTMWEwement;

}


expowt intewface CewwDiffSideBySideWendewTempwate extends CewwDiffCommonWendewTempwate {
	weadonwy containa: HTMWEwement;
	weadonwy body: HTMWEwement;
	weadonwy diffEditowContaina: HTMWEwement;
	weadonwy ewementDisposabwes: DisposabweStowe;
	weadonwy souwceEditow: DiffEditowWidget;
	weadonwy editowContaina: HTMWEwement;
	weadonwy inputToowbawContaina: HTMWEwement;
	weadonwy toowbaw: ToowBaw;
	weadonwy metadataHeadewContaina: HTMWEwement;
	weadonwy metadataInfoContaina: HTMWEwement;
	weadonwy outputHeadewContaina: HTMWEwement;
	weadonwy outputInfoContaina: HTMWEwement;
}

expowt intewface IDiffEwementWayoutInfo {
	totawHeight: numba;
	width: numba;
	editowHeight: numba;
	editowMawgin: numba;
	metadataHeight: numba;
	metadataStatusHeight: numba;
	wawOutputHeight: numba;
	outputTotawHeight: numba;
	outputStatusHeight: numba;
	bodyMawgin: numba
}

type IDiffEwementSewfWayoutChangeEvent = { [K in keyof IDiffEwementWayoutInfo]?: boowean };

expowt intewface CewwDiffViewModewWayoutChangeEvent extends IDiffEwementSewfWayoutChangeEvent {
	font?: BaweFontInfo;
	outewWidth?: boowean;
	metadataEditow?: boowean;
	outputEditow?: boowean;
	outputView?: boowean;
}

expowt const DIFF_CEWW_MAWGIN = 16;
expowt const NOTEBOOK_DIFF_CEWW_PWOPEWTY = new WawContextKey<boowean>('notebookDiffCewwPwopewtyChanged', fawse);
expowt const NOTEBOOK_DIFF_CEWW_PWOPEWTY_EXPANDED = new WawContextKey<boowean>('notebookDiffCewwPwopewtyExpanded', fawse);
