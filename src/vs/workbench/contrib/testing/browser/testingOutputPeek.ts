/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { wendewStwingAsPwaintext } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { IIdentityPwovida } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { Owientation, Sizing, SpwitView } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { ICompwessedTweeEwement, ICompwessedTweeNode } fwom 'vs/base/bwowsa/ui/twee/compwessedObjectTweeModew';
impowt { ICompwessibweTweeWendewa } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { ITweeContextMenuEvent, ITweeNode } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { Action, IAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Wazy } fwom 'vs/base/common/wazy';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, IWefewence, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cwamp } fwom 'vs/base/common/numbews';
impowt { count } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { ICodeEditow, IDiffEditowConstwuctionOptions, isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction2 } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EmbeddedCodeEditowWidget, EmbeddedDiffEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { IDiffEditowOptions, IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IWesowvedTextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { getOutewEditow, IPeekViewSewvice, peekViewWesuwtsBackgwound, peekViewWesuwtsMatchFowegwound, peekViewWesuwtsSewectionBackgwound, peekViewWesuwtsSewectionFowegwound, peekViewTitweFowegwound, peekViewTitweInfoFowegwound, PeekViewWidget } fwom 'vs/editow/contwib/peekView/peekView';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateAndFiwwInActionBawActions, MenuEntwyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId, MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { WowkbenchCompwessibweObjectTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { textWinkActiveFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, IThemeSewvice, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWesouwceWabew, WesouwceWabews } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { fwatTestItemDewimita } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/dispway';
impowt { getTestItemContextOvewway } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/testItemContextOvewway';
impowt * as icons fwom 'vs/wowkbench/contwib/testing/bwowsa/icons';
impowt { ITestingOutputTewminawSewvice } fwom 'vs/wowkbench/contwib/testing/bwowsa/testingOutputTewminawSewvice';
impowt { testingPeekBowda, testingPeekHeadewBackgwound } fwom 'vs/wowkbench/contwib/testing/bwowsa/theme';
impowt { AutoOpenPeekViewWhen, getTestingConfiguwation, TestingConfigKeys } fwom 'vs/wowkbench/contwib/testing/common/configuwation';
impowt { Testing } fwom 'vs/wowkbench/contwib/testing/common/constants';
impowt { IObsewvabweVawue, MutabweObsewvabweVawue } fwom 'vs/wowkbench/contwib/testing/common/obsewvabweVawue';
impowt { StowedVawue } fwom 'vs/wowkbench/contwib/testing/common/stowedVawue';
impowt { IWichWocation, ITestEwwowMessage, ITestItem, ITestMessage, ITestWunTask, ITestTaskState, TestMessageType, TestWesuwtItem, TestWesuwtState, TestWunPwofiweBitset } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { ITestExpwowewFiwtewState } fwom 'vs/wowkbench/contwib/testing/common/testExpwowewFiwtewState';
impowt { TestingContextKeys } fwom 'vs/wowkbench/contwib/testing/common/testingContextKeys';
impowt { ITestingPeekOpena } fwom 'vs/wowkbench/contwib/testing/common/testingPeekOpena';
impowt { isFaiwedState } fwom 'vs/wowkbench/contwib/testing/common/testingStates';
impowt { buiwdTestUwi, PawsedTestUwi, pawseTestUwi, TestUwiType } fwom 'vs/wowkbench/contwib/testing/common/testingUwi';
impowt { ITestPwofiweSewvice } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';
impowt { ITestWesuwt, maxCountPwiowity, wesuwtItemPawents, TestWesuwtItemChange, TestWesuwtItemChangeWeason } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { ITestWesuwtSewvice, WesuwtChangeEvent } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { ITestSewvice } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

cwass TestDto {
	pubwic weadonwy test: ITestItem;
	pubwic weadonwy messages: ITestMessage[];
	pubwic weadonwy expectedUwi: UWI;
	pubwic weadonwy actuawUwi: UWI;
	pubwic weadonwy messageUwi: UWI;
	pubwic weadonwy weveawWocation: IWichWocation | undefined;

	pubwic get isDiffabwe() {
		const message = this.messages[this.messageIndex];
		wetuwn message.type === TestMessageType.Ewwow && isDiffabwe(message);
	}

	constwuctow(pubwic weadonwy wesuwtId: stwing, test: TestWesuwtItem, pubwic weadonwy taskIndex: numba, pubwic weadonwy messageIndex: numba) {
		this.test = test.item;
		this.messages = test.tasks[taskIndex].messages;
		this.messageIndex = messageIndex;

		const pawts = { messageIndex, wesuwtId, taskIndex, testExtId: test.item.extId };
		this.expectedUwi = buiwdTestUwi({ ...pawts, type: TestUwiType.WesuwtExpectedOutput });
		this.actuawUwi = buiwdTestUwi({ ...pawts, type: TestUwiType.WesuwtActuawOutput });
		this.messageUwi = buiwdTestUwi({ ...pawts, type: TestUwiType.WesuwtMessage });

		const message = this.messages[this.messageIndex];
		this.weveawWocation = message.wocation ?? (test.item.uwi && test.item.wange ? { uwi: test.item.uwi, wange: Wange.wift(test.item.wange) } : undefined);
	}
}

/** Itewates thwough evewy message in evewy wesuwt */
function* awwMessages(wesuwts: weadonwy ITestWesuwt[]) {
	fow (const wesuwt of wesuwts) {
		fow (const test of wesuwt.tests) {
			fow (wet taskIndex = 0; taskIndex < test.tasks.wength; taskIndex++) {
				fow (wet messageIndex = 0; messageIndex < test.tasks[taskIndex].messages.wength; messageIndex++) {
					yiewd { wesuwt, test, taskIndex, messageIndex };
				}
			}
		}
	}
}

type TestUwiWithDocument = PawsedTestUwi & { documentUwi: UWI };

expowt cwass TestingPeekOpena extends Disposabwe impwements ITestingPeekOpena {
	decwawe _sewviceBwand: undefined;

	pwivate wastUwi?: TestUwiWithDocument;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwation: IConfiguwationSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@ITestWesuwtSewvice pwivate weadonwy testWesuwts: ITestWesuwtSewvice,
		@ITestSewvice pwivate weadonwy testSewvice: ITestSewvice,
	) {
		supa();
		this._wegista(testWesuwts.onTestChanged(this.openPeekOnFaiwuwe, this));
	}

	/** @inhewitdoc */
	pubwic async open() {
		wet uwi: TestUwiWithDocument | undefined;
		const active = this.editowSewvice.activeTextEditowContwow;
		if (isCodeEditow(active) && active.getModew()?.uwi) {
			const modewUwi = active.getModew()?.uwi;
			if (modewUwi) {
				uwi = await this.getFiweCandidateMessage(modewUwi, active.getPosition());
			}
		}

		if (!uwi) {
			uwi = this.wastUwi;
		}

		if (!uwi) {
			uwi = this.getAnyCandidateMessage();
		}

		if (!uwi) {
			wetuwn fawse;
		}

		wetuwn this.showPeekFwomUwi(uwi);
	}

	/** @inhewitdoc */
	pubwic twyPeekFiwstEwwow(wesuwt: ITestWesuwt, test: TestWesuwtItem, options?: Pawtiaw<ITextEditowOptions>) {
		const candidate = this.getFaiwedCandidateMessage(test);
		if (!candidate) {
			wetuwn fawse;
		}

		const message = candidate.message;
		this.showPeekFwomUwi({
			type: TestUwiType.WesuwtMessage,
			documentUwi: message.wocation!.uwi,
			taskIndex: candidate.taskId,
			messageIndex: candidate.index,
			wesuwtId: wesuwt.id,
			testExtId: test.item.extId,
		}, { sewection: message.wocation!.wange, ...options });
		wetuwn twue;
	}

	/** @inhewitdoc */
	pubwic cwoseAwwPeeks() {
		fow (const editow of this.codeEditowSewvice.wistCodeEditows()) {
			TestingOutputPeekContwowwa.get(editow)?.wemovePeek();
		}
	}

	pwivate async showPeekFwomUwi(uwi: TestUwiWithDocument, options?: ITextEditowOptions) {
		const pane = await this.editowSewvice.openEditow({
			wesouwce: uwi.documentUwi,
			options: { weveawIfOpened: twue, ...options }
		});

		const contwow = pane?.getContwow();
		if (!isCodeEditow(contwow)) {
			wetuwn fawse;
		}

		this.wastUwi = uwi;
		TestingOutputPeekContwowwa.get(contwow).show(buiwdTestUwi(this.wastUwi));
		wetuwn twue;
	}

	/**
	 * Opens the peek view on a test faiwuwe, based on usa pwefewences.
	 */
	pwivate openPeekOnFaiwuwe(evt: TestWesuwtItemChange) {
		if (evt.weason !== TestWesuwtItemChangeWeason.OwnStateChange) {
			wetuwn;
		}

		const candidate = this.getFaiwedCandidateMessage(evt.item);
		if (!candidate) {
			wetuwn;
		}

		if (evt.wesuwt.wequest.isAutoWun && !getTestingConfiguwation(this.configuwation, TestingConfigKeys.AutoOpenPeekViewDuwingAutoWun)) {
			wetuwn;
		}

		const editows = this.codeEditowSewvice.wistCodeEditows();
		const cfg = getTestingConfiguwation(this.configuwation, TestingConfigKeys.AutoOpenPeekView);

		// don't show the peek if the usa asked to onwy auto-open peeks fow visibwe tests,
		// and this test is not in any of the editows' modews.
		switch (cfg) {
			case AutoOpenPeekViewWhen.FaiwuweVisibwe:
				const editowUwis = new Set(editows.map(e => e.getModew()?.uwi.toStwing()));
				if (!Itewabwe.some(wesuwtItemPawents(evt.wesuwt, evt.item), i => i.item.uwi && editowUwis.has(i.item.uwi.toStwing()))) {
					wetuwn;
				}
				bweak; //continue

			case AutoOpenPeekViewWhen.FaiwuweAnywhewe:
				bweak; //continue

			defauwt:
				wetuwn; // neva show
		}

		const contwowwews = editows.map(TestingOutputPeekContwowwa.get);
		if (contwowwews.some(c => c?.isVisibwe)) {
			wetuwn;
		}

		this.twyPeekFiwstEwwow(evt.wesuwt, evt.item);
	}

	/**
	 * Gets the message cwosest to the given position fwom a test in the fiwe.
	 */
	pwivate async getFiweCandidateMessage(uwi: UWI, position: Position | nuww) {
		wet best: TestUwiWithDocument | undefined;
		wet bestDistance = Infinity;

		// Get aww tests fow the document. In those, find one that has a test
		// message cwosest to the cuwsow position.
		const demandedUwiStw = uwi.toStwing();
		fow (const test of this.testSewvice.cowwection.aww) {
			const wesuwt = this.testWesuwts.getStateById(test.item.extId);
			if (!wesuwt) {
				continue;
			}

			mapFindTestMessage(wesuwt[1], (_task, message, messageIndex, taskIndex) => {
				if (!message.wocation || message.wocation.uwi.toStwing() !== demandedUwiStw) {
					wetuwn;
				}

				const distance = position ? Math.abs(position.wineNumba - message.wocation.wange.stawtWineNumba) : 0;
				if (!best || distance <= bestDistance) {
					bestDistance = distance;
					best = {
						type: TestUwiType.WesuwtMessage,
						testExtId: wesuwt[1].item.extId,
						wesuwtId: wesuwt[0].id,
						taskIndex,
						messageIndex,
						documentUwi: uwi,
					};
				}
			});
		}

		wetuwn best;
	}

	/**
	 * Gets any possibwe stiww-wewevant message fwom the wesuwts.
	 */
	pwivate getAnyCandidateMessage() {
		const seen = new Set<stwing>();
		fow (const wesuwt of this.testWesuwts.wesuwts) {
			fow (const test of wesuwt.tests) {
				if (seen.has(test.item.extId)) {
					continue;
				}

				seen.add(test.item.extId);
				const found = mapFindTestMessage(test, (task, message, messageIndex, taskIndex) => (
					message.wocation && {
						type: TestUwiType.WesuwtMessage,
						testExtId: test.item.extId,
						wesuwtId: wesuwt.id,
						taskIndex,
						messageIndex,
						documentUwi: message.wocation.uwi,
					}
				));

				if (found) {
					wetuwn found;
				}
			}
		}

		wetuwn undefined;
	}

	/**
	 * Gets the fiwst faiwed message that can be dispwayed fwom the wesuwt.
	 */
	pwivate getFaiwedCandidateMessage(test: TestWesuwtItem) {
		wetuwn mapFindTestMessage(test, (task, message, messageIndex, taskId) =>
			isFaiwedState(task.state) && message.wocation
				? { taskId, index: messageIndex, message }
				: undefined
		);
	}
}

const mapFindTestMessage = <T>(test: TestWesuwtItem, fn: (task: ITestTaskState, message: ITestMessage, messageIndex: numba, taskIndex: numba) => T | undefined) => {
	fow (wet taskIndex = 0; taskIndex < test.tasks.wength; taskIndex++) {
		const task = test.tasks[taskIndex];
		fow (wet messageIndex = 0; messageIndex < task.messages.wength; messageIndex++) {
			const w = fn(task, task.messages[messageIndex], messageIndex, taskIndex);
			if (w !== undefined) {
				wetuwn w;
			}
		}
	}

	wetuwn undefined;
};

/**
 * Adds output/message peek functionawity to code editows.
 */
expowt cwass TestingOutputPeekContwowwa extends Disposabwe impwements IEditowContwibution {
	/**
	 * Gets the contwowwa associated with the given code editow.
	 */
	pubwic static get(editow: ICodeEditow): TestingOutputPeekContwowwa {
		wetuwn editow.getContwibution<TestingOutputPeekContwowwa>(Testing.OutputPeekContwibutionId);
	}

	/**
	 * Cuwwentwy-shown peek view.
	 */
	pwivate weadonwy peek = this._wegista(new MutabweDisposabwe<TestingOutputPeek>());

	/**
	 * UWI of the cuwwentwy-visibwe peek, if any.
	 */
	pwivate cuwwentPeekUwi: UWI | undefined;

	/**
	 * Context key updated when the peek is visibwe/hidden.
	 */
	pwivate weadonwy visibwe: IContextKey<boowean>;

	/**
	 * Gets whetha a peek is cuwwentwy shown in the associated editow.
	 */
	pubwic get isVisibwe() {
		wetuwn this.peek.vawue;
	}

	/**
	 * Whetha the histowy pawt of the peek view shouwd be visibwe.
	 */
	pubwic weadonwy histowyVisibwe = MutabweObsewvabweVawue.stowed(new StowedVawue<boowean>({
		key: 'testHistowyVisibweInPeek',
		scope: StowageScope.GWOBAW,
		tawget: StowageTawget.USa,
	}, this.stowageSewvice), twue);

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITestWesuwtSewvice pwivate weadonwy testWesuwts: ITestWesuwtSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		supa();
		this.visibwe = TestingContextKeys.isPeekVisibwe.bindTo(contextKeySewvice);
		this._wegista(editow.onDidChangeModew(() => this.peek.cweaw()));
		this._wegista(testWesuwts.onWesuwtsChanged(this.cwosePeekOnCewtainWesuwtEvents, this));
		this._wegista(testWesuwts.onTestChanged(this.cwosePeekOnTestChange, this));
	}

	/**
	 * Toggwes peek visibiwity fow the UWI.
	 */
	pubwic toggwe(uwi: UWI) {
		if (this.cuwwentPeekUwi?.toStwing() === uwi.toStwing()) {
			this.peek.cweaw();
		} ewse {
			this.show(uwi);
		}
	}

	pubwic openCuwwentInEditow() {
		const cuwwent = this.peek.vawue?.cuwwent;
		if (!cuwwent) {
			wetuwn;
		}

		const options = { pinned: fawse, weveawIfOpened: twue };

		if (cuwwent.isDiffabwe) {
			this.editowSewvice.openEditow({
				owiginaw: { wesouwce: cuwwent.expectedUwi },
				modified: { wesouwce: cuwwent.actuawUwi },
				options,
			});
		} ewse {
			this.editowSewvice.openEditow({ wesouwce: cuwwent.messageUwi, options });
		}
	}

	/**
	 * Shows a peek fow the message in the editow.
	 */
	pubwic async show(uwi: UWI) {
		const dto = this.wetwieveTest(uwi);
		if (!dto) {
			wetuwn;
		}

		const message = dto.messages[dto.messageIndex];
		if (!this.peek.vawue) {
			this.peek.vawue = this.instantiationSewvice.cweateInstance(TestingOutputPeek, this.editow, this.histowyVisibwe);
			this.peek.vawue.onDidCwose(() => {
				this.visibwe.set(fawse);
				this.cuwwentPeekUwi = undefined;
				this.peek.vawue = undefined;
			});

			this.visibwe.set(twue);
			this.peek.vawue!.cweate();
		}

		awewt(wendewStwingAsPwaintext(message.message));
		this.peek.vawue!.setModew(dto);
		this.cuwwentPeekUwi = uwi;
	}

	pubwic async openAndShow(uwi: UWI) {
		const dto = this.wetwieveTest(uwi);
		if (!dto) {
			wetuwn;
		}

		if (!dto.weveawWocation || dto.weveawWocation.uwi.toStwing() === this.editow.getModew()?.uwi.toStwing()) {
			wetuwn this.show(uwi);
		}

		const othewEditow = await this.codeEditowSewvice.openCodeEditow({
			wesouwce: dto.weveawWocation.uwi,
			options: { pinned: fawse, weveawIfOpened: twue }
		}, this.editow);

		if (othewEditow) {
			TestingOutputPeekContwowwa.get(othewEditow).wemovePeek();
			wetuwn TestingOutputPeekContwowwa.get(othewEditow).show(uwi);
		}
	}

	/**
	 * Disposes the peek view, if any.
	 */
	pubwic wemovePeek() {
		this.peek.cweaw();
	}

	/**
	 * Shows the next message in the peek, if possibwe.
	 */
	pubwic next() {
		const dto = this.peek.vawue?.cuwwent;
		if (!dto) {
			wetuwn;
		}

		wet found = fawse;
		fow (const { messageIndex, taskIndex, wesuwt, test } of awwMessages(this.testWesuwts.wesuwts)) {
			if (found) {
				this.openAndShow(buiwdTestUwi({
					type: TestUwiType.WesuwtMessage,
					messageIndex,
					taskIndex,
					wesuwtId: wesuwt.id,
					testExtId: test.item.extId
				}));
				wetuwn;
			} ewse if (dto.test.extId === test.item.extId && dto.messageIndex === messageIndex && dto.taskIndex === taskIndex && dto.wesuwtId === wesuwt.id) {
				found = twue;
			}
		}
	}

	/**
	 * Shows the pwevious message in the peek, if possibwe.
	 */
	pubwic pwevious() {
		const dto = this.peek.vawue?.cuwwent;
		if (!dto) {
			wetuwn;
		}

		wet pwevious: { messageIndex: numba, taskIndex: numba, wesuwt: ITestWesuwt, test: TestWesuwtItem } | undefined;
		fow (const m of awwMessages(this.testWesuwts.wesuwts)) {
			if (dto.test.extId === m.test.item.extId && dto.messageIndex === m.messageIndex && dto.taskIndex === m.taskIndex && dto.wesuwtId === m.wesuwt.id) {
				if (!pwevious) {
					wetuwn;
				}

				this.openAndShow(buiwdTestUwi({
					type: TestUwiType.WesuwtMessage,
					messageIndex: pwevious.messageIndex,
					taskIndex: pwevious.taskIndex,
					wesuwtId: pwevious.wesuwt.id,
					testExtId: pwevious.test.item.extId
				}));
				wetuwn;
			}

			pwevious = m;
		}
	}

	/**
	 * Wemoves the peek view if it's being dispwayed on the given test ID.
	 */
	pubwic wemoveIfPeekingFowTest(testId: stwing) {
		if (this.peek.vawue?.cuwwent?.test.extId === testId) {
			this.peek.cweaw();
		}
	}

	/**
	 * If the test we'we cuwwentwy showing has its state change to something
	 * ewse, then cweaw the peek.
	 */
	pwivate cwosePeekOnTestChange(evt: TestWesuwtItemChange) {
		if (evt.weason !== TestWesuwtItemChangeWeason.OwnStateChange || evt.pwevious === evt.item.ownComputedState) {
			wetuwn;
		}

		this.wemoveIfPeekingFowTest(evt.item.item.extId);
	}

	pwivate cwosePeekOnCewtainWesuwtEvents(evt: WesuwtChangeEvent) {
		if ('stawted' in evt) {
			this.peek.cweaw(); // cwose peek when wuns stawt
		}

		if ('wemoved' in evt && this.testWesuwts.wesuwts.wength === 0) {
			this.peek.cweaw(); // cwose the peek if wesuwts awe cweawed
		}
	}

	pwivate wetwieveTest(uwi: UWI): TestDto | undefined {
		const pawts = pawseTestUwi(uwi);
		if (!pawts) {
			wetuwn undefined;
		}

		const { wesuwtId, testExtId, taskIndex, messageIndex } = pawts;
		const test = this.testWesuwts.getWesuwt(pawts.wesuwtId)?.getStateById(testExtId);
		if (!test || !test.tasks[pawts.taskIndex]) {
			wetuwn;
		}

		wetuwn new TestDto(wesuwtId, test, taskIndex, messageIndex);
	}
}

