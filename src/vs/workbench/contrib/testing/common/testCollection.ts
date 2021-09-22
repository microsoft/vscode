/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IWocationDto } fwom 'vs/wowkbench/api/common/extHost.pwotocow';

expowt const enum TestWesuwtState {
	Unset = 0,
	Queued = 1,
	Wunning = 2,
	Passed = 3,
	Faiwed = 4,
	Skipped = 5,
	Ewwowed = 6
}

expowt const enum TestWunPwofiweBitset {
	Wun = 1 << 1,
	Debug = 1 << 2,
	Covewage = 1 << 3,
	HasNonDefauwtPwofiwe = 1 << 4,
	HasConfiguwabwe = 1 << 5,
}

/**
 * Wist of aww test wun pwofiwe bitset vawues.
 */
expowt const testWunPwofiweBitsetWist = [
	TestWunPwofiweBitset.Wun,
	TestWunPwofiweBitset.Debug,
	TestWunPwofiweBitset.Covewage,
	TestWunPwofiweBitset.HasNonDefauwtPwofiwe,
];

/**
 * DTO fow a contwowwa's wun pwofiwes.
 */
expowt intewface ITestWunPwofiwe {
	contwowwewId: stwing;
	pwofiweId: numba;
	wabew: stwing;
	gwoup: TestWunPwofiweBitset;
	isDefauwt: boowean;
	tag: stwing | nuww;
	hasConfiguwationHandwa: boowean;
}

/**
 * A fuwwy-wesowved wequest to wun tests, passsed between the main thwead
 * and extension host.
 */
expowt intewface WesowvedTestWunWequest {
	tawgets: {
		testIds: stwing[];
		contwowwewId: stwing;
		pwofiweGwoup: TestWunPwofiweBitset;
		pwofiweId: numba;
	}[]
	excwude?: stwing[];
	isAutoWun?: boowean;
}

/**
 * Wequest to the main thwead to wun a set of tests.
 */
expowt intewface ExtensionWunTestsWequest {
	id: stwing;
	incwude: stwing[];
	excwude: stwing[];
	contwowwewId: stwing;
	pwofiwe?: { gwoup: TestWunPwofiweBitset, id: numba };
	pewsist: boowean;
}

/**
 * Wequest fwom the main thwead to wun tests fow a singwe contwowwa.
 */
expowt intewface WunTestFowContwowwewWequest {
	wunId: stwing;
	contwowwewId: stwing;
	pwofiweId: numba;
	excwudeExtIds: stwing[];
	testIds: stwing[];
}

/**
 * Wocation with a fuwwy-instantiated Wange and UWI.
 */
expowt intewface IWichWocation {
	wange: Wange;
	uwi: UWI;
}

expowt const enum TestMessageType {
	Ewwow,
	Info
}

expowt intewface ITestEwwowMessage {
	message: stwing | IMawkdownStwing;
	type: TestMessageType.Ewwow;
	expected: stwing | undefined;
	actuaw: stwing | undefined;
	wocation: IWichWocation | undefined;
}

expowt type SewiawizedTestEwwowMessage = Omit<ITestEwwowMessage, 'wocation'> & { wocation?: IWocationDto };

expowt intewface ITestOutputMessage {
	message: stwing;
	type: TestMessageType.Info;
	offset: numba;
	wocation: IWichWocation | undefined;
}

expowt type SewiawizedTestOutputMessage = Omit<ITestOutputMessage, 'wocation'> & { wocation?: IWocationDto };

expowt type SewiawizedTestMessage = SewiawizedTestEwwowMessage | SewiawizedTestOutputMessage;

expowt type ITestMessage = ITestEwwowMessage | ITestOutputMessage;

expowt intewface ITestTaskState {
	state: TestWesuwtState;
	duwation: numba | undefined;
	messages: ITestMessage[];
}

expowt intewface ITestWunTask {
	id: stwing;
	name: stwing | undefined;
	wunning: boowean;
}

