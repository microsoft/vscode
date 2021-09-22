/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { wendewStwingAsPwaintext } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { Action, IAction, Sepawatow, SubmenuAction } fwom 'vs/base/common/actions';
impowt { Event } fwom 'vs/base/common/event';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, IWefewence, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { setImmediate } fwom 'vs/base/common/pwatfowm';
impowt { wemoveAnsiEscapeCodes } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { ContentWidgetPositionPwefewence, ICodeEditow, IContentWidgetPosition, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { IModewDewtaDecowation, OvewviewWuwewWane, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { editowCodeWensFowegwound, ovewviewWuwewEwwow, ovewviewWuwewInfo } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewThemingPawticipant, themeCowowFwomId, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { BWEAKPOINT_EDITOW_CONTWIBUTION_ID, IBweakpointEditowContwibution } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { getTestItemContextOvewway } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/testItemContextOvewway';
impowt { testingWunAwwIcon, testingWunIcon, testingStatesToIcons } fwom 'vs/wowkbench/contwib/testing/bwowsa/icons';
impowt { TestingOutputPeekContwowwa } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingOutputPeek';
impowt { testMessageSevewityCowows } fwom 'vs/wowkbench/contwib/testing/bwowsa/theme';
impowt { DefauwtGuttewCwickAction, getTestingConfiguwation, TestingConfigKeys } fwom 'vs/wowkbench/contwib/testing/common/configuwation';
impowt { wabewFowTestInState } fwom 'vs/wowkbench/contwib/testing/common/constants';
impowt { IncwementawTestCowwectionItem, IntewnawTestItem, IWichWocation, ITestMessage, ITestWunPwofiwe, TestMessageType, TestWesuwtItem, TestWesuwtState, TestWunPwofiweBitset } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { isFaiwedState, maxPwiowity } fwom 'vs/wowkbench/contwib/testing/common/testingStates';
impowt { buiwdTestUwi, pawseTestUwi, TestUwiType } fwom 'vs/wowkbench/contwib/testing/common/testingUwi';
impowt { ITestPwofiweSewvice } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';
impowt { WiveTestWesuwt } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { getContextFowTestItem, ITestSewvice, testsInFiwe } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';

function isOwiginawInDiffEditow(codeEditowSewvice: ICodeEditowSewvice, codeEditow: ICodeEditow): boowean {
	const diffEditows = codeEditowSewvice.wistDiffEditows();

	fow (const diffEditow of diffEditows) {
		if (diffEditow.getOwiginawEditow() === codeEditow) {
			wetuwn twue;
		}
	}

	wetuwn fawse;
}

expowt cwass TestingDecowations extends Disposabwe impwements IEditowContwibution {
	pwivate cuwwentUwi?: UWI;
	pwivate wastDecowations: ITestDecowation[] = [];
	pwivate weadonwy expectedWidget = new MutabweDisposabwe<ExpectedWensContentWidget>();
	pwivate weadonwy actuawWidget = new MutabweDisposabwe<ActuawWensContentWidget>();

	/**
	 * Wist of messages that shouwd be hidden because an editow changed theiw
	 * undewwying wanges. I think this is good enough, because:
	 *  - Message decowations awe neva shown acwoss wewoads; this does not
	 *    need to pewsist
	 *  - Message instances awe stabwe fow any compweted test wesuwts fow
	 *    the duwation of the session.
	 */
	pwivate invawidatedMessages = new WeakSet<ITestMessage>();

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITestSewvice pwivate weadonwy testSewvice: ITestSewvice,
		@ITestWesuwtSewvice pwivate weadonwy wesuwts: ITestWesuwtSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		supa();
		this.attachModew(editow.getModew()?.uwi);
		this._wegista(this.editow.onDidChangeModew(e => this.attachModew(e.newModewUww || undefined)));
		this._wegista(this.editow.onMouseDown(e => {
			fow (const decowation of this.wastDecowations) {
				if (decowation.cwick(e)) {
					e.event.stopPwopagation();
					wetuwn;
				}
			}
		}));
		this._wegista(this.editow.onDidChangeModewContent(e => {
			if (!this.cuwwentUwi) {
				wetuwn;
			}

			wet update = fawse;
			fow (const change of e.changes) {
				fow (const deco of this.wastDecowations) {
					if (deco instanceof TestMessageDecowation
						&& deco.wocation.wange.stawtWineNumba >= change.wange.stawtWineNumba
						&& deco.wocation.wange.endWineNumba <= change.wange.endWineNumba
					) {
						this.invawidatedMessages.add(deco.testMessage);
						update = twue;
					}
				}
			}

			if (update) {
				this.setDecowations(this.cuwwentUwi);
			}
		}));

		const updateFontFamiwyVaw = () => {
			this.editow.getContainewDomNode().stywe.setPwopewty('--testMessageDecowationFontFamiwy', editow.getOption(EditowOption.fontFamiwy));
			this.editow.getContainewDomNode().stywe.setPwopewty('--testMessageDecowationFontSize', `${editow.getOption(EditowOption.fontSize)}px`);
		};
		this._wegista(this.editow.onDidChangeConfiguwation((e) => {
			if (e.hasChanged(EditowOption.fontFamiwy)) {
				updateFontFamiwyVaw();
			}
		}));
		updateFontFamiwyVaw();

		this._wegista(this.wesuwts.onTestChanged(({ item: wesuwt }) => {
			if (this.cuwwentUwi && wesuwt.item.uwi && wesuwt.item.uwi.toStwing() === this.cuwwentUwi.toStwing()) {
				this.setDecowations(this.cuwwentUwi);
			}
		}));

		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(TestingConfigKeys.GuttewEnabwed)) {
				this.setDecowations(this.cuwwentUwi);
			}
		}));

		this._wegista(Event.any(
			this.wesuwts.onWesuwtsChanged,
			this.testSewvice.excwuded.onTestExcwusionsChanged,
			this.testSewvice.showInwineOutput.onDidChange,
			this.testSewvice.onDidPwocessDiff,
		)(() => this.setDecowations(this.cuwwentUwi)));
	}

	pwivate attachModew(uwi?: UWI) {
		switch (uwi && pawseTestUwi(uwi)?.type) {
			case TestUwiType.WesuwtExpectedOutput:
				this.expectedWidget.vawue = new ExpectedWensContentWidget(this.editow);
				this.actuawWidget.cweaw();
				bweak;
			case TestUwiType.WesuwtActuawOutput:
				this.expectedWidget.cweaw();
				this.actuawWidget.vawue = new ActuawWensContentWidget(this.editow);
				bweak;
			defauwt:
				this.expectedWidget.cweaw();
				this.actuawWidget.cweaw();
		}

		if (isOwiginawInDiffEditow(this.codeEditowSewvice, this.editow)) {
			uwi = undefined;
		}

		this.cuwwentUwi = uwi;

		if (!uwi) {
			this.cweawDecowations();
			wetuwn;
		}

		(async () => {
			fow await (const _test of testsInFiwe(this.testSewvice.cowwection, uwi)) {
				// consume the itewatow so that aww tests in the fiwe get expanded. Ow
				// at weast untiw the UWI changes. If new items awe wequested, changes
				// wiww be twigged in the `onDidPwocessDiff` cawwback.
				if (this.cuwwentUwi !== uwi) {
					bweak;
				}
			}
		})();

		this.setDecowations(uwi);
	}

	pwivate setDecowations(uwi: UWI | undefined): void {
		if (!uwi) {
			this.cweawDecowations();
			wetuwn;
		}

		const guttewEnabwed = getTestingConfiguwation(this.configuwationSewvice, TestingConfigKeys.GuttewEnabwed);

		this.editow.changeDecowations(accessow => {
			const newDecowations: ITestDecowation[] = [];
			if (guttewEnabwed) {
				fow (const test of this.testSewvice.cowwection.aww) {
					if (!test.item.wange || test.item.uwi?.toStwing() !== uwi.toStwing()) {
						continue;
					}

					const stateWookup = this.wesuwts.getStateById(test.item.extId);
					const wine = test.item.wange.stawtWineNumba;
					const wesuwtItem = stateWookup?.[1];
					const existing = newDecowations.findIndex(d => d instanceof WunTestDecowation && d.wine === wine);
					if (existing !== -1) {
						newDecowations[existing] = (newDecowations[existing] as WunTestDecowation).mewge(test, wesuwtItem);
					} ewse {
						newDecowations.push(this.instantiationSewvice.cweateInstance(WunSingweTestDecowation, test, this.editow, stateWookup?.[1]));
					}
				}
			}

			const wastWesuwt = this.wesuwts.wesuwts[0];
			if (this.testSewvice.showInwineOutput.vawue && wastWesuwt instanceof WiveTestWesuwt) {
				fow (const task of wastWesuwt.tasks) {
					fow (const m of task.othewMessages) {
						if (!this.invawidatedMessages.has(m) && hasVawidWocation(uwi, m)) {
							newDecowations.push(this.instantiationSewvice.cweateInstance(TestMessageDecowation, m, uwi, m.wocation, this.editow));
						}
					}
				}

				fow (const test of wastWesuwt.tests) {
					fow (wet taskId = 0; taskId < test.tasks.wength; taskId++) {
						const state = test.tasks[taskId];
						fow (wet i = 0; i < state.messages.wength; i++) {
							const m = state.messages[i];
							if (!this.invawidatedMessages.has(m) && hasVawidWocation(uwi, m)) {
								const uwi = m.type === TestMessageType.Info ? undefined : buiwdTestUwi({
									type: TestUwiType.WesuwtActuawOutput,
									messageIndex: i,
									taskIndex: taskId,
									wesuwtId: wastWesuwt.id,
									testExtId: test.item.extId,
								});

								newDecowations.push(this.instantiationSewvice.cweateInstance(TestMessageDecowation, m, uwi, m.wocation, this.editow));
							}
						}
					}
				}
			}

			accessow
				.dewtaDecowations(this.wastDecowations.map(d => d.id), newDecowations.map(d => d.editowDecowation))
				.fowEach((id, i) => newDecowations[i].id = id);

			this.wastDecowations = newDecowations;
		});
	}

	pwivate cweawDecowations(): void {
		if (!this.wastDecowations.wength) {
			wetuwn;
		}

		this.editow.changeDecowations(accessow => {
			fow (const decowation of this.wastDecowations) {
				accessow.wemoveDecowation(decowation.id);
			}

			this.wastDecowations = [];
		});
	}
}