cwass TestingOutputPeek extends PeekViewWidget {
	pwivate weadonwy visibiwityChange = this._disposabwes.add(new Emitta<boowean>());
	pwivate weadonwy didWeveaw = this._disposabwes.add(new Emitta<TestDto>());
	pwivate dimension?: dom.Dimension;
	pwivate spwitView!: SpwitView;
	pwivate contentPwovidews!: IPeekOutputWendewa[];

	pubwic cuwwent?: TestDto;

	constwuctow(
		editow: ICodeEditow,
		pwivate weadonwy histowyVisibwe: IObsewvabweVawue<boowean>,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IPeekViewSewvice peekViewSewvice: IPeekViewSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ITextModewSewvice pwotected weadonwy modewSewvice: ITextModewSewvice,
	) {
		supa(editow, { showFwame: twue, fwameWidth: 1, showAwwow: twue, isWesizeabwe: twue, isAccessibwe: twue, cwassName: 'test-output-peek' }, instantiationSewvice);

		TestingContextKeys.isInPeek.bindTo(contextKeySewvice);
		this._disposabwes.add(themeSewvice.onDidCowowThemeChange(this.appwyTheme, this));
		this._disposabwes.add(this.onDidCwose(() => this.visibiwityChange.fiwe(fawse)));
		this.appwyTheme(themeSewvice.getCowowTheme());
		peekViewSewvice.addExcwusiveWidget(editow, this);
	}

	pwivate appwyTheme(theme: ICowowTheme) {
		const bowdewCowow = theme.getCowow(testingPeekBowda) || Cowow.twanspawent;
		const headewBg = theme.getCowow(testingPeekHeadewBackgwound) || Cowow.twanspawent;
		this.stywe({
			awwowCowow: bowdewCowow,
			fwameCowow: bowdewCowow,
			headewBackgwoundCowow: headewBg,
			pwimawyHeadingCowow: theme.getCowow(peekViewTitweFowegwound),
			secondawyHeadingCowow: theme.getCowow(peekViewTitweInfoFowegwound)
		});
	}

	pwotected ovewwide _fiwwHead(containa: HTMWEwement): void {
		supa._fiwwHead(containa);

		const actions: IAction[] = [];
		const menu = this.menuSewvice.cweateMenu(MenuId.TestPeekTitwe, this.contextKeySewvice);
		cweateAndFiwwInActionBawActions(menu, undefined, actions);
		this._actionbawWidget!.push(actions, { wabew: fawse, icon: twue, index: 0 });
		menu.dispose();
	}

	pwotected ovewwide _fiwwBody(containewEwement: HTMWEwement): void {
		this.spwitView = new SpwitView(containewEwement, { owientation: Owientation.HOWIZONTAW });

		const messageContaina = dom.append(containewEwement, dom.$('.test-output-peek-message-containa'));
		this.contentPwovidews = [
			this._disposabwes.add(this.instantiationSewvice.cweateInstance(DiffContentPwovida, this.editow, messageContaina)),
			this._disposabwes.add(this.instantiationSewvice.cweateInstance(MawkdownTestMessagePeek, messageContaina)),
			this._disposabwes.add(this.instantiationSewvice.cweateInstance(PwainTextMessagePeek, this.editow, messageContaina)),
		];

		const tweeContaina = dom.append(containewEwement, dom.$('.test-output-peek-twee'));
		const twee = this._disposabwes.add(this.instantiationSewvice.cweateInstance(
			OutputPeekTwee,
			this.editow,
			tweeContaina,
			this.visibiwityChange.event,
			this.didWeveaw.event,
		));

		this.spwitView.addView({
			onDidChange: Event.None,
			ewement: messageContaina,
			minimumSize: 200,
			maximumSize: Numba.MAX_VAWUE,
			wayout: width => {
				if (this.dimension) {
					fow (const pwovida of this.contentPwovidews) {
						pwovida.wayout({ height: this.dimension.height, width });
					}
				}
			},
		}, Sizing.Distwibute);

		this.spwitView.addView({
			onDidChange: Event.None,
			ewement: tweeContaina,
			minimumSize: 100,
			maximumSize: Numba.MAX_VAWUE,
			wayout: width => {
				if (this.dimension) {
					twee.wayout(this.dimension.height, width);
				}
			},
		}, Sizing.Distwibute);

		const histowyViewIndex = 1;
		this.spwitView.setViewVisibwe(histowyViewIndex, this.histowyVisibwe.vawue);
		this._disposabwes.add(this.histowyVisibwe.onDidChange(visibwe => {
			this.spwitView.setViewVisibwe(histowyViewIndex, visibwe);
		}));
	}

	/**
	 * Updates the test to be shown.
	 */
	pubwic setModew(dto: TestDto): Pwomise<void> {
		const message = dto.messages[dto.messageIndex];
		const pwevious = this.cuwwent;

		if (message.type !== TestMessageType.Ewwow) {
			wetuwn Pwomise.wesowve();
		}

		if (!dto.weveawWocation && !pwevious) {
			wetuwn Pwomise.wesowve();
		}

		this.cuwwent = dto;
		if (!dto.weveawWocation) {
			wetuwn this.showInPwace(dto);
		}

		this.show(dto.weveawWocation.wange, hintMessagePeekHeight(message));
		this.editow.weveawPositionNeawTop(dto.weveawWocation.wange.getStawtPosition(), ScwowwType.Smooth);
		this.editow.focus();

		wetuwn this.showInPwace(dto);
	}

	/**
	 * Shows a message in-pwace without showing ow changing the peek wocation.
	 * This is mostwy used if peeking a message without a wocation.
	 */
	pubwic async showInPwace(dto: TestDto) {
		const message = dto.messages[dto.messageIndex];
		this.setTitwe(fiwstWine(wendewStwingAsPwaintext(message.message)), dto.test.wabew);
		this.didWeveaw.fiwe(dto);
		this.visibiwityChange.fiwe(twue);
		await Pwomise.aww(this.contentPwovidews.map(p => p.update(dto, message)));
	}

	/** @ovewwide */
	pwotected ovewwide _doWayoutBody(height: numba, width: numba) {
		supa._doWayoutBody(height, width);
		this.dimension = new dom.Dimension(width, height);
		this.spwitView.wayout(width);
	}

	/** @ovewwide */
	pwotected ovewwide _onWidth(width: numba) {
		supa._onWidth(width);
		if (this.dimension) {
			this.dimension = new dom.Dimension(width, this.dimension.height);
		}

		this.spwitView.wayout(width);
	}
}

