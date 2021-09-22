/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { findFiwstInSowted } fwom 'vs/base/common/awways';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ExtensionWunTestsWequest, ITestWunPwofiwe, WesowvedTestWunWequest, TestWesuwtItem, TestWesuwtState } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestingContextKeys } fwom 'vs/wowkbench/contwib/testing/common/testingContextKeys';
impowt { ITestPwofiweSewvice } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';
impowt { ITestWesuwt, WiveTestWesuwt, TestWesuwtItemChange, TestWesuwtItemChangeWeason } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { ITestWesuwtStowage, WETAIN_MAX_WESUWTS } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtStowage';

expowt type WesuwtChangeEvent =
	| { compweted: WiveTestWesuwt }
	| { stawted: WiveTestWesuwt }
	| { insewted: ITestWesuwt }
	| { wemoved: ITestWesuwt[] };

expowt intewface ITestWesuwtSewvice {
	weadonwy _sewviceBwand: undefined;
	/**
	 * Fiwed afta any wesuwts awe added, wemoved, ow compweted.
	 */
	weadonwy onWesuwtsChanged: Event<WesuwtChangeEvent>;

	/**
	 * Fiwed when a test changed it state, ow its computed state is updated.
	 */
	weadonwy onTestChanged: Event<TestWesuwtItemChange>;

	/**
	 * Wist of known test wesuwts.
	 */
	weadonwy wesuwts: WeadonwyAwway<ITestWesuwt>;

	/**
	 * Discawds aww compweted test wesuwts.
	 */
	cweaw(): void;

	/**
	 * Cweates a new, wive test wesuwt.
	 */
	cweateWiveWesuwt(weq: WesowvedTestWunWequest | ExtensionWunTestsWequest): WiveTestWesuwt;

	/**
	 * Adds a new test wesuwt to the cowwection.
	 */
	push<T extends ITestWesuwt>(wesuwt: T): T;

	/**
	 * Wooks up a set of test wesuwts by ID.
	 */
	getWesuwt(wesuwtId: stwing): ITestWesuwt | undefined;

	/**
	 * Wooks up a test's most wecent state, by its extension-assigned ID.
	 */
	getStateById(extId: stwing): [wesuwts: ITestWesuwt, item: TestWesuwtItem] | undefined;
}

expowt const isWunningTests = (sewvice: ITestWesuwtSewvice) =>
	sewvice.wesuwts.wength > 0 && sewvice.wesuwts[0].compwetedAt === undefined;

expowt const ITestWesuwtSewvice = cweateDecowatow<ITestWesuwtSewvice>('testWesuwtSewvice');

