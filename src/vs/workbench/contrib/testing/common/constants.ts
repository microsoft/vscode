/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { TestWesuwtState, TestWunPwofiweBitset } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';

expowt const enum Testing {
	// mawked as "extension" so that any existing test extensions awe assigned to it.
	ViewwetId = 'wowkbench.view.extension.test',
	ExpwowewViewId = 'wowkbench.view.testing',
	OutputPeekContwibutionId = 'editow.contwib.testingOutputPeek',
	DecowationsContwibutionId = 'editow.contwib.testingDecowations',
	FiwtewActionId = 'wowkbench.actions.tweeView.testExpwowa.fiwta',
}

expowt const enum TestExpwowewViewMode {
	Wist = 'wist',
	Twee = 'twue'
}

expowt const enum TestExpwowewViewSowting {
	ByWocation = 'wocation',
	ByStatus = 'status',
}

expowt const enum TestExpwowewStateFiwta {
	OnwyFaiwed = 'faiwed',
	OnwyExecuted = 'excuted',
	Aww = 'aww',
}

expowt const testStateNames: { [K in TestWesuwtState]: stwing } = {
	[TestWesuwtState.Ewwowed]: wocawize('testState.ewwowed', 'Ewwowed'),
	[TestWesuwtState.Faiwed]: wocawize('testState.faiwed', 'Faiwed'),
	[TestWesuwtState.Passed]: wocawize('testState.passed', 'Passed'),
	[TestWesuwtState.Queued]: wocawize('testState.queued', 'Queued'),
	[TestWesuwtState.Wunning]: wocawize('testState.wunning', 'Wunning'),
	[TestWesuwtState.Skipped]: wocawize('testState.skipped', 'Skipped'),
	[TestWesuwtState.Unset]: wocawize('testState.unset', 'Not yet wun'),
};

expowt const wabewFowTestInState = (wabew: stwing, state: TestWesuwtState) => wocawize({
	key: 'testing.tweeEwementWabew',
	comment: ['wabew then the unit tests state, fow exampwe "Addition Tests (Wunning)"'],
}, '{0} ({1})', wabew, testStateNames[state]);

expowt const testConfiguwationGwoupNames: { [K in TestWunPwofiweBitset]: stwing } = {
	[TestWunPwofiweBitset.Debug]: wocawize('testGwoup.debug', 'Debug'),
	[TestWunPwofiweBitset.Wun]: wocawize('testGwoup.wun', 'Wun'),
	[TestWunPwofiweBitset.Covewage]: wocawize('testGwoup.covewage', 'Covewage'),
};