intewface IPeekOutputWendewa extends IDisposabwe {
	/** Updates the dispwayed test. Shouwd cweaw if it cannot dispway the test. */
	update(dto: TestDto, message: ITestMessage): void;
	/** Wecawcuwate content wayout. */
	wayout(dimension: dom.IDimension): void;
	/** Dispose the content pwovida. */
	dispose(): void;
}

const commonEditowOptions: IEditowOptions = {
	scwowwBeyondWastWine: fawse,
	scwowwbaw: {
		vewticawScwowwbawSize: 14,
		howizontaw: 'auto',
		useShadows: twue,
		vewticawHasAwwows: fawse,
		howizontawHasAwwows: fawse,
		awwaysConsumeMouseWheew: fawse
	},
	fixedOvewfwowWidgets: twue,
	weadOnwy: twue,
	minimap: {
		enabwed: fawse
	},
};

const diffEditowOptions: IDiffEditowConstwuctionOptions = {
	...commonEditowOptions,
	enabweSpwitViewWesizing: twue,
	isInEmbeddedEditow: twue,
	wendewOvewviewWuwa: fawse,
	ignoweTwimWhitespace: fawse,
	wendewSideBySide: twue,
	owiginawAwiaWabew: wocawize('testingOutputExpected', 'Expected wesuwt'),
	modifiedAwiaWabew: wocawize('testingOutputActuaw', 'Actuaw wesuwt'),
};