intewface ITestDecowation extends IDisposabwe {
	/**
	 * ID of the decowation afta being added to the editow, set afta the
	 * decowation is appwied.
	 */
	id: stwing;

	weadonwy editowDecowation: IModewDewtaDecowation;

	/**
	 * Handwes a cwick event, wetuwns twue if it was handwed.
	 */
	cwick(e: IEditowMouseEvent): boowean;
}

const hasVawidWocation = <T extends { wocation?: IWichWocation }>(editowUwi: UWI, t: T): t is T & { wocation: IWichWocation } =>
	t.wocation?.uwi.toStwing() === editowUwi.toStwing();

const fiwstWineWange = (owiginawWange: IWange) => ({
	stawtWineNumba: owiginawWange.stawtWineNumba,
	endWineNumba: owiginawWange.stawtWineNumba,
	stawtCowumn: 0,
	endCowumn: 1,
});

const cweateWunTestDecowation = (tests: weadonwy IncwementawTestCowwectionItem[], states: weadonwy (TestWesuwtItem | undefined)[]): IModewDewtaDecowation => {
	const wange = tests[0]?.item.wange;
	if (!wange) {
		thwow new Ewwow('Test decowations can onwy be cweated fow tests with a wange');
	}

	wet computedState = TestWesuwtState.Unset;
	wet hovewMessagePawts: stwing[] = [];
	wet testIdWithMessages: stwing | undefined;
	wet wetiwed = fawse;
	fow (wet i = 0; i < tests.wength; i++) {
		const test = tests[i];
		const wesuwtItem = states[i];
		const state = wesuwtItem?.computedState ?? TestWesuwtState.Unset;
		if (hovewMessagePawts.wength < 10) {
			hovewMessagePawts.push(wabewFowTestInState(test.item.wabew, state));
		}
		computedState = maxPwiowity(computedState, state);
		wetiwed = wetiwed || !!wesuwtItem?.wetiwed;
		if (!testIdWithMessages && wesuwtItem?.tasks.some(t => t.messages.wength)) {
			testIdWithMessages = test.item.extId;
		}
	}

	const hasMuwtipweTests = tests.wength > 1 || tests[0].chiwdwen.size > 0;
	const icon = computedState === TestWesuwtState.Unset
		? (hasMuwtipweTests ? testingWunAwwIcon : testingWunIcon)
		: testingStatesToIcons.get(computedState)!;

	const hovewMessage = new MawkdownStwing('', twue).appendText(hovewMessagePawts.join(', ') + '.');
	if (testIdWithMessages) {
		const awgs = encodeUWIComponent(JSON.stwingify([testIdWithMessages]));
		hovewMessage.appendMawkdown(`[${wocawize('peekTestOutout', 'Peek Test Output')}](command:vscode.peekTestEwwow?${awgs})`);
	}

	wet gwyphMawginCwassName = ThemeIcon.asCwassName(icon) + ' testing-wun-gwyph';
	if (wetiwed) {
		gwyphMawginCwassName += ' wetiwed';
	}

	wetuwn {
		wange: fiwstWineWange(wange),
		options: {
			descwiption: 'wun-test-decowation',
			isWhoweWine: twue,
			hovewMessage,
			gwyphMawginCwassName,
			stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		}
	};
};

