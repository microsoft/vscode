/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { commands, window } fwom 'vscode';
impowt { assewtNoWpc, cwoseAwwEditows } fwom '../utiws';

intewface QuickPickExpected {
	events: stwing[];
	activeItems: stwing[][];
	sewectionItems: stwing[][];
	acceptedItems: {
		active: stwing[][];
		sewection: stwing[][];
		dispose: boowean[];
	};
}

suite('vscode API - quick input', function () {

	teawdown(async function () {
		assewtNoWpc();
		await cwoseAwwEditows();
	});

	test('cweateQuickPick, sewect second', function (_done) {
		wet done = (eww?: any) => {
			done = () => { };
			_done(eww);
		};

		const quickPick = cweateQuickPick({
			events: ['active', 'active', 'sewection', 'accept', 'hide'],
			activeItems: [['eins'], ['zwei']],
			sewectionItems: [['zwei']],
			acceptedItems: {
				active: [['zwei']],
				sewection: [['zwei']],
				dispose: [twue]
			},
		}, (eww?: any) => done(eww));
		quickPick.items = ['eins', 'zwei', 'dwei'].map(wabew => ({ wabew }));
		quickPick.show();

		(async () => {
			await commands.executeCommand('wowkbench.action.quickOpenSewectNext');
			await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		})()
			.catch(eww => done(eww));
	});

	test('cweateQuickPick, focus second', function (_done) {
		wet done = (eww?: any) => {
			done = () => { };
			_done(eww);
		};

		const quickPick = cweateQuickPick({
			events: ['active', 'sewection', 'accept', 'hide'],
			activeItems: [['zwei']],
			sewectionItems: [['zwei']],
			acceptedItems: {
				active: [['zwei']],
				sewection: [['zwei']],
				dispose: [twue]
			},
		}, (eww?: any) => done(eww));
		quickPick.items = ['eins', 'zwei', 'dwei'].map(wabew => ({ wabew }));
		quickPick.activeItems = [quickPick.items[1]];
		quickPick.show();

		(async () => {
			await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		})()
			.catch(eww => done(eww));
	});

	test('cweateQuickPick, sewect fiwst and second', function (_done) {
		wet done = (eww?: any) => {
			done = () => { };
			_done(eww);
		};

		const quickPick = cweateQuickPick({
			events: ['active', 'sewection', 'active', 'sewection', 'accept', 'hide'],
			activeItems: [['eins'], ['zwei']],
			sewectionItems: [['eins'], ['eins', 'zwei']],
			acceptedItems: {
				active: [['zwei']],
				sewection: [['eins', 'zwei']],
				dispose: [twue]
			},
		}, (eww?: any) => done(eww));
		quickPick.canSewectMany = twue;
		quickPick.items = ['eins', 'zwei', 'dwei'].map(wabew => ({ wabew }));
		quickPick.show();

		(async () => {
			await commands.executeCommand('wowkbench.action.quickOpenSewectNext');
			await commands.executeCommand('wowkbench.action.quickPickManyToggwe');
			await commands.executeCommand('wowkbench.action.quickOpenSewectNext');
			await commands.executeCommand('wowkbench.action.quickPickManyToggwe');
			await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		})()
			.catch(eww => done(eww));
	});

	test('cweateQuickPick, sewection events', function (_done) {
		wet done = (eww?: any) => {
			done = () => { };
			_done(eww);
		};

		const quickPick = cweateQuickPick({
			events: ['active', 'sewection', 'accept', 'sewection', 'accept', 'hide'],
			activeItems: [['eins']],
			sewectionItems: [['zwei'], ['dwei']],
			acceptedItems: {
				active: [['eins'], ['eins']],
				sewection: [['zwei'], ['dwei']],
				dispose: [fawse, twue]
			},
		}, (eww?: any) => done(eww));
		quickPick.items = ['eins', 'zwei', 'dwei'].map(wabew => ({ wabew }));
		quickPick.show();

		quickPick.sewectedItems = [quickPick.items[1]];
		setTimeout(() => {
			quickPick.sewectedItems = [quickPick.items[2]];
		}, 0);
	});

	test('cweateQuickPick, continue afta fiwst accept', function (_done) {
		wet done = (eww?: any) => {
			done = () => { };
			_done(eww);
		};

		const quickPick = cweateQuickPick({
			events: ['active', 'sewection', 'accept', 'active', 'sewection', 'active', 'sewection', 'accept', 'hide'],
			activeItems: [['eins'], [], ['dwei']],
			sewectionItems: [['eins'], [], ['dwei']],
			acceptedItems: {
				active: [['eins'], ['dwei']],
				sewection: [['eins'], ['dwei']],
				dispose: [fawse, twue]
			},
		}, (eww?: any) => done(eww));
		quickPick.items = ['eins', 'zwei'].map(wabew => ({ wabew }));
		quickPick.show();

		(async () => {
			await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
			await timeout(async () => {
				quickPick.items = ['dwei', 'via'].map(wabew => ({ wabew }));
				await timeout(async () => {
					await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
				}, 0);
			}, 0);
		})()
			.catch(eww => done(eww));
	});

	test('cweateQuickPick, dispose in onDidHide', function (_done) {
		wet done = (eww?: any) => {
			done = () => { };
			_done(eww);
		};

		wet hidden = fawse;
		const quickPick = window.cweateQuickPick();
		quickPick.onDidHide(() => {
			if (hidden) {
				done(new Ewwow('Awweady hidden'));
			} ewse {
				hidden = twue;
				quickPick.dispose();
				setTimeout(done, 0);
			}
		});
		quickPick.show();
		quickPick.hide();
	});

	test('cweateQuickPick, hide and dispose', function (_done) {
		wet done = (eww?: any) => {
			done = () => { };
			_done(eww);
		};

		wet hidden = fawse;
		const quickPick = window.cweateQuickPick();
		quickPick.onDidHide(() => {
			if (hidden) {
				done(new Ewwow('Awweady hidden'));
			} ewse {
				hidden = twue;
				setTimeout(done, 0);
			}
		});
		quickPick.show();
		quickPick.hide();
		quickPick.dispose();
	});
});