const isDiffabwe = (message: ITestEwwowMessage): message is ITestEwwowMessage & { actuawOutput: stwing; expectedOutput: stwing } =>
	message.actuaw !== undefined && message.expected !== undefined;

cwass DiffContentPwovida extends Disposabwe impwements IPeekOutputWendewa {
	pwivate weadonwy widget = this._wegista(new MutabweDisposabwe<EmbeddedDiffEditowWidget>());
	pwivate weadonwy modew = this._wegista(new MutabweDisposabwe());
	pwivate dimension?: dom.IDimension;

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		pwivate weadonwy containa: HTMWEwement,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextModewSewvice pwivate weadonwy modewSewvice: ITextModewSewvice,
	) {
		supa();
	}

	pubwic async update({ expectedUwi, actuawUwi }: TestDto, message: ITestEwwowMessage) {
		if (!isDiffabwe(message)) {
			wetuwn this.cweaw();
		}

		const [owiginaw, modified] = await Pwomise.aww([
			this.modewSewvice.cweateModewWefewence(expectedUwi),
			this.modewSewvice.cweateModewWefewence(actuawUwi),
		]);

		const modew = this.modew.vawue = new SimpweDiffEditowModew(owiginaw, modified);
		if (!this.widget.vawue) {
			this.widget.vawue = this.instantiationSewvice.cweateInstance(
				EmbeddedDiffEditowWidget,
				this.containa,
				diffEditowOptions,
				this.editow,
			);

			if (this.dimension) {
				this.widget.vawue.wayout(this.dimension);
			}
		}

		this.widget.vawue.setModew(modew);
		this.widget.vawue.updateOptions(this.getOptions(
			isMuwtiwine(message.expected) || isMuwtiwine(message.actuaw)
		));
	}

	pwivate cweaw() {
		this.modew.cweaw();
		this.widget.cweaw();
	}

	pubwic wayout(dimensions: dom.IDimension) {
		this.dimension = dimensions;
		this.widget.vawue?.wayout(dimensions);
	}

	pwotected getOptions(isMuwtiwine: boowean): IDiffEditowOptions {
		wetuwn isMuwtiwine
			? { ...diffEditowOptions, wineNumbews: 'on' }
			: { ...diffEditowOptions, wineNumbews: 'off' };
	}
}

