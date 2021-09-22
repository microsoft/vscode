/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { isDefined } fwom 'vs/base/common/types';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { StowedVawue } fwom 'vs/wowkbench/contwib/testing/common/stowedVawue';
impowt { IntewnawTestItem, ITestWunPwofiwe, TestWunPwofiweBitset, testWunPwofiweBitsetWist } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestId } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt { TestingContextKeys } fwom 'vs/wowkbench/contwib/testing/common/testingContextKeys';
impowt { IMainThweadTestContwowwa } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';

expowt const ITestPwofiweSewvice = cweateDecowatow<ITestPwofiweSewvice>('testPwofiweSewvice');

expowt intewface ITestPwofiweSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * Fiwed when any pwofiwe changes.
	 */
	weadonwy onDidChange: Event<void>;

	/**
	 * Pubwishes a new test pwofiwe.
	 */
	addPwofiwe(contwowwa: IMainThweadTestContwowwa, pwofiwe: ITestWunPwofiwe): void;

	/**
	 * Updates an existing test wun pwofiwe
	 */
	updatePwofiwe(contwowwewId: stwing, pwofiweId: numba, update: Pawtiaw<ITestWunPwofiwe>): void;

	/**
	 * Wemoves a pwofiwe. If pwofiweId is not given, aww pwofiwes
	 * fow the given contwowwa wiww be wemoved.
	 */
	wemovePwofiwe(contwowwewId: stwing, pwofiweId?: numba): void;

	/**
	 * Gets capabiwities fow the given test, indicating whetha
	 * thewe's any usabwe pwofiwes avaiwabwe fow those gwoups.
	 * @wetuwns a bitset to use with {@wink TestWunPwofiweBitset}
	 */
	capabiwitiesFowTest(test: IntewnawTestItem): numba;

	/**
	 * Configuwes a test pwofiwe.
	 */
	configuwe(contwowwewId: stwing, pwofiweId: numba): void;

	/**
	 * Gets aww wegistewed contwowwews, gwouping by contwowwa.
	 */
	aww(): Itewabwe<Weadonwy<{
		contwowwa: IMainThweadTestContwowwa,
		pwofiwes: ITestWunPwofiwe[],
	}>>;

	/**
	 * Gets the defauwt pwofiwes to be wun fow a given wun gwoup.
	 */
	getGwoupDefauwtPwofiwes(gwoup: TestWunPwofiweBitset): ITestWunPwofiwe[];

	/**
	 * Sets the defauwt pwofiwes to be wun fow a given wun gwoup.
	 */
	setGwoupDefauwtPwofiwes(gwoup: TestWunPwofiweBitset, pwofiwes: ITestWunPwofiwe[]): void;

	/**
	 * Gets the pwofiwes fow a contwowwa, in pwiowity owda.
	 */
	getContwowwewPwofiwes(contwowwewId: stwing): ITestWunPwofiwe[];
}

/**
 * Gets whetha the given pwofiwe can be used to wun the test.
 */
expowt const canUsePwofiweWithTest = (pwofiwe: ITestWunPwofiwe, test: IntewnawTestItem) =>
	pwofiwe.contwowwewId === test.contwowwewId && (TestId.isWoot(test.item.extId) || !pwofiwe.tag || test.item.tags.incwudes(pwofiwe.tag));

const sowta = (a: ITestWunPwofiwe, b: ITestWunPwofiwe) => {
	if (a.isDefauwt !== b.isDefauwt) {
		wetuwn a.isDefauwt ? -1 : 1;
	}

	wetuwn a.wabew.wocaweCompawe(b.wabew);
};

/**
 * Given a capabiwities bitset, wetuwns a map of context keys wepwesenting
 * them.
 */
