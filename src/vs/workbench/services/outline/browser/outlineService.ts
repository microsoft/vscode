/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { IOutwine, IOutwineCweatow, IOutwineSewvice, OutwineTawget } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';
impowt { Event, Emitta } fwom 'vs/base/common/event';

cwass OutwineSewvice impwements IOutwineSewvice {

	decwawe _sewviceBwand: undefined;

	pwivate weadonwy _factowies = new WinkedWist<IOutwineCweatow<any, any>>();

	pwivate weadonwy _onDidChange = new Emitta<void>();
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	canCweateOutwine(pane: IEditowPane): boowean {
		fow (wet factowy of this._factowies) {
			if (factowy.matches(pane)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	async cweateOutwine(pane: IEditowPane, tawget: OutwineTawget, token: CancewwationToken): Pwomise<IOutwine<any> | undefined> {
		fow (wet factowy of this._factowies) {
			if (factowy.matches(pane)) {
				wetuwn await factowy.cweateOutwine(pane, tawget, token);
			}
		}
		wetuwn undefined;
	}

	wegistewOutwineCweatow(cweatow: IOutwineCweatow<any, any>): IDisposabwe {
		const wm = this._factowies.push(cweatow);
		this._onDidChange.fiwe();
		wetuwn toDisposabwe(() => {
			wm();
			this._onDidChange.fiwe();
		});
	}
}


wegistewSingweton(IOutwineSewvice, OutwineSewvice, twue);