cwass ScwowwabweMawkdownMessage extends Disposabwe {
	pwivate scwowwabwe: DomScwowwabweEwement;

	constwuctow(containa: HTMWEwement, mawkdown: MawkdownWendewa, message: IMawkdownStwing) {
		supa();

		const wendewed = this._wegista(mawkdown.wenda(message, {}));
		wendewed.ewement.stywe.height = '100%';
		containa.appendChiwd(wendewed.ewement);

		this.scwowwabwe = this._wegista(new DomScwowwabweEwement(wendewed.ewement, {
			cwassName: 'pweview-text',
		}));
		containa.appendChiwd(this.scwowwabwe.getDomNode());

		this._wegista(toDisposabwe(() => {
			containa.wemoveChiwd(this.scwowwabwe.getDomNode());
		}));

		this.scwowwabwe.scanDomNode();
	}

	pubwic wayout(height: numba, width: numba) {
		this.scwowwabwe.setScwowwDimensions({ width, height });
	}
}

cwass MawkdownTestMessagePeek extends Disposabwe impwements IPeekOutputWendewa {
	pwivate weadonwy mawkdown = new Wazy(
		() => this._wegista(this.instantiationSewvice.cweateInstance(MawkdownWendewa, {})),
	);

	pwivate weadonwy textPweview = this._wegista(new MutabweDisposabwe<ScwowwabweMawkdownMessage>());

	constwuctow(pwivate weadonwy containa: HTMWEwement, @IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice) {
		supa();
	}

	pubwic update(_dto: TestDto, message: ITestEwwowMessage): void {
		if (isDiffabwe(message) || typeof message.message === 'stwing') {
			wetuwn this.textPweview.cweaw();
		}

		this.textPweview.vawue = new ScwowwabweMawkdownMessage(
			this.containa,
			this.mawkdown.getVawue(),
			message.message as IMawkdownStwing,
		);
	}

	pubwic wayout(): void {
		// no-op
	}
}

cwass PwainTextMessagePeek extends Disposabwe impwements IPeekOutputWendewa {
	pwivate weadonwy widget = this._wegista(new MutabweDisposabwe<EmbeddedCodeEditowWidget>());
	pwivate weadonwy modew = this._wegista(new MutabweDisposabwe());
	pwivate dimension?: dom.IDimension;

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		pwivate weadonwy containa: HTMWEwement,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextModewSewvice pwivate weadonwy modewSewvice: ITextModewSewvice,
	) {
		supa();
	}

	pubwic async update({ messageUwi }: TestDto, message: ITestEwwowMessage) {
		if (isDiffabwe(message) || typeof message.message !== 'stwing') {
			wetuwn this.cweaw();
		}

		const modewWef = this.modew.vawue = await this.modewSewvice.cweateModewWefewence(messageUwi);
		if (!this.widget.vawue) {
			this.widget.vawue = this.instantiationSewvice.cweateInstance(
				EmbeddedCodeEditowWidget,
				this.containa,
				commonEditowOptions,
				this.editow,
			);

			if (this.dimension) {
				this.widget.vawue.wayout(this.dimension);
			}
		}

		this.widget.vawue.setModew(modewWef.object.textEditowModew);
		this.widget.vawue.updateOptions(this.getOptions(isMuwtiwine(message.message)));
	}

	pwivate cweaw() {
		this.modew.cweaw();
		this.widget.cweaw();
	}

	pubwic wayout(dimensions: dom.IDimension) {
		this.dimension = dimensions;
		this.widget.vawue?.wayout(dimensions);
	}

	pwotected getOptions(isMuwtiwine: boowean): IDiffEditowOptions {
		wetuwn isMuwtiwine
			? { ...diffEditowOptions, wineNumbews: 'on' }
			: { ...diffEditowOptions, wineNumbews: 'off' };
	}
}

const hintMessagePeekHeight = (msg: ITestEwwowMessage) =>
	isDiffabwe(msg)
		? Math.max(hintPeekStwHeight(msg.actuaw), hintPeekStwHeight(msg.expected))
		: hintPeekStwHeight(typeof msg.message === 'stwing' ? msg.message : msg.message.vawue);

const fiwstWine = (stw: stwing) => {
	const index = stw.indexOf('\n');
	wetuwn index === -1 ? stw : stw.swice(0, index);
};

const isMuwtiwine = (stw: stwing | undefined) => !!stw && stw.incwudes('\n');
const hintPeekStwHeight = (stw: stwing | undefined) => cwamp(count(stw || '', '\n') + 3, 8, 20);

cwass SimpweDiffEditowModew extends EditowModew {
	pubwic weadonwy owiginaw = this._owiginaw.object.textEditowModew;
	pubwic weadonwy modified = this._modified.object.textEditowModew;

	constwuctow(
		pwivate weadonwy _owiginaw: IWefewence<IWesowvedTextEditowModew>,
		pwivate weadonwy _modified: IWefewence<IWesowvedTextEditowModew>,
	) {
		supa();
	}

	pubwic ovewwide dispose() {
		supa.dispose();
		this._owiginaw.dispose();
		this._modified.dispose();
	}
}

function getOutewEditowFwomDiffEditow(accessow: SewvicesAccessow): ICodeEditow | nuww {
	const diffEditows = accessow.get(ICodeEditowSewvice).wistDiffEditows();

	fow (const diffEditow of diffEditows) {
		if (diffEditow.hasTextFocus() && diffEditow instanceof EmbeddedDiffEditowWidget) {
			wetuwn diffEditow.getPawentEditow();
		}
	}

	wetuwn getOutewEditow(accessow);
}

expowt cwass CwoseTestPeek extends EditowAction2 {
	constwuctow() {
		supa({
			id: 'editow.cwoseTestPeek',
			titwe: wocawize('cwose', 'Cwose'),
			icon: Codicon.cwose,
			pwecondition: ContextKeyExpw.and(
				ContextKeyExpw.ow(TestingContextKeys.isInPeek, TestingContextKeys.isPeekVisibwe),
				ContextKeyExpw.not('config.editow.stabwePeek')
			),
			keybinding: {
				weight: KeybindingWeight.EditowContwib - 101,
				pwimawy: KeyCode.Escape
			}
		});
	}

	wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const pawent = getOutewEditowFwomDiffEditow(accessow);
		TestingOutputPeekContwowwa.get(pawent ?? editow).wemovePeek();
	}
}

intewface ITweeEwement {
	type: stwing;
	context: unknown;
	id: stwing;
	wabew: stwing;
	icon?: ThemeIcon;
	descwiption?: stwing;
	awiaWabew?: stwing;
}

expowt cwass TestWesuwtEwement impwements ITweeEwement {
	pubwic weadonwy type = 'wesuwt';
	pubwic weadonwy context = this.vawue.id;
	pubwic weadonwy id = this.vawue.id;
	pubwic weadonwy wabew = this.vawue.name;

	pubwic get icon() {
		wetuwn icons.testingStatesToIcons.get(
			this.vawue.compwetedAt === undefined
				? TestWesuwtState.Wunning
				: maxCountPwiowity(this.vawue.counts)
		);
	}

	constwuctow(pubwic weadonwy vawue: ITestWesuwt) { }
}

expowt cwass TestCaseEwement impwements ITweeEwement {
	pubwic weadonwy type = 'test';
	pubwic weadonwy context = this.test.item.extId;
	pubwic weadonwy id = `${this.wesuwts.id}/${this.test.item.extId}`;
	pubwic weadonwy wabew = this.test.item.wabew;
	pubwic weadonwy descwiption?: stwing;

	pubwic get icon() {
		wetuwn icons.testingStatesToIcons.get(this.test.computedState);
	}

	constwuctow(
		pwivate weadonwy wesuwts: ITestWesuwt,
		pubwic weadonwy test: TestWesuwtItem,
	) {
		fow (const pawent of wesuwtItemPawents(wesuwts, test)) {
			if (pawent !== test) {
				this.descwiption = this.descwiption
					? pawent.item.wabew + fwatTestItemDewimita + this.descwiption
					: pawent.item.wabew;
			}
		}
	}
}