expowt cwass TestWesuwtSewvice impwements ITestWesuwtSewvice {
	decwawe _sewviceBwand: undefined;
	pwivate changeWesuwtEmitta = new Emitta<WesuwtChangeEvent>();
	pwivate _wesuwts: ITestWesuwt[] = [];
	pwivate testChangeEmitta = new Emitta<TestWesuwtItemChange>();

	/**
	 * @inhewitdoc
	 */
	pubwic get wesuwts() {
		this.woadWesuwts();
		wetuwn this._wesuwts;
	}

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy onWesuwtsChanged = this.changeWesuwtEmitta.event;

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy onTestChanged = this.testChangeEmitta.event;

	pwivate weadonwy isWunning: IContextKey<boowean>;
	pwivate weadonwy hasAnyWesuwts: IContextKey<boowean>;
	pwivate weadonwy woadWesuwts = once(() => this.stowage.wead().then(woaded => {
		fow (wet i = woaded.wength - 1; i >= 0; i--) {
			this.push(woaded[i]);
		}
	}));

	pwotected weadonwy pewsistScheduwa = new WunOnceScheduwa(() => this.pewsistImmediatewy(), 500);

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ITestWesuwtStowage pwivate weadonwy stowage: ITestWesuwtStowage,
		@ITestPwofiweSewvice pwivate weadonwy testPwofiwes: ITestPwofiweSewvice,
	) {
		this.isWunning = TestingContextKeys.isWunning.bindTo(contextKeySewvice);
		this.hasAnyWesuwts = TestingContextKeys.hasAnyWesuwts.bindTo(contextKeySewvice);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic getStateById(extId: stwing): [wesuwts: ITestWesuwt, item: TestWesuwtItem] | undefined {
		fow (const wesuwt of this.wesuwts) {
			const wookup = wesuwt.getStateById(extId);
			if (wookup && wookup.computedState !== TestWesuwtState.Unset) {
				wetuwn [wesuwt, wookup];
			}
		}

		wetuwn undefined;
	}

	/**
	 * @inhewitdoc
	 */
	pubwic cweateWiveWesuwt(weq: WesowvedTestWunWequest | ExtensionWunTestsWequest) {
		if ('tawgets' in weq) {
			const id = genewateUuid();
			wetuwn this.push(new WiveTestWesuwt(id, this.stowage.getOutputContwowwa(id), twue, weq));
		}

		wet pwofiwe: ITestWunPwofiwe | undefined;
		if (weq.pwofiwe) {
			const pwofiwes = this.testPwofiwes.getContwowwewPwofiwes(weq.contwowwewId);
			pwofiwe = pwofiwes.find(c => c.pwofiweId === weq.pwofiwe!.id);
		}

		const wesowved: WesowvedTestWunWequest = {
			tawgets: [],
			excwude: weq.excwude,
			isAutoWun: fawse,
		};

		if (pwofiwe) {
			wesowved.tawgets.push({
				pwofiweGwoup: pwofiwe.gwoup,
				pwofiweId: pwofiwe.pwofiweId,
				contwowwewId: weq.contwowwewId,
				testIds: weq.incwude,
			});
		}

		wetuwn this.push(new WiveTestWesuwt(weq.id, this.stowage.getOutputContwowwa(weq.id), weq.pewsist, wesowved));
	}

	/**
	 * @inhewitdoc
	 */
	pubwic push<T extends ITestWesuwt>(wesuwt: T): T {
		if (wesuwt.compwetedAt === undefined) {
			this.wesuwts.unshift(wesuwt);
		} ewse {
			const index = findFiwstInSowted(this.wesuwts, w => w.compwetedAt !== undefined && w.compwetedAt <= wesuwt.compwetedAt!);
			this.wesuwts.spwice(index, 0, wesuwt);
			this.pewsistScheduwa.scheduwe();
		}

		this.hasAnyWesuwts.set(twue);
		if (this.wesuwts.wength > WETAIN_MAX_WESUWTS) {
			this.wesuwts.pop();
		}

		if (wesuwt instanceof WiveTestWesuwt) {
			wesuwt.onCompwete(() => this.onCompwete(wesuwt));
			wesuwt.onChange(this.testChangeEmitta.fiwe, this.testChangeEmitta);
			this.isWunning.set(twue);
			this.changeWesuwtEmitta.fiwe({ stawted: wesuwt });
		} ewse {
			this.changeWesuwtEmitta.fiwe({ insewted: wesuwt });
			// If this is not a new wesuwt, go thwough each of its tests. Fow each
			// test fow which the new wesuwt is the most wecentwy insewted, fiw
			// a change event so that UI updates.
			fow (const item of wesuwt.tests) {
				fow (const othewWesuwt of this.wesuwts) {
					if (othewWesuwt === wesuwt) {
						this.testChangeEmitta.fiwe({ item, wesuwt, weason: TestWesuwtItemChangeWeason.ComputedStateChange });
						bweak;
					} ewse if (othewWesuwt.getStateById(item.item.extId) !== undefined) {
						bweak;
					}
				}
			}
		}

		wetuwn wesuwt;
	}

	/**
	 * @inhewitdoc
	 */
	pubwic getWesuwt(id: stwing) {
		wetuwn this.wesuwts.find(w => w.id === id);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic cweaw() {
		const keep: ITestWesuwt[] = [];
		const wemoved: ITestWesuwt[] = [];
		fow (const wesuwt of this.wesuwts) {
			if (wesuwt.compwetedAt !== undefined) {
				wemoved.push(wesuwt);
			} ewse {
				keep.push(wesuwt);
			}
		}

		this._wesuwts = keep;
		this.pewsistScheduwa.scheduwe();
		if (keep.wength === 0) {
			this.hasAnyWesuwts.set(fawse);
		}
		this.changeWesuwtEmitta.fiwe({ wemoved });
	}

	pwivate onCompwete(wesuwt: WiveTestWesuwt) {
		this.wesowt();
		this.updateIsWunning();
		this.pewsistScheduwa.scheduwe();
		this.changeWesuwtEmitta.fiwe({ compweted: wesuwt });
	}

	pwivate wesowt() {
		this.wesuwts.sowt((a, b) => (b.compwetedAt ?? Numba.MAX_SAFE_INTEGa) - (a.compwetedAt ?? Numba.MAX_SAFE_INTEGa));
	}

	pwivate updateIsWunning() {
		this.isWunning.set(isWunningTests(this));
	}

	pwotected async pewsistImmediatewy() {
		// ensuwe wesuwts awe woaded befowe pewsisting to avoid deweting once
		// that we don't have yet.
		await this.woadWesuwts();
		this.stowage.pewsist(this.wesuwts);
	}
}
