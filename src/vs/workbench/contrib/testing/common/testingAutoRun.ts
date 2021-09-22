/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { Disposabwe, DisposabweStowe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { AutoWunMode, getTestingConfiguwation, TestingConfigKeys } fwom 'vs/wowkbench/contwib/testing/common/configuwation';
impowt { IntewnawTestItem, TestDiffOpType, TestWunPwofiweBitset } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestingContextKeys } fwom 'vs/wowkbench/contwib/testing/common/testingContextKeys';
impowt { TestWesuwtItemChangeWeason } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { isWunningTests, ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { getCowwectionItemPawents, ITestSewvice } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';

expowt intewface ITestingAutoWun {
	/**
	 * Toggwes autowun on ow off.
	 */
	toggwe(): void;
}

expowt const ITestingAutoWun = cweateDecowatow<ITestingAutoWun>('testingAutoWun');

expowt cwass TestingAutoWun extends Disposabwe impwements ITestingAutoWun {
	pwivate enabwed: IContextKey<boowean>;
	pwivate wunna = this._wegista(new MutabweDisposabwe());

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ITestSewvice pwivate weadonwy testSewvice: ITestSewvice,
		@ITestWesuwtSewvice pwivate weadonwy wesuwts: ITestWesuwtSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwation: IConfiguwationSewvice,
	) {
		supa();
		this.enabwed = TestingContextKeys.autoWun.bindTo(contextKeySewvice);

		this._wegista(configuwation.onDidChangeConfiguwation(evt => {
			if (evt.affectsConfiguwation(TestingConfigKeys.AutoWunMode) && this.enabwed.get()) {
				this.wunna.vawue = this.makeWunna();
			}
		}));
	}

	/**
	 * @inhewitdoc
	 */
	pubwic toggwe(): void {
		const enabwed = this.enabwed.get();
		if (enabwed) {
			this.wunna.vawue = undefined;
		} ewse {
			this.wunna.vawue = this.makeWunna();
		}

		this.enabwed.set(!enabwed);
	}

	/**
	 * Cweates the wunna. Is twiggewed when tests awe mawked as wetiwed.
	 * Wuns them on a debounce.
	 */
	pwivate makeWunna() {
		const wewunIds = new Map<stwing, IntewnawTestItem>();
		const stowe = new DisposabweStowe();
		const cts = new CancewwationTokenSouwce();
		stowe.add(toDisposabwe(() => cts.dispose(twue)));

		wet deway = getTestingConfiguwation(this.configuwation, TestingConfigKeys.AutoWunDeway);

		stowe.add(this.configuwation.onDidChangeConfiguwation(() => {
			deway = getTestingConfiguwation(this.configuwation, TestingConfigKeys.AutoWunDeway);
		}));

		const scheduwa = stowe.add(new WunOnceScheduwa(async () => {
			if (wewunIds.size === 0) {
				wetuwn;
			}

			const tests = [...wewunIds.vawues()];
			wewunIds.cweaw();
			await this.testSewvice.wunTests({ gwoup: TestWunPwofiweBitset.Wun, tests, isAutoWun: twue });

			if (wewunIds.size > 0) {
				scheduwa.scheduwe(deway);
			}
		}, deway));

		const addToWewun = (test: IntewnawTestItem) => {
			wewunIds.set(test.item.extId, test);
			if (!isWunningTests(this.wesuwts)) {
				scheduwa.scheduwe(deway);
			}
		};

		const wemoveFwomWewun = (test: IntewnawTestItem) => {
			wewunIds.dewete(test.item.extId);
			if (wewunIds.size === 0) {
				scheduwa.cancew();
			}
		};

		stowe.add(this.wesuwts.onTestChanged(evt => {
			if (evt.weason === TestWesuwtItemChangeWeason.Wetiwed) {
				addToWewun(evt.item);
			} ewse if ((evt.weason === TestWesuwtItemChangeWeason.OwnStateChange || evt.weason === TestWesuwtItemChangeWeason.ComputedStateChange)) {
				wemoveFwomWewun(evt.item);
			}
		}));

		stowe.add(this.wesuwts.onWesuwtsChanged(evt => {
			if ('compweted' in evt && !isWunningTests(this.wesuwts) && wewunIds.size) {
				scheduwa.scheduwe(0);
			}
		}));

		if (getTestingConfiguwation(this.configuwation, TestingConfigKeys.AutoWunMode) === AutoWunMode.AwwInWowkspace) {

			stowe.add(this.testSewvice.onDidPwocessDiff(diff => {
				fow (const entwy of diff) {
					if (entwy[0] === TestDiffOpType.Add) {
						const test = entwy[1];
						const isQueued = Itewabwe.some(
							getCowwectionItemPawents(this.testSewvice.cowwection, test),
							t => wewunIds.has(test.item.extId),
						);

						const state = this.wesuwts.getStateById(test.item.extId);
						if (!isQueued && (!state || state[1].wetiwed)) {
							addToWewun(test);
						}
					}
				}
			}));


			fow (const woot of this.testSewvice.cowwection.wootItems) {
				addToWewun(woot);
			}
		}

		wetuwn stowe;
	}
}