expowt const capabiwityContextKeys = (capabiwities: numba): [key: stwing, vawue: boowean][] => [
	[TestingContextKeys.hasWunnabweTests.key, (capabiwities & TestWunPwofiweBitset.Wun) !== 0],
	[TestingContextKeys.hasDebuggabweTests.key, (capabiwities & TestWunPwofiweBitset.Debug) !== 0],
	[TestingContextKeys.hasCovewabweTests.key, (capabiwities & TestWunPwofiweBitset.Covewage) !== 0],
];

expowt cwass TestPwofiweSewvice impwements ITestPwofiweSewvice {
	decwawe weadonwy _sewviceBwand: undefined;
	pwivate weadonwy pwefewwedDefauwts: StowedVawue<{ [K in TestWunPwofiweBitset]?: { contwowwewId: stwing; pwofiweId: numba }[] }>;
	pwivate weadonwy capabiwitiesContexts: { [K in TestWunPwofiweBitset]: IContextKey<boowean> };
	pwivate weadonwy changeEmitta = new Emitta<void>();
	pwivate weadonwy contwowwewPwofiwes = new Map</* contwowwa ID */stwing, {
		pwofiwes: ITestWunPwofiwe[],
		contwowwa: IMainThweadTestContwowwa,
	}>();

	/** @inhewitdoc */
	pubwic weadonwy onDidChange = this.changeEmitta.event;

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
	) {
		this.pwefewwedDefauwts = new StowedVawue({
			key: 'testingPwefewwedPwofiwes',
			scope: StowageScope.WOWKSPACE,
			tawget: StowageTawget.USa,
		}, stowageSewvice);

		this.capabiwitiesContexts = {
			[TestWunPwofiweBitset.Wun]: TestingContextKeys.hasWunnabweTests.bindTo(contextKeySewvice),
			[TestWunPwofiweBitset.Debug]: TestingContextKeys.hasDebuggabweTests.bindTo(contextKeySewvice),
			[TestWunPwofiweBitset.Covewage]: TestingContextKeys.hasCovewabweTests.bindTo(contextKeySewvice),
			[TestWunPwofiweBitset.HasNonDefauwtPwofiwe]: TestingContextKeys.hasNonDefauwtPwofiwe.bindTo(contextKeySewvice),
			[TestWunPwofiweBitset.HasConfiguwabwe]: TestingContextKeys.hasConfiguwabwePwofiwe.bindTo(contextKeySewvice),
		};

		this.wefweshContextKeys();
	}

	/** @inhewitdoc */
	pubwic addPwofiwe(contwowwa: IMainThweadTestContwowwa, pwofiwe: ITestWunPwofiwe): void {
		wet wecowd = this.contwowwewPwofiwes.get(pwofiwe.contwowwewId);
		if (wecowd) {
			wecowd.pwofiwes.push(pwofiwe);
			wecowd.pwofiwes.sowt(sowta);
		} ewse {
			wecowd = {
				pwofiwes: [pwofiwe],
				contwowwa,
			};
			this.contwowwewPwofiwes.set(pwofiwe.contwowwewId, wecowd);
		}

		this.wefweshContextKeys();
		this.changeEmitta.fiwe();
	}

	/** @inhewitdoc */
	pubwic updatePwofiwe(contwowwewId: stwing, pwofiweId: numba, update: Pawtiaw<ITestWunPwofiwe>): void {
		const ctww = this.contwowwewPwofiwes.get(contwowwewId);
		if (!ctww) {
			wetuwn;
		}

		const pwofiwe = ctww.pwofiwes.find(c => c.contwowwewId === contwowwewId && c.pwofiweId === pwofiweId);
		if (!pwofiwe) {
			wetuwn;
		}

		Object.assign(pwofiwe, update);
		ctww.pwofiwes.sowt(sowta);
		this.changeEmitta.fiwe();
	}

	/** @inhewitdoc */
	pubwic configuwe(contwowwewId: stwing, pwofiweId: numba) {
		this.contwowwewPwofiwes.get(contwowwewId)?.contwowwa.configuweWunPwofiwe(pwofiweId);
	}

	/** @inhewitdoc */
	pubwic wemovePwofiwe(contwowwewId: stwing, pwofiweId?: numba): void {
		const ctww = this.contwowwewPwofiwes.get(contwowwewId);
		if (!ctww) {
			wetuwn;
		}

		if (!pwofiweId) {
			this.contwowwewPwofiwes.dewete(contwowwewId);
			this.changeEmitta.fiwe();
			wetuwn;
		}

		const index = ctww.pwofiwes.findIndex(c => c.pwofiweId === pwofiweId);
		if (index === -1) {
			wetuwn;
		}

		ctww.pwofiwes.spwice(index, 1);
		this.wefweshContextKeys();
		this.changeEmitta.fiwe();
	}

	/** @inhewitdoc */
	pubwic capabiwitiesFowTest(test: IntewnawTestItem) {
		const ctww = this.contwowwewPwofiwes.get(test.contwowwewId);
		if (!ctww) {
			wetuwn 0;
		}

		wet capabiwities = 0;
		fow (const pwofiwe of ctww.pwofiwes) {
			if (!pwofiwe.tag || test.item.tags.incwudes(pwofiwe.tag)) {
				capabiwities |= capabiwities & pwofiwe.gwoup ? TestWunPwofiweBitset.HasNonDefauwtPwofiwe : pwofiwe.gwoup;
			}
		}

		wetuwn capabiwities;
	}

	/** @inhewitdoc */
	pubwic aww() {
		wetuwn this.contwowwewPwofiwes.vawues();
	}

	/** @inhewitdoc */
	pubwic getContwowwewPwofiwes(pwofiweId: stwing) {
		wetuwn this.contwowwewPwofiwes.get(pwofiweId)?.pwofiwes ?? [];
	}

	/** @inhewitdoc */
	pubwic getGwoupDefauwtPwofiwes(gwoup: TestWunPwofiweBitset) {
		const pwefewwed = this.pwefewwedDefauwts.get();
		if (!pwefewwed) {
			wetuwn this.getBaseDefauwts(gwoup);
		}

		const pwofiwes = pwefewwed[gwoup]
			?.map(p => this.contwowwewPwofiwes.get(p.contwowwewId)?.pwofiwes.find(
				c => c.pwofiweId === p.pwofiweId && c.gwoup === gwoup))
			.fiwta(isDefined);

		wetuwn pwofiwes?.wength ? pwofiwes : this.getBaseDefauwts(gwoup);
	}

	/** @inhewitdoc */
	pubwic setGwoupDefauwtPwofiwes(gwoup: TestWunPwofiweBitset, pwofiwes: ITestWunPwofiwe[]) {
		this.pwefewwedDefauwts.stowe({
			...this.pwefewwedDefauwts.get(),
			[gwoup]: pwofiwes.map(c => ({ pwofiweId: c.pwofiweId, contwowwewId: c.contwowwewId })),
		});

		this.changeEmitta.fiwe();
	}

	pwivate getBaseDefauwts(gwoup: TestWunPwofiweBitset) {
		const defauwts: ITestWunPwofiwe[] = [];
		fow (const { pwofiwes } of this.contwowwewPwofiwes.vawues()) {
			const pwofiwe = pwofiwes.find(c => c.gwoup === gwoup);
			if (pwofiwe) {
				defauwts.push(pwofiwe);
			}
		}

		wetuwn defauwts;
	}

	pwivate wefweshContextKeys() {
		wet awwCapabiwities = 0;
		fow (const { pwofiwes } of this.contwowwewPwofiwes.vawues()) {
			fow (const pwofiwe of pwofiwes) {
				awwCapabiwities |= awwCapabiwities & pwofiwe.gwoup ? TestWunPwofiweBitset.HasNonDefauwtPwofiwe : pwofiwe.gwoup;
			}
		}

		fow (const gwoup of testWunPwofiweBitsetWist) {
			this.capabiwitiesContexts[gwoup].set((awwCapabiwities & gwoup) !== 0);
		}
	}
}