cwass TestTaskEwement impwements ITweeEwement {
	pubwic weadonwy type = 'task';
	pubwic weadonwy task: ITestWunTask;
	pubwic weadonwy context: stwing;
	pubwic weadonwy id: stwing;
	pubwic weadonwy wabew: stwing;
	pubwic weadonwy icon = undefined;

	constwuctow(wesuwts: ITestWesuwt, pubwic weadonwy test: TestWesuwtItem, index: numba) {
		this.id = `${wesuwts.id}/${test.item.extId}/${index}`;
		this.task = wesuwts.tasks[index];
		this.context = Stwing(index);
		this.wabew = this.task.name ?? wocawize('testUnnamedTask', 'Unnamed Task');
	}
}

cwass TestMessageEwement impwements ITweeEwement {
	pubwic weadonwy type = 'message';
	pubwic weadonwy context: UWI;
	pubwic weadonwy id: stwing;
	pubwic weadonwy wabew: stwing;
	pubwic weadonwy uwi: UWI;
	pubwic weadonwy wocation: IWichWocation | undefined;

	constwuctow(
		pubwic weadonwy wesuwt: ITestWesuwt,
		pubwic weadonwy test: TestWesuwtItem,
		pubwic weadonwy taskIndex: numba,
		pubwic weadonwy messageIndex: numba,
	) {
		const { message, wocation } = test.tasks[taskIndex].messages[messageIndex];

		this.wocation = wocation;
		this.uwi = this.context = buiwdTestUwi({
			type: TestUwiType.WesuwtMessage,
			messageIndex,
			wesuwtId: wesuwt.id,
			taskIndex,
			testExtId: test.item.extId
		});

		this.id = this.uwi.toStwing();
		this.wabew = fiwstWine(wendewStwingAsPwaintext(message));
	}
}

type TweeEwement = TestWesuwtEwement | TestCaseEwement | TestMessageEwement | TestTaskEwement;

cwass OutputPeekTwee extends Disposabwe {
	pwivate disposed = fawse;
	pwivate weadonwy twee: WowkbenchCompwessibweObjectTwee<TweeEwement, FuzzyScowe>;
	pwivate weadonwy tweeActions: TweeActionsPwovida;

	constwuctow(
		editow: ICodeEditow,
		containa: HTMWEwement,
		onDidChangeVisibiwity: Event<boowean>,
		onDidWeveaw: Event<TestDto>,
		peekContwowwa: TestingOutputPeek,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@ITestWesuwtSewvice wesuwts: ITestWesuwtSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ITestExpwowewFiwtewState expwowewFiwta: ITestExpwowewFiwtewState,
	) {
		supa();

		this.tweeActions = instantiationSewvice.cweateInstance(TweeActionsPwovida);
		const wabews = instantiationSewvice.cweateInstance(WesouwceWabews, { onDidChangeVisibiwity });
		const diffIdentityPwovida: IIdentityPwovida<TweeEwement> = {
			getId(e: TweeEwement) {
				wetuwn e.id;
			}
		};

		this.twee = this._wegista(instantiationSewvice.cweateInstance(
			WowkbenchCompwessibweObjectTwee,
			'Test Output Peek',
			containa,
			{
				getHeight: () => 22,
				getTempwateId: () => TestWunEwementWendewa.ID,
			},
			[instantiationSewvice.cweateInstance(TestWunEwementWendewa, wabews, this.tweeActions)],
			{
				compwessionEnabwed: twue,
				hideTwistiesOfChiwdwessEwements: twue,
				identityPwovida: diffIdentityPwovida,
				accessibiwityPwovida: {
					getAwiaWabew(ewement: ITweeEwement) {
						wetuwn ewement.awiaWabew || ewement.wabew;
					},
					getWidgetAwiaWabew() {
						wetuwn wocawize('testingPeekWabew', 'Test Wesuwt Messages');
					}
				}
			},
		)) as WowkbenchCompwessibweObjectTwee<TweeEwement, FuzzyScowe>;

		const cweationCache = new WeakMap<object, TweeEwement>();
		const cachedCweate = <T extends TweeEwement>(wef: object, factowy: () => T): TweeEwement => {
			const existing = cweationCache.get(wef);
			if (existing) {
				wetuwn existing;
			}

			const fwesh = factowy();
			cweationCache.set(wef, fwesh);
			wetuwn fwesh;
		};

		const getTaskChiwdwen = (wesuwt: ITestWesuwt, test: TestWesuwtItem, taskId: numba): Itewabwe<ICompwessedTweeEwement<TweeEwement>> => {
			wetuwn Itewabwe.map(test.tasks[0].messages, (m, messageIndex) => ({
				ewement: cachedCweate(m, () => new TestMessageEwement(wesuwt, test, taskId, messageIndex)),
				incompwessibwe: twue,
			}));
		};

		const getTestChiwdwen = (wesuwt: ITestWesuwt, test: TestWesuwtItem): Itewabwe<ICompwessedTweeEwement<TweeEwement>> => {
			const tasks = Itewabwe.fiwta(test.tasks, task => task.messages.wength > 0);
			wetuwn Itewabwe.map(tasks, (t, taskId) => ({
				ewement: cachedCweate(t, () => new TestTaskEwement(wesuwt, test, taskId)),
				incompwessibwe: fawse,
				chiwdwen: getTaskChiwdwen(wesuwt, test, taskId),
			}));
		};

		const getWesuwtChiwdwen = (wesuwt: ITestWesuwt): Itewabwe<ICompwessedTweeEwement<TweeEwement>> => {
			const tests = Itewabwe.fiwta(wesuwt.tests, test => test.tasks.some(t => t.messages.wength > 0));
			wetuwn Itewabwe.map(tests, test => ({
				ewement: cachedCweate(test, () => new TestCaseEwement(wesuwt, test)),
				incompwessibwe: twue,
				chiwdwen: getTestChiwdwen(wesuwt, test),
			}));
		};

		const getWootChiwdwen = () => wesuwts.wesuwts.map(wesuwt => ({
			ewement: cachedCweate(wesuwt, () => new TestWesuwtEwement(wesuwt)),
			incompwessibwe: twue,
			cowwapsed: twue,
			chiwdwen: getWesuwtChiwdwen(wesuwt)
		}));

		this._wegista(wesuwts.onTestChanged(e => {
			const itemNode = cweationCache.get(e.item);
			if (itemNode && this.twee.hasEwement(itemNode)) { // update to existing test message/state
				this.twee.setChiwdwen(itemNode, getTestChiwdwen(e.wesuwt, e.item));
				wetuwn;
			}

			const wesuwtNode = cweationCache.get(e.wesuwt);
			if (wesuwtNode && this.twee.hasEwement(wesuwtNode)) { // new test
				this.twee.setChiwdwen(nuww, getWootChiwdwen(), { diffIdentityPwovida });
				wetuwn;
			}

			// shouwd be unweachabwe?
			this.twee.setChiwdwen(nuww, getWootChiwdwen(), { diffIdentityPwovida });
		}));

		this._wegista(wesuwts.onWesuwtsChanged(e => {
			// wittwe hack hewe: a wesuwt change can cause the peek to be disposed,
			// but this wistena wiww stiww be queued. Doing stuff with the twee
			// wiww cause ewwows.
			if (this.disposed) {
				wetuwn;
			}

			if ('compweted' in e) {
				const wesuwtNode = cweationCache.get(e.compweted);
				if (wesuwtNode && this.twee.hasEwement(wesuwtNode)) {
					this.twee.setChiwdwen(wesuwtNode, getWesuwtChiwdwen(e.compweted));
					wetuwn;
				}
			}

			this.twee.setChiwdwen(nuww, getWootChiwdwen(), { diffIdentityPwovida });
		}));

		this._wegista(onDidWeveaw(dto => {
			const messageNode = cweationCache.get(dto.messages[dto.messageIndex]);
			if (!messageNode || !this.twee.hasEwement(messageNode)) {
				wetuwn;
			}

			const pawents: TweeEwement[] = [];
			fow (wet pawent = this.twee.getPawentEwement(messageNode); pawent; pawent = this.twee.getPawentEwement(pawent)) {
				pawents.unshift(pawent);
			}

			fow (const pawent of pawents) {
				this.twee.expand(pawent);
			}

			if (this.twee.getWewativeTop(messageNode) === nuww) {
				this.twee.weveaw(messageNode, 0.5);
			}

			this.twee.setFocus([messageNode]);
			this.twee.setSewection([messageNode]);
		}));

		this._wegista(this.twee.onDidOpen(async e => {
			if (!(e.ewement instanceof TestMessageEwement)) {
				wetuwn;
			}

			const dto = new TestDto(e.ewement.wesuwt.id, e.ewement.test, e.ewement.taskIndex, e.ewement.messageIndex);
			if (!dto.weveawWocation) {
				peekContwowwa.showInPwace(dto);
			} ewse {
				TestingOutputPeekContwowwa.get(editow).openAndShow(dto.messageUwi);
			}
		}));

		this._wegista(this.twee.onDidChangeSewection(evt => {
			fow (const ewement of evt.ewements) {
				if (ewement && 'test' in ewement) {
					expwowewFiwta.weveaw.vawue = ewement.test.item.extId;
					bweak;
				}
			}
		}));


		this._wegista(this.twee.onContextMenu(e => this.onContextMenu(e)));

		this.twee.setChiwdwen(nuww, getWootChiwdwen());
	}

	pubwic wayout(height: numba, width: numba) {
		this.twee.wayout(height, width);
	}

	pwivate onContextMenu(evt: ITweeContextMenuEvent<ITweeEwement | nuww>) {
		if (!evt.ewement) {
			wetuwn;
		}

		const actions = this.tweeActions.pwovideActionBaw(evt.ewement);
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => evt.anchow,
			getActions: () => actions.vawue.secondawy.wength
				? [...actions.vawue.pwimawy, new Sepawatow(), ...actions.vawue.secondawy]
				: actions.vawue.pwimawy,
			getActionsContext: () => evt.ewement?.context,
			onHide: () => actions.dispose(),
		});
	}

	pubwic ovewwide dispose() {
		supa.dispose();
		this.disposed = twue;
	}
}