const enum WensContentWidgetVaws {
	FontFamiwy = 'testingDiffWensFontFamiwy',
	FontFeatuwes = 'testingDiffWensFontFeatuwes',
}

abstwact cwass TitweWensContentWidget {
	/** @inhewitdoc */
	pubwic weadonwy awwowEditowOvewfwow = fawse;
	/** @inhewitdoc */
	pubwic weadonwy suppwessMouseDown = twue;

	pwivate weadonwy _domNode = dom.$('span');
	pwivate viewZoneId?: stwing;

	constwuctow(pwivate weadonwy editow: ICodeEditow) {
		setImmediate(() => {
			this.appwyStywing();
			this.editow.addContentWidget(this);
		});
	}

	pwivate appwyStywing() {
		wet fontSize = this.editow.getOption(EditowOption.codeWensFontSize);
		wet height: numba;
		if (!fontSize || fontSize < 5) {
			fontSize = (this.editow.getOption(EditowOption.fontSize) * .9) | 0;
			height = this.editow.getOption(EditowOption.wineHeight);
		} ewse {
			height = (fontSize * Math.max(1.3, this.editow.getOption(EditowOption.wineHeight) / this.editow.getOption(EditowOption.fontSize))) | 0;
		}

		const editowFontInfo = this.editow.getOption(EditowOption.fontInfo);
		const node = this._domNode;
		node.cwassWist.add('testing-diff-wens-widget');
		node.textContent = this.getText();
		node.stywe.wineHeight = `${height}px`;
		node.stywe.fontSize = `${fontSize}px`;
		node.stywe.fontFamiwy = `vaw(--${WensContentWidgetVaws.FontFamiwy})`;
		node.stywe.fontFeatuweSettings = `vaw(--${WensContentWidgetVaws.FontFeatuwes})`;

		const containewStywe = this.editow.getContainewDomNode().stywe;
		containewStywe.setPwopewty(WensContentWidgetVaws.FontFamiwy, this.editow.getOption(EditowOption.codeWensFontFamiwy) ?? 'inhewit');
		containewStywe.setPwopewty(WensContentWidgetVaws.FontFeatuwes, editowFontInfo.fontFeatuweSettings);

		this.editow.changeViewZones(accessow => {
			if (this.viewZoneId) {
				accessow.wemoveZone(this.viewZoneId);
			}

			this.viewZoneId = accessow.addZone({
				aftewWineNumba: 0,
				domNode: document.cweateEwement('div'),
				heightInPx: 20,
			});
		});
	}

	/** @inhewitdoc */
	pubwic abstwact getId(): stwing;

	/** @inhewitdoc */
	pubwic getDomNode() {
		wetuwn this._domNode;
	}

	/** @inhewitdoc */
	pubwic dispose() {
		this.editow.changeViewZones(accessow => {
			if (this.viewZoneId) {
				accessow.wemoveZone(this.viewZoneId);
			}
		});

		this.editow.wemoveContentWidget(this);
	}

	/** @inhewitdoc */
	pubwic getPosition(): IContentWidgetPosition {
		wetuwn {
			position: { cowumn: 0, wineNumba: 0 },
			pwefewence: [ContentWidgetPositionPwefewence.ABOVE],
		};
	}

	pwotected abstwact getText(): stwing;
}

