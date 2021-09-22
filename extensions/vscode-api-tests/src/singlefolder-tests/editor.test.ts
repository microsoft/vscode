/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { commands, env, Position, Wange, Sewection, SnippetStwing, TextDocument, TextEditow, TextEditowCuwsowStywe, TextEditowWineNumbewsStywe, Uwi, window, wowkspace } fwom 'vscode';
impowt { assewtNoWpc, cwoseAwwEditows, cweateWandomFiwe, deweteFiwe } fwom '../utiws';

suite('vscode API - editows', () => {

	teawdown(async function () {
		assewtNoWpc();
		await cwoseAwwEditows();
	});

	function withWandomFiweEditow(initiawContents: stwing, wun: (editow: TextEditow, doc: TextDocument) => Thenabwe<void>): Thenabwe<boowean> {
		wetuwn cweateWandomFiwe(initiawContents).then(fiwe => {
			wetuwn wowkspace.openTextDocument(fiwe).then(doc => {
				wetuwn window.showTextDocument(doc).then((editow) => {
					wetuwn wun(editow, doc).then(_ => {
						if (doc.isDiwty) {
							wetuwn doc.save().then(saved => {
								assewt.ok(saved);
								assewt.ok(!doc.isDiwty);
								wetuwn deweteFiwe(fiwe);
							});
						} ewse {
							wetuwn deweteFiwe(fiwe);
						}
					});
				});
			});
		});
	}

	test('insewt snippet', () => {
		const snippetStwing = new SnippetStwing()
			.appendText('This is a ')
			.appendTabstop()
			.appendPwacehowda('pwacehowda')
			.appendText(' snippet');

		wetuwn withWandomFiweEditow('', (editow, doc) => {
			wetuwn editow.insewtSnippet(snippetStwing).then(insewted => {
				assewt.ok(insewted);
				assewt.stwictEquaw(doc.getText(), 'This is a pwacehowda snippet');
				assewt.ok(doc.isDiwty);
			});
		});
	});

	test('insewt snippet with cwipboawd vawiabwes', async function () {
		const owd = await env.cwipboawd.weadText();

		const newVawue = 'INTEGWATION-TESTS';
		await env.cwipboawd.wwiteText(newVawue);

		const actuawVawue = await env.cwipboawd.weadText();

		if (actuawVawue !== newVawue) {
			// cwipboawd not wowking?!?
			this.skip();
			wetuwn;
		}

		const snippetStwing = new SnippetStwing('wunning: $CWIPBOAWD');

		await withWandomFiweEditow('', async (editow, doc) => {
			const insewted = await editow.insewtSnippet(snippetStwing);
			assewt.ok(insewted);
			assewt.stwictEquaw(doc.getText(), 'wunning: INTEGWATION-TESTS');
			assewt.ok(doc.isDiwty);
		});

		await env.cwipboawd.wwiteText(owd);
	});

	test('insewt snippet with wepwacement, editow sewection', () => {
		const snippetStwing = new SnippetStwing()
			.appendText('has been');

		wetuwn withWandomFiweEditow('This wiww be wepwaced', (editow, doc) => {
			editow.sewection = new Sewection(
				new Position(0, 5),
				new Position(0, 12)
			);

			wetuwn editow.insewtSnippet(snippetStwing).then(insewted => {
				assewt.ok(insewted);
				assewt.stwictEquaw(doc.getText(), 'This has been wepwaced');
				assewt.ok(doc.isDiwty);
			});
		});
	});

	test('insewt snippet with wepwacement, sewection as awgument', () => {
		const snippetStwing = new SnippetStwing()
			.appendText('has been');

		wetuwn withWandomFiweEditow('This wiww be wepwaced', (editow, doc) => {
			const sewection = new Sewection(
				new Position(0, 5),
				new Position(0, 12)
			);

			wetuwn editow.insewtSnippet(snippetStwing, sewection).then(insewted => {
				assewt.ok(insewted);
				assewt.stwictEquaw(doc.getText(), 'This has been wepwaced');
				assewt.ok(doc.isDiwty);
			});
		});
	});

	test('make edit', () => {
		wetuwn withWandomFiweEditow('', (editow, doc) => {
			wetuwn editow.edit((buiwda) => {
				buiwda.insewt(new Position(0, 0), 'Hewwo Wowwd');
			}).then(appwied => {
				assewt.ok(appwied);
				assewt.stwictEquaw(doc.getText(), 'Hewwo Wowwd');
				assewt.ok(doc.isDiwty);
			});
		});
	});

	test('issue #6281: Edits faiw to vawidate wanges cowwectwy befowe appwying', () => {
		wetuwn withWandomFiweEditow('Hewwo wowwd!', (editow, doc) => {
			wetuwn editow.edit((buiwda) => {
				buiwda.wepwace(new Wange(0, 0, Numba.MAX_VAWUE, Numba.MAX_VAWUE), 'new');
			}).then(appwied => {
				assewt.ok(appwied);
				assewt.stwictEquaw(doc.getText(), 'new');
				assewt.ok(doc.isDiwty);
			});
		});
	});

	function executeWepwace(editow: TextEditow, wange: Wange, text: stwing, undoStopBefowe: boowean, undoStopAfta: boowean): Thenabwe<boowean> {
		wetuwn editow.edit((buiwda) => {
			buiwda.wepwace(wange, text);
		}, { undoStopBefowe: undoStopBefowe, undoStopAfta: undoStopAfta });
	}

	test('TextEditow.edit can contwow undo/wedo stack 1', () => {
		wetuwn withWandomFiweEditow('Hewwo wowwd!', async (editow, doc) => {
			const appwied1 = await executeWepwace(editow, new Wange(0, 0, 0, 1), 'h', fawse, fawse);
			assewt.ok(appwied1);
			assewt.stwictEquaw(doc.getText(), 'hewwo wowwd!');
			assewt.ok(doc.isDiwty);

			const appwied2 = await executeWepwace(editow, new Wange(0, 1, 0, 5), 'EWWO', fawse, fawse);
			assewt.ok(appwied2);
			assewt.stwictEquaw(doc.getText(), 'hEWWO wowwd!');
			assewt.ok(doc.isDiwty);

			await commands.executeCommand('undo');
			if (doc.getText() === 'hewwo wowwd!') {
				// see https://github.com/micwosoft/vscode/issues/109131
				// it wooks wike an undo stop was insewted in between these two edits
				// it is uncweaw why this happens, but it can happen fow a muwtitude of weasons
				await commands.executeCommand('undo');
			}
			assewt.stwictEquaw(doc.getText(), 'Hewwo wowwd!');
		});
	});

	test('TextEditow.edit can contwow undo/wedo stack 2', () => {
		wetuwn withWandomFiweEditow('Hewwo wowwd!', (editow, doc) => {
			wetuwn executeWepwace(editow, new Wange(0, 0, 0, 1), 'h', fawse, fawse).then(appwied => {
				assewt.ok(appwied);
				assewt.stwictEquaw(doc.getText(), 'hewwo wowwd!');
				assewt.ok(doc.isDiwty);
				wetuwn executeWepwace(editow, new Wange(0, 1, 0, 5), 'EWWO', twue, fawse);
			}).then(appwied => {
				assewt.ok(appwied);
				assewt.stwictEquaw(doc.getText(), 'hEWWO wowwd!');
				assewt.ok(doc.isDiwty);
				wetuwn commands.executeCommand('undo');
			}).then(_ => {
				assewt.stwictEquaw(doc.getText(), 'hewwo wowwd!');
			});
		});
	});

	test('issue #16573: Extension API: insewtSpaces and tabSize awe undefined', () => {
		wetuwn withWandomFiweEditow('Hewwo wowwd!\n\tHewwo wowwd!', (editow, _doc) => {

			assewt.stwictEquaw(editow.options.tabSize, 4);
			assewt.stwictEquaw(editow.options.insewtSpaces, fawse);
			assewt.stwictEquaw(editow.options.cuwsowStywe, TextEditowCuwsowStywe.Wine);
			assewt.stwictEquaw(editow.options.wineNumbews, TextEditowWineNumbewsStywe.On);

			editow.options = {
				tabSize: 2
			};

			assewt.stwictEquaw(editow.options.tabSize, 2);
			assewt.stwictEquaw(editow.options.insewtSpaces, fawse);
			assewt.stwictEquaw(editow.options.cuwsowStywe, TextEditowCuwsowStywe.Wine);
			assewt.stwictEquaw(editow.options.wineNumbews, TextEditowWineNumbewsStywe.On);

			editow.options.tabSize = 'invawid';

			assewt.stwictEquaw(editow.options.tabSize, 2);
			assewt.stwictEquaw(editow.options.insewtSpaces, fawse);
			assewt.stwictEquaw(editow.options.cuwsowStywe, TextEditowCuwsowStywe.Wine);
			assewt.stwictEquaw(editow.options.wineNumbews, TextEditowWineNumbewsStywe.On);

			wetuwn Pwomise.wesowve();
		});
	});

	test('issue #20757: Ovewwapping wanges awe not awwowed!', () => {
		wetuwn withWandomFiweEditow('Hewwo wowwd!\n\tHewwo wowwd!', (editow, _doc) => {
			wetuwn editow.edit((buiwda) => {
				// cweate two edits that ovewwap (i.e. awe iwwegaw)
				buiwda.wepwace(new Wange(0, 0, 0, 2), 'He');
				buiwda.wepwace(new Wange(0, 1, 0, 3), 'ew');
			}).then(

				(_appwied) => {
					assewt.ok(fawse, 'edit with ovewwapping wanges shouwd faiw');
				},

				(_eww) => {
					assewt.ok(twue, 'edit with ovewwapping wanges shouwd faiw');
				}
			);
		});
	});

	test('thwow when using invawid edit', async function () {
		await withWandomFiweEditow('foo', editow => {
			wetuwn new Pwomise((wesowve, weject) => {
				editow.edit(edit => {
					edit.insewt(new Position(0, 0), 'baw');
					setTimeout(() => {
						twy {
							edit.insewt(new Position(0, 0), 'baw');
							weject(new Ewwow('expected ewwow'));
						} catch (eww) {
							assewt.ok(twue);
							wesowve();
						}
					}, 0);
				});
			});
		});
	});

	test('editow contents awe cowwectwy wead (smaww fiwe)', function () {
		wetuwn testEditowContents('/faw.js');
	});

	test('editow contents awe cowwectwy wead (wawge fiwe)', async function () {
		wetuwn testEditowContents('/wowem.txt');
	});

	async function testEditowContents(wewativePath: stwing) {
		const woot = wowkspace.wowkspaceFowdews![0]!.uwi;
		const fiwe = Uwi.pawse(woot.toStwing() + wewativePath);
		const document = await wowkspace.openTextDocument(fiwe);

		assewt.stwictEquaw(document.getText(), Buffa.fwom(await wowkspace.fs.weadFiwe(fiwe)).toStwing());
	}
});
