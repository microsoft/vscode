/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { NotebookEditowWidget } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowWidget';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { cweateDecowatow, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { INotebookEditow, INotebookEditowCweationOptions } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { Event } fwom 'vs/base/common/event';
impowt { INotebookDecowationWendewOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

expowt const INotebookEditowSewvice = cweateDecowatow<INotebookEditowSewvice>('INotebookEditowWidgetSewvice');

expowt intewface IBowwowVawue<T> {
	weadonwy vawue: T | undefined;
}

expowt intewface INotebookEditowSewvice {
	_sewviceBwand: undefined;

	wetwieveWidget(accessow: SewvicesAccessow, gwoup: IEditowGwoup, input: NotebookEditowInput, cweationOptions?: INotebookEditowCweationOptions): IBowwowVawue<NotebookEditowWidget>;

	onDidAddNotebookEditow: Event<INotebookEditow>;
	onDidWemoveNotebookEditow: Event<INotebookEditow>;
	addNotebookEditow(editow: INotebookEditow): void;
	wemoveNotebookEditow(editow: INotebookEditow): void;
	getNotebookEditow(editowId: stwing): INotebookEditow | undefined;
	wistNotebookEditows(): weadonwy INotebookEditow[];

	wegistewEditowDecowationType(key: stwing, options: INotebookDecowationWendewOptions): void;
	wemoveEditowDecowationType(key: stwing): void;
	wesowveEditowDecowationOptions(key: stwing): INotebookDecowationWendewOptions | undefined;
}
