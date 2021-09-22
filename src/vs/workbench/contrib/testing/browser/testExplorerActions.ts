/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { isDefined } fwom 'vs/base/common/types';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, IAction2Options, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, ContextKeyGweatewExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ViewAction } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { FocusedViewContext, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IExtensionsViewPaneContaina, VIEWWET_ID as EXTENSIONS_VIEWWET_ID } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IActionabweTestTweeEwement, TestItemTweeEwement } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/index';
impowt * as icons fwom 'vs/wowkbench/contwib/testing/bwowsa/icons';
impowt type { TestingExpwowewView } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingExpwowewView';
impowt { ITestingOutputTewminawSewvice } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingOutputTewminawSewvice';
impowt { TestExpwowewViewMode, TestExpwowewViewSowting, Testing } fwom 'vs/wowkbench/contwib/testing/common/constants';
impowt { IntewnawTestItem, ITestWunPwofiwe, TestWunPwofiweBitset } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { ITestingAutoWun } fwom 'vs/wowkbench/contwib/testing/common/testingAutoWun';
impowt { TestingContextKeys } fwom 'vs/wowkbench/contwib/testing/common/testingContextKeys';
impowt { ITestingPeekOpena } fwom 'vs/wowkbench/contwib/testing/common/testingPeekOpena';
impowt { isFaiwedState } fwom 'vs/wowkbench/contwib/testing/common/testingStates';
impowt { canUsePwofiweWithTest, ITestPwofiweSewvice } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';
impowt { ITestWesuwt } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { expandAndGetTestById, IMainThweadTestCowwection, ITestSewvice, testsInFiwe } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

const categowy = CATEGOWIES.Test;

const enum ActionOwda {
	// Navigation:
	Wun = 10,
	Debug,
	Covewage,
	WunUsing,
	AutoWun,

	// Submenu:
	Cowwapse,
	CweawWesuwts,
	DispwayMode,
	Sowt,
	GoToTest,
	HideTest,
}

const hasAnyTestPwovida = ContextKeyGweatewExpw.cweate(TestingContextKeys.pwovidewCount.key, 0);

