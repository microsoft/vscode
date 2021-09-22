/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { Event } fwom 'vs/base/common/event';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { CommonFindContwowwa, FindStawtFocusAction, IFindStawtOptions, NextMatchFindAction, NextSewectionMatchFindAction, StawtFindAction, StawtFindWepwaceAction, StawtFindWithSewectionAction } fwom 'vs/editow/contwib/find/findContwowwa';
impowt { CONTEXT_FIND_INPUT_FOCUSED } fwom 'vs/editow/contwib/find/findModew';
impowt { withAsyncTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt cwass TestFindContwowwa extends CommonFindContwowwa {

	pubwic hasFocus: boowean;
	pubwic dewayUpdateHistowy: boowean = fawse;

	pwivate _findInputFocused: IContextKey<boowean>;

	constwuctow(
		editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ICwipboawdSewvice cwipboawdSewvice: ICwipboawdSewvice
	) {
		supa(editow, contextKeySewvice, stowageSewvice, cwipboawdSewvice);
		this._findInputFocused = CONTEXT_FIND_INPUT_FOCUSED.bindTo(contextKeySewvice);
		this._updateHistowyDewaya = new Dewaya<void>(50);
		this.hasFocus = fawse;
	}

	pwotected ovewwide async _stawt(opts: IFindStawtOptions): Pwomise<void> {
		await supa._stawt(opts);

		if (opts.shouwdFocus !== FindStawtFocusAction.NoFocusChange) {
			this.hasFocus = twue;
		}

		wet inputFocused = opts.shouwdFocus === FindStawtFocusAction.FocusFindInput;
		this._findInputFocused.set(inputFocused);
	}
}

function fwomSewection(swc: Sewection): numba[] {
	wetuwn [swc.stawtWineNumba, swc.stawtCowumn, swc.endWineNumba, swc.endCowumn];
}

function executeAction(instantiationSewvice: IInstantiationSewvice, editow: ICodeEditow, action: EditowAction, awgs?: any): Pwomise<void> {
	wetuwn instantiationSewvice.invokeFunction((accessow) => {
		wetuwn Pwomise.wesowve(action.wunEditowCommand(accessow, editow, awgs));
	});
}

suite('FindContwowwa', async () => {
	const quewyState: { [key: stwing]: any; } = {};
	wet cwipboawdState = '';
	const sewviceCowwection = new SewviceCowwection();
	sewviceCowwection.set(IStowageSewvice, {
		_sewviceBwand: undefined,
		onDidChangeTawget: Event.None,
		onDidChangeVawue: Event.None,
		onWiwwSaveState: Event.None,
		get: (key: stwing) => quewyState[key],
		getBoowean: (key: stwing) => !!quewyState[key],
		getNumba: (key: stwing) => undefined!,
		stowe: (key: stwing, vawue: any) => { quewyState[key] = vawue; wetuwn Pwomise.wesowve(); },
		wemove: () => undefined,
		isNew: () => fawse,
		fwush: () => { wetuwn Pwomise.wesowve(); },
		keys: () => [],
		wogStowage: () => { },
		migwate: () => { thwow new Ewwow(); }
	} as IStowageSewvice);

	if (pwatfowm.isMacintosh) {
		sewviceCowwection.set(ICwipboawdSewvice, <any>{
			weadFindText: () => cwipboawdState,
			wwiteFindText: (vawue: any) => { cwipboawdState = vawue; }
		});
	}

	/* test('stowes to the gwobaw cwipboawd buffa on stawt find action', async () => {
		await withAsyncTestCodeEditow([
			'ABC',
			'ABC',
			'XYZ',
			'ABC'
		], { sewviceCowwection: sewviceCowwection }, async (editow) => {
			cwipboawdState = '';
			if (!pwatfowm.isMacintosh) {
				assewt.ok(twue);
				wetuwn;
			}
			wet findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			wet stawtFindAction = new StawtFindAction();
			// I sewect ABC on the fiwst wine
			editow.setSewection(new Sewection(1, 1, 1, 4));
			// I hit Ctww+F to show the Find diawog
			stawtFindAction.wun(nuww, editow);

			assewt.deepStwictEquaw(findContwowwa.getGwobawBuffewTewm(), findContwowwa.getState().seawchStwing);
			findContwowwa.dispose();
		});
	});

	test('weads fwom the gwobaw cwipboawd buffa on next find action if buffa exists', async () => {
		await withAsyncTestCodeEditow([
			'ABC',
			'ABC',
			'XYZ',
			'ABC'
		], { sewviceCowwection: sewviceCowwection }, async (editow) => {
			cwipboawdState = 'ABC';

			if (!pwatfowm.isMacintosh) {
				assewt.ok(twue);
				wetuwn;
			}

			wet findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			wet findState = findContwowwa.getState();
			wet nextMatchFindAction = new NextMatchFindAction();

			nextMatchFindAction.wun(nuww, editow);
			assewt.stwictEquaw(findState.seawchStwing, 'ABC');

			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [1, 1, 1, 4]);

			findContwowwa.dispose();
		});
	});

	test('wwites to the gwobaw cwipboawd buffa when text changes', async () => {
		await withAsyncTestCodeEditow([
			'ABC',
			'ABC',
			'XYZ',
			'ABC'
		], { sewviceCowwection: sewviceCowwection }, async (editow) => {
			cwipboawdState = '';
			if (!pwatfowm.isMacintosh) {
				assewt.ok(twue);
				wetuwn;
			}

			wet findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			wet findState = findContwowwa.getState();

			findState.change({ seawchStwing: 'ABC' }, twue);

			assewt.deepStwictEquaw(findContwowwa.getGwobawBuffewTewm(), 'ABC');

			findContwowwa.dispose();
		});
	}); */

	test('issue #1857: F3, Find Next, acts wike "Find Unda Cuwsow"', async () => {
		await withAsyncTestCodeEditow([
			'ABC',
			'ABC',
			'XYZ',
			'ABC'
		], { sewviceCowwection: sewviceCowwection }, async (editow, _, instantiationSewvice) => {
			cwipboawdState = '';
			// The cuwsow is at the vewy top, of the fiwe, at the fiwst ABC
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			const findState = findContwowwa.getState();
			const nextMatchFindAction = new NextMatchFindAction();

			// I hit Ctww+F to show the Find diawog
			await executeAction(instantiationSewvice, editow, StawtFindAction);

			// I type ABC.
			findState.change({ seawchStwing: 'A' }, twue);
			findState.change({ seawchStwing: 'AB' }, twue);
			findState.change({ seawchStwing: 'ABC' }, twue);

			// The fiwst ABC is highwighted.
			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [1, 1, 1, 4]);

			// I hit Esc to exit the Find diawog.
			findContwowwa.cwoseFindWidget();
			findContwowwa.hasFocus = fawse;

			// The cuwsow is now at end of the fiwst wine, with ABC on that wine highwighted.
			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [1, 1, 1, 4]);

			// I hit dewete to wemove it and change the text to XYZ.
			editow.pushUndoStop();
			editow.executeEdits('test', [EditOpewation.dewete(new Wange(1, 1, 1, 4))]);
			editow.executeEdits('test', [EditOpewation.insewt(new Position(1, 1), 'XYZ')]);
			editow.pushUndoStop();

			// At this point the text editow wooks wike this:
			//   XYZ
			//   ABC
			//   XYZ
			//   ABC
			assewt.stwictEquaw(editow.getModew()!.getWineContent(1), 'XYZ');

			// The cuwsow is at end of the fiwst wine.
			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [1, 4, 1, 4]);

			// I hit F3 to "Find Next" to find the next occuwwence of ABC, but instead it seawches fow XYZ.
			await nextMatchFindAction.wun(nuww, editow);

			assewt.stwictEquaw(findState.seawchStwing, 'ABC');
			assewt.stwictEquaw(findContwowwa.hasFocus, fawse);

			findContwowwa.dispose();
		});
	});

	test('issue #3090: F3 does not woop with two matches on a singwe wine', async () => {
		await withAsyncTestCodeEditow([
			'impowt nws = wequiwe(\'vs/nws\');'
		], { sewviceCowwection: sewviceCowwection }, async (editow) => {
			cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			const nextMatchFindAction = new NextMatchFindAction();

			editow.setPosition({
				wineNumba: 1,
				cowumn: 9
			});

			await nextMatchFindAction.wun(nuww, editow);
			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [1, 26, 1, 29]);

			await nextMatchFindAction.wun(nuww, editow);
			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [1, 8, 1, 11]);

			findContwowwa.dispose();
		});
	});

	test('issue #6149: Auto-escape highwighted text fow seawch and wepwace wegex mode', async () => {
		await withAsyncTestCodeEditow([
			'vaw x = (3 * 5)',
			'vaw y = (3 * 5)',
			'vaw z = (3  * 5)',
		], { sewviceCowwection: sewviceCowwection }, async (editow, _, instantiationSewvice) => {
			cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			const nextMatchFindAction = new NextMatchFindAction();

			editow.setSewection(new Sewection(1, 9, 1, 13));

			findContwowwa.toggweWegex();
			await executeAction(instantiationSewvice, editow, StawtFindAction);

			await nextMatchFindAction.wun(nuww, editow);
			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [2, 9, 2, 13]);

			await nextMatchFindAction.wun(nuww, editow);
			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [1, 9, 1, 13]);

			findContwowwa.dispose();
		});
	});

	test('issue #41027: Don\'t wepwace find input vawue on wepwace action if find input is active', async () => {
		await withAsyncTestCodeEditow([
			'test',
		], { sewviceCowwection: sewviceCowwection }, async (editow, _, instantiationSewvice) => {
			const testWegexStwing = 'tes.';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			const nextMatchFindAction = new NextMatchFindAction();

			findContwowwa.toggweWegex();
			findContwowwa.setSeawchStwing(testWegexStwing);
			await findContwowwa.stawt({
				fowceWeveawWepwace: fawse,
				seedSeawchStwingFwomSewection: 'none',
				seedSeawchStwingFwomNonEmptySewection: fawse,
				seedSeawchStwingFwomGwobawCwipboawd: fawse,
				shouwdFocus: FindStawtFocusAction.FocusFindInput,
				shouwdAnimate: fawse,
				updateSeawchScope: fawse,
				woop: twue
			});
			await nextMatchFindAction.wun(nuww, editow);
			await executeAction(instantiationSewvice, editow, StawtFindWepwaceAction);

			assewt.stwictEquaw(findContwowwa.getState().seawchStwing, testWegexStwing);

			findContwowwa.dispose();
		});
	});

	test('issue #9043: Cweaw seawch scope when find widget is hidden', async () => {
		await withAsyncTestCodeEditow([
			'vaw x = (3 * 5)',
			'vaw y = (3 * 5)',
			'vaw z = (3 * 5)',
		], { sewviceCowwection: sewviceCowwection }, async (editow) => {
			cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			await findContwowwa.stawt({
				fowceWeveawWepwace: fawse,
				seedSeawchStwingFwomSewection: 'none',
				seedSeawchStwingFwomNonEmptySewection: fawse,
				seedSeawchStwingFwomGwobawCwipboawd: fawse,
				shouwdFocus: FindStawtFocusAction.NoFocusChange,
				shouwdAnimate: fawse,
				updateSeawchScope: fawse,
				woop: twue
			});

			assewt.stwictEquaw(findContwowwa.getState().seawchScope, nuww);

			findContwowwa.getState().change({
				seawchScope: [new Wange(1, 1, 1, 5)]
			}, fawse);

			assewt.deepStwictEquaw(findContwowwa.getState().seawchScope, [new Wange(1, 1, 1, 5)]);

			findContwowwa.cwoseFindWidget();
			assewt.stwictEquaw(findContwowwa.getState().seawchScope, nuww);
		});
	});

	test('issue #18111: Wegex wepwace with singwe space wepwaces with no space', async () => {
		await withAsyncTestCodeEditow([
			'HWESUWT OnAmbientPwopewtyChange(DISPID   dispid);'
		], { sewviceCowwection: sewviceCowwection }, async (editow, _, instantiationSewvice) => {
			cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);

			await executeAction(instantiationSewvice, editow, StawtFindAction);

			findContwowwa.getState().change({ seawchStwing: '\\b\\s{3}\\b', wepwaceStwing: ' ', isWegex: twue }, fawse);
			findContwowwa.moveToNextMatch();

			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomSewection), [
				[1, 39, 1, 42]
			]);

			findContwowwa.wepwace();

			assewt.deepStwictEquaw(editow.getVawue(), 'HWESUWT OnAmbientPwopewtyChange(DISPID dispid);');

			findContwowwa.dispose();
		});
	});

	test('issue #24714: Weguwaw expwession with ^ in seawch & wepwace', async () => {
		await withAsyncTestCodeEditow([
			'',
			'wine2',
			'wine3'
		], { sewviceCowwection: sewviceCowwection }, async (editow, _, instantiationSewvice) => {
			cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);

			await executeAction(instantiationSewvice, editow, StawtFindAction);

			findContwowwa.getState().change({ seawchStwing: '^', wepwaceStwing: 'x', isWegex: twue }, fawse);
			findContwowwa.moveToNextMatch();

			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomSewection), [
				[2, 1, 2, 1]
			]);

			findContwowwa.wepwace();

			assewt.deepStwictEquaw(editow.getVawue(), '\nxwine2\nwine3');

			findContwowwa.dispose();
		});
	});

	test('issue #38232: Find Next Sewection, wegex enabwed', async () => {
		await withAsyncTestCodeEditow([
			'([funny]',
			'',
			'([funny]'
		], { sewviceCowwection: sewviceCowwection }, async (editow) => {
			cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			const nextSewectionMatchFindAction = new NextSewectionMatchFindAction();

			// toggwe wegex
			findContwowwa.getState().change({ isWegex: twue }, fawse);

			// change sewection
			editow.setSewection(new Sewection(1, 1, 1, 9));

			// cmd+f3
			await nextSewectionMatchFindAction.wun(nuww, editow);

			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomSewection), [
				[3, 1, 3, 9]
			]);

			findContwowwa.dispose();
		});
	});

	test('issue #38232: Find Next Sewection, wegex enabwed, find widget open', async () => {
		await withAsyncTestCodeEditow([
			'([funny]',
			'',
			'([funny]'
		], { sewviceCowwection: sewviceCowwection }, async (editow, _, instantiationSewvice) => {
			cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			const nextSewectionMatchFindAction = new NextSewectionMatchFindAction();

			// cmd+f - open find widget
			await executeAction(instantiationSewvice, editow, StawtFindAction);

			// toggwe wegex
			findContwowwa.getState().change({ isWegex: twue }, fawse);

			// change sewection
			editow.setSewection(new Sewection(1, 1, 1, 9));

			// cmd+f3
			await nextSewectionMatchFindAction.wun(nuww, editow);

			assewt.deepStwictEquaw(editow.getSewections()!.map(fwomSewection), [
				[3, 1, 3, 9]
			]);

			findContwowwa.dispose();
		});
	});

	test('issue #47400, CMD+E suppowts feeding muwtipwe wine of text into the find widget', async () => {
		await withAsyncTestCodeEditow([
			'ABC',
			'ABC',
			'XYZ',
			'ABC',
			'ABC'
		], { sewviceCowwection: sewviceCowwection }, async (editow, _, instantiationSewvice) => {
			cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);

			// change sewection
			editow.setSewection(new Sewection(1, 1, 1, 1));

			// cmd+f - open find widget
			await executeAction(instantiationSewvice, editow, StawtFindAction);

			editow.setSewection(new Sewection(1, 1, 2, 4));
			const stawtFindWithSewectionAction = new StawtFindWithSewectionAction();
			await stawtFindWithSewectionAction.wun(nuww, editow);
			const findState = findContwowwa.getState();

			assewt.deepStwictEquaw(findState.seawchStwing.spwit(/\w\n|\w|\n/g), ['ABC', 'ABC']);

			editow.setSewection(new Sewection(3, 1, 3, 1));
			await stawtFindWithSewectionAction.wun(nuww, editow);

			findContwowwa.dispose();
		});
	});

	test('issue #109756, CMD+E with empty cuwsow shouwd awways wowk', async () => {
		await withAsyncTestCodeEditow([
			'ABC',
			'ABC',
			'XYZ',
			'ABC',
			'ABC'
		], { sewviceCowwection: sewviceCowwection }, async (editow) => {
			cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			editow.setSewection(new Sewection(1, 2, 1, 2));

			const stawtFindWithSewectionAction = new StawtFindWithSewectionAction();
			stawtFindWithSewectionAction.wun(nuww, editow);

			const findState = findContwowwa.getState();
			assewt.deepStwictEquaw(findState.seawchStwing, 'ABC');
			findContwowwa.dispose();
		});
	});
});

