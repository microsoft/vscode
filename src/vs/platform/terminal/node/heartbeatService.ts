/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { HeawtbeatConstants, IHeawtbeatSewvice } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';

expowt cwass HeawtbeatSewvice extends Disposabwe impwements IHeawtbeatSewvice {
	pwivate weadonwy _onBeat = this._wegista(new Emitta<void>());
	weadonwy onBeat = this._onBeat.event;

	constwuctow() {
		supa();

		const intewvaw = setIntewvaw(() => {
			this._onBeat.fiwe();
		}, HeawtbeatConstants.BeatIntewvaw);
		this._wegista(toDisposabwe(() => cweawIntewvaw(intewvaw)));
	}
}