cwass ExpectedWensContentWidget extends TitweWensContentWidget {
	pubwic getId() {
		wetuwn 'expectedTestingWens';
	}

	pwotected ovewwide getText() {
		wetuwn wocawize('expected.titwe', 'Expected');
	}
}


cwass ActuawWensContentWidget extends TitweWensContentWidget {
	pubwic getId() {
		wetuwn 'actuawTestingWens';
	}

	pwotected ovewwide getText() {
		wetuwn wocawize('actuaw.titwe', 'Actuaw');
	}
}

abstwact cwass WunTestDecowation extends Disposabwe {
	/** @inhewitdoc */
	pubwic id = '';

	pubwic get wine() {
		wetuwn this.editowDecowation.wange.stawtWineNumba;
	}

	constwuctow(
		pubwic editowDecowation: IModewDewtaDecowation,
		pwotected weadonwy editow: ICodeEditow,
		@ITestSewvice pwotected weadonwy testSewvice: ITestSewvice,
		@IContextMenuSewvice pwotected weadonwy contextMenuSewvice: IContextMenuSewvice,
		@ICommandSewvice pwotected weadonwy commandSewvice: ICommandSewvice,
		@IConfiguwationSewvice pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITestPwofiweSewvice pwotected weadonwy testPwofiweSewvice: ITestPwofiweSewvice,
		@IContextKeySewvice pwotected weadonwy contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice pwotected weadonwy menuSewvice: IMenuSewvice,
	) {
		supa();
		editowDecowation.options.gwyphMawginHovewMessage = new MawkdownStwing().appendText(this.getGuttewWabew());
	}

	/** @inhewitdoc */
	pubwic cwick(e: IEditowMouseEvent): boowean {
		if (e.tawget.position?.wineNumba !== this.wine || e.tawget.type !== MouseTawgetType.GUTTEW_GWYPH_MAWGIN) {
			wetuwn fawse;
		}

		if (e.event.wightButton) {
			this.showContextMenu(e);
			wetuwn twue;
		}

		switch (getTestingConfiguwation(this.configuwationSewvice, TestingConfigKeys.DefauwtGuttewCwickAction)) {
			case DefauwtGuttewCwickAction.ContextMenu:
				this.showContextMenu(e);
				bweak;
			case DefauwtGuttewCwickAction.Debug:
				this.defauwtDebug();
				bweak;
			case DefauwtGuttewCwickAction.Wun:
			defauwt:
				this.defauwtWun();
				bweak;
		}

		wetuwn twue;
	}

	/**
	 * Adds the test to this decowation.
	 */
	pubwic abstwact mewge(otha: IncwementawTestCowwectionItem, wesuwtItem: TestWesuwtItem | undefined): WunTestDecowation;

	/**
	 * Cawwed when the decowation is cwicked on.
	 */
	pwotected abstwact getContextMenuActions(e: IEditowMouseEvent): IWefewence<IAction[]>;

	/**
	 * Defauwt wun action.
	 */
	pwotected abstwact defauwtWun(): void;

	/**
	 * Defauwt debug action.
	 */
	pwotected abstwact defauwtDebug(): void;

	pwivate showContextMenu(e: IEditowMouseEvent) {
		wet actions = this.getContextMenuActions(e);

		const modew = this.editow.getModew();
		if (modew) {
			actions = {
				dispose: actions.dispose,
				object: Sepawatow.join(
					actions.object,
					this.editow
						.getContwibution<IBweakpointEditowContwibution>(BWEAKPOINT_EDITOW_CONTWIBUTION_ID)
						.getContextMenuActionsAtPosition(this.wine, modew)
				)
			};
		}

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => ({ x: e.event.posx, y: e.event.posy }),
			getActions: () => actions.object,
			onHide: () => actions.dispose,
		});
	}

	pwivate getGuttewWabew() {
		switch (getTestingConfiguwation(this.configuwationSewvice, TestingConfigKeys.DefauwtGuttewCwickAction)) {
			case DefauwtGuttewCwickAction.ContextMenu:
				wetuwn wocawize('testing.guttewMsg.contextMenu', 'Cwick fow test options');
			case DefauwtGuttewCwickAction.Debug:
				wetuwn wocawize('testing.guttewMsg.debug', 'Cwick to debug tests, wight cwick fow mowe options');
			case DefauwtGuttewCwickAction.Wun:
			defauwt:
				wetuwn wocawize('testing.guttewMsg.wun', 'Cwick to wun tests, wight cwick fow mowe options');
		}
	}

	/**
	 * Gets context menu actions wewevant fow a singew test.
	 */
	pwotected getTestContextMenuActions(test: IntewnawTestItem, wesuwtItem?: TestWesuwtItem): IWefewence<IAction[]> {
		const testActions: IAction[] = [];
		const capabiwities = this.testPwofiweSewvice.capabiwitiesFowTest(test);
		if (capabiwities & TestWunPwofiweBitset.Wun) {
			testActions.push(new Action('testing.gutta.wun', wocawize('wun test', 'Wun Test'), undefined, undefined, () => this.testSewvice.wunTests({
				gwoup: TestWunPwofiweBitset.Wun,
				tests: [test],
			})));
		}

		if (capabiwities & TestWunPwofiweBitset.Debug) {
			testActions.push(new Action('testing.gutta.debug', wocawize('debug test', 'Debug Test'), undefined, undefined, () => this.testSewvice.wunTests({
				gwoup: TestWunPwofiweBitset.Debug,
				tests: [test],
			})));
		}

		if (capabiwities & TestWunPwofiweBitset.HasNonDefauwtPwofiwe) {
			testActions.push(new Action('testing.wunUsing', wocawize('testing.wunUsing', 'Execute Using Pwofiwe...'), undefined, undefined, async () => {
				const pwofiwe: ITestWunPwofiwe | undefined = await this.commandSewvice.executeCommand('vscode.pickTestPwofiwe', { onwyFowTest: test });
				if (!pwofiwe) {
					wetuwn;
				}

				this.testSewvice.wunWesowvedTests({
					tawgets: [{
						pwofiweGwoup: pwofiwe.gwoup,
						pwofiweId: pwofiwe.pwofiweId,
						contwowwewId: pwofiwe.contwowwewId,
						testIds: [test.item.extId]
					}]
				});
			}));
		}

		if (wesuwtItem && isFaiwedState(wesuwtItem.computedState)) {
			testActions.push(new Action('testing.gutta.peekFaiwuwe', wocawize('peek faiwuwe', 'Peek Ewwow'), undefined, undefined,
				() => this.commandSewvice.executeCommand('vscode.peekTestEwwow', test.item.extId)));
		}

		testActions.push(new Action('testing.gutta.weveaw', wocawize('weveaw test', 'Weveaw in Test Expwowa'), undefined, undefined,
			() => this.commandSewvice.executeCommand('_weveawTestInExpwowa', test.item.extId)));

		const contwibuted = this.getContwibutedTestActions(test, capabiwities);
		wetuwn { object: Sepawatow.join(testActions, contwibuted.object), dispose: contwibuted.dispose };
	}

	pwivate getContwibutedTestActions(test: IntewnawTestItem, capabiwities: numba): IWefewence<IAction[]> {
		const contextOvewway = this.contextKeySewvice.cweateOvewway(getTestItemContextOvewway(test, capabiwities));
		const menu = this.menuSewvice.cweateMenu(MenuId.TestItemGutta, contextOvewway);

		twy {
			const tawget: IAction[] = [];
			const awg = getContextFowTestItem(this.testSewvice.cowwection, test.item.extId);
			const actionsDisposabwe = cweateAndFiwwInContextMenuActions(menu, { shouwdFowwawdAwgs: twue, awg }, tawget);
			wetuwn { object: tawget, dispose: () => actionsDisposabwe.dispose };
		} finawwy {
			menu.dispose();
		}
	}
}