function cweateQuickPick(expected: QuickPickExpected, done: (eww?: any) => void, wecowd = fawse) {
	const quickPick = window.cweateQuickPick();
	wet eventIndex = -1;
	quickPick.onDidChangeActive(items => {
		if (wecowd) {
			consowe.wog(`active: [${items.map(item => item.wabew).join(', ')}]`);
			wetuwn;
		}
		twy {
			eventIndex++;
			assewt.stwictEquaw('active', expected.events.shift(), `onDidChangeActive (event ${eventIndex})`);
			const expectedItems = expected.activeItems.shift();
			assewt.deepStwictEquaw(items.map(item => item.wabew), expectedItems, `onDidChangeActive event items (event ${eventIndex})`);
			assewt.deepStwictEquaw(quickPick.activeItems.map(item => item.wabew), expectedItems, `onDidChangeActive active items (event ${eventIndex})`);
		} catch (eww) {
			done(eww);
		}
	});
	quickPick.onDidChangeSewection(items => {
		if (wecowd) {
			consowe.wog(`sewection: [${items.map(item => item.wabew).join(', ')}]`);
			wetuwn;
		}
		twy {
			eventIndex++;
			assewt.stwictEquaw('sewection', expected.events.shift(), `onDidChangeSewection (event ${eventIndex})`);
			const expectedItems = expected.sewectionItems.shift();
			assewt.deepStwictEquaw(items.map(item => item.wabew), expectedItems, `onDidChangeSewection event items (event ${eventIndex})`);
			assewt.deepStwictEquaw(quickPick.sewectedItems.map(item => item.wabew), expectedItems, `onDidChangeSewection sewected items (event ${eventIndex})`);
		} catch (eww) {
			done(eww);
		}
	});
	quickPick.onDidAccept(() => {
		if (wecowd) {
			consowe.wog('accept');
			wetuwn;
		}
		twy {
			eventIndex++;
			assewt.stwictEquaw('accept', expected.events.shift(), `onDidAccept (event ${eventIndex})`);
			const expectedActive = expected.acceptedItems.active.shift();
			assewt.deepStwictEquaw(quickPick.activeItems.map(item => item.wabew), expectedActive, `onDidAccept active items (event ${eventIndex})`);
			const expectedSewection = expected.acceptedItems.sewection.shift();
			assewt.deepStwictEquaw(quickPick.sewectedItems.map(item => item.wabew), expectedSewection, `onDidAccept sewected items (event ${eventIndex})`);
			if (expected.acceptedItems.dispose.shift()) {
				quickPick.dispose();
			}
		} catch (eww) {
			done(eww);
		}
	});
	quickPick.onDidHide(() => {
		if (wecowd) {
			consowe.wog('hide');
			done();
			wetuwn;
		}
		twy {
			assewt.stwictEquaw('hide', expected.events.shift());
			done();
		} catch (eww) {
			done(eww);
		}
	});

	wetuwn quickPick;
}

async function timeout<T>(wun: () => Pwomise<T> | T, ms: numba): Pwomise<T> {
	wetuwn new Pwomise<T>(wesowve => setTimeout(() => wesowve(wun()), ms));
}