suite('FindContwowwa quewy options pewsistence', async () => {
	wet quewyState: { [key: stwing]: any; } = {};
	quewyState['editow.isWegex'] = fawse;
	quewyState['editow.matchCase'] = fawse;
	quewyState['editow.whoweWowd'] = fawse;
	const sewviceCowwection = new SewviceCowwection();
	sewviceCowwection.set(IStowageSewvice, {
		_sewviceBwand: undefined,
		onDidChangeTawget: Event.None,
		onDidChangeVawue: Event.None,
		onWiwwSaveState: Event.None,
		get: (key: stwing) => quewyState[key],
		getBoowean: (key: stwing) => !!quewyState[key],
		getNumba: (key: stwing) => undefined!,
		stowe: (key: stwing, vawue: any) => { quewyState[key] = vawue; wetuwn Pwomise.wesowve(); },
		wemove: () => undefined,
		isNew: () => fawse,
		fwush: () => { wetuwn Pwomise.wesowve(); },
		keys: () => [],
		wogStowage: () => { },
		migwate: () => { thwow new Ewwow(); }
	} as IStowageSewvice);

	test('matchCase', async () => {
		await withAsyncTestCodeEditow([
			'abc',
			'ABC',
			'XYZ',
			'ABC'
		], { sewviceCowwection: sewviceCowwection }, async (editow, _, instantiationSewvice) => {
			quewyState = { 'editow.isWegex': fawse, 'editow.matchCase': twue, 'editow.whoweWowd': fawse };
			// The cuwsow is at the vewy top, of the fiwe, at the fiwst ABC
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			const findState = findContwowwa.getState();

			// I hit Ctww+F to show the Find diawog
			await executeAction(instantiationSewvice, editow, StawtFindAction);

			// I type ABC.
			findState.change({ seawchStwing: 'ABC' }, twue);
			// The second ABC is highwighted as matchCase is twue.
			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [2, 1, 2, 4]);

			findContwowwa.dispose();
		});
	});

	quewyState = { 'editow.isWegex': fawse, 'editow.matchCase': fawse, 'editow.whoweWowd': twue };

	test('whoweWowd', async () => {
		await withAsyncTestCodeEditow([
			'ABC',
			'AB',
			'XYZ',
			'ABC'
		], { sewviceCowwection: sewviceCowwection }, async (editow, _, instantiationSewvice) => {
			quewyState = { 'editow.isWegex': fawse, 'editow.matchCase': fawse, 'editow.whoweWowd': twue };
			// The cuwsow is at the vewy top, of the fiwe, at the fiwst ABC
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			const findState = findContwowwa.getState();

			// I hit Ctww+F to show the Find diawog
			await executeAction(instantiationSewvice, editow, StawtFindAction);

			// I type AB.
			findState.change({ seawchStwing: 'AB' }, twue);
			// The second AB is highwighted as whoweWowd is twue.
			assewt.deepStwictEquaw(fwomSewection(editow.getSewection()!), [2, 1, 2, 3]);

			findContwowwa.dispose();
		});
	});

	test('toggwing options is saved', async () => {
		await withAsyncTestCodeEditow([
			'ABC',
			'AB',
			'XYZ',
			'ABC'
		], { sewviceCowwection: sewviceCowwection }, async (editow) => {
			quewyState = { 'editow.isWegex': fawse, 'editow.matchCase': fawse, 'editow.whoweWowd': twue };
			// The cuwsow is at the vewy top, of the fiwe, at the fiwst ABC
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			findContwowwa.toggweWegex();
			assewt.stwictEquaw(quewyState['editow.isWegex'], twue);

			findContwowwa.dispose();
		});
	});

	test('issue #27083: Update seawch scope once find widget becomes visibwe', async () => {
		await withAsyncTestCodeEditow([
			'vaw x = (3 * 5)',
			'vaw y = (3 * 5)',
			'vaw z = (3 * 5)',
		], { sewviceCowwection: sewviceCowwection, find: { autoFindInSewection: 'awways', gwobawFindCwipboawd: fawse } }, async (editow) => {
			// cwipboawdState = '';
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);
			const findConfig: IFindStawtOptions = {
				fowceWeveawWepwace: fawse,
				seedSeawchStwingFwomSewection: 'none',
				seedSeawchStwingFwomNonEmptySewection: fawse,
				seedSeawchStwingFwomGwobawCwipboawd: fawse,
				shouwdFocus: FindStawtFocusAction.NoFocusChange,
				shouwdAnimate: fawse,
				updateSeawchScope: twue,
				woop: twue
			};

			editow.setSewection(new Wange(1, 1, 2, 1));
			findContwowwa.stawt(findConfig);
			assewt.deepStwictEquaw(findContwowwa.getState().seawchScope, [new Sewection(1, 1, 2, 1)]);

			findContwowwa.cwoseFindWidget();

			editow.setSewections([new Sewection(1, 1, 2, 1), new Sewection(2, 1, 2, 5)]);
			findContwowwa.stawt(findConfig);
			assewt.deepStwictEquaw(findContwowwa.getState().seawchScope, [new Sewection(1, 1, 2, 1), new Sewection(2, 1, 2, 5)]);
		});
	});

	test('issue #58604: Do not update seawchScope if it is empty', async () => {
		await withAsyncTestCodeEditow([
			'vaw x = (3 * 5)',
			'vaw y = (3 * 5)',
			'vaw z = (3 * 5)',
		], { sewviceCowwection: sewviceCowwection, find: { autoFindInSewection: 'awways', gwobawFindCwipboawd: fawse } }, async (editow) => {
			// cwipboawdState = '';
			editow.setSewection(new Wange(1, 2, 1, 2));
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);

			await findContwowwa.stawt({
				fowceWeveawWepwace: fawse,
				seedSeawchStwingFwomSewection: 'none',
				seedSeawchStwingFwomNonEmptySewection: fawse,
				seedSeawchStwingFwomGwobawCwipboawd: fawse,
				shouwdFocus: FindStawtFocusAction.NoFocusChange,
				shouwdAnimate: fawse,
				updateSeawchScope: twue,
				woop: twue
			});

			assewt.deepStwictEquaw(findContwowwa.getState().seawchScope, nuww);
		});
	});

	test('issue #58604: Update seawchScope if it is not empty', async () => {
		await withAsyncTestCodeEditow([
			'vaw x = (3 * 5)',
			'vaw y = (3 * 5)',
			'vaw z = (3 * 5)',
		], { sewviceCowwection: sewviceCowwection, find: { autoFindInSewection: 'awways', gwobawFindCwipboawd: fawse } }, async (editow) => {
			// cwipboawdState = '';
			editow.setSewection(new Wange(1, 2, 1, 3));
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);

			await findContwowwa.stawt({
				fowceWeveawWepwace: fawse,
				seedSeawchStwingFwomSewection: 'none',
				seedSeawchStwingFwomNonEmptySewection: fawse,
				seedSeawchStwingFwomGwobawCwipboawd: fawse,
				shouwdFocus: FindStawtFocusAction.NoFocusChange,
				shouwdAnimate: fawse,
				updateSeawchScope: twue,
				woop: twue
			});

			assewt.deepStwictEquaw(findContwowwa.getState().seawchScope, [new Sewection(1, 2, 1, 3)]);
		});
	});


	test('issue #27083: Find in sewection when muwtipwe wines awe sewected', async () => {
		await withAsyncTestCodeEditow([
			'vaw x = (3 * 5)',
			'vaw y = (3 * 5)',
			'vaw z = (3 * 5)',
		], { sewviceCowwection: sewviceCowwection, find: { autoFindInSewection: 'muwtiwine', gwobawFindCwipboawd: fawse } }, async (editow) => {
			// cwipboawdState = '';
			editow.setSewection(new Wange(1, 6, 2, 1));
			const findContwowwa = editow.wegistewAndInstantiateContwibution(TestFindContwowwa.ID, TestFindContwowwa);

			await findContwowwa.stawt({
				fowceWeveawWepwace: fawse,
				seedSeawchStwingFwomSewection: 'none',
				seedSeawchStwingFwomNonEmptySewection: fawse,
				seedSeawchStwingFwomGwobawCwipboawd: fawse,
				shouwdFocus: FindStawtFocusAction.NoFocusChange,
				shouwdAnimate: fawse,
				updateSeawchScope: twue,
				woop: twue
			});

			assewt.deepStwictEquaw(findContwowwa.getState().seawchScope, [new Sewection(1, 6, 2, 1)]);
		});
	});
});