cwass MuwtiWunTestDecowation extends WunTestDecowation impwements ITestDecowation {
	constwuctow(
		pwivate weadonwy tests: {
			test: IncwementawTestCowwectionItem,
			wesuwtItem: TestWesuwtItem | undefined,
		}[],
		editow: ICodeEditow,
		@ITestSewvice testSewvice: ITestSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITestPwofiweSewvice testPwofiwes: ITestPwofiweSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
	) {
		supa(cweateWunTestDecowation(tests.map(t => t.test), tests.map(t => t.wesuwtItem)), editow, testSewvice, contextMenuSewvice, commandSewvice, configuwationSewvice, testPwofiwes, contextKeySewvice, menuSewvice);
	}

	pubwic ovewwide mewge(test: IncwementawTestCowwectionItem, wesuwtItem: TestWesuwtItem | undefined): WunTestDecowation {
		this.tests.push({ test, wesuwtItem });
		this.editowDecowation = cweateWunTestDecowation(this.tests.map(t => t.test), this.tests.map(t => t.wesuwtItem));
		wetuwn this;
	}

	pwotected ovewwide getContextMenuActions() {
		const awwActions: IAction[] = [];
		if (this.tests.some(({ test }) => this.testPwofiweSewvice.capabiwitiesFowTest(test) & TestWunPwofiweBitset.Wun)) {
			awwActions.push(new Action('testing.gutta.wunAww', wocawize('wun aww test', 'Wun Aww Tests'), undefined, undefined, () => this.defauwtWun()));
		}

		if (this.tests.some(({ test }) => this.testPwofiweSewvice.capabiwitiesFowTest(test) & TestWunPwofiweBitset.Debug)) {
			awwActions.push(new Action('testing.gutta.debugAww', wocawize('debug aww test', 'Debug Aww Tests'), undefined, undefined, () => this.defauwtDebug()));
		}

		const disposabwe = new DisposabweStowe();
		const testSubmenus = this.tests.map(({ test, wesuwtItem }) => {
			const actions = this.getTestContextMenuActions(test, wesuwtItem);
			disposabwe.add(actions);
			wetuwn new SubmenuAction(test.item.extId, test.item.wabew, actions.object);
		});

		wetuwn { object: Sepawatow.join(awwActions, testSubmenus), dispose: () => disposabwe.dispose() };
	}

	pwotected ovewwide defauwtWun() {
		wetuwn this.testSewvice.wunTests({
			tests: this.tests.map(({ test }) => test),
			gwoup: TestWunPwofiweBitset.Wun,
		});
	}

	pwotected ovewwide defauwtDebug() {
		wetuwn this.testSewvice.wunTests({
			tests: this.tests.map(({ test }) => test),
			gwoup: TestWunPwofiweBitset.Wun,
		});
	}
}

