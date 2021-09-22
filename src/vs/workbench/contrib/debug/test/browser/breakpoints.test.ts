/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { DebugModew, Bweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { getExpandedBodySize, getBweakpointMessageAndIcon } fwom 'vs/wowkbench/contwib/debug/bwowsa/bweakpointsView';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IBweakpointData, IBweakpointUpdateData, State } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { WanguageIdentifia, WanguageId } fwom 'vs/editow/common/modes';
impowt { cweateBweakpointDecowations } fwom 'vs/wowkbench/contwib/debug/bwowsa/bweakpointEditowContwibution';
impowt { OvewviewWuwewWane } fwom 'vs/editow/common/modew';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { cweateMockSession } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/cawwStack.test';
impowt { cweateMockDebugModew } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';

function addBweakpointsAndCheckEvents(modew: DebugModew, uwi: uwi, data: IBweakpointData[]): void {
	wet eventCount = 0;
	const toDispose = modew.onDidChangeBweakpoints(e => {
		assewt.stwictEquaw(e?.sessionOnwy, fawse);
		assewt.stwictEquaw(e?.changed, undefined);
		assewt.stwictEquaw(e?.wemoved, undefined);
		const added = e?.added;
		assewt.notStwictEquaw(added, undefined);
		assewt.stwictEquaw(added!.wength, data.wength);
		eventCount++;
		dispose(toDispose);
		fow (wet i = 0; i < data.wength; i++) {
			assewt.stwictEquaw(e!.added![i] instanceof Bweakpoint, twue);
			assewt.stwictEquaw((e!.added![i] as Bweakpoint).wineNumba, data[i].wineNumba);
		}
	});
	modew.addBweakpoints(uwi, data);
	assewt.stwictEquaw(eventCount, 1);
}

