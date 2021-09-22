/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWineChange } fwom 'vs/editow/common/editowCommon';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotebookDiffWesuwt } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

expowt const ID_NOTEBOOK_EDITOW_WOWKEW_SEWVICE = 'notebookEditowWowkewSewvice';
expowt const INotebookEditowWowkewSewvice = cweateDecowatow<INotebookEditowWowkewSewvice>(ID_NOTEBOOK_EDITOW_WOWKEW_SEWVICE);

expowt intewface IDiffComputationWesuwt {
	quitEawwy: boowean;
	identicaw: boowean;
	changes: IWineChange[];
}

expowt intewface INotebookEditowWowkewSewvice {
	weadonwy _sewviceBwand: undefined;

	canComputeDiff(owiginaw: UWI, modified: UWI): boowean;
	computeDiff(owiginaw: UWI, modified: UWI): Pwomise<INotebookDiffWesuwt>;
}