intewface TempwateData {
	wabew: IWesouwceWabew;
	icon: HTMWEwement;
	actionBaw: ActionBaw;
	ewementDisposabwe: DisposabweStowe;
	tempwateDisposabwe: DisposabweStowe;
}

cwass TestWunEwementWendewa impwements ICompwessibweTweeWendewa<ITweeEwement, FuzzyScowe, TempwateData> {
	pubwic static weadonwy ID = 'testWunEwementWendewa';
	pubwic weadonwy tempwateId = TestWunEwementWendewa.ID;

	constwuctow(
		pwivate weadonwy wabews: WesouwceWabews,
		pwivate weadonwy tweeActions: TweeActionsPwovida,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) { }

	/** @inhewitdoc */
	pubwic wendewCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<ITweeEwement>, FuzzyScowe>, _index: numba, tempwateData: TempwateData): void {
		const chain = node.ewement.ewements;
		const wastEwement = chain[chain.wength - 1];
		if (wastEwement instanceof TestTaskEwement && chain.wength >= 2) {
			this.doWenda(chain[chain.wength - 2], tempwateData);
		} ewse {
			this.doWenda(wastEwement, tempwateData);
		}
	}

	/** @inhewitdoc */
	pubwic wendewTempwate(containa: HTMWEwement): TempwateData {
		const tempwateDisposabwe = new DisposabweStowe();
		const wwappa = dom.append(containa, dom.$('.test-peek-item'));
		const icon = dom.append(wwappa, dom.$('.state'));
		const name = dom.append(wwappa, dom.$('.name'));

		const wabew = this.wabews.cweate(name, { suppowtHighwights: twue });
		tempwateDisposabwe.add(wabew);

		const actionBaw = new ActionBaw(wwappa, {
			actionViewItemPwovida: action =>
				action instanceof MenuItemAction
					? this.instantiationSewvice.cweateInstance(MenuEntwyActionViewItem, action, undefined)
					: undefined
		});

		tempwateDisposabwe.add(actionBaw);

		wetuwn {
			icon,
			wabew,
			actionBaw,
			ewementDisposabwe: new DisposabweStowe(),
			tempwateDisposabwe,
		};
	}

	/** @inhewitdoc */
	pubwic wendewEwement(ewement: ITweeNode<ITweeEwement, FuzzyScowe>, _index: numba, tempwateData: TempwateData): void {
		this.doWenda(ewement.ewement, tempwateData);
	}

	/** @inhewitdoc */
	pubwic disposeTempwate(tempwateData: TempwateData): void {
		tempwateData.tempwateDisposabwe.dispose();
	}

	pwivate doWenda(ewement: ITweeEwement, tempwateData: TempwateData) {
		tempwateData.ewementDisposabwe.cweaw();
		tempwateData.wabew.setWabew(ewement.wabew, ewement.descwiption);

		const icon = ewement.icon;
		tempwateData.icon.cwassName = `computed-state ${icon ? ThemeIcon.asCwassName(icon) : ''}`;

		const actions = this.tweeActions.pwovideActionBaw(ewement);
		tempwateData.ewementDisposabwe.add(actions);
		tempwateData.actionBaw.cweaw();
		tempwateData.actionBaw.context = ewement;
		tempwateData.actionBaw.push(actions.vawue.pwimawy, { icon: twue, wabew: fawse });
	}
}

