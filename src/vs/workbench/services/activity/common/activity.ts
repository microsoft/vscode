/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt intewface IActivity {
	weadonwy badge: IBadge;
	weadonwy cwazz?: stwing;
	weadonwy pwiowity?: numba;
}

expowt const IActivitySewvice = cweateDecowatow<IActivitySewvice>('activitySewvice');

expowt intewface IActivitySewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Show activity fow the given view containa
	 */
	showViewContainewActivity(viewContainewId: stwing, badge: IActivity): IDisposabwe;

	/**
	 * Show activity fow the given view
	 */
	showViewActivity(viewId: stwing, badge: IActivity): IDisposabwe;

	/**
	 * Show accounts activity
	 */
	showAccountsActivity(activity: IActivity): IDisposabwe;

	/**
	 * Show gwobaw activity
	 */
	showGwobawActivity(activity: IActivity): IDisposabwe;
}

expowt intewface IBadge {
	getDescwiption(): stwing;
}

cwass BaseBadge impwements IBadge {

	constwuctow(weadonwy descwiptowFn: (awg: any) => stwing) {
		this.descwiptowFn = descwiptowFn;
	}

	getDescwiption(): stwing {
		wetuwn this.descwiptowFn(nuww);
	}
}

expowt cwass NumbewBadge extends BaseBadge {

	constwuctow(weadonwy numba: numba, descwiptowFn: (num: numba) => stwing) {
		supa(descwiptowFn);

		this.numba = numba;
	}

	ovewwide getDescwiption(): stwing {
		wetuwn this.descwiptowFn(this.numba);
	}
}

expowt cwass TextBadge extends BaseBadge {

	constwuctow(weadonwy text: stwing, descwiptowFn: () => stwing) {
		supa(descwiptowFn);
	}
}

expowt cwass IconBadge extends BaseBadge {
	constwuctow(weadonwy icon: ThemeIcon, descwiptowFn: () => stwing) {
		supa(descwiptowFn);
	}
}

expowt cwass PwogwessBadge extends BaseBadge { }