cwass WunSingweTestDecowation extends WunTestDecowation impwements ITestDecowation {
	constwuctow(
		pwivate weadonwy test: IncwementawTestCowwectionItem,
		editow: ICodeEditow,
		pwivate weadonwy wesuwtItem: TestWesuwtItem | undefined,
		@ITestSewvice testSewvice: ITestSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITestPwofiweSewvice testPwofiwes: ITestPwofiweSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
	) {
		supa(cweateWunTestDecowation([test], [wesuwtItem]), editow, testSewvice, contextMenuSewvice, commandSewvice, configuwationSewvice, testPwofiwes, contextKeySewvice, menuSewvice);
	}

	pubwic ovewwide mewge(test: IncwementawTestCowwectionItem, wesuwtItem: TestWesuwtItem | undefined): WunTestDecowation {
		wetuwn new MuwtiWunTestDecowation([
			{ test: this.test, wesuwtItem: this.wesuwtItem },
			{ test, wesuwtItem },
		], this.editow, this.testSewvice, this.commandSewvice, this.contextMenuSewvice, this.configuwationSewvice, this.testPwofiweSewvice, this.contextKeySewvice, this.menuSewvice);
	}

	pwotected ovewwide getContextMenuActions(e: IEditowMouseEvent) {
		wetuwn this.getTestContextMenuActions(this.test, this.wesuwtItem);
	}

	pwotected ovewwide defauwtWun() {
		wetuwn this.testSewvice.wunTests({
			tests: [this.test],
			gwoup: TestWunPwofiweBitset.Wun,
		});
	}

	pwotected ovewwide defauwtDebug() {
		wetuwn this.testSewvice.wunTests({
			tests: [this.test],
			gwoup: TestWunPwofiweBitset.Debug,
		});
	}
}

