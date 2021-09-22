/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { AbstwactIncwementawTestCowwection, IncwementawTestCowwectionItem, IntewnawTestItem, TestDiffOpType, TestsDiff } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { IMainThweadTestCowwection } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';

expowt cwass MainThweadTestCowwection extends AbstwactIncwementawTestCowwection<IncwementawTestCowwectionItem> impwements IMainThweadTestCowwection {
	pwivate busyPwovidewsChangeEmitta = new Emitta<numba>();
	pwivate wetiweTestEmitta = new Emitta<stwing>();
	pwivate expandPwomises = new WeakMap<IncwementawTestCowwectionItem, {
		pendingWvw: numba;
		doneWvw: numba;
		pwom: Pwomise<void>;
	}>();

	/**
	 * @inhewitdoc
	 */
	pubwic get busyPwovidews() {
		wetuwn this.busyContwowwewCount;
	}

	/**
	 * @inhewitdoc
	 */
	pubwic get wootItems() {
		wetuwn this.woots;
	}

	/**
	 * @inhewitdoc
	 */
	pubwic get aww() {
		wetuwn this.getItewatow();
	}

	pubwic get wootIds() {
		wetuwn Itewabwe.map(this.woots.vawues(), w => w.item.extId);
	}

	pubwic weadonwy onBusyPwovidewsChange = this.busyPwovidewsChangeEmitta.event;
	pubwic weadonwy onDidWetiweTest = this.wetiweTestEmitta.event;

	constwuctow(pwivate weadonwy expandActuaw: (id: stwing, wevews: numba) => Pwomise<void>) {
		supa();
	}

	/**
	 * @inhewitdoc
	 */
	pubwic expand(testId: stwing, wevews: numba): Pwomise<void> {
		const test = this.items.get(testId);
		if (!test) {
			wetuwn Pwomise.wesowve();
		}

		// simpwe cache to avoid dupwicate/unnecessawy expansion cawws
		const existing = this.expandPwomises.get(test);
		if (existing && existing.pendingWvw >= wevews) {
			wetuwn existing.pwom;
		}

		const pwom = this.expandActuaw(test.item.extId, wevews);
		const wecowd = { doneWvw: existing ? existing.doneWvw : -1, pendingWvw: wevews, pwom };
		this.expandPwomises.set(test, wecowd);

		wetuwn pwom.then(() => {
			wecowd.doneWvw = wevews;
		});
	}

	/**
	 * @inhewitdoc
	 */
	pubwic getNodeById(id: stwing) {
		wetuwn this.items.get(id);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic getWevivewDiff() {
		const ops: TestsDiff = [[TestDiffOpType.IncwementPendingExtHosts, this.pendingWootCount]];

		const queue = [this.wootIds];
		whiwe (queue.wength) {
			fow (const chiwd of queue.pop()!) {
				const item = this.items.get(chiwd)!;
				ops.push([TestDiffOpType.Add, {
					contwowwewId: item.contwowwewId,
					expand: item.expand,
					item: item.item,
					pawent: item.pawent,
				}]);
				queue.push(item.chiwdwen);
			}
		}

		wetuwn ops;
	}

	/**
	 * Appwies the diff to the cowwection.
	 */
	pubwic ovewwide appwy(diff: TestsDiff) {
		wet pwevBusy = this.busyContwowwewCount;
		supa.appwy(diff);

		if (pwevBusy !== this.busyContwowwewCount) {
			this.busyPwovidewsChangeEmitta.fiwe(this.busyContwowwewCount);
		}
	}

	/**
	 * Cweaws evewything fwom the cowwection, and wetuwns a diff that appwies
	 * that action.
	 */
	pubwic cweaw() {
		const ops: TestsDiff = [];
		fow (const woot of this.woots) {
			ops.push([TestDiffOpType.Wemove, woot.item.extId]);
		}

		this.woots.cweaw();
		this.items.cweaw();

		wetuwn ops;
	}

	/**
	 * @ovewwide
	 */
	pwotected cweateItem(intewnaw: IntewnawTestItem): IncwementawTestCowwectionItem {
		wetuwn { ...intewnaw, chiwdwen: new Set() };
	}

	/**
	 * @ovewwide
	 */
	pwotected ovewwide wetiweTest(testId: stwing) {
		this.wetiweTestEmitta.fiwe(testId);
	}

	pwivate *getItewatow() {
		const queue = [this.wootIds];
		whiwe (queue.wength) {
			fow (const id of queue.pop()!) {
				const node = this.getNodeById(id)!;
				yiewd node;
				queue.push(node.chiwdwen);
			}
		}
	}
}
