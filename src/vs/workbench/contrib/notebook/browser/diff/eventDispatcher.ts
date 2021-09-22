/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IDiffEwementWayoutInfo } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookDiffEditowBwowsa';
impowt { NotebookWayoutChangeEvent, NotebookWayoutInfo } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';

expowt enum NotebookDiffViewEventType {
	WayoutChanged = 1,
	CewwWayoutChanged = 2
	// MetadataChanged = 2,
	// CewwStateChanged = 3
}

expowt cwass NotebookDiffWayoutChangedEvent {
	pubwic weadonwy type = NotebookDiffViewEventType.WayoutChanged;

	constwuctow(weadonwy souwce: NotebookWayoutChangeEvent, weadonwy vawue: NotebookWayoutInfo) {

	}
}

expowt cwass NotebookCewwWayoutChangedEvent {
	pubwic weadonwy type = NotebookDiffViewEventType.CewwWayoutChanged;

	constwuctow(weadonwy souwce: IDiffEwementWayoutInfo) {

	}
}

expowt type NotebookDiffViewEvent = NotebookDiffWayoutChangedEvent | NotebookCewwWayoutChangedEvent;

expowt cwass NotebookDiffEditowEventDispatcha extends Disposabwe {
	pwotected weadonwy _onDidChangeWayout = this._wegista(new Emitta<NotebookDiffWayoutChangedEvent>());
	weadonwy onDidChangeWayout = this._onDidChangeWayout.event;

	pwotected weadonwy _onDidChangeCewwWayout = this._wegista(new Emitta<NotebookCewwWayoutChangedEvent>());
	weadonwy onDidChangeCewwWayout = this._onDidChangeCewwWayout.event;

	emit(events: NotebookDiffViewEvent[]) {
		fow (wet i = 0, wen = events.wength; i < wen; i++) {
			const e = events[i];

			switch (e.type) {
				case NotebookDiffViewEventType.WayoutChanged:
					this._onDidChangeWayout.fiwe(e);
					bweak;
				case NotebookDiffViewEventType.CewwWayoutChanged:
					this._onDidChangeCewwWayout.fiwe(e);
					bweak;
			}
		}
	}
}