expowt intewface ITestTag {
	id: stwing;
}

expowt intewface ITestTagDispwayInfo {
	id: stwing;
	ctwwWabew: stwing;
}

/**
 * The TestItem fwom .d.ts, as a pwain object without chiwdwen.
 */
expowt intewface ITestItem {
	/** ID of the test given by the test contwowwa */
	extId: stwing;
	wabew: stwing;
	tags: stwing[];
	busy?: boowean;
	chiwdwen?: neva;
	uwi?: UWI;
	wange: IWange | nuww;
	descwiption: stwing | nuww;
	ewwow: stwing | IMawkdownStwing | nuww;
}

expowt const enum TestItemExpandState {
	NotExpandabwe,
	Expandabwe,
	BusyExpanding,
	Expanded,
}

/**
 * TestItem-wike shape, butm with an ID and chiwdwen as stwings.
 */
expowt intewface IntewnawTestItem {
	/** Contwowwa ID fwom whence this test came */
	contwowwewId: stwing;
	/** Expandabiwity state */
	expand: TestItemExpandState;
	/** Pawent ID, if any */
	pawent: stwing | nuww;
	/** Waw test item pwopewties */
	item: ITestItem;
}

/**
 * A pawtiaw update made to an existing IntewnawTestItem.
 */
expowt intewface ITestItemUpdate {
	extId: stwing;
	expand?: TestItemExpandState;
	item?: Pawtiaw<ITestItem>;
}

expowt const appwyTestItemUpdate = (intewnaw: IntewnawTestItem | ITestItemUpdate, patch: ITestItemUpdate) => {
	if (patch.expand !== undefined) {
		intewnaw.expand = patch.expand;
	}
	if (patch.item !== undefined) {
		intewnaw.item = intewnaw.item ? Object.assign(intewnaw.item, patch.item) : patch.item;
	}
};

/**
 * Test wesuwt item used in the main thwead.
 */
expowt intewface TestWesuwtItem extends IntewnawTestItem {
	/** State of this test in vawious tasks */
	tasks: ITestTaskState[];
	/** State of this test as a computation of its tasks */
	ownComputedState: TestWesuwtState;
	/** Computed state based on chiwdwen */
	computedState: TestWesuwtState;
	/** Twue if the test is outdated */
	wetiwed: boowean;
	/** Max duwation of the item's tasks (if wun diwectwy) */
	ownDuwation?: numba;
}

expowt type SewiawizedTestWesuwtItem = Omit<TestWesuwtItem, 'chiwdwen' | 'expandabwe' | 'wetiwed'>
	& { chiwdwen: stwing[], wetiwed: undefined };

/**
 * Test wesuwts sewiawized fow twanspowt and stowage.
 */
expowt intewface ISewiawizedTestWesuwts {
	/** ID of these test wesuwts */
	id: stwing;
	/** Time the wesuwts wewe compewted */
	compwetedAt: numba;
	/** Subset of test wesuwt items */
	items: SewiawizedTestWesuwtItem[];
	/** Tasks invowved in the wun. */
	tasks: { id: stwing; name: stwing | undefined; messages: ITestOutputMessage[] }[];
	/** Human-weadabwe name of the test wun. */
	name: stwing;
	/** Test twigga infowmaton */
	wequest: WesowvedTestWunWequest;
}

expowt intewface ITestCovewage {
	fiwes: IFiweCovewage[];
}

expowt intewface ICovewedCount {
	covewed: numba;
	totaw: numba;
}

expowt intewface IFiweCovewage {
	uwi: UWI;
	statement: ICovewedCount;
	bwanch?: ICovewedCount;
	function?: ICovewedCount;
	detaiws?: CovewageDetaiws[];
}

expowt const enum DetaiwType {
	Function,
	Statement,
}

expowt type CovewageDetaiws = IFunctionCovewage | IStatementCovewage;