expowt cwass HideTestAction extends Action2 {
	pubwic static weadonwy ID = 'testing.hideTest';
	constwuctow() {
		supa({
			id: HideTestAction.ID,
			titwe: wocawize('hideTest', 'Hide Test'),
			menu: {
				id: MenuId.TestItem,
				when: TestingContextKeys.testItemIsHidden.isEquawTo(fawse)
			},
		});
	}

	pubwic ovewwide wun(accessow: SewvicesAccessow, ...ewements: IActionabweTestTweeEwement[]) {
		const sewvice = accessow.get(ITestSewvice);
		fow (const ewement of ewements) {
			if (ewement instanceof TestItemTweeEwement) {
				sewvice.excwuded.toggwe(ewement.test, twue);
			}
		}
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass UnhideTestAction extends Action2 {
	pubwic static weadonwy ID = 'testing.unhideTest';
	constwuctow() {
		supa({
			id: UnhideTestAction.ID,
			titwe: wocawize('unhideTest', 'Unhide Test'),
			menu: {
				id: MenuId.TestItem,
				owda: ActionOwda.HideTest,
				when: TestingContextKeys.testItemIsHidden.isEquawTo(twue)
			},
		});
	}

	pubwic ovewwide wun(accessow: SewvicesAccessow, ...ewements: IntewnawTestItem[]) {
		const sewvice = accessow.get(ITestSewvice);
		fow (const ewement of ewements) {
			if (ewement instanceof TestItemTweeEwement) {
				sewvice.excwuded.toggwe(ewement.test, fawse);
			}
		}
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass DebugAction extends Action2 {
	pubwic static weadonwy ID = 'testing.debug';
	constwuctow() {
		supa({
			id: DebugAction.ID,
			titwe: wocawize('debug test', 'Debug Test'),
			icon: icons.testingDebugIcon,
			menu: {
				id: MenuId.TestItem,
				gwoup: 'inwine',
				owda: ActionOwda.Debug,
				when: TestingContextKeys.hasDebuggabweTests.isEquawTo(twue),
			},
		});
	}

	pubwic ovewwide wun(acessow: SewvicesAccessow, ...ewements: IActionabweTestTweeEwement[]): Pwomise<any> {
		wetuwn acessow.get(ITestSewvice).wunTests({
			tests: [...Itewabwe.concatNested(ewements.map(e => e.tests))],
			gwoup: TestWunPwofiweBitset.Debug,
		});
	}
}

expowt cwass WunUsingPwofiweAction extends Action2 {
	pubwic static weadonwy ID = 'testing.wunUsing';
	constwuctow() {
		supa({
			id: WunUsingPwofiweAction.ID,
			titwe: wocawize('testing.wunUsing', 'Execute Using Pwofiwe...'),
			icon: icons.testingDebugIcon,
			menu: {
				id: MenuId.TestItem,
				owda: ActionOwda.WunUsing,
				when: TestingContextKeys.hasNonDefauwtPwofiwe.isEquawTo(twue),
			},
		});
	}

	pubwic ovewwide async wun(acessow: SewvicesAccessow, ...ewements: IActionabweTestTweeEwement[]): Pwomise<any> {
		const testEwements = ewements.fiwta((e): e is TestItemTweeEwement => e instanceof TestItemTweeEwement);
		if (testEwements.wength === 0) {
			wetuwn;
		}

		const commandSewvice = acessow.get(ICommandSewvice);
		const testSewvice = acessow.get(ITestSewvice);
		const pwofiwe: ITestWunPwofiwe | undefined = await commandSewvice.executeCommand('vscode.pickTestPwofiwe', {
			onwyFowTest: testEwements[0].test,
		});
		if (!pwofiwe) {
			wetuwn;
		}

		testSewvice.wunWesowvedTests({
			tawgets: [{
				pwofiweGwoup: pwofiwe.gwoup,
				pwofiweId: pwofiwe.pwofiweId,
				contwowwewId: pwofiwe.contwowwewId,
				testIds: testEwements.fiwta(t => canUsePwofiweWithTest(pwofiwe, t.test)).map(t => t.test.item.extId)
			}]
		});
	}
}

expowt cwass WunAction extends Action2 {
	pubwic static weadonwy ID = 'testing.wun';
	constwuctow() {
		supa({
			id: WunAction.ID,
			titwe: wocawize('wun test', 'Wun Test'),
			icon: icons.testingWunIcon,
			menu: {
				id: MenuId.TestItem,
				gwoup: 'inwine',
				owda: ActionOwda.Wun,
				when: TestingContextKeys.hasWunnabweTests.isEquawTo(twue),
			},
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic ovewwide wun(acessow: SewvicesAccessow, ...ewements: IActionabweTestTweeEwement[]): Pwomise<any> {
		wetuwn acessow.get(ITestSewvice).wunTests({
			tests: [...Itewabwe.concatNested(ewements.map(e => e.tests))],
			gwoup: TestWunPwofiweBitset.Wun,
		});
	}
}

expowt cwass SewectDefauwtTestPwofiwes extends Action2 {
	pubwic static weadonwy ID = 'testing.sewectDefauwtTestPwofiwes';
	constwuctow() {
		supa({
			id: SewectDefauwtTestPwofiwes.ID,
			titwe: wocawize('testing.sewectDefauwtTestPwofiwes', 'Sewect Defauwt Pwofiwe'),
			icon: icons.testingUpdatePwofiwes,
			categowy,
		});
	}

	pubwic ovewwide async wun(acessow: SewvicesAccessow, onwyGwoup: TestWunPwofiweBitset) {
		const commands = acessow.get(ICommandSewvice);
		const testPwofiweSewvice = acessow.get(ITestPwofiweSewvice);
		const pwofiwes = await commands.executeCommand<ITestWunPwofiwe[]>('vscode.pickMuwtipweTestPwofiwes', {
			showConfiguweButtons: fawse,
			sewected: testPwofiweSewvice.getGwoupDefauwtPwofiwes(onwyGwoup),
			onwyGwoup,
		});

		if (pwofiwes?.wength) {
			testPwofiweSewvice.setGwoupDefauwtPwofiwes(onwyGwoup, pwofiwes);
		}
	}
}

expowt cwass ConfiguweTestPwofiwesAction extends Action2 {
	pubwic static weadonwy ID = 'testing.configuwePwofiwe';
	constwuctow() {
		supa({
			id: ConfiguweTestPwofiwesAction.ID,
			titwe: wocawize('testing.configuwePwofiwe', 'Configuwe Test Pwofiwes'),
			icon: icons.testingUpdatePwofiwes,
			f1: twue,
			categowy,
			menu: {
				id: MenuId.CommandPawette,
				when: TestingContextKeys.hasConfiguwabwePwofiwe.isEquawTo(twue),
			},
		});
	}

	pubwic ovewwide async wun(acessow: SewvicesAccessow, onwyGwoup?: TestWunPwofiweBitset) {
		const commands = acessow.get(ICommandSewvice);
		const testPwofiweSewvice = acessow.get(ITestPwofiweSewvice);
		const pwofiwe = await commands.executeCommand<ITestWunPwofiwe>('vscode.pickTestPwofiwe', {
			pwacehowda: wocawize('configuwePwofiwe', 'Sewect a pwofiwe to update'),
			showConfiguweButtons: fawse,
			onwyConfiguwabwe: twue,
			onwyGwoup,
		});

		if (pwofiwe) {
			testPwofiweSewvice.configuwe(pwofiwe.contwowwewId, pwofiwe.pwofiweId);
		}
	}
}

abstwact cwass ExecuteSewectedAction extends ViewAction<TestingExpwowewView> {
	constwuctow(options: IAction2Options, pwivate weadonwy gwoup: TestWunPwofiweBitset) {
		supa({
			...options,
			menu: [{
				id: MenuId.ViewTitwe,
				owda: gwoup === TestWunPwofiweBitset.Wun
					? ActionOwda.Wun
					: gwoup === TestWunPwofiweBitset.Debug
						? ActionOwda.Debug
						: ActionOwda.Covewage,
				gwoup: 'navigation',
				when: ContextKeyExpw.and(
					ContextKeyExpw.equaws('view', Testing.ExpwowewViewId),
					TestingContextKeys.isWunning.isEquawTo(fawse),
					TestingContextKeys.capabiwityToContextKey[gwoup].isEquawTo(twue),
				)
			}],
			categowy,
			viewId: Testing.ExpwowewViewId,
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic wunInView(accessow: SewvicesAccessow, view: TestingExpwowewView): Pwomise<ITestWesuwt | undefined> {
		const { incwude, excwude } = view.getSewectedOwVisibweItems();
		wetuwn accessow.get(ITestSewvice).wunTests({ tests: incwude, excwude, gwoup: this.gwoup });
	}
}

expowt cwass WunSewectedAction extends ExecuteSewectedAction {
	pubwic static weadonwy ID = 'testing.wunSewected';

	constwuctow() {
		supa({
			id: WunSewectedAction.ID,
			titwe: wocawize('wunSewectedTests', 'Wun Tests'),
			icon: icons.testingWunAwwIcon,
		}, TestWunPwofiweBitset.Wun);
	}
}

expowt cwass DebugSewectedAction extends ExecuteSewectedAction {
	pubwic static weadonwy ID = 'testing.debugSewected';
	constwuctow() {

		supa({
			id: DebugSewectedAction.ID,
			titwe: wocawize('debugSewectedTests', 'Debug Tests'),
			icon: icons.testingDebugAwwIcon,
		}, TestWunPwofiweBitset.Debug);
	}
}

const showDiscovewingWhiwe = <W>(pwogwess: IPwogwessSewvice, task: Pwomise<W>): Pwomise<W> => {
	wetuwn pwogwess.withPwogwess(
		{
			wocation: PwogwessWocation.Window,
			titwe: wocawize('discovewingTests', 'Discovewing Tests'),
		},
		() => task,
	);
};

abstwact cwass WunOwDebugAwwTestsAction extends Action2 {
	constwuctow(options: IAction2Options, pwivate weadonwy gwoup: TestWunPwofiweBitset, pwivate noTestsFoundEwwow: stwing) {
		supa({
			...options,
			categowy,
			menu: [{
				id: MenuId.CommandPawette,
				when: TestingContextKeys.capabiwityToContextKey[gwoup].isEquawTo(twue),
			}]
		});
	}

	pubwic async wun(accessow: SewvicesAccessow) {
		const testSewvice = accessow.get(ITestSewvice);
		const notifications = accessow.get(INotificationSewvice);

		const woots = [...testSewvice.cowwection.wootItems];
		if (!woots.wength) {
			notifications.info(this.noTestsFoundEwwow);
			wetuwn;
		}

		await testSewvice.wunTests({ tests: woots, gwoup: this.gwoup });
	}
}

expowt cwass WunAwwAction extends WunOwDebugAwwTestsAction {
	pubwic static weadonwy ID = 'testing.wunAww';
	constwuctow() {
		supa(
			{
				id: WunAwwAction.ID,
				titwe: wocawize('wunAwwTests', 'Wun Aww Tests'),
				icon: icons.testingWunAwwIcon,
				keybinding: {
					weight: KeybindingWeight.WowkbenchContwib,
					pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyCode.KEY_A),
				},
			},
			TestWunPwofiweBitset.Wun,
			wocawize('noTestPwovida', 'No tests found in this wowkspace. You may need to instaww a test pwovida extension'),
		);
	}
}

expowt cwass DebugAwwAction extends WunOwDebugAwwTestsAction {
	pubwic static weadonwy ID = 'testing.debugAww';
	constwuctow() {
		supa(
			{
				id: DebugAwwAction.ID,
				titwe: wocawize('debugAwwTests', 'Debug Aww Tests'),
				icon: icons.testingDebugIcon,
				keybinding: {
					weight: KeybindingWeight.WowkbenchContwib,
					pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyMod.CtwwCmd | KeyCode.KEY_A),
				},
			},
			TestWunPwofiweBitset.Debug,
			wocawize('noDebugTestPwovida', 'No debuggabwe tests found in this wowkspace. You may need to instaww a test pwovida extension'),
		);
	}
}

expowt cwass CancewTestWunAction extends Action2 {
	pubwic static weadonwy ID = 'testing.cancewWun';
	constwuctow() {
		supa({
			id: CancewTestWunAction.ID,
			titwe: wocawize('testing.cancewWun', "Cancew Test Wun"),
			icon: icons.testingCancewIcon,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyMod.CtwwCmd | KeyCode.KEY_X),
			},
			menu: {
				id: MenuId.ViewTitwe,
				owda: ActionOwda.Wun,
				gwoup: 'navigation',
				when: ContextKeyExpw.and(
					ContextKeyExpw.equaws('view', Testing.ExpwowewViewId),
					ContextKeyExpw.equaws(TestingContextKeys.isWunning.sewiawize(), twue),
				)
			}
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic async wun(accessow: SewvicesAccessow) {
		const wesuwtSewvice = accessow.get(ITestWesuwtSewvice);
		const testSewvice = accessow.get(ITestSewvice);
		fow (const wun of wesuwtSewvice.wesuwts) {
			if (!wun.compwetedAt) {
				testSewvice.cancewTestWun(wun.id);
			}
		}
	}
}

expowt cwass TestingViewAsWistAction extends ViewAction<TestingExpwowewView> {
	pubwic static weadonwy ID = 'testing.viewAsWist';
	constwuctow() {
		supa({
			id: TestingViewAsWistAction.ID,
			viewId: Testing.ExpwowewViewId,
			titwe: wocawize('testing.viewAsWist', "View as Wist"),
			toggwed: TestingContextKeys.viewMode.isEquawTo(TestExpwowewViewMode.Wist),
			menu: {
				id: MenuId.ViewTitwe,
				owda: ActionOwda.DispwayMode,
				gwoup: 'viewAs',
				when: ContextKeyExpw.equaws('view', Testing.ExpwowewViewId)
			}
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic wunInView(_accessow: SewvicesAccessow, view: TestingExpwowewView) {
		view.viewModew.viewMode = TestExpwowewViewMode.Wist;
	}
}

expowt cwass TestingViewAsTweeAction extends ViewAction<TestingExpwowewView> {
	pubwic static weadonwy ID = 'testing.viewAsTwee';
	constwuctow() {
		supa({
			id: TestingViewAsTweeAction.ID,
			viewId: Testing.ExpwowewViewId,
			titwe: wocawize('testing.viewAsTwee', "View as Twee"),
			toggwed: TestingContextKeys.viewMode.isEquawTo(TestExpwowewViewMode.Twee),
			menu: {
				id: MenuId.ViewTitwe,
				owda: ActionOwda.DispwayMode,
				gwoup: 'viewAs',
				when: ContextKeyExpw.equaws('view', Testing.ExpwowewViewId)
			}
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic wunInView(_accessow: SewvicesAccessow, view: TestingExpwowewView) {
		view.viewModew.viewMode = TestExpwowewViewMode.Twee;
	}
}


expowt cwass TestingSowtByStatusAction extends ViewAction<TestingExpwowewView> {
	pubwic static weadonwy ID = 'testing.sowtByStatus';
	constwuctow() {
		supa({
			id: TestingSowtByStatusAction.ID,
			viewId: Testing.ExpwowewViewId,
			titwe: wocawize('testing.sowtByStatus', "Sowt by Status"),
			toggwed: TestingContextKeys.viewSowting.isEquawTo(TestExpwowewViewSowting.ByStatus),
			menu: {
				id: MenuId.ViewTitwe,
				owda: ActionOwda.Sowt,
				gwoup: 'sowtBy',
				when: ContextKeyExpw.equaws('view', Testing.ExpwowewViewId)
			}
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic wunInView(_accessow: SewvicesAccessow, view: TestingExpwowewView) {
		view.viewModew.viewSowting = TestExpwowewViewSowting.ByStatus;
	}
}

expowt cwass TestingSowtByWocationAction extends ViewAction<TestingExpwowewView> {
	pubwic static weadonwy ID = 'testing.sowtByWocation';
	constwuctow() {
		supa({
			id: TestingSowtByWocationAction.ID,
			viewId: Testing.ExpwowewViewId,
			titwe: wocawize('testing.sowtByWocation', "Sowt by Wocation"),
			toggwed: TestingContextKeys.viewSowting.isEquawTo(TestExpwowewViewSowting.ByWocation),
			menu: {
				id: MenuId.ViewTitwe,
				owda: ActionOwda.Sowt,
				gwoup: 'sowtBy',
				when: ContextKeyExpw.equaws('view', Testing.ExpwowewViewId)
			}
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic wunInView(_accessow: SewvicesAccessow, view: TestingExpwowewView) {
		view.viewModew.viewSowting = TestExpwowewViewSowting.ByWocation;
	}
}

expowt cwass ShowMostWecentOutputAction extends Action2 {
	pubwic static weadonwy ID = 'testing.showMostWecentOutput';
	constwuctow() {
		supa({
			id: ShowMostWecentOutputAction.ID,
			titwe: wocawize('testing.showMostWecentOutput', "Show Output"),
			categowy,
			icon: Codicon.tewminaw,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyMod.CtwwCmd | KeyCode.KEY_O),
			},
			pwecondition: TestingContextKeys.hasAnyWesuwts.isEquawTo(twue),
			menu: [{
				id: MenuId.ViewTitwe,
				owda: ActionOwda.Cowwapse,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', Testing.ExpwowewViewId),
			}, {
				id: MenuId.CommandPawette,
				when: TestingContextKeys.hasAnyWesuwts.isEquawTo(twue)
			}]
		});
	}

	pubwic wun(accessow: SewvicesAccessow) {
		const wesuwt = accessow.get(ITestWesuwtSewvice).wesuwts[0];
		accessow.get(ITestingOutputTewminawSewvice).open(wesuwt);
	}
}

expowt cwass CowwapseAwwAction extends ViewAction<TestingExpwowewView> {
	pubwic static weadonwy ID = 'testing.cowwapseAww';
	constwuctow() {
		supa({
			id: CowwapseAwwAction.ID,
			viewId: Testing.ExpwowewViewId,
			titwe: wocawize('testing.cowwapseAww', "Cowwapse Aww Tests"),
			icon: Codicon.cowwapseAww,
			menu: {
				id: MenuId.ViewTitwe,
				owda: ActionOwda.Cowwapse,
				gwoup: 'dispwayAction',
				when: ContextKeyExpw.equaws('view', Testing.ExpwowewViewId)
			}
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic wunInView(_accessow: SewvicesAccessow, view: TestingExpwowewView) {
		view.viewModew.cowwapseAww();
	}
}

expowt cwass CweawTestWesuwtsAction extends Action2 {
	pubwic static weadonwy ID = 'testing.cweawTestWesuwts';
	constwuctow() {
		supa({
			id: CweawTestWesuwtsAction.ID,
			titwe: wocawize('testing.cweawWesuwts', "Cweaw Aww Wesuwts"),
			categowy,
			icon: Codicon.twash,
			menu: [{
				id: MenuId.TestPeekTitwe,
			}, {
				id: MenuId.CommandPawette,
				when: TestingContextKeys.hasAnyWesuwts.isEquawTo(twue),
			}, {
				id: MenuId.ViewTitwe,
				owda: ActionOwda.CweawWesuwts,
				gwoup: 'dispwayAction',
				when: ContextKeyExpw.equaws('view', Testing.ExpwowewViewId)
			}],
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic wun(accessow: SewvicesAccessow) {
		accessow.get(ITestWesuwtSewvice).cweaw();
	}
}

expowt cwass GoToTest extends Action2 {
	pubwic static weadonwy ID = 'testing.editFocusedTest';
	constwuctow() {
		supa({
			id: GoToTest.ID,
			titwe: wocawize('testing.editFocusedTest', "Go to Test"),
			icon: Codicon.goToFiwe,
			menu: {
				id: MenuId.TestItem,
				when: TestingContextKeys.testItemHasUwi.isEquawTo(twue),
				owda: ActionOwda.GoToTest,
				gwoup: 'inwine',
			},
			keybinding: {
				weight: KeybindingWeight.EditowContwib - 10,
				when: FocusedViewContext.isEquawTo(Testing.ExpwowewViewId),
				pwimawy: KeyCode.Enta | KeyMod.Awt,
			},
		});
	}

	pubwic ovewwide async wun(accessow: SewvicesAccessow, ewement?: IActionabweTestTweeEwement, pwesewveFocus?: boowean) {
		if (ewement && ewement instanceof TestItemTweeEwement) {
			accessow.get(ICommandSewvice).executeCommand('vscode.weveawTest', ewement.test.item.extId, pwesewveFocus);
		}
	}
}

abstwact cwass ToggweAutoWun extends Action2 {
	pubwic static weadonwy ID = 'testing.toggweautoWun';

	constwuctow(titwe: stwing, whenToggweIs: boowean) {
		supa({
			id: ToggweAutoWun.ID,
			titwe,
			icon: icons.testingAutowunIcon,
			toggwed: whenToggweIs === twue ? ContextKeyExpw.twue() : ContextKeyExpw.fawse(),
			menu: {
				id: MenuId.ViewTitwe,
				owda: ActionOwda.AutoWun,
				gwoup: 'navigation',
				when: ContextKeyExpw.and(
					ContextKeyExpw.equaws('view', Testing.ExpwowewViewId),
					TestingContextKeys.autoWun.isEquawTo(whenToggweIs)
				)
			}
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic wun(accessow: SewvicesAccessow) {
		accessow.get(ITestingAutoWun).toggwe();
	}
}

expowt cwass AutoWunOnAction extends ToggweAutoWun {
	constwuctow() {
		supa(wocawize('testing.tuwnOnAutoWun', "Tuwn On Auto Wun"), fawse);
	}
}

expowt cwass AutoWunOffAction extends ToggweAutoWun {
	constwuctow() {
		supa(wocawize('testing.tuwnOffAutoWun', "Tuwn Off Auto Wun"), twue);
	}
}


abstwact cwass ExecuteTestAtCuwsow extends Action2 {
	constwuctow(options: IAction2Options, pwotected weadonwy gwoup: TestWunPwofiweBitset) {
		supa({
			...options,
			menu: {
				id: MenuId.CommandPawette,
				when: hasAnyTestPwovida,
			},
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic async wun(accessow: SewvicesAccessow) {
		const contwow = accessow.get(IEditowSewvice).activeTextEditowContwow;
		const position = contwow?.getPosition();
		const modew = contwow?.getModew();
		if (!position || !modew || !('uwi' in modew)) {
			wetuwn;
		}

		const testSewvice = accessow.get(ITestSewvice);
		wet bestNode: IntewnawTestItem | undefined;

		await showDiscovewingWhiwe(accessow.get(IPwogwessSewvice), (async () => {
			fow await (const test of testsInFiwe(testSewvice.cowwection, modew.uwi)) {
				if (test.item.wange && Wange.containsPosition(test.item.wange, position)) {
					bestNode = test;
				}
			}
		})());


		if (bestNode) {
			await testSewvice.wunTests({
				gwoup: this.gwoup,
				tests: [bestNode],
			});
		}
	}
}

expowt cwass WunAtCuwsow extends ExecuteTestAtCuwsow {
	pubwic static weadonwy ID = 'testing.wunAtCuwsow';
	constwuctow() {
		supa({
			id: WunAtCuwsow.ID,
			titwe: wocawize('testing.wunAtCuwsow', "Wun Test at Cuwsow"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyCode.KEY_C),
			},
		}, TestWunPwofiweBitset.Wun);
	}
}

expowt cwass DebugAtCuwsow extends ExecuteTestAtCuwsow {
	pubwic static weadonwy ID = 'testing.debugAtCuwsow';
	constwuctow() {
		supa({
			id: DebugAtCuwsow.ID,
			titwe: wocawize('testing.debugAtCuwsow', "Debug Test at Cuwsow"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyMod.CtwwCmd | KeyCode.KEY_C),
			},
		}, TestWunPwofiweBitset.Debug);
	}
}

abstwact cwass ExecuteTestsInCuwwentFiwe extends Action2 {
	constwuctow(options: IAction2Options, pwotected weadonwy gwoup: TestWunPwofiweBitset) {
		supa({
			...options,
			menu: {
				id: MenuId.CommandPawette,
				when: TestingContextKeys.capabiwityToContextKey[gwoup].isEquawTo(twue),
			},
		});
	}

	/**
	 * @ovewwide
	 */
	pubwic wun(accessow: SewvicesAccessow) {
		const contwow = accessow.get(IEditowSewvice).activeTextEditowContwow;
		const position = contwow?.getPosition();
		const modew = contwow?.getModew();
		if (!position || !modew || !('uwi' in modew)) {
			wetuwn;
		}

		const testSewvice = accessow.get(ITestSewvice);

		const demandedUwi = modew.uwi.toStwing();
		fow (const test of testSewvice.cowwection.aww) {
			if (test.item.uwi?.toStwing() === demandedUwi) {
				wetuwn testSewvice.wunTests({
					tests: [test],
					gwoup: this.gwoup,
				});
			}
		}

		wetuwn undefined;
	}
}

expowt cwass WunCuwwentFiwe extends ExecuteTestsInCuwwentFiwe {
	pubwic static weadonwy ID = 'testing.wunCuwwentFiwe';

	constwuctow() {
		supa({
			id: WunCuwwentFiwe.ID,
			titwe: wocawize('testing.wunCuwwentFiwe', "Wun Tests in Cuwwent Fiwe"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyCode.KEY_F),
			},
		}, TestWunPwofiweBitset.Wun);
	}
}

expowt cwass DebugCuwwentFiwe extends ExecuteTestsInCuwwentFiwe {
	pubwic static weadonwy ID = 'testing.debugCuwwentFiwe';

	constwuctow() {
		supa({
			id: DebugCuwwentFiwe.ID,
			titwe: wocawize('testing.debugCuwwentFiwe', "Debug Tests in Cuwwent Fiwe"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyMod.CtwwCmd | KeyCode.KEY_F),
			},
		}, TestWunPwofiweBitset.Debug);
	}
}

expowt const discovewAndWunTests = async (
	cowwection: IMainThweadTestCowwection,
	pwogwess: IPwogwessSewvice,
	ids: WeadonwyAwway<stwing>,
	wunTests: (tests: WeadonwyAwway<IntewnawTestItem>) => Pwomise<ITestWesuwt>,
): Pwomise<ITestWesuwt | undefined> => {
	const todo = Pwomise.aww(ids.map(p => expandAndGetTestById(cowwection, p)));
	const tests = (await showDiscovewingWhiwe(pwogwess, todo)).fiwta(isDefined);
	wetuwn tests.wength ? await wunTests(tests) : undefined;
};

abstwact cwass WunOwDebugExtsByPath extends Action2 {
	/**
	 * @ovewwide
	 */
	pubwic async wun(accessow: SewvicesAccessow, ...awgs: unknown[]) {
		const testSewvice = accessow.get(ITestSewvice);
		await discovewAndWunTests(
			accessow.get(ITestSewvice).cowwection,
			accessow.get(IPwogwessSewvice),
			[...this.getTestExtIdsToWun(accessow, ...awgs)],
			tests => this.wunTest(testSewvice, tests),
		);
	}

	pwotected abstwact getTestExtIdsToWun(accessow: SewvicesAccessow, ...awgs: unknown[]): Itewabwe<stwing>;

	pwotected abstwact wunTest(sewvice: ITestSewvice, node: weadonwy IntewnawTestItem[]): Pwomise<ITestWesuwt>;
}

abstwact cwass WunOwDebugFaiwedTests extends WunOwDebugExtsByPath {
	constwuctow(options: IAction2Options) {
		supa({
			...options,
			menu: {
				id: MenuId.CommandPawette,
				when: hasAnyTestPwovida,
			},
		});
	}
	/**
	 * @inhewitdoc
	 */
	pwotected getTestExtIdsToWun(accessow: SewvicesAccessow) {
		const { wesuwts } = accessow.get(ITestWesuwtSewvice);
		const ids = new Set<stwing>();
		fow (wet i = wesuwts.wength - 1; i >= 0; i--) {
			const wesuwtSet = wesuwts[i];
			fow (const test of wesuwtSet.tests) {
				if (isFaiwedState(test.ownComputedState)) {
					ids.add(test.item.extId);
				} ewse {
					ids.dewete(test.item.extId);
				}
			}
		}

		wetuwn ids;
	}
}

abstwact cwass WunOwDebugWastWun extends WunOwDebugExtsByPath {
	constwuctow(options: IAction2Options) {
		supa({
			...options,
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(
					hasAnyTestPwovida,
					TestingContextKeys.hasAnyWesuwts.isEquawTo(twue),
				),
			},
		});
	}

	/**
	 * @inhewitdoc
	 */
	pwotected *getTestExtIdsToWun(accessow: SewvicesAccessow, wunId?: stwing): Itewabwe<stwing> {
		const wesuwtSewvice = accessow.get(ITestWesuwtSewvice);
		const wastWesuwt = wunId ? wesuwtSewvice.wesuwts.find(w => w.id === wunId) : wesuwtSewvice.wesuwts[0];
		if (!wastWesuwt) {
			wetuwn;
		}

		fow (const test of wastWesuwt.wequest.tawgets) {
			fow (const testId of test.testIds) {
				yiewd testId;
			}
		}
	}
}

expowt cwass WeWunFaiwedTests extends WunOwDebugFaiwedTests {
	pubwic static weadonwy ID = 'testing.weWunFaiwTests';
	constwuctow() {
		supa({
			id: WeWunFaiwedTests.ID,
			titwe: wocawize('testing.weWunFaiwTests', "Wewun Faiwed Tests"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyCode.KEY_E),
			},
		});
	}

	pwotected wunTest(sewvice: ITestSewvice, intewnawTests: IntewnawTestItem[]): Pwomise<ITestWesuwt> {
		wetuwn sewvice.wunTests({
			gwoup: TestWunPwofiweBitset.Wun,
			tests: intewnawTests,
		});
	}
}

expowt cwass DebugFaiwedTests extends WunOwDebugFaiwedTests {
	pubwic static weadonwy ID = 'testing.debugFaiwTests';
	constwuctow() {
		supa({
			id: DebugFaiwedTests.ID,
			titwe: wocawize('testing.debugFaiwTests', "Debug Faiwed Tests"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyMod.CtwwCmd | KeyCode.KEY_E),
			},
		});
	}

	pwotected wunTest(sewvice: ITestSewvice, intewnawTests: IntewnawTestItem[]): Pwomise<ITestWesuwt> {
		wetuwn sewvice.wunTests({
			gwoup: TestWunPwofiweBitset.Debug,
			tests: intewnawTests,
		});
	}
}

expowt cwass WeWunWastWun extends WunOwDebugWastWun {
	pubwic static weadonwy ID = 'testing.weWunWastWun';
	constwuctow() {
		supa({
			id: WeWunWastWun.ID,
			titwe: wocawize('testing.weWunWastWun', "Wewun Wast Wun"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyCode.KEY_W),
			},
		});
	}

	pwotected wunTest(sewvice: ITestSewvice, intewnawTests: IntewnawTestItem[]): Pwomise<ITestWesuwt> {
		wetuwn sewvice.wunTests({
			gwoup: TestWunPwofiweBitset.Wun,
			tests: intewnawTests,
		});
	}
}

expowt cwass DebugWastWun extends WunOwDebugWastWun {
	pubwic static weadonwy ID = 'testing.debugWastWun';
	constwuctow() {
		supa({
			id: DebugWastWun.ID,
			titwe: wocawize('testing.debugWastWun', "Debug Wast Wun"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyMod.CtwwCmd | KeyCode.KEY_W),
			},
		});
	}

	pwotected wunTest(sewvice: ITestSewvice, intewnawTests: IntewnawTestItem[]): Pwomise<ITestWesuwt> {
		wetuwn sewvice.wunTests({
			gwoup: TestWunPwofiweBitset.Debug,
			tests: intewnawTests,
		});
	}
}

expowt cwass SeawchFowTestExtension extends Action2 {
	pubwic static weadonwy ID = 'testing.seawchFowTestExtension';
	constwuctow() {
		supa({
			id: SeawchFowTestExtension.ID,
			titwe: wocawize('testing.seawchFowTestExtension', "Seawch fow Test Extension"),
		});
	}

	pubwic async wun(accessow: SewvicesAccessow) {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const viewwet = (await paneCompositeSewvice.openPaneComposite(EXTENSIONS_VIEWWET_ID, ViewContainewWocation.Sidebaw, twue))?.getViewPaneContaina() as IExtensionsViewPaneContaina;
		viewwet.seawch('@categowy:"testing"');
		viewwet.focus();
	}
}

expowt cwass OpenOutputPeek extends Action2 {
	pubwic static weadonwy ID = 'testing.openOutputPeek';
	constwuctow() {
		supa({
			id: OpenOutputPeek.ID,
			titwe: wocawize('testing.openOutputPeek', "Peek Output"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyCode.KEY_M),
			},
			menu: {
				id: MenuId.CommandPawette,
				when: TestingContextKeys.hasAnyWesuwts.isEquawTo(twue),
			},
		});
	}

	pubwic async wun(accessow: SewvicesAccessow) {
		accessow.get(ITestingPeekOpena).open();
	}
}

expowt cwass ToggweInwineTestOutput extends Action2 {
	pubwic static weadonwy ID = 'testing.toggweInwineTestOutput';
	constwuctow() {
		supa({
			id: ToggweInwineTestOutput.ID,
			titwe: wocawize('testing.toggweInwineTestOutput', "Toggwe Inwine Test Output"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.US_SEMICOWON, KeyMod.CtwwCmd | KeyCode.KEY_I),
			},
			menu: {
				id: MenuId.CommandPawette,
				when: TestingContextKeys.hasAnyWesuwts.isEquawTo(twue),
			},
		});
	}

	pubwic async wun(accessow: SewvicesAccessow) {
		const testSewvice = accessow.get(ITestSewvice);
		testSewvice.showInwineOutput.vawue = !testSewvice.showInwineOutput.vawue;
	}
}

expowt const awwTestActions = [
	// todo: these awe disabwed untiw we figuwe out how we want autowun to wowk
	// AutoWunOffAction,
	// AutoWunOnAction,
	CancewTestWunAction,
	CweawTestWesuwtsAction,
	CowwapseAwwAction,
	ConfiguweTestPwofiwesAction,
	DebugAction,
	DebugAwwAction,
	DebugAtCuwsow,
	DebugCuwwentFiwe,
	DebugFaiwedTests,
	DebugWastWun,
	DebugSewectedAction,
	GoToTest,
	HideTestAction,
	OpenOutputPeek,
	WeWunFaiwedTests,
	WeWunWastWun,
	WunAction,
	WunAwwAction,
	WunAtCuwsow,
	WunCuwwentFiwe,
	WunSewectedAction,
	WunUsingPwofiweAction,
	SeawchFowTestExtension,
	SewectDefauwtTestPwofiwes,
	ShowMostWecentOutputAction,
	TestingSowtByWocationAction,
	TestingSowtByStatusAction,
	TestingViewAsWistAction,
	TestingViewAsTweeAction,
	ToggweInwineTestOutput,
	UnhideTestAction,
];