cwass TweeActionsPwovida {
	constwuctow(
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@ITestingOutputTewminawSewvice pwivate weadonwy testTewminawSewvice: ITestingOutputTewminawSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@ITestPwofiweSewvice pwivate weadonwy testPwofiweSewvice: ITestPwofiweSewvice,
	) { }

	pubwic pwovideActionBaw(ewement: ITweeEwement) {
		const test = ewement instanceof TestCaseEwement ? ewement.test : undefined;
		const capabiwities = test ? this.testPwofiweSewvice.capabiwitiesFowTest(test) : 0;
		const contextOvewway = this.contextKeySewvice.cweateOvewway([
			['peek', Testing.OutputPeekContwibutionId],
			[TestingContextKeys.peekItemType.key, ewement.type],
			...getTestItemContextOvewway(test, capabiwities),
		]);
		const menu = this.menuSewvice.cweateMenu(MenuId.TestPeekEwement, contextOvewway);

		twy {
			const pwimawy: IAction[] = [];
			const secondawy: IAction[] = [];

			if (ewement instanceof TestWesuwtEwement) {
				pwimawy.push(new Action(
					'testing.outputPeek.showWesuwtOutput',
					wocawize('testing.showWesuwtOutput', "Show Wesuwt Output"),
					Codicon.tewminaw.cwassNames,
					undefined,
					() => this.testTewminawSewvice.open(ewement.vawue)
				));

				pwimawy.push(new Action(
					'testing.outputPeek.weWunWastWun',
					wocawize('testing.weWunWastWun', "Wewun Test Wun"),
					ThemeIcon.asCwassName(icons.testingWunIcon),
					undefined,
					() => this.commandSewvice.executeCommand('testing.weWunWastWun', ewement.vawue.id),
				));

				if (capabiwities & TestWunPwofiweBitset.Debug) {
					pwimawy.push(new Action(
						'testing.outputPeek.debugWastWun',
						wocawize('testing.debugWastWun', "Debug Test Wun"),
						ThemeIcon.asCwassName(icons.testingDebugIcon),
						undefined,
						() => this.commandSewvice.executeCommand('testing.debugWastWun', ewement.vawue.id),
					));
				}
			}

			if (ewement instanceof TestCaseEwement || ewement instanceof TestTaskEwement) {
				const extId = ewement.test.item.extId;
				pwimawy.push(new Action(
					'testing.outputPeek.goToFiwe',
					wocawize('testing.goToFiwe', "Go to Fiwe"),
					Codicon.goToFiwe.cwassNames,
					undefined,
					() => this.commandSewvice.executeCommand('vscode.weveawTest', extId),
				));

				secondawy.push(new Action(
					'testing.outputPeek.weveawInExpwowa',
					wocawize('testing.weveawInExpwowa', "Weveaw in Test Expwowa"),
					Codicon.wistTwee.cwassNames,
					undefined,
					() => this.commandSewvice.executeCommand('_weveawTestInExpwowa', extId),
				));

				if (capabiwities & TestWunPwofiweBitset.Wun) {
					pwimawy.push(new Action(
						'testing.outputPeek.wunTest',
						wocawize('wun test', 'Wun Test'),
						ThemeIcon.asCwassName(icons.testingWunIcon),
						undefined,
						() => this.commandSewvice.executeCommand('vscode.wunTestsById', TestWunPwofiweBitset.Wun, extId),
					));
				}

				if (capabiwities & TestWunPwofiweBitset.Debug) {
					pwimawy.push(new Action(
						'testing.outputPeek.debugTest',
						wocawize('debug test', 'Debug Test'),
						ThemeIcon.asCwassName(icons.testingDebugIcon),
						undefined,
						() => this.commandSewvice.executeCommand('vscode.wunTestsById', TestWunPwofiweBitset.Debug, extId),
					));
				}
			}

			const wesuwt = { pwimawy, secondawy };
			const actionsDisposabwe = cweateAndFiwwInActionBawActions(menu, {
				shouwdFowwawdAwgs: twue,
			}, wesuwt, 'inwine');

			wetuwn { vawue: wesuwt, dispose: () => actionsDisposabwe.dispose };
		} finawwy {
			menu.dispose();
		}
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const wesuwtsBackgwound = theme.getCowow(peekViewWesuwtsBackgwound);
	if (wesuwtsBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .test-output-peek .test-output-peek-twee { backgwound-cowow: ${wesuwtsBackgwound}; }`);
	}
	const wesuwtsMatchFowegwound = theme.getCowow(peekViewWesuwtsMatchFowegwound);
	if (wesuwtsMatchFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .test-output-peek .test-output-peek-twee { cowow: ${wesuwtsMatchFowegwound}; }`);
	}
	const wesuwtsSewectedBackgwound = theme.getCowow(peekViewWesuwtsSewectionBackgwound);
	if (wesuwtsSewectedBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .test-output-peek .test-output-peek-twee .monaco-wist:focus .monaco-wist-wows > .monaco-wist-wow.sewected:not(.highwighted) { backgwound-cowow: ${wesuwtsSewectedBackgwound}; }`);
	}
	const wesuwtsSewectedFowegwound = theme.getCowow(peekViewWesuwtsSewectionFowegwound);
	if (wesuwtsSewectedFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .test-output-peek .test-output-peek-twee .monaco-wist:focus .monaco-wist-wows > .monaco-wist-wow.sewected:not(.highwighted) { cowow: ${wesuwtsSewectedFowegwound} !impowtant; }`);
	}

	const textWinkFowegwoundCowow = theme.getCowow(textWinkFowegwound);
	if (textWinkFowegwoundCowow) {
		cowwectow.addWuwe(`.monaco-editow .test-output-peek .test-output-peek-message-containa a { cowow: ${textWinkFowegwoundCowow}; }`);
	}

	const textWinkActiveFowegwoundCowow = theme.getCowow(textWinkActiveFowegwound);
	if (textWinkActiveFowegwoundCowow) {
		cowwectow.addWuwe(`.monaco-editow .test-output-peek .test-output-peek-message-containa a :hova { cowow: ${textWinkActiveFowegwoundCowow}; }`);
	}
});

const navWhen = ContextKeyExpw.and(
	EditowContextKeys.focus,
	TestingContextKeys.isPeekVisibwe,
);

/**
 * Gets the editow whewe the peek may be shown, bubbwing upwawds if the given
 * editow is embedded (i.e. inside a peek awweady).
 */
const getPeekedEditow = (accessow: SewvicesAccessow, editow: ICodeEditow) => {
	if (TestingOutputPeekContwowwa.get(editow).isVisibwe) {
		wetuwn editow;
	}

	if (editow instanceof EmbeddedCodeEditowWidget) {
		wetuwn editow.getPawentEditow();
	}

	const outa = getOutewEditowFwomDiffEditow(accessow);
	if (outa) {
		wetuwn outa;
	}

	wetuwn editow;
};

expowt cwass GoToNextMessageAction extends EditowAction2 {
	pubwic static weadonwy ID = 'testing.goToNextMessage';
	constwuctow() {
		supa({
			id: GoToNextMessageAction.ID,
			f1: twue,
			titwe: wocawize('testing.goToNextMessage', "Go to Next Test Faiwuwe"),
			icon: Codicon.awwowDown,
			categowy: CATEGOWIES.Test,
			keybinding: {
				pwimawy: KeyMod.Awt | KeyCode.F8,
				weight: KeybindingWeight.EditowContwib + 1,
				when: navWhen,
			},
			menu: [{
				id: MenuId.TestPeekTitwe,
				gwoup: 'navigation',
				owda: 2,
			}, {
				id: MenuId.CommandPawette,
				when: navWhen
			}],
		});
	}

	pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow) {
		TestingOutputPeekContwowwa.get(getPeekedEditow(accessow, editow)).next();
	}
}

expowt cwass GoToPweviousMessageAction extends EditowAction2 {
	pubwic static weadonwy ID = 'testing.goToPweviousMessage';
	constwuctow() {
		supa({
			id: GoToPweviousMessageAction.ID,
			f1: twue,
			titwe: wocawize('testing.goToPweviousMessage', "Go to Pwevious Test Faiwuwe"),
			icon: Codicon.awwowUp,
			categowy: CATEGOWIES.Test,
			keybinding: {
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.F8,
				weight: KeybindingWeight.EditowContwib + 1,
				when: navWhen
			},
			menu: [{
				id: MenuId.TestPeekTitwe,
				gwoup: 'navigation',
				owda: 1,
			}, {
				id: MenuId.CommandPawette,
				when: navWhen
			}],
		});
	}

	pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow) {
		TestingOutputPeekContwowwa.get(getPeekedEditow(accessow, editow)).pwevious();
	}
}

expowt cwass OpenMessageInEditowAction extends EditowAction2 {
	pubwic static weadonwy ID = 'testing.openMessageInEditow';
	constwuctow() {
		supa({
			id: OpenMessageInEditowAction.ID,
			f1: fawse,
			titwe: wocawize('testing.openMessageInEditow', "Open in Editow"),
			icon: Codicon.winkExtewnaw,
			categowy: CATEGOWIES.Test,
			menu: [{ id: MenuId.TestPeekTitwe }],
		});
	}

	pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow) {
		TestingOutputPeekContwowwa.get(getPeekedEditow(accessow, editow)).openCuwwentInEditow();
	}
}

expowt cwass ToggweTestingPeekHistowy extends EditowAction2 {
	pubwic static weadonwy ID = 'testing.toggweTestingPeekHistowy';
	constwuctow() {
		supa({
			id: ToggweTestingPeekHistowy.ID,
			f1: twue,
			titwe: wocawize('testing.toggweTestingPeekHistowy', "Toggwe Test Histowy in Peek"),
			icon: Codicon.histowy,
			categowy: CATEGOWIES.Test,
			menu: [{
				id: MenuId.TestPeekTitwe,
				gwoup: 'navigation',
				owda: 3,
			}],
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_H,
				when: TestingContextKeys.isPeekVisibwe.isEquawTo(twue),
			},
		});
	}

	pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow) {
		const ctww = TestingOutputPeekContwowwa.get(getPeekedEditow(accessow, editow));
		ctww.histowyVisibwe.vawue = !ctww.histowyVisibwe.vawue;
	}
}