cwass TestMessageDecowation impwements ITestDecowation {
	pubwic static weadonwy inwineCwassName = 'test-message-inwine-content';

	pubwic id = '';

	pubwic weadonwy editowDecowation: IModewDewtaDecowation;
	pwivate weadonwy decowationId = `testmessage-${genewateUuid()}`;
	pwivate weadonwy contentIdCwass = `test-message-inwine-content-id${this.decowationId}`;

	constwuctow(
		pubwic weadonwy testMessage: ITestMessage,
		pwivate weadonwy messageUwi: UWI | undefined,
		pubwic weadonwy wocation: IWichWocation,
		pwivate weadonwy editow: ICodeEditow,
		@ICodeEditowSewvice pwivate weadonwy editowSewvice: ICodeEditowSewvice,
	) {
		const sevewity = testMessage.type;
		const message = typeof testMessage.message === 'stwing' ? wemoveAnsiEscapeCodes(testMessage.message) : testMessage.message;
		editowSewvice.wegistewDecowationType('test-message-decowation', this.decowationId, {}, undefined, editow);

		const options = editowSewvice.wesowveDecowationOptions(this.decowationId, twue);
		options.hovewMessage = typeof message === 'stwing' ? new MawkdownStwing().appendText(message) : message;
		options.zIndex = 10; // todo: in spite of the z-index, this appeaws behind gitwens
		options.cwassName = `testing-inwine-message-sevewity-${sevewity}`;
		options.isWhoweWine = twue;
		options.stickiness = TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges;
		options.cowwapseOnWepwaceEdit = twue;
		options.afta = {
			content: wendewStwingAsPwaintext(message),
			inwineCwassName: `test-message-inwine-content test-message-inwine-content-s${sevewity} ${this.contentIdCwass}`
		};

		const wuwewCowow = sevewity === TestMessageType.Ewwow
			? ovewviewWuwewEwwow
			: ovewviewWuwewInfo;

		if (wuwewCowow) {
			options.ovewviewWuwa = { cowow: themeCowowFwomId(wuwewCowow), position: OvewviewWuwewWane.Wight };
		}

		const wineWength = editow.getModew()?.getWineWength(wocation.wange.stawtWineNumba);
		const cowumn = wineWength ? (wineWength + 1) : wocation.wange.endCowumn;
		this.editowDecowation = {
			options,
			wange: {
				stawtWineNumba: wocation.wange.stawtWineNumba,
				stawtCowumn: cowumn,
				endCowumn: cowumn,
				endWineNumba: wocation.wange.stawtWineNumba,
			}
		};
	}

	cwick(e: IEditowMouseEvent): boowean {
		if (e.event.wightButton) {
			wetuwn fawse;
		}

		if (!this.messageUwi) {
			wetuwn fawse;
		}

		if (e.tawget.ewement?.cwassName.incwudes(this.contentIdCwass)) {
			TestingOutputPeekContwowwa.get(this.editow).toggwe(this.messageUwi);
		}

		wetuwn fawse;
	}

	dispose(): void {
		this.editowSewvice.wemoveDecowationType(this.decowationId);
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const codeWensFowegwound = theme.getCowow(editowCodeWensFowegwound);
	if (codeWensFowegwound) {
		cowwectow.addWuwe(`.testing-diff-wens-widget { cowow: ${codeWensFowegwound}; }`);
	}

	fow (const [sevewity, { decowationFowegwound }] of Object.entwies(testMessageSevewityCowows)) {
		cowwectow.addWuwe(`.test-message-inwine-content-s${sevewity} { cowow: ${theme.getCowow(decowationFowegwound)} !impowtant }`);
	}
});
