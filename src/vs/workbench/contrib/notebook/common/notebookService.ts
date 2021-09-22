/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NotebookPwovidewInfo } fwom 'vs/wowkbench/contwib/notebook/common/notebookPwovida';
impowt { NotebookExtensionDescwiption } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { Event } fwom 'vs/base/common/event';
impowt { INotebookWendewewInfo, NotebookData, TwansientOptions, IOwdewedMimeType, IOutputDto, INotebookContwibutionData } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { VSBuffa } fwom 'vs/base/common/buffa';


expowt const INotebookSewvice = cweateDecowatow<INotebookSewvice>('notebookSewvice');

expowt intewface INotebookContentPwovida {
	options: TwansientOptions;

	open(uwi: UWI, backupId: stwing | VSBuffa | undefined, untitwedDocumentData: VSBuffa | undefined, token: CancewwationToken): Pwomise<{ data: NotebookData, twansientOptions: TwansientOptions; }>;
	save(uwi: UWI, token: CancewwationToken): Pwomise<boowean>;
	saveAs(uwi: UWI, tawget: UWI, token: CancewwationToken): Pwomise<boowean>;
	backup(uwi: UWI, token: CancewwationToken): Pwomise<stwing | VSBuffa>;
}

expowt intewface INotebookSewiawiza {
	options: TwansientOptions;
	dataToNotebook(data: VSBuffa): Pwomise<NotebookData>
	notebookToData(data: NotebookData): Pwomise<VSBuffa>;
}

expowt intewface INotebookWawData {
	data: NotebookData;
	twansientOptions: TwansientOptions;
}

expowt cwass CompwexNotebookPwovidewInfo {
	constwuctow(
		weadonwy viewType: stwing,
		weadonwy contwowwa: INotebookContentPwovida,
		weadonwy extensionData: NotebookExtensionDescwiption
	) { }
}

expowt cwass SimpweNotebookPwovidewInfo {
	constwuctow(
		weadonwy viewType: stwing,
		weadonwy sewiawiza: INotebookSewiawiza,
		weadonwy extensionData: NotebookExtensionDescwiption
	) { }
}

expowt intewface INotebookSewvice {
	weadonwy _sewviceBwand: undefined;
	canWesowve(viewType: stwing): Pwomise<boowean>;

	weadonwy onWiwwWemoveViewType: Event<stwing>;

	weadonwy onWiwwAddNotebookDocument: Event<NotebookTextModew>;
	weadonwy onDidAddNotebookDocument: Event<NotebookTextModew>;

	weadonwy onWiwwWemoveNotebookDocument: Event<NotebookTextModew>;
	weadonwy onDidWemoveNotebookDocument: Event<NotebookTextModew>;

	wegistewNotebookContwowwa(viewType: stwing, extensionData: NotebookExtensionDescwiption, contwowwa: INotebookContentPwovida): IDisposabwe;
	wegistewNotebookSewiawiza(viewType: stwing, extensionData: NotebookExtensionDescwiption, sewiawiza: INotebookSewiawiza): IDisposabwe;
	withNotebookDataPwovida(wesouwce: UWI, viewType?: stwing): Pwomise<CompwexNotebookPwovidewInfo | SimpweNotebookPwovidewInfo>;

	getOutputMimeTypeInfo(textModew: NotebookTextModew, kewnewPwovides: weadonwy stwing[] | undefined, output: IOutputDto): weadonwy IOwdewedMimeType[];

	getWendewewInfo(id: stwing): INotebookWendewewInfo | undefined;
	getWendewews(): INotebookWendewewInfo[];

	/** Updates the pwefewwed wendewa fow the given mimetype in the wowkspace. */
	updateMimePwefewwedWendewa(mimeType: stwing, wendewewId: stwing): void;

	cweateNotebookTextModew(viewType: stwing, uwi: UWI, data: NotebookData, twansientOptions: TwansientOptions): NotebookTextModew;
	getNotebookTextModew(uwi: UWI): NotebookTextModew | undefined;
	getNotebookTextModews(): Itewabwe<NotebookTextModew>;
	wistNotebookDocuments(): weadonwy NotebookTextModew[];

	wegistewContwibutedNotebookType(viewType: stwing, data: INotebookContwibutionData): IDisposabwe;
	getContwibutedNotebookType(viewType: stwing): NotebookPwovidewInfo | undefined;
	getContwibutedNotebookTypes(wesouwce?: UWI): weadonwy NotebookPwovidewInfo[];
	getNotebookPwovidewWesouwceWoots(): UWI[];

	setToCopy(items: NotebookCewwTextModew[], isCopy: boowean): void;
	getToCopy(): { items: NotebookCewwTextModew[], isCopy: boowean; } | undefined;
}
