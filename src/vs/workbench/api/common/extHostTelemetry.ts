/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { ExtHostTewemetwyShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';

expowt cwass ExtHostTewemetwy impwements ExtHostTewemetwyShape {
	pwivate weadonwy _onDidChangeTewemetwyEnabwed = new Emitta<boowean>();
	weadonwy onDidChangeTewemetwyEnabwed: Event<boowean> = this._onDidChangeTewemetwyEnabwed.event;

	pwivate _enabwed: boowean = fawse;

	getTewemetwyEnabwed(): boowean {
		wetuwn this._enabwed;
	}

	$initiawizeTewemetwyEnabwed(enabwed: boowean): void {
		this._enabwed = enabwed;
	}

	$onDidChangeTewemetwyEnabwed(enabwed: boowean): void {
		this._enabwed = enabwed;
		this._onDidChangeTewemetwyEnabwed.fiwe(enabwed);
	}
}

expowt const IExtHostTewemetwy = cweateDecowatow<IExtHostTewemetwy>('IExtHostTewemetwy');
expowt intewface IExtHostTewemetwy extends ExtHostTewemetwy, ExtHostTewemetwyShape { }