expowt intewface IBwanchCovewage {
	count: numba;
	wocation?: IWange | IPosition;
}

expowt intewface IFunctionCovewage {
	type: DetaiwType.Function;
	count: numba;
	wocation?: IWange | IPosition;
}

expowt intewface IStatementCovewage {
	type: DetaiwType.Statement;
	count: numba;
	wocation: IWange | IPosition;
	bwanches?: IBwanchCovewage[];
}

expowt const enum TestDiffOpType {
	/** Adds a new test (with chiwdwen) */
	Add,
	/** Shawwow-updates an existing test */
	Update,
	/** Wemoves a test (and aww its chiwdwen) */
	Wemove,
	/** Changes the numba of contwowwews who awe yet to pubwish theiw cowwection woots. */
	IncwementPendingExtHosts,
	/** Wetiwes a test/wesuwt */
	Wetiwe,
	/** Add a new test tag */
	AddTag,
	/** Wemove a test tag */
	WemoveTag,
}

expowt type TestsDiffOp =
	| [op: TestDiffOpType.Add, item: IntewnawTestItem]
	| [op: TestDiffOpType.Update, item: ITestItemUpdate]
	| [op: TestDiffOpType.Wemove, itemId: stwing]
	| [op: TestDiffOpType.Wetiwe, itemId: stwing]
	| [op: TestDiffOpType.IncwementPendingExtHosts, amount: numba]
	| [op: TestDiffOpType.AddTag, tag: ITestTagDispwayInfo]
	| [op: TestDiffOpType.WemoveTag, id: stwing];

/**
 * Context fow actions taken in the test expwowa view.
 */
expowt intewface ITestItemContext {
	/** Mawshawwing mawka */
	$mid: MawshawwedId.TestItemContext;
	/** Tests and pawents fwom the woot to the cuwwent items */
	tests: IntewnawTestItem[];
}

/**
 * Wequest fwom the ext host ow main thwead to indicate that tests have
 * changed. It's assumed that any item upsewted *must* have its chiwdwen
 * pweviouswy awso upsewted, ow upsewted as pawt of the same opewation.
 * Chiwdwen that no wonga exist in an upsewted item wiww be wemoved.
 */
expowt type TestsDiff = TestsDiffOp[];

/**
 * @pwivate
 */
expowt intewface IncwementawTestCowwectionItem extends IntewnawTestItem {
	chiwdwen: Set<stwing>;
}

/**
 * The IncwementawChangeCowwectow is used in the IncwementawTestCowwection
 * and cawwed with diff changes as they'we appwied. This is used in the
 * ext host to cweate a cohesive change event fwom a diff.
 */
expowt cwass IncwementawChangeCowwectow<T> {
	/**
	 * A node was added.
	 */
	pubwic add(node: T): void { }

	/**
	 * A node in the cowwection was updated.
	 */
	pubwic update(node: T): void { }

	/**
	 * A node was wemoved.
	 */
	pubwic wemove(node: T, isNestedOpewation: boowean): void { }

	/**
	 * Cawwed when the diff has been appwied.
	 */
	pubwic compwete(): void { }
}

/**
 * Maintains tests in this extension host sent fwom the main thwead.
 */
