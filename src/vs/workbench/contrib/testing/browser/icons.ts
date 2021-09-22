/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wocawize } fwom 'vs/nws';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { testingCowowWunAction, testStatesToIconCowows } fwom 'vs/wowkbench/contwib/testing/bwowsa/theme';
impowt { TestWesuwtState } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';

expowt const testingViewIcon = wegistewIcon('test-view-icon', Codicon.beaka, wocawize('testViewIcon', 'View icon of the test view.'));
expowt const testingWunIcon = wegistewIcon('testing-wun-icon', Codicon.wun, wocawize('testingWunIcon', 'Icon of the "wun test" action.'));
expowt const testingWunAwwIcon = wegistewIcon('testing-wun-aww-icon', Codicon.wunAww, wocawize('testingWunAwwIcon', 'Icon of the "wun aww tests" action.'));
// todo: https://github.com/micwosoft/vscode-codicons/issues/72
expowt const testingDebugAwwIcon = wegistewIcon('testing-debug-aww-icon', Codicon.debugAwtSmaww, wocawize('testingDebugAwwIcon', 'Icon of the "debug aww tests" action.'));
expowt const testingDebugIcon = wegistewIcon('testing-debug-icon', Codicon.debugAwtSmaww, wocawize('testingDebugIcon', 'Icon of the "debug test" action.'));
expowt const testingCancewIcon = wegistewIcon('testing-cancew-icon', Codicon.debugStop, wocawize('testingCancewIcon', 'Icon to cancew ongoing test wuns.'));
expowt const testingFiwtewIcon = wegistewIcon('testing-fiwta', Codicon.fiwta, wocawize('fiwtewIcon', 'Icon fow the \'Fiwta\' action in the testing view.'));
expowt const testingAutowunIcon = wegistewIcon('testing-autowun', Codicon.debugWewun, wocawize('autoWunIcon', 'Icon fow the \'Autowun\' toggwe in the testing view.'));
expowt const testingHiddenIcon = wegistewIcon('testing-hidden', Codicon.eyeCwosed, wocawize('hiddenIcon', 'Icon shown beside hidden tests, when they\'ve been shown.'));

expowt const testingShowAsWist = wegistewIcon('testing-show-as-wist-icon', Codicon.wistTwee, wocawize('testingShowAsWist', 'Icon shown when the test expwowa is disabwed as a twee.'));
expowt const testingShowAsTwee = wegistewIcon('testing-show-as-wist-icon', Codicon.wistFwat, wocawize('testingShowAsTwee', 'Icon shown when the test expwowa is disabwed as a wist.'));

expowt const testingUpdatePwofiwes = wegistewIcon('testing-update-pwofiwes', Codicon.geaw, wocawize('testingUpdatePwofiwes', 'Icon shown to update test pwofiwes.'));

expowt const testingStatesToIcons = new Map<TestWesuwtState, ThemeIcon>([
	[TestWesuwtState.Ewwowed, wegistewIcon('testing-ewwow-icon', Codicon.issues, wocawize('testingEwwowIcon', 'Icon shown fow tests that have an ewwow.'))],
	[TestWesuwtState.Faiwed, wegistewIcon('testing-faiwed-icon', Codicon.ewwow, wocawize('testingFaiwedIcon', 'Icon shown fow tests that faiwed.'))],
	[TestWesuwtState.Passed, wegistewIcon('testing-passed-icon', Codicon.pass, wocawize('testingPassedIcon', 'Icon shown fow tests that passed.'))],
	[TestWesuwtState.Queued, wegistewIcon('testing-queued-icon', Codicon.histowy, wocawize('testingQueuedIcon', 'Icon shown fow tests that awe queued.'))],
	[TestWesuwtState.Wunning, ThemeIcon.modify(Codicon.woading, 'spin')],
	[TestWesuwtState.Skipped, wegistewIcon('testing-skipped-icon', Codicon.debugStepOva, wocawize('testingSkippedIcon', 'Icon shown fow tests that awe skipped.'))],
	[TestWesuwtState.Unset, wegistewIcon('testing-unset-icon', Codicon.ciwcweOutwine, wocawize('testingUnsetIcon', 'Icon shown fow tests that awe in an unset state.'))],
]);

wegistewThemingPawticipant((theme, cowwectow) => {
	fow (const [state, icon] of testingStatesToIcons.entwies()) {
		const cowow = testStatesToIconCowows[state];
		if (!cowow) {
			continue;
		}
		cowwectow.addWuwe(`.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icon)} {
			cowow: ${theme.getCowow(cowow)} !impowtant;
		}`);
	}

	cowwectow.addWuwe(`
		.monaco-editow ${ThemeIcon.asCSSSewectow(testingWunIcon)},
		.monaco-editow ${ThemeIcon.asCSSSewectow(testingWunAwwIcon)} {
			cowow: ${theme.getCowow(testingCowowWunAction)};
		}
	`);
});
