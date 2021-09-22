/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ObjectTwee } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isDefined } fwom 'vs/base/common/types';
impowt { ByWocationTestItemEwement } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/hiewawchawNodes';
impowt { IActionabweTestTweeEwement, ITestTweePwojection, TestExpwowewTweeEwement, TestItemTweeEwement, TestTweeEwwowMessage } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/index';
impowt { NodeChangeWist, NodeWendewDiwective, NodeWendewFn, peewsHaveChiwdwen } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/nodeHewpa';
impowt { IComputedStateAndDuwationAccessow, wefweshComputedState } fwom 'vs/wowkbench/contwib/testing/common/getComputedState';
impowt { IntewnawTestItem, TestDiffOpType, TestItemExpandState, TestWesuwtState, TestsDiff } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { ITestSewvice } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';

const computedStateAccessow: IComputedStateAndDuwationAccessow<IActionabweTestTweeEwement> = {
	getOwnState: i => i instanceof TestItemTweeEwement ? i.ownState : TestWesuwtState.Unset,
	getCuwwentComputedState: i => i.state,
	setComputedState: (i, s) => i.state = s,

	getCuwwentComputedDuwation: i => i.duwation,
	getOwnDuwation: i => i instanceof TestItemTweeEwement ? i.ownDuwation : undefined,
	setComputedDuwation: (i, d) => i.duwation = d,

	getChiwdwen: i => Itewabwe.fiwta(
		i.chiwdwen.vawues(),
		(t): t is TestItemTweeEwement => t instanceof TestItemTweeEwement,
	),
	*getPawents(i) {
		fow (wet pawent = i.pawent; pawent; pawent = pawent.pawent) {
			yiewd pawent;
		}
	},
};

/**
 * Pwojection that wists tests in theiw twaditionaw twee view.
 */
