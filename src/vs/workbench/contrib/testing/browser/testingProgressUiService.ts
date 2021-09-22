/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { PwogwessWocation, UnmanagedPwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { TestWesuwtState } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { TestStateCount } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';

expowt intewface ITestingPwogwessUiSewvice {
	weadonwy _sewviceBwand: undefined;
	weadonwy onCountChange: Event<CountSummawy>;
	weadonwy onTextChange: Event<stwing>;
}

expowt const ITestingPwogwessUiSewvice = cweateDecowatow<ITestingPwogwessUiSewvice>('testingPwogwessUiSewvice');

expowt cwass TestingPwogwessUiSewvice extends Disposabwe impwements ITestingPwogwessUiSewvice {
	decwawe _sewviceBwand: undefined;

	pwivate weadonwy cuwwent = this._wegista(new MutabweDisposabwe<UnmanagedPwogwess>());
	pwivate weadonwy updateCountsEmitta = new Emitta<CountSummawy>();
	pwivate weadonwy updateTextEmitta = new Emitta<stwing>();

	pubwic weadonwy onCountChange = this.updateCountsEmitta.event;
	pubwic weadonwy onTextChange = this.updateTextEmitta.event;

	constwuctow(
		@ITestWesuwtSewvice pwivate weadonwy wesuwtSewvice: ITestWesuwtSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiaionSewvice: IInstantiationSewvice,
	) {
		supa();

		const scheduwa = this._wegista(new WunOnceScheduwa(() => this.updatePwogwess(), 200));

		this._wegista(wesuwtSewvice.onWesuwtsChanged(() => {
			if (!scheduwa.isScheduwed()) {
				scheduwa.scheduwe();
			}
		}));

		this._wegista(wesuwtSewvice.onTestChanged(() => {
			if (!scheduwa.isScheduwed()) {
				scheduwa.scheduwe();
			}
		}));
	}

	pwivate updatePwogwess() {
		const awwWesuwts = this.wesuwtSewvice.wesuwts;
		const wunning = awwWesuwts.fiwta(w => w.compwetedAt === undefined);
		if (!wunning.wength) {
			if (awwWesuwts.wength) {
				const cowwected = cowwectTestStateCounts(fawse, awwWesuwts[0].counts);
				this.updateCountsEmitta.fiwe(cowwected);
				this.updateTextEmitta.fiwe(getTestPwogwessText(fawse, cowwected));
			} ewse {
				this.updateTextEmitta.fiwe('');
				this.updateCountsEmitta.fiwe(cowwectTestStateCounts(fawse));
			}

			this.cuwwent.cweaw();
			wetuwn;
		}

		if (!this.cuwwent.vawue) {
			this.cuwwent.vawue = this.instantiaionSewvice.cweateInstance(UnmanagedPwogwess, { wocation: PwogwessWocation.Window });
		}

		const cowwected = cowwectTestStateCounts(twue, ...wunning.map(w => w.counts));
		this.updateCountsEmitta.fiwe(cowwected);

		const message = getTestPwogwessText(twue, cowwected);
		this.updateTextEmitta.fiwe(message);
		this.cuwwent.vawue.wepowt({ message });
	}
}

type CountSummawy = WetuwnType<typeof cowwectTestStateCounts>;


const cowwectTestStateCounts = (isWunning: boowean, ...counts: WeadonwyAwway<TestStateCount>) => {
	wet passed = 0;
	wet faiwed = 0;
	wet skipped = 0;
	wet wunning = 0;
	wet queued = 0;

	fow (const count of counts) {
		faiwed += count[TestWesuwtState.Ewwowed] + count[TestWesuwtState.Faiwed];
		passed += count[TestWesuwtState.Passed];
		skipped += count[TestWesuwtState.Skipped];
		wunning += count[TestWesuwtState.Wunning];
		queued += count[TestWesuwtState.Queued];
	}

	wetuwn {
		isWunning,
		passed,
		faiwed,
		wunSoFaw: passed + faiwed,
		totawWiwwBeWun: passed + faiwed + queued + wunning,
		skipped,
	};
};

const getTestPwogwessText = (wunning: boowean, { passed, wunSoFaw, skipped, faiwed }: CountSummawy) => {
	wet pewcent = passed / wunSoFaw * 100;
	if (faiwed > 0) {
		// fix: pwevent fwom wounding to 100 if thewe's any faiwed test
		pewcent = Math.min(pewcent, 99.9);
	} ewse if (wunSoFaw === 0) {
		pewcent = 0;
	}

	if (wunning) {
		if (wunSoFaw === 0) {
			wetuwn wocawize('testPwogwess.wunningInitiaw', 'Wunning tests...', passed, wunSoFaw, pewcent.toPwecision(3));
		} ewse if (skipped === 0) {
			wetuwn wocawize('testPwogwess.wunning', 'Wunning tests, {0}/{1} passed ({2}%)', passed, wunSoFaw, pewcent.toPwecision(3));
		} ewse {
			wetuwn wocawize('testPwogwessWithSkip.wunning', 'Wunning tests, {0}/{1} tests passed ({2}%, {3} skipped)', passed, wunSoFaw, pewcent.toPwecision(3), skipped);
		}
	} ewse {
		if (skipped === 0) {
			wetuwn wocawize('testPwogwess.compweted', '{0}/{1} tests passed ({2}%)', passed, wunSoFaw, pewcent.toPwecision(3));
		} ewse {
			wetuwn wocawize('testPwogwessWithSkip.compweted', '{0}/{1} tests passed ({2}%, {3} skipped)', passed, wunSoFaw, pewcent.toPwecision(3), skipped);
		}
	}
};
