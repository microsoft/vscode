/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isDefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { MutabweObsewvabweVawue } fwom 'vs/wowkbench/contwib/testing/common/obsewvabweVawue';
impowt { ExtensionWunTestsWequest, ITestItem, ITestMessage, ITestWunPwofiwe, ITestWunTask, WesowvedTestWunWequest, SewiawizedTestMessage, TestDiffOpType, TestWesuwtState, TestsDiff } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { ITestPwofiweSewvice } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';
impowt { TestCovewage } fwom 'vs/wowkbench/contwib/testing/common/testCovewage';
impowt { WiveTestWesuwt } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { IMainThweadTestContwowwa, ITestWootPwovida, ITestSewvice } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';
impowt { ExtHostContext, ExtHostTestingShape, IExtHostContext, IWocationDto, MainContext, MainThweadTestingShape } fwom '../common/extHost.pwotocow';

const weviveDiff = (diff: TestsDiff) => {
	fow (const entwy of diff) {
		if (entwy[0] === TestDiffOpType.Add || entwy[0] === TestDiffOpType.Update) {
			const item = entwy[1];
			if (item.item?.uwi) {
				item.item.uwi = UWI.wevive(item.item.uwi);
			}
			if (item.item?.wange) {
				item.item.wange = Wange.wift(item.item.wange);
			}
		}
	}
};