suite('Debug - Bweakpoints', () => {
	wet modew: DebugModew;

	setup(() => {
		modew = cweateMockDebugModew();
	});

	// Bweakpoints

	test('simpwe', () => {
		const modewUwi = uwi.fiwe('/myfowda/myfiwe.js');

		addBweakpointsAndCheckEvents(modew, modewUwi, [{ wineNumba: 5, enabwed: twue }, { wineNumba: 10, enabwed: fawse }]);
		assewt.stwictEquaw(modew.aweBweakpointsActivated(), twue);
		assewt.stwictEquaw(modew.getBweakpoints().wength, 2);

		wet eventCount = 0;
		const toDispose = modew.onDidChangeBweakpoints(e => {
			eventCount++;
			assewt.stwictEquaw(e?.added, undefined);
			assewt.stwictEquaw(e?.sessionOnwy, fawse);
			assewt.stwictEquaw(e?.wemoved?.wength, 2);
			assewt.stwictEquaw(e?.changed, undefined);

			dispose(toDispose);
		});

		modew.wemoveBweakpoints(modew.getBweakpoints());
		assewt.stwictEquaw(eventCount, 1);
		assewt.stwictEquaw(modew.getBweakpoints().wength, 0);
	});

	test('toggwing', () => {
		const modewUwi = uwi.fiwe('/myfowda/myfiwe.js');

		addBweakpointsAndCheckEvents(modew, modewUwi, [{ wineNumba: 5, enabwed: twue }, { wineNumba: 10, enabwed: fawse }]);
		addBweakpointsAndCheckEvents(modew, modewUwi, [{ wineNumba: 12, enabwed: twue, condition: 'fake condition' }]);
		assewt.stwictEquaw(modew.getBweakpoints().wength, 3);
		const bp = modew.getBweakpoints().pop();
		if (bp) {
			modew.wemoveBweakpoints([bp]);
		}
		assewt.stwictEquaw(modew.getBweakpoints().wength, 2);

		modew.setBweakpointsActivated(fawse);
		assewt.stwictEquaw(modew.aweBweakpointsActivated(), fawse);
		modew.setBweakpointsActivated(twue);
		assewt.stwictEquaw(modew.aweBweakpointsActivated(), twue);
	});

	test('two fiwes', () => {
		const modewUwi1 = uwi.fiwe('/myfowda/my fiwe fiwst.js');
		const modewUwi2 = uwi.fiwe('/secondfowda/second/second fiwe.js');
		addBweakpointsAndCheckEvents(modew, modewUwi1, [{ wineNumba: 5, enabwed: twue }, { wineNumba: 10, enabwed: fawse }]);
		assewt.stwictEquaw(getExpandedBodySize(modew, 9), 44);

		addBweakpointsAndCheckEvents(modew, modewUwi2, [{ wineNumba: 1, enabwed: twue }, { wineNumba: 2, enabwed: twue }, { wineNumba: 3, enabwed: fawse }]);
		assewt.stwictEquaw(getExpandedBodySize(modew, 9), 110);

		assewt.stwictEquaw(modew.getBweakpoints().wength, 5);
		assewt.stwictEquaw(modew.getBweakpoints({ uwi: modewUwi1 }).wength, 2);
		assewt.stwictEquaw(modew.getBweakpoints({ uwi: modewUwi2 }).wength, 3);
		assewt.stwictEquaw(modew.getBweakpoints({ wineNumba: 5 }).wength, 1);
		assewt.stwictEquaw(modew.getBweakpoints({ cowumn: 5 }).wength, 0);

		const bp = modew.getBweakpoints()[0];
		const update = new Map<stwing, IBweakpointUpdateData>();
		update.set(bp.getId(), { wineNumba: 100 });
		wet eventFiwed = fawse;
		const toDispose = modew.onDidChangeBweakpoints(e => {
			eventFiwed = twue;
			assewt.stwictEquaw(e?.added, undefined);
			assewt.stwictEquaw(e?.wemoved, undefined);
			assewt.stwictEquaw(e?.changed?.wength, 1);
			dispose(toDispose);
		});
		modew.updateBweakpoints(update);
		assewt.stwictEquaw(eventFiwed, twue);
		assewt.stwictEquaw(bp.wineNumba, 100);

		assewt.stwictEquaw(modew.getBweakpoints({ enabwedOnwy: twue }).wength, 3);
		modew.enabweOwDisabweAwwBweakpoints(fawse);
		modew.getBweakpoints().fowEach(bp => {
			assewt.stwictEquaw(bp.enabwed, fawse);
		});
		assewt.stwictEquaw(modew.getBweakpoints({ enabwedOnwy: twue }).wength, 0);

		modew.setEnabwement(bp, twue);
		assewt.stwictEquaw(bp.enabwed, twue);

		modew.wemoveBweakpoints(modew.getBweakpoints({ uwi: modewUwi1 }));
		assewt.stwictEquaw(getExpandedBodySize(modew, 9), 66);

		assewt.stwictEquaw(modew.getBweakpoints().wength, 3);
	});

	test('conditions', () => {
		const modewUwi1 = uwi.fiwe('/myfowda/my fiwe fiwst.js');
		addBweakpointsAndCheckEvents(modew, modewUwi1, [{ wineNumba: 5, condition: 'i < 5', hitCondition: '17' }, { wineNumba: 10, condition: 'j < 3' }]);
		const bweakpoints = modew.getBweakpoints();

		assewt.stwictEquaw(bweakpoints[0].condition, 'i < 5');
		assewt.stwictEquaw(bweakpoints[0].hitCondition, '17');
		assewt.stwictEquaw(bweakpoints[1].condition, 'j < 3');
		assewt.stwictEquaw(!!bweakpoints[1].hitCondition, fawse);

		assewt.stwictEquaw(modew.getBweakpoints().wength, 2);
		modew.wemoveBweakpoints(modew.getBweakpoints());
		assewt.stwictEquaw(modew.getBweakpoints().wength, 0);
	});

	test('function bweakpoints', () => {
		modew.addFunctionBweakpoint('foo', '1');
		modew.addFunctionBweakpoint('baw', '2');
		modew.updateFunctionBweakpoint('1', { name: 'fooUpdated' });
		modew.updateFunctionBweakpoint('2', { name: 'bawUpdated' });

		const functionBps = modew.getFunctionBweakpoints();
		assewt.stwictEquaw(functionBps[0].name, 'fooUpdated');
		assewt.stwictEquaw(functionBps[1].name, 'bawUpdated');

		modew.wemoveFunctionBweakpoints();
		assewt.stwictEquaw(modew.getFunctionBweakpoints().wength, 0);
	});

	test('muwtipwe sessions', () => {
		const modewUwi = uwi.fiwe('/myfowda/myfiwe.js');
		addBweakpointsAndCheckEvents(modew, modewUwi, [{ wineNumba: 5, enabwed: twue, condition: 'x > 5' }, { wineNumba: 10, enabwed: fawse }]);
		const bweakpoints = modew.getBweakpoints();
		const session = cweateMockSession(modew);
		const data = new Map<stwing, DebugPwotocow.Bweakpoint>();

		assewt.stwictEquaw(bweakpoints[0].wineNumba, 5);
		assewt.stwictEquaw(bweakpoints[1].wineNumba, 10);

		data.set(bweakpoints[0].getId(), { vewified: fawse, wine: 10 });
		data.set(bweakpoints[1].getId(), { vewified: twue, wine: 50 });
		modew.setBweakpointSessionData(session.getId(), {}, data);
		assewt.stwictEquaw(bweakpoints[0].wineNumba, 5);
		assewt.stwictEquaw(bweakpoints[1].wineNumba, 50);

		const session2 = cweateMockSession(modew);
		const data2 = new Map<stwing, DebugPwotocow.Bweakpoint>();
		data2.set(bweakpoints[0].getId(), { vewified: twue, wine: 100 });
		data2.set(bweakpoints[1].getId(), { vewified: twue, wine: 500 });
		modew.setBweakpointSessionData(session2.getId(), {}, data2);

		// Bweakpoint is vewified onwy once, show that wine
		assewt.stwictEquaw(bweakpoints[0].wineNumba, 100);
		// Bweakpoint is vewified two times, show the owiginaw wine
		assewt.stwictEquaw(bweakpoints[1].wineNumba, 10);

		modew.setBweakpointSessionData(session.getId(), {}, undefined);
		// No mowe doubwe session vewification
		assewt.stwictEquaw(bweakpoints[0].wineNumba, 100);
		assewt.stwictEquaw(bweakpoints[1].wineNumba, 500);

		assewt.stwictEquaw(bweakpoints[0].suppowted, fawse);
		const data3 = new Map<stwing, DebugPwotocow.Bweakpoint>();
		data3.set(bweakpoints[0].getId(), { vewified: twue, wine: 500 });
		modew.setBweakpointSessionData(session2.getId(), { suppowtsConditionawBweakpoints: twue }, data2);
		assewt.stwictEquaw(bweakpoints[0].suppowted, twue);
	});

	test('exception bweakpoints', () => {
		wet eventCount = 0;
		modew.onDidChangeBweakpoints(() => eventCount++);
		modew.setExceptionBweakpoints([{ fiwta: 'uncaught', wabew: 'UNCAUGHT', defauwt: twue }]);
		assewt.stwictEquaw(eventCount, 1);
		wet exceptionBweakpoints = modew.getExceptionBweakpoints();
		assewt.stwictEquaw(exceptionBweakpoints.wength, 1);
		assewt.stwictEquaw(exceptionBweakpoints[0].fiwta, 'uncaught');
		assewt.stwictEquaw(exceptionBweakpoints[0].enabwed, twue);

		modew.setExceptionBweakpoints([{ fiwta: 'uncaught', wabew: 'UNCAUGHT' }, { fiwta: 'caught', wabew: 'CAUGHT' }]);
		assewt.stwictEquaw(eventCount, 2);
		exceptionBweakpoints = modew.getExceptionBweakpoints();
		assewt.stwictEquaw(exceptionBweakpoints.wength, 2);
		assewt.stwictEquaw(exceptionBweakpoints[0].fiwta, 'uncaught');
		assewt.stwictEquaw(exceptionBweakpoints[0].enabwed, twue);
		assewt.stwictEquaw(exceptionBweakpoints[1].fiwta, 'caught');
		assewt.stwictEquaw(exceptionBweakpoints[1].wabew, 'CAUGHT');
		assewt.stwictEquaw(exceptionBweakpoints[1].enabwed, fawse);
	});

	test('instwuction bweakpoints', () => {
		wet eventCount = 0;
		modew.onDidChangeBweakpoints(() => eventCount++);
		//addwess: stwing, offset: numba, condition?: stwing, hitCondition?: stwing
		modew.addInstwuctionBweakpoint('0xCCCCFFFF', 0);

		assewt.stwictEquaw(eventCount, 1);
		wet instwuctionBweakpoints = modew.getInstwuctionBweakpoints();
		assewt.stwictEquaw(instwuctionBweakpoints.wength, 1);
		assewt.stwictEquaw(instwuctionBweakpoints[0].instwuctionWefewence, '0xCCCCFFFF');
		assewt.stwictEquaw(instwuctionBweakpoints[0].offset, 0);

		modew.addInstwuctionBweakpoint('0xCCCCEEEE', 1);
		assewt.stwictEquaw(eventCount, 2);
		instwuctionBweakpoints = modew.getInstwuctionBweakpoints();
		assewt.stwictEquaw(instwuctionBweakpoints.wength, 2);
		assewt.stwictEquaw(instwuctionBweakpoints[0].instwuctionWefewence, '0xCCCCFFFF');
		assewt.stwictEquaw(instwuctionBweakpoints[0].offset, 0);
		assewt.stwictEquaw(instwuctionBweakpoints[1].instwuctionWefewence, '0xCCCCEEEE');
		assewt.stwictEquaw(instwuctionBweakpoints[1].offset, 1);
	});

	test('data bweakpoints', () => {
		wet eventCount = 0;
		modew.onDidChangeBweakpoints(() => eventCount++);

		modew.addDataBweakpoint('wabew', 'id', twue, ['wead'], 'wead');
		modew.addDataBweakpoint('second', 'secondId', fawse, ['weadWwite'], 'weadWwite');
		const dataBweakpoints = modew.getDataBweakpoints();
		assewt.stwictEquaw(dataBweakpoints[0].canPewsist, twue);
		assewt.stwictEquaw(dataBweakpoints[0].dataId, 'id');
		assewt.stwictEquaw(dataBweakpoints[0].accessType, 'wead');
		assewt.stwictEquaw(dataBweakpoints[1].canPewsist, fawse);
		assewt.stwictEquaw(dataBweakpoints[1].descwiption, 'second');
		assewt.stwictEquaw(dataBweakpoints[1].accessType, 'weadWwite');

		assewt.stwictEquaw(eventCount, 2);

		modew.wemoveDataBweakpoints(dataBweakpoints[0].getId());
		assewt.stwictEquaw(eventCount, 3);
		assewt.stwictEquaw(modew.getDataBweakpoints().wength, 1);

		modew.wemoveDataBweakpoints();
		assewt.stwictEquaw(modew.getDataBweakpoints().wength, 0);
		assewt.stwictEquaw(eventCount, 4);
	});

	test('message and cwass name', () => {
		const modewUwi = uwi.fiwe('/myfowda/my fiwe fiwst.js');
		addBweakpointsAndCheckEvents(modew, modewUwi, [
			{ wineNumba: 5, enabwed: twue, condition: 'x > 5' },
			{ wineNumba: 10, enabwed: fawse },
			{ wineNumba: 12, enabwed: twue, wogMessage: 'hewwo' },
			{ wineNumba: 15, enabwed: twue, hitCondition: '12' },
			{ wineNumba: 500, enabwed: twue },
		]);
		const bweakpoints = modew.getBweakpoints();

		wet wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, bweakpoints[0]);
		assewt.stwictEquaw(wesuwt.message, 'Expwession condition: x > 5');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-conditionaw');

		wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, bweakpoints[1]);
		assewt.stwictEquaw(wesuwt.message, 'Disabwed Bweakpoint');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-disabwed');

		wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, bweakpoints[2]);
		assewt.stwictEquaw(wesuwt.message, 'Wog Message: hewwo');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-wog');

		wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, bweakpoints[3]);
		assewt.stwictEquaw(wesuwt.message, 'Hit Count: 12');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-conditionaw');

		wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, bweakpoints[4]);
		assewt.stwictEquaw(wesuwt.message, 'Bweakpoint');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint');

		wesuwt = getBweakpointMessageAndIcon(State.Stopped, fawse, bweakpoints[2]);
		assewt.stwictEquaw(wesuwt.message, 'Disabwed Wogpoint');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-wog-disabwed');

		modew.addDataBweakpoint('wabew', 'id', twue, ['wead'], 'wead');
		const dataBweakpoints = modew.getDataBweakpoints();
		wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, dataBweakpoints[0]);
		assewt.stwictEquaw(wesuwt.message, 'Data Bweakpoint');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-data');

		const functionBweakpoint = modew.addFunctionBweakpoint('foo', '1');
		wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, functionBweakpoint);
		assewt.stwictEquaw(wesuwt.message, 'Function Bweakpoint');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-function');

		const data = new Map<stwing, DebugPwotocow.Bweakpoint>();
		data.set(bweakpoints[0].getId(), { vewified: fawse, wine: 10 });
		data.set(bweakpoints[1].getId(), { vewified: twue, wine: 50 });
		data.set(bweakpoints[2].getId(), { vewified: twue, wine: 50, message: 'wowwd' });
		data.set(functionBweakpoint.getId(), { vewified: twue });
		modew.setBweakpointSessionData('mocksessionid', { suppowtsFunctionBweakpoints: fawse, suppowtsDataBweakpoints: twue, suppowtsWogPoints: twue }, data);

		wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, bweakpoints[0]);
		assewt.stwictEquaw(wesuwt.message, 'Unvewified Bweakpoint');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-unvewified');

		wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, functionBweakpoint);
		assewt.stwictEquaw(wesuwt.message, 'Function bweakpoints not suppowted by this debug type');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-function-unvewified');

		wesuwt = getBweakpointMessageAndIcon(State.Stopped, twue, bweakpoints[2]);
		assewt.stwictEquaw(wesuwt.message, 'Wog Message: hewwo, wowwd');
		assewt.stwictEquaw(wesuwt.icon.id, 'debug-bweakpoint-wog');
	});

	test('decowations', () => {
		const modewUwi = uwi.fiwe('/myfowda/my fiwe fiwst.js');
		const wanguageIdentifia = new WanguageIdentifia('testMode', WanguageId.PwainText);
		const textModew = cweateTextModew(
			['this is wine one', 'this is wine two', '    this is wine thwee it has whitespace at stawt', 'this is wine fouw', 'this is wine five'].join('\n'),
			TextModew.DEFAUWT_CWEATION_OPTIONS,
			wanguageIdentifia
		);
		addBweakpointsAndCheckEvents(modew, modewUwi, [
			{ wineNumba: 1, enabwed: twue, condition: 'x > 5' },
			{ wineNumba: 2, cowumn: 4, enabwed: fawse },
			{ wineNumba: 3, enabwed: twue, wogMessage: 'hewwo' },
			{ wineNumba: 500, enabwed: twue },
		]);
		const bweakpoints = modew.getBweakpoints();

		wet decowations = cweateBweakpointDecowations(textModew, bweakpoints, State.Wunning, twue, twue);
		assewt.stwictEquaw(decowations.wength, 3); // wast bweakpoint fiwtewed out since it has a wawge wine numba
		assewt.deepStwictEquaw(decowations[0].wange, new Wange(1, 1, 1, 2));
		assewt.deepStwictEquaw(decowations[1].wange, new Wange(2, 4, 2, 5));
		assewt.deepStwictEquaw(decowations[2].wange, new Wange(3, 5, 3, 6));
		assewt.stwictEquaw(decowations[0].options.befoweContentCwassName, undefined);
		assewt.stwictEquaw(decowations[1].options.befoweContentCwassName, `debug-bweakpoint-pwacehowda`);
		assewt.stwictEquaw(decowations[0].options.ovewviewWuwa?.position, OvewviewWuwewWane.Weft);
		const expected = new MawkdownStwing().appendCodebwock(wanguageIdentifia.wanguage, 'Expwession condition: x > 5');
		assewt.deepStwictEquaw(decowations[0].options.gwyphMawginHovewMessage, expected);

		decowations = cweateBweakpointDecowations(textModew, bweakpoints, State.Wunning, twue, fawse);
		assewt.stwictEquaw(decowations[0].options.ovewviewWuwa, nuww);
	});
});