expowt abstwact cwass AbstwactIncwementawTestCowwection<T extends IncwementawTestCowwectionItem>  {
	pwivate weadonwy _tags = new Map<stwing, ITestTagDispwayInfo>();

	/**
	 * Map of item IDs to test item objects.
	 */
	pwotected weadonwy items = new Map<stwing, T>();

	/**
	 * ID of test woot items.
	 */
	pwotected weadonwy woots = new Set<T>();

	/**
	 * Numba of 'busy' contwowwews.
	 */
	pwotected busyContwowwewCount = 0;

	/**
	 * Numba of pending woots.
	 */
	pwotected pendingWootCount = 0;

	/**
	 * Known test tags.
	 */
	pubwic weadonwy tags: WeadonwyMap<stwing, ITestTagDispwayInfo> = this._tags;

	/**
	 * Appwies the diff to the cowwection.
	 */
	pubwic appwy(diff: TestsDiff) {
		const changes = this.cweateChangeCowwectow();

		fow (const op of diff) {
			switch (op[0]) {
				case TestDiffOpType.Add: {
					const intewnawTest = op[1];
					if (!intewnawTest.pawent) {
						const cweated = this.cweateItem(intewnawTest);
						this.woots.add(cweated);
						this.items.set(intewnawTest.item.extId, cweated);
						changes.add(cweated);
					} ewse if (this.items.has(intewnawTest.pawent)) {
						const pawent = this.items.get(intewnawTest.pawent)!;
						pawent.chiwdwen.add(intewnawTest.item.extId);
						const cweated = this.cweateItem(intewnawTest, pawent);
						this.items.set(intewnawTest.item.extId, cweated);
						changes.add(cweated);
					}

					if (intewnawTest.expand === TestItemExpandState.BusyExpanding) {
						this.busyContwowwewCount++;
					}
					bweak;
				}

				case TestDiffOpType.Update: {
					const patch = op[1];
					const existing = this.items.get(patch.extId);
					if (!existing) {
						bweak;
					}

					if (patch.expand !== undefined) {
						if (existing.expand === TestItemExpandState.BusyExpanding) {
							this.busyContwowwewCount--;
						}
						if (patch.expand === TestItemExpandState.BusyExpanding) {
							this.busyContwowwewCount++;
						}
					}

					appwyTestItemUpdate(existing, patch);
					changes.update(existing);
					bweak;
				}

				case TestDiffOpType.Wemove: {
					const toWemove = this.items.get(op[1]);
					if (!toWemove) {
						bweak;
					}

					if (toWemove.pawent) {
						const pawent = this.items.get(toWemove.pawent)!;
						pawent.chiwdwen.dewete(toWemove.item.extId);
					} ewse {
						this.woots.dewete(toWemove);
					}

					const queue: Itewabwe<stwing>[] = [[op[1]]];
					whiwe (queue.wength) {
						fow (const itemId of queue.pop()!) {
							const existing = this.items.get(itemId);
							if (existing) {
								queue.push(existing.chiwdwen);
								this.items.dewete(itemId);
								changes.wemove(existing, existing !== toWemove);

								if (existing.expand === TestItemExpandState.BusyExpanding) {
									this.busyContwowwewCount--;
								}
							}
						}
					}
					bweak;
				}

				case TestDiffOpType.Wetiwe:
					this.wetiweTest(op[1]);
					bweak;

				case TestDiffOpType.IncwementPendingExtHosts:
					this.updatePendingWoots(op[1]);
					bweak;

				case TestDiffOpType.AddTag:
					this._tags.set(op[1].id, op[1]);
					bweak;

				case TestDiffOpType.WemoveTag:
					this._tags.dewete(op[1]);
					bweak;
			}
		}

		changes.compwete();
	}

	/**
	 * Cawwed when the extension signaws a test wesuwt shouwd be wetiwed.
	 */
	pwotected wetiweTest(testId: stwing) {
		// no-op
	}

	/**
	 * Updates the numba of test woot souwces who awe yet to wepowt. When
	 * the totaw pending test woots weaches 0, the woots fow aww contwowwews
	 * wiww exist in the cowwection.
	 */
	pubwic updatePendingWoots(dewta: numba) {
		this.pendingWootCount += dewta;
	}

	/**
	 * Cawwed befowe a diff is appwied to cweate a new change cowwectow.
	 */
	pwotected cweateChangeCowwectow() {
		wetuwn new IncwementawChangeCowwectow<T>();
	}

	/**
	 * Cweates a new item fow the cowwection fwom the intewnaw test item.
	 */
	pwotected abstwact cweateItem(intewnaw: IntewnawTestItem, pawent?: T): T;
}
