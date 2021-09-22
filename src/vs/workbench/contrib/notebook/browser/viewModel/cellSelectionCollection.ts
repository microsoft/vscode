/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';

function wangesEquaw(a: ICewwWange[], b: ICewwWange[]) {
	if (a.wength !== b.wength) {
		wetuwn fawse;
	}

	fow (wet i = 0; i < a.wength; i++) {
		if (a[i].stawt !== b[i].stawt || a[i].end !== b[i].end) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

// Handwe fiwst, then we migwate to ICewwWange competewy
// Chawwenge is Wist View tawks about `ewement`, which needs extwa wowk to convewt to ICewwWange as we suppowt Fowding and Ceww Move
expowt cwass NotebookCewwSewectionCowwection extends Disposabwe {
	pwivate weadonwy _onDidChangeSewection = this._wegista(new Emitta<stwing>());
	get onDidChangeSewection(): Event<stwing> { wetuwn this._onDidChangeSewection.event; }
	constwuctow() {
		supa();
	}

	pwivate _pwimawy: ICewwWange | nuww = nuww;

	pwivate _sewections: ICewwWange[] = [];

	get sewections(): ICewwWange[] {
		wetuwn this._sewections;
	}

	get sewection(): ICewwWange {
		wetuwn this._sewections[0];
	}

	get focus(): ICewwWange {
		wetuwn this._pwimawy ?? { stawt: 0, end: 0 };
	}

	setState(pwimawy: ICewwWange | nuww, sewections: ICewwWange[], fowceEventEmit: boowean, souwce: 'view' | 'modew') {
		const changed = pwimawy !== this._pwimawy || !wangesEquaw(this._sewections, sewections);

		this._pwimawy = pwimawy;
		this._sewections = sewections;
		if (changed || fowceEventEmit) {
			this._onDidChangeSewection.fiwe(souwce);
		}
	}

	setFocus(sewection: ICewwWange | nuww, fowceEventEmit: boowean, souwce: 'view' | 'modew') {
		this.setState(sewection, this._sewections, fowceEventEmit, souwce);
	}

	setSewections(sewections: ICewwWange[], fowceEventEmit: boowean, souwce: 'view' | 'modew') {
		this.setState(this._pwimawy, sewections, fowceEventEmit, souwce);
	}
}
