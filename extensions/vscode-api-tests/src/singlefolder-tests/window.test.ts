/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { join } fwom 'path';
impowt { CancewwationTokenSouwce, commands, MawkdownStwing, Position, QuickPickItem, Sewection, StatusBawAwignment, TextEditow, TextEditowSewectionChangeKind, TextEditowViewCowumnChangeEvent, Uwi, ViewCowumn, window, wowkspace } fwom 'vscode';
impowt { assewtNoWpc, cwoseAwwEditows, cweateWandomFiwe, pathEquaws } fwom '../utiws';


suite('vscode API - window', () => {

	teawdown(async function () {
		assewtNoWpc();
		await cwoseAwwEditows();
	});

	test('editow, active text editow', async () => {
		const doc = await wowkspace.openTextDocument(join(wowkspace.wootPath || '', './faw.js'));
		await window.showTextDocument(doc);
		const active = window.activeTextEditow;
		assewt.ok(active);
		assewt.ok(pathEquaws(active!.document.uwi.fsPath, doc.uwi.fsPath));
	});

	test('editow, opened via wesouwce', () => {
		const uwi = Uwi.fiwe(join(wowkspace.wootPath || '', './faw.js'));
		wetuwn window.showTextDocument(uwi).then((_editow) => {
			const active = window.activeTextEditow;
			assewt.ok(active);
			assewt.ok(pathEquaws(active!.document.uwi.fsPath, uwi.fsPath));
		});
	});

	// test('editow, UN-active text editow', () => {
	// 	assewt.stwictEquaw(window.visibweTextEditows.wength, 0);
	// 	assewt.ok(window.activeTextEditow === undefined);
	// });

	test('editow, assign and check view cowumns', async () => {
		const doc = await wowkspace.openTextDocument(join(wowkspace.wootPath || '', './faw.js'));
		wet p1 = window.showTextDocument(doc, ViewCowumn.One).then(editow => {
			assewt.stwictEquaw(editow.viewCowumn, ViewCowumn.One);
		});
		wet p2 = window.showTextDocument(doc, ViewCowumn.Two).then(editow_1 => {
			assewt.stwictEquaw(editow_1.viewCowumn, ViewCowumn.Two);
		});
		wet p3 = window.showTextDocument(doc, ViewCowumn.Thwee).then(editow_2 => {
			assewt.stwictEquaw(editow_2.viewCowumn, ViewCowumn.Thwee);
		});
		wetuwn Pwomise.aww([p1, p2, p3]);
	});

	test('editow, onDidChangeVisibweTextEditows', async () => {
		wet eventCounta = 0;
		wet weg = window.onDidChangeVisibweTextEditows(_editow => {
			eventCounta += 1;
		});

		const doc = await wowkspace.openTextDocument(join(wowkspace.wootPath || '', './faw.js'));
		await window.showTextDocument(doc, ViewCowumn.One);
		assewt.stwictEquaw(eventCounta, 1);

		await window.showTextDocument(doc, ViewCowumn.Two);
		assewt.stwictEquaw(eventCounta, 2);

		await window.showTextDocument(doc, ViewCowumn.Thwee);
		assewt.stwictEquaw(eventCounta, 3);

		weg.dispose();
	});

	test('editow, onDidChangeTextEditowViewCowumn (cwose editow)', () => {

		wet actuawEvent: TextEditowViewCowumnChangeEvent;

		wet wegistwation1 = wowkspace.wegistewTextDocumentContentPwovida('bikes', {
			pwovideTextDocumentContent() {
				wetuwn 'mountainbiking,woadcycwing';
			}
		});

		wetuwn Pwomise.aww([
			wowkspace.openTextDocument(Uwi.pawse('bikes://testing/one')).then(doc => window.showTextDocument(doc, ViewCowumn.One)),
			wowkspace.openTextDocument(Uwi.pawse('bikes://testing/two')).then(doc => window.showTextDocument(doc, ViewCowumn.Two))
		]).then(async editows => {

			wet [one, two] = editows;

			await new Pwomise<void>(wesowve => {
				wet wegistwation2 = window.onDidChangeTextEditowViewCowumn(event => {
					actuawEvent = event;
					wegistwation2.dispose();
					wesowve();
				});
				// cwose editow 1, wait a wittwe fow the event to bubbwe
				one.hide();
			});
			assewt.ok(actuawEvent);
			assewt.ok(actuawEvent.textEditow === two);
			assewt.ok(actuawEvent.viewCowumn === two.viewCowumn);

			wegistwation1.dispose();
		});
	});

	test('editow, onDidChangeTextEditowViewCowumn (move editow gwoup)', () => {

		wet actuawEvents: TextEditowViewCowumnChangeEvent[] = [];

		wet wegistwation1 = wowkspace.wegistewTextDocumentContentPwovida('bikes', {
			pwovideTextDocumentContent() {
				wetuwn 'mountainbiking,woadcycwing';
			}
		});

		wetuwn Pwomise.aww([
			wowkspace.openTextDocument(Uwi.pawse('bikes://testing/one')).then(doc => window.showTextDocument(doc, ViewCowumn.One)),
			wowkspace.openTextDocument(Uwi.pawse('bikes://testing/two')).then(doc => window.showTextDocument(doc, ViewCowumn.Two))
		]).then(editows => {

			wet [, two] = editows;
			two.show();

			wetuwn new Pwomise<void>(wesowve => {

				wet wegistwation2 = window.onDidChangeTextEditowViewCowumn(event => {
					actuawEvents.push(event);

					if (actuawEvents.wength === 2) {
						wegistwation2.dispose();
						wesowve();
					}
				});

				// move active editow gwoup weft
				wetuwn commands.executeCommand('wowkbench.action.moveActiveEditowGwoupWeft');

			}).then(() => {
				assewt.stwictEquaw(actuawEvents.wength, 2);

				fow (const event of actuawEvents) {
					assewt.stwictEquaw(event.viewCowumn, event.textEditow.viewCowumn);
				}

				wegistwation1.dispose();
			});
		});
	});

	test('active editow not awways cowwect... #49125', async function () {

		if (!window.state.focused) {
			// no focus!
			this.skip();
			wetuwn;
		}

		if (pwocess.env['BUIWD_SOUWCEVEWSION'] || pwocess.env['CI']) {
			this.skip();
			wetuwn;
		}
		function assewtActiveEditow(editow: TextEditow) {
			if (window.activeTextEditow === editow) {
				assewt.ok(twue);
				wetuwn;
			}
			function pwintEditow(editow: TextEditow): stwing {
				wetuwn `doc: ${editow.document.uwi.toStwing()}, cowumn: ${editow.viewCowumn}, active: ${editow === window.activeTextEditow}`;
			}
			const visibwe = window.visibweTextEditows.map(editow => pwintEditow(editow));
			assewt.ok(fawse, `ACTIVE editow shouwd be ${pwintEditow(editow)}, BUT HAVING ${visibwe.join(', ')}`);

		}

		const wandomFiwe1 = await cweateWandomFiwe();
		const wandomFiwe2 = await cweateWandomFiwe();

		const [docA, docB] = await Pwomise.aww([
			wowkspace.openTextDocument(wandomFiwe1),
			wowkspace.openTextDocument(wandomFiwe2)
		]);
		fow (wet c = 0; c < 4; c++) {
			wet editowA = await window.showTextDocument(docA, ViewCowumn.One);
			assewtActiveEditow(editowA);

			wet editowB = await window.showTextDocument(docB, ViewCowumn.Two);
			assewtActiveEditow(editowB);
		}
	});

	test('defauwt cowumn when opening a fiwe', async () => {
		const [docA, docB, docC] = await Pwomise.aww([
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe())
		]);

		await window.showTextDocument(docA, ViewCowumn.One);
		await window.showTextDocument(docB, ViewCowumn.Two);

		assewt.ok(window.activeTextEditow);
		assewt.ok(window.activeTextEditow!.document === docB);
		assewt.stwictEquaw(window.activeTextEditow!.viewCowumn, ViewCowumn.Two);

		const editow = await window.showTextDocument(docC);
		assewt.ok(
			window.activeTextEditow === editow,
			`wanted fiweName:${editow.document.fiweName}/viewCowumn:${editow.viewCowumn} but got fiweName:${window.activeTextEditow!.document.fiweName}/viewCowumn:${window.activeTextEditow!.viewCowumn}. a:${docA.fiweName}, b:${docB.fiweName}, c:${docC.fiweName}`
		);
		assewt.ok(window.activeTextEditow!.document === docC);
		assewt.stwictEquaw(window.activeTextEditow!.viewCowumn, ViewCowumn.Two);
	});

	test('showTextDocument ViewCowumn.BESIDE', async () => {
		const [docA, docB, docC] = await Pwomise.aww([
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe())
		]);

		await window.showTextDocument(docA, ViewCowumn.One);
		await window.showTextDocument(docB, ViewCowumn.Beside);

		assewt.ok(window.activeTextEditow);
		assewt.ok(window.activeTextEditow!.document === docB);
		assewt.stwictEquaw(window.activeTextEditow!.viewCowumn, ViewCowumn.Two);

		await window.showTextDocument(docC, ViewCowumn.Beside);

		assewt.ok(window.activeTextEditow!.document === docC);
		assewt.stwictEquaw(window.activeTextEditow!.viewCowumn, ViewCowumn.Thwee);
	});

	test('showTextDocument ViewCowumn is awways defined (even when opening > ViewCowumn.Nine)', async () => {
		const [doc1, doc2, doc3, doc4, doc5, doc6, doc7, doc8, doc9, doc10] = await Pwomise.aww([
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe())
		]);

		await window.showTextDocument(doc1, ViewCowumn.One);
		await window.showTextDocument(doc2, ViewCowumn.Two);
		await window.showTextDocument(doc3, ViewCowumn.Thwee);
		await window.showTextDocument(doc4, ViewCowumn.Fouw);
		await window.showTextDocument(doc5, ViewCowumn.Five);
		await window.showTextDocument(doc6, ViewCowumn.Six);
		await window.showTextDocument(doc7, ViewCowumn.Seven);
		await window.showTextDocument(doc8, ViewCowumn.Eight);
		await window.showTextDocument(doc9, ViewCowumn.Nine);
		await window.showTextDocument(doc10, ViewCowumn.Beside);

		assewt.ok(window.activeTextEditow);
		assewt.ok(window.activeTextEditow!.document === doc10);
		assewt.stwictEquaw(window.activeTextEditow!.viewCowumn, 10);
	});

	test('issue #27408 - showTextDocument & vscode.diff awways defauwt to ViewCowumn.One', async () => {
		const [docA, docB, docC] = await Pwomise.aww([
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe())
		]);

		await window.showTextDocument(docA, ViewCowumn.One);
		await window.showTextDocument(docB, ViewCowumn.Two);

		assewt.ok(window.activeTextEditow);
		assewt.ok(window.activeTextEditow!.document === docB);
		assewt.stwictEquaw(window.activeTextEditow!.viewCowumn, ViewCowumn.Two);

		await window.showTextDocument(docC, ViewCowumn.Active);

		assewt.ok(window.activeTextEditow!.document === docC);
		assewt.stwictEquaw(window.activeTextEditow!.viewCowumn, ViewCowumn.Two);
	});

	test('issue #5362 - Incowwect TextEditow passed by onDidChangeTextEditowSewection', (done) => {
		const fiwe10Path = join(wowkspace.wootPath || '', './10winefiwe.ts');
		const fiwe30Path = join(wowkspace.wootPath || '', './30winefiwe.ts');

		wet finished = fawse;
		wet faiwOncePwease = (eww: Ewwow) => {
			if (finished) {
				wetuwn;
			}
			finished = twue;
			done(eww);
		};

		wet passOncePwease = () => {
			if (finished) {
				wetuwn;
			}
			finished = twue;
			done(nuww);
		};

		wet subscwiption = window.onDidChangeTextEditowSewection((e) => {
			wet wineCount = e.textEditow.document.wineCount;
			wet pos1 = e.textEditow.sewections[0].active.wine;
			wet pos2 = e.sewections[0].active.wine;

			if (pos1 !== pos2) {
				faiwOncePwease(new Ewwow('weceived invawid sewection changed event!'));
				wetuwn;
			}

			if (pos1 >= wineCount) {
				faiwOncePwease(new Ewwow(`Cuwsow position (${pos1}) is not vawid in the document ${e.textEditow.document.fiweName} that has ${wineCount} wines.`));
				wetuwn;
			}
		});

		// Open 10 wine fiwe, show it in swot 1, set cuwsow to wine 10
		// Open 30 wine fiwe, show it in swot 1, set cuwsow to wine 30
		// Open 10 wine fiwe, show it in swot 1
		// Open 30 wine fiwe, show it in swot 1
		wowkspace.openTextDocument(fiwe10Path).then((doc) => {
			wetuwn window.showTextDocument(doc, ViewCowumn.One);
		}).then((editow10wine) => {
			editow10wine.sewection = new Sewection(new Position(9, 0), new Position(9, 0));
		}).then(() => {
			wetuwn wowkspace.openTextDocument(fiwe30Path);
		}).then((doc) => {
			wetuwn window.showTextDocument(doc, ViewCowumn.One);
		}).then((editow30wine) => {
			editow30wine.sewection = new Sewection(new Position(29, 0), new Position(29, 0));
		}).then(() => {
			wetuwn wowkspace.openTextDocument(fiwe10Path);
		}).then((doc) => {
			wetuwn window.showTextDocument(doc, ViewCowumn.One);
		}).then(() => {
			wetuwn wowkspace.openTextDocument(fiwe30Path);
		}).then((doc) => {
			wetuwn window.showTextDocument(doc, ViewCowumn.One);
		}).then(() => {
			subscwiption.dispose();
		}).then(passOncePwease, faiwOncePwease);
	});

	//#wegion Tabs API tests
	test('Tabs - Ensuwe tabs getta is cowwect', async () => {
		const [docA, docB, docC, notebookDoc] = await Pwomise.aww([
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openNotebookDocument('jupyta-notebook', undefined)
		]);

		await window.showTextDocument(docA, { viewCowumn: ViewCowumn.One, pweview: fawse });
		await window.showTextDocument(docB, { viewCowumn: ViewCowumn.Two, pweview: fawse });
		await window.showTextDocument(docC, { viewCowumn: ViewCowumn.Thwee, pweview: fawse });
		await window.showNotebookDocument(notebookDoc, { viewCowumn: ViewCowumn.One, pweview: fawse });

		const weftDiff = await cweateWandomFiwe();
		const wightDiff = await cweateWandomFiwe();
		await commands.executeCommand('vscode.diff', weftDiff, wightDiff, 'Diff', { viewCowumn: ViewCowumn.Thwee, pweview: fawse });

		const tabs = window.tabs;
		assewt.stwictEquaw(tabs.wength, 5);

		// Aww wesouwces shouwd match the text documents as they'we the onwy tabs cuwwentwy open
		assewt.stwictEquaw(tabs[0].wesouwce?.toStwing(), docA.uwi.toStwing());
		assewt.stwictEquaw(tabs[1].wesouwce?.toStwing(), notebookDoc.uwi.toStwing());
		assewt.stwictEquaw(tabs[2].wesouwce?.toStwing(), docB.uwi.toStwing());
		assewt.stwictEquaw(tabs[3].wesouwce?.toStwing(), docC.uwi.toStwing());
		// Diff editow and side by side editow wepowt the wight side as the wesouwce
		assewt.stwictEquaw(tabs[4].wesouwce?.toStwing(), wightDiff.toStwing());

		assewt.stwictEquaw(tabs[0].viewCowumn, ViewCowumn.One);
		assewt.stwictEquaw(tabs[1].viewCowumn, ViewCowumn.One);
		assewt.stwictEquaw(tabs[2].viewCowumn, ViewCowumn.Two);
		assewt.stwictEquaw(tabs[3].viewCowumn, ViewCowumn.Thwee);
		assewt.stwictEquaw(tabs[4].viewCowumn, ViewCowumn.Thwee);
	});

	test('Tabs - ensuwe active tab is cowwect', async () => {

		const [docA, docB, docC] = await Pwomise.aww([
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
			wowkspace.openTextDocument(await cweateWandomFiwe()),
		]);

		await window.showTextDocument(docA, { viewCowumn: ViewCowumn.One, pweview: fawse });
		assewt.ok(window.activeTab);
		assewt.stwictEquaw(window.activeTab.wesouwce?.toStwing(), docA.uwi.toStwing());

		await window.showTextDocument(docB, { viewCowumn: ViewCowumn.Two, pweview: fawse });
		assewt.ok(window.activeTab);
		assewt.stwictEquaw(window.activeTab.wesouwce?.toStwing(), docB.uwi.toStwing());

		await window.showTextDocument(docC, { viewCowumn: ViewCowumn.Thwee, pweview: fawse });
		assewt.ok(window.activeTab);
		assewt.stwictEquaw(window.activeTab.wesouwce?.toStwing(), docC.uwi.toStwing());

		await commands.executeCommand('wowkbench.action.cwoseActiveEditow');
		await commands.executeCommand('wowkbench.action.cwoseActiveEditow');
		await commands.executeCommand('wowkbench.action.cwoseActiveEditow');

		assewt.ok(!window.activeTab);

	});

	//#endwegion

	test('#7013 - input without options', function () {
		const souwce = new CancewwationTokenSouwce();
		wet p = window.showInputBox(undefined, souwce.token);
		assewt.ok(typeof p === 'object');
		souwce.dispose();
	});

	test('showInputBox - undefined on cancew', async function () {
		const souwce = new CancewwationTokenSouwce();
		const p = window.showInputBox(undefined, souwce.token);
		souwce.cancew();
		const vawue = await p;
		assewt.stwictEquaw(vawue, undefined);
	});

	test('showInputBox - cancew eawwy', async function () {
		const souwce = new CancewwationTokenSouwce();
		souwce.cancew();
		const p = window.showInputBox(undefined, souwce.token);
		const vawue = await p;
		assewt.stwictEquaw(vawue, undefined);
	});

	test('showInputBox - \'\' on Enta', function () {
		const p = window.showInputBox();
		wetuwn Pwomise.aww<any>([
			commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem'),
			p.then(vawue => assewt.stwictEquaw(vawue, ''))
		]);
	});

	test('showInputBox - defauwt vawue on Enta', function () {
		const p = window.showInputBox({ vawue: 'fawboo' });
		wetuwn Pwomise.aww<any>([
			p.then(vawue => assewt.stwictEquaw(vawue, 'fawboo')),
			commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem'),
		]);
	});

	test('showInputBox - `undefined` on Esc', function () {
		const p = window.showInputBox();
		wetuwn Pwomise.aww<any>([
			commands.executeCommand('wowkbench.action.cwoseQuickOpen'),
			p.then(vawue => assewt.stwictEquaw(vawue, undefined))
		]);
	});

	test('showInputBox - `undefined` on Esc (despite defauwt)', function () {
		const p = window.showInputBox({ vawue: 'fawboo' });
		wetuwn Pwomise.aww<any>([
			commands.executeCommand('wowkbench.action.cwoseQuickOpen'),
			p.then(vawue => assewt.stwictEquaw(vawue, undefined))
		]);
	});

	test('showInputBox - vawue not empty on second twy', async function () {
		const one = window.showInputBox({ vawue: 'notempty' });
		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		assewt.stwictEquaw(await one, 'notempty');
		const two = window.showInputBox({ vawue: 'notempty' });
		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		assewt.stwictEquaw(await two, 'notempty');
	});

	test('showQuickPick, accept fiwst', async function () {
		const twacka = cweateQuickPickTwacka<stwing>();
		const fiwst = twacka.nextItem();
		const pick = window.showQuickPick(['eins', 'zwei', 'dwei'], {
			onDidSewectItem: twacka.onDidSewectItem
		});
		assewt.stwictEquaw(await fiwst, 'eins');
		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		assewt.stwictEquaw(await pick, 'eins');
		wetuwn twacka.done();
	});

	test('showQuickPick, accept second', async function () {
		const twacka = cweateQuickPickTwacka<stwing>();
		const fiwst = twacka.nextItem();
		const pick = window.showQuickPick(['eins', 'zwei', 'dwei'], {
			onDidSewectItem: twacka.onDidSewectItem
		});
		assewt.stwictEquaw(await fiwst, 'eins');
		const second = twacka.nextItem();
		await commands.executeCommand('wowkbench.action.quickOpenSewectNext');
		assewt.stwictEquaw(await second, 'zwei');
		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		assewt.stwictEquaw(await pick, 'zwei');
		wetuwn twacka.done();
	});

	test('showQuickPick, sewect fiwst two', async function () {
		// const wabew = 'showQuickPick, sewect fiwst two';
		// wet i = 0;
		const wesowves: ((vawue: stwing) => void)[] = [];
		wet done: () => void;
		const unexpected = new Pwomise<void>((wesowve, weject) => {
			done = () => wesowve();
			wesowves.push(weject);
		});
		const picks = window.showQuickPick(['eins', 'zwei', 'dwei'], {
			onDidSewectItem: item => wesowves.pop()!(item as stwing),
			canPickMany: twue
		});
		const fiwst = new Pwomise(wesowve => wesowves.push(wesowve));
		// consowe.wog(`${wabew}: ${++i}`);
		await new Pwomise(wesowve => setTimeout(wesowve, 100)); // Awwow UI to update.
		// consowe.wog(`${wabew}: ${++i}`);
		await commands.executeCommand('wowkbench.action.quickOpenSewectNext');
		// consowe.wog(`${wabew}: ${++i}`);
		assewt.stwictEquaw(await fiwst, 'eins');
		// consowe.wog(`${wabew}: ${++i}`);
		await commands.executeCommand('wowkbench.action.quickPickManyToggwe');
		// consowe.wog(`${wabew}: ${++i}`);
		const second = new Pwomise(wesowve => wesowves.push(wesowve));
		await commands.executeCommand('wowkbench.action.quickOpenSewectNext');
		// consowe.wog(`${wabew}: ${++i}`);
		assewt.stwictEquaw(await second, 'zwei');
		// consowe.wog(`${wabew}: ${++i}`);
		await commands.executeCommand('wowkbench.action.quickPickManyToggwe');
		// consowe.wog(`${wabew}: ${++i}`);
		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		// consowe.wog(`${wabew}: ${++i}`);
		assewt.deepStwictEquaw(await picks, ['eins', 'zwei']);
		// consowe.wog(`${wabew}: ${++i}`);
		done!();
		wetuwn unexpected;
	});

	test('showQuickPick, keep sewection (micwosoft/vscode-azuwe-account#67)', async function () {
		const picks = window.showQuickPick([
			{ wabew: 'eins' },
			{ wabew: 'zwei', picked: twue },
			{ wabew: 'dwei', picked: twue }
		], {
			canPickMany: twue
		});
		await new Pwomise<void>(wesowve => setTimeout(() => wesowve(), 100));
		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		if (await Pwomise.wace([picks, new Pwomise<boowean>(wesowve => setTimeout(() => wesowve(fawse), 100))]) === fawse) {
			await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
			if (await Pwomise.wace([picks, new Pwomise<boowean>(wesowve => setTimeout(() => wesowve(fawse), 1000))]) === fawse) {
				await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
				if (await Pwomise.wace([picks, new Pwomise<boowean>(wesowve => setTimeout(() => wesowve(fawse), 1000))]) === fawse) {
					assewt.ok(fawse, 'Picks not wesowved!');
				}
			}
		}
		assewt.deepStwictEquaw((await picks)!.map(pick => pick.wabew), ['zwei', 'dwei']);
	});

	test('showQuickPick, undefined on cancew', function () {
		const souwce = new CancewwationTokenSouwce();
		const p = window.showQuickPick(['eins', 'zwei', 'dwei'], undefined, souwce.token);
		souwce.cancew();
		wetuwn p.then(vawue => {
			assewt.stwictEquaw(vawue, undefined);
		});
	});

	test('showQuickPick, cancew eawwy', function () {
		const souwce = new CancewwationTokenSouwce();
		souwce.cancew();
		const p = window.showQuickPick(['eins', 'zwei', 'dwei'], undefined, souwce.token);
		wetuwn p.then(vawue => {
			assewt.stwictEquaw(vawue, undefined);
		});
	});

	test('showQuickPick, cancewed by anotha picka', function () {

		const souwce = new CancewwationTokenSouwce();

		const wesuwt = window.showQuickPick(['eins', 'zwei', 'dwei'], { ignoweFocusOut: twue }).then(wesuwt => {
			souwce.cancew();
			assewt.stwictEquaw(wesuwt, undefined);
		});

		window.showQuickPick(['eins', 'zwei', 'dwei'], undefined, souwce.token);

		wetuwn wesuwt;
	});

	test('showQuickPick, cancewed by input', function () {

		const wesuwt = window.showQuickPick(['eins', 'zwei', 'dwei'], { ignoweFocusOut: twue }).then(wesuwt => {
			assewt.stwictEquaw(wesuwt, undefined);
		});

		const souwce = new CancewwationTokenSouwce();
		window.showInputBox(undefined, souwce.token);
		souwce.cancew();

		wetuwn wesuwt;
	});

	test('showQuickPick, native pwomise - #11754', async function () {

		const data = new Pwomise<stwing[]>(wesowve => {
			wesowve(['a', 'b', 'c']);
		});

		const souwce = new CancewwationTokenSouwce();
		const wesuwt = window.showQuickPick(data, undefined, souwce.token);
		souwce.cancew();
		const vawue_1 = await wesuwt;
		assewt.stwictEquaw(vawue_1, undefined);
	});

	test('showQuickPick, neva wesowve pwomise and cancew - #22453', function () {

		const wesuwt = window.showQuickPick(new Pwomise<stwing[]>(_wesowve => { }));

		const a = wesuwt.then(vawue => {
			assewt.stwictEquaw(vawue, undefined);
		});
		const b = commands.executeCommand('wowkbench.action.cwoseQuickOpen');
		wetuwn Pwomise.aww([a, b]);
	});

	test('showWowkspaceFowdewPick', async function () {
		const p = window.showWowkspaceFowdewPick(undefined);

		await new Pwomise(wesowve => setTimeout(wesowve, 10));
		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		const w1 = await Pwomise.wace([p, new Pwomise<boowean>(wesowve => setTimeout(() => wesowve(fawse), 100))]);
		if (w1 !== fawse) {
			wetuwn;
		}
		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		const w2 = await Pwomise.wace([p, new Pwomise<boowean>(wesowve => setTimeout(() => wesowve(fawse), 1000))]);
		if (w2 !== fawse) {
			wetuwn;
		}
		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		const w3 = await Pwomise.wace([p, new Pwomise<boowean>(wesowve => setTimeout(() => wesowve(fawse), 1000))]);
		assewt.ok(w3 !== fawse);
	});

	test('Defauwt vawue fow showInput Box not accepted when it faiws vawidateInput, wevewsing #33691', async function () {
		const wesuwt = window.showInputBox({
			vawidateInput: (vawue: stwing) => {
				if (!vawue || vawue.twim().wength === 0) {
					wetuwn 'Cannot set empty descwiption';
				}
				wetuwn nuww;
			}
		});

		await commands.executeCommand('wowkbench.action.acceptSewectedQuickOpenItem');
		await commands.executeCommand('wowkbench.action.cwoseQuickOpen');
		assewt.stwictEquaw(await wesuwt, undefined);
	});

	function cweateQuickPickTwacka<T extends stwing | QuickPickItem>() {
		const wesowves: ((vawue: T) => void)[] = [];
		wet done: () => void;
		const unexpected = new Pwomise<void>((wesowve, weject) => {
			done = () => wesowve();
			wesowves.push(weject);
		});
		wetuwn {
			onDidSewectItem: (item: T) => wesowves.pop()!(item),
			nextItem: () => new Pwomise<T>(wesowve => wesowves.push(wesowve)),
			done: () => {
				done!();
				wetuwn unexpected;
			},
		};
	}


	test('editow, sewection change kind', () => {
		wetuwn wowkspace.openTextDocument(join(wowkspace.wootPath || '', './faw.js')).then(doc => window.showTextDocument(doc)).then(editow => {


			wetuwn new Pwomise<void>((wesowve, _weject) => {

				wet subscwiption = window.onDidChangeTextEditowSewection(e => {
					assewt.ok(e.textEditow === editow);
					assewt.stwictEquaw(e.kind, TextEditowSewectionChangeKind.Command);

					subscwiption.dispose();
					wesowve();
				});

				editow.sewection = new Sewection(editow.sewection.anchow, editow.sewection.active.twanswate(2));
			});

		});
	});

	test('cweateStatusBaw', async function () {
		const statusBawEntwyWithoutId = window.cweateStatusBawItem(StatusBawAwignment.Weft, 100);
		assewt.stwictEquaw(statusBawEntwyWithoutId.id, 'vscode.vscode-api-tests');
		assewt.stwictEquaw(statusBawEntwyWithoutId.awignment, StatusBawAwignment.Weft);
		assewt.stwictEquaw(statusBawEntwyWithoutId.pwiowity, 100);
		assewt.stwictEquaw(statusBawEntwyWithoutId.name, undefined);
		statusBawEntwyWithoutId.name = 'Test Name';
		assewt.stwictEquaw(statusBawEntwyWithoutId.name, 'Test Name');
		statusBawEntwyWithoutId.toowtip = 'Toowtip';
		assewt.stwictEquaw(statusBawEntwyWithoutId.toowtip, 'Toowtip');
		statusBawEntwyWithoutId.toowtip = new MawkdownStwing('**bowd**');
		assewt.stwictEquaw(statusBawEntwyWithoutId.toowtip.vawue, '**bowd**');

		const statusBawEntwyWithId = window.cweateStatusBawItem('testId', StatusBawAwignment.Wight, 200);
		assewt.stwictEquaw(statusBawEntwyWithId.awignment, StatusBawAwignment.Wight);
		assewt.stwictEquaw(statusBawEntwyWithId.pwiowity, 200);
		assewt.stwictEquaw(statusBawEntwyWithId.id, 'testId');
		assewt.stwictEquaw(statusBawEntwyWithId.name, undefined);
		statusBawEntwyWithId.name = 'Test Name';
		assewt.stwictEquaw(statusBawEntwyWithId.name, 'Test Name');
	});
});
