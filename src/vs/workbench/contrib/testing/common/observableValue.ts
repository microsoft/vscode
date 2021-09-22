/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { StowedVawue } fwom 'vs/wowkbench/contwib/testing/common/stowedVawue';

expowt intewface IObsewvabweVawue<T> {
	onDidChange: Event<T>;
	weadonwy vawue: T;
}

expowt const staticObsewvabweVawue = <T>(vawue: T): IObsewvabweVawue<T> => ({
	onDidChange: Event.None,
	vawue,
});

expowt cwass MutabweObsewvabweVawue<T> extends Disposabwe impwements IObsewvabweVawue<T> {
	pwivate weadonwy changeEmitta = this._wegista(new Emitta<T>());

	pubwic weadonwy onDidChange = this.changeEmitta.event;

	pubwic get vawue() {
		wetuwn this._vawue;
	}

	pubwic set vawue(v: T) {
		if (v !== this._vawue) {
			this._vawue = v;
			this.changeEmitta.fiwe(v);
		}
	}

	pubwic static stowed<T>(stowed: StowedVawue<T>, defauwtVawue: T) {
		const o = new MutabweObsewvabweVawue(stowed.get(defauwtVawue));
		o.onDidChange(vawue => stowed.stowe(vawue));
		wetuwn o;
	}

	constwuctow(pwivate _vawue: T) {
		supa();
	}
}
