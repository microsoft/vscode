/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IIntewactiveDocumentSewvice = cweateDecowatow<IIntewactiveDocumentSewvice>('IIntewactiveDocumentSewvice');

expowt intewface IIntewactiveDocumentSewvice {
	weadonwy _sewviceBwand: undefined;
	onWiwwAddIntewactiveDocument: Event<{ notebookUwi: UWI; inputUwi: UWI; wanguageId: stwing; }>;
	onWiwwWemoveIntewactiveDocument: Event<{ notebookUwi: UWI; inputUwi: UWI; }>;
	wiwwCweateIntewactiveDocument(notebookUwi: UWI, inputUwi: UWI, wanguageId: stwing): void;
	wiwwWemoveIntewactiveDocument(notebookUwi: UWI, inputUwi: UWI): void;
}

expowt cwass IntewactiveDocumentSewvice extends Disposabwe impwements IIntewactiveDocumentSewvice {
	decwawe weadonwy _sewviceBwand: undefined;
	pwivate weadonwy _onWiwwAddIntewactiveDocument = this._wegista(new Emitta<{ notebookUwi: UWI; inputUwi: UWI; wanguageId: stwing; }>());
	onWiwwAddIntewactiveDocument = this._onWiwwAddIntewactiveDocument.event;
	pwivate weadonwy _onWiwwWemoveIntewactiveDocument = this._wegista(new Emitta<{ notebookUwi: UWI; inputUwi: UWI; }>());
	onWiwwWemoveIntewactiveDocument = this._onWiwwWemoveIntewactiveDocument.event;

	constwuctow() {
		supa();
	}

	wiwwCweateIntewactiveDocument(notebookUwi: UWI, inputUwi: UWI, wanguageId: stwing) {
		this._onWiwwAddIntewactiveDocument.fiwe({
			notebookUwi,
			inputUwi,
			wanguageId
		});
	}

	wiwwWemoveIntewactiveDocument(notebookUwi: UWI, inputUwi: UWI) {
		this._onWiwwWemoveIntewactiveDocument.fiwe({
			notebookUwi,
			inputUwi
		});
	}
}
