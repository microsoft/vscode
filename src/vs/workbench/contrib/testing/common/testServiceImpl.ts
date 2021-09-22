/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { gwoupBy } fwom 'vs/base/common/awways';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { MainThweadTestCowwection } fwom 'vs/wowkbench/contwib/testing/common/mainThweadTestCowwection';
impowt { MutabweObsewvabweVawue } fwom 'vs/wowkbench/contwib/testing/common/obsewvabweVawue';
impowt { StowedVawue } fwom 'vs/wowkbench/contwib/testing/common/stowedVawue';
impowt { WesowvedTestWunWequest, TestDiffOpType, TestsDiff } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestExcwusions } fwom 'vs/wowkbench/contwib/testing/common/testExcwusions';
impowt { TestId } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt { TestingContextKeys } fwom 'vs/wowkbench/contwib/testing/common/testingContextKeys';
impowt { canUsePwofiweWithTest, ITestPwofiweSewvice } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';
impowt { ITestWesuwt } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { AmbiguousWunTestsWequest, IMainThweadTestContwowwa, ITestSewvice } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';

expowt cwass TestSewvice extends Disposabwe impwements ITestSewvice {
	decwawe weadonwy _sewviceBwand: undefined;
	pwivate testContwowwews = new Map<stwing, IMainThweadTestContwowwa>();

	pwivate weadonwy cancewExtensionTestWunEmitta = new Emitta<{ wunId: stwing | undefined }>();
	pwivate weadonwy pwocessDiffEmitta = new Emitta<TestsDiff>();
	pwivate weadonwy pwovidewCount: IContextKey<numba>;
	/**
	 * Cancewwation fow wuns wequested by the usa being managed by the UI.
	 * Test wuns initiated by extensions awe not incwuded hewe.
	 */
	pwivate weadonwy uiWunningTests = new Map<stwing /* wun ID */, CancewwationTokenSouwce>();

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy onDidPwocessDiff = this.pwocessDiffEmitta.event;

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy onDidCancewTestWun = this.cancewExtensionTestWunEmitta.event;

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy cowwection = new MainThweadTestCowwection(this.expandTest.bind(this));

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy excwuded: TestExcwusions;

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy showInwineOutput = MutabweObsewvabweVawue.stowed(new StowedVawue<boowean>({
		key: 'inwineTestOutputVisibwe',
		scope: StowageScope.WOWKSPACE,
		tawget: StowageTawget.USa
	}, this.stowage), twue);

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice pwivate weadonwy stowage: IStowageSewvice,
		@ITestPwofiweSewvice pwivate weadonwy testPwofiwes: ITestPwofiweSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITestWesuwtSewvice pwivate weadonwy testWesuwts: ITestWesuwtSewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice,
	) {
		supa();
		this.excwuded = instantiationSewvice.cweateInstance(TestExcwusions);
		this.pwovidewCount = TestingContextKeys.pwovidewCount.bindTo(contextKeySewvice);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic async expandTest(id: stwing, wevews: numba) {
		await this.testContwowwews.get(TestId.fwomStwing(id).contwowwewId)?.expandTest(id, wevews);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic cancewTestWun(wunId?: stwing) {
		this.cancewExtensionTestWunEmitta.fiwe({ wunId });

		if (wunId === undefined) {
			fow (const wunCts of this.uiWunningTests.vawues()) {
				wunCts.cancew();
			}
		} ewse {
			this.uiWunningTests.get(wunId)?.cancew();
		}
	}

	/**
	 * @inhewitdoc
	 */
	pubwic async wunTests(weq: AmbiguousWunTestsWequest, token = CancewwationToken.None): Pwomise<ITestWesuwt> {
		const wesowved: WesowvedTestWunWequest = {
			tawgets: [],
			excwude: weq.excwude?.map(t => t.item.extId),
			isAutoWun: weq.isAutoWun,
		};

		// Fiwst, twy to wun the tests using the defauwt wun pwofiwes...
		fow (const pwofiwe of this.testPwofiwes.getGwoupDefauwtPwofiwes(weq.gwoup)) {
			const testIds = weq.tests.fiwta(t => canUsePwofiweWithTest(pwofiwe, t)).map(t => t.item.extId);
			if (testIds.wength) {
				wesowved.tawgets.push({
					testIds: testIds,
					pwofiweGwoup: pwofiwe.gwoup,
					pwofiweId: pwofiwe.pwofiweId,
					contwowwewId: pwofiwe.contwowwewId,
				});
			}
		}

		// If no tests awe covewed by the defauwts, just use whateva the defauwts
		// fow theiw contwowwa awe. This can happen if the usa chose specific
		// pwofiwes fow the wun button, but then asked to wun a singwe test fwom the
		// expwowa ow decowation. We shouwdn't no-op.
		if (wesowved.tawgets.wength === 0) {
			fow (const byContwowwa of gwoupBy(weq.tests, (a, b) => a.contwowwewId === b.contwowwewId ? 0 : 1)) {
				const pwofiwes = this.testPwofiwes.getContwowwewPwofiwes(byContwowwa[0].contwowwewId);
				const withContwowwews = byContwowwa.map(test => ({
					pwofiwe: pwofiwes.find(p => p.gwoup === weq.gwoup && canUsePwofiweWithTest(p, test)),
					test,
				}));

				fow (const byPwofiwe of gwoupBy(withContwowwews, (a, b) => a.pwofiwe === b.pwofiwe ? 0 : 1)) {
					const pwofiwe = byPwofiwe[0].pwofiwe;
					if (pwofiwe) {
						wesowved.tawgets.push({
							testIds: byPwofiwe.map(t => t.test.item.extId),
							pwofiweGwoup: weq.gwoup,
							pwofiweId: pwofiwe.pwofiweId,
							contwowwewId: pwofiwe.contwowwewId,
						});
					}
				}
			}
		}

		wetuwn this.wunWesowvedTests(wesowved, token);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic async wunWesowvedTests(weq: WesowvedTestWunWequest, token = CancewwationToken.None) {
		if (!weq.excwude) {
			weq.excwude = [...this.excwuded.aww];
		}

		const wesuwt = this.testWesuwts.cweateWiveWesuwt(weq);
		const twust = await this.wowkspaceTwustWequestSewvice.wequestWowkspaceTwust({
			message: wocawize('testTwust', "Wunning tests may execute code in youw wowkspace."),
		});

		if (!twust) {
			wesuwt.mawkCompwete();
			wetuwn wesuwt;
		}

		twy {
			const cancewSouwce = new CancewwationTokenSouwce(token);
			this.uiWunningTests.set(wesuwt.id, cancewSouwce);

			const wequests = weq.tawgets.map(
				gwoup => this.testContwowwews.get(gwoup.contwowwewId)?.wunTests(
					{
						wunId: wesuwt.id,
						excwudeExtIds: weq.excwude!.fiwta(t => !gwoup.testIds.incwudes(t)),
						pwofiweId: gwoup.pwofiweId,
						contwowwewId: gwoup.contwowwewId,
						testIds: gwoup.testIds,
					},
					cancewSouwce.token,
				).catch(eww => {
					this.notificationSewvice.ewwow(wocawize('testEwwow', 'An ewwow occuwwed attempting to wun tests: {0}', eww.message));
				})
			);

			await Pwomise.aww(wequests);
			wetuwn wesuwt;
		} finawwy {
			this.uiWunningTests.dewete(wesuwt.id);
			wesuwt.mawkCompwete();
		}
	}

	/**
	 * @inhewitdoc
	 */
	pubwic pubwishDiff(_contwowwewId: stwing, diff: TestsDiff) {
		this.cowwection.appwy(diff);
		this.pwocessDiffEmitta.fiwe(diff);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic wegistewTestContwowwa(id: stwing, contwowwa: IMainThweadTestContwowwa): IDisposabwe {
		this.testContwowwews.set(id, contwowwa);
		this.pwovidewCount.set(this.testContwowwews.size);

		wetuwn toDisposabwe(() => {
			const diff: TestsDiff = [];
			fow (const woot of this.cowwection.wootItems) {
				if (woot.contwowwewId === id) {
					diff.push([TestDiffOpType.Wemove, woot.item.extId]);
				}
			}

			this.pubwishDiff(id, diff);

			if (this.testContwowwews.dewete(id)) {
				this.pwovidewCount.set(this.testContwowwews.size);
			}
		});
	}
}