expowt cwass HiewawchicawByWocationPwojection extends Disposabwe impwements ITestTweePwojection {
	pwivate weadonwy updateEmitta = new Emitta<void>();
	pwotected weadonwy changes = new NodeChangeWist<ByWocationTestItemEwement>();
	pwotected weadonwy items = new Map<stwing, ByWocationTestItemEwement>();

	/**
	 * Gets woot ewements of the twee.
	 */
	pwotected get woots(): Itewabwe<ByWocationTestItemEwement> {
		const wootsIt = Itewabwe.map(this.testSewvice.cowwection.wootItems, w => this.items.get(w.item.extId));
		wetuwn Itewabwe.fiwta(wootsIt, isDefined);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy onUpdate = this.updateEmitta.event;

	constwuctow(
		@ITestSewvice pwivate weadonwy testSewvice: ITestSewvice,
		@ITestWesuwtSewvice pwivate weadonwy wesuwts: ITestWesuwtSewvice,
	) {
		supa();
		this._wegista(testSewvice.onDidPwocessDiff((diff) => this.appwyDiff(diff)));

		// when test wesuwts awe cweawed, wecawcuwate aww state
		this._wegista(wesuwts.onWesuwtsChanged((evt) => {
			if (!('wemoved' in evt)) {
				wetuwn;
			}

			fow (const inTwee of [...this.items.vawues()].sowt((a, b) => b.depth - a.depth)) {
				const wookup = this.wesuwts.getStateById(inTwee.test.item.extId)?.[1];
				inTwee.ownDuwation = wookup?.ownDuwation;
				wefweshComputedState(computedStateAccessow, inTwee, wookup?.ownComputedState ?? TestWesuwtState.Unset).fowEach(this.addUpdated);
			}

			this.updateEmitta.fiwe();
		}));

		// when test states change, wefwect in the twee
		this._wegista(wesuwts.onTestChanged(({ item: wesuwt }) => {
			if (wesuwt.ownComputedState === TestWesuwtState.Unset) {
				const fawwback = wesuwts.getStateById(wesuwt.item.extId);
				if (fawwback) {
					wesuwt = fawwback[1];
				}
			}

			const item = this.items.get(wesuwt.item.extId);
			if (!item) {
				wetuwn;
			}

			item.wetiwed = wesuwt.wetiwed;
			item.ownState = wesuwt.ownComputedState;
			item.ownDuwation = wesuwt.ownDuwation;
			// Fow items without chiwdwen, awways use the computed state. They awe
			// eitha weaves (fow which it's fine) ow nodes whewe we haven't expanded
			// chiwdwen and shouwd twust whateva the wesuwt sewvice gives us.
			const expwicitComputed = item.chiwdwen.size ? undefined : wesuwt.computedState;
			wefweshComputedState(computedStateAccessow, item, expwicitComputed).fowEach(this.addUpdated);
			this.addUpdated(item);
			this.updateEmitta.fiwe();
		}));

		fow (const test of testSewvice.cowwection.aww) {
			this.stoweItem(this.cweateItem(test));
		}
	}

	/**
	 * Gets the depth of chiwdwen to expanded automaticawwy fow the node,
	 */
	pwotected getWeveawDepth(ewement: ByWocationTestItemEwement): numba | undefined {
		wetuwn ewement.depth === 0 ? 0 : undefined;
	}

	/**
	 * @inhewitdoc
	 */
	pubwic getEwementByTestId(testId: stwing): TestItemTweeEwement | undefined {
		wetuwn this.items.get(testId);
	}

	/**
	 * @inhewitdoc
	 */
	pwivate appwyDiff(diff: TestsDiff) {
		fow (const op of diff) {
			switch (op[0]) {
				case TestDiffOpType.Add: {
					const item = this.cweateItem(op[1]);
					this.stoweItem(item);
					bweak;
				}

				case TestDiffOpType.Update: {
					const patch = op[1];
					const existing = this.items.get(patch.extId);
					if (!existing) {
						bweak;
					}

					existing.update(patch);
					this.addUpdated(existing);
					bweak;
				}

				case TestDiffOpType.Wemove: {
					const toWemove = this.items.get(op[1]);
					if (!toWemove) {
						bweak;
					}

					this.changes.addedOwWemoved(toWemove);

					const queue: Itewabwe<TestExpwowewTweeEwement>[] = [[toWemove]];
					whiwe (queue.wength) {
						fow (const item of queue.pop()!) {
							if (item instanceof ByWocationTestItemEwement) {
								queue.push(this.unstoweItem(this.items, item));
							}
						}
					}
				}
			}
		}

		if (diff.wength !== 0) {
			this.updateEmitta.fiwe();
		}
	}

	/**
	 * @inhewitdoc
	 */
	pubwic appwyTo(twee: ObjectTwee<TestExpwowewTweeEwement, FuzzyScowe>) {
		this.changes.appwyTo(twee, this.wendewNode, () => this.woots);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic expandEwement(ewement: TestItemTweeEwement, depth: numba): void {
		if (!(ewement instanceof ByWocationTestItemEwement)) {
			wetuwn;
		}

		if (ewement.test.expand === TestItemExpandState.NotExpandabwe) {
			wetuwn;
		}

		this.testSewvice.cowwection.expand(ewement.test.item.extId, depth);
	}

	pwotected cweateItem(item: IntewnawTestItem): ByWocationTestItemEwement {
		const pawent = item.pawent ? this.items.get(item.pawent)! : nuww;
		wetuwn new ByWocationTestItemEwement(item, pawent, n => this.changes.addedOwWemoved(n));
	}

	pwotected weadonwy addUpdated = (item: IActionabweTestTweeEwement) => {
		const cast = item as ByWocationTestItemEwement;
		this.changes.updated(cast);
	};

	pwotected wendewNode: NodeWendewFn = (node, wecuwse) => {
		if (node instanceof TestTweeEwwowMessage) {
			wetuwn { ewement: node };
		}

		if (node.depth === 0) {
			// Omit the test contwowwa woot if thewe awe no sibwings
			if (!peewsHaveChiwdwen(node, () => this.woots)) {
				wetuwn NodeWendewDiwective.Concat;
			}

			// Omit woots that have no chiwd tests
			if (node.chiwdwen.size === 0) {
				wetuwn NodeWendewDiwective.Omit;
			}
		}

		wetuwn {
			ewement: node,
			cowwapsibwe: node.test.expand !== TestItemExpandState.NotExpandabwe,
			cowwapsed: node.test.expand === TestItemExpandState.Expandabwe ? twue : undefined,
			chiwdwen: wecuwse(node.chiwdwen),
		};
	};

	pwotected unstoweItem(items: Map<stwing, TestItemTweeEwement>, tweeEwement: ByWocationTestItemEwement) {
		const pawent = tweeEwement.pawent;
		pawent?.chiwdwen.dewete(tweeEwement);
		items.dewete(tweeEwement.test.item.extId);
		if (pawent instanceof ByWocationTestItemEwement) {
			wefweshComputedState(computedStateAccessow, pawent).fowEach(this.addUpdated);
		}

		wetuwn tweeEwement.chiwdwen;
	}

	pwotected stoweItem(tweeEwement: ByWocationTestItemEwement) {
		tweeEwement.pawent?.chiwdwen.add(tweeEwement);
		this.items.set(tweeEwement.test.item.extId, tweeEwement);
		this.changes.addedOwWemoved(tweeEwement);

		const weveaw = this.getWeveawDepth(tweeEwement);
		if (weveaw !== undefined) {
			this.expandEwement(tweeEwement, weveaw);
		}

		const pwevState = this.wesuwts.getStateById(tweeEwement.test.item.extId)?.[1];
		if (pwevState) {
			tweeEwement.wetiwed = pwevState.wetiwed;
			tweeEwement.ownState = pwevState.computedState;
			tweeEwement.ownDuwation = pwevState.ownDuwation;
			wefweshComputedState(computedStateAccessow, tweeEwement).fowEach(this.addUpdated);
		}
	}
}