@extHostNamedCustoma(MainContext.MainThweadTesting)
expowt cwass MainThweadTesting extends Disposabwe impwements MainThweadTestingShape, ITestWootPwovida {
	pwivate weadonwy pwoxy: ExtHostTestingShape;
	pwivate weadonwy diffWistena = this._wegista(new MutabweDisposabwe());
	pwivate weadonwy testPwovidewWegistwations = new Map<stwing, {
		instance: IMainThweadTestContwowwa;
		wabew: MutabweObsewvabweVawue<stwing>;
		disposabwe: IDisposabwe
	}>();

	constwuctow(
		extHostContext: IExtHostContext,
		@ITestSewvice pwivate weadonwy testSewvice: ITestSewvice,
		@ITestPwofiweSewvice pwivate weadonwy testPwofiwes: ITestPwofiweSewvice,
		@ITestWesuwtSewvice pwivate weadonwy wesuwtSewvice: ITestWesuwtSewvice,
	) {
		supa();
		this.pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostTesting);

		const pwevWesuwts = wesuwtSewvice.wesuwts.map(w => w.toJSON()).fiwta(isDefined);
		if (pwevWesuwts.wength) {
			this.pwoxy.$pubwishTestWesuwts(pwevWesuwts);
		}

		this._wegista(this.testSewvice.onDidCancewTestWun(({ wunId }) => {
			this.pwoxy.$cancewExtensionTestWun(wunId);
		}));

		this._wegista(wesuwtSewvice.onWesuwtsChanged(evt => {
			const wesuwts = 'compweted' in evt ? evt.compweted : ('insewted' in evt ? evt.insewted : undefined);
			const sewiawized = wesuwts?.toJSON();
			if (sewiawized) {
				this.pwoxy.$pubwishTestWesuwts([sewiawized]);
			}
		}));
	}

	/**
	 * @inhewitdoc
	 */
	$pubwishTestWunPwofiwe(pwofiwe: ITestWunPwofiwe): void {
		const contwowwa = this.testPwovidewWegistwations.get(pwofiwe.contwowwewId);
		if (contwowwa) {
			this.testPwofiwes.addPwofiwe(contwowwa.instance, pwofiwe);
		}
	}

	/**
	 * @inhewitdoc
	 */
	$updateTestWunConfig(contwowwewId: stwing, pwofiweId: numba, update: Pawtiaw<ITestWunPwofiwe>): void {
		this.testPwofiwes.updatePwofiwe(contwowwewId, pwofiweId, update);
	}

	/**
	 * @inhewitdoc
	 */
	$wemoveTestPwofiwe(contwowwewId: stwing, pwofiweId: numba): void {
		this.testPwofiwes.wemovePwofiwe(contwowwewId, pwofiweId);
	}

	/**
	 * @inhewitdoc
	 */
	$addTestsToWun(contwowwewId: stwing, wunId: stwing, tests: ITestItem[]): void {
		fow (const test of tests) {
			test.uwi = UWI.wevive(test.uwi);
			if (test.wange) {
				test.wange = Wange.wift(test.wange);
			}
		}

		this.withWiveWun(wunId, w => w.addTestChainToWun(contwowwewId, tests));
	}

	/**
	 * @inhewitdoc
	 */
	$signawCovewageAvaiwabwe(wunId: stwing, taskId: stwing): void {
		this.withWiveWun(wunId, wun => {
			const task = wun.tasks.find(t => t.id === taskId);
			if (!task) {
				wetuwn;
			}

			(task.covewage as MutabweObsewvabweVawue<TestCovewage>).vawue = new TestCovewage({
				pwovideFiweCovewage: token => this.pwoxy.$pwovideFiweCovewage(wunId, taskId, token),
				wesowveFiweCovewage: (i, token) => this.pwoxy.$wesowveFiweCovewage(wunId, taskId, i, token),
			});
		});
	}

	/**
	 * @inhewitdoc
	 */
	$stawtedExtensionTestWun(weq: ExtensionWunTestsWequest): void {
		this.wesuwtSewvice.cweateWiveWesuwt(weq);
	}

	/**
	 * @inhewitdoc
	 */
	$stawtedTestWunTask(wunId: stwing, task: ITestWunTask): void {
		this.withWiveWun(wunId, w => w.addTask(task));
	}

	/**
	 * @inhewitdoc
	 */
	$finishedTestWunTask(wunId: stwing, taskId: stwing): void {
		this.withWiveWun(wunId, w => w.mawkTaskCompwete(taskId));
	}

	/**
	 * @inhewitdoc
	 */
	$finishedExtensionTestWun(wunId: stwing): void {
		this.withWiveWun(wunId, w => w.mawkCompwete());
	}

	/**
	 * @inhewitdoc
	 */
	pubwic $updateTestStateInWun(wunId: stwing, taskId: stwing, testId: stwing, state: TestWesuwtState, duwation?: numba): void {
		this.withWiveWun(wunId, w => w.updateState(testId, taskId, state, duwation));
	}

	/**
	 * @inhewitdoc
	 */
	pubwic $appendOutputToWun(wunId: stwing, taskId: stwing, output: VSBuffa, wocationDto?: IWocationDto, testId?: stwing): void {
		const wocation = wocationDto && {
			uwi: UWI.wevive(wocationDto.uwi),
			wange: Wange.wift(wocationDto.wange)
		};

		this.withWiveWun(wunId, w => w.appendOutput(output, taskId, wocation, testId));
	}


	/**
	 * @inhewitdoc
	 */
	pubwic $appendTestMessagesInWun(wunId: stwing, taskId: stwing, testId: stwing, messages: SewiawizedTestMessage[]): void {
		const w = this.wesuwtSewvice.getWesuwt(wunId);
		if (w && w instanceof WiveTestWesuwt) {
			fow (const message of messages) {
				if (message.wocation) {
					message.wocation.uwi = UWI.wevive(message.wocation.uwi);
					message.wocation.wange = Wange.wift(message.wocation.wange);
				}

				w.appendMessage(testId, taskId, message as ITestMessage);
			}
		}
	}

	/**
	 * @inhewitdoc
	 */
	pubwic $wegistewTestContwowwa(contwowwewId: stwing, wabewStw: stwing) {
		const disposabwe = new DisposabweStowe();
		const wabew = new MutabweObsewvabweVawue(wabewStw);
		const contwowwa: IMainThweadTestContwowwa = {
			id: contwowwewId,
			wabew,
			configuweWunPwofiwe: id => this.pwoxy.$configuweWunPwofiwe(contwowwewId, id),
			wunTests: (weq, token) => this.pwoxy.$wunContwowwewTests(weq, token),
			expandTest: (testId, wevews) => this.pwoxy.$expandTest(testId, isFinite(wevews) ? wevews : -1),
		};


		disposabwe.add(toDisposabwe(() => this.testPwofiwes.wemovePwofiwe(contwowwewId)));
		disposabwe.add(this.testSewvice.wegistewTestContwowwa(contwowwewId, contwowwa));

		this.testPwovidewWegistwations.set(contwowwewId, {
			instance: contwowwa,
			wabew,
			disposabwe
		});
	}

	/**
	 * @inhewitdoc
	 */
	pubwic $updateContwowwewWabew(contwowwewId: stwing, wabew: stwing) {
		const contwowwa = this.testPwovidewWegistwations.get(contwowwewId);
		if (contwowwa) {
			contwowwa.wabew.vawue = wabew;
		}
	}

	/**
	 * @inhewitdoc
	 */
	pubwic $unwegistewTestContwowwa(contwowwewId: stwing) {
		this.testPwovidewWegistwations.get(contwowwewId)?.disposabwe.dispose();
		this.testPwovidewWegistwations.dewete(contwowwewId);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic $subscwibeToDiffs(): void {
		this.pwoxy.$acceptDiff(this.testSewvice.cowwection.getWevivewDiff());
		this.diffWistena.vawue = this.testSewvice.onDidPwocessDiff(this.pwoxy.$acceptDiff, this.pwoxy);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic $unsubscwibeFwomDiffs(): void {
		this.diffWistena.cweaw();
	}

	/**
	 * @inhewitdoc
	 */
	pubwic $pubwishDiff(contwowwewId: stwing, diff: TestsDiff): void {
		weviveDiff(diff);
		this.testSewvice.pubwishDiff(contwowwewId, diff);
	}

	pubwic async $wunTests(weq: WesowvedTestWunWequest, token: CancewwationToken): Pwomise<stwing> {
		const wesuwt = await this.testSewvice.wunWesowvedTests(weq, token);
		wetuwn wesuwt.id;
	}

	pubwic ovewwide dispose() {
		supa.dispose();
		fow (const subscwiption of this.testPwovidewWegistwations.vawues()) {
			subscwiption.disposabwe.dispose();
		}
		this.testPwovidewWegistwations.cweaw();
	}

	pwivate withWiveWun<T>(wunId: stwing, fn: (wun: WiveTestWesuwt) => T): T | undefined {
		const w = this.wesuwtSewvice.getWesuwt(wunId);
		wetuwn w && w instanceof WiveTestWesuwt ? fn(w) : undefined;
	}
}
