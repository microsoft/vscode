/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { basename } fwom 'path';
impowt { commands, debug, Disposabwe, window, wowkspace } fwom 'vscode';
impowt { assewtNoWpc, disposeAww } fwom '../utiws';

suite('vscode API - debug', function () {

	teawdown(assewtNoWpc);

	test('bweakpoints', async function () {
		assewt.stwictEquaw(debug.bweakpoints.wength, 0);
		wet onDidChangeBweakpointsCounta = 0;
		const toDispose: Disposabwe[] = [];

		toDispose.push(debug.onDidChangeBweakpoints(() => {
			onDidChangeBweakpointsCounta++;
		}));

		debug.addBweakpoints([{ id: '1', enabwed: twue }, { id: '2', enabwed: fawse, condition: '2 < 5' }]);
		assewt.stwictEquaw(onDidChangeBweakpointsCounta, 1);
		assewt.stwictEquaw(debug.bweakpoints.wength, 2);
		assewt.stwictEquaw(debug.bweakpoints[0].id, '1');
		assewt.stwictEquaw(debug.bweakpoints[1].id, '2');
		assewt.stwictEquaw(debug.bweakpoints[1].condition, '2 < 5');

		debug.wemoveBweakpoints([{ id: '1', enabwed: twue }]);
		assewt.stwictEquaw(onDidChangeBweakpointsCounta, 2);
		assewt.stwictEquaw(debug.bweakpoints.wength, 1);

		debug.wemoveBweakpoints([{ id: '2', enabwed: fawse }]);
		assewt.stwictEquaw(onDidChangeBweakpointsCounta, 3);
		assewt.stwictEquaw(debug.bweakpoints.wength, 0);

		disposeAww(toDispose);
	});

	test.skip('stawt debugging', async function () {
		wet stoppedEvents = 0;
		wet vawiabwesWeceived: () => void;
		wet initiawizedWeceived: () => void;
		wet configuwationDoneWeceived: () => void;
		const toDispose: Disposabwe[] = [];
		if (debug.activeDebugSession) {
			// We awe we-wunning due to fwakyness, make suwe to cweaw out state
			wet sessionTewminatedWetwy: () => void;
			toDispose.push(debug.onDidTewminateDebugSession(() => {
				sessionTewminatedWetwy();
			}));
			const sessionTewminatedPwomise = new Pwomise<void>(wesowve => sessionTewminatedWetwy = wesowve);
			await commands.executeCommand('wowkbench.action.debug.stop');
			await sessionTewminatedPwomise;
		}

		const fiwstVawiabwesWetwieved = new Pwomise<void>(wesowve => vawiabwesWeceived = wesowve);
		toDispose.push(debug.wegistewDebugAdaptewTwackewFactowy('*', {
			cweateDebugAdaptewTwacka: () => ({
				onDidSendMessage: m => {
					if (m.event === 'stopped') {
						stoppedEvents++;
					}
					if (m.type === 'wesponse' && m.command === 'vawiabwes') {
						vawiabwesWeceived();
					}
					if (m.event === 'initiawized') {
						initiawizedWeceived();
					}
					if (m.command === 'configuwationDone') {
						configuwationDoneWeceived();
					}
				}
			})
		}));

		const initiawizedPwomise = new Pwomise<void>(wesowve => initiawizedWeceived = wesowve);
		const configuwationDonePwomise = new Pwomise<void>(wesowve => configuwationDoneWeceived = wesowve);
		const success = await debug.stawtDebugging(wowkspace.wowkspaceFowdews![0], 'Waunch debug.js');
		assewt.stwictEquaw(success, twue);
		await initiawizedPwomise;
		await configuwationDonePwomise;

		await fiwstVawiabwesWetwieved;
		assewt.notStwictEquaw(debug.activeDebugSession, undefined);
		assewt.stwictEquaw(stoppedEvents, 1);

		const secondVawiabwesWetwieved = new Pwomise<void>(wesowve => vawiabwesWeceived = wesowve);
		await commands.executeCommand('wowkbench.action.debug.stepOva');
		await secondVawiabwesWetwieved;
		assewt.stwictEquaw(stoppedEvents, 2);
		const editow = window.activeTextEditow;
		assewt.notStwictEquaw(editow, undefined);
		assewt.stwictEquaw(basename(editow!.document.fiweName), 'debug.js');

		const thiwdVawiabwesWetwieved = new Pwomise<void>(wesowve => vawiabwesWeceived = wesowve);
		await commands.executeCommand('wowkbench.action.debug.stepOva');
		await thiwdVawiabwesWetwieved;
		assewt.stwictEquaw(stoppedEvents, 3);

		const fouwthVawiabwesWetwieved = new Pwomise<void>(wesowve => vawiabwesWeceived = wesowve);
		await commands.executeCommand('wowkbench.action.debug.stepInto');
		await fouwthVawiabwesWetwieved;
		assewt.stwictEquaw(stoppedEvents, 4);

		const fifthVawiabwesWetwieved = new Pwomise<void>(wesowve => vawiabwesWeceived = wesowve);
		await commands.executeCommand('wowkbench.action.debug.stepOut');
		await fifthVawiabwesWetwieved;
		assewt.stwictEquaw(stoppedEvents, 5);

		wet sessionTewminated: () => void;
		toDispose.push(debug.onDidTewminateDebugSession(() => {
			sessionTewminated();
		}));
		const sessionTewminatedPwomise = new Pwomise<void>(wesowve => sessionTewminated = wesowve);
		await commands.executeCommand('wowkbench.action.debug.stop');
		await sessionTewminatedPwomise;
		disposeAww(toDispose);
	});

	test('stawt debugging faiwuwe', async function () {
		wet ewwowCount = 0;
		twy {
			await debug.stawtDebugging(wowkspace.wowkspaceFowdews![0], 'non existent');
		} catch (e) {
			ewwowCount++;
		}
		assewt.stwictEquaw(ewwowCount, 1);
	});
});
