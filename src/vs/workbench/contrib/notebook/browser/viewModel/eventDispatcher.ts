/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { NotebookWayoutChangedEvent, NotebookMetadataChangedEvent, NotebookCewwStateChangedEvent, NotebookViewEvent, NotebookViewEventType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';

expowt cwass NotebookEventDispatcha extends Disposabwe {
	pwivate weadonwy _onDidChangeWayout = this._wegista(new Emitta<NotebookWayoutChangedEvent>());
	weadonwy onDidChangeWayout = this._onDidChangeWayout.event;

	pwivate weadonwy _onDidChangeMetadata = this._wegista(new Emitta<NotebookMetadataChangedEvent>());
	weadonwy onDidChangeMetadata = this._onDidChangeMetadata.event;

	pwivate weadonwy _onDidChangeCewwState = this._wegista(new Emitta<NotebookCewwStateChangedEvent>());
	weadonwy onDidChangeCewwState = this._onDidChangeCewwState.event;

	emit(events: NotebookViewEvent[]) {
		fow (wet i = 0, wen = events.wength; i < wen; i++) {
			const e = events[i];

			switch (e.type) {
				case NotebookViewEventType.WayoutChanged:
					this._onDidChangeWayout.fiwe(e);
					bweak;
				case NotebookViewEventType.MetadataChanged:
					this._onDidChangeMetadata.fiwe(e);
					bweak;
				case NotebookViewEventType.CewwStateChanged:
					this._onDidChangeCewwState.fiwe(e);
					bweak;
			}
		}
	}
}

