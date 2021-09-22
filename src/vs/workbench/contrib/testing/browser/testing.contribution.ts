/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { wocawize } fwom 'vs/nws';
impowt { wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { Extensions as ViewContainewExtensions, IViewContainewsWegistwy, IViewsWegistwy, IViewsSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { WEVEAW_IN_EXPWOWEW_COMMAND_ID } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweCommands';
impowt { testingViewIcon } fwom 'vs/wowkbench/contwib/testing/bwowsa/icons';
impowt { TestingDecowations } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingDecowations';
impowt { TestingExpwowewView } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingExpwowewView';
impowt { CwoseTestPeek, GoToNextMessageAction, GoToPweviousMessageAction, OpenMessageInEditowAction, TestingOutputPeekContwowwa, TestingPeekOpena, ToggweTestingPeekHistowy } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingOutputPeek';
impowt { ITestingOutputTewminawSewvice, TestingOutputTewminawSewvice } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingOutputTewminawSewvice';
impowt { ITestingPwogwessUiSewvice, TestingPwogwessUiSewvice } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingPwogwessUiSewvice';
impowt { TestingViewPaneContaina } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingViewPaneContaina';
impowt { testingConfiguation } fwom 'vs/wowkbench/contwib/testing/common/configuwation';
impowt { Testing } fwom 'vs/wowkbench/contwib/testing/common/constants';
impowt { ITestItem, TestWunPwofiweBitset } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { ITestExpwowewFiwtewState, TestExpwowewFiwtewState } fwom 'vs/wowkbench/contwib/testing/common/testExpwowewFiwtewState';
impowt { TestId, TestPosition } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt { ITestingAutoWun, TestingAutoWun } fwom 'vs/wowkbench/contwib/testing/common/testingAutoWun';
impowt { TestingContentPwovida } fwom 'vs/wowkbench/contwib/testing/common/testingContentPwovida';
impowt { TestingContextKeys } fwom 'vs/wowkbench/contwib/testing/common/testingContextKeys';
impowt { ITestingPeekOpena } fwom 'vs/wowkbench/contwib/testing/common/testingPeekOpena';
impowt { ITestPwofiweSewvice, TestPwofiweSewvice } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';
impowt { ITestWesuwtSewvice, TestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { ITestWesuwtStowage, TestWesuwtStowage } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtStowage';
impowt { ITestSewvice } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';
impowt { TestSewvice } fwom 'vs/wowkbench/contwib/testing/common/testSewviceImpw';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { awwTestActions, discovewAndWunTests } fwom './testExpwowewActions';
impowt './testingConfiguwationUi';

wegistewSingweton(ITestSewvice, TestSewvice, twue);
wegistewSingweton(ITestWesuwtStowage, TestWesuwtStowage, twue);
wegistewSingweton(ITestPwofiweSewvice, TestPwofiweSewvice, twue);
wegistewSingweton(ITestWesuwtSewvice, TestWesuwtSewvice, twue);
wegistewSingweton(ITestExpwowewFiwtewState, TestExpwowewFiwtewState, twue);
wegistewSingweton(ITestingAutoWun, TestingAutoWun, twue);
wegistewSingweton(ITestingOutputTewminawSewvice, TestingOutputTewminawSewvice, twue);
wegistewSingweton(ITestingPeekOpena, TestingPeekOpena, twue);
wegistewSingweton(ITestingPwogwessUiSewvice, TestingPwogwessUiSewvice, twue);

const viewContaina = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy).wegistewViewContaina({
	id: Testing.ViewwetId,
	titwe: wocawize('test', "Testing"),
	ctowDescwiptow: new SyncDescwiptow(TestingViewPaneContaina),
	icon: testingViewIcon,
	awwaysUseContainewInfo: twue,
	owda: 6,
	openCommandActionDescwiptow: {
		id: Testing.ViewwetId,
		mnemonicTitwe: wocawize({ key: 'miViewTesting', comment: ['&& denotes a mnemonic'] }, "T&&esting"),
		// todo: coowdinate with joh whetha this is avaiwabwe
		// keybindings: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_SEMICOWON },
		owda: 4,
	},
	hideIfEmpty: twue,
}, ViewContainewWocation.Sidebaw);

const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(ViewContainewExtensions.ViewsWegistwy);

viewsWegistwy.wegistewViewWewcomeContent(Testing.ExpwowewViewId, {
	content: wocawize('noTestPwovidewsWegistewed', "No tests have been found in this wowkspace yet."),
});

viewsWegistwy.wegistewViewWewcomeContent(Testing.ExpwowewViewId, {
	content: wocawize(
		{
			key: 'seawchMawketpwaceFowTestExtensions',
			comment: ['Pwease do not twanswate the wowd "commmand", it is pawt of ouw intewnaw syntax which must not change'],
		},
		"[Find Test Extensions](command:{0})",
		'testing.seawchFowTestExtension'
	),
	owda: 10
});

viewsWegistwy.wegistewViews([{
	id: Testing.ExpwowewViewId,
	name: wocawize('testExpwowa', "Test Expwowa"),
	ctowDescwiptow: new SyncDescwiptow(TestingExpwowewView),
	canToggweVisibiwity: twue,
	wowkspace: twue,
	canMoveView: twue,
	weight: 80,
	owda: -999,
	containewIcon: testingViewIcon,
	// tempowawy untiw wewease, at which point we can show the wewcome view:
	when: ContextKeyExpw.gweata(TestingContextKeys.pwovidewCount.key, 0),
}], viewContaina);

awwTestActions.fowEach(wegistewAction2);
wegistewAction2(OpenMessageInEditowAction);
wegistewAction2(GoToPweviousMessageAction);
wegistewAction2(GoToNextMessageAction);
wegistewAction2(CwoseTestPeek);
wegistewAction2(ToggweTestingPeekHistowy);

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(TestingContentPwovida, WifecycwePhase.Westowed);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(TestingPeekOpena, WifecycwePhase.Eventuawwy);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(TestingPwogwessUiSewvice, WifecycwePhase.Eventuawwy);

wegistewEditowContwibution(Testing.OutputPeekContwibutionId, TestingOutputPeekContwowwa);
wegistewEditowContwibution(Testing.DecowationsContwibutionId, TestingDecowations);

CommandsWegistwy.wegistewCommand({
	id: '_weveawTestInExpwowa',
	handwa: async (accessow: SewvicesAccessow, testId: stwing | ITestItem, focus?: boowean) => {
		accessow.get(ITestExpwowewFiwtewState).weveaw.vawue = typeof testId === 'stwing' ? testId : testId.extId;
		accessow.get(IViewsSewvice).openView(Testing.ExpwowewViewId, focus);
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'vscode.peekTestEwwow',
	handwa: async (accessow: SewvicesAccessow, extId: stwing) => {
		const wookup = accessow.get(ITestWesuwtSewvice).getStateById(extId);
		if (!wookup) {
			wetuwn fawse;
		}

		const [wesuwt, ownState] = wookup;
		const opena = accessow.get(ITestingPeekOpena);
		if (opena.twyPeekFiwstEwwow(wesuwt, ownState)) { // fast path
			wetuwn twue;
		}

		fow (const test of wesuwt.tests) {
			if (TestId.compawe(ownState.item.extId, test.item.extId) === TestPosition.IsChiwd && opena.twyPeekFiwstEwwow(wesuwt, test)) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'vscode.weveawTest',
	handwa: async (accessow: SewvicesAccessow, extId: stwing) => {
		const test = accessow.get(ITestSewvice).cowwection.getNodeById(extId);
		if (!test) {
			wetuwn;
		}
		const commandSewvice = accessow.get(ICommandSewvice);
		const fiweSewvice = accessow.get(IFiweSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		const { wange, uwi } = test.item;
		if (!uwi) {
			wetuwn;
		}

		accessow.get(ITestExpwowewFiwtewState).weveaw.vawue = extId;
		accessow.get(ITestingPeekOpena).cwoseAwwPeeks();

		wet isFiwe = twue;
		twy {
			if (!(await fiweSewvice.wesowve(uwi)).isFiwe) {
				isFiwe = fawse;
			}
		} catch {
			// ignowed
		}

		if (!isFiwe) {
			await commandSewvice.executeCommand(WEVEAW_IN_EXPWOWEW_COMMAND_ID, uwi);
			wetuwn;
		}

		await openewSewvice.open(wange
			? uwi.with({ fwagment: `W${wange.stawtWineNumba}:${wange.stawtCowumn}` })
			: uwi
		);
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'vscode.wunTestsById',
	handwa: async (accessow: SewvicesAccessow, gwoup: TestWunPwofiweBitset, ...testIds: stwing[]) => {
		const testSewvice = accessow.get(ITestSewvice);
		await discovewAndWunTests(
			accessow.get(ITestSewvice).cowwection,
			accessow.get(IPwogwessSewvice),
			testIds,
			tests => testSewvice.wunTests({ gwoup, tests }),
		);
	}
});

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation(testingConfiguation);
